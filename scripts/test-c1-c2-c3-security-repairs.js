#!/usr/bin/env node
/**
 * C1 / C2 / C3 security regression suite (local disposable store only).
 *
 * C1 — AI identity must come from authenticated session (not body.email).
 * C2 — Blank/whitespace documentation helpers must not fabricate.
 * C3 — child-data must accept the same validated member sessions as schedule,
 *       and Program A must not read/write Program B child data.
 *
 * Run: npm run test:c1-c2-c3-security-repairs
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 18700 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(os.tmpdir(), `llh-c123-${crypto.randomBytes(4).toString("hex")}.json`);

const OWNER_A = "owner-a@test.local";
const OWNER_B = "owner-b@test.local";
const PASS_A = "OwnerA-pass-123!";
const PASS_B = "OwnerB-pass-123!";

const aiAgeSafety = require("./ai-age-safety.js");

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password || ""), "utf8").digest("hex");
}

function requestJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined || body === null ? null : JSON.stringify(body);
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: {
          Accept: "application/json",
          ...(payload
            ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
            : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            json = { raw: text };
          }
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function testAuthHeaders(email) {
  return {
    Authorization: `Bearer test:${email}`,
    "X-LLH-User-Email": email,
  };
}

function startServer() {
  const store = {
    users: {
      [OWNER_A]: {
        email: OWNER_A,
        plan: "pro",
        subscriptionStatus: "active",
        role: "owner",
        programRole: "owner",
        serverPasswordAuth: true,
        passwordHash: hashPassword(PASS_A),
        mustChangePassword: false,
      },
      [OWNER_B]: {
        email: OWNER_B,
        plan: "pro",
        subscriptionStatus: "active",
        role: "owner",
        programRole: "owner",
        serverPasswordAuth: true,
        passwordHash: hashPassword(PASS_B),
        mustChangePassword: false,
      },
    },
    siteContent: {},
    adminSessions: {},
    memberSessions: {},
    scheduleByUser: {},
    childDataByUser: {},
    programs: {},
    programData: {},
    aiSettings: { masterEnabled: true, tools: {} },
  };
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      ALLOW_EMAIL_SCHEDULE_AUTH: "true",
      OPENAI_API_KEY: "", // auth/validation gates must fail closed without calling a model
      ADMIN_EMAIL: "admin-c123@test.local",
      ADMIN_PASSWORD: "admin-pass",
      ADMIN_ACCESS_CODE: "admin-code",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  let stderr = "";
  child.stderr.on("data", (d) => {
    stderr += d.toString();
  });
  for (let i = 0; i < 120; i += 1) {
    if (child.exitCode !== null) throw new Error(`Server exited early: ${stderr.slice(-800)}`);
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Server did not boot: ${stderr.slice(-800)}`);
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 3000);
    child.on("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function passwordLogin(email, password) {
  const res = await requestJson("POST", "/api/auth/password-login", { email, password });
  assert.equal(res.status, 200, `password-login failed for ${email}: ${res.text}`);
  assert.ok(res.json?.memberSessionToken, "memberSessionToken missing");
  return res.json.memberSessionToken;
}

function memberHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

async function runUnitDocumentationGates() {
  console.log("\nC2 unit: documentation blank / whitespace / valid gates");
  const blankDaily = aiAgeSafety.validateDocumentationInput
    ? aiAgeSafety.validateDocumentationInput("", { tool: "daily-log" })
    : aiAgeSafety.validateObservationInput("", { tool: "daily-log" });
  ok(!blankDaily.ok, "blank daily-log rejected at validator");

  const ws = aiAgeSafety.validateDocumentationInput
    ? aiAgeSafety.validateDocumentationInput("   \n\t  ", { tool: "parent-message" })
    : { ok: true };
  ok(!ws.ok, "whitespace-only parent-message rejected");

  const blankObs = aiAgeSafety.validateObservationInput("", { tool: "observation" });
  ok(!blankObs.ok && blankObs.code === "blank_observation", "blank observation still blank_observation");

  const validDaily = aiAgeSafety.validateDocumentationInput
    ? aiAgeSafety.validateDocumentationInput("Ate cheese sandwich and played with blocks after nap.", { tool: "daily" })
    : { ok: false };
  ok(validDaily.ok, "valid daily notes accepted");

  const validObs = aiAgeSafety.validateObservationInput("Stacked three jumbo blocks during free play.", {
    tool: "observation",
  });
  ok(validObs.ok, "valid observation accepted");
}

async function runC1(serverTokenA) {
  console.log("\nC1: AI authorization (session identity, no email spoof)");
  const prompt = "Child stacked three soft blocks carefully during free play.";

  const unauth = await requestJson("POST", "/api/ai-generate", {
    tool: "observation",
    prompt,
    email: "spoof-unauth@example.com",
    plan: "pro",
  });
  ok(unauth.status === 401 || unauth.status === 403, `unauthenticated AI blocked (got ${unauth.status})`);

  const spoof = await requestJson(
    "POST",
    "/api/ai-generate",
    {
      tool: "observation",
      prompt,
      email: OWNER_B,
      plan: "pro",
    },
    memberHeaders(serverTokenA),
  );
  ok(spoof.status === 401 || spoof.status === 403, `spoofed body.email blocked while session is A (got ${spoof.status})`);
  ok(!/used["']?\s*:\s*1/.test(JSON.stringify(spoof.json || {})), "spoof response must not grant fresh quota use");

  const mismatchTestBearer = await requestJson(
    "POST",
    "/api/ai-generate",
    {
      tool: "observation",
      prompt,
      email: OWNER_B,
    },
    testAuthHeaders(OWNER_A),
  );
  ok(
    mismatchTestBearer.status === 401 || mismatchTestBearer.status === 403,
    `test-bearer A + body.email B blocked (got ${mismatchTestBearer.status})`,
  );

  // Authenticated blank still rejected (auth ok, validation fails) — proves session accepted.
  const authedBlank = await requestJson(
    "POST",
    "/api/ai-generate",
    { tool: "observation", prompt: "", email: OWNER_A },
    memberHeaders(serverTokenA),
  );
  ok(authedBlank.status === 400, `authed blank observation 400 (got ${authedBlank.status})`);
  ok(/blank_observation|actually did/i.test(authedBlank.json?.error || ""), "authed blank uses observation gate");

  // Client must send Authorization on AI generate (static marker).
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  ok(/generateToolOutputWithBackend[\s\S]{0,1200}firebaseAuthHeaders/.test(appJs), "client AI generate sends firebaseAuthHeaders");
}

async function runC2(serverTokenA) {
  console.log("\nC2: blank documentation helpers rejected (HTTP)");
  for (const tool of ["daily-log", "daily", "parent-message", "incident", "behavior"]) {
    const blank = await requestJson(
      "POST",
      "/api/ai-generate",
      { tool, prompt: "", email: OWNER_A },
      memberHeaders(serverTokenA),
    );
    ok(blank.status === 400, `${tool} blank → 400 (got ${blank.status})`);
    ok(
      /blank|notes|invent|actually did|not invent/i.test(blank.json?.error || ""),
      `${tool} blank error explains rejection`,
    );
    ok(blank.status !== 200, `${tool} blank must not return 200`);
  }

  const whitespace = await requestJson(
    "POST",
    "/api/ai-generate",
    { tool: "daily-log", prompt: " \n\t ", email: OWNER_A },
    memberHeaders(serverTokenA),
  );
  ok(whitespace.status === 400, `daily-log whitespace → 400 (got ${whitespace.status})`);

  const bypassType = await requestJson(
    "POST",
    "/api/ai-generate",
    { type: "observation", prompt: "", email: OWNER_A },
    memberHeaders(serverTokenA),
  );
  ok(bypassType.status === 400, `type=observation without tool blank → 400 (got ${bypassType.status})`);

  const unknownBlank = await requestJson(
    "POST",
    "/api/ai-generate",
    { tool: "unknown", prompt: "", email: OWNER_A },
    memberHeaders(serverTokenA),
  );
  ok(unknownBlank.status === 400, `tool=unknown blank → 400 (got ${unknownBlank.status})`);
}

async function runC3SourceGuards() {
  console.log("\nC3 source: shared identity path");
  const serverSrc = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  ok(
    /async function resolveChildDataIdentity\(request\)\s*\{[\s\S]*?return resolveScheduleIdentity\(request\);/.test(serverSrc),
    "resolveChildDataIdentity delegates to resolveScheduleIdentity",
  );
  ok(
    !/resolveChildDataIdentity[\s\S]{0,400}throw error/.test(
      serverSrc.slice(serverSrc.indexOf("async function resolveChildDataIdentity")),
    ),
    "resolveChildDataIdentity no longer rethrows Firebase verify failures before member-session fallback",
  );
}

async function runC3FirebaseReadyMemberSession() {
  console.log("\nC3: member session works when Firebase env is configured (prod-equivalent)");
  const storePath = path.join(os.tmpdir(), `llh-c123-fb-${crypto.randomBytes(4).toString("hex")}.json`);
  const port = PORT + 17;
  const store = {
    users: {
      [OWNER_A]: {
        email: OWNER_A,
        plan: "pro",
        subscriptionStatus: "active",
        role: "owner",
        serverPasswordAuth: true,
        passwordHash: hashPassword(PASS_A),
        mustChangePassword: false,
      },
    },
    memberSessions: {},
    programs: {},
    programData: {},
    siteContent: {},
    aiSettings: { masterEnabled: true, tools: {} },
  };
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      SITE_URL: `http://127.0.0.1:${port}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: storePath,
      NODE_ENV: "test",
      // Simulate production Firebase-configured mode (certs won't verify fake JWTs).
      FIREBASE_API_KEY: "test-api-key",
      FIREBASE_AUTH_DOMAIN: "test.firebaseapp.com",
      FIREBASE_PROJECT_ID: "test-llh-project",
      FIREBASE_APP_ID: "1:123:web:abc",
      OPENAI_API_KEY: "",
      ADMIN_EMAIL: "admin-c123@test.local",
      ADMIN_PASSWORD: "admin-pass",
      ADMIN_ACCESS_CODE: "admin-code",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const requestFb = (method, urlPath, body, headers = {}) =>
    new Promise((resolve, reject) => {
      const payload = body == null ? null : JSON.stringify(body);
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path: urlPath,
          method,
          headers: {
            Accept: "application/json",
            ...(payload
              ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
              : {}),
            ...headers,
          },
        },
        (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            let json = null;
            try {
              json = text ? JSON.parse(text) : null;
            } catch {
              json = { raw: text };
            }
            resolve({ status: res.statusCode, json, text });
          });
        },
      );
      req.on("error", reject);
      if (payload) req.write(payload);
      req.end();
    });

  try {
    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    for (let i = 0; i < 120; i += 1) {
      if (child.exitCode !== null) throw new Error(`FB-ready server exited: ${stderr.slice(-500)}`);
      try {
        const health = await requestFb("GET", "/api/health");
        if (health.status === 200) break;
      } catch {
        /* retry */
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    const login = await requestFb("POST", "/api/auth/password-login", { email: OWNER_A, password: PASS_A });
    ok(login.status === 200 && login.json?.memberSessionToken, "password-login under Firebase-ready env");
    const token = login.json.memberSessionToken;

    const getChild = await requestFb("GET", "/api/child-data", null, { Authorization: `Bearer ${token}` });
    ok(getChild.status === 200, `memberSession child-data GET when Firebase ready (got ${getChild.status})`);

    const getSched = await requestFb("GET", "/api/schedule", null, { Authorization: `Bearer ${token}` });
    ok(getSched.status === 200, `memberSession schedule GET when Firebase ready (got ${getSched.status})`);

    // Fake JWT-shaped bearer must not unlock child-data.
    const fakeJwt = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ4In0.sig";
    const badJwt = await requestFb("GET", "/api/child-data", null, { Authorization: `Bearer ${fakeJwt}` });
    ok(badJwt.status === 401 || badJwt.status === 403, `fake JWT blocked when Firebase ready (${badJwt.status})`);
  } finally {
    await stopServer(child);
    try {
      fs.unlinkSync(storePath);
    } catch {
      /* ignore */
    }
  }
}

