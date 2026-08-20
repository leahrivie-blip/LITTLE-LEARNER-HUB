#!/usr/bin/env node
/**
 * AI Curriculum Operator Phase 2 — draft upgrades only (no publish/images/printables).
 * Run: npm run test:curriculum-operator-phase2
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const schema = require("./curriculum-operator-schema.js");
const commandApi = require("./curriculum-operator-command.js");
const selectApi = require("./curriculum-operator-select.js");
const auditApi = require("./curriculum-operator-audit.js");
const upgradeApi = require("./curriculum-operator-upgrade.js");
const composer = require("./curriculum-operator-ai-composer.js");
const jobApi = require("./curriculum-operator-job.js");
const { createCurriculumOperatorApi } = require("../server/curriculum-operator.js");

function mockCallAi(_system, user) {
  return Promise.resolve(composer.buildOperatorAiFixtureResponse(user));
}

const ROOT = path.join(__dirname, "..");
const PORT = 20650 + Math.floor(Math.random() * 80);
const STORE_PATH = path.join(os.tmpdir(), `llh-curriculum-operator-p2-${crypto.randomBytes(4).toString("hex")}.json`);
const OWNER = {
  email: "leahivie@icloud.com",
  password: "operator-pass",
  code: "operator-code",
};
const OTHER = {
  email: "other-admin@example.com",
  password: "operator-pass",
  code: "operator-code",
};

const WEAK_ID = "cur-lp-operator-weak-toddler";
const WEAK2_ID = "cur-lp-operator-weak-toddler-2";
const STRONG_ID = "cur-lp-operator-strong-preschool";
const WEATHER_ID = "cur-lp-preschool-weather-watchers";
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

function requestJson(method, urlPath, body, headers = {}) {
  const payload = body == null ? null : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1",
      port: PORT,
      path: urlPath,
      method,
      headers: {
        "Content-Type": "application/json",
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    }, (res) => {
      let raw = "";
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        let json = {};
        try { json = raw ? JSON.parse(raw) : {}; } catch (_e) { json = { raw }; }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function waitForHealth(child, attempts = 60) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = async () => {
      n += 1;
      if (child.exitCode != null) {
        reject(new Error(`Server exited early with ${child.exitCode}`));
        return;
      }
      try {
        const res = await requestJson("GET", "/api/health");
        if (res.status === 200) {
          resolve();
          return;
        }
      } catch (_e) { /* retry */ }
      if (n >= attempts) {
        reject(new Error("Server health timeout"));
        return;
      }
      setTimeout(tick, 250);
    };
    tick();
  });
}

