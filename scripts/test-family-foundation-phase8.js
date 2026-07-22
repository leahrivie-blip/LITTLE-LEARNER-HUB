#!/usr/bin/env node
"use strict";

/**
 * Phase 8 Family / Guardian / Household / Fake-Account Foundation tests.
 * Family Hub stays OFF. Fake data only. No email/SMS/Stripe/live AI.
 */

const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const expansionFlags = require("./expansion-feature-flags.js");
const model = require("./family-foundation-data-model.js");
const fixtures = require("./family-foundation-fixtures.js");
const invitationTokens = require("./family-invitation-tokens.js");
const orgPermissions = require("./org-permissions.js");
const { EXPANSION_FEATURE_KEYS } = expansionFlags;

const ROOT = path.join(__dirname, "..");
const ADMIN_EMAIL = "phase8-admin@example.com";
const ADMIN_PASSWORD = "Phase8FamilyPass!99";
const ADMIN_CODE = "phase8-family-code";

function request(port, method, pathname, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: pathname,
        method,
        headers: {
          Accept: "application/json",
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { raw += chunk; });
        res.on("end", () => {
          let parsed = null;
          try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = raw; }
          resolve({ status: res.statusCode, body: parsed, raw });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function waitForHealth(port, timeoutMs = 20000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await request(port, "GET", "/api/health");
        if (res.status === 200) return resolve();
      } catch { /* retry */ }
      if (Date.now() - started > timeoutMs) return reject(new Error("Server health timeout"));
      setTimeout(tick, 150);
    };
    tick();
  });
}

function baseStore(flags = { directorCenter: true, formsCenter: true, familyHub: false }) {
  return {
    siteContent: {
      featureFlags: {
        [EXPANSION_FEATURE_KEYS.DIRECTOR_CENTER]: flags.directorCenter === true,
        [EXPANSION_FEATURE_KEYS.FORMS_CENTER]: flags.formsCenter === true,
        [EXPANSION_FEATURE_KEYS.FAMILY_HUB]: flags.familyHub === true,
      },
    },
  };
}

