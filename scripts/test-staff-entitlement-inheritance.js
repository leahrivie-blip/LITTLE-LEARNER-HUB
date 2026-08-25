#!/usr/bin/env node
/**
 * HTTP regression for staff Pro inheritance + 5-seat cap.
 * Run: NODE_ENV=test node scripts/test-staff-entitlement-inheritance.js
 */
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const staffEntitlement = require("../server/staff-entitlement.js");

const ROOT = path.join(__dirname, "..");
const PORT = 4183;
const BASE = `http://127.0.0.1:${PORT}`;
const STORE = path.join(ROOT, "server", `.staff-entitlement-test-store-${process.pid}.json`);
const OWNER = "tclashley@icloud.com";
const CODIRECTOR = "codirector.ashley@example.com";
const NON_BETA = "provider@example.com";

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
  for (let i = 0; i < 50; i += 1) {
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
  assert.match(appJs, /function hasInheritedProgramProAccess/);
  assert.match(appJs, /You’ve reached the 5 staff limit for your beta account/);
  assert.match(appJs, /data-staff-member-remove/);

  fs.writeFileSync(STORE, JSON.stringify({
    users: {
      [OWNER]: {
        email: OWNER,
        role: "owner",
        accountType: "home_daycare",
        plan: "Pro",
        subscriptionStatus: "Staff Plan Subscription Active",
        stripeSubscriptionStatus: "active",
        billingOffer: "staff_plan",
        foundingMemberNumber: 17,
        foundingMemberHistorical: true,
        foundingMemberActive: false,
        stripeCustomerId: "cus_ashley",
        stripeSubscriptionId: "sub_ashley",
      },
      [CODIRECTOR]: {
        email: CODIRECTOR,
        role: "director",
        linkedProgramOwnerEmail: OWNER,
        programAccessViaOwner: false,
        plan: "Free",
        subscriptionStatus: "Free Plan",
        stripeCustomerId: "",
        stripeSubscriptionId: "",
      },
      [NON_BETA]: {
        email: NON_BETA,
        role: "owner",
        plan: "Pro",
        subscriptionStatus: "Pro Subscription Active",
        stripeSubscriptionStatus: "active",
        stripeCustomerId: "cus_other",
        stripeSubscriptionId: "sub_other",
      },
      "paid.solo@example.com": {
        email: "paid.solo@example.com",
        role: "owner",
        plan: "Pro",
        subscriptionStatus: "Pro Subscription Active",
        stripeSubscriptionStatus: "active",
        stripeCustomerId: "cus_solo",
        stripeSubscriptionId: "sub_solo",
      },
    },
    programMembers: {
      [OWNER]: [
        { email: CODIRECTOR, role: "director", status: "active", joinedAt: "2026-08-01T12:00:00.000Z" },
      ],
    },
    staffInvites: {},
  }, null, 2));

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(PORT),
      LLH_STORE_PATH: STORE,
      DATABASE_PROVIDER: "local-json",
      STRIPE_SECRET_KEY: "",
      DATABASE_URL: "",
      ALLOW_EMAIL_SCHEDULE_AUTH: "true",
      ADMIN_EMAIL: "leahivie@icloud.com",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let bootLog = "";
  child.stdout.on("data", (d) => { bootLog += d.toString(); });
  child.stderr.on("data", (d) => { bootLog += d.toString(); });

  try {
    await waitForHealth();

    await test("1+17 existing accepted co-director inherits Pro without re-invite", async () => {
      const res = await request("GET", `/api/subscription-status?email=${encodeURIComponent(CODIRECTOR)}`);
      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.equal(res.json.subscription.hasProAccess, true);
      assert.equal(res.json.subscription.accessInheritedFromOwner, OWNER);
      assert.equal(res.json.subscription.independentlySubscribed, false);
      assert.equal(res.json.subscription.billingSource, "owner");
      assert.equal(res.json.subscription.stripeSubscriptionId, "");
    });

    await test("5+18+19 staff role stays director and billing stays on owner", async () => {
      const res = await request("GET", `/api/subscription-status?email=${encodeURIComponent(CODIRECTOR)}`);
      assert.equal(res.json.subscription.role, "director");
      assert.ok(!res.json.subscription.capabilities?.includes?.("billing"));
      const owner = await request("GET", `/api/subscription-status?email=${encodeURIComponent(OWNER)}`);
      assert.equal(owner.json.subscription.hasProAccess, true);
      assert.equal(owner.json.subscription.independentlySubscribed, true);
      assert.equal(owner.json.subscription.stripeSubscriptionId, "sub_ashley");
    });

    await test("20 standalone paid user still has personal Pro", async () => {
      const res = await request("GET", "/api/subscription-status?email=paid.solo@example.com");
      assert.equal(res.json.subscription.hasProAccess, true);
      assert.equal(res.json.subscription.independentlySubscribed, true);
      assert.equal(res.json.subscription.accessInheritedFromOwner, "");
    });

    await test("16 non-allowlisted owner is blocked from Add Staff API", async () => {
      const res = await request("POST", "/api/staff/invites", {
        email: NON_BETA,
        body: { email: "blocked@example.com", role: "teacher" },
      });
      assert.equal(res.status, 403);
      assert.match(String(res.json.error || ""), /not available/i);
    });

    await test("1 allowlisted Pro owner invites first extra staff", async () => {
      const res = await request("POST", "/api/staff/invites", {
        email: OWNER,
        body: { email: "teacher.free@example.com", role: "teacher", appOrigin: BASE },
      });
      assert.equal(res.status, 200, JSON.stringify(res.json));
      globalThis.__token = new URL(res.json.acceptUrl).searchParams.get("staffInvite");
    });

    await test("2+3+4 staff accept and inherit parent Pro", async () => {
      const res = await request("POST", "/api/staff/invites/accept", {
        email: "teacher.free@example.com",
        body: { token: globalThis.__token },
      });
      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.equal(res.json.account.linkedProgramOwnerEmail, OWNER);
      const status = await request("GET", "/api/subscription-status?email=teacher.free@example.com");
      assert.equal(status.json.subscription.hasProAccess, true);
      assert.equal(status.json.subscription.accessInheritedFromOwner, OWNER);
    });

    await test("12 duplicate pending invite does not create a second seat", async () => {
      const first = await request("POST", "/api/staff/invites", {
        email: OWNER,
        body: { email: "dup@example.com", role: "teacher", appOrigin: BASE },
      });
      assert.equal(first.status, 200, JSON.stringify(first.json));
      const second = await request("POST", "/api/staff/invites", {
        email: OWNER,
        body: { email: "dup@example.com", role: "assistant", appOrigin: BASE },
      });
      assert.equal(second.status, 409);
      const listed = await request("GET", "/api/staff/invites", { email: OWNER });
      const pending = listed.json.invites.filter((invite) => invite.email === "dup@example.com" && invite.status === "pending");
      assert.equal(pending.length, 1);
    });

    await test("13 active staff cannot create a duplicate seat", async () => {
      const res = await request("POST", "/api/staff/invites", {
        email: OWNER,
        body: { email: CODIRECTOR, role: "director", appOrigin: BASE },
      });
      assert.equal(res.status, 409);
    });

    await test("6+7 5th invite succeeds and 6th fails", async () => {
      const listed = await request("GET", "/api/staff/invites", { email: OWNER });
      let used = listed.json.seats.used;
      let n = 0;
      while (used < 5) {
        n += 1;
        const res = await request("POST", "/api/staff/invites", {
          email: OWNER,
          body: { email: `seatfill${n}@example.com`, role: "assistant", appOrigin: BASE },
        });
        assert.equal(res.status, 200, JSON.stringify(res.json));
        used += 1;
      }
      const sixth = await request("POST", "/api/staff/invites", {
        email: OWNER,
        body: { email: "sixth@example.com", role: "teacher", appOrigin: BASE },
      });
      assert.equal(sixth.status, 409);
      assert.equal(sixth.json.error, staffEntitlement.STAFF_LIMIT_MESSAGE);
      const after = await request("GET", "/api/staff/invites", { email: OWNER });
      assert.equal(after.json.seats.used, 5);
      assert.equal(after.json.seats.canInvite, false);
    });

    await test("9 revoked invite frees a seat", async () => {
      const listed = await request("GET", "/api/staff/invites", { email: OWNER });
      const pending = listed.json.invites.find((invite) => invite.status === "pending");
      assert.ok(pending);
      const revoked = await request("DELETE", `/api/staff/invites/${encodeURIComponent(pending.id)}`, { email: OWNER });
      assert.equal(revoked.status, 200, JSON.stringify(revoked.json));
      const after = await request("GET", "/api/staff/invites", { email: OWNER });
      assert.equal(after.json.seats.used, 4);
    });

    await test("10 removed staff frees a seat", async () => {
      const removed = await request("DELETE", `/api/staff/members/${encodeURIComponent("teacher.free@example.com")}`, {
        email: OWNER,
      });
      assert.equal(removed.status, 200, JSON.stringify(removed.json));
      const after = await request("GET", "/api/staff/invites", { email: OWNER });
      assert.ok(after.json.seats.used <= 3);
      const status = await request("GET", "/api/subscription-status?email=teacher.free@example.com");
      assert.equal(status.json.subscription.hasProAccess, false);
      assert.equal(status.json.subscription.stripeSubscriptionId, "");
    });

    await test("11 expired invite does not consume a seat", async () => {
      const listed = await request("GET", "/api/staff/invites", { email: OWNER });
      const seats = staffEntitlement.countStaffSeats({
        invites: [
          ...listed.json.invites,
          { email: "expired@example.com", status: "pending", expiresAt: "2020-01-01T00:00:00.000Z" },
        ],
        members: listed.json.members,
      });
      assert.equal(seats.pendingInvites, listed.json.seats.pendingInvites);
    });

    await test("14 concurrent invites cannot exceed 5", async () => {
      const listed = await request("GET", "/api/staff/invites", { email: OWNER });
      const remaining = listed.json.seats.remaining;
      const attempts = Array.from({ length: remaining + 6 }, (_, i) => request("POST", "/api/staff/invites", {
        email: OWNER,
        body: { email: `race${i}@example.com`, role: "teacher", appOrigin: BASE },
      }));
      const results = await Promise.all(attempts);
      const ok = results.filter((result) => result.status === 200);
      const limited = results.filter((result) => result.status === 409 && result.json.code === "staff_limit");
      assert.equal(ok.length, remaining);
      assert.ok(limited.length >= 1);
      const after = await request("GET", "/api/staff/invites", { email: OWNER });
      assert.equal(after.json.seats.used, 5);
    });

    await test("15 owner loses Pro and inherited access disappears", async () => {
      const raw = JSON.parse(fs.readFileSync(STORE, "utf8"));
      raw.users[OWNER].plan = "Free";
      raw.users[OWNER].stripeSubscriptionStatus = "canceled";
      raw.users[OWNER].subscriptionStatus = "Canceled and Ended";
      fs.writeFileSync(STORE, JSON.stringify(raw, null, 2));
      const res = await request("GET", `/api/subscription-status?email=${encodeURIComponent(CODIRECTOR)}`);
      assert.equal(res.json.subscription.hasProAccess, false);
    });
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE); } catch {}
    if (process.exitCode) console.error(bootLog.slice(-3000));
  }

  if (!process.exitCode) console.log("\nAll staff entitlement inheritance tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
