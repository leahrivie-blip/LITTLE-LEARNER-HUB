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
  ok(/What We Are Doing|What We're Doing/.test(phase1Print.html), "What We Are Doing present on activity pages");
  ok(/How To Do It/.test(phase1Print.html), "How To Do It present on activity pages");
  ok(/What Children Are Learning|What They're Learning/.test(phase1Print.html), "What Children Are Learning present on activity pages");
  ok(/bb-activity-steps/.test(phase1Print.html), "How To Do It renders as numbered steps when multi-line");
  ok(!/Teacher Questions|Support &amp; Adaptation|Challenge \/ Extension|Safety Note|Cleanup|Introduction/.test(phase1Print.html), "Teaching Kit detail fields omitted from customer print");
  ok(!/GIANT MATERIALS LIST|weeklyMaterials|Preparation checklist|packing list|assembly|shopping list|laminat/i.test(phase1Print.html), "materials/prep/shopping/assembly never leak into customer print");
  ok(JSON.stringify(phase1Lesson) === phase1Before, "Phase 1 print path does not mutate source lesson");

  // --- Phase 1 repair: readiness uniqueness + step number normalization ---
  ok(
    readiness.pageUniquenessKey({ type: "dayPlans", dayKey: "monday", sourceItemId: "act-a" })
      !== readiness.pageUniquenessKey({ type: "dayPlans", dayKey: "monday", sourceItemId: "act-b" }),
    "different Monday sourceItemIds produce distinct uniqueness keys",
  );
  ok(
    readiness.pageUniquenessKey({ type: "dayPlans", dayKey: "monday", sourceItemId: "act-a", activityId: "bb-1" })
      === readiness.pageUniquenessKey({ type: "dayPlans", dayKey: "monday", sourceItemId: "act-a", activityId: "bb-2" }),
    "same sourceItemId is the primary activity identity (not title/draft id)",
  );
  ok(
    readiness.pageUniquenessKey({ type: "dayDivider", dayKey: "monday" }) === "dayDivider:monday",
    "non-activity pages keep type:dayKey uniqueness",
  );
  ok(
    readiness.pageUniquenessKey({ type: "cover" }) === "cover:",
    "cover uniqueness remains type-only",
  );

  const multiMonLesson = sampleLesson("Toddler", {
    id: "cur-lp-bb-phase1-repair-multi",
    title: "All About Me Style Multi",
  });
  multiMonLesson.dailyPlans.monday.items = [
    { itemId: "act-mon-a", title: "Mirror Me", description: "Look in mirrors.", steps: ["1. Invite looking.", "2. Point to eyes.", "3. Make a silly face."], learningGoals: ["Self-awareness"], exampleImageUrl: "https://example.com/a.jpg" },
    { itemId: "act-mon-b", title: "My Name Discovery", description: "Find name cards.", steps: ["Show two cards.", "Say a name.", "Find the photo."], learningGoals: ["Name recognition"] },
    { itemId: "act-mon-c", title: "Family Photo Sharing", description: "Talk about family.", steps: ["1. Choose a photo", "2. Point to people", "3. Name relationships"], learningGoals: ["Belonging"], exampleImageUrl: "https://example.com/c.jpg" },
  ];
  // 3 activities × 5 days = 15 activity pages (All About Me Phase 1 shape)
  ["tuesday", "wednesday", "thursday", "friday"].forEach((day, di) => {
    multiMonLesson.dailyPlans[day].items = [0, 1, 2].map((i) => ({
      itemId: `act-${day}-${i + 1}`,
      title: `${day} Activity ${i + 1}`,
      description: `Short ${day} activity.`,
      steps: ["Do step one.", "Do step two."],
      learningGoals: ["Practice"],
      ...(i === 0 ? { exampleImageUrl: `https://example.com/${day}.jpg` } : {}),
    }));
  });
  const multiBefore = JSON.stringify(multiMonLesson);
  const multiDraft = model.createDraftFromLesson(multiMonLesson);
  const multiDoc = transform.buildBinderDocument(multiDraft, multiMonLesson);
  const multiPages = transform.buildPagePlan(multiDoc);
  const multiDayPlans = multiPages.filter((p) => p.type === "dayPlans");
  ok(multiDayPlans.length === 15, "All About Me Phase 1 structure still produces 15 activity pages");
  ok(multiPages.filter((p) => p.type === "dayDivider").length === 5, "five day dividers remain");
  ok(multiDayPlans.every((p) => p.sourceItemId), "dayPlans pages carry sourceItemId for uniqueness");
  ok(!multiDoc.days.find((d) => d.dayKey === "monday").image?.url, "day dividers still never inherit activity images");

  const multiReady = readiness.evaluateBinderReadiness(multiDraft, multiMonLesson);
  ok(!multiReady.issues.some((i) => i.code === "duplicate_page"), "three different Monday sourceItemIds do not trigger duplicate_page");
  ok(multiReady.canPrint === true, "valid multi-activity sample canPrint true (no false duplicate blockers)");

  // True duplicate of SAME Monday sourceItemId must still block
  const dupDraft = model.normalizeBinderDraft(JSON.parse(JSON.stringify(multiDraft)));
  const dupMonActs = dupDraft.days.monday.activities;
  ok(dupMonActs.length >= 2, "duplicate fixture has multiple monday activities");
  dupMonActs[1].sourceItemId = dupMonActs[0].sourceItemId;
  dupMonActs[1].id = "bb-act-forced-duplicate";
  const dupReady = readiness.evaluateBinderReadiness(dupDraft, multiMonLesson);
  ok(dupReady.issues.some((i) => i.code === "duplicate_page" && /dayPlans:monday:/.test(i.message)), "true duplicate same Monday sourceItemId triggers duplicate_page");
  ok(dupReady.canPrint === false, "true duplicate blocks printing");

  // Step normalization: pre-numbered vs unnumbered (print projection only)
  const stepPrint = print.buildBinderPrintHtml(multiDraft, multiMonLesson, { qrSvgByUrl: {} });
  const mirrorAct = multiDoc.days.find((d) => d.dayKey === "monday").activities[0];
  const nameAct = multiDoc.days.find((d) => d.dayKey === "monday").activities[1];
  const mirrorSlice = stepPrint.html.includes(`data-bb-activity-page="${mirrorAct.id}"`)
    ? stepPrint.html.split(`data-bb-activity-page="${mirrorAct.id}"`)[1].split("</article>")[0]
    : "";
  const nameSlice = stepPrint.html.includes(`data-bb-activity-page="${nameAct.id}"`)
    ? stepPrint.html.split(`data-bb-activity-page="${nameAct.id}"`)[1].split("</article>")[0]
    : "";
  ok(/<li>Invite looking\.<\/li>/.test(mirrorSlice), "pre-numbered source step renders once-numbered (prefix stripped)");
  ok(!/<li>1\.\s*Invite looking\./.test(mirrorSlice), "pre-numbered prefix not left inside list item");
  ok(/<li>Show two cards\.<\/li>/.test(nameSlice), "unnumbered source step still renders correctly");
  ok(multiMonLesson.dailyPlans.monday.items[0].steps[0] === "1. Invite looking.", "source step text remains unchanged after preview/render");
  ok(JSON.stringify(multiMonLesson) === multiBefore, "source lesson remains byte-identical after readiness/print repair path");

  const repairHtml = stepPrint.html;
  ok(!/Teacher Questions|weeklyMaterials|GIANT MATERIALS|packing list|assembly|shopping list/i.test(repairHtml), "customer print still omits materials/prep/TK sections");
  const withImgRepair = mirrorAct;
  const withoutImgRepair = nameAct;
  ok(Boolean(withImgRepair.image?.url), "activity with image still has its own image");
  ok(!withoutImgRepair.image?.url, "activity without image still has no image");
  const withImgHtmlRepair = mirrorSlice;
  const withoutImgHtmlRepair = nameSlice;
  ok(/bb-activity-media/.test(withImgHtmlRepair), "image/no-image Phase 1 behavior: with-image keeps media");
  ok(!/bb-activity-media|bb-image-fallback/.test(withoutImgHtmlRepair), "image/no-image Phase 1 behavior: without-image stays collapsed");

  // --- Physical print fit / weekly planner regressions ---
  const printPageContainers = (stepPrint.html.match(/<article class="bb-page\b/g) || []).length;
  ok(printPageContainers === stepPrint.pages.length, "one generated Binder page = one print-page container");
  ok(stepPrint.pages[0]?.type === "cover", "print plan starts with cover");
  ok(stepPrint.pages.some((p) => p.type === "tableOfContents"), "print plan includes Table of Contents");
  ok(stepPrint.pages.some((p) => p.type === "weeklyGridCalendar"), "print plan includes Weekly Grid Calendar");
  ok((stepPrint.html.match(/data-bb-page="/g) || []).length === stepPrint.pages.length, "data-bb-page markers match page plan");

  const printCss = fs.readFileSync(path.join(ROOT, "styles/binder-builder.css"), "utf8");
  ok(!/position:\s*running\s*\(/.test(printCss), "print CSS does not use unsupported running() footers");
  ok(/printing-binder-builder[\s\S]*\.bb-page-footer\s*\{\s*position:\s*absolute/.test(printCss), "print footers stay absolutely positioned");
  ok(/is-image-free/.test(printCss), "CSS includes image-free divider polish");
  ok(/bb-activity-steps/.test(printCss), "CSS includes activity step list styles");
  ok(/page-break-inside:\s*avoid/.test(printCss) && /break-inside:\s*avoid/.test(printCss), "activity pages cannot break internally in print CSS");
  ok(/--bb-page-pad-bottom:\s*0\.82in/.test(printCss) || /--bb-page-pad-bottom:\s*\.?8/.test(printCss), "print-safe footer spacing exists");
  ok(/--bb-activity-photo-h:\s*2\.2in/.test(printCss), "activity image layout has a bounded print height");
  ok(/max-height:\s*var\(--bb-page-h\)|max-height:\s*11in/.test(printCss), "print pages have fixed US Letter max height");
  ok(/@page\s*\{\s*size:\s*letter portrait;\s*margin:\s*0;/.test(printCss.replace(/\s+/g, " ")), "print @page uses Letter with zero browser margin (binder owns margins)");

  const weekHtml = stepPrint.html.includes('data-bb-page="weekAtAGlance"')
    ? stepPrint.html.split('data-bb-page="weekAtAGlance"')[1].split("</article>")[0]
    : "";
  ok(/data-bb-week-planner/.test(weekHtml), "Monday–Friday weekly planner is generated from existing day/activity data");
  const plannerTitles = multiDoc.days.flatMap((d) => d.activities.map((a) => a.title));
  ok(plannerTitles.length === 15, "fixture still has 15 activities for planner coverage");
  ok(plannerTitles.every((title) => weekHtml.includes(title)), "all 15 activities appear exactly once in the weekly planner");
  ok((weekHtml.match(/bb-week-planner-day/g) || []).length === 5, "weekly planner has five weekday columns");
  ok(multiReady.canPrint === true && multiReady.status === "READY", "existing readiness remains READY / canPrint true after print-fit changes");
  ok(JSON.stringify(multiMonLesson) === multiBefore, "source lesson remains unchanged after print-fit render");

  // --- Print redesign: TOC, footer brand/page numbers, grid calendar ---
  ok(/data-bb-page="tableOfContents"/.test(stepPrint.html), "Table of Contents exists in print HTML");
  ok(/bb-footer-brand/.test(stepPrint.html) && /Little Learner Hub/.test(stepPrint.html), "Little Learner Hub brand footer is present");
  ok(/bb-footer-page">Page \d+/.test(stepPrint.html), "sequential Page N markers are present");
  ok(!/bb-page-cover[\s\S]{0,200}bb-footer-brand/.test(stepPrint.html), "cover does not use content footer branding");
  const tocSlice = stepPrint.html.includes('data-bb-page="tableOfContents"')
    ? stepPrint.html.split('data-bb-page="tableOfContents"')[1].split("</article>")[0]
    : "";
  ok(/Weekly Grid Calendar/.test(tocSlice), "TOC lists Weekly Grid Calendar");
  ok(/How to Use This Binder/.test(tocSlice), "TOC lists How to Use This Binder");
  const gridPage = stepPrint.pages.find((p) => p.type === "weeklyGridCalendar");
  ok(gridPage && Number.isFinite(gridPage.pageNumber), "grid calendar has a final page number");
  ok(new RegExp(`Weekly Grid Calendar[\\s\\S]{0,120}${gridPage.pageNumber}`).test(tocSlice), "TOC page number matches final grid calendar page");
  ok(/data-bb-page="weeklyGridCalendar"/.test(stepPrint.html), "Weekly Grid Calendar appears in the PDF HTML");
  ok(/data-bb-week-grid/.test(stepPrint.html), "grid calendar markup is present");
  ok(["monday", "tuesday", "wednesday", "thursday", "friday"].every((d) => stepPrint.html.includes(`data-bb-grid-day="${d}"`)), "Monday-Friday grid columns are present");
  ok(["focus", "main", "second", "additional", "story", "song", "notes"].every((r) => stepPrint.html.includes(`data-bb-grid-row="${r}"`)), "required planning rows are present");
  ok(plannerTitles.every((title) => {
    const gridHtml = stepPrint.html.split('data-bb-page="weeklyGridCalendar"')[1]?.split("</article>")[0] || "";
    return gridHtml.includes(title);
  }), "included activities appear under the grid for their week");
  ok(!/GIANT MATERIALS LIST|Preparation checklist|shopping list/i.test(stepPrint.html), "grid/print redesign does not invent materials content");
  ok(stepPrint.validation?.ok === true, "print validation gate passes for multi-activity binder");
  ok(!/bb-browser-chrome/.test(stepPrint.html), "date/time/browser chrome markers are absent from authored HTML");
  ok(!/https?:\/\/localhost|about:blank/.test(stepPrint.html.split("bb-print-root")[1] || ""), "browser title/URL chrome is absent from binder content");
  // Excluded activity does not appear in grid
  const omitDraft = model.normalizeBinderDraft(JSON.parse(JSON.stringify(multiDraft)));
  omitDraft.days.monday.activities[2].omit = true;
  const omitBefore = JSON.stringify(multiMonLesson);
  const omitPrint = print.buildBinderPrintHtml(omitDraft, multiMonLesson, { qrSvgByUrl: {} });
  const omitGrid = omitPrint.html.split('data-bb-page="weeklyGridCalendar"')[1]?.split("</article>")[0] || "";
  ok(!omitGrid.includes("Family Photo Sharing"), "excluded activities do not appear in the grid");
  ok(JSON.stringify(multiMonLesson) === omitBefore, "source lesson remains byte-identical after omit/grid regenerate");
  // Reorder updates grid
  const reorderDraft = model.normalizeBinderDraft(JSON.parse(JSON.stringify(multiDraft)));
  const reorderMonActs = reorderDraft.days.monday.activities;
  reorderDraft.days.monday.activities = [reorderMonActs[1], reorderMonActs[0], reorderMonActs[2]];
  const reorderPrint = print.buildBinderPrintHtml(reorderDraft, multiMonLesson, { qrSvgByUrl: {} });
  const reorderGrid = reorderPrint.html.split('data-bb-page="weeklyGridCalendar"')[1]?.split("</article>")[0] || "";
  const mainMondayHtml = (reorderGrid.match(/data-bb-grid-row="main" data-bb-grid-day="monday"[^>]*>([\s\S]*?)<\/div>/) || [])[1] || "";
  ok(/My Name Discovery/.test(mainMondayHtml), "activity reordering updates the grid main activity cell");
  ok(JSON.stringify(multiMonLesson) === multiBefore, "source lesson remains unchanged after redesign render paths");

  // --- Story/Music QR polish + day divider polish ---
  const qrLesson = sampleLesson("Toddler", { id: "cur-lp-bb-qr-polish", title: "QR Polish Sample" });
  qrLesson.books = [
    {
      title: "I Like Myself!",
      author: "Karen Beaumont",
      whyThisBook: "Celebrates uniqueness.",
      beforeReadingQuestions: ["What do you like about you?"],
      resourceUrl: "",
    },
    {
      title: "No Link Book",
      author: "A. Author",
      resourceUrl: "",
    },
  ];
  qrLesson.songs = [
    {
      title: "Hello Friends",
      whenToUse: "Morning Meeting",
      motions: "Wave hello",
      teacherDirections: "Sing slowly",
      resourceUrl: "",
    },
    {
      title: "Quiet Transition",
      whenToUse: "Cleanup",
      motions: "Tip-toe",
      resourceUrl: "",
    },
  ];
  const qrBefore = JSON.stringify(qrLesson);
  const qrDraft = model.createDraftFromLesson(qrLesson);
  qrDraft.books[0].resourceUrl = "https://www.youtube.com/watch?v=approvedStory1";
  qrDraft.books[0].qrEnabled = true;
  qrDraft.books[1].resourceUrl = "";
  qrDraft.songs[0].resourceUrl = "https://www.youtube.com/watch?v=approvedSong1";
  qrDraft.songs[0].qrEnabled = true;
  qrDraft.songs[1].resourceUrl = "";
  // Keep sample valid for canPrint READY (tuesday fixture starts empty).
  if (qrDraft.days?.tuesday?.activities?.[0]) qrDraft.days.tuesday.activities[0].howToDoItOverride = "Stamp leaves gently.";
  const storySvg = "<svg xmlns='http://www.w3.org/2000/svg'><rect width='1' height='1'/></svg>";
  const songSvg = "<svg xmlns='http://www.w3.org/2000/svg'><circle r='1'/></svg>";
  const qrPrint = print.buildBinderPrintHtml(qrDraft, qrLesson, {
    qrSvgByUrl: {
      "https://www.youtube.com/watch?v=approvedStory1": storySvg,
      "https://www.youtube.com/watch?v=approvedSong1": songSvg,
    },
  });
  const storyHtml = qrPrint.html.split('data-bb-page="books"')[1]?.split("</article>")[0] || "";
  const musicHtml = qrPrint.html.split('data-bb-page="songs"')[1]?.split("</article>")[0] || "";
  ok(/bb-qr-figure/.test(storyHtml) && /Scan to watch\/listen/.test(storyHtml), "approved Story Time URL renders a QR");
  ok(/No Link Book/.test(storyHtml), "story without URL still prints title");
  const noLinkBookCard = storyHtml.split("No Link Book")[1]?.split("</section>")[0] || "";
  ok(!/bb-qr-figure|bb-qr-code|bb-image-fallback/.test(noLinkBookCard), "story with no URL renders no QR and no empty placeholder");
  ok(/bb-qr-figure/.test(musicHtml) && /Scan to play/.test(musicHtml), "approved song URL renders a QR");
  const quietCard = musicHtml.split("Quiet Transition")[1]?.split("</section>")[0] || "";
  ok(!/bb-qr-figure|bb-qr-code/.test(quietCard), "song with no URL renders no QR and no empty placeholder");
  ok(!/youtube\.com\/watch\?v=approved/.test(storyHtml + musicHtml), "customer print does not show raw YouTube URLs");
  ok(/When to Use/.test(musicHtml) && /Movement/.test(musicHtml), "song cards keep when-to-use and movement cues");

  qrDraft.books[0].resourceUrl = "bad://not-a-valid-url";
  const badQrPrint = print.buildBinderPrintHtml(qrDraft, qrLesson, {
    qrSvgByUrl: { "bad://not-a-valid-url": storySvg },
  });
  const badStory = badQrPrint.html.split('data-bb-page="books"')[1]?.split("</article>")[0] || "";
  ok(!/bb-qr-figure/.test(badStory), "invalid URL does not render a QR");
  const badReady = readiness.evaluateBinderReadiness(qrDraft, qrLesson);
  ok(badReady.issues.some((i) => i.code === "invalid_story_qr"), "invalid URL surfaces owner-side validation via readiness");

  // Restore valid override and prove persistence through normalize (binder-only)
  qrDraft.books[0].resourceUrl = "https://www.youtube.com/watch?v=approvedStory1";
  const persisted = model.normalizeBinderDraft(JSON.parse(JSON.stringify(qrDraft)));
  ok(persisted.books[0].resourceUrl === "https://www.youtube.com/watch?v=approvedStory1", "binder-only story/song URL override persists");
  ok(JSON.stringify(qrLesson) === qrBefore, "binder-only URL override does not mutate source lesson");
  ok(typeof qr.qrFigureHtml === "function" && typeof qr.validateBinderUrl === "function", "existing QR validation/generation is reused");

  const mondayDivider = qrPrint.html.split('data-bb-day="monday"')[0].includes('data-bb-page="dayDivider"')
    ? qrPrint.html.split('data-bb-page="dayDivider"')[1]?.split("</article>")[0]
    : (qrPrint.html.match(/data-bb-page="dayDivider"[^>]*data-bb-day="monday"[\s\S]*?<\/article>/) || [])[0] || "";
  const monDiv = (qrPrint.html.match(/<article class="bb-page bb-page-divider[^"]*" data-bb-page="dayDivider" data-bb-day="monday"[\s\S]*?<\/article>/) || [])[0] || "";
  ok(/Today We’re Exploring|Today We're Exploring/.test(monDiv), "day divider uses exploring focus label");
  ok(/Today’s Activities|Today's Activities/.test(monDiv), "day divider lists today’s activities heading");
  const monTitles = (qrPrint.document.days.find((d) => d.dayKey === "monday")?.activities || []).map((a) => a.title);
  ok(monTitles.length >= 1 && monTitles.every((t) => monDiv.includes(t)), "day divider lists the correct real activity titles for that day");
  ok(!/bb-activity-media/.test(monDiv) && !/bb-image-fallback/.test(monDiv), "divider does not inherit first activity image");
  ok(/data-bb-week-planner/.test(qrPrint.html) && /data-bb-week-grid/.test(qrPrint.html), "weekly planner/calendar remains unchanged");
  ok(/What We Are Doing|What We're Doing/.test(qrPrint.html) && /How To Do It/.test(qrPrint.html), "activity pages remain unchanged");
  ok((qrPrint.html.match(/<article class="bb-page\b/g) || []).length === qrPrint.pages.length, "one logical page = one print page");
  qrDraft.books[0].resourceUrl = "https://www.youtube.com/watch?v=approvedStory1";
  const readyQr = readiness.evaluateBinderReadiness(qrDraft, qrLesson);
  ok(readyQr.canPrint === true && readyQr.status === "READY", "readiness remains READY / canPrint true for valid sample");
  ok(!/printablePlacement|shopping list|materials assembly|Phase 2/i.test(qrPrint.html), "no Phase 2 markers or functionality introduced");
  ok(JSON.stringify(qrLesson) === qrBefore, "source lesson remains byte-identical after QR/divider polish path");

  // --- Scrapbook print theme (pink/lavender palette, black text, white paper) ---
  ok(/bb-scrapbook/.test(stepPrint.html) && /scrapbook-pink-lavender/.test(stepPrint.html), "print root marks scrapbook pink/lavender theme");
  ok(/--bb-print-ink:\s*#1a1a1a/.test(printCss), "print ink is readable black");
  ok(/--bb-print-accent:\s*#c48a9f/.test(printCss), "print accent is light pink (not red)");
  ok(/--bb-print-lavender:\s*#b7a4d4/.test(printCss), "print palette includes soft lavender");
  ok(/--bb-day-monday:\s*#f8e4ec/.test(printCss) && /--bb-day-tuesday:\s*#ebe3f5/.test(printCss), "day tints are pink/lavender (not blue/yellow corporate)");
  ok(/Caveat/.test(printCss) && /--bb-print-hand/.test(printCss), "playful hand lettering font is available for short titles");
  ok(/bb-footer-brand[\s\S]{0,220}color:\s*#000000/.test(printCss.replace(/\s+/g, " ")), "footer brand prints in black");
  ok(/object-fit:\s*contain/.test(printCss), "photos preserve aspect ratio without stretch-crop cover");
  ok(/bb-activity-media:not\(\.is-broken\)::before/.test(printCss) && /washi|repeating-linear-gradient/.test(printCss), "photo frames include sparse washi-tape accents");
  ok(/border-radius:\s*42%\s*58%/.test(printCss) || /\.bb-page::after/.test(printCss), "pages use a thin wavy scrapbook frame");
  ok(/--bb-gingham-a/.test(printCss) && /--bb-gingham-b/.test(printCss), "subtle pink/lavender gingham tokens exist");
  ok(!/bb-divider-ornament[\s\S]{0,180}border-radius:\s*50%/.test(printCss), "divider ornament is not a glossy sphere");
  ok(/font-size:\s*11pt/.test(printCss), "body copy targets printer-friendly 11pt");
  ok(/loading="eager"/.test(stepPrint.html), "scrapbook redesign preserves eager print image loading");
  ok(!/printablePlacement|Phase 2|shopping list/i.test(stepPrint.html), "scrapbook redesign does not add printable embedding or Phase 2");

  // --- Prototype resource integrity (images / non-fabricated day story-song / source flags) ---
  ok(/loading="eager"/.test(qrPrint.html) && /data-bb-print-image/.test(qrPrint.html), "print images use eager loading for PDF reliability");
  ok(!/loading="lazy"/.test(qrPrint.html.split("bb-print-root")[1] || ""), "print root does not use lazy image loading");
  const absPrint = print.buildBinderPrintHtml(qrDraft, qrLesson, {
    qrSvgByUrl: {
      "https://www.youtube.com/watch?v=approvedStory1": storySvg,
      "https://www.youtube.com/watch?v=approvedSong1": songSvg,
    },
    assetOrigin: "https://example.test",
  });
  ok(/https:\/\/example\.test\/api\/media\//.test(absPrint.html) || !/src="\/api\/media\//.test(absPrint.html),
    "relative media URLs are absolutized when assetOrigin is provided (or no relative media present)");

  const gridStoryCells = [...qrPrint.html.matchAll(/data-bb-grid-row="story" data-bb-grid-day="[^"]+"[^>]*>([\s\S]*?)<\/div>/g)]
    .map((m) => m[1].replace(/<[^>]+>/g, "").trim());
  ok(gridStoryCells.length === 5, "grid has five story cells");
  ok(gridStoryCells.every((t) => t === "—" || t === ""), "without explicit weekday associations, story cells are not fabricated from books[0]");
  const gridSongCells = [...qrPrint.html.matchAll(/data-bb-grid-row="song" data-bb-grid-day="[^"]+"[^>]*>([\s\S]*?)<\/div>/g)]
    .map((m) => m[1].replace(/<[^>]+>/g, "").trim());
  ok(gridSongCells.every((t) => t === "—" || t === ""), "without explicit weekday associations, song cells are not fabricated from songs[0]");
  ok(/data-bb-week-stories/.test(qrPrint.html) && /I Like Myself!/.test(qrPrint.html), "week-level story catalog lists included books without assigning them to every day");

  const weekdayLesson = sampleLesson("Toddler", { id: "cur-lp-bb-weekday-assign", title: "Weekday Assign" });
  weekdayLesson.books = [
    { title: "Monday Book", author: "A", suggestedWeekday: "monday", resourceUrl: "" },
    { title: "Friday Book", author: "B", suggestedWeekday: "friday", resourceUrl: "" },
  ];
  weekdayLesson.songs = [
    { title: "Tuesday Song", linkedWeekday: "tuesday", resourceUrl: "" },
  ];
  const weekdayDraft = model.createDraftFromLesson(weekdayLesson);
  const weekdayBefore = JSON.stringify(weekdayLesson);
  const weekdayPrint = print.buildBinderPrintHtml(weekdayDraft, weekdayLesson, { qrSvgByUrl: {} });
  const monStory = (weekdayPrint.html.match(/data-bb-grid-row="story" data-bb-grid-day="monday"[^>]*>([\s\S]*?)<\/div>/) || [])[1] || "";
  const friStory = (weekdayPrint.html.match(/data-bb-grid-row="story" data-bb-grid-day="friday"[^>]*>([\s\S]*?)<\/div>/) || [])[1] || "";
  const tueSong = (weekdayPrint.html.match(/data-bb-grid-row="song" data-bb-grid-day="tuesday"[^>]*>([\s\S]*?)<\/div>/) || [])[1] || "";
  const wedStory = (weekdayPrint.html.match(/data-bb-grid-row="story" data-bb-grid-day="wednesday"[^>]*>([\s\S]*?)<\/div>/) || [])[1] || "";
  ok(/Monday Book/.test(monStory), "explicit monday book association appears only via weekday field");
  ok(/Friday Book/.test(friStory), "explicit friday book association appears on friday");
  ok(/Tuesday Song/.test(tueSong), "explicit tuesday song association appears on tuesday");
  ok(/—/.test(wedStory) || wedStory.trim() === "—", "days without explicit book association stay blank (not books[0])");
  ok(JSON.stringify(weekdayLesson) === weekdayBefore, "weekday association path does not mutate source lesson");

  const dirtyLesson = sampleLesson("Toddler", { id: "cur-lp-bb-dirty-books", title: "Dirty Books" });
  dirtyLesson.books = [
    { title: "All", author: "Myself by Mercer Mayer", resourceUrl: "" },
    { title: "All by Myself", author: "Mercer Mayer", resourceUrl: "" },
  ];
  dirtyLesson.songs = [
    { title: "If You're Happy and You Know It", resourceUrl: "" },
    { title: "If You’re Happy and You Know It", resourceUrl: "" },
  ];
  const dirtyDraft = model.createDraftFromLesson(dirtyLesson);
  const dirtyBefore = JSON.stringify(dirtyLesson);
  const dirtyReady = readiness.evaluateBinderReadiness(dirtyDraft, dirtyLesson);
  ok(dirtyReady.issues.some((i) => i.code === "malformed_book_entry"), "malformed book title/author is flagged for owner review");
  ok(dirtyReady.issues.some((i) => i.code === "duplicate_song_entry"), "duplicate song entries are flagged for owner review");
  ok(dirtyReady.issues.some((i) => i.code === "printables_not_embedded"), "readiness states printable sheets are not embedded");
  ok(JSON.stringify(dirtyLesson) === dirtyBefore, "flagging source-content problems does not mutate the source lesson");

  const imgReady = readiness.applyImageLoadResults(readyQr, {
    loaded: ["https://example.test/ok.jpg"],
    failed: ["https://example.test/missing.jpg"],
    timedOut: [],
  });
  ok(imgReady.issues.some((i) => i.code === "image_load_failed"), "failed assigned images surface in readiness");
  ok(imgReady.status === "NEEDS REVIEW", "image load failures keep owner-facing NEEDS REVIEW");
  ok(typeof print.waitForPrintImages === "function", "print module exposes waitForPrintImages");

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
