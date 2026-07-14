#!/usr/bin/env node
/**
 * Documentation Helpers post-generate action markers.
 * Run: node scripts/test-doc-helpers-post-generate.js
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

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

test("result toolbar exposes clear next-step actions", () => {
  assert.match(html, /id="docHelperEditBtn"[^>]*>Edit Generated Content</);
  assert.match(html, /id="docHelperCopyBtn"/);
  assert.match(html, /id="docHelperSaveBtn"[^>]*>Save to Child Profile</);
  assert.match(html, /id="docHelperCreateAnotherBtn"/);
  assert.match(html, /id="docHelperNextStepHint"/);
  assert.match(html, /id="docHelperPostSavePanel"/);
  assert.match(html, /id="docHelperOpenChildBtn"/);
});

test("app keeps generated content on page after save and supports create another", () => {
  assert.match(appJs, /function resetDocHelperResultsPanel/);
  assert.match(appJs, /function openDocHelperSavedChild/);
  assert.match(appJs, /Save to Child Profile/);
  assert.match(appJs, /Choose a child in Step 1 before saving/);
  assert.doesNotMatch(
    appJs.slice(appJs.indexOf("const docHelperSaveBtn = event.target.closest(\"#docHelperSaveBtn\")"), appJs.indexOf("const docHelperSaveBtn = event.target.closest(\"#docHelperSaveBtn\")") + 2500),
    /setView\(config\.view\);/
  );
});

if (!process.exitCode) {
  console.log("\nAll doc-helpers post-generate tests passed.");
}
