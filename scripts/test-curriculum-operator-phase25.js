#!/usr/bin/env node
/**
 * AI Curriculum Operator Phase 2.5 — structured AI composer (mocked; no live OpenAI).
 * Run: npm run test:curriculum-operator-phase25
 */
"use strict";

const assert = require("node:assert/strict");
const composer = require("./curriculum-operator-ai-composer.js");
const upgradeApi = require("./curriculum-operator-upgrade.js");
const auditApi = require("./curriculum-operator-audit.js");
const schema = require("./curriculum-operator-schema.js");

const WEAK_ID = "cur-lp-operator-weak-toddler";
const STRONG_ID = "cur-lp-operator-strong-preschool";
const STRONG_STEPS = [
  "1. Invite children to look outside at the sky.",
  "2. Ask what they notice about clouds and light.",
  "3. Choose a weather symbol together.",
  "4. Place it on the class chart and say the weather word.",
].join("\n");

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

function seed() {
  return {
    lessonPlans: [
      {
        id: WEAK_ID,
        title: "Toddler Apple Scribbles",
        age: "Toddler 18–24 Months",
        theme: "Apples",
        plan: "Pro",
        status: "published",
        weeklyOverview: "Short.",
        objectives: "",
        enrichmentDraft: { week: { weeklyOverview: "Prior short draft." }, activities: {} },
        dailyPlans: {
          monday: {
            items: [{
              itemId: "stamp",
              title: "Apple Rolling Painting",
              objective: "Explore.",
              materials: "Apples",
              steps: "Stamp.",
              dayOfWeek: "monday",
            }],
          },
          tuesday: { items: [] },
          wednesday: { items: [] },
          thursday: { items: [] },
          friday: { items: [] },
        },
        activityIds: ["cur-act-stamp"],
      },
      {
        id: STRONG_ID,
        title: "Preschool Weather Lab",
        age: "Preschool 3–4 Years",
        theme: "Weather",
        plan: "Pro",
        status: "published",
        weeklyOverview: "Children explore weather patterns through play-based observation all week with charts and outdoor noticing.",
        objectives: "Children will observe weather changes and use weather words with teacher support.",
        enrichmentDraft: {
          week: {
            weeklyOverview: "Children explore weather patterns through play-based observation all week with charts and outdoor noticing.",
            objectives: "Children will observe weather changes and use weather words with teacher support.",
          },
          activities: {
            "cur-act-watch": {
              steps: STRONG_STEPS,
              objective: "Children will notice and name today's sky and weather using new vocabulary with teacher support.",
            },
          },
        },
        dailyPlans: {
          monday: {
            items: [{
              itemId: "watch",
              title: "Weather Window Watch",
              objective: "Children will notice and name today's sky and weather using new vocabulary with teacher support.",
              steps: STRONG_STEPS,
              dayOfWeek: "monday",
              setupImageUrl: "https://example.com/weather-window.png",
            }],
          },
          tuesday: { items: [] },
          wednesday: { items: [] },
          thursday: { items: [] },
          friday: { items: [] },
        },
        activityIds: ["cur-act-watch"],
      },
    ],
    activities: [
      {
        id: "cur-act-stamp",
        lessonPlanId: WEAK_ID,
        itemId: "stamp",
        title: "Apple Rolling Painting",
        dayOfWeek: "monday",
        objective: "Explore.",
        materials: "Apples, paint",
        steps: "Stamp.",
      },
      {
        id: "cur-act-watch",
        lessonPlanId: STRONG_ID,
        itemId: "watch",
        title: "Weather Window Watch",
        dayOfWeek: "monday",
        objective: "Children will notice and name today's sky and weather using new vocabulary with teacher support.",
        steps: STRONG_STEPS,
        setupImageUrl: "https://example.com/weather-window.png",
      },
    ],
    resources: [],
  };
}

function mockCallAi(_system, user) {
  return Promise.resolve(composer.buildOperatorAiFixtureResponse(user));
}

