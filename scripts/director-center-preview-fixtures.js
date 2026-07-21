/**
 * Fake Director Center preview fixtures only.
 * Never touches production users, child records, or Stripe.
 */
const foundation = require("./foundation-data-model.js");
const entitlements = require("./entitlement-model.js");
const orgPermissions = require("./org-permissions.js");

const PREVIEW_MARKER = "Admin Preview — Test Data Only";

function seedPreviewSuite(store, {
  adminEmail = "admin@preview.local",
  scenario = "small_center",
} = {}) {
  foundation.ensureFoundationStore(store);
  store.directorCenterPreview = store.directorCenterPreview && typeof store.directorCenterPreview === "object"
    ? store.directorCenterPreview
    : { seededAt: "", scenario: "", label: PREVIEW_MARKER, emailSent: false, stripeTouched: false };

  const email = String(adminEmail || "").trim().toLowerCase() || "admin@preview.local";
  const configs = {
    home_daycare: {
      planKey: entitlements.PLAN_KEYS.HOME_DAYCARE,
      accountType: foundation.ACCOUNT_TYPES.HOME_DAYCARE,
      programType: foundation.PROGRAM_TYPES.HOME_DAYCARE,
      name: "Sunny Corner Home Daycare (Preview)",
      classrooms: [{ name: "Main Room", age: "Mixed", capacity: 8, color: "#8b6be8" }],
      staffExtra: 1,
      children: 4,
      unassignedChildren: 1,
    },
    small_center: {
      planKey: entitlements.PLAN_KEYS.SMALL_CENTER,
      accountType: foundation.ACCOUNT_TYPES.CENTER,
      programType: foundation.PROGRAM_TYPES.CHILDCARE_CENTER,
      name: "Little Oak Small Center (Preview)",
      classrooms: [
        { name: "Infants", age: "Infant", capacity: 8, color: "#8b6be8" },
        { name: "Toddlers", age: "Toddler", capacity: 12, color: "#5b9bd5" },
        { name: "Preschool", age: "Preschool", capacity: 16, color: "#7055d1" },
        { name: "Archive Demo", age: "Mixed", capacity: 10, color: "#536280", archived: true },
      ],
      staffExtra: 5,
      children: 10,
      unassignedChildren: 2,
    },
    growing_center: {
      planKey: entitlements.PLAN_KEYS.GROWING_CENTER,
      accountType: foundation.ACCOUNT_TYPES.CENTER,
      programType: foundation.PROGRAM_TYPES.CHILDCARE_CENTER,
      name: "Riverbend Growing Center (Preview)",
      classrooms: Array.from({ length: 6 }, (_, i) => ({
        name: `Room ${i + 1}`,
        age: ["Infant", "Toddler", "Preschool"][i % 3],
        capacity: 12,
        color: ["#8b6be8", "#5b9bd5", "#7055d1"][i % 3],
      })),
      staffExtra: 8,
      children: 14,
      unassignedChildren: 3,
    },
    large_center: {
      planKey: entitlements.PLAN_KEYS.LARGE_CENTER,
      accountType: foundation.ACCOUNT_TYPES.CENTER,
      programType: foundation.PROGRAM_TYPES.CHILDCARE_CENTER,
      name: "Meadowlane Large Center (Preview)",
      classrooms: Array.from({ length: 10 }, (_, i) => ({
        name: `Classroom ${i + 1}`,
        age: ["Infant", "Toddler", "Preschool", "Mixed"][i % 4],
        capacity: 14,
        color: ["#8b6be8", "#5b9bd5", "#7055d1", "#3a7abf"][i % 4],
      })),
      staffExtra: 12,
      children: 20,
      unassignedChildren: 4,
    },
    at_limit: {
      planKey: entitlements.PLAN_KEYS.HOME_DAYCARE,
      accountType: foundation.ACCOUNT_TYPES.HOME_DAYCARE,
      programType: foundation.PROGRAM_TYPES.HOME_DAYCARE,
      name: "Limit Test Home Daycare (Preview)",
      classrooms: [{ name: "Only Room", age: "Mixed", capacity: 6, color: "#8b6be8" }],
      staffExtra: 1,
      children: 3,
      unassignedChildren: 0,
      atLimit: true,
    },
  };

  const config = configs[scenario] || configs.small_center;

  // Clear previous preview org for this admin email only (fake data).
  const existing = Object.values(store.organizations || {}).filter((org) => (
    org && String(org.ownerEmail || "").toLowerCase() === email && org.preview === true
  ));
  existing.forEach((org) => {
    delete store.organizations[org.id];
    Object.keys(store.programProfiles || {}).forEach((id) => {
      if (store.programProfiles[id]?.organizationId === org.id) delete store.programProfiles[id];
    });
    ["classrooms", "staffMemberships", "classroomStaffAssignments", "childRecords", "classroomChildAssignments", "organizationEntitlements"]
      .forEach((key) => {
        Object.keys(store[key] || {}).forEach((id) => {
          if (store[key][id]?.organizationId === org.id) delete store[key][id];
        });
      });
  });

  const org = foundation.createOrganizationRecord({
    accountType: config.accountType,
    ownerEmail: email,
    name: config.name,
  });
  org.preview = true;
  org.previewLabel = PREVIEW_MARKER;
  store.organizations[org.id] = org;

  const profile = foundation.createProgramProfileRecord({
    organizationId: org.id,
    programName: config.name,
    logoUrl: "",
    directorOwnerName: "Leah Preview Director",
    address: "123 Preview Lane, Test City, TS 00000",
    phone: "(555) 010-2000",
    email,
    licenseNumber: "PREVIEW-LIC-001",
    website: "https://preview.littlelearnerhub.example",
    programType: config.programType,
    classroomCount: config.classrooms.filter((c) => !c.archived).length,
  });
  store.programProfiles[profile.id] = profile;

  const entitlement = entitlements.createOrganizationEntitlementRecord({
    organizationId: org.id,
    basePlanKey: config.planKey,
    billingInterval: entitlements.BILLING_INTERVALS.MONTHLY,
    classroomAddOnQuantity: 0,
  });
  entitlement.preview = true;
  entitlement.live = false;
  store.organizationEntitlements[entitlement.id] = entitlement;

  const owner = foundation.createStaffMembershipRecord({
    organizationId: org.id,
    userId: `admin:${email}`,
    userEmail: email,
    displayName: "Preview Owner",
    role: orgPermissions.ORG_ROLES.DIRECTOR_OWNER,
    status: foundation.STAFF_STATUS.ACTIVE,
    lastActiveAt: new Date().toISOString(),
  });
  owner.preview = true;
  owner.isBillingOwner = true;
  store.staffMemberships[owner.id] = owner;

  const classroomIds = [];
  config.classrooms.forEach((spec, index) => {
    const room = foundation.createClassroomRecord({
      organizationId: org.id,
      name: spec.name,
      ageGroupDefault: spec.age,
      description: `${spec.name} preview classroom`,
      color: spec.color,
      capacity: spec.capacity,
      createdByUserId: owner.userId,
      status: spec.archived ? foundation.ASSIGNMENT_STATUS.ARCHIVED : foundation.ASSIGNMENT_STATUS.ACTIVE,
    });
    if (spec.archived) room.archivedAt = new Date().toISOString();
    room.preview = true;
    room.currentCurriculum = {
      weekLabel: `Week of Preview ${index + 1}`,
      lessonPlanTitle: ["Ocean Friends", "Apple Orchard", "Building Builders", "Garden Helpers"][index % 4],
      lessonPlanId: `preview-lesson-${index + 1}`,
    };
    room.recentActivity = [
      { type: "daily_report", label: "Daily report completed", at: new Date().toISOString() },
      { type: "observation", label: "Observation added", at: new Date().toISOString() },
    ];
    store.classrooms[room.id] = room;
    classroomIds.push(room.id);
  });

  const activeClassroomIds = classroomIds.filter((id) => store.classrooms[id].status === foundation.ASSIGNMENT_STATUS.ACTIVE);
  const roles = [
    orgPermissions.ORG_ROLES.LEAD_TEACHER,
    orgPermissions.ORG_ROLES.LEAD_TEACHER,
    orgPermissions.ORG_ROLES.ASSISTANT_STAFF,
    orgPermissions.ORG_ROLES.ASSISTANT_STAFF,
    orgPermissions.ORG_ROLES.DIRECTOR,
  ];
  const staffIds = [];
  for (let i = 0; i < config.staffExtra; i += 1) {
    const role = roles[i % roles.length];
    const status = i === config.staffExtra - 1 && config.staffExtra > 2
      ? foundation.STAFF_STATUS.INVITATION_PENDING
      : (i === 0 && config.staffExtra > 3 ? foundation.STAFF_STATUS.DEACTIVATED : foundation.STAFF_STATUS.ACTIVE);
    const member = foundation.createStaffMembershipRecord({
      organizationId: org.id,
      userId: status === foundation.STAFF_STATUS.INVITATION_PENDING ? "" : `preview-staff-${i + 1}`,
      userEmail: `preview.staff${i + 1}@example.test`,
      displayName: `Preview Staff ${i + 1}`,
      role,
      status,
      invitedByUserId: owner.userId,
      invitationExpiresAt: status === foundation.STAFF_STATUS.INVITATION_PENDING
        ? new Date(Date.now() + 7 * 86400000).toISOString()
        : "",
      deactivatedAt: status === foundation.STAFF_STATUS.DEACTIVATED ? new Date().toISOString() : "",
      deactivationReason: status === foundation.STAFF_STATUS.DEACTIVATED ? "Preview deactivation demo" : "",
      lastActiveAt: status === foundation.STAFF_STATUS.ACTIVE ? new Date().toISOString() : "",
    });
    member.preview = true;
    member.isBillingOwner = false;
    store.staffMemberships[member.id] = member;
    staffIds.push(member.id);

    if (status === foundation.STAFF_STATUS.ACTIVE && activeClassroomIds.length) {
      const roomId = activeClassroomIds[i % activeClassroomIds.length];
      const assignment = foundation.createClassroomStaffAssignmentRecord({
        organizationId: org.id,
        classroomId: roomId,
        staffMembershipId: member.id,
        userId: member.userId,
      });
      assignment.preview = true;
      store.classroomStaffAssignments[assignment.id] = assignment;
      // Give first lead teacher a second classroom when available.
      if (i === 0 && activeClassroomIds.length > 1) {
        const second = foundation.createClassroomStaffAssignmentRecord({
          organizationId: org.id,
          classroomId: activeClassroomIds[1],
          staffMembershipId: member.id,
          userId: member.userId,
        });
        second.preview = true;
        store.classroomStaffAssignments[second.id] = second;
      }
    }
  }

  // One active staff intentionally unassigned for overview metrics.
  if (config.staffExtra >= 2) {
    const unassigned = foundation.createStaffMembershipRecord({
      organizationId: org.id,
      userId: "preview-unassigned-staff",
      userEmail: "preview.unassigned@example.test",
      displayName: "Unassigned Preview Aide",
      role: orgPermissions.ORG_ROLES.ASSISTANT_STAFF,
      status: foundation.STAFF_STATUS.ACTIVE,
      invitedByUserId: owner.userId,
      lastActiveAt: new Date().toISOString(),
    });
    unassigned.preview = true;
    store.staffMemberships[unassigned.id] = unassigned;
  }

  const childIds = [];
  for (let i = 0; i < config.children; i += 1) {
    const child = foundation.createChildRecord({
      organizationId: org.id,
      displayName: `Preview Child ${i + 1}`,
      legacyChildId: `preview-child-${i + 1}`,
    });
    child.preview = true;
    child.ageGroup = ["Infant", "Toddler", "Preschool"][i % 3];
    store.childRecords[child.id] = child;
    childIds.push(child.id);
  }

  const assignable = childIds.slice(0, Math.max(0, childIds.length - (config.unassignedChildren || 0)));
  assignable.forEach((childId, index) => {
    const roomId = activeClassroomIds[index % Math.max(1, activeClassroomIds.length)];
    if (!roomId) return;
    // Historical prior assignment for first few children.
    if (index < 2 && activeClassroomIds.length > 1) {
      const priorRoom = activeClassroomIds[(index + 1) % activeClassroomIds.length];
      const historical = foundation.createClassroomChildAssignmentRecord({
        organizationId: org.id,
        classroomId: priorRoom,
        childId,
        status: foundation.ASSIGNMENT_STATUS.HISTORICAL,
        startsAt: new Date(Date.now() - 40 * 86400000).toISOString(),
        endsAt: new Date(Date.now() - 5 * 86400000).toISOString(),
        assignedByUserId: owner.userId,
      });
      historical.preview = true;
      store.classroomChildAssignments[historical.id] = historical;
    }
    const active = foundation.createClassroomChildAssignmentRecord({
      organizationId: org.id,
      classroomId: roomId,
      childId,
      assignedByUserId: owner.userId,
    });
    active.preview = true;
    store.classroomChildAssignments[active.id] = active;
  });

  store.directorCenterPreview = {
    seededAt: new Date().toISOString(),
    scenario,
    label: PREVIEW_MARKER,
    organizationId: org.id,
    emailSent: false,
    stripeTouched: false,
    fakeDataOnly: true,
  };

  return {
    organization: org,
    programProfile: profile,
    entitlement,
    owner,
    classroomIds,
    staffIds,
    childIds,
  };
}

module.exports = {
  PREVIEW_MARKER,
  seedPreviewSuite,
};
