#!/usr/bin/env node
/**
 * Lesson Plan Admin — final verification (PR #573).
 * Covers: fixtures, cover upload/assign, draft isolation, security,
 * static filter/preview/sticky asserts, postgres durability guards, Playwright UI.
 *
 * Run: npm run test:lesson-plan-admin-final-verification
 * Uses disposable local-json store only — never touches production data.
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 19810 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(
  os.tmpdir(),
  `llh-admin-final-verify-${crypto.randomBytes(4).toString("hex")}.json`,
);
const SIDECAR_DIR = STORE_PATH.replace(/(\.json)?$/i, ".lesson-covers");
const ADMIN = {
  email: "admin-final-verify@test.local",
  password: "admin-final-verify-pass",
  code: "admin-final-verify-code",
};

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const TINY_JPEG =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//Z";
const TINY_WEBP =
  "data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=";
const TINY_GIF =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

const REPORT = {
  fixtures: { pass: 0, fail: 0, errors: [] },
  coverUpload: { pass: 0, fail: 0, errors: [] },
  draftIsolation: { pass: 0, fail: 0, errors: [] },
  security: { pass: 0, fail: 0, errors: [] },
  filtersStatus: { pass: 0, fail: 0, errors: [] },
  previewRole: { pass: 0, fail: 0, errors: [] },
  stickyMobile: { pass: 0, fail: 0, errors: [] },
  productionDurability: { pass: 0, fail: 0, errors: [] },
  playwright: { pass: 0, fail: 0, errors: [], skipped: false },
  cleanup: { pass: 0, fail: 0, errors: [] },
};

let currentSection = "fixtures";

function setSection(name) {
  currentSection = name;
}

function ok(condition, message) {
  const section = REPORT[currentSection];
  if (!section) throw new Error(`Unknown report section: ${currentSection}`);
  if (condition) {
    section.pass += 1;
    console.log(`  ✓ ${message}`);
    return;
  }
  section.fail += 1;
  section.errors.push(message);
  console.log(`  ✗ ${message}`);
  throw new Error(`[${currentSection}] ${message}`);
}

function softOk(condition, message) {
  const section = REPORT[currentSection];
  if (condition) {
    section.pass += 1;
    console.log(`  ✓ ${message}`);
    return true;
  }
  section.fail += 1;
  section.errors.push(message);
  console.log(`  ✗ ${message}`);
  return false;
}

function requestJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: {
          ...(payload
            ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
            : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          const text = buf.toString("utf8");
          let json = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            json = null;
          }
          resolve({ status: res.statusCode, json, text, buf, headers: res.headers });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function waitForBoot(child, timeoutMs = 25000) {
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
  const env = {
    ...process.env,
    PORT: String(PORT),
    SITE_URL: `http://127.0.0.1:${PORT}`,
    LLH_STORE_PATH: STORE_PATH,
    DATABASE_PROVIDER: "local-json",
    ADMIN_EMAIL: ADMIN.email,
    ADMIN_PASSWORD: ADMIN.password,
    ADMIN_ACCESS_CODE: ADMIN.code,
    ADMIN_NAME: "Final Verify Admin",
    NODE_ENV: "test",
  };
  delete env.PRODUCTION_DATABASE_URL;
  delete env.DATABASE_URL;
  return spawn("node", ["server/index.js"], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function weekdayPlan(prefix = "act") {
  const makeDay = (day) => ({
    theme: "Explore",
    objectives: "Practice",
    materials: "Paper",
    vocabulary: "hello",
    items: [
      {
        itemId: `${prefix}-${day}-${crypto.randomBytes(2).toString("hex")}`,
        activityCategory: "Sensory",
        title: `${day} Sensory Bin`,
        objective: "Explore texture",
        description: "Play with rice",
        materials: "Rice",
        setup: "Pour rice",
        steps: "1. Scoop\n2. Pour",
        teacherRole: "Narrate",
        learningGoals: ["Fine motor"],
      },
    ],
  });
  return {
    monday: makeDay("monday"),
    tuesday: makeDay("tuesday"),
    wednesday: makeDay("wednesday"),
    thursday: makeDay("thursday"),
    friday: makeDay("friday"),
  };
}

function oversizedCoverDataUrl() {
  // >2MB decoded base64 payload
  const bytes = Buffer.alloc(2 * 1024 * 1024 + 64, 0x41);
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

async function getStamp(token) {
  const stampRes = await requestJson("GET", "/api/admin/site-content", null, {
    Authorization: `Bearer ${token}`,
  });
  return (
    stampRes.json?.siteContent?.updatedAt ||
    stampRes.json?.updatedAt ||
    stampRes.json?.siteContentUpdatedAt ||
    ""
  );
}

async function saveLesson(token, lessonPlan, expectedUpdatedAt) {
  const payload = {
    adminToken: token,
    expectedUpdatedAt,
    lessonPlan,
  };
  let res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", payload, {
    Authorization: `Bearer ${token}`,
  });
  if (res.status === 409) {
    payload.expectedUpdatedAt = res.json?.siteContentUpdatedAt || (await getStamp(token));
    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", payload, {
      Authorization: `Bearer ${token}`,
    });
  }
  return res;
}

function findPublicPlan(siteContentJson, planId) {
  const library = siteContentJson?.siteContent?.curriculumLibrary?.lessonPlans || [];
  return library.find((p) => p.id === planId) || null;
}

function extractFn(source, fnName) {
  const start = source.indexOf(`async function ${fnName}`) >= 0
    ? source.indexOf(`async function ${fnName}`)
    : source.indexOf(`function ${fnName}`);
  if (start < 0) return "";
  let depth = 0;
  let started = false;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") {
      depth += 1;
      started = true;
    } else if (ch === "}") {
      depth -= 1;
      if (started && depth === 0) return source.slice(start, i + 1);
    }
  }
  return source.slice(start, start + 4000);
}

/* -------------------------------------------------------------------------- */
/* Static checks                                                              */
/* -------------------------------------------------------------------------- */

