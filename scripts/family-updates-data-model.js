/**
 * Phase 10 — Family updates, Daily Reports sharing, media/consent foundation.
 * Fake/testing data only. No public media URLs. No email/SMS/push/Stripe/live AI.
 * Family Hub surfaces secure references to authoritative Phase 3 records.
 */

const crypto = require("node:crypto");
const familyModel = require("./family-foundation-data-model.js");
const foundation = require("./foundation-data-model.js");
const hub = require("./family-hub-data-model.js");

const UPDATE_STATUSES = Object.freeze({
  DRAFT: "draft",
  SUBMITTED_FOR_REVIEW: "submitted_for_review",
  APPROVED: "approved",
  SHARED: "shared",
  CORRECTED: "corrected",
  ARCHIVED: "archived",
  WITHDRAWN: "withdrawn",
});

const VISIBILITY = Object.freeze({
  PRIVATE_INTERNAL: "private_internal",
  SUBMITTED_FOR_REVIEW: "submitted_for_review",
  FAMILY_VISIBLE: "family_visible",
  ARCHIVED: "archived",
  WITHDRAWN: "withdrawn",
});

const UPDATE_SCOPES = Object.freeze({
  INDIVIDUAL: "individual",
  SELECTED_CHILDREN: "selected_children",
  CLASSROOM: "classroom",
  PROGRAM: "program",
});

const MEDIA_KINDS = Object.freeze({
  PHOTO: "photo",
  SHORT_VIDEO: "short_video",
});

const MEDIA_STATUSES = Object.freeze({
  PENDING_REVIEW: "pending_review",
  APPROVED: "approved",
  FAMILY_VISIBLE: "family_visible",
  REJECTED: "rejected",
  WITHDRAWN: "withdrawn",
  ARCHIVED: "archived",
});

const CONSENT_SCOPES = Object.freeze({
  INTERNAL_ONLY: "internal_documentation_only",
  SHARE_VERIFIED_GUARDIANS: "share_with_verified_guardians",
  CLASSROOM_GROUP: "classroom_group_sharing",
  PROGRAM_MARKETING: "program_marketing_record_only",
});

const ALLOWED_MEDIA_MIME = Object.freeze({
  "image/jpeg": { ext: "jpg", kind: MEDIA_KINDS.PHOTO, maxBytes: 2 * 1024 * 1024 },
  "image/png": { ext: "png", kind: MEDIA_KINDS.PHOTO, maxBytes: 2 * 1024 * 1024 },
  "image/webp": { ext: "webp", kind: MEDIA_KINDS.PHOTO, maxBytes: 2 * 1024 * 1024 },
  "video/mp4": { ext: "mp4", kind: MEDIA_KINDS.SHORT_VIDEO, maxBytes: 8 * 1024 * 1024 },
});

const BLOCKED_MEDIA_MIME = new Set([
  "application/javascript",
  "application/x-msdownload",
  "application/x-executable",
  "application/x-sh",
  "text/html",
  "application/octet-stream",
]);

const FAKE_PLACEHOLDER_LABEL = "Testing placeholder media — not a real child photo.";

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

function ensureFamilyUpdatesStore(store) {
  if (!store || typeof store !== "object") throw new Error("store is required");
  hub.ensureFamilyHubStore(store);
  foundation.ensurePhase3Store(store);
  store.familyUpdates = store.familyUpdates && typeof store.familyUpdates === "object" ? store.familyUpdates : {};
  const fu = store.familyUpdates;
  fu.updates = fu.updates && typeof fu.updates === "object" && !Array.isArray(fu.updates) ? fu.updates : {};
  fu.media = fu.media && typeof fu.media === "object" && !Array.isArray(fu.media) ? fu.media : {};
  fu.consents = fu.consents && typeof fu.consents === "object" && !Array.isArray(fu.consents) ? fu.consents : {};
  fu.acknowledgments = fu.acknowledgments && typeof fu.acknowledgments === "object" && !Array.isArray(fu.acknowledgments) ? fu.acknowledgments : {};
  fu.concernRequests = fu.concernRequests && typeof fu.concernRequests === "object" && !Array.isArray(fu.concernRequests) ? fu.concernRequests : {};
  fu.dailyReportShares = fu.dailyReportShares && typeof fu.dailyReportShares === "object" && !Array.isArray(fu.dailyReportShares) ? fu.dailyReportShares : {};
  fu.observationShares = fu.observationShares && typeof fu.observationShares === "object" && !Array.isArray(fu.observationShares) ? fu.observationShares : {};
  fu.goalShares = fu.goalShares && typeof fu.goalShares === "object" && !Array.isArray(fu.goalShares) ? fu.goalShares : {};
  fu.sharingConfig = fu.sharingConfig && typeof fu.sharingConfig === "object" && !Array.isArray(fu.sharingConfig) ? fu.sharingConfig : {};
  fu.accessAudit = fu.accessAudit && typeof fu.accessAudit === "object" && !Array.isArray(fu.accessAudit) ? fu.accessAudit : {};
  fu.meta = {
    ...(fu.meta && typeof fu.meta === "object" ? fu.meta : {}),
    createdAt: fu.meta?.createdAt || nowIso(),
    updatedAt: nowIso(),
    phase: 10,
    noOutboundEmail: true,
    noOutboundSms: true,
    noPush: true,
    noStripe: true,
    noLiveAi: true,
    noPublicMediaUrls: true,
    noProductionMediaStorage: true,
    note: "Phase 10 family updates/media. Fake placeholders only. Messaging deferred to Phase 11.",
  };
  return store;
}

