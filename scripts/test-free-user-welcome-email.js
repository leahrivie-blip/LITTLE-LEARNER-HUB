#!/usr/bin/env node
/**
 * Free User welcome/upgrade email safety + eligibility tests.
 * Run: NODE_ENV=test node scripts/test-free-user-welcome-email.js
 */
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const {
  createFreeUserWelcomeEmail,
  buildFreeUserRecipientDryRun,
  CONFIRM_PHRASE,
  EMAIL_SUBJECT,
} = require("../server/free-user-welcome-email.js");

const ROOT = path.join(__dirname, "..");
const PORT = 4193;
const BASE = `http://127.0.0.1:${PORT}`;
const STORE = path.join(ROOT, "server", `.free-welcome-test-store-${process.pid}.json`);
const ADMIN_EMAIL = "owner@example.com";
const ADMIN_PASSWORD = "test-admin-pass";
const ADMIN_ACCESS_CODE = "test-admin-code";

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

function request(method, urlPath, { body = null } = {}) {
  const headers = { Accept: "application/json", "Content-Type": "application/json" };
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

function sampleStore() {
  return {
    users: {
      "free.one@providermail.com": {
        email: "free.one@providermail.com",
        plan: "Free",
        foundingMemberActive: false,
        stripeSubscriptionStatus: "",
        subscriptionStatus: "Free Plan",
      },
      "free.two@providermail.com": {
        email: "free.two@providermail.com",
        plan: "Free",
        foundingMemberActive: false,
        stripeSubscriptionStatus: "canceled",
        subscriptionStatus: "Subscription Ended",
      },
      "active.founding@providermail.com": {
        email: "active.founding@providermail.com",
        plan: "Founding",
        foundingMemberActive: true,
        stripeSubscriptionStatus: "active",
        subscriptionStatus: "Founding Member Subscription Active",
      },
      "pro.user@providermail.com": {
        email: "pro.user@providermail.com",
        plan: "Pro",
        foundingMemberActive: false,
        stripeSubscriptionStatus: "active",
        subscriptionStatus: "Pro Monthly Subscription Active",
      },
      "trial.user@providermail.com": {
        email: "trial.user@providermail.com",
        plan: "Pro",
        foundingMemberActive: false,
        stripeSubscriptionStatus: "trialing",
        subscriptionStatus: "Pro Monthly Subscription Trialing",
        trialStatus: "In Trial",
        trialEnd: new Date(Date.now() + 86400000).toISOString(),
      },
      "test.user@example.com": {
        email: "test.user@example.com",
        plan: "Free",
        foundingMemberActive: false,
        subscriptionStatus: "Free Plan",
      },
      "owner@example.com": {
        email: "owner@example.com",
        plan: "Free",
        foundingMemberActive: false,
        subscriptionStatus: "Free Plan",
      },
      "bounced.user@providermail.com": {
        email: "bounced.user@providermail.com",
        plan: "Free",
        foundingMemberActive: false,
        subscriptionStatus: "Free Plan",
        emailBounced: true,
      },
      "dup@providermail.com": {
        email: "dup@providermail.com",
        plan: "Free",
        foundingMemberActive: false,
        subscriptionStatus: "Free Plan",
      },
      "dup@providermail.com#alt": {
        email: "dup@providermail.com",
        plan: "Free",
        foundingMemberActive: false,
        subscriptionStatus: "Free Plan",
      },
    },
    emailEngagement: { settings: {}, events: [] },
  };
}

async function main() {
  const moduleJs = fs.readFileSync(path.join(ROOT, "server", "free-user-welcome-email.js"), "utf8");
  const serverJs = fs.readFileSync(path.join(ROOT, "server", "index.js"), "utf8");
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");

  await test("module markers present", () => {
    assert.match(moduleJs, /SEND_FREE_USER_WELCOME_EMAIL/);
    assert.match(moduleJs, /notFoundingMember/);
    assert.match(moduleJs, /notProAccess/);
    assert.match(moduleJs, /notTrial/);
    assert.match(serverJs, /\/api\/admin\/free-user-welcome-email\/dry-run/);
    assert.match(serverJs, /\/api\/admin\/free-user-welcome-email\/send/);
    assert.match(appJs, /adminFreeWelcomeEmailDryRun/);
    assert.match(appJs, /SEND_FREE_USER_WELCOME_EMAIL/);
  });

  await test("eligibility is free-only", () => {
    const report = buildFreeUserRecipientDryRun(sampleStore(), { adminEmail: "leah.admin@providermail.com" });
    const emails = report.recipients.map((r) => r.email).sort();
    assert.deepEqual(emails, [
      "dup@providermail.com",
      "free.one@providermail.com",
      "free.two@providermail.com",
    ]);
    assert.ok(report.duplicatesRemoved.includes("dup@providermail.com"));
    assert.ok(report.excluded.some((r) => r.email === "active.founding@providermail.com" && r.excludeReasons.includes("founding_member")));
    assert.ok(report.excluded.some((r) => r.email === "pro.user@providermail.com" && r.excludeReasons.includes("has_pro_access")));
    assert.ok(report.excluded.some((r) => r.email === "trial.user@providermail.com" && r.excludeReasons.includes("in_trial")));
    assert.ok(report.excluded.some((r) => r.email === "test.user@example.com" && r.excludeReasons.includes("test_email")));
    assert.ok(report.excluded.some((r) => r.email === "bounced.user@providermail.com" && r.excludeReasons.includes("bounced_email")));
    assert.equal(report.email.subject, EMAIL_SUBJECT);
    assert.equal(report.willSend, false);
  });

  await test("admin always excluded", () => {
    const store = sampleStore();
    store.users["leah.admin@providermail.com"] = {
      email: "leah.admin@providermail.com",
      plan: "Free",
      foundingMemberActive: false,
      subscriptionStatus: "Free Plan",
    };
    const report = buildFreeUserRecipientDryRun(store, { adminEmail: "leah.admin@providermail.com" });
    assert.ok(!report.recipients.some((r) => r.email === "leah.admin@providermail.com"));
    assert.ok(report.excluded.some((r) => r.email === "leah.admin@providermail.com" && r.excludeReasons.includes("admin_account")));
  });

  let store = sampleStore();
  const sent = [];
  const api = createFreeUserWelcomeEmail({
    sendEmail: async ({ to }) => {
      const id = `re_${sent.length + 1}`;
      sent.push({ to, id });
      return { sent: true, configured: true, provider: "resend", messageId: id };
    },
    readStore: () => store,
    writeStore: (next) => { store = next; },
    getAdminEmail: () => "leah.admin@providermail.com",
    getSupportEmailStatus: () => ({ ready: true, provider: "resend", from: "Little Learner Hub <support@littlelearnershubbyleah.com>" }),
  });

  await test("send gated by phrase + tokens; one-time only", async () => {
    const dry = api.dryRun({ adminEmail: "leah.admin@providermail.com" });
    assert.equal(dry.counts.recipients, 3);
    assert.ok(dry.confirmationScreen);
    assert.equal(dry.willSend, false);

    const blocked = await api.send({
      confirm: true,
      confirmPhrase: "WRONG",
      dryRunToken: dry.dryRunToken,
      confirmationToken: dry.confirmationToken,
    });
    assert.equal(blocked.reason, "confirmation_required");

    const result = await api.send({
      confirm: true,
      confirmPhrase: CONFIRM_PHRASE,
      dryRunToken: dry.dryRunToken,
      confirmationToken: dry.confirmationToken,
      adminEmail: "leah.admin@providermail.com",
    });
    assert.equal(result.skipped, false);
    assert.equal(result.sent, 3);
    assert.equal(result.membershipRecordsModified, false);
    assert.equal(result.accountAccessModified, false);
    assert.ok(store.emailEngagement.settings.freeUserWelcome.sentAt);
    assert.equal(store.users["free.one@providermail.com"].plan, "Free");

    const again = await api.send({
      confirm: true,
      confirmPhrase: CONFIRM_PHRASE,
      dryRunToken: dry.dryRunToken,
      confirmationToken: dry.confirmationToken,
    });
    assert.equal(again.reason, "already_sent");
    assert.equal(sent.length, 3);
  });

  fs.writeFileSync(STORE, JSON.stringify({
    users: sampleStore().users,
    emailEngagement: { settings: {}, events: [] },
    siteContent: {},
  }));

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: "test",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE,
      ADMIN_EMAIL,
      ADMIN_PASSWORD,
      ADMIN_ACCESS_CODE,
      EMAIL_AUTOMATIONS_ENABLED: "false",
      RESEND_API_KEY: "",
      SUPPORT_EMAIL_FROM: "Little Learner Hub <support@littlelearnershubbyleah.com>",
      SUPPORT_EMAIL_TO: "owner@example.com",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForHealth();
    const login = await request("POST", "/api/admin/login", {
      body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, code: ADMIN_ACCESS_CODE },
    });
    assert.equal(login.status, 200);
    const adminToken = login.json.token;
    assert.ok(adminToken);

    await test("HTTP dry-run never sends", async () => {
      const res = await request("POST", "/api/admin/free-user-welcome-email/dry-run", {
        body: { adminToken },
      });
      assert.equal(res.status, 200);
      assert.equal(res.json.sent, false);
      assert.equal(res.json.willSend, false);
      assert.equal(res.json.automationsEnabled, false);
      assert.ok(res.json.preview?.dryRunToken);
      assert.ok(res.json.preview?.confirmationToken);
      assert.equal(res.json.preview.email.subject, EMAIL_SUBJECT);
      assert.equal(res.json.preview.counts.recipients, 3);
    });

    await test("HTTP send without phrase rejected", async () => {
      const dry = await request("POST", "/api/admin/free-user-welcome-email/dry-run", {
        body: { adminToken },
      });
      const res = await request("POST", "/api/admin/free-user-welcome-email/send", {
        body: {
          adminToken,
          confirm: true,
          confirmPhrase: "NOPE",
          dryRunToken: dry.json.preview?.dryRunToken,
          confirmationToken: dry.json.preview?.confirmationToken,
        },
      });
      assert.equal(res.status, 400);
      assert.equal(res.json.result?.reason, "confirmation_required");
    });
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE); } catch {}
  }

  if (process.exitCode) {
    console.error("Some free-user welcome email tests failed.");
    process.exit(process.exitCode);
  }
  console.log("All free-user welcome email tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
