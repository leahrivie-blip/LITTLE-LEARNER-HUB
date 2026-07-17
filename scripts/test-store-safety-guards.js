#!/usr/bin/env node
/**
 * Store safety regression: inventory-drop guard, boot recovery gate, backup APIs.
 * Run: NODE_ENV=test node scripts/test-store-safety-guards.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const serverJs = fs.readFileSync(path.join(root, "server/index.js"), "utf8");
const appJs = fs.readFileSync(path.join(root, "app.js"), "utf8");
const renderYaml = fs.readFileSync(path.join(root, "render.yaml"), "utf8");

function storeCountDropReasons(nextCounts, prevCounts) {
  if (!prevCounts || !nextCounts) return [];
  const reasons = [];
  const droppedHalf = (prev, next, minPrev) => prev >= minPrev && next < Math.floor(prev * 0.5);
  if (droppedHalf(prevCounts.users, nextCounts.users, 10)) reasons.push("users");
  if (droppedHalf(prevCounts.messages, nextCounts.messages, 10)) reasons.push("messages");
  if (droppedHalf(prevCounts.foundingMembers, nextCounts.foundingMembers, 5)) reasons.push("foundingMembers");
  return reasons;
}

const prev = { users: 52, messages: 1, foundingMembers: 13 };
assert.deepEqual(
  storeCountDropReasons({ users: 52, messages: 2, foundingMembers: 13 }, prev),
  [],
  "normal message growth must not trip the guard",
);
assert.deepEqual(
  storeCountDropReasons({ users: 53, messages: 1, foundingMembers: 13 }, prev),
  [],
  "normal user growth must not trip the guard",
);
assert.deepEqual(
  storeCountDropReasons({ users: 52, messages: 1, foundingMembers: 13 }, prev),
  [],
  "identical inventory must not trip the guard",
);
assert.deepEqual(
  storeCountDropReasons({ users: 2, messages: 0, foundingMembers: 0 }, prev),
  ["users", "foundingMembers"],
  "sparse overwrite-shaped drop must be blocked",
);

assert.match(serverJs, /assertSafePostgresStoreReplacement/);
assert.match(serverJs, /store_count_drop_blocked/);
assert.match(serverJs, /ALLOW_DESTRUCTIVE_STORE_WRITE/);
assert.match(serverJs, /ALLOW_BOOT_SPARSE_STORE_RECOVERY/);
assert.match(serverJs, /boot check skipped/);
assert.match(serverJs, /NEVER push a sparse local fallback over Postgres/);
assert.match(serverJs, /llh_store_backups/);
assert.match(serverJs, /startStoreBackupScheduler/);
assert.match(serverJs, /\/api\/admin\/store-backups/);
assert.match(serverJs, /\/api\/admin\/store-export/);
assert.match(serverJs, /RECOVER_SPARSE_STORE/);
assert.match(serverJs, /RECOVER_FIREBASE_PROFILES/);
assert.match(serverJs, /maybeAlertPostgresDisconnect/);
assert.match(serverJs, /maybeAlertStoreSafety/);
assert.match(renderYaml, /ALLOW_BOOT_SPARSE_STORE_RECOVERY[\s\S]*value: "false"/);
assert.match(renderYaml, /ALLOW_DESTRUCTIVE_STORE_WRITE[\s\S]*value: "false"/);
assert.match(appJs, /createAdminStoreBackup/);
assert.match(appJs, /downloadAdminStoreBackup/);
assert.match(appJs, /loadAdminStoreBackups/);

console.log("PASS  store safety guards");
console.log("\nAll store safety guard tests passed.");