function defaultSharingConfig(organizationId) {
  return {
    id: `sharecfg_${cleanText(organizationId, 80) || "org"}`,
    organizationId: cleanText(organizationId, 160),
    teachersCanShareDirectly: false,
    requireDirectorApproval: true,
    allowAssistantOverrides: true,
    updatedAt: nowIso(),
  };
}

function getSharingConfig(store, organizationId) {
  ensureFamilyUpdatesStore(store);
  const existing = store.familyUpdates.sharingConfig[organizationId];
  if (existing) return existing;
  const cfg = defaultSharingConfig(organizationId);
  store.familyUpdates.sharingConfig[organizationId] = cfg;
  return cfg;
}

function appendHistory(record, entry) {
  const history = Array.isArray(record.history) ? record.history.slice() : [];
  history.push({
    at: nowIso(),
    ...entry,
  });
  record.history = history.slice(-50);
  record.updatedAt = nowIso();
  return record;
}

function createFamilyUpdateRecord(input = {}) {
  const createdAt = nowIso();
  const childIds = Array.isArray(input.childIds)
    ? input.childIds.map((id) => cleanText(id, 160)).filter(Boolean)
    : (input.childId ? [cleanText(input.childId, 160)] : []);
  return {
    id: input.id || newId("fupd"),
    organizationId: cleanText(input.organizationId, 160),
    scope: cleanText(input.scope, 40) || UPDATE_SCOPES.INDIVIDUAL,
    status: cleanText(input.status, 40) || UPDATE_STATUSES.DRAFT,
    title: cleanText(input.title, 200) || "Family update",
    message: cleanLongText(input.message, 4000),
    occurredAt: input.occurredAt || createdAt,
    classroomId: cleanText(input.classroomId, 160),
    childIds,
    activities: cleanText(input.activities, 1000),
    meals: cleanText(input.meals, 500),
    bottles: cleanText(input.bottles, 500),
    snacks: cleanText(input.snacks, 500),
    nap: cleanText(input.nap, 500),
    diaperOrPotty: cleanText(input.diaperOrPotty, 500),
    mood: cleanText(input.mood, 200),
    suppliesNeeded: cleanText(input.suppliesNeeded, 500),
    reminder: cleanText(input.reminder, 500),
    mediaIds: Array.isArray(input.mediaIds) ? input.mediaIds.map((id) => cleanText(id, 160)).filter(Boolean) : [],
    linkedDailyLogId: cleanText(input.linkedDailyLogId, 160),
    linkedObservationId: cleanText(input.linkedObservationId, 160),
    linkedGoalId: cleanText(input.linkedGoalId, 160),
    internalNote: cleanLongText(input.internalNote, 4000),
    createdByMembershipId: cleanText(input.createdByMembershipId, 160),
    createdByEmail: cleanText(input.createdByEmail, 200),
    reviewerMembershipId: cleanText(input.reviewerMembershipId, 160),
    approvedAt: input.approvedAt || "",
    sharedAt: input.sharedAt || "",
    withdrawnAt: input.withdrawnAt || "",
    correctionOfId: cleanText(input.correctionOfId, 160),
    history: Array.isArray(input.history) ? input.history : [{ at: createdAt, action: "created", by: input.createdByEmail || "" }],
    createdAt,
    updatedAt: createdAt,
    preview: true,
  };
}

