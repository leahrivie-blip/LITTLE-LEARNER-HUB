#!/usr/bin/env node
/**
 * Stage 1 regression: curriculumOperatorJobs dedicated persistence + hot-store cap.
 * Run: NODE_ENV=test node scripts/test-curriculum-operator-job-store-offload.js
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const jobApi = require("./curriculum-operator-job.js");
const {
  createCurriculumOperatorJobStore,
  buildHotStoreJobBag,
  byteLen,
} = require("../server/curriculum-operator-job-store.js");

function tmp(name) {
  return path.join(os.tmpdir(), `llh-opjob-${name}-${crypto.randomBytes(4).toString("hex")}.json`);
}

function fatLessonResults(n = 3) {
  return Array.from({ length: n }, (_, i) => ({
    lessonId: `cur-lp-test-${i}`,
    title: `Lesson ${i}`,
    status: "success",
    audit: { blob: "x".repeat(5000) },
    generated: [{ text: "y".repeat(2000) }],
  }));
}

function makeJob(overrides = {}) {
  return jobApi.normalizeOperatorJob({
    id: overrides.id || `opjob_${crypto.randomBytes(4).toString("hex")}`,
    status: overrides.status || "completed",
    createdAt: overrides.createdAt || "2026-08-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt || "2026-08-02T00:00:00.000Z",
    createdBy: "owner@example.com",
    phase: 2,
    lessonResults: overrides.lessonResults !== undefined ? overrides.lessonResults : fatLessonResults(2),
    log: overrides.log || [{ at: "2026-08-02T00:00:00.000Z", level: "info", message: "done" }],
    ...overrides,
  });
}

async function main() {
  console.log("A) historical job readable through fallback merge");
  const storeA = createCurriculumOperatorJobStore({ localFilePath: tmp("a") });
  storeA.configure({ usingPostgres: false });
  await storeA.loadFromStorage();
  const legacyJob = makeJob({ id: "opjob_legacy_only", status: "completed" });
  const merged = storeA.mergeWithLegacyBag({ jobs: [legacyJob], updatedAt: "2026-08-01T00:00:00.000Z" });
  assert.ok(merged.jobs.some((j) => j.id === "opjob_legacy_only"), "legacy fallback job present");
  assert.ok(Array.isArray(merged.jobs.find((j) => j.id === "opjob_legacy_only").lessonResults));
  console.log("PASS  A");

  console.log("B) newly created job persists in dedicated storage");
  const fileB = tmp("b");
  const storeB = createCurriculumOperatorJobStore({ localFilePath: fileB });
  storeB.configure({ usingPostgres: false });
  await storeB.loadFromStorage();
  const created = makeJob({ id: "opjob_new", status: "running", lessonResults: fatLessonResults(1) });
  await storeB.upsertJob(created);
  const storeB2 = createCurriculumOperatorJobStore({ localFilePath: fileB });
  storeB2.configure({ usingPostgres: false });
  await storeB2.loadFromStorage();
  const loaded = await storeB2.getJob("opjob_new");
  assert.equal(loaded?.status, "running");
  assert.ok(loaded.lessonResults.length >= 1, "full lessonResults retained in dedicated store");
  console.log("PASS  B");

  console.log("C) job progress update survives reload");
  loaded.progress.completed = 1;
  loaded.updatedAt = "2026-08-03T00:00:00.000Z";
  loaded.status = "running";
  await storeB2.upsertJob(loaded);
  const storeB3 = createCurriculumOperatorJobStore({ localFilePath: fileB });
  storeB3.configure({ usingPostgres: false });
  await storeB3.loadFromStorage();
  const again = await storeB3.getJob("opjob_new");
  assert.equal(again.progress.completed, 1);
  assert.equal(again.status, "running");
  console.log("PASS  C");

  console.log("D) completed job result remains accessible from dedicated store");
  again.status = "completed";
  again.updatedAt = "2026-08-04T00:00:00.000Z";
  again.lessonResults = fatLessonResults(3);
  await storeB3.upsertJob(again);
  const storeB4 = createCurriculumOperatorJobStore({ localFilePath: fileB });
  storeB4.configure({ usingPostgres: false });
  await storeB4.loadFromStorage();
  const completed = await storeB4.getJob("opjob_new");
  assert.equal(completed.status, "completed");
  assert.equal(completed.lessonResults.length, 3);
  console.log("PASS  D");

  console.log("E) active/resumable job never removed by cap logic");
  const running = makeJob({ id: "opjob_run", status: "running", updatedAt: "2026-08-10T00:00:00.000Z" });
  const manyTerminal = Array.from({ length: 20 }, (_, i) => makeJob({
    id: `opjob_done_${i}`,
    status: i % 2 ? "failed" : "completed",
    updatedAt: `2026-08-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
  }));
  const capped = buildHotStoreJobBag({ jobs: [running, ...manyTerminal] });
  assert.ok(capped.bag.jobs.some((j) => j.id === "opjob_run" && j.status === "running"));
  assert.ok(
    capped.bag.jobs.find((j) => j.id === "opjob_run").lessonResults.length > 0,
    "active job keeps full lessonResults in hot bag",
  );
  assert.ok(capped.stats.terminalStubbed <= 10);
  assert.ok(capped.stats.terminalDroppedFromHotStore >= 10);
  const stub = capped.bag.jobs.find((j) => j.id === "opjob_done_19");
  assert.ok(stub);
  assert.equal(stub.hotStoreStub, true);
  assert.equal(stub.lessonResults.length, 0);
  console.log("PASS  E");

  console.log("F) dry-run migration performs zero writes");
  const fixture = tmp("fixture-store");
  const fixtureStore = {
    users: { "a@example.com": { email: "a@example.com" } },
    programData: { keep: true },
    curriculumOperatorJobs: {
      jobs: [makeJob({ id: "opjob_mig_1", status: "completed" }), makeJob({ id: "opjob_mig_run", status: "running" })],
      updatedAt: "2026-08-01T00:00:00.000Z",
    },
    siteContent: { curriculum: { lessonPlans: [{ id: "cur-lp-x", title: "X" }], activities: [] } },
  };
  const beforeHash = crypto.createHash("sha256").update(JSON.stringify(fixtureStore)).digest("hex");
  fs.writeFileSync(fixture, JSON.stringify(fixtureStore));
  const { spawnSync } = require("node:child_process");
  const dry = spawnSync(process.execPath, [path.join(__dirname, "migrate-curriculum-operator-jobs.js"), "--file", fixture], {
    encoding: "utf8",
  });
  assert.equal(dry.status, 0, dry.stderr || dry.stdout);
  const dryReport = JSON.parse(dry.stdout.slice(dry.stdout.indexOf("{")));
  assert.equal(dryReport.mode, "dry-run");
  assert.equal(dryReport.wrote, false);
  const afterHash = crypto.createHash("sha256").update(fs.readFileSync(fixture)).digest("hex");
  assert.equal(beforeHash, afterHash, "dry-run must not mutate store file");
  console.log("PASS  F");

  console.log("G) migration apply is idempotent in fixture env");
  const apply1 = spawnSync(
    process.execPath,
    [path.join(__dirname, "migrate-curriculum-operator-jobs.js"), "--file", fixture, "--apply", "--confirm-migrate-operator-jobs"],
    { encoding: "utf8" },
  );
  assert.equal(apply1.status, 0, apply1.stderr || apply1.stdout);
  const report1 = JSON.parse(apply1.stdout.slice(apply1.stdout.indexOf("{")));
  assert.equal(report1.wrote, true);
  assert.ok(report1.applied.length >= 2);
  const apply2 = spawnSync(
    process.execPath,
    [path.join(__dirname, "migrate-curriculum-operator-jobs.js"), "--file", fixture, "--apply", "--confirm-migrate-operator-jobs"],
    { encoding: "utf8" },
  );
  assert.equal(apply2.status, 0, apply2.stderr || apply2.stdout);
  const report2 = JSON.parse(apply2.stdout.slice(apply2.stdout.indexOf("{")));
  assert.equal(report2.wrote, true);
  // Second apply should skip as destination_newer or re-apply same timestamps without error.
  assert.ok(report2.applied.length + report2.conflicts.length >= 2);
  console.log("PASS  G");

  console.log("H) destination conflict does not overwrite newer data");
  const fileH = tmp("h");
  const storeH = createCurriculumOperatorJobStore({ localFilePath: fileH });
  storeH.configure({ usingPostgres: false });
  await storeH.loadFromStorage();
  await storeH.upsertJob(makeJob({
    id: "opjob_conflict",
    status: "completed",
    updatedAt: "2026-08-20T00:00:00.000Z",
    lessonResults: [{ lessonId: "a", status: "success", title: "newer" }],
  }));
  const skipped = await storeH.upsertJob(makeJob({
    id: "opjob_conflict",
    status: "failed",
    updatedAt: "2026-08-10T00:00:00.000Z",
    lessonResults: [{ lessonId: "a", status: "failed", title: "older" }],
  }));
  assert.equal(skipped.skipped, true);
  assert.equal(skipped.reason, "destination_newer");
  const kept = await storeH.getJob("opjob_conflict");
  assert.equal(kept.status, "completed");
  assert.equal(kept.lessonResults[0].title, "newer");
  console.log("PASS  H");

  console.log("I) Postgres-required persist failure is fail-closed");
  const storeI2 = createCurriculumOperatorJobStore({ localFilePath: tmp("should-never-write-i2") });
  storeI2.configure({
    intendedPostgres: true,
    pool: {
      query: async (sql) => {
        const s = String(sql);
        if (/CREATE TABLE|CREATE INDEX/i.test(s)) return { rows: [], rowCount: 0 };
        if (/SELECT id, data FROM llh_curriculum_operator_jobs/i.test(s)) return { rows: [], rowCount: 0 };
        if (/INSERT INTO llh_curriculum_operator_jobs/i.test(s)) throw new Error("simulated postgres down");
        return { rows: [], rowCount: 0 };
      },
    },
  });
  await storeI2.initTable();
  await storeI2.loadFromStorage();
  assert.equal(storeI2.backendMode(), "postgres");
  assert.equal(storeI2.canSafelyCapHotStore(), true);
  let failed = null;
  try {
    await storeI2.upsertJob(makeJob({ id: "opjob_failclosed", status: "completed", lessonResults: fatLessonResults(2) }));
  } catch (error) {
    failed = error;
  }
  assert.ok(failed, "must throw");
  assert.equal(failed.code, "operator_job_persist_failed");
  assert.equal(storeI2._memorySize(), 0, "failed upsert must not cache job");
  console.log("PASS  I");

  console.log("J/K) hot cap preserves curriculum/users/programData shapes; dedicated keeps terminal payloads");
  const fileJ = tmp("j-dedicated");
  const jobStoreJ = createCurriculumOperatorJobStore({ localFilePath: fileJ });
  jobStoreJ.configure({ usingPostgres: false });
  await jobStoreJ.loadFromStorage();

  const curriculum = { lessonPlans: [{ id: "cur-lp-keep", title: "Keep" }], activities: [{ id: "act-1" }] };
  const curriculumFingerprint = crypto.createHash("sha256").update(JSON.stringify(curriculum)).digest("hex");
  const liveStore = {
    users: { "member@example.com": { email: "member@example.com", plan: "Pro" } },
    programData: { prog_1: { children: [{ id: "c1" }] } },
    scheduleByUser: { "member@example.com": { monday: [] } },
    billingEvents: [{ id: "b1" }],
    siteContent: { curriculum: JSON.parse(JSON.stringify(curriculum)) },
    curriculumOperatorJobs: { jobs: [], updatedAt: "" },
  };

  const jobsBag = {
    jobs: [
      makeJob({ id: "opjob_hot_run", status: "running", updatedAt: "2026-08-30T00:00:00.000Z" }),
      makeJob({ id: "opjob_hot_done", status: "completed", updatedAt: "2026-08-29T00:00:00.000Z" }),
    ],
    updatedAt: "2026-08-30T00:00:00.000Z",
  };
  await jobStoreJ.upsertJobs(jobsBag.jobs);
  const hot = buildHotStoreJobBag(jobsBag);
  liveStore.curriculumOperatorJobs = hot.bag;

  const currHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(liveStore.siteContent.curriculum))
    .digest("hex");
  assert.equal(currHash, curriculumFingerprint, "curriculum byte-identical");
  assert.equal(liveStore.users["member@example.com"].plan, "Pro");
  assert.ok(liveStore.programData.prog_1);
  assert.ok(liveStore.scheduleByUser["member@example.com"]);
  assert.equal(liveStore.billingEvents[0].id, "b1");
  const hotRun = liveStore.curriculumOperatorJobs.jobs.find((j) => j.id === "opjob_hot_run");
  const hotDone = liveStore.curriculumOperatorJobs.jobs.find((j) => j.id === "opjob_hot_done");
  assert.ok(hotRun.lessonResults.length > 0, "active preserved full");
  assert.equal(hotDone.lessonResults.length, 0, "terminal stubbed in hot store");
  const dedicatedDone = await jobStoreJ.getJob("opjob_hot_done");
  assert.ok(dedicatedDone.lessonResults.length > 0, "terminal full payload in dedicated store");
  console.log("PASS  J/K");

  console.log("L) size regression: hot bag shrinks; dedicated retains history");
  // Realistic pressure: 1 active + many fat terminal jobs (mirrors prod skew).
  const fatHistory = {
    jobs: [
      makeJob({ id: "opjob_size_run", status: "running", updatedAt: "2026-08-30T00:00:00.000Z", lessonResults: fatLessonResults(2) }),
      ...Array.from({ length: 25 }, (_, i) => makeJob({
        id: `opjob_size_done_${i}`,
        status: i % 2 ? "failed" : "completed",
        updatedAt: `2026-08-${String((i % 28) + 1).padStart(2, "0")}T12:00:00.000Z`,
        lessonResults: fatLessonResults(4),
      })),
    ],
    updatedAt: "2026-08-30T00:00:00.000Z",
  };
  const fileL = tmp("l-dedicated");
  const jobStoreL = createCurriculumOperatorJobStore({ localFilePath: fileL });
  jobStoreL.configure({ usingPostgres: false });
  await jobStoreL.loadFromStorage();
  await jobStoreL.upsertJobs(fatHistory.jobs);
  const hotL = buildHotStoreJobBag(fatHistory);
  const originalBytes = byteLen(fatHistory);
  const hotBytes = byteLen(hotL.bag);
  assert.ok(hotBytes < originalBytes, "hot store smaller");
  const reductionPct = Math.round(((originalBytes - hotBytes) / originalBytes) * 10000) / 100;
  console.log(JSON.stringify({
    originalCurriculumOperatorJobsBytes: originalBytes,
    hotStoreCurriculumOperatorJobsBytes: hotBytes,
    percentageReduction: reductionPct,
    recordsPreservedInDedicated: jobStoreL._memorySize(),
    activeJobsPreservedFull: hotL.stats.activeKeptFull,
    terminalStubbed: hotL.stats.terminalStubbed,
    terminalDroppedFromHotStore: hotL.stats.terminalDroppedFromHotStore,
  }));
  assert.ok(reductionPct > 80, "expect large reduction when fat terminal lessonResults leave hot bag");
  assert.equal(hotL.stats.activeKeptFull, 1);
  assert.ok(hotL.bag.jobs.some((j) => j.id === "opjob_size_run" && j.lessonResults.length > 0));
  console.log("PASS  L/M size regression");

  // —— Production backend-safety regressions (blocking for PR #798) ——
  const { createCurriculumOperatorApi } = require("../server/curriculum-operator.js");

  function makeWriteApi(operatorJobStore, storeRef) {
    return createCurriculumOperatorApi({
      readJson: async () => ({}),
      jsonResponse: () => {},
      readStore: () => storeRef.store,
      writeStoreAsync: async (next) => { storeRef.store = next; },
      requireTeachingKitOwnerAdminSession: () => ({ email: "owner@example.com" }),
      teachingKit: {
        isTeachingKitCurriculumOperatorEnabled: () => true,
        isTeachingKitOwnerPreviewEmail: () => true,
      },
      normalizeEmail: (e) => String(e || "").toLowerCase(),
      readSiteCurriculum: () => ({ lessonPlans: [], activities: [] }),
      operatorJobStore,
    });
  }

  console.log("N1) Postgres configured but not ready — no local-file substitute, no hot-stub");
  const sideFileN1 = tmp("n1-side");
  const storeN1 = createCurriculumOperatorJobStore({ localFilePath: sideFileN1 });
  storeN1.configure({ intendedPostgres: true, pool: null });
  assert.equal(storeN1.backendMode(), "postgres");
  assert.equal(storeN1.canSafelyCapHotStore(), false);
  assert.equal(storeN1.isReady(), false);
  let n1UpsertErr = null;
  try {
    await storeN1.upsertJob(makeJob({ id: "opjob_n1", status: "completed" }));
  } catch (error) {
    n1UpsertErr = error;
  }
  assert.equal(n1UpsertErr?.code, "operator_job_backend_not_ready");
  assert.equal(fs.existsSync(sideFileN1), false, "must not create local side-file in postgres mode");

  const fullTerminal = makeJob({
    id: "opjob_n1_full",
    status: "completed",
    lessonResults: fatLessonResults(3),
  });
  const storeRefN1 = {
    store: {
      curriculumOperatorJobs: { jobs: [fullTerminal], updatedAt: "2026-08-01T00:00:00.000Z" },
    },
  };
  const apiN1 = makeWriteApi(storeN1, storeRefN1);
  await apiN1.writeJobs(storeRefN1.store, { jobs: [fullTerminal] });
  const keptN1 = storeRefN1.store.curriculumOperatorJobs.jobs.find((j) => j.id === "opjob_n1_full");
  assert.ok(keptN1.lessonResults.length === 3, "full lessonResults preserved when Postgres not ready");
  assert.notEqual(keptN1.hotStoreStub, true);
  assert.equal(fs.existsSync(sideFileN1), false);
  console.log("PASS  N1");

  console.log("N2) Postgres dedicated upsert fails — writeJobs does not stub");
  const storeN2 = createCurriculumOperatorJobStore({ localFilePath: tmp("n2-unused") });
  storeN2.configure({
    intendedPostgres: true,
    pool: {
      query: async (sql) => {
        const s = String(sql);
        if (/CREATE TABLE|CREATE INDEX/i.test(s)) return { rows: [], rowCount: 0 };
        if (/SELECT id, data/i.test(s)) return { rows: [], rowCount: 0 };
        if (/INSERT INTO llh_curriculum_operator_jobs/i.test(s)) throw new Error("upsert boom");
        return { rows: [], rowCount: 0 };
      },
    },
  });
  await storeN2.initTable();
  await storeN2.loadFromStorage();
  const termN2 = makeJob({ id: "opjob_n2", status: "completed", lessonResults: fatLessonResults(2) });
  const storeRefN2 = {
    store: { curriculumOperatorJobs: { jobs: [termN2], updatedAt: "" } },
  };
  const apiN2 = makeWriteApi(storeN2, storeRefN2);
  let n2err = null;
  try {
    await apiN2.writeJobs(storeRefN2.store, { jobs: [termN2] });
  } catch (error) {
    n2err = error;
  }
  assert.ok(n2err, "writeJobs fail-closed");
  const afterN2 = storeRefN2.store.curriculumOperatorJobs.jobs.find((j) => j.id === "opjob_n2");
  assert.ok(afterN2.lessonResults.length === 2, "lessonResults not replaced with []");
  console.log("PASS  N2");

  console.log("N3) Postgres recovers — dedicated becomes usable; still never uses side-file");
  const sideN3 = tmp("n3-side");
  const dbN3 = new Map();
  let n3Ready = false;
  const storeN3 = createCurriculumOperatorJobStore({ localFilePath: sideN3 });
  storeN3.configure({ intendedPostgres: true, pool: null });
  assert.equal(storeN3.canSafelyCapHotStore(), false);

  const poolN3 = {
    query: async (sql, params = []) => {
      const s = String(sql);
      if (/CREATE TABLE|CREATE INDEX/i.test(s)) return { rows: [], rowCount: 0 };
      if (/SELECT id, data FROM llh_curriculum_operator_jobs ORDER BY/i.test(s)) {
        return { rows: Array.from(dbN3.values()).map((data) => ({ id: data.id, data })), rowCount: dbN3.size };
      }
      if (/SELECT data FROM llh_curriculum_operator_jobs WHERE id/i.test(s)) {
        const row = dbN3.get(params[0]);
        return row ? { rows: [{ data: row }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      if (/INSERT INTO\s+llh_curriculum_operator_jobs/i.test(s)) {
        const id = params[0];
        const raw = params[6];
        const incoming = typeof raw === "string" ? JSON.parse(raw) : (raw && typeof raw === "object" ? raw : { id });
        const existing = dbN3.get(id);
        if (existing) {
          const existingMs = Date.parse(existing.updatedAt || "") || 0;
          const nextMs = Date.parse(incoming.updatedAt || "") || 0;
          if (existingMs > nextMs) return { rows: [], rowCount: 0 };
        }
        dbN3.set(id, incoming);
        return { rows: [{ data: incoming }], rowCount: 1 };
      }
      throw new Error(`unexpected SQL in N3 mock: ${s.slice(0, 120)}`);
    },
  };

  // Simulate reconnect: still postgres mode, now with pool
  storeN3.configure({ intendedPostgres: true, pool: poolN3 });
  await storeN3.initTable();
  await storeN3.loadFromStorage();
  assert.equal(storeN3.backendMode(), "postgres");
  assert.equal(storeN3.canSafelyCapHotStore(), true);
  n3Ready = true;

  const termN3 = makeJob({ id: "opjob_n3", status: "completed", lessonResults: fatLessonResults(2) });
  const storeRefN3 = { store: { curriculumOperatorJobs: { jobs: [termN3], updatedAt: "" } } };
  const apiN3 = makeWriteApi(storeN3, storeRefN3);
  await apiN3.writeJobs(storeRefN3.store, { jobs: [termN3] });
  const hotN3 = storeRefN3.store.curriculumOperatorJobs.jobs.find((j) => j.id === "opjob_n3");
  assert.equal(hotN3.lessonResults.length, 0, "hot stub only after verified dedicated persist");
  assert.equal(hotN3.hotStoreStub, true);
  const dedicatedN3 = await storeN3.getJob("opjob_n3");
  assert.ok(dedicatedN3.lessonResults.length === 2);
  assert.equal(fs.existsSync(sideN3), false, "side-file never used as transition mechanism");
  void n3Ready;
  console.log("PASS  N3");

  console.log("N4) Intentional local/test mode still works");
  const fileN4 = tmp("n4-local");
  const storeN4 = createCurriculumOperatorJobStore({ localFilePath: fileN4 });
  storeN4.configure({ intendedPostgres: false });
  await storeN4.loadFromStorage();
  assert.equal(storeN4.backendMode(), "local-file");
  assert.equal(storeN4.canSafelyCapHotStore(), true);
  await storeN4.upsertJob(makeJob({ id: "opjob_n4", status: "running" }));
  assert.ok(fs.existsSync(fileN4));
  console.log("PASS  N4");

  console.log("N5) initTable failure — legacy full jobs readable; no hot-cap");
  const storeN5 = createCurriculumOperatorJobStore({ localFilePath: tmp("n5") });
  storeN5.configure({
    intendedPostgres: true,
    pool: {
      query: async () => {
        throw new Error("CREATE TABLE failed");
      },
    },
  });
  let n5init = null;
  try {
    await storeN5.initTable();
  } catch (error) {
    n5init = error;
  }
  assert.ok(n5init);
  assert.equal(storeN5.canSafelyCapHotStore(), false);
  const legacyN5 = makeJob({ id: "opjob_n5_legacy", status: "completed", lessonResults: fatLessonResults(2) });
  const mergedN5 = storeN5.mergeWithLegacyBag({ jobs: [legacyN5], updatedAt: "" });
  assert.equal(mergedN5.jobs[0].lessonResults.length, 2);
  const storeRefN5 = { store: { curriculumOperatorJobs: { jobs: [legacyN5], updatedAt: "" } } };
  await makeWriteApi(storeN5, storeRefN5).writeJobs(storeRefN5.store, { jobs: [legacyN5] });
  assert.equal(
    storeRefN5.store.curriculumOperatorJobs.jobs[0].lessonResults.length,
    2,
    "no terminal lessonResults disappear on init failure",
  );
  console.log("PASS  N5");

  console.log("N6) active job remains full regardless of backend readiness");
  const activeJob = makeJob({ id: "opjob_n6_run", status: "running", lessonResults: fatLessonResults(2) });
  const capActive = buildHotStoreJobBag({ jobs: [activeJob] });
  assert.ok(capActive.bag.jobs[0].lessonResults.length > 0);
  const storeN6 = createCurriculumOperatorJobStore({ localFilePath: tmp("n6") });
  storeN6.configure({ intendedPostgres: true, pool: null });
  const storeRefN6 = { store: { curriculumOperatorJobs: { jobs: [activeJob], updatedAt: "" } } };
  await makeWriteApi(storeN6, storeRefN6).writeJobs(storeRefN6.store, { jobs: [activeJob] });
  assert.ok(storeRefN6.store.curriculumOperatorJobs.jobs[0].lessonResults.length > 0);
  console.log("PASS  N6");

  console.log("N7) stale memory + newer DB row — do not cache older incoming");
  const dbN7 = new Map();
  const newer = makeJob({
    id: "opjob_n7",
    status: "completed",
    updatedAt: "2026-08-20T00:00:00.000Z",
    lessonResults: [{ lessonId: "a", status: "success", title: "db-newer" }],
  });
  dbN7.set("opjob_n7", newer);
  const storeN7 = createCurriculumOperatorJobStore({ localFilePath: null });
  storeN7.configure({
    intendedPostgres: true,
    pool: {
      query: async (sql, params = []) => {
        const s = String(sql);
        if (/CREATE TABLE|CREATE INDEX/i.test(s)) return { rows: [], rowCount: 0 };
        if (/SELECT id, data FROM llh_curriculum_operator_jobs ORDER BY/i.test(s)) {
          return { rows: [], rowCount: 0 }; // memory starts empty / stale
        }
        if (/SELECT data FROM llh_curriculum_operator_jobs WHERE id/i.test(s)) {
          const row = dbN7.get(params[0]);
          return row ? { rows: [{ data: row }], rowCount: 1 } : { rows: [], rowCount: 0 };
        }
        if (/INSERT INTO llh_curriculum_operator_jobs/i.test(s)) {
          const id = params[0];
          const incoming = JSON.parse(params[6]);
          const existing = dbN7.get(id);
          if (existing) {
            const existingMs = Date.parse(existing.updatedAt || "") || 0;
            const nextMs = Date.parse(incoming.updatedAt || "") || 0;
            if (existingMs > nextMs) return { rows: [], rowCount: 0 }; // WHERE fails → no RETURNING
          }
          dbN7.set(id, incoming);
          return { rows: [{ data: incoming }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      },
    },
  });
  await storeN7.initTable();
  await storeN7.loadFromStorage();
  assert.equal(storeN7._memorySize(), 0, "memory stale/empty");
  const older = makeJob({
    id: "opjob_n7",
    status: "failed",
    updatedAt: "2026-08-10T00:00:00.000Z",
    lessonResults: [{ lessonId: "a", status: "failed", title: "older-incoming" }],
  });
  const resultN7 = await storeN7.upsertJob(older);
  assert.equal(resultN7.skipped, true);
  assert.equal(resultN7.reason, "destination_newer");
  assert.equal(resultN7.job.lessonResults[0].title, "db-newer");
  const cachedN7 = await storeN7.getJob("opjob_n7");
  assert.equal(cachedN7.lessonResults[0].title, "db-newer");
  assert.equal(cachedN7.status, "completed");
  console.log("PASS  N7");

  console.log("\nAll curriculumOperatorJobs offload Stage-1 tests passed.");
}

main().catch((error) => {
  console.error("\nFAIL:", error.stack || error);
  process.exit(1);
});
