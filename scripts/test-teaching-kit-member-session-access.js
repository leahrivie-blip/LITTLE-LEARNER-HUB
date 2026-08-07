/**
 * Teaching Kit + curriculum access via server-minted member sessions (llh_member_*).
 * Ensures password-login / recovery auth unlocks Pro kits the same as Firebase.
 * Run: npm run test:teaching-kit-member-session-access
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 4300 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-tk-member-session-${process.pid}.json`);
const ADMIN = {
  email: "tk-member-admin@example.com",
  password: "admin-pass-123",
  code: "admin-code-123",
};
const PRO_EMAIL = "tk-member-pro@example.com";
const PRO_PASSWORD = "ProMemberPass1!";
const FREE_STARTER_ID = "cur-lp-preschool-farm-animals";
const PRO_PLAN_ID = "cur-lp-tk-member-pro-week";

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password), "utf8").digest("hex");
}

function seedStore() {
  const now = new Date().toISOString();
  const future = new Date(Date.now() + 14 * 86400000).toISOString();
  return {
    users: {
      [PRO_EMAIL]: {
        email: PRO_EMAIL,
        plan: "Pro",
        subscriptionStatus: "active",
        stripeSubscriptionStatus: "active",
        currentAccess: "pro",
        serverPasswordAuth: true,
        passwordHash: hashPassword(PRO_PASSWORD),
        mustChangePassword: false,
        createdAt: now,
        updatedAt: now,
        accessEndsAt: future,
        currentPeriodEnd: future,
      },
    },
    siteContent: {
      updatedAt: now,
      featureFlags: {
        playBasedCurriculum: true,
        teachingKitViewer: true,
        teachingKitPrintCenter: true,
        teachingKitAttachments: false,
      },
      curriculum: {
        lessonPlans: [
          {
            id: FREE_STARTER_ID,
            title: "Farm Animals",
            age: "Preschool",
            theme: "Animals",
            plan: "Free",
            status: "published",
            weeklyOverview: "Free starter week",
            objectives: ["Explore farm animals"],
            dailyPlans: { Monday: { items: [{ title: "Animal sounds" }] } },
          },
          {
            id: PRO_PLAN_ID,
            title: "Member Session Pro Week",
            age: "Preschool",
            theme: "Access",
            plan: "Pro",
            status: "published",
            weeklyOverview: "Pro secret overview",
            objectives: ["SECRET_OBJ"],
            dailyPlans: { Monday: { items: [{ title: "SECRET_ACT" }] } },
          },
        ],
        activities: [],
        resources: [],
        updatedAt: now,
      },
      freePlanAccess: {
        enabled: true,
        curatedCutoffAt: "2026-07-18T00:00:00.000Z",
      },
    },
    foundingMembers: [],
    adminSessions: {},
    memberSessions: {},
  };
}

function startServer() {
  fs.writeFileSync(STORE_PATH, JSON.stringify(seedStore(), null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      OPENAI_API_KEY: "",
      STRIPE_SECRET_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function request(method, pathname, body, headers = {}) {
  const res = await fetch(`http://127.0.0.1:${PORT}${pathname}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  return { status: res.status, json, text };
}

async function waitForBoot(child) {
  for (let i = 0; i < 120; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const res = await request("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Server failed to boot");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 3000);
    child.on("exit", () => { clearTimeout(timer); resolve(); });
  });
}

async function main() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert.match(appJs, /readMemberSessionToken\(\)/);
  assert.match(appJs, /Prefer a live Firebase ID token/);
  assert.match(appJs, /async function trialExportAuthHeaders/);

  const child = startServer();
  try {
    await waitForBoot(child);

    const login = await request("POST", "/api/auth/password-login", {
      email: PRO_EMAIL,
      password: PRO_PASSWORD,
    });
    assert.equal(login.status, 200, login.text?.slice?.(0, 200));
    assert.ok(login.json?.memberSessionToken?.startsWith("llh_member_"));
    assert.equal(login.json?.membership?.hasProAccess, true);
    const memberAuth = { Authorization: `Bearer ${login.json.memberSessionToken}` };

    // Spoof headers must NOT grant Pro when using an anonymous/mismatched request —
    // production rejects x-llh-user-email; here NODE_ENV=test allows header identity,
    // so we only assert member-session Bearer unlocks without needing the email header.
    const proKit = await request(
      "GET",
      `/api/curriculum/lesson-plans/${encodeURIComponent(PRO_PLAN_ID)}/teaching-kit?day=monday`,
      null,
      memberAuth,
    );
    assert.equal(proKit.status, 200, proKit.text?.slice?.(0, 300));
    assert.equal(proKit.json?.teachingKit?.locked, false);
    assert.ok(proKit.json?.teachingKit?.companion, "member session must receive companion");

    const proDetail = await request(
      "GET",
      `/api/curriculum/lesson-plans/${encodeURIComponent(PRO_PLAN_ID)}`,
      null,
      memberAuth,
    );
    assert.equal(proDetail.status, 200);
    assert.equal(proDetail.json?.lessonPlan?.locked, false);

    const printAuth = await request("POST", "/api/trial-curriculum-exports/authorize", {
      idempotencyKey: `member-pro-print-${Date.now()}`,
      resourceType: "lesson-plan",
      resourceId: PRO_PLAN_ID,
      action: "print",
    }, memberAuth);
    assert.equal(printAuth.status, 200, printAuth.text?.slice?.(0, 200));
    assert.equal(printAuth.json?.allowed, true);
    assert.equal(printAuth.json?.unlimited, true);
    assert.equal(printAuth.json?.watermark || "", "");

    // Random Bearer must not unlock Pro kits.
    const fake = await request(
      "GET",
      `/api/curriculum/lesson-plans/${encodeURIComponent(PRO_PLAN_ID)}/teaching-kit`,
      null,
      { Authorization: "Bearer llh_member_notarealsessiontoken000000000000000000" },
    );
    assert.equal(fake.status, 200);
    assert.equal(fake.json?.teachingKit?.locked, true);
    assert.equal(fake.json?.teachingKit?.companion, null);

    console.log("PASS teaching-kit-member-session-access");
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
