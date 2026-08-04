#!/usr/bin/env node
/**
 * Regression: activity viewer close control must say Close Activity (not Close lesson plan).
 * Run: npm run test:close-activity-label
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
assert.match(appJs, /function resourceViewerCloseLabel/);
assert.match(appJs, /Close Activity/);
assert.match(appJs, /function applyResourceViewerCloseLabel/);
assert.match(appJs, /applyResourceViewerCloseLabel\(viewerResource\)/);
console.log("PASS close activity label markers");
