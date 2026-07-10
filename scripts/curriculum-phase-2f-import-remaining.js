#!/usr/bin/env node
/**
 * Import the remaining Phase 2F lesson plans (02–06) and verify totals.
 *
 * Assumes Infant Soft Sounds may already exist (skips by title if found).
 * Does NOT enable the play-based curriculum feature flag.
 * Does NOT begin Phase 2H / bulk import.
 *
 * Local (default): ephemeral server
 * Production: SITE_URL + ADMIN_EMAIL + ADMIN_PASSWORD + ADMIN_ACCESS_CODE
 *
 * Run: node scripts/curriculum-phase-2f-import-remaining.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const { spawn } = require("child_process");
const crypto = require("crypto");
const { URL } = require("url");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");

const ROOT = path.join(__dirname, "..");
const IMPORT_DIR = path.join(__dirname, "curriculum-phase-2f-imports");
const REPORT_PATH = path.join(__dirname, "data/phase-2f-remaining-import-report.json");

const LEARNING_DOMAINS = [
  "Social Emotional",
  "Language & Literacy",
  "Math",
  "Science",
  "Physical Development",
  "Creative Arts",
];
const AGES = ["Infant", "Toddler", "Preschool"];

const SOFT_SOUNDS_TITLE = "Infant Soft Sounds & Faces";
const REMAINING_TARGETS = [
  { file: "02-infant-gentle-water-pro.txt", plan: "Pro", status: "published", stableId: "cur-lp-2f-gentle-water" },
  { file: "03-toddler-color-hunt-free.txt", plan: "Free", status: "published", stableId: "cur-lp-2f-color-hunt" },
  { file: "04-toddler-building-buddies-pro.txt", plan: "Pro", status: "published", stableId: "cur-lp-2f-building-buddies" },
  { file: "05-preschool-garden-scientists-pro.txt", plan: "Pro", status: "published", stableId: "cur-lp-2f-garden-scientists" },
  { file: "06-preschool-community-helpers-featured.txt", plan: "Free", status: "featured", stableId: "cur-lp-2f-community-helpers" },
];

const remoteUrl = String(process.env.SITE_URL || "").trim();
const useRemote = Boolean(remoteUrl && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD && process.env.ADMIN_ACCESS_CODE);
const LOCAL_PORT = 4420 + Math.floor(Math.random() * 200);
const BASE = useRemote ? remoteUrl.replace(/\/$/, "") : `http://127.0.0.1:${LOCAL_PORT}`;
const ADMIN = useRemote
  ? {
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    code: process.env.ADMIN_ACCESS_CODE,
  }
  : {
    email: "phase2f-remaining@example.com",
    password: "phase2f-remaining-pass",
    code: "phase2f-remaining-code",
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
        timeout: 60000,
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
  // Ephemeral verification must not inherit leftover launch-store.json from prior tests.
  try {
    fs.rmSync(path.join(ROOT, "server/data/launch-store.json"), { force: true });
  } catch {
    // ignore
  }
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(LOCAL_PORT),
      SITE_URL: BASE,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      ADMIN_NAME: "Phase 2F Remaining",
      DATABASE_PROVIDER: "local-json",
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
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
        if (res.status === 200) {
          resolve();
          return;
        }
      } catch {
        // retry
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error("Timed out waiting for health"));
        return;
      }
      setTimeout(tick, 200);
    };
    tick();
  });
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

function parseLessonImport(text, { itemIdPrefix = "item" } = {}) {
  const parsed = parseCurriculumLessonPlanImport(text);
  const data = parsed.data || {};
  assert(parsed.ok, parsed.errors.join(" "));
  assert(data.title, "Missing TITLE:");
  assert(AGES.includes(data.age), `Invalid age "${data.age}" for ${data.title}`);
  assert((data.learningDomains || []).length > 0, `${data.title}: need learning domains`);
  const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  const dailyPlans = {};
  let activityCount = 0;
  weekdays.forEach((day) => {
    const items = (data.dailyPlans?.[day]?.items || []).map((item, index) => ({
      ...item,
      itemId: `${itemIdPrefix}-${day}-${index + 1}`,
    }));
    activityCount += items.length;
    dailyPlans[day] = { items };
  });
  return {
    ...data,
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

async function loadAdmin(token) {
  const res = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  assert(res.status === 200, `Admin site-content failed: ${res.status} ${res.text}`);
  return res.json.siteContent;
}

function printCutoverChecklist(summary) {
  console.log(`
============================================================
PLAY-BASED CURRICULUM CUTOVER CHECKLIST (flag stays OFF until you act)
============================================================
Pre-flight
1. Admin → Play-Based Lessons (Beta): confirm ${summary.phase2fLessonCount} Phase 2F plans are published/featured.
2. Admin → Curriculum Activities (Beta): confirm ${summary.phase2fActivityCount} activities; open each parent link.
3. Export curriculum backup JSON before enabling the flag.
4. Confirm feature flag is currently OFF (public API has no curriculumLibrary).

Enable (only when ready)
5. Admin → Visibility / feature flags → enable "Play-based curriculum system" → Save.
6. Hard-refresh public site.

Verify with flag ON
7. Lesson Plan Library shows only published/featured curriculum plans (no drafts, no Tiny Save Test if still draft).
8. Activity Center shows synced published activities with parent lesson titles.
9. Free users see Free plans; Pro users see Free + Pro.
10. Featured plan appears as featured.
11. Desktop + mobile category pages render.

Rollback
12. Turn flag OFF → legacy libraries restore.
13. Emergency: CURRICULUM_LIBRARY_FALLBACK_TO_LEGACY=true in app.js + redeploy.
14. Do NOT delete legacy data. Do NOT begin Phase 2H / bulk import until cutover is accepted.
============================================================
`);
}

async function main() {
  console.log(`Phase 2F remaining import target: ${BASE} (${useRemote ? "remote" : "local ephemeral"})`);
  if (!useRemote) {
    console.log("NOTE: No SITE_URL/ADMIN_* env — running local verification only.");
  }
  let child = null;
  const syncErrors = [];
  const imported = [];

  try {
    if (!useRemote) {
      child = startLocalServer();
      await waitForHealth(child);
    }

    const token = await login();
    let siteContent = await loadAdmin(token);
    let expectedUpdatedAt = siteContent.updatedAt || "";
    const existingPlans = siteContent.curriculum?.lessonPlans || [];

    // Local prep: seed Soft Sounds so "remaining 5" verification matches production assumption.
    if (!useRemote) {
      const softText = fs.readFileSync(path.join(IMPORT_DIR, "01-infant-soft-sounds-free.txt"), "utf8");
      const softParsed = parseLessonImport(softText, { itemIdPrefix: "item-soft-sounds" });
      const softSave = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
        adminToken: token,
        expectedUpdatedAt,
        lessonPlan: {
          ...softParsed,
          id: "cur-lp-2f-soft-sounds",
          plan: "Free",
          status: "published",
        },
      });
      assert(softSave.status === 200, `Soft Sounds seed failed: ${softSave.status} ${softSave.text}`);
      expectedUpdatedAt = softSave.json.siteContentUpdatedAt;
      console.log(`Seeded Soft Sounds locally (${softParsed._activityCount} activities)`);
    }

    siteContent = await loadAdmin(token);
    expectedUpdatedAt = siteContent.updatedAt || expectedUpdatedAt;

    console.log("\n1) Import remaining 5 Phase 2F plans");
    for (const target of REMAINING_TARGETS) {
      const text = fs.readFileSync(path.join(IMPORT_DIR, target.file), "utf8");
      const parsed = parseLessonImport(text, { itemIdPrefix: `item-${target.stableId.replace(/^cur-lp-2f-/, "")}` });
      const existing = (siteContent.curriculum?.lessonPlans || []).find(
        (plan) => plan.id === target.stableId || plan.title === parsed.title,
      );
      const id = existing?.id || target.stableId;
      const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
        adminToken: token,
        expectedUpdatedAt,
        lessonPlan: {
          ...parsed,
          id,
          plan: target.plan,
          status: target.status,
          createdAt: existing?.createdAt || "",
        },
      });
      if (save.status !== 200) {
        syncErrors.push(`${parsed.title}: HTTP ${save.status} ${save.json?.error || save.text}`);
        console.error(`   FAIL ${parsed.title}: ${save.status} ${save.json?.error || save.text}`);
        continue;
      }
      expectedUpdatedAt = save.json.siteContentUpdatedAt;
      const activities = (save.json.activities || []).filter(
        (item) => item.lessonPlanId === id && item.status !== "archived",
      );
      if (activities.length !== parsed._activityCount) {
        syncErrors.push(`${parsed.title}: expected ${parsed._activityCount} activities, got ${activities.length}`);
      }
      const expectedActivityStatus = target.status === "draft" ? "draft" : "published";
      if (!activities.every((item) => item.status === expectedActivityStatus)) {
        syncErrors.push(`${parsed.title}: activity status mismatch (expected ${expectedActivityStatus})`);
      }
      if (!activities.every((item) => item.lessonPlanId === id)) {
        syncErrors.push(`${parsed.title}: parent lessonPlanId mismatch`);
      }
      imported.push({
        id,
        title: save.json.lessonPlan.title,
        age: save.json.lessonPlan.age,
        plan: save.json.lessonPlan.plan,
        status: save.json.lessonPlan.status,
        activities: activities.length,
        activityIds: activities.map((item) => item.id),
        file: target.file,
        reusedExisting: Boolean(existing),
      });
      console.log(`   ok: [${save.json.lessonPlan.age}] ${save.json.lessonPlan.title} (${activities.length} activities, ${save.json.lessonPlan.status})`);
      siteContent = {
        ...siteContent,
        curriculum: save.json.curriculum,
        updatedAt: expectedUpdatedAt,
      };
    }

    console.log("\n2) Verify totals, parent links, duplicate IDs, Free/Pro/Featured");
    siteContent = await loadAdmin(token);
    const curriculum = siteContent.curriculum || { lessonPlans: [], activities: [] };
    const phase2fTitles = new Set([
      SOFT_SOUNDS_TITLE,
      ...REMAINING_TARGETS.map((target) => {
        const text = fs.readFileSync(path.join(IMPORT_DIR, target.file), "utf8");
        return parseLessonImport(text, { itemIdPrefix: `item-${target.stableId.replace(/^cur-lp-2f-/, "")}` }).title;
      }),
    ]);
    const phase2fPlansRaw = (curriculum.lessonPlans || []).filter((plan) => phase2fTitles.has(plan.title));
    // Dedupe by title (prefer published/featured over draft) in case Soft Sounds was saved twice.
    const phase2fPlansByTitle = new Map();
    phase2fPlansRaw.forEach((plan) => {
      const prev = phase2fPlansByTitle.get(plan.title);
      if (!prev) {
        phase2fPlansByTitle.set(plan.title, plan);
        return;
      }
      const rank = (status) => (status === "featured" ? 3 : status === "published" ? 2 : 1);
      if (rank(plan.status) >= rank(prev.status)) phase2fPlansByTitle.set(plan.title, plan);
    });
    const phase2fPlans = [...phase2fPlansByTitle.values()];
    if (phase2fPlansRaw.length !== phase2fPlans.length) {
      syncErrors.push(`Duplicate Phase 2F lesson titles present (${phase2fPlansRaw.length - phase2fPlans.length} extras)`);
    }
    const phase2fPlanIds = new Set(phase2fPlans.map((plan) => plan.id));
    const phase2fActivities = (curriculum.activities || []).filter(
      (activity) => phase2fPlanIds.has(activity.lessonPlanId) && activity.status !== "archived",
    );
    const allActivityIds = phase2fActivities.map((activity) => activity.id);
    const uniqueActivityIds = new Set(allActivityIds);
    if (uniqueActivityIds.size !== allActivityIds.length) {
      const counts = new Map();
      allActivityIds.forEach((id) => counts.set(id, (counts.get(id) || 0) + 1));
      const dupes = [...counts.entries()].filter(([, count]) => count > 1).slice(0, 10);
      syncErrors.push(`Duplicate activity IDs detected (${allActivityIds.length - uniqueActivityIds.size} dupes): ${dupes.map(([id, count]) => `${id}x${count}`).join(", ")}`);
      console.error("Duplicate activity IDs:", dupes);
    }

    const missingParents = phase2fActivities.filter((activity) => !phase2fPlanIds.has(activity.lessonPlanId));
    if (missingParents.length) {
      syncErrors.push(`${missingParents.length} activities missing parent lesson`);
    }

    const free = phase2fPlans.filter((plan) => plan.plan === "Free").length;
    const pro = phase2fPlans.filter((plan) => plan.plan === "Pro").length;
    const featured = phase2fPlans.filter((plan) => plan.status === "featured").length;
    const published = phase2fPlans.filter((plan) => plan.status === "published").length;

    // Soft Sounds presence
    const softSounds = phase2fPlans.find((plan) => plan.title === SOFT_SOUNDS_TITLE);
    if (!softSounds) {
      syncErrors.push("Infant Soft Sounds & Faces not found — import Soft Sounds before cutover");
    }

    assert(phase2fPlans.length === 6, `Expected 6 Phase 2F plans, found ${phase2fPlans.length}`);
    assert(phase2fActivities.length === 55, `Expected 55 Phase 2F activities, found ${phase2fActivities.length}`);
    assert(free >= 2 && pro >= 3 && featured >= 1, `Free/Pro/Featured counts off: free=${free} pro=${pro} featured=${featured}`);
    assert(uniqueActivityIds.size === allActivityIds.length, "Duplicate activity IDs present");

    // Curriculum Activities browser data shape: every activity has parent title resolvable
    phase2fActivities.forEach((activity) => {
      const parent = phase2fPlans.find((plan) => plan.id === activity.lessonPlanId);
      assert(parent, `Activity ${activity.id} parent missing for browser link`);
    });

    const publicOff = await requestJson("GET", "/api/site-content");
    assert(publicOff.json.siteContent.playBasedCurriculum === false, "Feature flag must remain OFF");
    assert(!("curriculumLibrary" in publicOff.json.siteContent), "curriculumLibrary must stay hidden while flag OFF");

    const summary = {
      target: BASE,
      mode: useRemote ? "remote" : "local",
      importedRemaining: imported,
      phase2fLessonCount: phase2fPlans.length,
      phase2fActivityCount: phase2fActivities.length,
      free,
      pro,
      featured,
      published,
      softSoundsPresent: Boolean(softSounds),
      duplicateActivityIds: allActivityIds.length - uniqueActivityIds.size,
      syncErrors,
      flagLeftOff: true,
      plans: phase2fPlans.map((plan) => ({
        id: plan.id,
        title: plan.title,
        age: plan.age,
        plan: plan.plan,
        status: plan.status,
        activityIds: plan.activityIds || [],
      })),
    };

    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(summary, null, 2));
    console.log("\nSummary");
    console.log(JSON.stringify({
      phase2fLessonCount: summary.phase2fLessonCount,
      phase2fActivityCount: summary.phase2fActivityCount,
      free: summary.free,
      pro: summary.pro,
      featured: summary.featured,
      published: summary.published,
      duplicateActivityIds: summary.duplicateActivityIds,
      syncErrors: summary.syncErrors,
      flagLeftOff: true,
    }, null, 2));
    printCutoverChecklist(summary);
    console.log(`Report written to ${REPORT_PATH}`);
    if (syncErrors.length) {
      throw new Error(`Completed with ${syncErrors.length} sync error(s)`);
    }
    console.log("\nRemaining Phase 2F import + verification passed. Feature flag left OFF.");
  } finally {
    await stopServer(child);
  }
}

main().catch((error) => {
  console.error("\nFAIL:", error.message);
  process.exitCode = 1;
});
