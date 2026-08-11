#!/usr/bin/env node
/**
 * Guards the Render free-tier OOM fix: Postgres readStore() must not
 * structuredClone the full multi-MB document on every call.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const serverJs = fs.readFileSync(path.join(__dirname, "..", "server", "index.js"), "utf8");

const readStoreMatch = serverJs.match(/function readStore\(\) \{[\s\S]*?\n\}/);
assert.ok(readStoreMatch, "readStore() function present");
assert.doesNotMatch(
  readStoreMatch[0],
  /structuredClone\(storeCache/,
  "readStore() must not structuredClone(storeCache) on the hot path",
);
assert.match(serverJs, /function cloneStore\(/, "cloneStore() helper present for rare isolated snapshots");
assert.match(serverJs, /\/api\/testing\/memory-health/, "testing memory-health route present");
assert.match(serverJs, /\[testing-memory\]/, "testing memory log markers present");
assert.match(
  serverJs,
  /CURRICULUM_LIBRARY_DTO_CACHE_MAX_ENTRIES/,
  "curriculum DTO cache entry cap present",
);

console.log("PASS postgres readStore avoids full-document clone; testing memory diagnostics present");
