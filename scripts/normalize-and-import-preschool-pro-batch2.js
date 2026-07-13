#!/usr/bin/env node
/**
 * Normalize + import Preschool Pro batch 2 (10 plans, Activity Library sync).
 *
 * Local: ephemeral server
 * Production: SITE_URL + ADMIN_EMAIL + ADMIN_PASSWORD + ADMIN_ACCESS_CODE
 *
 * Run:
 *   node scripts/normalize-and-import-preschool-pro-batch2.js
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
const { PRESCHOOL_PRO_BATCH2_IMPORT_TARGETS, PRO_BATCH2_IMPORT_DIR } = require("./curriculum-preschool-import-targets.js");

const ROOT = path.join(__dirname, "..");
const RAW_PATH = path.join(__dirname, "curriculum-import-samples/preschool-pro-batch2-jul2026/raw-paste.txt");
const REPORT_PATH = path.join(__dirname, "data/preschool-pro-batch2-import-report.json");

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
  "science & discovery": "STEM/Discovery",
  "science discovery": "STEM/Discovery",
  "science exploration": "STEM/Discovery",
  "dramatic play": "Dramatic Play",
  "fine motor": "Fine Motor",
  "gross motor": "Gross Motor",
  "sensory play": "Sensory Play",
  "music & movement": "Music & Movement",
  "open-ended exploration": "Open-Ended Exploration",
  "circle time": "Circle Time",
};

const DOMAIN_ALIASES = {
  "social emotional development": "Social Emotional",
  "social emotional": "Social Emotional",
  "science & discovery": "Science",
  "science discovery": "Science",
  "language and literacy": "Language & Literacy",
  "language & literacy": "Language & Literacy",
  "physical development": "Physical Development",
  "creative arts": "Creative Arts",
  "mathematics": "Math",
  "math development": "Math",
};

const TITLE_TO_TARGET = Object.fromEntries(
  PRESCHOOL_PRO_BATCH2_IMPORT_TARGETS.map((target) => {
    const title = target.file.replace(/^\d+-preschool-/, "").replace(/-pro\.txt$/, "")
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
    return [title, target];
  }),
);

TITLE_TO_TARGET["Gardening Plant Life"] = PRESCHOOL_PRO_BATCH2_IMPORT_TARGETS.find(
  (t) => t.stableId === "cur-lp-preschool-gardening-plant-life",
);

const STABLE_BY_TITLE = {
  "Animal Habitats": "cur-lp-preschool-animal-habitats",
  "Construction Zone": "cur-lp-preschool-construction-zone",
  "Camping Adventure": "cur-lp-preschool-camping-adventure",
  "Little Scientists": "cur-lp-preschool-little-scientists",
  "Amazing Insects": "cur-lp-preschool-amazing-insects",
  "Inventors Workshop": "cur-lp-preschool-inventors-workshop",
  "Archaeology Adventure": "cur-lp-preschool-archaeology-adventure",
  "Gardening & Plant Life": "cur-lp-preschool-gardening-plant-life",
  "Pet Pals": "cur-lp-preschool-pet-pals",
  "Zoo Adventure": "cur-lp-preschool-zoo-adventure",
};

const remoteUrl = String(process.env.SITE_URL || "").trim();
const useRemote = Boolean(remoteUrl && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD && process.env.ADMIN_ACCESS_CODE);
const LOCAL_PORT = 4540 + Math.floor(Math.random() * 200);
const BASE = useRemote ? remoteUrl.replace(/\/$/, "") : `http://127.0.0.1:${LOCAL_PORT}`;
const ADMIN = useRemote
  ? {
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    code: process.env.ADMIN_ACCESS_CODE,
  }
  : {
    email: "preschool-pro-batch2@test.local",
    password: "preschool-pro-batch2-pass",
    code: "preschool-pro-batch2-code",
  };
const STORE_PATH = path.join(os.tmpdir(), `llh-preschool-batch2-${crypto.randomBytes(4).toString("hex")}.json`);

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
          try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("request timeout")));
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

function normalizeBookLine(line) {
  const clean = String(line || "").trim().replace(/^[-*•]\s*/, "");
  if (!clean) return "";
  if (clean.includes("|")) return clean;
  const byMatch = clean.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byMatch) return `${byMatch[1].trim()} | ${byMatch[2].trim()}`;
  return clean;
}

function normalizeCategory(value) {
  const raw = String(value || "").trim();
  if (VALID_CATEGORIES.has(raw)) return raw;
  const alias = CATEGORY_ALIASES[raw.toLowerCase()];
  return alias || "Open-Ended Exploration";
}

function normalizeDomainsBlock(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*•]\s*/, ""))
    .filter(Boolean)
    .map((line) => DOMAIN_ALIASES[line.toLowerCase()] || line)
    .join("\n");
}

