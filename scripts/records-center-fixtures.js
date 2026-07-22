/**
 * Phase 13 Records Center fixtures — fake records only.
 */

const phase12 = require("./enrollment-fixtures.js");
const foundation = require("./foundation-data-model.js");
const model = require("./records-center-data-model.js");

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

const TINY_PDF_BASE64 = Buffer.from("%PDF-1.4 FAKE Phase 13 test pdf", "utf8").toString("base64");
const TINY_PNG_BASE64 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64").toString("base64");

function ensurePhase13Preview(store, { adminEmail = "phase13.owner@example.invalid", organizationId = "" } = {}) {
  model.ensureRecordsStore(store);
  const seeded12 = phase12.ensurePhase12Preview(store, { adminEmail, organizationId });
  const orgId = seeded12.organizationId || organizationId;

  if (store.recordsCenter.meta?.phase13SeededFor === orgId) {
    return {
      organizationId: orgId,
      alreadySeeded: true,
      recordIds: store.recordsCenter.meta.phase13RecordIds || {},
      childIds: store.recordsCenter.meta.phase13ChildIds || seeded12.childIds || {},
      contactIds: store.recordsCenter.meta.phase13ContactIds || seeded12.contactIds || {},
    };
  }

  const childIds = seeded12.childIds || {};
  const contactIds = seeded12.contactIds || {};
  const classroom = listValues(store.classrooms).find((row) => row.organizationId === orgId) || {};
  const staff = listValues(store.staffMemberships).find((row) => row.organizationId === orgId && /teacher|director|owner/i.test(row.role || "")) || {};
  const conv = listValues(store.familyMessaging?.conversations || {}).find((c) => c.organizationId === orgId && !c.internalStaffOnly);

  store.recordsCenter.categories[orgId] = model.defaultCategories(orgId);
  store.recordsCenter.expectedTypes[orgId] = model.defaultExpectedTypes(orgId);
  store.recordsCenter.retentionPolicies[orgId] = model.defaultRetention(orgId);

  const recordIds = {};

  function addFile(name, mime, content) {
    const file = model.createFileRecord({
      organizationId: orgId,
      fileName: name,
      mimeType: mime,
      contentBase64: content,
      byteSize: Buffer.from(content, "base64").length,
      uploadedByEmail: adminEmail,
    });
    store.recordsCenter.files[file.id] = file;
    return file;
  }

  function addRecord(key, input, file) {
    const rec = model.createRecord({
      organizationId: orgId,
      createdByEmail: adminEmail,
      relatedClassroomId: classroom.id || "",
      ...input,
      fileIds: file ? [file.id] : (input.fileIds || []),
    });
    store.recordsCenter.records[rec.id] = rec;
    recordIds[key] = rec.id;
    return rec;
  }

  const unfiledFile = addFile("unfiled-scan.pdf", "application/pdf", TINY_PDF_BASE64);
  addRecord("unfiled", {
    title: "Unfiled upload (FAKE)",
    category: "Other",
    status: model.RECORD_STATUSES.UNFILED,
    source: "upload",
  }, unfiledFile);

  const approvedSnap = addFile("enrollment-snapshot.pdf", "application/pdf", TINY_PDF_BASE64);
  addRecord("approved_form_snapshot", {
    title: "Approved enrollment form snapshot (FAKE)",
    category: "Enrollment",
    status: model.RECORD_STATUSES.APPROVED,
    approvalStatus: "approved",
    signatureStatus: "signed",
    relatedChildId: childIds.ava || "",
    relatedGuardianId: contactIds.priya || "",
    formSnapshotRef: "frsnap_fixture_phase13",
    familyVisibility: true,
    confidentiality: model.CONFIDENTIALITY.FAMILY_VISIBLE,
  }, approvedSnap);

  addRecord("signed_enrollment", {
    title: "Signed enrollment record (FAKE)",
    category: "Enrollment",
    status: model.RECORD_STATUSES.APPROVED,
    signatureStatus: "signed",
    relatedChildId: childIds.ava || "",
    relatedEnrollmentCaseId: Object.values(store.enrollment?.cases || {}).find((c) => c.stage === "enrolled")?.id || "",
    familyVisibility: true,
    confidentiality: model.CONFIDENTIALITY.FAMILY_VISIBLE,
  }, addFile("signed-enrollment.pdf", "application/pdf", TINY_PDF_BASE64));

  addRecord("immunization", {
    title: "Child immunization document (FAKE)",
    category: "Immunization and Health",
    status: model.RECORD_STATUSES.APPROVED,
    relatedChildId: childIds.ava || "",
    confidentiality: model.CONFIDENTIALITY.MEDICAL_RESTRICTED,
    effectiveDate: "2026-01-01",
    reviewDate: "2026-07-01",
  }, addFile("immunization.pdf", "application/pdf", TINY_PDF_BASE64));

  addRecord("expiring_health", {
    title: "Expiring health document (FAKE)",
    category: "Immunization and Health",
    status: model.RECORD_STATUSES.APPROVED,
    relatedChildId: childIds.ben || "",
    expirationDate: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10),
    confidentiality: model.CONFIDENTIALITY.MEDICAL_RESTRICTED,
  }, addFile("health.jpg", "image/jpeg", TINY_PNG_BASE64));

  addRecord("expired_cpr", {
    title: "Expired staff CPR (FAKE)",
    category: "Staff Training and Certifications",
    status: model.RECORD_STATUSES.EXPIRED,
    relatedStaffId: staff.id || "staff_fixture",
    expirationDate: "2025-12-01",
    confidentiality: model.CONFIDENTIALITY.PERSONNEL_RESTRICTED,
  }, addFile("cpr.pdf", "application/pdf", TINY_PDF_BASE64));

  addRecord("custody_restricted", {
    title: "Restricted custody record (FAKE)",
    category: "Custody and Authorized Pickup",
    status: model.RECORD_STATUSES.APPROVED,
    relatedChildId: childIds.elena || childIds.ava || "",
    confidentiality: model.CONFIDENTIALITY.CUSTODY_RESTRICTED,
    internalNotes: "INTERNAL custody note — never family visible",
    familyVisibility: false,
  }, addFile("custody.pdf", "application/pdf", TINY_PDF_BASE64));

  addRecord("classroom_drill", {
    title: "Classroom emergency drill (FAKE)",
    category: "Facility and Safety",
    status: model.RECORD_STATUSES.APPROVED,
    relatedClassroomId: classroom.id || "",
    recordType: "facility",
  }, addFile("drill.pdf", "application/pdf", TINY_PDF_BASE64));

  addRecord("program_policy", {
    title: "Program policy (FAKE)",
    category: "Policies and Agreements",
    status: model.RECORD_STATUSES.APPROVED,
    familyVisibility: true,
    confidentiality: model.CONFIDENTIALITY.FAMILY_VISIBLE,
  }, addFile("policy.pdf", "application/pdf", TINY_PDF_BASE64));

  addRecord("family_upload_pending", {
    title: "Family-uploaded document awaiting review (FAKE)",
    category: "Family Communication",
    status: model.RECORD_STATUSES.NEEDS_REVIEW,
    relatedChildId: childIds.ava || "",
    relatedGuardianId: contactIds.priya || "",
    source: "family_upload",
    familyVisibility: true,
    confidentiality: model.CONFIDENTIALITY.FAMILY_VISIBLE,
    approvalStatus: "pending",
  }, addFile("family-upload.png", "image/png", TINY_PNG_BASE64));

  const oldVersion = addRecord("superseded_old", {
    title: "Health form v1 (FAKE superseded)",
    category: "Immunization and Health",
    status: model.RECORD_STATUSES.SUPERSEDED,
    relatedChildId: childIds.ben || "",
    version: 1,
  }, addFile("health-v1.pdf", "application/pdf", TINY_PDF_BASE64));

  const newVersion = addRecord("superseded_new", {
    title: "Health form v2 (FAKE replacement)",
    category: "Immunization and Health",
    status: model.RECORD_STATUSES.APPROVED,
    relatedChildId: childIds.ben || "",
    version: 2,
    previousVersionId: oldVersion.id,
  }, addFile("health-v2.pdf", "application/pdf", TINY_PDF_BASE64));
  oldVersion.supersededById = newVersion.id;

  addRecord("archived", {
    title: "Archived record (FAKE)",
    category: "Other",
    status: model.RECORD_STATUSES.ARCHIVED,
    archiveStatus: true,
    relatedChildId: childIds.carlos || "",
  }, addFile("archived.pdf", "application/pdf", TINY_PDF_BASE64));

  if (conv) {
    addRecord("message_thread_ref", {
      title: `Communication archive ref: ${conv.subject}`,
      category: "Family Communication",
      status: model.RECORD_STATUSES.APPROVED,
      relatedConversationId: conv.id,
      relatedChildId: (conv.childIds || [])[0] || childIds.ava || "",
      source: "communication_archive_ref",
      recordType: "communication_reference",
      familyVisibility: true,
      confidentiality: model.CONFIDENTIALITY.FAMILY_VISIBLE,
      description: "Secure reference to Phase 11 authoritative conversation — not a duplicate message copy.",
    });
  }

  // Duplicate-warning example: same checksum as unfiled
  const dupFile = model.createFileRecord({
    organizationId: orgId,
    fileName: "possible-duplicate.pdf",
    mimeType: "application/pdf",
    contentBase64: TINY_PDF_BASE64,
    byteSize: Buffer.from(TINY_PDF_BASE64, "base64").length,
    uploadedByEmail: adminEmail,
  });
  store.recordsCenter.files[dupFile.id] = dupFile;
  addRecord("duplicate_warning", {
    title: "Duplicate-warning example (FAKE)",
    category: "Other",
    status: model.RECORD_STATUSES.UNFILED,
    source: "upload",
    description: `Checksum matches another file (${unfiledFile.checksum.slice(0, 12)}…)`,
  }, dupFile);

  // Reminder events stored but not sent externally
  const reminder = {
    id: model.newId("rcrem"),
    organizationId: orgId,
    recordId: recordIds.expiring_health,
    kind: "expiring_soon",
    sendExternally: false,
    createdAt: model.nowIso(),
  };
  store.recordsCenter.reminderEvents[reminder.id] = reminder;

  store.recordsCenter.meta.phase13SeededFor = orgId;
  store.recordsCenter.meta.phase13RecordIds = recordIds;
  store.recordsCenter.meta.phase13ChildIds = childIds;
  store.recordsCenter.meta.phase13ContactIds = contactIds;
  store.recordsCenter.meta.updatedAt = model.nowIso();

  return { organizationId: orgId, alreadySeeded: false, recordIds, childIds, contactIds };
}

function resetPhase13Preview(store, opts = {}) {
  model.ensureRecordsStore(store);
  store.recordsCenter.records = {};
  store.recordsCenter.files = {};
  store.recordsCenter.audit = {};
  store.recordsCenter.reminderEvents = {};
  if (store.recordsCenter.meta) {
    delete store.recordsCenter.meta.phase13SeededFor;
    delete store.recordsCenter.meta.phase13RecordIds;
    delete store.recordsCenter.meta.phase13ChildIds;
    delete store.recordsCenter.meta.phase13ContactIds;
  }
  return ensurePhase13Preview(store, opts);
}

module.exports = {
  ensurePhase13Preview,
  resetPhase13Preview,
  TINY_PDF_BASE64,
  TINY_PNG_BASE64,
};