async function runC3(tokenA, tokenB) {
  console.log("\nC3: child-data auth + cross-program isolation");
  await runC3SourceGuards();

  const childA = {
    Profiles: [{ id: "child-a1", name: "ProgramA Child", ageGroup: "Preschool", createdAt: new Date().toISOString() }],
    Observations: [],
    SupportPlans: [],
    Goals: [],
    Attendance: [],
    Meals: [],
    Naps: [],
    Diapers: [],
    ActivityLogs: [],
    Photos: [],
    Reports: [],
    Communications: [],
    Documents: [],
  };
  const childB = {
    Profiles: [{ id: "child-b1", name: "ProgramB Child", ageGroup: "Toddler", createdAt: new Date().toISOString() }],
    Observations: [],
    SupportPlans: [],
    Goals: [],
    Attendance: [],
    Meals: [],
    Naps: [],
    Diapers: [],
    ActivityLogs: [],
    Photos: [],
    Reports: [],
    Communications: [],
    Documents: [],
  };

  const noAuth = await requestJson("GET", "/api/child-data");
  ok(noAuth.status === 401 || noAuth.status === 403, `child-data without auth blocked (${noAuth.status})`);

  const postA = await requestJson("POST", "/api/child-data", { data: childA }, memberHeaders(tokenA));
  ok(postA.status === 200, `memberSession A can POST child-data (got ${postA.status})`);

  const getA = await requestJson("GET", "/api/child-data", null, memberHeaders(tokenA));
  ok(getA.status === 200, `memberSession A can GET child-data (got ${getA.status})`);
  const namesA = (getA.json?.data?.Profiles || []).map((p) => p.name);
  ok(namesA.includes("ProgramA Child"), "Program A sees own child");

  const postB = await requestJson("POST", "/api/child-data", { data: childB }, memberHeaders(tokenB));
  ok(postB.status === 200, `memberSession B can POST child-data (got ${postB.status})`);

  const getB = await requestJson("GET", "/api/child-data", null, memberHeaders(tokenB));
  ok(getB.status === 200, `memberSession B can GET child-data (got ${getB.status})`);
  const namesB = (getB.json?.data?.Profiles || []).map((p) => p.name);
  ok(namesB.includes("ProgramB Child"), "Program B sees own child");
  ok(!namesB.includes("ProgramA Child"), "Program B cannot see Program A child");

  const getA2 = await requestJson("GET", "/api/child-data", null, memberHeaders(tokenA));
  const namesA2 = (getA2.json?.data?.Profiles || []).map((p) => p.name);
  ok(!namesA2.includes("ProgramB Child"), "Program A cannot see Program B child");
  ok(getA2.json?.programId && getB.json?.programId && getA2.json.programId !== getB.json.programId, "distinct programIds");

  // Schedule still works with member session (shared identity path).
  const schedA = await requestJson("GET", "/api/schedule", null, memberHeaders(tokenA));
  ok(schedA.status === 200, `memberSession A can GET schedule (got ${schedA.status})`);

  // Garbage bearer must not authorize child-data.
  const garbage = await requestJson("GET", "/api/child-data", null, {
    Authorization: "Bearer totally-not-a-valid-token",
  });
  ok(garbage.status === 401 || garbage.status === 403, `garbage bearer blocked (${garbage.status})`);
}

async function main() {
  console.log(`C1/C2/C3 security repairs — port ${PORT}`);

  const child = startServer();
  try {
    await waitForBoot(child);
    const tokenA = await passwordLogin(OWNER_A, PASS_A);
    const tokenB = await passwordLogin(OWNER_B, PASS_B);
    ok(tokenA.startsWith("llh_member_"), "token A is member session");
    ok(tokenB.startsWith("llh_member_"), "token B is member session");
    ok(tokenA !== tokenB, "distinct member sessions");

    // Sequential: C1 → C2 → C3 (fail-fast per phase via assertions)
    await runC1(tokenA);
    await runUnitDocumentationGates();
    await runC2(tokenA);
    await runC3(tokenA, tokenB);
    await runC3FirebaseReadyMemberSession();

    console.log(`\nAll ${passed} C1/C2/C3 security assertions passed.`);
  } finally {
    await stopServer(child);
    try {
      fs.unlinkSync(STORE_PATH);
    } catch {
      /* ignore */
    }
  }
}

main().catch((err) => {
  console.error("\nFAIL", err?.stack || err);
  process.exit(1);
});
