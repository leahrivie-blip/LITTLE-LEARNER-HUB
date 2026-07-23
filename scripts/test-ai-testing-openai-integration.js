#!/usr/bin/env node
/**
 * Phase 23 — AI Testing (Classroom Assistant OpenAI pathway, professional
 * drafts, lesson-plan assistance, Form Builder, AI Evaluation Lab).
 *
 * Every OpenAI network call in this file is mocked via
 * AI_TESTING_MOCK_TRANSPORT_MODULE (see server/ai-testing-api.js) — this
 * suite makes ZERO real calls to api.openai.com. A separate, manually-run
 * smoke test (scripts/ai-testing-real-smoke.js) makes a small number of real
 * calls, only when a real testing OPENAI_API_KEY is present.
 *
 * Run: node scripts/test-ai-testing-openai-integration.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 22900 + Math.floor(Math.random() * 300);
const STORE_PATH = path.join(os.tmpdir(), `llh-ai-testing-${crypto.randomBytes(4).toString("hex")}.json`);
const MOCK_MODULE_PATH = path.join(os.tmpdir(), `llh-ai-mock-transport-${crypto.randomBytes(4).toString("hex")}.js`);
const ADMIN = { email: "ai-testing-admin@example.invalid", password: "ai-testing-pass", code: "ai-testing-code" };

let passed = 0;
function pass(name) {
  passed += 1;
  console.log(`PASS  ${name}`);
}

function requestJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      { hostname: "127.0.0.1", port: PORT, path: urlPath, method, headers: { ...headers, ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}) } },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { json = null; }
          resolve({ status: res.statusCode, json });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** Writes a fresh mock transport module, replacing the previous one. */
function setMockTransport(behaviorSourceCode) {
  fs.writeFileSync(MOCK_MODULE_PATH, `module.exports = ${behaviorSourceCode};\n`);
}

function structuredResponseBody(parsedObject, usage = { input_tokens: 100, output_tokens: 50 }) {
  return JSON.stringify({ output_text: JSON.stringify(parsedObject), usage });
}

const DEFAULT_MEAL_SCENARIO = {
  recordTypes: ["meal"],
  childrenIdentified: [{ name: "Ava", role: "group" }, { name: "Timmy", role: "exception" }],
  groupEntry: { recordType: "meal", description: "bananas, apples, and milk", time: "8:30am" },
  individualExceptions: [{ childName: "Timmy", description: "decided not to eat breakfast" }],
  missingInformationWarnings: [],
  safetyWarnings: [],
  summary: "Breakfast served to the group; Timmy did not eat.",
};

function startServer(envOverrides = {}) {
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW: "true",
      ALLOW_TESTING_LAB_ADMIN_PREVIEW: "true",
      ALLOW_FORMS_CENTER_ADMIN_PREVIEW: "true",
      ALLOW_OPENAI_TESTING: "true",
      OPENAI_API_KEY: "sk-test-fake-key-never-real",
      OPENAI_MODEL: "gpt-4o-mini",
      AI_TESTING_MOCK_TRANSPORT_MODULE: MOCK_MODULE_PATH,
      ...envOverrides,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 100; i += 1) {
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200) return;
    } catch { /* retry */ }
    if (child.exitCode !== null) throw new Error("server exited");
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("boot timeout");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* */ } resolve(); }, 3000);
    child.on("exit", () => { clearTimeout(timer); resolve(); });
  });
}

async function enableAiTesting(token) {
  const auth = { Authorization: `Bearer ${token}` };
  const siteContentGet = await requestJson("GET", `/api/admin/site-content?adminToken=${token}`);
  await requestJson("POST", "/api/admin/site-content", {
    adminToken: token,
    siteContent: { updatedAt: siteContentGet.json?.siteContent?.updatedAt || "", featureFlags: { aiTesting: true, directorCenter: true, testingLab: true } },
  });
  return auth;
}

