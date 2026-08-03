#!/usr/bin/env node
/**
 * Complete Teaching Kit System — binder authoring (classic editor).
 * Flag: teachingKitAuthoring (default false). teachingKitEnrichmentEditor stays false.
 *
 * Run: npm run test:teaching-kit-authoring
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const teachingKit = require("./teaching-kit.js");
const authoring = require("./teaching-kit-authoring.js");

const ROOT = path.join(__dirname, "..");
const PORT = 5850 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-tk-authoring-${process.pid}.json`);
const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(ROOT, "scripts/fixtures/teaching-kit/farm-animals-enrichment-slice2.json"), "utf8"),
);
const ARTIFACT_DIR = "/opt/cursor/artifacts/assets";
const ADMIN = {
  email: "tk-authoring-admin@example.com",
  password: "tk-authoring-pass",
  code: "tk-authoring-code",
};
const DISCOVERY_ID = "cur-act-e14264deb203e7dc";

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
        /* retry */
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

async function adminLogin() {
  const res = await requestJson("POST", "/api/admin/login", {
    email: ADMIN.email,
    password: ADMIN.password,
    code: ADMIN.code,
  });
  assert(res.status === 200 && (res.json?.token || res.json?.adminToken), "admin login");
  return res.json.token || res.json.adminToken;
}

