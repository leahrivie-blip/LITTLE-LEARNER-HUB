#!/usr/bin/env node
/**
 * Single release gate for Little Learner Hub (testing branch).
 *
 * Runs the critical suites that catch broken navigation, failed loading,
 * wrong-role interfaces, database problems, and production-lock regressions
 * BEFORE they reach the deployed testing site.
 *
 * Usage: npm run test:release
 *
 * Any failed suite exits non-zero. Suites never touch production data,
 * production secrets, live Stripe, email, SMS, or OpenAI — they spawn local
 * servers with temp JSON stores and fake fixtures only.
 */
const { spawn } = require("node:child_process");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

/** Ordered critical suites — keep this list intentional and small enough for CI. */
const SUITES = [
  { id: "syntax", label: "Syntax (node --check)", cmd: "npm", args: ["run", "check"] },
  { id: "store-safety", label: "Store safety / full-store replacement guards", cmd: "npm", args: ["run", "test:store-safety"] },
  { id: "password-hash", label: "Password hash security", cmd: "npm", args: ["run", "test:password-hash-security"] },
  { id: "temp-password", label: "Temp password auth (signup/login session)", cmd: "npm", args: ["run", "test:temp-password-auth"] },
  { id: "admin-auth", label: "Admin auth session", cmd: "npm", args: ["run", "test:admin-auth-session"] },
  { id: "db-isolation", label: "Testing database isolation + production locks", cmd: "npm", args: ["run", "test:testing-database-isolation"] },
  { id: "homepage-smoke", label: "Homepage / signup CTAs / admin unlock smoke", cmd: "npm", args: ["run", "test:homepage-smoke"] },
  { id: "testing-lab-routing", label: "Testing Lab routing (no Calendar bounce)", cmd: "npm", args: ["run", "test:testing-lab-routing-fix"] },
  { id: "owner-testing-home", label: "Owner Testing Home + Add External Tester + role switch + feedback", cmd: "npm", args: ["run", "test:owner-testing-home-acceptance"] },
  { id: "admin-preview-escape", label: "Admin preview escape / Platform Admin session integrity", cmd: "npm", args: ["run", "test:admin-preview-escape"] },
  { id: "home-daycare-ui", label: "Solo Home Daycare Provider UI", cmd: "npm", args: ["run", "test:home-daycare-pilot-ui"] },
  { id: "home-daycare-staff", label: "Optional home daycare staff restrictions", cmd: "npm", args: ["run", "test:home-daycare-staff-restrictions"] },
  { id: "connected-walkthrough", label: "Connected children/guardians walkthrough", cmd: "npm", args: ["run", "test:home-daycare-connected-walkthrough"] },
  { id: "role-nav", label: "Role navigation (testing accounts)", cmd: "npm", args: ["run", "test:role-navigation-testing-accounts"] },
  { id: "fast-daily-logs", label: "Fast Daily Logs redesign", cmd: "npm", args: ["run", "test:fast-daily-logs"] },
  { id: "fast-daily-logs-safety", label: "Fast Daily Logs safety (group/undo/meds/summary/print/photos)", cmd: "npm", args: ["run", "test:fast-daily-logs-safety"] },
  { id: "fast-daily-logs-visual", label: "Fast Daily Logs phone/tablet/computer visual", cmd: "npm", args: ["run", "test:fast-daily-logs-visual"] },
    { id: "fast-daily-logs-architecture", label: "Fast Daily Logs architecture (server authority / isolation / persistence)", cmd: "npm", args: ["run", "test:fast-daily-logs-architecture"] },
  { id: "fast-daily-logs-parent-share", label: "Fast Daily Logs Provider nav + Parent share bridge", cmd: "npm", args: ["run", "test:fast-daily-logs-parent-share"] },
  { id: "daily-care-sync", label: "Daily Care server-authoritative sync", cmd: "npm", args: ["run", "test:daily-care-server-authoritative-sync"] },
  { id: "daily-care-offline", label: "Daily Care offline retry / idempotency", cmd: "npm", args: ["run", "test:daily-care-offline-queue-corrections-sync"] },
  { id: "messaging", label: "Messages foundation", cmd: "npm", args: ["run", "test:messaging-lib"] },
  { id: "forms", label: "Forms Center (phase 4 smoke)", cmd: "npm", args: ["run", "test:forms-center-phase4"] },
  { id: "testing-feedback", label: "Testing Feedback", cmd: "npm", args: ["run", "test:testing-feedback"] },
  { id: "external-sandbox", label: "External tester sandbox / organization isolation", cmd: "npm", args: ["run", "test:external-tester-sandbox"] },
  { id: "deployed-smoke-readiness", label: "Deployed smoke readiness (prod/cred/SHA refuse + cleanup)", cmd: "npm", args: ["run", "test:deployed-smoke-readiness"] },
];

