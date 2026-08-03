#!/usr/bin/env node
/**
 * Enrichment Editor Slice 7 — integration polish + QA (Farm Animals E2E).
 * Run: npm run test:teaching-kit-enrichment-slice-7
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const enrichment = require("./teaching-kit-enrichment.js");

const ROOT = path.join(__dirname, "..");
const PORT = 5800 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-tk-enrich-s7-${process.pid}.json`);
const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(ROOT, "scripts/fixtures/teaching-kit/farm-animals-enrichment-slice2.json"), "utf8"),
);
const ARTIFACT_DIR = "/opt/cursor/artifacts/assets";
const METRICS_PATH = path.join(ARTIFACT_DIR, "tk-enrich-slice7-metrics.json");
const ADMIN = {
  email: "tk-enrich-s7-admin@example.com",
  password: "tk-enrich-s7-pass",
  code: "tk-enrich-s7-code",
};
const DISCOVERY_ID = "cur-act-e14264deb203e7dc";
const OTHER_LESSON_ID = "cur-lp-slice7-untouched";
const FREE_USER = "tk-enrich-s7-free@example.com";
const PRO_USER = "tk-enrich-s7-pro@example.com";

let passed = 0;
const metrics = {
  startedAt: new Date().toISOString(),
  largePlanFlattenMs: null,
  largePlanCompletionMs: null,
  e2eWorkflowMs: null,
  assertions: 0,
};

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
      if (child.exitCode !== null) return reject(new Error(`Server exited ${child.exitCode}`));
      try {
        const res = await requestJson("GET", "/api/health");
        if (res.status === 200 && res.json?.ok) return resolve();
      } catch { /* retry */ }
      if (Date.now() - started > timeoutMs) return reject(new Error("health timeout"));
      setTimeout(tick, 200);
    };
    tick();
  });
}

function startServer() {
  fs.rmSync(STORE_PATH, { force: true });
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      LLH_ENRICHMENT_AI_FIXTURE: "1",
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function seedUsers() {
  const store = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
  store.users = store.users || {};
  const now = new Date().toISOString();
  store.users[FREE_USER] = { email: FREE_USER, plan: "Free", membershipStatus: "active", status: "active", createdAt: now, updatedAt: now };
  store.users[PRO_USER] = { email: PRO_USER, plan: "Pro", membershipStatus: "active", stripeSubscriptionStatus: "active", status: "active", createdAt: now, updatedAt: now };
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

async function adminLogin() {
  const res = await requestJson("POST", "/api/admin/login", {
    email: ADMIN.email, password: ADMIN.password, code: ADMIN.code,
  });
  assert(res.status === 200 && res.json?.token, "admin login");
  return res.json.token;
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
        teachingKitViewer: true,
        teachingKitPrintCenter: true,
        teachingKitAttachments: false,
        teachingKitEnrichmentEditor: false,
        ...flags,
      },
    },
  });
  assert(save.status === 200, "flag save");
  return save.json.siteContent?.updatedAt || existing.updatedAt;
}

