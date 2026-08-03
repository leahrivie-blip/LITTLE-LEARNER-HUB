#!/usr/bin/env node
/**
 * Teaching Kit Slice 1D — flagged companion UI (Playwright).
 * Flags stay false by default; this test enables viewer locally then resets.
 * Run: npm run test:teaching-kit-slice-1d
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const teachingKitViewer = require("./teaching-kit-viewer.js");
const teachingKit = require("./teaching-kit.js");
const { withCustomerReleaseApproval } = require("./test-helpers/tk-customer-flags.js");

const ROOT = path.join(__dirname, "..");
const PORT = 4900 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-teaching-kit-1d-${process.pid}.json`);
const ADMIN = {
  email: "tk-slice1d-admin@example.com",
  password: "tk-slice1d-pass",
  code: "tk-slice1d-code",
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

function samplePlan(id, extras = {}) {
  return {
    id,
    title: "Bugs & Butterflies TK 1D",
    age: "Toddler",
    theme: "Bugs",
    plan: "Pro",
    status: "published",
    learningDomains: ["Approaches to Learning"],
    weeklyOverview: "Toddlers explore bugs and butterflies.",
    objectives: "Notice living things.\nBuild vocabulary.",
    books: [{ title: "The Very Hungry Caterpillar", author: "", notes: "What did the caterpillar eat?" }],
    songs: [{ title: "Butterfly Flutter", notes: "Lyrics: Flutter flutter.\nMotions: flap arms" }],
    weeklyMaterials: "Magnifying glasses\nPaint\nPaper",
    vocabularyWords: "Butterfly — an insect with wings. Ask: Can you flutter?",
    observationOpportunities: "Uses describing words?",
    adaptations: "Shorten outdoor time.",
    familyConnection: "Today we explored bugs and butterflies! Ask your child to show a flutter.",
    dailyPlans: {
      monday: {
        theme: "Bug explorers",
        materials: "Magnifying glasses",
        transitions: ["Flutter to your cubby"],
        observations: ["Curious looking?"],
        items: [{
          itemId: "mon-1",
          activityCategory: "Sensory Play",
          title: "Bug Sensory Bin",
          objective: "Explore textures",
          materials: "Sensory bin\nScoops",
          setup: "Fill bin.",
          steps: "1. Invite play.",
          teacherLanguage: "Look: What do you feel?",
          observationOpportunities: "Scoops independently?",
          safetyNotes: "Wipe spills.",
        }],
      },
      tuesday: { theme: "Tue", items: [{ itemId: "tue-1", activityCategory: "Art", title: "Butterfly Paint Prints", objective: "Print wings", materials: "Paint\nPaper", setup: "Set paper.", steps: "1. Fold.", teacherLanguage: "Look: Are the sides the same?", observationOpportunities: "Tries folding?", safetyNotes: "Washable paint." }] },
      wednesday: { theme: "Wed", items: [{ itemId: "wed-1", activityCategory: "Gross Motor", title: "Caterpillar Crawl", objective: "Move like a caterpillar", materials: "Open floor space", setup: "Clear path.", steps: "1. Crawl together.", teacherLanguage: "Look: Can you make a long line?", observationOpportunities: "Joins movement?", safetyNotes: "Clear tripping hazards." }] },
      thursday: { theme: "Thu", items: [{ itemId: "thu-1", activityCategory: "Open-Ended Exploration", title: "Magnifying Glass Hunt", objective: "Look closely outdoors", materials: "Magnifying glasses", setup: "Hand out glasses.", steps: "1. Look under leaves.", teacherLanguage: "Wonder: Where might a bug hide?", observationOpportunities: "Uses glass independently?", safetyNotes: "Stay in boundary." }] },
      friday: { theme: "Fri", items: [{ itemId: "fri-1", activityCategory: "Music & Movement", title: "Bug Dance Party", objective: "Move to music", materials: "Music", setup: "Clear space.", steps: "1. Dance like bugs.", teacherLanguage: "Look: Can you flutter?", observationOpportunities: "Tries motions?", safetyNotes: "Soft landing area." }] },
    },
    ...extras,
  };
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

function seedProUser() {
  const now = new Date().toISOString();
  const future = new Date(Date.now() + 14 * 86400000).toISOString();
  const store = readTempStore();
  store.users = store.users || {};
  store.users["tk1d-pro@example.com"] = {
    email: "tk1d-pro@example.com",
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
        ...withCustomerReleaseApproval(flags),
      },
    },
  });
  assert(save.status === 200, `flag save: ${save.status} ${save.text}`);
}

function testViewerUnitRender() {
  const fixture = require("./fixtures/teaching-kit/enriched-mini.json");
  const kit = teachingKit.mapLessonPlanToTeachingKit(
    fixture.lessonPlan,
    fixture.activities,
    fixture.resources,
    { day: "monday", readyMaterials: ["Sensory bin", "Cups"] },
  );
  assert(kit.ok === true, "mapper ok for viewer unit");
  const html = teachingKitViewer.workspaceHtml(kit, teachingKitViewer.defaultState(kit), {
    backLabel: "Back",
    saveButtonHtml: "<button class=\"lesson-workspace-save-btn\">Save</button>",
    actionBarsHtml: "<div class=\"lesson-workspace-action-bars\" data-lesson-action-bars></div>",
  });
  assert(html.includes("data-teaching-kit-workspace"), "workspace root present");
  assert(html.includes("Monday Setup"), "setup nav present");
  assert(html.includes("Open Monday Morning Setup"), "start CTA present");
  assert(html.includes("lesson-workspace-back"), "back control preserved");
  assert(html.includes("lesson-workspace-save-btn"), "save control preserved");
  assert(html.includes("data-lesson-action-bars"), "action bars preserved");

  const todayHtml = teachingKitViewer.surfaceHtml(kit, { ...teachingKitViewer.defaultState(kit), surface: "today", day: "monday" });
  assert(todayHtml.includes("Open Everything I Need Today"), "today open-everything CTA");
  assert(todayHtml.includes("Parent connection"), "parent connection on today");

  const activity = kit.companion.activities[0];
  const activityHtml = teachingKitViewer.surfaceHtml(kit, {
    ...teachingKitViewer.defaultState(kit),
    surface: "activity",
    activityId: activity.id,
    showSubstitute: true,
  });
  assert(activityHtml.includes("Substitute This Activity"), "substitute control");
  assert(activityHtml.includes("Learning objective"), "activity objective");
  assert(activityHtml.includes("Cleanup tips"), "cleanup tips");
}

async function main() {
  testViewerUnitRender();

  const child = startServer();
  let browser;
  try {
    await waitForHealth(child);
    const adminToken = await adminLogin();
    seedProUser();

    const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    let expectedUpdatedAt = bootstrap.json.siteContent.updatedAt || "";
    const planId = "cur-lp-tk-slice1d-pro";
    const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      lessonPlan: samplePlan(planId),
    });
    assert(save.status === 200, `save plan: ${save.status} ${save.text}`);

    // Flag off: API disabled; UI module should not enhance (verified via API)
    const off = await requestJson(
      "GET",
      `/api/curriculum/lesson-plans/${planId}/teaching-kit`,
      null,
      { Authorization: "Bearer test:tk1d-pro@example.com" },
    );
    assert(off.status === 404 && off.json?.code === "teaching_kit_disabled", "flags off before UI test");

    await setFlags(adminToken, { teachingKitViewer: true });

    const { chromium } = require("playwright");
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Stub membership identity for curriculum API calls from the browser.
    await page.addInitScript(() => {
      Object.defineProperty(window, "__LLH_TEST_AUTH_EMAIL", {
        value: "tk1d-pro@example.com",
        configurable: true,
      });
    });

    await page.route("**/api/curriculum/lesson-plans/**", async (route) => {
      const url = route.request().url();
      const headers = {
        ...route.request().headers(),
        authorization: "Bearer test:tk1d-pro@example.com",
      };
      const response = await page.request.fetch(url, {
        headers,
        method: route.request().method(),
      });
      const body = await response.body();
      await route.fulfill({
        status: response.status(),
        headers: response.headers(),
        body,
      });
    });

    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => typeof window.LLHTeachingKitViewer !== "undefined", null, { timeout: 30000 });
    assert(true, "viewer module loaded in browser");

    // Directly exercise enhance path with live API payload (avoids full app auth/bootstrap fragility).
    const kitRes = await requestJson(
      "GET",
      `/api/curriculum/lesson-plans/${planId}/teaching-kit?day=monday`,
      null,
      { Authorization: "Bearer test:tk1d-pro@example.com" },
    );
    assert(kitRes.status === 200 && kitRes.json?.teachingKit?.locked === false, "kit API unlocked for Pro");
    assert(kitRes.json.featureFlags?.teachingKitViewer === true, "viewer flag echoed");

    await page.setContent(`
      <!doctype html>
      <html><body>
        <div id="resourceViewerBody"></div>
        <script src="http://127.0.0.1:${PORT}/scripts/teaching-kit-viewer.js"></script>
      </body></html>
    `, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof window.LLHTeachingKitViewer !== "undefined");

    const enhanced = await page.evaluate(async (payload) => {
      const body = document.querySelector("#resourceViewerBody");
      return window.LLHTeachingKitViewer.enhanceLessonWorkspace({
        body,
        teachingKit: payload.teachingKit,
        featureFlags: payload.featureFlags,
        chrome: {
          backLabel: "Back",
          saveButtonHtml: "<button class=\"lesson-workspace-save-btn\" data-favorite=\"x\">Save</button>",
          actionBarsHtml: "<div class=\"lesson-workspace-action-bars\" data-lesson-use-this-plan>Use This Plan</div>",
        },
      });
    }, kitRes.json);

    assert(enhanced.enhanced === true, `enhance ok: ${enhanced.reason}`);
    assert(await page.locator("[data-teaching-kit-workspace]").count() === 1, "teaching kit workspace mounted");
    assert(await page.locator("[data-lesson-workspace-back]").count() === 1, "back intact");
    assert(await page.locator(".lesson-workspace-save-btn").count() === 1, "favorite/save intact");
    assert(await page.locator("[data-lesson-use-this-plan]").count() === 1, "assign/use plan intact");

    await page.click("[data-tk-goto='setup']");
    await page.waitForSelector("[data-tk-panel='setup']");
    assert(await page.locator("text=Estimated prep time").count() >= 1, "monday setup shows prep time");

    await page.click("[data-tk-goto='today']");
    await page.waitForSelector("[data-tk-panel='today']");
    await page.click("[data-tk-open-everything]");
    assert(await page.locator("[data-tk-tray]").count() === 1, "open everything tray visible");

    const openActivity = page.locator("[data-tk-open-activity]").first();
    if (await openActivity.count()) {
      await openActivity.click();
      await page.waitForSelector("[data-tk-panel='activity']");
      assert(await page.locator("text=Learning objective").count() >= 1, "activity detail depth");
      await page.click("[data-tk-toggle-substitute]");
      assert(await page.locator("text=Substitute This Activity").count() >= 1, "substitute panel");
    }

    await page.click("[data-tk-goto='build']");
    await page.waitForSelector("[data-tk-panel='build']");
    assert(await page.locator("text=Activities in this kit").count() >= 1, "build my kit surface");
    await page.click("[data-tk-goto='binder']");
    await page.waitForSelector("[data-tk-panel='binder']");
    // Vision-aligned digital binder uses hero cover (not the older .tk-binder-cover card).
    assert(await page.locator(".tk-binder-hero").count() === 1, "binder preview cover");
    assert(await page.locator(".tk-binder-cover-media").count() === 1, "binder cover media");

    // Fail closed when viewer flag false
    const disabled = await page.evaluate(async (payload) => {
      const body = document.querySelector("#resourceViewerBody");
      body.innerHTML = "";
      return window.LLHTeachingKitViewer.enhanceLessonWorkspace({
        body,
        teachingKit: payload.teachingKit,
        featureFlags: { teachingKitViewer: false },
        chrome: {},
      });
    }, kitRes.json);
    assert(disabled.enhanced === false && disabled.reason === "viewer_flag_off", "flag off fails closed");

    await setFlags(adminToken, {
      teachingKitViewer: false,
      teachingKitPrintCenter: false,
      teachingKitAttachments: false,
    });
    const reset = await requestJson(
      "GET",
      `/api/curriculum/lesson-plans/${planId}/teaching-kit`,
      null,
      { Authorization: "Bearer test:tk1d-pro@example.com" },
    );
    assert(reset.status === 404 && reset.json?.code === "teaching_kit_disabled", "flags reset after 1D test");

    console.log(`OK teaching-kit-slice-1d (${passed} assertions)`);
  } finally {
    try { if (browser) await browser.close(); } catch { /* ignore */ }
    try { child.kill("SIGTERM"); } catch { /* ignore */ }
    try { fs.rmSync(STORE_PATH, { force: true }); } catch { /* ignore */ }
    try { fs.rmSync(STORE_PATH.replace(/\.json$/, ".admin-sessions.json"), { force: true }); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("FAIL teaching-kit-slice-1d:", error.message || error);
  process.exit(1);
});
