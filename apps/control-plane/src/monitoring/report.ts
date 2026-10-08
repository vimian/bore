import { closeDatabase } from "@bore/database";
import { buildMonitoringReport } from "./report-data.js";

const hours = Number(process.argv[2] ?? "24");
const host = process.argv[3];
try {
  console.log(JSON.stringify(await buildMonitoringReport(hours, host), null, 2));
} finally {
  if (process.env.DATABASE_URL) await closeDatabase();
}
