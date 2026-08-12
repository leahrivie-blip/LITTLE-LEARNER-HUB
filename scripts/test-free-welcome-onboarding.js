#!/usr/bin/env node
/**
 * Free welcome onboarding system tests.
 * Run: NODE_ENV=test node scripts/test-free-welcome-onboarding.js
 */
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 4193;
const BASE = `http://127.0.0.1:${PORT}`;
const STORE = path.join(ROOT, "server", `.free-welcome-test-store-${process.pid}.json`);
const ADMIN_EMAIL = "admin@test.local";
const ADMIN_PASSWORD = "test-password";
const ADMIN_ACCESS_CODE = "test-code";

let adminToken = "";

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

function request(method, urlPath, { body = null, headers = {} } = {}) {
  const reqHeaders = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...headers,
  };
  return new Promise((resolve, reject) => {
    const req = http.request(`${BASE}${urlPath}`, { method, headers: reqHeaders }, (res) => {
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

function readStoreFile() {
  // Local-json may be mid-write during async welcome delivery — retry briefly.
  let lastError = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      return JSON.parse(fs.readFileSync(STORE, "utf8"));
    } catch (error) {
      lastError = error;
      const start = Date.now();
      while (Date.now() - start < 40) {
        /* spin briefly before re-read */
      }
    }
  }
  throw lastError;
}

async function adminLogin() {
  const res = await request("POST", "/api/admin/login", {
    body: {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      code: ADMIN_ACCESS_CODE,
    },
  });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  adminToken = res.json.token;
  assert.ok(adminToken);
}

async function main() {
  const moduleJs = fs.readFileSync(path.join(ROOT, "server", "onboarding-welcome.js"), "utf8");
  const serverJs = fs.readFileSync(path.join(ROOT, "server", "index.js"), "utf8");
  const commsJs = fs.readFileSync(path.join(ROOT, "comms-center.js"), "utf8");
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");

  await test("module exports createOnboardingWelcome", () => {
    assert.match(moduleJs, /createOnboardingWelcome/);
    assert.match(moduleJs, /Welcome to Little Learner Hub 💛 Here’s where to start/);
    assert.match(moduleJs, /You’re officially a Little Learner Hub member 💛/);
    assert.match(moduleJs, /Welcome to Your Pro Trial!/);
    assert.match(moduleJs, /How’s Your Trial Going\?|How.s Your Trial Going\?/);
    assert.match(moduleJs, /BACKFILL_CONFIRM_PHRASE/);
    assert.match(moduleJs, /AUTO_DELIVER_ELIGIBLE_AFTER/);
    assert.match(moduleJs, /Explore Lesson Plans/);
    assert.match(moduleJs, /\{\{PrimaryCta\}\}/);
  });

  await test("server wires signup + admin APIs", () => {
    assert.match(serverJs, /onboardingWelcome\.maybeDeliverOnSignup/);
    assert.match(serverJs, /maybeDeliverOnTrialStart/);
    assert.match(serverJs, /maybeDeliverOnProPurchase/);
    assert.match(serverJs, /startTrialCheckinScheduler/);
    assert.match(serverJs, /\/api\/admin\/onboarding-welcome/);
    assert.match(serverJs, /handleAdminOnboardingWelcomeBackfill/);
  });

  await test("admin UI tab exists", () => {
    assert.match(appJs, /welcome-messages/);
    assert.match(appJs, /renderAdminWelcomeMessages/);
    assert.match(commsJs, /renderAdminWelcomeMessages/);
  });

  const child = spawn("node", ["--max-old-space-size=300", "server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(PORT),
      LLH_STORE_PATH: STORE,
      ADMIN_EMAIL,
      ADMIN_PASSWORD,
      ADMIN_ACCESS_CODE,
      ADMIN_NAME: "Leah",
      SITE_URL: BASE,
      EMAIL_AUTOMATIONS_ENABLED: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));

  try {
    await waitForHealth();
    await adminLogin();

    await test("GET admin onboarding welcome config", async () => {
      const res = await request("GET", `/api/admin/onboarding-welcome?adminToken=${adminToken}`);
      assert.equal(res.status, 200);
      assert.equal(res.json.sequence?.inApp?.title, "Welcome to Little Learner Hub 💛 Here’s where to start");
      assert.match(res.json.sequence?.inApp?.body || "", /Start with the lesson plans/);
      assert.equal(res.json.sequences?.["trial-welcome"]?.inApp?.title, "Welcome to Your Pro Trial! 🎉");
      assert.equal(res.json.sequences?.["pro-welcome"]?.inApp?.title, "You’re officially a Little Learner Hub member 💛");
      assert.ok(Array.isArray(res.json.variables));
    });

    await test("preview substitutes first name and founding section", async () => {
      const res = await request("POST", "/api/admin/onboarding-welcome/preview", {
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          channel: "both",
          firstName: "Jordan",
          sequence: {
            inApp: {
              title: "Welcome {{FirstName}}!",
              body: "Hi {{FirstName}}, plan: {{PlanName}}.\n\n{{FoundingSection}}",
            },
            email: {
              subject: "Welcome {{FirstName}}!",
              body: "Hi {{FirstName}}.",
            },
            foundingSection: {
              enabled: true,
              inAppText: "Founding offer for {{FirstName}}",
            },
          },
        },
      });
      assert.equal(res.status, 200);
      assert.match(res.json.previews.inApp.body, /Hi Jordan/);
      // Founding acquisition is closed — FoundingSection stays empty even if template enables it.
      assert.doesNotMatch(res.json.previews.inApp.body, /Founding offer for Jordan/);
      assert.doesNotMatch(res.json.previews.inApp.body, /Founding Member/);
      assert.match(res.json.previews.email.subject, /Welcome Jordan/);
    });

    const freeEmail = `free-welcome-${Date.now()}@example.com`;
    const proEmail = `pro-welcome-${Date.now()}@example.com`;

    await test("free signup triggers welcome once", async () => {
      const signup = await request("POST", "/api/account/profile", {
        body: {
          email: freeEmail,
          firstName: "Sam",
          lastName: "Provider",
          signup: true,
        },
      });
      assert.equal(signup.status, 200);

      let store = null;
      let user = null;
      for (let i = 0; i < 20; i += 1) {
        store = readStoreFile();
        user = store.users[freeEmail];
        if (user?.onboardingWelcome?.freeWelcomeSentAt) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      assert.ok(user?.onboardingWelcome?.freeWelcomeSentAt, "welcome stamp missing");
      const welcomeMessage = (store.messages || []).find(
        (m) => m.toEmail === freeEmail && m.channel === "onboarding_welcome",
      );
      assert.ok(welcomeMessage, "in-app welcome message missing");
      assert.match(welcomeMessage.body, /Start with the lesson plans|Welcome to Little Learner Hub! 💛/);
      assert.equal(welcomeMessage.onboardingSequenceId || "free-welcome", "free-welcome");

      const duplicate = await request("POST", "/api/account/profile", {
        body: { email: freeEmail, firstName: "Sam", signup: true },
      });
      assert.equal(duplicate.status, 200);
      const store2 = readStoreFile();
      const messages = (store2.messages || []).filter(
        (m) => m.toEmail === freeEmail && m.channel === "onboarding_welcome",
      );
      assert.equal(messages.length, 1, "welcome should only send once");
    });

    await test("pro signup skips free welcome", async () => {
      let store = readStoreFile();
      store.users = store.users || {};
      store.users[proEmail] = {
        email: proEmail,
        firstName: "Pro",
        plan: "Pro",
        subscriptionStatus: "Active",
        stripeSubscriptionStatus: "active",
      };
      fs.writeFileSync(STORE, JSON.stringify(store));

      const signup = await request("POST", "/api/account/profile", {
        body: {
          email: proEmail,
          firstName: "Pro",
          signup: true,
        },
      });
      assert.equal(signup.status, 200);
      store = readStoreFile();
      assert.equal(store.users[proEmail]?.onboardingWelcome?.freeWelcomeSentAt || "", "");
      const welcomeMessage = (store.messages || []).find(
        (m) => m.toEmail === proEmail && m.channel === "onboarding_welcome",
      );
      assert.equal(welcomeMessage, undefined);
    });

    await test("backfill dry-run then send to recent free signups", async () => {
      // Seed Free accounts through the live API (no signup:true) so auto-welcome does not fire.
      const seeded = [];
      for (let i = 0; i < 5; i += 1) {
        const email = `backfill-free-${Date.now()}-${i}@example.com`;
        seeded.push(email);
        const created = await request("POST", "/api/account/profile", {
          body: {
            email,
            firstName: `User${i}`,
            lastName: "Provider",
          },
        });
        assert.equal(created.status, 200, JSON.stringify(created.json));
      }

      const dryRun = await request("POST", "/api/admin/onboarding-welcome/backfill", {
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { count: 5 },
      });
      assert.equal(dryRun.status, 200);
      assert.equal(dryRun.json.dryRun, true);
      assert.ok(dryRun.json.confirmPhrase);
      assert.ok(dryRun.json.count >= 5, `expected at least 5 pending, got ${dryRun.json.count}`);

      const send = await request("POST", "/api/admin/onboarding-welcome/backfill", {
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          count: 5,
          confirmPhrase: dryRun.json.confirmPhrase,
        },
      });
      assert.equal(send.status, 200);
      assert.equal(send.json.count, 5);

      await new Promise((r) => setTimeout(r, 200));
      const store = readStoreFile();
      const stamped = seeded.filter((email) => store.users[email]?.onboardingWelcome?.freeWelcomeSentAt);
      assert.equal(stamped.length, 5, `expected all seeded accounts stamped, got ${stamped.length}`);
    });

    await test("founding section hidden when sold out in preview", async () => {
      let store = readStoreFile();
      store.foundingMembers = Array.from({ length: 50 }, (_, i) => `founding-${i}@example.com`);
      fs.writeFileSync(STORE, JSON.stringify(store));

      const res = await request("POST", "/api/admin/onboarding-welcome/preview", {
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          channel: "in_app",
          firstName: "Alex",
          sequence: {
            inApp: {
              title: "Welcome",
              body: "Before\n\n{{FoundingSection}}\n\nAfter",
            },
            foundingSection: {
              enabled: true,
              inAppText: "FOUNDING OFFER",
            },
          },
        },
      });
      assert.equal(res.status, 200);
      assert.equal(res.json.foundingOpen, false);
      assert.doesNotMatch(res.json.previews.inApp.body, /FOUNDING OFFER/);
    });

    await test("admin can save welcome config", async () => {
      const res = await request("POST", "/api/admin/onboarding-welcome", {
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          sequence: {
            inApp: {
              enabled: true,
              title: "Custom welcome title",
              body: "Custom body for {{FirstName}}",
            },
            email: {
              enabled: false,
              subject: "Custom email",
              body: "Email body",
            },
          },
        },
      });
      assert.equal(res.status, 200);
      assert.equal(res.json.sequence.inApp.title, "Custom welcome title");
      assert.equal(res.json.sequence.email.enabled, false);
    });
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE); } catch {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
