#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "server", "index.js"), "utf8");
const userUpdate = source.slice(
  source.indexOf("function updateAnalyticsUser"),
  source.indexOf("function recordBillingEvent"),
);
const handler = source.slice(
  source.indexOf("async function handleAnalyticsEvent"),
  source.indexOf("function countEventsNamed"),
);

assert.match(handler, /const untrustedBillingEvent = \["checkout_success", "subscription_canceled"\]\.includes\(event\.name\);/);
assert.match(handler, /const userStorePatch = !untrustedBillingEvent/);
assert.match(handler, /const billingStorePatch = !untrustedBillingEvent/);
assert.match(userUpdate, /plan: base\.plan \|\| "Free"/);
assert.doesNotMatch(userUpdate, /updates\.subscriptionStatus = `\$\{updates\.plan/);
assert.doesNotMatch(userUpdate, /updates\.subscriptionStatus = "Canceled - Free Plan Active"/);

console.log("PASS analytics events cannot mutate membership or billing");
