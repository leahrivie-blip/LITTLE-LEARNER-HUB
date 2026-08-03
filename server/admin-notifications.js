/**
 * Admin notification helpers — in-app (+ optional push via fanOut) with
 * short-window dedupe and category tags for the Admin Notification Center.
 *
 * Categories: signup | messaging | reports | billing | support | system
 */
"use strict";

const CATEGORIES = Object.freeze([
  "signup",
  "messaging",
  "reports",
  "billing",
  "support",
  "system",
]);

const DEDUPE_WINDOW_MS = 2 * 60 * 1000;

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function clampText(value, max = 240) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function adminDeepLink({
  category = "",
  type = "",
  email = "",
  conversationEmail = "",
  refId = "",
  adminPanel = "notifications",
} = {}) {
  const params = new URLSearchParams({
    view: "admin",
    adminPanel: String(adminPanel || "notifications").trim() || "notifications",
  });
  if (category) params.set("adminNotifCategory", category);
  if (type) params.set("adminNotifType", type);
  if (email) params.set("adminFocusEmail", normalizeEmail(email));
  if (conversationEmail) params.set("adminFocusConversation", normalizeEmail(conversationEmail));
  if (refId) params.set("adminFocusRef", String(refId));
  return `/?${params.toString()}`;
}

function resolveAdminRecipientEmails(deps = {}) {
  const emails = [];
  const push = (value) => {
    const email = normalizeEmail(value);
    if (email && !emails.includes(email)) emails.push(email);
  };
  if (Array.isArray(deps.ADMIN_EMAILS)) deps.ADMIN_EMAILS.forEach(push);
  else if (deps.ADMIN_EMAILS) String(deps.ADMIN_EMAILS).split(/[,;\s]+/).forEach(push);
  push(deps.ADMIN_EMAIL);
  return emails;
}

function isDuplicateAdminAlert(store, { type, refId, email }, nowMs = Date.now()) {
  const adminEmails = new Set(
    [
      ...(Array.isArray(store?.__adminEmails) ? store.__adminEmails : []),
      store?.__adminEmail || "",
    ].map(normalizeEmail).filter(Boolean),
  );
  const notifications = Array.isArray(store?.notifications) ? store.notifications : [];
  const typeKey = String(type || "");
  const refKey = String(refId || "");
  const emailKey = normalizeEmail(email);
  return notifications.some((n) => {
    if (!n || !adminEmails.has(normalizeEmail(n.email))) return false;
    if (String(n.type || "") !== typeKey) return false;
    if (refKey && String(n.refId || n.messageId || "") === refKey) {
      const created = new Date(n.createdAt || 0).getTime();
      return Number.isFinite(created) && (nowMs - created) < DEDUPE_WINDOW_MS;
    }
    if (!refKey && emailKey && String(n.preview || "").toLowerCase().includes(emailKey)) {
      const created = new Date(n.createdAt || 0).getTime();
      return Number.isFinite(created) && (nowMs - created) < DEDUPE_WINDOW_MS;
    }
    return false;
  });
}

/**
 * Emit one admin alert (in-app + push if admin opted in).
 * @param {object} store
 * @param {object} deps - { ADMIN_EMAIL, ADMIN_EMAILS?, fanOutNotificationsAndPush, notifyAdminEmail?, writeStore? }
 * @param {object} opts
 */
