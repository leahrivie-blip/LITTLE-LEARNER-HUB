#!/usr/bin/env node
/**
 * Teaching Kit — Curriculum Production
 * Upgrade highest-traffic lessons one at a time (draft-only).
 * Flags remain default false; Enrichment Editor enabled only inside this suite.
 *
 * Run: npm run test:teaching-kit-curriculum-production
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const teachingKit = require("./teaching-kit.js");
const { withCustomerReleaseApproval } = require("./test-helpers/tk-customer-flags.js");
const reusable = require("./teaching-kit-reusable-library.js");
const production = require("./teaching-kit-curriculum-production.js");

const ROOT = path.join(__dirname, "..");
const PORT = 6530 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-tk-curriculum-production-${process.pid}.json`);
const ARTIFACT_DIR = "/opt/cursor/artifacts";
const ADMIN = {
  email: "tk-curriculum-production-admin@example.com",
  password: "tk-curriculum-production-pass",
  code: "tk-curriculum-production-code",
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
          try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
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
      } catch { /* retry */ }
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
      LLH_STORE_PATH: STORE_PATH,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      LLH_ENRICHMENT_AI_FIXTURE: "1",
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

function seedReusableLibrary() {
  let library = { items: [] };
  const seeds = [
    {
      type: "vocabulary",
      title: "Farm Animals Core Vocab",
      body: "cow · pig · chicken · horse · barn · tractor",
      theme: "Farm Animals",
      tags: ["farm", "animals", "vocabulary"],
    },
    {
      type: "printable",
      title: "Farm Animal Matching Cards",
      body: "Printable matching cards for farm animal names and pictures.",
      theme: "Farm Animals",
      tags: ["farm", "printable"],
    },
    {
      type: "vocabulary",
      title: "All About Me Feeling Words",
      body: "happy · proud · kind · family · friend · me",
      theme: "All About Me",
      tags: ["identity", "vocabulary"],
    },
    {
      type: "printable",
      title: "Color Sorting Mats",
      body: "Reusable color mats for sorting classroom materials.",
      theme: "Colors",
      tags: ["colors", "printable"],
    },
    {
      type: "poster",
      title: "Community Helpers Poster",
      body: "Classroom poster naming helpers children meet every week.",
      theme: "Community Helpers",
      tags: ["community", "poster"],
    },
    {
      type: "family_connection",
      title: "Weather Walk Prompt",
      body: "Ask your child what the sky looks like today and name one weather word.",
      theme: "Weather",
      tags: ["weather", "family"],
    },
  ];
  seeds.forEach((item) => {
    library = reusable.saveReusableItem(library, item).library;
  });
  return library;
}

function seedAnalyticsEvents(plans) {
  const viewsByPriority = [120, 95, 80, 70, 60];
  const events = [];
  plans.forEach((plan, index) => {
    const views = viewsByPriority[index] || 10;
    for (let i = 0; i < views; i += 1) {
      events.push({
        name: "lesson_plan_view",
        detail: { lessonPlanId: plan.id, lessonId: plan.id },
      });
    }
    for (let i = 0; i < Math.max(3, Math.floor(views / 10)); i += 1) {
      events.push({
        name: "lesson_assign",
        detail: { lessonPlanId: plan.id },
      });
    }
  });
  return events;
}

function testOfflineQueueAndFlags() {
  assert(production.defaultFlagsStillOff(), "all Teaching Kit flags default false");
  const defaults = teachingKit.defaultTeachingKitFeatureFlags();
  [
    "teachingKitViewer",
    "teachingKitPrintCenter",
    "teachingKitAttachments",
    "teachingKitEnrichmentEditor",
    "teachingKitAuthoring",
    "teachingKitCurriculumDirector",
    "teachingKitQualityReview",
  ].forEach((key) => {
    assert(defaults[key] === false, `${key} default false`);
  });

  const plans = production.loadPriorityLessonPlans(5);
  assert(plans.length === 5, "loaded 5 priority lessons");
  assert(plans[0].id === "cur-lp-preschool-farm-animals", "Farm Animals first in owner priority");
  assert(plans.every((p) => !p.enrichmentDraft), "legacy start — no enrichment draft");

  const events = seedAnalyticsEvents(plans);
  const usage = production.usageFromEvents(events);
  assert(usage[plans[0].id].views === 120, "analytics views for Farm Animals");
  const queueMeta = production.buildProductionQueue(
    { lessonPlans: plans, activities: [], resources: [] },
    usage,
  );
  assert(queueMeta.queue[0].id === plans[0].id, "highest traffic first");
  assert(queueMeta.queue[0].views >= queueMeta.queue[1].views, "queue sorted by views");
}

