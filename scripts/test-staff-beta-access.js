#!/usr/bin/env node
/**
 * Staff beta allowlist: canAccessStaffBeta + POST /api/staff/invites enforcement.
 * Run: NODE_ENV=test node scripts/test-staff-beta-access.js
 */
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const {
  canAccessStaffBeta,
  STAFF_BETA_FORBIDDEN_MESSAGE,
  normalizeStaffBetaEmail,
} = require("./staff-beta-access.js");

const ROOT = path.join(__dirname, "..");
const PORT = 4183;
const BASE = `http://127.0.0.1:${PORT}`;
const STORE = path.join(ROOT, "server", `.staff-beta-test-store-${process.pid}.json`);

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

function request(method, urlPath, { email = "", body = null } = {}) {
  const headers = { Accept: "application/json", "Content-Type": "application/json" };
  if (email) {
    headers.Authorization = `Bearer test:${email}`;
    headers["X-LLH-User-Email"] = email;
  }
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

const OWNER_EMAIL = "leahivie@icloud.com";
const BETA_EMAIL = "tclashley@icloud.com";
const BETA_EMAIL_2 = "learnnplay123sc@gmail.com";
const PRO_USER = "pro-center@example.com";
const FREE_USER = "free-home@example.com";

async function main() {
  await test("helper: owner account allowed", () => {
    assert.equal(canAccessStaffBeta({ email: OWNER_EMAIL }), true);
    assert.equal(canAccessStaffBeta(OWNER_EMAIL), true);
  });

  await test("helper: tclashley@iCloud.com allowed (normalized)", () => {
    assert.equal(canAccessStaffBeta({ email: "tclashley@iCloud.com" }), true);
    assert.equal(canAccessStaffBeta({ email: "TCLASHLEY@ICLOUD.COM" }), true);
    assert.equal(canAccessStaffBeta("  TClashley@iCloud.com  "), true);
    assert.equal(normalizeStaffBetaEmail("TCLASHLEY@ICLOUD.COM"), "tclashley@icloud.com");
  });

  await test("helper: tashley@icloud.com is the old typo identity and is denied", () => {
    assert.equal(canAccessStaffBeta("tashley@icloud.com"), false);
    assert.equal(canAccessStaffBeta({ email: "TASHLEY@ICLOUD.COM" }), false);
  });

  await test("helper: learnnplay123sc@gmail.com allowed (normalized)", () => {
    assert.equal(canAccessStaffBeta({ email: "learnnplay123sc@gmail.com" }), true);
    assert.equal(canAccessStaffBeta({ email: "LearnNPlay123SC@Gmail.com" }), true);
    assert.equal(canAccessStaffBeta("  LEARNNPLAY123SC@GMAIL.COM  "), true);
  });

  await test("helper: random Pro user denied", () => {
    assert.equal(canAccessStaffBeta({ email: PRO_USER, plan: "Pro", role: "owner" }), false);
  });

  await test("helper: random Free user denied", () => {
    assert.equal(canAccessStaffBeta({ email: FREE_USER, plan: "Free", role: "owner" }), false);
  });

  await test("helper: does not trust unrelated fields / empty", () => {
    assert.equal(canAccessStaffBeta(null), false);
    assert.equal(canAccessStaffBeta({}), false);
    assert.equal(canAccessStaffBeta({ email: "", role: "owner" }), false);
    // Body-style spoof: only .email is read; spoof fields must not grant access.
    assert.equal(canAccessStaffBeta({ email: PRO_USER, allowlistedEmail: BETA_EMAIL }), false);
  });

  await test("helper: injected isConfiguredAdminEmail grants owner", () => {
    assert.equal(
      canAccessStaffBeta({ email: "custom-owner@example.com" }, {
        isConfiguredAdminEmail: (email) => email === "custom-owner@example.com",
      }),
      true,
    );
    assert.equal(
      canAccessStaffBeta({ email: PRO_USER }, {
        isConfiguredAdminEmail: () => false,
      }),
      false,
    );
  });

  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const serverJs = fs.readFileSync(path.join(ROOT, "server", "index.js"), "utf8");
  assert.match(appJs, /function canAccessStaffBeta/);
  assert.match(appJs, /canAccessStaffBeta\(\)/);
  assert.match(appJs, /tclashley@icloud\.com/);
  assert.match(appJs, /learnnplay123sc@gmail\.com/);
  assert.equal(appJs.includes("tashley@icloud.com"), false);
  assert.match(serverJs, /staffBetaAccess\.canAccessStaffBeta/);
  assert.match(serverJs, /STAFF_BETA_FORBIDDEN_MESSAGE/);
  console.log("PASS  staff beta markers present in app.js + server");

  fs.writeFileSync(STORE, JSON.stringify({
    users: {
      [OWNER_EMAIL]: {
        email: OWNER_EMAIL,
        role: "owner",
        accountType: "center",
        plan: "Pro",
        subscriptionStatus: "Pro Subscription Active",
        stripeSubscriptionStatus: "active",
      },
      [BETA_EMAIL]: {
        email: BETA_EMAIL,
        role: "owner",
        accountType: "home_daycare",
        plan: "Pro",
        subscriptionStatus: "Staff Plan Subscription Active",
        stripeSubscriptionStatus: "active",
        billingOffer: "staff_plan",
        foundingMemberNumber: 17,
        foundingMemberHistorical: true,
        foundingMemberActive: false,
      },
      [BETA_EMAIL_2]: {
        email: BETA_EMAIL_2,
        role: "owner",
        accountType: "home_daycare",
        plan: "Pro",
        subscriptionStatus: "Staff Plan Subscription Active",
        stripeSubscriptionStatus: "active",
        billingOffer: "staff_plan",
        foundingMemberActive: false,
      },
      [PRO_USER]: {
        email: PRO_USER,
        role: "owner",
        accountType: "center",
        plan: "Pro",
        subscriptionStatus: "Pro Subscription Active",
        stripeSubscriptionStatus: "active",
      },
      [FREE_USER]: {
        email: FREE_USER,
        role: "owner",
        accountType: "home_daycare",
        plan: "Free",
        subscriptionStatus: "Free Plan",
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
      ADMIN_EMAIL: OWNER_EMAIL,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let bootLog = "";
  child.stdout.on("data", (d) => { bootLog += d.toString(); });
  child.stderr.on("data", (d) => { bootLog += d.toString(); });

  const inviteBody = {
    email: "new-teacher@example.com",
    role: "teacher",
    classroomId: "room-a",
    classroomName: "Room A",
    programName: "Beta Test Program",
    appOrigin: BASE,
  };

  try {
    await waitForHealth();

    await test("API: owner account can create staff invite", async () => {
      const res = await request("POST", "/api/staff/invites", {
        email: OWNER_EMAIL,
        body: { ...inviteBody, email: "teacher-for-owner@example.com" },
      });
      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.equal(res.json.invite.email, "teacher-for-owner@example.com");
    });

    await test("API: tclashley@icloud.com can create staff invite", async () => {
      const res = await request("POST", "/api/staff/invites", {
        email: BETA_EMAIL,
        body: { ...inviteBody, email: "teacher-for-tclashley@example.com" },
      });
      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.equal(res.json.invite.email, "teacher-for-tclashley@example.com");
    });

    await test("API: learnnplay123sc@gmail.com can create staff invite", async () => {
      const res = await request("POST", "/api/staff/invites", {
        email: BETA_EMAIL_2,
        body: { ...inviteBody, email: "teacher-for-learnnplay@example.com" },
      });
      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.equal(res.json.invite.email, "teacher-for-learnnplay@example.com");
    });

    await test("API: TCLASHLEY@ICLOUD.COM allowed after auth normalization", async () => {
      const res = await request("POST", "/api/staff/invites", {
        email: "TCLASHLEY@ICLOUD.COM",
        body: { ...inviteBody, email: "teacher-case@example.com" },
      });
      assert.equal(res.status, 200, JSON.stringify(res.json));
    });

    await test("API: tashley@icloud.com typo identity is denied", async () => {
      const res = await request("POST", "/api/staff/invites", {
        email: "tashley@icloud.com",
        body: { ...inviteBody, email: "should-not-create-from-typo@example.com" },
      });
      assert.equal(res.status, 403);
      assert.equal(res.json.error, STAFF_BETA_FORBIDDEN_MESSAGE);
    });

    await test("API: random Pro user denied with 403", async () => {
      const res = await request("POST", "/api/staff/invites", {
        email: PRO_USER,
        body: { ...inviteBody, email: "should-not-create@example.com" },
      });
      assert.equal(res.status, 403);
      assert.equal(res.json.error, STAFF_BETA_FORBIDDEN_MESSAGE);
      assert.equal(JSON.stringify(res.json).includes("tclashley"), false);
      assert.equal(JSON.stringify(res.json).includes("learnnplay"), false);
      assert.equal(JSON.stringify(res.json).includes("allowlist"), false);
    });

    await test("API: random Free user denied with 403", async () => {
      const res = await request("POST", "/api/staff/invites", {
        email: FREE_USER,
        body: { ...inviteBody, email: "also-should-not@example.com" },
      });
      assert.equal(res.status, 403);
      assert.equal(res.json.error, STAFF_BETA_FORBIDDEN_MESSAGE);
    });

    await test("API: unauthenticated request keeps existing auth behavior", async () => {
      const res = await request("POST", "/api/staff/invites", {
        body: { ...inviteBody, email: "anon@example.com" },
      });
      assert.equal(res.status, 401);
      assert.notEqual(res.json.error, STAFF_BETA_FORBIDDEN_MESSAGE);
    });

    await test("API: no staff records deleted by beta gate", async () => {
      const store = JSON.parse(fs.readFileSync(STORE, "utf8"));
      assert.ok(store.users[OWNER_EMAIL]);
      assert.ok(store.users[BETA_EMAIL]);
      assert.ok(store.users[BETA_EMAIL_2]);
      assert.ok(store.users[PRO_USER]);
      assert.ok(store.users[FREE_USER]);
      const invites = Object.values(store.staffInvites || {});
      assert.ok(invites.some((i) => i.email === "teacher-for-owner@example.com"));
      assert.ok(invites.some((i) => i.email === "teacher-for-tclashley@example.com"));
      assert.ok(invites.some((i) => i.email === "teacher-for-learnnplay@example.com"));
      assert.equal(invites.some((i) => i.email === "should-not-create@example.com"), false);
    });
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE); } catch {}
    if (process.exitCode) console.error(bootLog.slice(-2000));
  }

  if (!process.exitCode) console.log("\nAll staff beta access tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
