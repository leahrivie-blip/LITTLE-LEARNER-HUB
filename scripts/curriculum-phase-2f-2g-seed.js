#!/usr/bin/env node
/**
 * Phase 2F seed + Phase 2G preparation (local or remote).
 *
 * Creates 6 complete play-based curriculum lesson plans via the admin API
 * using importer-format text files (same sections as the admin importer).
 *
 * Default: ephemeral local server (safe).
 * Production/staging: set SITE_URL + ADMIN_EMAIL + ADMIN_PASSWORD + ADMIN_ACCESS_CODE.
 *
 * Never enables the public feature flag permanently. Local verification may
 * toggle the flag ON briefly, then restores OFF.
 *
 * Run: node scripts/curriculum-phase-2f-2g-seed.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const { spawn } = require("child_process");
const crypto = require("crypto");
const { URL } = require("url");

const ROOT = path.join(__dirname, "..");
const IMPORT_DIR = path.join(__dirname, "curriculum-phase-2f-imports");
const STORE_PATH = path.join(ROOT, "server/data/launch-store.json");
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
const AGES = ["Infant", "Toddler", "Preschool"];

const PUBLISH_TARGETS = [
  { file: "01-infant-soft-sounds-free.txt", plan: "Free", status: "published" },
  { file: "02-infant-gentle-water-pro.txt", plan: "Pro", status: "published" },
  { file: "03-toddler-color-hunt-free.txt", plan: "Free", status: "published" },
  { file: "04-toddler-building-buddies-pro.txt", plan: "Pro", status: "published" },
  { file: "05-preschool-garden-scientists-pro.txt", plan: "Pro", status: "published" },
  { file: "06-preschool-community-helpers-featured.txt", plan: "Free", status: "featured" },
];

const remoteUrl = String(process.env.SITE_URL || "").trim();
const useRemote = Boolean(remoteUrl && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD && process.env.ADMIN_ACCESS_CODE);
const LOCAL_PORT = 4410 + Math.floor(Math.random() * 200);
const BASE = useRemote ? remoteUrl.replace(/\/$/, "") : `http://127.0.0.1:${LOCAL_PORT}`;
const ADMIN = useRemote
  ? {
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
      code: process.env.ADMIN_ACCESS_CODE,
    }
  : {
      email: "phase2f-seed@example.com",
      password: "phase2f-seed-pass",
      code: "phase2f-seed-code",
    };

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

function waitForHealth(child, timeoutMs = 20000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (child && child.exitCode !== null) {
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

function startLocalServer() {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.rmSync(STORE_PATH, { force: true });
  const env = {
    ...process.env,
    PORT: String(LOCAL_PORT),
    SITE_URL: BASE,
    ADMIN_EMAIL: ADMIN.email,
    ADMIN_PASSWORD: ADMIN.password,
    ADMIN_ACCESS_CODE: ADMIN.code,
    ADMIN_NAME: "Phase 2F Seed",
    NODE_ENV: "test",
  };
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env,
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
      return;
    }
    if (currentField === "description") activity.description = [activity.description, trimmed].filter(Boolean).join("\n");
    if (currentField === "materials") activity.materials = [activity.materials, trimmed].filter(Boolean).join("\n");
  });
  if (!PLAY_ACTIVITY_CATEGORIES.includes(activity.activityCategory)) {
    throw new Error(`Invalid activity category "${activity.activityCategory}" in "${activity.title || "untitled"}"`);
  }
  if (!activity.title) return null;
  return activity;
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
    const content = (parts[i + 1] || "").trim();
    if (key) sections[key] = content;
  }
  const title = normalizedShortText(sections.TITLE);
  assert(title, "Missing ===TITLE===");
  const age = normalizedShortText(sections.AGE_GROUP);
  assert(AGES.includes(age), `Invalid age "${age}" for ${title}`);
  const plan = normalizedShortText(sections.PLAN) === "Pro" ? "Pro" : "Free";
  const statusRaw = normalizedShortText(sections.STATUS) || "draft";
  assert(["draft", "published", "featured", "archived"].includes(statusRaw), `Invalid status ${statusRaw}`);
  const learningDomains = String(sections.LEARNING_DOMAINS || "")
    .split(/[,;\n]/)
    .map((item) => normalizedShortText(item))
    .filter((item) => LEARNING_DOMAINS.includes(item));
  assert(learningDomains.length > 0, `${title}: need at least one approved learning domain`);
  assert(sections.WEEKLY_OVERVIEW, `${title}: missing weekly overview`);
  assert(sections.OBJECTIVES, `${title}: missing objectives`);
  assert(sections.FAMILY_CONNECTION, `${title}: missing family connection`);
  assert(sections.WEEKLY_MATERIALS, `${title}: missing weekly materials`);
  assert(sections.VOCABULARY, `${title}: missing vocabulary`);
  assert(sections.OBSERVATIONS, `${title}: missing observations`);
  assert(sections.ADAPTATIONS, `${title}: missing adaptations`);
  const books = parseImportList(sections.BOOKS, 3);
  const songs = parseImportList(sections.SONGS, 2);
  assert(books.length > 0, `${title}: need books`);
  assert(songs.length > 0, `${title}: need songs`);

  const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  const dailyPlans = {};
  let activityCount = 0;
  weekdays.forEach((day) => {
    const section = sections[day.toUpperCase()] || "";
    const blocks = section.split(/---ACTIVITY---/i).slice(1);
    const items = blocks.map((block) => parseActivityBlock(block)).filter(Boolean).map((item) => ({
      ...item,
      itemId: `item-${crypto.randomBytes(6).toString("hex")}`,
    }));
    activityCount += items.length;
    dailyPlans[day] = { items };
  });
  assert(activityCount >= 5, `${title}: expected multiple daily activities, found ${activityCount}`);

  return {
    title,
    age,
    theme: normalizedShortText(sections.THEME),
    plan,
    status: "draft",
    learningDomains,
    weeklyOverview: normalizedMultilineText(sections.WEEKLY_OVERVIEW),
    objectives: normalizedMultilineText(sections.OBJECTIVES),
    familyConnection: normalizedMultilineText(sections.FAMILY_CONNECTION),
    weeklyMaterials: normalizedMultilineText(sections.WEEKLY_MATERIALS),
    vocabularyWords: normalizedMultilineText(sections.VOCABULARY),
    observationOpportunities: normalizedMultilineText(sections.OBSERVATIONS),
    adaptations: normalizedMultilineText(sections.ADAPTATIONS),
    books,
    songs,
    dailyPlans,
    _activityCount: activityCount,
  };
}

async function login() {
  const res = await requestJson("POST", "/api/admin/login", {
    email: ADMIN.email,
    password: ADMIN.password,
    code: ADMIN.code,
  });
  assert(res.status === 200 && res.json?.token, `Login failed: ${res.status} ${res.text}`);
  return res.json.token;
}

async function getExpectedUpdatedAt(token) {
  const res = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  assert(res.status === 200, `Admin site-content failed: ${res.status}`);
  return res.json.siteContent?.updatedAt || "";
}

async function setFeatureFlag(token, enabled) {
  const reload = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  assert(reload.status === 200, "Reload before flag change failed");
  const save = await requestJson("POST", "/api/admin/site-content", {
    adminToken: token,
    siteContent: {
      ...reload.json.siteContent,
      featureFlags: {
        ...(reload.json.siteContent.featureFlags || {}),
        playBasedCurriculum: enabled === true,
      },
      updatedAt: reload.json.siteContent.updatedAt,
    },
  });
  assert(save.status === 200, `Flag save failed: ${save.status} ${save.text}`);
  return save.json.siteContent;
}

function printCutoverChecklist(summary) {
  console.log(`
============================================================
PHASE 2G LIVE CUTOVER CHECKLIST (manual — flag stays OFF until you act)
============================================================
1. Confirm backup: Admin → Curriculum → Export curriculum backup JSON.
2. Confirm these 6 plans exist as published/featured in Admin → Play-Based Lessons:
${summary.plans.map((p) => `   - [${p.age}] ${p.title} (${p.plan}, ${p.status})`).join("\n")}
3. Spot-check Activity Library generation in admin curriculum views (activities synced from daily plans).
4. Desktop + mobile: open Admin preview / logged-in libraries only AFTER enabling the flag.
5. Enable flag ONLY when ready:
   - Admin → Content / Feature flags
   - Check "Enable play-based curriculum system"
   - Save
   OR POST /api/admin/site-content with featureFlags.playBasedCurriculum=true and current updatedAt
6. Verify with flag ON:
   - Lesson Plan Library shows only published/featured curriculum plans (not drafts)
   - Activity Library shows synced published activities with parent lesson linkage
   - Free users see free-slice access; Pro users see all visible items
   - Opening a lesson hydrates linked resources (if any)
   - Mobile and desktop category pages render
7. Verify rollback:
   - Turn flag OFF → legacy lesson/activity libraries restore
   - Emergency code rollback: set CURRICULUM_LIBRARY_FALLBACK_TO_LEGACY=true in app.js and redeploy
8. Do NOT delete legacy lesson plans/activities.
9. Do NOT begin Phase 2H / bulk import until cutover is accepted.
============================================================
`);
}

async function main() {
  console.log(`Phase 2F/2G seed target: ${BASE} (${useRemote ? "remote" : "local ephemeral"})`);
  let child = null;
  if (!useRemote) child = startLocalServer();

  const created = [];
  try {
    if (!useRemote) await waitForHealth(child);
    const token = await login();
    let expectedUpdatedAt = await getExpectedUpdatedAt(token);

    console.log("\n1) Parse importer texts + save as DRAFTS");
    for (const target of PUBLISH_TARGETS) {
      const text = fs.readFileSync(path.join(IMPORT_DIR, target.file), "utf8");
      const parsed = parseLessonImport(text);
      // Force draft on first save regardless of file STATUS section.
      parsed.plan = target.plan;
      parsed.status = "draft";
      const id = `cur-lp-2f-${crypto.randomBytes(5).toString("hex")}`;
      const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
        adminToken: token,
        expectedUpdatedAt,
        lessonPlan: { ...parsed, id },
      });
      assert(save.status === 200, `Draft save failed for ${parsed.title}: ${save.status} ${save.text}`);
      expectedUpdatedAt = save.json.siteContentUpdatedAt;
      const activities = (save.json.activities || []).filter((item) => item.lessonPlanId === id && item.status !== "archived");
      assert(activities.length === parsed._activityCount, `${parsed.title}: expected ${parsed._activityCount} activities, got ${activities.length}`);
      assert(activities.every((item) => item.status === "draft"), `${parsed.title}: draft lesson must sync draft activities`);
      assert(activities.every((item) => item.lessonPlanId === id), `${parsed.title}: activity parent link missing`);
      // Integrity: every activityId on lesson exists
      const activityIds = new Set(activities.map((item) => item.id));
      (save.json.lessonPlan.activityIds || []).forEach((activityId) => {
        assert(activityIds.has(activityId), `${parsed.title}: lesson activityIds orphan ${activityId}`);
      });
      created.push({
        id,
        file: target.file,
        title: save.json.lessonPlan.title,
        age: save.json.lessonPlan.age,
        plan: target.plan,
        publishStatus: target.status,
        activityCount: activities.length,
        activityIds: [...activityIds],
      });
      console.log(`   draft ok: [${parsed.age}] ${parsed.title} (${activities.length} activities)`);
    }

    console.log("\n2) Validate public API still hides curriculum while flag OFF");
    const publicOff = await requestJson("GET", "/api/site-content");
    assert(publicOff.json.siteContent.playBasedCurriculum === false, "Flag should be OFF");
    assert(!("curriculumLibrary" in publicOff.json.siteContent), "No curriculumLibrary while flag OFF");
    assert(!("curriculum" in publicOff.json.siteContent), "Full curriculum must stay private");

    console.log("\n3) Publish / feature the approved test plans");
    for (const item of created) {
      const current = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
      const plan = (current.json.siteContent.curriculum.lessonPlans || []).find((entry) => entry.id === item.id);
      assert(plan, `Missing plan ${item.id}`);
      expectedUpdatedAt = current.json.siteContent.updatedAt;
      const publish = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
        adminToken: token,
        expectedUpdatedAt,
        lessonPlan: {
          ...plan,
          plan: item.plan,
          status: item.publishStatus,
        },
      });
      assert(publish.status === 200, `Publish failed for ${item.title}: ${publish.status} ${publish.text}`);
      expectedUpdatedAt = publish.json.siteContentUpdatedAt;
      const synced = (publish.json.activities || []).filter((activity) => activity.lessonPlanId === item.id && activity.status !== "archived");
      assert(synced.every((activity) => activity.status === "published"), `${item.title}: published/featured lesson must publish activities`);
      item.status = publish.json.lessonPlan.status;
      item.syncedActivities = synced.length;
      console.log(`   ${item.status}: [${item.age}] ${item.title}`);
    }

    console.log("\n3b) Attach one published sample resource to the featured plan (lesson-attached only)");
    const featured = created.find((item) => item.publishStatus === "featured");
    assert(featured, "Featured plan missing");
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const resourceId = `cur-res-2f-${crypto.randomBytes(4).toString("hex")}`;
    const resourceSave = await requestJson("POST", "/api/admin/curriculum/resources/save", {
      adminToken: token,
      expectedUpdatedAt,
      resource: {
        id: resourceId,
        title: "Community Helpers Badge Sample",
        resourceCategory: "Printables",
        fileData: png,
        fileName: "helpers-badge-sample.png",
        mimeType: "image/png",
        status: "published",
      },
    });
    assert(resourceSave.status === 200, `Sample resource save failed: ${resourceSave.status} ${resourceSave.text}`);
    expectedUpdatedAt = resourceSave.json.siteContentUpdatedAt;
    const link = await requestJson("POST", "/api/admin/curriculum/resources/link", {
      adminToken: token,
      expectedUpdatedAt,
      resourceId,
      lessonPlanId: featured.id,
    });
    assert(link.status === 200, `Resource link failed: ${link.status} ${link.text}`);
    assert((link.json.lessonPlan.resourceIds || []).includes(resourceId), "Featured plan missing resourceId");
    expectedUpdatedAt = link.json.siteContentUpdatedAt;
    created.forEach((item) => {
      if (item.id === featured.id) item.resourceId = resourceId;
    });

    console.log("\n4) Temporary flag ON verification (then restore OFF)");
    await setFeatureFlag(token, true);
    const publicOn = await requestJson("GET", "/api/site-content");
    assert(publicOn.json.siteContent.playBasedCurriculum === true, "Flag ON expected");
    const library = publicOn.json.siteContent.curriculumLibrary;
    assert(library, "curriculumLibrary missing with flag ON");
    assert(library.lessonPlans.length === 6, `Expected 6 public lessons, got ${library.lessonPlans.length}`);
    assert(library.lessonPlans.every((plan) => plan.status === "published" || plan.status === "featured"), "Draft lesson leaked");
    assert(library.activities.length > 0, "Expected generated activities in library");
    assert(library.activities.every((activity) => activity.lessonPlanId && activity.status === "published"), "Activities must be published + parent-linked");
    assert(library.resources.every((resource) => !("fileData" in resource)), "No fileData in public library resources");
    assert(library.resources.some((resource) => resource.id === resourceId), "Linked sample resource missing from public library metadata");
    const pubFile = await requestJson("GET", `/api/curriculum/resources/file?id=${encodeURIComponent(resourceId)}`);
    assert(pubFile.status === 200 && pubFile.json.resource?.fileData, "Linked lesson resource file should open when flag ON");
    // Free/Pro breakdown present on DTO
    const freeCount = library.lessonPlans.filter((plan) => plan.plan === "Free").length;
    const proCount = library.lessonPlans.filter((plan) => plan.plan === "Pro").length;
    const featuredCount = library.lessonPlans.filter((plan) => plan.status === "featured").length;
    assert(freeCount >= 2, "Need at least 2 Free plans");
    assert(proCount >= 3, "Need at least 3 Pro plans");
    assert(featuredCount >= 1, "Need at least 1 Featured plan");

    // Draft remains hidden: create a throwaway draft and ensure it stays out
    expectedUpdatedAt = (await getExpectedUpdatedAt(token));
    const draftProbe = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken: token,
      expectedUpdatedAt,
      lessonPlan: {
        id: `cur-lp-2f-draft-probe-${crypto.randomBytes(3).toString("hex")}`,
        title: "DRAFT PROBE HIDDEN",
        age: "Preschool",
        theme: "Probe",
        plan: "Free",
        status: "draft",
        learningDomains: ["Math"],
        weeklyOverview: "probe",
        objectives: "probe",
        familyConnection: "probe",
        weeklyMaterials: "probe",
        vocabularyWords: "probe",
        observationOpportunities: "probe",
        adaptations: "probe",
        books: [{ title: "Probe Book", author: "", notes: "" }],
        songs: [{ title: "Probe Song", notes: "" }],
        dailyPlans: {
          monday: { items: [{ itemId: `item-${crypto.randomBytes(4).toString("hex")}`, activityCategory: "Sensory Play", title: "Probe", description: "x", materials: "x", steps: "1. x", learningGoals: ["x"] }] },
          tuesday: { items: [] },
          wednesday: { items: [] },
          thursday: { items: [] },
          friday: { items: [] },
        },
      },
    });
    assert(draftProbe.status === 200, "Draft probe save failed");
    const publicStill = await requestJson("GET", "/api/site-content");
    assert(!(publicStill.json.siteContent.curriculumLibrary.lessonPlans || []).some((plan) => plan.title === "DRAFT PROBE HIDDEN"), "Draft probe leaked publicly");

    await setFeatureFlag(token, false);
    const publicRestored = await requestJson("GET", "/api/site-content");
    assert(publicRestored.json.siteContent.playBasedCurriculum === false, "Flag must be restored OFF");
    assert(!("curriculumLibrary" in publicRestored.json.siteContent), "curriculumLibrary must disappear when flag OFF");

    const byAge = created.reduce((acc, item) => {
      acc[item.age] = (acc[item.age] || 0) + 1;
      return acc;
    }, {});
    const totalActivities = created.reduce((sum, item) => sum + item.syncedActivities, 0);
    const summary = {
      mode: useRemote ? "remote" : "local",
      base: BASE,
      plans: created.map((item) => ({
        id: item.id,
        title: item.title,
        age: item.age,
        plan: item.plan,
        status: item.status,
        activities: item.syncedActivities,
        file: item.file,
      })),
      byAge,
      free: created.filter((item) => item.plan === "Free").length,
      pro: created.filter((item) => item.plan === "Pro").length,
      featured: created.filter((item) => item.status === "featured").length,
      totalActivities,
      flagLeftOff: true,
      fallbackConstant: "CURRICULUM_LIBRARY_FALLBACK_TO_LEGACY in app.js (default false)",
    };

    const reportPath = path.join(__dirname, "data/phase-2f-2g-seed-report.json");
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(summary, null, 2)}\n`);

    console.log("\n=== PHASE 2F/2G SUMMARY ===");
    console.log(JSON.stringify(summary, null, 2));
    printCutoverChecklist(summary);
    console.log(`Report written to ${reportPath}`);
    console.log("\nAll Phase 2F seed + Phase 2G preparation checks passed. Feature flag left OFF.");
  } catch (error) {
    console.error("\nFAIL:", error.message);
    process.exitCode = 1;
  } finally {
    await stopServer(child);
  }
}

main();
