/**
 * Phase 11 — Family / provider messaging, in-app notifications, permanent history.
 * Improves on (does not replace) the existing platform Messaging Center.
 * Fake conversations only. Outbound email/SMS/push remain disabled (sentExternally: false).
 * No Stripe / live AI / public attachment URLs / production file storage.
 */

const crypto = require("node:crypto");
const familyModel = require("./family-foundation-data-model.js");
const foundation = require("./foundation-data-model.js");
const hub = require("./family-hub-data-model.js");
const updatesModel = require("./family-updates-data-model.js");

const CONVERSATION_TYPES = Object.freeze({
  STAFF_GUARDIAN: "staff_guardian",
  DIRECTOR_GUARDIAN: "director_guardian",
  CHILD_FAMILY: "child_family",
  STAFF_STAFF: "staff_staff",
  CLASSROOM_ANNOUNCEMENT: "classroom_announcement",
  SELECTED_FAMILY_ANNOUNCEMENT: "selected_family_announcement",
  PROGRAM_ANNOUNCEMENT: "program_announcement",
  INTERNAL_STAFF: "internal_staff",
  SUPPORT_ADMIN: "support_admin",
});

const PARTICIPANT_ROLES = Object.freeze({
  OWNER: "owner",
  DIRECTOR: "director",
  STAFF: "staff",
  GUARDIAN: "guardian",
  SYSTEM: "system",
});

const MESSAGE_STATUSES = Object.freeze({
  DRAFT: "draft",
  SENT: "sent",
  DELIVERED_IN_APP: "delivered_in_app",
  EDITED: "edited",
  WITHDRAWN: "withdrawn",
});

const NOTIFICATION_KINDS = Object.freeze({
  NEW_MESSAGE: "new_message",
  FAMILY_REPLY: "family_reply",
  ANNOUNCEMENT: "announcement",
  FORM_ACTION: "form_action",
  DOCUMENT_REQUEST: "document_request",
  UPDATE_ACKNOWLEDGMENT: "update_acknowledgment",
  INFORMATION_CHANGE_REQUEST: "information_change_request",
  PROVIDER_REVIEW_TASK: "provider_review_task",
  FAMILY_UPDATE_ACTIVITY: "family_update_activity",
  ADMIN_ONLY: "admin_only",
});

const ALLOWED_ATTACHMENT_MIME = Object.freeze({
  "image/jpeg": { maxBytes: 2 * 1024 * 1024 },
  "image/png": { maxBytes: 2 * 1024 * 1024 },
  "application/pdf": { maxBytes: 3 * 1024 * 1024 },
  "text/plain": { maxBytes: 200 * 1024 },
});

const BLOCKED_ATTACHMENT_MIME = new Set([
  "application/javascript",
  "application/x-msdownload",
  "application/x-executable",
  "application/x-sh",
  "text/html",
]);

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function nowIso() {
  return new Date().toISOString();
}

function cleanText(value, max = 1000) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanLongText(value, max = 12000) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);
}

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

