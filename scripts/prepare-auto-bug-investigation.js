#!/usr/bin/env node
/**
 * Print a Cursor-safe investigation checklist for one automated bug record.
 * Local/testing only — never merges, deploys, or contacts users.
 *
 * Usage:
 *   node scripts/prepare-auto-bug-investigation.js --fixture
 *   LLH_STORE_PATH=... node scripts/prepare-auto-bug-investigation.js --id abug_...
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const model = require("./auto-bug-data-model.js");
const { investigationPlaybook, evaluateInvestigationStop } = require("./auto-bug-eligibility.js");
const { buildOwnerReportMarkdown } = require("./auto-bug-owner-report.js");

function loadStore() {
  const storePath = process.env.LLH_STORE_PATH || path.join(__dirname, "..", "server", "data", "launch-store.json");
  if (!fs.existsSync(storePath)) return { autoBugs: { records: {} } };
  return JSON.parse(fs.readFileSync(storePath, "utf8"));
}

function fixtureRecord() {
  const store = { autoBugs: { records: {} } };
  const { record } = model.ingestFailure(store, {
    errorType: "browser_exception",
    message: "TypeError: Cannot read properties of null (reading 'id')",
    page: "daily-care",
    role: "staff",
    device: "phone",
    deployedCommit: "abc1234deadbeef",
    testingEnvironment: "testing",
    sanitizedStack: "TypeError: Cannot read properties of null\n    at renderGrid (app.js:1234)",
    source: "browser",
    fakeOrganizationId: "org_fake_demo",
  });
  return record;
}

function main() {
  const args = process.argv.slice(2);
  const useFixture = args.includes("--fixture");
  const idIdx = args.indexOf("--id");
  const id = idIdx >= 0 ? args[idIdx + 1] : "";
  const playbook = investigationPlaybook();
  let record;
  if (useFixture) {
    record = model.publicRecord(fixtureRecord());
  } else {
    if (!id) {
      console.error("Provide --fixture or --id <bugId>");
      process.exit(1);
    }
    record = model.getRecord(loadStore(), id);
    if (!record) {
      console.error("Bug record not found:", id);
      process.exit(1);
    }
  }

  const stopProbe = evaluateInvestigationStop({});
  console.log(JSON.stringify({
    reminder: "Draft PR to testing only. Never merge, deploy, push main, or change production.",
    playbook,
    stopProbe,
    record,
    issueBody: model.githubIssueBody(record),
    ownerReportTemplate: buildOwnerReportMarkdown(record),
  }, null, 2));
}

main();
