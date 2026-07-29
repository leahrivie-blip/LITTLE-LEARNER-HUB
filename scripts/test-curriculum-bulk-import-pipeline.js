#!/usr/bin/env node
/**
 * Bulk import pipeline + cover assignment + post-import verification.
 *
 * Run: node scripts/test-curriculum-bulk-import-pipeline.js
 * Or:  npm run test:curriculum-bulk-import-pipeline
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const crypto = require("crypto");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const coverAssign = require("./lesson-plan-cover-assign.js");
const covers = require("./lesson-plan-covers.js");
const postImportVerify = require("./curriculum-post-import-verify.js");
const pipeline = require("./curriculum-bulk-import-pipeline.js");

const results = [];
function pass(name, detail = "") {
  results.push({ ok: true, name, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail = "") {
  results.push({ ok: false, name, detail });
  console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function buildMiniWeek({ title, age, plan, theme, status = "published" }) {
  return `TITLE:
${title}

AGE_GROUP:
${age}

THEME:
${theme}

PLAN:
${plan}

STATUS:
${status}

WEEKLY_OVERVIEW:
A ${age} ${plan} week exploring ${theme} through play.

LEARNING_OBJECTIVES:
- Explore ${theme.toLowerCase()}
- Practice cooperation and language

WEEKLY_MATERIALS:
Bins, paper, crayons, books, scarves

VOCABULARY:
explore, share, create, notice

BOOKS:
- Looking Closely by Author One
- Theme Friends by Author Two

SONGS:
- Hello Friends
- Theme Dance Song

FAMILY_CONNECTION:
Talk about ${theme.toLowerCase()} at home this week.

OBSERVATION_OPPORTUNITIES:
Watch for language, engagement, and peer interactions.

ADAPTATIONS:
Offer larger grips and quieter spaces as needed.

MONDAY:
ACTIVITY_NAME:
${theme} Sensory Bin
CATEGORY:
Sensory Play
DESCRIPTION:
Children explore a ${theme.toLowerCase()} sensory bin.
MATERIALS:
Bin, scoops
SETUP:
Prepare the bin before arrival.
TEACHER_ROLE:
Narrate and ask questions.
DIRECTIONS:
1. Invite children.
2. Model scooping.
3. Reflect together.
LEARNING_GOALS:
Curiosity
Fine motor
OBSERVATION_OPPORTUNITIES:
Notice vocabulary use.
ADAPTATIONS:
Offer larger scoops.
SAFETY_NOTES:
Supervise closely.

ACTIVITY_NAME:
${theme} Circle Share
CATEGORY:
Circle Time
DESCRIPTION:
Children greet friends and talk about ${theme.toLowerCase()}.
MATERIALS:
Scarf, picture cards
SETUP:
Arrange circle spots.
TEACHER_ROLE:
Facilitate greetings.
DIRECTIONS:
1. Sing hello.
2. Share one idea.
3. Close with a stretch.
LEARNING_GOALS:
Social emotional
Language
OBSERVATION_OPPORTUNITIES:
Peer listening.
ADAPTATIONS:
Allow nonverbal responses.
SAFETY_NOTES:
Keep pathways clear.

TUESDAY:
ACTIVITY_NAME:
${theme} Art Studio
CATEGORY:
Art
DESCRIPTION:
Children create ${theme.toLowerCase()} art.
MATERIALS:
Paper, crayons
SETUP:
Cover tables.
TEACHER_ROLE:
Offer open prompts.
DIRECTIONS:
1. Choose colors.
2. Create freely.
3. Share work.
LEARNING_GOALS:
Creative arts
OBSERVATION_OPPORTUNITIES:
Fine motor grip.
ADAPTATIONS:
Larger crayons.
SAFETY_NOTES:
Non-toxic materials only.

ACTIVITY_NAME:
${theme} Movement Path
CATEGORY:
Gross Motor
DESCRIPTION:
Children move like ${theme.toLowerCase()} characters.
MATERIALS:
Cones
SETUP:
Clear a path.
TEACHER_ROLE:
Model safe movement.
DIRECTIONS:
1. Demonstrate path.
2. Children travel.
3. Rest and breathe.
LEARNING_GOALS:
Gross motor
OBSERVATION_OPPORTUNITIES:
Balance and control.
ADAPTATIONS:
Shorter path.
SAFETY_NOTES:
Clear obstacles.

WEDNESDAY:
ACTIVITY_NAME:
${theme} Story Time
CATEGORY:
Literacy
DESCRIPTION:
Read aloud connected to ${theme.toLowerCase()}.
MATERIALS:
Picture book
SETUP:
Cozy reading spot.
TEACHER_ROLE:
Read expressively.
DIRECTIONS:
1. Preview cover.
2. Read aloud.
3. Discuss ending.
LEARNING_GOALS:
Language
Literacy
OBSERVATION_OPPORTUNITIES:
Comprehension talk.
ADAPTATIONS:
Shorter book option.
SAFETY_NOTES:
Seated safely.

ACTIVITY_NAME:
${theme} Building Lab
CATEGORY:
STEM/Discovery
DESCRIPTION:
Children build related to ${theme.toLowerCase()}.
MATERIALS:
Blocks
SETUP:
Set out blocks.
TEACHER_ROLE:
Ask wondering questions.
DIRECTIONS:
1. Plan a build.
2. Construct.
3. Test and adjust.
LEARNING_GOALS:
Problem solving
OBSERVATION_OPPORTUNITIES:
Persistence.
ADAPTATIONS:
Larger blocks.
SAFETY_NOTES:
No tall unstable towers near walkways.

THURSDAY:
ACTIVITY_NAME:
${theme} Music Moment
CATEGORY:
Music & Movement
DESCRIPTION:
Sing and move with ${theme.toLowerCase()} songs.
MATERIALS:
Scarves
SETUP:
Open space.
TEACHER_ROLE:
Lead tempo changes.
DIRECTIONS:
1. Start soft.
2. Add movement.
3. Freeze dance.
LEARNING_GOALS:
Music
Self regulation
OBSERVATION_OPPORTUNITIES:
Rhythm response.
ADAPTATIONS:
Seated options.
SAFETY_NOTES:
Space between movers.

ACTIVITY_NAME:
${theme} Dramatic Play
CATEGORY:
Dramatic Play
DESCRIPTION:
Children role-play a ${theme.toLowerCase()} scene.
MATERIALS:
Props bin
SETUP:
Set scene props.
TEACHER_ROLE:
Join as a play partner.
DIRECTIONS:
1. Introduce roles.
2. Play together.
3. Clean up props.
LEARNING_GOALS:
Imagination
Social skills
OBSERVATION_OPPORTUNITIES:
Role language.
ADAPTATIONS:
Fewer props.
SAFETY_NOTES:
No small choking hazards.

FRIDAY:
ACTIVITY_NAME:
${theme} Outdoor Hunt
CATEGORY:
Outdoor Play
DESCRIPTION:
Children hunt for ${theme.toLowerCase()} clues outdoors.
MATERIALS:
Clipboards
SETUP:
Mark safe boundaries.
TEACHER_ROLE:
Coach observation.
DIRECTIONS:
1. Review rules.
2. Hunt clues.
3. Share finds.
LEARNING_GOALS:
Observation
Gross motor
OBSERVATION_OPPORTUNITIES:
Teamwork outdoors.
ADAPTATIONS:
Shorter hunt.
SAFETY_NOTES:
Stay inside boundaries.

ACTIVITY_NAME:
${theme} Reflection Circle
CATEGORY:
Circle Time
DESCRIPTION:
Children reflect on the ${theme.toLowerCase()} week.
MATERIALS:
Talking stick
SETUP:
Circle seats.
TEACHER_ROLE:
Prompt reflection.
DIRECTIONS:
1. Recall favorite moment.
2. Share one learning.
3. Celebrate friends.
LEARNING_GOALS:
Reflection
Language
OBSERVATION_OPPORTUNITIES:
Recall detail.
ADAPTATIONS:
Draw instead of speak.
SAFETY_NOTES:
Calm voices.
`;
}

function unitCoverTests() {
  const ocean = coverAssign.assignCoverFields({
    title: "Ocean Explorers",
    theme: "Ocean",
    age: "Preschool",
  });
  assert(ocean.coverImageUrl.includes("ocean"), `ocean cover expected, got ${ocean.coverImageUrl}`);
  assert(ocean._coverAssign.reusedExistingAsset === true, "must reuse existing asset");
  assert(ocean._coverAssign.assetExists === true, "ocean cover file must exist");
  assert(ocean._coverAssign.assigned === true, "should assign when missing");

  const catalog = coverAssign.assignCoverFields({
    title: "Dinosaur Discovery",
    theme: "Dinosaurs",
    age: "Preschool",
  });
  assert(catalog.coverImageUrl.endsWith("dinosaur-discovery.jpg"), "catalog title should win");
  assert(catalog._coverAssign.quality === "illustrated", "catalog quality");

  const custom = coverAssign.assignCoverFields({
    title: "Ocean Explorers",
    coverImageUrl: "/images/lesson-covers/colors-everywhere.jpg",
    coverImageSource: "uploaded",
  });
  assert(custom.coverImageUrl.includes("colors-everywhere"), "custom cover preserved");
  assert(custom._coverAssign.assigned === false, "do not overwrite custom");

  const apple = covers.getMappedThemeCover("Apple Orchard Fun Week", "Apples");
  assert(apple.includes("gardening-plants") || apple.includes("garden"), `apple theme map: ${apple}`);

  const batch = coverAssign.auditBatchCovers([
    { title: "Ocean Explorers", theme: "Ocean", age: "Preschool" },
    { title: "Sea Friends", theme: "Ocean life", age: "Toddler" },
    { title: "Brand New Unique Title XYZ", age: "Toddler" },
  ]);
  assert(batch.newImageFilesCreated === 0, "never create image files during assign");
  assert(batch.ok === true, "all assigned covers must exist on disk");
  assert(batch.sharedCoverAssignments.length >= 1, "theme reuse is expected, not a duplicate file");
  assert(batch.needsCustomArtCount >= 1, "unique titles without theme still get age fallback");
  pass("Cover assign reuses illustrated assets", `${batch.illustratedCount} illustrated/theme, 0 new files`);
}

function unitVerifyTests() {
  const good = {
    id: "cur-lp-test-ocean",
    title: "Ocean Explorers",
    age: "Preschool",
    theme: "Ocean",
    plan: "Free",
    status: "published",
    weeklyOverview: "A week by the sea.",
    objectives: "Explore ocean life.",
    weeklyMaterials: "Shells, bins",
    vocabularyWords: "wave, shell",
    books: [{ title: "Ocean Book", author: "A", notes: "" }],
    songs: [{ title: "Row Boat", notes: "" }],
    learningDomains: ["Science"],
    observationOpportunities: "Watch curiosity.",
    familyConnection: "Talk about water.",
    adaptations: "Offer quieter play.",
    coverImageUrl: "/images/lesson-covers/ocean-explorers.jpg",
    coverImageSource: "mapped",
    dailyPlans: {
      monday: { items: [{ title: "Shell Sort", activityCategory: "Sensory Play", description: "Sort shells.", steps: "1. Sort\n2. Count\n3. Share" }] },
      tuesday: { items: [{ title: "Wave Dance", activityCategory: "Music & Movement", description: "Move like waves.", steps: "1. Stretch\n2. Sway\n3. Freeze" }] },
      wednesday: { items: [{ title: "Boat Build", activityCategory: "STEM/Discovery", description: "Build boats.", steps: "1. Plan\n2. Build\n3. Test" }] },
      thursday: { items: [{ title: "Ocean Art", activityCategory: "Art", description: "Paint waves.", steps: "1. Choose\n2. Paint\n3. Dry" }] },
      friday: { items: [{ title: "Beach Walk", activityCategory: "Outdoor Play", description: "Outdoor hunt.", steps: "1. Review\n2. Hunt\n3. Share" }] },
    },
    activityIds: ["a1", "a2", "a3", "a4", "a5"],
  };
  const sections = postImportVerify.verifyPlanSections(good);
  assert(sections.ok, `sections should pass: ${JSON.stringify(sections.issues)}`);
  const cover = postImportVerify.verifyPlanCover(good);
  assert(cover.ok, `cover should pass: ${JSON.stringify(cover.issues)}`);

  const before = postImportVerify.snapshotExistingPlans([
    { id: "keep-me", title: "Keep Me", age: "Toddler", theme: "Friends", plan: "Free", status: "published", activityIds: ["x"], coverImageUrl: "/images/lesson-covers/all-about-me.jpg", weeklyOverview: "Hi", objectives: "Yo" },
  ], new Set(["cur-lp-test-ocean"]));
  const existing = postImportVerify.verifyExistingUnchanged(before, [
    { id: "keep-me", title: "Keep Me", age: "Toddler", theme: "Friends", plan: "Free", status: "published", activityIds: ["x"], coverImageUrl: "/images/lesson-covers/all-about-me.jpg", weeklyOverview: "Hi", objectives: "Yo" },
    good,
  ], new Set(["cur-lp-test-ocean"]));
  assert(existing.ok, "existing plans must remain unchanged");

  const tampered = postImportVerify.verifyExistingUnchanged(before, [
    { id: "keep-me", title: "Keep Me CHANGED", age: "Toddler", theme: "Friends", plan: "Free", status: "published", activityIds: ["x"], coverImageUrl: "/images/lesson-covers/all-about-me.jpg", weeklyOverview: "Hi", objectives: "Yo" },
  ], new Set());
  assert(!tampered.ok, "must detect existing plan modification");
  pass("Post-import verify detects completeness + preservation");
}

function unitValidateFailFast() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "llh-bulk-validate-"));
  const badPath = path.join(tmpDir, "bad.txt");
  fs.writeFileSync(badPath, "this is not a lesson plan\n");
  const sources = [{ kind: "file", path: badPath, label: "bad.txt" }];
  const { parseErrors } = pipeline.parseSources(sources);
  assert(parseErrors.length === 1, "bad paste must fail parse");
  pass("Validate-only fail-fast on parse errors");

  const goodDir = fs.mkdtempSync(path.join(os.tmpdir(), "llh-bulk-good-"));
  const goodFile = path.join(goodDir, "ocean.txt");
  fs.writeFileSync(goodFile, buildMiniWeek({
    title: "Ocean Explorers Pipeline QA",
    age: "Preschool",
    plan: "Free",
    theme: "Ocean",
    status: "published",
  }));
  const goodSources = [{ kind: "file", path: goodFile, label: "ocean.txt" }];
  const parsed = pipeline.parseSources(goodSources);
  assert(parsed.parseErrors.length === 0, "good file parses");
  const validated = pipeline.validatePlans(parsed.plans, {
    strictStandards: false,
    allowDraftGaps: false,
    statusOverride: "",
  });
  assert(validated.blocking.length === 0, `unexpected blocking: ${JSON.stringify(validated.blocking)}`);
  assert(validated.prepared[0].plan.coverImageUrl, "cover auto-assigned in validate");
  assert(validated.coverAudit.newImageFilesCreated === 0, "no new cover files");
  pass("Validate prepares covers without writing");
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(goodDir, { recursive: true, force: true }); } catch { /* ignore */ }
}

