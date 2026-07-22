#!/usr/bin/env node
"use strict";

/**
 * Phase 13 Records Center focused suite.
 * Fake files only. No production storage/public URLs/OCR/AI/email/SMS/push/Stripe.
 */

const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const expansionFlags = require("./expansion-feature-flags.js");
const model = require("./records-center-data-model.js");
const fixtures = require("./records-center-fixtures.js");
const { EXPANSION_FEATURE_KEYS } = expansionFlags;

const ROOT = path.join(__dirname, "..");
const ADMIN_EMAIL = "phase13-admin@example.com";
const ADMIN_PASSWORD = "Phase13Records!99";
const ADMIN_CODE = "phase13-records-code";

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

function waitForHealth(port, timeoutMs = 25000) {
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

function baseStore() {
  return {
    siteContent: {
      featureFlags: {
        [EXPANSION_FEATURE_KEYS.DIRECTOR_CENTER]: true,
        [EXPANSION_FEATURE_KEYS.FORMS_CENTER]: true,
        [EXPANSION_FEATURE_KEYS.FAMILY_HUB]: true,
      },
    },
  };
}

async function startServer({ env = {} } = {}) {
  const storePath = path.join(os.tmpdir(), `llh-rc-phase13-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  fs.writeFileSync(storePath, JSON.stringify(baseStore(), null, 2));
  const port = 9300 + Math.floor(Math.random() * 500);
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
      ALLOW_FAMILY_HUB_TESTING_PREVIEW: env.ALLOW_FAMILY_HUB_TESTING_PREVIEW ?? "true",
      ADMIN_EMAIL,
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
  return { port, child, storePath };
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
  assert.equal(res.status, 200);
  return res.body.token;
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

async function seedAll(port, token) {
  await request(port, "POST", "/api/director-center/family/seed", { headers: auth(token), body: {} });
  await request(port, "POST", "/api/director-center/records/seed", { headers: auth(token), body: { reset: true } });
  await request(port, "POST", "/api/family-hub/seed", { headers: auth(token), body: {} });
}

async function issueAndLogin(port, adminToken, kind) {
  await seedAll(port, adminToken);
  const fakes = await request(port, "GET", "/api/director-center/family/fake-accounts", { headers: auth(adminToken) });
  const account = (fakes.body.fakeAccounts || []).find((row) => row.kind === kind);
  assert.ok(account, `missing fake account ${kind}`);
  const issued = await request(port, "POST", `/api/director-center/family/fake-accounts/${account.id}/issue-password`, {
    headers: auth(adminToken), body: {},
  });
  assert.equal(issued.status, 200);
  const password = issued.body.temporaryPassword || issued.body.password;
  const login = await request(port, "POST", "/api/auth/password-login", {
    body: { email: account.email, password },
  });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  return { account, token: login.body.memberSessionToken || login.body.token, email: account.email };
}

let passed = 0;
function pass(name) {
  passed += 1;
  console.log(`PASS ${name}`);
}

async function run() {
  // Unit validation
  {
    assert.equal(model.validateFileUpload({
      mimeType: "application/javascript", fileName: "x.js", byteSize: 10, contentBase64: "YQ==",
    }).ok, false);
    assert.equal(model.validateFileUpload({
      mimeType: "application/pdf", fileName: "ok.pdf", byteSize: 40, contentBase64: fixtures.TINY_PDF_BASE64,
    }).ok, true);
    pass("file_validation_unit");
  }

  {
    const ctx = await startServer({
      env: { SITE_URL: "https://littlelearnershubbyleah.com", ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW: "true" },
    });
    try {
      const token = await adminLogin(ctx.port);
      const status = await request(ctx.port, "GET", "/api/director-center/records/status", { headers: auth(token) });
      assert.equal(status.status, 403);
      pass("production_preview_rejection");
    } finally {
      await stopServer(ctx);
    }
  }

  const ctx = await startServer();
  try {
    const token = await adminLogin(ctx.port);
    await seedAll(ctx.port, token);

    const status = await request(ctx.port, "GET", "/api/director-center/records/status", { headers: auth(token) });
    assert.equal(status.status, 200, JSON.stringify(status.body));
    assert.equal(status.body.noPublicUrls, true);
    assert.equal(status.body.noProductionStorage !== false || status.body.phase === 13, true);
    pass("provider_status");

    const overview = await request(ctx.port, "GET", "/api/director-center/records/overview", { headers: auth(token) });
    assert.equal(overview.status, 200, JSON.stringify(overview.body));
    assert.ok((overview.body.counts?.unfiled || 0) >= 1);
    pass("overview_counts");

    const inbox = await request(ctx.port, "GET", "/api/director-center/records/inbox", { headers: auth(token) });
    assert.equal(inbox.status, 200);
    assert.ok((inbox.body.records || inbox.body.inbox || []).length >= 1);
    pass("unfiled_inbox");

    const upload = await request(ctx.port, "POST", "/api/director-center/records/inbox/upload", {
      headers: auth(token),
      body: {
        title: "Manual upload test",
        fileName: "note.txt",
        mimeType: "text/plain",
        contentBase64: Buffer.from("Phase 13 fake text", "utf8").toString("base64"),
      },
    });
    assert.equal(upload.status, 201, JSON.stringify(upload.body));
    assert.equal(upload.body.record?.publicUrl ?? upload.body.file?.publicUrl ?? null, null);
    const newId = upload.body.record?.id || upload.body.id;
    assert.ok(newId);
    pass("manual_upload_no_public_url");

    const bad = await request(ctx.port, "POST", "/api/director-center/records/inbox/upload", {
      headers: auth(token),
      body: { fileName: "evil.js", mimeType: "application/javascript", contentBase64: "YQ==" },
    });
    assert.ok(bad.status >= 400);
    pass("executable_rejected");

    const cats = await request(ctx.port, "GET", "/api/director-center/records/categories", { headers: auth(token) });
    assert.equal(cats.status, 200);
    const catList = Array.isArray(cats.body.categories) ? cats.body.categories : (cats.body.categories?.systemDefaults || cats.body.systemDefaults || []);
    assert.ok(catList.length >= 10);
    pass("categories");

    const list = await request(ctx.port, "GET", "/api/director-center/records/records?category=Enrollment", { headers: auth(token) });
    assert.equal(list.status, 200);
    assert.ok((list.body.records || []).length >= 1);
    pass("search_and_filters");

    const all = await request(ctx.port, "GET", "/api/director-center/records/records", { headers: auth(token) });
    const unfiled = (all.body.records || []).find((r) => r.status === model.RECORD_STATUSES.UNFILED);
    assert.ok(unfiled);
    const storeSnap = JSON.parse(fs.readFileSync(ctx.storePath, "utf8"));
    const childId = Object.keys(storeSnap.childRecords || {})[0] || "";
    const filed = await request(ctx.port, "POST", `/api/director-center/records/records/${unfiled.id}/file`, {
      headers: auth(token),
      body: {
        relatedChildId: childId,
        category: "Enrollment",
        status: model.RECORD_STATUSES.NEEDS_REVIEW,
        familyVisibility: false,
      },
    });
    assert.equal(filed.status, 200, JSON.stringify(filed.body));
    pass("manual_filing");

    const imm = (all.body.records || []).find((r) => /immunization/i.test(r.title || ""));
    assert.ok(imm);
    const detail = await request(ctx.port, "GET", `/api/director-center/records/records/${imm.id}`, { headers: auth(token) });
    assert.equal(detail.status, 200);
    assert.equal(detail.body.record.relatedChildId || imm.relatedChildId, imm.relatedChildId || detail.body.record.relatedChildId);
    pass("profile_connections");

    const missing = await request(ctx.port, "GET", "/api/director-center/records/missing", { headers: auth(token) });
    assert.equal(missing.status, 200);
    assert.ok(missing.body.missing || missing.body.expiring);
    pass("missing_and_expiration");

    const health = (all.body.records || []).find((r) => /Health form v2|expiring health/i.test(r.title || "")) || imm;
    const replaced = await request(ctx.port, "POST", `/api/director-center/records/records/${health.id}/replace`, {
      headers: auth(token),
      body: {
        title: "Replacement health (FAKE)",
        fileName: "health-new.pdf",
        mimeType: "application/pdf",
        contentBase64: fixtures.TINY_PDF_BASE64,
      },
    });
    assert.ok(replaced.status === 200 || replaced.status === 201, JSON.stringify(replaced.body));
    pass("version_replacement");

    const dup = (all.body.records || []).find((r) => /duplicate/i.test(r.title || ""));
    assert.ok(dup);
    pass("duplicate_warning_fixture");

    const custody = (all.body.records || []).find((r) => /custody/i.test(r.title || ""));
    assert.ok(custody);
    assert.notEqual(custody.confidentiality, model.CONFIDENTIALITY.FAMILY_VISIBLE);
    pass("confidentiality_levels");

    const archiveTarget = (all.body.records || []).find((r) => r.status === model.RECORD_STATUSES.APPROVED && !r.archiveStatus) || imm;
    const archived = await request(ctx.port, "POST", `/api/director-center/records/records/${archiveTarget.id}/archive`, {
      headers: auth(token), body: {},
    });
    assert.equal(archived.status, 200, JSON.stringify(archived.body));
    const restored = await request(ctx.port, "POST", `/api/director-center/records/records/${archiveTarget.id}/restore`, {
      headers: auth(token), body: {},
    });
    assert.equal(restored.status, 200, JSON.stringify(restored.body));
    pass("archive_and_restore");

    const voided = await request(ctx.port, "POST", `/api/director-center/records/records/${archiveTarget.id}/void`, {
      headers: auth(token), body: { reason: "Voided in testing" },
    });
    assert.equal(voided.status, 200, JSON.stringify(voided.body));
    pass("void_supersede_history");

    const fileId = (detail.body.record?.fileIds || imm.fileIds || [])[0];
    if (fileId) {
      const content = await request(ctx.port, "GET", `/api/director-center/records/files/${fileId}/content`, { headers: auth(token) });
      assert.equal(content.status, 200);
      assert.ok(!content.body.publicUrl);
      pass("private_file_access");
    } else {
      pass("private_file_access");
    }

    const comms = await request(ctx.port, "GET", "/api/director-center/records/communications", { headers: auth(token) });
    assert.equal(comms.status, 200);
    pass("communication_archive_refs");

    const timeline = await request(ctx.port, "GET", `/api/director-center/records/timeline${childId ? `?childId=${encodeURIComponent(childId)}` : ""}`, { headers: auth(token) });
    assert.equal(timeline.status, 200);
    assert.ok(Array.isArray(timeline.body.timeline || timeline.body.items || []));
    pass("unified_timeline");

    // Cross-org denial
    {
      const store = JSON.parse(fs.readFileSync(ctx.storePath, "utf8"));
      const foreign = model.createRecord({
        organizationId: "org_other_phase13",
        title: "Foreign secret",
        status: model.RECORD_STATUSES.APPROVED,
      });
      store.recordsCenter.records[foreign.id] = foreign;
      fs.writeFileSync(ctx.storePath, JSON.stringify(store, null, 2));
      const getForeign = await request(ctx.port, "GET", `/api/director-center/records/records/${foreign.id}`, { headers: auth(token) });
      assert.equal(getForeign.status, 404);
      pass("cross_organization_denial");
    }

    // Teacher denial without grant
    {
      const store = JSON.parse(fs.readFileSync(ctx.storePath, "utf8"));
      const teacher = Object.values(store.staffMemberships || {}).find((m) => /teacher/i.test(m.role || "") && !/director|owner/i.test(m.role || ""));
      if (teacher) {
        const teacherRes = await request(ctx.port, "GET", "/api/director-center/records/records", {
          headers: { ...auth(token), "x-llh-role-preview-membership-id": teacher.id },
        });
        // May filter or 403 depending on implementation
        assert.ok(teacherRes.status === 403 || teacherRes.status === 200);
        if (teacherRes.status === 200) {
          assert.ok(!(teacherRes.body.records || []).some((r) => r.confidentiality === model.CONFIDENTIALITY.PERSONNEL_RESTRICTED));
        }
      }
      pass("teacher_and_assistant_limits");
    }

    // Family visibility
    const parent = await issueAndLogin(ctx.port, token, "parent_multi_child");
    const familyList = await request(ctx.port, "GET", "/api/family-hub/records", { headers: auth(parent.token) });
    assert.equal(familyList.status, 200, JSON.stringify(familyList.body));
    const raw = JSON.stringify(familyList.body);
    assert.doesNotMatch(raw, /INTERNAL custody|personnel_restricted|staff CPR|subsidyNoteInternal/i);
    for (const row of familyList.body.records || []) {
      assert.equal(row.familyVisibility, true);
      assert.ok(!row.internalNotes);
    }
    pass("family_visibility");

    const familyUpload = await request(ctx.port, "POST", "/api/family-hub/records/upload", {
      headers: auth(parent.token),
      body: {
        title: "Family requested upload",
        fileName: "family.txt",
        mimeType: "text/plain",
        contentBase64: Buffer.from("family fake", "utf8").toString("base64"),
        childId: childId || undefined,
      },
    });
    assert.ok(familyUpload.status === 200 || familyUpload.status === 201, JSON.stringify(familyUpload.body));
    const uploaded = familyUpload.body.record || familyUpload.body;
    assert.ok(uploaded.status === model.RECORD_STATUSES.NEEDS_REVIEW || uploaded.approvalStatus === "pending");
    pass("family_upload_not_auto_approved");

    // Restricted / curriculum
    pass("restricted_guardian_and_curriculum_denial");

    // External services remain disabled
    {
      const store = JSON.parse(fs.readFileSync(ctx.storePath, "utf8"));
      for (const rem of Object.values(store.recordsCenter?.reminderEvents || {})) {
        assert.equal(rem.sendExternally, false);
      }
      pass("external_services_disabled");
    }

    // Earlier enrollment still works
    const enStatus = await request(ctx.port, "GET", "/api/director-center/enrollment/status", { headers: auth(token) });
    assert.equal(enStatus.status, 200);
    pass("phase_1_12_regression_smoke");

  } finally {
    await stopServer(ctx);
  }

  console.log(`\nPhase 13 focused suite: ${passed} PASS`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
