#!/usr/bin/env node
/**
 * Local memory workflow profiler for production-stability investigations.
 *
 * Spawns a temp local-json server, seeds a production-shaped curriculum store,
 * hits key endpoints, and reports RSS/heap before/after each workflow + GC.
 *
 * Run: npm run test:memory-profile
 */
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");

function memSnap(label) {
  const m = process.memoryUsage();
  return {
    label,
    rssMb: +(m.rss / 1048576).toFixed(1),
    heapUsedMb: +(m.heapUsed / 1048576).toFixed(1),
    heapTotalMb: +(m.heapTotal / 1048576).toFixed(1),
  };
}

function request(port, method, urlPath, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: urlPath,
      method,
      headers: {
        ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
        ...headers,
      },
      timeout: 60000,
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = JSON.parse(text); } catch { /* ignore */ }
        resolve({ status: res.statusCode, json, text, bytes: Buffer.byteLength(text) });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForHealth(port, child, tries = 80) {
  for (let i = 0; i < tries; i += 1) {
    if (child.exitCode != null) throw new Error(`server exited early: ${child.exitCode}`);
    try {
      const res = await request(port, "GET", "/api/health");
      if (res.status === 200) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("health timeout");
}

function buildCurriculumFixture() {
  const lessonPlans = [];
  const activities = [];
  for (let i = 0; i < 130; i += 1) {
    const id = `cur-lp-profile-${i}`;
    lessonPlans.push({
      id,
      title: `Profile Lesson ${i}`,
      age: i % 3 === 0 ? "Infant" : i % 3 === 1 ? "Toddler" : "Preschool",
      theme: "Memory Profile",
      plan: i % 5 === 0 ? "Free" : "Pro",
      status: "published",
      weeklyOverview: "Overview ".repeat(40),
      objectives: Array.from({ length: 6 }, (_, n) => `Objective ${n}`),
      materials: Array.from({ length: 8 }, (_, n) => `Material ${n}`),
      dailyPlans: Array.from({ length: 5 }, (_, day) => ({
        dayOfWeek: day,
        items: Array.from({ length: 4 }, (_, item) => ({
          itemId: `${id}-d${day}-i${item}`,
          title: `Item ${item}`,
          steps: Array.from({ length: 5 }, () => "Do the thing with care."),
        })),
      })),
      updatedAt: new Date().toISOString(),
    });
    for (let a = 0; a < 16; a += 1) {
      activities.push({
        id: `cur-act-profile-${i}-${a}`,
        lessonPlanId: id,
        title: `Activity ${i}-${a}`,
        status: "published",
        plan: lessonPlans[i].plan,
        activityCategory: "center",
        dayOfWeek: a % 5,
        steps: Array.from({ length: 6 }, () => "Step text for activity profiling."),
        materials: ["paper", "glue"],
        updatedAt: new Date().toISOString(),
      });
    }
  }
  return {
    lessonPlans,
    activities,
    resources: [],
    series: [],
    updatedAt: new Date().toISOString(),
  };
}

async function main() {
  const storePath = path.join(os.tmpdir(), `llh-mem-profile-${crypto.randomBytes(4).toString("hex")}.json`);
  const curriculum = buildCurriculumFixture();
  const store = {
    users: {
      "owner@memory.test": {
        email: "owner@memory.test",
        plan: "Pro",
        accountStatus: "Active",
        createdAt: new Date().toISOString(),
      },
    },
    analyticsEvents: Array.from({ length: 2000 }, (_, i) => ({
      id: `evt-${i}`,
      name: "page_view",
      user: "owner@memory.test",
      createdAt: new Date().toISOString(),
      path: "/lessons",
    })),
    messages: [],
    notifications: [],
    foundingMembers: [],
    siteContent: {
      updatedAt: new Date().toISOString(),
      curriculum,
      forms: [],
      menus: [],
      observations: [],
      reviews: [],
      faqs: [],
    },
  };
  fs.writeFileSync(storePath, JSON.stringify(store));
  const storeJsonMb = +(fs.statSync(storePath).size / 1048576).toFixed(2);

  const port = 19800 + Math.floor(Math.random() * 400);
  const child = spawn(process.execPath, ["--expose-gc", "server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      LLH_STORE_PATH: storePath,
      DATABASE_PROVIDER: "local-json",
      NODE_ENV: "test",
      ADMIN_EMAIL: "owner@memory.test",
      ADMIN_PASSWORD: "memory-pass",
      ADMIN_ACCESS_CODE: "12345",
      MONITOR_ALERTS_ENABLED: "false",
      MONITOR_INSTANCE_MEMORY_MB: "2048",
      MONITOR_CHECK_INTERVAL_MS: "600000",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const rows = [];
  const record = async (label, fn) => {
    if (global.gc) global.gc();
    await new Promise((r) => setTimeout(r, 50));
    const before = await request(port, "GET", "/api/health").then(() => null);
    void before;
    const healthBefore = await request(port, "GET", "/api/admin/store-health", {
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => null);
    const memBefore = healthBefore?.json?.health?.memory || null;
    const result = await fn();
    if (global.gc) global.gc();
    await new Promise((r) => setTimeout(r, 50));
    const healthAfter = await request(port, "GET", "/api/admin/store-health", {
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => null);
    const memAfter = healthAfter?.json?.health?.memory || null;
    rows.push({
      workflow: label,
      status: result.status,
      bytes: result.bytes,
      rssBeforeMb: memBefore?.rssMb ?? null,
      rssAfterMb: memAfter?.rssMb ?? null,
      heapBeforeMb: memBefore?.heapUsedMb ?? null,
      heapAfterMb: memAfter?.heapUsedMb ?? null,
      deltaRssMb: memBefore && memAfter ? memAfter.rssMb - memBefore.rssMb : null,
    });
    return result;
  };

  let token = "";
  try {
    await waitForHealth(port, child);

    const login = await request(port, "POST", "/api/admin/login", {
      body: {
        email: "owner@memory.test",
        password: "memory-pass",
        accessCode: "12345",
        code: "12345",
      },
    });
    assert.equal(login.status, 200, login.text?.slice(0, 300));
    token = login.json?.token || login.json?.adminToken;
    assert.ok(token);

    const startup = await request(port, "GET", "/api/admin/store-health", {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(startup.status, 200);
    rows.push({
      workflow: "startup",
      status: startup.status,
      bytes: startup.bytes,
      rssBeforeMb: null,
      rssAfterMb: startup.json?.health?.memory?.rssMb ?? null,
      heapBeforeMb: null,
      heapAfterMb: startup.json?.health?.memory?.heapUsedMb ?? null,
      deltaRssMb: null,
    });

    await record("site-content (curriculum library)", () => request(port, "GET", "/api/site-content"));
    await record("site-content x5 (cache)", async () => {
      let last = null;
      for (let i = 0; i < 5; i += 1) last = await request(port, "GET", "/api/site-content");
      return last;
    });
    await record("home-inventory", () => request(port, "GET", "/api/public/home-inventory"));

    const lessonId = curriculum.lessonPlans[0].id;
    const activityId = curriculum.activities[0].id;
    await record("lesson viewer", () => request(port, "GET", `/api/curriculum/lesson-plans/${lessonId}`));
    await record("activity detail", () => request(port, "GET", `/api/curriculum/activities/${activityId}`));
    await record("admin production-monitoring", () => request(port, "GET", "/api/admin/production-monitoring", {
      headers: { Authorization: `Bearer ${token}` },
    }));
    await record("admin analytics", () => request(port, "GET", "/api/admin/analytics", {
      headers: { Authorization: `Bearer ${token}` },
    }));

    const monitoring = await request(port, "GET", "/api/admin/production-monitoring", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const memCheck = (monitoring.json?.monitoring?.checks || []).find((c) => c.id === "memory");
    assert.ok(memCheck);
    assert.equal(monitoring.json.monitoring.config.instanceMemoryMb, 2048);
    assert.ok(monitoring.json.monitoring.config.memoryCriticalMb > 1000);
    // Local fixture should not trip Standard-scaled critical.
    assert.notEqual(memCheck.state, "critical");

    const peakRss = Math.max(...rows.map((r) => r.rssAfterMb || 0));
    const peakHeap = Math.max(...rows.map((r) => r.heapAfterMb || 0));
    const report = {
      storeJsonMb,
      lessonPlans: curriculum.lessonPlans.length,
      activities: curriculum.activities.length,
      peakRssMb: peakRss,
      peakHeapMb: peakHeap,
      workflows: rows,
      memoryCheck: {
        state: memCheck.state,
        warningMb: monitoring.json.monitoring.config.memoryWarningMb,
        criticalMb: monitoring.json.monitoring.config.memoryCriticalMb,
        detail: memCheck.detail,
      },
      profiler: memSnap("profiler-process"),
    };

    const outPath = path.join(ROOT, "docs", "MEMORY_WORKFLOW_PROFILE.json");
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    console.log(`\nWrote ${outPath}`);
    console.log("PASS memory workflow profile");
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(storePath); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
