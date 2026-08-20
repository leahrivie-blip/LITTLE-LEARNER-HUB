#!/usr/bin/env node
/**
 * AI Curriculum Operator Phase 1 — schema, audit, durable jobs (read-only).
 * Run: npm run test:curriculum-operator-phase1
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
const jobApi = require("./curriculum-operator-job.js");
const teachingKit = require("./teaching-kit.js");

const ROOT = path.join(__dirname, "..");
const PORT = 20570 + Math.floor(Math.random() * 80);
const STORE_PATH = path.join(os.tmpdir(), `llh-curriculum-operator-${crypto.randomBytes(4).toString("hex")}.json`);
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
const STRONG_ID = "cur-lp-operator-strong-preschool";
const WEATHER_ID = "cur-lp-preschool-weather-watchers";

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
  const todayStamp = now;
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
        updatedAt: todayStamp,
        createdAt: todayStamp,
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
          activities: {},
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
              steps: "1. Invite children to look outside.\n2. Ask what they notice.\n3. Choose a symbol together.\n4. Place it on the chart.",
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
        dailyPlans: {
          monday: { items: [{ itemId: "ww1", title: "Cloud Watching", dayOfWeek: "monday" }] },
          tuesday: { items: [] },
          wednesday: { items: [] },
          thursday: { items: [] },
          friday: { items: [] },
        },
        activityIds: ["cur-act-ww1"],
        updatedAt: todayStamp,
        createdAt: todayStamp,
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
        id: "cur-act-watch",
        lessonPlanId: STRONG_ID,
        itemId: "watch",
        title: "Weather Window Watch",
        dayOfWeek: "monday",
        objective: "Children will notice and name today's sky and weather using new vocabulary with teacher support.",
        description: "Children gather at the window, observe the sky, and help place a symbol on the class weather chart.",
        materials: "Weather chart, window view, weather symbols",
        setup: "Place the chart at child height near the window with three clear symbols ready.",
        steps: "1. Invite children to look outside.\n2. Ask what they notice.\n3. Choose a symbol together.\n4. Place it on the chart.",
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
  const flags = teachingKit.defaultTeachingKitFeatureFlags();
  ok(flags.teachingKitCurriculumOperator === false, "operator flag defaults false");
  ok(typeof teachingKit.isTeachingKitCurriculumOperatorEnabled === "function", "operator flag helper exported");

  const parsed = commandApi.parseOperatorCommand("Find the 10 weakest Toddler Pro lesson plans.", { phase: 1 });
  ok(parsed.command.scope.selection === "lowest_readiness", "weakest → lowest_readiness");
  ok(parsed.command.scope.plan === "Pro", "parses Pro");
  ok(parsed.command.scope.ageBand === "toddler", "parses toddler");
  ok(parsed.command.scope.count === 10, "parses count 10");
  ok(parsed.command.actions.publish === false, "phase1 strips publish");
  ok(parsed.command.actions.generateImages === false, "phase1 strips generateImages");
  ok(parsed.command.actions.saveDraft === false, "phase1 strips saveDraft");
  ok(parsed.command.completion.publish === false, "completion.publish false");
  ok(parsed.command.completion.phase === 1, "phase 1 recorded");

  const named = commandApi.parseOperatorCommand(
    "Check Weather Watchers and tell me everything that would need to be done to make it Ready to Publish.",
    { phase: 1 },
  );
  ok(named.command.scope.titles.some((t) => /weather watchers/i.test(t)), "extracts Weather Watchers title");
  ok(named.command.actions.validate === true, "ready-to-publish ask enables validate");
  ok(named.command.actions.saveDraft === false, "phase1 ready-to-publish ask stays audit-only");

  const today = commandApi.parseOperatorCommand("Audit the lessons we worked on today.", { phase: 1 });
  ok(today.command.scope.selection === "updated_today", "today → updated_today");

  const curriculum = seedCurriculum();
  const selected = selectApi.selectLessons(curriculum, parsed.command);
  ok(selected.selected.length >= 1, "selects at least one weak toddler pro lesson");
  ok(selected.selected[0].id === WEAK_ID, "weak toddler lesson ranked first for lowest readiness");

  const weakPlan = curriculum.lessonPlans.find((p) => p.id === WEAK_ID);
  const audit = auditApi.auditLesson(weakPlan, curriculum);
  ok(audit.phase1.mutationsApplied === false, "audit records no mutations");
  ok(audit.assetPlan.length >= 2, "asset plan covers activities");
  const stamp = audit.assetPlan.find((a) => /stamp/i.test(a.activityTitle));
  const cafe = audit.assetPlan.find((a) => /cafe|café/i.test(a.activityTitle));
  ok(stamp && stamp.image.decision === "GENERATE", "stamp painting recommends GENERATE image");
  ok(stamp && stamp.printable.decision === "NOT_NEEDED", "process art printable NOT_NEEDED");
  ok(cafe && cafe.printable.decision === "CREATE", "dramatic play recommends CREATE printable");
  ok(audit.printables.lessonResources.some((r) => r.decision === "REPLACE"), "generic zone sign flagged REPLACE");
  ok(Array.isArray(audit.recommendedFutureActions) && audit.recommendedFutureActions.some((a) => a.type === "image.generate"), "future image.generate planned");
  ok(audit.recommendedFutureActions.some((a) => a.mutation === true && a.type === "image.generate"), "future image.generate tagged as mutation");
  ok(audit.recommendedFutureActions.every((a) => typeof a.executableInPhase1 === "boolean"), "actions tagged with phase1 executability");
  ok(!audit.recommendedFutureActions.some((a) => a.type === "lesson.publish"), "publish omitted from recommended Phase 1 execution list");

  const verification = auditApi.verifyAuditAgainstPlan(weakPlan, audit);
  ok(verification.ok, "post-read verification passes");

  const cmd = schema.normalizeOperatorCommand({
    rawCommand: "upgrade and publish everything",
    actions: { publish: true, saveDraft: true, generateImages: true },
    completion: { publish: true },
  }, { phase: 1 });
  ok(cmd.actions.publish === false && cmd.actions.saveDraft === false && cmd.actions.generateImages === false, "normalize strips mutations in phase1");

  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  ok(serverJs.includes("/api/admin/curriculum/operator"), "operator route registered");
  ok(serverJs.includes("createCurriculumOperatorApi"), "operator API factory wired");
  ok(serverJs.includes("mergeStorePreserveCurriculumOperatorJobs"), "operator jobs preserved on store write");
  ok(appJs.includes("curriculum-ai-operator"), "admin tab id present");
  ok(appJs.includes("AI Curriculum Operator"), "admin label present");
  ok(indexHtml.includes("curriculum-operator-ui.js"), "operator UI script loaded");
  ok(schema.ACTION_TYPES.includes("printable.verify"), "future printable.verify in action catalog");
  ok(schema.ACTION_TYPES.includes("lesson.create"), "future lesson.create in action catalog");
  ok(schema.isPhase1Executable("lesson.audit"), "lesson.audit executable in phase1");
  ok(!schema.isPhase1Executable("lesson.publish"), "lesson.publish not executable in phase1");
}

async function assertHttpContracts() {
  console.log("HTTP contracts");
  const curriculum = seedCurriculum();
  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {},
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

  const beforeWeakOverview = curriculum.lessonPlans.find((p) => p.id === WEAK_ID).weeklyOverview;

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
      phase: 1,
      command: "Find the 10 weakest Toddler Pro lesson plans.",
    }, otherAuth);
    ok(denied.status === 403, "non-owner cannot run operator");

    const run = await requestJson("POST", "/api/admin/curriculum/operator", {
      action: "run",
      phase: 1,
      command: "Find the 10 weakest Toddler Pro lesson plans.",
    }, ownerAuth);
    ok(run.status === 200, "owner run succeeds");
    ok(run.json.curriculumUnchanged === true, "response asserts curriculum unchanged");
    ok(run.json.job?.status === "completed", "job completed");
    ok(run.json.job?.lessonResults?.length >= 1, "job audited lessons");
    ok(run.json.job?.lessonResults.every((lr) => lr.published === false), "no lesson marked published");
    ok(run.json.job?.mutationsEnabled === false, "mutationsEnabled false");
    const first = run.json.job.lessonResults[0];
    ok(first.audit?.assetPlan, "audit includes asset plan");
    ok(first.verification?.ok === true, "verification ok");

    const named = await requestJson("POST", "/api/admin/curriculum/operator", {
      action: "run",
      phase: 1,
      command: "Check Weather Watchers and tell me everything that would need to be done to make it Ready to Publish.",
    }, ownerAuth);
    ok(named.status === 200, "named lesson audit succeeds");
    ok(named.json.job?.lessonResults?.some((lr) => /weather watchers/i.test(lr.title || "")), "Weather Watchers selected");

    const listed = await requestJson("POST", "/api/admin/curriculum/operator", { action: "list" }, ownerAuth);
    ok(listed.status === 200 && listed.json.jobs.length >= 2, "jobs listed durably");

    const got = await requestJson("POST", "/api/admin/curriculum/operator", {
      action: "get",
      jobId: run.json.job.id,
    }, ownerAuth);
    ok(got.status === 200 && got.json.job.id === run.json.job.id, "get job by id");

    const storeAfter = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    const weakAfter = storeAfter.siteContent.curriculum.lessonPlans.find((p) => p.id === WEAK_ID);
    const strongAfter = storeAfter.siteContent.curriculum.lessonPlans.find((p) => p.id === STRONG_ID);
    ok(weakAfter.weeklyOverview === beforeWeakOverview, "weak lesson weeklyOverview unchanged");
    ok(weakAfter.objectives === "", "weak lesson objectives unchanged");
    ok(!weakAfter.enrichmentDraft, "weak lesson has no enrichment draft written by operator");
    ok(strongAfter.enrichmentDraft?.week?.weeklyOverview, "strong lesson draft preserved");
    ok(Array.isArray(storeAfter.curriculumOperatorJobs?.jobs)
      && storeAfter.curriculumOperatorJobs.jobs.length >= 1, "jobs persisted in store");
    ok(weakAfter.plan === "Pro" && weakAfter.status === "published", "access plan/status untouched");
    ok(storeAfter.curriculumOperatorJobs.jobs.every((j) => j.publishEnabled === false && j.mutationsEnabled === false), "stored jobs remain mutation-safe");
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
    if (stderr.includes("Error:") && !stderr.includes("DeprecationWarning")) {
      console.error(stderr.slice(-2000));
    }
  }
}

async function main() {
  console.log("Curriculum Operator Phase 1 tests");
  assertUnitContracts();
  await assertHttpContracts();
  console.log(`\n${passed} assertions passed`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