/** Opt-in: LLH_RELEASE_INJECT_FAIL=<suite-id> forces that suite to fail so owners can prove the gate exits non-zero. */
if (process.env.LLH_RELEASE_INJECT_FAIL) {
  const injectId = String(process.env.LLH_RELEASE_INJECT_FAIL).trim();
  const idx = SUITES.findIndex((s) => s.id === injectId);
  if (idx >= 0) {
    SUITES[idx] = {
      id: injectId,
      label: `${SUITES[idx].label} (INJECTED FAILURE)`,
      cmd: process.execPath,
      args: ["-e", "console.error('INJECTED intentional failure for release-gate proof'); process.exit(1)"],
    };
  }
}

/** Opt-in: LLH_RELEASE_MAX_SUITES=N truncates the suite list (used for fast non-zero exit proofs). */
if (process.env.LLH_RELEASE_MAX_SUITES) {
  const max = Math.max(1, Number(process.env.LLH_RELEASE_MAX_SUITES) || 0);
  SUITES.splice(max);
}

function runOne(suite) {
  return new Promise((resolve) => {
    const started = Date.now();
    console.log(`\n━━━ [${suite.id}] ${suite.label} ━━━`);
    const child = spawn(suite.cmd, suite.args, {
      cwd: ROOT,
      env: {
        ...process.env,
        NODE_ENV: process.env.NODE_ENV || "test",
        CI: process.env.CI || "1",
        // Never allow release suites to point at live external services.
        ALLOW_OPENAI_TESTING: "false",
        STRIPE_SECRET_KEY: "",
        OPENAI_API_KEY: "",
        RESEND_API_KEY: "",
        TWILIO_AUTH_TOKEN: "",
      },
      stdio: "inherit",
      shell: false,
    });
    child.on("error", (error) => {
      resolve({ id: suite.id, label: suite.label, ok: false, code: 1, ms: Date.now() - started, error: error.message });
    });
    child.on("exit", (code, signal) => {
      resolve({
        id: suite.id,
        label: suite.label,
        ok: code === 0 && !signal,
        code: signal ? 1 : Number(code || 0),
        ms: Date.now() - started,
        signal: signal || "",
      });
    });
  });
}

async function main() {
  console.log("Little Learner Hub — release test gate");
  console.log(`Suites: ${SUITES.length} (fake fixtures / local JSON only; no production secrets)`);
  const results = [];
  for (const suite of SUITES) {
    // eslint-disable-next-line no-await-in-loop
    const result = await runOne(suite);
    results.push(result);
    if (!result.ok) {
      console.error(`\nFAIL  [${result.id}] exited ${result.code}${result.signal ? ` (${result.signal})` : ""} after ${result.ms}ms`);
      // Continue remaining suites so the owner sees the full failure surface,
      // but still exit non-zero at the end.
    } else {
      console.log(`PASS  [${result.id}] ${result.ms}ms`);
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log("\n════════ RELEASE GATE SUMMARY ════════");
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.id.padEnd(22)} ${(r.ms / 1000).toFixed(1)}s  ${r.label}`);
  }
  if (failed.length) {
    console.error(`\nRelease gate FAILED — ${failed.length}/${results.length} suite(s) failed.`);
    process.exitCode = 1;
    return;
  }
  console.log(`\nRelease gate PASSED — ${results.length}/${results.length} suites.`);
}

main().catch((error) => {
  console.error("Release gate crashed:", error);
  process.exitCode = 1;
});