function createMediaConsentRecord(input = {}) {
  const createdAt = nowIso();
  return {
    id: input.id || newId("mcons"),
    organizationId: cleanText(input.organizationId, 160),
    childId: cleanText(input.childId, 160),
    scope: cleanText(input.scope, 80) || CONSENT_SCOPES.INTERNAL_ONLY,
    downloadAllowed: input.downloadAllowed === true,
    viewOnly: input.viewOnly !== false,
    startsAt: input.startsAt || createdAt.slice(0, 10),
    endsAt: input.endsAt || "",
    withdrawnAt: input.withdrawnAt || "",
    consentDocumentReference: cleanText(input.consentDocumentReference, 200),
    enteredByEmail: cleanText(input.enteredByEmail, 200),
    active: input.active !== false && !input.withdrawnAt,
    createdAt,
    updatedAt: createdAt,
    preview: true,
  };
}

function createMediaRecord(input = {}) {
  const createdAt = nowIso();
  return {
    id: input.id || newId("fmedia"),
    organizationId: cleanText(input.organizationId, 160),
    kind: cleanText(input.kind, 40) || MEDIA_KINDS.PHOTO,
    caption: cleanText(input.caption, 500),
    taggedChildIds: Array.isArray(input.taggedChildIds)
      ? input.taggedChildIds.map((id) => cleanText(id, 160)).filter(Boolean)
      : [],
    classroomId: cleanText(input.classroomId, 160),
    uploadedByMembershipId: cleanText(input.uploadedByMembershipId, 160),
    uploadedByEmail: cleanText(input.uploadedByEmail, 200),
    capturedAt: input.capturedAt || createdAt,
    uploadedAt: input.uploadedAt || createdAt,
    status: cleanText(input.status, 40) || MEDIA_STATUSES.PENDING_REVIEW,
    familyVisibility: cleanText(input.familyVisibility, 40) || VISIBILITY.PRIVATE_INTERNAL,
    downloadPermission: input.downloadPermission === true,
    mimeType: cleanText(input.mimeType, 80),
    byteSize: Number(input.byteSize || 0) || 0,
    fileName: cleanText(input.fileName, 200),
    // Testing-only in-memory placeholder; never a permanent public URL.
    placeholderLabel: cleanText(input.placeholderLabel, 200) || FAKE_PLACEHOLDER_LABEL,
    contentBase64: typeof input.contentBase64 === "string" ? input.contentBase64.slice(0, 2_500_000) : "",
    metadataStripped: input.metadataStripped !== false,
    locationRemoved: true,
    facialRecognition: false,
    automaticChildIdentification: false,
    approvedAt: input.approvedAt || "",
    sharedAt: input.sharedAt || "",
    withdrawnAt: input.withdrawnAt || "",
    history: Array.isArray(input.history) ? input.history : [{ at: createdAt, action: "uploaded", by: input.uploadedByEmail || "" }],
    createdAt,
    updatedAt: createdAt,
    preview: true,
  };
}

function createDailyReportShareRecord(input = {}) {
  const createdAt = nowIso();
  return {
    id: input.id || newId("drshare"),
    organizationId: cleanText(input.organizationId, 160),
    dailyLogId: cleanText(input.dailyLogId, 160),
    childId: cleanText(input.childId, 160),
    visibility: cleanText(input.visibility, 40) || VISIBILITY.PRIVATE_INTERNAL,
    sharedAt: input.sharedAt || "",
    withdrawnAt: input.withdrawnAt || "",
    reviewerMembershipId: cleanText(input.reviewerMembershipId, 160),
    history: Array.isArray(input.history) ? input.history : [{ at: createdAt, action: "created" }],
    createdAt,
    updatedAt: createdAt,
  };
}

function createObservationShareRecord(input = {}) {
  const createdAt = nowIso();
  return {
    id: input.id || newId("obshare"),
    organizationId: cleanText(input.organizationId, 160),
    observationId: cleanText(input.observationId, 160),
    childId: cleanText(input.childId, 160),
    visibility: cleanText(input.visibility, 40) || VISIBILITY.PRIVATE_INTERNAL,
    sharedAt: input.sharedAt || "",
    withdrawnAt: input.withdrawnAt || "",
    history: Array.isArray(input.history) ? input.history : [{ at: createdAt, action: "created" }],
    createdAt,
    updatedAt: createdAt,
  };
}