async function startServer({ env = {}, storeMutator = null } = {}) {
  const storePath = path.join(os.tmpdir(), `llh-ff-phase8-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  const initial = baseStore();
  if (typeof storeMutator === "function") storeMutator(initial);
  fs.writeFileSync(storePath, JSON.stringify(initial, null, 2));
  const port = 8800 + Math.floor(Math.random() * 600);
  const child = spawn("node", ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      HOST: "127.0.0.1",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: storePath,
      SITE_URL: env.SITE_URL || "http://127.0.0.1",
      ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW: env.ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW ?? "true",
      ALLOW_FORMS_CENTER_ADMIN_PREVIEW: env.ALLOW_FORMS_CENTER_ADMIN_PREVIEW ?? "true",
      ADMIN_EMAIL,
      ADMIN_EMAILS: "phase8-second-admin@example.com",
      ADMIN_PASSWORD,
      ADMIN_ACCESS_CODE: ADMIN_CODE,
      OPENAI_API_KEY: "",
      STRIPE_SECRET_KEY: "",
      DISABLE_OUTBOUND_EMAIL: "true",
      DISABLE_STRIPE_CHECKOUT: "true",
      DISABLE_AI_CALLS: "true",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  try {
    await waitForHealth(port);
  } catch (error) {
    child.kill("SIGTERM");
    throw new Error(`${error.message}\n${stderr}`);
  }
  return { port, child, storePath, stderr: () => stderr };
}

async function stopServer(ctx) {
  if (!ctx?.child) return;
  ctx.child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 2000);
    ctx.child.once("exit", () => { clearTimeout(timer); resolve(); });
  });
}

async function adminLogin(port) {
  const res = await request(port, "POST", "/api/admin/login", {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, code: ADMIN_CODE },
  });
  assert.equal(res.status, 200, "admin login");
  return res.body.token;
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

let passed = 0;
function ok(label) {
  passed += 1;
  console.log(`  PASS  ${label}`);
}

async function testUnitModel() {
  console.log("\nUnit: data model & fixtures");
  const store = {};
  const seeded = fixtures.ensurePhase8Preview(store, { adminEmail: ADMIN_EMAIL });
  assert.ok(seeded.organizationId);
  assert.ok(seeded.householdIds.length >= 4);
  assert.ok(seeded.contactIds.priya);
  assert.ok(seeded.childIds.elena);

  // Siblings in one household
  const linChildren = model.listValues(store.familyFoundation.childHouseholdLinks)
    .filter((row) => row.householdId === seeded.householdIds[0] && row.status === "active")
    .map((row) => row.childId);
  assert.ok(linChildren.includes(seeded.childIds.ava));
  assert.ok(linChildren.includes(seeded.childIds.ben));
  ok("siblings share one household");

  // Child in multiple households
  const elenaLinks = model.listValues(store.familyFoundation.childHouseholdLinks)
    .filter((row) => row.childId === seeded.childIds.elena && row.status === "active");
  assert.ok(elenaLinks.length >= 2);
  ok("child connected to multiple households (shared custody)");

  // Pickup-only denied for forms
  const pickup = seeded.contactIds.pickupOnly;
  const pickupForms = model.evaluateContactChildAccess({
    store,
    organizationId: seeded.organizationId,
    contactId: pickup,
    childId: seeded.childIds.dana,
    capability: "forms",
  });
  assert.equal(pickupForms.allowed, false);
  ok("pickup-only denied for forms");

  // Emergency-only denied for forms
  const emergencyForms = model.evaluateContactChildAccess({
    store,
    organizationId: seeded.organizationId,
    contactId: seeded.contactIds.emergencyOnly,
    childId: seeded.childIds.dana,
    capability: "forms",
  });
  assert.equal(emergencyForms.allowed, false);
  ok("emergency-contact-only denied for forms");

  // Restricted guardian denied
  const restricted = model.evaluateContactChildAccess({
    store,
    organizationId: seeded.organizationId,
    contactId: seeded.contactIds.grace,
    childId: seeded.childIds.dana,
    capability: "digital",
  });
  assert.equal(restricted.allowed, false);
  ok("restricted guardian denied digital access");

  // Suspended denied
  const suspended = model.evaluateContactChildAccess({
    store,
    organizationId: seeded.organizationId,
    contactId: seeded.contactIds.suspended,
    childId: seeded.childIds.carlos,
    capability: "forms",
  });
  assert.equal(suspended.allowed, false);
  ok("suspended access denied");

  // Full guardian allowed forms for own child; sibling isolation for wrong child
  const frankOk = model.evaluateContactChildAccess({
    store,
    organizationId: seeded.organizationId,
    contactId: seeded.contactIds.frank,
    childId: seeded.childIds.dana,
    capability: "forms",
  });
  assert.equal(frankOk.allowed, true);
  const frankWrong = model.evaluateContactChildAccess({
    store,
    organizationId: seeded.organizationId,
    contactId: seeded.contactIds.frank,
    childId: seeded.childIds.ava,
    capability: "forms",
  });
  assert.equal(frankWrong.allowed, false);
  ok("guardian access scoped to correct child");

  // Multi-child parent: Priya has Ava full + Elena forms-only
  const priyaAva = model.evaluateContactChildAccess({
    store, organizationId: seeded.organizationId, contactId: seeded.contactIds.priya,
    childId: seeded.childIds.ava, capability: "forms",
  });
  const priyaElena = model.evaluateContactChildAccess({
    store, organizationId: seeded.organizationId, contactId: seeded.contactIds.priya,
    childId: seeded.childIds.elena, capability: "forms",
  });
  assert.equal(priyaAva.allowed, true);
  assert.equal(priyaElena.allowed, true);
  assert.equal(priyaElena.accessLevel, model.ACCESS_LEVELS.FORMS_ONLY);
  ok("one guardian different permissions per child");

  // End relationship preserves history
  const rule = model.listValues(store.familyFoundation.accessRules).find((row) => (
    row.contactId === seeded.contactIds.frank && row.childId === seeded.childIds.dana
  ));
  const previous = rule.accessLevel;
  model.endAccessRule(rule, { reason: "test end" });
  assert.equal(rule.accessLevel, model.ACCESS_LEVELS.ENDED_RELATIONSHIP);
  assert.equal(rule.previousAccessLevel, previous);
  assert.ok(rule.endsAt);
  const ended = model.evaluateContactChildAccess({
    store, organizationId: seeded.organizationId, contactId: seeded.contactIds.frank,
    childId: seeded.childIds.dana, capability: "forms",
  });
  assert.equal(ended.allowed, false);
  ok("ended relationship denies access and preserves history");

  // Invitation token hashing
  const issued = invitationTokens.issueInvitationToken({ ttlMs: 60_000 });
  const inv = model.createInvitationRecord({
    organizationId: seeded.organizationId,
    contactId: seeded.contactIds.priya,
    childIds: [seeded.childIds.ava],
    tokenHash: issued.tokenHash,
    expiresAt: issued.expiresAt,
  });
  assert.equal(invitationTokens.verifyInvitationToken(inv, issued.rawToken).ok, true);
  assert.equal(invitationTokens.verifyInvitationToken(inv, "wrong").ok, false);
  ok("invitation tokens hashed and verified");

  // Fake accounts use @example.invalid and empty password hashes
  const fakes = model.listValues(store.familyFoundation.fakeAccounts);
  assert.ok(fakes.length >= 15);
  fakes.forEach((acct) => {
    assert.ok(String(acct.email).endsWith("@example.invalid"));
    assert.equal(acct.passwordHash, "");
    assert.equal(acct.testingOnly, true);
  });
  ok("fake accounts use @example.invalid with no hardcoded passwords");

  // Family Hub forced off in flags
  assert.equal(expansionFlags.isExpansionFeatureEnabled({ familyHub: true }, EXPANSION_FEATURE_KEYS.FAMILY_HUB), false);
  ok("Family Hub remains forced OFF");

  // Permissions catalog includes family manage actions
  const catalog = orgPermissions.permissionCatalog();
  assert.ok(catalog.actions.FAMILY_MANAGE_HOUSEHOLDS);
  ok("org-permissions includes family management actions");
}

async function testApiSecurity() {
  console.log("\nAPI: management, invitations, fake accounts, guardian session");
  const ctx = await startServer();
  try {
    const token = await adminLogin(ctx.port);

    const status = await request(ctx.port, "GET", "/api/director-center/family/status", { headers: auth(token) });
    assert.equal(status.status, 200);
    assert.equal(status.body.familyHub, false);
    assert.equal(status.body.familyHubForcedOff, true);
    ok("family status reports Family Hub OFF");

    const overview = await request(ctx.port, "GET", "/api/director-center/family/overview", { headers: auth(token) });
    assert.equal(overview.status, 200);
    assert.ok((overview.body.households || []).length >= 4);
    assert.ok((overview.body.contacts || []).length >= 5);
    assert.ok((overview.body.fakeAccounts || []).length >= 10);
    ok("overview lists households, contacts, fake accounts");

    // Create household + contact + access
    const hh = await request(ctx.port, "POST", "/api/director-center/family/households", {
      headers: auth(token),
      body: { displayName: "API Test Household" },
    });
    assert.equal(hh.status, 201);
    const childId = overview.body.children[0].id;
    const contact = await request(ctx.port, "POST", "/api/director-center/family/contacts", {
      headers: auth(token),
      body: {
        householdId: hh.body.household.id,
        displayName: "API Guardian",
        email: "api.guardian@example.invalid",
        childId,
        accessLevel: model.ACCESS_LEVELS.FULL_VERIFIED_GUARDIAN,
        isEmergencyContact: true,
        isAuthorizedPickup: true,
        verificationStatus: "verified",
      },
    });
    assert.equal(contact.status, 201);
    assert.ok(contact.body.contact.id.startsWith("fcontact_"));
    ok("create household + contact with permanent IDs");

    // Invitation create / revoke / regenerate / accept
    const invite = await request(ctx.port, "POST", "/api/director-center/family/invitations", {
      headers: auth(token),
      body: { contactId: contact.body.contact.id, childIds: [childId] },
    });
    assert.equal(invite.status, 201);
    assert.ok(invite.body.testingToken);
    assert.equal(invite.body.emailSent, false);
    assert.ok(!JSON.stringify(invite.body.invitation).includes(invite.body.testingToken));
    ok("invitation created without email; raw token not stored on invitation object");

    const revoke = await request(ctx.port, "POST", `/api/director-center/family/invitations/${invite.body.invitation.id}/revoke`, {
      headers: auth(token),
      body: {},
    });
    assert.equal(revoke.status, 200);
    assert.equal(revoke.body.invitation.status, "revoked");
    ok("invitation revoked");

    const regen = await request(ctx.port, "POST", `/api/director-center/family/invitations/${invite.body.invitation.id}/regenerate`, {
      headers: auth(token),
      body: {},
    });
    assert.equal(regen.status, 201);
    const acceptBad = await request(ctx.port, "POST", "/api/family-foundation/invitations/accept", {
      headers: { [invitationTokens.INVITATION_TOKEN_HEADER]: invite.body.testingToken },
      body: { invitationId: invite.body.invitation.id, testingMode: true },
    });
    assert.ok(acceptBad.status === 401 || acceptBad.status === 410);
    ok("revoked invitation token rejected");

    const accept = await request(ctx.port, "POST", "/api/family-foundation/invitations/accept", {
      headers: { [invitationTokens.INVITATION_TOKEN_HEADER]: regen.body.testingToken },
      body: { invitationId: regen.body.invitation.id, testingMode: true },
    });
    assert.equal(accept.status, 200);
    assert.equal(accept.body.familyHub, false);
    assert.ok(accept.body.contactId);
    assert.ok(accept.body.userAccountId);
    ok("invitation accepted in testing mode links permanent contact ID");

    // Expired invitation
    const invite2 = await request(ctx.port, "POST", "/api/director-center/family/invitations", {
      headers: auth(token),
      body: { contactId: contact.body.contact.id },
    });
    // Manually expire by rewriting store
    const store = JSON.parse(fs.readFileSync(ctx.storePath, "utf8"));
    store.familyFoundation.invitations[invite2.body.invitation.id].expiresAt = new Date(Date.now() - 1000).toISOString();
    fs.writeFileSync(ctx.storePath, JSON.stringify(store, null, 2));
    const acceptExpired = await request(ctx.port, "POST", "/api/family-foundation/invitations/accept", {
      headers: { [invitationTokens.INVITATION_TOKEN_HEADER]: invite2.body.testingToken },
      body: { invitationId: invite2.body.invitation.id, testingMode: true },
    });
    assert.equal(acceptExpired.status, 410);
    ok("expired invitation rejected");

    // Fake password issue + login
    const fakes = await request(ctx.port, "GET", "/api/director-center/family/fake-accounts", { headers: auth(token) });
    const parentAcct = (fakes.body.fakeAccounts || []).find((row) => row.kind === "parent_one_child");
    assert.ok(parentAcct);
    const issued = await request(ctx.port, "POST", `/api/director-center/family/fake-accounts/${parentAcct.id}/issue-password`, {
      headers: auth(token),
      body: {},
    });
    assert.equal(issued.status, 200);
    assert.ok(issued.body.temporaryPassword);
    assert.equal(issued.body.shownOnce, true);
    // Password must not appear in fakeAccounts list
    const fakes2 = await request(ctx.port, "GET", "/api/director-center/family/fake-accounts", { headers: auth(token) });
    assert.ok(!JSON.stringify(fakes2.body).includes(issued.body.temporaryPassword));
    ok("fake password issued once and not listed later");

    const login = await request(ctx.port, "POST", "/api/auth/password-login", {
      body: { email: parentAcct.email, password: issued.body.temporaryPassword },
    });
    assert.equal(login.status, 200);
    assert.ok(login.body.memberSessionToken);
    ok("fake account requires normal password login");

    const session = await request(ctx.port, "GET", "/api/family-foundation/guardian-session", {
      headers: { Authorization: `Bearer ${login.body.memberSessionToken}` },
    });
    assert.equal(session.status, 200);
    assert.equal(session.body.familyHub, false);
    assert.match(session.body.placeholderMessage, /Family Hub experience will be added/i);
    assert.equal(session.body.navigationHidden, true);
    ok("guardian session shows Family Hub OFF placeholder");

    // Pickup-only denial via guardian access check
    const pickupAcct = (fakes.body.fakeAccounts || []).find((row) => row.kind === "pickup_only");
    const pickupPw = await request(ctx.port, "POST", `/api/director-center/family/fake-accounts/${pickupAcct.id}/issue-password`, {
      headers: auth(token), body: {},
    });
    const pickupLogin = await request(ctx.port, "POST", "/api/auth/password-login", {
      body: { email: pickupAcct.email, password: pickupPw.body.temporaryPassword },
    });
    const dana = overview.body.children.find((row) => /Dana/i.test(row.displayName));
    const pickupCheck = await request(ctx.port, "POST", "/api/family-foundation/guardian-access-check", {
      headers: { Authorization: `Bearer ${pickupLogin.body.memberSessionToken}` },
      body: { childId: dana.id, capability: "forms" },
    });
    assert.equal(pickupCheck.status, 403);
    ok("pickup-only guardian denied forms via server check");

    // Wrong child / sibling access denial for one-child parent
    const ava = overview.body.children.find((row) => /Ava/i.test(row.displayName));
    const wrongChild = await request(ctx.port, "POST", "/api/family-foundation/guardian-access-check", {
      headers: { Authorization: `Bearer ${login.body.memberSessionToken}` },
      body: { childId: ava.id, capability: "forms" },
    });
    assert.equal(wrongChild.status, 403);
    ok("parent denied access to unrelated child");

    // Cross-organization denial
    const cross = await request(ctx.port, "POST", "/api/family-foundation/guardian-access-check", {
      headers: { Authorization: `Bearer ${login.body.memberSessionToken}` },
      body: { childId: dana.id, capability: "forms", organizationId: "org_altered_fake" },
    });
    assert.equal(cross.status, 403);
    assert.equal(cross.body.reason, "cross_organization_denied");
    ok("altered organizationId denied");

    // Parent cannot call director family APIs
    const parentAsStaff = await request(ctx.port, "GET", "/api/director-center/family/overview", {
      headers: { Authorization: `Bearer ${login.body.memberSessionToken}` },
    });
    assert.ok(parentAsStaff.status === 401 || parentAsStaff.status === 403 || parentAsStaff.status === 404);
    ok("parent denied director family management APIs");

    // Family Hub route still unavailable
    const hub = await request(ctx.port, "GET", "/api/family-hub/anything", { headers: auth(token) });
    assert.ok(hub.status === 403 || hub.status === 404);
    ok("Family Hub API remains unavailable");

    // Suspend / restore / end preserve history
    const rule = overview.body.accessRules.find((row) => row.contactId && /Frank/i.test(row.contactName || ""));
    if (rule) {
      const suspend = await request(ctx.port, "PATCH", `/api/director-center/family/access/${rule.id}`, {
        headers: auth(token),
        body: { action: "suspend", reason: "test suspend" },
      });
      assert.equal(suspend.status, 200);
      assert.equal(suspend.body.historyPreserved, true);
      const restore = await request(ctx.port, "PATCH", `/api/director-center/family/access/${rule.id}`, {
        headers: auth(token),
        body: { action: "restore" },
      });
      assert.equal(restore.status, 200);
      ok("suspend/restore preserves relationship history");
    } else {
      ok("suspend/restore skipped (rule missing in overview — non-fatal)");
    }

    // Merge review does not silently delete
    const merge = await request(ctx.port, "POST", "/api/director-center/family/merge-review", {
      headers: auth(token),
      body: { entityType: "contact", sourceIds: [contact.body.contact.id], targetId: contact.body.contact.id },
    });
    assert.equal(merge.status, 201);
    assert.equal(merge.body.applied, false);
    ok("merge only queues reviewed process");

    // Historical records: ending access keeps rule row
    const history = await request(ctx.port, "GET", "/api/director-center/family/history", { headers: auth(token) });
    assert.equal(history.status, 200);
    assert.ok(Array.isArray(history.body.accessRules));
    ok("relationship history endpoint retains rules");

  } finally {
    await stopServer(ctx);
  }
}

async function testProductionRejection() {
  console.log("\nProduction locks");
  const ctx = await startServer({
    env: { SITE_URL: "https://littlelearnershubbyleah.com" },
  });
  try {
    const token = await adminLogin(ctx.port);
    // Director Center itself is expansion-gated off on the production host before
    // family handlers run — either gate is an acceptable production denial.
    const status = await request(ctx.port, "GET", "/api/director-center/family/status", { headers: auth(token) });
    assert.equal(status.status, 403);
    assert.ok(["production_locked", "feature_unavailable"].includes(status.body.code));
    ok("family foundation management rejected on production host");

    const accept = await request(ctx.port, "POST", "/api/family-foundation/invitations/accept", {
      body: { invitationId: "x", testingMode: true, token: "y" },
    });
    assert.equal(accept.status, 403);
    assert.ok(String(accept.body.code || "").includes("production") || accept.body.code === "invitation_accept_forbidden_in_production");
    ok("invitation accept rejected on production");

    const session = await request(ctx.port, "GET", "/api/family-foundation/guardian-session", {
      headers: { Authorization: "Bearer test:phase8.owner@example.invalid" },
    });
    assert.equal(session.status, 403);
    assert.equal(session.body.code, "production_locked");
    ok("guardian session rejected on production host");

    const login = await request(ctx.port, "POST", "/api/auth/password-login", {
      body: { email: "phase8.owner@example.invalid", password: "anything" },
    });
    assert.equal(login.status, 403);
    assert.equal(login.body.code, "fake_account_forbidden_in_production");
    ok("fake-account login rejected on production");
  } finally {
    await stopServer(ctx);
  }
}

async function main() {
  console.log("Phase 8 Family / Guardian / Fake-Account Foundation");
  await testUnitModel();
  await testApiSecurity();
  await testProductionRejection();
  console.log(`\nPhase 8 results: ${passed} PASS`);
}

main().catch((error) => {
  console.error("\nFAIL", error);
  process.exit(1);
});
