#!/usr/bin/env node
/**
 * Import + publish Apple Orchard Investigators (Preschool Pro)
 * and place it as Week 1 of Fall Celebrations monthly curriculum.
 *
 * Local:
 *   node scripts/import-apple-orchard-investigators.js
 *
 * Production:
 *   SITE_URL=https://little-learner-hub.onrender.com \
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... ADMIN_ACCESS_CODE=... \
 *   node scripts/import-apple-orchard-investigators.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const os = require("os");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { URL } = require("url");

require("./curriculum-lesson-import-parser.js");
const { parseCurriculumLessonPlanImportV5 } = require("./curriculum-lesson-import-v4.js");

const ROOT = path.join(__dirname, "..");
const IMPORT_FILE = path.join(
  ROOT,
  "scripts/curriculum-preschool-fall-imports/01-preschool-apple-orchard-investigators-pro.txt",
);
const COVER_FILE = path.join(ROOT, "images/lesson-covers/apple-orchard-investigators.jpg");
const PLAN_ID = "cur-lp-preschool-apple-orchard-investigators";
const SERIES_ID = "cur-series-preschool-fall-celebrations";
const COVER_URL = "/images/lesson-covers/apple-orchard-investigators.jpg";

const remoteUrl = String(process.env.SITE_URL || "").trim();
const useRemote = Boolean(remoteUrl && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD && process.env.ADMIN_ACCESS_CODE);
const LOCAL_PORT = 4570 + Math.floor(Math.random() * 200);
const BASE = useRemote ? remoteUrl.replace(/\/$/, "") : `http://127.0.0.1:${LOCAL_PORT}`;
const ADMIN = useRemote
  ? {
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    code: process.env.ADMIN_ACCESS_CODE,
  }
  : {
    email: "apple-orchard@test.local",
    password: "apple-orchard-pass",
    code: "apple-orchard-code",
  };
const STORE_PATH = path.join(os.tmpdir(), `llh-apple-orchard-${crypto.randomBytes(4).toString("hex")}.json`);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requestJson(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const target = new URL(urlPath, BASE);
    const lib = target.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (target.protocol === "https:" ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method,
        headers: payload
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
          : {},
        timeout: 120000,
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

function startLocalServer() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(LOCAL_PORT),
      SITE_URL: BASE,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
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
      const res = await requestJson("GET", "/api/health");
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

async function login() {
  const res = await requestJson("POST", "/api/admin/login", {
    email: ADMIN.email,
    password: ADMIN.password,
    code: ADMIN.code,
  });
  assert(res.status === 200 && res.json?.token, `Admin login failed: ${res.status} ${res.text?.slice(0, 200)}`);
  return res.json.token;
}

async function getUpdatedAt(token) {
  const res = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  assert(res.status === 200, `site-content read failed: ${res.status}`);
  return res.json.siteContent?.updatedAt || "";
}

async function saveLesson(token, lessonPlan, expectedUpdatedAt) {
  return requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt,
    lessonPlan,
  });
}

async function saveSeries(token, series, expectedUpdatedAt) {
  return requestJson("POST", "/api/admin/curriculum/series", {
    adminToken: token,
    expectedUpdatedAt,
    series,
  });
}

function buildPlan(parsed) {
  const prefix = PLAN_ID.replace(/^cur-lp-/, "");
  const dailyPlans = {};
  ["monday", "tuesday", "wednesday", "thursday", "friday"].forEach((day) => {
    const source = parsed.data.dailyPlans?.[day] || {};
    dailyPlans[day] = {
      ...source,
      items: (source.items || []).map((item, index) => ({
        ...item,
        itemId: `item-${prefix}-${day}-${index + 1}`,
      })),
    };
  });
  return {
    ...parsed.data,
    id: PLAN_ID,
    age: "Preschool",
    plan: "Pro",
    status: "published",
    theme: parsed.data.theme || "Apples and Early Fall",
    coverImageUrl: COVER_URL,
    coverImageAlt: "Preschool children exploring apples in a bright fall orchard",
    coverImageSource: "mapped",
    coverImagePosition: "center",
    dailyPlans,
  };
}

function buildFallCelebrationsSeries() {
  return {
    id: SERIES_ID,
    title: "Fall Celebrations",
    description: "A four-week Preschool Pro fall curriculum. Week 1 invites children to become Apple Orchard Investigators. Weeks 2–4 are reserved for Pumpkin Patch Scientists, Friendly Halloween Explorers, and Thankful Harvest Helpers.",
    theme: "Fall Celebrations",
    age: "Preschool",
    month: "October",
    season: "Fall",
    weekCount: 4,
    plan: "Pro",
    status: "needs_review",
    featured: false,
    displayOrder: 10,
    coverImageUrl: COVER_URL,
    coverImageAlt: "Fall Celebrations preschool curriculum cover with apple orchard theme",
    coverImageSource: "mapped",
    learningDomains: [
      "Social Emotional",
      "Language & Literacy",
      "Math",
      "Science",
      "Physical Development",
      "Creative Arts",
    ],
    weeks: [
      {
        weekNumber: 1,
        lessonPlanId: PLAN_ID,
        displayOrder: 1,
        label: "Apple Orchard Investigators",
      },
      {
        weekNumber: 2,
        lessonPlanId: "",
        displayOrder: 2,
        label: "Pumpkin Patch Scientists",
      },
      {
        weekNumber: 3,
        lessonPlanId: "",
        displayOrder: 3,
        label: "Friendly Halloween Explorers",
      },
      {
        weekNumber: 4,
        lessonPlanId: "",
        displayOrder: 4,
        label: "Thankful Harvest Helpers",
      },
    ],
  };
}

async function main() {
  assert(fs.existsSync(IMPORT_FILE), `Missing import file: ${IMPORT_FILE}`);
  assert(fs.existsSync(COVER_FILE), `Missing cover file: ${COVER_FILE}`);

  const text = fs.readFileSync(IMPORT_FILE, "utf8");
  const parsed = parseCurriculumLessonPlanImportV5(text);
  assert(parsed.ok, `Parse failed: ${(parsed.errors || []).join("; ")}`);
  const activityCount = ["monday", "tuesday", "wednesday", "thursday", "friday"]
    .reduce((sum, day) => sum + (parsed.data.dailyPlans?.[day]?.items || []).length, 0);
  assert(activityCount === 15, `Expected 15 activities, found ${activityCount}`);
  console.log(`Parsed OK: ${parsed.data.title} (${activityCount} activities)`);

  let child = null;
  try {
    if (!useRemote) {
      console.log("Starting local server…");
      child = startLocalServer();
      await waitForBoot(child);
    } else {
      console.log(`Importing to remote: ${BASE}`);
    }

    const token = await login();
    let expectedUpdatedAt = await getUpdatedAt(token);
    const plan = buildPlan(parsed);

    console.log(`Saving lesson: ${plan.title} [${plan.plan}/${plan.status}] id=${plan.id}`);
    let save = await saveLesson(token, plan, expectedUpdatedAt);
    if (save.status === 409 && save.json?.siteContentUpdatedAt) {
      expectedUpdatedAt = save.json.siteContentUpdatedAt;
      save = await saveLesson(token, plan, expectedUpdatedAt);
    }
    assert(
      save.status === 200 && save.json?.lessonPlan?.id === PLAN_ID,
      `Lesson save failed: ${save.status} ${save.text?.slice(0, 400)}`,
    );
    expectedUpdatedAt = save.json.siteContentUpdatedAt || expectedUpdatedAt;
    const linkedActivities = (save.json.activities || []).filter((item) => item.lessonPlanId === PLAN_ID && item.status !== "archived");
    console.log(`Lesson published with ${linkedActivities.length} Activity Center items`);

    const series = buildFallCelebrationsSeries();
    console.log(`Saving Fall Celebrations series Week 1 → ${PLAN_ID}`);
    let seriesSave = await saveSeries(token, series, expectedUpdatedAt);
    if (seriesSave.status === 409 && seriesSave.json?.siteContentUpdatedAt) {
      expectedUpdatedAt = seriesSave.json.siteContentUpdatedAt;
      seriesSave = await saveSeries(token, series, expectedUpdatedAt);
    }
    assert(
      seriesSave.status === 200 && seriesSave.json?.series?.id === SERIES_ID,
      `Series save failed: ${seriesSave.status} ${seriesSave.text?.slice(0, 400)}`,
    );
    const week1 = (seriesSave.json.series.weeks || []).find((week) => week.weekNumber === 1);
    assert(week1?.lessonPlanId === PLAN_ID, "Fall Celebrations Week 1 was not linked");
    console.log(`Fall Celebrations status=${seriesSave.json.series.status}; Week 1 linked`);

    const publicLib = await requestJson("GET", "/api/site-content");
    assert(publicLib.status === 200, "Public site-content failed");
    const plans = publicLib.json?.siteContent?.curriculumLibrary?.lessonPlans || [];
    const found = plans.find((item) => item.id === PLAN_ID || item.title === "Apple Orchard Investigators");
    assert(found, "Published plan not visible in public curriculum library");
    assert(String(found.plan) === "Pro", "Plan tier mismatch");
    console.log("Public library confirms Apple Orchard Investigators (Preschool Pro)");

    console.log("\nIMPORT COMPLETE");
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("\nIMPORT FAIL:", error.message);
  process.exit(1);
});