function normalizeListBlock(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*•]\s*/, ""))
    .filter(Boolean)
    .join("\n");
}

function getFieldBlock(block, field) {
  const re = new RegExp(`^${field}:\\n([\\s\\S]*?)(?=\\n[A-Z][A-Z_ /&]*:|$)`, "m");
  const match = block.match(re);
  return match ? match[1].trim() : "";
}

function enrichActivityBlocks(text) {
  return text.replace(
    /ACTIVITY_NAME:\n([\s\S]*?)(?=\n\n(?:ACTIVITY_NAME:|MONDAY:|TUESDAY:|WEDNESDAY:|THURSDAY:|FRIDAY:)|$)/g,
    (match, body) => {
      let block = `ACTIVITY_NAME:\n${body}`.trimEnd();
      const objective = getFieldBlock(block, "OBJECTIVE");
      const name = getFieldBlock(block, "ACTIVITY_NAME");
      if (!/^DESCRIPTION:/m.test(block)) {
        block += `\n\nDESCRIPTION:\n${objective || name}`;
      }
      if (!/^LEARNING_GOALS:/m.test(block)) {
        block += `\n\nLEARNING_GOALS:\n${objective || `Participate in ${name}`}`;
      }
      if (!/^OBSERVATION_OPPORTUNITIES:/m.test(block)) {
        block += "\n\nOBSERVATION_OPPORTUNITIES:\nObserve participation, engagement, and use of theme vocabulary.";
      }
      return `${block}\n\n`;
    },
  );
}

function normalizeLessonText(raw) {
  let text = String(raw || "").trim();
  const expandable = [
    "TITLE", "AGE_GROUP", "THEME", "PLAN", "STATUS",
    "ACTIVITY_NAME", "CATEGORY", "OBJECTIVE", "DESCRIPTION",
    "MATERIALS", "SETUP", "TEACHER_ROLE", "DIRECTIONS",
    "LEARNING_GOALS", "OBSERVATION_OPPORTUNITIES",
    "WEEKLY_OVERVIEW", "LEARNING_OBJECTIVES", "WEEKLY_MATERIALS",
    "VOCABULARY", "BOOKS", "SONGS", "FAMILY_CONNECTION",
    "ADAPTATIONS", "LEARNING_DOMAINS", "OBSERVATION_OPPORTUNITIES",
  ];
  const expandRe = new RegExp(`^(${expandable.join("|")}):\\s*(.+)$`, "gim");
  text = text.replace(expandRe, (_, label, value) => `${label}:\n${String(value).trim()}`);

  text = text.replace(/^STATUS:\s*\n\s*Published\s*$/gim, "STATUS:\npublished");
  text = text.replace(/^STATUS:\s*\n\s*Draft\s*$/gim, "STATUS:\ndraft");

  text = text.replace(/^LEARNING_DOMAINS:\n((?:(?![A-Z][A-Z0-9_ /&]*:).+\n?)*)/m, (match, body) => (
    `LEARNING_DOMAINS:\n${normalizeDomainsBlock(body)}\n\n`
  ));

  text = text.replace(/^LEARNING_OBJECTIVES:\n((?:(?![A-Z][A-Z0-9_ /&]*:).+\n?)*)/m, (match, body) => (
    `LEARNING_OBJECTIVES:\n${normalizeListBlock(body)}\n\n`
  ));

  text = text.replace(/^WEEKLY_MATERIALS:\n((?:(?![A-Z][A-Z0-9_ /&]*:).+\n?)*)/m, (match, body) => (
    `WEEKLY_MATERIALS:\n${normalizeListBlock(body)}\n\n`
  ));

  text = text.replace(/^VOCABULARY:\n((?:(?![A-Z][A-Z0-9_ /&]*:).+\n?)*)/m, (match, body) => (
    `VOCABULARY:\n${normalizeListBlock(body)}\n\n`
  ));

  text = text.replace(/^BOOKS:\n((?:(?![A-Z][A-Z0-9_ /&]*:).+\n?)*)/m, (match, body) => {
    const lines = String(body).split(/\r?\n/).map(normalizeBookLine).filter(Boolean);
    return `BOOKS:\n${lines.join("\n")}\n\n`;
  });

  text = text.replace(/^CATEGORY:\n([^\n]+)$/gim, (match, cat) => `CATEGORY:\n${normalizeCategory(cat)}`);
  text = enrichActivityBlocks(text);
  return `${text.trim()}\n`;
}

function splitRawLessons(raw) {
  const cleaned = String(raw || "")
    .replace(/\r\n/g, "\n")
    .replace(/\nNext\s*\n/gi, "\n\n")
    .replace(/\nNext\s*$/gi, "");
  return cleaned
    .split(/\n(?=TITLE:)/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => /^TITLE:/im.test(chunk));
}

