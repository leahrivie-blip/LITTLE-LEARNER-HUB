#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");

const helperStart = app.indexOf("function refreshAdminHomeWorkspaceIfVisible()");
const loaderStart = app.indexOf("async function loadAdminAnalyticsFromBackend");
const loaderEnd = app.indexOf("\nfunction analyticsRowsHtml", loaderStart);

assert.ok(helperStart >= 0, "Admin Home refresh helper exists");
assert.match(app.slice(helperStart, loaderStart), /getAdminSectionTab\(\) !== "admin-home"/);
assert.match(app.slice(helperStart, loaderStart), /AdminWorkspace\?\.renderAdminHomeWorkspace/);

const loader = app.slice(loaderStart, loaderEnd);
assert.ok(
  (loader.match(/refreshAdminHomeWorkspaceIfVisible\(\);/g) || []).length >= 4,
  "Admin Home is repainted for loading, success, failure, and completion states",
);
assert.match(loader, /adminAnalyticsLoading = false;[\s\S]*?refreshAdminHomeWorkspaceIfVisible\(\);/);

console.log("PASS admin-home analytics refresh lifecycle");