async function integrationImportTest() {
  const PORT = 19820 + Math.floor(Math.random() * 40);
  const STORE_PATH = path.join(os.tmpdir(), `llh-bulk-pipe-${crypto.randomBytes(4).toString("hex")}.json`);
  const ADMIN = { email: "bulk-pipe@test.local", password: "bulk-pipe-pass", code: "bulk-pipe-code" };
  const batchDir = fs.mkdtempSync(path.join(os.tmpdir(), "llh-bulk-batch-"));
  const reportPath = path.join(batchDir, "report.json");

  fs.writeFileSync(path.join(batchDir, "01-ocean.txt"), buildMiniWeek({
    title: "Pipeline Ocean Week",
    age: "Preschool",
    plan: "Free",
    theme: "Ocean",
    status: "published",
  }));
  fs.writeFileSync(path.join(batchDir, "02-dino.txt"), buildMiniWeek({
    title: "Pipeline Dinosaur Week",
    age: "Toddler",
    plan: "Pro",
    theme: "Dinosaurs",
    status: "published",
  }));

  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }, null, 2));
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const requestJson = (method, urlPath, body) => new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: "127.0.0.1",
      port: PORT,
      path: urlPath,
      method,
      headers: payload
        ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
        : {},
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
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

  try {
    for (let i = 0; i < 80; i += 1) {
      if (child.exitCode !== null) throw new Error("server exited early");
      try {
        const health = await requestJson("GET", "/api/health");
        if (health.status === 200) break;
      } catch { /* retry */ }
      await new Promise((r) => setTimeout(r, 200));
    }

    const login = await requestJson("POST", "/api/admin/login", ADMIN);
    assert(login.status === 200, "admin login");
    const token = login.json.token;

    // Seed an existing plan that must remain untouched.
    const siteBeforeSeed = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    const existingSave = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken: token,
      expectedUpdatedAt: siteBeforeSeed.json.siteContent?.updatedAt || "",
      lessonPlan: {
        id: "cur-lp-existing-preserve",
        title: "Existing Preserve Plan",
        age: "Infant",
        theme: "Faces",
        plan: "Free",
        status: "published",
        weeklyOverview: "Keep me.",
        objectives: "Stay unchanged.",
        weeklyMaterials: "Mirrors",
        vocabularyWords: "face, smile",
        books: [{ title: "Baby Faces", author: "A", notes: "" }],
        songs: [{ title: "Patty Cake", notes: "" }],
        learningDomains: ["Social Emotional"],
        observationOpportunities: "Watch smiles.",
        familyConnection: "Mirror play at home.",
        adaptations: "Support tummy time.",
        dailyPlans: {
          monday: { items: [{ itemId: "i1", title: "Mirror Me", activityCategory: "Open-Ended Exploration", description: "Look", steps: "1. Show\n2. Smile\n3. Sing" }] },
          tuesday: { items: [{ itemId: "i2", title: "Soft Sounds", activityCategory: "Music & Movement", description: "Listen", steps: "1. Play\n2. Pause\n3. Repeat" }] },
          wednesday: { items: [{ itemId: "i3", title: "Tummy Time", activityCategory: "Gross Motor", description: "Lift", steps: "1. Place\n2. Encourage\n3. Rest" }] },
          thursday: { items: [{ itemId: "i4", title: "Reach Toy", activityCategory: "Fine Motor", description: "Reach", steps: "1. Offer\n2. Cheer\n3. Reset" }] },
          friday: { items: [{ itemId: "i5", title: "Peekaboo", activityCategory: "Circle Time", description: "Peek", steps: "1. Hide\n2. Reveal\n3. Laugh" }] },
        },
      },
    });
    assert(existingSave.status === 200, `seed existing failed: ${existingSave.status} ${existingSave.text}`);
    assert(existingSave.json.lessonPlan.coverImageUrl, "server auto-assigns cover on save");
    const existingFp = postImportVerify.fingerprintPlan(existingSave.json.lessonPlan);

    // Run pipeline against the live local server via env.
    const proc = spawn(
      process.execPath,
      [
        "scripts/curriculum-bulk-import-pipeline.js",
        "--dir", batchDir,
        "--import",
        "--report", reportPath,
        "--id-prefix", "cur-lp-pipe-qa",
      ],
      {
        cwd: ROOT,
        env: {
          ...process.env,
          SITE_URL: `http://127.0.0.1:${PORT}`,
          ADMIN_EMAIL: ADMIN.email,
          ADMIN_PASSWORD: ADMIN.password,
          ADMIN_ACCESS_CODE: ADMIN.code,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (c) => { stdout += String(c); });
    proc.stderr.on("data", (c) => { stderr += String(c); });
    const code = await new Promise((resolve) => proc.on("exit", resolve));
    assert(code === 0, `pipeline exit ${code}\n${stderr}\n${stdout}`);
    assert(fs.existsSync(reportPath), "report written");
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    assert(report.ok === true, `report not ok: ${JSON.stringify(report.critical || report.verification?.critical || report)}`);
    assert(report.import.count === 2, `expected 2 imports, got ${report.import.count}`);
    assert(report.covers.newImageFilesCreated === 0, "no duplicate/new cover files");
    assert(report.import.avgMs < 15000, `import too slow: ${report.import.avgMs}ms avg`);

    const after = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    const plans = after.json.siteContent.curriculum.lessonPlans || [];
    const existingAfter = plans.find((p) => p.id === "cur-lp-existing-preserve");
    assert(existingAfter, "existing plan still present");
    assert(postImportVerify.fingerprintPlan(existingAfter) === existingFp, "existing plan modified");

    const imported = plans.filter((p) => String(p.id).startsWith("cur-lp-pipe-qa"));
    assert(imported.length === 2, `imported ids missing: ${imported.map((p) => p.id)}`);
    for (const plan of imported) {
      assert(plan.coverImageUrl, `${plan.title} missing cover`);
      assert(fs.existsSync(path.join(ROOT, plan.coverImageUrl.replace(/^\//, ""))), `${plan.title} cover file missing`);
      const days = ["monday", "tuesday", "wednesday", "thursday", "friday"]
        .filter((d) => (plan.dailyPlans?.[d]?.items || []).length > 0);
      assert(days.length === 5, `${plan.title} incomplete week`);
    }

    const publicContent = await requestJson("GET", "/api/site-content");
    const publicPlans = publicContent.json.siteContent?.curriculumLibrary?.lessonPlans || [];
    for (const plan of imported) {
      assert(publicPlans.some((p) => p.id === plan.id), `${plan.title} not in public library`);
    }

    pass("Pipeline import + verify + cover auto-assign", `${imported.length} plans, avg ${report.import.avgMs}ms`);
  } finally {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((resolve) => {
        const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* ignore */ } resolve(); }, 3000);
        child.on("exit", () => { clearTimeout(timer); resolve(); });
      });
    }
    try { fs.rmSync(STORE_PATH, { force: true }); } catch { /* ignore */ }
    try { fs.rmSync(batchDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

async function main() {
  try { unitCoverTests(); } catch (error) { fail("Cover assign unit", error.message); }
  try { unitVerifyTests(); } catch (error) { fail("Verify unit", error.message); }
  try { unitValidateFailFast(); } catch (error) { fail("Validate fail-fast", error.message); }
  try { await integrationImportTest(); } catch (error) { fail("Integration import", error.message); }

  // Capacity constants stay aligned
  try {
    assert(pipeline.MAX_LESSON_PLANS >= 2000, "pipeline plan cap");
    assert(pipeline.MAX_ACTIVITIES >= 12000, "pipeline activity cap");
    const serverSrc = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
    assert(/MAX_CURRICULUM_LESSON_PLANS = 2000/.test(serverSrc), "server plan cap");
    assert(/withAutoAssignedLessonCover/.test(serverSrc), "server auto cover wiring");
    pass("Capacity + server wiring aligned");
  } catch (error) {
    fail("Capacity + server wiring", error.message);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\nSummary: ${results.filter((r) => r.ok).length} passed, ${failed.length} failed`);
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
