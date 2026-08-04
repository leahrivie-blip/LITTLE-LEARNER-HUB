/**
 * Production Render environment-variable safety library.
 *
 * HARD RULES:
 * - Never log or return secret values in audit/public helpers.
 * - Never perform a blind full-list replace that drops unknown keys.
 * - Protected keys cannot be removed.
 * - Writes require ENV_WRITE_MODE=merge-with-owner-approval + explicit owner approval.
 * - Coding agents are read-only by default.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..", "..");
const INVENTORY_PATH = path.join(ROOT, "docs", "production-env", "REQUIRED_ENV_INVENTORY.json");
const AUDIT_LOG_PATH = path.join(ROOT, "docs", "production-env", "audit-log.jsonl");
const RENDER_API_BASE = "https://api.render.com/v1";

const SECRET_VALUE_PATTERN =
  /sk_live_|sk_test_|rk_live_|rk_test_|pk_live_|pk_test_|whsec_|re_[A-Za-z0-9]{10,}|-----BEGIN|postgres(?:ql)?:\/\/[^\s"]+/i;

function loadInventory(inventoryPath = INVENTORY_PATH) {
  const raw = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
  if (!raw || typeof raw !== "object") throw new Error("Invalid env inventory.");
  if (!Array.isArray(raw.protectedKeys) || !raw.protectedKeys.length) {
    throw new Error("Inventory protectedKeys must be a non-empty array of key names.");
  }
  if (!Array.isArray(raw.requiredForDeploy) || !raw.requiredForDeploy.length) {
    throw new Error("Inventory requiredForDeploy must be a non-empty array of key names.");
  }
  const allKnownKeys = summarizeKeys([
    ...(raw.protectedKeys || []),
    ...(raw.requiredForDeploy || []),
    ...(raw.recommended || []),
    ...(raw.nonSecretBlueprintSafe || []),
    ...Object.values(raw.categories || {}).flat()
  ]);
  return {
    ...raw,
    requiredKeys: raw.requiredForDeploy,
    recommendedKeys: raw.recommended || [],
    allKnownKeys
  };
}

function redactValue() {
  return "[REDACTED]";
}

function summarizeKeys(keys = []) {
  return [...new Set((keys || []).filter(Boolean))].sort();
}

function keyNames(envVars = []) {
  return summarizeKeys(
    (envVars || []).map((row) => row?.key || row?.envVar?.key).filter(Boolean)
  );
}

function normalizeEnvList(envVars = []) {
  return (envVars || [])
    .map((row) => {
      const key = row?.key || row?.envVar?.key;
      if (!key) return null;
      const value = row?.value != null ? row.value : row?.envVar?.value;
      return { key, value: value == null ? "" : String(value) };
    })
    .filter(Boolean);
}

function redactEnvListForLog(envVars = []) {
  return normalizeEnvList(envVars).map((row) => ({ key: row.key, value: redactValue() }));
}

function assertNoSecretValues(payload) {
  const serialized = typeof payload === "string" ? payload : JSON.stringify(payload);
  if (SECRET_VALUE_PATTERN.test(serialized)) {
    const err = new Error("Refusing to print or log content that appears to contain a secret value.");
    err.code = "secret_value_blocked";
    throw err;
  }
  return true;
}

function assertWriteModeAllowed(env = process.env) {
  const mode = String(env.ENV_WRITE_MODE || "read-only").trim().toLowerCase();
  if (mode === "read-only" || mode === "" || mode === "0" || mode === "false") {
    const err = new Error(
      "Production env writes are blocked (ENV_WRITE_MODE is read-only by default for coding agents). "
        + "Set ENV_WRITE_MODE=merge-with-owner-approval only for an explicit owner-approved merge write."
    );
    err.code = "write_mode_blocked";
    throw err;
  }
  if (mode !== "merge-with-owner-approval") {
    const err = new Error(
      `Unsupported ENV_WRITE_MODE="${mode}". Allowed: read-only | merge-with-owner-approval`
    );
    err.code = "write_mode_blocked";
    throw err;
  }
  return true;
}

function assertOwnerApproval({
  flagPresent = false,
  token = "",
  expectedToken = "",
  // legacy aliases used by older call sites
  ownerApproved = false,
  acknowledgeProductionWrite = false,
  approvalNote = ""
} = {}) {
  const approved = Boolean(flagPresent || (ownerApproved && acknowledgeProductionWrite));
  if (!approved) {
    const err = new Error(
      "Production env writes are blocked. Coding agents are read-only by default. "
        + "Require --i-have-owner-approval and a matching OWNER_APPROVAL_TOKEN after a fresh read + names-only diff."
    );
    err.code = "owner_approval_required";
    throw err;
  }

  const expected = String(expectedToken || "").trim();
  const provided = String(token || "").trim();
  if (expected) {
    if (!provided || provided !== expected) {
      const err = new Error("Owner approval token mismatch or missing.");
      err.code = "owner_approval_required";
      throw err;
    }
  } else if (!(ownerApproved && acknowledgeProductionWrite && String(approvalNote || "").trim())) {
    // If no shared token is configured, require the explicit dual flags + note form.
    if (!String(approvalNote || "").trim()) {
      const err = new Error(
        "Production env writes require OWNER_APPROVAL_TOKEN (preferred) or --approval-note with dual acknowledgement flags."
      );
      err.code = "owner_approval_required";
      throw err;
    }
  }
  return true;
}

function assertNoFullReplaceRequest({ method, replaceFlag, pathName = "" } = {}) {
  const m = String(method || "").toUpperCase();
  if (m === "PUT" && /env-vars/i.test(String(pathName || "")) && replaceFlag === true) {
    const err = new Error(
      "Forbidden: full production env-var list replace (replace:true / blind PUT) is blocked."
    );
    err.code = "full_env_replace_blocked";
    throw err;
  }
  if (replaceFlag === true) {
    const err = new Error("Forbidden: replace:true is blocked for production environment variables.");
    err.code = "full_env_replace_blocked";
    throw err;
  }
  return true;
}

/**
 * Ensure proposed env list does not remove any protected keys that currently exist,
 * and refuses an empty proposed list (wipe).
 */
