#!/usr/bin/env node
/**
 * Teaching Kit Enrichment — autosave / delete race regressions.
 *
 * Covers:
 * 1) Empty draft tip/vocab lists do not fall back to published content
 * 2) Stale autosave responses keep newer local edits (editGeneration)
 * 3) Delete-then-save echo verification (empty tips must match)
 * 4) Overlapping save snapshots do not clobber a newer local draft
 * 5) Editor static guards: no full remount after successful autosave
 *
 * Isolated fixtures only — does not change curriculum content.
 * Run: npm run test:teaching-kit-enrichment-autosave-race
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const enrichment = require("./teaching-kit-enrichment.js");

const ROOT = path.join(__dirname, "..");
const PORT = 5900 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-tk-autosave-race-${process.pid}.json`);
const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(ROOT, "scripts/fixtures/teaching-kit/farm-animals-enrichment-slice2.json"), "utf8"),
);
const ADMIN = {
  email: "tk-autosave-race-admin@example.com",
  password: "tk-autosave-race-pass",
  code: "tk-autosave-race-code",
};

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
  console.log(`  ✓ ${message}`);
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

async function waitForHealth(child, timeoutMs = 25000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode != null) throw new Error(`Server exited early: ${child.exitCode}`);
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Timed out waiting for server health");
}

async function adminLogin() {
  const res = await requestJson("POST", "/api/admin/login", {
    email: ADMIN.email,
    password: ADMIN.password,
    code: ADMIN.code,
  });
  ok(res.status === 200 && (res.json?.token || res.json?.adminToken), "admin login");
  return res.json.token || res.json.adminToken;
}

function discoveryActivity() {
  return (FIXTURE.activities || []).find((a) => /Animal Discovery Basket/i.test(a.title || "")) || null;
}

function unitTests() {
  console.log("Unit: view + resolveDraftSaveSuccess + echo digests");
  const published = {
    id: "act-discovery",
    title: "Farm Animal Discovery Basket",
    teacherTips: ["Keep basket at child height", "Name each animal"],
    vocabulary: ["hoof", "snout", "barn"],
  };

  const emptyOwned = enrichment.activityEnrichmentView(published, {
    teacherTips: [],
    vocabulary: [],
  });
  ok(emptyOwned.teacherTips.length === 0, "empty draft tips do not fall back to published");
  ok(emptyOwned.vocabulary.length === 0, "empty draft vocabulary does not fall back to published");

  const unpublished = enrichment.activityEnrichmentView(published, {});
  ok(unpublished.teacherTips.length === 2, "missing draft tips still show published until owned");
  ok(unpublished.vocabulary.length === 3, "missing draft vocab still shows published until owned");

  const localDraft = {
    activities: {
      "act-discovery": {
        teacherTips: ["Replacement tip after delete"],
        vocabulary: ["mane"],
        imageBriefSetup: "Long pasted paragraph about the tray setup for discovery basket…",
      },
    },
    week: {},
  };
  const staleSaved = {
    activities: {
      "act-discovery": {
        teacherTips: ["Keep basket at child height", "Name each animal"],
        vocabulary: ["hoof", "snout", "barn"],
        imageBriefSetup: "Old brief",
      },
    },
    week: {},
  };

  const stale = enrichment.resolveDraftSaveSuccess({
    localDraft,
    savedDraft: staleSaved,
    editGenerationAtStart: 4,
    currentEditGeneration: 9,
  });
  ok(stale.keepLocalDraft === true, "stale save keeps local draft");
  ok(stale.dirty === true, "stale save leaves dirty true");
  ok(stale.queueResave === true, "stale save queues resave");
  ok(stale.remount === false, "stale save never remounts");
  ok(
    stale.draft.activities["act-discovery"].teacherTips[0] === "Replacement tip after delete",
    "stale save does not re-add deleted tips",
  );
  ok(
    stale.draft.activities["act-discovery"].vocabulary.join(",") === "mane",
    "stale save does not restore deleted vocabulary",
  );
  ok(
    /Long pasted paragraph/.test(stale.draft.activities["act-discovery"].imageBriefSetup),
    "stale save does not wipe newer typed text",
  );

  const clean = enrichment.resolveDraftSaveSuccess({
    localDraft,
    savedDraft: JSON.parse(JSON.stringify(localDraft)),
    editGenerationAtStart: 9,
    currentEditGeneration: 9,
  });
  ok(clean.dirty === false, "matching generation clears dirty");
  ok(clean.queueResave === false, "matching generation does not queue resave");
  ok(clean.remount === false, "matching generation never remounts");
  ok(clean.draft === localDraft, "matching generation keeps the same local draft object");

  const sentEmptyTips = {
    activities: { "act-discovery": { teacherTips: [], vocabulary: ["mane"] } },
    week: {},
  };
  const savedEmptyTips = {
    activities: { "act-discovery": { teacherTips: [], vocabulary: ["mane"] } },
    week: {},
  };
  const savedStaleTips = {
    activities: {
      "act-discovery": {
        teacherTips: ["Keep basket at child height"],
        vocabulary: ["mane"],
      },
    },
    week: {},
  };
  ok(
    enrichment.draftEchoMatchesSent(sentEmptyTips, savedEmptyTips) === true,
    "echo accepts intentional empty tip list",
  );
  ok(
    enrichment.draftEchoMatchesSent(sentEmptyTips, savedStaleTips) === false,
    "echo rejects stale tip reappearance",
  );

  const editorJs = fs.readFileSync(path.join(ROOT, "scripts/teaching-kit-enrichment-editor.js"), "utf8");
  ok(editorJs.includes("resolveDraftSaveSuccess"), "editor uses resolveDraftSaveSuccess");
  ok(editorJs.includes("editGeneration"), "editor tracks editGeneration");
  ok(editorJs.includes("saveRequestId"), "editor tracks saveRequestId");
  ok(editorJs.includes("renderPreservingUi"), "editor preserves UI on list edits");
  ok(editorJs.includes("renderChromeOnly();"), "editor updates chrome without remount");
  ok(
    !/Rehydrate from the verified server draft/.test(editorJs),
    "editor no longer rehydrates whole draft after every save",
  );
  // Success path must not call render() after autosave — only chrome / preserving helpers.
  const saveDraftFn = editorJs.slice(
    editorJs.indexOf("async function saveDraft"),
    editorJs.indexOf("async function publishEnrichment"),
  );
  ok(
    !/state\.draft\s*=\s*JSON\.parse\(JSON\.stringify\(savedDraft\)\)/.test(saveDraftFn),
    "saveDraft success does not overwrite local draft with savedDraft copy",
  );
  ok(saveDraftFn.includes("renderChromeOnly()"), "saveDraft success uses chrome-only update");
  ok(editorJs.includes("draftAutosaveRaceGuard: true"), "slice feature flag documents race guard");
}

async function serverRaceTests(adminToken) {
  console.log("Server: overlapping draft saves + delete-then-save");
  const discovery = discoveryActivity();
  ok(Boolean(discovery?.id), "Farm Animal Discovery Basket fixture present");
  const actKey = discovery.id;
  const planId = FIXTURE.lessonPlan.id;

  let bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
  ok(bootstrap.status === 200, "site-content bootstrap");
  let stamp = bootstrap.json.siteContent?.updatedAt || bootstrap.json.updatedAt || "";

  // Enable editor + seed Farm Animals lesson (isolated fixture only).
  const flagSave = await requestJson("POST", "/api/admin/site-content", {
    adminToken,
    expectedUpdatedAt: stamp,
    siteContent: {
      ...(bootstrap.json.siteContent || {}),
      updatedAt: stamp,
      featureFlags: {
        ...((bootstrap.json.siteContent || {}).featureFlags || {}),
        teachingKitViewer: false,
        teachingKitPrintCenter: false,
        teachingKitAttachments: false,
        teachingKitEnrichmentEditor: true,
      },
    },
  }, { Authorization: `Bearer ${adminToken}` });
  ok(flagSave.status === 200, `flags saved (${flagSave.status})`);
  stamp = flagSave.json.siteContent?.updatedAt || flagSave.json.siteContentUpdatedAt || stamp;

  const planPayload = { ...FIXTURE.lessonPlan, resourceIds: [] };
  const savePlan = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken,
    expectedUpdatedAt: stamp,
    lessonPlan: planPayload,
  }, { Authorization: `Bearer ${adminToken}` });
  ok(savePlan.status === 200, `farm plan seeded (${savePlan.status})`);
  stamp = savePlan.json.siteContentUpdatedAt || stamp;

  const seedDraft = {
    activities: {
      [actKey]: {
        teacherTips: ["Keep basket at child height", "Name each animal slowly"],
        vocabulary: ["hoof", "snout"],
        imageBriefSetup: "Seed brief",
      },
    },
    week: { familyConnection: "Talk about farm animals at home." },
    updatedAt: new Date().toISOString(),
    lastEditedBy: ADMIN.email,
  };

  const seed = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    saveMode: "enrichment_draft",
    expectedUpdatedAt: stamp,
    adminEmail: ADMIN.email,
    lessonPlan: { id: planId, enrichmentDraft: seedDraft },
  }, { Authorization: `Bearer ${adminToken}` });
  ok(seed.status === 200, `seed draft saved (${seed.status})`);
  stamp = seed.json.siteContentUpdatedAt || stamp;

  // Simulate overlapping saves: older payload in flight, newer local delete already applied.
  const olderPayload = {
    activities: {
      [actKey]: {
        teacherTips: ["Keep basket at child height", "Name each animal slowly"],
        vocabulary: ["hoof", "snout"],
        imageBriefSetup: "Typing continuously AAA",
      },
    },
    week: seedDraft.week,
    updatedAt: new Date().toISOString(),
    lastEditedBy: ADMIN.email,
  };
  const newerLocal = {
    activities: {
      [actKey]: {
        teacherTips: ["Replacement tip after delete"],
        vocabulary: ["mane", "fleece"],
        imageBriefSetup: `${"Typing continuously BBB — pasted long paragraph. ".repeat(12).trim()}`,
      },
    },
    week: seedDraft.week,
    updatedAt: new Date().toISOString(),
    lastEditedBy: ADMIN.email,
  };

  const olderPromise = requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    saveMode: "enrichment_draft",
    expectedUpdatedAt: stamp,
    adminEmail: ADMIN.email,
    lessonPlan: { id: planId, enrichmentDraft: olderPayload },
  }, { Authorization: `Bearer ${adminToken}` });

  // Client would keep newerLocal in memory and reject applying older response via generation.
  const resolution = enrichment.resolveDraftSaveSuccess({
    localDraft: newerLocal,
    savedDraft: olderPayload,
    editGenerationAtStart: 1,
    currentEditGeneration: 5,
  });
  ok(resolution.draft === newerLocal, "client ignores older overlapping save for local state");
  ok(resolution.queueResave === true, "client queues resave of newer local snapshot");

  const olderRes = await olderPromise;
  ok(olderRes.status === 200, "older overlapping request still returns 200 from server");
  stamp = olderRes.json.siteContentUpdatedAt || stamp;

  // Flush the newer snapshot (what the queued autosave must send).
  const newerRes = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    saveMode: "enrichment_draft",
    expectedUpdatedAt: stamp,
    adminEmail: ADMIN.email,
    lessonPlan: { id: planId, enrichmentDraft: newerLocal },
  }, { Authorization: `Bearer ${adminToken}` });
  ok(newerRes.status === 200, `newer delete/type snapshot saved (${newerRes.status})`);
  stamp = newerRes.json.siteContentUpdatedAt || stamp;

  const savedPlan = newerRes.json.lessonPlan
    || (newerRes.json.curriculum?.lessonPlans || []).find((item) => item.id === planId);
  const savedAct = savedPlan?.enrichmentDraft?.activities?.[actKey] || {};
  ok(
    Array.isArray(savedAct.teacherTips)
      && savedAct.teacherTips.length === 1
      && savedAct.teacherTips[0] === "Replacement tip after delete",
    "deleted tips stay deleted after final save",
  );
  ok(
    Array.isArray(savedAct.vocabulary)
      && savedAct.vocabulary.join(",") === "mane,fleece",
    "vocabulary delete+add persisted",
  );
  ok(
    /pasted long paragraph/i.test(String(savedAct.imageBriefSetup || "")),
    "long pasted paragraph persisted",
  );
  ok(
    enrichment.draftEchoMatchesSent(newerLocal, savedPlan.enrichmentDraft),
    "server echo matches the newest sent snapshot",
  );

  // Reload path: open would clone enrichmentDraft — confirm latest version is what comes back.
  const reload = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
  const reloaded = (reload.json.siteContent?.curriculum?.lessonPlans || [])
    .find((item) => item.id === planId);
  const reloadedTips = reloaded?.enrichmentDraft?.activities?.[actKey]?.teacherTips || [];
  ok(
    reloadedTips.length === 1 && reloadedTips[0] === "Replacement tip after delete",
    "navigate away/back (reload) keeps latest tip version",
  );
}

/**
 * Browser sequence on Farm Animal Discovery Basket:
 * continuous typing through overlapping autosaves, tip delete+replace,
 * vocab delete+add, long paste — no rollback, no scroll/focus jump.
 */
