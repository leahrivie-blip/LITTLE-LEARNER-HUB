#!/usr/bin/env node
/**
 * Real PostgreSQL integration for user activity touch batches.
 *
 * Requires an isolated test database (never production):
 *   LLH_USER_ACTIVITY_TOUCH_TEST_DATABASE_URL or TEST_DATABASE_URL
 *
 * Run: NODE_ENV=test node scripts/test-user-activity-touch-pg.js
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { Pool } = require("pg");
const {
  applyActivityTouchBatchPostgres,
  loadActivityTouchRowPostgres,
  TABLE_NAME,
  TABLE_BATCH_NAME,
} = require("../server/user-activity-touch-store.js");

function resolveTestDatabaseUrl() {
  const url = String(
    process.env.LLH_USER_ACTIVITY_TOUCH_TEST_DATABASE_URL
    || process.env.TEST_DATABASE_URL
    || "",
  ).trim();
  return url;
}

async function dropTouchTables(pool) {
  await pool.query(`DROP TABLE IF EXISTS ${TABLE_BATCH_NAME}`);
  await pool.query(`DROP TABLE IF EXISTS ${TABLE_NAME}`);
}

async function initTouchTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
      email TEXT PRIMARY KEY,
      last_seen_at TIMESTAMPTZ NOT NULL,
      feature_usage JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${TABLE_BATCH_NAME} (
      operation_id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      last_seen_at TIMESTAMPTZ NOT NULL,
      feature_usage JSONB NOT NULL DEFAULT '{}'::jsonb,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function main() {
  if (String(process.env.CI || "").toLowerCase() === "true" && !resolveTestDatabaseUrl()) {
    console.error("FAIL: CI requires TEST_DATABASE_URL for user-activity-touch Postgres tests");
    process.exitCode = 1;
    return;
  }
  const dbUrl = resolveTestDatabaseUrl();
  if (!dbUrl) {
    console.log(
      "SKIP user-activity-touch Postgres integration (set TEST_DATABASE_URL or LLH_USER_ACTIVITY_TOUCH_TEST_DATABASE_URL)",
    );
    return;
  }
  const prodUrl = String(process.env.PRODUCTION_DATABASE_URL || "").trim();
  if (prodUrl && prodUrl === dbUrl) {
    console.error("FAIL: TEST_DATABASE_URL must not equal PRODUCTION_DATABASE_URL");
    process.exitCode = 1;
    return;
  }
  if (/localhost|127\.0\.0\.1/i.test(dbUrl) === false && String(process.env.CI || "").toLowerCase() === "true") {
    console.error("FAIL: CI touch Postgres tests must use the local service container (localhost)");
    process.exitCode = 1;
    return;
  }

  const suffix = crypto.randomBytes(4).toString("hex");
  const email = `touch-pg-${suffix}@example.com`;
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: dbUrl.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
  });

  try {
    await initTouchTables(pool);
    const opA = `touch-op-a-${suffix}`;
    const opB = `touch-op-b-${suffix}`;

    console.log("1) Real upsert applies exactly once per operation_id");
    await applyActivityTouchBatchPostgres(
      pool,
      opA,
      email,
      "2026-10-16T14:00:00.000Z",
      { page_view: 1 },
    );
    const retry = await applyActivityTouchBatchPostgres(
      pool,
      opA,
      email,
      "2026-10-16T14:00:00.000Z",
      { page_view: 1 },
    );
    assert.equal(retry.alreadyApplied, true);
    let row = await loadActivityTouchRowPostgres(pool, email);
    assert.equal(row?.feature_usage?.page_view, 1);

    console.log("2) Concurrent writers with distinct operation_ids both apply");
    await Promise.all([
      applyActivityTouchBatchPostgres(pool, opB, email, "2026-10-16T14:01:00.000Z", { page_view: 1 }),
      applyActivityTouchBatchPostgres(
        pool,
        `touch-op-c-${suffix}`,
        email,
        "2026-10-16T14:01:01.000Z",
        { lesson_open: 1 },
      ),
    ]);
    row = await loadActivityTouchRowPostgres(pool, email);
    assert.equal(row?.feature_usage?.page_view, 2);
    assert.equal(row?.feature_usage?.lesson_open, 1);

    console.log("3) Rollback leaves batch ledger and row unchanged");
    const opRollback = `touch-op-rb-${suffix}`;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO ${TABLE_BATCH_NAME} (operation_id, email, last_seen_at, feature_usage)
         VALUES ($1, $2, $3::timestamptz, $4::jsonb)`,
        [opRollback, email, "2026-10-16T14:02:00.000Z", JSON.stringify({ page_view: 5 })],
      );
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
    const batchCheck = await pool.query(
      `SELECT 1 FROM ${TABLE_BATCH_NAME} WHERE operation_id = $1`,
      [opRollback],
    );
    assert.equal(batchCheck.rows.length, 0);
    row = await loadActivityTouchRowPostgres(pool, email);
    assert.equal(row?.feature_usage?.page_view, 2, "rollback must not change counters");

    console.log("\nAll user-activity-touch Postgres integration tests passed.");
  } finally {
    try {
      await pool.query(`DELETE FROM ${TABLE_BATCH_NAME} WHERE email = $1`, [email]);
      await pool.query(`DELETE FROM ${TABLE_NAME} WHERE email = $1`, [email]);
    } catch {
      /* ignore cleanup errors */
    }
    await pool.end();
  }
}

main().catch((error) => {
  console.error("FAIL:", error);
  process.exitCode = 1;
});
