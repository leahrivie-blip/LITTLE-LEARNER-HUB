#!/usr/bin/env node
/**
 * Enrichment Editor Slice 6 — AI suggestions with approval tray.
 * Farm Animals fixture. Run: npm run test:teaching-kit-enrichment-slice-6
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const enrichmentAi = require("../server/enrichment-ai.js");

const ROOT = path.join(__dirname, "..");
const PORT = 5700 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-tk-enrich-s6-${process.pid}.json`);
const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(ROOT, "scripts/fixtures/teaching-kit/farm-animals-enrichment-slice2.json"), "utf8"),
);
const ARTIFACT_DIR = "/opt/cursor/artifacts/assets";
const ADMIN = {
  email: "tk-enrich-s6-admin@example.com",
  password: "tk-enrich-s6-pass",
  code: "tk-enrich-s6-code",
};
const FREE_USER = "tk-enrich-s6-free@example.com";
const TRIAL_USER = "tk-enrich-s6-trial@example.com";
const PRO_USER = "tk-enrich-s6-pro@example.com";
const DISCOVERY_ID = "cur-act-e14264deb203e7dc";
const OTHER_LESSON_ID = "cur-lp-slice6-untouched";

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
          resolve({ status: res.statusCode, json, text, headers: res.headers });
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
        /* retry */
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
      LLH_ENRICHMENT_AI_FIXTURE: "1",
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

function seedAccessUsers() {
  const store = readTempStore();
  store.users = store.users || {};
  const now = new Date().toISOString();
  store.users[FREE_USER] = { email: FREE_USER, plan: "Free", membershipStatus: "active", status: "active", createdAt: now, updatedAt: now };
  store.users[TRIAL_USER] = {
    email: TRIAL_USER,
    plan: "Pro",
    membershipStatus: "trialing",
    stripeSubscriptionStatus: "trialing",
    trialStatus: "In Trial",
    trialStart: now,
    trialEnd: new Date(Date.now() + 7 * 86400000).toISOString(),
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
  store.users[PRO_USER] = {
    email: PRO_USER,
    plan: "Pro",
    membershipStatus: "active",
    stripeSubscriptionStatus: "active",
    status: "active",
    createdAt: now,
    updatedAt: now,
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
        teachingKitViewer: true,
        teachingKitPrintCenter: true,
        teachingKitAttachments: false,
        teachingKitEnrichmentEditor: false,
        ...flags,
      },
    },
  });
  assert(save.status === 200, `flag save: ${save.status}`);
  return save.json.siteContent?.updatedAt || existing.updatedAt;
}

async function teachingKitAccess(email, planId) {
  return requestJson(
    "GET",
    `/api/curriculum/lesson-plans/${planId}/teaching-kit?day=monday`,
    null,
    { Authorization: `Bearer test:${email}` },
  );
}

