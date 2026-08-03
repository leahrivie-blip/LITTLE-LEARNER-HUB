#!/usr/bin/env node
/**
 * Teaching Kit Phase 1 — final end-to-end QA (Slice 1H harness).
 * Covers provider workflow, Free/Trial/Pro access, viewports, print, a11y, edge cases.
 * Flags are enabled only inside this temp store and reset to false before exit.
 * Run: npm run test:teaching-kit-phase1-qa
 *
 * Does NOT merge, deploy, or leave production flags on.
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const teachingKit = require("./teaching-kit.js");
const teachingKitPrint = require("./teaching-kit-print.js");
const teachingKitViewer = require("./teaching-kit-viewer.js");
const freeCurriculumSample = require("./free-curriculum-sample.js");

const ROOT = path.join(__dirname, "..");
const PORT = 5400 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-teaching-kit-qa-${process.pid}.json`);
const ARTIFACT_DIR = "/opt/cursor/artifacts/teaching-kit-qa";
const ADMIN = {
  email: "tk-phase1-qa-admin@example.com",
  password: "tk-phase1-qa-pass",
  code: "tk-phase1-qa-code",
};

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
];

let passed = 0;
const findings = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
  passed += 1;
}

function note(level, area, message) {
  findings.push({ level, area, message });
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

function sampleDayItem(day, title, category = "Sensory Play") {
  return {
    itemId: `${day}-1`,
    activityCategory: category,
    title,
    objective: "Explore",
    materials: "Paper\nPaint",
    setup: "Set tray.",
    steps: "1. Invite play.\n2. Narrate.",
    teacherLanguage: "Look: What do you notice?",
    observationOpportunities: "Engaged?",
    safetyNotes: "Wipe spills.",
  };
}

function samplePlan(id, extras = {}) {
  return {
    id,
    title: extras.title || `QA Plan ${id}`,
    age: extras.age || "Toddler",
    theme: extras.theme || "Bugs",
    plan: extras.plan || "Pro",
    status: "published",
    learningDomains: ["Approaches to Learning"],
    weeklyOverview: "Provider week for Teaching Kit Phase 1 QA.",
    objectives: "Notice living things.\nPractice describing words.",
    books: [{ title: "The Very Hungry Caterpillar", author: "", notes: "What did it eat?" }],
    songs: [{ title: "Butterfly Flutter", notes: "Lyrics: Flutter.\nMotions: flap" }],
    weeklyMaterials: "Paint\nPaper\nMagnifying glasses",
    vocabularyWords: "Butterfly — an insect with wings. Ask: Can you flutter?",
    observationOpportunities: "Uses describing words?",
    adaptations: "Shorten turns.",
    familyConnection: "Today we explored bugs! Ask your child to flutter.",
    dailyPlans: {
      monday: { theme: "Mon", items: [sampleDayItem("monday", "Bug Sensory Bin", "Sensory Play")], materials: "Paint", transitions: ["Tip-toe to wash"], observations: ["Engaged?"] },
      tuesday: { theme: "Tue", items: [sampleDayItem("tuesday", "Butterfly Paint Prints", "Art")] },
      wednesday: { theme: "Wed", items: [sampleDayItem("wednesday", "Caterpillar Crawl", "Gross Motor")] },
      thursday: { theme: "Thu", items: [sampleDayItem("thursday", "Nature Hunt", "Open-Ended Exploration")] },
      friday: { theme: "Fri", items: [sampleDayItem("friday", "Bug Dance", "Music & Movement")] },
    },
    ...extras,
    id,
    status: "published",
  };
}

function seedUsers() {
  const now = new Date().toISOString();
  const future = new Date(Date.now() + 14 * 86400000).toISOString();
  const store = readTempStore();
  store.users = store.users || {};
  store.users["tkqa-free@example.com"] = {
    email: "tkqa-free@example.com",
    plan: "Free",
    subscriptionStatus: "Free Plan",
    freeLessonAccessMode: "curated",
    createdAt: "2026-07-19T12:00:00.000Z",
    updatedAt: now,
  };
  store.users["tkqa-trial@example.com"] = {
    email: "tkqa-trial@example.com",
    plan: "Pro",
    subscriptionStatus: "Pro Monthly Subscription Trialing",
    stripeSubscriptionStatus: "trialing",
    trialStatus: "In Trial",
    trialStart: now,
    trialEnd: future,
    accessEndsAt: future,
    stripeCustomerId: "cus_tkqa_trial_123456",
    introductoryTrialConsumed: true,
    updatedAt: now,
  };
  store.users["tkqa-pro@example.com"] = {
    email: "tkqa-pro@example.com",
    plan: "Pro",
    subscriptionStatus: "Pro Monthly Subscription Active",
    stripeSubscriptionStatus: "active",
    currentPeriodEnd: future,
    accessEndsAt: future,
    subscriptionStartedAt: now,
    subscriptionCadence: "monthly",
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

async function runProviderWorkflow(page, kitPayload, viewportName) {
  const started = Date.now();
  const enhanced = await page.evaluate(async (payload) => {
    const body = document.querySelector("#resourceViewerBody");
    body.innerHTML = "";
    return window.LLHTeachingKitViewer.enhanceLessonWorkspace({
      body,
      teachingKit: payload.teachingKit,
      featureFlags: payload.featureFlags,
      chrome: {
        backLabel: "Back",
        title: payload.teachingKit.title,
        saveButtonHtml: "<button type=\"button\" class=\"lesson-workspace-save-btn\">Save</button>",
        actionBarsHtml: "<div data-lesson-use-this-plan>Use This Plan</div>",
      },
      onPrint: (selection) => {
        window.__tkLastPrintSelection = selection;
      },
    });
  }, kitPayload);
  assert(enhanced.enhanced === true, `${viewportName}: enhance ok`);

  // Start → Setup → Today → Open Everything → Activity → Build → Binder
  await page.click("[data-tk-goto='setup']");
  await page.waitForSelector("[data-tk-panel='setup']");
  assert(await page.locator("[data-tk-panel='setup']").count() === 1, `${viewportName}: setup surface`);

  await page.click("[data-tk-goto='today']");
  await page.waitForSelector("[data-tk-panel='today']");
  await page.click("[data-tk-day='wednesday']");
  await page.waitForSelector(".tk-day[data-tk-day='wednesday'][aria-selected='true']");
  await page.click("[data-tk-open-everything]");
  await page.waitForSelector("[data-tk-tray]");
  assert(await page.locator("[data-tk-tray]").count() === 1, `${viewportName}: open everything tray`);

  const openBtn = page.locator("[data-tk-open-activity]").first();
  if (await openBtn.count()) {
    await openBtn.click();
    await page.waitForSelector("[data-tk-panel='activity']");
    assert(await page.locator("[data-tk-toggle-substitute]").count() === 1, `${viewportName}: substitute CTA`);
    await page.click("[data-tk-toggle-substitute]");
    await page.click("button[data-tk-goto='today'], button[data-tk-goto='build']");
  }

  await page.click("[data-tk-goto='build']");
  await page.waitForSelector("[data-tk-panel='build']");
  assert(await page.locator("[data-tk-print-paper]").count() >= 2, `${viewportName}: paper size options`);
  await page.click("[data-tk-print-paper='a4']");
  await page.click("[data-tk-goto='binder']");
  await page.waitForSelector("[data-tk-panel='binder']");
  assert(await page.locator(".tk-binder-hero").count() === 1, `${viewportName}: binder preview`);

  // Overflow / layout health
  const layout = await page.evaluate(() => {
    const root = document.querySelector("[data-teaching-kit-workspace]");
    if (!root) return { ok: false, reason: "missing root" };
    const overflowX = root.scrollWidth > root.clientWidth + 2;
    const ops = root.querySelector(".tk-ops-nav");
    const opsOverflow = ops ? ops.scrollWidth > ops.clientWidth + 8 : false;
    const buttons = Array.from(root.querySelectorAll("button")).map((btn) => ({
      label: (btn.textContent || "").trim().slice(0, 40),
      w: btn.getBoundingClientRect().width,
      h: btn.getBoundingClientRect().height,
    }));
    const tiny = buttons.filter((btn) => btn.w > 0 && (btn.w < 24 || btn.h < 24));
    return {
      ok: true,
      overflowX,
      opsOverflow,
      tinyCount: tiny.length,
      width: root.clientWidth,
    };
  });
  assert(layout.ok, `${viewportName}: workspace present`);
  assert(!layout.overflowX, `${viewportName}: no horizontal overflow (scrollWidth)`);
  assert(layout.tinyCount === 0, `${viewportName}: no tiny unusable buttons (${layout.tinyCount})`);

  // A11y essentials
  const a11y = await page.evaluate(() => {
    const root = document.querySelector("[data-teaching-kit-workspace]");
    const tabs = Array.from(root.querySelectorAll('.tk-ops-tab[role="tab"]'));
    const selected = tabs.filter((tab) => tab.getAttribute("aria-selected") === "true");
    const images = Array.from(root.querySelectorAll("img"));
    const missingAlt = images.filter((img) => !img.hasAttribute("alt"));
    return {
      tabCount: tabs.length,
      selectedCount: selected.length,
      missingAlt: missingAlt.length,
      hasTablist: Boolean(root.querySelector('[role="tablist"]')),
    };
  });
  assert(a11y.hasTablist && a11y.tabCount >= 4, `${viewportName}: ops tablist`);
  assert(a11y.selectedCount === 1, `${viewportName}: exactly one selected ops tab`);
  assert(a11y.missingAlt === 0, `${viewportName}: images have alt`);

  // Keyboard: focus an ops tab and arrow
  await page.focus(".tk-ops-tab[data-tk-goto='start']");
  await page.keyboard.press("ArrowRight");
  await page.waitForSelector("[data-tk-panel='setup'], [data-tk-panel='today'], [data-tk-panel='build'], [data-tk-panel='start']");

  const elapsed = Date.now() - started;
  assert(elapsed < 8000, `${viewportName}: provider workflow under 8s (was ${elapsed}ms)`);
  return { elapsed, layout };
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  globalThis.LLHTeachingKitPrint = teachingKitPrint;

  // --- Static / unit gates (flag defaults + print gate + empty/large) ---
  assert(teachingKit.isTeachingKitApiEnabled({}) === false, "API disabled by default");
  assert(teachingKit.isTeachingKitApiEnabled({ teachingKitViewer: true }) === true, "viewer enables API");
  const emptyFixture = require("./fixtures/teaching-kit/empty-plan.json");
  const emptyKit = teachingKit.mapLessonPlanToTeachingKit(
    emptyFixture.lessonPlan,
    emptyFixture.activities,
    emptyFixture.resources,
  );
  assert(teachingKitViewer.isSparseKit(emptyKit), "empty kit sparse");
  assert(teachingKitViewer.surfaceHtml(emptyKit, {
    ...teachingKitViewer.defaultState(emptyKit),
    surface: "start",
  }).includes("data-tk-empty-kit"), "empty banner");

  const largeFixture = require("./fixtures/teaching-kit/bugs-and-butterflies.json");
  const tMap = Date.now();
  const largeKit = teachingKit.mapLessonPlanToTeachingKit(
    largeFixture.lessonPlan,
    largeFixture.activities,
    largeFixture.resources,
  );
  assert(Date.now() - tMap < 750, "large map perf");
  const tPrint = Date.now();
  const largePrint = teachingKitPrint.buildBinderPrintHtml(largeKit, {
    preset: "week_binder",
    paperSize: "a4",
  });
  assert(largePrint.ok && largePrint.pageCount >= 20, "large A4 binder");
  assert(Date.now() - tPrint < 750, "large print perf");
  assert(largePrint.html.includes("size:A4") && largePrint.html.includes("tk-print-keep"),
    "A4 + keep-together in print");

  assert(
    teachingKitPrint.evaluatePrintAuthorization({
      printCenterEnabled: false,
      kit: largeKit,
      gate: { allowed: true },
    }).reason === "print_flag_off",
    "print flag off gate",
  );

  const styles = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  assert(styles.includes("object-fit: contain"), "image contain scaling");
  assert(styles.includes("break-inside: avoid"), "print page-break avoid");
  assert(styles.includes(".tk-activity-row"), "today activity row layout");

  const child = startServer();
  let browser;
  try {
    await waitForHealth(child);
    const adminToken = await adminLogin();

    const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    let expectedUpdatedAt = bootstrap.json.siteContent.updatedAt || "";

    const freeId = "cur-lp-tk-qa-free";
    const proId = "cur-lp-tk-qa-pro";
    const saveFree = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      lessonPlan: samplePlan(freeId, { plan: "Free", title: "QA Free Starter Week" }),
    });
    assert(saveFree.status === 200, `save free: ${saveFree.status}`);
    expectedUpdatedAt = saveFree.json?.siteContentUpdatedAt || saveFree.json?.siteContent?.updatedAt || expectedUpdatedAt;

    const savePro = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      lessonPlan: samplePlan(proId, { plan: "Pro", title: "QA Pro Bugs Week" }),
    });
    assert(savePro.status === 200, `save pro: ${savePro.status}`);
    expectedUpdatedAt = savePro.json?.siteContentUpdatedAt || savePro.json?.siteContent?.updatedAt || expectedUpdatedAt;

    const starterIds = [freeId, ...freeCurriculumSample.DEFAULT_FREE_STARTER_LESSON_IDS]
      .filter((id, index, arr) => arr.indexOf(id) === index)
      .slice(0, freeCurriculumSample.REQUIRED_COUNT);
    while (starterIds.length < freeCurriculumSample.REQUIRED_COUNT) {
      starterIds.push(`cur-lp-tk-qa-pad-${starterIds.length}`);
    }
    const store = readTempStore();
    store.freeStarterLibrary = {
      lessonPlanIds: starterIds,
      updatedAt: new Date().toISOString(),
      updatedBy: ADMIN.email,
    };
    writeTempStore(store);

    // Flags must stay off by default for production readiness gate
    seedUsers();
    const off = await requestJson(
      "GET",
      `/api/curriculum/lesson-plans/${proId}/teaching-kit`,
      null,
      { Authorization: "Bearer test:tkqa-pro@example.com" },
    );
    assert(off.status === 404 && off.json?.code === "teaching_kit_disabled",
      "default flags off → teaching kit disabled");

    const publicContent = await requestJson("GET", "/api/site-content");
    assert(!("featureFlags" in (publicContent.json?.siteContent || {})),
      "public site-content omits featureFlags");

    await setFlags(adminToken, {
      teachingKitViewer: true,
      teachingKitPrintCenter: true,
    });
    seedUsers();

    // Access matrix
    const guestPro = await requestJson("GET", `/api/curriculum/lesson-plans/${proId}/teaching-kit`);
    assert(guestPro.json?.teachingKit?.locked === true && guestPro.json.teachingKit.companion === null,
      "guest Pro locked, no companion");

    const freePro = await requestJson(
      "GET",
      `/api/curriculum/lesson-plans/${proId}/teaching-kit`,
      null,
      { Authorization: "Bearer test:tkqa-free@example.com" },
    );
    assert(freePro.json?.teachingKit?.locked === true, "Free user cannot unlock Pro kit");

    const freeStarter = await requestJson(
      "GET",
      `/api/curriculum/lesson-plans/${freeId}/teaching-kit`,
      null,
      { Authorization: "Bearer test:tkqa-free@example.com" },
    );
    assert(freeStarter.status === 200 && freeStarter.json?.teachingKit?.locked === false,
      "Free user unlocks curated starter kit");
    assert(freeStarter.json.teachingKit.access === "free_unlocked", "free_unlocked marker");

    const proKit = await requestJson(
      "GET",
      `/api/curriculum/lesson-plans/${proId}/teaching-kit?day=monday`,
      null,
      { Authorization: "Bearer test:tkqa-pro@example.com" },
    );
    assert(proKit.status === 200 && proKit.json?.teachingKit?.locked === false, "Pro unlocks kit");
    assert(proKit.json.featureFlags?.teachingKitViewer === true
      && proKit.json.featureFlags?.teachingKitPrintCenter === true,
    "flags echoed when enabled in temp store");

    const trialKit = await requestJson(
      "GET",
      `/api/curriculum/lesson-plans/${proId}/teaching-kit`,
      null,
      { Authorization: "Bearer test:tkqa-trial@example.com" },
    );
    assert(trialKit.status === 200 && trialKit.json?.teachingKit?.locked === false, "Trial unlocks kit");

    // Trial limits on print authorize
    const trialAuth = await requestJson(
      "POST",
      "/api/trial-curriculum-exports/authorize",
      {
        idempotencyKey: `tkqa-print-1-${Date.now()}`,
        resourceType: "lesson-plan",
        resourceId: proId,
        action: "print",
      },
      { Authorization: "Bearer test:tkqa-trial@example.com" },
    );
    assert(trialAuth.json?.allowed === true && /Trial Preview/i.test(String(trialAuth.json?.watermark || "")),
      "trial print authorize + watermark");
    assert(trialAuth.json?.counted === true, "trial print counted");

    const proAuth = await requestJson(
      "POST",
      "/api/trial-curriculum-exports/authorize",
      {
        idempotencyKey: `tkqa-pro-1-${Date.now()}`,
        resourceType: "lesson-plan",
        resourceId: proId,
        action: "print",
      },
      { Authorization: "Bearer test:tkqa-pro@example.com" },
    );
    assert(proAuth.json?.allowed === true && !proAuth.json?.watermark, "Pro unlimited print, no watermark");

    const { chromium } = require("playwright");
    browser = await chromium.launch({ headless: true });

    for (const viewport of VIEWPORTS) {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
      await page.setContent(`
        <!doctype html>
        <html><head>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="stylesheet" href="http://127.0.0.1:${PORT}/styles.css" />
        </head><body>
          <div id="resourceViewerBody" style="max-width:100%;margin:0;padding:12px;"></div>
          <script src="http://127.0.0.1:${PORT}/scripts/teaching-kit-print.js"></script>
          <script src="http://127.0.0.1:${PORT}/scripts/teaching-kit-viewer.js"></script>
        </body></html>
      `, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => window.LLHTeachingKitPrint && window.LLHTeachingKitViewer);

      const result = await runProviderWorkflow(page, proKit.json, viewport.name);
      note("info", "viewport", `${viewport.name}: workflow ${result.elapsed}ms, width ${result.layout.width}`);

      await page.screenshot({
        path: path.join(ARTIFACT_DIR, `workflow-${viewport.name}.png`),
        fullPage: true,
      });

      // Print assembly for this viewport’s selection defaults (separate probe page)
      const printCheck = await page.evaluate((payload) => {
        const built = window.LLHTeachingKitPrint.buildBinderPrintHtml(payload.teachingKit, {
          preset: "week_binder",
          paperSize: "letter",
          watermark: "Little Learner Hub Trial Preview - Account LLH-QA",
        });
        return {
          ok: built.ok,
          pageCount: built.pageCount,
          paper: built.paperSize || built.selection?.paperSize,
          html: built.html,
        };
      }, proKit.json);
      assert(printCheck.ok && printCheck.paper === "letter", `${viewport.name}: letter print root`);
      assert(printCheck.html.includes("tk-print-watermark") && printCheck.html.includes("data-tk-print-page-size"),
        `${viewport.name}: watermark + @page`);
      assert(printCheck.html.includes("tk-print-keep") && printCheck.html.includes("tk-print-page-number"),
        `${viewport.name}: keep + page numbers`);

      if (viewport.name === "desktop") {
        await page.setContent(`<!doctype html><html><head>
          <link rel="stylesheet" href="http://127.0.0.1:${PORT}/styles.css" />
        </head><body>${printCheck.html}</body></html>`, { waitUntil: "domcontentloaded" });
        await page.screenshot({
          path: path.join(ARTIFACT_DIR, "print-binder-desktop.png"),
          fullPage: true,
        });
      }
      await page.close();
    }

    // Empty kit browser path
    const emptyPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await emptyPage.setContent(`
      <!doctype html>
      <html><head>
        <link rel="stylesheet" href="http://127.0.0.1:${PORT}/styles.css" />
      </head><body>
        <div id="resourceViewerBody"></div>
        <script src="http://127.0.0.1:${PORT}/scripts/teaching-kit-print.js"></script>
        <script src="http://127.0.0.1:${PORT}/scripts/teaching-kit-viewer.js"></script>
      </body></html>
    `, { waitUntil: "domcontentloaded" });
    await emptyPage.waitForFunction(() => window.LLHTeachingKitViewer);
    const emptyEnhanced = await emptyPage.evaluate(async (kit) => {
      return window.LLHTeachingKitViewer.enhanceLessonWorkspace({
        body: document.querySelector("#resourceViewerBody"),
        teachingKit: kit,
        featureFlags: { teachingKitViewer: true, teachingKitPrintCenter: true },
        chrome: { backLabel: "Back", title: kit.title },
      });
    }, emptyKit);
    assert(emptyEnhanced.enhanced === true, "empty kit enhances on mobile");
    assert(await emptyPage.locator("[data-tk-empty-kit]").count() >= 1, "empty banner visible");
    await emptyPage.click("[data-tk-goto='build']");
    await emptyPage.waitForSelector("[data-tk-panel='build']");
    await emptyPage.screenshot({ path: path.join(ARTIFACT_DIR, "empty-mobile.png"), fullPage: true });
    await emptyPage.close();

    // Locked kit fail-closed
    const lockedPage = await browser.newPage();
    await lockedPage.setContent(`
      <!doctype html>
      <html><body>
        <div id="resourceViewerBody"><div data-lesson-workspace>LEGACY</div></div>
        <script src="http://127.0.0.1:${PORT}/scripts/teaching-kit-viewer.js"></script>
      </body></html>
    `, { waitUntil: "domcontentloaded" });
    await lockedPage.waitForFunction(() => window.LLHTeachingKitViewer);
    const lockedResult = await lockedPage.evaluate(async (payload) => {
      const body = document.querySelector("#resourceViewerBody");
      const before = body.innerHTML;
      const result = await window.LLHTeachingKitViewer.enhanceLessonWorkspace({
        body,
        teachingKit: payload.teachingKit,
        featureFlags: { teachingKitViewer: true, teachingKitPrintCenter: true },
        chrome: { backLabel: "Back" },
      });
      return { result, stillLegacy: body.innerHTML.includes("LEGACY"), beforeLen: before.length };
    }, guestPro.json);
    assert(lockedResult.result.enhanced === false, "locked kit does not enhance");
    assert(lockedResult.stillLegacy === true, "locked kit keeps legacy workspace");

    // Viewer-only flag: print CTA disabled
    await setFlags(adminToken, {
      teachingKitViewer: true,
      teachingKitPrintCenter: false,
    });
    seedUsers();
    const viewerOnly = await requestJson(
      "GET",
      `/api/curriculum/lesson-plans/${proId}/teaching-kit`,
      null,
      { Authorization: "Bearer test:tkqa-pro@example.com" },
    );
    assert(viewerOnly.json?.featureFlags?.teachingKitPrintCenter !== true, "print flag off in API");
    const viewerOnlyPage = await browser.newPage();
    await viewerOnlyPage.setContent(`
      <!doctype html>
      <html><body>
        <div id="resourceViewerBody"></div>
        <script src="http://127.0.0.1:${PORT}/scripts/teaching-kit-print.js"></script>
        <script src="http://127.0.0.1:${PORT}/scripts/teaching-kit-viewer.js"></script>
      </body></html>
    `, { waitUntil: "domcontentloaded" });
    await viewerOnlyPage.waitForFunction(() => window.LLHTeachingKitViewer && window.LLHTeachingKitPrint);
    await viewerOnlyPage.evaluate(async (payload) => {
      await window.LLHTeachingKitViewer.enhanceLessonWorkspace({
        body: document.querySelector("#resourceViewerBody"),
        teachingKit: payload.teachingKit,
        featureFlags: payload.featureFlags,
        chrome: { backLabel: "Back", title: "QA" },
      });
    }, viewerOnly.json);
    await viewerOnlyPage.click("[data-tk-goto='build']");
    await viewerOnlyPage.waitForSelector("[data-tk-panel='build']");
    assert(await viewerOnlyPage.locator("[data-tk-print-binder][disabled]").count() === 1,
      "print disabled when print-center flag off");
    await viewerOnlyPage.close();

    // App.js entitlement order still intact
    const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
    const printStart = appJs.indexOf("async function printTeachingKitBinder");
    const printFn = appJs.slice(printStart, appJs.indexOf("\nfunction applyLessonWorkspaceChrome", printStart));
    assert(printFn.indexOf("confirmTrialCurriculumExport")
      < printFn.indexOf("printApi.buildBinderPrintHtml(kitPayload"),
    "authorize before build in app.js");
    assert(printFn.indexOf("print_flag_off") < printFn.indexOf("confirmTrialCurriculumExport"),
      "flag check before authorize in app.js");

    // Reset flags
    await setFlags(adminToken, {
      teachingKitViewer: false,
      teachingKitPrintCenter: false,
      teachingKitAttachments: false,
    });
    const reset = await requestJson(
      "GET",
      `/api/curriculum/lesson-plans/${proId}/teaching-kit`,
      null,
      { Authorization: "Bearer test:tkqa-pro@example.com" },
    );
    assert(reset.status === 404 && reset.json?.code === "teaching_kit_disabled",
      "flags reset disabled after QA");

    // Write machine-readable findings for the readiness report
    const summary = {
      ok: true,
      assertions: passed,
      findings,
      artifacts: fs.readdirSync(ARTIFACT_DIR).filter((name) => name.endsWith(".png")),
      completedAt: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(ARTIFACT_DIR, "qa-summary.json"),
      JSON.stringify(summary, null, 2),
    );
    fs.writeFileSync(
      path.join(ROOT, "docs/teaching-kit/qa/qa-summary.json"),
      JSON.stringify(summary, null, 2),
    );

    console.log(`OK teaching-kit-phase1-qa (${passed} assertions)`);
    console.log(`Artifacts: ${ARTIFACT_DIR}`);
  } finally {
    try { if (browser) await browser.close(); } catch { /* ignore */ }
    try { child.kill("SIGTERM"); } catch { /* ignore */ }
    try { fs.rmSync(STORE_PATH, { force: true }); } catch { /* ignore */ }
    try { fs.rmSync(STORE_PATH.replace(/\.json$/, ".admin-sessions.json"), { force: true }); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("FAIL teaching-kit-phase1-qa:", error.message || error);
  process.exit(1);
});