function assertNoProtectedRemovals(currentEnvVars = [], proposedEnvVars = [], protectedKeys = []) {
  const currentKeys = keyNames(currentEnvVars);
  const proposedKeys = new Set(keyNames(proposedEnvVars));
  if (!proposedKeys.size) {
    const err = new Error("Refusing empty proposed environment (would wipe all variables).");
    err.code = "full_env_replace_blocked";
    throw err;
  }
  const protectedSet = new Set(protectedKeys || []);
  const blocked = currentKeys.filter((key) => protectedSet.has(key) && !proposedKeys.has(key));
  if (blocked.length) {
    const err = new Error(`Refusing to remove protected production env keys: ${blocked.join(", ")}`);
    err.code = "protected_key_removal_blocked";
    err.blockedRemovals = blocked;
    throw err;
  }
  return true;
}

/**
 * Build a merge plan from current env + updates/removals.
 * Object form: buildMergePlan({ currentEnvVars, updates, removals, inventory })
 * Array form:  buildMergePlan(currentList, proposedList) — used by CLI scripts.
 */
function buildMergePlan(arg1, arg2, arg3) {
  if (Array.isArray(arg1) && Array.isArray(arg2)) {
    const currentEnvVars = normalizeEnvList(arg1);
    const proposedEnvVars = normalizeEnvList(arg2);
    const currentKeys = keyNames(currentEnvVars);
    const proposedKeys = keyNames(proposedEnvVars);
    const currentByKey = Object.create(null);
    for (const row of currentEnvVars) currentByKey[row.key] = row.value;
    const proposedByKey = Object.create(null);
    for (const row of proposedEnvVars) proposedByKey[row.key] = row.value;

    const removedKeys = currentKeys.filter((k) => !proposedKeys.includes(k));
    const addedKeys = proposedKeys.filter((k) => !currentKeys.includes(k));
    const updatedKeys = proposedKeys.filter(
      (k) => currentKeys.includes(k) && String(currentByKey[k] ?? "") !== String(proposedByKey[k] ?? "")
    );
    const unchangedKeys = proposedKeys.filter(
      (k) => currentKeys.includes(k) && String(currentByKey[k] ?? "") === String(proposedByKey[k] ?? "")
    );

    return {
      ok: true,
      currentCount: currentKeys.length,
      nextCount: proposedKeys.length,
      addedKeys,
      updatedKeys,
      changedKeys: updatedKeys,
      removedKeys,
      unchangedKeys,
      nextKeys: proposedKeys,
      nextEnvVars: proposedEnvVars,
      diff: {
        added: addedKeys,
        changed: updatedKeys,
        removed: removedKeys,
        unchangedCount: unchangedKeys.length
      }
    };
  }

  const {
    currentEnvVars = [],
    updates = {},
    removals = [],
    inventory
  } = arg1 && typeof arg1 === "object" ? arg1 : {};
  const inv = inventory || loadInventory();
  const protectedSet = new Set(inv.protectedKeys || []);
  const currentKeys = keyNames(currentEnvVars);
  const currentByKey = Object.create(null);
  for (const row of normalizeEnvList(currentEnvVars)) {
    currentByKey[row.key] = row.value;
  }

  const updateKeys = summarizeKeys(Object.keys(updates || {}));
  const removalKeys = summarizeKeys(removals || []);
  const blockedRemovals = removalKeys.filter((key) => protectedSet.has(key));
  if (blockedRemovals.length) {
    const err = new Error(
      `Refusing to remove protected production env keys: ${blockedRemovals.join(", ")}`
    );
    err.code = "protected_key_removal_blocked";
    err.blockedRemovals = blockedRemovals;
    throw err;
  }

  const nextByKey = { ...currentByKey };
  for (const [key, value] of Object.entries(updates || {})) {
    if (!key) continue;
    nextByKey[key] = value;
  }
  for (const key of removalKeys) delete nextByKey[key];

  const nextKeys = summarizeKeys(Object.keys(nextByKey));
  const removedKeys = currentKeys.filter((key) => !nextKeys.includes(key));
  const addedKeys = nextKeys.filter((key) => !currentKeys.includes(key));
  const changedKeys = updateKeys.filter(
    (key) => currentKeys.includes(key) && String(currentByKey[key] ?? "") !== String(updates[key] ?? "")
  );

  const implicitRemovals = removedKeys.filter((key) => !removalKeys.includes(key));
  if (implicitRemovals.length) {
    const err = new Error(
      `Merge plan would implicitly drop keys (full-replace bug): ${implicitRemovals.join(", ")}`
    );
    err.code = "implicit_key_removal_blocked";
    err.implicitRemovals = implicitRemovals;
    throw err;
  }

  const protectedMissingAfter = [...protectedSet].filter(
    (key) => currentKeys.includes(key) && !nextKeys.includes(key)
  );
  if (protectedMissingAfter.length) {
    const err = new Error(`Merge plan would drop protected keys: ${protectedMissingAfter.join(", ")}`);
    err.code = "protected_key_removal_blocked";
    err.blockedRemovals = protectedMissingAfter;
    throw err;
  }

  return {
    ok: true,
    currentCount: currentKeys.length,
    nextCount: nextKeys.length,
    addedKeys,
    changedKeys,
    updatedKeys: changedKeys,
    removedKeys,
    updateKeys,
    unchangedKeys: currentKeys.filter((k) => nextKeys.includes(k) && !changedKeys.includes(k)),
    nextKeys,
    nextEnvVars: nextKeys.map((key) => ({ key, value: nextByKey[key] })),
    diff: {
      added: addedKeys,
      changed: changedKeys,
      removed: removedKeys,
      unchangedCount: currentKeys.filter((k) => nextKeys.includes(k) && !changedKeys.includes(k)).length
    }
  };
}

