#!/usr/bin/env node
/**
 * Master lesson paste persistence: Paste → Preview → Apply → Save Draft → Reload.
 * Disposable fixture only. Does not publish, merge, or deploy.
 * Run: npm run test:master-lesson-paste-persistence
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
const pasteImport = require("./teaching-kit-paste-import.js");

const ROOT = path.join(__dirname, "..");
const PORT = 20560 + Math.floor(Math.random() * 80);
const BASE = `http://127.0.0.1:${PORT}`;
const STORE_PATH = path.join(os.tmpdir(), `llh-master-paste-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "leahivie@icloud.com",
  password: "master-paste-pass",
  code: "master-paste-code",
};
const TINY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const TITLE = "MASTER PASTE PERSISTENCE TEST — DO NOT PUBLISH";
const AGE = "Toddler 24–36 Months";

const IDS = {
  exactId: `cur-res-master-exact-${crypto.randomBytes(3).toString("hex")}`,
  titleMatch: `cur-res-master-title-${crypto.randomBytes(3).toString("hex")}`,
  already: `cur-res-master-already-${crypto.randomBytes(3).toString("hex")}`,
  extraLink: `cur-res-master-extra-${crypto.randomBytes(3).toString("hex")}`,
  amb1: `cur-res-master-amb-a-${crypto.randomBytes(3).toString("hex")}`,
  amb2: `cur-res-master-amb-b-${crypto.randomBytes(3).toString("hex")}`,
};
const TITLES = {
  exactId: "Master Paste Exact ID Resource",
  titleMatch: "Master Paste Exact Title Resource",
  already: "Already Linked Paste Resource",
  extraLink: "Partial Update Extra Linked Resource",
  ambiguous: "Shared Ambiguous Paste Resource",
  missing: "Not A Real Master Paste Resource",
};

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

function masterPasteText() {
  return `Lesson title:
${TITLE}

Age band:
${AGE}

Cover image URL:
https://example.invalid/cover.png

Cover alt:
Toddlers choosing feeling faces at circle time

Cover image position:
center

Cover quality:
needs_upgrade

Weekly overview:
Children will name simple feelings, practice calm bodies, and use gentle hands with friends.

Learning objectives:
Name a feeling with a picture card
Practice a calm body
Use gentle hands with friends

Materials list:
Feeling faces
Soft puppets
Calm choice cards

Teacher preparation / Toolkit:
Prepare a calm corner and keep feeling cards within reach.

Prep checklist:
Print feeling cards
Set out puppets

Observation focus:
Naming feelings
Seeking adult help

Family connection:
Invite families to name one feeling at home this week.

Milestones:
Social-emotional
Language
Quantum feelings

Monday:
Activity name: Feelings Check-In
Weekday: Monday
Category / developmental domain: Circle Time
Recommended age: 2-3 years
Estimated duration: 8
Activity objective: Name a feeling at arrival.
What children will do: Point to a feeling face that matches their body.
Materials:
Feeling cards
Teacher preparation: Spread cards on the rug before children arrive.
Setup: Place six feeling cards in a circle on the rug.
Step-by-step directions:
Invite each child to point to a card.
Name the feeling with them.
Suggested questions to ask:
Which face matches your body?
Learning and observation focus: Notice whether children point independently.
Safety and supervision: Keep cards large enough that they are not a choking hazard.
Cleanup: Collect cards into the feelings basket.
Indoor option: Stay on the rug if weather is wet.
Outdoor option: Take cards to the porch if the day is calm.
Teacher tips:
Keep the check-in under eight minutes.
Supply substitutions:
If missing: Feeling cards → Use instead: Paper faces
Support adaptations: Offer a pointing stick for children who do not want to touch cards.
Added challenge: Invite a child to name a friend's feeling.
Mixed-age adaptations: Infants watch; older toddlers name two feelings.
Observation prompts:
Does the child point without a prompt?
Vocabulary:
happy
sad
calm
Image requirement: Setup + finished example
Setup example brief: Cards in a circle on a rug.
Finished example brief: Child pointing to a happy card.

Activity name: Mirror Faces
Category: Literacy
Activity objective: Copy a feeling face.
What children will do: Look in a mirror and copy a face.

Tuesday:
Activity name: Puppet Feelings
Category: Dramatic Play
Activity objective: Hear a feeling story.
What children will do: Watch a puppet name a feeling.
Setup photo:
https://example.invalid/setup.jpg
Finished example photo:
https://example.invalid/finished.jpg

Activity name: Soft Hug Practice
Category: Fine Motor
Activity objective: Use gentle hands.
What children will do: Practice a gentle hug with a puppet.

Wednesday:
Activity name: Calm Choice Walk
Category: Gross Motor
Activity objective: Choose a calm action.
What children will do: Pick a card and try the action.

Activity name: Feeling Song Circle
Category: Music & Movement
Activity objective: Sing a feeling song.
What children will do: Move with the song.

Thursday:
Activity name: Color Monster Look
Category: Literacy
Activity objective: Notice a feeling in a book.
What children will do: Look at pictures.

Activity name: Heart Hands
Category: Art
Activity objective: Make a heart with hands.
What children will do: Press hands together.

Friday:
Activity name: Helping Hands Puppet Play
Category: Dramatic Play
Activity objective: Help a friend puppet.
What children will do: Offer a puppet a hug.
Vocabulary:
help
friend
gentle
Image requirement: Finished example only

Activity name: Calm Goodbye
Category: Circle Time
Activity objective: End with a calm body.
What children will do: Take a slow breath.

Books:
Book title: The Color Monster
Author: Anna Llenas
Why this book: Supports simple conversations about different emotions.
Discussion questions:
What feeling do you see?
What does your face look like when you feel happy?
Suggested weekday: Monday
Teacher notes:
Do not store this book note.
Book URL:
https://example.invalid/color-monster

Book title: In My Heart
Author: Jo Witek
Why it fits: Gives children simple language for describing feelings.
Book questions:
What feeling is the character having?
Can you show that feeling with your face?
Suggested weekday: Wednesday

Book title: The Way I Feel
Author: Janan Cain
Why this book: Names everyday feelings with clear pictures.
Discussion questions:
Which feeling did we see today?
Suggested weekday: Friday

Songs:
Song title: If You're Happy and You Know It
Rights / licensing: public_domain
Lyrics:
If you're happy and you know it clap your hands.
Movement / action prompts: Clap, stomp, and tap knees.
Suggested use: Change the feeling and action during each verse.
Teacher directions: Use familiar movements and allow children to participate through gestures.
Linked weekday: Monday
Tune:
London Bridge
Song URL:
https://example.invalid/happy-song

Song title: Breathe In, Breathe Out
Rights status: original
Lyrics:
Breathe in slow.
Breathe out slow.
My body can rest.
Movement / action prompts: Hands on belly, slow breath.
Suggested use: A short teacher-led calming chant.
Teacher directions: Model one slow breath before children join.
Linked weekday: Wednesday

Song title: Hello Feelings
Rights: traditional
Lyrics:
Hello happy, hello sad, we can name the feelings that we had.
Movement / action prompts: Wave hello for each feeling.
Suggested use: Greeting circle.
Teacher directions: Hold up one card per verse.
Linked weekday: Friday

Printable Ideas:
Idea title: My Feelings Cards
Type: Visual cards
Purpose / description: Simple emotion faces children can point to.
Instructions: Print, cut apart, and use during circle time or one-on-one conversations.
Notes: Keep extras in the calm corner.

Idea title: Calm Choice Cards
Type: Choice board
Purpose / description: Pictures of calm actions children can choose.
Instructions: Print and offer two choices when a child needs a reset.
Notes: Laminate if possible.

Idea title: Family Feelings Mini Book
Type: Take-home
Purpose / description: A tiny book families can look at together.
Instructions: Fold one sheet into a four-page mini book.
Notes: Send home on Friday.

Linked resources:
Linked resource:
${IDS.exactId}

Linked resource:
${TITLES.titleMatch}

Linked resource:
${TITLES.already}

Linked resource:
${TITLES.missing}

Linked resource:
${TITLES.ambiguous}

Printable name:
Feelings Choice Cards
Printable description:
Visual emotion choices for toddlers.
Printable cover image URL:
https://example.invalid/feelings-cover.png
Printable PDF:
feelings-choice-cards.pdf
Resource placement:
Lesson Printables
`;
}

function flattenItems(plan) {
  const out = [];
  ["monday", "tuesday", "wednesday", "thursday", "friday"].forEach((day) => {
    (plan?.dailyPlans?.[day]?.items || []).forEach((item) => out.push({ ...item, dayOfWeek: day }));
  });
  return out;
}

function findItem(plan, title) {
  return flattenItems(plan).find((item) => item.title === title) || null;
}

function weekOf(plan) {
  return plan?.enrichmentDraft?.week || {};
}

function requestCatalog(token) {
  return requestJson("GET", "/api/admin/site-content", null, token);
}

async function adminLogin() {
  const res = await requestJson("POST", "/api/admin/login", {
    email: ADMIN.email,
    password: ADMIN.password,
    code: ADMIN.code,
  });
  assert.equal(res.status, 200, res.text);
  return res.json.token;
}

async function stamp(token) {
  const res = await requestCatalog(token);
  assert.equal(res.status, 200, res.text);
  return res.json.siteContent?.updatedAt || "";
}

async function saveLesson(token, lessonPlan, expectedUpdatedAt) {
  return requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    expectedUpdatedAt,
    lessonPlan,
  }, token);
}

async function saveResource(token, resource, expectedUpdatedAt) {
  return requestJson("POST", "/api/admin/curriculum/resources/save", {
    expectedUpdatedAt,
    resource,
  }, token);
}

async function linkResource(token, resourceId, lessonPlanId, expectedUpdatedAt) {
  return requestJson("POST", "/api/admin/curriculum/resources/link", {
    expectedUpdatedAt,
    resourceId,
    lessonPlanId,
  }, token);
}

async function loadLesson(token, id) {
  const res = await requestCatalog(token);
  assert.equal(res.status, 200, res.text);
  const plan = (res.json.siteContent?.curriculum?.lessonPlans || []).find((item) => item.id === id);
  const activities = (res.json.siteContent?.curriculum?.activities || []).filter((item) => item.lessonPlanId === id);
  const resources = res.json.siteContent?.curriculum?.resources || [];
  return { plan, activities, resources, site: res.json.siteContent, updatedAt: res.json.siteContent?.updatedAt };
}

function idsSnapshot(site) {
  return {
    lessonIds: (site?.curriculum?.lessonPlans || []).map((item) => item.id).sort(),
    resourceIds: (site?.curriculum?.resources || []).map((item) => item.id).sort(),
  };
}

function matrixRow(rows, ui, canonical, pasted, applied, reloaded) {
  const pass = Object.is(applied, pasted) === false
    ? String(applied ?? "") === String(pasted ?? "") && String(reloaded ?? "") === String(applied ?? "")
    : String(reloaded ?? "") === String(applied ?? "") && String(applied ?? "") === String(pasted ?? "");
  const ok = String(reloaded ?? "") === String(pasted ?? "") || (
    Array.isArray(pasted) && JSON.stringify(reloaded) === JSON.stringify(applied) && JSON.stringify(applied) === JSON.stringify(pasted)
  );
  const equal = JSON.stringify(applied) === JSON.stringify(pasted)
    && JSON.stringify(reloaded) === JSON.stringify(applied);
  rows.push({
    ui,
    canonical,
    pasted,
    applied,
    reloaded,
    result: equal ? "PASS" : "FAIL",
  });
  if (!equal) {
    console.error(`FAIL  ${ui} (${canonical})\n    pasted: ${JSON.stringify(pasted)}\n    applied: ${JSON.stringify(applied)}\n    reloaded: ${JSON.stringify(reloaded)}`);
  }
  return equal;
}

async function run() {
  const child = startServer();
  const matrix = [];
  let failures = 0;
  try {
    await waitForBoot(child);
    const token = await adminLogin();
    let expectedUpdatedAt = await stamp(token);

    async function seedResource(id, title) {
      const res = await saveResource(token, {
        id,
        title,
        resourceCategory: "Printables",
        resourceType: "Printable",
        fileData: TINY_PNG,
        fileName: `${id}.png`,
        mimeType: "image/png",
        status: "draft",
        disposableQaFixture: true,
      }, expectedUpdatedAt);
      assert.equal(res.status, 200, res.text);
      expectedUpdatedAt = res.json.siteContentUpdatedAt;
      return res.json.resource || res.json.curriculum?.resources?.find((item) => item.id === id);
    }

    await seedResource(IDS.exactId, TITLES.exactId);
    await seedResource(IDS.titleMatch, TITLES.titleMatch);
    await seedResource(IDS.already, TITLES.already);
    await seedResource(IDS.extraLink, TITLES.extraLink);
    await seedResource(IDS.amb1, TITLES.ambiguous);
    await seedResource(IDS.amb2, TITLES.ambiguous);

    const stub = await saveLesson(token, {
      title: `${TITLE} STUB`,
      age: AGE,
      status: "draft",
      plan: "Free",
      disposableQaFixture: true,
      weeklyOverview: "stub",
      dailyPlans: {
        monday: { items: [] },
        tuesday: { items: [] },
        wednesday: { items: [] },
        thursday: { items: [] },
        friday: { items: [] },
      },
      resourceIds: [],
    }, expectedUpdatedAt);
    assert.equal(stub.status, 200, stub.text);
    const lessonId = stub.json.lessonPlan.id;
    expectedUpdatedAt = stub.json.siteContentUpdatedAt;

    const linkedC = await linkResource(token, IDS.already, lessonId, expectedUpdatedAt);
    assert.equal(linkedC.status, 200, linkedC.text);
    expectedUpdatedAt = linkedC.json.siteContentUpdatedAt;

    const beforePreview = await loadLesson(token, lessonId);
    const beforeSnap = idsSnapshot(beforePreview.site);
    const existingResources = beforePreview.resources.map((item) => ({
      id: item.id,
      title: item.title,
      resourceCategory: item.resourceCategory,
      resourceType: item.resourceType,
    }));

    const paste = masterPasteText();
    const parsed = parseFullLessonStructurePaste(paste, {
      existingResources,
      existingLesson: beforePreview.plan,
    });
    assert.equal(parsed.ok, true, parsed.errors.join("; "));
    const preview = buildStructurePreview(parsed);
    const afterPreview = await loadLesson(token, lessonId);
    const afterSnap = idsSnapshot(afterPreview.site);
    assert.deepEqual(afterSnap, beforeSnap, "Preview must make zero writes");
    console.log("PASS  preview zero-write");

    assert.equal(preview.byDay.monday.length, 2);
    assert.equal(preview.byDay.tuesday.length, 2);
    assert.equal(preview.byDay.wednesday.length, 2);
    assert.equal(preview.byDay.thursday.length, 2);
    assert.equal(preview.byDay.friday.length, 2);
    assert.equal(preview.books.length, 3);
    assert.equal(preview.songs.length, 3);
    assert.equal(preview.printableIdeas.length, 3);
    assert.equal(preview.linkedResources.resolved.length, 2, JSON.stringify(preview.linkedResources));
    assert.equal(preview.linkedResources.alreadyLinked.length, 1);
    assert.equal(preview.linkedResources.unresolved.length, 1);
    assert.equal(preview.linkedResources.ambiguous.length, 1);
    assert.equal(preview.pendingPrintables.length, 1);
    assert.equal(preview.pendingPrintables[0].title, "Feelings Choice Cards");
    assert.equal(preview.pendingPrintables[0].existingResource, "none");
    assert.equal(preview.pendingPrintables[0].pdfUploadRequired, true);
    assert.equal(preview.pendingPrintables[0].coverDetected, true);
    assert.match(preview.pendingPrintables[0].actionRequired, /Create \/ Upload Printable/);
    assert.ok(preview.activityMediaWarnings.some((row) => row.kind === "setup" && /setup\.jpg/.test(row.raw)));
    assert.ok(preview.activityMediaWarnings.some((row) => row.kind === "finished" && /finished\.jpg/.test(row.raw)));
    assert.ok(preview.unrecognized.some((row) => /teacher notes/i.test(row.heading || "") || /book url/i.test(row.heading || "")));
    assert.ok(preview.unrecognized.some((row) => /tune/i.test(row.heading || "") || /song url/i.test(row.heading || "")));
    assert.ok(preview.rejectedMilestones.includes("Quantum feelings"));
    console.log("PASS  preview counts + unsupported + pending printable + photo warnings");

    const applied = buildCanonicalLessonPlan(parsed, { id: lessonId, lastEditedBy: ADMIN.email });
    applied.disposableQaFixture = true;
    applied.status = "draft";
    applied.resourceIds = [IDS.already];
    const puppet = findItem(applied, "Puppet Feelings");
    assert.ok(!puppet?.setupImageUrl, "setup photo URL must not be written");
    assert.ok(!puppet?.exampleImageUrl, "finished photo URL must not be written");
    assert.ok(!puppet?.setupImageUpload, "upload-ref object must not persist on apply");

    const saved = await saveLesson(token, applied, expectedUpdatedAt);
    assert.equal(saved.status, 200, saved.text);
    expectedUpdatedAt = saved.json.siteContentUpdatedAt;
    assert.equal(saved.json.lessonPlan.status, "draft");
    assert.equal(saved.json.lessonPlan.title, TITLE);

    for (const row of parsed.linkedResources.resolved) {
      if (row.alreadyLinked) continue;
      const link = await linkResource(token, row.resource.id, lessonId, expectedUpdatedAt);
      assert.equal(link.status, 200, link.text);
      expectedUpdatedAt = link.json.siteContentUpdatedAt;
    }

    const reloadedBundle = await loadLesson(token, lessonId);
    const reloaded = reloadedBundle.plan;
    assert.ok(reloaded, "draft reloads from admin site-content");
    assert.equal(reloaded.status, "draft");
    const pub = await requestJson("GET", "/api/site-content");
    const publicIds = (pub.json.siteContent?.curriculumLibrary?.lessonPlans || pub.json.curriculumLibrary?.lessonPlans || []).map((item) => item.id);
    assert.ok(!publicIds.includes(lessonId), "draft must not be customer-visible");

    const weekApplied = weekOf(applied);
    const weekReloaded = weekOf(reloaded);
    const check = (...args) => {
      if (!matrixRow(matrix, ...args)) failures += 1;
    };

    check("Lesson title", "plan.title", TITLE, applied.title, reloaded.title);
    check("Age band", "plan.age", AGE, applied.age, reloaded.age);
    check("Cover image URL", "plan.coverImageUrl", "https://example.invalid/cover.png", applied.coverImageUrl, reloaded.coverImageUrl);
    check("Cover alt", "plan.coverImageAlt", "Toddlers choosing feeling faces at circle time", applied.coverImageAlt, reloaded.coverImageAlt);
    check("Cover position", "plan.coverImagePosition", "center", applied.coverImagePosition, reloaded.coverImagePosition);
    check("Cover quality", "plan.coverQualityStatus", "needs_upgrade", applied.coverQualityStatus, reloaded.coverQualityStatus);
    check("Weekly overview", "plan.weeklyOverview", parsed.lesson.weeklyOverview, applied.weeklyOverview, reloaded.weeklyOverview);
    check("Learning objectives", "plan.objectives", parsed.lesson.objectives, applied.objectives, reloaded.objectives);
    check("Materials list", "plan.weeklyMaterials", parsed.lesson.weeklyMaterials, applied.weeklyMaterials, reloaded.weeklyMaterials);
    check("Teacher preparation", "week.teacherPreparation", parsed.lesson.teacherPreparation, weekApplied.teacherPreparation, weekReloaded.teacherPreparation);
    check("Prep checklist", "week.teacherToolkit.prepChecklist", parsed.lesson.prepChecklist, weekApplied.teacherToolkit?.prepChecklist, weekReloaded.teacherToolkit?.prepChecklist);
    check("Observation focus", "week.teacherToolkit.observationFocus", parsed.lesson.observationFocus, weekApplied.teacherToolkit?.observationFocus, weekReloaded.teacherToolkit?.observationFocus);
    check("Family connection", "plan.familyConnection", parsed.lesson.familyConnection, applied.familyConnection, reloaded.familyConnection);
    check("Milestones", "week.milestones", parsed.lesson.milestones, weekApplied.milestones, weekReloaded.milestones);

    const activityChecks = [
      ["Feelings Check-In", "title", "title"],
      ["Feelings Check-In", "activityCategory", "activityCategory"],
      ["Feelings Check-In", "ageModifications", "ageModifications"],
      ["Feelings Check-In", "durationMinutes", "durationMinutes"],
      ["Feelings Check-In", "objective", "objective"],
      ["Feelings Check-In", "description", "description"],
      ["Feelings Check-In", "materials", "materials"],
      ["Feelings Check-In", "preparation", "preparation"],
      ["Feelings Check-In", "setup", "setup"],
      ["Feelings Check-In", "steps", "steps"],
      ["Feelings Check-In", "teacherLanguage", "teacherLanguage"],
      ["Feelings Check-In", "observationOpportunities", "observationOpportunities"],
      ["Feelings Check-In", "safetyNotes", "safetyNotes"],
      ["Feelings Check-In", "cleanupTips", "cleanupTips"],
      ["Feelings Check-In", "indoorAlternatives", "indoorAlternatives"],
      ["Feelings Check-In", "outdoorAlternatives", "outdoorAlternatives"],
      ["Feelings Check-In", "teacherTips", "teacherTips"],
      ["Feelings Check-In", "substitutions", "substitutions"],
      ["Feelings Check-In", "adaptations", "adaptations"],
      ["Feelings Check-In", "extensions", "extensions"],
      ["Feelings Check-In", "mixedAgeAdaptations", "mixedAgeAdaptations"],
      ["Feelings Check-In", "observationPrompts", "observationPrompts"],
      ["Feelings Check-In", "vocabulary", "vocabulary"],
      ["Feelings Check-In", "imageRequirement", "imageRequirement"],
      ["Feelings Check-In", "imageBriefSetup", "imageBriefSetup"],
      ["Feelings Check-In", "imageBriefExample", "imageBriefExample"],
      ["Mirror Faces", "objective", "objective"],
      ["Puppet Feelings", "activityCategory", "activityCategory"],
      ["Soft Hug Practice", "activityCategory", "activityCategory"],
      ["Calm Choice Walk", "activityCategory", "activityCategory"],
      ["Feeling Song Circle", "activityCategory", "activityCategory"],
      ["Color Monster Look", "activityCategory", "activityCategory"],
      ["Heart Hands", "activityCategory", "activityCategory"],
      ["Helping Hands Puppet Play", "vocabulary", "vocabulary"],
      ["Helping Hands Puppet Play", "imageRequirement", "imageRequirement"],
      ["Calm Goodbye", "objective", "objective"],
    ];
    let activityPass = 0;
    activityChecks.forEach(([title, ui, key]) => {
      const parsedItem = findItem({ dailyPlans: parsed.dailyPlans }, title);
      const appliedItem = findItem(applied, title);
      const reloadedItem = findItem(reloaded, title);
      const ok = matrixRow(
        matrix,
        `Activity ${title} ${ui}`,
        `dailyPlans.items.${key}`,
        parsedItem?.[key],
        appliedItem?.[key],
        reloadedItem?.[key],
      );
      if (ok) activityPass += 1;
      else failures += 1;
    });
    ["monday", "tuesday", "wednesday", "thursday", "friday"].forEach((day) => {
      const ok = matrixRow(
        matrix,
        `${day} activity count`,
        `dailyPlans.${day}.items.length`,
        parsed.dailyPlans[day].items.length,
        applied.dailyPlans[day].items.length,
        reloaded.dailyPlans[day].items.length,
      );
      if (!ok) failures += 1;
    });

    const bookPassExpected = 3 * 5;
    let bookPass = 0;
    parsed.books.forEach((book, index) => {
      ["title", "author", "whyThisBook", "questions", "suggestedWeekday"].forEach((key) => {
        const ok = matrixRow(
          matrix,
          `Book ${index + 1} ${key}`,
          `enrichmentDraft.week.books[${index}].${key}`,
          book[key],
          weekApplied.books?.[index]?.[key],
          weekReloaded.books?.[index]?.[key],
        );
        if (ok) bookPass += 1;
        else failures += 1;
      });
    });
    assert.equal(weekReloaded.books?.length, 3);
    assert.doesNotMatch(JSON.stringify(weekReloaded.books || []), /Do not store this book note/);
    assert.doesNotMatch(JSON.stringify(weekReloaded.books || []), /example\.invalid\/color-monster/);

    let songPass = 0;
    parsed.songs.forEach((song, index) => {
      ["title", "rightsStatus", "lyrics", "motions", "whenToUse", "teacherDirections", "linkedWeekday"].forEach((key) => {
        const ok = matrixRow(
          matrix,
          `Song ${index + 1} ${key}`,
          `enrichmentDraft.week.songs[${index}].${key}`,
          song[key],
          weekApplied.songs?.[index]?.[key],
          weekReloaded.songs?.[index]?.[key],
        );
        if (ok) songPass += 1;
        else failures += 1;
      });
    });
    assert.equal(weekReloaded.songs?.length, 3);
    assert.doesNotMatch(JSON.stringify(weekReloaded.songs || []), /London Bridge/);
    assert.doesNotMatch(JSON.stringify(weekReloaded.songs || []), /example\.invalid\/happy-song/);

    let ideaPass = 0;
    parsed.printableIdeas.forEach((idea, index) => {
      ["title", "type", "purpose", "instructions", "notes"].forEach((key) => {
        const ok = matrixRow(
          matrix,
          `Printable idea ${index + 1} ${key}`,
          `enrichmentDraft.week.printableIdeas[${index}].${key}`,
          idea[key],
          weekApplied.printableIdeas?.[index]?.[key],
          weekReloaded.printableIdeas?.[index]?.[key],
        );
        if (ok) ideaPass += 1;
        else failures += 1;
      });
    });
    assert.equal(weekReloaded.printableIdeas?.length, 3);

    const linkedIds = reloaded.resourceIds || [];
    assert.ok(linkedIds.includes(IDS.exactId), "exact id linked");
    assert.ok(linkedIds.includes(IDS.titleMatch), "exact title linked");
    assert.ok(linkedIds.includes(IDS.already), "already-linked remains");
    assert.equal(linkedIds.filter((id) => id === IDS.already).length, 1, "no duplicate already-linked");
    assert.ok(!linkedIds.includes(IDS.amb1) && !linkedIds.includes(IDS.amb2), "ambiguous not guessed");
    const missingResource = reloadedBundle.resources.find((item) => item.title === TITLES.missing);
    assert.ok(!missingResource, "unresolved resource was not created");
    const feelings = reloadedBundle.resources.find((item) => /Feelings Choice Cards/i.test(item.title || ""));
    assert.ok(!feelings, "pending printable did not create a resource");
    const puppetReloaded = findItem(reloaded, "Puppet Feelings");
    assert.ok(!puppetReloaded?.setupImageUrl);
    assert.ok(!puppetReloaded?.exampleImageUrl);
    const pdfCreated = reloadedBundle.resources.some((item) => /feelings-choice-cards\.pdf/i.test(JSON.stringify(item)));
    assert.ok(!pdfCreated, "no PDF created from filename");
    console.log("PASS  linked resources + no fake media/PDF");

    async function saveDraftReload(nextPlan) {
      const res = await saveLesson(token, { ...nextPlan, id: lessonId, status: "draft", disposableQaFixture: true }, expectedUpdatedAt);
      assert.equal(res.status, 200, res.text);
      expectedUpdatedAt = res.json.siteContentUpdatedAt;
      const loaded = await loadLesson(token, lessonId);
      assert.equal(loaded.plan.status, "draft");
      return loaded.plan;
    }

    const familyOnly = pasteImport.buildWeekPreview(
      "Family connection:\nAsk families to share one calm song from home.",
      weekReloaded,
      reloaded,
    );
    const familyApplied = pasteImport.applyPreviewToDraft(reloaded.enrichmentDraft, familyOnly);
    let next = await saveDraftReload({
      ...reloaded,
      familyConnection: "Ask families to share one calm song from home.",
      enrichmentDraft: familyApplied.draft,
    });
    assert.match(next.familyConnection, /calm song from home/);
    assert.equal(flattenItems(next).length, 10, "family-only does not erase activities");
    assert.equal(weekOf(next).songs.length, 3, "family-only does not erase songs");
    console.log("PASS  partial A family connection");

    const bookOnly = pasteImport.buildWeekPreview(
      "Books:\nBook title: Hands Are Not for Hitting\nAuthor: Martine Agassi\nWhy this book: Gentle hands language.\nDiscussion questions:\nHow can hands be kind?\nSuggested weekday: Tuesday\n",
      weekOf(next),
      next,
    );
    const bookApplied = pasteImport.applyPreviewToDraft(next.enrichmentDraft, bookOnly);
    next = await saveDraftReload({ ...next, enrichmentDraft: bookApplied.draft });
    assert.equal(weekOf(next).books.length, 4);
    assert.equal(weekOf(next).songs.length, 3, "books-only does not erase songs");
    console.log("PASS  partial B one book");

    const songOnly = pasteImport.buildWeekPreview(
      "Songs:\nSong title: Twinkle Calm\nRights status: public_domain\nLyrics:\nTwinkle twinkle little star.\nSuggested use: Rest time.\nTeacher directions: Whisper the last line.\nLinked weekday: Thursday\n",
      weekOf(next),
      next,
    );
    const songApplied = pasteImport.applyPreviewToDraft(next.enrichmentDraft, songOnly);
    next = await saveDraftReload({ ...next, enrichmentDraft: songApplied.draft });
    assert.equal(weekOf(next).songs.length, 4);
    assert.equal(weekOf(next).books.length, 4, "songs-only does not erase books");
    console.log("PASS  partial C one song");

    const ideaOnly = pasteImport.buildWeekPreview(
      "Printable Ideas:\nIdea title: Feeling Thermometer\nType: Visual\nPurpose / description: Show big and small feelings.\nInstructions: Color the thermometer together.\nNotes: Use at rest time.\n",
      weekOf(next),
      next,
    );
    const ideaApplied = pasteImport.applyPreviewToDraft(next.enrichmentDraft, ideaOnly);
    next = await saveDraftReload({ ...next, enrichmentDraft: ideaApplied.draft });
    assert.equal(weekOf(next).printableIdeas.length, 4);
    assert.ok(!(next.resourceIds || []).some((id) => !linkedIds.includes(id) && id !== IDS.extraLink));
    console.log("PASS  partial D printable idea (no resource created)");

    const linkPreview = pasteImport.buildWeekPreview(
      `Linked resources:\nLinked resource:\n${TITLES.extraLink}\n`,
      weekOf(next),
      next,
      { existingResources: (await loadLesson(token, lessonId)).resources, existingResourceIds: next.resourceIds },
    );
    const linkChange = (linkPreview.fieldChanges || []).find((row) => row.fieldId === "linkedResources");
    const extraResolved = (linkChange?.resolved || []).find((row) => row.resource?.id === IDS.extraLink && !row.alreadyLinked);
    assert.ok(extraResolved, "partial E resolves extra resource by exact title");
    const extraLink = await linkResource(token, IDS.extraLink, lessonId, expectedUpdatedAt);
    assert.equal(extraLink.status, 200, extraLink.text);
    expectedUpdatedAt = extraLink.json.siteContentUpdatedAt;
    next = (await loadLesson(token, lessonId)).plan;
    const afterExtra = next.resourceIds || [];
    assert.ok(afterExtra.includes(IDS.extraLink));
    assert.equal(afterExtra.filter((id) => id === IDS.already).length, 1);
    assert.ok(afterExtra.includes(IDS.exactId) && afterExtra.includes(IDS.titleMatch));
    console.log("PASS  partial E linked resource without duplicates");

    const checkIn = findItem(next, "Feelings Check-In");
    const actPreview = pasteImport.buildActivityPreview(
      "Teacher tips:\nPause after each child's turn.\n",
      checkIn,
      (next.enrichmentDraft?.activities || {})[checkIn.itemId] || {},
      checkIn.itemId,
    );
    const actApplied = pasteImport.applyPreviewToDraft(next.enrichmentDraft, actPreview);
    next = await saveDraftReload({ ...next, enrichmentDraft: actApplied.draft });
    const tips = (next.enrichmentDraft?.activities || {})[checkIn.itemId]?.teacherTips || [];
    assert.ok(tips.some((line) => /Pause after each/.test(line)), "teacher tips applied");
    const still = findItem(next, "Feelings Check-In");
    assert.match(still.materials || "", /Feeling cards/);
    assert.match(still.setup || "", /six feeling cards/i);
    assert.match(still.teacherLanguage || "", /Which face matches/);
    assert.ok(!still.setupImageUrl);
    console.log("PASS  partial F activity teacher tips preserves other fields");

    if (failures) {
      console.error(`Master persistence matrix failures: ${failures}`);
      process.exitCode = 1;
    } else {
      console.log(`PASS  field matrix ${matrix.filter((row) => row.result === "PASS").length}/${matrix.length}`);
      console.log(`PASS  activity coverage ${activityPass}/${activityChecks.length}`);
      console.log(`PASS  book coverage ${bookPass}/${bookPassExpected}`);
      console.log(`PASS  song coverage ${songPass}/21`);
      console.log(`PASS  printable idea coverage ${ideaPass}/15`);
      console.log("MASTER LESSON PASTE PERSISTENCE: YES");
    }
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
