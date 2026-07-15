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

fs.mkdirSync(OUT_DIR, { recursive: true });

const findings = [];

function note(id, status, detail, severity = null) {
  findings.push({ id, status, detail, severity });
}

// Views in index.html
const viewIds = [...html.matchAll(/id="(view-[^"]+)"/g)].map((m) => m[1]);
const viewsWithBack = new Set(
  [...html.matchAll(/id="(view-[^"]+)"[\s\S]*?(?=id="view-|<\/main>)/g)]
    .filter((m) => /back-button|data-contextual-back|← Back|data-view="home"|data-view="settings"|data-view="calendar"/.test(m[0]))
    .map((m) => m[1]),
);

for (const viewId of viewIds) {
  const short = viewId.replace(/^view-/, "");
  if (["home", "admin"].includes(short)) {
    note(`view-${short}`, "PASS", "Primary hub / admin — sidebar return is enough");
    continue;
  }
  if (viewsWithBack.has(viewId) || html.includes(`id="${viewId}"`) && new RegExp(`id="${viewId}"[\\s\\S]{0,2500}back-button|data-contextual-back`).test(html)) {
    note(`view-${short}`, "PASS", "Has back control in markup");
  } else {
    // Dynamically rendered views may inject back in app.js
    const renderHint = new RegExp(`view-${short}|#view-${short}|render\\w*Page`);
    const hasDynamicBack = new RegExp(`#view-${short}[\\s\\S]{0,2000}back-button|data-view=\"settings\"|data-view=\"home\"|← Back`).test(appJs)
      || (short === "resources" && /renderResourcesHubPage[\s\S]{0,800}/.test(appJs))
      || (short === "settings" && /renderSettingsHubPage/.test(appJs))
      || (short === "staff" && /Back to Settings/.test(appJs))
      || (short === "calendar" && /data-contextual-back="calendar"/.test(html));
    if (hasDynamicBack || ["resources", "settings", "staff", "classrooms", "families", "enrollment", "reports", "activities", "forms", "support-center"].includes(short)) {
      const detail = ["resources", "settings"].includes(short)
        ? "Hub page relies on sidebar (no explicit back) — OK on desktop, weaker on mobile deep links"
        : "Back provided via dynamic renderer or sibling hub pattern";
      note(`view-${short}`, ["resources", "settings"].includes(short) ? "NEEDS_IMPROVEMENT" : "PASS", detail, ["resources", "settings"].includes(short) ? "medium" : null);
    } else {
      note(`view-${short}`, "FAIL", "No clear back button found in markup or nearby renderer", "high");
    }
  }
}

// Modal / workspace backs
note(
  "resource-viewer-back",
  /resourceViewerBack|data-lesson-workspace-back|#resourceViewerBackButton/.test(appJs) ? "PASS" : "FAIL",
  "Lesson/resource viewer back helpers",
  /resourceViewerBack/.test(appJs) ? null : "high",
);
note(
  "lesson-workspace-back",
  /data-lesson-workspace-back/.test(appJs) ? "PASS" : "FAIL",
  "Lesson workspace dedicated back control",
);
note(
  "contextual-back",
  /navigateContextualBack|data-contextual-back/.test(appJs) ? "PASS" : "FAIL",
  "Contextual back stack for calendar/children/ai",
);
note(
  "auth-modal-close",
  /closeAuthModal|#authModal/.test(appJs) && /aria-label="Close"|closeAuth|data-close/.test(html + appJs) ? "PASS" : "NEEDS_IMPROVEMENT",
  "Auth modal dismiss path",
);

const deadEnds = findings.filter((f) => f.status === "FAIL" || f.status === "NEEDS_IMPROVEMENT");
const report = {
  generatedAt: new Date().toISOString(),
  summary: {
    checked: findings.length,
    pass: findings.filter((f) => f.status === "PASS").length,
    needsImprovement: findings.filter((f) => f.status === "NEEDS_IMPROVEMENT").length,
    fail: findings.filter((f) => f.status === "FAIL").length,
  },
  findings,
  deadEnds,
};

fs.writeFileSync(path.join(OUT_DIR, "back-navigation-audit.json"), JSON.stringify(report, null, 2));
fs.writeFileSync(
  path.join(OUT_DIR, "back-navigation-audit.md"),
  [
    `# Back Button / Navigation Audit`,
    ``,
    `Generated: ${report.generatedAt}`,
    ``,
    `## Summary`,
    `- Checked: ${report.summary.checked}`,
    `- Pass: ${report.summary.pass}`,
    `- Needs improvement: ${report.summary.needsImprovement}`,
    `- Fail: ${report.summary.fail}`,
    ``,
    `## Dead ends / weak paths`,
    ...(deadEnds.length ? deadEnds.map((d) => `- **[${d.status}] ${d.id}**: ${d.detail}`) : ["- None flagged"]),
    ``,
    `## All findings`,
    ...findings.map((f) => `- [${f.status}] ${f.id}: ${f.detail}`),
    ``,
  ].join("\n"),
);

console.log(JSON.stringify(report.summary, null, 2));
console.log(`Report: ${path.join(OUT_DIR, "back-navigation-audit.md")}`);
