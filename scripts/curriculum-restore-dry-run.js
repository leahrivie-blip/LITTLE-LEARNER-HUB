#!/usr/bin/env node
/**
 * Curriculum restore dry run.
 *
 * Compares the CURRENT live curriculum (fetched read-only from a running site's
 * /api/site-content, or a local admin-fetched siteContent JSON you provide) against a
 * CANDIDATE restore source (by default, the packaged startup-seed data bundled in this
 * repo — the only source available without production Postgres/admin credentials), and
 * prints exactly what a restore would change: proposed counts, duplicate IDs, missing IDs,
 * malformed/skipped records, Free/Pro breakdown, age-group totals, and confirmation that no
 * other siteContent fields would be touched.
 *
 * This script NEVER writes to anything. It is read-only / local-only.
 *
 * Usage:
 *   node scripts/curriculum-restore-dry-run.js [--current-url https://example.com] [--candidate-file /path/to/backup.json]
 *
 * --current-url defaults to https://littlelearnershubbyleah.com (production, public endpoint only).
 * --candidate-file, if provided, must be a JSON file shaped like either:
 *   { siteContent: { curriculum: { lessonPlans: [...], activities: [...] } } }  (admin backup export shape)
 *   or { curriculum: { lessonPlans: [...], activities: [...] } }
 *   or { lessonPlans: [...], activities: [...] } directly.
 * If omitted, the candidate is generated locally by booting the packaged startup seeders
 * against a fresh throwaway local-json store (no network, no production access).
 */
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const crypto = require("node:crypto");
const http = require("node:http");
const https = require("node:https");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--current-url") out.currentUrl = argv[++i];
    if (argv[i] === "--candidate-file") out.candidateFile = argv[++i];
  }
  return out;
}

function fetchJson(urlString) {
  return new Promise((resolve, reject) => {
    const client = urlString.startsWith("https:") ? https : http;
    client.get(urlString, { timeout: 20000 }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch (error) {
          reject(new Error(`Failed to parse JSON from ${urlString}: ${error.message}`));
        }
      });
    }).on("error", reject).on("timeout", () => reject(new Error(`Timed out fetching ${urlString}`)));
  });
}

function requestLocalJson(port, urlPath) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: "127.0.0.1", port, path: urlPath, timeout: 15000 }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch (error) { reject(error); }
      });
    }).on("error", reject);
  });
}

