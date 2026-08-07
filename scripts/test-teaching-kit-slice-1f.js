#!/usr/bin/env node
/**
 * Teaching Kit Slice 1F — polish, edge cases, print paper sizes, entitlement gate.
 * Flags stay false by default; tests enable locally then reset.
 * Run: npm run test:teaching-kit-slice-1f
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const teachingKit = require("./teaching-kit.js");
const teachingKitPrint = require("./teaching-kit-print.js");
const teachingKitViewer = require("./teaching-kit-viewer.js");

const ROOT = path.join(__dirname, "..");
const PORT = 5150 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-teaching-kit-1f-${process.pid}.json`);
const ADMIN = {
  email: "tk-slice1f-admin@example.com",
  password: "tk-slice1f-pass",
  code: "tk-slice1f-code",
};

let passed = 0;
function assert(condition, message) {
  if (!condition) throw new Error(message);
  passed += 1;
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

function waitForHealth(child, timeoutMs = 20000) {
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
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function adminLogin() {
  const res = await requestJson("POST", "/api/admin/login", {
    email: ADMIN.email,
    password: ADMIN.password,
    code: ADMIN.code,
  });
  assert(res.status === 200 && (res.json?.token || res.json?.adminToken), "admin login");
  return res.json.token || res.json.adminToken;
}

function readTempStore() {
  return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
}

function writeTempStore(data) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
}

function seedUsers() {
  const now = new Date().toISOString();
  const future = new Date(Date.now() + 14 * 86400000).toISOString();
  const store = readTempStore();
  store.users = store.users || {};
  store.users["tk1f-pro@example.com"] = {
    email: "tk1f-pro@example.com",
    plan: "Pro",
    subscriptionStatus: "Pro Monthly Subscription Active",
    stripeSubscriptionStatus: "active",
    currentPeriodEnd: future,
    accessEndsAt: future,
    subscriptionStartedAt: now,
    subscriptionCadence: "monthly",
    updatedAt: now,
  };
  store.users["tk1f-trial@example.com"] = {
    email: "tk1f-trial@example.com",
    plan: "Pro",
    subscriptionStatus: "Pro Monthly Subscription Trialing",
    stripeSubscriptionStatus: "trialing",
    trialStatus: "In Trial",
    trialStart: now,
    trialEnd: future,
    currentPeriodEnd: future,
    accessEndsAt: future,
    stripeCustomerId: "cus_tk1f_trial_123456",
    introductoryTrialConsumed: true,
    updatedAt: now,
  };
  writeTempStore(store);
}

async function setFlags(adminToken, flags) {
  const adminGet = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
  const existing = adminGet.json.siteContent;
  const save = await requestJson("POST", "/api/admin/site-content", {
    adminToken,
    siteContent: {
      ...existing,
      updatedAt: existing.updatedAt,
      featureFlags: {
        playBasedCurriculum: true,
        teachingKitViewer: false,
        teachingKitPrintCenter: false,
        teachingKitAttachments: false,
        ...flags,
      },
    },
  });
  assert(save.status === 200, `flag save: ${save.status}`);
}

function testEmptyKitDoesNotBreakUi() {
  const fixture = require("./fixtures/teaching-kit/empty-plan.json");
  const kit = teachingKit.mapLessonPlanToTeachingKit(
    fixture.lessonPlan,
    fixture.activities,
    fixture.resources,
    { day: "monday" },
  );
  assert(kit.ok === true, "empty plan maps ok");
  assert(teachingKitViewer.isSparseKit(kit) === true, "empty plan marked sparse");

  const startHtml = teachingKitViewer.surfaceHtml(kit, {
    ...teachingKitViewer.defaultState(kit, { printCenterEnabled: true }),
    surface: "start",
  });
  assert(startHtml.includes("data-tk-empty-kit"), "empty banner on start");
  assert(startHtml.includes("still empty") || startHtml.includes("Nothing listed") || startHtml.includes("Draft"),
    "empty copy present");

  const setupHtml = teachingKitViewer.surfaceHtml(kit, {
    ...teachingKitViewer.defaultState(kit),
    surface: "setup",
  });
  assert(setupHtml.includes("Nothing listed yet") || setupHtml.includes("0 minutes"),
    "setup empty checklists safe");

  const print = teachingKitPrint.buildBinderPrintHtml(kit, { preset: "week_binder" });
  assert(print.ok === true, "empty kit still printable");
  assert(print.pageCount >= 1, "empty kit produces at least one page");
  assert(!/undefined|null\]|\[object Object\]/.test(print.html), "empty print has no junk tokens");
}

function testLargeKitPerformance() {
  const fixture = require("./fixtures/teaching-kit/bugs-and-butterflies.json");
  const t0 = Date.now();
  const kit = teachingKit.mapLessonPlanToTeachingKit(
    fixture.lessonPlan,
    fixture.activities,
    fixture.resources,
    { day: "monday" },
  );
  const mapMs = Date.now() - t0;
  assert(kit.ok === true, "large kit maps");
  assert((kit.quality?.activityCount || 0) >= 20, "large kit has many activities");
  assert(mapMs < 750, `large kit map under 750ms (was ${mapMs}ms)`);

  const t1 = Date.now();
  const built = teachingKitPrint.buildBinderPrintHtml(kit, {
    preset: "week_binder",
    paperSize: "letter",
    includeImages: true,
  });
  const printMs = Date.now() - t1;
  assert(built.ok === true, "large binder builds");
  assert(built.pageCount >= 20, "large binder has many pages");
  assert(printMs < 750, `large binder build under 750ms (was ${printMs}ms)`);

  const t2 = Date.now();
  const workspace = teachingKitViewer.workspaceHtml(
    kit,
    teachingKitViewer.defaultState(kit, { printCenterEnabled: true }),
    { title: kit.title, backLabel: "Back" },
  );
  const viewMs = Date.now() - t2;
  assert(workspace.includes("teaching-kit-workspace"), "large kit viewer html builds");
  assert(viewMs < 500, `large kit viewer html under 500ms (was ${viewMs}ms)`);
}

function testPrintPaperAndBreaksAndImages() {
  const fixture = require("./fixtures/teaching-kit/enriched-mini.json");
  const kit = teachingKit.mapLessonPlanToTeachingKit(
    fixture.lessonPlan,
    fixture.activities,
    fixture.resources,
    { day: "monday" },
  );

  const letter = teachingKitPrint.buildBinderPrintHtml(kit, { preset: "week_binder", paperSize: "letter" });
  assert(letter.selection.paperSize === "letter", "letter selection");
  assert(letter.html.includes('data-tk-paper="letter"'), "letter data attr");
  assert(letter.html.includes("size:letter"), "letter @page injected");

  const a4 = teachingKitPrint.buildBinderPrintHtml(kit, { preset: "week_binder", paperSize: "a4" });
  assert(a4.selection.paperSize === "a4", "a4 selection");
  assert(a4.html.includes('data-tk-paper="a4"'), "a4 data attr");
  assert(a4.html.includes("size:A4"), "A4 @page injected");

  assert(letter.html.includes("tk-print-keep"), "keep-together blocks present");
  assert(letter.html.includes("tk-print-page-number"), "page number slots present");
  assert(
    letter.html.includes("tk-print-photo-row")
    || letter.html.includes("tk-print-card-photos")
    || letter.html.includes("tk-print-card-photo"),
    "photo row present when images on",
  );

  const styles = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  assert(styles.includes("break-inside: avoid"), "print CSS avoids mid-block cuts");
  assert(styles.includes("object-fit: contain"), "images use contain (not crop/blur stretch)");
  assert(styles.includes("max-height: 2.35in") || styles.includes("max-height: 2.2in"),
    "print image max-height capped");
  assert(styles.includes("counter-increment: tk-page"), "page counter wired");
  assert(styles.includes(".tk-panel-enter"), "panel motion present");
  assert(styles.includes(".tk-loading-banner"), "loading polish present");
}

function testEntitlementGateHelper() {
  const fixture = require("./fixtures/teaching-kit/enriched-mini.json");
  const kit = teachingKit.mapLessonPlanToTeachingKit(
    fixture.lessonPlan,
    fixture.activities,
    fixture.resources,
  );

  assert(
    teachingKitPrint.evaluatePrintAuthorization({
      printCenterEnabled: false,
      kit,
      gate: { allowed: true },
    }).reason === "print_flag_off",
    "flag off blocks",
  );
  assert(
    teachingKitPrint.evaluatePrintAuthorization({
      printCenterEnabled: true,
      kit: { ...kit, locked: true },
      gate: { allowed: true },
    }).reason === "locked",
    "locked kit blocks",
  );
  assert(
    teachingKitPrint.evaluatePrintAuthorization({
      printCenterEnabled: true,
      kit,
      gate: { allowed: false, cancelled: true },
    }).reason === "trial_cancelled",
    "trial cancel blocks",
  );
  assert(
    teachingKitPrint.evaluatePrintAuthorization({
      printCenterEnabled: true,
      kit,
      gate: { allowed: false, exhausted: true },
    }).reason === "trial_exhausted",
    "trial exhausted blocks",
  );
  assert(
    teachingKitPrint.evaluatePrintAuthorization({
      printCenterEnabled: true,
      kit,
      gate: { allowed: true, counted: true, watermark: "" },
    }).reason === "watermark_required",
    "counted trial without watermark blocks",
  );
  assert(
    teachingKitPrint.evaluatePrintAuthorization({
      printCenterEnabled: true,
      kit,
      gate: { allowed: true, counted: true, watermark: "Little Learner Hub Trial Preview - Account X" },
    }).ok === true,
    "counted trial with watermark allowed",
  );
  assert(
    teachingKitPrint.evaluatePrintAuthorization({
      printCenterEnabled: true,
      kit,
      gate: { allowed: true, unlimited: true, counted: false, watermark: "" },
    }).ok === true,
    "Pro unlimited allowed without watermark",
  );

  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const printStart = appJs.indexOf("async function printTeachingKitBinder");
  const printEnd = appJs.indexOf("\nfunction applyLessonWorkspaceChrome", printStart);
  assert(printStart > -1 && printEnd > printStart, "printTeachingKitBinder found in app.js");
  const printFn = appJs.slice(printStart, printEnd);
  assert(printFn.includes("confirmTrialCurriculumExport"), "print path authorizes trial export");
  assert(printFn.includes("evaluatePrintAuthorization"), "print path uses gate helper");
  const authIdx = printFn.indexOf("confirmTrialCurriculumExport");
  // Actual HTML assembly call (not the earlier typeof module guard).
  const buildIdx = printFn.indexOf("printApi.buildBinderPrintHtml(kitPayload");
  assert(authIdx > -1 && buildIdx > authIdx, "authorize runs before binder HTML build");
  const flagIdx = printFn.indexOf("print_flag_off");
  assert(flagIdx > -1 && flagIdx < authIdx, "flag-off short-circuit before authorize");
  assert(printFn.includes("Authorize BEFORE any binder HTML assembly"),
    "entitlement order documented in print path");
}

function testLoadingAndPaperUiHooks() {
  assert(typeof teachingKitViewer.renderLoadingWorkspace === "function", "loading renderer exported");
  assert(teachingKitViewer.loadingWorkspaceHtml({ title: "Demo" }).includes("Opening Teaching Kit"),
    "loading copy present");

  const fixture = require("./fixtures/teaching-kit/enriched-mini.json");
  const kit = teachingKit.mapLessonPlanToTeachingKit(
    fixture.lessonPlan,
    fixture.activities,
    fixture.resources,
  );
  globalThis.LLHTeachingKitPrint = teachingKitPrint;
  const buildHtml = teachingKitViewer.surfaceHtml(kit, {
    ...teachingKitViewer.defaultState(kit, { printCenterEnabled: true }),
    surface: "build",
  });
  assert(buildHtml.includes("data-tk-print-paper"), "paper size radios in Print Center");
  assert(buildHtml.includes("US Letter") && buildHtml.includes("A4"), "Letter and A4 labels");
}

async function main() {
  testEmptyKitDoesNotBreakUi();
  testLargeKitPerformance();
  testPrintPaperAndBreaksAndImages();
  testEntitlementGateHelper();
  testLoadingAndPaperUiHooks();

  const child = startServer();
  let browser;
  try {
    await waitForHealth(child);
    const adminToken = await adminLogin();

    const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    let expectedUpdatedAt = bootstrap.json.siteContent.updatedAt || "";

    // Empty plans cannot be published (weekday activity validation) — browser empty
    // coverage uses the mapped fixture payload directly (unit tests cover mapper).
    const emptyFixture = require("./fixtures/teaching-kit/empty-plan.json");
    const emptyKitMapped = teachingKit.mapLessonPlanToTeachingKit(
      emptyFixture.lessonPlan,
      emptyFixture.activities,
      emptyFixture.resources,
      { day: "monday" },
    );
    assert(emptyKitMapped.ok === true && teachingKitViewer.isSparseKit(emptyKitMapped),
      "empty fixture ready for browser");

    const largeFixture = require("./fixtures/teaching-kit/bugs-and-butterflies.json");
    // Use a unique id so trial authorize does not treat a fixture/catalog id as Free starter.
    const largeId = "cur-lp-tk-slice1f-large";
    const largeSave = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      lessonPlan: { ...largeFixture.lessonPlan, id: largeId, status: "published", plan: "Pro" },
    });
    assert(largeSave.status === 200, `save large plan: ${largeSave.status} ${largeSave.text.slice(0, 200)}`);

    await setFlags(adminToken, {
      teachingKitViewer: true,
      teachingKitPrintCenter: true,
    });

    // Seed after admin writes so in-memory store flushes do not wipe test users.
    seedUsers();

    const largeKitRes = await requestJson(
      "GET",
      `/api/curriculum/lesson-plans/${largeId}/teaching-kit`,
      null,
      { Authorization: "Bearer test:tk1f-pro@example.com" },
    );
    assert(largeKitRes.status === 200 && (largeKitRes.json?.teachingKit?.quality?.activityCount || 0) >= 10,
      "large kit API returns activities");

    // Trial authorize path still works for print action while flags are on.
    const trialAuth = await requestJson(
      "POST",
      "/api/trial-curriculum-exports/authorize",
      {
        idempotencyKey: `tk1f-print-${Date.now()}`,
        resourceType: "lesson-plan",
        resourceId: largeId,
        action: "print",
      },
      { Authorization: "Bearer test:tk1f-trial@example.com" },
    );
    assert(trialAuth.status === 200 && trialAuth.json?.allowed === true,
      `trial print authorize allowed (${trialAuth.status} ${JSON.stringify(trialAuth.json).slice(0, 180)})`);
    assert(Boolean(trialAuth.json?.watermark) && /Trial Preview/i.test(String(trialAuth.json.watermark || "")),
      `trial print returns watermark (got ${JSON.stringify(trialAuth.json?.watermark || trialAuth.json)})`);
    assert(trialAuth.json?.counted === true || trialAuth.json?.unlimited !== true,
      "trial print is counted (not Pro unlimited bypass)");

    const proAuth = await requestJson(
      "POST",
      "/api/trial-curriculum-exports/authorize",
      {
        idempotencyKey: `tk1f-pro-${Date.now()}`,
        resourceType: "lesson-plan",
        resourceId: largeId,
        action: "print",
      },
      { Authorization: "Bearer test:tk1f-pro@example.com" },
    );
    assert(proAuth.status === 200 && proAuth.json?.allowed === true, "pro print authorize allowed");
    assert(!proAuth.json?.watermark, `pro print has no watermark (got ${JSON.stringify(proAuth.json?.watermark)})`);

    const { chromium } = require("playwright");
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(`
      <!doctype html>
      <html><head>
        <link rel="stylesheet" href="http://127.0.0.1:${PORT}/styles.css" />
      </head><body>
        <div id="resourceViewerBody"></div>
        <script src="http://127.0.0.1:${PORT}/scripts/teaching-kit-present.js"></script>
        <script src="http://127.0.0.1:${PORT}/scripts/teaching-kit-printable-model.js"></script>
        <script src="http://127.0.0.1:${PORT}/scripts/teaching-kit-print.js"></script>
        <script src="http://127.0.0.1:${PORT}/scripts/teaching-kit-viewer.js"></script>
      </body></html>
    `, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.LLHTeachingKitPrint && window.LLHTeachingKitViewer);

    const emptyEnhanced = await page.evaluate(async (payload) => {
      const body = document.querySelector("#resourceViewerBody");
      return window.LLHTeachingKitViewer.enhanceLessonWorkspace({
        body,
        teachingKit: payload.teachingKit,
        featureFlags: payload.featureFlags,
        chrome: { backLabel: "Back", title: payload.teachingKit.title },
      });
    }, {
      teachingKit: emptyKitMapped,
      featureFlags: { teachingKitViewer: true, teachingKitPrintCenter: true },
    });
    assert(emptyEnhanced.enhanced === true, "empty kit enhances without throw");
    assert(await page.locator("[data-tk-empty-kit]").count() >= 1, "empty banner in browser");
    await page.click("[data-tk-goto='setup']");
    await page.waitForSelector("[data-tk-panel='setup']");
    assert(await page.locator("[data-tk-panel='setup']").count() === 1, "nav to setup works on empty kit");
    await page.click("[data-tk-goto='build']");
    await page.waitForSelector("[data-tk-panel='build']");
    assert(await page.locator("[data-tk-print-paper]").count() >= 2, "paper radios rendered");

    const largeEnhanced = await page.evaluate(async (payload) => {
      const body = document.querySelector("#resourceViewerBody");
      const started = performance.now();
      const result = await window.LLHTeachingKitViewer.enhanceLessonWorkspace({
        body,
        teachingKit: payload.teachingKit,
        featureFlags: payload.featureFlags,
        chrome: { backLabel: "Back", title: payload.teachingKit.title },
      });
      return { ...result, ms: performance.now() - started };
    }, largeKitRes.json);
    assert(largeEnhanced.enhanced === true, "large kit enhances");
    assert(largeEnhanced.ms < 1000, `large kit enhance under 1s (was ${Math.round(largeEnhanced.ms)}ms)`);

    await page.click("[data-tk-goto='today']");
    await page.waitForSelector("[data-tk-panel='today']");
    await page.click("[data-tk-goto='build']");
    await page.waitForSelector("[data-tk-panel='build']");
    await page.click("[data-tk-print-paper='a4']");

    const a4Preview = await page.evaluate((payload) => {
      const built = window.LLHTeachingKitPrint.buildBinderPrintHtml(payload.teachingKit, {
        preset: "week_binder",
        paperSize: "a4",
        includeImages: true,
      });
      document.body.innerHTML = built.html;
      return {
        ok: built.ok,
        paper: built.paperSize,
        hasStyle: Boolean(document.querySelector("[data-tk-print-page-size]")),
        keepCount: document.querySelectorAll(".tk-print-keep").length,
        pageCount: built.pageCount,
      };
    }, largeKitRes.json);
    assert(a4Preview.ok && a4Preview.paper === "a4", "browser A4 build ok");
    assert(a4Preview.hasStyle, "browser has injected @page style");
    assert(a4Preview.keepCount >= 3, "browser keep-together blocks present");
    assert(a4Preview.pageCount >= 10, "browser large binder pages present");

    await setFlags(adminToken, {
      teachingKitViewer: false,
      teachingKitPrintCenter: false,
      teachingKitAttachments: false,
    });
    const reset = await requestJson(
      "GET",
      `/api/curriculum/lesson-plans/${largeId}/teaching-kit`,
      null,
      { Authorization: "Bearer test:tk1f-pro@example.com" },
    );
    assert(reset.status === 404 && reset.json?.code === "teaching_kit_disabled",
      "flags reset after 1F tests");

    console.log(`OK teaching-kit-slice-1f (${passed} assertions)`);
  } finally {
    try { if (browser) await browser.close(); } catch { /* ignore */ }
    try { child.kill("SIGTERM"); } catch { /* ignore */ }
    try { fs.rmSync(STORE_PATH, { force: true }); } catch { /* ignore */ }
    try { fs.rmSync(STORE_PATH.replace(/\.json$/, ".admin-sessions.json"), { force: true }); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("FAIL teaching-kit-slice-1f:", error.message || error);
  process.exit(1);
});