async function setFlags(adminToken, flags) {
  const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
  const existing = bootstrap.json.siteContent || {};
  const save = await requestJson("POST", "/api/admin/site-content", {
    adminToken,
    expectedUpdatedAt: existing.updatedAt,
    siteContent: {
      ...existing,
      updatedAt: existing.updatedAt,
      featureFlags: {
        ...(existing.featureFlags || {}),
        teachingKitEnrichmentEditor: false,
        ...flags,
      },
    },
  }, { Authorization: `Bearer ${adminToken}` });
  assert(save.status === 200, "flags saved");
  const after = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
  return after.json.siteContent?.updatedAt || "";
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  fs.rmSync(STORE_PATH, { force: true });

  // Unit: defaults
  const defaults = teachingKit.defaultTeachingKitFeatureFlags();
  assert(defaults.teachingKitAuthoring === false, "authoring default false");
  assert(defaults.teachingKitEnrichmentEditor === false, "enrichment editor stays default false");
  assert(teachingKit.isTeachingKitAuthoringEnabled({}) === false, "authoring off when absent");
  assert(teachingKit.isTeachingKitAuthoringEnabled({ teachingKitAuthoring: true }) === true, "authoring on when true");
  assert(teachingKit.isTeachingKitAiAssistEnabled({ teachingKitAuthoring: true }) === true, "AI assist via authoring");
  assert(teachingKit.isTeachingKitAiAssistEnabled({ teachingKitEnrichmentEditor: false }) === false, "AI off when both false");
  assert(teachingKit.sectionIds().includes("teacher_toolkit"), "teacher_toolkit section registered");

  const completeness = authoring.buildBinderCompleteness(
    {
      weeklyOverview: "Week of farm fun",
      objectives: "Sort and describe",
      weeklyMaterials: "Baskets",
      vocabularyWords: "barn",
      familyConnection: "Talk at home",
      books: [{ title: "Big Red Barn" }],
      songs: [{ title: "Old MacDonald" }],
      resourceIds: ["res-1"],
      teachingKit: {
        teacherToolkit: {
          teacherPreparation: "Prep discovery basket",
          prepChecklist: ["Print cards"],
          observationFocus: ["Sorting"],
          notes: "Keep tips short",
        },
      },
      dailyPlans: {
        monday: {
          items: [{
            itemId: DISCOVERY_ID,
            title: "Discovery",
            setup: "Set basket",
            materials: "Animals",
            teacherTips: ["Sort by size"],
            observationOpportunities: "Naming",
            vocabulary: "hoof",
            settingTags: ["small_group", "indoor"],
            indoorAlternatives: "Table sort",
            outdoorAlternatives: "Yard hunt",
            exampleImageUrl: "https://example.com/a.jpg",
          }],
        },
      },
    },
    [],
  );
  assert(completeness.percent === 100, `binder completeness 100 got ${completeness.percent}`);
  assert(completeness.label === "Complete", "complete label");

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      NODE_ENV: "test",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      LLH_ENRICHMENT_AI_FIXTURE: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

  let browser;
  try {
    await waitForHealth(child);
    const adminToken = await adminLogin();
    const auth = { Authorization: `Bearer ${adminToken}` };

    // Flag-off: authoring UI APIs for AI stay blocked; enrichment editor remains false
    let expectedUpdatedAt = await setFlags(adminToken, {
      teachingKitAuthoring: false,
      teachingKitEnrichmentEditor: false,
      teachingKitViewer: true,
    });
    const blockedAi = await requestJson("POST", "/api/admin/curriculum/enrichment-ai-suggest", {
      adminToken,
      planId: "x",
      activityKey: "y",
      scope: "activity",
    }, auth);
    assert(blockedAi.status === 404 && blockedAi.json?.code === "enrichment_editor_disabled", "AI blocked when both flags off");

    // Seed lesson
    let res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      lessonPlan: FIXTURE.lessonPlan,
    }, auth);
    assert(res.status === 200, "seed farm animals");
    expectedUpdatedAt = res.json.siteContentUpdatedAt;

    // Enable authoring only — enrichment editor stays false
    expectedUpdatedAt = await setFlags(adminToken, {
      teachingKitAuthoring: true,
      teachingKitEnrichmentEditor: false,
      teachingKitViewer: true,
    });
    const flagsBoot = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    assert(flagsBoot.json.siteContent.featureFlags.teachingKitAuthoring === true, "authoring enabled");
    assert(flagsBoot.json.siteContent.featureFlags.teachingKitEnrichmentEditor !== true, "enrichment editor still off");

    // Classic save with binder fields + toolkit (does not use enrichment draft/publish)
    const plan = (res.json.curriculum.lessonPlans || []).find((p) => p.id === FIXTURE.lessonPlan.id);
    const day = "monday";
    const items = (plan.dailyPlans?.[day]?.items || []).map((item) => {
      if (item.itemId !== DISCOVERY_ID && !/discovery/i.test(item.title || "")) return item;
      return {
        ...item,
        teacherTips: ["Invite children to sort by size."],
        substitutions: [{ need: "plastic animals", use: "printed cards" }],
        settingTags: ["small_group", "indoor"],
        indoorAlternatives: "Use a tabletop tray when weather is poor.",
        outdoorAlternatives: "Hide animals in the grass for a hunt.",
        cleanupTips: "Return animals to the basket by color.",
        setupImageUrl: "https://cdn.example.com/setup.jpg",
        exampleImageUrl: "https://cdn.example.com/example.jpg",
        observationOpportunities: "Which attributes do children name?",
      };
    });
    const nextPlan = {
      ...plan,
      weeklyOverview: `${plan.weeklyOverview || ""}\nBinder authoring pass.`.trim(),
      dailyPlans: {
        ...plan.dailyPlans,
        [day]: { ...(plan.dailyPlans?.[day] || {}), items },
      },
      teachingKit: {
        schemaVersion: 1,
        completeness: "enriched",
        teacherToolkit: {
          teacherPreparation: "Prep the discovery basket before Monday circle.",
          prepChecklist: ["Print animal cards", "Set out sorting trays"],
          observationFocus: ["Attribute language", "Peer sharing"],
          notes: "Toolkit is checklist-first — not a second copy of every activity.",
        },
      },
    };
    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      lessonPlan: nextPlan,
    }, auth);
    assert(res.status === 200, `binder classic save: ${res.status} ${String(res.text).slice(0, 200)}`);
    expectedUpdatedAt = res.json.siteContentUpdatedAt;
    const saved = (res.json.curriculum.lessonPlans || []).find((p) => p.id === plan.id);
    const savedItem = (saved.dailyPlans?.monday?.items || []).find((item) => item.itemId === DISCOVERY_ID || /discovery/i.test(item.title || ""));
    assert(savedItem?.teacherTips?.includes("Invite children to sort by size."), "tips persisted");
    assert(savedItem?.settingTags?.includes("small_group"), "setting tags persisted");
    assert(String(savedItem?.indoorAlternatives || "").includes("tabletop"), "indoor alternatives persisted");
    assert(String(savedItem?.outdoorAlternatives || "").includes("grass"), "outdoor alternatives persisted");
    assert(String(savedItem?.cleanupTips || "").includes("basket"), "cleanup tips persisted");
    assert(saved.teachingKit?.teacherToolkit?.prepChecklist?.includes("Print animal cards"), "toolkit checklist persisted");
    assert(saved.teachingKit?.teacherToolkit?.teacherPreparation, "teacher preparation persisted");
    assert(!saved.enrichmentDraft, "no enrichment draft created by authoring save");

    const activity = (res.json.curriculum.activities || []).find((a) => a.id === DISCOVERY_ID || a.itemId === DISCOVERY_ID);
    assert(activity?.teacherTips?.length, "activity sync kept tips");
    assert(activity?.indoorAlternatives, "activity sync kept indoor alternatives");

    // AI assist works with authoring flag (enrichment editor still false)
    const ai = await requestJson("POST", "/api/admin/curriculum/enrichment-ai-suggest", {
      adminToken,
      planId: plan.id,
      activityKey: DISCOVERY_ID,
      scope: "activity",
      simulate: "fixture",
    }, auth);
    assert(ai.status === 200 && Array.isArray(ai.json.suggestions), "AI suggest via authoring flag");
    assert(ai.json.autoSaved !== true && ai.json.autoPublished !== true, "AI does not auto-save/publish");
    assert(ai.json.curriculumUnchanged === true, "AI leaves curriculum unchanged");

    // Existing core fields still present (not replaced)
    assert(String(saved.title || "").length > 0, "title preserved");
    assert(String(saved.weeklyOverview || "").includes("Binder authoring"), "overview enriched additively");

    // Browser UI screenshots with authoring flag on
    const { chromium } = require("playwright");
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(
      () => typeof window.LLHTeachingKitAuthoring !== "undefined"
        && typeof window.LLHTeachingKit !== "undefined",
      null,
      { timeout: 30000 },
    );

    const ui = await page.evaluate((payload) => {
      window.effectiveSiteContent = () => ({
        featureFlags: {
          teachingKitAuthoring: true,
          teachingKitEnrichmentEditor: false,
          teachingKitViewer: true,
        },
      });
      window.curriculumLessonPlanById = (id) => (id === payload.plan.id ? payload.plan : null);
      window.curriculumActivitiesForLesson = (id) => (id === payload.plan.id ? payload.activities : []);
      window.adminCurriculumLessonEditorId = payload.plan.id;
      window.adminCurriculumLessonSaving = false;
      window.adminCurriculumSelectedIds = new Set();
      const host = document.createElement("div");
      host.id = "adminCurriculumLessonPlanManager";
      document.body.appendChild(host);
      // Render form HTML via existing function if available
      if (typeof renderAdminCurriculumLessonPlanForm === "function") {
        host.innerHTML = renderAdminCurriculumLessonPlanForm(payload.plan);
      } else {
        host.innerHTML = window.LLHTeachingKitAuthoring.binderPanelHtml(payload.plan, payload.activities)
          + window.LLHTeachingKitAuthoring.activityBinderFieldsHtml(payload.plan.dailyPlans.monday.items[0] || {});
      }
      return {
        hasBinder: !!document.querySelector("[data-tk-authoring-panel]"),
        hasToolkit: !!document.querySelector("[data-tk-authoring-toolkit]"),
        hasChecklist: !!document.querySelector("[data-tk-authoring-checklist]"),
        hasActivityBinder: !!document.querySelector("[data-tk-activity-binder]"),
        hasAi: !!document.querySelector("[data-tk-authoring-ai-activity]"),
        enrichFlagOff: window.effectiveSiteContent().featureFlags.teachingKitEnrichmentEditor === false,
        authoringOn: window.LLHTeachingKit.isTeachingKitAuthoringEnabled(window.effectiveSiteContent().featureFlags),
      };
    }, {
      plan: saved,
      activities: res.json.curriculum.activities.filter((a) => a.lessonPlanId === saved.id),
    });
    assert(ui.hasBinder && ui.hasToolkit && ui.hasChecklist, "binder panel/toolkit/checklist rendered");
    assert(ui.hasActivityBinder && ui.hasAi, "activity binder fields + AI control");
    assert(ui.enrichFlagOff && ui.authoringOn, "enrichment editor off; authoring on");

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "tk-authoring-desktop-binder.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 834, height: 1100 });
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "tk-authoring-tablet-binder.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "tk-authoring-mobile-binder.png"),
      fullPage: true,
    });

    // Flag-off hides UI
    const hidden = await page.evaluate(() => {
      window.effectiveSiteContent = () => ({
        featureFlags: { teachingKitAuthoring: false, teachingKitEnrichmentEditor: false },
      });
      const host = document.querySelector("#adminCurriculumLessonPlanManager");
      if (typeof renderAdminCurriculumLessonPlanForm === "function") {
        host.innerHTML = renderAdminCurriculumLessonPlanForm(window.curriculumLessonPlanById(window.adminCurriculumLessonEditorId));
      }
      return {
        binder: !!document.querySelector("[data-tk-authoring-panel]"),
        activityBinder: !!document.querySelector("[data-tk-activity-binder]"),
      };
    });
    assert(hidden.binder === false && hidden.activityBinder === false, "authoring UI hidden when flag off");

    const report = {
      title: "Complete Teaching Kit System — authoring readiness",
      passed,
      flags: {
        teachingKitAuthoring: true,
        teachingKitEnrichmentEditor: false,
      },
      screenshots: [
        "tk-authoring-desktop-binder.png",
        "tk-authoring-tablet-binder.png",
        "tk-authoring-mobile-binder.png",
      ],
      finishedAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(ARTIFACT_DIR, "tk-authoring-report.json"), JSON.stringify(report, null, 2));
    console.log(`OK teaching-kit-authoring (${passed} assertions)`);
    console.log(`Artifacts: ${ARTIFACT_DIR}`);
  } catch (error) {
    console.error("FAIL teaching-kit-authoring:", error.message);
    if (stderr) console.error(stderr.slice(-2000));
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    child.kill("SIGTERM");
    try { fs.rmSync(STORE_PATH, { force: true }); } catch { /* ignore */ }
  }
}

main();
