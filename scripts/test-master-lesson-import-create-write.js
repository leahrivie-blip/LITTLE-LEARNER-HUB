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
  runStructuredActivityParserRegressionTests,
} = require("./test-master-lesson-activity-import-parser.js");
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

async function createDraftFromPaste(token, stamp, pasteText) {
  const parsed = parseFullLessonStructurePaste(pasteText);
  assert.equal(parsed.ok, true, parsed.errors.join("; "));
  const plan = buildCanonicalLessonPlan(parsed, { lastEditedBy: ADMIN.email });
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

function durationOnlyPaste(title, duration) {
  return `Lesson title
${title}

Age band
Toddler 12–24 Months

Activity name
Duration Check
Activity weekday
Wednesday
Estimated duration
${duration}
`;
}

function runParserAndPreviewGuards() {
  runStructuredActivityParserRegressionTests();
  const parsed = parseFullLessonStructurePaste(DOT_MARKER_PASTE);
  assert.equal(parsed.ok, true, parsed.errors.join("; "));
  assert.equal(parsed.activityCount, 1);
  assert.equal(parsed.dailyPlans.monday.items[0].durationMinutes, "8–10 minutes");
  assertPreviewUnchanged(parsed, {
    Monday: 1, Tuesday: 0, Wednesday: 0, Thursday: 0, Friday: 0,
  });
  const structure = buildStructurePreview(parsed);
  assert.equal(structure.activityCount, 1);
  assert.equal(structure.recognized.weeklyOverview, true);
  assert.equal(
    parseFullLessonStructurePaste(durationOnlyPaste("Duration Parser 10-15", "10–15 minutes"))
      .dailyPlans.wednesday.items[0].durationMinutes,
    "10–15 minutes",
  );
  assert.equal(
    parseFullLessonStructurePaste(durationOnlyPaste("Duration Parser 8 minutes", "8 minutes"))
      .dailyPlans.wednesday.items[0].durationMinutes,
    "8 minutes",
  );
  assert.equal(
    parseFullLessonStructurePaste(durationOnlyPaste("Duration Parser bare 8", "8"))
      .dailyPlans.wednesday.items[0].durationMinutes,
    8,
  );
  console.log("PASS  14  existing preview parser still groups activities (Dot Marker Monday 1)");
  console.log("PASS  duration parser keeps ranges and single-number durations");
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
    assert.equal(dot.durationMinutes, "8–10 minutes");
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
    assert.equal(model.durationMinutes, "8–10 minutes");
    assert.equal(view.durationMinutesDisplay, "8–10 minutes");
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
    assert.equal(reloadedDot.durationMinutes, "8–10 minutes");
    const reloadedModel = enrich.mapActivityToOwnerEditorModel(reloadedDot, {}, reloadedPlan);
    assert.equal(reloadedModel.durationMinutes, "8–10 minutes");
    console.log("PASS  1b  one-activity persisted result reloads from Admin GET");
    console.log("PASS  duration 8–10 minutes persists and rehydrates");

    const extraDurations = [
      ["LLH QA Duration 10-15 — DO NOT PUBLISH", "10–15 minutes", "10–15 minutes"],
      ["LLH QA Duration 8 minutes — DO NOT PUBLISH", "8 minutes", "8 minutes"],
      ["LLH QA Duration bare 8 — DO NOT PUBLISH", "8", 8],
    ];
    for (const [title, pasted, expected] of extraDurations) {
      const extra = await createDraftFromPaste(token, stamp, durationOnlyPaste(title, pasted));
      stamp = extra.saved.siteContentUpdatedAt;
      const extraId = extra.saved.lessonPlan.id;
      const extraAct = persistedActivities(extra.saved, extraId)[0];
      assert.equal(extraAct.durationMinutes, expected, `${pasted} POST`);
      const extraReload = await requestJson("GET", "/api/admin/site-content", null, token);
      const extraReloaded = (extraReload.json.siteContent?.curriculum?.activities || [])
        .find((item) => item.lessonPlanId === extraId && item.status !== "archived");
      assert.equal(extraReloaded.durationMinutes, expected, `${pasted} GET`);
      const extraPlan = (extraReload.json.siteContent?.curriculum?.lessonPlans || [])
        .find((item) => item.id === extraId);
      const extraModel = enrich.mapActivityToOwnerEditorModel(extraReloaded, {}, extraPlan);
      assert.equal(extraModel.durationMinutes, String(expected), `${pasted} editor`);
    }
    console.log("PASS  duration 10–15 minutes / 8 minutes / bare 8 persist and rehydrate");

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
    const pub = await requestJson("GET", "/api/site-content");
    const publicIds = (pub.json.siteContent?.curriculumLibrary?.lessonPlans
      || pub.json.curriculumLibrary?.lessonPlans
      || []).map((item) => item.id);
    assert.ok(!publicIds.includes(lessonId));
    assert.ok(!publicIds.includes(fifteenId));
    const resourcesAfterFifteen = (fifteen.saved.curriculum?.resources || []).length;
    assert.equal(resourcesAfterFifteen, resourcesBefore);
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