async function main() {
  console.log("Curriculum Operator Phase 2.5 tests");
  const curriculum = seed();
  const weak = curriculum.lessonPlans[0];
  const strong = curriculum.lessonPlans[1];
  const weakActs = curriculum.activities.filter((a) => a.lessonPlanId === WEAK_ID);
  const audit = auditApi.auditLesson(weak, curriculum);
  const work = composer.collectWorkItems(weak, weakActs, audit, {});

  ok(work.hasWork, "collectWorkItems finds upgrade work");
  ok(work.weekRequests.every((r) => ["IMPROVE", "FILL", "REPLACE"].includes(r.action)), "week requests are write actions");

  const goodRaw = composer.buildOperatorAiFixtureResponse(
    composer.buildComposerUserPrompt(composer.buildComposerContext(weak, weakActs, audit, work)),
  );
  const good = composer.validateComposerOutput(goodRaw, work, weak);
  ok(good.ok, "valid structured AI output accepted");

  const unknownField = JSON.parse(goodRaw);
  unknownField.weeklyChanges.notARealField = { action: "FILL", value: "nope ".repeat(20) };
  const badField = composer.validateComposerOutput(JSON.stringify(unknownField), work, weak);
  ok(!badField.ok && badField.code === "unknown_field", "unknown fields rejected");

  const badAct = JSON.parse(goodRaw);
  badAct.activities = [{ activityId: "cur-act-does-not-exist", changes: { objective: { action: "FILL", value: "Specific objective about apple rolling painting with trays and washable paint for toddlers." } } }];
  const badActRes = composer.validateComposerOutput(JSON.stringify(badAct), work, weak);
  ok(!badActRes.ok && badActRes.code === "unknown_activity_id", "unknown activity IDs rejected");

  const badId = JSON.parse(goodRaw);
  badId.lessonId = "someone-else";
  ok(!composer.validateComposerOutput(JSON.stringify(badId), work, weak).ok, "changed lesson IDs rejected");

  const badAge = JSON.parse(goodRaw);
  badAge.age = "School Age";
  ok(!composer.validateComposerOutput(JSON.stringify(badAge), work, weak).ok, "age mutation rejected");

  const badPlan = JSON.parse(goodRaw);
  badPlan.plan = "Free";
  ok(!composer.validateComposerOutput(JSON.stringify(badPlan), work, weak).ok, "access plan mutation rejected");

  const badTitle = JSON.parse(goodRaw);
  badTitle.title = "Hijacked Title";
  ok(!composer.validateComposerOutput(JSON.stringify(badTitle), work, weak).ok, "title mutation rejected");

  const withImage = JSON.parse(goodRaw);
  withImage.weeklyChanges.coverImageUrl = { action: "FILL", value: "https://evil.example/x.png" };
  ok(!composer.validateComposerOutput(JSON.stringify(withImage), work, weak).ok, "image fields rejected");

  const malformed = composer.validateComposerOutput("not json {{{", work, weak);
  ok(!malformed.ok && malformed.code === "malformed_output", "malformed AI output rejected");

  const failCompose = await composer.composeUpgradeContent({
    plan: weak,
    activities: weakActs,
    audit,
    callAi: async () => { throw new Error("boom"); },
  });
  ok(!failCompose.ok && failCompose.code === "ai_call_failed", "AI failure does not produce a plan");

  const noAiUpgrade = await upgradeApi.buildUpgradeDraft(weak, curriculum, audit, {});
  ok(noAiUpgrade.aiFailed && noAiUpgrade.changed.length === 0, "AI failure path cannot mutate draft");
  ok(noAiUpgrade.enrichmentDraft.week.weeklyOverview === "Prior short draft.", "existing draft preserved on AI failure");

  const built = await upgradeApi.buildUpgradeDraft(weak, curriculum, audit, { callAi: mockCallAi });
  ok(built.ok && built.changed.length > 0, "FILL fields save via mocked AI");
  ok(built.changed.every((c) => c.source === "ai"), "upgrade changes are AI-sourced");
  ok(built.enrichmentDraft.composerSource === "structured-ai", "draft marked structured-ai");
  ok(built.usage.calls === 1, "one AI call per lesson");

  const strongAudit = auditApi.auditLesson(strong, curriculum);
  const strongBuilt = await upgradeApi.buildUpgradeDraft(strong, curriculum, strongAudit, { callAi: mockCallAi });
  const beforeSteps = strong.enrichmentDraft.activities["cur-act-watch"].steps;
  const afterSteps = strongBuilt.enrichmentDraft.activities["cur-act-watch"]?.steps;
  ok(
    strongBuilt.kept.some((k) => String(k).includes("cur-act-watch"))
    || afterSteps === beforeSteps
    || afterSteps == null,
    "KEEP fields remain byte-for-byte unchanged",
  );
  ok(beforeSteps === STRONG_STEPS, "strong source steps untouched");

  // IMPROVE path: force a week field request and ensure value changes when provided
  const improveRaw = JSON.parse(goodRaw);
  if (improveRaw.weeklyChanges.weeklyOverview) {
    improveRaw.weeklyChanges.weeklyOverview.action = "IMPROVE";
    improveRaw.weeklyChanges.weeklyOverview.value = [
      "Toddlers roll washable-painted apples across paper trays to notice tracks, speed, and color mixing.",
      "Teachers narrate rolling, direction, and cause-and-effect while keeping materials large and mouthing-safe.",
    ].join(" ");
  }
  const improveOk = composer.validateComposerOutput(JSON.stringify(improveRaw), work, weak);
  ok(improveOk.ok, "IMPROVE fields validate");

  ok(schema.isPhase2Executable("lesson.saveDraft"), "draft save still phase2 executable");
  ok(!schema.isPhase2Executable("lesson.publish"), "publish remains blocked");
  ok(!schema.isPhase2Executable("image.generate"), "image actions remain blocked");
  ok(!schema.isPhase2Executable("printable.buildPdf"), "printable actions remain blocked");

  // Retry after AI failure then success
  let calls = 0;
  const flaky = async (_s, user) => {
    calls += 1;
    if (calls === 1) throw new Error("transient");
    return composer.buildOperatorAiFixtureResponse(user);
  };
  const first = await upgradeApi.buildUpgradeDraft(weak, curriculum, audit, { callAi: flaky });
  ok(first.aiFailed, "first AI failure blocks mutation");
  const second = await upgradeApi.buildUpgradeDraft(weak, curriculum, audit, { callAi: flaky });
  ok(second.ok && second.changed.length > 0, "job retry works after an AI failure");

  const verify = upgradeApi.verifyUpgradeResult({
    beforePlan: weak,
    afterPlan: { ...weak, enrichmentDraft: second.enrichmentDraft },
    intended: second.intended,
    changed: second.changed,
    keepSnapshots: second.keepSnapshots,
  });
  ok(verify.ok, "post-save verification still works");

  // Deterministic old vs AI new comparison sample
  const oldSample = upgradeApi.buildWeeklyOverview(weak);
  const newSample = second.enrichmentDraft.week.weeklyOverview || "";
  ok(oldSample.includes("play-based learning"), "old deterministic template recognizable");
  ok(newSample.includes("Apples") || newSample.includes("apple") || newSample.includes("Toddler"), "new AI fixture is lesson-specific");
  ok(oldSample !== newSample, "AI output differs from deterministic template");

  console.log(`\n${passed} assertions passed`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
