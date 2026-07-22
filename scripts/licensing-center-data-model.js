/**
 * Phase 14 — Licensing and Inspection Readiness Center.
 * Configurable checklists referencing Phase 13 authoritative records.
 * Fake data only. Does NOT claim legal compliance or invent state regulations.
 * No email/SMS/push/Stripe/live AI/production storage.
 */

const crypto = require("node:crypto");
const recordsModel = require("./records-center-data-model.js");
const foundation = require("./foundation-data-model.js");

const READINESS = Object.freeze({
  READY: "ready",
  NEEDS_ATTENTION: "needs_attention",
  MISSING: "missing",
  DUE_SOON: "due_soon",
  EXPIRING_SOON: "expiring_soon",
  EXPIRED: "expired",
  WAITING_UPLOAD: "waiting_for_upload",
  WAITING_SIGNATURE: "waiting_for_signature",
  WAITING_PROVIDER_REVIEW: "waiting_for_provider_review",
  RETURNED_FOR_CORRECTION: "returned_for_correction",
  NOT_APPLICABLE: "not_applicable",
  ARCHIVED: "archived",
});

const CORRECTIVE_STATUSES = Object.freeze({
  OPEN: "open",
  ASSIGNED: "assigned",
  IN_PROGRESS: "in_progress",
  EVIDENCE_SUBMITTED: "evidence_submitted",
  READY_FOR_REVIEW: "ready_for_review",
  COMPLETED: "completed",
  REOPENED: "reopened",
  OVERDUE: "overdue",
  ARCHIVED: "archived",
});

const FREQUENCIES = Object.freeze({
  DAILY: "daily",
  WEEKLY: "weekly",
  MONTHLY: "monthly",
  QUARTERLY: "quarterly",
  ANNUALLY: "annually",
  CUSTOM: "custom",
  ONE_TIME: "one_time",
});

const TESTING_BANNER = "Testing Account — Fake Licensing Data Only. Not legal compliance guidance.";
const DISCLAIMER = "Licensing requirements vary. Verify all requirements with your state, territory, local licensing agency, and applicable programs. Little Learner Hub does not guarantee licensing compliance.";

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function nowIso() {
  return new Date().toISOString();
}

function cleanText(value, max = 1000) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanLongText(value, max = 8000) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);
}

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

function ensureLicensingStore(store) {
  if (!store || typeof store !== "object") throw new Error("store is required");
  recordsModel.ensureRecordsStore(store);
  foundation.ensureFoundationStore(store);
  store.licensingCenter = store.licensingCenter && typeof store.licensingCenter === "object" ? store.licensingCenter : {};
  const lc = store.licensingCenter;
  lc.setups = lc.setups && typeof lc.setups === "object" && !Array.isArray(lc.setups) ? lc.setups : {};
  lc.requirements = lc.requirements && typeof lc.requirements === "object" && !Array.isArray(lc.requirements) ? lc.requirements : {};
  lc.statePacks = lc.statePacks && typeof lc.statePacks === "object" && !Array.isArray(lc.statePacks) ? lc.statePacks : {};
  lc.occurrences = lc.occurrences && typeof lc.occurrences === "object" && !Array.isArray(lc.occurrences) ? lc.occurrences : {};
  lc.correctiveActions = lc.correctiveActions && typeof lc.correctiveActions === "object" && !Array.isArray(lc.correctiveActions) ? lc.correctiveActions : {};
  lc.inspectionPackets = lc.inspectionPackets && typeof lc.inspectionPackets === "object" && !Array.isArray(lc.inspectionPackets) ? lc.inspectionPackets : {};
  lc.inspectorAccess = lc.inspectorAccess && typeof lc.inspectorAccess === "object" && !Array.isArray(lc.inspectorAccess) ? lc.inspectorAccess : {};
  lc.audit = lc.audit && typeof lc.audit === "object" && !Array.isArray(lc.audit) ? lc.audit : {};
  lc.meta = {
    ...(lc.meta && typeof lc.meta === "object" ? lc.meta : {}),
    createdAt: lc.meta?.createdAt || nowIso(),
    updatedAt: nowIso(),
    phase: 14,
    testingOnly: true,
    noLegalComplianceClaim: true,
    noInventedStateRegulations: true,
    noOutboundEmail: true,
    noOutboundSms: true,
    noPush: true,
    noStripe: true,
    noLiveAi: true,
    disclaimer: DISCLAIMER,
    note: "Phase 14 Licensing Center. Configurable readiness only. Not a compliance guarantee.",
  };
  return store;
}

