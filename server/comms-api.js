/**
 * Communication ecosystem API handlers — drafts, message center, templates,
 * tags, timeline, user health, automations, broadcast log, and admin alerts.
 *
 * Pure HTTP handlers + store helpers. Wire routes from server/index.js via
 * createCommsApi(deps). Does not attach routes itself.
 */

const crypto = require("crypto");
const commsLib = require("./comms-lib.js");

const MAX_UNIVERSAL_DRAFTS = 5000;
const MAX_TIMELINE = 2000;
const MAX_BROADCAST_LOG = 500;
const MAX_ARCHIVED = 2000;
const MAX_AUTOMATION_RUNS = 2000;

function clampArray(list, max) {
  if (!Array.isArray(list)) return [];
  return list.length > max ? list.slice(0, max) : list;
}

function randomId(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
}

function sortNewestFirst(a, b) {
  const left = String(a.at || a.createdAt || a.updatedAt || "");
  const right = String(b.at || b.createdAt || b.updatedAt || "");
  return left < right ? 1 : left > right ? -1 : 0;
}

function publicTicket(ticket) {
  return {
    id: ticket.id,
    kind: ticket.kind,
    name: ticket.name,
    email: ticket.email,
    createdBy: ticket.createdBy,
    topic: ticket.topic,
    message: ticket.message,
    status: ticket.status,
    reply: ticket.reply || "",
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  };
}

