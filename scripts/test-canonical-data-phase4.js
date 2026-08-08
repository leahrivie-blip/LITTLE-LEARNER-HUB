#!/usr/bin/env node
/**
 * Phase 4 — canonical data adapter tests (no production, no network writes).
 * Run: node scripts/test-canonical-data-phase4.js
 */
"use strict";

const assert = require("node:assert/strict");
const canonical = require("../server/canonical-data.js");
const programOwnership = require("../server/program-ownership.js");
const scheduleLib = require("../server/schedule-lib.js");

function pass(id) {
  console.log(`PASS  ${id}`);
}

function main() {
  const store = { users: {}, programs: {}, programData: {}, familyHouseholds: {}, childData: {}, scheduleByUser: {} };
  const ownerEmail = "canon.owner@example.invalid";
  const program = programOwnership.ensureProgramForOwner(store, ownerEmail, { name: "Canon Program" });
  store.users[ownerEmail] = { email: ownerEmail, role: "owner", programId: program.id, accountType: "home_daycare" };
  store.users["teacher@example.invalid"] = {
    email: "teacher@example.invalid",
    role: "teacher",
    programId: program.id,
    linkedProgramOwnerEmail: ownerEmail,
    classroomIds: ["classroom-1"],
  };

  const ctx = programOwnership.resolveProgramContext(store, { email: ownerEmail, uid: "u1" });
  programOwnership.writeProgramChildData(store, ctx, {
    ...programOwnership.emptyChildPayload(),
    Profiles: [
      { id: "child-1", name: "Maya", classroomId: "classroom-1" },
      { id: "child-2", name: "Noah", classroomId: "classroom-2" },
    ],
    Meals: [{ id: "m1", childId: "child-1", date: "2026-08-08" }],
  }, { mergeScoped: false });

  store.programData[program.id].schedule = scheduleLib.normalizeScheduleDocument({
    classrooms: [
      { id: "classroom-1", name: "Toddlers" },
      { id: "classroom-2", name: "Preschool" },
    ],
    items: [],
  });

  store.familyHouseholds["hh-1"] = {
    id: "hh-1",
    ownerEmail,
    programId: program.id,
    label: "Maya Family",
    email: "parent@example.invalid",
    childIds: ["child-1", "missing-child"],
    status: "invited",
  };

  const canonProgram = canonical.getCanonicalProgram(store, program.id);
  assert.equal(canonProgram.ownerEmail, ownerEmail);
  pass("canonical_program");

  const kids = canonical.getCanonicalChildren(store, program.id, programOwnership);
  assert.equal(kids.children.length, 2);
  assert.ok(kids.children.some((c) => c.id === "child-1"));
  pass("canonical_children");

  const rooms = canonical.getCanonicalClassrooms(store, program.id, scheduleLib);
  assert.equal(rooms.classrooms.length, 2);
  pass("canonical_classrooms");

  const staff = canonical.getCanonicalStaff(store, program.id);
  assert.ok(staff.staff.length >= 2);
  pass("canonical_staff");

  const households = canonical.getCanonicalHouseholds(store, program.id, { programOwnership });
  assert.equal(households.households.length, 1);
  assert.ok(households.households[0].childNames.includes("Maya"));
  pass("canonical_households");

  const drift = canonical.reportCanonicalDrift(store, program.id, { programOwnership, scheduleLib });
  assert.equal(drift.ok, false);
  assert.equal(drift.drift.householdChildMissingFromProfiles.length, 1);
  assert.equal(drift.drift.householdChildMissingFromProfiles[0].childId, "missing-child");
  pass("drift_detects_missing_household_child");

  // Fix drift and re-check
  store.familyHouseholds["hh-1"].childIds = ["child-1"];
  const drift2 = canonical.reportCanonicalDrift(store, program.id, { programOwnership, scheduleLib });
  assert.equal(drift2.ok, true);
  pass("drift_clean_when_aligned");

  const bundle = canonical.buildCanonicalProgramBundle(store, program.id, { programOwnership, scheduleLib });
  assert.equal(bundle.program.id, program.id);
  assert.equal(bundle.children.length, 2);
  assert.equal(bundle.drift.ok, true);
  pass("canonical_program_bundle");

  // childIds-only household (no children snapshot) still resolves from Profiles
  store.familyHouseholds["hh-2"] = {
    id: "hh-2",
    ownerEmail,
    programId: program.id,
    label: "Noah Family",
    childIds: ["child-2"],
    children: [],
  };
  const hh2 = canonical.getCanonicalHouseholds(store, program.id, { programOwnership });
  const noah = hh2.households.find((h) => h.id === "hh-2");
  assert.ok(noah);
  assert.deepEqual(noah.childIds, ["child-2"]);
  assert.ok(noah.childNames.includes("Noah"));
  pass("household_childIds_prefer_profiles");

  console.log("\nALL CANONICAL DATA PHASE4 CHECKS PASSED");
}

main();