function summarizePlan(plan) {
  return {
    currentCount: plan.currentCount,
    nextCount: plan.nextCount,
    addedKeys: plan.addedKeys || [],
    updatedKeys: plan.updatedKeys || plan.changedKeys || [],
    removedKeys: plan.removedKeys || [],
    unchangedCount: plan.unchangedKeys?.length ?? plan.diff?.unchangedCount ?? 0,
    removesAnyKeys: Boolean((plan.removedKeys || []).length)
  };
}

function publicDiff(plan) {
  return summarizePlan(plan);
}

function runPreflight(presentKeys = [], inventory = loadInventory()) {
  const present = new Set(presentKeys);
  const missingRequired = (inventory.requiredForDeploy || inventory.requiredKeys || []).filter(
    (k) => !present.has(k)
  );
  const missingProtected = (inventory.protectedKeys || []).filter((k) => !present.has(k));
  const missingRecommended = (inventory.recommended || inventory.recommendedKeys || []).filter(
    (k) => !present.has(k)
  );
  return {
    ok: missingRequired.length === 0,
    missingRequired,
    missingProtected,
    missingRecommended,
    presentCount: present.size,
    requiredCount: (inventory.requiredForDeploy || inventory.requiredKeys || []).length,
    // Deploy must not proceed if required keys are missing. Protected-but-optional
    // gaps are reported but do not fail ok (e.g. META_CAPI deferred by owner).
    blockDeploy: missingRequired.length > 0
  };
}

