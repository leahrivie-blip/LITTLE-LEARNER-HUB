#!/usr/bin/env node
/**
 * Linked program member role repair — directors linked to an owner cannot stay role=owner.
 * Run: npm run test:linked-program-role-repair
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 4520 + Math.floor(Math.random() * 40);
const STORE = path.join(os.tmpdir(), `llh-linked-role-${crypto.randomBytes(4).toString("hex")}.json`);
const OWNER = "owner-linked@example.com";
const DIRECTOR = "director-linked@example.com";

const accountAccess = require("./account-access.js");
const programOwnership = require("../server/program-ownership.js");

function request(method, urlPath, { body = null } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(`http://127.0.0.1:${PORT}${urlPath}`, {
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
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await request("GET", "/api/health");
      if (res.status === 200) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("Server did not become healthy");
}

async function main() {
  const role = accountAccess.resolveUserRole({
    email: DIRECTOR,
    role: "owner",
    linkedProgramOwnerEmail: OWNER,
  });
  assert.equal(role, "director", "linked member with role=owner should resolve to director");

  const store = {
    users: {
      [OWNER]: { email: OWNER, role: "owner", programId: "prog_test" },
      [DIRECTOR]: {
        email: DIRECTOR,
        role: "owner",
        linkedProgramOwnerEmail: OWNER,
        programAccessViaOwner: true,
      },
    },
    programMembers: {},
  };
  const repaired = programOwnership.reconcileLinkedProgramMember(store.users[DIRECTOR], store);
  assert.equal(repaired.role, "director");
  assert.equal(repaired.programId, "prog_test");
  assert.equal(store.programMembers[OWNER].length, 1);
  assert.equal(store.programMembers[OWNER][0].email, DIRECTOR);

  fs.writeFileSync(STORE, JSON.stringify({
    users: {
      [OWNER]: { email: OWNER, role: "owner", plan: "Pro", subscriptionStatus: "Active" },
      [DIRECTOR]: {
        email: DIRECTOR,
        role: "owner",
        linkedProgramOwnerEmail: OWNER,
        programAccessViaOwner: true,
        plan: "Free",
      },
    },
    programMembers: {},
  }, null, 2));

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), LLH_STORE_PATH: STORE, NODE_ENV: "test" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForHealth();

    const before = await request("GET", `/api/subscription-status?email=${encodeURIComponent(DIRECTOR)}`);
    assert.equal(before.status, 200);
    assert.equal(before.json.subscription.role, "director", "subscription-status should repair role on read");

    const profile = await request("POST", "/api/account/profile", {
      body: {
        email: DIRECTOR,
        firstName: "Shadaishia",
        lastName: "Beard",
        role: "owner",
        lastLogin: true,
      },
    });
    assert.equal(profile.status, 200);
    assert.equal(profile.json.user.role, "director", "profile sync must not re-claim owner on linked account");

    const after = await request("GET", `/api/subscription-status?email=${encodeURIComponent(DIRECTOR)}`);
    assert.equal(after.json.subscription.role, "director");
    assert.equal(after.json.subscription.linkedProgramOwnerEmail, OWNER);

    console.log("test-linked-program-role-repair: all checks passed");
  } finally {
    child.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error("test-linked-program-role-repair failed:", error.message || error);
  process.exit(1);
});
