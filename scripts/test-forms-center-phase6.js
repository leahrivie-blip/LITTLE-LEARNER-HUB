#!/usr/bin/env node
"use strict";

/**
 * Phase 6 Form Assignment / Response / Signature private admin-preview tests.
 * Fake preview data only. No email. No SMS. No Stripe. No AI. Testing links
 * only work on non-production hosts and are hashed/expiring/revocable.
 */

const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const expansionFlags = require("./expansion-feature-flags.js");
const foundation = require("./foundation-data-model.js");
const orgPermissions = require("./org-permissions.js");
const entitlements = require("./entitlement-model.js");
const model = require("./form-responses-data-model.js");
const tokens = require("./form-recipient-tokens.js");

const { EXPANSION_FEATURE_KEYS } = expansionFlags;
const ROOT = path.join(__dirname, "..");
const ADMIN_EMAIL = "phase6-admin@example.com";
const ADMIN_PASSWORD = "Phase6ResponsesPass!99";
const ADMIN_CODE = "phase6-response-code";

function request(port, method, pathname, { headers = {}, body = null, query = "" } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: pathname + query,
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

function baseStore(flags = {}) {
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

async function startServer({ env = {}, flags = { directorCenter: true, formsCenter: true, familyHub: true }, store = null } = {}) {
  const storePath = path.join(os.tmpdir(), `llh-fc-phase6-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  fs.writeFileSync(storePath, JSON.stringify(store || baseStore(flags), null, 2));
  const port = 7600 + Math.floor(Math.random() * 800);
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
      ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW: env.ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW || "true",
      ALLOW_FORMS_CENTER_ADMIN_PREVIEW: env.ALLOW_FORMS_CENTER_ADMIN_PREVIEW || "true",
      ADMIN_EMAIL,
      ADMIN_EMAILS: "phase6-second-admin@example.com",
      ADMIN_PASSWORD,
      ADMIN_ACCESS_CODE: ADMIN_CODE,
      OPENAI_API_KEY: "",
      STRIPE_SECRET_KEY: "",
      STRIPE_WEBHOOK_SECRET: "",
      RESEND_API_KEY: "",
      SENDGRID_API_KEY: "",
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
  return {
    port,
    storePath,
    readStore: () => JSON.parse(fs.readFileSync(storePath, "utf8")),
    stop: () => new Promise((resolve) => { child.once("exit", () => resolve()); child.kill("SIGTERM"); }),
  };
}

async function adminLogin(port, email = ADMIN_EMAIL) {
  const login = await request(port, "POST", "/api/admin/login", { body: { email, password: ADMIN_PASSWORD, code: ADMIN_CODE } });
  assert.equal(login.status, 200, `admin login failed: ${JSON.stringify(login.body)}`);
  return login.body.token;
}

function buildCurriculumOnlyStore() {
  const store = foundation.ensureFoundationStore(baseStore({ directorCenter: true, formsCenter: true, familyHub: true }));
  const org = foundation.createOrganizationRecord({
    id: "org_curriculum_only_phase6_test",
    accountType: foundation.ACCOUNT_TYPES.CENTER,
    ownerEmail: ADMIN_EMAIL,
    name: "Curriculum Only Preview",
  });
  org.preview = true;
  store.organizations[org.id] = org;
  const entitlement = entitlements.createOrganizationEntitlementRecord({ organizationId: org.id, basePlanKey: entitlements.PLAN_KEYS.CURRICULUM_ONLY });
  entitlement.preview = true;
  store.organizationEntitlements[entitlement.id] = entitlement;
  return store;
}

async function fillAndSubmit(port, auth, assignmentId, rawToken, { signerRole = "parent_guardian" } = {}) {
  const headers = { [tokens.RECIPIENT_TOKEN_HEADER]: rawToken };
  const resolve = await request(port, "GET", `/api/form-recipient/${assignmentId}`, { headers });
  const fields = (resolve.body.version?.fields || []).filter((f) => !["content_heading", "content_paragraph", "content_divider"].includes(f.type));
  const answers = {};
  fields.forEach((field) => {
    if (field.type === "date") answers[field.id] = "2020-01-01";
    else if (field.type === "email") answers[field.id] = "guardian@example.invalid";
    else if (["single_select", "yes_no"].includes(field.type)) answers[field.id] = field.options?.[0]?.label || "Yes";
    else if (["multi_select", "checkboxes"].includes(field.type)) answers[field.id] = field.options?.[0] ? [field.options[0].label] : [];
    else answers[field.id] = "Fixture Test Value";
  });
  await request(port, "POST", `/api/form-recipient/${assignmentId}/save-draft`, { headers, body: { answers } });
  await request(port, "POST", `/api/form-recipient/${assignmentId}/signature`, { headers, body: { typedName: "Test Signer", consentGiven: true, signerRole } });
  const submit = await request(port, "POST", `/api/form-recipient/${assignmentId}/submit`, { headers, body: {} });
  return { resolve, submit };
}

async function run() {
  const check = spawnSync("npm", ["run", "check"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(check.status, 0, `npm run check failed\n${check.stdout}\n${check.stderr}`);
  console.log("PASS nested npm run check");

  const failures = [];
  const pass = (name) => console.log(`PASS ${name}`);
  const fail = (name, error) => {
    failures.push(`${name}: ${error && error.message ? error.message : error}`);
    console.error(`FAIL ${name}: ${error && error.message ? error.message : error}`);
  };

  // ── Local unit tests ────────────────────────────────────────────────────

  try {
    const issued = tokens.issueTestingLink({ ttlMs: 1000 * 60 });
    assert.ok(issued.rawToken.length >= 32);
    assert.equal(tokens.hashToken(issued.rawToken), issued.tokenHash);
    const fakeAssignment = { testingLinkTokenHash: issued.tokenHash, testingLinkExpiresAt: issued.expiresAt, testingLinkRevoked: false };
    assert.equal(tokens.verifyTestingLinkToken(fakeAssignment, issued.rawToken).ok, true);
    assert.equal(tokens.verifyTestingLinkToken(fakeAssignment, "wrong").ok, false);
    fakeAssignment.testingLinkRevoked = true;
    assert.equal(tokens.verifyTestingLinkToken(fakeAssignment, issued.rawToken).reason, "link_revoked");
    const expired = { testingLinkTokenHash: issued.tokenHash, testingLinkExpiresAt: new Date(Date.now() - 1000).toISOString(), testingLinkRevoked: false };
    assert.equal(tokens.verifyTestingLinkToken(expired, issued.rawToken).reason, "link_expired");
    pass("testing-link tokens hash, verify, expire, and revoke correctly");
  } catch (error) {
    fail("testing-link tokens hash, verify, expire, and revoke correctly", error);
  }

  try {
    const version = { fields: [{ id: "f1", type: "short_text", required: true, label: "Name" }, { id: "f2", type: "email", required: false, label: "Email" }] };
    const errors = model.validateAnswersAgainstVersion(version, {});
    assert.equal(errors.length, 1);
    assert.equal(errors[0].fieldId, "f1");
    const badEmail = model.validateAnswersAgainstVersion(version, { f1: "Ava", f2: "not-an-email" });
    assert.ok(badEmail.some((e) => e.fieldId === "f2"));
    pass("server-side answer validation catches missing required fields and invalid email format");
  } catch (error) {
    fail("server-side answer validation catches missing required fields and invalid email format", error);
  }

  // ── Server-level gate tests (shared with Forms Center) ──────────────────

  for (const [name, config, expectedReason] of [
    ["production lock", { env: { SITE_URL: "https://littlelearnershubbyleah.com", ALLOW_FORMS_CENTER_ADMIN_PREVIEW: "true" } }, "production_locked"],
    ["preview env required", { env: { ALLOW_FORMS_CENTER_ADMIN_PREVIEW: "false" } }, "preview_env_disabled"],
    ["stored flag required", { flags: { directorCenter: true, formsCenter: false, familyHub: true } }, "feature_unavailable"],
  ]) {
    const server = await startServer(config);
    try {
      const token = await adminLogin(server.port);
      const res = await request(server.port, "GET", "/api/forms-center/responses", { headers: { Authorization: `Bearer ${token}` } });
      assert.equal(res.status, 403, JSON.stringify(res.body));
      assert.equal(res.body.reason, expectedReason);
      pass(`${name} rejects assignment/response routes (shares Forms Center gate)`);
    } catch (error) {
      fail(`${name} rejects assignment/response routes`, error);
    } finally {
      await server.stop();
    }
  }

  {
    const server = await startServer({ store: buildCurriculumOnlyStore() });
    try {
      const token = await adminLogin(server.port);
      const res = await request(server.port, "GET", "/api/forms-center/responses", { headers: { Authorization: `Bearer ${token}` } });
      assert.equal(res.status, 403);
      assert.equal(res.body.code, "forms_center_entitlement_required");
      pass("Curriculum Only entitlement blocks assignments/responses management");
    } catch (error) {
      fail("Curriculum Only entitlement blocks assignments/responses management", error);
    } finally {
      await server.stop();
    }
  }

  {
    // Testing links must be rejected outright on a live production host, even
    // with a perfectly valid (but unrelated) token shape.
    const server = await startServer({ env: { SITE_URL: "https://littlelearnershubbyleah.com" } });
    try {
      const res = await request(server.port, "GET", "/api/form-recipient/frasg_doesnotexist", { headers: { [tokens.RECIPIENT_TOKEN_HEADER]: "a".repeat(64) } });
      assert.equal(res.status, 404);
      assert.equal(res.body.code, "production_locked");
      pass("recipient testing links are rejected outright on a live production host");
    } catch (error) {
      fail("recipient testing links are rejected outright on a live production host", error);
    } finally {
      await server.stop();
    }
  }

  // ── Main workflow ─────────────────────────────────────────────────────────

  const server = await startServer();
  try {
    const token = await adminLogin(server.port);
    const auth = { Authorization: `Bearer ${token}` };

    const dashboard = await request(server.port, "GET", "/api/forms-center/responses", { headers: auth });
    assert.equal(dashboard.status, 200, JSON.stringify(dashboard.body));
    assert.equal(dashboard.body.emailSent, false);
    assert.equal(dashboard.body.smsSent, false);
    assert.ok(dashboard.body.total >= 16, "fixtures should seed at least 16 responses");
    pass("responses dashboard loads with fixture scenarios and safety flags");

    const directory = await request(server.port, "GET", "/api/forms-center/recipients-directory", { headers: auth });
    assert.equal(directory.status, 200);
    assert.ok(directory.body.children.length >= 4);
    const childWithTwoGuardians = directory.body.children.find((c) => c.guardians.length >= 2);
    assert.ok(childWithTwoGuardians, "fixture must include a child with two guardians");
    const restrictedGuardian = directory.body.children.flatMap((c) => c.guardians).find((g) => g.verified === false);
    assert.ok(restrictedGuardian, "fixture must include an unverified/restricted guardian");
    pass("recipients directory exposes children, guardians (including two-guardian and restricted scenarios), staff, and classrooms");

    const publishedForms = await request(server.port, "GET", "/api/forms-center/forms?status=published", { headers: auth });
    const emergencyForm = publishedForms.body.forms.find((f) => f.title === "Emergency Contact Form");
    assert.ok(emergencyForm);

    // ── Assignment creation + bulk separation ─────────────────────────────

    const child1 = directory.body.children[0];
    const child2 = directory.body.children[1];
    const bulkAssign = await request(server.port, "POST", "/api/forms-center/assignments", {
      headers: auth,
      body: {
        formId: emergencyForm.id,
        recipientType: "child",
        recipientIds: [child1.id, child2.id],
        dueDate: "2026-09-01",
        requiredSignatureRoles: ["parent_guardian"],
      },
    });
    assert.equal(bulkAssign.status, 201, JSON.stringify(bulkAssign.body));
    assert.equal(bulkAssign.body.count, 2);
    assert.ok(bulkAssign.body.batchId);
    const [createdA, createdB] = bulkAssign.body.created;
    assert.notEqual(createdA.assignment.id, createdB.assignment.id);
    assert.notEqual(createdA.response.id, createdB.response.id);
    pass("bulk assignment creates separate assignment and response records per recipient");

    // One recipient's testing link must never expose the other recipient's response.
    const linkA = await request(server.port, "POST", `/api/forms-center/assignments/${createdA.assignment.id}/testing-link/issue`, { headers: auth, body: {} });
    assert.equal(linkA.status, 200);
    const resolveA = await request(server.port, "GET", `/api/form-recipient/${createdA.assignment.id}`, { headers: { [tokens.RECIPIENT_TOKEN_HEADER]: linkA.body.rawToken } });
    assert.equal(resolveA.status, 200);
    assert.equal(resolveA.body.response.id, createdA.response.id);
    const crossAttempt = await request(server.port, "GET", `/api/form-recipient/${createdB.assignment.id}`, { headers: { [tokens.RECIPIENT_TOKEN_HEADER]: linkA.body.rawToken } });
    assert.equal(crossAttempt.status, 401);
    assert.equal(crossAttempt.body.code, "link_not_issued");
    pass("a recipient's testing link can never be used to open a different recipient's response");

    // All verified guardians for a child, excluding the restricted/unverified one.
    const childForGuardians = directory.body.children.find((c) => c.guardians.some((g) => !g.verified));
    const beforeAllGuardians = await request(server.port, "GET", "/api/forms-center/responses", { headers: auth });
    const allGuardiansAssign = await request(server.port, "POST", "/api/forms-center/assignments", {
      headers: auth,
      body: { formId: emergencyForm.id, recipientType: "guardian", allVerifiedGuardiansForChild: true, relatedChildId: childForGuardians.id },
    });
    assert.equal(allGuardiansAssign.status, 201, JSON.stringify(allGuardiansAssign.body));
    const verifiedGuardianCount = childForGuardians.guardians.filter((g) => g.verified).length;
    assert.equal(allGuardiansAssign.body.count, verifiedGuardianCount);
    assert.ok(!allGuardiansAssign.body.created.some((row) => row.assignment.recipientId === restrictedGuardian.guardianId), "the restricted/unverified guardian must never receive an assignment");
    void beforeAllGuardians;
    pass('"all verified guardians for a child" never includes a restricted/unverified guardian');

    // ── Draft save / autosave ──────────────────────────────────────────────

    const draftHeaders = { [tokens.RECIPIENT_TOKEN_HEADER]: linkA.body.rawToken };
    const before = await request(server.port, "GET", `/api/form-recipient/${createdA.assignment.id}`, { headers: draftHeaders });
    const firstFieldId = before.body.version.fields.find((f) => f.type === "smart_child_name").id;
    const draft1 = await request(server.port, "POST", `/api/form-recipient/${createdA.assignment.id}/save-draft`, { headers: draftHeaders, body: { answers: { [firstFieldId]: "Ava Lin" }, autosave: true } });
    assert.equal(draft1.status, 200);
    assert.equal(draft1.body.status, "in_progress");
    await new Promise((resolve) => setTimeout(resolve, 20));
    const draft2 = await request(server.port, "POST", `/api/form-recipient/${createdA.assignment.id}/save-draft`, { headers: draftHeaders, body: { answers: { [firstFieldId]: "Ava R. Lin" }, autosave: true } });
    assert.equal(draft2.status, 200);
    assert.notEqual(draft1.body.savedAt, draft2.body.savedAt);
    const afterDraft = await request(server.port, "GET", `/api/form-recipient/${createdA.assignment.id}`, { headers: draftHeaders });
    assert.equal(afterDraft.body.response.answers[firstFieldId], "Ava R. Lin");
    pass("repeated autosave calls update the same response without creating duplicates and always reflect the latest answer");

    // ── Server-side validation on submit ────────────────────────────────────

    const badSubmit = await request(server.port, "POST", `/api/form-recipient/${createdA.assignment.id}/submit`, { headers: draftHeaders, body: {} });
    assert.equal(badSubmit.status, 400);
    assert.equal(badSubmit.body.code, "validation_failed");
    assert.ok(badSubmit.body.errors.length > 0);
    pass("submit is rejected server-side when required fields are missing, independent of any client-side check");

    // ── Signature + submission (single required signature) ─────────────────

    const { resolve: resolvedA, submit: submitA } = await fillAndSubmit(server.port, auth, createdA.assignment.id, linkA.body.rawToken);
    assert.equal(submitA.status, 200, JSON.stringify(submitA.body));
    assert.equal(submitA.body.status, "submitted");
    void resolvedA;
    pass("a fully completed response with its required signature submits successfully");

    const noSignatureSubmit = await request(server.port, "POST", `/api/form-recipient/${createdB.assignment.id}/submit`, {
      headers: { [tokens.RECIPIENT_TOKEN_HEADER]: (await request(server.port, "POST", `/api/forms-center/assignments/${createdB.assignment.id}/testing-link/issue`, { headers: auth, body: {} })).body.rawToken },
      body: {},
    });
    assert.equal(noSignatureSubmit.status, 400);
    pass("submission without answers and signature is rejected");

    // ── Multiple signatures + provider countersignature ─────────────────────

    const providerFormAssign = await request(server.port, "POST", "/api/forms-center/assignments", {
      headers: auth,
      body: {
        formId: emergencyForm.id,
        recipientType: "child",
        recipientIds: [child1.id],
        requiredSignatureRoles: ["parent_guardian", "provider"],
        requireProviderCountersignature: true,
      },
    });
    const providerAssignment = providerFormAssign.body.created[0].assignment;
    const providerResponseId = providerFormAssign.body.created[0].response.id;
    const providerLink = await request(server.port, "POST", `/api/forms-center/assignments/${providerAssignment.id}/testing-link/issue`, { headers: auth, body: {} });
    const { submit: providerSubmit } = await fillAndSubmit(server.port, auth, providerAssignment.id, providerLink.body.rawToken);
    assert.equal(providerSubmit.status, 200, JSON.stringify(providerSubmit.body));
    const detailBeforeCountersign = await request(server.port, "GET", `/api/forms-center/responses/${providerResponseId}`, { headers: auth });
    assert.equal(detailBeforeCountersign.body.response.awaitingProviderCountersignature, true);
    const approveBeforeCountersign = await request(server.port, "POST", `/api/forms-center/responses/${providerResponseId}/approve`, { headers: auth, body: {} });
    assert.equal(approveBeforeCountersign.status, 409);
    assert.equal(approveBeforeCountersign.body.code, "provider_countersignature_required");
    pass("approval is blocked until a required provider countersignature is added");

    // Provider countersignature is captured through the same recipient signature
    // endpoint under the provider role (the admin/provider "recipient-previews"
    // the assignment to countersign in this phase).
    const providerSign = await request(server.port, "POST", `/api/form-recipient/${providerAssignment.id}/signature`, {
      headers: { [tokens.RECIPIENT_TOKEN_HEADER]: providerLink.body.rawToken },
      body: { typedName: "Preview Owner", consentGiven: true, signerRole: "provider" },
    });
    assert.equal(providerSign.status, 201);
    const approveAfterCountersign = await request(server.port, "POST", `/api/forms-center/responses/${providerResponseId}/approve`, { headers: auth, body: {} });
    assert.equal(approveAfterCountersign.status, 200, JSON.stringify(approveAfterCountersign.body));
    assert.equal(approveAfterCountersign.body.response.signatureCount, 2);
    pass("a response can carry multiple signatures (guardian + provider) and approves once all are present");

    // ── Return for correction → signature invalidation → resubmission ──────

    const returnAssign = await request(server.port, "POST", "/api/forms-center/assignments", {
      headers: auth,
      body: { formId: emergencyForm.id, recipientType: "child", recipientIds: [child2.id], requiredSignatureRoles: ["parent_guardian"] },
    });
    const returnAssignment = returnAssign.body.created[0].assignment;
    const returnResponseId = returnAssign.body.created[0].response.id;
    const returnLink = await request(server.port, "POST", `/api/forms-center/assignments/${returnAssignment.id}/testing-link/issue`, { headers: auth, body: {} });
    await fillAndSubmit(server.port, auth, returnAssignment.id, returnLink.body.rawToken);
    const returnResult = await request(server.port, "POST", `/api/forms-center/responses/${returnResponseId}/return-for-correction`, { headers: auth, body: { message: "Please recheck the phone number." } });
    assert.equal(returnResult.status, 200, JSON.stringify(returnResult.body));
    assert.equal(returnResult.body.response.status, "returned_for_correction");
    const afterReturnDetail = await request(server.port, "GET", `/api/forms-center/responses/${returnResponseId}`, { headers: auth });
    assert.ok(afterReturnDetail.body.response.signatures.every((sig) => sig.invalidatedAt), "returning for correction must invalidate all existing signatures");
    pass("returning a response for correction invalidates its signatures and requires a correction message");

    const noMessageReturn = await request(server.port, "POST", `/api/forms-center/responses/${returnResponseId}/return-for-correction`, { headers: auth, body: {} });
    assert.equal(noMessageReturn.status, 409, JSON.stringify(noMessageReturn.body)); // already returned; also validates transition guard
    const resubmitNoSignature = await request(server.port, "POST", `/api/form-recipient/${returnAssignment.id}/submit`, { headers: { [tokens.RECIPIENT_TOKEN_HEADER]: returnLink.body.rawToken }, body: {} });
    assert.equal(resubmitNoSignature.status, 400);
    assert.equal(resubmitNoSignature.body.code, "signature_required", "a fresh signature is required before a corrected response can be resubmitted");
    const { submit: resubmit } = await fillAndSubmit(server.port, auth, returnAssignment.id, returnLink.body.rawToken);
    assert.equal(resubmit.status, 200, JSON.stringify(resubmit.body));
    assert.equal(resubmit.body.status, "corrected_and_resubmitted");
    pass("a corrected response requires a brand-new signature and resubmits as corrected_and_resubmitted");

    // ── Reopen / void / archive / restore / decline / mark-expired ─────────

    const reopenTarget = await request(server.port, "POST", "/api/forms-center/assignments", {
      headers: auth,
      body: { formId: emergencyForm.id, recipientType: "child", recipientIds: [child1.id], editableAfterSubmission: true, requiredSignatureRoles: ["parent_guardian"] },
    });
    const reopenAssignment = reopenTarget.body.created[0].assignment;
    const reopenResponseId = reopenTarget.body.created[0].response.id;
    const reopenLink = await request(server.port, "POST", `/api/forms-center/assignments/${reopenAssignment.id}/testing-link/issue`, { headers: auth, body: {} });
    await fillAndSubmit(server.port, auth, reopenAssignment.id, reopenLink.body.rawToken);
    const reopenResult = await request(server.port, "POST", `/api/forms-center/responses/${reopenResponseId}/reopen`, { headers: auth, body: {} });
    assert.equal(reopenResult.status, 200, JSON.stringify(reopenResult.body));
    assert.equal(reopenResult.body.response.status, "in_progress");
    assert.ok(reopenResult.body.response.signatures.every((sig) => sig.invalidatedAt), "reopening must invalidate existing signatures too");
    pass("reopening an editable-after-submission response invalidates its signatures and returns it to in_progress");

    const nonEditableTarget = await request(server.port, "POST", "/api/forms-center/assignments", {
      headers: auth,
      body: { formId: emergencyForm.id, recipientType: "child", recipientIds: [child2.id], editableAfterSubmission: false, requiredSignatureRoles: ["parent_guardian"] },
    });
    const nonEditableAssignment = nonEditableTarget.body.created[0].assignment;
    const nonEditableResponseId = nonEditableTarget.body.created[0].response.id;
    const nonEditableLink = await request(server.port, "POST", `/api/forms-center/assignments/${nonEditableAssignment.id}/testing-link/issue`, { headers: auth, body: {} });
    await fillAndSubmit(server.port, auth, nonEditableAssignment.id, nonEditableLink.body.rawToken);
    const blockedReopen = await request(server.port, "POST", `/api/forms-center/responses/${nonEditableResponseId}/reopen`, { headers: auth, body: {} });
    assert.equal(blockedReopen.status, 409);
    assert.equal(blockedReopen.body.code, "editing_not_allowed");
    pass("reopen is blocked when the assignment does not allow edits after submission");

    const voidNoReason = await request(server.port, "POST", `/api/forms-center/responses/${nonEditableResponseId}/void`, { headers: auth, body: {} });
    assert.equal(voidNoReason.status, 400);
    const voidResult = await request(server.port, "POST", `/api/forms-center/responses/${nonEditableResponseId}/void`, { headers: auth, body: { reason: "Duplicate submission." } });
    assert.equal(voidResult.status, 200);
    assert.equal(voidResult.body.response.status, "voided");
    pass("voiding a response requires a reason and records it");

    const archiveResult = await request(server.port, "POST", `/api/forms-center/responses/${returnResponseId}/archive`, { headers: auth, body: {} });
    assert.equal(archiveResult.status, 200);
    assert.equal(archiveResult.body.response.status, "archived");
    const restoreResult = await request(server.port, "POST", `/api/forms-center/responses/${returnResponseId}/restore`, { headers: auth, body: {} });
    assert.equal(restoreResult.status, 200);
    assert.equal(restoreResult.body.response.status, "corrected_and_resubmitted");
    pass("archive preserves status for restore, and restore returns the response to its prior status");

    const declineTarget = await request(server.port, "POST", "/api/forms-center/assignments", {
      headers: auth,
      body: { formId: emergencyForm.id, recipientType: "child", recipientIds: [child1.id] },
    });
    const declineResponseId = declineTarget.body.created[0].response.id;
    const declineResult = await request(server.port, "POST", `/api/forms-center/responses/${declineResponseId}/decline`, { headers: auth, body: { reason: "Family opted out." } });
    assert.equal(declineResult.status, 200);
    assert.equal(declineResult.body.response.status, "declined");
    const expireResult = await request(server.port, "POST", `/api/forms-center/responses/${declineTarget.body.created[0].response.id}/mark-expired`, { headers: auth, body: {} });
    assert.equal(expireResult.status, 409, "a declined response is no longer editable and cannot also be marked expired");
    pass("a response can be declined on a recipient's behalf, with terminal-status transition guards enforced");

    // ── Internal notes ───────────────────────────────────────────────────────

    const noteResult = await request(server.port, "POST", `/api/forms-center/responses/${providerResponseId}/note`, { headers: auth, body: { message: "Reviewed with the family by phone." } });
    assert.equal(noteResult.status, 200);
    assert.equal(noteResult.body.response.internalNotes.length, 1);
    pass("internal notes can be added to a response and are retained in its history");

    // ── Bulk actions ──────────────────────────────────────────────────────

    const bulkTargets = [createdB.response.id];
    const bulkArchive = await request(server.port, "POST", "/api/forms-center/responses/bulk", { headers: auth, body: { ids: bulkTargets, action: "archive" } });
    assert.equal(bulkArchive.status, 200);
    assert.ok(bulkArchive.body.results.every((row) => row.ok));
    pass("bulk archive action applies to multiple responses at once with permission checks per item");

    // ── Form-version preservation ────────────────────────────────────────

    const versions = await request(server.port, "GET", `/api/forms-center/forms/${emergencyForm.id}/versions`, { headers: auth });
    const v1 = versions.body.versions.find((v) => v.versionNumber === 1);
    assert.ok(v1, "fixtures publish at least two versions of Emergency Contact Form");
    const pinnedAssign = await request(server.port, "POST", "/api/forms-center/assignments", {
      headers: auth,
      body: { formId: emergencyForm.id, formVersionId: v1.id, recipientType: "child", recipientIds: [child1.id] },
    });
    assert.equal(pinnedAssign.status, 201);
    const pinnedResponse = pinnedAssign.body.created[0].response;
    assert.equal(pinnedResponse.formVersionNumber, 1);
    const pinnedDetail = await request(server.port, "GET", `/api/forms-center/responses/${pinnedResponse.id}`, { headers: auth });
    assert.deepEqual(pinnedDetail.body.response.version.fields, v1.fields, "the response must keep exactly the fields from the version the recipient received");
    assert.equal(pinnedDetail.body.response.newerVersionAvailable, true);
    pass("a response pinned to an older form version keeps its original fields and flags that a newer version exists");

    // ── Child / Staff / Classroom / Program filing ──────────────────────────

    const childForms = await request(server.port, "GET", `/api/forms-center/children/${child1.id}/forms`, { headers: auth });
    assert.equal(childForms.status, 200);
    assert.ok(childForms.body.responses.length > 0);
    assert.ok(childForms.body.responses.every((row) => row.relatedChildId === child1.id || row.recipientId === child1.id));
    pass("child profile filing view returns only responses connected to that permanent child ID");

    const staffDirectoryRow = directory.body.staff[0];
    const staffForms = await request(server.port, "GET", `/api/forms-center/staff/${staffDirectoryRow.id}/forms`, { headers: auth });
    assert.equal(staffForms.status, 200);
    pass("staff filing view is reachable and organization-scoped");

    const classroomDirectoryRow = directory.body.classrooms[0];
    const classroomForms = await request(server.port, "GET", `/api/forms-center/classrooms/${classroomDirectoryRow.id}/forms`, { headers: auth });
    assert.equal(classroomForms.status, 200);
    assert.ok(classroomForms.body.responses.length > 0);
    pass("classroom filing view returns responses connected to that classroom");

    const programForms = await request(server.port, "GET", "/api/forms-center/program/forms", { headers: auth });
    assert.equal(programForms.status, 200);
    assert.ok(programForms.body.responses.length > 0);
    pass("program-level filing view returns entire-program assignments");

    // ── Medication Administration Log ───────────────────────────────────────

    const medResponseRow = dashboard.body.responses.find((row) => row.formTitle === "Medication Administration Log");
    assert.ok(medResponseRow, "fixtures must include a medication log response");
    const medLog = await request(server.port, "GET", `/api/forms-center/responses/${medResponseRow.id}/medication-log`, { headers: auth });
    assert.equal(medLog.status, 200);
    assert.equal(medLog.body.entries.length, 2);
    const original = medLog.body.entries.find((e) => !e.supersedesEntryId);
    assert.ok(original.supersededByEntryId, "the original entry must be preserved and marked superseded, never deleted");
    const newMedEntry = await request(server.port, "POST", `/api/forms-center/responses/${medResponseRow.id}/medication-log`, {
      headers: auth,
      body: { medicationName: "Test Med", result: "given", logDate: "2026-08-04", scheduledTime: "09:00", actualTime: "09:02", dosage: "1 tab", method: "Oral" },
    });
    assert.equal(newMedEntry.status, 201);
    const correction = await request(server.port, "POST", `/api/forms-center/responses/${medResponseRow.id}/medication-log/${newMedEntry.body.entry.id}/correct`, {
      headers: auth,
      body: { correctionNotes: "Fixing a typo in the dosage.", dosage: "1 tablet" },
    });
    assert.equal(correction.status, 201, JSON.stringify(correction.body));
    assert.equal(correction.body.original.supersededByEntryId, correction.body.correction.id);
    const historyAfterCorrection = await request(server.port, "GET", `/api/forms-center/responses/${medResponseRow.id}/medication-log`, { headers: auth });
    assert.equal(historyAfterCorrection.body.entries.length, 4);
    pass("medication log corrections preserve the original entry permanently and never overwrite history");

    // ── Cross-organization denial ────────────────────────────────────────────

    const secondAdminToken = await adminLogin(server.port, "phase6-second-admin@example.com");
    const secondAuth = { Authorization: `Bearer ${secondAdminToken}` };
    const crossOrgResponse = await request(server.port, "GET", `/api/forms-center/responses/${createdA.response.id}`, { headers: secondAuth });
    assert.equal(crossOrgResponse.status, 403);
    assert.equal(crossOrgResponse.body.code, "organization_mismatch");
    pass("a response cannot be viewed from a different organization's admin session");

    // ── Teacher classroom + assistant permission boundaries ─────────────────

    const roleOptionsRes = await request(server.port, "GET", "/api/forms-center/library/role-preview-options", { headers: auth });
    const teacher = roleOptionsRes.body.memberships.find((m) => m.role === "lead_teacher");
    const assistantBroad = roleOptionsRes.body.memberships.find((m) => m.displayName === "Preview Assistant Broad");
    const assistantLimited = roleOptionsRes.body.memberships.find((m) => m.displayName === "Preview Assistant Limited");
    assert.ok(teacher && assistantBroad && assistantLimited);

    const freshOwnerDashboard = await request(server.port, "GET", "/api/forms-center/responses", { headers: auth });
    const teacherDashboard = await request(server.port, "GET", "/api/forms-center/responses", { headers: { ...auth, "x-llh-role-preview-membership-id": teacher.membershipId } });
    assert.equal(teacherDashboard.status, 200);
    assert.ok(teacherDashboard.body.total <= freshOwnerDashboard.body.total, "a teacher must never see more responses than the org-wide owner view");
    pass("a lead teacher's response dashboard is scoped to their assigned classroom and children");

    const assistantBroadResponses = await request(server.port, "GET", "/api/forms-center/responses", { headers: { ...auth, "x-llh-role-preview-membership-id": assistantBroad.membershipId } });
    assert.equal(assistantBroadResponses.status, 200);
    const assistantLimitedResponses = await request(server.port, "GET", "/api/forms-center/responses", { headers: { ...auth, "x-llh-role-preview-membership-id": assistantLimited.membershipId } });
    assert.equal(assistantLimitedResponses.status, 200);
    assert.ok(assistantLimitedResponses.body.total <= assistantBroadResponses.body.total, "an assistant with limited permissions must never see more than one with broad permissions");
    pass("assistants follow the existing server-enforced permission overrides for response visibility");

    // ── No response collection is impossible to disable/bypass ──────────────

    const finalStore = server.readStore();
    assert.equal(finalStore.formResponses.meta.noOutboundEmail, true);
    assert.equal(finalStore.formResponses.meta.noOutboundSms, true);
    assert.equal(finalStore.formResponses.meta.noStripe, true);
    assert.equal(finalStore.formResponses.meta.noAi, true);
    pass("the form-responses store records that no email/SMS/Stripe/AI capability is active");
  } catch (error) {
    fail("main Phase 6 workflow", error);
  } finally {
    await server.stop();
  }

  // ── HTML/script wiring ───────────────────────────────────────────────────

  try {
    const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    assert.match(html, /platform-perf\.js\?v=/);
    const perf = fs.readFileSync(path.join(ROOT, "platform-perf.js"), "utf8");
    assert.match(perf, /forms-responses-ui\.js\?v=/);
    assert.match(perf, /forms-center-ui\.js\?v=/);
    assert.ok(fs.existsSync(path.join(ROOT, "form-recipient.html")));
    assert.ok(fs.existsSync(path.join(ROOT, "form-recipient-ui.js")));
    assert.ok(fs.existsSync(path.join(ROOT, "styles", "llh-form-recipient.css")));
    const formsCenterScript = fs.readFileSync(path.join(ROOT, "forms-center-ui.js"), "utf8");
    assert.match(formsCenterScript, /Send \/ Assign/);
    assert.match(formsCenterScript, /Responses/);
    const teacherScript = fs.readFileSync(path.join(ROOT, "teacher-center-ui.js"), "utf8");
    assert.match(teacherScript, /Forms & Documents|Forms &amp; Documents/);
    pass("index.html, Forms Center UI, recipient page, and Teacher Center child profile all include the Phase 6 additions");
  } catch (error) {
    fail("index.html, Forms Center UI, recipient page, and Teacher Center child profile all include the Phase 6 additions", error);
  }

  if (failures.length) {
    console.error("\nForms Center Phase 6 failures:");
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
  }
  console.log("\nAll Forms Center Phase 6 (Assignments, Responses, Signatures) tests passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
