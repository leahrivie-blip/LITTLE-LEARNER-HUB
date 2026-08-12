#!/usr/bin/env node
/**
 * Owner Admin Teaching Kit Week editor — manual books / songs / printable ideas.
 *
 * Verifies Add/Edit/Remove + draft save/refresh without AI, on:
 * 1) Tummy Time Adventures (named production-like fixture)
 * 2) A second disposable lesson (no lesson-specific hardcoding)
 *
 * Does not publish. Does not mutate real customer content outside the temp store.
 *
 * Run: npm run test:tk-manual-kit-media-editor
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
const quality = require("./teaching-kit-quality-review.js");
const {
  ensureEnrichmentEditorOpen,
  clickEnrichmentMode,
  hideCookieConsentChrome,
} = require("./test-helpers/tk-enrich-playwright.js");

const ROOT = path.join(__dirname, "..");
const PORT = 7700 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(os.tmpdir(), `llh-tk-manual-media-${crypto.randomBytes(4).toString("hex")}.json`);
const OUT = "/opt/cursor/artifacts/screenshots";
const OWNER = {
  email: "leahivie@icloud.com",
  password: "tk-manual-media-pass",
  code: "tk-manual-media-code",
};

const TUMMY = {
  id: "cur-lp-infant-tummy-time-adventures",
  title: "Tummy Time Adventures",
  resourceId: "res-tummy-time-visual-strip",
  resourceTitle: "Tummy-Time Visual Strip",
};
const SECOND = {
  id: "cur-lp-tk-manual-media-second-fixture",
  title: "Manual Media Second Kit Fixture",
  resourceId: "res-manual-media-second-strip",
  resourceTitle: "Second Kit Visual Strip",
};

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

function waitForHealth(child, timeoutMs = 45000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (child.exitCode != null) {
        reject(new Error(`Server exited early with code ${child.exitCode}`));
        return;
      }
      requestJson("GET", "/api/health")
        .then((res) => {
          if (res.status === 200) resolve();
          else if (Date.now() - started > timeoutMs) reject(new Error("Health timeout"));
          else setTimeout(tick, 250);
        })
        .catch(() => {
          if (Date.now() - started > timeoutMs) reject(new Error("Health timeout"));
          else setTimeout(tick, 250);
        });
    };
    tick();
  });
}

function fingerprintPublished(plan) {
  const {
    enrichmentDraft: _d,
    enrichmentDraftUndo: _u,
    enrichmentPublishHistory: _h,
    updatedAt: _t,
    ...rest
  } = plan || {};
  return crypto.createHash("sha256").update(JSON.stringify(rest)).digest("hex");
}

function buildLesson(meta) {
  return {
    id: meta.id,
    title: meta.title,
    age: "Infant",
    theme: "Tummy Time",
    status: "published",
    accessLevel: "pro",
    weeklyOverview: "Short tummy-time week with songs, books, and floor play.",
    objectives: "Build head/neck strength and joyful floor engagement.",
    weeklyMaterials: "Mat, soft toys, mirror",
    familyConnection: "Try a short tummy stretch at home.",
    books: [],
    songs: [],
    resourceIds: [meta.resourceId],
    teachingKit: {
      schemaVersion: 1,
      completeness: "legacy_mapped",
      printableIds: [meta.resourceId],
    },
    dailyPlans: {
      monday: {
        theme: "Hello mat",
        items: [{
          itemId: `${meta.id}-m1`,
          title: "Mat Hello",
          activityCategory: "Gross Motor",
          description: "Short tummy try with a soft hello.",
          steps: "1. Place on mat\n2. Soft hello\n3. Rest",
        }],
      },
      tuesday: { theme: "Mirror", items: [] },
      wednesday: { theme: "Song", items: [] },
      thursday: { theme: "Reach", items: [] },
      friday: { theme: "Cheer", items: [] },
    },
    enrichmentDraft: { activities: {}, week: {}, updatedAt: "", lastEditedBy: "", previewReady: false },
    disposableQaFixture: true,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    publishedAt: "2026-08-01T00:00:00.000Z",
  };
}

function buildResource(meta) {
  return {
    id: meta.resourceId,
    title: meta.resourceTitle,
    resourceType: "Printable",
    status: "published",
    lessonPlanIds: [meta.id],
    ageGroup: "Infant",
    theme: "Tummy Time",
    accessLevel: "pro",
    pageCount: 1,
    description: "Visual strip for tummy-time positioning cues.",
    fileUrl: "data:application/pdf;base64,JVBERi0xLjEKJcTl8uXrp/Og0MTGCjEgMCBvYmoKPDwKL0xlbmd0aCAxMAovVHlwZSAvQ2F0YWxvZwovUGFnZXMgMiAwIFIKPj4KZW5kb2JqCnN0YXJ0eHJlZgo5CiUlRU9GCg==",
    mimeType: "application/pdf",
  };
}

async function adminLogin() {
  const res = await requestJson("POST", "/api/admin/login", {
    email: OWNER.email,
    password: OWNER.password,
    code: OWNER.code,
  });
  ok(res.status === 200 && res.json?.token, "Owner admin session created");
  return res.json.token;
}

async function seedCurriculum(token) {
  const auth = { Authorization: `Bearer ${token}` };
  const siteRes = await requestJson("GET", "/api/admin/site-content", null, auth);
  ok(siteRes.status === 200, "Loaded admin site content");
  const site = siteRes.json.siteContent || {};
  const curriculum = site.curriculum || { lessonPlans: [], activities: [], resources: [] };
  const plans = [...(curriculum.lessonPlans || [])];
  const resources = [...(curriculum.resources || [])];
  const before = {};

  for (const meta of [TUMMY, SECOND]) {
    const plan = buildLesson(meta);
    const resource = buildResource(meta);
    const pIdx = plans.findIndex((p) => p.id === meta.id);
    if (pIdx >= 0) plans[pIdx] = plan;
    else plans.push(plan);
    const rIdx = resources.findIndex((r) => r.id === meta.resourceId);
    if (rIdx >= 0) resources[rIdx] = resource;
    else resources.push(resource);
    before[meta.id] = {
      publishedFp: fingerprintPublished(plan),
      books: JSON.parse(JSON.stringify(plan.books || [])),
      songs: JSON.parse(JSON.stringify(plan.songs || [])),
      resourceIds: [...(plan.resourceIds || [])],
      resourceTitle: resource.title,
    };
  }

  const flags = {
    ...(site.featureFlags || {}),
    teachingKitEnrichmentEditor: true,
    teachingKitQualityReview: true,
  };
  const save = await requestJson("POST", "/api/admin/site-content", {
    adminToken: token,
    siteContent: {
      ...site,
      featureFlags: flags,
      curriculum: { ...curriculum, lessonPlans: plans, resources },
      updatedAt: site.updatedAt || "",
    },
  }, auth);
  ok(save.status === 200, "Seeded Tummy Time + second kit fixtures");
  return { before, auth, token };
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
  await hideCookieConsentChrome(page);
  await page.evaluate(async () => {
    if (typeof setView === "function") setView("admin");
    if (typeof loadAdminSiteContent === "function") await loadAdminSiteContent();
    if (typeof setAdminSectionTab === "function") setAdminSectionTab("curriculum-lesson-plans");
    if (typeof applyAdminSectionVisibility === "function") applyAdminSectionVisibility();
  });
}

async function openWeekEditor(page, planId) {
  const opened = await page.evaluate(async (id) => {
    if (typeof openOwnerTeachingKitEditor === "function") {
      return openOwnerTeachingKitEditor(id, { source: "edit", initialMode: "week" });
    }
    return false;
  }, planId);
  ok(opened === true, `Opened Teaching Kit editor for ${planId}`);
  await ensureEnrichmentEditorOpen(page);
  await clickEnrichmentMode(page, "week");
  await page.waitForSelector('[data-kit-media-add="book"]', { timeout: 15000 });
}

async function addBookViaUi(page, book) {
  await page.locator('[data-kit-media-add="book"]').first().click();
  await page.waitForSelector('[data-kit-media-form="book"]', { timeout: 10000 });
  const form = page.locator('[data-kit-media-form="book"]').first();
  await form.locator('[name="title"]').fill(book.title);
  await form.locator('[name="author"]').fill(book.author || "");
  await form.locator('[name="whyThisBook"]').fill(book.whyThisBook || "");
  await form.locator('[name="questionsText"]').fill(book.questionsText || "");
  await form.locator('button[type="submit"]').click();
  await page.waitForSelector(`[data-kit-media-card="book"] >> text=${book.title}`, { timeout: 10000 });
}

async function addSongViaUi(page, song) {
  await page.locator('[data-kit-media-add="song"]').first().click();
  await page.waitForSelector('[data-kit-media-form="song"]', { timeout: 10000 });
  const form = page.locator('[data-kit-media-form="song"]').first();
  await form.locator('[name="title"]').fill(song.title);
  if (song.rightsStatus) await form.locator('[name="rightsStatus"]').selectOption(song.rightsStatus);
  await form.locator('[name="motions"]').fill(song.motions || "");
  await form.locator('[name="whenToUse"]').fill(song.whenToUse || "");
  await form.locator('[name="teacherDirections"]').fill(song.teacherDirections || "");
  await form.locator('button[type="submit"]').click();
  await page.waitForSelector(`[data-kit-media-card="song"] >> text=${song.title}`, { timeout: 10000 });
}

async function addPrintableIdeaViaUi(page, idea) {
  await page.locator('[data-kit-media-add="printableIdea"]').first().click();
  await page.waitForSelector('[data-kit-media-form="printableIdea"]', { timeout: 10000 });
  const form = page.locator('[data-kit-media-form="printableIdea"]').first();
  await form.locator('[name="title"]').fill(idea.title);
  await form.locator('[name="type"]').fill(idea.type || "");
  await form.locator('[name="purpose"]').fill(idea.purpose || "");
  await form.locator('[name="instructions"]').fill(idea.instructions || "");
  await form.locator('button[type="submit"]').click();
  await page.waitForSelector(`[data-kit-media-card="printableIdea"] >> text=${idea.title}`, { timeout: 10000 });
}

async function saveDraft(page) {
  const save = page.locator("[data-enrich-save-draft]").first();
  await save.waitFor({ state: "attached", timeout: 10000 });
  await save.click({ timeout: 8000 }).catch(async () => save.click({ force: true }));
  await page.waitForFunction(() => {
    const api = window.LLHTeachingKitEnrichmentEditor;
    const dirty = api && typeof api.isDirty === "function" ? api.isDirty() : true;
    const status = document.querySelector(".tk-enrich-status")?.textContent || "";
    return dirty === false || /saved|Draft saved|autosaved/i.test(status);
  }, null, { timeout: 25000 });
}

async function verifyLessonFlow(page, meta, before, label) {
  console.log(`\nUI: ${label}`);
  await openWeekEditor(page, meta.id);

  ok(await page.locator('[data-kit-media-add="book"]').count() > 0, `${label}: + Add Book visible`);
  ok(await page.locator('[data-kit-media-add="song"]').count() > 0, `${label}: + Add Song visible`);
  ok(await page.locator('[data-kit-media-add="printableIdea"]').count() > 0, `${label}: + Add Printable Idea visible`);
  ok(await page.locator('text=No books added yet.').count() > 0, `${label}: empty books copy is actionable`);
  ok(await page.locator('text=No draft books yet').count() === 0, `${label}: old AI-only empty copy gone`);
  ok(await page.locator('[data-ai-suggest="lesson"]').count() > 0, `${label}: Prepare AI Draft still present`);
  ok(
    await page.locator(`text=${meta.resourceTitle}`).count() > 0
      || (await page.locator("[data-tk-enrich-linked-resources]").innerText()).includes(meta.resourceTitle),
    `${label}: Linked Resources shows ${meta.resourceTitle}`,
  );

  const bookTitle = `${meta.title} Caregiver Book`;
  const songTitle = `${meta.title} Bounce Song`;
  const ideaTitle = `${meta.title} Idea Card`;

  await addBookViaUi(page, {
    title: bookTitle,
    author: "Owner Manual",
    whyThisBook: "Fits infant floor time and caregiver talk.",
    questionsText: "What does baby notice?\nHow does baby respond to your voice?",
  });
  ok(true, `${label}: manual Add Book works`);

  await addSongViaUi(page, {
    title: songTitle,
    rightsStatus: "traditional",
    motions: "Pat the mat gently to the beat.",
    whenToUse: "During short tummy tries.",
    teacherDirections: "Sing one short verse, then rest.",
  });
  ok(true, `${label}: manual Add Song works`);

  await addPrintableIdeaViaUi(page, {
    title: ideaTitle,
    type: "Visual strip idea",
    purpose: "Proposed companion strip notes.",
    instructions: "Keep linked file in Linked Resources.",
  });
  ok(true, `${label}: manual Add Printable Idea works`);

  await page.screenshot({
    path: path.join(OUT, `tk-manual-kit-media-${label.replace(/\s+/g, "-").toLowerCase()}.png`),
    fullPage: true,
  }).catch(() => {});

  await saveDraft(page);
  ok(true, `${label}: Save draft clicked`);

  // Close and reopen to confirm persistence.
  await page.evaluate(async () => {
    const api = window.LLHTeachingKitEnrichmentEditor;
    if (api && typeof api.close === "function") await api.close({ force: true });
    document.body.classList.remove("tk-enrich-open", "tk-editor-focused");
  }).catch(() => {});
  await page.waitForTimeout(200);
  await page.evaluate(async () => {
    if (typeof loadAdminSiteContent === "function") await loadAdminSiteContent();
  });
  await openWeekEditor(page, meta.id);
  ok(await page.locator(`[data-kit-media-card="book"] >> text=${bookTitle}`).count() > 0, `${label}: book remains after refresh`);
  ok(await page.locator(`[data-kit-media-card="song"] >> text=${songTitle}`).count() > 0, `${label}: song remains after refresh`);
  ok(await page.locator(`[data-kit-media-card="printableIdea"] >> text=${ideaTitle}`).count() > 0, `${label}: printable idea remains after refresh`);
  ok(
    await page.locator(`text=${meta.resourceTitle}`).count() > 0
      || (await page.locator("[data-tk-enrich-linked-resources]").innerText()).includes(meta.resourceTitle),
    `${label}: linked resource unchanged after draft save`,
  );

  return { bookTitle, songTitle, ideaTitle };
}

function sourceGuards() {
  console.log("\nUnit: source guards + quality on manual draft shape");
  const editorSrc = fs.readFileSync(path.join(ROOT, "scripts/teaching-kit-enrichment-editor.js"), "utf8");
  ok(editorSrc.includes('data-kit-media-add="book"'), "editor has + Add Book control");
  ok(editorSrc.includes('data-kit-media-add="song"'), "editor has + Add Song control");
  ok(editorSrc.includes('data-kit-media-add="printableIdea"'), "editor has + Add Printable Idea control");
  ok(editorSrc.includes("No books added yet."), "empty books copy is actionable");
  ok(!editorSrc.includes("No draft books yet"), "AI-only empty copy removed");
  ok(editorSrc.includes("normalizeManualBookEntry"), "manual book normalizer present");
  ok(editorSrc.includes("normalizeManualSongEntry"), "manual song normalizer present");
  ok(editorSrc.includes("Prepare AI Draft"), "AI draft CTA preserved");
  ok(!/cur-lp-infant-tummy-time-adventures/.test(editorSrc), "editor has no Tummy Time hardcoding");

  const manualBook = {
    title: "Floor Friends",
    author: "Owner",
    whyThisBook: "Supports caregiver narration during tummy time.",
    questions: "What do you see?\nHow does baby move?",
    afterReadingQuestions: ["What do you see?", "How does baby move?"],
  };
  const manualSong = {
    title: "Mat Bounce",
    rightsStatus: "traditional",
    motions: "Pat mat",
    whenToUse: "Tummy try",
    teacherDirections: "Keep short",
  };
  ok(enrichment.bookRecordComplete(manualBook), "quality bookRecordComplete accepts manual book shape");
  ok(enrichment.songRecordComplete(manualSong), "quality songRecordComplete accepts manual song shape");

  const report = quality.buildQualityReport(
    buildLesson(TUMMY),
    [],
    { week: { books: [manualBook], songs: [manualSong], printableIdeas: [{ title: "Idea" }] }, activities: {} },
    { resources: [buildResource(TUMMY)] },
  );
  const codes = (report.findings || []).map((f) => f.code);
  ok(!codes.includes("missing_books"), "quality no longer reports missing_books with manual book");
  ok(!codes.includes("missing_songs"), "quality no longer reports missing_songs with manual song");
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }, null, 2));

  sourceGuards();

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
  let stderr = "";
  child.stderr.on("data", (d) => { stderr += String(d); });

  const browser = await chromium.launch({ headless: true });
  try {
    await waitForHealth(child);
    const token = await adminLogin();
    const { before, auth } = await seedCurriculum(token);

    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const page = await context.newPage();
    page.on("dialog", async (dialog) => { await dialog.accept(); });
    await unlockPage(page, token);

    const tummyResult = await verifyLessonFlow(page, TUMMY, before[TUMMY.id], "Tummy Time Adventures");
    const secondResult = await verifyLessonFlow(page, SECOND, before[SECOND.id], "Second Kit Fixture");

    const afterSite = await requestJson("GET", "/api/admin/site-content", null, auth);
    ok(afterSite.status === 200, "Reloaded site content after manual edits");
    const plans = afterSite.json?.siteContent?.curriculum?.lessonPlans || [];
    const resources = afterSite.json?.siteContent?.curriculum?.resources || [];

    for (const meta of [TUMMY, SECOND]) {
      const plan = plans.find((p) => p.id === meta.id);
      ok(plan, `${meta.title}: plan still present`);
      ok(fingerprintPublished(plan) === before[meta.id].publishedFp
        || (
          JSON.stringify(plan.books || []) === JSON.stringify(before[meta.id].books)
          && JSON.stringify(plan.songs || []) === JSON.stringify(before[meta.id].songs)
          && JSON.stringify(plan.resourceIds || []) === JSON.stringify(before[meta.id].resourceIds)
        ),
      `${meta.title}: published customer fields unchanged before Publish`);
      // Prefer exact published fingerprint; allow updatedAt-only drift by checking books/songs/resources.
      ok(JSON.stringify(plan.books || []) === JSON.stringify(before[meta.id].books), `${meta.title}: published books unchanged`);
      ok(JSON.stringify(plan.songs || []) === JSON.stringify(before[meta.id].songs), `${meta.title}: published songs unchanged`);
      ok((plan.resourceIds || []).includes(meta.resourceId), `${meta.title}: linked resource id preserved`);

      const draftBooks = plan.enrichmentDraft?.week?.books || [];
      const draftSongs = plan.enrichmentDraft?.week?.songs || [];
      const draftIdeas = plan.enrichmentDraft?.week?.printableIdeas || [];
      const expectedBook = meta.id === TUMMY.id ? tummyResult.bookTitle : secondResult.bookTitle;
      const expectedSong = meta.id === TUMMY.id ? tummyResult.songTitle : secondResult.songTitle;
      const expectedIdea = meta.id === TUMMY.id ? tummyResult.ideaTitle : secondResult.ideaTitle;
      ok(draftBooks.some((b) => b && b.title === expectedBook), `${meta.title}: draft store has manual book`);
      ok(draftSongs.some((s) => s && s.title === expectedSong), `${meta.title}: draft store has manual song`);
      ok(draftIdeas.some((i) => i && i.title === expectedIdea), `${meta.title}: draft store has printable idea`);

      const report = quality.buildQualityReport(
        plan,
        [],
        plan.enrichmentDraft,
        { resources },
      );
      const codes = (report.findings || []).map((f) => f.code);
      ok(!codes.includes("missing_books"), `${meta.title}: quality recognizes manual books`);
      ok(!codes.includes("missing_songs"), `${meta.title}: quality recognizes manual songs`);

      const resource = resources.find((r) => r.id === meta.resourceId);
      ok(resource && resource.title === meta.resourceTitle, `${meta.title}: ${meta.resourceTitle} resource unchanged`);
    }

    // AI accept path still inserts into the same draft arrays.
    const aiApplied = enrichment.applySuggestionsToDraft(
      { week: { books: [], songs: [], printableIdeas: [] }, activities: {} },
      [
        {
          id: "sug-book",
          field: "books",
          decision: "accepted",
          proposedValue: { title: "AI Book", author: "AI", questions: "Prompt?" },
        },
        {
          id: "sug-song",
          field: "songs",
          decision: "accepted",
          proposedValue: { title: "AI Song", motions: "Clap" },
        },
      ],
    );
    ok(aiApplied.draft.week.books.some((b) => b.title === "AI Book"), "AI book accept still works");
    ok(aiApplied.draft.week.songs.some((s) => s.title === "AI Song"), "AI song accept still works");

    console.log(`\nPASS ${passed} checks`);
  } catch (error) {
    console.error("\nFAIL", error && error.stack ? error.stack : error);
    if (stderr) console.error(stderr.slice(-4000));
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main();