function seedCurriculum() {
  const now = new Date().toISOString();
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
        weeklyMaterials: "",
        familyConnection: "",
        songs: [],
        books: [],
        resourceIds: ["cur-res-zone-sign"],
        enrichmentDraft: {
          week: { weeklyOverview: "Prior short draft overview for history snapshot." },
          activities: {},
          updatedAt: now,
        },
        dailyPlans: {
          monday: {
            theme: "Apples",
            items: [{
              itemId: "stamp",
              title: "Apple Stamp Painting",
              objective: "Explore.",
              description: "Let children play.",
              materials: "Apples, paint",
              setup: "Set up.",
              steps: "Stamp.",
              dayOfWeek: "monday",
            }, {
              itemId: "cafe",
              title: "Apple Café Dramatic Play",
              objective: "Children will learn about apples.",
              description: "Pretend cafe play.",
              materials: "Dishes",
              setup: "Set a table",
              steps: "Take orders",
              dayOfWeek: "monday",
            }],
          },
          tuesday: { items: [] },
          wednesday: { items: [] },
          thursday: { items: [] },
          friday: { items: [] },
        },
        activityIds: ["cur-act-stamp", "cur-act-cafe"],
        updatedAt: now,
        createdAt: now,
      },
      {
        id: WEAK2_ID,
        title: "Toddler Berry Baskets",
        age: "Toddler 18–24 Months",
        theme: "Berries",
        plan: "Pro",
        status: "published",
        weeklyOverview: "Tiny overview.",
        objectives: "",
        enrichmentDraft: {
          week: { weeklyOverview: "Berry draft starter." },
          activities: {},
          updatedAt: now,
        },
        dailyPlans: {
          monday: {
            items: [{
              itemId: "berry",
              title: "Berry Sort",
              objective: "Sort.",
              description: "Sort berries.",
              materials: "Pom poms",
              setup: "Bowls.",
              steps: "Sort.",
              dayOfWeek: "monday",
            }],
          },
          tuesday: { items: [] },
          wednesday: { items: [] },
          thursday: { items: [] },
          friday: { items: [] },
        },
        activityIds: ["cur-act-berry"],
        updatedAt: now,
        createdAt: now,
      },
      {
        id: STRONG_ID,
        title: "Preschool Weather Lab",
        age: "Preschool 3–4 Years",
        theme: "Weather",
        plan: "Pro",
        status: "published",
        weeklyOverview: "Children explore weather patterns through play-based observation, outdoor noticing walks, and classroom weather station routines that build vocabulary and scientific thinking all week.",
        objectives: "Children will observe weather changes, use weather words, and participate in simple charting with teacher support during outdoor and indoor play.",
        weeklyMaterials: "Thermometer · weather chart · scarves · cloud cotton · clipboards · crayons · books",
        familyConnection: "Invite families to notice today's weather together and share one outdoor observation at pickup.",
        observationOpportunities: "Listen for weather vocabulary and notice whether children can match clothing to conditions with support.",
        adaptations: "Offer shorter outdoor bursts and hand-over-hand charting help for younger preschoolers.",
        vocabularyWords: "sunny, cloudy, rainy, windy, thermometer",
        songs: [
          { title: "Weather Song", linkedWeekday: "monday", notes: "Morning circle" },
          { title: "Rain Patters", linkedWeekday: "tuesday" },
          { title: "Wind Whoosh", linkedWeekday: "wednesday" },
          { title: "Sun Shine Song", linkedWeekday: "thursday" },
          { title: "Cloud Watch", linkedWeekday: "friday" },
        ],
        books: [{ title: "Hello Weather", author: "Teacher Library", notes: "Ask what they see in the sky.", whyThisBook: "Clear weather photos." }],
        resourceIds: ["cur-res-weather-match"],
        enrichmentDraft: {
          week: {
            weeklyOverview: "Children explore weather patterns through play-based observation, outdoor noticing walks, and classroom weather station routines that build vocabulary and scientific thinking all week.",
            objectives: "Children will observe weather changes, use weather words, and participate in simple charting with teacher support during outdoor and indoor play.",
            teacherPreparation: "Prep the weather chart, gather outdoor clipboards, and preview clothing match cards before circle.",
            teacherToolkit: {
              prepChecklist: ["Charge tablet for photo", "Print clothing cards", "Set outdoor clipboard basket"],
              observationFocus: ["Weather vocabulary", "Clothing matching"],
              teacherPreparation: "Prep the weather chart and clothing cards.",
            },
            familyConnection: "Invite families to notice today's weather together and share one outdoor observation at pickup.",
            songs: [
              { title: "Weather Song", linkedWeekday: "monday" },
              { title: "Rain Patters", linkedWeekday: "tuesday" },
              { title: "Wind Whoosh", linkedWeekday: "wednesday" },
              { title: "Sun Shine Song", linkedWeekday: "thursday" },
              { title: "Cloud Watch", linkedWeekday: "friday" },
            ],
            books: [{ title: "Hello Weather", author: "Teacher Library", whyThisBook: "Clear weather photos.", notes: "Ask what they see." }],
          },
          activities: {
            "cur-act-watch": {
              steps: STRONG_STEPS,
              materials: "Weather chart, window view, weather symbols, clipboards",
              objective: "Children will notice and name today's sky and weather using new vocabulary with teacher support.",
              teacherLanguage: "What do you notice in the sky?\nHow does the air feel today?\nWhich symbol matches what we see?\nWhat clothing would help us stay comfortable?",
              safetyNotes: "Keep children a safe distance from the glass and supervise outdoor transitions.",
            },
          },
        },
        dailyPlans: {
          monday: {
            items: [{
              itemId: "watch",
              title: "Weather Window Watch",
              objective: "Children will notice and name today's sky and weather using new vocabulary with teacher support.",
              description: "Children gather at the window, observe the sky, and help place a symbol on the class weather chart.",
              materials: "Weather chart, window view, weather symbols",
              setup: "Place the chart at child height near the window with three clear symbols ready.",
              steps: STRONG_STEPS,
              dayOfWeek: "monday",
              setupImageUrl: "https://example.com/weather-window.png",
            }],
          },
          tuesday: { items: [{ itemId: "match", title: "Clothing Match", objective: "Children sort clothing cards to match sunny, rainy, and cold weather with teacher prompts.", description: "Small-group sorting with large picture cards.", materials: "Clothing cards, sorting mats", setup: "Lay three labeled mats.", steps: "Show a card and ask where it belongs.", dayOfWeek: "tuesday" }] },
          wednesday: { items: [] },
          thursday: { items: [] },
          friday: { items: [] },
        },
        activityIds: ["cur-act-watch", "cur-act-match"],
        updatedAt: "2026-01-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: WEATHER_ID,
        title: "Weather Watchers",
        age: "Preschool 3–4 Years",
        theme: "Weather",
        plan: "Pro",
        status: "draft",
        weeklyOverview: "A starter overview only.",
        objectives: "",
        enrichmentDraft: {
          week: { weeklyOverview: "Weather Watchers starter draft." },
          activities: {},
          updatedAt: now,
        },
        dailyPlans: {
          monday: { items: [{ itemId: "ww1", title: "Cloud Watching", dayOfWeek: "monday" }] },
          tuesday: { items: [] },
          wednesday: { items: [] },
          thursday: { items: [] },
          friday: { items: [] },
        },
        activityIds: ["cur-act-ww1"],
        updatedAt: now,
        createdAt: now,
      },
    ],
    activities: [
      {
        id: "cur-act-stamp",
        lessonPlanId: WEAK_ID,
        itemId: "stamp",
        title: "Apple Stamp Painting",
        dayOfWeek: "monday",
        objective: "Explore.",
        description: "Let children play.",
        materials: "Apples, paint, paper",
        setup: "Set up.",
        steps: "Stamp apples.",
        status: "published",
      },
      {
        id: "cur-act-cafe",
        lessonPlanId: WEAK_ID,
        itemId: "cafe",
        title: "Apple Café Dramatic Play",
        dayOfWeek: "monday",
        objective: "Children will learn about apples.",
        description: "Pretend cafe.",
        materials: "Dishes",
        setup: "Set a table",
        steps: "Take orders",
        status: "published",
      },
      {
        id: "cur-act-berry",
        lessonPlanId: WEAK2_ID,
        itemId: "berry",
        title: "Berry Sort",
        dayOfWeek: "monday",
        objective: "Sort.",
        description: "Sort berries.",
        materials: "Pom poms",
        setup: "Bowls.",
        steps: "Sort.",
        status: "published",
      },
      {
        id: "cur-act-watch",
        lessonPlanId: STRONG_ID,
        itemId: "watch",
        title: "Weather Window Watch",
        dayOfWeek: "monday",
        objective: "Children will notice and name today's sky and weather using new vocabulary with teacher support.",
        description: "Children gather at the window, observe the sky, and help place a symbol on the class weather chart.",
        materials: "Weather chart, window view, weather symbols",
        setup: "Place the chart at child height near the window with three clear symbols ready.",
        steps: STRONG_STEPS,
        setupImageUrl: "https://example.com/weather-window.png",
        status: "published",
      },
      {
        id: "cur-act-match",
        lessonPlanId: STRONG_ID,
        itemId: "match",
        title: "Clothing Match",
        dayOfWeek: "tuesday",
        objective: "Children sort clothing cards to match sunny, rainy, and cold weather with teacher prompts.",
        description: "Small-group sorting with large picture cards.",
        materials: "Clothing cards, sorting mats",
        setup: "Lay three labeled mats.",
        steps: "Show a card and ask where it belongs.",
        status: "published",
      },
      {
        id: "cur-act-ww1",
        lessonPlanId: WEATHER_ID,
        itemId: "ww1",
        title: "Cloud Watching",
        dayOfWeek: "monday",
        status: "draft",
      },
    ],
    resources: [
      { id: "cur-res-zone-sign", title: "Apple Zone Sign", category: "Printables", lessonPlanId: WEAK_ID, status: "draft" },
      { id: "cur-res-weather-match", title: "Weather Matching Cards", category: "Printables", lessonPlanId: STRONG_ID, activityId: "cur-act-match", status: "published" },
    ],
    updatedAt: now,
  };
}

