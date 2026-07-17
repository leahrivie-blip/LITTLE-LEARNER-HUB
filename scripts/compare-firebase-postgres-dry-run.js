#!/usr/bin/env node
/**
 * Dry-run only: compare a Firebase Auth export against a Postgres user export.
 * Never writes to production.
 *
 * Usage:
 *   node scripts/compare-firebase-postgres-dry-run.js \
 *     --firebase /path/to/firebase-users.json \
 *     --postgres /path/to/03-postgres-users-slim.json
 *
 * Firebase file may be:
 * - Firebase Console JSON export ({ users: [...] } or an array)
 * - CSV with an email column
 * - Plain text one email per line
 */
const fs = require("node:fs");
const path = require("node:path");

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx < 0 || idx + 1 >= process.argv.length) return "";
  return process.argv[idx + 1];
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function loadEmailsFromFirebase(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const data = JSON.parse(trimmed);
    const rows = Array.isArray(data)
      ? data
      : Array.isArray(data.users)
        ? data.users
        : Array.isArray(data.result?.users)
          ? data.result.users
          : [];
    return rows.map((row) => normalizeEmail(row.email || row.Email || row.EMAIL)).filter(Boolean);
  }
  const lines = trimmed.split(/\r?\n/).filter(Boolean);
  if (lines[0].toLowerCase().includes("email")) {
    const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase());
    const emailIdx = headers.findIndex((h) => h === "email" || h.endsWith("email"));
    if (emailIdx < 0) throw new Error("CSV export is missing an email column.");
    return lines.slice(1).map((line) => {
      const cols = line.match(/("([^"]|"")*"|[^,]*)/g) || [];
      const cell = (cols[emailIdx] || "").trim().replace(/^"|"$/g, "").replace(/""/g, '"');
      return normalizeEmail(cell);
    }).filter(Boolean);
  }
  return lines.map(normalizeEmail).filter((email) => email.includes("@"));
}

function loadPostgresEmails(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const users = Array.isArray(data)
    ? data
    : Array.isArray(data.users)
      ? data.users
      : [];
  return users.map((user) => normalizeEmail(user.email)).filter(Boolean);
}

function unique(list) {
  return [...new Set(list)];
}

function main() {
  const firebasePath = argValue("--firebase");
  const postgresPath = argValue("--postgres");
  if (!firebasePath || !postgresPath) {
    console.error("Usage: node scripts/compare-firebase-postgres-dry-run.js --firebase <file> --postgres <file>");
    process.exit(1);
  }
  const firebaseEmails = unique(loadEmailsFromFirebase(path.resolve(firebasePath)));
  const postgresEmails = unique(loadPostgresEmails(path.resolve(postgresPath)));
  const postgresSet = new Set(postgresEmails);
  const firebaseSet = new Set(firebaseEmails);
  const missingFromPostgres = firebaseEmails.filter((email) => !postgresSet.has(email)).sort();
  const postgresOnly = postgresEmails.filter((email) => !firebaseSet.has(email)).sort();
  const matched = firebaseEmails.filter((email) => postgresSet.has(email)).sort();

  const report = {
    dryRun: true,
    destructive: false,
    generatedAt: new Date().toISOString(),
    totalFirebaseUsers: firebaseEmails.length,
    totalCurrentPostgresUsers: postgresEmails.length,
    missingUsers: missingFromPostgres.length,
    stripeMatchedUsersNote: "Run Admin Stripe backfill dry-run separately for Stripe match counts.",
    potentialDuplicatesNote: "Duplicate risk is evaluated in Stripe dry-run (same email, multiple cus_ ids).",
    matchedInBoth: matched.length,
    postgresOnlyNotInFirebaseExport: postgresOnly.length,
    missingFromPostgres,
    postgresOnly,
  };

  const outPath = argValue("--out");
  if (outPath) {
    fs.writeFileSync(path.resolve(outPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  console.log(JSON.stringify(report, null, 2));
}

main();
