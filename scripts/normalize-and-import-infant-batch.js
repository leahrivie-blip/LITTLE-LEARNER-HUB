#!/usr/bin/env node
/**
 * Normalize + import Infant lesson-plan batch (v3 label-only).
 *
 * Local (default): ephemeral server writing to a temp store
 * Production: SITE_URL + ADMIN_EMAIL + ADMIN_PASSWORD + ADMIN_ACCESS_CODE
 *
 * Run:
 *   node scripts/normalize-and-import-infant-batch.js
 *   SITE_URL=https://little-learner-hub.onrender.com ADMIN_EMAIL=... ADMIN_PASSWORD=... ADMIN_ACCESS_CODE=... node scripts/normalize-and-import-infant-batch.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const os = require("os");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { URL } = require("url");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");

const ROOT = path.join(__dirname, "..");
const RAW_PATH = path.join(__dirname, "curriculum-import-samples/infant-batch-jul2026/raw-paste.txt");
const OUT_DIR = path.join(__dirname, "curriculum-import-samples/infant-batch-jul2026");
const REPORT_PATH = path.join(__dirname, "data/infant-batch-jul2026-import-report.json");

const VALID_CATEGORIES = new Set([
  "Circle Time",
  "Literacy",
  "Sensory Play",
  "Fine Motor",
  "Gross Motor",
  "Music & Movement",
  "Art",
  "STEM/Discovery",
  "Dramatic Play",
  "Outdoor Play",
  "Open-Ended Exploration",
]);

const CATEGORY_ALIASES = {
  "social emotional development": "Open-Ended Exploration",
  "social emotional": "Open-Ended Exploration",
  "physical development": "Gross Motor",
  "cognitive development": "Open-Ended Exploration",
  "creative arts": "Art",
  "language & literacy": "Literacy",
  "language and literacy": "Literacy",
};

const DOMAIN_ALIASES = {
  "social emotional development": "Social Emotional",
  "social emotional": "Social Emotional",
  "cognitive development": "Science",
  "language and literacy": "Language & Literacy",
  "language & literacy": "Language & Literacy",
  "physical development": "Physical Development",
  "creative arts": "Creative Arts",
};

const remoteUrl = String(process.env.SITE_URL || "").trim();
const useRemote = Boolean(remoteUrl && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD && process.env.ADMIN_ACCESS_CODE);
const LOCAL_PORT = 4520 + Math.floor(Math.random() * 200);
const BASE = useRemote ? remoteUrl.replace(/\/$/, "") : `http://127.0.0.1:${LOCAL_PORT}`;
const ADMIN = useRemote
  ? {
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    code: process.env.ADMIN_ACCESS_CODE,
  }
  : {
    email: "infant-batch@test.local",
    password: "infant-batch-pass",
    code: "infant-batch-code",
  };
const STORE_PATH = path.join(os.tmpdir(), `llh-infant-batch-${crypto.randomBytes(4).toString("hex")}.json`);

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
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
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

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

function normalizeBookLine(line) {
  const clean = String(line || "").trim().replace(/^[-*•]\s*/, "");
  if (!clean) return "";
  if (clean.includes("|")) return clean;
  const byMatch = clean.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byMatch) return `${byMatch[1].trim()} | ${byMatch[2].trim()}`;
  return clean;
}

function normalizeSongLine(line) {
  const clean = String(line || "").trim().replace(/^[-*•]\s*/, "");
  if (!clean) return "";
  if (clean.includes("|")) return clean;
  return clean;
}

function normalizeCategory(value) {
  const raw = String(value || "").trim();
  if (VALID_CATEGORIES.has(raw)) return raw;
  const alias = CATEGORY_ALIASES[raw.toLowerCase()];
  if (alias) return alias;
  return "Open-Ended Exploration";
}

function normalizeDomainsBlock(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const alias = DOMAIN_ALIASES[line.toLowerCase()];
      return alias || line;
    })
    .join("\n");
}