function auditPreflight(presentKeys = [], inventory = loadInventory()) {
  return runPreflight(presentKeys, inventory);
}

function appendAuditLog(entry, auditPath = AUDIT_LOG_PATH) {
  const safe = {
    at: new Date().toISOString(),
    actor: String(entry.actor || "unknown").slice(0, 120),
    action: String(entry.action || "unknown").slice(0, 80),
    serviceId: String(entry.serviceId || "").slice(0, 80) || undefined,
    approvalNote: String(entry.approvalNote || "").trim().slice(0, 240) || undefined,
    preflightPassed:
      entry.preflightPassed == null ? undefined : Boolean(entry.preflightPassed),
    ok: entry.ok == null ? undefined : Boolean(entry.ok),
    keysAdded: summarizeKeys(entry.keysAdded || entry.addedKeys || []),
    keysChanged: summarizeKeys(entry.keysChanged || entry.updatedKeys || []),
    keysRemoved: summarizeKeys(entry.keysRemoved || entry.removedKeys || []),
    missingRequired: summarizeKeys(entry.missingRequired || []),
    missingProtected: summarizeKeys(entry.missingProtected || []),
    hardFailures: summarizeKeys(entry.hardFailures || []),
    presentCount: entry.presentCount,
    afterKeyCount: entry.afterKeyCount,
    result: String(entry.result || "").trim().slice(0, 80) || undefined,
    reason: String(entry.reason || "").trim().slice(0, 120) || undefined,
    error: String(entry.error || "").trim().slice(0, 240) || undefined,
    requestId: entry.requestId || crypto.randomBytes(6).toString("hex")
  };
  // Drop undefined / empty arrays for cleaner logs (keep boolean false).
  for (const [k, v] of Object.entries(safe)) {
    if (v === undefined) delete safe[k];
    else if (Array.isArray(v) && v.length === 0 && !["keysAdded", "keysChanged", "keysRemoved"].includes(k)) {
      // keep empty key-change arrays only when action implies a plan; otherwise drop noise
      if (!["propose", "apply", "apply-dry-run"].includes(safe.action)) delete safe[k];
    }
  }
  const serialized = JSON.stringify(safe);
  if (SECRET_VALUE_PATTERN.test(serialized)) {
    throw new Error("Refusing to write audit log entry that appears to contain a secret value.");
  }
  fs.mkdirSync(path.dirname(auditPath), { recursive: true });
  fs.appendFileSync(auditPath, `${serialized}\n`, "utf8");
  return safe;
}

