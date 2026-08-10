#!/usr/bin/env node
/**
 * Disposable-fixture coverage for Admin Teaching Kit editor open/focus fixes:
 * 1) Upgrade Lesson + Edit open the same owner Teaching Kit editor
 * 2) Structured printable ideas never render as [object Object]
 * 3) Focused workspace unmounts Lesson Plans list chrome
 *
 * Does not publish, mutate Farm Animals / All About Me / Amazing Apples content,
 * or change customer Teaching Kit feature flags.
 *
 * Run: npm run test:tk-editor-open-focus-printables
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
const PORT = 7600 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(os.tmpdir(), `llh-tk-open-focus-${crypto.randomBytes(4).toString("hex")}.json`);
const OUT = "/opt/cursor/artifacts/screenshots";
const OWNER = {
  email: "leahivie@icloud.com",
  password: "tk-open-focus-pass",
  code: "tk-open-focus-code",
};
const PRO_USER = "tk-open-focus-pro@example.com";
const FIXTURE = "cur-lp-tk-editor-open-focus-fixture";
const AAM = "cur-lp-preschool-all-about-me";
const APPLES = "cur-lp-toddler-amazing-apples";
const FARM = "cur-lp-preschool-farm-animals";
const enrichment = require("./teaching-kit-enrichment.js");

const MINIMAL_PDF = Buffer.from(
  "%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n",
  "utf8",
);
const PDF_DATA_URL = `data:application/pdf;base64,${MINIMAL_PDF.toString("base64")}`;
const PNG_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
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

function fingerprint(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
}

/** Stable content fingerprint — ignores timestamps and normalize-only null→0 minutes. */
function fingerprintProtectedPlan(plan) {
  const p = plan && typeof plan === "object" ? plan : {};
  const scrub = (value) => {
    if (Array.isArray(value)) return value.map(scrub);
    if (!value || typeof value !== "object") return value;
    const out = {};
    Object.keys(value).sort().forEach((key) => {
      if (key === "updatedAt" || key === "createdAt" || key === "publishedAt") return;
      let next = value[key];
      if (key === "setupMinutes" && (next == null || next === 0)) next = 0;
      out[key] = scrub(next);
    });
    return out;
  };
  return fingerprint(scrub({
    id: p.id || "",
    title: p.title || "",
    status: p.status || "",
    age: p.age || "",
    theme: p.theme || "",
    plan: p.plan || "",
    weeklyOverview: p.weeklyOverview || "",
    objectives: p.objectives || "",
    weeklyMaterials: p.weeklyMaterials || "",
    vocabularyWords: p.vocabularyWords || "",
    familyConnection: p.familyConnection || "",
    books: p.books || [],
    songs: p.songs || [],
    resourceIds: p.resourceIds || [],
    dailyPlans: p.dailyPlans || {},
    enrichmentDraft: p.enrichmentDraft || null,
    enrichmentPublished: p.enrichmentPublished || null,
  }));
}

function loadSeedPackage(dir) {
  return JSON.parse(fs.readFileSync(
    path.join(ROOT, "docs/curriculum-draft-review/seed", dir, "enrichment-draft.json"),
    "utf8",
  ));
}

function protectedPlanFromSeed(id, dir, title) {
  const pack = loadSeedPackage(dir);
  const plan = JSON.parse(JSON.stringify(pack.plan || {}));
  plan.id = id;
  plan.title = plan.title || title;
  plan.status = "published";
  plan.enrichmentDraft = JSON.parse(JSON.stringify(pack.enrichmentDraft || {}));
  plan.disposableQaFixture = false;
  return plan;
}

