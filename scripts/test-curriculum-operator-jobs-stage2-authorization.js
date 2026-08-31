#!/usr/bin/env node
/**
 * Stage 2 production authorization gate regressions.
 * Does NOT connect to production. Does NOT run Stage 2 against live data.
 *
 * Run: NODE_ENV=test node scripts/test-curriculum-operator-jobs-stage2-authorization.js
 */
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const stage2 = require("./lib/curriculum-operator-jobs-stage2.js");
const execute = require("./lib/curriculum-operator-jobs-stage2-execute.js");
const {
  createCurriculumOperatorJobStore,
} = require("../server/curriculum-operator-job-store.js");

const TOKEN = stage2.STAGE2_PRODUCTION_EXECUTION_AUTHORIZATION;
const CAS = "2026-08-30 12:00:00.000000+00";
const BUILD = "auth-test-build-sha";

function createMockClient({ store, updatedAtExact = CAS } = {}) {
  let writes = 0;
  let backupRows = new Map();
  let dedicated = new Map();
  let row = {
    id: "launch-store",
    data: JSON.parse(JSON.stringify(store)),
    updated_at: new Date("2026-08-30T12:00:00.000Z"),
    updated_at_exact: updatedAtExact,
  };
  return {
    writeCount: () => writes,
    getDedicatedCount: () => dedicated.size,
    ended: false,
    connected: false,
    async connect() { this.connected = true; },
    async end() { this.ended = true; this.connected = false; },
    async query(sql, params = []) {
      const text = String(sql).replace(/\s+/g, " ").trim();
      if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") return { rows: [], rowCount: 0 };
      if (text.includes("pg_advisory_xact_lock")) return { rows: [], rowCount: 0 };
      if (text.includes("CREATE TABLE") || text.includes("CREATE INDEX")) return { rows: [], rowCount: 0 };
      if (text.includes("INSERT INTO llh_store_backups")) {
        const id = params[0];
        const data = typeof params[7] === "string" ? JSON.parse(params[7]) : params[7];
        backupRows.set(id, {
          id, created_at: new Date(), source: params[1], verified: false,
          user_count: params[2], message_count: params[3], founding_count: params[4], data,
        });
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
        const incoming = JSON.parse(params[6]);
        dedicated.set(params[0], incoming);
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
      if (text.includes("FOR UPDATE")) return { rows: [{ ...row }], rowCount: 1 };
      if (text.includes("FROM llh_store") && text.includes("updated_at_exact")) {
        return { rows: [{ ...row }], rowCount: 1 };
      }
      if (text.includes("UPDATE llh_store") && text.includes("IS NOT DISTINCT FROM")) {
        writes += 1;
        row = {
          id: params[0],
          data: JSON.parse(params[1]),
          updated_at: new Date(),
          updated_at_exact: "2026-08-30 13:00:00.000000+00",
        };
        return { rows: [{ id: row.id, updated_at: row.updated_at, updated_at_exact: row.updated_at_exact }], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${text.slice(0, 160)}`);
    },
  };
}

function tinyStore() {
  const jobApi = require("./curriculum-operator-job.js");
  const jobs = [
    jobApi.normalizeOperatorJob({
      id: "opjob_run", status: "running", createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-30T00:00:00.000Z", createdBy: "owner@example.com", phase: 2,
      lessonResults: [{ lessonId: "a", title: "A", status: "success" }],
    }),
    jobApi.normalizeOperatorJob({
      id: "opjob_done", status: "completed", createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-29T00:00:00.000Z", createdBy: "owner@example.com", phase: 2,
      lessonResults: [{ lessonId: "b", title: "B", status: "success", audit: { blob: "x".repeat(200) } }],
    }),
  ];
  return {
    users: { "a@example.com": { email: "a@example.com" } },
    programData: {},
    scheduleByUser: {},
    billingEvents: [],
    foundingMembers: [],
    messages: [],
    notifications: [],
    supportTickets: [],
    siteContent: { curriculum: { lessonPlans: [], activities: [] } },
    curriculumOperatorJobs: { jobs, updatedAt: "2026-08-30T00:00:00.000Z" },
  };
}

async function main() {
  console.log("A1) No authorization → production apply locked");
  {
    let err = null;
    try {
      stage2.assertProductionApplyUnlocked({
        apply: true, postgres: true, confirmMigrate: true, confirmCutover: true,
      });
    } catch (e) { err = e; }
    assert.equal(err?.code, "stage2_production_apply_locked");
  }
  console.log("PASS  A1");

  console.log("A2) Wrong authorization → invalid");
  {
    let err = null;
    try {
      stage2.assertProductionApplyUnlocked({
        apply: true, postgres: true, confirmMigrate: true, confirmCutover: true,
        authorizeStage2ProductionExecution: "WRONG-TOKEN",
      });
    } catch (e) { err = e; }
    assert.equal(err?.code, "stage2_production_authorization_invalid");
  }
  console.log("PASS  A2");

  console.log("A3) Correct authorization without --apply → no writes");
  {
    const ok = stage2.assertProductionApplyUnlocked({
      authorizeStage2ProductionExecution: TOKEN,
    });
    assert.equal(ok.authorized, true);
    assert.equal(ok.persistent, false);
    assert.equal(ok.scope, "cli-process-only");

    const store = tinyStore();
    const client = createMockClient({ store });
    const result = await execute.runStage2Execution({
      mode: "fixture",
      apply: false,
      confirmMigrate: true,
      confirmCutover: true,
      client,
      store,
      storeUpdatedAtExact: CAS,
      productionBuildSha: BUILD,
      authorizeStage2ProductionExecution: TOKEN,
      expectedSourceCount: 2,
    });
    assert.equal(result.wrote, false);
    assert.equal(result.phase, "preflight");
    assert.equal(client.writeCount(), 0);
    assert.equal(client.getDedicatedCount(), 0);
  }
  console.log("PASS  A3");

  console.log("A4) Correct authorization without migrate confirmation → blocked");
  {
    let err = null;
    try {
      await execute.prepareAndRunPostgresStage2Execution({
        apply: true,
        confirmMigrate: false,
        confirmCutover: true,
        expectedSourceCount: 2,
        expectedSourceHash: "abc",
        expectedStoreUpdatedAt: CAS,
        expectedProductionBuildSha: BUILD,
        authorizeStage2ProductionExecution: TOKEN,
        createClient: async () => { throw new Error("must not connect"); },
      });
    } catch (e) { err = e; }
    assert.equal(err?.code, "stage2_production_gates_incomplete");
  }
  console.log("PASS  A4");

  console.log("A5) Correct authorization without cutover confirmation → cannot hot-cap");
  {
    const store = tinyStore();
    const mock = createMockClient({ store });
    const result = await execute.prepareAndRunPostgresStage2Execution({
      apply: true,
      confirmMigrate: true,
      confirmCutover: false,
      expectedSourceCount: 2,
      expectedSourceHash: stage2.buildSourceManifest(store, {
        productionBuildSha: BUILD,
        storeUpdatedAtExact: CAS,
      }).aggregateHash,
      expectedStoreUpdatedAt: CAS,
      expectedProductionBuildSha: BUILD,
      productionBuildSha: BUILD,
      authorizeStage2ProductionExecution: TOKEN,
      connectionString: "postgresql://mock/db",
      createClient: async () => mock,
    });
    assert.equal(result.wroteDedicated, true);
    assert.equal(result.wroteHotStore, false);
    assert.equal(result.phase, "migrated_verified_preview");
    assert.equal(mock.writeCount(), 0);
  }
  console.log("PASS  A5");

  console.log("A6–A9) Missing expected count/hash/CAS/build → blocked");
  {
    const base = {
      apply: true,
      confirmMigrate: true,
      confirmCutover: true,
      expectedSourceCount: 2,
      expectedSourceHash: "abc",
      expectedStoreUpdatedAt: CAS,
      expectedProductionBuildSha: BUILD,
      authorizeStage2ProductionExecution: TOKEN,
    };
    for (const key of [
      "expectedSourceCount",
      "expectedSourceHash",
      "expectedStoreUpdatedAt",
      "expectedProductionBuildSha",
    ]) {
      const bad = { ...base, [key]: key === "expectedSourceCount" ? null : "" };
      if (key === "expectedProductionBuildSha") bad.productionBuildSha = "";
      let err = null;
      try {
        await execute.prepareAndRunPostgresStage2Execution({
          ...bad,
          createClient: async () => { throw new Error("must not connect"); },
        });
      } catch (e) { err = e; }
      assert.equal(err?.code, "stage2_production_gates_incomplete", key);
    }
  }
  console.log("PASS  A6-A9");

  console.log("A10) Authorization does not change isHotStoreCutoverEnabled()");
  {
    stage2.assertProductionApplyUnlocked({ authorizeStage2ProductionExecution: TOKEN });
    const rt = createCurriculumOperatorJobStore({ localFilePath: null });
    assert.equal(rt.isHotStoreCutoverEnabled(), false);
    assert.equal(rt.canSafelyCapHotStore(), false);
  }
  console.log("PASS  A10");

  console.log("A11) Authorization does not create HTTP/runtime access");
  {
    const serverIndex = fs.readFileSync(path.join(__dirname, "../server/index.js"), "utf8");
    assert.doesNotMatch(serverIndex, /authorize-stage2-production-execution|STAGE2-PRODUCTION-EXECUTION-AUTHORIZED/);
    assert.doesNotMatch(serverIndex, /prepareAndRunPostgresStage2Execution/);
  }
  console.log("PASS  A11");

  console.log("A12) Authorization is process/CLI scoped only (env ignored)");
  {
    const prev = process.env.STAGE2_PRODUCTION_EXECUTION_AUTHORIZATION;
    process.env.STAGE2_PRODUCTION_EXECUTION_AUTHORIZATION = TOKEN;
    process.env.AUTHORIZE_STAGE2_PRODUCTION_EXECUTION = TOKEN;
    let err = null;
    try {
      stage2.assertProductionApplyUnlocked({
        apply: true, postgres: true, confirmMigrate: true, confirmCutover: true,
      });
    } catch (e) { err = e; }
    if (prev === undefined) delete process.env.STAGE2_PRODUCTION_EXECUTION_AUTHORIZATION;
    else process.env.STAGE2_PRODUCTION_EXECUTION_AUTHORIZATION = prev;
    delete process.env.AUTHORIZE_STAGE2_PRODUCTION_EXECUTION;
    assert.equal(err?.code, "stage2_production_apply_locked");

    // CLI missing token still locks before network
    const locked = spawnSync(
      process.execPath,
      [
        path.join(__dirname, "migrate-curriculum-operator-jobs-stage2.js"),
        "--postgres", "--apply",
        "--confirm-migrate-operator-jobs",
        "--confirm-hot-store-cutover",
        "--expected-source-count", "2",
        "--expected-source-hash", "deadbeef",
        "--expected-store-updated-at", CAS,
        "--expected-production-build-sha", BUILD,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          PRODUCTION_DATABASE_URL: "postgresql://example.invalid/db",
          STAGE2_PRODUCTION_EXECUTION_AUTHORIZATION: TOKEN,
        },
      },
    );
    assert.notEqual(locked.status, 0);
    assert.match(locked.stderr || locked.stdout, /NOT unlocked|STAGE2 TOOL FAILED/i);
    assert.doesNotMatch(locked.stderr || "", /ENOTFOUND|ECONNREFUSED/i);
  }
  console.log("PASS  A12");

  console.log("\nAll Stage 2 AUTHORIZATION tests passed (no production execution).");
}

main().catch((error) => {
  console.error("\nFAIL:", error.stack || error);
  process.exit(1);
});