function createGoalShareRecord(input = {}) {
  const createdAt = nowIso();
  return {
    id: input.id || newId("gshare"),
    organizationId: cleanText(input.organizationId, 160),
    goalId: cleanText(input.goalId, 160),
    childId: cleanText(input.childId, 160),
    visibility: cleanText(input.visibility, 40) || VISIBILITY.PRIVATE_INTERNAL,
    sharedAt: input.sharedAt || "",
    withdrawnAt: input.withdrawnAt || "",
    history: Array.isArray(input.history) ? input.history : [{ at: createdAt, action: "created" }],
    createdAt,
    updatedAt: createdAt,
  };
}

function createAcknowledgmentRecord(input = {}) {
  const createdAt = nowIso();
  return {
    id: input.id || newId("fack"),
    organizationId: cleanText(input.organizationId, 160),
    contactId: cleanText(input.contactId, 160),
    childId: cleanText(input.childId, 160),
    targetType: cleanText(input.targetType, 40),
    targetId: cleanText(input.targetId, 160),
    note: cleanText(input.note, 500),
    // Acknowledgment is not a legal signature.
    isLegalSignature: false,
    createdAt,
    updatedAt: createdAt,
  };
}

function createConcernRequestRecord(input = {}) {
  const createdAt = nowIso();
  return {
    id: input.id || newId("fconcern"),
    organizationId: cleanText(input.organizationId, 160),
    contactId: cleanText(input.contactId, 160),
    childId: cleanText(input.childId, 160),
    targetType: cleanText(input.targetType, 40),
    targetId: cleanText(input.targetId, 160),
    message: cleanLongText(input.message, 2000),
    status: cleanText(input.status, 40) || "pending_provider_review",
    createdAt,
    updatedAt: createdAt,
  };
}

function createAccessAuditRecord(input = {}) {
  const createdAt = nowIso();
  return {
    id: input.id || newId("fuaud"),
    organizationId: cleanText(input.organizationId, 160),
    actorEmail: cleanText(input.actorEmail, 200),
    actorRole: cleanText(input.actorRole, 80),
    action: cleanText(input.action, 120),
    entityType: cleanText(input.entityType, 80),
    entityId: cleanText(input.entityId, 160),
    childId: cleanText(input.childId, 160),
    message: cleanText(input.message, 500),
    createdAt,
  };
}

function validateMediaUpload({ mimeType = "", byteSize = 0, fileName = "", contentBase64 = "" } = {}) {
  const mime = cleanText(mimeType, 80).toLowerCase();
  const name = cleanText(fileName, 200).toLowerCase();
  if (!mime || BLOCKED_MEDIA_MIME.has(mime)) {
    return { ok: false, reason: "blocked_mime_type" };
  }
  if (/\.(exe|js|html|htm|sh|bat|cmd|msi|dll|php|py)$/i.test(name)) {
    return { ok: false, reason: "blocked_extension" };
  }
  const allowed = ALLOWED_MEDIA_MIME[mime];
  if (!allowed) {
    return { ok: false, reason: "unsupported_mime_type" };
  }
  const size = Number(byteSize) || (contentBase64 ? Math.ceil(contentBase64.length * 0.75) : 0);
  if (size <= 0 || size > allowed.maxBytes) {
    return { ok: false, reason: "file_size_limit" };
  }
  // Disguised executable: reject if content looks like a script shebang / PE header markers in decoded prefix
  if (contentBase64) {
    try {
      const buf = Buffer.from(contentBase64.slice(0, 64), "base64");
      const head = buf.toString("utf8");
      if (head.startsWith("#!") || head.includes("<script") || buf[0] === 0x4d && buf[1] === 0x5a) {
        return { ok: false, reason: "disguised_executable" };
      }
    } catch {
      return { ok: false, reason: "invalid_content" };
    }
  }
  return { ok: true, kind: allowed.kind, ext: allowed.ext, maxBytes: allowed.maxBytes, byteSize: size };
}

function activeConsentsForChild(store, organizationId, childId) {
  ensureFamilyUpdatesStore(store);
  const today = nowIso().slice(0, 10);
  return listValues(store.familyUpdates.consents).filter((row) => {
    if (!row || row.organizationId !== organizationId || row.childId !== childId) return false;
    if (row.active === false || row.withdrawnAt) return false;
    if (row.startsAt && row.startsAt > today) return false;
    if (row.endsAt && row.endsAt < today) return false;
    return true;
  });
}

