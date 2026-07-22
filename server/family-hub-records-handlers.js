/**
 * Phase 13 Family Hub records handlers — family-visible records only.
 * Never expose internalNotes, staff/personnel, other households, or custody-restricted records.
 */

const recordsModel = require("../scripts/records-center-data-model.js");
const recordsFixtures = require("../scripts/records-center-fixtures.js");

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

function createFamilyHubRecordsHandlers({
  familyModel,
  hub,
  withGuardian,
  deny,
  readJson,
  writeStore,
  jsonResponse,
  TESTING_BANNER,
}) {
  function guardianChildIds(actor, children) {
    return new Set((children || []).map((c) => c.childId).filter(Boolean));
  }

  function assertDigitalOrVisibleRecords(store, actor, response) {
    const rules = listValues(store.familyFoundation?.accessRules || {}).filter((r) => (
      r.contactId === actor.contact.id && r.status === "active"
    ));
    const anyDigital = rules.some((rule) => familyModel.evaluateContactChildAccess({
      store,
      organizationId: actor.organizationId,
      contactId: actor.contact.id,
      childId: rule.childId,
      capability: "digital",
    }).allowed);
    if (anyDigital) return true;

    // Pickup-only / no digital: allow only if family-visible records already exist for their children.
    const childIds = new Set(rules.map((r) => r.childId));
    recordsModel.ensureRecordsStore(store);
    const visible = listValues(store.recordsCenter.records).some((row) => (
      row.organizationId === actor.organizationId
      && row.familyVisibility === true
      && childIds.has(row.relatedChildId)
      && row.confidentiality !== recordsModel.CONFIDENTIALITY.CUSTODY_RESTRICTED
      && row.confidentiality !== recordsModel.CONFIDENTIALITY.PERSONNEL_RESTRICTED
      && row.category !== "Staff Records"
      && row.category !== "Staff Training and Certifications"
    ));
    if (!visible) {
      deny(response, 403, "records_denied", hub.RESTRICTED_UNAVAILABLE_MESSAGE);
      return false;
    }
    return true;
  }

  function familyVisibleForGuardian(store, actor, childIds) {
    recordsModel.ensureRecordsStore(store);
    recordsFixtures.ensurePhase13Preview(store, { organizationId: actor.organizationId });
    return listValues(store.recordsCenter.records)
      .filter((row) => row.organizationId === actor.organizationId)
      .filter((row) => row.familyVisibility === true)
      .filter((row) => childIds.has(row.relatedChildId) || (!row.relatedChildId && row.confidentiality === recordsModel.CONFIDENTIALITY.FAMILY_VISIBLE && row.category === "Policies and Agreements"))
      .filter((row) => row.confidentiality !== recordsModel.CONFIDENTIALITY.CUSTODY_RESTRICTED)
      .filter((row) => row.confidentiality !== recordsModel.CONFIDENTIALITY.PERSONNEL_RESTRICTED)
      .filter((row) => row.confidentiality !== recordsModel.CONFIDENTIALITY.MEDICAL_RESTRICTED || row.familyVisibility === true)
      .filter((row) => !row.relatedStaffId)
      .filter((row) => row.category !== "Staff Records" && row.category !== "Staff Training and Certifications")
      .map((row) => recordsModel.familySafeRecord(row))
      .filter(Boolean)
      .sort((a, b) => String(b.expirationDate || b.effectiveDate || "").localeCompare(String(a.expirationDate || a.effectiveDate || "")));
  }

  async function handleRecordsList(request, response, url) {
    const childId = url?.searchParams?.get("childId") || "";
    const ctx = withGuardian(request, response, { capability: "digital", childId });
    if (!ctx) return;
    const { store, actor, children, selectedChildId } = ctx;
    if (!assertDigitalOrVisibleRecords(store, actor, response)) return;
    const childIds = guardianChildIds(actor, children);
    let records = familyVisibleForGuardian(store, actor, childIds);
    const filterChild = childId || selectedChildId;
    if (filterChild) {
      records = records.filter((r) => !r.relatedChildId || r.relatedChildId === filterChild);
    }
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      testingBanner: TESTING_BANNER,
      phase: 13,
      records,
      selectedChildId: filterChild || "",
      children,
      note: "Family-visible records for your children only. Internal notes and staff records are never shown.",
    });
  }

  async function handleRecordDetail(request, response, recordId) {
    const ctx = withGuardian(request, response, { capability: "digital" });
    if (!ctx) return;
    const { store, actor, children } = ctx;
    if (!assertDigitalOrVisibleRecords(store, actor, response)) return;
    recordsModel.ensureRecordsStore(store);
    recordsFixtures.ensurePhase13Preview(store, { organizationId: actor.organizationId });
    const row = store.recordsCenter.records[recordId];
    if (!row || row.organizationId !== actor.organizationId) {
      return deny(response, 404, "not_found", hub.RESTRICTED_UNAVAILABLE_MESSAGE);
    }
    const childIds = guardianChildIds(actor, children);
    const allowed = familyVisibleForGuardian(store, actor, childIds).some((r) => r.id === recordId);
    if (!allowed) {
      return deny(response, 403, "wrong_household", hub.RESTRICTED_UNAVAILABLE_MESSAGE);
    }
    const safe = recordsModel.familySafeRecord(row);
    // Explicitly omit: internalNotes, confidentiality beyond family_visible, personnel, other households
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      testingBanner: TESTING_BANNER,
      record: safe,
    });
  }

  async function handleUpload(request, response) {
    const body = await readJson(request).catch(() => ({}));
    const childId = String(body.childId || "").trim();
    const ctx = withGuardian(request, response, { capability: "digital", childId });
    if (!ctx) return;
    const { store, actor, children } = ctx;
    if (!assertDigitalOrVisibleRecords(store, actor, response)) return;
    const childIds = guardianChildIds(actor, children);
    if (!childId || !childIds.has(childId)) {
      return deny(response, 403, "child_access_denied", hub.RESTRICTED_UNAVAILABLE_MESSAGE);
    }

    recordsModel.ensureRecordsStore(store);
    const contentBase64 = body.contentBase64 || Buffer.from("%PDF-1.4 FAKE family upload", "utf8").toString("base64");
    const validation = recordsModel.validateFileUpload({
      mimeType: body.mimeType || "application/pdf",
      fileName: body.fileName || "family-document.pdf",
      byteSize: body.byteSize,
      contentBase64,
    });
    if (!validation.ok) {
      return deny(response, 400, validation.error, "Invalid upload.");
    }

    let file;
    try {
      file = recordsModel.createFileRecord({
        organizationId: actor.organizationId,
        fileName: body.fileName || "family-document.pdf",
        mimeType: body.mimeType || "application/pdf",
        contentBase64,
        byteSize: body.byteSize,
        uploadedByEmail: actor.contact.email,
      });
    } catch (err) {
      return deny(response, 400, err.message || "upload_failed");
    }
    file.publicUrl = null;
    store.recordsCenter.files[file.id] = file;

    // Never auto-approved — always needs_review + familyVisibility
    const record = recordsModel.createRecord({
      organizationId: actor.organizationId,
      title: body.title || body.fileName || "Family-uploaded document",
      category: body.category || "Family Communication",
      status: recordsModel.RECORD_STATUSES.NEEDS_REVIEW,
      approvalStatus: "pending",
      relatedChildId: childId,
      relatedGuardianId: actor.contact.id,
      source: "family_upload",
      familyVisibility: true,
      confidentiality: recordsModel.CONFIDENTIALITY.FAMILY_VISIBLE,
      createdByEmail: actor.contact.email,
      fileIds: [file.id],
      description: recordsModel.cleanText(body.description || "", 500),
    });
    store.recordsCenter.records[record.id] = record;
    recordsModel.createAudit(store, {
      organizationId: actor.organizationId,
      recordId: record.id,
      action: "family_upload",
      actorEmail: actor.contact.email,
      actorRole: "guardian",
      detail: "Family upload — needs_review, never auto-approved",
    });
    writeStore(store);
    jsonResponse(response, 201, {
      ok: true,
      testingBanner: TESTING_BANNER,
      record: recordsModel.familySafeRecord(record),
      autoApproved: false,
      needsReview: true,
      publicUrl: null,
      note: "Upload received for provider review. It is not auto-approved.",
    });
  }

  return {
    handleRecordsList,
    handleRecordDetail,
    handleUpload,
  };
}

module.exports = {
  createFamilyHubRecordsHandlers,
};
