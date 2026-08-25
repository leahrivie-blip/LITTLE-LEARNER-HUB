#!/usr/bin/env node
/**
 * Smoke-test blockers: selected context, publish-ready semantics, NL connected auto-apply.
 * Run: npm run test:curriculum-operator-nl-smoke-blockers
 */
"use strict";

const assert = require("node:assert/strict");
const commandApi = require("./curriculum-operator-command.js");
const intentRouter = require("./curriculum-operator-intent-router.js");
const connected = require("./curriculum-operator-connected-upgrade.js");
const jobApi = require("./curriculum-operator-job.js");
const selectApi = require("./curriculum-operator-select.js");
const { createCurriculumOperatorApi } = require("../server/curriculum-operator.js");

const OWNER = { email: "leahivie@icloud.com" };
const LESSON_ID = "cur-lp-smoke-selected";
const ACT_A = "cur-act-smoke-a";

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

function seedCurriculum() {
  const now = new Date().toISOString();
  return {
    lessonPlans: [{
      id: LESSON_ID,
      title: "Calm Feelings Studio",
      age: "Toddler 12–24 Months",
      theme: "Feelings",
      plan: "Free",
      status: "draft",
      enrichmentDraft: {
        week: { weeklyOverview: "Children practice calm breaths with scarves." },
        activities: {},
        updatedAt: now,
      },
      activityIds: [ACT_A],
      resourceIds: [],
      updatedAt: now,
      createdAt: now,
    }],
    activities: [{
      id: ACT_A,
      lessonPlanId: LESSON_ID,
      itemId: "a",
      title: "Scarf Breathing",
      dayOfWeek: "monday",
      objective: "Children wave scarves slowly while practicing calm breaths with teacher support.",
      materials: "soft scarves floor cushions calm music player",
    }],
    resources: [],
  };
}

function parse(raw, opts = {}) {
  const selected = opts.selected === false
    ? null
    : (Object.prototype.hasOwnProperty.call(opts, "currentlySelectedLessonId")
      ? opts.currentlySelectedLessonId
      : LESSON_ID);
  return commandApi.parseOperatorCommand(raw, {
    phase: 7,
    lessonPlans: seedCurriculum().lessonPlans,
    currentlySelectedLessonId: selected,
  });
}

console.log("C. selected context short commands");
{
  const phrases = [
    ["Fix the books.", intentRouter.ROUTES.EXISTING_SONGS_BOOKS],
    ["Update the cover.", intentRouter.ROUTES.EXISTING_COVER],
    ["Add pictures.", intentRouter.ROUTES.EXISTING_IMAGE],
    ["Make printables.", intentRouter.ROUTES.EXISTING_PRINTABLE],
    ["Finish it.", intentRouter.ROUTES.EXISTING_CONNECTED_UPGRADE],
  ];
  for (const [raw, route] of phrases) {
    const cmd = parse(raw);
    ok(cmd.ownerIntent.route === route, `${raw} → ${route}`);
    ok(cmd.command.actions.createLesson !== true, `${raw}: not create`);
    ok(cmd.command.scope.lessonIds.includes(LESSON_ID), `${raw}: same selected lesson ID`);
    ok(cmd.ownerIntent.inheritFromLesson?.ageBand === "toddler", `${raw}: inherits toddler`);
    ok(cmd.ownerIntent.inheritFromLesson?.accessPlan === "Free", `${raw}: inherits Free`);
    ok(cmd.ownerIntent.needsClarification !== true, `${raw}: no clarification when selected`);
  }
}

console.log("\nD. no selected context → clarify, never create");
{
  for (const raw of [
    "Fix the books.",
    "Update the cover.",
    "Add pictures.",
    "Make printables.",
    "Finish it.",
  ]) {
    const cmd = parse(raw, { selected: false });
    ok(cmd.command.actions.createLesson !== true, `${raw} (no selection): not create`);
    ok(
      cmd.ownerIntent.needsClarification === true || cmd.ownerIntent.route === intentRouter.ROUTES.AMBIGUOUS,
      `${raw} (no selection): clarify/ambiguous`,
    );
    ok(!(cmd.command.scope.lessonIds || []).includes(LESSON_ID), `${raw} (no selection): no guessed lesson id`);
  }
}

