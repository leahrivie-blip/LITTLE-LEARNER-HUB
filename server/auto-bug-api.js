/**
 * Automated testing-only bug API — /api/auto-bugs/*
 *
 * Production always rejects. Never accepts passwords, tokens, childcare
 * content, medical data, payment payloads, messages, or form answers.
 */
"use strict";

const model = require("../scripts/auto-bug-data-model.js");
const { buildOwnerReportMarkdown } = require("../scripts/auto-bug-owner-report.js");
const { investigationPlaybook, evaluateInvestigationStop, classifyEligibility } = require("../scripts/auto-bug-eligibility.js");
const { buildSafeEvent, sanitizeErrorMessage, cleanText } = require("../scripts/testing-sentry-sanitize.js");

const BASE = "/api/auto-bugs";

function createAutoBugApi({
  readStore,
  writeStore,
  jsonResponse,
  readJson,
  getGitSha,
  isLiveProduction = () => false,
}) {
  function deny(response, status, payload) {
    jsonResponse(response, status, { ok: false, ...payload });
  }

  function assertTestingHost(response) {
    if (isLiveProduction()) {
      deny(response, 403, { error: "Automated bug workflow is disabled on production.", code: "production_lock" });
      return false;
    }
    return true;
  }

  function deployedCommit() {
    try {
      return typeof getGitSha === "function" ? String(getGitSha() || "") : "";
    } catch {
      return "";
    }
  }

  function sanitizeIntakeBody(body = {}) {
    const safe = buildSafeEvent({
      errorType: body.errorType || body.type || "other",
      message: body.message || "",
      deployedCommit: body.deployedCommit || deployedCommit(),
      page: body.page || "",
      role: body.role || body.roleCategory || "",
      device: body.deviceBrowser || body.device || "",
      fakeOrganizationId: body.fakeOrganizationId || "",
      timingMs: body.timingMs,
      source: body.source || "browser",
    });
    return {
      ...safe,
      errorType: model.normalizeErrorType(body.errorType || body.type || safe.errorType),
      sanitizedStack: model.sanitizeStackTrace(body.sanitizedStack || body.stack || ""),
      testingEnvironment: body.testingEnvironment || "",
      host: cleanText(body.host, 120),
      reproductionSteps: cleanText(body.reproductionSteps, 1200),
      // Explicitly drop any accidental sensitive fields from the client body.
    };
  }

  async function handleClientConfig(request, response) {
    if (!assertTestingHost(response)) return;
    jsonResponse(response, 200, {
      ok: true,
      enabled: true,
      intake: `${BASE}/ingest`,
      note: "Sanitized automated bug intake is active on this testing host. Never send private childcare or payment data.",
      hardLimits: investigationPlaybook().hardLimits,
    });
  }

  async function handleIngest(request, response) {
    if (!assertTestingHost(response)) return;
    const body = await readJson(request).catch(() => ({}));
    const intake = sanitizeIntakeBody(body);
    if (!intake.message && !intake.sanitizedStack && intake.errorType === model.ERROR_TYPES.OTHER) {
      return deny(response, 400, { error: "Nothing useful to record after sanitization." });
    }
    const store = readStore();
    const result = model.ingestFailure(store, intake);
    writeStore(store);
    jsonResponse(response, result.created ? 201 : 200, {
      ok: true,
      created: result.created,
      record: model.publicRecord(result.record),
    });
  }

  async function handleFromSmoke(request, response, ctx) {
    if (!assertTestingHost(response)) return;
    if (!ctx.adminEmail) return deny(response, 401, { error: "Admin session required." });
    const body = await readJson(request).catch(() => ({}));
    const failures = Array.isArray(body.failures) ? body.failures.slice(0, 20) : [];
    if (!failures.length && body.ok === false) {
      failures.push({
        errorType: model.ERROR_TYPES.DEPLOYED_SMOKE_FAILURE,
        message: sanitizeErrorMessage(body.message || "Deployed smoke test failed"),
        page: "deployed-smoke",
        role: "admin",
        device: "computer",
      });
    }
    const store = readStore();
    const records = [];
    for (const failure of failures) {
      const intake = sanitizeIntakeBody({
        ...failure,
        errorType: failure.errorType || model.ERROR_TYPES.DEPLOYED_SMOKE_FAILURE,
        deployedCommit: body.deployedCommit || deployedCommit(),
        testingEnvironment: "testing",
        source: "deployed_smoke",
        host: body.targetHost || "",
      });
      const result = model.ingestFailure(store, intake);
      records.push(model.publicRecord(result.record));
    }
    writeStore(store);
    jsonResponse(response, 200, { ok: true, count: records.length, records });
  }

  async function handleList(request, response, ctx, url) {
    if (!assertTestingHost(response)) return;
    if (!ctx.adminEmail) return deny(response, 401, { error: "Admin session required." });
    const status = url?.searchParams?.get("status") || "";
    const errorType = url?.searchParams?.get("errorType") || "";
    const limit = url?.searchParams?.get("limit") || "100";
    const store = readStore();
    jsonResponse(response, 200, {
      ok: true,
      openCount: model.openCount(store),
      records: model.listRecords(store, { status, errorType, limit }),
    });
  }

  async function handleGet(request, response, ctx, id) {
    if (!assertTestingHost(response)) return;
    if (!ctx.adminEmail) return deny(response, 401, { error: "Admin session required." });
    const store = readStore();
    const record = model.getRecord(store, id);
    if (!record) return deny(response, 404, { error: "Bug record not found." });
    jsonResponse(response, 200, {
      ok: true,
      record,
      issueBody: model.githubIssueBody(record),
      ownerReportMarkdown: buildOwnerReportMarkdown(record),
      playbook: investigationPlaybook(),
    });
  }

  async function handleStatus(request, response, ctx, id) {
    if (!assertTestingHost(response)) return;
    if (!ctx.adminEmail) return deny(response, 401, { error: "Admin session required." });
    const body = await readJson(request).catch(() => ({}));
    const store = readStore();
    const record = model.updateStatus(store, id, body.status, body.note || "");
    if (!record) return deny(response, 400, { error: "Invalid bug id or status." });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, record });
  }

  async function handleInvestigation(request, response, ctx, id) {
    if (!assertTestingHost(response)) return;
    if (!ctx.adminEmail) return deny(response, 401, { error: "Admin session required." });
    const body = await readJson(request).catch(() => ({}));
    const stop = evaluateInvestigationStop(body.stopContext || {});
    const store = readStore();
    const record = model.attachInvestigation(store, id, {
      ...body,
      stopped: stop.stop || body.stopped === true,
      stopReason: stop.stop ? stop.reason : (body.stopReason || ""),
    });
    if (!record) return deny(response, 404, { error: "Bug record not found." });
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      record,
      stop,
      reminder: "Draft PR to testing only. Never merge or deploy automatically.",
    });
  }

  async function handleOwnerReport(request, response, ctx, id) {
    if (!assertTestingHost(response)) return;
    if (!ctx.adminEmail) return deny(response, 401, { error: "Admin session required." });
    const body = await readJson(request).catch(() => ({}));
    const store = readStore();
    const record = model.attachOwnerReport(store, id, body);
    if (!record) return deny(response, 404, { error: "Bug record not found." });
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      record,
      markdown: buildOwnerReportMarkdown(record),
      approveQuestion: "Approve merge to testing?",
    });
  }

  async function handleVerification(request, response, ctx, id) {
    if (!assertTestingHost(response)) return;
    if (!ctx.adminEmail) return deny(response, 401, { error: "Admin session required." });
    const body = await readJson(request).catch(() => ({}));
    const store = readStore();
    const record = model.attachVerification(store, id, body);
    if (!record) return deny(response, 404, { error: "Bug record not found." });
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      record,
      reopened: record.status === model.STATUSES.REOPENED,
      message: record.status === model.STATUSES.REOPENED
        ? "Verification failed — bug record automatically reopened."
        : "Verification passed — bug marked verified.",
    });
  }

  async function handlePlaybook(request, response) {
    if (!assertTestingHost(response)) return;
    jsonResponse(response, 200, { ok: true, playbook: investigationPlaybook(), classifyExample: classifyEligibility({ errorType: "browser_exception", message: "TypeError: x is null", page: "daily-care" }) });
  }

  /**
   * Internal helper used by testing Sentry / smoke hooks (same process).
   */
  function ingestFromSafeEvent(partial = {}) {
    if (isLiveProduction()) return { ok: false, reason: "production_lock" };
    try {
      const store = readStore();
      const result = model.ingestFailure(store, {
        ...partial,
        deployedCommit: partial.deployedCommit || deployedCommit(),
        errorType: partial.errorType,
        message: partial.message,
        page: partial.page,
        role: partial.roleCategory || partial.role,
        device: partial.device,
        sanitizedStack: partial.sanitizedStack || "",
        source: partial.source || "server",
        fakeOrganizationId: partial.fakeOrganizationId || "",
        testingEnvironment: partial.testingEnvironment || "testing",
      });
      writeStore(store);
      return { ok: true, created: result.created, id: result.record.id };
    } catch (error) {
      return { ok: false, reason: error?.message || "ingest_failed" };
    }
  }

  function matchRoute(method, pathname, url) {
    const path = String(pathname || "");
    if (!path.startsWith(BASE)) return null;

    if (method === "GET" && path === `${BASE}/client-config`) return (req, res) => handleClientConfig(req, res);
    if (method === "POST" && path === `${BASE}/ingest`) return (req, res) => handleIngest(req, res);
    if (method === "GET" && path === `${BASE}/playbook`) return (req, res) => handlePlaybook(req, res);
    if (method === "POST" && path === `${BASE}/from-smoke`) return (req, res, ctx) => handleFromSmoke(req, res, ctx);
    if (method === "GET" && path === `${BASE}`) return (req, res, ctx) => handleList(req, res, ctx, url);

    const idMatch = path.match(/^\/api\/auto-bugs\/([^/]+)$/);
    if (method === "GET" && idMatch && !["client-config", "playbook", "ingest", "from-smoke"].includes(idMatch[1])) {
      return (req, res, ctx) => handleGet(req, res, ctx, idMatch[1]);
    }
    const statusMatch = path.match(/^\/api\/auto-bugs\/([^/]+)\/status$/);
    if (method === "POST" && statusMatch) return (req, res, ctx) => handleStatus(req, res, ctx, statusMatch[1]);
    const invMatch = path.match(/^\/api\/auto-bugs\/([^/]+)\/investigation$/);
    if (method === "POST" && invMatch) return (req, res, ctx) => handleInvestigation(req, res, ctx, invMatch[1]);
    const reportMatch = path.match(/^\/api\/auto-bugs\/([^/]+)\/owner-report$/);
    if (method === "POST" && reportMatch) return (req, res, ctx) => handleOwnerReport(req, res, ctx, reportMatch[1]);
    const verifyMatch = path.match(/^\/api\/auto-bugs\/([^/]+)\/verification$/);
    if (method === "POST" && verifyMatch) return (req, res, ctx) => handleVerification(req, res, ctx, verifyMatch[1]);

    return null;
  }

  return { matchRoute, BASE, ingestFromSafeEvent };
}

module.exports = {
  createAutoBugApi,
  BASE,
};
