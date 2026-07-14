#!/usr/bin/env node
/**
 * Startup preschool seed/repair unit checks.
 * Run: node scripts/test-curriculum-preschool-seed-repair.js
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const {
  plansNeedingRepair,
  weekdayActivityCounts,
} = require("../server/curriculum-preschool-seed.js");
const {
  readPreschoolImportTarget,
  PRESCHOOL_PRO_IMPORT_TARGETS,
} = require("./curriculum-preschool-import-targets.js");

function test(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (error) {
    console.error(`FAIL  ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

const spaceTarget = PRESCHOOL_PRO_IMPORT_TARGETS.find((item) => item.stableId === "cur-lp-preschool-space-adventure");
assert.ok(spaceTarget);
const fullSpace = readPreschoolImportTarget(spaceTarget);

test("full Space Adventure source has all weekdays", () => {
  const counts = weekdayActivityCounts(fullSpace);
  ["monday", "tuesday", "wednesday", "thursday", "friday"].forEach((day) => {
    assert.ok(counts[day] > 0, `${day} empty`);
  });
});

test("truncated Space Adventure is flagged for repair", () => {
  const truncated = {
    ...fullSpace,
    dailyPlans: {
      monday: fullSpace.dailyPlans.monday,
      tuesday: fullSpace.dailyPlans.tuesday,
      wednesday: { items: [] },
      thursday: { items: [] },
      friday: { items: [] },
    },
  };
  const needs = plansNeedingRepair({ lessonPlans: [truncated] }, [spaceTarget]);
  assert.equal(needs.length, 1);
  assert.equal(needs[0].target.stableId, "cur-lp-preschool-space-adventure");
});

test("complete Space Adventure is not flagged for repair", () => {
  const needs = plansNeedingRepair({ lessonPlans: [fullSpace] }, [spaceTarget]);
  assert.equal(needs.length, 0);
});

if (!process.exitCode) {
  console.log("\nAll preschool seed repair tests passed.");
}
