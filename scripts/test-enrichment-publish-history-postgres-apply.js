#!/usr/bin/env node
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
const { pruneEnrichmentPublishHistoryInStore } = require("../server/enrichment-publish-history.js");

function entry(n, overrides = {}) {
  return {
    versionId: `v-${n}`,
    kind: "draft",
    publishedAt: new Date(Date.UTC(2026, 0, n)).toISOString(),
    publishedBy: "tester",
    fingerprint: `fp-${n}`,
    lessonPlanId: "plan-a",
    snapshot: { enrichmentDraft: { tip: `t-${n}`, pad: "x".repeat(120) } },
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
            enrichmentPublishHistory: history.map((e) => ({
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

function backupRowFor(store, overrides = {}) {
  const ids = store.siteContent.curriculum.lessonPlans.map((p) => p.id).sort();
  return {
    id: "backup_2026-08-12T23-44-42-105Z_pre-enrichment-history-prune",
    created_at: new Date("2026-08-12T23:44:42.421Z"),
    source: "pre-enrichment-history-prune",
    verified: true,
    user_count: Object.keys(store.users || {}).length,
    message_count: 0,
    founding_count: Array.isArray(store.foundingMembers) ? store.foundingMembers.length : 0,
    lesson_plan_count: store.siteContent.curriculum.lessonPlans.length,
    lesson_plan_ids: ids,
    ...overrides,
  };
}

function createMockClient({
  store,
  updatedAt = new Date("2026-08-12T23:50:00.000Z"),
  backup,
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
  const resolvedBackup = backup === undefined ? backupRowFor(store) : backup;
  return {
    writeCount() { return writes; },
    getRow() { return row; },
    async query(sql, params = []) {
      const text = String(sql).replace(/\s+/g, " ").trim();
      if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") return { rows: [], rowCount: 0 };
      if (text.includes("pg_advisory_xact_lock")) return { rows: [], rowCount: 0 };
      if (text.includes("FROM llh_store_backups")) {
        if (!resolvedBackup) return { rows: [], rowCount: 0 };
        if (params[0] && resolvedBackup.id !== params[0]) return { rows: [], rowCount: 0 };
        return { rows: [resolvedBackup], rowCount: 1 };
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
        if (new Date(row.updated_at).getTime() !== new Date(params[2]).getTime()) {
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
}

const env = { PRODUCTION_DATABASE_URL: "postgres://local/test", LLH_STORE_RECORD_ID: "launch-store" };
const backupId = "backup_2026-08-12T23-44-42-105Z_pre-enrichment-history-prune";
const applyArgs = [
  "--from-postgres", "--apply", "--confirm-postgres-prune", `--backup-id=${backupId}`, "--json",
];

async function main() {
  assert.equal(parseArgs(["--from-postgres"]).confirmPostgresPrune, false);

  // TEST 1 dry-run
  {
    const client = createMockClient({ store: makeStore(8) });
    const report = await run(["--from-postgres", "--json"], { client, env });
    assert.equal(report.wrote, false);
    assert.equal(client.writeCount(), 0);
  }

  // TEST 2 apply without confirm
  {
    const client = createMockClient({ store: makeStore(8) });
    await assert.rejects(
      () => run(["--from-postgres", "--apply", "--json"], { client, env }),
      /confirm-postgres-prune/,
    );
    assert.equal(client.writeCount(), 0);
  }

  // TEST 3 missing / unverified / mismatched backup
  {
    const store = makeStore(8);
    const updatedAt = new Date("2026-08-12T23:50:00.000Z");
    const missing = createMockClient({ store, updatedAt, backup: null });
    await assert.rejects(() => run(applyArgs, { client: missing, env }), /backup not found/);
    assert.equal(missing.writeCount(), 0);

    const notFoundClient = createMockClient({
      store,
      updatedAt,
      backup: backupRowFor(store, { id: "backup_2026-01-01T00-00-00-000Z_other" }),
    });
    await assert.rejects(() => run(applyArgs, { client: notFoundClient, env }), /backup not found/);
    assert.equal(notFoundClient.writeCount(), 0);

    const unverified = createMockClient({
      store,
      updatedAt,
      backup: backupRowFor(store, { verified: false }),
    });
    await assert.rejects(() => run(applyArgs, { client: unverified, env }), /not verified/);
    assert.equal(unverified.writeCount(), 0);

    const mismatchedIds = createMockClient({
      store,
      updatedAt,
      backup: backupRowFor(store, {
        lesson_plan_ids: ["cur-lp-totally-unrelated"],
        lesson_plan_count: 1,
      }),
    });
    await assert.rejects(() => run(applyArgs, { client: mismatchedIds, env }), /not bound|do not match|lesson_plan/);
    assert.equal(mismatchedIds.writeCount(), 0);

    const mismatchedUsers = createMockClient({
      store,
      updatedAt,
      backup: backupRowFor(store, { user_count: 999 }),
    });
    await assert.rejects(() => run(applyArgs, { client: mismatchedUsers, env }), /user_count/);
    assert.equal(mismatchedUsers.writeCount(), 0);
  }

  // TEST 4 success single write
  {
    const store = makeStore(8);
    const updatedAt = new Date("2026-08-12T23:50:00.000Z");
    const client = createMockClient({ store, updatedAt });
    const report = await run(applyArgs, { client, env });
    assert.equal(report.wrote, true);
    assert.equal(report.postgresWriteCount, 1);
    assert.equal(client.writeCount(), 1);
    const farm = client.getRow().data.siteContent.curriculum.lessonPlans[0];
    assert.equal(farm.enrichmentPublishHistory.length, 5);
    assert.deepStrictEqual(farm.enrichmentDraft, store.siteContent.curriculum.lessonPlans[0].enrichmentDraft);
  }

  // TEST 5 stale state
  {
    const store = makeStore(8);
    const updatedAt = new Date("2026-08-12T23:50:00.000Z");
    const client = createMockClient({
      store,
      updatedAt,
      mutateBeforeLock: (row) => {
        row.updated_at = new Date("2026-08-12T23:59:00.000Z");
        row.data = JSON.parse(JSON.stringify(row.data));
        row.data.users["b@example.com"] = { plan: "Pro" };
      },
    });
    await assert.rejects(() => run(applyArgs, { client, env }), /stale-state|fingerprint|concurrency/i);
    assert.equal(client.writeCount(), 0);
  }

  // TEST 6 invariant
  {
    const store = makeStore(3);
    const broken = JSON.parse(JSON.stringify(store));
    broken.siteContent.curriculum.lessonPlans[0].enrichmentDraft = { tip: "CHANGED" };
    assert.throws(() => assertHistoryOnlyTransform(store, broken), /enrichmentDraft|non-history/);
  }

  // TEST 7 write error
  {
    const store = makeStore(8);
    const updatedAt = new Date("2026-08-12T23:50:00.000Z");
    const client = createMockClient({ store, updatedAt, failWrite: true });
    await assert.rejects(() => run(applyArgs, { client, env }), /synthetic_write_failure/);
    assert.equal(client.writeCount(), 0);
  }

  // TEST 8 post-write verify failure
  {
    const store = makeStore(8);
    const updatedAt = new Date("2026-08-12T23:50:00.000Z");
    const client = createMockClient({ store, updatedAt, corruptAfterWrite: true });
    await assert.rejects(() => run(applyArgs, { client, env }), /HARD FAILURE|fingerprint|post-write/i);
    assert.equal(client.writeCount(), 1);
  }

  // TEST 9 local JSON regression
  {
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
    assertHistoryOnlyTransform(store, after);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // Direct helper single-write proof
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
      backupId,
      confirmPostgresPrune: true,
    });
    assert.equal(result.postgresWriteCount, 1);
  }

  {
    const store = makeStore(6);
    const pruned = JSON.parse(JSON.stringify(store));
    pruneEnrichmentPublishHistoryInStore(pruned);
    assertHistoryOnlyTransform(store, pruned);
  }

  console.log("All enrichment publish-history Postgres apply-path tests passed.");
}

main().catch((error) => {
  console.error("FAIL:", error.message);
  console.error(error.stack);
  process.exit(1);
});
