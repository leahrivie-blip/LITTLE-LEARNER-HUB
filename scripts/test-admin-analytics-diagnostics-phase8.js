#!/usr/bin/env node
/**
 * Phase 8 — admin analytics actionable diagnostics.
 * Run: npm run test:admin-analytics-diagnostics-phase8
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const diag = require("./admin-analytics-diagnostics.js");

const cases = [
  { httpStatus: 401, code: "admin_session_invalid", expectCode: "admin_session_invalid", retryable: false },
  { httpStatus: 403, code: "forbidden", expectCode: "forbidden", retryable: false },
  { httpStatus: 404, expectCode: "not_found", retryable: true },
  { httpStatus: 429, expectCode: "rate_limited", retryable: true },
  { httpStatus: 500, code: "admin_analytics_failed", expectCode: "admin_analytics_failed", retryable: true },
  { aborted: true, expectCode: "timeout", retryable: true },
  { invalidJson: true, httpStatus: 502, expectCode: "invalid_json", retryable: true },
  { offline: true, message: "Failed to fetch", expectCode: "network_offline", retryable: true },
];

for (const item of cases) {
  const classified = diag.classifyFailure(item);
  assert.equal(classified.safeErrorCode, item.expectCode, `code for ${JSON.stringify(item)}`);
  assert.equal(classified.retryable, item.retryable, `retryable for ${item.expectCode}`);
  const built = diag.buildDiagnostic({
    ...item,
    endpoint: "/api/admin/analytics",
    requestCorrelationId: "aan-test-1",
    adminSection: "insights",
    message: item.message || "sample",
  });
  assert.equal(built.endpoint, "/api/admin/analytics");
  assert.equal(built.requestCorrelationId, "aan-test-1");
  assert.equal(built.adminSection, "insights");
  assert.ok(built.timestamp);
  assert.equal(built.retryability, item.retryable ? "retryable" : "not_retryable");
  assert.ok(!/password|Bearer ey/i.test(JSON.stringify(built)));
}

const redacted = diag.safeMessage("Authorization: Bearer secret-token-value password=hunter2");
assert.match(redacted, /\[redacted\]/);
assert.doesNotMatch(redacted, /secret-token-value|hunter2/);

const line = diag.formatLogLine("failed", {
  httpStatus: 500,
  code: "admin_analytics_failed",
  message: "boom",
  requestCorrelationId: "aan-xyz",
});
assert.match(line, /^\[admin-analytics:client\] failed \{/);
assert.match(line, /"safeErrorCode":"admin_analytics_failed"/);
assert.match(line, /"requestCorrelationId":"aan-xyz"/);
// Must be a single string payload, not a trailing raw Object arg pattern.
assert.doesNotMatch(line, /failed Object$/);

const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
assert.match(appJs, /logAdminAnalyticsClientEvent\("failed"/);
assert.match(appJs, /adminAnalyticsDiagnosticHtml/);
assert.match(appJs, /data-refresh-analytics/);
assert.match(appJs, /X-Correlation-Id/);

const serverJs = fs.readFileSync(path.join(__dirname, "..", "server", "index.js"), "utf8");
assert.match(serverJs, /correlationId/);
assert.match(serverJs, /X-Correlation-Id/);

const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
assert.match(indexHtml, /admin-analytics-diagnostics\.js/);

// Successful retry classification stays retryable for 500 and becomes clean diagnostic
const retry = diag.buildDiagnostic({
  httpStatus: 500,
  code: "admin_analytics_failed",
  message: "temporary",
  requestCorrelationId: "aan-retry",
});
assert.equal(retry.retryability, "retryable");

console.log("PASS admin-analytics-diagnostics-phase8");
