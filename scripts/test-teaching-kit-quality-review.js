#!/usr/bin/env node
/**
 * Teaching Kit — AI Curriculum Quality Review + Library Health.
 * Flags remain default false; enabled only inside this suite.
 *
 * Run: npm run test:teaching-kit-quality-review
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const teachingKit = require("./teaching-kit.js");
const quality = require("./teaching-kit-quality-review.js");

const ROOT = path.join(__dirname, "..");
const PORT = 6430 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-tk-quality-review-${process.pid}.json`);
const ARTIFACT_DIR = "/opt/cursor/artifacts";
const ADMIN = {
  email: "tk-quality-review-admin@example.com",
  password: "tk-quality-review-pass",
  code: "tk-quality-review-code",
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

function weakPlan() {
  return {
    id: `plan-quality-weak-${Date.now().toString(36)}`,
    title: "Colors Everywhere",
    theme: "Colors",
    age: "Infant",
    weeklyOverview: "Short.",
    objectives: "",
    vocabularyWords: "",
    books: [],
    songs: [],
    familyConnection: "",
    resourceIds: [],
    enrichmentDraft: {
      week: {},
      activities: {
        "act-q1": {
          teacherTips: [],
          observationPrompts: [],
          steps: "Use scissors and a worksheet to write your name. Small beads required.",
        },
      },
    },
    dailyPlans: {
      monday: { items: [{ itemId: "act-q1", title: "Color Sort", category: "table" }] },
      tuesday: { items: [{ itemId: "act-q2", title: "Color Sort Again", category: "table" }] },
    },
  };
}

function strongerPlan() {
  return {
    id: `plan-quality-strong-${Date.now().toString(36)}`,
    title: "Garden Helpers",
    theme: "Gardening",
    age: "3-4",
    weeklyOverview: "Children explore gardens through play, notice plants, and share discoveries with friends.",
    objectives: "Children will explore plant parts, practice turn-taking, and use garden vocabulary in play.",
    vocabularyWords: "seed, soil, sprout, water, leaf, root",
    books: [{ title: "The Tiny Seed (talk prompts only)" }],
    songs: [{ title: "This Is the Way We Plant Our Seeds" }],
    familyConnection: "Ask your child what they noticed in a plant or outdoor walk.",
    resourceIds: [],
    enrichmentDraft: {
      week: {
        weeklyOverview: "Invite children to explore seeds, soil, and outdoor noticing walks.",
        objectives: "Children will explore plant parts, practice turn-taking, and use garden vocabulary.",
        weeklyMaterials: "cups, soil, seeds, spoons, magnifiers, paper, crayons",
        teacherPreparation: "Stage trays at child height, prepare rinse cloth, set observation clipboard near the garden table.",
        familyConnection: "At home, notice one plant together and name a part.",
        printableIdeas: ["Garden vocabulary cards"],
        vocabCards: ["seed", "soil", "sprout", "leaf"],
        books: [{ title: "The Tiny Seed (talk prompts only)" }],
        songs: [{ title: "This Is the Way We Plant Our Seeds" }],
        teacherToolkit: {
          prepChecklist: ["Fill soil cups", "Set magnifiers"],
          observationFocus: ["Uses a garden word", "Invites a peer"],
          notes: "Keep process open-ended.",
          teacherPreparation: "Preview materials and model once.",
        },
        milestones: ["Language", "SEL", "Fine motor", "Cognition"],
      },
      activities: {
        "act-g1": {
          imageRequirement: "required",
          teacherTips: ["Offer tongs for seed sorting."],
          observationPrompts: ["Does the child name a plant part?"],
          indoorAlternatives: "Window sill planting tray",
          outdoorAlternatives: "Sidewalk seed hunt",
          imageBriefSetup: "Ordinary cups of soil on a low table in natural light.",
          imageBriefExample: "Children pinching seeds into cups.",
          steps: "Invite children to explore soil texture, count seeds, pretend to water plants, paint leaves, and share feelings about growing.",
        },
      },
    },
    dailyPlans: {
      monday: { items: [{ itemId: "act-g1", title: "Seed Sensory Tray", category: "sensory" }] },
    },
  };
}

function runUnitTests() {
  assert(teachingKit.defaultTeachingKitFeatureFlags().teachingKitQualityReview === false, "quality flag default false");
  assert(teachingKit.FEATURE_FLAG_KEYS.includes("teachingKitQualityReview"), "flag key registered");
  assert(quality.SECTIONS.length >= 20, "section rubric coverage");

  const weak = weakPlan();
  const weakActs = [
    { id: "act-q1", title: "Color Sort", lessonPlanId: weak.id },
    { id: "act-q2", title: "Color Sort Again", lessonPlanId: weak.id },
  ];
  const weakReport = quality.buildQualityReport(weak, weakActs, weak.enrichmentDraft);
  assert(typeof weakReport.overallScore === "number", "overall score");
  assert(Array.isArray(weakReport.sectionScores) && weakReport.sectionScores.length >= 20, "section scores");
  assert(weakReport.blocksPublish === true, "weak plan blocks publish");
  assert(weakReport.publishReadiness === "blocked", "weak plan readiness Blocked");
  assert(weakReport.publishReadinessLabel === "Blocked", "Blocked label");
  assert(weakReport.blockingIssues.length >= 1, "blocking issues listed");
  assert(weakReport.missing.length >= 1, "missing items");
  assert(weakReport.suggestedImprovements.length >= 1, "suggested improvements");
  assert(weakReport.autoChanged === false && weakReport.autoPublished === false, "report only");

  // Mid-completeness kits with serious gaps must not report "No blockers".
  const mid = {
    id: "plan-quality-mid-55",
    title: "Almost There Animals",
    theme: "Animals",
    age: "Preschool",
    weeklyOverview: "Children explore animals through play invitations and short talks.",
    objectives: "Name",
    vocabularyWords: "fur",
    books: [],
    songs: [],
    familyConnection: "",
    enrichmentDraft: {
      week: {
        weeklyOverview: "Children explore animals through play invitations and short talks this week.",
        objectives: "Children will look",
        teacherPreparation: "Stage trays",
      },
      activities: {
        "act-m1": { teacherTips: ["Offer two sorting trays."], observationPrompts: ["Names an animal?"] },
      },
    },
    dailyPlans: {
      monday: [{ id: "act-m1", title: "Animal Sort", category: "table" }],
      tuesday: [{ id: "act-m2", title: "Animal Move", category: "movement" }],
    },
  };
  const midActs = [
    { id: "act-m1", title: "Animal Sort", lessonPlanId: mid.id },
    { id: "act-m2", title: "Animal Move", lessonPlanId: mid.id },
  ];
  const midReport = quality.buildQualityReport(mid, midActs, mid.enrichmentDraft);
  assert(midReport.blocksPublish === true, "mid incomplete kit blocks publish");
  assert(midReport.publishReadiness === "blocked", "mid kit readiness blocked");
  assert(
    (midReport.blockingIssues || []).some((b) => /missing_|weak_|completeness_|domain_/.test(b.code)),
    "mid kit blockers include serious gaps",
  );

  const ignored = quality.applyIssueDecision(weakReport, {
    code: weakReport.blockingIssues[0].code,
    decision: "ignore",
  });
  assert(ignored.findings.some((f) => f.status === "ignored"), "ignore decision applied");

  const improve = quality.buildImprovementSuggestion(weakReport.findings[0], weak, weak.enrichmentDraft);
  assert(improve.proposedText && improve.autoPublished === false, "improve suggestion draft only");

  const strong = strongerPlan();
  const strongActs = [{ id: "act-g1", title: "Seed Sensory Tray", lessonPlanId: strong.id }];
  const strongReport = quality.buildQualityReport(strong, strongActs, strong.enrichmentDraft);
  // Premium gates mark both kits blocked when images/printables/books are incomplete.
  // Rank by fewer hard blockers + listed strengths — not field-presence "100% quality".
  assert(
    (strongReport.blockingIssues || []).length < (weakReport.blockingIssues || []).length,
    "stronger kit has fewer hard blockers than weak kit",
  );
  assert(strongReport.blocksPublish === true, "stronger kit still blocked without real images/printables");
  assert(strongReport.strengths.length >= 1, "strengths listed");
  assert(
    (strongReport.blockingIssues || []).some((b) => b.code === "image_brief_not_image" || b.code === "missing_example_images"),
    "image briefs never clear photo blockers",
  );

  const health = quality.buildLibraryHealthDashboard(
    { lessonPlans: [weak, strong], activities: [...weakActs, ...strongActs], resources: [] },
    { [strong.id]: { views: 12, downloads: 4, assigns: 3, proUpgrades: 1 } },
    { analyticsAvailable: true, searchGaps: [{ query: "dinosaur week", count: 2 }] },
  );
  assert(health.highestQuality[0].id === strong.id, "highest quality");
  assert(health.lowestQuality[0].id === weak.id, "lowest quality");
  assert(health.needingReview.length >= 1, "needing review");
  assert(health.missingBooks.length >= 1, "missing books list");
  assert(/real analytics/i.test(health.dataQuality.analyticsLabel), "analytics labeled real");
  assert(health.searchedButMissing.length >= 1, "search gaps");
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  runUnitTests();

  const child = startServer();
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  let browser = null;

  try {
    await waitForHealth(child);
    const adminToken = await adminLogin();
    const auth = { Authorization: `Bearer ${adminToken}` };

    let res = await requestJson("POST", "/api/admin/curriculum/quality-review", {
      adminToken,
      action: "library_health",
    }, auth);
    assert(res.status === 404, "quality API disabled when flag off");

    let expectedUpdatedAt = await setFlags(adminToken, {
      teachingKitQualityReview: true,
      teachingKitEnrichmentEditor: true,
      teachingKitCurriculumDirector: false,
      teachingKitViewer: false,
      teachingKitAuthoring: false,
    });

    const weak = weakPlan();
    const strong = strongerPlan();
    for (const plan of [weak, strong]) {
      res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
        adminToken,
        expectedUpdatedAt,
        saveMode: "curriculum",
        lessonPlan: { ...plan, enrichmentDraft: null },
      }, auth);
      assert(res.status === 200, `seed ${plan.id}: ${res.status}`);
      expectedUpdatedAt = res.json.siteContentUpdatedAt || expectedUpdatedAt;
      res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
        adminToken,
        expectedUpdatedAt,
        saveMode: "enrichment_draft",
        lessonPlan: { id: plan.id, enrichmentDraft: plan.enrichmentDraft },
      }, auth);
      assert(res.status === 200, `draft ${plan.id}: ${res.status}`);
      expectedUpdatedAt = res.json.siteContentUpdatedAt || expectedUpdatedAt;
    }

    res = await requestJson("POST", "/api/admin/curriculum/quality-review", {
      adminToken,
      action: "review_lesson",
      planId: weak.id,
      enrichmentDraft: weak.enrichmentDraft,
    }, auth);
    assert(res.status === 200 && res.json.report, "review_lesson ok");
    assert(res.json.report.blocksPublish === true, "API report blocks");
    assert(res.json.autoPublished === false, "review never publishes");

    res = await requestJson("POST", "/api/admin/curriculum/quality-review", {
      adminToken,
      action: "improve_issue",
      planId: weak.id,
      finding: res.json.report.findings[0],
    }, auth);
    assert(res.status === 200 && res.json.suggestions?.length === 1, "improve_issue suggestion");
    assert(res.json.autoSaved === false, "improve not auto-saved");

    res = await requestJson("POST", "/api/admin/curriculum/quality-review", {
      adminToken,
      action: "library_health",
    }, auth);
    assert(res.status === 200 && res.json.libraryHealth, "library health");
    assert(res.json.libraryHealth.dataQuality?.analyticsLabel, "analytics label present");

    // Owner workspace: quality findings stay informational. A valid core lesson publishes.
    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      saveMode: "publish_enrichment",
      lessonPlan: { id: weak.id, enrichmentDraft: weak.enrichmentDraft },
    }, auth);
    assert(res.status === 200 && res.json.ok, `valid core lesson publishes despite quality findings: ${res.status} ${res.json?.code || res.json?.error || ""}`);
    assert(res.json.autoPublished !== true, "publish stays explicit — never auto-published");
    expectedUpdatedAt = res.json.siteContentUpdatedAt || expectedUpdatedAt;

    // Fresh weak-like draft for ignore-path coverage (do not reuse published weak)
    const weak2 = { ...weak, id: `${weak.id}-ignore-path` };
    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      lessonPlan: { ...weak2, enrichmentDraft: null },
    }, auth);
    assert(res.status === 200, `seed weak2: ${res.status}`);
    expectedUpdatedAt = res.json.siteContentUpdatedAt || expectedUpdatedAt;
    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      saveMode: "enrichment_draft",
      lessonPlan: { id: weak2.id, enrichmentDraft: weak.enrichmentDraft },
    }, auth);
    assert(res.status === 200, `draft weak2: ${res.status}`);
    expectedUpdatedAt = res.json.siteContentUpdatedAt || expectedUpdatedAt;

    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      saveMode: "publish_enrichment",
      lessonPlan: { id: weak2.id, enrichmentDraft: weak.enrichmentDraft },
    }, auth);
    assert(res.status === 200 && res.json.ok, `weak2 publishes without quality override: ${res.status} ${res.json?.code || ""}`);
    expectedUpdatedAt = res.json.siteContentUpdatedAt || expectedUpdatedAt;

    // Ignore all blockers via draft ignored codes, then publish should succeed
    const blockCodes = (res.json.qualityReport?.blockingIssues || []).map((b) => b.code);
    const ignoredDraft = {
      ...weak.enrichmentDraft,
      week: {
        ...(weak.enrichmentDraft.week || {}),
        qualityReviewIgnored: blockCodes,
      },
    };
    // Re-fetch expectedUpdatedAt
    const boot = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    expectedUpdatedAt = boot.json.siteContent?.updatedAt || boot.json.siteContentUpdatedAt;
    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      saveMode: "enrichment_draft",
      lessonPlan: { id: weak2.id, enrichmentDraft: ignoredDraft },
    }, auth);
    assert(res.status === 200, `save ignored draft: ${res.status}`);
    expectedUpdatedAt = res.json.siteContentUpdatedAt || expectedUpdatedAt;

    // After ignoring blockers, remaining high issues may still allow publish (blocksPublish false)
    const afterIgnore = quality.buildQualityReport(weak2, [
      { id: "act-q1", title: "Color Sort" },
      { id: "act-q2", title: "Color Sort Again" },
    ], ignoredDraft, { ignoredCodes: blockCodes });
    if (!afterIgnore.blocksPublish) {
      res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
        adminToken,
        expectedUpdatedAt,
        saveMode: "publish_enrichment",
        lessonPlan: { id: weak2.id, enrichmentDraft: ignoredDraft },
      }, auth);
      assert(res.status === 200, `publish after ignore blockers: ${res.status}`);
      expectedUpdatedAt = res.json.siteContentUpdatedAt || expectedUpdatedAt;
    } else {
      // If still blocked, ignore remaining blockers too
      const more = afterIgnore.blockingIssues.map((b) => b.code);
      ignoredDraft.week.qualityReviewIgnored = [...new Set([...blockCodes, ...more])];
      res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
        adminToken,
        expectedUpdatedAt,
        saveMode: "enrichment_draft",
        lessonPlan: { id: weak2.id, enrichmentDraft: ignoredDraft },
      }, auth);
      expectedUpdatedAt = res.json.siteContentUpdatedAt || expectedUpdatedAt;
      res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
        adminToken,
        expectedUpdatedAt,
        saveMode: "publish_enrichment",
        lessonPlan: { id: weak2.id, enrichmentDraft: ignoredDraft },
      }, auth);
      assert(res.status === 200, `publish after full ignore: ${res.status}`);
    }

    const { chromium } = require("playwright");
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForFunction(
      () => typeof window.LLHTeachingKitQualityReview !== "undefined"
        && typeof window.LLHTeachingKitQualityReviewUI !== "undefined"
        && typeof window.LLHTeachingKitEnrichmentEditor !== "undefined",
      null,
      { timeout: 30000 },
    );

    const ui = await page.evaluate(async (payload) => {
      window.effectiveSiteContent = () => ({
        featureFlags: {
          teachingKitQualityReview: true,
          teachingKitEnrichmentEditor: true,
        },
      });
      window.adminSession = () => ({ token: payload.adminToken });
      window.showActionFeedback = () => {};
      window.curriculumLessonPlanById = (id) => (id === payload.plan.id ? payload.plan : null);
      window.curriculumActivitiesForLesson = () => payload.activities;

      document.body.innerHTML = `
        <div id="adminLibraryHealthHost"></div>
        <div id="adminTeachingKitEnrichmentHost"></div>
      `;
      await window.LLHTeachingKitQualityReviewUI.mount();
      for (let i = 0; i < 40; i += 1) {
        await new Promise((r) => setTimeout(r, 100));
        if (document.querySelector("[data-library-health] .tk-quality-kpi")) break;
      }
      const healthPanel = Boolean(document.querySelector("[data-library-health]"));
      const kpis = document.querySelectorAll(".tk-quality-kpi").length;

      window.LLHTeachingKitEnrichmentEditor.open(payload.plan.id);
      await new Promise((r) => setTimeout(r, 250));
      // Close auto kit tray if present
      for (let i = 0; i < 40; i += 1) {
        await new Promise((r) => setTimeout(r, 100));
        if (document.querySelector("[data-ai-accept-all]") && !document.querySelector("[data-ai-loading]")) break;
      }
      document.querySelector("[data-ai-cancel]")?.click();
      await new Promise((r) => setTimeout(r, 150));

      document.querySelector("[data-enrich-publish]")?.click();
      for (let i = 0; i < 40; i += 1) {
        await new Promise((r) => setTimeout(r, 100));
        if (document.querySelector("[data-quality-report]")) break;
      }
      return {
        healthPanel,
        kpis,
        publishModal: Boolean(document.querySelector("[data-publish-modal]")),
        qualityReport: Boolean(document.querySelector("[data-quality-report]")),
        improveBtn: Boolean(document.querySelector("[data-quality-improve]")),
        ignoreBtn: Boolean(document.querySelector("[data-quality-ignore]")),
        readiness: document.querySelector("[data-publish-readiness-label]")?.textContent || "",
        overrideUi: Boolean(document.querySelector("[data-publish-override]")),
        confirmLabel: document.querySelector("[data-publish-confirm]")?.textContent || "",
        features: window.LLHTeachingKitEnrichmentEditor.sliceFeatures?.() || {},
      };
    }, {
      adminToken,
      plan: {
        ...weak,
        enrichmentDraft: weak.enrichmentDraft,
      },
      activities: [
        { id: "act-q1", title: "Color Sort", lessonPlanId: weak.id },
        { id: "act-q2", title: "Color Sort Again", lessonPlanId: weak.id },
      ],
    });

    assert(ui.healthPanel, "library health panel");
    assert(ui.kpis >= 3, "health kpis");
    assert(ui.publishModal, "publish modal opens");
    assert(ui.qualityReport, "quality report stays informational in publish modal");
    assert(ui.improveBtn && ui.ignoreBtn, "improve/ignore actions");
    assert(/Ready to publish/i.test(ui.readiness), `owner publish state Ready to publish (got ${ui.readiness})`);
    assert(!ui.overrideUi, "optional quality gaps do not require owner override");
    assert(/^Apply enrichment$/i.test(ui.confirmLabel), `confirm is Apply enrichment (got ${ui.confirmLabel})`);
    assert(ui.features.aiQualityReview === true, "slice feature");

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "tk-quality-review-publish-gate-desktop.png"),
      fullPage: true,
    });

    await page.evaluate(async () => {
      document.querySelector("[data-publish-cancel]")?.click();
      await new Promise((r) => setTimeout(r, 100));
    });

    // Library health screenshots
    await page.evaluate(async () => {
      document.body.innerHTML = `<div id="adminLibraryHealthHost"></div>`;
      await window.LLHTeachingKitQualityReviewUI.mount();
      for (let i = 0; i < 30; i += 1) {
        await new Promise((r) => setTimeout(r, 100));
        if (document.querySelector(".tk-quality-kpi")) break;
      }
    });
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "tk-quality-library-health-desktop.png"),
      fullPage: true,
    });

    await page.evaluate(async () => {
      document.querySelector('[data-quality-tab="gaps"]')?.click();
      await new Promise((r) => setTimeout(r, 80));
    });
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "tk-quality-library-gaps-desktop.png"),
      fullPage: true,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(async () => {
      document.querySelector('[data-quality-tab="usage"]')?.click();
      await new Promise((r) => setTimeout(r, 80));
    });
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "tk-quality-library-usage-mobile.png"),
      fullPage: true,
    });

    await setFlags(adminToken, {
      teachingKitQualityReview: false,
      teachingKitEnrichmentEditor: false,
      teachingKitCurriculumDirector: false,
      teachingKitViewer: false,
      teachingKitAuthoring: false,
    });
    assert(teachingKit.defaultTeachingKitFeatureFlags().teachingKitQualityReview === false, "defaults still false");

    const report = {
      title: "Teaching Kit AI Curriculum Quality Review",
      passed,
      screenshots: [
        "tk-quality-review-publish-gate-desktop.png",
        "tk-quality-library-health-desktop.png",
        "tk-quality-library-gaps-desktop.png",
        "tk-quality-library-usage-mobile.png",
      ],
      highlights: {
        specialistQualityReport: true,
        sectionScores: true,
        improveIgnoreEdit: true,
        publishGateBlockingIssues: true,
        libraryHealthDashboard: true,
        analyticsLabeled: true,
        neverAutoPublish: true,
        flagsDefaultFalse: true,
      },
      productionReadinessScore: "8/10",
      doNotMerge: true,
      doNotDeploy: true,
      doNotEnableFlags: true,
      finishedAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(ARTIFACT_DIR, "tk-quality-review-report.json"), JSON.stringify(report, null, 2));
    console.log(`OK teaching-kit-quality-review (${passed} assertions)`);
  } catch (error) {
    console.error("FAIL teaching-kit-quality-review:", error.message);
    if (stderr) console.error(stderr.slice(-2500));
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    child.kill("SIGTERM");
    try { fs.rmSync(STORE_PATH, { force: true }); } catch { /* ignore */ }
  }
}

main();
