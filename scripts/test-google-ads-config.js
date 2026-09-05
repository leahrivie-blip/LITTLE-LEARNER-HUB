#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const config = require("../server/google-ads-config.js");

assert.equal(config.status({}).enabled, false);
assert.equal(config.status({}).ready, false);
assert.equal(config.status({ GOOGLE_ADS_API_ENABLED: "true" }).configured, false);
const complete = Object.fromEntries(config.REQUIRED_KEYS.map((key) => [key, "configured"]));
assert.equal(config.status(complete).configured, true);
assert.equal(config.status(complete).ready, false);
assert.equal(config.status({ ...complete, GOOGLE_ADS_API_ENABLED: "true" }).ready, true);
console.log("PASS: Google Ads API configuration is disabled by default");
