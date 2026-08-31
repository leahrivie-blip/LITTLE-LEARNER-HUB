#!/usr/bin/env node
/**
 * Stage 2 EXECUTION regressions — fixture/mock only.
 * Production --postgres --apply remains hard-locked.
 *
 * Run: NODE_ENV=test node scripts/test-curriculum-operator-jobs-stage2-execute.js
 */
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const jobApi = require("./curriculum-operator-job.js");
const stage2 = require("./lib/curriculum-operator-jobs-stage2.js");
const execute = require("./lib/curriculum-operator-jobs-stage2-execute.js");
const {
  createCurriculumOperatorJobStore,
  buildHotStoreJobBag,
} = require("../server/curriculum-operator-job-store.js");

function fatLr(n = 2) {
  return Array.from({ length: n }, (_, i) => ({
    lessonId: `cur-lp-${i}`,
    title: `L${i}`,
    status: "success",
    audit: { blob: "x".repeat(800) },
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
  return {
    users: { "a@example.com": { email: "a@example.com", plan: "Pro" } },
    programData: { p1: { ok: true } },
    scheduleByUser: { "a@example.com": { monday: [] } },
    billingEvents: [{ id: "b1" }],
    foundingMembers: ["a@example.com"],
    messages: [],
    notifications: [],
    supportTickets: [],
    siteContent: {
      curriculum: {
        lessonPlans: [{ id: "cur-lp-keep", title: "Keep" }],
        activities: [{ id: "act-1", lessonPlanId: "cur-lp-keep" }],
      },
    },
    curriculumOperatorJobs: { jobs, updatedAt: "2026-08-30T00:00:00.000Z" },
  };
}

function createMockClient({
  store,
  updatedAtExact = "2026-08-30 12:00:00.000000+00",
  failBackupInsert = false,
  failBackupVerify = false,
  mutateBeforeLock = null,
  casFail = false,
} = {}) {
  let writes = 0;
  let backupRows = new Map();
  let dedicated = new Map();
  let row = {
    id: "launch-store",
    data: JSON.parse(JSON.stringify(store)),
    updated_at: new Date("2026-08-30T12:00:00.000Z"),
    updated_at_exact: updatedAtExact,
  };
  const sqlLog = [];

  return {
    writeCount: () => writes,
    sqlLog,
    getRow: () => row,
    getBackup: (id) => backupRows.get(id),
    getDedicatedCount: () => dedicated.size,
    ended: false,
    connected: false,
    async connect() { this.connected = true; },
    async end() { this.ended = true; this.connected = false; },
    async query(sql, params = []) {
      const text = String(sql).replace(/\s+/g, " ").trim();
      sqlLog.push(text.slice(0, 120));
      if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") return { rows: [], rowCount: 0 };
      if (text.includes("pg_advisory_xact_lock")) return { rows: [], rowCount: 0 };
      if (text.includes("CREATE TABLE") || text.includes("CREATE INDEX")) return { rows: [], rowCount: 0 };
      if (text.includes("INSERT INTO llh_store_backups")) {
        if (failBackupInsert) throw new Error("backup insert failed");
        const id = params[0];
        const data = typeof params[7] === "string" ? JSON.parse(params[7]) : params[7];
        const rec = {
          id,
          created_at: new Date("2026-08-30T12:01:00.000Z"),
          source: params[1],
          verified: false,
          user_count: params[2],
          message_count: params[3],
          founding_count: params[4],
          data,
        };
        if (failBackupVerify) rec.user_count = -1;
        backupRows.set(id, rec);
        return { rows: [], rowCount: 1 };
      }
      if (text.includes("UPDATE llh_store_backups SET verified")) {
        const rec = backupRows.get(params[0]);
        if (rec) rec.verified = true;
        return { rows: [], rowCount: 1 };
      }
      if (text.includes("FROM llh_store_backups")) {
        const rec = backupRows.get(params[0]);
        return { rows: rec ? [rec] : [], rowCount: rec ? 1 : 0 };
      }
      if (text.includes("INSERT INTO llh_curriculum_operator_jobs")) {
        const id = params[0];
        const incoming = JSON.parse(params[6]);
        const existing = dedicated.get(id);
        if (existing) {
          const existingMs = Date.parse(existing.updatedAt || "") || 0;
          const nextMs = Date.parse(incoming.updatedAt || "") || 0;
          if (existingMs > nextMs) return { rows: [], rowCount: 0 };
        }
        dedicated.set(id, incoming);
        return { rows: [{ data: incoming }], rowCount: 1 };
      }
      if (text.includes("FROM llh_curriculum_operator_jobs") && text.includes("WHERE id")) {
        const job = dedicated.get(params[0]);
        return { rows: job ? [{ data: job }] : [], rowCount: job ? 1 : 0 };
      }
      if (text.includes("FROM llh_curriculum_operator_jobs")) {
        return {
          rows: Array.from(dedicated.values()).map((data) => ({ data })),
          rowCount: dedicated.size,
        };
      }
      if (text.includes("FOR UPDATE")) {
        if (typeof mutateBeforeLock === "function") mutateBeforeLock(row);
        return { rows: [{ ...row }], rowCount: 1 };
      }
      if (text.includes("FROM llh_store") && text.includes("updated_at_exact")) {
        return { rows: [{ ...row }], rowCount: 1 };
      }
      if (text.includes("UPDATE llh_store") && text.includes("IS NOT DISTINCT FROM")) {
        if (casFail || String(row.updated_at_exact) !== String(params[2]).trim()) {
          return { rows: [], rowCount: 0 };
        }
        writes += 1;
        row = {
          id: params[0],
          data: JSON.parse(params[1]),
          updated_at: new Date("2026-08-30T13:00:00.000Z"),
          updated_at_exact: "2026-08-30 13:00:00.000000+00",
        };
        return {
          rows: [{ id: row.id, updated_at: row.updated_at, updated_at_exact: row.updated_at_exact }],
          rowCount: 1,
        };
      }
      throw new Error(`Unexpected SQL: ${text.slice(0, 180)}`);
    },
  };
}

async function memoryJobStore() {
  const store = createCurriculumOperatorJobStore({ localFilePath: null });
  store.configure({ intendedPostgres: false });
  await store.loadFromStorage();
  return store;
}

async function main() {
  const cas = "2026-08-30 12:00:00.000000+00";
  const build = "fixture-build-sha";

  console.log("E1) backup created before dedicated writes");
  {
    const store = build53Store();
    const client = createMockClient({ store });
    const jobStore = await memoryJobStore();
    const sqlBeforeMigrate = [];
    const orig = client.query.bind(client);
    let sawDedicated = false;
    let backupBeforeDedicated = false;
    client.query = async (sql, params) => {
      const text = String(sql);
      if (/llh_store_backups/i.test(text) && /INSERT/i.test(text)) sqlBeforeMigrate.push("backup_insert");
      if (/llh_curriculum_operator_jobs/i.test(text) && /INSERT/i.test(text)) {
        if (sqlBeforeMigrate.includes("backup_insert")) backupBeforeDedicated = true;
        sawDedicated = true;
      }
      return orig(sql, params);
    };
    // Use execute with memory job store — backup via client, migrate via memory
    // Override migrate path: run createDurable then migrate manually order check
    const backup = await execute.createDurableStage2Backup(client, store, {
      runId: "run-e1",
      productionBuildSha: build,
      storeUpdatedAtExact: cas,
    });
    assert.equal(backup.verified, true);
    assert.ok(backup.backupId.startsWith("backup_"));
    await execute.migrateHistoricalJobsToDedicated({
      sourceJobs: store.curriculumOperatorJobs.jobs,
      operatorJobStore: jobStore,
    });
    assert.equal(jobStore._memorySize(), 53);
    void sawDedicated;
    void backupBeforeDedicated;
    // Order proof via pipeline:
    const client2 = createMockClient({ store });
    const jobStore2 = await memoryJobStore();
    let order = [];
    const o2 = client2.query.bind(client2);
    client2.query = async (sql, params) => {
      if (/INSERT INTO llh_store_backups/i.test(sql)) order.push("backup");
      return o2(sql, params);
    };
    const upsert = jobStore2.upsertJob.bind(jobStore2);
    jobStore2.upsertJob = async (...args) => {
      order.push("migrate");
      return upsert(...args);
    };
    await execute.runStage2Execution({
      mode: "fixture",
      apply: true,
      confirmMigrate: true,
      confirmCutover: false,
      client: client2,
      store,
      storeUpdatedAtExact: cas,
      productionBuildSha: build,
      operatorJobStore: jobStore2,
      expectedSourceCount: 53,
    });
    assert.ok(order.indexOf("backup") >= 0);
    assert.ok(order.indexOf("migrate") > order.indexOf("backup"));
  }
  console.log("PASS  E1");

  console.log("E2) backup failure prevents all migration");
  {
    const store = build53Store();
    const client = createMockClient({ store, failBackupInsert: true });
    const jobStore = await memoryJobStore();
    let err = null;
    try {
      await execute.runStage2Execution({
        mode: "fixture",
        apply: true,
        confirmMigrate: true,
        client,
        store,
        storeUpdatedAtExact: cas,
        productionBuildSha: build,
        operatorJobStore: jobStore,
        expectedSourceCount: 53,
      });
    } catch (e) { err = e; }
    assert.ok(err);
    assert.equal(jobStore._memorySize(), 0);
  }
  console.log("PASS  E2");

  console.log("E3) verified backup exact binding");
  {
    const store = build53Store();
    const client = createMockClient({ store });
    const backup = await execute.createDurableStage2Backup(client, store, {
      runId: "run-e3",
      productionBuildSha: build,
      storeUpdatedAtExact: cas,
    });
    const manifest = stage2.buildSourceManifest(store, {
      runId: "run-e3",
      productionBuildSha: build,
      storeUpdatedAtExact: cas,
    });
    stage2.assertBackupMatchesSource(backup.proof, manifest, {
      requireProductionGrade: true,
      requireBuildBinding: true,
    });
    let err = null;
    try {
      stage2.assertBackupMatchesSource(
        { ...backup.proof, sourceAggregateHash: "deadbeef" },
        manifest,
        { requireProductionGrade: true },
      );
    } catch (e) { err = e; }
    assert.equal(err?.code, "stage2_backup_source_hash_mismatch");
  }
  console.log("PASS  E3");

  console.log("E4–E6) 53-job migration, idempotent rerun, partial rerun");
  {
    const store = build53Store();
    const jobStore = await memoryJobStore();
    const m1 = await execute.migrateHistoricalJobsToDedicated({
      sourceJobs: store.curriculumOperatorJobs.jobs.slice(0, 10),
      operatorJobStore: jobStore,
    });
    assert.equal(jobStore._memorySize(), 10);
    const m2 = await execute.migrateHistoricalJobsToDedicated({
      sourceJobs: store.curriculumOperatorJobs.jobs,
      operatorJobStore: jobStore,
    });
    assert.equal(jobStore._memorySize(), 53);
    const m3 = await execute.migrateHistoricalJobsToDedicated({
      sourceJobs: store.curriculumOperatorJobs.jobs,
      operatorJobStore: jobStore,
    });
    assert.equal(m3.plannedCount, 0);
    void m1; void m2;
  }
  console.log("PASS  E4-E6");

  console.log("E7–E8) destination newer + same timestamp conflict");
  {
    const store = build53Store();
    const jobStore = await memoryJobStore();
    await jobStore.upsertJob(makeJob({
      id: "opjob_term_0",
      status: "completed",
      updatedAt: "2026-09-01T00:00:00.000Z",
      lessonResults: fatLr(4),
    }));
    const newerSkip = await jobStore.upsertJob(makeJob({
      id: "opjob_term_0",
      status: "failed",
      updatedAt: "2026-08-01T00:00:00.000Z",
      lessonResults: fatLr(1),
    }));
    assert.equal(newerSkip.reason, "destination_newer");

    const jobStore2 = await memoryJobStore();
    await jobStore2.upsertJob(makeJob({
      id: "same_ts",
      status: "completed",
      updatedAt: "2026-08-15T00:00:00.000Z",
      lessonResults: fatLr(2),
    }));
    // plan detects same-ts conflict when hashes differ before migrate
    const plan = stage2.planDedicatedMigration([
      makeJob({
        id: "same_ts",
        status: "failed",
        updatedAt: "2026-08-15T00:00:00.000Z",
        lessonResults: fatLr(1),
      }),
    ], new Map([["same_ts", await jobStore2.getJob("same_ts")]]));
    assert.equal(plan.safe, false);
  }
  console.log("PASS  E7-E8");

  console.log("E9–E12) verification, drift, active full, hot-bag preview");
  {
    const store = build53Store();
    const client = createMockClient({ store });
    const jobStore = await memoryJobStore();
    const result = await execute.runStage2Execution({
      mode: "fixture",
      apply: true,
      confirmMigrate: true,
      confirmCutover: false,
      client,
      store,
      storeUpdatedAtExact: cas,
      productionBuildSha: build,
      operatorJobStore: jobStore,
      expectedSourceCount: 53,
    });
    assert.equal(result.wroteHotStore, false);
    assert.equal(result.verification.missingCount, 0);
    assert.equal(result.verification.cutoverAllowed, true);
    assert.ok(result.preview.afterBytes < result.preview.beforeBytes);
    for (const st of ["running", "planned", "awaiting_confirm", "paused"]) {
      const j = result.preview.bag.jobs.find((x) => x.status === st);
      assert.ok(j);
      assert.notEqual(j.hotStoreStub, true);
    }
    // drift detection
    const manifest = stage2.buildSourceManifest(store);
    store.curriculumOperatorJobs.jobs[0].updatedAt = "2026-09-01T00:00:00.000Z";
    assert.equal(stage2.detectSourceDrift(manifest, store).changed, true);
  }
  console.log("PASS  E9-E12");

  console.log("E13–E16) advisory lock, FOR UPDATE, CAS success/failure");
  {
    const store = build53Store();
    const client = createMockClient({ store });
    const jobStore = await memoryJobStore();
    const ok = await execute.runStage2Execution({
      mode: "fixture",
      apply: true,
      confirmMigrate: true,
      confirmCutover: true,
      client,
      store,
      storeUpdatedAtExact: cas,
      productionBuildSha: build,
      operatorJobStore: jobStore,
      expectedSourceCount: 53,
    });
    assert.equal(ok.wroteHotStore, true);
    assert.equal(client.writeCount(), 1);
    assert.ok(client.sqlLog.some((s) => /pg_advisory_xact_lock/i.test(s)));
    assert.ok(client.sqlLog.some((s) => /FOR UPDATE/i.test(s)));
    assert.ok(ok.postWrite.activeFullCount >= 4);
    assert.ok(ok.postWrite.terminalStubCount <= 10);

    const store2 = build53Store();
    const clientFail = createMockClient({ store: store2, casFail: true });
    const jobStoreFail = await memoryJobStore();
    let err = null;
    try {
      await execute.runStage2Execution({
        mode: "fixture",
        apply: true,
        confirmMigrate: true,
        confirmCutover: true,
        client: clientFail,
        store: store2,
        storeUpdatedAtExact: cas,
        productionBuildSha: build,
        operatorJobStore: jobStoreFail,
        expectedSourceCount: 53,
      });
    } catch (e) { err = e; }
    assert.equal(err?.code, "stage2_cas_conflict");
    assert.equal(clientFail.writeCount(), 0);
  }
  console.log("PASS  E13-E16");

  console.log("E17) zero hot rewrite before verification");
  {
    const store = build53Store();
    const client = createMockClient({ store });
    // Force verification failure by emptying destination after migrate via bad store
    const jobStore = await memoryJobStore();
    // migrate only 1 job then verify against full source → missing blocks before hot write
    await jobStore.upsertJob(store.curriculumOperatorJobs.jobs[0]);
    const manifest = stage2.buildSourceManifest(store, { runId: "r", storeUpdatedAtExact: cas, productionBuildSha: build });
    const v = stage2.verifyDestinationAgainstSource(manifest, jobStore.listJobsSync({ limit: 500 }));
    assert.ok(v.missingCount > 0);
    let err = null;
    try { stage2.assertCutoverVerificationGate(v); } catch (e) { err = e; }
    assert.equal(err?.code, "stage2_missing_destination");
    assert.equal(client.writeCount(), 0);
  }
  console.log("PASS  E17");

  console.log("E18–E20) post-write dual-read, owner-publish lessonResults, inventory unchanged");
  {
    const store = build53Store();
    const beforeInv = execute.inventorySnapshot(store);
    const beforeCurr = crypto.createHash("sha256").update(JSON.stringify(store.siteContent.curriculum)).digest("hex");
    const client = createMockClient({ store });
    const jobStore = await memoryJobStore();
    const result = await execute.runStage2Execution({
      mode: "fixture",
      apply: true,
      confirmMigrate: true,
      confirmCutover: true,
      client,
      store,
      storeUpdatedAtExact: cas,
      productionBuildSha: build,
      operatorJobStore: jobStore,
      expectedSourceCount: 53,
    });
    const merged = jobStore.mergeWithLegacyBag(result.afterStore.curriculumOperatorJobs);
    const hist = merged.jobs.find((j) => j.id === "opjob_term_0");
    assert.ok(hist.lessonResults.length > 0);
    assert.deepEqual(execute.inventorySnapshot(result.afterStore), beforeInv);
    const afterCurr = crypto.createHash("sha256").update(JSON.stringify(result.afterStore.siteContent.curriculum)).digest("hex");
    assert.equal(beforeCurr, afterCurr);
    assert.ok(result.preview.reductionPct > 50);
  }
  console.log("PASS  E18-E20");

  console.log("E21–E25) rollback success / CAS fail / newer live / same-ts / stub restore");
  {
    const backupStore = build53Store();
    const hot = buildHotStoreJobBag(backupStore.curriculumOperatorJobs).bag;
    const liveStore = { ...backupStore, curriculumOperatorJobs: hot };
    // rollback merge simulation stub restore
    const rolled = stage2.simulateRollbackFromBackup({
      liveStore,
      backupStore,
      expectedLiveUpdatedAt: cas,
      liveUpdatedAt: cas,
    });
    assert.ok(rolled.curriculumOperatorJobs.jobs.length >= 53);
    assert.ok(rolled.curriculumOperatorJobs.jobs.every((j) => {
      if (j.id.startsWith("opjob_term_") && ["completed", "failed"].includes(j.status)) {
        return (j.lessonResults || []).length > 0;
      }
      return true;
    }));

    // CAS rollback success
    const client = createMockClient({ store: liveStore });
    const rb = await execute.applyStage2RollbackCas({
      client,
      liveStore,
      backupStore,
      expectedLiveUpdatedAtExact: cas,
      backupId: "backup_2026-08-30T12-00-00-000Z_pre-operator-jobs-stage2",
    });
    assert.equal(rb.wrote, true);
    assert.equal(rb.dedicatedRowsIntact, true);

    // CAS fail
    const clientFail = createMockClient({ store: liveStore, casFail: true });
    let eCas = null;
    try {
      await execute.applyStage2RollbackCas({
        client: clientFail,
        liveStore,
        backupStore,
        expectedLiveUpdatedAtExact: cas,
        backupId: "backup_2026-08-30T12-00-00-000Z_pre-operator-jobs-stage2",
      });
    } catch (e) { eCas = e; }
    assert.equal(eCas?.code, "stage2_rollback_cas_conflict");

    // newer live preserved (ensure id exists in live hot bag)
    const liveNewer = JSON.parse(JSON.stringify(liveStore));
    const newerJob = makeJob({
      id: "opjob_term_0",
      status: "completed",
      updatedAt: "2026-09-10T00:00:00.000Z",
      lessonResults: fatLr(5),
    });
    const hasTerm0 = liveNewer.curriculumOperatorJobs.jobs.some((j) => j.id === "opjob_term_0");
    if (hasTerm0) {
      liveNewer.curriculumOperatorJobs.jobs = liveNewer.curriculumOperatorJobs.jobs.map((j) => (
        j.id === "opjob_term_0" ? newerJob : j
      ));
    } else {
      liveNewer.curriculumOperatorJobs.jobs.push(newerJob);
    }
    liveNewer.curriculumOperatorJobs.jobs.push(
      makeJob({ id: "opjob_live_only", status: "running", updatedAt: "2026-09-11T00:00:00.000Z", lessonResults: fatLr(1) }),
    );
    const rolled2 = stage2.simulateRollbackFromBackup({
      liveStore: liveNewer,
      backupStore,
      expectedLiveUpdatedAt: cas,
      liveUpdatedAt: cas,
    });
    assert.equal(
      rolled2.curriculumOperatorJobs.jobs.find((j) => j.id === "opjob_term_0").lessonResults.length,
      5,
    );
    assert.ok(rolled2.curriculumOperatorJobs.jobs.some((j) => j.id === "opjob_live_only"));

    // same-timestamp full divergence blocks
    const liveDiv = build53Store();
    const backupDiv = build53Store();
    liveDiv.curriculumOperatorJobs.jobs = liveDiv.curriculumOperatorJobs.jobs.map((j) => (
      j.id === "opjob_term_0"
        ? makeJob({ id: "opjob_term_0", status: "failed", updatedAt: j.updatedAt, lessonResults: fatLr(1) })
        : j
    ));
    let eTs = null;
    try {
      stage2.simulateRollbackFromBackup({
        liveStore: liveDiv,
        backupStore: backupDiv,
        expectedLiveUpdatedAt: cas,
        liveUpdatedAt: cas,
      });
    } catch (e) { eTs = e; }
    assert.equal(eTs?.code, "stage2_rollback_same_timestamp_conflict");
  }
  console.log("PASS  E21-E25");

  console.log("E26) production apply final lock remains active");
  {
    let err = null;
    try {
      await execute.runStage2Execution({
        mode: "postgres",
        apply: true,
        confirmMigrate: true,
        confirmCutover: true,
        store: build53Store(),
        storeUpdatedAtExact: cas,
      });
    } catch (e) { err = e; }
    assert.equal(err?.code, "stage2_production_apply_locked");
    const locked = spawnSync(
      process.execPath,
      [
        path.join(__dirname, "migrate-curriculum-operator-jobs-stage2.js"),
        "--postgres", "--apply",
        "--confirm-migrate-operator-jobs",
        "--confirm-hot-store-cutover",
        "--backup-id", "backup_x",
        "--expected-source-count", "53",
      ],
      { encoding: "utf8", env: { ...process.env, PRODUCTION_DATABASE_URL: "postgresql://example.invalid/db" } },
    );
    assert.notEqual(locked.status, 0);
    assert.match(locked.stderr || locked.stdout, /NOT unlocked|STAGE2 TOOL FAILED/i);
  }
  console.log("PASS  E26");

  console.log("E27) runtime cutover remains false");
  {
    const rt = createCurriculumOperatorJobStore({ localFilePath: null });
    assert.equal(rt.isHotStoreCutoverEnabled(), false);
    assert.equal(rt.canSafelyCapHotStore(), false);
  }
  console.log("PASS  E27");

  // --- GAP hardenings E28–E40 ---

  console.log("E28–E32) Future Postgres helper wiring + lifecycle");
  {
    const store = build53Store();
    const mock = createMockClient({ store });
    let factoryCalls = 0;
    const createClient = async () => {
      factoryCalls += 1;
      return mock;
    };
    const ctx = await execute.preparePostgresStage2ExecutionContext({
      createClient,
      connectionString: "postgresql://mock/db",
      storeRecordId: "launch-store",
      productionBuildSha: build,
      expectedProductionBuildSha: build,
    });
    assert.equal(factoryCalls, 1, "E28 client factory invoked");
    assert.equal(mock.connected, true, "E28 connected");
    assert.ok(ctx.store, "E29 store loaded");
    assert.equal(ctx.storeUpdatedAtExact, cas, "E29 exact updated_at token");
    assert.equal(ctx.productionBuildSha, build, "E30 production build SHA");
    assert.equal(ctx.operatorJobStore, null, "E28 no dedicated store until after backup");
    assert.equal(ctx.readOnly, true);
    const prepSql = mock.sqlLog.join("\n");
    assert.match(prepSql, /FROM llh_store/i);
    assert.doesNotMatch(prepSql, /CREATE TABLE|CREATE INDEX|INSERT INTO llh_curriculum_operator_jobs/i);
    // E30: gates required for production helper entry
    execute.assertPostgresProductionExecutionGates({
      confirmMigrate: true,
      confirmCutover: true,
      expectedSourceCount: 53,
      expectedSourceHash: stage2.buildSourceManifest(store, {
        productionBuildSha: build,
        storeUpdatedAtExact: cas,
      }).aggregateHash,
      expectedStoreUpdatedAt: cas,
      expectedProductionBuildSha: build,
    });
    await mock.end();
    assert.equal(mock.ended, true, "E31 close on success path");

    // E32 Failure cleans up
    const mockFail = createMockClient({ store });
    mockFail.query = async (sql) => {
      if (/FROM llh_store/i.test(sql) && /updated_at_exact/i.test(sql)) {
        throw new Error("boom-load");
      }
      return { rows: [], rowCount: 0 };
    };
    let endedFail = false;
    mockFail.end = async () => { endedFail = true; };
    mockFail.connect = async () => {};
    let eFail = null;
    try {
      await execute.preparePostgresStage2ExecutionContext({
        createClient: async () => mockFail,
        connectionString: "postgresql://mock/db",
        expectedProductionBuildSha: build,
        productionBuildSha: build,
      });
    } catch (e) { eFail = e; }
    assert.match(eFail.message, /boom-load/);
    assert.equal(endedFail, true, "E32 close on failure");
  }
  console.log("PASS  E28-E32");

  console.log("E33–E36) Production execution requires expected count/hash/CAS/build");
  {
    const base = {
      confirmMigrate: true,
      confirmCutover: true,
      expectedSourceCount: 53,
      expectedSourceHash: "abc",
      expectedStoreUpdatedAt: cas,
      expectedProductionBuildSha: build,
    };
    execute.assertPostgresProductionExecutionGates(base);
    for (const key of [
      "expectedSourceCount",
      "expectedSourceHash",
      "expectedStoreUpdatedAt",
      "expectedProductionBuildSha",
    ]) {
      const bad = { ...base, [key]: key === "expectedSourceCount" ? null : "" };
      let err = null;
      try { execute.assertPostgresProductionExecutionGates(bad); } catch (e) { err = e; }
      assert.equal(err?.code, "stage2_production_gates_incomplete", key);
    }
  }
  console.log("PASS  E33-E36");

  console.log("E37–E38) Drift after backup blocks before hot rewrite; no hot write");
  {
    const store = build53Store();
    const client = createMockClient({ store });
    // Mutate live store after backup by changing row under subsequent SELECT
    let selectCount = 0;
    const orig = client.query.bind(client);
    client.query = async (sql, params) => {
      const text = String(sql);
      if (/FROM llh_store/i.test(text) && /updated_at_exact/i.test(text) && !/FOR UPDATE/i.test(text)) {
        selectCount += 1;
        // Pipeline's post-backup fresh live read (first SELECT) shows drifted jobs.
        if (selectCount >= 1) {
          const drifted = JSON.parse(JSON.stringify(store));
          drifted.curriculumOperatorJobs.jobs[0].updatedAt = "2026-09-01T00:00:00.000Z";
          drifted.curriculumOperatorJobs.jobs[0].status = "running";
          return {
            rows: [{
              id: "launch-store",
              data: drifted,
              updated_at: new Date(),
              updated_at_exact: "2026-08-30 12:00:00.000000+00",
            }],
            rowCount: 1,
          };
        }
      }
      return orig(sql, params);
    };
    const jobStore = await memoryJobStore();
    let err = null;
    try {
      await execute.runStage2Execution({
        mode: "fixture",
        apply: true,
        confirmMigrate: true,
        confirmCutover: true,
        client,
        store,
        storeUpdatedAtExact: cas,
        productionBuildSha: build,
        expectedProductionBuildSha: build,
        operatorJobStore: jobStore,
        expectedSourceCount: 53,
      });
    } catch (e) { err = e; }
    assert.equal(err?.code, "stage2_source_drift_requires_fresh_backup");
    assert.equal(client.writeCount(), 0);
    assert.equal(err.details.wroteHotStore, false);
  }
  console.log("PASS  E37-E38");

  console.log("E39) Fresh rerun with fresh backup succeeds in fixture/mock flow");
  {
    const store = build53Store();
    // Simulate post-drift refreshed source already applied into store
    store.curriculumOperatorJobs.jobs[0].updatedAt = "2026-09-01T00:00:00.000Z";
    const client = createMockClient({
      store,
      updatedAtExact: cas,
    });
    const jobStore = await memoryJobStore();
    const result = await execute.runStage2Execution({
      mode: "fixture",
      apply: true,
      confirmMigrate: true,
      confirmCutover: true,
      client,
      store,
      storeUpdatedAtExact: cas,
      productionBuildSha: build,
      expectedProductionBuildSha: build,
      operatorJobStore: jobStore,
      expectedSourceCount: 53,
    });
    assert.equal(result.wroteHotStore, true);
    assert.equal(client.writeCount(), 1);
  }
  console.log("PASS  E39");

  console.log("E40) Production hard lock fires before connection factory is called");
  {
    let factoryCalls = 0;
    let err = null;
    try {
      // Mimic CLI order: lock first
      stage2.assertProductionApplyUnlocked({
        apply: true,
        postgres: true,
        confirmMigrate: true,
        confirmCutover: true,
      });
      await execute.prepareAndRunPostgresStage2Execution({
        apply: true,
        confirmMigrate: true,
        confirmCutover: true,
        expectedSourceCount: 53,
        expectedSourceHash: "x",
        expectedStoreUpdatedAt: cas,
        expectedProductionBuildSha: build,
        createClient: async () => {
          factoryCalls += 1;
          throw new Error("factory should not run");
        },
      });
    } catch (e) { err = e; }
    assert.equal(err?.code, "stage2_production_apply_locked");
    assert.equal(factoryCalls, 0);

    // Defense in depth: helper also locks before connection factory when apply=true.
    factoryCalls = 0;
    const store = build53Store();
    const mock = createMockClient({ store });
    err = null;
    try {
      await execute.prepareAndRunPostgresStage2Execution({
        apply: true,
        confirmMigrate: true,
        confirmCutover: true,
        expectedSourceCount: 53,
        expectedSourceHash: stage2.buildSourceManifest(store, {
          productionBuildSha: build,
          storeUpdatedAtExact: cas,
        }).aggregateHash,
        expectedStoreUpdatedAt: cas,
        expectedProductionBuildSha: build,
        productionBuildSha: build,
        connectionString: "postgresql://mock/db",
        createClient: async () => {
          factoryCalls += 1;
          return mock;
        },
      });
    } catch (e) { err = e; }
    assert.equal(err?.code, "stage2_production_apply_locked");
    assert.equal(factoryCalls, 0);
    assert.equal(mock.ended, false);

    // CLI guarantees lock BEFORE helper / connection:
    const locked = spawnSync(
      process.execPath,
      [
        path.join(__dirname, "migrate-curriculum-operator-jobs-stage2.js"),
        "--postgres", "--apply",
        "--confirm-migrate-operator-jobs",
        "--confirm-hot-store-cutover",
        "--expected-source-count", "53",
        "--expected-source-hash", "deadbeef",
        "--expected-store-updated-at", cas,
        "--expected-production-build-sha", build,
      ],
      { encoding: "utf8", env: { ...process.env, PRODUCTION_DATABASE_URL: "postgresql://example.invalid/db" } },
    );
    assert.notEqual(locked.status, 0);
    assert.match(locked.stderr || locked.stdout, /NOT unlocked|STAGE2 TOOL FAILED/i);
    // Must fail before attempting real DNS/connect to example.invalid
    assert.doesNotMatch(locked.stderr || "", /ENOTFOUND|ECONNREFUSED/i);
  }
  console.log("PASS  E40");

  console.log("E41–E46) Backup-before-dedicated-DDL ordering");
  {
    // E41–E42: prepare context is SELECT/read only
    const store = build53Store();
    const mockPrep = createMockClient({ store });
    const ctx = await execute.preparePostgresStage2ExecutionContext({
      createClient: async () => mockPrep,
      connectionString: "postgresql://mock/db",
      productionBuildSha: build,
      expectedProductionBuildSha: build,
    });
    const prepJoined = mockPrep.sqlLog.join(" | ");
    assert.match(prepJoined, /FROM llh_store/i, "E41 SELECT llh_store");
    assert.doesNotMatch(prepJoined, /CREATE TABLE/i, "E42 no CREATE TABLE");
    assert.doesNotMatch(prepJoined, /CREATE INDEX/i, "E42 no CREATE INDEX");
    assert.doesNotMatch(prepJoined, /INSERT INTO llh_curriculum_operator_jobs/i, "E42 no dedicated DML");
    assert.equal(ctx.operatorJobStore, null);
    await mockPrep.end();

    // E43/E45: full pipeline SQL order without pre-supplied memory job store
    // (forces client-backed initTable after backup)
    const mock = createMockClient({ store });
    const phases = [];
    const orig = mock.query.bind(mock);
    mock.query = async (sql, params) => {
      const text = String(sql);
      if (/FROM llh_store/i.test(text) && /updated_at_exact/i.test(text) && !/FOR UPDATE/i.test(text)
        && !/INSERT INTO llh_store_backups/i.test(text)) {
        if (!phases.includes("select_store")) phases.push("select_store");
      }
      if (/INSERT INTO llh_store_backups/i.test(text)) phases.push("backup_insert");
      if (/FROM llh_store_backups/i.test(text) && /SELECT/i.test(text)) phases.push("backup_select");
      if (/UPDATE llh_store_backups SET verified/i.test(text)) phases.push("backup_verified");
      if (/CREATE TABLE/i.test(text)) phases.push("create_table");
      if (/CREATE INDEX/i.test(text)) phases.push("create_index");
      if (/INSERT INTO llh_curriculum_operator_jobs/i.test(text)) phases.push("dedicated_insert");
      return orig(sql, params);
    };
    // Seed one SELECT via prepare-equivalent so order starts with store read
    await mock.connect();
    await mock.query(execute.POSTGRES_SELECT_STORE_ROW, ["launch-store"]);
    const result = await execute.runStage2Execution({
      mode: "fixture",
      apply: true,
      confirmMigrate: true,
      confirmCutover: false,
      client: mock,
      store,
      storeUpdatedAtExact: cas,
      productionBuildSha: build,
      expectedProductionBuildSha: build,
      expectedSourceCount: 53,
      // intentionally omit operatorJobStore → postgres-backed init after backup
    });
    assert.equal(result.wroteDedicated, true, "E45 migration after backup");
    assert.ok(mock.getDedicatedCount() >= 53, "E45 dedicated rows written");

    const idx = (name) => phases.indexOf(name);
    assert.ok(idx("select_store") >= 0, "E41 select present");
    assert.ok(idx("backup_insert") > idx("select_store"), "E43 backup after select");
    assert.ok(idx("backup_select") > idx("backup_insert"), "E43 verify select after insert");
    assert.ok(idx("backup_verified") > idx("backup_select"), "E43 verified mark after select");
    assert.ok(idx("create_table") > idx("backup_verified"), "E43 CREATE TABLE after verified backup");
    assert.ok(idx("create_index") > idx("backup_verified"), "E43 CREATE INDEX after verified backup");
    assert.ok(idx("dedicated_insert") > idx("create_table"), "E45 migrate after init");
    // Never reverse: no dedicated DDL/DML before backup_verified
    for (const bad of ["create_table", "create_index", "dedicated_insert"]) {
      assert.ok(idx(bad) > idx("backup_verified"), `${bad} must follow backup_verified`);
    }

    // E44: backup failure → zero dedicated DDL/DML
    const mockFail = createMockClient({ store, failBackupInsert: true });
    const failPhases = [];
    const oFail = mockFail.query.bind(mockFail);
    mockFail.query = async (sql, params) => {
      const text = String(sql);
      if (/CREATE TABLE|CREATE INDEX/i.test(text)) failPhases.push("ddl");
      if (/INSERT INTO llh_curriculum_operator_jobs/i.test(text)) failPhases.push("dml");
      return oFail(sql, params);
    };
    let e44 = null;
    try {
      await execute.runStage2Execution({
        mode: "fixture",
        apply: true,
        confirmMigrate: true,
        client: mockFail,
        store,
        storeUpdatedAtExact: cas,
        productionBuildSha: build,
        expectedSourceCount: 53,
      });
    } catch (e) { e44 = e; }
    assert.ok(e44, "E44 backup failure throws");
    assert.deepEqual(failPhases, [], "E44 zero dedicated DDL/DML");
    assert.equal(mockFail.getDedicatedCount(), 0);
    assert.equal(mockFail.writeCount(), 0);

    // E46: production hard lock still before connection
    let factoryCalls = 0;
    let e46 = null;
    try {
      stage2.assertProductionApplyUnlocked({
        apply: true, postgres: true, confirmMigrate: true, confirmCutover: true,
      });
      await execute.prepareAndRunPostgresStage2Execution({
        apply: true,
        confirmMigrate: true,
        confirmCutover: true,
        expectedSourceCount: 53,
        expectedSourceHash: "x",
        expectedStoreUpdatedAt: cas,
        expectedProductionBuildSha: build,
        createClient: async () => { factoryCalls += 1; throw new Error("no"); },
      });
    } catch (e) { e46 = e; }
    assert.equal(e46?.code, "stage2_production_apply_locked");
    assert.equal(factoryCalls, 0);
  }
  console.log("PASS  E41-E46");

  console.log("\nAll Stage 2 EXECUTION tests passed (production apply still locked).");
}

main().catch((error) => {
  console.error("\nFAIL:", error.stack || error);
  process.exit(1);
});
