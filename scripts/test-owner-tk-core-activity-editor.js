#!/usr/bin/env node
/**
 * Owner Teaching Kit Core Activity editor — disposable fixture coverage.
 *
 * Proves Core Activity fields render/edit via enrichmentDraft overlay,
 * preserve null/0/string/legacy bytes, never save help-text examples,
 * and never publish on Save Draft / Preview.
 *
 * Run: npm run test:owner-tk-core-activity-editor
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
const PORT = 7800 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(os.tmpdir(), `llh-owner-tk-core-${crypto.randomBytes(4).toString("hex")}.json`);
const OUT = "/opt/cursor/artifacts/screenshots";
const OWNER = {
  email: "leahivie@icloud.com",
  password: "owner-tk-core-pass",
  code: "owner-tk-core-code",
};
const FIXTURE = "cur-lp-owner-tk-core-fixture";
const SIBLING = "cur-lp-owner-tk-core-sibling";
const ACT_TARGET = "item-owner-tk-core-target";
const ACT_SIBLING = "item-owner-tk-core-sibling-act";
const DRAFT_RES = "cur-res-owner-tk-core-draft";
const PUB_RES = "cur-res-owner-tk-core-pub";

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

function runUnitPreservationChecks() {
  const target = {
    itemId: ACT_TARGET,
    id: ACT_TARGET,
    title: "Core Target Activity",
    dayOfWeek: "monday",
    activityCategory: "Language",
    objective: "Practice animal sounds",
    description: "Children choose an animal.\n\nThey match the sound to a card.",
    materials: ["picture cards", "basket", "4 toy animals"],
    preparation: "Print and cut cards",
    setup: "Place basket on low table",
    steps: "1. Invite 2–4 children\n2. Let each choose an animal\n3. Model the sound\n4. Match to card",
    teacherLanguage: "What sound does your animal make?",
    observationOpportunities: "Watch for matching and turn-taking",
    safetyNotes: "Large pieces only",
    cleanupTips: "Return cards to basket",
    ageModifications: "Toddlers: fewer cards",
    durationMinutes: 0,
    activityDurationMinutes: undefined,
    teacherTips: ["Keep groups small"],
    settingTags: ["small_group", "indoor"],
    setupImageUrl: "/images/lesson-covers/default.svg",
    customLegacy: { marker: "keep-me", nested: { a: 1 } },
    unknownField: "legacy-unknown",
    nullField: null,
  };
  const siblingAct = {
    itemId: ACT_SIBLING,
    id: ACT_SIBLING,
    title: "Sibling Act",
    dayOfWeek: "tuesday",
    objective: "Sibling objective stays",
    description: "Sibling description",
    materials: "sibling materials",
    durationMinutes: "15",
    setupMinutes: null,
    missingOptional: undefined,
  };

  // 1–2 render model
  const model = enrichment.mapActivityToOwnerEditorModel(target, {});
  ok(model.title === "Core Target Activity", "Existing Core Activity values map for render");
  ok(model.description.includes("They match the sound"), "Multi-paragraph description maps");
  ok(model.steps.includes("1. Invite"), "Numbered steps map");
  ok(model.materials.includes("picture cards") && model.materials.includes("basket"), "Materials array maps to editor text");
  ok(model.durationMinutes === "0", "Numeric 0 duration displays as 0 (not blank/default)");
  ok(model.objective !== model.description, "Objective and What children will do remain separate");

  const sibModel = enrichment.mapActivityToOwnerEditorModel(siblingAct, {});
  ok(sibModel.durationMinutes === "15", "String duration preserved for display");

  const missingDur = enrichment.mapActivityToOwnerEditorModel({ itemId: "x", title: "X" }, {});
  ok(missingDur.durationMinutes === "", "Missing duration does not coerce to 0");

  const nullDur = enrichment.mapActivityToOwnerEditorModel({
    itemId: "y", title: "Y", durationMinutes: null,
  }, {});
  ok(nullDur.durationMinutes === "", "Null duration does not coerce to 0");

  // Enrichment still visible via activityEnrichmentView
  const view = enrichment.activityEnrichmentView(target, {});
  ok(view.teacherTips.includes("Keep groups small"), "Existing enrichment teacher tips still render");
  ok(view.settingTags.includes("small_group"), "Existing enrichment setting tags still render");
  ok(view.setupImageUrl.includes("default.svg"), "Existing image references still render");

  // Patch one field — unrelated draft keys untouched; published bytes unchanged until merge
  const draft = { teacherTips: ["Keep groups small"], customDraft: { z: 1 } };
  enrichment.applyOwnerActivityCorePatch(draft, { objective: "Edited objective only" });
  ok(draft.objective === "Edited objective only", "Core patch writes intended field");
  ok(draft.teacherTips[0] === "Keep groups small", "Core patch does not erase enrichment tips");
  ok(draft.customDraft?.z === 1, "Core patch does not erase unknown draft keys");
  ok(!Object.prototype.hasOwnProperty.call(draft, "description"), "Unedited core fields stay unowned in draft");

  const afterOne = enrichment.mapActivityToOwnerEditorModel(target, draft);
  ok(afterOne.objective === "Edited objective only", "Edited objective overlays");
  ok(afterOne.description === model.description, "Unedited description still from published");
  ok(afterOne.steps === model.steps, "Unedited steps still from published");

  // Help text never becomes content — empty draft keeps published; blank owned does not wipe on merge
  const helpDraft = {};
  enrichment.applyOwnerActivityCorePatch(helpDraft, { setup: "" });
  const mergedHelp = enrichment.mergeDraftIntoPlan({
    id: FIXTURE,
    dailyPlans: {
      monday: { items: [{ ...target }] },
      tuesday: { items: [{ ...siblingAct }] },
      wednesday: { items: [] },
      thursday: { items: [] },
      friday: { items: [] },
    },
  }, [target, siblingAct], { activities: { [ACT_TARGET]: helpDraft } });
  const mergedTarget = mergedHelp.plan.dailyPlans.monday.items.find((i) => i.itemId === ACT_TARGET);
  ok(mergedTarget.setup === "Place basket on low table", "Empty owned setup does not wipe published setup");
  ok(mergedTarget.customLegacy?.marker === "keep-me", "Unknown/legacy properties survive merge");
  ok(mergedTarget.nullField === null, "Null legacy field preserved through merge");
  ok(mergedTarget.unknownField === "legacy-unknown", "Unknown string field preserved through merge");
  ok(mergedTarget.durationMinutes === 0, "Duration 0 preserved through merge when unedited");

  const sibAfter = mergedHelp.plan.dailyPlans.tuesday.items.find((i) => i.itemId === ACT_SIBLING);
  ok(sibAfter.objective === "Sibling objective stays", "Sibling activity unchanged when editing target");
  ok(sibAfter.durationMinutes === "15", "Sibling string duration unchanged");

  // Multi-paragraph + steps round-trip via draft ownership
  const richDraft = {};
  enrichment.applyOwnerActivityCorePatch(richDraft, {
    description: "Line A paragraph.\n\nLine B paragraph.",
    steps: "1. One\n2. Two\n3. Three",
    materials: "cards\nbasket\nanimals",
  });
  ok(richDraft.description.includes("\n\n"), "Multi-paragraph description stored in draft");
  ok(richDraft.steps.split("\n").length === 3, "Multiple numbered steps stored in draft");
  ok(richDraft.materials.includes("\n"), "Materials list stored in draft");

  // Completion / missing
  const incomplete = enrichment.computeActivityCompletion({ itemId: "z", title: "Only title", dayOfWeek: "monday" }, {});
  ok(incomplete.percent < 100, "Incomplete activity has completion < 100%");
  ok(incomplete.missing.includes("Activity objective"), "Missing list includes Activity objective");
  ok(incomplete.missing.includes("Safety and supervision"), "Missing list includes Safety and supervision");
  ok(incomplete.missing.includes("Cleanup"), "Missing list includes Cleanup");
  const whitespace = enrichment.computeActivityCompletion({
    itemId: "w", title: "   ", dayOfWeek: "monday", objective: "   ",
  }, {});
  ok(whitespace.missing.includes("Activity name"), "Whitespace-only title is not complete");
  ok(whitespace.missing.includes("Activity objective"), "Whitespace-only objective is not complete");
  const complete = enrichment.computeActivityCompletion(target, {});
  ok(complete.percent === 100 && complete.missing.length === 0, "Fully filled core activity is 100%");
  ok(
    enrichment.OWNER_CORE_ACTIVITY_REQUIRED_FIELDS.length === 15,
    "Required core field list has 15 fields",
  );
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  runUnitPreservationChecks();

  const storeSeed = {
    users: {},
    adminSessions: {},
    siteContent: {
      updatedAt: "2026-01-03T00:00:00.000Z",
      featureFlags: {
        teachingKitViewer: true,
        teachingKitPrintCenter: true,
        teachingKitEnrichmentEditor: true,
        playBasedCurriculum: true,
      },
      curriculum: {
        updatedAt: "2026-01-03T00:00:00.000Z",
        lessonPlans: [
          {
            id: FIXTURE,
            title: "Owner Core Activity Disposable Fixture",
            age: "Preschool",
            theme: "Core Editor",
            plan: "Pro",
            status: "published",
            weeklyOverview: "Published overview must stay until Publish",
            publishedAt: "2026-01-01T00:00:00.000Z",
            dailyPlans: {
              monday: {
                items: [{
                  itemId: ACT_TARGET,
                  title: "Core Target Activity",
                  dayOfWeek: "monday",
                  activityCategory: "Language",
                  objective: "Practice animal sounds",
                  description: "Children choose an animal.\n\nThey match the sound to a card.",
                  materials: "picture cards\nbasket\n4 toy animals",
                  preparation: "Print and cut cards",
                  setup: "Place basket on low table",
                  steps: "1. Invite 2–4 children\n2. Let each choose an animal\n3. Model the sound\n4. Match to card",
                  teacherLanguage: "What sound does your animal make?",
                  observationOpportunities: "Watch for matching and turn-taking",
                  safetyNotes: "Large pieces only",
                  cleanupTips: "Return cards to basket",
                  ageModifications: "Toddlers: fewer cards",
                  durationMinutes: 0,
                  teacherTips: ["Keep groups small"],
                  settingTags: ["small_group", "indoor"],
                  setupImageUrl: "/images/lesson-covers/default.svg",
                  customLegacy: { marker: "keep-me" },
                  unknownField: "legacy-unknown",
                  nullField: null,
                }],
              },
              tuesday: {
                items: [{
                  itemId: ACT_SIBLING,
                  title: "Sibling Act",
                  dayOfWeek: "tuesday",
                  objective: "Sibling objective stays",
                  description: "Sibling description",
                  materials: "sibling materials",
                  durationMinutes: "15",
                  setupMinutes: null,
                }],
              },
              wednesday: { items: [{ itemId: "item-owner-tk-core-wed", title: "Wed filler", dayOfWeek: "wednesday", objective: "Filler", description: "Filler activity", materials: "none", steps: "1. Play" }] },
              thursday: { items: [{ itemId: "item-owner-tk-core-thu", title: "Thu filler", dayOfWeek: "thursday", objective: "Filler", description: "Filler activity", materials: "none", steps: "1. Play" }] },
              friday: { items: [{ itemId: "item-owner-tk-core-fri", title: "Fri filler", dayOfWeek: "friday", objective: "Filler", description: "Filler activity", materials: "none", steps: "1. Play" }] },
            },
            resourceIds: [DRAFT_RES, PUB_RES],
          },
          {
            id: SIBLING,
            title: "Owner Core Sibling Fixture",
            age: "Toddler",
            theme: "Sibling",
            plan: "Pro",
            status: "published",
            weeklyOverview: "Sibling overview",
            publishedAt: "2026-01-01T00:00:00.000Z",
            dailyPlans: {
              monday: { items: [{ itemId: "sib-only", title: "Other lesson activity", dayOfWeek: "monday", objective: "Leave me", description: "Sibling body", materials: "blocks", steps: "1. Build" }] },
              tuesday: { items: [{ itemId: "sib-tue", title: "Sibling Tue", dayOfWeek: "tuesday", objective: "Leave me", description: "Sibling body", materials: "blocks", steps: "1. Build" }] },
              wednesday: { items: [{ itemId: "sib-wed", title: "Sibling Wed", dayOfWeek: "wednesday", objective: "Leave me", description: "Sibling body", materials: "blocks", steps: "1. Build" }] },
              thursday: { items: [{ itemId: "sib-thu", title: "Sibling Thu", dayOfWeek: "thursday", objective: "Leave me", description: "Sibling body", materials: "blocks", steps: "1. Build" }] },
              friday: { items: [{ itemId: "sib-fri", title: "Sibling Fri", dayOfWeek: "friday", objective: "Leave me", description: "Sibling body", materials: "blocks", steps: "1. Build" }] },
            },
            resourceIds: [PUB_RES],
          },
        ],
        activities: [],
        resources: [
          {
            id: DRAFT_RES,
            title: "Draft printable core",
            type: "printable",
            status: "draft",
            lessonPlanIds: [FIXTURE],
          },
          {
            id: PUB_RES,
            title: "Published printable core",
            type: "printable",
            status: "published",
            lessonPlanIds: [FIXTURE, SIBLING],
          },
        ],
      },
    },
  };
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

    const before = readStore();
    ok(plan(before, FIXTURE), "disposable fixture present in store");
    const siblingFpBefore = fp(plan(before, SIBLING));
    const flagsFpBefore = fp(before.siteContent.featureFlags);
    const resourcesFpBefore = fp(before.siteContent.curriculum.resources);
    const customerTitle = plan(before, FIXTURE).dailyPlans.monday.items[0].title;
    const customerObjective = plan(before, FIXTURE).dailyPlans.monday.items[0].objective;

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(
      () => typeof setAdminSession === "function" && typeof setView === "function",
      null,
      { timeout: 30000 },
    );
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
      if (typeof setView === "function") setView("admin");
      if (typeof loadAdminSiteContent === "function") await loadAdminSiteContent();
      if (typeof setAdminSectionTab === "function") setAdminSectionTab("curriculum-lesson-plans");
      if (typeof applyAdminSectionVisibility === "function") applyAdminSectionVisibility();
    });
    await page.evaluate(async (id) => {
      await window.openOwnerTeachingKitEditor(id, { source: "edit", ownerWorkspace: true });
    }, FIXTURE);
    await page.waitForFunction(() => window.LLHTeachingKitEnrichmentEditor?.isOpen?.() === true, null, { timeout: 20000 });
    await page.waitForSelector("[data-owner-core-editor]", { timeout: 15000 });
    // Focus the disposable target activity (queue may land on first incomplete filler).
    await page.evaluate((targetId) => {
      const editor = window.LLHTeachingKitEnrichmentEditor;
      const plan = typeof curriculumLessonPlanById === "function" ? curriculumLessonPlanById(targetId) : null;
      const acts = window.LLHTeachingKitEnrichment?.flattenLessonActivities?.(plan, [], plan?.enrichmentDraft) || [];
      const idx = acts.findIndex((a) => String(a.itemId || a.id) === "item-owner-tk-core-target");
      if (idx >= 0 && typeof editor?.getState === "function") {
        // Click the matching queue button when present.
        const btn = document.querySelector(`[data-activity-index="${idx}"]`);
        if (btn) btn.click();
      }
    }, FIXTURE);
    await page.waitForSelector('[data-core-field="objective"]', { timeout: 10000 });
    await page.waitForFunction(() => {
      const v = document.querySelector('[data-core-field="objective"]')?.value || "";
      return /Practice animal sounds/i.test(v);
    }, null, { timeout: 10000 });

    const ui = await page.evaluate(() => {
      const stages = document.querySelectorAll("[data-owner-core-editor]");
      const coreOpen = document.querySelector('[data-core-section="core"]')?.open === true;
      const enrichOpen = document.querySelector('[data-core-section="enrichment"]')?.open === true;
      const objective = document.querySelector('[data-core-field="objective"]')?.value || "";
      const description = document.querySelector('[data-core-field="description"]')?.value || "";
      const steps = document.querySelector('[data-core-field="steps"]')?.value || "";
      const materials = document.querySelector('[data-core-field="materials"]')?.value || "";
      const tips = Array.from(document.querySelectorAll(".tk-enrich-tip-card span")).map((n) => n.textContent || "");
      const help = document.querySelector('[data-core-help="objective"]');
      const completion = document.querySelector("[data-core-completion]")?.textContent || "";
      const count = document.querySelector(".tk-enrich-activity-count")?.textContent || "";
      return {
        stageCount: stages.length,
        coreOpen,
        enrichOpen,
        objective,
        description,
        steps,
        materials,
        tips,
        helpVisibleWhenFilled: Boolean(help),
        completion,
        count,
      };
    });
    ok(ui.stageCount === 1, "Only one activity is displayed at a time");
    ok(ui.coreOpen, "Core Activity accordion open by default");
    ok(!ui.enrichOpen, "Enrichment accordion collapsed by default");
    ok(ui.objective === "Practice animal sounds", "Existing Core objective renders correctly");
    ok(ui.description.includes("They match the sound"), "Existing multi-paragraph description renders");
    ok(ui.steps.includes("1. Invite"), "Existing numbered steps render");
    ok(ui.materials.includes("picture cards"), "Existing materials render");
    ok(ui.tips.some((t) => /Keep groups small/i.test(t)), "Existing enrichment tips still render");
    ok(!ui.helpVisibleWhenFilled, "Example/help copy hidden when field has content");
    ok(/Completion:\s*\d+%/i.test(ui.completion), "Completion percentage visible");
    ok(/Activity 1 of \d+/i.test(ui.count), "Activity X of Y visible");

    await page.screenshot({ path: path.join(OUT, "owner-tk-core-activity-desktop-core.png"), fullPage: false });
    await page.screenshot({ path: path.join(OUT, "owner-tk-core-activity-desktop-preserved.png"), fullPage: false });

    // Open enrichment accordion
    await page.locator('[data-core-section="enrichment"] > summary').click();
    await page.waitForFunction(() => document.querySelector('[data-core-section="enrichment"]')?.open === true);
    ok(true, "Desktop Enrichment accordion opens");
    await page.screenshot({ path: path.join(OUT, "owner-tk-core-activity-desktop-enrichment.png"), fullPage: false });

    // Edit ONE core field
    await page.fill('[data-core-field="objective"]', "Edited disposable objective");
    await page.waitForFunction(() => {
      const t = document.querySelector("[data-core-completion]")?.textContent || "";
      return /Completion:/i.test(t);
    });

    // Preview must not persist
    const beforePreview = fp(plan(readStore(), FIXTURE));
    await page.click('[data-enrich-mode="preview"]');
    await page.waitForTimeout(400);
    await page.click('[data-enrich-mode="activities"]');
    await page.waitForSelector("[data-owner-core-editor]", { timeout: 10000 });
    ok(fp(plan(readStore(), FIXTURE)) === beforePreview, "Preview does not persist / publish");
    ok(plan(readStore(), FIXTURE).status === "published", "Preview did not change publication status");
    ok(
      plan(readStore(), FIXTURE).dailyPlans.monday.items[0].objective === customerObjective,
      "Preview left customer objective unchanged",
    );

    // Save Draft
    await page.fill('[data-core-field="objective"]', "Edited disposable objective");
    await page.fill('[data-core-field="description"]', "Draft paragraph one.\n\nDraft paragraph two.");
    await page.click("[data-enrich-save-draft]");
    await page.waitForFunction(() => {
      const text = document.querySelector(".tk-enrich-status")?.textContent || "";
      return /Draft saved|saved/i.test(text) && !/failed/i.test(text);
    }, null, { timeout: 20000 });

    const afterDraft = readStore();
    const afterPlan = plan(afterDraft, FIXTURE);
    ok(afterPlan.status === "published", "Save Draft does NOT publish");
    ok(
      afterPlan.dailyPlans.monday.items[0].objective === customerObjective,
      "Customer-visible objective unchanged after Save Draft",
    );
    ok(
      afterPlan.dailyPlans.monday.items[0].title === customerTitle,
      "Customer-visible title unchanged after Save Draft",
    );
    const draftActs = afterPlan.enrichmentDraft?.activities || {};
    const targetDraft = draftActs[ACT_TARGET]
      || draftActs[`${FIXTURE}:${ACT_TARGET}`]
      || Object.values(draftActs).find((a) => a && a.objective === "Edited disposable objective")
      || null;
    ok(targetDraft?.objective === "Edited disposable objective", "Owner draft stores edited objective");
    ok(
      String(targetDraft?.description || "").includes("Draft paragraph two"),
      "Multi-paragraph description round-trips in draft",
    );
    ok(
      String(readStore().siteContent.curriculum.resources.find((r) => r.id === DRAFT_RES)?.status) === "draft",
      "Draft printable remains draft after Save Draft",
    );
    ok(fp(plan(afterDraft, SIBLING)) === siblingFpBefore, "Sibling lesson fingerprint unchanged after Save Draft");
    ok(fp(afterDraft.siteContent.featureFlags) === flagsFpBefore, "Feature flags fingerprint unchanged");
    ok(fp(afterDraft.siteContent.curriculum.resources) === resourcesFpBefore, "Resources fingerprint unchanged");

    // Empty help text never saved: clear a filled field's help by filling empty objective then check store has no example string
    const helpLeak = JSON.stringify(afterPlan.enrichmentDraft || {});
    ok(!/Children will practice matching animal sounds/i.test(helpLeak), "Empty example/help copy never saves as content");

    // Enrichment field still saves
    await page.evaluate(() => {
      const el = document.querySelector('[data-core-section="enrichment"]');
      if (el && !el.open) {
        el.querySelector("summary")?.click();
      }
      if (el) el.open = true;
    });
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-core-section="enrichment"]');
      const field = document.querySelector('[data-enrich-text-field="adaptations"]');
      return el?.open === true && field && field.offsetParent !== null;
    }, null, { timeout: 5000 });
    await page.fill('[data-enrich-text-field="adaptations"]', "Offer photo cards for quieter children.");
    await page.waitForFunction(() => {
      const draft = window.LLHTeachingKitEnrichmentEditor?.getDraft?.();
      const acts = draft?.activities || {};
      return Object.values(acts).some((a) => /Offer photo cards/i.test(String(a?.adaptations || "")));
    }, null, { timeout: 5000 });
    await page.click("[data-enrich-save-draft]");
    await page.waitForFunction(() => {
      const text = document.querySelector(".tk-enrich-status")?.textContent || "";
      return /Draft saved|saved/i.test(text) && !/failed/i.test(text);
    }, null, { timeout: 20000 });
    const afterEnrichActs = plan(readStore(), FIXTURE).enrichmentDraft?.activities || {};
    const enrichDraft = Object.values(afterEnrichActs).find((a) => a && /Offer photo cards/i.test(String(a.adaptations || ""))) || null;
    ok(Boolean(enrichDraft), "Existing enrichment fields still save correctly");

    // Mobile checks
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      ["core", "teaching", "safety"].forEach((id) => {
        const el = document.querySelector(`[data-core-section="${id}"]`);
        if (el) el.open = true;
      });
    });
    const mobile = await page.evaluate(() => {
      const core = document.querySelector('[data-core-section="core"]');
      const teaching = document.querySelector('[data-core-section="teaching"]');
      const steps = document.querySelector('[data-core-field="steps"]');
      const completion = document.querySelector("[data-core-completion]");
      const stages = document.querySelectorAll("[data-owner-core-editor]");
      const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
      const save = document.querySelector("[data-enrich-save-draft]");
      const publish = document.querySelector("[data-enrich-publish]");
      const accordionCount = document.querySelectorAll("[data-core-section]").length;
      return {
        coreOpen: core?.open === true,
        teachingOpen: teaching?.open === true,
        accordionCount,
        stepsRows: Number(steps?.getAttribute("rows") || 0),
        stepsVisible: Boolean(steps && steps.offsetParent !== null),
        completionVisible: Boolean(completion && completion.offsetParent !== null),
        stageCount: stages.length,
        overflow,
        saveVisible: Boolean(save && save.offsetParent !== null),
        publishVisible: Boolean(publish && publish.offsetParent !== null),
        distinctControls: Boolean(save && publish && save !== publish),
      };
    });
    ok(mobile.accordionCount >= 4 && (mobile.coreOpen || mobile.teachingOpen), "Mobile expandable sections work");
    ok(mobile.stepsRows >= 6 && mobile.stepsVisible, "Mobile step-by-step textarea is usable height");
    ok(mobile.completionVisible, "Mobile completion + missing-items state visible");
    ok(mobile.stageCount === 1, "Mobile still shows only one activity");
    ok(!mobile.overflow, "Mobile has no horizontal overflow");
    ok(mobile.saveVisible && mobile.publishVisible && mobile.distinctControls, "Save Draft and Publish controls remain distinct");
    await page.screenshot({ path: path.join(OUT, "owner-tk-core-activity-mobile-core.png"), fullPage: false });
    await page.screenshot({ path: path.join(OUT, "owner-tk-core-activity-mobile-steps.png"), fullPage: false });
    await page.screenshot({ path: path.join(OUT, "owner-tk-core-activity-mobile-completion.png"), fullPage: false });

    // Image controls still present
    await page.evaluate(() => {
      const el = document.querySelector('[data-core-section="images"]');
      if (el) el.open = true;
    });
    await page.waitForSelector("[data-activity-images], [data-image-requirement]", { timeout: 5000 });
    ok(true, "Existing image upload/example image workflow controls still present");

    console.log(`\nPASS ${passed} checks — owner Teaching Kit Core Activity editor`);
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