function ensureFamilyMessagingStore(store) {
  if (!store || typeof store !== "object") throw new Error("store is required");
  hub.ensureFamilyHubStore(store);
  updatesModel.ensureFamilyUpdatesStore(store);
  foundation.ensureFoundationStore(store);
  store.familyMessaging = store.familyMessaging && typeof store.familyMessaging === "object" ? store.familyMessaging : {};
  const fm = store.familyMessaging;
  fm.conversations = fm.conversations && typeof fm.conversations === "object" && !Array.isArray(fm.conversations) ? fm.conversations : {};
  fm.messages = fm.messages && typeof fm.messages === "object" && !Array.isArray(fm.messages) ? fm.messages : {};
  fm.drafts = fm.drafts && typeof fm.drafts === "object" && !Array.isArray(fm.drafts) ? fm.drafts : {};
  fm.attachments = fm.attachments && typeof fm.attachments === "object" && !Array.isArray(fm.attachments) ? fm.attachments : {};
  fm.notifications = fm.notifications && typeof fm.notifications === "object" && !Array.isArray(fm.notifications) ? fm.notifications : {};
  fm.participantPrefs = fm.participantPrefs && typeof fm.participantPrefs === "object" && !Array.isArray(fm.participantPrefs) ? fm.participantPrefs : {};
  fm.deliveryPreferences = fm.deliveryPreferences && typeof fm.deliveryPreferences === "object" && !Array.isArray(fm.deliveryPreferences) ? fm.deliveryPreferences : {};
  fm.retentionPolicies = fm.retentionPolicies && typeof fm.retentionPolicies === "object" && !Array.isArray(fm.retentionPolicies) ? fm.retentionPolicies : {};
  fm.exports = fm.exports && typeof fm.exports === "object" && !Array.isArray(fm.exports) ? fm.exports : {};
  fm.audit = fm.audit && typeof fm.audit === "object" && !Array.isArray(fm.audit) ? fm.audit : {};
  fm.meta = {
    ...(fm.meta && typeof fm.meta === "object" ? fm.meta : {}),
    createdAt: fm.meta?.createdAt || nowIso(),
    updatedAt: nowIso(),
    phase: 11,
    noOutboundEmail: true,
    noOutboundSms: true,
    noPush: true,
    noStripe: true,
    noLiveAi: true,
    noPublicAttachmentUrls: true,
    improvesExistingMessagingCenter: true,
    note: "Phase 11 family/provider messaging. In-app only. Platform Messaging Center preserved.",
  };
  return store;
}

function defaultDeliveryPreferences({ contactId = "", membershipId = "", organizationId = "", email = "" } = {}) {
  return {
    id: newId("fmdeliv"),
    organizationId: cleanText(organizationId, 160),
    contactId: cleanText(contactId, 160),
    membershipId: cleanText(membershipId, 160),
    email: cleanText(email, 200).toLowerCase(),
    channels: { inApp: true, email: false, sms: false, push: false },
    cadence: { immediate: true, dailyDigest: false, weeklyDigest: false },
    quietHours: { enabled: false, start: "21:00", end: "07:00" },
    messagePreviewPrivacy: "hide_sensitive_child_info",
    updatedAt: nowIso(),
    createdAt: nowIso(),
  };
}

function defaultRetentionPolicy(organizationId) {
  return {
    id: `fmretain_${cleanText(organizationId, 80) || "org"}`,
    organizationId: cleanText(organizationId, 160),
    // Configurable later — no universal legal retention promised.
    policyNote: "Retention periods are configurable per program/state requirements (not set in Phase 11).",
    keepForeverDefault: true,
    configuredDays: null,
    updatedAt: nowIso(),
  };
}

function createConversationRecord(input = {}) {
  const createdAt = nowIso();
  return {
    id: input.id || newId("fmconv"),
    organizationId: cleanText(input.organizationId, 160),
    programLocationId: cleanText(input.programLocationId, 160),
    type: cleanText(input.type, 60) || CONVERSATION_TYPES.CHILD_FAMILY,
    subject: cleanText(input.subject, 200) || "Conversation",
    participantIds: Array.isArray(input.participantIds) ? input.participantIds.map((id) => cleanText(id, 160)).filter(Boolean) : [],
    participants: Array.isArray(input.participants) ? input.participants : [],
    householdId: cleanText(input.householdId, 160),
    childIds: Array.isArray(input.childIds) ? input.childIds.map((id) => cleanText(id, 160)).filter(Boolean) : [],
    classroomId: cleanText(input.classroomId, 160),
    createdByEmail: cleanText(input.createdByEmail, 200).toLowerCase(),
    createdByRole: cleanText(input.createdByRole, 40),
    status: cleanText(input.status, 40) || "active",
    lastActivityAt: input.lastActivityAt || createdAt,
    announcement: input.announcement === true,
    allowFamilyReplies: input.allowFamilyReplies !== false,
    privateReplyThreadOfId: cleanText(input.privateReplyThreadOfId, 160),
    internalStaffOnly: input.internalStaffOnly === true || input.type === CONVERSATION_TYPES.INTERNAL_STAFF,
    permissionHistory: Array.isArray(input.permissionHistory) ? input.permissionHistory : [{ at: createdAt, action: "created" }],
    auditHistory: Array.isArray(input.auditHistory) ? input.auditHistory : [{ at: createdAt, action: "created", by: input.createdByEmail || "" }],
    createdAt,
    updatedAt: createdAt,
    preview: true,
  };
}

