/**
 * Phase 11 provider messaging API — /api/director-center/family-messaging/*
 * Preserves platform Messaging Center; this is org/family-scoped.
 * Outbound email/SMS/push disabled. Fake data only.
 */

const foundation = require("../scripts/foundation-data-model.js");
const orgPermissions = require("../scripts/org-permissions.js");
const formsFixtures = require("../scripts/forms-center-preview-fixtures.js");
const model = require("../scripts/family-messaging-data-model.js");
const fixtures = require("../scripts/family-messaging-fixtures.js");

const BASE = "/api/director-center/family-messaging";
const PRODUCTION_HOST = "littlelearnershubbyleah.com";
const TESTING_BANNER = "Testing Account — Fake Data Only.";

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
  return { ...env, liveProduction, allowDirectorCenterAdminPreview: env.allowDirectorCenterAdminPreview === true && !liveProduction, siteUrl };
}

function actorFromMembership(member) {
  if (!member) return null;
  return {
    email: member.userEmail || "",
    role: member.role || "",
    membershipId: member.id,
    displayName: member.displayName || "",
    organizationId: member.organizationId,
  };
}

function createFamilyMessagingApi({
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
    jsonResponse(response, status, { error: error || "Access denied.", code, familyMessaging: true, preview: true });
  }

  function ensureOrg(store, adminEmail) {
    model.ensureFamilyMessagingStore(store);
    const seeded = fixtures.ensurePhase11Preview(store, { adminEmail: normalizeEmail?.(adminEmail) || adminEmail });
    const organization = store.organizations[seeded.organizationId]
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
        return { actor: actorFromMembership(member), membership: member, rolePreview: true };
      }
    }
    return {
      actor: actorFromMembership(owner) || { email: adminEmail, role: orgPermissions.ORG_ROLES.DIRECTOR_OWNER, organizationId },
      membership: owner,
      rolePreview: false,
    };
  }

  function isDirector(role) {
    return role === orgPermissions.ORG_ROLES.DIRECTOR_OWNER || role === orgPermissions.ORG_ROLES.DIRECTOR;
  }

  function notifyInApp(store, input) {
    const note = model.createNotificationRecord({ ...input, sentExternally: false });
    store.familyMessaging.notifications[note.id] = note;
    return note;
  }

  async function handleStatus(request, response, context = {}) {
    if (env().liveProduction) return deny(response, 403, "production_locked", "Family messaging testing is not available on production.");
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      phase: 11,
      preview: true,
      label: TESTING_BANNER,
      organizationId: organization.id,
      outboundDeliveryDisabled: true,
      sentExternallyDefault: false,
      improvesExistingMessagingCenter: true,
      retention: store.familyMessaging.retentionPolicies[organization.id] || model.defaultRetentionPolicy(organization.id),
      counts: {
        conversations: listValues(store.familyMessaging.conversations).filter((r) => r.organizationId === organization.id).length,
        messages: listValues(store.familyMessaging.messages).filter((r) => r.organizationId === organization.id).length,
        notifications: listValues(store.familyMessaging.notifications).filter((r) => r.organizationId === organization.id).length,
      },
    });
  }

  async function handleSeed(request, response, context = {}) {
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const body = await readJson(request).catch(() => ({}));
    const store = readStore();
    if (body.reset === true) fixtures.resetPhase11Preview(store, { organizationId: body.organizationId || "" });
    const seeded = fixtures.ensurePhase11Preview(store, { adminEmail: context.adminEmail, organizationId: body.organizationId || "" });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, seeded, label: TESTING_BANNER });
  }

  async function handleInbox(request, response, context = {}, url) {
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    const filter = String(url?.searchParams?.get("filter") || "inbox").toLowerCase();
    let rows = listValues(store.familyMessaging.conversations).filter((row) => row.organizationId === organization.id);
    rows = rows.filter((row) => model.staffMayAccessConversation(store, { ...actor, organizationId: organization.id }, row).allowed);
    if (filter === "unread") {
      rows = rows.filter((row) => listValues(store.familyMessaging.messages).some((m) => (
        m.conversationId === row.id && !(m.readBy || []).includes(safeLower(actor.email)) && safeLower(m.senderEmail) !== safeLower(actor.email)
      )));
    } else if (filter === "families") {
      rows = rows.filter((row) => !row.internalStaffOnly && row.type !== model.CONVERSATION_TYPES.STAFF_STAFF);
    } else if (filter === "staff") {
      rows = rows.filter((row) => row.type === model.CONVERSATION_TYPES.STAFF_STAFF || row.internalStaffOnly);
    } else if (filter === "announcements") {
      rows = rows.filter((row) => row.announcement === true);
    } else if (filter === "archived") {
      rows = rows.filter((row) => row.status === "archived");
    } else {
      rows = rows.filter((row) => row.status !== "archived");
    }
    const q = String(url?.searchParams?.get("q") || "").trim().toLowerCase();
    if (q) {
      rows = rows.filter((row) => String(row.subject || "").toLowerCase().includes(q));
    }
    rows.sort((a, b) => String(b.lastActivityAt || "").localeCompare(String(a.lastActivityAt || "")));
    const unread = model.unreadCountForEmail(store, organization.id, actor.email);
    jsonResponse(response, 200, {
      ok: true,
      label: TESTING_BANNER,
      filter,
      unreadCount: unread,
      conversations: rows.map((row) => ({
        id: row.id,
        type: row.type,
        subject: row.subject,
        childIds: row.childIds,
        classroomId: row.classroomId,
        status: row.status,
        lastActivityAt: row.lastActivityAt,
        announcement: row.announcement === true,
        internalStaffOnly: row.internalStaffOnly === true,
        recipientCount: (row.participants || []).filter((p) => p.role === model.PARTICIPANT_ROLES.GUARDIAN).length,
        participantCount: (row.participants || []).length,
      })),
    });
  }

  async function handleGetConversation(request, response, context = {}, conversationId) {
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    const conversation = store.familyMessaging.conversations[conversationId];
    if (!conversation || conversation.organizationId !== organization.id) return deny(response, 404, "not_found");
    const access = model.staffMayAccessConversation(store, { ...actor, organizationId: organization.id }, conversation);
    if (!access.allowed) return deny(response, 403, access.reason || "access_denied");
    const messages = model.messagesForConversation(store, conversationId).map((msg) => ({
      ...msg,
      contentBase64: undefined,
      // staff can see internal notes
    }));
    jsonResponse(response, 200, {
      ok: true,
      conversation,
      messages,
      recipientCount: (conversation.participants || []).filter((p) => p.role === model.PARTICIPANT_ROLES.GUARDIAN).length,
    });
  }

  async function handleCreateConversation(request, response, context = {}) {
    const body = await readJson(request);
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    const type = body.type || model.CONVERSATION_TYPES.CHILD_FAMILY;
    if (type === model.CONVERSATION_TYPES.INTERNAL_STAFF && !isDirector(actor.role) && actor.role !== orgPermissions.ORG_ROLES.LEAD_TEACHER) {
      return deny(response, 403, "staff_required");
    }
    const participants = Array.isArray(body.participants) ? body.participants : [];
    const conversation = model.createConversationRecord({
      organizationId: organization.id,
      type,
      subject: body.subject,
      childIds: body.childIds || [],
      classroomId: body.classroomId || "",
      householdId: body.householdId || "",
      announcement: body.announcement === true || String(type).includes("announcement"),
      allowFamilyReplies: body.allowFamilyReplies !== false,
      internalStaffOnly: type === model.CONVERSATION_TYPES.INTERNAL_STAFF,
      createdByEmail: actor.email,
      createdByRole: isDirector(actor.role) ? model.PARTICIPANT_ROLES.DIRECTOR : model.PARTICIPANT_ROLES.STAFF,
      participants: [
        { email: actor.email, displayName: actor.displayName || "Staff", role: isDirector(actor.role) ? model.PARTICIPANT_ROLES.DIRECTOR : model.PARTICIPANT_ROLES.STAFF, membershipId: actor.membershipId },
        ...participants,
      ],
      participantIds: [actor.email, ...participants.map((p) => p.email)].map((e) => model.participantKey(e)),
    });
    store.familyMessaging.conversations[conversation.id] = conversation;
    if (body.body) {
      const message = model.createMessageRecord({
        organizationId: organization.id,
        conversationId: conversation.id,
        senderEmail: actor.email,
        senderRole: conversation.createdByRole,
        body: body.body,
        isInternalNote: body.isInternalNote === true || conversation.internalStaffOnly,
        status: model.MESSAGE_STATUSES.DELIVERED_IN_APP,
        deliveredToInbox: conversation.participantIds.filter((e) => e !== model.participantKey(actor.email)),
      });
      store.familyMessaging.messages[message.id] = message;
      conversation.lastActivityAt = message.sentAt;
      // Notify guardian participants only (never admin_only fanout to families)
      conversation.participants.filter((p) => p.role === model.PARTICIPANT_ROLES.GUARDIAN).forEach((p) => {
        notifyInApp(store, {
          organizationId: organization.id,
          recipientEmail: p.email,
          recipientRole: model.PARTICIPANT_ROLES.GUARDIAN,
          kind: conversation.announcement ? model.NOTIFICATION_KINDS.ANNOUNCEMENT : model.NOTIFICATION_KINDS.NEW_MESSAGE,
          title: conversation.announcement ? "Program announcement" : "New message from your program",
          preview: cleanPreview(body.body),
          targetType: "conversation",
          targetId: conversation.id,
          conversationId: conversation.id,
          childId: (conversation.childIds || [])[0] || "",
          deepLink: `#family-hub?tab=messages&conversationId=${conversation.id}`,
        });
      });
    }
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      conversation,
      intendedRecipientCount: (conversation.participants || []).filter((p) => p.role === model.PARTICIPANT_ROLES.GUARDIAN).length,
      sentExternally: false,
    });
  }

  function cleanPreview(body) {
    return model.cleanText(body, 120);
  }

  async function handleReply(request, response, context = {}, conversationId) {
    const body = await readJson(request);
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    const conversation = store.familyMessaging.conversations[conversationId];
    if (!conversation || conversation.organizationId !== organization.id) return deny(response, 404, "not_found");
    const access = model.staffMayAccessConversation(store, { ...actor, organizationId: organization.id }, conversation);
    if (!access.allowed) return deny(response, 403, access.reason || "access_denied");
    const message = model.createMessageRecord({
      organizationId: organization.id,
      conversationId,
      senderEmail: actor.email,
      senderRole: isDirector(actor.role) ? model.PARTICIPANT_ROLES.DIRECTOR : model.PARTICIPANT_ROLES.STAFF,
      body: body.body,
      isInternalNote: body.isInternalNote === true,
      status: model.MESSAGE_STATUSES.DELIVERED_IN_APP,
      deliveredToInbox: conversation.participantIds.filter((e) => e !== model.participantKey(actor.email)),
      attachmentIds: body.attachmentIds || [],
    });
    store.familyMessaging.messages[message.id] = message;
    conversation.lastActivityAt = message.sentAt;
    model.appendConversationAudit(conversation, { action: "reply", by: actor.email });
    if (!message.isInternalNote) {
      conversation.participants.filter((p) => p.role === model.PARTICIPANT_ROLES.GUARDIAN).forEach((p) => {
        notifyInApp(store, {
          organizationId: organization.id,
          recipientEmail: p.email,
          recipientRole: model.PARTICIPANT_ROLES.GUARDIAN,
          kind: model.NOTIFICATION_KINDS.NEW_MESSAGE,
          title: "New message from your program",
          preview: cleanPreview(body.body),
          targetType: "conversation",
          targetId: conversation.id,
          conversationId: conversation.id,
          deepLink: `#family-hub?tab=messages&conversationId=${conversation.id}`,
        });
      });
    }
    writeStore(store);
    jsonResponse(response, 200, { ok: true, message, sentExternally: false });
  }

  async function handleEditMessage(request, response, context = {}, messageId) {
    const body = await readJson(request);
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    const message = store.familyMessaging.messages[messageId];
    if (!message || message.organizationId !== organization.id) return deny(response, 404, "not_found");
    if (safeLower(message.senderEmail) !== safeLower(actor.email) && !isDirector(actor.role)) {
      return deny(response, 403, "sender_required");
    }
    // Never silently erase — preserve original
    if (!message.originalBody) message.originalBody = message.body;
    message.editHistory = Array.isArray(message.editHistory) ? message.editHistory : [];
    message.editHistory.push({ at: model.nowIso(), previousBody: message.body, by: actor.email });
    message.body = body.body || message.body;
    message.edited = true;
    message.status = model.MESSAGE_STATUSES.EDITED;
    message.updatedAt = model.nowIso();
    store.familyMessaging.messages[message.id] = message;
    writeStore(store);
    jsonResponse(response, 200, { ok: true, message });
  }

  async function handleWithdrawMessage(request, response, context = {}, messageId) {
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    const message = store.familyMessaging.messages[messageId];
    if (!message || message.organizationId !== organization.id) return deny(response, 404, "not_found");
    if (!isDirector(actor.role) && safeLower(message.senderEmail) !== safeLower(actor.email)) {
      return deny(response, 403, "withdraw_denied");
    }
    message.withdrawn = true;
    message.withdrawnAt = model.nowIso();
    message.withdrawnNotice = "This message was withdrawn.";
    message.status = model.MESSAGE_STATUSES.WITHDRAWN;
    message.updatedAt = message.withdrawnAt;
    const conversation = store.familyMessaging.conversations[message.conversationId];
    if (conversation) model.appendConversationAudit(conversation, { action: "message_withdrawn", by: actor.email, messageId });
    store.familyMessaging.messages[message.id] = message;
    writeStore(store);
    jsonResponse(response, 200, { ok: true, message });
  }

  async function handleArchive(request, response, context = {}, conversationId) {
    const body = await readJson(request).catch(() => ({}));
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    const conversation = store.familyMessaging.conversations[conversationId];
    if (!conversation || conversation.organizationId !== organization.id) return deny(response, 404, "not_found");
    if (!model.staffMayAccessConversation(store, { ...actor, organizationId: organization.id }, conversation).allowed) {
      return deny(response, 403, "access_denied");
    }
    conversation.status = body.restore ? "active" : "archived";
    model.appendConversationAudit(conversation, { action: body.restore ? "restored" : "archived", by: actor.email });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, conversation });
  }

  async function handleAnnouncementPreview(request, response, context = {}) {
    const body = await readJson(request);
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!isDirector(actor.role)) return deny(response, 403, "director_required");
    const childIds = Array.isArray(body.childIds) ? body.childIds : [];
    const classroomId = body.classroomId || "";
    const recipients = new Set();
    listValues(store.familyFoundation.contacts).forEach((contact) => {
      if (contact.organizationId !== organization.id || contact.status !== "active") return;
      const kids = childIds.length ? childIds : listValues(store.classroomChildAssignments)
        .filter((a) => a.organizationId === organization.id && a.classroomId === classroomId && !a.endsAt)
        .map((a) => a.childId);
      const ok = kids.some((childId) => require("../scripts/family-foundation-data-model.js").evaluateContactChildAccess({
        store, organizationId: organization.id, contactId: contact.id, childId, capability: "messages",
      }).allowed);
      if (ok) recipients.add(contact.email);
    });
    jsonResponse(response, 200, {
      ok: true,
      intendedRecipientCount: recipients.size,
      // Do not return emails in confirmation to avoid accidental exposure in UI logs — only count
      confirmation: `This announcement will reach ${recipients.size} authorized family inbox(es).`,
      sentExternally: false,
    });
  }

  async function handleExport(request, response, context = {}, conversationId) {
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    if (!isDirector(actor.role)) return deny(response, 403, "director_required");
    const conversation = store.familyMessaging.conversations[conversationId];
    if (!conversation || conversation.organizationId !== organization.id) return deny(response, 404, "not_found");
    const messages = model.messagesForConversation(store, conversationId);
    const exportRow = {
      id: model.newId("fmexp"),
      organizationId: organization.id,
      conversationId,
      createdByEmail: actor.email,
      createdAt: model.nowIso(),
      participants: conversation.participants,
      relatedChildIds: conversation.childIds,
      relatedClassroomId: conversation.classroomId,
      messages: messages.map((m) => ({
        id: m.id,
        senderRole: m.senderRole,
        body: m.withdrawn ? "" : m.body,
        withdrawn: m.withdrawn === true,
        edited: m.edited === true,
        originalPreserved: Boolean(m.originalBody),
        sentAt: m.sentAt,
        attachmentIds: m.attachmentIds || [],
      })),
    };
    store.familyMessaging.exports[exportRow.id] = exportRow;
    writeStore(store);
    jsonResponse(response, 200, { ok: true, export: exportRow });
  }

  async function handleProviderNotifications(request, response, context = {}) {
    const store = readStore();
    const { organization } = ensureOrg(store, context.adminEmail);
    const { actor } = resolveActor(store, request, organization.id, context.adminEmail);
    const rows = listValues(store.familyMessaging.notifications)
      .filter((row) => row.organizationId === organization.id && safeLower(row.recipientEmail) === safeLower(actor.email))
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    jsonResponse(response, 200, {
      ok: true,
      notifications: rows,
      unreadCount: rows.filter((row) => !row.read).length,
    });
  }

  function matchRoute(method, pathname, url) {
    const path = String(pathname || "");
    if (!path.startsWith(BASE)) return null;
    if (method === "GET" && path === `${BASE}/status`) return (req, res, ctx) => handleStatus(req, res, ctx);
    if (method === "POST" && path === `${BASE}/seed`) return (req, res, ctx) => handleSeed(req, res, ctx);
    if (method === "GET" && path === `${BASE}/inbox`) return (req, res, ctx) => handleInbox(req, res, ctx, url);
    if (method === "GET" && path === `${BASE}/notifications`) return (req, res, ctx) => handleProviderNotifications(req, res, ctx);
    if (method === "POST" && path === `${BASE}/conversations`) return (req, res, ctx) => handleCreateConversation(req, res, ctx);
    if (method === "POST" && path === `${BASE}/announcements/preview`) return (req, res, ctx) => handleAnnouncementPreview(req, res, ctx);
    if (method === "GET" && /^\/api\/director-center\/family-messaging\/conversations\/[^/]+$/.test(path)) {
      const id = decodeURIComponent(path.split("/conversations/")[1]);
      return (req, res, ctx) => handleGetConversation(req, res, ctx, id);
    }
    if (method === "POST" && /\/conversations\/[^/]+\/reply$/.test(path)) {
      const id = decodeURIComponent(path.split("/conversations/")[1].split("/reply")[0]);
      return (req, res, ctx) => handleReply(req, res, ctx, id);
    }
    if (method === "POST" && /\/conversations\/[^/]+\/archive$/.test(path)) {
      const id = decodeURIComponent(path.split("/conversations/")[1].split("/archive")[0]);
      return (req, res, ctx) => handleArchive(req, res, ctx, id);
    }
    if (method === "POST" && /\/conversations\/[^/]+\/export$/.test(path)) {
      const id = decodeURIComponent(path.split("/conversations/")[1].split("/export")[0]);
      return (req, res, ctx) => handleExport(req, res, ctx, id);
    }
    if (method === "POST" && /\/messages\/[^/]+\/edit$/.test(path)) {
      const id = decodeURIComponent(path.split("/messages/")[1].split("/edit")[0]);
      return (req, res, ctx) => handleEditMessage(req, res, ctx, id);
    }
    if (method === "POST" && /\/messages\/[^/]+\/withdraw$/.test(path)) {
      const id = decodeURIComponent(path.split("/messages/")[1].split("/withdraw")[0]);
      return (req, res, ctx) => handleWithdrawMessage(req, res, ctx, id);
    }
    return null;
  }

  return { matchRoute };
}

module.exports = { createFamilyMessagingApi, BASE };