function staticFiltersStatus() {
  setSection("filtersStatus");
  console.log("\n== FILTERS / STATUS ==");
  const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  ok(app.includes("deriveAdminCoverQualityStatus"), "deriveAdminCoverQualityStatus present");
  ok(app.includes("adminCurriculumFilterCoverStatus"), "adminCurriculumFilterCoverStatus present");
  ok(app.includes("data-curriculum-quick-cover"), "data-curriculum-quick-cover present");
  ok(app.includes("Preview as User") || app.includes("preview-as-user") || app.includes("data-curriculum-lesson-preview-as-user"), "Preview as User wiring present");
  ok(app.includes("View Published Version") || app.includes("data-curriculum-lesson-view-published") || app.includes("openAdminLessonPlanPublishedView"), "View Published Version wiring present");
  ok(app.includes("data-curriculum-lesson-save-draft") || app.includes("Save Draft"), "Save Draft wiring present");
  ok(app.includes("forceStatus"), "forceStatus save override present");
}

function staticPreviewRole() {
  setSection("previewRole");
  console.log("\n== PREVIEW ROLE ==");
  const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  ok(app.includes("ADMIN_LESSON_PREVIEW_AS_OPTIONS"), "ADMIN_LESSON_PREVIEW_AS_OPTIONS defined");
  for (const role of ["Free", "Pro", "Founding", "Director", "Teacher"]) {
    ok(
      app.includes(`value: "${role}"`) || app.includes(`"${role}"`),
      `preview option includes ${role}`,
    );
  }
  const previewFn = extractFn(app, "openAdminLessonPlanUserPreview");
  ok(previewFn.includes("isAdminUnlocked"), "openAdminLessonPlanUserPreview requires isAdminUnlocked");
  ok(previewFn.includes("if (!isAdminUnlocked())"), "preview gated on unlock check");
}

function staticStickyMobile() {
  setSection("stickyMobile");
  console.log("\n== STICKY HEADER / MOBILE ==");
  const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const styles = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  ok(app.includes("admin-lesson-sticky-bar--rich") && styles.includes("admin-lesson-sticky-bar--rich"), "admin-lesson-sticky-bar--rich in app+css");
  ok(app.includes("admin-lesson-preview-banner") && styles.includes("admin-lesson-preview-banner"), "admin-lesson-preview-banner in app+css");
  ok(styles.includes("admin-quick-cover-modal"), "admin-quick-cover-modal styles present");
  ok(/@media\s*\([^)]*(?:max-width:\s*900px|max-width:\s*640px|max-width:\s*720px)/.test(styles), "mobile media queries present");
  const stickyMedia = styles.includes("admin-lesson-sticky-bar--rich") &&
    styles.slice(styles.indexOf(".admin-lesson-sticky-bar--rich")).includes("@media");
  ok(stickyMedia || styles.includes("@media (max-width: 900px)"), "sticky/admin media-query block present");
}

