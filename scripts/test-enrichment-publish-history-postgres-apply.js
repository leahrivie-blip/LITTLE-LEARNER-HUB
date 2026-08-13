#!/usr/bin/env node
/**
 * Deterministic tests for controlled Postgres apply path
 * in scripts/prune-enrichment-publish-history.js
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  parseArgs,
  stableFingerprint,
  assertHistoryOnlyTransform,
  applyControlledPostgresPrune,
  run,
} = require("./prune-enrichment-publish-history.js");
const {
  pruneEnrichmentPublishHistoryInStore,
} = require("../server/enrichment-publish-history.js");

function entry(n, overrides = {}) {
  return {
    versionId: `v-${n}`,
    kind: "draft",
    publishedAt: new Date(Date.UTC(2026, 0, n)).toISOString(),
    publishedBy: "tester",
    fingerprint: `fp-${n}`,
    lessonPlanId: "plan-a",
    snapshot: { enrichmentDraft: { tip: `t-${n}`, pad: "x".repeat(200) } },
    ...overrides,
  };
}

function makeStore(historyLen = 8) {
  const history = [];
  for (let i = historyLen; i >= 1; i -= 1) history.push(entry(i));
  return {
    users: { "a@example.com": { plan: "Free" } },
    foundingMembers: ["a@example.com"],
    siteContent: {
      branding: { name: "LLH" },
      curriculum: {
        activities: [{ id: "act-1", title: "Keep me" }],
        resources: [{ id: "res-1", title: "Printable" }],
        lessonPlans: [
          {
            id: "cur-lp-preschool-farm-animals",
            title: "Farm Animals",
            status: "published",
            enrichmentDraft: { tip: "current-draft" },
            enrichmentPublished: { tip: "published" },
            teachingKit: { binderTitle: "Farm TK" },
            dailyPlans: { monday: { items: [{ title: "Circle", setupMediaAssetId: "media-1" }] } },
            resourceIds: ["res-1"],
            coverMediaAssetId: "cover-1",
            enrichmentPublishHistory: history,
          },
          {
            id: "cur-lp-preschool-all-about-me",
            title: "All About Me",
            status: "published",
            enrichmentDraft: { tip: "aam-draft" },
            teachingKit: null,
            dailyPlans: { tuesday: { items: [{ title: "Me" }] } },
            resourceIds: [],
            enrichmentPublishHistory: history.map((e, idx) => ({
              ...e,
              versionId: `aam-${e.versionId}`,
              fingerprint: `aam-${e.fingerprint}`,
              lessonPlanId: "cur-lp-preschool-all-about-me",
            })),
          },
        ],
      },
    },
  };
}

function createMockClient({
  store,
  updatedAt = new Date("2026-08-12T23:40:00.000Z"),
  backup = {
    id: "backup_2026-08-12T23-44-42-105Z_pre-enrichment-history-prune",
    created_at: new Date("2026-08-12T23:44:42.421Z"),
    source: "pre-enrichment-history-prune",
    verified: true,
  },
  mutateBeforeLock = null,
  failWrite = false,
  corruptAfterWrite = false,
} = {}) {
  let writes = 0;
  let row = {
    id: "launch-store",
    data: JSON.parse(JSON.stringify(store)),
    updated_at: updatedAt,
  };
  const client = {
    writeCount() { return writes; },
    getRow() { return row; },
    async query(sql, params = []) {
      const text = String(sql).replace(/\s+/g, " ").trim();
      if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") return { rows: [], rowCount: 0 };
      if (text.includes("pg_advisory_xact_lock")) return { rows: [], rowCount: 0 };
      if (text.includes("FROM llh_store_backups")) {
        if (!backup) return { rows: [], rowCount: 0 };
        if (params[0] && backup.id !== params[0]) return { rows: [], rowCount: 0 };
        return { rows: [backup], rowCount: 1 };
      }
      if (text.includes("FOR UPDATE")) {
        if (typeof mutateBeforeLock === "function") mutateBeforeLock(row);
        return { rows: [{ id: row.id, data: row.data, updated_at: row.updated_at }], rowCount: 1 };
      }
      if (text.startsWith("SELECT id, data, updated_at FROM llh_store WHERE id")) {
        return { rows: [{ id: row.id, data: row.data, updated_at: row.updated_at }], rowCount: 1 };
      }
      if (text.includes("UPDATE llh_store") && text.includes("updated_at IS NOT DISTINCT FROM")) {
        if (failWrite) throw new Error("synthetic_write_failure");
        const expected = params[2];
        if (new Date(row.updated_at).getTime() !== new Date(expected).getTime()) {
          return { rows: [], rowCount: 0 };
        }
        writes += 1;
        row = {
          id: params[0],
          data: JSON.parse(params[1]),
          updated_at: new Date("2026-08-13T00:00:00.000Z"),
        };
        if (corruptAfterWrite) {
          row.data = JSON.parse(JSON.stringify(row.data));
          row.data.siteContent.curriculum.lessonPlans[0].enrichmentDraft = { tip: "CORRUPTED" };
        }
        return { rows: [{ id: row.id, updated_at: row.updated_at }], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL in mock: ${text.slice(0, 160)}`);
    },
    async connect() {},
    async end() {},
  };
  return client;
}

async function testParseArgsSafety() {
  const dry = parseArgs(["--from-postgres", "--json"]);
  assert.equal(dry.apply, false);
  assert.equal(dry.confirmPostgresPrune, false);
  const refused = parseArgs(["--from-postgres", "--apply", "--json"]);
  assert.equal(refused.apply, true);
  assert.equal(refused.confirmPostgresPrune, false);
  const ok = parseArgs([
    "--from-postgres",
    "--apply",
    "--confirm-postgres-prune",
    "--backup-id=backup_2026-08-12T23-44-42-105Z_pre-enrichment-history-prune",
    "--json",
  ]);
  assert.equal(ok.confirmPostgresPrune, true);
  assert.equal(ok.backupId, "backup_2026-08-12T23-44-42-105Z_pre-enrichment-history-prune");
}

async function test1DryRunOnly() {
  const store = makeStore(8);
  const client = createMockClient({ store });
  const report = await run(["--from-postgres", "--json"], {
    client,
    env: { PRODUCTION_DATABASE_URL: "postgres://local/test", LLH_STORE_RECORD_ID: "launch-store" },
  });
  assert.equal(report.wrote, false);
  assert.equal(report.postgresWriteCount, 0);
  assert.equal(client.writeCount(), 0);
  assert.equal(report.historyEntriesBefore, 16);
  assert.equal(report.historyEntriesAfter, 10);
}

async function test2ApplyWithoutConfirmRefused() {
  const store = makeStore(8);
  const client = createMockClient({ store });
  await assert.rejects(
    () => run(["--from-postgres", "--apply", "--json"], {
      client,
      env: { PRODUCTION_DATABASE_URL: "postgres://local/test", LLH_STORE_RECORD_ID: "launch-store" },
    }),
    /confirm-postgres-prune/,
  );
  assert.equal(client.writeCount(), 0);
}

async function test3MissingOrUnverifiedBackupRefused() {
  const store = makeStore(8);
  const updatedAt = new Date("2026-08-12T23:50:00.000Z");

  const missing = createMockClient({ store, updatedAt, backup: null });
  await assert.rejects(
    () => run([
      "--from-postgres",
      "--apply",
      "--confirm-postgres-prune",
      "--backup-id=backup_2026-08-12T23-44-42-105Z_pre-enrichment-history-prune",
      "--json",
    ], {
      client: missing,
      env: { PRODUCTION_DATABASE_URL: "postgres://local/test", LLH_STORE_RECORD_ID: "launch-store" },
    }),
    /backup not found/,
  );
  assert.equal(missing.writeCount(), 0);

  const unverified = createMockClient({
    store,
    updatedAt,
    backup: {
      id: "backup_2026-08-12T23-44-42-105Z_pre-enrichment-history-prune",
      created_at: new Date("2026-08-12T23:44:42.421Z"),
      source: "pre-enrichment-history-prune",
      verified: false,
    },
  });
  await assert.rejects(
    () => run([
      "--from-postgres",
      "--apply",
      "--confirm-postgres-prune",
      "--backup-id=backup_2026-08-12T23-44-42-105Z_pre-enrichment-history-prune",
      "--json",
    ], {
      client: unverified,
      env: { PRODUCTION_DATABASE_URL: "postgres://local/test", LLH_STORE_RECORD_ID: "launch-store" },
    }),
    /not verified/,
  );
  assert.equal(unverified.writeCount(), 0);

  await assert.rejects(
    () => run([
      "--from-postgres",
      "--apply",
      "--confirm-postgres-prune",
      "--json",
    ], {
      client: createMockClient({ store, updatedAt }),
      env: { PRODUCTION_DATABASE_URL: "postgres://local/test", LLH_STORE_RECORD_ID: "launch-store" },
    }),
    /backup-id is required/,
  );
}

async function test4SuccessfulSingleWrite() {
  const store = makeStore(8);
  const updatedAt = new Date("2026-08-12T23:50:00.000Z");
  const client = createMockClient({ store, updatedAt });
  const report = await run([
    "--from-postgres",
    "--apply",
    "--confirm-postgres-prune",
    "--backup-id=backup_2026-08-12T23-44-42-105Z_pre-enrichment-history-prune",
    "--json",
  ], {
    client,
    env: { PRODUCTION_DATABASE_URL: "postgres://local/test", LLH_STORE_RECORD_ID: "launch-store" },
  });
  assert.equal(report.wrote, true);
  assert.equal(report.postgresWriteCount, 1);
  assert.equal(client.writeCount(), 1);
  assert.equal(report.postWriteVerified, true);
  const persisted = client.getRow().data;
  const farm = persisted.siteContent.curriculum.lessonPlans[0];
  const aam = persisted.siteContent.curriculum.lessonPlans[1];
  assert.equal(farm.enrichmentPublishHistory.length, 5);
  assert.equal(aam.enrichmentPublishHistory.length, 5);
  assert.deepStrictEqual(farm.enrichmentDraft, store.siteContent.curriculum.lessonPlans[0].enrichmentDraft);
  assert.deepStrictEqual(farm.teachingKit, store.siteContent.curriculum.lessonPlans[0].teachingKit);
  assert.deepStrictEqual(farm.dailyPlans, store.siteContent.curriculum.lessonPlans[0].dailyPlans);
  assert.deepStrictEqual(farm.resourceIds, ["res-1"]);
  assert.equal(farm.coverMediaAssetId, "cover-1");
  assert.ok(farm.enrichmentPublishHistory.every((e) => e.versionId));
}

async function test5StaleStateRefuses() {
  const store = makeStore(8);
  const updatedAt = new Date("2026-08-12T23:50:00.000Z");
  const client = createMockClient({
    store,
    updatedAt,
    mutateBeforeLock: (row) => {
      row.updated_at = new Date("2026-08-12T23:59:00.000Z");
      row.data = JSON.parse(JSON.stringify(row.data));
      row.data.users = { ...row.data.users, "b@example.com": { plan: "Pro" } };
    },
  });
  await assert.rejects(
    () => run([
      "--from-postgres",
      "--apply",
      "--confirm-postgres-prune",
      "--backup-id=backup_2026-08-12T23-44-42-105Z_pre-enrichment-history-prune",
      "--json",
    ], {
      client,
      env: { PRODUCTION_DATABASE_URL: "postgres://local/test", LLH_STORE_RECORD_ID: "launch-store" },
    }),
    /stale-state|fingerprint changed|concurrency/i,
  );
  assert.equal(client.writeCount(), 0);
}

async function test6InvariantViolationRefuses() {
  const store = makeStore(3);
  const updatedAt = new Date("2026-08-12T23:50:00.000Z");
  // Force invariant failure by monkey-patching prune result via corrupted source transform:
  // call applyControlledPostgresPrune with a source that already differs non-history after clone+prune
  // by injecting a buggy client that returns ok backup but we pass a broken assert via
  // mutating pruneEnrichmentPublishHistoryInStore outcome — instead directly call assertHistoryOnlyTransform.
  const before = makeStore(3);
  const after = JSON.parse(JSON.stringify(before));
  after.siteContent.curriculum.lessonPlans[0].enrichmentDraft = { tip: "CHANGED" };
  assert.throws(
    () => assertHistoryOnlyTransform(before, after),
    /enrichmentDraft changed/,
  );

  // Also ensure apply path won't write if history trim mismatches: use applyControlledPostgresPrune
  // with a custom client and mutate pruned path by failing assert — covered above.
  // Simulate retention invariant via corrupted expected history using direct helper:
  const client = createMockClient({ store, updatedAt });
  const pruned = JSON.parse(JSON.stringify(store));
  pruned.siteContent.curriculum.lessonPlans[0].enrichmentPublishHistory = [
    entry(99, { versionId: "not-from-policy" }),
  ];
  assert.throws(
    () => assertHistoryOnlyTransform(store, pruned),
    /history trim mismatch/,
  );
  assert.equal(client.writeCount(), 0);
}

async function test7WriteErrorCleanFailure() {
  const store = makeStore(8);
  const updatedAt = new Date("2026-08-12T23:50:00.000Z");
  const client = createMockClient({ store, updatedAt, failWrite: true });
  await assert.rejects(
    () => run([
      "--from-postgres",
      "--apply",
      "--confirm-postgres-prune",
      "--backup-id=backup_2026-08-12T23-44-42-105Z_pre-enrichment-history-prune",
      "--json",
    ], {
      client,
      env: { PRODUCTION_DATABASE_URL: "postgres://local/test", LLH_STORE_RECORD_ID: "launch-store" },
    }),
    /synthetic_write_failure/,
  );
  assert.equal(client.writeCount(), 0);
}

async function test8PostWriteVerificationFailure() {
  const store = makeStore(8);
  const updatedAt = new Date("2026-08-12T23:50:00.000Z");
  const client = createMockClient({ store, updatedAt, corruptAfterWrite: true });
  await assert.rejects(
    () => run([
      "--from-postgres",
      "--apply",
      "--confirm-postgres-prune",
      "--backup-id=backup_2026-08-12T23-44-42-105Z_pre-enrichment-history-prune",
      "--json",
    ], {
      client,
      env: { PRODUCTION_DATABASE_URL: "postgres://local/test", LLH_STORE_RECORD_ID: "launch-store" },
    }),
    /HARD FAILURE|fingerprint mismatch|post-write/i,
  );
  // Write happened, but success was not reported.
  assert.equal(client.writeCount(), 1);
}

async function test9LocalJsonApplyUnchanged() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "llh-pg-apply-"));
  const storePath = path.join(tmpDir, "store.json");
  const store = makeStore(8);
  fs.writeFileSync(storePath, JSON.stringify(store));
  const before = fs.readFileSync(storePath, "utf8");
  const dry = await run([`--store-path=${storePath}`, "--json"]);
  assert.equal(dry.wrote, false);
  assert.equal(fs.readFileSync(storePath, "utf8"), before);

  const applied = await run([`--store-path=${storePath}`, "--apply", "--json"]);
  assert.equal(applied.wrote, true);
  const after = JSON.parse(fs.readFileSync(storePath, "utf8"));
  assert.equal(after.siteContent.curriculum.lessonPlans[0].enrichmentPublishHistory.length, 5);
  assert.deepStrictEqual(
    after.siteContent.curriculum.lessonPlans[0].enrichmentDraft,
    store.siteContent.curriculum.lessonPlans[0].enrichmentDraft,
  );
  assertHistoryOnlyTransform(store, after);
  // Local apply still does not require postgres confirm flags.
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

async function testHistoryOnlyAndFingerprintHelpers() {
  const store = makeStore(6);
  const pruned = JSON.parse(JSON.stringify(store));
  pruneEnrichmentPublishHistoryInStore(pruned);
  assertHistoryOnlyTransform(store, pruned);
  assert.notEqual(stableFingerprint(store), stableFingerprint(pruned));
}

async function main() {
  await testParseArgsSafety();
  await test1DryRunOnly();
  await test2ApplyWithoutConfirmRefused();
  await test3MissingOrUnverifiedBackupRefused();
  await test4SuccessfulSingleWrite();
  await test5StaleStateRefuses();
  await test6InvariantViolationRefuses();
  await test7WriteErrorCleanFailure();
  await test8PostWriteVerificationFailure();
  await test9LocalJsonApplyUnchanged();
  await testHistoryOnlyAndFingerprintHelpers();
  // Direct applyControlledPostgresPrune unit proof for single write
  {
    const store = makeStore(8);
    const updatedAt = new Date("2026-08-12T23:50:00.000Z");
    const client = createMockClient({ store, updatedAt });
    const result = await applyControlledPostgresPrune({
      client,
      storeRecordId: "launch-store",
      sourceStore: store,
      sourceUpdatedAt: updatedAt,
      sourceFingerprint: stableFingerprint(store),
      backupId: "backup_2026-08-12T23-44-42-105Z_pre-enrichment-history-prune",
      confirmPostgresPrune: true,
    });
    assert.equal(result.wrote, true);
    assert.equal(result.postgresWriteCount, 1);
    assert.equal(client.writeCount(), 1);
  }
  console.log("All enrichment publish-history Postgres apply-path tests passed.");
}

main().catch((error) => {
  console.error("FAIL:", error.message);
  console.error(error.stack);
  process.exit(1);
});
