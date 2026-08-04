#!/usr/bin/env node
/**
 * Phase 10 — canonical age filters + admin layout polish hooks.
 * Run: npm run test:age-filter-phase10
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const age = require("./age-group-normalize.js");

assert.equal(age.canonicalAgeGroup("Infant"), "Infant");
assert.equal(age.canonicalAgeGroup("Infant 0-12 Months"), "Infant");
assert.equal(age.canonicalAgeGroup("Infant 0–12 Months"), "Infant");
assert.equal(age.canonicalAgeGroup("infant 0—12 months"), "Infant");
assert.equal(age.canonicalAgeGroup("Toddler"), "Toddler");
assert.equal(age.canonicalAgeGroup("Young Toddler"), "Toddler");
assert.equal(age.canonicalAgeGroup("Preschool"), "Preschool");
assert.ok(age.agesMatch("Infant 0-12 Months", "Infant 0–12 Months"));
assert.ok(age.agesMatch("Infant", "Infant 0-12 Months"));

const options = age.uniqueCanonicalAgeOptions([
  "Infant",
  "Infant 0-12 Months",
  "Infant 0–12 Months",
  "Toddler",
  "Preschool",
]);
assert.equal(options.length, 3);
assert.deepEqual(options.map((row) => row.value), ["Infant", "Toddler", "Preschool"]);

const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
assert.match(appJs, /canonicalAgeFilterOptions/);
assert.match(appJs, /agesMatchForFilter/);
assert.match(appJs, /LLHAgeGroupNormalize/);

const editor = fs.readFileSync(path.join(__dirname, "..", "scripts/teaching-kit-enrichment-editor.js"), "utf8");
assert.match(editor, /tk-enrich-jump-links/);
assert.match(editor, /data-enrich-scroll-target="history"/);
assert.match(editor, /data-enrich-scroll-target="quality"/);

const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
assert.match(css, /\.tk-enrich-jump-links/);
assert.match(css, /\.admin-content-filters/);

const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
assert.match(indexHtml, /age-group-normalize\.js/);

console.log("PASS age-filter-phase10");
