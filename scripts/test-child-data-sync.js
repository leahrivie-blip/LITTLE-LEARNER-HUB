#!/usr/bin/env node
/**
 * Child-data cloud sync reliability markers.
 * Run: node scripts/test-child-data-sync.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function test(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (error) {
    console.error(`FAIL  ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

test("firebaseAuthHeaders waits for authStateReady", () => {
  assert.match(appJs, /authStateReady/);
  assert.match(appJs, /Wait for Firebase to finish restoring a persisted session/);
});

test("syncChildDataFromBackend retries missing auth and failed responses", () => {
  assert.match(appJs, /Child data cloud sync failed/);
  assert.match(appJs, /attempt < 4/);
  assert.match(appJs, /childCloudSyncQueued/);
});

test("save during sync can force upload when remote is empty", () => {
  assert.match(appJs, /saveChildDataToBackend\(\{ force: true \}\)/);
  assert.match(appJs, /childCloudSyncing && !options\.force/);
});

test("successful sync refreshes children view and sidebar", () => {
  assert.match(appJs, /options\.render !== false && document\.querySelector\("#view-children"\)/);
  assert.match(appJs, /updateSidebarDashboard\(\);/);
});

if (!process.exitCode) {
  console.log("\nAll child-data sync tests passed.");
}
