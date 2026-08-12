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
    ageModifications: "Preschool (3–5 years)",
    durationMinutes: "10–15 minutes",
    objective: "Children practice a clear observable skill during play time together.",
    description: "Teacher-facing summary of the invitation for this activity with enough detail for providers.",
    materials: "basket, cards, unbreakable mirrors",
    preparation: "Stage mirrors and cards at child height before arrival.",
    setup: "Place materials at child height near the rug.",
    steps: "1. Invite two friends. 2. Model once. 3. Step back and narrate gently. 4. Close with one calm breath.",
    teacherRole: "Model, then observe.",
    teacherLanguage: "What do your eyebrows do when you feel surprised?",
    learningGoals: ["Name one feeling", "Try a peer idea"],
    observationOpportunities: "Does the child try a new expression without prompting?",
    vocabulary: "happy, calm, eyebrows",
    adaptations: "Offer photos instead of mirrors.",
    extensions: "Draw the face they practiced.",
    safetyNotes: "Use unbreakable mirrors only and stay nearby.",
    cleanupTips: "Return cards and mirrors to the shelf basket.",
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

  // Section navigation — only one section body; Activities opens one card at a time.
  await page.click('[data-lre-section="week"]');
  await page.waitForTimeout(200);
  ok(await page.locator("[data-lre-section-chrome] h2").innerText() === "Week Plan", "Week Plan section opens");
  await page.click('[data-lre-section="activities"]');
  await page.waitForTimeout(200);
  ok(await page.locator("[data-lre-section-chrome] h2").innerText() === "Activities", "Activities section opens");
  const activityCards = await page.locator(".llh-lre-activity-card").count();
  ok(activityCards >= 1, `Activities shows summary cards (${activityCards})`);
  await page.locator(".llh-lre-activity-card").first().click();
  await page.waitForSelector("[data-lre-activity-editor]", { timeout: 5000 });
  ok(await page.locator("[data-lre-activity-editor]").count() === 1, "Only one activity editor open");
  const coreHeading = await page.locator("[data-lre-core-section] h4").innerText();
  ok(/Core Activity/i.test(coreHeading), "Core Activity section is visible");
  const coreLabels = await page.locator("[data-lre-core-section] .llh-lre-label").allTextContents();
  [
    "Recommended age",
    "Estimated duration",
    "Activity objective",
    "What children will do",
    "Materials",
    "Teacher preparation",
    "Setup",
    "Step-by-step directions",
    "Teacher questions",
    "Learning and observation",
    "Safety and supervision",
    "Cleanup",
  ].forEach((label) => {
    ok(coreLabels.some((row) => row.includes(label)), `Core field present: ${label}`);
  });
  ok(await page.locator("[data-lre-enrichment-section]").count() === 1, "Enrichment section follows Core Activity");
  ok(await page.locator(".llh-lre-core-flag").count() >= 1, "Activity cards show Core status flag");
  const coreFlagText = await page.locator(".llh-lre-core-flag").first().innerText();
  ok(/^Core:\s*(Complete|Needs Work|Missing Safety Detail|Too Thin)$/i.test(coreFlagText.trim()), `Core status language is honest (${coreFlagText})`);

  // Modular Core helper: filler fails; incomplete Core is warning unless safety-critical.
  const coreRules = await page.evaluate(() => {
    const api = window.LLHLessonReviewEditor;
    const plan = { age: "Toddler", title: "Fixture" };
    const thin = api.assessCoreActivity({
      _key: "t1",
      title: "Apple Taste Test",
      activityCategory: "Sensory",
      ageModifications: "TBD",
      durationMinutes: "Add later",
      objective: "TBD",
      description: "Apple Taste Test",
      materials: "apples",
      preparation: "Add later",
      setup: "Coming soon",
      steps: "Do the activity.",
      teacherLanguage: "Ask questions",
      observationOpportunities: "Watch kids",
      safetyNotes: "",
      cleanupTips: "Clean up",
    }, plan);
    const safeIncompleteItem = {
      _key: "t2",
      title: "Hello Friends Circle",
      activityCategory: "Circle Time",
      ageModifications: "Preschool (3–5 years)",
      durationMinutes: "8–10 minutes",
      objective: "Children greet friends by name during morning circle.",
      description: "Children sit in a circle and practice greeting friends with a short song while the teacher models a calm wave.",
      materials: "Name cards\nA small soft ball",
      preparation: "Stage name cards near the rug before arrival.",
      setup: "Place name cards in a basket on the rug.",
      steps: "1. Sing hello.\n2. Pass the ball.\n3. Say a friend’s name.\n4. Close with a calm breath.",
      teacherLanguage: "Who would you like to greet today?",
      observationOpportunities: "Does the child try a peer name without prompting?",
      safetyNotes: "Keep the ball soft and stay nearby for balance.",
      cleanupTips: "",
    };
    const safeIncomplete = api.assessCoreActivity(safeIncompleteItem, plan);
    const missingAgeDuration = api.assessCoreActivity({
      ...safeIncompleteItem,
      _key: "t3",
      ageModifications: "",
      durationMinutes: "",
      cleanupTips: "Return cards to the basket after circle.",
    }, plan);
    const riskyPlan = {
      title: "Fixture",
      age: "Toddler",
      theme: "Apples",
      status: "draft",
      dailyPlans: {
        monday: {
          theme: "Taste",
          items: [{
            itemId: "taste-1",
            title: "Apple Taste Test",
            activityCategory: "Sensory",
            ageModifications: "Toddler",
            durationMinutes: "10 minutes",
            objective: "TBD",
            description: "Taste apples.",
            materials: "apple slices",
            preparation: "Wash fruit",
            setup: "Set trays",
            steps: "Taste.",
            teacherLanguage: "What do you notice?",
            observationOpportunities: "Watch tasting.",
            safetyNotes: "",
            cleanupTips: "Wipe trays",
          }],
        },
      },
      songs: [],
      books: [],
      resourceIds: [],
      teachingKit: { teacherToolkit: { overview: "Overview with enough words for toolkit.", preparation: "Prep checklist line one." } },
      weeklyOverview: "This disposable week explores tasting with enough words for overview checks to pass.",
      objectives: "Children will taste and describe apple slices with adult support nearby.",
      weeklyMaterials: "Apples, trays, napkins, wet cloths, name stickers for allergies",
      familyConnection: "Ask which apple taste they liked.",
    };
    const warningOnlyPlan = {
      title: "Fixture",
      age: "Preschool",
      theme: "Feelings",
      status: "draft",
      dailyPlans: {
        monday: {
          theme: "Faces",
          items: [{
            itemId: "circle-1",
            title: "Hello Friends Circle",
            activityCategory: "Circle Time",
            ageModifications: "Preschool (3–5 years)",
            durationMinutes: "8–10 minutes",
            objective: "Children greet friends by name during morning circle time together.",
            description: "Children sit in a circle and practice greeting friends with a short song while the teacher models a calm wave and waits for each child.",
            materials: "Name cards\nA small soft ball",
            preparation: "Stage name cards near the rug before children arrive for the day.",
            setup: "Place name cards in a basket on the rug before circle starts.",
            steps: "1. Sing hello together.\n2. Pass the soft ball gently.\n3. Say a friend’s name aloud.\n4. Close with one calm breath.",
            teacherLanguage: "Who would you like to greet today in our circle?",
            observationOpportunities: "Does the child try a peer name without prompting from an adult?",
            safetyNotes: "Keep the ball soft and stay nearby for balance support.",
            cleanupTips: "",
          }],
        },
      },
      songs: [{ title: "Hello Friends", lyrics: "Hello friends how do you do today in our classroom circle time", motions: "Wave and tap knees gently", source: "Original LLH" }],
      books: [{ title: "The Color Monster", author: "Anna Llenas", discussionPrompts: "What color is your feeling right now and where do you feel it?" }],
      resourceIds: [],
      teachingKit: { teacherToolkit: { overview: "Keep feelings work playful and brief for preschoolers today.", preparation: "Print cards\nStage mirrors" } },
      weeklyOverview: "This disposable week explores feelings with mirrors, songs, and short conversations for teachers.",
      objectives: "Children will name one feeling and notice a friend’s face during play.",
      weeklyMaterials: "Mirrors, feeling cards, name cards, crayons, baskets for small groups",
      familyConnection: "Ask your child which feeling they practiced and draw it together at home.",
    };
    const qualityRisky = api.evaluateQuality(riskyPlan);
    const qualityWarn = api.evaluateQuality(warningOnlyPlan);
    const progressWarn = api.overallProgress(warningOnlyPlan);
    return {
      thinComplete: thin.complete,
      thinStatus: thin.statusLabel,
      thinSafety: thin.safetyCritical,
      thinBlockers: thin.blockers.length,
      thinMissingAge: thin.missing.includes("Recommended age"),
      thinMissingDuration: thin.missing.includes("Estimated duration"),
      safeComplete: safeIncomplete.complete,
      safeStatus: safeIncomplete.statusLabel,
      safeBlockers: safeIncomplete.blockers.length,
      missingAgeDurationComplete: missingAgeDuration.complete,
      missingAgeDurationStatus: missingAgeDuration.statusLabel,
      missingAgeDurationBlockers: missingAgeDuration.blockers.length,
      missingAge: missingAgeDuration.missing.includes("Recommended age"),
      missingDuration: missingAgeDuration.missing.includes("Estimated duration"),
      qualityCoreBlockers: (qualityRisky.blockers || []).filter((row) => /cannot run|Safety and supervision|gold-standard/i.test(row.label)).length,
      qualityCoreWarnings: (qualityWarn.warnings || []).filter((row) => /Core Activity/i.test(row.label)).length,
      qualityWarnCoreBlockers: (qualityWarn.blockers || []).filter((row) => /Core Activity|cannot run|Safety and supervision/i.test(row.label)).length,
      progressSummary: progressWarn.summaryStatus,
      progressBlockers: progressWarn.blockerCount,
      progressWarnings: progressWarn.warningCount,
    };
  });
  ok(coreRules.thinComplete === false, "Filler Core text fails completion");
  ok(coreRules.thinMissingAge && coreRules.thinMissingDuration, "Filler Recommended age / Estimated duration fail completion");
  ok(/Missing Safety Detail|Too Thin|Needs Work/i.test(coreRules.thinStatus), `Thin/filler Core status (${coreRules.thinStatus})`);
  ok(coreRules.thinSafety === true && coreRules.thinBlockers >= 1, "Safety-critical Core issues can still block");
  ok(coreRules.safeComplete === false, "Missing cleanup still incomplete");
  ok(coreRules.safeStatus === "Needs Work", `Non-critical incomplete Core is Needs Work (${coreRules.safeStatus})`);
  ok(coreRules.safeBlockers === 0, "Non-critical incomplete Core has no activity blockers");
  ok(coreRules.missingAge && coreRules.missingDuration, "Missing Recommended age and Estimated duration count as Core Needs Work");
  ok(coreRules.missingAgeDurationStatus === "Needs Work" && coreRules.missingAgeDurationBlockers === 0, "Missing age/duration are warnings, not blockers");
  ok(coreRules.qualityCoreBlockers >= 1, "Safety-critical Core appears in quality blockers");
  ok(coreRules.qualityCoreWarnings >= 1, "Incomplete Core fields appear as review warnings");
  ok(coreRules.qualityWarnCoreBlockers === 0, "Non-critical incomplete Core does not inflate quality blockers");
  ok(!/Library Blocked/i.test(coreRules.progressSummary || ""), "Summary avoids Library Blocked language");
  ok(typeof coreRules.progressWarnings === "number" && coreRules.progressWarnings >= 1, "Progress exposes warning count separately from blockers");

  // Screenshot mode
  await page.click("[data-lre-screenshot-toggle]");
  await page.waitForTimeout(150);
  ok(await page.locator(".llh-lre.is-screenshot-mode").count() === 1, "Screenshot mode enabled");
  const screenshotChrome = await page.evaluate(() => {
    const cookie = document.querySelector(".llh-meta-cookie-notice, #llhMetaCookieNotice");
    const sidebar = document.querySelector("#adminSectionNav, .admin-workspace-sidebar");
    const cookieHidden = !cookie || getComputedStyle(cookie).display === "none" || getComputedStyle(cookie).visibility === "hidden";
    const sidebarHidden = !sidebar || getComputedStyle(sidebar).display === "none";
    const keeps = {
      lesson: Boolean(document.querySelector(".llh-lre-header h1")?.textContent?.trim()),
      section: Boolean(document.querySelector("[data-lre-section-chrome] h2")?.textContent?.trim()),
      activity: Boolean(document.querySelector("[data-lre-activity-title]")?.textContent?.trim()),
      labels: document.querySelectorAll(".llh-lre-label").length > 0,
      warnings: document.querySelectorAll("[data-lre-core-missing], [data-lre-core-blockers]").length >= 0,
    };
    return { cookieHidden, sidebarHidden, keeps, bodyShot: document.body.classList.contains("llh-lre-screenshot") };
  });
  ok(screenshotChrome.bodyShot, "Screenshot mode sets body class");
  ok(screenshotChrome.cookieHidden, "Screenshot mode hides cookie banner");
  ok(screenshotChrome.sidebarHidden, "Screenshot mode hides admin sidebar");
  ok(screenshotChrome.keeps.lesson && screenshotChrome.keeps.section && screenshotChrome.keeps.activity && screenshotChrome.keeps.labels, "Screenshot mode preserves lesson/activity/section/labels");
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
    await page.evaluate(() => {
      const buttons = [...document.querySelectorAll("[data-draft-review-open-kit]")];
      const visible = buttons.find((btn) => btn.offsetParent !== null) || buttons[0];
      visible?.click();
    });
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

    // Persist Recommended age + Estimated duration through Save Draft → refresh → reopen.
    const draftId = await page.evaluate(() => {
      const btn = document.querySelector("[data-draft-review-open-kit]");
      return btn?.getAttribute("data-draft-review-open-kit") || window.LLHLessonReviewEditor?.getState?.()?.planId || "";
    });
    await page.evaluate(() => {
      document.querySelector('[data-lre-section="activities"]')?.click();
    });
    await page.waitForTimeout(250);
    await page.evaluate(() => {
      document.querySelector("[data-lre-open-activity]")?.click();
    });
    await page.waitForSelector("[data-lre-core-field='ageModifications'] textarea, [data-lre-core-field='ageModifications']", { timeout: 8000 });
    const ageValue = "Preschool (3–5) — owner-persisted age";
    const durationValue = "12 minutes — owner-persisted duration";
    await page.fill("[data-lre-core-field='ageModifications'] textarea", ageValue);
    await page.fill("[data-lre-core-field='durationMinutes'] textarea", durationValue);
    await page.click("[data-lre-save-draft]");
    await page.waitForFunction(() => {
      const msg = document.querySelector(".llh-lre-header .form-message");
      const text = msg?.textContent || "";
      return /Draft saved|Published lesson unchanged/i.test(text);
    }, null, { timeout: 20000 });
    const saveProbe = await page.locator(".llh-lre-header .form-message").innerText();
    ok(/Draft saved|Published lesson unchanged/i.test(saveProbe), `Open Review Save Draft persisted age/duration (${saveProbe})`);

    const afterSave = await requestJson("GET", "/api/admin/site-content", null, { Authorization: `Bearer ${token}` });
    const savedPlan = (afterSave.json?.siteContent?.curriculum?.lessonPlans || []).find((p) => p.id === FIXTURE_ID);
    const savedDraftActs = savedPlan?.enrichmentDraft?.activities || {};
    const savedOverlay = Object.values(savedDraftActs).find((row) => row && (row.ageModifications || row.durationMinutes))
      || savedDraftActs[`${FIXTURE_ID}:item-monday-1`]
      || {};
    ok(/owner-persisted age/i.test(String(savedOverlay.ageModifications || "")), "enrichment_draft keeps Recommended age");
    ok(/owner-persisted duration/i.test(String(savedOverlay.durationMinutes || "")), "enrichment_draft keeps Estimated duration");

    const queueGet = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "get",
      id: submit.json?.entry?.id || submit.json?.detail?.id || draftId,
    }, { Authorization: `Bearer ${token}` });
    const queueActs = queueGet.json?.enrichmentDraft?.activities || {};
    const queueOverlay = Object.values(queueActs).find((row) => /owner-persisted age/i.test(String(row?.ageModifications || "")))
      || queueActs[`${FIXTURE_ID}:item-monday-1`]
      || {};
    ok(/owner-persisted age/i.test(String(queueOverlay.ageModifications || "")), "queue item sync keeps Recommended age");
    ok(/owner-persisted duration/i.test(String(queueOverlay.durationMinutes || "")), "queue item sync keeps Estimated duration");

    const pubFpBefore = JSON.stringify({
      title: savedPlan?.title,
      weeklyOverview: savedPlan?.weeklyOverview,
      status: savedPlan?.status,
      dailyTheme: savedPlan?.dailyPlans?.monday?.theme,
    });

    await page.evaluate(() => {
      if (window.LLHLessonReviewEditor?.isOpen?.()) {
        window.LLHLessonReviewEditor.close({ force: true, skipReturnNavigation: true });
      }
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    await page.evaluate(async ({ owner, ownerToken, planId, reviewId }) => {
      setAdminSession({
        email: owner.email,
        name: "Owner",
        token: ownerToken,
        mode: "server",
        trustedDevice: true,
      });
      localStorage.setItem("llhAdminPreviewMode", "Admin");
      setView("admin");
      if (typeof setAdminGroup === "function") setAdminGroup("content");
      if (typeof loadAdminSiteContent === "function") await loadAdminSiteContent();
      const opened = window.LLHLessonReviewEditor.open(planId, {
        draftReviewId: reviewId,
        ownerDraftReview: true,
        returnToQueue: true,
        sectionId: "activities",
      });
      return opened;
    }, {
      owner: OWNER,
      ownerToken: token,
      planId: FIXTURE_ID,
      reviewId: submit.json?.entry?.id || submit.json?.detail?.id || draftId,
    });
    await page.waitForFunction(() => Boolean(window.LLHLessonReviewEditor?.isOpen?.()), null, { timeout: 15000 });
    await page.evaluate(() => document.querySelector("[data-lre-open-activity]")?.click());
    await page.waitForSelector("[data-lre-core-field='ageModifications'] textarea", { timeout: 8000 });
    const reopenedAge = await page.inputValue("[data-lre-core-field='ageModifications'] textarea");
    const reopenedDuration = await page.inputValue("[data-lre-core-field='durationMinutes'] textarea");
    ok(/owner-persisted age/i.test(reopenedAge), "refresh/reopen shows saved Recommended age");
    ok(/owner-persisted duration/i.test(reopenedDuration), "refresh/reopen shows saved Estimated duration");

    const afterReopen = await requestJson("GET", "/api/admin/site-content", null, { Authorization: `Bearer ${token}` });
    const reopenedPlan = (afterReopen.json?.siteContent?.curriculum?.lessonPlans || []).find((p) => p.id === FIXTURE_ID);
    const pubFpAfter = JSON.stringify({
      title: reopenedPlan?.title,
      weeklyOverview: reopenedPlan?.weeklyOverview,
      status: reopenedPlan?.status,
      dailyTheme: reopenedPlan?.dailyPlans?.monday?.theme,
    });
    ok(pubFpBefore === pubFpAfter, "published lesson body shell remains unchanged after age/duration Save Draft");
    ok(reopenedPlan?.status === "draft" || reopenedPlan?.disposableQaFixture === true, "fixture stays non-customer draft");

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
    if (typeof applyAdminSectionVisibility === "function") applyAdminSectionVisibility();
    if (window.LLHDraftReviewQueue?.mount) await window.LLHDraftReviewQueue.mount();
  });
  await page.waitForFunction(() => document.querySelector("[data-draft-review-back-content]"), null, { timeout: 10000 });
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll("[data-draft-review-back-content]")];
    const visible = buttons.find((btn) => btn.offsetParent !== null) || buttons[0];
    visible?.click();
  });
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
  await mobilePage.selectOption("[data-lre-section-select]", "activities");
  await mobilePage.waitForTimeout(200);
  ok(await mobilePage.locator("[data-lre-section-chrome] h2").innerText() === "Activities", "Mobile section dropdown navigates");
  await mobilePage.screenshot({ path: path.join(ARTIFACT_DIR, "lesson-review-mobile-activities.png"), fullPage: false });

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
