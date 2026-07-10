#!/usr/bin/env node
/**
 * Verify Tiny Save Test syncs exactly 1 curriculum activity, and that the
 * admin Curriculum Activities browser helpers are present in app.js.
 * Run: node scripts/test-curriculum-activities-browser.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 18790 + Math.floor(Math.random() * 20);
const ADMIN = {
  email: "curriculum-activities-browser@example.com",
  password: "curriculum-activities-browser-pass",
  code: "curriculum-activities-browser-code",
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
        timeout: 20000,
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
    if (payload) req.write(payload);
    req.end();
  });
}

function startServer() {
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      ADMIN_NAME: "Curriculum Activities Browser Test",
      DATABASE_PROVIDER: "local-json",
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
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
    if (child.exitCode !== null) throw new Error(`Server exited: ${child.__output()}`);
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Server did not boot");
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
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  console.log("1) Admin Curriculum Activities browser wiring present");
  assert(appJs.includes('curriculum-activities'), "Missing curriculum-activities tab id");
  assert(appJs.includes("Curriculum Activities (Beta)"), "Missing tab label");
  assert(appJs.includes("function renderAdminCurriculumActivityBrowser"), "Missing browser renderer");
  assert(appJs.includes("adminCurriculumActivityApp"), "Missing browser mount");
  assert(appJs.includes("data-curriculum-activity-view"), "Missing view action");
  assert(appJs.includes("data-curriculum-activity-open-lesson"), "Missing open-parent-lesson action");
  assert(!appJs.includes("createAdminCurriculumActivity"), "Must not add activity creation workflow");

  const child = startServer();
  try {
    await waitForBoot(child);
    const login = await requestJson("POST", "/api/admin/login", {
      email: ADMIN.email,
      password: ADMIN.password,
      code: ADMIN.code,
    });
    assert(login.status === 200, `Login failed: ${login.status}`);
    const token = login.json.token;
    const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    const touch = await requestJson("POST", "/api/admin/site-content", {
      adminToken: token,
      siteContent: {
        ...bootstrap.json.siteContent,
        updatedAt: bootstrap.json.siteContent.updatedAt || "",
      },
    });
    assert(touch.status === 200, `Touch failed: ${touch.status}`);

    console.log("2) Tiny Save Test syncs exactly 1 curriculum activity");
    const lessonPlan = {
      id: "cur-lp-tiny-save-test",
      title: "Tiny Save Test",
      age: "Infant",
      theme: "Testing",
      plan: "Free",
      status: "draft",
      learningDomains: ["Social Emotional"],
      weeklyOverview: "A small lesson used only to verify curriculum saving.",
      objectives: "Verify the lesson saves correctly",
      familyConnection: "None for this test.",
      weeklyMaterials: "Baby-safe mirror",
      vocabularyWords: "Look",
      observationOpportunities: "Observe whether the record remains after refresh.",
      adaptations: "Provide positioning support as needed.",
      books: [{ title: "Baby Faces", author: "Margaret Miller", notes: "Test book" }],
      songs: [{ title: "Hello Song", notes: "Test song" }],
      dailyPlans: {
        monday: {
          items: [{
            itemId: "item-tiny-mirror",
            activityCategory: "Sensory Play",
            title: "Tiny Mirror Test",
            description: "Infant looks into a baby-safe mirror.",
            materials: "Baby-safe mirror",
            steps: "1. Show the mirror\n2. Allow the infant to look",
            learningGoals: ["Visual attention"],
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
    const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken: token,
      expectedUpdatedAt: touch.json.siteContent.updatedAt,
      lessonPlan,
    });
    assert(save.status === 200, `Save failed: ${save.status} ${save.text}`);
    const activities = (save.json.activities || []).filter((item) => item.status !== "archived");
    assert(activities.length === 1, `Expected 1 activity, got ${activities.length}`);
    assert(activities[0].title === "Tiny Mirror Test", `Unexpected title: ${activities[0].title}`);
    assert(activities[0].status === "draft", `Expected draft status, got ${activities[0].status}`);
    assert(activities[0].lessonPlanId === "cur-lp-tiny-save-test", "lessonPlanId mismatch");
    assert(activities[0].sourceKey === "cur-lp-tiny-save-test:item-tiny-mirror", `sourceKey mismatch: ${activities[0].sourceKey}`);
    assert(activities[0].activityCategory === "Sensory Play", "category mismatch");
    assert(activities[0].dayOfWeek === "monday", "day mismatch");

    const reload = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    const stored = (reload.json.siteContent.curriculum.activities || []).filter(
      (item) => item.lessonPlanId === "cur-lp-tiny-save-test" && item.status !== "archived",
    );
    assert(stored.length === 1, `Reload expected 1 activity, got ${stored.length}`);
    assert(stored[0].title === "Tiny Mirror Test", "Reload title mismatch");

    console.log("\nCurriculum activities browser checks passed.");
  } catch (error) {
    console.error("\nFAIL:", error.message);
    process.exitCode = 1;
  } finally {
    await stopServer(child);
  }
}

main();