function publicBugReport(item) {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    category: item.category,
    screenshotUrl: item.screenshotUrl || "",
    email: item.email,
    name: item.name,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function publicFeatureRequest(item) {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    category: item.category,
    email: item.email,
    name: item.name,
    status: item.status,
    votes: item.votes || 0,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function publicFeedback(item) {
  return {
    id: item.id,
    type: item.type,
    message: item.message,
    email: item.email,
    name: item.name,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function publicDraft(draft) {
  return {
    id: draft.id || draft.key,
    key: draft.key || draft.id,
    scope: draft.scope || "",
    ownerEmail: draft.ownerEmail || "",
    formId: draft.formId || "",
    payload: draft.payload && typeof draft.payload === "object" ? draft.payload : {},
    updatedAt: draft.updatedAt || "",
    createdAt: draft.createdAt || draft.updatedAt || "",
  };
}

function ensureCommsStore(store) {
  store.universalDrafts = Array.isArray(store.universalDrafts) ? store.universalDrafts : [];
  store.messageTemplates = Array.isArray(store.messageTemplates) ? store.messageTemplates : [];
  store.userTags = store.userTags && typeof store.userTags === "object" ? store.userTags : {};
  store.userTimeline = Array.isArray(store.userTimeline) ? store.userTimeline : [];
  store.broadcastLog = Array.isArray(store.broadcastLog) ? store.broadcastLog : [];
  store.automations = Array.isArray(store.automations) ? store.automations : [];
  store.automationRuns = Array.isArray(store.automationRuns) ? store.automationRuns : [];
  store.archivedConversations = Array.isArray(store.archivedConversations) ? store.archivedConversations : [];
  return store;
}

function recordTimeline(store, { email, type, title, detail }) {
  ensureCommsStore(store);
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail) return null;
  const entry = {
    id: randomId("tl"),
    email: cleanEmail,
    type: commsLib.clampText(type, 60) || "note",
    title: commsLib.clampText(title, 200) || "Timeline event",
    detail: commsLib.clampText(detail, 2000),
    at: new Date().toISOString(),
  };
  store.userTimeline.unshift(entry);
  store.userTimeline = clampArray(store.userTimeline, MAX_TIMELINE);
  return entry;
}

function logBroadcast(store, entry) {
  ensureCommsStore(store);
  const row = {
    id: entry?.id || randomId("bcast"),
    at: entry?.at || new Date().toISOString(),
    audience: entry?.audience || "",
    kind: entry?.kind || "",
    subject: entry?.subject || "",
    recipientCount: Number(entry?.recipientCount) || 0,
    delivery: entry?.delivery || "",
    messageId: entry?.messageId || "",
    preview: entry?.preview || "",
    ...entry,
  };
  store.broadcastLog.unshift(row);
  store.broadcastLog = clampArray(store.broadcastLog, MAX_BROADCAST_LOG);
  return row;
}

/**
 * @param {object} deps
 */
function createCommsApi(deps) {
  const {
    readStore,
    writeStore,
    ensureMessagingStore,
    jsonResponse,
    readJson,
    normalizeEmail,
    validAdminToken,
    resolveMemberIdentity,
    fanOutNotificationsAndPush,
    notifyAdmin: _notifyAdmin,
    messagingCenter: _messagingCenter,
    messagingLib: _messagingLib,
    membershipAccess,
    accountAccess: _accountAccess,
    ADMIN_EMAIL,
    ADMIN_NAME,
    sendEmail: _sendEmail,
    SUPPORT_EMAIL_TO: _SUPPORT_EMAIL_TO,
    publicMessage,
    publicNotification,
  } = deps;

  function requireAdmin(token, response) {
    if (!validAdminToken(token || "")) {
      jsonResponse(response, 401, { error: "Admin access is required." });
      return false;
    }
    return true;
  }

  async function resolveMemberOrFail(request, response) {
    try {
      return await resolveMemberIdentity(request);
    } catch (error) {
      jsonResponse(response, 401, { error: error.message || "Sign in is required." });
      return null;
    }
  }

  function isConversationArchived(store, email, conversationEmail) {
    const member = normalizeEmail(email);
    const convo = normalizeEmail(conversationEmail || email);
    return (store.archivedConversations || []).some(
      (row) => normalizeEmail(row.email) === member && normalizeEmail(row.conversationEmail) === convo,
    );
  }

  function normalizeTags(tags) {
    const presets = new Set(commsLib.USER_TAG_PRESETS);
    const out = [];
    const seen = new Set();
    (Array.isArray(tags) ? tags : []).forEach((tag) => {
      const clean = commsLib.clampText(tag, 60);
      if (!clean) return;
      const key = clean.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      // Allow presets and custom tags; cap custom length already applied.
      if (presets.has(clean) || clean.length >= 2) out.push(clean);
    });
    return out.slice(0, 40);
  }

  function countAnalyticsForUser(events, email) {
    let lessonViews = 0;
    let calendarEvents = 0;
    let downloads = 0;
    (events || []).forEach((event) => {
      if (normalizeEmail(event.user || event.email) !== email) return;
      const name = String(event.name || event.type || "");
      if (["resource_view", "lesson_plan_view", "curriculum_lesson_view"].includes(name)) lessonViews += 1;
      else if (["lesson_plan_added_to_calendar", "calendar_lesson_assigned", "add_to_calendar"].includes(name)) calendarEvents += 1;
      else if (/download/i.test(name) || name === "printable_download" || name === "resource_download") downloads += 1;
    });
    return { lessonViews, calendarEvents, downloads };
  }

  function buildUserTimeline(store, userEmail) {
    const email = normalizeEmail(userEmail);
    const items = [];

    const user = store.users?.[email];
    if (user) {
      const signupAt = user.signupAt || user.createdAt || "";
      if (signupAt) {
        items.push({
          id: `signup-${email}`,
          email,
          type: "signup",
          title: "Signed up",
          detail: user.name || user.firstName || email,
          at: signupAt,
          source: "user",
        });
      }
    }

    (store.userTimeline || []).forEach((entry) => {
      if (normalizeEmail(entry.email) !== email) return;
      items.push({
        id: entry.id,
        email,
        type: entry.type || "note",
        title: entry.title || "",
        detail: entry.detail || "",
        at: entry.at || "",
        source: "timeline",
      });
    });

    (store.messages || []).forEach((message) => {
      const isPrivate = message.audience === "private" && normalizeEmail(message.conversationEmail) === email;
      const isSent = message.senderType === "user" && normalizeEmail(message.senderEmail) === email;
      if (!isPrivate && !isSent) return;
      const fromAdmin = message.senderType === "admin";
      items.push({
        id: `msg-${message.id}`,
        email,
        type: fromAdmin ? "message_received" : "message_sent",
        title: fromAdmin ? "Message from Leah" : "Message sent",
        detail: message.subject || message.body || "",
        at: message.sentAt || message.createdAt || "",
        source: "messages",
        refId: message.id,
      });
    });

    (store.supportTickets || []).forEach((ticket) => {
      if (normalizeEmail(ticket.email || ticket.createdBy) !== email) return;
      items.push({
        id: `ticket-${ticket.id}`,
        email,
        type: "support_ticket",
        title: ticket.topic || "Support request",
        detail: ticket.message || "",
        at: ticket.createdAt || ticket.updatedAt || "",
        source: "supportTickets",
        refId: ticket.id,
      });
    });

    (store.featureRequests || []).forEach((item) => {
      if (normalizeEmail(item.email) !== email) return;
      items.push({
        id: `feature-${item.id}`,
        email,
        type: "feature_request",
        title: item.title || "Feature request",
        detail: item.description || "",
        at: item.createdAt || item.updatedAt || "",
        source: "featureRequests",
        refId: item.id,
      });
    });

    (store.bugReports || []).forEach((item) => {
      if (normalizeEmail(item.email) !== email) return;
      items.push({
        id: `bug-${item.id}`,
        email,
        type: "bug_report",
        title: item.title || "Bug report",
        detail: item.description || "",
        at: item.createdAt || item.updatedAt || "",
        source: "bugReports",
        refId: item.id,
      });
    });

    (store.feedbackItems || []).forEach((item) => {
      if (normalizeEmail(item.email) !== email) return;
      items.push({
        id: `feedback-${item.id}`,
        email,
        type: "feedback",
        title: item.type || "Feedback",
        detail: item.message || "",
        at: item.createdAt || item.updatedAt || "",
        source: "feedbackItems",
        refId: item.id,
      });
    });

    (store.billingEvents || []).forEach((event, index) => {
      if (normalizeEmail(event.email || event.user || event.customerEmail) !== email) return;
      items.push({
        id: `billing-${event.id || index}`,
        email,
        type: "billing",
        title: event.type || event.event || "Billing event",
        detail: event.detail || event.status || event.subscriptionStatus || "",
        at: event.at || event.createdAt || event.timestamp || "",
        source: "billingEvents",
      });
    });

    (store.analyticsEvents || []).slice(0, 500).forEach((event, index) => {
      if (normalizeEmail(event.user || event.email) !== email) return;
      const name = String(event.name || event.type || "");
      if (!name) return;
      // Keep timeline useful — only notable engagement events.
      if (!/login|signup|download|lesson|calendar|subscribe|cancel|checkout/i.test(name)) return;
      items.push({
        id: `analytics-${event.id || index}`,
        email,
        type: "analytics",
        title: name,
        detail: "",
        at: event.createdAt || event.at || "",
        source: "analyticsEvents",
      });
    });

    return items
      .filter((item) => item.at)
      .sort(sortNewestFirst)
      .slice(0, 200);
  }

  async function notifyAdminsInApp(store, { type, title, preview, refId }) {
    const adminEmail = normalizeEmail(ADMIN_EMAIL || "");
    if (!adminEmail) return { targeted: 0 };
    const messagingStore = ensureMessagingStore(ensureCommsStore(store));
    return fanOutNotificationsAndPush(messagingStore, {
      type: type || "admin_new_message",
      recipients: [adminEmail],
      title: title || "Admin alert",
      preview: preview || "",
      refId: refId || "",
      senderName: ADMIN_NAME || "Little Learner Hub",
    });
  }

  // ─── Drafts ────────────────────────────────────────────────────────────────

  async function handleDraftsGet(request, response, url) {
    const adminToken = url.searchParams.get("adminToken") || "";
    const scopeParam = String(url.searchParams.get("scope") || "").trim();
    const formId = String(url.searchParams.get("formId") || "").trim();
    const store = ensureCommsStore(readStore());

    let ownerEmail = "";
    let scopeFilter = scopeParam;

    if (scopeParam === "admin" || (adminToken && validAdminToken(adminToken) && !scopeParam)) {
      if (!requireAdmin(adminToken, response)) return;
      ownerEmail = normalizeEmail(ADMIN_EMAIL || "admin");
      scopeFilter = scopeFilter || "admin";
    } else {
      const identity = await resolveMemberOrFail(request, response);
      if (!identity) return;
      ownerEmail = normalizeEmail(identity.email);
    }

    let drafts = (store.universalDrafts || []).filter((d) => normalizeEmail(d.ownerEmail) === ownerEmail);
    if (scopeFilter) drafts = drafts.filter((d) => d.scope === scopeFilter);
    if (formId) drafts = drafts.filter((d) => d.formId === formId);

    jsonResponse(response, 200, {
      drafts: drafts.sort((a, b) => String(a.updatedAt || "") < String(b.updatedAt || "") ? 1 : -1).map(publicDraft),
    });
  }

  async function handleDraftsSave(request, response) {
    const body = await readJson(request);
    const scope = commsLib.clampText(body.scope, 40) || "message";
    const formId = commsLib.clampText(body.formId, 120) || "default";
    const payload = body.payload && typeof body.payload === "object" ? body.payload : {};

    let ownerEmail = "";
    if (scope === "admin") {
      if (!requireAdmin(body.adminToken || "", response)) return;
      ownerEmail = normalizeEmail(ADMIN_EMAIL || "admin");
    } else {
      const identity = await resolveMemberOrFail(request, response);
      if (!identity) return;
      ownerEmail = normalizeEmail(identity.email);
    }

    const key = commsLib.draftKey({ scope, ownerEmail, formId });
    const store = ensureCommsStore(readStore());
    const now = new Date().toISOString();
    const existingIndex = store.universalDrafts.findIndex((d) => (d.id || d.key) === key);
    const draft = {
      id: key,
      key,
      scope,
      ownerEmail,
      formId,
      payload,
      updatedAt: now,
      createdAt: existingIndex >= 0 ? store.universalDrafts[existingIndex].createdAt || now : now,
    };
    if (existingIndex >= 0) store.universalDrafts[existingIndex] = draft;
    else store.universalDrafts.unshift(draft);
    store.universalDrafts = clampArray(store.universalDrafts, MAX_UNIVERSAL_DRAFTS);
    writeStore(store);
    jsonResponse(response, 200, { ok: true, draft: publicDraft(draft) });
  }

  async function handleDraftsDelete(request, response) {
    const body = await readJson(request);
    const scope = commsLib.clampText(body.scope, 40) || "message";
    const formId = commsLib.clampText(body.formId, 120) || "default";
    const explicitId = String(body.id || body.key || "").trim();

    let ownerEmail = "";
    if (scope === "admin" || body.adminToken) {
      if (!requireAdmin(body.adminToken || "", response)) return;
      ownerEmail = normalizeEmail(ADMIN_EMAIL || "admin");
    } else {
      const identity = await resolveMemberOrFail(request, response);
      if (!identity) return;
      ownerEmail = normalizeEmail(identity.email);
    }

    const key = explicitId || commsLib.draftKey({ scope, ownerEmail, formId });
    const store = ensureCommsStore(readStore());
    const before = store.universalDrafts.length;
    store.universalDrafts = store.universalDrafts.filter((d) => {
      const id = d.id || d.key;
      if (id !== key) return true;
      // Members can only delete their own drafts.
      if (scope !== "admin" && normalizeEmail(d.ownerEmail) !== ownerEmail) return true;
      return false;
    });
    if (store.universalDrafts.length !== before) writeStore(store);
    jsonResponse(response, 200, { ok: true, deleted: before - store.universalDrafts.length });
  }

  // ─── Message center ────────────────────────────────────────────────────────

  async function handleMessageCenter(request, response) {
    const identity = await resolveMemberOrFail(request, response);
    if (!identity) return;
    const email = normalizeEmail(identity.email);
    const store = ensureCommsStore(ensureMessagingStore(readStore()));

    const allMine = (store.notifications || [])
      .filter((n) => normalizeEmail(n.email) === email)
      .sort(sortNewestFirst);
    const unread = allMine.filter((n) => !n.read);
    const recentRead = allMine.filter((n) => n.read).slice(0, 50);
    const inboxRows = [...unread, ...recentRead]
      .sort(sortNewestFirst)
      .slice(0, 100)
      .map(publicNotification);

    const archived = isConversationArchived(store, email, email);
    const privateMessages = (store.messages || [])
      .filter((m) => m.audience === "private" && normalizeEmail(m.conversationEmail) === email)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      .map(publicMessage);

    const conversation = archived ? [] : privateMessages;
    const archivedPayload = {
      archived,
      archivedAt: archived
        ? (store.archivedConversations.find(
          (row) => normalizeEmail(row.email) === email && normalizeEmail(row.conversationEmail) === email,
        )?.archivedAt || "")
        : "",
      messages: archived ? privateMessages : [],
    };

    const sent = (store.messages || [])
      .filter((m) => m.senderType === "user" && normalizeEmail(m.senderEmail) === email)
      .sort(sortNewestFirst)
      .slice(0, 100)
      .map(publicMessage);

    const draftScopes = new Set(["message", "support", "feature", "bug"]);
    const drafts = (store.universalDrafts || [])
      .filter((d) => normalizeEmail(d.ownerEmail) === email && draftScopes.has(d.scope))
      .sort((a, b) => String(a.updatedAt || "") < String(b.updatedAt || "") ? 1 : -1)
      .map(publicDraft);

    const supportRequests = (store.supportTickets || [])
      .filter((t) => normalizeEmail(t.email || t.createdBy) === email)
      .sort(sortNewestFirst)
      .slice(0, 100)
      .map(publicTicket);

    const featureRequests = (store.featureRequests || [])
      .filter((t) => normalizeEmail(t.email) === email)
      .sort(sortNewestFirst)
      .slice(0, 100)
      .map(publicFeatureRequest);

    const bugReports = (store.bugReports || [])
      .filter((t) => normalizeEmail(t.email) === email)
      .sort(sortNewestFirst)
      .slice(0, 100)
      .map(publicBugReport);

    const feedback = (store.feedbackItems || [])
      .filter((t) => normalizeEmail(t.email) === email)
      .sort(sortNewestFirst)
      .slice(0, 100)
      .map(publicFeedback);

    jsonResponse(response, 200, {
      inbox: inboxRows,
      conversation,
      sent,
      drafts,
      supportRequests,
      featureRequests,
      bugReports,
      feedback,
      archived: archivedPayload,
      unreadCount: unread.length,
    });
  }

  async function handleArchiveConversation(request, response) {
    const identity = await resolveMemberOrFail(request, response);
    if (!identity) return;
    const body = await readJson(request);
    const email = normalizeEmail(identity.email);
    const conversationEmail = normalizeEmail(body.conversationEmail || email);
    let shouldArchive = true;
    if (body.unarchive === true || body.archived === false || body.archive === false) {
      shouldArchive = false;
    } else if (body.archived === true || body.archive === true) {
      shouldArchive = true;
    }

    const store = ensureCommsStore(readStore());
    store.archivedConversations = (store.archivedConversations || []).filter(
      (row) => !(normalizeEmail(row.email) === email && normalizeEmail(row.conversationEmail) === conversationEmail),
    );
    if (shouldArchive) {
      store.archivedConversations.unshift({
        email,
        conversationEmail,
        archivedAt: new Date().toISOString(),
      });
      store.archivedConversations = clampArray(store.archivedConversations, MAX_ARCHIVED);
    }
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      archived: shouldArchive,
      email,
      conversationEmail,
    });
  }

  // ─── Templates (admin) ─────────────────────────────────────────────────────

  function handleTemplatesGet(request, response, url) {
    if (!requireAdmin(url.searchParams.get("adminToken") || "", response)) return;
    const store = ensureCommsStore(readStore());
    jsonResponse(response, 200, {
      templates: commsLib.mergeTemplates(store.messageTemplates),
    });
  }

  async function handleTemplatesSave(request, response) {
    const body = await readJson(request);
    if (!requireAdmin(body.adminToken || "", response)) return;
    const source = body.template && typeof body.template === "object" ? body.template : body;
    const store = ensureCommsStore(readStore());
    const id = commsLib.clampText(source.id, 80) || randomId("tmpl");
    const now = new Date().toISOString();
    const existingIndex = store.messageTemplates.findIndex((t) => t.id === id);
    const row = {
      id,
      label: commsLib.clampText(source.label, 80) || "Template",
      subject: commsLib.clampText(source.subject, 300),
      body: commsLib.clampText(source.body, 8000),
      kind: source.kind || "message",
      audience: source.audience || "private",
      system: false,
      updatedAt: now,
      createdAt: existingIndex >= 0 ? store.messageTemplates[existingIndex].createdAt || now : now,
    };
    if (existingIndex >= 0) store.messageTemplates[existingIndex] = row;
    else store.messageTemplates.unshift(row);
    store.messageTemplates = clampArray(store.messageTemplates, 500);
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      template: row,
      templates: commsLib.mergeTemplates(store.messageTemplates),
    });
  }

  async function handleTemplatesDelete(request, response) {
    const body = await readJson(request);
    if (!requireAdmin(body.adminToken || "", response)) return;
    const id = String(body.id || "").trim();
    if (!id) {
      jsonResponse(response, 400, { error: "Template id is required." });
      return;
    }
    const isSystemDefault = commsLib.DEFAULT_MESSAGE_TEMPLATES.some((t) => t.id === id);
    const store = ensureCommsStore(readStore());
    const customIndex = store.messageTemplates.findIndex((t) => t.id === id);
    if (isSystemDefault && customIndex < 0) {
      jsonResponse(response, 400, {
        error: "System default templates cannot be deleted. Save an override to customize, or leave the default in place.",
        code: "system_template",
      });
      return;
    }
    if (customIndex < 0) {
      jsonResponse(response, 404, { error: "Template was not found." });
      return;
    }
    store.messageTemplates.splice(customIndex, 1);
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      templates: commsLib.mergeTemplates(store.messageTemplates),
    });
  }

  // ─── User tags (admin) ─────────────────────────────────────────────────────

  function handleUserTagsGet(request, response, url) {
    if (!requireAdmin(url.searchParams.get("adminToken") || "", response)) return;
    const store = ensureCommsStore(readStore());
    const email = normalizeEmail(url.searchParams.get("email") || "");
    if (email) {
      jsonResponse(response, 200, {
        email,
        tags: Array.isArray(store.userTags[email]) ? store.userTags[email] : [],
        presets: [...commsLib.USER_TAG_PRESETS],
      });
      return;
    }
    jsonResponse(response, 200, {
      userTags: store.userTags,
      presets: [...commsLib.USER_TAG_PRESETS],
    });
  }

  async function handleUserTagsSet(request, response) {
    const body = await readJson(request);
    if (!requireAdmin(body.adminToken || "", response)) return;
    const email = normalizeEmail(body.email || "");
    if (!email) {
      jsonResponse(response, 400, { error: "email is required." });
      return;
    }
    const tags = normalizeTags(body.tags);
    const store = ensureCommsStore(readStore());
    const previous = Array.isArray(store.userTags[email]) ? store.userTags[email] : [];
    store.userTags[email] = tags;
    if (JSON.stringify(previous) !== JSON.stringify(tags)) {
      recordTimeline(store, {
        email,
        type: "tags",
        title: "Tags updated",
        detail: tags.length ? tags.join(", ") : "(cleared)",
      });
    }
    writeStore(store);
    jsonResponse(response, 200, { ok: true, email, tags });
  }

  // ─── Timeline (admin) ──────────────────────────────────────────────────────

  function handleUserTimelineGet(request, response, url) {
    if (!requireAdmin(url.searchParams.get("adminToken") || "", response)) return;
    const userEmail = normalizeEmail(url.searchParams.get("userEmail") || url.searchParams.get("email") || "");
    if (!userEmail) {
      jsonResponse(response, 400, { error: "userEmail is required." });
      return;
    }
    const store = ensureCommsStore(ensureMessagingStore(readStore()));
    jsonResponse(response, 200, {
      userEmail,
      timeline: buildUserTimeline(store, userEmail),
    });
  }

  // ─── User health (admin) ───────────────────────────────────────────────────

  function handleUserHealthGet(request, response, url) {
    if (!requireAdmin(url.searchParams.get("adminToken") || "", response)) return;
    const store = ensureCommsStore(ensureMessagingStore(readStore()));
    const adminEmail = normalizeEmail(ADMIN_EMAIL || "");
    const events = store.analyticsEvents || [];
    const messages = store.messages || [];
    const active = [];
    const at_risk = [];
    const inactive = [];

    Object.values(store.users || {}).forEach((user) => {
      const email = normalizeEmail(user.email);
      if (!email || (adminEmail && email === adminEmail)) return;
      const analytics = countAnalyticsForUser(events, email);
      const messageCount = messages.filter(
        (m) => normalizeEmail(m.conversationEmail) === email
          || normalizeEmail(m.senderEmail) === email
          || normalizeEmail(m.toEmail) === email,
      ).length;
      let subscriptionStatus = user.stripeSubscriptionStatus || user.subscriptionStatus || "";
      if (membershipAccess && typeof membershipAccess.membershipCurrentAccessKey === "function") {
        try {
          const accessKey = membershipAccess.membershipCurrentAccessKey(user);
          if (accessKey) subscriptionStatus = subscriptionStatus || accessKey;
        } catch (_err) {
          // ignore — fall back to stored status fields
        }
      }
      const health = commsLib.userHealthLevel({
        lastLoginAt: user.lastLoginAt || "",
        lastSeenAt: user.lastSeenAt || "",
        messageCount,
        lessonViews: analytics.lessonViews,
        calendarEvents: analytics.calendarEvents,
        downloads: analytics.downloads,
        subscriptionStatus,
      });
      const row = {
        email,
        name: user.name || user.displayName || [user.firstName, user.lastName].filter(Boolean).join(" ") || "",
        plan: user.plan || "",
        subscriptionStatus,
        lastLoginAt: user.lastLoginAt || "",
        lastSeenAt: user.lastSeenAt || "",
        messageCount,
        ...analytics,
        ...health,
      };
      if (health.level === "active") active.push(row);
      else if (health.level === "at_risk") at_risk.push(row);
      else inactive.push(row);
    });

    const byScore = (a, b) => (a.score || 0) - (b.score || 0);
    active.sort((a, b) => (b.score || 0) - (a.score || 0));
    at_risk.sort(byScore);
    inactive.sort(byScore);

    jsonResponse(response, 200, {
      active,
      at_risk,
      inactive,
      summary: {
        active: active.length,
        at_risk: at_risk.length,
        inactive: inactive.length,
      },
    });
  }

  // ─── Automations (admin) ───────────────────────────────────────────────────

  function handleAutomationsGet(request, response, url) {
    if (!requireAdmin(url.searchParams.get("adminToken") || "", response)) return;
    const store = ensureCommsStore(readStore());
    jsonResponse(response, 200, {
      automations: commsLib.mergeAutomations(store.automations),
      runs: (store.automationRuns || []).slice(0, 100),
    });
  }

  async function handleAutomationsSave(request, response) {
    const body = await readJson(request);
    if (!requireAdmin(body.adminToken || "", response)) return;
    const store = ensureCommsStore(readStore());
    const now = new Date().toISOString();

    if (Array.isArray(body.automations)) {
      store.automations = body.automations
        .filter((a) => a && a.id)
        .map((a) => ({
          id: String(a.id),
          name: commsLib.clampText(a.name, 120) || "Automation",
          audience: commsLib.clampText(a.audience, 40) || "all",
          enabled: a.enabled !== false,
          steps: Array.isArray(a.steps) ? a.steps.slice(0, 20) : [],
          system: false,
          updatedAt: now,
        }));
    } else if (body.automation && body.automation.id) {
      const a = body.automation;
      const row = {
        id: String(a.id),
        name: commsLib.clampText(a.name, 120) || "Automation",
        audience: commsLib.clampText(a.audience, 40) || "all",
        enabled: a.enabled !== false,
        steps: Array.isArray(a.steps) ? a.steps.slice(0, 20) : [],
        system: false,
        updatedAt: now,
      };
      const idx = store.automations.findIndex((x) => x.id === row.id);
      if (idx >= 0) store.automations[idx] = row;
      else store.automations.unshift(row);
    } else {
      jsonResponse(response, 400, { error: "automations array or automation object is required." });
      return;
    }

    store.automations = clampArray(store.automations, 200);
    store.automationRuns = clampArray(store.automationRuns, MAX_AUTOMATION_RUNS);
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      automations: commsLib.mergeAutomations(store.automations),
    });
  }

  // ─── Broadcast log (admin) ─────────────────────────────────────────────────

  function handleBroadcastLogGet(request, response, url) {
    if (!requireAdmin(url.searchParams.get("adminToken") || "", response)) return;
    const store = ensureCommsStore(readStore());
    const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 500);
    jsonResponse(response, 200, {
      broadcasts: (store.broadcastLog || []).slice(0, limit),
    });
  }

  return {
    ensureCommsStore,
    recordTimeline,
    logBroadcast,
    notifyAdminsInApp,
    handleDraftsGet,
    handleDraftsSave,
    handleDraftsDelete,
    handleMessageCenter,
    handleArchiveConversation,
    handleTemplatesGet,
    handleTemplatesSave,
    handleTemplatesDelete,
    handleUserTagsGet,
    handleUserTagsSet,
    handleUserTimelineGet,
    handleUserHealthGet,
    handleAutomationsGet,
    handleAutomationsSave,
    handleBroadcastLogGet,
  };
}

module.exports = {
  createCommsApi,
  ensureCommsStore,
  recordTimeline,
  logBroadcast,
  clampArray,
};
