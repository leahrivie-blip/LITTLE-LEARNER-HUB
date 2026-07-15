#!/usr/bin/env node
/**
 * Normalize + import Toddler Pro batch 1 (7 plans) with Activity Library sync.
 *
 * Local (default): ephemeral server
 * Production: SITE_URL + ADMIN_EMAIL + ADMIN_PASSWORD + ADMIN_ACCESS_CODE
 *
 * Run:
 *   node scripts/normalize-and-import-toddler-pro-batch1.js
 *   node scripts/normalize-and-import-toddler-pro-batch1.js --write-only
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
const {
  TODDLER_PRO_IMPORT_TARGETS,
  TODDLER_PRO_IMPORT_DIR,
} = require("./curriculum-toddler-import-targets.js");

const ROOT = path.join(__dirname, "..");
const RAW_PATH = path.join(__dirname, "curriculum-import-samples/toddler-pro-batch1-jul2026/raw-paste.txt");
const REPORT_PATH = path.join(__dirname, "data/toddler-pro-batch1-import-report.json");
const WRITE_ONLY = process.argv.includes("--write-only");

const DOMAIN_ALIASES = {
  "social emotional development": "Social Emotional",
  "social emotional": "Social Emotional",
  "science & discovery": "Science",
  "science discovery": "Science",
  "language and literacy": "Language & Literacy",
  "language & literacy": "Language & Literacy",
  "physical development": "Physical Development",
  "creative arts": "Creative Arts",
  "early math concepts": "Math",
  mathematics: "Math",
  "math development": "Math",
};

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

const STABLE_BY_TITLE = Object.fromEntries(
  TODDLER_PRO_IMPORT_TARGETS.map((target) => [target.title, target]),
);

const remoteUrl = String(process.env.SITE_URL || "").trim();
const useRemote = Boolean(remoteUrl && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD && process.env.ADMIN_ACCESS_CODE);
const LOCAL_PORT = 4500 + Math.floor(Math.random() * 200);
const BASE = useRemote ? remoteUrl.replace(/\/$/, "") : `http://127.0.0.1:${LOCAL_PORT}`;
const ADMIN = useRemote
  ? {
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
      code: process.env.ADMIN_ACCESS_CODE,
    }
  : {
      email: "toddler-pro-import@example.com",
      password: "toddler-pro-import-pass",
      code: "toddler-pro-import-code",
    };
const STORE_PATH = path.join(os.tmpdir(), `llh-toddler-pro-import-${crypto.randomBytes(4).toString("hex")}.json`);

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
      ADMIN_NAME: "Toddler Pro Import",
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

function normalizeListLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*•]\s*/, ""))
    .filter(Boolean);
}

function normalizeDomains(text) {
  return normalizeListLines(text)
    .map((line) => DOMAIN_ALIASES[line.toLowerCase()] || line)
    .filter(Boolean);
}

function getField(block, field) {
  // Avoid RegExp `m` + `$` (line-end truncation). Match labels after start/newline only.
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const blockText = String(block || "");
  const multiline = blockText.match(
    new RegExp(`(?:^|\\n)${escaped}:\\s*\\n([\\s\\S]*?)(?=\\n[A-Z][A-Z0-9_ /&]*:|$)`),
  );
  if (multiline) return multiline[1].trim();
  const inline = blockText.match(new RegExp(`(?:^|\\n)${escaped}:\\s*([^\\n]+)`));
  return inline ? inline[1].trim() : "";
}

function materialsForActivity(name, category, weeklyMaterials) {
  const pool = String(weeklyMaterials || "")
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const nameLower = name.toLowerCase();
  const picked = pool.filter((item) => {
    const token = item.toLowerCase();
    return nameLower.split(/\s+/).some((word) => word.length > 3 && token.includes(word.slice(0, 5)));
  }).slice(0, 4);

  const defaults = {
    "Open-Ended Exploration": ["Theme toys/figurines", "Baskets", "Picture cards"],
    "Sensory Play": ["Sensory bin", "Scoops", "Loose parts"],
    "Fine Motor": ["Play dough or crayons", "Small manipulatives", "Paper"],
    "Gross Motor": ["Cones or mats", "Open floor space", "Soft obstacles"],
    "Music & Movement": ["Scarves or music", "Open movement space"],
    "Dramatic Play": ["Pretend-play props", "Costumes or badges", "Theme accessories"],
    Art: ["Paper", "Paint or crayons", "Glue"],
  }[category] || ["Theme materials", "Open-ended props"];

  const merged = [...picked, ...defaults].filter((item, index, arr) => arr.indexOf(item) === index);
  return merged.slice(0, 6).join("\n");
}

