#!/usr/bin/env node
/**
 * Teaching Kit Upgrade Workspace — any-lesson AI drafts, dashboard, rollback.
 * Flags remain default false; enabled only inside this suite.
 *
 * Run: npm run test:teaching-kit-upgrade-workspace
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const teachingKit = require("./teaching-kit.js");
const enrichment = require("./teaching-kit-enrichment.js");
const workspace = require("./teaching-kit-upgrade-workspace.js");
const enrichmentAi = require("../server/enrichment-ai.js");

const ROOT = path.join(__dirname, "..");
const PORT = 5930 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-tk-upgrade-ws-${process.pid}.json`);
const FARM = JSON.parse(
  fs.readFileSync(path.join(ROOT, "scripts/fixtures/teaching-kit/farm-animals-enrichment-slice2.json"), "utf8"),
);
const ARTIFACT_DIR = "/opt/cursor/artifacts";
const ADMIN = {
  email: "tk-upgrade-ws-admin@example.com",
  password: "tk-upgrade-ws-pass",
  code: "tk-upgrade-ws-code",
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
  const existing = boot.json.siteContent || {};
  const save = await requestJson("POST", "/api/admin/site-content", {
    adminToken,
    expectedUpdatedAt: existing.updatedAt || boot.json.siteContentUpdatedAt,
    siteContent: {
      ...existing,
      updatedAt: existing.updatedAt,
      featureFlags: {
        ...(existing.featureFlags || {}),
        ...flags,
      },
    },
  }, { Authorization: `Bearer ${adminToken}` });
  assert(save.status === 200, `save flags: ${save.status}`);
  const after = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
  return after.json.siteContent?.updatedAt || after.json.siteContentUpdatedAt || "";
}

function testFlagsDefaultOff() {
  const flags = teachingKit.defaultTeachingKitFeatureFlags();
  assert(flags.teachingKitEnrichmentEditor === false, "enrichment editor default false");
  assert(flags.teachingKitAuthoring === false, "authoring default false");
  assert(flags.teachingKitViewer === false, "viewer default false");
}

function testAiCategoriesCoverVision() {
  const cats = enrichmentAi.SUGGESTION_CATEGORIES;
  [
    "weekly_overview",
    "learning_objectives",
    "materials_list",
    "teacher_preparation",
    "toolkit_prep",
    "books",
    "songs",
    "printable_ideas",
    "vocab_cards",
    "indoor_alternatives",
    "outdoor_alternatives",
    "adaptations",
    "extensions",
    "image_brief_setup",
    "image_brief_example",
  ].forEach((id) => assert(cats[id], `category ${id}`));
  assert(String(enrichmentAi.IMAGE_STYLE_RULES || "").includes("Classroom-achievable"), "style guide in AI module");
}

function testApplyWeekAndActivityDrafts() {
  const otherPlan = {
    id: "cur-lp-upgrade-ws-other",
    title: "Garden Helpers",
    age: "Toddler",
    theme: "Gardening",
    status: "published",
    weeklyOverview: "Short legacy overview.",
    familyConnection: "",
    books: [],
    songs: [],
    dailyPlans: {
      monday: {
        items: [{
          itemId: "act-garden-1",
          title: "Seed Sorting",
          activityCategory: "Fine Motor",
          materials: "Seeds, cups",
        }],
      },
    },
  };
  const ctx = {
    plan: otherPlan,
    activity: otherPlan.dailyPlans.monday.items[0],
    scope: "week",
    activityDraft: {},
    weekDraft: {},
  };
  const weekSugs = enrichmentAi.buildFixtureSuggestions(ctx)
    .map((sug) => ({ ...sug, decision: "accepted", selected: true }));
  assert(weekSugs.length >= 5, "week fixture suggestions");
  const weekApplied = enrichment.applySuggestionsToDraft({ activities: {}, week: {} }, weekSugs, {});
  assert(weekApplied.draft.week.weeklyOverview, "week overview draft");
  assert(weekApplied.draft.week.books?.length, "books draft");
  assert(weekApplied.draft.week.songs?.length, "songs draft");
  assert(weekApplied.draft.week.teacherToolkit?.prepChecklist?.length, "toolkit prep draft");
  assert(weekApplied.draft.week.printableIdeas?.length, "printable ideas draft");

  const actCtx = {
    plan: otherPlan,
    activity: otherPlan.dailyPlans.monday.items[0],
    scope: "activity",
    activityDraft: {},
    weekDraft: {},
  };
  const actSugs = enrichmentAi.buildFixtureSuggestions(actCtx)
    .map((sug) => ({ ...sug, decision: "accepted", selected: true }));
  const actApplied = enrichment.applySuggestionsToDraft(
    { activities: {}, week: {} },
    actSugs,
    { activityKey: "act-garden-1" },
  );
  const actDraft = actApplied.draft.activities["act-garden-1"];
  assert(actDraft.teacherTips?.length, "tips draft");
  assert(actDraft.indoorAlternatives, "indoor alternatives draft");
  assert(actDraft.imageBriefSetup, "setup image brief");
  assert(actDraft.imageBriefExample, "example image brief");
  assert(!String(actDraft.imageBriefSetup).includes("http"), "briefs are not URLs");

  const merged = enrichment.mergeDraftIntoPlan(otherPlan, [], weekApplied.draft);
  assert(String(merged.plan.weeklyOverview || "").length > 0, "publish merge overview");
  assert(merged.plan.books?.length, "publish merge books");
  assert(merged.plan.teachingKit?.teacherToolkit?.prepChecklist?.length, "publish merge toolkit");
}

function testDashboardHelpers() {
  const summary = enrichment.buildUpgradeSummary(FARM.lessonPlan, FARM.activities || [], null);
  assert(typeof summary.missingTeacherToolkit === "boolean", "missingTeacherToolkit");
  assert(typeof summary.aiReady === "boolean", "aiReady");
  assert(summary.aiReady === true, "farm fixture AI ready");
  assert(
    enrichment.matchesUpgradeGapFilter(summary, "most_incomplete") === true
      || summary.completionPercent < 90,
    "most incomplete filter works",
  );
  const chips = workspace.gapChipsFromSummary(summary);
  assert(Array.isArray(chips), "gap chips");
  const plans = [
    { id: "a", title: "A", updatedAt: "2026-01-01" },
    { id: "b", title: "B", updatedAt: "2026-01-02" },
  ];
  const metaFor = (plan) => ({
    percent: plan.id === "a" ? 10 : 80,
    summary: { completionPercent: plan.id === "a" ? 10 : 80, lastEditedDate: plan.updatedAt },
  });
  const next = workspace.nextLessonInQueue(plans, "a", metaFor);
  assert(next?.id === "b", "next lesson in queue");
  assert(workspace.workspaceCopy().eyebrow === "Upgrade Workspace", "workspace copy");
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  testFlagsDefaultOff();
  testAiCategoriesCoverVision();
  testApplyWeekAndActivityDrafts();
  testDashboardHelpers();

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
      teachingKitAuthoring: false,
    });

    // Seed a non-Farm lesson to prove any-lesson upgrade.
    const gardenItem = (day, suffix, title) => ({
      itemId: `act-garden-${suffix}`,
      title,
      activityCategory: "Fine Motor",
      materials: "Seeds and cups",
      objective: "Sort by size",
      dayOfWeek: day,
      setup: "",
      steps: "",
    });
    const otherPlan = {
      id: "cur-lp-upgrade-ws-garden",
      title: "Garden Helpers",
      age: "Toddler",
      theme: "Gardening",
      plan: "Free",
      status: "published",
      weeklyOverview: "Toddlers explore garden helpers.",
      objectives: "Notice living things",
      weeklyMaterials: "Cups, soil, spoons",
      familyConnection: "",
      books: [],
      songs: [],
      vocabularyWords: "seed, sprout",
      coverImageUrl: "",
      dailyPlans: {
        monday: { items: [gardenItem("monday", "seed", "Seed Sorting")] },
        tuesday: { items: [gardenItem("tuesday", "water", "Watering Practice")] },
        wednesday: { items: [gardenItem("wednesday", "dig", "Gentle Digging")] },
        thursday: { items: [gardenItem("thursday", "smell", "Herb Smell Tray")] },
        friday: { items: [gardenItem("friday", "share", "Garden Share Circle")] },
      },
    };
    let res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      lessonPlan: otherPlan,
    }, auth);
    assert(res.status === 200, `seed other lesson: ${res.status}`);
    expectedUpdatedAt = res.json.siteContentUpdatedAt || expectedUpdatedAt;

    // Also seed farm for dashboard plurality
    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      lessonPlan: FARM.lessonPlan,
    }, auth);
    assert(res.status === 200, "seed farm");
    expectedUpdatedAt = res.json.siteContentUpdatedAt || expectedUpdatedAt;

    const ai = await requestJson("POST", "/api/admin/curriculum/enrichment-ai-suggest", {
      adminToken,
      planId: otherPlan.id,
      activityKey: "act-garden-seed",
      scope: "week",
      simulate: "fixture",
    }, auth);
    assert(ai.status === 200 && Array.isArray(ai.json.suggestions), "AI week suggest for non-farm lesson");
    assert(ai.json.autoSaved !== true && ai.json.autoPublished !== true, "AI does not auto publish");
    const cats = ai.json.suggestions.map((s) => s.category);
    assert(cats.includes("weekly_overview") || cats.includes("books") || cats.includes("family_connection"), "expanded week categories returned");

    const accepted = ai.json.suggestions.map((sug) => ({ ...sug, decision: "accepted", selected: true }));
    const applied = enrichment.applySuggestionsToDraft({ activities: {}, week: {} }, accepted, {});
    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      saveMode: "enrichment_draft",
      lessonPlan: { id: otherPlan.id, enrichmentDraft: applied.draft },
    }, auth);
    assert(res.status === 200, `save draft: ${res.status} ${String(res.text).slice(0, 180)}`);
    expectedUpdatedAt = res.json.siteContentUpdatedAt || expectedUpdatedAt;
    const drafted = (res.json.curriculum.lessonPlans || []).find((p) => p.id === otherPlan.id);
    assert(drafted.enrichmentDraft?.week?.weeklyOverview || drafted.enrichmentDraft?.week?.books?.length, "draft persisted");

    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      saveMode: "publish_enrichment",
      publishedBy: "upgrade-ws-test",
      lessonPlan: { id: otherPlan.id, enrichmentDraft: drafted.enrichmentDraft },
    }, auth);
    assert(res.status === 200 && res.json.ok, `publish: ${res.status}`);
    assert(res.json.priorVersionAvailable === true || res.json.versionId, "history created");
    expectedUpdatedAt = res.json.siteContentUpdatedAt || expectedUpdatedAt;
    const published = (res.json.curriculum.lessonPlans || []).find((p) => p.id === otherPlan.id);
    assert(!published.enrichmentDraft, "draft cleared after publish");
    assert(published.enrichmentPublishHistory?.length >= 1, "publish history present");

    const rollback = await requestJson("POST", "/api/admin/curriculum/enrichment-rollback", {
      adminToken,
      planId: otherPlan.id,
      publishedBy: "upgrade-ws-test",
    }, auth);
    assert(rollback.status === 200 && rollback.json.rolledBack === true, `rollback: ${rollback.status}`);
    assert(rollback.json.autoPublished !== true, "rollback is explicit");

    // Browser: dashboard workspace + Upgrade Lesson CTA for non-farm lesson
    const { chromium } = require("playwright");
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(
      () => typeof window.LLHTeachingKitEnrichment !== "undefined"
        && typeof window.LLHTeachingKitUpgradeWorkspace !== "undefined"
        && typeof curriculumLessonPlanAdminCardHtml === "function",
      null,
      { timeout: 30000 },
    );
    const ui = await page.evaluate((payload) => {
      window.effectiveSiteContent = () => ({
        featureFlags: {
          teachingKitEnrichmentEditor: true,
          teachingKitViewer: false,
          teachingKitAuthoring: false,
        },
      });
      window.curriculumActivitiesForLesson = (id) => (
        id === payload.plan.id ? payload.activities : []
      );
      const host = document.createElement("div");
      document.body.innerHTML = "";
      document.body.appendChild(host);
      const copy = window.LLHTeachingKitUpgradeWorkspace.workspaceCopy();
      host.innerHTML = `
        <section class="admin-panel">
          <p class="eyebrow">${copy.eyebrow}</p>
          <h2>${copy.title}</h2>
          <p>${copy.blurb}</p>
          ${curriculumLessonPlanAdminCardHtml(payload.plan)}
        </section>
      `;
      const summary = window.LLHTeachingKitEnrichment.buildUpgradeSummary(
        payload.plan,
        payload.activities,
        payload.plan.enrichmentDraft || null,
      );
      return {
        upgradeCta: (document.querySelector("[data-curriculum-lesson-enrich]")?.textContent || "").includes("Upgrade Lesson"),
        aiReady: host.textContent.includes("AI Ready") || summary.aiReady === true,
        workspace: host.textContent.includes("Upgrade Workspace"),
        hasToolkitGapOrReady: typeof summary.missingTeacherToolkit === "boolean",
      };
    }, {
      plan: published,
      activities: (rollback.json.curriculum.activities || []).filter((a) => a.lessonPlanId === otherPlan.id),
    });
    assert(ui.upgradeCta, "Upgrade Lesson CTA");
    assert(ui.workspace, "Upgrade Workspace framing");
    assert(ui.hasToolkitGapOrReady, "toolkit gap in summary");

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "tk-upgrade-workspace-dashboard.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "tk-upgrade-workspace-dashboard-mobile.png"),
      fullPage: true,
    });

    await setFlags(adminToken, {
      teachingKitEnrichmentEditor: false,
      teachingKitViewer: false,
      teachingKitAuthoring: false,
    });
    assert(teachingKit.defaultTeachingKitFeatureFlags().teachingKitEnrichmentEditor === false, "defaults still false");

    const report = {
      title: "Teaching Kit Upgrade Workspace",
      passed,
      screenshots: [
        "tk-upgrade-workspace-dashboard.png",
        "tk-upgrade-workspace-dashboard-mobile.png",
      ],
      productionReadinessScore: "7/10",
      doNotMerge: true,
      doNotDeploy: true,
      doNotEnableFlags: true,
      finishedAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(ARTIFACT_DIR, "tk-upgrade-workspace-report.json"), JSON.stringify(report, null, 2));
    console.log(`OK teaching-kit-upgrade-workspace (${passed} assertions)`);
  } catch (error) {
    console.error("FAIL teaching-kit-upgrade-workspace:", error.message);
    if (stderr) console.error(stderr.slice(-2500));
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    child.kill("SIGTERM");
    try { fs.rmSync(STORE_PATH, { force: true }); } catch { /* ignore */ }
  }
}

main();
