#!/usr/bin/env node
/**
 * Migrate curriculumOperatorJobs from hot llh_store → dedicated persistence.
 *
 * DEFAULT: DRY RUN (zero writes).
 *
 *   node scripts/migrate-curriculum-operator-jobs.js --file store.json
 *   PRODUCTION_DATABASE_URL=... node scripts/migrate-curriculum-operator-jobs.js --postgres
 *
 * Apply (test/fixture only unless explicitly authorized later):
 *   ... --apply --confirm-migrate-operator-jobs
 *
 * Never prints secrets, emails, or lesson content payloads — ids/status/bytes only.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const jobApi = require("./curriculum-operator-job.js");
const {
  createCurriculumOperatorJobStore,
  buildHotStoreJobBag,
  isActiveStatus,
  byteLen,
} = require("../server/curriculum-operator-job-store.js");

function parseArgs(argv) {
  const args = {
    file: "",
    postgres: false,
    apply: false,
    confirm: false,
    recordId: "launch-store",
    out: "",
    help: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--postgres") args.postgres = true;
    else if (a === "--file") args.file = String(argv[++i] || "");
    else if (a === "--apply") args.apply = true;
    else if (a === "--confirm-migrate-operator-jobs") args.confirm = true;
    else if (a === "--record-id") args.recordId = String(argv[++i] || "launch-store");
    else if (a === "--out") args.out = String(argv[++i] || "");
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function summarizeJobs(jobs) {
  const byStatus = {};
  for (const job of jobs) {
    const st = String(job.status || "unknown").toLowerCase();
    if (!byStatus[st]) byStatus[st] = { count: 0, bytes: 0 };
    byStatus[st].count += 1;
    byStatus[st].bytes += byteLen(job);
  }
  return byStatus;
}

async function loadStoreFromPostgres(recordId) {
  const url = process.env.PRODUCTION_DATABASE_URL || process.env.DATABASE_URL || "";
  if (!url) throw new Error("PRODUCTION_DATABASE_URL or DATABASE_URL required for --postgres");
  const { Client } = require("pg");
  const client = new Client({
    connectionString: url,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query("SET default_transaction_read_only = on").catch(() => {});
    const result = await client.query("SELECT data FROM llh_store WHERE id = $1", [recordId]);
    if (!result.rows.length) throw new Error(`No llh_store row for id=${recordId}`);
    return { store: result.rows[0].data, client, readOnlySession: true };
  } catch (error) {
    await client.end().catch(() => {});
    throw error;
  }
}

function loadStoreFromFile(filePath) {
  const abs = path.resolve(filePath);
  const parsed = JSON.parse(fs.readFileSync(abs, "utf8"));
  const store = parsed?.store && typeof parsed.store === "object" && !parsed.users
    ? parsed.store
    : parsed?.data && typeof parsed.data === "object" && !parsed.users
      ? parsed.data
      : parsed;
  if (!store || typeof store !== "object") throw new Error("File did not contain a store object");
  return { store, abs };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || (!args.file && !args.postgres)) {
    console.log(`Dry-run curriculumOperatorJobs migration.

Usage:
  node scripts/migrate-curriculum-operator-jobs.js --file store.json
  PRODUCTION_DATABASE_URL=... node scripts/migrate-curriculum-operator-jobs.js --postgres

Apply (requires --apply --confirm-migrate-operator-jobs):
  writes dedicated rows only; optional --rewrite-hot-store not enabled in Stage 1 dry tooling.
`);
    process.exit(args.help ? 0 : 1);
  }

  if (args.apply && !args.confirm) {
    throw new Error("Refusing apply without --confirm-migrate-operator-jobs");
  }
  if (args.apply && args.postgres) {
    throw new Error(
      "Refusing production Postgres apply from this script in Stage 1. "
      + "Use fixture/file apply in tests, or a separately authorized maintenance window.",
    );
  }

  let store;
  let pgClient = null;
  if (args.postgres) {
    const loaded = await loadStoreFromPostgres(args.recordId);
    store = loaded.store;
    pgClient = loaded.client;
  } else {
    store = loadStoreFromFile(args.file).store;
  }

  const bag = jobApi.normalizeOperatorJobStore(store.curriculumOperatorJobs);
  const beforeBytes = byteLen(bag);
  const byStatus = summarizeJobs(bag.jobs);
  const activeJobs = bag.jobs.filter((j) => isActiveStatus(j.status));
  const capped = buildHotStoreJobBag(bag);

  const report = {
    mode: args.apply ? "apply" : "dry-run",
    wrote: false,
    source: args.postgres ? `postgres:${args.recordId}` : "file",
    totalJobs: bag.jobs.length,
    activeJobs: activeJobs.length,
    byStatus,
    bagBytesBefore: beforeBytes,
    bagBytesAfterCap: capped.stats.bytesAfter,
    bytesSavedIfHotCapped: Math.max(0, beforeBytes - capped.stats.bytesAfter),
    reductionPctIfHotCapped: beforeBytes
      ? Math.round(((beforeBytes - capped.stats.bytesAfter) / beforeBytes) * 10000) / 100
      : 0,
    wouldUpsertDedicated: bag.jobs.map((j) => ({
      id: j.id,
      status: j.status,
      bytes: byteLen(j),
      updatedAt: j.updatedAt,
    })),
    conflicts: [],
    applied: [],
    hotCapStats: capped.stats,
  };

  if (!args.apply) {
    if (pgClient) await pgClient.end().catch(() => {});
    const text = JSON.stringify(report, null, 2);
    if (args.out) fs.writeFileSync(path.resolve(args.out), text);
    console.log(text);
    return;
  }

  // File/fixture apply only (production postgres apply blocked above).
  const destPath = path.join(path.dirname(path.resolve(args.file)), "curriculum-operator-jobs.migrated.json");
  const dest = createCurriculumOperatorJobStore({ localFilePath: destPath });
  dest.configure({ usingPostgres: false });
  await dest.loadFromStorage();
  for (const job of bag.jobs) {
    const result = await dest.upsertJob(job);
    if (result.skipped) {
      report.conflicts.push({ id: job.id, reason: result.reason });
    } else {
      report.applied.push({ id: job.id, status: job.status });
    }
  }
  report.wrote = true;
  report.dedicatedFile = destPath;
  report.dedicatedCount = dest._memorySize();

  if (pgClient) await pgClient.end().catch(() => {});
  const text = JSON.stringify(report, null, 2);
  if (args.out) fs.writeFileSync(path.resolve(args.out), text);
  console.log(text);
}

main().catch((error) => {
  console.error("MIGRATION FAILED:", error.message || error);
  process.exit(1);
});
