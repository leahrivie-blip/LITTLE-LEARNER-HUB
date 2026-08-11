#!/usr/bin/env node
/**
 * Production-shape Publish identity regression (PR #630 repair).
 *
 * Proves successful publish_enrichment applies Core Activity edits when
 * enrichmentDraft.activities is keyed by synced curriculum.activities ids
 * (cur-act-*), not only bare dailyPlans itemIds.
 *
 * Also re-proves the original itemId-keyed shape, failed-Publish atomicity,
 * and Save Draft → close → reopen for the cur-act-* fixture.
 *
 * Disposable fixtures only. Does not mutate real curriculum.
 *
 * Run: npm run test:owner-tk-publish-cur-act-identity
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
const PORT = 7920 + Math.floor(Math.random() * 120);
const STORE_PATH = path.join(os.tmpdir(), `llh-owner-tk-cur-act-id-${crypto.randomBytes(4).toString("hex")}.json`);
const OWNER = {
  email: "leahivie@icloud.com",
  password: "owner-tk-cur-act-id-pass",
  code: "owner-tk-cur-act-id-code",
};

const FIXTURE_CUR = "cur-lp-owner-tk-cur-act-identity";
const FIXTURE_ITEM = "cur-lp-owner-tk-itemid-identity";
const SIBLING = "cur-lp-owner-tk-cur-act-sibling";
const REAL_A = "cur-lp-preschool-all-about-me";
const REAL_B = "cur-lp-toddler-amazing-apples";
const REAL_C = "cur-lp-preschool-farm-animals";

const ACT_EDIT_ITEM = "item-cur-act-identity-edit";
const ACT_EDIT_SYNC = "cur-act-test-001";
const ACT_LEGACY_ITEM = "item-cur-act-identity-legacy";
const ACT_LEGACY_SYNC = "cur-act-test-legacy";
const ACT_CANON_ITEM = "item-cur-act-identity-canon";
const ACT_CANON_SYNC = "cur-act-test-canon";
const ACT_THU_ITEM = "item-cur-act-identity-thu";
const ACT_THU_SYNC = "cur-act-test-thu";
const ACT_FRI_ITEM = "item-cur-act-identity-fri";
const ACT_FRI_SYNC = "cur-act-test-fri";

const ITEM_EDIT_ITEM = "item-itemid-identity-edit";
const ITEM_EDIT_SYNC = "cur-act-itemid-shape-001";

const CORE = {
  title: "CURACT_NAME_EditedOnce",
  dayOfWeek: "wednesday",
  activityCategory: "Language",
  ageModifications: "CURACT_AGE_Preschool",
  durationMinutes: 22,
  objective: "CURACT_OBJ_OnlyEdit",
  description: "CURACT_DESC_P1.\n\nCURACT_DESC_P2.",
  materials: "CURACT_MAT_a\nCURACT_MAT_b",
  preparation: "CURACT_PREP",
  setup: "CURACT_SETUP",
  steps: "1. CURACT_STEP_one\n2. CURACT_STEP_two\n3. CURACT_STEP_three",
  teacherLanguage: "CURACT_Q?",
  observationOpportunities: "CURACT_OBS",
  safetyNotes: "CURACT_SAFE",
  cleanupTips: "CURACT_CLEAN",
};
const ENRICH_ADAPT = "CURACT_ENRICH_Adapt";

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

function makeEditedItem(itemId) {
  return {
    itemId,
    title: "Seed Edit Target",
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
}

function makeLegacyItem(itemId) {
  return {
    itemId,
    title: "Legacy Sibling",
    dayOfWeek: "tuesday",
    activityCategory: "Sensory",
    objective: "LEGACY_OBJ",
    description: "Legacy para one.\n\nLegacy para two.",
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
}

function makeCanonItem(itemId) {
  return {
    itemId,
    title: "Canonical Sibling",
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
    imageRequirement: "example_required",
    setupImageUrl: "/images/lesson-covers/default.svg",
    exampleImageUrl: "/images/lesson-covers/default.svg",
    unknownField: "canon-unknown",
    nullField: null,
  };
}

function activityRow(planId, syncId, item, day) {
  return {
    id: syncId,
    lessonPlanId: planId,
    itemId: item.itemId,
    title: item.title,
    dayOfWeek: day,
    activityCategory: item.activityCategory || "",
    objective: item.objective || "",
    description: item.description || "",
    materials: item.materials,
    preparation: item.preparation || item.prep || "",
    setup: item.setup || "",
    steps: item.steps || item.directions || "",
    status: "published",
    setupImageUrl: item.setupImageUrl || "",
    exampleImageUrl: item.exampleImageUrl || "",
  };
}

function coreDraftPatch() {
  return {
    ...CORE,
    adaptations: ENRICH_ADAPT,
  };
}

function assertPublishedCoreFields(placed, label) {
  ok(placed?.item?.title === CORE.title, `${label}: Activity name publishes`);
  ok(placed?.item?.objective === CORE.objective, `${label}: Activity objective publishes`);
  ok(String(placed?.item?.description) === CORE.description, `${label}: What children will do publishes`);
  ok(String(placed?.item?.materials) === CORE.materials, `${label}: Materials publish without array corruption`);
  ok(placed?.item?.preparation === CORE.preparation, `${label}: Teacher preparation publishes`);
  ok(placed?.item?.setup === CORE.setup, `${label}: Setup publishes`);
  ok(String(placed?.item?.steps) === CORE.steps, `${label}: Step-by-step directions publish`);
  ok(placed?.item?.teacherLanguage === CORE.teacherLanguage, `${label}: Suggested questions publish`);
  ok(placed?.item?.observationOpportunities === CORE.observationOpportunities, `${label}: Learning/observation focus publishes`);
  ok(placed?.item?.safetyNotes === CORE.safetyNotes, `${label}: Safety/supervision publishes`);
  ok(placed?.item?.cleanupTips === CORE.cleanupTips, `${label}: Cleanup publishes`);
  ok(placed?.item?.ageModifications === CORE.ageModifications, `${label}: Recommended age publishes`);
  ok(Number(placed?.item?.durationMinutes) === Number(CORE.durationMinutes), `${label}: Duration publishes`);
  ok(placed?.item?.activityCategory === CORE.activityCategory, `${label}: Category/domain publishes without remap`);
}

function buildStore() {
  const curEdit = makeEditedItem(ACT_EDIT_ITEM);
  const curLegacy = makeLegacyItem(ACT_LEGACY_ITEM);
  const curCanon = makeCanonItem(ACT_CANON_ITEM);
  const curThu = {
    itemId: ACT_THU_ITEM,
    title: "Thu filler",
    dayOfWeek: "thursday",
    objective: "filler",
    description: "filler",
    materials: "f",
    steps: "1. f",
    setupImageUrl: "/images/lesson-covers/default.svg",
  };
  const curFri = {
    itemId: ACT_FRI_ITEM,
    title: "Fri filler",
    dayOfWeek: "friday",
    objective: "filler",
    description: "filler",
    materials: "f",
    steps: "1. f",
    setupImageUrl: "/images/lesson-covers/default.svg",
  };

  const itemEdit = makeEditedItem(ITEM_EDIT_ITEM);
  const itemLegacy = makeLegacyItem("item-itemid-identity-legacy");
  const itemCanon = makeCanonItem("item-itemid-identity-canon");
  const itemThu = { ...curThu, itemId: "item-itemid-identity-thu" };
  const itemFri = { ...curFri, itemId: "item-itemid-identity-fri" };

  return {
    users: {},
    adminSessions: {},
    siteContent: {
      updatedAt: "2026-01-06T00:00:00.000Z",
      featureFlags: {
        teachingKitViewer: true,
        teachingKitPrintCenter: true,
        teachingKitEnrichmentEditor: true,
        playBasedCurriculum: true,
        curActIdentityMarker: "cur-act-identity-repair",
      },
      curriculum: {
        updatedAt: "2026-01-06T00:00:00.000Z",
        lessonPlans: [
          {
            id: FIXTURE_CUR,
            title: "Owner TK cur-act Identity Disposable",
            age: "Preschool",
            theme: "CurActIdentity",
            plan: "Pro",
            status: "published",
            weeklyOverview: "PUBLISHED_OVERVIEW_MUST_STAY",
            publishedAt: "2026-01-01T00:00:00.000Z",
            disposableQaFixture: true,
            dailyPlans: {
              monday: { items: [curEdit] },
              tuesday: { items: [curLegacy] },
              wednesday: { items: [curCanon] },
              thursday: { items: [curThu] },
              friday: { items: [curFri] },
            },
          },
          {
            id: FIXTURE_ITEM,
            title: "Owner TK itemId Identity Disposable",
            age: "Preschool",
            theme: "ItemIdIdentity",
            plan: "Pro",
            status: "published",
            weeklyOverview: "ITEMID_OVERVIEW_MUST_STAY",
            publishedAt: "2026-01-01T00:00:00.000Z",
            disposableQaFixture: true,
            dailyPlans: {
              monday: { items: [itemEdit] },
              tuesday: { items: [itemLegacy] },
              wednesday: { items: [itemCanon] },
              thursday: { items: [itemThu] },
              friday: { items: [itemFri] },
            },
          },
          {
            id: SIBLING,
            title: "Owner TK Identity Sibling Lesson",
            age: "Toddler",
            theme: "Sibling",
            plan: "Pro",
            status: "published",
            weeklyOverview: "SIBLING_OVERVIEW",
            publishedAt: "2026-01-01T00:00:00.000Z",
            disposableQaFixture: true,
            dailyPlans: {
              monday: { items: [{ itemId: "item-cur-act-sib", title: "Sibling Act", dayOfWeek: "monday", objective: "sib", description: "sib", materials: "sib", steps: "1. Sib" }] },
              tuesday: { items: [] },
              wednesday: { items: [] },
              thursday: { items: [] },
              friday: { items: [] },
            },
          },
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
        // Production shape: non-empty synced activity rows with cur-act-* ids.
        activities: [
          activityRow(FIXTURE_CUR, ACT_EDIT_SYNC, curEdit, "monday"),
          activityRow(FIXTURE_CUR, ACT_LEGACY_SYNC, curLegacy, "tuesday"),
          activityRow(FIXTURE_CUR, ACT_CANON_SYNC, curCanon, "wednesday"),
          activityRow(FIXTURE_CUR, ACT_THU_SYNC, curThu, "thursday"),
          activityRow(FIXTURE_CUR, ACT_FRI_SYNC, curFri, "friday"),
          activityRow(FIXTURE_ITEM, ITEM_EDIT_SYNC, itemEdit, "monday"),
          activityRow(FIXTURE_ITEM, "cur-act-itemid-legacy", itemLegacy, "tuesday"),
          activityRow(FIXTURE_ITEM, "cur-act-itemid-canon", itemCanon, "wednesday"),
          activityRow(FIXTURE_ITEM, "cur-act-itemid-thu", itemThu, "thursday"),
          activityRow(FIXTURE_ITEM, "cur-act-itemid-fri", itemFri, "friday"),
          {
            id: "cur-act-sib-001",
            lessonPlanId: SIBLING,
            itemId: "item-cur-act-sib",
            title: "Sibling Act",
            dayOfWeek: "monday",
            objective: "sib",
            status: "published",
          },
        ],
        resources: [
          { id: "cur-res-cur-act-identity-pub", title: "Identity published printable", type: "printable", status: "published", lessonPlanIds: [FIXTURE_CUR, FIXTURE_ITEM] },
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
    const siblingBeforeFp = fp(plan(before, SIBLING));
    const curBefore = plan(before, FIXTURE_CUR);
    const itemBefore = plan(before, FIXTURE_ITEM);
    const legacyBefore = structuredClone(findItem(curBefore, ACT_LEGACY_ITEM)?.item);
    const canonBefore = structuredClone(findItem(curBefore, ACT_CANON_ITEM)?.item);
    const thuBefore = structuredClone(findItem(curBefore, ACT_THU_ITEM)?.item);
    const friBefore = structuredClone(findItem(curBefore, ACT_FRI_ITEM)?.item);
    const editBefore = structuredClone(findItem(curBefore, ACT_EDIT_ITEM)?.item);
    const customerBodyBefore = fp({
      status: curBefore.status,
      weeklyOverview: curBefore.weeklyOverview,
      dailyPlans: curBefore.dailyPlans,
    });

    ok(Array.isArray(before.siteContent.curriculum.activities) && before.siteContent.curriculum.activities.length >= 5,
      "production-shape activities[] seeded non-empty");
    ok(before.siteContent.curriculum.activities.some((a) => a.id === ACT_EDIT_SYNC && a.itemId === ACT_EDIT_ITEM),
      "cur-act-test-001 linked to separate canonical itemId");
    ok(Array.isArray(editBefore.steps) && editBefore.steps.length === 3, "edit target structured steps[] seeded");
    ok(Array.isArray(legacyBefore.directions), "legacy directions[] seeded");

    // ---------- Save Draft (UI) → close → reopen for cur-act fixture ----------
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on("dialog", async (dialog) => {
      const message = dialog.message() || "";
      if (/unsaved/i.test(message)) {
        try { await dialog.dismiss(); } catch { /* ignore */ }
        return;
      }
      try { await dialog.accept(); } catch { /* ignore */ }
    });
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

    async function openEditTarget(planId, itemId) {
      await page.evaluate(async (id) => {
        if (window.LLHTeachingKitEnrichmentEditor?.isOpen?.()) {
          await window.LLHTeachingKitEnrichmentEditor.close({ force: true, abandonUnsaved: true, skipReturnNavigation: true });
        }
        await window.openOwnerTeachingKitEditor(id, { source: "edit", ownerWorkspace: true });
      }, planId);
      await page.waitForSelector("[data-owner-core-editor]", { timeout: 20000 });
      await page.evaluate(({ targetId, targetItemId }) => {
        const planObj = curriculumLessonPlanById(targetId);
        const storeActs = (typeof adminSiteContent !== "undefined" && adminSiteContent?.curriculum?.activities)
          || (typeof siteContent !== "undefined" && siteContent?.curriculum?.activities)
          || [];
        const acts = window.LLHTeachingKitEnrichment.flattenLessonActivities(planObj, storeActs, planObj?.enrichmentDraft) || [];
        const idx = acts.findIndex((a) => String(a.itemId) === targetItemId || String(a.id) === targetItemId);
        document.querySelector(`[data-activity-index="${idx}"]`)?.click();
      }, { targetId: planId, targetItemId: itemId });
      await page.waitForSelector('[data-core-field="objective"]', { timeout: 10000 });
      await page.evaluate(() => {
        ["core", "teaching", "safety", "enrichment"].forEach((sid) => {
          const el = document.querySelector(`[data-core-section="${sid}"]`);
          if (el) el.open = true;
        });
      });
    }

    await openEditTarget(FIXTURE_CUR, ACT_EDIT_ITEM);
    for (const [key, value] of Object.entries(CORE)) {
      const sel = `[data-core-field="${key}"]`;
      if (key === "dayOfWeek") await page.selectOption(sel, value);
      else await page.fill(sel, String(value));
    }
    await page.fill('[data-enrich-text-field="adaptations"]', ENRICH_ADAPT);
    await page.click("[data-enrich-save-draft]");
    await page.waitForFunction(() => {
      const text = document.querySelector(".tk-enrich-status")?.textContent || "";
      return /Draft saved/i.test(text) && !/failed/i.test(text);
    }, null, { timeout: 25000 });

    const afterDraft = readStore();
    const afterDraftPlan = plan(afterDraft, FIXTURE_CUR);
    ok(afterDraftPlan.status === "published", "Save Draft does not publish");
    ok(fp({
      status: afterDraftPlan.status,
      weeklyOverview: afterDraftPlan.weeklyOverview,
      dailyPlans: afterDraftPlan.dailyPlans,
    }) === customerBodyBefore, "Save Draft left published dailyPlans/overview unchanged");
    const draftActs = afterDraftPlan.enrichmentDraft?.activities || {};
    const draftKey = Object.keys(draftActs).find((k) => k === ACT_EDIT_SYNC || k === ACT_EDIT_ITEM || k.includes(ACT_EDIT_ITEM));
    ok(Boolean(draftKey), `draft keyed by production identity (got ${Object.keys(draftActs).join(",")})`);
    ok(draftActs[draftKey].objective === CORE.objective, "draft objective server-backed");
    ok(draftActs[draftKey].adaptations === ENRICH_ADAPT, "draft enrichment server-backed");
    ok(findItem(afterDraftPlan, ACT_EDIT_ITEM)?.day === "monday", "published weekday still Monday after draft");

    await page.evaluate(async () => {
      await window.LLHTeachingKitEnrichmentEditor.close({ force: true, abandonUnsaved: true, skipReturnNavigation: true });
    });
    await page.evaluate(async () => { await loadAdminSiteContent(); });
    await openEditTarget(FIXTURE_CUR, ACT_EDIT_ITEM);
    const reopened = await page.evaluate((keys) => {
      const out = {};
      keys.forEach((key) => { out[key] = document.querySelector(`[data-core-field="${key}"]`)?.value || ""; });
      out.adaptations = document.querySelector('[data-enrich-text-field="adaptations"]')?.value || "";
      return out;
    }, Object.keys(CORE));
    for (const [key, value] of Object.entries(CORE)) {
      ok(String(reopened[key]) === String(value), `reopen shows draft ${key}`);
    }
    ok(reopened.adaptations === ENRICH_ADAPT, "reopen shows draft enrichment");

    // ---------- Failed Publish atomicity (cur-act-* keyed draft) ----------
    const preFailPlan = plan(readStore(), FIXTURE_CUR);
    // Normalize draft to cur-act-* key for the forced conflict (production shape).
    const curActKeyedDraft = {
      ...(preFailPlan.enrichmentDraft || {}),
      activities: {
        [ACT_EDIT_SYNC]: {
          ...(preFailPlan.enrichmentDraft?.activities?.[draftKey] || coreDraftPatch()),
        },
      },
    };
    // Persist cur-act keyed draft via enrichment_draft so conflict probe uses that shape.
    const stampDraft = readStore().siteContent.updatedAt;
    const forceKey = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      saveMode: "enrichment_draft",
      expectedUpdatedAt: stampDraft,
      adminEmail: OWNER.email,
      lessonPlan: {
        id: FIXTURE_CUR,
        enrichmentDraft: curActKeyedDraft,
      },
    }, auth);
    ok(forceKey.status === 200 && forceKey.json?.ok === true, "persist cur-act-* keyed enrichmentDraft");
    const keyedPlan = plan(readStore(), FIXTURE_CUR);
    ok(Boolean(keyedPlan.enrichmentDraft?.activities?.[ACT_EDIT_SYNC]), "draft stored under cur-act-test-001");
    const preFailDraftFp = fp(keyedPlan.enrichmentDraft);
    const preFailDailyFp = fp(keyedPlan.dailyPlans);

    const failPublish = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      saveMode: "publish_enrichment",
      expectedUpdatedAt: "1999-01-01T00:00:00.000Z",
      publishedBy: OWNER.email,
      ownerPublishOverride: {
        confirmed: true,
        reason: "Disposable cur-act identity failed-publish probe.",
      },
      lessonPlan: {
        id: FIXTURE_CUR,
        enrichmentDraft: keyedPlan.enrichmentDraft,
      },
    }, auth);
    ok(failPublish.status === 409 || failPublish.status >= 400, `failed publish rejected (${failPublish.status})`);
    const afterFail = plan(readStore(), FIXTURE_CUR);
    ok(fp(afterFail.enrichmentDraft) === preFailDraftFp, "failed publish did not clear enrichmentDraft");
    ok(fp(afterFail.dailyPlans) === preFailDailyFp, "failed publish did not mutate dailyPlans");
    ok(findItem(afterFail, ACT_EDIT_ITEM)?.day === "monday", "failed publish did not move weekday");
    ok((afterFail.dailyPlans.wednesday.items || []).filter((i) => i.itemId === ACT_EDIT_ITEM).length === 0,
      "failed publish did not duplicate onto Wednesday");
    ok(Array.isArray(findItem(afterFail, ACT_LEGACY_ITEM)?.item?.directions), "failed publish did not destroy legacy directions[]");
    ok(findItem(afterFail, ACT_EDIT_ITEM)?.item?.objective === "KEEP_OBJ_EditTarget",
      "failed publish did not partially apply Core fields");

    // ---------- B) Successful Publish with cur-act-* keyed draft ----------
    const freshCur = readStore();
    const publishCur = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      saveMode: "publish_enrichment",
      expectedUpdatedAt: freshCur.siteContent.updatedAt,
      publishedBy: OWNER.email,
      ownerPublishOverride: {
        confirmed: true,
        reason: "Disposable cur-act identity successful publish probe.",
      },
      lessonPlan: {
        id: FIXTURE_CUR,
        enrichmentDraft: plan(freshCur, FIXTURE_CUR).enrichmentDraft,
      },
    }, auth);
    ok(publishCur.status === 200 && publishCur.json?.ok === true, `cur-act-* publish ok (${publishCur.status})`);
    ok(publishCur.json?.duplicate !== true, "cur-act-* publish was not a duplicate no-op");

    const afterCur = readStore();
    const pubCur = plan(afterCur, FIXTURE_CUR);
    ok(pubCur.enrichmentDraft == null, "enrichmentDraft cleared only after successful cur-act-* Publish");
    const placedCur = findItem(pubCur, ACT_EDIT_ITEM);
    ok(placedCur?.day === "wednesday", "cur-act-*: weekday moves exactly once to Wednesday");
    ok(!(pubCur.dailyPlans.monday.items || []).some((i) => i.itemId === ACT_EDIT_ITEM),
      "cur-act-*: activity disappears from old weekday");
    ok((pubCur.dailyPlans.wednesday.items || []).filter((i) => i.itemId === ACT_EDIT_ITEM).length === 1,
      "cur-act-*: activity appears exactly once on new weekday");
    ok(placedCur.item.itemId === ACT_EDIT_ITEM, "cur-act-*: stable canonical itemId preserved");
    assertPublishedCoreFields(placedCur, "cur-act-*");
    ok(placedCur.item.setupImageUrl === "/images/lesson-covers/default.svg", "cur-act-*: relative setup image survives");
    ok(placedCur.item.exampleImageUrl === "/images/lesson-covers/default.svg", "cur-act-*: relative example image survives");
    ok(placedCur.item.customLegacy?.marker === "edit-custom", "cur-act-*: customLegacy survives");
    ok(placedCur.item.nullField === null, "cur-act-*: nullField survives");
    ok(placedCur.item.unknownField === "edit-unknown", "cur-act-*: unknownField survives");

    // curriculum.activities projection must receive the same owned Core values.
    const storeAct = (afterCur.siteContent.curriculum.activities || []).find((a) => a.id === ACT_EDIT_SYNC);
    ok(storeAct?.id === ACT_EDIT_SYNC, "cur-act-*: B-store id stable");
    ok(storeAct?.itemId === ACT_EDIT_ITEM, "cur-act-*: B-store itemId stable");
    ok(storeAct?.title === CORE.title, "cur-act-*: B-store title synced");
    ok(storeAct?.objective === CORE.objective, "cur-act-*: B-store objective synced");
    ok(String(storeAct?.dayOfWeek).toLowerCase() === "wednesday", "cur-act-*: B-store weekday synced");
    ok(String(storeAct?.materials) === CORE.materials, "cur-act-*: B-store materials synced");
    ok(String(storeAct?.preparation) === CORE.preparation, "cur-act-*: B-store preparation synced");
    ok(storeAct?.setup === CORE.setup, "cur-act-*: B-store setup synced");
    ok(String(storeAct?.steps) === CORE.steps, "cur-act-*: B-store steps synced");
    ok(storeAct?.activityCategory === CORE.activityCategory, "cur-act-*: B-store category synced");

    const legacyAfter = findItem(pubCur, ACT_LEGACY_ITEM)?.item;
    const canonAfter = findItem(pubCur, ACT_CANON_ITEM)?.item;
    const thuAfter = findItem(pubCur, ACT_THU_ITEM)?.item;
    const friAfter = findItem(pubCur, ACT_FRI_ITEM)?.item;
    const legacyDiff = deepDiff(legacyBefore, legacyAfter);
    const canonDiff = deepDiff(canonBefore, canonAfter);
    const thuDiff = deepDiff(thuBefore, thuAfter);
    const friDiff = deepDiff(friBefore, friAfter);
    if (legacyDiff.length) mutations.push({ kind: "legacy", diffs: legacyDiff });
    if (canonDiff.length) mutations.push({ kind: "canon", diffs: canonDiff });
    ok(legacyDiff.length === 0, `cur-act-*: legacy sibling fingerprint/byte-equivalent (${legacyDiff.length} diffs)`);
    ok(canonDiff.length === 0, `cur-act-*: canonical sibling fingerprint/byte-equivalent (${canonDiff.length} diffs)`);
    ok(thuDiff.length === 0, `cur-act-*: thursday filler unchanged (${thuDiff.length} diffs)`);
    ok(friDiff.length === 0, `cur-act-*: friday filler unchanged (${friDiff.length} diffs)`);
    ok(Array.isArray(legacyAfter.directions) && legacyAfter.directions[1] === "Legacy step B", "legacy directions[] retained");
    ok(Array.isArray(legacyAfter.materials), "legacy materials[] retained");
    ok(legacyAfter.prep === "LEGACY_PREP_ONLY", "legacy prep retained");
    ok(legacyAfter.cleanup === "LEGACY_CLEANUP_ONLY", "legacy cleanup retained");
    ok(legacyAfter.setupImageUrl === "/images/lesson-covers/default.svg", "legacy image refs retained");
    ok(String(placedCur.item.description).includes("CURACT_DESC_P2"), "multiline description intact");
    ok(String(placedCur.item.materials).includes("CURACT_MAT_b"), "multiline materials intact");
    ok(String(placedCur.item.steps).includes("CURACT_STEP_two"), "multiline steps intact");

    // ---------- A) Successful Publish with itemId-keyed draft (must still work) ----------
    const itemLegacyBefore = structuredClone(findItem(itemBefore, "item-itemid-identity-legacy")?.item);
    const itemCanonBefore = structuredClone(findItem(itemBefore, "item-itemid-identity-canon")?.item);
    const itemDraft = {
      updatedAt: new Date().toISOString(),
      lastEditedBy: OWNER.email,
      activities: {
        [ITEM_EDIT_ITEM]: coreDraftPatch(),
      },
    };
    const stampItem = readStore().siteContent.updatedAt;
    const saveItemDraft = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      saveMode: "enrichment_draft",
      expectedUpdatedAt: stampItem,
      adminEmail: OWNER.email,
      lessonPlan: {
        id: FIXTURE_ITEM,
        enrichmentDraft: itemDraft,
      },
    }, auth);
    ok(saveItemDraft.status === 200 && saveItemDraft.json?.ok === true, "itemId-keyed draft save ok");
    ok(Boolean(plan(readStore(), FIXTURE_ITEM).enrichmentDraft?.activities?.[ITEM_EDIT_ITEM]),
      "itemId-keyed draft stored under canonical itemId");

    const freshItem = readStore();
    const publishItem = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      saveMode: "publish_enrichment",
      expectedUpdatedAt: freshItem.siteContent.updatedAt,
      publishedBy: OWNER.email,
      ownerPublishOverride: {
        confirmed: true,
        reason: "Disposable itemId identity successful publish probe.",
      },
      lessonPlan: {
        id: FIXTURE_ITEM,
        enrichmentDraft: plan(freshItem, FIXTURE_ITEM).enrichmentDraft,
      },
    }, auth);
    ok(publishItem.status === 200 && publishItem.json?.ok === true, `itemId-keyed publish ok (${publishItem.status})`);
    const pubItem = plan(readStore(), FIXTURE_ITEM);
    ok(pubItem.enrichmentDraft == null, "itemId-keyed: enrichmentDraft cleared after Publish");
    const placedItem = findItem(pubItem, ITEM_EDIT_ITEM);
    ok(placedItem?.day === "wednesday", "itemId-keyed: weekday moves to Wednesday");
    ok(placedItem?.item?.itemId === ITEM_EDIT_ITEM, "itemId-keyed: itemId stable");
    assertPublishedCoreFields(placedItem, "itemId-keyed");
    ok(deepDiff(itemLegacyBefore, findItem(pubItem, "item-itemid-identity-legacy")?.item).length === 0,
      "itemId-keyed: legacy sibling unchanged");
    ok(deepDiff(itemCanonBefore, findItem(pubItem, "item-itemid-identity-canon")?.item).length === 0,
      "itemId-keyed: canon sibling unchanged");

    // ---------- Protected curriculum fingerprints ----------
    const afterAll = readStore();
    const invAfter = inventoryFingerprint(afterAll);
    ok(fp(plan(afterAll, SIBLING)) === siblingBeforeFp, "sibling lesson fingerprint unchanged");
    ok(fp(invAfter.resources) === fp(invBefore.resources), "resources fingerprint unchanged");
    ok(fp(invAfter.featureFlags) === fp(invBefore.featureFlags), "featureFlags fingerprint unchanged");
    ok(fp(invAfter.lessonIds) === fp(invBefore.lessonIds), "lesson ID inventory unchanged");
    ok(invAfter.lessonCount === invBefore.lessonCount, "lesson count unchanged");
    ok(fp(invAfter.activityIds) === fp(invBefore.activityIds), "activity ID inventory unchanged");
    ok(invAfter.activityCount === invBefore.activityCount, "activity count unchanged");
    invBefore.realLessons.forEach((beforeReal, idx) => {
      const afterReal = invAfter.realLessons[idx];
      ok(beforeReal.fp === afterReal.fp, `${beforeReal.id} fingerprint unchanged`);
      ok(fp(beforeReal.imageRefs) === fp(afterReal.imageRefs), `${beforeReal.id} image refs unchanged`);
    });

    if (mutations.length) {
      console.error("\nUNINTENDED MUTATIONS:", JSON.stringify(mutations, null, 2));
      throw new Error(`Publish produced ${mutations.length} unintended mutation group(s)`);
    }

    console.log(`\nPASS ${passed} checks — cur-act-* Publish identity repair`);
  } catch (error) {
    console.error("\nFAIL", error);
    if (mutations.length) console.error("Mutation report:", JSON.stringify(mutations, null, 2));
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main();