function consentAllowsFamilyShare(store, organizationId, childId) {
  const consents = activeConsentsForChild(store, organizationId, childId);
  return consents.some((row) => (
    row.scope === CONSENT_SCOPES.SHARE_VERIFIED_GUARDIANS
    || row.scope === CONSENT_SCOPES.CLASSROOM_GROUP
  ));
}

function consentAllowsDownload(store, organizationId, childId) {
  const consents = activeConsentsForChild(store, organizationId, childId);
  return consents.some((row) => (
    (row.scope === CONSENT_SCOPES.SHARE_VERIFIED_GUARDIANS || row.scope === CONSENT_SCOPES.CLASSROOM_GROUP)
    && row.downloadAllowed === true
  ));
}

function guardianMayViewMedia(store, contact, media) {
  if (!contact || !media) return { allowed: false, reason: "missing" };
  if (media.organizationId !== contact.organizationId) return { allowed: false, reason: "cross_organization" };
  if (media.familyVisibility !== VISIBILITY.FAMILY_VISIBLE && media.status !== MEDIA_STATUSES.FAMILY_VISIBLE) {
    return { allowed: false, reason: "not_family_visible" };
  }
  if (media.withdrawnAt || media.status === MEDIA_STATUSES.WITHDRAWN) {
    return { allowed: false, reason: "withdrawn" };
  }
  const tagged = media.taggedChildIds || [];
  if (!tagged.length) return { allowed: false, reason: "untagged" };
  // Guardian must have digital access to EVERY tagged child that would be revealed;
  // unapproved children are filtered — group photos only show if this contact's
  // permitted child is tagged AND consent allows share for that child.
  const permitted = [];
  for (const childId of tagged) {
    const access = familyModel.evaluateContactChildAccess({
      store,
      organizationId: contact.organizationId,
      contactId: contact.id,
      childId,
      capability: "digital",
    });
    if (!access.allowed) continue;
    if (!consentAllowsFamilyShare(store, contact.organizationId, childId)) continue;
    permitted.push(childId);
  }
  if (!permitted.length) return { allowed: false, reason: "no_permitted_tagged_child" };
  return { allowed: true, visibleChildIds: permitted };
}

function familySafeUpdate(update, { childId = "" } = {}) {
  if (!update) return null;
  const kids = update.childIds || [];
  if (childId && !kids.includes(childId) && update.scope !== UPDATE_SCOPES.PROGRAM && update.scope !== UPDATE_SCOPES.CLASSROOM) {
    return null;
  }
  return {
    id: update.id,
    organizationId: update.organizationId,
    scope: update.scope,
    status: update.status,
    title: update.title,
    message: update.message,
    occurredAt: update.occurredAt,
    classroomId: update.classroomId,
    childIds: childId ? kids.filter((id) => id === childId) : kids.slice(),
    activities: update.activities,
    meals: update.meals,
    bottles: update.bottles,
    snacks: update.snacks,
    nap: update.nap,
    diaperOrPotty: update.diaperOrPotty,
    mood: update.mood,
    suppliesNeeded: update.suppliesNeeded,
    reminder: update.reminder,
    mediaIds: update.mediaIds || [],
    linkedDailyLogId: update.linkedDailyLogId || "",
    linkedObservationId: update.linkedObservationId || "",
    linkedGoalId: update.linkedGoalId || "",
    sharedAt: update.sharedAt || "",
    correctionOfId: update.correctionOfId || "",
    isCorrection: update.status === UPDATE_STATUSES.CORRECTED || Boolean(update.correctionOfId),
    // Never expose internalNote
    createdAt: update.createdAt,
    updatedAt: update.updatedAt,
  };
}

