#!/usr/bin/env node
import { runDaemon } from "./daemon-runtime.js";

runDaemon().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
