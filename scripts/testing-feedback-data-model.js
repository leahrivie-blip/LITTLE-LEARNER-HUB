/**
 * Testing Feedback — data model.
 *
 * A simple, persistent feedback-thread system for testers using the fake
 * testing programs (never production, never real families/staff). Every
 * tester ("@example.invalid" fake account, or a real verified admin using a
 * fake account for testing) can start a thread, reply, and see the admin's
 * replies and thread history. Platform Admin gets a full inbox across every
 * organization, with private notes (never sent to the tester), statuses,
 * and "please retest this" flags.
 *
 * Isolation is enforced HERE, not just at the route layer: every lookup
 * function that returns tester-facing data takes the tester's own email and
 * filters by it — there is no function in this file that returns another
 * tester's thread to a non-admin caller by design.
 */

const crypto = require("node:crypto");

const CATEGORIES = Object.freeze({
  BUG: "bug",
  CONFUSING_SCREEN: "confusing_screen",
  MISSING_FEATURE: "missing_feature",
  LAYOUT_PROBLEM: "layout_problem",
  AI_RESULT: "ai_result",
  SUGGESTION: "suggestion",
  OTHER: "other",
});

const CATEGORY_LABELS = Object.freeze({
  bug: "Bug",
  confusing_screen: "Confusing screen",
  missing_feature: "Missing feature",
  layout_problem: "Layout problem",
  ai_result: "AI result",
  suggestion: "Suggestion",
  other: "Other",
});

const STATUSES = Object.freeze({
  OPEN: "open",
  IN_PROGRESS: "in_progress",
  RESOLVED: "resolved",
  CLOSED: "closed",
});

const STATUS_LABELS = Object.freeze({
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
});

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function nowIso() {
  return new Date().toISOString();
}

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

function safeLower(value) {
  return String(value || "").trim().toLowerCase();
}

function cleanText(value, max = 2000) {
  return String(value ?? "").trim().slice(0, max);
}

function ensureTestingFeedbackStore(store) {
  store.testingFeedback = store.testingFeedback && typeof store.testingFeedback === "object" ? store.testingFeedback : {};
  const s = store.testingFeedback;
  s.schemaVersion = 1;
  s.threads = s.threads && typeof s.threads === "object" ? s.threads : {};
  s.messages = s.messages && typeof s.messages === "object" ? s.messages : {};
  s.notes = s.notes && typeof s.notes === "object" ? s.notes : {};
  return s;
}

function normalizeCategory(category) {
  return Object.values(CATEGORIES).includes(category) ? category : CATEGORIES.OTHER;
}

function defaultSubjectFor(category, body) {
  const label = CATEGORY_LABELS[normalizeCategory(category)] || "Feedback";
  const snippet = cleanText(body, 60);
  return snippet ? `${label}: ${snippet}${String(body || "").length > 60 ? "…" : ""}` : label;
}

function normalizeContext(context = {}, fallbackOrganizationId = "") {
  return {
    page: cleanText(context.page, 200),
    device: cleanText(context.device, 40),
    role: cleanText(context.role, 80),
    organizationId: cleanText(context.organizationId || fallbackOrganizationId, 160),
    // Which server build (git SHA) was running when this thread was created —
    // never a secret, purely so the admin can tell whether a report was filed
    // against an old deploy before investigating. Empty when unset.
    deployedCommit: cleanText(context.deployedCommit, 40),
    // Optional: which fake child this report is about (e.g. Home Daycare
    // Pilot testers previewing a specific family) — a fake-data id, never
    // any real information. Empty when not applicable.
    relatedChildId: cleanText(context.relatedChildId, 160),
  };
}

// A screenshot is opt-in and only ever attached after the CLIENT shows an
// explicit privacy warning ("only attach if it doesn't show anything
// private") — this module just validates shape/size, it never decides
// whether the warning was shown; that's enforced in the UI layer.
const MAX_SCREENSHOT_DATA_URL_LENGTH = 900_000; // ~650KB of actual image data once base64-decoded

function sanitizeScreenshotDataUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (!/^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(raw)) return "";
  if (raw.length > MAX_SCREENSHOT_DATA_URL_LENGTH) return "";
  return raw;
}

