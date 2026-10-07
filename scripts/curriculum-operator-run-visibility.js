"use strict";

const schema = require("./curriculum-operator-schema.js");

const SESSION_ACTIVE_STATUSES = Object.freeze([
  "planned",
  "awaiting_confirm",
  "running",
  "paused",
]);

/**
 * Production confirmed create_lesson runs return 202 after durable job ack.
 * Tests and explicit syncCreateRun keep the legacy synchronous 200 path.
 */
function shouldAcknowledgeCreateAsynchronously({ action, body, wantsCreate }) {
  if (action !== "run" || body?.confirm !== true || wantsCreate !== true) return false;
  if (body?.syncCreateRun === true) return false;
  if (body?.asyncCreateRun === true) return true;
  return process.env.NODE_ENV !== "test";
}

function isSessionActiveJobStatus(status) {
  return SESSION_ACTIVE_STATUSES.includes(String(status || "").toLowerCase());
}

module.exports = {
  SESSION_ACTIVE_STATUSES,
  shouldAcknowledgeCreateAsynchronously,
  isSessionActiveJobStatus,
};
