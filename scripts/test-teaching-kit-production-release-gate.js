#!/usr/bin/env node
/**
 * Teaching Kit production-release dual-gate.
 * Customer Viewer/Print never unlock from a stale store flag alone.
 *
 * Run: npm run test:teaching-kit-production-release-gate
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");
const teachingKit = require("./teaching-kit.js");
const { withCustomerReleaseApproval } = require("./test-helpers/tk-customer-flags.js");

const ROOT = path.join(__dirname, "..");
const PORT = 4810 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-tk-prod-release-${process.pid}.json`);
const ADMIN = {
  email: "tk-prod-release-admin@example.com",
  password: "tk-prod-release-pass",
  code: "tk-prod-release-code",
};
const PLAN_ID = "cur-lp-tk-prod-release-gate";

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
          try { json = text ? JSON.parse(text) : null; } catch { json = null; }
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
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
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForHealth(child) {
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error("server exited early");
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("server health timeout");
}

async function adminLogin() {
  const res = await requestJson("POST", "/api/admin/login", ADMIN);
  assert.equal(res.status, 200);
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
        teachingKitViewer: false,
        teachingKitPrintCenter: false,
        teachingKitAttachments: false,
        teachingKitProductionReleaseApproved: false,
        teachingKitEnrichmentEditor: true,
        teachingKitAuthoring: true,
        teachingKitCurriculumDirector: true,
        teachingKitQualityReview: true,
        ...flags,
      },
    },
  });
  assert.equal(save.status, 200, `flag save failed: ${save.text}`);
  return save.json.siteContent?.updatedAt || existing.updatedAt;
}

function dayItem(day) {
  return {
    itemId: `${day}-1`,
    activityCategory: "Sensory",
    title: `${day} tray`,
    objective: "Explore",
    description: "Hands-on tray",
    materials: "Tray",
    setup: "Set tray out.",
    steps: "1. Invite play.",
  };
}

async function seedPlan(adminToken, expectedUpdatedAt) {
  const now = new Date().toISOString();
  const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken,
    expectedUpdatedAt,
    lessonPlan: {
      id: PLAN_ID,
      title: "Production Release Gate Lesson",
      age: "Preschool",
      plan: "Free",
      status: "published",
      theme: "Safety Gate",
      createdAt: now,
      updatedAt: now,
      resourceIds: [],
      weeklyOverview: "Dual-gate safety lesson.",
      objectives: "Stay safe.",
      dailyPlans: {
        monday: { theme: "Mon", items: [dayItem("monday")] },
        tuesday: { theme: "Tue", items: [dayItem("tuesday")] },
        wednesday: { theme: "Wed", items: [dayItem("wednesday")] },
        thursday: { theme: "Thu", items: [dayItem("thursday")] },
        friday: { theme: "Fri", items: [dayItem("friday")] },
      },
    },
  });
  assert.equal(save.status, 200, `seed plan: ${save.text}`);
  return save.json.siteContentUpdatedAt || expectedUpdatedAt;
}

function testUnitGates() {
  const defaults = teachingKit.defaultTeachingKitFeatureFlags();
  assert.equal(defaults.teachingKitProductionReleaseApproved, false, "approval defaults false");
  assert.equal(defaults.teachingKitViewer, false, "viewer defaults false");
  assert.equal(teachingKit.isTeachingKitApiEnabled({}), false, "api off by default");
  assert.equal(
    teachingKit.isTeachingKitApiEnabled({ teachingKitViewer: true }),
    false,
    "viewer alone does not enable api",
  );
  assert.equal(
    teachingKit.isTeachingKitApiEnabled({ teachingKitPrintCenter: true }),
    false,
    "print alone does not enable api",
  );
  assert.equal(
    teachingKit.isTeachingKitApiEnabled({
      teachingKitViewer: true,
      teachingKitProductionReleaseApproved: true,
    }),
    true,
    "viewer + approval enables api",
  );
  assert.equal(
    teachingKit.isTeachingKitCustomerSurfaceEnabled({ teachingKitViewer: true }, "teachingKitViewer"),
    false,
    "customer surface blocked without approval",
  );
  const stale = teachingKit.effectiveTeachingKitCustomerFeatureFlags({
    teachingKitViewer: true,
    teachingKitPrintCenter: true,
    teachingKitAttachments: false,
    teachingKitProductionReleaseApproved: false,
  });
  assert.equal(stale.teachingKitViewer, false, "effective viewer false for stale store");
  assert.equal(stale.teachingKitPrintCenter, false, "effective print false for stale store");
  assert.deepEqual(
    teachingKit.enabledTeachingKitCustomerFacingFlags({
      teachingKitViewer: true,
      teachingKitPrintCenter: false,
    }),
    ["teachingKitViewer"],
    "raw enabled customer flags listed for admin warning",
  );
  const mode = teachingKit.resolveTeachingKitRenderMode(
    { teachingKit: { schemaVersion: 1, completeness: "legacy_mapped" } },
    { teachingKitViewer: true, teachingKitProductionReleaseApproved: false },
  );
  assert.equal(mode.mode, "legacy", "render stays legacy without approval");
  assert.equal(mode.reason, "production_release_not_approved", "reason names missing approval");
  assert.equal(
    teachingKit.isTeachingKitEnrichmentEditorEnabled({ teachingKitEnrichmentEditor: true }),
    true,
    "admin enrichment unchanged by dual-gate",
  );
  const helper = withCustomerReleaseApproval({ teachingKitViewer: true });
  assert.equal(helper.teachingKitProductionReleaseApproved, true, "test helper auto-approves");
  const explicitOff = withCustomerReleaseApproval({
    teachingKitViewer: true,
    teachingKitProductionReleaseApproved: false,
  });
  assert.equal(explicitOff.teachingKitProductionReleaseApproved, false, "helper keeps explicit false");
  console.log("PASS  unit dual-gate helpers");
}

async function main() {
  testUnitGates();
  const child = startServer();
  try {
    await waitForHealth(child);
    const token = await adminLogin();
    let updatedAt = await setFlags(token, {
      teachingKitEnrichmentEditor: true,
      teachingKitAuthoring: true,
      teachingKitCurriculumDirector: true,
      teachingKitQualityReview: true,
    });
    updatedAt = await seedPlan(token, updatedAt);

    // Stale store: Viewer/Print true, approval false → customer API stays disabled.
    await setFlags(token, {
      teachingKitViewer: true,
      teachingKitPrintCenter: true,
      teachingKitAttachments: false,
      teachingKitProductionReleaseApproved: false,
      teachingKitEnrichmentEditor: true,
    });
    const staleKit = await requestJson("GET", `/api/curriculum/lesson-plans/${PLAN_ID}/teaching-kit`);
    assert.equal(staleKit.status, 404, "stale viewer/print blocked");
    assert.equal(staleKit.json?.code, "teaching_kit_disabled", "stale returns teaching_kit_disabled");

    // Admin enrichment remains available without approval.
    const enrichOffApproval = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken: token,
      expectedUpdatedAt: (await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`)).json.siteContent.updatedAt,
      saveMode: "enrichment_draft",
      lessonPlan: {
        id: PLAN_ID,
        enrichmentDraft: {
          schemaVersion: 1,
          status: "draft",
          overview: { teacherSummary: "Admin review draft" },
        },
      },
    });
    assert.notEqual(enrichOffApproval.json?.code, "enrichment_editor_disabled", "admin editor still enabled");
    assert.ok(
      enrichOffApproval.status === 200 || enrichOffApproval.status === 400,
      `admin draft path reachable (${enrichOffApproval.status})`,
    );

    // Dual-gate open: viewer + approval.
    await setFlags(token, {
      teachingKitViewer: true,
      teachingKitPrintCenter: false,
      teachingKitProductionReleaseApproved: true,
    });
    const openKit = await requestJson("GET", `/api/curriculum/lesson-plans/${PLAN_ID}/teaching-kit`);
    assert.equal(openKit.status, 200, "viewer+approval unlocks api");
    assert.equal(openKit.json?.featureFlags?.teachingKitViewer, true, "effective viewer true");
    assert.equal(
      openKit.json?.featureFlags?.teachingKitProductionReleaseApproved,
      true,
      "approval echoed",
    );

    // Reset customer surfaces off; keep admin tools on (matches owner review posture).
    await setFlags(token, {
      teachingKitViewer: false,
      teachingKitPrintCenter: false,
      teachingKitAttachments: false,
      teachingKitProductionReleaseApproved: false,
      teachingKitEnrichmentEditor: true,
      teachingKitAuthoring: true,
      teachingKitCurriculumDirector: true,
      teachingKitQualityReview: true,
    });
    const reset = await requestJson("GET", `/api/curriculum/lesson-plans/${PLAN_ID}/teaching-kit`);
    assert.equal(reset.status, 404, "reset keeps customer kit off");
    console.log("PASS  server dual-gate + admin tools unchanged");
    console.log("\nAll teaching-kit production-release gate tests passed.");
  } finally {
    if (child && child.exitCode === null) child.kill("SIGTERM");
    fs.rmSync(STORE_PATH, { force: true });
  }
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exit(1);
});
