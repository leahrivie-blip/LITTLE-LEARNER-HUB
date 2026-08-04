#!/usr/bin/env node
/**
 * Phase 3 — Permissions & privacy channel separation.
 * - Member notification APIs never return admin_* (including configured owner emails)
 * - Billing cancel/portal require matching signed-in identity
 * - Profile sync cannot escalate role on established accounts
 * - Staff invite management is owner/director only
 * - Client isolates Admin unlock from non-owner member sessions
 *
 * Run: npm run test:permissions-privacy-phase3
 * Never touches production curriculum.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 19810 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-perms-phase3-${crypto.randomBytes(4).toString("hex")}.json`);
const ARTIFACT_DIR = "/opt/cursor/artifacts/site-stabilization/phase3";
const PRIMARY_ADMIN = "owner-primary@phase3.test";
const FREE_USER = "provider-free@phase3.test";
const TEACHER_USER = "teacher@phase3.test";
const PRO_USER = "pro@phase3.test";
const ADMIN_PASSWORD = "phase3-pass";
const ADMIN_CODE = "phase3-code";

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

function memberHeaders(email) {
  return {
    Authorization: `Bearer test:${email}`,
    "X-LLH-User-Email": email,
  };
}

function startServer() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {
      [FREE_USER]: {
        email: FREE_USER,
        plan: "Free",
        subscriptionStatus: "Free Plan",
        role: "owner",
        accountType: "home_daycare",
        signupAt: "2026-01-01T00:00:00.000Z",
      },
      [TEACHER_USER]: {
        email: TEACHER_USER,
        plan: "Pro",
        subscriptionStatus: "active",
        role: "teacher",
        accountType: "center",
        linkedProgramOwnerEmail: FREE_USER,
        signupAt: "2026-01-01T00:00:00.000Z",
      },
      [PRO_USER]: {
        email: PRO_USER,
        plan: "Pro",
        subscriptionStatus: "Pro Monthly Subscription Active",
        stripeSubscriptionStatus: "active",
        stripeCustomerId: "cus_phase3_pro",
        stripeSubscriptionId: "sub_phase3_pro",
        role: "owner",
        accountType: "home_daycare",
        accessEndsAt: new Date(Date.now() + 20 * 86400000).toISOString(),
        currentPeriodEnd: new Date(Date.now() + 20 * 86400000).toISOString(),
        signupAt: "2026-01-01T00:00:00.000Z",
      },
      [PRIMARY_ADMIN]: {
        email: PRIMARY_ADMIN,
        plan: "Pro",
        subscriptionStatus: "active",
        role: "owner",
        accountType: "home_daycare",
        signupAt: "2026-01-01T00:00:00.000Z",
      },
    },
    messages: [],
    notifications: [
      {
        id: "n-admin-1",
        email: PRIMARY_ADMIN,
        type: "admin_signup",
        title: "New signup",
        body: "A provider signed up",
        read: false,
        createdAt: new Date().toISOString(),
      },
      {
        id: "n-member-1",
        email: PRIMARY_ADMIN,
        type: "message",
        title: "Parent reply",
        body: "Thanks!",
        read: false,
        createdAt: new Date().toISOString(),
      },
      {
        id: "n-free-1",
        email: FREE_USER,
        type: "announcement",
        title: "Welcome",
        body: "Hello provider",
        read: false,
        createdAt: new Date().toISOString(),
      },
    ],
    siteContent: {},
    adminSessions: {},
    programMembers: {},
    staffInvites: {},
  }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: PRIMARY_ADMIN,
      ADMIN_PASSWORD,
      ADMIN_ACCESS_CODE: ADMIN_CODE,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 100; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const res = await request("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
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
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  const ownershipJs = fs.readFileSync(path.join(ROOT, "server/program-ownership.js"), "utf8");
  assert.match(serverJs, /Provider\/member channel never includes admin_\*/, "member list must document channel split");
  assert.match(serverJs, /requireMatchingBillingIdentity/, "billing mutations require matched identity");
  assert.match(serverJs, /never allow privilege escalation/i, "profile sync must block role escalation");
  assert.match(serverJs, /return role === "owner" \|\| role === "director";/, "staff invite manager check tightened");
  assert.doesNotMatch(
    ownershipJs,
    /canManageStaff = role === "owner" \|\| role === "director" \|\| !user\.role/,
    "program ownership must not treat missing role as manager beyond defaults",
  );
  assert.match(appJs, /enforceAdminSessionIsolationForMember/, "client must isolate admin session on member login");
  assert.match(appJs, /currentUser && !isSignedInPlatformOwner\(\)\) return false/, "non-owner signed-in users hide Admin nav");
  assert.match(
    appJs,
    /rawItems\.filter\(\(item\) => !isAdminOnlyBellNotification\(item\?\.type\)\)/,
    "member bell always filters admin-only types",
  );
  console.log("PASS static channel / permission contract checks");
}

