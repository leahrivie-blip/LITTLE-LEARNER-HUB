/**
 * Phase 12 provider Enrollment API — /api/director-center/enrollment/*
 * Fake/testing only. No outbound email/SMS/push. No Stripe. No live AI.
 * Handlers receive context { adminEmail } from director-center mount.
 */

const foundation = require("../scripts/foundation-data-model.js");
const orgPermissions = require("../scripts/org-permissions.js");
const formsFixtures = require("../scripts/forms-center-preview-fixtures.js");
const familyModel = require("../scripts/family-foundation-data-model.js");
const model = require("../scripts/enrollment-data-model.js");
const fixtures = require("../scripts/enrollment-fixtures.js");

const BASE = "/api/director-center/enrollment";
const PRODUCTION_HOST = "littlelearnershubbyleah.com";
const TESTING_BANNER = model.TESTING_BANNER;

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

function safeLower(value) {
  return String(value || "").trim().toLowerCase();
}

function truthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function getHeader(request, name) {
  const key = String(name || "").toLowerCase();
  const headers = request && request.headers ? request.headers : {};
  if (headers && typeof headers.get === "function") {
    return String(headers.get(name) || headers.get(key) || "").trim();
  }
  if (headers && Object.prototype.hasOwnProperty.call(headers, key)) {
    return String(headers[key] || "").trim();
  }
  const found = Object.keys(headers || {}).find((headerName) => headerName.toLowerCase() === key);
  return found ? String(headers[found] || "").trim() : "";
}

function productionSiteFromUrl(siteUrl) {
  return Boolean(String(siteUrl || "").toLowerCase().includes(PRODUCTION_HOST));
}

function resolveEnv(expansionEnvironment) {
  let env = null;
  if (typeof expansionEnvironment === "function") {
    try { env = expansionEnvironment(); } catch { env = null; }
  }
  if (!env || typeof env !== "object") {
    const siteUrl = String(process.env.SITE_URL || "");
    env = {
      liveProduction: productionSiteFromUrl(siteUrl),
      allowDirectorCenterAdminPreview: !productionSiteFromUrl(siteUrl) && truthy(process.env.ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW),
      siteUrl,
    };
  }
  const siteUrl = String(env.siteUrl || process.env.SITE_URL || "");
  const liveProduction = env.liveProduction === true || productionSiteFromUrl(siteUrl);
  return {
    ...env,
    liveProduction,
    allowDirectorCenterAdminPreview: env.allowDirectorCenterAdminPreview === true && !liveProduction,
    siteUrl,
  };
}

