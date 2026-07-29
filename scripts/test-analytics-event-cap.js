#!/usr/bin/env node
/**
 * Analytics cap + prune safety:
 * - Boot prune trims only analyticsEvents
 * - Users / curriculum / messages / founding / series are untouched
 * - Runtime event recording also respects the cap
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const http = require("http");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 4900 + Math.floor(Math.random() * 200);
const STORE = path.join(os.tmpdir(), `llh-analytics-cap-${crypto.randomBytes(4).toString("hex")}.json`);
const CAP = 50;

function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: payload
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
          : {},
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

async function waitForHealth(child, attempts = 60) {
  for (let i = 0; i < attempts; i += 1) {
    if (child.exitCode !== null) throw new Error(`server exited ${child.exitCode}`);
    try {
      const health = await request("GET", "/api/health");
      if (health.status === 200 && health.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("server did not become healthy");
}

function buildSeedStore() {
  return {
    users: {
      "keeper@example.com": {
        email: "keeper@example.com",
        plan: "Pro",
        subscriptionStatus: "active",
        firstName: "Keep",
        lastName: "Me",
      },
      "member@example.com": {
        email: "member@example.com",
        plan: "Free",
        firstName: "Free",
        lastName: "Member",
      },
    },
    messages: [
      { id: "msg-1", toEmail: "keeper@example.com", body: "hello", createdAt: new Date().toISOString() },
    ],
    notifications: [{ id: "n-1", email: "keeper@example.com", text: "note" }],
    foundingMembers: ["keeper@example.com"],
    supportTickets: [{ id: "t-1", email: "member@example.com", subject: "help" }],
    analyticsEvents: Array.from({ length: 120 }, (_, index) => ({
      id: `evt-${index}`,
      name: "page_view",
      createdAt: new Date(Date.now() - (120 - index) * 1000).toISOString(),
      user: "keeper@example.com",
    })),
    siteContent: {
      curriculum: {
        lessonPlans: [
          {
            id: "cur-lp-family-connections-keep",
            title: "Family Connections Keep",
            age: "Preschool",
            plan: "Pro",
            status: "published",
          },
        ],
        activities: [
          { id: "cur-act-keep-1", lessonPlanId: "cur-lp-family-connections-keep", title: "Keep Activity" },
        ],
        series: [
          {
            id: "cur-series-preschool-family-connections",
            collectionKey: "family-connections",
            age: "Preschool",
            status: "needs_review",
            weeks: [
              { weekNumber: 1, lessonPlanId: "" },
              { weekNumber: 2, lessonPlanId: "cur-lp-family-connections-keep" },
            ],
          },
        ],
        updatedAt: "2026-07-29T15:00:00.000Z",
      },
      updatedAt: "2026-07-29T15:00:00.000Z",
    },
    membershipAudit: [{ id: "a1", email: "keeper@example.com", action: "upgrade" }],
  };
}

function assertProtectedInventory(store, label) {
  // Boot curriculum seeders may ADD lesson plans; pruning must never remove ours
  // or wipe users/messages/subscriptions/founding/series.
  assert.ok(store.users["keeper@example.com"], `${label}: keeper user`);
  assert.ok(store.users["member@example.com"], `${label}: member user`);
  assert.strictEqual(store.users["keeper@example.com"].plan, "Pro", `${label}: keeper plan`);
  assert.strictEqual(store.users["keeper@example.com"].subscriptionStatus, "active", `${label}: subscription`);
  assert.ok((store.messages || []).some((m) => m.id === "msg-1"), `${label}: message kept`);
  assert.ok((store.notifications || []).some((n) => n.id === "n-1"), `${label}: notification kept`);
  assert.ok((store.foundingMembers || []).includes("keeper@example.com"), `${label}: founding kept`);
  assert.ok((store.supportTickets || []).some((t) => t.id === "t-1"), `${label}: ticket kept`);
  assert.ok((store.membershipAudit || []).some((a) => a.id === "a1"), `${label}: membershipAudit kept`);
  const curriculum = store.siteContent?.curriculum || {};
  const plans = curriculum.lessonPlans || [];
  const activities = curriculum.activities || [];
  const series = curriculum.series || [];
  assert.ok(plans.some((p) => p.id === "cur-lp-family-connections-keep"), `${label}: Family Connections plan kept`);
  assert.ok(activities.some((a) => a.id === "cur-act-keep-1"), `${label}: activity kept`);
  const fc = series.find((s) => s.id === "cur-series-preschool-family-connections");
  assert.ok(fc, `${label}: Family Connections series kept`);
  assert.strictEqual(fc.collectionKey, "family-connections", `${label}: collectionKey`);
  assert.ok(
    (fc.weeks || []).some((w) => w.lessonPlanId === "cur-lp-family-connections-keep"),
    `${label}: series week link kept`,
  );
}

async function main() {
  const seed = buildSeedStore();
  fs.writeFileSync(STORE, JSON.stringify(seed));

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: "127.0.0.1",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE,
      MAX_ANALYTICS_EVENTS: String(CAP),
      ADMIN_EMAIL: "owner@test.local",
      ADMIN_PASSWORD: "pass",
      ADMIN_ACCESS_CODE: "code",
      ALLOW_BOOT_SPARSE_STORE_RECOVERY: "false",
      EMAIL_AUTOMATIONS_ENABLED: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let bootLog = "";
  child.stdout.on("data", (chunk) => { bootLog += chunk.toString(); });
  child.stderr.on("data", (chunk) => { bootLog += chunk.toString(); });

  try {
    await waitForHealth(child);
    await new Promise((r) => setTimeout(r, 500));

    const afterBoot = JSON.parse(fs.readFileSync(STORE, "utf8"));
    assert.strictEqual(afterBoot.analyticsEvents.length, CAP, "boot prune cap");
    assertProtectedInventory(afterBoot, "after boot prune");
    assert.ok(bootLog.includes("[analytics] boot prune"), `missing prune log:\n${bootLog.slice(-1500)}`);
    console.log(`PASS boot prune — ${CAP} events; protected inventory intact`);

    // Runtime recording should keep the cap while leaving inventory alone.
    for (let i = 0; i < 10; i += 1) {
      const res = await request("POST", "/api/analytics/event", {
        id: `runtime-${i}-${Date.now()}`,
        name: "page_view",
        user: "keeper@example.com",
      });
      assert.strictEqual(res.status, 200, `runtime event ${i}: ${res.status} ${res.text}`);
    }
    await new Promise((r) => setTimeout(r, 300));
    const afterRuntime = JSON.parse(fs.readFileSync(STORE, "utf8"));
    assert.ok(afterRuntime.analyticsEvents.length <= CAP, `runtime cap exceeded: ${afterRuntime.analyticsEvents.length}`);
    assertProtectedInventory(afterRuntime, "after runtime events");
    console.log(`PASS runtime cap — ${afterRuntime.analyticsEvents.length} events; protected inventory intact`);

    // store-health memory block should be counts/metrics only (admin login).
    const login = await request("POST", "/api/admin/login", {
      email: "owner@test.local",
      password: "pass",
      code: "code",
    });
    assert.strictEqual(login.status, 200, login.text);
    const token = login.json.token;
    const health = await request("GET", `/api/admin/store-health?adminToken=${encodeURIComponent(token)}`);
    assert.strictEqual(health.status, 200, health.text);
    const memory = health.json?.health?.memory || {};
    assert.ok(typeof memory.heapUsedMb === "number", "heapUsedMb");
    assert.ok(typeof memory.rssMb === "number", "rssMb");
    assert.strictEqual(memory.analyticsEventCap, CAP, "analyticsEventCap");
    const memoryJson = JSON.stringify(memory);
    assert.ok(!/keeper@example.com|member@example.com|password|subscription/i.test(memoryJson), "memory stats leaked private fields");
    assert.ok(!/"body"|"token"|"stripeSecret"/i.test(memoryJson), "memory stats leaked sensitive keys");
    console.log("PASS store-health memory stats are numeric/non-PII");
  } finally {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((resolve) => {
        const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* ignore */ } resolve(); }, 2000);
        child.on("exit", () => { clearTimeout(timer); resolve(); });
      });
    }
    try { fs.rmSync(STORE, { force: true }); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