function directionsForActivity(name, category, theme) {
  const label = name.replace(/\s+/g, " ").trim();
  const themeLabel = theme || "the week";
  const byCategory = {
    "Open-Ended Exploration": [
      `Invite toddlers to explore ${label} with hands-on materials related to ${themeLabel}.`,
      "Stay nearby and narrate what children notice using simple theme words.",
      "Offer choices and follow each child's interest for a few minutes at a time.",
      "Encourage pointing, naming, and short conversations about discoveries.",
    ],
    "Sensory Play": [
      `Set out a toddler-safe sensory experience for ${label}.`,
      "Model gentle scooping, pouring, and exploring with fingers or tools.",
      "Name textures, colors, and theme vocabulary as children play.",
      "Rotate materials if interest fades and keep play short and calm.",
    ],
    "Fine Motor": [
      `Offer materials for ${label} that invite pinching, placing, sticking, or scribbling.`,
      "Demonstrate one simple action, then invite toddlers to try.",
      "Celebrate effort and keep tools large enough for little hands.",
      "Support turn-taking when children want the same material.",
    ],
    "Gross Motor": [
      `Create a short movement path or challenge for ${label}.`,
      "Show the movement once, then invite toddlers to try at their own pace.",
      "Offer hand support or a simpler path for children who need it.",
      "Cheer on attempts and keep the course playful, not competitive.",
    ],
    "Music & Movement": [
      `Start ${label} with a familiar song, chant, or movement cue.`,
      "Invite toddlers to move their bodies with the music and theme ideas.",
      "Mirror children's movements and add simple vocabulary.",
      "Allow sitting dancers and standing movers to participate together.",
    ],
    "Dramatic Play": [
      `Set up a pretend-play area for ${label} with a few clear props.`,
      "Model a short role (helper, keeper, captain) and invite children in.",
      "Use simple language to support caregiving, teamwork, and problem-solving.",
      "Follow the children's storyline and keep roles flexible.",
    ],
    Art: [
      `Invite toddlers to create during ${label} with process-focused art materials.`,
      "Offer choices and model one simple technique.",
      "Talk about colors, shapes, and theme ideas as children create.",
      "Display finished work and celebrate each child's process.",
    ],
  };
  return (byCategory[category] || byCategory["Open-Ended Exploration"]).join("\n");
}

function teacherRoleFor(category) {
  const roles = {
    "Open-Ended Exploration": "Observe, narrate discoveries, and introduce theme vocabulary without directing every action.",
    "Sensory Play": "Supervise closely, model gentle exploration, and support sensory preferences.",
    "Fine Motor": "Offer hand-over-hand support when wanted and keep materials accessible on low trays.",
    "Gross Motor": "Spot children for safety, adapt the challenge level, and celebrate every attempt.",
    "Music & Movement": "Lead with energy, mirror children's movements, and keep transitions playful.",
    "Dramatic Play": "Join play briefly as a co-player, then step back so toddlers lead the story.",
    Art: "Focus on process over product and offer descriptive encouragement.",
  };
  return roles[category] || "Support participation, language, and safe exploration.";
}

function learningGoalsFor(name, category, theme) {
  return [
    `Engage in ${name} through toddler-friendly ${category.toLowerCase()}.`,
    `Use theme vocabulary related to ${theme}.`,
    "Practice social interaction, curiosity, and motor skills during play.",
  ].join("\n");
}

function formatSection(label, value) {
  return `${label}:\n${String(value || "").trim()}\n`;
}