function fixturePlan() {
  return {
    id: FIXTURE,
    title: "TK Editor Open Focus Fixture",
    age: "Preschool",
    theme: "Colors",
    plan: "Pro",
    status: "draft",
    weeklyOverview: "Disposable fixture — do not publish.",
    objectives: "Sort colors",
    weeklyMaterials: "Color cards",
    vocabularyWords: "red\nblue",
    familyConnection: "Find colors at home",
    books: [],
    songs: [],
    resourceIds: [],
    dailyPlans: {
      monday: {
        theme: "Red day",
        items: [{
          id: "cur-act-tk-open-focus-1",
          title: "Color sorting tray",
          category: "Small Group",
          imageRequirement: "no_image_needed",
        }],
      },
      tuesday: { theme: "Blue day", items: [] },
      wednesday: { theme: "Green day", items: [] },
      thursday: { theme: "Yellow day", items: [] },
      friday: { theme: "Rainbow day", items: [] },
    },
    enrichmentDraft: {
      updatedAt: new Date().toISOString(),
      lastEditedBy: OWNER.email,
      previewReady: false,
      activities: {},
      week: {
        weeklyOverview: "Fixture week overview",
        books: ["Color Zoo"],
        songs: ["Rainbow Song"],
        printableIdeas: [
          {
            title: "Fixture Color Sort Pack",
            type: "PDF pack",
            purpose: "Practice color matching",
            description: "Mats and cards for tray work",
            instructions: "Print on cardstock; cut on dashed lines.",
            ageGroup: "Preschool",
            theme: "Colors",
            pageCount: 4,
            relatedActivity: "Color sorting tray",
            accessLevel: "pro",
            notes: "Laminate if possible",
          },
          "Legacy string printable idea",
        ],
      },
    },
    disposableQaFixture: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function farmPlaceholderPlan() {
  return {
    id: FARM,
    title: "Farm Animals",
    age: "Preschool",
    theme: "Farm Animals",
    plan: "Pro",
    status: "published",
    weeklyOverview: "Protected fingerprint placeholder — never edit in this test.",
    objectives: "Name farm animals",
    weeklyMaterials: "Toy animals",
    vocabularyWords: "cow\npig",
    familyConnection: "Talk about farms",
    books: [],
    songs: [],
    resourceIds: [],
    dailyPlans: {
      monday: { theme: "Barn", items: [] },
      tuesday: { theme: "Mud", items: [] },
      wednesday: { theme: "Eggs", items: [] },
      thursday: { theme: "Hay", items: [] },
      friday: { theme: "Celebrate", items: [] },
    },
    disposableQaFixture: false,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    publishedAt: "2024-01-01T00:00:00.000Z",
  };
}

function unitPrintableChecks() {
  console.log("\nUnit: printable normalize / merge / AI apply");
  const objectIdea = {
    title: "Unit Pack",
    type: "Worksheet",
    purpose: "Practice counting",
    description: "1–10 cards",
    instructions: "Cut apart",
    ageGroup: "Toddler",
    theme: "Numbers",
    pageCount: 3,
    relatedActivity: "Counting basket",
    accessLevel: "free",
    notes: "Use crayons",
    customTag: "keep-me",
  };
  const normalized = enrichment.normalizePrintableIdea(objectIdea);
  ok(normalized.title === "Unit Pack", "normalize keeps title");
  ok(normalized.ageGroup === "Toddler", "normalize keeps ageGroup");
  ok(normalized.theme === "Numbers", "normalize keeps theme");
  ok(normalized.pageCount === 3, "normalize keeps pageCount");
  ok(normalized.relatedActivity === "Counting basket", "normalize keeps relatedActivity");
  ok(normalized.customTag === "keep-me", "normalize keeps scalar metadata");
  ok(!JSON.stringify(normalized).includes("[object Object]"), "normalized JSON has no [object Object]");

  const legacy = enrichment.normalizePrintableIdea("Legacy string idea");
  ok(legacy && legacy.title === "Legacy string idea", "legacy string printable still works");

  const merged = enrichment.mergeDraftIntoPlan(
    { id: FIXTURE, title: "Fixture", teachingKit: {}, dailyPlans: {} },
    [],
    { week: { printableIdeas: [objectIdea, "Legacy string idea"] }, activities: {} },
  );
  const mergedIdeas = merged.plan?.teachingKit?.printableIdeas || [];
  ok(mergedIdeas.some((idea) => idea && idea.title === "Unit Pack" && idea.pageCount === 3),
    "merge preserves structured printable properties");
  ok(mergedIdeas.some((idea) => idea && idea.title === "Legacy string idea"),
    "merge preserves legacy string ideas as objects with title");

  const applied = enrichment.applySuggestionsToDraft(
    { week: { printableIdeas: [objectIdea] }, activities: {} },
    [{
      id: "sug-print-1",
      field: "printableIdeas",
      decision: "accepted",
      proposedValue: {
        title: "AI Suggested Pack",
        type: "PDF",
        purpose: "Extra practice",
        ageGroup: "Preschool",
        theme: "Colors",
        pageCount: 2,
      },
    }],
  );
  ok(
    Array.isArray(applied.draft.week.printableIdeas)
      && applied.draft.week.printableIdeas.some((idea) => idea.title === "AI Suggested Pack" && idea.pageCount === 2),
    "AI apply keeps structured printable properties",
  );
  ok(!JSON.stringify(applied.draft.week.printableIdeas).includes("[object Object]"),
    "AI-applied printable JSON has no [object Object]");
}

async function unlockPage(page, token) {
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
  await page.waitForSelector(`[data-curriculum-lesson-enrich="${FIXTURE}"], [data-curriculum-lesson-edit="${FIXTURE}"]`, {
    timeout: 20000,
  });
}

async function assertEditorOpen(page, label) {
  await page.waitForFunction(
    () => document.body.classList.contains("tk-enrich-open")
      && Boolean(document.querySelector(".tk-enrich-shell"))
      && Boolean(window.LLHTeachingKitEnrichmentEditor?.isOpen?.()),
    null,
    { timeout: 15000 },
  );
  const state = await page.evaluate(() => {
    const list = document.querySelector("#adminCurriculumLessonPlanList");
    const cards = document.querySelectorAll("[data-curriculum-lesson-enrich], [data-curriculum-lesson-edit]");
    const filters = document.querySelector(".admin-content-filters");
    const importer = document.querySelector("#adminCurriculumLessonImportPanel, [data-curriculum-lesson-import]");
    return {
      planId: window.LLHTeachingKitEnrichmentEditor?.getState?.()?.planId || "",
      shellCount: document.querySelectorAll(".tk-enrich-shell").length,
      listPresent: Boolean(list),
      cardCount: cards.length,
      filtersPresent: Boolean(filters),
      importerPresent: Boolean(importer),
      focusedHint: Boolean(document.querySelector("[data-tk-editor-focused-workspace], [data-tk-editor-focused-hint]")),
      objectBug: (document.querySelector(".tk-enrich-shell")?.innerText || "").includes("[object Object]")
        || document.body.innerText.includes("[object Object]"),
      backLabel: document.querySelector("[data-enrich-back-to-list]")?.textContent || "",
    };
  });
  ok(state.planId === FIXTURE, `${label}: correct disposable lesson open`);
  ok(state.shellCount === 1, `${label}: single editor shell (no duplicates)`);
  ok(!state.listPresent && state.cardCount === 0, `${label}: lesson cards unmounted while editing`);
  ok(!state.filtersPresent, `${label}: filters unmounted while editing`);
  ok(state.focusedHint, `${label}: focused workspace hint present`);
  ok(!state.objectBug, `${label}: no [object Object] in editor`);
  ok(/Back to Lesson Plans/i.test(state.backLabel), `${label}: Back to Lesson Plans action present`);
  return state;
}

async function openViaUpgrade(page, label) {
  const btn = page.locator(`[data-curriculum-lesson-enrich="${FIXTURE}"]`).first();
  await btn.waitFor({ state: "visible", timeout: 15000 });
  await btn.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT, `${label}-before-upgrade.png`), fullPage: false });
  try {
    await btn.click({ timeout: 5000 });
  } catch {
    await page.evaluate((id) => {
      const el = document.querySelector(`[data-curriculum-lesson-enrich="${id}"]`);
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    }, FIXTURE);
  }
  await assertEditorOpen(page, `${label}/upgrade`);
  await page.screenshot({ path: path.join(OUT, `${label}-after-upgrade-editor.png`), fullPage: false });
}

