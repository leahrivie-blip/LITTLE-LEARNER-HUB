#!/usr/bin/env node
/**
 * Admin Users list must not show Free accounts as paid "Active".
 * Account column = Enabled/Disabled. Billing = membership status.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const adminWorkspace = fs.readFileSync(path.join(root, "admin-workspace.js"), "utf8");
const appJs = fs.readFileSync(path.join(root, "app.js"), "utf8");

assert.match(adminWorkspace, /<th>Account<\/th>/);
assert.doesNotMatch(adminWorkspace, /<th>Account status<\/th>/);
assert.match(adminWorkspace, /adminAccountEnabledLabel/);
assert.match(adminWorkspace, /adminMembershipStatusLabel\(account\)/);
assert.match(adminWorkspace, /No paid subscription/);
assert.doesNotMatch(
  adminWorkspace,
  /accountStatus \|\| "Active"\)/
);

assert.match(appJs, /function adminAccountEnabledLabel\(/);
assert.match(appJs, /return "Enabled"/);
assert.match(appJs, /Account \(login\)/);
assert.match(appJs, /Never label never-subscribed Free accounts as "Canceled and Ended"/);

// Smoke the helper logic in isolation
function adminAccountEnabledLabel(account) {
  const raw = String(account?.accountStatus || "Active").trim().toLowerCase();
  if (raw === "disabled" || account?.disabled === true) return "Disabled";
  return "Enabled";
}
assert.equal(adminAccountEnabledLabel({ accountStatus: "Active" }), "Enabled");
assert.equal(adminAccountEnabledLabel({}), "Enabled");
assert.equal(adminAccountEnabledLabel({ accountStatus: "Disabled" }), "Disabled");
assert.equal(adminAccountEnabledLabel({ disabled: true }), "Disabled");

console.log("PASS admin user status labels");
