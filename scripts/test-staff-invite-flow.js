#!/usr/bin/env node
/**
 * Staff invite API flow tests (create → peek → accept → permissions).
 * Run: NODE_ENV=test node scripts/test-staff-invite-flow.js
 */
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 4179;
const BASE = `http://127.0.0.1:${PORT}`;
const STORE = path.join(ROOT, "server", `.staff-invite-test-store-${process.pid}.json`);

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`PASS  ${name}`))
    .catch((error) => {
      console.error(`FAIL  ${name}`);
      console.error(error);
      process.exitCode = 1;
    });
}

function request(method, urlPath, { email = "", body = null, token = "" } = {}) {
  const headers = { Accept: "application/json", "Content-Type": "application/json" };
  if (email) {
    headers.Authorization = `Bearer test:${email}`;
    headers["X-LLH-User-Email"] = email;
  }
  if (token) headers.Authorization = `Bearer test:${token}`;
  return new Promise((resolve, reject) => {
    const req = http.request(`${BASE}${urlPath}`, { method, headers }, (res) => {
      let raw = "";
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        let json = {};
        try { json = raw ? JSON.parse(raw) : {}; } catch { json = { raw }; }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function waitForHealth() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await request("GET", "/api/health");
      if (res.status === 200) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("Server did not become healthy");
}

async function main() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const serverJs = fs.readFileSync(path.join(ROOT, "server", "index.js"), "utf8");
  assert.match(serverJs, /\/api\/staff\/invites/);
  assert.match(serverJs, /handleStaffInviteAccept/);
  assert.match(appJs, /Send Invite/);
  assert.match(appJs, /acceptStaffInviteToken/);
  assert.match(appJs, /programAccessViaOwner/);
  console.log("PASS  staff invite markers present");

  fs.writeFileSync(STORE, JSON.stringify({
    users: {
      "owner@example.com": {
        email: "owner@example.com",
        role: "owner",
        accountType: "center",
        plan: "Pro",
        subscriptionStatus: "Pro Subscription Active",
        stripeSubscriptionStatus: "active",
        foundingMemberActive: false,
      },
    },
  }, null, 2));

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(PORT),
      LLH_STORE_PATH: STORE,
      ALLOW_EMAIL_SCHEDULE_AUTH: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let bootLog = "";
  child.stdout.on("data", (d) => { bootLog += d.toString(); });
  child.stderr.on("data", (d) => { bootLog += d.toString(); });

  try {
    await waitForHealth();

    await test("owner can create invite", async () => {
      const res = await request("POST", "/api/staff/invites", {
        email: "owner@example.com",
        body: {
          email: "teacher@example.com",
          role: "teacher",
          classroomId: "room-a",
          classroomName: "Room A",
          programName: "Sunshine Center",
          appOrigin: BASE,
        },
      });
      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.equal(res.json.invite.email, "teacher@example.com");
      assert.equal(res.json.invite.role, "teacher");
      assert.ok(res.json.acceptUrl.includes("staffInvite="));
      globalThis.__inviteToken = new URL(res.json.acceptUrl).searchParams.get("staffInvite");
      globalThis.__inviteId = res.json.invite.id;
    });

    await test("peek returns pending invite", async () => {
      const res = await request("GET", `/api/staff/invites/peek?token=${globalThis.__inviteToken}`);
      assert.equal(res.status, 200);
      assert.equal(res.json.invite.status, "pending");
    });

    await test("wrong account cannot accept", async () => {
      const res = await request("POST", "/api/staff/invites/accept", {
        email: "wrong@example.com",
        body: { token: globalThis.__inviteToken },
      });
      assert.equal(res.status, 403);
    });

    await test("invited teacher can accept and receives role/classroom", async () => {
      const res = await request("POST", "/api/staff/invites/accept", {
        email: "teacher@example.com",
        body: { token: globalThis.__inviteToken },
      });
      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.equal(res.json.account.role, "teacher");
      assert.equal(res.json.account.linkedProgramOwnerEmail, "owner@example.com");
      assert.deepEqual(res.json.account.classroomIds, ["room-a"]);
      assert.equal(res.json.account.programAccessViaOwner, true);
    });

    await test("owner list shows accepted member", async () => {
      const res = await request("GET", "/api/staff/invites", { email: "owner@example.com" });
      assert.equal(res.status, 200);
      assert.ok(res.json.members.some((m) => m.email === "teacher@example.com" && m.role === "teacher"));
    });

    await test("teacher cannot manage staff invites", async () => {
      const res = await request("POST", "/api/staff/invites", {
        email: "teacher@example.com",
        body: { email: "assistant@example.com", role: "assistant" },
      });
      assert.equal(res.status, 403);
    });
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE); } catch {}
    if (process.exitCode) console.error(bootLog.slice(-2000));
  }

  if (!process.exitCode) console.log("\nAll staff invite flow tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
