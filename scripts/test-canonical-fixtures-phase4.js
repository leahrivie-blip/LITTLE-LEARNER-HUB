#!/usr/bin/env node
/**
 * Phase 4 — Home Daycare + Center fixture drift + relationship checks.
 * Read-only drift; no production; does not auto-delete.
 * Run: node scripts/test-canonical-fixtures-phase4.js
 */
"use strict";

const assert = require("node:assert/strict");
const canonical = require("../server/canonical-data.js");
const programOwnership = require("../server/program-ownership.js");
const scheduleLib = require("../server/schedule-lib.js");
const familyHubLib = require("../server/family-hub-lib.js");

function pass(id) {
  console.log(`PASS  ${id}`);
}

function seedProgram(store, { email, name, accountType, rooms, children }) {
  const program = programOwnership.ensureProgramForOwner(store, email, { name });
  store.programs[program.id].accountType = accountType;
  store.programs[program.id].isTestingProgram = true;
  store.users[email] = {
    email,
    role: "owner",
    programId: program.id,
    accountType,
    plan: "Pro",
    subscriptionStatus: "Pro Subscription Active",
    stripeSubscriptionStatus: "active",
    firebaseUid: `uid-${email.split("@")[0]}`,
  };
  const ctx = programOwnership.resolveProgramContext(store, { email, uid: store.users[email].firebaseUid });
  programOwnership.writeProgramChildData(store, ctx, {
    ...programOwnership.emptyChildPayload(),
    Profiles: children,
    Meals: children.slice(0, 1).map((c) => ({ id: `meal-${c.id}`, childId: c.id, date: "2026-08-08" })),
    Documents: children.slice(0, 1).map((c) => ({ id: `doc-${c.id}`, childId: c.id, title: "Enrollment", status: "needed" })),
  }, { mergeScoped: false });
  store.programData[program.id].schedule = scheduleLib.normalizeScheduleDocument({
    classrooms: rooms,
    items: [
      {
        id: `lesson-${program.id}`,
        type: "lesson_plan",
        classroomId: rooms[0].id,
        weekStartDate: "2026-08-04",
        endDate: "2026-08-08",
        lessonPlanId: "catalog-lesson-1",
        lessonPlanTitle: "Ocean Week",
        childIds: [children[0].id],
        snapshot: { theme: "Ocean", dailyPlans: {} },
      },
    ],
  });
  return { program, ctx };
}