function createMessageRecord(input = {}) {
  const createdAt = nowIso();
  return {
    id: input.id || newId("fmmsg"),
    organizationId: cleanText(input.organizationId, 160),
    conversationId: cleanText(input.conversationId, 160),
    senderParticipantId: cleanText(input.senderParticipantId, 160),
    senderEmail: cleanText(input.senderEmail, 200).toLowerCase(),
    senderRole: cleanText(input.senderRole, 40),
    body: cleanLongText(input.body, 12000),
    status: cleanText(input.status, 40) || MESSAGE_STATUSES.SENT,
    attachmentIds: Array.isArray(input.attachmentIds) ? input.attachmentIds : [],
    readBy: Array.isArray(input.readBy) ? input.readBy : [],
    deliveredToInbox: Array.isArray(input.deliveredToInbox) ? input.deliveredToInbox : [],
    edited: input.edited === true,
    editHistory: Array.isArray(input.editHistory) ? input.editHistory : [],
    originalBody: input.originalBody || "",
    withdrawn: input.withdrawn === true,
    withdrawnAt: input.withdrawnAt || "",
    withdrawnNotice: cleanText(input.withdrawnNotice, 200),
    isInternalNote: input.isInternalNote === true,
    sentExternally: false,
    createdAt: input.createdAt || createdAt,
    updatedAt: createdAt,
    sentAt: input.sentAt || (input.status === MESSAGE_STATUSES.DRAFT ? "" : createdAt),
    preview: true,
  };
}

function createDraftRecord(input = {}) {
  const createdAt = nowIso();
  return {
    id: input.id || newId("fmdraft"),
    organizationId: cleanText(input.organizationId, 160),
    conversationId: cleanText(input.conversationId, 160),
    authorEmail: cleanText(input.authorEmail, 200).toLowerCase(),
    body: cleanLongText(input.body, 12000),
    attachmentIds: Array.isArray(input.attachmentIds) ? input.attachmentIds : [],
    autosavedAt: input.autosavedAt || createdAt,
    createdAt,
    updatedAt: createdAt,
  };
}

function createAttachmentRecord(input = {}) {
  const createdAt = nowIso();
  return {
    id: input.id || newId("fmatt"),
    organizationId: cleanText(input.organizationId, 160),
    conversationId: cleanText(input.conversationId, 160),
    messageId: cleanText(input.messageId, 160),
    uploadedByEmail: cleanText(input.uploadedByEmail, 200).toLowerCase(),
    fileName: cleanText(input.fileName, 200),
    mimeType: cleanText(input.mimeType, 80),
    byteSize: Number(input.byteSize || 0) || 0,
    contentBase64: typeof input.contentBase64 === "string" ? input.contentBase64.slice(0, 2_000_000) : "",
    placeholderLabel: cleanText(input.placeholderLabel, 200) || "Testing attachment — fake file only.",
    status: cleanText(input.status, 40) || "active",
    withdrawnAt: input.withdrawnAt || "",
    publicUrl: null,
    createdAt,
    updatedAt: createdAt,
  };
}

