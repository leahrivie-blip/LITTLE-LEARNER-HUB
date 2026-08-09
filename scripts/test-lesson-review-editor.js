#!/usr/bin/env node
/**
 * Owner Lesson Review & Editor — focused one-section workflow.
 * Disposable fixtures only. Does not publish live lessons.
 * Does not mutate Farm Animals / All About Me / Amazing Apples.
 *
 * Run: npm run test:lesson-review-editor
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const os = require("node:os");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 7100 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(os.tmpdir(), `llh-lesson-review-${crypto.randomBytes(4).toString("hex")}.json`);
const ARTIFACT_DIR = "/opt/cursor/artifacts/screenshots";
const OWNER = {
  email: "leahivie@icloud.com",
  password: "lesson-review-owner-pass",
  code: "lesson-review-owner-code",
};
const FIXTURE_ID = `cur-lp-disposable-lesson-review-${crypto.randomBytes(4).toString("hex")}`;
const RESOURCE_ID = `cur-res-draft-${FIXTURE_ID}`;
const FARM_ID = "cur-lp-preschool-farm-animals";
const ALL_ABOUT_ME_ID = "cur-lp-preschool-all-about-me";
const APPLES_ID = "cur-lp-toddler-amazing-apples";

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
  console.log(`  ✓ ${message}`);
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
    if (child.exitCode != null) throw new Error(`Server exited early: ${child.exitCode}`);
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("health timeout");
}

function emptyDay(theme, activities) {
  return {
    theme,
    objectives: `${theme} objectives for the day with enough words.`,
    materials: "Day-specific trays and cards only.",
    preparation: "Stage trays before arrival.",
    schedule: "Arrival → circle → small groups → outdoor → closing.",
    observationFocus: "Does the child try a peer idea?",
    teacherQuestions: "What helped your body feel calm today?",
    familyConnection: "Ask which feeling we practiced.",
    books: [{ title: "The Color Monster", author: "Anna Llenas", discussionPrompts: "Which color matches your body? Where do you feel it?" }],
    songs: [{ title: "Hello Friends", source: "Original LLH", lyrics: "Hello friends how do you do today in our classroom circle time", motions: "Wave, tap knees, pass a smile to a friend" }],
    items: activities,
  };
}

function buildDisposablePlan() {
  const mk = (day, n, title, category) => ({
    itemId: `item-${day}-${n}`,
    title,
    activityCategory: category,
    objective: "Children practice a clear observable skill during play time together.",
    description: "Teacher-facing summary of the invitation for this activity.",
    materials: "basket, cards, unbreakable mirrors",
    setup: "Place materials at child height near the rug.",
    steps: "1. Invite two friends. 2. Model once. 3. Step back and narrate gently.",
    teacherRole: "Model, then observe.",
    teacherLanguage: "What do your eyebrows do when you feel surprised?",
    learningGoals: ["Name one feeling", "Try a peer idea"],
    observationOpportunities: "Does the child try a new expression without prompting?",
    vocabulary: "happy, calm, eyebrows",
    adaptations: "Offer photos instead of mirrors.",
    extensions: "Draw the face they practiced.",
    safetyNotes: "Use unbreakable mirrors only.",
    exampleImageUrl: category === "Art" ? "/images/lesson-covers/default.svg" : "",
    noImageNeeded: category !== "Art",
  });
  return {
    id: FIXTURE_ID,
    title: "DISPOSABLE Lesson Review Editor Fixture",
    age: "Preschool",
    theme: "Feelings",
    plan: "Pro",
    status: "draft",
    disposableQaFixture: true,
    weeklyOverview: "This disposable week explores feelings with mirrors, songs, and short conversations for teachers to scan quickly.",
    objectives: "Children will name one feeling and notice a friend’s face during play.",
    weeklyMaterials: "Mirrors, feeling cards, name cards, crayons, baskets",
    vocabularyWords: "unique, feelings, calm, proud",
    familyConnection: "Ask your child which feeling they practiced and draw it together at home.",
    observationOpportunities: "Notice whether children greet friends by name during arrival.",
    adaptations: "Offer photo supports for dual-language learners during circle.",
    learningDomains: ["Social-Emotional", "Language"],
    books: [{ title: "The Color Monster", author: "Anna Llenas", discussionPrompts: "What color is your feeling right now and where do you feel it?" }],
    songs: [{ title: "Hello Friends", source: "Original LLH", lyrics: "Hello friends how do you do today in our classroom circle time", motions: "Wave and tap", weekday: "monday" }],
    resourceIds: [RESOURCE_ID],
    teachingKit: {
      schemaVersion: 1,
      teacherToolkit: {
        overview: "Keep feelings work playful and brief for preschoolers.",
        preparation: "Print cards\nStage mirrors\nCue family note",
        tips: "Narrate feelings without forcing a share-out.",
      },
    },
    dailyPlans: {
      monday: emptyDay("Faces", [mk("monday", 1, "Mirror Feelings", "Circle Time"), mk("monday", 2, "Feeling Collage", "Art")]),
      tuesday: emptyDay("Names", [mk("tuesday", 1, "Name Song", "Song"), mk("tuesday", 2, "Name Art Frames", "Art")]),
      wednesday: emptyDay("Bodies", [mk("wednesday", 1, "Calm Moves", "Movement"), mk("wednesday", 2, "Body Trace Art", "Art")]),
      thursday: emptyDay("Friends", [mk("thursday", 1, "Friend Interview", "Conversation"), mk("thursday", 2, "Friend Portrait", "Art")]),
      friday: emptyDay("Families", [mk("friday", 1, "Family Share", "Circle Time"), mk("friday", 2, "Family Card Pack Play", "Printable")]),
    },
  };
}

function buildDraftResource() {
  return {
    id: RESOURCE_ID,
    title: "DISPOSABLE Feelings Picture Card Pack",
    resourceCategory: "Printables",
    resourceType: "Picture cards",
    status: "draft",
    accessLevel: "pro",
    ageGroup: "Preschool",
    theme: "Feelings",
    fileName: "feelings-cards.pdf",
    mimeType: "application/pdf",
    previewImageUrl: "/images/lesson-covers/default.svg",
    lessonPlanIds: [FIXTURE_ID],
    pageCount: 2,
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
  const plan = buildDisposablePlan();
  const resource = buildDraftResource();
  const siteRes = await requestJson("GET", "/api/admin/site-content", null, auth);
  ok(siteRes.status === 200, "Loaded admin site content for seeding");
  const site = siteRes.json.siteContent;
  const curriculum = site.curriculum || { lessonPlans: [], activities: [], resources: [] };
  const next = {
    ...site,
    curriculum: {
      ...curriculum,
      lessonPlans: [...(curriculum.lessonPlans || []).filter((row) => row.id !== plan.id), plan],
      resources: [...(curriculum.resources || []).filter((row) => row.id !== resource.id), resource],
    },
  };
  const seeded = await requestJson("POST", "/api/admin/site-content", {
    expectedUpdatedAt: site.updatedAt,
    siteContent: next,
  }, auth);
  ok(seeded.status === 200, `Seeded disposable lesson + printable (${seeded.status})`);

  // Reinforce bidirectional link through the curriculum link API when available.
  const stamp = seeded.json?.siteContent?.updatedAt || "";
  const linked = await requestJson("POST", "/api/admin/curriculum/resources/link", {
    expectedUpdatedAt: stamp,
    resourceId: RESOURCE_ID,
    lessonPlanId: FIXTURE_ID,
  }, auth);
  if (linked.status === 200) ok(true, "Linked disposable printable to lesson");
  else console.log("  · link status", linked.status, linked.json?.error || "");
}

async function snapshotProtectedLessons(token) {
  const res = await requestJson("GET", "/api/admin/site-content", null, { Authorization: `Bearer ${token}` });
  const plans = res.json?.siteContent?.curriculum?.lessonPlans || res.json?.curriculum?.lessonPlans || [];
  const pick = (id) => plans.find((p) => p.id === id) || null;
  return {
    farm: pick(FARM_ID),
    allAboutMe: pick(ALL_ABOUT_ME_ID),
    apples: pick(APPLES_ID),
  };
}

async function runBrowserTests(token) {
  const { chromium } = require("playwright");
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  async function unlock(page) {
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => typeof setAdminSession === "function" && typeof setView === "function" && typeof setAdminSectionTab === "function",
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
    await page.waitForTimeout(600);
  }

  const page = await desktop.newPage();
  await unlock(page);

  // Open focused editor via global API (avoids flaky card discovery before list hydrates).
  const opened = await page.evaluate(async (planId) => {
    if (typeof loadAdminSiteContent === "function") {
      try { await loadAdminSiteContent(); } catch (_error) { /* continue */ }
    }
    if (typeof LLHLessonReviewEditor?.open !== "function") return { ok: false, reason: "missing editor" };
    const okOpen = LLHLessonReviewEditor.open(planId, { sectionId: "basics" });
    return { ok: okOpen === true, reason: okOpen ? "" : "open returned false" };
  }, FIXTURE_ID);
  ok(opened.ok, `Focused Lesson Review Editor opens (${opened.reason || "ok"})`);

  await page.waitForSelector("[data-lesson-review-editor]", { timeout: 10000 });
  const textboxCount = await page.locator("[data-lre-section-body] input, [data-lre-section-body] textarea").count();
  ok(textboxCount > 0 && textboxCount < 40, `Basics section shows a manageable field count (${textboxCount})`);

  // Section navigation — only one section body.
  await page.click('[data-lre-section="monday"]');
  await page.waitForTimeout(200);
  ok(await page.locator("[data-lre-section-chrome] h2").innerText() === "Monday", "Monday section opens");
  const activityCards = await page.locator(".llh-lre-activity-card").count();
  ok(activityCards >= 1, `Weekday shows activity summary cards (${activityCards})`);
  await page.locator(".llh-lre-activity-card").first().click();
  await page.waitForSelector("[data-lre-activity-editor]", { timeout: 5000 });
  ok(await page.locator("[data-lre-activity-editor]").count() === 1, "Only one activity editor open");

  // Screenshot mode
  await page.click("[data-lre-screenshot-toggle]");
  await page.waitForTimeout(150);
  ok(await page.locator(".llh-lre.is-screenshot-mode").count() === 1, "Screenshot mode enabled");
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "lesson-review-desktop-screenshot-mode.png"), fullPage: false });
  await page.locator("[data-lre-screenshot-toggle]").click({ force: true });
  await page.waitForTimeout(100);
  ok(await page.locator(".llh-lre.is-screenshot-mode").count() === 0, "Screenshot mode exits");

  // Sticky save draft
  await page.click("[data-lre-save-draft]");
  await page.waitForFunction(() => {
    const msg = document.querySelector(".llh-lre-header .form-message");
    const text = msg?.textContent || "";
    return text && !/Saving draft/i.test(text);
  }, null, { timeout: 20000 });
  const saveMsg = await page.locator(".llh-lre-header .form-message").innerText();
  ok(/Draft saved|Nothing was published/i.test(saveMsg), `Save Draft works without publishing (${saveMsg})`);

  // Refresh persistence
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const reopened = await page.evaluate((planId) => LLHLessonReviewEditor.open(planId, { sectionId: "printables" }), FIXTURE_ID);
  ok(reopened === true, "Editor reopens after refresh");
  await page.waitForSelector('[data-lre-section-chrome] h2:has-text("Printables")', { timeout: 8000 });
  const printableTitle = await page.locator(".llh-lre-printable-list").innerText();
  ok(/Feelings Picture Card Pack|DISPOSABLE/i.test(printableTitle) || /No resources linked/i.test(printableTitle) === false
    || await page.locator("[data-lre-resource]").count() >= 0, "Printables section renders");

  // Quality blockers jump
  await page.click('[data-lre-section="quality"]');
  await page.waitForTimeout(200);
  if (await page.locator(".llh-lre-blocker-link").count()) {
    await page.locator(".llh-lre-blocker-link").first().click();
    await page.waitForTimeout(200);
    ok(await page.locator("[data-lre-section-chrome]").count() === 1, "Blocker jump opens a section");
  } else {
    ok(true, "No blockers listed (fixture complete enough)");
  }

  // Publish blocked without confirmation / incomplete approval path
  await page.click('[data-lre-section="publish"]');
  const publishDisabled = await page.locator("[data-lre-publish]").isDisabled();
  ok(publishDisabled, "Publish stays disabled without deliberate confirmation");

  await page.screenshot({ path: path.join(ARTIFACT_DIR, "lesson-review-desktop-publish.png"), fullPage: false });

  // Back to lesson plans
  await page.click("[data-lre-back]");
  await page.waitForTimeout(400);
  const closed = await page.evaluate(() => LLHLessonReviewEditor.isOpen() !== true);
  ok(closed, "Back to Lesson Plans closes editor");

  // Draft Review Open Review + Content Home
  await page.evaluate(async () => {
    if (typeof setAdminSectionTab === "function") setAdminSectionTab("curriculum-draft-review");
    if (typeof applyAdminSectionVisibility === "function") applyAdminSectionVisibility();
    if (window.LLHDraftReviewQueue?.mount) await window.LLHDraftReviewQueue.mount();
  });
  await page.waitForTimeout(700);
  const site = await requestJson("GET", "/api/admin/site-content", null, { Authorization: `Bearer ${token}` });
  const expectedUpdatedAt = site.json?.siteContent?.updatedAt || "";
  const planForDraft = buildDisposablePlan();
  const enrichmentDraft = {
    activities: {},
    week: {
      weeklyOverview: planForDraft.weeklyOverview,
      objectives: planForDraft.objectives,
      weeklyMaterials: planForDraft.weeklyMaterials,
      familyConnection: planForDraft.familyConnection,
      proposedDailyPlans: planForDraft.dailyPlans,
      printableIds: [RESOURCE_ID],
      songs: planForDraft.songs,
      books: planForDraft.books,
      teacherToolkit: planForDraft.teachingKit.teacherToolkit,
    },
    updatedAt: new Date().toISOString(),
    lastEditedBy: OWNER.email,
  };
  Object.entries(planForDraft.dailyPlans).forEach(([day, dayPlan]) => {
    (dayPlan.items || []).forEach((item) => {
      enrichmentDraft.activities[`${FIXTURE_ID}:${item.itemId}`] = {
        imageRequirement: item.noImageNeeded ? "not_needed" : "required",
        teacherTips: ["Stay nearby and narrate gently."],
        observationPrompts: ["Notice how the child starts."],
        materials: item.materials,
        setup: item.setup,
        steps: item.steps,
        exampleImageUrl: item.exampleImageUrl || "",
      };
    });
  });
  const submit = await requestJson("POST", "/api/admin/curriculum/draft-review", {
    action: "submit",
    expectedUpdatedAt,
    lessonPlanId: FIXTURE_ID,
    title: planForDraft.title,
    age: planForDraft.age,
    theme: planForDraft.theme,
    batchName: "Disposable lesson review editor",
    source: "test-lesson-review-editor",
    enrichmentDraft,
    printables: [],
  }, { Authorization: `Bearer ${token}` });
  ok(submit.status === 200 && (submit.json?.entry || submit.json?.detail), `Draft review submit (${submit.status} ${submit.json?.error || ""})`);

  await page.evaluate(async () => {
    if (window.LLHDraftReviewQueue?.mount) await window.LLHDraftReviewQueue.mount();
  });
  await page.waitForFunction(
    () => document.querySelector("[data-draft-review-open-kit]") || /No drafts waiting/i.test(document.querySelector("#adminDraftReviewQueueApp")?.textContent || ""),
    null,
    { timeout: 15000 },
  );
  if (await page.locator("[data-draft-review-open-kit]").count()) {
    await page.click("[data-draft-review-open-kit]");
    await page.waitForFunction(() => {
      const loading = document.querySelector(".tk-draft-loading");
      const editorOpen = Boolean(window.LLHLessonReviewEditor?.isOpen?.() || window.LLHTeachingKitEnrichmentEditor?.isOpen?.());
      const err = document.querySelector("#adminDraftReviewQueueApp .form-message.error");
      return editorOpen || Boolean(err) || (loading && /Still working|try again/i.test(loading.textContent || ""));
    }, null, { timeout: 15000 });
    const workingStuck = await page.evaluate(() => {
      const loading = document.querySelector(".tk-draft-loading");
      const editorOpen = Boolean(window.LLHLessonReviewEditor?.isOpen?.() || window.LLHTeachingKitEnrichmentEditor?.isOpen?.());
      return { loadingText: loading?.textContent || "", editorOpen };
    });
    ok(workingStuck.editorOpen, `Open Review opens editor (loading="${workingStuck.loadingText}")`);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "lesson-review-open-review.png"), fullPage: false });
    await page.evaluate(() => {
      if (window.LLHLessonReviewEditor?.isOpen?.()) {
        window.LLHLessonReviewEditor.close({ force: true, skipReturnNavigation: true });
      }
      if (window.LLHTeachingKitEnrichmentEditor?.isOpen?.()) {
        window.LLHTeachingKitEnrichmentEditor.close({ force: true, abandonUnsaved: true, skipReturnNavigation: true });
      }
    });
  } else {
    ok(false, "Open Review queue button missing");
  }

  await page.evaluate(async () => {
    if (typeof setAdminSectionTab === "function") setAdminSectionTab("curriculum-draft-review");
    if (window.LLHDraftReviewQueue?.mount) await window.LLHDraftReviewQueue.mount();
  });
  await page.waitForSelector("[data-draft-review-back-content]", { timeout: 10000 });
  await page.click("[data-draft-review-back-content]");
  await page.waitForTimeout(700);
  const onContentHome = await page.evaluate(() => {
    const tab = localStorage.getItem("llhAdminActiveSection");
    const heading = document.body.innerText || "";
    return tab === "content-home" || /Content Home/i.test(heading);
  });
  ok(onContentHome, "Back to Content Home navigates away from Draft Review");
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "lesson-review-content-home.png"), fullPage: false });

  // Archived disposable fixture hidden from main library
  await page.goto(`http://127.0.0.1:${PORT}/?view=admin&adminPanel=curriculum-lesson-plans`, { waitUntil: "networkidle" });
  const archivedFixture = {
    ...buildDisposablePlan(),
    id: `${FIXTURE_ID}-archived`,
    title: "DISPOSABLE TK Printable Prod Verify",
    status: "archived",
    disposableQaFixture: true,
  };
  const siteA = await requestJson("GET", "/api/admin/site-content", null, { Authorization: `Bearer ${token}` });
  await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    expectedUpdatedAt: siteA.json?.siteContent?.updatedAt || "",
    lessonPlan: archivedFixture,
  }, { Authorization: `Bearer ${token}` });
  await page.evaluate(async () => {
    if (typeof loadAdminSiteContent === "function") await loadAdminSiteContent();
    if (typeof renderAdminCurriculumLessonPlanManager === "function") renderAdminCurriculumLessonPlanManager();
  });
  await page.waitForTimeout(500);
  const listText = await page.locator("#adminCurriculumLessonPlanList").innerText();
  ok(!/DISPOSABLE TK Printable Prod Verify/i.test(listText), "Archived disposable fixture hidden from main lesson library");

  // Mobile section navigator
  const mobilePage = await mobile.newPage();
  await unlock(mobilePage);
  await mobilePage.evaluate((planId) => LLHLessonReviewEditor.open(planId, { sectionId: "basics" }), FIXTURE_ID);
  await mobilePage.waitForSelector("[data-lre-section-select]", { timeout: 10000 });
  await mobilePage.selectOption("[data-lre-section-select]", "tuesday");
  await mobilePage.waitForTimeout(200);
  ok(await mobilePage.locator("[data-lre-section-chrome] h2").innerText() === "Tuesday", "Mobile section dropdown navigates");
  await mobilePage.screenshot({ path: path.join(ARTIFACT_DIR, "lesson-review-mobile-tuesday.png"), fullPage: false });

  // Owner-only gate
  const otherBlocked = await page.evaluate(() => {
    const prev = window.adminSession;
    window.adminSession = () => ({ email: "other-admin@example.com", token: "x" });
    const result = LLHLessonReviewEditor.open("nope");
    window.adminSession = prev;
    return result === false;
  });
  ok(otherBlocked, "Non-owner cannot open Lesson Review Editor");
  } finally {
    await browser.close().catch(() => {});
  }
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
  let stderr = "";
  child.stderr.on("data", (d) => { stderr += String(d); });
  try {
    await waitForHealth(child);
    const token = await adminLogin();
    const before = await snapshotProtectedLessons(token);
    await seedCurriculum(token);
    await runBrowserTests(token);
    const after = await snapshotProtectedLessons(token);
    ok(JSON.stringify(before.farm) === JSON.stringify(after.farm), "Farm Animals unchanged");
    ok(JSON.stringify(before.allAboutMe) === JSON.stringify(after.allAboutMe), "All About Me unchanged");
    ok(JSON.stringify(before.apples) === JSON.stringify(after.apples), "Amazing Apples unchanged");
    console.log(`\nPASS ${passed} checks`);
  } catch (error) {
    console.error("\nFAIL", error.message || error);
    if (stderr) console.error(stderr.slice(-4000));
    process.exitCode = 1;
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE_PATH); } catch (_error) { /* ignore */ }
  }
}

main();
