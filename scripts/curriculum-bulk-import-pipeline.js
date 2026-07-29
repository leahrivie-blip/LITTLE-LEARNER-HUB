#!/usr/bin/env node
/**
 * Stable large-batch lesson plan import pipeline.
 *
 * Phases:
 *   1. VALIDATE  — parse, standards gate, cover assignment preview, capacity check
 *   2. SNAPSHOT  — fingerprint existing plans (never touch them)
 *   3. IMPORT    — serialized admin saves with conflict retry + auto covers
 *   4. VERIFY    — sections, library placement, covers, print, existing unchanged
 *
 * Fail-fast: if validation fails, nothing is written.
 *
 * Usage:
 *   node scripts/curriculum-bulk-import-pipeline.js --dir scripts/my-batch --dry-run
 *   node scripts/curriculum-bulk-import-pipeline.js --dir scripts/my-batch --validate-only
 *   node scripts/curriculum-bulk-import-pipeline.js --dir scripts/my-batch --import
 *   node scripts/curriculum-bulk-import-pipeline.js --files a.txt,b.txt --import
 *   node scripts/curriculum-bulk-import-pipeline.js --paste path/to/bulk.txt --import
 *
 * Remote:
 *   SITE_URL=… ADMIN_EMAIL=… ADMIN_PASSWORD=… ADMIN_ACCESS_CODE=… \
 *     node scripts/curriculum-bulk-import-pipeline.js --dir … --import
 *
 * Flags:
 *   --dry-run / --validate-only  validate only (default)
 *   --import                     validate then write
 *   --strict-standards           treat gold-standard high issues as blocking
 *   --allow-draft-gaps           allow publish gaps (still requires Mon–Fri activities for published)
 *   --status published|draft     override status for imported plans
 *   --report path                write JSON report
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const os = require("os");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { URL } = require("url");

const ROOT = path.join(__dirname, "..");
const { parseCurriculumLessonPlanImport, parseCurriculumLessonPlanBulkImport } = require("./curriculum-lesson-import-parser.js");
const { auditLessonPlanAgainstStandards } = require("./curriculum-standards.js");
const coverAssign = require("./lesson-plan-cover-assign.js");
const postImportVerify = require("./curriculum-post-import-verify.js");

const MAX_LESSON_PLANS = 2000;
const MAX_ACTIVITIES = 12000;
const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];

function parseArgs(argv) {
  const args = {
    dirs: [],
    files: [],
    paste: "",
    mode: "validate-only",
    strictStandards: false,
    allowDraftGaps: false,
    statusOverride: "",
    report: path.join(ROOT, "scripts/data/bulk-import-report.json"),
    idPrefix: "cur-lp-bulk",
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run" || arg === "--validate-only") args.mode = "validate-only";
    else if (arg === "--import") args.mode = "import";
    else if (arg === "--strict-standards") args.strictStandards = true;
    else if (arg === "--allow-draft-gaps") args.allowDraftGaps = true;
    else if (arg === "--dir") args.dirs.push(argv[++i]);
    else if (arg.startsWith("--dir=")) args.dirs.push(arg.slice("--dir=".length));
    else if (arg === "--files") args.files.push(...String(argv[++i] || "").split(",").map((s) => s.trim()).filter(Boolean));
    else if (arg.startsWith("--files=")) args.files.push(...arg.slice("--files=".length).split(",").map((s) => s.trim()).filter(Boolean));
    else if (arg === "--paste") args.paste = argv[++i];
    else if (arg.startsWith("--paste=")) args.paste = arg.slice("--paste=".length);
    else if (arg === "--status") args.statusOverride = argv[++i];
    else if (arg.startsWith("--status=")) args.statusOverride = arg.slice("--status=".length);
    else if (arg === "--report") args.report = argv[++i];
    else if (arg.startsWith("--report=")) args.report = arg.slice("--report=".length);
    else if (arg === "--id-prefix") args.idPrefix = argv[++i];
    else if (arg.startsWith("--id-prefix=")) args.idPrefix = arg.slice("--id-prefix=".length);
  }
  return args;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function countActivities(plan) {
  return WEEKDAYS.reduce((sum, day) => sum + (plan?.dailyPlans?.[day]?.items?.length || 0), 0);
}

function stripImportMeta(data) {
  const plan = { ...data };
  delete plan._formatVersion;
  delete plan._activityCount;
  delete plan.dailyPlansCompat;
  delete plan.ageBucket;
  return plan;
}

function walkTxtFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkTxtFiles(full, acc);
    else if (entry.isFile() && entry.name.endsWith(".txt")) acc.push(full);
  }
  return acc;
}

function collectSources(args) {
  const sources = [];
  for (const dir of args.dirs) {
    const abs = path.isAbsolute(dir) ? dir : path.join(ROOT, dir);
    assert(fs.existsSync(abs), `Import directory not found: ${dir}`);
    for (const file of walkTxtFiles(abs).sort()) {
      sources.push({ kind: "file", path: file, label: path.relative(ROOT, file) });
    }
  }
  for (const file of args.files) {
    const abs = path.isAbsolute(file) ? file : path.join(ROOT, file);
    assert(fs.existsSync(abs), `Import file not found: ${file}`);
    sources.push({ kind: "file", path: abs, label: path.relative(ROOT, abs) });
  }
  if (args.paste) {
    const abs = path.isAbsolute(args.paste) ? args.paste : path.join(ROOT, args.paste);
    assert(fs.existsSync(abs), `Paste file not found: ${args.paste}`);
    sources.push({ kind: "paste", path: abs, label: path.relative(ROOT, abs) });
  }
  return sources;
}

function parseSources(sources) {
  const plans = [];
  const parseErrors = [];
  for (const source of sources) {
    const text = fs.readFileSync(source.path, "utf8");
    if (source.kind === "paste") {
      const bulk = parseCurriculumLessonPlanBulkImport(text);
      if (!bulk.ok) {
        parseErrors.push({ source: source.label, errors: bulk.errors || ["bulk parse failed"] });
      }
      for (const item of bulk.lessonPlans || []) {
        if (!item.ok || !item.data) {
          parseErrors.push({
            source: `${source.label}#${item.index}`,
            errors: item.errors || ["parse failed"],
          });
          continue;
        }
        plans.push({
          source: `${source.label}#${item.index}`,
          data: stripImportMeta(item.data),
          warnings: item.warnings || [],
        });
      }
      continue;
    }
    const parsed = parseCurriculumLessonPlanImport(text);
    if (!parsed.ok || !parsed.data) {
      parseErrors.push({ source: source.label, errors: parsed.errors || ["parse failed"] });
      continue;
    }
    plans.push({
      source: source.label,
      data: stripImportMeta(parsed.data),
      warnings: parsed.warnings || [],
    });
  }
  return { plans, parseErrors };
}

function stableIdForPlan(plan, idPrefix, existingByTitleAge) {
  const title = String(plan.title || "").trim();
  const age = String(plan.age || "").trim();
  const key = `${title.toLowerCase()}::${age.toLowerCase()}`;
  if (existingByTitleAge.has(key)) return existingByTitleAge.get(key);
  return `${idPrefix}-${slugify(age)}-${slugify(title)}`.replace(/-+/g, "-");
}

function validatePlans(rawPlans, { strictStandards, allowDraftGaps, statusOverride }) {
  const blocking = [];
  const warnings = [];
  const prepared = [];

  for (const row of rawPlans) {
    const plan = { ...row.data };
    if (statusOverride) plan.status = statusOverride;
    const status = String(plan.status || "draft").toLowerCase();
    const days = WEEKDAYS.filter((day) => (plan.dailyPlans?.[day]?.items || []).some((item) => String(item?.title || "").trim()));
    const activityCount = countActivities(plan);
    const issues = [];

    if (!plan.title) issues.push({ severity: "critical", code: "missing_title", detail: "Missing title" });
    if (!plan.age) issues.push({ severity: "critical", code: "missing_age", detail: "Missing age group" });
    if (activityCount < 1) issues.push({ severity: "critical", code: "no_activities", detail: "No activities parsed" });

    if ((status === "published" || status === "featured") && days.length < 5) {
      issues.push({
        severity: "critical",
        code: "publish_incomplete_week",
        detail: `Published plans need Mon–Fri activities (have ${days.length})`,
      });
    } else if (!allowDraftGaps && days.length < 5) {
      issues.push({
        severity: "critical",
        code: "incomplete_week",
        detail: `Incomplete week: ${days.length}/5 days with activities`,
      });
    }

    const audit = auditLessonPlanAgainstStandards(plan, { source: row.source });
    for (const issue of audit.issues || []) {
      if (issue.severity === "critical") issues.push(issue);
      else if (strictStandards && issue.severity === "high") issues.push(issue);
      else warnings.push({ source: row.source, title: plan.title, ...issue });
    }

    const { plan: withCover, meta } = coverAssign.applyCoverToPlan(plan);
    if (!meta.assetExists) {
      issues.push({
        severity: "critical",
        code: "cover_asset_missing",
        detail: `Cover asset missing on disk: ${withCover.coverImageUrl}`,
      });
    }

    const critical = issues.filter((i) => i.severity === "critical");
    if (critical.length) {
      blocking.push({ source: row.source, title: plan.title, issues: critical });
    }

    prepared.push({
      source: row.source,
      plan: withCover,
      coverMeta: meta,
      activityCount,
      daysWithItems: days.length,
      warnings: row.warnings,
      auditIssueCount: (audit.issues || []).length,
    });
  }

  const coverAudit = coverAssign.auditBatchCovers(prepared.map((p) => p.plan));
  return { prepared, blocking, warnings, coverAudit };
}

const remoteUrl = String(process.env.SITE_URL || "").trim();
const useRemote = Boolean(remoteUrl && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD && process.env.ADMIN_ACCESS_CODE);
const LOCAL_PORT = 4700 + Math.floor(Math.random() * 200);
const BASE = useRemote ? remoteUrl.replace(/\/$/, "") : `http://127.0.0.1:${LOCAL_PORT}`;
const ADMIN = useRemote
  ? {
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
      code: process.env.ADMIN_ACCESS_CODE,
    }
  : {
      email: "bulk-import@example.com",
      password: "bulk-import-pass",
      code: "bulk-import-code",
    };
const STORE_PATH = path.join(os.tmpdir(), `llh-bulk-import-${crypto.randomBytes(4).toString("hex")}.json`);

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
      ADMIN_NAME: "Bulk Import Pipeline",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function waitForBoot(child, timeoutMs = 30000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("exit", (code) => {
      if (code !== null && code !== 0) reject(new Error(`Server exited early (${code}): ${stderr.slice(-800)}`));
    });
    const tick = async () => {
      if (child.exitCode !== null) return;
      try {
        const res = await requestJson("GET", "/api/health");
        if (res.status === 200) {
          resolve();
          return;
        }
      } catch { /* retry */ }
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
    child.on("exit", () => { clearTimeout(timer); resolve(); });
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

