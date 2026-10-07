#!/usr/bin/env node
"use strict";

const {
  auditActivityContentQuality,
  collectActivityQualityErrors,
} = require("./lib/owner-lesson-complete/content-quality.js");
const { expandActivityForOwnerQuality } = require("./lib/owner-lesson-complete/expand-activity-quality.js");

function ok(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("ok:", msg);
  }
}

const thin = {
  id: "cur-act-test",
  title: "Mirror Me",
  activityCategory: "Open-Ended Exploration",
  objective: "Children will learn about themselves.",
  description: "Children will explore mirrors.",
  materials: "Mirror",
  preparation: "Get mirrors.",
  setup: "Set up materials.",
  steps: "1. Look",
  teacherLanguage: "What do you see?",
  observationOpportunities: "Looks.",
  safetyNotes: "Supervise children.",
  cleanupTips: "Clean up.",
  teacherTips: [],
  substitutions: [],
  adaptations: "",
  extensions: "",
  vocabulary: "me",
  mixedAgeAdaptations: "",
};

const thinAudit = auditActivityContentQuality(thin);
ok(thinAudit.ok === false, "thin activity fails quality");
ok(thinAudit.thin.length + thinAudit.blank.length > 5, "thin activity reports multiple issues");

const expanded = expandActivityForOwnerQuality(thin);
const preview = {
  ...thin,
  ...expanded,
  vocabulary: Array.isArray(expanded.vocabulary) ? expanded.vocabulary.join(", ") : expanded.vocabulary,
};
const after = auditActivityContentQuality(preview);
ok(after.ok === true, `expanded thin activity passes (${[...after.blank, ...after.thin].join("; ") || "none"})`);

const good = {
  ...preview,
  description: `${preview.description} Extra sentence confirming children can repeat the invitation calmly with teacher narration and short turns.`,
};
ok(auditActivityContentQuality(good).ok === true, "good activity stays complete");

const dupes = collectActivityQualityErrors([
  { ...good, title: "A", description: good.description },
  { ...good, title: "B", description: good.description },
  { ...good, title: "C", description: good.description },
]);
ok(dupes.errors.some((e) => /identical description/i.test(e)), "detects copied descriptions across activities");

console.log(process.exitCode ? "FAILED" : "PASSED");
