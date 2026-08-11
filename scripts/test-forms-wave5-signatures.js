#!/usr/bin/env node
/**
 * Wave 5 — Native electronic signatures + signed-version immutability.
 * Also guards the PR #626 memory baseline (no hot-path full-store clone).
 *
 * Run: npm run test:forms-wave5-signatures
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const formsLib = require("../server/forms-lib.js");
const formsSignatureLib = require("../server/forms-signature-lib.js");
const programFormsLib = require("../server/program-forms-lib.js");
const dirtyState = require("./forms-dirty-state.js");
const signatureUi = require("./forms-signature-ui.js");

function pass(id) {
  console.log(`PASS  ${id}`);
}

function fail(id, error) {
  console.error(`FAIL  ${id}`);
  console.error(error);
  process.exitCode = 1;
}

function request(port, method, pathname, { email, body, familyToken, headers: extra = {} } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
    const headers = { Accept: "application/json", ...extra };
    if (payload) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(payload);
    }
    if (email) {
      headers["X-LLH-User-Email"] = email;
      headers.Authorization = `Bearer test:${email}`;
    }
    if (familyToken) {
      headers.Authorization = `Bearer ${familyToken}`;
      headers["X-LLH-Family-Session"] = familyToken;
    }
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: pathname,
      method,
      headers,
    }, (res) => {
      let text = "";
      res.on("data", (chunk) => { text += chunk; });
      res.on("end", () => {
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch (_e) { json = null; }
        resolve({ status: res.statusCode, text, json });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function spawnServer({ port, storePath }) {
  return spawn(process.execPath, [path.join(ROOT, "server/index.js")], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "test",
      HOME_DAYCARE_HUB_TESTING: "1",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: storePath,
      LLH_ALLOW_EPHEMERAL_FAMILY_HUB: "1",
      MONITOR_ALERTS_ENABLED: "false",
      ADMIN_EMAIL: "owner@wave5.test",
      ADMIN_PASSWORD: "wave5-pass",
      ADMIN_ACCESS_CODE: "12345",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForHealth(port, child, tries = 80) {
  for (let i = 0; i < tries; i += 1) {
    if (child.exitCode != null) throw new Error(`server exited early: ${child.exitCode}`);
    try {
      const res = await request(port, "GET", "/api/health");
      if (res.status === 200) return;
    } catch (_e) { /* retry */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("health timeout");
}

function tinyPngDataUrl() {
  // 1x1 PNG
  return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
}

