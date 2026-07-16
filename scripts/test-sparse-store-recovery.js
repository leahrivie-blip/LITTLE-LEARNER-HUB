#!/usr/bin/env node
/**
 * Sparse-store recovery markers + founding rebuild helpers.
 * Run: NODE_ENV=test node scripts/test-sparse-store-recovery.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const serverJs = fs.readFileSync(path.join(ROOT, "server", "index.js"), "utf8");
const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");

assert.match(serverJs, /recoverSparseStoreFromStripeIfNeeded/);
assert.match(serverJs, /rebuildFoundingMembersFromUsers/);
assert.match(serverJs, /\/api\/admin\/store-health/);
assert.match(serverJs, /\/api\/admin\/recover-sparse-store/);
assert.match(serverJs, /membershipUpdatesFromStripeSubscription/);
assert.match(serverJs, /sparseStripeBackfillAt/);
assert.match(serverJs, /boot recovery/);
assert.match(appJs, /runAdminSparseStoreRecovery/);
assert.match(appJs, /Recover users from Stripe now/);
assert.match(appJs, /loadAdminStoreHealth/);
console.log("PASS  sparse-store recovery markers present");

// Lightweight unit: founding rebuild logic mirrored from the server helper shape.
function rebuildFoundingMembersFromUsers(store) {
  const users = store.users || {};
  const next = [];
  Object.values(users).forEach((user) => {
    const email = String(user?.email || "").trim().toLowerCase();
    if (!email) return;
    const isFounding = Boolean(
      user.foundingMemberActive
      || user.foundingMemberHistorical
      || user.foundingMember
      || user.foundingMemberNumber
      || String(user.plan || "") === "Founding",
    );
    if (isFounding && !next.includes(email)) next.push(email);
  });
  (store.foundingMembers || []).forEach((email) => {
    const clean = String(email || "").trim().toLowerCase();
    if (clean && !next.includes(clean)) next.push(clean);
  });
  store.foundingMembers = next;
  return next.length;
}

const store = {
  users: {
    "a@example.com": { email: "a@example.com", plan: "Founding", foundingMemberActive: true },
    "b@example.com": { email: "b@example.com", plan: "Pro" },
    "c@example.com": { email: "c@example.com", foundingMemberHistorical: true },
  },
  foundingMembers: ["legacy@example.com"],
};
assert.equal(rebuildFoundingMembersFromUsers(store), 3);
assert.deepEqual(store.foundingMembers.sort(), ["a@example.com", "c@example.com", "legacy@example.com"].sort());
console.log("PASS  founding members rebuild");

console.log("\nAll sparse-store recovery tests passed.");
