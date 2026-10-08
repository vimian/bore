import { transaction } from "./client.js";

export async function ensureSchema() {
  await transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(1919092026)");
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,name TEXT NOT NULL,
        reservation_limit INTEGER NOT NULL DEFAULT 2 CHECK(reservation_limit>=0),
        access_host_limit INTEGER NOT NULL DEFAULT 5 CHECK(access_host_limit>=0),
        created_at TEXT NOT NULL,updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS user_credentials (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        password_hash TEXT NOT NULL,password_salt TEXT NOT NULL,updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL,created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);
      CREATE TABLE IF NOT EXISTS app_state (
        key TEXT PRIMARY KEY,value JSONB NOT NULL,updated_at TEXT NOT NULL,revision BIGINT NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS traffic_history (
        kind TEXT NOT NULL CHECK(kind IN ('direct','child')),id TEXT NOT NULL,value JSONB NOT NULL,PRIMARY KEY(kind,id)
      );
      CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),details JSONB NOT NULL);
      CREATE SCHEMA IF NOT EXISTS monitoring;
      CREATE TABLE IF NOT EXISTS monitoring.requests (
        minute BIGINT,host TEXT,protocol TEXT,outcome TEXT,status INTEGER,count BIGINT,total_ms DOUBLE PRECISION,
        max_ms DOUBLE PRECISION,routing_ms DOUBLE PRECISION,relay_ms DOUBLE PRECISION,bytes BIGINT,
        histogram JSONB,local_ms DOUBLE PRECISION,local_count BIGINT,PRIMARY KEY(minute,host,protocol,outcome,status)
      );
      CREATE TABLE IF NOT EXISTS monitoring.samples (time BIGINT,source TEXT,data JSONB,PRIMARY KEY(time,source));
      CREATE TABLE IF NOT EXISTS monitoring.probes (time BIGINT,host TEXT,status INTEGER,duration_ms DOUBLE PRECISION,error JSONB,PRIMARY KEY(time,host));
      CREATE TABLE IF NOT EXISTS monitoring.device_events (minute BIGINT,device_id TEXT,event TEXT,code INTEGER,count BIGINT,PRIMARY KEY(minute,device_id,event,code));
      CREATE INDEX IF NOT EXISTS monitoring_requests_host_minute ON monitoring.requests(host,minute);
      CREATE INDEX IF NOT EXISTS monitoring_probes_host_time ON monitoring.probes(host,time);
      INSERT INTO app_state (key,value,updated_at) VALUES ('primary',
        '{"devices":{},"reservations":{},"accessHosts":{},"deviceTunnels":{},"pendingCliAuth":{},"deviceConnections":{}}',
        to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) ON CONFLICT DO NOTHING;
    `);
  });
}