function extractTitle(text) {
  const match = String(text).match(/^TITLE:\s*\n?([^\n]+)/im);
  return match ? match[1].trim() : "Untitled";
}

function countActivities(plan) {
  return ["monday", "tuesday", "wednesday", "thursday", "friday"]
    .reduce((sum, day) => sum + (plan.dailyPlans?.[day]?.items?.length || 0), 0);
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
  assert(fs.existsSync(RAW_PATH), `Missing raw paste: ${RAW_PATH}`);
  const raw = fs.readFileSync(RAW_PATH, "utf8");
  const chunks = splitRawLessons(raw);
  assert(chunks.length === 10, `Expected 10 lesson plans, found ${chunks.length}`);

  fs.mkdirSync(PRO_BATCH2_IMPORT_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });

  const lessons = [];
  const parseResults = [];

  for (const chunk of chunks) {
    const title = extractTitle(chunk);
    const stableId = STABLE_BY_TITLE[title];
    assert(stableId, `No stable ID for title: ${title}`);
    const target = PRESCHOOL_PRO_BATCH2_IMPORT_TARGETS.find((item) => item.stableId === stableId);
    assert(target, `No import target for title: ${title}`);
    const file = target.file;
    const prefix = stableId.replace(/^cur-lp-/, "");
    const normalized = normalizeLessonText(chunk);
    const outPath = path.join(PRO_BATCH2_IMPORT_DIR, file);
    fs.writeFileSync(outPath, normalized, "utf8");

    const parsed = parseCurriculumLessonPlanImport(normalized, { existingItemIds: new Map() });
    parseResults.push({
      file,
      title,
      ok: parsed.ok,
      errors: parsed.errors || [],
      activities: countActivities(parsed.data || {}),
    });

    if (!parsed.ok) {
      console.error(`PARSE FAIL: ${title}`);
      (parsed.errors || []).forEach((err) => console.error(`  - ${err}`));
    } else {
      console.log(`OK parse: ${title} (${countActivities(parsed.data)} activities)`);
    }

    lessons.push({ title, file, stableId, prefix, normalized, parsed });
  }

  const failedParse = parseResults.filter((item) => !item.ok);
  assert(failedParse.length === 0, `${failedParse.length} lesson(s) failed to parse.`);

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
      assert(lesson.parsed.ok, `Parse failed for ${lesson.title}`);
      const id = lesson.stableId;
      const prefix = lesson.prefix;
      const dailyPlans = {};
      ["monday", "tuesday", "wednesday", "thursday", "friday"].forEach((day) => {
        dailyPlans[day] = {
          items: (lesson.parsed.data.dailyPlans?.[day]?.items || []).map((item, index) => ({
            ...item,
            itemId: `item-${prefix}-${day}-${index + 1}`,
          })),
        };
      });

      const plan = {
        ...lesson.parsed.data,
        id,
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
      assert(save.status === 200 && save.json?.lessonPlan?.id, `Save failed for ${plan.title}: ${save.status} ${save.text?.slice(0, 300)}`);

      expectedUpdatedAt = save.json.siteContentUpdatedAt || expectedUpdatedAt;
      const linked = (save.json.activities || []).filter(
        (item) => item.lessonPlanId === id && item.status !== "archived",
      );
      const activityIds = save.json.lessonPlan?.activityIds || [];

      imported.push({
        id,
        title: save.json.lessonPlan.title,
        plan: save.json.lessonPlan.plan,
        status: save.json.lessonPlan.status,
        activitiesSynced: linked.length,
        activityIds: activityIds.length,
      });
      console.log(`  ✓ saved with ${linked.length} Activity Library entries (${activityIds.length} linked IDs)`);
      assert(linked.length > 0, `${plan.title}: expected synced activities`);
      assert(linked.length === activityIds.length, `${plan.title}: activity sync mismatch`);
      assert(linked.every((item) => item.status === "published"), `${plan.title}: activities must be published`);
    }

    const verify = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    const curriculum = verify.json.siteContent?.curriculum || {};
    const savedActivities = (curriculum.activities || []).filter((activity) => (
      imported.some((item) => item.id === activity.lessonPlanId) && activity.status === "published"
    ));

    const report = {
      importedAt: new Date().toISOString(),
      target: useRemote ? BASE : `local:${LOCAL_PORT}`,
      lessonPlanCount: imported.length,
      activityCount: savedActivities.length,
      plans: imported,
      parseResults,
    };
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

    console.log("\n=== IMPORT COMPLETE ===");
    console.log(`Lesson plans: ${imported.length}`);
    console.log(`Activities in Activity Library: ${savedActivities.length}`);
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
