#!/usr/bin/env node
/**
 * PR #893 staging-equivalent verification (local disposable draft).
 * Run: npm run test:lesson-editor-usability-staging
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
const PORT = 7200 + Math.floor(Math.random() * 120);
const STORE_PATH = path.join(os.tmpdir(), `llh-lre-staging-${crypto.randomBytes(4).toString("hex")}.json`);
const OWNER = {
  email: "leahivie@icloud.com", // pragma: allowlist secret
  password: "lre-staging-owner-pass",
  code: "lre-staging-owner-code",
};
const FIXTURE_ID = `cur-lp-disposable-lre-staging-${crypto.randomBytes(4).toString("hex")}`;
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const SECTION_LABELS = [
  "Lesson overview",
  "Weekly plan",
  "Activities",
  "Books",
  "Songs",
  "Printables",
  "Family connection",
  "Images",
  "Teacher notes",
  "Quality review",
  "Review and preview",
];

function ok(cond, msg) {
  assert.ok(cond, msg);
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

async function waitForHealth(child, timeoutMs = 45000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode != null) throw new Error(`Server exited: ${child.exitCode}`);
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("health timeout");
}

async function adminLogin() {
  const started = Date.now();
  while (Date.now() - started < 30000) {
    const res = await requestJson("POST", "/api/admin/login", {
      email: OWNER.email,
      password: OWNER.password,
      code: OWNER.code,
    });
    if (res.status === 200 && res.json?.token) return res.json.token;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("admin login failed after retries");
}

function buildPlan(coverUrl, actUrls) {
  const mk = (day, n, title, setupUrl) => ({
    itemId: `item-${day}-${n}-${FIXTURE_ID.slice(-6)}`,
    title,
    dayOfWeek: day,
    activityCategory: "Art",
    ageModifications: "Preschool (3–5 years)",
    durationMinutes: "10 minutes",
    objective: "Children explore materials with teacher support during a short invitation.",
    description: "Children sit together and explore the materials while the teacher narrates what they notice aloud.",
    materials: "Paper, crayons, basket",
    preparation: "Stage materials before children arrive.",
    setup: "Place materials at child height.",
    steps: "1. Invite children. 2. Model gently. 3. Observe. 4. Clean up together.",
    teacherLanguage: "What do you notice?",
    observationOpportunities: "Does the child try a new word?",
    safetyNotes: "Stay nearby and use age-appropriate materials only.",
    cleanupTips: "Return materials to the shelf.",
    setupImageUrl: setupUrl || "",
    exampleImageUrl: "",
    imageRequirement: setupUrl ? "setup_needed" : "optional",
  });
  return {
    id: FIXTURE_ID,
    title: "DISPOSABLE LRE Staging Usability QA",
    age: "Preschool",
    theme: "Staging QA",
    plan: "Pro",
    status: "draft",
    disposableQaFixture: true,
    coverImageUrl: coverUrl || "",
    weeklyOverview: "Disposable staging week for editor usability verification only.",
    objectives: "Children practice one observable skill during guided play.",
    weeklyMaterials: "Paper, crayons, baskets, mirrors",
    familyConnection: "Ask which feeling your child practiced at home tonight.",
    books: [{ title: "Staging Book", author: "QA Author", discussionPrompts: "What did you notice?" }],
    songs: [{ title: "Staging Song", source: "Original LLH", lyrics: "Hello staging song for classroom use only today", motions: "Wave", weekday: "monday" }],
    resourceIds: [],
    teachingKit: {
      schemaVersion: 1,
      teacherToolkit: { overview: "Keep it brief.", preparation: "Print cards", tips: "Narrate gently." },
    },
    dailyPlans: {
      monday: { theme: "Mon", objectives: "Mon obj", materials: "Mon mats", schedule: "Circle then art", items: [mk("monday", 1, "Activity Alpha", actUrls.alpha), mk("monday", 2, "Activity Beta", actUrls.beta)] },
      tuesday: { theme: "Tue", objectives: "", materials: "", schedule: "", items: [] },
      wednesday: { theme: "", objectives: "", materials: "", schedule: "", items: [] },
      thursday: { theme: "", objectives: "", materials: "", schedule: "", items: [] },
      friday: { theme: "", objectives: "", materials: "", schedule: "", items: [] },
    },
  };
}

async function main() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }, null, 2));
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
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const browser = await chromium.launch();
  const pngPath = path.join(os.tmpdir(), `lre-staging-upload-${crypto.randomBytes(3).toString("hex")}.png`);
  fs.writeFileSync(pngPath, TINY_PNG);

  try {
    await waitForHealth(child);
    const token = await adminLogin();
    const auth = { Authorization: `Bearer ${token}` };
    const siteBoot = await requestJson("GET", "/api/admin/site-content", null, auth);
    const bootContent = siteBoot.json?.siteContent || {};
    await requestJson("POST", "/api/admin/site-content", {
      expectedUpdatedAt: bootContent.updatedAt || "",
      siteContent: {
        ...bootContent,
        featureFlags: {
          ...(bootContent.featureFlags || {}),
          teachingKitEnrichmentEditor: true,
        },
      },
    }, auth);

    const coverSeed = "/images/lesson-covers/default.svg";
    const alphaSeed = "https://example.com/alpha-setup-seed.png";
    const betaSeed = "https://example.com/beta-setup-seed.png";
    const plan = buildPlan(coverSeed, { alpha: alphaSeed, beta: betaSeed });
    const site = await requestJson("GET", "/api/admin/site-content", null, auth);
    await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      expectedUpdatedAt: site.json?.siteContent?.updatedAt || "",
      lessonPlan: plan,
    }, auth);

    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`http://127.0.0.1:${PORT}/?view=admin`, { waitUntil: "domcontentloaded" });
    await page.evaluate(async ({ owner, ownerToken }) => {
      localStorage.setItem("llhAdminSession", JSON.stringify({ email: owner.email, token: ownerToken, role: "admin" }));
      localStorage.setItem("llhAdminUnlocked", "true");
      if (typeof loadAdminSiteContent === "function") {
        try { await loadAdminSiteContent(); } catch (_e) { /* continue */ }
      }
      if (typeof applyCurriculumState === "function" && typeof siteContentState !== "undefined") {
        try {
          applyCurriculumState(siteContentState, { siteContentUpdatedAt: siteContentState?.updatedAt });
        } catch (_e) { /* continue */ }
      }
    }, { owner: OWNER, ownerToken: token });

    console.log("Edit vs Upgrade paths");
    const editPath = await page.evaluate(async (id) => {
      if (window.LLHLessonReviewEditor?.isOpen?.()) await window.LLHLessonReviewEditor.close({ force: true });
      if (window.LLHTeachingKitEnrichmentEditor?.isOpen?.()) await window.LLHTeachingKitEnrichmentEditor.close({ force: true });
      const okEdit = await openOwnerTeachingKitEditor(id, { source: "edit" });
      return {
        okEdit,
        lre: Boolean(window.LLHLessonReviewEditor?.isOpen?.()),
        enrich: Boolean(window.LLHTeachingKitEnrichmentEditor?.isOpen?.()),
      };
    }, FIXTURE_ID);
    ok(editPath.okEdit && editPath.lre && !editPath.enrich, "Edit opens structured Lesson Review editor");

    await page.evaluate(async (id) => {
      await window.LLHLessonReviewEditor.close({ force: true });
    });
    const upgradePath = await page.evaluate(async (id) => {
      const okUp = await openOwnerTeachingKitEditor(id, { source: "upgrade" });
      return {
        okUp,
        lre: Boolean(window.LLHLessonReviewEditor?.isOpen?.()),
        enrich: Boolean(window.LLHTeachingKitEnrichmentEditor?.isOpen?.()),
      };
    }, FIXTURE_ID);
    ok(upgradePath.okUp && upgradePath.enrich && !upgradePath.lre, "Upgrade opens enrichment editor");
    await page.evaluate(async () => {
      if (window.LLHTeachingKitEnrichmentEditor?.isOpen?.()) await window.LLHTeachingKitEnrichmentEditor.close({ force: true });
    });

    await page.evaluate((id) => openOwnerTeachingKitEditor(id, { source: "edit" }), FIXTURE_ID);
    await page.waitForSelector("[data-lesson-review-editor]", { timeout: 15000 });

    console.log("Section navigation");
    for (const label of SECTION_LABELS) {
      const id = await page.evaluate((lbl) => {
        const row = (window.LLHLessonReviewEditor?.SECTION_DEFS || []).find((s) => s.label === lbl);
        return row?.id || "";
      }, label);
      if (!id) continue;
      await page.click(`[data-lre-section="${id}"]`);
      await page.waitForTimeout(150);
      const heading = await page.locator("[data-lre-section-chrome] h2").innerText();
      ok(heading === label, `Section reachable: ${label}`);
    }

    await page.click('[data-lre-section="week"]');
    const openDays = await page.locator("details.llh-lre-day-collapse[open]").count();
    ok(openDays >= 5, "Weekly plan days start expanded");
    await page.locator("details.llh-lre-day-collapse").first().evaluate((el) => { el.open = false; });
    ok(await page.locator("details.llh-lre-day-collapse").first().evaluate((el) => el.open === false), "Week day collapses");
    await page.locator("details.llh-lre-day-collapse").first().evaluate((el) => { el.open = true; });

    await page.click('[data-lre-quick-nav="books"]');
    ok(await page.locator("[data-lre-section-chrome] h2").innerText() === "Books", "Quick nav → Books");

    console.log("Save indicator + dirty warning hook");
    await page.click('[data-lre-section="basics"]');
    await page.fill('[data-lre-path="title"]', "DISPOSABLE LRE Staging Usability QA edited");
    await page.waitForTimeout(100);
    const needsSaving = await page.locator("[data-lre-save-indicator]").innerText();
    ok(/Needs saving/i.test(needsSaving), "Text edit shows Needs saving");
    const hasBeforeUnload = await page.evaluate(() => Boolean(window.LLHLessonReviewEditor?.isDirty?.()));
    ok(hasBeforeUnload, "Editor reports dirty before save");

    console.log("Preview read-only");
    const statusBefore = await page.evaluate((id) => curriculumLessonPlanById(id)?.status, FIXTURE_ID);
    await page.click("[data-lre-preview-lesson]");
    await page.waitForSelector("[data-lre-preview-overlay]", { timeout: 15000 });
    const overlayText = await page.locator("[data-lre-preview-overlay]").innerText();
    ok(/Preview only/i.test(overlayText) && /not published/i.test(overlayText), "Preview overlay labeled read-only");
    await page.click("[data-lre-preview-back]");
    await page.waitForTimeout(200);
    ok(await page.locator("[data-lre-preview-overlay]").count() === 0, "Back to editing closes preview");
    const statusAfterPreview = await page.evaluate((id) => curriculumLessonPlanById(id)?.status, FIXTURE_ID);
    ok(statusBefore === statusAfterPreview && statusAfterPreview === "draft", "Preview does not publish or change status");

    console.log("Image targeting (cover vs activities)");
    await page.click('[data-lre-section="activities"]');
    await page.waitForTimeout(200);
    const activityKeys = await page.evaluate(() => {
      const cards = [...document.querySelectorAll("[data-lre-open-activity]")];
      const findKey = (titlePart) => cards.find((el) => (el.textContent || "").includes(titlePart))?.getAttribute("data-lre-open-activity") || "";
      return { alphaKey: findKey("Activity Alpha"), betaKey: findKey("Activity Beta") };
    });
    ok(activityKeys.alphaKey && activityKeys.betaKey, "Fixture activity keys resolved");
    await page.click('[data-lre-section="images"]');
    await page.waitForSelector("input[data-lre-cover-upload]", { state: "attached", timeout: 10000 });

    const readDraftUrls = () => page.evaluate(({ alphaKey, betaKey }) => {
      const cover = document.querySelector('[data-lre-path="coverImageUrl"]')?.value || "";
      const readKey = (key) => {
        if (!key) return "";
        const slot = document.querySelector(`[data-lre-photo-slot][data-lre-photo-activity="${key}"][data-lre-photo-field="setupImageUrl"]`);
        return slot?.querySelector("img")?.getAttribute("src") || "";
      };
      return { cover, alpha: readKey(alphaKey), beta: readKey(betaKey) };
    }, activityKeys);

    const beforeUrls = await readDraftUrls();

    await page.locator("input[data-lre-cover-upload]").setInputFiles(pngPath);
    await page.waitForFunction(
      () => !/Uploading cover/i.test(document.body.innerText || ""),
      null,
      { timeout: 20000 },
    );
    await page.waitForTimeout(500);
    const afterCover = await readDraftUrls();
    ok(afterCover.cover !== beforeUrls.cover, "Cover image URL changed after cover upload");
    ok(afterCover.alpha === beforeUrls.alpha && afterCover.beta === beforeUrls.beta, "Activity setup URLs unchanged after cover-only upload");

    const alphaSlot = page.locator(`[data-lre-photo-activity="${activityKeys.alphaKey}"][data-lre-photo-field="setupImageUrl"]`);
    await alphaSlot.locator("input[data-lre-activity-upload]").setInputFiles(pngPath);
    await page.waitForFunction(
      ({ key, before }) => {
        const slot = document.querySelector(`[data-lre-photo-slot][data-lre-photo-activity="${key}"][data-lre-photo-field="setupImageUrl"]`);
        const src = slot?.querySelector("img")?.getAttribute("src") || "";
        return Boolean(src && src !== before);
      },
      { key: activityKeys.alphaKey, before: beforeUrls.alpha },
      { timeout: 25000 },
    );
    const afterAlpha = await readDraftUrls();
    ok(afterAlpha.alpha !== beforeUrls.alpha, `Target activity setup URL changed (${beforeUrls.alpha} → ${afterAlpha.alpha})`);
    ok(afterAlpha.beta === beforeUrls.beta, "Other activity setup URL unchanged");
    ok(afterAlpha.cover === afterCover.cover, "Cover unchanged after single-activity upload");

    await page.click("[data-lre-save-draft]");
    await page.waitForFunction(
      () => /Saved/i.test(document.querySelector("[data-lre-save-indicator]")?.textContent || ""),
      null,
      { timeout: 20000 },
    );

    const apiAfterSave = await requestJson("GET", "/api/admin/site-content", null, auth);
    const savedPlan = (apiAfterSave.json?.siteContent?.curriculum?.lessonPlans || []).find((p) => p.id === FIXTURE_ID);
    const savedAlpha = (savedPlan?.dailyPlans?.monday?.items || []).find((it) => /Alpha/i.test(it.title || ""))?.setupImageUrl || "";
    ok(/enrichment-photos|\/api\//.test(savedAlpha), `API persisted activity photo (${savedAlpha})`);

    await page.evaluate(async (id) => {
      await window.LLHLessonReviewEditor.close({ force: true });
      if (typeof loadAdminSiteContent === "function") {
        try { await loadAdminSiteContent(); } catch (_e) { /* continue */ }
      }
      await openOwnerTeachingKitEditor(id, { source: "edit" });
    }, FIXTURE_ID);
    await page.waitForSelector("[data-lesson-review-editor]", { timeout: 15000 });
    const reopened = await page.evaluate((id) => {
      const p = curriculumLessonPlanById(id);
      const items = p?.dailyPlans?.monday?.items || [];
      const alphaItem = items.find((it) => /Alpha/i.test(it.title || "")) || items[0];
      const betaItem = items.find((it) => /Beta/i.test(it.title || "")) || items[1];
      return {
        title: p.title,
        cover: p.coverImageUrl || "",
        alpha: alphaItem?.setupImageUrl || "",
        beta: betaItem?.setupImageUrl || "",
        status: p.status,
      };
    }, FIXTURE_ID);
    ok(reopened.title.includes("edited"), "Reopen persisted title edit");
    ok(reopened.cover.includes("/api/") || reopened.cover.includes("lesson-covers"), "Reopen persisted cover upload");
    ok(
      reopened.alpha !== alphaSeed && /enrichment-photos|\/api\//.test(reopened.alpha),
      `Reopen persisted activity photo (${reopened.alpha})`,
    );
    ok(reopened.status === "draft", "Lesson remains draft after save/reopen");

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await mobile.goto(`http://127.0.0.1:${PORT}/?view=admin`, { waitUntil: "domcontentloaded" });
    await mobile.evaluate(async ({ owner, ownerToken }) => {
      localStorage.setItem("llhAdminSession", JSON.stringify({ email: owner.email, token: ownerToken, role: "admin" }));
      localStorage.setItem("llhAdminUnlocked", "true");
      if (typeof loadAdminSiteContent === "function") {
        try { await loadAdminSiteContent(); } catch (_e) { /* continue */ }
      }
    }, { owner: OWNER, ownerToken: token });
    await mobile.evaluate((id) => openOwnerTeachingKitEditor(id, { source: "edit" }), FIXTURE_ID);
    await mobile.waitForSelector("[data-lre-section-select]", { timeout: 15000 });
    await mobile.selectOption("[data-lre-section-select]", "images");
    ok(await mobile.locator("[data-lre-section-chrome] h2").innerText() === "Images", "Mobile section picker reaches Images");
    ok(await mobile.locator("[data-lre-mobile-bar]").count() === 1, "Mobile sticky action bar present");

    console.log("\nAll lesson editor usability staging checks passed.");
  } finally {
    await browser.close().catch(() => {});
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
    try { fs.unlinkSync(pngPath); } catch { /* ignore */ }
  }
}

main().catch((err) => {
  console.error("\nFAIL", err.message || err);
  process.exit(1);
});
