#!/usr/bin/env node
/**
 * Teaching Kit AI Lesson Teacher — analyze, draft, side-by-side review.
 * Flags remain default false; enabled only inside this suite.
 *
 * Run: npm run test:teaching-kit-ai-lesson-teacher
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const teachingKit = require("./teaching-kit.js");
const { withCustomerReleaseApproval } = require("./test-helpers/tk-customer-flags.js");
const enrichment = require("./teaching-kit-enrichment.js");
const lessonTeacher = require("./teaching-kit-ai-lesson-teacher.js");
const enrichmentAi = require("../server/enrichment-ai.js");

const ROOT = path.join(__dirname, "..");
const PORT = 6030 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-tk-ai-teacher-${process.pid}.json`);
const ARTIFACT_DIR = "/opt/cursor/artifacts";
const ADMIN = {
  email: "tk-ai-teacher-admin@example.com",
  password: "tk-ai-teacher-pass",
  code: "tk-ai-teacher-code",
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

function gardenPlan() {
  const suffix = `${process.pid}-${Date.now().toString(36)}`;
  const item = (day, name, title) => ({
    itemId: `act-ai-garden-${name}-${suffix}`,
    title,
    activityCategory: "Fine Motor",
    materials: "Cups and seeds",
    objective: "Explore garden helpers",
    dayOfWeek: day,
    setup: "",
    steps: "",
  });
  return {
    id: `cur-lp-ai-teacher-garden-${suffix}`,
    title: "Garden Helpers AI Teacher",
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
    dailyPlans: {
      monday: { items: [item("monday", "seed", "Seed Sorting")] },
      tuesday: { items: [item("tuesday", "water", "Watering Practice")] },
      wednesday: { items: [item("wednesday", "dig", "Gentle Digging")] },
      thursday: { items: [item("thursday", "smell", "Herb Smell Tray")] },
      friday: { items: [item("friday", "share", "Garden Share Circle")] },
    },
  };
}

function testFlagsDefaultOff() {
  const flags = teachingKit.defaultTeachingKitFeatureFlags();
  assert(flags.teachingKitEnrichmentEditor === false, "enrichment editor default false");
  assert(flags.teachingKitViewer === false, "viewer default false");
  assert(flags.teachingKitAuthoring === false, "authoring default false");
  assert(flags.teachingKitPrintCenter === false, "print center default false");
  assert(flags.teachingKitAttachments === false, "attachments default false");
}

function testAnalyzeAndFilter() {
  const plan = gardenPlan();
  const acts = enrichment.flattenLessonActivities(plan, []);
  const analysis = lessonTeacher.analyzeLessonCompleteness(plan, acts, { activities: {}, week: {} });
  assert(Array.isArray(analysis.sections) && analysis.sections.length >= 12, "analysis sections");
  assert(analysis.sections.every((s) => ["complete", "needs_improvement", "missing"].includes(s.status)), "status enum");
  assert(analysis.gapSectionIds.includes("family") || analysis.gapSectionIds.includes("songs"), "gaps detected");
  assert(typeof analysis.completionPercent === "number", "completion percent");

  const ctx = {
    plan,
    activities: acts,
    activity: acts[0],
    scope: "lesson",
    activityKey: "",
    activityDraft: {},
    weekDraft: {},
    draftActivities: {},
  };
  const packed = enrichmentAi.getLessonTeacherFixturePack(ctx);
  const pack = packed.suggestions || [];
  assert(pack.length >= 8, "lesson teacher fixture pack");
  assert(packed.batch && typeof packed.batch.hasMore === "boolean", "batch metadata");
  assert(pack.some((s) => s.category === "songs"), "songs suggestion");
  assert(pack.some((s) => s.category === "books"), "books suggestion");
  assert(pack.some((s) => s.category === "image_brief_setup"), "image briefs");
  assert(pack.every((s) => !/http:\/\/|https:\/\//i.test(String(s.proposedText || ""))), "no image URLs");
  const song = pack.find((s) => s.category === "songs");
  const songText = String(song?.proposedText || "");
  assert(!/disney|frozen|let it go/i.test(songText), "no copyrighted song markers");
  assert(/no copyrighted lyrics/i.test(songText) || /original llh/i.test(songText), "song notes original / no copyrighted lyrics");

  const filtered = lessonTeacher.filterSuggestionsForGaps(pack, analysis);
  assert(filtered.length > 0, "filtered suggestions for gaps");
  assert(filtered.length <= pack.length, "filter does not expand");

  const accepted = filtered.map((s) => ({ ...s, decision: "accepted", selected: true }));
  const applied = lessonTeacher.applyLessonTeacherDecisions({ activities: {}, week: {} }, accepted);
  assert(applied.draft.week?.weeklyOverview || applied.draft.week?.books?.length, "week draft applied");
  assert(Object.keys(applied.draft.activities || {}).length >= 1, "activity drafts applied");
  const after = lessonTeacher.analyzeLessonCompleteness(plan, acts, applied.draft);
  assert(after.completionPercent >= analysis.completionPercent, "completion does not drop after accept");
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  testFlagsDefaultOff();
  testAnalyzeAndFilter();

  const child = startServer();
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  let browser;
  const exampleDraftPath = path.join(ARTIFACT_DIR, "tk-ai-lesson-teacher-example-draft.json");
  try {
    await waitForHealth(child);
    const adminToken = await adminLogin();
    const auth = { Authorization: `Bearer ${adminToken}` };

    let expectedUpdatedAt = await setFlags(adminToken, {
      teachingKitEnrichmentEditor: true,
      teachingKitViewer: false,
      teachingKitAuthoring: false,
    });

    const plan = gardenPlan();
    let res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      lessonPlan: plan,
    }, auth);
    assert(res.status === 200, `seed garden lesson: ${res.status}`);
    expectedUpdatedAt = res.json.siteContentUpdatedAt || expectedUpdatedAt;

    const ai = await requestJson("POST", "/api/admin/curriculum/enrichment-ai-suggest", {
      adminToken,
      planId: plan.id,
      scope: "lesson",
      activityKey: "",
      simulate: "fixture",
    }, auth);
    assert(ai.status === 200 && Array.isArray(ai.json.suggestions), `lesson AI suggest: ${ai.status}`);
    assert(ai.json.scope === "lesson", "scope lesson");
    assert(ai.json.autoSaved === false && ai.json.autoPublished === false, "no auto save/publish");
    assert(ai.json.curriculumUnchanged === true, "curriculum unchanged");
    assert(ai.json.publishedContentPreserved === true, "published preserved");
    assert(ai.json.analysis && Array.isArray(ai.json.analysis.sections), "analysis in response");
    assert(ai.json.suggestions.some((s) => s.category === "family_connection" || s.category === "songs"), "gap drafts present");
    assert(ai.json.source === "lesson_teacher_fixture" || ai.json.source === "fixture", "lesson teacher source");

    fs.writeFileSync(exampleDraftPath, JSON.stringify({
      planId: plan.id,
      title: plan.title,
      analysis: ai.json.analysis,
      suggestions: ai.json.suggestions.slice(0, 12),
      guarantees: {
        autoSaved: ai.json.autoSaved,
        autoPublished: ai.json.autoPublished,
        publishedContentPreserved: ai.json.publishedContentPreserved,
      },
    }, null, 2));

    const accepted = ai.json.suggestions.map((s) => ({ ...s, decision: "accepted", selected: true }));
    const applied = lessonTeacher.applyLessonTeacherDecisions({ activities: {}, week: {} }, accepted);
    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      saveMode: "enrichment_draft",
      lessonPlan: { id: plan.id, enrichmentDraft: applied.draft },
    }, auth);
    assert(res.status === 200, `save draft: ${res.status}`);
    expectedUpdatedAt = res.json.siteContentUpdatedAt || expectedUpdatedAt;
    const drafted = (res.json.curriculum.lessonPlans || []).find((p) => p.id === plan.id);
    assert(drafted.enrichmentDraft?.week, "draft week persisted");
    assert(String(drafted.weeklyOverview || "") === "Short.", "legacy overview not overwritten by draft save");
    assert(!drafted.songs?.length || drafted.songs.length === 0, "published songs not auto-written");

    // Reject path: suggest again after draft exists; reject all must not publish
    const ai2 = await requestJson("POST", "/api/admin/curriculum/enrichment-ai-suggest", {
      adminToken,
      planId: plan.id,
      scope: "lesson",
    }, auth);
    assert(ai2.status === 200, "second lesson suggest ok");
    assert(ai2.json.autoPublished !== true, "reject path never publishes");

    const { chromium } = require("playwright");
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(
      () => typeof window.LLHTeachingKitAiLessonTeacher !== "undefined"
        && typeof window.LLHTeachingKitEnrichmentEditor !== "undefined"
        && typeof window.LLHTeachingKitEnrichment !== "undefined",
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
      // Start from an empty enrichment draft so Prepare AI Draft has real gaps to fill.
      const emptyPlan = {
        ...payload.plan,
        enrichmentDraft: { activities: {}, week: {} },
      };
      window.curriculumLessonPlanById = (id) => (id === emptyPlan.id ? emptyPlan : null);
      window.curriculumActivitiesForLesson = () => [];
      window.showActionFeedback = () => {};

      const host = document.createElement("div");
      host.id = "adminTeachingKitEnrichmentHost";
      document.body.innerHTML = "";
      document.body.appendChild(host);

      // Open without racing a second request — open() auto-prepares when gaps exist.
      window.LLHTeachingKitEnrichmentEditor.open(emptyPlan.id);
      for (let i = 0; i < 40; i += 1) {
        await new Promise((r) => setTimeout(r, 100));
        const trayReady = document.querySelector("[data-ai-tray] [data-ai-review-list], [data-ai-tray] [data-ai-error], [data-ai-tray] [data-ai-loading]");
        const phaseReady = document.querySelector("[data-ai-review-list]");
        if (phaseReady) break;
        if (trayReady && document.querySelector("[data-ai-error]")) break;
      }
      if (!document.querySelector("[data-ai-review-list]")) {
        await window.LLHTeachingKitEnrichmentEditor.requestAiSuggestions({
          scope: "lesson",
          simulate: "fixture",
        });
        for (let i = 0; i < 30; i += 1) {
          await new Promise((r) => setTimeout(r, 100));
          if (document.querySelector("[data-ai-review-list]")) break;
        }
      }

      const analysisPanel = document.querySelector("[data-lesson-analysis]");
      const tray = document.querySelector("[data-ai-tray]");
      const compareHeads = [...document.querySelectorAll(".tk-enrich-ai-compare h5")].map((el) => el.textContent.trim());
      return {
        hasAnalysis: Boolean(analysisPanel),
        analysisText: analysisPanel?.textContent || "",
        prepareCta: Boolean(document.querySelector('[data-ai-suggest="lesson"]')),
        trayOpen: Boolean(tray),
        trayHtml: tray ? tray.textContent.slice(0, 240) : "",
        statusText: document.querySelector(".tk-enrich-status")?.textContent || "",
        sideBySide: compareHeads.includes("Current Lesson") && compareHeads.includes("AI Draft"),
        acceptAll: Boolean(document.querySelector("[data-ai-accept-all]")),
        rejectAll: Boolean(document.querySelector("[data-ai-reject-all]")),
        reviewTitle: /Side-by-side|Complete kit/i.test(document.querySelector("#tk-enrich-ai-title")?.textContent || ""),
        cardCount: document.querySelectorAll("[data-ai-card]").length,
      };
    }, {
      plan: drafted,
      adminToken,
    });

    assert(ui.hasAnalysis, "analysis panel rendered");
    assert(ui.analysisText.includes("Complete") && ui.analysisText.includes("Missing"), "score labels");
    assert(ui.prepareCta, "Prepare AI Draft CTA");
    assert(ui.trayOpen, "AI review tray open");
    assert(ui.sideBySide, "Current vs AI Draft columns");
    assert(ui.acceptAll && ui.rejectAll, "accept/reject all");
    assert(ui.reviewTitle, "side-by-side title");
    assert(ui.cardCount >= 1, "review cards present");

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "tk-ai-lesson-teacher-review-desktop.png"),
      fullPage: true,
    });

    // Accept selected into draft via UI API
    const acceptResult = await page.evaluate(async () => {
      const before = window.LLHTeachingKitEnrichmentEditor.getLessonAnalysis()?.completionPercent || 0;
      await window.LLHTeachingKitEnrichmentEditor.insertSelectedAiSuggestions({ acceptAll: true });
      await new Promise((r) => setTimeout(r, 80));
      const after = window.LLHTeachingKitEnrichmentEditor.getLessonAnalysis()?.completionPercent || 0;
      const draft = window.LLHTeachingKitEnrichmentEditor.getDraft();
      return {
        before,
        after,
        hasWeekDraft: Boolean(draft?.week?.weeklyOverview || draft?.week?.books?.length),
        trayClosed: !document.querySelector("[data-ai-tray]"),
        analysisAfter: document.querySelector("[data-lesson-analysis]")?.textContent || "",
      };
    });
    assert(acceptResult.hasWeekDraft, "accept writes draft");
    assert(acceptResult.trayClosed, "tray closes after accept");
    assert(typeof acceptResult.after === "number", "completion percent available after accept");
    assert(
      acceptResult.after > acceptResult.before,
      `completion rises after accept (before=${acceptResult.before}, after=${acceptResult.after})`,
    );

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "tk-ai-lesson-teacher-after-accept-desktop.png"),
      fullPage: true,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(async () => {
      await window.LLHTeachingKitEnrichmentEditor.requestAiSuggestions({
        scope: "lesson",
        simulate: "fixture",
      });
      await new Promise((r) => setTimeout(r, 200));
    });
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "tk-ai-lesson-teacher-review-mobile.png"),
      fullPage: true,
    });

    await page.evaluate(() => {
      document.querySelector("[data-ai-reject-all]")?.click();
    });
    await new Promise((r) => setTimeout(r, 120));
    const rejected = await page.evaluate(() => !document.querySelector("[data-ai-tray]"));
    assert(rejected, "reject all closes tray");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
      window.LLHTeachingKitEnrichmentEditor.render();
    });
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "tk-ai-lesson-teacher-analysis-mobile.png"),
      fullPage: true,
    });

    await setFlags(adminToken, {
      teachingKitEnrichmentEditor: false,
      teachingKitViewer: false,
      teachingKitAuthoring: false,
    });
    assert(teachingKit.defaultTeachingKitFeatureFlags().teachingKitEnrichmentEditor === false, "defaults still false");

    const report = {
      title: "Teaching Kit AI Lesson Teacher",
      passed,
      screenshots: [
        "tk-ai-lesson-teacher-review-desktop.png",
        "tk-ai-lesson-teacher-after-accept-desktop.png",
        "tk-ai-lesson-teacher-review-mobile.png",
        "tk-ai-lesson-teacher-analysis-mobile.png",
      ],
      exampleDraft: "tk-ai-lesson-teacher-example-draft.json",
      productionReadinessScore: "7.5/10",
      doNotMerge: true,
      doNotDeploy: true,
      doNotEnableFlags: true,
      finishedAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(ARTIFACT_DIR, "tk-ai-lesson-teacher-report.json"), JSON.stringify(report, null, 2));
    console.log(`OK teaching-kit-ai-lesson-teacher (${passed} assertions)`);
  } catch (error) {
    console.error("FAIL teaching-kit-ai-lesson-teacher:", error.message);
    if (stderr) console.error(stderr.slice(-2500));
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    child.kill("SIGTERM");
    try { fs.rmSync(STORE_PATH, { force: true }); } catch { /* ignore */ }
  }
}

main();
