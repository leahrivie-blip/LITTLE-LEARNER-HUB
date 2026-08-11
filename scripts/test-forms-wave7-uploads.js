#!/usr/bin/env node
/**
 * Wave 7 — Document uploads + expiration + manual reminders + formPackets linking.
 * Preserves Waves 1–6 + PR #626 memory guardrails.
 *
 * Run: npm run test:forms-wave7-uploads
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
const formsUploadLib = require("../server/forms-upload-lib.js");
const paperworkSurfaces = require("./paperwork-surfaces.js");

function pass(id) {
  console.log(`PASS  ${id}`);
}

function fail(id, error) {
  console.error(`FAIL  ${id}`);
  console.error(error);
  process.exitCode = 1;
}

function request(port, method, pathname, { email, body, familyToken, headers: extra = {}, raw = false } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : (Buffer.isBuffer(body) ? body : JSON.stringify(body));
    const headers = { Accept: raw ? "*/*" : "application/json", ...extra };
    if (payload && !Buffer.isBuffer(body)) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(payload);
    } else if (Buffer.isBuffer(payload)) {
      headers["Content-Length"] = payload.length;
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
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        const text = buf.toString("utf8");
        let json = null;
        if (!raw) {
          try { json = text ? JSON.parse(text) : null; } catch (_e) { json = null; }
        }
        resolve({ status: res.statusCode, text, json, buffer: buf, headers: res.headers });
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
      ADMIN_EMAIL: "owner@wave7.test",
      ADMIN_PASSWORD: "wave7-pass",
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

function sampleRssMb(child) {
  try {
    const status = fs.readFileSync(`/proc/${child.pid}/status`, "utf8");
    const m = status.match(/VmRSS:\s+(\d+)\s+kB/);
    if (!m) return null;
    return Number(m[1]) / 1024;
  } catch (_e) {
    return null;
  }
}

function sourceMarkers() {
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  const uploadLib = fs.readFileSync(path.join(ROOT, "server/forms-upload-lib.js"), "utf8");
  const routes = fs.readFileSync(path.join(ROOT, "server/program-forms-routes.js"), "utf8");
  const formsLib = fs.readFileSync(path.join(ROOT, "server/program-forms-lib.js"), "utf8");
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const uploadUi = fs.readFileSync(path.join(ROOT, "scripts/forms-upload-ui.js"), "utf8");
  const surfaces = fs.readFileSync(path.join(ROOT, "scripts/paperwork-surfaces.js"), "utf8");

  assert.match(uploadLib, /ALLOWED_MIME|EXPIRING_SOON_DAYS|applyManualReminder|resolvePacketItemFromDocument/);
  assert.match(routes, /\/api\/program-forms\/uploads|\/remind|packets\/link|handleGetFormsMedia/);
  assert.match(formsLib, /UPLOADED/);
  assert.match(appJs, /data-upload-document|remindPaperworkDocument|openPaperworkUploadModal|formsProgramDocuments/);
  assert.match(indexHtml, /forms-upload-ui\.js/);
  assert.match(indexHtml, /20260811-forms-wave8-closeout1/);
  assert.match(uploadUi, /selectedFile|LLHFormsDirtyState|idempotencyKey/);
  assert.match(surfaces, /expiring_soon|documentExpirationState|programDocuments/);
  assert.doesNotMatch(
    serverJs.match(/function readStore\(\) \{[\s\S]*?\n\}/)[0],
    /structuredClone\(storeCache/,
  );
  // No automatic reminder engine
  assert.doesNotMatch(routes, /setInterval\(|node-cron|scheduleDailyReminder/);
  // File replacement deferred — no silent overwrite endpoint for signed forms
  assert.doesNotMatch(routes, /replace-upload|overwriteUpload/);
  pass("source_markers_wave7_and_memory_guard");
}

function unitUploadParseAndExpiration() {
  const ok = formsUploadLib.parseUploadDataUrl(tinyPngDataUrl(), { originalFileName: "shot.png" });
  assert.equal(ok.ok, true);
  assert.equal(ok.mimeType, "image/png");

  const html = formsUploadLib.parseUploadDataUrl("data:text/html;base64,PGh0bWw+", { originalFileName: "x.html" });
  assert.equal(html.ok, false);

  const svg = formsUploadLib.parseUploadDataUrl("data:image/svg+xml;base64,PHN2Zz4=", { originalFileName: "x.svg" });
  assert.equal(svg.ok, false);

  const badExt = formsUploadLib.parseUploadDataUrl(tinyPngDataUrl(), { originalFileName: "shot.exe" });
  assert.equal(badExt.ok, false);

  const today = formsUploadLib.todayIso();
  assert.equal(formsUploadLib.expirationState(""), "");
  assert.equal(formsUploadLib.expirationState(formsUploadLib.addDaysIso(today, -1)), "expired");
  assert.equal(formsUploadLib.expirationState(formsUploadLib.addDaysIso(today, 10)), "expiring_soon");
  assert.equal(formsUploadLib.expirationState(formsUploadLib.addDaysIso(today, 45)), "current");

  const rem1 = formsUploadLib.applyManualReminder({ id: "d1", status: "assigned", shareWithFamily: true }, { now: "2026-08-11T12:00:00.000Z" });
  assert.equal(rem1.idempotentReplay, false);
  const rem2 = formsUploadLib.applyManualReminder(rem1.document, { now: "2026-08-11T12:00:30.000Z" });
  assert.equal(rem2.idempotentReplay, true);

  const linked = formsUploadLib.resolvePacketItemFromDocument(
    { id: "i1", documentId: "doc1", status: "needed" },
    { id: "doc1", status: "completed", signedAt: "2026-08-11T00:00:00.000Z" },
  );
  assert.equal(linked.statusSource, "document");
  assert.equal(linked.status, "completed");
  const legacy = formsUploadLib.resolvePacketItemFromDocument({ id: "i2", status: "needed" }, null);
  assert.equal(legacy.linked, false);
  assert.equal(legacy.status, "needed");

  const api = paperworkSurfaces;
  assert.equal(api.EXPIRING_SOON_DAYS, 30);
  assert.ok(api.HQ_RAILS.some((r) => r.id === "expiring_soon"));
  assert.ok(api.HQ_RAILS.some((r) => r.id === "expired"));

  // Deterministic media ids prevent endless Postgres orphans on retry.
  const a = formsUploadLib.mediaAssetIdForIdempotency({ programId: "prog1", idempotencyKey: "idemkey0000000001" });
  const b = formsUploadLib.mediaAssetIdForIdempotency({ programId: "prog1", idempotencyKey: "idemkey0000000001" });
  const c = formsUploadLib.mediaAssetIdForIdempotency({ programId: "prog1", idempotencyKey: "idemkey0000000002" });
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(formsUploadLib.isFormsMediaAssetId(a), true);
  assert.match(
    fs.readFileSync(path.join(ROOT, "server/program-forms-routes.js"), "utf8"),
    /metadata_persist_failed_orphan_cleanup|removeFormsMediaAsset/,
  );
  pass("unit_upload_parse_expiration_reminder_packets");
}

async function integrationUploadsRemindersPackets() {
  const port = 43000 + Math.floor(Math.random() * 1000);
  const storePath = path.join(os.tmpdir(), `llh-wave7-${crypto.randomBytes(4).toString("hex")}.json`);
  const owner = "owner@wave7.test";
  const teacher = "teacher@wave7.test";
  const peerTeacher = "peer@wave7.test";
  const assistant = "assistant@wave7.test";
  const parentA = "parent.a.wave7@example.invalid";
  const parentB = "parent.b.wave7@example.invalid";
  fs.writeFileSync(storePath, JSON.stringify({
    users: {
      [owner]: {
        email: owner,
        plan: "Pro",
        accountStatus: "Active",
        role: "owner",
        homeDaycareHubTesting: true,
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
      [assistant]: {
        email: assistant,
        plan: "Pro",
        accountStatus: "Active",
        role: "assistant",
        linkedProgramOwnerEmail: owner,
        programAccessViaOwner: true,
      },
    },
    familyHouseholds: {},
    familyHubSessions: {},
    formsAudit: [],
    formPackets: {},
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
    const baseline = sampleRssMb(child);
    if (baseline != null) memSamples.push(baseline);

    await request(port, "POST", "/api/child-data", {
      email: owner,
      body: {
        data: {
          Profiles: [
            { id: "w7-ava", name: "Ava" },
            { id: "w7-ben", name: "Ben" },
          ],
          Documents: [],
        },
      },
    });

    const hhA = await request(port, "POST", "/api/family-hub/households", {
      email: owner,
      body: {
        label: "Family A",
        email: parentA,
        children: [{ id: "w7-ava" }],
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
        children: [{ id: "w7-ben" }],
        appOrigin: `http://127.0.0.1:${port}`,
      },
    });
    assert.equal(hhB.status, 200, hhB.text);
    const loginB = await request(port, "POST", "/api/family-hub/login", {
      body: { email: parentB, code: hhB.json.loginCode },
    });
    assert.equal(loginB.status, 200, loginB.text.slice(0, 300));
    const tokenB = loginB.json.sessionToken;

    // Assistant cannot upload
    const denyAssistant = await request(port, "POST", "/api/program-forms/uploads", {
      email: assistant,
      body: {
        assigneeType: "child",
        childId: "w7-ava",
        title: "Nope",
        fileData: tinyPngDataUrl(),
        originalFileName: "x.png",
        idempotencyKey: "denyassist00000000000001",
      },
    });
    assert.equal(denyAssistant.status, 403);

    // Teacher cannot upload (manager-only)
    const denyTeacher = await request(port, "POST", "/api/program-forms/uploads", {
      email: teacher,
      body: {
        assigneeType: "child",
        childId: "w7-ava",
        title: "Nope",
        fileData: tinyPngDataUrl(),
        originalFileName: "x.png",
        idempotencyKey: "denyteach000000000000001",
      },
    });
    assert.equal(denyTeacher.status, 403);

    const idemp = "childupl0000000000000001";
    const expiresSoon = formsUploadLib.addDaysIso(formsUploadLib.todayIso(), 10);
    const upChild = await request(port, "POST", "/api/program-forms/uploads", {
      email: owner,
      body: {
        assigneeType: "child",
        childId: "w7-ava",
        title: "Immunization card",
        category: "Medical",
        shareWithFamily: true,
        expiresAt: expiresSoon,
        fileData: tinyPngDataUrl(),
        originalFileName: "imm.png",
        idempotencyKey: idemp,
      },
    });
    assert.equal(upChild.status, 200, upChild.text.slice(0, 400));
    assert.equal(upChild.json.upload.presentation, "uploaded_document");
    assert.equal(upChild.json.document.shareWithFamily, true);
    assert.equal(upChild.json.upload.expirationState, "expiring_soon");
    const childDocId = upChild.json.document.id;
    const childMediaId = upChild.json.document.mediaAssetId;

    // Idempotent replay
    const upChild2 = await request(port, "POST", "/api/program-forms/uploads", {
      email: owner,
      body: {
        assigneeType: "child",
        childId: "w7-ava",
        title: "Immunization card",
        category: "Medical",
        shareWithFamily: true,
        expiresAt: expiresSoon,
        fileData: tinyPngDataUrl(),
        originalFileName: "imm.png",
        idempotencyKey: idemp,
      },
    });
    assert.equal(upChild2.status, 200);
    assert.equal(upChild2.json.idempotentReplay, true);
    assert.equal(upChild2.json.document.id, childDocId);

    // Provider-only child upload (not family visible)
    const privateUp = await request(port, "POST", "/api/program-forms/uploads", {
      email: owner,
      body: {
        assigneeType: "child",
        childId: "w7-ava",
        title: "Internal licensing scan",
        category: "Licensing",
        shareWithFamily: false,
        fileData: tinyPngDataUrl(),
        originalFileName: "lic.png",
        idempotencyKey: "privchild000000000000001",
      },
    });
    assert.equal(privateUp.status, 200, privateUp.text.slice(0, 300));
    const privateMedia = privateUp.json.document.mediaAssetId;

    // Staff upload
    const upStaff = await request(port, "POST", "/api/program-forms/uploads", {
      email: owner,
      body: {
        assigneeType: "staff",
        assigneeEmail: teacher,
        title: "CPR card",
        category: "Certification",
        expiresAt: formsUploadLib.addDaysIso(formsUploadLib.todayIso(), -1),
        fileData: tinyPngDataUrl(),
        originalFileName: "cpr.png",
        idempotencyKey: "staffupl0000000000000001",
        shareWithFamily: true, // must be rejected/forced false
      },
    });
    assert.equal(upStaff.status, 400);
    assert.equal(upStaff.json.code, "family_visibility_denied");

    const upStaffOk = await request(port, "POST", "/api/program-forms/uploads", {
      email: owner,
      body: {
        assigneeType: "staff",
        assigneeEmail: teacher,
        title: "CPR card",
        category: "Certification",
        expiresAt: formsUploadLib.addDaysIso(formsUploadLib.todayIso(), -1),
        fileData: tinyPngDataUrl(),
        originalFileName: "cpr.png",
        idempotencyKey: "staffupl0000000000000002",
      },
    });
    assert.equal(upStaffOk.status, 200, upStaffOk.text.slice(0, 400));
    assert.equal(upStaffOk.json.upload.shareWithFamily, false);
    assert.equal(upStaffOk.json.upload.expirationState, "expired");
    const staffMedia = upStaffOk.json.upload.mediaAssetId || upStaffOk.json.document.mediaAssetId;
    const staffDocId = upStaffOk.json.document.id || upStaffOk.json.upload.id;
    assert.ok(staffMedia);
    assert.ok(staffDocId);

    // Program upload
    const upProg = await request(port, "POST", "/api/program-forms/uploads", {
      email: owner,
      body: {
        assigneeType: "program",
        title: "Program handbook PDF",
        category: "Policy",
        fileData: tinyPngDataUrl(),
        originalFileName: "handbook.png",
        idempotencyKey: "progupl00000000000000001",
      },
    });
    assert.equal(upProg.status, 200, upProg.text.slice(0, 300));
    const progMedia = upProg.json.document.mediaAssetId;

    // Reject unsafe types
    const badType = await request(port, "POST", "/api/program-forms/uploads", {
      email: owner,
      body: {
        assigneeType: "program",
        title: "Evil",
        fileData: "data:application/javascript;base64,YWxlcnQoMSk=",
        originalFileName: "x.js",
        idempotencyKey: "badtype00000000000000001",
      },
    });
    assert.equal(badType.status, 400);

    // Media auth matrix
    const ownerMedia = await request(port, "GET", `/api/program-forms/media/${encodeURIComponent(childMediaId)}`, {
      email: owner,
      raw: true,
    });
    assert.equal(ownerMedia.status, 200);
    assert.match(String(ownerMedia.headers["content-type"] || ""), /image\/png/);

    const familyOk = await request(port, "GET", `/api/program-forms/media/${encodeURIComponent(childMediaId)}`, {
      familyToken: tokenA,
      raw: true,
    });
    assert.equal(familyOk.status, 200);

    const familyDenyPrivate = await request(port, "GET", `/api/program-forms/media/${encodeURIComponent(privateMedia)}`, {
      familyToken: tokenA,
      raw: true,
    });
    assert.equal(familyDenyPrivate.status, 403);

    const familyBDeny = await request(port, "GET", `/api/program-forms/media/${encodeURIComponent(childMediaId)}`, {
      familyToken: tokenB,
      raw: true,
    });
    assert.equal(familyBDeny.status, 403);

    const familyStaffDeny = await request(port, "GET", `/api/program-forms/media/${encodeURIComponent(staffMedia)}`, {
      familyToken: tokenA,
      raw: true,
    });
    assert.equal(familyStaffDeny.status, 403);

    const peerStaffDeny = await request(port, "GET", `/api/program-forms/media/${encodeURIComponent(staffMedia)}`, {
      email: peerTeacher,
      raw: true,
    });
    assert.equal(peerStaffDeny.status, 403);

    const teacherOwn = await request(port, "GET", `/api/program-forms/media/${encodeURIComponent(staffMedia)}`, {
      email: teacher,
      raw: true,
    });
    assert.equal(teacherOwn.status, 200);

    const teacherProgDeny = await request(port, "GET", `/api/program-forms/media/${encodeURIComponent(progMedia)}`, {
      email: teacher,
      raw: true,
    });
    assert.equal(teacherProgDeny.status, 403);

    const anonDeny = await request(port, "GET", `/api/program-forms/media/${encodeURIComponent(childMediaId)}`, {
      raw: true,
    });
    assert.equal(anonDeny.status, 401);

    // Cross-program / forged id
    const fakeMedia = await request(port, "GET", "/api/program-forms/media/forms-media-ffffffffffffffffffffffffffffffff", {
      email: owner,
      raw: true,
    });
    assert.ok(fakeMedia.status === 404 || fakeMedia.status === 403);

    // Detail distinguishes uploaded document
    const detail = await request(port, "GET", `/api/program-forms/documents/${encodeURIComponent(childDocId)}/detail?assigneeType=child`, {
      email: owner,
    });
    assert.equal(detail.status, 200, detail.text.slice(0, 300));
    assert.equal(detail.json.document.presentation, "uploaded_document");
    assert.equal(detail.json.capabilities.isUploadedDocument, true);

    // Manual remind outstanding form (create assigned LLH form first)
    const tpl = await request(port, "POST", "/api/program-forms/templates", {
      email: owner,
      body: {
        title: "Wave7 Permission",
        category: "Permission",
        body: "Please sign.",
        fields: [{ id: "fld_ok", type: "checkbox", label: "I agree", required: true }],
        requiresSignature: true,
      },
    });
    assert.equal(tpl.status, 200, tpl.text.slice(0, 200));
    const preview = await request(port, "POST", "/api/program-forms/assign/preview", {
      email: owner,
      body: {
        audience: "family",
        mode: "children",
        assignmentScope: "child",
        childIds: ["w7-ava"],
      },
    });
    assert.equal(preview.status, 200, preview.text);
    const send = await request(port, "POST", "/api/program-forms/assign/confirm-send", {
      email: owner,
      body: {
        idempotencyKey: crypto.randomUUID(),
        templateId: tpl.json.template.id,
        formSpec: {
          title: "Wave7 Permission",
          body: "Please sign.",
          fields: [{ id: "fld_ok", type: "checkbox", label: "I agree", required: true }],
          templateId: tpl.json.template.id,
          requiresSignature: true,
        },
        target: {
          audience: "family",
          mode: "children",
          assignmentScope: "child",
          childIds: ["w7-ava"],
        },
        shareWithFamily: true,
        expected: preview.json.counts,
      },
    });
    assert.equal(send.status, 200, send.text.slice(0, 400));
    const assignedId = send.json.createdIds?.[0] || send.json.documents?.[0]?.id;
    assert.ok(assignedId);

    // Age lastNotifiedAt from confirm-send so a fresh manual reminder is accepted.
    const childDataRes = await request(port, "GET", "/api/child-data", { email: owner });
    assert.equal(childDataRes.status, 200, childDataRes.text.slice(0, 200));
    const childData = childDataRes.json.data || childDataRes.json.childData || {};
    const docs = Array.isArray(childData.Documents) ? childData.Documents : [];
    const agedDocs = docs.map((d) => (
      String(d.id) === String(assignedId)
        ? { ...d, lastNotifiedAt: "2026-07-01T00:00:00.000Z" }
        : d
    ));
    const saveAged = await request(port, "POST", "/api/child-data", {
      email: owner,
      body: { data: { ...childData, Documents: agedDocs } },
    });
    assert.equal(saveAged.status, 200, saveAged.text.slice(0, 200));

    const remind1 = await request(port, "POST", `/api/program-forms/documents/${encodeURIComponent(assignedId)}/remind`, {
      email: owner,
      body: { assigneeType: "child" },
    });
    assert.equal(remind1.status, 200, remind1.text.slice(0, 300));
    assert.equal(remind1.json.idempotentReplay, false);
    assert.ok(remind1.json.document.lastNotifiedAt);

    const remind2 = await request(port, "POST", `/api/program-forms/documents/${encodeURIComponent(assignedId)}/remind`, {
      email: owner,
      body: { assigneeType: "child" },
    });
    assert.equal(remind2.status, 200);
    assert.equal(remind2.json.idempotentReplay, true);

    const audit = await request(port, "GET", "/api/program-forms/audit?limit=100", { email: owner });
    assert.equal(audit.status, 200);
    const actions = (audit.json.audit || []).map((r) => r.action);
    assert.ok(actions.includes("UPLOADED"));
    assert.ok(actions.includes("REMINDER_SENT"));
    const reminderCount = actions.filter((a) => a === "REMINDER_SENT").length;
    assert.equal(reminderCount, 1);

    // Packet linking (non-destructive documentId)
    const packetCreate = await request(port, "POST", "/api/home-daycare-hub/packets", {
      email: owner,
      body: {
        title: "Enrollment packet",
        childId: "w7-ava",
        childName: "Ava",
        items: [{ id: "pi1", title: "Immunization", status: "needed", statusLabel: "Needed" }],
      },
    });
    assert.equal(packetCreate.status, 200, packetCreate.text.slice(0, 400));
    const packetId = packetCreate.json.packet.id;
    // Legacy item without documentId still readable on create response
    assert.equal(packetCreate.json.packet.items[0].linked, false);
    const link = await request(port, "POST", "/api/program-forms/packets/link", {
      email: owner,
      body: {
        packetId,
        itemId: "pi1",
        documentId: childDocId,
      },
    });
    assert.equal(link.status, 200, link.text.slice(0, 400));
    assert.equal(link.json.item.documentId, childDocId);
    assert.equal(link.json.item.statusSource, "document");

    // Legacy packet item without documentId remains readable via resolve helper
    const legacyItem = formsUploadLib.resolvePacketItemFromDocument({ id: "legacy", status: "needed" }, null);
    assert.equal(legacyItem.linked, false);

    // Archive uploaded record (preserve)
    const arch = await request(port, "POST", `/api/program-forms/documents/${encodeURIComponent(staffDocId)}/archive`, {
      email: owner,
      body: { assigneeType: "staff" },
    });
    assert.equal(arch.status, 200, arch.text.slice(0, 300));
    assert.equal(arch.json.document.archived, true);
    const staffMediaAfter = await request(port, "GET", `/api/program-forms/media/${encodeURIComponent(staffMedia)}`, {
      email: owner,
      raw: true,
    });
    assert.equal(staffMediaAfter.status, 200);

    // Memory samples after stress
    for (let i = 0; i < 8; i += 1) {
      await request(port, "GET", `/api/program-forms/media/${encodeURIComponent(childMediaId)}`, {
        email: owner,
        raw: true,
      });
      await request(port, "GET", `/api/program-forms/documents/${encodeURIComponent(childDocId)}/detail?assigneeType=child`, {
        email: owner,
      });
      const rss = sampleRssMb(child);
      if (rss != null) memSamples.push(rss);
    }
    await new Promise((r) => setTimeout(r, 500));
    const postIdle = sampleRssMb(child);
    if (postIdle != null) memSamples.push(postIdle);

    const peak = Math.max(...memSamples.filter((n) => Number.isFinite(n)));
    const base = memSamples[0];
    const climb = (Number.isFinite(peak) && Number.isFinite(base)) ? (peak - base) : 0;
    console.log(`MEMORY  baseline_rss_mb=${base?.toFixed?.(1) ?? "n/a"} peak_rss_mb=${peak?.toFixed?.(1) ?? "n/a"} post_idle_rss_mb=${postIdle?.toFixed?.(1) ?? "n/a"} climb_mb=${climb.toFixed?.(1) ?? "n/a"}`);
    // Local host RSS varies; Wave 5 pattern: climb bound + 512Mi hard cap.
    // Ordinary-use sustained >300MB remains the live Render investigation threshold.
    if (Number.isFinite(peak) && Number.isFinite(base)) {
      assert.ok(climb < 40, `wave7 local RSS climbed ${climb}MB during upload stress (baseline ${base} → ${peak})`);
      assert.ok(peak < 512, `wave7 local RSS peak ${peak} must stay under free-plan 512Mi hard cap`);
    }

    pass("integration_uploads_auth_remind_packets_archive_memory");
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(storePath); } catch (_e) { /* ignore */ }
    const mediaDir = formsUploadLib.localMediaDirFromStorePath(storePath);
    try { fs.rmSync(mediaDir, { recursive: true, force: true }); } catch (_e) { /* ignore */ }
  }
}

async function main() {
  try { sourceMarkers(); } catch (error) { fail("source_markers_wave7_and_memory_guard", error); }
  try { unitUploadParseAndExpiration(); } catch (error) { fail("unit_upload_parse_expiration_reminder_packets", error); }
  try { await integrationUploadsRemindersPackets(); } catch (error) { fail("integration_uploads_auth_remind_packets_archive_memory", error); }
  if (process.exitCode) {
    console.error("Wave 7 uploads tests FAILED");
    process.exit(process.exitCode);
  }
  console.log("Wave 7 uploads tests PASSED");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
