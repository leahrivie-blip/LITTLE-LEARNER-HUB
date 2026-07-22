/**
 * Phase 9 Family Hub fixtures — fake documents, calendar events, and
 * change-request samples on top of Phase 8 households/guardians + Phase 6 forms.
 */

const phase8 = require("./family-foundation-fixtures.js");
const familyModel = require("./family-foundation-data-model.js");
const hub = require("./family-hub-data-model.js");
const foundation = require("./foundation-data-model.js");

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

function ensurePhase9Preview(store, { adminEmail = "phase9.owner@example.invalid", organizationId = "" } = {}) {
  foundation.ensureFoundationStore(store);
  hub.ensureFamilyHubStore(store);
  const seeded8 = phase8.ensurePhase8Preview(store, { adminEmail, organizationId });
  const orgId = seeded8.organizationId || organizationId;

  if (store.familyHub.meta?.phase9SeededFor === orgId) {
    return {
      organizationId: orgId,
      alreadySeeded: true,
      contactIds: seeded8.contactIds,
      childIds: seeded8.childIds,
    };
  }

  const childIds = seeded8.childIds || {};
  const contactIds = seeded8.contactIds || {};
  const ava = childIds.ava;
  const ben = childIds.ben;
  const dana = childIds.dana;
  const elena = childIds.elena;
  const classroom = listValues(store.classrooms).find((row) => row.organizationId === orgId && /Sunshine/i.test(row.name || ""))
    || listValues(store.classrooms).find((row) => row.organizationId === orgId);

  // Family-visible documents
  const docs = [
    hub.createFamilyDocumentRecord({
      organizationId: orgId, childId: ava, title: "Enrollment Welcome Packet (Fixture)",
      category: "enrollment", status: hub.DOCUMENT_STATUSES.FAMILY_VISIBLE,
      approvedAt: hub.nowIso(), familyVisible: true,
    }),
    hub.createFamilyDocumentRecord({
      organizationId: orgId, childId: ava, title: "Immunization Summary Request (Fixture)",
      category: "health", status: hub.DOCUMENT_STATUSES.UPLOAD_REQUESTED,
      familyVisible: true, downloadAuthorized: false,
    }),
    hub.createFamilyDocumentRecord({
      organizationId: orgId, childId: dana, title: "Internal Staff Note (NOT family-visible)",
      category: "internal", status: "internal", familyVisible: false, downloadAuthorized: false,
    }),
    hub.createFamilyDocumentRecord({
      organizationId: orgId, childId: ben, title: "Allergy Action Plan (Fixture)",
      category: "health", status: hub.DOCUMENT_STATUSES.FAMILY_VISIBLE,
      approvedAt: hub.nowIso(), familyVisible: true,
    }),
  ];
  docs.forEach((doc) => { store.familyHub.documents[doc.id] = doc; });

  // Pending upload awaiting review (does not auto-approve)
  const pendingUpload = hub.createFamilyDocumentRecord({
    organizationId: orgId, childId: ava, title: "Uploaded Birth Certificate (Fixture)",
    category: "enrollment", status: hub.DOCUMENT_STATUSES.PENDING_REVIEW,
    familyVisible: true, uploadedByContactId: contactIds.priya || "",
    downloadAuthorized: false, approvedAt: "",
  });
  pendingUpload.officialRecord = false;
  store.familyHub.documents[pendingUpload.id] = pendingUpload;

  // Calendar events (family-visible only)
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const events = [
    hub.createFamilyCalendarEventRecord({
      organizationId: orgId, classroomId: classroom?.id || "", childId: "",
      title: "Program Closure — Staff Development (Fixture)", eventType: "closure",
      startsAt: nextWeek, allDay: true, familyVisible: true,
    }),
    hub.createFamilyCalendarEventRecord({
      organizationId: orgId, classroomId: classroom?.id || "", childId: ava,
      title: "Classroom Field Trip Permission Due (Fixture)", eventType: "form_deadline",
      startsAt: nextWeek, familyVisible: true,
    }),
    hub.createFamilyCalendarEventRecord({
      organizationId: orgId, classroomId: classroom?.id || "", childId: "",
      title: "Sunshine Room Theme: Ocean Friends", eventType: "theme",
      startsAt: nextMonth, familyVisible: true, sharedThemeTitle: "Ocean Friends",
    }),
    hub.createFamilyCalendarEventRecord({
      organizationId: orgId, classroomId: classroom?.id || "", childId: "",
      title: "Internal Staff Planning (NOT family-visible)", eventType: "staff_note",
      startsAt: nextWeek, familyVisible: false,
    }),
  ];
  events.forEach((evt) => { store.familyHub.calendarEvents[evt.id] = evt; });

  // Pending change request sample for Priya
  if (contactIds.priya && ava) {
    const change = hub.createChangeRequestRecord({
      organizationId: orgId,
      contactId: contactIds.priya,
      childId: ava,
      type: hub.CHANGE_REQUEST_TYPES.CONTACT_INFO,
      payload: { phone: "(555) 010-8999", note: "Fixture pending phone update — requires provider approval." },
      createdByEmail: "priya.lin@example.invalid",
    });
    store.familyHub.changeRequests[change.id] = change;
  }

  // Notification preference structure for Priya (nothing sent)
  if (contactIds.priya) {
    const prefs = hub.defaultNotificationPreferences({
      contactId: contactIds.priya,
      organizationId: orgId,
    });
    store.familyHub.notificationPreferences[prefs.id] = prefs;
  }

  // Enrich child records with family-safe summary fields for Phase 9 UI
  [ava, ben, dana, elena, childIds.carlos].filter(Boolean).forEach((childId) => {
    const child = store.childRecords[childId];
    if (!child) return;
    child.familySummary = child.familySummary && typeof child.familySummary === "object" ? child.familySummary : {
      classroomName: classroom?.name || "Sunshine Room",
      programName: store.organizations?.[orgId]?.name || "Phase 8 Preview Program",
      allergySummaryFamilyVisible: childId === ben ? "Peanut allergy — epi-pen on file (fixture)." : "",
      emergencySummary: "Emergency contacts on file with the program (fixture).",
      authorizedPickupSummary: "Authorized pickup contacts are managed by the program (fixture).",
      profileInitial: String(child.displayName || "?").slice(0, 1).toUpperCase(),
    };
    store.childRecords[childId] = child;
  });

  store.familyHub.meta.phase9SeededFor = orgId;
  store.familyHub.meta.updatedAt = hub.nowIso();

  return {
    organizationId: orgId,
    alreadySeeded: false,
    contactIds,
    childIds,
    documentCount: listValues(store.familyHub.documents).filter((row) => row.organizationId === orgId).length,
    eventCount: listValues(store.familyHub.calendarEvents).filter((row) => row.organizationId === orgId && row.familyVisible).length,
  };
}

function resetPhase9Preview(store, { organizationId = "" } = {}) {
  hub.ensureFamilyHubStore(store);
  if (!organizationId) {
    store.familyHub = {};
    hub.ensureFamilyHubStore(store);
    phase8.resetPhase8Preview(store, {});
    return { reset: true, scope: "all" };
  }
  ["documents", "changeRequests", "notificationPreferences", "calendarEvents"].forEach((key) => {
    Object.keys(store.familyHub[key] || {}).forEach((id) => {
      if (store.familyHub[key][id]?.organizationId === organizationId) delete store.familyHub[key][id];
    });
  });
  if (store.familyHub.meta?.phase9SeededFor === organizationId) delete store.familyHub.meta.phase9SeededFor;
  phase8.resetPhase8Preview(store, { organizationId });
  return { reset: true, scope: organizationId };
}

module.exports = {
  ensurePhase9Preview,
  resetPhase9Preview,
};