function createEnrollmentApi({
  readStore,
  writeStore,
  jsonResponse,
  readJson,
  normalizeEmail,
  expansionEnvironment,
}) {
  function env() {
    return resolveEnv(expansionEnvironment);
  }

  function deny(response, status, code, error) {
    jsonResponse(response, status, {
      ok: false,
      error: error || "Access denied.",
      code,
      enrollment: true,
      preview: true,
      testingBanner: TESTING_BANNER,
    });
  }

  function ensureOrg(store, adminEmail) {
    model.ensureEnrollmentStore(store);
    const seeded = fixtures.ensurePhase12Preview(store, { adminEmail: normalizeEmail?.(adminEmail) || adminEmail });
    const organization = store.organizations?.[seeded.organizationId]
      || formsFixtures.ensurePreviewOrganization(store, { adminEmail });
    return { organization, seeded };
  }

  function resolveActor(store, request, organizationId, adminEmail) {
    const members = listValues(store.staffMemberships).filter((row) => row.organizationId === organizationId && row.status === foundation.STAFF_STATUS.ACTIVE);
    const owner = members.find((row) => safeLower(row.userEmail) === safeLower(adminEmail))
      || members.find((row) => row.role === orgPermissions.ORG_ROLES.DIRECTOR_OWNER)
      || members[0];
    const policyOk = env().allowDirectorCenterAdminPreview === true && !env().liveProduction;
    const requested = getHeader(request, "x-llh-role-preview-membership-id");
    if (requested && policyOk) {
      const member = store.staffMemberships?.[requested];
      if (member && member.organizationId === organizationId) {
        return { actor: member, membership: member, rolePreview: true };
      }
    }
    return {
      actor: owner || {
        userEmail: adminEmail,
        role: orgPermissions.ORG_ROLES.DIRECTOR_OWNER,
        organizationId,
        id: "membership_admin_preview",
      },
      membership: owner,
      rolePreview: false,
    };
  }

  function isDirectorRole(role) {
    return role === orgPermissions.ORG_ROLES.DIRECTOR_OWNER || role === orgPermissions.ORG_ROLES.DIRECTOR;
  }

  function assertEnrollmentManage(actor, response) {
    const role = actor?.role || "";
    if (role === "curriculum_only" || /curriculum_only/i.test(role)) {
      deny(response, 403, "enrollment_denied", "Curriculum Only cannot access enrollment.");
      return false;
    }
    if (role === orgPermissions.ORG_ROLES.ASSISTANT_STAFF && !actor.enrollmentOverride) {
      deny(response, 403, "enrollment_denied", "Assistants are denied enrollment access by default.");
      return false;
    }
    if ((role === orgPermissions.ORG_ROLES.LEAD_TEACHER || /teacher/i.test(role)) && !isDirectorRole(role) && !actor.enrollmentLimitedGrant) {
      deny(response, 403, "enrollment_denied", "Teachers do not have applicant access unless explicitly granted.");
      return false;
    }
    return true;
  }

  function matchesFilters(row, query) {
    const q = query || {};
    const text = safeLower(q.q || q.family || "");
    if (text) {
      const hay = `${row.guardianName} ${row.guardianEmail} ${row.childName}`.toLowerCase();
      if (!hay.includes(text)) return false;
    }
    if (q.child && !safeLower(row.childName).includes(safeLower(q.child))) return false;
    if (q.stage && row.stage !== q.stage) return false;
    if (q.applicationStatus && row.applicationStatus !== q.applicationStatus) return false;
    if (q.tourStatus && row.tourStatus !== q.tourStatus) return false;
    if (q.desiredClassroom && row.preferredClassroomId !== q.desiredClassroom) return false;
    if (q.schedule && !safeLower(row.desiredSchedule).includes(safeLower(q.schedule))) return false;
    if (q.startDate && row.desiredStartDate !== q.startDate) return false;
    if (q.assignedStaff && safeLower(row.assignedStaffEmail) !== safeLower(q.assignedStaff)) return false;
    if (q.missingInformation === "1" || q.missingInformation === "true") {
      if (!(row.missingInformation || []).length) return false;
    }
    if (q.waitlistPriority && row.waitlistPriority !== q.waitlistPriority) return false;
    if (q.age) {
      const age = Number(q.age);
      if (Number.isFinite(age) && row.childAgeMonths != null && Math.abs(row.childAgeMonths - age) > 6) return false;
    }
    return true;
  }

  async function handleStatus(request, response, context = {}) {
    if (env().liveProduction) return deny(response, 403, "production_locked", "Enrollment testing is not available on production.");
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      phase: 12,
      preview: true,
      testingBanner: TESTING_BANNER,
      organizationId: organization.id,
      outboundDeliveryDisabled: true,
      publicProductionInquiriesUnavailable: true,
      noStripe: true,
      noLiveAi: true,
      stages: Object.values(model.PIPELINE_STAGES),
      caseCount: listValues(store.enrollment.cases).filter((c) => c.organizationId === organization.id).length,
    });
  }

  async function handleSeed(request, response, context = {}) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const body = await readJson(request).catch(() => ({}));
    const store = readStore();
    const result = body.reset === true
      ? fixtures.resetPhase12Preview(store, { adminEmail: context.adminEmail, organizationId: body.organizationId || "" })
      : fixtures.ensurePhase12Preview(store, { adminEmail: context.adminEmail, organizationId: body.organizationId || "" });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, testingBanner: TESTING_BANNER, ...result });
  }

  async function handlePipeline(request, response, context = {}, url) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!assertEnrollmentManage(actor, response)) return;
    const q = Object.fromEntries(url.searchParams.entries());
    const cases = listValues(store.enrollment.cases)
      .filter((row) => row.organizationId === organization.id)
      .filter((row) => matchesFilters(row, q))
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    const byStage = {};
    for (const stage of Object.values(model.PIPELINE_STAGES)) byStage[stage] = [];
    for (const row of cases) {
      if (!byStage[row.stage]) byStage[row.stage] = [];
      byStage[row.stage].push({
        id: row.id,
        guardianName: row.guardianName,
        childName: row.childName,
        stage: row.stage,
        desiredStartDate: row.desiredStartDate,
        desiredSchedule: row.desiredSchedule,
        preferredClassroomId: row.preferredClassroomId,
        assignedStaffEmail: row.assignedStaffEmail,
        missingInformation: row.missingInformation,
        waitlistPriority: row.waitlistPriority,
        updatedAt: row.updatedAt,
        createdAt: row.createdAt,
        fakeLabel: row.fakeLabel,
      });
    }
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      testingBanner: TESTING_BANNER,
      view: q.view === "board" ? "board" : "list",
      cases,
      board: byStage,
      total: cases.length,
    });
  }

  async function handleCaseGet(request, response, context, caseId) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!assertEnrollmentManage(actor, response)) return;
    const row = store.enrollment.cases[caseId];
    if (!row || row.organizationId !== organization.id) return deny(response, 404, "not_found", "Case not found.");
    const capacity = listValues(store.enrollment.capacity).find((c) => c.classroomId === row.preferredClassroomId);
    jsonResponse(response, 200, {
      ok: true,
      testingBanner: TESTING_BANNER,
      case: row,
      inquiry: row.inquiryId ? store.enrollment.inquiries[row.inquiryId] : null,
      tour: row.tourId ? store.enrollment.tours[row.tourId] : null,
      waitlist: row.waitlistId ? store.enrollment.waitlist[row.waitlistId] : null,
      offer: row.offerId ? store.enrollment.offers[row.offerId] : null,
      packet: row.packetId ? store.enrollment.packets[row.packetId] : null,
      capacity,
      capacityGuidance: model.capacityGuidance(capacity, 1),
      audit: listValues(store.enrollment.audit).filter((a) => a.caseId === row.id),
    });
  }

  async function handleStageChange(request, response, context, caseId) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const body = await readJson(request).catch(() => ({}));
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!assertEnrollmentManage(actor, response)) return;
    const row = store.enrollment.cases[caseId];
    if (!row || row.organizationId !== organization.id) return deny(response, 404, "not_found");
    if (!Object.values(model.PIPELINE_STAGES).includes(body.stage)) return deny(response, 400, "invalid_stage");
    model.setCaseStage(store, row, body.stage, actor.userEmail || context.adminEmail, body.note || "");
    if (body.internalNotes != null) row.internalNotes = model.cleanLongText(body.internalNotes, 4000);
    if (body.confidentialDeclineReason != null) row.confidentialDeclineReason = model.cleanLongText(body.confidentialDeclineReason, 1000);
    writeStore(store);
    jsonResponse(response, 200, { ok: true, case: row, testingBanner: TESTING_BANNER });
  }

  async function handleTestingInquiry(request, response, context = {}) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const body = await readJson(request).catch(() => ({}));
    if (body.publicProduction === true) {
      return deny(response, 403, "public_inquiry_unavailable", model.PUBLIC_INQUIRY_DISABLED_MESSAGE);
    }
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!assertEnrollmentManage(actor, response)) return;
    const email = model.cleanText(body.guardianEmail, 160).toLowerCase();
    if (!email.endsWith("@example.invalid") && !email.includes("example")) {
      return deny(response, 400, "fake_email_required", "Testing inquiries must use @example.invalid contacts.");
    }
    const rateKey = `${organization.id}:${email}`;
    const limit = model.checkInquiryRateLimit(store, rateKey);
    if (!limit.allowed) return deny(response, 429, "rate_limited", "Too many inquiry submissions. Try again later.");

    const caseRow = model.createCaseRecord({
      organizationId: organization.id,
      stage: body.tourRequest ? model.PIPELINE_STAGES.TOUR_REQUESTED : model.PIPELINE_STAGES.NEW_INQUIRY,
      guardianName: body.guardianName,
      guardianEmail: email,
      guardianPhone: body.guardianPhone,
      childName: body.childName,
      childBirthDate: body.childBirthDate,
      desiredStartDate: body.desiredStartDate,
      desiredSchedule: body.desiredSchedule,
      daysNeeded: body.daysNeeded,
      hoursNeeded: body.hoursNeeded,
      preferredClassroomId: body.preferredClassroomId,
      preferredAgeGroup: body.preferredAgeGroup,
      siblingInfo: body.siblingInfo,
      programInterests: body.programInterests,
      heardAbout: body.heardAbout,
      tourRequested: body.tourRequest === true,
      providerQuestions: body.providerQuestions,
      familyNotes: body.notes,
      createdByEmail: actor.userEmail || context.adminEmail,
    });
    const inquiry = model.createInquiryRecord({
      ...body,
      organizationId: organization.id,
      caseId: caseRow.id,
      guardianEmail: email,
      rateLimitKey: rateKey,
    });
    caseRow.inquiryId = inquiry.id;
    store.enrollment.cases[caseRow.id] = caseRow;
    store.enrollment.inquiries[inquiry.id] = inquiry;
    model.appendAudit(store, {
      organizationId: organization.id,
      caseId: caseRow.id,
      action: "inquiry_created",
      actorEmail: actor.userEmail || context.adminEmail,
      actorRole: actor.role,
      detail: "Testing-preview inquiry",
    });
    model.createEnrollmentNotification(store, {
      organizationId: organization.id,
      recipientEmail: actor.userEmail || context.adminEmail,
      recipientRole: "director",
      kind: model.ENROLLMENT_NOTIFICATION_KINDS.INQUIRY_RECEIVED,
      title: "New testing inquiry received",
      preview: "A fake family submitted a testing inquiry.",
      caseId: caseRow.id,
      adminOnly: true,
    });
    writeStore(store);
    jsonResponse(response, 201, {
      ok: true,
      testingBanner: TESTING_BANNER,
      case: caseRow,
      inquiry,
      publicProductionInquiriesUnavailable: true,
    });
  }

  async function handleTourSchedule(request, response, context, caseId) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const body = await readJson(request).catch(() => ({}));
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!assertEnrollmentManage(actor, response)) return;
    const row = store.enrollment.cases[caseId];
    if (!row || row.organizationId !== organization.id) return deny(response, 404, "not_found");
    let slotId = body.slotId || "";
    if (!slotId && body.startsAt) {
      const slot = model.createTourSlotRecord({
        organizationId: organization.id,
        startsAt: body.startsAt,
        endsAt: body.endsAt,
        assignedStaffEmail: body.assignedStaffEmail || actor.userEmail || context.adminEmail,
      });
      store.enrollment.tourSlots[slot.id] = slot;
      slotId = slot.id;
    }
    const tour = model.createTourRecord({
      organizationId: organization.id,
      caseId: row.id,
      slotId,
      status: model.TOUR_STATUSES.SCHEDULED,
      scheduledAt: body.startsAt || body.scheduledAt,
      assignedStaffEmail: body.assignedStaffEmail || actor.userEmail || context.adminEmail,
      familyQuestions: body.familyQuestions,
      providerNotes: body.providerNotes,
      followUpNeeded: body.followUpNeeded === true,
    });
    store.enrollment.tours[tour.id] = tour;
    row.tourId = tour.id;
    row.tourStatus = tour.status;
    model.setCaseStage(store, row, model.PIPELINE_STAGES.TOUR_SCHEDULED, actor.userEmail || context.adminEmail, "Tour scheduled");
    model.createEnrollmentNotification(store, {
      organizationId: organization.id,
      recipientEmail: row.guardianEmail,
      kind: model.ENROLLMENT_NOTIFICATION_KINDS.TOUR_SCHEDULED,
      title: "Tour scheduled (testing)",
      preview: "Your program tour details are available in Family Hub.",
      caseId: row.id,
    });
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      tour,
      case: row,
      invitationTemplateStored: true,
      invitationSentExternally: false,
      testingBanner: TESTING_BANNER,
    });
  }

  async function handleTourUpdate(request, response, context, tourId) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const body = await readJson(request).catch(() => ({}));
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!assertEnrollmentManage(actor, response)) return;
    const tour = store.enrollment.tours[tourId];
    if (!tour || tour.organizationId !== organization.id) return deny(response, 404, "not_found");
    const prev = tour.status;
    if (body.status && Object.values(model.TOUR_STATUSES).includes(body.status)) tour.status = body.status;
    if (body.attendance != null) tour.attendance = model.cleanText(body.attendance, 40);
    if (body.providerNotes != null) tour.providerNotes = model.cleanLongText(body.providerNotes, 2000);
    if (body.familyQuestions != null) tour.familyQuestions = model.cleanLongText(body.familyQuestions, 2000);
    if (body.followUpNeeded != null) tour.followUpNeeded = body.followUpNeeded === true;
    if (body.assignedStaffEmail) tour.assignedStaffEmail = model.cleanText(body.assignedStaffEmail, 160).toLowerCase();
    if (body.scheduledAt) tour.scheduledAt = model.cleanText(body.scheduledAt, 40);
    tour.updatedAt = model.nowIso();
    tour.history.push({ status: tour.status, at: tour.updatedAt, previous: prev });
    tour.invitationSentExternally = false;
    const row = store.enrollment.cases[tour.caseId];
    if (row) {
      row.tourStatus = tour.status;
      if (tour.status === model.TOUR_STATUSES.COMPLETED) {
        model.setCaseStage(store, row, model.PIPELINE_STAGES.TOUR_COMPLETED, actor.userEmail || context.adminEmail, "Tour completed");
      } else if (body.moveTo && Object.values(model.PIPELINE_STAGES).includes(body.moveTo)) {
        model.setCaseStage(store, row, body.moveTo, actor.userEmail || context.adminEmail, "Post-tour move");
      }
      model.createEnrollmentNotification(store, {
        organizationId: organization.id,
        recipientEmail: row.guardianEmail,
        kind: model.ENROLLMENT_NOTIFICATION_KINDS.TOUR_CHANGED,
        title: "Tour update (testing)",
        preview: "Your tour details were updated.",
        caseId: row.id,
      });
    }
    writeStore(store);
    jsonResponse(response, 200, { ok: true, tour, case: row, invitationSentExternally: false, testingBanner: TESTING_BANNER });
  }

  async function handleWaitlistUpdate(request, response, context, waitlistId) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const body = await readJson(request).catch(() => ({}));
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!assertEnrollmentManage(actor, response)) return;
    const wl = store.enrollment.waitlist[waitlistId];
    if (!wl || wl.organizationId !== organization.id) return deny(response, 404, "not_found");
    const rules = store.enrollment.priorityRules[organization.id] || model.defaultPriorityRules(organization.id);
    if ((body.status || body.priorityCategory) && rules.requireDirectorReviewBeforeOfferOrDenial !== false) {
      if (!isDirectorRole(actor.role) && !actor.enrollmentOfferGrant) {
        return deny(response, 403, "director_review_required", "Director review is required before waitlist offer/denial changes.");
      }
    }
    const prev = { status: wl.status, priorityCategory: wl.priorityCategory };
    if (body.status && Object.values(model.WAITLIST_STATUSES).includes(body.status)) wl.status = body.status;
    if (body.priorityCategory) wl.priorityCategory = model.cleanText(body.priorityCategory, 80);
    if (body.providerNotes != null) wl.providerNotes = model.cleanLongText(body.providerNotes, 2000);
    if (body.subsidyNoteInternal != null) wl.subsidyNoteInternal = model.cleanLongText(body.subsidyNoteInternal, 1000);
    if (body.showNumericalPosition === true && body.displayPosition != null) {
      wl.showNumericalPosition = true;
      wl.displayPosition = Number(body.displayPosition);
    }
    if (body.showNumericalPosition === false) {
      wl.showNumericalPosition = false;
      wl.displayPosition = null;
    }
    wl.updatedAt = model.nowIso();
    wl.history.push({
      status: wl.status,
      priorityCategory: wl.priorityCategory,
      at: wl.updatedAt,
      by: actor.userEmail || context.adminEmail,
      previous: prev,
    });
    const row = store.enrollment.cases[wl.caseId];
    if (row) {
      row.waitlistPriority = wl.priorityCategory;
      if (wl.status === model.WAITLIST_STATUSES.ACTIVE) {
        model.setCaseStage(store, row, model.PIPELINE_STAGES.WAITLISTED, actor.userEmail || context.adminEmail, "Waitlist update");
      }
      model.createEnrollmentNotification(store, {
        organizationId: organization.id,
        recipientEmail: row.guardianEmail,
        kind: model.ENROLLMENT_NOTIFICATION_KINDS.WAITLIST_UPDATE,
        title: "Waitlist update (testing)",
        preview: "Your waitlist status was updated. Priority rules are not shown to families.",
        caseId: row.id,
      });
    }
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      waitlist: wl,
      noAutomaticDiscriminatoryDecisions: true,
      directorReviewRequired: true,
      testingBanner: TESTING_BANNER,
    });
  }

  async function handleCapacity(request, response, context = {}) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!assertEnrollmentManage(actor, response)) return;
    const rows = listValues(store.enrollment.capacity).filter((c) => c.organizationId === organization.id);
    jsonResponse(response, 200, {
      ok: true,
      capacity: rows.map((row) => ({ ...row, guidance: model.capacityGuidance(row, 1) })),
      autoExceedBlocked: true,
      testingBanner: TESTING_BANNER,
    });
  }

  async function handleCreatePacket(request, response, context, caseId) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const body = await readJson(request).catch(() => ({}));
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!assertEnrollmentManage(actor, response)) return;
    const row = store.enrollment.cases[caseId];
    if (!row || row.organizationId !== organization.id) return deny(response, 404, "not_found");
    const items = Array.isArray(body.items) && body.items.length ? body.items : model.defaultPacketItems();
    const packet = model.createPacketRecord({
      organizationId: organization.id,
      caseId: row.id,
      title: body.title || "Enrollment packet (testing)",
      items: items.map((item) => ({
        ...item,
        formVersionId: item.formVersionId || `fv_${item.key || "form"}`,
      })),
    });
    store.enrollment.packets[packet.id] = packet;
    row.packetId = packet.id;
    row.applicationStatus = "in_progress";
    model.setCaseStage(store, row, model.PIPELINE_STAGES.APPLICATION_STARTED, actor.userEmail || context.adminEmail, "Packet created");
    model.createEnrollmentNotification(store, {
      organizationId: organization.id,
      recipientEmail: row.guardianEmail,
      kind: model.ENROLLMENT_NOTIFICATION_KINDS.APPLICATION_AVAILABLE,
      title: "Enrollment application available (testing)",
      preview: "Your enrollment forms are ready in Family Hub.",
      caseId: row.id,
    });
    writeStore(store);
    jsonResponse(response, 201, { ok: true, packet, case: row, testingBanner: TESTING_BANNER });
  }

  async function handlePacketItem(request, response, context, packetId) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const body = await readJson(request).catch(() => ({}));
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!assertEnrollmentManage(actor, response)) return;
    const packet = store.enrollment.packets[packetId];
    if (!packet || packet.organizationId !== organization.id) return deny(response, 404, "not_found");
    const item = packet.items.find((row) => row.key === body.key);
    if (!item) return deny(response, 404, "item_not_found");
    const prevStatus = item.status;
    if (body.status && Object.values(model.PACKET_ITEM_STATUSES).includes(body.status)) item.status = body.status;
    if (body.returnedReason != null) item.returnedReason = model.cleanText(body.returnedReason, 400);
    if (body.status === model.PACKET_ITEM_STATUSES.APPROVED) {
      item.approvedAt = model.nowIso();
      item.signaturePreserved = true;
    }
    packet.updatedAt = model.nowIso();
    const row = store.enrollment.cases[packet.caseId];
    if (row && body.status === model.PACKET_ITEM_STATUSES.RETURNED) {
      row.missingInformation = Array.from(new Set([...(row.missingInformation || []), item.title]));
      model.setCaseStage(store, row, model.PIPELINE_STAGES.MISSING_INFORMATION, actor.userEmail || context.adminEmail, "Form returned");
      model.createEnrollmentNotification(store, {
        organizationId: organization.id,
        recipientEmail: row.guardianEmail,
        kind: model.ENROLLMENT_NOTIFICATION_KINDS.FORMS_RETURNED,
        title: "Form returned for correction (testing)",
        preview: "Please update the returned enrollment form.",
        caseId: row.id,
      });
    }
    model.appendAudit(store, {
      organizationId: organization.id,
      caseId: packet.caseId,
      action: "packet_item_update",
      actorEmail: actor.userEmail || context.adminEmail,
      detail: `${item.key}: ${prevStatus} → ${item.status}`,
      previous: prevStatus,
      next: item.status,
    });
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      packet,
      formVersionPreserved: Boolean(item.formVersionId),
      signaturePreserved: item.signaturePreserved === true,
      testingBanner: TESTING_BANNER,
    });
  }

  async function handleCreateOffer(request, response, context, caseId) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const body = await readJson(request).catch(() => ({}));
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!assertEnrollmentManage(actor, response)) return;
    const row = store.enrollment.cases[caseId];
    if (!row || row.organizationId !== organization.id) return deny(response, 404, "not_found");
    const offer = model.createOfferRecord({
      organizationId: organization.id,
      caseId: row.id,
      childName: row.childName,
      classroomId: body.classroomId || row.preferredClassroomId,
      ageGroup: body.ageGroup || row.preferredAgeGroup,
      proposedStartDate: body.proposedStartDate || row.desiredStartDate,
      schedule: body.schedule || row.desiredSchedule,
      tuitionAmountSimulated: body.tuitionAmountSimulated,
      registrationFeeSimulated: body.registrationFeeSimulated,
      depositSimulated: body.depositSimulated,
      expiresAt: body.expiresAt,
      requiredFormKeys: body.requiredFormKeys,
      providerTerms: body.providerTerms || "Fake testing offer terms. No real charge.",
      status: body.send === true ? model.OFFER_STATUSES.SENT_TESTING : model.OFFER_STATUSES.DRAFT,
    });
    store.enrollment.offers[offer.id] = offer;
    row.offerId = offer.id;
    model.setCaseStage(
      store,
      row,
      offer.status === model.OFFER_STATUSES.SENT_TESTING ? model.PIPELINE_STAGES.OFFER_SENT_TESTING : model.PIPELINE_STAGES.OFFER_PREPARED,
      actor.userEmail || context.adminEmail,
      "Offer prepared",
    );
    if (offer.status === model.OFFER_STATUSES.SENT_TESTING) {
      model.createEnrollmentNotification(store, {
        organizationId: organization.id,
        recipientEmail: row.guardianEmail,
        kind: model.ENROLLMENT_NOTIFICATION_KINDS.OFFER_AVAILABLE,
        title: "Enrollment offer available (testing)",
        preview: "Review your fake offer. No payment will be taken.",
        caseId: row.id,
      });
    }
    writeStore(store);
    jsonResponse(response, 201, {
      ok: true,
      offer,
      case: row,
      stripeCheckoutUsed: false,
      realChargeAttempted: false,
      testingBanner: TESTING_BANNER,
    });
  }

  async function handleOfferRespond(request, response, context, offerId) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const body = await readJson(request).catch(() => ({}));
    if (body.useStripe === true || body.charge === true) {
      return deny(response, 400, "stripe_disabled", "Real Stripe checkout is disabled for enrollment offers.");
    }
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!assertEnrollmentManage(actor, response)) return;
    const offer = store.enrollment.offers[offerId];
    if (!offer || offer.organizationId !== organization.id) return deny(response, 404, "not_found");
    const row = store.enrollment.cases[offer.caseId];
    if (body.accept === true) {
      offer.status = model.OFFER_STATUSES.ACCEPTED;
      offer.acceptedAt = model.nowIso();
      offer.guardianAcknowledgment = model.cleanText(body.acknowledgment || "I acknowledge this fake testing offer.", 500);
      if (row) model.setCaseStage(store, row, model.PIPELINE_STAGES.OFFER_ACCEPTED, actor.userEmail || context.adminEmail, "Offer accepted (testing)");
    } else if (body.decline === true) {
      offer.status = model.OFFER_STATUSES.DECLINED;
      offer.declinedAt = model.nowIso();
      offer.declineReasonFamily = model.cleanText(body.reason, 400);
      if (row) model.setCaseStage(store, row, model.PIPELINE_STAGES.OFFER_DECLINED, actor.userEmail || context.adminEmail, "Offer declined");
    } else {
      return deny(response, 400, "invalid_response");
    }
    offer.stripeCheckoutUsed = false;
    offer.realChargeAttempted = false;
    offer.updatedAt = model.nowIso();
    writeStore(store);
    jsonResponse(response, 200, { ok: true, offer, case: row, stripeCheckoutUsed: false, testingBanner: TESTING_BANNER });
  }

  async function handleConversionPreview(request, response, context, caseId) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!assertEnrollmentManage(actor, response)) return;
    if (!isDirectorRole(actor.role)) return deny(response, 403, "director_required", "Only directors/owners can convert enrollment.");
    const row = store.enrollment.cases[caseId];
    if (!row || row.organizationId !== organization.id) return deny(response, 404, "not_found");
    const warnings = model.findDuplicateWarnings(store, row);
    const capacity = listValues(store.enrollment.capacity).find((c) => c.classroomId === (row.preferredClassroomId || row.classroomPlacementId));
    const guidance = model.capacityGuidance(capacity, 1);
    const summary = model.createConversionSummary({
      organizationId: organization.id,
      caseId: row.id,
      householdId: row.householdId,
      contactId: row.contactId,
      childId: row.childId,
      classroomId: row.preferredClassroomId,
      householdAction: row.householdId ? "reuse" : "create",
      contactAction: row.contactId ? "reuse" : "create",
      childAction: row.childId ? "reuse" : "create",
      duplicateWarnings: warnings,
    });
    store.enrollment.conversionSummaries[summary.id] = summary;
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      summary,
      capacityGuidance: guidance,
      autoMerge: false,
      providerMustConfirm: true,
      testingBanner: TESTING_BANNER,
    });
  }

  async function handleConversionConfirm(request, response, context, caseId) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const body = await readJson(request).catch(() => ({}));
    if (body.autoMerge === true) return deny(response, 400, "auto_merge_forbidden", "Automatic merges are never allowed.");
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!assertEnrollmentManage(actor, response)) return;
    if (!isDirectorRole(actor.role)) return deny(response, 403, "director_required");
    const row = store.enrollment.cases[caseId];
    if (!row || row.organizationId !== organization.id) return deny(response, 404, "not_found");
    const summary = listValues(store.enrollment.conversionSummaries).find((s) => s.caseId === row.id && !s.confirmed)
      || model.createConversionSummary({ organizationId: organization.id, caseId: row.id });
    const warnings = model.findDuplicateWarnings(store, row);
    summary.duplicateWarnings = warnings;
    if (warnings.length && body.acknowledgeDuplicates !== true) {
      return deny(response, 409, "duplicate_warnings", "Acknowledge duplicate warnings before confirming. Records will not auto-merge.");
    }
    const capacity = listValues(store.enrollment.capacity).find((c) => c.classroomId === (body.classroomId || row.preferredClassroomId));
    const guidance = model.capacityGuidance(capacity, 1);
    if (guidance.level === "over_capacity") {
      return deny(response, 403, "capacity_exceed_forbidden", "Enrollment cannot automatically exceed classroom or plan limits.");
    }

    familyModel.ensureFamilyFoundationStore(store);
    let householdId = row.householdId;
    let contactId = row.contactId;
    let childId = row.childId;

    if (!householdId) {
      const hh = familyModel.createHouseholdRecord({
        organizationId: organization.id,
        displayName: `${row.guardianName} household (enrollment)`,
        createdByEmail: actor.userEmail || context.adminEmail,
      });
      store.familyFoundation.households[hh.id] = hh;
      householdId = hh.id;
      summary.householdAction = "create";
    } else summary.householdAction = "reuse";

    if (!contactId) {
      const contact = familyModel.createContactRecord({
        organizationId: organization.id,
        displayName: row.guardianName,
        email: row.guardianEmail,
        phone: row.guardianPhone,
        createdByEmail: actor.userEmail || context.adminEmail,
      });
      store.familyFoundation.contacts[contact.id] = contact;
      contactId = contact.id;
      summary.contactAction = "create";
    } else summary.contactAction = "reuse";

    if (!childId) {
      const childRecord = {
        id: model.newId("child"),
        organizationId: organization.id,
        displayName: row.childName,
        name: row.childName,
        birthDate: row.childBirthDate,
        classroomId: body.classroomId || row.preferredClassroomId,
        enrollmentDate: body.startDate || row.desiredStartDate,
        testingOnly: true,
        sourceEnrollmentCaseId: row.id,
      };
      store.children = store.children && typeof store.children === "object" ? store.children : {};
      store.children[childRecord.id] = childRecord;
      childId = childRecord.id;
      summary.childAction = "create";
    } else summary.childAction = "reuse";

    row.householdId = householdId;
    row.contactId = contactId;
    row.childId = childId;
    row.classroomPlacementId = body.classroomId || row.preferredClassroomId;
    row.enrolledAt = model.nowIso();
    row.futureStart = body.futureStart === true || (row.desiredStartDate && row.desiredStartDate > model.nowIso().slice(0, 10));
    model.setCaseStage(store, row, model.PIPELINE_STAGES.ENROLLED, actor.userEmail || context.adminEmail, "Enrollment conversion confirmed");

    summary.householdId = householdId;
    summary.contactId = contactId;
    summary.childId = childId;
    summary.classroomId = row.classroomPlacementId;
    summary.confirmed = true;
    summary.confirmedAt = model.nowIso();
    summary.confirmedByEmail = actor.userEmail || context.adminEmail;
    store.enrollment.conversionSummaries[summary.id] = summary;

    if (capacity) {
      capacity.currentEnrollment = (capacity.currentEnrollment || 0) + (row.futureStart ? 0 : 1);
      capacity.futureStarts = (capacity.futureStarts || 0) + (row.futureStart ? 1 : 0);
      capacity.updatedAt = model.nowIso();
    }

    model.createEnrollmentNotification(store, {
      organizationId: organization.id,
      recipientEmail: row.guardianEmail,
      kind: model.ENROLLMENT_NOTIFICATION_KINDS.ENROLLMENT_ACCEPTED,
      title: "Enrollment accepted (testing)",
      preview: "Welcome — your enrollment was approved in testing.",
      caseId: row.id,
    });
    model.appendAudit(store, {
      organizationId: organization.id,
      caseId: row.id,
      action: "enrollment_converted",
      actorEmail: actor.userEmail || context.adminEmail,
      actorRole: actor.role,
      detail: "Preserved inquiry/tour/application/waitlist/offer/forms history",
      next: { householdId, contactId, childId },
    });
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      case: row,
      summary,
      permanentIds: { householdId, contactId, childId },
      historyPreserved: true,
      autoMerge: false,
      stripeCheckoutUsed: false,
      testingBanner: TESTING_BANNER,
    });
  }

  async function handleReports(request, response, context = {}) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!assertEnrollmentManage(actor, response)) return;
    const cases = listValues(store.enrollment.cases).filter((c) => c.organizationId === organization.id);
    const byStage = {};
    for (const row of cases) byStage[row.stage] = (byStage[row.stage] || 0) + 1;
    const tours = listValues(store.enrollment.tours).filter((t) => t.organizationId === organization.id);
    const offers = listValues(store.enrollment.offers).filter((o) => o.organizationId === organization.id);
    const waitlist = listValues(store.enrollment.waitlist).filter((w) => w.organizationId === organization.id);
    const inquiries = listValues(store.enrollment.inquiries).filter((i) => i.organizationId === organization.id);
    const sources = {};
    for (const inq of inquiries) {
      const key = inq.heardAbout || inq.source || "unknown";
      sources[key] = (sources[key] || 0) + 1;
    }
    jsonResponse(response, 200, {
      ok: true,
      testingBanner: TESTING_BANNER,
      reports: {
        inquiriesByStage: byStage,
        toursScheduled: tours.filter((t) => t.status === model.TOUR_STATUSES.SCHEDULED).length,
        toursCompleted: tours.filter((t) => t.status === model.TOUR_STATUSES.COMPLETED).length,
        applicationsStarted: cases.filter((c) => c.stage === model.PIPELINE_STAGES.APPLICATION_STARTED).length,
        applicationsSubmitted: cases.filter((c) => c.stage === model.PIPELINE_STAGES.APPLICATION_SUBMITTED).length,
        missingApplications: cases.filter((c) => c.stage === model.PIPELINE_STAGES.MISSING_INFORMATION).length,
        waitlistActive: waitlist.filter((w) => w.status === model.WAITLIST_STATUSES.ACTIVE).length,
        offersSent: offers.filter((o) => o.status === model.OFFER_STATUSES.SENT_TESTING).length,
        offersAccepted: offers.filter((o) => o.status === model.OFFER_STATUSES.ACCEPTED).length,
        enrolled: cases.filter((c) => c.stage === model.PIPELINE_STAGES.ENROLLED).length,
        withdrawn: cases.filter((c) => c.stage === model.PIPELINE_STAGES.WITHDRAWN).length,
        futureEnrollment: cases.filter((c) => c.futureStart === true).length,
        inquirySources: sources,
        capacity: listValues(store.enrollment.capacity)
          .filter((c) => c.organizationId === organization.id)
          .map((c) => ({ ...c, guidance: model.capacityGuidance(c, 1) })),
      },
    });
  }

  function matchRoute(method, pathname, url) {
    const path = String(pathname || "");
    if (!path.startsWith(BASE)) return null;

    if (method === "GET" && path === `${BASE}/status`) return (req, res, ctx) => handleStatus(req, res, ctx);
    if (method === "POST" && path === `${BASE}/seed`) return (req, res, ctx) => handleSeed(req, res, ctx);
    if (method === "GET" && path === `${BASE}/pipeline`) return (req, res, ctx) => handlePipeline(req, res, ctx, url);
    if (method === "GET" && path === `${BASE}/capacity`) return (req, res, ctx) => handleCapacity(req, res, ctx);
    if (method === "GET" && path === `${BASE}/reports`) return (req, res, ctx) => handleReports(req, res, ctx);
    if (method === "POST" && path === `${BASE}/inquiries/testing`) return (req, res, ctx) => handleTestingInquiry(req, res, ctx);

    const caseMatch = path.match(/^\/api\/director-center\/enrollment\/cases\/([^/]+)(.*)$/);
    if (caseMatch) {
      const caseId = decodeURIComponent(caseMatch[1]);
      const rest = caseMatch[2] || "";
      if (method === "GET" && rest === "") return (req, res, ctx) => handleCaseGet(req, res, ctx, caseId);
      if (method === "POST" && rest === "/stage") return (req, res, ctx) => handleStageChange(req, res, ctx, caseId);
      if (method === "POST" && rest === "/tour") return (req, res, ctx) => handleTourSchedule(req, res, ctx, caseId);
      if (method === "POST" && rest === "/packet") return (req, res, ctx) => handleCreatePacket(req, res, ctx, caseId);
      if (method === "POST" && rest === "/offer") return (req, res, ctx) => handleCreateOffer(req, res, ctx, caseId);
      if (method === "POST" && rest === "/conversion/preview") return (req, res, ctx) => handleConversionPreview(req, res, ctx, caseId);
      if (method === "POST" && rest === "/conversion/confirm") return (req, res, ctx) => handleConversionConfirm(req, res, ctx, caseId);
    }

    const tourMatch = path.match(/^\/api\/director-center\/enrollment\/tours\/([^/]+)$/);
    if (method === "POST" && tourMatch) return (req, res, ctx) => handleTourUpdate(req, res, ctx, decodeURIComponent(tourMatch[1]));

    const wlMatch = path.match(/^\/api\/director-center\/enrollment\/waitlist\/([^/]+)$/);
    if (method === "POST" && wlMatch) return (req, res, ctx) => handleWaitlistUpdate(req, res, ctx, decodeURIComponent(wlMatch[1]));

    const packetMatch = path.match(/^\/api\/director-center\/enrollment\/packets\/([^/]+)\/items$/);
    if (method === "POST" && packetMatch) return (req, res, ctx) => handlePacketItem(req, res, ctx, decodeURIComponent(packetMatch[1]));

    const offerMatch = path.match(/^\/api\/director-center\/enrollment\/offers\/([^/]+)\/respond$/);
    if (method === "POST" && offerMatch) return (req, res, ctx) => handleOfferRespond(req, res, ctx, decodeURIComponent(offerMatch[1]));

    return null;
  }

  return { matchRoute, BASE };
}

module.exports = {
  createEnrollmentApi,
  BASE,
};