function main() {
  const homes = canonical.describeCanonicalHomes();
  assert.equal(homes.Child, "store.programData[programId].child.data.Profiles");
  assert.equal(homes.Family, "store.familyHouseholds[id] (childIds membership; names from Profiles)");
  assert.match(homes.WeeklyPlanner, /DERIVED from schedule/);
  pass("canonical_homes_plain_language");

  const store = {
    users: {},
    programs: {},
    programData: {},
    familyHouseholds: {},
    familyHubMessages: [],
    messages: [{ id: "support-1" }],
    childData: {},
    scheduleByUser: {},
    programMembers: {},
    siteContent: {
      curriculum: {
        lessonPlans: [{ id: "catalog-lesson-1", title: "Ocean Week" }],
      },
    },
  };

  // —— Home daycare fixture ——
  const hd = seedProgram(store, {
    email: "hd.owner@example.invalid",
    name: "Maple Grove Home Daycare",
    accountType: "home_daycare",
    rooms: [{ id: "classroom-main", name: "Main Classroom" }],
    children: [
      { id: "hd-child-1", name: "Ava", classroomId: "classroom-main", ageGroup: "Toddler" },
      { id: "hd-child-2", name: "Ben", classroomId: "classroom-main", ageGroup: "Preschool" },
    ],
  });
  store.users["hd.teacher@example.invalid"] = {
    email: "hd.teacher@example.invalid",
    role: "teacher",
    programId: hd.program.id,
    linkedProgramOwnerEmail: "hd.owner@example.invalid",
    classroomIds: ["classroom-main"],
  };
  store.familyHouseholds["hd-hh-1"] = {
    id: "hd-hh-1",
    ownerEmail: "hd.owner@example.invalid",
    programId: hd.program.id,
    label: "Ava Family",
    email: "ava.parent@example.invalid",
    childIds: ["hd-child-1"],
    children: [{ id: "hd-child-1" }], // id-only — no second name roster
    status: "active",
  };
  store.familyHubMessages.push({
    id: "fh-1",
    householdId: "hd-hh-1",
    body: "Hello",
  });

  const hdDrift = canonical.reportCanonicalDrift(store, hd.program.id, { programOwnership, scheduleLib });
  assert.equal(hdDrift.ok, true, JSON.stringify(hdDrift.drift, null, 2));
  assert.equal(hdDrift.sources.children, "programData");
  assert.equal(hdDrift.sources.schedule, "programData.schedule");
  assert.equal(hdDrift.counts.households, 1);
  assert.equal(hdDrift.messaging.channels.familyHub.count, 1);
  assert.equal(hdDrift.billing.plan, "Pro");
  pass("home_daycare_fixture_drift_clean");

  // FH overlay prefers Profiles name even with id-only household children
  const ownerChild = programOwnership.readProgramChildData(store, hd.ctx).data;
  const overlaid = familyHubLib.overlayLiveChildren(
    store.familyHouseholds["hd-hh-1"].children,
    ownerChild,
    store.familyHouseholds["hd-hh-1"].childIds,
  );
  assert.equal(overlaid[0].name, "Ava");
  assert.equal(overlaid[0].id, "hd-child-1");
  pass("home_daycare_family_hub_overlay_profiles");

  // —— Center fixture ——
  const center = seedProgram(store, {
    email: "center.owner@example.invalid",
    name: "Sunshine Center",
    accountType: "center",
    rooms: [
      { id: "room-infants", name: "Infants" },
      { id: "room-preschool", name: "Preschool" },
    ],
    children: [
      { id: "c-child-1", name: "Kai", classroomId: "room-infants", ageGroup: "Infant" },
      { id: "c-child-2", name: "Nina", classroomId: "room-preschool", ageGroup: "Preschool" },
      { id: "c-child-3", name: "Omar", classroomId: "room-preschool", ageGroup: "Preschool" },
    ],
  });
  store.users["center.director@example.invalid"] = {
    email: "center.director@example.invalid",
    role: "director",
    programId: center.program.id,
    linkedProgramOwnerEmail: "center.owner@example.invalid",
  };
  store.users["center.teacher@example.invalid"] = {
    email: "center.teacher@example.invalid",
    role: "teacher",
    programId: center.program.id,
    linkedProgramOwnerEmail: "center.owner@example.invalid",
    classroomIds: ["room-preschool"],
  };
  store.familyHouseholds["c-hh-1"] = {
    id: "c-hh-1",
    ownerEmail: "center.owner@example.invalid",
    programId: center.program.id,
    label: "Kai Family",
    childIds: ["c-child-1"],
    children: [{ id: "c-child-1" }],
    status: "invited",
  };
  store.familyHouseholds["c-hh-2"] = {
    id: "c-hh-2",
    ownerEmail: "center.owner@example.invalid",
    programId: center.program.id,
    label: "Nina & Omar",
    childIds: ["c-child-2", "c-child-3"],
    children: [{ id: "c-child-2" }, { id: "c-child-3" }],
    status: "active",
  };

  const centerDrift = canonical.reportCanonicalDrift(store, center.program.id, { programOwnership, scheduleLib });
  assert.equal(centerDrift.ok, true, JSON.stringify(centerDrift.drift, null, 2));
  assert.equal(centerDrift.counts.classrooms, 2);
  assert.equal(centerDrift.counts.children, 3);
  assert.equal(centerDrift.counts.households, 2);
  assert.ok(centerDrift.counts.staff >= 3);
  pass("center_fixture_drift_clean");

  // Inject drift (report only — do not auto-fix)
  store.familyHouseholds["c-hh-2"].childIds.push("missing-kid");
  store.programData[center.program.id].child.data.Profiles[1].classroomId = "room-does-not-exist";
  const dirty = canonical.reportCanonicalDrift(store, center.program.id, { programOwnership, scheduleLib });
  assert.equal(dirty.ok, false);
  assert.ok(dirty.drift.householdChildMissingFromProfiles.length >= 1);
  assert.ok(dirty.drift.childClassroomMissingFromSchedule.length >= 1);
  assert.ok(Array.isArray(dirty.safeFixesSuggested));
  assert.ok(dirty.safeFixesSuggested.length >= 1);
  // Confirm we did NOT rewrite the store while reporting
  assert.ok(store.familyHouseholds["c-hh-2"].childIds.includes("missing-kid"));
  pass("drift_reports_without_mutating");

  // Lesson → classroom / child relationships on clean HD
  const bundle = canonical.buildCanonicalProgramBundle(store, hd.program.id, { programOwnership, scheduleLib });
  const lesson = (bundle.scheduleItems || []).find((item) => item.type === "lesson_plan");
  assert.ok(lesson);
  assert.equal(lesson.classroomId, "classroom-main");
  assert.ok(lesson.childIds.includes("hd-child-1"));
  pass("lesson_classroom_child_relationships");

  console.log("\nALL CANONICAL FIXTURE PHASE4 CHECKS PASSED");
  console.log(JSON.stringify({
    homes: Object.keys(homes).length,
    hdOk: hdDrift.ok,
    centerOk: centerDrift.ok,
  }));
}

main();
