#!/usr/bin/env node
/**
 * Teaching Kit Slice 1E — Print Center / binder print HTML.
 * Flags stay false by default; tests enable print locally then reset.
 * Run: npm run test:teaching-kit-slice-1e
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const teachingKit = require("./teaching-kit.js");
const { withCustomerReleaseApproval } = require("./test-helpers/tk-customer-flags.js");
const teachingKitPrint = require("./teaching-kit-print.js");
const teachingKitViewer = require("./teaching-kit-viewer.js");

const ROOT = path.join(__dirname, "..");
const PORT = 4950 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-teaching-kit-1e-${process.pid}.json`);
const ADMIN = {
  email: "tk-slice1e-admin@example.com",
  password: "tk-slice1e-pass",
  code: "tk-slice1e-code",
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

function sampleDayItem(day, title, category) {
  return {
    itemId: `${day}-1`,
    activityCategory: category,
    title,
    objective: "Explore",
    materials: "Paper\nPaint",
    setup: "Set tray.",
    steps: "1. Invite play.",
    teacherLanguage: "Look: What do you notice?",
    observationOpportunities: "Engaged?",
    safetyNotes: "Wipe spills.",
  };
}

function samplePlan(id) {
  return {
    id,
    title: "Bugs & Butterflies Binder",
    age: "Toddler",
    theme: "Bugs",
    plan: "Pro",
    status: "published",
    learningDomains: ["Approaches to Learning"],
    weeklyOverview: "Explore bugs and butterflies.",
    objectives: "Notice living things.",
    books: [{ title: "The Very Hungry Caterpillar", author: "", notes: "What did it eat?" }],
    songs: [{ title: "Butterfly Flutter", notes: "Lyrics: Flutter.\nMotions: flap" }],
    weeklyMaterials: "Paint\nPaper\nMagnifying glasses",
    vocabularyWords: "Butterfly — an insect with wings. Ask: Can you flutter?",
    observationOpportunities: "Uses describing words?",
    adaptations: "Shorten turns.",
    familyConnection: "Today we explored bugs! Ask your child to flutter.",
    dailyPlans: {
      monday: { theme: "Mon", items: [sampleDayItem("monday", "Bug Sensory Bin", "Sensory Play")] },
      tuesday: { theme: "Tue", items: [sampleDayItem("tuesday", "Butterfly Paint Prints", "Art")] },
      wednesday: { theme: "Wed", items: [sampleDayItem("wednesday", "Caterpillar Crawl", "Gross Motor")] },
      thursday: { theme: "Thu", items: [sampleDayItem("thursday", "Nature Hunt", "Open-Ended Exploration")] },
      friday: { theme: "Fri", items: [sampleDayItem("friday", "Bug Dance", "Music & Movement")] },
    },
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
  store.users["tk1e-pro@example.com"] = {
    email: "tk1e-pro@example.com",
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
  assert(save.status === 200, `flag save: ${save.status}`);
}

function testPrintHtmlUnit() {
  const fixture = require("./fixtures/teaching-kit/enriched-mini.json");
  const kit = teachingKit.mapLessonPlanToTeachingKit(
    fixture.lessonPlan,
    fixture.activities,
    fixture.resources,
    { day: "monday" },
  );
  assert(kit.ok === true, "kit maps for print");

  const full = teachingKitPrint.buildBinderPrintHtml(kit, {
    preset: "week_binder",
    watermark: "Little Learner Hub Trial Preview - Account LLH-TEST-01",
  });
  assert(full.ok === true, "week binder builds");
  assert(full.pageCount >= 4, "binder has multiple pages");
  assert(full.html.includes("tk-print-cover"), "cover page present");
  assert(full.html.includes("Little Learner Hub"), "brand present");
  assert(full.html.includes("Monday Morning Setup"), "setup section present");
  assert(full.html.includes("data-tk-print-tab"), "tab markers present");
  assert(full.html.includes("tk-print-footer"), "running footer present");
  assert(full.html.includes("Little Learner Hub Trial Preview - Account LLH-TEST-01"), "watermark embedded");
  assert(full.html.includes("Rain Sensory Bin"), "activity included by default");

  const removedId = kit.companion.activities[0].id;
  const filtered = teachingKitPrint.buildBinderPrintHtml(kit, {
    preset: "week_binder",
    removedActivityIds: { [removedId]: true },
  });
  assert(!filtered.html.includes(kit.companion.activities[0].title)
    || filtered.selection.activities.every((item) => item.id !== removedId),
  "removed activity excluded from selection");

  const family = teachingKitPrint.buildBinderPrintHtml(kit, { preset: "family_pack" });
  assert(family.ok === true, "family pack builds");
  assert(family.html.includes("Parent Connection") || family.html.includes("family"), "family pack content");
  assert(!family.html.includes("Monday Morning Setup") || !family.selection.parts.setup,
    "family pack omits setup by default");

  const today = teachingKitPrint.buildBinderPrintHtml(kit, {
    preset: "today_pack",
    day: "monday",
  });
  assert(today.selection.days.length === 1 && today.selection.days[0] === "monday",
    "today pack uses selected day");

  // Viewer build surface mentions Print Center when module present
  globalThis.LLHTeachingKitPrint = teachingKitPrint;
  const buildHtml = teachingKitViewer.surfaceHtml(kit, {
    ...teachingKitViewer.defaultState(kit, { printCenterEnabled: true }),
    surface: "build",
  });
  assert(buildHtml.includes("Print Teaching Kit binder"), "print CTA when print center enabled");
  assert(buildHtml.includes("data-tk-print-binder"), "print button hook");
  assert(buildHtml.includes("Print pack"), "presets UI");
}

async function main() {
  testPrintHtmlUnit();

  const child = startServer();
  let browser;
  try {
    await waitForHealth(child);
    const adminToken = await adminLogin();
    seedProUser();

    const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    let expectedUpdatedAt = bootstrap.json.siteContent.updatedAt || "";
    const planId = "cur-lp-tk-slice1e-pro";
    const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      lessonPlan: samplePlan(planId),
    });
    assert(save.status === 200, `save plan: ${save.status} ${save.text}`);

    await setFlags(adminToken, {
      teachingKitViewer: true,
      teachingKitPrintCenter: true,
    });

    const kitRes = await requestJson(
      "GET",
      `/api/curriculum/lesson-plans/${planId}/teaching-kit`,
      null,
      { Authorization: "Bearer test:tk1e-pro@example.com" },
    );
    assert(kitRes.status === 200 && kitRes.json?.featureFlags?.teachingKitPrintCenter === true,
      "print flag echoed on API");
    assert(kitRes.json.featureFlags.teachingKitViewer === true, "viewer flag echoed");

    const built = teachingKitPrint.buildBinderPrintHtml(kitRes.json.teachingKit, {
      preset: "week_binder",
    });
    assert(built.ok && (built.html.includes("Bugs &amp; Butterflies Binder") || built.html.includes("Bugs & Butterflies Binder")),
      "API kit prints with title");
    assert(built.html.includes("tk-print-divider") || built.html.includes("Section divider"),
      "section dividers present");

    const { chromium } = require("playwright");
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(`
      <!doctype html>
      <html><body>
        <div id="resourceViewerBody"></div>
        <script src="http://127.0.0.1:${PORT}/scripts/teaching-kit-print.js"></script>
        <script src="http://127.0.0.1:${PORT}/scripts/teaching-kit-viewer.js"></script>
      </body></html>
    `, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.LLHTeachingKitPrint && window.LLHTeachingKitViewer);

    let printedSelection = null;
    await page.exposeFunction("llhTestOnPrint", (selection) => {
      printedSelection = selection;
    });

    const enhanced = await page.evaluate(async (payload) => {
      const body = document.querySelector("#resourceViewerBody");
      return window.LLHTeachingKitViewer.enhanceLessonWorkspace({
        body,
        teachingKit: payload.teachingKit,
        featureFlags: payload.featureFlags,
        chrome: {
          backLabel: "Back",
          saveButtonHtml: "<button class=\"lesson-workspace-save-btn\">Save</button>",
          actionBarsHtml: "<div data-lesson-use-this-plan>Use This Plan</div>",
        },
        onPrint: (selection) => window.llhTestOnPrint(selection),
      });
    }, kitRes.json);
    assert(enhanced.enhanced === true, "viewer enhances with print flags");

    await page.click("[data-tk-goto='build']");
    await page.waitForSelector("[data-tk-panel='build']");
    assert(await page.locator("[data-tk-print-binder]:not([disabled])").count() === 1,
      "print button enabled when print flag on");

    await page.click("[data-tk-print-binder]");
    await page.waitForTimeout(100);
    assert(printedSelection && printedSelection.preset, "print callback fired with selection");

    // Build print DOM and verify professional binder markers
    await page.evaluate((payload) => {
      const builtHtml = window.LLHTeachingKitPrint.buildBinderPrintHtml(payload.teachingKit, {
        preset: "week_binder",
        watermark: "Little Learner Hub Trial Preview - Account LLH-DEMO",
      });
      document.body.innerHTML = builtHtml.html;
    }, kitRes.json);
    assert(await page.locator(".tk-print-cover").count() === 1, "browser cover rendered");
    assert(await page.locator(".tk-print-footer").count() >= 2, "browser footers rendered");
    assert(await page.locator("text=Little Learner Hub Trial Preview - Account LLH-DEMO").count() >= 1,
      "browser watermark rendered");

    await setFlags(adminToken, {
      teachingKitViewer: false,
      teachingKitPrintCenter: false,
      teachingKitAttachments: false,
    });
    const reset = await requestJson(
      "GET",
      `/api/curriculum/lesson-plans/${planId}/teaching-kit`,
      null,
      { Authorization: "Bearer test:tk1e-pro@example.com" },
    );
    assert(reset.status === 404 && reset.json?.code === "teaching_kit_disabled",
      "flags reset after 1E tests");

    console.log(`OK teaching-kit-slice-1e (${passed} assertions)`);
  } finally {
    try { if (browser) await browser.close(); } catch { /* ignore */ }
    try { child.kill("SIGTERM"); } catch { /* ignore */ }
    try { fs.rmSync(STORE_PATH, { force: true }); } catch { /* ignore */ }
    try { fs.rmSync(STORE_PATH.replace(/\.json$/, ".admin-sessions.json"), { force: true }); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("FAIL teaching-kit-slice-1e:", error.message || error);
  process.exit(1);
});
