/**
 * Phase 11 fixtures — fake family/provider conversations, announcements,
 * notifications, and attachment placeholders on Phase 8–10 foundation.
 */

const phase10 = require("./family-updates-fixtures.js");
const foundation = require("./foundation-data-model.js");
const model = require("./family-messaging-data-model.js");

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

const TINY_TXT_BASE64 = Buffer.from("Phase 11 fake attachment — not a real document.", "utf8").toString("base64");

function ensurePhase11Preview(store, { adminEmail = "phase11.owner@example.invalid", organizationId = "" } = {}) {
  model.ensureFamilyMessagingStore(store);
  const seeded10 = phase10.ensurePhase10Preview(store, { adminEmail, organizationId });
  const orgId = seeded10.organizationId || organizationId;

  if (store.familyMessaging.meta?.phase11SeededFor === orgId) {
    return {
      organizationId: orgId,
      alreadySeeded: true,
      contactIds: seeded10.contactIds,
      childIds: seeded10.childIds,
    };
  }

  const childIds = seeded10.childIds || {};
  const contactIds = seeded10.contactIds || {};
  const ava = childIds.ava;
  const ben = childIds.ben;
  const classroom = listValues(store.classrooms).find((row) => row.organizationId === orgId && /Sunshine/i.test(row.name || ""))
    || listValues(store.classrooms).find((row) => row.organizationId === orgId);
  const classroomId = classroom?.id || "";
  const staff = listValues(store.staffMemberships).find((row) => row.organizationId === orgId && row.role === foundation.STAFF_ROLES.LEAD_TEACHER)
    || listValues(store.staffMemberships).find((row) => row.organizationId === orgId);
  const director = listValues(store.staffMemberships).find((row) => (
    row.organizationId === orgId && (row.role === foundation.STAFF_ROLES.DIRECTOR_OWNER || row.role === "director_owner" || row.role === "director")
  )) || staff;

  const priyaEmail = listValues(store.familyFoundation.contacts).find((row) => row.id === contactIds.priya)?.email || "priya.lin@example.invalid";
  const staffEmail = staff?.userEmail || "lead.teacher@example.invalid";
  const directorEmail = director?.userEmail || adminEmail;

  store.familyMessaging.retentionPolicies[orgId] = model.defaultRetentionPolicy(orgId);

  // Child-specific family conversation (Priya ↔ staff about Ava)
  const childThread = model.createConversationRecord({
    organizationId: orgId,
    type: model.CONVERSATION_TYPES.CHILD_FAMILY,
    subject: "Ava — morning check-in",
    childIds: [ava].filter(Boolean),
    classroomId,
    householdId: listValues(store.familyFoundation.householdMemberships).find((row) => row.contactId === contactIds.priya)?.householdId || "",
    createdByEmail: staffEmail,
    createdByRole: model.PARTICIPANT_ROLES.STAFF,
    participants: [
      { email: staffEmail, displayName: staff?.displayName || "Lead Teacher", role: model.PARTICIPANT_ROLES.STAFF, membershipId: staff?.id || "" },
      { email: priyaEmail, displayName: "Priya Lin", role: model.PARTICIPANT_ROLES.GUARDIAN, contactId: contactIds.priya || "" },
    ],
    participantIds: [staffEmail, priyaEmail].map((e) => model.participantKey(e)),
  });
  store.familyMessaging.conversations[childThread.id] = childThread;

  const msg1 = model.createMessageRecord({
    organizationId: orgId,
    conversationId: childThread.id,
    senderEmail: staffEmail,
    senderRole: model.PARTICIPANT_ROLES.STAFF,
    body: "Good morning — Ava settled in well after drop-off (fixture).",
    status: model.MESSAGE_STATUSES.DELIVERED_IN_APP,
    deliveredToInbox: [priyaEmail],
    readBy: [],
  });
  store.familyMessaging.messages[msg1.id] = msg1;

  const msg2 = model.createMessageRecord({
    organizationId: orgId,
    conversationId: childThread.id,
    senderEmail: priyaEmail,
    senderRole: model.PARTICIPANT_ROLES.GUARDIAN,
    body: "Thank you! Please remind her about the water bottle.",
    status: model.MESSAGE_STATUSES.DELIVERED_IN_APP,
    deliveredToInbox: [staffEmail],
    readBy: [staffEmail],
  });
  store.familyMessaging.messages[msg2.id] = msg2;
  childThread.lastActivityAt = msg2.sentAt;

  // Internal staff-only thread (families must never see)
  const internal = model.createConversationRecord({
    organizationId: orgId,
    type: model.CONVERSATION_TYPES.INTERNAL_STAFF,
    subject: "Internal staffing note",
    classroomId,
    childIds: [ava].filter(Boolean),
    internalStaffOnly: true,
    createdByEmail: directorEmail,
    createdByRole: model.PARTICIPANT_ROLES.DIRECTOR,
    participants: [
      { email: directorEmail, displayName: "Director", role: model.PARTICIPANT_ROLES.DIRECTOR },
      { email: staffEmail, displayName: staff?.displayName || "Lead Teacher", role: model.PARTICIPANT_ROLES.STAFF },
    ],
    participantIds: [directorEmail, staffEmail].map((e) => model.participantKey(e)),
  });
  store.familyMessaging.conversations[internal.id] = internal;
  const internalMsg = model.createMessageRecord({
    organizationId: orgId,
    conversationId: internal.id,
    senderEmail: directorEmail,
    senderRole: model.PARTICIPANT_ROLES.DIRECTOR,
    body: "INTERNAL — coverage plan for Friday (families never see this).",
    isInternalNote: true,
    status: model.MESSAGE_STATUSES.SENT,
  });
  store.familyMessaging.messages[internalMsg.id] = internalMsg;

  // Classroom announcement (no recipient PII exposed to families)
  const announcement = model.createConversationRecord({
    organizationId: orgId,
    type: model.CONVERSATION_TYPES.CLASSROOM_ANNOUNCEMENT,
    subject: "Sunshine Room — water bottle reminder",
    classroomId,
    childIds: [ava, ben].filter(Boolean),
    announcement: true,
    allowFamilyReplies: true,
    createdByEmail: directorEmail,
    createdByRole: model.PARTICIPANT_ROLES.DIRECTOR,
    participants: [
      { email: directorEmail, displayName: "Director", role: model.PARTICIPANT_ROLES.DIRECTOR },
      { email: priyaEmail, displayName: "Priya Lin", role: model.PARTICIPANT_ROLES.GUARDIAN, contactId: contactIds.priya || "" },
      // Second household recipient (Ben's other guardian if present) — still must not leak to Priya
    ],
    participantIds: [directorEmail, priyaEmail].map((e) => model.participantKey(e)),
  });
  // Add other guardians with digital/messages access as silent recipients without exposing them in family-safe payload
  listValues(store.familyFoundation.contacts).forEach((contact) => {
    if (contact.organizationId !== orgId || contact.email === priyaEmail) return;
    const can = [ava, ben].filter(Boolean).some((childId) => familyModelAccess(store, contact, childId));
    if (!can) return;
    if (!announcement.participantIds.includes(model.participantKey(contact.email))) {
      announcement.participants.push({
        email: contact.email,
        displayName: contact.displayName,
        role: model.PARTICIPANT_ROLES.GUARDIAN,
        contactId: contact.id,
      });
      announcement.participantIds.push(model.participantKey(contact.email));
    }
  });
  store.familyMessaging.conversations[announcement.id] = announcement;
  const annMsg = model.createMessageRecord({
    organizationId: orgId,
    conversationId: announcement.id,
    senderEmail: directorEmail,
    senderRole: model.PARTICIPANT_ROLES.DIRECTOR,
    body: "Please label water bottles for outdoor week. Replies stay private with the program.",
    status: model.MESSAGE_STATUSES.DELIVERED_IN_APP,
    deliveredToInbox: announcement.participantIds.filter((e) => e !== model.participantKey(directorEmail)),
  });
  store.familyMessaging.messages[annMsg.id] = annMsg;
  announcement.lastActivityAt = annMsg.sentAt;

  // Staff-to-staff
  const staffThread = model.createConversationRecord({
    organizationId: orgId,
    type: model.CONVERSATION_TYPES.STAFF_STAFF,
    subject: "Lesson materials",
    classroomId,
    createdByEmail: staffEmail,
    createdByRole: model.PARTICIPANT_ROLES.STAFF,
    participants: [
      { email: staffEmail, displayName: staff?.displayName || "Lead Teacher", role: model.PARTICIPANT_ROLES.STAFF },
      { email: directorEmail, displayName: "Director", role: model.PARTICIPANT_ROLES.DIRECTOR },
    ],
    participantIds: [staffEmail, directorEmail].map((e) => model.participantKey(e)),
  });
  store.familyMessaging.conversations[staffThread.id] = staffThread;
  const staffMsg = model.createMessageRecord({
    organizationId: orgId,
    conversationId: staffThread.id,
    senderEmail: staffEmail,
    senderRole: model.PARTICIPANT_ROLES.STAFF,
    body: "Can we restock ocean theme materials? (staff only)",
    status: model.MESSAGE_STATUSES.SENT,
  });
  store.familyMessaging.messages[staffMsg.id] = staffMsg;

  // Fake attachment on child thread
  const att = model.createAttachmentRecord({
    organizationId: orgId,
    conversationId: childThread.id,
    messageId: msg1.id,
    uploadedByEmail: staffEmail,
    fileName: "fixture-note.txt",
    mimeType: "text/plain",
    byteSize: Buffer.from(TINY_TXT_BASE64, "base64").length,
    contentBase64: TINY_TXT_BASE64,
  });
  store.familyMessaging.attachments[att.id] = att;
  msg1.attachmentIds = [att.id];
  store.familyMessaging.messages[msg1.id] = msg1;

  // In-app notifications for Priya (not admin-only)
  const noteMsg = model.createNotificationRecord({
    organizationId: orgId,
    recipientEmail: priyaEmail,
    recipientRole: model.PARTICIPANT_ROLES.GUARDIAN,
    kind: model.NOTIFICATION_KINDS.NEW_MESSAGE,
    title: "New message from your program",
    preview: "Good morning — Ava settled in well…",
    targetType: "conversation",
    targetId: childThread.id,
    conversationId: childThread.id,
    childId: ava || "",
    deepLink: `#family-hub?tab=messages&conversationId=${childThread.id}`,
  });
  store.familyMessaging.notifications[noteMsg.id] = noteMsg;

  const noteAnn = model.createNotificationRecord({
    organizationId: orgId,
    recipientEmail: priyaEmail,
    recipientRole: model.PARTICIPANT_ROLES.GUARDIAN,
    kind: model.NOTIFICATION_KINDS.ANNOUNCEMENT,
    title: "Classroom announcement",
    preview: "Sunshine Room — water bottle reminder",
    targetType: "conversation",
    targetId: announcement.id,
    conversationId: announcement.id,
    deepLink: `#family-hub?tab=messages&conversationId=${announcement.id}`,
  });
  store.familyMessaging.notifications[noteAnn.id] = noteAnn;

  // Admin-only notification (regular users must never receive)
  const adminNote = model.createNotificationRecord({
    organizationId: orgId,
    recipientEmail: directorEmail,
    recipientRole: model.PARTICIPANT_ROLES.DIRECTOR,
    kind: model.NOTIFICATION_KINDS.ADMIN_ONLY,
    title: "Admin: review queue item",
    preview: "Internal provider review task",
    adminOnly: true,
    targetType: "review",
    targetId: "fixture-review",
    deepLink: "#director-center",
  });
  store.familyMessaging.notifications[adminNote.id] = adminNote;

  // Provider review task notification for director
  const reviewNote = model.createNotificationRecord({
    organizationId: orgId,
    recipientEmail: directorEmail,
    recipientRole: model.PARTICIPANT_ROLES.DIRECTOR,
    kind: model.NOTIFICATION_KINDS.PROVIDER_REVIEW_TASK,
    title: "Family update awaiting review",
    preview: "An update was submitted for director review.",
    targetType: "family_update",
    targetId: "fixture",
    deepLink: "#director-center",
  });
  store.familyMessaging.notifications[reviewNote.id] = reviewNote;

  // Delivery prefs for Priya
  const deliv = model.defaultDeliveryPreferences({
    organizationId: orgId,
    contactId: contactIds.priya || "",
    email: priyaEmail,
  });
  store.familyMessaging.deliveryPreferences[deliv.id] = deliv;

  store.familyMessaging.meta.phase11SeededFor = orgId;
  store.familyMessaging.meta.updatedAt = model.nowIso();

  return {
    organizationId: orgId,
    alreadySeeded: false,
    contactIds,
    childIds,
    conversationIds: {
      childThread: childThread.id,
      internal: internal.id,
      announcement: announcement.id,
      staffThread: staffThread.id,
    },
  };
}

