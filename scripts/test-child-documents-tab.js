#!/usr/bin/env node
/**
 * Child profile Documents & Forms tab markers.
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

test("profile tabs include Documents & Forms in the core set", () => {
  assert.match(appJs, /\["documents", "Documents & Forms"\]/);
  assert.match(appJs, /\["overview", "Overview"\]/);
  assert.match(appJs, /\["observations", "Observations"\]/);
  assert.match(appJs, /\["goals", "Goals"\]/);
  assert.match(appJs, /\["reports", "Daily Reports"\]/);
  assert.match(appJs, /\["photos", "Photos"\]/);
  assert.match(appJs, /\["timeline", "Timeline"\]/);
});

test("documents tab renderer and handlers exist", () => {
  assert.match(appJs, /function renderChildDocumentsTab/);
  assert.match(appJs, /data-child-document-form/);
  assert.match(appJs, /data-delete-child-document/);
  assert.match(appJs, /appendChildRecord\("Documents"/);
});

test("Documents store is included in client and server child data keys", () => {
  assert.match(appJs, /"Documents"/);
  assert.match(appJs, /documents: childStore\("Documents"\)/);
  assert.match(serverJs, /"Documents"/);
});

if (!process.exitCode) {
  console.log("\nAll child documents tab tests passed.");
}
