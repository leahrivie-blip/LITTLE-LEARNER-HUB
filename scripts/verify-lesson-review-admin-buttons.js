#!/usr/bin/env node
/**
 * Post-merge admin verification: buttons, pictures, printables in Lesson Review Editor.
 * Disposable fixture only — does not publish live lessons.
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const os = require("node:os");
const { spawn } = require("node:child_process");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const ROOT = path.join(__dirname, "..");
const PORT = 7300 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(os.tmpdir(), `llh-lre-verify-${crypto.randomBytes(4).toString("hex")}.json`);
const OUT = "/opt/cursor/artifacts/screenshots";
const OWNER = {
  email: "leahivie@icloud.com",
  password: "lesson-review-verify-pass",
  code: "lesson-review-verify-code",
};
const FIXTURE_ID = `cur-lp-disposable-lre-verify-${crypto.randomBytes(4).toString("hex")}`;
const RESOURCE_A = `cur-res-draft-${FIXTURE_ID}-a`;
const RESOURCE_B = `cur-res-draft-${FIXTURE_ID}-b`;

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
  for (let i = 0; i < 100; i += 1) {
    if (child.exitCode != null) throw new Error("server exited");
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("health timeout");
}

async function tinyPdfDataUrl(label) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([612, 792]);
  page.drawText("Little Learner Hub", { x: 72, y: 720, size: 18, font, color: rgb(0.12, 0.3, 0.25) });
  page.drawText(label, { x: 72, y: 680, size: 14, font });
  const bytes = await doc.save();
  return `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}`;
}

function plan() {
  // Activity image fields only accept https / data:image / public enrichment media — not /images paths.
  const img = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC";
  const act = (day, n, title, category, needsImage) => ({
    itemId: `item-${day}-${n}`,
    title,
    activityCategory: category,
    objective: "Children practice a clear skill with a peer during play.",
    description: "Teacher-facing invitation summary for the activity.",
    materials: "cards, basket, tray",
    setup: "Place materials at child height.",
    steps: "1. Invite. 2. Model. 3. Narrate gently.",
    teacherRole: "Model then observe.",
    teacherLanguage: "What do you notice?",
    learningGoals: ["Name one idea"],
    observationOpportunities: "Does the child try a peer idea?",
    vocabulary: "calm, share",
    exampleImageUrl: needsImage ? img : "",
    setupImageUrl: needsImage ? img : "",
    noImageNeeded: !needsImage,
  });
  const day = (theme, items) => ({
    theme,
    objectives: "Explore the theme through play invitations today.",
    materials: "Day-specific trays only.",
    preparation: "Stage trays before arrival.",
    schedule: "Arrival → circle → small groups → outdoor.",
    observationFocus: "Peer talk and turn taking.",
    teacherQuestions: "What helped today?",
    familyConnection: "Ask what we practiced.",
    books: [{ title: "The Color Monster", author: "Anna Llenas", discussionPrompts: "Which color matches your body today and why?" }],
    songs: [{ title: "Hello Friends", source: "Original LLH", lyrics: "Hello friends how do you do today in class", motions: "Wave and tap" }],
    items,
  });
  return {
    id: FIXTURE_ID,
    title: "DISPOSABLE LRE Admin Verify",
    age: "Preschool",
    theme: "Feelings",
    plan: "Pro",
    status: "draft",
    disposableQaFixture: true,
    coverImageUrl: "/images/lesson-covers/default.svg",
    weeklyOverview: "A disposable week for verifying pictures, printables, and owner buttons in the focused editor.",
    objectives: "Children will name one feeling and notice a friend during play.",
    weeklyMaterials: "mirrors, cards, crayons, baskets",
    vocabularyWords: "feelings, calm, proud, unique",
    familyConnection: "Ask which feeling we practiced and draw it.",
    observationOpportunities: "Notice greetings by name.",
    adaptations: "Offer photo supports as needed.",
    learningDomains: ["Social-Emotional", "Language"],
    books: [{ title: "The Color Monster", author: "Anna Llenas", discussionPrompts: "What color is your feeling right now?" }],
    songs: [{ title: "Hello Friends", source: "Original LLH", lyrics: "Hello friends how do you do today in class", motions: "Wave", weekday: "monday" }],
    resourceIds: [RESOURCE_A],
    teachingKit: { schemaVersion: 1, teacherToolkit: { overview: "Keep it brief.", preparation: "Print cards\nStage mirrors", tips: "Narrate gently." } },
    dailyPlans: {
      monday: day("Faces", [act("monday", 1, "Mirror Feelings", "Circle Time", false), act("monday", 2, "Feeling Collage", "Art", true)]),
      tuesday: day("Names", [act("tuesday", 1, "Name Song", "Song", false)]),
      wednesday: day("Bodies", [act("wednesday", 1, "Calm Moves", "Movement", false)]),
      thursday: day("Friends", [act("thursday", 1, "Friend Portrait", "Art", true)]),
      friday: day("Families", [act("friday", 1, "Family Share", "Circle Time", false)]),
    },
  };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const pdfA = await tinyPdfDataUrl("Feelings Card Pack A");
  const pdfB = await tinyPdfDataUrl("Feelings Card Pack B");
  const resourceA = {
    id: RESOURCE_A,
    title: "DISPOSABLE Feelings Picture Card Pack",
    resourceCategory: "Printables",
    resourceType: "Picture cards",
    status: "draft",
    accessLevel: "pro",
    ageGroup: "Preschool",
    theme: "Feelings",
    fileName: "feelings-a.pdf",
    mimeType: "application/pdf",
    fileData: pdfA,
    previewImageUrl: "/images/lesson-covers/default.svg",
    lessonPlanIds: [FIXTURE_ID],
    pageCount: 1,
  };
  const resourceB = {
    ...resourceA,
    id: RESOURCE_B,
    title: "DISPOSABLE Extra Feeling Faces Pack",
    fileName: "feelings-b.pdf",
    fileData: pdfB,
    lessonPlanIds: [],
  };
  const now = new Date().toISOString();
  // Preload store so preschool seed does not replace our disposable fixture set.
  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {},
    adminSessions: {},
    siteContent: {
      featureFlags: {
        playBasedCurriculum: true,
        teachingKitQualityReview: true,
        teachingKitEnrichmentEditor: false,
      },
      curriculum: {
        lessonPlans: [plan()],
        activities: [],
        resources: [resourceA, resourceB],
        updatedAt: now,
      },
      curriculumDraftReviews: [],
      updatedAt: now,
    },
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
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (d) => { stderr += String(d); });

  try {
    await waitForHealth(child);
    const login = await requestJson("POST", "/api/admin/login", OWNER);
    ok(login.status === 200 && login.json?.token, "Admin login works");
    const token = login.json.token;
    const auth = { Authorization: `Bearer ${token}` };

    const site = (await requestJson("GET", "/api/admin/site-content", null, auth)).json.siteContent;
    const plans = site?.curriculum?.lessonPlans || [];
    const resources = site?.curriculum?.resources || [];
    ok(plans.some((p) => p.id === FIXTURE_ID), "Disposable lesson present in admin curriculum");
    ok(resources.some((r) => r.id === RESOURCE_A), "Disposable printable present in admin curriculum");

    const { chromium } = require("playwright");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    try {
      await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => typeof setAdminSession === "function" && typeof setView === "function", null, { timeout: 30000 });
      await page.evaluate(({ owner, token: t }) => {
        setAdminSession({ email: owner.email, name: "Owner", token: t, mode: "server", trustedDevice: true });
        localStorage.setItem("llhAdminPreviewMode", "Admin");
      }, { owner: OWNER, token });
      await page.evaluate(async () => {
        setView("admin");
        await loadAdminSiteContent();
        setAdminSectionTab("curriculum-lesson-plans");
        applyAdminSectionVisibility();
      });
      await page.waitForTimeout(700);

      // Content sidebar → Content Home
      await page.click('[data-admin-group="content"]');
      await page.waitForTimeout(400);
      const homeText = await page.locator("body").innerText();
      ok(/Content Home|Lesson Plans|Library Health|AI Curriculum Director|Visual Production/i.test(homeText), "Content Home shows management cards");
      await page.screenshot({ path: path.join(OUT, "verify-content-home.png"), fullPage: false });

      // Open lesson plans + focused editor
      await page.evaluate(async () => {
        setAdminSectionTab("curriculum-lesson-plans");
        applyAdminSectionVisibility();
        await loadAdminSiteContent();
        renderAdminCurriculumLessonPlanManager();
      });
      await page.waitForTimeout(500);
      const opened = await page.evaluate((id) => LLHLessonReviewEditor.open(id, { sectionId: "basics" }), FIXTURE_ID);
      ok(opened === true, "Lesson Review Editor opens from Lesson Plans path");
      await page.waitForSelector("[data-lesson-review-editor]");

      // Header buttons present
      for (const sel of ["[data-lre-save-draft]", "[data-lre-preview]", "[data-lre-back]", "[data-lre-screenshot-toggle]"]) {
        ok(await page.locator(sel).count() === 1, `Header control present: ${sel}`);
      }

      // Cover image visible in Basics
      const coverVisible = await page.locator(".llh-lre-cover").isVisible().catch(() => false);
      ok(coverVisible, "Basics section shows cover image");
      await page.screenshot({ path: path.join(OUT, "verify-basics-cover.png"), fullPage: false });

      // Activities section + open art activity with image
      await page.click('[data-lre-section="activities"]');
      await page.waitForTimeout(200);
      await page.locator(".llh-lre-activity-card", { hasText: "Feeling Collage" }).click();
      await page.waitForSelector("[data-lre-activity-editor]");
      const exampleInput = page.locator('[data-lre-activity-editor] [data-lre-path$=".exampleImageUrl"]').first();
      await exampleInput.scrollIntoViewIfNeeded();
      const exampleVal = await exampleInput.inputValue();
      ok(/^data:image\//.test(exampleVal) || /^https?:\/\//.test(exampleVal) || exampleVal.startsWith("/"), `Activity editor has example image URL (${exampleVal.slice(0, 48)}…)`);
      const activityImg = await page.locator("[data-lre-activity-editor] img.llh-lre-thumb").count();
      ok(activityImg >= 1, `Activity editor shows example/setup image thumbnails (${activityImg})`);
      await page.screenshot({ path: path.join(OUT, "verify-activity-images.png"), fullPage: false });

      // Images section shows real images
      await page.click('[data-lre-section="images"]');
      await page.waitForTimeout(200);
      const imageSectionImgs = await page.locator(".llh-lre-image-grid img.llh-lre-image").count();
      ok(imageSectionImgs >= 2, `Example Images section shows real images (${imageSectionImgs})`);
      await page.screenshot({ path: path.join(OUT, "verify-images-section.png"), fullPage: false });

      // Printables: linked pack visible with preview thumb + actions
      await page.click('[data-lre-section="printables"]');
      await page.waitForTimeout(250);
      const printableText = await page.locator(".llh-lre-printable-list").innerText();
      ok(/Feelings Picture Card Pack/i.test(printableText), "Linked printable appears in Printables section");
      ok(await page.locator("[data-lre-resource-preview]").count() >= 1, "Printable Preview button present");
      ok(await page.locator("[data-lre-resource-approve]").count() >= 1, "Printable Approve button present");
      ok(await page.locator("[data-lre-resource-changes]").count() >= 1, "Printable Request Changes button present");
      ok(await page.locator("[data-lre-resource-unlink]").count() >= 1, "Printable Unlink button present");
      const thumbImg = await page.locator(".llh-lre-printable-list img.llh-lre-thumb").count();
      const thumbPlaceholder = await page.locator(".llh-lre-printable-list .llh-lre-thumb").count();
      ok(thumbImg >= 1 || thumbPlaceholder >= 1, `Printable shows preview thumb or PDF placeholder (img=${thumbImg}, nodes=${thumbPlaceholder})`);

      // Preview action should be clickable without throwing
      await page.locator("[data-lre-resource-preview]").first().click();
      await page.waitForTimeout(400);
      ok(true, "Printable Preview button click does not error");

      // Link second printable into the right section
      const options = await page.locator("[data-lre-link-resource] option").allTextContents();
      ok(options.some((t) => /Extra Feeling Faces Pack/i.test(t)), "Unlinked printable appears in Link existing dropdown");
      await page.selectOption("[data-lre-link-resource]", RESOURCE_B);
      await page.click("[data-lre-link-resource-btn]");
      await page.waitForTimeout(1200);
      // Re-open printables after link re-render
      if (await page.locator('[data-lre-section="printables"]').count()) {
        await page.click('[data-lre-section="printables"]');
        await page.waitForTimeout(200);
      }
      const afterLink = await page.locator(".llh-lre-printable-list").innerText();
      ok(/Extra Feeling Faces Pack/i.test(afterLink), "Newly linked printable appears in Printables section");
      const linkedCount = await page.locator("[data-lre-resource]").count();
      ok(linkedCount >= 2, `Printables section lists linked packs (${linkedCount})`);
      await page.screenshot({ path: path.join(OUT, "verify-printables-linked.png"), fullPage: false });

      // Approve printable action
      await page.locator("[data-lre-resource-approve]").first().click();
      await page.waitForTimeout(200);
      const approveMsg = await page.locator(".llh-lre-header .form-message").innerText();
      ok(/Approved|not published/i.test(approveMsg), `Approve printable feedback: ${approveMsg}`);

      // Section navigator buttons all switch sections
      const sections = ["basics", "overview", "objectives", "materials", "songs", "books", "toolkit", "family", "quality", "publish"];
      for (const id of sections) {
        await page.click(`[data-lre-section="${id}"]`);
        await page.waitForTimeout(120);
        const active = await page.locator(`[data-lre-section="${id}"].is-active`).count();
        ok(active === 1, `Section nav works: ${id}`);
      }

      // Preview button jumps to publish
      await page.click("[data-lre-preview]");
      await page.waitForTimeout(150);
      ok(await page.locator('[data-lre-section="publish"].is-active').count() === 1, "Preview button opens Preview & Publish");

      // Save Draft
      await page.click("[data-lre-save-draft]");
      await page.waitForFunction(() => {
        const t = document.querySelector(".llh-lre-header .form-message")?.textContent || "";
        return t && !/Saving draft/i.test(t);
      }, null, { timeout: 20000 });
      const saveMsg = await page.locator(".llh-lre-header .form-message").innerText();
      ok(/Draft saved/i.test(saveMsg), `Save Draft works: ${saveMsg}`);

      // Screenshot mode toggle
      await page.click("[data-lre-screenshot-toggle]");
      ok(await page.locator(".llh-lre.is-screenshot-mode").count() === 1, "Screenshot mode toggles on");
      await page.locator("[data-lre-screenshot-toggle]").click({ force: true });
      ok(await page.locator(".llh-lre.is-screenshot-mode").count() === 0, "Screenshot mode toggles off");

      // Quality blocker jump
      await page.click('[data-lre-section="quality"]');
      await page.waitForTimeout(150);
      if (await page.locator(".llh-lre-blocker-link").count()) {
        await page.locator(".llh-lre-blocker-link").first().click();
        await page.waitForTimeout(200);
        ok(await page.locator("[data-lre-section-chrome]").count() === 1, "Quality blocker jump opens a section");
      } else {
        ok(true, "No blockers (fixture complete)");
      }

      // Library Health / AI Director separate screens
      await page.evaluate(() => {
        LLHLessonReviewEditor.close({ force: true, skipReturnNavigation: true });
        setAdminSectionTab("curriculum-library-health");
        applyAdminSectionVisibility();
      });
      await page.waitForTimeout(400);
      ok(await page.locator("#adminLibraryHealthHost").count() === 1, "Library Health has its own screen host");
      await page.evaluate(() => {
        setAdminSectionTab("curriculum-ai-director");
        applyAdminSectionVisibility();
      });
      await page.waitForTimeout(400);
      ok(await page.locator("#adminCurriculumDirectorHost").count() === 1, "AI Curriculum Director has its own screen host");

      // Back to Lesson Plans from editor
      await page.evaluate((id) => LLHLessonReviewEditor.open(id), FIXTURE_ID);
      await page.waitForSelector("[data-lre-back]");
      await page.click("[data-lre-back]");
      await page.waitForTimeout(400);
      ok(await page.evaluate(() => LLHLessonReviewEditor.isOpen() !== true), "Back to Lesson Plans closes editor");

      // Confirm linked resources persisted on plan
      await page.evaluate(async () => { await loadAdminSiteContent(); });
      const linkedIds = await page.evaluate((id) => {
        const p = curriculumLessonPlanById(id);
        return p?.resourceIds || [];
      }, FIXTURE_ID);
      ok(linkedIds.includes(RESOURCE_A) && linkedIds.includes(RESOURCE_B), "Both printables remain linked on the lesson after save/link");

      await page.screenshot({ path: path.join(OUT, "verify-lesson-plans-after.png"), fullPage: false });
    } finally {
      await browser.close().catch(() => {});
    }

    console.log(`\nPASS ${passed} admin verification checks`);
  } catch (error) {
    console.error("\nFAIL", error.message || error);
    if (stderr) console.error(stderr.slice(-3000));
    process.exitCode = 1;
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main();