function sourceMarkers() {
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  const formsLibJs = fs.readFileSync(path.join(ROOT, "server/forms-lib.js"), "utf8");
  const sigLib = fs.readFileSync(path.join(ROOT, "server/forms-signature-lib.js"), "utf8");
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.match(sigLib, /SIGNED-version|immutable|createSupersedingVersion|attachSignatureToVersion/i);
  assert.match(sigLib, /MAX_DRAWN_DATA_URI_CHARS/);
  assert.match(formsLibJs, /applyFormBodyEditPreservingHistory/);
  assert.match(serverJs, /formsSignatureLib/);
  assert.match(serverJs, /expectedVersionId/);
  assert.doesNotMatch(
    serverJs.match(/function readStore\(\) \{[\s\S]*?\n\}/)[0],
    /structuredClone\(storeCache/,
  );
  assert.match(appJs, /LLHFormsSignatureUi/);
  assert.match(appJs, /signStaffPaperworkDocument/);
  assert.match(indexHtml, /forms-signature-ui\.js/);
  assert.match(indexHtml, /20260811-forms-wave5-signatures1/);
  // Phase 9: AI must never auto-sign
  assert.doesNotMatch(appJs, /AI[\s\S]{0,40}auto[\s\S]{0,20}sign|signForParent\(/i);
  pass("source_markers_wave5_and_memory_guard");
}

function unitSignatureAndVersions() {
  const body = "Field trip permission body";
  const hash = formsLib.hashFormBody(body);
  const doc = {
    id: "doc1",
    draftText: body,
    bodyHash: hash,
    contentVersion: 1,
    fields: [
      { id: "fld_agree", type: "checkbox", label: "I agree", required: true, order: 0 },
    ],
    answers: {},
  };
  assert.throws(
    () => formsSignatureLib.validateRequiredAnswers(doc.fields, {}),
    /required fields/i,
  );
  const sig = formsSignatureLib.buildSignatureRecord(doc, {
    signerName: "Alex Parent",
    typedSignature: "Alex Parent",
    signatureMethod: "typed",
    signerUserId: "parent@example.com",
    signedRole: "guardian",
    answers: { fld_agree: true },
  });
  assert.equal(sig.signatureMethod, "typed");
  assert.equal(sig.signerUserId, "parent@example.com");
  const frozen = formsSignatureLib.attachSignatureToVersion(
    { ...doc, answers: { fld_agree: true } },
    { ...sig, answers: { fld_agree: true } },
    { expectedBodyHash: hash },
  );
  assert.ok(frozen.signedAt);
  assert.equal(frozen.versions.length, 1);
  assert.equal(frozen.versions[0].immutable, true);
  assert.ok(frozen.versions[0].signature.signedAt);

  // Idempotent
  assert.equal(
    formsSignatureLib.isIdempotentResign(frozen, {
      signerUserId: "parent@example.com",
      expectedBodyHash: hash,
    }),
    true,
  );

  // Stale version
  assert.throws(
    () => formsSignatureLib.attachSignatureToVersion(
      { ...doc, signedAt: "", versions: undefined },
      sig,
      { expectedVersionId: "not-the-current-id", expectedBodyHash: hash },
    ),
    /updated/i,
  );

  // Supersede preserves history
  const next = formsSignatureLib.createSupersedingVersion(frozen, {
    nextBody: `${body} — corrected`,
    reason: "Director correction",
    createdBy: "owner@example.com",
    voidPrior: true,
  });
  assert.equal(next.status, "needs_correction");
  assert.equal(next.signedAt, "");
  assert.ok(next.versions.length >= 2);
  const voided = next.versions.find((v) => v.voided);
  assert.ok(voided?.signature?.signedAt, "voided signed version remains historically signed");

  // Drawn size limit
  assert.throws(
    () => formsSignatureLib.normalizeDrawnSignatureDataUrl(`data:image/png;base64,${"A".repeat(60000)}`),
    /too large/i,
  );
  const drawn = formsSignatureLib.normalizeDrawnSignatureDataUrl(tinyPngDataUrl());
  assert.ok(drawn.startsWith("data:image/png;base64,"));

  // Dirty-state helper still works during signature flows
  dirtyState.touch("doc1", "typedSignature", "Alex");
  assert.equal(dirtyState.shouldKeepLocal("doc1", "typedSignature", 0), true);
  pass("unit_signature_versions_void_supersede");
}

function unitUiModule() {
  assert.ok(signatureUi.buildPanelHtml);
  const html = signatureUi.buildPanelHtml({
    documentId: "d1",
    title: "Handbook",
    bodyText: "Please review",
    preferredName: "Sam",
  });
  assert.match(html, /Electronic Signature/);
  assert.match(html, /Sign &amp; Submit/);
  assert.match(html, /data-llh-sign-pad/);
  assert.match(html, /Clear signature/);
  pass("unit_signature_ui_markup");
}

async function integrationFamilyAndStaff() {
  const port = 21000 + Math.floor(Math.random() * 800);
  const storePath = path.join(os.tmpdir(), `llh-wave5-${crypto.randomBytes(4).toString("hex")}.json`);
  const owner = "owner@wave5.test";
  const teacher = "teacher@wave5.test";
  const parentA = "parent.a.wave5@example.invalid";
  const parentB = "parent.b.wave5@example.invalid";
  fs.writeFileSync(storePath, JSON.stringify({
    users: {
      [owner]: {
        email: owner,
        plan: "Pro",
        accountStatus: "Active",
        role: "owner",
        homeDaycareHubEnabled: true,
      },
      [teacher]: {
        email: teacher,
        plan: "Pro",
        accountStatus: "Active",
        role: "teacher",
        linkedProgramOwnerEmail: owner,
        programAccessViaOwner: true,
      },
    },
    familyHouseholds: {},
    familyHubSessions: {},
    formsAudit: [],
    programData: {},
    siteContent: {
      curriculum: {
        lessonPlans: [],
        activities: [],
        resources: [],
        series: [],
        updatedAt: new Date().toISOString(),
      },
    },
  }));
  const child = spawnServer({ port, storePath });
  const memSamples = [];
  try {
    await waitForHealth(port, child);

    await request(port, "POST", "/api/child-data", {
      email: owner,
      body: {
        data: {
          Profiles: [
            { id: "w5-ava", name: "Ava" },
            { id: "w5-other", name: "Other" },
          ],
          Documents: [],
        },
      },
    });

    const tpl = await request(port, "POST", "/api/program-forms/templates", {
      email: owner,
      body: {
        title: "Wave5 Policy",
        category: "Policy",
        body: "Please review and sign this policy.",
        fields: [{ id: "fld_ok", type: "checkbox", label: "I agree", required: true }],
        requiresSignature: true,
      },
    });
    assert.equal(tpl.status, 200, tpl.text.slice(0, 300));
    const templateId = tpl.json.template.id;

    const hhA = await request(port, "POST", "/api/family-hub/households", {
      email: owner,
      body: {
        label: "Family A",
        email: parentA,
        children: [{ id: "w5-ava" }],
        appOrigin: `http://127.0.0.1:${port}`,
      },
    });
    assert.equal(hhA.status, 200, hhA.text);
    const loginA = await request(port, "POST", "/api/family-hub/login", {
      body: { email: parentA, code: hhA.json.loginCode },
    });
    assert.equal(loginA.status, 200, loginA.text.slice(0, 300));
    const tokenA = loginA.json.sessionToken;

    const hhB = await request(port, "POST", "/api/family-hub/households", {
      email: owner,
      body: {
        label: "Family B",
        email: parentB,
        children: [{ id: "w5-other" }],
        appOrigin: `http://127.0.0.1:${port}`,
      },
    });
    assert.equal(hhB.status, 200, hhB.text);
    const loginB = await request(port, "POST", "/api/family-hub/login", {
      body: { email: parentB, code: hhB.json.loginCode },
    });
    const tokenB = loginB.json.sessionToken;

    const preview = await request(port, "POST", "/api/program-forms/assign/preview", {
      email: owner,
      body: {
        audience: "family",
        mode: "children",
        assignmentScope: "child",
        childIds: ["w5-ava"],
      },
    });
    assert.equal(preview.status, 200, preview.text);
    const send = await request(port, "POST", "/api/program-forms/assign/confirm-send", {
      email: owner,
      body: {
        idempotencyKey: crypto.randomUUID(),
        templateId,
        formSpec: {
          title: "Wave5 Policy",
          body: "Please review and sign this policy.",
          fields: [{ id: "fld_ok", type: "checkbox", label: "I agree", required: true }],
          templateId,
          requiresSignature: true,
        },
        target: {
          audience: "family",
          mode: "children",
          assignmentScope: "child",
          childIds: ["w5-ava"],
        },
        shareWithFamily: true,
        expected: preview.json.counts,
      },
    });
    assert.equal(send.status, 200, send.text.slice(0, 400));
    const docId = (send.json.createdIds || [])[0];
    assert.ok(docId, "created assignment id");

    const meA = await request(port, "GET", "/api/family-hub/me", { familyToken: tokenA });
    assert.equal(meA.status, 200);
    const familyDoc = (meA.json.documents || []).find((d) => String(d.id) === String(docId));
    assert.ok(familyDoc, "family can see shared assignment");
    const versionId = familyDoc.currentVersionId;
    const bodyHash = familyDoc.bodyHash;

    const staffPreview = await request(port, "POST", "/api/program-forms/assign/preview", {
      email: owner,
      body: { audience: "staff", mode: "staff", staffEmails: [teacher] },
    });
    assert.equal(staffPreview.status, 200, staffPreview.text);
    const staffSend = await request(port, "POST", "/api/program-forms/assign/confirm-send", {
      email: owner,
      body: {
        idempotencyKey: crypto.randomUUID(),
        formSpec: {
          title: "Staff handbook ack",
          body: "Staff policy text",
          fields: [],
          requiresSignature: true,
        },
        target: { audience: "staff", mode: "staff", staffEmails: [teacher] },
        shareWithFamily: false,
        expected: staffPreview.json.counts,
      },
    });
    assert.equal(staffSend.status, 200, staffSend.text.slice(0, 400));
    const staffDocId = (staffSend.json.createdIds || [])[0];
    assert.ok(staffDocId);

    const login = await request(port, "POST", "/api/admin/login", {
      body: { email: owner, password: "wave5-pass", code: "12345", accessCode: "12345" },
    });
    const adminToken = login.json?.token || login.json?.adminToken || "";
    if (adminToken) {
      const health = await request(port, "GET", `/api/admin/store-health?adminToken=${encodeURIComponent(adminToken)}`);
      memSamples.push({ label: "baseline", ...(health.json?.health?.memory || {}) });
    }

    const cross = await request(port, "POST", `/api/family-hub/documents/${docId}/acknowledge`, {
      familyToken: tokenB,
      body: {
        signatureMethod: "typed",
        typedSignature: "Parent B",
        answers: { fld_ok: true },
        expectedVersionId: versionId,
        expectedBodyHash: bodyHash,
      },
    });
    assert.equal(cross.status, 404, "cross-household sign must 404");

    const missing = await request(port, "POST", `/api/family-hub/documents/${docId}/acknowledge`, {
      familyToken: tokenA,
      body: {
        signatureMethod: "typed",
        typedSignature: "Parent A",
        answers: {},
        expectedVersionId: versionId,
        expectedBodyHash: bodyHash,
      },
    });
    assert.equal(missing.status, 400);
    assert.equal(missing.json?.code, "required_fields_missing");

    const stale = await request(port, "POST", `/api/family-hub/documents/${docId}/acknowledge`, {
      familyToken: tokenA,
      body: {
        signatureMethod: "typed",
        typedSignature: "Parent A",
        answers: { fld_ok: true },
        expectedVersionId: "stale_version_id",
        expectedBodyHash: bodyHash,
      },
    });
    assert.equal(stale.status, 409);
    assert.equal(stale.json?.code, "stale_version");

    const signed = await request(port, "POST", `/api/family-hub/documents/${docId}/acknowledge`, {
      familyToken: tokenA,
      body: {
        signatureMethod: "typed",
        typedSignature: "Parent A",
        answers: { fld_ok: true },
        expectedVersionId: versionId,
        expectedBodyHash: bodyHash,
      },
      headers: { "X-Forwarded-For": "203.0.113.10" },
    });
    assert.equal(signed.status, 200, signed.text.slice(0, 400));
    assert.ok(signed.json?.document?.signedAt);
    assert.equal(signed.json.document.signatureMethod, "typed");
    assert.equal(signed.json.document.canAcknowledge, false);

    const again = await request(port, "POST", `/api/family-hub/documents/${docId}/acknowledge`, {
      familyToken: tokenA,
      body: {
        signatureMethod: "typed",
        typedSignature: "Parent A",
        answers: { fld_ok: true },
        expectedVersionId: versionId,
        expectedBodyHash: bodyHash,
      },
    });
    assert.equal(again.status, 200);
    assert.equal(again.json?.idempotentReplay, true);

    const staffSign = await request(port, "POST", `/api/program-forms/staff-documents/${staffDocId}/sign`, {
      email: teacher,
      body: {
        signatureMethod: "drawn",
        typedSignature: "Taylor Teacher",
        drawnSignatureDataUrl: tinyPngDataUrl(),
      },
    });
    assert.equal(staffSign.status, 200, staffSign.text.slice(0, 400));
    assert.ok(staffSign.json?.staffDocument?.signedAt);
    assert.equal(staffSign.json.staffDocument.signatureMethod, "drawn");

    const peer = await request(port, "POST", `/api/program-forms/staff-documents/${staffDocId}/sign`, {
      email: owner,
      body: {
        signatureMethod: "typed",
        typedSignature: "Owner Forged",
        assigneeEmail: teacher,
        signerUserId: teacher,
      },
    });
    assert.equal(peer.status, 403);

    const staffAgain = await request(port, "POST", `/api/program-forms/staff-documents/${staffDocId}/sign`, {
      email: teacher,
      body: {
        signatureMethod: "drawn",
        typedSignature: "Taylor Teacher",
        drawnSignatureDataUrl: tinyPngDataUrl(),
      },
    });
    assert.equal(staffAgain.status, 200);
    assert.equal(staffAgain.json?.idempotentReplay, true);

    const supersede = await request(port, "POST", "/api/program-forms/versions/supersede", {
      email: owner,
      body: {
        documentId: docId,
        assigneeType: "child",
        nextBody: "Please review and sign this policy. (Corrected)",
        reason: "Updated pickup wording",
        voidPrior: true,
      },
    });
    assert.equal(supersede.status, 200, supersede.text.slice(0, 400));
    assert.equal(supersede.json?.document?.status, "needs_correction");
    assert.ok((supersede.json?.document?.versions || []).some((v) => v.voided));

    const audit = await request(port, "GET", "/api/program-forms/audit?limit=100", { email: owner });
    assert.equal(audit.status, 200);
    const actions = (audit.json?.audit || []).map((row) => row.action);
    assert.ok(actions.includes("SIGNED"));
    assert.ok(actions.includes("SUBMITTED"));
    assert.ok(
      actions.includes("VERSION_CREATED")
      || actions.includes("SUPERSEDED")
      || actions.includes("NEEDS_CORRECTION"),
    );
    assert.ok(!(audit.json?.audit || []).some((row) => /data:image\/png/i.test(JSON.stringify(row))));

    if (adminToken) {
      const healthAfter = await request(port, "GET", `/api/admin/store-health?adminToken=${encodeURIComponent(adminToken)}`);
      memSamples.push({ label: "after_sign_flows", ...(healthAfter.json?.health?.memory || {}) });
    }

    pass("integration_family_staff_security_idempotent_stale_supersede");
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(storePath); } catch (_e) { /* ignore */ }
    try { fs.unlinkSync(storePath.replace(/(\.json)?$/, ".admin-sessions.json")); } catch (_e) { /* ignore */ }
  }
  if (memSamples.length) {
    console.log("MEMORY_SAMPLES", JSON.stringify(memSamples));
    const peak = Math.max(...memSamples.map((m) => Number(m.rssMb) || 0));
    assert.ok(peak < 300, `wave5 local RSS peak ${peak} should stay under 300MB investigation threshold`);
    pass("memory_samples_under_investigation_threshold");
  } else {
    pass("memory_samples_skipped_no_admin");
  }
}

async function main() {
  try { sourceMarkers(); } catch (error) { fail("source_markers_wave5_and_memory_guard", error); }
  try { unitSignatureAndVersions(); } catch (error) { fail("unit_signature_versions_void_supersede", error); }
  try { unitUiModule(); } catch (error) { fail("unit_signature_ui_markup", error); }
  try { await integrationFamilyAndStaff(); } catch (error) { fail("integration_family_staff_security_idempotent_stale_supersede", error); }
  if (process.exitCode) {
    console.error("Wave 5 signature tests FAILED");
    process.exit(1);
  }
  console.log("Wave 5 signature tests: ALL PASSED");
}

main();