function familySafeDailyReport(log, share) {
  if (!log || !share || share.visibility !== VISIBILITY.FAMILY_VISIBLE) return null;
  return {
    id: log.id,
    shareId: share.id,
    childId: log.childId,
    classroomId: log.classroomId,
    date: log.date,
    time: log.time,
    arrival: log.arrival || "",
    departure: log.departure || "",
    meals: log.meals || "",
    bottles: log.bottles || "",
    snacks: log.snacks || "",
    naps: log.naps || "",
    diapers: log.diapers || "",
    potty: log.potty || "",
    mood: log.mood || "",
    activities: log.activities || "",
    outdoorPlay: log.outdoorPlay || "",
    suppliesNeeded: log.suppliesNeeded || "",
    teacherNote: log.teacherNotes || "",
    photos: Array.isArray(log.photos) ? log.photos.filter((p) => typeof p === "string" || p?.familyVisible) : [],
    completedAt: log.updatedAt || log.createdAt,
    staffMembershipId: log.staffMembershipId || "",
    sharedAt: share.sharedAt || "",
    // healthNotes / internal staff fields omitted
  };
}

function familySafeObservation(obs, share) {
  if (!obs || !share || share.visibility !== VISIBILITY.FAMILY_VISIBLE) return null;
  return {
    id: obs.id,
    shareId: share.id,
    childId: obs.childId,
    date: obs.date,
    time: obs.time,
    text: obs.text,
    learningDomains: obs.learningDomains || [],
    sharedAt: share.sharedAt || "",
  };
}

function familySafeGoal(goal, share) {
  if (!goal || !share || share.visibility !== VISIBILITY.FAMILY_VISIBLE) return null;
  return {
    id: goal.id,
    shareId: share.id,
    childId: goal.childId,
    learningDomain: goal.learningDomain,
    description: goal.description,
    targetOrNextStep: goal.targetOrNextStep,
    status: goal.status,
    sharedAt: share.sharedAt || "",
  };
}

function familySafeMedia(media, visibleChildIds = []) {
  if (!media) return null;
  return {
    id: media.id,
    kind: media.kind,
    caption: media.caption,
    taggedChildIds: (media.taggedChildIds || []).filter((id) => visibleChildIds.includes(id)),
    classroomId: media.classroomId,
    capturedAt: media.capturedAt,
    sharedAt: media.sharedAt,
    downloadPermission: media.downloadPermission === true,
    placeholderLabel: media.placeholderLabel || FAKE_PLACEHOLDER_LABEL,
    mimeType: media.mimeType,
    // Authenticated content endpoint only — no public URL field
    contentPath: `/api/family-hub/media/${media.id}/content`,
  };
}

function isFamilySharedUpdate(update) {
  return update
    && (update.status === UPDATE_STATUSES.SHARED || update.status === UPDATE_STATUSES.CORRECTED)
    && !update.withdrawnAt;
}

function updatesVisibleToChild(store, organizationId, childId) {
  ensureFamilyUpdatesStore(store);
  return listValues(store.familyUpdates.updates)
    .filter((row) => row && row.organizationId === organizationId && isFamilySharedUpdate(row))
    .filter((row) => {
      if (row.scope === UPDATE_SCOPES.PROGRAM) return true;
      if (row.scope === UPDATE_SCOPES.CLASSROOM) {
        const assignment = listValues(store.classroomChildAssignments || {}).find((a) => (
          a && a.organizationId === organizationId && a.childId === childId && a.classroomId === row.classroomId && !a.endsAt
        ));
        return Boolean(assignment);
      }
      return (row.childIds || []).includes(childId);
    })
    .sort((a, b) => String(b.sharedAt || b.occurredAt || "").localeCompare(String(a.sharedAt || a.occurredAt || "")));
}

module.exports = {
  UPDATE_STATUSES,
  VISIBILITY,
  UPDATE_SCOPES,
  MEDIA_KINDS,
  MEDIA_STATUSES,
  CONSENT_SCOPES,
  ALLOWED_MEDIA_MIME,
  FAKE_PLACEHOLDER_LABEL,
  ensureFamilyUpdatesStore,
  defaultSharingConfig,
  getSharingConfig,
  appendHistory,
  createFamilyUpdateRecord,
  createMediaConsentRecord,
  createMediaRecord,
  createDailyReportShareRecord,
  createObservationShareRecord,
  createGoalShareRecord,
  createAcknowledgmentRecord,
  createConcernRequestRecord,
  createAccessAuditRecord,
  validateMediaUpload,
  activeConsentsForChild,
  consentAllowsFamilyShare,
  consentAllowsDownload,
  guardianMayViewMedia,
  familySafeUpdate,
  familySafeDailyReport,
  familySafeObservation,
  familySafeGoal,
  familySafeMedia,
  isFamilySharedUpdate,
  updatesVisibleToChild,
  newId,
  nowIso,
  cleanText,
  cleanLongText,
  listValues,
};
