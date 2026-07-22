/**
 * Phase 14 provider Licensing Center API — /api/director-center/licensing/*
 * Configurable readiness checklists referencing Phase 13 records.
 * Fake/testing only. No legal compliance claim. No email/SMS/push/Stripe/live AI/production storage.
 * Handlers receive context { adminEmail } from director-center mount.
 */

const foundation = require("../scripts/foundation-data-model.js");
const orgPermissions = require("../scripts/org-permissions.js");
const formsFixtures = require("../scripts/forms-center-preview-fixtures.js");
const model = require("../scripts/licensing-center-data-model.js");
const fixtures = require("../scripts/licensing-center-fixtures.js");

const BASE = "/api/director-center/licensing";
const PRODUCTION_HOST = "littlelearnershubbyleah.com";
const TESTING_BANNER = model.TESTING_BANNER;
const PERSONNEL_KEYS = new Set(["staff_background", "background_clearance", "personnel"]);

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

function createLicensingCenterApi({
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
      licensingCenter: true,
      preview: true,
      testingBanner: TESTING_BANNER,
      disclaimer: model.DISCLAIMER,
    });
  }

  function ensureOrg(store, adminEmail) {
    model.ensureLicensingStore(store);
    const seeded = fixtures.ensurePhase14Preview(store, { adminEmail: normalizeEmail?.(adminEmail) || adminEmail });
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

  function assertLicensingAccess(actor, response) {
    const role = actor?.role || "";
    if (role === "curriculum_only" || /curriculum_only/i.test(role)) {
      deny(response, 403, "licensing_denied", "Curriculum Only cannot access Licensing Center.");
      return false;
    }
    if ((role === orgPermissions.ORG_ROLES.ASSISTANT_STAFF || /assistant/i.test(role)) && !actor.licensingOverride) {
      deny(response, 403, "licensing_denied", "Assistants are denied Licensing Center access by default.");
      return false;
    }
    return true;
  }

  function isPersonnelRequirement(row) {
    if (!row) return false;
    if (PERSONNEL_KEYS.has(row.key) || /background|personnel|clearance/i.test(row.key || "")) return true;
    if (/Staff Records|Background|Personnel/i.test(row.category || "")) return true;
    return false;
  }

  function teacherMaySeeRequirement(actor, row) {
    const role = actor?.role || "";
    if (!(/teacher|lead/i.test(role)) || isDirectorRole(role)) return true;
    if (isPersonnelRequirement(row)) return false;
    if (row.assignedToEmail && safeLower(row.assignedToEmail) === safeLower(actor.userEmail)) return true;
    if (!actor.assignedClassroomIds || !Array.isArray(actor.assignedClassroomIds) || !actor.assignedClassroomIds.length) {
      // Teachers without classroom assignment only see tasks assigned to them
      return Boolean(row.assignedToEmail && safeLower(row.assignedToEmail) === safeLower(actor.userEmail));
    }
    if (row.relatedClassroomId) {
      return actor.assignedClassroomIds.includes(row.relatedClassroomId);
    }
    // Non-classroom scoped items: teachers only see if assigned
    return Boolean(row.assignedToEmail && safeLower(row.assignedToEmail) === safeLower(actor.userEmail));
  }

  function visibleRequirements(store, organizationId, actor, query) {
    const q = query || {};
    return listValues(store.licensingCenter.requirements)
      .filter((row) => row.organizationId === organizationId)
      .map((row) => model.syncRequirementToRecords(store, row))
      .filter((row) => {
        if (isPersonnelRequirement(row) && !isDirectorRole(actor.role)) return false;
        if (!teacherMaySeeRequirement(actor, row)) return false;
        return true;
      })
      .filter((row) => {
        if (q.status && row.status !== q.status) return false;
        if (q.scope && row.scope !== q.scope) return false;
        if (q.archived === "1" || q.archived === "true") {
          if (!row.archived) return false;
        } else if (!q.includeArchived) {
          if (row.archived) return false;
        }
        return true;
      })
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  }

  function primarySetup(store, organizationId) {
    return listValues(store.licensingCenter.setups)
      .filter((s) => s.organizationId === organizationId)
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))[0] || null;
  }

  function primaryPack(store, organizationId) {
    return listValues(store.licensingCenter.statePacks)
      .filter((p) => p.organizationId === organizationId)
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))[0] || null;
  }

  function actionableCards(counts) {
    return [
      { key: "missing", label: "Missing", filterStatus: model.READINESS.MISSING, count: counts.missing || 0 },
      { key: "expiringSoon", label: "Expiring soon", filterStatus: model.READINESS.EXPIRING_SOON, count: counts.expiringSoon || 0 },
      { key: "expired", label: "Expired", filterStatus: model.READINESS.EXPIRED, count: counts.expired || 0 },
      { key: "dueSoon", label: "Due soon", filterStatus: model.READINESS.DUE_SOON, count: counts.dueSoon || 0 },
      { key: "needsAttention", label: "Needs attention", filterStatus: model.READINESS.NEEDS_ATTENTION, count: counts.needsAttention || 0 },
      { key: "waitingForUpload", label: "Waiting for upload", filterStatus: model.READINESS.WAITING_UPLOAD, count: counts.waitingForUpload || 0 },
      { key: "waitingForSignature", label: "Waiting for signature", filterStatus: model.READINESS.WAITING_SIGNATURE, count: counts.waitingForSignature || 0 },
      { key: "waitingForProviderReview", label: "Waiting for provider review", filterStatus: model.READINESS.WAITING_PROVIDER_REVIEW, count: counts.waitingForProviderReview || 0 },
      { key: "returnedForCorrection", label: "Returned for correction", filterStatus: model.READINESS.RETURNED_FOR_CORRECTION, count: counts.returnedForCorrection || 0 },
      { key: "ready", label: "Ready (configured checklist)", filterStatus: model.READINESS.READY, count: counts.ready || 0 },
    ];
  }

  async function handleStatus(request, response, context = {}) {
    if (env().liveProduction) return deny(response, 403, "production_locked", "Licensing Center testing is not available on production.");
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      phase: 14,
      preview: true,
      testingBanner: TESTING_BANNER,
      disclaimer: model.DISCLAIMER,
      organizationId: organization.id,
      noOutboundEmail: true,
      noOutboundSms: true,
      noPush: true,
      noStripe: true,
      noLiveAi: true,
      noLegalComplianceClaim: true,
      noInventedStateRegulations: true,
      noExternalServices: true,
      requirementCount: listValues(store.licensingCenter.requirements).filter((r) => r.organizationId === organization.id).length,
    });
  }

  async function handleSeed(request, response, context = {}) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const body = await readJson(request).catch(() => ({}));
    const store = readStore();
    const result = body.reset === true
      ? fixtures.resetPhase14Preview(store, { adminEmail: context.adminEmail, organizationId: body.organizationId || "" })
      : fixtures.ensurePhase14Preview(store, { adminEmail: context.adminEmail, organizationId: body.organizationId || "" });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, testingBanner: TESTING_BANNER, disclaimer: model.DISCLAIMER, ...result });
  }

  async function handleSetupGet(request, response, context = {}) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!assertLicensingAccess(actor, response)) return;
    const setup = primarySetup(store, organization.id);
    const setups = listValues(store.licensingCenter.setups).filter((s) => s.organizationId === organization.id);
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      testingBanner: TESTING_BANNER,
      disclaimer: model.DISCLAIMER,
      setup,
      setups,
    });
  }

  async function handleSetupPost(request, response, context = {}) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const body = await readJson(request).catch(() => ({}));
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!assertLicensingAccess(actor, response)) return;
    if (!isDirectorRole(actor.role)) {
      return deny(response, 403, "licensing_setup_denied", "Only directors/owners can update licensing setup.");
    }
    let setup = body.id ? store.licensingCenter.setups[body.id] : primarySetup(store, organization.id);
    if (setup && setup.organizationId === organization.id) {
      const updated = model.createSetup({ ...setup, ...body, id: setup.id, organizationId: organization.id, createdAt: setup.createdAt });
      store.licensingCenter.setups[updated.id] = updated;
      setup = updated;
      model.createAudit(store, {
        organizationId: organization.id,
        action: "setup_update",
        actorEmail: actor.userEmail || context.adminEmail,
        entityId: setup.id,
        detail: "Updated licensing setup",
      });
    } else {
      setup = model.createSetup({ ...body, organizationId: organization.id });
      store.licensingCenter.setups[setup.id] = setup;
      model.createAudit(store, {
        organizationId: organization.id,
        action: "setup_create",
        actorEmail: actor.userEmail || context.adminEmail,
        entityId: setup.id,
        detail: "Created licensing setup",
      });
    }
    writeStore(store);
    jsonResponse(response, 200, { ok: true, testingBanner: TESTING_BANNER, disclaimer: model.DISCLAIMER, setup });
  }

  async function handlePack(request, response, context = {}) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!assertLicensingAccess(actor, response)) return;
    let pack = primaryPack(store, organization.id);
    if (!pack) {
      pack = model.createGenericTestingPack(organization.id);
      store.licensingCenter.statePacks[pack.id] = pack;
    }
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      testingBanner: TESTING_BANNER,
      disclaimer: model.DISCLAIMER,
      pack,
      legalClaim: false,
      note: "Generic testing pack only. Not legal compliance guidance.",
    });
  }

  async function handleDashboard(request, response, context = {}) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!assertLicensingAccess(actor, response)) return;
    const counts = model.dashboardCounts(store, organization.id);
    const cards = actionableCards(counts);
    const setup = primarySetup(store, organization.id);
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      testingBanner: TESTING_BANNER,
      disclaimer: model.DISCLAIMER,
      organizationId: organization.id,
      counts,
      cards,
      setup,
      wording: counts.wording,
      noLegalComplianceClaim: true,
    });
  }

  async function handleRequirementsList(request, response, context = {}, url) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!assertLicensingAccess(actor, response)) return;
    const q = Object.fromEntries(url.searchParams.entries());
    const requirements = visibleRequirements(store, organization.id, actor, q);
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      testingBanner: TESTING_BANNER,
      disclaimer: model.DISCLAIMER,
      requirements,
      total: requirements.length,
    });
  }

  async function handleRequirementAdd(request, response, context = {}) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const body = await readJson(request).catch(() => ({}));
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!assertLicensingAccess(actor, response)) return;
    if (!isDirectorRole(actor.role)) {
      return deny(response, 403, "licensing_denied", "Only directors/owners can add requirements.");
    }
    const req = model.createRequirement({
      ...body,
      organizationId: organization.id,
      packKey: body.packKey || "custom",
    });
    model.syncRequirementToRecords(store, req);
    store.licensingCenter.requirements[req.id] = req;
    model.createAudit(store, {
      organizationId: organization.id,
      action: "requirement_add",
      actorEmail: actor.userEmail || context.adminEmail,
      entityId: req.id,
      detail: req.title,
    });
    writeStore(store);
    jsonResponse(response, 201, { ok: true, testingBanner: TESTING_BANNER, disclaimer: model.DISCLAIMER, requirement: req });
  }

  async function handleRequirementEdit(request, response, context, requirementId) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const body = await readJson(request).catch(() => ({}));
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!assertLicensingAccess(actor, response)) return;
    const row = store.licensingCenter.requirements[requirementId];
    if (!row || row.organizationId !== organization.id) return deny(response, 404, "not_found", "Requirement not found.");
    if (isPersonnelRequirement(row) && !isDirectorRole(actor.role)) {
      return deny(response, 403, "personnel_denied", "Personnel licensing items are director/owner only.");
    }
    if (!isDirectorRole(actor.role) && !teacherMaySeeRequirement(actor, row)) {
      return deny(response, 403, "licensing_denied", "You cannot edit this requirement.");
    }

    if (body.notApplicable === true) {
      if (!isDirectorRole(actor.role)) return deny(response, 403, "licensing_denied", "Only directors can mark N/A.");
      row.notApplicable = true;
      row.status = model.READINESS.NOT_APPLICABLE;
      row.history.push({ status: model.READINESS.NOT_APPLICABLE, at: model.nowIso(), by: actor.userEmail });
    }
    if (body.notApplicable === false) {
      row.notApplicable = false;
    }
    if (body.archive === true || body.archived === true) {
      if (!isDirectorRole(actor.role)) return deny(response, 403, "licensing_denied");
      row.archived = true;
      row.status = model.READINESS.ARCHIVED;
      row.history.push({ status: model.READINESS.ARCHIVED, at: model.nowIso(), by: actor.userEmail });
    }
    if (body.restore === true || body.archived === false) {
      if (!isDirectorRole(actor.role)) return deny(response, 403, "licensing_denied");
      row.archived = false;
      row.history.push({ status: "restored", at: model.nowIso(), by: actor.userEmail });
    }
    if (body.assignedToEmail != null) {
      if (!isDirectorRole(actor.role)) return deny(response, 403, "licensing_denied", "Only directors can assign.");
      row.assignedToEmail = model.cleanText(body.assignedToEmail, 160).toLowerCase();
    }
    if (body.connectedRecordId != null) {
      const recordId = model.cleanText(body.connectedRecordId, 80);
      if (recordId) {
        const record = store.recordsCenter?.records?.[recordId];
        if (!record || record.organizationId !== organization.id) {
          return deny(response, 400, "invalid_record", "connectedRecordId must belong to this organization.");
        }
        row.connectedRecordId = recordId;
      } else {
        row.connectedRecordId = "";
      }
    }
    if (body.title != null) row.title = model.cleanText(body.title, 200);
    if (body.plainLanguage != null) row.plainLanguage = model.cleanLongText(body.plainLanguage, 1000);
    if (body.category != null) row.category = model.cleanText(body.category, 80);
    if (body.scope != null) row.scope = model.cleanText(body.scope, 40);
    if (body.frequency != null && Object.values(model.FREQUENCIES).includes(body.frequency)) row.frequency = body.frequency;
    if (body.dueDate != null) row.dueDate = model.cleanText(body.dueDate, 40);
    if (body.expirationDate != null) row.expirationDate = model.cleanText(body.expirationDate, 40);
    if (body.providerNotes != null) row.providerNotes = model.cleanLongText(body.providerNotes, 2000);
    if (body.relatedChildId != null) row.relatedChildId = model.cleanText(body.relatedChildId, 80);
    if (body.relatedStaffId != null) row.relatedStaffId = model.cleanText(body.relatedStaffId, 80);
    if (body.relatedClassroomId != null) row.relatedClassroomId = model.cleanText(body.relatedClassroomId, 80);
    if (body.status != null && Object.values(model.READINESS).includes(body.status) && isDirectorRole(actor.role)) {
      row.status = body.status;
      row.history.push({ status: body.status, at: model.nowIso(), by: actor.userEmail });
    }

    model.syncRequirementToRecords(store, row);
    row.updatedAt = model.nowIso();
    model.createAudit(store, {
      organizationId: organization.id,
      action: "requirement_edit",
      actorEmail: actor.userEmail || context.adminEmail,
      entityId: row.id,
      detail: Object.keys(body).slice(0, 8).join(","),
    });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, testingBanner: TESTING_BANNER, disclaimer: model.DISCLAIMER, requirement: row });
  }

  async function handleCompleteRecurring(request, response, context, requirementId) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!assertLicensingAccess(actor, response)) return;
    const row = store.licensingCenter.requirements[requirementId];
    if (!row || row.organizationId !== organization.id) return deny(response, 404, "not_found");
    if (!isDirectorRole(actor.role) && !teacherMaySeeRequirement(actor, row)) {
      return deny(response, 403, "licensing_denied");
    }
    const result = model.completeRecurringOccurrence(store, row, actor.userEmail || context.adminEmail);
    model.createAudit(store, {
      organizationId: organization.id,
      action: "requirement_complete_recurring",
      actorEmail: actor.userEmail || context.adminEmail,
      entityId: row.id,
      detail: result.nextRequirementId || "one_time",
    });
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      testingBanner: TESTING_BANNER,
      disclaimer: model.DISCLAIMER,
      occurrence: result.occurrence,
      nextRequirementId: result.nextRequirementId,
      requirement: row,
      nextRequirement: result.nextRequirementId ? store.licensingCenter.requirements[result.nextRequirementId] : null,
    });
  }

  async function handleCorrectiveList(request, response, context = {}) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!assertLicensingAccess(actor, response)) return;
    if (!isDirectorRole(actor.role)) {
      return deny(response, 403, "corrective_denied", "Corrective actions are director/owner only.");
    }
    const items = listValues(store.licensingCenter.correctiveActions)
      .filter((c) => c.organizationId === organization.id)
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    writeStore(store);
    jsonResponse(response, 200, { ok: true, testingBanner: TESTING_BANNER, disclaimer: model.DISCLAIMER, correctiveActions: items });
  }

  async function handleCorrectiveAdd(request, response, context = {}) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const body = await readJson(request).catch(() => ({}));
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!assertLicensingAccess(actor, response)) return;
    if (!isDirectorRole(actor.role)) return deny(response, 403, "corrective_denied");
    const row = model.createCorrectiveAction({ ...body, organizationId: organization.id });
    store.licensingCenter.correctiveActions[row.id] = row;
    model.createAudit(store, {
      organizationId: organization.id,
      action: "corrective_add",
      actorEmail: actor.userEmail || context.adminEmail,
      entityId: row.id,
      detail: row.finding,
    });
    writeStore(store);
    jsonResponse(response, 201, { ok: true, testingBanner: TESTING_BANNER, disclaimer: model.DISCLAIMER, correctiveAction: row });
  }

  async function handleCorrectiveEdit(request, response, context, correctiveId) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const body = await readJson(request).catch(() => ({}));
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!assertLicensingAccess(actor, response)) return;
    if (!isDirectorRole(actor.role)) return deny(response, 403, "corrective_denied");
    const row = store.licensingCenter.correctiveActions[correctiveId];
    if (!row || row.organizationId !== organization.id) return deny(response, 404, "not_found");
    const previous = { ...row };
    if (body.finding != null) row.finding = model.cleanText(body.finding, 400);
    if (body.description != null) row.description = model.cleanLongText(body.description, 4000);
    if (body.correctionNeeded != null) row.correctionNeeded = model.cleanLongText(body.correctionNeeded, 2000);
    if (body.responsibleEmail != null) row.responsibleEmail = model.cleanText(body.responsibleEmail, 160).toLowerCase();
    if (body.dueDate != null) row.dueDate = model.cleanText(body.dueDate, 40);
    if (body.status != null && Object.values(model.CORRECTIVE_STATUSES).includes(body.status)) {
      row.status = body.status;
      row.history.push({ status: body.status, at: model.nowIso(), by: actor.userEmail });
    }
    if (body.evidenceRecordIds) row.evidenceRecordIds = Array.isArray(body.evidenceRecordIds) ? body.evidenceRecordIds.slice(0, 20) : row.evidenceRecordIds;
    if (body.completionDate != null) row.completionDate = model.cleanText(body.completionDate, 40);
    if (body.directorApproved != null) row.directorApproved = body.directorApproved === true;
    if (body.followUpDate != null) row.followUpDate = model.cleanText(body.followUpDate, 40);
    if (body.finalResolution != null) row.finalResolution = model.cleanLongText(body.finalResolution, 2000);
    if (body.internalNotes != null) row.internalNotes = model.cleanLongText(body.internalNotes, 2000);
    if (body.archive === true) row.status = model.CORRECTIVE_STATUSES.ARCHIVED;
    row.updatedAt = model.nowIso();
    // Preserve history — never delete previous states
    model.createAudit(store, {
      organizationId: organization.id,
      action: "corrective_edit",
      actorEmail: actor.userEmail || context.adminEmail,
      entityId: row.id,
      previous: { status: previous.status, finding: previous.finding },
      next: { status: row.status, finding: row.finding },
    });
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      testingBanner: TESTING_BANNER,
      disclaimer: model.DISCLAIMER,
      correctiveAction: row,
      historyPreserved: true,
    });
  }

  async function handleInspectionPrepare(request, response, context = {}) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const body = await readJson(request).catch(() => ({}));
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!assertLicensingAccess(actor, response)) return;
    if (!isDirectorRole(actor.role)) return deny(response, 403, "inspection_denied", "Only directors/owners can prepare inspection packets.");

    const recordIds = Array.isArray(body.recordIds) ? body.recordIds.slice(0, 200) : [];
    for (const id of recordIds) {
      const rec = store.recordsCenter?.records?.[id];
      if (!rec || rec.organizationId !== organization.id) {
        return deny(response, 400, "invalid_record_scope", "Inspection packet records must belong to this organization.");
      }
    }

    const packet = model.createInspectionPacket({
      ...body,
      organizationId: organization.id,
      recordIds,
      createdByEmail: actor.userEmail || context.adminEmail,
    });
    store.licensingCenter.inspectionPackets[packet.id] = packet;

    const access = model.createInspectorAccess({
      organizationId: organization.id,
      packetId: packet.id,
      expiresAt: packet.expiresAt,
    });
    store.licensingCenter.inspectorAccess[access.id] = access;

    model.createAudit(store, {
      organizationId: organization.id,
      action: "inspection_prepare",
      actorEmail: actor.userEmail || context.adminEmail,
      entityId: packet.id,
      detail: `records:${recordIds.length}`,
    });
    writeStore(store);
    jsonResponse(response, 201, {
      ok: true,
      testingBanner: TESTING_BANNER,
      disclaimer: model.DISCLAIMER,
      packet,
      inspectorAccess: { id: access.id, token: access.token, expiresAt: access.expiresAt, revoked: false },
      scopeLimited: true,
      readOnly: true,
      timeLimited: true,
    });
  }

  async function handleInspectionGet(request, response, context, packetId) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!assertLicensingAccess(actor, response)) return;
    const packet = store.licensingCenter.inspectionPackets[packetId];
    if (!packet || packet.organizationId !== organization.id) return deny(response, 404, "not_found");
    const accessRows = listValues(store.licensingCenter.inspectorAccess).filter((a) => a.packetId === packet.id);
    const records = (packet.recordIds || [])
      .map((id) => store.recordsCenter?.records?.[id])
      .filter((r) => r && r.organizationId === organization.id)
      .map((r) => ({
        id: r.id,
        title: r.title,
        category: r.category,
        status: r.status,
        relatedChildId: packet.includeIdentifyingInfo ? r.relatedChildId : undefined,
        relatedStaffId: packet.includeIdentifyingInfo ? r.relatedStaffId : undefined,
      }));
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      testingBanner: TESTING_BANNER,
      disclaimer: model.DISCLAIMER,
      packet,
      records,
      inspectorAccess: accessRows.map((a) => ({ id: a.id, token: a.token, expiresAt: a.expiresAt, revoked: a.revoked })),
    });
  }

  async function handleInspectionRevoke(request, response, context, packetId) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!assertLicensingAccess(actor, response)) return;
    if (!isDirectorRole(actor.role)) return deny(response, 403, "inspection_denied");
    const packet = store.licensingCenter.inspectionPackets[packetId];
    if (!packet || packet.organizationId !== organization.id) return deny(response, 404, "not_found");
    packet.revoked = true;
    listValues(store.licensingCenter.inspectorAccess)
      .filter((a) => a.packetId === packet.id)
      .forEach((a) => { a.revoked = true; });
    model.createAudit(store, {
      organizationId: organization.id,
      action: "inspection_revoke",
      actorEmail: actor.userEmail || context.adminEmail,
      entityId: packet.id,
    });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, testingBanner: TESTING_BANNER, disclaimer: model.DISCLAIMER, packet, revoked: true });
  }

  async function handleInspectorToken(request, response, context, token) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const access = listValues(store.licensingCenter.inspectorAccess).find((a) => a.token === token);
    if (!access) return deny(response, 403, "inspector_denied", "Invalid inspector token.");
    if (access.organizationId !== organization.id) {
      return deny(response, 403, "wrong_organization", "Inspector access is not available for this organization.");
    }
    if (access.revoked) return deny(response, 403, "inspector_revoked", "Inspector access has been revoked.");
    if (access.expiresAt && new Date(access.expiresAt).getTime() < Date.now()) {
      return deny(response, 403, "inspector_expired", "Inspector access has expired.");
    }
    const packet = store.licensingCenter.inspectionPackets[access.packetId];
    if (!packet || packet.organizationId !== organization.id) {
      return deny(response, 403, "inspector_denied", "Packet unavailable.");
    }
    if (packet.revoked) return deny(response, 403, "inspector_revoked", "Inspection packet has been revoked.");

    const records = (packet.recordIds || [])
      .map((id) => store.recordsCenter?.records?.[id])
      .filter((r) => r && r.organizationId === organization.id)
      .map((r) => ({
        id: r.id,
        title: r.title,
        category: r.category,
        status: r.status,
        // Scope-limited read-only view; no file content / public URLs
        publicUrl: null,
      }));

    model.createAudit(store, {
      organizationId: organization.id,
      action: "inspector_view",
      actorEmail: context.adminEmail || "inspector",
      entityId: packet.id,
      detail: `token:${access.id}`,
    });
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      testingBanner: TESTING_BANNER,
      disclaimer: model.DISCLAIMER,
      readOnly: true,
      fullAccountAccess: false,
      packet: {
        id: packet.id,
        inspectionDate: packet.inspectionDate,
        classroomIds: packet.classroomIds,
        childCategories: packet.childCategories,
        staffCategories: packet.staffCategories,
        facilityCategories: packet.facilityCategories,
        expiresAt: packet.expiresAt,
        scopeLimited: true,
        timeLimited: true,
        disclaimer: packet.disclaimer,
      },
      records,
      noLegalComplianceClaim: true,
    });
  }

  async function handleReports(request, response, context = {}) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!assertLicensingAccess(actor, response)) return;
    const counts = model.dashboardCounts(store, organization.id);
    const byScope = {};
    for (const row of visibleRequirements(store, organization.id, actor, {})) {
      byScope[row.scope] = byScope[row.scope] || { ready: 0, missing: 0, expired: 0, total: 0 };
      byScope[row.scope].total += 1;
      if (row.status === model.READINESS.READY) byScope[row.scope].ready += 1;
      if (row.status === model.READINESS.MISSING) byScope[row.scope].missing += 1;
      if (row.status === model.READINESS.EXPIRED) byScope[row.scope].expired += 1;
    }
    const correctiveOpen = listValues(store.licensingCenter.correctiveActions)
      .filter((c) => c.organizationId === organization.id && c.status !== model.CORRECTIVE_STATUSES.COMPLETED && c.status !== model.CORRECTIVE_STATUSES.ARCHIVED)
      .length;
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      testingBanner: TESTING_BANNER,
      disclaimer: model.DISCLAIMER,
      counts,
      byScope,
      correctiveOpen,
      wording: "Ready based on configured checklist — not a universal compliance label",
      noLegalComplianceClaim: true,
    });
  }

  function matchRoute(method, pathname, url) {
    const path = String(pathname || "");
    if (!path.startsWith(BASE)) return null;

    if (method === "GET" && path === `${BASE}/status`) return (req, res, ctx) => handleStatus(req, res, ctx);
    if (method === "POST" && path === `${BASE}/seed`) return (req, res, ctx) => handleSeed(req, res, ctx);
    if (method === "GET" && path === `${BASE}/setup`) return (req, res, ctx) => handleSetupGet(req, res, ctx);
    if (method === "POST" && path === `${BASE}/setup`) return (req, res, ctx) => handleSetupPost(req, res, ctx);
    if (method === "GET" && path === `${BASE}/pack`) return (req, res, ctx) => handlePack(req, res, ctx);
    if (method === "GET" && path === `${BASE}/dashboard`) return (req, res, ctx) => handleDashboard(req, res, ctx);
    if (method === "GET" && path === `${BASE}/requirements`) return (req, res, ctx) => handleRequirementsList(req, res, ctx, url);
    if (method === "POST" && path === `${BASE}/requirements`) return (req, res, ctx) => handleRequirementAdd(req, res, ctx);
    if (method === "GET" && path === `${BASE}/corrective`) return (req, res, ctx) => handleCorrectiveList(req, res, ctx);
    if (method === "POST" && path === `${BASE}/corrective`) return (req, res, ctx) => handleCorrectiveAdd(req, res, ctx);
    if (method === "POST" && path === `${BASE}/inspection/prepare`) return (req, res, ctx) => handleInspectionPrepare(req, res, ctx);
    if (method === "GET" && path === `${BASE}/reports`) return (req, res, ctx) => handleReports(req, res, ctx);

    const reqMatch = path.match(/^\/api\/director-center\/licensing\/requirements\/([^/]+)(.*)$/);
    if (reqMatch) {
      const id = decodeURIComponent(reqMatch[1]);
      const rest = reqMatch[2] || "";
      if (method === "POST" && rest === "") return (req, res, ctx) => handleRequirementEdit(req, res, ctx, id);
      if (method === "POST" && rest === "/complete-recurring") return (req, res, ctx) => handleCompleteRecurring(req, res, ctx, id);
    }

    const caMatch = path.match(/^\/api\/director-center\/licensing\/corrective\/([^/]+)$/);
    if (method === "POST" && caMatch) {
      return (req, res, ctx) => handleCorrectiveEdit(req, res, ctx, decodeURIComponent(caMatch[1]));
    }

    const inspMatch = path.match(/^\/api\/director-center\/licensing\/inspection\/([^/]+)(.*)$/);
    if (inspMatch) {
      const id = decodeURIComponent(inspMatch[1]);
      const rest = inspMatch[2] || "";
      if (method === "GET" && rest === "") return (req, res, ctx) => handleInspectionGet(req, res, ctx, id);
      if (method === "POST" && rest === "/revoke") return (req, res, ctx) => handleInspectionRevoke(req, res, ctx, id);
    }

    const tokMatch = path.match(/^\/api\/director-center\/licensing\/inspector\/([^/]+)$/);
    if (method === "GET" && tokMatch) {
      return (req, res, ctx) => handleInspectorToken(req, res, ctx, decodeURIComponent(tokMatch[1]));
    }

    return null;
  }

  return { matchRoute, BASE };
}

module.exports = {
  createLicensingCenterApi,
  BASE,
};