function normalizeLessonText(raw, { forceTitle } = {}) {
  let text = String(raw || "").trim();
  if (!text) return "";

  // Expand same-line labels (TITLE: Value) into v3 two-line form (TITLE:\nValue)
  const expandable = [
    "TITLE",
    "AGE_GROUP",
    "THEME",
    "PLAN",
    "STATUS",
    "ACTIVITY_NAME",
    "CATEGORY",
    "OBJECTIVE",
    "DESCRIPTION",
    "MATERIALS",
    "SETUP",
    "TEACHER_ROLE",
    "DIRECTIONS",
    "LEARNING_GOALS",
    "OBSERVATION_OPPORTUNITIES",
    "WEEKLY_OVERVIEW",
    "LEARNING_OBJECTIVES",
    "WEEKLY_MATERIALS",
    "VOCABULARY",
    "BOOKS",
    "SONGS",
    "FAMILY_CONNECTION",
    "ADAPTATIONS",
    "LEARNING_DOMAINS",
  ];
  const expandRe = new RegExp(`^(${expandable.join("|")}):\\s*(.+)$`, "gim");
  text = text.replace(expandRe, (_, label, value) => `${label}:\n${String(value).trim()}`);

  // Normalize status casing
  text = text.replace(/^STATUS:\s*\n\s*Published\s*$/gim, "STATUS:\npublished");
  text = text.replace(/^STATUS:\s*\n\s*Draft\s*$/gim, "STATUS:\ndraft");
  text = text.replace(/^STATUS:\s*\n\s*Featured\s*$/gim, "STATUS:\nfeatured");

  if (forceTitle) {
    text = text.replace(/^TITLE:\n[^\n]+/i, `TITLE:\n${forceTitle}`);
  }

  // Learning domains aliases (block after LEARNING_DOMAINS:)
  text = text.replace(/^LEARNING_DOMAINS:\n((?:(?![A-Z][A-Z0-9_]*:).+\n?)*)/m, (match, body) => (
    `LEARNING_DOMAINS:\n${normalizeDomainsBlock(body)}\n\n`
  ));

  // Books: convert "Title by Author" lines
  text = text.replace(/^BOOKS:\n((?:(?![A-Z][A-Z0-9_]*:).+\n?)*)/m, (match, body) => {
    const lines = String(body).split(/\r?\n/).map(normalizeBookLine).filter(Boolean);
    return `BOOKS:\n${lines.join("\n")}\n\n`;
  });

  // Songs: keep title-only lines
  text = text.replace(/^SONGS:\n((?:(?![A-Z][A-Z0-9_]*:).+\n?)*)/m, (match, body) => {
    const lines = String(body).split(/\r?\n/).map(normalizeSongLine).filter(Boolean);
    return `SONGS:\n${lines.join("\n")}\n\n`;
  });

  // Activity categories
  text = text.replace(/^CATEGORY:\n([^\n]+)$/gim, (match, cat) => `CATEGORY:\n${normalizeCategory(cat)}`);

  // Ensure blank line before ACTIVITY_NAME blocks for readability
  text = text.replace(/\n(ACTIVITY_NAME:)/g, "\n\n$1");

  return `${text.trim()}\n`;
}

function splitRawLessons(raw) {
  const cleaned = String(raw || "")
    .replace(/\r\n/g, "\n")
    .replace(/\nNext\s*\n/gi, "\n\n@@@LESSON_SPLIT@@@\n\n")
    .replace(/\nNext\s*$/gi, "");
  const chunks = cleaned
    .split(/@@@LESSON_SPLIT@@@/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => /^TITLE:/im.test(chunk));
  return chunks;
}

function extractTitle(text) {
  const match = String(text).match(/^TITLE:\s*\n?([^\n]+)/im);
  return match ? match[1].trim() : "Untitled";
}

function extractAge(text) {
  const match = String(text).match(/^AGE_GROUP:\s*\n?([^\n]+)/im);
  return match ? match[1].trim() : "";
}

