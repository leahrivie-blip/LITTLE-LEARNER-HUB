/**
 * Phase 16 Staff Experience API — /api/director-center/staff-experience/*
 * Fake/testing only. No payroll/banking/Stripe/email/SMS/push/live AI/production storage.
 */

const foundation = require("../scripts/foundation-data-model.js");
const orgPermissions = require("../scripts/org-permissions.js");
const entitlements = require("../scripts/entitlement-model.js");
const formsFixtures = require("../scripts/forms-center-preview-fixtures.js");
const model = require("../scripts/staff-experience-data-model.js");
const fixtures = require("../scripts/staff-experience-fixtures.js");
const todayHubModel = require("../scripts/today-hub-data-model.js");

const BASE = "/api/director-center/staff-experience";
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

function createStaffExperienceApi({
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
      staffExperience: true,
      preview: true,
      testingBanner: TESTING_BANNER,
    });
  }

  function ensureOrg(store, adminEmail) {
    model.ensureStaffExperienceStore(store);
    const seeded = fixtures.ensurePhase16Preview(store, { adminEmail: normalizeEmail?.(adminEmail) || adminEmail });
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
        status: foundation.STAFF_STATUS.ACTIVE,
      },
      membership: owner || null,
      rolePreview: false,
    };
  }

  function isDirectorRole(role) {
    const r = orgPermissions.normalizeOrgRole(role);
    return r === orgPermissions.ORG_ROLES.DIRECTOR_OWNER || r === orgPermissions.ORG_ROLES.DIRECTOR;
  }

  function assertAccess(store, request, response, adminEmail, { manage = false, selfServiceOk = true } = {}) {
    if (env().liveProduction || !env().allowDirectorCenterAdminPreview) {
      deny(response, 403, "production_preview_rejected", "Staff Experience preview is unavailable in production.");
      return null;
    }
    const { organization, seeded } = ensureOrg(store, adminEmail);
    const { actor, membership, rolePreview } = resolveActor(store, request, organization.id, adminEmail);
    if (manage && !isDirectorRole(actor.role)) {
      deny(response, 403, "director_required", "Only owners/directors can manage staff experience records.");
      return null;
    }
    if (!selfServiceOk && !isDirectorRole(actor.role)) {
      deny(response, 403, "role_denied");
      return null;
    }
    return { organization, seeded, actor, membership, rolePreview };
  }

  function staffLimitSnapshot(store, organizationId) {
    const entitlement = store.organizationEntitlements
      && Object.values(store.organizationEntitlements).find((row) => row.organizationId === organizationId);
    const staffUsed = listValues(store.staffMemberships).filter((row) => (
      row.organizationId === organizationId
      && row.isBillingOwner !== true
      && row.role !== orgPermissions.ORG_ROLES.DIRECTOR_OWNER
      && row.status !== foundation.STAFF_STATUS.DEACTIVATED
      && row.status !== foundation.STAFF_STATUS.INACTIVE
    )).length;
    return entitlements.evaluatePlanLimits({
      basePlanKey: entitlement?.basePlanKey || entitlements.PLAN_KEYS.SMALL_CENTER,
      classroomAddOnQuantity: entitlement?.classroomAddOnQuantity || 0,
      activeClassroomCount: listValues(store.classrooms).filter((c) => c.organizationId === organizationId && c.status !== "archived").length,
      invitedStaffCountExcludingOwner: staffUsed,
      billingInterval: entitlement?.billingInterval || entitlements.BILLING_INTERVALS.MONTHLY,
    });
  }

  function profileForMembership(store, organizationId, membershipId) {
    return listValues(store.staffExperience.profiles).find((p) => p.organizationId === organizationId && p.membershipId === membershipId) || null;
  }

  function overridesFor(store, organizationId, membershipId) {
    const row = listValues(store.assistantPermissionOverrides || {}).find((o) => o.organizationId === organizationId && o.staffMembershipId === membershipId);
    return row?.permissions || {};
  }

  function filterDirectory(store, organizationId, url) {
    const q = safeLower(url?.searchParams?.get("q") || "");
    const status = url?.searchParams?.get("status") || "";
    const role = url?.searchParams?.get("role") || "";
    const classroomId = url?.searchParams?.get("classroomId") || "";
    const trainingStatus = url?.searchParams?.get("trainingStatus") || "";
    const onDuty = url?.searchParams?.get("onDuty") || "";
    let rows = listValues(store.staffExperience.profiles).filter((p) => p.organizationId === organizationId);
    if (status) rows = rows.filter((p) => p.directoryStatus === status);
    if (role) rows = rows.filter((p) => String(p.role).includes(role));
    if (q) {
      rows = rows.filter((p) => safeLower(`${p.displayName} ${p.email} ${p.locationLabel}`).includes(q));
    }
    if (classroomId) {
      const assigned = new Set(
        listValues(store.classroomStaffAssignments || {})
          .filter((a) => a.organizationId === organizationId && a.classroomId === classroomId && !a.endsAt)
          .map((a) => a.staffMembershipId),
      );
      rows = rows.filter((p) => assigned.has(p.membershipId));
    }
    if (onDuty === "1" || onDuty === "true") rows = rows.filter((p) => p.onDuty);
    if (trainingStatus) {
      const memberIds = new Set(
        listValues(store.staffExperience.trainings)
          .filter((t) => t.organizationId === organizationId && t.status === trainingStatus)
          .map((t) => t.membershipId),
      );
      const certIds = new Set(
        listValues(store.staffExperience.certifications)
          .filter((t) => t.organizationId === organizationId && t.status === trainingStatus)
          .map((t) => t.membershipId),
      );
      rows = rows.filter((p) => memberIds.has(p.membershipId) || certIds.has(p.membershipId));
    }
    return rows.map((p) => ({
      ...p,
      // Never expose private notes in directory
      privateNotesExcluded: true,
    }));
  }

  async function handleStatus(request, response, ctx) {
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail);
    if (!gate) return;
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      phase: 16,
      staffExperience: true,
      testingBanner: TESTING_BANNER,
      ratioDisclaimer: model.RATIO_DISCLAIMER,
      noPayroll: true,
      noBanking: true,
      noStripe: true,
      noOutboundEmail: true,
      noOutboundSms: true,
      noPush: true,
      noLiveAi: true,
      noProductionStorage: true,
      role: gate.actor.role,
      rolePreview: gate.rolePreview,
    });
  }

  async function handleSeed(request, response, ctx) {
    if (env().liveProduction || !env().allowDirectorCenterAdminPreview) {
      return deny(response, 403, "production_preview_rejected");
    }
    const store = readStore();
    const body = await readJson(request).catch(() => ({}));
    const seeded = body.reset
      ? fixtures.resetPhase16Preview(store, { adminEmail: ctx.adminEmail })
      : fixtures.ensurePhase16Preview(store, { adminEmail: ctx.adminEmail });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, seeded: true, ...seeded, testingBanner: TESTING_BANNER });
  }

  async function handleDirectory(request, response, ctx, url) {
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail, { manage: true });
    if (!gate) return;
    const staff = filterDirectory(store, gate.organization.id, url);
    const limits = staffLimitSnapshot(store, gate.organization.id);
    const counts = {};
    for (const status of Object.values(model.DIRECTORY_STATUSES)) {
      counts[status] = staff.filter((s) => s.directoryStatus === status).length
        || listValues(store.staffExperience.profiles).filter((p) => p.organizationId === gate.organization.id && p.directoryStatus === status).length;
    }
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      testingBanner: TESTING_BANNER,
      featureMarker: "phase16-staff-experience",
      computerRecommended: true,
      staff,
      counts,
      limits,
      canInviteStaff: entitlements.canInviteStaff(limits).allowed !== false && !limits.staffAtLimit,
    });
  }

  async function handleInvite(request, response, ctx) {
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail, { manage: true });
    if (!gate) return;
    const limits = staffLimitSnapshot(store, gate.organization.id);
    const inviteGate = entitlements.canInviteStaff(limits);
    if (inviteGate && inviteGate.allowed === false) {
      return deny(response, 409, inviteGate.code || "staff_limit", inviteGate.error || "Staff account limit reached.");
    }
    if (limits.staffAtLimit) {
      return deny(response, 409, "staff_limit", "Staff account limit reached for this plan preview.");
    }
    const body = await readJson(request).catch(() => ({}));
    const email = safeLower(body.email || `phase16.invite.${Date.now()}@example.invalid`);
    const member = foundation.createStaffMembershipRecord({
      organizationId: gate.organization.id,
      userEmail: email,
      displayName: body.displayName || "Invited Staff (FAKE)",
      role: body.role || orgPermissions.ORG_ROLES.ASSISTANT_STAFF,
      status: foundation.STAFF_STATUS.INVITATION_PENDING,
    });
    member.preview = true;
    store.staffMemberships[member.id] = member;
    const profile = model.createStaffProfile({
      organizationId: gate.organization.id,
      membershipId: member.id,
      displayName: member.displayName,
      email,
      role: member.role,
      directoryStatus: model.DIRECTORY_STATUSES.INVITED,
    });
    store.staffExperience.profiles[profile.id] = profile;
    store.staffExperience.invitations[model.newId("sxinv")] = {
      id: model.newId("sxinv"),
      organizationId: gate.organization.id,
      membershipId: member.id,
      email,
      templateStored: true,
      externalSendDisabled: true,
      body: body.template || "Invitation template stored — not sent externally.",
      testingOnly: true,
    };
    writeStore(store);
    jsonResponse(response, 201, {
      ok: true,
      membership: member,
      profile,
      externalSendDisabled: true,
      testingBanner: TESTING_BANNER,
    });
  }

  async function handleProfile(request, response, ctx, profileId) {
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail);
    if (!gate) return;
    const profile = store.staffExperience.profiles[profileId];
    if (!profile || profile.organizationId !== gate.organization.id) return deny(response, 404, "not_found");
    const self = gate.actor.id === profile.membershipId || safeLower(gate.actor.userEmail) === safeLower(profile.email);
    const director = isDirectorRole(gate.actor.role);
    if (!director && !self) return deny(response, 403, "profile_denied");

    const membershipId = profile.membershipId;
    const payload = {
      ok: true,
      testingBanner: TESTING_BANNER,
      featureMarker: "phase16-staff-profile",
      profile: {
        ...profile,
        emergencyContactName: director || self ? profile.emergencyContactName : "",
        emergencyContactPhone: director || self ? profile.emergencyContactPhone : "",
        sensitivePersonnelRestricted: true,
      },
      classrooms: listValues(store.classroomStaffAssignments || {})
        .filter((a) => a.organizationId === gate.organization.id && a.staffMembershipId === membershipId && !a.endsAt)
        .map((a) => ({
          classroomId: a.classroomId,
          name: store.classrooms?.[a.classroomId]?.name || "Classroom",
        })),
      schedule: listValues(store.staffExperience.shifts).filter((s) => s.organizationId === gate.organization.id && s.membershipId === membershipId),
      availability: listValues(store.staffExperience.availability).filter((a) => a.organizationId === gate.organization.id && a.membershipId === membershipId),
      timeEntries: listValues(store.staffExperience.timeEntries).filter((t) => t.organizationId === gate.organization.id && t.membershipId === membershipId),
      timeOffRequests: listValues(store.staffExperience.timeOffRequests).filter((t) => t.organizationId === gate.organization.id && t.membershipId === membershipId),
      qualifications: listValues(store.staffExperience.qualifications).filter((q) => q.organizationId === gate.organization.id && q.membershipId === membershipId),
      trainings: listValues(store.staffExperience.trainings).filter((t) => t.organizationId === gate.organization.id && t.membershipId === membershipId),
      certifications: listValues(store.staffExperience.certifications).filter((c) => c.organizationId === gate.organization.id && c.membershipId === membershipId),
      onboarding: listValues(store.staffExperience.onboardingChecklists).find((o) => o.membershipId === membershipId) || null,
      permissionSummary: model.buildPermissionSummary({
        role: profile.role,
        overrides: overridesFor(store, gate.organization.id, membershipId),
        isDirector: orgPermissions.normalizeOrgRole(profile.role) === orgPermissions.ORG_ROLES.DIRECTOR_OWNER
          || orgPermissions.normalizeOrgRole(profile.role) === orgPermissions.ORG_ROLES.DIRECTOR,
      }),
      privateNotes: director
        ? listValues(store.staffExperience.privateNotes).filter((n) => n.membershipId === membershipId)
        : [],
      offboarding: director
        ? listValues(store.staffExperience.offboardingRecords).find((o) => o.membershipId === membershipId) || null
        : null,
      payHidden: true,
      disciplinaryHidden: !director,
    };
    writeStore(store);
    jsonResponse(response, 200, payload);
  }

  async function handleOnboarding(request, response, ctx, checklistId) {
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail, { manage: true });
    if (!gate) return;
    if (request.method === "GET" && !checklistId) {
      const rows = listValues(store.staffExperience.onboardingChecklists).filter((o) => o.organizationId === gate.organization.id);
      writeStore(store);
      return jsonResponse(response, 200, { ok: true, checklists: rows, steps: model.ONBOARDING_STEPS, testingBanner: TESTING_BANNER });
    }
    const row = store.staffExperience.onboardingChecklists[checklistId];
    if (!row || row.organizationId !== gate.organization.id) return deny(response, 404, "not_found");
    if (request.method === "POST") {
      const body = await readJson(request).catch(() => ({}));
      if (body.step && row.steps[body.step]) {
        row.steps[body.step].complete = body.complete !== false;
        row.steps[body.step].completedAt = row.steps[body.step].complete ? model.nowIso() : "";
        row.steps[body.step].note = model.cleanText(body.note || row.steps[body.step].note, 500);
      }
      if (body.directorApproved === true) {
        row.directorApproved = true;
        row.status = "approved";
      }
      row.updatedAt = model.nowIso();
      store.staffExperience.onboardingChecklists[row.id] = row;
      writeStore(store);
      return jsonResponse(response, 200, { ok: true, checklist: row, externalSendDisabled: true, testingBanner: TESTING_BANNER });
    }
    jsonResponse(response, 200, { ok: true, checklist: row, testingBanner: TESTING_BANNER });
  }

  async function handleSchedules(request, response, ctx, scheduleId) {
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail);
    if (!gate) return;
    const director = isDirectorRole(gate.actor.role);

    if (request.method === "GET" && !scheduleId) {
      let schedules = listValues(store.staffExperience.schedules).filter((s) => s.organizationId === gate.organization.id);
      let shifts = listValues(store.staffExperience.shifts).filter((s) => s.organizationId === gate.organization.id);
      if (!director) {
        shifts = shifts.filter((s) => s.membershipId === gate.actor.id);
        const scheduleIds = new Set(shifts.map((s) => s.scheduleId));
        schedules = schedules.filter((s) => scheduleIds.has(s.id) || s.status === model.SCHEDULE_STATUSES.PUBLISHED_TESTING);
      }
      writeStore(store);
      return jsonResponse(response, 200, {
        ok: true,
        testingBanner: TESTING_BANNER,
        featureMarker: "phase16-schedule-manager",
        computerRecommended: true,
        schedules,
        shifts,
        history: director
          ? listValues(store.staffExperience.scheduleHistory).filter((h) => h.organizationId === gate.organization.id).slice(0, 50)
          : [],
        coverageSuggestions: director
          ? listValues(store.staffExperience.coverageSuggestions).filter((c) => c.organizationId === gate.organization.id)
          : [],
        noExternalNotifications: true,
      });
    }

    if (request.method === "POST" && scheduleId === "publish") {
      if (!director) return deny(response, 403, "director_required");
      const body = await readJson(request).catch(() => ({}));
      const schedule = store.staffExperience.schedules[body.scheduleId];
      if (!schedule || schedule.organizationId !== gate.organization.id) return deny(response, 404, "not_found");
      schedule.status = model.SCHEDULE_STATUSES.PUBLISHED_TESTING;
      schedule.publishedAt = model.nowIso();
      schedule.updatedAt = model.nowIso();
      model.appendScheduleHistory(store, schedule, {
        action: "publish_testing",
        actorEmail: gate.actor.userEmail,
        detail: "Published in testing — external notifications disabled",
      });
      writeStore(store);
      return jsonResponse(response, 200, { ok: true, schedule, noExternalNotifications: true, testingBanner: TESTING_BANNER });
    }

    if (request.method === "POST" && scheduleId === "assign-coverage") {
      if (!director) return deny(response, 403, "director_required");
      const body = await readJson(request).catch(() => ({}));
      const shift = store.staffExperience.shifts[body.shiftId];
      const suggestion = store.staffExperience.coverageSuggestions[body.suggestionId];
      if (!shift || shift.organizationId !== gate.organization.id) return deny(response, 404, "not_found");
      if (!body.membershipId && !suggestion) return deny(response, 400, "membership_required");
      const membershipId = body.membershipId || suggestion.suggestedMembershipId;
      shift.membershipId = membershipId;
      shift.substituteMembershipId = membershipId;
      shift.coverageGap = false;
      shift.updatedAt = model.nowIso();
      if (suggestion) {
        suggestion.autoApplied = false;
        suggestion.appliedByEmail = gate.actor.userEmail;
        suggestion.appliedAt = model.nowIso();
      }
      writeStore(store);
      return jsonResponse(response, 200, {
        ok: true,
        shift,
        autoMoved: false,
        note: "Director action required — staff were not automatically moved.",
        testingBanner: TESTING_BANNER,
      });
    }

    return deny(response, 404, "not_found");
  }

  async function handleTimeClock(request, response, ctx) {
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail);
    if (!gate) return;
    const body = await readJson(request).catch(() => ({}));
    const director = isDirectorRole(gate.actor.role);
    const membershipId = director && body.membershipId ? body.membershipId : gate.actor.id;
    if (!director && membershipId !== gate.actor.id) return deny(response, 403, "self_only");

    const profile = profileForMembership(store, gate.organization.id, membershipId);
    if (profile && [model.DIRECTORY_STATUSES.ENDED, model.DIRECTORY_STATUSES.ARCHIVED].includes(profile.directoryStatus)) {
      return deny(response, 403, "access_ended", "Staff access has ended.");
    }

    const action = body.action || "clock_in";
    let type = model.TIME_ENTRY_TYPES.CLOCK_IN;
    if (action === "clock_out") type = model.TIME_ENTRY_TYPES.CLOCK_OUT;
    else if (action === "break_start") type = model.TIME_ENTRY_TYPES.BREAK_START;
    else if (action === "break_end") type = model.TIME_ENTRY_TYPES.BREAK_END;
    else if (action === "location_change") type = model.TIME_ENTRY_TYPES.LOCATION_CHANGE;
    else if (action === "missed_punch") type = model.TIME_ENTRY_TYPES.MISSED_PUNCH;

    const entry = model.createTimeEntry({
      organizationId: gate.organization.id,
      membershipId,
      type,
      at: body.at || model.nowIso(),
      classroomId: body.classroomId || "",
      locationLabel: body.locationLabel || "Primary location",
      note: body.note || "",
      missedPunch: action === "missed_punch",
    });
    store.staffExperience.timeEntries[entry.id] = entry;
    model.appendTimeHistory(store, entry, {
      action,
      actorEmail: gate.actor.userEmail,
      reason: body.reason || "",
    });

    if (profile) {
      profile.onDuty = ![model.TIME_ENTRY_TYPES.CLOCK_OUT].includes(type);
      profile.updatedAt = model.nowIso();
      store.staffExperience.profiles[profile.id] = profile;
    }
    model.syncDutyFromClock(store, gate.organization.id);
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      entry,
      historyPreserved: true,
      payrollProcessed: false,
      testingBanner: TESTING_BANNER,
    });
  }

  async function handleTimeEntries(request, response, ctx, url) {
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail);
    if (!gate) return;
    const director = isDirectorRole(gate.actor.role);
    let rows = listValues(store.staffExperience.timeEntries).filter((t) => t.organizationId === gate.organization.id);
    if (!director) rows = rows.filter((t) => t.membershipId === gate.actor.id);
    const membershipId = url?.searchParams?.get("membershipId");
    if (membershipId && director) rows = rows.filter((t) => t.membershipId === membershipId);
    writeStore(store);
    jsonResponse(response, 200, { ok: true, timeEntries: rows, testingBanner: TESTING_BANNER, noPayroll: true });
  }

  async function handleCorrection(request, response, ctx, correctionId) {
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail);
    if (!gate) return;
    const director = isDirectorRole(gate.actor.role);

    if (request.method === "POST" && !correctionId) {
      const body = await readJson(request).catch(() => ({}));
      const membershipId = director && body.membershipId ? body.membershipId : gate.actor.id;
      if (!director && membershipId !== gate.actor.id) return deny(response, 403, "self_only");
      const row = model.createCorrectionRequest({
        organizationId: gate.organization.id,
        membershipId,
        timeEntryId: body.timeEntryId || "",
        reason: body.reason || "Correction request (FAKE)",
        requestedType: body.requestedType || model.TIME_ENTRY_TYPES.CLOCK_IN,
      });
      store.staffExperience.correctionRequests[row.id] = row;
      writeStore(store);
      return jsonResponse(response, 201, { ok: true, correction: row, testingBanner: TESTING_BANNER });
    }

    if (request.method === "POST" && correctionId) {
      if (!director) return deny(response, 403, "director_required");
      const body = await readJson(request).catch(() => ({}));
      const row = store.staffExperience.correctionRequests[correctionId];
      if (!row || row.organizationId !== gate.organization.id) return deny(response, 404, "not_found");
      if (!body.reason && body.status === "approved") {
        return deny(response, 400, "reason_required", "Director corrections require a reason.");
      }
      row.status = body.status || row.status;
      row.directorReason = model.cleanText(body.reason || body.directorReason, 1000);
      row.updatedAt = model.nowIso();
      if (row.status === "approved" && row.timeEntryId && store.staffExperience.timeEntries[row.timeEntryId]) {
        const entry = store.staffExperience.timeEntries[row.timeEntryId];
        model.applyTimeAction(store, entry, {
          type: row.requestedType || model.TIME_ENTRY_TYPES.CLOCK_IN,
          action: "director_correction",
          reason: row.directorReason,
          correctionPending: false,
          approved: true,
          missedPunch: false,
        }, { email: gate.actor.userEmail });
      }
      writeStore(store);
      return jsonResponse(response, 200, { ok: true, correction: row, historyPreserved: true, testingBanner: TESTING_BANNER });
    }

    const rows = listValues(store.staffExperience.correctionRequests).filter((c) => {
      if (c.organizationId !== gate.organization.id) return false;
      if (!director && c.membershipId !== gate.actor.id) return false;
      return true;
    });
    jsonResponse(response, 200, { ok: true, corrections: rows, testingBanner: TESTING_BANNER });
  }

  async function handleTimeOff(request, response, ctx, requestId) {
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail);
    if (!gate) return;
    const director = isDirectorRole(gate.actor.role);

    if (request.method === "POST" && !requestId) {
      const body = await readJson(request).catch(() => ({}));
      const membershipId = director && body.membershipId ? body.membershipId : gate.actor.id;
      if (!director && membershipId !== gate.actor.id) return deny(response, 403, "self_only");
      const row = model.createTimeOffRequest({
        organizationId: gate.organization.id,
        membershipId,
        startDate: body.startDate,
        endDate: body.endDate,
        staffNote: body.staffNote || body.note || "",
      });
      model.appendTimeOffDecision(row, { action: "submitted", actorEmail: gate.actor.userEmail, note: "Submitted" });
      store.staffExperience.timeOffRequests[row.id] = row;
      writeStore(store);
      return jsonResponse(response, 201, { ok: true, request: row, testingBanner: TESTING_BANNER });
    }

    if (request.method === "POST" && requestId) {
      const body = await readJson(request).catch(() => ({}));
      const row = store.staffExperience.timeOffRequests[requestId];
      if (!row || row.organizationId !== gate.organization.id) return deny(response, 404, "not_found");
      if (body.action === "withdraw") {
        if (!director && row.membershipId !== gate.actor.id) return deny(response, 403, "self_only");
        if (row.status !== model.TIME_OFF_STATUSES.PENDING) return deny(response, 400, "not_pending");
        row.status = model.TIME_OFF_STATUSES.WITHDRAWN;
        model.appendTimeOffDecision(row, { action: "withdrawn", actorEmail: gate.actor.userEmail, note: body.note || "" });
      } else {
        if (!director) return deny(response, 403, "director_required");
        if (body.action === "approve") row.status = model.TIME_OFF_STATUSES.APPROVED;
        else if (body.action === "decline") row.status = model.TIME_OFF_STATUSES.DECLINED;
        else if (body.action === "more_info") row.status = model.TIME_OFF_STATUSES.MORE_INFO;
        if (body.coverageAssignedMembershipId) row.coverageAssignedMembershipId = body.coverageAssignedMembershipId;
        row.directorNote = model.cleanText(body.note || body.directorNote || "", 1000);
        model.appendTimeOffDecision(row, { action: body.action || "decision", actorEmail: gate.actor.userEmail, note: row.directorNote });
      }
      store.staffExperience.timeOffRequests[row.id] = row;
      writeStore(store);
      return jsonResponse(response, 200, { ok: true, request: row, decisionHistoryPreserved: true, testingBanner: TESTING_BANNER });
    }

    let rows = listValues(store.staffExperience.timeOffRequests).filter((r) => r.organizationId === gate.organization.id);
    if (!director) rows = rows.filter((r) => r.membershipId === gate.actor.id);
    jsonResponse(response, 200, { ok: true, requests: rows, testingBanner: TESTING_BANNER });
  }

  async function handleCoverage(request, response, ctx) {
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail, { manage: true });
    if (!gate) return;
    todayHubModel.ensureTodayHubStore(store);
    model.syncDutyFromClock(store, gate.organization.id);
    const clocked = model.clockedInMembershipIds(store, gate.organization.id);
    const scheduled = listValues(store.staffExperience.shifts).filter((s) => (
      s.organizationId === gate.organization.id && s.date === model.todayDate() && s.membershipId
    ));
    const gaps = listValues(store.staffExperience.shifts).filter((s) => s.organizationId === gate.organization.id && s.coverageGap);
    const suggestions = listValues(store.staffExperience.coverageSuggestions).filter((c) => c.organizationId === gate.organization.id);
    const classrooms = listValues(store.classrooms).filter((c) => c.organizationId === gate.organization.id).map((room) => {
      const staffOnDuty = listValues(store.todayHub.staffDuty).filter((d) => d.classroomId === room.id && d.onDuty).length;
      const config = listValues(store.todayHub.ratioConfigs || {}).find((c) => c.classroomId === room.id) || null;
      const present = listValues(store.todayHub.attendance || {}).filter((a) => (
        a.classroomId === room.id
        && a.date === model.todayDate()
        && [todayHubModel.ATTENDANCE_STATUSES.CHECKED_IN, todayHubModel.ATTENDANCE_STATUSES.LATE, todayHubModel.ATTENDANCE_STATUSES.TEMPORARILY_OUT].includes(a.status)
      )).length;
      const ratio = todayHubModel.evaluateRatio({ childrenPresent: present, qualifiedStaff: staffOnDuty, config });
      return {
        classroomId: room.id,
        name: room.name,
        scheduledStaff: scheduled.filter((s) => s.classroomId === room.id).length,
        clockedInStaff: staffOnDuty,
        ratio,
      };
    });
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      testingBanner: TESTING_BANNER,
      ratioDisclaimer: model.RATIO_DISCLAIMER,
      clockedInMembershipIds: clocked,
      scheduledShifts: scheduled,
      coverageGaps: gaps,
      suggestions,
      classrooms,
      autoMoveDisabled: true,
      noLegalComplianceClaim: true,
    });
  }

  async function handleTraining(request, response, ctx) {
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail);
    if (!gate) return;
    const director = isDirectorRole(gate.actor.role);
    let trainings = listValues(store.staffExperience.trainings).filter((t) => t.organizationId === gate.organization.id);
    let certifications = listValues(store.staffExperience.certifications).filter((c) => c.organizationId === gate.organization.id);
    let qualifications = listValues(store.staffExperience.qualifications).filter((q) => q.organizationId === gate.organization.id);
    if (!director) {
      trainings = trainings.filter((t) => t.membershipId === gate.actor.id);
      certifications = certifications.filter((c) => c.membershipId === gate.actor.id);
      qualifications = qualifications.filter((q) => q.membershipId === gate.actor.id);
    }
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      testingBanner: TESTING_BANNER,
      categories: model.TRAINING_CATEGORIES,
      trainings,
      certifications,
      qualifications,
      computerRecommended: true,
    });
  }

  async function handlePrivateNotes(request, response, ctx) {
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail, { manage: true });
    if (!gate) return;
    if (request.method === "POST") {
      const body = await readJson(request).catch(() => ({}));
      const note = model.createPrivateNote({
        organizationId: gate.organization.id,
        membershipId: body.membershipId,
        type: body.type,
        title: body.title,
        body: body.body,
        followUpDate: body.followUpDate,
        createdByEmail: gate.actor.userEmail,
      });
      store.staffExperience.privateNotes[note.id] = note;
      writeStore(store);
      return jsonResponse(response, 201, { ok: true, note, directorOwnerOnly: true, testingBanner: TESTING_BANNER });
    }
    const notes = listValues(store.staffExperience.privateNotes).filter((n) => n.organizationId === gate.organization.id);
    jsonResponse(response, 200, {
      ok: true,
      notes,
      excludedFromGeneralSearch: true,
      excludedFromDirectory: true,
      excludedFromFamilyHub: true,
      excludedFromClassroomViews: true,
      testingBanner: TESTING_BANNER,
    });
  }

  async function handleOffboard(request, response, ctx) {
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail, { manage: true });
    if (!gate) return;
    const body = await readJson(request).catch(() => ({}));
    const membership = store.staffMemberships?.[body.membershipId];
    if (!membership || membership.organizationId !== gate.organization.id) return deny(response, 404, "not_found");
    membership.status = foundation.STAFF_STATUS.DEACTIVATED;
    membership.deactivatedAt = model.nowIso();
    membership.deactivationReason = body.reasonCategory || "ended";
    store.staffMemberships[membership.id] = membership;

    const profile = profileForMembership(store, gate.organization.id, membership.id);
    if (profile) {
      profile.directoryStatus = model.DIRECTORY_STATUSES.ENDED;
      profile.endDate = body.endDate || model.todayDate();
      profile.onDuty = false;
      profile.updatedAt = model.nowIso();
      store.staffExperience.profiles[profile.id] = profile;
    }

    // End classroom assignments historically — do not delete
    for (const assignment of listValues(store.classroomStaffAssignments || {}).filter((a) => a.staffMembershipId === membership.id && !a.endsAt)) {
      assignment.endsAt = model.nowIso();
      assignment.status = foundation.ASSIGNMENT_STATUS.HISTORICAL;
      store.classroomStaffAssignments[assignment.id] = assignment;
    }

    const off = model.createOffboardingRecord({
      organizationId: gate.organization.id,
      membershipId: membership.id,
      endDate: body.endDate || model.todayDate(),
      reasonCategory: body.reasonCategory || "resignation",
      finalShiftDate: body.finalShiftDate || "",
      returnPropertyChecklist: body.returnPropertyChecklist || ["keys"],
      openTasksCleared: true,
      classroomReassigned: true,
      conversationReassigned: true,
      accessEndedAt: model.nowIso(),
    });
    store.staffExperience.offboardingRecords[off.id] = off;
    model.syncDutyFromClock(store, gate.organization.id);
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      offboarding: off,
      accessRevoked: true,
      historyPreserved: true,
      childRecordsPreserved: true,
      testingBanner: TESTING_BANNER,
    });
  }

  async function handleSelfService(request, response, ctx) {
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail);
    if (!gate) return;
    const membershipId = gate.actor.id;
    const profile = profileForMembership(store, gate.organization.id, membershipId)
      || model.createStaffProfile({
        organizationId: gate.organization.id,
        membershipId,
        displayName: gate.actor.displayName || gate.actor.userEmail,
        email: gate.actor.userEmail,
        role: gate.actor.role,
      });
    const entries = listValues(store.staffExperience.timeEntries)
      .filter((t) => t.membershipId === membershipId)
      .sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const latest = entries[0] || null;
    const clockStatus = latest
      ? (latest.type === model.TIME_ENTRY_TYPES.CLOCK_OUT ? "clocked_out"
        : latest.type === model.TIME_ENTRY_TYPES.BREAK_START ? "on_break"
          : "clocked_in")
      : "clocked_out";
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      testingBanner: TESTING_BANNER,
      featureMarker: "phase16-staff-self-service",
      view: "self_service",
      profile: {
        id: profile.id,
        displayName: profile.displayName,
        email: profile.email,
        role: profile.role,
        directoryStatus: profile.directoryStatus,
      },
      today: {
        date: model.todayDate(),
        clockStatus,
        latestEntry: latest,
      },
      mySchedule: listValues(store.staffExperience.shifts).filter((s) => s.membershipId === membershipId),
      timeEntries: entries.slice(0, 20),
      correctionRequests: listValues(store.staffExperience.correctionRequests).filter((c) => c.membershipId === membershipId),
      timeOffRequests: listValues(store.staffExperience.timeOffRequests).filter((t) => t.membershipId === membershipId),
      trainings: listValues(store.staffExperience.trainings).filter((t) => t.membershipId === membershipId),
      certifications: listValues(store.staffExperience.certifications).filter((c) => c.membershipId === membershipId),
      permissionSummary: model.buildPermissionSummary({
        role: gate.actor.role,
        overrides: overridesFor(store, gate.organization.id, membershipId),
        isDirector: isDirectorRole(gate.actor.role),
      }),
      privateNotesHidden: true,
      payHidden: true,
      otherStaffPersonnelHidden: true,
    });
  }

  async function handleReports(request, response, ctx) {
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail, { manage: true });
    if (!gate) return;
    const orgId = gate.organization.id;
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      testingBanner: TESTING_BANNER,
      computerRecommended: true,
      noPayroll: true,
      noTaxReporting: true,
      reports: {
        staffRoster: listValues(store.staffExperience.profiles).filter((p) => p.organizationId === orgId).length,
        schedule: listValues(store.staffExperience.schedules).filter((s) => s.organizationId === orgId).length,
        coverageGaps: listValues(store.staffExperience.shifts).filter((s) => s.organizationId === orgId && s.coverageGap).length,
        timeEntries: listValues(store.staffExperience.timeEntries).filter((t) => t.organizationId === orgId).length,
        missedPunches: listValues(store.staffExperience.timeEntries).filter((t) => t.organizationId === orgId && t.missedPunch).length,
        timeOffRequests: listValues(store.staffExperience.timeOffRequests).filter((t) => t.organizationId === orgId).length,
        trainingHours: listValues(store.staffExperience.trainings).filter((t) => t.organizationId === orgId).reduce((sum, t) => sum + (t.hours || 0), 0),
        expiringCertifications: listValues(store.staffExperience.certifications).filter((c) => c.organizationId === orgId && c.status === model.TRAINING_STATUSES.EXPIRING_SOON).length,
        onboardingInProgress: listValues(store.staffExperience.onboardingChecklists).filter((o) => o.organizationId === orgId && o.status !== "approved").length,
        classroomAssignments: listValues(store.classroomStaffAssignments || {}).filter((a) => a.organizationId === orgId && !a.endsAt).length,
        activeStaff: listValues(store.staffExperience.profiles).filter((p) => p.organizationId === orgId && p.directoryStatus === model.DIRECTORY_STATUSES.ACTIVE).length,
        inactiveStaff: listValues(store.staffExperience.profiles).filter((p) => p.organizationId === orgId && [model.DIRECTORY_STATUSES.INACTIVE, model.DIRECTORY_STATUSES.ENDED, model.DIRECTORY_STATUSES.ARCHIVED].includes(p.directoryStatus)).length,
      },
    });
  }

  function matchRoute(method, pathname, url) {
    const path = String(pathname || "");
    if (!path.startsWith(BASE)) return null;
    if (method === "GET" && path === `${BASE}/status`) return (req, res, ctx) => handleStatus(req, res, ctx);
    if (method === "POST" && path === `${BASE}/seed`) return (req, res, ctx) => handleSeed(req, res, ctx);
    if (method === "GET" && path === `${BASE}/directory`) return (req, res, ctx) => handleDirectory(req, res, ctx, url);
    if (method === "POST" && path === `${BASE}/invite`) return (req, res, ctx) => handleInvite(req, res, ctx);
    if (method === "GET" && path === `${BASE}/self-service`) return (req, res, ctx) => handleSelfService(req, res, ctx);
    if (method === "GET" && path === `${BASE}/schedules`) return (req, res, ctx) => handleSchedules(req, res, ctx, null);
    if (method === "POST" && path === `${BASE}/schedules/publish`) return (req, res, ctx) => handleSchedules(req, res, ctx, "publish");
    if (method === "POST" && path === `${BASE}/schedules/assign-coverage`) return (req, res, ctx) => handleSchedules(req, res, ctx, "assign-coverage");
    if (method === "POST" && path === `${BASE}/time-clock`) return (req, res, ctx) => handleTimeClock(req, res, ctx);
    if (method === "GET" && path === `${BASE}/time-entries`) return (req, res, ctx) => handleTimeEntries(req, res, ctx, url);
    if (method === "GET" && path === `${BASE}/corrections`) return (req, res, ctx) => handleCorrection(req, res, ctx, null);
    if (method === "POST" && path === `${BASE}/corrections`) return (req, res, ctx) => handleCorrection(req, res, ctx, null);
    if (method === "GET" && path === `${BASE}/time-off`) return (req, res, ctx) => handleTimeOff(req, res, ctx, null);
    if (method === "POST" && path === `${BASE}/time-off`) return (req, res, ctx) => handleTimeOff(req, res, ctx, null);
    if (method === "GET" && path === `${BASE}/coverage`) return (req, res, ctx) => handleCoverage(req, res, ctx);
    if (method === "GET" && path === `${BASE}/training`) return (req, res, ctx) => handleTraining(req, res, ctx);
    if (method === "GET" && path === `${BASE}/private-notes`) return (req, res, ctx) => handlePrivateNotes(req, res, ctx);
    if (method === "POST" && path === `${BASE}/private-notes`) return (req, res, ctx) => handlePrivateNotes(req, res, ctx);
    if (method === "POST" && path === `${BASE}/offboard`) return (req, res, ctx) => handleOffboard(req, res, ctx);
    if (method === "GET" && path === `${BASE}/reports`) return (req, res, ctx) => handleReports(req, res, ctx);
    if (method === "GET" && path === `${BASE}/onboarding`) return (req, res, ctx) => handleOnboarding(req, res, ctx, null);

    const profile = path.match(/^\/api\/director-center\/staff-experience\/profiles\/([^/]+)$/);
    if (profile && method === "GET") {
      return (req, res, ctx) => handleProfile(req, res, ctx, decodeURIComponent(profile[1]));
    }
    const onboarding = path.match(/^\/api\/director-center\/staff-experience\/onboarding\/([^/]+)$/);
    if (onboarding) {
      return (req, res, ctx) => handleOnboarding(req, res, ctx, decodeURIComponent(onboarding[1]));
    }
    const correction = path.match(/^\/api\/director-center\/staff-experience\/corrections\/([^/]+)$/);
    if (correction && method === "POST") {
      return (req, res, ctx) => handleCorrection(req, res, ctx, decodeURIComponent(correction[1]));
    }
    const timeOff = path.match(/^\/api\/director-center\/staff-experience\/time-off\/([^/]+)$/);
    if (timeOff && method === "POST") {
      return (req, res, ctx) => handleTimeOff(req, res, ctx, decodeURIComponent(timeOff[1]));
    }
    return null;
  }

  return { matchRoute, BASE };
}

module.exports = {
  createStaffExperienceApi,
  BASE,
};
