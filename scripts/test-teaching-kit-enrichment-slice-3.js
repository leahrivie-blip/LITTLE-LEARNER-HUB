#!/usr/bin/env node
/**
 * Enrichment Editor Slice 3 — Live Preview + draft-to-provider parity.
 * Farm Animals fixture. Run: npm run test:teaching-kit-enrichment-slice-3
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const teachingKit = require("./teaching-kit.js");
const enrichment = require("./teaching-kit-enrichment.js");

const ROOT = path.join(__dirname, "..");
const PORT = 5300 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-tk-enrich-s3-${process.pid}.json`);
const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(ROOT, "scripts/fixtures/teaching-kit/farm-animals-enrichment-slice2.json"), "utf8"),
);
const ARTIFACT_DIR = "/opt/cursor/artifacts/assets";
const ADMIN = {
  email: "tk-enrich-s3-admin@example.com",
  password: "tk-enrich-s3-pass",
  code: "tk-enrich-s3-code",
};
const PRO_USER = "tk-enrich-s3-pro@example.com";

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
      SITE_URL: `http://127.0.0.1:${PORT}`,
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

function readTempStore() {
  return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
}

function writeTempStore(data) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
}

function seedProUser() {
  const store = readTempStore();
  store.users = store.users || {};
  store.users[PRO_USER] = {
    email: PRO_USER,
    plan: "Pro",
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  writeTempStore(store);
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
  const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
  const existing = bootstrap.json.siteContent || {};
  const save = await requestJson("POST", "/api/admin/site-content", {
    adminToken,
    siteContent: {
      ...existing,
      updatedAt: existing.updatedAt,
      featureFlags: {
        playBasedCurriculum: true,
        teachingKitViewer: false,
        teachingKitPrintCenter: false,
        teachingKitAttachments: false,
        teachingKitEnrichmentEditor: false,
        ...flags,
      },
    },
  });
  assert(save.status === 200, `flag save: ${save.status} ${save.text}`);
  return save.json.siteContent?.updatedAt || existing.updatedAt;
}

function tipHaystack(kit) {
  const activities = kit?.companion?.activities || [];
  return activities.map((a) => {
    const prompts = (a.teacherPrompts || []).map((p) => `${p.label || ""} ${p.text || ""}`).join(" ");
    return `${a.title || ""} ${prompts} ${(a.supplySubstitutions || []).map((s) => `${s.need}-${s.use}`).join(" ")}`;
  }).join(" | ").toLowerCase();
}

function testParityHelpers() {
  const plan = { ...FIXTURE.lessonPlan, resourceIds: [], enrichmentDraft: FIXTURE.enrichmentDraft };
  const activities = FIXTURE.activities;
  const discovery = activities.find((a) => a.title === "Farm Animal Discovery Basket");
  assert(discovery, "discovery activity in fixture");

  const emptyModel = enrichment.buildTeachingKitPreviewModel(
    plan,
    activities,
    [],
    null,
    { day: "monday" },
    teachingKit.mapLessonPlanToTeachingKit.bind(teachingKit),
  );
  assert(emptyModel.publishedKit?.ok === true, "published kit ok");
  assert(emptyModel.draftKit?.ok === true, "empty-draft kit ok");
  assert(
    (emptyModel.publishedKit.companion?.activities || []).length
      === (emptyModel.draftKit.companion?.activities || []).length,
    "empty draft keeps activity count parity",
  );

  const draftModel = enrichment.buildTeachingKitPreviewModel(
    plan,
    activities,
    [],
    FIXTURE.enrichmentDraft,
    { day: "monday" },
    teachingKit.mapLessonPlanToTeachingKit.bind(teachingKit),
  );
  const publishedHay = tipHaystack(draftModel.publishedKit);
  const draftHay = tipHaystack(draftModel.draftKit);
  assert(!publishedHay.includes("discovery basket at child height"), "published kit ignores draft tips");
  assert(draftHay.includes("discovery basket at child height"), "draft preview includes tip");
  assert(draftHay.includes("shallow tray") || draftHay.includes("shoe box"), "draft preview includes substitution");

  const stripped = enrichment.planForProviderMapping({ ...plan, enrichmentDraft: { activities: { x: 1 } } });
  assert(!Object.prototype.hasOwnProperty.call(stripped, "enrichmentDraft"), "provider plan strips enrichmentDraft");

  // Fail-safe: empty activity patches do not throw
  const safe = enrichment.buildTeachingKitPreviewModel(
    plan,
    activities,
    [],
    { activities: { [discovery.id]: { teacherTips: [], observationPrompts: [], vocabulary: [] } } },
    { day: "monday" },
    teachingKit.mapLessonPlanToTeachingKit.bind(teachingKit),
  );
  assert(safe.draftKit?.ok === true, "empty enrichment fields fail safely");
}

async function main() {
  testParityHelpers();

  const child = startServer();
  let browser;
  try {
    await waitForHealth(child);
    const adminToken = await adminLogin();
    seedProUser();

    let bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    let expectedUpdatedAt = bootstrap.json.siteContent.updatedAt || "";

    const planPayload = { ...FIXTURE.lessonPlan, resourceIds: [] };
    const savePlan = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      lessonPlan: planPayload,
    });
    assert(savePlan.status === 200, `save farm plan: ${savePlan.status} ${savePlan.text}`);
    expectedUpdatedAt = savePlan.json.siteContentUpdatedAt || expectedUpdatedAt;

    expectedUpdatedAt = await setFlags(adminToken, {
      teachingKitEnrichmentEditor: true,
      teachingKitViewer: true,
      teachingKitPrintCenter: true,
    });

    const draftSave = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      saveMode: "enrichment_draft",
      lessonPlan: {
        id: planPayload.id,
        enrichmentDraft: FIXTURE.enrichmentDraft,
      },
    });
    assert(draftSave.status === 200, `draft save: ${draftSave.status}`);
    expectedUpdatedAt = draftSave.json.siteContentUpdatedAt || expectedUpdatedAt;
    const savedPlan = (draftSave.json.curriculum.lessonPlans || []).find((p) => p.id === planPayload.id);
    assert(savedPlan?.enrichmentDraft?.activities, "draft stored on plan");

    // Provider Teaching Kit must ignore enrichmentDraft
    const providerKit = await requestJson(
      "GET",
      `/api/curriculum/lesson-plans/${planPayload.id}/teaching-kit?day=monday`,
      null,
      { Authorization: `Bearer test:${PRO_USER}` },
    );
    assert(providerKit.status === 200 && providerKit.json?.teachingKit?.locked === false, "provider kit unlocked");
    const providerHay = tipHaystack(providerKit.json.teachingKit);
    assert(!providerHay.includes("discovery basket at child height"), "provider kit has no draft tip");
    assert(!providerHay.includes("shallow tray"), "provider kit has no draft substitution");

    // Publish still disabled in Slice 3
    const publishBlocked = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      saveMode: "publish_enrichment",
      lessonPlan: { id: planPayload.id },
    });
    assert(publishBlocked.status === 403, "publish still disabled");

    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    const { chromium } = require("playwright");
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(
      () => typeof window.LLHTeachingKitEnrichment !== "undefined"
        && typeof window.LLHTeachingKitEnrichmentEditor !== "undefined"
        && typeof window.LLHTeachingKitViewer !== "undefined"
        && typeof window.LLHTeachingKit !== "undefined",
      null,
      { timeout: 30000 },
    );
    await page.evaluate(() => {
      document.querySelectorAll(
        "[class*='cookie'], [id*='cookie'], [class*='consent'], [id*='consent']",
      ).forEach((el) => { el.style.display = "none"; });
    });

    const opened = await page.evaluate((payload) => {
      const plan = { ...payload.lessonPlan, enrichmentDraft: payload.enrichmentDraft, resourceIds: [] };
      window.curriculumLessonPlanById = (id) => (id === plan.id ? plan : null);
      window.curriculumActivitiesForLesson = (id) => (id === plan.id ? payload.activities : []);
      window.effectiveSiteContent = () => ({ featureFlags: { teachingKitEnrichmentEditor: true } });
      window.effectiveCurriculum = () => ({ resources: [] });
      window.adminSession = () => ({ token: "test", email: "slice3@example.com" });
      window.curriculumExpectedUpdatedAt = () => "";
      window.applyCurriculumState = () => {};
      document.body.classList.add("tk-enrich-open");
      window.LLHTeachingKitEnrichmentEditor.open(plan.id);
      const features = window.LLHTeachingKitEnrichmentEditor.sliceFeatures();
      return { features, open: window.LLHTeachingKitEnrichmentEditor.isOpen() };
    }, {
      lessonPlan: FIXTURE.lessonPlan,
      activities: FIXTURE.activities,
      enrichmentDraft: FIXTURE.enrichmentDraft,
    });
    assert(opened.open === true, "editor opened");
    assert(opened.features.livePreview === true, "livePreview enabled in Slice 3");
    assert(opened.features.publish === false, "publish still off");
    assert(opened.features.aiSuggest === false, "ai still off");

    await page.click('[data-enrich-mode="preview"]');
    await page.waitForSelector("[data-enrich-live-preview][data-draft-preview='1'], .tk-enrich-draft-preview-label", {
      timeout: 15000,
    });
    await page.waitForFunction(() => {
      const text = document.body.innerText || "";
      return text.includes("Draft Preview")
        && (
          document.querySelector("[data-teaching-kit-workspace]")
          || document.querySelector("[data-enrich-live-preview] .tk-surface")
          || document.querySelector("[data-enrich-live-preview] .teaching-kit-article")
          || (document.querySelector("[data-enrich-live-preview]")?.innerText || "").length > 40
        );
    }, null, { timeout: 15000 });

    // Tips render on the activity surface — open Discovery Basket if auto-open missed it.
    await page.waitForFunction(() => {
      const text = document.querySelector("[data-enrich-live-preview]")?.innerText || "";
      return /discovery basket at child height|child height before circle/i.test(text);
    }, null, { timeout: 8000 }).catch(async () => {
      const today = page.locator('[data-enrich-live-preview] [data-tk-goto="today"]');
      if (await today.count()) await today.first().click();
      const openBtn = page.locator('[data-enrich-live-preview] [data-tk-open-activity="cur-act-e14264deb203e7dc"]');
      if (await openBtn.count()) await openBtn.first().click();
      await page.waitForFunction(() => {
        const text = document.querySelector("[data-enrich-live-preview]")?.innerText || "";
        return /discovery basket at child height|child height before circle/i.test(text);
      }, null, { timeout: 8000 });
    });

    const previewChecks = await page.evaluate(() => {
      const text = document.body.innerText || "";
      const previewText = document.querySelector("[data-enrich-live-preview]")?.innerText || "";
      return {
        draftLabel: text.includes("Draft Preview"),
        publishedNote: text.includes("published") || text.includes("Publish"),
        hasWorkspace: Boolean(
          document.querySelector("[data-teaching-kit-workspace]")
          || document.querySelector(".teaching-kit-article")
          || document.querySelector("[data-tk-goto], [data-tk-panel]"),
        ),
        hasNav: /Start Week|Monday Setup|Today|Build|Print|Overview/i.test(text)
          || Boolean(document.querySelector("[data-tk-goto]")),
        tipInPreview: /discovery basket at child height|child height before circle/i.test(previewText || text),
        subInPreview: /shallow tray|shoe box|Supply substitutions|plastic animals/i.test(previewText || text),
        viewportDesktop: Boolean(document.querySelector(".tk-enrich-preview-frame.is-desktop")),
      };
    });
    assert(previewChecks.draftLabel, "Draft Preview label visible");
    assert(previewChecks.hasWorkspace || previewChecks.hasNav, "provider TK surface/nav present");
    assert(previewChecks.tipInPreview, "draft tip visible in Live Preview");
    assert(previewChecks.subInPreview, "draft substitutions visible in Live Preview");
    assert(previewChecks.viewportDesktop, "desktop preview frame active");

    const shots = [
      { viewport: "desktop", file: "tk-enrich-slice3-farm-preview-desktop.png", width: 1280, height: 900 },
      { viewport: "tablet", file: "tk-enrich-slice3-farm-preview-tablet.png", width: 768, height: 1024 },
      { viewport: "mobile", file: "tk-enrich-slice3-farm-preview-mobile.png", width: 390, height: 844 },
    ];
    for (const shot of shots) {
      await page.setViewportSize({ width: shot.width, height: shot.height });
      await page.click(`[data-preview-viewport="${shot.viewport}"]`);
      await page.waitForSelector(`.tk-enrich-preview-frame.is-${shot.viewport}`, { timeout: 5000 });
      await page.waitForFunction(() => {
        const text = document.querySelector("[data-enrich-live-preview]")?.innerText || "";
        return /discovery basket at child height|child height before circle/i.test(text)
          && /Farm Animal Discovery Basket/i.test(text);
      }, null, { timeout: 10000 });
      // Expand scrollport so tips/substitutions are visible in review screenshots
      await page.evaluate(() => {
        const root = document.querySelector("[data-enrich-live-preview]");
        if (!root) return;
        root.style.maxHeight = "none";
        root.style.overflow = "visible";
        const tip = Array.from(root.querySelectorAll(".tk-prompt"))
          .find((el) => /discovery basket at child height/i.test(el.textContent || ""));
        if (tip) tip.scrollIntoView({ block: "center", inline: "nearest" });
      });
      await new Promise((resolve) => setTimeout(resolve, 250));
      const frame = page.locator(".tk-enrich-preview-full");
      const out = path.join(ARTIFACT_DIR, shot.file);
      await frame.screenshot({ path: out });
      assert(fs.existsSync(out) && fs.statSync(out).size > 1000, `${shot.viewport} screenshot written`);
    }

    await setFlags(adminToken, {
      teachingKitEnrichmentEditor: false,
      teachingKitViewer: false,
      teachingKitPrintCenter: false,
    });

    console.log(`OK teaching-kit-enrichment-slice-3 (${passed} assertions)`);
    shots.forEach((shot) => console.log(`Artifact: ${path.join(ARTIFACT_DIR, shot.file)}`));
  } finally {
    if (browser) await browser.close().catch(() => {});
    child.kill("SIGTERM");
    try {
      await new Promise((resolve) => child.once("exit", resolve));
    } catch {
      // ignore
    }
    fs.rmSync(STORE_PATH, { force: true });
    fs.rmSync(STORE_PATH.replace(/\.json$/, ".admin-sessions.json"), { force: true });
  }
}

main().catch((error) => {
  console.error("FAIL teaching-kit-enrichment-slice-3:", error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
