#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const research = require("./curriculum-operator-research.js");

const safe = research.readiness({ enabled: false, apiKey: "mock-secret-value" });
assert.equal(safe.status, "disabled", "absent/false flag reports disabled");
assert.equal(JSON.stringify(safe).includes("mock-secret-value"), false, "disabled readiness omits secret value");
assert.equal(research.readiness({ enabled: false, apiKey: "" }).status, "disabled", "false flag remains disabled");
assert.equal(research.readiness({ enabled: true, apiKey: "" }).status, "missing_api_key", "enabled flag without key reports missing API key");
const ready = research.readiness({ enabled: true, apiKey: "mock-secret-value" });
assert.equal(ready.status, "ready", "enabled flag plus mocked key reports ready");
assert.equal(JSON.stringify(ready).includes("mock-secret-value"), false, "ready response omits secret-derived data");
console.log("Curriculum operator research configuration checks passed.");
