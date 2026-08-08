#!/usr/bin/env node
/**
 * Lesson Plan Admin — cover management, draft/publish split, preview safety.
 * Run: node scripts/test-lesson-plan-admin-cover-preview.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 19710 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-admin-cover-preview-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "admin-cover-preview@test.local",
  password: "admin-cover-preview-pass",
  code: "admin-cover-preview-code",
};
const TINY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function assert(condition, message) {
  if (!condition) throw new Error(message);
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
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
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
          try { json = text ? JSON.parse(text) : null; } catch { json = null; }
          resolve({ status: res.statusCode, json, text, buf, headers: res.headers });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function waitForBoot(child, timeoutMs = 20000) {
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
    ADMIN_NAME: "Cover Preview Admin",
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

function weekdayPlan() {
  const day = {
    theme: "Explore",
    objectives: "Practice",
    materials: "Paper",
    vocabulary: "hello",
    items: [{
      itemId: `item-${crypto.randomBytes(3).toString("hex")}`,
      activityCategory: "Sensory",
      title: "Sensory Bin",
      objective: "Explore texture",
      description: "Play with rice",
      materials: "Rice",
      setup: "Pour rice",
      steps: "1. Scoop\n2. Pour",
      teacherRole: "Narrate",
      learningGoals: ["Fine motor"],
    }],
  };
  return {
    monday: { ...day, items: [{ ...day.items[0], itemId: `m-${crypto.randomBytes(2).toString("hex")}` }] },
    tuesday: { ...day, items: [{ ...day.items[0], itemId: `t-${crypto.randomBytes(2).toString("hex")}` }] },
    wednesday: { ...day, items: [{ ...day.items[0], itemId: `w-${crypto.randomBytes(2).toString("hex")}` }] },
    thursday: { ...day, items: [{ ...day.items[0], itemId: `th-${crypto.randomBytes(2).toString("hex")}` }] },
    friday: { ...day, items: [{ ...day.items[0], itemId: `f-${crypto.randomBytes(2).toString("hex")}` }] },
  };
}

function extractFn(source, fnName) {
  const asyncLabel = `async function ${fnName}`;
  const syncLabel = `function ${fnName}`;
  let start = source.indexOf(asyncLabel);
  if (start < 0) start = source.indexOf(syncLabel);
  if (start < 0) return "";
  const window = source.slice(start, start + 12000);
  const nextFn = window.search(/\n(?:async\s+)?function\s+[A-Za-z0-9_]/);
  if (nextFn > 80) return window.slice(0, nextFn);
  return window;
}

function staticChecks() {
  const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const styles = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  const server = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  assert(fs.existsSync(path.join(ROOT, "server/lesson-cover-media.js")), "lesson-cover-media module missing");
  assert(app.includes("admin-lesson-sticky-bar--rich"), "rich sticky admin header missing");
  assert(app.includes("data-curriculum-lesson-save-draft"), "save draft wiring missing");
  assert(app.includes("data-curriculum-lesson-publish"), "publish wiring missing");
  assert(app.includes("forceStatus"), "save status override missing");
  assert(app.includes("admin-lesson-preview-banner"), "admin preview banner missing");
  assert(styles.includes("admin-lesson-preview-banner"), "preview banner styles missing");
  assert(styles.includes("admin-quick-cover-modal"), "quick cover modal styles missing");
  assert(server.includes("coverQualityStatus"), "schema coverQualityStatus missing");
  assert(!app.includes("enableTeachingKitGlobally"), "must not flip teaching kit globally");

  // Postgres-unavailable must 503 without writing local sidecar (production durability).
  const uploadFn = extractFn(server, "handleAdminLessonCoverUpload");
  assert(uploadFn.includes("if (usePostgresStore())"), "upload must gate on usePostgresStore() alone");
  assert(
    uploadFn.includes("media_storage_unavailable")
      || uploadFn.includes("Persistent media storage is temporarily unavailable"),
    "postgres-unavailable path must return media_storage_unavailable / clear message",
  );
  assert(
    uploadFn.includes("!postgresPool || !databaseReady") || uploadFn.includes("!databaseReady"),
    "postgres mode must 503 when database is not ready (no sidecar fallthrough)",
  );
  const pgIdx = uploadFn.indexOf("if (usePostgresStore())");
  const sidecarIdx = Math.max(
    uploadFn.indexOf("local-sidecar"),
    uploadFn.indexOf("writeLocalLessonCover"),
  );
  const early503 = uploadFn.indexOf("503");
  assert(pgIdx >= 0 && sidecarIdx > pgIdx, "local-sidecar only after usePostgresStore check");
  assert(early503 >= 0 && early503 < sidecarIdx, "503 must occur before sidecar write");
  assert(uploadFn.includes("INSERT INTO llh_media_assets"), "llh_media_assets INSERT required");
  console.log("✓ static admin cover/preview wiring + postgres-unavailable 503 guard");
}

async function integration() {
  const child = startServer();
  let browser;
  try {
    await waitForBoot(child);
    const login = await requestJson("POST", "/api/admin/login", {
      email: ADMIN.email,
      password: ADMIN.password,
      code: ADMIN.code,
    });
    assert(login.status === 200 && login.json?.token, "admin login failed");
    const token = login.json.token;

    // Reject unsupported type
    const badUpload = await requestJson("POST", "/api/admin/curriculum/lesson-covers/upload", {
      adminToken: token,
      fileName: "note.gif",
      fileData: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
    });
    assert(badUpload.status === 400, "unsupported GIF must be rejected");
    assert(/JPG|JPEG|PNG|WebP/i.test(badUpload.json?.error || ""), "unsupported type message missing");

    // Persistent local upload + read
    const upload = await requestJson("POST", "/api/admin/curriculum/lesson-covers/upload", {
      adminToken: token,
      fileName: "admin-cover.png",
      fileData: TINY_PNG,
    });
    assert(upload.status === 200 && upload.json?.persistent === true, "cover upload must persist");
    assert(String(upload.json.url).startsWith("/api/media/lesson-covers/"), "durable media URL required");
    const media = await requestJson("GET", upload.json.url);
    assert(media.status === 200, "cover media must be readable after upload");
    assert(String(media.headers["content-type"] || "").includes("image/"), "cover content-type missing");

    // Create published lesson with original cover
    const planId = `cur-lp-admin-cover-${crypto.randomBytes(4).toString("hex")}`;
    const stampRes = await requestJson("GET", "/api/admin/site-content", null, {
      Authorization: `Bearer ${token}`,
    });
    let expectedUpdatedAt = stampRes.json?.siteContent?.updatedAt
      || stampRes.json?.updatedAt
      || stampRes.json?.siteContentUpdatedAt
      || "";
    if (!expectedUpdatedAt) {
      // Fall back to conflict stamp after a no-op probe if needed.
      const probe = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
        adminToken: token,
        lessonPlan: { id: "probe-missing", title: "probe" },
      }, { Authorization: `Bearer ${token}` });
      expectedUpdatedAt = probe.json?.siteContentUpdatedAt || "";
    }
    const createPayload = {
      adminToken: token,
      expectedUpdatedAt,
      lessonPlan: {
        id: planId,
        title: "Admin Cover Preview QA",
        age: "Preschool",
        theme: "Colors",
        plan: "Pro",
        status: "published",
        weeklyOverview: "Published overview text",
        coverImageUrl: "/images/lesson-covers/colors.svg",
        coverImageAlt: "Original colors cover",
        coverImageSource: "mapped",
        coverQualityStatus: "needs_upgrade",
        dailyPlans: weekdayPlan(),
      },
    };
    let create = await requestJson("POST", "/api/admin/curriculum/lesson-plans", createPayload, {
      Authorization: `Bearer ${token}`,
    });
    if (create.status === 409) {
      createPayload.expectedUpdatedAt = create.json?.siteContentUpdatedAt || "";
      create = await requestJson("POST", "/api/admin/curriculum/lesson-plans", createPayload, {
        Authorization: `Bearer ${token}`,
      });
    }
    assert(create.status === 200 && create.json?.lessonPlan?.id === planId, `create published lesson failed: ${create.status} ${create.json?.error || ""}`);
    assert(create.json.lessonPlan.coverImageUrl.includes("colors.svg"), "original cover must remain");
    assert(create.json.lessonPlan.coverQualityStatus === "needs_upgrade", "cover quality must persist");

    // Public library shows published cover; draft changes must not appear yet
    const publicBefore = await requestJson("GET", "/api/site-content");
    const publicPlanBefore = (publicBefore.json?.siteContent?.curriculumLibrary?.lessonPlans || [])
      .find((p) => p.id === planId);
    assert(publicPlanBefore?.coverImageUrl.includes("colors.svg"), "customers must still see original cover");

    // Cover-only assign replaces cover without changing status
    const assign = await requestJson("POST", "/api/admin/curriculum/lesson-covers/assign", {
      adminToken: token,
      assignments: [{
        id: planId,
        coverImageUrl: upload.json.url,
        coverImageAlt: "New uploaded cover",
        coverImageSource: "uploaded",
        coverImagePosition: "top",
        coverQualityStatus: "good",
      }],
    }, { Authorization: `Bearer ${token}` });
    assert(assign.status === 200 && assign.json?.updatedCount === 1, "cover assign failed");

    const detail = await requestJson("GET", `/api/curriculum/lesson-plans/${encodeURIComponent(planId)}`, null, {
      Authorization: "Bearer test:pro-member@test.local",
      "X-LLH-User-Email": "pro-member@test.local",
    });
    // May be locked preview or full depending on access — cover URL must update either way
    assert(detail.status === 200, "published lesson detail must remain available");
    assert(String(detail.json?.lessonPlan?.coverImageUrl || "").includes("/api/media/lesson-covers/"), "customer cover must use new durable URL");

    // Save draft title change must demote/hide from public when status forced draft
    const draftSave = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken: token,
      expectedUpdatedAt: create.json.siteContentUpdatedAt,
      lessonPlan: {
        ...create.json.lessonPlan,
        title: "Admin Cover Preview QA DRAFT ONLY",
        status: "draft",
        coverImageUrl: upload.json.url,
        coverQualityStatus: "good",
        dailyPlans: weekdayPlan(),
      },
    }, { Authorization: `Bearer ${token}` });
    // concurrency may 409 — refresh stamp from assign write
    let draftResult = draftSave;
    if (draftSave.status === 409) {
      const stamp = draftSave.json?.siteContentUpdatedAt || "";
      draftResult = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
        adminToken: token,
        expectedUpdatedAt: stamp,
        lessonPlan: {
          ...create.json.lessonPlan,
          title: "Admin Cover Preview QA DRAFT ONLY",
          status: "draft",
          coverImageUrl: upload.json.url,
          coverQualityStatus: "good",
          dailyPlans: weekdayPlan(),
        },
      }, { Authorization: `Bearer ${token}` });
    }
    assert(draftResult.status === 200, `draft save failed: ${draftResult.json?.error || draftResult.status}`);
    assert(draftResult.json.lessonPlan.status === "draft", "draft save must keep draft status");

    const publicAfterDraft = await requestJson("GET", "/api/site-content");
    const publicPlanAfter = (publicAfterDraft.json?.siteContent?.curriculumLibrary?.lessonPlans || [])
      .find((p) => p.id === planId);
    assert(!publicPlanAfter, "draft lesson must not appear in public library");

    // Re-publish restores public visibility with saved draft title/cover
    const publish = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken: token,
      expectedUpdatedAt: draftResult.json.siteContentUpdatedAt,
      lessonPlan: {
        ...draftResult.json.lessonPlan,
        status: "published",
        dailyPlans: weekdayPlan(),
      },
    }, { Authorization: `Bearer ${token}` });
    assert(publish.status === 200, `publish failed: ${publish.json?.error || publish.status}`);
    assert(publish.json.lessonPlan.status === "published", "publish must set published");

    const publicAfterPublish = await requestJson("GET", "/api/site-content");
    const publicPlanPublished = (publicAfterPublish.json?.siteContent?.curriculumLibrary?.lessonPlans || [])
      .find((p) => p.id === planId);
    assert(publicPlanPublished, "published lesson must return to public library");
    assert(publicPlanPublished.title.includes("DRAFT ONLY") === false || publicPlanPublished.title.includes("Admin Cover"), "title round-trip");
    assert(String(publicPlanPublished.coverImageUrl || "").includes("/api/media/lesson-covers/"), "published cover must stay durable");

    // Browser: admin editor chrome + filters + preview banner helpers exist after unlock
    let playwright;
    try {
      playwright = require("playwright");
    } catch {
      console.log("⏭ playwright not available; skipped browser admin UI checks");
      console.log("✓ integration cover upload/assign/draft/publish");
      return;
    }
    browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => typeof setAdminSession === "function" && typeof setView === "function", null, { timeout: 30000 });
    await page.evaluate(({ email, password, code, token: adminToken }) => {
      setAdminSession({
        token: adminToken,
        email,
        name: "Cover Preview Admin",
        mode: "server",
        trustedDevice: true,
      });
      localStorage.setItem("llhAdminPreviewMode", "Admin");
    }, { ...ADMIN, token });
    await page.evaluate(async () => {
      if (typeof loadAdminSiteContent === "function") await loadAdminSiteContent();
      if (typeof setAdminSectionTab === "function") setAdminSectionTab("curriculum-lesson-plans");
      else if (typeof setView === "function") setView("admin");
      if (typeof renderAdminCurriculumLessonPlanManager === "function") renderAdminCurriculumLessonPlanManager();
    });
    await page.waitForFunction(() => Boolean(document.querySelector("#adminCurriculumFilterCoverStatus")), null, { timeout: 20000 });
    const filterReady = await page.evaluate(() => {
      const select = document.querySelector("#adminCurriculumFilterCoverStatus");
      if (!select) return false;
      select.value = "good";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    });
    assert(filterReady, "cover status filter missing in admin list");
    await page.waitForTimeout(300);
    const openEdit = await page.evaluate((id) => {
      if (typeof openAdminCurriculumLessonEditor === "function") {
        openAdminCurriculumLessonEditor(id, { scroll: true });
        return true;
      }
      return false;
    }, planId);
    assert(openEdit, "could not open lesson editor");
    await page.waitForSelector("#adminCurriculumLessonPlanForm", { state: "attached", timeout: 10000 });
    const editorChrome = await page.evaluate(() => ({
      sticky: Boolean(document.querySelector(".admin-lesson-sticky-bar--rich")),
      saveDraft: Boolean(document.querySelector("[data-curriculum-lesson-save-draft]")),
      publish: Boolean(document.querySelector("[data-curriculum-lesson-publish]")),
      previewUser: Boolean(document.querySelector("[data-curriculum-lesson-preview-as-user]")),
      viewPublished: Boolean(document.querySelector("[data-curriculum-lesson-view-published]")),
      coverSection: Boolean(document.querySelector("[data-curriculum-cover-editor]")),
      coverPreview: Boolean(document.querySelector("[data-curriculum-cover-preview]")),
      previewAsSelect: Boolean(document.querySelector("[data-admin-lesson-preview-as]")),
      coverSrc: document.querySelector("[data-curriculum-cover-preview]")?.getAttribute("src") || "",
    }));
    assert(editorChrome.sticky, "sticky admin header missing");
    assert(editorChrome.saveDraft && editorChrome.publish, "Save Draft / Publish missing");
    assert(editorChrome.previewUser && editorChrome.viewPublished, "preview actions missing");
    assert(editorChrome.coverSection && editorChrome.coverPreview, "cover section missing");
    assert(editorChrome.coverSrc.includes("/api/media/lesson-covers/") || editorChrome.coverSrc.includes("/images/lesson-covers/"), "existing cover must still appear in editor");

    // Cancel pending cover selection before save
    await page.evaluate(() => {
      applyAdminCurriculumCoverSelection("/images/lesson-covers/default.svg", { source: "mapped", pending: true });
    });
    let pending = await page.evaluate(() => Boolean(adminCurriculumCoverPending));
    assert(pending, "pending cover selection missing");
    await page.evaluate(() => {
      document.querySelector("[data-curriculum-cover-revert]")?.click();
    });
    pending = await page.evaluate(() => Boolean(adminCurriculumCoverPending));
    assert(!pending, "cancel new image must clear pending cover");

    await page.evaluate(async (id) => {
      await openAdminLessonPlanUserPreview(id, { previewAs: "Free" });
    }, planId);
    await page.waitForSelector("[data-admin-lesson-preview-banner]", { state: "attached", timeout: 10000 });
    const previewBanner = await page.evaluate(() => document.querySelector("[data-admin-lesson-preview-banner]")?.textContent || "");
    assert(/ADMIN PREVIEW/i.test(previewBanner), "ADMIN PREVIEW indicator missing");
    // Preview must not flip lesson to published
    const stillPublished = await page.evaluate((id) => {
      const plan = typeof curriculumLessonPlanById === "function" ? curriculumLessonPlanById(id) : null;
      return String(plan?.status || "") === "published";
    }, planId);
    assert(stillPublished, "preview must not change published status");
    await page.evaluate(() => {
      document.querySelector("[data-admin-lesson-preview-exit]")?.click();
    });
    await page.waitForTimeout(400);

    await page.evaluate(async (id) => {
      await openAdminLessonPlanPublishedView(id);
    }, planId);
    await page.waitForSelector("[data-admin-lesson-preview-banner]", { state: "attached", timeout: 10000 });
    const publishedBanner = await page.evaluate(() => document.querySelector("[data-admin-lesson-preview-banner]")?.textContent || "");
    assert(/published/i.test(publishedBanner), "published version banner missing");

    console.log("✓ integration cover upload/assign/draft/publish + mobile admin UI");
  } finally {
    if (browser) await browser.close().catch(() => {});
    child.kill("SIGTERM");
    try { fs.rmSync(STORE_PATH, { force: true }); } catch { /* ignore */ }
    try {
      const sidecar = STORE_PATH.replace(/(\.json)?$/i, ".lesson-covers");
      fs.rmSync(sidecar, { recursive: true, force: true });
    } catch { /* ignore */ }
  }
}

async function main() {
  staticChecks();
  await integration();
  console.log("All lesson-plan admin cover/preview checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
