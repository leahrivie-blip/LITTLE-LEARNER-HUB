#!/usr/bin/env node
/**
 * Regression: prune CAS must preserve PostgreSQL microsecond precision.
 *
 * Proves the production failure mode where node-pg Date truncation made
 * `updated_at IS NOT DISTINCT FROM $jsDate` match 0 rows even though
 * Date#getTime() comparisons still looked equal.
 */
"use strict";

const assert = require("assert");
const {
  stableFingerprint,
  jsDateIsoFromUpdatedAtExact,
  normalizeUpdatedAtExact,
  applyControlledPostgresPrune,
  loadPostgresStoreRow,
} = require("./lib/enrichment-history-postgres-apply.js");
const { run } = require("./prune-enrichment-publish-history.js");

const EXACT_A = "2026-08-13 01:06:09.627215+00";
const EXACT_B_SAME_MS = "2026-08-13 01:06:09.627800+00";
const EXACT_C_SAME_MS = "2026-08-13 01:06:09.627999+00";
const EXACT_OTHER_MS = "2026-08-13 01:06:10.000000+00";

const backupId = "backup_2026-08-13T01-51-28-215Z_pre-enrichment-history-prune";

function makeStore() {
  return {
    users: { "a@example.com": { plan: "Free" } },
    foundingMembers: ["a@example.com"],
    siteContent: {
      curriculum: {
        activities: [{ id: "act-1", title: "Keep" }],
        resources: [{ id: "res-1", title: "Printable" }],
        lessonPlans: [{
          id: "cur-lp-preschool-farm-animals",
          title: "Farm Animals",
          enrichmentDraft: { tip: "draft" },
          enrichmentPublished: { tip: "published" },
          teachingKit: { binderTitle: "TK" },
          weeklyOverview: "overview",
          objectives: "objectives",
          enrichmentPublishHistory: Array.from({ length: 8 }, (_, i) => ({
            versionId: `v-${8 - i}`,
            kind: "draft",
            fingerprint: `fp-${8 - i}`,
            snapshot: { enrichmentDraft: { tip: `t-${8 - i}` } },
          })),
        }],
      },
    },
  };
}

function backupRowFor(store) {
  return {
    id: backupId,
    created_at: new Date("2026-08-13T01:51:28.259Z"),
    source: "pre-enrichment-history-prune",
    verified: true,
    user_count: 1,
    message_count: 0,
    founding_count: 1,
    data: JSON.parse(JSON.stringify(store)),
  };
}

/**
 * Mock that preserves exact timestamptz text independently of JS Date.
 * UPDATE CAS compares exact text only (mirrors Postgres IS NOT DISTINCT FROM
 * after binding `$n::timestamptz` from the exact token).
 */
function createPrecisionMockClient({
  store,
  updatedAtExact,
  backup,
  mutateBeforeLock = null,
} = {}) {
  let writes = 0;
  const jsDate = new Date(
    updatedAtExact.replace(" ", "T").replace(/\+00$/, "Z"),
  );
  let row = {
    id: "launch-store",
    data: JSON.parse(JSON.stringify(store)),
    updated_at: jsDate,
    updated_at_exact: updatedAtExact,
  };
  const resolvedBackup = backup === undefined ? backupRowFor(store) : backup;

  function selectRow() {
    return {
      id: row.id,
      data: row.data,
      updated_at: row.updated_at,
      updated_at_exact: row.updated_at_exact,
    };
  }

  return {
    writeCount() { return writes; },
    getRow() { return row; },
    async query(sql, params = []) {
      const text = String(sql).replace(/\s+/g, " ").trim();
      if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") {
        return { rows: [], rowCount: 0 };
      }
      if (text.includes("pg_advisory_xact_lock")) return { rows: [], rowCount: 0 };
      if (text.includes("FROM llh_store_backups")) {
        if (!resolvedBackup) return { rows: [], rowCount: 0 };
        if (params[0] && resolvedBackup.id !== params[0]) return { rows: [], rowCount: 0 };
        return { rows: [resolvedBackup], rowCount: 1 };
      }
      if (text.includes("FOR UPDATE")) {
        if (typeof mutateBeforeLock === "function") mutateBeforeLock(row);
        return { rows: [selectRow()], rowCount: 1 };
      }
      if (text.includes("FROM llh_store") && text.includes("updated_at_exact")) {
        return { rows: [selectRow()], rowCount: 1 };
      }
      if (text.includes("UPDATE llh_store") && text.includes("updated_at IS NOT DISTINCT FROM")) {
        // Exact CAS — microseconds must match. No Date#getTime fallback.
        if (String(row.updated_at_exact) !== String(params[2]).trim()) {
          return { rows: [], rowCount: 0 };
        }
        writes += 1;
        const nextExact = "2026-08-13 01:10:00.123456+00";
        row = {
          id: params[0],
          data: JSON.parse(params[1]),
          updated_at: new Date("2026-08-13T01:10:00.123Z"),
          updated_at_exact: nextExact,
        };
        return {
          rows: [{
            id: row.id,
            updated_at: row.updated_at,
            updated_at_exact: row.updated_at_exact,
          }],
          rowCount: 1,
        };
      }
      throw new Error(`Unexpected SQL in precision mock: ${text.slice(0, 160)}`);
    },
    async connect() {},
    async end() {},
  };
}

