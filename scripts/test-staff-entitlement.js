#!/usr/bin/env node
/**
 * Unit tests for read-time staff Pro inheritance and the hard 5-seat cap.
 * Run: NODE_ENV=test node scripts/test-staff-entitlement.js
 */
const assert = require("node:assert/strict");
const staffBetaAccess = require("./staff-beta-access.js");
const staffEntitlement = require("../server/staff-entitlement.js");

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`PASS  ${name}`))
    .catch((error) => {
      console.error(`FAIL  ${name}`);
      console.error(error);
      process.exitCode = 1;
    });
}

const owner = {
  email: "tclashley@icloud.com",
  plan: "Pro",
  stripeSubscriptionStatus: "active",
};
const staff = {
  email: "ladiisha01@gmail.com",
  role: "director",
  linkedProgramOwnerEmail: "tclashley@icloud.com",
  programAccessViaOwner: false,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  plan: "Free",
};
const members = [{ email: staff.email, role: "director", status: "active" }];

async function main() {
  await test("allowlist identity correction: Ashley owner only", () => {
    assert.deepEqual([...staffBetaAccess.STAFF_BETA_ALLOWLIST_EMAILS], [
      "tclashley@icloud.com",
      "learnnplay123sc@gmail.com",
    ]);
    assert.equal(staffBetaAccess.canAccessStaffBeta("tclashley@icloud.com"), true);
    assert.equal(staffBetaAccess.canAccessStaffBeta("tashley@icloud.com"), false);
    assert.equal(staffBetaAccess.canAccessStaffBeta("learnnplay123sc@gmail.com"), true);
    assert.equal(staffBetaAccess.canAccessStaffBeta("provider@example.com"), false);
  });

  await test("existing accepted co-director inherits Pro without stored flag or personal Stripe", () => {
    const inherited = staffEntitlement.staffInheritsOwnerProAccess({
      user: staff,
      owner,
      members,
      ownerHasPersonalPro: true,
    });
    assert.equal(inherited, true);
    assert.equal(staff.programAccessViaOwner, false);
    assert.equal(staff.stripeSubscriptionId, null);
  });

  await test("inherited Pro requires owner Pro", () => {
    assert.equal(staffEntitlement.staffInheritsOwnerProAccess({
      user: staff,
      owner,
      members,
      ownerHasPersonalPro: false,
    }), false);
  });

  await test("inherited Pro requires owner beta allowlist", () => {
    assert.equal(staffEntitlement.staffInheritsOwnerProAccess({
      user: staff,
      owner: { email: "provider@example.com" },
      members,
      ownerHasPersonalPro: true,
    }), false);
  });

  await test("removed staff does not inherit", () => {
    assert.equal(staffEntitlement.staffInheritsOwnerProAccess({
      user: staff,
      owner,
      members: [{ email: staff.email, status: "removed" }],
      ownerHasPersonalPro: true,
    }), false);
  });

  await test("standalone paid user is not treated as inherited staff", () => {
    assert.equal(staffEntitlement.isLinkedProgramStaff({
      email: "paid@example.com",
      plan: "Pro",
    }), false);
  });

  await test("seat count includes active + pending only", () => {
    const seats = staffEntitlement.countStaffSeats({
      members: [
        { email: "a@example.com", status: "active" },
        { email: "b@example.com", status: "removed" },
      ],
      invites: [
        { email: "c@example.com", status: "pending", expiresAt: "2099-01-01T00:00:00.000Z" },
        { email: "d@example.com", status: "revoked", expiresAt: "2099-01-01T00:00:00.000Z" },
        { email: "e@example.com", status: "expired", expiresAt: "2020-01-01T00:00:00.000Z" },
        { email: "f@example.com", status: "pending", expiresAt: "2020-01-01T00:00:00.000Z" },
        { email: "g@example.com", status: "accepted", expiresAt: "2099-01-01T00:00:00.000Z" },
      ],
    });
    assert.equal(seats.activeStaff, 1);
    assert.equal(seats.pendingInvites, 1);
    assert.equal(seats.used, 2);
    assert.equal(seats.canInvite, true);
  });

  await test("5th seat is allowed and 6th is not", () => {
    const membersFour = [1, 2, 3, 4].map((n) => ({ email: `s${n}@example.com`, status: "active" }));
    const four = staffEntitlement.countStaffSeats({ members: membersFour, invites: [] });
    assert.equal(four.canInvite, true);
    const five = staffEntitlement.countStaffSeats({
      members: membersFour,
      invites: [{ email: "p@example.com", status: "pending", expiresAt: "2099-01-01T00:00:00.000Z" }],
    });
    assert.equal(five.used, 5);
    assert.equal(five.canInvite, false);
  });

  await test("concurrent lock serializes owner writes", async () => {
    const seen = [];
    await Promise.all([1, 2, 3].map((n) => staffEntitlement.withOwnerLock("tashley@icloud.com", async () => {
      seen.push(`start${n}`);
      await new Promise((resolve) => setTimeout(resolve, 5));
      seen.push(`end${n}`);
    })));
    assert.equal(seen.length, 6);
    for (let i = 0; i < 3; i += 1) {
      assert.equal(seen[i * 2].startsWith("start"), true);
      assert.equal(seen[i * 2 + 1].startsWith("end"), true);
    }
  });

  if (!process.exitCode) console.log("\nAll staff entitlement unit tests passed.");
}

main();
