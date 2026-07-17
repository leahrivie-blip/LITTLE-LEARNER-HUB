#!/usr/bin/env node
/**
 * Read-only org-link audit for Ashley + Ladiisha.
 *
 * DOES NOT WRITE. Never merges accounts.
 *
 * Modes:
 * 1) Local/store file:
 *    LLH_STORE_PATH=/path/to/launch-store.json node scripts/audit-org-link-ashley-ladiisha.js
 *
 * 2) Production admin API (after Unlock Admin in the app, copy adminToken):
 *    LLH_ADMIN_TOKEN=admin_... LLH_AUDIT_BASE=https://littlelearnershubbyleah.com \
 *      node scripts/audit-org-link-ashley-ladiisha.js
 *
 * Optional:
 *    LLH_EMAIL_A=tclashley@icloud.com
 *    LLH_EMAIL_B=ladiisha01@gmail.com
 */
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const https = require("node:https");

const ROOT = path.join(__dirname, "..");
const EMAIL_A = String(process.env.LLH_EMAIL_A || "tclashley@icloud.com").trim().toLowerCase();
const EMAIL_B = String(process.env.LLH_EMAIL_B || "ladiisha01@gmail.com").trim().toLowerCase();
const STORE_PATH = process.env.LLH_STORE_PATH || path.join(ROOT, "server", "data", "launch-store.json");
const ADMIN_TOKEN = String(process.env.LLH_ADMIN_TOKEN || "").trim();
const BASE = String(process.env.LLH_AUDIT_BASE || "https://littlelearnershubbyleah.com").replace(/\/$/, "");

function fetchJson(url) {
  const lib = url.startsWith("https") ? https : http;
  return new Promise((resolve, reject) => {
    lib.get(url, { headers: { Accept: "application/json" } }, (res) => {
      let raw = "";
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        let json = {};
        try { json = raw ? JSON.parse(raw) : {}; } catch { json = { raw }; }
        resolve({ status: res.statusCode, json });
      });
    }).on("error", reject);
  });
}

async function auditViaAdminApi() {
  const url = `${BASE}/api/admin/org-link-audit?adminToken=${encodeURIComponent(ADMIN_TOKEN)}&emailA=${encodeURIComponent(EMAIL_A)}&emailB=${encodeURIComponent(EMAIL_B)}`;
  const res = await fetchJson(url);
  if (res.status === 404) {
    return {
      status: "BLOCKED",
      blockers: [
        "Production does not yet expose GET /api/admin/org-link-audit (deploy the audit branch first), or the route is unavailable.",
      ],
      hint: "Unlock Admin locally against a store export, or deploy this branch, then re-run with LLH_ADMIN_TOKEN.",
      httpStatus: 404,
    };
  }
  if (res.status !== 200) {
    return {
      status: "BLOCKED",
      blockers: [res.json.error || `Admin API returned HTTP ${res.status}`],
      httpStatus: res.status,
      json: res.json,
    };
  }
  return res.json;
}

function auditViaLocalStore() {
  if (!fs.existsSync(STORE_PATH)) {
    return {
      status: "BLOCKED",
      blockers: [`Store file not found: ${STORE_PATH}`],
      hint: "Set LLH_STORE_PATH to a production export, or set LLH_ADMIN_TOKEN for live API audit.",
    };
  }
  const store = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
  const userCount = Object.keys(store.users || {}).length;
  if (!userCount) {
    return {
      status: "BLOCKED",
      blockers: [
        `Store at ${STORE_PATH} has 0 users (local empty store is not production).`,
      ],
      hint: "Export production via GET /api/admin/store-export?adminToken=... then set LLH_STORE_PATH, or use LLH_ADMIN_TOKEN against production after deploy.",
      localUserCount: 0,
    };
  }

  // Prefer the same server helper when available.
  try {
    // Lazy load by spawning a tiny evaluator would be heavy; duplicate minimal checks here
    // and instruct operators to prefer the admin API after deploy.
  } catch { /* continue */ }

  const pathToServer = path.join(ROOT, "server", "index.js");
  // Use a child require of a thin local replica via dynamic Function is unsafe;
  // instead shell out to node -e requiring buildOrgLinkAudit is not exported.
  // Keep a self-contained summary for offline exports:
  const users = store.users || {};
  const a = users[EMAIL_A];
  const b = users[EMAIL_B];
  const blockers = [];
  const conflicts = [];
  if (!a) blockers.push(`${EMAIL_A} not found`);
  if (!b) blockers.push(`${EMAIL_B} not found`);
  const founding = (store.foundingMembers || []).map((e) => String(e).toLowerCase());
  if (a?.foundingMemberActive && b?.foundingMemberActive) {
    conflicts.push({ code: "dual_active_founding", severity: "high" });
  }
  const uidA = a?.firebaseUid || "";
  const uidB = b?.firebaseUid || "";
  const childA = uidA && store.childData?.[uidA]?.data?.Profiles;
  const childB = uidB && store.childData?.[uidB]?.data?.Profiles;
  if (Array.isArray(childA) && childA.length && Array.isArray(childB) && childB.length) {
    conflicts.push({ code: "dual_child_data_uids", severity: "high" });
    blockers.push("Both accounts hold child Profiles under different UIDs");
  }
  return {
    ok: true,
    readOnly: true,
    status: blockers.length ? "BLOCKED" : "READY_FOR_REVIEW",
    source: `local-store:${STORE_PATH}`,
    emails: { ashley: EMAIL_A, ladiisha: EMAIL_B },
    users: {
      [EMAIL_A]: a ? {
        exists: true,
        plan: a.plan,
        role: a.role,
        foundingMemberActive: a.foundingMemberActive,
        linkedProgramOwnerEmail: a.linkedProgramOwnerEmail || "",
        stripeSubscriptionId: a.stripeSubscriptionId ? "present" : "",
        firebaseUid: a.firebaseUid || "",
      } : { exists: false },
      [EMAIL_B]: b ? {
        exists: true,
        plan: b.plan,
        role: b.role,
        foundingMemberActive: b.foundingMemberActive,
        linkedProgramOwnerEmail: b.linkedProgramOwnerEmail || "",
        stripeSubscriptionId: b.stripeSubscriptionId ? "present" : "",
        firebaseUid: b.firebaseUid || "",
      } : { exists: false },
    },
    foundingMembersIncludes: {
      [EMAIL_A]: founding.includes(EMAIL_A),
      [EMAIL_B]: founding.includes(EMAIL_B),
      foundingClaimedCount: founding.length,
    },
    programBuckets: Object.keys(store.programMembers || {}),
    conflicts,
    blockers,
    note: "For the full structured report, use GET /api/admin/org-link-audit after deploy.",
  };
}

async function main() {
  console.log("Org-link audit (READ ONLY) — no database writes will be performed.\n");
  let report;
  if (ADMIN_TOKEN) {
    console.log(`Mode: production admin API @ ${BASE}`);
    report = await auditViaAdminApi();
  } else {
    console.log(`Mode: local store @ ${STORE_PATH}`);
    report = auditViaLocalStore();
  }

  console.log(JSON.stringify(report, null, 2));
  console.log(`\nSTATUS: ${report.status || "UNKNOWN"}`);
  if (report.status !== "READY_FOR_REVIEW") {
    console.log("DO NOT MERGE — resolve blockers and re-run.");
    process.exitCode = 2;
    return;
  }
  console.log("Audit ready for human review. Still do not merge until backup + Founding plan are confirmed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
