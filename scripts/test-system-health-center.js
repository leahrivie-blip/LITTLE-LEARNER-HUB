#!/usr/bin/env node
/**
 * System Health Center: monitoring, history, severity, export, and admin API.
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
  normalizeSeverityLevel,
  estimateUserImpact,
  buildFindingDeepLinks,
  detectTrends,
  updateOpenIssues,
  buildExportPayload,
} = require("./system-health-lib.js");
const {
  buildSystemHealthReport,
  applySafeSystemRepairs,
  persistSystemHealthRun,
  criticalAlertPreview,
} = require("../server/system-health.js");

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

test("severity levels and user impact are assigned", () => {
  assert.equal(normalizeSeverityLevel({ severity: "urgent" }), "critical");
  assert.equal(normalizeSeverityLevel({ severity: "warning" }), "high");
  assert.equal(normalizeSeverityLevel({ severity: "needs_review" }), "medium");
  const impact = estimateUserImpact({
    area: "lesson_plans",
    severity: "urgent",
    plainLanguage: "missing activities on Wednesday",
    id: "weekday:x",
  });
  assert.match(impact, /empty weekday|Teachers/i);
  const links = buildFindingDeepLinks({ planId: "plan-1", email: "a@example.com", area: "billing" });
  assert.ok(links.some((l) => l.kind === "lesson"));
  assert.ok(links.some((l) => l.kind === "user"));
});

test("plain billing messages avoid raw stack traces", () => {
  const msg = plainBillingMismatch("paid_plan_label_with_free_access", "paid@example.com");
  assert.match(msg, /Free/i);
  assert.doesNotMatch(msg, /TypeError|stack/i);
});

test("history + open issues track first seen and trends", () => {
  const findings = [{
    id: "weekday:plan-incomplete",
    area: "lesson_plans",
    severity: "urgent",
    status: "urgent",
    title: "Missing days",
    plainLanguage: "Missing Wednesday",
    planId: "plan-incomplete",
  }];
  const first = updateOpenIssues({}, findings, "2026-07-01T00:00:00.000Z");
  assert.equal(first.newIds.length, 1);
  const second = updateOpenIssues(first.openIssues, findings, "2026-07-02T00:00:00.000Z");
  assert.equal(second.newIds.length, 0);
  assert.equal(second.openIssues["weekday:plan-incomplete"].occurrenceCount, 2);
  assert.equal(second.openIssues["weekday:plan-incomplete"].firstSeenAt, "2026-07-01T00:00:00.000Z");

  const history = [];
  for (let i = 0; i < 4; i += 1) {
    history.push({
      at: `2026-07-0${i + 1}T00:00:00.000Z`,
      publishedIncomplete: 1,
      areas: { lesson_plans: 2, billing: i > 0 ? 1 : 0 },
      billingFindings: i > 0 ? 1 : 0,
      criticalBilling: i > 0 ? 1 : 0,
    });
  }
  const trends = detectTrends(history, second.openIssues);
  assert.ok(trends.some((t) => /lesson plans frequently fail|Repeated issue|Recurring billing/i.test(t.title + t.plainLanguage)));
});

test("persistSystemHealthRun writes history and repair log", () => {
  const store = {
    users: {},
    siteContent: { curriculum: { lessonPlans: [samplePlan()], activities: [], resources: [] } },
    systemHealth: {},
  };
  const report = buildSystemHealthReport({ store, recentBackups: [] });
  const repairs = [{
    id: "links:plan-incomplete",
    planId: "plan-incomplete",
    action: "rebuild_activity_links",
    plainLanguage: "Reconnected activities for “Rainbow Week”.",
    before: { activityIds: ["ghost"] },
    after: { activityIds: ["rebuilt-1"] },
  }];
  const persisted = persistSystemHealthRun(store, report, {
    repairs,
    trigger: "manual",
    healthIntervalMs: 86400000,
  });
  assert.ok(store.systemHealth.history.length >= 1);
  assert.equal(store.systemHealth.repairLog[0].action, "rebuild_activity_links");
  assert.ok(store.systemHealth.lastSnapshot);
  assert.ok(persisted.newCriticalIds.length >= 1);
  const exportPayload = buildExportPayload({
    report: persisted.report,
    systemHealth: store.systemHealth,
    repairs,
  });
  assert.equal(exportPayload.reportType, "system-health");
  assert.ok(Array.isArray(exportPayload.history));
  assert.ok(exportPayload.repairLog.length >= 1);
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
    pushDeliveryLog: [{ status: "failed", ok: false }],
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
  assert.ok(report.stats);
  assert.equal(report.stats.failedNotifications, 1);
  assert.equal(report.stats.failedPdfGenerations, null);
  assert.ok(report.findings.some((f) => f.severityLevel === "critical"));
  assert.ok(report.findings.some((f) => Array.isArray(f.deepLinks) && f.deepLinks.length));
  assert.match(report.plainSummary, /Checks skipped|skipped/i);
});

test("safe repairs only reconnect activity links and log before/after", () => {
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
  assert.deepEqual(result.repairs[0].before.activityIds, ["ghost"]);
  assert.deepEqual(result.repairs[0].after.activityIds, ["rebuilt-1"]);
  assert.match(result.repairs[0].plainLanguage, /Reconnected activities/i);
});

test("critical alert preview only includes newly seen critical IDs", () => {
  const preview = criticalAlertPreview({
    findings: [
      { id: "a", plainLanguage: "Old critical" },
      { id: "b", plainLanguage: "New critical billing issue" },
    ],
  }, ["b"]);
  assert.match(preview, /New critical billing issue/);
  assert.doesNotMatch(preview, /Old critical/);
});

test("static wiring: scheduler, export, history, severity UI", () => {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  assert.match(indexHtml, /admin-system-health-panel/);
  assert.match(appJs, /data-admin-system-health-export/);
  assert.match(appJs, /Platform statistics/);
  assert.match(appJs, /Check history/);
  assert.match(appJs, /Member impact/);
  assert.match(serverJs, /startSystemHealthScheduler/);
  assert.match(serverJs, /maybeRunDeploySystemHealthCheck/);
  assert.match(serverJs, /\/api\/admin\/system-health\/export/);
  assert.match(serverJs, /\/api\/admin\/system-health\/history/);
  assert.match(css, /\.llh-health-badge/);
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
          resolve({ status: res.statusCode, json, text, headers: res.headers });
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
      SYSTEM_HEALTH_SCHEDULER: "false",
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

    const getRes = await request("GET", `/api/admin/system-health?adminToken=${encodeURIComponent(token)}&refresh=1`);
    assert.equal(getRes.status, 200, getRes.text);
    assert.ok(getRes.json?.report?.plainSummary, "missing plainSummary");
    assert.ok(getRes.json.report.stats, "missing stats");
    assert.ok(Array.isArray(getRes.json.report.summary.checksSkipped));

    const runRes = await request("POST", "/api/admin/system-health/run", {
      body: { adminToken: token, applySafeRepairs: true },
    });
    assert.equal(runRes.status, 200, runRes.text);
    assert.ok(runRes.json?.report?.timestamps?.lastFullCheck);
    assert.ok(Array.isArray(runRes.json.report.history));
    assert.ok(runRes.json.report.history.length >= 1, "history should include the manual run");

    const hist = await request("GET", `/api/admin/system-health/history?adminToken=${encodeURIComponent(token)}`);
    assert.equal(hist.status, 200, hist.text);
    assert.ok(hist.json.history.length >= 1);

    const exported = await request("GET", `/api/admin/system-health/export?adminToken=${encodeURIComponent(token)}`);
    assert.equal(exported.status, 200, exported.text);
    assert.match(String(exported.headers["content-disposition"] || ""), /llh-system-health/);
    assert.equal(exported.json?.reportType, "system-health");

    const denied = await request("GET", "/api/admin/system-health");
    assert.equal(denied.status, 401);

    console.log("PASS  admin system-health API history/export/monitoring");
    passed += 1;
  } catch (error) {
    failed += 1;
    console.error("FAIL  admin system-health API history/export/monitoring");
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