async function browserDiscoverySequence(adminToken) {
  console.log("Browser: Animal Discovery Basket edit sequence");
  let browser;
  try {
    const { chromium } = require("playwright");
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    console.log(`  (skip browser sequence — playwright unavailable: ${error.message})`);
    return;
  }

  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(
      () => typeof window.LLHTeachingKitEnrichment !== "undefined"
        && typeof window.LLHTeachingKitEnrichmentEditor !== "undefined",
      null,
      { timeout: 30000 },
    );

    const discovery = discoveryActivity();
    const result = await page.evaluate(async (payload) => {
      const plan = {
        ...payload.lessonPlan,
        enrichmentDraft: payload.enrichmentDraft,
      };
      const activities = payload.activities;
      const discoveryId = payload.discoveryId;

      window.curriculumLessonPlanById = (id) => (id === plan.id ? plan : null);
      window.curriculumActivitiesForLesson = (id) => (id === plan.id ? activities : []);
      window.effectiveSiteContent = () => ({ featureFlags: { teachingKitEnrichmentEditor: true } });
      window.adminSession = () => ({ token: payload.adminToken, email: "autosave-race@example.com" });
      window.curriculumExpectedUpdatedAt = () => "2026-08-07T00:00:00.000Z";
      window.applyCurriculumState = (curriculum) => {
        const next = (curriculum?.lessonPlans || []).find((item) => item.id === plan.id);
        if (next) Object.assign(plan, next);
      };
      window.curriculumLessonPlanConfig = { endpoint: "/api/admin/curriculum/lesson-plans" };
      window.confirm = () => true;

      // Intercept saves: delay first responses so overlapping edits race the echo.
      const originalFetch = window.fetch.bind(window);
      let saveCount = 0;
      window.fetch = async (input, init = {}) => {
        const url = String(input || "");
        if (!url.includes("/api/admin/curriculum/lesson-plans") || String(init.method || "GET").toUpperCase() !== "POST") {
          return originalFetch(input, init);
        }
        saveCount += 1;
        const body = JSON.parse(init.body || "{}");
        const sent = body?.lessonPlan?.enrichmentDraft || null;
        const delayMs = saveCount <= 2 ? 180 : 40;
        await new Promise((r) => setTimeout(r, delayMs));
        // Echo the *sent* snapshot (server truth for this request) — client must still
        // reject applying it when editGeneration advanced.
        const echoed = {
          ok: true,
          siteContentUpdatedAt: new Date().toISOString(),
          lessonPlan: {
            id: plan.id,
            enrichmentDraft: sent,
          },
          curriculum: {
            lessonPlans: [{ ...plan, enrichmentDraft: sent }],
          },
        };
        return new Response(JSON.stringify(echoed), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      };

      document.body.classList.add("tk-enrich-open");
      const host = document.querySelector("#adminTeachingKitEnrichmentHost")
        || (() => {
          const el = document.createElement("div");
          el.id = "adminTeachingKitEnrichmentHost";
          document.body.appendChild(el);
          return el;
        })();
      host.scrollTop = 420;

      const editor = window.LLHTeachingKitEnrichmentEditor;
      editor.open(plan.id);

      const discoveryBtn = Array.from(document.querySelectorAll("[data-activity-index]"))
        .find((btn) => /Discovery Basket/i.test(btn.textContent || ""));
      if (discoveryBtn) discoveryBtn.click();

      const brief = document.querySelector("[data-image-brief-setup]");
      if (!brief) {
        return {
          ok: false,
          reason: "missing image brief field",
          body: (document.body.innerText || "").slice(0, 500),
          activityHead: document.querySelector("[data-enrich-title]")?.textContent || "",
        };
      }
      brief.focus();
      const scrollBefore = {
        host: host.scrollTop,
        win: window.scrollY,
      };

      // Continuous typing while autosave fires.
      const typed = [];
      for (let i = 0; i < 8; i += 1) {
        brief.value = `${brief.value}tip-type-${i} `;
        brief.dispatchEvent(new Event("input", { bubbles: true }));
        typed.push(`tip-type-${i}`);
        // Trigger autosave immediately (bypass timer).
        // eslint-disable-next-line no-await-in-loop
        await editor.saveDraft({ silent: true });
      }

      // Delete existing teacher tip(s) one at a time (remount invalidates NodeLists).
      for (let guard = 0; guard < 12; guard += 1) {
        const tipRemove = document.querySelector("[data-tip-remove]");
        if (!tipRemove) break;
        tipRemove.click();
      }

      // Add replacement tip.
      const tipForm = document.querySelector("[data-tip-add]");
      const tipInput = tipForm?.querySelector("input");
      if (tipInput && tipForm) {
        tipInput.value = "Replacement tip after delete";
        if (typeof tipForm.requestSubmit === "function") tipForm.requestSubmit();
        else tipForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      }

      // Delete vocabulary chips then add new ones.
      for (let guard = 0; guard < 24; guard += 1) {
        const vocabRemove = document.querySelector("[data-vocab-remove]");
        if (!vocabRemove) break;
        vocabRemove.click();
      }
      const vocabForm = document.querySelector("[data-vocab-add]");
      const vocabInput = vocabForm?.querySelector("input");
      if (vocabInput && vocabForm) {
        vocabInput.value = "mane";
        if (typeof vocabForm.requestSubmit === "function") vocabForm.requestSubmit();
        else vocabForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        const vocabInput2 = document.querySelector("[data-vocab-add] input");
        const vocabForm2 = document.querySelector("[data-vocab-add]");
        if (vocabInput2 && vocabForm2) {
          vocabInput2.value = "fleece";
          if (typeof vocabForm2.requestSubmit === "function") vocabForm2.requestSubmit();
          else vocabForm2.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        }
      }

      // Re-query brief after list remounts — never type into a detached node.
      const briefAfterLists = document.querySelector("[data-image-brief-setup]");
      if (!briefAfterLists) {
        return { ok: false, reason: "brief missing after list edits" };
      }
      const longPaste = `${"Pastoral discovery basket setup with natural light and ordinary materials. ".repeat(10)}`;
      briefAfterLists.focus();
      briefAfterLists.value = `${String(briefAfterLists.value || "")}\n${longPaste}`;
      briefAfterLists.dispatchEvent(new Event("input", { bubbles: true }));
      for (let i = 0; i < 4; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await editor.saveDraft({ silent: true });
      }

      const draft = editor.getDraft();
      const actKeys = Object.keys(draft?.activities || {});
      const resolvedKey = actKeys.includes(discoveryId)
        ? discoveryId
        : (actKeys.find((k) => Array.isArray(draft.activities[k]?.teacherTips)) || discoveryId);
      const act = draft?.activities?.[resolvedKey] || {};
      const scrollAfter = {
        host: host.scrollTop,
        win: window.scrollY,
      };

      // Navigate away and back (force close keeps local draft for reopen seed).
      await editor.close({ force: true });
      plan.enrichmentDraft = JSON.parse(JSON.stringify(draft));
      editor.open(plan.id);
      const discoveryBtn2 = Array.from(document.querySelectorAll("[data-activity-index]"))
        .find((btn) => /Discovery Basket/i.test(btn.textContent || ""));
      if (discoveryBtn2) discoveryBtn2.click();
      const afterReopen = editor.getDraft()?.activities?.[resolvedKey] || {};

      return {
        ok: true,
        saveCount,
        discoveryId,
        resolvedKey,
        actKeys,
        tips: act.teacherTips || [],
        vocabulary: act.vocabulary || [],
        brief: String(act.imageBriefSetup || ""),
        tipsAfterReopen: afterReopen.teacherTips || [],
        vocabAfterReopen: afterReopen.vocabulary || [],
        briefAfterReopen: String(afterReopen.imageBriefSetup || ""),
        scrollBefore,
        scrollAfter,
        typedJoined: typed.join("|"),
        remountGuard: editor.sliceFeatures()?.draftAutosaveRaceGuard === true,
        visibleTips: Array.from(document.querySelectorAll(".tk-enrich-tip-card span")).map((el) => el.textContent || ""),
        activityTitle: document.querySelector("[data-enrich-title]")?.textContent || "",
      };
    }, {
      lessonPlan: FIXTURE.lessonPlan,
      activities: FIXTURE.activities,
      enrichmentDraft: FIXTURE.enrichmentDraft,
      discoveryId: discovery.id,
      adminToken,
    });

    ok(result.ok === true, `browser sequence ran (${result.reason || "ok"})`);
    ok(result.remountGuard === true, "draftAutosaveRaceGuard enabled in editor");
    ok(result.saveCount >= 5, `multiple autosaves fired (${result.saveCount})`);
    if (!(
      Array.isArray(result.tips)
      && result.tips.length === 1
      && result.tips[0] === "Replacement tip after delete"
    )) {
      console.error("tip debug", {
        tips: result.tips,
        visibleTips: result.visibleTips,
        actKeys: result.actKeys,
        discoveryId: result.discoveryId,
        activityTitle: result.activityTitle,
      });
    }
    ok(
      Array.isArray(result.tips)
        && result.tips.length === 1
        && result.tips[0] === "Replacement tip after delete",
      "deleted tips stay gone; replacement tip present",
    );
    ok(
      Array.isArray(result.vocabulary)
        && result.vocabulary.includes("mane")
        && result.vocabulary.includes("fleece"),
      "vocabulary delete+add persisted locally",
    );
    if (Array.isArray(result.vocabulary) && result.vocabulary.some((w) => /cow|barn|hoof|snout/i.test(String(w)))) {
      console.error("vocab debug — old words still present", result.vocabulary);
    }
    ok(
      Array.isArray(result.vocabulary)
        && !result.vocabulary.some((w) => /^(cow|barn|hoof|snout)$/i.test(String(w))),
      "deleted vocabulary words do not reappear",
    );
    ok(/Pastoral discovery basket setup/i.test(result.brief), "long pasted paragraph kept");
    ok(/tip-type-7/.test(result.brief), "continuous typing kept through overlapping autosaves");
    ok(
      Math.abs((result.scrollAfter?.win || 0) - (result.scrollBefore?.win || 0)) < 80,
      "window scroll did not jump to top during autosave/delete",
    );
    ok(
      result.tipsAfterReopen[0] === "Replacement tip after delete",
      "reopen keeps latest tip version",
    );
    ok(
      /Pastoral discovery basket setup/i.test(result.briefAfterReopen),
      "reopen keeps long pasted paragraph",
    );
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

async function main() {
  unitTests();

  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {},
    siteContent: {
      featureFlags: {
        teachingKitViewer: false,
        teachingKitPrintCenter: false,
        teachingKitAttachments: false,
        teachingKitEnrichmentEditor: false,
      },
      curriculum: { lessonPlans: [], activities: [], resources: [] },
      updatedAt: new Date().toISOString(),
    },
    adminSessions: {},
  }));

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      NODE_ENV: "test",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

  try {
    await waitForHealth(child);
    const adminToken = await adminLogin();
    await serverRaceTests(adminToken);
    await browserDiscoverySequence(adminToken);
    console.log(`OK teaching-kit-enrichment-autosave-race (${passed} assertions)`);
  } catch (error) {
    if (stderr) console.error(stderr.slice(-4000));
    throw error;
  } finally {
    child.kill("SIGTERM");
    try {
      await new Promise((resolve) => child.once("exit", resolve));
    } catch { /* ignore */ }
    fs.rmSync(STORE_PATH, { force: true });
    fs.rmSync(STORE_PATH.replace(/\.json$/, ".admin-sessions.json"), { force: true });
  }
}

main().catch((error) => {
  console.error("FAIL teaching-kit-enrichment-autosave-race:", error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
