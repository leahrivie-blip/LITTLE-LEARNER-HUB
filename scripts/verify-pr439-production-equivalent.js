#!/usr/bin/env node
/**
 * Production-equivalent verification for PR #439 (signup email race + Advisor live refresh).
 *
 * Spawns a local-json app server + fake Resend (no production writes).
 * Produces a JSON evidence report and exits non-zero on any failed check.
 *
 * Run: NODE_ENV=test node scripts/verify-pr439-production-equivalent.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { spawn, execSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const RESEND_PORT = 4500 + Math.floor(Math.random() * 80);
const STORE = path.join(os.tmpdir(), `llh-pr439-verify-${crypto.randomBytes(4).toString("hex")}.json`);
const ARTIFACT_DIR = process.env.PR439_EVIDENCE_DIR
  || (fs.existsSync("/opt/cursor/artifacts") ? "/opt/cursor/artifacts" : os.tmpdir());
const SUPPORT_TO = "leahrivie@gmail.com";
const ADMIN_EMAIL = "owner@example.com";
const ADMIN_PASSWORD = "test-password";
const ADMIN_ACCESS_CODE = "test-code";
const AUTH_USER = `daycare.auth.${Date.now()}@gmail.com`;

let APP_PORT = 4700 + Math.floor(Math.random() * 200);
let BASE = `http://127.0.0.1:${APP_PORT}`;

const evidence = {
  commitSha: "",
  branch: "",
  startedAt: new Date().toISOString(),
  finishedAt: "",
  environment: {
    databaseProvider: "local-json",
    resend: "fake-http",
    stripeWebhookSecret: "unset (signature verification bypassed in test)",
    supportEmailTo: SUPPORT_TO,
  },
  checks: [],
  summary: { passed: 0, failed: 0 },
  knownIssues: [],
  mergeRecommendation: "",
};

function record(id, title, ok, details = {}) {
  const row = { id, title, ok: Boolean(ok), details, at: new Date().toISOString() };
  evidence.checks.push(row);
  if (ok) {
    evidence.summary.passed += 1;
    console.log(`PASS  ${id}: ${title}`);
  } else {
    evidence.summary.failed += 1;
    console.error(`FAIL  ${id}: ${title}`);
    console.error(details.error || JSON.stringify(details, null, 2));
  }
  return ok;
}

function request(method, urlPath, { body = null, headers = {} } = {}) {
  const payload = body ? JSON.stringify(body) : null;
  const reqHeaders = { ...headers };
  if (payload) {
    reqHeaders["Content-Type"] = "application/json";
    reqHeaders["Content-Length"] = Buffer.byteLength(payload);
  }
  return new Promise((resolve, reject) => {
    const req = http.request(`${BASE}${urlPath}`, { method, headers: reqHeaders }, (res) => {
      let raw = "";
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        let json = {};
        try { json = raw ? JSON.parse(raw) : {}; } catch { json = { raw }; }
        resolve({ status: res.statusCode, json, raw, headers: res.headers });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForHealth() {
  for (let i = 0; i < 100; i += 1) {
    try {
      const res = await request("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("App server did not become healthy");
}

async function waitUntil(predicate, timeoutMs = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
}

async function startFakeResend(captured) {
  const idempotency = new Map();
  const server = http.createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/emails") {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      const body = JSON.parse(raw || "{}");
      const key = String(req.headers["idempotency-key"] || "").trim();
      if (key && idempotency.has(key)) {
        const prior = idempotency.get(key);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ id: prior.id, idempotentReplay: true }));
        return;
      }
      const id = `re_${crypto.randomBytes(6).toString("hex")}`;
      const row = { id, headers: { ...req.headers }, body, at: new Date().toISOString() };
      captured.push(row);
      if (key) idempotency.set(key, row);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ id }));
    });
  });
  await new Promise((resolve) => server.listen(RESEND_PORT, "127.0.0.1", resolve));
  return server;
}

function spawnApp() {
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(APP_PORT),
      HOST: "127.0.0.1",
      LLH_STORE_PATH: STORE,
      DATABASE_PROVIDER: "local-json",
      SITE_URL: BASE,
      ADMIN_EMAIL,
      ADMIN_PASSWORD,
      ADMIN_ACCESS_CODE,
      SUPPORT_EMAIL_TO: SUPPORT_TO,
      SUPPORT_EMAIL_FROM: "Little Learner Hub <support@littlelearnershubbyleah.com>",
      RESEND_API_KEY: "re_test_pr439",
      RESEND_API_BASE_URL: `http://127.0.0.1:${RESEND_PORT}`,
      EMAIL_AUTOMATIONS_ENABLED: "false",
      MONITOR_ALERTS_ENABLED: "false",
      MONITOR_CHECK_INTERVAL_MS: "600000",
      STRIPE_WEBHOOK_SECRET: "",
      STRIPE_SECRET_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function isAdminSignupEmail(item) {
  const subject = String(item.body?.subject || "");
  const text = `${item.body?.text || ""}\n${item.body?.html || ""}`;
  const to = JSON.stringify(item.body?.to || []);
  if (!to.includes(SUPPORT_TO)) return false;
  // Owner-notification shell subjects look like: "🎉 New Free Member • Name"
  return /new free member/i.test(subject)
    || /new account created/i.test(subject)
    || /admin_new_signup/i.test(text)
    || (/new member created a free account/i.test(text));
}

function isWelcomeEmail(item, email) {
  const to = item.body?.to || [];
  const subject = String(item.body?.subject || "");
  return to.map((t) => String(t).toLowerCase()).includes(String(email).toLowerCase())
    && /welcome to little learner hub/i.test(subject);
}

function isProWelcomeEmail(item, email) {
  const to = item.body?.to || [];
  const subject = String(item.body?.subject || "");
  return to.map((t) => String(t).toLowerCase()).includes(String(email).toLowerCase())
    && (/thank you for becoming a pro member/i.test(subject) || /welcome to your pro/i.test(subject));
}

function isAdminBillingEmail(item) {
  const subject = String(item.body?.subject || "");
  const text = `${item.body?.text || ""}\n${item.body?.html || ""}`;
  const to = JSON.stringify(item.body?.to || []);
  if (!to.includes(SUPPORT_TO)) return false;
  // Owner-notification shell: "💜 New Pro Member • Name"
  return /new pro member/i.test(subject)
    || /new pro monthly|new .*subscription/i.test(subject)
    || /admin_new_pro|successfully subscribed to Pro/i.test(text);
}

function countEmails(captured, predicate) {
  return captured.filter(predicate).length;
}

function extractResetToken(bodyHtml = "", textBody = "") {
  const source = `${bodyHtml}\n${textBody}`;
  return source.match(/resetToken=([A-Za-z0-9_\-]+)/)?.[1] || "";
}

function extractVerificationToken(bodyHtml = "", textBody = "") {
  const textMatch = String(textBody || "").match(/\/api\/auth\/verify-email\?token=([A-Za-z0-9_\-]+)/);
  if (textMatch?.[1]) return textMatch[1];
  const source = String(bodyHtml || "").replace(/&amp;/g, "&");
  return source.match(/\/api\/auth\/verify-email\?token=([A-Za-z0-9_\-]+)/)?.[1] || "";
}

async function adminLogin() {
  const login = await request("POST", "/api/admin/login", {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, code: ADMIN_ACCESS_CODE },
  });
  assert.equal(login.status, 200, JSON.stringify(login.json));
  return login.json.token || login.json.adminToken;
}

async function signupWithRace(email, { raceAnalyticsFirst = true, eventId = "" } = {}) {
  const profileBody = {
    email,
    firstName: "Test",
    lastName: "Provider",
    signup: true,
    lastLogin: true,
    metaEventId: `reg_${email.replace(/\W/g, "")}`,
  };
  const analyticsBody = {
    id: eventId || `evt_${crypto.randomBytes(8).toString("hex")}`,
    name: "account_signup_complete",
    user: email,
    detail: { email, firstName: "Test", lastName: "Provider", plan: "Free" },
    sessionId: `sess_${email}`,
  };
  if (raceAnalyticsFirst) {
    const analytics = await request("POST", "/api/analytics/event", { body: analyticsBody });
    assert.equal(analytics.status, 200, JSON.stringify(analytics.json));
    const profile = await request("POST", "/api/account/profile", { body: profileBody });
    assert.equal(profile.status, 200, JSON.stringify(profile.json));
    return { analytics, profile, eventId: analyticsBody.id };
  }
  const profile = await request("POST", "/api/account/profile", { body: profileBody });
  assert.equal(profile.status, 200, JSON.stringify(profile.json));
  const analytics = await request("POST", "/api/analytics/event", { body: analyticsBody });
  assert.equal(analytics.status, 200, JSON.stringify(analytics.json));
  return { analytics, profile, eventId: analyticsBody.id };
}

function readStore() {
  return JSON.parse(fs.readFileSync(STORE, "utf8"));
}

function parseAdvisorTodayMetrics(insights) {
  const lines = insights?.data?.summaryLines || [];
  const visitorsLine = lines.find((l) => /session visit/i.test(l)) || "";
  const signupsLine = lines.find((l) => /new signup/i.test(l)) || "";
  const visitors = Number((visitorsLine.match(/^(\d+)/) || [])[1] || NaN);
  const signups = Number((signupsLine.match(/^(\d+)/) || [])[1] || NaN);
  return { visitors, signups, lines };
}

async function main() {
  try {
    evidence.commitSha = execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim();
    evidence.branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: ROOT }).toString().trim();
  } catch {
    evidence.commitSha = "(unknown)";
    evidence.branch = "(unknown)";
  }

  fs.writeFileSync(STORE, JSON.stringify({
    users: {
      [AUTH_USER]: {
        email: AUTH_USER,
        plan: "Free",
        subscriptionStatus: "Free Plan",
        passwordHash: crypto.createHash("sha256").update("OldPassword-1!", "utf8").digest("hex"),
        serverPasswordAuth: true,
        emailVerified: false,
        signupAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    },
    analyticsEvents: [],
    siteContent: {},
    adminSessions: {},
    memberSessions: {},
  }, null, 2));

  const captured = [];
  const fakeResend = await startFakeResend(captured);
  const child = spawnApp();
  let childExited = false;
  let bootLog = "";
  child.on("exit", () => { childExited = true; });
  child.stdout.on("data", (d) => { bootLog += d.toString(); });
  child.stderr.on("data", (d) => { bootLog += d.toString(); });

  try {
    await waitForHealth();
    const token = await adminLogin();
    const auth = { Authorization: `Bearer ${token}` };

    // ── 1 + 2 + 7 + 8: ten raced signups, recipients, analytics uniqueness, retry idempotency ──
    // Use non-ephemeral provider-looking emails so Admin Analytics + Advisor KPIs both count them.
    const users = Array.from({ length: 10 }, (_, i) => `daycare.owner${i}.${Date.now()}@gmail.com`);
    const eventIds = [];
    try {
      for (const email of users) {
        const result = await signupWithRace(email, { raceAnalyticsFirst: true });
        eventIds.push(result.eventId);
      }
      const ready = await waitUntil(() => (
        countEmails(captured, isAdminSignupEmail) >= 10
        && users.every((email) => countEmails(captured, (item) => isWelcomeEmail(item, email)) >= 1)
      ), 15000);
      assert.ok(ready, `timeout waiting for 10+10 emails; admin=${countEmails(captured, isAdminSignupEmail)} total=${captured.length}`);

      const adminCount = countEmails(captured, isAdminSignupEmail);
      const welcomeCounts = users.map((email) => countEmails(captured, (item) => isWelcomeEmail(item, email)));
      assert.equal(adminCount, 10);
      assert.ok(welcomeCounts.every((n) => n === 1), `welcome counts=${JSON.stringify(welcomeCounts)}`);

      record("1-ten-signups", "10 new test signups → 10 admin + 10 welcome, no duplicates", true, {
        adminSignupEmails: adminCount,
        welcomeEmailsPerUser: welcomeCounts,
        users,
      });
    } catch (error) {
      record("1-ten-signups", "10 new test signups → 10 admin + 10 welcome, no duplicates", false, {
        error: String(error?.message || error),
        adminSignupEmails: countEmails(captured, isAdminSignupEmail),
        capturedSubjects: captured.map((c) => c.body?.subject),
      });
    }

    try {
      const adminMails = captured.filter(isAdminSignupEmail);
      assert.ok(adminMails.length >= 10, `expected >=10 admin signup emails, got ${adminMails.length}`);
      const badRecipients = adminMails.filter((item) => {
        const to = JSON.stringify(item.body?.to || []);
        return to !== JSON.stringify([SUPPORT_TO]) || to.includes("icloud.com");
      });
      assert.equal(badRecipients.length, 0, JSON.stringify(badRecipients.map((m) => m.body?.to)));
      record("2-admin-recipient", "All admin signup alerts go only to leahrivie@gmail.com", true, {
        supportEmailTo: SUPPORT_TO,
        sampleTo: adminMails.slice(0, 3).map((m) => m.body?.to),
        sampleSubjects: adminMails.slice(0, 3).map((m) => m.body?.subject),
        checked: adminMails.length,
      });
    } catch (error) {
      record("2-admin-recipient", "All admin signup alerts go only to leahrivie@gmail.com", false, {
        error: String(error?.message || error),
        subjects: captured.map((c) => ({ to: c.body?.to, subject: c.body?.subject })).slice(0, 12),
      });
    }

    // Seed today's website visits so Advisor/Analytics have matching traffic metrics.
    for (let i = 0; i < 5; i += 1) {
      const visit = await request("POST", "/api/analytics/event", {
        body: {
          id: `visit_${Date.now()}_${i}`,
          name: "website_visit",
          sessionId: `visit_sess_${i}`,
          visitorId: `visit_v_${i}`,
          path: "/",
        },
      });
      assert.equal(visit.status, 200, JSON.stringify(visit.json));
    }

    // ── 3: Advisor Today matches Admin Analytics Today ──
    try {
      const analyticsRes = await request("GET", "/api/admin/analytics", { headers: auth });
      assert.equal(analyticsRes.status, 200, JSON.stringify(analyticsRes.json).slice(0, 300));
      const advisorRes = await request("GET", `/api/admin/insights?hub=advisor&range=today&_=${Date.now()}`, {
        headers: { ...auth, "Cache-Control": "no-store" },
      });
      assert.equal(advisorRes.status, 200, JSON.stringify(advisorRes.json).slice(0, 300));

      const realtime = analyticsRes.json?.analytics?.marketing?.realtime
        || analyticsRes.json?.analytics?.realtime
        || analyticsRes.json?.marketing?.realtime
        || {};
      // Prefer nested marketing.realtime; fall back to totals.
      const analyticsVisits = Number(
        realtime.sessionVisitsToday
        ?? analyticsRes.json?.analytics?.totals?.sessionVisitsToday
        ?? analyticsRes.json?.analytics?.marketing?.realtime?.sessionVisitsToday
        ?? NaN,
      );
      const analyticsSignups = Number(
        realtime.signupsToday
        ?? analyticsRes.json?.analytics?.totals?.newSignupsToday
        ?? analyticsRes.json?.analytics?.marketing?.realtime?.signupsToday
        ?? NaN,
      );
      const advisorMetrics = parseAdvisorTodayMetrics(advisorRes.json.insights);

      // Deep-locate realtime if shape differs.
      const marketing = analyticsRes.json?.analytics?.marketing || analyticsRes.json?.marketing || {};
      const rt = marketing.realtime || {};
      const visitsA = Number.isFinite(analyticsVisits) ? analyticsVisits : Number(rt.sessionVisitsToday || 0);
      const signupsA = Number.isFinite(analyticsSignups) ? analyticsSignups : Number(rt.signupsToday || 0);

      assert.ok(Number.isFinite(advisorMetrics.visitors), "advisor visitors parse failed");
      assert.ok(Number.isFinite(advisorMetrics.signups), "advisor signups parse failed");
      assert.equal(advisorMetrics.visitors, visitsA, `visits advisor=${advisorMetrics.visitors} analytics=${visitsA}`);
      assert.equal(advisorMetrics.signups, signupsA, `signups advisor=${advisorMetrics.signups} analytics=${signupsA}`);

      record("3-advisor-analytics-parity", "AI Business Advisor Today matches Admin Analytics Today", true, {
        advisor: advisorMetrics,
        analytics: { sessionVisitsToday: visitsA, signupsToday: signupsA },
        advisorUpdatedAt: advisorRes.json.insights?.updatedAt,
      });
    } catch (error) {
      // Capture shapes for debugging
      let analyticsShape = {};
      let advisorShape = {};
      try {
        const a = await request("GET", "/api/admin/analytics", { headers: auth });
        analyticsShape = {
          keys: Object.keys(a.json || {}),
          analyticsKeys: Object.keys(a.json?.analytics || {}),
          marketingKeys: Object.keys(a.json?.analytics?.marketing || {}),
          realtime: a.json?.analytics?.marketing?.realtime || a.json?.marketing?.realtime || null,
          totals: a.json?.analytics?.totals || null,
        };
        const b = await request("GET", `/api/admin/insights?hub=advisor&range=today&_=${Date.now()}`, { headers: auth });
        advisorShape = {
          summaryLines: b.json?.insights?.data?.summaryLines || [],
          hub: b.json?.insights?.hub,
        };
      } catch { /* ignore */ }
      record("3-advisor-analytics-parity", "AI Business Advisor Today matches Admin Analytics Today", false, {
        error: String(error?.message || error),
        analyticsShape,
        advisorShape,
      });
    }

    // ── 4: Advisor updates after new signup without restart ──
    try {
      const beforeRes = await request("GET", `/api/admin/insights?hub=advisor&range=today&_=${Date.now()}`, {
        headers: { ...auth, "Cache-Control": "no-store" },
      });
      const before = parseAdvisorTodayMetrics(beforeRes.json.insights);
      const liveEmail = `daycare.live.${Date.now()}@gmail.com`;
      await signupWithRace(liveEmail, { raceAnalyticsFirst: false });
      const emailReady = await waitUntil(() => (
        countEmails(captured, (item) => isWelcomeEmail(item, liveEmail)) === 1
        && countEmails(captured, isAdminSignupEmail) >= 11
      ), 10000);
      assert.ok(emailReady, "live signup emails did not arrive");

      const afterRes = await request("GET", `/api/admin/insights?hub=advisor&range=today&_=${Date.now()}`, {
        headers: { ...auth, "Cache-Control": "no-store" },
      });
      const after = parseAdvisorTodayMetrics(afterRes.json.insights);
      assert.equal(after.signups, before.signups + 1, `expected signups ${before.signups + 1}, got ${after.signups}`);
      assert.notEqual(childExited, true, "server exited unexpectedly");

      record("4-advisor-live-update", "Business Advisor updates after signup without server restart", true, {
        beforeSignups: before.signups,
        afterSignups: after.signups,
        liveEmail,
        serverStillRunning: !childExited,
        pid: child.pid,
      });
    } catch (error) {
      record("4-advisor-live-update", "Business Advisor updates after signup without server restart", false, {
        error: String(error?.message || error),
        serverStillRunning: !childExited,
      });
    }

    // ── 5: Stripe paid upgrade → Pro thank-you + admin billing alert ──
    try {
      const paidEmail = `daycare.paid.${Date.now()}@gmail.com`;
      const profile = await request("POST", "/api/account/profile", {
        body: {
          email: paidEmail,
          firstName: "Paid",
          lastName: "Upgrade",
          signup: true,
          lastLogin: true,
        },
      });
      assert.equal(profile.status, 200, JSON.stringify(profile.json));
      await waitUntil(() => countEmails(captured, (item) => isWelcomeEmail(item, paidEmail)) === 1, 8000);

      const adminBefore = countEmails(captured, isAdminBillingEmail);
      const proBefore = countEmails(captured, (item) => isProWelcomeEmail(item, paidEmail));
      const sessionId = `cs_test_${crypto.randomBytes(6).toString("hex")}`;
      const subId = `sub_test_${crypto.randomBytes(6).toString("hex")}`;
      const webhook = await request("POST", "/api/stripe/webhook", {
        body: {
          id: `evt_test_${crypto.randomBytes(6).toString("hex")}`,
          type: "checkout.session.completed",
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: sessionId,
              object: "checkout.session",
              customer: `cus_test_${crypto.randomBytes(4).toString("hex")}`,
              subscription: subId,
              customer_email: paidEmail,
              metadata: {
                email: paidEmail,
                plan: "monthly",
                promoTrialDays: "0",
              },
              success_url: `${BASE}/?checkout=success`,
            },
          },
        },
      });
      assert.equal(webhook.status, 200, JSON.stringify(webhook.json));

      const paidReady = await waitUntil(() => (
        countEmails(captured, (item) => isProWelcomeEmail(item, paidEmail)) >= proBefore + 1
        && countEmails(captured, isAdminBillingEmail) >= adminBefore + 1
      ), 12000);
      assert.ok(paidReady, `pro/billing emails missing; pro=${countEmails(captured, (i) => isProWelcomeEmail(i, paidEmail))} billing=${countEmails(captured, isAdminBillingEmail)}`);

      const billingMails = captured.filter(isAdminBillingEmail);
      assert.ok(billingMails.every((m) => JSON.stringify(m.body?.to) === JSON.stringify([SUPPORT_TO])));

      const storeUser = readStore().users?.[paidEmail];
      assert.ok(["Pro", "Founding"].includes(storeUser?.plan) || storeUser?.stripeSubscriptionId, "paid plan not applied");

      record("5-stripe-paid-emails", "Stripe paid upgrade sends Pro thank-you + admin billing alert", true, {
        paidEmail,
        proWelcomeCount: countEmails(captured, (item) => isProWelcomeEmail(item, paidEmail)),
        adminBillingCount: countEmails(captured, isAdminBillingEmail) - adminBefore,
        billingRecipients: billingMails.slice(-2).map((m) => m.body?.to),
        plan: storeUser?.plan,
        subscriptionStatus: storeUser?.subscriptionStatus,
      });
    } catch (error) {
      record("5-stripe-paid-emails", "Stripe paid upgrade sends Pro thank-you + admin billing alert", false, {
        error: String(error?.message || error),
        recentSubjects: captured.slice(-8).map((c) => ({ to: c.body?.to, subject: c.body?.subject })),
      });
    }

    // ── 6: Password reset + email verification ──
    try {
      const resetReq = await request("POST", "/api/auth/request-password-reset", {
        body: { email: AUTH_USER },
      });
      assert.equal(resetReq.status, 200, JSON.stringify(resetReq.json));
      assert.equal(resetReq.json.delivery, "sent");
      const resetMail = [...captured].reverse().find((item) => String(item.body?.subject || "").includes("Reset your Little Learner Hub password"));
      assert.ok(resetMail, "password reset email missing");
      assert.deepEqual(resetMail.body.to, [AUTH_USER]);
      const resetToken = extractResetToken(resetMail.body.html, resetMail.body.text);
      assert.ok(resetToken, "reset token missing");

      const verifyTokenRes = await request("GET", `/api/auth/password-reset/verify?token=${encodeURIComponent(resetToken)}`);
      assert.equal(verifyTokenRes.status, 200, JSON.stringify(verifyTokenRes.json));

      const complete = await request("POST", "/api/auth/password-reset/complete", {
        body: {
          token: resetToken,
          newPassword: "BrandNewPassword-2!",
          confirmPassword: "BrandNewPassword-2!",
        },
      });
      assert.equal(complete.status, 200, JSON.stringify(complete.json));

      const loginOk = await request("POST", "/api/auth/password-login", {
        body: { email: AUTH_USER, password: "BrandNewPassword-2!" },
      });
      assert.equal(loginOk.status, 200, JSON.stringify(loginOk.json));

      const verifyReq = await request("POST", "/api/auth/send-verification-email", {
        body: { email: AUTH_USER },
      });
      assert.equal(verifyReq.status, 200, JSON.stringify(verifyReq.json));
      assert.equal(verifyReq.json.delivery, "sent");
      const verifyMail = await waitUntil(async () => (
        captured.some((item) => String(item.body?.subject || "").includes("Verify your Little Learner Hub email"))
      ), 5000);
      assert.ok(verifyMail, "verification email missing");
      const vMail = [...captured].reverse().find((item) => String(item.body?.subject || "").includes("Verify your Little Learner Hub email"));
      const vToken = extractVerificationToken(vMail.body.html, vMail.body.text);
      assert.ok(vToken, "verification token missing");
      const verifyRes = await request("GET", `/api/auth/verify-email?token=${encodeURIComponent(vToken)}`);
      assert.equal(verifyRes.status, 302);
      assert.match(String(verifyRes.headers.location || ""), /emailVerification=success/);
      assert.equal(readStore().users?.[AUTH_USER]?.emailVerified, true);

      record("6-password-reset-and-verify", "Password reset and email verification still work", true, {
        authUser: AUTH_USER,
        resetDelivery: resetReq.json.delivery,
        verifyDelivery: verifyReq.json.delivery,
        emailVerified: true,
        loginAfterReset: loginOk.status,
      });
    } catch (error) {
      record("6-password-reset-and-verify", "Password reset and email verification still work", false, {
        error: String(error?.message || error),
      });
    }

    // ── 7: No duplicate analytics events from idempotent changes ──
    try {
      const store = readStore();
      const signupEvents = (store.analyticsEvents || []).filter((e) => e.name === "account_signup_complete");
      const byUser = {};
      for (const evt of signupEvents) {
        const who = String(evt.user || evt.detail?.email || "").toLowerCase();
        byUser[who] = (byUser[who] || 0) + 1;
      }
      const racedUsersOk = users.every((email) => byUser[email] === 1);
      assert.ok(racedUsersOk, `per-user counts=${JSON.stringify(byUser)}`);

      // Re-post an existing event id — must not create a second row.
      const firstId = eventIds[0];
      const dupPost = await request("POST", "/api/analytics/event", {
        body: {
          id: firstId,
          name: "account_signup_complete",
          user: users[0],
          detail: { email: users[0], firstName: "Test", lastName: "Provider", plan: "Free" },
          sessionId: `sess_dup_${users[0]}`,
        },
      });
      assert.equal(dupPost.status, 200, JSON.stringify(dupPost.json));
      await new Promise((r) => setTimeout(r, 200));
      const afterDup = (readStore().analyticsEvents || []).filter((e) => e.name === "account_signup_complete" && String(e.user || "").toLowerCase() === users[0]);
      assert.equal(afterDup.length, 1, `duplicate analytics rows for ${users[0]}: ${afterDup.length}`);

      record("7-no-duplicate-analytics", "No duplicate analytics events from idempotent changes", true, {
        racedUsersEventCounts: Object.fromEntries(users.map((e) => [e, byUser[e] || 0])),
        sameIdRepostStillOne: afterDup.length,
      });
    } catch (error) {
      record("7-no-duplicate-analytics", "No duplicate analytics events from idempotent changes", false, {
        error: String(error?.message || error),
      });
    }

    // ── 8: Retrying the same signup request cannot send duplicate emails ──
    try {
      const adminBefore = countEmails(captured, isAdminSignupEmail);
      const welcomeBefore = users.map((email) => countEmails(captured, (item) => isWelcomeEmail(item, email)));
      for (const email of users) {
        const retry = await request("POST", "/api/account/profile", {
          body: { email, firstName: "Test", signup: true, lastLogin: true },
        });
        assert.equal(retry.status, 200, JSON.stringify(retry.json));
      }
      await new Promise((r) => setTimeout(r, 1500));
      const adminAfter = countEmails(captured, isAdminSignupEmail);
      const welcomeAfter = users.map((email) => countEmails(captured, (item) => isWelcomeEmail(item, email)));
      assert.equal(adminAfter, adminBefore, `admin emails grew ${adminBefore} → ${adminAfter}`);
      assert.deepEqual(welcomeAfter, welcomeBefore, `welcome emails changed ${JSON.stringify(welcomeBefore)} → ${JSON.stringify(welcomeAfter)}`);

      record("8-signup-retry-idempotent", "Retrying the same signup request cannot send duplicate emails", true, {
        adminBefore,
        adminAfter,
        welcomeBeforeSum: welcomeBefore.reduce((a, b) => a + b, 0),
        welcomeAfterSum: welcomeAfter.reduce((a, b) => a + b, 0),
        retries: users.length,
      });
    } catch (error) {
      record("8-signup-retry-idempotent", "Retrying the same signup request cannot send duplicate emails", false, {
        error: String(error?.message || error),
      });
    }

    // Source/wiring smoke for live advisor path
    try {
      assert.match(bootLog, /Little Learner Hub launch server listening|storage ready/i);
      assert.match(fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8"), /loadInsightsAnalyticsEvents/);
      assert.match(fs.readFileSync(path.join(ROOT, "admin-insights.js"), "utf8"), /cache:\s*"no-store"/);
      record("9-wiring", "Advisor live-events + no-store refresh wiring present", true, {
        commitSha: evidence.commitSha,
      });
    } catch (error) {
      record("9-wiring", "Advisor live-events + no-store refresh wiring present", false, {
        error: String(error?.message || error),
      });
    }
  } finally {
    if (!childExited) {
      child.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 300));
      try { child.kill("SIGKILL"); } catch { /* ignore */ }
    }
    await new Promise((resolve) => fakeResend.close(resolve));
  }

  evidence.finishedAt = new Date().toISOString();
  const allPassed = evidence.summary.failed === 0;
  if (allPassed) {
    evidence.knownIssues = [
      "This harness uses DATABASE_PROVIDER=local-json + fake Resend (production-equivalent paths, not live Render/Postgres/Resend).",
      "Postgres high-volume analytics merge is covered by unit/API wiring (loadInsightsAnalyticsEvents) but not a live Postgres dual-write in this harness.",
      "Six historical missed signups from Aug 3 UTC were intentionally not auto-resent; resend remains an owner decision after merge/deploy.",
    ];
    evidence.mergeRecommendation = "SAFE TO MERGE from automated production-equivalent evidence on this branch. Deploy still required before production behavior changes; after deploy, hard-refresh Advisor and confirm Today matches Analytics with live traffic.";
  } else {
    evidence.knownIssues = [
      "One or more checklist items failed — do not merge until failures are fixed.",
      ...evidence.checks.filter((c) => !c.ok).map((c) => `${c.id}: ${c.details?.error || "failed"}`),
    ];
    evidence.mergeRecommendation = "DO NOT MERGE — failing checks remain.";
  }

  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const outPath = path.join(ARTIFACT_DIR, "pr439-production-equivalent-evidence.json");
  fs.writeFileSync(outPath, JSON.stringify(evidence, null, 2));
  const mdPath = path.join(ARTIFACT_DIR, "pr439-production-equivalent-evidence.md");
  const md = [
    `# PR #439 production-equivalent evidence`,
    ``,
    `- Commit: \`${evidence.commitSha}\``,
    `- Branch: \`${evidence.branch}\``,
    `- Started: ${evidence.startedAt}`,
    `- Finished: ${evidence.finishedAt}`,
    `- Passed: ${evidence.summary.passed} / Failed: ${evidence.summary.failed}`,
    ``,
    `## Checks`,
    ...evidence.checks.map((c) => `- ${c.ok ? "✅" : "❌"} **${c.id}** — ${c.title}`),
    ``,
    `## Merge recommendation`,
    evidence.mergeRecommendation,
    ``,
    `## Known issues / caveats`,
    ...evidence.knownIssues.map((i) => `- ${i}`),
    ``,
    `Full JSON: \`${outPath}\``,
  ].join("\n");
  fs.writeFileSync(mdPath, md);

  console.log("\n── Evidence written ──");
  console.log(outPath);
  console.log(mdPath);
  console.log(`\nResult: ${evidence.summary.passed} passed, ${evidence.summary.failed} failed`);
  console.log(evidence.mergeRecommendation);

  try { fs.unlinkSync(STORE); } catch { /* ignore */ }
  if (!allPassed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  evidence.finishedAt = new Date().toISOString();
  evidence.mergeRecommendation = "DO NOT MERGE — harness crashed.";
  try {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    fs.writeFileSync(path.join(ARTIFACT_DIR, "pr439-production-equivalent-evidence.json"), JSON.stringify({ ...evidence, crash: String(error?.stack || error) }, null, 2));
  } catch { /* ignore */ }
  process.exitCode = 1;
});
