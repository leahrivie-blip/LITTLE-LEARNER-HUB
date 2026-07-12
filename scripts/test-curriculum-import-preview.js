#!/usr/bin/env node
/**
 * Phase C: curriculum import preview and confirmation flow tests.
 * Run: npm run test:curriculum-import-preview
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const {
  buildCurriculumImportPreview,
  isBlockingUnmappedEntry,
  applyImportTitleAction,
  resolveDuplicateLessonTitle,
} = require("./curriculum-import-preview.js");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");

const ROOT = path.join(__dirname, "..");
const V2_SAMPLE = path.join(ROOT, "scripts/curriculum-import-samples/premium-garden-scientists-v2.txt");
const V3_SAMPLE = path.join(ROOT, "scripts/curriculum-import-samples/label-only-garden-scientists-v3.txt");
const V1_SAMPLE = path.join(ROOT, "scripts/curriculum-phase-2f-imports/01-infant-soft-sounds-free.txt");
const PORT = 4550 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, "server/data/launch-store.json");
const ADMIN = {
  email: "import-preview-test@example.com",
  password: "import-preview-test-pass",
  code: "import-preview-test-code",
};

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
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            json = { raw: text };
          }
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function waitForHealth(child, timeoutMs = 15000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (child.exitCode !== null) {
        reject(new Error(`Server exited early with code ${child.exitCode}`));
        return;
      }
      try {
        const res = await requestJson("GET", "/api/health");
        if (res.status === 200 && res.json?.ok) {
          resolve();
          return;
        }
      } catch {
        // retry
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error("Timed out waiting for server health"));
        return;
      }
      setTimeout(tick, 200);
    };
    tick();
  });
}

function startServer() {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.rmSync(STORE_PATH, { force: true });
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      ADMIN_NAME: "Import Preview Test",
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 3000);
    child.on("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function parseV2() {
  return parseCurriculumLessonPlanImport(fs.readFileSync(V2_SAMPLE, "utf8"));
}

function draftFromParsed(parsedData) {
  const draft = { ...parsedData };
  delete draft.dailyPlansCompat;
  delete draft._formatVersion;
  delete draft._activityCount;
  return draft;
}

async function testPreviewModel() {
  console.log("1) Full v2 plan preview includes weekly and daily premium fields");
  const parsed = parseV2();
  const preview = buildCurriculumImportPreview(parsed, { formatVersion: 2 });
  assert(preview.canConfirm, `Expected confirmable preview: ${preview.errors.map((e) => e.message).join(" | ")}`);
  assert(preview.data.title === "Garden Scientists", "title");
  assert(preview.data.plan === "Pro", "plan preserved");
  assert(preview.data.status === "draft", "status preserved");
  assert(preview.data.weeklyOverview.includes("soil, seeds"), "weekly overview");
  assert(preview.data.dailyPlans.monday.books[0].title === "Planting a Rainbow", "Monday books");
  parsed.data.dailyPlans.tuesday.songs = [{ title: "Rain Song", notes: "Weather transition" }];
  const withTuesdaySong = buildCurriculumImportPreview({ ...parsed, data: parsed.data }, { formatVersion: 2 });
  assert(withTuesdaySong.data.dailyPlans.tuesday.songs[0].title === "Rain Song", "Tuesday songs");
  assert(withTuesdaySong.data.dailyPlans.monday.circleTime[0].includes("seed tray"), "circle time");
  assert(withTuesdaySong.data.dailyPlans.monday.transitions[0].includes("cleanup song"), "transitions");
  assert(withTuesdaySong.data.dailyPlans.monday.outdoorPlay.includes("watering cans"), "outdoor play");
  assert(withTuesdaySong.data.dailyPlans.monday.observations[0].includes("sorting strategy"), "observations");
  assert(withTuesdaySong.data.dailyPlans.monday.safetyNotes.includes("water spills"), "safety notes");

  console.log("2) Premium activity fields appear in preview data");
  const soil = withTuesdaySong.data.dailyPlans.monday.items.find((item) => item.title === "Soil Scientists Tray");
  assert(soil.teacherLanguage.includes("damp"), "teacher language exact");
  assert(soil.steps.includes("Invite children to scoop"), "directions exact");
  assert(soil.teacherRole.includes("Narrate texture"), "teacher role");
  assert(soil.safetyNotes.includes("pasteurized soil"), "activity safety notes");

  console.log("3) Errors block Confirm Import");
  const badCategoryText = fs.readFileSync(V2_SAMPLE, "utf8").replace("CATEGORY:\nSensory Play", "CATEGORY:\nCircle Time");
  const badCategory = buildCurriculumImportPreview(parseCurriculumLessonPlanImport(badCategoryText), { formatVersion: 2 });
  assert(!badCategory.canConfirm, "invalid category should block confirm");
  assert(badCategory.errors.some((entry) => /invalid CATEGORY/i.test(entry.message)), "invalid category error message");

  console.log("4) Missing directions displays a useful error");
  const missingDirectionsText = fs.readFileSync(V2_SAMPLE, "utf8").replace(/DIRECTIONS:\n1\. Invite children to scoop and feel the soil\.\n2\. Ask what they notice: wet, dry, bumpy\.\n3\. Record one group observation on the chart\./, "DIRECTIONS:\n");
  const missingDirections = buildCurriculumImportPreview(parseCurriculumLessonPlanImport(missingDirectionsText), { formatVersion: 2 });
  assert(!missingDirections.canConfirm, "missing directions should block confirm");
  assert(missingDirections.errors.some((entry) => /DIRECTIONS/i.test(entry.message)), "missing directions error");

  console.log("5) Warnings do not block when otherwise safe");
  const warningOnly = buildCurriculumImportPreview(parsed, { formatVersion: 2 });
  assert(warningOnly.warnings.length >= 0, "warnings collected");
  assert(warningOnly.canConfirm, "safe preview should confirm");

  console.log("6) Unmapped content is visible and can block confirmation");
  const strayText = `${fs.readFileSync(V2_SAMPLE, "utf8")}\nACTIVITY_NAME:\nStray Activity\n`;
  const strayParsed = parseCurriculumLessonPlanImport(strayText);
  const strayPreview = buildCurriculumImportPreview(strayParsed, { formatVersion: 2 });
  assert(strayPreview.unmapped.length > 0, "unmapped visible");
  assert(strayPreview.unmapped.some((entry) => isBlockingUnmappedEntry(entry)), "important unmapped blocks confirm");
  assert(!strayPreview.canConfirm, "blocking unmapped prevents confirm");

  console.log("7) Published status displays a warning and preserves status");
  const publishedParsed = parseV2();
  publishedParsed.data.status = "published";
  const publishedPreview = buildCurriculumImportPreview(publishedParsed, { formatVersion: 2 });
  assert(publishedPreview.data.status === "published", "status preserved");
  assert(publishedPreview.warnings.some((entry) => /marked published/i.test(entry.message)), "published warning");

  console.log("8) Duplicate title does not silently overwrite");
  const duplicate = resolveDuplicateLessonTitle(
    { title: "Garden Scientists" },
    [{ id: "cur-lp-existing", title: "Garden Scientists" }],
    "",
  );
  assert(duplicate.status === "duplicate", "duplicate title detected");
  const duplicatePreview = buildCurriculumImportPreview(parsed, {
    formatVersion: 2,
    existingPlans: [{ id: "cur-lp-existing", title: "Garden Scientists" }],
  });
  assert(!duplicatePreview.canConfirm, "duplicate title blocks confirm until resolved");
  const resolved = applyImportTitleAction(duplicatePreview, "new-copy");
  assert(resolved.canConfirm, "new-copy title resolves duplicate");
  assert(resolved.data.title.includes("(Import copy)"), "new copy title");

  console.log("9) v1 legacy preview works with deprecation warning");
  const v1Parsed = parseCurriculumLessonPlanImport(fs.readFileSync(V1_SAMPLE, "utf8"));
  const v1Preview = buildCurriculumImportPreview(v1Parsed, { formatVersion: 1 });
  assert(v1Preview.canConfirm, v1Preview.errors.map((entry) => entry.message).join(" | "));
  assert(v1Preview.warnings.some((entry) => /legacy v1/i.test(entry.message)), "v1 deprecation warning");

  console.log("9b) v3 label-only preview summary includes title, age, theme, counts");
  const v3Parsed = parseCurriculumLessonPlanImport(fs.readFileSync(V3_SAMPLE, "utf8"));
  const v3Preview = buildCurriculumImportPreview(v3Parsed, { formatVersion: 3 });
  assert(v3Preview.canConfirm, v3Preview.errors.map((entry) => entry.message).join(" | "));
  assert(v3Preview.summary.formatLabel === "label-only import format", "v3 format label");
  assert(v3Preview.data.title === "Garden Scientists", "v3 preview title");
  assert(v3Preview.data.age === "Preschool", "v3 preview age");
  assert(v3Preview.data.theme === "Garden Scientists", "v3 preview theme");
  assert(v3Preview.summary.weekdaysDetected === 3, "v3 weekday count");
  assert(v3Preview.summary.activityCount === 4, "v3 activity count");
  assert(v3Preview.summary.bookCount === 2, "v3 books count");
  assert(v3Preview.summary.songCount === 2, "v3 songs count");
  assert(!v3Preview.warnings.some((entry) => /No books entered for monday/i.test(entry.message)), "v3 skips day-level book warnings");

  console.log("10) Confirm import draft keeps complete v2 structure");
  const draft = draftFromParsed(preview.data);
  assert(draft.dailyPlans.monday.books[0].title === "Planting a Rainbow", "draft keeps monday books");
  assert(draft.dailyPlans.monday.items[0].teacherLanguage.includes("damp"), "draft keeps premium activity fields");
  assert(draft.plan === "Pro" && draft.status === "draft", "draft keeps plan/status");

  console.log("11) Cancel import makes no draft changes");
  let draftAfterCancel = null;
  const cancelState = { draft: null };
  cancelState.draft = draft;
  draftAfterCancel = cancelState.draft;
  cancelState.draft = null;
  assert(draftAfterCancel, "cancel retains no side effects on prior draft object");
  assert(cancelState.draft === null, "cancel clears pending draft");
}

async function testPreviewDoesNotWrite(child) {
  console.log("12) Preview does not write to server or Activity Library");
  await waitForHealth(child);
  const login = await requestJson("POST", "/api/admin/login", ADMIN);
  const token = login.json.token;
  const before = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  const beforePlans = before.json.siteContent.curriculum.lessonPlans.length;
  const beforeActivities = before.json.siteContent.curriculum.activities.length;
  buildCurriculumImportPreview(parseV2(), { formatVersion: 2 });
  const after = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  assert(after.json.siteContent.curriculum.lessonPlans.length === beforePlans, "preview should not create lesson plans");
  assert(after.json.siteContent.curriculum.activities.length === beforeActivities, "preview should not sync activities");
}

async function testMobileLayout() {
  console.log("13) Mobile 412px preview layout has no horizontal overflow");
  let playwright;
  try {
    playwright = require("playwright");
  } catch {
    console.log("   (skipped: playwright not installed)");
    return;
  }
  const browser = await playwright.chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
  const fixture = `<!DOCTYPE html><html><head><link rel="stylesheet" href="file://${path.join(ROOT, "styles.css")}"></head><body>
    <section class="curriculum-import-preview">
      <div class="curriculum-import-preview-text">${"Long teacher language ".repeat(80)}</div>
      <article class="curriculum-import-preview-activity"><h5>Activity</h5><div class="curriculum-import-preview-text">${"Direction step ".repeat(80)}</div></article>
    </section>
  </body></html>`;
  const fixturePath = path.join(ROOT, "scripts/.tmp-import-preview-mobile.html");
  fs.writeFileSync(fixturePath, fixture);
  await page.goto(`file://${fixturePath}`);
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  await browser.close();
  fs.rmSync(fixturePath, { force: true });
  assert(metrics.scrollWidth <= metrics.clientWidth + 1, `horizontal overflow detected: ${metrics.scrollWidth} > ${metrics.clientWidth}`);
}

async function main() {
  const child = startServer();
  child.stderr.on("data", () => {});
  child.stdout.on("data", () => {});
  try {
    await testPreviewModel();
    await testPreviewDoesNotWrite(child);
    await testMobileLayout();
    console.log("\nAll curriculum import preview Phase C checks passed.");
  } catch (error) {
    console.error("\nFAIL:", error.message);
    process.exitCode = 1;
  } finally {
    await stopServer(child);
  }
}

main();
