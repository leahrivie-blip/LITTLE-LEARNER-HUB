#!/usr/bin/env node
/**
 * Teaching Kit — Admin workflow + quality scoring remediation.
 *
 * Disposable fixture only: "QA — Teaching Kit Gold Standard"
 * Never touches Farm Animals or real curriculum.
 *
 * Run: npm run test:teaching-kit-admin-workflow-scoring
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const teachingKit = require("./teaching-kit.js");
const enrich = require("./teaching-kit-enrichment.js");
const quality = require("./teaching-kit-quality-review.js");
const statusApi = require("./teaching-kit-status.js");

const ROOT = path.join(__dirname, "..");
const PORT = 6520 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-tk-admin-workflow-${process.pid}.json`);
const ARTIFACT_DIR = "/opt/cursor/artifacts/tk-admin-workflow-scoring";
const FIXTURE_ID = "cur-lp-qa-tk-gold-standard-disposable";
const FIXTURE_TITLE = "QA — Teaching Kit Gold Standard";
const OWNER = {
  email: "leahivie@icloud.com",
  password: "tk-owner-workflow-pass",
  code: "tk-owner-workflow-code",
};
const OTHER_ADMIN = {
  email: "other-admin-tk@example.com",
  // Same unlock password/code as OWNER — ADMIN_EMAILS aliases share ADMIN_PASSWORD.
  password: OWNER.password,
  code: OWNER.code,
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
      ADMIN_EMAIL: OWNER.email,
      ADMIN_PASSWORD: OWNER.password,
      ADMIN_ACCESS_CODE: OWNER.code,
      ADMIN_EMAILS: `${OWNER.email},${OTHER_ADMIN.email}`,
      NODE_ENV: "test",
      LLH_ENFORCE_TK_OWNER_ADMIN: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function adminLogin(creds) {
  const res = await requestJson("POST", "/api/admin/login", {
    email: creds.email,
    password: creds.password,
    code: creds.code,
  });
  assert(res.status === 200 && (res.json?.token || res.json?.adminToken), `admin login ${creds.email}: ${res.status}`);
  return res.json.token || res.json.adminToken;
}

function thinGoldFixture() {
  return {
    id: FIXTURE_ID,
    title: FIXTURE_TITLE,
    theme: "QA Disposable",
    age: "Preschool",
    status: "draft",
    weeklyOverview: "Disposable QA fixture for Teaching Kit admin workflow scoring.",
    objectives: "Explore colors through play.",
    vocabularyWords: "gold, standard, quality",
    books: [{ title: "Title Only Book", author: "Someone" }],
    songs: [{ title: "Title Only Song" }],
    familyConnection: "Talk about the day.",
    resourceIds: [],
    weeklyMaterials: "baskets, brushes, hay",
    enrichmentDraft: {
      week: {
        weeklyOverview: "Disposable overview for scoring proof.",
        books: [{ title: "Title Only Book", author: "Someone" }],
        songs: [{ title: "Title Only Song" }],
        printableIdeas: ["Color sorting mat idea"],
        teacherToolkit: {
          teacherPreparation: "Stage trays.",
        },
      },
      activities: {
        "qa-act-1": {
          teacherTips: ["Offer two trays."],
          observationPrompts: ["Names a color?"],
          imageBriefSetup: "Low table with baskets in natural light.",
          imageBriefExample: "Child sorting colored scarves into baskets.",
        },
      },
    },
    dailyPlans: {
      monday: {
        theme: "Theme focus coming soon",
        items: [{ id: "qa-act-1", title: "Color Sort", category: "table" }],
      },
      tuesday: { theme: "Theme focus coming soon", items: [] },
      wednesday: { theme: "Theme focus coming soon", items: [] },
      thursday: { theme: "Theme focus coming soon", items: [] },
      friday: { theme: "Theme focus coming soon", items: [] },
    },
    adminOnly: true,
    excludeFromCustomerLibrary: true,
    qaDisposable: true,
  };
}

function runUnitScoringTests() {
  assert(typeof enrich.computeReadinessScores === "function", "computeReadinessScores exported");
  assert(typeof enrich.imageReadinessState === "function", "imageReadinessState exported");
  assert(teachingKit.isTeachingKitOwnerPreviewEmail(OWNER.email), "owner email allowlisted");
  assert(
    teachingKit.isTeachingKitOwnerPreviewAuthorized({
      email: OWNER.email,
      adminEmail: OWNER.email,
      hasOwnerAdminSession: true,
    }),
    "dual-gate owner authorized",
  );
  assert(
    !teachingKit.isTeachingKitOwnerPreviewAuthorized({
      email: OWNER.email,
      adminEmail: OWNER.email,
      hasOwnerAdminSession: false,
    }),
    "owner email alone is not enough",
  );
  assert(
    !teachingKit.isTeachingKitOwnerPreviewAuthorized({
      email: OTHER_ADMIN.email,
      adminEmail: OTHER_ADMIN.email,
      hasOwnerAdminSession: true,
    }),
    "other admin not authorized for owner preview",
  );

  const plan = thinGoldFixture();
  const acts = [{ id: "qa-act-1", title: "Color Sort", lessonPlanId: FIXTURE_ID }];
  const scores = enrich.computeReadinessScores(plan, acts, plan.enrichmentDraft);
  assert(scores.imageBriefsOnly >= 2, "image briefs counted separately");
  assert(scores.imageReadiness === 0, "image briefs do not raise image readiness");
  assert(scores.setupImages === 0 && scores.exampleImages === 0, "no real images");
  assert(scores.printReadiness < 50, "printable ideas alone are not print-ready");
  assert(scores.hasPrintableIdeasOnly === true, "printable ideas-only flag");
  assert(scores.completeBooks === 0, "title/author book incomplete");
  assert(scores.completeSongs === 0, "title-only song incomplete");
  assert(scores.weekdayCompleteness === 0, "placeholder weekday focus = incomplete");
  assert(scores.premiumReadinessPercent < 90, "thin kit not premium ready");

  assert(enrich.imageReadinessState("", "a brief") === "image_brief_ready", "brief state");
  assert(enrich.imageReadinessState("/media/x.png", "brief") === "image_uploaded", "url wins");
  assert(!enrich.bookRecordComplete({ title: "A", author: "B" }), "book needs guides");
  assert(!enrich.songRecordComplete({ title: "Song" }), "song needs rights + teaching");
  assert(enrich.isPlaceholderText("Theme focus coming soon"), "placeholder detector");

  const summary = enrich.buildUpgradeSummary(plan, acts, plan.enrichmentDraft);
  assert(summary.missingSetupPhotos === 1, "missing setup photos");
  assert(summary.imageBriefsNotImages >= 2, "briefs not images in summary");
  assert(summary.missingPrintables === true, "missing linked printables");
  assert(summary.needsReview === true, "needs review");
  assert(summary.premiumReadinessPercent < 90, "summary premium not ready");
  assert(!/Publish Ready/i.test(summary.dashboardStage || ""), "not Publish Ready from field fill");

  const report = quality.buildQualityReport(plan, acts, plan.enrichmentDraft);
  assert(report.blocksPublish === true, "hard blockers prevent publish");
  assert(report.publishReadiness === "blocked", "publish readiness blocked");
  assert(report.overallLabel !== "Publish ready", "do not label Publish ready");
  const codes = (report.blockingIssues || []).map((b) => b.code);
  assert(codes.includes("image_brief_not_image") || codes.includes("missing_example_images"), "image brief blocker");
  assert(codes.includes("incomplete_books") || codes.includes("missing_books"), "incomplete books blocker");
  assert(codes.includes("incomplete_songs") || codes.includes("missing_songs"), "incomplete songs blocker");
  assert(codes.includes("missing_printables"), "printables blocker");
  assert(codes.includes("missing_weekday_focus") || codes.includes("placeholder_text"), "placeholder weekday blocker");
  assert(codes.includes("incomplete_toolkit"), "incomplete toolkit blocker");
  assert((report.blockingIssues || []).some((b) => b.navigateTo), "blockers include navigateTo");

  // Real image URL raises image score; brief alone never does.
  const withImages = JSON.parse(JSON.stringify(plan));
  withImages.enrichmentDraft.activities["qa-act-1"].setupImageUrl = "/api/enrichment-media/qa-setup.png";
  withImages.enrichmentDraft.activities["qa-act-1"].exampleImageUrl = "/api/enrichment-media/qa-example.png";
  const scoredImages = enrich.computeReadinessScores(withImages, acts, withImages.enrichmentDraft);
  assert(scoredImages.imageReadiness === 100, "real images score 100 image readiness");
  assert(scoredImages.imageBriefsOnly === 0, "briefs ignored when URLs present");
  assert(scoredImages.premiumReadinessPercent > scores.premiumReadinessPercent, "premium rises with real images");

  // Complete book/song still require metadata.
  assert(enrich.bookRecordComplete({
    title: "Full Guide",
    author: "Teacher",
    whyItFits: "Matches the theme play invitations.",
    beforeReadingQuestions: ["What colors do you see?"],
    afterReadingQuestions: ["What was your favorite part?"],
  }), "complete book record");
  assert(enrich.songRecordComplete({
    title: "Color Song",
    rightsStatus: "traditional",
    motions: "Tap knees for each color word.",
    teacherDirections: "Sing slowly and invite children to join the chorus.",
  }), "complete song record");

  const workflow = statusApi.workflowStatusFromParts({
    lessonStatus: "draft",
    enrichmentFillPercent: 97,
    premiumReadinessPercent: 40,
    hasEnrichmentDraft: true,
    coverageComplete: true,
    needsReview: true,
    publishReadiness: "blocked",
  });
  assert(workflow !== "Publish Ready" && workflow !== "Published", `high structural fill is not Publish Ready (got ${workflow})`);
  assert(statusApi.WORKFLOW_STATUSES.includes("Publish Ready"), "Publish Ready status exists");
  assert(statusApi.WORKFLOW_STATUSES.includes("Draft Started"), "Draft Started status exists");
}

async function seedFixture(ownerToken) {
  const boot = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(ownerToken)}`);
  const existing = boot.json.siteContent || {};
  const curriculum = existing.curriculum || { lessonPlans: [], activities: [], resources: [] };
  const plan = thinGoldFixture();
  const activities = [{
    id: "qa-act-1",
    title: "Color Sort",
    lessonPlanId: FIXTURE_ID,
    category: "table",
  }];
  // Keep a sentinel "real" lesson to prove it is never mutated.
  const farmSentinel = {
    id: "cur-lp-farm-animals-sentinel-readonly",
    title: "Farm Animals",
    status: "published",
    theme: "Farm",
    enrichmentDraft: { week: { note: "DO_NOT_TOUCH" }, activities: {} },
    fingerprint: "farm-sentinel-v1",
  };
  const nextCurriculum = {
    ...curriculum,
    lessonPlans: [
      ...(curriculum.lessonPlans || []).filter((p) => p.id !== FIXTURE_ID && p.id !== farmSentinel.id),
      plan,
      farmSentinel,
    ],
    activities: [
      ...(curriculum.activities || []).filter((a) => a.lessonPlanId !== FIXTURE_ID),
      ...activities,
    ],
  };
  const save = await requestJson("POST", "/api/admin/site-content", {
    adminToken: ownerToken,
    expectedUpdatedAt: existing.updatedAt || boot.json.siteContentUpdatedAt,
    siteContent: {
      ...existing,
      curriculum: nextCurriculum,
      featureFlags: {
        ...(existing.featureFlags || {}),
        teachingKitEnrichmentEditor: true,
        teachingKitQualityReview: true,
        teachingKitAiAssist: true,
        teachingKitViewer: false,
        teachingKitPrintCenter: false,
        teachingKitAttachments: false,
      },
    },
  }, { Authorization: `Bearer ${ownerToken}` });
  assert(save.status === 200, `seed fixture: ${save.status} ${save.text?.slice(0, 200)}`);
  return {
    updatedAt: save.json.siteContent?.updatedAt || save.json.siteContentUpdatedAt,
    plan,
    activities,
    farmSentinel,
  };
}

async function removeFixture(ownerToken) {
  const boot = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(ownerToken)}`);
  const existing = boot.json.siteContent || {};
  const curriculum = existing.curriculum || { lessonPlans: [], activities: [], resources: [] };
  const save = await requestJson("POST", "/api/admin/site-content", {
    adminToken: ownerToken,
    expectedUpdatedAt: existing.updatedAt || boot.json.siteContentUpdatedAt,
    siteContent: {
      ...existing,
      curriculum: {
        ...curriculum,
        lessonPlans: (curriculum.lessonPlans || []).filter((p) => p.id !== FIXTURE_ID),
        activities: (curriculum.activities || []).filter((a) => a.lessonPlanId !== FIXTURE_ID),
      },
    },
  }, { Authorization: `Bearer ${ownerToken}` });
  assert(save.status === 200, `remove fixture: ${save.status}`);
  const after = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(ownerToken)}`);
  const ids = (after.json.siteContent?.curriculum?.lessonPlans || []).map((p) => p.id);
  assert(!ids.includes(FIXTURE_ID), "disposable fixture removed safely");
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  runUnitScoringTests();

  const child = startServer();
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  let browser = null;

  try {
    await waitForHealth(child);
    const ownerToken = await adminLogin(OWNER);
    const otherToken = await adminLogin(OTHER_ADMIN);
    const seeded = await seedFixture(ownerToken);
    const farmBefore = JSON.stringify(
      (await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(ownerToken)}`))
        .json.siteContent?.curriculum?.lessonPlans
        ?.find((p) => p.id === "cur-lp-farm-animals-sentinel-readonly"),
    );

    // Other admin cannot hit AI / quality / enrichment draft.
    const aiDenied = await requestJson("POST", "/api/admin/curriculum/enrichment-ai-suggest", {
      adminToken: otherToken,
      planId: FIXTURE_ID,
      scope: "lesson",
      simulate: "fixture",
    }, { Authorization: `Bearer ${otherToken}` });
    assert(aiDenied.status === 403, `other admin AI denied: ${aiDenied.status}`);
    assert(aiDenied.json?.code === "teaching_kit_owner_required", "owner_required code on AI");

    const qrDenied = await requestJson("POST", "/api/admin/curriculum/quality-review", {
      adminToken: otherToken,
      action: "review_lesson",
      planId: FIXTURE_ID,
    }, { Authorization: `Bearer ${otherToken}` });
    assert(qrDenied.status === 403, `other admin quality denied: ${qrDenied.status}`);

    const draftDenied = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken: otherToken,
      saveMode: "enrichment_draft",
      expectedUpdatedAt: seeded.updatedAt,
      lessonPlan: {
        id: FIXTURE_ID,
        enrichmentDraft: { week: { familyConnection: "Should not save" }, activities: {} },
      },
    }, { Authorization: `Bearer ${otherToken}` });
    assert(draftDenied.status === 403, `other admin draft denied: ${draftDenied.status}`);

    // Customer Teaching Kit still disabled.
    const customerTk = await requestJson("GET", `/api/curriculum/lesson-plans/${FIXTURE_ID}/teaching-kit`);
    assert(customerTk.status === 404, "customer TK disabled for fixture");

    // Owner quality review via API.
    const qr = await requestJson("POST", "/api/admin/curriculum/quality-review", {
      adminToken: ownerToken,
      action: "review_lesson",
      planId: FIXTURE_ID,
    }, { Authorization: `Bearer ${ownerToken}` });
    assert(qr.status === 200, `owner quality review: ${qr.status} ${qr.text?.slice(0, 180)}`);
    assert(qr.json?.report?.blocksPublish === true, "API report blocks publish");
    assert(qr.json?.report?.premiumReadinessPercent < 90, "API premium readiness low");

    // Playwright: opening editor makes zero AI calls.
    const { chromium } = require("playwright");
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    let aiCallCount = 0;
    await page.route("**/api/admin/curriculum/enrichment-ai-suggest**", async (route) => {
      aiCallCount += 1;
      await route.continue();
    });

    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(
      () => typeof window.LLHTeachingKitEnrichmentEditor !== "undefined"
        && typeof window.LLHTeachingKitEnrichment !== "undefined"
        && typeof window.LLHTeachingKitQualityReview !== "undefined",
      null,
      { timeout: 30000 },
    );

    const openResult = await page.evaluate(async (payload) => {
      window.__aiFetchCount = 0;
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (url, opts) => {
        if (String(url).includes("enrichment-ai-suggest")) window.__aiFetchCount += 1;
        return originalFetch(url, opts);
      };
      window.effectiveSiteContent = () => ({
        featureFlags: {
          teachingKitEnrichmentEditor: true,
          teachingKitQualityReview: true,
          teachingKitAiAssist: true,
          teachingKitViewer: false,
        },
      });
      window.adminSession = () => ({ token: payload.ownerToken, email: payload.ownerEmail });
      window.curriculumLessonPlanById = (id) => (id === payload.plan.id ? payload.plan : null);
      window.curriculumActivitiesForLesson = (id) => (
        id === payload.plan.id ? payload.activities : []
      );
      window.showActionFeedback = () => {};
      const host = document.createElement("div");
      host.id = "adminTeachingKitEnrichmentHost";
      document.body.innerHTML = "";
      document.body.appendChild(host);

      window.LLHTeachingKitEnrichmentEditor.open(payload.plan.id);
      await new Promise((r) => setTimeout(r, 400));
      // Refresh / tab switches should not AI.
      window.LLHTeachingKitEnrichmentEditor.render?.();
      document.querySelector('[data-enrich-mode="week"]')?.click();
      await new Promise((r) => setTimeout(r, 120));
      document.querySelector('[data-enrich-mode="activities"]')?.click();
      await new Promise((r) => setTimeout(r, 120));
      document.querySelector('[data-enrich-mode="preview"]')?.click();
      await new Promise((r) => setTimeout(r, 120));

      const summary = window.LLHTeachingKitEnrichment.buildUpgradeSummary(
        payload.plan,
        payload.activities,
        window.LLHTeachingKitEnrichmentEditor.getDraft(),
      );
      const report = window.LLHTeachingKitQualityReview.buildQualityReport(
        payload.plan,
        payload.activities,
        window.LLHTeachingKitEnrichmentEditor.getDraft(),
      );
      return {
        aiFetchCount: window.__aiFetchCount,
        trayOpen: Boolean(document.querySelector("[data-ai-tray]")),
        statusText: document.querySelector(".tk-enrich-status")?.textContent || "",
        prepareCta: Boolean(document.querySelector('[data-ai-suggest="lesson"]')),
        completionLabel: document.querySelector(".tk-enrich-percent-row strong")?.textContent || "",
        readinessLabel: document.querySelector("[data-premium-readiness-chrome]")?.textContent || "",
        workflow: document.querySelector("[data-workflow-status-chrome]")?.textContent || "",
        premium: summary.premiumReadinessPercent,
        structural: summary.completionPercent,
        imageBriefs: summary.imageBriefsNotImages,
        blocksPublish: report.blocksPublish,
        overallLabel: report.overallLabel,
        hardBlockers: (report.blockingIssues || []).map((b) => b.code),
      };
    }, {
      plan: seeded.plan,
      activities: seeded.activities,
      ownerToken,
      ownerEmail: OWNER.email,
    });

    assert(openResult.aiFetchCount === 0, `open causes zero AI fetch (got ${openResult.aiFetchCount})`);
    assert(aiCallCount === 0, `route saw zero AI calls (got ${aiCallCount})`);
    assert(openResult.trayOpen === false, "AI tray not open after editor open");
    assert(openResult.prepareCta, "Prepare AI Draft CTA present");
    assert(/never starts AI|Local analysis|Prepare AI Draft/i.test(openResult.statusText), `status explains no auto AI: ${openResult.statusText}`);
    assert(openResult.imageBriefs >= 2, "UI summary tracks image briefs");
    assert(openResult.blocksPublish === true, "hard blockers in browser report");
    assert(!/Publish ready/i.test(openResult.overallLabel || ""), "not falsely Publish ready");
    assert(openResult.premium < 90, "premium readiness not 100 from briefs");

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "admin-workflow-desktop.png"),
      fullPage: true,
    });

    // Confirm cancel → no AI.
    const cancelResult = await page.evaluate(async () => {
      window.__aiFetchCount = 0;
      window.confirm = () => false;
      await window.LLHTeachingKitEnrichmentEditor.requestAiSuggestions({ scope: "lesson", simulate: "fixture" });
      await new Promise((r) => setTimeout(r, 200));
      return {
        aiFetchCount: window.__aiFetchCount,
        trayOpen: Boolean(document.querySelector("[data-ai-tray]")),
        statusText: document.querySelector(".tk-enrich-status")?.textContent || "",
      };
    });
    assert(cancelResult.aiFetchCount === 0, "cancel confirm → zero AI");
    assert(cancelResult.trayOpen === false, "cancel does not open tray");
    assert(/canceled|cancelled|unchanged/i.test(cancelResult.statusText), "cancel status");

    // Explicit confirm → exactly one AI run.
    const confirmResult = await page.evaluate(async () => {
      window.__aiFetchCount = 0;
      let confirms = 0;
      window.confirm = () => {
        confirms += 1;
        return true;
      };
      const p1 = window.LLHTeachingKitEnrichmentEditor.requestAiSuggestions({
        scope: "lesson",
        simulate: "fixture",
      });
      // Double-click guard: second call while loading should not start another full run.
      const p2 = window.LLHTeachingKitEnrichmentEditor.requestAiSuggestions({
        scope: "lesson",
        simulate: "fixture",
      });
      await Promise.all([p1, p2]);
      for (let i = 0; i < 50; i += 1) {
        await new Promise((r) => setTimeout(r, 100));
        if (document.querySelector("[data-ai-review-list], [data-ai-error], [data-ai-accept-all]")) break;
      }
      return {
        confirms,
        aiFetchCount: window.__aiFetchCount,
        trayOpen: Boolean(document.querySelector("[data-ai-tray]")),
        cards: document.querySelectorAll("[data-ai-card]").length,
      };
    });
    assert(confirmResult.confirms >= 1, "confirm dialog shown");
    assert(confirmResult.aiFetchCount === 1, `exactly one AI request after confirm (got ${confirmResult.aiFetchCount})`);
    assert(confirmResult.trayOpen === true, "tray opens after confirmed AI");

    // Close proposal without accept — draft unchanged from accepted AI.
    await page.evaluate(async () => {
      document.querySelector("[data-ai-cancel]")?.click();
      await new Promise((r) => setTimeout(r, 100));
    });
    const afterClose = await page.evaluate(() => {
      const draft = window.LLHTeachingKitEnrichmentEditor.getDraft();
      return {
        trayOpen: Boolean(document.querySelector("[data-ai-tray]")),
        hasAcceptedWeekOverview: Boolean(draft?.week?.weeklyOverview && draft.week.weeklyOverview.length > 80),
      };
    });
    assert(afterClose.trayOpen === false, "closing proposal closes tray");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "admin-workflow-mobile.png"),
      fullPage: true,
    });

    // Farm Animals sentinel unchanged.
    const farmAfter = JSON.stringify(
      (await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(ownerToken)}`))
        .json.siteContent?.curriculum?.lessonPlans
        ?.find((p) => p.id === "cur-lp-farm-animals-sentinel-readonly"),
    );
    assert(farmBefore === farmAfter, "Farm Animals sentinel unchanged");

    // Safe fixture removal.
    await removeFixture(ownerToken);

    const resultsPath = path.join(ARTIFACT_DIR, "RESULTS.txt");
    fs.writeFileSync(resultsPath, [
      `PASS ${passed}`,
      `Fixture: ${FIXTURE_TITLE} (${FIXTURE_ID}) removed after tests`,
      "Farm Animals sentinel unchanged",
      "Customer Teaching Kit flags remain off",
      `Desktop: ${path.join(ARTIFACT_DIR, "admin-workflow-desktop.png")}`,
      `Mobile: ${path.join(ARTIFACT_DIR, "admin-workflow-mobile.png")}`,
    ].join("\n"));

    console.log(`PASS ${passed} teaching-kit-admin-workflow-scoring`);
  } catch (error) {
    console.error("FAIL", error.message || error);
    if (stderr) console.error(stderr.slice(-2000));
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    child.kill("SIGTERM");
    fs.rmSync(STORE_PATH, { force: true });
  }
}

main();
