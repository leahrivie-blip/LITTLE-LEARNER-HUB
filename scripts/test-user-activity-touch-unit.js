#!/usr/bin/env node
/**
 * Unit tests for user-activity-touch-store SQL/idempotency (mock pg pool).
 *
 * Run: NODE_ENV=test node -r ./scripts/mock-pg-preload.js scripts/test-user-activity-touch-unit.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  createUserActivityTouchStore,
  upsertActivityTouchPostgres,
  computeRemainingIncrements,
} = require("../server/user-activity-touch-store.js");

const mock = global.__LLH_MOCK_PG__;
const { Pool } = require("pg");

async function main() {
  const pool = new Pool({ connectionString: "postgres://mock:mock@127.0.0.1:5432/mock" });
  mock.activityTouchRows.clear();
  mock.activityTouchUpserts = 0;

  console.log("1) First event increments feature_usage to exactly 1");
  await upsertActivityTouchPostgres(
    pool,
    "unit-first@example.com",
    "2026-10-16T12:00:00.000Z",
    { page_view: 1 },
  );
  assert.equal(mock.activityTouchRows.get("unit-first@example.com")?.feature_usage?.page_view, 1);

  console.log("2) Existing row increments by exactly 1");
  await upsertActivityTouchPostgres(
    pool,
    "unit-first@example.com",
    "2026-10-16T12:01:00.000Z",
    { page_view: 1 },
  );
  assert.equal(mock.activityTouchRows.get("unit-first@example.com")?.feature_usage?.page_view, 2);

  console.log("3) Debounced flush applies pending batch once");
  const touchPath = path.join(__dirname, `.tmp-touch-unit-${Date.now()}.json`);
  const store = createUserActivityTouchStore({
    localFilePath: touchPath,
    debounceMs: 80,
    persistMinIntervalMs: 0,
  });
  store.configure({ pool, usingPostgres: true, forbidLocalFileFallback: true });
  store.scheduleActivityTouch({
    email: "retry@example.com",
    lastSeenAt: "2026-10-16T12:02:00.000Z",
    eventName: "page_view",
  });
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(mock.activityTouchRows.get("retry@example.com")?.feature_usage?.page_view, 1);
  assert.equal(fs.existsSync(touchPath), false, "production-style config must not create local touch file");

  console.log("4) Retry idempotency — committed write with lost ack does not double-count");
  assert.deepEqual(
    computeRemainingIncrements({ page_view: 2 }, { page_view: 5 }, { page_view: 3 }),
    {},
  );
  assert.deepEqual(
    computeRemainingIncrements({}, {}, { page_view: 1 }),
    { page_view: 1 },
  );

  console.log("5) Per-user rate limit isolation");
  const store2 = createUserActivityTouchStore({
    debounceMs: 200,
    persistMinIntervalMs: 5000,
  });
  store2.configure({ pool, usingPostgres: true, forbidLocalFileFallback: true });
  store2.scheduleActivityTouch({
    email: "user-a@example.com",
    lastSeenAt: "2026-10-16T12:03:00.000Z",
    eventName: "page_view",
  });
  store2.scheduleActivityTouch({
    email: "user-b@example.com",
    lastSeenAt: "2026-10-16T12:03:01.000Z",
    eventName: "page_view",
  });
  await new Promise((r) => setTimeout(r, 280));
  assert.ok(mock.activityTouchRows.get("user-a@example.com"));
  assert.ok(mock.activityTouchRows.get("user-b@example.com"));

  console.log("\nAll user-activity-touch unit tests passed.");
}

main().catch((error) => {
  console.error("FAIL:", error);
  process.exitCode = 1;
});