async function readAdminSite(token) {
  const res = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  assert(res.status === 200, `site-content read failed: ${res.status}`);
  return res.json;
}

async function readPublicLibrary() {
  const res = await requestJson("GET", "/api/site-content");
  assert(res.status === 200, `public site-content failed: ${res.status}`);
  return res.json?.siteContent?.curriculumLibrary?.lessonPlans
    || res.json?.curriculumLibrary?.lessonPlans
    || [];
}

async function saveLesson(token, lessonPlan, expectedUpdatedAt) {
  return requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt,
    lessonPlan,
  });
}

async function saveWithRetry(token, lessonPlan, expectedUpdatedAt, attempts = 5) {
  let stamp = expectedUpdatedAt;
  for (let i = 0; i < attempts; i += 1) {
    const res = await saveLesson(token, lessonPlan, stamp);
    if (res.status === 200) return res;
    if (res.status === 409) {
      stamp = res.json?.siteContentUpdatedAt || (await readAdminSite(token)).siteContent?.updatedAt || stamp;
      await new Promise((r) => setTimeout(r, 100 * (i + 1)));
      continue;
    }
    return res;
  }
  return saveLesson(token, lessonPlan, stamp);
}

function ensureReportDir(reportPath) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
}

async function main() {
  const args = parseArgs(process.argv);
  const startedAt = new Date().toISOString();
  const sources = collectSources(args);
  assert(sources.length > 0, "No import sources. Pass --dir, --files, or --paste.");

  console.log(`Bulk import pipeline — mode=${args.mode}, sources=${sources.length}`);

  const { plans: rawPlans, parseErrors } = parseSources(sources);
  if (parseErrors.length) {
    console.error(`VALIDATION STOPPED: ${parseErrors.length} parse failure(s). No data written.`);
    for (const err of parseErrors.slice(0, 20)) {
      console.error(`  - ${err.source}: ${(err.errors || []).join("; ")}`);
    }
    const report = {
      startedAt,
      finishedAt: new Date().toISOString(),
      mode: args.mode,
      ok: false,
      phase: "validate-parse",
      parseErrors,
    };
    ensureReportDir(args.report);
    fs.writeFileSync(args.report, JSON.stringify(report, null, 2));
    process.exitCode = 1;
    return;
  }

  const { prepared, blocking, warnings, coverAudit } = validatePlans(rawPlans, args);
  if (blocking.length || !coverAudit.ok) {
    console.error("VALIDATION STOPPED: blocking issues found. No data written.");
    for (const row of blocking.slice(0, 30)) {
      console.error(`  - ${row.title || row.source}: ${row.issues.map((i) => i.detail || i.code).join("; ")}`);
    }
    if (!coverAudit.ok) {
      console.error(`  - Cover assets missing: ${coverAudit.missingAssetCount}`);
    }
    const report = {
      startedAt,
      finishedAt: new Date().toISOString(),
      mode: args.mode,
      ok: false,
      phase: "validate",
      blocking,
      warnings: warnings.slice(0, 200),
      coverAudit,
      preparedCount: prepared.length,
    };
    ensureReportDir(args.report);
    fs.writeFileSync(args.report, JSON.stringify(report, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log(`Validated ${prepared.length} lesson plans`);
  console.log(`Covers: illustrated/theme/custom=${coverAudit.illustratedCount}, age-fallback=${coverAudit.needsCustomArtCount}, new files created=0`);
  if (coverAudit.needsCustomArtCount) {
    console.log(`Note: ${coverAudit.needsCustomArtCount} plan(s) use age/default fallback art (still valid). Add catalog JPGs later for unique covers.`);
  }

  if (args.mode === "validate-only") {
    const report = {
      startedAt,
      finishedAt: new Date().toISOString(),
      mode: args.mode,
      ok: true,
      phase: "validate",
      prepared: prepared.map((p) => ({
        source: p.source,
        title: p.plan.title,
        age: p.plan.age,
        theme: p.plan.theme,
        plan: p.plan.plan,
        status: p.plan.status,
        activityCount: p.activityCount,
        daysWithItems: p.daysWithItems,
        coverImageUrl: p.plan.coverImageUrl,
        coverQuality: p.coverMeta.quality,
      })),
      coverAudit: {
        planCount: coverAudit.planCount,
        illustratedCount: coverAudit.illustratedCount,
        needsCustomArtCount: coverAudit.needsCustomArtCount,
        missingAssetCount: coverAudit.missingAssetCount,
        newImageFilesCreated: 0,
        sharedCoverAssignments: coverAudit.sharedCoverAssignments,
      },
      warningCount: warnings.length,
      readyToImport: true,
    };
    ensureReportDir(args.report);
    fs.writeFileSync(args.report, JSON.stringify(report, null, 2));
    console.log(`Ready to import: YES`);
    console.log(`Report: ${args.report}`);
    return;
  }

  let child = null;
  try {
    if (!useRemote) {
      child = startLocalServer();
      await waitForBoot(child);
      console.log(`Local import server on ${BASE}`);
    } else {
      console.log(`Remote import target ${BASE}`);
    }

    const token = await login();
    const beforeAdmin = await readAdminSite(token);
    const beforePlans = beforeAdmin.siteContent?.curriculum?.lessonPlans || [];
    const beforeActivities = beforeAdmin.siteContent?.curriculum?.activities || [];
    const existingByTitleAge = new Map(
      beforePlans.map((p) => [`${String(p.title || "").toLowerCase()}::${String(p.age || "").toLowerCase()}`, p.id]),
    );

    const projectedPlans = beforePlans.length + prepared.filter((p) => {
      const id = stableIdForPlan(p.plan, args.idPrefix, existingByTitleAge);
      return !beforePlans.some((existing) => existing.id === id);
    }).length;
    const projectedActivities = beforeActivities.length + prepared.reduce((sum, p) => sum + p.activityCount, 0);
    if (projectedPlans > MAX_LESSON_PLANS) {
      throw new Error(`Capacity check failed: projected ${projectedPlans} lesson plans exceeds cap ${MAX_LESSON_PLANS}`);
    }
    if (projectedActivities > MAX_ACTIVITIES) {
      throw new Error(`Capacity check failed: projected ~${projectedActivities} activities exceeds cap ${MAX_ACTIVITIES}`);
    }

    const importIds = new Set();
    const preparedWithIds = prepared.map((row) => {
      const id = stableIdForPlan(row.plan, args.idPrefix, existingByTitleAge);
      importIds.add(id);
      return { ...row, plan: { ...row.plan, id } };
    });
    const beforeSnapshot = postImportVerify.snapshotExistingPlans(beforePlans, importIds);

    let expectedUpdatedAt = beforeAdmin.siteContent?.updatedAt || "";
    const importResults = [];
    const importStarted = Date.now();

    for (const row of preparedWithIds) {
      const saveStarted = Date.now();
      const res = await saveWithRetry(token, row.plan, expectedUpdatedAt);
      if (res.status !== 200) {
        console.error(`IMPORT STOPPED after failure on "${row.plan.title}": ${res.status} ${res.text?.slice(0, 300)}`);
        const report = {
          startedAt,
          finishedAt: new Date().toISOString(),
          mode: args.mode,
          ok: false,
          phase: "import",
          failedTitle: row.plan.title,
          failedStatus: res.status,
          failedBody: res.json || res.text,
          importedBeforeFailure: importResults,
        };
        ensureReportDir(args.report);
        fs.writeFileSync(args.report, JSON.stringify(report, null, 2));
        process.exitCode = 1;
        return;
      }
      expectedUpdatedAt = res.json.siteContentUpdatedAt || expectedUpdatedAt;
      importResults.push({
        id: res.json.lessonPlan.id,
        title: res.json.lessonPlan.title,
        coverImageUrl: res.json.lessonPlan.coverImageUrl,
        coverImageSource: res.json.lessonPlan.coverImageSource,
        activityCount: (res.json.activities || []).filter((a) => a.lessonPlanId === res.json.lessonPlan.id && a.status !== "archived").length,
        ms: Date.now() - saveStarted,
      });
      process.stdout.write(".");
    }
    console.log("");
    const importMs = Date.now() - importStarted;
    console.log(`Imported ${importResults.length} plans in ${importMs}ms (avg ${Math.round(importMs / Math.max(importResults.length, 1))}ms/plan)`);

    const afterAdmin = await readAdminSite(token);
    const afterPlans = afterAdmin.siteContent?.curriculum?.lessonPlans || [];
    const afterActivities = afterAdmin.siteContent?.curriculum?.activities || [];
    const publicPlans = await readPublicLibrary();
    const importedPlans = preparedWithIds.map((row) => afterPlans.find((p) => p.id === row.plan.id)).filter(Boolean);

    const verification = postImportVerify.verifyImportedBatch({
      importedPlans,
      allPlans: afterPlans,
      publicPlans,
      activities: afterActivities,
      beforeSnapshot,
      strictStandards: args.strictStandards,
    });

    if (!verification.ok) {
      console.error("POST-IMPORT VERIFICATION FAILED — do not treat this batch as production-ready.");
      for (const item of verification.critical.slice(0, 20)) {
        console.error(`  - ${item.title}: ${(item.issues || []).map((i) => i.detail || i.code).join("; ")}`);
      }
    } else {
      console.log("Post-import verification: PASS");
      console.log(`Existing plans unchanged: ${verification.existingChecked} checked`);
      console.log(`Covers OK (${verification.covers.illustratedCount} illustrated/theme/custom, 0 new image files)`);
    }

    const avgMs = importResults.reduce((sum, r) => sum + r.ms, 0) / Math.max(importResults.length, 1);
    const report = {
      startedAt,
      finishedAt: new Date().toISOString(),
      mode: args.mode,
      ok: verification.ok,
      phase: "verify",
      import: {
        count: importResults.length,
        totalMs: importMs,
        avgMs: Math.round(avgMs),
        results: importResults,
      },
      covers: verification.covers,
      verification,
      performance: {
        avgSaveMs: Math.round(avgMs),
        slow: avgMs > 5000,
        note: avgMs > 5000
          ? "Average save exceeded 5s — investigate store size / DB latency before larger batches."
          : "Save latency within expected range for serialized imports.",
      },
    };
    ensureReportDir(args.report);
    fs.writeFileSync(args.report, JSON.stringify(report, null, 2));
    console.log(`Report: ${args.report}`);
    if (!verification.ok) process.exitCode = 1;
  } finally {
    await stopServer(child);
    try { fs.rmSync(STORE_PATH, { force: true }); } catch { /* ignore */ }
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  collectSources,
  parseSources,
  validatePlans,
  stableIdForPlan,
  MAX_LESSON_PLANS,
  MAX_ACTIVITIES,
};