function convertCompactLesson(rawChunk) {
  const text = String(rawChunk || "").trim();
  const title = getField(text, "TITLE") || extractTitle(text);
  const ageGroup = getField(text, "AGE GROUP") || getField(text, "AGE_GROUP") || "Toddler";
  const theme = getField(text, "THEME") || title;
  const plan = getField(text, "PLAN") || "Pro";
  const domains = normalizeDomains(getField(text, "LEARNING DOMAINS") || getField(text, "LEARNING_DOMAINS"));
  const overview = getField(text, "WEEKLY OVERVIEW") || getField(text, "WEEKLY_OVERVIEW");
  const objectives = normalizeListLines(
    getField(text, "WEEKLY OBJECTIVES")
      || getField(text, "LEARNING OBJECTIVES")
      || getField(text, "LEARNING_OBJECTIVES"),
  );
  const weeklyMaterialsRaw = getField(text, "WEEKLY MATERIALS") || getField(text, "WEEKLY_MATERIALS");
  const weeklyMaterials = normalizeListLines(weeklyMaterialsRaw.replace(/,\s*/g, "\n"));
  const vocabulary = normalizeListLines((getField(text, "VOCABULARY") || "").replace(/,\s*/g, "\n"));
  const books = normalizeListLines(getField(text, "BOOKS"));
  const songs = normalizeListLines(getField(text, "SONGS"));
  const family = getField(text, "FAMILY CONNECTION") || getField(text, "FAMILY_CONNECTION");
  const observations = getField(text, "OBSERVATION OPPORTUNITIES") || getField(text, "OBSERVATION_OPPORTUNITIES");
  const adaptations = getField(text, "ADAPTATIONS");

  const dayThemes = {};
  const dayBlocks = {};
  const dayRe = /^(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY):\s*(.*)$/gim;
  const matches = [...text.matchAll(dayRe)];
  for (let i = 0; i < matches.length; i += 1) {
    const day = matches[i][1].toUpperCase();
    const dayTitle = String(matches[i][2] || "").trim();
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const body = text.slice(start, end).trim();
    dayThemes[day.toLowerCase()] = dayTitle;
    dayBlocks[day] = body;
  }

  const parts = [
    formatSection("TITLE", title),
    formatSection("AGE_GROUP", ageGroup),
    formatSection("THEME", theme),
    formatSection("PLAN", plan),
    formatSection("STATUS", "published"),
    formatSection("LEARNING_DOMAINS", domains.join("\n")),
    formatSection("WEEKLY_OVERVIEW", overview),
    formatSection("LEARNING_OBJECTIVES", objectives.join("\n")),
    formatSection("WEEKLY_MATERIALS", weeklyMaterials.join("\n")),
    formatSection("VOCABULARY", vocabulary.join("\n")),
    formatSection("BOOKS", books.join("\n")),
    formatSection("SONGS", songs.join("\n")),
    formatSection("FAMILY_CONNECTION", family),
    formatSection("OBSERVATION_OPPORTUNITIES", observations),
    formatSection("ADAPTATIONS", adaptations),
  ];

  ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"].forEach((day) => {
    const body = dayBlocks[day] || "";
    const activityMatches = [...body.matchAll(/Activity Name:\s*(.+)\nCategory:\s*(.+)/gi)];
    parts.push(`${day}:\n`);
    activityMatches.forEach((match) => {
      const name = match[1].trim();
      const categoryRaw = match[2].trim();
      const category = VALID_CATEGORIES.has(categoryRaw) ? categoryRaw : "Open-Ended Exploration";
      const description = `Toddlers explore ${name} during our ${theme} week through ${category.toLowerCase()}.`;
      const materials = materialsForActivity(name, category, weeklyMaterialsRaw);
      const directions = directionsForActivity(name, category, theme);
      const teacherRole = teacherRoleFor(category);
      const goals = learningGoalsFor(name, category, theme);
      parts.push(
        [
          "ACTIVITY_NAME:",
          name,
          "",
          "CATEGORY:",
          category,
          "",
          "OBJECTIVE:",
          `Practice ${category.toLowerCase()} skills during ${name}.`,
          "",
          "DESCRIPTION:",
          description,
          "",
          "MATERIALS:",
          materials,
          "",
          "SETUP:",
          `Prepare a toddler-ready space and materials for ${name}.`,
          "",
          "DIRECTIONS:",
          directions,
          "",
          "TEACHER_ROLE:",
          teacherRole,
          "",
          "LEARNING_GOALS:",
          goals,
          "",
          "OBSERVATION_OPPORTUNITIES:",
          "Observe engagement, theme vocabulary, motor skills, and social interaction.",
          "",
        ].join("\n"),
      );
    });
  });

  return {
    title,
    dayThemes,
    text: `${parts.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`,
  };
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
  assert(chunks.length === 7, `Expected 7 lesson plans, found ${chunks.length}`);

  fs.mkdirSync(TODDLER_PRO_IMPORT_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });

  const lessons = [];
  const parseResults = [];

  for (const chunk of chunks) {
    const converted = convertCompactLesson(chunk);
    const target = STABLE_BY_TITLE[converted.title];
    assert(target, `No import target for title: ${converted.title}`);
    const outPath = path.join(TODDLER_PRO_IMPORT_DIR, target.file);
    fs.writeFileSync(outPath, converted.text, "utf8");

    // Keep day themes aligned with targets (source of truth from paste).
    Object.assign(target.dayThemes, converted.dayThemes);

    const parsed = parseCurriculumLessonPlanImport(converted.text, { existingItemIds: new Map() });
    const activityCount = countActivities(parsed.data || {});
    parseResults.push({
      file: target.file,
      title: converted.title,
      ok: parsed.ok,
      errors: parsed.errors || [],
      activities: activityCount,
      dayThemes: converted.dayThemes,
    });

    if (!parsed.ok) {
      console.error(`PARSE FAIL: ${converted.title}`);
      (parsed.errors || []).forEach((err) => console.error(`  - ${err}`));
    } else {
      console.log(`OK parse: ${converted.title} (${activityCount} activities)`);
      assert(activityCount === 25, `${converted.title}: expected 25 activities, got ${activityCount}`);
    }

    lessons.push({
      title: converted.title,
      file: target.file,
      stableId: target.stableId,
      prefix: target.stableId.replace(/^cur-lp-/, ""),
      dayThemes: converted.dayThemes,
      normalized: converted.text,
      parsed,
    });
  }

  const failedParse = parseResults.filter((item) => !item.ok);
  assert(failedParse.length === 0, `${failedParse.length} lesson(s) failed to parse.`);

  if (WRITE_ONLY) {
    const report = {
      importedAt: new Date().toISOString(),
      mode: "write-only",
      lessonPlanCount: lessons.length,
      parseResults,
    };
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log("\nWrote import files only (no API import).");
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
      assert(lesson.parsed.ok, `Parse failed for ${lesson.title}`);
      const id = lesson.stableId;
      const prefix = lesson.prefix;
      const dailyPlans = {};
      ["monday", "tuesday", "wednesday", "thursday", "friday"].forEach((day) => {
        dailyPlans[day] = {
          theme: lesson.dayThemes[day] || "",
          items: (lesson.parsed.data.dailyPlans?.[day]?.items || []).map((item, index) => ({
            ...item,
            itemId: `item-${prefix}-${day}-${index + 1}`,
          })),
        };
      });

      const plan = {
        ...lesson.parsed.data,
        id,
        age: "Toddler",
        ageBucket: "Toddler",
        plan: "Pro",
        status: "published",
        dailyPlans,
      };

      console.log(`Saving: ${plan.title} [Toddler/Pro/published] id=${id}`);
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
        age: save.json.lessonPlan.age,
        plan: save.json.lessonPlan.plan,
        status: save.json.lessonPlan.status,
        activitiesSynced: linked.length,
        activityIds: activityIds.length,
      });
      console.log(`  ✓ saved with ${linked.length} Activity Library entries (${activityIds.length} linked IDs)`);
      assert(linked.length === 25, `${plan.title}: expected 25 synced activities, got ${linked.length}`);
      assert(linked.length === activityIds.length, `${plan.title}: activity sync mismatch`);
      assert(linked.every((item) => item.status === "published"), `${plan.title}: activities must be published`);
      assert(String(save.json.lessonPlan.age || "").includes("Toddler"), `${plan.title}: age must be Toddler`);
      assert(save.json.lessonPlan.plan === "Pro", `${plan.title}: plan must be Pro`);
    }

    const verify = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    const curriculum = verify.json.siteContent?.curriculum || {};
    const savedActivities = (curriculum.activities || []).filter((activity) => (
      imported.some((item) => item.id === activity.lessonPlanId) && activity.status === "published"
    ));
    const savedPlans = (curriculum.lessonPlans || []).filter((plan) => (
      imported.some((item) => item.id === plan.id)
    ));

    const report = {
      importedAt: new Date().toISOString(),
      target: useRemote ? BASE : `local:${LOCAL_PORT}`,
      lessonPlanCount: imported.length,
      activityCount: savedActivities.length,
      plans: imported,
      parseResults,
      verification: {
        toddlerProPlans: savedPlans.map((plan) => ({
          id: plan.id,
          title: plan.title,
          age: plan.age,
          plan: plan.plan,
          status: plan.status,
          activityIds: (plan.activityIds || []).length,
        })),
      },
    };
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

    console.log("\n=== IMPORT COMPLETE ===");
    console.log(`Lesson plans: ${imported.length}`);
    console.log(`Activities in Activity Library: ${savedActivities.length}`);
    imported.forEach((item) => console.log(`- ${item.title} → ${item.activitiesSynced} activities`));
    assert(savedActivities.length === 175, `Expected 175 Activity Library entries, got ${savedActivities.length}`);
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("\nFAIL:", error.message);
  process.exitCode = 1;
});