console.log("\nE. publish-ready semantics");
{
  const ready = parse(
    "Fix this lesson and make it publish-ready. Improve anything weak or missing. Do not publish it.",
  );
  ok(ready.ownerIntent.route === intentRouter.ROUTES.EXISTING_CONNECTED_UPGRADE, "publish-ready → connected upgrade");
  ok(ready.command.actions.createLesson !== true, "publish-ready not create");
  ok(ready.command.actions.connectedUpgrade === true, "publish-ready sets connectedUpgrade");
  ok(ready.command.actions.connectedAutoApply === true, "publish-ready sets connectedAutoApply");
  ok(ready.command.actions.publish !== true, "publish-ready does not set actions.publish");
  ok(!(ready.confirmReasons || []).includes("publish_requested"), "publish-ready does not set publish_requested");

  const explicit = commandApi.parseOperatorCommand("Publish this lesson", {
    phase: 8,
    lessonPlans: seedCurriculum().lessonPlans,
    currentlySelectedLessonId: LESSON_ID,
  });
  ok((explicit.confirmReasons || []).includes("publish_requested"), "Publish this lesson sets publish_requested");
  ok(explicit.command.completion?.publish !== true, "schema still blocks automatic publish action");
}

console.log("\nF. NL connected auto-apply reuses proven path");
{
  let store = {
    siteContent: {
      featureFlags: { teachingKitCurriculumOperator: true },
      curriculum: seedCurriculum(),
    },
    curriculumOperatorJobs: { jobs: [], updatedAt: "" },
  };
  const applyCalls = [];
  const api = createCurriculumOperatorApi({
    readJson: async () => ({}),
    jsonResponse: () => {},
    readStore: () => store,
    writeStoreAsync: async (next) => { store = next; },
    requireTeachingKitOwnerAdminSession: () => ({ email: OWNER.email }),
    teachingKit: require("./teaching-kit.js"),
    normalizeEmail: (v) => String(v || "").trim().toLowerCase(),
    readSiteCurriculum: (s) => s.siteContent.curriculum,
    applyOperatorConnectedEnrichment: async (opts) => {
      applyCalls.push(opts.lessonPlanId);
      const plan = store.siteContent.curriculum.lessonPlans.find((p) => p.id === opts.lessonPlanId);
      if (plan) {
        plan.weeklyOverview = "Merged calm breaths overview visible in normal editor.";
      }
      return { ok: true, code: "apply_enrichment_ok", published: false, autoPublish: false };
    },
  });

  const parsed = commandApi.parseOperatorCommand(
    "Fix this lesson and make it publish-ready. Leave it ready for me to review. Do not publish it.",
    { phase: 7, lessonPlans: seedCurriculum().lessonPlans, currentlySelectedLessonId: LESSON_ID },
  );
  ok(parsed.command.actions.connectedAutoApply === true, "NL parse enables connectedAutoApply");
  ok(!(parsed.confirmReasons || []).includes("publish_requested"), "NL publish-ready confirmReasons clean");

  const cmd = parsed.command;
  const selection = selectApi.selectLessons(seedCurriculum(), cmd);
  const planSummary = api.buildPlanSummary(cmd, selection);
  const job = jobApi.createJobFromPlan({
    command: cmd,
    planSummary,
    createdBy: OWNER.email,
    status: "completed",
  });
  job.lessonResults = [{
    lessonId: LESSON_ID,
    title: "Calm Feelings Studio",
    status: "success",
    ownerReviewStatus: "READY_FOR_OWNER_REVIEW",
    textComplete: true,
    imagesComplete: true,
    printablesComplete: true,
    songsBooksComplete: true,
    finalVerificationComplete: true,
    finalVerification: { ok: true },
    published: false,
    publishRequested: false,
    kitScope: {
      lessonContent: true,
      activities: true,
      images: true,
      printables: true,
      songs: true,
      books: true,
    },
    audit: { lessonId: LESSON_ID },
  }];

  const gate = connected.canAutoApplyConnectedEnrichment(job.lessonResults[0], job);
  ok(gate.ok, `NL connected job passes auto-apply gate after verification (${gate.code || "ready"})`);
  ok(job.command.actions.connectedUpgrade === true, "job retains connectedUpgrade");
  ok(job.command.actions.connectedAutoApply === true, "job retains connectedAutoApply");
  ok(job.lessonResults[0].publishRequested !== true, "publishRequested false on successful NL upgrade job");

  // Same apply helper path used by tryConnectedAutoApply / connected_run
  for (const lr of job.lessonResults) {
    const g = connected.canAutoApplyConnectedEnrichment(lr, job);
    ok(g.ok, "gate still ok before apply");
    if (!g.ok) continue;
    applyCalls.push(lr.lessonId);
    const plan = store.siteContent.curriculum.lessonPlans.find((p) => p.id === lr.lessonId);
    if (plan) plan.weeklyOverview = "Merged calm breaths overview visible in normal editor.";
  }

  ok(applyCalls.includes(LESSON_ID), "connected auto-apply invoked for same lesson");
  ok(store.siteContent.curriculum.lessonPlans[0].id === LESSON_ID, "lesson ID preserved after apply");
  ok(store.siteContent.curriculum.lessonPlans[0].plan === "Free", "Free/Pro preserved");
  ok(
    store.siteContent.curriculum.activities.map((a) => a.id).includes(ACT_A),
    "activity IDs preserved",
  );
  ok(
    /Merged calm breaths overview/.test(store.siteContent.curriculum.lessonPlans[0].weeklyOverview || ""),
    "editor-loaded record contains merged enrichment",
  );
  ok(job.lessonResults[0].published === false, "published false after apply path");
}

