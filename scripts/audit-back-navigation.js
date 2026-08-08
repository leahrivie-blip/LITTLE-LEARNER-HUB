#!/usr/bin/env node
/**
 * Static back-button / dead-end navigation audit.
 * Usage: node scripts/audit-back-navigation.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = process.env.LLH_ARTIFACT_DIR || "/opt/cursor/artifacts/july-rebuild-audits";
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const comms = fs.readFileSync(path.join(ROOT, "comms-center.js"), "utf8");

fs.mkdirSync(OUT_DIR, { recursive: true });

const findings = [];

function note(id, status, detail, severity = null) {
  findings.push({ id, status, detail, severity });
}

const PRIMARY_HUBS = new Set([
  "home",
  "admin",
  "calendar",
  "today",
  "classroom",
  "business",
  "more",
]);

const viewIds = [...html.matchAll(/id="(view-[^"]+)"/g)].map((m) => m[1]);

function htmlHasBack(viewId) {
  const re = new RegExp(
    `id="${viewId}"[\\s\\S]{0,2500}(back-button|data-contextual-back|← Back)`,
  );
  return re.test(html);
}

function dynamicHasBack(short) {
  const patterns = [
    new RegExp(`llhPageBackButtonHtml\\(\\{[\\s\\S]{0,120}viewKey:\\s*"${short}"`),
    new RegExp(`viewKey:\\s*"${short}"`),
    new RegExp(`data-contextual-back="${short}"`),
    new RegExp(`#view-${short}[\\s\\S]{0,2000}(back-button|data-contextual-back|← Back)`),
  ];
  return patterns.some((re) => re.test(appJs) || re.test(comms) || re.test(html));
}

for (const viewId of viewIds) {
  const short = viewId.replace(/^view-/, "");
  if (PRIMARY_HUBS.has(short)) {
    note(
      `view-${short}`,
      "PASS",
      short === "admin" || short === "home"
        ? "Primary hub — sidebar / work-nav return is enough (intentional exception)"
        : "Primary landing / work-mode hub — Back optional unless deep-linked with return context",
    );
    continue;
  }
  if (htmlHasBack(viewId) || dynamicHasBack(short)) {
    note(`view-${short}`, "PASS", "Has back control in markup or shared helper");
    continue;
  }
  // Known dynamic shells
  if (["resources", "settings", "staff", "classrooms", "families", "enrollment", "reports", "activities", "forms", "support-center", "director-center", "messages", "whats-new", "tools"].includes(short)) {
    note(`view-${short}`, "FAIL", "Expected dynamic Back via llhPageBackButtonHtml / contextual helper", "high");
    continue;
  }
  note(`view-${short}`, "FAIL", "No clear back button found in markup or nearby renderer", "high");
}

note(
  "shared-helper",
  /function llhPageBackButtonHtml/.test(appJs) ? "PASS" : "FAIL",
  "Shared llhPageBackButtonHtml helper",
  /function llhPageBackButtonHtml/.test(appJs) ? null : "high",
);
note(
  "resource-viewer-back",
  /resourceViewerBack|data-lesson-workspace-back|#resourceViewerBackButton/.test(appJs) ? "PASS" : "FAIL",
  "Lesson/resource viewer back helpers",
);
note(
  "lesson-workspace-back",
  /data-lesson-workspace-back/.test(appJs) ? "PASS" : "FAIL",
  "Lesson workspace dedicated back control",
);
note(
  "contextual-back",
  /navigateContextualBack|data-contextual-back/.test(appJs) ? "PASS" : "FAIL",
  "Contextual back stack for nested views",
);
note(
  "daily-logs-home-exit",
  /return "children"/.test(appJs) && /target === "children"/.test(appJs) ? "PASS" : "FAIL",
  "Daily Logs home exits to Children",
  /return "children"/.test(appJs) ? null : "high",
);
note(
  "auth-modal-close",
  /closeAuthModal|#authModal/.test(appJs) && /aria-label="Close"|closeAuth|data-close/.test(html + appJs) ? "PASS" : "NEEDS_IMPROVEMENT",
  "Auth modal dismiss path",
);
note(
  "back-button-tap-target",
  /\.back-button\s*\{[^}]*min-height:\s*44px/s.test(fs.readFileSync(path.join(ROOT, "styles.css"), "utf8"))
    ? "PASS"
    : "FAIL",
  ".back-button min-height 44px for mobile tap targets",
);

const deadEnds = findings.filter((f) => f.status === "FAIL" || f.status === "NEEDS_IMPROVEMENT");
const summary = {
  checked: findings.length,
  pass: findings.filter((f) => f.status === "PASS").length,
  needsImprovement: findings.filter((f) => f.status === "NEEDS_IMPROVEMENT").length,
  fail: findings.filter((f) => f.status === "FAIL").length,
  generatedAt: new Date().toISOString(),
};

fs.writeFileSync(path.join(OUT_DIR, "back-navigation-audit.json"), JSON.stringify({ summary, findings }, null, 2));
const md = [
  "# Back Button / Navigation Audit",
  "",
  `Generated: ${summary.generatedAt}`,
  "",
  "## Summary",
  `- Checked: ${summary.checked}`,
  `- Pass: ${summary.pass}`,
  `- Needs improvement: ${summary.needsImprovement}`,
  `- Fail: ${summary.fail}`,
  "",
  "## Dead ends / weak paths",
  deadEnds.length
    ? deadEnds.map((f) => `- [${f.status}] ${f.id}: ${f.detail}`).join("\n")
    : "- None flagged",
  "",
  "## All findings",
  ...findings.map((f) => `- [${f.status}] ${f.id}: ${f.detail}`),
  "",
].join("\n");
fs.writeFileSync(path.join(OUT_DIR, "back-navigation-audit.md"), md);
fs.writeFileSync(path.join(ROOT, "docs/audits/back-navigation-audit.md"), md);
fs.writeFileSync(path.join(ROOT, "docs/audits/back-navigation-audit.json"), JSON.stringify({ summary, findings }, null, 2));

console.log(md);
if (summary.fail) process.exitCode = 1;
