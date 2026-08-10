#!/usr/bin/env node
/**
 * Cross-account / tenant-isolation + entitlement security matrix.
 * Disposable local-json fixtures only — never touches production data.
 *
 * Accounts:
 *  - Owner/Director A (Paid/Pro)
 *  - Owner/Director B (Paid/Pro)
 *  - Staff A (teacher linked to A)
 *  - Staff B (teacher linked to B)
 *  - Free account
 *  - Trial account
 *  - Paid account (alias of Owner A paid path also covered)
 *
 * Run: npm run test:cross-account-security-matrix
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 19200 + Math.floor(Math.random() * 180);
const STORE_PATH = path.join(os.tmpdir(), `llh-xacct-${crypto.randomBytes(4).toString("hex")}.json`);
const OUT = path.join("/opt/cursor/artifacts/prod-e2e-audit", "CROSS_ACCOUNT_SECURITY_MATRIX.json");
const PRO_LESSON = "cur-lp-xacct-pro-lesson";

const ACCOUNTS = {
  ownerA: { email: "owner-a@test.local", pass: "OwnerA-xacct-123!", plan: "Pro", role: "owner" },
  ownerB: { email: "owner-b@test.local", pass: "OwnerB-xacct-123!", plan: "Pro", role: "owner" },
  staffA: { email: "staff-a@test.local", pass: "StaffA-xacct-123!", plan: "Free", role: "teacher", link: "ownerA" },
  staffB: { email: "staff-b@test.local", pass: "StaffB-xacct-123!", plan: "Free", role: "teacher", link: "ownerB" },
  free: { email: "free-user@test.local", pass: "FreeUser-xacct-123!", plan: "Free", role: "owner" },
  trial: { email: "trial-user@test.local", pass: "TrialUser-xacct-123!", plan: "Pro", role: "owner", trial: true },
  paid: { email: "paid-user@test.local", pass: "PaidUser-xacct-123!", plan: "Pro", role: "owner" },
};

const results = [];
let passed = 0;
let failed = 0;

function hash(password) {
  return crypto.createHash("sha256").update(String(password || ""), "utf8").digest("hex");
}

function record(attack, expected, actual, pass) {
  const row = {
    attack,
    expected,
    actual,
    result: pass ? "PASS" : "FAIL",
  };
  results.push(row);
  if (pass) {
    passed += 1;
    console.log(`  PASS  ${attack}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${attack} — expected: ${expected} | actual: ${actual}`);
  }
  return pass;
}

function requestJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
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
}

function emptyChild() {
  return {
    Profiles: [],
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
}

function childPayload(name, id) {
  const data = emptyChild();
  data.Profiles = [{ id, name, ageGroup: "Preschool", createdAt: new Date().toISOString() }];
  data.Observations = [{ id: `obs-${id}`, childId: id, note: `${name} observation secret`, createdAt: new Date().toISOString() }];
  data.Documents = [{ id: `doc-${id}`, childId: id, title: `${name} document secret`, createdAt: new Date().toISOString() }];
  data.Reports = [{ id: `rep-${id}`, childId: id, summary: `${name} daily log secret`, createdAt: new Date().toISOString() }];
  return data;
}

function buildUsers() {
  const users = {};
  for (const [key, acct] of Object.entries(ACCOUNTS)) {
    const future = new Date(Date.now() + 30 * 86400000).toISOString();
    const row = {
      email: acct.email,
      plan: acct.plan,
      role: acct.role,
      programRole: acct.role,
      serverPasswordAuth: true,
      passwordHash: hash(acct.pass),
      mustChangePassword: false,
      subscriptionStatus: acct.plan === "Free" ? "Free Plan" : "Pro Monthly Subscription Active",
      stripeSubscriptionStatus: acct.plan === "Free" ? "" : "active",
      currentPeriodEnd: acct.plan === "Free" ? "" : future,
      accessEndsAt: acct.plan === "Free" ? "" : future,
    };
    if (acct.trial) {
      row.plan = "Pro";
      row.subscriptionStatus = "Pro Monthly Subscription trialing";
      row.stripeSubscriptionStatus = "trialing";
      row.trialStatus = "In Trial";
      row.trialEnd = new Date(Date.now() + 7 * 86400000).toISOString();
      row.trialStart = new Date().toISOString();
      row.trialStartedAt = new Date().toISOString();
      row.currentPeriodEnd = row.trialEnd;
      row.accessEndsAt = row.trialEnd;
    }
    if (acct.link) {
      row.linkedProgramOwnerEmail = ACCOUNTS[acct.link].email;
      row.programAccessViaOwner = true;
      row.plan = "Free";
      row.subscriptionStatus = "Free Plan";
      row.stripeSubscriptionStatus = "";
      row.currentPeriodEnd = "";
      row.accessEndsAt = "";
    }
    users[acct.email] = row;
  }
  return users;
}

function startServer() {
  const store = {
    users: buildUsers(),
    memberSessions: {},
    programs: {},
    programData: {},
    siteContent: {
      featureFlags: {
        teachingKitViewer: true,
        teachingKitPrintCenter: true,
        teachingKitAttachments: true,
      },
      curriculum: {
        lessonPlans: [
          {
            id: PRO_LESSON,
            title: "XAcct Pro Lesson",
            status: "published",
            plan: "Pro",
            ageGroup: "Preschool",
            theme: "Security",
            dailyPlans: {
              monday: { items: [{ title: "XAcct Pro Secret Activity", description: "Tenant entitlement secret body." }] },
              tuesday: { items: [{ title: "XAcct Day 2", description: "Day 2." }] },
              wednesday: { items: [{ title: "XAcct Day 3", description: "Day 3." }] },
              thursday: { items: [{ title: "XAcct Day 4", description: "Day 4." }] },
              friday: { items: [{ title: "XAcct Day 5", description: "Day 5." }] },
            },
          },
        ],
        activities: [],
        resources: [],
        updatedAt: new Date().toISOString(),
      },
      freeStarterLibrary: { lessonPlanIds: [] },
      updatedAt: new Date().toISOString(),
    },
    aiSettings: { masterEnabled: true, tools: {} },
    aiUsage: {},
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
      // Prod-equivalent Firebase-configured mode
      FIREBASE_API_KEY: "test-api-key",
      FIREBASE_AUTH_DOMAIN: "test.firebaseapp.com",
      FIREBASE_PROJECT_ID: "test-llh-project",
      FIREBASE_APP_ID: "1:123:web:abc",
      OPENAI_API_KEY: "",
      ADMIN_EMAIL: "admin-xacct@test.local",
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
    if (child.exitCode !== null) throw new Error(`Server exited: ${stderr.slice(-600)}`);
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`boot timeout ${stderr.slice(-600)}`);
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const t = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 3000);
    child.on("exit", () => {
      clearTimeout(t);
      resolve();
    });
  });
}

async function login(acct) {
  const res = await requestJson("POST", "/api/auth/password-login", { email: acct.email, password: acct.pass });
  assert.equal(res.status, 200, `login ${acct.email}: ${res.text}`);
  return {
    token: res.json.memberSessionToken,
    headers: { Authorization: `Bearer ${res.json.memberSessionToken}` },
    membership: res.json.membership || {},
  };
}

function namesFromChild(res) {
  return (res.json?.data?.Profiles || []).map((p) => p.name);
}

function secretsLeak(res, secret) {
  return new RegExp(secret, "i").test(JSON.stringify(res.json || {}));
}

async function main() {
  console.log(`Cross-account security matrix — port ${PORT}`);
  const child = startServer();
  try {
    await waitForBoot(child);

    const sessions = {};
    for (const [key, acct] of Object.entries(ACCOUNTS)) {
      sessions[key] = await login(acct);
      record(
        `Login ${key} (${acct.email})`,
        "200 + llh_member_* token",
        `status session=${Boolean(sessions[key].token?.startsWith("llh_member_"))}`,
        sessions[key].token?.startsWith("llh_member_"),
      );
    }

    // Seed program A / B child+schedule data
    const seedA = await requestJson("POST", "/api/child-data", { data: childPayload("ProgramA Child", "child-a") }, sessions.ownerA.headers);
    record("Owner A seeds child-data", "200", `status=${seedA.status}`, seedA.status === 200);
    const seedB = await requestJson("POST", "/api/child-data", { data: childPayload("ProgramB Child", "child-b") }, sessions.ownerB.headers);
    record("Owner B seeds child-data", "200", `status=${seedB.status}`, seedB.status === 200);

    const evtA = {
      id: "evt-owner-a",
      type: "reminder",
      title: "OwnerA Schedule Secret",
      startDate: "2026-08-10",
      endDate: "2026-08-10",
      weekStartDate: "2026-08-10",
      allDay: true,
      classroomId: "classroom-main",
    };
    const evtB = { ...evtA, id: "evt-owner-b", title: "OwnerB Schedule Secret" };
    const putA = await requestJson("PUT", "/api/schedule/items/evt-owner-a", evtA, sessions.ownerA.headers);
    const putB = await requestJson("PUT", "/api/schedule/items/evt-owner-b", evtB, sessions.ownerB.headers);
    record("Owner A writes schedule item", "200/201", `status=${putA.status}`, putA.status === 200 || putA.status === 201);
    record("Owner B writes schedule item", "200/201", `status=${putB.status}`, putB.status === 200 || putB.status === 201);

    // --- Tenant isolation Owner A vs B ---
    const getA = await requestJson("GET", "/api/child-data", null, sessions.ownerA.headers);
    const getB = await requestJson("GET", "/api/child-data", null, sessions.ownerB.headers);
    record(
      "Owner A cannot see Owner B child profiles",
      "no ProgramB Child",
      `names=${namesFromChild(getA).join(",")}`,
      getA.status === 200 && namesFromChild(getA).includes("ProgramA Child") && !namesFromChild(getA).includes("ProgramB Child"),
    );
    record(
      "Owner B cannot see Owner A child profiles",
      "no ProgramA Child",
      `names=${namesFromChild(getB).join(",")}`,
      getB.status === 200 && namesFromChild(getB).includes("ProgramB Child") && !namesFromChild(getB).includes("ProgramA Child"),
    );
    record(
      "Owner A cannot read Owner B observation secrets",
      "no leak",
      secretsLeak(getA, "ProgramB Child observation secret") ? "LEAK" : "clean",
      !secretsLeak(getA, "ProgramB Child observation secret"),
    );
    record(
      "Owner B cannot read Owner A document/daily-log secrets",
      "no leak",
      secretsLeak(getB, "ProgramA Child document secret") || secretsLeak(getB, "ProgramA Child daily log secret") ? "LEAK" : "clean",
      !secretsLeak(getB, "ProgramA Child document secret") && !secretsLeak(getB, "ProgramA Child daily log secret"),
    );
    record(
      "Distinct programIds for Owner A vs B",
      "different programId",
      `${getA.json?.programId} vs ${getB.json?.programId}`,
      getA.json?.programId && getB.json?.programId && getA.json.programId !== getB.json.programId,
    );

    // Spoof client-controlled identifiers
    const spoofProgram = await requestJson(
      "GET",
      `/api/child-data?programId=${encodeURIComponent(getB.json.programId)}`,
      null,
      sessions.ownerA.headers,
    );
    record(
      "Owner A query programId=B does not switch tenant",
      "still Program A only",
      `names=${namesFromChild(spoofProgram).join(",")}`,
      !namesFromChild(spoofProgram).includes("ProgramB Child"),
    );
    const spoofBody = await requestJson(
      "POST",
      "/api/child-data",
      {
        programId: getB.json.programId,
        ownerEmail: ACCOUNTS.ownerB.email,
        email: ACCOUNTS.ownerB.email,
        data: childPayload("Injected Into B", "child-inject"),
      },
      sessions.ownerA.headers,
    );
    const getBAfterInject = await requestJson("GET", "/api/child-data", null, sessions.ownerB.headers);
    record(
      "Owner A POST with body programId/ownerEmail of B cannot mutate B",
      "B unchanged / no Injected Into B",
      `status=${spoofBody.status}; B names=${namesFromChild(getBAfterInject).join(",")}`,
      !namesFromChild(getBAfterInject).includes("Injected Into B"),
    );
    // Spoof body writes to the authenticated actor's program (A), not B — restore A for later checks.
    const restoreA = await requestJson("POST", "/api/child-data", { data: childPayload("ProgramA Child", "child-a") }, sessions.ownerA.headers);
    record("Restore Owner A child-data after spoof-body write", "200", `status=${restoreA.status}`, restoreA.status === 200);

    const schedA = await requestJson("GET", "/api/schedule", null, sessions.ownerA.headers);
    const schedB = await requestJson("GET", "/api/schedule", null, sessions.ownerB.headers);
    const aHasB = (schedA.json?.items || []).some((i) => /OwnerB Schedule Secret/i.test(i.title || ""));
    const bHasA = (schedB.json?.items || []).some((i) => /OwnerA Schedule Secret/i.test(i.title || ""));
    record("Owner A schedule cannot see Owner B events", "no B secret", aHasB ? "LEAK" : "clean", !aHasB);
    record("Owner B schedule cannot see Owner A events", "no A secret", bHasA ? "LEAK" : "clean", !bHasA);

    // --- Staff membership ---
    const staffAChild = await requestJson("GET", "/api/child-data", null, sessions.staffA.headers);
    record(
      "Staff A can read Owner A program children",
      "ProgramA Child visible",
      `names=${namesFromChild(staffAChild).join(",")}`,
      staffAChild.status === 200 && namesFromChild(staffAChild).includes("ProgramA Child"),
    );
    record(
      "Staff A cannot read Owner B program children",
      "no ProgramB Child",
      `names=${namesFromChild(staffAChild).join(",")}`,
      !namesFromChild(staffAChild).includes("ProgramB Child"),
    );
    const staffBChild = await requestJson("GET", "/api/child-data", null, sessions.staffB.headers);
    record(
      "Staff B can read Owner B program children",
      "ProgramB Child visible",
      `names=${namesFromChild(staffBChild).join(",")}`,
      staffBChild.status === 200 && namesFromChild(staffBChild).includes("ProgramB Child"),
    );
    record(
      "Staff B cannot read Owner A program children",
      "no ProgramA Child",
      `names=${namesFromChild(staffBChild).join(",")}`,
      !namesFromChild(staffBChild).includes("ProgramA Child"),
    );

    // Staff A cannot impersonate Staff B / Owner B via headers
    const staffImpersonate = await requestJson("GET", "/api/child-data", null, {
      ...sessions.staffA.headers,
      "X-LLH-User-Email": ACCOUNTS.ownerB.email,
    });
    record(
      "Staff A + spoof X-LLH-User-Email Owner B still scoped to program A",
      "no ProgramB Child",
      `names=${namesFromChild(staffImpersonate).join(",")}`,
      !namesFromChild(staffImpersonate).includes("ProgramB Child"),
    );

    // --- AI quota / identity isolation ---
    const aiSpoof = await requestJson(
      "POST",
      "/api/ai-generate",
      {
        tool: "observation",
        prompt: "Child stacked three soft blocks carefully.",
        email: ACCOUNTS.ownerB.email,
      },
      sessions.ownerA.headers,
    );
    record(
      "AI: Owner A cannot spoof Owner B email for quota/access",
      "403 email_mismatch",
      `status=${aiSpoof.status} code=${aiSpoof.json?.code || ""}`,
      aiSpoof.status === 403 && aiSpoof.json?.code === "email_mismatch",
    );
    const usageB = await requestJson(
      "GET",
      `/api/user/ai-usage?email=${encodeURIComponent(ACCOUNTS.ownerB.email)}`,
      null,
      sessions.ownerA.headers,
    );
    record(
      "AI usage: Owner A cannot read Owner B usage via query email",
      "403",
      `status=${usageB.status}`,
      usageB.status === 403,
    );
    const usageA = await requestJson(
      "GET",
      `/api/user/ai-usage?email=${encodeURIComponent(ACCOUNTS.ownerA.email)}`,
      null,
      sessions.ownerA.headers,
    );
    record(
      "AI usage: Owner A can read own usage",
      "200",
      `status=${usageA.status}`,
      usageA.status === 200 && usageA.json?.aiUsage?.email === ACCOUNTS.ownerA.email,
    );

    // --- Entitlements Free / Trial / Paid (server-side) ---
    const freeTk = await requestJson(
      "GET",
      `/api/curriculum/lesson-plans/${PRO_LESSON}/teaching-kit`,
      null,
      sessions.free.headers,
    );
    const freeLeak = /XAcct Pro Secret Activity|Tenant entitlement secret/i.test(JSON.stringify(freeTk.json || {}))
      && freeTk.json?.teachingKit?.locked === false;
    record(
      "Free account cannot unlock Pro Teaching Kit full content",
      "locked/preview/403 — no secret body",
      `status=${freeTk.status} locked=${freeTk.json?.teachingKit?.locked}`,
      !freeLeak,
    );

    const freeDetail = await requestJson(
      "GET",
      `/api/curriculum/lesson-plans/${PRO_LESSON}`,
      null,
      {
        ...sessions.free.headers,
        // client plan spoof
      },
    );
    // Also try with body/query plan spoof on a POST-less GET via header-only; detail may accept ?plan=
    const freeDetailSpoof = await requestJson(
      "GET",
      `/api/curriculum/lesson-plans/${PRO_LESSON}?plan=Pro&email=${encodeURIComponent(ACCOUNTS.paid.email)}`,
      null,
      sessions.free.headers,
    );
    const freeDetailLeak = /XAcct Pro Secret Activity|Tenant entitlement secret/i.test(JSON.stringify(freeDetail.json || {}))
      && freeDetail.json?.locked === false;
    const freeSpoofLeak = /XAcct Pro Secret Activity|Tenant entitlement secret/i.test(JSON.stringify(freeDetailSpoof.json || {}))
      && freeDetailSpoof.json?.locked === false;
    record(
      "Free account Pro lesson detail locked server-side",
      "no full Pro secret",
      `status=${freeDetail.status}`,
      !freeDetailLeak,
    );
    record(
      "Free account cannot unlock Pro lesson via query plan/email spoof",
      "no full Pro secret",
      `status=${freeDetailSpoof.status}`,
      !freeSpoofLeak,
    );

    const trialTk = await requestJson(
      "GET",
      `/api/curriculum/lesson-plans/${PRO_LESSON}/teaching-kit`,
      null,
      sessions.trial.headers,
    );
    const trialUnlocked = trialTk.status === 200 && trialTk.json?.teachingKit?.locked === false
      && /XAcct Pro Secret Activity/i.test(JSON.stringify(trialTk.json || {}));
    record(
      "Trial account with Pro trial status can access Pro TK (server membership)",
      "unlocked Pro TK",
      `status=${trialTk.status} locked=${trialTk.json?.teachingKit?.locked}`,
      trialUnlocked,
    );

    const paidTk = await requestJson(
      "GET",
      `/api/curriculum/lesson-plans/${PRO_LESSON}/teaching-kit`,
      null,
      sessions.paid.headers,
    );
    record(
      "Paid account can access Pro TK",
      "unlocked",
      `status=${paidTk.status} locked=${paidTk.json?.teachingKit?.locked}`,
      paidTk.status === 200 && paidTk.json?.teachingKit?.locked === false,
    );

    // Staff inherit owner paid curriculum access
    const staffATk = await requestJson(
      "GET",
      `/api/curriculum/lesson-plans/${PRO_LESSON}/teaching-kit`,
      null,
      sessions.staffA.headers,
    );
    record(
      "Staff A inherits Owner A Pro curriculum access",
      "unlocked",
      `status=${staffATk.status} locked=${staffATk.json?.teachingKit?.locked}`,
      staffATk.status === 200 && staffATk.json?.teachingKit?.locked === false,
    );

    // Authn ≠ Authz: authenticated free still blocked from Pro
    record(
      "Authenticated Free is not automatically authorized for Pro TK",
      "still blocked",
      freeLeak ? "AUTHORIZED_WRONG" : "blocked",
      !freeLeak,
    );

    // Unauthenticated
    const anonChild = await requestJson("GET", "/api/child-data");
    record("Unauthenticated child-data blocked", "401/403", `status=${anonChild.status}`, anonChild.status === 401 || anonChild.status === 403);
    const anonAi = await requestJson("POST", "/api/ai-generate", {
      tool: "observation",
      prompt: "Child stacked three soft blocks carefully.",
      email: ACCOUNTS.paid.email,
    });
    record("Unauthenticated AI blocked", "401/403", `status=${anonAi.status}`, anonAi.status === 401 || anonAi.status === 403);

    // Invalid session
    const bad = await requestJson("GET", "/api/child-data", null, { Authorization: "Bearer llh_member_deadbeef" });
    record("Invalid/expired-like member token blocked for child-data", "401/403", `status=${bad.status}`, bad.status === 401 || bad.status === 403);

  } finally {
    await stopServer(child);
    try {
      fs.unlinkSync(STORE_PATH);
    } catch {
      /* ignore */
    }
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const report = {
    producedAt: new Date().toISOString(),
    mode: "local disposable Firebase-ready matrix",
    passed,
    failed,
    results,
  };
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(`\nMatrix: ${passed} PASS / ${failed} FAIL`);
  console.log(`Wrote ${OUT}`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error("\nFAIL", err?.stack || err);
  process.exit(1);
});
