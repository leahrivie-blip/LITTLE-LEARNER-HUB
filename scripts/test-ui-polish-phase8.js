#!/usr/bin/env node
/**
 * Phase 8 — Customer-facing UI polish contracts.
 * Run: npm run test:ui-polish-phase8
 *
 * Does not touch curriculum inventory.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const ARTIFACT_DIR = "/opt/cursor/artifacts/site-stabilization/phase8";
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

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

const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const tkViewer = fs.readFileSync(path.join(ROOT, "scripts/teaching-kit-viewer.js"), "utf8");

test("libraryPlanBadge hides Free/Pro for entitled members", () => {
  assert.match(appJs, /function libraryPlanBadge\(resource\)/);
  assert.match(appJs, /if \(isProUser\(\) \|\| hasAdminFullAccess\(\)\) return "";/);
  assert.match(appJs, /function libraryContentBadgeHtml/);
});

test("library cards and viewers use gated content badges", () => {
  assert.match(appJs, /\$\{libraryContentBadgeHtml\(resource\)\}/);
  assert.match(appJs, /const viewerAccessLabel = libraryPlanBadge\(resource\)/);
  assert.match(appJs, /const accessTag = libraryPlanBadge\(resource\)/);
  assert.match(appJs, /Founding Member — Full Access/);
});

test("Teaching Kit chrome respects empty planLabel", () => {
  assert.match(tkViewer, /hasOwnProperty\.call\(chrome \|\| \{\}, "planLabel"\)/);
});

test("formatChildDisplayName exists and is applied on save/read", () => {
  assert.match(appJs, /function formatChildDisplayName\(name\)/);
  assert.match(appJs, /name: formatChildDisplayName\(data\.name\)/);
  assert.match(appJs, /const displayName = formatChildDisplayName\(child\?\.name\)/);
});

test("formatChildDisplayName title-cases mixed names", () => {
  const snippet = appJs.match(/function formatChildDisplayName\(name\) \{[\s\S]*?\n\}/);
  assert.ok(snippet, "helper extractable");
  const sandbox = { result: null };
  vm.runInNewContext(`${snippet[0]}; result = {
    a: formatChildDisplayName("emma rose"),
    b: formatChildDisplayName("AJ"),
    c: formatChildDisplayName("mary-jane"),
    d: formatChildDisplayName("  WAYLON  "),
  };`, sandbox);
  assert.equal(sandbox.result.a, "Emma Rose");
  assert.equal(sandbox.result.b, "AJ");
  assert.equal(sandbox.result.c, "Mary-Jane");
  assert.equal(sandbox.result.d, "Waylon");
});

test("Settings hub no longer doubles membership badges", () => {
  assert.match(appJs, /settings-hub-identity muted-copy.*accountTypeLabel.*roleLabel.*planLabel/);
  assert.doesNotMatch(
    appJs,
    /settings-hub-identity muted-copy.*accountStatusBadgeHtml/,
  );
  assert.match(appJs, /detail: `\$\{displayName\} · \$\{email \|\| "No email"\} · \$\{accountTypeLabel\} · \$\{roleLabel\}`/);
});

test("Family Hub wording is finished (no unfinished delivery copy)", () => {
  assert.doesNotMatch(appJs, /Text delivery isn’t live yet/);
  assert.doesNotMatch(appJs, /Phone for a text link later/);
  assert.match(appJs, /Share the link by text or email/);
  assert.match(appJs, /How Family Hub works in this test workspace/);
  assert.match(indexHtml, /Family Hub <span class="llh-status-pill">In Preview<\/span>/);
});

test("Director Center has finished live-tools wording", () => {
  assert.doesNotMatch(appJs, /will come later/);
  assert.match(appJs, /Open the live pages you use to run staff, classrooms, children, and the calendar/);
});

test("Daily Log Free/Pro mini labels hide for entitled users", () => {
  assert.match(appJs, /\$\{isProUser\(\) \? "" : \(proOnly/);
  assert.match(appJs, /\$\{isProUser\(\) \? "" : \(option\.pro/);
});

fs.writeFileSync(path.join(ARTIFACT_DIR, "phase8-report.json"), JSON.stringify({
  suite: "ui-polish-phase8",
  generatedAt: new Date().toISOString(),
  curriculumUntouched: true,
}, null, 2));

if (!process.exitCode) console.log("\nAll Phase 8 UI polish checks passed.");
