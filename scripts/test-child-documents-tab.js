#!/usr/bin/env node
/**
 * Child profile Documents & Forms markers (now under Records).
 * Run: node scripts/test-child-documents-tab.js
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
const serverJs = fs.readFileSync(path.join(__dirname, "..", "server", "index.js"), "utf8");

test("profile tabs include Records (documents live under Records)", () => {
  assert.match(appJs, /\["records", "Records"\]/);
  assert.match(appJs, /\["overview", "Overview"\]/);
  assert.match(appJs, /\["observations", "Observations"\]/);
  assert.match(appJs, /\["goals", "Goals"\]/);
  assert.match(appJs, /\["reports", "Reports & Photos"\]/);
  assert.match(appJs, /function renderChildRecordsTab/);
  assert.match(appJs, /function renderChildDocumentsTab/);
});

test("documents tab renderer and handlers exist", () => {
  assert.match(appJs, /function renderChildDocumentsTab/);
  assert.match(appJs, /data-child-document-form/);
  assert.match(appJs, /data-delete-child-document/);
  assert.match(appJs, /appendChildRecord\("Documents"/);
});

test("legacy documents/timeline tabs normalize into Records (or Forms & Records when hub testing)", () => {
  assert.match(appJs, /function normalizeChildProfileTab/);
  assert.match(appJs, /raw === "documents"/);
  assert.match(appJs, /raw === "timeline"/);
  assert.match(appJs, /return "records"/);
  assert.match(appJs, /forms-records/);
});

test("Documents store is included in client and server child data keys", () => {
  assert.match(appJs, /"Documents"/);
  assert.match(appJs, /documents: childStore\("Documents"\)/);
  assert.match(serverJs, /"Documents"/);
});

if (!process.exitCode) {
  console.log("\nAll child documents tab tests passed.");
}
