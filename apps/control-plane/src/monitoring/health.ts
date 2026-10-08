import { closeDatabase, query } from "@bore/database";
import { monitoringSampleIsFresh } from "./health-check.js";

try {
  const result = await query<{ time: number | null }>("SELECT MAX(time) AS time FROM monitoring.samples WHERE source='host'");
  if (!monitoringSampleIsFresh(result.rows[0]?.time ?? null)) process.exitCode = 1;
} catch {
  process.exitCode = 1;
} finally { await closeDatabase(); }
