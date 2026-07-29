#!/usr/bin/env node
/**
 * Phase 6 — Documentation Helpers promotion + AI de-emphasis.
 * Run: node scripts/test-documentation-helpers-phase6.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const styles = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");

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

test("Sidebar still labels Documentation Center", () => {
  assert.match(html, /data-nav-capability="documentation_helpers"/);
  assert.match(html, />\s*Documentation Center\s*</);
});

test("Documentation Helpers page is helper-first, not AI-first", () => {
  const start = html.indexOf('id="view-ai"');
  const end = html.indexOf('id="view-admin"', start);
  assert.ok(start >= 0 && end > start);
  const section = html.slice(start, end);
  assert.match(section, /<h2>Documentation Center<\/h2>/);
  assert.match(section, /Turn quick classroom notes into professional childcare documentation in seconds/);
  assert.match(section, /Who is this for\?/);
  assert.match(section, /id="docHelperChild"/);
  assert.match(section, /No child selected/);
  assert.match(section, /During block play, the child counted ten blocks/);
  assert.match(section, /ai-debug-toggle" hidden/);
  assert.match(section, /Most Used/);
  assert.match(section, /What do you want to create today\?/);
  assert.match(section, /class="doc-helper-card"/);
  assert.match(section, /Create Documentation/);
  assert.match(section, /writing help is optional/i);
  assert.match(section, /More documentation tools/);
  assert.match(section, /data-view="generators"/);
  assert.doesNotMatch(section, /AI Childcare Tools/);
  assert.doesNotMatch(section, /Generate Documentation/);
  assert.doesNotMatch(section, /document creations used/);
  assert.doesNotMatch(section, /aiUsagePanel/);
  assert.doesNotMatch(section, /What do you need help creating today\?/);
  assert.doesNotMatch(section, /Liam counted/);
});

test("Homepage showcase promotes Documentation Helpers", () => {
  assert.match(html, /<h3>Documentation Helpers<\/h3>/);
  assert.doesNotMatch(html, /AI Childcare Tools/);
  assert.doesNotMatch(html, /✨ AI Generated Output/);
});

test("Pricing and FAQ use document-creation wording", () => {
  assert.match(html, /10 Document Creations/);
  assert.match(html, /Unlimited Document Creations/);
  assert.match(html, /What Documentation Helpers are included\?/);
  assert.doesNotMatch(html, /10 AI Generations/);
  assert.doesNotMatch(html, /What AI tools are included\?/);
});

test("Settings uses Documentation Preferences", () => {
  assert.match(html, /Documentation Preferences/);
  assert.doesNotMatch(html, /<h3>AI Preferences<\/h3>/);
});

test("Advanced helpers are secondary under Documentation Helpers", () => {
  const start = html.indexOf('id="view-generators"');
  const end = html.indexOf('id="view-tools"', start);
  const section = html.slice(start, end);
  assert.match(section, /More documentation tools/);
  assert.match(section, /Saved documentation/);
  assert.doesNotMatch(section, /Saved AI Work/);
  assert.doesNotMatch(section, /Childcare generators/);
});

test("Calendar and Daily Logs de-emphasize AI as primary", () => {
  assert.match(appJs, /data-view="ai">Doc Helper</);
  assert.doesNotMatch(appJs, /data-view="ai">AI Ideas</);
  assert.match(appJs, /data-dlc-mode="manual"[^>]*class="dlc-mode-card dlc-mode-recommended"|class="dlc-mode-card dlc-mode-recommended"[^>]*data-dlc-mode="manual"/);
  assert.doesNotMatch(appJs, /dlc-mode-recommended" data-dlc-mode="ai"/);
});

test("Dashboard promotes Documentation Helpers outside More tools", () => {
  assert.match(appJs, /eyebrow">Documentation Helpers<\/p><h3>Type one quick note/);
  assert.match(appJs, /More tools — children, classroom extras/);
});

test("Tool cards no longer badge as AI", () => {
  assert.match(styles, /content:\s*"Doc"/);
  assert.doesNotMatch(styles, /\.ai-tool-card::before[\s\S]{0,120}content:\s*"AI"/);
});

if (!process.exitCode) {
  console.log("\nAll Phase 6 Documentation Helpers checks passed.");
}
