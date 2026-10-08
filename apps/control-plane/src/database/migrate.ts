import { closeDatabase } from "@bore/database";
import { importSqlite } from "./sqlite-import.js";

try {
  console.log(JSON.stringify(await importSqlite(process.env.BORE_DB_PATH ?? "/data/bore.sqlite",
    process.env.BORE_MONITORING_DB_PATH ?? "/data/monitoring.sqlite",process.env.BORE_SQLITE_MIGRATION_APPROVED === "yes")));
} catch (error) {
  console.error("PostgreSQL migration failed:",error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
} finally { await closeDatabase(); }
