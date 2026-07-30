/**
 * Admin messaging inbox helpers — welcome vs real-user conversations,
 * email-alert prefs, and mark read/unread without deleting history.
 */
"use strict";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isWelcomeAutomationMessage(message) {
  if (!message || message.audience !== "private") return false;
  if (message.senderType !== "admin") return false;
  const channel = String(message.channel || "");
  const sequence = String(message.onboardingSequenceId || "");
  return channel === "onboarding_welcome" || sequence === "free-welcome" || sequence.startsWith("free-welcome");
}

function conversationMessages(store, userEmail) {
  const email = normalizeEmail(userEmail);
  return (Array.isArray(store?.messages) ? store.messages : []).filter(
    (m) => m && m.audience === "private" && normalizeEmail(m.conversationEmail) === email,
  );
}

function classifyConversation(store, userEmail) {
  const msgs = conversationMessages(store, userEmail);
  const hasUserReply = msgs.some((m) => m.senderType === "user");
  const hasWelcome = msgs.some((m) => isWelcomeAutomationMessage(m));
  const isWelcomeOnly = !hasUserReply && hasWelcome && msgs.every(
    (m) => m.senderType === "admin" && isWelcomeAutomationMessage(m),
  );
  const isAdminOutreachOnly = !hasUserReply && !isWelcomeOnly && msgs.some((m) => m.senderType === "admin");
  let bucket = "inbox";
  if (isWelcomeOnly) bucket = "welcome";
  else if (!hasUserReply && isAdminOutreachOnly) bucket = "sent";
  else if (!hasUserReply) bucket = "other";
  return {
    hasUserReply,
    hasWelcome,
    isWelcomeOnly,
    isAdminOutreachOnly,
    bucket,
  };
}

function ensureAdminMessagingSettings(store) {
  if (!store.adminMessagingSettings || typeof store.adminMessagingSettings !== "object") {
    store.adminMessagingSettings = {};
  }
  if (typeof store.adminMessagingSettings.emailOnMemberMessage !== "boolean") {
    // Default ON so new member messages email the admin; toggle can disable.
    store.adminMessagingSettings.emailOnMemberMessage = true;
  }
  if (!Array.isArray(store.adminMessageEmailLog)) {
    store.adminMessageEmailLog = [];
  }
  return store.adminMessagingSettings;
}

function alreadyEmailedMemberMessage(store, messageId) {
  const id = String(messageId || "");
  if (!id) return false;
  ensureAdminMessagingSettings(store);
  return store.adminMessageEmailLog.some((row) => String(row?.messageId || "") === id);
}

function recordMemberMessageEmail(store, messageId, max = 5000) {
  const id = String(messageId || "");
  if (!id) return;
  ensureAdminMessagingSettings(store);
  if (alreadyEmailedMemberMessage(store, id)) return;
  store.adminMessageEmailLog.unshift({ messageId: id, sentAt: new Date().toISOString() });
  if (store.adminMessageEmailLog.length > max) {
    store.adminMessageEmailLog = store.adminMessageEmailLog.slice(0, max);
  }
}

function isAdminConversationNotificationRow(n) {
  if (!n) return false;
  const type = String(n.type || "");
  return type === "message" || type === "admin_new_message" || type === "admin_message_reply";
}

function setConversationNotificationsRead(store, {
  userEmail,
  adminEmails = [],
  read = true,
  isAdminConversationUnreadNotification,
  createUnreadIfMissing = false,
} = {}) {
  const email = normalizeEmail(userEmail);
  if (!email) return 0;
  const allowed = new Set((adminEmails || []).map(normalizeEmail).filter(Boolean));
  const now = new Date().toISOString();
  let changed = 0;
  if (!Array.isArray(store.notifications)) store.notifications = [];
  store.notifications.forEach((n) => {
    if (!n) return;
    if (normalizeEmail(n.conversationEmail) !== email) return;
    if (allowed.size && !allowed.has(normalizeEmail(n.email))) return;
    if (typeof isAdminConversationUnreadNotification === "function") {
      // When marking read, only touch unread admin conversation notifications.
      // When marking unread, allow flipping read ones for this conversation.
      if (read) {
        if (!isAdminConversationUnreadNotification(n)) return;
      } else if (!isAdminConversationNotificationRow(n)) {
        return;
      }
    } else if (!isAdminConversationNotificationRow(n)) {
      return;
    }
    if (read) {
      if (!n.read) {
        n.read = true;
        n.readAt = now;
        changed += 1;
      }
    } else if (n.read) {
      n.read = false;
      n.readAt = "";
      changed += 1;
    }
  });
  // Mark as unread with no prior notification row — create one so the badge returns.
  if (!read && changed === 0 && createUnreadIfMissing && allowed.size) {
    const lastUserMsg = conversationMessages(store, email)
      .filter((m) => m.senderType === "user")
      .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")))
      .at(-1);
    const adminEmail = [...allowed][0];
    store.notifications.unshift({
      id: `n-mark-unread-${Date.now().toString(36)}`,
      email: adminEmail,
      type: "admin_message_reply",
      category: "messaging",
      title: "Marked unread",
      preview: String(lastUserMsg?.body || "Conversation marked unread").slice(0, 160),
      messageId: lastUserMsg?.id || "",
      refId: lastUserMsg?.id || "",
      conversationEmail: email,
      createdAt: now,
      read: false,
    });
    changed += 1;
  }
  return changed;
}

module.exports = {
  normalizeEmail,
  isWelcomeAutomationMessage,
  conversationMessages,
  classifyConversation,
  ensureAdminMessagingSettings,
  alreadyEmailedMemberMessage,
  recordMemberMessageEmail,
  setConversationNotificationsRead,
};
