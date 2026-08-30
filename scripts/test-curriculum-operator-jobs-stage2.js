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
  return { id, verified: true };
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

  console.log("\nAll Stage 2 design/tooling tests passed.");
}

main().catch((error) => {
  console.error("\nFAIL:", error.stack || error);
  process.exit(1);
});
