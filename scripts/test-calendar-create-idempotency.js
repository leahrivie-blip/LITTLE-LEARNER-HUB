#!/usr/bin/env node
/**
 * Calendar create idempotency — same clientMutationId twice => one event.
 * Also covers schedule-lib unit behavior and client wiring tokens.
 *
 * Run: npm run test:calendar-create-idempotency
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const scheduleLib = require("../server/schedule-lib.js");

const ROOT = path.join(__dirname, "..");
const PORT = 19970 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-cal-idem-${crypto.randomBytes(4).toString("hex")}.json`);
const EMAIL = "cal-idempotency@test.local";

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
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

function authHeaders() {
  return { Authorization: `Bearer test:${EMAIL}`, "X-LLH-User-Email": EMAIL };
}

function startServer() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {}, scheduleByUser: {} }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      ALLOW_EMAIL_SCHEDULE_AUTH: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 90; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Server did not boot");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 3000);
    child.on("exit", () => { clearTimeout(timer); resolve(); });
  });
}

function staticChecks() {
  console.log("Static wiring");
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const scheduleJs = fs.readFileSync(path.join(ROOT, "scripts/llh-schedule.js"), "utf8");
  const lib = fs.readFileSync(path.join(ROOT, "server/schedule-lib.js"), "utf8");
  ok(appJs.includes("clientMutationId"), "app.js sends clientMutationId");
  ok(appJs.includes("newCalendarClientMutationId"), "app.js generates stable mutation ids");
  ok(appJs.includes("submitBtn.disabled = true"), "Save disabled on submit");
  ok(appJs.includes("if (calendarEventSaveInFlight) return false"), "in-flight guard present");
  ok(scheduleJs.includes("clientMutationId"), "llh-schedule preserves clientMutationId");
  ok(lib.includes("clientMutationId"), "schedule-lib stores clientMutationId");
}

function unitIdempotency() {
  console.log("schedule-lib unit idempotency");
  const mutationId = "cm-unit-test-1";
  const first = scheduleLib.upsertScheduleItem({ items: [], classrooms: [] }, {
    id: "sch-a",
    clientMutationId: mutationId,
    type: "reminder",
    title: "Disposable Water Day",
    startDate: "2026-08-12",
    endDate: "2026-08-12",
    weekStartDate: "2026-08-10",
  });
  const second = scheduleLib.upsertScheduleItem(first.doc, {
    id: "sch-b-different",
    clientMutationId: mutationId,
    type: "reminder",
    title: "Disposable Water Day",
    startDate: "2026-08-12",
    endDate: "2026-08-12",
    weekStartDate: "2026-08-10",
  });
  const matches = second.doc.items.filter((item) => item.clientMutationId === mutationId);
  ok(matches.length === 1, "unit: only one item for repeated clientMutationId");
  ok(matches[0].id === "sch-a", "unit: original id retained on replay");
}

async function apiIdempotency() {
  console.log("API double-create");
  const mutationId = `cm-api-${crypto.randomBytes(6).toString("hex")}`;
  const bodyA = {
    id: "sch-dup-a",
    clientMutationId: mutationId,
    type: "classroom_event",
    title: "Disposable Idempotent Event",
    startDate: "2026-08-14",
    endDate: "2026-08-14",
    weekStartDate: "2026-08-10",
    allDay: true,
    notes: "first",
    classroomId: "classroom-main",
  };
  const bodyB = {
    ...bodyA,
    id: "sch-dup-b",
    notes: "retry",
  };

  const first = await requestJson("PUT", `/api/schedule/items/${bodyA.id}`, bodyA, authHeaders());
  ok(first.status === 200, `first create status 200 (got ${first.status})`);
  ok(first.json?.item?.clientMutationId === mutationId, "first response stores clientMutationId");

  const second = await requestJson("PUT", `/api/schedule/items/${bodyB.id}`, bodyB, authHeaders());
  ok(second.status === 200, `second create status 200 (got ${second.status})`);
  ok(second.json?.idempotentReplay === true, "second response marked idempotentReplay");
  ok(second.json?.item?.id === first.json?.item?.id, "second response returns original item id");

  const get = await requestJson("GET", "/api/schedule", null, authHeaders());
  const items = (get.json?.items || []).filter((item) => item.clientMutationId === mutationId);
  ok(items.length === 1, `schedule contains exactly one event for mutation (got ${items.length})`);
  const byTitle = (get.json?.items || []).filter((item) => item.title === "Disposable Idempotent Event");
  ok(byTitle.length === 1, "title also unique — no duplicate event rows");

  // Cleanup disposable item
  const del = await requestJson("DELETE", `/api/schedule/items/${items[0].id}`, null, authHeaders());
  ok(del.status === 200 || del.status === 204, "disposable event deleted");
  const after = await requestJson("GET", "/api/schedule", null, authHeaders());
  ok(!(after.json?.items || []).some((item) => item.clientMutationId === mutationId), "cleanup confirmed");
}

async function main() {
  staticChecks();
  unitIdempotency();
  const child = startServer();
  try {
    await waitForBoot(child);
    await apiIdempotency();
    console.log(`\nAll ${passed} calendar create idempotency assertions passed.`);
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch (_e) { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("\nFAIL:", error.message || error);
  process.exit(1);
});
