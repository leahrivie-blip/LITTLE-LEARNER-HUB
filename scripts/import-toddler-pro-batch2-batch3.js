#!/usr/bin/env node
/**
 * Import Toddler Pro batch 2 + batch 3 lesson plans (ACTIVITY_N_* format) via V5 Flexible Import.
 *
 * Local (default): ephemeral server + temp JSON store
 * Production: SITE_URL + ADMIN_EMAIL + ADMIN_PASSWORD + ADMIN_ACCESS_CODE
 *
 * Run:
 *   node scripts/import-toddler-pro-batch2-batch3.js
 *   node scripts/import-toddler-pro-batch2-batch3.js --parse-only
 *   SITE_URL=https://little-learner-hub.onrender.com ADMIN_EMAIL=... ADMIN_PASSWORD=... ADMIN_ACCESS_CODE=... \
 *     node scripts/import-toddler-pro-batch2-batch3.js
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
const PARSE_ONLY = process.argv.includes("--parse-only");
const REPORT_PATH = path.join(__dirname, "data/toddler-pro-batch2-batch3-import-report.json");

const IMPORT_DIRS = [
  path.join(__dirname, "curriculum-toddler-pro-batch2-imports"),
  path.join(__dirname, "curriculum-toddler-pro-batch3-imports"),
];

const STABLE_IDS = {
  "Farm STEM": "cur-lp-toddler-farm-stem",
  "Little Bakers": "cur-lp-toddler-little-bakers",
  "Transportation Builders": "cur-lp-toddler-transportation-builders",
  "Little Scientists": "cur-lp-toddler-little-scientists",
  "Amazing Insects": "cur-lp-toddler-amazing-insects",
  "Nature Explorers": "cur-lp-toddler-nature-explorers",
  "Rainbow Science": "cur-lp-toddler-rainbow-science",
  "Busy Builders": "cur-lp-toddler-busy-builders",
  "Weather Lab": "cur-lp-toddler-weather-lab",
  "Apple Orchard Adventures": "cur-lp-toddler-apple-orchard-adventures",
  "Pond Life Explorers": "cur-lp-toddler-pond-life-explorers",
  "Growing Gardens STEM": "cur-lp-toddler-growing-gardens-stem",
  "Space Explorers STEM": "cur-lp-toddler-space-explorers-stem",
  "Fossil Hunters": "cur-lp-toddler-fossil-hunters",
};

const SKIP_FILES = new Set([
  // Scaffold-only placeholder without weekday activities.
  "01-toddler-construction-zone-pro.txt",
]);

const remoteUrl = String(process.env.SITE_URL || "").trim();
const useRemote = Boolean(remoteUrl && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD && process.env.ADMIN_ACCESS_CODE);
const LOCAL_PORT = 4560 + Math.floor(Math.random() * 200);
const BASE = useRemote ? remoteUrl.replace(/\/$/, "") : `http://127.0.0.1:${LOCAL_PORT}`;
const ADMIN = useRemote
  ? {
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    code: process.env.ADMIN_ACCESS_CODE,
  }
  : {
    email: "toddler-pro-batch23@test.local",
    password: "toddler-pro-batch23-pass",
    code: "toddler-pro-batch23-code",
  };
const STORE_PATH = path.join(os.tmpdir(), `llh-toddler-batch23-${crypto.randomBytes(4).toString("hex")}.json`);

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
        timeout: 90000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            json = { raw: text };
          }
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("request timeout"));
    });
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
      ADMIN_NAME: "Toddler Pro Batch2/3 Import",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function waitForBoot(child, timeoutMs = 25000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    const tick = async () => {
      if (child.exitCode !== null) {
        reject(new Error(`Server exited early (${child.exitCode}): ${stderr.slice(-500)}`));
        return;
      }
      try {
        const res = await requestJson("GET", "/api/health");
        if (res.status === 200) {
          resolve();
          return;
        }
      } catch {
        // retry
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`Server boot timeout: ${stderr.slice(-500)}`));
        return;
      }
      setTimeout(tick, 250);
    };
    tick();
  });
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch { /* ignore */ }
      resolve();
    }, 4000);
    child.on("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function listImportFiles() {
  const files = [];
  for (const dir of IMPORT_DIRS) {
    assert(fs.existsSync(dir), `Missing import directory: ${dir}`);
    for (const name of fs.readdirSync(dir).sort()) {
      if (!name.endsWith(".txt") || SKIP_FILES.has(name)) continue;
      files.push({ dir, name, fullPath: path.join(dir, name) });
    }
  }
  return files;
}

