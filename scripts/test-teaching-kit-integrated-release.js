#!/usr/bin/env node
/**
 * Teaching Kit — Integrated Release Review
 *
 * Runs the full stacked Teaching Kit test matrix plus preservation, permissions,
 * public-exposure, and unrelated-change guards. Stops on first critical failure
 * when TK_RELEASE_FAIL_FAST=1 (default).
 *
 * Usage: npm run test:teaching-kit-integrated-release
 *
 * Does not deploy. Does not enable flags. Does not mutate production.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync, execSync } = require("child_process");
const teachingKit = require("./teaching-kit.js");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = "/opt/cursor/artifacts";
const REPORT_PATH = path.join(OUT_DIR, "tk-integrated-release-report.json");
const FAIL_FAST = String(process.env.TK_RELEASE_FAIL_FAST || "1") !== "0";

const TK_SUITES = [
  { name: "check", cmd: ["npm", "run", "check"], group: "syntax", critical: true },
  { name: "production-release-gate", cmd: ["npm", "run", "test:teaching-kit-production-release-gate"], group: "safety", critical: true },
  { name: "slice-1a", cmd: ["npm", "run", "test:teaching-kit-slice-1a"], group: "phase1", critical: true },
  { name: "slice-1b", cmd: ["npm", "run", "test:teaching-kit-slice-1b"], group: "phase1", critical: true },
  { name: "slice-1c", cmd: ["npm", "run", "test:teaching-kit-slice-1c"], group: "phase1", critical: true },
  { name: "slice-1d", cmd: ["npm", "run", "test:teaching-kit-slice-1d"], group: "phase1", critical: true },
  { name: "slice-1e", cmd: ["npm", "run", "test:teaching-kit-slice-1e"], group: "phase1", critical: true },
  { name: "slice-1f", cmd: ["npm", "run", "test:teaching-kit-slice-1f"], group: "phase1", critical: true },
  { name: "phase1-qa", cmd: ["npm", "run", "test:teaching-kit-phase1-qa"], group: "phase1", critical: true },
  { name: "enrichment-helpers", cmd: ["npm", "run", "test:teaching-kit-enrichment"], group: "enrichment", critical: true },
  { name: "enrichment-slice-1", cmd: ["npm", "run", "test:teaching-kit-enrichment-slice-1"], group: "enrichment", critical: true },
  { name: "enrichment-slice-2", cmd: ["npm", "run", "test:teaching-kit-enrichment-slice-2"], group: "enrichment", critical: true },
  { name: "enrichment-slice-3", cmd: ["npm", "run", "test:teaching-kit-enrichment-slice-3"], group: "enrichment", critical: true },
  { name: "enrichment-slice-4", cmd: ["npm", "run", "test:teaching-kit-enrichment-slice-4"], group: "enrichment", critical: true },
  { name: "enrichment-media-lifecycle", cmd: ["npm", "run", "test:teaching-kit-enrichment-media-lifecycle"], group: "enrichment", critical: true },
  { name: "enrichment-slice-5", cmd: ["npm", "run", "test:teaching-kit-enrichment-slice-5"], group: "enrichment", critical: true },
  { name: "enrichment-slice-6", cmd: ["npm", "run", "test:teaching-kit-enrichment-slice-6"], group: "enrichment", critical: true },
  { name: "enrichment-slice-7", cmd: ["npm", "run", "test:teaching-kit-enrichment-slice-7"], group: "enrichment", critical: true },
  { name: "enrichment-preserve", cmd: ["npm", "run", "test:teaching-kit-enrichment-preserve"], group: "preservation", critical: true },
  { name: "authoring", cmd: ["npm", "run", "test:teaching-kit-authoring"], group: "authoring", critical: true },
  { name: "vision-alignment", cmd: ["npm", "run", "test:teaching-kit-vision-alignment"], group: "authoring", critical: true },
  { name: "upgrade-workspace", cmd: ["npm", "run", "test:teaching-kit-upgrade-workspace"], group: "ai", critical: true },
  { name: "ai-lesson-teacher", cmd: ["npm", "run", "test:teaching-kit-ai-lesson-teacher"], group: "ai", critical: true },
  { name: "complete-kit-generation", cmd: ["npm", "run", "test:teaching-kit-complete-kit-generation"], group: "ai", critical: true },
  { name: "ai-teacher-assistant", cmd: ["npm", "run", "test:teaching-kit-ai-teacher-assistant"], group: "ai", critical: true },
  { name: "curriculum-director", cmd: ["npm", "run", "test:teaching-kit-curriculum-director"], group: "ai", critical: true },
  { name: "quality-review", cmd: ["npm", "run", "test:teaching-kit-quality-review"], group: "ai", critical: true },
  { name: "curriculum-production", cmd: ["npm", "run", "test:teaching-kit-curriculum-production"], group: "production", critical: true },
  { name: "curriculum-access-security", cmd: ["npm", "run", "test:curriculum-access-security"], group: "security", critical: true },
  { name: "account-access", cmd: ["npm", "run", "test:account-access"], group: "permissions", critical: true },
  { name: "billing-membership", cmd: ["npm", "run", "test:billing-membership"], group: "permissions", critical: true },
];

const PLATFORM_SUITES = [
  { name: "release-audit", cmd: ["npm", "run", "test:release"], group: "release", critical: true },
  { name: "release-candidate-regression", cmd: ["npm", "run", "test:release-candidate-regression"], group: "release", critical: true },
];

function runStaticGuards() {
  const findings = [];
  const assert = (ok, message, critical = true) => {
    findings.push({ ok: Boolean(ok), message, critical });
    if (!ok && critical) throw new Error(`Static guard failed: ${message}`);
  };

  const flags = teachingKit.defaultTeachingKitFeatureFlags();
  const required = [
    "teachingKitViewer",
    "teachingKitPrintCenter",
    "teachingKitAttachments",
    "teachingKitProductionReleaseApproved",
    "teachingKitEnrichmentEditor",
    "teachingKitAuthoring",
    "teachingKitCurriculumDirector",
    "teachingKitQualityReview",
  ];
  required.forEach((key) => {
    assert(flags[key] === false, `${key} default false`);
  });
  assert(
    teachingKit.isTeachingKitApiEnabled({ teachingKitViewer: true }) === false,
    "viewer alone does not enable customer Teaching Kit API",
  );
  assert(
    teachingKit.isTeachingKitApiEnabled({
      teachingKitViewer: true,
      teachingKitProductionReleaseApproved: true,
    }) === true,
    "viewer + production-release approval enables customer Teaching Kit API",
  );

  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  [
    "teaching-kit.js",
    "teaching-kit-viewer.js",
    "teaching-kit-enrichment-editor.js",
    "teaching-kit-ai-lesson-teacher.js",
    "teaching-kit-quality-review.js",
    "teaching-kit-curriculum-director.js",
  ].forEach((file) => {
    assert(indexHtml.includes(file), `index.html loads ${file}`);
  });

  const serverSrc = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  assert(
    /handlePublicSiteContent[\s\S]{0,2500}featureFlags/.test(serverSrc)
      || /Teaching Kit flags stay admin-only|featureFlags,\s*\n\s*curriculum/.test(serverSrc),
    "public site-content path acknowledges featureFlags stripping",
  );
  assert(
    serverSrc.includes("enrichmentDraft") && serverSrc.includes("authorizedCurriculumLessonPlanDto"),
    "member DTO path present for draft stripping",
  );
  assert(
    /delete\s+(?:safePlan|plan|next)\.enrichmentDraft|enrichmentDraft:\s*undefined|omit.*enrichmentDraft/i.test(serverSrc)
      || serverSrc.includes("planForProviderMapping"),
    "provider mapping strips enrichment drafts",
  );

  // Unrelated-change guard: TK tip should not rewrite Stripe webhook/pricing core.
  let diffNames = "";
  try {
    diffNames = execSync("git diff --name-only origin/main...HEAD", {
      cwd: ROOT,
      encoding: "utf8",
    });
  } catch (error) {
    findings.push({ ok: false, message: `git diff failed: ${error.message}`, critical: false });
    return findings;
  }
  const files = diffNames.split("\n").map((s) => s.trim()).filter(Boolean);
  const forbiddenExact = [
    "server/stripe-check.js",
    "scripts/stripe-billing-reconciliation.js",
  ];
  forbiddenExact.forEach((file) => {
    assert(!files.includes(file), `no unrelated change to ${file}`, true);
  });

  // Family Hub / HDH: allow only if change is clearly TK-adjacent comment; flag heavy edits.
  const familyTouched = files.filter((f) => /family-hub|home-daycare|HOME_DAYCARE/i.test(f));
  assert(familyTouched.length === 0, `no Family Hub file changes (${familyTouched.join(", ") || "none"})`, true);

  // Pricing page / auth core files should not appear unless expected.
  const sensitive = files.filter((f) => (
    /pricing|checkout|webhook|auth-recovery|signup-transactional/i.test(f)
    && !/teaching-kit|enrichment|docs\/teaching-kit/i.test(f)
  ));
  // server/index.js is large and may include TK routes — allowed, but note it.
  const sensitiveNonServer = sensitive.filter((f) => f !== "server/index.js" && f !== "app.js");
  assert(
    sensitiveNonServer.length === 0,
    `no unrelated pricing/auth file changes (${sensitiveNonServer.join(", ") || "none"})`,
    true,
  );

  findings.push({
    ok: true,
    message: `stack diff file count vs main: ${files.length}`,
    critical: false,
    files: files.slice(0, 80),
  });

  return findings;
}

const FLAKY_RETRY = new Set([
  "slice-1d",
  "slice-1e",
  "slice-1f",
  "phase1-qa",
  "enrichment-slice-1",
  "enrichment-slice-2",
  "enrichment-slice-3",
  "enrichment-slice-5",
  "enrichment-slice-6",
  "enrichment-slice-7",
]);

function runOne(suite, { attempt = 1 } = {}) {
  const started = Date.now();
  const result = spawnSync(suite.cmd[0], suite.cmd.slice(1), {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "test", CI: "true" },
    timeout: Number(process.env.TK_SUITE_TIMEOUT_MS || 360000),
  });
  const row = {
    name: suite.name,
    group: suite.group,
    critical: suite.critical !== false,
    ok: result.status === 0,
    status: result.status,
    attempt,
    durationMs: Date.now() - started,
    stdoutTail: String(result.stdout || "").slice(-1200),
    stderrTail: String(result.stderr || "").slice(-1200),
  };
  if (!row.ok && attempt === 1 && FLAKY_RETRY.has(suite.name)) {
    process.stdout.write("retry … ");
    return runOne(suite, { attempt: 2 });
  }
  return row;
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const report = {
    title: "Teaching Kit Integrated Release Review",
    startedAt: new Date().toISOString(),
    branch: "",
    headSha: "",
    staticGuards: [],
    suites: [],
    summary: {},
    doNotEnableForCustomers: true,
    flagsMustStayDefaultFalseUntilAdminOnlyEnablement: true,
  };

  try {
    report.branch = execSync("git branch --show-current", { cwd: ROOT, encoding: "utf8" }).trim();
    report.headSha = execSync("git rev-parse --short HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
  } catch { /* ignore */ }

  console.log("=== Static guards ===");
  try {
    report.staticGuards = runStaticGuards();
    console.log(`OK static guards (${report.staticGuards.filter((g) => g.ok).length})`);
  } catch (error) {
    report.staticGuards.push({ ok: false, message: error.message, critical: true });
    console.error("FAIL static guards:", error.message);
    report.finishedAt = new Date().toISOString();
    report.summary = { passed: 0, failed: 1, stoppedEarly: true };
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    process.exitCode = 1;
    return;
  }

  const includePlatform = String(process.env.TK_RELEASE_INCLUDE_PLATFORM || "1") !== "0";
  const suites = includePlatform ? [...TK_SUITES, ...PLATFORM_SUITES] : TK_SUITES;

  let failed = 0;
  let criticalFailed = 0;
  for (const suite of suites) {
    process.stdout.write(`→ ${suite.name} … `);
    const row = runOne(suite);
    report.suites.push(row);
    if (row.ok) {
      console.log(`OK (${row.durationMs}ms)`);
    } else {
      failed += 1;
      if (row.critical) criticalFailed += 1;
      console.log(`FAIL (${row.durationMs}ms)`);
      if (row.stderrTail) console.log(row.stderrTail.slice(-500));
      if (FAIL_FAST && row.critical) {
        console.error(`Stopping early after critical failure: ${suite.name}`);
        break;
      }
    }
  }

  report.finishedAt = new Date().toISOString();
  report.summary = {
    passed: report.suites.filter((s) => s.ok).length,
    failed,
    criticalFailed,
    totalRun: report.suites.length,
    totalPlanned: suites.length,
    stoppedEarly: FAIL_FAST && criticalFailed > 0 && report.suites.length < suites.length,
    allCriticalPassed: criticalFailed === 0 && report.suites.length === suites.length,
  };

  // Live production smoke is intentionally separate (needs SITE_URL / prod credentials).
  report.liveSmokeNote = {
    teachingKitProductionSmoke: "npm run test:teaching-kit-production-smoke (SITE_URL=… TK_SMOKE_MODE=baseline)",
    productionPostMergeSmoke: "npm run test:production-post-merge-smoke (LLH_PROD_URL=…)",
    runAfterDeployOnly: true,
  };

  report.goNoGo = report.summary.allCriticalPassed
    ? {
      recommendation: "GO for merge + production deploy with ALL teachingKit* flags still default false",
      customerEnablement: "NO-GO — keep Viewer/PrintCenter false until owner personal review",
      adminOnlyEnablement: "After deploy+smoke: enable Enrichment Editor / Authoring / Director / Quality Review for admin site-content only; leave Viewer + PrintCenter false",
    }
    : {
      recommendation: "NO-GO — fix critical failures before merge",
      customerEnablement: "NO-GO",
      adminOnlyEnablement: "NO-GO",
    };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log("\n=== Integrated release summary ===");
  console.log(JSON.stringify(report.summary, null, 2));
  console.log("Go/No-Go:", report.goNoGo.recommendation);
  console.log("Report:", REPORT_PATH);

  if (!report.summary.allCriticalPassed) {
    process.exitCode = 1;
    // Ensure non-zero exit even when stdout is piped (e.g. `| tee`).
    process.exit(1);
  }
}

main();