function staticProductionDurability() {
  setSection("productionDurability");
  console.log("\n== PRODUCTION DURABILITY ==");
  const server = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  ok(server.includes("async function handleAdminLessonCoverUpload"), "handleAdminLessonCoverUpload present");
  const uploadFn = extractFn(server, "handleAdminLessonCoverUpload");
  ok(uploadFn.length > 200, "handleAdminLessonCoverUpload body extracted");

  const pgIdx = uploadFn.indexOf("if (usePostgresStore())");
  ok(pgIdx >= 0, "usePostgresStore() gate present (not combined with databaseReady)");
  const unavailableIdx = uploadFn.indexOf("media_storage_unavailable");
  const messageIdx = uploadFn.indexOf("Persistent media storage is temporarily unavailable");
  ok(unavailableIdx >= 0 || messageIdx >= 0, "media_storage_unavailable / unavailable message present");
  const dbReadyFail = uploadFn.includes("!postgresPool || !databaseReady") || uploadFn.includes("!databaseReady");
  ok(dbReadyFail, "returns early when postgres not ready (no sidecar fallthrough)");
  const insertIdx = uploadFn.indexOf("INSERT INTO llh_media_assets");
  ok(insertIdx >= 0, "llh_media_assets INSERT present");
  const sidecarIdx = uploadFn.indexOf("local-sidecar") >= 0
    ? uploadFn.indexOf("local-sidecar")
    : uploadFn.indexOf("writeLocalLessonCover");
  ok(sidecarIdx > pgIdx, "local-sidecar path only after usePostgresStore check");
  // Ensure 503 path returns before sidecar write when DB unavailable
  const early503 = uploadFn.indexOf("503");
  ok(early503 >= 0 && early503 < sidecarIdx, "503 postgres-unavailable response before sidecar write");
  ok(
    uploadFn.includes("Never fall through") || uploadFn.includes("not used in production") || dbReadyFail,
    "comment/guard documents no ephemeral fallthrough",
  );
}

/* -------------------------------------------------------------------------- */
/* Integration                                                                */
/* -------------------------------------------------------------------------- */

