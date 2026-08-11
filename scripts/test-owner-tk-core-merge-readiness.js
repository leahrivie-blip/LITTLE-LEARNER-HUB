#!/usr/bin/env node
/**
 * PR #630 final merge-readiness audit (disposable fixtures only).
 *
 * Proves field-level Publish normalization safety, Save Draft non-publish,
 * failed-Publish atomicity, and real-curriculum fingerprint stability.
 *
 * Run: npm run test:owner-tk-core-merge-readiness
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
const PORT = 7860 + Math.floor(Math.random() * 120);
const STORE_PATH = path.join(os.tmpdir(), `llh-owner-tk-merge-ready-${crypto.randomBytes(4).toString("hex")}.json`);
const OWNER = {
  email: "leahivie@icloud.com",
  password: "owner-tk-merge-ready-pass",
  code: "owner-tk-merge-ready-code",
};

const FIXTURE = "cur-lp-owner-tk-merge-ready-fixture";
const SIBLING = "cur-lp-owner-tk-merge-ready-sibling";
const REAL_A = "cur-lp-preschool-all-about-me";
const REAL_B = "cur-lp-toddler-amazing-apples";
const REAL_C = "cur-lp-preschool-farm-animals";
const ACT_EDIT = "item-merge-ready-edit";
const ACT_LEGACY = "item-merge-ready-legacy";
const ACT_CANON = "item-merge-ready-canon";
const ACT_SIB = "item-merge-ready-sib";
const DRAFT_RES = "cur-res-owner-tk-merge-ready-draft";
const PUB_RES = "cur-res-owner-tk-merge-ready-pub";

let passed = 0;
const mutations = [];
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}
function note(msg) {
  console.log(`  · ${msg}`);
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

function findItem(planObj, itemId) {
  const days = planObj?.dailyPlans || {};
  for (const day of Object.keys(days)) {
    const hit = (days[day]?.items || []).find((i) => i && i.itemId === itemId);
    if (hit) return { day, item: hit };
  }
  return null;
}

function deepDiff(before, after, prefix = "") {
  const out = [];
  const bKeys = before && typeof before === "object" ? Object.keys(before) : [];
  const aKeys = after && typeof after === "object" ? Object.keys(after) : [];
  const keys = new Set([...bKeys, ...aKeys]);
  keys.forEach((key) => {
    const pathKey = prefix ? `${prefix}.${key}` : key;
    const bv = before?.[key];
    const av = after?.[key];
    if (JSON.stringify(bv) === JSON.stringify(av)) return;
    if (
      bv && av
      && typeof bv === "object" && typeof av === "object"
      && !Array.isArray(bv) && !Array.isArray(av)
    ) {
      out.push(...deepDiff(bv, av, pathKey));
      return;
    }
    out.push({ path: pathKey, before: bv, after: av });
  });
  return out;
}

function inventoryFingerprint(store) {
  const cur = store.siteContent.curriculum;
  return {
    lessonIds: (cur.lessonPlans || []).map((p) => p.id).sort(),
    lessonCount: (cur.lessonPlans || []).length,
    activityIds: (cur.activities || []).map((a) => a.id).filter(Boolean).sort(),
    activityCount: (cur.activities || []).length,
    resources: (cur.resources || []).map((r) => ({ id: r.id, status: r.status, lessonPlanIds: r.lessonPlanIds || [] })),
    featureFlags: store.siteContent.featureFlags,
    realLessons: [REAL_A, REAL_B, REAL_C].map((id) => {
      const p = plan(store, id);
      return p ? {
        id,
        fp: fp(p),
        imageRefs: Object.values(p.dailyPlans || {}).flatMap((d) => (d.items || []).flatMap((it) => [
          it.setupImageUrl, it.exampleImageUrl,
        ].filter(Boolean))),
      } : { id, missing: true };
    }),
  };
}

function buildStore() {
  const edited = {
    itemId: ACT_EDIT,
    title: "MergeReady Edit Target",
    dayOfWeek: "monday",
    activityCategory: "Language",
    objective: "KEEP_OBJ_EditTarget",
    description: "KEEP_DESC_LineOne.\n\nKEEP_DESC_LineTwo.",
    materials: "KEEP_MAT_one\nKEEP_MAT_two",
    preparation: "KEEP_PREP_canonical",
    setup: "KEEP_SETUP",
    steps: ["First structured step", "Second structured step", "Third structured step"],
    teacherLanguage: "KEEP_Q_ask?",
    observationOpportunities: "KEEP_OBS",
    safetyNotes: "KEEP_SAFE",
    cleanupTips: "KEEP_CLEAN_canonical",
    ageModifications: "KEEP_AGE",
    durationMinutes: 10,
    imageRequirement: "optional",
    setupImageUrl: "/images/lesson-covers/default.svg",
    exampleImageUrl: "/images/lesson-covers/default.svg",
    teacherTips: ["KEEP_TIP"],
    settingTags: ["small_group"],
    customLegacy: { marker: "edit-custom", nested: [null, 0, "x"] },
    nullField: null,
    unknownField: "edit-unknown",
  };

  const legacy = {
    itemId: ACT_LEGACY,
    title: "MergeReady Legacy Sibling",
    dayOfWeek: "tuesday",
    activityCategory: "Sensory",
    objective: "LEGACY_OBJ",
    description: "Legacy para one.\n\nLegacy para two.",
    // intentionally absent: preparation, steps, cleanupTips, durationMinutes
    prep: "LEGACY_PREP_ONLY",
    directions: ["Legacy step A", "Legacy step B", "Legacy step C"],
    cleanup: "LEGACY_CLEANUP_ONLY",
    resetNotes: "LEGACY_RESET_ONLY",
    activityDurationMinutes: "15",
    materials: ["legacy-mat-a", "legacy-mat-b"],
    unknownField: "legacy-unknown",
    customNested: { a: 1, b: [null, 0, "y"] },
    nullField: null,
    emptyStringField: "",
    setupImageUrl: "/images/lesson-covers/default.svg",
    exampleImageUrl: "/images/lesson-covers/default.svg",
  };

  const canon = {
    itemId: ACT_CANON,
    title: "MergeReady Canonical Sibling",
    dayOfWeek: "wednesday",
    activityCategory: "Fine Motor",
    objective: "CANON_OBJ",
    description: "CANON_DESC",
    materials: ["canon-a", "canon-b"],
    preparation: "CANON_PREP",
    setup: "CANON_SETUP",
    steps: "1. Canon step\n2. Canon step two",
    teacherLanguage: "CANON_Q",
    observationOpportunities: "CANON_OBS",
    safetyNotes: "CANON_SAFE",
    cleanupTips: "CANON_CLEAN",
    ageModifications: "CANON_AGE",
    durationMinutes: 0,
    setupMinutes: null,
    // intentionally absent: purpose, vocabulary
    imageRequirement: "example_required",
    setupImageUrl: "/images/lesson-covers/default.svg",
    exampleImageUrl: "/images/lesson-covers/default.svg",
    unknownField: "canon-unknown",
    nullField: null,
  };

  return {
    users: {},
    adminSessions: {},
    siteContent: {
      updatedAt: "2026-01-05T00:00:00.000Z",
      featureFlags: {
        teachingKitViewer: true,
        teachingKitPrintCenter: true,
        teachingKitEnrichmentEditor: true,
        playBasedCurriculum: true,
        mergeReadyMarker630: "merge-readiness-audit",
      },
      curriculum: {
        updatedAt: "2026-01-05T00:00:00.000Z",
        lessonPlans: [
          {
            id: FIXTURE,
            title: "Owner TK Merge Ready Disposable",
            age: "Preschool",
            theme: "MergeReady",
            plan: "Pro",
            status: "published",
            weeklyOverview: "PUBLISHED_OVERVIEW_MUST_STAY",
            publishedAt: "2026-01-01T00:00:00.000Z",
            disposableQaFixture: true,
            resourceIds: [DRAFT_RES, PUB_RES],
            dailyPlans: {
              monday: { items: [edited] },
              tuesday: { items: [legacy] },
              wednesday: { items: [canon] },
              thursday: { items: [{ itemId: "item-merge-ready-thu", title: "Thu filler", dayOfWeek: "thursday", objective: "filler", description: "filler", materials: "f", steps: "1. f" }] },
              friday: { items: [{ itemId: "item-merge-ready-fri", title: "Fri filler", dayOfWeek: "friday", objective: "filler", description: "filler", materials: "f", steps: "1. f" }] },
            },
          },
          {
            id: SIBLING,
            title: "Owner TK Merge Ready Sibling Lesson",
            age: "Toddler",
            theme: "Sibling",
            plan: "Pro",
            status: "published",
            weeklyOverview: "SIBLING_OVERVIEW",
            publishedAt: "2026-01-01T00:00:00.000Z",
            disposableQaFixture: true,
            resourceIds: [PUB_RES],
            dailyPlans: {
              monday: { items: [{ itemId: ACT_SIB, title: "Sibling Act", dayOfWeek: "monday", objective: "sib", description: "sib", materials: "sib", steps: "1. Sib" }] },
              tuesday: { items: [] },
              wednesday: { items: [] },
              thursday: { items: [] },
              friday: { items: [] },
            },
          },
          // Protected real-shaped IDs (minimal stubs for fingerprint inventory)
          {
            id: REAL_A,
            title: "All About Me (protected stub)",
            age: "Preschool",
            theme: "Protected",
            plan: "Pro",
            status: "published",
            weeklyOverview: "REAL_A",
            dailyPlans: {
              monday: { items: [{ itemId: "real-a-1", title: "Real A Act", dayOfWeek: "monday", objective: "real", description: "real", materials: "real", steps: "1. Real", setupImageUrl: "/images/lesson-covers/all-about-me.svg" }] },
              tuesday: { items: [] }, wednesday: { items: [] }, thursday: { items: [] }, friday: { items: [] },
            },
          },
          {
            id: REAL_B,
            title: "Amazing Apples (protected stub)",
            age: "Toddler",
            theme: "Protected",
            plan: "Pro",
            status: "published",
            weeklyOverview: "REAL_B",
            dailyPlans: {
              monday: { items: [{ itemId: "real-b-1", title: "Real B Act", dayOfWeek: "monday", objective: "real", description: "real", materials: "real", steps: "1. Real", exampleImageUrl: "/images/lesson-covers/amazing-apples.svg" }] },
              tuesday: { items: [] }, wednesday: { items: [] }, thursday: { items: [] }, friday: { items: [] },
            },
          },
          {
            id: REAL_C,
            title: "Farm Animals (protected stub)",
            age: "Preschool",
            theme: "Protected",
            plan: "Pro",
            status: "published",
            weeklyOverview: "REAL_C",
            dailyPlans: {
              monday: { items: [{ itemId: "real-c-1", title: "Real C Act", dayOfWeek: "monday", objective: "real", description: "real", materials: "real", steps: "1. Real" }] },
              tuesday: { items: [] }, wednesday: { items: [] }, thursday: { items: [] }, friday: { items: [] },
            },
          },
        ],
        activities: [],
        resources: [
          { id: DRAFT_RES, title: "MergeReady draft printable", type: "printable", status: "draft", lessonPlanIds: [FIXTURE] },
          { id: PUB_RES, title: "MergeReady published printable", type: "printable", status: "published", lessonPlanIds: [FIXTURE, SIBLING] },
        ],
      },
    },
  };
}

async function main() {
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
      email: OWNER.email,
      password: OWNER.password,
      code: OWNER.code,
    });
    ok(login.status === 200 && login.json?.token, "owner login");
    const token = login.json.token;
    const auth = { Authorization: `Bearer ${token}` };

    const before = readStore();
    const invBefore = inventoryFingerprint(before);
    const fixtureBefore = plan(before, FIXTURE);
    const siblingBeforeFp = fp(plan(before, SIBLING));
    const legacyBefore = findItem(fixtureBefore, ACT_LEGACY)?.item;
    const canonBefore = findItem(fixtureBefore, ACT_CANON)?.item;
    const editBefore = findItem(fixtureBefore, ACT_EDIT)?.item;
    const fixtureFpBefore = fp(fixtureBefore);
    const customerBodyBefore = fp({
      status: fixtureBefore.status,
      weeklyOverview: fixtureBefore.weeklyOverview,
      dailyPlans: fixtureBefore.dailyPlans,
    });

    ok(Array.isArray(legacyBefore.directions) && legacyBefore.directions.length === 3, "legacy directions[] seeded");
    ok(Array.isArray(editBefore.steps) && editBefore.steps.length === 3, "structured steps[] seeded on edit target");
    ok(editBefore.activityCategory === "Language", "edit target category Language seeded");
    ok(legacyBefore.activityCategory === "Sensory", "legacy category Sensory seeded");
    ok(!Object.prototype.hasOwnProperty.call(legacyBefore, "preparation"), "legacy preparation absent");
    ok(!Object.prototype.hasOwnProperty.call(legacyBefore, "steps"), "legacy steps absent");
    ok(!Object.prototype.hasOwnProperty.call(canonBefore, "purpose"), "canon purpose absent");

    // ---------- 1) Save Draft non-publish + close/reopen persistence ----------
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`http://127.0.0.1:${PORT}/?t=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => typeof setAdminSession === "function", null, { timeout: 30000 });
    await page.evaluate(({ owner, ownerToken }) => {
      setAdminSession({
        email: owner.email,
        name: "Owner",
        token: ownerToken,
        mode: "server",
        trustedDevice: true,
      });
      localStorage.setItem("llhAdminPreviewMode", "Admin");
    }, { owner: OWNER, ownerToken: token });
    await page.evaluate(async () => {
      setView("admin");
      await loadAdminSiteContent();
    });

    async function openEditTarget() {
      await page.evaluate(async (id) => {
        if (window.LLHTeachingKitEnrichmentEditor?.isOpen?.()) {
          await window.LLHTeachingKitEnrichmentEditor.close({ force: true, abandonUnsaved: true, skipReturnNavigation: true });
        }
        await window.openOwnerTeachingKitEditor(id, { source: "edit", ownerWorkspace: true });
      }, FIXTURE);
      await page.waitForSelector("[data-owner-core-editor]", { timeout: 20000 });
      await page.evaluate(({ targetId, itemId }) => {
        const planObj = curriculumLessonPlanById(targetId);
        const acts = window.LLHTeachingKitEnrichment.flattenLessonActivities(planObj, [], planObj?.enrichmentDraft) || [];
        const idx = acts.findIndex((a) => String(a.itemId) === itemId);
        document.querySelector(`[data-activity-index="${idx}"]`)?.click();
      }, { targetId: FIXTURE, itemId: ACT_EDIT });
      await page.waitForSelector('[data-core-field="objective"]', { timeout: 10000 });
      await page.evaluate(() => {
        ["core", "teaching", "safety", "enrichment"].forEach((id) => {
          const el = document.querySelector(`[data-core-section="${id}"]`);
          if (el) el.open = true;
        });
      });
    }

    await openEditTarget();
    page.on("dialog", async (dialog) => {
      const message = dialog.message() || "";
      if (/unsaved/i.test(message)) {
        try { await dialog.dismiss(); } catch { /* ignore */ }
        return;
      }
      try { await dialog.accept(); } catch { /* ignore */ }
    });

    const CORE = {
      title: "MR_NAME_EditedOnce",
      dayOfWeek: "wednesday",
      activityCategory: "Language",
      ageModifications: "MR_AGE_Preschool",
      durationMinutes: "18",
      objective: "MR_OBJ_OnlyEdit",
      description: "MR_DESC_P1.\n\nMR_DESC_P2.",
      materials: "MR_MAT_a\nMR_MAT_b",
      preparation: "MR_PREP",
      setup: "MR_SETUP",
      steps: "1. MR_STEP_one\n2. MR_STEP_two\n3. MR_STEP_three",
      teacherLanguage: "MR_Q",
      observationOpportunities: "MR_OBS",
      safetyNotes: "MR_SAFE",
      cleanupTips: "MR_CLEAN",
    };
    for (const [key, value] of Object.entries(CORE)) {
      const sel = `[data-core-field="${key}"]`;
      if (key === "dayOfWeek") await page.selectOption(sel, value);
      else await page.fill(sel, value);
    }
    await page.fill('[data-enrich-text-field="adaptations"]', "MR_ENRICH_Adapt");

    await page.click("[data-enrich-save-draft]");
    await page.waitForFunction(() => {
      const text = document.querySelector(".tk-enrich-status")?.textContent || "";
      return /Draft saved/i.test(text) && !/failed/i.test(text);
    }, null, { timeout: 25000 });

    const afterDraft = readStore();
    const afterDraftPlan = plan(afterDraft, FIXTURE);
    ok(afterDraftPlan.status === "published", "Save Draft does not publish");
    ok(fp({
      status: afterDraftPlan.status,
      weeklyOverview: afterDraftPlan.weeklyOverview,
      dailyPlans: afterDraftPlan.dailyPlans,
    }) === customerBodyBefore, "Save Draft left published dailyPlans/overview unchanged");
    ok(afterDraftPlan.enrichmentDraft?.activities, "enrichmentDraft persisted on server store");
    const draftKey = Object.keys(afterDraftPlan.enrichmentDraft.activities).find((k) => k.includes(ACT_EDIT));
    ok(Boolean(draftKey), "draft activity key present");
    ok(afterDraftPlan.enrichmentDraft.activities[draftKey].objective === "MR_OBJ_OnlyEdit", "draft objective server-backed");
    ok(afterDraftPlan.enrichmentDraft.activities[draftKey].adaptations === "MR_ENRICH_Adapt", "draft enrichment server-backed");
    ok(findItem(afterDraftPlan, ACT_EDIT)?.day === "monday", "published weekday still Monday after draft weekday change");

    await page.evaluate(async () => {
      await window.LLHTeachingKitEnrichmentEditor.close({ force: true, abandonUnsaved: true, skipReturnNavigation: true });
    });
    await page.evaluate(async () => { await loadAdminSiteContent(); });
    await openEditTarget();
    const reopened = await page.evaluate((keys) => {
      const out = {};
      keys.forEach((key) => { out[key] = document.querySelector(`[data-core-field="${key}"]`)?.value || ""; });
      out.adaptations = document.querySelector('[data-enrich-text-field="adaptations"]')?.value || "";
      return out;
    }, Object.keys(CORE));
    for (const [key, value] of Object.entries(CORE)) {
      ok(String(reopened[key]) === String(value), `reopen shows draft ${key}`);
    }
    ok(reopened.adaptations === "MR_ENRICH_Adapt", "reopen shows draft enrichment");

    // ---------- 2) Failed Publish atomicity ----------
    const preFailStamp = readStore().siteContent.updatedAt;
    const preFailPlan = plan(readStore(), FIXTURE);
    const preFailDraftFp = fp(preFailPlan.enrichmentDraft);
    const preFailDailyFp = fp(preFailPlan.dailyPlans);
    const failPublish = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      saveMode: "publish_enrichment",
      expectedUpdatedAt: "1999-01-01T00:00:00.000Z", // force concurrency conflict
      publishedBy: OWNER.email,
      ownerPublishOverride: {
        confirmed: true,
        reason: "Disposable merge-readiness failed-publish probe.",
      },
      lessonPlan: {
        id: FIXTURE,
        enrichmentDraft: preFailPlan.enrichmentDraft,
      },
    }, auth);
    ok(failPublish.status === 409 || failPublish.status >= 400, `failed publish rejected (${failPublish.status})`);
    const afterFail = readStore();
    const afterFailPlan = plan(afterFail, FIXTURE);
    ok(fp(afterFailPlan.enrichmentDraft) === preFailDraftFp, "failed publish did not clear enrichmentDraft");
    ok(fp(afterFailPlan.dailyPlans) === preFailDailyFp, "failed publish did not mutate dailyPlans");
    ok(findItem(afterFailPlan, ACT_EDIT)?.day === "monday", "failed publish did not move weekday");
    ok((afterFailPlan.dailyPlans.wednesday.items || []).filter((i) => i.itemId === ACT_EDIT).length === 0, "failed publish did not duplicate onto Wednesday");
    ok(Array.isArray(findItem(afterFailPlan, ACT_LEGACY)?.item?.directions), "failed publish did not destroy legacy directions[]");
    ok(afterFailPlan.status === "published", "failed publish did not half-publish status change");
    note(`failed publish status=${failPublish.status} code=${failPublish.json?.code || failPublish.json?.error || ""}`);

    // stale expectedUpdatedAt must not have advanced incorrectly
    ok(afterFail.siteContent.updatedAt === preFailStamp || fp(afterFailPlan.dailyPlans) === preFailDailyFp, "failed publish left curriculum body intact");

    // ---------- 3) Successful Publish field-level audit ----------
    const fresh = readStore();
    const stamp = fresh.siteContent.updatedAt;
    const publish = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      saveMode: "publish_enrichment",
      expectedUpdatedAt: stamp,
      publishedBy: OWNER.email,
      ownerPublishOverride: {
        confirmed: true,
        reason: "Disposable merge-readiness successful publish probe.",
      },
      lessonPlan: {
        id: FIXTURE,
        enrichmentDraft: plan(fresh, FIXTURE).enrichmentDraft,
      },
    }, auth);
    ok(publish.status === 200 && publish.json?.ok === true, `publish ok (${publish.status}: ${publish.json?.error || ""})`);

    const afterPub = readStore();
    const pubPlan = plan(afterPub, FIXTURE);
    ok(pubPlan.enrichmentDraft == null, "enrichmentDraft cleared only after successful Publish");

    const placed = findItem(pubPlan, ACT_EDIT);
    ok(placed?.day === "wednesday", "edited activity moved to Wednesday");
    ok(!(pubPlan.dailyPlans.monday.items || []).some((i) => i.itemId === ACT_EDIT), "edited activity not left on Monday");
    ok((pubPlan.dailyPlans.wednesday.items || []).filter((i) => i.itemId === ACT_EDIT).length === 1, "edited activity appears once");
    ok(placed.item.itemId === ACT_EDIT, "itemId stable");
    ok(placed.item.objective === "MR_OBJ_OnlyEdit", "edited objective applied");
    ok(placed.item.title === "MR_NAME_EditedOnce", "edited title applied");
    ok(String(placed.item.steps).includes("MR_STEP_one"), "edited steps applied");
    ok(placed.item.setupImageUrl === "/images/lesson-covers/default.svg", "edit target image refs survive");
    ok(placed.item.exampleImageUrl === "/images/lesson-covers/default.svg", "edit target example image survives");
    ok(placed.item.customLegacy?.marker === "edit-custom", "edit target customLegacy survives");
    ok(placed.item.nullField === null, "edit target nullField survives");
    ok(placed.item.unknownField === "edit-unknown", "edit target unknownField survives");

    // Category remap check on edited activity (we intentionally kept Language)
    if (placed.item.activityCategory !== "Language") {
      mutations.push({
        kind: "category_remap_edited",
        before: "Language",
        after: placed.item.activityCategory,
      });
    }
    ok(placed.item.activityCategory === "Language", `edited category not remapped (got ${placed.item.activityCategory})`);

    // Sibling activities inside same lesson — must remain semantically equivalent
    const legacyAfter = findItem(pubPlan, ACT_LEGACY)?.item;
    const canonAfter = findItem(pubPlan, ACT_CANON)?.item;
    const legacyDiff = deepDiff(legacyBefore, legacyAfter);
    const canonDiff = deepDiff(canonBefore, canonAfter);
    if (legacyDiff.length) {
      mutations.push({ kind: "legacy_sibling_mutations", diffs: legacyDiff });
      note(`LEGACY SIBLING DIFFS (${legacyDiff.length}):`);
      legacyDiff.slice(0, 40).forEach((d) => {
        note(`  ${d.path}: ${JSON.stringify(d.before)} → ${JSON.stringify(d.after)}`);
      });
    }
    if (canonDiff.length) {
      mutations.push({ kind: "canon_sibling_mutations", diffs: canonDiff });
      note(`CANON SIBLING DIFFS (${canonDiff.length}):`);
      canonDiff.slice(0, 40).forEach((d) => {
        note(`  ${d.path}: ${JSON.stringify(d.before)} → ${JSON.stringify(d.after)}`);
      });
    }

    ok(Array.isArray(legacyAfter.directions) && legacyAfter.directions[1] === "Legacy step B", "legacy directions[] retained");
    ok(Array.isArray(legacyAfter.materials), "legacy materials[] retained");
    ok(legacyAfter.prep === "LEGACY_PREP_ONLY", "legacy prep retained");
    ok(legacyAfter.cleanup === "LEGACY_CLEANUP_ONLY", "legacy cleanup retained");
    ok(legacyAfter.unknownField === "legacy-unknown", "legacy unknown retained");
    ok(legacyAfter.nullField === null, "legacy null retained");
    ok(legacyAfter.setupImageUrl === "/images/lesson-covers/default.svg", "legacy image refs retained");
    ok(canonAfter.durationMinutes === 0, "canon numeric 0 duration retained");
    ok(canonAfter.unknownField === "canon-unknown", "canon unknown retained");
    ok(!Object.prototype.hasOwnProperty.call(canonAfter, "purpose") || canonAfter.purpose === "" || canonAfter.purpose == null,
      "absent purpose not filled with misleading content");

    // Strict: no unintended sibling mutations inside the lesson
    ok(legacyDiff.length === 0, `legacy sibling activity byte-equivalent after Publish (${legacyDiff.length} diffs)`);
    ok(canonDiff.length === 0, `canonical sibling activity byte-equivalent after Publish (${canonDiff.length} diffs)`);

    // Thu/Fri fillers
    const thuBefore = findItem(fixtureBefore, "item-merge-ready-thu")?.item;
    const friBefore = findItem(fixtureBefore, "item-merge-ready-fri")?.item;
    const thuAfter = findItem(pubPlan, "item-merge-ready-thu")?.item;
    const friAfter = findItem(pubPlan, "item-merge-ready-fri")?.item;
    const thuDiff = deepDiff(thuBefore, thuAfter);
    const friDiff = deepDiff(friBefore, friAfter);
    if (thuDiff.length) mutations.push({ kind: "thu_mutations", diffs: thuDiff });
    if (friDiff.length) mutations.push({ kind: "fri_mutations", diffs: friDiff });
    ok(thuDiff.length === 0, `thursday filler unchanged (${thuDiff.length} diffs)`);
    ok(friDiff.length === 0, `friday filler unchanged (${friDiff.length} diffs)`);

    // Edited activity: untouched non-edited fields should survive (images/custom/null)
    // Steps should be the owned draft string now (intentional).
    ok(typeof placed.item.steps === "string" || Array.isArray(placed.item.steps), "edited steps have expected type");
    if (Array.isArray(editBefore.steps) && typeof placed.item.steps === "string") {
      note("edited activity steps[] intentionally became owned multiline string via Core edit — expected");
    }

    // Lesson-level fingerprint may change for edited activity + draft clear; sibling lesson must not.
    ok(fp(plan(afterPub, SIBLING)) === siblingBeforeFp, "sibling lesson fingerprint unchanged");

    // ---------- 4) Real curriculum fingerprints ----------
    const invAfter = inventoryFingerprint(afterPub);
    ok(fp(invAfter.lessonIds) === fp(invBefore.lessonIds), "lesson ID inventory unchanged");
    ok(invAfter.lessonCount === invBefore.lessonCount, "lesson count unchanged");
    ok(fp(invAfter.activityIds) === fp(invBefore.activityIds), "activity ID inventory unchanged");
    ok(invAfter.activityCount === invBefore.activityCount, "activity count unchanged");
    ok(fp(invAfter.resources) === fp(invBefore.resources), "resources fingerprint unchanged");
    ok(fp(invAfter.featureFlags) === fp(invBefore.featureFlags), "featureFlags fingerprint unchanged");
    invBefore.realLessons.forEach((beforeReal, idx) => {
      const afterReal = invAfter.realLessons[idx];
      ok(beforeReal.fp === afterReal.fp, `${beforeReal.id} fingerprint unchanged`);
      ok(fp(beforeReal.imageRefs) === fp(afterReal.imageRefs), `${beforeReal.id} image refs unchanged`);
    });

    // Fixture changed (expected) — but only disposable
    ok(fp(pubPlan) !== fixtureFpBefore, "disposable fixture changed as expected after Publish");

    if (mutations.length) {
      console.error("\nUNINTENDED MUTATIONS DETECTED:");
      console.error(JSON.stringify(mutations, null, 2));
      throw new Error(`Publish normalization produced ${mutations.length} unintended mutation group(s)`);
    }

    console.log(`\nPASS ${passed} checks — PR #630 merge-readiness audit`);
  } catch (error) {
    console.error("\nFAIL", error);
    if (mutations.length) {
      console.error("Mutation report:", JSON.stringify(mutations, null, 2));
    }
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main();
