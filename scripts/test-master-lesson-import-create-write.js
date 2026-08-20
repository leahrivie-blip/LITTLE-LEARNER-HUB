#!/usr/bin/env node
/**
 * Create Draft Lesson write/mapping: parse → canonical plan → POST → persisted
 * curriculum.activities (the Admin activity-editor source), not preview-only.
 * Disposable local store only. Does not publish or create printables.
 * Run: npm run test:master-lesson-import-create-write
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const {
  parseFullLessonStructurePaste,
  buildStructurePreview,
  buildCanonicalLessonPlan,
} = require("./curriculum-lesson-structure-paste.js");
const {
  formatActivityPreview,
  fifteenActivityFixture,
  rainbowCoffeeFilterArtFixture,
  weatherWatchersTwentyActivityFixture,
  runStructuredActivityParserRegressionTests,
  colorsAllAroundUsMasterPaste,
  COLORS_ALL_AROUND_US_FIXTURE,
} = require("./test-master-lesson-activity-import-parser.js");
const weekKit = require("./curriculum-week-kit-paste.js");
const enrich = require("./teaching-kit-enrichment.js");

const ROOT = path.join(__dirname, "..");
const PORT = 20680 + Math.floor(Math.random() * 80);
const BASE = `http://127.0.0.1:${PORT}`;
const STORE_PATH = path.join(os.tmpdir(), `llh-master-write-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "leahivie@icloud.com",
  password: "master-write-pass",
  code: "master-write-code",
};

const ONE_ACTIVITY_TITLE = "LLH QA Master Import Write One — DO NOT PUBLISH";
const FIFTEEN_TITLE = "LLH QA Master Import Write 15 — DO NOT PUBLISH";

const DOT_MARKER_PASTE = `Lesson title
${ONE_ACTIVITY_TITLE}

Age band
Toddler 12–24 Months

Weekly overview
A short test lesson for checking the master importer write path.

Learning objectives
Explore art materials through simple toddler-safe creative play.
Practice pressing, scribbling, rolling, and making choices.

Materials list
Large paper
Washable dot markers
Smocks

Teacher preparation/Toolkit
Prepare materials before inviting children to the activity area.

Prep checklist
Set out only the materials needed.
Check marker caps.

Observation focus
Notice how children grasp, press, and make simple choices.

Family connection
Share one simple piece of process art.

Books
Mix It Up by Herve Tullet

Songs
The Color Song

Printable ideas
Dot marker choice cards

Activity name
Dot Marker Color Pops
Activity weekday
Monday
Category/domain
Creative Arts
Age
Toddler 12–24 Months
Duration
8–10 minutes
Objective
Practice pressing, releasing, color exploration, and early cause-and-effect learning.
What children will do
Children press large washable dot markers onto paper and watch colorful dots appear.
Materials
Large white paper
Washable dot markers
Smocks
Teacher prep
Check that all dot markers are intact and working before the activity.
Setup
Place one large sheet of paper on the table or use one shared sheet.
Steps
Offer one dot marker.
Model pressing it straight down onto the paper.
Allow children to repeat the pressing action.
Introduce another color if interest continues.
Point out overlapping colors and marks.
Questions
Can you press
What happened
Which color do you want
Can you make another dot
Observation focus
Notice pressure control, repetition, grasp, and simple color choices.
Safety
Use only large washable non-toxic dot markers appropriate for supervised toddler use.
Cleanup
Replace marker caps immediately and wipe hands and surfaces.
Indoor option
Use at a protected art table.
Outdoor option
Tape paper to an outdoor washable table.
Tips
Limiting the number of colors helps toddlers focus on the pressing action.
Substitutions
Use large sponge dabbers with washable paint.
Support adaptations
Stabilize the paper or marker while the child presses.
Added challenge
Invite older toddlers to place dots around a large teacher-drawn shape.
Mixed-age adaptations
Older children can name colors or create simple groups of dots.
Observation prompts
Does the child understand that pressing creates a mark
Does the child repeat the action
Does the child choose another color
Vocabulary
Dot
Press
Color
Again
More
Image requirement
Finished example only
Example images
Close-up of a toddler hand pressing a large dot marker onto white paper with colorful dots.
`;

function listLines(body) {
  return String(body || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
}

function requestJson(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = payload
      ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
      : {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const req = http.request(
      { hostname: "127.0.0.1", port: PORT, path: urlPath, method, headers, timeout: 45000 },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { json = null; }
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function startServer() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: BASE,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error("Server did not boot");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 3000);
    child.on("exit", () => { clearTimeout(timer); resolve(); });
  });
}

function assertPreviewUnchanged(parsed, expectedCounts) {
  const preview = formatActivityPreview(parsed);
  ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].forEach((label) => {
    assert.match(preview, new RegExp(`${label} — ${expectedCounts[label]}`));
  });
  const total = Object.values(expectedCounts).reduce((sum, n) => sum + n, 0);
  assert.match(preview, new RegExp(`TOTAL ACTIVITIES: ${total}`));
  return preview;
}

function persistedActivities(payload, lessonId) {
  return (payload.activities || payload.curriculum?.activities || [])
    .filter((item) => item && item.lessonPlanId === lessonId && item.status !== "archived");
}

function findActivity(activities, title) {
  return activities.find((item) => String(item.title || "") === title) || null;
}

function assertSupportedFieldsPresent(act, label) {
  const required = {
    title: act.title,
    dayOfWeek: act.dayOfWeek,
    activityCategory: act.activityCategory,
    ageModifications: act.ageModifications,
    durationMinutes: act.durationMinutes,
    objective: act.objective,
    description: act.description,
    materials: act.materials,
    preparation: act.preparation,
    setup: act.setup,
    steps: act.steps,
    teacherLanguage: act.teacherLanguage,
    observationOpportunities: act.observationOpportunities,
    safetyNotes: act.safetyNotes,
    cleanupTips: act.cleanupTips,
    teacherTips: act.teacherTips,
    adaptations: act.adaptations,
    extensions: act.extensions,
    mixedAgeAdaptations: act.mixedAgeAdaptations,
    observationPrompts: act.observationPrompts,
    vocabulary: act.vocabulary,
    imageRequirement: act.imageRequirement,
  };
  Object.entries(required).forEach(([key, value]) => {
    const empty = value == null
      || value === ""
      || (Array.isArray(value) && value.length === 0);
    assert.equal(empty, false, `${label}: ${key} silently dropped`);
  });
}

async function createDraftFromPaste(token, stamp, pasteText, extra = {}) {
  const parsed = parseFullLessonStructurePaste(pasteText);
  assert.equal(parsed.ok, true, parsed.errors.join("; "));
  const plan = buildCanonicalLessonPlan(parsed, { id: extra.id, lastEditedBy: ADMIN.email });
  assert.equal(plan.status, "draft");
  assert.deepEqual(plan.resourceIds, []);
  const saved = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    expectedUpdatedAt: stamp,
    lessonPlan: {
      ...plan,
      status: "draft",
      resourceIds: [],
      disposableQaFixture: true,
    },
  }, token);
  assert.equal(saved.status, 200, saved.text);
  assert.ok(saved.json?.lessonPlan?.id);
  assert.equal(saved.json.lessonPlan.status, "draft");
  return { parsed, plan, saved: saved.json };
}

function runParserAndPreviewGuards() {
  runStructuredActivityParserRegressionTests();
  const parsed = parseFullLessonStructurePaste(DOT_MARKER_PASTE);
  assert.equal(parsed.ok, true, parsed.errors.join("; "));
  assert.equal(parsed.activityCount, 1);
  assertPreviewUnchanged(parsed, {
    Monday: 1, Tuesday: 0, Wednesday: 0, Thursday: 0, Friday: 0,
  });
  const structure = buildStructurePreview(parsed);
  assert.equal(structure.activityCount, 1);
  assert.equal(structure.recognized.weeklyOverview, true);
  console.log("PASS  14  existing preview parser still groups activities (Dot Marker Monday 1)");
}

async function runWriteTests() {
  const child = startServer();
  try {
    await waitForBoot(child);
    const login = await requestJson("POST", "/api/admin/login", {
      email: ADMIN.email,
      password: ADMIN.password,
      code: ADMIN.code,
    });
    assert.equal(login.status, 200, login.text);
    const token = login.json.token;
    const stampRes = await requestJson("GET", "/api/admin/site-content", null, token);
    let stamp = stampRes.json.siteContent?.updatedAt || "";
    const resourcesBefore = (stampRes.json.siteContent?.curriculum?.resources || []).length;

    const one = await createDraftFromPaste(token, stamp, DOT_MARKER_PASTE);
    stamp = one.saved.siteContentUpdatedAt;
    const lessonId = one.saved.lessonPlan.id;
    const postActs = persistedActivities(one.saved, lessonId);
    assert.equal(postActs.length, 1);
    const dot = findActivity(postActs, "Dot Marker Color Pops");
    assert.ok(dot, "POST curriculum.activities must include Dot Marker Color Pops");

    // 1. full one-activity write mapping from Admin activity records
    assert.equal(dot.title, "Dot Marker Color Pops");
    assert.equal(dot.dayOfWeek, "monday");
    assert.equal(dot.activityCategory, "Art");
    assert.match(dot.ageModifications, /Toddler 12–24 Months/);
    assert.equal(dot.durationMinutes, 8);
    assert.match(dot.objective, /cause-and-effect/);
    assert.match(dot.description, /press large washable dot markers/);
    console.log("PASS  1   one-activity write mapping (title/weekday/category/age/duration/objective/description)");

    // 2–4 multiline / questions
    assert.deepEqual(listLines(dot.materials), [
      "Large white paper",
      "Washable dot markers",
      "Smocks",
    ]);
    assert.deepEqual(listLines(dot.steps), [
      "Offer one dot marker.",
      "Model pressing it straight down onto the paper.",
      "Allow children to repeat the pressing action.",
      "Introduce another color if interest continues.",
      "Point out overlapping colors and marks.",
    ]);
    assert.deepEqual(listLines(dot.teacherLanguage), [
      "Can you press",
      "What happened",
      "Which color do you want",
      "Can you make another dot",
    ]);
    console.log("PASS  2-4 multiline materials, steps, questions persisted");

    // 5–7 observation focus, safety+cleanup, indoor/outdoor
    assert.match(dot.observationOpportunities, /pressure control/);
    assert.match(dot.safetyNotes, /non-toxic/);
    assert.match(dot.cleanupTips, /Replace marker caps/);
    assert.match(dot.indoorAlternatives, /protected art table/);
    assert.match(dot.outdoorAlternatives, /outdoor washable table/);
    console.log("PASS  5-7 observation focus, safety+cleanup, indoor/outdoor persisted");

    // 8 tips / substitutions / adaptations
    assert.ok(Array.isArray(dot.teacherTips) && dot.teacherTips.some((tip) => /Limiting the number of colors/.test(tip)));
    assert.ok(Array.isArray(dot.substitutions) && dot.substitutions.length >= 1);
    assert.match(dot.substitutions[0].use || "", /sponge dabbers/);
    assert.match(dot.adaptations, /Stabilize the paper/);
    assert.match(dot.extensions, /teacher-drawn shape/);
    assert.match(dot.mixedAgeAdaptations, /Older children can name colors/);
    assert.match(dot.preparation, /dot markers are intact/);
    console.log("PASS  8   tips/substitutions/adaptations/prep/mixed-age persisted");

    // 9–11 prompts, vocabulary, image requirement + example brief
    assert.deepEqual(dot.observationPrompts, [
      "Does the child understand that pressing creates a mark",
      "Does the child repeat the action",
      "Does the child choose another color",
    ]);
    assert.deepEqual(listLines(dot.vocabulary), ["Dot", "Press", "Color", "Again", "More"]);
    assert.equal(dot.imageRequirement, "example_only");
    assert.match(dot.imageBriefExample, /toddler hand pressing a large dot marker/);
    assert.ok(!dot.exampleImageUrl, "example image text must not become an uploaded image URL");
    assert.ok(!dot.exampleImageUpload, "upload-ref objects must not persist");
    console.log("PASS  9-11 observation prompts, vocabulary, image requirement/brief persisted");

    const view = enrich.activityEnrichmentView(dot, {});
    const model = enrich.mapActivityToOwnerEditorModel(dot, {}, one.saved.lessonPlan);
    assert.match(model.preparation, /dot markers are intact/);
    assert.deepEqual(view.observationPrompts, dot.observationPrompts);
    assert.match(view.imageBriefExample, /toddler hand pressing a large dot marker/);
    assert.equal(view.imageRequirement, "example_only");

    const reload = await requestJson("GET", "/api/admin/site-content", null, token);
    assert.equal(reload.status, 200, reload.text);
    const reloadedPlan = (reload.json.siteContent?.curriculum?.lessonPlans || [])
      .find((item) => item.id === lessonId);
    const reloadedActs = (reload.json.siteContent?.curriculum?.activities || [])
      .filter((item) => item.lessonPlanId === lessonId && item.status !== "archived");
    assert.ok(reloadedPlan, "draft reloads from admin site-content");
    assert.equal(reloadedPlan.status, "draft");
    const reloadedDot = findActivity(reloadedActs, "Dot Marker Color Pops");
    assert.ok(reloadedDot);
    assert.match(reloadedDot.preparation, /dot markers are intact/);
    assert.deepEqual(reloadedDot.observationPrompts, dot.observationPrompts);
    assert.match(reloadedDot.imageBriefExample, /toddler hand pressing a large dot marker/);
    console.log("PASS  1b  one-activity persisted result reloads from Admin GET");

    // 13 top-level week fields
    assert.match(reloadedPlan.weeklyOverview, /master importer write path/);
    assert.match(reloadedPlan.objectives, /Explore art materials/);
    assert.match(reloadedPlan.weeklyMaterials, /Washable dot markers/);
    assert.match(reloadedPlan.familyConnection, /process art/);
    const week = reloadedPlan.enrichmentDraft?.week || {};
    assert.match(week.teacherPreparation || "", /Prepare materials/);
    assert.ok((week.teacherToolkit?.prepChecklist || []).some((row) => /marker caps/.test(row)));
    assert.ok((week.teacherToolkit?.observationFocus || []).some((row) => /grasp, press/.test(row)));
    assert.equal((week.books || []).length, 1);
    assert.match(week.books[0].title, /Mix It Up/);
    assert.equal((week.songs || []).length, 1);
    assert.match(week.songs[0].title, /Color Song/);
    assert.equal((week.printableIdeas || []).length, 1);
    assert.match(week.printableIdeas[0].title, /Dot marker choice cards/);
    assert.deepEqual(reloadedPlan.resourceIds || [], []);
    const resourcesAfterOne = (reload.json.siteContent?.curriculum?.resources || []).length;
    assert.equal(resourcesAfterOne, resourcesBefore, "printable/resource records must not be created");
    console.log("PASS  13  top-level week fields persisted; printable ideas remain text-only");

    const fixture = fifteenActivityFixture();
    const fifteenPaste = fixture.paste.replace("Structured Activity Parser 15", FIFTEEN_TITLE);
    const parsed15 = parseFullLessonStructurePaste(fifteenPaste);
    assertPreviewUnchanged(parsed15, {
      Monday: 3, Tuesday: 3, Wednesday: 3, Thursday: 3, Friday: 3,
    });
    const fifteen = await createDraftFromPaste(token, stamp, fifteenPaste);
    const fifteenId = fifteen.saved.lessonPlan.id;
    assert.notEqual(fifteenId, lessonId);
    const fifteenActs = persistedActivities(fifteen.saved, fifteenId);
    assert.equal(fifteenActs.length, 15);
    assert.equal(fifteen.saved.lessonPlan.status, "draft");
    ["monday", "tuesday", "wednesday", "thursday", "friday"].forEach((day) => {
      assert.equal(fifteenActs.filter((item) => item.dayOfWeek === day).length, 3, day);
    });
    fifteenActs.forEach((act) => {
      assertSupportedFieldsPresent(act, act.title);
      assert.equal(act.status, "draft");
      assert.ok(!act.exampleImageUrl);
      assert.ok(!act.setupImageUrl);
    });
    const mondayMark = findActivity(fifteenActs, "Monday Mark Making");
    assert.deepEqual(listLines(mondayMark.materials), [
      "Monday Mark Making paper",
      "Monday Mark Making crayons",
    ]);
    assert.match(mondayMark.steps, /Invite the child to Monday Mark Making/);
    assert.match(mondayMark.teacherLanguage, /What do you notice in Monday Mark Making/);
    assert.match(mondayMark.observationOpportunities, /Watch Monday Mark Making closely/);
    assert.equal(mondayMark.imageRequirement, "required");

    stamp = fifteen.saved.siteContentUpdatedAt;
    const rainbowFix = rainbowCoffeeFilterArtFixture();
    const rainbowWrite = await createDraftFromPaste(token, stamp, rainbowFix.paste);
    stamp = rainbowWrite.saved.siteContentUpdatedAt;
    const rainbowId = rainbowWrite.saved.lessonPlan.id;
    const rainbowActs = persistedActivities(rainbowWrite.saved, rainbowId);
    assert.equal(rainbowActs.length, 1);
    const rainbow = findActivity(rainbowActs, "Rainbow Coffee Filter Art");
    assert.ok(rainbow, "POST curriculum.activities must include Rainbow Coffee Filter Art");
    assert.equal(rainbow.dayOfWeek, "thursday");
    assert.equal(rainbow.activityCategory, "Art");
    assert.match(rainbow.ageModifications, /Preschool 3–4 Years/);
    assert.equal(rainbow.durationMinutes, 20);
    assert.match(rainbow.objective, /color spreading and blending/);
    assert.match(rainbow.description, /washable marker colors to a coffee filter/);
    assert.deepEqual(listLines(rainbow.materials), [
      "White coffee filters",
      "Washable markers",
      "Droppers",
      "Spray bottles",
      "Water",
      "Trays",
      "Drying rack",
    ]);
    assert.match(rainbow.preparation, /Place each filter on a tray/);
    assert.match(rainbow.setup, /rainbow-colored markers/);
    assert.match(rainbow.steps, /Draw color marks on the dry filter/);
    assert.match(rainbow.teacherLanguage, /What happened when water touched the marker/);
    assert.match(rainbow.observationOpportunities, /fine-motor control/);
    assert.match(rainbow.safetyNotes, /washable non-toxic markers/);
    assert.match(rainbow.cleanupTips, /drying rack/);
    assert.match(rainbow.indoorAlternatives, /indoors or outdoors at an art table/);
    assert.match(rainbow.outdoorAlternatives, /indoors or outdoors at an art table/);
    assert.ok(Array.isArray(rainbow.teacherTips) && rainbow.teacherTips.some((tip) => /oversaturating/.test(tip)));
    assert.equal(rainbow.substitutions.length, 1);
    assert.equal(rainbow.substitutions[0].need, weekKit.UNSTRUCTURED_SUBSTITUTION_NEED);
    assert.notEqual(rainbow.substitutions[0].need, "If missing");
    assert.match(rainbow.substitutions[0].use, /liquid watercolor drops/);
    assert.match(rainbow.adaptations, /dot markers/);
    assert.match(rainbow.extensions, /two specific colors meet/);
    assert.match(rainbow.mixedAgeAdaptations, /Younger children can add random colors/);
    assert.ok(rainbow.observationPrompts.some((row) => /notice spreading/.test(row)));
    assert.match(rainbow.vocabulary, /rainbow/);
    assert.equal(rainbow.imageRequirement, "example_only");
    assert.ok(!rainbow.exampleImageUrl);
    const rainbowDraft = rainbowWrite.saved.lessonPlan.enrichmentDraft?.activities || {};
    const rainbowPatch = enrich.resolveActivityDraftPatch(rainbow, rainbowDraft);
    const rainbowModel = enrich.mapActivityToOwnerEditorModel(rainbow, rainbowPatch, rainbowWrite.saved.lessonPlan);
    const rainbowView = enrich.activityEnrichmentView(rainbow, rainbowPatch);
    assert.equal(rainbowModel.durationMinutes, "20");
    assert.match(rainbowModel.objective, /color spreading and blending/);
    assert.match(rainbowModel.description, /washable marker colors/);
    assert.match(rainbowModel.materials, /White coffee filters/);
    assert.match(rainbowModel.preparation, /Place each filter on a tray/);
    assert.match(rainbowModel.setup, /rainbow-colored markers/);
    assert.match(rainbowModel.steps, /Draw color marks on the dry filter/);
    assert.match(rainbowModel.teacherLanguage, /What happened when water touched the marker/);
    assert.match(rainbowModel.observationOpportunities, /fine-motor control/);
    assert.match(rainbowModel.safetyNotes, /washable non-toxic markers/);
    assert.match(rainbowModel.cleanupTips, /drying rack/);
    assert.match(rainbowView.indoorAlternatives, /art table/);
    assert.match(rainbowView.outdoorAlternatives, /art table/);
    assert.match(rainbowView.adaptations, /dot markers/);
    assert.match(rainbowView.extensions, /two specific colors meet/);
    assert.match(rainbowView.mixedAgeAdaptations, /Younger children/);
    assert.equal(rainbowView.imageRequirement, "example_only");
    assert.equal(enrich.imageRequirementLabel(rainbowView.imageRequirement), "Finished example only");
    assert.match(rainbowView.substitutions[0].use, /liquid watercolor drops/);
    assert.notEqual(rainbowView.substitutions[0].need, "If missing");
    const rainbowGet = await requestJson("GET", "/api/admin/site-content", null, token);
    const rainbowReloaded = (rainbowGet.json.siteContent?.curriculum?.activities || [])
      .find((item) => item.lessonPlanId === rainbowId && item.title === "Rainbow Coffee Filter Art");
    assert.ok(rainbowReloaded);
    assert.equal(rainbowReloaded.durationMinutes, 20);
    assert.match(rainbowReloaded.objective, /color spreading and blending/);
    assert.equal(rainbowReloaded.imageRequirement, "example_only");
    console.log("PASS  Rainbow Coffee Filter Art write+read-back preserves every expected field");

    const twentyFix = weatherWatchersTwentyActivityFixture();
    const twentyWrite = await createDraftFromPaste(token, stamp, twentyFix.paste);
    const twentyActs = persistedActivities(twentyWrite.saved, twentyWrite.saved.lessonPlan.id);
    assert.equal(twentyActs.length, 20);
    ["monday", "tuesday", "wednesday", "thursday", "friday"].forEach((day) => {
      assert.equal(twentyActs.filter((item) => item.dayOfWeek === day).length, 4, day);
    });
    const rainbowInTwenty = findActivity(twentyActs, "Rainbow Coffee Filter Art");
    assert.match(rainbowInTwenty.objective, /color spreading and blending/);
    assert.equal(findActivity(twentyActs, "Monday Cloud Watch").dayOfWeek, "monday");
    assert.equal(findActivity(twentyActs, "Friday Storm Stories").dayOfWeek, "friday");
    console.log("PASS  20-activity Weather Watchers write does not overwrite sibling activities");

    stamp = twentyWrite.saved.siteContentUpdatedAt;
    const colorsPaste = colorsAllAroundUsMasterPaste();
    const colorsParsed = parseFullLessonStructurePaste(colorsPaste);
    const colorsCanonical = buildCanonicalLessonPlan(colorsParsed, { lastEditedBy: ADMIN.email });
    const colorsWrite = await createDraftFromPaste(token, stamp, colorsPaste, {
      id: COLORS_ALL_AROUND_US_FIXTURE.COLORS_LESSON_ID,
    });
    const colorsId = colorsWrite.saved.lessonPlan.id;
    assert.equal(colorsId, COLORS_ALL_AROUND_US_FIXTURE.COLORS_LESSON_ID);
    assert.equal(colorsWrite.saved.lessonPlan.title, "Colors All Around Us");
    assert.equal(colorsWrite.saved.lessonPlan.age, "Infant 0–6 Months");
    assert.equal(colorsWrite.saved.lessonPlan.status, "draft");
    const colorsActs = persistedActivities(colorsWrite.saved, colorsId);
    assert.equal(colorsActs.length, 15);
    COLORS_ALL_AROUND_US_FIXTURE.ACTIVITIES.forEach((spec) => {
      const act = findActivity(colorsActs, spec.title);
      assert.ok(act, spec.title);
      assert.equal(act.dayOfWeek, spec.day.toLowerCase(), spec.title);
      const parsedItem = colorsCanonical.dailyPlans[spec.day.toLowerCase()].items.find((row) => row.title === spec.title);
      assert.equal(parsedItem.activityCategory, spec.category, spec.title);
      assert.match(act.setup || "", new RegExp(`${spec.token} setup only`), spec.title);
      assert.match(act.steps || "", new RegExp(`${spec.token} step one`), spec.title);
      assert.equal(act.setup, parsedItem.setup);
    });
    assert.equal(colorsWrite.saved.lessonPlan.weeklyOverview, colorsCanonical.weeklyOverview);
    console.log("PASS  Colors All Around Us create write+read-back keeps 15 activity boundaries");

    const pub = await requestJson("GET", "/api/site-content");
    const publicIds = (pub.json.siteContent?.curriculumLibrary?.lessonPlans
      || pub.json.curriculumLibrary?.lessonPlans
      || []).map((item) => item.id);
    assert.ok(!publicIds.includes(lessonId));
    assert.ok(!publicIds.includes(fifteenId));
    assert.ok(!publicIds.includes(rainbowId));
    assert.ok(!publicIds.includes(twentyWrite.saved.lessonPlan.id));
    assert.ok(!publicIds.includes(colorsId));
    const resourcesAfterFifteen = (fifteen.saved.curriculum?.resources || []).length;
    assert.equal(resourcesAfterFifteen, resourcesBefore);
    const resourcesAfterRainbow = (rainbowWrite.saved.curriculum?.resources || []).length;
    assert.equal(resourcesAfterRainbow, resourcesBefore);
    console.log("PASS  12  15-activity persisted draft (3 per weekday); no production publish");
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

async function main() {
  runParserAndPreviewGuards();
  await runWriteTests();
  console.log("\nAll master-lesson import create/write tests passed.");
}

main().catch((error) => {
  console.error("\nFAIL", error);
  process.exitCode = 1;
});