function createNotificationRecord(input = {}) {
  const createdAt = nowIso();
  return {
    id: input.id || newId("fmnote"),
    organizationId: cleanText(input.organizationId, 160),
    recipientEmail: cleanText(input.recipientEmail, 200).toLowerCase(),
    recipientRole: cleanText(input.recipientRole, 40),
    kind: cleanText(input.kind, 60) || NOTIFICATION_KINDS.NEW_MESSAGE,
    title: cleanText(input.title, 200),
    preview: cleanText(input.preview, 280),
    // Never put sensitive child details in lock-screen-style preview by default.
    lockScreenSafe: input.lockScreenSafe !== false,
    targetType: cleanText(input.targetType, 40),
    targetId: cleanText(input.targetId, 160),
    deepLink: cleanText(input.deepLink, 300),
    childId: cleanText(input.childId, 160),
    conversationId: cleanText(input.conversationId, 160),
    adminOnly: input.adminOnly === true || input.kind === NOTIFICATION_KINDS.ADMIN_ONLY,
    read: input.read === true,
    readAt: input.readAt || "",
    sentExternally: false,
    deliveryChannelsAttempted: { inApp: true, email: false, sms: false, push: false },
    createdAt,
    updatedAt: createdAt,
  };
}

function createParticipantPrefs(input = {}) {
  return {
    id: input.id || newId("fmpref"),
    organizationId: cleanText(input.organizationId, 160),
    conversationId: cleanText(input.conversationId, 160),
    participantKey: cleanText(input.participantKey, 200).toLowerCase(),
    muted: input.muted === true,
    pinned: input.pinned === true,
    favorite: input.favorite === true,
    archivedView: input.archivedView === true,
    markUnread: input.markUnread === true,
    updatedAt: nowIso(),
  };
}

function createAuditRecord(input = {}) {
  return {
    id: input.id || newId("fmaud"),
    organizationId: cleanText(input.organizationId, 160),
    conversationId: cleanText(input.conversationId, 160),
    messageId: cleanText(input.messageId, 160),
    actorEmail: cleanText(input.actorEmail, 200).toLowerCase(),
    action: cleanText(input.action, 80),
    detail: cleanText(input.detail, 500),
    createdAt: nowIso(),
  };
}

function validateAttachmentUpload({ mimeType = "", byteSize = 0, fileName = "", contentBase64 = "" } = {}) {
  const mime = cleanText(mimeType, 80).toLowerCase();
  const name = cleanText(fileName, 200).toLowerCase();
  if (!mime || BLOCKED_ATTACHMENT_MIME.has(mime)) return { ok: false, reason: "blocked_mime_type" };
  if (/\.(exe|js|html|htm|sh|bat|cmd|msi|dll|php)$/i.test(name)) return { ok: false, reason: "blocked_extension" };
  const allowed = ALLOWED_ATTACHMENT_MIME[mime];
  if (!allowed) return { ok: false, reason: "unsupported_mime_type" };
  const size = Number(byteSize) || (contentBase64 ? Math.ceil(contentBase64.length * 0.75) : 0);
  if (size <= 0 || size > allowed.maxBytes) return { ok: false, reason: "file_size_limit" };
  if (contentBase64) {
    try {
      const buf = Buffer.from(contentBase64.slice(0, 64), "base64");
      const head = buf.toString("utf8");
      if (head.startsWith("#!") || head.includes("<script") || (buf[0] === 0x4d && buf[1] === 0x5a)) {
        return { ok: false, reason: "disguised_executable" };
      }
    } catch {
      return { ok: false, reason: "invalid_content" };
    }
  }
  return { ok: true, byteSize: size };
}

function participantKey(email) {
  return cleanText(email, 200).toLowerCase();
}

function conversationIncludesParticipant(conversation, email) {
  const key = participantKey(email);
  if (!key || !conversation) return false;
  return (conversation.participants || []).some((row) => participantKey(row.email) === key)
    || (conversation.participantIds || []).includes(key);
}

