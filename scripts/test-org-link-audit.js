#!/usr/bin/env node
/**
 * Read-only org-link audit endpoint + conflict detection tests.
 * Run: NODE_ENV=test node scripts/test-org-link-audit.js
 */
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 4193;
const BASE = `http://127.0.0.1:${PORT}`;
const STORE = path.join(ROOT, "server", `.org-link-audit-store-${process.pid}.json`);
const ADMIN_EMAIL = "owner@example.com";
const ADMIN_PASSWORD = "test-admin-password";
const ADMIN_CODE = "test-admin-code";
const ASHLEY = "tclashley@icloud.com";
const LADIISHA = "ladiisha01@gmail.com";

function request(method, urlPath, { body = null } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${BASE}${urlPath}`, {
      method,
      headers: { Accept: "application/json", "Content-Type": "application/json" },
    }, (res) => {
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
  for (let i = 0; i < 50; i += 1) {
    try {
      const res = await request("GET", "/api/health");
      if (res.status === 200) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Server did not become healthy");
}

async function main() {
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  assert.match(serverJs, /\/api\/admin\/org-link-audit/);
  assert.match(serverJs, /function buildOrgLinkAudit\(/);
  assert.match(serverJs, /dual_child_data_uids/);
  console.log("PASS  org-link audit markers present");

  fs.writeFileSync(STORE, JSON.stringify({
    users: {
      [ASHLEY]: {
        email: ASHLEY,
        role: "owner",
        accountType: "home_daycare",
        plan: "Founding",
        foundingMember: true,
        foundingMemberActive: true,
        foundingMemberHistorical: true,
        foundingMemberNumber: 12,
        priceLock: "Lifetime",
        monthlyPrice: "$9.99/month",
        stripeCustomerId: "cus_ashley_test",
        stripeSubscriptionId: "sub_ashley_test",
        stripeSubscriptionStatus: "active",
        firebaseUid: "uid-ashley",
      },
      [LADIISHA]: {
        email: LADIISHA,
        role: "owner",
        accountType: "home_daycare",
        plan: "Founding",
        foundingMember: true,
        foundingMemberActive: true,
        foundingMemberHistorical: true,
        internalAccessOverride: true,
        firebaseUid: "uid-ladiisha",
      },
    },
    foundingMembers: [ASHLEY, LADIISHA],
    programMembers: {},
    staffInvites: {},
    childData: {
      "uid-ashley": {
        updatedAt: new Date().toISOString(),
        data: { Profiles: [{ id: "c1", firstName: "A" }], Observations: [] },
      },
      "uid-ladiisha": {
        updatedAt: new Date().toISOString(),
        data: { Profiles: [{ id: "c2", firstName: "B" }], Observations: [] },
      },
    },
    scheduleByUser: {
      "uid-ashley": { classrooms: [{ id: "room-1" }], items: [{ id: "i1" }], updatedAt: new Date().toISOString() },
      "uid-ladiisha": { classrooms: [{ id: "room-2" }], items: [{ id: "i2" }], updatedAt: new Date().toISOString() },
    },
    adminSessions: {},
    memberSessions: {},
  }, null, 2));

  const child = spawn("node", ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(PORT),
      LLH_STORE_PATH: STORE,
      ADMIN_EMAIL,
      ADMIN_PASSWORD,
      ADMIN_ACCESS_CODE: ADMIN_CODE,
      FIREBASE_API_KEY: "",
      FIREBASE_AUTH_DOMAIN: "",
      FIREBASE_PROJECT_ID: "",
      FIREBASE_APP_ID: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForHealth();
    const login = await request("POST", "/api/admin/login", {
      body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, code: ADMIN_CODE },
    });
    assert.equal(login.status, 200, JSON.stringify(login.json));
    const token = login.json.token;
    assert.ok(token);

    const audit = await request(
      "GET",
      `/api/admin/org-link-audit?adminToken=${encodeURIComponent(token)}&emailA=${encodeURIComponent(ASHLEY)}&emailB=${encodeURIComponent(LADIISHA)}`,
    );
    assert.equal(audit.status, 200, JSON.stringify(audit.json));
    assert.equal(audit.json.readOnly, true);
    assert.equal(audit.json.destructive, false);
    assert.equal(audit.json.status, "BLOCKED");
    assert.equal(audit.json.recommended.keepFoundingOn, ASHLEY);
    assert.equal(audit.json.recommended.ladiishaRole, "director");
    assert.ok(audit.json.conflicts.some((c) => c.code === "dual_active_founding"));
    assert.ok(audit.json.conflicts.some((c) => c.code === "dual_child_data_uids"));
    assert.ok(audit.json.blockers.length >= 1);
    // Ensure no writes: store founding list unchanged length.
    const after = JSON.parse(fs.readFileSync(STORE, "utf8"));
    assert.equal(after.foundingMembers.length, 2);
    assert.equal(after.users[ASHLEY].stripeSubscriptionId, "sub_ashley_test");
    console.log("PASS  dual-founding + dual-UID data blocks merge");
    console.log("PASS  endpoint is read-only");
    console.log("\nAll org-link audit tests passed.");
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
