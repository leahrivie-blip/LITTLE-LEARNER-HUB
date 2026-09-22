#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const profile = require("./curriculum-operator-instruction-profile.js");
const store = {};
const initial = profile.read(store, "leah@example.test");
assert.ok(initial.instructions.some((x) => /Never auto-publish/i.test(x)), "safe defaults seeded");
const saved = profile.save(store, "leah@example.test", [...initial.instructions, "Toddler activities must be simple and low-cost."], ["Keep the cover."]);
assert.equal(saved.version, 2, "profile versions updates");
assert.ok(profile.read(store, "other@example.test").instructions.length === initial.instructions.length, "owner isolation");
assert.equal(profile.parseInstructionCommand("Remember that I want realistic exact-activity pictures.").type, "propose");
assert.equal(profile.parseInstructionCommand("Forget the ribbon rule.").type, "forget");
assert.equal(profile.parseInstructionCommand("Show me what instructions you remember.").type, "show");
assert.equal(profile.parseInstructionCommand("Save these as my permanent curriculum instructions.").type, "confirm_save");
console.log("Curriculum operator instruction profile checks passed.");
