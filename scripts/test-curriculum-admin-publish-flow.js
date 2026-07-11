#!/usr/bin/env node
/**
 * BLOCKER QA: Admin import → draft → publish → public Lesson Plan Library.
 * Uses an isolated store file, server restart, and Playwright user session.
 *
 * Run: node scripts/test-curriculum-admin-publish-flow.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");

const ROOT = path.join(__dirname, "..");
const PORT = 19310 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-publish-flow-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "publish-flow@example.com",
  password: "publish-flow-pass",
  code: "publish-flow-code",
};
const UNIQUE = crypto.randomBytes(4).toString("hex");
const LESSON_TITLE = `QA Publish Flow Lesson ${UNIQUE}`;
const SIMILAR_TITLE = `QA Publish Flow Lesson ${UNIQUE} Copy`;

const IMPORT_TEXT = `
TITLE:
${LESSON_TITLE}

AGE GROUP:
Toddler

THEME:
Rainbow Routines

PLAN:
Free

STATUS:
draft

LEARNING DOMAINS:
Language & Literacy, Creative Arts

WEEKLY OVERVIEW:
Toddlers explore rainbow colors through songs, sensory bins, and cooperative art.

LEARNING OBJECTIVES:
Children will name three rainbow colors.
Children will practice sharing art materials with a peer.

WEEKLY MATERIALS:
Colored scarves, crayons, paper plates, glue sticks, rainbow picture cards

VOCABULARY:
red, orange, yellow, green, blue, rainbow, share

BOOKS:
Planting a Rainbow | Lois Ehlert | Color and garden vocabulary
Mouse Paint | Ellen Stoll Walsh | Color mixing fun

SONGS:
Rainbow Song | Sing color names while pointing to scarves
Color March | March and freeze on each color call

FAMILY CONNECTION:
Ask families to send one small rainbow-colored object for show and tell.

OBSERVATION OPPORTUNITIES:
Note color naming, turn-taking, and enthusiasm during group songs.

ADAPTATIONS:
Offer color cards for children who need visual prompts. Provide taped paper edges for easier tearing.

MONDAY:
ACTIVITY NAME:
Scarf Rainbow Dance
CATEGORY:
Music & Movement
MATERIALS:
Colored scarves, music speaker
SETUP:
Clear a small movement area and place scarves in a basket.
DIRECTIONS:
1. Hand each child a scarf.
2. Play music and invite color waves.
3. Freeze when the music stops.
LEARNING GOAL:
Move safely with music
Name colors during play

ACTIVITY NAME:
Plate Rainbow Glue
CATEGORY:
Fine Motor
MATERIALS:
Paper plates, glue sticks, tissue squares
SETUP:
Set out plates and sorted tissue colors at a table.
DIRECTIONS:
1. Model squeezing glue on the plate edge.
2. Children place tissue colors in rainbow order.
3. Let dry on a drying rack.
LEARNING GOAL:
Strengthen hand muscles
Explore color order

TUESDAY:
ACTIVITY NAME:
Color Card Hunt
CATEGORY:
Open-Ended Exploration
MATERIALS:
Rainbow picture cards, basket
SETUP:
Hide cards around the classroom.
DIRECTIONS:
1. Show one color card at a time.
2. Children search for matching items.
3. Place finds in the basket together.
LEARNING GOAL:
Practice color matching
Build cooperative search skills

WEDNESDAY:
ACTIVITY NAME:
Rainbow Sensory Bin
CATEGORY:
Sensory Play
MATERIALS:
Rice, scoops, rainbow items
SETUP:
Fill a bin with colored rice and tools.
DIRECTIONS:
1. Invite children to scoop and pour.
2. Name colors as they appear.
3. Model gentle sharing of scoops.
LEARNING GOAL:
Explore texture and color
Practice sharing tools

THURSDAY:
ACTIVITY NAME:
Helper Color March
CATEGORY:
Gross Motor
MATERIALS:
Floor dots, music
SETUP:
Place colored dots in a circle path.
DIRECTIONS:
1. March from dot to dot.
2. Call out each color name.
3. Stop and clap at the end.
LEARNING GOAL:
Coordinate steps with cues
Build color vocabulary

FRIDAY:
ACTIVITY NAME:
Rainbow Share Circle
CATEGORY:
Circle Time
MATERIALS:
Color cards, song chart
SETUP:
Children sit in a circle with cards in the middle.
DIRECTIONS:
1. Sing the rainbow song together.
2. Each child picks a card and names the color.
3. Thank the friend beside them.
LEARNING GOAL:
Participate in group time
Practice gratitude language
`.trim();

const CURRICULUM_WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requestJson(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: payload
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
          : {},
        timeout: 45000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = JSON.parse(text); } catch { json = null; }
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
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      LLH_STORE_PATH: STORE_PATH,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      ADMIN_NAME: "Publish Flow QA",
      DATABASE_PROVIDER: "local-json",
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (d) => { output += d; });
  child.stderr.on("data", (d) => { output += d; });
  child.__output = () => output;
  return child;
}

async function waitForBoot(child) {
  for (let i = 0; i < 120; i += 1) {
    if (child.__output().includes("running on")) return;
    if (child.exitCode !== null) throw new Error(`Server exited: ${child.__output()}`);
    await new Promise((r) => setTimeout(r, 100));
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

function parseImport() {
  const parsed = parseCurriculumLessonPlanImport(IMPORT_TEXT, {
    generateItemId: () => `item-${crypto.randomBytes(6).toString("hex")}`,
  });
  assert(parsed.ok, `Import parse failed: ${parsed.errors.join("; ")}`);
  return parsed.data;
}

function flattenItems(plan) {
  const items = [];
  CURRICULUM_WEEKDAYS.forEach((day) => {
    const dayItems = Array.isArray(plan.dailyPlans?.[day]?.items) ? plan.dailyPlans[day].items : [];
    dayItems.forEach((item) => items.push({ ...item, dayOfWeek: day }));
  });
  return items;
}

function publicLessonByTitle(library, title) {
  return (library?.lessonPlans || []).find((plan) => plan.title === title) || null;
}

async function login() {
  const res = await requestJson("POST", "/api/admin/login", {
    email: ADMIN.email,
    password: ADMIN.password,
    code: ADMIN.code,
  });
  assert(res.status === 200 && res.json?.token, `Admin login failed: ${res.status}`);
  return res.json.token;
}

async function getUpdatedAt(token) {
  const res = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  assert(res.status === 200, "Admin site-content read failed");
  return res.json.siteContent?.updatedAt || "";
}

async function saveLesson(token, lessonPlan, expectedUpdatedAt) {
  const res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt,
    lessonPlan,
  });
  return res;
}

async function fetchPublicLibrary() {
  const res = await requestJson("GET", `/api/site-content?t=${Date.now()}`);
  assert(res.status === 200, `Public site-content failed: ${res.status}`);
  return res.json.siteContent?.curriculumLibrary || null;
}

async function runBrowserPublishCheck(baseUrl, lessonTitle, activityCount) {
  let playwright;
  try { playwright = require("playwright"); } catch { return { skipped: true }; }
  const browser = await playwright.chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    localStorage.setItem("llhUser", "publish-flow-user@example.com");
    localStorage.setItem("llhAccounts", JSON.stringify({
      "publish-flow-user@example.com": { email: "publish-flow-user@example.com", plan: "Free", subscriptionStatus: "Free Plan" },
    }));
    localStorage.setItem("llhPlan", "Free");
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { if (typeof setView === "function") setView("lessons"); });
  await page.waitForTimeout(800);
  await page.fill("#lessonPlanSearch", lessonTitle);
  await page.waitForTimeout(500);
  const cards = await page.locator("#view-lessons .resource-card").count();
  assert(cards === 1, `Browser: expected 1 lesson card, got ${cards}`);
  await page.locator("button[data-view-resource]").first().click();
  await page.waitForSelector("#resourceViewerModal.open", { timeout: 15000 });
  const html = await page.locator("#resourceViewerBody").innerHTML();
  assert(html.includes("Rainbow Routines"), "Browser: theme missing in viewer");
  assert(html.includes("Books"), "Browser: books section missing");
  assert(html.includes("Daily Plans"), "Browser: daily plans missing");
  const mondayCards = await page.locator('[data-curriculum-lesson-day-panel="monday"] .curriculum-activity-card').count();
  assert(mondayCards === 2, `Browser: expected 2 Monday activities, got ${mondayCards}`);
  await page.click("#closeResourceViewer");
  await page.locator('button[data-find-lesson-activities]').first().click();
  await page.waitForTimeout(600);
  const activityCards = await page.locator("#view-activities .resource-card").count();
  assert(activityCards === activityCount, `Browser: activity filter expected ${activityCount}, got ${activityCards}`);
  await browser.close();
  return { cards, activityCards, mondayCards };
}

async function main() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  console.log("1) Client publish-path wiring");
  assert(appJs.includes("delete next.curriculumLibrary"), "Missing curriculumLibrary cache invalidation after admin save");
  assert(appJs.includes("hasLoadedPublicLibrary"), "Missing empty curriculumLibrary guard");
  assert(appJs.includes("refreshPublicCurriculumLibrary"), "Missing public library refresh on lessons view");

  const parsed = parseImport();
  assert(parsed.title === LESSON_TITLE, "Import title mismatch");
  assert(parsed.theme === "Rainbow Routines", "Import theme mismatch");
  assert(parsed.books.length >= 2, "Import books missing");
  assert(parsed.songs.length >= 2, "Import songs missing");
  assert(parsed._activityCount >= 6, "Import activity count too low");

  let child = startServer();
  let lessonId = "";
  let expectedUpdatedAt = "";
  let activityCount = 0;
  try {
    await waitForBoot(child);
    const token = await login();
    expectedUpdatedAt = await getUpdatedAt(token);

    console.log("2) Save brand-new lesson as Draft");
    lessonId = `cur-lp-publish-${UNIQUE}`;
    const draftSave = await saveLesson(token, { ...parsed, id: lessonId, status: "draft" }, expectedUpdatedAt);
    assert(draftSave.status === 200, `Draft save failed: ${draftSave.status} ${draftSave.text}`);
    expectedUpdatedAt = draftSave.json.siteContentUpdatedAt;
    activityCount = (draftSave.json.activities || []).filter((a) => a.status !== "archived").length;
    assert(activityCount === parsed._activityCount, `Draft sync expected ${parsed._activityCount} activities, got ${activityCount}`);

    console.log("3) Draft hidden from public API");
    let publicLibrary = await fetchPublicLibrary();
    assert(!publicLessonByTitle(publicLibrary, LESSON_TITLE), "Draft lesson leaked to public API");

    console.log("4) Publish lesson");
    const publishedPlan = { ...draftSave.json.lessonPlan, status: "published", plan: "Free" };
    const publishSave = await saveLesson(token, publishedPlan, expectedUpdatedAt);
    assert(publishSave.status === 200, `Publish save failed: ${publishSave.status} ${publishSave.text}`);
    expectedUpdatedAt = publishSave.json.siteContentUpdatedAt;
    assert(publishSave.json.lessonPlan.status === "published", "Publish response status not published");

    console.log("5) Public API shows published lesson immediately");
    publicLibrary = await fetchPublicLibrary();
    const publicLesson = publicLessonByTitle(publicLibrary, LESSON_TITLE);
    assert(publicLesson, "Published lesson missing from public API");
    assert(publicLesson.age === "Toddler", "Public age mismatch");
    assert(publicLesson.theme === "Rainbow Routines", "Public theme mismatch");
    assert(publicLesson.plan === "Free", "Public plan mismatch");
    assert(publicLesson.weeklyOverview.includes("rainbow"), "Public weekly overview mismatch");
    assert((publicLesson.books || []).length >= 2, "Public books missing");

    const publicActivities = (publicLibrary.activities || []).filter((a) => a.lessonPlanId === lessonId);
    assert(publicActivities.length === activityCount, "Public activity count mismatch");
    assert(publicActivities.every((a) => a.status === "published"), "Public activities must be published");

    console.log("6) Admin reload still Published");
    const adminReload = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    const adminPlan = (adminReload.json.siteContent?.curriculum?.lessonPlans || []).find((p) => p.id === lessonId);
    assert(adminPlan?.status === "published", "Admin reload lost published status");

    console.log("7) Persisted to store file (not memory only)");
    assert(fs.existsSync(STORE_PATH), "Isolated store file missing");
    const storeRaw = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    const storedPlan = (storeRaw.siteContent?.curriculum?.lessonPlans || []).find((p) => p.id === lessonId);
    assert(storedPlan?.status === "published", "Store file missing published lesson");

    console.log("8) Server restart — lesson still public");
    await stopServer(child);
    child = startServer();
    await waitForBoot(child);
    publicLibrary = await fetchPublicLibrary();
    assert(publicLessonByTitle(publicLibrary, LESSON_TITLE), "Lesson missing after server restart");

    console.log("9) Edit published lesson updates public API");
    const token2 = await login();
    expectedUpdatedAt = await getUpdatedAt(token2);
    const editedTitle = `${LESSON_TITLE} Updated`;
    const editSave = await saveLesson(token2, {
      ...publishSave.json.lessonPlan,
      title: editedTitle,
      weeklyOverview: "Updated overview for rainbow routines.",
    }, expectedUpdatedAt);
    assert(editSave.status === 200, `Edit save failed: ${editSave.status}`);
    publicLibrary = await fetchPublicLibrary();
    assert(publicLessonByTitle(publicLibrary, editedTitle), "Edited title missing from public API");
    assert(!publicLessonByTitle(publicLibrary, LESSON_TITLE), "Old title still public after edit");

    console.log("10) Unpublish hides lesson publicly");
    expectedUpdatedAt = editSave.json.siteContentUpdatedAt;
    const unpublishSave = await saveLesson(token2, { ...editSave.json.lessonPlan, status: "draft" }, expectedUpdatedAt);
    assert(unpublishSave.status === 200, "Unpublish save failed");
    publicLibrary = await fetchPublicLibrary();
    assert(!publicLessonByTitle(publicLibrary, editedTitle), "Draft lesson still visible after unpublish");

    console.log("11) Republish returns lesson publicly");
    expectedUpdatedAt = unpublishSave.json.siteContentUpdatedAt;
    const republishSave = await saveLesson(token2, { ...unpublishSave.json.lessonPlan, status: "published" }, expectedUpdatedAt);
    assert(republishSave.status === 200, "Republish save failed");
    publicLibrary = await fetchPublicLibrary();
    assert(publicLessonByTitle(publicLibrary, editedTitle), "Republished lesson missing from public API");

    console.log("12) Similar-title second lesson does not overwrite first");
    expectedUpdatedAt = republishSave.json.siteContentUpdatedAt;
    const secondId = `cur-lp-publish-copy-${UNIQUE}`;
    const secondParsed = parseImport();
    secondParsed.title = SIMILAR_TITLE;
    const secondSave = await saveLesson(token2, { ...secondParsed, id: secondId, status: "published" }, expectedUpdatedAt);
    assert(secondSave.status === 200, "Second lesson save failed");
    publicLibrary = await fetchPublicLibrary();
    assert(publicLessonByTitle(publicLibrary, editedTitle), "Original lesson lost after similar import");
    assert(publicLessonByTitle(publicLibrary, SIMILAR_TITLE), "Second lesson missing");

    console.log("13) Link resource to lesson and verify public metadata");
    expectedUpdatedAt = secondSave.json.siteContentUpdatedAt;
    const resourceId = `cur-res-publish-${UNIQUE}`;
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const resourceSave = await requestJson("POST", "/api/admin/curriculum/resources/save", {
      adminToken: token2,
      expectedUpdatedAt,
      resource: {
        id: resourceId,
        title: "Rainbow Badge QA",
        resourceCategory: "Printables",
        fileData: png,
        fileName: "rainbow-badge.png",
        mimeType: "image/png",
        status: "published",
      },
    });
    assert(resourceSave.status === 200, `Resource save failed: ${resourceSave.status}`);
    const link = await requestJson("POST", "/api/admin/curriculum/resources/link", {
      adminToken: token2,
      expectedUpdatedAt: resourceSave.json.siteContentUpdatedAt,
      resourceId,
      lessonPlanId: lessonId,
    });
    assert(link.status === 200, `Resource link failed: ${link.status}`);
    publicLibrary = await fetchPublicLibrary();
    const linkedLesson = (publicLibrary.lessonPlans || []).find((p) => p.id === lessonId);
    assert((linkedLesson?.resourceIds || []).includes(resourceId), "Public lesson missing linked resource id");
    assert((publicLibrary.resources || []).some((r) => r.id === resourceId), "Linked resource missing from public library");

    console.log("14) Browser user session sees published lesson after refresh");
    const browserResult = await runBrowserPublishCheck(`http://127.0.0.1:${PORT}`, editedTitle, activityCount);
    if (!browserResult.skipped) {
      assert(browserResult.cards === 1, "Browser lesson card check failed");
    }

    console.log("\nAdmin → Publish → Public flow checks passed.");
  } catch (error) {
    console.error("\nFAIL:", error.message);
    process.exitCode = 1;
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main();