async function waitForLocalBoot(port, child) {
  for (let i = 0; i < 100; i += 1) {
    if (child.exitCode !== null) throw new Error("Local seed server exited early");
    try {
      const res = await requestLocalJson(port, "/api/health");
      if (res?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("Local seed server did not boot in time");
}

async function generateCandidateFromPackagedSeeds() {
  const port = 20500 + Math.floor(Math.random() * 300);
  const storePath = path.join(os.tmpdir(), `llh-restore-dry-run-${crypto.randomBytes(4).toString("hex")}.json`);
  fs.writeFileSync(storePath, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }, null, 2));
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      SITE_URL: `http://127.0.0.1:${port}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: storePath,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await waitForLocalBoot(port, child);
    const pub = await requestLocalJson(port, "/api/site-content");
    const lib = pub?.siteContent?.curriculumLibrary || { lessonPlans: [], activities: [] };
    return {
      source: "packaged-startup-seed-files (this repo, no production access)",
      lessonPlans: lib.lessonPlans || [],
      activities: lib.activities || [],
    };
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* */ } resolve(); }, 3000);
      child.on("exit", () => { clearTimeout(timer); resolve(); });
    });
    try { fs.unlinkSync(storePath); } catch { /* ignore */ }
  }
}

function extractCurriculum(payload) {
  const curriculum = payload?.siteContent?.curriculum
    || payload?.curriculum?.siteContent?.curriculum
    || payload?.curriculum
    || payload;
  return {
    lessonPlans: Array.isArray(curriculum?.lessonPlans) ? curriculum.lessonPlans : [],
    activities: Array.isArray(curriculum?.activities) ? curriculum.activities : [],
  };
}

function countBy(list, keyFn) {
  const out = {};
  list.forEach((item) => {
    const key = keyFn(item);
    out[key] = (out[key] || 0) + 1;
  });
  return out;
}

function findDuplicateIds(list) {
  const counts = {};
  list.forEach((item) => { if (item?.id) counts[item.id] = (counts[item.id] || 0) + 1; });
  return Object.entries(counts).filter(([, c]) => c > 1).map(([id, c]) => ({ id, count: c }));
}

function findMalformedLessonPlans(list) {
  return list.filter((p) => !p?.id || !p?.title || !p?.age).map((p) => p?.id || "(no id)");
}

function findMalformedActivities(list) {
  return list.filter((a) => !a?.id || !a?.title || !a?.lessonPlanId).map((a) => a?.id || "(no id)");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const currentUrl = args.currentUrl || "https://littlelearnershubbyleah.com";

  console.log("=".repeat(72));
  console.log("CURRICULUM RESTORE DRY RUN — read-only, no writes performed");
  console.log("=".repeat(72));

  console.log(`\nFetching CURRENT curriculum (public, read-only) from ${currentUrl} ...`);
  let currentPayload;
  try {
    currentPayload = await fetchJson(`${currentUrl.replace(/\/$/, "")}/api/site-content`);
  } catch (error) {
    console.error(`Could not fetch current site-content: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  const current = extractCurriculum(currentPayload);
  console.log(`Current: ${current.lessonPlans.length} lesson plans, ${current.activities.length} activities`);

  let candidate;
  if (args.candidateFile) {
    console.log(`\nLoading CANDIDATE curriculum from ${args.candidateFile} ...`);
    const raw = JSON.parse(fs.readFileSync(args.candidateFile, "utf8"));
    const extracted = extractCurriculum(raw);
    candidate = { source: args.candidateFile, ...extracted };
  } else {
    console.log("\nNo --candidate-file provided — generating candidate from this repo's");
    console.log("packaged startup-seed files (the only source available without production");
    console.log("Postgres/admin credentials). This does NOT touch production and does not");
    console.log("necessarily include any additional content an admin curated live in");
    console.log("production beyond the packaged seeds (e.g. curriculum 'series' groupings).");
    candidate = await generateCandidateFromPackagedSeeds();
  }
  console.log(`Candidate source: ${candidate.source}`);
  console.log(`Candidate: ${candidate.lessonPlans.length} lesson plans, ${candidate.activities.length} activities`);

  const dupLessonPlans = findDuplicateIds(candidate.lessonPlans);
  const dupActivities = findDuplicateIds(candidate.activities);
  const malformedPlans = findMalformedLessonPlans(candidate.lessonPlans);
  const malformedActivities = findMalformedActivities(candidate.activities);
  const planIds = new Set(candidate.lessonPlans.map((p) => p.id));
  const orphanActivities = candidate.activities.filter((a) => a.lessonPlanId && !planIds.has(a.lessonPlanId));

  const currentIds = new Set(current.lessonPlans.map((p) => p.id));
  const candidateIds = new Set(candidate.lessonPlans.map((p) => p.id));
  const newIds = [...candidateIds].filter((id) => !currentIds.has(id));
  const missingFromCandidate = [...currentIds].filter((id) => !candidateIds.has(id));

  const skipped = malformedPlans.length + malformedActivities.length + dupLessonPlans.length + dupActivities.length;
  const cleanLessonPlans = candidate.lessonPlans.filter((p) => p?.id && p?.title && p?.age);
  const cleanActivities = candidate.activities.filter((a) => a?.id && a?.title && a?.lessonPlanId);

  console.log("\n" + "-".repeat(72));
  console.log("PROPOSED CHANGE (curriculum.lessonPlans / curriculum.activities ONLY)");
  console.log("-".repeat(72));
  console.log(`  Current counts:   ${current.lessonPlans.length} lesson plans / ${current.activities.length} activities`);
  console.log(`  Proposed counts:  ${cleanLessonPlans.length} lesson plans / ${cleanActivities.length} activities`);
  console.log(`  New IDs not currently live: ${newIds.length}`);
  console.log(`  Currently-live IDs missing from candidate: ${missingFromCandidate.length}${missingFromCandidate.length ? " " + JSON.stringify(missingFromCandidate.slice(0, 10)) : ""}`);
  console.log(`  Duplicate lesson plan IDs in candidate: ${dupLessonPlans.length}${dupLessonPlans.length ? " " + JSON.stringify(dupLessonPlans) : ""}`);
  console.log(`  Duplicate activity IDs in candidate: ${dupActivities.length}${dupActivities.length ? " " + JSON.stringify(dupActivities) : ""}`);
  console.log(`  Malformed lesson plans (skipped): ${malformedPlans.length}${malformedPlans.length ? " " + JSON.stringify(malformedPlans) : ""}`);
  console.log(`  Malformed activities (skipped): ${malformedActivities.length}${malformedActivities.length ? " " + JSON.stringify(malformedActivities) : ""}`);
  console.log(`  Orphan activities (no matching lesson plan, skipped): ${orphanActivities.length}`);
  console.log(`  Total records that would be skipped: ${skipped}`);

  console.log(`\n  Plan breakdown (Free/Pro): ${JSON.stringify(countBy(cleanLessonPlans, (p) => p.plan || "(none)"))}`);
  console.log(`  Age-group totals: ${JSON.stringify(countBy(cleanLessonPlans, (p) => p.age || "(none)"))}`);
  console.log(`  Publication status totals: ${JSON.stringify(countBy(cleanLessonPlans, (p) => p.status || "(none)"))}`);
  console.log(`  Activity category totals (top 10): ${JSON.stringify(
    Object.fromEntries(Object.entries(countBy(cleanActivities, (a) => a.activityCategory || "(none)")).sort((a, b) => b[1] - a[1]).slice(0, 10)),
  )}`);

  console.log("\n" + "-".repeat(72));
  console.log("SCOPE CONFIRMATION");
  console.log("-".repeat(72));
  console.log("  This dry run only inspects curriculum.lessonPlans and curriculum.activities.");
  console.log("  A real restore MUST use a field-level merge into siteContent.curriculum only —");
  console.log("  it must NOT touch users, subscriptions, messages, billing, settings, forms,");
  console.log("  announcements, pricing, or any other siteContent field. This script performs");
  console.log("  no writes; it is a read-only comparison only.");
  console.log("=".repeat(72));
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
