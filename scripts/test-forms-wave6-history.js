#!/usr/bin/env node
/**
 * Wave 6 — Document history / audit timeline + completed-record print safety.
 * Preserves Waves 1–5 + PR #626 memory guardrails.
 *
 * Run: npm run test:forms-wave6-history
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
const formsRecordLib = require("../server/forms-record-lib.js");
const detailUi = require("./forms-document-detail.js");

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
      ADMIN_EMAIL: "owner@wave6.test",
      ADMIN_PASSWORD: "wave6-pass",
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
  return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
}

function sourceMarkers() {
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  const recordLib = fs.readFileSync(path.join(ROOT, "server/forms-record-lib.js"), "utf8");
  const routes = fs.readFileSync(path.join(ROOT, "server/program-forms-routes.js"), "utf8");
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const detailJs = fs.readFileSync(path.join(ROOT, "scripts/forms-document-detail.js"), "utf8");
  assert.match(recordLib, /buildCompletedRecordDto|buildDocumentDetailDto|buildTimelineEntries/);
  assert.match(routes, /completed-record|handleGetDocumentDetail/);
  assert.match(serverJs, /handleFamilyHubCompletedRecord|formsRecordLib/);
  assert.doesNotMatch(
    serverJs.match(/function readStore\(\) \{[\s\S]*?\n\}/)[0],
    /structuredClone\(storeCache/,
  );
  assert.match(appJs, /LLHFormsDocumentDetail|openPaperworkDocumentDetail|data-open-document-detail/);
  assert.match(indexHtml, /forms-document-detail\.js/);
  assert.match(indexHtml, /20260811-forms-wave8-closeout1/);
  assert.match(detailJs, /SUPERSEDED \/ HISTORICAL VERSION|Signed Electronically|renderCompletedRecordPrintHtml/);
  // No Teaching Kit PDF rewrite
  assert.doesNotMatch(detailJs, /teaching-kit-print|buildTrialWatermarkedPdfBuffer/);
  // Phase 9: AI must never auto-sign
  assert.doesNotMatch(appJs, /AI[\s\S]{0,40}auto[\s\S]{0,20}sign|signForParent\(/i);
  pass("source_markers_wave6_and_memory_guard");
}

function unitHistoricalPrintSafety() {
  const bodyV1 = "Version 1 body — sunscreen permission ORIGINAL";
  const bodyV2 = "Version 2 body — sunscreen permission CORRECTED date";
  let doc = {
    id: "child-doc-hist",
    title: "Sunscreen",
    draftText: bodyV1,
    bodyHash: formsLib.hashFormBody(bodyV1),
    contentVersion: 1,
    childId: "child1",
    shareWithFamily: true,
    fields: [],
    answers: {},
  };
  doc = formsSignatureLib.ensureDocumentVersions(doc);
  const sig1 = formsSignatureLib.buildSignatureRecord(doc, {
    signerName: "Parent One",
    typedSignature: "Parent One",
    signedRole: "guardian",
    signatureMethod: "typed",
    signerUserId: "parent@wave6.test",
  });
  doc = formsSignatureLib.attachSignatureToVersion(doc, sig1);
  const v1Id = doc.currentVersionId;
  doc = formsSignatureLib.createSupersedingVersion(doc, {
    nextBody: bodyV2,
    reason: "Incorrect date",
    createdBy: "owner@wave6.test",
    voidPrior: true,
  });
  const v2Id = doc.currentVersionId;
  assert.notEqual(v1Id, v2Id);

  const located = { document: doc, assigneeType: "child", index: 0, collection: [doc] };
  const auth = { level: "director", canViewAudit: true, canViewVersions: true, canPrint: true };
  const rec1 = formsRecordLib.buildCompletedRecordDto({
    located,
    versionId: v1Id,
    auth,
    programName: "Test Program",
    recipient: { childName: "Ava", recipientLabel: "Ava", recipientKind: "child" },
  });
  const rec2 = formsRecordLib.buildCompletedRecordDto({
    located,
    versionId: v2Id,
    auth,
    programName: "Test Program",
    recipient: { childName: "Ava", recipientLabel: "Ava", recipientKind: "child" },
  });
  assert.match(rec1.record.bodyText, /ORIGINAL/);
  assert.doesNotMatch(rec1.record.bodyText, /CORRECTED/);
  assert.equal(rec1.record.signature.signerDisplayName, "Parent One");
  assert.ok(rec1.record.markers.some((m) => /VOIDED|SUPERSEDED|HISTORICAL/i.test(m)));
  assert.match(rec2.record.bodyText, /CORRECTED/);
  assert.doesNotMatch(rec2.record.bodyText, /ORIGINAL/);
  // V2 is unsigned after supersede — must not carry Parent One's signature onto new content
  assert.equal(rec2.record.signature, null);

  const html1 = detailUi.renderCompletedRecordPrintHtml(rec1.record);
  assert.match(html1, /ORIGINAL/);
  assert.doesNotMatch(html1, /CORRECTED/);
  assert.match(html1, /VOIDED|SUPERSEDED|HISTORICAL/i);
  assert.doesNotMatch(html1, /ipHash|userAgent|data:image\/png;base64,[A-Za-z0-9+/=]{80,}/);
  assert.doesNotMatch(html1, /fa_[a-z0-9]+/); // no raw audit ids dumped as content noise

  // Drawn signature renders as img, not raw dump
  let drawnDoc = {
    id: "staff-drawn",
    title: "Handbook",
    draftText: "Staff handbook ack",
    bodyHash: formsLib.hashFormBody("Staff handbook ack"),
    contentVersion: 1,
    assigneeEmail: "teacher@wave6.test",
  };
  drawnDoc = formsSignatureLib.ensureDocumentVersions(drawnDoc);
  const drawnSig = formsSignatureLib.buildSignatureRecord(drawnDoc, {
    signerName: "Teacher Tee",
    typedSignature: "Teacher Tee",
    signedRole: "teacher",
    signatureMethod: "drawn",
    drawnSignatureDataUrl: tinyPngDataUrl(),
    signerUserId: "teacher@wave6.test",
  });
  drawnDoc = formsSignatureLib.attachSignatureToVersion(drawnDoc, drawnSig);
  const drawnRec = formsRecordLib.buildCompletedRecordDto({
    located: { document: drawnDoc, assigneeType: "staff" },
    auth: { level: "staff_self" },
    programName: "Test Program",
    recipient: { assigneeEmail: "teacher@wave6.test", recipientKind: "staff", recipientLabel: "teacher@wave6.test" },
  });
  assert.ok(drawnRec.record.signature.hasDrawnSignature);
  const drawnHtml = detailUi.renderCompletedRecordPrintHtml(drawnRec.record);
  assert.match(drawnHtml, /<img[^>]+alt="Drawn electronic signature"/i);
  assert.doesNotMatch(drawnHtml, />data:image\/png;base64/);

  // Timeline omits sensitive meta
  const timeline = formsRecordLib.buildTimelineEntries([
    {
      id: "fa_1",
      at: "2026-08-11T12:00:00.000Z",
      action: "SIGNED",
      actorRole: "guardian",
      actorUserId: "parent@wave6.test",
      documentId: "child-doc-hist",
      detail: "ok",
      meta: { ipHash: "abc123secret" },
    },
  ], { documentId: "child-doc-hist" });
  assert.equal(timeline[0].summary, "Signed electronically");
  assert.ok(!JSON.stringify(timeline).includes("abc123secret"));
  assert.ok(!JSON.stringify(timeline).includes("ipHash"));

  pass("unit_historical_print_and_timeline_safety");
}

async function integrationDetailAuthAndIdempotency() {
  const port = 42000 + Math.floor(Math.random() * 1000);
  const storePath = path.join(os.tmpdir(), `llh-wave6-${crypto.randomBytes(4).toString("hex")}.json`);
  const owner = "owner@wave6.test";
  const teacher = "teacher@wave6.test";
  const peerTeacher = "peer@wave6.test";
  const parentA = "parent.a.wave6@example.invalid";
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
      [peerTeacher]: {
        email: peerTeacher,
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
          Profiles: [{ id: "w6-ava", name: "Ava" }],
          Documents: [],
        },
      },
    });

    const tpl = await request(port, "POST", "/api/program-forms/templates", {
      email: owner,
      body: {
        title: "Wave6 Permission",
        category: "Permission",
        body: "Wave6 V1 body for history ORIGINAL",
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
        children: [{ id: "w6-ava" }],
        appOrigin: `http://127.0.0.1:${port}`,
      },
    });
    assert.equal(hhA.status, 200, hhA.text);
    const loginA = await request(port, "POST", "/api/family-hub/login", {
      body: { email: parentA, code: hhA.json.loginCode },
    });
    assert.equal(loginA.status, 200, loginA.text.slice(0, 300));
    const tokenA = loginA.json.sessionToken;

    const preview = await request(port, "POST", "/api/program-forms/assign/preview", {
      email: owner,
      body: {
        audience: "family",
        mode: "children",
        assignmentScope: "child",
        childIds: ["w6-ava"],
      },
    });
    assert.equal(preview.status, 200, preview.text);
    const send = await request(port, "POST", "/api/program-forms/assign/confirm-send", {
      email: owner,
      body: {
        idempotencyKey: crypto.randomUUID(),
        templateId,
        formSpec: {
          title: "Wave6 Permission",
          body: "Wave6 V1 body for history ORIGINAL",
          fields: [{ id: "fld_ok", type: "checkbox", label: "I agree", required: true }],
          templateId,
          requiresSignature: true,
        },
        target: {
          audience: "family",
          mode: "children",
          assignmentScope: "child",
          childIds: ["w6-ava"],
        },
        shareWithFamily: true,
        expected: preview.json.counts,
      },
    });
    assert.equal(send.status, 200, send.text.slice(0, 400));
    const docId = (send.json.createdIds || [])[0];
    assert.ok(docId, "created assignment id");

    const meA = await request(port, "GET", "/api/family-hub/me", { familyToken: tokenA });
    const familyDoc = (meA.json.documents || []).find((d) => String(d.id) === String(docId));
    assert.ok(familyDoc);
    const versionId = familyDoc.currentVersionId;
    const bodyHash = familyDoc.bodyHash;

    const signed = await request(port, "POST", `/api/family-hub/documents/${docId}/acknowledge`, {
      familyToken: tokenA,
      body: {
        signatureMethod: "typed",
        typedSignature: "Parent A",
        answers: { fld_ok: true },
        expectedVersionId: versionId,
        expectedBodyHash: bodyHash,
      },
    });
    assert.equal(signed.status, 200, signed.text.slice(0, 400));

    // Idempotent SIGNED — no duplicate events from replay
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
    assert.equal(again.json?.idempotentReplay, true);

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
          title: "Staff handbook Wave6",
          body: "Staff handbook body V1",
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

    const staffSign = await request(port, "POST", `/api/program-forms/staff-documents/${staffDocId}/sign`, {
      email: teacher,
      body: {
        signatureMethod: "drawn",
        typedSignature: "Teacher Tee",
        drawnSignatureDataUrl: tinyPngDataUrl(),
      },
    });
    assert.equal(staffSign.status, 200, staffSign.text.slice(0, 400));

    // Audit matrix
    const teacherAudit = await request(port, "GET", "/api/program-forms/audit", { email: teacher });
    assert.equal(teacherAudit.status, 403);
    const peerAudit = await request(port, "GET", "/api/program-forms/audit", { email: peerTeacher });
    assert.equal(peerAudit.status, 403);
    const parentAudit = await request(port, "GET", "/api/program-forms/audit", { familyToken: tokenA });
    assert.ok(parentAudit.status === 401 || parentAudit.status === 403);
    const ownerAudit = await request(port, "GET", `/api/program-forms/audit?documentId=${encodeURIComponent(docId)}`, {
      email: owner,
    });
    assert.equal(ownerAudit.status, 200);
    assert.ok(Array.isArray(ownerAudit.json.timeline));
    assert.ok(ownerAudit.json.timeline.some((row) => row.action === "SIGNED"));
    const signedCount = ownerAudit.json.timeline.filter((row) => row.action === "SIGNED").length;
    assert.equal(signedCount, 1, "idempotent resign must not duplicate SIGNED");
    assert.doesNotMatch(JSON.stringify(ownerAudit.json.timeline), /ipHash|drawnSignature|answers/);

    // Director detail + completed record
    const detail = await request(
      port,
      "GET",
      `/api/program-forms/documents/${encodeURIComponent(docId)}/detail?assigneeType=child`,
      { email: owner },
    );
    assert.equal(detail.status, 200, detail.text.slice(0, 400));
    assert.ok(detail.json.capabilities?.canViewAudit);
    assert.ok(detail.json.signature?.status === "signed");
    assert.doesNotMatch(JSON.stringify(detail.json), /"ipHash"|userAgentHash/);

    const completed = await request(
      port,
      "GET",
      `/api/program-forms/documents/${encodeURIComponent(docId)}/completed-record?assigneeType=child`,
      { email: owner },
    );
    assert.equal(completed.status, 200, completed.text.slice(0, 400));
    assert.equal(completed.json.readOnly, true);
    assert.match(completed.json.record.bodyText, /ORIGINAL/);
    assert.equal(completed.json.record.signature.signerDisplayName, "Parent A");

    // Supersede → historical print safety via API
    const supersede = await request(port, "POST", "/api/program-forms/versions/supersede", {
      email: owner,
      body: {
        documentId: docId,
        assigneeType: "child",
        nextBody: "Wave6 V2 body CORRECTED",
        reason: "Incorrect date",
        voidPrior: true,
      },
    });
    assert.equal(supersede.status, 200, supersede.text.slice(0, 400));
    const v1Id = detail.json.signature.versionId || detail.json.document.currentVersionId;
    const hist = await request(
      port,
      "GET",
      `/api/program-forms/documents/${encodeURIComponent(docId)}/completed-record?assigneeType=child&versionId=${encodeURIComponent(v1Id)}`,
      { email: owner },
    );
    assert.equal(hist.status, 200, hist.text.slice(0, 300));
    assert.match(hist.json.record.bodyText, /ORIGINAL/);
    assert.doesNotMatch(hist.json.record.bodyText, /CORRECTED/);
    assert.ok(hist.json.record.markers.some((m) => /VOIDED|SUPERSEDED|HISTORICAL/i.test(m)));
    const currentRec = await request(
      port,
      "GET",
      `/api/program-forms/documents/${encodeURIComponent(docId)}/completed-record?assigneeType=child`,
      { email: owner },
    );
    assert.match(currentRec.json.record.bodyText, /CORRECTED/);
    assert.equal(currentRec.json.record.signature, null);

    // No mutation from completed-record / detail reads
    const detailAfter = await request(
      port,
      "GET",
      `/api/program-forms/documents/${encodeURIComponent(docId)}/detail?assigneeType=child`,
      { email: owner },
    );
    assert.equal(detailAfter.json.document.currentVersionId, supersede.json.document.currentVersionId
      || detailAfter.json.document.currentVersionId);

    // Staff self completed ok; peer denied
    const staffSelf = await request(
      port,
      "GET",
      `/api/program-forms/documents/${encodeURIComponent(staffDocId)}/completed-record?assigneeType=staff`,
      { email: teacher },
    );
    assert.equal(staffSelf.status, 200, staffSelf.text.slice(0, 300));
    assert.ok(staffSelf.json.record.signature?.hasDrawnSignature);
    const peerRec = await request(
      port,
      "GET",
      `/api/program-forms/documents/${encodeURIComponent(staffDocId)}/completed-record?assigneeType=staff`,
      { email: peerTeacher },
    );
    assert.equal(peerRec.status, 403);

    // Family completed record authorized
    const famRec = await request(
      port,
      "GET",
      `/api/family-hub/documents/${encodeURIComponent(docId)}/completed-record?versionId=${encodeURIComponent(v1Id)}`,
      { familyToken: tokenA },
    );
    assert.equal(famRec.status, 200, famRec.text.slice(0, 400));
    assert.match(famRec.json.record.bodyText, /ORIGINAL/);
    // Family must not see staff paperwork via this path
    const famStaff = await request(
      port,
      "GET",
      `/api/family-hub/documents/${encodeURIComponent(staffDocId)}/completed-record`,
      { familyToken: tokenA },
    );
    assert.ok(famStaff.status === 403 || famStaff.status === 404);

    // Swapped versionId
    const badVer = await request(
      port,
      "GET",
      `/api/program-forms/documents/${encodeURIComponent(docId)}/completed-record?assigneeType=child&versionId=not-a-real-version`,
      { email: owner },
    );
    assert.equal(badVer.status, 404);

    const mem = await request(port, "GET", "/api/testing/memory-health");
    assert.equal(mem.status, 401);

    const rssMb = process.memoryUsage().rss / (1024 * 1024);
    memSamples.push({ label: "suite_rss", rssMb: Math.round(rssMb) });
    assert.ok(rssMb < 300, `suite RSS ${rssMb} under investigation threshold`);

    pass("integration_detail_auth_completed_record");
    console.log("MEMORY_SAMPLES", JSON.stringify(memSamples));
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(storePath); } catch (_e) { /* ignore */ }
  }
}

async function main() {
  try { sourceMarkers(); } catch (error) { fail("source_markers_wave6_and_memory_guard", error); }
  try { unitHistoricalPrintSafety(); } catch (error) { fail("unit_historical_print_and_timeline_safety", error); }
  try { await integrationDetailAuthAndIdempotency(); } catch (error) { fail("integration_detail_auth_completed_record", error); }
  if (!process.exitCode) console.log("Wave 6 history/completed-record tests: ALL PASSED");
}

main();