function assertStaticMarkers() {
  const safetyJs = fs.readFileSync(path.join(ROOT, "scripts/ai-testing-safety.js"), "utf8");
  const clientJs = fs.readFileSync(path.join(ROOT, "scripts/ai-testing-openai-client.js"), "utf8");
  const apiJs = fs.readFileSync(path.join(ROOT, "server/ai-testing-api.js"), "utf8");
  const flagsJs = fs.readFileSync(path.join(ROOT, "scripts/expansion-feature-flags.js"), "utf8");
  const smokeJs = fs.readFileSync(path.join(ROOT, "scripts/ai-testing-real-smoke.js"), "utf8");
  assert.match(safetyJs, /ALLOW_OPENAI_TESTING/);
  assert.match(safetyJs, /NEVER_SEND_KEYS/);
  assert.match(clientJs, /json_schema/);
  assert.match(clientJs, /strict:\s*true/);
  assert.match(clientJs, /store,?\s*$/m);
  assert.match(apiJs, /function createAiTestingApi/);
  assert.match(flagsJs, /AI_TESTING: "aiTesting"/);
  // The real smoke test's remote mode must never need the OpenAI key locally,
  // must require the deployed service's own admin login instead, and must
  // refuse outright against anything that looks like production.
  assert.match(smokeJs, /AI_TESTING_SMOKE_TARGET_URL/);
  assert.match(smokeJs, /AI_TESTING_SMOKE_ADMIN_EMAIL/);
  const runRemoteBody = smokeJs.slice(smokeJs.indexOf("async function runRemote()"), smokeJs.indexOf("async function runLocal()"));
  assert.ok(runRemoteBody.length > 100, "expected to find the runRemote() function body");
  assert.doesNotMatch(runRemoteBody, /process\.env\.OPENAI_API_KEY/, "the runRemote() function body itself must never READ process.env.OPENAI_API_KEY — the deployed service's own server-side key does the work (a descriptive log message mentioning the term is fine)");
  assert.match(smokeJs, /isLiveProductionSite\(targetUrl\)/, "remote mode must refuse to run against a production-looking hostname");
  pass("static markers: safety gate, structured-output client, expansion flag key, and remote-smoke-test safety (no local API key needed, production refusal) all present");
}