function createAudit(store, input = {}) {
  ensureLicensingStore(store);
  const row = {
    id: newId("lcaudit"),
    organizationId: cleanText(input.organizationId, 80),
    action: cleanText(input.action, 80),
    actorEmail: cleanText(input.actorEmail, 160).toLowerCase(),
    detail: cleanText(input.detail, 500),
    entityId: cleanText(input.entityId, 80),
    previous: input.previous == null ? null : input.previous,
    next: input.next == null ? null : input.next,
    createdAt: nowIso(),
  };
  store.licensingCenter.audit[row.id] = row;
  return row;
}

function createSetup(input = {}) {
  return {
    id: input.id || newId("lcsetup"),
    organizationId: cleanText(input.organizationId, 80),
    stateOrTerritory: cleanText(input.stateOrTerritory || "Testing Territory", 80),
    programLocationId: cleanText(input.programLocationId, 80),
    programType: cleanText(input.programType || "childcare_center", 40),
    licenseType: cleanText(input.licenseType || "center", 80),
    licenseNumber: cleanText(input.licenseNumber || "FAKE-LIC-000", 80),
    licenseIssuedAt: cleanText(input.licenseIssuedAt, 40),
    licenseExpiresAt: cleanText(input.licenseExpiresAt, 40),
    agesServed: cleanText(input.agesServed || "6 weeks–5 years", 120),
    licensedCapacity: Number(input.licensedCapacity) || 0,
    classroomCapacities: input.classroomCapacities && typeof input.classroomCapacities === "object" ? input.classroomCapacities : {},
    transportationOffered: input.transportationOffered === true,
    mealsProvided: input.mealsProvided === true,
    cacfpParticipation: input.cacfpParticipation === true,
    infantCare: input.infantCare === true,
    medicationAdministration: input.medicationAdministration === true,
    waterActivities: input.waterActivities === true,
    overnightCare: input.overnightCare === true,
    animalsPets: input.animalsPets === true,
    otherServices: cleanText(input.otherServices, 400),
    testingOnly: true,
    disclaimer: DISCLAIMER,
    updatedAt: nowIso(),
    createdAt: input.createdAt || nowIso(),
  };
}

