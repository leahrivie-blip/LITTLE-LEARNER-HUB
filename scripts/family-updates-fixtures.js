/**
 * Phase 10 fixtures — fake family updates, Daily Report shares, media consents,
 * placeholder media, shared observations/goals on Phase 8/9 foundation.
 */

const phase9 = require("./family-hub-fixtures.js");
const foundation = require("./foundation-data-model.js");
const model = require("./family-updates-data-model.js");

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

/** Tiny 1x1 PNG (fake placeholder bytes) */
const TINY_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function ensurePhase10Preview(store, { adminEmail = "phase10.owner@example.invalid", organizationId = "" } = {}) {
  foundation.ensurePhase3Store(store);
  model.ensureFamilyUpdatesStore(store);
  const seeded9 = phase9.ensurePhase9Preview(store, { adminEmail, organizationId });
  const orgId = seeded9.organizationId || organizationId;

  if (store.familyUpdates.meta?.phase10SeededFor === orgId) {
    return {
      organizationId: orgId,
      alreadySeeded: true,
      contactIds: seeded9.contactIds,
      childIds: seeded9.childIds,
    };
  }

  const childIds = seeded9.childIds || {};
  const contactIds = seeded9.contactIds || {};
  const ava = childIds.ava;
  const ben = childIds.ben;
  const dana = childIds.dana;
  const classroom = listValues(store.classrooms).find((row) => row.organizationId === orgId && /Sunshine/i.test(row.name || ""))
    || listValues(store.classrooms).find((row) => row.organizationId === orgId);
  const classroomId = classroom?.id || "";
  const staff = listValues(store.staffMemberships).find((row) => row.organizationId === orgId && row.role === foundation.STAFF_ROLES.LEAD_TEACHER)
    || listValues(store.staffMemberships).find((row) => row.organizationId === orgId);

  model.getSharingConfig(store, orgId);

  // Media consents: Ava/Ben shareable; Dana internal-only (denied family media)
  if (ava) {
    const c = model.createMediaConsentRecord({
      organizationId: orgId, childId: ava,
      scope: model.CONSENT_SCOPES.SHARE_VERIFIED_GUARDIANS,
      downloadAllowed: true, viewOnly: false,
      consentDocumentReference: "fixture-consent-ava-media",
      enteredByEmail: adminEmail,
    });
    store.familyUpdates.consents[c.id] = c;
  }
  if (ben) {
    const c = model.createMediaConsentRecord({
      organizationId: orgId, childId: ben,
      scope: model.CONSENT_SCOPES.CLASSROOM_GROUP,
      downloadAllowed: false, viewOnly: true,
      consentDocumentReference: "fixture-consent-ben-media",
      enteredByEmail: adminEmail,
    });
    store.familyUpdates.consents[c.id] = c;
  }
  if (dana) {
    const c = model.createMediaConsentRecord({
      organizationId: orgId, childId: dana,
      scope: model.CONSENT_SCOPES.INTERNAL_ONLY,
      downloadAllowed: false,
      consentDocumentReference: "fixture-consent-dana-internal",
      enteredByEmail: adminEmail,
    });
    store.familyUpdates.consents[c.id] = c;
  }

  // Daily logs (authoritative Phase 3) + family shares
  const today = model.nowIso().slice(0, 10);
  const logAva = foundation.createPreviewDailyLogRecord({
    organizationId: orgId, classroomId, childId: ava,
    staffMembershipId: staff?.id || "", date: today,
    arrival: "8:05 AM", departure: "", meals: "Ate most of lunch",
    snacks: "Apple slices", bottles: "", naps: "Nap 12:30–1:45",
    diapers: "", potty: "Independent", mood: "Happy",
    activities: "Ocean sensory bin", outdoorPlay: "Playground 20 min",
    teacherNotes: "Great day exploring ocean theme.", suppliesNeeded: "Extra socks",
  });
  store.previewDailyLogs[logAva.id] = logAva;
  const shareAva = model.createDailyReportShareRecord({
    organizationId: orgId, dailyLogId: logAva.id, childId: ava,
    visibility: model.VISIBILITY.FAMILY_VISIBLE, sharedAt: model.nowIso(),
  });
  store.familyUpdates.dailyReportShares[shareAva.id] = shareAva;

  const logBen = foundation.createPreviewDailyLogRecord({
    organizationId: orgId, classroomId, childId: ben,
    staffMembershipId: staff?.id || "", date: today,
    arrival: "8:20 AM", meals: "Lunch finished", snacks: "Crackers",
    naps: "Short rest", mood: "Calm", activities: "Block building",
    teacherNotes: "Private peer note — family never sees sibling details.",
  });
  store.previewDailyLogs[logBen.id] = logBen;
  const shareBen = model.createDailyReportShareRecord({
    organizationId: orgId, dailyLogId: logBen.id, childId: ben,
    visibility: model.VISIBILITY.FAMILY_VISIBLE, sharedAt: model.nowIso(),
  });
  store.familyUpdates.dailyReportShares[shareBen.id] = shareBen;

  // Internal-only daily log (not shared)
  const logInternal = foundation.createPreviewDailyLogRecord({
    organizationId: orgId, classroomId, childId: dana,
    staffMembershipId: staff?.id || "", date: today,
    teacherNotes: "Internal only — not family visible.",
    meals: "Confidential meal note",
  });
  store.previewDailyLogs[logInternal.id] = logInternal;
  const shareInternal = model.createDailyReportShareRecord({
    organizationId: orgId, dailyLogId: logInternal.id, childId: dana,
    visibility: model.VISIBILITY.PRIVATE_INTERNAL,
  });
  store.familyUpdates.dailyReportShares[shareInternal.id] = shareInternal;

  // Observations + shares
  const obsShared = foundation.createPreviewObservationRecord({
    organizationId: orgId, classroomId, childId: ava,
    staffMembershipId: staff?.id || "",
    text: "Ava sorted shells by size during ocean theme (fixture).",
    learningDomains: ["Cognitive Development"],
    sharingStatus: "shared_with_family",
  });
  obsShared.familyShareEnabled = true;
  obsShared.familyShareNote = "Shared via Phase 10 provider controls.";
  store.previewObservations[obsShared.id] = obsShared;
  const obsShare = model.createObservationShareRecord({
    organizationId: orgId, observationId: obsShared.id, childId: ava,
    visibility: model.VISIBILITY.FAMILY_VISIBLE, sharedAt: model.nowIso(),
  });
  store.familyUpdates.observationShares[obsShare.id] = obsShare;

  const obsPrivate = foundation.createPreviewObservationRecord({
    organizationId: orgId, classroomId, childId: ava,
    staffMembershipId: staff?.id || "",
    text: "Internal staff observation — families must never see this.",
    learningDomains: ["Social-Emotional Development"],
  });
  store.previewObservations[obsPrivate.id] = obsPrivate;
  const obsPrivShare = model.createObservationShareRecord({
    organizationId: orgId, observationId: obsPrivate.id, childId: ava,
    visibility: model.VISIBILITY.PRIVATE_INTERNAL,
  });
  store.familyUpdates.observationShares[obsPrivShare.id] = obsPrivShare;

  // Goals
  const goalShared = foundation.createPreviewGoalRecord({
    organizationId: orgId, classroomId, childId: ava,
    createdByMembershipId: staff?.id || "",
    learningDomain: "Language and Literacy",
    description: "Practice letter A sounds during circle (fixture).",
    targetOrNextStep: "Identify A in her name",
  });
  store.previewGoals[goalShared.id] = goalShared;
  const goalShare = model.createGoalShareRecord({
    organizationId: orgId, goalId: goalShared.id, childId: ava,
    visibility: model.VISIBILITY.FAMILY_VISIBLE, sharedAt: model.nowIso(),
  });
  store.familyUpdates.goalShares[goalShare.id] = goalShare;

  // Media placeholders
  const photoAva = model.createMediaRecord({
    organizationId: orgId, kind: model.MEDIA_KINDS.PHOTO,
    caption: "Ocean sensory bin (fixture placeholder)",
    taggedChildIds: [ava].filter(Boolean),
    classroomId, uploadedByEmail: staff?.userEmail || adminEmail,
    uploadedByMembershipId: staff?.id || "",
    status: model.MEDIA_STATUSES.FAMILY_VISIBLE,
    familyVisibility: model.VISIBILITY.FAMILY_VISIBLE,
    downloadPermission: true,
    mimeType: "image/png", byteSize: 68,
    fileName: "fixture-ava-ocean.png",
    contentBase64: TINY_PNG_BASE64,
    sharedAt: model.nowIso(), approvedAt: model.nowIso(),
  });
  store.familyUpdates.media[photoAva.id] = photoAva;

  const photoGroup = model.createMediaRecord({
    organizationId: orgId, kind: model.MEDIA_KINDS.PHOTO,
    caption: "Group table time (Ava + Dana tagged — Dana has no share consent)",
    taggedChildIds: [ava, dana].filter(Boolean),
    classroomId, uploadedByEmail: staff?.userEmail || adminEmail,
    status: model.MEDIA_STATUSES.FAMILY_VISIBLE,
    familyVisibility: model.VISIBILITY.FAMILY_VISIBLE,
    downloadPermission: false,
    mimeType: "image/png", byteSize: 68,
    fileName: "fixture-group.png",
    contentBase64: TINY_PNG_BASE64,
    sharedAt: model.nowIso(), approvedAt: model.nowIso(),
  });
  store.familyUpdates.media[photoGroup.id] = photoGroup;

  const photoPrivate = model.createMediaRecord({
    organizationId: orgId, kind: model.MEDIA_KINDS.PHOTO,
    caption: "Internal documentation only",
    taggedChildIds: [ava].filter(Boolean),
    classroomId,
    status: model.MEDIA_STATUSES.APPROVED,
    familyVisibility: model.VISIBILITY.PRIVATE_INTERNAL,
    mimeType: "image/png", byteSize: 68,
    fileName: "fixture-internal.png",
    contentBase64: TINY_PNG_BASE64,
  });
  store.familyUpdates.media[photoPrivate.id] = photoPrivate;

  const videoMeta = model.createMediaRecord({
    organizationId: orgId, kind: model.MEDIA_KINDS.SHORT_VIDEO,
    caption: "Short video metadata foundation (no real footage)",
    taggedChildIds: [ben].filter(Boolean),
    classroomId,
    status: model.MEDIA_STATUSES.PENDING_REVIEW,
    familyVisibility: model.VISIBILITY.PRIVATE_INTERNAL,
    mimeType: "video/mp4", byteSize: 1024,
    fileName: "fixture-short.mp4",
    contentBase64: "",
  });
  store.familyUpdates.media[videoMeta.id] = videoMeta;

  // Family updates
  const individual = model.createFamilyUpdateRecord({
    organizationId: orgId, scope: model.UPDATE_SCOPES.INDIVIDUAL,
    status: model.UPDATE_STATUSES.SHARED,
    title: "Ava’s ocean morning",
    message: "Ava enjoyed the ocean sensory bin and practiced letter sounds.",
    childIds: [ava].filter(Boolean), classroomId,
    activities: "Ocean sensory", meals: "Lunch — good appetite", mood: "Curious",
    suppliesNeeded: "Extra socks",
    mediaIds: [photoAva.id],
    linkedDailyLogId: logAva.id,
    linkedObservationId: obsShared.id,
    linkedGoalId: goalShared.id,
    internalNote: "Director: follow up on sock reminder — NEVER show to family.",
    createdByEmail: staff?.userEmail || adminEmail,
    createdByMembershipId: staff?.id || "",
    sharedAt: model.nowIso(), approvedAt: model.nowIso(),
  });
  store.familyUpdates.updates[individual.id] = individual;

  const groupUpdate = model.createFamilyUpdateRecord({
    organizationId: orgId, scope: model.UPDATE_SCOPES.SELECTED_CHILDREN,
    status: model.UPDATE_STATUSES.SHARED,
    title: "Sibling afternoon check-in",
    message: "Both children had a calm afternoon rest.",
    childIds: [ava, ben].filter(Boolean), classroomId,
    nap: "Rest time completed",
    internalNote: "Group entry — each family only sees their child tags.",
    createdByEmail: staff?.userEmail || adminEmail,
    sharedAt: model.nowIso(), approvedAt: model.nowIso(),
  });
  store.familyUpdates.updates[groupUpdate.id] = groupUpdate;

  const classroomUpdate = model.createFamilyUpdateRecord({
    organizationId: orgId, scope: model.UPDATE_SCOPES.CLASSROOM,
    status: model.UPDATE_STATUSES.SHARED,
    title: "Sunshine Room announcement",
    message: "Remember water bottles for outdoor week.",
    classroomId, childIds: [],
    reminder: "Label water bottles",
    createdByEmail: adminEmail,
    sharedAt: model.nowIso(), approvedAt: model.nowIso(),
  });
  store.familyUpdates.updates[classroomUpdate.id] = classroomUpdate;

  const draftReview = model.createFamilyUpdateRecord({
    organizationId: orgId, scope: model.UPDATE_SCOPES.INDIVIDUAL,
    status: model.UPDATE_STATUSES.SUBMITTED_FOR_REVIEW,
    title: "Pending director review",
    message: "Draft submitted — not yet family visible.",
    childIds: [ava].filter(Boolean), classroomId,
    internalNote: "Needs director approval before share.",
    createdByEmail: staff?.userEmail || adminEmail,
  });
  store.familyUpdates.updates[draftReview.id] = draftReview;

  const withdrawn = model.createFamilyUpdateRecord({
    organizationId: orgId, scope: model.UPDATE_SCOPES.INDIVIDUAL,
    status: model.UPDATE_STATUSES.WITHDRAWN,
    title: "Withdrawn update",
    message: "This was shared then withdrawn.",
    childIds: [ava].filter(Boolean), classroomId,
    sharedAt: model.nowIso(), withdrawnAt: model.nowIso(),
    createdByEmail: adminEmail,
  });
  store.familyUpdates.updates[withdrawn.id] = withdrawn;

  store.familyUpdates.meta.phase10SeededFor = orgId;
  store.familyUpdates.meta.updatedAt = model.nowIso();

  return {
    organizationId: orgId,
    alreadySeeded: false,
    contactIds,
    childIds,
    updateIds: {
      individual: individual.id,
      group: groupUpdate.id,
      classroom: classroomUpdate.id,
      pendingReview: draftReview.id,
      withdrawn: withdrawn.id,
    },
    mediaIds: {
      photoAva: photoAva.id,
      photoGroup: photoGroup.id,
      photoPrivate: photoPrivate.id,
      videoMeta: videoMeta.id,
    },
    dailyLogIds: { ava: logAva.id, ben: logBen.id, internal: logInternal.id },
  };
}

function resetPhase10Preview(store, { organizationId = "" } = {}) {
  model.ensureFamilyUpdatesStore(store);
  if (!organizationId) {
    store.familyUpdates = {};
    model.ensureFamilyUpdatesStore(store);
    phase9.resetPhase9Preview(store, {});
    return { reset: true, scope: "all" };
  }
  [
    "updates", "media", "consents", "acknowledgments", "concernRequests",
    "dailyReportShares", "observationShares", "goalShares", "sharingConfig", "accessAudit",
  ].forEach((key) => {
    Object.keys(store.familyUpdates[key] || {}).forEach((id) => {
      if (store.familyUpdates[key][id]?.organizationId === organizationId) delete store.familyUpdates[key][id];
    });
  });
  if (store.familyUpdates.meta?.phase10SeededFor === organizationId) delete store.familyUpdates.meta.phase10SeededFor;
  phase9.resetPhase9Preview(store, { organizationId });
  return { reset: true, scope: organizationId };
}

module.exports = {
  ensurePhase10Preview,
  resetPhase10Preview,
  TINY_PNG_BASE64,
};