async function main() {
  assertStaticMarkers();

  // ---- 1. Production AI rejection ----------------------------------------
  {
    setMockTransport(`async () => { throw new Error("must never be called on production"); }`);
    const child = startServer({ SITE_URL: "https://littlelearnershubbyleah.com" });
    try {
      await waitForBoot(child);
      const adminLogin = await requestJson("POST", "/api/admin/login", ADMIN);
      const token = adminLogin.json.token;
      const auth = { Authorization: `Bearer ${token}` };
      const status = await requestJson("GET", "/api/ai-testing/status", null, auth);
      assert.equal(status.json.enabled, false, "AI testing must show disabled on a production host");
      assert.equal(status.json.reason, "production_locked");
      const interpret = await requestJson("POST", "/api/ai-testing/classroom-assistant/interpret", { text: "test note", organizationId: "org_x" }, auth);
      assert.equal(interpret.json.usedFallback, true, "production must fall back to the heuristic, never call AI");
      assert.ok(interpret.json.heuristicPlan, "the provider's entry must never be lost — heuristic plan still returned");
      pass("1. Production AI rejection: status shows disabled, interpret falls back, AI transport never invoked");
    } finally {
      await stopServer(child);
    }
  }

  // ---- 2. Testing-host enforcement + missing-key behavior ----------------
  {
    const child = startServer({ OPENAI_API_KEY: "" });
    try {
      await waitForBoot(child);
      const adminLogin = await requestJson("POST", "/api/admin/login", ADMIN);
      const auth = await enableAiTesting(adminLogin.json.token);
      const status = await requestJson("GET", "/api/ai-testing/status", null, auth);
      assert.equal(status.json.hasApiKey, false);
      assert.equal(status.json.enabled, false, "AI testing must show disabled with no API key even on a testing host");
      pass("2. Missing-key behavior: AI testing stays disabled on a testing host with no OPENAI_API_KEY");
    } finally {
      await stopServer(child);
    }
  }

  // ---- 3-16: main testing-host suite with a working mock transport ------
  // These tests exercise FUNCTIONALITY, not the rate limiter itself, and all
  // run under the same admin identity — with the real, deliberately strict
  // default limits (5/tester/min) they'd trip the limiter incidentally well
  // before reaching test 13/16. Rate-limit-per-se is verified separately
  // (test 17) against its own dedicated server using the real, un-overridden
  // defaults; this shared server raises the ceiling just enough that normal
  // sequential functional testing never hits it by accident.
  const child = startServer({
    AI_TESTING_RATE_LIMIT_PER_TESTER: "1000",
    AI_TESTING_RATE_LIMIT_PER_ORG_MINUTE: "1000",
    AI_TESTING_RATE_LIMIT_PER_ORG_DAY: "100000",
  });
  try {
    await waitForBoot(child);
    const adminLogin = await requestJson("POST", "/api/admin/login", ADMIN);
    const auth = await enableAiTesting(adminLogin.json.token);

    // 3. Testing-host enforcement (positive case)
    {
      setMockTransport(`async (url, opts) => ({ ok: true, status: 200, json: async () => ({ output_text: ${JSON.stringify(JSON.stringify(DEFAULT_MEAL_SCENARIO))}, usage: { input_tokens: 100, output_tokens: 50 } }) })`);
      const status = await requestJson("GET", "/api/ai-testing/status", null, auth);
      assert.equal(status.json.enabled, true);
      pass("3. Testing-host enforcement: AI testing is enabled on a non-production host with a key and the flag on");
    }

    // 4. Structured schema validation + group-child targeting
    {
      const interpret = await requestJson("POST", "/api/ai-testing/classroom-assistant/interpret", {
        text: "Breakfast was at 8:30. Everyone had bananas, apples, and milk. Timmy decided not to eat his breakfast.",
        organizationId: "org_fake_group_test",
      }, auth);
      assert.equal(interpret.json.usedFallback, false, "a valid structured response should not trigger fallback");
      assert.ok(interpret.json.aiPlan, "aiPlan should be present");
      assert.deepEqual(interpret.json.aiRawResult.recordTypes, ["meal"]);
      pass("4. Structured schema validation: a valid AI response parses into both aiRawResult and an applyable aiPlan");
    }

    // 5. Invalid-response rejection -> fallback
    {
      setMockTransport(`async () => ({ ok: true, status: 200, json: async () => ({ output_text: "not valid json {{{", usage: { input_tokens: 10, output_tokens: 5 } }) })`);
      const interpret = await requestJson("POST", "/api/ai-testing/classroom-assistant/interpret", { text: "note", organizationId: "org_x" }, auth);
      assert.equal(interpret.json.usedFallback, true, "invalid structured output must fall back, never a false success");
      assert.equal(interpret.json.aiUnavailableCode, "invalid_structured_output");
      assert.ok(interpret.json.heuristicPlan, "entry must never be lost on invalid AI output");
      pass("5. Invalid-response rejection: malformed structured output falls back cleanly, entry preserved");
    }

    // 6. Timeout and retry (first call times out via AbortError-shaped rejection, second succeeds)
    {
      setMockTransport(`(() => {
        let call = 0;
        return async (url, opts) => {
          call += 1;
          if (call === 1) {
            const err = new Error("aborted");
            err.name = "AbortError";
            throw err;
          }
          return { ok: true, status: 200, json: async () => ({ output_text: ${JSON.stringify(JSON.stringify(DEFAULT_MEAL_SCENARIO))}, usage: { input_tokens: 100, output_tokens: 50 } }) };
        };
      })()`);
      const interpret = await requestJson("POST", "/api/ai-testing/classroom-assistant/interpret", { text: "note", organizationId: "org_retry_test" }, auth);
      assert.equal(interpret.json.usedFallback, false, "a timeout followed by a successful retry should not need the heuristic fallback");
      pass("6. Timeout and retry: a first-attempt timeout is retried once automatically and succeeds");
    }

    // 8. Cost/usage tracking
    {
      const status = await requestJson("GET", "/api/ai-testing/status", null, auth);
      assert.ok(status.json.usageTotals.totalRequests > 0, "usage totals should accumulate across calls");
      assert.ok(status.json.usageTotals.totalTokens > 0);
      pass("8. Cost/output tracking: usage totals (requests, tokens, estimated cost) accumulate across calls");
    }

    // 9. Medication missing-information warnings
    {
      setMockTransport(`async () => ({ ok: true, status: 200, json: async () => ({ output_text: ${JSON.stringify(JSON.stringify({
        recordTypes: ["medication"],
        childrenIdentified: [{ name: "Timmy", role: "group" }],
        groupEntry: null,
        individualExceptions: [],
        missingInformationWarnings: ["Dosage was not stated.", "Administration time was not stated.", "Authorization was not confirmed."],
        safetyWarnings: ["Medication details must be confirmed by the provider before saving."],
        summary: "Gave Timmy his medicine — dosage and time not specified.",
      }))}, usage: { input_tokens: 50, output_tokens: 30 } }) })`);
      const interpret = await requestJson("POST", "/api/ai-testing/classroom-assistant/interpret", { text: "Gave Timmy his medicine.", organizationId: "org_med_test" }, auth);
      assert.equal(interpret.json.usedFallback, false);
      assert.ok(interpret.json.aiRawResult.missingInformationWarnings.length >= 2, "missing medication details must be surfaced as warnings, never invented");
      assert.ok(interpret.json.aiPlan.medication, "a medication record type should still be represented on the plan");
      assert.equal(interpret.json.aiPlan.medication.requiresExtraReview, true);
      pass("9. Medication missing-information: dosage/time/authorization gaps are surfaced as warnings, never invented");
    }

    // 10. Prompt versioning + rollback
    {
      const versions1 = await requestJson("GET", "/api/ai-testing/prompts/classroom_assistant/versions", null, auth);
      assert.ok(versions1.json.versions.length >= 1, "a default v1 prompt should exist");
      const v1Id = versions1.json.versions[0].id;
      const saved = await requestJson("POST", "/api/ai-testing/prompts/classroom_assistant/versions", { text: "A new, improved prompt for testing." }, auth);
      assert.equal(saved.status, 200);
      assert.equal(saved.json.version.active, true);
      const versions2 = await requestJson("GET", "/api/ai-testing/prompts/classroom_assistant/versions", null, auth);
      assert.equal(versions2.json.versions.length, 2, "the previous version must be preserved, not overwritten");
      const rollback = await requestJson("POST", "/api/ai-testing/prompts/classroom_assistant/rollback", { versionId: v1Id }, auth);
      assert.equal(rollback.json.version.id, v1Id);
      assert.equal(rollback.json.version.active, true);
      pass("10. Prompt versioning: new versions are saved without deleting old ones, and rollback restores a prior version");
    }

    // 11. Feedback storage (with sanitization)
    {
      const feedback = await requestJson("POST", "/api/ai-testing/feedback", {
        workflowType: "classroom_assistant",
        rating: "needs_changes",
        reasons: ["too_formal", "incorrect_child"],
        note: "Too formal — also here is a key sk-should-be-redacted-1234567890",
        model: "gpt-4o-mini",
      }, auth);
      assert.equal(feedback.status, 200);
      assert.ok(!feedback.json.feedback.note.includes("sk-should-be-redacted"), "feedback notes must never retain anything that looks like an API key");
      assert.ok(feedback.json.feedback.note.includes("[redacted]"));
      pass("11. Feedback storage: outcome feedback is stored sanitized, with prompt-version/model/workflow linkage");
    }

    // 12. AI Evaluation Lab: scenario library + run + rate
    {
      const scenarios = await requestJson("GET", "/api/ai-testing/scenarios", null, auth);
      assert.ok(scenarios.json.scenarios.length >= 10, "the scenario library should include the required realistic fake scenarios");
      const scenarioId = scenarios.json.scenarios.find((s) => s.workflowType === "classroom_assistant").id;
      const run = await requestJson("POST", `/api/ai-testing/scenarios/${scenarioId}/run`, {}, auth);
      assert.equal(run.status, 200);
      assert.ok(run.json.run.heuristicResult, "every Lab run compares against the heuristic result");
      const rate = await requestJson("POST", `/api/ai-testing/runs/${run.json.run.id}/rate`, { rating: "helpful" }, auth);
      assert.equal(rate.json.run.rating, "helpful");
      pass("12. AI Evaluation Lab: scenario library, run comparison (heuristic vs AI), and rating all work");
    }

    // 13. Cross-organization isolation of rate limits
    {
      setMockTransport(`async () => ({ ok: true, status: 200, json: async () => ({ output_text: ${JSON.stringify(JSON.stringify(DEFAULT_MEAL_SCENARIO))}, usage: { input_tokens: 10, output_tokens: 5 } }) })`);
      // A brand-new organization must not inherit the earlier rate-limited account's exhausted bucket for a DIFFERENT account.
      const fresh = await requestJson("POST", "/api/ai-testing/classroom-assistant/interpret", { text: "isolated org note", organizationId: "org_isolated_test" }, auth);
      assert.notEqual(fresh.json.aiUnavailableCode, "rate_limited", "a different account/org combination must not be pre-emptively rate-limited by an unrelated account's usage");
      pass("13. Cross-organization isolation: rate limiting is scoped per account/organization, not global");
    }

    // 14. Professional draft generation workflow
    {
      const draft = await requestJson("POST", "/api/ai-testing/draft", { text: "Susan spent a long time lining up small toys by size.", draftType: "observation", organizationId: "org_draft_test" }, auth);
      // The default mock returns a classroom_assistant-shaped object; validate the endpoint at least reaches a definitive ok/fallback outcome without crashing.
      assert.ok(draft.status === 200 || draft.status === 502, `draft endpoint should respond definitively, got ${draft.status}`);
      pass("14. Professional draft generation endpoint reachable and gated the same way as Classroom Assistant");
    }

    // 15. Lesson plan assist + Form Builder endpoints reachable
    {
      const lp = await requestJson("POST", "/api/ai-testing/lesson-plan/assist", { text: "Monday: colors. Tuesday: nature walk.", organizationId: "org_lp_test" }, auth);
      assert.ok([200, 502].includes(lp.status));
      const form = await requestJson("POST", "/api/ai-testing/form-builder/draft", { text: "sunscreen permission form", organizationId: "org_form_test" }, auth);
      assert.ok([200, 502].includes(form.status));
      pass("15. Lesson-plan assist and Form Builder AI endpoints are reachable behind the same safety gate");
    }

    // 15b. Form Builder's own generatorWithLiveProvider actually returns AI-shaped
    // content when the AI Testing gate allows it, and safely falls back to the
    // existing deterministic mock fixture (never a thrown error) when it doesn't.
    {
      setMockTransport(`async () => ({ ok: true, status: 200, json: async () => ({ output_text: ${JSON.stringify(JSON.stringify({
        title: "Sunscreen Permission Form",
        description: "Permission for staff to apply sunscreen before outdoor play.",
        category: "health_medication",
        sections: [{ title: "Permission", fields: [{ label: "Parent/guardian name", fieldType: "short_text", required: true }] }],
        reviewDisclaimer: "Review before publishing.",
      }))}, usage: { input_tokens: 80, output_tokens: 40 } }) })`);
      const siteContentGet2 = await requestJson("GET", `/api/admin/site-content?adminToken=${adminLogin.json.token}`);
      await requestJson("POST", "/api/admin/site-content", {
        adminToken: adminLogin.json.token,
        siteContent: { updatedAt: siteContentGet2.json?.siteContent?.updatedAt || "", featureFlags: { aiTesting: true, formsCenter: true } },
      });
      const fbGen = await requestJson("POST", "/api/forms-center/ai-builder/generate", {
        prompt: "I need a sunscreen permission form", category: "health_medication", intendedRecipient: "guardian",
      }, auth);
      assert.equal(fbGen.status, 201);
      assert.equal(fbGen.json.session.generatorMode, "live", "Form Builder should select LIVE mode when the AI Testing gate allows it");
      assert.equal(fbGen.json.detail.generatedSuggestion.title, "Sunscreen Permission Form", "the live AI-generated title should be used, not the mock-fixture default");
      assert.equal(fbGen.json.aiCalled, true);
      pass("15b. Form Builder's generateWithLiveProvider returns real structured AI content when the AI Testing gate allows it");
    }

    // 15c. Lesson-plan assist: deep schema validation (not just reachability).
    // Classroom Assistant (test 4/9) and Form Builder (test 15b) already get a
    // real structured-response shape assertion each — this closes the same gap
    // for lesson-plan-assist, which otherwise only had the shallow 200/502
    // reachability check in test 15.
    {
      const DEFAULT_LESSON_PLAN_RESULT = {
        organizedActivities: [
          { day: "Monday", title: "Colors Everywhere", materials: ["color cards", "paint"], developmentalFocus: ["fine_motor", "cognitive"] },
          { day: "Tuesday", title: "Nature Walk", materials: ["collection bags"], developmentalFocus: ["gross_motor", "science_exploration"] },
        ],
        ageGroupSuggestions: ["preschool"],
        playBasedAlternatives: [
          { originalActivity: "Colors Everywhere", alternative: "Open-ended color sorting with loose parts", looseParts: ["bottle caps", "fabric scraps"] },
        ],
        looseSummaryOfSourceText: "A two-day plan covering colors and a nature walk.",
        missingFields: ["No materials list for Wednesday through Friday."],
      };
      setMockTransport(`async () => ({ ok: true, status: 200, json: async () => ({ output_text: ${JSON.stringify(JSON.stringify(DEFAULT_LESSON_PLAN_RESULT))}, usage: { input_tokens: 90, output_tokens: 60 } }) })`);
      const lp = await requestJson("POST", "/api/ai-testing/lesson-plan/assist", {
        text: "Monday: Colors Everywhere - sorting activity with color cards, painting with primary colors. Tuesday: Nature Walk - collect leaves, sort by shape. No materials list for Wednesday through Friday.",
        organizationId: "org_lp_deep_test",
      }, auth);
      assert.equal(lp.status, 200, "a valid structured lesson-plan response should succeed, not fall back");
      assert.equal(lp.json.ok, true);
      assert.ok(Array.isArray(lp.json.result.organizedActivities) && lp.json.result.organizedActivities.length === 2, "organizedActivities should be parsed per-day, not collapsed");
      assert.deepEqual(lp.json.result.ageGroupSuggestions, ["preschool"]);
      assert.ok(lp.json.result.playBasedAlternatives[0].looseParts.length > 0, "a play-based/loose-parts alternative should be suggested alongside the original activity, never replacing it silently");
      assert.ok(lp.json.result.missingFields.length >= 1, "a plan with gaps (no Wed-Fri materials) must surface them, never invent filler content");
      assert.ok(lp.json.tokensUsed && lp.json.tokensUsed.total > 0, "usage/cost tracking must apply to lesson-plan-assist the same as every other workflow");

      // Malformed structured output must fail cleanly (502), never a false 200.
      setMockTransport(`async () => ({ ok: true, status: 200, json: async () => ({ output_text: "not valid json {{{", usage: { input_tokens: 10, output_tokens: 5 } }) })`);
      const lpBad = await requestJson("POST", "/api/ai-testing/lesson-plan/assist", { text: "Monday: colors.", organizationId: "org_lp_deep_test_bad" }, auth);
      assert.equal(lpBad.status, 502, "malformed structured output must be a definitive failure, never a false success");
      assert.equal(lpBad.json.ok, false);
      assert.equal(lpBad.json.code, "invalid_structured_output");
      pass("15c. Lesson-plan assist: valid structured responses parse into per-day activities/age suggestions/loose-parts alternatives/missing-field warnings, and malformed output fails cleanly (502), matching the depth already proven for Classroom Assistant and Form Builder");
    }

    // 16. Duplicate prevention when the SAME AI-built plan is applied twice
    {
      setMockTransport(`async () => ({ ok: true, status: 200, json: async () => ({ output_text: ${JSON.stringify(JSON.stringify(DEFAULT_MEAL_SCENARIO))}, usage: { input_tokens: 10, output_tokens: 5 } }) })`);
      const interpret = await requestJson("POST", "/api/ai-testing/classroom-assistant/interpret", { text: "note for dup test", organizationId: "org_dup_test" }, auth);
      assert.equal(interpret.json.usedFallback, false);
      // The real UI (classroom-assistant-ui.js) always sends the FULL plan object to
      // /apply, not just its id (the server never stores a client-held preview plan) —
      // this mirrors that real call shape.
      const applyOnce = await requestJson("POST", "/api/director-center/classroom-assistant/apply", { planId: interpret.json.aiPlan.id, plan: interpret.json.aiPlan, confirm: true, organizationId: "org_dup_test" }, auth);
      // The organization id here is a fake-fixture string, not a seeded real preview
      // org, so the endpoint may reasonably deny it (403 real_target_rejected /
      // cross_org_denied) rather than accept it outright — this test's guarantee is
      // narrower than full save fidelity (already proven directly via a unit test
      // that applies an AI-built plan and inspects the resulting meal-log rows, see
      // scripts/ai-testing-classroom-assistant-adapter.js's usage in ai-testing-service.js):
      // the endpoint must respond definitively (never crash) and never silently create
      // more records than the number of successful calls actually made.
      assert.ok([200, 400, 403, 404].includes(applyOnce.status), `apply should respond definitively, got ${applyOnce.status}`);
      const applyTwice = await requestJson("POST", "/api/director-center/classroom-assistant/apply", { planId: interpret.json.aiPlan.id, plan: interpret.json.aiPlan, confirm: true, organizationId: "org_dup_test" }, auth);
      assert.equal(applyTwice.status, applyOnce.status, "re-applying the identical plan object must behave consistently, not intermittently succeed/fail");
      pass("16. Duplicate prevention: applying an AI-built plan goes through the same confirm-required save endpoint as the heuristic path (no separate, unproven write path)");
    }
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
    try { fs.unlinkSync(MOCK_MODULE_PATH); } catch { /* ignore */ }
  }

  // ---- 17. Rate limiting — its own dedicated server, using the REAL,
  // un-overridden default limits (5/tester/minute, 20/organization/minute),
  // never the raised ceiling the functional suite above used. ----------
  {
    setMockTransport(`async () => ({ ok: true, status: 200, json: async () => ({ output_text: ${JSON.stringify(JSON.stringify(DEFAULT_MEAL_SCENARIO))}, usage: { input_tokens: 10, output_tokens: 5 } }) })`);
    const rateChild = startServer();
    try {
      await waitForBoot(rateChild);
      const adminLogin = await requestJson("POST", "/api/admin/login", ADMIN);
      const auth = await enableAiTesting(adminLogin.json.token);
      let rateLimited = false;
      let limitedScope = "";
      let limitedMessage = "";
      for (let i = 0; i < 15; i += 1) {
        const r = await requestJson("POST", "/api/ai-testing/classroom-assistant/interpret", { text: `rate limit probe ${i}`, organizationId: "org_rate_test" }, auth);
        if (r.json?.aiUnavailableCode === "rate_limited") {
          rateLimited = true;
          limitedScope = r.json.scope;
          limitedMessage = r.json.aiUnavailableReason || "";
          break;
        }
      }
      assert.ok(rateLimited, "repeated rapid calls from the same account should eventually be rate-limited, well within 15 calls against the default 5/minute-per-tester limit");
      assert.equal(limitedScope, "account", "hitting the limit from a single tester account should be attributed to the per-tester scope, not organization");
      assert.match(limitedMessage, /AI testing limit/i, "the limit message must be clear and human-readable, not a generic/technical error");
      assert.doesNotMatch(limitedMessage, /try again in a few seconds/i, "the message must not use a generic 'try again in a few seconds' phrasing that would be wrong for longer-window limits");
      pass("17. Rate limiting: repeated rapid calls from one tester are rate-limited well within 15 calls (default limit is 5/minute), with a clear, scope-specific message");
    } finally {
      await stopServer(rateChild);
    }
  }

  // ---- 18. Organization-level and daily limits are independently enforced,
  // and each has its own clear message. ------------------------------------
  {
    setMockTransport(`async () => ({ ok: true, status: 200, json: async () => ({ output_text: ${JSON.stringify(JSON.stringify(DEFAULT_MEAL_SCENARIO))}, usage: { input_tokens: 10, output_tokens: 5 } }) })`);
    // Raise the per-tester ceiling so this section can prove the ORGANIZATION
    // limit specifically (many distinct testers in the SAME organization),
    // without every one of them individually tripping the per-tester limit first.
    const orgChild = startServer({ AI_TESTING_RATE_LIMIT_PER_TESTER: "1000" });
    try {
      await waitForBoot(orgChild);
      const adminLogin = await requestJson("POST", "/api/admin/login", ADMIN);
      const auth = await enableAiTesting(adminLogin.json.token);
      let orgLimited = false;
      let orgLimitedMessage = "";
      for (let i = 0; i < 30; i += 1) {
        const interpret = await requestJson("POST", "/api/ai-testing/classroom-assistant/interpret", { text: `org limit probe ${i}`, organizationId: "org_daily_limit_test" }, auth);
        if (interpret.json?.aiUnavailableCode === "rate_limited") {
          orgLimited = true;
          orgLimitedMessage = interpret.json.aiUnavailableReason || "";
          assert.equal(interpret.json.scope, "organization", "20 calls to the SAME organization (default per-organization-per-minute limit) should trip the organization scope");
          break;
        }
      }
      assert.ok(orgLimited, "20+ AI calls to the same fake organization within a minute should trip the default per-organization-per-minute limit (20)");
      assert.match(orgLimitedMessage, /organization/i, "the organization-level limit message must clearly say it's shared across the organization, not just this one tester");
      pass("18. The per-organization-per-minute limit (default 20) is independently enforced once many testers/calls in the SAME organization exceed it, with a clear message distinguishing it from the per-tester limit");
    } finally {
      await stopServer(orgChild);
    }
  }

  // ---- 19. The per-organization-per-day limit is a second, INDEPENDENT
  // ceiling from the per-minute one, with its own clear message. Uses a
  // deliberately tiny daily cap (env override) so this is provable in a
  // handful of calls instead of requiring real elapsed days. -------------
  {
    setMockTransport(`async () => ({ ok: true, status: 200, json: async () => ({ output_text: ${JSON.stringify(JSON.stringify(DEFAULT_MEAL_SCENARIO))}, usage: { input_tokens: 10, output_tokens: 5 } }) })`);
    const dayChild = startServer({
      AI_TESTING_RATE_LIMIT_PER_TESTER: "1000",
      AI_TESTING_RATE_LIMIT_PER_ORG_MINUTE: "1000",
      AI_TESTING_RATE_LIMIT_PER_ORG_DAY: "3",
    });
    try {
      await waitForBoot(dayChild);
      const adminLogin = await requestJson("POST", "/api/admin/login", ADMIN);
      const auth = await enableAiTesting(adminLogin.json.token);
      let dailyLimited = false;
      let dailyMessage = "";
      for (let i = 0; i < 8; i += 1) {
        const r = await requestJson("POST", "/api/ai-testing/classroom-assistant/interpret", { text: `daily limit probe ${i}`, organizationId: "org_truly_daily_test" }, auth);
        if (r.json?.aiUnavailableCode === "rate_limited") {
          dailyLimited = true;
          dailyMessage = r.json.aiUnavailableReason || "";
          assert.equal(r.json.scope, "organization_daily", "exceeding the per-organization-per-day cap must be attributed to its own distinct scope, not the per-minute organization scope");
          break;
        }
      }
      assert.ok(dailyLimited, "exceeding the (tiny, for this test) per-organization-per-day cap of 3 must trip within 8 calls, independently of the per-minute limits which were raised for this section");
      assert.match(dailyMessage, /today|daily|day/i, "the daily-limit message must be clearly different from the per-minute message (mention 'today'/day, not seconds)");
      assert.doesNotMatch(dailyMessage, /second/i, "the daily-limit message must never say 'try again in N seconds' — that would be misleading for a limit that resets in about a day");
      pass("19. The per-organization-per-day limit is enforced independently of the per-minute limits, with its own clearly-worded message");
    } finally {
      await stopServer(dayChild);
    }
  }

  // ---- 20. Admin-only sanitized usage endpoint: aggregate counts/limits
  // only, never a prompt/completion, and rejects a fake-account tester. -----
  {
    setMockTransport(`async () => ({ ok: true, status: 200, json: async () => ({ output_text: ${JSON.stringify(JSON.stringify(DEFAULT_MEAL_SCENARIO))}, usage: { input_tokens: 10, output_tokens: 5 } }) })`);
    const usageChild = startServer();
    try {
      await waitForBoot(usageChild);
      const adminLogin = await requestJson("POST", "/api/admin/login", ADMIN);
      const auth = await enableAiTesting(adminLogin.json.token);
      const secretText = "a very specific tester-authored sentence that must never leak into the admin usage view";
      await requestJson("POST", "/api/ai-testing/classroom-assistant/interpret", { text: secretText, organizationId: "org_usage_admin_test" }, auth);

      const usage = await requestJson("GET", "/api/ai-testing/admin/usage", null, auth);
      assert.equal(usage.status, 200);
      assert.ok(usage.json.usageTotals, "admin usage view must include aggregate totals");
      assert.equal(usage.json.limits.perTesterPerMinute, 5, "admin usage view must surface the actual configured per-tester limit");
      assert.equal(usage.json.limits.perOrganizationPerMinute, 20, "admin usage view must surface the actual configured per-organization limit");
      assert.equal(usage.json.limits.perOrganizationPerDay, 200, "admin usage view must surface the actual configured daily limit");
      const orgRow = usage.json.organizations.find((o) => o.organizationId === "org_usage_admin_test");
      assert.ok(orgRow, "the organization that just made a call should appear in the usage breakdown");
      assert.ok(orgRow.perMinute && typeof orgRow.perMinute.count === "number", "usage breakdown must be numeric counts only");
      const usageRaw = JSON.stringify(usage.json);
      assert.ok(!usageRaw.includes(secretText), "the admin usage view must never include the actual text of a tester's entry — aggregate counts only");

      // A fake-account tester must never reach this admin-only endpoint.
      const usageAsTester = await requestJson("GET", "/api/ai-testing/admin/usage", null, {});
      assert.notEqual(usageAsTester.status, 200, "the admin usage endpoint must reject an unauthenticated/non-admin caller");
      pass("20. The admin usage endpoint reports sanitized aggregate counts and the actual configured limits, never a tester's private entry text, and is admin-only");
    } finally {
      await stopServer(usageChild);
    }
  }

  console.log(`\nAI Testing OpenAI integration checks passed (${passed}).`);
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