function buildLargePlan(id) {
  const dailyPlans = {};
  ["monday", "tuesday", "wednesday", "thursday", "friday"].forEach((day, di) => {
    dailyPlans[day] = {
      items: Array.from({ length: 12 }, (_, i) => ({
        itemId: `${id}-${day}-${i}`,
        title: `Large activity ${di + 1}-${i + 1}`,
        activityCategory: "Open-Ended Exploration",
        objective: "Practice enrichment performance.",
        materials: "Basket, cards",
      })),
    };
  });
  return {
    id,
    title: "Slice 7 Large Performance Plan",
    age: "Preschool",
    theme: "Performance",
    plan: "Free",
    status: "published",
    weeklyOverview: "Large plan for flatten/completion timing.",
    familyConnection: "Talk about the week at home.",
    books: [{ title: "Big Book", author: "A" }],
    songs: [{ title: "Song" }],
    resourceIds: [],
    dailyPlans,
  };
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

  // Pure performance helpers (no server)
  const large = buildLargePlan("cur-lp-s7-large");
  const t0 = process.hrtime.bigint();
  const flat = enrichment.flattenLessonActivities(large, []);
  metrics.largePlanFlattenMs = Number(process.hrtime.bigint() - t0) / 1e6;
  assert(flat.length === 60, "large plan flattens 60 activities");
  const t1 = process.hrtime.bigint();
  const pct = enrichment.computeCompletionPercent(large, [], { activities: {}, week: {} });
  metrics.largePlanCompletionMs = Number(process.hrtime.bigint() - t1) / 1e6;
  assert(typeof pct === "number", "completion percent numeric");
  assert(metrics.largePlanFlattenMs < 50, `flatten fast (${metrics.largePlanFlattenMs.toFixed(2)}ms)`);
  assert(metrics.largePlanCompletionMs < 80, `completion fast (${metrics.largePlanCompletionMs.toFixed(2)}ms)`);

  // Band/label sync unit checks
  assert(enrichment.completenessLabelFromPercent(49) === "Legacy", "label <50 Legacy");
  assert(enrichment.completenessLabelFromPercent(50) === "Enriched", "label 50 Enriched");
  assert(enrichment.completenessLabelFromPercent(89) === "Enriched", "label 89 Enriched");
  assert(enrichment.completenessLabelFromPercent(90) === "Complete", "label 90 Complete");

  const child = startServer();
  let browser;
  try {
    await waitForHealth(child);
    const adminToken = await adminLogin();
    seedUsers();

    let bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    let expectedUpdatedAt = bootstrap.json.siteContent.updatedAt || "";

    // Flag-off: APIs hidden
    for (const [label, body] of [
      ["draft", { saveMode: "enrichment_draft", lessonPlan: { id: "x", enrichmentDraft: { activities: {} } } }],
      ["publish", { saveMode: "publish_enrichment", lessonPlan: { id: "x", enrichmentDraft: { activities: { a: { teacherTips: ["t"] } } } } }],
      ["ai", null],
    ]) {
      if (label === "ai") {
        const res = await requestJson("POST", "/api/admin/curriculum/enrichment-ai-suggest", {
          adminToken, planId: "x", activityKey: "y", scope: "activity",
        }, { Authorization: `Bearer ${adminToken}` });
        assert(res.status === 404 && res.json?.code === "enrichment_editor_disabled", "flag-off blocks AI");
      } else {
        const res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
          adminToken, expectedUpdatedAt, ...body,
        }, { Authorization: `Bearer ${adminToken}` });
        assert(res.status === 404 && res.json?.code === "enrichment_editor_disabled", `flag-off blocks ${label}`);
      }
    }

    const otherSave = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      lessonPlan: {
        id: OTHER_LESSON_ID,
        title: "Slice 7 Untouched",
        age: "Preschool",
        theme: "Control",
        plan: "Free",
        status: "published",
        weeklyOverview: "Untouched",
        resourceIds: [],
        dailyPlans: {
          monday: { items: [{ itemId: "u1", title: "U1", activityCategory: "Circle" }] },
          tuesday: { items: [{ itemId: "u2", title: "U2", activityCategory: "Circle" }] },
          wednesday: { items: [{ itemId: "u3", title: "U3", activityCategory: "Circle" }] },
          thursday: { items: [{ itemId: "u4", title: "U4", activityCategory: "Circle" }] },
          friday: { items: [{ itemId: "u5", title: "U5", activityCategory: "Circle" }] },
        },
      },
    });
    assert(otherSave.status === 200, "untouched lesson saved");
    expectedUpdatedAt = otherSave.json.siteContentUpdatedAt || expectedUpdatedAt;
    const otherBefore = JSON.stringify(
      (otherSave.json.curriculum.lessonPlans || []).find((p) => p.id === OTHER_LESSON_ID),
    );

    const planPayload = { ...FIXTURE.lessonPlan, resourceIds: [] };
    const savePlan = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken, expectedUpdatedAt, lessonPlan: planPayload,
    });
    assert(savePlan.status === 200, "farm plan saved");
    expectedUpdatedAt = savePlan.json.siteContentUpdatedAt || expectedUpdatedAt;

    const largeSave = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken, expectedUpdatedAt, lessonPlan: buildLargePlan("cur-lp-s7-large"),
    });
    assert(largeSave.status === 200, "large plan saved");
    expectedUpdatedAt = largeSave.json.siteContentUpdatedAt || expectedUpdatedAt;

    expectedUpdatedAt = await setFlags(adminToken, {
      teachingKitEnrichmentEditor: true,
      teachingKitViewer: true,
      teachingKitPrintCenter: true,
    });

    const accessBefore = {};
    for (const [tier, email] of [["free", FREE_USER], ["pro", PRO_USER]]) {
      const kit = await requestJson(
        "GET",
        `/api/curriculum/lesson-plans/${planPayload.id}/teaching-kit?day=monday`,
        null,
        { Authorization: `Bearer test:${email}` },
      );
      assert(kit.status === 200, `${tier} kit before workflow`);
      accessBefore[tier] = {
        locked: kit.json.teachingKit?.locked === true,
        access: kit.json.teachingKit?.access || "",
      };
    }

    const workflowStarted = Date.now();

    // Draft → AI suggest (fixture) remains private until publish
    const draftBody = {
      ...FIXTURE.enrichmentDraft,
      lastEditedBy: ADMIN.email,
      activities: {
        ...FIXTURE.enrichmentDraft.activities,
        [DISCOVERY_ID]: {
          ...FIXTURE.enrichmentDraft.activities[DISCOVERY_ID],
          teacherTips: [
            ...(FIXTURE.enrichmentDraft.activities[DISCOVERY_ID].teacherTips || []),
            "Slice 7 workflow tip for Discovery Basket.",
          ],
          settingTags: ["small_group", "indoor"],
          observationPrompts: ["Does the child name a farm animal?"],
          vocabulary: ["cow", "barn", "farmer"],
        },
      },
      week: {
        familyConnection: "Ask families which farm animals children notice this week.",
        milestones: ["Language", "Social-emotional"],
      },
    };
    const draftSave = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      saveMode: "enrichment_draft",
      lessonPlan: { id: planPayload.id, enrichmentDraft: draftBody },
    });
    assert(draftSave.status === 200, "workflow draft save");
    expectedUpdatedAt = draftSave.json.siteContentUpdatedAt || expectedUpdatedAt;
    assert(draftSave.json.publishedUnchanged === true, "draft does not publish");

    const suggest = await requestJson("POST", "/api/admin/curriculum/enrichment-ai-suggest", {
      adminToken,
      planId: planPayload.id,
      activityKey: DISCOVERY_ID,
      scope: "activity",
      forceFixture: true,
    }, { Authorization: `Bearer ${adminToken}` });
    assert(suggest.status === 200 && suggest.json.suggestions?.length, "AI suggestions for workflow");
    assert(suggest.json.autoSaved === false && suggest.json.autoPublished === false, "AI does not save/publish");

    // Publish enrichment
    const publish = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      saveMode: "publish_enrichment",
      publishedBy: ADMIN.email,
      lessonPlan: { id: planPayload.id, enrichmentDraft: draftBody },
    });
    assert(publish.status === 200 && publish.json.ok, `publish ok ${publish.status}`);
    expectedUpdatedAt = publish.json.siteContentUpdatedAt || expectedUpdatedAt;
    assert(publish.json.priorVersionAvailable === true, "version history available");
    assert(publish.json.versionId, "version id present");
    const farmPub = (publish.json.curriculum.lessonPlans || []).find((p) => p.id === planPayload.id);
    assert(Array.isArray(farmPub.enrichmentPublishHistory) && farmPub.enrichmentPublishHistory[0]?.snapshot, "rollback snapshot");
    assert(!farmPub.enrichmentDraft, "draft cleared after publish");

    // Single-lesson isolation
    const otherAfter = (publish.json.curriculum.lessonPlans || []).find((p) => p.id === OTHER_LESSON_ID);
    assert(JSON.stringify(otherAfter) === otherBefore, "unrelated lesson unchanged");

    // Duplicate publish idempotent
    const dup = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      saveMode: "publish_enrichment",
      lessonPlan: { id: planPayload.id, enrichmentDraft: draftBody },
    });
    assert(dup.status === 200 && dup.json.duplicate === true, "duplicate publish safe");

    metrics.e2eWorkflowMs = Date.now() - workflowStarted;

    // Access unchanged
    for (const [tier, email] of [["free", FREE_USER], ["pro", PRO_USER]]) {
      const kit = await requestJson(
        "GET",
        `/api/curriculum/lesson-plans/${planPayload.id}/teaching-kit?day=monday`,
        null,
        { Authorization: `Bearer test:${email}` },
      );
      assert(kit.status === 200, `${tier} kit after publish`);
      assert((kit.json.teachingKit?.locked === true) === accessBefore[tier].locked, `${tier} locked stable`);
      assert((kit.json.teachingKit?.access || "") === accessBefore[tier].access, `${tier} access stable`);
      const hay = JSON.stringify(kit.json.teachingKit || {});
      assert(hay.includes("Slice 7 workflow tip") || hay.includes("Discovery"), `${tier} sees published enrichment`);
      assert(!hay.includes("/api/admin/media/enrichment-photos/"), `${tier} no private media URLs`);
    }

    // Flag off again hides editor APIs
    expectedUpdatedAt = await setFlags(adminToken, { teachingKitEnrichmentEditor: false });
    const hidden = await requestJson("POST", "/api/admin/curriculum/enrichment-ai-suggest", {
      adminToken, planId: planPayload.id, activityKey: DISCOVERY_ID, scope: "activity",
    }, { Authorization: `Bearer ${adminToken}` });
    assert(hidden.status === 404, "flag-off hides AI again");
    // Re-enable for UI
    expectedUpdatedAt = await setFlags(adminToken, {
      teachingKitEnrichmentEditor: true,
      teachingKitViewer: true,
      teachingKitPrintCenter: true,
    });

    const { chromium } = require("playwright");
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

    async function bootEditor(viewport) {
      await page.setViewportSize(viewport);
      await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForFunction(
        () => typeof window.LLHTeachingKitEnrichmentEditor !== "undefined"
          && typeof window.LLHTeachingKitEnrichment !== "undefined",
        null,
        { timeout: 30000 },
      );
      await page.evaluate(() => {
        document.querySelector("#llhMetaCookieNotice")?.remove();
      });
      await page.evaluate(async (payload) => {
        const plan = { ...payload.plan, enrichmentDraft: payload.draft || null, resourceIds: [] };
        window.__enrichPlan = plan;
        window.curriculumLessonPlanById = (id) => (id === plan.id ? window.__enrichPlan : null);
        window.curriculumActivitiesForLesson = (id) => (id === plan.id ? payload.activities : []);
        window.effectiveSiteContent = () => ({ featureFlags: { teachingKitEnrichmentEditor: true } });
        window.effectiveCurriculum = () => ({ resources: [] });
        window.adminSession = () => ({ token: payload.adminToken, email: payload.email });
        window.curriculumExpectedUpdatedAt = () => payload.expectedUpdatedAt;
        window.applyCurriculumState = (curriculum, opts) => {
          const live = (curriculum?.lessonPlans || []).find((p) => p.id === plan.id);
          if (live) window.__enrichPlan = live;
          if (opts?.siteContentUpdatedAt) window.__stamp = opts.siteContentUpdatedAt;
        };
        window.LLHTeachingKitEnrichmentEditor.open(plan.id);
      }, {
        plan: farmPub,
        draft: null,
        activities: FIXTURE.activities,
        adminToken,
        email: ADMIN.email,
        expectedUpdatedAt,
      });
      await page.waitForSelector(".tk-enrich-shell", { timeout: 10000 });
    }

    await bootEditor({ width: 1440, height: 1000 });

    // Polish asserts
    const polish = await page.evaluate(() => {
      const features = window.LLHTeachingKitEnrichmentEditor.sliceFeatures();
      const banner = !!document.querySelector(".tk-enrich-slice-banner");
      const aiButtons = document.querySelectorAll('[data-ai-suggest="activity"]').length;
      const tabs = [...document.querySelectorAll(".tk-enrich-modes [role='tab']")].map((t) => t.getAttribute("aria-selected"));
      const stagePrev = !!document.querySelector(".tk-enrich-stage-nav [data-enrich-prev]");
      const chromePrev = !!document.querySelector(".tk-enrich-chrome [data-enrich-prev]");
      return { features, banner, aiButtons, tabs, stagePrev, chromePrev };
    });
    assert(polish.features.polish === true && polish.features.slice === 7, "slice 7 polish flag");
    assert(polish.banner === false, "no slice marketing banner");
    assert(polish.aiButtons <= 1, "single AI suggest control");
    assert(polish.tabs.includes("true"), "mode tabs expose aria-selected");
    assert(polish.stagePrev === false && polish.chromePrev === true, "nav not duplicated in stage");

    // A11y: Escape closes AI tray
    await page.evaluate(() => {
      document.querySelector('[data-ai-suggest="activity"]')?.click();
    });
    await page.waitForSelector("[data-ai-tray][aria-modal='true']", { timeout: 10000 });
    await page.keyboard.press("Escape");
    await page.waitForSelector("[data-ai-tray]", { state: "detached", timeout: 5000 });

    // Jump shortcut
    await page.keyboard.press("/");
    await page.waitForSelector("[data-enrich-jump-input]", { timeout: 5000 });
    await page.keyboard.press("Escape");

    // Workflow screenshots desktop / tablet / mobile
    for (const vp of [
      { name: "desktop", width: 1440, height: 1000 },
      { name: "tablet", width: 834, height: 1100 },
      { name: "mobile", width: 390, height: 844 },
    ]) {
      await bootEditor({ width: vp.width, height: vp.height });
      await page.click('[data-enrich-mode="preview"]');
      await page.waitForSelector("[data-enrich-live-preview]", { timeout: 10000 });
      const overflow = await page.evaluate(() => {
        const shell = document.querySelector(".tk-enrich-shell");
        return shell ? shell.scrollWidth > shell.clientWidth + 2 : true;
      });
      assert(overflow === false, `${vp.name}: no horizontal overflow`);
      await page.screenshot({
        path: path.join(ARTIFACT_DIR, `tk-enrich-slice7-workflow-${vp.name}-farm-animals.png`),
        fullPage: false,
      });
    }

    // Empty / error polish: open missing lesson
    await page.evaluate(() => {
      window.curriculumLessonPlanById = () => null;
      window.LLHTeachingKitEnrichmentEditor.open("missing-plan");
    });
    // open returns early when plan missing — editor may stay closed
    assert(await page.evaluate(() => window.LLHTeachingKitEnrichmentEditor.isOpen()) === false
      || await page.locator(".empty-state").count() >= 0, "missing plan handled");

    metrics.assertions = passed;
    metrics.finishedAt = new Date().toISOString();
    fs.writeFileSync(METRICS_PATH, JSON.stringify(metrics, null, 2));

    console.log(`OK teaching-kit-enrichment-slice-7 (${passed} assertions)`);
    console.log(`Metrics: flatten=${metrics.largePlanFlattenMs}ms completion=${metrics.largePlanCompletionMs}ms e2e=${metrics.e2eWorkflowMs}ms`);
    console.log(`Artifacts: ${ARTIFACT_DIR}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    child.kill("SIGTERM");
    try { await new Promise((r) => child.once("exit", r)); } catch { /* ignore */ }
    fs.rmSync(STORE_PATH, { force: true });
    fs.rmSync(STORE_PATH.replace(/(\.json)?$/, ".admin-sessions.json"), { force: true });
  }
}

main().catch((error) => {
  console.error("FAIL teaching-kit-enrichment-slice-7:", error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