function assertUnitContracts() {
  console.log("Unit contracts");
  ok(schema.isPhase2Executable("lesson.saveDraft"), "lesson.saveDraft executable in phase2");
  ok(schema.isPhase2Executable("lesson.validate"), "lesson.validate executable in phase2");
  ok(!schema.isPhase2Executable("lesson.publish"), "lesson.publish not executable in phase2");
  ok(!schema.isPhase2Executable("image.generate"), "image.generate not executable in phase2");
  ok(!schema.isPhase2Executable("printable.buildPdf"), "printable.buildPdf not executable in phase2");

  const fix = commandApi.parseOperatorCommand("Fix Weather Watchers.", { phase: 2 });
  ok(fix.command.intent === "fix_lesson", "Fix → fix_lesson");
  ok(fix.command.scope.selection === "named_titles", "Fix named title targeting");
  ok(fix.command.scope.titles.some((t) => /weather watchers/i.test(t)), "extracts Weather Watchers");
  ok(fix.command.actions.saveDraft === true, "upgrade enables saveDraft");
  ok(fix.command.actions.publish === false, "publish still blocked");
  ok(fix.command.actions.generateImages === false, "images still blocked");
  ok(fix.command.actions.generatePrintables === false, "printables still blocked");
  ok(fix.command.completion.phase === 2, "phase 2");
  ok(fix.command.completion.mutationsEnabled === true, "mutationsEnabled for draft upgrades");

  const batch = commandApi.parseOperatorCommand("Upgrade the 5 weakest Toddler Pro lessons.", { phase: 2 });
  ok(batch.command.intent === "upgrade_batch", "batch upgrade intent");
  ok(batch.command.scope.selection === "lowest_readiness", "batch lowest readiness");
  ok(batch.command.scope.count === 5, "batch count 5");
  ok(batch.command.scope.plan === "Pro" && batch.command.scope.ageBand === "toddler", "batch filters");

  const fill = commandApi.parseOperatorCommand("Fill the missing Teaching Kit fields in these lessons.", { phase: 2 });
  ok(fill.command.scope.selection === "missing_teaching_kit", "fill missing → missing_teaching_kit");
  ok(fill.command.actions.saveDraft === true, "fill missing saves draft");

  const curriculum = seedCurriculum();
  const namedSel = selectApi.selectLessons(curriculum, fix.command);
  ok(namedSel.selected.length === 1 && namedSel.selected[0].id === WEATHER_ID, "exact lesson targeting");

  const batchSel = selectApi.selectLessons(curriculum, batch.command);
  ok(batchSel.selected.length >= 2, "batch selects multiple toddler pro lessons");
  ok(batchSel.selected.every((r) => r.plan === "Pro" && r.ageBand === "toddler"), "batch targets toddler Pro only");

  const weakPlan = curriculum.lessonPlans.find((p) => p.id === WEAK_ID);
  const beforeAudit = auditApi.auditLesson(weakPlan, curriculum);

  return upgradeApi.buildUpgradeDraft(weakPlan, curriculum, beforeAudit, { callAi: mockCallAi }).then(async (built) => {
    ok(built.ok === true && !built.aiFailed, "weak lesson AI compose succeeds");
    ok(built.changed.length > 0, "weak lesson produces draft field changes");
    ok(built.mutations.publish === false, "upgrade plan never publishes");
    ok(built.mutations.images === false && built.mutations.printables === false, "no image/printable mutations planned");
    ok(built.mutations.accessPlan === false, "no access-plan mutation planned");
    ok(built.enrichmentDraft.week.objectives || built.enrichmentDraft.week.weeklyOverview, "fills weekly fields");
    ok(Object.keys(built.enrichmentDraft.activities || {}).length >= 1, "writes activity draft patches");
    const stampPatch = built.enrichmentDraft.activities["cur-act-stamp"] || built.enrichmentDraft.activities.stamp;
    ok(stampPatch && String(stampPatch.steps || "").length > 40, "fills weak activity steps substantially");
    ok(built.changed.every((c) => c.source === "ai"), "changes marked as AI-sourced");

    const noAi = await upgradeApi.buildUpgradeDraft(weakPlan, curriculum, beforeAudit, {});
    ok(noAi.aiFailed === true && noAi.changed.length === 0, "without callAi, refuses deterministic filler");

    const strongPlan = curriculum.lessonPlans.find((p) => p.id === STRONG_ID);
    const strongAudit = auditApi.auditLesson(strongPlan, curriculum);
    const strongBuilt = await upgradeApi.buildUpgradeDraft(strongPlan, curriculum, strongAudit, { callAi: mockCallAi });
    const watchPatch = strongBuilt.enrichmentDraft.activities["cur-act-watch"];
    ok(
      !watchPatch
      || watchPatch.steps === STRONG_STEPS
      || strongBuilt.kept.some((k) => String(k).includes("cur-act-watch")),
      "KEEP strong activity steps unchanged",
    );
    ok(strongPlan.enrichmentDraft.activities["cur-act-watch"].steps === STRONG_STEPS, "source strong steps untouched in plan object");

    const fakeAfter = {
      ...weakPlan,
      enrichmentDraft: built.enrichmentDraft,
      plan: "Pro",
      age: weakPlan.age,
      title: weakPlan.title,
    };
    const verification = upgradeApi.verifyUpgradeResult({
      beforePlan: weakPlan,
      afterPlan: fakeAfter,
      intended: built.intended,
      changed: built.changed,
      keepSnapshots: built.keepSnapshots,
    });
    ok(verification.ok, "post-save verification passes for intended draft");

    const status = upgradeApi.classifyOwnerReviewStatus({
      beforeScores: { premiumReadinessPercent: 20, completionPercent: 15 },
      afterScores: { premiumReadinessPercent: 80, completionPercent: 75, blocksPublish: false },
      verification: { ok: true },
      blockers: [],
    });
    ok(status === "READY_FOR_OWNER_REVIEW", "ready status when scores improve enough");

    const blocked = upgradeApi.classifyOwnerReviewStatus({
      beforeScores: { premiumReadinessPercent: 20 },
      afterScores: { premiumReadinessPercent: 30 },
      verification: { ok: false },
      blockers: [{ message: "fail" }],
    });
    ok(blocked === "BLOCKED", "blocked when verification fails");

    const phase1Norm = schema.normalizeOperatorCommand({
      actions: { saveDraft: true, upgradeLesson: true, publish: true },
    }, { phase: 1 });
    ok(phase1Norm.actions.saveDraft === false && phase1Norm.actions.publish === false, "phase1 still strips draft mutations");

    const phase2Norm = schema.normalizeOperatorCommand({
      intent: "upgrade_batch",
      actions: { saveDraft: true, upgradeLesson: true, publish: true, generateImages: true },
    }, { phase: 2 });
    ok(phase2Norm.actions.saveDraft === true && phase2Norm.actions.publish === false, "phase2 allows draft, blocks publish");
    ok(phase2Norm.actions.generateImages === false, "phase2 blocks images");

    // Partial failure isolation + resume (in-memory API)
    let store = {
      siteContent: {
        featureFlags: { teachingKitCurriculumOperator: true },
        curriculum: seedCurriculum(),
      },
      curriculumOperatorJobs: { jobs: [], updatedAt: "" },
    };
    const savedIds = [];
    const api = createCurriculumOperatorApi({
      readJson: async () => ({}),
      jsonResponse: () => {},
      readStore: () => store,
      writeStoreAsync: async (next) => { store = next; },
      requireTeachingKitOwnerAdminSession: () => ({ email: OWNER.email }),
      teachingKit: require("./teaching-kit.js"),
      normalizeEmail: (v) => String(v || "").trim().toLowerCase(),
      readSiteCurriculum: (s) => s.siteContent.curriculum,
      callOperatorAi: mockCallAi,
      openAiConfigured: true,
      saveOperatorEnrichmentDraft: async ({ lessonPlanId, enrichmentDraft }) => {
        if (lessonPlanId === WEAK2_ID) {
          return { ok: false, error: "simulated_save_failure" };
        }
        const plans = store.siteContent.curriculum.lessonPlans;
        const idx = plans.findIndex((p) => p.id === lessonPlanId);
        const prev = plans[idx];
        const versionId = `edraft-test-${lessonPlanId}`;
        const history = [
          {
            versionId,
            kind: "draft",
            note: "AI Curriculum Operator Phase 2 pre-upgrade snapshot",
            snapshot: { enrichmentDraft: prev.enrichmentDraft },
          },
          ...(Array.isArray(prev.enrichmentPublishHistory) ? prev.enrichmentPublishHistory : []),
        ];
        plans[idx] = {
          ...prev,
          enrichmentDraft: { ...enrichmentDraft, updatedAt: new Date().toISOString() },
          enrichmentPublishHistory: history,
        };
        savedIds.push(lessonPlanId);
        return { ok: true, lessonPlan: plans[idx], versionId, saveMode: "enrichment_draft" };
      },
    });

    const upgradeCmd = schema.normalizeOperatorCommand({
      rawCommand: "Upgrade these two lessons",
      intent: "upgrade_batch",
      scope: { selection: "explicit_ids", lessonIds: [WEAK_ID, WEAK2_ID], count: 2 },
      actions: { audit: true, upgradeLesson: true, upgradeActivities: true, saveDraft: true },
      completion: { phase: 2 },
    }, { phase: 2 });
    const planSummary = api.buildPlanSummary(
      upgradeCmd,
      selectApi.selectLessons(store.siteContent.curriculum, upgradeCmd),
    );
    let job = jobApi.createJobFromPlan({
      command: upgradeCmd,
      planSummary,
      createdBy: OWNER.email,
      status: "running",
    });
    const finished = await api.runJob(job, store, OWNER.email);
    ok(finished.progress.completed === 1, "partial failure keeps successful lesson");
    ok(finished.progress.failed === 1, "failed lesson recorded");
    ok(savedIds.includes(WEAK_ID) && !savedIds.includes(WEAK2_ID), "only successful lesson draft saved");
    const weakAfter = store.siteContent.curriculum.lessonPlans.find((p) => p.id === WEAK_ID);
    const weak2After = store.siteContent.curriculum.lessonPlans.find((p) => p.id === WEAK2_ID);
    ok(weakAfter.enrichmentDraft?.week?.objectives || weakAfter.enrichmentDraft?.activities, "lesson 1 draft persisted");
    ok(weak2After.enrichmentDraft?.week?.weeklyOverview === "Berry draft starter.", "lesson 2 unchanged after failure");
    ok(Array.isArray(weakAfter.enrichmentPublishHistory) && weakAfter.enrichmentPublishHistory[0]?.kind === "draft",
      "version/recovery history created for upgraded lesson");
    ok(finished.lessonResults.every((lr) => lr.published === false), "no publish path in lesson results");
    ok(finished.publishEnabled === false, "job publishEnabled false");

    const beforeResumeSaved = savedIds.length;
    finished.lessonResults = finished.lessonResults.map((lr) => (
      lr.lessonId === WEAK2_ID
        ? { ...lr, status: "pending", error: null, actions: lr.actions.map((a) => ({ ...a, status: "pending" })) }
        : lr
    ));
    const api2 = createCurriculumOperatorApi({
      readJson: async () => ({}),
      jsonResponse: () => {},
      readStore: () => store,
      writeStoreAsync: async (next) => { store = next; },
      requireTeachingKitOwnerAdminSession: () => ({ email: OWNER.email }),
      teachingKit: require("./teaching-kit.js"),
      normalizeEmail: (v) => String(v || "").trim().toLowerCase(),
      readSiteCurriculum: (s) => s.siteContent.curriculum,
      callOperatorAi: mockCallAi,
      openAiConfigured: true,
      saveOperatorEnrichmentDraft: async ({ lessonPlanId, enrichmentDraft }) => {
        const plans = store.siteContent.curriculum.lessonPlans;
        const idx = plans.findIndex((p) => p.id === lessonPlanId);
        const prev = plans[idx];
        plans[idx] = { ...prev, enrichmentDraft: { ...enrichmentDraft, updatedAt: new Date().toISOString() } };
        savedIds.push(lessonPlanId);
        return { ok: true, lessonPlan: plans[idx], versionId: `edraft-resume-${lessonPlanId}`, saveMode: "enrichment_draft" };
      },
    });
    const resumed = await api2.runJob(finished, store, OWNER.email);
    ok(resumed.progress.completed === 2, "resume completes remaining lesson");
    ok(savedIds.length === beforeResumeSaved + 1, "resume does not re-save already successful lesson");
    ok(savedIds.filter((id) => id === WEAK_ID).length === 1, "successful lesson not mutated again on resume");
  });
}

