#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  loadInventory,
  buildMergePlan,
  assertNoProtectedRemovals,
  assertNoFullReplaceRequest,
  assertWriteModeAllowed,
  assertOwnerApproval,
  runPreflight,
  appendAuditLog,
  assertNoSecretValues,
  summarizePlan
} = require("./lib/render-env-safety");

function throwsCode(fn, code) {
  let err;
  try {
    fn();
  } catch (e) {
    err = e;
  }
  assert.ok(err, "expected throw");
  assert.equal(err.code, code);
}

function main() {
  const inventory = loadInventory();
  assert.ok(inventory.protectedKeys.includes("STRIPE_SECRET_KEY"));
  assert.ok(inventory.requiredForDeploy.includes("PRODUCTION_DATABASE_URL"));
  assert.ok(!inventory.requiredForDeploy.includes("PORT"), "PORT is platform-injected");

  const current = [
    { key: "SITE_URL", value: "https://example.com" },
    { key: "STRIPE_SECRET_KEY", value: "secret" },
    { key: "RESEND_API_KEY", value: "secret2" },
    { key: "OPENAI_API_KEY", value: "secret3" }
  ];

  // Merge adds/updates without removals.
  const plan = buildMergePlan({
    currentEnvVars: current,
    updates: { SITE_URL: "https://example.com", NEW_FLAG: "1" },
    removals: [],
    inventory
  });
  assert.deepEqual(plan.addedKeys, ["NEW_FLAG"]);
  assert.deepEqual(plan.removedKeys, []);
  assert.equal(plan.nextCount, 5);

  // Protected removal blocked via removals list.
  throwsCode(
    () =>
      buildMergePlan({
        currentEnvVars: current,
        updates: {},
        removals: ["STRIPE_SECRET_KEY"],
        inventory
      }),
    "protected_key_removal_blocked"
  );

  // Array-form plan + assertNoProtectedRemovals.
  const wiped = [{ key: "SITE_URL", value: "https://example.com" }];
  throwsCode(
    () => assertNoProtectedRemovals(current, wiped, inventory.protectedKeys),
    "protected_key_removal_blocked"
  );
  throwsCode(() => assertNoProtectedRemovals(current, [], inventory.protectedKeys), "full_env_replace_blocked");

  // Full replace flag blocked.
  throwsCode(
    () =>
      assertNoFullReplaceRequest({
        method: "PUT",
        pathName: "/services/x/env-vars",
        replaceFlag: true
      }),
    "full_env_replace_blocked"
  );

  // Write mode default blocked.
  throwsCode(() => assertWriteModeAllowed({}), "write_mode_blocked");
  throwsCode(() => assertWriteModeAllowed({ ENV_WRITE_MODE: "read-only" }), "write_mode_blocked");
  assert.equal(assertWriteModeAllowed({ ENV_WRITE_MODE: "merge-with-owner-approval" }), true);

  // Owner approval required.
  throwsCode(() => assertOwnerApproval({ flagPresent: false }), "owner_approval_required");
  assert.equal(
    assertOwnerApproval({
      flagPresent: true,
      token: "tok",
      expectedToken: "tok"
    }),
    true
  );
  throwsCode(
    () =>
      assertOwnerApproval({
        flagPresent: true,
        token: "wrong",
        expectedToken: "tok"
      }),
    "owner_approval_required"
  );

  // Preflight.
  const pfFail = runPreflight(["SITE_URL"], inventory);
  assert.equal(pfFail.ok, false);
  assert.ok(pfFail.missingRequired.includes("STRIPE_SECRET_KEY"));
  const pfOk = runPreflight(inventory.requiredForDeploy, inventory);
  assert.equal(pfOk.ok, true);
  assert.equal(pfOk.blockDeploy, false);

  // Secret value guard.
  throwsCode(() => assertNoSecretValues({ leak: "sk_live_abc123" }), "secret_value_blocked");

  // Audit log never stores secrets; names only.
  const tmp = path.join(os.tmpdir(), `llh-audit-${Date.now()}.jsonl`);
  const entry = appendAuditLog(
    {
      action: "test",
      actor: "unit-test",
      serviceId: "srv-test",
      keysChanged: ["STRIPE_SECRET_KEY"],
      preflightPassed: true
    },
    tmp
  );
  assert.deepEqual(entry.keysChanged, ["STRIPE_SECRET_KEY"]);
  const line = fs.readFileSync(tmp, "utf8");
  assert.ok(!/sk_live_/.test(line));
  fs.unlinkSync(tmp);

  const summary = summarizePlan(plan);
  assert.equal(summary.removesAnyKeys, false);
  assert.ok(summary.addedKeys.includes("NEW_FLAG"));

  // Partial-list PUT bug: proposing only one key must fail protected-removal checks.
  throwsCode(
    () =>
      assertNoProtectedRemovals(
        current,
        [{ key: "SITE_URL", value: "https://x.com" }],
        inventory.protectedKeys
      ),
    "protected_key_removal_blocked"
  );

  console.log("test-render-env-safety: ok");
}

main();