async function renderApi({ apiKey, method, pathname, body }) {
  assertNoFullReplaceRequest({
    method,
    replaceFlag: body && body.replace === true,
    pathName: pathname
  });
  const res = await fetch(`${RENDER_API_BASE}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...(body != null ? { "Content-Type": "application/json" } : {})
    },
    body: body != null ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const err = new Error(`Render API ${method} ${pathname} failed (${res.status})`);
    err.status = res.status;
    err.code = "render_api_error";
    throw err;
  }
  return json;
}

/**
 * Fetch ALL service env vars (Render paginates; default page size is 20).
 * Incomplete reads are dangerous — a merge PUT built from a partial page would wipe the rest.
 */
async function listServiceEnvVars({ apiKey, serviceId, pageLimit = 100 } = {}) {
  if (!apiKey) throw new Error("apiKey is required");
  if (!serviceId) throw new Error("serviceId is required");
  const limit = Math.min(Math.max(Number(pageLimit) || 100, 1), 100);
  const collected = [];
  let cursor = "";
  for (let page = 0; page < 50; page += 1) {
    const qs = new URLSearchParams({ limit: String(limit) });
    if (cursor) qs.set("cursor", cursor);
    const json = await renderApi({
      apiKey,
      method: "GET",
      pathname: `/services/${serviceId}/env-vars?${qs.toString()}`
    });
    const rows = Array.isArray(json) ? json : [];
    if (!rows.length) break;
    collected.push(...rows);
    const lastCursor = rows[rows.length - 1]?.cursor;
    if (!lastCursor || rows.length < limit) break;
    cursor = lastCursor;
  }
  const normalized = normalizeEnvList(collected);
  // Guard: if pagination somehow truncated, refuse to treat this as a complete read.
  if (!normalized.length) {
    throw new Error("Render returned zero env vars; refusing to treat as a complete read.");
  }
  return normalized;
}

/**
 * Merge-only write: PUT is allowed ONLY with the complete merged key set from a
 * freshly read current environment plus explicit updates. Callers must pass the
 * fresh current list; this function refuses if proposed would drop protected keys
 * or shrink the set without explicit removals already validated upstream.
 */
async function putServiceEnvVarsMergeOnly({
  apiKey,
  serviceId,
  currentEnvList,
  proposedEnvList,
  protectedKeys
}) {
  assertWriteModeAllowed(process.env);
  assertNoProtectedRemovals(currentEnvList, proposedEnvList, protectedKeys);

  const plan = buildMergePlan(currentEnvList, proposedEnvList);
  // Hard block: any removal of currently present keys must have been intentional
  // and already validated by caller; still refuse protected removals above.
  // Additionally refuse if proposed count is less than current without removals listed in plan
  // (belt and suspenders against partial PUT).
  if (plan.nextCount < plan.currentCount && plan.removedKeys.length === 0) {
    const err = new Error("Refusing PUT that would shrink env without explicit removals.");
    err.code = "full_env_replace_blocked";
    throw err;
  }

  // Re-read immediately before write to reduce race window.
  const fresh = await listServiceEnvVars({ apiKey, serviceId });
  const freshKeys = new Set(keyNames(fresh));
  const assumedKeys = new Set(keyNames(currentEnvList));
  const disappeared = [...assumedKeys].filter((k) => !freshKeys.has(k));
  const appeared = [...freshKeys].filter((k) => !assumedKeys.has(k));
  if (disappeared.length || appeared.length) {
    const err = new Error(
      "Aborting write: environment changed since fresh read. Re-run propose/apply. "
        + `appeared=${appeared.join(",") || "none"} disappeared=${disappeared.join(",") || "none"}`
    );
    err.code = "stale_env_read";
    throw err;
  }

  // Merge onto the absolute latest values so we never drop keys.
  const mergedMap = new Map(fresh.map((row) => [row.key, row.value]));
  for (const row of normalizeEnvList(proposedEnvList)) {
    mergedMap.set(row.key, row.value);
  }
  // Ensure we never drop a key that exists in fresh unless it was in plan.removedKeys
  // and not protected (already checked).
  const removedSet = new Set(plan.removedKeys);
  for (const key of freshKeys) {
    if (removedSet.has(key)) mergedMap.delete(key);
    else if (!mergedMap.has(key)) mergedMap.set(key, fresh.find((r) => r.key === key).value);
  }

  const body = [...mergedMap.entries()].map(([key, value]) => ({ key, value }));
  if (body.length < fresh.length && !plan.removedKeys.length) {
    const err = new Error("Refusing PUT body smaller than current env (full-replace guard).");
    err.code = "full_env_replace_blocked";
    throw err;
  }

  assertNoProtectedRemovals(fresh, body, protectedKeys);
  assertNoFullReplaceRequest({
    method: "PUT",
    replaceFlag: false,
    pathName: `/services/${serviceId}/env-vars`
  });

  const json = await renderApi({
    apiKey,
    method: "PUT",
    pathname: `/services/${serviceId}/env-vars`,
    body
  });
  return normalizeEnvList(Array.isArray(json) ? json : body);
}

module.exports = {
  INVENTORY_PATH,
  AUDIT_LOG_PATH,
  SECRET_VALUE_PATTERN,
  loadInventory,
  redactValue,
  summarizeKeys,
  keyNames,
  normalizeEnvList,
  redactEnvListForLog,
  assertNoSecretValues,
  assertWriteModeAllowed,
  assertOwnerApproval,
  assertNoFullReplaceRequest,
  assertNoProtectedRemovals,
  buildMergePlan,
  summarizePlan,
  publicDiff,
  runPreflight,
  auditPreflight,
  appendAuditLog,
  listServiceEnvVars,
  putServiceEnvVarsMergeOnly
};
