#!/usr/bin/env node
/**
 * Regression for the broader "lesson plans AND activities empty in production" incident.
 *
 * Lesson plans and activities live together in siteContent.curriculum and are wiped by
 * the exact same failure mode (an admin site-content save replacing the whole curriculum
 * object with an empty/partial one). This test covers the case the original hotfix test
 * did not: activities dropping to empty/partial while lessonPlans looks untouched, and the
 * inverse (lessonPlans dropping while activities looks untouched). Both must be refused the
 * same way, and the public library must keep serving both lesson plans and activities.
 *
 * Run: node scripts/test-curriculum-activities-wipe-protection.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 4920 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(os.tmpdir(), `llh-activities-wipe-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "activities-wipe-hotfix@example.com",
  password: "activities-wipe-hotfix-pass",
  code: "activities-wipe-hotfix-code",
};

function requestJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const reqHeaders = { ...headers };
    if (payload) {
      reqHeaders["Content-Type"] = "application/json";
      reqHeaders["Content-Length"] = Buffer.byteLength(payload);
    }
    const req = http.request(
      { hostname: "127.0.0.1", port: PORT, path: urlPath, method, headers: reqHeaders, timeout: 30000 },
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

function samplePlan(id, title, age = "Preschool") {
  return {
    id,
    title,
    age,
    theme: "Activities Wipe Theme",
    plan: "Free",
    status: "published",
    weeklyOverview: "A published plan used to cover the activities-wipe regression.",
    learningDomains: ["Approaches to Learning"],
    weeklyMaterials: "Blocks",
    activityIds: [],
    resourceIds: [],
    dailyPlans: {
      monday: { theme: "Day 1", items: [] },
      tuesday: { theme: "Day 2", items: [] },
      wednesday: { theme: "Day 3", items: [] },
      thursday: { theme: "Day 4", items: [] },
      friday: { theme: "Day 5", items: [] },
    },
    updatedAt: "2026-07-22T12:00:00.000Z",
    publishedAt: "2026-07-22T12:00:00.000Z",
  };
}

function sampleActivity(id, lessonPlanId, title, dayOfWeek = "monday") {
  return {
    id,
    lessonPlanId,
    itemId: `item-${id}`,
    sourceKey: `source-${id}`,
    dayOfWeek,
    activityCategory: "Sensory",
    title,
    objective: "Explore sensory materials.",
    description: "Children explore a themed sensory bin.",
    materials: "Bin, rice, scoops",
    setup: "Fill bin with rice and hide small objects.",
    steps: "1. Introduce the bin.\n2. Let children explore.\n3. Discuss textures.",
    teacherRole: "Model safe exploration.",
    teacherLanguage: "What do you notice about how this feels?",
    learningGoals: ["Sensory exploration"],
    learningDomains: ["Approaches to Learning"],
    status: "published",
    updatedAt: "2026-07-22T12:00:00.000Z",
    publishedAt: "2026-07-22T12:00:00.000Z",
  };
}

function startServer(initialStore) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(initialStore, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      ADMIN_NAME: "Activities Wipe Hotfix",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 120; i += 1) {
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200) return;
    } catch { /* retry */ }
    if (child.exitCode !== null) throw new Error("server exited");
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("boot timeout");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* */ } resolve(); }, 3000);
    child.on("exit", () => { clearTimeout(timer); resolve(); });
  });
}

