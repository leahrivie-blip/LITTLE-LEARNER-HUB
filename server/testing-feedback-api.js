/**
 * Testing Feedback — /api/testing-feedback/*
 *
 * Production always rejects (mounted behind a non-production-only check in
 * server/index.js — see scripts/expansion-feature-flags.js#evaluateTestingFeedbackAccess).
 * Deliberately requires no admin-toggled stored flag: testers need the
 * "Send Testing Feedback" button available everywhere the moment they're
 * logged into a fake account on a non-production host.
 *
 * Isolation:
 *   - Tester routes (below `/threads`, `/unread-count`) require an
 *     authenticated fake-account member session (never a real member
 *     session, never an admin token alone) and ONLY ever return/operate on
 *     THAT tester's own threads — enforced again inside
 *     scripts/testing-feedback-data-model.js's tester-facing accessors, not
 *     just here.
 *   - Admin routes (under `/admin/`) require a verified admin session and
 *     can see every organization's threads — that is the entire point of
 *     the inbox — but private notes and admin-only fields are NEVER
 *     returned from any tester-facing accessor.
 */

const model = require("../scripts/testing-feedback-data-model.js");

const BASE = "/api/testing-feedback";

function createTestingFeedbackApi({ readStore, writeStore, jsonResponse, readJson }) {
  function deny(response, status, payload) {
    jsonResponse(response, status, { ok: false, ...payload });
  }

  /** Server-resolved identity for a fake-account tester — never trusts a client-supplied organizationId/role for access decisions. */
  function testerIdentity(store, testerEmail) {
    const user = store.users?.[testerEmail] || {};
    return {
      email: testerEmail,
      organizationId: String(user.organizationId || ""),
      role: String(user.role || ""),
      accountType: String(user.accountType || ""),
    };
  }

  // ---- Tester-facing ------------------------------------------------------

  async function handleListThreads(request, response, ctx) {
    if (!ctx.fakeAccountEmail) return deny(response, 401, { error: "Sign in as a testing account to view your feedback threads." });
    const store = readStore();
    const threads = model.listThreadsForTester(store, ctx.fakeAccountEmail);
    jsonResponse(response, 200, { ok: true, threads, unreadCount: threads.filter((t) => t.testerUnread).length });
  }

  async function handleCreateThread(request, response, ctx) {
    if (!ctx.fakeAccountEmail) return deny(response, 401, { error: "Sign in as a testing account to send feedback." });
    const store = readStore();
    const body = await readJson(request).catch(() => ({}));
    if (!body.body || !String(body.body).trim()) return deny(response, 400, { error: "Please describe what you want to share before sending." });
    const identity = testerIdentity(store, ctx.fakeAccountEmail);
    const { thread, message } = model.createThread(store, {
      organizationId: identity.organizationId,
      testerEmail: ctx.fakeAccountEmail,
      testerRole: identity.role || identity.accountType,
      category: body.category,
      subject: body.subject,
      body: body.body,
      context: {
        page: body.context?.page || "",
        device: body.context?.device || "",
        role: body.context?.role || identity.role || identity.accountType,
        organizationId: identity.organizationId,
      },
    });
    writeStore(store);
    jsonResponse(response, 201, { ok: true, thread, message });
  }

  async function handleGetThreadForTester(request, response, ctx, threadId) {
    if (!ctx.fakeAccountEmail) return deny(response, 401, { error: "Sign in as a testing account to view this thread." });
    const store = readStore();
    const thread = model.getThreadForTester(store, { threadId, testerEmail: ctx.fakeAccountEmail });
    if (!thread) return deny(response, 404, { error: "Thread not found." });
    const messages = model.listMessagesForTester(store, { threadId, testerEmail: ctx.fakeAccountEmail }) || [];
    jsonResponse(response, 200, { ok: true, thread, messages });
  }

  async function handleTesterReply(request, response, ctx, threadId) {
    if (!ctx.fakeAccountEmail) return deny(response, 401, { error: "Sign in as a testing account to reply." });
    const store = readStore();
    const body = await readJson(request).catch(() => ({}));
    if (!body.body || !String(body.body).trim()) return deny(response, 400, { error: "Message cannot be empty." });
    const result = model.addTesterMessage(store, { threadId, testerEmail: ctx.fakeAccountEmail, body: body.body });
    if (!result) return deny(response, 404, { error: "Thread not found." });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, thread: result.thread, message: result.message });
  }

  async function handleTesterMarkRead(request, response, ctx, threadId) {
    if (!ctx.fakeAccountEmail) return deny(response, 401, { error: "Sign in as a testing account." });
    const store = readStore();
    const thread = model.markReadByTester(store, { threadId, testerEmail: ctx.fakeAccountEmail });
    if (!thread) return deny(response, 404, { error: "Thread not found." });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, thread });
  }

  async function handleTesterUnreadCount(request, response, ctx) {
    if (!ctx.fakeAccountEmail) return deny(response, 401, { error: "Sign in as a testing account." });
    const store = readStore();
    jsonResponse(response, 200, { ok: true, unreadCount: model.unreadCountForTester(store, ctx.fakeAccountEmail) });
  }

  // ---- Admin-facing (Testing Feedback inbox) ------------------------------

  async function handleAdminListThreads(request, response, ctx, url) {
    if (!ctx.adminEmail) return deny(response, 401, { error: "Admin session required." });
    const store = readStore();
    const filters = {
      status: url?.searchParams?.get("status") || "",
      category: url?.searchParams?.get("category") || "",
      organizationId: url?.searchParams?.get("organizationId") || "",
      retestRequested: url?.searchParams?.get("retestRequested") === "true",
      unreadOnly: url?.searchParams?.get("unreadOnly") === "true",
    };
    const threads = model.listThreadsForAdmin(store, filters);
    jsonResponse(response, 200, { ok: true, threads, unreadCount: model.unreadCountForAdmin(store) });
  }

  async function handleAdminGetThread(request, response, ctx, threadId) {
    if (!ctx.adminEmail) return deny(response, 401, { error: "Admin session required." });
    const store = readStore();
    const thread = model.getThreadForAdmin(store, threadId);
    if (!thread) return deny(response, 404, { error: "Thread not found." });
    const messages = model.listMessagesForAdmin(store, threadId);
    const notes = model.listNotesForAdmin(store, threadId);
    jsonResponse(response, 200, { ok: true, thread, messages, notes });
  }

  async function handleAdminReply(request, response, ctx, threadId) {
    if (!ctx.adminEmail) return deny(response, 401, { error: "Admin session required." });
    const store = readStore();
    const body = await readJson(request).catch(() => ({}));
    if (!body.body || !String(body.body).trim()) return deny(response, 400, { error: "Reply cannot be empty." });
    const result = model.addAdminMessage(store, { threadId, adminEmail: ctx.adminEmail, body: body.body });
    if (!result) return deny(response, 404, { error: "Thread not found." });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, thread: result.thread, message: result.message });
  }

  async function handleAdminAddNote(request, response, ctx, threadId) {
    if (!ctx.adminEmail) return deny(response, 401, { error: "Admin session required." });
    const store = readStore();
    const body = await readJson(request).catch(() => ({}));
    if (!body.body || !String(body.body).trim()) return deny(response, 400, { error: "Note cannot be empty." });
    const note = model.addPrivateNote(store, { threadId, adminEmail: ctx.adminEmail, body: body.body });
    if (!note) return deny(response, 404, { error: "Thread not found." });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, note });
  }

  async function handleAdminSetStatus(request, response, ctx, threadId) {
    if (!ctx.adminEmail) return deny(response, 401, { error: "Admin session required." });
    const store = readStore();
    const body = await readJson(request).catch(() => ({}));
    const thread = model.setStatus(store, { threadId, status: body.status });
    if (!thread) return deny(response, 404, { error: "Thread not found, or status is invalid." });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, thread });
  }

  async function handleAdminSetRetest(request, response, ctx, threadId) {
    if (!ctx.adminEmail) return deny(response, 401, { error: "Admin session required." });
    const store = readStore();
    const body = await readJson(request).catch(() => ({}));
    const thread = model.setRetestRequested(store, { threadId, retestRequested: body.retestRequested === true });
    if (!thread) return deny(response, 404, { error: "Thread not found." });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, thread });
  }

  async function handleAdminMarkRead(request, response, ctx, threadId) {
    if (!ctx.adminEmail) return deny(response, 401, { error: "Admin session required." });
    const store = readStore();
    const thread = model.markReadByAdmin(store, threadId);
    if (!thread) return deny(response, 404, { error: "Thread not found." });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, thread });
  }

  async function handleAdminUnreadCount(request, response, ctx) {
    if (!ctx.adminEmail) return deny(response, 401, { error: "Admin session required." });
    const store = readStore();
    jsonResponse(response, 200, { ok: true, unreadCount: model.unreadCountForAdmin(store) });
  }

  function matchRoute(method, pathname, url) {
    const path = String(pathname || "");
    if (!path.startsWith(BASE)) return null;

    if (method === "GET" && path === `${BASE}/threads`) return (req, res, ctx) => handleListThreads(req, res, ctx);
    if (method === "POST" && path === `${BASE}/threads`) return (req, res, ctx) => handleCreateThread(req, res, ctx);
    if (method === "GET" && path === `${BASE}/unread-count`) return (req, res, ctx) => handleTesterUnreadCount(req, res, ctx);

    const threadMatch = path.match(/^\/api\/testing-feedback\/threads\/([^/]+)$/);
    if (method === "GET" && threadMatch) return (req, res, ctx) => handleGetThreadForTester(req, res, ctx, threadMatch[1]);
    const replyMatch = path.match(/^\/api\/testing-feedback\/threads\/([^/]+)\/messages$/);
    if (method === "POST" && replyMatch) return (req, res, ctx) => handleTesterReply(req, res, ctx, replyMatch[1]);
    const testerReadMatch = path.match(/^\/api\/testing-feedback\/threads\/([^/]+)\/read$/);
    if (method === "POST" && testerReadMatch) return (req, res, ctx) => handleTesterMarkRead(req, res, ctx, testerReadMatch[1]);

    if (method === "GET" && path === `${BASE}/admin/threads`) return (req, res, ctx) => handleAdminListThreads(req, res, ctx, url);
    if (method === "GET" && path === `${BASE}/admin/unread-count`) return (req, res, ctx) => handleAdminUnreadCount(req, res, ctx);
    const adminThreadMatch = path.match(/^\/api\/testing-feedback\/admin\/threads\/([^/]+)$/);
    if (method === "GET" && adminThreadMatch) return (req, res, ctx) => handleAdminGetThread(req, res, ctx, adminThreadMatch[1]);
    const adminReplyMatch = path.match(/^\/api\/testing-feedback\/admin\/threads\/([^/]+)\/reply$/);
    if (method === "POST" && adminReplyMatch) return (req, res, ctx) => handleAdminReply(req, res, ctx, adminReplyMatch[1]);
    const adminNoteMatch = path.match(/^\/api\/testing-feedback\/admin\/threads\/([^/]+)\/notes$/);
    if (method === "POST" && adminNoteMatch) return (req, res, ctx) => handleAdminAddNote(req, res, ctx, adminNoteMatch[1]);
    const adminStatusMatch = path.match(/^\/api\/testing-feedback\/admin\/threads\/([^/]+)\/status$/);
    if (method === "POST" && adminStatusMatch) return (req, res, ctx) => handleAdminSetStatus(req, res, ctx, adminStatusMatch[1]);
    const adminRetestMatch = path.match(/^\/api\/testing-feedback\/admin\/threads\/([^/]+)\/retest$/);
    if (method === "POST" && adminRetestMatch) return (req, res, ctx) => handleAdminSetRetest(req, res, ctx, adminRetestMatch[1]);
    const adminReadMatch = path.match(/^\/api\/testing-feedback\/admin\/threads\/([^/]+)\/read$/);
    if (method === "POST" && adminReadMatch) return (req, res, ctx) => handleAdminMarkRead(req, res, ctx, adminReadMatch[1]);

    return null;
  }

  return { matchRoute, BASE };
}

module.exports = {
  createTestingFeedbackApi,
  BASE,
};