function createGenericTestingPack(organizationId) {
  return {
    id: newId("lcpack"),
    organizationId,
    packKey: "generic_testing_pack",
    title: "Generic childcare testing pack (NOT legal guidance)",
    testingOnly: true,
    legalClaim: false,
    disclaimer: DISCLAIMER,
    version: "1.0.0-testing",
    stateOrTerritory: "Generic / Testing",
    licensingAgency: "Not a real agency — testing template only",
    sourceTitle: "Internal testing categories",
    sourceUrl: "",
    lastReviewedDate: nowIso().slice(0, 10),
    requirements: [
      { key: "child_immunization", scope: "child", title: "Immunization document on file", plainLanguage: "Organize provider-entered immunization document references. The platform does not certify medical compliance.", category: "Immunization and Health", frequency: FREQUENCIES.ONE_TIME },
      { key: "child_emergency", scope: "child", title: "Emergency contacts", plainLanguage: "Emergency contact information for each child.", category: "Emergency Information", frequency: FREQUENCIES.ANNUALLY },
      { key: "child_permissions", scope: "child", title: "Permissions and authorizations", plainLanguage: "Photo, sunscreen, and related permissions.", category: "Permissions and Authorizations", frequency: FREQUENCIES.ANNUALLY },
      { key: "staff_cpr", scope: "staff", title: "CPR / first aid certification", plainLanguage: "Track staff CPR/first-aid document references and expiration.", category: "Staff Training and Certifications", frequency: FREQUENCIES.ANNUALLY },
      { key: "staff_background", scope: "staff", title: "Background clearance", plainLanguage: "Track clearance status and renewal dates (director/owner restricted).", category: "Staff Records", frequency: FREQUENCIES.ANNUALLY },
      { key: "staff_safe_sleep", scope: "staff", title: "Safe-sleep training", plainLanguage: "When infant care is offered, track safe-sleep training records.", category: "Staff Training and Certifications", frequency: FREQUENCIES.ANNUALLY, requiresInfantCare: true },
      { key: "facility_drill", scope: "facility", title: "Emergency drill", plainLanguage: "Record fire/evacuation/severe-weather drills.", category: "Facility and Safety", frequency: FREQUENCIES.MONTHLY },
      { key: "facility_inspection", scope: "facility", title: "Facility inspection", plainLanguage: "Track facility inspection documents.", category: "Facility and Safety", frequency: FREQUENCIES.QUARTERLY },
      { key: "program_license", scope: "program", title: "Program license", plainLanguage: "Track license number and expiration.", category: "Licensing and Program Records", frequency: FREQUENCIES.ANNUALLY },
      { key: "medication_auth", scope: "child", title: "Medication authorization", plainLanguage: "When medication administration is offered, track signed authorizations.", category: "Medication", frequency: FREQUENCIES.ONE_TIME, requiresMedication: true },
    ],
    createdAt: nowIso(),
  };
}