async function main() {
  staticChecks();
  const child = startServer();
  const results = [];
  try {
    await waitForBoot(child);

    // 1) Member API never returns admin_* — including for configured admin email.
    const ownerMemberBell = await request("GET", "/api/notifications?limit=50", {
      headers: memberHeaders(PRIMARY_ADMIN),
    });
    assert.equal(ownerMemberBell.status, 200, ownerMemberBell.text);
    const ownerTypes = (ownerMemberBell.json.notifications || []).map((n) => n.type);
    assert.ok(ownerTypes.includes("message"), "owner still receives member-channel alerts");
    assert.ok(!ownerTypes.some((t) => String(t).startsWith("admin_")), "owner member bell must exclude admin_*");
    results.push("owner_member_bell_excludes_admin");

    const freeBell = await request("GET", "/api/notifications?limit=50", {
      headers: memberHeaders(FREE_USER),
    });
    assert.equal(freeBell.status, 200);
    assert.ok(!(freeBell.json.notifications || []).some((n) => String(n.type || "").startsWith("admin_")));
    results.push("free_member_bell_excludes_admin");

    // 2) Admin Center still surfaces admin_* alerts.
    const login = await request("POST", "/api/admin/login", {
      body: { email: PRIMARY_ADMIN, password: ADMIN_PASSWORD, code: ADMIN_CODE },
    });
    assert.equal(login.status, 200, login.text);
    const token = login.json.token;
    const adminNotifs = await request("GET", `/api/admin/notifications?adminToken=${encodeURIComponent(token)}&limit=50`);
    assert.equal(adminNotifs.status, 200, adminNotifs.text);
    assert.ok(
      (adminNotifs.json.notifications || []).some((n) => String(n.type || "").startsWith("admin_")),
      "Admin Center must still show admin_* alerts",
    );
    results.push("admin_center_keeps_admin_alerts");

    // 3) Mark-all-read on member channel must not clear admin_* rows.
    const markAll = await request("POST", "/api/notifications/mark-all-read", {
      headers: memberHeaders(PRIMARY_ADMIN),
      body: {},
    });
    assert.equal(markAll.status, 200, markAll.text);
    const storeAfterMark = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    const adminRow = (storeAfterMark.notifications || []).find((n) => n.id === "n-admin-1");
    assert.equal(adminRow?.read, false, "member mark-all-read must not clear admin_*");
    results.push("member_mark_all_skips_admin");

    // 4) Billing cancel requires matching session.
    const cancelNoAuth = await request("POST", "/api/cancel-subscription", {
      body: { email: PRO_USER },
    });
    assert.equal(cancelNoAuth.status, 401, "cancel without auth rejected");
    const cancelWrong = await request("POST", "/api/cancel-subscription", {
      body: { email: PRO_USER },
      headers: memberHeaders(FREE_USER),
    });
    assert.equal(cancelWrong.status, 403, "cancel for another account rejected");
    const cancelOk = await request("POST", "/api/cancel-subscription", {
      body: { email: PRO_USER },
      headers: memberHeaders(PRO_USER),
    });
    assert.equal(cancelOk.status, 200, cancelOk.text);
    assert.equal(cancelOk.json?.subscription?.cancelAtPeriodEnd, true);
    results.push("billing_cancel_requires_matched_session");

    // 5) Portal requires matching session before Stripe readiness is checked.
    const portalNoAuth = await request("POST", "/api/create-customer-portal-session", {
      body: { email: PRO_USER },
    });
    assert.equal(portalNoAuth.status, 401, `portal no-auth got ${portalNoAuth.status}`);
    const portalWrong = await request("POST", "/api/create-customer-portal-session", {
      body: { email: PRO_USER },
      headers: memberHeaders(FREE_USER),
    });
    assert.equal(portalWrong.status, 403, `portal wrong-user got ${portalWrong.status}`);
    results.push("billing_portal_requires_matched_session");

    // 6) Profile sync cannot escalate teacher → owner.
    const escalate = await request("POST", "/api/account/profile", {
      body: {
        email: TEACHER_USER,
        firstName: "Teach",
        lastName: "Er",
        role: "owner",
        lastLogin: true,
      },
      headers: memberHeaders(TEACHER_USER),
    });
    assert.equal(escalate.status, 200, escalate.text);
    const storeAfterRole = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    assert.equal(storeAfterRole.users[TEACHER_USER].role, "teacher", "teacher must not self-promote to owner");
    results.push("profile_sync_blocks_role_escalation");

    // 7) Teacher cannot manage staff invites.
    const staffList = await request("GET", "/api/staff/invites", {
      headers: memberHeaders(TEACHER_USER),
    });
    assert.equal(staffList.status, 403, `teacher staff invites got ${staffList.status}: ${staffList.text}`);
    results.push("teacher_cannot_manage_staff_invites");

    const report = {
      suite: "permissions-privacy-phase3",
      passed: results.length,
      results,
      curriculumUntouched: true,
      generatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(ARTIFACT_DIR, "phase3-report.json"), JSON.stringify(report, null, 2));
    console.log(`PASS ${results.length} permission/privacy assertions`);
    results.forEach((name) => console.log(`  ✓ ${name}`));
    console.log("\nAll Phase 3 permissions & privacy checks passed.");
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("FAIL:", error.message || error);
  process.exitCode = 1;
});
