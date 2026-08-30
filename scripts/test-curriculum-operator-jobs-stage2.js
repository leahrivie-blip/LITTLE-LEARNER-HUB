#!/usr/bin/env node
/**
 * Stage 2 design/tooling regressions — NO production writes.
 * Run: NODE_ENV=test node scripts/test-curriculum-operator-jobs-stage2.js
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const jobApi = require("./curriculum-operator-job.js");
const {
  createCurriculumOperatorJobStore,
  buildHotStoreJobBag,
  byteLen,
} = require("../server/curriculum-operator-job-store.js");
const stage2 = require("./lib/curriculum-operator-jobs-stage2.js");

function tmp(name) {
  return path.join(os.tmpdir(), `llh-stage2-${name}-${crypto.randomBytes(4).toString("hex")}.json`);
}

function fatLr(n = 2) {
  return Array.from({ length: n }, (_, i) => ({
    lessonId: `cur-lp-${i}`,
    title: `L${i}`,
    status: "success",
    audit: { blob: "x".repeat(2000) },
  }));
}

function makeJob(overrides = {}) {
  return jobApi.normalizeOperatorJob({
    id: overrides.id || `opjob_${crypto.randomBytes(3).toString("hex")}`,
    status: overrides.status || "completed",
    createdAt: overrides.createdAt || "2026-08-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt || "2026-08-02T00:00:00.000Z",
    createdBy: "owner@example.com",
    phase: 2,
    lessonResults: overrides.lessonResults !== undefined ? overrides.lessonResults : fatLr(2),
    ...overrides,
  });
}

function build53Store() {
  const jobs = [];
  jobs.push(makeJob({ id: "opjob_run", status: "running", updatedAt: "2026-08-30T00:00:00.000Z", lessonResults: fatLr(1) }));
  jobs.push(makeJob({ id: "opjob_plan", status: "planned", updatedAt: "2026-08-29T00:00:00.000Z", lessonResults: [] }));
  jobs.push(makeJob({ id: "opjob_await", status: "awaiting_confirm", updatedAt: "2026-08-28T00:00:00.000Z", lessonResults: fatLr(1) }));
  jobs.push(makeJob({ id: "opjob_pause", status: "paused", updatedAt: "2026-08-27T00:00:00.000Z", lessonResults: fatLr(1) }));
  for (let i = 0; i < 49; i += 1) {
    jobs.push(makeJob({
      id: `opjob_term_${i}`,
      status: i % 2 ? "failed" : "completed",
      updatedAt: `2026-08-${String((i % 28) + 1).padStart(2, "0")}T12:00:00.000Z`,
      lessonResults: fatLr(3),
    }));
  }
  const curriculum = {
    lessonPlans: [{ id: "cur-lp-keep", title: "Keep" }],
    activities: [{ id: "act-1", lessonPlanId: "cur-lp-keep" }],
  };
  return {
    users: { "a@example.com": { email: "a@example.com", plan: "Pro" } },
    programData: { p1: { ok: true } },
    scheduleByUser: { "a@example.com": { monday: [] } },
    billingEvents: [{ id: "b1" }],
    siteContent: { curriculum: JSON.parse(JSON.stringify(curriculum)) },
    curriculumOperatorJobs: { jobs, updatedAt: "2026-08-30T00:00:00.000Z" },
  };
}

function verifiedBackup(id = "backup_test") {
  // Clearly marked fixture proof — NOT production-grade.
  return {
    kind: stage2.BACKUP_KIND_FIXTURE,
    fixture: true,
    id,
    verified: true,
    source: stage2.REQUIRED_BACKUP_SOURCE,
  };
}

function productionBackupProof(manifest, overrides = {}) {
  return stage2.buildBackupProof({
    kind: stage2.BACKUP_KIND_PRODUCTION,
    id: overrides.id || "backup_2026-08-30T00:00:00.000Z_stage2",
    verified: true,
    source: stage2.REQUIRED_BACKUP_SOURCE,
    migrationRunId: manifest.runId,
    productionBuildSha: manifest.productionBuildSha || "prod-sha",
    sourceJobCount: manifest.jobCount,
    sourceAggregateHash: manifest.aggregateHash,
    storeUpdatedAtExact: manifest.storeUpdatedAtExact || "2026-08-30 00:00:00.000000+00",
    storeFingerprint: manifest.storeFingerprint,
    createdAt: "2026-08-30T00:00:00.000Z",
    ...overrides,
  });
}

async function main() {
  console.log("1) 53 legacy jobs migrate successfully (fixture)");
  const store1 = build53Store();
  assert.equal(store1.curriculumOperatorJobs.jobs.length, 53);
  const planEmpty = stage2.planDedicatedMigration(store1.curriculumOperatorJobs.jobs, new Map());
  assert.equal(planEmpty.plannedCount, 53);
  assert.equal(planEmpty.safe, true);
  const destMap = new Map(store1.curriculumOperatorJobs.jobs.map((j) => [String(j.id), j]));
  const planDone = stage2.planDedicatedMigration(store1.curriculumOperatorJobs.jobs, destMap);
  assert.equal(planDone.plannedCount, 0);
  assert.equal(planDone.skipCount, 53);
  const sim1 = await stage2.simulateStage2OnFixtureStore({
    store: store1,
    backup: verifiedBackup("b1"),
    expectations: { expectedSourceCount: 53 },
    applyHotRewrite: true,
  });
  assert.equal(sim1.verification.sourceCount, 53);
  assert.equal(sim1.verification.destinationCount, 53);
  assert.equal(sim1.verification.missingCount, 0);
  assert.equal(sim1.wroteHotStore, true);
  console.log("PASS  1");

  console.log("2) Dry-run CLI performs zero writes");
  const fixture = tmp("dry");
  fs.writeFileSync(fixture, JSON.stringify(store1));
  const before = fs.readFileSync(fixture);
  const dry = spawnSync(process.execPath, [path.join(__dirname, "migrate-curriculum-operator-jobs-stage2.js"), "--file", fixture], { encoding: "utf8" });
  assert.equal(dry.status, 0, dry.stderr || dry.stdout);
  const dryReport = JSON.parse(dry.stdout.slice(dry.stdout.indexOf("{")));
  assert.equal(dryReport.mode, "dry-run");
  assert.equal(dryReport.wrote, false);
  assert.equal(dryReport.productionApplyLocked, true);
  assert.deepEqual(fs.readFileSync(fixture), before);
  console.log("PASS  2");

  console.log("3) Missing backup blocks apply");
  let e3 = null;
  try {
    await stage2.simulateStage2OnFixtureStore({ store: store1, backup: null, applyHotRewrite: false });
  } catch (error) { e3 = error; }
  assert.equal(e3?.code, "stage2_backup_missing");
  console.log("PASS  3");

  console.log("4) Source count mismatch blocks apply");
  let e4 = null;
  try {
    await stage2.simulateStage2OnFixtureStore({
      store: store1,
      backup: verifiedBackup(),
      expectations: { expectedSourceCount: 99 },
    });
  } catch (error) { e4 = error; }
  assert.equal(e4?.code, "stage2_source_count_mismatch");
  console.log("PASS  4");

  console.log("5) Source aggregate hash mismatch blocks apply");
  const m5 = stage2.buildSourceManifest(store1);
  let e5 = null;
  try {
    await stage2.simulateStage2OnFixtureStore({
      store: store1,
      backup: verifiedBackup(),
      expectations: { expectedSourceHash: "deadbeef" },
    });
  } catch (error) { e5 = error; }
  assert.equal(e5?.code, "stage2_source_hash_mismatch");
  void m5;
  console.log("PASS  5");

  console.log("6) Dedicated missing row blocks hot rewrite");
  const partialManifest = stage2.buildSourceManifest(store1);
  const verificationMissing = stage2.verifyDestinationAgainstSource(partialManifest, [
    makeJob({ id: "opjob_run", status: "running" }),
  ]);
  assert.ok(verificationMissing.missingCount > 0);
  let e6 = null;
  try { stage2.assertCutoverVerificationGate(verificationMissing); } catch (error) { e6 = error; }
  assert.equal(e6?.code, "stage2_missing_destination");
  console.log("PASS  6");

  console.log("7) Dedicated hash mismatch blocks hot rewrite");
  const destWrong = store1.curriculumOperatorJobs.jobs.map((j) => (
    j.id === "opjob_term_0"
      ? makeJob({ ...j, status: "failed", updatedAt: j.updatedAt, lessonResults: fatLr(1) })
      : j
  ));
  // Force same updatedAt but different payload via normalize path — use older dest with different hash
  const destOlder = store1.curriculumOperatorJobs.jobs.map((j) => (
    j.id === "opjob_term_0"
      ? makeJob({ id: j.id, status: "completed", updatedAt: "2026-07-01T00:00:00.000Z", lessonResults: [{ lessonId: "x", status: "success" }] })
      : j
  ));
  const v7 = stage2.verifyDestinationAgainstSource(partialManifest, destOlder);
  assert.ok(v7.hashMismatchCount > 0 || v7.conflictCount > 0);
  let e7 = null;
  try { stage2.assertCutoverVerificationGate(v7); } catch (error) { e7 = error; }
  assert.ok(e7);
  void destWrong;
  console.log("PASS  7");

  console.log("8) Destination-newer job is preserved safely");
  const jobStore8 = createCurriculumOperatorJobStore({ localFilePath: null });
  jobStore8.configure({ intendedPostgres: false });
  await jobStore8.loadFromStorage();
  await jobStore8.upsertJob(makeJob({
    id: "opjob_term_0",
    status: "completed",
    updatedAt: "2026-09-01T00:00:00.000Z",
    lessonResults: fatLr(4),
  }));
  // Migrate older source of same id — should skip as destination_newer
  const older = makeJob({
    id: "opjob_term_0",
    status: "failed",
    updatedAt: "2026-08-01T00:00:00.000Z",
    lessonResults: fatLr(1),
  });
  const skip = await jobStore8.upsertJob(older);
  assert.equal(skip.skipped, true);
  assert.equal(skip.reason, "destination_newer");
  const kept = await jobStore8.getJob("opjob_term_0");
  assert.equal(kept.status, "completed");
  assert.equal(kept.lessonResults.length, 4);
  console.log("PASS  8");

  console.log("9–12) Active statuses remain full after preview/cutover");
  for (const status of ["running", "planned", "awaiting_confirm", "paused"]) {
    const preview = stage2.buildHotBagPreview(store1);
    const job = preview.bag.jobs.find((j) => j.status === status);
    assert.ok(job, `${status} present`);
    assert.notEqual(job.hotStoreStub, true);
  }
  stage2.assertActiveJobsRemainFull(sim1.afterStore.curriculumOperatorJobs);
  console.log("PASS  9-12");

  console.log("13–14) Terminal stubs only after verification; omitted only when dedicated full exists");
  const hot = sim1.afterStore.curriculumOperatorJobs.jobs;
  const stubs = hot.filter((j) => j.hotStoreStub === true);
  assert.ok(stubs.length <= 10);
  assert.ok(stubs.every((j) => (j.lessonResults || []).length === 0));
  assert.ok(hot.length < 53, "older terminals leave hot bag");
  assert.equal(sim1.verification.destinationCount, 53, "dedicated retains all");
  console.log("PASS  13-14");

  console.log("15) CAS conflict blocks rollback rewrite");
  let e15 = null;
  try {
    stage2.simulateRollbackFromBackup({
      liveStore: store1,
      backupStore: store1,
      expectedLiveUpdatedAt: "token-a",
      liveUpdatedAt: "token-b",
    });
  } catch (error) { e15 = error; }
  assert.equal(e15?.code, "stage2_rollback_cas_conflict");
  console.log("PASS  15");

  console.log("16) Mid-migration operator update is detected");
  const base = build53Store();
  const manifest = stage2.buildSourceManifest(base);
  base.curriculumOperatorJobs.jobs[0].updatedAt = "2026-09-01T00:00:00.000Z";
  base.curriculumOperatorJobs.jobs[0].status = "running";
  const drift = stage2.detectSourceDrift(manifest, base);
  assert.equal(drift.changed, true);
  console.log("PASS  16");

  console.log("17–18) Restart/rerun idempotent + partial resume");
  const store17 = build53Store();
  const jobStore17 = createCurriculumOperatorJobStore({ localFilePath: tmp("idem") });
  jobStore17.configure({ intendedPostgres: false });
  await jobStore17.loadFromStorage();
  // Partial first
  for (const job of store17.curriculumOperatorJobs.jobs.slice(0, 10)) {
    await jobStore17.upsertJob(job);
  }
  assert.equal(jobStore17._memorySize(), 10);
  const sim17 = await stage2.simulateStage2OnFixtureStore({
    store: store17,
    backup: verifiedBackup("idem"),
    expectations: { expectedSourceCount: 53 },
    operatorJobStore: jobStore17,
    applyHotRewrite: false,
  });
  assert.equal(sim17.verification.destinationCount, 53);
  // Second full run
  const sim17b = await stage2.simulateStage2OnFixtureStore({
    store: store17,
    backup: verifiedBackup("idem2"),
    expectations: { expectedSourceCount: 53 },
    operatorJobStore: jobStore17,
    applyHotRewrite: false,
  });
  assert.equal(sim17b.verification.destinationCount, 53);
  console.log("PASS  17-18");

  console.log("19–20) Dual-read / owner-publish still see full lessonResults after simulated cutover");
  const jobStore19 = createCurriculumOperatorJobStore({ localFilePath: null });
  jobStore19.configure({ intendedPostgres: false });
  await jobStore19.loadFromStorage();
  for (const job of store1.curriculumOperatorJobs.jobs) await jobStore19.upsertJob(job);
  const hotBag = buildHotStoreJobBag(store1.curriculumOperatorJobs).bag;
  const merged = jobStore19.mergeWithLegacyBag(hotBag);
  const hist = merged.jobs.find((j) => j.id === "opjob_term_0");
  assert.ok(hist.lessonResults.length > 0, "dual-read restores full terminal payload");
  console.log("PASS  19-20");

  console.log("21–25) Curriculum / users / programData / schedule / billing unchanged");
  const beforeCurr = crypto.createHash("sha256").update(JSON.stringify(store1.siteContent.curriculum)).digest("hex");
  const afterCurr = crypto.createHash("sha256").update(JSON.stringify(sim1.afterStore.siteContent.curriculum)).digest("hex");
  assert.equal(beforeCurr, afterCurr);
  assert.equal(sim1.inventoryAfter.users, sim1.inventoryBefore.users);
  assert.equal(sim1.inventoryAfter.programData, sim1.inventoryBefore.programData);
  assert.equal(sim1.inventoryAfter.scheduleByUser, sim1.inventoryBefore.scheduleByUser);
  assert.equal(sim1.inventoryAfter.billingEvents, sim1.inventoryBefore.billingEvents);
  console.log("PASS  21-25");

  console.log("26) llh_store operator section decreases materially");
  assert.ok(sim1.preview.reductionPct > 80);
  assert.ok(sim1.preview.afterBytes < sim1.preview.beforeBytes);
  console.log("PASS  26");

  console.log("27–28) Rollback restores full bag; never overwrites newer job");
  const backupStore = build53Store();
  const liveAfterCutover = {
    ...backupStore,
    curriculumOperatorJobs: buildHotStoreJobBag(backupStore.curriculumOperatorJobs).bag,
  };
  // Newer live mutation on one id
  liveAfterCutover.curriculumOperatorJobs.jobs.push(
    makeJob({ id: "opjob_new_live", status: "running", updatedAt: "2026-09-02T00:00:00.000Z", lessonResults: fatLr(1) }),
  );
  const rolled = stage2.simulateRollbackFromBackup({
    liveStore: liveAfterCutover,
    backupStore,
    expectedLiveUpdatedAt: "t1",
    liveUpdatedAt: "t1",
  });
  assert.ok(rolled.curriculumOperatorJobs.jobs.length >= 53);
  assert.ok(rolled.curriculumOperatorJobs.jobs.every((j) => {
    if (["completed", "failed", "cancelled"].includes(j.status) && j.id.startsWith("opjob_term_")) {
      return (j.lessonResults || []).length > 0;
    }
    return true;
  }));
  assert.ok(rolled.curriculumOperatorJobs.jobs.some((j) => j.id === "opjob_new_live"));
  console.log("PASS  27-28");

  console.log("29) Production apply impossible without unlock");
  let e29 = null;
  try {
    stage2.assertProductionApplyUnlocked({ apply: true, postgres: true, confirmMigrate: true, confirmCutover: true });
  } catch (error) { e29 = error; }
  assert.equal(e29?.code, "stage2_production_apply_locked");
  const locked = spawnSync(
    process.execPath,
    [
      path.join(__dirname, "migrate-curriculum-operator-jobs-stage2.js"),
      "--postgres",
      "--apply",
      "--confirm-migrate-operator-jobs",
      "--confirm-hot-store-cutover",
      "--backup-id", "x",
      "--expected-source-count", "53",
    ],
    { encoding: "utf8", env: { ...process.env, PRODUCTION_DATABASE_URL: "postgresql://example.invalid/db" } },
  );
  assert.notEqual(locked.status, 0);
  assert.match(locked.stderr || locked.stdout, /NOT unlocked|Refusing|STAGE2 TOOL FAILED/i);
  console.log("PASS  29");

  console.log("30) Normal runtime still cannot activate hot cutover");
  const rt = createCurriculumOperatorJobStore({ localFilePath: null });
  assert.equal(rt.isHotStoreCutoverEnabled(), false);
  assert.equal(rt.canSafelyCapHotStore(), false);
  assert.equal(typeof rt.enableHotStoreCutover, "undefined");
  assert.equal(typeof rt.setHotStoreCutoverEnabled, "undefined");
  console.log("PASS  30");

  // --- Hardening regressions (31–44) ---

  console.log("31) Backup verified boolean alone is insufficient for production-grade gate");
  const m31 = stage2.buildSourceManifest(build53Store(), {
    runId: "run-31",
    storeUpdatedAtExact: "cas-31",
    productionBuildSha: "sha-31",
  });
  let e31 = null;
  try {
    stage2.assertBackupMatchesSource(
      { id: "backup_only_verified", verified: true },
      m31,
      { requireProductionGrade: true },
    );
  } catch (error) { e31 = error; }
  assert.equal(e31?.code, "stage2_backup_proof_incomplete");
  assert.equal(stage2.isProductionGradeBackupProof({ id: "x", verified: true }), false);
  console.log("PASS  31");

  console.log("32) Backup source hash mismatch blocks");
  let e32 = null;
  try {
    stage2.assertBackupMatchesSource(
      productionBackupProof(m31, { sourceAggregateHash: "deadbeef" }),
      m31,
      { requireProductionGrade: true },
    );
  } catch (error) { e32 = error; }
  assert.equal(e32?.code, "stage2_backup_source_hash_mismatch");
  console.log("PASS  32");

  console.log("33) Backup CAS mismatch blocks");
  let e33 = null;
  try {
    stage2.assertBackupMatchesSource(
      productionBackupProof(m31, { storeUpdatedAtExact: "wrong-cas" }),
      m31,
      { requireProductionGrade: true },
    );
  } catch (error) { e33 = error; }
  assert.equal(e33?.code, "stage2_backup_cas_mismatch");
  console.log("PASS  33");

  console.log("34) Backup wrong source/type blocks");
  let e34 = null;
  try {
    stage2.assertBackupMatchesSource(
      productionBackupProof(m31, { source: "daily" }),
      m31,
      { requireProductionGrade: true },
    );
  } catch (error) { e34 = error; }
  assert.equal(e34?.code, "stage2_backup_wrong_source");
  console.log("PASS  34");

  console.log("35) Backup run-id mismatch blocks where required");
  let e35 = null;
  try {
    stage2.assertBackupMatchesSource(
      productionBackupProof(m31, { migrationRunId: "other-run" }),
      m31,
      { requireProductionGrade: true },
    );
  } catch (error) { e35 = error; }
  assert.equal(e35?.code, "stage2_backup_run_id_mismatch");
  // Fixture proofs remain distinct from production-grade.
  assert.equal(stage2.isFixtureBackupProof(verifiedBackup("fx")), true);
  assert.equal(stage2.isProductionGradeBackupProof(verifiedBackup("fx")), false);
  assert.equal(stage2.isProductionGradeBackupProof(productionBackupProof(m31)), true);
  console.log("PASS  35");

  console.log("36) Destination newer is not automatically cutover-safe");
  const store36 = build53Store();
  const source36 = store36.curriculumOperatorJobs.jobs.map((j) => ({ ...j }));
  const dest36 = source36.map((j) => (
    j.id === "opjob_term_0"
      ? makeJob({
        id: "opjob_term_0",
        status: "completed",
        updatedAt: "2026-09-01T00:00:00.000Z",
        lessonResults: fatLr(5),
      })
      : j
  ));
  const manifest36 = stage2.buildSourceManifest({
    ...store36,
    curriculumOperatorJobs: { jobs: source36, updatedAt: "2026-08-30T00:00:00.000Z" },
  });
  const v36 = stage2.verifyDestinationAgainstSource(manifest36, dest36);
  assert.ok(v36.newerDestinationPendingReconcileCount > 0);
  assert.equal(v36.cutoverAllowed, false);
  let e36 = null;
  try { stage2.assertCutoverVerificationGate(v36); } catch (error) { e36 = error; }
  assert.equal(e36?.code, "stage2_newer_destination_unreconciled");
  console.log("PASS  36");

  console.log("37) Destination newer + live matches dedicated → reconciles safe");
  const liveMatch36 = {
    ...store36,
    curriculumOperatorJobs: { jobs: dest36, updatedAt: "2026-09-01T00:00:00.000Z" },
  };
  const r37 = stage2.reconcileNewerDestinationsAgainstLive({
    verification: v36,
    destinationJobs: dest36,
    liveStore: liveMatch36,
  });
  assert.equal(r37.newerDestinationPendingReconcileCount, 0);
  assert.ok(r37.newerDestinationReconciledCount >= 1);
  assert.equal(r37.cutoverAllowed, true);
  stage2.assertCutoverVerificationGate(r37);
  console.log("PASS  37");

  console.log("38) Destination newer + live disagrees / still old source → blocks");
  const liveOld36 = {
    ...store36,
    curriculumOperatorJobs: { jobs: source36, updatedAt: "2026-08-30T00:00:00.000Z" },
  };
  const r38 = stage2.reconcileNewerDestinationsAgainstLive({
    verification: v36,
    destinationJobs: dest36,
    liveStore: liveOld36,
  });
  assert.ok(r38.newerDestinationPendingReconcileCount > 0);
  assert.equal(r38.cutoverAllowed, false);
  let e38 = null;
  try { stage2.assertCutoverVerificationGate(r38); } catch (error) { e38 = error; }
  assert.equal(e38?.code, "stage2_newer_destination_unreconciled");
  console.log("PASS  38");

  console.log("39) Same timestamp divergent destination → blocks");
  const destSameTs = source36.map((j) => (
    j.id === "opjob_term_0"
      ? makeJob({
        id: "opjob_term_0",
        status: "failed",
        updatedAt: j.updatedAt,
        lessonResults: fatLr(1),
      })
      : j
  ));
  const v39 = stage2.verifyDestinationAgainstSource(manifest36, destSameTs);
  assert.ok(v39.hashMismatchCount > 0 || v39.conflictCount > 0);
  assert.equal(v39.cutoverAllowed, false);
  // Also: destination-newer pending with live same-ts divergent hash
  const destNewer39 = source36.map((j) => (
    j.id === "opjob_term_0"
      ? makeJob({
        id: "opjob_term_0",
        status: "completed",
        updatedAt: "2026-09-01T00:00:00.000Z",
        lessonResults: fatLr(4),
      })
      : j
  ));
  const liveDivergent39 = {
    ...store36,
    curriculumOperatorJobs: {
      jobs: source36.map((j) => (
        j.id === "opjob_term_0"
          ? makeJob({
            id: "opjob_term_0",
            status: "failed",
            updatedAt: "2026-09-01T00:00:00.000Z",
            lessonResults: fatLr(2),
          })
          : j
      )),
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
  };
  const v39b = stage2.verifyDestinationAgainstSource(manifest36, destNewer39);
  const r39 = stage2.reconcileNewerDestinationsAgainstLive({
    verification: v39b,
    destinationJobs: destNewer39,
    liveStore: liveDivergent39,
  });
  assert.ok(r39.conflictCount > 0);
  assert.equal(r39.cutoverAllowed, false);
  let e39 = null;
  try { stage2.assertCutoverVerificationGate(r39); } catch (error) { e39 = error; }
  assert.equal(e39?.code, "stage2_unsafe_conflict");
  console.log("PASS  39");

  console.log("39b) Destination newer malformed/missing expected data → STOP");
  const destMalformed = source36.map((j) => (
    j.id === "opjob_term_0"
      ? {
        id: "opjob_term_0",
        status: "completed",
        updatedAt: "2026-09-01T00:00:00.000Z",
        createdAt: "2026-08-01T00:00:00.000Z",
        lessonResults: [], // regressed from source fat results
      }
      : j
  ));
  const vMal = stage2.verifyDestinationAgainstSource(manifest36, destMalformed);
  assert.ok(vMal.conflictCount > 0);
  assert.equal(vMal.cutoverAllowed, false);
  console.log("PASS  39b");

  console.log("40) PostgreSQL read-only SET failure aborts");
  let sawSelect40 = false;
  const mockSetFail = {
    async query(sql) {
      if (/SET default_transaction_read_only/i.test(sql)) {
        throw new Error("permission denied to set parameter");
      }
      if (/SELECT/i.test(sql)) sawSelect40 = true;
      return { rows: [] };
    },
  };
  let e40 = null;
  try {
    await stage2.enforcePostgresSessionReadOnly(mockSetFail);
  } catch (error) { e40 = error; }
  assert.equal(e40?.code, "stage2_postgres_readonly_set_failed");
  assert.equal(sawSelect40, false);
  console.log("PASS  40");

  console.log("41) PostgreSQL read-only confirmation failure aborts");
  let sawSelect41 = false;
  const mockConfirmFail = {
    async query(sql) {
      if (/SET default_transaction_read_only/i.test(sql)) return { rows: [] };
      if (/SHOW default_transaction_read_only/i.test(sql)) {
        return { rows: [{ default_transaction_read_only: "off" }] };
      }
      if (/SELECT/i.test(sql)) sawSelect41 = true;
      return { rows: [] };
    },
  };
  let e41 = null;
  try {
    await stage2.enforcePostgresSessionReadOnly(mockConfirmFail);
  } catch (error) { e41 = error; }
  assert.equal(e41?.code, "stage2_postgres_readonly_confirm_failed");
  assert.equal(sawSelect41, false);

  // Confirmed read-only → preflight SET/SHOW/BEGIN allowed (no app SELECT yet).
  const mockOk = {
    async query(sql) {
      if (/SET default_transaction_read_only/i.test(sql)) return { rows: [] };
      if (/SHOW default_transaction_read_only/i.test(sql)) {
        return { rows: [{ default_transaction_read_only: "on" }] };
      }
      if (/BEGIN READ ONLY/i.test(sql)) return { rows: [] };
      if (/SHOW transaction_read_only/i.test(sql)) {
        return { rows: [{ transaction_read_only: "on" }] };
      }
      throw new Error(`unexpected sql in mockOk: ${sql}`);
    },
  };
  const ok41 = await stage2.enforcePostgresSessionReadOnly(mockOk);
  assert.equal(ok41.readOnly, true);
  assert.equal(ok41.transactionReadOnly, "on");
  console.log("PASS  41");

  console.log("42) Rollback same-timestamp hash divergence blocks");
  const backup42 = build53Store();
  const live42 = build53Store();
  const idx = live42.curriculumOperatorJobs.jobs.findIndex((j) => j.id === "opjob_term_0");
  live42.curriculumOperatorJobs.jobs[idx] = makeJob({
    id: "opjob_term_0",
    status: "failed",
    updatedAt: backup42.curriculumOperatorJobs.jobs[idx].updatedAt,
    lessonResults: fatLr(1),
  });
  let e42 = null;
  try {
    stage2.simulateRollbackFromBackup({
      liveStore: live42,
      backupStore: backup42,
      expectedLiveUpdatedAt: "t",
      liveUpdatedAt: "t",
    });
  } catch (error) { e42 = error; }
  assert.equal(e42?.code, "stage2_rollback_same_timestamp_conflict");
  console.log("PASS  42");

  console.log("43) Rollback preserves genuinely newer live job");
  const backup43 = build53Store();
  const live43 = build53Store();
  const newer = makeJob({
    id: "opjob_term_0",
    status: "completed",
    updatedAt: "2026-09-10T00:00:00.000Z",
    lessonResults: fatLr(6),
  });
  live43.curriculumOperatorJobs.jobs = live43.curriculumOperatorJobs.jobs.map((j) => (
    j.id === "opjob_term_0" ? newer : j
  ));
  const rolled43 = stage2.simulateRollbackFromBackup({
    liveStore: live43,
    backupStore: backup43,
    expectedLiveUpdatedAt: "t",
    liveUpdatedAt: "t",
  });
  const kept43 = rolled43.curriculumOperatorJobs.jobs.find((j) => j.id === "opjob_term_0");
  assert.equal(kept43.updatedAt, "2026-09-10T00:00:00.000Z");
  assert.equal(kept43.lessonResults.length, 6);
  console.log("PASS  43");

  console.log("44) Rollback preserves new live id absent from backup");
  const backup44 = build53Store();
  const live44 = {
    ...backup44,
    curriculumOperatorJobs: {
      jobs: [
        ...buildHotStoreJobBag(backup44.curriculumOperatorJobs).bag.jobs,
        makeJob({
          id: "opjob_brand_new",
          status: "running",
          updatedAt: "2026-09-11T00:00:00.000Z",
          lessonResults: fatLr(1),
        }),
      ],
      updatedAt: "2026-09-11T00:00:00.000Z",
    },
  };
  const rolled44 = stage2.simulateRollbackFromBackup({
    liveStore: live44,
    backupStore: backup44,
    expectedLiveUpdatedAt: "t",
    liveUpdatedAt: "t",
  });
  assert.ok(rolled44.curriculumOperatorJobs.jobs.some((j) => j.id === "opjob_brand_new"));
  console.log("PASS  44");

  console.log("\nAll Stage 2 design/tooling tests passed (including hardening 31–44).");
}

main().catch((error) => {
  console.error("\nFAIL:", error.stack || error);
  process.exit(1);
});