function createMessageRecord({ threadId, organizationId, senderType, senderEmail, body, screenshotDataUrl = "" }) {
  return {
    id: newId("tfmsg"),
    threadId,
    organizationId: cleanText(organizationId, 160),
    senderType, // "tester" | "admin"
    senderEmail: safeLower(senderEmail),
    body: cleanText(body, 8000),
    screenshotDataUrl: sanitizeScreenshotDataUrl(screenshotDataUrl),
    createdAt: nowIso(),
  };
}

/** Starts a new thread with its first (tester) message. */
function createThread(store, {
  organizationId, testerEmail, testerRole = "", category, subject = "", body, context = {}, screenshotDataUrl = "",
} = {}) {
  const s = ensureTestingFeedbackStore(store);
  const now = nowIso();
  const normalizedCategory = normalizeCategory(category);
  const thread = {
    id: newId("tfthread"),
    organizationId: cleanText(organizationId, 160),
    testerEmail: safeLower(testerEmail),
    testerRole: cleanText(testerRole, 80),
    category: normalizedCategory,
    subject: cleanText(subject, 200) || defaultSubjectFor(normalizedCategory, body),
    status: STATUSES.OPEN,
    retestRequested: false,
    context: normalizeContext(context, organizationId),
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now,
    lastSenderType: "tester",
    // Unread is tracked from EACH side's own perspective — a new thread has
    // nothing for the tester to read yet (she just wrote it), but is
    // unread-for-admin until an admin opens it.
    testerUnread: false,
    adminUnread: true,
  };
  s.threads[thread.id] = thread;
  const message = createMessageRecord({
    threadId: thread.id, organizationId: thread.organizationId, senderType: "tester", senderEmail: thread.testerEmail, body, screenshotDataUrl,
  });
  s.messages[message.id] = message;
  return { thread, message };
}

/** Tester-facing: only ever returns threads belonging to this exact tester email. */
function listThreadsForTester(store, testerEmail) {
  const s = ensureTestingFeedbackStore(store);
  const email = safeLower(testerEmail);
  return listValues(s.threads)
    .filter((thread) => thread.testerEmail === email)
    .sort((a, b) => String(b.lastMessageAt || "").localeCompare(String(a.lastMessageAt || "")));
}

/** Tester-facing: returns the thread ONLY if it belongs to this tester, else null. */
function getThreadForTester(store, { threadId, testerEmail }) {
  const s = ensureTestingFeedbackStore(store);
  const thread = s.threads[threadId];
  if (!thread) return null;
  if (thread.testerEmail !== safeLower(testerEmail)) return null;
  return thread;
}