function guardianMayAccessConversation(store, contact, conversation) {
  if (!contact || !conversation) return { allowed: false, reason: "missing" };
  if (conversation.organizationId !== contact.organizationId) return { allowed: false, reason: "cross_organization" };
  if (conversation.internalStaffOnly) return { allowed: false, reason: "internal_staff_only" };
  if (conversation.type === CONVERSATION_TYPES.STAFF_STAFF) return { allowed: false, reason: "staff_only" };
  if (!conversationIncludesParticipant(conversation, contact.email)) {
    return { allowed: false, reason: "not_participant" };
  }
  const childIds = conversation.childIds || [];
  if (childIds.length) {
    const ok = childIds.some((childId) => familyModel.evaluateContactChildAccess({
      store,
      organizationId: contact.organizationId,
      contactId: contact.id,
      childId,
      capability: "messages",
    }).allowed);
    if (!ok) return { allowed: false, reason: "child_messages_denied" };
  } else {
    // Announcement / program thread: still need at least one messages-capable child or digital messages level
    const rules = familyModel.activeAccessRulesForContact(store, contact.organizationId, contact.id);
    const canMsg = rules.some((rule) => (
      rule.accessLevel === familyModel.ACCESS_LEVELS.FULL_VERIFIED_GUARDIAN
      || rule.accessLevel === familyModel.ACCESS_LEVELS.LIMITED_GUARDIAN
      || rule.accessLevel === familyModel.ACCESS_LEVELS.MESSAGES_ONLY
    ));
    if (!canMsg) return { allowed: false, reason: "no_messages_access" };
  }
  return { allowed: true };
}

function staffMayAccessConversation(store, actor, conversation) {
  if (!actor || !conversation) return { allowed: false, reason: "missing" };
  if (conversation.organizationId !== actor.organizationId) return { allowed: false, reason: "cross_organization" };
  const role = actor.role || "";
  const isDirector = role === "director_owner" || role === "director" || role === "owner";
  if (isDirector) return { allowed: true };
  if (conversationIncludesParticipant(conversation, actor.email)) return { allowed: true };
  if (conversation.classroomId) {
    const assigned = listValues(store.classroomStaffAssignments || {}).some((row) => (
      row
      && row.organizationId === conversation.organizationId
      && row.classroomId === conversation.classroomId
      && row.staffMembershipId === actor.membershipId
      && !row.endsAt
    ));
    if (assigned) return { allowed: true };
  }
  if ((conversation.childIds || []).length) {
    for (const childId of conversation.childIds) {
      const decision = require("./org-permissions.js").evaluateAccess({
        store,
        actor: { email: actor.email, role: actor.role, membershipId: actor.membershipId },
        organizationId: conversation.organizationId,
        action: require("./org-permissions.js").ACTIONS.FAMILY_MESSAGE || require("./org-permissions.js").ACTIONS.CHILD_VIEW,
        childId,
      });
      if (decision.allowed) return { allowed: true };
    }
  }
  return { allowed: false, reason: "classroom_scope_denied" };
}

function familySafeConversation(conversation, { email = "" } = {}) {
  if (!conversation) return null;
  return {
    id: conversation.id,
    organizationId: conversation.organizationId,
    type: conversation.type,
    subject: conversation.subject,
    childIds: (conversation.childIds || []).slice(),
    classroomId: conversation.classroomId || "",
    householdId: conversation.householdId || "",
    status: conversation.status,
    lastActivityAt: conversation.lastActivityAt,
    announcement: conversation.announcement === true,
    allowFamilyReplies: conversation.allowFamilyReplies !== false,
    // Never expose other announcement recipients' PII
    participants: (conversation.participants || [])
      .filter((row) => row.role !== PARTICIPANT_ROLES.GUARDIAN || participantKey(row.email) === participantKey(email))
      .map((row) => ({
        email: row.role === PARTICIPANT_ROLES.GUARDIAN ? row.email : undefined,
        displayName: row.displayName || (row.role === PARTICIPANT_ROLES.STAFF || row.role === PARTICIPANT_ROLES.DIRECTOR ? row.displayName : "Program"),
        role: row.role,
      })),
    participantSummary: conversation.announcement
      ? "Program announcement"
      : `${(conversation.participants || []).length} participants`,
    createdAt: conversation.createdAt,
  };
}