async function openViaEdit(page, label) {
  const btn = page.locator(`[data-curriculum-lesson-edit="${FIXTURE}"]`).first();
  await btn.waitFor({ state: "visible", timeout: 15000 });
  try {
    await btn.click({ timeout: 5000 });
  } catch {
    await page.evaluate((id) => {
      const el = document.querySelector(`[data-curriculum-lesson-edit="${id}"]`);
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    }, FIXTURE);
  }
  await assertEditorOpen(page, `${label}/edit`);
  await page.screenshot({ path: path.join(OUT, `${label}-after-edit-editor.png`), fullPage: false });
}

async function closeEditor(page) {
  await page.evaluate(async () => {
    if (window.LLHTeachingKitEnrichmentEditor?.isOpen?.()) {
      await window.LLHTeachingKitEnrichmentEditor.close({ force: true, abandonUnsaved: true });
    }
    if (window.LLHLessonReviewEditor?.isOpen?.()) {
      await window.LLHLessonReviewEditor.close({ force: true });
    }
  });
  await page.waitForFunction(
    () => !document.body.classList.contains("tk-enrich-open")
      && !window.LLHTeachingKitEnrichmentEditor?.isOpen?.(),
    null,
    { timeout: 10000 },
  );
}

async function verifyWeekPrintables(page, label) {
  const weekTab = page.locator('[data-enrich-mode="week"]').first();
  if (await weekTab.count()) {
    await weekTab.click({ timeout: 5000 }).catch(async () => weekTab.click({ force: true }));
  } else {
    await page.evaluate((id) => window.openOwnerTeachingKitEditor(id, { initialMode: "week", source: "upgrade" }), FIXTURE);
    await page.waitForSelector(".tk-enrich-shell", { timeout: 10000 });
  }
  await page.waitForTimeout(350);
  const week = await page.evaluate(() => {
    const shell = document.querySelector(".tk-enrich-shell");
    const text = shell?.innerText || "";
    const html = shell?.innerHTML || "";
    const ideas = [...document.querySelectorAll(".tk-enrich-printable-idea")].map((el) => el.innerText);
    return { text, html, ideas, objectBug: text.includes("[object Object]") || html.includes("[object Object]") };
  });
  ok(!week.objectBug, `${label}: week printable ideas have no [object Object]`);
  ok(week.ideas.some((t) => /Fixture Color Sort Pack/i.test(t)), `${label}: structured printable title visible`);
  ok(week.ideas.some((t) => /Age group/i.test(t) && /Preschool/i.test(t)), `${label}: age group label rendered`);
  ok(week.ideas.some((t) => /Page count/i.test(t)), `${label}: page count label rendered`);
  ok(week.ideas.some((t) => /Legacy string printable idea/i.test(t)), `${label}: legacy string printable still renders`);
  await page.screenshot({ path: path.join(OUT, `${label}-week-printables.png`), fullPage: false });
}

