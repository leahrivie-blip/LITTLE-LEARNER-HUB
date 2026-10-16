#!/usr/bin/env node
/**
 * Hydration / reconnect scenarios (mock pg).
 *
 * Run: NODE_ENV=test USER_ACTIVITY_TOUCH_PERSIST=true node -r ./scripts/mock-pg-preload.js scripts/test-user-activity-touch-hydration.js
 */
const assert = require("node:assert/strict");
const { Pool } = require("pg");
const {
  createUserActivityTouchStore,
  applyActivityTouchBatchPostgres,
} = require("../server/user-activity-touch-store.js");

const mock = global.__LLH_MOCK_PG__;

async function main() {
  const pool = new Pool({ connectionString: "postgres://mock:mock@127.0.0.1:5432/mock" });
  mock.activityTouchRows.clear();
  mock.activityTouchBatches.clear();

  console.log("1) Cold boot hydration merges stale llh_store without downgrading newer table data");
  await applyActivityTouchBatchPostgres(
    pool,
    "op-hydrate-1",
    "Hydrate.User@example.com",
    "2026-10-16T10:00:00.000Z",
    { page_view: 5 },
  );
  const store = createUserActivityTouchStore({ debounceMs: 50, persistMinIntervalMs: 0 });
  store.configure({ pool, usingPostgres: true, forbidLocalFileFallback: true });
  await store.initTable();
  const blob = {
    users: {
      "Hydrate.User@example.com": {
        email: "Hydrate.User@example.com",
        lastSeenAt: "2020-01-01T00:00:00.000Z",
        featureUsage: { page_view: 2, lesson_open: 9 },
        plan: "pro",
      },
    },
  };
  await store.hydrateIntoStore(blob);
  assert.equal(blob.users["hydrate.user@example.com"].lastSeenAt, "2026-10-16T10:00:00.000Z");
  assert.equal(blob.users["hydrate.user@example.com"].featureUsage.page_view, 5);
  assert.equal(blob.users["hydrate.user@example.com"].featureUsage.lesson_open, 9);
  assert.equal(blob.users["hydrate.user@example.com"].plan, "pro");
  assert.equal(blob.users["Hydrate.User@example.com"], undefined, "duplicate email alias removed");

  console.log("2) Reconnect hydration preserves account fields and max featureUsage");
  mock.activityTouchRows.set("reconnect@example.com", {
    last_seen_at: "2026-10-16T11:00:00.000Z",
    feature_usage: { page_view: 3 },
  });
  const store2 = {
    users: {
      "reconnect@example.com": {
        email: "reconnect@example.com",
        lastSeenAt: "2026-10-16T12:00:00.000Z",
        featureUsage: { page_view: 10 },
        membershipId: "mem-1",
      },
    },
  };
  const touchStore = createUserActivityTouchStore({ debounceMs: 50, persistMinIntervalMs: 0 });
  touchStore.configure({ pool, usingPostgres: true, forbidLocalFileFallback: true });
  await touchStore.hydrateIntoStore(store2);
  assert.equal(store2.users["reconnect@example.com"].lastSeenAt, "2026-10-16T12:00:00.000Z");
  assert.equal(store2.users["reconnect@example.com"].featureUsage.page_view, 10);
  assert.equal(store2.users["reconnect@example.com"].membershipId, "mem-1");

  console.log("3) Pending writes during recovery flush after simulated disconnect");
  const recoveryStore = createUserActivityTouchStore({ debounceMs: 80, persistMinIntervalMs: 0 });
  recoveryStore.configure({ pool, usingPostgres: true, forbidLocalFileFallback: true });
  recoveryStore.scheduleActivityTouch({
    email: "recovery@example.com",
    lastSeenAt: "2026-10-16T13:00:00.000Z",
    eventName: "page_view",
  });
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(mock.activityTouchRows.get("recovery@example.com")?.feature_usage?.page_view, 1);

  console.log("\nAll user-activity-touch hydration tests passed.");
}

main().catch((error) => {
  console.error("FAIL:", error);
  process.exitCode = 1;
});
