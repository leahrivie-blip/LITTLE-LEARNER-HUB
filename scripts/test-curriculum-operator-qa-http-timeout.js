#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { parseQaHttpTimeoutMs, DEFAULT_QA_HTTP_TIMEOUT_MS } = require("./curriculum-operator-qa-http-timeout.js");

assert.equal(DEFAULT_QA_HTTP_TIMEOUT_MS, 900000, "default QA HTTP timeout is 15 minutes");
assert.equal(parseQaHttpTimeoutMs(undefined), 900000);
assert.equal(parseQaHttpTimeoutMs(""), 900000);
assert.equal(parseQaHttpTimeoutMs("3600000"), 3600000, "production may use 60 minutes");
assert.equal(parseQaHttpTimeoutMs("nope"), 900000, "invalid values fall back to default");

console.log("Curriculum operator QA HTTP timeout checks passed.");
