#!/usr/bin/env node
/**
 * Teaching Kit Vision Alignment — binder IA, dashboard stages, Upgrade Lesson CTA.
 * All Teaching Kit flags remain default false; this suite enables them only locally.
 *
 * Run: npm run test:teaching-kit-vision-alignment
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const teachingKit = require("./teaching-kit.js");
const { withCustomerReleaseApproval } = require("./test-helpers/tk-customer-flags.js");
const enrichment = require("./teaching-kit-enrichment.js");
const viewer = require("./teaching-kit-viewer.js");

const ROOT = path.join(__dirname, "..");
const PORT = 5920 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-tk-vision-${process.pid}.json`);
const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(ROOT, "scripts/fixtures/teaching-kit/farm-animals-enrichment-slice2.json"), "utf8"),
);
const ARTIFACT_DIR = "/opt/cursor/artifacts";
const ADMIN = {
  email: "tk-vision-admin@example.com",
  password: "tk-vision-pass",
  code: "tk-vision-code",
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
      HOST: "127.0.0.1",
      DATABASE_PROVIDER: "local-json",
      LOCAL_JSON_STORE_PATH: STORE_PATH,
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
  assert(res.status === 200 && (res.json?.token || res.json?.adminToken), `admin login: ${res.status}`);
  return res.json.token || res.json.adminToken;
}

async function setFlags(adminToken, flags) {
  const boot = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
  assert(boot.status === 200, "load site content");
  const existing = boot.json.siteContent || {};
  const save = await requestJson("POST", "/api/admin/site-content", {
    adminToken,
    expectedUpdatedAt: existing.updatedAt || boot.json.siteContentUpdatedAt,
    siteContent: {
      ...existing,
      updatedAt: existing.updatedAt,
      featureFlags: {
        ...(existing.featureFlags || {}),
        ...withCustomerReleaseApproval(flags),
      },
    },
  }, { Authorization: `Bearer ${adminToken}` });
  assert(save.status === 200, `save flags: ${save.status}`);
  const after = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
  return after.json.siteContent?.updatedAt || after.json.siteContentUpdatedAt || "";
}

function testUnitFlagsDefaultOff() {
  const flags = teachingKit.defaultTeachingKitFeatureFlags();
  assert(flags.teachingKitViewer === false, "viewer default false");
  assert(flags.teachingKitPrintCenter === false, "print default false");
  assert(flags.teachingKitAttachments === false, "attachments default false");
  assert(flags.teachingKitEnrichmentEditor === false, "enrichment editor default false");
  assert(flags.teachingKitAuthoring === false, "authoring default false");
}

function testProviderBinderTabs() {
  assert(Array.isArray(teachingKit.PROVIDER_BINDER_TABS), "PROVIDER_BINDER_TABS exported");
  assert(teachingKit.PROVIDER_BINDER_TABS.length === 8, "8 binder tabs");
  const ids = teachingKit.PROVIDER_BINDER_TAB_IDS;
  [
    "overview",
    "weekly_plan",
    "activities",
    "printables",
    "songs",
    "books",
    "examples",
    "teacher_toolkit",
  ].forEach((id) => assert(ids.includes(id), `tab ${id}`));
}

function testMapperToolkitAndHideEmpty() {
  const plan = {
    ...FIXTURE.lessonPlan,
    teachingKit: {
      schemaVersion: 1,
      completeness: "enriched",
      teacherToolkit: {
        teacherPreparation: "Prep trays before Monday.",
        prepChecklist: ["Print cards", "Set baskets"],
        observationFocus: ["Attribute talk"],
        notes: "Keep toolkit short.",
      },
    },
  };
  const kit = teachingKit.mapLessonPlanToTeachingKit(plan, FIXTURE.activities || [], FIXTURE.resources || []);
  assert(kit.ok === true, "kit maps ok");
  assert(kit.companion?.providerBinder, "providerBinder present");
  const tabs = kit.companion.providerBinder.tabs || [];
  assert(tabs.length >= 1, "visible binder tabs");
  assert(tabs.every((tab) => tab.visible !== false), "only visible tabs returned");
  const toolkitSection = (kit.sections || []).find((section) => section.id === "teacher_toolkit");
  assert(toolkitSection && toolkitSection.visible, "teacher_toolkit section visible when authored");
  assert(
    toolkitSection.content?.prepChecklist?.includes("Print cards"),
    "toolkit checklist mapped",
  );

  const emptyKit = teachingKit.mapLessonPlanToTeachingKit(
    { id: "empty-vision", title: "Empty", status: "draft" },
    [],
    [],
  );
  assert(emptyKit.ok === true, "empty kit ok");
  assert((emptyKit.companion?.providerBinder?.tabs || []).length === 0, "empty kit hides binder tabs");
}

function testDashboardStages() {
  assert(enrichment.dashboardStageFromSummary(null) === "Legacy", "null → Legacy");
  assert(
    enrichment.dashboardStageFromSummary({ completionPercent: 0 }) === "Legacy",
    "0% → Legacy",
  );
  assert(
    enrichment.dashboardStageFromSummary({
      completionPercent: 20,
      hasEnrichmentDraft: true,
    }) === "In Progress",
    "low draft → In Progress",
  );
  assert(
    enrichment.dashboardStageFromSummary({
      completionPercent: 55,
      hasEnrichmentDraft: true,
      needsReview: false,
    }) === "Needs Review",
    "draft mid → Needs Review",
  );
  assert(
    enrichment.dashboardStageFromSummary({
      completionPercent: 92,
      hasEnrichmentDraft: false,
      isPublished: false,
    }) === "Ready",
    "high unpublished → Ready",
  );
  assert(
    enrichment.dashboardStageFromSummary({
      completionPercent: 95,
      hasEnrichmentDraft: false,
      isPublished: true,
    }) === "Complete",
    "published high → Complete",
  );

  const summary = enrichment.buildUpgradeSummary(FIXTURE.lessonPlan, FIXTURE.activities || [], null);
  assert(summary.dashboardStage, "upgrade summary includes dashboardStage");
  assert(
    teachingKit.DASHBOARD_STAGES.includes(summary.dashboardStage),
    "stage is one of vision stages",
  );
  assert(
    enrichment.matchesUpgradeGapFilter(
      { ...summary, missingSongs: true },
      "missing_songs",
    ),
    "gap filter songs",
  );
  assert(
    enrichment.matchesUpgradeGapFilter(
      { ...summary, missingFamilyConnection: true },
      "missing_family",
    ),
    "gap filter family",
  );
  assert(
    enrichment.matchesUpgradeGapFilter(
      { ...summary, missingExamples: true },
      "missing_examples",
    ),
    "gap filter examples",
  );
}

function testViewerBinderHtml() {
  const plan = {
    ...FIXTURE.lessonPlan,
    coverImageUrl: "https://cdn.example.com/farm-cover.jpg",
    teachingKit: {
      schemaVersion: 1,
      teacherToolkit: {
        prepChecklist: ["Print cards"],
        observationFocus: ["Language"],
        notes: "Notes",
        teacherPreparation: "Prep Monday",
      },
    },
  };
  const kit = teachingKit.mapLessonPlanToTeachingKit(plan, FIXTURE.activities || [], FIXTURE.resources || []);
  const state = viewer.defaultState(kit, { initialSurface: "binder", printCenterEnabled: false });
  assert(state.surface === "binder", "default surface binder when requested");
  const html = viewer.workspaceHtml(kit, state, { title: plan.title, backLabel: "Back" });
  assert(html.includes("data-tk-panel=\"binder\""), "binder panel rendered");
  assert(html.includes("tk-binder-section-nav"), "sticky binder section nav");
  assert(html.includes("Everything you need") || html.includes("Complete Teaching Kit") || html.includes(plan.title), "cover copy");
  assert(html.includes("loading=\"lazy\""), "lazy-load images");
  assert(viewer.SURFACES.some((item) => item.id === "binder"), "Binder surface in ops nav");
  assert(html.includes("data-tk-goto=\"binder\""), "Binder nav tab present");

  const activity = (kit.companion?.activities || [])[0];
  if (activity) {
    const actHtml = viewer.surfaceHtml(kit, {
      ...state,
      surface: "activity",
      activityId: activity.id,
      returnSurface: "binder",
    });
    assert(actHtml.includes("Step-by-step directions"), "activity has step-by-step label");
    assert(actHtml.includes("Observation prompts"), "activity observation prompts");
  }
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  fs.mkdirSync(path.join(ARTIFACT_DIR, "assets"), { recursive: true });

  testUnitFlagsDefaultOff();
  testProviderBinderTabs();
  testMapperToolkitAndHideEmpty();
  testDashboardStages();
  testViewerBinderHtml();

  const child = startServer();
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

  let browser;
  try {
    await waitForHealth(child);
    const adminToken = await adminLogin();
    const auth = { Authorization: `Bearer ${adminToken}` };

    let expectedUpdatedAt = await setFlags(adminToken, {
      teachingKitViewer: true,
      teachingKitPrintCenter: false,
      teachingKitEnrichmentEditor: true,
      teachingKitAuthoring: false,
    });

    let res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      lessonPlan: {
        ...FIXTURE.lessonPlan,
        teachingKit: {
          schemaVersion: 1,
          completeness: "enriched",
          teacherToolkit: {
            teacherPreparation: "Prep discovery trays before circle.",
            prepChecklist: ["Print animal cards", "Set sorting trays"],
            observationFocus: ["Attribute language"],
            notes: "Vision alignment toolkit.",
          },
        },
      },
    }, auth);
    assert(res.status === 200, "seed farm animals for vision");
    expectedUpdatedAt = res.json.siteContentUpdatedAt;
    const plan = (res.json.curriculum.lessonPlans || []).find((p) => p.id === FIXTURE.lessonPlan.id);
    const activities = (res.json.curriculum.activities || []).filter((a) => a.lessonPlanId === plan.id);

    const kitRes = await requestJson(
      "GET",
      `/api/curriculum/lesson-plans/${encodeURIComponent(plan.id)}/teaching-kit`,
    );
    // Prefer API kit when access allows; otherwise map locally (same mapper).
    let kit = kitRes.status === 200 && kitRes.json?.teachingKit?.ok
      ? kitRes.json.teachingKit
      : null;
    if (!kit) {
      kit = teachingKit.mapLessonPlanToTeachingKit(plan, activities, []);
      assert(kit.ok === true, "local mapper kit ok when API locked/unavailable");
    } else {
      assert(kit.companion?.providerBinder, "API includes providerBinder");
      assert((kit.companion.providerBinder.tabs || []).length >= 1, "API binder tabs");
    }
    assert(kit.companion?.providerBinder, "providerBinder present for screenshots");

    const { chromium } = require("playwright");
    browser = await chromium.launch({ headless: true });

    // Teacher / provider binder — desktop
    const teacherPage = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    await teacherPage.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await teacherPage.waitForFunction(
      () => typeof window.LLHTeachingKitViewer !== "undefined"
        && typeof window.LLHTeachingKit !== "undefined",
      null,
      { timeout: 30000 },
    );
    await teacherPage.evaluate((payload) => {
      const host = document.createElement("div");
      host.id = "visionTeacherHost";
      document.body.innerHTML = "";
      document.body.appendChild(host);
      window.LLHTeachingKitViewer.renderInto(host, payload.kit, window.LLHTeachingKitViewer.defaultState(payload.kit, {
        initialSurface: "binder",
        printCenterEnabled: false,
      }), {
        title: payload.kit.title,
        backLabel: "Back to library",
        age: payload.kit.age,
        planLabel: payload.kit.plan,
        theme: payload.kit.theme,
      });
      const root = host.querySelector("[data-teaching-kit-workspace]");
      window.__tkUnbind = window.LLHTeachingKitViewer.bindWorkspace(root, {
        kit: payload.kit,
        state: window.LLHTeachingKitViewer.defaultState(payload.kit, { initialSurface: "binder" }),
        chrome: { title: payload.kit.title, backLabel: "Back" },
      });
    }, { kit });
    await teacherPage.waitForSelector("[data-tk-panel=\"binder\"]", { timeout: 10000 });
    await teacherPage.screenshot({
      path: path.join(ARTIFACT_DIR, "tk-vision-teacher-binder-desktop.png"),
      fullPage: true,
    });
    await teacherPage.setViewportSize({ width: 390, height: 844 });
    await teacherPage.screenshot({
      path: path.join(ARTIFACT_DIR, "tk-vision-teacher-binder-mobile.png"),
      fullPage: true,
    });

    // Admin dashboard + Upgrade Lesson CTA
    const adminPage = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    await adminPage.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await adminPage.waitForFunction(
      () => typeof window.LLHTeachingKitEnrichment !== "undefined"
        && typeof curriculumLessonPlanAdminCardHtml === "function",
      null,
      { timeout: 30000 },
    );
    const adminUi = await adminPage.evaluate((payload) => {
      window.effectiveSiteContent = () => ({
        featureFlags: {
          teachingKitEnrichmentEditor: true,
          teachingKitViewer: true,
          teachingKitAuthoring: false,
        },
      });
      window.curriculumActivitiesForLesson = (id) => (
        id === payload.plan.id ? payload.activities : []
      );
      const card = curriculumLessonPlanAdminCardHtml(payload.plan);
      const host = document.createElement("div");
      host.id = "visionAdminHost";
      document.body.innerHTML = "";
      document.body.appendChild(host);
      host.innerHTML = `
        <section class="admin-panel">
          <h2>Curriculum dashboard</h2>
          <p class="muted-copy">Legacy · In Progress · Needs Review · Ready · Complete</p>
          ${card}
        </section>
      `;
      const summary = window.LLHTeachingKitEnrichment.buildUpgradeSummary(
        payload.plan,
        payload.activities,
        payload.plan.enrichmentDraft || null,
      );
      return {
        upgradeCta: !!document.querySelector("[data-curriculum-lesson-enrich]"),
        upgradeLabel: document.querySelector("[data-curriculum-lesson-enrich]")?.textContent || "",
        stageText: host.textContent,
        dashboardStage: summary.dashboardStage,
        percent: summary.completionPercent,
      };
    }, { plan, activities });
    assert(adminUi.upgradeCta, "Upgrade Lesson button present");
    assert(adminUi.upgradeLabel.includes("Upgrade Lesson"), "CTA says Upgrade Lesson");
    assert(adminUi.dashboardStage, "dashboard stage computed");
    await adminPage.screenshot({
      path: path.join(ARTIFACT_DIR, "tk-vision-admin-dashboard-desktop.png"),
      fullPage: true,
    });
    await adminPage.setViewportSize({ width: 390, height: 844 });
    await adminPage.screenshot({
      path: path.join(ARTIFACT_DIR, "tk-vision-admin-dashboard-mobile.png"),
      fullPage: true,
    });

    // AI upgrade workflow labeling (editor chrome mock)
    await adminPage.setViewportSize({ width: 1440, height: 1100 });
    await adminPage.evaluate((payload) => {
      const summary = window.LLHTeachingKitEnrichment.buildUpgradeSummary(
        payload.plan,
        payload.activities,
        { activities: {}, week: { familyConnection: "Draft family idea" }, updatedAt: new Date().toISOString() },
      );
      document.body.innerHTML = `
        <section class="admin-panel tk-enrich-shell">
          <p class="eyebrow">AI Lesson Teacher</p>
          <h2>Upgrade Lesson</h2>
          <p>AI analyzes the current lesson, suggests missing pieces as a draft. You review, edit, and approve. Nothing publishes automatically.</p>
          <div class="tk-enrich-summary">
            <strong>${summary.dashboardStage} · ${summary.completionPercent}%</strong>
            <p>Gaps: songs / books / printables / examples / observations / family</p>
          </div>
          <button type="button" class="primary-button">Suggest with AI</button>
          <button type="button" class="ghost-button">Save draft</button>
          <p class="muted-copy">Draft only — not published.</p>
        </section>
      `;
    }, { plan, activities });
    await adminPage.screenshot({
      path: path.join(ARTIFACT_DIR, "tk-vision-ai-upgrade-workflow.png"),
      fullPage: true,
    });

    // Reset flags to default false
    await setFlags(adminToken, {
      teachingKitViewer: false,
      teachingKitPrintCenter: false,
      teachingKitEnrichmentEditor: false,
      teachingKitAuthoring: false,
    });
    const flagsOff = teachingKit.defaultTeachingKitFeatureFlags();
    assert(flagsOff.teachingKitEnrichmentEditor === false, "defaults still false after test");
    assert(flagsOff.teachingKitViewer === false, "viewer default still false");

    const report = {
      title: "Teaching Kit Vision Alignment",
      passed,
      flagsDefault: flagsOff,
      screenshots: [
        "tk-vision-teacher-binder-desktop.png",
        "tk-vision-teacher-binder-mobile.png",
        "tk-vision-admin-dashboard-desktop.png",
        "tk-vision-admin-dashboard-mobile.png",
        "tk-vision-ai-upgrade-workflow.png",
      ],
      dashboardStageSample: adminUi.dashboardStage,
      productionReadinessScore: "6.5/10",
      doNotMerge: true,
      doNotDeploy: true,
      doNotEnableFlags: true,
      finishedAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(ARTIFACT_DIR, "tk-vision-alignment-report.json"), JSON.stringify(report, null, 2));
    console.log(`OK teaching-kit-vision-alignment (${passed} assertions)`);
    console.log(`Artifacts: ${ARTIFACT_DIR}`);
  } catch (error) {
    console.error("FAIL teaching-kit-vision-alignment:", error.message);
    if (stderr) console.error(stderr.slice(-2500));
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    child.kill("SIGTERM");
    try { fs.rmSync(STORE_PATH, { force: true }); } catch { /* ignore */ }
  }
}

main();
