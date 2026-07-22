/**
 * Phase 11 Family Hub messaging/notification handlers (mounted under /api/family-hub).
 */

function createFamilyHubMessagingHandlers({
  messagingModel,
  messagingFixtures,
  updatesModel,
  familyModel,
  hub,
  listValues,
  safeLower,
  withGuardian,
  deny,
  readJson,
  writeStore,
  jsonResponse,
  env,
  TESTING_BANNER,
}) {
  async function handleMessagesInbox(request, response, url) {
    const childId = url?.searchParams?.get("childId") || "";
    const ctx = withGuardian(request, response, { capability: "messages", childId: childId || undefined });
    if (!ctx) return;
    const { store, actor, children, selectedChildId } = ctx;
    messagingModel.ensureFamilyMessagingStore(store);
    const q = String(url?.searchParams?.get("q") || "").trim().toLowerCase();
    const archived = String(url?.searchParams?.get("archived") || "") === "1";
    let rows = listValues(store.familyMessaging.conversations).filter((row) => {
      if (row.organizationId !== actor.organizationId) return false;
      return messagingModel.guardianMayAccessConversation(store, actor.contact, row).allowed;
    });
    rows = rows.filter((row) => {
      const prefs = listValues(store.familyMessaging.participantPrefs).find((p) => (
        p.conversationId === row.id && messagingModel.participantKey(p.participantKey) === messagingModel.participantKey(actor.email)
      ));
      return archived ? prefs?.archivedView === true : prefs?.archivedView !== true && row.status !== "archived";
    });
    if (selectedChildId) {
      rows = rows.filter((row) => !row.childIds?.length || row.childIds.includes(selectedChildId) || row.announcement);
    }
    if (q) rows = rows.filter((row) => String(row.subject || "").toLowerCase().includes(q));
    rows.sort((a, b) => String(b.lastActivityAt || "").localeCompare(String(a.lastActivityAt || "")));
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      label: TESTING_BANNER,
      children,
      selectedChildId: selectedChildId || "",
      unreadMessages: messagingModel.unreadCountForEmail(store, actor.organizationId, actor.email),
      conversations: rows.map((row) => messagingModel.familySafeConversation(row, { email: actor.email })),
    });
  }

  async function handleMessageThread(request, response, conversationId) {
    const ctx = withGuardian(request, response, { capability: "messages" });
    if (!ctx) return;
    const { store, actor } = ctx;
    const conversation = store.familyMessaging.conversations[conversationId];
    const access = messagingModel.guardianMayAccessConversation(store, actor.contact, conversation);
    if (!access.allowed) return deny(response, 403, access.reason || "access_denied", hub.RESTRICTED_UNAVAILABLE_MESSAGE);
    const messages = messagingModel.messagesForConversation(store, conversationId)
      .map((msg) => messagingModel.familySafeMessage(msg))
      .filter(Boolean);
    listValues(store.familyMessaging.notifications).forEach((note) => {
      if (note.conversationId === conversationId && safeLower(note.recipientEmail) === actor.email && !note.adminOnly) {
        note.read = true;
        note.readAt = hub.nowIso();
      }
    });
    listValues(store.familyMessaging.messages).forEach((msg) => {
      if (msg.conversationId === conversationId && !msg.isInternalNote) {
        msg.readBy = Array.isArray(msg.readBy) ? msg.readBy : [];
        if (!msg.readBy.includes(actor.email)) msg.readBy.push(actor.email);
      }
    });
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      conversation: messagingModel.familySafeConversation(conversation, { email: actor.email }),
      messages,
      canReply: conversation.allowFamilyReplies !== false && conversation.type !== messagingModel.CONVERSATION_TYPES.INTERNAL_STAFF,
    });
  }

  async function handleMessageReply(request, response, conversationId) {
    const body = await readJson(request);
    const ctx = withGuardian(request, response, { capability: "messages" });
    if (!ctx) return;
    const { store, actor } = ctx;
    let conversation = store.familyMessaging.conversations[conversationId];
    const access = messagingModel.guardianMayAccessConversation(store, actor.contact, conversation);
    if (!access.allowed) return deny(response, 403, access.reason || "access_denied", hub.RESTRICTED_UNAVAILABLE_MESSAGE);
    if (conversation.announcement === true) {
      let privateThread = listValues(store.familyMessaging.conversations).find((row) => (
        row.privateReplyThreadOfId === conversation.id
        && messagingModel.conversationIncludesParticipant(row, actor.email)
        && row.type === messagingModel.CONVERSATION_TYPES.DIRECTOR_GUARDIAN
      ));
      if (!privateThread) {
        const staffParticipants = (conversation.participants || []).filter((p) => p.role !== messagingModel.PARTICIPANT_ROLES.GUARDIAN);
        privateThread = messagingModel.createConversationRecord({
          organizationId: actor.organizationId,
          type: messagingModel.CONVERSATION_TYPES.DIRECTOR_GUARDIAN,
          subject: `Re: ${conversation.subject}`,
          childIds: conversation.childIds || [],
          classroomId: conversation.classroomId || "",
          privateReplyThreadOfId: conversation.id,
          createdByEmail: actor.email,
          createdByRole: messagingModel.PARTICIPANT_ROLES.GUARDIAN,
          participants: [
            ...staffParticipants,
            { email: actor.email, displayName: actor.contact.displayName, role: messagingModel.PARTICIPANT_ROLES.GUARDIAN, contactId: actor.contact.id },
          ],
          participantIds: [...staffParticipants.map((p) => p.email), actor.email].map((e) => messagingModel.participantKey(e)),
        });
        store.familyMessaging.conversations[privateThread.id] = privateThread;
      }
      conversation = privateThread;
    } else if (conversation.allowFamilyReplies === false) {
      return deny(response, 403, "replies_disabled", hub.RESTRICTED_UNAVAILABLE_MESSAGE);
    }
    const message = messagingModel.createMessageRecord({
      organizationId: actor.organizationId,
      conversationId: conversation.id,
      senderEmail: actor.email,
      senderRole: messagingModel.PARTICIPANT_ROLES.GUARDIAN,
      body: body.body,
      status: messagingModel.MESSAGE_STATUSES.DELIVERED_IN_APP,
      deliveredToInbox: conversation.participantIds.filter((e) => e !== messagingModel.participantKey(actor.email)),
      attachmentIds: body.attachmentIds || [],
    });
    store.familyMessaging.messages[message.id] = message;
    conversation.lastActivityAt = message.sentAt;
    conversation.participants.filter((p) => p.role !== messagingModel.PARTICIPANT_ROLES.GUARDIAN).forEach((p) => {
      const note = messagingModel.createNotificationRecord({
        organizationId: actor.organizationId,
        recipientEmail: p.email,
        recipientRole: p.role,
        kind: messagingModel.NOTIFICATION_KINDS.FAMILY_REPLY,
        title: "Family reply",
        preview: messagingModel.cleanText(body.body, 120),
        targetType: "conversation",
        targetId: conversation.id,
        conversationId: conversation.id,
        deepLink: "#director-center",
      });
      store.familyMessaging.notifications[note.id] = note;
    });
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      conversationId: conversation.id,
      message: messagingModel.familySafeMessage(message),
      sentExternally: false,
    });
  }

  async function handleStartConversation(request, response) {
    const body = await readJson(request);
    const childId = String(body.childId || "").trim();
    const ctx = withGuardian(request, response, { capability: "messages", childId });
    if (!ctx) return;
    const { store, actor } = ctx;
    if (!childId) return deny(response, 400, "child_required");
    const access = familyModel.evaluateContactChildAccess({
      store, organizationId: actor.organizationId, contactId: actor.contact.id, childId, capability: "messages",
    });
    if (!access.allowed) return deny(response, 403, access.reason || "access_denied", hub.RESTRICTED_UNAVAILABLE_MESSAGE);
    const staff = listValues(store.staffMemberships).find((row) => (
      row.organizationId === actor.organizationId && (row.role === "director_owner" || row.role === "director")
    )) || listValues(store.staffMemberships).find((row) => row.organizationId === actor.organizationId);
    const conversation = messagingModel.createConversationRecord({
      organizationId: actor.organizationId,
      type: messagingModel.CONVERSATION_TYPES.DIRECTOR_GUARDIAN,
      subject: body.subject || "Message to program",
      childIds: [childId],
      createdByEmail: actor.email,
      createdByRole: messagingModel.PARTICIPANT_ROLES.GUARDIAN,
      participants: [
        { email: staff?.userEmail || "program@example.invalid", displayName: staff?.displayName || "Program", role: messagingModel.PARTICIPANT_ROLES.DIRECTOR },
        { email: actor.email, displayName: actor.contact.displayName, role: messagingModel.PARTICIPANT_ROLES.GUARDIAN, contactId: actor.contact.id },
      ],
      participantIds: [staff?.userEmail || "program@example.invalid", actor.email].map((e) => messagingModel.participantKey(e)),
    });
    store.familyMessaging.conversations[conversation.id] = conversation;
    if (body.body) {
      const message = messagingModel.createMessageRecord({
        organizationId: actor.organizationId,
        conversationId: conversation.id,
        senderEmail: actor.email,
        senderRole: messagingModel.PARTICIPANT_ROLES.GUARDIAN,
        body: body.body,
        status: messagingModel.MESSAGE_STATUSES.DELIVERED_IN_APP,
        deliveredToInbox: conversation.participantIds.filter((e) => e !== messagingModel.participantKey(actor.email)),
      });
      store.familyMessaging.messages[message.id] = message;
      conversation.lastActivityAt = message.sentAt;
    }
    writeStore(store);
    jsonResponse(response, 200, { ok: true, conversation: messagingModel.familySafeConversation(conversation, { email: actor.email }), sentExternally: false });
  }

  async function handleSaveDraft(request, response) {
    const body = await readJson(request);
    const ctx = withGuardian(request, response, { capability: "messages" });
    if (!ctx) return;
    const { store, actor } = ctx;
    const conversationId = String(body.conversationId || "").trim();
    const conversation = store.familyMessaging.conversations[conversationId];
    if (!messagingModel.guardianMayAccessConversation(store, actor.contact, conversation).allowed) {
      return deny(response, 403, "access_denied", hub.RESTRICTED_UNAVAILABLE_MESSAGE);
    }
    let draft = listValues(store.familyMessaging.drafts).find((row) => (
      row.conversationId === conversationId && safeLower(row.authorEmail) === actor.email
    ));
    if (!draft) {
      draft = messagingModel.createDraftRecord({
        organizationId: actor.organizationId,
        conversationId,
        authorEmail: actor.email,
        body: body.body || "",
      });
    } else {
      draft.body = body.body || "";
      draft.autosavedAt = messagingModel.nowIso();
      draft.updatedAt = draft.autosavedAt;
    }
    store.familyMessaging.drafts[draft.id] = draft;
    writeStore(store);
    jsonResponse(response, 200, { ok: true, draft, autosaved: true });
  }

  async function handleMessagePrefs(request, response, conversationId) {
    const body = await readJson(request);
    const ctx = withGuardian(request, response, { capability: "messages" });
    if (!ctx) return;
    const { store, actor } = ctx;
    const conversation = store.familyMessaging.conversations[conversationId];
    if (!messagingModel.guardianMayAccessConversation(store, actor.contact, conversation).allowed) {
      return deny(response, 403, "access_denied", hub.RESTRICTED_UNAVAILABLE_MESSAGE);
    }
    let prefs = listValues(store.familyMessaging.participantPrefs).find((row) => (
      row.conversationId === conversationId && messagingModel.participantKey(row.participantKey) === actor.email
    ));
    if (!prefs) {
      prefs = messagingModel.createParticipantPrefs({
        organizationId: actor.organizationId,
        conversationId,
        participantKey: actor.email,
      });
    }
    if (body.muted !== undefined) prefs.muted = body.muted === true;
    if (body.pinned !== undefined) prefs.pinned = body.pinned === true;
    if (body.favorite !== undefined) prefs.favorite = body.favorite === true;
    if (body.archivedView !== undefined) prefs.archivedView = body.archivedView === true;
    if (body.markUnread !== undefined) prefs.markUnread = body.markUnread === true;
    prefs.updatedAt = messagingModel.nowIso();
    store.familyMessaging.participantPrefs[prefs.id] = prefs;
    writeStore(store);
    jsonResponse(response, 200, { ok: true, prefs });
  }

  async function handleReportConcernMessage(request, response) {
    const body = await readJson(request);
    const ctx = withGuardian(request, response, { capability: "messages" });
    if (!ctx) return;
    const { store, actor } = ctx;
    const concern = updatesModel.createConcernRequestRecord({
      organizationId: actor.organizationId,
      contactId: actor.contact.id,
      childId: body.childId || "",
      targetType: "message",
      targetId: body.messageId || body.conversationId || "",
      message: body.message || "Messaging concern reported (fixture).",
    });
    store.familyUpdates.concernRequests[concern.id] = concern;
    writeStore(store);
    jsonResponse(response, 200, { ok: true, concernRequest: concern, note: "Stored for provider review. No external notification sent." });
  }

  async function handleFamilyNotifications(request, response) {
    const ctx = withGuardian(request, response, { capability: "digital" });
    if (!ctx) return;
    const { store, actor } = ctx;
    messagingModel.ensureFamilyMessagingStore(store);
    const rows = listValues(store.familyMessaging.notifications)
      .filter((row) => safeLower(row.recipientEmail) === actor.email && row.organizationId === actor.organizationId)
      .map((row) => messagingModel.memberSafeNotification(row))
      .filter(Boolean)
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    if (rows.some((row) => row && (row.adminOnly || row.kind === "admin_only"))) {
      return deny(response, 500, "admin_notification_isolation_violation");
    }
    jsonResponse(response, 200, {
      ok: true,
      notifications: rows,
      unreadCount: rows.filter((row) => !row.read).length,
      sentExternally: false,
    });
  }

  async function handleMarkNotificationsRead(request, response) {
    const body = await readJson(request).catch(() => ({}));
    const ctx = withGuardian(request, response, { capability: "digital" });
    if (!ctx) return;
    const { store, actor } = ctx;
    const ids = Array.isArray(body.ids) ? body.ids : null;
    listValues(store.familyMessaging.notifications).forEach((note) => {
      if (safeLower(note.recipientEmail) !== actor.email || note.adminOnly) return;
      if (ids && !ids.includes(note.id)) return;
      if (note.targetType === "conversation" && note.targetId && !store.familyMessaging.conversations[note.targetId]) {
        note.read = true;
        note.readAt = messagingModel.nowIso();
        note.preview = "This item is no longer available.";
        return;
      }
      note.read = true;
      note.readAt = messagingModel.nowIso();
    });
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      unreadCount: messagingModel.unreadCountForEmail(store, actor.organizationId, actor.email),
    });
  }

  async function handleNotificationOpen(request, response, notificationId) {
    const ctx = withGuardian(request, response, { capability: "digital" });
    if (!ctx) return;
    const { store, actor } = ctx;
    const note = store.familyMessaging.notifications[notificationId];
    if (!note || safeLower(note.recipientEmail) !== actor.email || note.adminOnly) {
      return deny(response, 403, "notification_unavailable", hub.RESTRICTED_UNAVAILABLE_MESSAGE);
    }
    if (note.targetType === "conversation") {
      const conversation = store.familyMessaging.conversations[note.targetId];
      if (!conversation || !messagingModel.guardianMayAccessConversation(store, actor.contact, conversation).allowed) {
        note.read = true;
        note.readAt = messagingModel.nowIso();
        writeStore(store);
        return deny(response, 403, "target_unavailable", hub.RESTRICTED_UNAVAILABLE_MESSAGE);
      }
    }
    note.read = true;
    note.readAt = messagingModel.nowIso();
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      notification: messagingModel.memberSafeNotification(note),
      deepLink: note.deepLink,
    });
  }

  async function handleAttachmentUpload(request, response) {
    const body = await readJson(request);
    const ctx = withGuardian(request, response, { capability: "messages" });
    if (!ctx) return;
    const { store, actor } = ctx;
    if (env().liveProduction) return deny(response, 403, "production_locked");
    const conversation = store.familyMessaging.conversations[body.conversationId];
    if (!messagingModel.guardianMayAccessConversation(store, actor.contact, conversation).allowed) {
      return deny(response, 403, "access_denied", hub.RESTRICTED_UNAVAILABLE_MESSAGE);
    }
    const validation = messagingModel.validateAttachmentUpload({
      mimeType: body.mimeType,
      byteSize: body.byteSize,
      fileName: body.fileName,
      contentBase64: body.contentBase64,
    });
    if (!validation.ok) return deny(response, 400, validation.reason, "Attachment rejected.");
    const att = messagingModel.createAttachmentRecord({
      organizationId: actor.organizationId,
      conversationId: body.conversationId,
      uploadedByEmail: actor.email,
      fileName: body.fileName,
      mimeType: body.mimeType,
      byteSize: validation.byteSize,
      contentBase64: body.contentBase64 || "",
    });
    store.familyMessaging.attachments[att.id] = att;
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      attachment: { ...att, contentBase64: undefined, publicUrl: null, hasContent: Boolean(att.contentBase64) },
    });
  }

  async function handleAttachmentContent(request, response, attachmentId) {
    const ctx = withGuardian(request, response, { capability: "messages" });
    if (!ctx) return;
    const { store, actor } = ctx;
    const att = store.familyMessaging.attachments[attachmentId];
    if (!att || att.organizationId !== actor.organizationId) return deny(response, 404, "not_found");
    const conversation = store.familyMessaging.conversations[att.conversationId];
    if (!messagingModel.guardianMayAccessConversation(store, actor.contact, conversation).allowed) {
      return deny(response, 403, "access_denied", hub.RESTRICTED_UNAVAILABLE_MESSAGE);
    }
    if (att.status === "withdrawn") return deny(response, 403, "withdrawn");
    jsonResponse(response, 200, {
      ok: true,
      mimeType: att.mimeType,
      fileName: att.fileName,
      contentBase64: att.contentBase64 || "",
      publicUrl: null,
      placeholderLabel: att.placeholderLabel,
    });
  }

  async function handleDeliveryPreferences(request, response) {
    const body = request.method === "GET" ? {} : await readJson(request).catch(() => ({}));
    const ctx = withGuardian(request, response, { capability: "digital" });
    if (!ctx) return;
    const { store, actor } = ctx;
    let prefs = listValues(store.familyMessaging.deliveryPreferences).find((row) => (
      safeLower(row.email) === actor.email || row.contactId === actor.contact.id
    ));
    if (!prefs) {
      prefs = messagingModel.defaultDeliveryPreferences({
        organizationId: actor.organizationId,
        contactId: actor.contact.id,
        email: actor.email,
      });
      store.familyMessaging.deliveryPreferences[prefs.id] = prefs;
    }
    if (request.method === "GET") {
      writeStore(store);
      jsonResponse(response, 200, { ok: true, deliveryPreferences: prefs, outboundDisabled: true });
      return;
    }
    if (body.channels) {
      prefs.channels = { inApp: body.channels.inApp !== false, email: false, sms: false, push: false };
    }
    if (body.cadence) {
      prefs.cadence = {
        immediate: body.cadence.immediate === true,
        dailyDigest: body.cadence.dailyDigest === true,
        weeklyDigest: body.cadence.weeklyDigest === true,
      };
    }
    if (body.quietHours) prefs.quietHours = { ...prefs.quietHours, ...body.quietHours };
    if (body.messagePreviewPrivacy) prefs.messagePreviewPrivacy = body.messagePreviewPrivacy;
    prefs.updatedAt = messagingModel.nowIso();
    store.familyMessaging.deliveryPreferences[prefs.id] = prefs;
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      deliveryPreferences: prefs,
      sentExternally: false,
      note: "Preferences saved. Email/SMS/push delivery remains disabled in this phase.",
    });
  }

  return {
    handleMessagesInbox,
    handleMessageThread,
    handleMessageReply,
    handleStartConversation,
    handleSaveDraft,
    handleMessagePrefs,
    handleReportConcernMessage,
    handleFamilyNotifications,
    handleMarkNotificationsRead,
    handleNotificationOpen,
    handleAttachmentUpload,
    handleAttachmentContent,
    handleDeliveryPreferences,
  };
}

module.exports = { createFamilyHubMessagingHandlers };
