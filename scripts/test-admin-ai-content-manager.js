#!/usr/bin/env node
/**
 * Admin AI Tools + Content Manager bulk-action guards.
 * Run: node scripts/test-admin-ai-content-manager.js
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

test("server exposes admin AI content generation endpoints", () => {
  assert.match(serverJs, /function handleAdminAiGenerateContent\(/);
  assert.match(serverJs, /\/api\/admin\/ai-generate-content/);
  assert.match(serverJs, /ADMIN_AI_CONTENT_TYPES/);
  assert.match(serverJs, /function handleAdminGenerateLessonPlan\(/);
  assert.match(serverJs, /\/api\/admin\/generate-lesson-plan/);
});

test("client AI Tools panel is wired into Admin AI group", () => {
  assert.match(appJs, /function renderAdminAiToolsPanel\(/);
  assert.match(appJs, /function handleAdminAiToolsGenerate\(/);
  assert.match(appJs, /function callAdminAiGenerateContent\(/);
  assert.match(appJs, /"ai-tools"/);
  assert.match(appJs, /admin-ai-tools-panel/);
  assert.match(indexHtml, /id="adminAiToolsApp"/);
  assert.match(appJs, /tabs: \["ai-tools", "prompts", "settings", "usage", "ai-testing"\]/);
});

test("printables is restored in Content nav tabs", () => {
  assert.match(
    appJs,
    /tabs: \["curriculum-lesson-plans", "curriculum-activities", "curriculum-resources", "forms", "printables", "reviews", "founder", "resources"\]/,
  );
});

test("printables/forms support multi-select bulk status updates", () => {
  assert.match(appJs, /function bulkUpdateAdminManagedStatus\(/);
  assert.match(appJs, /data-managed-select=/);
  assert.match(appJs, /data-managed-bulk=/);
  assert.match(appJs, /data-managed-bulk-status="approved"/);
});

test("curriculum activities bulk actions update parent lesson status", () => {
  assert.match(appJs, /function bulkUpdateAdminCurriculumActivitiesViaParent\(/);
  assert.match(appJs, /data-curriculum-activity-select=/);
  assert.match(appJs, /data-curriculum-activity-bulk="published"/);
  assert.match(appJs, /Bulk actions update parent lesson status/);
});

test("cache bust versions stay aligned", () => {
  const indexCss = indexHtml.match(/styles\.css\?v=([^"]+)/)?.[1];
  const indexJs = indexHtml.match(/app\.js\?v=([^"]+)/)?.[1];
  assert.equal(indexCss, "20260718-free-reengagement");
  assert.equal(indexJs, "20260718-free-reengagement");
  assert.match(sw, /llh-shell-v87-free-reengagement/);
});

if (!process.exitCode) {
  console.log("\nAll admin AI + content manager tests passed.");
}
