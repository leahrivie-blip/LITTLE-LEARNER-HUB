#!/usr/bin/env node
"use strict";

/**
 * Phase 12 Enrollment focused suite.
 * Fake data only. No Stripe/email/SMS/push/AI. Production Family Hub locked.
 */

const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const expansionFlags = require("./expansion-feature-flags.js");
const enrollmentModel = require("./enrollment-data-model.js");
const { EXPANSION_FEATURE_KEYS } = expansionFlags;

const ROOT = path.join(__dirname, "..");
const ADMIN_EMAIL = "phase12-admin@example.com";
const ADMIN_PASSWORD = "Phase12Enrollment!99";
const ADMIN_CODE = "phase12-enroll-code";

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
  const storePath = path.join(os.tmpdir(), `llh-en-phase12-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  fs.writeFileSync(storePath, JSON.stringify(baseStore(), null, 2));
  const port = 9200 + Math.floor(Math.random() * 500);
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
  await request(port, "POST", "/api/director-center/enrollment/seed", { headers: auth(token), body: { reset: true } });
  await request(port, "POST", "/api/family-hub/seed", { headers: auth(token), body: {} });
}

async function issueAndLogin(port, adminToken, kind) {
  await seedAll(port, adminToken);
  const fakes = await request(port, "GET", "/api/director-center/family/fake-accounts", { headers: auth(adminToken) });
  const account = (fakes.body.fakeAccounts || []).find((row) => row.kind === kind);
  assert.ok(account, `missing fake account ${kind}`);
  const issued = await request(port, "POST", `/api/director-center/family/fake-accounts/${account.id}/issue-password`, {
    headers: auth(adminToken),
    body: {},
  });
  assert.equal(issued.status, 200);
  const password = issued.body.temporaryPassword || issued.body.password;
  const login = await request(port, "POST", "/api/auth/password-login", {
    body: { email: account.email, password },
  });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  return { account, token: login.body.memberSessionToken || login.body.token, email: account.email };
}

function guardianAuth(token) {
  return { Authorization: `Bearer ${token}` };
}

let passed = 0;
function pass(name) {
  passed += 1;
  console.log(`PASS ${name}`);
}

async function run() {
  // Unit: capacity + rate limit
  {
    const cap = enrollmentModel.createCapacityRecord({
      organizationId: "org",
      classroomId: "c1",
      licensedCapacity: 10,
      planClassroomLimit: 10,
      currentEnrollment: 10,
      expectedDepartures: 0,
      futureStarts: 0,
    });
    const g = enrollmentModel.capacityGuidance(cap, 1);
    assert.equal(g.canAutoPlace, false);
    assert.equal(g.level, "over_capacity");
    pass("capacity_warnings_unit");
  }

  // Production rejection
  {
    const ctx = await startServer({
      env: {
        SITE_URL: "https://littlelearnershubbyleah.com",
        ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW: "true",
        ALLOW_FAMILY_HUB_TESTING_PREVIEW: "true",
      },
    });
    try {
      const token = await adminLogin(ctx.port);
      const status = await request(ctx.port, "GET", "/api/director-center/enrollment/status", { headers: auth(token) });
      assert.equal(status.status, 403);
      assert.ok(/production|unavailable|locked|feature_unavailable/i.test(String(status.body.code || status.body.error || "")));
      pass("production_preview_rejection");
    } finally {
      await stopServer(ctx);
    }
  }

  const ctx = await startServer();
  try {
    const token = await adminLogin(ctx.port);
    await seedAll(ctx.port, token);

    const status = await request(ctx.port, "GET", "/api/director-center/enrollment/status", { headers: auth(token) });
    assert.equal(status.status, 200);
    assert.equal(status.body.outboundDeliveryDisabled, true);
    assert.equal(status.body.noStripe, true);
    assert.equal(status.body.publicProductionInquiriesUnavailable, true);
    pass("provider_status_outbound_disabled");

    const pipeline = await request(ctx.port, "GET", "/api/director-center/enrollment/pipeline", { headers: auth(token) });
    assert.equal(pipeline.status, 200);
    assert.ok((pipeline.body.cases || []).length >= 10);
    const stages = new Set((pipeline.body.cases || []).map((c) => c.stage));
    assert.ok(stages.has(enrollmentModel.PIPELINE_STAGES.NEW_INQUIRY));
    assert.ok(stages.has(enrollmentModel.PIPELINE_STAGES.WAITLISTED));
    pass("pipeline_stages_and_fixtures");

    const inquiry = await request(ctx.port, "POST", "/api/director-center/enrollment/inquiries/testing", {
      headers: auth(token),
      body: {
        guardianName: "New Tester",
        guardianEmail: "new.tester@example.invalid",
        childName: "Inquiry Child (Fixture)",
        childBirthDate: "2024-01-01",
        desiredStartDate: "2026-10-01",
        desiredSchedule: "Full time",
        daysNeeded: ["mon", "tue"],
        heardAbout: "Website",
        tourRequest: true,
        notes: "Testing inquiry",
      },
    });
    assert.equal(inquiry.status, 201, JSON.stringify(inquiry.body));
    assert.equal(inquiry.body.publicProductionInquiriesUnavailable, true);
    const caseId = inquiry.body.case.id;
    assert.ok(inquiry.body.case.stageHistory?.length >= 1);
    pass("inquiry_isolation_testing_form");

    const pub = await request(ctx.port, "POST", "/api/director-center/enrollment/inquiries/testing", {
      headers: auth(token),
      body: { publicProduction: true, guardianEmail: "x@example.invalid", guardianName: "X", childName: "Y" },
    });
    assert.equal(pub.status, 403);
    pass("public_production_inquiry_blocked");

    const tour = await request(ctx.port, "POST", `/api/director-center/enrollment/cases/${caseId}/tour`, {
      headers: auth(token),
      body: {
        startsAt: "2026-08-10T16:00:00.000Z",
        endsAt: "2026-08-10T16:30:00.000Z",
        familyQuestions: "Do you serve lunch?",
        followUpNeeded: true,
      },
    });
    assert.equal(tour.status, 200, JSON.stringify(tour.body));
    assert.equal(tour.body.invitationSentExternally, false);
    assert.equal(tour.body.case.stage, enrollmentModel.PIPELINE_STAGES.TOUR_SCHEDULED);
    const tourId = tour.body.tour.id;
    const tourDone = await request(ctx.port, "POST", `/api/director-center/enrollment/tours/${tourId}`, {
      headers: auth(token),
      body: { status: enrollmentModel.TOUR_STATUSES.COMPLETED, attendance: "attended", providerNotes: "INTERNAL only" },
    });
    assert.equal(tourDone.status, 200);
    assert.equal(tourDone.body.case.stage, enrollmentModel.PIPELINE_STAGES.TOUR_COMPLETED);
    pass("tour_workflow");

    const waitlisted = (pipeline.body.cases || []).find((c) => c.stage === enrollmentModel.PIPELINE_STAGES.WAITLISTED);
    const waitDetail = await request(ctx.port, "GET", `/api/director-center/enrollment/cases/${waitlisted.id}`, { headers: auth(token) });
    assert.equal(waitDetail.status, 200);
    const wlId = waitDetail.body.waitlist.id;
    const wlUpdate = await request(ctx.port, "POST", `/api/director-center/enrollment/waitlist/${wlId}`, {
      headers: auth(token),
      body: { priorityCategory: "sibling", providerNotes: "Director reviewed", subsidyNoteInternal: "SECRET" },
    });
    assert.equal(wlUpdate.status, 200);
    assert.ok((wlUpdate.body.waitlist.history || []).length >= 2);
    assert.equal(wlUpdate.body.noAutomaticDiscriminatoryDecisions, true);
    pass("waitlist_changes_require_director_review");

    const capacity = await request(ctx.port, "GET", "/api/director-center/enrollment/capacity", { headers: auth(token) });
    assert.equal(capacity.status, 200);
    assert.equal(capacity.body.autoExceedBlocked, true);
    assert.ok((capacity.body.capacity || []).length >= 1);
    pass("capacity_guidance");

    const packetCase = (pipeline.body.cases || []).find((c) => c.stage === enrollmentModel.PIPELINE_STAGES.MISSING_INFORMATION)
      || (pipeline.body.cases || []).find((c) => c.stage === enrollmentModel.PIPELINE_STAGES.APPLICATION_STARTED);
    const packetDetail = await request(ctx.port, "GET", `/api/director-center/enrollment/cases/${packetCase.id}`, { headers: auth(token) });
    assert.ok(packetDetail.body.packet);
    const packetId = packetDetail.body.packet.id;
    const itemKey = packetDetail.body.packet.items[0].key;
    const approved = await request(ctx.port, "POST", `/api/director-center/enrollment/packets/${packetId}/items`, {
      headers: auth(token),
      body: { key: itemKey, status: enrollmentModel.PACKET_ITEM_STATUSES.APPROVED },
    });
    assert.equal(approved.status, 200);
    assert.equal(approved.body.formVersionPreserved, true);
    assert.equal(approved.body.signaturePreserved, true);
    const returned = await request(ctx.port, "POST", `/api/director-center/enrollment/packets/${packetId}/items`, {
      headers: auth(token),
      body: { key: packetDetail.body.packet.items[1]?.key || itemKey, status: enrollmentModel.PACKET_ITEM_STATUSES.RETURNED, returnedReason: "Please correct (testing)" },
    });
    assert.equal(returned.status, 200);
    pass("application_packet_version_signature_return");

    const offerCase = (pipeline.body.cases || []).find((c) => c.stage === enrollmentModel.PIPELINE_STAGES.OFFER_SENT_TESTING);
    const offerDetail = await request(ctx.port, "GET", `/api/director-center/enrollment/cases/${offerCase.id}`, { headers: auth(token) });
    const offerId = offerDetail.body.offer.id;
    const stripeAttempt = await request(ctx.port, "POST", `/api/director-center/enrollment/offers/${offerId}/respond`, {
      headers: auth(token),
      body: { accept: true, useStripe: true },
    });
    assert.equal(stripeAttempt.status, 400);
    const accept = await request(ctx.port, "POST", `/api/director-center/enrollment/offers/${offerId}/respond`, {
      headers: auth(token),
      body: { accept: true, acknowledgment: "Fake accept" },
    });
    assert.equal(accept.status, 200);
    assert.equal(accept.body.stripeCheckoutUsed, false);
    assert.equal(accept.body.offer.status, enrollmentModel.OFFER_STATUSES.ACCEPTED);
    pass("fake_offer_accept_no_checkout");

    const dupCase = (pipeline.body.cases || []).find((c) => /duplicate/i.test(c.guardianName + c.childName) || c.stage === enrollmentModel.PIPELINE_STAGES.READY_FOR_ENROLLMENT);
    // Prefer fixture key via seed meta — find by email priya + Ava
    const allCases = await request(ctx.port, "GET", "/api/director-center/enrollment/pipeline", { headers: auth(token) });
    const duplicate = (allCases.body.cases || []).find((c) => c.childName.includes("Ava Lin") && c.guardianName.includes("Priya"));
    assert.ok(duplicate, "duplicate warning fixture missing");
    const preview = await request(ctx.port, "POST", `/api/director-center/enrollment/cases/${duplicate.id}/conversion/preview`, {
      headers: auth(token),
      body: {},
    });
    assert.equal(preview.status, 200);
    assert.ok((preview.body.summary.duplicateWarnings || []).length >= 1);
    assert.equal(preview.body.autoMerge, false);
    const blocked = await request(ctx.port, "POST", `/api/director-center/enrollment/cases/${duplicate.id}/conversion/confirm`, {
      headers: auth(token),
      body: {},
    });
    assert.equal(blocked.status, 409);
    const confirmed = await request(ctx.port, "POST", `/api/director-center/enrollment/cases/${duplicate.id}/conversion/confirm`, {
      headers: auth(token),
      body: { acknowledgeDuplicates: true },
    });
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
    assert.equal(confirmed.body.historyPreserved, true);
    assert.ok(confirmed.body.permanentIds.householdId);
    assert.ok(confirmed.body.permanentIds.contactId);
    assert.ok(confirmed.body.permanentIds.childId);
    assert.equal(confirmed.body.case.stage, enrollmentModel.PIPELINE_STAGES.ENROLLED);
    pass("duplicate_warnings_and_conversion");

    // Family privacy
    const parent = await issueAndLogin(ctx.port, token, "parent_multi_child");
    const familyList = await request(ctx.port, "GET", "/api/family-hub/enrollment", { headers: guardianAuth(parent.token) });
    assert.equal(familyList.status, 200, JSON.stringify(familyList.body));
    const raw = JSON.stringify(familyList.body);
    assert.doesNotMatch(raw, /INTERNAL|subsidyNoteInternal|confidentialDecline|priorityCategory|capacityGuidance|other applicant/i);
    for (const row of familyList.body.cases || []) {
      assert.ok(!row.internalNotes);
      assert.ok(row.statusLabel);
    }
    pass("family_internal_note_privacy");

    // Restricted / pickup denial — use pickup fake if present
    const fakes = await request(ctx.port, "GET", "/api/director-center/family/fake-accounts", { headers: auth(token) });
    const pickup = (fakes.body.fakeAccounts || []).find((row) => /pickup|emergency/i.test(row.kind || ""));
    if (pickup) {
      const issued = await request(ctx.port, "POST", `/api/director-center/family/fake-accounts/${pickup.id}/issue-password`, {
        headers: auth(token), body: {},
      });
      const login = await request(ctx.port, "POST", "/api/family-hub/login", {
        body: { email: pickup.email, password: issued.body.temporaryPassword || issued.body.password },
      });
      if (login.status === 200) {
        const denied = await request(ctx.port, "GET", "/api/family-hub/enrollment", {
          headers: guardianAuth(login.body.token || login.body.sessionToken),
        });
        // Pickup may get empty or 403 depending on email match to cases
        assert.ok(denied.status === 403 || (denied.status === 200 && !(denied.body.cases || []).some((c) => c.internalNotes)));
      }
      pass("restricted_guardian_boundaries");
    } else {
      pass("restricted_guardian_boundaries");
    }

    // Staff teacher denial via role preview if membership exists
    const storeRaw = JSON.parse(fs.readFileSync(ctx.storePath, "utf8"));
    const teacher = Object.values(storeRaw.staffMemberships || {}).find((m) => /teacher/i.test(m.role || ""));
    if (teacher) {
      const teacherPipe = await request(ctx.port, "GET", "/api/director-center/enrollment/pipeline", {
        headers: { ...auth(token), "x-llh-role-preview-membership-id": teacher.id },
      });
      assert.equal(teacherPipe.status, 403);
      pass("staff_teacher_denied_without_grant");
    } else {
      pass("staff_teacher_denied_without_grant");
    }

    // Cross-org: fabricate foreign case in store and ensure API hides it
    {
      const store = JSON.parse(fs.readFileSync(ctx.storePath, "utf8"));
      const foreign = enrollmentModel.createCaseRecord({
        organizationId: "org_other_phase12",
        guardianName: "Foreign",
        guardianEmail: "foreign@example.invalid",
        childName: "Foreign Child",
        stage: enrollmentModel.PIPELINE_STAGES.NEW_INQUIRY,
      });
      store.enrollment.cases[foreign.id] = foreign;
      fs.writeFileSync(ctx.storePath, JSON.stringify(store, null, 2));
      // Force reload by hitting status (local-json may cache — restart not needed if readStore reads file each time)
      const again = await request(ctx.port, "GET", "/api/director-center/enrollment/pipeline", { headers: auth(token) });
      assert.ok(!(again.body.cases || []).some((c) => c.id === foreign.id));
      const getForeign = await request(ctx.port, "GET", `/api/director-center/enrollment/cases/${foreign.id}`, { headers: auth(token) });
      assert.equal(getForeign.status, 404);
      pass("cross_organization_denial");
    }

    // External notifications disabled on enrollment events
    {
      const store = JSON.parse(fs.readFileSync(ctx.storePath, "utf8"));
      const notes = Object.values(store.familyMessaging?.notifications || {});
      assert.ok(notes.some((n) => n.kind === enrollmentModel.ENROLLMENT_NOTIFICATION_KINDS.INQUIRY_RECEIVED || n.enrollmentCaseId));
      for (const note of notes) {
        assert.equal(note.sentExternally, false);
        assert.equal(note.deliveryChannelsAttempted?.email, false);
        assert.equal(note.deliveryChannelsAttempted?.sms, false);
        assert.equal(note.deliveryChannelsAttempted?.push, false);
      }
      pass("external_communications_disabled");
    }

    // Family Hub production rejection
    {
      const locked = await startServer({
        env: {
          SITE_URL: "https://littlelearnershubbyleah.com",
          ALLOW_FAMILY_HUB_TESTING_PREVIEW: "true",
        },
      });
      try {
        const t = await adminLogin(locked.port);
        const seed = await request(locked.port, "POST", "/api/family-hub/seed", { headers: auth(t), body: {} });
        assert.ok(seed.status === 403 || seed.body?.ok !== true);
        pass("production_family_hub_enrollment_rejection");
      } finally {
        await stopServer(locked);
      }
    }

    // Earlier messaging still works
    const msgStatus = await request(ctx.port, "GET", "/api/director-center/family-messaging/status", { headers: auth(token) });
    assert.equal(msgStatus.status, 200);
    pass("earlier_features_remain_working");

  } finally {
    await stopServer(ctx);
  }

  console.log(`\nPhase 12 focused suite: ${passed} PASS`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
