#!/usr/bin/env node
/**
 * Guards for finishing Menu / Observation / Resource Category admin managers.
 * Run: node scripts/test-admin-content-finish.js
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

const root = path.join(__dirname, "..");
const appJs = fs.readFileSync(path.join(root, "app.js"), "utf8");
const serverJs = fs.readFileSync(path.join(root, "server/index.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const CACHE_V = "20260721-cover-netflix-nav";
const SHELL_V = "llh-shell-v107-cover-netflix-nav";

test("site content store supports menus, observations, and resource categories", () => {
  assert.match(serverJs, /menus:\s*\[\]/);
  assert.match(serverJs, /observations:\s*\[\]/);
  assert.match(serverJs, /lessonPlanResourceCategories/);
  assert.match(serverJs, /menuCategory/);
  assert.match(serverJs, /learningArea/);
  assert.match(serverJs, /publicMenus/);
  assert.match(serverJs, /publicObservations/);
});

test("admin content nav includes the three managers", () => {
  assert.match(appJs, /"menus"/);
  assert.match(appJs, /"observations"/);
  assert.match(appJs, /"resource-categories"/);
  assert.match(appJs, /adminMenusManagerApp/);
  assert.match(appJs, /adminObservationsManagerApp/);
  assert.match(appJs, /adminResourceCategoriesManagerApp/);
  assert.match(appJs, /function renderAdminMenusManager\(/);
  assert.match(appJs, /function renderAdminObservationsManager\(/);
  assert.match(appJs, /function renderAdminResourceCategoriesManager\(/);
  assert.match(appJs, /function effectiveLessonPlanResourceCategories\(/);
  assert.match(appJs, /function loadAdminManagedMenus\(/);
  assert.match(appJs, /function loadAdminManagedObservations\(/);
});

test("content health links to live managers instead of future-build stubs", () => {
  assert.match(appJs, /Open manager/);
  assert.doesNotMatch(appJs, /Future Admin Build Items/);
  assert.doesNotMatch(appJs, /Not Yet Editable via Admin/);
  assert.match(appJs, /tab:\s*"menus"/);
  assert.match(appJs, /tab:\s*"observations"/);
  assert.match(appJs, /tab:\s*"resource-categories"/);
  assert.match(appJs, /data-admin-section-tab="\$\{escapeHtml\(tab\)\}"/);
});

test("cache bust versions stay aligned", () => {
  assert.equal(indexHtml.match(/app\.js\?v=([^"]+)/)?.[1], CACHE_V);
  assert.equal(indexHtml.match(/styles\.css\?v=([^"]+)/)?.[1], CACHE_V);
  assert.match(sw, new RegExp(SHELL_V.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("npm script is registered", () => {
  assert.equal(pkg.scripts["test:admin-content-finish"], "node scripts/test-admin-content-finish.js");
});

if (!process.exitCode) {
  console.log("\nAll admin content finish tests passed.");
}
