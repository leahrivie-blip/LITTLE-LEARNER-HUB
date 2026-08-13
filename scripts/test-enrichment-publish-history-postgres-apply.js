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
  return {
    id: "backup_2026-08-12T23-44-42-105Z_pre-enrichment-history-prune",
    created_at: new Date("2026-08-12T23:44:42.421Z"),
    source: "pre-enrichment-history-prune",
    verified: true,
    user_count: Object.keys(store.users || {}).length,
    message_count: 0,
    founding_count: Array.isArray(store.foundingMembers) ? store.foundingMembers.length : 0,
    data: JSON.parse(JSON.stringify(store)),
    ...overrides,
  };
}

function toUpdatedAtExact(value) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (value instanceof Date) {
    // Millisecond fixtures serialize cleanly; microsecond fixtures must pass strings.
    return value.toISOString().replace(/\.\d{3}Z$/, (m) => `${m.slice(0, -1)}000+00`).replace(/Z$/, "+00").replace("T", " ");
  }
  return String(value).trim();
}

function createMockClient({
  store,
  updatedAt = new Date("2026-08-12T23:50:00.000Z"),
  updatedAtExact = null,
  backup,
  mutateBeforeLock = null,
  failWrite = false,
  corruptAfterWrite = false,
} = {}) {
  let writes = 0;
  const exact = updatedAtExact || toUpdatedAtExact(updatedAt);
  let row = {
    id: "launch-store",
    data: JSON.parse(JSON.stringify(store)),
    // Simulates node-pg Date (millisecond precision) for display/diagnostics.
    updated_at: updatedAt instanceof Date ? updatedAt : new Date(String(updatedAt).replace(" ", "T").replace(/\+00$/, "Z")),
    // Exact Postgres timestamptz::text — sole SQL CAS token.
    updated_at_exact: exact,
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
      if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") return { rows: [], rowCount: 0 };
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
      if (text.includes("FROM llh_store") && text.includes("updated_at_exact") && text.includes("LIMIT 1")) {
        return { rows: [selectRow()], rowCount: 1 };
      }
      if (text.includes("UPDATE llh_store") && text.includes("updated_at IS NOT DISTINCT FROM")) {
        if (failWrite) throw new Error("synthetic_write_failure");
        // Exact-text CAS (not Date#getTime): microseconds must match.
        if (String(row.updated_at_exact) !== String(params[2]).trim()) {
          return { rows: [], rowCount: 0 };
        }
        writes += 1;
        const nextExact = "2026-08-13 00:00:00.000000+00";
        row = {
          id: params[0],
          data: JSON.parse(params[1]),
          updated_at: new Date("2026-08-13T00:00:00.000Z"),
          updated_at_exact: nextExact,
        };
        if (corruptAfterWrite) {
          row.data = JSON.parse(JSON.stringify(row.data));
          row.data.siteContent.curriculum.lessonPlans[0].enrichmentDraft = { tip: "CORRUPTED" };
        }
        return {
          rows: [{ id: row.id, updated_at: row.updated_at, updated_at_exact: row.updated_at_exact }],
          rowCount: 1,
        };
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

    // Same lesson IDs/counts/users, different content → must refuse via fingerprint.
    const drifted = JSON.parse(JSON.stringify(store));
    drifted.siteContent.curriculum.lessonPlans[0].weeklyOverview = "drifted-after-backup";
    const mismatchedFingerprint = createMockClient({
      store: drifted,
      updatedAt,
      backup: backupRowFor(store), // backup of version A; source is version B
    });
    await assert.rejects(
      () => run(applyArgs, { client: mismatchedFingerprint, env }),
      /fingerprint does not match/,
    );
    assert.equal(mismatchedFingerprint.writeCount(), 0);
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
        row.updated_at_exact = "2026-08-12 23:59:00.000000+00";
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

  // Direct helper single-write proof (exact CAS token required)
  {
    const store = makeStore(8);
    const updatedAt = new Date("2026-08-12T23:50:00.000Z");
    const updatedAtExact = "2026-08-12 23:50:00.000000+00";
    const client = createMockClient({ store, updatedAt, updatedAtExact });
    const result = await applyControlledPostgresPrune({
      client,
      storeRecordId: "launch-store",
      sourceStore: store,
      sourceUpdatedAt: updatedAt,
      sourceUpdatedAtExact: updatedAtExact,
      sourceFingerprint: stableFingerprint(store),
      backupId,
      confirmPostgresPrune: true,
    });
    assert.equal(result.postgresWriteCount, 1);
  }

  // Reject apply when only a JS Date token is supplied (precision-unsafe).
  {
    const store = makeStore(8);
    const updatedAt = new Date("2026-08-12T23:50:00.000Z");
    const client = createMockClient({ store, updatedAt });
    await assert.rejects(
      () => applyControlledPostgresPrune({
        client,
        storeRecordId: "launch-store",
        sourceStore: store,
        sourceUpdatedAt: updatedAt,
        sourceFingerprint: stableFingerprint(store),
        backupId,
        confirmPostgresPrune: true,
      }),
      /updatedAtExact missing/,
    );
    assert.equal(client.writeCount(), 0);
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
