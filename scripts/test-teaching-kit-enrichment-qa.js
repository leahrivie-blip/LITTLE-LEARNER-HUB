#!/usr/bin/env node
/**
 * Enrichment Editor Slice 7 — curated full regression runner.
 * Runs enrichment suites + selected platform regressions and writes a results report.
 *
 * Usage: npm run test:teaching-kit-enrichment-qa
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = "/opt/cursor/artifacts/assets";
const REPORT_PATH = path.join(OUT_DIR, "tk-enrich-slice7-regression-report.json");

const SUITES = [
  { name: "check", cmd: ["npm", "run", "check"], group: "syntax" },
  { name: "enrichment-helpers", cmd: ["npm", "run", "test:teaching-kit-enrichment"], group: "enrichment" },
  { name: "enrichment-slice-1", cmd: ["npm", "run", "test:teaching-kit-enrichment-slice-1"], group: "enrichment" },
  { name: "enrichment-slice-2", cmd: ["npm", "run", "test:teaching-kit-enrichment-slice-2"], group: "enrichment" },
  { name: "enrichment-slice-3", cmd: ["npm", "run", "test:teaching-kit-enrichment-slice-3"], group: "enrichment" },
  { name: "enrichment-slice-4", cmd: ["npm", "run", "test:teaching-kit-enrichment-slice-4"], group: "enrichment" },
  { name: "enrichment-media-lifecycle", cmd: ["npm", "run", "test:teaching-kit-enrichment-media-lifecycle"], group: "enrichment" },
  { name: "enrichment-slice-5", cmd: ["npm", "run", "test:teaching-kit-enrichment-slice-5"], group: "enrichment" },
  { name: "enrichment-slice-6", cmd: ["npm", "run", "test:teaching-kit-enrichment-slice-6"], group: "enrichment" },
  { name: "enrichment-slice-7", cmd: ["npm", "run", "test:teaching-kit-enrichment-slice-7"], group: "enrichment" },
  { name: "enrichment-preserve", cmd: ["npm", "run", "test:teaching-kit-enrichment-preserve"], group: "enrichment" },
  { name: "teaching-kit-phase1-qa", cmd: ["npm", "run", "test:teaching-kit-phase1-qa"], group: "teaching-kit" },
  { name: "teaching-kit-slice-1a", cmd: ["npm", "run", "test:teaching-kit-slice-1a"], group: "teaching-kit" },
  { name: "teaching-kit-slice-1f", cmd: ["npm", "run", "test:teaching-kit-slice-1f"], group: "print" },
  { name: "curriculum-access-security", cmd: ["npm", "run", "test:curriculum-access-security"], group: "security" },
  { name: "account-access", cmd: ["npm", "run", "test:account-access"], group: "permissions" },
  { name: "billing-membership", cmd: ["npm", "run", "test:billing-membership"], group: "permissions" },
  { name: "lesson-library-header", cmd: ["npm", "run", "test:lesson-library-header"], group: "library" },
  { name: "homepage-smoke", cmd: ["npm", "run", "test:homepage-smoke"], group: "platform" },
  { name: "curriculum-ux", cmd: ["npm", "run", "test:curriculum-ux"], group: "curriculum" },
  { name: "navigation-history", cmd: ["npm", "run", "test:navigation-history"], group: "navigation" },
];

function runOne(suite) {
  const started = Date.now();
  const result = spawnSync(suite.cmd[0], suite.cmd.slice(1), {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "test" },
    timeout: 240000,
  });
  const durationMs = Date.now() - started;
  const ok = result.status === 0;
  return {
    name: suite.name,
    group: suite.group,
    ok,
    status: result.status,
    durationMs,
    stdoutTail: String(result.stdout || "").slice(-800),
    stderrTail: String(result.stderr || "").slice(-800),
  };
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const report = {
    title: "Teaching Kit Enrichment Editor — Slice 7 regression report",
    startedAt: new Date().toISOString(),
    suites: [],
  };
  let failed = 0;
  for (const suite of SUITES) {
    process.stdout.write(`→ ${suite.name} … `);
    const row = runOne(suite);
    report.suites.push(row);
    if (row.ok) {
      console.log(`OK (${row.durationMs}ms)`);
    } else {
      failed += 1;
      console.log(`FAIL (${row.durationMs}ms)`);
      if (row.stderrTail) console.log(row.stderrTail.slice(-400));
    }
  }
  report.finishedAt = new Date().toISOString();
  report.passed = report.suites.filter((s) => s.ok).length;
  report.failed = failed;
  report.total = report.suites.length;
  // Attach performance metrics if present
  const metricsPath = path.join(OUT_DIR, "tk-enrich-slice7-metrics.json");
  if (fs.existsSync(metricsPath)) {
    report.performance = JSON.parse(fs.readFileSync(metricsPath, "utf8"));
  }
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`\nReport: ${REPORT_PATH}`);
  console.log(`Passed ${report.passed}/${report.total}`);
  if (failed) process.exitCode = 1;
}

main();
