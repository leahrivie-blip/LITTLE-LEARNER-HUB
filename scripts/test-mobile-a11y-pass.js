#!/usr/bin/env node
/**
 * Mobile + accessibility focused pass regressions.
 * Run: npm run test:mobile-a11y-pass
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
}

function main() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const styles = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  const comms = fs.readFileSync(path.join(ROOT, "comms-center.js"), "utf8");
  const sw = fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8");

  ok(appJs.includes("function trapLlhDialogFocus"), "dialog Tab trap helper present");
  ok(appJs.includes("function restoreLlhFocus"), "focus restore helper present");
  ok(appJs.includes("closeCalendarAddItemDialog()"), "calendar Escape close wired");
  ok(appJs.includes("closeChildRecordEditDialog(false)"), "record-edit Escape close wired");
  ok(appJs.includes("calendarEventModalReturnFocus"), "calendar focus restore present");
  ok(appJs.includes("resourceViewerReturnFocus"), "resource viewer focus restore present");
  ok(appJs.includes("childRecordEditReturnFocus"), "record-edit focus restore present");
  ok(appJs.includes("notificationBellReturnFocus"), "notification bell focus restore present");
  ok(!/activity-browse-card[\s\S]{0,220}role="button"/.test(appJs), "activity cards no longer role=button wrappers");
  ok(!/lesson-plan-card browse-card[\s\S]{0,260}role="button"/.test(appJs), "lesson cards no longer role=button wrappers");
  ok(appJs.includes("function dlcBackLabel"), "Daily Logs Back label helper present");
  ok(appJs.includes("dlc-dashboard-date-label\" aria-live"), "Daily Logs date is not an h3 heading");
  ok(indexHtml.includes("<h3 class=\"doc-helpers-section-heading\">Who is this for?"), "Doc Helpers who-for is an h3");
  ok(indexHtml.includes('<span aria-hidden="true">✓</span>'), "pricing decorative checks hidden from AT");
  ok(appJs.includes('aria-hidden="true">✓</span> Pro Access'), "library Pro badge check decorative");
  ok(styles.includes("Shared chrome focus-visible"), "shared focus-visible styles present");
  ok(styles.includes("@media (max-width: 390px)"), "360/390 mobile modal safety present");
  ok(comms.includes('aria-controls="${panelId}"'), "messages tabs expose aria-controls");
  ok(comms.includes('aria-hidden="true"'), "messages unread dot is decorative");
  ok(comms.includes('role="tabpanel"'), "messages tabpanel role present");
  ok(sw.includes("20260805-tk-owner-preview-r1"), "shell cache bumped for a11y pass");
  ok(indexHtml.includes("20260805-tk-owner-preview-r1"), "index cache bumped for a11y pass");

  console.log(`PASS mobile/a11y pass (${passed} asserts)`);
}

try {
  main();
} catch (error) {
  console.error("FAIL mobile/a11y pass:", error.message || error);
  process.exit(1);
}
