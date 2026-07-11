#!/usr/bin/env node
/**
 * Phase B: curriculum schema persistence for v2 premium daily/activity fields.
 * Run: npm run test:curriculum-schema
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const crypto = require("crypto");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");

const ROOT = path.join(__dirname, "..");
const PORT = 4540 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, "server/data/launch-store.json");
const V2_SAMPLE = path.join(ROOT, "scripts/curriculum-import-samples/premium-garden-scientists-v2.txt");
const V1_SAMPLE = path.join(ROOT, "scripts/curriculum-phase-2f-imports/01-infant-soft-sounds-free.txt");
const ADMIN = {
  email: "schema-test@example.com",
  password: "schema-test-pass",
  code: "schema-test-code",
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
      ADMIN_NAME: "Schema Test",
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

async function loginAdmin() {
  const login = await requestJson("POST", "/api/admin/login", ADMIN);
  assert(login.status === 200 && login.json?.token, "Login failed");
  return login.json.token;
}

async function bootstrapUpdatedAt(token) {
  const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  const touch = await requestJson("POST", "/api/admin/site-content", {
    adminToken: token,
    siteContent: {
      ...bootstrap.json.siteContent,
      updatedAt: bootstrap.json.siteContent.updatedAt || "",
    },
  });
  assert(touch.status === 200, `Touch failed: ${touch.status}`);
  return touch.json.siteContent.updatedAt;
}

async function saveLessonPlan(token, expectedUpdatedAt, lessonPlan) {
  const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt,
    lessonPlan,
  });
  assert(save.status === 200, `Save failed: ${save.status} ${save.text}`);
  return save.json;
}

async function reloadCurriculum(token) {
  const reload = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  assert(reload.status === 200, "Reload failed");
  return reload.json.siteContent.curriculum;
}

function parseV2Premium() {
  const parsed = parseCurriculumLessonPlanImport(fs.readFileSync(V2_SAMPLE, "utf8"));
  assert(parsed.ok, parsed.errors.join(" "));
  const data = { ...parsed.data };
  delete data.dailyPlansCompat;
  delete data._formatVersion;
  delete data._activityCount;
  data.dailyPlans.tuesday.songs = [{ title: "Rain Song", notes: "Weather transition" }];
  return data;
}

function activeActivities(activities, lessonPlanId) {
  return (activities || []).filter((item) => item.lessonPlanId === lessonPlanId && item.status !== "archived");
}

function archivedActivities(activities, lessonPlanId) {
  return (activities || []).filter((item) => item.lessonPlanId === lessonPlanId && item.status === "archived");
}

async function main() {
  const child = startServer();
  try {
    await waitForHealth(child);
    const token = await loginAdmin();
    let expectedUpdatedAt = await bootstrapUpdatedAt(token);

    console.log("1) v2 premium plan parse → save → reload with extended daily structure");
    const premium = parseV2Premium();
    const premiumId = `cur-lp-schema-v2-${crypto.randomBytes(4).toString("hex")}`;
    const premiumPlan = { ...premium, id: premiumId };
    assert(premiumPlan.plan === "Pro", "plan should stay Pro");
    assert(premiumPlan.status === "draft", "status should stay draft");

    const firstSave = await saveLessonPlan(token, expectedUpdatedAt, premiumPlan);
    expectedUpdatedAt = firstSave.siteContentUpdatedAt;
    const monday = firstSave.lessonPlan.dailyPlans.monday;
    const soilActivity = monday.items.find((item) => item.title === "Soil Scientists Tray");
    assert(soilActivity, "Soil Scientists Tray missing");
    assert(monday.books[0]?.title === "Planting a Rainbow", "Monday book should stay on Monday");
    assert(monday.songs[0]?.title === "The Farmer Plants the Seeds", "Monday song should stay on Monday");
    assert(firstSave.lessonPlan.dailyPlans.tuesday.songs[0]?.title === "Rain Song", "Tuesday song should stay on Tuesday");
    assert(monday.circleTime[0]?.includes("seed tray"), "Circle time should persist");
    assert(monday.transitions[0]?.includes("cleanup song"), "Transitions should persist");
    assert(monday.outdoorPlay.includes("watering cans"), "Outdoor play should persist");
    assert(monday.observations[0]?.includes("sorting strategy"), "Observations should persist");
    assert(monday.safetyNotes.includes("water spills"), "Safety notes should persist");
    assert(soilActivity.teacherLanguage.includes("damp"), "Teacher language should persist exactly");
    assert(soilActivity.steps.includes("Invite children to scoop"), "Directions should persist exactly");
    assert(soilActivity.teacherRole.includes("Narrate texture"), "Teacher role should persist");
    assert(soilActivity.safetyNotes.includes("pasteurized soil"), "Activity safety notes should persist");
    assert(firstSave.lessonPlan.books[0]?.title === "The Tiny Seed", "Weekly books stay weekly");

    const reloaded = await reloadCurriculum(token);
    const storedPlan = reloaded.lessonPlans.find((item) => item.id === premiumId);
    assert(storedPlan, "Stored plan missing after reload");
    assert(storedPlan.dailyPlans.monday.theme === "Soil and Seeds Monday", "Daily theme persists");
    assert(storedPlan.dailyPlans.monday.books[0]?.title === "Planting a Rainbow", "Reloaded Monday book");
    assert(storedPlan.dailyPlans.tuesday.songs[0]?.title === "Rain Song", "Reloaded Tuesday song");
    assert(storedPlan.plan === "Pro" && storedPlan.status === "draft", "Plan/status unchanged on reload");

    console.log("2) Save twice does not duplicate Activity Library entries");
    const firstIds = activeActivities(firstSave.activities, premiumId).map((item) => item.id).sort();
    const secondSave = await saveLessonPlan(token, expectedUpdatedAt, storedPlan);
    expectedUpdatedAt = secondSave.siteContentUpdatedAt;
    const secondIds = activeActivities(secondSave.activities, premiumId).map((item) => item.id).sort();
    assert(JSON.stringify(firstIds) === JSON.stringify(secondIds), "Activity IDs changed on duplicate save");
    assert(secondIds.length === 3, `Expected 3 active activities, got ${secondIds.length}`);

    console.log("3) Rename activity title while keeping itemId updates same Activity Library entry");
    const renamedPlan = JSON.parse(JSON.stringify(storedPlan));
    const renameItem = renamedPlan.dailyPlans.monday.items.find((item) => item.title === "Soil Scientists Tray");
    const renameItemId = renameItem.itemId;
    const renameSourceKey = `${premiumId}:${renameItemId}`;
    const beforeRename = activeActivities(secondSave.activities, premiumId).find((item) => item.sourceKey === renameSourceKey);
    assert(beforeRename, "Activity before rename missing");
    renameItem.title = "Soil Texture Explorers";
    const renameSave = await saveLessonPlan(token, expectedUpdatedAt, renamedPlan);
    expectedUpdatedAt = renameSave.siteContentUpdatedAt;
    const afterRename = activeActivities(renameSave.activities, premiumId).find((item) => item.sourceKey === renameSourceKey);
    assert(afterRename, "Activity after rename missing");
    assert(afterRename.id === beforeRename.id, "Rename should keep the same Activity Library id");
    assert(afterRename.title === "Soil Texture Explorers", "Renamed title should sync to activity library");

    console.log("4) Two activities with the same title on the same day remain separate");
    const duplicateId = `cur-lp-schema-dup-${crypto.randomBytes(4).toString("hex")}`;
    const itemA = `item-${crypto.randomBytes(8).toString("hex")}`;
    const itemB = `item-${crypto.randomBytes(8).toString("hex")}`;
    const duplicatePlan = {
      id: duplicateId,
      title: "Duplicate Title Test",
      age: "Preschool",
      theme: "Test",
      plan: "Free",
      status: "draft",
      learningDomains: [],
      weeklyOverview: "",
      objectives: "",
      weeklyMaterials: "",
      vocabularyWords: "",
      observationOpportunities: "",
      adaptations: "",
      familyConnection: "",
      books: [],
      songs: [],
      dailyPlans: {
        monday: {
          theme: "",
          objectives: "",
          learningDomains: [],
          materials: "",
          vocabulary: "",
          books: [],
          songs: [],
          circleTime: [],
          transitions: [],
          outdoorPlay: "",
          familyConnection: "",
          observations: [],
          adaptations: "",
          safetyNotes: "",
          items: [
            {
              itemId: itemA,
              activityCategory: "Sensory Play",
              title: "Matching Blocks",
              materials: "Blocks A",
              setup: "Setup A",
              steps: "1. Do A",
              learningGoals: ["Goal A"],
            },
            {
              itemId: itemB,
              activityCategory: "Fine Motor",
              title: "Matching Blocks",
              materials: "Blocks B",
              setup: "Setup B",
              steps: "1. Do B",
              learningGoals: ["Goal B"],
            },
          ],
        },
        tuesday: { items: [] },
        wednesday: { items: [] },
        thursday: { items: [] },
        friday: { items: [] },
      },
      resourceIds: [],
      activityIds: [],
      createdAt: "",
      updatedAt: "",
    };
    const dupSave = await saveLessonPlan(token, expectedUpdatedAt, duplicatePlan);
    expectedUpdatedAt = dupSave.siteContentUpdatedAt;
    const dupActs = activeActivities(dupSave.activities, duplicateId);
    assert(dupActs.length === 2, `Expected 2 duplicate-title activities, got ${dupActs.length}`);
    assert(new Set(dupActs.map((item) => item.id)).size === 2, "Duplicate titles should not overwrite each other");
    assert(dupActs.some((item) => item.materials === "Blocks A"), "First duplicate activity preserved");
    assert(dupActs.some((item) => item.materials === "Blocks B"), "Second duplicate activity preserved");

    console.log("5) Removing an activity archives the linked Activity Library entry");
    const removePlan = JSON.parse(JSON.stringify(dupSave.lessonPlan));
    removePlan.dailyPlans.monday.items = removePlan.dailyPlans.monday.items.filter((item) => item.itemId !== itemB);
    const removeSave = await saveLessonPlan(token, expectedUpdatedAt, removePlan);
    expectedUpdatedAt = removeSave.siteContentUpdatedAt;
    const activeAfterRemove = activeActivities(removeSave.activities, duplicateId);
    const archivedAfterRemove = archivedActivities(removeSave.activities, duplicateId);
    assert(activeAfterRemove.length === 1, "One activity should remain active");
    assert(archivedAfterRemove.length === 1, "Removed activity should be archived");
    assert(archivedAfterRemove[0].itemId === itemB, "Archived activity should match removed itemId");

    console.log("6) v1 sample import still saves correctly");
    const v1Parsed = parseCurriculumLessonPlanImport(fs.readFileSync(V1_SAMPLE, "utf8"));
    assert(v1Parsed.ok, v1Parsed.errors.join(" "));
    const v1Id = `cur-lp-schema-v1-${crypto.randomBytes(4).toString("hex")}`;
    const v1Plan = { ...v1Parsed.data, id: v1Id };
    delete v1Plan.dailyPlansCompat;
    delete v1Plan._formatVersion;
    delete v1Plan._activityCount;
    const v1Save = await saveLessonPlan(token, expectedUpdatedAt, v1Plan);
    expectedUpdatedAt = v1Save.siteContentUpdatedAt;
    assert(v1Save.lessonPlan.title === "Infant Soft Sounds & Faces", "v1 title preserved");
    assert(activeActivities(v1Save.activities, v1Id).length === 8, "v1 activity count preserved");
    const v1Reload = await reloadCurriculum(token);
    const v1Stored = v1Reload.lessonPlans.find((item) => item.id === v1Id);
    assert(v1Stored.dailyPlans.monday.items.length > 0, "v1 monday items present");
    assert(Array.isArray(v1Stored.dailyPlans.monday.books), "v1 plans gain empty daily books array");
    assert(v1Stored.dailyPlans.monday.books.length === 0, "v1 plans do not invent daily books");

    console.log("7) Production-style items-only lesson plans normalize without errors");
    const legacyId = `cur-lp-schema-legacy-${crypto.randomBytes(4).toString("hex")}`;
    const legacyPlan = {
      id: legacyId,
      title: "Legacy Items Only",
      age: "Preschool",
      theme: "Legacy",
      plan: "Free",
      status: "published",
      learningDomains: ["Science"],
      weeklyOverview: "Weekly overview text",
      objectives: "Objectives text",
      weeklyMaterials: "",
      vocabularyWords: "",
      observationOpportunities: "",
      adaptations: "",
      familyConnection: "",
      books: [],
      songs: [],
      dailyPlans: {
        monday: {
          items: [{
            itemId: `item-${crypto.randomBytes(8).toString("hex")}`,
            activityCategory: "Sensory Play",
            title: "Legacy Activity",
            materials: "Cups",
            setup: "Table",
            steps: "1. Pour",
            learningGoals: ["Explore pouring"],
          }],
        },
        tuesday: { items: [] },
        wednesday: { items: [] },
        thursday: { items: [] },
        friday: { items: [] },
      },
      resourceIds: [],
      activityIds: [],
      createdAt: "",
      updatedAt: "",
    };
    const legacySave = await saveLessonPlan(token, expectedUpdatedAt, legacyPlan);
    expectedUpdatedAt = legacySave.siteContentUpdatedAt;
    assert(legacySave.lessonPlan.status === "published", "Published status preserved");
    assert(legacySave.lessonPlan.plan === "Free", "Free plan preserved");
    assert(legacySave.lessonPlan.dailyPlans.monday.theme === "", "Missing daily theme normalizes to empty string");
    assert(Array.isArray(legacySave.lessonPlan.dailyPlans.monday.circleTime), "Missing circleTime normalizes to array");

    console.log("8) Premium directions and teacher language are not truncated below 12,000 chars");
    const longText = `Line ${"x".repeat(180)}\n`.repeat(45).trim();
    assert(longText.length > 8000 && longText.length <= 12000, `Long text length unexpected: ${longText.length}`);
    const longId = `cur-lp-schema-long-${crypto.randomBytes(4).toString("hex")}`;
    const longItemId = `item-${crypto.randomBytes(8).toString("hex")}`;
    const longPlan = {
      id: longId,
      title: "Long Text Plan",
      age: "Preschool",
      theme: "Long",
      plan: "Pro",
      status: "draft",
      learningDomains: [],
      weeklyOverview: "",
      objectives: "",
      weeklyMaterials: "",
      vocabularyWords: "",
      observationOpportunities: "",
      adaptations: "",
      familyConnection: "",
      books: [],
      songs: [],
      dailyPlans: {
        monday: {
          theme: "",
          objectives: "",
          learningDomains: [],
          materials: "",
          vocabulary: "",
          books: [],
          songs: [],
          circleTime: [],
          transitions: [],
          outdoorPlay: "",
          familyConnection: "",
          observations: [],
          adaptations: "",
          safetyNotes: "",
          items: [{
            itemId: longItemId,
            activityCategory: "Sensory Play",
            title: "Long Language Activity",
            materials: "Materials",
            setup: "Setup",
            steps: longText,
            teacherLanguage: longText,
            learningGoals: ["Observe carefully"],
          }],
        },
        tuesday: { items: [] },
        wednesday: { items: [] },
        thursday: { items: [] },
        friday: { items: [] },
      },
      resourceIds: [],
      activityIds: [],
      createdAt: "",
      updatedAt: "",
    };
    const longSave = await saveLessonPlan(token, expectedUpdatedAt, longPlan);
    const longItem = longSave.lessonPlan.dailyPlans.monday.items[0];
    const longActivity = activeActivities(longSave.activities, longId)[0];
    assert(longItem.steps.length === longText.length, `Steps truncated: ${longItem.steps.length} vs ${longText.length}`);
    assert(longItem.teacherLanguage.length === longText.length, `Teacher language truncated: ${longItem.teacherLanguage.length}`);
    assert(longActivity.steps.length === longText.length, "Activity library steps should not truncate");
    assert(longActivity.teacherLanguage.length === longText.length, "Activity library teacher language should not truncate");

    console.log("\nAll curriculum schema Phase B checks passed.");
  } catch (error) {
    console.error("\nFAIL:", error.message);
    process.exitCode = 1;
  } finally {
    await stopServer(child);
  }
}

main();