async function main() {
  // Pure helper: never overwrite existing tips
  const applied = enrichmentAi.applySuggestionsToDraft(
    {
      activities: {
        [DISCOVERY_ID]: { teacherTips: ["Keep existing tip"] },
      },
      week: { familyConnection: "Existing family note", milestones: ["Language"] },
    },
    [
      {
        id: "a1",
        category: "teacher_tips",
        field: "teacherTips",
        decision: "accepted",
        proposedValue: "New tip from AI",
        proposedText: "New tip from AI",
      },
      {
        id: "a2",
        category: "family_connection",
        field: "familyConnection",
        decision: "accepted",
        proposedValue: "Extra family idea",
        proposedText: "Extra family idea",
      },
      {
        id: "a3",
        category: "milestones",
        field: "milestones",
        decision: "accepted",
        proposedValue: "Language",
        proposedText: "Language",
      },
    ],
    { activityKey: DISCOVERY_ID },
  );
  assert(applied.draft.activities[DISCOVERY_ID].teacherTips.includes("Keep existing tip"), "keeps existing tip");
  assert(applied.draft.activities[DISCOVERY_ID].teacherTips.includes("New tip from AI"), "appends new tip");
  assert(applied.draft.week.familyConnection.includes("Existing family note"), "keeps family text");
  assert(applied.draft.week.familyConnection.includes("Extra family idea"), "appends family idea");
  assert(applied.draft.week.milestones.filter((m) => m === "Language").length === 1, "no duplicate milestone");

  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const child = startServer();
  let browser;
  try {
    await waitForHealth(child);
    const adminToken = await adminLogin();
    seedAccessUsers();

    let bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    let expectedUpdatedAt = bootstrap.json.siteContent.updatedAt || "";

    const otherSave = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      lessonPlan: {
        id: OTHER_LESSON_ID,
        title: "Slice 6 Untouched Lesson",
        age: "Preschool",
        theme: "Control",
        plan: "Free",
        status: "published",
        weeklyOverview: "Control lesson for unrelated-change guard.",
        resourceIds: [],
        dailyPlans: {
          monday: { items: [{ itemId: "ctrl-mon-1", title: "Control Monday", activityCategory: "Circle" }] },
          tuesday: { items: [{ itemId: "ctrl-tue-1", title: "Control Tuesday", activityCategory: "Circle" }] },
          wednesday: { items: [{ itemId: "ctrl-wed-1", title: "Control Wednesday", activityCategory: "Circle" }] },
          thursday: { items: [{ itemId: "ctrl-thu-1", title: "Control Thursday", activityCategory: "Circle" }] },
          friday: { items: [{ itemId: "ctrl-fri-1", title: "Control Friday", activityCategory: "Circle" }] },
        },
      },
    });
    assert(otherSave.status === 200, "save untouched lesson");
    expectedUpdatedAt = otherSave.json.siteContentUpdatedAt || expectedUpdatedAt;
    const otherBefore = JSON.stringify(
      (otherSave.json.curriculum.lessonPlans || []).find((p) => p.id === OTHER_LESSON_ID),
    );

    const planPayload = { ...FIXTURE.lessonPlan, resourceIds: [] };
    const savePlan = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      lessonPlan: planPayload,
    });
    assert(savePlan.status === 200, "save farm plan");
    expectedUpdatedAt = savePlan.json.siteContentUpdatedAt || expectedUpdatedAt;

    // Flag off blocks AI
    const offSuggest = await requestJson("POST", "/api/admin/curriculum/enrichment-ai-suggest", {
      adminToken,
      planId: planPayload.id,
      activityKey: DISCOVERY_ID,
      scope: "activity",
    }, { Authorization: `Bearer ${adminToken}` });
    assert(offSuggest.status === 404 && offSuggest.json?.code === "enrichment_editor_disabled", "flag off blocks AI");

    expectedUpdatedAt = await setFlags(adminToken, {
      teachingKitEnrichmentEditor: true,
      teachingKitViewer: true,
      teachingKitPrintCenter: true,
    });

    // Seed draft with existing tip (must not be overwritten)
    const existingTip = "Keep this Farm Animals tip forever.";
    const draftBody = {
      ...FIXTURE.enrichmentDraft,
      lastEditedBy: ADMIN.email,
      activities: {
        ...FIXTURE.enrichmentDraft.activities,
        [DISCOVERY_ID]: {
          ...FIXTURE.enrichmentDraft.activities[DISCOVERY_ID],
          teacherTips: [existingTip],
        },
      },
    };
    const draftSave = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      saveMode: "enrichment_draft",
      lessonPlan: { id: planPayload.id, enrichmentDraft: draftBody },
    });
    assert(draftSave.status === 200, "draft save with existing tip");
    expectedUpdatedAt = draftSave.json.siteContentUpdatedAt || expectedUpdatedAt;
    const farmBeforeAi = (draftSave.json.curriculum.lessonPlans || []).find((p) => p.id === planPayload.id);
    const publishedBodyBefore = JSON.stringify({
      title: farmBeforeAi.title,
      weeklyOverview: farmBeforeAi.weeklyOverview,
      dailyPlans: farmBeforeAi.dailyPlans,
      enrichmentPublishHistory: farmBeforeAi.enrichmentPublishHistory || null,
    });

    const accessBefore = {};
    for (const [tier, email] of [["free", FREE_USER], ["trial", TRIAL_USER], ["pro", PRO_USER]]) {
      const kit = await teachingKitAccess(email, planPayload.id);
      assert(kit.status === 200, `${tier} kit before AI`);
      accessBefore[tier] = {
        locked: kit.json.teachingKit?.locked === true,
        access: kit.json.teachingKit?.access || "",
      };
    }

    // Valid suggestion generation
    const suggest1 = await requestJson("POST", "/api/admin/curriculum/enrichment-ai-suggest", {
      adminToken,
      planId: planPayload.id,
      activityKey: DISCOVERY_ID,
      scope: "activity",
      forceFixture: true,
    }, { Authorization: `Bearer ${adminToken}` });
    assert(suggest1.status === 200 && suggest1.json?.ok, `suggest ok: ${suggest1.status} ${suggest1.text}`);
    assert(Array.isArray(suggest1.json.suggestions) && suggest1.json.suggestions.length >= 4, "valid suggestions returned");
    assert(suggest1.json.autoSaved === false, "suggest response not auto-saved");
    assert(suggest1.json.autoPublished === false, "suggest response not auto-published");
    assert(suggest1.json.curriculumUnchanged === true, "curriculum unchanged by suggest");
    const fields = new Set(suggest1.json.suggestions.map((s) => s.field));
    assert(fields.has("teacherTips"), "includes teacher tips field");
    assert(suggest1.json.suggestions.every((s) => s.fieldLabel && s.currentValue != null), "each suggestion shows field + current");

    // Duplicate request
    const suggestDup = await requestJson("POST", "/api/admin/curriculum/enrichment-ai-suggest", {
      adminToken,
      planId: planPayload.id,
      activityKey: DISCOVERY_ID,
      scope: "activity",
      forceFixture: true,
    }, { Authorization: `Bearer ${adminToken}` });
    assert(suggestDup.status === 200 && suggestDup.json?.duplicate === true, "duplicate request short-circuits");

    // Timeout / malformed preserve content
    const timeoutRes = await requestJson("POST", "/api/admin/curriculum/enrichment-ai-suggest", {
      adminToken,
      planId: planPayload.id,
      activityKey: DISCOVERY_ID,
      scope: "activity",
      simulate: "timeout",
    }, { Authorization: `Bearer ${adminToken}` });
    assert(timeoutRes.status === 504 && timeoutRes.json?.code === "enrichment_ai_timeout", "timeout status");
    assert(Array.isArray(timeoutRes.json.suggestions) && timeoutRes.json.suggestions.length === 0, "timeout empty suggestions");

    const malformedRes = await requestJson("POST", "/api/admin/curriculum/enrichment-ai-suggest", {
      adminToken,
      planId: planPayload.id,
      activityKey: DISCOVERY_ID,
      scope: "activity",
      simulate: "malformed",
    }, { Authorization: `Bearer ${adminToken}` });
    assert(malformedRes.status === 422 && malformedRes.json?.code === "malformed_output", "malformed rejected");

    // After failures, draft tip still present on server
    const afterFail = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    const farmFail = (afterFail.json.siteContent.curriculum.lessonPlans || []).find((p) => p.id === planPayload.id);
    assert(
      farmFail.enrichmentDraft.activities[DISCOVERY_ID].teacherTips.includes(existingTip),
      "failed AI leaves existing tip",
    );
    expectedUpdatedAt = afterFail.json.siteContent.updatedAt || expectedUpdatedAt;

    // Partial approval via pure helper (server never auto-inserts)
    const partial = enrichmentAi.applySuggestionsToDraft(
      farmFail.enrichmentDraft,
      suggest1.json.suggestions.map((s, i) => ({
        ...s,
        decision: i === 0 ? "accepted" : "discarded",
        selected: i === 0,
      })),
      { activityKey: DISCOVERY_ID },
    );
    assert(partial.inserted.length === 1, "partial approval inserts one");
    assert(partial.draft.activities[DISCOVERY_ID].teacherTips.includes(existingTip), "partial keeps existing");

    // Edit before insert
    const edited = enrichmentAi.applySuggestionsToDraft(
      { activities: { [DISCOVERY_ID]: { teacherTips: [existingTip] } }, week: {} },
      [{
        id: "edit-1",
        category: "teacher_tips",
        field: "teacherTips",
        decision: "accepted",
        proposedText: "Edited tip before insert",
        proposedValue: "Edited tip before insert",
      }],
      { activityKey: DISCOVERY_ID },
    );
    assert(edited.draft.activities[DISCOVERY_ID].teacherTips.includes("Edited tip before insert"), "edit-before-insert works");

    // Discarding suggestions → noop
    const discarded = enrichmentAi.applySuggestionsToDraft(
      farmFail.enrichmentDraft,
      suggest1.json.suggestions.map((s) => ({ ...s, decision: "discarded", selected: false })),
      { activityKey: DISCOVERY_ID },
    );
    assert(discarded.inserted.length === 0, "discard inserts nothing");
    assert(
      JSON.stringify(discarded.draft.activities[DISCOVERY_ID].teacherTips)
        === JSON.stringify(farmFail.enrichmentDraft.activities[DISCOVERY_ID].teacherTips),
      "discard leaves tips unchanged",
    );

    // UI: approval tray + partial insert without autosave/publish
    const { chromium } = require("playwright");
    browser = await chromium.launch({ headless: true });

    async function dismissOverlays(page) {
      await page.evaluate(() => {
        document.querySelector("#llhMetaCookieNotice")?.remove();
        document.querySelectorAll(".llh-meta-cookie-notice").forEach((node) => node.remove());
      });
    }

    async function openAiTray(page) {
      await dismissOverlays(page);
      await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('[data-ai-suggest="activity"]')];
        const btn = buttons[buttons.length - 1] || buttons[0];
        if (btn) btn.click();
      });
      await page.waitForSelector("[data-ai-tray]", { timeout: 10000 });
    }

    async function openEditor(page, viewport, enrichmentDraft) {
      await page.setViewportSize(viewport);
      await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForFunction(
        () => typeof window.LLHTeachingKitEnrichmentEditor !== "undefined"
          && typeof window.LLHTeachingKitEnrichment !== "undefined",
        null,
        { timeout: 30000 },
      );
      await dismissOverlays(page);
      await page.evaluate(async (payload) => {
        const plan = {
          ...payload.lessonPlan,
          enrichmentDraft: payload.enrichmentDraft,
          resourceIds: [],
        };
        window.__enrichPlan = plan;
        window.__siteStamp = payload.expectedUpdatedAt;
        window.__saveCalls = 0;
        window.__publishCalls = 0;
        window.curriculumLessonPlanById = (id) => (id === plan.id ? window.__enrichPlan : null);
        window.curriculumActivitiesForLesson = (id) => (id === plan.id ? payload.activities : []);
        window.effectiveSiteContent = () => ({ featureFlags: { teachingKitEnrichmentEditor: true } });
        window.effectiveCurriculum = () => ({ resources: [] });
        window.adminSession = () => ({ token: payload.adminToken, email: payload.adminEmail });
        window.curriculumExpectedUpdatedAt = () => window.__siteStamp || "";
        window.applyCurriculumState = (curriculum, opts) => {
          if (opts?.siteContentUpdatedAt) window.__siteStamp = opts.siteContentUpdatedAt;
          const live = (curriculum?.lessonPlans || []).find((p) => p.id === plan.id);
          if (live) window.__enrichPlan = live;
        };
        const originalFetch = window.fetch.bind(window);
        window.fetch = async (url, opts) => {
          const u = String(url);
          const body = opts?.body ? String(opts.body) : "";
          if (u.includes("/api/admin/curriculum/lesson-plans") && opts?.method === "POST") {
            if (body.includes("publish_enrichment")) window.__publishCalls += 1;
            else window.__saveCalls += 1;
          }
          return originalFetch(url, opts);
        };
        window.LLHTeachingKitEnrichmentEditor.open(plan.id);
      }, {
        lessonPlan: farmFail,
        activities: FIXTURE.activities,
        enrichmentDraft,
        adminToken,
        adminEmail: ADMIN.email,
        expectedUpdatedAt,
      });
      await page.waitForSelector(".tk-enrich-shell", { timeout: 10000 });
    }

    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await openEditor(page, { width: 1440, height: 1000 }, farmFail.enrichmentDraft);

    const features = await page.evaluate(() => window.LLHTeachingKitEnrichmentEditor.sliceFeatures());
    assert(features.aiSuggest === true, "aiSuggest enabled");
    assert(features.publish === true, "publish still available but unused by AI");

    // Close auto complete-kit tray first (must reset editor state), then open activity AI suggest.
    const { dismissEnrichmentAiTray } = require("./test-helpers/tk-enrich-dismiss-ai-tray.js");
    await dismissEnrichmentAiTray(page);
    assert(!(await page.locator("[data-ai-tray]").count()), "auto AI tray closed before activity suggest");
    await openAiTray(page);
    await page.waitForSelector(".tk-enrich-ai-card", { timeout: 15000 });
    const trayText = await page.locator("[data-ai-tray]").innerText();
    assert(
      /Teacher tips|Observation|Vocabulary|Supply|AI Draft|CURRENT LESSON/i.test(trayText),
      `tray shows field labels (got: ${trayText.slice(0, 180).replace(/\s+/g, " ")})`,
    );
    assert(
      /Current/i.test(trayText) && /(Suggested|AI Draft|Proposed|Accept)/i.test(trayText),
      "tray shows comparison",
    );
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "tk-enrich-slice6-ai-tray-desktop-farm-animals.png"),
      fullPage: false,
    });

    // Deselect all then select first only (partial approval)
    await page.evaluate(() => {
      document.querySelectorAll("[data-ai-select]").forEach((input, index) => {
        const shouldCheck = index === 0;
        if (input.checked !== shouldCheck) input.click();
      });
    });
    // Edit first suggestion text
    await page.locator("[data-ai-edit='0']").click({ force: true });
    await page.fill("[data-ai-edit-text='0']", "Edited Farm Animals AI tip for Discovery Basket.");
    await page.locator("[data-ai-edit='0']").click({ force: true }); // done editing
    await page.locator("[data-ai-accept='0']").click({ force: true });
    await page.locator("[data-ai-insert-selected]").click({ force: true });
    await page.waitForFunction(() => {
      const status = document.querySelector(".tk-enrich-status");
      return status && /(Accepted|Inserted).*(AI|draft)/i.test(status.textContent || "");
    }, { timeout: 15000 });

    const afterInsert = await page.evaluate(() => ({
      tips: window.LLHTeachingKitEnrichmentEditor
        ? (function () {
          // read from open editor state via DOM tip cards + status
          return {
            status: document.querySelector(".tk-enrich-status")?.textContent || "",
            tipText: document.body.innerText || "",
            saveCalls: window.__saveCalls,
            publishCalls: window.__publishCalls,
          };
        }())
        : null,
    }));
    assert(/(Accepted|Inserted)/i.test(afterInsert.tips.status), "status shows accepted into draft");
    assert(afterInsert.tips.tipText.includes(existingTip), "existing tip still visible");
    assert(afterInsert.tips.tipText.includes("Edited Farm Animals AI tip"), "edited tip inserted");
    assert(afterInsert.tips.saveCalls === 0, "AI insert did not autosave");
    assert(afterInsert.tips.publishCalls === 0, "AI insert did not publish");

    // Server draft unchanged until explicit save (no automatic save)
    const mid = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    const farmMid = (mid.json.siteContent.curriculum.lessonPlans || []).find((p) => p.id === planPayload.id);
    assert(
      !JSON.stringify(farmMid.enrichmentDraft).includes("Edited Farm Animals AI tip"),
      "server draft unchanged without save",
    );
    assert(
      farmMid.enrichmentDraft.activities[DISCOVERY_ID].teacherTips.includes(existingTip),
      "server still has original tip",
    );
    const publishedMid = JSON.stringify({
      title: farmMid.title,
      weeklyOverview: farmMid.weeklyOverview,
      dailyPlans: farmMid.dailyPlans,
      enrichmentPublishHistory: farmMid.enrichmentPublishHistory || null,
    });
    assert(publishedMid === publishedBodyBefore, "published lesson body unchanged by AI");

    // Discard / reject-all path
    await openAiTray(page);
    await page.waitForSelector(".tk-enrich-ai-card", { timeout: 10000 });
    const rejectBtn = page.locator("[data-ai-discard-all], [data-ai-reject-all], [data-ai-cancel]").first();
    await rejectBtn.click({ force: true });
    await page.waitForSelector("[data-ai-tray]", { state: "detached", timeout: 5000 }).catch(() => {});
    const discardStatus = await page.locator(".tk-enrich-status").innerText();
    assert(/discarded|rejected|canceled|unchanged|cancelled/i.test(discardStatus), "discard updates status");

    // Timeout UI — monkeypatch one suggest call
    await page.evaluate(() => {
      const original = window.fetch.bind(window);
      window.fetch = async (url, opts) => {
        if (String(url).includes("enrichment-ai-suggest")) {
          const body = JSON.parse(opts.body || "{}");
          body.simulate = "timeout";
          opts = { ...opts, body: JSON.stringify(body) };
          window.fetch = original;
        }
        return original(url, opts);
      };
    });
    await openAiTray(page);
    await page.waitForFunction(() => /timed out|failed/i.test(document.querySelector("[data-ai-tray]")?.innerText || ""), {
      timeout: 10000,
    });
    assert(await page.locator("[data-ai-retry]").count() >= 1, "retry control shown");
    await page.locator("[data-ai-cancel]").click({ force: true });

    // Viewport screenshots tablet + mobile
    for (const vp of [
      { name: "tablet", width: 834, height: 1100 },
      { name: "mobile", width: 390, height: 844 },
    ]) {
      await openEditor(page, { width: vp.width, height: vp.height }, farmFail.enrichmentDraft);
      await openAiTray(page);
      await page.waitForSelector(".tk-enrich-ai-card", { timeout: 10000 });
      const overflow = await page.evaluate(() => {
        const shell = document.querySelector(".tk-enrich-shell");
        return shell ? shell.scrollWidth > shell.clientWidth + 2 : true;
      });
      assert(overflow === false, `${vp.name}: no horizontal overflow`);
      await page.screenshot({
        path: path.join(ARTIFACT_DIR, `tk-enrich-slice6-ai-tray-${vp.name}-farm-animals.png`),
        fullPage: false,
      });
      await page.locator("[data-ai-cancel]").click({ force: true });
    }

    // Unrelated lesson + access tiers unchanged
    const finalStore = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    const otherAfter = (finalStore.json.siteContent.curriculum.lessonPlans || []).find((p) => p.id === OTHER_LESSON_ID);
    assert(JSON.stringify(otherAfter) === otherBefore, "unrelated lesson unchanged");
    for (const [tier, email] of [["free", FREE_USER], ["trial", TRIAL_USER], ["pro", PRO_USER]]) {
      const kit = await teachingKitAccess(email, planPayload.id);
      assert(kit.status === 200, `${tier} kit after AI`);
      assert((kit.json.teachingKit?.locked === true) === accessBefore[tier].locked, `${tier} locked unchanged`);
      assert((kit.json.teachingKit?.access || "") === accessBefore[tier].access, `${tier} access unchanged`);
    }

    // Insert log endpoint does not write curriculum
    const logRes = await requestJson("POST", "/api/admin/curriculum/enrichment-ai-insert-log", {
      adminToken,
      planId: planPayload.id,
      activityKey: DISCOVERY_ID,
      requestId: suggest1.json.requestId,
      fields: ["teacherTips"],
      insertedCount: 1,
    }, { Authorization: `Bearer ${adminToken}` });
    assert(logRes.status === 200 && logRes.json?.autoSaved === false && logRes.json?.autoPublished === false, "insert log is log-only");

    console.log(`OK teaching-kit-enrichment-slice-6 (${passed} assertions)`);
    console.log(`Artifacts: ${ARTIFACT_DIR}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    child.kill("SIGTERM");
    try {
      await new Promise((resolve) => child.once("exit", resolve));
    } catch {
      /* ignore */
    }
    fs.rmSync(STORE_PATH, { force: true });
    fs.rmSync(STORE_PATH.replace(/(\.json)?$/, ".admin-sessions.json"), { force: true });
  }
}

main().catch((error) => {
  console.error("FAIL teaching-kit-enrichment-slice-6:", error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
