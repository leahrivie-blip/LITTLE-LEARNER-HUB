#!/usr/bin/env node
"use strict";

/**
 * Phase 14 Licensing Center focused suite.
 * Fake readiness only. No legal compliance claim. No email/SMS/push/Stripe/live AI.
 */

const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const expansionFlags = require("./expansion-feature-flags.js");
const model = require("./licensing-center-data-model.js");
const { EXPANSION_FEATURE_KEYS } = expansionFlags;

const ROOT = path.join(__dirname, "..");
const ADMIN_EMAIL = "phase14-admin@example.com";
const ADMIN_PASSWORD = "Phase14Licensing!99";
const ADMIN_CODE = "phase14-licensing-code";
const BASE = "/api/director-center/licensing";

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
  const storePath = path.join(os.tmpdir(), `llh-lc-phase14-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  fs.writeFileSync(storePath, JSON.stringify(baseStore(), null, 2));
  const port = 9400 + Math.floor(Math.random() * 500);
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
  await request(port, "POST", `${BASE}/seed`, { headers: auth(token), body: { reset: true } });
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
  {
    const ctx = await startServer({
      env: { SITE_URL: "https://littlelearnershubbyleah.com", ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW: "true" },
    });
    try {
      const token = await adminLogin(ctx.port);
      const status = await request(ctx.port, "GET", `${BASE}/status`, { headers: auth(token) });
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

    const status = await request(ctx.port, "GET", `${BASE}/status`, { headers: auth(token) });
    assert.equal(status.status, 200, JSON.stringify(status.body));
    assert.equal(status.body.phase, 14);
    assert.equal(status.body.noLegalComplianceClaim, true);
    assert.equal(status.body.noOutboundEmail, true);
    assert.equal(status.body.noOutboundSms, true);
    assert.ok(status.body.disclaimer);
    pass("provider_status");

    const setupGet = await request(ctx.port, "GET", `${BASE}/setup`, { headers: auth(token) });
    assert.equal(setupGet.status, 200, JSON.stringify(setupGet.body));
    assert.ok(setupGet.body.setup?.licenseNumber);
    const setupPost = await request(ctx.port, "POST", `${BASE}/setup`, {
      headers: auth(token),
      body: {
        id: setupGet.body.setup.id,
        licensedCapacity: 52,
        infantCare: true,
        medicationAdministration: true,
        stateOrTerritory: "Testing Territory Updated",
      },
    });
    assert.equal(setupPost.status, 200, JSON.stringify(setupPost.body));
    assert.equal(setupPost.body.setup.licensedCapacity, 52);
    pass("setup");

    const pack = await request(ctx.port, "GET", `${BASE}/pack`, { headers: auth(token) });
    assert.equal(pack.status, 200);
    assert.equal(pack.body.legalClaim, false);
    assert.match(String(pack.body.disclaimer || pack.body.pack?.disclaimer || ""), /does not guarantee licensing compliance/i);
    assert.match(String(pack.body.pack?.title || ""), /NOT legal|testing/i);
    pass("pack_disclaimer");

    const addReq = await request(ctx.port, "POST", `${BASE}/requirements`, {
      headers: auth(token),
      body: {
        key: "custom_checklist_item",
        title: "Custom checklist item (FAKE)",
        scope: "facility",
        category: "Facility and Safety",
        frequency: model.FREQUENCIES.MONTHLY,
        plainLanguage: "Provider-customized testing requirement.",
      },
    });
    assert.equal(addReq.status, 201, JSON.stringify(addReq.body));
    const customId = addReq.body.requirement.id;
    const markNa = await request(ctx.port, "POST", `${BASE}/requirements/${customId}`, {
      headers: auth(token),
      body: { notApplicable: true, providerNotes: "N/A for this program type" },
    });
    assert.equal(markNa.status, 200);
    assert.equal(markNa.body.requirement.status, model.READINESS.NOT_APPLICABLE);
    pass("checklist_customize");

    const reqs = await request(ctx.port, "GET", `${BASE}/requirements`, { headers: auth(token) });
    assert.equal(reqs.status, 200);
    const withRecord = (reqs.body.requirements || []).find((r) => r.connectedRecordId);
    assert.ok(withRecord, "expected a requirement connected to a Phase 13 record");
    const connectTarget = (reqs.body.requirements || []).find((r) => r.key === "vehicle_record" || !r.connectedRecordId) || withRecord;
    const storeSnap = JSON.parse(fs.readFileSync(ctx.storePath, "utf8"));
    const anyRecordId = Object.values(storeSnap.recordsCenter?.records || {}).find((r) => r.organizationId === status.body.organizationId)?.id;
    assert.ok(anyRecordId);
    const connected = await request(ctx.port, "POST", `${BASE}/requirements/${connectTarget.id}`, {
      headers: auth(token),
      body: { connectedRecordId: anyRecordId },
    });
    assert.equal(connected.status, 200, JSON.stringify(connected.body));
    assert.equal(connected.body.requirement.connectedRecordId, anyRecordId);
    pass("record_connections");

    const dash = await request(ctx.port, "GET", `${BASE}/dashboard`, { headers: auth(token) });
    assert.equal(dash.status, 200, JSON.stringify(dash.body));
    assert.ok(dash.body.counts);
    assert.ok(Array.isArray(dash.body.cards) && dash.body.cards.length >= 5);
    assert.ok(dash.body.cards.every((c) => c.filterStatus || c.key));
    pass("dashboard_counts");

    const childReqs = await request(ctx.port, "GET", `${BASE}/requirements?scope=child`, { headers: auth(token) });
    const staffReqs = await request(ctx.port, "GET", `${BASE}/requirements?scope=staff`, { headers: auth(token) });
    const facilityReqs = await request(ctx.port, "GET", `${BASE}/requirements?scope=facility`, { headers: auth(token) });
    assert.ok((childReqs.body.requirements || []).length >= 1);
    assert.ok((staffReqs.body.requirements || []).length >= 1);
    assert.ok((facilityReqs.body.requirements || []).length >= 1);
    pass("child_staff_facility_readiness");

    const recurring = (reqs.body.requirements || []).find((r) => r.frequency && r.frequency !== model.FREQUENCIES.ONE_TIME)
      || (facilityReqs.body.requirements || []).find((r) => r.key === "facility_drill");
    assert.ok(recurring);
    const beforeCount = (await request(ctx.port, "GET", `${BASE}/requirements`, { headers: auth(token) })).body.total;
    const completed = await request(ctx.port, "POST", `${BASE}/requirements/${recurring.id}/complete-recurring`, {
      headers: auth(token), body: {},
    });
    assert.equal(completed.status, 200, JSON.stringify(completed.body));
    assert.ok(completed.body.occurrence);
    assert.ok(completed.body.nextRequirementId, "recurring completion should create next occurrence requirement");
    const afterCount = (await request(ctx.port, "GET", `${BASE}/requirements`, { headers: auth(token) })).body.total;
    assert.ok(afterCount >= beforeCount);
    pass("recurring_complete_creates_next");

    const missing = await request(ctx.port, "GET", `${BASE}/requirements?status=missing`, { headers: auth(token) });
    const expiring = await request(ctx.port, "GET", `${BASE}/requirements?status=expiring_soon`, { headers: auth(token) });
    assert.ok((missing.body.requirements || []).length >= 1 || (dash.body.counts.missing || 0) >= 1);
    assert.ok((expiring.body.requirements || []).length >= 1 || (dash.body.counts.expiringSoon || 0) >= 1 || (dash.body.counts.expired || 0) >= 1);
    pass("missing_and_expiration");

    const imm = (reqs.body.requirements || []).find((r) => /immunization/i.test(r.title || r.key || ""));
    assert.ok(imm);
    assert.match(String(imm.plainLanguage || pack.body.pack?.requirements?.find((r) => r.key === "child_immunization")?.plainLanguage || ""), /does not certify medical|document/i);
    const reports = await request(ctx.port, "GET", `${BASE}/reports`, { headers: auth(token) });
    assert.equal(reports.status, 200);
    assert.equal(reports.body.noLegalComplianceClaim, true);
    pass("immunization_org_without_medical_decisions");

    const corrective = await request(ctx.port, "GET", `${BASE}/corrective`, { headers: auth(token) });
    assert.equal(corrective.status, 200);
    const openCa = (corrective.body.correctiveActions || []).find((c) => c.status === model.CORRECTIVE_STATUSES.OPEN)
      || (corrective.body.correctiveActions || [])[0];
    assert.ok(openCa);
    const historyLen = (openCa.history || []).length;
    const editedCa = await request(ctx.port, "POST", `${BASE}/corrective/${openCa.id}`, {
      headers: auth(token),
      body: { status: model.CORRECTIVE_STATUSES.IN_PROGRESS, description: "Updated in testing (FAKE)" },
    });
    assert.equal(editedCa.status, 200, JSON.stringify(editedCa.body));
    assert.equal(editedCa.body.historyPreserved, true);
    assert.ok((editedCa.body.correctiveAction.history || []).length >= historyLen);
    pass("corrective_preservation");

    const storeForPacket = JSON.parse(fs.readFileSync(ctx.storePath, "utf8"));
    const orgId = status.body.organizationId;
    const scopedRecordIds = Object.values(storeForPacket.recordsCenter?.records || {})
      .filter((r) => r.organizationId === orgId)
      .slice(0, 3)
      .map((r) => r.id);
    const prepared = await request(ctx.port, "POST", `${BASE}/inspection/prepare`, {
      headers: auth(token),
      body: {
        inspectionDate: "2026-09-01",
        childCategories: ["Immunization and Health"],
        staffCategories: ["Staff Training and Certifications"],
        facilityCategories: ["Facility and Safety"],
        recordIds: scopedRecordIds,
        includeIdentifyingInfo: false,
      },
    });
    assert.equal(prepared.status, 201, JSON.stringify(prepared.body));
    assert.equal(prepared.body.scopeLimited, true);
    assert.equal(prepared.body.readOnly, true);
    const packetId = prepared.body.packet.id;
    const inspToken = prepared.body.inspectorAccess.token;
    const packetGet = await request(ctx.port, "GET", `${BASE}/inspection/${packetId}`, { headers: auth(token) });
    assert.equal(packetGet.status, 200);
    assert.ok((packetGet.body.records || []).every((r) => scopedRecordIds.includes(r.id)));
    pass("inspection_packet_scope");

    const inspectorOk = await request(ctx.port, "GET", `${BASE}/inspector/${inspToken}`, { headers: auth(token) });
    assert.equal(inspectorOk.status, 200, JSON.stringify(inspectorOk.body));
    assert.equal(inspectorOk.body.readOnly, true);
    assert.equal(inspectorOk.body.fullAccountAccess, false);

    const revoked = await request(ctx.port, "POST", `${BASE}/inspection/${packetId}/revoke`, { headers: auth(token), body: {} });
    assert.equal(revoked.status, 200);
    const inspectorAfter = await request(ctx.port, "GET", `${BASE}/inspector/${inspToken}`, { headers: auth(token) });
    assert.equal(inspectorAfter.status, 403);
    pass("revoke_inspector");

    {
      const store = JSON.parse(fs.readFileSync(ctx.storePath, "utf8"));
      const foreignPacket = model.createInspectionPacket({
        organizationId: "org_other_phase14",
        recordIds: [],
        createdByEmail: "other@example.invalid",
      });
      store.licensingCenter.inspectionPackets[foreignPacket.id] = foreignPacket;
      const foreignAccess = model.createInspectorAccess({
        organizationId: "org_other_phase14",
        packetId: foreignPacket.id,
        expiresAt: foreignPacket.expiresAt,
      });
      store.licensingCenter.inspectorAccess[foreignAccess.id] = foreignAccess;
      fs.writeFileSync(ctx.storePath, JSON.stringify(store, null, 2));
      const wrongOrg = await request(ctx.port, "GET", `${BASE}/inspector/${foreignAccess.token}`, { headers: auth(token) });
      assert.equal(wrongOrg.status, 403);
      pass("wrong_org");
    }

    {
      const store = JSON.parse(fs.readFileSync(ctx.storePath, "utf8"));
      const teacher = Object.values(store.staffMemberships || {}).find((m) => /teacher|lead/i.test(m.role || "") && !/director|owner/i.test(m.role || ""));
      const assistant = Object.values(store.staffMemberships || {}).find((m) => /assistant/i.test(m.role || ""));
      const curriculum = Object.values(store.staffMemberships || {}).find((m) => /curriculum/i.test(m.role || ""));
      if (teacher) {
        const teacherRes = await request(ctx.port, "GET", `${BASE}/requirements`, {
          headers: { ...auth(token), "x-llh-role-preview-membership-id": teacher.id },
        });
        assert.ok(teacherRes.status === 403 || teacherRes.status === 200);
        if (teacherRes.status === 200) {
          assert.ok(!(teacherRes.body.requirements || []).some((r) => /background|personnel/i.test(`${r.key} ${r.category}`)));
        }
      }
      if (assistant) {
        const asst = await request(ctx.port, "GET", `${BASE}/dashboard`, {
          headers: { ...auth(token), "x-llh-role-preview-membership-id": assistant.id },
        });
        assert.equal(asst.status, 403);
      }
      if (curriculum) {
        const cur = await request(ctx.port, "GET", `${BASE}/dashboard`, {
          headers: { ...auth(token), "x-llh-role-preview-membership-id": curriculum.id },
        });
        assert.equal(cur.status, 403);
      } else {
        // Inject curriculum_only membership for denial check
        const foundation = require("./foundation-data-model.js");
        const member = {
          id: "membership_curriculum_phase14",
          organizationId: orgId,
          userEmail: "curriculum.phase14@example.invalid",
          role: "curriculum_only",
          status: foundation.STAFF_STATUS.ACTIVE,
        };
        store.staffMemberships = store.staffMemberships || {};
        store.staffMemberships[member.id] = member;
        fs.writeFileSync(ctx.storePath, JSON.stringify(store, null, 2));
        const cur = await request(ctx.port, "GET", `${BASE}/dashboard`, {
          headers: { ...auth(token), "x-llh-role-preview-membership-id": member.id },
        });
        assert.equal(cur.status, 403);
      }
      pass("teacher_boundaries");
    }

    {
      const store = JSON.parse(fs.readFileSync(ctx.storePath, "utf8"));
      assert.equal(store.licensingCenter?.meta?.noOutboundEmail, true);
      assert.equal(store.licensingCenter?.meta?.noLegalComplianceClaim, true);
      assert.equal(store.licensingCenter?.meta?.noStripe, true);
      assert.equal(store.licensingCenter?.meta?.noLiveAi, true);
      pass("no_external_services");
    }

    const parent = await issueAndLogin(ctx.port, token, "parent_multi_child");
    const familyTasks = await request(ctx.port, "GET", "/api/family-hub/licensing/tasks", { headers: auth(parent.token) });
    assert.equal(familyTasks.status, 200, JSON.stringify(familyTasks.body));
    assert.equal(familyTasks.body.computerRecommended, true);
    for (const task of familyTasks.body.tasks || []) {
      assert.equal(task.computerRecommended, true);
      assert.ok(task.childId);
    }
    pass("family_immunization_tasks");

    const enStatus = await request(ctx.port, "GET", "/api/director-center/enrollment/status", { headers: auth(token) });
    assert.equal(enStatus.status, 200);
    const rcStatus = await request(ctx.port, "GET", "/api/director-center/records/status", { headers: auth(token) });
    assert.equal(rcStatus.status, 200);
    pass("enrollment_records_smoke");

  } finally {
    await stopServer(ctx);
  }

  console.log(`\nPhase 14 focused suite: ${passed} PASS`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
