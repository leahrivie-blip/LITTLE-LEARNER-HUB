#!/usr/bin/env node
/**
 * Materials near-duplicate collapse for binder checklists.
 * Run: NODE_ENV=test node scripts/test-materials-near-dedupe.js
 */
"use strict";

const assert = require("node:assert/strict");
const Materials = require("./teaching-kit-materials.js");

const samples = [
  "animal props",
  "plastic farm animals",
  "farm animals",
  "washable animals",
  "toy farm animals",
  "picture cards",
  "farm picture cards",
  "farm animal picture cards",
  "tape",
  "masking tape",
  "painters tape",
  "towels",
  "paper towels",
  "mural paper",
  "butcher paper",
  "scissors",
  "glue sticks",
];

const inv = Materials.normalizeMaterialInventory(samples);
const labels = inv.items.map((item) => item.label);

assert.ok(labels.includes("Plastic farm animals"), "farm animal props collapsed");
assert.ok(labels.includes("Farm picture cards"), "picture cards collapsed");
assert.ok(labels.includes("Tape"), "tape variants collapsed");
assert.ok(labels.includes("Towels"), "towels collapsed");
assert.ok(labels.includes("Mural / butcher paper"), "mural/butcher paper collapsed");
assert.ok(labels.includes("Scissors"), "distinct scissors preserved");
assert.ok(labels.includes("Glue sticks"), "distinct glue sticks preserved");

const farmish = labels.filter((label) => /farm animal|picture card|tape|towel|mural|butcher/i.test(label));
assert.ok(farmish.length <= 5, `near-duplicates collapsed (${farmish.join(", ")})`);
assert.ok(inv.duplicatesRemoved >= 8, `removed duplicates (${inv.duplicatesRemoved})`);

console.log(JSON.stringify({ ok: true, labels, duplicatesRemoved: inv.duplicatesRemoved }, null, 2));
console.log("materials-near-dedupe: PASS");
