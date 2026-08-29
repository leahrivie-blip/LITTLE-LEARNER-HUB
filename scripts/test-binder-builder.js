#!/usr/bin/env node
/**
 * Binder Builder — model, transform, QR, readiness, API, print guards.
 * Run: npm run test:binder-builder
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const model = require("./binder-builder-model.js");
const transform = require("./binder-builder-transform.js");
const qr = require("./binder-builder-qr.js");
const readiness = require("./binder-builder-readiness.js");
const print = require("./binder-builder-print.js");

const ROOT = path.join(__dirname, "..");
const { allocateSafeTestPort } = require("./test-helpers/safe-test-port.js");
const PORT = allocateSafeTestPort(5200, 400);
const STORE_PATH = path.join(os.tmpdir(), `llh-binder-builder-${crypto.randomBytes(4).toString("hex")}.json`);

const OWNER = {
  email: "leahivie@icloud.com",
  password: "binder-builder-pass",
  code: "binder-builder-code",
};
const OTHER = {
  email: "other-admin@example.com",
  password: "binder-builder-pass",
  code: "binder-builder-code",
};

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

function sampleLesson(age, overrides = {}) {
  const id = overrides.id || `cur-lp-bb-${age.toLowerCase()}-${crypto.randomBytes(3).toString("hex")}`;
  return {
    id,
    title: overrides.title || `${age} Leaf Explorers`,
    age,
    theme: "Autumn Leaves",
    plan: "Pro",
    status: "published",
    weeklyOverview: "Explore fall colors, leaves, and outdoor wonder.",
    objectives: "Notice colors, practice fine motor, build vocabulary.",
    learningDomains: ["Language", "Physical"],
    weeklyMaterials: "GIANT MATERIALS LIST THAT MUST NEVER PRINT: scissors, glue, 40 leaves…",
    familyConnection: "Ask families to share a favorite outdoor memory.",
    observationOpportunities: "Listen for color words.",
    coverImageUrl: overrides.coverImageUrl || "https://example.com/covers/leaves.jpg",
    coverImageAlt: "Children exploring leaves",
    books: [
      {
        title: "Leaf Man",
        author: "Lois Ehlert",
        whyThisBook: "Connects collage art with nature walks.",
        beforeReadingQuestions: ["What colors do you see on the cover?"],
        afterReadingQuestions: ["Where might Leaf Man go next?"],
        resourceUrl: "https://example.com/story/leaf-man",
      },
    ],
    songs: [
      {
        title: "Autumn Leaves Are Falling",
        whenToUse: "Morning Meeting",
        motions: "Flutter fingers downward like leaves.",
        teacherDirections: "Sing slowly and invite children to copy motions.",
        audioUrl: "https://example.com/songs/autumn-leaves",
        rightsStatus: "original",
        allowPrintLyrics: true,
        lyrics: "Autumn leaves are falling down.",
      },
    ],
    dailyPlans: {
      monday: {
        theme: "Little Leaf Explorers",
        focus: "Little Leaf Explorers",
        objectives: "Explore fall colors through hands-on play.",
        items: [
          {
            itemId: "act-mon-1",
            title: "Leaf Color Hunt",
            description: "Children hunt for colorful leaves outdoors.",
            steps: ["Invite children outdoors.", "Collect a few colorful leaves.", "Name the colors together."],
            learningGoals: ["Color recognition"],
            teacherLanguage: "Which leaf looks brightest today?",
            extraSupport: "Offer a smaller collection area.",
            extensions: "Sort leaves by size.",
            exampleImageUrl: "https://example.com/acts/leaf-hunt.jpg",
            activityCategory: "Outdoor Play",
          },
        ],
      },
      tuesday: {
        theme: "Crunchy Paths",
        items: [
          {
            itemId: "act-tue-1",
            title: "Leaf Stamping",
            description: "",
            steps: "",
            activityCategory: "Art",
          },
        ],
      },
      wednesday: { theme: "Wind Watchers", items: [{ itemId: "act-wed-1", title: "Wind Dance", description: "Move like wind.", steps: ["Sway arms.", "Spin gently."], activityCategory: "Gross Motor" }] },
      thursday: { theme: "Nature Collage", items: [{ itemId: "act-thu-1", title: "Sticky Leaf Collage", description: "Press leaves onto sticky paper.", steps: ["Offer sticky paper.", "Press leaves."], activityCategory: "Art" }] },
      friday: { theme: "Thankful Trees", items: [{ itemId: "act-fri-1", title: "Grateful Leaf Share", description: "Share one favorite leaf moment.", steps: ["Sit in circle.", "Each child shares."], activityCategory: "Literacy" }] },
    },
    ...overrides,
  };
}

function writeSeedStore(lessons) {
  const store = {
    siteContent: {
      curriculum: {
        lessonPlans: lessons,
        activities: [],
        resources: [],
        series: [],
      },
      updatedAt: new Date().toISOString(),
    },
    featureFlags: {},
    binderBuilder: { drafts: [], updatedAt: "" },
    visualProduction: { briefs: [], updatedAt: "" },
  };
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn("node", ["server/index.js"], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(PORT),
        LLH_STORE_PATH: STORE_PATH,
        DATABASE_PROVIDER: "local-json",
        NODE_ENV: "test",
        ADMIN_EMAIL: OWNER.email,
        ADMIN_EMAILS: `${OWNER.email},${OTHER.email}`,
        ADMIN_PASSWORD: OWNER.password,
        ADMIN_ACCESS_CODE: OWNER.code,
        LLH_ENFORCE_TK_OWNER_ADMIN: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let ready = false;
    const onData = (buf) => {
      const text = String(buf);
      if (!ready && (/listening|ready|server/i.test(text) || text.includes(String(PORT)))) {
        ready = true;
        resolve(child);
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", reject);
    child.on("exit", (code) => {
      if (!ready) reject(new Error(`Server exited early (${code})`));
    });
    setTimeout(() => {
      if (!ready) {
        ready = true;
        resolve(child);
      }
    }, 2500);
  });
}

function request(method, urlPath, { token, body } = {}) {
  const payload = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1",
      port: PORT,
      path: urlPath,
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
      },
    }, (res) => {
      let raw = "";
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        let json = {};
        try { json = raw ? JSON.parse(raw) : {}; } catch { json = { raw }; }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function login(email) {
  const result = await request("POST", "/api/admin/login", {
    body: { email, password: OWNER.password, code: OWNER.code },
  });
  assert.equal(result.status, 200, `login failed for ${email}: ${JSON.stringify(result.json)}`);
  return result.json.token || result.json.adminToken || result.json.session?.token;
}

async function waitForHealth() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const result = await request("GET", "/api/health");
      if (result.status === 200) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("Server health check failed");
}

function unitTests() {
  console.log("\n[unit] model / transform / qr / readiness / print");

  const infant = sampleLesson("Infant", { coverImageUrl: "" });
  const toddler = sampleLesson("Toddler");
  const preschool = sampleLesson("Preschool");

  const draft = model.createDraftFromLesson(preschool);
  ok(draft.sourceLessonId === preschool.id, "draft references source lesson id");
  ok(draft.days.monday.activities.length === 1, "monday activities mapped");
  ok(draft.books.length === 1 && draft.songs.length === 1, "books and songs stubbed");

  const beforeMaterials = preschool.weeklyMaterials;
  const doc = transform.buildBinderDocument(draft, preschool);
  ok(doc.coverImage.hasImage === true, "cover image loads from lesson");
  ok(doc.days.length === 5, "five days present");
  ok(doc.days.every((day) => day.label), "day labels present");
  const pages = transform.buildPagePlan(doc);
  const dividers = pages.filter((p) => p.type === "dayDivider");
  ok(dividers.length === 5, "Monday-Friday dividers once each");
  ok(pages.filter((p) => p.type === "dayDivider" && p.dayKey === "monday").length === 1, "monday divider once");

  const monActs = doc.days.find((d) => d.dayKey === "monday").activities;
  ok(monActs[0].title === "Leaf Color Hunt", "correct activity under monday");
  ok(monActs[0].howToDoIt.text.includes("Invite children outdoors"), "directions from source");

  draft.days.monday.activities[0].howToDoItOverride = "Binder-only short directions.";
  const overridden = transform.buildBinderDocument(draft, preschool);
  ok(overridden.days[0].activities[0].howToDoIt.text === "Binder-only short directions.", "binder override wins");
  ok(overridden.days[0].activities[0].howToDoIt.origin === "override", "override origin marked");
  ok(preschool.dailyPlans.monday.items[0].steps[0] === "Invite children outdoors.", "source lesson not mutated by override");
  ok(preschool.weeklyMaterials === beforeMaterials, "source weeklyMaterials unchanged");

  draft.days.monday.activities[0].howToDoItOverride = "";
  const resetDoc = transform.buildBinderDocument(draft, preschool);
  ok(resetDoc.days[0].activities[0].howToDoIt.origin === "source", "reset-to-source uses lesson content");

  // Explicit blank welcome must persist (not falsy-fallback to default)
  const beforeWelcomeLesson = JSON.stringify(preschool);
  ok(Boolean(draft.welcomeCopy), "welcome starts with default binder copy");
  draft.welcomeCopy = "";
  const blankNormalized = model.normalizeBinderDraft(draft);
  ok(blankNormalized.welcomeCopy === "", "normalize keeps explicit blank welcome");
  const blankDoc = transform.buildBinderDocument(blankNormalized, preschool);
  ok(blankDoc.welcomeCopy === "", "transform honors blank welcome (no default restore)");
  const blankPrint = print.buildBinderPrintHtml(blankNormalized, preschool, { qrSvgByUrl: {} });
  ok(!/This binder is organized by day/i.test(blankPrint.html), "blank welcome does not print default copy");
  // Deliberate restore of default welcome (distinct from blank)
  blankNormalized.welcomeCopy = model.DEFAULT_WELCOME_COPY;
  const restored = model.normalizeBinderDraft(blankNormalized);
  ok(restored.welcomeCopy === model.DEFAULT_WELCOME_COPY, "assigning DEFAULT_WELCOME_COPY restores default welcome");
  ok(JSON.stringify(preschool) === beforeWelcomeLesson, "blank welcome path does not mutate source lesson");

  const infantDraft = model.createDraftFromLesson(infant);
  const infantDoc = transform.buildBinderDocument(infantDraft, infant);
  ok(infantDoc.ageGroup === "Infant", "infant lesson loads");
  ok(infantDoc.coverImage.hasImage === false, "missing cover falls back (no image)");

  const toddlerDraft = model.createDraftFromLesson(toddler);
  ok(transform.buildBinderDocument(toddlerDraft, toddler).ageGroup === "Toddler", "toddler lesson loads");

  const thinDayTitle = transform.dayTitleFromSource({ items: [{ title: "Helper Hats" }] });
  ok(thinDayTitle === "Helper Hats", "day title falls back to first activity when day theme missing");

  const valid = qr.validateBinderUrl("https://example.com/resource");
  ok(valid.ok === true, "QR accepts valid HTTPS URL");
  const invalid = qr.validateBinderUrl("not a url");
  ok(invalid.ok === false, "QR rejects malformed URL");
  const emptyQr = qr.qrFigureHtml({ url: "", svg: "" });
  ok(emptyQr === "", "missing QR does not create customer UI");

  draft.sections.learningCenters = false;
  const printed = print.buildBinderPrintHtml(draft, preschool, { qrSvgByUrl: {} });
  ok(!/GIANT MATERIALS LIST/i.test(printed.html), "materials list not printed");
  ok(!/weeklyMaterials/i.test(printed.html), "weeklyMaterials field not printed");
  ok(!/Preparation checklist|packing list|assembly/i.test(printed.html), "no assembly/packing sheet");
  ok(/How to Use This Binder/.test(printed.html), "welcome page present");
  ok(/Week at a Glance/.test(printed.html), "week overview present");
  ok((printed.html.match(/data-bb-page="dayDivider"/g) || []).length === 5, "five divider pages in print html");
  ok(/Leaf Color Hunt/.test(printed.html), "activity appears in print");
  ok(/Story Time/.test(printed.html), "story time section present");
  ok(/Music &amp; Movement|Music & Movement/.test(printed.html), "music section present");
  ok(!/undefined|null|N\/A/.test(printed.html.replace(/<[^>]+>/g, " ")), "no undefined/null/N/A text");
  ok(!/Binder override|Using lesson content|sourceLessonId|data-bb-admin-chrome/i.test(printed.html), "print html has no admin/internal labels");

  draft.books[0].resourceUrl = "https://example.com/story/leaf-man";
  const withQrHtml = print.buildBinderPrintHtml(draft, preschool, {
    qrSvgByUrl: { "https://example.com/story/leaf-man": "<svg xmlns='http://www.w3.org/2000/svg'></svg>" },
  });
  ok(/bb-qr-figure/.test(withQrHtml.html), "valid QR renders in story section");

  draft.books[0].resourceUrl = "bad://url";
  const reportBad = readiness.evaluateBinderReadiness(draft, preschool);
  ok(reportBad.status === "NEEDS REVIEW", "invalid story QR marks needs review");
  ok(reportBad.issues.some((i) => i.code === "invalid_story_qr"), "invalid story QR warning specific");

  draft.books[0].resourceUrl = "https://example.com/story/leaf-man";
  draft.days.tuesday.activities[0].howToDoItOverride = "";
  const reportEmpty = readiness.evaluateBinderReadiness(draft, preschool);
  ok(reportEmpty.issues.some((i) => /Leaf Stamping/.test(i.section) && i.code === "empty_activity_directions"), "missing Tuesday directions flagged");

  // Section toggles
  draft.sections.books = false;
  draft.sections.songs = false;
  const toggled = transform.buildPagePlan(transform.buildBinderDocument(draft, preschool));
  ok(!toggled.some((p) => p.type === "books" || p.type === "songs"), "section toggles hide books/songs");

  // Required daily teaching pages cannot be disabled (even via crafted payload)
  draft.sections.dailyPlans = false;
  const forced = model.normalizeBinderDraft(draft);
  ok(forced.sections.dailyPlans === true, "normalize forces dailyPlans required");
  const forcedPages = transform.buildPagePlan(transform.buildBinderDocument(forced, preschool));
  ok(forcedPages.filter((p) => p.type === "dayPlans").length === 5, "dayPlans pages remain when dailyPlans forced");

  // --- Phase 1 print polish regressions ---
  const phase1Lesson = sampleLesson("Preschool", {
    id: "cur-lp-bb-phase1-polish",
    title: "Phase 1 Print Polish Sample",
  });
  // Monday has exampleImageUrl; Tuesday has none (see sampleLesson)
  phase1Lesson.dailyPlans.monday.items.push({
    itemId: "act-mon-2",
    title: "Second Monday Activity",
    description: "A second activity on the same day.",
    steps: ["Step one.", "Step two."],
    learningGoals: ["Sharing"],
    activityCategory: "Literacy",
  });
  const phase1Before = JSON.stringify(phase1Lesson);
  const phase1Draft = model.createDraftFromLesson(phase1Lesson);
  const phase1Doc = transform.buildBinderDocument(phase1Draft, phase1Lesson);
  const monDay = phase1Doc.days.find((d) => d.dayKey === "monday");
  const tueDay = phase1Doc.days.find((d) => d.dayKey === "tuesday");
  ok(!monDay.image?.url, "day divider does not inherit first activity image");
  ok(transform.dayImageFromSource(phase1Lesson.dailyPlans.monday).url === "", "dayImageFromSource returns empty without day-level image");
  ok(monDay.activities[0].image?.url === "https://example.com/acts/leaf-hunt.jpg", "activity keeps its own exampleImageUrl");
  ok(!tueDay.activities[0].image?.url, "activity without image has empty image url");

  const phase1Pages = transform.buildPagePlan(phase1Doc);
  const monPlanPages = phase1Pages.filter((p) => p.type === "dayPlans" && p.dayKey === "monday");
  ok(monPlanPages.length === 2, "one dayPlans page per monday activity");
  ok(monPlanPages.every((p) => p.activityId), "each dayPlans page carries activityId");
  ok(phase1Pages.filter((p) => p.type === "dayPlans").length === 6, "page plan emits one page per activity across the week");

  const phase1Print = print.buildBinderPrintHtml(phase1Draft, phase1Lesson, { qrSvgByUrl: {} });
  const activityPages = phase1Print.html.match(/data-bb-page="dayPlans"/g) || [];
  ok(activityPages.length === 6, "print renders one activity page per activity");
  ok((phase1Print.html.match(/data-bb-activity-page="/g) || []).length === 6, "each activity page tagged with activity id");

  const withImgSlice = phase1Print.html.split('data-bb-activity-page="')[1] || "";
  const monActId = monDay.activities[0].id;
  const tueActId = tueDay.activities[0].id;
  const withImgHtml = phase1Print.html.includes(`data-bb-activity-page="${monActId}"`)
    ? phase1Print.html.split(`data-bb-activity-page="${monActId}"`)[1].split('data-bb-page=')[0]
    : "";
  const noImgHtml = phase1Print.html.includes(`data-bb-activity-page="${tueActId}"`)
    ? phase1Print.html.split(`data-bb-activity-page="${tueActId}"`)[1].split('data-bb-page=')[0]
    : "";
  ok(/example\.com\/acts\/leaf-hunt\.jpg/.test(withImgHtml), "activity with image displays its own image url");
  ok(/bb-activity-media/.test(withImgHtml), "activity with image renders media frame");
  ok(!/bb-activity-media/.test(noImgHtml), "activity without image has no media frame");
  ok(!/bb-image-fallback/.test(noImgHtml), "activity without image has no placeholder/fallback box");
  ok(!/bb-image-fallback/.test(phase1Print.html.match(/data-bb-page="dayDivider"[\s\S]*?<\/article>/)?.[0] || ""), "day divider has no image fallback box");
  ok(/is-image-free/.test(phase1Print.html), "image-free day divider marked intentionally");
  ok(/What We're Doing/.test(phase1Print.html), "What We're Doing present on activity pages");
  ok(/How To Do It/.test(phase1Print.html), "How To Do It present on activity pages");
  ok(/What They're Learning/.test(phase1Print.html), "What They're Learning present on activity pages");
  ok(/bb-activity-steps/.test(phase1Print.html), "How To Do It renders as numbered steps when multi-line");
  ok(!/Teacher Questions|Support &amp; Adaptation|Challenge \/ Extension|Safety Note|Cleanup|Introduction/.test(phase1Print.html), "Teaching Kit detail fields omitted from customer print");
  ok(!/GIANT MATERIALS LIST|weeklyMaterials|Preparation checklist|packing list|assembly|shopping list|laminat/i.test(phase1Print.html), "materials/prep/shopping/assembly never leak into customer print");
  ok(JSON.stringify(phase1Lesson) === phase1Before, "Phase 1 print path does not mutate source lesson");

  // Print CSS keeps absolute footers (Chromium does not support CSS running())
  const printCss = fs.readFileSync(path.join(ROOT, "styles/binder-builder.css"), "utf8");
  ok(!/position:\s*running\s*\(/.test(printCss), "print CSS does not use unsupported running() footers");
  ok(/printing-binder-builder[\s\S]*\.bb-page-footer\s*\{\s*position:\s*absolute/.test(printCss), "print footers stay absolutely positioned");
  ok(/is-image-free/.test(printCss), "CSS includes image-free divider polish");
  ok(/bb-activity-steps/.test(printCss), "CSS includes activity step list styles");

  // Empty optional sections omitted
  draft.sections.books = true;
  draft.books = [];
  const noBooksPages = transform.buildPagePlan(transform.buildBinderDocument(draft, preschool));
  ok(!noBooksPages.some((p) => p.type === "books"), "empty optional book section does not render");

  // Duplicate draft
  const copy = model.duplicateDraft(draft);
  ok(copy.id !== draft.id && copy.sourceLessonId === draft.sourceLessonId, "duplicate keeps source lesson");

  // Form stability helper contract: chrome-only should exist on UI module when loaded in browser;
  // here we assert harvest pattern via model normalize idempotence.
  const again = model.normalizeBinderDraft(draft);
  ok(again.id === draft.id && again.title === draft.title, "normalize is stable for typed draft fields");
}

async function apiTests(ownerToken, otherToken, lessons) {
  console.log("\n[api] owner access, drafts, preview, qr");

  const denied = await request("POST", "/api/admin/curriculum/binder-builder", {
    token: otherToken,
    body: { action: "list-lessons" },
  });
  ok(denied.status === 403, "non-owner admin cannot access Binder Builder");

  const noAuth = await request("POST", "/api/admin/curriculum/binder-builder", {
    body: { action: "list-lessons" },
  });
  ok(noAuth.status === 401 || noAuth.status === 403, "unauthorized access protected");

  const list = await request("POST", "/api/admin/curriculum/binder-builder", {
    token: ownerToken,
    body: { action: "list-lessons", q: "Leaf" },
  });
  ok(list.status === 200 && list.json.lessons.length >= 3, "owner can list/search lessons");
  ok(list.json.lessons.every((l) => /Leaf/i.test(l.title)), "lesson search by title works");

  const infant = lessons.find((l) => l.age === "Infant");
  const created = await request("POST", "/api/admin/curriculum/binder-builder", {
    token: ownerToken,
    body: { action: "create-draft", lessonId: infant.id },
  });
  ok(created.status === 200 && created.json.draft.sourceLessonId === infant.id, "create draft from infant lesson");

  const draft = created.json.draft;
  draft.personalization.teacherName = "Ms. Rivera";
  draft.days.monday.activities[0].includedResources = "Color matching cards\nLaminated picture pieces";
  draft.books[0].resourceUrl = "https://example.com/ok-story";
  const saved = await request("POST", "/api/admin/curriculum/binder-builder", {
    token: ownerToken,
    body: { action: "save-draft", draft },
  });
  ok(saved.status === 200 && saved.json.draft.personalization.teacherName === "Ms. Rivera", "save draft works");

  const reopened = await request("POST", "/api/admin/curriculum/binder-builder", {
    token: ownerToken,
    body: { action: "get-draft", draftId: draft.id },
  });
  ok(reopened.status === 200 && reopened.json.draft.personalization.teacherName === "Ms. Rivera", "reopen draft works");

  const lessonBefore = JSON.stringify(reopened.json.lesson.dailyPlans);
  draft.days.monday.activities[0].howToDoItOverride = "Short binder directions only.";
  const preview = await request("POST", "/api/admin/curriculum/binder-builder", {
    token: ownerToken,
    body: { action: "preview", draft },
  });
  ok(preview.status === 200, "preview succeeds");
  ok(/Short binder directions only/.test(preview.json.html), "preview shows binder override");
  ok(!/GIANT MATERIALS LIST/i.test(preview.json.html), "preview omits materials list");
  ok(preview.json.readiness, "readiness included with preview");
  ok(preview.json.pages[0].type === "cover", "preview page order starts with cover");

  const lessonAfter = await request("POST", "/api/admin/curriculum/binder-builder", {
    token: ownerToken,
    body: { action: "get-lesson", lessonId: infant.id },
  });
  ok(JSON.stringify(lessonAfter.json.lesson.dailyPlans) === lessonBefore, "binder overrides do not mutate source lesson");

  const goodQr = await request("POST", "/api/admin/curriculum/binder-builder", {
    token: ownerToken,
    body: { action: "qr-svg", url: "https://example.com/ok" },
  });
  ok(goodQr.status === 200 && goodQr.json.svg.includes("<svg"), "QR svg for valid URL");

  const badQr = await request("POST", "/api/admin/curriculum/binder-builder", {
    token: ownerToken,
    body: { action: "qr-svg", url: "notaurl" },
  });
  ok(badQr.status === 400, "QR rejects malformed URL via API");

  // Form stability: simulate chrome-only by ensuring save preserves long typed text through round trip
  draft.welcomeCopy = "Typed welcome that must remain stable through admin sync. " + "x".repeat(40);
  const saved2 = await request("POST", "/api/admin/curriculum/binder-builder", {
    token: ownerToken,
    body: { action: "save-draft", draft },
  });
  ok(saved2.json.draft.welcomeCopy.startsWith("Typed welcome that must remain stable"), "typed binder fields remain stable through save/sync");

  // Explicit blank welcome persists through save/reopen/preview without mutating source
  const lessonBytesBeforeBlank = JSON.stringify(lessonAfter.json.lesson);
  draft.welcomeCopy = "";
  const savedBlank = await request("POST", "/api/admin/curriculum/binder-builder", {
    token: ownerToken,
    body: { action: "save-draft", draft },
  });
  ok(savedBlank.status === 200 && savedBlank.json.draft.welcomeCopy === "", "save keeps explicit blank welcome");
  const reopenBlank = await request("POST", "/api/admin/curriculum/binder-builder", {
    token: ownerToken,
    body: { action: "get-draft", draftId: draft.id },
  });
  ok(reopenBlank.json.draft.welcomeCopy === "", "reopen keeps explicit blank welcome");
  const previewBlank = await request("POST", "/api/admin/curriculum/binder-builder", {
    token: ownerToken,
    body: { action: "preview", draft: reopenBlank.json.draft },
  });
  ok(previewBlank.status === 200, "preview succeeds with blank welcome");
  ok(!/This binder is organized by day/i.test(previewBlank.json.html || ""), "blank welcome preview omits default copy");
  const lessonBytesAfterBlank = await request("POST", "/api/admin/curriculum/binder-builder", {
    token: ownerToken,
    body: { action: "get-lesson", lessonId: infant.id },
  });
  ok(JSON.stringify(lessonBytesAfterBlank.json.lesson) === lessonBytesBeforeBlank, "blank welcome leaves source lesson byte-identical");

  // Deliberate restore of default welcome remains available and distinct from blank
  draft.welcomeCopy = model.DEFAULT_WELCOME_COPY;
  const restoredWelcome = await request("POST", "/api/admin/curriculum/binder-builder", {
    token: ownerToken,
    body: { action: "save-draft", draft },
  });
  ok(restoredWelcome.json.draft.welcomeCopy === model.DEFAULT_WELCOME_COPY, "deliberate DEFAULT_WELCOME_COPY restore works");

  const dup = await request("POST", "/api/admin/curriculum/binder-builder", {
    token: ownerToken,
    body: { action: "duplicate-draft", draftId: draft.id },
  });
  ok(dup.status === 200 && dup.json.draft.id !== draft.id, "duplicate draft works");
}

async function asyncQrTest() {
  console.log("\n[qr] async svg generation");
  const svg = await qr.renderQrSvg("https://example.com/print-safe");
  ok(svg.includes("<svg"), "renderQrSvg returns svg");
  ok(svg.length > 200, "QR svg has enough detail for print");
}

async function main() {
  console.log("Binder Builder tests");
  unitTests();
  await asyncQrTest();

  const lessons = [
    sampleLesson("Infant", { title: "Infant Leaf Explorers", coverImageUrl: "" }),
    sampleLesson("Toddler", { title: "Toddler Leaf Explorers" }),
    sampleLesson("Preschool", { title: "Preschool Leaf Explorers" }),
  ];
  writeSeedStore(lessons);
  const child = await startServer();
  try {
    await waitForHealth();
    const ownerToken = await login(OWNER.email);
    const otherToken = await login(OTHER.email);
    ok(Boolean(ownerToken), "owner admin can authenticate");
    await apiTests(ownerToken, otherToken, lessons);

    // Public site content still loads
    const site = await request("GET", "/api/site-content");
    ok(site.status === 200, "public site-content still works");

    console.log(`\nAll Binder Builder checks passed (${passed}).`);
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("\nBinder Builder tests failed:", error);
  process.exit(1);
});
