#!/usr/bin/env node
/**
 * Regression: curriculum lesson plan save for Phase 2F Infant Soft Sounds import.
 * Covers activity sync, idempotent re-save, and 409 retry with refreshed updatedAt.
 * Run: node scripts/test-curriculum-lesson-plan-save.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 4530 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, "server/data/launch-store.json");
const IMPORT_PATH = path.join(ROOT, "scripts/curriculum-phase-2f-imports/01-infant-soft-sounds-free.txt");
const ADMIN = {
  email: "lesson-save-test@example.com",
  password: "lesson-save-test-pass",
  code: "lesson-save-test-code",
};
const PLAY_ACTIVITY_CATEGORIES = [
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
];
const LEARNING_DOMAINS = [
  "Social Emotional",
  "Language & Literacy",
  "Math",
  "Science",
  "Physical Development",
  "Creative Arts",
];

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
    if (payload) req.write(payload);
    req.end();
  });
}

function waitForHealth(child, timeoutMs = 15000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (child.exitCode !== null) {
        reject(new Error(`Server exited early with code ${child.exitCode}`));
        return;
      }
      try {
        const res = await requestJson("GET", "/api/health");
        if (res.status === 200 && res.json?.ok) {
          resolve();
          return;
        }
      } catch {
        // retry
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error("Timed out waiting for server health"));
        return;
      }
      setTimeout(tick, 200);
    };
    tick();
  });
}

function startServer() {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.rmSync(STORE_PATH, { force: true });
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      ADMIN_NAME: "Lesson Save Test",
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr.on("data", () => {});
  child.stdout.on("data", () => {});
  return child;
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

function normalizedShortText(value, max = 240) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizedMultilineText(value, max = 12000) {
  return String(value || "").replace(/\r\n?/g, "\n").trim().slice(0, max);
}

function parseActivityBlock(block) {
  const lines = String(block || "").split(/\r?\n/);
  const activity = {
    activityCategory: "Open-Ended Exploration",
    title: "",
    description: "",
    materials: "",
    steps: "",
    learningGoals: [],
  };
  let currentField = "";
  lines.forEach((rawLine) => {
    const trimmed = rawLine.trim();
    if (!trimmed) return;
    const categoryMatch = trimmed.match(/^Category:\s*(.+)$/i);
    const titleMatch = trimmed.match(/^Title:\s*(.+)$/i);
    const descriptionMatch = trimmed.match(/^Description:\s*(.+)$/i);
    const materialsMatch = trimmed.match(/^Materials:\s*(.+)$/i);
    const stepsMatch = trimmed.match(/^Steps:\s*$/i);
    const goalsMatch = trimmed.match(/^Learning Goals:\s*$/i);
    if (categoryMatch) {
      currentField = "category";
      activity.activityCategory = normalizedShortText(categoryMatch[1]);
      return;
    }
    if (titleMatch) {
      currentField = "title";
      activity.title = normalizedShortText(titleMatch[1]);
      return;
    }
    if (descriptionMatch) {
      currentField = "description";
      activity.description = normalizedMultilineText(descriptionMatch[1]);
      return;
    }
    if (materialsMatch) {
      currentField = "materials";
      activity.materials = normalizedMultilineText(materialsMatch[1]);
      return;
    }
    if (stepsMatch) {
      currentField = "steps";
      return;
    }
    if (goalsMatch) {
      currentField = "learningGoals";
      return;
    }
    if (currentField === "steps") {
      activity.steps = [activity.steps, trimmed.replace(/^\d+\.\s*/, "")].filter(Boolean).join("\n");
      return;
    }
    if (currentField === "learningGoals") {
      const goal = trimmed.replace(/^[-*•]\s*/, "").trim();
      if (goal) activity.learningGoals.push(goal);
    }
  });
  if (!PLAY_ACTIVITY_CATEGORIES.includes(activity.activityCategory)) {
    throw new Error(`Invalid category ${activity.activityCategory}`);
  }
  return activity.title ? activity : null;
}

function parseImportList(text, parts = 2) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*•]\s*/, "").split("|").map((part) => part.trim()))
    .map((chunks) => {
      if (parts === 3) {
        const [title, author, notes] = chunks;
        return title ? { title, author: author || "", notes: notes || "" } : null;
      }
      const [title, notes] = chunks;
      return title ? { title, notes: notes || "" } : null;
    })
    .filter(Boolean);
}

