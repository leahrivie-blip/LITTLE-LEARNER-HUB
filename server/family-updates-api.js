/**
 * Phase 10 provider API — family updates, Daily Report sharing, media, consent.
 * Mounted at /api/director-center/family-updates/*
 * Admin Bearer required (via director-center gate). Role-preview supported.
 * Fake data only. No public media URLs. No email/SMS/push/Stripe/live AI.
 */

const foundation = require("../scripts/foundation-data-model.js");
const orgPermissions = require("../scripts/org-permissions.js");
const entitlements = require("../scripts/entitlement-model.js");
const formsFixtures = require("../scripts/forms-center-preview-fixtures.js");
const phase8Fixtures = require("../scripts/family-foundation-fixtures.js");
const model = require("../scripts/family-updates-data-model.js");
const fixtures = require("../scripts/family-updates-fixtures.js");
const expansionFlags = require("../scripts/expansion-feature-flags.js");

const BASE = "/api/director-center/family-updates";
const PRODUCTION_HOST = "littlelearnershubbyleah.com";
const TESTING_BANNER = "Testing Account — Fake Data Only.";

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
  const value = String(siteUrl || "").toLowerCase();
  return Boolean(value) && value.indexOf(PRODUCTION_HOST) !== -1;
}

function resolveEnv(expansionEnvironment) {
  let env = null;
  if (typeof expansionEnvironment === "function") {
    try { env = expansionEnvironment(); } catch { env = null; }
  }
  if (!env || typeof env !== "object") {
    const siteUrl = String(process.env.SITE_URL || "");
    const liveProduction = productionSiteFromUrl(siteUrl);
    env = {
      liveProduction,
      allowDirectorCenterAdminPreview: !liveProduction && truthy(process.env.ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW),
      allowFamilyHubTestingPreview: !liveProduction && truthy(process.env.ALLOW_FAMILY_HUB_TESTING_PREVIEW),
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

function actorFromMembership(member) {
  if (!member) return null;
  return {
    email: member.userEmail || "",
    role: member.role || "",
    membershipId: member.id,
    userId: member.userId || "",
    displayName: member.displayName || "",
  };
}

function createFamilyUpdatesApi({
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

  function audit(store, organizationId, action, message, entityType, entityId, actor, childId = "") {
    const row = model.createAccessAuditRecord({
      organizationId,
      actorEmail: actor?.email || "",
      actorRole: actor?.role || "",
      action,
      entityType,
      entityId,
      childId,
      message,
    });
    store.familyUpdates.accessAudit[row.id] = row;
    return row;
  }

  function ensureOrg(store, adminEmail) {
    model.ensureFamilyUpdatesStore(store);
    const seeded = fixtures.ensurePhase10Preview(store, { adminEmail: normalizeEmail?.(adminEmail) || adminEmail });
    const organization = store.organizations[seeded.organizationId]
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
        return { actor: actorFromMembership(member), membership: member, rolePreview: true };
      }
    }
    return { actor: actorFromMembership(owner) || { email: adminEmail, role: orgPermissions.ORG_ROLES.DIRECTOR_OWNER }, membership: owner, rolePreview: false };
  }

  function isCurriculumOnly(store, organizationId) {
    const ent = listValues(store.organizationEntitlements).find((row) => row.organizationId === organizationId);
    const plan = ent?.basePlanKey || ent?.planKey || "";
    return plan === entitlements.PLAN_KEYS.CURRICULUM_ONLY || plan === "curriculum_only";
  }

  function canViewChild(store, actor, organizationId, childId) {
    return orgPermissions.evaluateAccess({
      store,
      actor,
      organizationId,
      action: orgPermissions.ACTIONS.CHILD_VIEW,
      childId,
    });
  }

  function isDirectorRole(role) {
    return role === orgPermissions.ORG_ROLES.DIRECTOR_OWNER || role === orgPermissions.ORG_ROLES.DIRECTOR;
  }

  function deny(response, status, code, error) {
    jsonResponse(response, status, { error: error || "Access denied.", code, familyUpdates: true, preview: true });
  }

  async function handleStatus(request, response, context = {}) {
    if (env().liveProduction) {
      return deny(response, 403, "production_locked", "Family updates testing is not available on production.");
    }
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    writeStore(store);
    const cfg = model.getSharingConfig(store, organization.id);
    jsonResponse(response, 200, {
      ok: true,
      phase: 10,
      preview: true,
      label: TESTING_BANNER,
      organizationId: organization.id,
      sharingConfig: cfg,
      noPublicMediaUrls: true,
      noOutboundNotifications: true,
      counts: {
        updates: listValues(store.familyUpdates.updates).filter((r) => r.organizationId === organization.id).length,
        media: listValues(store.familyUpdates.media).filter((r) => r.organizationId === organization.id).length,
        consents: listValues(store.familyUpdates.consents).filter((r) => r.organizationId === organization.id).length,
      },
    });
  }

  async function handleSeed(request, response, context = {}) {
    if (env().liveProduction) return deny(response, 403, "production_locked", "Not available on production.");
    const body = await readJson(request).catch(() => ({}));
    const store = readStore();
    model.ensureFamilyUpdatesStore(store);
    if (body.reset === true) fixtures.resetPhase10Preview(store, { organizationId: body.organizationId || "" });
    const seeded = fixtures.ensurePhase10Preview(store, { adminEmail: context.adminEmail, organizationId: body.organizationId || "" });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, seeded, label: TESTING_BANNER });
  }

  async function handleGetConfig(request, response, context = {}) {
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!isDirectorRole(actor.role)) return deny(response, 403, "director_required", "Only directors can configure sharing.");
    jsonResponse(response, 200, { ok: true, sharingConfig: model.getSharingConfig(store, organization.id) });
  }

  async function handlePatchConfig(request, response, context = {}) {
    const body = await readJson(request);
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!isDirectorRole(actor.role)) return deny(response, 403, "director_required");
    if (isCurriculumOnly(store, organization.id)) return deny(response, 403, "curriculum_only_denied");
    const cfg = model.getSharingConfig(store, organization.id);
    if (body.teachersCanShareDirectly !== undefined) cfg.teachersCanShareDirectly = body.teachersCanShareDirectly === true;
    if (body.requireDirectorApproval !== undefined) cfg.requireDirectorApproval = body.requireDirectorApproval !== false;
    cfg.updatedAt = model.nowIso();
    store.familyUpdates.sharingConfig[organization.id] = cfg;
    audit(store, organization.id, "sharing_config_updated", "Sharing configuration updated", "sharing_config", cfg.id, actor);
    writeStore(store);
    jsonResponse(response, 200, { ok: true, sharingConfig: cfg });
  }

  async function handleListUpdates(request, response, context = {}, url) {
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (isCurriculumOnly(store, organization.id)) return deny(response, 403, "curriculum_only_denied");
    const status = String(url?.searchParams?.get("status") || "").trim();
    let rows = listValues(store.familyUpdates.updates).filter((row) => row.organizationId === organization.id);
    if (status) rows = rows.filter((row) => row.status === status);
    if (!isDirectorRole(actor.role)) {
      rows = rows.filter((row) => {
        const kids = row.childIds || [];
        if (!kids.length && row.classroomId) {
          return orgPermissions.evaluateAccess({
            store, actor, organizationId: organization.id, action: orgPermissions.ACTIONS.CLASSROOM_VIEW, classroomId: row.classroomId,
          }).allowed;
        }
        return kids.some((childId) => canViewChild(store, actor, organization.id, childId).allowed);
      });
    }
    rows.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    jsonResponse(response, 200, { ok: true, updates: rows, label: TESTING_BANNER });
  }

  async function handleCreateUpdate(request, response, context = {}) {
    const body = await readJson(request);
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor, membership } = resolveActor(store, request, organization.id, context.adminEmail);
    if (isCurriculumOnly(store, organization.id)) return deny(response, 403, "curriculum_only_denied");
    const childIds = Array.isArray(body.childIds) ? body.childIds : (body.childId ? [body.childId] : []);
    for (const childId of childIds) {
      const decision = canViewChild(store, actor, organization.id, childId);
      if (!decision.allowed) return deny(response, 403, decision.reason || "child_not_in_scope");
    }
    const action = orgPermissions.ACTIONS.CHILD_CREATE_DAILY_LOG;
    if (childIds[0]) {
      const decision = orgPermissions.evaluateAccess({
        store, actor, organizationId: organization.id, action, childId: childIds[0],
      });
      if (!decision.allowed && !isDirectorRole(actor.role)) {
        return deny(response, 403, decision.reason || "access_denied");
      }
    }
    const update = model.createFamilyUpdateRecord({
      organizationId: organization.id,
      scope: body.scope || (childIds.length > 1 ? model.UPDATE_SCOPES.SELECTED_CHILDREN : model.UPDATE_SCOPES.INDIVIDUAL),
      status: body.submitForReview ? model.UPDATE_STATUSES.SUBMITTED_FOR_REVIEW : model.UPDATE_STATUSES.DRAFT,
      title: body.title,
      message: body.message,
      occurredAt: body.occurredAt,
      classroomId: body.classroomId || "",
      childIds,
      activities: body.activities,
      meals: body.meals,
      bottles: body.bottles,
      snacks: body.snacks,
      nap: body.nap,
      diaperOrPotty: body.diaperOrPotty,
      mood: body.mood,
      suppliesNeeded: body.suppliesNeeded,
      reminder: body.reminder,
      mediaIds: body.mediaIds,
      linkedDailyLogId: body.linkedDailyLogId,
      linkedObservationId: body.linkedObservationId,
      linkedGoalId: body.linkedGoalId,
      internalNote: body.internalNote,
      createdByMembershipId: membership?.id || "",
      createdByEmail: actor.email,
    });
    store.familyUpdates.updates[update.id] = update;
    audit(store, organization.id, "update_created", `Update created: ${update.title}`, "family_update", update.id, actor, childIds[0] || "");
    writeStore(store);
    jsonResponse(response, 200, { ok: true, update });
  }

  async function handleTransitionUpdate(request, response, context = {}, updateId, actionName) {
    const body = await readJson(request).catch(() => ({}));
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor, membership } = resolveActor(store, request, organization.id, context.adminEmail);
    const update = store.familyUpdates.updates[updateId];
    if (!update || update.organizationId !== organization.id) return deny(response, 404, "not_found");
    if (isCurriculumOnly(store, organization.id)) return deny(response, 403, "curriculum_only_denied");
    const cfg = model.getSharingConfig(store, organization.id);

    if (actionName === "submit") {
      if (![model.UPDATE_STATUSES.DRAFT, model.UPDATE_STATUSES.CORRECTED].includes(update.status)) {
        return deny(response, 400, "invalid_status");
      }
      update.status = model.UPDATE_STATUSES.SUBMITTED_FOR_REVIEW;
      model.appendHistory(update, { action: "submitted_for_review", by: actor.email });
    } else if (actionName === "approve") {
      if (!isDirectorRole(actor.role)) return deny(response, 403, "director_required");
      update.status = model.UPDATE_STATUSES.APPROVED;
      update.reviewerMembershipId = membership?.id || "";
      update.approvedAt = model.nowIso();
      model.appendHistory(update, { action: "approved", by: actor.email });
    } else if (actionName === "share") {
      const canDirect = isDirectorRole(actor.role) || (cfg.teachersCanShareDirectly && !cfg.requireDirectorApproval);
      if (!canDirect && update.status !== model.UPDATE_STATUSES.APPROVED && !isDirectorRole(actor.role)) {
        return deny(response, 403, "director_approval_required");
      }
      if (!isDirectorRole(actor.role) && !cfg.teachersCanShareDirectly) {
        return deny(response, 403, "director_approval_required");
      }
      update.status = model.UPDATE_STATUSES.SHARED;
      update.sharedAt = model.nowIso();
      if (!update.approvedAt) update.approvedAt = update.sharedAt;
      model.appendHistory(update, { action: "shared", by: actor.email });
    } else if (actionName === "correct") {
      // Never silently change a shared update — create correction marker + preserve history
      if (update.status === model.UPDATE_STATUSES.SHARED || update.status === model.UPDATE_STATUSES.CORRECTED) {
        const corrected = model.createFamilyUpdateRecord({
          ...update,
          id: "",
          status: model.UPDATE_STATUSES.CORRECTED,
          title: body.title || update.title,
          message: body.message || update.message,
          internalNote: body.internalNote !== undefined ? body.internalNote : update.internalNote,
          correctionOfId: update.id,
          sharedAt: model.nowIso(),
          approvedAt: model.nowIso(),
          createdByEmail: actor.email,
          history: [{ at: model.nowIso(), action: "correction_created", by: actor.email, of: update.id }],
        });
        store.familyUpdates.updates[corrected.id] = corrected;
        model.appendHistory(update, { action: "superseded_by_correction", by: actor.email, correctionId: corrected.id });
        audit(store, organization.id, "update_corrected", "Shared update corrected with history", "family_update", corrected.id, actor);
        writeStore(store);
        return jsonResponse(response, 200, { ok: true, update: corrected, previous: update });
      }
      return deny(response, 400, "not_shared");
    } else if (actionName === "withdraw") {
      if (!isDirectorRole(actor.role)) return deny(response, 403, "director_required");
      update.status = model.UPDATE_STATUSES.WITHDRAWN;
      update.withdrawnAt = model.nowIso();
      model.appendHistory(update, { action: "withdrawn", by: actor.email });
    } else if (actionName === "archive") {
      update.status = model.UPDATE_STATUSES.ARCHIVED;
      model.appendHistory(update, { action: "archived", by: actor.email });
    } else {
      return deny(response, 400, "unknown_action");
    }
    store.familyUpdates.updates[update.id] = update;
    audit(store, organization.id, `update_${actionName}`, `Update ${actionName}`, "family_update", update.id, actor);
    writeStore(store);
    jsonResponse(response, 200, { ok: true, update });
  }

  async function handleShareDailyReport(request, response, context = {}) {
    const body = await readJson(request);
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor, membership } = resolveActor(store, request, organization.id, context.adminEmail);
    const log = store.previewDailyLogs?.[body.dailyLogId];
    if (!log || log.organizationId !== organization.id) return deny(response, 404, "daily_log_not_found");
    const decision = canViewChild(store, actor, organization.id, log.childId);
    if (!decision.allowed) return deny(response, 403, decision.reason || "access_denied");
    const cfg = model.getSharingConfig(store, organization.id);
    let visibility = body.visibility || model.VISIBILITY.SUBMITTED_FOR_REVIEW;
    if (visibility === model.VISIBILITY.FAMILY_VISIBLE) {
      if (!isDirectorRole(actor.role) && (!cfg.teachersCanShareDirectly || cfg.requireDirectorApproval)) {
        visibility = model.VISIBILITY.SUBMITTED_FOR_REVIEW;
      }
    }
    let share = listValues(store.familyUpdates.dailyReportShares).find((row) => row.dailyLogId === log.id);
    if (!share) {
      share = model.createDailyReportShareRecord({
        organizationId: organization.id,
        dailyLogId: log.id,
        childId: log.childId,
        visibility,
        sharedAt: visibility === model.VISIBILITY.FAMILY_VISIBLE ? model.nowIso() : "",
        reviewerMembershipId: membership?.id || "",
      });
    } else {
      share.visibility = visibility;
      if (visibility === model.VISIBILITY.FAMILY_VISIBLE) share.sharedAt = model.nowIso();
      if (visibility === model.VISIBILITY.WITHDRAWN) share.withdrawnAt = model.nowIso();
      model.appendHistory(share, { action: `visibility_${visibility}`, by: actor.email });
    }
    store.familyUpdates.dailyReportShares[share.id] = share;
    audit(store, organization.id, "daily_report_share", `Daily report visibility ${visibility}`, "daily_report_share", share.id, actor, log.childId);
    writeStore(store);
    jsonResponse(response, 200, { ok: true, share, dailyLogId: log.id });
  }

  async function handleShareObservation(request, response, context = {}) {
    const body = await readJson(request);
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    const obs = store.previewObservations?.[body.observationId];
    if (!obs || obs.organizationId !== organization.id) return deny(response, 404, "observation_not_found");
    if (!canViewChild(store, actor, organization.id, obs.childId).allowed) return deny(response, 403, "access_denied");
    const cfg = model.getSharingConfig(store, organization.id);
    let visibility = body.visibility || model.VISIBILITY.SUBMITTED_FOR_REVIEW;
    if (visibility === model.VISIBILITY.FAMILY_VISIBLE && !isDirectorRole(actor.role) && (!cfg.teachersCanShareDirectly || cfg.requireDirectorApproval)) {
      visibility = model.VISIBILITY.SUBMITTED_FOR_REVIEW;
    }
    let share = listValues(store.familyUpdates.observationShares).find((row) => row.observationId === obs.id);
    if (!share) {
      share = model.createObservationShareRecord({
        organizationId: organization.id, observationId: obs.id, childId: obs.childId, visibility,
        sharedAt: visibility === model.VISIBILITY.FAMILY_VISIBLE ? model.nowIso() : "",
      });
    } else {
      share.visibility = visibility;
      if (visibility === model.VISIBILITY.FAMILY_VISIBLE) share.sharedAt = model.nowIso();
      if (visibility === model.VISIBILITY.WITHDRAWN) share.withdrawnAt = model.nowIso();
      model.appendHistory(share, { action: `visibility_${visibility}`, by: actor.email });
    }
    if (visibility === model.VISIBILITY.FAMILY_VISIBLE) {
      obs.familyShareEnabled = true;
      obs.familyShareNote = "Shared with family via Phase 10 controls.";
      obs.sharingStatus = "shared_with_family";
    } else if (visibility === model.VISIBILITY.WITHDRAWN || visibility === model.VISIBILITY.PRIVATE_INTERNAL) {
      obs.familyShareEnabled = false;
      obs.familyShareNote = "Family visibility withdrawn or private.";
    }
    store.previewObservations[obs.id] = obs;
    store.familyUpdates.observationShares[share.id] = share;
    writeStore(store);
    jsonResponse(response, 200, { ok: true, share, observation: { id: obs.id, familyShareEnabled: obs.familyShareEnabled } });
  }

  async function handleShareGoal(request, response, context = {}) {
    const body = await readJson(request);
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    const goal = store.previewGoals?.[body.goalId];
    if (!goal || goal.organizationId !== organization.id) return deny(response, 404, "goal_not_found");
    if (!canViewChild(store, actor, organization.id, goal.childId).allowed) return deny(response, 403, "access_denied");
    const cfg = model.getSharingConfig(store, organization.id);
    let visibility = body.visibility || model.VISIBILITY.SUBMITTED_FOR_REVIEW;
    if (visibility === model.VISIBILITY.FAMILY_VISIBLE && !isDirectorRole(actor.role) && (!cfg.teachersCanShareDirectly || cfg.requireDirectorApproval)) {
      visibility = model.VISIBILITY.SUBMITTED_FOR_REVIEW;
    }
    let share = listValues(store.familyUpdates.goalShares).find((row) => row.goalId === goal.id);
    if (!share) {
      share = model.createGoalShareRecord({
        organizationId: organization.id, goalId: goal.id, childId: goal.childId, visibility,
        sharedAt: visibility === model.VISIBILITY.FAMILY_VISIBLE ? model.nowIso() : "",
      });
    } else {
      share.visibility = visibility;
      if (visibility === model.VISIBILITY.FAMILY_VISIBLE) share.sharedAt = model.nowIso();
      if (visibility === model.VISIBILITY.WITHDRAWN) share.withdrawnAt = model.nowIso();
      model.appendHistory(share, { action: `visibility_${visibility}`, by: actor.email });
    }
    store.familyUpdates.goalShares[share.id] = share;
    writeStore(store);
    jsonResponse(response, 200, { ok: true, share });
  }

  async function handleUploadMedia(request, response, context = {}) {
    const body = await readJson(request);
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor, membership } = resolveActor(store, request, organization.id, context.adminEmail);
    if (env().liveProduction) return deny(response, 403, "production_media_locked", "Production media storage is not configured in this phase.");
    if (isCurriculumOnly(store, organization.id)) return deny(response, 403, "curriculum_only_denied");
    const tagged = Array.isArray(body.taggedChildIds) ? body.taggedChildIds : [];
    for (const childId of tagged) {
      if (!canViewChild(store, actor, organization.id, childId).allowed) {
        return deny(response, 403, "child_not_in_scope");
      }
    }
    const photoDecision = orgPermissions.evaluateAccess({
      store, actor, organizationId: organization.id, action: orgPermissions.ACTIONS.CHILD_ADD_PHOTO, childId: tagged[0] || "",
    });
    if (!photoDecision.allowed && !isDirectorRole(actor.role)) {
      return deny(response, 403, photoDecision.reason || "access_denied");
    }
    const validation = model.validateMediaUpload({
      mimeType: body.mimeType,
      byteSize: body.byteSize,
      fileName: body.fileName,
      contentBase64: body.contentBase64,
    });
    if (!validation.ok) return deny(response, 400, validation.reason, "Media upload rejected.");
    const media = model.createMediaRecord({
      organizationId: organization.id,
      kind: validation.kind,
      caption: body.caption,
      taggedChildIds: tagged,
      classroomId: body.classroomId || "",
      uploadedByMembershipId: membership?.id || "",
      uploadedByEmail: actor.email,
      mimeType: body.mimeType,
      byteSize: validation.byteSize,
      fileName: body.fileName,
      contentBase64: body.contentBase64 || "",
      status: model.MEDIA_STATUSES.PENDING_REVIEW,
      familyVisibility: model.VISIBILITY.PRIVATE_INTERNAL,
      downloadPermission: false,
    });
    store.familyUpdates.media[media.id] = media;
    audit(store, organization.id, "media_uploaded", "Media placeholder uploaded", "media", media.id, actor, tagged[0] || "");
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      media: { ...media, contentBase64: undefined, hasContent: Boolean(media.contentBase64) },
    });
  }

  async function handleShareMedia(request, response, context = {}, mediaId) {
    const body = await readJson(request);
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    const media = store.familyUpdates.media[mediaId];
    if (!media || media.organizationId !== organization.id) return deny(response, 404, "not_found");
    if (!isDirectorRole(actor.role)) return deny(response, 403, "director_required");
    const visibility = body.visibility || model.VISIBILITY.FAMILY_VISIBLE;
    if (visibility === model.VISIBILITY.FAMILY_VISIBLE) {
      for (const childId of media.taggedChildIds || []) {
        if (!model.consentAllowsFamilyShare(store, organization.id, childId)) {
          return deny(response, 403, "media_consent_denied", "Active media consent is required for each tagged child before family sharing.");
        }
      }
      media.status = model.MEDIA_STATUSES.FAMILY_VISIBLE;
      media.familyVisibility = model.VISIBILITY.FAMILY_VISIBLE;
      media.sharedAt = model.nowIso();
      media.approvedAt = media.approvedAt || media.sharedAt;
      media.downloadPermission = body.downloadPermission === true && (media.taggedChildIds || []).every((childId) => (
        model.consentAllowsDownload(store, organization.id, childId)
      ));
    } else if (visibility === model.VISIBILITY.WITHDRAWN) {
      media.status = model.MEDIA_STATUSES.WITHDRAWN;
      media.familyVisibility = model.VISIBILITY.WITHDRAWN;
      media.withdrawnAt = model.nowIso();
    } else {
      media.familyVisibility = visibility;
      media.status = model.MEDIA_STATUSES.APPROVED;
    }
    model.appendHistory(media, { action: `visibility_${visibility}`, by: actor.email });
    store.familyUpdates.media[media.id] = media;
    writeStore(store);
    jsonResponse(response, 200, { ok: true, media: { ...media, contentBase64: undefined } });
  }

  async function handleListMedia(request, response, context = {}) {
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const rows = listValues(store.familyUpdates.media)
      .filter((row) => row.organizationId === organization.id)
      .map((row) => ({ ...row, contentBase64: undefined, hasContent: Boolean(row.contentBase64) }));
    jsonResponse(response, 200, { ok: true, media: rows });
  }

  async function handleListConsents(request, response, context = {}, url) {
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const childId = String(url?.searchParams?.get("childId") || "").trim();
    let rows = listValues(store.familyUpdates.consents).filter((row) => row.organizationId === organization.id);
    if (childId) rows = rows.filter((row) => row.childId === childId);
    jsonResponse(response, 200, { ok: true, consents: rows });
  }

  async function handleCreateConsent(request, response, context = {}) {
    const body = await readJson(request);
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!isDirectorRole(actor.role)) return deny(response, 403, "director_required");
    const consent = model.createMediaConsentRecord({
      organizationId: organization.id,
      childId: body.childId,
      scope: body.scope,
      downloadAllowed: body.downloadAllowed === true,
      viewOnly: body.viewOnly !== false,
      startsAt: body.startsAt,
      endsAt: body.endsAt,
      consentDocumentReference: body.consentDocumentReference,
      enteredByEmail: actor.email,
    });
    store.familyUpdates.consents[consent.id] = consent;
    writeStore(store);
    jsonResponse(response, 200, { ok: true, consent });
  }

  async function handleReviewQueue(request, response, context = {}) {
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!isDirectorRole(actor.role)) return deny(response, 403, "director_required");
    jsonResponse(response, 200, {
      ok: true,
      label: TESTING_BANNER,
      sharingConfig: model.getSharingConfig(store, organization.id),
      updatesForReview: listValues(store.familyUpdates.updates).filter((row) => (
        row.organizationId === organization.id && row.status === model.UPDATE_STATUSES.SUBMITTED_FOR_REVIEW
      )),
      dailyReportsForReview: listValues(store.familyUpdates.dailyReportShares).filter((row) => (
        row.organizationId === organization.id && row.visibility === model.VISIBILITY.SUBMITTED_FOR_REVIEW
      )),
      mediaForReview: listValues(store.familyUpdates.media).filter((row) => (
        row.organizationId === organization.id && row.status === model.MEDIA_STATUSES.PENDING_REVIEW
      )).map((row) => ({ ...row, contentBase64: undefined })),
      observationSharesForReview: listValues(store.familyUpdates.observationShares).filter((row) => (
        row.organizationId === organization.id && row.visibility === model.VISIBILITY.SUBMITTED_FOR_REVIEW
      )),
      concernRequests: listValues(store.familyUpdates.concernRequests).filter((row) => (
        row.organizationId === organization.id && row.status === "pending_provider_review"
      )),
    });
  }

  function matchRoute(method, pathname, url) {
    const path = String(pathname || "");
    if (!path.startsWith(BASE)) return null;
    if (method === "GET" && path === `${BASE}/status`) return (req, res, ctx) => handleStatus(req, res, ctx);
    if (method === "POST" && path === `${BASE}/seed`) return (req, res, ctx) => handleSeed(req, res, ctx);
    if (method === "GET" && path === `${BASE}/config`) return (req, res, ctx) => handleGetConfig(req, res, ctx);
    if (method === "PATCH" && path === `${BASE}/config`) return (req, res, ctx) => handlePatchConfig(req, res, ctx);
    if (method === "GET" && path === `${BASE}/review-queue`) return (req, res, ctx) => handleReviewQueue(req, res, ctx);
    if (method === "GET" && path === `${BASE}/updates`) return (req, res, ctx) => handleListUpdates(req, res, ctx, url);
    if (method === "POST" && path === `${BASE}/updates`) return (req, res, ctx) => handleCreateUpdate(req, res, ctx);
    if (method === "POST" && /^\/api\/director-center\/family-updates\/updates\/[^/]+\/(submit|approve|share|correct|withdraw|archive)$/.test(path)) {
      const parts = path.split("/");
      const id = decodeURIComponent(parts[parts.length - 2]);
      const actionName = parts[parts.length - 1];
      return (req, res, ctx) => handleTransitionUpdate(req, res, ctx, id, actionName);
    }
    if (method === "POST" && path === `${BASE}/daily-reports/share`) return (req, res, ctx) => handleShareDailyReport(req, res, ctx);
    if (method === "POST" && path === `${BASE}/observations/share`) return (req, res, ctx) => handleShareObservation(req, res, ctx);
    if (method === "POST" && path === `${BASE}/goals/share`) return (req, res, ctx) => handleShareGoal(req, res, ctx);
    if (method === "GET" && path === `${BASE}/media`) return (req, res, ctx) => handleListMedia(req, res, ctx);
    if (method === "POST" && path === `${BASE}/media`) return (req, res, ctx) => handleUploadMedia(req, res, ctx);
    if (method === "POST" && /^\/api\/director-center\/family-updates\/media\/[^/]+\/share$/.test(path)) {
      const id = decodeURIComponent(path.split("/media/")[1].split("/share")[0]);
      return (req, res, ctx) => handleShareMedia(req, res, ctx, id);
    }
    if (method === "GET" && path === `${BASE}/consents`) return (req, res, ctx) => handleListConsents(req, res, ctx, url);
    if (method === "POST" && path === `${BASE}/consents`) return (req, res, ctx) => handleCreateConsent(req, res, ctx);
    return null;
  }

  return { matchRoute };
}

module.exports = { createFamilyUpdatesApi, BASE };
