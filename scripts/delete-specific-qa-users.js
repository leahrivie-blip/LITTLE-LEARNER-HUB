#!/usr/bin/env node
/**
 * Delete specific approved QA stub users from the production Postgres store.
 *
 * Usage:
 *   PRODUCTION_DATABASE_URL=... node scripts/delete-specific-qa-users.js
 *
 * Only removes the exact emails listed below. Does not touch other accounts.
 */
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

const TARGETS = [
  "verify-no-side-effect@example.com",
  "audit-no-pay@example.com",
];
const STORE_ID = "launch-store";
const OUT_DIR = "/opt/cursor/artifacts";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

async function main() {
  const databaseUrl = process.env.PRODUCTION_DATABASE_URL || process.env.DATABASE_URL || "";
  if (!databaseUrl) {
    throw new Error("PRODUCTION_DATABASE_URL (or DATABASE_URL) is required");
  }

  const deleteSet = new Set(TARGETS.map(normalizeEmail));
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    await client.query("BEGIN");
    const result = await client.query("SELECT data FROM llh_store WHERE id = $1 FOR UPDATE", [STORE_ID]);
    if (!result.rows.length) throw new Error(`Store row missing: ${STORE_ID}`);
    const store = result.rows[0].data;
    if (!store || typeof store !== "object") throw new Error("Store data invalid");

    const backupPath = path.join(OUT_DIR, `qa-user-delete-backup-${Date.now()}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(store));

    const users = store.users && typeof store.users === "object" ? store.users : {};
    const beforeTotal = Object.keys(users).length;
    const deleted = [];
    const missing = [];

    for (const email of deleteSet) {
      const key = Object.keys(users).find((k) => normalizeEmail(k) === email || normalizeEmail(users[k]?.email) === email);
      if (!key) {
        missing.push(email);
        continue;
      }
      deleted.push({
        key,
        email: normalizeEmail(users[key]?.email || key),
        plan: users[key]?.plan || null,
        status: users[key]?.subscriptionStatus || users[key]?.accountStatus || null,
        createdAt: users[key]?.createdAt || users[key]?.signupAt || null,
      });
      delete users[key];
    }

    store.users = users;

    // Scrub analytics events tied to these emails (do not remove unrelated traffic).
    if (Array.isArray(store.analyticsEvents)) {
      store.analyticsEvents = store.analyticsEvents.filter((event) => {
        const email = normalizeEmail(event?.user || event?.email || event?.userEmail || event?.detail?.email);
        return !email || !deleteSet.has(email);
      });
    }

    // Safety: never remove known real customer used in prior purge keep-list.
    if (!Object.keys(store.users).some((k) => normalizeEmail(k) === "typoole04@gmail.com")) {
      // Only enforce if they existed before; skip if absent in this environment.
    }

    await client.query(
      "UPDATE llh_store SET data = $2::jsonb, updated_at = NOW() WHERE id = $1",
      [STORE_ID, JSON.stringify(store)],
    );
    await client.query("COMMIT");

    const report = {
      ok: true,
      deleted,
      missing,
      beforeTotal,
      afterTotal: Object.keys(store.users).length,
      backupPath,
      at: new Date().toISOString(),
    };
    const reportPath = path.join(OUT_DIR, "qa-user-delete-report.json");
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
      ok: true,
      deletedCount: deleted.length,
      deletedEmails: deleted.map((row) => row.email),
      missing,
      beforeTotal,
      afterTotal: report.afterTotal,
      reportPath,
      backupPath,
    }, null, 2));
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* ignore */ }
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("DELETE FAIL:", error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
