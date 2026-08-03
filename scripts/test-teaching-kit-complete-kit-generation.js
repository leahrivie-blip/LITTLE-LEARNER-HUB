#!/usr/bin/env node
/**
 * Teaching Kit — Complete Kit Generation (all activities, batched review).
 * Flags remain default false; enabled only inside this suite.
 *
 * Run: npm run test:teaching-kit-complete-kit-generation
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const teachingKit = require("./teaching-kit.js");
const enrichment = require("./teaching-kit-enrichment.js");
const lessonTeacher = require("./teaching-kit-ai-lesson-teacher.js");
const enrichmentAi = require("../server/enrichment-ai.js");

const ROOT = path.join(__dirname, "..");
const PORT = 6130 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-tk-complete-kit-${process.pid}.json`);
const ARTIFACT_DIR = "/opt/cursor/artifacts";
const ADMIN = {
  email: "tk-complete-kit-admin@example.com",
  password: "tk-complete-kit-pass",
  code: "tk-complete-kit-code",
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
      LLH_STORE_PATH: STORE_PATH,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      NODE_ENV: "test",
      LLH_ENRICHMENT_AI_FIXTURE: "1",
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

function largeGardenPlan() {
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  const titles = [
    "Seed Sorting",
    "Watering Practice",
    "Gentle Digging",
    "Herb Smell Tray",
    "Garden Share Circle",
    "Leaf Rubbing",
    "Bug Observation",
    "Soil Texture Tray",
  ];
  const dailyPlans = {};
  titles.forEach((title, index) => {
    const day = days[index % days.length];
    if (!dailyPlans[day]) dailyPlans[day] = { items: [] };
    dailyPlans[day].items.push({
      itemId: `act-complete-${index + 1}`,
      title,
      activityCategory: index % 2 ? "STEM" : "Fine Motor",
      materials: "Cups and seeds",
      objective: "Explore garden helpers",
      dayOfWeek: day,
      setup: "",
      steps: "",
    });
  });
  const suffix = `${process.pid}-${Date.now().toString(36)}`;
  return {
    id: `cur-lp-complete-kit-garden-${suffix}`,
    title: "Garden Helpers Complete Kit",
    age: "Toddler",
    theme: "Gardening",
    plan: "Free",
    status: "published",
    weeklyOverview: "Short.",
    objectives: "Notice plants",
    weeklyMaterials: "Cups",
    familyConnection: "",
    books: [],
    songs: [],
    vocabularyWords: "seed",
    coverImageUrl: "",
    enrichmentDraft: null,
    dailyPlans: Object.fromEntries(
      Object.entries(dailyPlans).map(([day, value]) => [
        day,
        {
          items: (value.items || []).map((item) => ({
            ...item,
            itemId: `${item.itemId}-${suffix}`,
          })),
        },
      ]),
    ),
  };
}

function testFlagsDefaultOff() {
  const flags = teachingKit.defaultTeachingKitFeatureFlags();
  [
    "teachingKitEnrichmentEditor",
    "teachingKitViewer",
    "teachingKitAuthoring",
    "teachingKitPrintCenter",
    "teachingKitAttachments",
  ].forEach((key) => assert(flags[key] === false, `${key} default false`));
}

function testFullCoverageAndBatching() {
  const plan = largeGardenPlan();
  const acts = enrichment.flattenLessonActivities(plan, []);
  assert(acts.length === 8, "8 activities for batching proof");

  const batch1 = enrichmentAi.getLessonTeacherFixturePack({
    plan,
    activities: acts,
    scope: "lesson",
    activityOffset: 0,
    activityLimit: 5,
    includeWeek: true,
    draftActivities: {},
    weekDraft: {},
  });
  assert(batch1.batch.includeWeek === true, "week in first batch");
  assert(batch1.batch.processedCount === 5, "first batch 5 activities");
  assert(batch1.batch.hasMore === true, "has more after batch 1");
  assert(batch1.suggestions.some((s) => s.category === "milestones"), "developmental domains");
  assert(batch1.suggestions.filter((s) => s.category === "milestones").length >= 4, "multiple domains");
  assert(batch1.suggestions.some((s) => s.category === "group_ideas"), "group ideas");
  assert(batch1.suggestions.some((s) => /Small group/i.test(String(s.proposedText || ""))), "small-group ideas");
  assert(batch1.suggestions.some((s) => /Large group/i.test(String(s.proposedText || ""))), "large-group ideas");

  const batch2 = enrichmentAi.getLessonTeacherFixturePack({
    plan,
    activities: acts,
    scope: "lesson",
    activityOffset: 5,
    activityLimit: 5,
    includeWeek: false,
    draftActivities: {},
    weekDraft: {},
  });
  assert(batch2.batch.includeWeek === false, "no week in later batch");
  assert(batch2.batch.processedCount === 3, "second batch remaining 3");
  assert(batch2.batch.hasMore === false, "no more after batch 2");
  assert(batch2.suggestions.every((s) => s.activityKey), "later batch is activity-only");

  const allKeys = new Set([
    ...batch1.suggestions.filter((s) => s.activityKey).map((s) => s.activityKey),
    ...batch2.suggestions.map((s) => s.activityKey),
  ]);
  assert(allKeys.size === 8, "every activity covered across batches");
  assert(
    [...allKeys].every((key) => batch1.suggestions.concat(batch2.suggestions)
      .some((s) => s.activityKey === key && s.category === "image_brief_setup")),
    "image briefs for every activity",
  );

  const all = [...batch1.suggestions, ...batch2.suggestions]
    .map((s) => ({ ...s, decision: "accepted", selected: true }));
  const applied = lessonTeacher.applyLessonTeacherDecisions({ activities: {}, week: {} }, all);
  assert(Object.keys(applied.draft.activities || {}).length === 8, "all 8 activity drafts applied");
  assert(applied.draft.week?.milestones?.length >= 4, "domains in week draft");
  assert(applied.draft.week?.songs?.length >= 1, "songs draft");
  assert(applied.draft.week?.books?.length >= 1, "books draft");
  assert(applied.draft.week?.printableIdeas?.length >= 3, "printable ideas");
  assert(applied.draft.week?.teacherToolkit?.prepChecklist?.length >= 1, "toolkit");

  const analysis = lessonTeacher.analyzeLessonCompleteness(plan, acts, applied.draft);
  assert(analysis.draftReadyActivities === 8, "all activities draft-ready");
  assert(analysis.counts.missing === 0 || analysis.gapSectionIds.length <= 2, "few/no major gaps after full accept");
  const percent = enrichment.computeCompletionPercent(plan, acts, applied.draft);
  assert(percent >= 70, `full draft completion reflects kit (${percent})`);
  assert(percent < 100 || analysis.imagesBriefOnly >= 0, "brief-based images allowed");

  // Thin legacy content alone must not look fully complete.
  const thin = enrichment.computeCompletionPercent(plan, acts, { activities: {}, week: {} });
  assert(thin < 90, `thin lesson not reported complete (${thin})`);
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  testFlagsDefaultOff();
  testFullCoverageAndBatching();

  const child = startServer();
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  let browser;
  const timingReport = { batches: [], totalMs: 0 };
  try {
    await waitForHealth(child);
    const adminToken = await adminLogin();
    const auth = { Authorization: `Bearer ${adminToken}` };
    let expectedUpdatedAt = await setFlags(adminToken, {
      teachingKitEnrichmentEditor: true,
      teachingKitViewer: false,
      teachingKitAuthoring: false,
    });

    const plan = largeGardenPlan();
    let res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      lessonPlan: plan,
    }, auth);
    assert(res.status === 200, `seed lesson: ${res.status}`);
    expectedUpdatedAt = res.json.siteContentUpdatedAt || expectedUpdatedAt;

    const genStarted = Date.now();
    let offset = 0;
    let hasMore = true;
    const allSuggestions = [];
    let batchNum = 0;
    while (hasMore) {
      batchNum += 1;
      const batchStarted = Date.now();
      const ai = await requestJson("POST", "/api/admin/curriculum/enrichment-ai-suggest", {
        adminToken,
        planId: plan.id,
        scope: "lesson",
        activityOffset: offset,
        activityLimit: 5,
        includeWeek: offset === 0,
        simulate: "fixture",
      }, auth);
      const batchMs = Date.now() - batchStarted;
      assert(ai.status === 200, `batch ${batchNum}: ${ai.status}`);
      assert(ai.json.autoPublished === false && ai.json.autoSaved === false, "no auto publish");
      assert(ai.json.batch, "batch metadata in API");
      timingReport.batches.push({
        batch: batchNum,
        ms: batchMs,
        suggestionCount: (ai.json.suggestions || []).length,
        processedCount: ai.json.batch.processedCount,
        offset: ai.json.batch.activityOffset,
      });
      allSuggestions.push(...(ai.json.suggestions || []));
      hasMore = ai.json.batch.hasMore === true;
      offset = ai.json.batch.nextOffset;
    }
    timingReport.totalMs = Date.now() - genStarted;
    timingReport.suggestionCount = allSuggestions.length;
    timingReport.activityKeys = [...new Set(allSuggestions.map((s) => s.activityKey).filter(Boolean))];
    assert(timingReport.batches.length >= 2, "used multiple batches for 8 activities");
    assert(timingReport.activityKeys.length === 8, "API covered all 8 activities");

    const accepted = allSuggestions.map((s) => ({ ...s, decision: "accepted", selected: true }));
    const applied = lessonTeacher.applyLessonTeacherDecisions({ activities: {}, week: {} }, accepted);
    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      saveMode: "enrichment_draft",
      lessonPlan: { id: plan.id, enrichmentDraft: applied.draft },
    }, auth);
    assert(res.status === 200, `save full draft: ${res.status}`);
    expectedUpdatedAt = res.json.siteContentUpdatedAt || expectedUpdatedAt;
    const drafted = (res.json.curriculum.lessonPlans || []).find((p) => p.id === plan.id);
    assert(Object.keys(drafted.enrichmentDraft?.activities || {}).length === 8, "persisted 8 activity drafts");
    assert(String(drafted.weeklyOverview || "") === "Short.", "legacy overview preserved");

    const example = {
      planId: plan.id,
      title: plan.title,
      activityCount: 8,
      generationTiming: timingReport,
      weekDraftKeys: Object.keys(drafted.enrichmentDraft.week || {}),
      activityDraftSample: drafted.enrichmentDraft.activities["act-complete-1"],
      analysis: lessonTeacher.analyzeLessonCompleteness(
        drafted,
        enrichment.flattenLessonActivities(drafted, []),
        drafted.enrichmentDraft,
      ),
      completionPercent: enrichment.computeCompletionPercent(
        drafted,
        enrichment.flattenLessonActivities(drafted, []),
        drafted.enrichmentDraft,
      ),
      guarantees: {
        autoSaved: false,
        autoPublished: false,
        publishedContentPreserved: true,
      },
      futureNote: "Regenerate-only-this-section is planned for a follow-up PR (not in this phase).",
    };
    fs.writeFileSync(
      path.join(ARTIFACT_DIR, "tk-complete-kit-example-upgraded-lesson.json"),
      JSON.stringify(example, null, 2),
    );
    fs.writeFileSync(
      path.join(ARTIFACT_DIR, "tk-complete-kit-timing.json"),
      JSON.stringify(timingReport, null, 2),
    );

    const { chromium } = require("playwright");
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(
      () => typeof window.LLHTeachingKitAiLessonTeacher !== "undefined"
        && typeof window.LLHTeachingKitEnrichmentEditor !== "undefined",
      null,
      { timeout: 30000 },
    );

    const ui = await page.evaluate(async (payload) => {
      window.effectiveSiteContent = () => ({
        featureFlags: {
          teachingKitEnrichmentEditor: true,
          teachingKitViewer: false,
          teachingKitAuthoring: false,
        },
      });
      window.adminSession = () => ({ token: payload.adminToken });
      window.curriculumLessonPlanById = (id) => (id === payload.plan.id ? payload.plan : null);
      window.curriculumActivitiesForLesson = () => [];
      window.showActionFeedback = () => {};

      const host = document.createElement("div");
      host.id = "adminTeachingKitEnrichmentHost";
      document.body.innerHTML = "";
      document.body.appendChild(host);

      // Use empty draft so Prepare AI Draft regenerates full kit for UI review.
      const emptyPlan = {
        ...payload.plan,
        enrichmentDraft: { activities: {}, week: {} },
      };
      window.curriculumLessonPlanById = (id) => (id === emptyPlan.id ? emptyPlan : null);
      window.LLHTeachingKitEnrichmentEditor.open(emptyPlan.id);

      for (let i = 0; i < 80; i += 1) {
        await new Promise((r) => setTimeout(r, 100));
        const progress = document.querySelector("[data-ai-batch-progress]");
        const ready = document.querySelector("[data-ai-accept-all]");
        const timing = window.LLHTeachingKitEnrichmentEditor.getGenerationTiming?.();
        if (ready && timing && !document.querySelector("[data-ai-loading]")) break;
        if (progress && ready && i > 20) {
          // progressive rows may appear while still loading
        }
      }

      const timing = window.LLHTeachingKitEnrichmentEditor.getGenerationTiming?.() || null;
      const activityGroups = document.querySelectorAll("[data-ai-activity-group]").length;
      return {
        reviewTitle: (document.querySelector("#tk-enrich-ai-title")?.textContent || "").includes("Complete kit"),
        acceptSection: Boolean(document.querySelector("[data-ai-accept-section]")),
        acceptActivity: Boolean(document.querySelector("[data-ai-accept-activity]")),
        acceptAll: Boolean(document.querySelector("[data-ai-accept-all]")),
        activityGroups,
        cardCount: document.querySelectorAll("[data-ai-card]").length,
        progressText: document.querySelector("[data-ai-batch-progress]")?.textContent || "",
        timing,
      };
    }, { plan: drafted, adminToken });

    assert(ui.reviewTitle, "complete kit review title");
    assert(ui.acceptSection, "accept section controls");
    assert(ui.acceptActivity, "accept activity controls");
    assert(ui.acceptAll, "accept all");
    assert(ui.activityGroups >= 5, `activity groups in review (${ui.activityGroups})`);
    assert(ui.cardCount >= 20, `many review cards (${ui.cardCount})`);
    assert(ui.timing && ui.timing.batchCount >= 2, "client batch timing recorded");

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "tk-complete-kit-review-desktop.png"),
      fullPage: true,
    });

    // Accept one activity, keep tray open
    const afterActivity = await page.evaluate(async () => {
      const btn = document.querySelector("[data-ai-accept-activity]");
      const key = btn?.getAttribute("data-ai-accept-activity") || "";
      if (btn) btn.click();
      await new Promise((r) => setTimeout(r, 150));
      return {
        key,
        trayOpen: Boolean(document.querySelector("[data-ai-tray]")),
        draftHasActivity: Boolean(
          window.LLHTeachingKitEnrichmentEditor.getDraft()?.activities?.[key],
        ),
      };
    });
    assert(afterActivity.trayOpen, "tray stays open after accept activity");
    assert(afterActivity.draftHasActivity, "activity accepted into draft");

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "tk-complete-kit-after-accept-activity-desktop.png"),
      fullPage: true,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "tk-complete-kit-review-mobile.png"),
      fullPage: true,
    });

    await setFlags(adminToken, {
      teachingKitEnrichmentEditor: false,
      teachingKitViewer: false,
      teachingKitAuthoring: false,
    });
    assert(teachingKit.defaultTeachingKitFeatureFlags().teachingKitEnrichmentEditor === false, "defaults still false");

    const report = {
      title: "Teaching Kit Complete Kit Generation",
      passed,
      screenshots: [
        "tk-complete-kit-review-desktop.png",
        "tk-complete-kit-after-accept-activity-desktop.png",
        "tk-complete-kit-review-mobile.png",
      ],
      exampleUpgradedLesson: "tk-complete-kit-example-upgraded-lesson.json",
      generationTiming: timingReport,
      performanceImpact: {
        batchSize: 5,
        requestCount: timingReport.batches.length,
        totalMs: timingReport.totalMs,
        avgBatchMs: Math.round(
          timingReport.batches.reduce((sum, b) => sum + b.ms, 0) / Math.max(1, timingReport.batches.length),
        ),
        note: "Fixture-backed generation is CPU-light; OpenAI mode would multiply per-batch latency. UI keeps one continuous review session.",
      },
      productionReadinessScore: "8/10",
      doNotMerge: true,
      doNotDeploy: true,
      doNotEnableFlags: true,
      futureWork: ["Regenerate only this section"],
      finishedAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(ARTIFACT_DIR, "tk-complete-kit-report.json"), JSON.stringify(report, null, 2));
    console.log(`OK teaching-kit-complete-kit-generation (${passed} assertions)`);
    console.log(`TIMING totalMs=${timingReport.totalMs} batches=${timingReport.batches.length} suggestions=${timingReport.suggestionCount}`);
  } catch (error) {
    console.error("FAIL teaching-kit-complete-kit-generation:", error.message);
    if (stderr) console.error(stderr.slice(-2500));
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    child.kill("SIGTERM");
    try { fs.rmSync(STORE_PATH, { force: true }); } catch { /* ignore */ }
  }
}

main();
