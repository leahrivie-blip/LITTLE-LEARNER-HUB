/**
 * Phase 14 Licensing fixtures — fake readiness scenarios only.
 */

const phase13 = require("./records-center-fixtures.js");
const model = require("./licensing-center-data-model.js");

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

function ensurePhase14Preview(store, { adminEmail = "phase14.owner@example.invalid", organizationId = "" } = {}) {
  model.ensureLicensingStore(store);
  const seeded13 = phase13.ensurePhase13Preview(store, { adminEmail, organizationId });
  const orgId = seeded13.organizationId || organizationId;

  if (store.licensingCenter.meta?.phase14SeededFor === orgId) {
    return { organizationId: orgId, alreadySeeded: true, ids: store.licensingCenter.meta.phase14Ids || {} };
  }

  const recordIds = seeded13.recordIds || {};
  const childIds = seeded13.childIds || {};
  const classroom = listValues(store.classrooms).find((r) => r.organizationId === orgId) || {};
  const staff = listValues(store.staffMemberships).find((r) => r.organizationId === orgId) || {};

  const setupCenter = model.createSetup({
    organizationId: orgId,
    stateOrTerritory: "Testing Territory",
    programType: "childcare_center",
    licenseType: "center",
    licenseNumber: "FAKE-CENTER-100",
    licenseIssuedAt: "2024-01-01",
    licenseExpiresAt: new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10),
    agesServed: "6 weeks–5 years",
    licensedCapacity: 48,
    infantCare: true,
    medicationAdministration: true,
    mealsProvided: true,
    transportationOffered: false,
  });
  store.licensingCenter.setups[setupCenter.id] = setupCenter;

  const setupHome = model.createSetup({
    organizationId: orgId,
    stateOrTerritory: "Testing Territory",
    programType: "home_daycare",
    licenseType: "home",
    licenseNumber: "FAKE-HOME-200",
    licenseExpiresAt: "2027-01-01",
    agesServed: "0–5",
    licensedCapacity: 8,
    infantCare: true,
  });
  // Keep home setup as alternate fixture id but primary is center
  store.licensingCenter.setups[setupHome.id] = setupHome;

  const pack = model.createGenericTestingPack(orgId);
  store.licensingCenter.statePacks[pack.id] = pack;

  const ids = { setupCenterId: setupCenter.id, setupHomeId: setupHome.id, packId: pack.id };

  function addReq(key, extra = {}) {
    const template = pack.requirements.find((r) => r.key === key) || { key, title: key, scope: "program", category: "Other", frequency: model.FREQUENCIES.ONE_TIME, plainLanguage: "" };
    const req = model.createRequirement({
      organizationId: orgId,
      packKey: pack.packKey,
      ...template,
      ...extra,
    });
    model.syncRequirementToRecords(store, req);
    store.licensingCenter.requirements[req.id] = req;
    ids[key] = req.id;
    return req;
  }

  addReq("child_immunization", { relatedChildId: childIds.ava || "", connectedRecordId: recordIds.immunization || "", status: model.READINESS.READY });
  addReq("child_immunization_missing", { key: "child_immunization_missing", title: "Immunization missing (FAKE child)", scope: "child", category: "Immunization and Health", relatedChildId: childIds.carlos || "", status: model.READINESS.MISSING });
  addReq("child_exemption", { key: "child_exemption", title: "Immunization exemption document (FAKE)", scope: "child", category: "Immunization and Health", relatedChildId: childIds.ben || "", connectedRecordId: recordIds.superseded_new || "", plainLanguage: "Exemption document reference only — not a medical decision." });
  addReq("expiring_health", { key: "expiring_health", title: "Expiring health record readiness", scope: "child", category: "Immunization and Health", relatedChildId: childIds.ben || "", connectedRecordId: recordIds.expiring_health || "" });
  addReq("staff_cpr", { relatedStaffId: staff.id || "", connectedRecordId: recordIds.expired_cpr || "", status: model.READINESS.EXPIRED });
  addReq("staff_background", { relatedStaffId: staff.id || "", status: model.READINESS.WAITING_UPLOAD, providerNotes: "Background clearance awaiting renewal (fake)." });
  addReq("staff_safe_sleep", { relatedStaffId: staff.id || "", status: model.READINESS.MISSING });
  addReq("facility_drill", { relatedClassroomId: classroom.id || "", status: model.READINESS.EXPIRED, dueDate: "2026-06-01", plainLanguage: "Overdue emergency drill (fake)." });
  addReq("facility_inspection", { connectedRecordId: recordIds.classroom_drill || "", status: model.READINESS.READY });
  addReq("program_license", { connectedRecordId: "", expirationDate: setupCenter.licenseExpiresAt, status: model.READINESS.EXPIRING_SOON });
  addReq("medication_auth", { relatedChildId: childIds.ava || "", status: model.READINESS.WAITING_SIGNATURE });
  addReq("vehicle_record", { key: "vehicle_record", title: "Vehicle record (FAKE)", scope: "facility", category: "Transportation", status: model.READINESS.MISSING });

  // Open + completed corrective actions
  const openCa = model.createCorrectiveAction({
    organizationId: orgId,
    finding: "Emergency drill documentation incomplete (FAKE)",
    sourceAgency: "Testing Licensing Agency",
    inspectionDate: "2026-06-15",
    requirementId: ids.facility_drill,
    description: "Drill log missing for June (fake finding).",
    correctionNeeded: "Complete and file drill record.",
    dueDate: "2026-08-01",
    status: model.CORRECTIVE_STATUSES.OPEN,
    responsibleEmail: adminEmail,
  });
  store.licensingCenter.correctiveActions[openCa.id] = openCa;
  ids.openCorrectiveId = openCa.id;

  const doneCa = model.createCorrectiveAction({
    organizationId: orgId,
    finding: "Policy posting updated (FAKE)",
    inspectionDate: "2026-05-01",
    description: "Completed corrective action fixture.",
    status: model.CORRECTIVE_STATUSES.COMPLETED,
    completionDate: "2026-05-20",
    directorApproved: true,
    finalResolution: "Posted and archived evidence.",
    evidenceRecordIds: [recordIds.program_policy].filter(Boolean),
  });
  store.licensingCenter.correctiveActions[doneCa.id] = doneCa;
  ids.completedCorrectiveId = doneCa.id;

  const packet = model.createInspectionPacket({
    organizationId: orgId,
    inspectionDate: "2026-08-15",
    classroomIds: classroom.id ? [classroom.id] : [],
    childCategories: ["Immunization and Health", "Emergency Information"],
    staffCategories: ["Staff Training and Certifications"],
    facilityCategories: ["Facility and Safety"],
    recordIds: [recordIds.immunization, recordIds.classroom_drill, recordIds.program_policy].filter(Boolean),
    includeIdentifyingInfo: false,
    createdByEmail: adminEmail,
  });
  store.licensingCenter.inspectionPackets[packet.id] = packet;
  ids.packetId = packet.id;

  const access = model.createInspectorAccess({
    organizationId: orgId,
    packetId: packet.id,
    expiresAt: packet.expiresAt,
  });
  store.licensingCenter.inspectorAccess[access.id] = access;
  ids.inspectorAccessId = access.id;

  const revoked = model.createInspectorAccess({
    organizationId: orgId,
    packetId: packet.id,
    expiresAt: packet.expiresAt,
    revoked: true,
  });
  store.licensingCenter.inspectorAccess[revoked.id] = revoked;
  ids.revokedAccessId = revoked.id;

  store.licensingCenter.meta.phase14SeededFor = orgId;
  store.licensingCenter.meta.phase14Ids = ids;
  store.licensingCenter.meta.updatedAt = model.nowIso();

  return { organizationId: orgId, alreadySeeded: false, ids, recordIds, childIds };
}

function resetPhase14Preview(store, opts = {}) {
  model.ensureLicensingStore(store);
  store.licensingCenter.setups = {};
  store.licensingCenter.requirements = {};
  store.licensingCenter.statePacks = {};
  store.licensingCenter.occurrences = {};
  store.licensingCenter.correctiveActions = {};
  store.licensingCenter.inspectionPackets = {};
  store.licensingCenter.inspectorAccess = {};
  store.licensingCenter.audit = {};
  if (store.licensingCenter.meta) {
    delete store.licensingCenter.meta.phase14SeededFor;
    delete store.licensingCenter.meta.phase14Ids;
  }
  return ensurePhase14Preview(store, opts);
}

module.exports = {
  ensurePhase14Preview,
  resetPhase14Preview,
};