function createRequirement(input = {}) {
  const now = nowIso();
  return {
    id: input.id || newId("lcreq"),
    organizationId: cleanText(input.organizationId, 80),
    packKey: cleanText(input.packKey || "custom", 80),
    key: cleanText(input.key, 80),
    scope: cleanText(input.scope || "program", 40),
    title: cleanText(input.title, 200),
    plainLanguage: cleanLongText(input.plainLanguage, 1000),
    category: cleanText(input.category || "Other", 80),
    frequency: Object.values(FREQUENCIES).includes(input.frequency) ? input.frequency : FREQUENCIES.ONE_TIME,
    dueDate: cleanText(input.dueDate, 40),
    expirationDate: cleanText(input.expirationDate, 40),
    assignedToEmail: cleanText(input.assignedToEmail, 160).toLowerCase(),
    connectedRecordId: cleanText(input.connectedRecordId, 80),
    relatedChildId: cleanText(input.relatedChildId, 80),
    relatedStaffId: cleanText(input.relatedStaffId, 80),
    relatedClassroomId: cleanText(input.relatedClassroomId, 80),
    status: Object.values(READINESS).includes(input.status) ? input.status : READINESS.MISSING,
    notApplicable: input.notApplicable === true,
    providerNotes: cleanLongText(input.providerNotes, 2000),
    archived: input.archived === true,
    history: Array.isArray(input.history) ? input.history : [{ status: input.status || READINESS.MISSING, at: now }],
    testingOnly: true,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

function readinessFromRecord(record) {
  if (!record) return READINESS.MISSING;
  if (record.status === recordsModel.RECORD_STATUSES.EXPIRED) return READINESS.EXPIRED;
  if (record.status === recordsModel.RECORD_STATUSES.EXPIRING_SOON) return READINESS.EXPIRING_SOON;
  if (record.status === recordsModel.RECORD_STATUSES.NEEDS_REVIEW) return READINESS.WAITING_PROVIDER_REVIEW;
  if (record.status === recordsModel.RECORD_STATUSES.RETURNED_FOR_CORRECTION) return READINESS.RETURNED_FOR_CORRECTION;
  if (record.signatureStatus === "awaiting") return READINESS.WAITING_SIGNATURE;
  if (record.status === recordsModel.RECORD_STATUSES.APPROVED) return READINESS.READY;
  if (record.status === recordsModel.RECORD_STATUSES.UNFILED || record.status === recordsModel.RECORD_STATUSES.SUBMITTED) return READINESS.WAITING_UPLOAD;
  return READINESS.NEEDS_ATTENTION;
}

function syncRequirementToRecords(store, requirement) {
  recordsModel.ensureRecordsStore(store);
  if (requirement.notApplicable || requirement.archived) {
    requirement.status = requirement.notApplicable ? READINESS.NOT_APPLICABLE : READINESS.ARCHIVED;
    return requirement;
  }
  if (requirement.connectedRecordId) {
    const record = store.recordsCenter.records[requirement.connectedRecordId];
    requirement.status = readinessFromRecord(record);
    if (record?.expirationDate) requirement.expirationDate = record.expirationDate;
  } else {
    // Try match by category + related ids
    const match = listValues(store.recordsCenter.records).find((r) => (
      r.organizationId === requirement.organizationId
      && r.category === requirement.category
      && (!requirement.relatedChildId || r.relatedChildId === requirement.relatedChildId)
      && (!requirement.relatedStaffId || r.relatedStaffId === requirement.relatedStaffId)
      && r.status !== recordsModel.RECORD_STATUSES.VOIDED
      && r.status !== recordsModel.RECORD_STATUSES.REJECTED
    ));
    if (match) {
      requirement.connectedRecordId = match.id;
      requirement.status = readinessFromRecord(match);
    } else {
      requirement.status = READINESS.MISSING;
    }
  }
  requirement.updatedAt = nowIso();
  return requirement;
}

function dashboardCounts(store, organizationId) {
  ensureLicensingStore(store);
  const rows = listValues(store.licensingCenter.requirements)
    .filter((r) => r.organizationId === organizationId && !r.archived)
    .map((r) => syncRequirementToRecords(store, r));
  const count = (status) => rows.filter((r) => r.status === status).length;
  return {
    ready: count(READINESS.READY),
    needsAttention: count(READINESS.NEEDS_ATTENTION),
    missing: count(READINESS.MISSING),
    dueSoon: count(READINESS.DUE_SOON),
    expiringSoon: count(READINESS.EXPIRING_SOON),
    expired: count(READINESS.EXPIRED),
    waitingForUpload: count(READINESS.WAITING_UPLOAD),
    waitingForSignature: count(READINESS.WAITING_SIGNATURE),
    waitingForProviderReview: count(READINESS.WAITING_PROVIDER_REVIEW),
    returnedForCorrection: count(READINESS.RETURNED_FOR_CORRECTION),
    notApplicable: count(READINESS.NOT_APPLICABLE),
    archived: listValues(store.licensingCenter.requirements).filter((r) => r.organizationId === organizationId && r.archived).length,
    wording: {
      overall: "Ready based on configured checklist — not a universal compliance label",
      disclaimer: DISCLAIMER,
    },
  };
}

function createCorrectiveAction(input = {}) {
  const now = nowIso();
  return {
    id: input.id || newId("lcca"),
    organizationId: cleanText(input.organizationId, 80),
    finding: cleanText(input.finding, 400),
    sourceAgency: cleanText(input.sourceAgency || "Testing agency (fake)", 120),
    inspectionDate: cleanText(input.inspectionDate, 40),
    requirementId: cleanText(input.requirementId, 80),
    description: cleanLongText(input.description, 4000),
    responsibleEmail: cleanText(input.responsibleEmail, 160).toLowerCase(),
    correctionNeeded: cleanLongText(input.correctionNeeded, 2000),
    dueDate: cleanText(input.dueDate, 40),
    status: Object.values(CORRECTIVE_STATUSES).includes(input.status) ? input.status : CORRECTIVE_STATUSES.OPEN,
    evidenceRecordIds: Array.isArray(input.evidenceRecordIds) ? input.evidenceRecordIds.slice(0, 20) : [],
    completionDate: cleanText(input.completionDate, 40),
    directorApproved: input.directorApproved === true,
    followUpDate: cleanText(input.followUpDate, 40),
    finalResolution: cleanLongText(input.finalResolution, 2000),
    internalNotes: cleanLongText(input.internalNotes, 2000),
    history: Array.isArray(input.history) ? input.history : [{ status: input.status || CORRECTIVE_STATUSES.OPEN, at: now }],
    testingOnly: true,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

function createInspectionPacket(input = {}) {
  const now = nowIso();
  const expiresAt = input.expiresAt || new Date(Date.now() + 7 * 86400000).toISOString();
  return {
    id: input.id || newId("lcpacket"),
    organizationId: cleanText(input.organizationId, 80),
    locationId: cleanText(input.locationId, 80),
    inspectionDate: cleanText(input.inspectionDate, 40),
    classroomIds: Array.isArray(input.classroomIds) ? input.classroomIds.slice(0, 50) : [],
    childCategories: Array.isArray(input.childCategories) ? input.childCategories.slice(0, 30) : [],
    staffCategories: Array.isArray(input.staffCategories) ? input.staffCategories.slice(0, 30) : [],
    facilityCategories: Array.isArray(input.facilityCategories) ? input.facilityCategories.slice(0, 30) : [],
    includeIdentifyingInfo: input.includeIdentifyingInfo === true,
    redactionOptions: input.redactionOptions && typeof input.redactionOptions === "object" ? input.redactionOptions : { redactGuardianContact: true },
    recordIds: Array.isArray(input.recordIds) ? input.recordIds.slice(0, 200) : [],
    expiresAt,
    revoked: input.revoked === true,
    readOnly: true,
    timeLimited: true,
    scopeLimited: true,
    audited: true,
    crossOrganizationUnavailable: true,
    createdByEmail: cleanText(input.createdByEmail, 160).toLowerCase(),
    createdAt: input.createdAt || now,
    testingOnly: true,
    disclaimer: DISCLAIMER,
  };
}

function createInspectorAccess(input = {}) {
  return {
    id: input.id || newId("lcinsp"),
    organizationId: cleanText(input.organizationId, 80),
    packetId: cleanText(input.packetId, 80),
    token: cleanText(input.token || newId("insp_tok"), 120),
    expiresAt: cleanText(input.expiresAt, 40),
    revoked: input.revoked === true,
    readOnly: true,
    fullAccountAccess: false,
    createdAt: input.createdAt || nowIso(),
  };
}

function completeRecurringOccurrence(store, requirement, actorEmail) {
  ensureLicensingStore(store);
  const occurrence = {
    id: newId("lcocc"),
    organizationId: requirement.organizationId,
    requirementId: requirement.id,
    completedAt: nowIso(),
    completedByEmail: cleanText(actorEmail, 160).toLowerCase(),
    status: READINESS.READY,
    historical: true,
  };
  store.licensingCenter.occurrences[occurrence.id] = occurrence;
  // Never overwrite historical occurrence; create next due if recurring
  if (requirement.frequency !== FREQUENCIES.ONE_TIME) {
    const next = { ...requirement, id: newId("lcreq"), status: READINESS.MISSING, connectedRecordId: "", history: [{ status: READINESS.MISSING, at: nowIso(), note: "Next occurrence after completion" }], createdAt: nowIso(), updatedAt: nowIso() };
    // Keep original requirement as completed historical marker via occurrence; update dueDate soft
    requirement.history.push({ status: READINESS.READY, at: nowIso(), by: actorEmail, occurrenceId: occurrence.id });
    store.licensingCenter.requirements[next.id] = next;
    return { occurrence, nextRequirementId: next.id };
  }
  requirement.status = READINESS.READY;
  requirement.history.push({ status: READINESS.READY, at: nowIso(), by: actorEmail, occurrenceId: occurrence.id });
  return { occurrence, nextRequirementId: null };
}

module.exports = {
  READINESS,
  CORRECTIVE_STATUSES,
  FREQUENCIES,
  TESTING_BANNER,
  DISCLAIMER,
  newId,
  nowIso,
  cleanText,
  cleanLongText,
  listValues,
  ensureLicensingStore,
  createAudit,
  createSetup,
  createGenericTestingPack,
  createRequirement,
  readinessFromRecord,
  syncRequirementToRecords,
  dashboardCounts,
  createCorrectiveAction,
  createInspectionPacket,
  createInspectorAccess,
  completeRecurringOccurrence,
};
