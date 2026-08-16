#!/usr/bin/env node
/**
 * Owner Admin Create New Lesson Plan + Paste Full Lesson Plan structure builder.
 * Run: npm run test:create-new-lesson-plan
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
  buildBlankLessonPlan,
  findDuplicateLessonTitle,
  resolveAgeBandAlias,
  CANONICAL_AGE_BAND_LABELS,
} = require("./curriculum-lesson-structure-paste.js");
const pasteImport = require("./teaching-kit-paste-import.js");

const ROOT = path.join(__dirname, "..");
const PORT = 20480 + Math.floor(Math.random() * 80);
const BASE = `http://127.0.0.1:${PORT}`;
const STORE_PATH = path.join(os.tmpdir(), `llh-create-lesson-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "leahivie@icloud.com",
  password: "create-lesson-pass",
  code: "create-lesson-code",
};

const SAMPLE_PASTE = `Lesson title:
Baby Moves & Discovers

Age band:
Infant 0–6 Months

Weekly overview:
Babies will explore movement, sounds, textures, colors, faces, and early creative experiences through short, responsive play opportunities designed for infants.

Learning objectives:
Support visual attention and tracking
Encourage reaching and grasping
Build early gross-motor skills
Encourage sensory exploration
Support caregiver-child interaction
Introduce early cause and effect
Encourage listening and language development

Materials list:
Tummy-time mats
Baby-safe mirrors
Colorful scarves
Soft rattles
Texture materials
Board books
Washable art materials

Teacher preparation:
Prepare clean infant-safe floor spaces and inspect all materials before use. Keep activities brief, responsive, and continuously supervised.

Family connection:
Encourage families to repeat favorite songs, movement games, visual-tracking experiences, and simple sensory play at home.

Milestones:
Gross motor
Fine motor
Language
Social-emotional
Creativity

Activities:

Monday:
Color Scarf Tracking
Hello, Baby! Mirror Play

Tuesday:
Shake, Listen & Find
Little Hands Texture Discovery
Wiggle, Kick & Sing

Wednesday:
Where Did You Go? Peekaboo
Move With Me: Up, Down & Around
Look With Me: Baby Book Time

Thursday:
Mess-Free Color Squish
Reach, Touch & Grasp
Where's That Sound?

Friday:
Outdoor Sights & Sounds
Tiny Toes Art Prints
Tummy-Time Toy Discovery
`;

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

function assertStaticContract() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const pasteSrc = fs.readFileSync(path.join(ROOT, "scripts/curriculum-lesson-structure-paste.js"), "utf8");
  assert.match(appJs, /function createAdminCurriculumLessonPlan\(/);
  assert.match(appJs, /function persistNewCurriculumLessonDraft\(/);
  assert.match(appJs, /data-create-lesson-start-blank/);
  assert.match(appJs, /data-create-lesson-paste/);
  assert.match(appJs, /Create Draft Lesson/);
  assert.match(appJs, /delete payload\.lessonPlan\.id/);
  assert.match(appJs, /status: "draft"/);
  assert.doesNotMatch(
    appJs.slice(
      appJs.indexOf("function createAdminCurriculumLessonPlan"),
      appJs.indexOf("function createAdminCurriculumLessonPlan") + 700,
    ),
    /openAdminCurriculumLessonEditor\(id/,
  );
  assert.doesNotMatch(pasteSrc, /openai|chat\.completions|generateActivity/i);
  assert.match(indexHtml, /curriculum-lesson-structure-paste\.js/);
  assert.match(indexHtml, /curriculum-week-kit-paste\.js/);
  assert.match(appJs, /linkCurriculumResourceToLesson\(/);
  const editorSrc = fs.readFileSync(path.join(ROOT, "scripts/teaching-kit-enrichment-editor.js"), "utf8");
  assert.match(editorSrc, /Paste Week Update/);
  assert.match(editorSrc, /data-paste-week-update/);
  assert.match(editorSrc, /Paste Activity Update/);
  assert.match(editorSrc, /data-paste-activity-update/);
  console.log("PASS  static contract: create path persists a draft instead of opening a missing ID");
}

function runParserTests() {
  let seq = 0;
  const parsed = parseFullLessonStructurePaste(SAMPLE_PASTE, {
    generateItemId: () => `item-${String(++seq).padStart(2, "0")}`,
  });
  assert.equal(parsed.ok, true, parsed.errors.join("; "));
  assert.equal(parsed.lesson.title, "Baby Moves & Discovers");
  assert.match(parsed.lesson.age, /Infant 0/i);
  assert.match(parsed.lesson.weeklyOverview, /explore movement/i);
  assert.equal(parsed.lesson.objectives.split("\n").length, 7);
  assert.equal(parsed.lesson.weeklyMaterials.split("\n").length, 7);
  assert.match(parsed.lesson.teacherPreparation, /infant-safe floor spaces/i);
  assert.match(parsed.lesson.familyConnection, /favorite songs/i);
  assert.deepEqual(parsed.lesson.milestones, ["Gross motor", "Fine motor", "Language", "Social-emotional", "Creativity"]);
  assert.equal(parsed.dailyPlans.monday.items.length, 2);
  assert.equal(parsed.dailyPlans.monday.items[0].title, "Color Scarf Tracking");
  assert.equal(parsed.dailyPlans.monday.items[1].title, "Hello, Baby! Mirror Play");
  assert.equal(parsed.dailyPlans.tuesday.items.length, 3);
  assert.equal(parsed.dailyPlans.tuesday.items[0].title, "Shake, Listen & Find");
  assert.equal(parsed.dailyPlans.wednesday.items.length, 3);
  assert.equal(parsed.dailyPlans.thursday.items.length, 3);
  assert.equal(parsed.dailyPlans.friday.items.length, 3);
  assert.equal(parsed.activityCount, 14);
  const ids = parsed.activities.map((item) => item.itemId);
  assert.equal(new Set(ids).size, 14);
  parsed.dailyPlans.monday.items.forEach((item) => {
    assert.equal(item.objective, "");
    assert.equal(item.description, "");
    assert.equal(item.materials, "");
    assert.equal(item.setup, "");
    assert.equal(item.steps, "");
    assert.equal(item.safetyNotes, "");
  });
  const preview = buildStructurePreview(parsed);
  assert.equal(preview.activityCount, 14);
  assert.equal(preview.recognized.objectives, 7);
  assert.equal(preview.recognized.weeklyMaterials, 7);
  assert.equal(preview.recognized.milestones, 5);
  const plan = buildCanonicalLessonPlan(parsed);
  assert.equal(plan.status, "draft");
  assert.equal(plan.resourceIds.length, 0);
  assert.ok(!plan.coverImageUrl);
  assert.ok(!plan.enrichmentPublished);
  assert.equal(Object.keys(plan.enrichmentDraft?.activities || {}).length, 0);
  const unsupported = parseFullLessonStructurePaste("Lesson title:\nX\nAge band:\nInfant\nMilestones:\nQuantum physics\nMonday:\nA");
  assert.ok(unsupported.lesson.rejectedMilestones.includes("Quantum physics"));
  const blank = buildBlankLessonPlan({ title: "New Lesson Plan" });
  assert.equal(blank.status, "draft");
  assert.equal(blank.dailyPlans.monday.items.length, 0);
  const dup = findDuplicateLessonTitle("Baby Moves & Discovers", [{ id: "cur-lp-existing", title: "baby moves & discovers" }]);
  assert.equal(dup.id, "cur-lp-existing");
  const weekPreview = pasteImport.buildWeekPreview("Weekly overview:\nKeep this week brief.", { weeklyOverview: "" });
  assert.ok((weekPreview.fieldChanges || []).some((change) => change.fieldId === "weeklyOverview"));
  const actPreview = pasteImport.buildActivityPreview(
    "Activity name:\nColor Scarf Tracking\nActivity objective:\nTrack a scarf.",
    { title: "Color Scarf Tracking", objective: "" },
  );
  assert.ok((actPreview.fieldChanges || []).some((change) => change.fieldId === "objective"));

  const ownerGatePaste = `Lesson title:
DISPOSABLE CREATE LESSON TEST

Age band:
Preschool

Weekly overview:
A disposable lesson used only to verify the new lesson creation workflow.

Learning objectives:
Explore through play
Build language
Practice problem-solving

Materials list:
Blocks
Paper
Crayons

Teacher preparation / Toolkit:
Prepare materials before children arrive.

Prep checklist:
Set out materials
Prepare activity areas

Observation focus:
Participation
Language
Problem-solving

Family connection:
Invite families to talk about the week's learning.

Milestones:
Language
Fine motor
Social-emotional

Monday:
Monday Activity One
Monday Activity Two
Monday Activity Three

Tuesday:
Tuesday Activity One
Tuesday Activity Two
Tuesday Activity Three

Wednesday:
Wednesday Activity One
Wednesday Activity Two
Wednesday Activity Three

Thursday:
Thursday Activity One
Thursday Activity Two
Thursday Activity Three

Friday:
Friday Activity One
Friday Activity Two
Friday Activity Three
`;
  const gateParsed = parseFullLessonStructurePaste(ownerGatePaste);
  assert.equal(gateParsed.ok, true, gateParsed.errors.join("; "));
  assert.equal(gateParsed.lesson.title, "DISPOSABLE CREATE LESSON TEST");
  assert.equal(gateParsed.lesson.age, "Preschool");
  assert.match(gateParsed.lesson.teacherPreparation, /Prepare materials before children arrive/);
  assert.deepEqual(gateParsed.lesson.prepChecklist, ["Set out materials", "Prepare activity areas"]);
  assert.deepEqual(gateParsed.lesson.observationFocus, ["Participation", "Language", "Problem-solving"]);
  assert.equal(gateParsed.activityCount, 15);
  assert.equal(gateParsed.unrecognized.length, 0, JSON.stringify(gateParsed.unrecognized));
  ["monday", "tuesday", "wednesday", "thursday", "friday"].forEach((day) => {
    assert.equal(gateParsed.dailyPlans[day].items.length, 3, `${day} should have 3 shells`);
  });
  const gatePreview = buildStructurePreview(gateParsed);
  assert.equal(gatePreview.recognized.teacherPreparation, true);
  assert.equal(gatePreview.recognized.prepChecklist, 2);
  assert.equal(gatePreview.recognized.observationFocus, 3);
  console.log("PASS  parser: title/age/week fields/weekdays/14 unique blank activity shells");
}

const FULL_WEEK_PASTE = `Lesson title:
Big Feelings, Little Bodies

Age band:
Toddler 12–24 Months

Weekly overview:
Children practice naming simple feelings and using calm-down choices with adult support.

Learning objectives:
Name a feeling with adult support
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

Monday:
Activity name: Feelings Check-In
Category: Circle
Activity objective: Name a feeling
What children will do: Point to a feeling face
Vocabulary:
happy
sad

Activity name: Mirror Faces
Category: Language
Activity objective: Copy a feeling face
What children will do: Look in a mirror

Tuesday:
Activity name: Puppet Feelings
Category: Dramatic play
Activity objective: Hear a feeling story
What children will do: Watch a puppet

Activity name: Soft Hug Practice
Category: Social
Activity objective: Use gentle hands
What children will do: Practice a gentle hug

Wednesday:
Activity name: Calm Choice Walk
Category: Movement
Activity objective: Choose a calm action
What children will do: Pick a card and try it

Activity name: Feeling Song Circle
Category: Music
Activity objective: Sing a feeling song
What children will do: Move with the song

Thursday:
Activity name: Color Monster Look
Category: Literacy
Activity objective: Notice a feeling in a book
What children will do: Look at pictures

Activity name: Heart Hands
Category: Art
Activity objective: Make a heart with hands
What children will do: Press hands together

Friday:
Activity name: Helping Hands Puppet Play
Category: Dramatic play
Activity objective: Help a friend puppet
What children will do: Offer a puppet a hug
Vocabulary:
help
friend
gentle
Image requirement:
Show two children sharing a puppet.
Example images:
Adult-taken classroom photo only.

Activity name: Calm Goodbye
Category: Circle
Activity objective: End with a calm body
What children will do: Take a slow breath

Books:
Book title: The Color Monster
Author: Anna Llenas
Why this book: Supports simple conversations about different emotions.
Book questions:
What feeling do you see?
What does your face look like when you feel happy?

Book title: In My Heart
Author: Jo Witek
Why this book: Gives children simple language for describing feelings.
Book questions:
What feeling is the character having?
Can you show that feeling with your face?

Songs:
Song title: If You're Happy and You Know It
How to use: Change the feeling and action during each verse.
Teacher notes: Use familiar movements and allow children to participate through gestures.

Song title: Breathe In, Breathe Out
Description: A short teacher-led calming chant.
Lyrics:
Breathe in slow.
Breathe out slow.
My body can rest.

Printable Ideas:
Idea title: My Feelings Cards
Type: Visual cards
Purpose / description: Simple emotion faces children can point to.
Instructions: Print, cut apart, and use during circle time or one-on-one conversations.
Notes: Use large toddler-friendly facial expressions.

Idea title: Calm Choice Cards
Type: Choice cards
Purpose / description: Visual choices for simple calming strategies.
Instructions: Offer two or three choices when the child needs adult support.

Linked Resources:
Linked resource: Tummy-Time Visual Strip
Linked resource: Not A Real Printable Title

Milestones:
Social-emotional
Language
Quantum feelings
`;

function runFullWeekPasteTests() {
  const existingResources = [
    {
      id: "cur-res-tummy-time-visual-strip",
      title: "Tummy-Time Visual Strip",
      resourceCategory: "Printables",
      resourceType: "Printable",
    },
  ];
  const parsed = parseFullLessonStructurePaste(FULL_WEEK_PASTE, { existingResources });
  assert.equal(parsed.ok, true, parsed.errors.join("; "));
  assert.equal(parsed.lesson.title, "Big Feelings, Little Bodies");
  assert.equal(parsed.lesson.age, "Toddler 12–24 Months");
  assert.match(parsed.lesson.weeklyOverview, /naming simple feelings/);
  assert.equal(parsed.lesson.objectives.split("\n").length, 3);
  assert.equal(parsed.dailyPlans.monday.items.length, 2);
  assert.equal(parsed.dailyPlans.tuesday.items.length, 2);
  assert.equal(parsed.dailyPlans.wednesday.items.length, 2);
  assert.equal(parsed.dailyPlans.thursday.items.length, 2);
  assert.equal(parsed.dailyPlans.friday.items.length, 2);
  assert.equal(parsed.activityCount, 10);
  assert.equal(parsed.dailyPlans.friday.items[0].title, "Helping Hands Puppet Play");
  assert.match(parsed.dailyPlans.friday.items[0].vocabulary, /gentle/);
  assert.equal(parsed.dailyPlans.friday.items[1].title, "Calm Goodbye");
  assert.equal(parsed.books.length, 2);
  assert.equal(parsed.books[0].title, "The Color Monster");
  assert.equal(parsed.books[1].title, "In My Heart");
  assert.match(parsed.books[0].questions, /What feeling do you see/);
  assert.equal(parsed.songs.length, 2);
  assert.equal(parsed.songs[0].title, "If You're Happy and You Know It");
  assert.match(parsed.songs[0].teacherDirections, /familiar movements/);
  assert.match(parsed.songs[1].lyrics, /Breathe in slow/);
  assert.equal(parsed.printableIdeas.length, 2);
  assert.equal(parsed.printableIdeas[0].title, "My Feelings Cards");
  assert.equal(parsed.printableIdeas[1].title, "Calm Choice Cards");
  assert.equal(parsed.linkedResources.resolved.length, 1);
  assert.equal(parsed.linkedResources.resolved[0].resource.id, "cur-res-tummy-time-visual-strip");
  assert.equal(parsed.linkedResources.unresolved.length, 1);
  assert.match(parsed.linkedResources.unresolved[0].entry.title, /Not A Real Printable Title/);
  assert.deepEqual(parsed.lesson.milestones, ["Social-emotional", "Language"]);
  assert.ok(parsed.lesson.rejectedMilestones.includes("Quantum feelings"));
  const preview = buildStructurePreview(parsed);
  assert.equal(preview.books.length, 2);
  assert.equal(preview.songs.length, 2);
  assert.equal(preview.printableIdeas.length, 2);
  assert.equal(preview.linkedResources.resolved.length, 1);
  assert.equal(preview.linkedResources.unresolved.length, 1);
  assert.match(preview.linkedResources.destination, /Linked Resources/);
  const plan = buildCanonicalLessonPlan(parsed);
  assert.equal(plan.status, "draft");
  assert.equal(plan.resourceIds.length, 0);
  assert.equal(plan.enrichmentDraft.week.books.length, 2);
  assert.equal(plan.enrichmentDraft.week.songs.length, 2);
  assert.equal(plan.enrichmentDraft.week.printableIdeas.length, 2);
  assert.ok(!plan.enrichmentPublished);
  const fridayTitles = parsed.dailyPlans.friday.items.map((item) => item.title).join(" ");
  assert.doesNotMatch(fridayTitles, /Color Monster|Feelings Song|Calm Choice|Tummy-Time/);
  const unknownHeading = parseFullLessonStructurePaste(`Lesson title:
Coverage Check
Age band:
Toddler
Family connection:
Keep family text.
Sensory regulation goal:
Do not store this randomly.
Monday:
Keep Monday
`);
  assert.ok(unknownHeading.unrecognized.some((row) => /Sensory regulation goal/i.test(row.heading || "")), unknownHeading.unrecognized);
  assert.doesNotMatch(unknownHeading.lesson.familyConnection, /Do not store this randomly/);
  const coverParsed = parseFullLessonStructurePaste(`Lesson title:
Cover Check
Age band:
Preschool
Cover image URL:
https://example.test/covers/feelings.png
Monday:
A
`);
  assert.equal(coverParsed.lesson.coverImageUrl, "https://example.test/covers/feelings.png");
  assert.equal(buildCanonicalLessonPlan(coverParsed).coverImageUrl, "https://example.test/covers/feelings.png");
  const coverUpload = parseFullLessonStructurePaste(`Lesson title:
Cover Upload
Age band:
Preschool
Cover photo:
feelings-cover.jpg
Monday:
A
`);
  assert.ok(coverUpload.lesson.coverManualUpload);
  assert.ok(!coverUpload.lesson.coverImageUrl);
  const kit = require("./curriculum-week-kit-paste.js");
  const songs = kit.parseSongsSection("Song title: Demo\nTune: London Bridge\nHow to use: Circle\n");
  assert.equal(songs.records[0].title, "Demo");
  assert.ok(songs.unsupported.some((row) => /tune/i.test(row.heading || "") || /Tune is not/i.test(row.note || "")));
  const books = kit.parseBooksSection("Book title: Demo Book\nTeacher notes: Not a stored book field.\nAuthor: A\n");
  assert.equal(books.records[0].author, "A");
  assert.ok(books.unsupported.some((row) => /teacher notes/i.test(row.heading || "")));
  console.log("PASS  full-week paste: 10 activities, 2 books, 2 songs, 2 ideas, 1 resolved + 1 unresolved link");
}

function assertCanonicalHelloWorld(parsed, label) {
  assert.equal(parsed.ok, true, `${label}: ${parsed.errors.join("; ")}`);
  assert.equal(parsed.lesson.title, "Hello, Little World", label);
  assert.equal(parsed.lesson.age, "Infant 0–6 Months", label);
  assert.equal(parsed.lesson.ageDisplay, "Infant 0–6 Months", label);
}

function runHeadingAndAgeAliasTests() {
  const case1 = parseFullLessonStructurePaste("Lesson plan name:\nHello, Little World\nAge:\nInfant 0–6 months");
  assertCanonicalHelloWorld(case1, "case 1");
  const preview1 = buildStructurePreview(case1);
  assert.equal(preview1.title, "Hello, Little World");
  assert.equal(preview1.age, "Infant 0–6 Months");
  globalThis.__llhCreateLessonPreviewCase1 = preview1;

  const case2 = parseFullLessonStructurePaste("Title:\nHello, Little World\nAge band:\nInfant 0-6 months");
  assertCanonicalHelloWorld(case2, "case 2");

  const case3 = parseFullLessonStructurePaste("Lesson Name:\nHello, Little World\nAge Range:\n0–6 months");
  assertCanonicalHelloWorld(case3, "case 3");

  const case4 = parseFullLessonStructurePaste("Lesson title:\nHello, Little World\nAge:\nInfant (0-6 months)");
  assertCanonicalHelloWorld(case4, "case 4");

  const unknown = parseFullLessonStructurePaste("Lesson plan name:\nHello, Little World\nAge:\nInfant 0–7 months");
  assert.equal(unknown.ok, false);
  assert.equal(unknown.lesson.age, "");
  assert.match(unknown.errors.join("\n"), /Could not recognize age band [“"]Infant 0–7 months[”"]/);
  CANONICAL_AGE_BAND_LABELS.forEach((label) => {
    assert.match(unknown.errors.join("\n"), new RegExp(label.replace(/[–]/g, "[–-]")));
  });

  const crlf = parseFullLessonStructurePaste("Lesson plan name:\r\nHello, Little World\r\n\r\nAge:  \r\nInfant 0–6 months\r\n");
  assertCanonicalHelloWorld(crlf, "crlf");

  const spaced = parseFullLessonStructurePaste("  LESSON PLAN NAME:   \n\n  Hello, Little World  \n\n  AGE BAND:  \n  Infants 0-6 months  \n");
  assertCanonicalHelloWorld(spaced, "spacing/caps/plural");

  const dashVariants = [
    "Infant 0–6 months",
    "Infant 0-6 months",
    "Infants 0–6 months",
    "Infants 0-6 months",
    "0–6 months",
    "0-6 months",
    "0–6m",
    "0-6m",
    "Infant: 0–6 months",
    "Infant: 0-6 months",
    "Infant (0–6 months)",
    "Infant (0-6 months)",
  ];
  dashVariants.forEach((value) => {
    const mapped = resolveAgeBandAlias(value);
    assert.equal(mapped.display, "Infant 0–6 Months", value);
    assert.equal(mapped.bucket, "Infant", value);
  });

  const otherBands = [
    ["Infant 6-12 months", "Infant 6–12 Months"],
    ["Infants 6–12 months", "Infant 6–12 Months"],
    ["6-12m", "Infant 6–12 Months"],
    ["Toddler 12-24 months", "Toddler 12–24 Months"],
    ["12–24 months", "Toddler 12–24 Months"],
    ["Toddler 1–2 years", "Toddler 12–24 Months"],
    ["Toddler 24-36 months", "Toddler 24–36 Months"],
    ["Toddler 2–3 years", "Toddler 24–36 Months"],
    ["Preschool 3-4 years", "Preschool 3–4 Years"],
    ["3–4 years", "Preschool 3–4 Years"],
    ["Preschool 4-5 years", "Preschool 4–5 Years"],
    ["4–5 years", "Preschool 4–5 Years"],
    ["Toddler", "Toddler"],
    ["Preschool", "Preschool"],
    ["Infant", "Infant"],
  ];
  otherBands.forEach(([value, expected]) => {
    assert.equal(resolveAgeBandAlias(value).display, expected, value);
  });

  const themeTitle = parseFullLessonStructurePaste("Theme:\nHello, Little World\nRecommended Age:\nInfant 0–6 Months");
  assertCanonicalHelloWorld(themeTitle, "theme/recommended age");

  const oldFormat = parseFullLessonStructurePaste(SAMPLE_PASTE);
  assert.equal(oldFormat.ok, true, oldFormat.errors.join("; "));
  assert.equal(oldFormat.lesson.title, "Baby Moves & Discovers");
  assert.equal(oldFormat.lesson.age, "Infant 0–6 Months");
  assert.equal(oldFormat.activityCount, 14);

  console.log("PASS  parser: human-readable title/age aliases and unique age-band mapping");
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

async function siteStamp(token) {
  const res = await requestJson("GET", "/api/admin/site-content", null, token);
  assert.equal(res.status, 200, res.text);
  return res.json.siteContent?.updatedAt || "";
}

async function saveLesson(token, lessonPlan, expectedUpdatedAt) {
  return requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    expectedUpdatedAt,
    lessonPlan,
  }, token);
}

async function publicLibrary() {
  const res = await requestJson("GET", "/api/site-content");
  assert.equal(res.status, 200, res.text);
  return res.json.siteContent?.curriculumLibrary || res.json.curriculumLibrary || { lessonPlans: [] };
}

async function runServerTests() {
  const child = startServer();
  try {
    await waitForBoot(child);
    const token = await adminLogin();
    let stamp = await siteStamp(token);

    const existingTitle = "Protected Published Lesson";
    const existing = await saveLesson(token, {
      title: existingTitle,
      age: "Toddler",
      status: "published",
      plan: "Free",
      weeklyOverview: "Do not overwrite me.",
      dailyPlans: {
        monday: { items: [{ title: "Keep Monday", itemId: "item-keep-mon" }] },
        tuesday: { items: [{ title: "Keep Tuesday", itemId: "item-keep-tue" }] },
        wednesday: { items: [{ title: "Keep Wednesday", itemId: "item-keep-wed" }] },
        thursday: { items: [{ title: "Keep Thursday", itemId: "item-keep-thu" }] },
        friday: { items: [{ title: "Keep Friday", itemId: "item-keep-fri" }] },
      },
    }, stamp);
    assert.equal(existing.status, 200, existing.text);
    const existingId = existing.json.lessonPlan.id;
    const existingOverview = existing.json.lessonPlan.weeklyOverview;
    stamp = existing.json.siteContentUpdatedAt;

    const blankPlan = buildBlankLessonPlan({ title: "New Lesson Plan" });
    const blank = await saveLesson(token, blankPlan, stamp);
    assert.equal(blank.status, 200, blank.text);
    const blankSaved = blank.json.lessonPlan;
    assert.match(blankSaved.id, /^cur-lp-[a-f0-9]+$/);
    assert.equal(blankSaved.status, "draft");
    assert.notEqual(blankSaved.id, existingId);
    stamp = blank.json.siteContentUpdatedAt;
    console.log("PASS  1-3  blank create: unique cur-lp id, draft-only");

    const pub = await publicLibrary();
    const publicIds = (pub.lessonPlans || []).map((item) => item.id);
    assert.ok(!publicIds.includes(blankSaved.id), "draft must not appear in public curriculum library");
    assert.ok(publicIds.includes(existingId), "existing published lesson remains public");
    console.log("PASS  4    draft is hidden from customer curriculum");

    const existingAgain = (blank.json.curriculum.lessonPlans || []).find((item) => item.id === existingId);
    assert.equal(existingAgain.weeklyOverview, existingOverview);
    assert.equal(existingAgain.status, "published");
    console.log("PASS  5,29 existing published lesson untouched");

    const parsed = parseFullLessonStructurePaste(SAMPLE_PASTE);
    assert.equal(parsed.activityCount, 14);
    const duplicateGuard = findDuplicateLessonTitle(parsed.lesson.title, blank.json.curriculum.lessonPlans);
    assert.equal(duplicateGuard, null);
    const firstPaste = await saveLesson(token, buildCanonicalLessonPlan(parsed), stamp);
    assert.equal(firstPaste.status, 200, firstPaste.text);
    const pasteSaved = firstPaste.json.lessonPlan;
    assert.equal(pasteSaved.status, "draft");
    assert.equal(pasteSaved.title, "Baby Moves & Discovers");
    stamp = firstPaste.json.siteContentUpdatedAt;
    const acts = (firstPaste.json.activities || []).filter((item) => item.status !== "archived");
    assert.equal(acts.length, 14);
    assert.equal(new Set(acts.map((item) => item.id)).size, 14);
    acts.forEach((act) => {
      assert.match(act.id, /^cur-act-/);
      assert.equal(act.status, "draft");
      assert.equal(String(act.objective || "").trim(), "");
      assert.equal(String(act.description || "").trim(), "");
      assert.ok(!act.setupImageUrl);
      assert.ok(!act.exampleImageUrl);
    });
    assert.equal(acts.filter((item) => item.dayOfWeek === "monday").length, 2);
    assert.equal(acts.filter((item) => item.dayOfWeek === "friday").length, 3);
    assert.equal((pasteSaved.resourceIds || []).length, 0);
    const pub2 = await publicLibrary();
    assert.ok(!(pub2.lessonPlans || []).some((item) => item.id === pasteSaved.id));
    console.log("PASS  7-24 paste structure: mapped fields, 14 unique draft activity shells, no media");

    const dupTitle = findDuplicateLessonTitle("Baby Moves & Discovers", firstPaste.json.curriculum.lessonPlans);
    assert.equal(dupTitle.id, pasteSaved.id);
    console.log("PASS  6    same-title duplicate is detected before a second create");

    const reload = await requestJson("GET", "/api/admin/site-content", null, token);
    const reloaded = (reload.json.siteContent?.curriculum?.lessonPlans || []).find((item) => item.id === pasteSaved.id);
    assert.ok(reloaded, "draft persists after reload");
    assert.equal(reloaded.status, "draft");
    console.log("PASS  26   save/reload persists the new draft");

    const publishStillExplicit = await saveLesson(token, { ...reloaded, status: "draft" }, reload.json.siteContent?.updatedAt || stamp);
    assert.equal(publishStillExplicit.json.lessonPlan.status, "draft");
    console.log("PASS  30   publish remains explicit — draft save does not publish");

    const { chromium } = require("playwright");
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await page.addInitScript(() => {
        try { localStorage.setItem("llhMetaCookieNoticeDismissed", "1"); } catch { /* ignore */ }
      });
      await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 45000 });
      await page.evaluate(() => setView("admin"));
      await page.waitForSelector("#adminUnlockForm", { timeout: 20000 });
      await page.fill('input[name="adminEmail"]', ADMIN.email);
      await page.fill('input[name="adminPassword"]', ADMIN.password);
      await page.fill('input[name="adminCode"]', ADMIN.code);
      await page.click("#adminUnlockForm button[type='submit']");
      await page.waitForSelector("#adminProtectedContent:not([hidden])", { timeout: 20000 });
      await page.evaluate(() => {
        if (typeof setAdminSectionTab === "function") setAdminSectionTab("curriculum-lesson-plans");
      });
      await page.waitForSelector("#adminCreateCurriculumLessonPlanButton", { timeout: 20000 });

      const beforeIds = await page.evaluate(() => (typeof curriculumLessonPlansForAdmin === "function"
        ? curriculumLessonPlansForAdmin().map((item) => item.id)
        : []));
      await page.click("#adminCreateCurriculumLessonPlanButton");
      await page.waitForSelector("[data-create-lesson-cancel]", { timeout: 10000 });
      await page.click("[data-create-lesson-cancel]");
      const afterCancel = await page.evaluate(() => (typeof curriculumLessonPlansForAdmin === "function"
        ? curriculumLessonPlansForAdmin().map((item) => item.id)
        : []));
      assert.deepEqual(afterCancel, beforeIds);
      console.log("PASS  25   cancel causes zero curriculum changes");

      await page.click("#adminCreateCurriculumLessonPlanButton");
      await page.waitForSelector("[data-create-lesson-start-blank]", { timeout: 10000 });
      await page.click("[data-create-lesson-start-blank]");
      await page.waitForSelector(".tk-enrich-shell, #adminTeachingKitEnrichmentHost:not([hidden])", { timeout: 30000 });
      const blankUi = await page.evaluate(() => ({
        open: Boolean(window.LLHTeachingKitEnrichmentEditor?.isOpen?.()),
        id: window.LLHTeachingKitEnrichmentEditor?.getState?.()?.planId || "",
        status: typeof curriculumLessonPlanById === "function"
          ? curriculumLessonPlanById(window.LLHTeachingKitEnrichmentEditor?.getState?.()?.planId || "")?.status
          : "",
      }));
      assert.equal(blankUi.open, true);
      assert.match(blankUi.id, /^cur-lp-/);
      assert.equal(blankUi.status, "draft");
      console.log("PASS  1    Create New Lesson Plan Start Blank opens the real editor");

      await page.evaluate(async () => {
        if (window.LLHTeachingKitEnrichmentEditor?.isOpen?.()) {
          await window.LLHTeachingKitEnrichmentEditor.close({ force: true });
        }
      });
      await page.waitForSelector("#adminCreateCurriculumLessonPlanButton", { timeout: 20000 });
      await page.click("#adminCreateCurriculumLessonPlanButton");
      await page.click("[data-create-lesson-paste]");
      await page.waitForSelector("#adminCreateLessonPasteText", { timeout: 10000 });
      await page.fill("#adminCreateLessonPasteText", SAMPLE_PASTE);
      await page.click("[data-create-lesson-preview]");
      await page.waitForSelector("[data-create-lesson-confirm], [data-create-lesson-as-copy]", { timeout: 10000 });
      const previewText = await page.locator(".admin-create-lesson-dialog").innerText();
      assert.match(previewText, /Baby Moves & Discovers/);
      assert.match(previewText, /TOTAL ACTIVITIES:\s*14/);
      if (await page.locator("[data-create-lesson-as-copy]").count()) {
        await page.click("[data-create-lesson-as-copy]");
      } else {
        await page.click("[data-create-lesson-confirm]");
      }
      await page.waitForSelector(".tk-enrich-shell, #adminTeachingKitEnrichmentHost:not([hidden])", { timeout: 30000 });
      const pasteUi = await page.evaluate(() => {
        const id = window.LLHTeachingKitEnrichmentEditor?.getState?.()?.planId || "";
        const plan = typeof curriculumLessonPlanById === "function" ? curriculumLessonPlanById(id) : null;
        const acts = typeof curriculumActivitiesForLesson === "function" ? curriculumActivitiesForLesson(id) : [];
        const live = acts.filter((item) => item.status !== "archived");
        const first = live[0];
        const completion = first && window.LLHTeachingKitEnrichment?.computeActivityCompletion
          ? window.LLHTeachingKitEnrichment.computeActivityCompletion(first, {}, plan)
          : { percent: -1 };
        return {
          id,
          title: plan?.title || "",
          status: plan?.status || "",
          activityCount: live.length,
          monday: live.filter((item) => item.dayOfWeek === "monday").map((item) => item.title),
          hasActivityPaste: Boolean(document.querySelector("[data-paste-activity-update]")),
          completionPercent: completion.percent,
        };
      });
      assert.match(pasteUi.title, /Baby Moves & Discovers/);
      assert.equal(pasteUi.status, "draft");
      assert.equal(pasteUi.activityCount, 14);
      assert.deepEqual(pasteUi.monday, ["Color Scarf Tracking", "Hello, Baby! Mirror Play"]);
      assert.equal(pasteUi.hasActivityPaste, true);
      assert.ok(pasteUi.completionPercent < 100, "blank activity shells must not be marked complete");
      await page.click("[data-enrich-mode='week']");
      await page.waitForSelector("[data-paste-week-update]", { timeout: 10000 });
      console.log("PASS  27-28 Paste Week Update and Paste Activity Update remain on the new lesson");
      await page.close();
    } finally {
      await browser.close().catch(() => {});
    }
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

async function main() {
  assertStaticContract();
  runParserTests();
  runFullWeekPasteTests();
  runHeadingAndAgeAliasTests();
  await runServerTests();
  console.log("\nAll create-new-lesson-plan tests passed.");
}

main().catch((error) => {
  console.error("\nFAIL", error);
  process.exitCode = 1;
});
