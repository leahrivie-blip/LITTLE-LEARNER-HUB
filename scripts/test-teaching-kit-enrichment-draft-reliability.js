#!/usr/bin/env node
/**
 * Teaching Kit Enrichment — Save Draft reliability (isolated fixtures only).
 *
 * Proves:
 * 1) Draft tip/week fields survive save → reload
 * 2) Empty/partial incoming drafts cannot wipe prior enrichment content
 * 3) Unknown activity/top-level draft fields round-trip
 * 4) Concurrent stale stamp gets a clear 409 (or richer content survives merge)
 * 5) Upgrade summary does not treat bare timestamps as "Draft Pending"
 * 6) Customer Teaching Kit viewer flags stay off unless explicitly enabled for the test
 *
 * NEVER touches production curriculum. Uses a temp local-json store.
 *
 * Run: npm run test:teaching-kit-enrichment-draft-reliability
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const enrichmentHelpers = require("./teaching-kit-enrichment.js");

const ROOT = path.join(__dirname, "..");
const PORT = 5800 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-tk-draft-reliability-${process.pid}.json`);
const FIXTURE_PATH = path.join(ROOT, "scripts/fixtures/teaching-kit/empty-plan.json");
const ADMIN = {
  email: "tk-draft-reliability-admin@example.com",
  password: "tk-draft-reliability-pass",
  code: "tk-draft-reliability-code",
};
const FIXTURE_PLAN_ID = "cur-lp-tk-draft-reliability-fixture";

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
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

function loadFixturePlan() {
  if (fs.existsSync(FIXTURE_PATH)) {
    const raw = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
    const plan = raw.lessonPlan || raw;
    return {
      ...plan,
      id: FIXTURE_PLAN_ID,
      title: "QA Draft Reliability Fixture (do not publish)",
      status: "draft",
      ageGroup: "Preschool",
      dailyPlans: plan.dailyPlans || {
        monday: { items: [{ itemId: "qa-act-1", title: "QA Sorting", activityCategory: "Cognitive" }] },
        tuesday: { items: [{ itemId: "qa-act-2", title: "QA Circles", activityCategory: "Art" }] },
        wednesday: { items: [] },
        thursday: { items: [] },
        friday: { items: [] },
      },
    };
  }
  return {
    id: FIXTURE_PLAN_ID,
    title: "QA Draft Reliability Fixture (do not publish)",
    status: "draft",
    ageGroup: "Preschool",
    theme: "QA Isolation",
    dailyPlans: {
      monday: { items: [{ itemId: "qa-act-1", title: "QA Sorting", activityCategory: "Cognitive" }] },
      tuesday: { items: [{ itemId: "qa-act-2", title: "QA Circles", activityCategory: "Art" }] },
      wednesday: { items: [] },
      thursday: { items: [] },
      friday: { items: [] },
    },
  };
}

function findPlan(curriculum, id) {
  return (curriculum?.lessonPlans || []).find((p) => p.id === id) || null;
}

async function main() {
  try { fs.rmSync(STORE_PATH, { force: true }); } catch { /* ignore */ }

  // Static markers
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  const editorJs = fs.readFileSync(path.join(ROOT, "scripts/teaching-kit-enrichment-editor.js"), "utf8");
  const enrichJs = fs.readFileSync(path.join(ROOT, "scripts/teaching-kit-enrichment.js"), "utf8");
  ok(serverJs.includes("function mergeEnrichmentDraftForSave"), "server merge helper present");
  ok(serverJs.includes("enrichment_draft_empty_overwrite"), "empty overwrite code present");
  ok(editorJs.includes("draftVerificationMarkers"), "client verification markers present");
  ok(editorJs.includes("saveInFlight"), "client save lock present");
  ok(editorJs.includes("Draft save verification failed"), "client verifies server echo");
  ok(!/text\(draft\.updatedAt\)\s*\|\|/.test(enrichJs) || enrichJs.includes("bare updatedAt/lastEditedBy alone is not a pending draft"),
    "upgrade summary no longer treats bare timestamps as pending");
  console.log("PASS static draft-reliability markers");

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
    let stamp = await setFlags(adminToken, {
      // Keep customer-facing TK off; only enable admin enrichment editor for this fixture store.
      teachingKitViewer: false,
      teachingKitPrintCenter: false,
      teachingKitAttachments: false,
      teachingKitEnrichmentEditor: true,
    });
    const auth = { Authorization: `Bearer ${adminToken}` };

    // Seed isolated fixture lesson (not production content).
    const seed = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: stamp,
      lessonPlan: loadFixturePlan(),
    }, auth);
    ok(seed.status === 200, `seed fixture: ${seed.status}`);
    stamp = seed.json.siteContentUpdatedAt;

    const tipA = "Invite children to sort the QA blocks by color — fixture tip A.";
    const tipB = "Offer a second tray for size sorting — fixture tip B.";
    const family = "Ask families what animals they saw this week (QA fixture).";

    // 1) Save draft with tip + week content
    let res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: stamp,
      saveMode: "enrichment_draft",
      lessonPlan: {
        id: FIXTURE_PLAN_ID,
        enrichmentDraft: {
          activities: {
            "qa-act-1": { teacherTip: tipA, customQaField: "preserve-me" },
          },
          week: { familyConnection: family },
          completionPercent: 12,
          previewReady: false,
          experimentalTopLevel: { kept: true },
        },
      },
    }, auth);
    ok(res.status === 200 && res.json?.ok, `draft save 1: ${res.status} ${res.json?.code || ""}`);
    stamp = res.json.siteContentUpdatedAt;
    let plan = findPlan(res.json.curriculum, FIXTURE_PLAN_ID);
    ok(plan?.enrichmentDraft?.activities?.["qa-act-1"]?.teacherTip === tipA, "tip A persisted in response");
    ok(plan?.enrichmentDraft?.activities?.["qa-act-1"]?.customQaField === "preserve-me", "unknown activity field persisted");
    ok(plan?.enrichmentDraft?.week?.familyConnection === family, "week family persisted");
    ok(plan?.enrichmentDraft?.experimentalTopLevel?.kept === true, "unknown top-level draft field persisted");

    // Reload via site-content (simulates editor reopen)
    const reload = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    ok(reload.status === 200, "reload site-content");
    plan = findPlan(reload.json.siteContent?.curriculum || reload.json.curriculum, FIXTURE_PLAN_ID);
    ok(plan?.enrichmentDraft?.activities?.["qa-act-1"]?.teacherTip === tipA, "tip A survives reload");
    ok(plan?.enrichmentDraft?.week?.familyConnection === family, "family survives reload");

    // Upgrade summary must show pending draft from real content (not bare timestamps)
    const summary = enrichmentHelpers.buildUpgradeSummary(plan, [], plan.enrichmentDraft);
    ok(summary.hasEnrichmentDraft === true, "summary hasEnrichmentDraft for real content");
    ok(/draft pending/i.test(summary.draftOrPublished || ""), "summary shows draft pending for real content");

    // Bare timestamp-only draft must NOT count as pending
    const bareSummary = enrichmentHelpers.buildUpgradeSummary(plan, [], {
      updatedAt: new Date().toISOString(),
      lastEditedBy: "admin",
      activities: {},
      week: {},
    });
    ok(bareSummary.hasEnrichmentDraft === false, "bare timestamp hasEnrichmentDraft=false");
    ok(!/draft pending/i.test(bareSummary.draftOrPublished || ""), `bare timestamp not pending: ${bareSummary.draftOrPublished}`);

    // 2) Partial save for a second activity must preserve tip A
    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: stamp,
      saveMode: "enrichment_draft",
      lessonPlan: {
        id: FIXTURE_PLAN_ID,
        enrichmentDraft: {
          activities: {
            "qa-act-2": { teacherTip: tipB },
          },
          week: { familyConnection: family },
          completionPercent: 20,
        },
      },
    }, auth);
    ok(res.status === 200, `partial draft save: ${res.status}`);
    stamp = res.json.siteContentUpdatedAt;
    plan = findPlan(res.json.curriculum, FIXTURE_PLAN_ID);
    ok(plan?.enrichmentDraft?.activities?.["qa-act-1"]?.teacherTip === tipA, "partial save kept tip A");
    ok(plan?.enrichmentDraft?.activities?.["qa-act-2"]?.teacherTip === tipB, "partial save wrote tip B");

    // 3) Empty overwrite must be rejected
    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: stamp,
      saveMode: "enrichment_draft",
      lessonPlan: {
        id: FIXTURE_PLAN_ID,
        enrichmentDraft: {
          activities: {},
          week: {},
          updatedAt: new Date().toISOString(),
          lastEditedBy: "admin",
        },
      },
    }, auth);
    ok(res.status === 409 && res.json?.code === "enrichment_draft_empty_overwrite", `empty overwrite blocked: ${res.status} ${res.json?.code}`);
    // Content unchanged after rejected wipe
    const afterWipe = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    plan = findPlan(afterWipe.json.siteContent?.curriculum || afterWipe.json.curriculum, FIXTURE_PLAN_ID);
    ok(plan?.enrichmentDraft?.activities?.["qa-act-1"]?.teacherTip === tipA, "tip A intact after rejected wipe");
    stamp = afterWipe.json.siteContent?.updatedAt || stamp;

    // 4) Stale concurrency stamp → 409
    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: "2000-01-01T00:00:00.000Z",
      saveMode: "enrichment_draft",
      lessonPlan: {
        id: FIXTURE_PLAN_ID,
        enrichmentDraft: {
          activities: { "qa-act-1": { teacherTip: tipA } },
          week: { familyConnection: family },
        },
      },
    }, auth);
    ok(res.status === 409, `stale stamp rejected: ${res.status}`);

    // Confirm customer flags still off in this store
    const flags = afterWipe.json.siteContent?.featureFlags || {};
    ok(flags.teachingKitViewer !== true, "viewer still off");
    ok(flags.teachingKitPrintCenter !== true, "print center still off");
    ok(flags.teachingKitAttachments !== true, "attachments still off");
    ok(flags.teachingKitEnrichmentEditor === true, "editor on for fixture store only");

    // Fixture plan remains present with enrichment intact (temp store may include seed curriculum).
    const plans = afterWipe.json.siteContent?.curriculum?.lessonPlans || [];
    const fixture = plans.find((p) => p.id === FIXTURE_PLAN_ID);
    ok(Boolean(fixture), `fixture plan present among ${plans.length} plans`);
    ok(fixture?.enrichmentDraft?.activities?.["qa-act-1"]?.teacherTip === tipA, "fixture enrichment still intact at end");
    ok(fixture?.title?.includes("QA Draft Reliability Fixture"), "fixture title unchanged");

    console.log(`PASS teaching-kit enrichment draft reliability (${passed} asserts)`);
  } catch (error) {
    console.error("FAIL draft reliability", error);
    console.error(stderr.slice(-2000));
    process.exitCode = 1;
  } finally {
    child.kill("SIGTERM");
    try { fs.rmSync(STORE_PATH, { force: true }); } catch { /* ignore */ }
  }
}

main();