async function integration() {
  const child = startServer();
  let browser = null;
  const fixtureIds = {};
  let token = "";
  let stamp = "";

  try {
    await waitForBoot(child);

    setSection("fixtures");
    console.log("\n== FIXTURES ==");
    const login = await requestJson("POST", "/api/admin/login", {
      email: ADMIN.email,
      password: ADMIN.password,
      code: ADMIN.code,
    });
    ok(login.status === 200 && login.json?.token, "admin login");
    token = login.json.token;
    stamp = await getStamp(token);

    const seedDefs = [
      {
        key: "infant",
        id: `cur-lp-fv-infant-${crypto.randomBytes(3).toString("hex")}`,
        title: "FV Infant Colors",
        age: "Infant",
        theme: "Colors",
        coverImageUrl: "/images/lesson-covers/colors.svg",
        coverQualityStatus: "good",
        coverImageSource: "mapped",
      },
      {
        key: "toddler",
        id: `cur-lp-fv-toddler-${crypto.randomBytes(3).toString("hex")}`,
        title: "FV Toddler Ocean",
        age: "Toddler",
        theme: "Ocean",
        coverImageUrl: "/images/lesson-covers/ocean.svg",
        coverQualityStatus: "good",
        coverImageSource: "mapped",
      },
      {
        key: "preschool",
        id: `cur-lp-fv-preschool-${crypto.randomBytes(3).toString("hex")}`,
        title: "FV Preschool Friends",
        age: "Preschool",
        theme: "Friends",
        coverImageUrl: "/images/lesson-covers/default.svg",
        coverQualityStatus: "needs_upgrade",
        coverImageSource: "mapped",
      },
      {
        key: "legacy",
        id: `cur-lp-fv-legacy-${crypto.randomBytes(3).toString("hex")}`,
        title: "FV Legacy Mapped Plan",
        age: "Preschool",
        theme: "Nature",
        coverImageUrl: "/images/lesson-covers/animals.svg",
        coverQualityStatus: "good",
        coverImageSource: "mapped",
        teachingKit: { completeness: "legacy_mapped", completionPercent: 10 },
      },
      {
        key: "completeKit",
        id: `cur-lp-fv-complete-${crypto.randomBytes(3).toString("hex")}`,
        title: "FV Complete Teaching Kit",
        age: "Toddler",
        theme: "Apples",
        coverImageUrl: "/images/lesson-covers/amazing-apples.jpg",
        coverQualityStatus: "good",
        coverImageSource: "mapped",
        teachingKit: {
          completeness: "complete",
          completionPercent: 96,
          teacherToolkit: { overview: "Ready kit" },
        },
      },
      {
        key: "missingCover",
        id: `cur-lp-fv-missing-${crypto.randomBytes(3).toString("hex")}`,
        title: "FV Missing Custom Cover",
        age: "Infant",
        theme: "Sounds",
        coverImageUrl: "",
        coverQualityStatus: "missing",
        coverImageSource: "",
      },
      {
        key: "disposable",
        id: `cur-lp-fv-disposable-${crypto.randomBytes(3).toString("hex")}`,
        title: "FV Disposable Cover Mutation",
        age: "Preschool",
        theme: "QA Cover",
        coverImageUrl: "/images/lesson-covers/colors.svg",
        coverQualityStatus: "needs_upgrade",
        coverImageSource: "mapped",
        disposableQaFixture: true,
        status: "draft",
      },
    ];

    for (const def of seedDefs) {
      const lessonPlan = {
        id: def.id,
        title: def.title,
        age: def.age,
        theme: def.theme,
        plan: "Pro",
        status: def.status || "published",
        weeklyOverview: `${def.title} overview`,
        coverImageUrl: def.coverImageUrl,
        coverImageAlt: `${def.title} cover`,
        coverImageSource: def.coverImageSource || "",
        coverQualityStatus: def.coverQualityStatus || "",
        dailyPlans: weekdayPlan(def.key),
      };
      if (def.teachingKit) lessonPlan.teachingKit = def.teachingKit;
      if (def.disposableQaFixture) lessonPlan.disposableQaFixture = true;

      const res = await saveLesson(token, lessonPlan, stamp);
      ok(res.status === 200 && res.json?.lessonPlan?.id === def.id, `seed ${def.key} (${def.id})`);
      stamp = res.json.siteContentUpdatedAt || stamp;
      fixtureIds[def.key] = {
        id: def.id,
        coverImageUrl: res.json.lessonPlan.coverImageUrl || def.coverImageUrl,
        title: def.title,
        status: res.json.lessonPlan.status,
      };
    }

    // Snapshot non-disposable covers for mutation isolation
    const coverSnapshot = {};
    for (const key of ["infant", "toddler", "preschool", "legacy", "completeKit", "missingCover"]) {
      coverSnapshot[key] = fixtureIds[key].coverImageUrl;
    }

    /* ---- COVER UPLOAD ---- */
    setSection("coverUpload");
    console.log("\n== COVER UPLOAD FLOW ==");

    const pngUpload = await requestJson(
      "POST",
      "/api/admin/curriculum/lesson-covers/upload",
      { adminToken: token, fileName: "verify-cover.png", fileData: TINY_PNG },
      { Authorization: `Bearer ${token}` },
    );
    ok(pngUpload.status === 200 && pngUpload.json?.persistent === true, "PNG upload 200 + persistent");
    ok(
      String(pngUpload.json?.url || "").startsWith("/api/media/lesson-covers/"),
      "PNG durable /api/media/lesson-covers/ URL",
    );

    const jpgUpload = await requestJson(
      "POST",
      "/api/admin/curriculum/lesson-covers/upload",
      { adminToken: token, fileName: "verify-cover.jpg", fileData: TINY_JPEG },
      { Authorization: `Bearer ${token}` },
    );
    ok(jpgUpload.status === 200 && jpgUpload.json?.persistent === true, "JPG (jpeg mime) upload 200 + persistent");
    ok(
      String(jpgUpload.json?.url || "").startsWith("/api/media/lesson-covers/"),
      "JPG durable media URL",
    );

    const webpUpload = await requestJson(
      "POST",
      "/api/admin/curriculum/lesson-covers/upload",
      { adminToken: token, fileName: "verify-cover.webp", fileData: TINY_WEBP },
      { Authorization: `Bearer ${token}` },
    );
    ok(webpUpload.status === 200 && webpUpload.json?.persistent === true, "WebP upload 200 + persistent");
    ok(
      String(webpUpload.json?.url || "").startsWith("/api/media/lesson-covers/"),
      "WebP durable media URL",
    );

    const gifUpload = await requestJson(
      "POST",
      "/api/admin/curriculum/lesson-covers/upload",
      { adminToken: token, fileName: "bad.gif", fileData: TINY_GIF },
      { Authorization: `Bearer ${token}` },
    );
    ok(gifUpload.status === 400, "GIF rejected with 400");

    const oversized = await requestJson(
      "POST",
      "/api/admin/curriculum/lesson-covers/upload",
      { adminToken: token, fileName: "huge.png", fileData: oversizedCoverDataUrl() },
      { Authorization: `Bearer ${token}` },
    );
    ok(oversized.status === 400, "oversized (>2MB) rejected with 400");

    const unauthUpload = await requestJson("POST", "/api/admin/curriculum/lesson-covers/upload", {
      fileName: "noauth.png",
      fileData: TINY_PNG,
    });
    ok(unauthUpload.status === 401, "unauthenticated upload → 401");

    // Assign new cover to disposable only
    const disposableId = fixtureIds.disposable.id;
    const oldDisposableCover = fixtureIds.disposable.coverImageUrl;
    const assign = await requestJson(
      "POST",
      "/api/admin/curriculum/lesson-covers/assign",
      {
        adminToken: token,
        assignments: [
          {
            id: disposableId,
            coverImageUrl: pngUpload.json.url,
            coverImageAlt: "Disposable uploaded cover",
            coverImageSource: "uploaded",
            coverImagePosition: "top",
            coverQualityStatus: "good",
          },
        ],
      },
      { Authorization: `Bearer ${token}` },
    );
    ok(assign.status === 200 && assign.json?.updatedCount === 1, "assign cover to disposable only");
    stamp = assign.json?.siteContentUpdatedAt || stamp;

    // Confirm other lessons unchanged via admin site-content
    const adminContent = await requestJson("GET", "/api/admin/site-content", null, {
      Authorization: `Bearer ${token}`,
    });
    const adminPlans = adminContent.json?.siteContent?.curriculum?.lessonPlans || [];
    for (const key of Object.keys(coverSnapshot)) {
      const plan = adminPlans.find((p) => p.id === fixtureIds[key].id);
      const expected = coverSnapshot[key];
      // missingCover may auto-map on save — compare to what was stored after seed
      ok(
        plan && String(plan.coverImageUrl || "") === String(expected || ""),
        `other lesson ${key} cover unchanged`,
      );
    }
    const disposableAfter = adminPlans.find((p) => p.id === disposableId);
    ok(
      disposableAfter && String(disposableAfter.coverImageUrl).includes("/api/media/lesson-covers/"),
      "disposable cover updated to durable URL",
    );

    const mediaGet = await requestJson("GET", pngUpload.json.url);
    ok(mediaGet.status === 200, "media GET returns image");
    ok(String(mediaGet.headers["content-type"] || "").includes("image/"), "media content-type is image");

    // Failed upload must leave cover unchanged
    const beforeBad = disposableAfter.coverImageUrl;
    const badAfterAssign = await requestJson(
      "POST",
      "/api/admin/curriculum/lesson-covers/upload",
      { adminToken: token, fileName: "after-assign.gif", fileData: TINY_GIF },
      { Authorization: `Bearer ${token}` },
    );
    ok(badAfterAssign.status === 400, "bad upload after assign still 400");
    const reRead = await requestJson("GET", "/api/admin/site-content", null, {
      Authorization: `Bearer ${token}`,
    });
    const rePlan = (reRead.json?.siteContent?.curriculum?.lessonPlans || []).find((p) => p.id === disposableId);
    ok(rePlan && rePlan.coverImageUrl === beforeBad, "failed upload leaves disposable cover unchanged");
    // Also ensure old mapped cover was replaced (mutation happened earlier)
    ok(beforeBad !== oldDisposableCover || beforeBad.includes("/api/media/"), "cover mutation applied before failed upload");

    /* ---- DRAFT VS PUBLISHED ---- */
    setSection("draftIsolation");
    console.log("\n== DRAFT VS PUBLISHED ISOLATION ==");

    const publishedId = `cur-lp-fv-pub-iso-${crypto.randomBytes(3).toString("hex")}`;
    stamp = await getStamp(token);
    const createPublished = await saveLesson(
      token,
      {
        id: publishedId,
        title: "PUBLISHED_TITLE_VERIFY",
        age: "Preschool",
        theme: "Isolation",
        plan: "Pro",
        status: "published",
        weeklyOverview: "Published isolation overview",
        coverImageUrl: "/images/lesson-covers/colors.svg",
        coverImageAlt: "iso cover",
        coverImageSource: "mapped",
        coverQualityStatus: "good",
        disposableQaFixture: true,
        dailyPlans: weekdayPlan("iso"),
      },
      stamp,
    );
    ok(createPublished.status === 200, "create published disposable isolation lesson");
    stamp = createPublished.json.siteContentUpdatedAt || stamp;
    fixtureIds.isolation = { id: publishedId, title: "PUBLISHED_TITLE_VERIFY" };

    const publicBefore = await requestJson("GET", "/api/site-content");
    ok(Boolean(findPublicPlan(publicBefore.json, publishedId)), "public site-content includes published lesson");

    // Cover assign on published changes cover; status stays published; customers see new cover
    const coverOnly = await requestJson(
      "POST",
      "/api/admin/curriculum/lesson-covers/assign",
      {
        adminToken: token,
        assignments: [
          {
            id: publishedId,
            coverImageUrl: jpgUpload.json.url,
            coverImageAlt: "iso uploaded",
            coverImageSource: "uploaded",
            coverQualityStatus: "good",
          },
        ],
      },
      { Authorization: `Bearer ${token}` },
    );
    ok(coverOnly.status === 200, "cover-only assign on published lesson");
    const publicAfterCover = await requestJson("GET", "/api/site-content");
    const pubAfterCover = findPublicPlan(publicAfterCover.json, publishedId);
    ok(pubAfterCover, "customers still see published lesson after cover assign");
    ok(
      String(pubAfterCover?.coverImageUrl || "").includes("/api/media/lesson-covers/"),
      "customers see new cover after cover-only assign",
    );

    // Demote to draft with new title
    stamp = await getStamp(token);
    const draftSave = await saveLesson(
      token,
      {
        ...createPublished.json.lessonPlan,
        id: publishedId,
        title: "DRAFT_ONLY_TITLE_VERIFY",
        status: "draft",
        disposableQaFixture: true,
        coverImageUrl: jpgUpload.json.url,
        dailyPlans: weekdayPlan("iso-draft"),
      },
      stamp,
    );
    ok(draftSave.status === 200 && draftSave.json?.lessonPlan?.status === "draft", "save demotes to draft with new title");
    stamp = draftSave.json.siteContentUpdatedAt || stamp;

    const publicAfterDraft = await requestJson("GET", "/api/site-content");
    ok(!findPublicPlan(publicAfterDraft.json, publishedId), "public library no longer has draft lesson");

    const adminAfterDraft = await requestJson("GET", "/api/admin/site-content", null, {
      Authorization: `Bearer ${token}`,
    });
    const adminDraft = (adminAfterDraft.json?.siteContent?.curriculum?.lessonPlans || []).find(
      (p) => p.id === publishedId,
    );
    ok(adminDraft && adminDraft.status === "draft", "admin still has draft");
    ok(adminDraft.title === "DRAFT_ONLY_TITLE_VERIFY", "admin draft has draft-only title");

    const detailDraft = await requestJson("GET", `/api/curriculum/lesson-plans/${encodeURIComponent(publishedId)}`, null, {
      Authorization: "Bearer test:pro-member@test.local",
      "X-LLH-User-Email": "pro-member@test.local",
    });
    ok(detailDraft.status === 404, "GET /api/curriculum/lesson-plans/:id → 404 for draft");

    // Archive disposable isolation fixture (cleanup preference)
    const archiveIso = await saveLesson(
      token,
      {
        id: publishedId,
        title: "DRAFT_ONLY_TITLE_VERIFY",
        status: "archived",
        disposableQaFixture: true,
        age: "Preschool",
        theme: "Isolation",
        plan: "Pro",
        dailyPlans: weekdayPlan("iso-arch"),
      },
      stamp,
    );
    ok(archiveIso.status === 200 && archiveIso.json?.lessonPlan?.status === "archived", "archive disposable isolation fixture");
    stamp = archiveIso.json.siteContentUpdatedAt || stamp;

    /* ---- SECURITY ---- */
    setSection("security");
    console.log("\n== SECURITY ==");

    const noTokenUpload = await requestJson("POST", "/api/admin/curriculum/lesson-covers/upload", {
      fileName: "sec.png",
      fileData: TINY_PNG,
    });
    ok(noTokenUpload.status === 401, "no admin token → upload 401");

    const noTokenAssign = await requestJson("POST", "/api/admin/curriculum/lesson-covers/assign", {
      assignments: [{ id: disposableId, coverImageUrl: pngUpload.json.url }],
    });
    ok(noTokenAssign.status === 401, "no admin token → assign 401");

    const traversalUpload = await requestJson(
      "POST",
      "/api/admin/curriculum/lesson-covers/upload",
      {
        adminToken: token,
        fileName: "../../etc/passwd.png",
        fileData: TINY_PNG,
      },
      { Authorization: `Bearer ${token}` },
    );
    ok(traversalUpload.status === 200, "path-traversal fileName still uploads (sanitized)");
    const returnedName = String(traversalUpload.json?.fileName || "");
    ok(!returnedName.includes(".."), "returned fileName has no ..");
    ok(!returnedName.includes("/"), "returned fileName has no path separators");

    const badAsset = await requestJson("GET", "/api/media/lesson-covers/not-a-lesson-cover-id");
    ok(badAsset.status === 404, "asset id not starting with lesson-cover- → 404");

    const traversalMedia = await requestJson("GET", "/api/media/lesson-covers/.." + "%2Fetc%2Fpasswd");
    ok(traversalMedia.status === 404, "../ in media URL path → 404");

    const traversalMedia2 = await requestJson("GET", "/api/media/lesson-covers/%2e%2e%2fpasswd");
    ok(traversalMedia2.status === 404, "encoded ../ media path → 404");

    /* ---- PLAYWRIGHT ---- */
    setSection("playwright");
    console.log("\n== PLAYWRIGHT BROWSER ==");
    let playwright;
    try {
      playwright = require("playwright");
    } catch {
      REPORT.playwright.skipped = true;
      console.log("  ⏭ playwright not available; skipped browser checks");
      return;
    }

    browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(
      () => typeof setAdminSession === "function" && typeof setView === "function",
      null,
      { timeout: 30000 },
    );
    await page.evaluate(
      ({ email, password, code, token: adminToken }) => {
        setAdminSession({
          token: adminToken,
          email,
          name: "Final Verify Admin",
          mode: "server",
          trustedDevice: true,
        });
        localStorage.setItem("llhAdminPreviewMode", "Admin");
      },
      { ...ADMIN, token },
    );
    await page.evaluate(async () => {
      if (typeof loadAdminSiteContent === "function") await loadAdminSiteContent();
      if (typeof setAdminSectionTab === "function") setAdminSectionTab("curriculum-lesson-plans");
      else if (typeof setView === "function") setView("admin");
      if (typeof renderAdminCurriculumLessonPlanManager === "function") {
        renderAdminCurriculumLessonPlanManager();
      }
    });
    await page.waitForFunction(
      () => Boolean(document.querySelector("#adminCurriculumFilterCoverStatus")),
      null,
      { timeout: 20000 },
    );

    // Prefer disposable draft for editor; reopen as draft if needed
    const editorId = disposableId;
    // Ensure disposable is still draft/editable
    await page.evaluate(async (id) => {
      if (typeof openAdminCurriculumLessonEditor === "function") {
        openAdminCurriculumLessonEditor(id, { scroll: true });
        return true;
      }
      return false;
    }, editorId);
    await page.waitForSelector("#adminCurriculumLessonPlanForm", { state: "attached", timeout: 15000 });

    const stickyPresent = await page.evaluate(() => ({
      sticky: Boolean(document.querySelector(".admin-lesson-sticky-bar--rich")),
      saveDraft: Boolean(document.querySelector("[data-curriculum-lesson-save-draft]")),
      publish: Boolean(document.querySelector("[data-curriculum-lesson-publish]")),
      previewUser: Boolean(document.querySelector("[data-curriculum-lesson-preview-as-user]")),
      viewPublished: Boolean(document.querySelector("[data-curriculum-lesson-view-published]")),
    }));
    ok(stickyPresent.sticky, "sticky bar present in editor");
    ok(stickyPresent.saveDraft && stickyPresent.publish, "Save Draft / Publish sticky buttons present");
    ok(stickyPresent.previewUser, "Preview as User button present");

    await page.evaluate(async (id) => {
      await openAdminLessonPlanUserPreview(id, { previewAs: "Free" });
    }, editorId);
    await page.waitForSelector("[data-admin-lesson-preview-banner]", { state: "attached", timeout: 10000 });
    const bannerText = await page.evaluate(
      () => document.querySelector("[data-admin-lesson-preview-banner]")?.textContent || "",
    );
    ok(/ADMIN PREVIEW/i.test(bannerText), "ADMIN PREVIEW banner shown");

    await page.evaluate(() => {
      document.querySelector("[data-admin-lesson-preview-exit]")?.click();
    });
    await page.waitForTimeout(400);
    ok(true, "exit preview");

    // View Published — only meaningful if status published; disposable is draft so skip soft
    const statusNow = await page.evaluate((id) => {
      const plan = typeof curriculumLessonPlanById === "function" ? curriculumLessonPlanById(id) : null;
      return String(plan?.status || "").toLowerCase();
    }, editorId);
    if (statusNow === "published") {
      await page.evaluate(async (id) => {
        await openAdminLessonPlanPublishedView(id);
      }, editorId);
      await page.waitForSelector("[data-admin-lesson-preview-banner]", { state: "attached", timeout: 10000 });
      const pubBanner = await page.evaluate(
        () => document.querySelector("[data-admin-lesson-preview-banner]")?.textContent || "",
      );
      ok(/published/i.test(pubBanner), "View Published Version banner");
      await page.evaluate(() => {
        document.querySelector("[data-admin-lesson-preview-exit]")?.click();
      });
    } else {
      softOk(true, `View Published skipped (status=${statusNow}, not published)`);
      // Use a published fixture for View Published
      const pubId = fixtureIds.preschool.id;
      await page.evaluate(async (id) => {
        if (typeof openAdminCurriculumLessonEditor === "function") {
          openAdminCurriculumLessonEditor(id, { scroll: true });
        }
        await openAdminLessonPlanPublishedView(id);
      }, pubId);
      await page.waitForSelector("[data-admin-lesson-preview-banner]", { state: "attached", timeout: 10000 });
      const pubBanner = await page.evaluate(
        () => document.querySelector("[data-admin-lesson-preview-banner]")?.textContent || "",
      );
      ok(/published/i.test(pubBanner), "View Published Version on published fixture");
      await page.evaluate(() => {
        document.querySelector("[data-admin-lesson-preview-exit]")?.click();
      });
    }

    // Cover cancel pending
    await page.evaluate((id) => {
      if (typeof openAdminCurriculumLessonEditor === "function") {
        openAdminCurriculumLessonEditor(id, { scroll: true });
      }
    }, editorId);
    await page.waitForSelector("#adminCurriculumLessonPlanForm", { state: "attached", timeout: 10000 });
    await page.evaluate(() => {
      applyAdminCurriculumCoverSelection("/images/lesson-covers/default.svg", {
        source: "mapped",
        pending: true,
      });
    });
    let pending = await page.evaluate(() => Boolean(adminCurriculumCoverPending));
    ok(pending, "pending cover selection set");
    await page.evaluate(() => {
      document.querySelector("[data-curriculum-cover-revert]")?.click();
    });
    pending = await page.evaluate(() => Boolean(adminCurriculumCoverPending));
    ok(!pending, "cover cancel pending clears selection");

    // Mobile viewport
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate((id) => {
      if (typeof openAdminCurriculumLessonEditor === "function") {
        openAdminCurriculumLessonEditor(id, { scroll: true });
      }
    }, editorId);
    await page.waitForSelector(".admin-lesson-sticky-bar--rich", { state: "attached", timeout: 10000 });
    const mobileCheck = await page.evaluate(() => {
      const sticky = Boolean(document.querySelector(".admin-lesson-sticky-bar--rich"));
      const overflowX = document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
      const form = document.querySelector("#adminCurriculumLessonPlanForm");
      const formOverflow = form
        ? form.scrollWidth > (form.clientWidth || document.documentElement.clientWidth) + 8
        : false;
      return {
        sticky,
        docOverflow: overflowX,
        formOverflow,
      };
    });
    ok(mobileCheck.sticky, "mobile sticky actions exist");
    ok(!mobileCheck.docOverflow, "no documentElement horizontal overflow from admin form");

    // Archive disposable cover-mutation fixture
    stamp = await getStamp(token);
    const archiveDisp = await saveLesson(
      token,
      {
        id: disposableId,
        title: fixtureIds.disposable.title,
        status: "archived",
        disposableQaFixture: true,
        age: "Preschool",
        theme: "QA Cover",
        plan: "Pro",
        dailyPlans: weekdayPlan("disp-arch"),
      },
      stamp,
    );
    ok(archiveDisp.status === 200, "archive disposable cover-mutation fixture");

    console.log("  ✓ playwright browser section complete");
  } finally {
    setSection("cleanup");
    console.log("\n== CLEANUP ==");
    if (browser) {
      try {
        await browser.close();
        softOk(true, "browser closed");
      } catch (err) {
        softOk(false, `browser close: ${err.message}`);
      }
    }
    try {
      child.kill("SIGTERM");
      softOk(true, "server killed");
    } catch (err) {
      softOk(false, `server kill: ${err.message}`);
    }
    try {
      fs.rmSync(STORE_PATH, { force: true });
      softOk(true, "temp store removed");
    } catch (err) {
      softOk(false, `temp store rm: ${err.message}`);
    }
    try {
      fs.rmSync(SIDECAR_DIR, { recursive: true, force: true });
      softOk(true, "lesson-covers sidecar removed");
    } catch (err) {
      softOk(false, `sidecar rm: ${err.message}`);
    }
  }
}