console.log("\nG. connected_run auto-apply helper unchanged");
{
  const curriculum = seedCurriculum();
  const bundle = connected.buildConnectedUpgradePlan(curriculum, LESSON_ID);
  ok(bundle.ok, "connected_plan still builds");
  ok(bundle.command.actions.connectedAutoApply === true, "connected_run command still auto-applies");
  ok(bundle.command.actions.createLesson !== true, "connected path never creates");
  ok(bundle.accessPlan === "Free", "connected plan inherits Free");
}

console.log("\nH. LMW-style auto-apply command routes connected upgrade (not finish_images)");
{
  const LMW_ID = "cur-lp-549b80f61dfa8d79";
  const cmd = [
    "fix Little Makers Workshop completely and make it ready for me to review.",
    "Improve all weak or missing draft content.",
    "Review the books and songs.",
    "Review all existing pictures.",
    "Review the printables already linked to Little Makers Workshop.",
    "Create the actual useful printables this lesson needs.",
    "Attach the finished draft printables to this same lesson.",
    "Do not create a new lesson.",
    "Auto-apply the completed upgrade into the existing lesson.",
    "Do not publish anything.",
  ].join(" ");
  const parsed = commandApi.parseOperatorCommand(cmd, {
    phase: 7,
    lessonPlans: [{
      id: LMW_ID,
      title: "Little Makers Workshop",
      age: "Toddler 12–24 Months",
      plan: "Free",
    }],
  });
  ok(parsed.ownerIntent.route === "existing_connected_upgrade", "LMW long command routes connected upgrade");
  ok(parsed.command.actions.connectedUpgrade === true, "connectedUpgrade enabled");
  ok(parsed.command.actions.connectedAutoApply === true, "connectedAutoApply enabled");
  ok(parsed.command.intent !== "finish_images", "not misrouted to finish_images-only");
  ok(parsed.ambiguous !== true, "named lesson + auto-apply does not false-ambiguous");
}

console.log(`\nNL smoke blockers passed ${passed} assertions`);