function parseLessonImport(text) {
  const sections = {};
  const parts = String(text || "").split(/===([A-Z_]+)===/);
  for (let i = 1; i < parts.length; i += 2) {
    const key = parts[i].trim().toUpperCase();
    if (key) sections[key] = (parts[i + 1] || "").trim();
  }
  const dailyPlans = {};
  let activityCount = 0;
  ["monday", "tuesday", "wednesday", "thursday", "friday"].forEach((day) => {
    const blocks = String(sections[day.toUpperCase()] || "").split(/---ACTIVITY---/i).slice(1);
    const items = blocks.map((block) => parseActivityBlock(block)).filter(Boolean).map((item) => ({
      ...item,
      itemId: `item-${crypto.randomBytes(6).toString("hex")}`,
    }));
    activityCount += items.length;
    dailyPlans[day] = { items };
  });
  return {
    title: normalizedShortText(sections.TITLE),
    age: normalizedShortText(sections.AGE_GROUP),
    theme: normalizedShortText(sections.THEME),
    plan: "Free",
    status: "draft",
    learningDomains: String(sections.LEARNING_DOMAINS || "")
      .split(/[,;\n]/)
      .map((item) => normalizedShortText(item))
      .filter((item) => LEARNING_DOMAINS.includes(item)),
    weeklyOverview: normalizedMultilineText(sections.WEEKLY_OVERVIEW),
    objectives: normalizedMultilineText(sections.OBJECTIVES),
    familyConnection: normalizedMultilineText(sections.FAMILY_CONNECTION),
    weeklyMaterials: normalizedMultilineText(sections.WEEKLY_MATERIALS),
    vocabularyWords: normalizedMultilineText(sections.VOCABULARY),
    observationOpportunities: normalizedMultilineText(sections.OBSERVATIONS),
    adaptations: normalizedMultilineText(sections.ADAPTATIONS),
    books: parseImportList(sections.BOOKS, 3),
    songs: parseImportList(sections.SONGS, 2),
    dailyPlans,
    _activityCount: activityCount,
  };
}

async function main() {
  const child = startServer();
  try {
    await waitForHealth(child);
    const login = await requestJson("POST", "/api/admin/login", ADMIN);
    assert(login.status === 200 && login.json?.token, "Login failed");
    const token = login.json.token;

    // Stamp siteContent.updatedAt the way production already has after prior saves.
    const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    const touch = await requestJson("POST", "/api/admin/site-content", {
      adminToken: token,
      siteContent: {
        ...bootstrap.json.siteContent,
        updatedAt: bootstrap.json.siteContent.updatedAt || "",
      },
    });
    assert(touch.status === 200, `Touch failed: ${touch.status}`);
    let expectedUpdatedAt = touch.json.siteContent.updatedAt;
    assert(expectedUpdatedAt, "expectedUpdatedAt missing after touch");

    const parsed = parseLessonImport(fs.readFileSync(IMPORT_PATH, "utf8"));
    assert(parsed.title === "Infant Soft Sounds & Faces", "Unexpected title");
    assert(parsed._activityCount === 8, `Expected 8 activities, parsed ${parsed._activityCount}`);
    const lessonPlanId = `cur-lp-save-test-${crypto.randomBytes(4).toString("hex")}`;
    const lessonPlan = { ...parsed, id: lessonPlanId };

    console.log("1) Empty expectedUpdatedAt returns 409 while server stamp exists");
    const conflict = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken: token,
      expectedUpdatedAt: "",
      lessonPlan,
    });
    assert(conflict.status === 409, `Expected 409, got ${conflict.status}`);
    assert(conflict.json.conflict === true, "Conflict flag missing");
    assert(conflict.json.siteContentUpdatedAt, "Conflict payload missing siteContentUpdatedAt");

    console.log("2) Retry with refreshed expectedUpdatedAt saves plan + 8 activities");
    expectedUpdatedAt = conflict.json.siteContentUpdatedAt;
    const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken: token,
      expectedUpdatedAt,
      lessonPlan,
    });
    assert(save.status === 200, `Save failed: ${save.status} ${save.text}`);
    const activities = (save.json.activities || []).filter((item) => item.status !== "archived");
    assert(activities.length === 8, `Expected 8 activities, got ${activities.length}`);
    assert(save.json.lessonPlan?.id === lessonPlanId, "Lesson id mismatch");
    assert((save.json.lessonPlan.activityIds || []).length === 8, "Lesson activityIds mismatch");
    activities.forEach((activity) => {
      assert(activity.lessonPlanId === lessonPlanId, "Activity missing parent link");
    });
    const firstIds = activities.map((item) => item.id).sort();
    expectedUpdatedAt = save.json.siteContentUpdatedAt;

    console.log("3) Second save keeps the same 8 activity IDs");
    const again = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken: token,
      expectedUpdatedAt,
      lessonPlan: {
        ...save.json.lessonPlan,
        dailyPlans: lessonPlan.dailyPlans,
      },
    });
    assert(again.status === 200, `Re-save failed: ${again.status} ${again.text}`);
    const againActs = (again.json.activities || []).filter((item) => item.status !== "archived");
    assert(againActs.length === 8, `Expected 8 activities on re-save, got ${againActs.length}`);
    const secondIds = againActs.map((item) => item.id).sort();
    assert(JSON.stringify(firstIds) === JSON.stringify(secondIds), "Activity IDs changed on re-save");

    console.log("4) Reload preserves lesson + activities");
    const reload = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    assert(reload.status === 200, "Reload failed");
    const storedPlan = (reload.json.siteContent.curriculum.lessonPlans || []).find((item) => item.id === lessonPlanId);
    const storedActs = (reload.json.siteContent.curriculum.activities || []).filter(
      (item) => item.lessonPlanId === lessonPlanId && item.status !== "archived",
    );
    assert(storedPlan, "Lesson missing after reload");
    assert(storedActs.length === 8, `Expected 8 stored activities, got ${storedActs.length}`);

    console.log("\nAll curriculum lesson plan save checks passed.");
  } catch (error) {
    console.error("\nFAIL:", error.message);
    process.exitCode = 1;
  } finally {
    await stopServer(child);
  }
}

main();