function disambiguateTitles(lessons) {
  const counts = new Map();
  lessons.forEach((lesson) => {
    const key = lesson.title.toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return lessons.map((lesson) => {
    if ((counts.get(lesson.title.toLowerCase()) || 0) < 2) return lesson;
    const age = lesson.age || "";
    let suffix = "";
    if (/0\s*[-–]\s*6/i.test(age)) suffix = " (0-6 Months)";
    else if (/6\s*[-–]\s*12/i.test(age)) suffix = " (6-12 Months)";
    else if (age) suffix = ` (${age})`;
    const nextTitle = `${lesson.title}${suffix}`;
    return {
      ...lesson,
      title: nextTitle,
      text: normalizeLessonText(lesson.text, { forceTitle: nextTitle }),
    };
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

function countActivities(plan) {
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  return days.reduce((sum, day) => sum + (plan.dailyPlans?.[day]?.items?.length || 0), 0);
}

async function main() {
  assert(fs.existsSync(RAW_PATH), `Missing raw paste file: ${RAW_PATH}`);
  const raw = fs.readFileSync(RAW_PATH, "utf8");
  let lessons = splitRawLessons(raw).map((text, index) => {
    const title = extractTitle(text);
    const age = extractAge(text);
    const normalized = normalizeLessonText(text);
    return {
      index: index + 1,
      title,
      age,
      text: normalized,
      file: `${String(index + 1).padStart(2, "0")}-${slugify(title) || "lesson"}.txt`,
    };
  });
  lessons = disambiguateTitles(lessons);

  console.log(`Parsed ${lessons.length} lesson plans from raw paste.`);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });

  const parseResults = [];
  for (const lesson of lessons) {
    fs.writeFileSync(path.join(OUT_DIR, lesson.file), lesson.text);
    const parsed = parseCurriculumLessonPlanImport(lesson.text, { existingItemIds: new Map() });
    parseResults.push({
      file: lesson.file,
      title: lesson.title,
      age: lesson.age,
      ok: parsed.ok,
      errors: parsed.errors || [],
      warnings: parsed.warnings || [],
      activities: countActivities(parsed.data || {}),
      plan: parsed.data?.plan,
      status: parsed.data?.status,
    });
    if (!parsed.ok) {
      console.error(`PARSE FAIL: ${lesson.title}`);
      (parsed.errors || []).forEach((err) => console.error(`  - ${err}`));
    } else {
      console.log(`OK parse: ${lesson.title} (${countActivities(parsed.data)} activities)`);
    }
  }

  const failedParse = parseResults.filter((item) => !item.ok);
  assert(failedParse.length === 0, `${failedParse.length} lesson(s) failed to parse. Fix before import.`);

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
      const parsed = parseCurriculumLessonPlanImport(lesson.text, { existingItemIds: new Map() });
      const stableId = `cur-lp-infant-${slugify(lesson.title)}`;
      const plan = {
        ...parsed.data,
        id: stableId,
        status: parsed.data.status || "published",
      };
      console.log(`Saving: ${plan.title} [${plan.plan}/${plan.status}] id=${stableId}`);
      let save = await saveLesson(token, plan, expectedUpdatedAt);
      if (save.status === 409 && save.json?.siteContentUpdatedAt) {
        expectedUpdatedAt = save.json.siteContentUpdatedAt;
        save = await saveLesson(token, plan, expectedUpdatedAt);
      }
      assert(save.status === 200 && save.json?.lessonPlan?.id, `Save failed for ${plan.title}: ${save.status} ${save.text?.slice(0, 300)}`);
      expectedUpdatedAt = save.json.siteContentUpdatedAt || expectedUpdatedAt;
      const activityCount = (save.json.activities || []).filter((item) => item.status !== "archived").length;
      imported.push({
        id: save.json.lessonPlan.id,
        title: save.json.lessonPlan.title,
        age: save.json.lessonPlan.age,
        plan: save.json.lessonPlan.plan,
        status: save.json.lessonPlan.status,
        activitiesSynced: activityCount,
        activityIds: (save.json.activities || []).filter((item) => item.status !== "archived").map((item) => item.id),
      });
      console.log(`  ✓ saved with ${activityCount} Activity Library entries`);
    }

    // Verify from admin site content
    const verify = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    assert(verify.status === 200, "Verify read failed");
    const curriculum = verify.json.siteContent?.curriculum || {};
    const titles = new Set(imported.map((item) => item.title));
    const savedPlans = (curriculum.lessonPlans || []).filter((plan) => titles.has(plan.title));
    const savedActivities = (curriculum.activities || []).filter((activity) => (
      imported.some((item) => item.id === activity.lessonPlanId) && activity.status !== "archived"
    ));

    const report = {
      importedAt: new Date().toISOString(),
      target: useRemote ? BASE : `local:${LOCAL_PORT}`,
      lessonPlanCount: imported.length,
      activityCount: savedActivities.length,
      plans: imported,
      parseResults,
      verification: {
        matchingLessonPlans: savedPlans.length,
        matchingActivities: savedActivities.length,
      },
    };
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

    console.log("\n=== IMPORT COMPLETE ===");
    console.log(`Lesson plans: ${imported.length}`);
    console.log(`Activities synced: ${savedActivities.length}`);
    console.log(`Report: ${REPORT_PATH}`);
    imported.forEach((item) => {
      console.log(`- ${item.title} (${item.age}) → ${item.activitiesSynced} activities`);
    });
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("\nFAIL:", error.message);
  process.exitCode = 1;
});
