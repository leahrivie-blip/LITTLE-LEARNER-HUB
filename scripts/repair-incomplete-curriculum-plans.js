#!/usr/bin/env node
/**
 * Repair incomplete live curriculum lesson plans (e.g. Space Adventure Mon/Tue only).
 *
 * Compares published plans against local preschool Pro import sources and re-imports
 * any plan missing Wednesday–Friday activities (or below the source activity count).
 *
 * Requires admin credentials via env:
 *   ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_ACCESS_CODE
 * Optional:
 *   SITE_URL (default https://little-learner-hub.onrender.com)
 *   DRY_RUN=1  — parse + report only, do not save
 *
 * Run:
 *   node scripts/repair-incomplete-curriculum-plans.js
 *   DRY_RUN=1 node scripts/repair-incomplete-curriculum-plans.js
 */
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const {
  PRESCHOOL_PRO_IMPORT_TARGETS,
  PRESCHOOL_PRO_BATCH2_IMPORT_TARGETS,
  parsePreschoolLessonImport,
} = require("./curriculum-preschool-import-targets.js");
const {
  TODDLER_CORE_IMPORT_TARGETS,
  readToddlerCoreImportTarget,
} = require("./curriculum-toddler-core-import-targets.js");
const {
  INFANT_CORE_IMPORT_TARGETS,
  readInfantCoreImportTarget,
} = require("./curriculum-infant-core-import-targets.js");

const ROOT = path.join(__dirname, "..");
const SITE_URL = String(process.env.SITE_URL || "https://little-learner-hub.onrender.com").replace(/\/$/, "");
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const ADMIN = {
  email: process.env.ADMIN_EMAIL || "",
  password: process.env.ADMIN_PASSWORD || "",
  code: process.env.ADMIN_ACCESS_CODE || "",
};

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requestJson(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const url = new URL(urlPath, `${SITE_URL}/`);
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: `${url.pathname}${url.search}`,
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

function dayCounts(plan) {
  return Object.fromEntries(
    WEEKDAYS.map((day) => [day, Array.isArray(plan?.dailyPlans?.[day]?.items) ? plan.dailyPlans[day].items.length : 0]),
  );
}

function activityTotal(counts) {
  return WEEKDAYS.reduce((sum, day) => sum + (counts[day] || 0), 0);
}

function incompleteDays(counts) {
  return WEEKDAYS.filter((day) => (counts[day] || 0) === 0);
}

async function login() {
  assert(ADMIN.email && ADMIN.password && ADMIN.code, "Set ADMIN_EMAIL, ADMIN_PASSWORD, and ADMIN_ACCESS_CODE");
  const res = await requestJson("POST", "/api/admin/login", {
    email: ADMIN.email,
    password: ADMIN.password,
    code: ADMIN.code,
  });
  assert(res.status === 200 && res.json?.token, `Admin login failed: ${res.status} ${res.text?.slice(0, 200)}`);
  return res.json.token;
}

async function loadAdminPlans(token) {
  const res = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  assert(res.status === 200, `site-content failed: ${res.status}`);
  // Prefer full curriculum store (includes dailyPlans) over public library DTO.
  const plans = res.json?.siteContent?.curriculum?.lessonPlans
    || res.json?.siteContent?.curriculumLibrary?.lessonPlans
    || [];
  return {
    plans,
    updatedAt: res.json?.siteContent?.updatedAt || "",
  };
}

function loadSourceTargets() {
  return [
    ...PRESCHOOL_PRO_IMPORT_TARGETS.map((target) => ({ ...target, kind: "preschool" })),
    ...PRESCHOOL_PRO_BATCH2_IMPORT_TARGETS.map((target) => ({ ...target, kind: "preschool" })),
    ...TODDLER_CORE_IMPORT_TARGETS.map((target) => ({ ...target, kind: "toddler-core" })),
    ...INFANT_CORE_IMPORT_TARGETS.map((target) => ({ ...target, kind: "infant-core" })),
  ];
}

function buildLessonPlanFromSource(target) {
  if (target.kind === "toddler-core") {
    return readToddlerCoreImportTarget(target);
  }
  if (target.kind === "infant-core") {
    return readInfantCoreImportTarget(target);
  }
  const importDir = target.importDir || path.join(ROOT, "scripts/curriculum-preschool-pro-imports");
  const filePath = path.join(importDir, target.file);
  assert(fs.existsSync(filePath), `Missing source file: ${filePath}`);
  const text = fs.readFileSync(filePath, "utf8");
  const parsed = parsePreschoolLessonImport(text, {
    itemIdPrefix: target.stableId.replace(/^cur-lp-/, "item"),
  });
  return {
    id: target.stableId,
    title: parsed.title,
    age: parsed.age || parsed.ageGroup || "Preschool",
    theme: parsed.theme || "",
    plan: target.plan || "Pro",
    status: "published",
    learningDomains: parsed.learningDomains || [],
    weeklyOverview: parsed.weeklyOverview || "",
    objectives: parsed.objectives || [],
    books: parsed.books || [],
    songs: parsed.songs || [],
    weeklyMaterials: parsed.weeklyMaterials || parsed.materials || [],
    vocabularyWords: parsed.vocabularyWords || parsed.vocabulary || [],
    observationOpportunities: parsed.observationOpportunities || "",
    adaptations: parsed.adaptations || "",
    familyConnection: parsed.familyConnection || "",
    dailyPlans: parsed.dailyPlans,
    resourceIds: parsed.resourceIds || [],
  };
}

async function saveLesson(token, lessonPlan, expectedUpdatedAt) {
  return requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt,
    lessonPlan,
  });
}

