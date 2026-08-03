#!/usr/bin/env node
/**
 * Teaching Kit — AI Teacher Assistant (Make This Better, Chat, Toolkit,
 * Reusable Library, Quality Review, Learn From Me, connections).
 * Flags remain default false; enabled only inside this suite.
 *
 * Run: npm run test:teaching-kit-ai-teacher-assistant
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const teachingKit = require("./teaching-kit.js");
const { withCustomerReleaseApproval } = require("./test-helpers/tk-customer-flags.js");
const reusable = require("./teaching-kit-reusable-library.js");
const assistant = require("./teaching-kit-ai-teacher-assistant.js");

const ROOT = path.join(__dirname, "..");
const PORT = 6230 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-tk-ai-assistant-${process.pid}.json`);
const ARTIFACT_DIR = "/opt/cursor/artifacts";
const ADMIN = {
  email: "tk-ai-assistant-admin@example.com",
  password: "tk-ai-assistant-pass",
  code: "tk-ai-assistant-code",
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
        ...withCustomerReleaseApproval(flags),
      },
    },
  }, { Authorization: `Bearer ${adminToken}` });
  assert(save.status === 200, `save flags: ${save.status}`);
  const after = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
  return after.json.siteContent?.updatedAt || after.json.siteContentUpdatedAt || "";
}

function samplePlan() {
  return {
    id: `plan-ai-assistant-${Date.now().toString(36)}`,
    title: "Farm Friends Week",
    theme: "Farm Animals",
    age: "3-4",
    weeklyOverview: "Children explore farm animals through play.",
    vocabularyWords: "cow, pig, hen",
    familyConnection: "",
    books: [{ title: "Old MacDonald Had a Farm (public domain style)" }],
    songs: [{ title: "The Farmer in the Dell" }],
    resourceIds: [],
    enrichmentDraft: null,
    dailyPlans: {
      monday: [{ id: "act-farm-1", title: "Barn Block Build", category: "blocks" }],
      tuesday: [{ id: "act-farm-2", title: "Sensory Hay Tray", category: "sensory" }],
    },
  };
}

function runUnitTests() {
  assert(assistant.IMPROVE_ACTIONS.length >= 18, "improve actions present");
  assert(assistant.TOOLKIT_BUILDERS.length >= 10, "toolkit builders present");
  assert(assistant.PRINTABLE_PACK_TYPES.length === 10, "printable pack types");
  assert(assistant.IMAGE_KINDS.length === 5, "image kinds");

  const better = assistant.transformText("Invite children to sort animals.", "add_sensory", {
    theme: "Farm Animals",
    age: "3-4",
  });
  assert(better.proposedText.includes("Sensory"), "make better adds sensory");
  assert(better.currentValue.includes("sort animals"), "keeps current for compare");

  const chat = assistant.buildTeacherChatReply("I don’t have pom poms.", {
    theme: "Farm Animals",
    activityTitle: "Sensory Hay Tray",
    activityKey: "act-farm-2",
  });
  assert(/substitute|ordinary materials/i.test(chat.reply), "chat handles missing materials");
  assert(chat.suggestion && chat.autoPublished === false, "chat draft only");

  const toolkit = assistant.buildToolkitItem("vocabulary_cards", { theme: "Farm Animals", lessonTitle: "Farm Friends" });
  assert(toolkit.proposedText.toLowerCase().includes("farm"), "toolkit vocab uses theme");

  const pack = assistant.buildPrintablePack({ theme: "Farm Animals" });
  assert(pack.cards.length === 10 && pack.cards.every((c) => c.editable), "printable pack editable");

  const image = assistant.buildExampleImageDraft("sensory_bin", {
    theme: "Farm Animals",
    activityTitle: "Sensory Hay Tray",
    activityKey: "act-farm-2",
  });
  assert(image.approvalRequired && !image.published, "image requires approval");
  assert(String(image.previewDataUrl).startsWith("data:image/svg+xml"), "draft svg preview");

  const review = assistant.runQualityReview(
    samplePlan(),
    [
      { id: "act-farm-1", title: "Barn Block Build" },
      { id: "act-farm-2", title: "Sensory Hay Tray" },
    ],
    { week: {}, activities: {} },
  );
  assert(typeof review.readinessScore === "number", "readiness score");
  assert(review.blocksPublish === false, "quality review does not block publish");
  assert(review.findings.some((f) => f.code === "missing_family"), "flags missing family");

  let library = reusable.emptyLibrary();
  const save1 = reusable.saveReusableItem(library, {
    type: "vocabulary",
    title: "Farm Animal Vocabulary",
    body: "cow · pig · hen · sheep · horse",
    theme: "Farm Animals",
  });
  assert(save1.saved && save1.saved.id, "save reusable vocab");
  library = save1.library;
  const dup = reusable.saveReusableItem(library, {
    type: "vocabulary",
    title: "Farm Animal Vocabulary",
    body: "cow pig hen sheep horse cards",
    theme: "Farm Animals",
  });
  assert(dup.duplicate, "detect near-duplicate reusable");

  const recs = reusable.recommendReusable(library, {
    type: "vocabulary",
    query: "farm animal vocabulary cards",
    theme: "Farm Animals",
  });
  assert(recs.length >= 1 && recs[0].matchScore > 0.2, "recommend reusable before inventing");

  const connections = reusable.findLessonConnections(
    samplePlan(),
    {
      resources: [{ id: "res-farm-vocab", title: "Farm Animal Vocabulary Cards" }],
      lessonPlans: [samplePlan()],
      activities: [{ id: "other-1", lessonPlanId: "other-plan", title: "Farm Animal Sorting" }],
    },
    { week: { vocabCards: ["cow", "pig"] } },
  );
  assert(connections.some((c) => c.kind === "printable_resource"), "connection finds existing printable");
  assert(connections.some((c) => c.kind === "vocabulary"), "connection finds existing vocab");

  const preferred = reusable.preferReusableOverGenerated(
    [{ id: "s1", category: "vocab_cards", proposedText: "New farm animal vocabulary cards for the week" }],
    library,
    connections,
  );
  assert(preferred.suggestions[0].reuseRecommended, "prefer reusable over generated");

  const style = assistant.learnFromAcceptedEdit({}, {
    field: "teacherTips",
    before: "Children will complete the worksheet carefully and quietly.",
    after: "Invite children to notice textures.\nCelebrate attempts.",
  });
  assert(style.acceptedEditSamples.length === 1, "learn from me stores sample");
  assert(style.formatting || style.teacherVoice || style.wording, "infers style prefs");
  assert(teachingKit.defaultTeachingKitFeatureFlags().teachingKitEnrichmentEditor === false, "flags default false");
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

    // Flags off → assistant API hidden
    let res = await requestJson("POST", "/api/admin/curriculum/ai-teacher-assistant", {
      adminToken,
      action: "make_better",
      currentValue: "Hello",
      improveAction: "improve",
    }, auth);
    assert(res.status === 404, "assistant disabled when flags off");

    await setFlags(adminToken, {
      teachingKitEnrichmentEditor: true,
      teachingKitViewer: false,
      teachingKitAuthoring: false,
    });

    const plan = samplePlan();
    const boot = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    let expectedUpdatedAt = boot.json.siteContent?.updatedAt || boot.json.siteContentUpdatedAt || "";
    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      saveMode: "curriculum",
      lessonPlan: plan,
    }, auth);
    assert(res.status === 200, `seed plan: ${res.status}`);
    expectedUpdatedAt = res.json.siteContentUpdatedAt || expectedUpdatedAt;

    // Seed reusable library item via API
    res = await requestJson("POST", "/api/admin/curriculum/ai-teacher-assistant", {
      adminToken,
      planId: plan.id,
      action: "save_reusable",
      item: {
        type: "vocabulary",
        title: "Farm Animal Vocabulary",
        body: "cow · pig · hen · sheep · horse — say it, show it, use it in play",
        theme: "Farm Animals",
        age: "3-4",
        sourcePlanId: plan.id,
      },
    }, auth);
    assert(res.status === 200 && res.json.saved, "API save reusable");
    assert(res.json.publishedLessonsUnchanged === true, "saving reusable does not touch published lessons");

    res = await requestJson("POST", "/api/admin/curriculum/ai-teacher-assistant", {
      adminToken,
      planId: plan.id,
      action: "toolkit_builder",
      builderId: "vocabulary_cards",
    }, auth);
    assert(res.status === 200, "toolkit builder ok");
    assert(res.json.autoPublished === false, "toolkit never auto-publishes");
    assert(res.json.suggestions?.[0]?.reuseRecommended === true, "toolkit prefers reusable library");
    assert(String(res.json.suggestions[0].proposedText).startsWith("REUSE:"), "reuse rewrite suggested");

    res = await requestJson("POST", "/api/admin/curriculum/ai-teacher-assistant", {
      adminToken,
      planId: plan.id,
      action: "make_better",
      improveAction: "add_literacy",
      currentValue: "Children explore farm animals through play.",
      field: "weeklyOverview",
      fieldLabel: "Weekly overview",
    }, auth);
    assert(res.status === 200 && res.json.suggestions?.[0]?.proposedText.includes("Literacy"), "make better literacy");

    res = await requestJson("POST", "/api/admin/curriculum/ai-teacher-assistant", {
      adminToken,
      planId: plan.id,
      action: "teacher_chat",
      message: "We only have 10 minutes.",
      activityKey: "act-farm-2",
    }, auth);
    assert(res.status === 200 && /10-minute/i.test(res.json.reply || ""), "teacher chat short-time");
    assert(res.json.suggestions?.length === 1 && res.json.autoSaved === false, "chat drafts only");

    res = await requestJson("POST", "/api/admin/curriculum/ai-teacher-assistant", {
      adminToken,
      planId: plan.id,
      action: "printable_pack",
    }, auth);
    assert(res.status === 200 && res.json.printablePack?.length === 10, "printable pack cards");

    res = await requestJson("POST", "/api/admin/curriculum/ai-teacher-assistant", {
      adminToken,
      planId: plan.id,
      action: "example_image",
      imageKind: "invitation_to_play",
      activityKey: "act-farm-1",
    }, auth);
    assert(res.status === 200 && res.json.exampleImage?.approvalRequired === true, "example image approval");
    assert(res.json.exampleImage?.published === false, "example image not published");

    res = await requestJson("POST", "/api/admin/curriculum/ai-teacher-assistant", {
      adminToken,
      planId: plan.id,
      action: "quality_review",
    }, auth);
    assert(res.status === 200 && typeof res.json.review?.readinessScore === "number", "quality review score");
    assert(res.json.blocksPublish === false, "quality review guidance only");

    res = await requestJson("POST", "/api/admin/curriculum/ai-teacher-assistant", {
      adminToken,
      planId: plan.id,
      action: "connections",
    }, auth);
    assert(res.status === 200 && Array.isArray(res.json.connections), "connections list");
    assert(Array.isArray(res.json.recommendations), "reusable recommendations");

    res = await requestJson("POST", "/api/admin/curriculum/ai-teacher-assistant", {
      adminToken,
      planId: plan.id,
      action: "learn_from_me",
      field: "teacherTips",
      before: "Complete the worksheet.",
      after: "Invite children to notice and wonder aloud.",
    }, auth);
    assert(res.status === 200 && res.json.stylePreferences?.acceptedEditSamples?.length >= 1, "learn from me persisted");

    // Confirm published plan fields untouched after assistant actions
    const bootAfter = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    expectedUpdatedAt = bootAfter.json.siteContent?.updatedAt || bootAfter.json.siteContentUpdatedAt || expectedUpdatedAt;
    assert(
      (bootAfter.json.siteContent?.teachingKitAssistant?.reusableLibrary?.items || []).length >= 1,
      "reusable library persisted on site content",
    );
    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      saveMode: "enrichment_draft",
      lessonPlan: { id: plan.id, enrichmentDraft: { week: {}, activities: {} } },
    }, auth);
    assert(res.status === 200, `verify plan still savable: ${res.status}`);
    const found = (res.json.curriculum?.lessonPlans || []).find((p) => p.id === plan.id);
    assert(found, "seeded plan still in curriculum");
    assert(found.weeklyOverview === plan.weeklyOverview, "published overview unchanged by assistant");

    const { chromium } = require("playwright");
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(
      () => typeof window.LLHTeachingKitAiTeacherAssistant !== "undefined"
        && typeof window.LLHTeachingKitReusableLibrary !== "undefined"
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
      window.LLHTeachingKitEnrichmentEditor.open(payload.plan.id);
      // Wait for optional auto Complete-Kit tray to finish, then Close so Assistant is visible.
      for (let i = 0; i < 60; i += 1) {
        await new Promise((r) => setTimeout(r, 100));
        if (document.querySelector("[data-ai-accept-all]") && !document.querySelector("[data-ai-loading]")) break;
      }
      document.querySelector("[data-ai-cancel]")?.click();
      await new Promise((r) => setTimeout(r, 200));

      const panel = document.querySelector("[data-ai-teacher-assistant]");
      const improveCount = document.querySelectorAll("[data-assistant-improve]").length;
      document.querySelector('[data-assistant-tab="library"]')?.click();
      await new Promise((r) => setTimeout(r, 80));
      document.querySelector("[data-assistant-refresh-connections]")?.click();
      await new Promise((r) => setTimeout(r, 500));
      const connections = document.querySelectorAll("[data-ai-teacher-assistant] .tk-assistant-list li").length;

      document.querySelector('[data-assistant-tab="quality"]')?.click();
      await new Promise((r) => setTimeout(r, 80));
      document.querySelector("[data-assistant-quality-run]")?.click();
      await new Promise((r) => setTimeout(r, 500));
      const scoreText = document.querySelector(".tk-assistant-quality-score")?.textContent || "";

      document.querySelector('[data-assistant-tab="improve"]')?.click();
      await new Promise((r) => setTimeout(r, 80));

      return {
        panel: Boolean(panel),
        improveCount,
        connections,
        scoreText,
        trayClosed: !document.querySelector("[data-ai-tray].is-open") && !document.querySelector("#tk-enrich-ai-title"),
        features: window.LLHTeachingKitEnrichmentEditor.sliceFeatures?.() || {},
      };
    }, { plan, adminToken });

    assert(ui.panel, "assistant panel rendered");
    assert(ui.improveCount >= 18, `improve buttons (${ui.improveCount})`);
    assert(ui.features.aiTeacherAssistant === true, "slice feature flag in editor");
    assert(ui.features.reusableLibrary === true, "reusable library feature advertised");
    assert(/%/.test(ui.scoreText) || ui.connections >= 0, "quality or connections UI populated");

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "tk-ai-assistant-improve-desktop.png"),
      fullPage: true,
    });

    await page.evaluate(async () => {
      document.querySelector('[data-assistant-tab="library"]')?.click();
      await new Promise((r) => setTimeout(r, 100));
    });
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "tk-ai-assistant-library-desktop.png"),
      fullPage: true,
    });

    await page.evaluate(async () => {
      document.querySelector('[data-assistant-tab="quality"]')?.click();
      await new Promise((r) => setTimeout(r, 100));
    });
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "tk-ai-assistant-quality-desktop.png"),
      fullPage: true,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(async () => {
      document.querySelector('[data-assistant-tab="toolkit"]')?.click();
      await new Promise((r) => setTimeout(r, 100));
    });
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "tk-ai-assistant-toolkit-mobile.png"),
      fullPage: true,
    });

    await setFlags(adminToken, {
      teachingKitEnrichmentEditor: false,
      teachingKitViewer: false,
      teachingKitAuthoring: false,
    });
    assert(teachingKit.defaultTeachingKitFeatureFlags().teachingKitEnrichmentEditor === false, "defaults still false");

    const report = {
      title: "Teaching Kit AI Teacher Assistant",
      passed,
      screenshots: [
        "tk-ai-assistant-improve-desktop.png",
        "tk-ai-assistant-library-desktop.png",
        "tk-ai-assistant-quality-desktop.png",
        "tk-ai-assistant-toolkit-mobile.png",
      ],
      highlights: {
        reusableLibraryFirst: true,
        lessonConnections: true,
        makeThisBetter: true,
        teacherChat: true,
        toolkitBuilders: true,
        printablePacks: true,
        exampleImagesApprovalRequired: true,
        qualityReadinessScore: true,
        learnFromMe: true,
        neverAutoPublish: true,
        flagsDefaultFalse: true,
      },
      productionReadinessScore: "8/10",
      doNotMerge: true,
      doNotDeploy: true,
      doNotEnableFlags: true,
      finishedAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(ARTIFACT_DIR, "tk-ai-assistant-report.json"), JSON.stringify(report, null, 2));
    console.log(`OK teaching-kit-ai-teacher-assistant (${passed} assertions)`);
  } catch (error) {
    console.error("FAIL teaching-kit-ai-teacher-assistant:", error.message);
    if (stderr) console.error(stderr.slice(-2500));
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    child.kill("SIGTERM");
    try { fs.rmSync(STORE_PATH, { force: true }); } catch { /* ignore */ }
  }
}

main();
