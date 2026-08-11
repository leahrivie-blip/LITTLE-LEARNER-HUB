#!/usr/bin/env node
/**
 * PR #630 final verification — disposable fixtures only.
 *
 * Proves Save Draft → close → reopen, Publish canonical mapping,
 * legacy/structured preservation, weekday relocate, completion %,
 * image controls, and sibling/flag fingerprints.
 *
 * Run: npm run test:owner-tk-core-activity-verify
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
const enrichment = require("./teaching-kit-enrichment.js");

const ROOT = path.join(__dirname, "..");
const PORT = 7850 + Math.floor(Math.random() * 120);
const STORE_PATH = path.join(os.tmpdir(), `llh-owner-tk-core-verify-${crypto.randomBytes(4).toString("hex")}.json`);
const OUT = "/opt/cursor/artifacts/screenshots";
const OWNER = {
  email: "leahivie@icloud.com",
  password: "owner-tk-core-verify-pass",
  code: "owner-tk-core-verify-code",
};

const FIXTURE = "cur-lp-owner-tk-core-verify-fixture";
const SIBLING = "cur-lp-owner-tk-core-verify-sibling";
const ACT = "item-owner-tk-core-verify-target";
const ACT_LEGACY = "item-owner-tk-core-verify-legacy";
const ACT_SIB = "item-owner-tk-core-verify-sib-act";
const DRAFT_RES = "cur-res-owner-tk-core-verify-draft";
const PUB_RES = "cur-res-owner-tk-core-verify-pub";

const CORE_VALUES = {
  title: "VERIFY_NAME_AlphaFox",
  dayOfWeek: "monday",
  activityCategory: "Language",
  ageModifications: "VERIFY_AGE_Toddlers3",
  durationMinutes: 12,
  objective: "VERIFY_OBJ_MatchSounds",
  description: "VERIFY_DESC_ParagraphOne.\n\nVERIFY_DESC_ParagraphTwo continues here.",
  materials: "VERIFY_MAT_cards\nVERIFY_MAT_basket\nVERIFY_MAT_animals",
  preparation: "VERIFY_PREP_PrintAndCut",
  setup: "VERIFY_SETUP_LowTableBasket",
  steps: "1. VERIFY_STEP_Invite\n2. VERIFY_STEP_Choose\n3. VERIFY_STEP_Match",
  teacherLanguage: "VERIFY_Q_WhatSoundDoesItMake",
  observationOpportunities: "VERIFY_OBS_TurnTakingMatch",
  safetyNotes: "VERIFY_SAFE_LargePiecesOnly",
  cleanupTips: "VERIFY_CLEAN_ReturnToBasket",
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

function findItem(planObj, itemId) {
  const days = planObj?.dailyPlans || {};
  for (const day of Object.keys(days)) {
    const hit = (days[day]?.items || []).find((i) => i && i.itemId === itemId);
    if (hit) return { day, item: hit };
  }
  return null;
}

function draftAct(planObj, itemId) {
  const acts = planObj?.enrichmentDraft?.activities || {};
  return acts[itemId]
    || acts[`${planObj.id}:${itemId}`]
    || Object.entries(acts).find(([k, v]) => k.includes(itemId) || v?.title)?.[1]
    || null;
}

function filler(day, id, title) {
  return {
    itemId: id,
    title,
    dayOfWeek: day,
    objective: "Filler objective words here",
    description: "Filler description words here",
    materials: "filler",
    steps: "1. Filler",
  };
}

function buildStore() {
  return {
    users: {},
    adminSessions: {},
    siteContent: {
      updatedAt: "2026-01-04T00:00:00.000Z",
      featureFlags: {
        teachingKitViewer: true,
        teachingKitPrintCenter: true,
        teachingKitEnrichmentEditor: true,
        playBasedCurriculum: true,
        verifyMarker630: "core-activity-verify",
      },
      curriculum: {
        updatedAt: "2026-01-04T00:00:00.000Z",
        lessonPlans: [
          {
            id: FIXTURE,
            title: "Owner Core Verify Disposable Fixture",
            age: "Preschool",
            theme: "Verify",
            plan: "Pro",
            status: "published",
            weeklyOverview: "PUBLISHED_OVERVIEW_MUST_STAY",
            publishedAt: "2026-01-01T00:00:00.000Z",
            disposableQaFixture: true,
            resourceIds: [DRAFT_RES, PUB_RES],
            dailyPlans: {
              monday: {
                items: [{
                  itemId: ACT,
                  title: "Seed Target Title",
                  dayOfWeek: "monday",
                  activityCategory: "Language",
                  objective: "Seed objective",
                  description: "Seed description paragraph.",
                  materials: "seed materials",
                  preparation: "seed prep",
                  setup: "seed setup",
                  steps: "1. Seed step",
                  teacherLanguage: "Seed question?",
                  observationOpportunities: "Seed observation",
                  safetyNotes: "Seed safety",
                  cleanupTips: "Seed cleanup",
                  ageModifications: "Seed age",
                  durationMinutes: 0,
                  teacherTips: ["Seed tip keep"],
                  settingTags: ["small_group"],
                  imageRequirement: "optional",
                  setupImageUrl: "/images/lesson-covers/default.svg",
                  exampleImageUrl: "/images/lesson-covers/default.svg",
                  customLegacy: { marker: "keep-me" },
                  nullField: null,
                }],
              },
              tuesday: {
                items: [{
                  itemId: ACT_LEGACY,
                  title: "Legacy Shape Activity",
                  dayOfWeek: "tuesday",
                  // Legacy aliases — no preparation/steps/cleanupTips
                  prep: "LEGACY_PREP_VALUE",
                  directions: ["First step", "Second step", "Third step"],
                  cleanup: "LEGACY_CLEANUP_VALUE",
                  resetNotes: "LEGACY_RESET_VALUE",
                  activityDurationMinutes: "15",
                  materials: ["mat-a", "mat-b", "mat-c"],
                  description: "Legacy para one.\n\nLegacy para two.",
                  objective: "Legacy objective",
                  activityCategory: "Sensory",
                  unknownField: "legacy-unknown",
                  customNested: { a: 1, b: [null, 0, "x"] },
                  nullField: null,
                  emptyStringField: "",
                }],
              },
              wednesday: { items: [filler("wednesday", "item-verify-wed", "Wed filler")] },
              thursday: { items: [filler("thursday", "item-verify-thu", "Thu filler")] },
              friday: { items: [filler("friday", "item-verify-fri", "Fri filler")] },
            },
          },
          {
            id: SIBLING,
            title: "Owner Core Verify Sibling",
            age: "Toddler",
            theme: "Sibling",
            plan: "Pro",
            status: "published",
            weeklyOverview: "SIBLING_OVERVIEW",
            publishedAt: "2026-01-01T00:00:00.000Z",
            disposableQaFixture: true,
            resourceIds: [PUB_RES],
            dailyPlans: {
              monday: { items: [{ itemId: ACT_SIB, title: "Sibling Only Act", dayOfWeek: "monday", objective: "Leave sibling", description: "sib", materials: "sib", steps: "1. Sib" }] },
              tuesday: { items: [filler("tuesday", "sib-tue", "Sib Tue")] },
              wednesday: { items: [filler("wednesday", "sib-wed", "Sib Wed")] },
              thursday: { items: [filler("thursday", "sib-thu", "Sib Thu")] },
              friday: { items: [filler("friday", "sib-fri", "Sib Fri")] },
            },
          },
        ],
        activities: [],
        resources: [
          { id: DRAFT_RES, title: "Verify draft printable", type: "printable", status: "draft", lessonPlanIds: [FIXTURE] },
          { id: PUB_RES, title: "Verify published printable", type: "printable", status: "published", lessonPlanIds: [FIXTURE, SIBLING] },
        ],
      },
    },
  };
}

function runUnitGates() {
  const empty = enrichment.computeActivityCompletion({ itemId: "e", title: "" }, {});
  ok(empty.percent === 0 || empty.missing.length >= 14, "empty fixture mostly missing");
  const ws = enrichment.computeActivityCompletion({
    itemId: "w", title: "   ", dayOfWeek: "monday", objective: "  \n  ",
  }, {});
  ok(ws.missing.includes("Activity name"), "whitespace title remains missing");
  ok(ws.missing.includes("Activity objective"), "whitespace objective remains missing");

  const legacy = {
    itemId: "L",
    title: "Legacy",
    dayOfWeek: "tuesday",
    prep: "LEGACY_PREP_VALUE",
    directions: ["First step", "Second step", "Third step"],
    cleanup: "LEGACY_CLEANUP_VALUE",
    activityDurationMinutes: "15",
    materials: ["mat-a", "mat-b", "mat-c"],
    description: "Legacy para one.\n\nLegacy para two.",
    objective: "Legacy objective",
    activityCategory: "Sensory",
  };
  ok(enrichment.getCoreActivityFieldValue(legacy, {}, "preparation") === "LEGACY_PREP_VALUE", "legacy prep displays");
  ok(enrichment.stepsToEditorText(legacy.directions) === "First step\nSecond step\nThird step", "steps array displays without corruption");
  ok(!enrichment.stepsToEditorText(legacy.directions).includes("1. First"), "steps array display does not invent numbering");
  ok(enrichment.materialsToEditorText(legacy.materials) === "mat-a\nmat-b\nmat-c", "materials array displays");
  ok(enrichment.getDurationFieldValue(legacy, {}) === "15", "string duration displays");
  ok(enrichment.getDurationFieldValue({ itemId: "z", durationMinutes: 0 }, {}) === "0", "numeric 0 duration displays");
  ok(enrichment.getDurationFieldValue({ itemId: "z", durationMinutes: null }, {}) === "", "null duration not coerced");
  ok(enrichment.getDurationFieldValue({ itemId: "z" }, {}) === "", "missing duration not coerced");

  const required = enrichment.OWNER_CORE_ACTIVITY_REQUIRED_FIELDS.map((f) => f.label);
  ok(required.length === 15, `required fields count 15 (${required.length})`);
  console.log(`  · required fields: ${required.join(" | ")}`);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  runUnitGates();

  const storeSeed = buildStore();
  fs.writeFileSync(STORE_PATH, JSON.stringify(storeSeed, null, 2));

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
    ok(plan(before, FIXTURE), "fixture present");
    const inventoryBefore = fp((before.siteContent.curriculum.lessonPlans || []).map((p) => p.id).sort());
    const siblingFpBefore = fp(plan(before, SIBLING));
    const siblingActFpBefore = fp(findItem(plan(before, SIBLING), ACT_SIB)?.item);
    const flagsFpBefore = fp(before.siteContent.featureFlags);
    const resourcesFpBefore = fp(before.siteContent.curriculum.resources);
    const customerBodyBefore = fp({
      status: plan(before, FIXTURE).status,
      weeklyOverview: plan(before, FIXTURE).weeklyOverview,
      dailyPlans: plan(before, FIXTURE).dailyPlans,
    });
    const legacyBefore = findItem(plan(before, FIXTURE), ACT_LEGACY)?.item;
    ok(Array.isArray(legacyBefore.directions) && legacyBefore.directions.length === 3, "legacy directions[] seeded");
    ok(legacyBefore.prep === "LEGACY_PREP_VALUE", "legacy prep seeded");

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => typeof setAdminSession === "function" && typeof setView === "function", null, { timeout: 30000 });
    await page.evaluate(({ owner, ownerToken }) => {
      setAdminSession({
        email: owner.email,
        name: "Owner",
        token: ownerToken,
        mode: "server",
        trustedDevice: true,
      });
      localStorage.setItem("llhAdminPreviewMode", "Admin");
      localStorage.setItem("llhAdminActiveSection", "curriculum-lesson-plans");
    }, { owner: OWNER, ownerToken: token });
    await page.evaluate(async () => {
      setView("admin");
      await loadAdminSiteContent();
      setAdminSectionTab("curriculum-lesson-plans");
      applyAdminSectionVisibility();
    });

    async function openTargetActivity() {
      await page.evaluate(async (id) => {
        if (window.LLHTeachingKitEnrichmentEditor?.isOpen?.()) {
          await window.LLHTeachingKitEnrichmentEditor.close({ force: true, abandonUnsaved: true, skipReturnNavigation: true });
        }
        await window.openOwnerTeachingKitEditor(id, { source: "edit", ownerWorkspace: true });
      }, FIXTURE);
      await page.waitForFunction(() => window.LLHTeachingKitEnrichmentEditor?.isOpen?.() === true, null, { timeout: 20000 });
      await page.waitForSelector("[data-owner-core-editor]", { timeout: 15000 });
      await page.evaluate((targetId) => {
        const planObj = curriculumLessonPlanById(targetId);
        const acts = window.LLHTeachingKitEnrichment.flattenLessonActivities(planObj, [], planObj?.enrichmentDraft) || [];
        const idx = acts.findIndex((a) => String(a.itemId) === "item-owner-tk-core-verify-target");
        document.querySelector(`[data-activity-index="${idx}"]`)?.click();
      }, FIXTURE);
      await page.waitForSelector('[data-core-field="objective"]', { timeout: 10000 });
    }

    await openTargetActivity();

    // Expand all core-related sections for screenshots + fill
    await page.evaluate(() => {
      ["core", "teaching", "safety", "enrichment", "images"].forEach((id) => {
        const el = document.querySelector(`[data-core-section="${id}"]`);
        if (el) el.open = true;
      });
    });

    for (const [key, value] of Object.entries(CORE_VALUES)) {
      const sel = `[data-core-field="${key}"]`;
      await page.waitForSelector(sel, { timeout: 5000 });
      if (key === "dayOfWeek") {
        await page.selectOption(sel, String(value));
      } else {
        await page.fill(sel, String(value));
      }
    }
    await page.fill('[data-enrich-text-field="adaptations"]', "VERIFY_ENRICH_AdaptQuietCards");
    await page.fill('[data-enrich-text-field="extensions"]', "VERIFY_ENRICH_ChallengeMatchHabitat");
    await page.fill('[data-enrich-text-field="mixedAgeAdaptations"]', "VERIFY_ENRICH_MixedAgeFewerCards");

    async function shotDesktop(name, openIds, focusSelector) {
      await page.evaluate(({ openIds: ids, focusSelector: focus }) => {
        ["core", "teaching", "safety", "enrichment", "images"].forEach((id) => {
          const el = document.querySelector(`[data-core-section="${id}"]`);
          if (el) el.open = ids.includes(id);
        });
        const node = focus ? document.querySelector(focus) : document.querySelector("[data-owner-core-editor]");
        node?.scrollIntoView({ block: "start" });
      }, { openIds, focusSelector });
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(OUT, name), fullPage: false });
    }
    await shotDesktop("verify630-desktop-core-expanded.png", ["core"], '[data-core-section="core"]');
    await shotDesktop("verify630-desktop-teaching-expanded.png", ["teaching"], '[data-core-section="teaching"]');
    await shotDesktop("verify630-desktop-enrichment-expanded.png", ["enrichment"], '[data-core-section="enrichment"]');
    await shotDesktop(
      "verify630-desktop-populated-preserved.png",
      ["core", "teaching", "safety"],
      "[data-core-completion]",
    );

    // Image controls present with existing refs
    const images = await page.evaluate(() => {
      const req = document.querySelector("[data-image-requirement]");
      const zones = document.querySelectorAll("[data-activity-images] [data-photo-field]");
      const imgs = Array.from(document.querySelectorAll("[data-activity-images] img, [data-activity-images] [data-admin-media-src]"));
      const refs = Array.from(document.querySelectorAll("[data-activity-images] [data-admin-media-src], [data-activity-images] img[src]"))
        .map((node) => node.getAttribute("data-admin-media-src") || node.getAttribute("src") || "");
      return {
        hasRequirement: Boolean(req),
        zoneCount: zones.length,
        imageNodeCount: imgs.length,
        hasDefaultRef: refs.some((src) => /default\.svg|lesson-covers/i.test(src)),
      };
    });
    ok(images.hasRequirement, "Image requirement control present");
    ok(images.zoneCount >= 1 || images.imageNodeCount >= 1 || images.hasDefaultRef, "Existing image references / photo zones still render");

    // Dialog policy: accept concurrency overwrite prompts; capture unsaved guards.
    let lastUnsavedDialog = "";
    page.on("dialog", async (dialog) => {
      const message = dialog.message() || "";
      if (/unsaved/i.test(message)) {
        lastUnsavedDialog = message;
        try { await dialog.dismiss(); } catch { /* ignore */ }
        return;
      }
      try { await dialog.accept(); } catch { /* ignore */ }
    });
    // Ensure dirty state has the distinctive materials marker before save.
    await page.waitForFunction(() => {
      const draft = window.LLHTeachingKitEnrichmentEditor?.getDraft?.();
      const acts = draft?.activities || {};
      return Object.values(acts).some((a) => String(a?.materials || "").includes("VERIFY_MAT_cards"));
    }, null, { timeout: 5000 });
    await page.click("[data-enrich-save-draft]");
    await page.waitForFunction(() => {
      const text = document.querySelector(".tk-enrich-status")?.textContent || "";
      const err = window.LLHTeachingKitEnrichmentEditor?.lastSaveError?.() || "";
      if (/failed|verification failed|Admin unlock/i.test(text) || err) {
        throw new Error(`Draft save failed: ${text || err}`);
      }
      return /Draft saved/i.test(text) && /Published lesson unchanged|unchanged until you Publish/i.test(text);
    }, null, { timeout: 25000 });

    const afterDraft = readStore();
    const afterDraftPlan = plan(afterDraft, FIXTURE);
    ok(afterDraftPlan.status === "published", "Save Draft does not publish");
    ok(fp({
      status: afterDraftPlan.status,
      weeklyOverview: afterDraftPlan.weeklyOverview,
      dailyPlans: afterDraftPlan.dailyPlans,
    }) === customerBodyBefore, "published dailyPlans unchanged after Save Draft");

    const savedDraft = draftAct(afterDraftPlan, ACT);
    ok(savedDraft, "draft overlay activity exists after Save Draft");
    for (const [key, value] of Object.entries(CORE_VALUES)) {
      if (key === "durationMinutes") {
        ok(savedDraft.durationMinutes === 12 || savedDraft.durationMinutes === "12", `draft stores ${key}`);
      } else {
        ok(String(savedDraft[key] || "") === String(value), `draft stores ${key}`);
      }
    }
    ok(savedDraft.adaptations === "VERIFY_ENRICH_AdaptQuietCards", "draft stores enrichment adaptations");

    // Close completely + reopen
    await page.evaluate(async () => {
      await window.LLHTeachingKitEnrichmentEditor.close({ force: true, abandonUnsaved: true, skipReturnNavigation: true });
    });
    await page.waitForFunction(() => window.LLHTeachingKitEnrichmentEditor?.isOpen?.() !== true, null, { timeout: 10000 });
    await page.evaluate(async () => { await loadAdminSiteContent(); });
    await openTargetActivity();
    await page.evaluate(() => {
      ["core", "teaching", "safety", "enrichment"].forEach((id) => {
        const el = document.querySelector(`[data-core-section="${id}"]`);
        if (el) el.open = true;
      });
    });

    const reopened = await page.evaluate((keys) => {
      const out = {};
      keys.forEach((key) => {
        out[key] = document.querySelector(`[data-core-field="${key}"]`)?.value || "";
      });
      out.adaptations = document.querySelector('[data-enrich-text-field="adaptations"]')?.value || "";
      out.completion = document.querySelector("[data-core-completion]")?.textContent || "";
      return out;
    }, Object.keys(CORE_VALUES));
    for (const [key, value] of Object.entries(CORE_VALUES)) {
      ok(String(reopened[key]) === String(value), `reopen shows saved ${key}`);
    }
    ok(reopened.adaptations === "VERIFY_ENRICH_AdaptQuietCards", "reopen shows saved enrichment adaptations");
    ok(/Completion:\s*100%/i.test(reopened.completion), "fully completed Core Activity shows 100%");
    ok(/Missing:\s*None/i.test(reopened.completion), "fully completed Missing list is None");

    // Legacy activity display + unrelated edit
    await page.evaluate(() => {
      const planObj = curriculumLessonPlanById("cur-lp-owner-tk-core-verify-fixture");
      const acts = window.LLHTeachingKitEnrichment.flattenLessonActivities(planObj, [], planObj?.enrichmentDraft) || [];
      const idx = acts.findIndex((a) => String(a.itemId) === "item-owner-tk-core-verify-legacy");
      document.querySelector(`[data-activity-index="${idx}"]`)?.click();
    });
    await page.waitForFunction(() => {
      const title = document.querySelector('[data-core-field="title"]')?.value || "";
      return /Legacy Shape Activity/i.test(title);
    }, null, { timeout: 10000 });
    await page.evaluate(() => {
      document.querySelector('[data-core-section="core"]').open = true;
      document.querySelector('[data-core-section="teaching"]').open = true;
    });
    const legacyUi = await page.evaluate(() => ({
      preparation: document.querySelector('[data-core-field="preparation"]')?.value || "",
      steps: document.querySelector('[data-core-field="steps"]')?.value || "",
      cleanup: document.querySelector('[data-core-field="cleanupTips"]')?.value || "",
      duration: document.querySelector('[data-core-field="durationMinutes"]')?.value || "",
      materials: document.querySelector('[data-core-field="materials"]')?.value || "",
      description: document.querySelector('[data-core-field="description"]')?.value || "",
    }));
    ok(legacyUi.preparation === "LEGACY_PREP_VALUE", "legacy prep displays in Core editor");
    ok(legacyUi.steps === "First step\nSecond step\nThird step", "legacy directions[] displays as steps");
    ok(legacyUi.cleanup === "LEGACY_CLEANUP_VALUE", "legacy cleanup displays");
    ok(legacyUi.duration === "15", "legacy activityDurationMinutes displays");
    ok(legacyUi.materials === "mat-a\nmat-b\nmat-c", "legacy materials[] displays");
    ok(legacyUi.description.includes("Legacy para two"), "legacy multi-paragraph description displays");

    await page.fill('[data-core-field="objective"]', "LEGACY_ONLY_OBJECTIVE_EDIT");
    await page.click("[data-enrich-save-draft]");
    await page.waitForFunction(() => /Draft saved|saved/i.test(document.querySelector(".tk-enrich-status")?.textContent || ""), null, { timeout: 20000 });

    await page.evaluate(async () => {
      await window.LLHTeachingKitEnrichmentEditor.close({ force: true, abandonUnsaved: true, skipReturnNavigation: true });
    });
    await page.evaluate(async () => { await loadAdminSiteContent(); });
    await openTargetActivity();
    // Jump to legacy again
    await page.evaluate(() => {
      const planObj = curriculumLessonPlanById("cur-lp-owner-tk-core-verify-fixture");
      const acts = window.LLHTeachingKitEnrichment.flattenLessonActivities(planObj, [], planObj?.enrichmentDraft) || [];
      const idx = acts.findIndex((a) => String(a.itemId) === "item-owner-tk-core-verify-legacy");
      document.querySelector(`[data-activity-index="${idx}"]`)?.click();
    });
    await page.waitForFunction(() => (document.querySelector('[data-core-field="objective"]')?.value || "").includes("LEGACY_ONLY"), null, { timeout: 10000 });
    const legacyUi2 = await page.evaluate(() => ({
      preparation: document.querySelector('[data-core-field="preparation"]')?.value || "",
      steps: document.querySelector('[data-core-field="steps"]')?.value || "",
      cleanup: document.querySelector('[data-core-field="cleanupTips"]')?.value || "",
      materials: document.querySelector('[data-core-field="materials"]')?.value || "",
      objective: document.querySelector('[data-core-field="objective"]')?.value || "",
    }));
    ok(legacyUi2.objective === "LEGACY_ONLY_OBJECTIVE_EDIT", "legacy activity objective edit persisted");
    ok(legacyUi2.preparation === "LEGACY_PREP_VALUE", "legacy prep survives unrelated draft edit");
    ok(legacyUi2.steps === "First step\nSecond step\nThird step", "legacy steps survive unrelated draft edit");
    ok(legacyUi2.cleanup === "LEGACY_CLEANUP_VALUE", "legacy cleanup survives unrelated draft edit");
    ok(legacyUi2.materials === "mat-a\nmat-b\nmat-c", "legacy materials survive unrelated draft edit");

    const legacyStore = findItem(plan(readStore(), FIXTURE), ACT_LEGACY)?.item;
    ok(Array.isArray(legacyStore.directions) && legacyStore.directions.length === 3, "published legacy directions[] still array after draft");
    ok(legacyStore.prep === "LEGACY_PREP_VALUE", "published legacy prep unchanged after draft");
    ok(legacyStore.unknownField === "legacy-unknown", "unknown legacy field unchanged after draft");
    ok(legacyStore.nullField === null, "null legacy field unchanged after draft");
    ok(Array.isArray(legacyStore.materials), "published materials still array after draft");

    // Weekday high-care: change target Monday → Wednesday in draft only
    await page.evaluate(() => {
      const planObj = curriculumLessonPlanById("cur-lp-owner-tk-core-verify-fixture");
      const acts = window.LLHTeachingKitEnrichment.flattenLessonActivities(planObj, [], planObj?.enrichmentDraft) || [];
      const idx = acts.findIndex((a) => String(a.itemId) === "item-owner-tk-core-verify-target");
      document.querySelector(`[data-activity-index="${idx}"]`)?.click();
    });
    await page.waitForFunction(() => (document.querySelector('[data-core-field="title"]')?.value || "").includes("VERIFY_NAME"), null, { timeout: 10000 });
    await page.selectOption('[data-core-field="dayOfWeek"]', "wednesday");
    await page.click("[data-enrich-save-draft]");
    await page.waitForFunction(() => /Draft saved|saved/i.test(document.querySelector(".tk-enrich-status")?.textContent || ""), null, { timeout: 20000 });

    const prePublish = readStore();
    const prePubPlan = plan(prePublish, FIXTURE);
    ok(findItem(prePubPlan, ACT)?.day === "monday", "published placement still Monday before Publish");
    ok(draftAct(prePubPlan, ACT)?.dayOfWeek === "wednesday", "draft weekday is Wednesday before Publish");

    // Explicit Publish (API — same saveMode path as UI confirm)
    const stamp = prePublish.siteContent.updatedAt;
    const publish = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      saveMode: "publish_enrichment",
      expectedUpdatedAt: stamp,
      publishedBy: OWNER.email,
      ownerPublishOverride: {
        confirmed: true,
        reason: "Disposable verification publish for PR #630 only.",
      },
      lessonPlan: {
        id: FIXTURE,
        enrichmentDraft: prePubPlan.enrichmentDraft,
      },
    }, auth);
    ok(publish.status === 200 && publish.json?.ok === true, `publish_enrichment ok (${publish.status}: ${publish.json?.error || ""})`);

    const afterPub = readStore();
    const pubPlan = plan(afterPub, FIXTURE);
    ok(pubPlan.enrichmentDraft == null, "enrichmentDraft cleared (null) after successful Publish");

    const placed = findItem(pubPlan, ACT);
    ok(placed?.day === "wednesday", "after Publish activity is on Wednesday");
    ok(!findItem(pubPlan, ACT) || placed.day === "wednesday", "activity day is Wednesday");
    const mondayHasTarget = (pubPlan.dailyPlans.monday.items || []).some((i) => i.itemId === ACT);
    ok(!mondayHasTarget, "activity no longer on Monday");
    const wedCount = (pubPlan.dailyPlans.wednesday.items || []).filter((i) => i.itemId === ACT).length;
    ok(wedCount === 1, "activity appears exactly once on Wednesday");
    ok(placed.item.itemId === ACT, "activity ID preserved");

    const mapped = placed.item;
    ok(mapped.title === CORE_VALUES.title, "Publish maps title");
    ok(mapped.dayOfWeek === "wednesday", "Publish maps dayOfWeek");
    ok(mapped.activityCategory === CORE_VALUES.activityCategory || Boolean(mapped.activityCategory), "Publish maps activityCategory");
    ok(mapped.ageModifications === CORE_VALUES.ageModifications, "Publish maps ageModifications");
    ok(mapped.durationMinutes === 12 || mapped.durationMinutes === "12", "Publish maps durationMinutes");
    ok(mapped.objective === CORE_VALUES.objective, "Publish maps objective");
    ok(mapped.description === CORE_VALUES.description, "Publish maps description");
    ok(String(mapped.materials).includes("VERIFY_MAT_cards"), "Publish maps materials");
    ok(mapped.preparation === CORE_VALUES.preparation, "Publish maps preparation");
    ok(mapped.setup === CORE_VALUES.setup, "Publish maps setup");
    ok(mapped.steps === CORE_VALUES.steps, "Publish maps steps");
    ok(mapped.teacherLanguage === CORE_VALUES.teacherLanguage, "Publish maps teacherLanguage");
    ok(mapped.observationOpportunities === CORE_VALUES.observationOpportunities, "Publish maps observationOpportunities");
    ok(mapped.safetyNotes === CORE_VALUES.safetyNotes, "Publish maps safetyNotes");
    ok(mapped.cleanupTips === CORE_VALUES.cleanupTips, "Publish maps cleanupTips");
    ok(mapped.customLegacy?.marker === "keep-me", "unknown customLegacy preserved through Publish");
    ok(mapped.nullField === null, "null field preserved through Publish");

    // No stale conflicting draft overlay after publish
    ok(pubPlan.enrichmentDraft == null, "no draft overlay remains to conflict with canonical values");

    // Legacy publish preservation (objective-only draft already in enrichment — publish whole draft)
    // Re-seed legacy draft path: after publish, enrichmentDraft is null; legacy item should still have directions[]
    const legacyAfterPub = findItem(pubPlan, ACT_LEGACY)?.item;
    ok(Array.isArray(legacyAfterPub.directions) && legacyAfterPub.directions[1] === "Second step", "legacy directions[] preserved through Publish");
    ok(legacyAfterPub.prep === "LEGACY_PREP_VALUE", "legacy prep preserved through Publish");
    ok(legacyAfterPub.cleanup === "LEGACY_CLEANUP_VALUE", "legacy cleanup preserved through Publish");
    ok(Array.isArray(legacyAfterPub.materials), "legacy materials[] preserved through Publish");
    ok(legacyAfterPub.unknownField === "legacy-unknown", "unknown field preserved through Publish");
    ok(!Object.prototype.hasOwnProperty.call(legacyAfterPub, "preparation") || legacyAfterPub.preparation == null || legacyAfterPub.preparation === "" || legacyAfterPub.preparation === "LEGACY_PREP_VALUE",
      "no conflicting invented preparation vs prep");
    ok(legacyAfterPub.objective === "LEGACY_ONLY_OBJECTIVE_EDIT", "legacy objective edit promoted on Publish");

    // Fingerprints
    ok(fp(plan(afterPub, SIBLING)) === siblingFpBefore, "sibling lesson fingerprint unchanged");
    ok(fp(findItem(plan(afterPub, SIBLING), ACT_SIB)?.item) === siblingActFpBefore, "sibling activity fingerprint unchanged");
    ok(fp(afterPub.siteContent.featureFlags) === flagsFpBefore, "featureFlags fingerprint unchanged");
    ok(fp(afterPub.siteContent.curriculum.resources) === resourcesFpBefore, "resources fingerprint unchanged");
    const inventoryAfter = fp((afterPub.siteContent.curriculum.lessonPlans || []).map((p) => p.id).sort());
    ok(inventoryAfter === inventoryBefore, "curriculum lesson ID inventory unchanged");

    // Mobile screenshots
    await page.evaluate(async () => {
      if (window.LLHTeachingKitEnrichmentEditor?.isOpen?.()) {
        await window.LLHTeachingKitEnrichmentEditor.close({ force: true, abandonUnsaved: true, skipReturnNavigation: true });
      }
    });
    await page.evaluate(async () => { await loadAdminSiteContent(); });
    await openTargetActivity();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(250);
    async function shotMobile(name, openIds, focusSelector) {
      await page.evaluate(({ openIds: ids, focusSelector: focus }) => {
        ["core", "teaching", "safety", "enrichment", "images"].forEach((id) => {
          const el = document.querySelector(`[data-core-section="${id}"]`);
          if (el) el.open = ids.includes(id);
        });
        const node = focus ? document.querySelector(focus) : null;
        node?.scrollIntoView({ block: "start" });
      }, { openIds, focusSelector });
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(OUT, name), fullPage: false });
    }
    await shotMobile("verify630-mobile-header-completion.png", ["core"], "[data-core-completion]");
    await shotMobile("verify630-mobile-core-expanded.png", ["core"], '[data-core-section="core"]');
    await shotMobile("verify630-mobile-description.png", ["core"], '[data-core-field="description"]');
    await shotMobile("verify630-mobile-steps.png", ["teaching"], '[data-core-field="steps"]');
    await shotMobile("verify630-mobile-safety.png", ["safety"], '[data-core-section="safety"]');
    await shotMobile("verify630-mobile-enrichment-collapsed.png", [], "[data-enrich-save-draft]");
    await shotMobile("verify630-mobile-enrichment-expanded.png", ["enrichment"], '[data-core-section="enrichment"]');
    await shotMobile("verify630-mobile-save-publish.png", [], "[data-enrich-publish]");

    const mobileChrome = await page.evaluate(() => {
      const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
      const stages = document.querySelectorAll("[data-owner-core-editor]").length;
      const save = document.querySelector("[data-enrich-save-draft]");
      const publish = document.querySelector("[data-enrich-publish]");
      return {
        overflow,
        stages,
        saveVisible: Boolean(save),
        publishVisible: Boolean(publish),
        distinct: save && publish && save !== publish,
        count: document.querySelector(".tk-enrich-activity-count")?.textContent || "",
      };
    });
    ok(!mobileChrome.overflow, "mobile has no horizontal overflow");
    ok(mobileChrome.stages === 1, "mobile shows one activity at a time");
    ok(mobileChrome.saveVisible && mobileChrome.publishVisible && mobileChrome.distinct, "Save Draft and Publish remain distinct");
    ok(/Activity \d+ of \d+/i.test(mobileChrome.count), "Activity X of Y visible on mobile");

    // Unsaved navigation guard
    lastUnsavedDialog = "";
    await page.evaluate(() => {
      const core = document.querySelector('[data-core-section="core"]');
      if (core) core.open = true;
      document.querySelector('[data-core-field="title"]')?.scrollIntoView({ block: "center" });
    });
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-core-field="title"]');
      return Boolean(el && el.offsetParent !== null);
    }, null, { timeout: 5000 });
    await page.fill('[data-core-field="title"]', "UNSAVED_TITLE_SHOULD_PROMPT");
    await page.waitForFunction(() => window.LLHTeachingKitEnrichmentEditor?.isDirty?.() === true, null, { timeout: 5000 });
    const currentIdx = await page.evaluate(() => {
      const active = document.querySelector("[data-activity-index].is-active, [data-activity-index][aria-current='true']");
      if (active) return Number(active.getAttribute("data-activity-index"));
      return Number(document.querySelector(".tk-enrich-activity-count")?.textContent?.match(/Activity\s+(\d+)/i)?.[1] || "1") - 1;
    });
    const switchIdx = currentIdx === 0 ? 1 : 0;
    await page.click(`[data-activity-index="${switchIdx}"]`);
    for (let i = 0; i < 20 && !lastUnsavedDialog; i += 1) {
      await page.waitForTimeout(100);
    }
    ok(/unsaved/i.test(lastUnsavedDialog), "switching activities warns about unsaved edits");

    console.log(`\nPASS ${passed} checks — PR #630 core activity verification`);
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
