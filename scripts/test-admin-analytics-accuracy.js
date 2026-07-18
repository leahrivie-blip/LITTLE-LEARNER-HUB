#!/usr/bin/env node
/**
 * Admin analytics accuracy: visitors, signups, active users, feature wiring.
 * Run: node scripts/test-admin-analytics-accuracy.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");
const http = require("node:http");
const crypto = require("node:crypto");

function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      return result.then(() => console.log(`PASS  ${name}`)).catch((error) => {
        console.error(`FAIL  ${name}`);
        console.error(error);
        process.exitCode = 1;
      });
    }
    console.log(`PASS  ${name}`);
    return Promise.resolve();
  } catch (error) {
    console.error(`FAIL  ${name}`);
    console.error(error);
    process.exitCode = 1;
    return Promise.resolve();
  }
}

const root = path.join(__dirname, "..");
const serverJs = fs.readFileSync(path.join(root, "server/index.js"), "utf8");
const appJs = fs.readFileSync(path.join(root, "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");

async function run() {
  await test("analytics separates unique viewers, session visits, and page views", () => {
    assert.match(serverJs, /sessionVisits = events\.filter\(\(event\) => event\.name === "website_visit"\)/);
    assert.match(serverJs, /pageViewCount: pageViews\.length/);
    assert.match(serverJs, /uniqueVisitors: uniqueVisitors\.size/);
    assert.doesNotMatch(serverJs, /visitors: visits\.length/);
  });

  await test("signups are event counts, not Math.max with registered users", () => {
    assert.match(serverJs, /signups: signups\.length/);
    assert.doesNotMatch(serverJs, /signups: Math\.max\(signups\.length, users\.length\)/);
    assert.doesNotMatch(serverJs, /visitorToSignupRate: rate\(Math\.max\(signups/);
  });

  await test("active users ignore updatedAt and use lastSeen/login only", () => {
    assert.match(serverJs, /const activityAt = \(user\) => user\.lastSeenAt \|\| user\.lastLoginAt \|\| ""/);
    assert.match(serverJs, /lastSeenAt: user\.lastSeenAt \|\| user\.lastLoginAt \|\| ""/);
    assert.doesNotMatch(
      serverJs.slice(serverJs.indexOf("const userRows = users"), serverJs.indexOf("return {\n    mode: \"Server historical analytics\"")),
      /lastSeenAt: user\.lastSeenAt \|\| user\.updatedAt/,
    );
  });

  await test("billing active aligns with billingStatusCounts.active", () => {
    assert.match(serverJs, /activeSubscriptions: billingStatusCounts\.active/);
  });

  await test("feature metrics recognize real calendar / lesson / doc events", () => {
    assert.match(serverJs, /schedule_assign_lesson/);
    assert.match(serverJs, /curriculum_planner_assign/);
    assert.match(serverJs, /isLessonResourceView/);
    assert.match(serverJs, /parent_message_generated/);
    assert.doesNotMatch(
      serverJs.slice(serverJs.indexOf("const parentMessagesGenerated"), serverJs.indexOf("const formsSubmitted")),
      /ai_generation_success/,
    );
  });

  await test("client stops double-counting home page_view on boot", () => {
    assert.match(appJs, /home boot does not double-count a page view/);
    assert.doesNotMatch(appJs, /if \(initialView === "home"\) trackEvent\("page_view"/);
  });

  await test("client emits calendar and documentation analytics aliases", () => {
    assert.match(appJs, /trackEvent\("lesson_plan_added_to_calendar"/);
    assert.match(appJs, /trackEvent\("lesson_plan_view"/);
    assert.match(appJs, /trackEvent\("observation_created"/);
    assert.match(appJs, /trackEvent\("parent_message_generated"/);
    assert.match(appJs, /trackEvent\("incident_report_created"/);
  });

  await test("owner dashboard shows Traffic section with viewers and signups", () => {
    assert.match(appJs, /adminOwnerTraffic/);
    assert.match(appJs, /Unique Viewers/);
    assert.match(appJs, /Signup Completions/);
    assert.match(appJs, /Who’s Active|Who.s Active/);
    assert.match(appJs, /Billing Active/);
  });

  await test("cache bust versions aligned for analytics accuracy", () => {
    assert.equal(indexHtml.match(/app\.js\?v=([^"]+)/)?.[1], "20260718-lesson-fullscreen");
    assert.equal(indexHtml.match(/styles\.css\?v=([^"]+)/)?.[1], "20260718-lesson-fullscreen");
    assert.match(sw, /llh-shell-v100-lesson-fullscreen/);
  });

  // Live formula smoke test against a temporary local store.
  const storePath = path.join(os.tmpdir(), `llh-analytics-accuracy-${crypto.randomBytes(4).toString("hex")}.json`);
  const port = 19600 + Math.floor(Math.random() * 80);
  const now = new Date().toISOString();
  const store = {
    users: {
      "active@example.com": {
        email: "active@example.com",
        firstName: "Active",
        lastName: "User",
        plan: "Pro",
        subscriptionStatus: "Pro Subscription Active",
        stripeSubscriptionStatus: "active",
        accountStatus: "Active",
        signupAt: now,
        createdAt: now,
        lastSeenAt: now,
        lastLoginAt: now,
      },
      "free@example.com": {
        email: "free@example.com",
        firstName: "Free",
        lastName: "User",
        plan: "Free",
        subscriptionStatus: "Free Plan",
        accountStatus: "Active",
        signupAt: now,
        createdAt: now,
        updatedAt: now,
      },
    },
    analyticsEvents: [
      { id: "1", name: "website_visit", createdAt: now, visitorId: "v1", sessionId: "s1" },
      { id: "2", name: "page_view", createdAt: now, visitorId: "v1", sessionId: "s1", detail: { view: "home" } },
      { id: "3", name: "page_view", createdAt: now, visitorId: "v1", sessionId: "s1", detail: { view: "lessons" } },
      { id: "4", name: "website_visit", createdAt: now, visitorId: "v2", sessionId: "s2" },
      { id: "5", name: "account_signup_complete", createdAt: now, user: "active@example.com", visitorId: "v1" },
      { id: "6", name: "schedule_assign_lesson", createdAt: now, user: "active@example.com", detail: { lessonPlanId: "lp1" } },
      { id: "7", name: "resource_view", createdAt: now, user: "active@example.com", detail: { category: "Lesson Plans", title: "Ocean" } },
      { id: "8", name: "ai_generation_success", createdAt: now, user: "active@example.com", detail: { tool: "lesson" } },
      { id: "9", name: "parent_message_generated", createdAt: now, user: "active@example.com" },
    ],
    adminSessions: {
      admin_test_token: { email: "owner@example.com", createdAt: now },
    },
    billingEvents: [],
    feedbackItems: [],
    supportTickets: [],
  };
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      SITE_URL: `http://127.0.0.1:${port}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: storePath,
      NODE_ENV: "test",
      ADMIN_EMAIL: "owner@example.com",
      ADMIN_PASSWORD: "test-password",
      ADMIN_ACCESS_CODE: "test-code",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const requestJson = (method, urlPath) => new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: urlPath,
      method,
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        try {
          resolve({ status: res.statusCode, json: JSON.parse(text || "{}") });
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("error", reject);
    req.end();
  });

  try {
    for (let i = 0; i < 60; i += 1) {
      if (child.exitCode !== null) throw new Error("Server exited early");
      try {
        const health = await requestJson("GET", "/api/health");
        if (health.status === 200) break;
      } catch {
        // wait
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await test("live analytics formulas: viewers / signups / active / features", async () => {
      // Inject a temporary admin session through the store file path already loaded —
      // token was planted in store before boot.
      const res = await requestJson("GET", "/api/admin/analytics?adminToken=admin_test_token");
      assert.equal(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(res.json)}`);
      const totals = res.json.analytics?.totals || res.json.totals || {};
      assert.equal(totals.uniqueVisitors, 2, `uniqueVisitors=${totals.uniqueVisitors}`);
      assert.equal(totals.sessionVisits || totals.visitors, 2, `sessionVisits=${totals.sessionVisits || totals.visitors}`);
      assert.equal(totals.pageViewCount, 2, `pageViewCount=${totals.pageViewCount}`);
      assert.equal(totals.signups, 1, `signups=${totals.signups}`);
      assert.equal(totals.totalRegisteredUsers, 2, `registered=${totals.totalRegisteredUsers}`);
      assert.equal(totals.activeUsersToday, 1, `activeToday=${totals.activeUsersToday}`);
      assert.equal(totals.lessonPlansAddedToCalendar >= 1, true, "calendar assigns counted");
      assert.equal(totals.lessonPlansViewed >= 1, true, "lesson views counted");
      assert.equal(totals.parentMessagesGenerated, 1, "parent messages not inflated by AI lesson gens");
      const freeRow = (res.json.analytics?.users || res.json.users || []).find((u) => u.email === "free@example.com");
      assert.ok(freeRow, "free user row missing");
      assert.equal(freeRow.lastSeenAt || "", "", "free user with only updatedAt must not look active");
    });
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(storePath); } catch { /* ignore */ }
  }

  if (!process.exitCode) console.log("\nAll admin analytics accuracy tests passed.");
}

run();
