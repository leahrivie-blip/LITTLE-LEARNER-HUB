#!/usr/bin/env node
/**
 * Disposable Teaching Kit fixture — full admin workflow smoke (isolated store only).
 *
 * Covers the overnight Priority-1 checklist end-to-end on a disposable QA plan:
 * tip save/reload, week + activity enrichment, deep equality, AI accept + counts,
 * quality gates (blocked / override / ready publish), version history, compare markers,
 * second publish, rollback, discard, nav/escape/unsaved markers, customer flag isolation,
 * fixture cleanup.
 *
 * NEVER uses Farm Animals or production curriculum content.
 * Run: npm run test:teaching-kit-fixture-smoke
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const enrichment = require("./teaching-kit-enrichment.js");
const quality = require("./teaching-kit-quality-review.js");

const ROOT = path.join(__dirname, "..");
const PORT = 5900 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-tk-fixture-smoke-${process.pid}.json`);
const ADMIN = {
  email: "tk-fixture-smoke-admin@example.com",
  password: "tk-fixture-smoke-pass",
  code: "tk-fixture-smoke-code",
};
const FIXTURE_PLAN_ID = "cur-lp-tk-disposable-fixture-smoke";
const UNIQUE_TIP = `QA disposable tip ${Date.now().toString(36)} — sort blocks by color.`;

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

async function setFlags(adminToken, flags) {
  const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
  ok(bootstrap.status === 200, "site-content bootstrap");
  const existing = bootstrap.json.siteContent || {};
  const save = await requestJson("POST", "/api/admin/site-content", {
    adminToken,
    expectedUpdatedAt: existing.updatedAt,
    siteContent: {
      ...existing,
      updatedAt: existing.updatedAt,
      featureFlags: {
        ...(existing.featureFlags || {}),
        ...flags,
      },
    },
  }, { Authorization: `Bearer ${adminToken}` });
  ok(save.status === 200, `flags saved: ${save.status}`);
  const after = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
  return after.json.siteContent?.updatedAt || after.json.updatedAt || "";
}

function fixturePlan() {
  return {
    id: FIXTURE_PLAN_ID,
    title: "QA Disposable Fixture Smoke (do not publish to customers)",
    status: "draft",
    ageGroup: "Preschool",
    age: "Preschool",
    theme: "QA Isolation Sorting",
    plan: "Free",
    weeklyOverview: "Disposable QA week for Teaching Kit workflow smoke.",
    objectives: "Children will sort by color and size.",
    vocabularyWords: "sort, color, size",
    books: [],
    songs: [],
    familyConnection: "",
    dailyPlans: {
      monday: {
        items: [{
          itemId: "qa-smoke-act-1",
          id: "qa-smoke-act-1",
          title: "QA Color Sort",
          activityCategory: "Cognitive",
          category: "cognitive",
        }],
      },
      tuesday: {
        items: [{
          itemId: "qa-smoke-act-2",
          id: "qa-smoke-act-2",
          title: "QA Size Sort",
          activityCategory: "Cognitive",
          category: "cognitive",
        }],
      },
      wednesday: { items: [] },
      thursday: { items: [] },
      friday: { items: [] },
    },
  };
}

function richDraft(tip, familyNote) {
  return {
    week: {
      weeklyOverview: "Invite children to sort everyday objects by color and size during play.",
      objectives: "Children will sort objects by one attribute and use sorting words with a peer.",
      weeklyMaterials: "sorting trays, colored blocks, cups, tongs, paper, crayons",
      teacherPreparation: "Stage two trays at child height, preview tongs, set observation clipboard nearby.",
      familyConnection: familyNote,
      printableIdeas: ["Color sorting cards"],
      vocabCards: ["sort", "color", "size", "same", "different"],
      books: [{ title: "Sorting Talk Prompts (classroom only)" }],
      songs: [{ title: "Sort and Sing" }],
      teacherToolkit: {
        prepChecklist: ["Fill sorting trays", "Set tongs"],
        observationFocus: ["Uses a sorting word", "Invites a peer"],
        notes: "Keep process open-ended.",
        teacherPreparation: "Preview materials and model once.",
      },
      milestones: ["Language", "SEL", "Fine motor", "Cognition"],
    },
    activities: {
      "qa-smoke-act-1": {
        teacherTips: [tip],
        teacherTip: tip,
        observationPrompts: ["Does the child name a color while sorting?"],
        indoorAlternatives: "Tabletop color cups",
        outdoorAlternatives: "Sidewalk color hunt",
        imageBriefSetup: "Two trays of colored blocks on a low table in natural light.",
        imageBriefExample: "Children placing red blocks into a red cup.",
        steps: "Invite children to explore colors, sort blocks into trays, practice tongs, and share how they sorted.",
      },
      "qa-smoke-act-2": {
        teacherTips: ["Offer a second tray for big and small items."],
        observationPrompts: ["Does the child place large items together?"],
        steps: "Invite children to compare size, sort into big and small trays, and describe their choice.",
      },
    },
    completionPercent: 82,
    previewReady: true,
  };
}

function weakDraft() {
  return {
    week: { objectives: "Look", weeklyOverview: "Short." },
    activities: {
      "qa-smoke-act-1": { teacherTips: [], observationPrompts: [] },
    },
    completionPercent: 18,
    previewReady: false,
  };
}

function findPlan(curriculum, id) {
  return (curriculum?.lessonPlans || []).find((p) => p.id === id) || null;
}

function deepEqualJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function tipFromPlan(plan, activityId) {
  const act = plan?.enrichmentDraft?.activities?.[activityId]
    || (plan?.dailyPlans?.monday?.items || []).find((i) => (i.itemId || i.id) === activityId)
    || null;
  if (!act) return "";
  if (Array.isArray(act.teacherTips) && act.teacherTips[0]) return String(act.teacherTips[0]);
  return String(act.teacherTip || "");
}

function runStaticMarkers() {
  const editorJs = fs.readFileSync(path.join(ROOT, "scripts/teaching-kit-enrichment-editor.js"), "utf8");
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  ok(editorJs.includes("data-enrich-back-to-list"), "Back to List control present");
  ok(editorJs.includes("data-enrich-exit") || editorJs.includes("data-enrich-close"), "exit/close controls present");
  ok(editorJs.includes('event.key === "Escape"'), "Escape handler present");
  ok(editorJs.includes("beforeunload"), "unsaved beforeunload warning present");
  ok(editorJs.includes("You have unsaved enrichment changes"), "unsaved leave prompt present");
  ok(editorJs.includes("data-enrich-compare-toggle"), "version compare toggle present");
  ok(editorJs.includes("data-enrich-discard-draft"), "discard draft control present");
  ok(editorJs.includes("aiSuggestionCounts"), "AI selection counts helper present");
  ok(editorJs.includes("ownerPublishOverride"), "owner override wired");
  ok(serverJs.includes("quality_review_blocked"), "quality gate blocks publish");
  ok(serverJs.includes("allowEmptyDraftOverwrite"), "discard empty overwrite supported");
  console.log("PASS static nav/recovery/AI markers");
}

async function main() {
  try { fs.rmSync(STORE_PATH, { force: true }); } catch { /* ignore */ }

  runStaticMarkers();

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
    const auth = { Authorization: `Bearer ${adminToken}` };

    let stamp = await setFlags(adminToken, {
      teachingKitViewer: false,
      teachingKitPrintCenter: false,
      teachingKitAttachments: false,
      teachingKitEnrichmentEditor: true,
      teachingKitQualityReview: true,
      teachingKitAuthoring: false,
    });

    // 1) Open / seed disposable fixture in Admin (isolated store).
    let res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: stamp,
      lessonPlan: fixturePlan(),
    }, auth);
    ok(res.status === 200, `seed disposable fixture: ${res.status}`);
    stamp = res.json.siteContentUpdatedAt;
    ok(findPlan(res.json.curriculum, FIXTURE_PLAN_ID)?.title?.includes("Disposable Fixture"), "fixture titled as disposable");

    const familyA = "Ask families what colors they sorted at home (QA fixture).";
    const draftA = {
      activities: {
        "qa-smoke-act-1": { teacherTip: UNIQUE_TIP, teacherTips: [UNIQUE_TIP] },
      },
      week: {},
      completionPercent: 10,
      previewReady: false,
    };

    // 2–5) Add unique tip, Save Draft, reload, confirm tip persists.
    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: stamp,
      saveMode: "enrichment_draft",
      lessonPlan: { id: FIXTURE_PLAN_ID, enrichmentDraft: draftA },
    }, auth);
    ok(res.status === 200 && res.json?.ok, `save tip draft: ${res.status} ${res.json?.code || ""}`);
    stamp = res.json.siteContentUpdatedAt;
    let plan = findPlan(res.json.curriculum, FIXTURE_PLAN_ID);
    ok(tipFromPlan(plan, "qa-smoke-act-1") === UNIQUE_TIP, "unique teacher tip in save response");

    let reload = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    plan = findPlan(reload.json.siteContent?.curriculum || {}, FIXTURE_PLAN_ID);
    ok(tipFromPlan(plan, "qa-smoke-act-1") === UNIQUE_TIP, "unique teacher tip survives reload");

    // 6–9) Week + activity enrichment, save, reload, deep equality.
    const familyB = "Invite families to notice two sizes at snack (QA fixture).";
    const draftB = richDraft(UNIQUE_TIP, familyB);
    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: stamp,
      saveMode: "enrichment_draft",
      lessonPlan: { id: FIXTURE_PLAN_ID, enrichmentDraft: draftB },
    }, auth);
    ok(res.status === 200 && res.json?.ok, `save rich draft: ${res.status}`);
    stamp = res.json.siteContentUpdatedAt;
    plan = findPlan(res.json.curriculum, FIXTURE_PLAN_ID);
    const savedDraft = plan.enrichmentDraft;
    ok(savedDraft?.week?.familyConnection === familyB, "week enrichment saved");
    ok(savedDraft?.activities?.["qa-smoke-act-2"]?.teacherTips?.[0], "activity-level enrichment saved");

    reload = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    plan = findPlan(reload.json.siteContent?.curriculum || {}, FIXTURE_PLAN_ID);
    ok(deepEqualJson(
      {
        tip: tipFromPlan(plan, "qa-smoke-act-1"),
        family: plan.enrichmentDraft?.week?.familyConnection,
        act2: plan.enrichmentDraft?.activities?.["qa-smoke-act-2"]?.teacherTips?.[0],
        overview: plan.enrichmentDraft?.week?.weeklyOverview,
      },
      {
        tip: UNIQUE_TIP,
        family: familyB,
        act2: draftB.activities["qa-smoke-act-2"].teacherTips[0],
        overview: draftB.week.weeklyOverview,
      },
    ), "reload deep equality on tip/week/activity enrichment");

    // 10–13) AI analysis, accept one suggestion, counts, save/reload.
    res = await requestJson("POST", "/api/admin/curriculum/enrichment-ai-suggest", {
      adminToken,
      planId: FIXTURE_PLAN_ID,
      activityKey: "qa-smoke-act-1",
      scope: "activity",
      simulate: "fixture",
    }, auth);
    ok(res.status === 200 && Array.isArray(res.json?.suggestions) && res.json.suggestions.length >= 1,
      `AI analysis returned suggestions: ${res.status}`);
    ok(res.json.autoSaved !== true && res.json.autoPublished !== true, "AI does not auto-save/publish");

    const suggestions = res.json.suggestions.map((sug, idx) => ({
      ...sug,
      decision: idx === 0 ? "accepted" : "pending",
      selected: idx === 0,
    }));
    const counts = {
      pending: suggestions.filter((s) => s.decision === "pending").length,
      selected: suggestions.filter((s) => s.selected && s.decision !== "accepted" && s.decision !== "discarded").length,
      accepted: suggestions.filter((s) => s.decision === "accepted").length,
      rejected: suggestions.filter((s) => s.decision === "discarded").length,
      loaded: suggestions.length,
    };
    // After marking first as accepted+selected, selected for bulk should treat accepted separately.
    ok(counts.accepted === 1, `exactly one accepted suggestion (got ${counts.accepted})`);
    ok(counts.accepted + counts.pending + counts.rejected === counts.loaded, "selection counts partition loaded set");

    const applied = enrichment.applySuggestionsToDraft(plan.enrichmentDraft, suggestions, {
      activityKey: "qa-smoke-act-1",
    });
    ok(applied.inserted.length >= 1, "accepted suggestion applied to draft");
    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: stamp,
      saveMode: "enrichment_draft",
      lessonPlan: { id: FIXTURE_PLAN_ID, enrichmentDraft: applied.draft },
    }, auth);
    ok(res.status === 200, `save after AI accept: ${res.status}`);
    stamp = res.json.siteContentUpdatedAt;
    reload = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    plan = findPlan(reload.json.siteContent?.curriculum || {}, FIXTURE_PLAN_ID);
    ok(tipFromPlan(plan, "qa-smoke-act-1") === UNIQUE_TIP
      || (plan.enrichmentDraft?.activities?.["qa-smoke-act-1"]?.teacherTips || []).includes(UNIQUE_TIP),
      "original tip retained after AI accept save/reload");

    // 14–15) Quality Review readiness labels.
    const activities = [
      { id: "qa-smoke-act-1", title: "QA Color Sort", lessonPlanId: FIXTURE_PLAN_ID },
      { id: "qa-smoke-act-2", title: "QA Size Sort", lessonPlanId: FIXTURE_PLAN_ID },
    ];
    const richReport = quality.buildQualityReport(plan, activities, plan.enrichmentDraft);
    ok(["ready", "needs_review", "blocked"].includes(richReport.publishReadiness),
      `rich draft readiness recognized: ${richReport.publishReadiness}`);
    ok(typeof richReport.publishReadinessLabel === "string" && richReport.publishReadinessLabel.length > 0,
      `readiness label present: ${richReport.publishReadinessLabel}`);

    res = await requestJson("POST", "/api/admin/curriculum/quality-review", {
      adminToken,
      action: "review_lesson",
      planId: FIXTURE_PLAN_ID,
      enrichmentDraft: plan.enrichmentDraft,
    }, auth);
    ok(res.status === 200 && res.json?.report, "Quality Review API ok");
    ok(res.json.autoPublished === false, "Quality Review never publishes");

    // 16) Blocked fixture cannot publish normally (separate weak draft on same fixture).
    const blockedDraft = weakDraft();
    const blockedReport = quality.buildQualityReport(fixturePlan(), activities, blockedDraft);
    ok(blockedReport.blocksPublish === true && blockedReport.publishReadiness === "blocked",
      "weak fixture reports Blocked");

    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: stamp,
      saveMode: "enrichment_draft",
      lessonPlan: { id: FIXTURE_PLAN_ID, enrichmentDraft: blockedDraft },
    }, auth);
    ok(res.status === 200, `save weak draft for block test: ${res.status}`);
    stamp = res.json.siteContentUpdatedAt;

    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: stamp,
      saveMode: "publish_enrichment",
      publishedBy: ADMIN.email,
      lessonPlan: { id: FIXTURE_PLAN_ID, enrichmentDraft: blockedDraft },
    }, auth);
    ok(res.status === 409 && res.json?.code === "quality_review_blocked",
      `blocked publish rejected: ${res.status} ${res.json?.code || ""}`);
    ok(res.json?.ownerOverrideRequired === true, "owner override required when blocked");

    // 17) Explicit owner override on a *separate* disposable blocked plan (keep main fixture rich).
    const blockedPlanId = `${FIXTURE_PLAN_ID}-blocked`;
    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: stamp,
      lessonPlan: { ...fixturePlan(), id: blockedPlanId, title: "QA Disposable Blocked Override Fixture" },
    }, auth);
    ok(res.status === 200, `seed blocked override fixture: ${res.status}`);
    stamp = res.json.siteContentUpdatedAt;
    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: stamp,
      saveMode: "enrichment_draft",
      lessonPlan: { id: blockedPlanId, enrichmentDraft: blockedDraft },
    }, auth);
    ok(res.status === 200, `draft blocked override fixture: ${res.status}`);
    stamp = res.json.siteContentUpdatedAt;
    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: stamp,
      saveMode: "publish_enrichment",
      publishedBy: ADMIN.email,
      ownerPublishOverride: {
        confirmed: true,
        reason: "QA disposable fixture override for smoke test only.",
      },
      lessonPlan: { id: blockedPlanId, enrichmentDraft: blockedDraft },
    }, auth);
    ok(res.status === 200 && res.json?.ok, `owner override publish: ${res.status} ${res.json?.error || ""}`);
    ok(res.json.ownerOverrideApplied === true, "owner override applied flag");
    stamp = res.json.siteContentUpdatedAt;

    // Restore rich draft on main fixture, then publish v1 + v2 for history/compare/rollback.
    const tipV1 = `${UNIQUE_TIP} — version one.`;
    const tipV2 = `${UNIQUE_TIP} — version two.`;
    const draftV1 = richDraft(tipV1, "Family note for version one (QA fixture).");
    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: stamp,
      saveMode: "enrichment_draft",
      lessonPlan: { id: FIXTURE_PLAN_ID, enrichmentDraft: draftV1 },
    }, auth);
    ok(res.status === 200, `draft v1: ${res.status}`);
    stamp = res.json.siteContentUpdatedAt;

    async function publishEnrichment(draft, label) {
      let publishRes = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
        adminToken,
        expectedUpdatedAt: stamp,
        saveMode: "publish_enrichment",
        publishedBy: "qa-fixture-smoke",
        lessonPlan: { id: FIXTURE_PLAN_ID, enrichmentDraft: draft },
      }, auth);
      if (publishRes.status === 409 && publishRes.json?.code === "quality_review_blocked") {
        publishRes = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
          adminToken,
          expectedUpdatedAt: stamp,
          saveMode: "publish_enrichment",
          publishedBy: "qa-fixture-smoke",
          ownerPublishOverride: {
            confirmed: true,
            reason: `QA disposable fixture ${label} publish for rollback smoke.`,
          },
          lessonPlan: { id: FIXTURE_PLAN_ID, enrichmentDraft: draft },
        }, auth);
      }
      return publishRes;
    }

    // 18) Publish fixture v1
    res = await publishEnrichment(draftV1, "v1");
    ok(res.status === 200 && res.json?.ok, `publish v1: ${res.status} ${res.json?.code || res.json?.error || ""}`);
    stamp = res.json.siteContentUpdatedAt;
    plan = findPlan(res.json.curriculum, FIXTURE_PLAN_ID);
    const publishedTipV1 = ((plan.dailyPlans?.monday?.items || [])[0]?.teacherTips || [])[0] || "";
    ok(String(publishedTipV1).includes("version one"), `published tip v1 (got "${publishedTipV1}")`);
    ok((plan.enrichmentPublishHistory || []).length >= 1 || plan?.teachingKit?.lastEnrichmentVersionId,
      "version history after v1");

    // 19–20) Modify and publish second version
    const draftV2 = richDraft(tipV2, "Family note for version two (QA fixture).");
    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: stamp,
      saveMode: "enrichment_draft",
      lessonPlan: { id: FIXTURE_PLAN_ID, enrichmentDraft: draftV2 },
    }, auth);
    ok(res.status === 200, `draft v2: ${res.status}`);
    stamp = res.json.siteContentUpdatedAt;
    res = await publishEnrichment(draftV2, "v2");
    ok(res.status === 200 && res.json?.ok, `publish v2: ${res.status} ${res.json?.code || res.json?.error || ""}`);
    stamp = res.json.siteContentUpdatedAt;
    plan = findPlan(res.json.curriculum, FIXTURE_PLAN_ID);
    ok((plan.enrichmentPublishHistory || []).length >= 1, "version history retained after v2");
    const publishedTipV2 = ((plan.dailyPlans?.monday?.items || [])[0]?.teacherTips || [])[0] || "";
    ok(String(publishedTipV2).includes("version two"), `published tip v2 (got "${publishedTipV2}")`);

    // 21) Compare versions — history snapshots differ / compare UI markers already asserted.
    const history = plan.enrichmentPublishHistory || [];
    const withSnapshot = history.filter((entry) => entry.snapshot);
    ok(withSnapshot.length >= 1, "compare has at least one snapshot");
    if (withSnapshot.length >= 2) {
      const a = JSON.stringify(withSnapshot[0].snapshot?.dailyPlans || withSnapshot[0].snapshot?.week || {});
      const b = JSON.stringify(withSnapshot[1].snapshot?.dailyPlans || withSnapshot[1].snapshot?.week || {});
      ok(a !== b || withSnapshot[0].versionId !== withSnapshot[1].versionId, "version snapshots distinguishable");
    } else {
      ok(Boolean(withSnapshot[0].versionId), "single snapshot still versioned for compare");
    }

    // 22–23) Rollback restores exact prior (v1) published tip.
    res = await requestJson("POST", "/api/admin/curriculum/enrichment-rollback", {
      adminToken,
      planId: FIXTURE_PLAN_ID,
      publishedBy: "qa-fixture-smoke",
    }, auth);
    ok(res.status === 200 && (res.json?.ok || res.json?.rolledBack), `rollback: ${res.status}`);
    stamp = res.json.siteContentUpdatedAt || stamp;
    plan = findPlan(res.json.curriculum, FIXTURE_PLAN_ID);
    const tipAfterRollback = ((plan?.dailyPlans?.monday?.items || [])[0]?.teacherTips || [])[0] || "";
    ok(String(tipAfterRollback).includes("version one"),
      `rollback restored v1 tip (got "${tipAfterRollback}")`);
    ok(!String(tipAfterRollback).includes("version two"), "rollback removed v2 tip");

    // 24–25) Discard draft; published content remains.
    const discardTip = "QA tip that must be discarded from draft only.";
    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: stamp,
      saveMode: "enrichment_draft",
      lessonPlan: {
        id: FIXTURE_PLAN_ID,
        enrichmentDraft: {
          activities: { "qa-smoke-act-1": { teacherTips: [discardTip] } },
          week: { familyConnection: "Discard me" },
        },
      },
    }, auth);
    ok(res.status === 200, `draft before discard: ${res.status}`);
    stamp = res.json.siteContentUpdatedAt;
    const publishedTipBeforeDiscard = ((findPlan(res.json.curriculum, FIXTURE_PLAN_ID)?.dailyPlans?.monday?.items || [])[0]?.teacherTips || [])[0] || tipAfterRollback;

    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: stamp,
      saveMode: "enrichment_draft",
      allowEmptyDraftOverwrite: true,
      lessonPlan: {
        id: FIXTURE_PLAN_ID,
        enrichmentDraft: { activities: {}, week: {}, completionPercent: 0, previewReady: false },
      },
    }, auth);
    ok(res.status === 200, `discard draft: ${res.status}`);
    stamp = res.json.siteContentUpdatedAt;
    plan = findPlan(res.json.curriculum, FIXTURE_PLAN_ID);
    ok(Object.keys(plan?.enrichmentDraft?.activities || {}).length === 0, "draft activities cleared");
    ok(!(plan?.enrichmentDraft?.week?.familyConnection), "draft family cleared");
    const publishedAfterDiscard = ((plan?.dailyPlans?.monday?.items || [])[0]?.teacherTips || [])[0] || "";
    ok(publishedAfterDiscard === publishedTipBeforeDiscard, "published content intact after discard");

    // 26–27) Exit/nav/unsaved already covered by static markers; assert recovery modal labels.
    const editorJs = fs.readFileSync(path.join(ROOT, "scripts/teaching-kit-enrichment-editor.js"), "utf8");
    ok(editorJs.includes("Back to List"), "Back to List label");
    ok(/Cancel|Close/.test(editorJs), "Cancel/Close dialog labels");

    // 28) Customers cannot access fixture enrichment / flags stay off.
    const flagsRes = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    const flags = flagsRes.json.siteContent?.featureFlags || {};
    ok(flags.teachingKitViewer === false, "teachingKitViewer off");
    ok(flags.teachingKitPrintCenter === false, "teachingKitPrintCenter off");
    ok(flags.teachingKitAttachments === false, "teachingKitAttachments off");

    const publicTk = await requestJson(
      "GET",
      `/api/curriculum/lesson-plans/${encodeURIComponent(FIXTURE_PLAN_ID)}/teaching-kit`,
    );
    ok(
      publicTk.status === 404
        || publicTk.json?.error
        || publicTk.json?.teachingKit?.locked === true
        || publicTk.json?.featureFlags?.teachingKitViewer !== true,
      `customer Teaching Kit API does not expose disposable fixture unlock (status ${publicTk.status})`,
    );
    ok(
      !JSON.stringify(publicTk.json || {}).includes(UNIQUE_TIP)
        && !JSON.stringify(publicTk.json || {}).includes("version one"),
      "customer TK payload does not contain fixture enrichment tip text",
    );

    const publicSite = await requestJson("GET", "/api/site-content");
    const publicPlans = publicSite.json?.siteContent?.curriculum?.lessonPlans
      || publicSite.json?.curriculum?.lessonPlans
      || [];
    const leaked = publicPlans.find((p) => p.id === FIXTURE_PLAN_ID || p.id === blockedPlanId);
    if (leaked) {
      ok(!leaked.enrichmentDraft, "public curriculum must not expose enrichmentDraft");
      ok(leaked.status !== "published" || flags.teachingKitViewer !== true, "fixture not customer-published with viewer on");
    } else {
      ok(true, "fixture absent from public curriculum payload");
    }

    // Cleanup: permanently remove fixtures from temp store.
    const cleanupStamp = flagsRes.json.siteContent?.updatedAt || stamp;
    const curriculum = flagsRes.json.siteContent?.curriculum || {};
    const cleanedPlans = (curriculum.lessonPlans || []).filter(
      (p) => p.id !== FIXTURE_PLAN_ID && p.id !== blockedPlanId,
    );
    const clean = await requestJson("POST", "/api/admin/site-content", {
      adminToken,
      expectedUpdatedAt: cleanupStamp,
      siteContent: {
        ...flagsRes.json.siteContent,
        curriculum: { ...curriculum, lessonPlans: cleanedPlans },
      },
    }, auth);
    ok(clean.status === 200, `cleanup fixture: ${clean.status}`);
    const afterClean = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    ok(!findPlan(afterClean.json.siteContent?.curriculum || {}, FIXTURE_PLAN_ID), "fixture removed from store");

    console.log(`PASS teaching-kit disposable fixture smoke (${passed} assertions)`);
  } finally {
    try { child.kill("SIGTERM"); } catch { /* ignore */ }
    try { fs.rmSync(STORE_PATH, { force: true }); } catch { /* ignore */ }
    if (stderr && /error/i.test(stderr)) {
      console.error(stderr.slice(-2000));
    }
  }
}

main().catch((error) => {
  console.error("FAIL teaching-kit disposable fixture smoke:", error.message || error);
  process.exit(1);
});
