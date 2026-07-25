#!/usr/bin/env node
/**
 * Regression: concurrent analytics writeStore must not wipe a curriculum writeStoreAsync.
 * Reproduces the production Postgres lost-update race with a delayed mock pg Pool.
 *
 * Run: node scripts/test-store-write-race.js
 */
const http = require("http");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const ROOT = path.join(__dirname, "..");
const PORT = 18770 + Math.floor(Math.random() * 20);
const ADMIN = {
  email: "race-test@example.com",
  password: "race-test-pass",
  code: "race-test-code",
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requestJson(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: payload
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
          : {},
        timeout: 30000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {
            json = null;
          }
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

function startServer() {
  const child = spawn(
    process.execPath,
    ["-r", path.join(__dirname, "mock-pg-preload.js"), "server/index.js"],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(PORT),
        SITE_URL: `http://127.0.0.1:${PORT}`,
        ADMIN_EMAIL: ADMIN.email,
        ADMIN_PASSWORD: ADMIN.password,
        ADMIN_ACCESS_CODE: ADMIN.code,
        ADMIN_NAME: "Race Test",
        DATABASE_PROVIDER: "postgres",
        // SITE_URL above is a non-production host (127.0.0.1), so the server resolves
        // its active Postgres connection string from TESTING_DATABASE_URL, never
        // PRODUCTION_DATABASE_URL (see server/index.js's activeDatabaseUrl()) — set
        // both so this regression test keeps exercising the real Postgres race path
        // regardless of which one the running code version reads.
        PRODUCTION_DATABASE_URL: "postgres://mock:mock@127.0.0.1:5432/mock",
        TESTING_DATABASE_URL: "postgres://mock:mock@127.0.0.1:5432/mock",
        NODE_ENV: "test",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (d) => {
    output += d;
  });
  child.stderr.on("data", (d) => {
    output += d;
  });
  child.__output = () => output;
  return child;
}

async function waitForBoot(child) {
  for (let i = 0; i < 100; i += 1) {
    if (child.__output().includes("running on")) return;
    if (child.exitCode !== null) throw new Error(`Server exited early: ${child.__output()}`);
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Server did not boot: ${child.__output().slice(-800)}`);
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 3000);
    child.on("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function main() {
  const child = startServer();
  try {
    await waitForBoot(child);
    const login = await requestJson("POST", "/api/admin/login", {
      email: ADMIN.email,
      password: ADMIN.password,
      code: ADMIN.code,
    });
    assert(login.status === 200, `Login failed: ${login.status} ${login.text}`);
    const token = login.json.token;

    const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    assert(bootstrap.status === 200, "Bootstrap failed");
    const touch = await requestJson("POST", "/api/admin/site-content", {
      adminToken: token,
      siteContent: {
        ...bootstrap.json.siteContent,
        updatedAt: bootstrap.json.siteContent.updatedAt || "",
      },
    });
    assert(touch.status === 200, `Touch failed: ${touch.status}`);
    const expectedUpdatedAt = touch.json.siteContent.updatedAt;

    const lessonPlan = {
      id: "cur-lp-race-tiny",
      title: "Race Tiny Lesson",
      age: "Infant",
      theme: "Test",
      plan: "Free",
      status: "draft",
      learningDomains: ["Cognitive"],
      weeklyOverview: "Tiny",
      objectives: "Persist",
      weeklyMaterials: "none",
      vocabularyWords: "test",
      observationOpportunities: "watch",
      adaptations: "n/a",
      familyConnection: "share",
      books: [],
      songs: [],
      dailyPlans: {
        monday: {
          items: [{
            itemId: "item-1",
            activityCategory: "Sensory Play",
            title: "One Activity",
            description: "d",
            materials: "m",
            steps: "1. do",
            learningGoals: ["g"],
          }],
        },
        tuesday: { items: [] },
        wednesday: { items: [] },
        thursday: { items: [] },
        friday: { items: [] },
      },
      resourceIds: [],
      activityIds: [],
    };

    console.log("1) Fire curriculum save + concurrent analytics events");
    const savePromise = requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken: token,
      expectedUpdatedAt,
      lessonPlan,
    });

    // Overlap analytics writes while the curriculum Postgres upsert is delayed.
    const analyticsPromises = [];
    for (let i = 0; i < 8; i += 1) {
      analyticsPromises.push(requestJson("POST", "/api/analytics/event", {
        name: "page_view",
        path: "/admin",
        sessionId: `race-session-${i}`,
        visitorId: `race-visitor-${i}`,
      }));
      await new Promise((r) => setTimeout(r, 5));
    }

    const [save, ...analytics] = await Promise.all([savePromise, ...analyticsPromises]);
    assert(save.status === 200, `Curriculum save failed: ${save.status} ${save.text}`);
    assert(save.json.lessonPlan?.id === "cur-lp-race-tiny", "Lesson id missing in save response");
    analytics.forEach((item, index) => {
      assert(item.status === 200, `Analytics ${index} failed: ${item.status}`);
    });

    // Let any trailing fire-and-forget writes settle.
    await new Promise((r) => setTimeout(r, 500));

    console.log("2) Reload admin content — curriculum must still be present");
    const reload = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    assert(reload.status === 200, `Reload failed: ${reload.status}`);
    const plans = reload.json.siteContent?.curriculum?.lessonPlans || [];
    const acts = (reload.json.siteContent?.curriculum?.activities || []).filter(
      (item) => item.lessonPlanId === "cur-lp-race-tiny" && item.status !== "archived",
    );
    assert(plans.some((item) => item.id === "cur-lp-race-tiny"), "Curriculum lesson was wiped by concurrent writeStore");
    assert(acts.length === 1, `Expected 1 activity after race, got ${acts.length}`);

    console.log("3) Admin session must still authorize analytics after concurrent writes");
    const sessionCheck = await requestJson("GET", `/api/admin/session?adminToken=${encodeURIComponent(token)}`);
    assert(sessionCheck.status === 200 && sessionCheck.json?.valid === true, `Admin session invalid after race: ${sessionCheck.status} ${sessionCheck.text}`);
    const analyticsAdmin = await requestJson("GET", `/api/admin/analytics?adminToken=${encodeURIComponent(token)}`);
    assert(analyticsAdmin.status === 200, `Admin analytics failed after race: ${analyticsAdmin.status} ${analyticsAdmin.text}`);

    console.log("\nStore write race checks passed.");
  } catch (error) {
    console.error("\nFAIL:", error.message);
    console.error(child.__output().slice(-1500));
    process.exitCode = 1;
  } finally {
    await stopServer(child);
  }
}

main();