async function assertHttpContracts() {
  console.log("HTTP contracts");
  const curriculum = seedCurriculum();
  const beforeWeakOverview = curriculum.lessonPlans.find((p) => p.id === WEAK_ID).weeklyOverview;
  const beforeStrongImage = curriculum.activities.find((a) => a.id === "cur-act-watch").setupImageUrl;
  const beforeResource = JSON.stringify(curriculum.resources);
  const beforeStrongPlan = curriculum.lessonPlans.find((p) => p.id === STRONG_ID).plan;
  const beforeUsersMarker = { sentinel: true };

  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: beforeUsersMarker,
    siteContent: {
      featureFlags: {
        playBasedCurriculum: true,
        teachingKitCurriculumOperator: true,
      },
      curriculum,
      updatedAt: new Date().toISOString(),
    },
    curriculumOperatorJobs: { jobs: [], updatedAt: "" },
  }, null, 2));

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: "127.0.0.1",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      LLH_SKIP_STARTUP_CURRICULUM_SEED: "1",
      LLH_ENFORCE_TK_OWNER_ADMIN: "1",
      ADMIN_EMAIL: OWNER.email,
      ADMIN_PASSWORD: OWNER.password,
      ADMIN_ACCESS_CODE: OWNER.code,
      ADMIN_EMAILS: `${OWNER.email},${OTHER.email}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });

  try {
    await waitForHealth(child);
    const ownerLogin = await requestJson("POST", "/api/admin/login", OWNER);
    ok(ownerLogin.status === 200, "owner login");
    const ownerAuth = { Authorization: `Bearer ${ownerLogin.json.token || ownerLogin.json.adminToken}` };

    const otherLogin = await requestJson("POST", "/api/admin/login", OTHER);
    ok(otherLogin.status === 200, "other admin login");
    const otherAuth = { Authorization: `Bearer ${otherLogin.json.token || otherLogin.json.adminToken}` };

    const denied = await requestJson("POST", "/api/admin/curriculum/operator", {
      action: "run",
      phase: 2,
      command: "Fix Weather Watchers.",
    }, otherAuth);
    ok(denied.status === 403, "owner-only authorization");

    const beforeStore = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    ok(beforeStore.siteContent.curriculum.lessonPlans.length === 4, "safe fixture store has only test lessons (no catalog seed)");
    const weatherBefore = beforeStore.siteContent.curriculum.lessonPlans.find((p) => p.id === WEATHER_ID);
    const weatherStatusBefore = weatherBefore.status;
    const weatherOverviewBefore = weatherBefore.weeklyOverview;

    const fixRun = await requestJson("POST", "/api/admin/curriculum/operator", {
      action: "run",
      phase: 2,
      command: "Fix Weather Watchers.",
    }, ownerAuth);
    ok(fixRun.status === 200, "owner upgrade run succeeds");
    ok(fixRun.json.published === false && fixRun.json.publishEnabled === false, "publish remains blocked");
    ok(fixRun.json.draftOnly === true, "draftOnly true for upgrades");
    ok(fixRun.json.curriculumUnchanged === false, "curriculumUnchanged false when drafts saved");
    ok(fixRun.json.job?.status === "completed", "upgrade job completed");
    const weatherResult = fixRun.json.job.lessonResults.find((lr) => lr.lessonId === WEATHER_ID);
    ok(weatherResult, "Weather Watchers targeted exactly");
    ok(weatherResult.published === false, "lesson not published");
    ok(["READY_FOR_OWNER_REVIEW", "PARTIAL", "BLOCKED"].includes(weatherResult.ownerReviewStatus), "owner review status set");
    ok(weatherResult.upgradeVerification?.ok === true, "post-save reload verification ok");
    ok(weatherResult.beforeScores && weatherResult.afterScores, "before/after readiness present");
    ok(Array.isArray(weatherResult.updated) && weatherResult.updated.length > 0, "changed fields logged");
    ok(weatherResult.actions.some((a) => a.type === "lesson.saveDraft" && a.status === "success"), "draft save step ran");
    ok(weatherResult.actions.every((a) => a.type !== "lesson.publish"), "no publish step");
    ok(weatherResult.preSnapshotHistoryId, "version/recovery id present");

    const storeAfterFix = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    const weatherAfter = storeAfterFix.siteContent.curriculum.lessonPlans.find((p) => p.id === WEATHER_ID);
    ok(weatherAfter.status === weatherStatusBefore, "Weather Watchers status unchanged (not published)");
    ok(weatherAfter.enrichmentDraft?.week, "enrichment draft saved");
    ok(weatherAfter.weeklyOverview === weatherOverviewBefore, "published weeklyOverview body unchanged");
    ok(Array.isArray(weatherAfter.enrichmentPublishHistory)
      && weatherAfter.enrichmentPublishHistory.some((h) => h.kind === "draft"),
    "recovery history kind=draft");
    ok(!weatherAfter.enrichmentPublishHistory.some((h) => h.kind === "publish"), "no publish history entry");
    ok(storeAfterFix.siteContent.curriculum.lessonPlans.length === 4, "no live catalog lessons introduced or mutated");

    const batchRun = await requestJson("POST", "/api/admin/curriculum/operator", {
      action: "run",
      phase: 2,
      command: "Upgrade the 2 weakest Toddler Pro lessons.",
    }, ownerAuth);
    ok(batchRun.status === 200, "batch upgrade succeeds");
    ok(batchRun.json.job.lessonResults.length === 2, "batch lesson targeting count");
    ok(batchRun.json.job.lessonResults.every((lr) => /toddler/i.test(lr.title || "")), "batch toddler titles");
    ok(batchRun.json.job.lessonResults.every((lr) => lr.published === false), "batch not published");

    const keepRun = await requestJson("POST", "/api/admin/curriculum/operator", {
      action: "run",
      phase: 2,
      command: {
        rawCommand: "Improve weak activities but keep strong existing content.",
        intent: "fix_lesson",
        scope: { selection: "explicit_ids", lessonIds: [STRONG_ID], count: 1 },
        actions: { audit: true, upgradeLesson: true, upgradeActivities: true, saveDraft: true },
        completion: { phase: 2 },
      },
    }, ownerAuth);
    ok(keepRun.status === 200, "strong lesson upgrade run");
    const keepLr = keepRun.json.job.lessonResults[0];
    ok(keepLr.lessonId === STRONG_ID, "strong lesson targeted");
    const storeKeep = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    const strongAfter = storeKeep.siteContent.curriculum.lessonPlans.find((p) => p.id === STRONG_ID);
    ok(strongAfter.enrichmentDraft.activities["cur-act-watch"].steps === STRONG_STEPS, "KEEP strong steps unchanged in store");
    ok(strongAfter.plan === beforeStrongPlan, "access plan unchanged");
    const watchAct = storeKeep.siteContent.curriculum.activities.find((a) => a.id === "cur-act-watch");
    ok(watchAct.setupImageUrl === beforeStrongImage, "no image mutation");
    ok(JSON.stringify(storeKeep.siteContent.curriculum.resources) === beforeResource, "no printable/resource mutation");

    const weakAfterBatch = storeKeep.siteContent.curriculum.lessonPlans.find((p) => p.id === WEAK_ID);
    ok(weakAfterBatch.weeklyOverview === beforeWeakOverview, "published body weeklyOverview unchanged after draft upgrade");
    ok(weakAfterBatch.plan === "Pro" && weakAfterBatch.status === "published", "weak access plan/status untouched");
    ok(storeKeep.users?.sentinel === true, "unrelated production users object untouched");

    // Audit-only still does not mutate
    const auditOnly = await requestJson("POST", "/api/admin/curriculum/operator", {
      action: "run",
      phase: 2,
      command: "Find the 10 weakest Toddler Pro lesson plans.",
    }, ownerAuth);
    ok(auditOnly.status === 200 && auditOnly.json.curriculumUnchanged === true, "audit-only leaves curriculum unchanged flag");
    ok(auditOnly.json.draftOnly === false, "audit-only is not draftOnly");
    ok(auditOnly.json.job.mutationsEnabled === false, "audit-only mutationsEnabled false");

    // Example before/after from SAFE fixture
    const beforePct = weatherResult.beforeScores.premiumReadinessPercent;
    const afterPct = weatherResult.afterScores.premiumReadinessPercent;
    ok(Number.isFinite(beforePct) && Number.isFinite(afterPct), "fixture before/after readiness numeric");
    console.log(`  · SAFE fixture Weather Watchers readiness ${beforePct}% → ${afterPct}%`);
    console.log(`  · SAFE fixture changed fields: ${(weatherResult.updated || []).slice(0, 5).map((c) => c.path).join(", ")}`);

    ok(storeKeep.curriculumOperatorJobs.jobs.every((j) => j.publishEnabled === false), "all stored jobs publishEnabled false");
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
    if (stderr.includes("Error:") && !stderr.includes("DeprecationWarning")) {
      console.error(stderr.slice(-2000));
    }
  }
}

async function main() {
  console.log("Curriculum Operator Phase 2 tests");
  await assertUnitContracts();
  await assertHttpContracts();
  console.log(`\n${passed} assertions passed`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
