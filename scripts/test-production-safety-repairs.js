#!/usr/bin/env node
"use strict";

/**
 * Regression guard for production-safety repairs.
 * This test is deliberately static: it validates the deployed shell cannot pin
 * the repaired Print Center to an older implementation while offline.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const index = read("index.html");
const worker = read("service-worker.js");
const viewer = read("scripts/teaching-kit-viewer.js");
const app = read("app.js");
const comms = read("comms-center.js");
const server = read("server/index.js");
const onboarding = read("scripts/new-user-onboarding.js");

function indexedAsset(relativePath) {
  const match = index.match(new RegExp(`${relativePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\?v=([^"']+)`));
  assert.ok(match, `index is missing ${relativePath}`);
  return `/${relativePath}?v=${match[1]}`;
}

for (const asset of [
  "styles.css",
  "scripts/teaching-kit-printable-pdf-merge.js",
  "scripts/teaching-kit-binder-pdf.js",
  "scripts/teaching-kit-viewer.js",
]) {
  assert.ok(worker.includes(indexedAsset(asset)), `service worker must precache the active ${asset}`);
}

assert.match(viewer, /Preview could not be generated\. Try again or select a smaller section\./);
assert.match(viewer, /Promise\.resolve\(ctx\.onPrint\(payload\)\)\.then/);
assert.match(app, /"Colors": "Color sorting trays,[^"]*large colorful scarves/);
assert.doesNotMatch(app, /"Colors": "[^"]*ribbon/i);
assert.match(app, /const libraryPending = !published\.length/);
assert.match(app, /Loading lesson plans…/);
assert.match(app, /function isFreeAccessibleCurriculumPlan/);
assert.match(app, /isCuratedFreeCurriculumPlan\(planOrResource\)/);
assert.match(server, /isStoreCuratedFreeLessonPlan\(entry, accessContext\.store \|\| accessContext\.siteContent\)/);
assert.match(server, /publishedFreePlanRecordCount: freeCurriculumSample\.countPublishedFreePlanRecords/);
assert.doesNotMatch(server, /canonicalFreePublishedCount/);
assert.match(comms, /AbortController/);
assert.match(comms, /What’s New took too long to load\. Please try again\./);
assert.match(comms, /data-retry-changelog/);
assert.match(app, /"privacy-settings": "Privacy Settings \| Little Learner Hub by Leah"/);
assert.match(app, /window\.LLHGoogleConsent\?\.open\?\.\(\)/);
assert.match(app, /lessonLibraryMode === "saved" && !favorites\.includes\(resource\.id\)/);
assert.match(app, /memberUpdateBannerDismissKey/);
assert.match(app, /NewUserOnboarding\?\.maybeResumeOnBoot\?\.\(\)/);
assert.match(onboarding, /function accountScopedKey/);
assert.match(onboarding, /readJson\(accountScopedKey\(VALUE_MOMENTS_KEY\)/);

console.log("Production-safety repair regression checks passed.");