async function verifyPrintableUploader(page, label) {
  // Ensure week mode + linked resources visible.
  const createBtn = page.locator("[data-tk-printable-create], button:has-text('Create / Upload Printable')").first();
  if (!(await createBtn.count())) {
    await page.locator('[data-enrich-mode="week"]').first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
  }
  const openCreate = page.locator("button:has-text('Create / Upload Printable'), [data-tk-printable-create]").first();
  await openCreate.waitFor({ state: "visible", timeout: 10000 });
  await openCreate.click({ timeout: 5000 }).catch(async () => openCreate.click({ force: true }));
  await page.waitForSelector("#adminTkPrintableForm", { timeout: 10000 });
  const fields = await page.evaluate(() => {
    const form = document.querySelector("#adminTkPrintableForm");
    const names = [...form.querySelectorAll("[data-tk-printable-field]")].map((el) => el.getAttribute("data-tk-printable-field"));
    return {
      names,
      title: Boolean(form.querySelector('[data-tk-printable-field="title"]')),
      type: Boolean(form.querySelector('[data-tk-printable-field="type"], [data-tk-printable-field="resourceType"]')),
      age: Boolean(form.querySelector('[data-tk-printable-field="ageGroup"], [data-tk-printable-field="age"]')),
      theme: Boolean(form.querySelector('[data-tk-printable-field="theme"]')),
      description: Boolean(form.querySelector('[data-tk-printable-field="description"]')),
      pageCount: Boolean(form.querySelector('[data-tk-printable-field="pageCount"]')),
      access: Boolean(form.querySelector('[data-tk-printable-field="accessLevel"], [data-tk-printable-field="plan"]')),
      instructions: Boolean(form.querySelector('[data-tk-printable-field="printingInstructions"], [data-tk-printable-field="instructions"]')),
      pdf: Boolean(form.querySelector('[data-tk-printable-field="pdfFile"]')),
      preview: Boolean(form.querySelector('[data-tk-printable-field="previewFile"]')),
    };
  });
  ok(fields.title && fields.description && fields.pageCount && fields.pdf && fields.preview, `${label}: Create / Upload Printable required fields present`);
  ok(fields.type && fields.age && fields.theme && fields.access && fields.instructions, `${label}: metadata fields present`);

  // Metadata survives a harmless re-render.
  await page.fill('#adminTkPrintableForm [data-tk-printable-field="title"]', "Focus Fixture Printable");
  await page.evaluate(() => {
    if (typeof window.hydrateAdminTkPrintableForm === "function") window.hydrateAdminTkPrintableForm();
  });
  const titleAfter = await page.inputValue('#adminTkPrintableForm [data-tk-printable-field="title"]');
  ok(titleAfter === "Focus Fixture Printable", `${label}: printable title survives hydrate/rerender`);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  unitPrintableChecks();

  console.log("\nSource guards");
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const editorJs = fs.readFileSync(path.join(ROOT, "scripts/teaching-kit-enrichment-editor.js"), "utf8");
  const enrichJs = fs.readFileSync(path.join(ROOT, "scripts/teaching-kit-enrichment.js"), "utf8");
  ok(appJs.includes("function openOwnerTeachingKitEditor"), "shared opener present");
  ok(appJs.includes("captureAdminLessonListViewState"), "list view capture present");
  ok(appJs.includes("restoreAdminLessonListAfterTkEditorClose"), "list restore helper present");
  ok(appJs.includes("editingWithFocusedOwnerEditor"), "focused unmount branch present");
  ok(editorJs.includes("ownerWorkspace"), "ownerWorkspace bypass present");
  ok(editorJs.includes("renderPrintableIdeaListItem"), "structured printable renderer present");
  ok(editorJs.includes("Age group"), "printable age group label present");
  ok(enrichJs.includes("normalizePrintableIdea"), "normalizePrintableIdea present");
  ok(!/Printable idea:<\/strong> \$\{esc\(idea\)\}/.test(editorJs), "no esc(idea) coercion path");

  const aam = protectedPlanFromSeed(AAM, "all-about-me", "All About Me");
  const apples = protectedPlanFromSeed(APPLES, "amazing-apples", "Amazing Apples");
  const farm = farmPlaceholderPlan();
  const flagsBefore = {
    teachingKitViewer: false,
    teachingKitPrintCenter: false,
    teachingKitAttachments: false,
    teachingKitEnrichmentEditor: false,
    teachingKitAuthoring: false,
    teachingKitCurriculumDirector: false,
    teachingKitQualityReview: false,
  };

  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {
      [PRO_USER]: {
        email: PRO_USER,
        plan: "Pro",
        membershipStatus: "active",
        stripeSubscriptionStatus: "active",
        status: "active",
      },
    },
    siteContent: {
      featureFlags: { ...flagsBefore },
      curriculum: {
        lessonPlans: [fixturePlan(), aam, apples, farm],
        activities: [],
        resources: [],
        updatedAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    },
    adminSessions: {},
  }, null, 2));

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: OWNER.email,
      ADMIN_PASSWORD: OWNER.password,
      ADMIN_ACCESS_CODE: OWNER.code,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      LLH_ENFORCE_TK_OWNER_ADMIN: "1",
      LLH_SKIP_STARTUP_CURRICULUM_SEED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (d) => { stderr += String(d); });

  const browser = await chromium.launch({ headless: true });
  try {
    await waitForHealth(child);
    const login = await requestJson("POST", "/api/admin/login", {
      email: OWNER.email,
      password: OWNER.password,
      code: OWNER.code,
    });
    ok(login.status === 200 && login.json?.token, "owner admin login");
    const token = login.json.token;
    const auth = { Authorization: `Bearer ${token}` };

    const baseline = await requestJson("GET", "/api/admin/site-content", null, auth);
    ok(baseline.status === 200, "baseline site content loaded");
    const baselinePlans = baseline.json?.siteContent?.curriculum?.lessonPlans || [];
    const protectedBefore = {};
    for (const id of [AAM, APPLES, FARM]) {
      const plan = baselinePlans.find((p) => p.id === id);
      ok(plan, `${id}: present in baseline store`);
      protectedBefore[id] = fingerprintProtectedPlan(plan);
    }
    const flagsBaseline = baseline.json?.siteContent?.featureFlags || {};
    for (const key of Object.keys(flagsBefore)) {
      ok(flagsBaseline[key] === false, `baseline flag ${key} is false`);
    }

    // Auth: draft printable endpoints reject logged-out / forged claims.
    const forged = await requestJson("POST", "/api/admin/curriculum/resources/tk-printable", {
      action: "create",
      lessonPlanId: FIXTURE,
      title: "Should Fail",
      email: OWNER.email,
      role: "owner",
      fileData: PDF_DATA_URL,
      fileName: "fail.pdf",
    }, {});
    ok(forged.status === 401 || forged.status === 403, `logged-out create rejected (${forged.status})`);

    const desktop = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });

    for (const [label, context] of [["desktop", desktop], ["mobile", mobile]]) {
      console.log(`\nBrowser: ${label}`);
      const page = await context.newPage();
      const consoleErrors = [];
      const pageErrors = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") {
          const text = msg.text();
          if (/cloud-browser|extension|favicon/i.test(text)) return;
          consoleErrors.push(text);
        }
      });
      page.on("pageerror", (err) => {
        const text = String(err?.message || err);
        if (/cloud-browser|extension/i.test(text)) return;
        pageErrors.push(text);
      });

      await unlockPage(page, token);

      // Set a filter + scroll so Back can restore them.
      await page.evaluate(() => {
        if (typeof adminCurriculumListFilters === "object" && adminCurriculumListFilters) {
          adminCurriculumListFilters.status = "draft";
        }
        if (typeof renderAdminCurriculumLessonPlanManager === "function") {
          renderAdminCurriculumLessonPlanManager();
        }
        window.scrollTo(0, 240);
        const list = document.querySelector("#adminCurriculumLessonPlanList");
        if (list) list.scrollTop = 80;
      });
      await page.waitForSelector(`#adminCurriculumFilterStatus`, { timeout: 10000 });
      const beforeView = await page.evaluate(() => ({
        status: document.querySelector("#adminCurriculumFilterStatus")?.value || "",
        scrollY: window.scrollY,
      }));
      ok(beforeView.status === "draft", `${label}: draft filter applied before open`);

      await openViaUpgrade(page, label);
      await verifyWeekPrintables(page, label);

      // Double-click while open must not spawn a second shell.
      const dup = await page.evaluate(async (id) => {
        const a = window.openOwnerTeachingKitEditor(id, { source: "upgrade" });
        const b = window.openOwnerTeachingKitEditor(id, { source: "edit" });
        await Promise.all([a, b]);
        return document.querySelectorAll(".tk-enrich-shell").length;
      }, FIXTURE);
      ok(dup === 1, `${label}: rapid reopen keeps a single editor`);

      await verifyPrintableUploader(page, label);

      await page.locator("[data-enrich-back-to-list], [data-enrich-exit]").first().click({ timeout: 5000 })
        .catch(async () => closeEditor(page));
      await page.waitForFunction(
        () => !window.LLHTeachingKitEnrichmentEditor?.isOpen?.()
          && Boolean(document.querySelector("#adminCurriculumLessonPlanList")),
        null,
        { timeout: 10000 },
      );
      const restored = await page.evaluate(() => ({
        status: document.querySelector("#adminCurriculumFilterStatus")?.value || "",
        listPresent: Boolean(document.querySelector("#adminCurriculumLessonPlanList")),
        cards: document.querySelectorAll("[data-curriculum-lesson-enrich], [data-curriculum-lesson-edit]").length,
      }));
      ok(restored.listPresent && restored.cards > 0, `${label}: lesson list restored after Back`);
      ok(restored.status === beforeView.status, `${label}: filter status restored after Back`);

      // Failed open (editor closed) shows error and restores CTA (never stuck on Opening…).
      const fail = await page.evaluate(async () => {
        const btn = document.createElement("button");
        btn.textContent = "Upgrade Lesson";
        document.body.appendChild(btn);
        const opened = await window.openOwnerTeachingKitEditor("cur-lp-does-not-exist-open-focus", {
          source: "upgrade",
          button: btn,
        });
        const labelNow = btn.textContent;
        const busy = btn.getAttribute("aria-busy");
        const banner = document.querySelector("[data-upgrade-lesson-error]")?.textContent || "";
        const toast = document.querySelector("#afterActionPrompt")?.textContent || "";
        btn.remove();
        return { opened, labelNow, busy, banner, toast };
      });
      const failText = `${fail.banner || ""} ${fail.toast || ""}`.trim();
      ok(fail.opened === false, `${label}: missing lesson open returns false`);
      ok(!/^(opening|working)/i.test(String(fail.labelNow || "").trim()), `${label}: CTA not stuck on Opening…/Working…`);
      ok(fail.busy !== "true", `${label}: CTA aria-busy cleared after failure`);
      ok(
        /could not open|not found|try again|script did not load|choose a lesson|lesson not found/i.test(failText),
        `${label}: useful open-error message shown (${failText.slice(0, 120) || "empty"})`,
      );

      // Edit opens the same Teaching Kit editor.
      await openViaEdit(page, label);
      await closeEditor(page);

      ok(pageErrors.length === 0, `${label}: no LLH page errors (${pageErrors.slice(0, 2).join(" | ") || "none"})`);
      // Soft-check console: ignore noisy third-party; fail on obvious app TypeErrors.
      const llhConsole = consoleErrors.filter((t) => /TypeError|ReferenceError|LLH|Teaching Kit|openOwner/i.test(t));
      ok(llhConsole.length === 0, `${label}: no genuine LLH console errors (${llhConsole.slice(0, 2).join(" | ") || "none"})`);
      await page.close();
    }

    // Save draft printable + link via API (owner), then auth matrix for draft asset.
    const siteStamp = await requestJson("GET", "/api/admin/site-content", null, auth);
    const stamp = siteStamp.json.siteContent?.updatedAt;
    const create = await requestJson("POST", "/api/admin/curriculum/resources/tk-printable", {
      action: "create",
      lessonPlanId: FIXTURE,
      title: "Focus Fixture Uploaded Pack",
      type: "Printable",
      ageGroup: "Preschool",
      theme: "Colors",
      description: "Disposable upload",
      pageCount: 2,
      accessLevel: "pro",
      printingInstructions: "Print color",
      fileData: PDF_DATA_URL,
      fileName: "focus-fixture.pdf",
      previewImageData: PNG_DATA_URL,
      previewImageFileName: "focus-preview.png",
      expectedUpdatedAt: stamp,
    }, auth);
    ok(create.status === 200 || create.status === 201, `owner create draft printable (${create.status})`);
    const resourceId = create.json?.resource?.id || create.json?.id || "";
    ok(Boolean(resourceId), "draft printable id returned");
    ok((create.json?.resource?.status || create.json?.status) === "draft", "created printable remains draft (not published)");

    const ownerPreview = await requestJson(
      "GET",
      `/api/admin/curriculum/resources/file?id=${encodeURIComponent(resourceId)}&adminToken=${encodeURIComponent(token)}`,
      null,
      auth,
    );
    ok(
      ownerPreview.status === 200
        && (ownerPreview.json?.resource?.fileData
          || ownerPreview.json?.resource?.mediaUrl
          || ownerPreview.json?.resource?.hasFile),
      `owner preview/download succeeds (${ownerPreview.status})`,
    );

    const loggedOut = await requestJson(
      "GET",
      `/api/admin/curriculum/resources/file?id=${encodeURIComponent(resourceId)}`,
      null,
      {},
    );
    ok([401, 403, 404].includes(loggedOut.status), `logged-out draft file blocked (${loggedOut.status})`);

    const publicFile = await requestJson(
      "GET",
      `/api/curriculum/resources/file?id=${encodeURIComponent(resourceId)}`,
      null,
      {},
    );
    ok([401, 403, 404].includes(publicFile.status), `public/customer draft file blocked (${publicFile.status})`);

    const after = await requestJson("GET", "/api/admin/site-content", null, auth);
    const plans = after.json?.siteContent?.curriculum?.lessonPlans || [];
    const flagsAfter = after.json?.siteContent?.featureFlags || {};
    const fixtureAfter = plans.find((p) => p.id === FIXTURE);
    ok(fixtureAfter?.status === "draft", "fixture lesson remains draft (not published)");
    ok(
      Array.isArray(fixtureAfter?.resourceIds) && fixtureAfter.resourceIds.includes(resourceId),
      "draft printable linked to disposable lesson",
    );

    for (const id of [AAM, APPLES, FARM]) {
      const plan = plans.find((p) => p.id === id);
      ok(plan, `${id}: protected plan still present`);
      ok(fingerprintProtectedPlan(plan) === protectedBefore[id], `${id}: content fingerprint unchanged`);
    }
    for (const key of Object.keys(flagsBefore)) {
      ok(flagsAfter[key] === false, `customer flag ${key} unchanged (false)`);
    }

    // Preserve structured printable ideas through save/refresh on disposable fixture only.
    const ideas = fixtureAfter?.enrichmentDraft?.week?.printableIdeas || [];
    ok(ideas.some((idea) => idea && typeof idea === "object" && idea.title === "Fixture Color Sort Pack" && idea.pageCount === 4),
      "structured printable idea properties survive store refresh");
    ok(ideas.some((idea) => (
      (typeof idea === "string" && idea.includes("Legacy string"))
      || (idea && idea.title === "Legacy string printable idea")
    )), "legacy printable idea still present after refresh");

    console.log(`\nPASS ${passed} checks`);
  } catch (error) {
    console.error("\nFAIL", error.message || error);
    if (stderr) console.error(stderr.slice(-4000));
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main();
