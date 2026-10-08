export async function ensureAnalyticsSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS monitoring.settings (key TEXT PRIMARY KEY,value TEXT NOT NULL);
    INSERT INTO monitoring.settings VALUES ('usage_tracking_started_at',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) ON CONFLICT DO NOTHING;
    CREATE TABLE IF NOT EXISTS monitoring.writers (id TEXT PRIMARY KEY,sequence BIGINT NOT NULL DEFAULT 0,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS monitoring.releases (revision TEXT PRIMARY KEY,first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS monitoring.usage_counts (
      granularity TEXT NOT NULL CHECK(granularity IN ('daily','monthly','lifetime')),period TEXT NOT NULL,
      user_id TEXT NOT NULL,reservation_id TEXT NOT NULL,access_host_id TEXT NOT NULL,
      namespace TEXT NOT NULL,host TEXT NOT NULL,http_requests BIGINT NOT NULL DEFAULT 0,
      websocket_connections BIGINT NOT NULL DEFAULT 0,tcp_tls_connections BIGINT NOT NULL DEFAULT 0,
      synthetic_requests BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY(granularity,period,user_id,reservation_id,access_host_id)
    );
    CREATE INDEX IF NOT EXISTS usage_owner_period ON monitoring.usage_counts(user_id,granularity,period);
    CREATE TABLE IF NOT EXISTS monitoring.daily_metrics (
      day TEXT NOT NULL,revision TEXT NOT NULL,category TEXT NOT NULL,dimensions JSONB NOT NULL,
      metric TEXT NOT NULL,total DOUBLE PRECISION NOT NULL,minimum DOUBLE PRECISION NOT NULL,
      maximum DOUBLE PRECISION NOT NULL,observations BIGINT NOT NULL,
      PRIMARY KEY(day,revision,category,dimensions,metric)
    );
    ALTER TABLE monitoring.requests ADD COLUMN IF NOT EXISTS revision TEXT NOT NULL DEFAULT 'legacy';
    ALTER TABLE monitoring.samples ADD COLUMN IF NOT EXISTS revision TEXT NOT NULL DEFAULT 'legacy';
    ALTER TABLE monitoring.probes ADD COLUMN IF NOT EXISTS revision TEXT NOT NULL DEFAULT 'legacy';
    ALTER TABLE monitoring.device_events ADD COLUMN IF NOT EXISTS revision TEXT NOT NULL DEFAULT 'legacy';
  `);
}