async function emitAdminAlert(store, deps, opts = {}) {
  const adminEmails = resolveAdminRecipientEmails(deps);
  if (!adminEmails.length || typeof deps.fanOutNotificationsAndPush !== "function") {
    return { ok: false, skipped: "no_admin" };
  }
  store.__adminEmail = adminEmails[0];
  store.__adminEmails = adminEmails;

  const category = CATEGORIES.includes(opts.category) ? opts.category : "system";
  const type = String(opts.type || `admin_${category}`).trim();
  const title = clampText(opts.title || "Admin alert", 200);
  const preview = clampText(opts.preview || "", 240);
  const refId = String(opts.refId || "");
  const relatedEmail = normalizeEmail(opts.email || "");
  const conversationEmail = normalizeEmail(opts.conversationEmail || relatedEmail);
  const deepLink = opts.deepLink || adminDeepLink({
    category,
    type,
    email: relatedEmail,
    conversationEmail,
    refId,
  });

  if (isDuplicateAdminAlert(store, { type, refId, email: relatedEmail })) {
    return { ok: true, skipped: "duplicate" };
  }

  const summary = await deps.fanOutNotificationsAndPush(store, {
    type,
    recipients: adminEmails,
    title,
    preview,
    messageId: opts.messageId || "",
    conversationEmail: conversationEmail || "",
    refId,
    senderName: opts.senderName || "Little Learner Hub",
    url: deepLink,
    category,
  });

  if (opts.sendEmail && typeof deps.notifyAdminEmail === "function") {
    try {
      await deps.notifyAdminEmail({
        kind: opts.emailKind || category,
        topic: title,
        title,
        email: relatedEmail,
        name: opts.name || "",
        message: preview,
        preview,
        createdAt: new Date().toISOString(),
        fields: opts.emailFields || [],
        ownerEventType: type,
        alertType: type,
        refId,
        deepLink,
        extras: opts.emailExtras || {},
      });
    } catch (error) {
      console.warn("[admin-notifications] email failed:", error?.message || error);
    }
  }

  return { ok: true, summary, deepLink, category, type };
}

function listAdminNotifications(store, adminEmail, { category = "", unreadOnly = false, limit = 100, adminEmails = null } = {}) {
  const allowed = new Set(
    [
      ...(Array.isArray(adminEmails) ? adminEmails : []),
      adminEmail,
    ].map(normalizeEmail).filter(Boolean),
  );
  const seen = new Set();
  const items = (Array.isArray(store?.notifications) ? store.notifications : [])
    .filter((n) => n && allowed.has(normalizeEmail(n.email)))
    .filter((n) => !category || String(n.category || inferCategory(n.type)) === category)
    .filter((n) => !unreadOnly || !n.read)
    .filter((n) => {
      // Deduplicate the same alert fan-out across multiple admin inboxes.
      const key = [
        String(n.type || ""),
        String(n.refId || n.messageId || ""),
        String(n.conversationEmail || ""),
        String(n.title || ""),
        String(n.preview || ""),
        String(n.createdAt || ""),
      ].join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, Math.max(1, Math.min(Number(limit) || 100, 300)));
  return items.map((n) => ({
    id: n.id,
    type: n.type || "",
    category: n.category || inferCategory(n.type),
    title: n.title || "",
    preview: n.preview || "",
    createdAt: n.createdAt || "",
    read: Boolean(n.read),
    readAt: n.readAt || "",
    refId: n.refId || n.messageId || "",
    conversationEmail: n.conversationEmail || "",
    deepLink: n.deepLink || adminDeepLink({
      category: n.category || inferCategory(n.type),
      type: n.type,
      conversationEmail: n.conversationEmail,
      refId: n.refId || n.messageId,
    }),
  }));
}

function inferCategory(type = "") {
  const t = String(type || "").toLowerCase();
  if (t.includes("signup") || t.includes("new_user")) return "signup";
  if (t.includes("message") || t.includes("reply")) return "messaging";
  if (t.includes("billing") || t.includes("payment") || t.includes("subscription") || t.includes("trial") || t.includes("founding") || t.includes("renew")) {
    return "billing";
  }
  if (t.includes("incident") || t.includes("report") || t.includes("documentation") || t.includes("parent")) return "reports";
  if (t.includes("support") || t.includes("bug") || t.includes("feature") || t.includes("ticket")) return "support";
  return "system";
}

function markAdminNotificationsRead(store, adminEmail, { ids = [], all = false, adminEmails = null } = {}) {
  const allowed = new Set(
    [
      ...(Array.isArray(adminEmails) ? adminEmails : []),
      adminEmail,
    ].map(normalizeEmail).filter(Boolean),
  );
  const idSet = new Set((ids || []).map(String));
  const now = new Date().toISOString();
  let changed = 0;
  (store.notifications || []).forEach((n) => {
    if (!n || !allowed.has(normalizeEmail(n.email))) return;
    if (!all && !idSet.has(String(n.id))) return;
    if (!n.read) {
      n.read = true;
      n.readAt = now;
      changed += 1;
    }
  });
  return changed;
}

module.exports = {
  CATEGORIES,
  DEDUPE_WINDOW_MS,
  adminDeepLink,
  isDuplicateAdminAlert,
  emitAdminAlert,
  listAdminNotifications,
  inferCategory,
  markAdminNotificationsRead,
  clampText,
  resolveAdminRecipientEmails,
};
