#!/usr/bin/env node
"use strict";

/**
 * Phase 6 design-addition tests: the "locked approved record" and permanent
 * document/PDF-style snapshot feature. Continues from the existing Phase 6
 * work (scripts/test-forms-center-phase6.js) without duplicating it — this
 * file focuses only on the new document-view/snapshot behavior.
 */

const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const expansionFlags = require("./expansion-feature-flags.js");
const tokens = require("./form-recipient-tokens.js");

const { EXPANSION_FEATURE_KEYS } = expansionFlags;
const ROOT = path.join(__dirname, "..");
const ADMIN_EMAIL = "phase6-doc-admin@example.com";
const ADMIN_PASSWORD = "Phase6DocPass!99";
const ADMIN_CODE = "phase6-doc-code";

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

function baseStore(flags = { directorCenter: true, formsCenter: true, familyHub: true }) {
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

async function startServer({ env = {} } = {}) {
  const storePath = path.join(os.tmpdir(), `llh-fc-phase6-docs-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  fs.writeFileSync(storePath, JSON.stringify(baseStore(), null, 2));
  const port = 8300 + Math.floor(Math.random() * 800);
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
      ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW: "true",
      ALLOW_FORMS_CENTER_ADMIN_PREVIEW: "true",
      ADMIN_EMAIL,
      ADMIN_EMAILS: "phase6-doc-second-admin@example.com",
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
  return {
    port,
    stop: () => new Promise((resolve) => { child.once("exit", () => resolve()); child.kill("SIGTERM"); }),
  };
}

async function adminLogin(port, email = ADMIN_EMAIL) {
  const login = await request(port, "POST", "/api/admin/login", { body: { email, password: ADMIN_PASSWORD, code: ADMIN_CODE } });
  assert.equal(login.status, 200, `admin login failed: ${JSON.stringify(login.body)}`);
  return login.body.token;
}

async function fillSignSubmit(port, assignmentId, rawToken, { skipSign = false } = {}) {
  const headers = { [tokens.RECIPIENT_TOKEN_HEADER]: rawToken };
  const resolve = await request(port, "GET", `/api/form-recipient/${assignmentId}`, { headers });
  const fields = (resolve.body.version?.fields || []).filter((f) => !["content_heading", "content_paragraph", "content_divider"].includes(f.type));
  const answers = {};
  fields.forEach((field) => {
    if (field.type === "date") answers[field.id] = "2020-01-01";
    else if (field.type === "email") answers[field.id] = "guardian@example.invalid";
    else answers[field.id] = "Fixture Value";
  });
  await request(port, "POST", `/api/form-recipient/${assignmentId}/save-draft`, { headers, body: { answers } });
  if (!skipSign) {
    await request(port, "POST", `/api/form-recipient/${assignmentId}/signature`, { headers, body: { typedName: "Document Test Signer", consentGiven: true, signerRole: "parent_guardian" } });
  }
  return request(port, "POST", `/api/form-recipient/${assignmentId}/submit`, { headers, body: {} });
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

  const server = await startServer();
  try {
    const token = await adminLogin(server.port);
    const auth = { Authorization: `Bearer ${token}` };

    // Seed fixtures + get a fresh form to assign.
    await request(server.port, "GET", "/api/forms-center/responses", { headers: auth });
    const directory = await request(server.port, "GET", "/api/forms-center/recipients-directory", { headers: auth });
    const publishedForms = await request(server.port, "GET", "/api/forms-center/forms?status=published", { headers: auth });
    const emergencyForm = publishedForms.body.forms.find((f) => f.title === "Emergency Contact Form");
    assert.ok(emergencyForm);
    const child = directory.body.children[0];

    // ── Document not available before submission ────────────────────────

    const created = await request(server.port, "POST", "/api/forms-center/assignments", {
      headers: auth,
      body: { formId: emergencyForm.id, recipientType: "child", recipientIds: [child.id], requiredSignatureRoles: ["parent_guardian"] },
    });
    const assignment = created.body.created[0].assignment;
    const responseId = created.body.created[0].response.id;

    const tooEarlyAdmin = await request(server.port, "GET", `/api/forms-center/responses/${responseId}/document`, { headers: auth });
    assert.equal(tooEarlyAdmin.status, 409);
    assert.equal(tooEarlyAdmin.body.code, "document_not_available_yet");
    pass("admin document view is unavailable before a response is submitted");

    const link = await request(server.port, "POST", `/api/forms-center/assignments/${assignment.id}/testing-link/issue`, { headers: auth, body: {} });
    const rawToken = link.body.rawToken;
    const tooEarlyRecipient = await request(server.port, "GET", `/api/form-recipient/${assignment.id}/document`, { headers: { [tokens.RECIPIENT_TOKEN_HEADER]: rawToken } });
    assert.equal(tooEarlyRecipient.status, 409);
    assert.equal(tooEarlyRecipient.body.code, "document_not_available_yet");
    pass("recipient document view is unavailable before submitting their own response");

    // ── Live (non-frozen) document view after submission, before approval ──

    const submitResult = await fillSignSubmit(server.port, assignment.id, rawToken);
    assert.equal(submitResult.status, 200, JSON.stringify(submitResult.body));

    const liveAdminDoc = await request(server.port, "GET", `/api/forms-center/responses/${responseId}/document`, { headers: auth });
    assert.equal(liveAdminDoc.status, 200);
    assert.equal(liveAdminDoc.body.frozen, false);
    assert.equal(liveAdminDoc.body.content.status, "submitted");
    assert.equal(liveAdminDoc.body.content.form.title, "Emergency Contact Form");
    assert.ok(liveAdminDoc.body.content.sections.length > 0);
    assert.ok(liveAdminDoc.body.content.signatures.length === 1);
    pass("a submitted-but-not-approved response has a live (non-frozen) document view with full sections/answers/signatures");

    const liveRecipientDoc = await request(server.port, "GET", `/api/form-recipient/${assignment.id}/document`, { headers: { [tokens.RECIPIENT_TOKEN_HEADER]: rawToken } });
    assert.equal(liveRecipientDoc.status, 200);
    assert.equal(liveRecipientDoc.body.frozen, false);
    pass("the recipient sees the same live document view for their own response");

    // ── Approval locks in a permanent snapshot ───────────────────────────

    const approve = await request(server.port, "POST", `/api/forms-center/responses/${responseId}/approve`, { headers: auth, body: {} });
    assert.equal(approve.status, 200, JSON.stringify(approve.body));
    const snapshotId = approve.body.documentSnapshotId;
    assert.ok(snapshotId, "approving must auto-generate a permanent document snapshot");
    pass("approving a response automatically generates a permanent document snapshot (the 'locked approved record' step)");

    const frozenAdminDoc = await request(server.port, "GET", `/api/forms-center/responses/${responseId}/document`, { headers: auth });
    assert.equal(frozenAdminDoc.body.frozen, true);
    assert.equal(frozenAdminDoc.body.content.status, "approved");
    assert.ok(frozenAdminDoc.body.content.approvedAt);
    pass("once approved, the document view always returns the frozen permanent snapshot");

    const frozenRecipientDoc = await request(server.port, "GET", `/api/form-recipient/${assignment.id}/document`, { headers: { [tokens.RECIPIENT_TOKEN_HEADER]: rawToken } });
    assert.equal(frozenRecipientDoc.body.frozen, true);
    assert.deepEqual(frozenRecipientDoc.body.content, frozenAdminDoc.body.content, "the recipient and the admin must see byte-for-byte the same frozen document");
    pass("the recipient's frozen document exactly matches the admin's frozen document — one authoritative snapshot, never a second editable record");

    // ── The snapshot never silently changes ──────────────────────────────

    const regenerateNoForce = await request(server.port, "POST", `/api/forms-center/responses/${responseId}/document`, { headers: auth, body: {} });
    assert.equal(regenerateNoForce.status, 200);
    assert.equal(regenerateNoForce.body.documentSnapshotId, snapshotId, "regenerating without force must return the exact same permanent snapshot");
    pass("regenerating without force is idempotent and never creates a second snapshot");

    const regenerateForced = await request(server.port, "POST", `/api/forms-center/responses/${responseId}/document`, { headers: auth, body: { force: true } });
    assert.equal(regenerateForced.status, 200);
    assert.notEqual(regenerateForced.body.documentSnapshotId, snapshotId, "a forced regeneration creates a new permanent snapshot rather than mutating the old one");
    pass("a forced regeneration creates a brand-new snapshot without deleting or mutating the original one");

    // ── Cannot generate a document snapshot for a non-approved response ──

    const notApprovedCreate = await request(server.port, "POST", "/api/forms-center/assignments", {
      headers: auth,
      body: { formId: emergencyForm.id, recipientType: "child", recipientIds: [child.id] },
    });
    const notApprovedResponseId = notApprovedCreate.body.created[0].response.id;
    const rejectGenerate = await request(server.port, "POST", `/api/forms-center/responses/${notApprovedResponseId}/document`, { headers: auth, body: {} });
    assert.equal(rejectGenerate.status, 409);
    assert.equal(rejectGenerate.body.code, "not_approved");
    pass("a permanent document snapshot can only be generated for an approved response");

    // ── Correction history appears in the document ───────────────────────

    const correctionAssign = await request(server.port, "POST", "/api/forms-center/assignments", {
      headers: auth,
      body: { formId: emergencyForm.id, recipientType: "child", recipientIds: [child.id], requiredSignatureRoles: ["parent_guardian"] },
    });
    const correctionAssignment = correctionAssign.body.created[0].assignment;
    const correctionResponseId = correctionAssign.body.created[0].response.id;
    const correctionLink = await request(server.port, "POST", `/api/forms-center/assignments/${correctionAssignment.id}/testing-link/issue`, { headers: auth, body: {} });
    await fillSignSubmit(server.port, correctionAssignment.id, correctionLink.body.rawToken);
    await request(server.port, "POST", `/api/forms-center/responses/${correctionResponseId}/return-for-correction`, { headers: auth, body: { message: "Please add the missing phone number." } });
    await fillSignSubmit(server.port, correctionAssignment.id, correctionLink.body.rawToken);
    const correctedDoc = await request(server.port, "GET", `/api/forms-center/responses/${correctionResponseId}/document`, { headers: auth });
    assert.equal(correctedDoc.status, 200);
    assert.ok(correctedDoc.body.content.correctionHistory.some((entry) => entry.action === "returned_for_correction"));
    pass("the document view includes a correction-history entry for return-for-correction events");

    // ── Cross-recipient / cross-organization isolation ───────────────────

    const otherAssign = await request(server.port, "POST", "/api/forms-center/assignments", {
      headers: auth,
      body: { formId: emergencyForm.id, recipientType: "child", recipientIds: [directory.body.children[1].id] },
    });
    const otherAssignment = otherAssign.body.created[0].assignment;
    const otherLink = await request(server.port, "POST", `/api/forms-center/assignments/${otherAssignment.id}/testing-link/issue`, { headers: auth, body: {} });
    const crossDocAttempt = await request(server.port, "GET", `/api/form-recipient/${assignment.id}/document`, { headers: { [tokens.RECIPIENT_TOKEN_HEADER]: otherLink.body.rawToken } });
    assert.equal(crossDocAttempt.status, 401, "one recipient's token must never open a different recipient's document");
    pass("a recipient's token can never be used to view a different recipient's document");

    const secondAdminToken = await adminLogin(server.port, "phase6-doc-second-admin@example.com");
    const crossOrgDoc = await request(server.port, "GET", `/api/forms-center/responses/${responseId}/document`, { headers: { Authorization: `Bearer ${secondAdminToken}` } });
    assert.equal(crossOrgDoc.status, 403);
    assert.equal(crossOrgDoc.body.code, "organization_mismatch");
    pass("a document view cannot be opened from a different organization's admin session");

    // ── The structured response remains authoritative; the document is derived ──

    const rawStoreCheck = await request(server.port, "GET", `/api/forms-center/responses/${responseId}`, { headers: auth });
    assert.ok(rawStoreCheck.body.response.answers, "the response's structured answers must remain present and authoritative alongside its document snapshot");
    pass("the response's structured answers remain the authoritative record; the document snapshot is a derived, preserved view");
  } catch (error) {
    fail("main document/snapshot workflow", error);
  } finally {
    await server.stop();
  }

  // ── HTML/script wiring ───────────────────────────────────────────────────

  try {
    assert.ok(fs.existsSync(path.join(ROOT, "form-document.html")));
    assert.ok(fs.existsSync(path.join(ROOT, "form-document-ui.js")));
    assert.ok(fs.existsSync(path.join(ROOT, "form-document-view.js")));
    const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    assert.match(html, /form-document-view\.js\?v=/);
    const recipientHtml = fs.readFileSync(path.join(ROOT, "form-recipient.html"), "utf8");
    assert.match(recipientHtml, /form-document-view\.js\?v=/);
    const adminScript = fs.readFileSync(path.join(ROOT, "forms-responses-ui.js"), "utf8");
    assert.match(adminScript, /View Document/);
    assert.match(adminScript, /Download PDF/);
    const recipientScript = fs.readFileSync(path.join(ROOT, "form-recipient-ui.js"), "utf8");
    assert.match(recipientScript, /LLHFormDocumentView/);
    const recipientCss = fs.readFileSync(path.join(ROOT, "styles", "llh-form-recipient.css"), "utf8");
    assert.match(recipientCss, /\.fdv-document/);
    assert.match(recipientCss, /paper-style/i);
    pass("all standalone document pages, shared renderer, and paper-style CSS are wired into index.html, form-recipient.html, and the admin/recipient UI scripts");
  } catch (error) {
    fail("all standalone document pages, shared renderer, and paper-style CSS are wired in", error);
  }

  if (failures.length) {
    console.error("\nForms Center Phase 6 (document/PDF snapshot) failures:");
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
  }
  console.log("\nAll Forms Center Phase 6 document/PDF snapshot tests passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