function familySafeMessage(message) {
  if (!message) return null;
  if (message.isInternalNote) return null;
  if (message.withdrawn) {
    return {
      id: message.id,
      conversationId: message.conversationId,
      status: MESSAGE_STATUSES.WITHDRAWN,
      withdrawn: true,
      withdrawnNotice: message.withdrawnNotice || "This message was withdrawn.",
      sentAt: message.sentAt,
      senderRole: message.senderRole,
      body: "",
      edited: false,
    };
  }
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderRole: message.senderRole,
    senderEmail: message.senderRole === PARTICIPANT_ROLES.GUARDIAN ? message.senderEmail : undefined,
    body: message.body,
    status: message.status,
    edited: message.edited === true,
    editIndicator: message.edited === true ? "Edited" : "",
    attachmentIds: message.attachmentIds || [],
    sentAt: message.sentAt,
    readByCount: (message.readBy || []).length,
    deliveredInApp: message.status === MESSAGE_STATUSES.DELIVERED_IN_APP || message.status === MESSAGE_STATUSES.SENT || message.status === MESSAGE_STATUSES.EDITED,
    sentExternally: false,
  };
}

function memberSafeNotification(notification) {
  if (!notification || notification.adminOnly) return null;
  return {
    id: notification.id,
    kind: notification.kind,
    title: notification.title,
    preview: notification.preview,
    deepLink: notification.deepLink,
    targetType: notification.targetType,
    targetId: notification.targetId,
    conversationId: notification.conversationId || "",
    childId: notification.childId || "",
    read: notification.read === true,
    createdAt: notification.createdAt,
    sentExternally: false,
  };
}

function messagesForConversation(store, conversationId) {
  ensureFamilyMessagingStore(store);
  return listValues(store.familyMessaging.messages)
    .filter((row) => row.conversationId === conversationId)
    .sort((a, b) => String(a.sentAt || a.createdAt || "").localeCompare(String(b.sentAt || b.createdAt || "")));
}

function unreadCountForEmail(store, organizationId, email) {
  ensureFamilyMessagingStore(store);
  const key = participantKey(email);
  return listValues(store.familyMessaging.notifications).filter((row) => (
    row.organizationId === organizationId
    && participantKey(row.recipientEmail) === key
    && !row.read
    && !row.adminOnly
  )).length;
}

function appendConversationAudit(conversation, entry) {
  const history = Array.isArray(conversation.auditHistory) ? conversation.auditHistory.slice() : [];
  history.push({ at: nowIso(), ...entry });
  conversation.auditHistory = history.slice(-100);
  conversation.updatedAt = nowIso();
  return conversation;
}

module.exports = {
  CONVERSATION_TYPES,
  PARTICIPANT_ROLES,
  MESSAGE_STATUSES,
  NOTIFICATION_KINDS,
  ALLOWED_ATTACHMENT_MIME,
  ensureFamilyMessagingStore,
  defaultDeliveryPreferences,
  defaultRetentionPolicy,
  createConversationRecord,
  createMessageRecord,
  createDraftRecord,
  createAttachmentRecord,
  createNotificationRecord,
  createParticipantPrefs,
  createAuditRecord,
  validateAttachmentUpload,
  participantKey,
  conversationIncludesParticipant,
  guardianMayAccessConversation,
  staffMayAccessConversation,
  familySafeConversation,
  familySafeMessage,
  memberSafeNotification,
  messagesForConversation,
  unreadCountForEmail,
  appendConversationAudit,
  newId,
  nowIso,
  cleanText,
  cleanLongText,
  listValues,
};