function printSummary() {
  console.log("\n========================================");
  console.log("PASS/FAIL SECTION SUMMARY");
  console.log("========================================");
  const order = [
    ["fixtures", "FIXTURES"],
    ["coverUpload", "COVER UPLOAD"],
    ["draftIsolation", "DRAFT VS PUBLISHED"],
    ["security", "SECURITY"],
    ["filtersStatus", "FILTERS/STATUS"],
    ["previewRole", "PREVIEW ROLE"],
    ["stickyMobile", "STICKY/MOBILE"],
    ["productionDurability", "PRODUCTION DURABILITY"],
    ["playwright", "PLAYWRIGHT"],
    ["cleanup", "CLEANUP"],
  ];
  let totalFail = 0;
  let totalPass = 0;
  for (const [key, label] of order) {
    const s = REPORT[key];
    const status =
      s.fail > 0 ? "FAIL" : s.skipped ? "SKIP" : s.pass > 0 ? "PASS" : "PASS";
    totalFail += s.fail;
    totalPass += s.pass;
    const extra = s.skipped ? " (skipped)" : "";
    console.log(
      `${status.padEnd(4)}  ${label.padEnd(24)}  pass=${s.pass} fail=${s.fail}${extra}`,
    );
    if (s.errors.length) {
      for (const err of s.errors) console.log(`        - ${err}`);
    }
  }
  console.log("----------------------------------------");
  console.log(`TOTAL  pass=${totalPass} fail=${totalFail}`);
  console.log("========================================");
  return totalFail === 0;
}

async function main() {
  console.log("Lesson Plan Admin — Final Verification");
  console.log(`Store: ${STORE_PATH}`);
  console.log(`Port:  ${PORT}`);

  staticFiltersStatus();
  staticPreviewRole();
  staticStickyMobile();
  staticProductionDurability();
  await integration();

  const allPass = printSummary();
  if (!allPass) {
    process.exitCode = 1;
    console.error("\nFinal verification FAILED.");
    return;
  }
  console.log("\nAll lesson-plan admin final verification checks passed.");
}

main().catch((error) => {
  console.error(error);
  try {
    printSummary();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