function assertStaticGuards() {
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  assert.match(serverJs, /function curriculumFieldDroppedTooMuch\(/);
  assert.match(
    serverJs,
    /activitiesWiped = curriculumFieldDroppedTooMuch\(existing\.activities\.length, incoming\.activities\.length\)/,
  );
  console.log("PASS  static guard covers activities independently of lessonPlans");
}

async function main() {
  assertStaticGuards();

  const seededPlans = [
    samplePlan("cur-lp-actwipe-one", "Activities Wipe Plan One"),
    samplePlan("cur-lp-actwipe-two", "Activities Wipe Plan Two"),
  ];
  const seededActivities = [
    sampleActivity("cur-act-actwipe-1", "cur-lp-actwipe-one", "Sensory Bin Exploration", "monday"),
    sampleActivity("cur-act-actwipe-2", "cur-lp-actwipe-one", "Texture Walk", "tuesday"),
    sampleActivity("cur-act-actwipe-3", "cur-lp-actwipe-two", "Rice Pour Station", "monday"),
    sampleActivity("cur-act-actwipe-4", "cur-lp-actwipe-two", "Sensory Bottles", "tuesday"),
    sampleActivity("cur-act-actwipe-5", "cur-lp-actwipe-two", "Scoop and Sort", "wednesday"),
    sampleActivity("cur-act-actwipe-6", "cur-lp-actwipe-two", "Sound Shakers", "thursday"),
  ];

  const child = startServer({
    users: {},
    siteContent: {
      updatedAt: "2026-07-22T10:00:00.000Z",
      curriculum: {
        lessonPlans: seededPlans,
        activities: seededActivities,
        resources: [],
        series: [],
        updatedAt: "2026-07-22T10:00:00.000Z",
      },
    },
    adminSessions: {},
  });

  try {
    await waitForBoot(child);

    const beforePublic = await requestJson("GET", "/api/site-content");
    assert.equal(beforePublic.status, 200);
    const beforeLessonPlans = (beforePublic.json.siteContent?.curriculumLibrary?.lessonPlans || []).length;
    const beforeActivities = (beforePublic.json.siteContent?.curriculumLibrary?.activities || []).length;
    assert.ok(beforeLessonPlans >= 2, `expected seeded/public lesson plans, got ${beforeLessonPlans}`);
    assert.ok(beforeActivities >= 6, `expected seeded/public activities, got ${beforeActivities}`);

    const login = await requestJson("POST", "/api/admin/login", ADMIN);
    assert.equal(login.status, 200, "admin login");
    const token = login.json.token;

    // Case 1: lessonPlans look intact, but activities are wiped. This is the exact shape
    // of "lesson plans work but activities disappear" reported alongside the original
    // curriculum wipe incident.
    const activitiesWipeAttempt = await requestJson("POST", "/api/admin/site-content", {
      adminToken: token,
      siteContent: {
        updatedAt: beforePublic.json.siteContent?.updatedAt || "2026-07-22T10:00:00.000Z",
        homepage: { heroHeadline: "Activities wipe attempt" },
        curriculum: {
          lessonPlans: seededPlans,
          activities: [],
          resources: [],
          series: [],
          updatedAt: "",
        },
      },
    });
    assert.equal(
      activitiesWipeAttempt.status,
      200,
      `site-content save should succeed while preserving activities (${activitiesWipeAttempt.text?.slice(0, 200)})`,
    );
    const savedActivitiesCount = (activitiesWipeAttempt.json.siteContent?.curriculum?.activities || []).length;
    assert.ok(
      savedActivitiesCount >= seededActivities.length,
      `server must preserve existing activities even when lessonPlans looks intact (before=${seededActivities.length}, after=${savedActivitiesCount})`,
    );

    const afterActivitiesWipePublic = await requestJson("GET", "/api/site-content");
    const afterActivitiesCount = (afterActivitiesWipePublic.json.siteContent?.curriculumLibrary?.activities || []).length;
    assert.equal(
      afterActivitiesCount,
      beforeActivities,
      `public activities must stay stable after an activities-only wipe attempt (before=${beforeActivities}, after=${afterActivitiesCount})`,
    );
    console.log("PASS  activities-only wipe refused while lessonPlans looked intact");

    // Case 2: the inverse — activities intact, lessonPlans wiped.
    const lessonPlansWipeAttempt = await requestJson("POST", "/api/admin/site-content", {
      adminToken: token,
      siteContent: {
        updatedAt: activitiesWipeAttempt.json.siteContent.updatedAt,
        announcement: { text: "Lesson plans wipe attempt", visible: false },
        curriculum: {
          lessonPlans: [],
          activities: seededActivities,
          resources: [],
          series: [],
          updatedAt: "",
        },
      },
    });
    assert.equal(lessonPlansWipeAttempt.status, 200);
    const savedLessonPlansCount = (lessonPlansWipeAttempt.json.siteContent?.curriculum?.lessonPlans || []).length;
    assert.ok(
      savedLessonPlansCount >= seededPlans.length,
      `server must preserve existing lesson plans even when activities looked intact (before=${seededPlans.length}, after=${savedLessonPlansCount})`,
    );
    console.log("PASS  lessonPlans-only wipe refused while activities looked intact");

    // Explicit replace still allows an intentional full rebuild of both.
    const replace = await requestJson("POST", "/api/admin/site-content", {
      adminToken: token,
      confirmCurriculumReplace: "REPLACE_CURRICULUM",
      siteContent: {
        updatedAt: lessonPlansWipeAttempt.json.siteContent.updatedAt,
        curriculum: {
          lessonPlans: [samplePlan("cur-lp-actwipe-replaced", "Replaced Plan Only")],
          activities: [sampleActivity("cur-act-actwipe-replaced", "cur-lp-actwipe-replaced", "Replaced Activity Only")],
          resources: [],
          series: [],
          updatedAt: "2026-07-22T13:00:00.000Z",
        },
      },
    });
    assert.equal(replace.status, 200);
    assert.equal((replace.json.siteContent?.curriculum?.lessonPlans || []).length, 1);
    assert.equal((replace.json.siteContent?.curriculum?.activities || []).length, 1);
    console.log("PASS  explicit REPLACE_CURRICULUM still allows an intentional full rebuild");

    console.log("\nAll curriculum activities wipe-protection tests passed.");
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
