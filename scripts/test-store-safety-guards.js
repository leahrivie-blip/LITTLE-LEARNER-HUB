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
  if (droppedHalf(prevCounts.curriculumLessonPlans, nextCounts.curriculumLessonPlans, 5)) reasons.push("curriculumLessonPlans");
  if (droppedHalf(prevCounts.curriculumActivities, nextCounts.curriculumActivities, 5)) reasons.push("curriculumActivities");
  return reasons;
}

const prev = { users: 52, messages: 1, foundingMembers: 13, curriculumLessonPlans: 101, curriculumActivities: 1500 };
assert.deepEqual(
  storeCountDropReasons({ users: 52, messages: 2, foundingMembers: 13, curriculumLessonPlans: 101, curriculumActivities: 1500 }, prev),
  [],
  "normal message growth must not trip the guard",
);
assert.deepEqual(
  storeCountDropReasons({ users: 53, messages: 1, foundingMembers: 13, curriculumLessonPlans: 101, curriculumActivities: 1500 }, prev),
  [],
  "normal user growth must not trip the guard",
);
assert.deepEqual(
  storeCountDropReasons({ users: 52, messages: 1, foundingMembers: 13, curriculumLessonPlans: 101, curriculumActivities: 1500 }, prev),
  [],
  "identical inventory must not trip the guard",
);
assert.deepEqual(
  storeCountDropReasons({ users: 2, messages: 0, foundingMembers: 0, curriculumLessonPlans: 0, curriculumActivities: 0 }, prev),
  ["users", "foundingMembers", "curriculumLessonPlans", "curriculumActivities"],
  "sparse overwrite-shaped drop must be blocked",
);
assert.deepEqual(
  storeCountDropReasons({ users: 52, messages: 1, foundingMembers: 13, curriculumLessonPlans: 101, curriculumActivities: 10 }, prev),
  ["curriculumActivities"],
  "an activities-only drop (lessonPlans intact) must be caught by the general Postgres-write safety net too — not just curriculumLessonPlans",
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
assert.match(serverJs, /createConfiguredPostgresPool/);
assert.match(serverJs, /postgresQueryWithTransientRetry/);
assert.match(serverJs, /isTransientPostgresConnectionError/);
assert.match(serverJs, /idleTimeoutMillis:\s*POSTGRES_IDLE_TIMEOUT_MS/);
assert.match(serverJs, /pool\.on\("error"/);
assert.match(serverJs, /curriculumLessonPlans/);
assert.match(serverJs, /curriculumActivities/);
assert.match(serverJs, /shouldPreserveExistingCurriculum/);
// The granular curriculum endpoints (lesson plan save, series save, resource save/archive/
// link/unlink) all funnel through the shared writeSiteCurriculum() helper — it must carry
// its own wipe guard, not rely solely on the bulk site-content save's inline check, since a
// stale/empty read or a merge bug in any one of those endpoints previously had zero
// protection against silently shrinking the live curriculum.
assert.match(
  serverJs,
  /function writeSiteCurriculum\(store, curriculum, \{ updatedAt, allowReplace = false \} = \{\}\) \{[\s\S]{0,800}shouldPreserveExistingCurriculum/,
);
assert.match(serverJs, /wipeBlocked/);
assert.match(renderYaml, /ALLOW_BOOT_SPARSE_STORE_RECOVERY[\s\S]*value: "false"/);
assert.match(renderYaml, /ALLOW_DESTRUCTIVE_STORE_WRITE[\s\S]*value: "false"/);
assert.match(appJs, /createAdminStoreBackup/);
assert.match(appJs, /downloadAdminStoreBackup/);
assert.match(appJs, /loadAdminStoreBackups/);
assert.match(appJs, /data-retry-curriculum-library/);

console.log("PASS  store safety guards");
console.log("\nAll store safety guard tests passed.");
