#!/usr/bin/env node
/**
 * Home Daycare Pilot — hired staff member must never receive owner powers.
 *
 * Verifies BOTH layers:
 *  - Server-side: /api/pilot/* rejects staff for Families/Billing/adding
 *    another staff member/change-requests, even if she calls the API
 *    directly (never trusts the client's nav to enforce this).
 *  - Client-side: the staff sidebar never renders Families/Billing/Staff/
 *    Program Settings links, and Admin/Testing Lab/AI Outcomes/feature
 *    flags remain completely unreachable (she never has an admin token).
 *
 * Run: node scripts/test-home-daycare-staff-restrictions.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  chromium = null;
}

const ROOT = path.join(__dirname, "..");
const { resolveTestPort } = require("./test-port.js");
const PORT = resolveTestPort(27500, 300);
const STORE_PATH = path.join(os.tmpdir(), `llh-staff-restrictions-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = { email: "staffrestrict-admin@example.invalid", password: "staffrestrict-pass", code: "staffrestrict-code" };

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

function startServer() {
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
      ALLOW_TESTING_LAB_ADMIN_PREVIEW: "true",
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

async function main() {
  const child = startServer();
  let browser;
  try {
    await waitForBoot(child);
    const adminLogin = await requestJson("POST", "/api/admin/login", ADMIN);
    const adminAuth = { Authorization: `Bearer ${adminLogin.json.token}` };
    const siteContentGet = await requestJson("GET", `/api/admin/site-content?adminToken=${adminLogin.json.token}`);
    await requestJson("POST", "/api/admin/site-content", {
      adminToken: adminLogin.json.token,
      siteContent: { updatedAt: siteContentGet.json?.siteContent?.updatedAt || "", featureFlags: { testingLab: true, testingFeedback: true } },
    });

    const ownerEmail = "staffrestrict.owner@example.invalid";
    const staffEmail = "staffrestrict.staff@example.invalid";
    const wizard = await requestJson("POST", "/api/external-tester/create-pilot", { testerName: "Staff Restrictions Owner", email: ownerEmail, childCount: 1 }, adminAuth);
    const ownerPassword = wizard.json.temporaryPassword;
    const orgId = wizard.json.organizationId;

    const ownerLogin = await requestJson("POST", "/api/auth/password-login", { email: ownerEmail, password: ownerPassword });
    const ownerAuth = { Authorization: `Bearer ${ownerLogin.json.memberSessionToken}` };
    assert.equal(ownerLogin.json.organizationId, orgId, "the owner's login response must include organizationId so the client can recognize a connected testing account");
    pass("Setup: owner login response includes organizationId (required for the client to recognize a connected testing account)");

    const addStaff = await requestJson("POST", "/api/pilot/staff", { displayName: "Staff Restrictions Staff", email: staffEmail }, ownerAuth);
    assert.equal(addStaff.status, 200);
    const staffPassword = addStaff.json.temporaryPassword;
    pass("Setup: owner self-service adds one staff member");

    const secondStaffAttempt = await requestJson("POST", "/api/pilot/staff", { displayName: "Second Staff", email: "staffrestrict.second@example.invalid" }, ownerAuth);
    assert.equal(secondStaffAttempt.status, 409, "a Home Daycare Pilot organization may only have ONE optional staff member");
    pass("1. Owner cannot add a SECOND staff member — the plan is owner + one optional assistant only");

    const staffLogin = await requestJson("POST", "/api/auth/password-login", { email: staffEmail, password: staffPassword });
    const staffAuth = { Authorization: `Bearer ${staffLogin.json.memberSessionToken}` };
    assert.equal(staffLogin.json.role, "assistant");
    assert.equal(staffLogin.json.organizationId, orgId);
    pass("2. Staff logs in with her own real login and is recognized as an 'assistant' in the same organization");

    // ---- Server-side: staff CAN do daily work ---------------------------
    const staffChildren = await requestJson("GET", "/api/pilot/children", null, staffAuth);
    assert.equal(staffChildren.status, 200);
    assert.ok(staffChildren.json.children.length >= 1, "staff must see the shared child roster for daily work");
    pass("3. Staff CAN view the shared child roster (needed for Daily Care)");

    const staffMessages = await requestJson("GET", "/api/pilot/messages", null, staffAuth);
    assert.equal(staffMessages.status, 200);
    pass("4. Staff CAN view Messages (needed for daily work)");

    // ---- Server-side: staff CANNOT do owner-only actions -----------------
    const staffGuardiansGet = await requestJson("GET", "/api/pilot/guardians", null, staffAuth);
    assert.equal(staffGuardiansGet.status, 403, "staff must never see the Families/guardian list");
    pass("5. Staff CANNOT view Families/guardians (server-side 403, even calling the API directly)");

    const staffGuardianAdd = await requestJson("POST", "/api/pilot/guardians", { displayName: "Sneaky Guardian", email: "sneaky@example.invalid", childId: staffChildren.json.children[0].id }, staffAuth);
    assert.equal(staffGuardianAdd.status, 403, "staff must never be able to add a guardian");
    pass("6. Staff CANNOT add a guardian (server-side 403)");

    const staffBillingGet = await requestJson("GET", "/api/pilot/billing", null, staffAuth);
    assert.equal(staffBillingGet.status, 403, "staff must never see program billing / family balances");
    pass("7. Staff CANNOT view Billing (server-side 403 — 'program billing configuration')");

    const staffBillingAdd = await requestJson("POST", "/api/pilot/billing", { childId: staffChildren.json.children[0].id, description: "Sneaky invoice", amountCents: 1000 }, staffAuth);
    assert.equal(staffBillingAdd.status, 403, "staff must never be able to add a billing record");
    pass("8. Staff CANNOT add a billing record (server-side 403)");

    const staffAddAnotherStaff = await requestJson("POST", "/api/pilot/staff", { displayName: "Sneaky Second Staff", email: "sneaky.staff@example.invalid" }, staffAuth);
    assert.equal(staffAddAnotherStaff.status, 403, "staff must never be able to hire another staff member — that is owner-only");
    pass("9. Staff CANNOT add another staff member (server-side 403 — owner-only)");

    const staffChangeRequestsList = await requestJson("GET", "/api/pilot/change-request", null, staffAuth);
    assert.equal(staffChangeRequestsList.status, 403, "staff must never see parent change requests — owner-only");
    pass("10. Staff CANNOT view parent change requests (server-side 403 — owner-only)");

    // "Other staff's private records": staff's own /api/pilot/staff listing shows only herself.
    const staffOwnStaffList = await requestJson("GET", "/api/pilot/staff", null, staffAuth);
    assert.equal(staffOwnStaffList.status, 200);
    assert.equal(staffOwnStaffList.json.staff.length, 1);
    assert.equal(staffOwnStaffList.json.staff[0].email, staffEmail);
    pass("11. Staff's own staff-list view shows ONLY her own profile row, never another staff member's private record");

    // ---- Admin/Testing Lab/AI Outcomes/feature flags: structurally unreachable ----
    const staffAdminAttempt = await requestJson("GET", "/api/admin/site-content", null, staffAuth);
    assert.notEqual(staffAdminAttempt.status, 200, "a member session token must never satisfy an admin-only endpoint");
    pass("12. Staff's member session token cannot access Admin endpoints (structurally separate from an admin token)");

    const staffTestingLabAttempt = await requestJson("GET", "/api/testing-lab/admin/threads", null, staffAuth);
    assert.notEqual(staffTestingLabAttempt.status, 200, "a member session token must never satisfy a Testing Lab admin endpoint");
    pass("13. Staff's member session token cannot access Testing Lab admin endpoints");

    if (!chromium) {
      console.log("Playwright unavailable — skipping client-side nav checks.");
    } else {
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
      await page.evaluate(() => openAuthModal("login"));
      await page.waitForTimeout(300);
      await page.fill("#emailInput", staffEmail);
      await page.fill("#passwordInput", staffPassword);
      await page.click("#authSubmitButton");
      await page.waitForTimeout(1500);

      const navState = await page.evaluate(() => ({
        staffNavShown: Boolean(document.querySelector("#pilotStaffNav")?.offsetParent),
        ownerNavHidden: !document.querySelector("#pilotProviderNav")?.offsetParent,
        familiesLinkAbsent: !document.querySelector('#pilotStaffNav [data-view="pilot-families"]'),
        billingLinkAbsent: !document.querySelector('#pilotStaffNav [data-view="pilot-billing"]'),
        staffManagementLinkAbsent: !document.querySelector('#pilotStaffNav [data-view="pilot-staff"][data-pilot-staff-nav]'),
        programSettingsLinkAbsent: !document.querySelector('#pilotStaffNav [data-view="settings"]')
          || document.querySelector('#pilotStaffNav [data-view="settings"]')?.textContent.includes("Account Settings"),
        adminNavHidden: !document.querySelector('.nav-link[data-view="admin"]')?.offsetParent,
        testingLabNavHidden: !document.querySelector('.nav-link[data-view="testing-lab"]')?.offsetParent,
      }));
      assert.deepEqual(navState, {
        staffNavShown: true,
        ownerNavHidden: true,
        familiesLinkAbsent: true,
        billingLinkAbsent: true,
        staffManagementLinkAbsent: true,
        programSettingsLinkAbsent: true,
        adminNavHidden: true,
        testingLabNavHidden: true,
      }, "the staff sidebar must never render Families/Billing/staff-management/Program Settings/Admin/Testing Lab links");
      pass("14. Staff's sidebar (client-side) never renders Families, Billing, staff-management, or full Program Settings links — Admin and Testing Lab remain hidden");

      await page.evaluate(() => setView("pilot-staff"));
      await page.waitForTimeout(600);
      const profileText = await page.locator("#view-pilot-staff").textContent();
      assert.match(profileText, /My Staff Profile/);
      assert.match(profileText, /Billing, Families, adding staff, and Program Settings are managed by the owner/);
      pass("15. Staff's own 'My Staff Profile' view is read-only and explicitly states owner-only capabilities are not hers");
    }
  } finally {
    if (browser) await browser.close();
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }

  console.log(`\nHome Daycare staff restrictions checks passed (${passed}).`);
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
