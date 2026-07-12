#!/usr/bin/env node
/**
 * Import 10 preschool Free/published lesson plans and verify activity sync.
 *
 * Local (default): ephemeral server
 * Production: SITE_URL + ADMIN_EMAIL + ADMIN_PASSWORD + ADMIN_ACCESS_CODE
 *
 * Run: node scripts/curriculum-preschool-free-import.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const { spawn } = require("child_process");
const { URL } = require("url");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");

const ROOT = path.join(__dirname, "..");
const IMPORT_DIR = path.join(__dirname, "curriculum-preschool-free-imports");
const REPORT_PATH = path.join(__dirname, "data/preschool-free-import-report.json");

const AGES = ["Infant", "Toddler", "Preschool"];

const IMPORT_TARGETS = [
  { file: "01-preschool-colors-everywhere-free.txt", stableId: "cur-lp-preschool-colors-everywhere" },
  { file: "02-preschool-all-about-me-free.txt", stableId: "cur-lp-preschool-all-about-me" },
  { file: "03-preschool-letters-and-sounds-free.txt", stableId: "cur-lp-preschool-letters-and-sounds" },
  { file: "04-preschool-numbers-everywhere-free.txt", stableId: "cur-lp-preschool-numbers-everywhere" },
  { file: "05-preschool-feelings-and-emotions-free.txt", stableId: "cur-lp-preschool-feelings-and-emotions" },
  { file: "06-preschool-community-helpers-free.txt", stableId: "cur-lp-preschool-community-helpers" },
  { file: "07-preschool-shapes-around-us-free.txt", stableId: "cur-lp-preschool-shapes-around-us" },
  { file: "08-preschool-weather-watchers-free.txt", stableId: "cur-lp-preschool-weather-watchers" },
  { file: "09-preschool-farm-animals-free.txt", stableId: "cur-lp-preschool-farm-animals" },
  { file: "10-preschool-five-senses-free.txt", stableId: "cur-lp-preschool-five-senses" },
];

const remoteUrl = String(process.env.SITE_URL || "").trim();
const useRemote = Boolean(remoteUrl && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD && process.env.ADMIN_ACCESS_CODE);
const LOCAL_PORT = 4430 + Math.floor(Math.random() * 200);
const BASE = useRemote ? remoteUrl.replace(/\/$/, "") : `http://127.0.0.1:${LOCAL_PORT}`;
const ADMIN = useRemote
  ? {
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
      code: process.env.ADMIN_ACCESS_CODE,
    }
  : {
      email: "preschool-free-import@example.com",
      password: "preschool-free-import-pass",
      code: "preschool-free-import-code",
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
      ADMIN_NAME: "Preschool Free Import",
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
  assert(data.weeklyOverview, `${data.title}: missing weekly overview`);
  assert(data.objectives, `${data.title}: missing objectives`);
  assert(data.weeklyMaterials, `${data.title}: missing weekly materials`);
  assert(data.vocabularyWords, `${data.title}: missing vocabulary`);
  assert(data.familyConnection, `${data.title}: missing family connection`);
  assert(data.observationOpportunities, `${data.title}: missing observations`);
  assert(data.adaptations, `${data.title}: missing adaptations`);
  assert((data.books || []).length > 0, `${data.title}: need books`);
  assert((data.songs || []).length > 0, `${data.title}: need songs`);

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
  assert(activityCount === 15, `${data.title}: expected 15 activities, found ${activityCount}`);
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

async function main() {
  console.log(`Preschool free import target: ${BASE} (${useRemote ? "remote" : "local ephemeral"})`);
  let child = null;
  const syncErrors = [];
  const imported = [];
  const skipped = [];

  try {
    if (!useRemote) {
      child = startLocalServer();
      await waitForHealth(child);
    }

    const token = await login();
    let siteContent = await loadAdmin(token);
    let expectedUpdatedAt = siteContent.updatedAt || "";

    console.log("\nImporting 10 preschool Free/published lesson plans");
    for (const target of IMPORT_TARGETS) {
      const text = fs.readFileSync(path.join(IMPORT_DIR, target.file), "utf8");
      const prefix = target.stableId.replace(/^cur-lp-/, "");
      const parsed = parseLessonImport(text, { itemIdPrefix: `item-${prefix}` });

      const existing = (siteContent.curriculum?.lessonPlans || []).find(
        (plan) => plan.id === target.stableId || plan.title === parsed.title,
      );

      if (existing && existing.status === "published" && (existing.activityIds || []).length === 15) {
        skipped.push({ id: existing.id, title: existing.title, file: target.file });
        console.log(`   skip: [Preschool] ${existing.title} (already published with 15 activities)`);
        continue;
      }

      const id = existing?.id || target.stableId;
      const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
        adminToken: token,
        expectedUpdatedAt,
        lessonPlan: {
          ...parsed,
          id,
          plan: "Free",
          status: "published",
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

      if (activities.length !== 15) {
        syncErrors.push(`${parsed.title}: expected 15 activities, got ${activities.length}`);
      }
      if (!activities.every((item) => item.status === "published")) {
        syncErrors.push(`${parsed.title}: activity status mismatch (expected published)`);
      }
      if (!activities.every((item) => item.lessonPlanId === id)) {
        syncErrors.push(`${parsed.title}: parent lessonPlanId mismatch`);
      }
      if ((save.json.lessonPlan.activityIds || []).length !== 15) {
        syncErrors.push(`${parsed.title}: lessonPlan.activityIds length !== 15`);
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

    siteContent = await loadAdmin(token);
    const curriculum = siteContent.curriculum || { lessonPlans: [], activities: [] };
    const preschoolPlans = curriculum.lessonPlans.filter((plan) => plan.age === "Preschool");
    const preschoolActivities = curriculum.activities.filter(
      (activity) => preschoolPlans.some((plan) => plan.id === activity.lessonPlanId) && activity.status === "published",
    );

    const report = {
      importedAt: new Date().toISOString(),
      target: BASE,
      remote: useRemote,
      imported,
      skipped,
      syncErrors,
      totals: {
        lessonPlans: curriculum.lessonPlans.length,
        activities: curriculum.activities.length,
        preschoolPlans: preschoolPlans.length,
        preschoolPublishedActivities: preschoolActivities.length,
        importedPlanCount: imported.length,
        importedActivityCount: imported.reduce((sum, item) => sum + item.activities, 0),
      },
    };

    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

    console.log("\nSummary:");
    console.log(`   Imported: ${imported.length} plans (${report.totals.importedActivityCount} activities)`);
    console.log(`   Skipped: ${skipped.length} plans`);
    console.log(`   Curriculum totals: ${report.totals.lessonPlans} plans, ${report.totals.activities} activities`);
    console.log(`   Report: ${REPORT_PATH}`);

    if (syncErrors.length) {
      console.error("\nSync errors:");
      syncErrors.forEach((err) => console.error(`   - ${err}`));
      process.exitCode = 1;
    } else {
      assert(imported.length + skipped.length === IMPORT_TARGETS.length, "Not all targets were processed");
      const newActivityTotal = imported.reduce((sum, item) => sum + item.activities, 0);
      if (imported.length > 0) {
        assert(newActivityTotal === imported.length * 15, `Expected ${imported.length * 15} new activities`);
      }
      console.log("\nSuccess: all preschool lesson plans imported with synced activities.");
    }
  } finally {
    await stopServer(child);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
