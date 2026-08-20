#!/usr/bin/env node
/**
 * Enrichment Publish → curriculum.activities Core projection sync.
 *
 * Proves successful publish_enrichment updates the matching touched
 * curriculum.activities row (cur-act-*) with all owned Core fields, while:
 * - Save Draft does not touch B-store
 * - Failed Publish is atomic on A + B
 * - Untouched sibling activity rows keep object/byte identity
 * - Partial Core edits do not wipe unrelated B-store fields
 *
 * Run: npm run test:owner-tk-publish-activity-projection-sync
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const os = require("node:os");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const PORT = 7940 + Math.floor(Math.random() * 100);
const STORE_PATH = path.join(os.tmpdir(), `llh-owner-tk-proj-sync-${crypto.randomBytes(4).toString("hex")}.json`);
const OWNER = {
  email: "leahivie@icloud.com",
  password: "owner-tk-proj-sync-pass",
  code: "owner-tk-proj-sync-code",
};

const FIXTURE = "cur-lp-owner-tk-proj-sync";
const SIBLING = "cur-lp-owner-tk-proj-sync-sib";
const REAL_A = "cur-lp-preschool-all-about-me";
const REAL_B = "cur-lp-toddler-amazing-apples";
const REAL_C = "cur-lp-preschool-farm-animals";

const ACT_EDIT_ITEM = "item-proj-sync-edit";
const ACT_EDIT_SYNC = "cur-act-test-001";
const ACT_LEGACY_ITEM = "item-proj-sync-legacy";
const ACT_LEGACY_SYNC = "cur-act-test-legacy";
const ACT_CANON_ITEM = "item-proj-sync-canon";
const ACT_CANON_SYNC = "cur-act-test-canon";
const ACT_PARTIAL_ITEM = "item-proj-sync-partial";
const ACT_PARTIAL_SYNC = "cur-act-test-partial";
const ACT_BAD_CAT_SYNC = "cur-act-cat-allowlist-bad";
const ACT_LANG_CAT_SYNC = "cur-act-cat-allowlist-lang";

const CORE = {
  title: "PROJ_NAME_Distinct",
  dayOfWeek: "wednesday",
  // Allow-listed play category — shared normalizedCurriculumActivity must keep these.
  activityCategory: "Literacy",
  ageModifications: "PROJ_AGE_Preschool",
  durationMinutes: 27,
  objective: "PROJ_OBJ_Distinct",
  description: "PROJ_DESC_P1.\n\nPROJ_DESC_P2.",
  materials: "PROJ_MAT_alpha\nPROJ_MAT_beta",
  preparation: "PROJ_PREP_Distinct",
  setup: "PROJ_SETUP_Distinct",
  steps: "1. PROJ_STEP_one\n2. PROJ_STEP_two\n3. PROJ_STEP_three",
  teacherLanguage: "PROJ_Q_Distinct?",
  observationOpportunities: "PROJ_OBS_Distinct",
  safetyNotes: "PROJ_SAFE_Distinct",
  cleanupTips: "PROJ_CLEAN_Distinct",
};

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}
function fp(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
}

function requestJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: "127.0.0.1",
      port: PORT,
      path: urlPath,
      method,
      headers: {
        ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForHealth(child) {
  for (let i = 0; i < 120; i += 1) {
    if (child.exitCode != null) throw new Error(`server exited ${child.exitCode}`);
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("health timeout");
}

function readStore() {
  return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
}
function plan(store, id) {
  return (store?.siteContent?.curriculum?.lessonPlans || []).find((p) => p.id === id) || null;
}
function activity(store, id) {
  return (store?.siteContent?.curriculum?.activities || []).find((a) => a.id === id) || null;
}
function findItem(planObj, itemId) {
  for (const day of Object.keys(planObj?.dailyPlans || {})) {
    const hit = (planObj.dailyPlans[day]?.items || []).find((i) => i && i.itemId === itemId);
    if (hit) return { day, item: hit };
  }
  return null;
}

function assertCoreOn(target, label) {
  ok(target?.title === CORE.title, `${label}: title`);
  ok(String(target?.dayOfWeek).toLowerCase() === "wednesday", `${label}: dayOfWeek`);
  ok(target?.activityCategory === CORE.activityCategory, `${label}: activityCategory`);
  ok(target?.ageModifications === CORE.ageModifications, `${label}: ageModifications`);
  ok(Number(target?.durationMinutes) === Number(CORE.durationMinutes), `${label}: durationMinutes`);
  ok(target?.objective === CORE.objective, `${label}: objective`);
  ok(String(target?.description) === CORE.description, `${label}: description`);
  ok(String(target?.materials) === CORE.materials, `${label}: materials`);
  ok(String(target?.preparation) === CORE.preparation, `${label}: preparation`);
  ok(target?.setup === CORE.setup, `${label}: setup`);
  ok(String(target?.steps) === CORE.steps, `${label}: steps`);
  ok(target?.teacherLanguage === CORE.teacherLanguage, `${label}: teacherLanguage`);
  ok(target?.observationOpportunities === CORE.observationOpportunities, `${label}: observationOpportunities`);
  ok(target?.safetyNotes === CORE.safetyNotes, `${label}: safetyNotes`);
  ok(String(target?.cleanupTips) === CORE.cleanupTips, `${label}: cleanupTips`);
}

function buildStore() {
  const edited = {
    itemId: ACT_EDIT_ITEM,
    title: "Seed Title",
    dayOfWeek: "monday",
    activityCategory: "Literacy",
    objective: "SEED_OBJ",
    description: "SEED_DESC",
    materials: "SEED_MAT",
    preparation: "SEED_PREP",
    setup: "SEED_SETUP",
    steps: ["Seed A", "Seed B"],
    teacherLanguage: "SEED_Q?",
    observationOpportunities: "SEED_OBS",
    safetyNotes: "SEED_SAFE",
    cleanupTips: "SEED_CLEAN",
    ageModifications: "SEED_AGE",
    durationMinutes: 10,
    setupImageUrl: "/images/lesson-covers/default.svg",
    exampleImageUrl: "/images/lesson-covers/default.svg",
    teacherTips: ["KEEP_TIP"],
    settingTags: ["small_group"],
    customLegacy: { marker: "edit-custom", nested: [null, 0, "x"] },
    nullField: null,
    unknownField: "edit-unknown",
    sourceKey: `${FIXTURE}:${ACT_EDIT_ITEM}`,
  };
  const legacy = {
    itemId: ACT_LEGACY_ITEM,
    title: "Legacy Sibling",
    dayOfWeek: "tuesday",
    activityCategory: "Sensory",
    objective: "LEGACY_OBJ",
    description: "Legacy desc",
    prep: "LEGACY_PREP",
    directions: ["L1", "L2", "L3"],
    cleanup: "LEGACY_CLEAN",
    materials: ["lm-a", "lm-b"],
    unknownField: "legacy-unknown",
    customNested: { a: 1, b: [null, 0, "y"] },
    nullField: null,
    setupImageUrl: "/images/lesson-covers/default.svg",
    sourceKey: `${FIXTURE}:${ACT_LEGACY_ITEM}`,
  };
  const canon = {
    itemId: ACT_CANON_ITEM,
    title: "Canon Sibling",
    dayOfWeek: "wednesday",
    activityCategory: "Fine Motor",
    objective: "CANON_OBJ",
    description: "Canon desc",
    materials: ["c-a"],
    preparation: "CANON_PREP",
    steps: "1. Canon",
    durationMinutes: 0,
    unknownField: "canon-unknown",
    nullField: null,
    setupImageUrl: "/images/lesson-covers/default.svg",
    sourceKey: `${FIXTURE}:${ACT_CANON_ITEM}`,
  };
  const partial = {
    itemId: ACT_PARTIAL_ITEM,
    title: "Partial Keep Title",
    dayOfWeek: "thursday",
    activityCategory: "Art",
    objective: "PARTIAL_SEED_OBJ",
    description: "PARTIAL_SEED_DESC",
    materials: ["partial-mat-a", "partial-mat-b"],
    preparation: "PARTIAL_SEED_PREP",
    setup: "PARTIAL_SEED_SETUP",
    steps: ["Partial step 1", "Partial step 2"],
    teacherLanguage: "PARTIAL_SEED_Q?",
    observationOpportunities: "PARTIAL_SEED_OBS",
    safetyNotes: "PARTIAL_SEED_SAFE",
    cleanupTips: "PARTIAL_SEED_CLEAN",
    ageModifications: "PARTIAL_SEED_AGE",
    durationMinutes: 12,
    setupImageUrl: "/images/lesson-covers/default.svg",
    exampleImageUrl: "/images/lesson-covers/default.svg",
    teacherTips: ["PARTIAL_TIP"],
    customLegacy: { marker: "partial-custom" },
    nullField: null,
    unknownField: "partial-unknown",
    sourceKey: `${FIXTURE}:${ACT_PARTIAL_ITEM}`,
  };
  const fri = {
    itemId: "item-proj-sync-fri",
    title: "Fri filler",
    dayOfWeek: "friday",
    objective: "o",
    description: "d",
    materials: "m",
    steps: "1. f",
    sourceKey: `${FIXTURE}:item-proj-sync-fri`,
  };

  function row(syncId, item, day) {
    return {
      id: syncId,
      lessonPlanId: FIXTURE,
      itemId: item.itemId,
      sourceKey: item.sourceKey,
      title: item.title,
      dayOfWeek: day,
      activityCategory: item.activityCategory || "",
      objective: item.objective || "",
      description: item.description || "",
      materials: item.materials,
      preparation: item.preparation || item.prep || "",
      setup: item.setup || "",
      steps: item.steps || item.directions || "",
      teacherLanguage: item.teacherLanguage || "",
      observationOpportunities: item.observationOpportunities || "",
      safetyNotes: item.safetyNotes || "",
      cleanupTips: item.cleanupTips || item.cleanup || "",
      ageModifications: item.ageModifications || "",
      durationMinutes: item.durationMinutes,
      status: "published",
      setupImageUrl: item.setupImageUrl || "",
      exampleImageUrl: item.exampleImageUrl || "",
      teacherTips: item.teacherTips || [],
      settingTags: item.settingTags || [],
      customLegacy: item.customLegacy,
      nullField: item.nullField,
      unknownField: item.unknownField,
      customNested: item.customNested,
    };
  }

  return {
    users: {},
    adminSessions: {},
    siteContent: {
      updatedAt: "2026-01-08T00:00:00.000Z",
      featureFlags: {
        teachingKitViewer: true,
        teachingKitPrintCenter: true,
        teachingKitEnrichmentEditor: true,
        teachingKitAttachments: true,
        playBasedCurriculum: true,
        projSyncMarker: "activity-projection-sync",
      },
      curriculum: {
        updatedAt: "2026-01-08T00:00:00.000Z",
        lessonPlans: [
          {
            id: FIXTURE,
            title: "Owner TK Projection Sync Disposable",
            age: "Preschool",
            theme: "ProjSync",
            plan: "Pro",
            status: "published",
            weeklyOverview: "PROJ_SYNC_OVERVIEW",
            publishedAt: "2026-01-01T00:00:00.000Z",
            disposableQaFixture: true,
            resourceIds: ["cur-res-proj-sync-pub"],
            dailyPlans: {
              monday: { items: [edited] },
              tuesday: { items: [legacy] },
              wednesday: { items: [canon] },
              thursday: { items: [partial] },
              friday: { items: [fri] },
            },
          },
          {
            id: SIBLING,
            title: "Proj Sync Sibling",
            age: "Toddler",
            theme: "Sib",
            plan: "Pro",
            status: "published",
            weeklyOverview: "SIB",
            publishedAt: "2026-01-01T00:00:00.000Z",
            disposableQaFixture: true,
            dailyPlans: {
              monday: { items: [{ itemId: "item-proj-sib", title: "Sib", dayOfWeek: "monday", objective: "sib", description: "sib", materials: "sib", steps: "1. Sib" }] },
              tuesday: { items: [] }, wednesday: { items: [] }, thursday: { items: [] }, friday: { items: [] },
            },
          },
          {
            id: REAL_A, title: "All About Me (protected stub)", age: "Preschool", theme: "P", plan: "Pro", status: "published", weeklyOverview: "A",
            dailyPlans: { monday: { items: [{ itemId: "real-a-1", title: "A", dayOfWeek: "monday", objective: "r", description: "r", materials: "r", steps: "1. r", setupImageUrl: "/images/lesson-covers/all-about-me.svg" }] }, tuesday: { items: [] }, wednesday: { items: [] }, thursday: { items: [] }, friday: { items: [] } },
          },
          {
            id: REAL_B, title: "Amazing Apples (protected stub)", age: "Toddler", theme: "P", plan: "Pro", status: "published", weeklyOverview: "B",
            dailyPlans: { monday: { items: [{ itemId: "real-b-1", title: "B", dayOfWeek: "monday", objective: "r", description: "r", materials: "r", steps: "1. r", exampleImageUrl: "/images/lesson-covers/amazing-apples.svg" }] }, tuesday: { items: [] }, wednesday: { items: [] }, thursday: { items: [] }, friday: { items: [] } },
          },
          {
            id: REAL_C, title: "Farm Animals (protected stub)", age: "Preschool", theme: "P", plan: "Pro", status: "published", weeklyOverview: "C",
            dailyPlans: { monday: { items: [{ itemId: "real-c-1", title: "C", dayOfWeek: "monday", objective: "r", description: "r", materials: "r", steps: "1. r" }] }, tuesday: { items: [] }, wednesday: { items: [] }, thursday: { items: [] }, friday: { items: [] } },
          },
        ],
        activities: [
          row(ACT_EDIT_SYNC, edited, "monday"),
          row(ACT_LEGACY_SYNC, legacy, "tuesday"),
          row(ACT_CANON_SYNC, canon, "wednesday"),
          row(ACT_PARTIAL_SYNC, partial, "thursday"),
          row("cur-act-proj-fri", fri, "friday"),
          { id: "cur-act-proj-sib", lessonPlanId: SIBLING, itemId: "item-proj-sib", title: "Sib", dayOfWeek: "monday", objective: "sib", status: "published" },
          // Store may historically hold non-allow-list strings; DTO/read must still fall back.
          {
            id: ACT_BAD_CAT_SYNC,
            lessonPlanId: FIXTURE,
            itemId: "item-cat-allowlist-bad",
            title: "Bad Cat Probe",
            dayOfWeek: "tuesday",
            activityCategory: "NotARealCategory!!!",
            objective: "bad-cat-obj",
            status: "published",
            sourceKey: `${FIXTURE}:item-cat-allowlist-bad`,
          },
          {
            id: ACT_LANG_CAT_SYNC,
            lessonPlanId: FIXTURE,
            itemId: "item-cat-allowlist-lang",
            title: "Language Cat Probe",
            dayOfWeek: "tuesday",
            activityCategory: "Language",
            objective: "lang-cat-obj",
            status: "published",
            sourceKey: `${FIXTURE}:item-cat-allowlist-lang`,
          },
        ],
        resources: [
          { id: "cur-res-proj-sync-pub", title: "Proj sync printable", type: "printable", status: "published", lessonPlanIds: [FIXTURE] },
        ],
      },
    },
  };
}

async function main() {
  const teachingKit = require(path.join(ROOT, "scripts/teaching-kit.js"));
  fs.writeFileSync(STORE_PATH, JSON.stringify(buildStore(), null, 2));
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: "127.0.0.1",
      SITE_URL: `http://127.0.0.1:${PORT}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      ADMIN_EMAIL: OWNER.email,
      ADMIN_PASSWORD: OWNER.password,
      ADMIN_ACCESS_CODE: OWNER.code,
      NODE_ENV: "test",
      LLH_SKIP_STARTUP_CURRICULUM_SEED: "1",
      LLH_ENFORCE_TK_OWNER_ADMIN: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let browser;
  try {
    await waitForHealth(child);
    const login = await requestJson("POST", "/api/admin/login", {
      email: OWNER.email, password: OWNER.password, code: OWNER.code,
    });
    ok(login.status === 200 && login.json?.token, "owner login");
    const token = login.json.token;
    const auth = { Authorization: `Bearer ${token}` };

    const before = readStore();
    const invBefore = {
      lessonIds: fp((before.siteContent.curriculum.lessonPlans || []).map((p) => p.id).sort()),
      activityIds: fp((before.siteContent.curriculum.activities || []).map((a) => a.id).sort()),
      resources: fp(before.siteContent.curriculum.resources),
      flags: fp(before.siteContent.featureFlags),
      real: [REAL_A, REAL_B, REAL_C].map((id) => ({ id, fp: fp(plan(before, id)) })),
    };
    const siblingFp = fp(plan(before, SIBLING));
    const legacyActBefore = structuredClone(activity(before, ACT_LEGACY_SYNC));
    const canonActBefore = structuredClone(activity(before, ACT_CANON_SYNC));
    const editActBefore = structuredClone(activity(before, ACT_EDIT_SYNC));
    const partialActBefore = structuredClone(activity(before, ACT_PARTIAL_SYNC));
    const customerBodyBefore = fp({
      status: plan(before, FIXTURE).status,
      weeklyOverview: plan(before, FIXTURE).weeklyOverview,
      dailyPlans: plan(before, FIXTURE).dailyPlans,
    });
    const activitiesFpBefore = fp(before.siteContent.curriculum.activities);

    // ---------- Save Draft isolation ----------
    const draftSave = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      saveMode: "enrichment_draft",
      expectedUpdatedAt: before.siteContent.updatedAt,
      adminEmail: OWNER.email,
      lessonPlan: {
        id: FIXTURE,
        enrichmentDraft: {
          updatedAt: new Date().toISOString(),
          lastEditedBy: OWNER.email,
          activities: {
            [ACT_EDIT_SYNC]: { ...CORE, adaptations: "PROJ_ENRICH_Adapt" },
          },
        },
      },
    }, auth);
    ok(draftSave.status === 200 && draftSave.json?.ok, "Save Draft ok");
    const afterDraft = readStore();
    ok(fp({
      status: plan(afterDraft, FIXTURE).status,
      weeklyOverview: plan(afterDraft, FIXTURE).weeklyOverview,
      dailyPlans: plan(afterDraft, FIXTURE).dailyPlans,
    }) === customerBodyBefore, "Save Draft did not change dailyPlans");
    ok(fp(afterDraft.siteContent.curriculum.activities) === activitiesFpBefore,
      "Save Draft did not change curriculum.activities");
    ok(activity(afterDraft, ACT_EDIT_SYNC).title === "Seed Title", "Save Draft left B-store title unchanged");
    ok(plan(afterDraft, FIXTURE).enrichmentDraft?.activities?.[ACT_EDIT_SYNC]?.objective === CORE.objective,
      "Save Draft persisted Core objective under cur-act-* key");

    // ---------- Failed Publish atomicity ----------
    const fail = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      saveMode: "publish_enrichment",
      expectedUpdatedAt: "1999-01-01T00:00:00.000Z",
      publishedBy: OWNER.email,
      ownerPublishOverride: { confirmed: true, reason: "Projection sync failed-publish probe reason." },
      lessonPlan: {
        id: FIXTURE,
        enrichmentDraft: plan(afterDraft, FIXTURE).enrichmentDraft,
      },
    }, auth);
    ok(fail.status === 409 || fail.status >= 400, `failed publish rejected (${fail.status})`);
    const afterFail = readStore();
    ok(Boolean(plan(afterFail, FIXTURE).enrichmentDraft), "failed publish kept enrichmentDraft");
    ok(fp(plan(afterFail, FIXTURE).dailyPlans) === fp(plan(afterDraft, FIXTURE).dailyPlans),
      "failed publish did not mutate dailyPlans");
    ok(fp(afterFail.siteContent.curriculum.activities) === fp(afterDraft.siteContent.curriculum.activities),
      "failed publish did not mutate curriculum.activities");
    ok(activity(afterFail, ACT_EDIT_SYNC).dayOfWeek === "monday", "failed publish did not move B weekday");
    ok(findItem(plan(afterFail, FIXTURE), ACT_EDIT_ITEM)?.day === "monday", "failed publish did not move A weekday");

    // ---------- Successful full Publish ----------
    const stamp = readStore().siteContent.updatedAt;
    const pub = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      saveMode: "publish_enrichment",
      expectedUpdatedAt: stamp,
      publishedBy: OWNER.email,
      ownerPublishOverride: { confirmed: true, reason: "Projection sync successful publish probe reason." },
      lessonPlan: {
        id: FIXTURE,
        enrichmentDraft: plan(readStore(), FIXTURE).enrichmentDraft,
      },
    }, auth);
    ok(pub.status === 200 && pub.json?.ok === true && pub.json?.duplicate !== true, `publish ok (${pub.status})`);

    const afterPub = readStore();
    const pubPlan = plan(afterPub, FIXTURE);
    const placed = findItem(pubPlan, ACT_EDIT_ITEM);
    const storeAct = activity(afterPub, ACT_EDIT_SYNC);
    ok(pubPlan.enrichmentDraft == null, "enrichmentDraft cleared only after successful Publish");
    ok(placed?.day === "wednesday", "dailyPlans weekday Wednesday");
    ok(!(pubPlan.dailyPlans.monday.items || []).some((i) => i.itemId === ACT_EDIT_ITEM), "removed from Monday");
    ok((pubPlan.dailyPlans.wednesday.items || []).filter((i) => i.itemId === ACT_EDIT_ITEM).length === 1, "once on Wednesday");
    ok(placed.item.itemId === ACT_EDIT_ITEM, "itemId stable on dailyPlans");
    assertCoreOn(placed.item, "dailyPlans");

    ok(storeAct?.id === ACT_EDIT_SYNC, "cur-act-* id stable");
    ok(storeAct?.itemId === ACT_EDIT_ITEM, "itemId stable on curriculum.activities");
    ok(storeAct?.lessonPlanId === FIXTURE, "lessonPlanId stable");
    assertCoreOn(storeAct, "curriculum.activities");
    ok(storeAct.setupImageUrl === "/images/lesson-covers/default.svg", "B-store setup image preserved");
    ok(storeAct.exampleImageUrl === "/images/lesson-covers/default.svg", "B-store example image preserved");
    ok(storeAct.customLegacy?.marker === "edit-custom", "B-store customLegacy preserved");
    ok(storeAct.nullField === null, "B-store nullField preserved");
    ok(storeAct.unknownField === "edit-unknown", "B-store unknownField preserved");
    ok(Array.isArray(storeAct.teacherTips) && storeAct.teacherTips[0] === "KEEP_TIP", "B-store teacherTips preserved");

    // Sibling activity rows byte-equivalent (untouched)
    ok(fp(activity(afterPub, ACT_LEGACY_SYNC)) === fp(legacyActBefore), "legacy B-store row unchanged");
    ok(fp(activity(afterPub, ACT_CANON_SYNC)) === fp(canonActBefore), "canon B-store row unchanged");
    ok(JSON.stringify(findItem(pubPlan, ACT_LEGACY_ITEM)?.item) === JSON.stringify(findItem(plan(before, FIXTURE), ACT_LEGACY_ITEM)?.item)
      || findItem(pubPlan, ACT_LEGACY_ITEM)?.item?.objective === "LEGACY_OBJ",
      "legacy dailyPlans sibling preserved");

    // Activity API
    const actHttp = await requestJson("GET", `/api/curriculum/activities/${ACT_EDIT_SYNC}`, null, auth);
    ok(actHttp.status === 200, "activity API 200");
    assertCoreOn(actHttp.json?.activity, "activity API");
    ok(actHttp.json.activity.id === ACT_EDIT_SYNC, "activity API id");

    // Activity Center list source (title/day)
    ok(storeAct.title === CORE.title && storeAct.dayOfWeek === "wednesday",
      "Activity Center list metadata (title/day) updated");

    // Customer TK mapper
    const linked = (afterPub.siteContent.curriculum.activities || []).filter((a) => a.lessonPlanId === FIXTURE);
    const mapped = teachingKit.mapLessonPlanToTeachingKit(pubPlan, linked, afterPub.siteContent.curriculum.resources || [], { day: "wednesday" });
    const card = (mapped.companion?.activities || []).find((a) => a.id === ACT_EDIT_SYNC);
    ok(card?.title === CORE.title && card?.learningObjective === CORE.objective, "customer TK card published");
    ok(String(card?.materialsText || "").includes("PROJ_MAT_beta"), "materials aggregation source published");

    const tkHttp = await requestJson("GET", `/api/curriculum/lesson-plans/${FIXTURE}/teaching-kit?day=wednesday`, null, auth);
    const httpCard = (tkHttp.json?.teachingKit?.companion?.activities || []).find((a) => a.id === ACT_EDIT_SYNC);
    ok(tkHttp.status === 200 && httpCard?.title === CORE.title, "TK HTTP API published");

    // Print source = companion cards
    let printApi = null;
    try { printApi = require(path.join(ROOT, "scripts/teaching-kit-print.js")); } catch { /* optional */ }
    if (printApi?.buildBinderPrintHtml) {
      const html = printApi.buildBinderPrintHtml(mapped, { selection: { activities: true, activityIds: [ACT_EDIT_SYNC] } });
      const htmlStr = typeof html === "string" ? html : JSON.stringify(html || {});
      ok(htmlStr.includes(CORE.title) && htmlStr.includes(CORE.objective), "Print Center HTML has published Core");
      ok(htmlStr.includes("PROJ_MAT") || String(card.materialsText).includes("PROJ_MAT"), "Selective print materials published");
    } else {
      ok(card?.title === CORE.title, "Print source card published (print API shape unavailable)");
    }

    // Owner editor reopen
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`http://127.0.0.1:${PORT}/?t=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => typeof setAdminSession === "function", null, { timeout: 30000 });
    await page.evaluate(({ owner, ownerToken }) => {
      setAdminSession({ email: owner.email, name: "Owner", token: ownerToken, mode: "server", trustedDevice: true });
      localStorage.setItem("llhAdminPreviewMode", "Admin");
    }, { owner: OWNER, ownerToken: token });
    await page.evaluate(async () => { setView("admin"); await loadAdminSiteContent(); });
    await page.evaluate(async (id) => {
      await window.openOwnerTeachingKitEditor(id, { source: "edit", ownerWorkspace: true });
    }, FIXTURE);
    await page.waitForSelector('[data-core-field="objective"]', { timeout: 20000 });
    await page.evaluate(({ planId, syncId, itemId }) => {
      const planObj = curriculumLessonPlanById(planId);
      const storeActs = curriculumActivitiesForLesson(planId);
      const acts = window.LLHTeachingKitEnrichment.flattenLessonActivities(planObj, storeActs, planObj?.enrichmentDraft) || [];
      const idx = acts.findIndex((a) => a.id === syncId || a.itemId === itemId);
      document.querySelector(`[data-activity-index="${idx}"]`)?.click();
      ["core", "teaching", "safety"].forEach((sid) => {
        const el = document.querySelector(`[data-core-section="${sid}"]`);
        if (el) el.open = true;
      });
    }, { planId: FIXTURE, syncId: ACT_EDIT_SYNC, itemId: ACT_EDIT_ITEM });
    await page.waitForTimeout(300);
    const ui = await page.evaluate(() => ({
      title: document.querySelector('[data-core-field="title"]')?.value || "",
      objective: document.querySelector('[data-core-field="objective"]')?.value || "",
      dayOfWeek: document.querySelector('[data-core-field="dayOfWeek"]')?.value || "",
      materials: document.querySelector('[data-core-field="materials"]')?.value || "",
      preparation: document.querySelector('[data-core-field="preparation"]')?.value || "",
    }));
    ok(ui.title === CORE.title, "owner reopen title");
    ok(ui.objective === CORE.objective, "owner reopen objective");
    ok(ui.dayOfWeek === "wednesday", "owner reopen weekday");
    ok(ui.materials.includes("PROJ_MAT_beta"), "owner reopen materials");
    ok(ui.preparation === CORE.preparation, "owner reopen preparation");

    // ---------- Partial edit: only objective + materials ----------
    const partialDraftStamp = readStore().siteContent.updatedAt;
    const partialDraft = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      saveMode: "enrichment_draft",
      expectedUpdatedAt: partialDraftStamp,
      adminEmail: OWNER.email,
      lessonPlan: {
        id: FIXTURE,
        enrichmentDraft: {
          updatedAt: new Date().toISOString(),
          lastEditedBy: OWNER.email,
          activities: {
            [ACT_PARTIAL_SYNC]: {
              objective: "PARTIAL_ONLY_OBJ",
              materials: "PARTIAL_ONLY_MAT_a\nPARTIAL_ONLY_MAT_b",
            },
          },
        },
      },
    }, auth);
    ok(partialDraft.status === 200 && partialDraft.json?.ok, "partial draft save ok");
    const partialPubStamp = readStore().siteContent.updatedAt;
    const partialPub = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      saveMode: "publish_enrichment",
      expectedUpdatedAt: partialPubStamp,
      publishedBy: OWNER.email,
      ownerPublishOverride: { confirmed: true, reason: "Projection sync partial edit publish probe." },
      lessonPlan: {
        id: FIXTURE,
        enrichmentDraft: plan(readStore(), FIXTURE).enrichmentDraft,
      },
    }, auth);
    ok(partialPub.status === 200 && partialPub.json?.ok, "partial publish ok");
    const partialAfter = activity(readStore(), ACT_PARTIAL_SYNC);
    const partialDaily = findItem(plan(readStore(), FIXTURE), ACT_PARTIAL_ITEM)?.item;
    ok(partialAfter.objective === "PARTIAL_ONLY_OBJ", "partial: B objective updated");
    ok(String(partialAfter.materials).includes("PARTIAL_ONLY_MAT_b"), "partial: B materials updated");
    ok(partialDaily.objective === "PARTIAL_ONLY_OBJ", "partial: A objective updated");
    ok(partialAfter.title === partialActBefore.title, "partial: B title preserved");
    ok(partialAfter.description === partialActBefore.description, "partial: B description preserved");
    ok(partialAfter.preparation === partialActBefore.preparation, "partial: B preparation preserved");
    ok(partialAfter.setup === partialActBefore.setup, "partial: B setup preserved");
    ok(JSON.stringify(partialAfter.steps) === JSON.stringify(partialActBefore.steps)
      || String(partialAfter.steps) === String(partialActBefore.steps),
      "partial: B steps preserved");
    ok(partialAfter.setupImageUrl === partialActBefore.setupImageUrl, "partial: B image preserved");
    ok(partialAfter.customLegacy?.marker === "partial-custom", "partial: B customLegacy preserved");
    ok(partialAfter.unknownField === "partial-unknown", "partial: B unknown preserved");
    ok(partialAfter.nullField === null, "partial: B null preserved");
    ok(partialAfter.dayOfWeek === "thursday", "partial: B weekday unchanged");
    ok(Array.isArray(partialActBefore.materials), "partial fixture seeded materials[]");
    // Edited materials intentionally become owned string; arrays on other fields stay.
    ok(Array.isArray(partialAfter.teacherTips) && partialAfter.teacherTips[0] === "PARTIAL_TIP",
      "partial: B teacherTips preserved");

    // Full-edit row still intact after partial publish
    ok(activity(readStore(), ACT_EDIT_SYNC).objective === CORE.objective, "prior full-edit B row still published");
    ok(fp(plan(readStore(), SIBLING)) === siblingFp, "sibling lesson unchanged");
    ok(fp(readStore().siteContent.curriculum.resources) === invBefore.resources, "resources unchanged");
    ok(fp(readStore().siteContent.featureFlags) === invBefore.flags, "feature flags unchanged");
    invBefore.real.forEach((r) => {
      ok(fp(plan(readStore(), r.id)) === r.fp, `${r.id} fingerprint unchanged`);
    });
    ok(fp((readStore().siteContent.curriculum.lessonPlans || []).map((p) => p.id).sort()) === invBefore.lessonIds,
      "lesson ID inventory unchanged");
    ok(fp((readStore().siteContent.curriculum.activities || []).map((a) => a.id).sort()) === invBefore.activityIds,
      "activity ID inventory unchanged");

    // editActBefore id still present (no duplicate created)
    const editRows = (readStore().siteContent.curriculum.activities || []).filter((a) => a.itemId === ACT_EDIT_ITEM);
    ok(editRows.length === 1 && editRows[0].id === ACT_EDIT_SYNC, "no duplicate activity row for edited item");

    // ---------- Shared category allow-list regression (PR #632 scope fix) ----------
    const serverSrc = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
    const normSlice = serverSrc.slice(
      serverSrc.indexOf("function normalizedCurriculumActivity"),
      serverSrc.indexOf("function mergeNormalizedCurriculumActivityPreservingCustoms"),
    );
    ok(
      /activityCategory:\s*PLAY_ACTIVITY_CATEGORIES\.has\(category\)\s*\?\s*category\s*:\s*"Open-Ended Exploration"/.test(normSlice),
      "shared normalizedCurriculumActivity restores PLAY_ACTIVITY_CATEGORIES allow-list",
    );
    ok(
      !/activityCategory:\s*category\s*\|\|\s*"Open-Ended Exploration"/.test(normSlice),
      "shared normalizedCurriculumActivity does not preserve arbitrary non-empty categories",
    );
    ok(
      serverSrc.includes("Publish-scoped only: restore the owned draft category"),
      "publish-scoped owned category restore remains in applyMergedEnrichmentToActivities",
    );

    // Activity API / DTO path uses shared normalizer — malformed + non-allow-list fall back.
    ok(activity(readStore(), ACT_BAD_CAT_SYNC)?.activityCategory === "NotARealCategory!!!",
      "fixture store retained raw malformed category (DTO must still remap)");
    ok(activity(readStore(), ACT_LANG_CAT_SYNC)?.activityCategory === "Language",
      "fixture store retained raw Language category (DTO must still remap)");
    const badApi = await requestJson("GET", `/api/curriculum/activities/${ACT_BAD_CAT_SYNC}`, null, auth);
    const langApi = await requestJson("GET", `/api/curriculum/activities/${ACT_LANG_CAT_SYNC}`, null, auth);
    ok(badApi.status === 200 && langApi.status === 200, "category allow-list probe APIs 200");
    ok(
      badApi.json?.activity?.activityCategory === "Open-Ended Exploration",
      "shared normalizer: NotARealCategory!!! falls back on Activity API/DTO",
    );
    ok(
      langApi.json?.activity?.activityCategory === "Open-Ended Exploration",
      "shared normalizer: Language falls back on Activity API/DTO (not globally preserved)",
    );
    const litApi = await requestJson("GET", `/api/curriculum/activities/${ACT_EDIT_SYNC}`, null, auth);
    ok(
      litApi.json?.activity?.activityCategory === "Literacy",
      "shared normalizer: allow-listed Literacy preserved on Activity API",
    );
    ok(
      activity(readStore(), ACT_EDIT_SYNC)?.activityCategory === "Literacy"
      && findItem(plan(readStore(), FIXTURE), ACT_EDIT_ITEM)?.item?.activityCategory === "Literacy",
      "Publish path: allow-listed Core category agrees on dailyPlans + curriculum.activities",
    );

    console.log(`\nPASS ${passed} checks — activity projection sync`);
  } catch (error) {
    console.error("\nFAIL", error);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main();