/** Messages visible to the tester for one of her own threads — private notes are NEVER included. */
function listMessagesForTester(store, { threadId, testerEmail }) {
  const thread = getThreadForTester(store, { threadId, testerEmail });
  if (!thread) return null;
  const s = ensureTestingFeedbackStore(store);
  return listValues(s.messages)
    .filter((m) => m.threadId === threadId)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

/** Admin-facing: every thread across every organization, optionally filtered. */
function listThreadsForAdmin(store, filters = {}) {
  const s = ensureTestingFeedbackStore(store);
  let threads = listValues(s.threads);
  if (filters.status) threads = threads.filter((t) => t.status === filters.status);
  if (filters.category) threads = threads.filter((t) => t.category === filters.category);
  if (filters.organizationId) threads = threads.filter((t) => t.organizationId === filters.organizationId);
  if (filters.retestRequested === true) threads = threads.filter((t) => t.retestRequested === true);
  if (filters.unreadOnly === true) threads = threads.filter((t) => t.adminUnread === true);
  return threads.sort((a, b) => String(b.lastMessageAt || "").localeCompare(String(a.lastMessageAt || "")));
}

function getThreadForAdmin(store, threadId) {
  const s = ensureTestingFeedbackStore(store);
  return s.threads[threadId] || null;
}

/** Admin-facing: messages for any thread (still never includes private notes — those are separate). */
function listMessagesForAdmin(store, threadId) {
  const s = ensureTestingFeedbackStore(store);
  return listValues(s.messages)
    .filter((m) => m.threadId === threadId)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

/** Admin-only private notes for a thread — never returned to any tester-facing accessor. */
function listNotesForAdmin(store, threadId) {
  const s = ensureTestingFeedbackStore(store);
  return listValues(s.notes)
    .filter((n) => n.threadId === threadId)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

function addTesterMessage(store, { threadId, testerEmail, body, screenshotDataUrl = "" }) {
  const thread = getThreadForTester(store, { threadId, testerEmail });
  if (!thread) return null;
  const s = ensureTestingFeedbackStore(store);
  const message = createMessageRecord({
    threadId, organizationId: thread.organizationId, senderType: "tester", senderEmail: testerEmail, body, screenshotDataUrl,
  });
  s.messages[message.id] = message;
  thread.updatedAt = message.createdAt;
  thread.lastMessageAt = message.createdAt;
  thread.lastSenderType = "tester";
  thread.adminUnread = true;
  thread.testerUnread = false;
  // A tester replying to a closed/resolved thread naturally reopens it for admin attention.
  if (thread.status === STATUSES.CLOSED || thread.status === STATUSES.RESOLVED) {
    thread.status = STATUSES.OPEN;
  }
  return { thread, message };
}

function addAdminMessage(store, { threadId, adminEmail, body }) {
  const s = ensureTestingFeedbackStore(store);
  const thread = s.threads[threadId];
  if (!thread) return null;
  const message = createMessageRecord({
    threadId, organizationId: thread.organizationId, senderType: "admin", senderEmail: adminEmail, body,
  });
  s.messages[message.id] = message;
  thread.updatedAt = message.createdAt;
  thread.lastMessageAt = message.createdAt;
  thread.lastSenderType = "admin";
  thread.testerUnread = true;
  thread.adminUnread = false;
  return { thread, message };
}

/** Private admin note — deliberately a completely separate map from `messages`, never tester-visible. */
function addPrivateNote(store, { threadId, adminEmail, body }) {
  const s = ensureTestingFeedbackStore(store);
  const thread = s.threads[threadId];
  if (!thread) return null;
  const note = {
    id: newId("tfnote"),
    threadId,
    organizationId: thread.organizationId,
    authorEmail: safeLower(adminEmail),
    body: cleanText(body, 4000),
    createdAt: nowIso(),
  };
  s.notes[note.id] = note;
  return note;
}

function setStatus(store, { threadId, status }) {
  const s = ensureTestingFeedbackStore(store);
  const thread = s.threads[threadId];
  if (!thread) return null;
  if (!Object.values(STATUSES).includes(status)) return null;
  thread.status = status;
  thread.updatedAt = nowIso();
  return thread;
}

function setRetestRequested(store, { threadId, retestRequested }) {
  const s = ensureTestingFeedbackStore(store);
  const thread = s.threads[threadId];
  if (!thread) return null;
  thread.retestRequested = retestRequested === true;
  thread.updatedAt = nowIso();
  // A retest request is meaningful admin-to-tester signal — surface it as an
  // unread notification for the tester even if no new message accompanies it.
  if (thread.retestRequested) thread.testerUnread = true;
  return thread;
}

function markReadByTester(store, { threadId, testerEmail }) {
  const thread = getThreadForTester(store, { threadId, testerEmail });
  if (!thread) return null;
  thread.testerUnread = false;
  return thread;
}

function markReadByAdmin(store, threadId) {
  const s = ensureTestingFeedbackStore(store);
  const thread = s.threads[threadId];
  if (!thread) return null;
  thread.adminUnread = false;
  return thread;
}

function unreadCountForTester(store, testerEmail) {
  return listThreadsForTester(store, testerEmail).filter((t) => t.testerUnread === true).length;
}

function unreadCountForAdmin(store) {
  const s = ensureTestingFeedbackStore(store);
  return listValues(s.threads).filter((t) => t.adminUnread === true).length;
}

module.exports = {
  CATEGORIES,
  CATEGORY_LABELS,
  STATUSES,
  STATUS_LABELS,
  ensureTestingFeedbackStore,
  createThread,
  sanitizeScreenshotDataUrl,
  MAX_SCREENSHOT_DATA_URL_LENGTH,
  listThreadsForTester,
  getThreadForTester,
  listMessagesForTester,
  listThreadsForAdmin,
  getThreadForAdmin,
  listMessagesForAdmin,
  listNotesForAdmin,
  addTesterMessage,
  addAdminMessage,
  addPrivateNote,
  setStatus,
  setRetestRequested,
  markReadByTester,
  markReadByAdmin,
  unreadCountForTester,
  unreadCountForAdmin,
  newId,
  nowIso,
  listValues,
  safeLower,
};
