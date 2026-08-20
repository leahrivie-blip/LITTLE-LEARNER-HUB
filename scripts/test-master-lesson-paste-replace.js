#!/usr/bin/env node
/**
 * Replace From Master Paste: owner-only write+read-back, shrinking activity
 * sets, failure rollback, substitution/image mapping, and authorization.
 * Disposable local store only. Does not publish production lessons or mutate resources.
 * Run: npm run test:master-lesson-paste-replace
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
  buildCanonicalLessonPlan,
  matchMasterPasteActivitiesToExisting,
  applyMasterPasteActivityMatches,
} = require("./curriculum-lesson-structure-paste.js");
const {
  fifteenActivityFixture,
  rainbowCoffeeFilterArtFixture,
  weatherWatchersTwentyActivityFixture,
  RAINBOW_COFFEE_FILTER_ART_ACTIVITY,
} = require("./test-master-lesson-activity-import-parser.js");
const weekKit = require("./curriculum-week-kit-paste.js");
const enrich = require("./teaching-kit-enrichment.js");

const ROOT = path.join(__dirname, "..");
const PORT = 20740 + Math.floor(Math.random() * 80);
const BASE = `http://127.0.0.1:${PORT}`;
const STORE_PATH = path.join(os.tmpdir(), `llh-master-replace-${crypto.randomBytes(4).toString("hex")}.json`);
const RESOURCE_ID = `cur-res-replace-${crypto.randomBytes(3).toString("hex")}`;
const RAINBOW_LESSON_ID = "cur-lp-master-replace-rainbow";
const VISUAL_BRIEF_ID = "vb-master-replace-preserve";
const COVER_URL = "/images/lesson-covers/weather-watchers.png";
const SETUP_URL = "/images/activities/rainbow-setup.png";
const EXAMPLE_URL = "/images/activities/rainbow-example.png";
const SETUP_ASSET = "tk-enrich-aaaaaaaaaaaaaaaa";
const EXAMPLE_ASSET = "tk-enrich-bbbbbbbbbbbbbbbb";
const OWNER = {
  email: "leahivie@icloud.com",
  password: "master-replace-pass",
  code: "master-replace-code",
};
const STAFF = {
  email: "staff-admin@example.com",
  password: "master-replace-staff-pass",
  code: "master-replace-staff-code",
};

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

function writeEmptyStore(extraCurriculum = {}) {
  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {},
    siteContent: {
      featureFlags: { teachingKitEnrichmentEditor: true },
      curriculum: {
        lessonPlans: [],
        activities: [],
        resources: [{
          id: RESOURCE_ID,
          title: "Linked Weather Printable",
          resourceCategory: "Printables",
          status: "published",
          lessonPlanIds: [],
        }],
        series: [],
        ...extraCurriculum,
      },
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    adminSessions: {},
    visualProduction: {
      updatedAt: "2026-01-01T00:00:00.000Z",
      briefs: [{
        id: VISUAL_BRIEF_ID,
        lessonId: RAINBOW_LESSON_ID,
        activityId: "pre-replace-activity",
        activityName: "Rainbow Coffee Filter Art",
        assetType: "ACTIVITY_IMAGE",
        visualStyle: "REALISTIC_CLASSROOM",
        status: "READY_FOR_REVIEW",
        originalInstruction: "Keep this visual production brief untouched during Master Paste replace.",
        subject: "Coffee filter rainbow art",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }],
    },
  }, null, 2));
}

function startServer(admin, { enforceOwner = false } = {}) {
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: BASE,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      ADMIN_EMAIL: admin.email,
      ADMIN_PASSWORD: admin.password,
      ADMIN_ACCESS_CODE: admin.code,
      ADMIN_EMAILS: admin.email === STAFF.email ? STAFF.email : undefined,
      LLH_ENFORCE_TK_OWNER_ADMIN: enforceOwner ? "1" : "0",
      LLH_SKIP_STARTUP_CURRICULUM_SEED: "1",
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

function activeActivities(payload, lessonId) {
  return (payload.activities || payload.curriculum?.activities || [])
    .filter((item) => item && item.lessonPlanId === lessonId && item.status !== "archived");
}

function findActivity(activities, title) {
  return activities.find((item) => String(item.title || "") === title) || null;
}

function readVisualBriefs() {
  const store = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
  return store.visualProduction?.briefs || [];
}

function assertParserIsSharedForCreateAndReplace() {
  const paste = rainbowCoffeeFilterArtFixture().paste;
  const parsed = parseFullLessonStructurePaste(paste);
  assert.equal(parsed.ok, true, parsed.errors.join("; "));
  const created = buildCanonicalLessonPlan(parsed, { lastEditedBy: OWNER.email });
  const replaced = buildCanonicalLessonPlan(parsed, { id: RAINBOW_LESSON_ID, lastEditedBy: OWNER.email });
  assert.equal(created.title, replaced.title);
  assert.equal(created.age, replaced.age);
  assert.equal(created.weeklyOverview, replaced.weeklyOverview);
  assert.equal(created.objectives, replaced.objectives);
  assert.equal(created.dailyPlans.thursday.items[0].title, replaced.dailyPlans.thursday.items[0].title);
  assert.equal(created.dailyPlans.thursday.items[0].objective, replaced.dailyPlans.thursday.items[0].objective);
  assert.equal(created.dailyPlans.thursday.items[0].itemId, replaced.dailyPlans.thursday.items[0].itemId);
  assert.equal(replaced.id, RAINBOW_LESSON_ID);
  assert.notEqual(created.id, RAINBOW_LESSON_ID);
  console.log("PASS  7  parser output is identical for new import and replacement (shared parseFullLessonStructurePaste)");
}

function assertActivityMatchingUnit() {
  const parsed = parseFullLessonStructurePaste(rainbowCoffeeFilterArtFixture().paste);
  const existing = [
    {
      id: "cur-act-keep",
      itemId: "item-keep-rainbow",
      title: "Rainbow Coffee Filter Art",
      dayOfWeek: "thursday",
      status: "draft",
      setupImageUrl: SETUP_URL,
      exampleImageUrl: EXAMPLE_URL,
      setupMediaAssetId: SETUP_ASSET,
      exampleMediaAssetId: EXAMPLE_ASSET,
    },
    {
      id: "cur-act-drop",
      itemId: "item-drop",
      title: "Monday Mark Making",
      dayOfWeek: "monday",
      status: "draft",
      setupImageUrl: "/images/activities/mark-making.png",
    },
  ];
  const match = matchMasterPasteActivitiesToExisting(existing, parsed.dailyPlans);
  assert.equal(match.ok, true, (match.errors || []).join("; "));
  assert.equal(match.matches.length, 1);
  assert.equal(match.matches[0].existing.id, "cur-act-keep");
  assert.equal(match.removed.length, 1);
  assert.equal(match.removed[0].title, "Monday Mark Making");
  const applied = applyMasterPasteActivityMatches(buildCanonicalLessonPlan(parsed, { id: RAINBOW_LESSON_ID }), match);
  assert.equal(applied.dailyPlans.thursday.items[0].itemId, "item-keep-rainbow");
  assert.equal(applied.dailyPlans.thursday.items[0].setupImageUrl, SETUP_URL);
  assert.equal(applied.dailyPlans.thursday.items[0].exampleImageUrl, EXAMPLE_URL);

  const ambiguous = matchMasterPasteActivitiesToExisting(
    [{ id: "only-one", itemId: "item-1", title: "Rainbow Coffee Filter Art", dayOfWeek: "thursday", status: "draft" }],
    {
      thursday: {
        items: [
          { itemId: "n1", title: "Rainbow Coffee Filter Art" },
          { itemId: "n2", title: "Rainbow Coffee Filter Art" },
        ],
      },
    },
  );
  assert.equal(ambiguous.ok, false);
  assert.equal(ambiguous.details[0].reason, "ambiguous_day_title_count");

  const equalDuplicates = matchMasterPasteActivitiesToExisting(
    [
      { id: "a", itemId: "i1", title: "Circle Time", dayOfWeek: "monday", status: "draft" },
      { id: "b", itemId: "i2", title: "Circle Time", dayOfWeek: "monday", status: "draft" },
    ],
    {
      monday: {
        items: [
          { itemId: "n1", title: "Circle Time" },
          { itemId: "n2", title: "Circle Time" },
        ],
      },
    },
  );
  assert.equal(equalDuplicates.ok, false, "same title twice on the same weekday must fail closed");

  const countDiff = matchMasterPasteActivitiesToExisting(
    [
      { id: "a", itemId: "i1", title: "Circle Time", dayOfWeek: "monday", status: "draft" },
      { id: "b", itemId: "i2", title: "Circle Time", dayOfWeek: "monday", status: "draft" },
    ],
    { monday: { items: [{ itemId: "n1", title: "Circle Time" }] } },
  );
  assert.equal(countDiff.ok, false, "existing vs incoming count mismatch on the same title must fail closed");

  const splitDays = matchMasterPasteActivitiesToExisting(
    [
      { id: "a", itemId: "i1", title: "Circle Time", dayOfWeek: "monday", status: "draft" },
      { id: "b", itemId: "i2", title: "Circle Time", dayOfWeek: "tuesday", status: "draft" },
    ],
    {
      monday: { items: [{ itemId: "n1", title: "Circle Time" }] },
      tuesday: { items: [{ itemId: "n2", title: "Circle Time" }] },
    },
  );
  assert.equal(splitDays.ok, true);
  assert.equal(splitDays.matches.length, 2);

  const moved = matchMasterPasteActivitiesToExisting(
    [{
      id: "cur-act-keep",
      itemId: "item-keep-rainbow",
      title: "Rainbow Coffee Filter Art",
      dayOfWeek: "thursday",
      status: "draft",
      setupImageUrl: SETUP_URL,
    }],
    { monday: { items: [{ itemId: "fresh", title: "Rainbow Coffee Filter Art" }] } },
  );
  assert.equal(moved.ok, true);
  assert.equal(moved.matches[0].strategy, "title");
  assert.equal(moved.matches[0].existing.itemId, "item-keep-rainbow");

  const normalized = matchMasterPasteActivitiesToExisting(
    [{
      id: "cur-act-keep",
      itemId: "item-keep-rainbow",
      title: "Rainbow Coffee Filter Art",
      dayOfWeek: "thursday",
      status: "draft",
    }],
    { thursday: { items: [{ itemId: "fresh", title: "  RAINBOW   Coffee Filter Art  " }] } },
  );
  assert.equal(normalized.ok, true);
  assert.equal(normalized.matches[0].existing.itemId, "item-keep-rainbow");

  const stolen = applyMasterPasteActivityMatches(
    {
      dailyPlans: {
        monday: { items: [{ itemId: "item-keep-rainbow", title: "Cloud Watching Walk" }] },
        tuesday: { items: [] },
        wednesday: { items: [] },
        thursday: { items: [] },
        friday: { items: [] },
      },
    },
    {
      ok: true,
      matches: [],
      added: [{ day: "monday", index: 0, title: "Cloud Watching Walk", itemId: "item-keep-rainbow" }],
      removed: [],
    },
    { occupiedItemIds: ["item-keep-rainbow"] },
  );
  assert.notEqual(stolen.dailyPlans.monday.items[0].itemId, "item-keep-rainbow");
  console.log("PASS  matching  unique day+title preserves itemId/assets; duplicates and archived-id reuse fail closed");
}

async function stampLessonAssets(token, expectedUpdatedAt, lessonPlan, options) {
  const dailyPlans = JSON.parse(JSON.stringify(lessonPlan.dailyPlans || {}));
  ["monday", "tuesday", "wednesday", "thursday", "friday"].forEach((day) => {
    (dailyPlans[day]?.items || []).forEach((item) => {
      if (item.title !== options.activityTitle) return;
      item.setupImageUrl = options.setupUrl || item.setupImageUrl || "";
      item.exampleImageUrl = options.exampleUrl || item.exampleImageUrl || "";
      item.setupMediaAssetId = options.setupAsset || item.setupMediaAssetId || "";
      item.exampleMediaAssetId = options.exampleAsset || item.exampleMediaAssetId || "";
    });
  });
  const saved = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    expectedUpdatedAt,
    lessonPlan: {
      ...lessonPlan,
      dailyPlans,
      coverImageUrl: options.coverUrl || lessonPlan.coverImageUrl || "",
      plan: lessonPlan.plan,
      resourceIds: lessonPlan.resourceIds,
      disposableQaFixture: true,
    },
  }, token);
  assert.equal(saved.status, 200, saved.text);
  return saved;
}

async function login(admin) {
  const res = await requestJson("POST", "/api/admin/login", {
    email: admin.email,
    password: admin.password,
    code: admin.code,
  });
  assert.equal(res.status, 200, res.text);
  return res.json.token;
}

async function stamp(token) {
  const res = await requestJson("GET", "/api/admin/site-content", null, token);
  assert.equal(res.status, 200, res.text);
  return res.json.siteContent?.updatedAt || "";
}

async function createDraftFromPaste(token, expectedUpdatedAt, pasteText, extra = {}) {
  const parsed = parseFullLessonStructurePaste(pasteText);
  assert.equal(parsed.ok, true, parsed.errors.join("; "));
  const plan = buildCanonicalLessonPlan(parsed, { id: extra.id, lastEditedBy: OWNER.email });
  const saved = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    expectedUpdatedAt,
    lessonPlan: {
      ...plan,
      status: "draft",
      resourceIds: extra.resourceIds || [],
      plan: extra.plan || "Free",
      disposableQaFixture: true,
    },
  }, token);
  assert.equal(saved.status, 200, saved.text);
  return { parsed, plan, saved: saved.json };
}

async function replaceFromPaste(token, expectedUpdatedAt, lessonId, pasteText, extra = {}) {
  const parsed = parseFullLessonStructurePaste(pasteText);
  assert.equal(parsed.ok, true, parsed.errors.join("; "));
  const plan = extra.lessonPlan || buildCanonicalLessonPlan(parsed, { id: lessonId, lastEditedBy: OWNER.email });
  const saved = await requestJson("POST", "/api/admin/curriculum/lesson-plans/replace-from-master-paste", {
    expectedUpdatedAt,
    saveMode: "replace_from_master_paste",
    confirmReplaceExistingLesson: extra.confirmReplaceExistingLesson !== false,
    simulateActivityWriteFailure: extra.simulateActivityWriteFailure === true,
    lessonPlan: {
      ...plan,
      id: lessonId,
      disposableQaFixture: true,
    },
  }, token);
  return { parsed, plan, saved };
}

function assertRainbowFields(act, label) {
  assert.equal(act.title, "Rainbow Coffee Filter Art", label);
  assert.equal(act.dayOfWeek, "thursday", label);
  assert.equal(act.activityCategory, "Art", label);
  assert.match(act.ageModifications || "", /Preschool 3–4 Years/, label);
  assert.equal(act.durationMinutes, 20, label);
  assert.match(act.objective || "", /color spreading and blending/, label);
  assert.match(act.description || "", /washable marker colors to a coffee filter/, label);
  assert.deepEqual(listLines(act.materials), [
    "White coffee filters",
    "Washable markers",
    "Droppers",
    "Spray bottles",
    "Water",
    "Trays",
    "Drying rack",
  ]);
  assert.match(act.preparation || "", /Place each filter on a tray/, label);
  assert.match(act.setup || "", /rainbow-colored markers/, label);
  assert.match(act.steps || "", /Draw color marks on the dry filter/, label);
  assert.match(act.teacherLanguage || "", /What happened when water touched the marker/, label);
  assert.match(act.observationOpportunities || "", /fine-motor control/, label);
  assert.match(act.safetyNotes || "", /washable non-toxic markers/, label);
  assert.match(act.cleanupTips || "", /drying rack/, label);
  assert.match(act.indoorAlternatives || "", /indoors or outdoors at an art table/, label);
  assert.match(act.outdoorAlternatives || "", /indoors or outdoors at an art table/, label);
  assert.ok((act.teacherTips || []).some((tip) => /oversaturating/.test(tip)), label);
  assert.equal((act.substitutions || []).length, 1, label);
  assert.equal(act.substitutions[0].need, weekKit.UNSTRUCTURED_SUBSTITUTION_NEED, label);
  assert.notEqual(act.substitutions[0].need, "If missing", label);
  assert.match(act.substitutions[0].use || "", /liquid watercolor drops/, label);
  assert.match(act.adaptations || "", /dot markers/, label);
  assert.match(act.extensions || "", /two specific colors meet/, label);
  assert.match(act.mixedAgeAdaptations || "", /Younger children can add random colors/, label);
  assert.ok((act.observationPrompts || []).some((row) => /notice spreading/.test(row)), label);
  assert.match(act.vocabulary || "", /rainbow/, label);
  assert.equal(act.imageRequirement, "example_only", label);
  assert.ok(!act.exampleImageUrl, label);
}

function assertStaticContract() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const editorSrc = fs.readFileSync(path.join(ROOT, "scripts/teaching-kit-enrichment-editor.js"), "utf8");
  const serverSrc = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  assert.match(editorSrc, /Replace From Master Paste/);
  assert.match(editorSrc, /data-replace-from-master-paste/);
  assert.match(editorSrc, /Paste a complete master lesson to replace this lesson/);
  assert.match(appJs, /function openAdminReplaceLessonFromMasterPaste\(/);
  assert.match(appJs, /Parse \/ Preview/);
  assert.match(appJs, /Confirm Replacement/);
  assert.match(appJs, /Replace Lesson Content/);
  assert.match(appJs, /replace-from-master-paste/);
  assert.match(appJs, /if \(adminCreateLessonPlanUi.creating\) return;/);
  assert.match(appJs, /if \(!comparison \|\| comparison\.ok !== true\)/);
  assert.match(appJs, /snapshotId !== targetId/);
  assert.match(appJs, /replaceComparison: null/);
  assert.match(appJs, /EXISTING LESSON → INCOMING MASTER PASTE/);
  assert.match(appJs, /ACTIVITIES BEING UPDATED/);
  assert.match(appJs, /ACTIVITIES BEING ADDED/);
  assert.match(appJs, /ACTIVITIES NO LONGER PRESENT/);
  assert.match(serverSrc, /function replaceCurriculumLessonContentFromMasterPaste\(/);
  assert.match(serverSrc, /function snapshotMasterPasteReplaceState\(/);
  assert.match(serverSrc, /confirmReplaceExistingLesson/);
  assert.match(serverSrc, /matchMasterPasteActivitiesToExisting/);
  assert.match(serverSrc, /occupiedItemIds/);
  assert.match(serverSrc, /replace_from_master_paste/);
  assert.match(serverSrc, /lesson-plans\/replace-from-master-paste/);
  const pasteSrc = fs.readFileSync(path.join(ROOT, "scripts/curriculum-lesson-structure-paste.js"), "utf8");
  assert.match(pasteSrc, /function matchMasterPasteActivitiesToExisting\(/);
  assert.match(pasteSrc, /function applyMasterPasteActivityMatches\(/);
  assert.match(pasteSrc, /function parseFullLessonStructurePaste\(/);
  assert.match(appJs, /api\.parseFullLessonStructurePaste\(/);
  assert.match(appJs, /api\.buildCanonicalLessonPlan\(/);
  console.log("PASS  static contract: Replace From Master Paste UI + owner endpoint");
}

async function runOwnerReplaceTests() {
  writeEmptyStore();
  const child = startServer(OWNER);
  try {
    await waitForBoot(child);
    const token = await login(OWNER);
    let expectedUpdatedAt = await stamp(token);

    const originalPaste = fifteenActivityFixture().paste.replace(
      "Structured Activity Parser 15",
      "Original Weather Lesson",
    );
    const original = await createDraftFromPaste(token, expectedUpdatedAt, originalPaste, {
      plan: "Pro",
      resourceIds: [RESOURCE_ID],
    });
    expectedUpdatedAt = original.saved.siteContentUpdatedAt;
    const originalId = original.saved.lessonPlan.id;
    assert.equal(activeActivities(original.saved, originalId).length, 15);

    const meta = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      expectedUpdatedAt,
      lessonPlan: {
        ...original.saved.lessonPlan,
        plan: "Pro",
        status: "draft",
        resourceIds: [RESOURCE_ID],
        coverImageUrl: COVER_URL,
      },
    }, token);
    assert.equal(meta.status, 200, meta.text);
    expectedUpdatedAt = meta.json.siteContentUpdatedAt;
    assert.equal(meta.json.lessonPlan.plan, "Pro");
    assert.deepEqual(meta.json.lessonPlan.resourceIds, [RESOURCE_ID]);
    const createdAt = meta.json.lessonPlan.createdAt;
    const statusBefore = meta.json.lessonPlan.status;
    const resourceCountBefore = (meta.json.curriculum?.resources || []).length;
    const stamped = await stampLessonAssets(token, expectedUpdatedAt, meta.json.lessonPlan, {
      activityTitle: "Monday Mark Making",
      coverUrl: COVER_URL,
      setupUrl: "/images/activities/mark-making-setup.png",
      exampleUrl: "/images/activities/mark-making-example.png",
    });
    expectedUpdatedAt = stamped.json.siteContentUpdatedAt;
    const briefsBefore = JSON.stringify(readVisualBriefs());

    const twenty = weatherWatchersTwentyActivityFixture();
    const replaced = await replaceFromPaste(token, expectedUpdatedAt, originalId, twenty.paste);
    assert.equal(replaced.saved.status, 200, replaced.saved.text);
    expectedUpdatedAt = replaced.saved.json.siteContentUpdatedAt;
    const savedPlan = replaced.saved.json.lessonPlan;
    assert.equal(savedPlan.id, originalId, "lesson ID must stay the same");
    assert.equal(savedPlan.createdAt, createdAt, "createdAt must stay the same");
    assert.equal(savedPlan.status, statusBefore, "publish/draft status must stay unchanged");
    assert.equal(savedPlan.plan, "Pro", "Free/Pro must stay unchanged");
    assert.equal(savedPlan.coverImageUrl, COVER_URL, "cover image must stay unchanged");
    assert.deepEqual(savedPlan.resourceIds, [RESOURCE_ID], "linked resource IDs must stay unchanged");
    assert.equal(savedPlan.status, "draft", "replacement must not publish automatically");
    assert.equal((savedPlan.enrichmentPublishHistory || [])[0]?.kind, "paste_replace");
    assert.equal((savedPlan.enrichmentPublishHistory || [])[0]?.snapshot?.title, "Original Weather Lesson");
    assert.equal(JSON.stringify(readVisualBriefs()), briefsBefore, "visual production briefs must stay untouched");
    assert.match(savedPlan.title, /Weather Watchers/);
    const replacedActs = activeActivities(replaced.saved.json, originalId);
    assert.equal(replacedActs.length, 20);
    ["monday", "tuesday", "wednesday", "thursday", "friday"].forEach((day) => {
      assert.equal(replacedActs.filter((item) => item.dayOfWeek === day).length, 4, day);
    });
    const rainbow = findActivity(replacedActs, "Rainbow Coffee Filter Art");
    assertRainbowFields(rainbow, "replace 15→20");
    assert.ok(!findActivity(replacedActs, "Monday Mark Making"), "obsolete 15-activity titles must detach");
    const patch = enrich.resolveActivityDraftPatch(rainbow, savedPlan.enrichmentDraft?.activities || {});
    const model = enrich.mapActivityToOwnerEditorModel(rainbow, patch, savedPlan);
    const view = enrich.activityEnrichmentView(rainbow, patch);
    assert.match(model.objective, /color spreading and blending/);
    assert.match(model.materials, /White coffee filters/);
    assert.equal(view.imageRequirement, "example_only");
    assert.equal(enrich.imageRequirementLabel(view.imageRequirement), "Finished example only");
    assert.match(view.substitutions[0].use, /liquid watercolor drops/);
    assert.notEqual(view.substitutions[0].need, "If missing");
    const resourcesAfter = (replaced.saved.json.curriculum?.resources || []).length;
    assert.equal(resourcesAfter, resourceCountBefore, "linked resource records must not be recreated");
    const archivedMarkMaking = (replaced.saved.json.activities || []).find((item) => (
      item.lessonPlanId === originalId && item.title === "Monday Mark Making" && item.status === "archived"
    ));
    assert.ok(archivedMarkMaking, "removed activities are archived, not deleted");
    assert.equal(archivedMarkMaking.setupImageUrl, "/images/activities/mark-making-setup.png");
    assert.equal(archivedMarkMaking.exampleImageUrl, "/images/activities/mark-making-example.png");
    console.log("PASS  C  replace 15→20 keeps ID, Pro, draft status, cover, linked resources, history; removed activity keeps images");

    const fifteenPaste = fifteenActivityFixture().paste.replace(
      "Structured Activity Parser 15",
      "Weather Watchers Fifteen",
    );
    const shrunk = await replaceFromPaste(token, expectedUpdatedAt, originalId, fifteenPaste);
    assert.equal(shrunk.saved.status, 200, shrunk.saved.text);
    expectedUpdatedAt = shrunk.saved.json.siteContentUpdatedAt;
    assert.equal(shrunk.saved.json.lessonPlan.id, originalId);
    const shrunkActs = activeActivities(shrunk.saved.json, originalId);
    assert.equal(shrunkActs.length, 15);
    assert.ok(!findActivity(shrunkActs, "Rainbow Coffee Filter Art"));
    assert.ok(findActivity(shrunkActs, "Monday Mark Making"));
    assert.equal(shrunk.saved.json.lessonPlan.plan, "Pro");
    assert.deepEqual(shrunk.saved.json.lessonPlan.resourceIds, [RESOURCE_ID]);
    console.log("PASS  D  shrinking replacement leaves exactly 15 associated activities");

    const beforeFail = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    const beforeFailPlan = beforeFail.siteContent.curriculum.lessonPlans.find((p) => p.id === originalId);
    const historyBeforeFail = (beforeFailPlan.enrichmentPublishHistory || []).map((item) => item.versionId);
    const fail = await replaceFromPaste(token, expectedUpdatedAt, originalId, twenty.paste, {
      simulateActivityWriteFailure: true,
    });
    assert.equal(fail.saved.status, 500, fail.saved.text);
    assert.equal(fail.saved.json.code, "simulated_activity_write_failure");
    const afterFailGet = await requestJson("GET", "/api/admin/site-content", null, token);
    const afterFailPlan = (afterFailGet.json.siteContent?.curriculum?.lessonPlans || [])
      .find((item) => item.id === originalId);
    const afterFailActs = (afterFailGet.json.siteContent?.curriculum?.activities || [])
      .filter((item) => item.lessonPlanId === originalId && item.status !== "archived");
    assert.equal(afterFailPlan.title, beforeFailPlan.title);
    assert.equal(afterFailActs.length, 15);
    assert.ok(findActivity(afterFailActs, "Monday Mark Making"));
    assert.ok(!findActivity(afterFailActs, "Rainbow Coffee Filter Art"));
    assert.deepEqual(
      (afterFailPlan.enrichmentPublishHistory || []).map((item) => item.versionId),
      historyBeforeFail,
      "failed replacement must not write a successful paste_replace history row",
    );
    console.log("PASS  E  simulated activity write failure does not leave a partial replace or history snapshot");

    const rainbowOnly = await replaceFromPaste(
      token,
      afterFailGet.json.siteContent.updatedAt,
      originalId,
      rainbowCoffeeFilterArtFixture().paste,
    );
    assert.equal(rainbowOnly.saved.status, 200, rainbowOnly.saved.text);
    const oneAct = activeActivities(rainbowOnly.saved.json, originalId);
    assert.equal(oneAct.length, 1);
    assertRainbowFields(oneAct[0], "replace to Rainbow-only");
    expectedUpdatedAt = rainbowOnly.saved.json.siteContentUpdatedAt;
    console.log("PASS  A/F/G  complete Rainbow fixture survives replace write+read-back");

    const noConfirm = await replaceFromPaste(token, expectedUpdatedAt, originalId, twenty.paste, {
      confirmReplaceExistingLesson: false,
    });
    assert.equal(noConfirm.saved.status, 400, noConfirm.saved.text);
    assert.equal(noConfirm.saved.json.code, "confirm_replace_required");
    const afterNoConfirm = await requestJson("GET", "/api/admin/site-content", null, token);
    const afterNoConfirmPlan = (afterNoConfirm.json.siteContent?.curriculum?.lessonPlans || [])
      .find((item) => item.id === originalId);
    assert.equal(afterNoConfirmPlan.title, rainbowOnly.saved.json.lessonPlan.title);
    const afterNoConfirmActs = (afterNoConfirm.json.siteContent?.curriculum?.activities || [])
      .filter((item) => item.lessonPlanId === originalId && item.status !== "archived");
    assert.equal(afterNoConfirmActs.length, 1);
    expectedUpdatedAt = afterNoConfirm.json.siteContent.updatedAt;
    console.log("PASS  14  replacement requires confirmReplaceExistingLesson");

    const duplicateRainbowPaste = `${rainbowCoffeeFilterArtFixture().paste}\n\n${RAINBOW_COFFEE_FILTER_ART_ACTIVITY}`;
    const ambiguous = await replaceFromPaste(token, expectedUpdatedAt, originalId, duplicateRainbowPaste);
    assert.equal(ambiguous.saved.status, 400, ambiguous.saved.text);
    assert.equal(ambiguous.saved.json.code, "activity_mapping_ambiguous");
    const afterAmbiguous = await requestJson("GET", "/api/admin/site-content", null, token);
    assert.equal(
      (afterAmbiguous.json.siteContent?.curriculum?.lessonPlans || []).find((item) => item.id === originalId).title,
      rainbowOnly.saved.json.lessonPlan.title,
    );
    assert.equal(
      (afterAmbiguous.json.siteContent?.curriculum?.activities || [])
        .filter((item) => item.lessonPlanId === originalId && item.status !== "archived").length,
      1,
    );
    expectedUpdatedAt = afterAmbiguous.json.siteContent.updatedAt;
    console.log("PASS  13  ambiguous activity mapping makes zero changes");

    const missing = await requestJson("POST", "/api/admin/curriculum/lesson-plans/replace-from-master-paste", {
      expectedUpdatedAt,
      saveMode: "replace_from_master_paste",
      confirmReplaceExistingLesson: true,
      lessonPlan: {
        ...buildCanonicalLessonPlan(parseFullLessonStructurePaste(rainbowCoffeeFilterArtFixture().paste)),
        id: "cur-lp-does-not-exist",
      },
    }, token);
    assert.equal(missing.status, 404, missing.text);
    assert.equal(missing.json.code, "lesson_not_found");
    console.log("PASS  missing lesson ID makes zero changes");

    const rainbowCreated = await createDraftFromPaste(token, expectedUpdatedAt, rainbowCoffeeFilterArtFixture().paste, {
      id: RAINBOW_LESSON_ID,
      plan: "Pro",
      resourceIds: [RESOURCE_ID],
    });
    expectedUpdatedAt = rainbowCreated.saved.siteContentUpdatedAt;
    const rainbowMeta = await stampLessonAssets(token, expectedUpdatedAt, {
      ...rainbowCreated.saved.lessonPlan,
      plan: "Pro",
      resourceIds: [RESOURCE_ID],
    }, {
      activityTitle: "Rainbow Coffee Filter Art",
      coverUrl: COVER_URL,
      setupUrl: SETUP_URL,
      exampleUrl: EXAMPLE_URL,
      setupAsset: SETUP_ASSET,
      exampleAsset: EXAMPLE_ASSET,
    });
    expectedUpdatedAt = rainbowMeta.json.siteContentUpdatedAt;
    const rainbowBefore = findActivity(activeActivities(rainbowMeta.json, RAINBOW_LESSON_ID), "Rainbow Coffee Filter Art");
    assert.ok(rainbowBefore?.id);
    const rainbowActivityId = rainbowBefore.id;
    const rainbowItemId = rainbowBefore.itemId;
    const briefsBeforeRainbow = JSON.stringify(readVisualBriefs());
    const overviewBeforeReplace = rainbowMeta.json.lessonPlan.weeklyOverview;

    const mondayRainbowPaste = rainbowCoffeeFilterArtFixture().paste.replace("Weekday\nThursday", "Weekday\nMonday");
    const moved = await replaceFromPaste(token, expectedUpdatedAt, RAINBOW_LESSON_ID, mondayRainbowPaste);
    assert.equal(moved.saved.status, 200, moved.saved.text);
    expectedUpdatedAt = moved.saved.json.siteContentUpdatedAt;
    const movedAct = findActivity(activeActivities(moved.saved.json, RAINBOW_LESSON_ID), "Rainbow Coffee Filter Art");
    assert.equal(movedAct.id, rainbowActivityId, "weekday-move preserves activity id");
    assert.equal(movedAct.itemId, rainbowItemId);
    assert.equal(movedAct.dayOfWeek, "monday");
    assert.equal(movedAct.setupImageUrl, SETUP_URL);
    assert.equal(movedAct.exampleImageUrl, EXAMPLE_URL);
    assert.equal(movedAct.setupMediaAssetId, SETUP_ASSET);
    assert.equal(movedAct.exampleMediaAssetId, EXAMPLE_ASSET);
    assert.equal(moved.saved.json.lessonPlan.coverImageUrl, COVER_URL);
    console.log("PASS  5b  same title moved to another weekday keeps itemId and images");

    const updatedOverviewPaste = rainbowCoffeeFilterArtFixture().paste
      .replace(
        "Children explore weather, color, and water through process art and outdoor noticing.",
        "Updated weekly overview after Master Paste replace.",
      ) + "\n\nCover image URL\nhttps://evil.example/should-not-apply.png\n";
    const identityReplace = await replaceFromPaste(
      token,
      expectedUpdatedAt,
      RAINBOW_LESSON_ID,
      updatedOverviewPaste,
    );
    assert.equal(identityReplace.saved.status, 200, identityReplace.saved.text);
    expectedUpdatedAt = identityReplace.saved.json.siteContentUpdatedAt;
    const identityPlan = identityReplace.saved.json.lessonPlan;
    assert.equal(identityPlan.id, RAINBOW_LESSON_ID);
    assert.equal(identityPlan.plan, "Pro");
    assert.equal(identityPlan.status, "draft");
    assert.equal(identityPlan.coverImageUrl, COVER_URL);
    assert.deepEqual(identityPlan.resourceIds, [RESOURCE_ID]);
    assert.match(identityPlan.weeklyOverview, /Updated weekly overview after Master Paste replace/);
    const identityAct = findActivity(activeActivities(identityReplace.saved.json, RAINBOW_LESSON_ID), "Rainbow Coffee Filter Art");
    assert.equal(identityAct.id, rainbowActivityId, "matched activity ID must be preserved");
    assert.equal(identityAct.itemId, rainbowItemId, "matched activity itemId must be preserved");
    assert.equal(identityAct.setupImageUrl, SETUP_URL);
    assert.equal(identityAct.exampleImageUrl, EXAMPLE_URL);
    assert.equal(identityAct.setupMediaAssetId, SETUP_ASSET);
    assert.equal(identityAct.exampleMediaAssetId, EXAMPLE_ASSET);
    assert.equal(JSON.stringify(readVisualBriefs()), briefsBeforeRainbow);
    console.log("PASS  1-6/8-9  identity, Pro, cover, images, printables, visual production preserved; text updated");

    const historyEntry = (identityPlan.enrichmentPublishHistory || []).find((item) => item.kind === "paste_replace");
    assert.ok(historyEntry?.versionId, "paste_replace snapshot exists before commit");
    assert.equal(historyEntry.snapshot?.title, "Weather Watchers");
    assert.match(historyEntry.snapshot?.weeklyOverview || "", /Children explore weather/);
    const rollback = await requestJson("POST", "/api/admin/curriculum/enrichment-rollback", {
      expectedUpdatedAt,
      planId: RAINBOW_LESSON_ID,
      versionId: historyEntry.versionId,
      publishedBy: OWNER.email,
    }, token);
    assert.equal(rollback.status, 200, rollback.text);
    assert.equal(rollback.json.autoPublished, false);
    expectedUpdatedAt = rollback.json.siteContentUpdatedAt;
    const rolledPlan = rollback.json.lessonPlan;
    assert.equal(rolledPlan.id, RAINBOW_LESSON_ID);
    assert.equal(rolledPlan.plan, "Pro");
    assert.equal(rolledPlan.status, "draft");
    assert.equal(rolledPlan.coverImageUrl, COVER_URL);
    assert.deepEqual(rolledPlan.resourceIds, [RESOURCE_ID]);
    assert.equal(rolledPlan.weeklyOverview, overviewBeforeReplace);
    const rolledActs = activeActivities(rollback.json, RAINBOW_LESSON_ID);
    const rolledRainbow = findActivity(rolledActs, "Rainbow Coffee Filter Art");
    assert.equal(rolledRainbow.id, rainbowActivityId);
    assert.equal(rolledRainbow.itemId, rainbowItemId);
    assert.equal(rolledRainbow.setupImageUrl, SETUP_URL);
    assert.equal(rolledRainbow.exampleImageUrl, EXAMPLE_URL);
    assert.equal(JSON.stringify(readVisualBriefs()), briefsBeforeRainbow);
    console.log("PASS  11  paste_replace rollback restores prior body, activities, images, resources, Free/Pro, cover; no auto-publish");

    const addPaste = `${updatedOverviewPaste}\n\n${RAINBOW_COFFEE_FILTER_ART_ACTIVITY
      .replace("Rainbow Coffee Filter Art", "Cloud Watching Walk")
      .replace("Weekday\nThursday", "Weekday\nMonday")
      .replace("Activity weekday\nThursday", "Activity weekday\nMonday")}`;
    const added = await replaceFromPaste(token, expectedUpdatedAt, RAINBOW_LESSON_ID, addPaste);
    assert.equal(added.saved.status, 200, added.saved.text);
    const addedActs = activeActivities(added.saved.json, RAINBOW_LESSON_ID);
    assert.equal(addedActs.length, 2);
    const keptRainbow = findActivity(addedActs, "Rainbow Coffee Filter Art");
    const newWalk = findActivity(addedActs, "Cloud Watching Walk");
    assert.equal(keptRainbow.id, rainbowActivityId);
    assert.equal(keptRainbow.setupImageUrl, SETUP_URL);
    assert.ok(newWalk?.id);
    assert.notEqual(newWalk.id, rainbowActivityId);
    assert.equal(added.saved.json.lessonPlan.plan, "Pro");
    assert.equal(added.saved.json.lessonPlan.status, "draft");
    console.log("PASS  10  new activities can be added without replacing matched IDs");

    const stealPaste = rainbowCoffeeFilterArtFixture().paste
      .replace("Rainbow Coffee Filter Art", "Puddle Splashing")
      .replace("Weekday\nThursday", "Weekday\nMonday")
      .replace("Activity weekday\nThursday", "Activity weekday\nMonday");
    const stealParsed = parseFullLessonStructurePaste(stealPaste);
    assert.equal(stealParsed.ok, true, stealParsed.errors.join("; "));
    const stealPlan = buildCanonicalLessonPlan(stealParsed, {
      id: RAINBOW_LESSON_ID,
      lastEditedBy: OWNER.email,
    });
    (stealPlan.dailyPlans.monday.items || []).forEach((item) => {
      item.itemId = keptRainbow.itemId;
    });
    expectedUpdatedAt = added.saved.json.siteContentUpdatedAt;
    const stolen = await replaceFromPaste(token, expectedUpdatedAt, RAINBOW_LESSON_ID, stealPaste, {
      lessonPlan: stealPlan,
    });
    assert.equal(stolen.saved.status, 200, stolen.saved.text);
    expectedUpdatedAt = stolen.saved.json.siteContentUpdatedAt;
    const stolenActs = activeActivities(stolen.saved.json, RAINBOW_LESSON_ID);
    const puddle = findActivity(stolenActs, "Puddle Splashing");
    assert.ok(puddle?.id);
    assert.notEqual(puddle.itemId, keptRainbow.itemId, "new activities must not reuse archived itemIds");
    assert.notEqual(puddle.id, keptRainbow.id);
    assert.match(puddle.itemId, /^item-/);
    const archivedRainbow = (stolen.saved.json.activities || []).find((item) => (
      item.lessonPlanId === RAINBOW_LESSON_ID && item.id === keptRainbow.id && item.status === "archived"
    ));
    assert.ok(archivedRainbow, "unmatched rainbow row stays archived");
    assert.equal(archivedRainbow.itemId, keptRainbow.itemId);
    assert.equal(archivedRainbow.setupImageUrl, SETUP_URL);
    assert.equal(archivedRainbow.exampleImageUrl, EXAMPLE_URL);
    assert.equal(archivedRainbow.setupMediaAssetId, SETUP_ASSET);
    assert.equal(archivedRainbow.exampleMediaAssetId, EXAMPLE_ASSET);
    console.log("PASS  7  new activities do not steal archived itemIds or images");

    const historyBeforeDouble = (stolen.saved.json.lessonPlan.enrichmentPublishHistory || [])
      .filter((item) => item.kind === "paste_replace");
    const stampForDouble = expectedUpdatedAt;
    const firstDup = await replaceFromPaste(
      token,
      stampForDouble,
      RAINBOW_LESSON_ID,
      rainbowCoffeeFilterArtFixture().paste,
    );
    assert.equal(firstDup.saved.status, 200, firstDup.saved.text);
    const historyAfterFirst = (firstDup.saved.json.lessonPlan.enrichmentPublishHistory || [])
      .filter((item) => item.kind === "paste_replace");
    const firstVersion = historyAfterFirst[0]?.versionId;
    assert.ok(firstVersion, "first replace writes a paste_replace snapshot");
    assert.equal(
      historyBeforeDouble.some((item) => item.versionId === firstVersion),
      false,
    );
    const secondDup = await replaceFromPaste(
      token,
      stampForDouble,
      RAINBOW_LESSON_ID,
      rainbowCoffeeFilterArtFixture().paste,
    );
    assert.equal(secondDup.saved.status, 409, secondDup.saved.text);
    assert.equal(secondDup.saved.json.conflict, true);
    const afterDouble = await requestJson("GET", "/api/admin/site-content", null, token);
    const afterDoublePlan = (afterDouble.json.siteContent?.curriculum?.lessonPlans || [])
      .find((item) => item.id === RAINBOW_LESSON_ID);
    const afterDoubleActs = (afterDouble.json.siteContent?.curriculum?.activities || [])
      .filter((item) => item.lessonPlanId === RAINBOW_LESSON_ID && item.status !== "archived");
    const afterDoubleArchived = (afterDouble.json.siteContent?.curriculum?.activities || [])
      .filter((item) => item.lessonPlanId === RAINBOW_LESSON_ID && item.status === "archived");
    const historyAfterDouble = (afterDoublePlan.enrichmentPublishHistory || [])
      .filter((item) => item.kind === "paste_replace");
    assert.equal(afterDoubleActs.length, activeActivities(firstDup.saved.json, RAINBOW_LESSON_ID).length);
    assert.deepEqual(
      historyAfterDouble.map((item) => item.versionId),
      historyAfterFirst.map((item) => item.versionId),
      "duplicate confirm must not write a second paste_replace snapshot",
    );
    assert.equal(
      afterDoubleArchived.filter((item) => item.id === keptRainbow.id).length,
      1,
      "duplicate confirm must not archive the same row twice as divergent copies",
    );
    expectedUpdatedAt = afterDouble.json.siteContent.updatedAt;
    console.log("PASS  13  sequential double-submit is rejected by expectedUpdatedAt; no duplicate activities or history");

    const parseFail = parseFullLessonStructurePaste("this is not a master lesson paste");
    assert.equal(parseFail.ok, false);
    const afterParseFail = await requestJson("GET", "/api/admin/site-content", null, token);
    assert.equal(
      (afterParseFail.json.siteContent?.curriculum?.lessonPlans || []).find((item) => item.id === RAINBOW_LESSON_ID).id,
      RAINBOW_LESSON_ID,
    );
    console.log("PASS  12  parse failure does not call replace and makes zero changes");
  } finally {
    await stopServer(child);
  }
}

async function runAuthorizationTest() {
  writeEmptyStore();
  const child = startServer(STAFF, { enforceOwner: true });
  try {
    await waitForBoot(child);
    const token = await login(STAFF);
    const expectedUpdatedAt = await stamp(token);
    const parsed = parseFullLessonStructurePaste(rainbowCoffeeFilterArtFixture().paste);
    const plan = buildCanonicalLessonPlan(parsed, { id: "cur-lp-missing", lastEditedBy: STAFF.email });
    const denied = await requestJson("POST", "/api/admin/curriculum/lesson-plans/replace-from-master-paste", {
      expectedUpdatedAt,
      saveMode: "replace_from_master_paste",
      lessonPlan: { ...plan, id: "cur-lp-missing" },
    }, token);
    assert.equal(denied.status, 403, denied.text);
    assert.equal(denied.json.code, "teaching_kit_owner_required");
    console.log("PASS  H  non-owner cannot call replace-from-master-paste");
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

async function main() {
  assertStaticContract();
  assertParserIsSharedForCreateAndReplace();
  assertActivityMatchingUnit();
  await runOwnerReplaceTests();
  await runAuthorizationTest();
  console.log("\nAll master-lesson paste replace tests passed.");
}

main().catch((error) => {
  console.error("\nFAIL", error);
  process.exitCode = 1;
});
