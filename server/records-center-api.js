/**
 * Phase 13 provider Records Center API — /api/director-center/records/*
 * Fake/testing only. No production storage, public URLs, OCR/AI, email/SMS/push/Stripe.
 * Handlers receive context { adminEmail } from director-center mount.
 */

const foundation = require("../scripts/foundation-data-model.js");
const orgPermissions = require("../scripts/org-permissions.js");
const formsFixtures = require("../scripts/forms-center-preview-fixtures.js");
const model = require("../scripts/records-center-data-model.js");
const fixtures = require("../scripts/records-center-fixtures.js");

const BASE = "/api/director-center/records";
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

function createRecordsCenterApi({
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
      recordsCenter: true,
      preview: true,
      testingBanner: TESTING_BANNER,
    });
  }

  function ensureOrg(store, adminEmail) {
    model.ensureRecordsStore(store);
    const seeded = fixtures.ensurePhase13Preview(store, { adminEmail: normalizeEmail?.(adminEmail) || adminEmail });
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

  function assertRecordsAccess(actor, response) {
    const role = actor?.role || "";
    if (role === "curriculum_only" || /curriculum_only/i.test(role)) {
      deny(response, 403, "records_denied", "Curriculum Only cannot access Records Center.");
      return false;
    }
    if ((role === orgPermissions.ORG_ROLES.ASSISTANT_STAFF || /assistant/i.test(role)) && !actor.recordsOverride) {
      deny(response, 403, "records_denied", "Assistants are denied Records Center access by default.");
      return false;
    }
    return true;
  }

  function assertSensitiveAccess(actor, record, response) {
    const conf = record?.confidentiality || "";
    const sensitive = [
      model.CONFIDENTIALITY.MEDICAL_RESTRICTED,
      model.CONFIDENTIALITY.CUSTODY_RESTRICTED,
      model.CONFIDENTIALITY.PERSONNEL_RESTRICTED,
      model.CONFIDENTIALITY.DIRECTOR_ONLY,
      model.CONFIDENTIALITY.BILLING_RESTRICTED,
    ];
    if (sensitive.includes(conf) && !isDirectorRole(actor.role) && !actor.recordsManagerGrant) {
      deny(response, 403, "records_sensitive_denied", "This record requires director/owner or records manager access.");
      return false;
    }
    if (!model.actorMayViewRecord({ ...actor, organizationId: actor.organizationId || record.organizationId }, record)) {
      deny(response, 403, "records_denied", "You cannot view this record.");
      return false;
    }
    return true;
  }

  function teacherClassroomOk(actor, record) {
    const role = actor?.role || "";
    if (!(/teacher|lead/i.test(role)) || isDirectorRole(role)) return true;
    if (!actor.assignedClassroomIds || !Array.isArray(actor.assignedClassroomIds) || !actor.assignedClassroomIds.length) return true;
    if (!record.relatedClassroomId) return true;
    return actor.assignedClassroomIds.includes(record.relatedClassroomId);
  }

  function matchesFilters(row, query) {
    const q = query || {};
    const text = safeLower(q.q || "");
    if (text) {
      const hay = `${row.title} ${row.category} ${row.description} ${(row.tags || []).join(" ")}`.toLowerCase();
      if (!hay.includes(text)) return false;
    }
    if (q.category && row.category !== q.category) return false;
    if (q.status && row.status !== q.status) return false;
    if (q.childId && row.relatedChildId !== q.childId) return false;
    if (q.staffId && row.relatedStaffId !== q.staffId) return false;
    if (q.classroomId && row.relatedClassroomId !== q.classroomId) return false;
    if (q.tag) {
      const tag = safeLower(q.tag);
      if (!(row.tags || []).some((t) => safeLower(t) === tag)) return false;
    }
    return true;
  }

  function visibleRecords(store, organizationId, actor, query) {
    return listValues(store.recordsCenter.records)
      .filter((row) => row.organizationId === organizationId)
      .filter((row) => model.actorMayViewRecord({ ...actor, organizationId }, row))
      .filter((row) => teacherClassroomOk(actor, row))
      .filter((row) => matchesFilters(row, query))
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  }

  async function handleStatus(request, response, context = {}) {
    if (env().liveProduction) return deny(response, 403, "production_locked", "Records Center testing is not available on production.");
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      phase: 13,
      preview: true,
      testingBanner: TESTING_BANNER,
      organizationId: organization.id,
      noProductionStorage: true,
      noPublicUrls: true,
      noOcr: true,
      noLiveAi: true,
      noOutboundEmail: true,
      noOutboundSms: true,
      noPush: true,
      noStripe: true,
      recordCount: listValues(store.recordsCenter.records).filter((r) => r.organizationId === organization.id).length,
      statuses: Object.values(model.RECORD_STATUSES),
      categories: model.STARTER_CATEGORIES,
    });
  }

  async function handleSeed(request, response, context = {}) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const body = await readJson(request).catch(() => ({}));
    const store = readStore();
    const result = body.reset === true
      ? fixtures.resetPhase13Preview(store, { adminEmail: context.adminEmail, organizationId: body.organizationId || "" })
      : fixtures.ensurePhase13Preview(store, { adminEmail: context.adminEmail, organizationId: body.organizationId || "" });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, testingBanner: TESTING_BANNER, ...result });
  }

  async function handleOverview(request, response, context = {}) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!assertRecordsAccess(actor, response)) return;
    const counts = model.overviewCounts(store, organization.id);
    writeStore(store);
    jsonResponse(response, 200, { ok: true, testingBanner: TESTING_BANNER, counts, organizationId: organization.id });
  }

  async function handleInbox(request, response, context = {}) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!assertRecordsAccess(actor, response)) return;
    const items = visibleRecords(store, organization.id, actor, { status: model.RECORD_STATUSES.UNFILED });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, testingBanner: TESTING_BANNER, inbox: items, total: items.length });
  }

  async function handleInboxUpload(request, response, context = {}) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const body = await readJson(request).catch(() => ({}));
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!assertRecordsAccess(actor, response)) return;

    const validation = model.validateFileUpload({
      mimeType: body.mimeType,
      fileName: body.fileName,
      byteSize: body.byteSize,
      contentBase64: body.contentBase64,
    });
    if (!validation.ok) {
      return deny(response, 400, validation.error, validation.error === "executable_or_disguised_file_rejected"
        ? "Executable or disguised files are rejected."
        : "Invalid file upload.");
    }

    let file;
    try {
      file = model.createFileRecord({
        organizationId: organization.id,
        fileName: body.fileName,
        mimeType: body.mimeType,
        byteSize: body.byteSize,
        contentBase64: body.contentBase64,
        uploadedByEmail: actor.userEmail || context.adminEmail,
      });
    } catch (err) {
      return deny(response, 400, err.message || "upload_failed");
    }
    file.publicUrl = null;
    store.recordsCenter.files[file.id] = file;

    const duplicateChecksum = listValues(store.recordsCenter.files).some((row) => (
      row.id !== file.id && row.organizationId === organization.id && row.checksum === file.checksum
    ));

    const record = model.createRecord({
      organizationId: organization.id,
      title: body.title || body.fileName || "Unfiled upload",
      category: body.category || "Other",
      status: model.RECORD_STATUSES.UNFILED,
      source: "upload",
      createdByEmail: actor.userEmail || context.adminEmail,
      fileIds: [file.id],
      description: duplicateChecksum ? `Duplicate checksum warning (${file.checksum.slice(0, 12)}…)` : (body.description || ""),
    });
    store.recordsCenter.records[record.id] = record;
    model.createAudit(store, {
      organizationId: organization.id,
      recordId: record.id,
      action: "inbox_upload",
      actorEmail: actor.userEmail || context.adminEmail,
      actorRole: actor.role,
      detail: duplicateChecksum ? "upload_with_duplicate_checksum_warning" : "upload",
    });
    writeStore(store);
    jsonResponse(response, 201, {
      ok: true,
      testingBanner: TESTING_BANNER,
      record,
      file: { id: file.id, fileName: file.fileName, mimeType: file.mimeType, byteSize: file.byteSize, checksum: file.checksum, publicUrl: null },
      duplicateChecksumWarning: duplicateChecksum,
      publicUrl: null,
    });
  }

  async function handleRecordsList(request, response, context = {}, url) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!assertRecordsAccess(actor, response)) return;
    const q = Object.fromEntries(url.searchParams.entries());
    const records = visibleRecords(store, organization.id, actor, q);
    writeStore(store);
    jsonResponse(response, 200, { ok: true, testingBanner: TESTING_BANNER, records, total: records.length });
  }

  async function handleRecordGet(request, response, context, recordId) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!assertRecordsAccess(actor, response)) return;
    const row = store.recordsCenter.records[recordId];
    if (!row || row.organizationId !== organization.id) return deny(response, 404, "not_found", "Record not found.");
    if (!assertSensitiveAccess(actor, row, response)) return;
    if (!teacherClassroomOk(actor, row)) return deny(response, 403, "classroom_denied", "Teachers are limited to assigned classrooms.");
    const files = (row.fileIds || []).map((id) => store.recordsCenter.files[id]).filter(Boolean)
      .map((f) => ({ id: f.id, fileName: f.fileName, mimeType: f.mimeType, byteSize: f.byteSize, checksum: f.checksum, publicUrl: null, version: f.version }));
    const audit = listValues(store.recordsCenter.audit).filter((a) => a.recordId === row.id);
    jsonResponse(response, 200, { ok: true, testingBanner: TESTING_BANNER, record: row, files, audit });
  }

  async function handleFile(request, response, context, recordId) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const body = await readJson(request).catch(() => ({}));
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!assertRecordsAccess(actor, response)) return;
    const row = store.recordsCenter.records[recordId];
    if (!row || row.organizationId !== organization.id) return deny(response, 404, "not_found");
    if (row.relatedChildId != null && body.relatedChildId != null) row.relatedChildId = model.cleanText(body.relatedChildId, 80);
    if (body.relatedGuardianId != null) row.relatedGuardianId = model.cleanText(body.relatedGuardianId, 80);
    if (body.relatedHouseholdId != null) row.relatedHouseholdId = model.cleanText(body.relatedHouseholdId, 80);
    if (body.relatedStaffId != null) row.relatedStaffId = model.cleanText(body.relatedStaffId, 80);
    if (body.relatedClassroomId != null) row.relatedClassroomId = model.cleanText(body.relatedClassroomId, 80);
    if (body.category) row.category = model.cleanText(body.category, 80);
    if (body.title) row.title = model.cleanText(body.title, 200);
    if (body.effectiveDate != null) row.effectiveDate = model.cleanText(body.effectiveDate, 40);
    if (body.reviewDate != null) row.reviewDate = model.cleanText(body.reviewDate, 40);
    if (body.expirationDate != null) row.expirationDate = model.cleanText(body.expirationDate, 40);
    if (body.receivedDate != null) row.receivedDate = model.cleanText(body.receivedDate, 40);
    if (body.confidentiality && Object.values(model.CONFIDENTIALITY).includes(body.confidentiality)) {
      row.confidentiality = body.confidentiality;
    }
    if (body.familyVisibility != null) row.familyVisibility = body.familyVisibility === true;
    if (body.internalNotes != null) row.internalNotes = model.cleanLongText(body.internalNotes, 4000);
    if (body.tags) row.tags = Array.isArray(body.tags) ? body.tags.map((t) => model.cleanText(t, 40)).slice(0, 20) : row.tags;
    const nextStatus = body.status === model.RECORD_STATUSES.APPROVED
      ? model.RECORD_STATUSES.APPROVED
      : (body.status === model.RECORD_STATUSES.NEEDS_REVIEW ? model.RECORD_STATUSES.NEEDS_REVIEW : model.RECORD_STATUSES.NEEDS_REVIEW);
    if (nextStatus === model.RECORD_STATUSES.APPROVED && !isDirectorRole(actor.role) && !actor.recordsManagerGrant) {
      model.setRecordStatus(store, row, model.RECORD_STATUSES.NEEDS_REVIEW, actor.userEmail || context.adminEmail, "Filed — pending director approval");
    } else {
      model.setRecordStatus(store, row, nextStatus, actor.userEmail || context.adminEmail, "Manual filing");
    }
    if (nextStatus === model.RECORD_STATUSES.APPROVED) row.approvalStatus = "approved";
    else row.approvalStatus = "pending";
    row.updatedAt = model.nowIso();
    writeStore(store);
    jsonResponse(response, 200, { ok: true, record: row, testingBanner: TESTING_BANNER });
  }

  async function handleReject(request, response, context, recordId) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const body = await readJson(request).catch(() => ({}));
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!assertRecordsAccess(actor, response)) return;
    const row = store.recordsCenter.records[recordId];
    if (!row || row.organizationId !== organization.id) return deny(response, 404, "not_found");
    row.rejectReason = model.cleanText(body.reason || "Rejected", 400);
    model.setRecordStatus(store, row, model.RECORD_STATUSES.REJECTED, actor.userEmail || context.adminEmail, row.rejectReason);
    writeStore(store);
    jsonResponse(response, 200, { ok: true, record: row, testingBanner: TESTING_BANNER });
  }

  async function handleArchive(request, response, context, recordId) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!assertRecordsAccess(actor, response)) return;
    const row = store.recordsCenter.records[recordId];
    if (!row || row.organizationId !== organization.id) return deny(response, 404, "not_found");
    model.setRecordStatus(store, row, model.RECORD_STATUSES.ARCHIVED, actor.userEmail || context.adminEmail, "Archived");
    writeStore(store);
    jsonResponse(response, 200, { ok: true, record: row, testingBanner: TESTING_BANNER });
  }

  async function handleRestore(request, response, context, recordId) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!assertRecordsAccess(actor, response)) return;
    const row = store.recordsCenter.records[recordId];
    if (!row || row.organizationId !== organization.id) return deny(response, 404, "not_found");
    row.archiveStatus = false;
    model.setRecordStatus(store, row, model.RECORD_STATUSES.APPROVED, actor.userEmail || context.adminEmail, "Restored from archive");
    writeStore(store);
    jsonResponse(response, 200, { ok: true, record: row, testingBanner: TESTING_BANNER });
  }

  async function handleVoid(request, response, context, recordId) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const body = await readJson(request).catch(() => ({}));
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!assertRecordsAccess(actor, response)) return;
    const row = store.recordsCenter.records[recordId];
    if (!row || row.organizationId !== organization.id) return deny(response, 404, "not_found");
    row.voidReason = model.cleanText(body.reason || "Voided", 400);
    model.setRecordStatus(store, row, model.RECORD_STATUSES.VOIDED, actor.userEmail || context.adminEmail, row.voidReason);
    writeStore(store);
    jsonResponse(response, 200, { ok: true, record: row, testingBanner: TESTING_BANNER });
  }

  async function handleReplace(request, response, context, recordId) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const body = await readJson(request).catch(() => ({}));
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!assertRecordsAccess(actor, response)) return;
    const old = store.recordsCenter.records[recordId];
    if (!old || old.organizationId !== organization.id) return deny(response, 404, "not_found");

    let file = null;
    if (body.contentBase64) {
      const validation = model.validateFileUpload(body);
      if (!validation.ok) return deny(response, 400, validation.error);
      try {
        file = model.createFileRecord({
          organizationId: organization.id,
          fileName: body.fileName || `replacement-v${(old.version || 1) + 1}.pdf`,
          mimeType: body.mimeType || "application/pdf",
          contentBase64: body.contentBase64,
          byteSize: body.byteSize,
          uploadedByEmail: actor.userEmail || context.adminEmail,
          version: (old.version || 1) + 1,
          replacesFileId: (old.fileIds || [])[0] || "",
        });
        file.publicUrl = null;
        store.recordsCenter.files[file.id] = file;
      } catch (err) {
        return deny(response, 400, err.message || "upload_failed");
      }
    }

    const replacement = model.createRecord({
      ...old,
      id: undefined,
      title: body.title || old.title,
      version: (old.version || 1) + 1,
      previousVersionId: old.id,
      supersededById: "",
      status: body.status === model.RECORD_STATUSES.APPROVED ? model.RECORD_STATUSES.APPROVED : model.RECORD_STATUSES.NEEDS_REVIEW,
      fileIds: file ? [file.id] : (old.fileIds || []).slice(),
      createdByEmail: actor.userEmail || context.adminEmail,
      createdAt: model.nowIso(),
      updatedAt: model.nowIso(),
      voidReason: "",
      rejectReason: "",
      archiveStatus: false,
    });
    store.recordsCenter.records[replacement.id] = replacement;
    model.setRecordStatus(store, old, model.RECORD_STATUSES.SUPERSEDED, actor.userEmail || context.adminEmail, "Superseded by replacement");
    old.supersededById = replacement.id;
    // Preserve old record (do not delete)
    writeStore(store);
    jsonResponse(response, 201, {
      ok: true,
      testingBanner: TESTING_BANNER,
      record: replacement,
      previous: old,
      oldPreserved: true,
    });
  }

  async function handleMissing(request, response, context = {}) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!assertRecordsAccess(actor, response)) return;
    const result = model.missingAndExpiring(store, organization.id);
    writeStore(store);
    jsonResponse(response, 200, { ok: true, testingBanner: TESTING_BANNER, ...result });
  }

  async function handleTimeline(request, response, context = {}, url) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!assertRecordsAccess(actor, response)) return;
    const childId = url.searchParams.get("childId") || "";
    const staffId = url.searchParams.get("staffId") || "";
    const householdId = url.searchParams.get("householdId") || "";
    const items = model.buildTimeline(store, { organizationId: organization.id, childId, staffId, householdId });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, testingBanner: TESTING_BANNER, timeline: items });
  }

  async function handleCommunications(request, response, context = {}) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!assertRecordsAccess(actor, response)) return;
    // Secure refs only — do not copy message bodies
    const refs = listValues(store.recordsCenter.records)
      .filter((r) => r.organizationId === organization.id && r.relatedConversationId)
      .filter((r) => model.actorMayViewRecord({ ...actor, organizationId: organization.id }, r))
      .map((r) => ({
        recordId: r.id,
        title: r.title,
        relatedConversationId: r.relatedConversationId,
        relatedChildId: r.relatedChildId,
        status: r.status,
        category: r.category,
        recordType: r.recordType,
        // messages intentionally omitted
      }));
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      testingBanner: TESTING_BANNER,
      communications: refs,
      note: "Secure conversation references only. Message bodies are not duplicated here.",
    });
  }

  async function handleFileContent(request, response, context, fileId) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!assertRecordsAccess(actor, response)) return;
    const file = store.recordsCenter.files[fileId];
    if (!file || file.organizationId !== organization.id) return deny(response, 404, "not_found");
    const linked = listValues(store.recordsCenter.records).find((r) => (r.fileIds || []).includes(fileId));
    if (linked && !assertSensitiveAccess(actor, linked, response)) return;
    model.createAudit(store, {
      organizationId: organization.id,
      recordId: linked?.id || "",
      action: "file_view_download",
      actorEmail: actor.userEmail || context.adminEmail,
      actorRole: actor.role,
      detail: `file:${fileId}`,
    });
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      testingBanner: TESTING_BANNER,
      fileId,
      fileName: file.fileName,
      mimeType: file.mimeType,
      byteSize: file.byteSize,
      contentBase64: file.contentBase64,
      publicUrl: null,
      privateRef: true,
    });
  }

  async function handleCategories(request, response, context = {}) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!assertRecordsAccess(actor, response)) return;
    const cats = store.recordsCenter.categories[organization.id] || model.defaultCategories(organization.id);
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      testingBanner: TESTING_BANNER,
      categories: cats.systemDefaults || model.STARTER_CATEGORIES,
      custom: cats.custom || [],
    });
  }

  function matchRoute(method, pathname, url) {
    const path = String(pathname || "");
    if (!path.startsWith(BASE)) return null;

    if (method === "GET" && path === `${BASE}/status`) return (req, res, ctx) => handleStatus(req, res, ctx);
    if (method === "POST" && path === `${BASE}/seed`) return (req, res, ctx) => handleSeed(req, res, ctx);
    if (method === "GET" && path === `${BASE}/overview`) return (req, res, ctx) => handleOverview(req, res, ctx);
    if (method === "GET" && path === `${BASE}/inbox`) return (req, res, ctx) => handleInbox(req, res, ctx);
    if (method === "POST" && path === `${BASE}/inbox/upload`) return (req, res, ctx) => handleInboxUpload(req, res, ctx);
    if (method === "GET" && path === `${BASE}/records`) return (req, res, ctx) => handleRecordsList(req, res, ctx, url);
    if (method === "GET" && path === `${BASE}/missing`) return (req, res, ctx) => handleMissing(req, res, ctx);
    if (method === "GET" && path === `${BASE}/timeline`) return (req, res, ctx) => handleTimeline(req, res, ctx, url);
    if (method === "GET" && path === `${BASE}/communications`) return (req, res, ctx) => handleCommunications(req, res, ctx);
    if (method === "GET" && path === `${BASE}/categories`) return (req, res, ctx) => handleCategories(req, res, ctx);

    const fileContentMatch = path.match(/^\/api\/director-center\/records\/files\/([^/]+)\/content$/);
    if (method === "GET" && fileContentMatch) {
      return (req, res, ctx) => handleFileContent(req, res, ctx, decodeURIComponent(fileContentMatch[1]));
    }

    const recordMatch = path.match(/^\/api\/director-center\/records\/records\/([^/]+)(.*)$/);
    if (recordMatch) {
      const recordId = decodeURIComponent(recordMatch[1]);
      const rest = recordMatch[2] || "";
      if (method === "GET" && rest === "") return (req, res, ctx) => handleRecordGet(req, res, ctx, recordId);
      if (method === "POST" && rest === "/file") return (req, res, ctx) => handleFile(req, res, ctx, recordId);
      if (method === "POST" && rest === "/reject") return (req, res, ctx) => handleReject(req, res, ctx, recordId);
      if (method === "POST" && rest === "/archive") return (req, res, ctx) => handleArchive(req, res, ctx, recordId);
      if (method === "POST" && rest === "/restore") return (req, res, ctx) => handleRestore(req, res, ctx, recordId);
      if (method === "POST" && rest === "/void") return (req, res, ctx) => handleVoid(req, res, ctx, recordId);
      if (method === "POST" && rest === "/replace") return (req, res, ctx) => handleReplace(req, res, ctx, recordId);
    }

    return null;
  }

  return { matchRoute, BASE };
}

module.exports = {
  createRecordsCenterApi,
  BASE,
};
