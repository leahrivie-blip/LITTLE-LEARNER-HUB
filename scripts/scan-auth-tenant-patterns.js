#!/usr/bin/env node
/**
 * Read-only scan for auth/tenant-isolation anti-patterns in server routes.
 * Reports findings; does not modify product code.
 *
 * Run: node scripts/scan-auth-tenant-patterns.js
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join("/opt/cursor/artifacts/prod-e2e-audit", "AUTH_PATTERN_SCAN.json");
const serverSrc = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");

const findings = [];

function note(severity, id, title, detail) {
  findings.push({ severity, id, title, detail });
}

// Shared identity path markers (expected after C3 + TK fix)
const usesScheduleIdentity = {
  childData: /async function resolveChildDataIdentity[\s\S]{0,900}resolveScheduleIdentity\(request\)/,
  tk: /async function resolveTeachingKitCallerContext[\s\S]{0,900}resolveScheduleIdentity\(request\)/,
  curriculum: /async function resolveCurriculumAccessUser[\s\S]{0,900}resolveScheduleIdentity\(request\)/,
  ai: /async function handleAiGenerate[\s\S]{0,1200}resolveScheduleIdentity\(request\)/,
  aiUsage: /async function handleUserAiUsage[\s\S]{0,900}resolveScheduleIdentity\(request\)/,
};
for (const [name, re] of Object.entries(usesScheduleIdentity)) {
  if (re.test(serverSrc)) {
    note("INFO", `shared-identity-${name}`, `${name} uses resolveScheduleIdentity`, "aligned");
  } else {
    note("HIGH", `shared-identity-${name}`, `${name} does NOT use resolveScheduleIdentity`, "investigate");
  }
}

// Firebase-first identity resolvers that may still ignore member sessions
const firebaseFirstBlocks = [
  ...serverSrc.matchAll(/if \(firebaseConfigStatus\(\)\.ready\) \{\s*try \{\s*identity = await verifyFirebaseUser/g),
];
note(
  firebaseFirstBlocks.length ? "MEDIUM" : "INFO",
  "firebase-first-identity-blocks",
  `Remaining Firebase-first identity try/catch blocks: ${firebaseFirstBlocks.length}`,
  firebaseFirstBlocks.length
    ? "Review each for llh_member_* acceptance; Teaching Kit + curriculum + child-data already unified."
    : "No classic Firebase-first identity blocks found",
);

// body.email usage near handlers (report count / sample)
const bodyEmailHits = [];
const lines = serverSrc.split("\n");
lines.forEach((line, idx) => {
  if (/normalizeEmail\(body\.email/.test(line) || /body\.email\s*\|\|/.test(line)) {
    bodyEmailHits.push({ line: idx + 1, text: line.trim().slice(0, 160) });
  }
});
note(
  "INFO",
  "body-email-usages",
  `${bodyEmailHits.length} body.email normalization sites in server/index.js`,
  {
    sample: bodyEmailHits.slice(0, 25),
    note: "Many are login/billing/admin entrypoints; C1-critical AI paths must bind session identity.",
  },
);

// query email
const queryEmailHits = [];
lines.forEach((line, idx) => {
  if (/searchParams\.get\(["']email["']\)/.test(line)) {
    queryEmailHits.push({ line: idx + 1, text: line.trim().slice(0, 160) });
  }
});
note("INFO", "query-email-usages", `${queryEmailHits.length} query email sites`, { sample: queryEmailHits.slice(0, 20) });

// client-supplied programId reads
const programIdHits = [];
lines.forEach((line, idx) => {
  if (/body\.programId|searchParams\.get\(["']programId["']\)/.test(line)) {
    programIdHits.push({ line: idx + 1, text: line.trim().slice(0, 160) });
  }
});
note(
  programIdHits.length ? "MEDIUM" : "INFO",
  "client-programId-reads",
  `${programIdHits.length} client programId reads`,
  {
    sample: programIdHits.slice(0, 20),
    note: "Child-data write path must ignore client programId and use resolveProgramContext (verified by matrix).",
  },
);

// Family Hub left alone — just inventory if identity helpers diverge
if (/family-hub/i.test(serverSrc) && !/resolveScheduleIdentity/.test(serverSrc.slice(serverSrc.indexOf("familyHub"), serverSrc.indexOf("familyHub") + 5000) || "")) {
  note("INFO", "family-hub-scope", "Family Hub uses separate session model", "Out of scope per owner instructions; not modified.");
}

const report = {
  producedAt: new Date().toISOString(),
  mode: "read-only scan",
  findings,
  criticalOrHigh: findings.filter((f) => f.severity === "CRITICAL" || f.severity === "HIGH"),
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(`Auth pattern scan: ${findings.length} findings (${report.criticalOrHigh.length} CRITICAL/HIGH)`);
for (const f of findings) {
  console.log(`  [${f.severity}] ${f.id}: ${f.title}`);
}
console.log(`Wrote ${OUT}`);
if (report.criticalOrHigh.length) process.exit(1);
