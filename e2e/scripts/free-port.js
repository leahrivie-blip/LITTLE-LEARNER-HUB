#!/usr/bin/env node
/** Kill stale E2E test servers on the configured port before a run. */
const { execSync } = require("child_process");

const port = process.env.E2E_PORT || "4180";

function run(cmd) {
  try {
    execSync(cmd, { stdio: "ignore" });
  } catch {
    // ignore non-zero exits
  }
}

run(`fuser -k ${port}/tcp`);
run(`lsof -ti:${port} | xargs -r kill -9`);
run("pkill -9 -f 'e2e/scripts/start-test-server'");
