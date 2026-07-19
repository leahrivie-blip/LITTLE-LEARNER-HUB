#!/usr/bin/env node
/**
 * System Health Center: plain-language aggregator + admin API + publish checklist wiring.
 * Run: npm run test:system-health-center
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const {
  scanCurriculumHealth,
  summarizeOverall,
  plainBillingMismatch,
  emptyWeekdays,
  weekdayActivityCounts,
} = require("./system-health-lib.js");
const { buildSystemHealthReport, applySafeSystemRepairs } = require("../server/system-health.js");

const ROOT = path.join(__dirname, "..");
const PORT = 19840 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-system-health-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "system-health@test.local",
  password: "system-health-pass",
  code: "system-health-code",
};

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL  ${name}`);
    console.error(error);
  }
}

function emptyDay() {
  return { items: [] };
}

function samplePlan(overrides = {}) {
  const dailyPlans = {
    monday: { items: [{ title: "Circle", objective: "x", description: "x", materials: "x", setup: "x", steps: "1. a\n2. b\n3. c", teacherRole: "x", adaptations: "x", safetyNotes: "x" }] },
    tuesday: { items: [{ title: "Art", objective: "x", description: "x", materials: "x", setup: "x", steps: "1. a\n2. b\n3. c", teacherRole: "x", adaptations: "x", safetyNotes: "x" }] },
    wednesday: emptyDay(),
    thursday: emptyDay(),
    friday: emptyDay(),
  };
  return {
    id: "plan-incomplete",
    title: "Rainbow Week",
    age: "Toddler",
    theme: "Rainbow",
    status: "published",
    weeklyOverview: "Explore colors",
    coverImageUrl: "",
    activityIds: ["missing-activity"],
    dailyPlans,
    ...overrides,
  };
}

test("weekday helpers detect empty days", () => {
  const counts = weekdayActivityCounts(samplePlan());
  assert.equal(counts.monday, 1);
  assert.deepEqual(emptyWeekdays(counts), ["wednesday", "thursday", "friday"]);
});

test("scanCurriculumHealth flags published incomplete plans in plain language", () => {
  const scan = scanCurriculumHealth({
    lessonPlans: [samplePlan()],
    activities: [],
  });
  assert.equal(scan.publishedIncomplete, 1);
  assert.ok(scan.findings.some((f) => /missing activities on Wednesday/i.test(f.plainLanguage || f.message)));
  assert.ok(scan.findings.some((f) => f.autoRepairSafe === true && f.repairAction === "rebuild_activity_links"));
});

test("plain billing messages avoid raw stack traces", () => {
  const msg = plainBillingMismatch("paid_plan_label_with_free_access", "paid@example.com");
  assert.match(msg, /Free/i);
  assert.doesNotMatch(msg, /TypeError|stack/i);
});

test("buildSystemHealthReport aggregates suites and lists skipped checks", () => {
  const store = {
    users: {
      "paid@example.com": {
        email: "paid@example.com",
        plan: "Pro",
        hasProAccess: true,
        stripeSubscriptionStatus: "",
        subscriptionStatus: "Active",
      },
    },
    siteContent: {
      curriculum: {
        lessonPlans: [samplePlan()],
        activities: [],
        resources: [],
      },
    },
    systemHealth: {},
  };
  const report = buildSystemHealthReport({
    store,
    launchReadinessStatus: () => ({
      ready: false,
      status: "NOT READY",
      required: {
        stripe: { ready: false, missing: ["STRIPE_SECRET_KEY"] },
        admin: { ready: true },
        ai: { ready: false },
        site: { ready: true },
        database: { ready: true },
      },
      blockers: [],
    }),
    billingReadinessSnapshot: () => ({ ready: false, missing: ["webhook"] }),
    storeHealthSnapshot: () => ({ sparseStoreSuspected: false, database: { usingPostgres: false } }),
    adminConfigStatus: () => ({ ready: true }),
    validateCurriculumIntegrity: () => ({ valid: true, errors: [] }),
    recentBackups: [],
  });
  assert.ok(report.plainSummary);
  assert.ok(Array.isArray(report.summary.checksSkipped));
  assert.ok(report.summary.checksSkipped.includes("mobile_tablet_layout_suite"));
  assert.ok(report.summary.checksRun >= 3);
  assert.ok(report.findings.some((f) => f.area === "lesson_plans" && f.severity === "urgent"));
  assert.ok(report.findings.some((f) => f.area === "billing" && /Free|paid access|mismatch/i.test(f.plainLanguage || "")));
  assert.match(report.plainSummary, /Checks skipped|skipped/i);
});

test("safe repairs only reconnect activity links", () => {
  const curriculum = {
    lessonPlans: [samplePlan({ activityIds: ["ghost"] })],
    activities: [],
    resources: [],
  };
  const store = { siteContent: { curriculum } };
  let wrote = false;
  const report = {
    findings: [{
      id: "links:plan-incomplete",
      planId: "plan-incomplete",
      autoRepairSafe: true,
      repairAction: "rebuild_activity_links",
    }],
  };
  const result = applySafeSystemRepairs({
    peekStore: () => store,
    syncCurriculumActivitiesForLessonPlan: (cur, plan) => {
      assert.equal(plan.id, "plan-incomplete");
      return {
        ...cur,
        lessonPlans: cur.lessonPlans.map((item) => (
          item.id === plan.id ? { ...item, activityIds: ["rebuilt-1"] } : item
        )),
      };
    },
    writeSiteCurriculum: () => {
      wrote = true;
    },
  }, report);
  assert.equal(result.repairs.length, 1);
  assert.equal(wrote, true);
  assert.match(result.repairs[0].plainLanguage, /Reconnected activities/i);
});

test("static wiring: System Health panel, handlers, publish checklist, styles", () => {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  assert.match(indexHtml, /admin-system-health-panel/);
  assert.match(appJs, /data-admin-system-health-run/);
  assert.match(appJs, /function renderAdminSystemHealthCenter/);
  assert.match(appJs, /function buildLessonPublishChecklist/);
  assert.match(appJs, /renderLessonPublishChecklistHtml\(record\)/);
  assert.match(appJs, /This lesson is not ready to publish/);
  assert.match(serverJs, /\/api\/admin\/system-health/);
  assert.match(css, /\.llh-health-badge/);
  assert.match(css, /\.llh-publish-checklist/);
});

function request(method, urlPath, { body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: {
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
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

async function waitForHealth(timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await request("GET", "/api/health");
      if (res.status === 200) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Server did not become healthy in time");
}

async function runApiSuite() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {},
    siteContent: {
      updatedAt: new Date().toISOString(),
      curriculum: {
        lessonPlans: [samplePlan()],
        activities: [],
        resources: [],
      },
    },
  }, null, 2));

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      LLH_STORE_PATH: STORE_PATH,
      DATABASE_PROVIDER: "local-json",
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

  try {
    await waitForHealth();
    const unlock = await request("POST", "/api/admin/login", {
      body: {
        email: ADMIN.email,
        password: ADMIN.password,
        code: ADMIN.code,
      },
    });
    assert.equal(unlock.status, 200, `admin unlock failed: ${unlock.text}`);
    const token = unlock.json?.token || "";
    assert.ok(token, "admin token missing");

    const getRes = await request("GET", `/api/admin/system-health?adminToken=${encodeURIComponent(token)}`);
    assert.equal(getRes.status, 200, getRes.text);
    assert.ok(getRes.json?.report?.plainSummary, "missing plainSummary");
    assert.ok(getRes.json.report.summary.checksRun >= 1);
    assert.ok(Array.isArray(getRes.json.report.summary.checksSkipped));
    assert.ok(
      getRes.json.report.findings.some((f) => /missing activities/i.test(f.plainLanguage || f.message || "")),
      "expected weekday finding",
    );

    const runRes = await request("POST", "/api/admin/system-health/run", {
      body: { adminToken: token, applySafeRepairs: false },
    });
    assert.equal(runRes.status, 200, runRes.text);
    assert.ok(runRes.json?.report?.timestamps?.lastFullCheck);

    const denied = await request("GET", "/api/admin/system-health");
    assert.equal(denied.status, 401);

    console.log("PASS  admin system-health API returns plain-language report");
    passed += 1;
  } catch (error) {
    failed += 1;
    console.error("FAIL  admin system-health API returns plain-language report");
    console.error(error);
    if (stderr) console.error(stderr.slice(-2000));
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

(async () => {
  await runApiSuite();
  console.log(`\nSystem Health Center checks: ${passed} passed, ${failed} failed.`);
  if (failed) process.exit(1);
})();
