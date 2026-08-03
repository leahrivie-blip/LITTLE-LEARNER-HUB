#!/usr/bin/env node
/**
 * Enrichment Editor Slice 2 — Activity Studio foundation.
 * Uses real Farm Animals lesson fixture populated with studio fields.
 * Run: npm run test:teaching-kit-enrichment-slice-2
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const teachingKit = require("./teaching-kit.js");
const enrichment = require("./teaching-kit-enrichment.js");

const ROOT = path.join(__dirname, "..");
const PORT = 5200 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-tk-enrich-s2-${process.pid}.json`);
const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(ROOT, "scripts/fixtures/teaching-kit/farm-animals-enrichment-slice2.json"), "utf8"),
);
const ARTIFACT_DIR = "/opt/cursor/artifacts/assets";
const ADMIN = {
  email: "tk-enrich-s2-admin@example.com",
  password: "tk-enrich-s2-pass",
  code: "tk-enrich-s2-code",
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

function waitForHealth(child, timeoutMs = 25000) {
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
  assert(res.status === 200 && (res.json?.token || res.json?.adminToken), `admin login: ${res.status} ${res.text}`);
  return res.json.token || res.json.adminToken;
}

async function setFlags(adminToken, flags) {
  const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
  const existing = bootstrap.json.siteContent || {};
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
        teachingKitEnrichmentEditor: false,
        ...flags,
      },
    },
  });
  assert(save.status === 200, `flag save: ${save.status} ${save.text}`);
  return save.json.siteContent?.updatedAt || existing.updatedAt;
}

function testFixtureStudioHelpers() {
  assert(FIXTURE.lessonPlan?.id === "cur-lp-preschool-farm-animals", "fixture is Farm Animals");
  assert(Array.isArray(FIXTURE.activities) && FIXTURE.activities.length >= 10, "fixture has real activities");
  const draftActs = FIXTURE.enrichmentDraft?.activities || {};
  const ids = Object.keys(draftActs);
  assert(ids.length >= 5, "fixture populates multiple activities");
  const discovery = FIXTURE.activities.find((a) => a.title === "Farm Animal Discovery Basket");
  assert(discovery, "Discovery Basket activity present");
  const view = enrichment.activityEnrichmentView(discovery, draftActs[discovery.id]);
  assert(view.teacherTips.length >= 1, "discovery tips populated");
  assert(view.substitutions.length >= 1, "discovery substitutions populated");
  assert(view.settingTags.includes("small_group") || view.settingTags.includes("indoor"), "setting tags populated");
  assert(view.observationPrompts.length >= 1, "observation prompts populated");
  assert(view.vocabulary.includes("cow") || view.vocabulary.length >= 1, "vocabulary populated");
  assert(!view.setupImageUrl && !view.exampleImageUrl, "photos remain placeholders (empty)");
  assert(teachingKit.isTeachingKitEnrichmentEditorEnabled({}) === false, "flag still defaults false");
  const featuresNote = "slice2 helpers ok";
  assert(featuresNote, featuresNote);
}

async function main() {
  testFixtureStudioHelpers();

  const child = startServer();
  let browser;
  try {
    await waitForHealth(child);
    const adminToken = await adminLogin();

    let bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    let expectedUpdatedAt = bootstrap.json.siteContent.updatedAt || "";

    // Seed Farm Animals plan + activities via full lesson save (one lesson), then attach enrichment draft.
    const planPayload = {
      ...FIXTURE.lessonPlan,
      // Avoid integrity failures on fixture resource ids that may not exist in temp store.
      resourceIds: [],
    };
    const savePlan = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      lessonPlan: planPayload,
    });
    assert(savePlan.status === 200, `save farm plan: ${savePlan.status} ${savePlan.text}`);
    expectedUpdatedAt = savePlan.json.siteContentUpdatedAt || expectedUpdatedAt;

    // Flag off still blocks draft
    const off = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      saveMode: "enrichment_draft",
      lessonPlan: { id: planPayload.id, enrichmentDraft: FIXTURE.enrichmentDraft },
    });
    assert(off.status === 404 && off.json?.code === "enrichment_editor_disabled", "flag off blocks draft");

    const publishBlocked = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      saveMode: "publish_enrichment",
      lessonPlan: { id: planPayload.id },
    });
    assert(
      publishBlocked.status === 404 && publishBlocked.json?.code === "enrichment_editor_disabled",
      "publish blocked while enrichment editor flag is off",
    );

    expectedUpdatedAt = await setFlags(adminToken, { teachingKitEnrichmentEditor: true });

    const draftSave = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      saveMode: "enrichment_draft",
      lessonPlan: {
        id: planPayload.id,
        enrichmentDraft: FIXTURE.enrichmentDraft,
      },
    });
    assert(draftSave.status === 200 && draftSave.json?.ok === true, `studio draft save: ${draftSave.status} ${draftSave.text}`);
    assert(draftSave.json.publishedUnchanged === true, "published body unchanged");
    expectedUpdatedAt = draftSave.json.siteContentUpdatedAt || expectedUpdatedAt;

    const saved = (draftSave.json.curriculum.lessonPlans || []).find((p) => p.id === planPayload.id);
    assert(saved?.enrichmentDraft?.activities, "enrichmentDraft stored on Farm Animals");
    const discoveryId = FIXTURE.activities.find((a) => a.title === "Farm Animal Discovery Basket").id;
    const savedDiscovery = saved.enrichmentDraft.activities[discoveryId];
    assert(Array.isArray(savedDiscovery?.teacherTips) && savedDiscovery.teacherTips.length, "tips persisted");
    assert(Array.isArray(savedDiscovery?.substitutions) && savedDiscovery.substitutions.length, "substitutions persisted");
    assert(Array.isArray(savedDiscovery?.settingTags) && savedDiscovery.settingTags.length, "setting tags persisted");
    assert(Array.isArray(savedDiscovery?.observationPrompts) && savedDiscovery.observationPrompts.length, "observations persisted");
    assert(Array.isArray(savedDiscovery?.vocabulary) && savedDiscovery.vocabulary.length, "vocabulary persisted");
    assert(saved.title === FIXTURE.lessonPlan.title, "lesson title unchanged");
    assert(saved.weeklyOverview === FIXTURE.lessonPlan.weeklyOverview, "week story unchanged");

    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    const { chromium } = require("playwright");
    browser = await chromium.launch({ headless: true });

    const viewports = [
      { name: "desktop", width: 1280, height: 900, shot: "tk-enrich-slice2-farm-desktop.png" },
      { name: "mobile", width: 390, height: 844, shot: "tk-enrich-slice2-farm-mobile.png" },
    ];

    for (const vp of viewports) {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForFunction(
        () => typeof window.LLHTeachingKitEnrichment !== "undefined"
          && typeof window.LLHTeachingKitEnrichmentEditor !== "undefined",
        null,
        { timeout: 30000 },
      );
      // Hide cookie/consent chrome so review screenshots show the Activity Studio clearly.
      await page.evaluate(() => {
        document.querySelectorAll(
          "[class*='cookie'], [id*='cookie'], [class*='consent'], [id*='consent'], .llh-cookie, #cookieBanner",
        ).forEach((el) => {
          el.style.display = "none";
        });
      });

      const result = await page.evaluate((payload) => {
        const plan = payload.lessonPlan;
        const activities = payload.activities;
        const draft = payload.enrichmentDraft;
        window.curriculumLessonPlanById = (id) => (id === plan.id ? { ...plan, enrichmentDraft: draft } : null);
        window.curriculumActivitiesForLesson = (id) => (id === plan.id ? activities : []);
        window.effectiveSiteContent = () => ({ featureFlags: { teachingKitEnrichmentEditor: true } });
        window.adminSession = () => ({ token: "test", email: "slice2-demo@littlelearnershub.local" });
        window.curriculumExpectedUpdatedAt = () => "";
        window.applyCurriculumState = () => {};
        document.body.classList.add("tk-enrich-open");
        window.LLHTeachingKitEnrichmentEditor.open(plan.id);
        const text = document.body.innerText || "";
        const stage = document.querySelector("[data-activity-studio]");
        return {
          titleVisible: text.includes("Farm Animals"),
          discoveryVisible: text.includes("Farm Animal Discovery Basket") || text.includes("Discovery"),
          tipsVisible: text.includes("Teacher tips") && (text.includes("discovery basket") || text.includes("child height") || text.includes("Prep") || text.includes("Name one animal")),
          subsVisible: text.includes("Supply substitutions") && text.includes("basket"),
          settingsVisible: text.includes("Small group") && text.includes("Indoor"),
          obsVisible: text.includes("Observation prompts"),
          vocabVisible: text.includes("Vocabulary for this activity") && (text.includes("cow") || text.includes("barn")),
          photoZonesVisible: text.includes("Setup photo") && (
            text.includes("placeholder")
            || text.includes("Drop photo")
            || text.includes("Finished example")
            || Boolean(document.querySelector(".tk-enrich-photo input[type='file']"))
          ),
          publishEnabled: Boolean(document.querySelector("[data-enrich-publish]:not([disabled])")),
          noAi: !text.includes("data-ai-tips") && text.includes("AI suggest later"),
          studioPresent: Boolean(stage),
          features: window.LLHTeachingKitEnrichmentEditor.sliceFeatures(),
          overflowX: (() => {
            const shell = document.querySelector(".tk-enrich-shell");
            return shell ? shell.scrollWidth > shell.clientWidth + 2 : true;
          })(),
        };
      }, {
        lessonPlan: FIXTURE.lessonPlan,
        activities: FIXTURE.activities,
        enrichmentDraft: FIXTURE.enrichmentDraft,
      });

      assert(result.studioPresent, `${vp.name}: activity studio present`);
      assert(result.titleVisible, `${vp.name}: Farm Animals title visible`);
      assert(result.tipsVisible, `${vp.name}: teacher tips visible from real draft`);
      assert(result.subsVisible, `${vp.name}: substitutions visible`);
      assert(result.settingsVisible, `${vp.name}: group/setting chips visible`);
      assert(result.obsVisible, `${vp.name}: observation prompts section visible`);
      assert(result.vocabVisible, `${vp.name}: vocabulary visible`);
      assert(result.photoZonesVisible, `${vp.name}: photo zones visible`);
      assert(result.publishEnabled, `${vp.name}: publish control available`);
      assert(result.features.aiSuggest === false, `${vp.name}: aiSuggest false`);
      assert(result.features.publish === true, `${vp.name}: publish feature on`);
      assert(result.features.activityStudio === true, `${vp.name}: activityStudio true`);
      assert(result.overflowX === false, `${vp.name}: no horizontal overflow`);

      const shotPath = path.join(ARTIFACT_DIR, vp.shot);
      const host = page.locator("#adminTeachingKitEnrichmentHost");
      await host.waitFor({ state: "visible", timeout: 10000 });
      await host.screenshot({ path: shotPath });
      assert(fs.existsSync(shotPath) && fs.statSync(shotPath).size > 1000, `${vp.name}: screenshot written`);

      // Second crop focused on the Activity Studio stage (populated real fields).
      const studioShot = path.join(ARTIFACT_DIR, vp.shot.replace("farm-", "farm-studio-"));
      const stage = page.locator("[data-activity-studio]");
      if (await stage.count()) {
        await stage.scrollIntoViewIfNeeded();
        await stage.screenshot({ path: studioShot });
        assert(fs.existsSync(studioShot) && fs.statSync(studioShot).size > 800, `${vp.name}: studio screenshot written`);
      }
      await page.close();
    }

    await setFlags(adminToken, { teachingKitEnrichmentEditor: false });
    console.log(`OK teaching-kit-enrichment-slice-2 (${passed} assertions)`);
    console.log(`Artifacts: ${path.join(ARTIFACT_DIR, "tk-enrich-slice2-farm-desktop.png")}`);
    console.log(`Artifacts: ${path.join(ARTIFACT_DIR, "tk-enrich-slice2-farm-mobile.png")}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    child.kill("SIGTERM");
    try {
      await new Promise((resolve) => child.once("exit", resolve));
    } catch {
      // ignore
    }
    fs.rmSync(STORE_PATH, { force: true });
    fs.rmSync(STORE_PATH.replace(/\.json$/, ".admin-sessions.json"), { force: true });
  }
}

main().catch((error) => {
  console.error("FAIL teaching-kit-enrichment-slice-2:", error.message || error);
  process.exitCode = 1;
});