function familyModelAccess(store, contact, childId) {
  const familyModel = require("./family-foundation-data-model.js");
  return familyModel.evaluateContactChildAccess({
    store,
    organizationId: contact.organizationId,
    contactId: contact.id,
    childId,
    capability: "messages",
  }).allowed;
}

function resetPhase11Preview(store, { organizationId = "" } = {}) {
  model.ensureFamilyMessagingStore(store);
  if (!organizationId) {
    store.familyMessaging = {};
    model.ensureFamilyMessagingStore(store);
    phase10.resetPhase10Preview(store, {});
    return { reset: true, scope: "all" };
  }
  ["conversations", "messages", "drafts", "attachments", "notifications", "participantPrefs", "deliveryPreferences", "retentionPolicies", "exports", "audit"].forEach((key) => {
    Object.keys(store.familyMessaging[key] || {}).forEach((id) => {
      if (store.familyMessaging[key][id]?.organizationId === organizationId) delete store.familyMessaging[key][id];
    });
  });
  if (store.familyMessaging.meta?.phase11SeededFor === organizationId) delete store.familyMessaging.meta.phase11SeededFor;
  phase10.resetPhase10Preview(store, { organizationId });
  return { reset: true, scope: organizationId };
}

module.exports = {
  ensurePhase11Preview,
  resetPhase11Preview,
  TINY_TXT_BASE64,
};