function renderProgressHtml(report) {
  const rows = (report.lessonsUpgraded || []).map((row) => `
    <tr>
      <td>${row.title}</td>
      <td>${(row.stagesTraversed || []).join(" → ")}</td>
      <td>${row.finalStage}</td>
      <td>${row.completionBefore}% → ${row.completionAfter}%</td>
      <td>${row.qualityScore} (${row.qualityLabel})</td>
      <td>${row.resourcesReused}</td>
      <td>${row.newResourcesCreated}</td>
      <td>${row.autoPublished ? "YES" : "no"}</td>
    </tr>`).join("");
  const reused = (report.resourcesReused || []).slice(0, 12).map((r) => `
    <li><strong>${r.kind}</strong> — ${r.title}</li>`).join("");
  const remaining = (report.remainingLessons || []).slice(0, 12).map((r) => `
    <li>${r.title} <span style="opacity:.7">(${r.reason})</span></li>`).join("")
    || "<li>None in remaining priority queue</li>";
  const pct = report.estimatedCompletionProgress?.percentOfPriorityQueue ?? 0;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Curriculum Production Progress</title>
  <style>
    :root {
      --ink: #1c2a22;
      --moss: #2f5d46;
      --sand: #e7efe8;
      --sun: #f3d9a4;
    }
    body {
      margin: 0;
      font-family: "Iowan Old Style", "Palatino Linotype", Palatino, serif;
      color: var(--ink);
      background:
        radial-gradient(1200px 600px at 10% -10%, #fff7e8 0%, transparent 55%),
        linear-gradient(160deg, #f7fbf7 0%, #e8f1ea 45%, #f4efe6 100%);
      min-height: 100vh;
      padding: 32px 40px 64px;
    }
    h1 { font-size: 2.4rem; margin: 0 0 0.25rem; letter-spacing: -0.02em; color: var(--moss); }
    .sub { margin: 0 0 1.5rem; max-width: 42rem; line-height: 1.45; }
    .banner {
      display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.5rem;
    }
    .kpi {
      background: rgba(255,255,255,0.72);
      border: 1px solid rgba(47,93,70,0.18);
      padding: 0.85rem 1.1rem;
      min-width: 140px;
    }
    .kpi b { display: block; font-size: 1.6rem; color: var(--moss); }
    .bar {
      height: 14px; background: rgba(47,93,70,0.12); border-radius: 999px; overflow: hidden;
      margin: 0.5rem 0 1.75rem; max-width: 480px;
    }
    .bar > i {
      display: block; height: 100%; width: ${pct}%;
      background: linear-gradient(90deg, var(--moss), #4d8a68);
    }
    table { width: 100%; border-collapse: collapse; background: rgba(255,255,255,0.7); }
    th, td { text-align: left; padding: 0.55rem 0.65rem; border-bottom: 1px solid rgba(28,42,34,0.1); font-size: 0.92rem; }
    th { font-family: "Segoe UI", sans-serif; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: #4a5c52; }
    .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-top: 1.5rem; }
    .panel { background: rgba(255,255,255,0.65); border: 1px solid rgba(47,93,70,0.14); padding: 1rem 1.15rem; }
    .warn { margin-top: 1.5rem; padding: 0.75rem 1rem; background: var(--sun); color: #3a2a10; font-family: "Segoe UI", sans-serif; font-size: 0.9rem; }
    ul { margin: 0.4rem 0 0; padding-left: 1.1rem; }
  </style>
</head>
<body>
  <h1>Little Learner Hub</h1>
  <p class="sub">Curriculum Production — highest-traffic lessons upgraded with the Teaching Kit workflow. Draft-only. Flags remain disabled.</p>
  <div class="banner">
    <div class="kpi"><span>Upgraded</span><b>${report.estimatedCompletionProgress?.upgradedCount ?? 0}</b></div>
    <div class="kpi"><span>Priority progress</span><b>${pct}%</b></div>
    <div class="kpi"><span>Resources reused</span><b>${(report.resourcesReused || []).length}</b></div>
    <div class="kpi"><span>New resources</span><b>${(report.newResourcesCreated || []).length}</b></div>
  </div>
  <div class="bar" aria-label="Priority queue progress"><i></i></div>
  <table>
    <thead>
      <tr>
        <th>Lesson</th><th>Stages</th><th>Final</th><th>Completion</th>
        <th>Quality</th><th>Reused</th><th>New</th><th>Published</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="cols">
    <div class="panel">
      <h2>Resources reused</h2>
      <ul>${reused || "<li>None recorded</li>"}</ul>
    </div>
    <div class="panel">
      <h2>Remaining lessons</h2>
      <ul>${remaining}</ul>
    </div>
  </div>
  <div class="warn">Do not merge · Do not deploy · Keep feature flags disabled · Never auto-publish</div>
</body>
</html>`;
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  testOfflineQueueAndFlags();

  const child = startServer();
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  let browser;
  try {
    await waitForHealth(child);
    const adminToken = await adminLogin();
    const auth = { Authorization: `Bearer ${adminToken}` };

    let expectedUpdatedAt = await setFlags(adminToken, {
      teachingKitEnrichmentEditor: true,
      teachingKitViewer: false,
      teachingKitPrintCenter: false,
      teachingKitAttachments: false,
      teachingKitAuthoring: false,
      teachingKitCurriculumDirector: false,
      teachingKitQualityReview: false,
    });

    const priorityPlans = production.loadPriorityLessonPlans(5);
    const reusableLibrary = seedReusableLibrary();
    const analyticsEvents = seedAnalyticsEvents(priorityPlans);
    const usage = production.usageFromEvents(analyticsEvents);

    // Seed remaining free catalog stubs so "remaining lessons" is meaningful
    const preschool = require("./curriculum-preschool-import-targets.js");
    const extraTargets = preschool.PRESCHOOL_FREE_IMPORT_TARGETS
      .filter((t) => !production.PRIORITY_LESSON_IDS.includes(t.stableId))
      .slice(0, 3);
    const extraPlans = extraTargets.map((t) => ({
      ...preschool.readPreschoolImportTarget(t),
      enrichmentDraft: null,
    }));

    const curriculumSeed = {
      lessonPlans: [...priorityPlans, ...extraPlans],
      activities: [],
      resources: [
        {
          id: "res-farm-vocab-poster",
          title: "Farm Vocabulary Poster",
          type: "printable",
          themes: ["Farm Animals"],
        },
        {
          id: "res-color-wheel",
          title: "Color Wheel Poster",
          type: "poster",
          themes: ["Colors"],
        },
      ],
    };

    for (const plan of curriculumSeed.lessonPlans) {
      const res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
        adminToken,
        expectedUpdatedAt,
        lessonPlan: plan,
      }, auth);
      assert(res.status === 200, `seed ${plan.id}: ${res.status}`);
      expectedUpdatedAt = res.json.siteContentUpdatedAt || expectedUpdatedAt;
    }

    const queueMeta = production.buildProductionQueue(curriculumSeed, usage);
    assert(queueMeta.queue[0].id === "cur-lp-preschool-farm-animals", "production starts with Farm Animals");

    const upgradeResults = [];
    const queueIds = production.PRIORITY_LESSON_IDS.slice();
    for (const planId of queueIds) {
      const plan = priorityPlans.find((p) => p.id === planId);
      assert(plan, `priority plan present ${planId}`);

      const legacyOverview = plan.weeklyOverview;
      const result = production.upgradeOneLesson(plan, {
        curriculum: curriculumSeed,
        assistantState: { reusableLibrary },
        directorState: { masterResources: [] },
        dryRun: false,
        activityBatchSize: 5,
      });

      assert(result.autoPublished === false, `${planId} never auto-published`);
      assert(
        result.stagesTraversed.join(",") === "Legacy,In Progress,Needs Review,Complete"
        || (
          result.stagesTraversed.includes(production.STAGES.LEGACY)
          && result.stagesTraversed.includes(production.STAGES.IN_PROGRESS)
          && result.stagesTraversed.includes(production.STAGES.NEEDS_REVIEW)
        ),
        `${planId} stages not skipped: ${result.stagesTraversed.join("→")}`,
      );
      assert(
        result.stagesTraversed.indexOf(production.STAGES.LEGACY)
          < result.stagesTraversed.indexOf(production.STAGES.IN_PROGRESS),
        `${planId} Legacy before In Progress`,
      );
      assert(
        result.stagesTraversed.indexOf(production.STAGES.IN_PROGRESS)
          < result.stagesTraversed.indexOf(production.STAGES.NEEDS_REVIEW),
        `${planId} In Progress before Needs Review`,
      );

      const coverage = production.kitSectionCoverage(plan, result.enrichmentDraft);
      Object.entries(coverage).forEach(([key, value]) => {
        if (key === "draftOwned") {
          Object.entries(value).forEach(([dk, dv]) => {
            assert(dv, `${planId} draft owns ${dk}`);
          });
          return;
        }
        assert(value, `${planId} kit section ${key}`);
      });

      const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
        adminToken,
        expectedUpdatedAt,
        saveMode: "enrichment_draft",
        lessonPlan: {
          id: plan.id,
          enrichmentDraft: result.enrichmentDraft,
        },
      }, auth);
      assert(save.status === 200, `draft save ${planId}: ${save.status}`);
      expectedUpdatedAt = save.json.siteContentUpdatedAt || expectedUpdatedAt;
      const saved = (save.json.curriculum.lessonPlans || []).find((p) => p.id === plan.id);
      assert(saved?.enrichmentDraft?.week, `${planId} draft persisted`);
      assert(String(saved.weeklyOverview || "") === String(legacyOverview || ""), `${planId} legacy overview preserved`);
      assert(saved.status === "published", `${planId} published status unchanged (draft-only)`);
      assert(result.autoPublished === false, "runner never publishes");
      // Intentionally never call saveMode: "publish_enrichment" in Curriculum Production.

      upgradeResults.push(result);
      // One lesson at a time — next iteration only after this save completes
    }

    assert(upgradeResults.length === 5, "upgraded all 5 priority lessons");

    const report = production.summarizeProductionRun(upgradeResults, queueMeta);
    assert(report.guarantees.autoPublished === false, "report: no auto publish");
    assert(report.guarantees.flagsDefaultFalse === true, "report: flags default false");
    assert(report.estimatedCompletionProgress.percentOfPriorityQueue === 100, "priority queue 100%");
    assert(report.lessonsUpgraded.length === 5, "five lessons in report");
    assert(report.resourcesReused.length >= 1, "reuse tracked");
    assert(report.doNotMerge && report.doNotDeploy && report.doNotEnableFlags, "hold banners");

    // Remaining = non-priority seeded plans still Legacy
    assert(
      report.remainingLessons.some((r) => r.planId.startsWith("cur-lp-preschool-")),
      "remaining catalog lessons listed",
    );

    fs.writeFileSync(
      path.join(ARTIFACT_DIR, "tk-curriculum-production-report.json"),
      JSON.stringify(report, null, 2),
    );
    fs.writeFileSync(
      path.join(ARTIFACT_DIR, "tk-curriculum-production-upgrade-details.json"),
      JSON.stringify(
        upgradeResults.map((r) => ({
          planId: r.planId,
          title: r.title,
          stagesTraversed: r.stagesTraversed,
          finalStage: r.finalStage,
          before: r.before,
          after: r.after,
          resourcesReused: r.resourcesReused,
          newResourcesCreated: r.newResourcesCreated,
          kitCoverage: production.kitSectionCoverage(
            priorityPlans.find((p) => p.id === r.planId),
            r.enrichmentDraft,
          ),
          autoPublished: r.autoPublished,
        })),
        null,
        2,
      ),
    );

    const progressHtml = renderProgressHtml(report);
    const progressPath = path.join(ARTIFACT_DIR, "tk-curriculum-production-progress.html");
    fs.writeFileSync(progressPath, progressHtml);

    const { chromium } = require("playwright");
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    await page.goto(`file://${progressPath}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "tk-curriculum-production-progress-desktop.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "tk-curriculum-production-progress-mobile.png"),
      fullPage: true,
    });

    // Enrichment editor view of first upgraded lesson (flags on only in temp suite)
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(
      () => typeof window.LLHTeachingKitEnrichmentEditor !== "undefined",
      null,
      { timeout: 30000 },
    );

    const farm = upgradeResults[0];
    const editorUi = await page.evaluate(async (payload) => {
      window.effectiveSiteContent = () => ({
        featureFlags: {
          teachingKitEnrichmentEditor: true,
          teachingKitViewer: false,
          teachingKitAuthoring: false,
          teachingKitCurriculumDirector: false,
          teachingKitQualityReview: false,
        },
      });
      window.adminSession = () => ({ token: payload.adminToken });
      window.showActionFeedback = () => {};
      window.curriculumLessonPlanById = (id) => (id === payload.plan.id ? payload.plan : null);
      window.curriculumActivitiesForLesson = () => [];

      document.body.innerHTML = `<div id="adminTeachingKitEnrichmentHost"></div>`;
      window.LLHTeachingKitEnrichmentEditor.open(payload.plan.id);
      for (let i = 0; i < 50; i += 1) {
        await new Promise((r) => setTimeout(r, 100));
        if (document.querySelector("[data-enrich-root], #adminTeachingKitEnrichmentHost .tk-enrich")) break;
      }
      // Dismiss AI tray if auto-opened
      document.querySelector("[data-ai-cancel]")?.click();
      await new Promise((r) => setTimeout(r, 120));
      return {
        hostHtmlLength: document.getElementById("adminTeachingKitEnrichmentHost")?.innerHTML?.length || 0,
        title: document.body.innerText.includes(payload.plan.title),
      };
    }, {
      adminToken,
      plan: {
        ...priorityPlans[0],
        enrichmentDraft: farm.enrichmentDraft,
      },
    });
    assert(editorUi.hostHtmlLength > 200, "enrichment editor rendered upgraded lesson");
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "tk-curriculum-production-farm-animals-draft-desktop.png"),
      fullPage: true,
    });

    // Restore all flags disabled
    await setFlags(adminToken, {
      teachingKitEnrichmentEditor: false,
      teachingKitViewer: false,
      teachingKitPrintCenter: false,
      teachingKitAttachments: false,
      teachingKitAuthoring: false,
      teachingKitCurriculumDirector: false,
      teachingKitQualityReview: false,
    });
    assert(production.defaultFlagsStillOff(), "defaults still false after suite");

    const suiteReport = {
      title: "Teaching Kit Curriculum Production",
      passed,
      lessonsUpgraded: report.lessonsUpgraded,
      resourcesReused: report.resourcesReused,
      newResourcesCreated: report.newResourcesCreated,
      remainingLessons: report.remainingLessons,
      estimatedCompletionProgress: report.estimatedCompletionProgress,
      stageCounts: report.stageCounts,
      screenshots: [
        "tk-curriculum-production-progress-desktop.png",
        "tk-curriculum-production-progress-mobile.png",
        "tk-curriculum-production-farm-animals-draft-desktop.png",
      ],
      artifacts: [
        "tk-curriculum-production-report.json",
        "tk-curriculum-production-upgrade-details.json",
        "tk-curriculum-production-progress.html",
      ],
      guarantees: {
        autoPublished: false,
        legacyContentPreserved: true,
        flagsDefaultFalse: true,
        reuseFirst: true,
        stagesNotSkipped: true,
        oneLessonAtATime: true,
      },
      productionReadinessScore: report.productionReadinessScore,
      doNotMerge: true,
      doNotDeploy: true,
      doNotEnableFlags: true,
      finishedAt: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(ARTIFACT_DIR, "tk-curriculum-production-suite-report.json"),
      JSON.stringify(suiteReport, null, 2),
    );
    console.log(`OK teaching-kit-curriculum-production (${passed} assertions)`);
    console.log(`Progress: ${report.estimatedCompletionProgress.percentOfPriorityQueue}% of priority queue`);
  } catch (error) {
    console.error("FAIL teaching-kit-curriculum-production:", error.message);
    if (stderr) console.error(stderr.slice(-2500));
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    child.kill("SIGTERM");
    try { fs.rmSync(STORE_PATH, { force: true }); } catch { /* ignore */ }
  }
}

main();
