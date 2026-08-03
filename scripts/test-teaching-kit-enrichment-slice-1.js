#!/usr/bin/env node
/**
 * Enrichment Editor Slice 1 — framework, navigation, progress, draft workflow.
 * Flag defaults false. Photos / AI / publish stay disabled.
 * Run: npm run test:teaching-kit-enrichment-slice-1
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const teachingKit = require("./teaching-kit.js");
const enrichment = require("./teaching-kit-enrichment.js");

const ROOT = path.join(__dirname, "..");
const PORT = 5100 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-tk-enrich-s1-${process.pid}.json`);
const ADMIN = {
  email: "tk-enrich-s1-admin@example.com",
  password: "tk-enrich-s1-pass",
  code: "tk-enrich-s1-code",
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
  assert(res.status === 200 && (res.json?.token || res.json?.adminToken), `admin login: ${res.status} ${res.text}`);
  return res.json.token || res.json.adminToken;
}

function samplePlan(id) {
  return {
    id,
    title: "Enrich Slice 1 Farm",
    age: "Preschool",
    theme: "Farm",
    plan: "Pro",
    status: "published",
    weeklyOverview: "A calm farm week.",
    objectives: "Sort and name animals.",
    books: [{ title: "Big Red Barn" }],
    songs: [{ title: "Old MacDonald" }],
    weeklyMaterials: "Bins, animals",
    vocabularyWords: "cow, barn",
    familyConnection: "Ask about favorite animals.",
    observationOpportunities: "Watch sorting.",
    resourceIds: [],
    coverImageUrl: "https://example.com/cover.jpg",
    dailyPlans: {
      monday: {
        items: [
          {
            itemId: "m1",
            title: "Color Sorting Barn",
            activityCategory: "Fine Motor",
            objective: "Sort by color",
            materials: "Barn toys",
          },
          {
            itemId: "m2",
            title: "Barn Songs",
            activityCategory: "Music and Movement",
            objective: "Sing along",
            materials: "None",
          },
        ],
      },
      tuesday: { items: [{ itemId: "t1", title: "Sensory Hay", activityCategory: "Sensory", objective: "Explore", materials: "Hay" }] },
      wednesday: { items: [{ itemId: "w1", title: "Farm Walk", activityCategory: "Gross Motor", objective: "Move", materials: "Cones" }] },
      thursday: { items: [{ itemId: "th1", title: "Animal Match", activityCategory: "Matching", objective: "Match", materials: "Cards" }] },
      friday: { items: [{ itemId: "f1", title: "Family Share", activityCategory: "Social-Emotional", objective: "Share", materials: "Photos" }] },
    },
  };
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
}

function testFlagDefaultsAndHelpers() {
  const defaults = teachingKit.defaultTeachingKitFeatureFlags();
  assert(defaults.teachingKitEnrichmentEditor === false, "enrichment editor flag defaults false");
  assert(
    teachingKit.isTeachingKitEnrichmentEditorEnabled({}) === false,
    "empty flags → editor disabled",
  );
  assert(
    teachingKit.isTeachingKitEnrichmentEditorEnabled({ teachingKitEnrichmentEditor: true }) === true,
    "explicit true enables editor",
  );
  assert(
    teachingKit.isTeachingKitEnrichmentEditorEnabled({ teachingKitEnrichmentEditor: "true" }) === false,
    "string true does not enable",
  );

  const plan = samplePlan("unit-plan");
  const acts = enrichment.flattenLessonActivities(plan, []);
  assert(acts.length === 6, "sample flattens 6 activities");
  assert(enrichment.firstIncompleteActivityIndex(acts, {}) === 0, "resume starts at first incomplete");
  const summary = enrichment.buildUpgradeSummary(plan, acts, null);
  assert(summary.completionPercent >= 0, "summary percent");
  assert(summary.incompleteActivities === 6, "all incomplete initially");
  assert(typeof summary.draftOrPublished === "string", "draft/published label");
}

async function testViewports(page, baseUrl) {
  const viewports = [
    { name: "desktop", width: 1280, height: 800 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "mobile", width: 390, height: 844 },
  ];

  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const metrics = await page.evaluate(async () => {
      const host = document.querySelector("#adminTeachingKitEnrichmentHost");
      document.body.classList.add("tk-enrich-open");
      // Minimal plan fixture for framework chrome
      window.curriculumLessonPlanById = () => ({
        id: "vp-plan",
        title: "Viewport Farm",
        age: "Preschool",
        status: "published",
        theme: "Farm",
        plan: "Pro",
        books: [{ title: "Barn" }],
        songs: [{ title: "Song" }],
        resourceIds: ["r1"],
        weeklyOverview: "Week",
        familyConnection: "Family",
        coverImageUrl: "https://example.com/c.jpg",
        dailyPlans: {
          monday: { items: [{ itemId: "a1", title: "Sort", activityCategory: "Fine Motor" }] },
          tuesday: { items: [] },
          wednesday: { items: [] },
          thursday: { items: [] },
          friday: { items: [] },
        },
      });
      window.curriculumActivitiesForLesson = () => [];
      window.effectiveSiteContent = () => ({ featureFlags: { teachingKitEnrichmentEditor: true } });
      window.adminSession = () => ({ token: "test", email: "owner@example.com" });
      window.curriculumExpectedUpdatedAt = () => "";
      window.applyCurriculumState = () => {};
      if (!host) return { ok: false, reason: "missing-host" };
      window.LLHTeachingKitEnrichmentEditor.open("vp-plan");
      const shell = document.querySelector(".tk-enrich-shell");
      const chrome = document.querySelector(".tk-enrich-chrome");
      const counter = document.querySelector(".tk-enrich-counter");
      const summary = document.querySelector("[data-upgrade-summary]");
      const publishDisabled = Boolean(document.querySelector("[data-enrich-publish][disabled], .tk-enrich-chrome-actions button[disabled]"));
      const bodyText = document.body.innerText || "";
      const sliceNote = /Slice\s+[12]/i.test(bodyText) || bodyText.includes("Activity Studio") || bodyText.includes("Draft autosave");
      const overflowX = shell ? shell.scrollWidth > shell.clientWidth + 2 : true;
      return {
        ok: Boolean(shell && chrome && counter && summary),
        publishDisabled,
        sliceNote,
        overflowX,
        shellWidth: shell?.clientWidth || 0,
        features: window.LLHTeachingKitEnrichmentEditor.sliceFeatures(),
      };
    });
    assert(metrics.ok, `${vp.name}: shell/chrome/counter/summary present`);
    assert(metrics.publishDisabled === true, `${vp.name}: publish disabled`);
    assert(metrics.sliceNote === true, `${vp.name}: slice 1 banner visible`);
    assert(metrics.features.aiSuggest === false, `${vp.name}: aiSuggest false`);
    assert(metrics.features.publish === false, `${vp.name}: publish false`);
    assert(metrics.overflowX === false, `${vp.name}: no horizontal overflow (${metrics.shellWidth}px)`);
    void baseUrl;
  }
}

async function main() {
  testFlagDefaultsAndHelpers();

  const child = startServer();
  let browser;
  try {
    await waitForHealth(child);
    const adminToken = await adminLogin();

    const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    let expectedUpdatedAt = bootstrap.json.siteContent.updatedAt || "";
    assert(
      bootstrap.json.siteContent.featureFlags?.teachingKitEnrichmentEditor !== true,
      "server default keeps enrichment editor off",
    );

    const planId = "cur-lp-tk-enrich-s1";
    const otherId = "cur-lp-tk-enrich-s1-other";
    const saveA = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      lessonPlan: samplePlan(planId),
    });
    assert(saveA.status === 200, `save plan A: ${saveA.status} ${saveA.text}`);
    expectedUpdatedAt = saveA.json.siteContentUpdatedAt || expectedUpdatedAt;

    const saveB = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      lessonPlan: samplePlan(otherId),
    });
    assert(saveB.status === 200, `save plan B: ${saveB.status} ${saveB.text}`);
    expectedUpdatedAt = saveB.json.siteContentUpdatedAt || expectedUpdatedAt;

    // Flag off: draft API disabled
    const offDraft = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      saveMode: "enrichment_draft",
      lessonPlan: {
        id: planId,
        enrichmentDraft: {
          updatedAt: new Date().toISOString(),
          lastEditedBy: ADMIN.email,
          activities: {
            [`${planId}:m1`]: { teacherTips: ["Should not save while flag off"] },
          },
        },
      },
    });
    assert(
      offDraft.status === 404 && offDraft.json?.code === "enrichment_editor_disabled",
      "flag off blocks enrichment_draft",
    );

    // Publish always blocked in Slice 1
    const publishBlocked = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      saveMode: "publish_enrichment",
      lessonPlan: { id: planId, enrichmentDraft: { activities: {} } },
    });
    assert(
      publishBlocked.status === 403 && publishBlocked.json?.code === "enrichment_publish_disabled",
      "publish_enrichment disabled in Slice 1",
    );

    await setFlags(adminToken, { teachingKitEnrichmentEditor: true });
    const afterFlags = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    expectedUpdatedAt = afterFlags.json.siteContent.updatedAt || expectedUpdatedAt;
    assert(
      afterFlags.json.siteContent.featureFlags?.teachingKitEnrichmentEditor === true,
      "flag can be enabled for local review",
    );

    const beforeOther = (afterFlags.json.siteContent.curriculum.lessonPlans || [])
      .find((p) => p.id === otherId);
    const beforeOtherJson = JSON.stringify(beforeOther);

    const draftSave = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      saveMode: "enrichment_draft",
      lessonPlan: {
        id: planId,
        enrichmentDraft: {
          updatedAt: new Date().toISOString(),
          lastEditedBy: ADMIN.email,
          activities: {
            // key may vary; server stores opaque draft map
            m1: { teacherTips: ["Prep trays before circle"] },
          },
          week: { familyConnection: "" },
        },
      },
    });
    assert(draftSave.status === 200 && draftSave.json?.ok === true, `draft save: ${draftSave.status} ${draftSave.text}`);
    assert(draftSave.json.publishedUnchanged === true, "draft save marks publishedUnchanged");
    assert(draftSave.json.saveMode === "enrichment_draft", "saveMode echoed");
    expectedUpdatedAt = draftSave.json.siteContentUpdatedAt || expectedUpdatedAt;

    const savedPlan = (draftSave.json.curriculum.lessonPlans || []).find((p) => p.id === planId);
    const otherAfter = (draftSave.json.curriculum.lessonPlans || []).find((p) => p.id === otherId);
    assert(savedPlan?.enrichmentDraft?.lastEditedBy === ADMIN.email, "draft records lastEditedBy");
    assert(savedPlan?.enrichmentDraft?.activities?.m1?.teacherTips?.[0] === "Prep trays before circle", "draft tip stored");
    assert(savedPlan?.title === "Enrich Slice 1 Farm", "published title unchanged");
    assert(savedPlan?.weeklyOverview === "A calm farm week.", "published week story unchanged");
    assert(JSON.stringify(otherAfter) === beforeOtherJson, "other lesson untouched by draft save");

    // Scripts present on homepage shell
    const home = await requestJson("GET", "/");
    assert(home.text.includes("teaching-kit-enrichment.js"), "enrichment helper script tagged");
    assert(home.text.includes("teaching-kit-enrichment-editor.js"), "enrichment editor script tagged");
    assert(home.text.includes("adminTeachingKitEnrichmentHost"), "editor host present");

    const { chromium } = require("playwright");
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(
      () => typeof window.LLHTeachingKitEnrichment !== "undefined"
        && typeof window.LLHTeachingKitEnrichmentEditor !== "undefined"
        && typeof window.LLHTeachingKit !== "undefined",
      null,
      { timeout: 30000 },
    );
    assert(true, "enrichment modules loaded in browser");

    await testViewports(page, `http://127.0.0.1:${PORT}`);

    // Reset flag (rollback path)
    await setFlags(adminToken, { teachingKitEnrichmentEditor: false });
    const reset = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    assert(reset.json.siteContent.featureFlags?.teachingKitEnrichmentEditor !== true, "flag reset to false");

    console.log(`OK teaching-kit-enrichment-slice-1 (${passed} assertions)`);
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
  console.error("FAIL teaching-kit-enrichment-slice-1:", error.message || error);
  process.exitCode = 1;
});
