#!/usr/bin/env node
/**
 * Testing Feedback — thread creation, replies, isolation, private notes,
 * status/retest, unread counts, and production lock.
 *
 * Run: node scripts/test-testing-feedback.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 24100 + Math.floor(Math.random() * 300);
const STORE_PATH = path.join(os.tmpdir(), `llh-testing-feedback-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = { email: "tf-admin@example.invalid", password: "tf-admin-pass", code: "tf-admin-code" };

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

function startServer(envOverrides = {}) {
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }, null, 2));
  return spawnServer(envOverrides);
}

/** Restarts against the EXISTING store file, without resetting it — used to prove persistence across a restart. */
function restartServerKeepingStore(envOverrides = {}) {
  return spawnServer(envOverrides);
}

function spawnServer(envOverrides = {}) {
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
      LLH_GIT_SHA: "abc1234deadbeef",
      NODE_ENV: "test",
      ALLOW_TESTING_LAB_ADMIN_PREVIEW: "true",
      ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW: "true",
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

function assertStaticMarkers() {
  const modelJs = fs.readFileSync(path.join(ROOT, "scripts/testing-feedback-data-model.js"), "utf8");
  const apiJs = fs.readFileSync(path.join(ROOT, "server/testing-feedback-api.js"), "utf8");
  const flagsJs = fs.readFileSync(path.join(ROOT, "scripts/expansion-feature-flags.js"), "utf8");
  assert.match(modelJs, /function getThreadForTester/);
  assert.match(modelJs, /thread\.testerEmail !== safeLower\(testerEmail\)/);
  assert.match(apiJs, /function createTestingFeedbackApi/);
  assert.match(flagsJs, /TESTING_FEEDBACK: "testingFeedback"/);
  assert.match(flagsJs, /function evaluateTestingFeedbackAccess/);
  pass("static markers present: tester-scoped accessors and non-production-only gate exist");
}

async function issueAndLoginAccount(auth, account) {
  const issue = await requestJson("POST", "/api/testing-lab/accounts/issue-password", { accountId: account.id }, auth);
  assert.equal(issue.status, 200, `issue-password should succeed for ${account.kind} (${account.email})`);
  const password = issue.json.temporaryPassword;
  const login = await requestJson("POST", "/api/auth/password-login", { email: account.email, password });
  assert.equal(login.status, 200, `${account.kind} (${account.email}) should be able to log in`);
  return { account, memberAuth: { Authorization: `Bearer ${login.json.memberSessionToken}` } };
}

async function main() {
  assertStaticMarkers();

  // ---- 1. Production lock ------------------------------------------------
  {
    const child = startServer({ SITE_URL: "https://littlelearnershubbyleah.com" });
    try {
      await waitForBoot(child);
      const adminLogin = await requestJson("POST", "/api/admin/login", ADMIN);
      const auth = { Authorization: `Bearer ${adminLogin.json.token}` };
      const asAdmin = await requestJson("GET", "/api/testing-feedback/admin/threads", null, auth);
      assert.equal(asAdmin.status, 403);
      assert.equal(asAdmin.json.code, "feature_unavailable");
      assert.match(String(asAdmin.json.reason || ""), /production_locked/);
      pass("1. Production lock: Testing Feedback is unavailable on a production host even for a verified admin");
    } finally {
      await stopServer(child);
    }
  }

  const child = startServer();
  let threadId;
  try {
    await waitForBoot(child);
    const adminLogin = await requestJson("POST", "/api/admin/login", ADMIN);
    assert.equal(adminLogin.status, 200);
    const adminAuth = { Authorization: `Bearer ${adminLogin.json.token}` };

    // ---- 2. Unauthenticated rejection --------------------------------------
    {
      const anon = await requestJson("GET", "/api/testing-feedback/threads", null, {});
      assert.equal(anon.status, 403, "an unauthenticated request must be rejected outright, not silently return an empty list");
      pass("2. Unauthenticated requests are rejected outright (no admin token, no fake-account session)");
    }

    // Enable the flags a real testing session would enable before seeding.
    const siteContentGet = await requestJson("GET", `/api/admin/site-content?adminToken=${adminLogin.json.token}`);
    await requestJson("POST", "/api/admin/site-content", {
      adminToken: adminLogin.json.token,
      siteContent: { updatedAt: siteContentGet.json?.siteContent?.updatedAt || "", featureFlags: { directorCenter: true, testingLab: true } },
    });

    // Seed two DIFFERENT fake organizations so cross-tester/cross-org isolation is
    // meaningful. Seeding without an explicit organizationId always layers onto the
    // SAME shared "Preview"/"Phase" primary org (see testing-lab-fixtures.js's
    // ensurePhase18Preview and docs/PHASE_23_..._COMPLETION_REPORT.md Section 2), so
    // an explicit, distinct organizationId is passed for each seed call here.
    const ORG_A = "org_testfeedback_fake_a";
    const ORG_B = "org_testfeedback_fake_b";
    const seed1 = await requestJson("POST", "/api/testing-lab/seed", { scenario: "home_daycare", organizationId: ORG_A }, adminAuth);
    assert.equal(seed1.status, 200);
    // The dashboard's fakeAccounts list is scoped to the CURRENT testing-lab session's
    // organizationId (set by whichever /seed call ran most recently) — so each
    // organization's accounts must be captured right after that organization's own
    // seed call, not after seeding a second, different organization.
    const dashboardA = await requestJson("GET", "/api/testing-lab/dashboard", null, adminAuth);
    const accountsA = dashboardA.json?.fakeAccounts || dashboardA.json?.accounts || [];
    // Default fixture emails are per-KIND, not per-organization (e.g. every scenario's
    // "teacher" account defaults to the same phase18.teacher@example.invalid) — this is
    // the layered-fixture design docs/PHASE_23_..._COMPLETION_REPORT.md Section 2
    // describes, not a bug. For a real cross-tester/cross-org isolation check, pick two
    // DIFFERENT kinds (guaranteeing different emails) from the two different organizations.
    const accountA = accountsA.find((a) => a.organizationId === ORG_A && a.kind === "teacher");
    assert.ok(accountA, `expected a teacher fake account in ${ORG_A}`);

    const seed2 = await requestJson("POST", "/api/testing-lab/seed", { scenario: "small_center", organizationId: ORG_B }, adminAuth);
    assert.equal(seed2.status, 200);
    const dashboardB = await requestJson("GET", "/api/testing-lab/dashboard", null, adminAuth);
    const accountsB = dashboardB.json?.fakeAccounts || dashboardB.json?.accounts || [];
    const accountB = accountsB.find((a) => a.organizationId === ORG_B && a.kind === "substitute");
    assert.ok(accountB, `expected a substitute fake account in ${ORG_B}`);
    assert.notEqual(accountA.email.toLowerCase(), accountB.email.toLowerCase(), "the two testers used for isolation checks must have different emails, not just different account ids");

    const teacherA = await issueAndLoginAccount(adminAuth, accountA);
    const ownerB = await issueAndLoginAccount(adminAuth, accountB);
    assert.notEqual(teacherA.account.organizationId, ownerB.account.organizationId, "the two testers used for isolation checks must be in different fake organizations");

    // ---- 3. Tester creates a thread with full context ----------------------
    {
      const created = await requestJson("POST", "/api/testing-feedback/threads", {
        category: "bug",
        body: "The Classroom Assistant button did nothing when I clicked it on the meal screen.",
        context: { page: "classroom-assistant", device: "phone", role: "teacher" },
      }, teacherA.memberAuth);
      assert.equal(created.status, 201);
      assert.equal(created.json.thread.status, "open");
      assert.equal(created.json.thread.category, "bug");
      assert.equal(created.json.thread.context.page, "classroom-assistant");
      assert.equal(created.json.thread.context.device, "phone");
      assert.equal(created.json.thread.context.organizationId, teacherA.account.organizationId, "the thread's organizationId must be resolved server-side from the tester's own fake account, never trusted from the client");
      threadId = created.json.thread.id;
      pass("3. Tester can start a feedback thread with category + message + page/device/role context, resolved server-side");
    }

    // ---- 3b. Screenshot attachment (privacy-warning gated client-side) and
    // deployedCommit context are both captured and scoped correctly ---------
    {
      const tinyPngDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
      const created = await requestJson("POST", "/api/testing-feedback/threads", {
        category: "ai_result",
        body: "The AI Lesson Plan Assist gave me a plan for the wrong age group.",
        screenshotDataUrl: tinyPngDataUrl,
        context: { page: "ai-lesson-plan", device: "tablet", role: "teacher" },
      }, teacherA.memberAuth);
      assert.equal(created.status, 201);
      assert.equal(created.json.thread.context.deployedCommit, "abc1234deadbeef", "the server's own running commit SHA must be captured on the thread automatically, never trusted from the client");
      const detail = await requestJson("GET", `/api/testing-feedback/threads/${created.json.thread.id}`, null, teacherA.memberAuth);
      assert.equal(detail.status, 200);
      assert.equal(detail.json.messages[0].screenshotDataUrl, tinyPngDataUrl, "a valid, size-bounded image data URL must be preserved on the message");
      // Admin sees the same screenshot and commit — never stripped for admin, and never a secret.
      const adminDetail = await requestJson("GET", `/api/testing-feedback/admin/threads/${created.json.thread.id}`, null, adminAuth);
      assert.equal(adminDetail.status, 200);
      assert.equal(adminDetail.json.thread.context.deployedCommit, "abc1234deadbeef");
      assert.equal(adminDetail.json.messages[0].screenshotDataUrl, tinyPngDataUrl);

      // A non-image / malformed / oversized value must be silently dropped, never stored or trusted.
      const badShot = await requestJson("POST", "/api/testing-feedback/threads", {
        category: "other",
        body: "Testing a bad screenshot value.",
        screenshotDataUrl: `data:text/html;base64,${Buffer.from("<script>alert(1)</script>").toString("base64")}`,
      }, teacherA.memberAuth);
      assert.equal(badShot.status, 201);
      const badDetail = await requestJson("GET", `/api/testing-feedback/threads/${badShot.json.thread.id}`, null, teacherA.memberAuth);
      assert.equal(badDetail.json.messages[0].screenshotDataUrl, "", "a non-image data URL must never be stored as a screenshot");

      const oversizedShot = await requestJson("POST", "/api/testing-feedback/threads", {
        category: "other",
        body: "Testing an oversized screenshot value.",
        screenshotDataUrl: `data:image/png;base64,${"A".repeat(1_000_000)}`,
      }, teacherA.memberAuth);
      assert.equal(oversizedShot.status, 201);
      const oversizedDetail = await requestJson("GET", `/api/testing-feedback/threads/${oversizedShot.json.thread.id}`, null, teacherA.memberAuth);
      assert.equal(oversizedDetail.json.messages[0].screenshotDataUrl, "", "an oversized screenshot must never be stored");
      pass("3b. Screenshot attachments are captured and visible to both tester and admin when valid, silently rejected when malformed/oversized, and every thread automatically records the server's deployed commit SHA");
    }

    // ---- 4. Tester sees her own thread in her list --------------------------
    {
      const list = await requestJson("GET", "/api/testing-feedback/threads", null, teacherA.memberAuth);
      assert.equal(list.status, 200);
      assert.ok(list.json.threads.some((t) => t.id === threadId));
      pass("4. Tester's own thread list includes the thread she just created");
    }

    // ---- 5. A DIFFERENT tester cannot see or reach it (isolation) -----------
    {
      const otherList = await requestJson("GET", "/api/testing-feedback/threads", null, ownerB.memberAuth);
      assert.equal(otherList.status, 200);
      assert.ok(!otherList.json.threads.some((t) => t.id === threadId), "a different tester's thread list must never include another tester's thread");
      const otherGet = await requestJson("GET", `/api/testing-feedback/threads/${threadId}`, null, ownerB.memberAuth);
      assert.equal(otherGet.status, 404, "a different tester directly requesting another tester's thread by id must be denied, not shown");
      pass("5. Cross-tester and cross-organization isolation: a different tester's thread list and direct-by-id lookup both deny access to another tester's thread");
    }

    // ---- 6. Admin inbox sees every organization's threads ------------------
    {
      const adminThreads = await requestJson("GET", "/api/testing-feedback/admin/threads", null, adminAuth);
      assert.equal(adminThreads.status, 200);
      assert.ok(adminThreads.json.threads.some((t) => t.id === threadId));
      const adminDetail = await requestJson("GET", `/api/testing-feedback/admin/threads/${threadId}`, null, adminAuth);
      assert.equal(adminDetail.status, 200);
      assert.equal(adminDetail.json.thread.testerEmail, teacherA.account.email.toLowerCase());
      pass("6. Admin inbox sees the thread across organizations, with tester identity and full context visible");
    }

    // ---- 7. Admin replies; tester sees the reply and an unread flag --------
    {
      const reply = await requestJson("POST", `/api/testing-feedback/admin/threads/${threadId}/reply`, { body: "Thanks for the report — looking into it now." }, adminAuth);
      assert.equal(reply.status, 200);
      assert.equal(reply.json.thread.testerUnread, true, "a fresh admin reply must be flagged unread for the tester");
      const testerView = await requestJson("GET", `/api/testing-feedback/threads/${threadId}`, null, teacherA.memberAuth);
      assert.equal(testerView.status, 200);
      assert.ok(testerView.json.messages.some((m) => m.senderType === "admin" && m.body.includes("looking into it")), "the tester must see the admin's reply inside her own thread history");
      pass("7. Admin reply appears inside the tester's own thread and sets an unread flag for her");
    }

    // ---- 8. Tester marks read; unread count drops ---------------------------
    {
      const before = await requestJson("GET", "/api/testing-feedback/unread-count", null, teacherA.memberAuth);
      assert.ok(before.json.unreadCount >= 1);
      const markRead = await requestJson("POST", `/api/testing-feedback/threads/${threadId}/read`, {}, teacherA.memberAuth);
      assert.equal(markRead.status, 200);
      assert.equal(markRead.json.thread.testerUnread, false);
      const after = await requestJson("GET", "/api/testing-feedback/unread-count", null, teacherA.memberAuth);
      assert.equal(after.json.unreadCount, before.json.unreadCount - 1);
      pass("8. Tester marking a thread read clears its unread flag and decrements her unread count");
    }

    // ---- 9. Tester replies again; reopens + flags admin unread -------------
    {
      const status1 = await requestJson("POST", `/api/testing-feedback/admin/threads/${threadId}/status`, { status: "resolved" }, adminAuth);
      assert.equal(status1.json.thread.status, "resolved");
      const testerReply = await requestJson("POST", `/api/testing-feedback/threads/${threadId}/messages`, { body: "Still happening for me — retried twice." }, teacherA.memberAuth);
      assert.equal(testerReply.status, 200);
      assert.equal(testerReply.json.thread.status, "open", "a tester replying to a resolved thread must reopen it for admin attention");
      assert.equal(testerReply.json.thread.adminUnread, true);
      pass("9. A tester reply to a resolved thread reopens it and flags it unread for admin");
    }

    // ---- 10. Private admin notes are NEVER visible to the tester -----------
    {
      const note = await requestJson("POST", `/api/testing-feedback/admin/threads/${threadId}/notes`, { body: "Internal: this is the same bug as the offline-sync duplicate issue, low priority." }, adminAuth);
      assert.equal(note.status, 200);
      const testerView = await requestJson("GET", `/api/testing-feedback/threads/${threadId}`, null, teacherA.memberAuth);
      const testerBodies = testerView.json.messages.map((m) => m.body).join(" ");
      assert.ok(!testerBodies.includes("Internal:"), "a private admin note must never appear in the tester's own message history");
      const adminView = await requestJson("GET", `/api/testing-feedback/admin/threads/${threadId}`, null, adminAuth);
      assert.ok(adminView.json.notes.some((n) => n.body.includes("Internal:")), "the private note must be visible in the admin's own view of the thread");
      pass("10. Private admin notes are visible to the admin inbox but never returned to the tester");
    }

    // ---- 11. Retest requests surface to the tester as unread ---------------
    {
      const retest = await requestJson("POST", `/api/testing-feedback/admin/threads/${threadId}/retest`, { retestRequested: true }, adminAuth);
      assert.equal(retest.status, 200);
      assert.equal(retest.json.thread.retestRequested, true);
      assert.equal(retest.json.thread.testerUnread, true, "requesting a retest must surface as unread for the tester even without a new message");
      const testerView = await requestJson("GET", `/api/testing-feedback/threads/${threadId}`, null, teacherA.memberAuth);
      assert.equal(testerView.json.thread.retestRequested, true, "the tester must be able to see the retest request on her own thread");
      pass("11. Admin can request a retest; it is visible to the tester and flags the thread unread for her");
    }

    // ---- 12. Admin-only routes reject a fake-account tester -----------------
    {
      const testerAsAdmin = await requestJson("GET", "/api/testing-feedback/admin/threads", null, teacherA.memberAuth);
      assert.equal(testerAsAdmin.status, 401, "a fake-account tester session must never be able to use the admin inbox routes");
      pass("12. Admin-only inbox routes reject an authenticated fake-account tester (401, not the admin's data)");
    }

    // ---- 13. Real (non-fake) accounts cannot use tester routes either -------
    {
      const realSignup = await requestJson("POST", "/api/auth/signup", { email: "real-user-tf@example.com", password: "real-user-pass1" });
      const realAuth = realSignup.json?.memberSessionToken
        ? { Authorization: `Bearer ${realSignup.json.memberSessionToken}` }
        : { Authorization: "Bearer test:real-user-tf@example.com" };
      const realTry = await requestJson("GET", "/api/testing-feedback/threads", null, realAuth);
      assert.notEqual(realTry.status, 200, "a real (non @example.invalid) account must never be treated as an authenticated testing-feedback tester");
      pass("13. A real, non-fake account cannot use the tester feedback routes");
    }

    // ---- 14. Categories are normalized; unknown category falls back safely -
    {
      const weird = await requestJson("POST", "/api/testing-feedback/threads", { category: "not_a_real_category", body: "Just a suggestion for the layout." }, ownerB.memberAuth);
      assert.equal(weird.status, 201);
      assert.equal(weird.json.thread.category, "other", "an unrecognized category must fall back to 'other', never crash or silently drop the thread");
      pass("14. Unrecognized categories fall back safely to 'other' instead of failing");
    }

    pass("all testing feedback checks passed");
  } finally {
    await stopServer(child);
  }

  // ---- 15. Persistence: threads/messages survive a full server restart ----
  // (same local-json STORE_PATH, brand-new process — proves the data lives in
  // the store file, not just in one process's memory).
  {
    const restarted = restartServerKeepingStore();
    try {
      await waitForBoot(restarted);
      const adminLogin2 = await requestJson("POST", "/api/admin/login", ADMIN);
      const adminAuth2 = { Authorization: `Bearer ${adminLogin2.json.token}` };
      const reloaded = await requestJson("GET", "/api/testing-feedback/admin/threads", null, adminAuth2);
      assert.equal(reloaded.status, 200);
      assert.ok(reloaded.json.threads.length >= 2, "feedback threads created before the restart must still be present after a fresh server process boots against the same store file");
      const stillHasNote = await requestJson("GET", `/api/testing-feedback/admin/threads/${threadId}`, null, adminAuth2);
      assert.ok(stillHasNote.json.notes.some((n) => n.body.includes("Internal:")), "private notes must also survive a restart, not just tester-visible messages");
      assert.equal(stillHasNote.json.thread.retestRequested, true, "thread status/retest flags must also survive a restart");
      pass("15. Feedback threads, messages, private notes, and status/retest flags all survive a full server restart against the same local-json store file");
    } finally {
      await stopServer(restarted);
      try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
    }
  }

  console.log(`\nTesting Feedback checks passed (${passed}).`);
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
