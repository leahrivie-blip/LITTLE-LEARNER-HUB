#!/usr/bin/env node
"use strict";

const assert = require("assert");
const sync = require("../server/curriculum-production-sync");

function plan(id, extra = {}) {
  return {
    id,
    title: `Lesson ${id}`,
    age: "Preschool",
    status: "published",
    plan: "Pro",
    books: [{ title: "Book" }],
    songs: [{ title: "Song" }],
    dailyPlans: { monday: { items: [{ id: "item-1", title: "Circle" }] } },
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...extra,
  };
}

function run() {
  const production = {
    lessonPlans: [plan("cur-lp-a"), plan("cur-lp-b"), plan("cur-lp-c")],
    activities: [
      { id: "act-a1", lessonPlanId: "cur-lp-a", title: "A1", status: "published" },
      { id: "act-b1", lessonPlanId: "cur-lp-b", title: "B1", status: "published" },
    ],
    resources: [{ id: "res-1", title: "Printable", lessonPlanIds: ["cur-lp-a"], status: "published" }],
    series: [{ id: "ser-1", title: "Series", weeks: [{ lessonPlanId: "cur-lp-a" }] }],
  };

  // 1) Missing imports
  const testingEmpty = { lessonPlans: [], activities: [], resources: [], series: [] };
  const planned = sync.planCurriculumSync(production, testingEmpty);
  assert.strictEqual(planned.ok, true);
  assert.strictEqual(planned.imported.length, 3);
  assert.ok(planned.nextCurriculum.lessonPlans.every((p) => p.productionSnapshot === true));

  // 2) Idempotent second run
  const again = sync.planCurriculumSync(production, planned.nextCurriculum);
  assert.strictEqual(again.ok, true);
  assert.strictEqual(again.imported.length, 0);
  assert.strictEqual(again.updated.length, 0);
  assert.strictEqual(again.comparison.status, "in_sync");

  // 3) Update changed production snapshot
  const prodUpdated = {
    ...production,
    lessonPlans: [
      plan("cur-lp-a", { title: "Lesson cur-lp-a UPDATED", updatedAt: "2026-08-04T00:00:00.000Z" }),
      plan("cur-lp-b"),
      plan("cur-lp-c"),
    ],
  };
  const updatePlan = sync.planCurriculumSync(prodUpdated, planned.nextCurriculum);
  assert.strictEqual(updatePlan.ok, true);
  assert.strictEqual(updatePlan.updated.length, 1);
  assert.strictEqual(updatePlan.updated[0].id, "cur-lp-a");

  // 4a) Stale production copy without snapshot marker → update, not conflict
  const staleCopy = {
    lessonPlans: [plan("cur-lp-a", { title: "Old title", updatedAt: "2026-07-01T00:00:00.000Z" })],
    activities: [],
    resources: [],
    series: [],
  };
  const stalePlan = sync.planCurriculumSync(production, staleCopy);
  assert.strictEqual(stalePlan.ok, true, "stale production copies should update");
  assert.ok(stalePlan.updated.some((x) => x.id === "cur-lp-a") || stalePlan.imported.some((x) => x.id === "cur-lp-a"));

  // 4b) Conflict with explicitly tester-owned same ID
  const testerOwned = {
    lessonPlans: [
      plan("cur-lp-a", { title: "Tester rewrite", testerOwned: true, updatedAt: "2026-08-05T00:00:00.000Z" }),
      plan("tester-only"),
    ],
    activities: [],
    resources: [],
    series: [],
  };
  const conflicted = sync.planCurriculumSync(production, testerOwned);
  assert.strictEqual(conflicted.ok, false);
  assert.strictEqual(conflicted.aborted, true);
  assert.ok(conflicted.comparison.conflicts.some((c) => c.id === "cur-lp-a"));

  // 4c) Default mode: shared catalog ID with newer testing timestamp still refreshes from production
  const locallyNewer = {
    lessonPlans: [
      plan("cur-lp-a", {
        title: "Local edit",
        updatedAt: "2026-08-10T00:00:00.000Z",
      }),
    ],
    activities: [],
    resources: [],
    series: [],
  };
  const newerDefault = sync.planCurriculumSync(production, locallyNewer);
  assert.strictEqual(newerDefault.ok, true);
  assert.ok(newerDefault.updated.some((x) => x.id === "cur-lp-a"));

  // 4d) Strict mode: same case becomes a conflict
  const newerStrict = sync.planCurriculumSync(production, locallyNewer, { strictConflicts: true });
  assert.strictEqual(newerStrict.ok, false);
  assert.ok(newerStrict.comparison.conflicts.some((c) => c.id === "cur-lp-a"));

  // 5) Tester-only plans preserved
  const withTester = {
    lessonPlans: [
      ...planned.nextCurriculum.lessonPlans,
      plan("tester-local-1", { title: "My draft" }),
    ],
    activities: planned.nextCurriculum.activities,
    resources: planned.nextCurriculum.resources,
    series: planned.nextCurriculum.series,
  };
  const preserve = sync.planCurriculumSync(production, withTester);
  assert.strictEqual(preserve.ok, true);
  assert.ok(preserve.nextCurriculum.lessonPlans.some((p) => p.id === "tester-local-1"));
  assert.strictEqual(preserve.nextCurriculum.lessonPlans.length, 4);

  // 6) Never shrink
  assert.ok(preserve.nextCurriculum.lessonPlans.length >= withTester.lessonPlans.length
    || preserve.nextCurriculum.lessonPlans.some((p) => p.id === "tester-local-1"));

  console.log("PASS curriculum-production-sync unit checks");
}

run();
