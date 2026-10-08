import { createHash } from "node:crypto";
import { existsSync,mkdirSync } from "node:fs";
import { dirname,join } from "node:path";
import { backup,DatabaseSync } from "node:sqlite";
import { ensureSchema,query,transaction,type QueryClient } from "@bore/database";

const migrationName = "sqlite-to-postgres-v1";
type Row = Record<string,unknown>;
interface Table { name:string;columns:string[];rows:Row[] }

function canonical(value:unknown):unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([key,item]) => [key,canonical(item)]));
  return value;
}
function digest(rows:Row[]):string {
  return createHash("sha256").update(JSON.stringify(rows.map(canonical).map((row) => JSON.stringify(row)).sort())).digest("hex");
}
const hasTable = (db:DatabaseSync,name:string) => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
function readTable(db:DatabaseSync,name:string,jsonColumns:string[] = []):Table {
  const rows = db.prepare(`SELECT * FROM ${name}`).all() as Row[];
  const columns = (db.prepare(`PRAGMA table_info(${name})`).all() as Array<{name:string}>).map((column) => column.name);
  for (const row of rows) for (const column of jsonColumns) row[column] = JSON.parse(row[column] as string);
  return { name,columns,rows };
}

async function snapshotSource(path:string):Promise<DatabaseSync> {
  const directory = join(dirname(path),"backups");
  mkdirSync(directory,{recursive:true,mode:0o700});
  const target = join(directory,`${path.endsWith("monitoring.sqlite") ? "monitoring" : "bore"}-before-postgres-${new Date().toISOString().replace(/[:.]/g,"-")}.sqlite`);
  const source = new DatabaseSync(path,{readOnly:true});
  try { await backup(source,target); } finally { source.close(); }
  const snapshot = new DatabaseSync(target,{readOnly:true});
  if (snapshot.prepare("PRAGMA integrity_check").get()?.integrity_check !== "ok") { snapshot.close(); throw new Error("SQLite backup integrity check failed"); }
  return snapshot;
}

async function insertRows(client:QueryClient,table:Table):Promise<void> {
  const quoted = table.columns.map((name) => `"${name}"`).join(",");
  for (let index=0; index<table.rows.length; index+=100) {
    const rows = table.rows.slice(index,index+100);
    const values:unknown[] = [];
    const groups = rows.map((row) => `(${table.columns.map((column) => {
      const value = row[column];
      values.push(value && typeof value === "object" ? JSON.stringify(value) : value);
      return `$${values.length}`;
    }).join(",")})`);
    await client.query(`INSERT INTO ${table.name} (${quoted}) VALUES ${groups.join(",")}`,values);
  }
}

export async function importSqlite(appPath:string,monitoringPath:string,approved=false):Promise<Row> {
  await ensureSchema();
  const existing = await query<{details:Row}>("SELECT details FROM migrations WHERE name=$1",[migrationName]);
  if (existing.rows[0]) return { skipped:true,...existing.rows[0].details };
  if (!approved) throw new Error("Initial import requires stopped SQLite writers and explicit migration approval");
  if (!existsSync(appPath)) {
    if (process.env.BORE_ALLOW_EMPTY_DATABASE !== "yes") throw new Error("Legacy application database is missing; refusing an empty production cutover");
    return transaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(1919092027)");
      const users = await client.query("SELECT id FROM users LIMIT 1");
      if (users.rows.length) throw new Error("Refusing to label a populated database as a fresh installation");
      await client.query("INSERT INTO migrations (name,details) VALUES ($1,$2)",[migrationName,JSON.stringify({fresh:true})]);
      return {fresh:true};
    });
  }
  const app = await snapshotSource(appPath);
  let monitoring:DatabaseSync | undefined;
  try {
    const tables = [readTable(app,"users"),readTable(app,"user_credentials"),readTable(app,"sessions")];
    const state = readTable(app,"app_state",["value"]);
    const history = hasTable(app,"traffic_history") ? readTable(app,"traffic_history",["value"]) : {name:"traffic_history",columns:["kind","id","value"],rows:[]};
    for (const row of state.rows) {
      const value = row.value as Record<string,unknown>;
      for (const [kind,field,stats] of [["direct","reservations","directRequestStats"],["child","accessHosts","requestStats"]]) {
        for (const item of Object.values((value[field!] ?? {}) as Record<string,Row>)) {
          if (item[stats!] !== undefined) {
            history.rows = history.rows.filter((record) => record.kind !== kind || record.id !== item.id);
            history.rows.push({kind,id:item.id,value:item[stats!]});
            delete item[stats!];
          }
        }
      }
    }
    tables.push(state,history);
    if (existsSync(monitoringPath)) {
      monitoring = await snapshotSource(monitoringPath);
      for (const [name,json] of [["requests",["histogram"]],["samples",["data"]],["probes",["error"]],["device_events",[]]] as const) {
        if (hasTable(monitoring,name)) { const table = readTable(monitoring,name,[...json]); table.name = `monitoring.${name}`; tables.push(table); }
      }
    }
    return await transaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(1919092027)");
      const marker = await client.query<{details:Row}>("SELECT details FROM migrations WHERE name=$1",[migrationName]);
      if (marker.rows[0]) return {skipped:true,...marker.rows[0].details};
      const populated = await client.query("SELECT id FROM users LIMIT 1");
      const routes = await client.query("SELECT value FROM app_state WHERE key='primary'");
      const current = routes.rows[0]?.value as {reservations?:Record<string,unknown>} | undefined;
      if (populated.rows.length || Object.keys(current?.reservations ?? {}).length) throw new Error("PostgreSQL is populated without a migration marker; refusing to overwrite it");
      await client.query("DELETE FROM app_state");
      const counts:Row = {};
      const checksums:Row = {};
      for (const table of tables) {
        await insertRows(client,table);
        const target = await client.query<Row>(`SELECT ${table.columns.map((column) => `"${column}"`).join(",")} FROM ${table.name}`);
        const expected = digest(table.rows);
        if (target.rows.length !== table.rows.length || digest(target.rows) !== expected) throw new Error(`Migration verification failed for ${table.name}`);
        counts[table.name] = table.rows.length;
        checksums[table.name] = expected;
      }
      const details = { counts,checksums,backupVerified:true };
      await client.query("INSERT INTO migrations (name,details) VALUES ($1,$2)",[migrationName,JSON.stringify(details)]);
      return details;
    });
  } finally { app.close(); monitoring?.close(); }
}
