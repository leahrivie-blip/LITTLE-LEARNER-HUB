#!/usr/bin/env node
/**
 * Isolated tests for Operator job-store path resolution.
 * Run: npm run test:curriculum-operator-job-store-path
 */
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const jobStore = require("../server/curriculum-operator-job-store.js");
const jobApi = require("./curriculum-operator-job.js");

const DEFAULT_PATH = path.join(__dirname, "..", "server", "data", "curriculum-operator-jobs.json");
let passed = 0;

function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

function sha256File(filePath) {
  if (!fs.existsSync(filePath)) return "";
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

console.log("1. Default path preserved");
{
  const resolved = jobStore.resolveCurriculumOperatorJobStoreLocalPath({
    NODE_ENV: "test",
    DATABASE_PROVIDER: "local-json",
  });
  ok(resolved === DEFAULT_PATH, "no override resolves to dedicated Operator job store");
  ok(resolved === jobStore.defaultLocalJobStorePath(), "default helper matches dedicated path");

  const production = jobStore.resolveCurriculumOperatorJobStoreLocalPath({
    NODE_ENV: "production",
    DATABASE_PROVIDER: "local-json",
    CURRICULUM_OPERATOR_JOB_STORE_PATH: "/tmp/should-not-use.json",
  });
  ok(production === DEFAULT_PATH, "production NODE_ENV ignores override");

  const postgres = jobStore.resolveCurriculumOperatorJobStoreLocalPath({
    NODE_ENV: "test",
    DATABASE_PROVIDER: "postgres",
    PRODUCTION_DATABASE_URL: "postgres://example.invalid/db",
    CURRICULUM_OPERATOR_JOB_STORE_PATH: "/tmp/should-not-use.json",
  });
  ok(postgres === null, "postgres intended still returns null");
}

console.log("\n2. Override honored");
(async () => {
  const isolated = path.join(os.tmpdir(), `llh-opjob-path-${crypto.randomBytes(4).toString("hex")}.json`);
  const beforeSha = sha256File(DEFAULT_PATH);
  const beforeSize = fs.existsSync(DEFAULT_PATH) ? fs.statSync(DEFAULT_PATH).size : 0;
  try {
    const resolved = jobStore.resolveCurriculumOperatorJobStoreLocalPath({
      NODE_ENV: "test",
      DATABASE_PROVIDER: "local-json",
      CURRICULUM_OPERATOR_JOB_STORE_PATH: isolated,
    });
    ok(resolved === isolated, "test override resolves to the supplied temp file");
    ok(resolved !== DEFAULT_PATH, "override is not the dedicated repository file");

    const store = jobStore.createCurriculumOperatorJobStore({ localFilePath: resolved });
    store.configure({ intendedPostgres: false });
    await store.loadFromStorage();
    const job = jobApi.normalizeOperatorJob({
      id: `opjob_${crypto.randomBytes(4).toString("hex")}`,
      status: "completed",
      createdBy: "path-isolation-test",
      mutationsEnabled: false,
      command: { rawCommand: "path isolation write" },
    });
    await store.upsertJob(job);
    ok(fs.existsSync(isolated), "override file received the write");
    const written = JSON.parse(fs.readFileSync(isolated, "utf8"));
    ok(Boolean(written.jobs && written.jobs[job.id]), "written job is only in the override file");
    ok(!fs.existsSync(DEFAULT_PATH) || sha256File(DEFAULT_PATH) === beforeSha, "dedicated store sha256 unchanged");
    ok(!fs.existsSync(DEFAULT_PATH) || fs.statSync(DEFAULT_PATH).size === beforeSize, "dedicated store size unchanged");
  } finally {
    try { fs.unlinkSync(isolated); } catch { /* ignore */ }
  }

  console.log(`\nOK curriculum-operator-job-store-path (${passed} assertions)`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