async function main() {
  console.log(`Site: ${SITE_URL}`);
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE SAVE"}`);
  const token = await login();
  let { plans, updatedAt } = await loadAdminPlans(token);
  const byId = new Map(plans.map((plan) => [plan.id, plan]));
  const targets = loadSourceTargets();
  const report = {
    scanned: targets.length,
    incompleteLive: [],
    repaired: [],
    skippedOk: [],
    errors: [],
  };

  for (const target of targets) {
    const source = buildLessonPlanFromSource(target);
    const sourceCounts = dayCounts(source);
    const sourceTotal = activityTotal(sourceCounts);
    const live = byId.get(target.stableId);
    const liveCounts = dayCounts(live || {});
    const liveTotal = activityTotal(liveCounts);
    const missing = incompleteDays(liveCounts);
    const truncated = sourceTotal >= 8 && liveTotal > 0 && liveTotal < Math.ceil(sourceTotal * 0.6);
    const needsRepair = !live
      || missing.length > 0
      || truncated
      || (target.stableId === "cur-lp-preschool-space-adventure" && liveTotal < 15);

    if (!needsRepair) {
      report.skippedOk.push({
        id: target.stableId,
        title: source.title,
        liveTotal,
        sourceTotal,
      });
      continue;
    }

    report.incompleteLive.push({
      id: target.stableId,
      title: source.title,
      liveTotal,
      sourceTotal,
      liveCounts,
      sourceCounts,
      missing,
    });

    if (DRY_RUN) {
      console.log(`DRY  would repair ${target.stableId} (${liveTotal} → ${sourceTotal} activities)`);
      continue;
    }

    const save = await saveLesson(token, source, updatedAt);
    if (save.status !== 200 || !save.json?.ok) {
      report.errors.push({
        id: target.stableId,
        status: save.status,
        error: save.json?.error || save.text?.slice(0, 200),
      });
      console.error(`FAIL ${target.stableId}: ${save.status} ${save.json?.error || ""}`);
      // Refresh updatedAt for conflict recovery.
      ({ updatedAt } = await loadAdminPlans(token));
      continue;
    }
    updatedAt = save.json.siteContent?.updatedAt || updatedAt;
    report.repaired.push({
      id: target.stableId,
      title: source.title,
      from: liveTotal,
      to: sourceTotal,
    });
    console.log(`OK   repaired ${target.stableId} (${liveTotal} → ${sourceTotal})`);
  }

  const outDir = path.join(ROOT, "docs/audits");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "incomplete-curriculum-repair-report.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nReport: ${outPath}`);
  console.log(`Incomplete: ${report.incompleteLive.length} · Repaired: ${report.repaired.length} · OK: ${report.skippedOk.length} · Errors: ${report.errors.length}`);
  if (report.errors.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