async function main() {
  // A) Old JS Date representation truncates microseconds.
  {
    const truncated = jsDateIsoFromUpdatedAtExact(EXACT_A);
    assert.equal(truncated, "2026-08-13T01:06:09.627Z");
    assert.ok(truncated.includes(".627Z"));
    assert.ok(!truncated.includes("627215"));
    assert.ok(EXACT_A.includes("627215"));
  }

  // B) New exact CAS token preserves microseconds.
  {
    assert.equal(normalizeUpdatedAtExact(EXACT_A), EXACT_A);
    assert.ok(normalizeUpdatedAtExact(EXACT_A).includes(".627215"));
    const store = makeStore();
    const client = createPrecisionMockClient({ store, updatedAtExact: EXACT_A });
    const loaded = await loadPostgresStoreRow(client, "launch-store");
    assert.equal(loaded.updatedAtExact, EXACT_A);
    assert.equal(loaded.updatedAt.toISOString(), "2026-08-13T01:06:09.627Z");
    assert.notEqual(String(loaded.updatedAtExact), loaded.updatedAt.toISOString());
  }

  // C + D) Exact match → guarded UPDATE succeeds with exactly 1 row.
  {
    const store = makeStore();
    const client = createPrecisionMockClient({ store, updatedAtExact: EXACT_A });
    const result = await applyControlledPostgresPrune({
      client,
      storeRecordId: "launch-store",
      sourceStore: store,
      sourceUpdatedAt: new Date("2026-08-13T01:06:09.627Z"),
      sourceUpdatedAtExact: EXACT_A,
      sourceFingerprint: stableFingerprint(store),
      backupId,
      confirmPostgresPrune: true,
    });
    assert.equal(result.postgresWriteCount, 1);
    assert.equal(client.writeCount(), 1);
    assert.equal(
      client.getRow().data.siteContent.curriculum.lessonPlans[0].enrichmentPublishHistory.length,
      5,
    );
  }

  // Different timestamp (other millisecond) → fail closed, 0 rows.
  {
    const store = makeStore();
    const client = createPrecisionMockClient({
      store,
      updatedAtExact: EXACT_A,
      mutateBeforeLock: (row) => {
        row.updated_at_exact = EXACT_OTHER_MS;
        row.updated_at = new Date("2026-08-13T01:06:10.000Z");
      },
    });
    await assert.rejects(
      () => applyControlledPostgresPrune({
        client,
        storeRecordId: "launch-store",
        sourceStore: store,
        sourceUpdatedAt: new Date("2026-08-13T01:06:09.627Z"),
        sourceUpdatedAtExact: EXACT_A,
        sourceFingerprint: stableFingerprint(store),
        backupId,
        confirmPostgresPrune: true,
      }),
      /stale-state|concurrency mismatch/i,
    );
    assert.equal(client.writeCount(), 0);
  }

  // Same millisecond / different microseconds (.627215 vs .627800) → reject.
  {
    const store = makeStore();
    const client = createPrecisionMockClient({
      store,
      updatedAtExact: EXACT_A,
      mutateBeforeLock: (row) => {
        row.updated_at_exact = EXACT_B_SAME_MS;
        // JS Date stays in the same millisecond — old CAS would have accepted this.
        row.updated_at = new Date("2026-08-13T01:06:09.627Z");
      },
    });
    assert.equal(
      new Date("2026-08-13T01:06:09.627215Z").getTime(),
      new Date("2026-08-13T01:06:09.627800Z").getTime(),
      "fixture precondition: Date#getTime collapses these micros",
    );
    await assert.rejects(
      () => applyControlledPostgresPrune({
        client,
        storeRecordId: "launch-store",
        sourceStore: store,
        sourceUpdatedAt: new Date("2026-08-13T01:06:09.627Z"),
        sourceUpdatedAtExact: EXACT_A,
        sourceFingerprint: stableFingerprint(store),
        backupId,
        confirmPostgresPrune: true,
      }),
      /stale-state|concurrency mismatch/i,
    );
    assert.equal(client.writeCount(), 0);
  }

  // Same millisecond / different microseconds (.627215 vs .627999) → 0-row UPDATE path.
  // Force past the JS precondition by mutating only at UPDATE time is not possible with
  // our mock (FOR UPDATE reads first). Instead: load exact A, then mutate lock to C
  // (same ms) so exact precondition rejects before UPDATE — still 0 writes.
  {
    const store = makeStore();
    const client = createPrecisionMockClient({
      store,
      updatedAtExact: EXACT_A,
      mutateBeforeLock: (row) => {
        row.updated_at_exact = EXACT_C_SAME_MS;
        row.updated_at = new Date("2026-08-13T01:06:09.627Z");
      },
    });
    assert.equal(
      new Date("2026-08-13T01:06:09.627215Z").getTime(),
      new Date("2026-08-13T01:06:09.627999Z").getTime(),
    );
    await assert.rejects(
      () => applyControlledPostgresPrune({
        client,
        storeRecordId: "launch-store",
        sourceStore: store,
        sourceUpdatedAtExact: EXACT_A,
        sourceFingerprint: stableFingerprint(store),
        backupId,
        confirmPostgresPrune: true,
      }),
      /stale-state precondition failed/,
    );
    assert.equal(client.writeCount(), 0);
  }

  // Prove UPDATE itself rejects micros-different tokens (bypass precondition by
  // matching FOR UPDATE exact, then changing exact only for the UPDATE compare).
  {
    const store = makeStore();
    let flipForUpdate = false;
    const client = createPrecisionMockClient({ store, updatedAtExact: EXACT_A });
    const originalQuery = client.query.bind(client);
    client.query = async (sql, params = []) => {
      const text = String(sql).replace(/\s+/g, " ").trim();
      if (text.includes("UPDATE llh_store") && text.includes("updated_at IS NOT DISTINCT FROM")) {
        // Simulate another writer changing micros after FOR UPDATE snapshot in a race
        // that still reaches UPDATE with a now-stale exact token.
        client.getRow().updated_at_exact = EXACT_C_SAME_MS;
      }
      if (text.includes("FOR UPDATE")) flipForUpdate = true;
      return originalQuery(sql, params);
    };
    await assert.rejects(
      () => applyControlledPostgresPrune({
        client,
        storeRecordId: "launch-store",
        sourceStore: store,
        sourceUpdatedAtExact: EXACT_A,
        sourceFingerprint: stableFingerprint(store),
        backupId,
        confirmPostgresPrune: true,
      }),
      /UPDATE affected 0 rows|concurrency mismatch/i,
    );
    assert.equal(client.writeCount(), 0);
    assert.equal(flipForUpdate, true);
  }

  // End-to-end CLI path with exact token from loadPostgresStoreRow.
  {
    const store = makeStore();
    const env = { PRODUCTION_DATABASE_URL: "postgres://local/test", LLH_STORE_RECORD_ID: "launch-store" };
    const client = createPrecisionMockClient({ store, updatedAtExact: EXACT_A });
    const report = await run(
      ["--from-postgres", "--apply", "--confirm-postgres-prune", `--backup-id=${backupId}`, "--json"],
      { client, env },
    );
    assert.equal(report.wrote, true);
    assert.equal(report.postgresWriteCount, 1);
    assert.equal(report.sourceUpdatedAtExact, EXACT_A);
    assert.equal(client.writeCount(), 1);
  }

  // Dry-run still writes nothing.
  {
    const store = makeStore();
    const env = { PRODUCTION_DATABASE_URL: "postgres://local/test", LLH_STORE_RECORD_ID: "launch-store" };
    const client = createPrecisionMockClient({ store, updatedAtExact: EXACT_A });
    const report = await run(["--from-postgres", "--json"], { client, env });
    assert.equal(report.wrote, false);
    assert.equal(report.postgresWriteCount, 0);
    assert.equal(client.writeCount(), 0);
  }

  // Confirm flags still required.
  {
    const store = makeStore();
    const env = { PRODUCTION_DATABASE_URL: "postgres://local/test", LLH_STORE_RECORD_ID: "launch-store" };
    const client = createPrecisionMockClient({ store, updatedAtExact: EXACT_A });
    await assert.rejects(
      () => run(["--from-postgres", "--apply", "--json"], { client, env }),
      /confirm-postgres-prune/,
    );
    assert.equal(client.writeCount(), 0);
  }

  // Wrong / mismatched backup still rejected; fingerprint binding unchanged.
  {
    const store = makeStore();
    const drifted = JSON.parse(JSON.stringify(store));
    drifted.siteContent.curriculum.lessonPlans[0].weeklyOverview = "changed";
    const client = createPrecisionMockClient({
      store: drifted,
      updatedAtExact: EXACT_A,
      backup: backupRowFor(store),
    });
    await assert.rejects(
      () => applyControlledPostgresPrune({
        client,
        storeRecordId: "launch-store",
        sourceStore: drifted,
        sourceUpdatedAtExact: EXACT_A,
        sourceFingerprint: stableFingerprint(drifted),
        backupId,
        confirmPostgresPrune: true,
      }),
      /fingerprint does not match/,
    );
    assert.equal(client.writeCount(), 0);
  }

  console.log("All enrichment-history CAS timestamp precision tests passed.");
}

main().catch((error) => {
  console.error("FAIL:", error.message);
  console.error(error.stack);
  process.exit(1);
});