function countActivities(plan) {
  return ["monday", "tuesday", "wednesday", "thursday", "friday"]
    .reduce((sum, day) => sum + (plan?.dailyPlans?.[day]?.items?.length || 0), 0);
}

function slugFromTitle(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
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

async function main() {
  const files = listImportFiles();
  assert(files.length >= 10, `Expected at least 10 import files, found ${files.length}`);

  const lessons = [];
  for (const file of files) {
    const text = fs.readFileSync(file.fullPath, "utf8");
    const parsed = parseCurriculumLessonPlanImportV5(text);
    const title = parsed.data?.title || path.basename(file.name, ".txt");
    const activities = countActivities(parsed.data || {});
    const row = {
      file: file.name,
      title,
      ok: Boolean(parsed.ok),
      errors: parsed.errors || [],
      activities,
      parsed,
    };
    lessons.push(row);
    if (!row.ok) {
      console.error(`PARSE FAIL: ${file.name} (${title})`);
      row.errors.forEach((err) => console.error(`  - ${err}`));
    } else {
      console.log(`OK parse: ${title} (${activities} activities) <= ${file.name}`);
    }
  }

  const failed = lessons.filter((item) => !item.ok || item.activities < 10);
  assert(failed.length === 0, `${failed.length} lesson(s) failed parse quality checks.`);

  if (PARSE_ONLY) {
    console.log("\nParse-only mode complete.");
    return;
  }

  let child = null;
  try {
    if (!useRemote) {
      console.log("\nStarting local server for import…");
      child = startLocalServer();
      await waitForBoot(child);
    } else {
      console.log(`\nImporting to remote: ${BASE}`);
    }

    const token = await login();
    let expectedUpdatedAt = await getUpdatedAt(token);
    const imported = [];

    for (const lesson of lessons) {
      const title = lesson.parsed.data.title;
      const id = STABLE_IDS[title] || `cur-lp-toddler-${slugFromTitle(title)}`;
      const prefix = id.replace(/^cur-lp-/, "");
      const dailyPlans = {};
      ["monday", "tuesday", "wednesday", "thursday", "friday"].forEach((day) => {
        const source = lesson.parsed.data.dailyPlans?.[day] || {};
        dailyPlans[day] = {
          ...source,
          items: (source.items || []).map((item, index) => ({
            ...item,
            itemId: `item-${prefix}-${day}-${index + 1}`,
          })),
        };
      });

      const plan = {
        ...lesson.parsed.data,
        id,
        age: "Toddler",
        plan: "Pro",
        status: "published",
        dailyPlans,
      };

      console.log(`Saving: ${plan.title} [Pro/published] id=${id}`);
      let save = await saveLesson(token, plan, expectedUpdatedAt);
      if (save.status === 409 && save.json?.siteContentUpdatedAt) {
        expectedUpdatedAt = save.json.siteContentUpdatedAt;
        save = await saveLesson(token, plan, expectedUpdatedAt);
      }
      assert(
        save.status === 200 && save.json?.lessonPlan?.id,
        `Save failed for ${plan.title}: ${save.status} ${save.text?.slice(0, 300)}`,
      );

      expectedUpdatedAt = save.json.siteContentUpdatedAt || expectedUpdatedAt;
      const linked = (save.json.activities || []).filter(
        (item) => item.lessonPlanId === id && item.status !== "archived",
      );
      const activityIds = save.json.lessonPlan?.activityIds || [];
      imported.push({
        id,
        title: save.json.lessonPlan.title,
        activitiesSynced: linked.length,
        activityIds: activityIds.length,
      });
      console.log(`  ✓ saved with ${linked.length} Activity Library entries`);
      assert(linked.length > 0, `${plan.title}: expected synced activities`);
      assert(linked.length === activityIds.length, `${plan.title}: activity sync mismatch`);
    }

    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    const report = {
      importedAt: new Date().toISOString(),
      target: useRemote ? BASE : `local:${LOCAL_PORT}`,
      lessonPlanCount: imported.length,
      plans: imported,
    };
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log("\n=== IMPORT COMPLETE ===");
    console.log(`Lesson plans: ${imported.length}`);
    imported.forEach((item) => console.log(`- ${item.title} → ${item.activitiesSynced} activities`));
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("\nFAIL:", error.message);
  process.exitCode = 1;
});
