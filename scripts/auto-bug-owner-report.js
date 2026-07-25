/**
 * Plain-language owner report for a prepared automated bug fix.
 */
"use strict";

const { cleanText } = require("./testing-sentry-sanitize.js");
const { publicRecord } = require("./auto-bug-data-model.js");

function buildOwnerReportMarkdown(recordInput = {}, extras = {}) {
  const record = publicRecord(recordInput) || recordInput || {};
  const inv = record.investigation || {};
  const report = record.ownerReport || {};
  const whatBroke = cleanText(extras.whatBroke || report.whatBroke || record.title || record.message, 500);
  const whoItAffects = cleanText(
    extras.whoItAffects
      || report.whoItAffects
      || `${record.roleCategory || "unknown"} role on ${record.page || "unknown page"}`
        + (record.affectsMultipleUsers ? " (seen across multiple testers/devices)" : " (single tester/device bucket so far)"),
    400,
  );
  const rootCause = cleanText(extras.rootCause || report.rootCause || inv.rootCause || "Not diagnosed yet.", 800);
  const whatChanged = cleanText(extras.whatChanged || report.whatChanged || inv.whatChanged || "No code change yet.", 800);
  const beforeScreenshot = cleanText(extras.beforeScreenshot || report.beforeScreenshot || inv.beforeScreenshot || "", 260);
  const afterScreenshot = cleanText(extras.afterScreenshot || report.afterScreenshot || inv.afterScreenshot || "", 260);
  const testResults = cleanText(extras.testResults || report.testResults || inv.testResults || "Not run yet.", 800);
  const draftPr = cleanText(extras.draftPrUrl || report.draftPrUrl || record.draftPrUrl || "", 260);
  const riskLevel = cleanText(extras.riskLevel || report.riskLevel || inv.riskLevel || "unknown", 40);

  return [
    "# Owner report — automated testing bug fix",
    "",
    "## What broke",
    whatBroke || "(unknown)",
    "",
    "## Who it affects",
    whoItAffects,
    "",
    "## Root cause",
    rootCause,
    "",
    "## What changed",
    whatChanged,
    "",
    "## Before / after screenshot",
    beforeScreenshot ? `- Before: ${beforeScreenshot}` : "- Before: (not attached)",
    afterScreenshot ? `- After: ${afterScreenshot}` : "- After: (not attached)",
    "",
    "## Test results",
    testResults,
    "",
    "## Draft PR",
    draftPr ? draftPr : "(none — investigation stopped or not started)",
    "",
    "## Risk level",
    riskLevel,
    "",
    "## Automation reminder",
    "- This PR targets **testing only**.",
    "- Nothing was merged or deployed automatically.",
    "- Production / main were not changed.",
    "",
    "## Decision needed",
    "**Approve merge to testing?**",
    "",
    "---",
    `Bug id: \`${record.id || "unknown"}\` · fingerprint: \`${record.fingerprint || ""}\` · commit when seen: \`${record.deployedCommit || ""}\``,
  ].join("\n");
}

module.exports = {
  buildOwnerReportMarkdown,
};
