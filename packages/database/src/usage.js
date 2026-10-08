import { query } from "./client.js";

export function usageMonth(month = new Date().toISOString().slice(0, 7)) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month.startsWith("0000")) throw new RangeError("Month must be YYYY-MM");
  return month;
}
const empty = () => ({ httpRequests: 0, websocketConnections: 0, tcpTlsConnections: null, syntheticRequests: 0 });
function counts(row) {
  return { httpRequests: row.http_requests, websocketConnections: row.websocket_connections,
    tcpTlsConnections: null, syntheticRequests: row.synthetic_requests };
}
function add(total, value) {
  total.httpRequests += value.httpRequests;
  total.websocketConnections += value.websocketConnections;
  total.syntheticRequests += value.syntheticRequests;
}
export async function getUserUsage(userId, selectedMonth) {
  const month = usageMonth(selectedMonth);
  const result = await query(`SELECT
    (SELECT value FROM monitoring.settings WHERE key='usage_tracking_started_at') AS started,
    COALESCE((SELECT jsonb_agg(u) FROM monitoring.usage_counts u WHERE user_id=$1 AND
      ((granularity='monthly' AND period=$2) OR granularity='lifetime' OR (granularity='daily' AND period>=$2||'-01' AND period<=$2||'-31'))),'[]'::jsonb) AS rows`, [userId, month]);
  const namespaces = new Map();
  const daily = new Map();
  const totals = { month: empty(), lifetime: empty() };
  for (const row of result.rows[0].rows) {
    const value = counts(row);
    if (row.granularity === "daily") {
      const day = daily.get(row.period) ?? { day: row.period, ...empty() };
      add(day, value);
      daily.set(row.period, day);
      continue;
    }
    const period = row.granularity === "monthly" ? "month" : "lifetime";
    add(totals[period], value);
    let namespace = namespaces.get(row.reservation_id);
    if (!namespace) {
      namespace = { reservationId: row.reservation_id, namespace: row.namespace, month: empty(), lifetime: empty(), hosts: new Map() };
      namespaces.set(row.reservation_id, namespace);
    }
    add(namespace[period], value);
    const host = namespace.hosts.get(row.access_host_id) ?? { accessHostId: row.access_host_id || null, host: row.host, month: empty(), lifetime: empty() };
    host[period] = value;
    if (period === "lifetime") host.host = row.host;
    namespace.hosts.set(row.access_host_id, host);
  }
  return { trackingSince: result.rows[0].started, timeZone: "UTC", month, limitsEnforced: false,
    protocolSupport: { http: true, websocket: true, tcpTls: false }, totals,
    namespaces: [...namespaces.values()].map((n) => ({ ...n, hosts: [...n.hosts.values()].sort((a, b) => a.host.localeCompare(b.host)) })).sort((a, b) => a.namespace.localeCompare(b.namespace)),
    daily: [...daily.values()].sort((a, b) => a.day.localeCompare(b.day)) };
}
