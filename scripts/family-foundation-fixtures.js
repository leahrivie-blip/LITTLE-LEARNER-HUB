/**
 * Phase 8 resettable fake fixtures: households, guardians/contacts, access
 * levels, invitations, and testing-only fake accounts.
 * Emails use @example.invalid. No real family data. No reusable plaintext
 * passwords stored — password hashes are set empty until an admin issues one.
 */

const foundation = require("./foundation-data-model.js");
const entitlements = require("./entitlement-model.js");
const orgPermissions = require("./org-permissions.js");
const formsFixtures = require("./forms-center-preview-fixtures.js");
const phase6 = require("./form-responses-fixtures.js");
const model = require("./family-foundation-data-model.js");

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

function ensureStaff(store, organizationId, { displayName, email, role }) {
  const existing = listValues(store.staffMemberships).find((row) => (
    row.organizationId === organizationId && String(row.userEmail || "").toLowerCase() === String(email || "").toLowerCase()
  ));
  if (existing) return existing;
  const member = foundation.createStaffMembershipRecord({
    organizationId,
    userEmail: email,
    displayName,
    role,
    status: foundation.STAFF_STATUS.ACTIVE,
  });
  store.staffMemberships[member.id] = member;
  return member;
}

function ensureChild(store, organizationId, displayName) {
  const existing = listValues(store.childRecords).find((row) => (
    row.organizationId === organizationId && row.displayName === displayName
  ));
  if (existing) return existing;
  const child = foundation.createChildRecord({ organizationId, displayName });
  store.childRecords[child.id] = child;
  return child;
}

function ensureClassroom(store, organizationId, name) {
  const existing = listValues(store.classrooms).find((row) => row.organizationId === organizationId && row.name === name);
  if (existing) return existing;
  const classroom = foundation.createClassroomRecord({ organizationId, name, capacity: 12 });
  store.classrooms[classroom.id] = classroom;
  return classroom;
}

function addAudit(store, organizationId, action, message, entityType, entityId, actorEmail = "phase8.fixtures@example.invalid") {
  const audit = model.createFamilyAuditRecord({
    organizationId,
    action,
    actorEmail,
    actorRole: "system_fixture",
    message,
    entityType,
    entityId,
  });
  store.familyFoundation.audit[audit.id] = audit;
  return audit;
}

function createContactWithAccess(store, {
  organizationId,
  householdId,
  displayName,
  email,
  phone = "",
  childId,
  accessLevel,
  relationshipLabel = "parent",
  isEmergencyContact = false,
  isAuthorizedPickup = false,
  isFinanciallyResponsible = false,
  isLegalGuardianAsEntered = false,
  verificationStatus = "verified",
  actorEmail = "",
}) {
  const contact = model.createContactRecord({
    organizationId,
    displayName,
    email,
    phone,
    relationshipDefault: relationshipLabel,
    createdByEmail: actorEmail,
  });
  store.familyFoundation.contacts[contact.id] = contact;

  const membership = model.createHouseholdMembershipRecord({
    organizationId,
    householdId,
    contactId: contact.id,
  });
  store.familyFoundation.householdMemberships[membership.id] = membership;

  const rule = model.createAccessRuleRecord({
    organizationId,
    contactId: contact.id,
    childId,
    householdId,
    accessLevel,
    relationshipLabel,
    isEmergencyContact,
    isAuthorizedPickup,
    isFinanciallyResponsible,
    isLegalGuardianAsEntered,
    verificationStatus,
    createdByEmail: actorEmail,
  });
  store.familyFoundation.accessRules[rule.id] = rule;
  model.syncFoundationGuardian(store, contact, rule);
  store.familyFoundation.contacts[contact.id] = contact;
  return { contact, rule, membership };
}

function ensureFakeAccount(store, {
  organizationId,
  kind,
  email,
  displayName,
  role = "",
  planKey = "",
  contactId = "",
  staffMembershipId = "",
}) {
  const existing = listValues(store.familyFoundation.fakeAccounts).find((row) => (
    row.organizationId === organizationId && row.kind === kind
  ));
  if (existing) return existing;
  const account = model.createFakeAccountRecord({
    organizationId,
    kind,
    email,
    displayName,
    role,
    planKey,
    contactId,
    staffMembershipId,
    passwordHash: "", // issued later via secure admin action — never hardcoded
    label: "Testing Account — Fake Data Only.",
  });
  store.familyFoundation.fakeAccounts[account.id] = account;
  return account;
}

function ensurePlanOrg(store, {
  organizationId,
  name,
  ownerEmail,
  planKey,
}) {
  let org = store.organizations?.[organizationId];
  if (!org) {
    org = foundation.createOrganizationRecord({
      accountType: foundation.ACCOUNT_TYPES.CENTER,
      ownerEmail,
      name,
    });
    org.id = organizationId;
    org.preview = true;
    org.previewLabel = "Testing Account — Fake Data Only.";
    store.organizations[org.id] = org;
  }
  const existingEnt = listValues(store.organizationEntitlements).find((row) => row.organizationId === org.id);
  if (!existingEnt) {
    const entitlement = entitlements.createOrganizationEntitlementRecord({
      organizationId: org.id,
      basePlanKey: planKey,
    });
    entitlement.preview = true;
    entitlement.live = false;
    store.organizationEntitlements[entitlement.id] = entitlement;
  }
  ensureStaff(store, org.id, {
    displayName: `${name} Owner`,
    email: ownerEmail,
    role: orgPermissions.ORG_ROLES.DIRECTOR_OWNER,
  });
  return org;
}

/**
 * Seeds the Phase 8 preview for one primary organization, then additional
 * plan-simulation orgs for Home Daycare / Small / Growing / Large / Founding /
 * Curriculum Only fake accounts.
 */
function ensurePhase8Preview(store, { adminEmail = "phase8.owner@example.invalid", organizationId = "" } = {}) {
  foundation.ensureFoundationStore(store);
  foundation.ensurePhase3Store(store);
  model.ensureFamilyFoundationStore(store);

  // Reuse Phase 6 children/guardians/forms so form connections stay intact.
  const phase6Result = phase6.ensurePhase6Preview(store, { adminEmail, organizationId });
  const org = formsFixtures.ensurePreviewOrganization(store, { adminEmail, organizationId: organizationId || phase6Result.organizationId });
  const orgId = org.id;
  const actorEmail = String(adminEmail || org.ownerEmail || "").toLowerCase();

  if (store.familyFoundation.meta?.phase8SeededFor === orgId) {
    return {
      organizationId: orgId,
      alreadySeeded: true,
      householdCount: listValues(store.familyFoundation.households).filter((row) => row.organizationId === orgId).length,
      contactCount: listValues(store.familyFoundation.contacts).filter((row) => row.organizationId === orgId).length,
      fakeAccountCount: listValues(store.familyFoundation.fakeAccounts).length,
    };
  }

  const classroom = ensureClassroom(store, orgId, "Phase 8 Sunshine Room");
  const ava = ensureChild(store, orgId, "Ava Lin (Fixture)");
  const ben = ensureChild(store, orgId, "Ben Lin (Fixture)");
  const carlos = ensureChild(store, orgId, "Carlos Rivera (Fixture)");
  const dana = ensureChild(store, orgId, "Dana Cole (Fixture)");
  const elena = ensureChild(store, orgId, "Elena Shared (Fixture)"); // child in two households

  [ava, ben, carlos, dana, elena].forEach((child) => {
    const existing = listValues(store.classroomChildAssignments).find((row) => (
      row.organizationId === orgId && row.classroomId === classroom.id && row.childId === child.id
    ));
    if (!existing) {
      const assignment = foundation.createClassroomChildAssignmentRecord({
        organizationId: orgId,
        classroomId: classroom.id,
        childId: child.id,
      });
      store.classroomChildAssignments[assignment.id] = assignment;
    }
  });

  // Staff for fake accounts
  const owner = ensureStaff(store, orgId, {
    displayName: "Phase 8 Owner",
    email: "phase8.owner@example.invalid",
    role: orgPermissions.ORG_ROLES.DIRECTOR_OWNER,
  });
  const director = ensureStaff(store, orgId, {
    displayName: "Phase 8 Director",
    email: "phase8.director@example.invalid",
    role: orgPermissions.ORG_ROLES.DIRECTOR,
  });
  const teacher = ensureStaff(store, orgId, {
    displayName: "Phase 8 Lead Teacher",
    email: "phase8.teacher@example.invalid",
    role: orgPermissions.ORG_ROLES.LEAD_TEACHER,
  });
  const assistantBroad = ensureStaff(store, orgId, {
    displayName: "Phase 8 Assistant Broad",
    email: "phase8.assistant.broad@example.invalid",
    role: orgPermissions.ORG_ROLES.ASSISTANT_STAFF,
  });
  const assistantLimited = ensureStaff(store, orgId, {
    displayName: "Phase 8 Assistant Limited",
    email: "phase8.assistant.limited@example.invalid",
    role: orgPermissions.ORG_ROLES.ASSISTANT_STAFF,
  });

  // Household A — Lin siblings (Ava + Ben) with one full parent
  const hhLin = model.createHouseholdRecord({
    organizationId: orgId,
    displayName: "Lin Household (Fixture)",
    notes: "Siblings Ava and Ben. Testing Account — Fake Data Only.",
    createdByEmail: actorEmail,
  });
  store.familyFoundation.households[hhLin.id] = hhLin;
  [ava, ben].forEach((child) => {
    const link = model.createChildHouseholdLinkRecord({ organizationId: orgId, householdId: hhLin.id, childId: child.id });
    store.familyFoundation.childHouseholdLinks[link.id] = link;
  });
  const { contact: priya } = createContactWithAccess(store, {
    organizationId: orgId,
    householdId: hhLin.id,
    displayName: "Priya Lin (Fixture Guardian)",
    email: "priya.lin@example.invalid",
    phone: "(555) 010-8001",
    childId: ava.id,
    accessLevel: model.ACCESS_LEVELS.FULL_VERIFIED_GUARDIAN,
    isEmergencyContact: true,
    isAuthorizedPickup: true,
    isFinanciallyResponsible: true,
    isLegalGuardianAsEntered: true,
    actorEmail,
  });
  // Same guardian, second child (different permissions possible — full for Ben too)
  const priyaBen = model.createAccessRuleRecord({
    organizationId: orgId,
    contactId: priya.id,
    childId: ben.id,
    householdId: hhLin.id,
    accessLevel: model.ACCESS_LEVELS.FULL_VERIFIED_GUARDIAN,
    relationshipLabel: "parent",
    isEmergencyContact: true,
    isAuthorizedPickup: true,
    isFinanciallyResponsible: true,
    isLegalGuardianAsEntered: true,
    verificationStatus: "verified",
    createdByEmail: actorEmail,
  });
  store.familyFoundation.accessRules[priyaBen.id] = priyaBen;
  model.syncFoundationGuardian(store, priya, priyaBen);

  // Household B — Rivera (Carlos) with two guardians
  const hhRivera = model.createHouseholdRecord({
    organizationId: orgId,
    displayName: "Rivera Household (Fixture)",
    createdByEmail: actorEmail,
  });
  store.familyFoundation.households[hhRivera.id] = hhRivera;
  const carlosLink = model.createChildHouseholdLinkRecord({ organizationId: orgId, householdId: hhRivera.id, childId: carlos.id });
  store.familyFoundation.childHouseholdLinks[carlosLink.id] = carlosLink;
  const { contact: diego } = createContactWithAccess(store, {
    organizationId: orgId, householdId: hhRivera.id, displayName: "Diego Rivera (Fixture Guardian)",
    email: "diego.rivera@example.invalid", childId: carlos.id,
    accessLevel: model.ACCESS_LEVELS.FULL_VERIFIED_GUARDIAN,
    isEmergencyContact: true, isAuthorizedPickup: true, isFinanciallyResponsible: true, isLegalGuardianAsEntered: true, actorEmail,
  });
  const { contact: elenaG } = createContactWithAccess(store, {
    organizationId: orgId, householdId: hhRivera.id, displayName: "Elena Rivera (Fixture Guardian)",
    email: "elena.rivera@example.invalid", childId: carlos.id,
    accessLevel: model.ACCESS_LEVELS.LIMITED_GUARDIAN,
    isEmergencyContact: true, isAuthorizedPickup: true, isFinanciallyResponsible: false, isLegalGuardianAsEntered: true, actorEmail,
  });

  // Household C — Cole with full parent + restricted + pickup-only + emergency-only
  const hhCole = model.createHouseholdRecord({
    organizationId: orgId,
    displayName: "Cole Household (Fixture)",
    createdByEmail: actorEmail,
  });
  store.familyFoundation.households[hhCole.id] = hhCole;
  const danaLink = model.createChildHouseholdLinkRecord({ organizationId: orgId, householdId: hhCole.id, childId: dana.id });
  store.familyFoundation.childHouseholdLinks[danaLink.id] = danaLink;
  const { contact: frank } = createContactWithAccess(store, {
    organizationId: orgId, householdId: hhCole.id, displayName: "Frank Cole (Fixture Guardian)",
    email: "frank.cole@example.invalid", childId: dana.id,
    accessLevel: model.ACCESS_LEVELS.FULL_VERIFIED_GUARDIAN,
    isEmergencyContact: true, isAuthorizedPickup: true, isFinanciallyResponsible: true, isLegalGuardianAsEntered: true, actorEmail,
  });
  const { contact: grace } = createContactWithAccess(store, {
    organizationId: orgId, householdId: hhCole.id, displayName: "Grace Cole (Restricted Fixture)",
    email: "grace.cole.restricted@example.invalid", childId: dana.id,
    accessLevel: model.ACCESS_LEVELS.NO_DIGITAL_ACCESS,
    relationshipLabel: "restricted_no_contact",
    verificationStatus: "unverified",
    isEmergencyContact: false, isAuthorizedPickup: false, actorEmail,
  });
  const { contact: pickupOnly } = createContactWithAccess(store, {
    organizationId: orgId, householdId: hhCole.id, displayName: "Pat Pickup (Fixture)",
    email: "pat.pickup@example.invalid", childId: dana.id,
    accessLevel: model.ACCESS_LEVELS.PICKUP_ONLY,
    relationshipLabel: "authorized_pickup",
    isAuthorizedPickup: true, verificationStatus: "verified", actorEmail,
  });
  const { contact: emergencyOnly } = createContactWithAccess(store, {
    organizationId: orgId, householdId: hhCole.id, displayName: "Em Emergency (Fixture)",
    email: "em.emergency@example.invalid", childId: dana.id,
    accessLevel: model.ACCESS_LEVELS.EMERGENCY_CONTACT_ONLY,
    relationshipLabel: "emergency_contact",
    isEmergencyContact: true, verificationStatus: "verified", actorEmail,
  });

  // Shared-custody: Elena Shared child in Lin household AND a second household
  const hhShared = model.createHouseholdRecord({
    organizationId: orgId,
    displayName: "Shared Custody Household (Fixture)",
    notes: "Second household for Elena Shared — demonstrates a child connected to multiple households.",
    createdByEmail: actorEmail,
  });
  store.familyFoundation.households[hhShared.id] = hhShared;
  const elenaLinLink = model.createChildHouseholdLinkRecord({
    organizationId: orgId, householdId: hhLin.id, childId: elena.id, sharedCustodyNote: "Weekdays with Lin household (provider-entered note; not a legal determination).",
  });
  store.familyFoundation.childHouseholdLinks[elenaLinLink.id] = elenaLinLink;
  const elenaSharedLink = model.createChildHouseholdLinkRecord({
    organizationId: orgId, householdId: hhShared.id, childId: elena.id, sharedCustodyNote: "Weekends with Shared household (provider-entered note).",
  });
  store.familyFoundation.childHouseholdLinks[elenaSharedLink.id] = elenaSharedLink;
  // Priya also has limited access to Elena Shared (multi-child parent)
  const priyaElena = model.createAccessRuleRecord({
    organizationId: orgId, contactId: priya.id, childId: elena.id, householdId: hhLin.id,
    accessLevel: model.ACCESS_LEVELS.FORMS_ONLY, relationshipLabel: "parent",
    isEmergencyContact: true, isAuthorizedPickup: true, verificationStatus: "verified", createdByEmail: actorEmail,
  });
  store.familyFoundation.accessRules[priyaElena.id] = priyaElena;
  model.syncFoundationGuardian(store, priya, priyaElena);
  const { contact: sharedGuardian } = createContactWithAccess(store, {
    organizationId: orgId, householdId: hhShared.id, displayName: "Sam Shared (Fixture Guardian)",
    email: "sam.shared@example.invalid", childId: elena.id,
    accessLevel: model.ACCESS_LEVELS.FULL_VERIFIED_GUARDIAN,
    isEmergencyContact: true, isAuthorizedPickup: true, isFinanciallyResponsible: true, isLegalGuardianAsEntered: true, actorEmail,
  });

  // Suspended access example on a forms-only contact for Carlos
  const { contact: suspended } = createContactWithAccess(store, {
    organizationId: orgId, householdId: hhRivera.id, displayName: "Sue Suspended (Fixture)",
    email: "sue.suspended@example.invalid", childId: carlos.id,
    accessLevel: model.ACCESS_LEVELS.FORMS_ONLY, verificationStatus: "verified", actorEmail,
  });
  const suspendedRule = listValues(store.familyFoundation.accessRules).find((row) => row.contactId === suspended.id && row.childId === carlos.id);
  if (suspendedRule) model.suspendAccessRule(suspendedRule, { reason: "Fixture: temporarily suspended for testing.", actorEmail });

  // Fake accounts for primary org (password hashes empty until issued)
  ensureFakeAccount(store, { organizationId: orgId, kind: model.FAKE_ACCOUNT_KINDS.OWNER, email: "phase8.owner@example.invalid", displayName: "Phase 8 Owner", role: orgPermissions.ORG_ROLES.DIRECTOR_OWNER, staffMembershipId: owner.id, planKey: entitlements.PLAN_KEYS.SMALL_CENTER });
  ensureFakeAccount(store, { organizationId: orgId, kind: model.FAKE_ACCOUNT_KINDS.DIRECTOR, email: "phase8.director@example.invalid", displayName: "Phase 8 Director", role: orgPermissions.ORG_ROLES.DIRECTOR, staffMembershipId: director.id });
  ensureFakeAccount(store, { organizationId: orgId, kind: model.FAKE_ACCOUNT_KINDS.LEAD_TEACHER, email: "phase8.teacher@example.invalid", displayName: "Phase 8 Lead Teacher", role: orgPermissions.ORG_ROLES.LEAD_TEACHER, staffMembershipId: teacher.id });
  ensureFakeAccount(store, { organizationId: orgId, kind: model.FAKE_ACCOUNT_KINDS.ASSISTANT_BROAD, email: "phase8.assistant.broad@example.invalid", displayName: "Phase 8 Assistant Broad", role: orgPermissions.ORG_ROLES.ASSISTANT_STAFF, staffMembershipId: assistantBroad.id });
  ensureFakeAccount(store, { organizationId: orgId, kind: model.FAKE_ACCOUNT_KINDS.ASSISTANT_LIMITED, email: "phase8.assistant.limited@example.invalid", displayName: "Phase 8 Assistant Limited", role: orgPermissions.ORG_ROLES.ASSISTANT_STAFF, staffMembershipId: assistantLimited.id });
  ensureFakeAccount(store, { organizationId: orgId, kind: model.FAKE_ACCOUNT_KINDS.PARENT_ONE_CHILD, email: "frank.cole@example.invalid", displayName: "Frank Cole (Fixture Guardian)", role: orgPermissions.ORG_ROLES.PARENT_GUARDIAN, contactId: frank.id });
  ensureFakeAccount(store, { organizationId: orgId, kind: model.FAKE_ACCOUNT_KINDS.PARENT_MULTI_CHILD, email: "priya.lin@example.invalid", displayName: "Priya Lin (Fixture Guardian)", role: orgPermissions.ORG_ROLES.PARENT_GUARDIAN, contactId: priya.id });
  ensureFakeAccount(store, { organizationId: orgId, kind: model.FAKE_ACCOUNT_KINDS.GUARDIAN_SHARED_HOUSEHOLDS, email: "sam.shared@example.invalid", displayName: "Sam Shared (Fixture Guardian)", role: orgPermissions.ORG_ROLES.PARENT_GUARDIAN, contactId: sharedGuardian.id });
  ensureFakeAccount(store, { organizationId: orgId, kind: model.FAKE_ACCOUNT_KINDS.RESTRICTED_GUARDIAN, email: "grace.cole.restricted@example.invalid", displayName: "Grace Cole (Restricted Fixture)", role: orgPermissions.ORG_ROLES.PARENT_GUARDIAN, contactId: grace.id });
  ensureFakeAccount(store, { organizationId: orgId, kind: model.FAKE_ACCOUNT_KINDS.PICKUP_ONLY, email: "pat.pickup@example.invalid", displayName: "Pat Pickup (Fixture)", role: orgPermissions.ORG_ROLES.PARENT_GUARDIAN, contactId: pickupOnly.id });

  // Plan-simulation orgs (separate organizations — resettable without affecting primary)
  const planOrgs = [
    { id: "org_phase8_curriculum_only", name: "Phase 8 Curriculum Only Org", email: "phase8.curriculum@example.invalid", plan: entitlements.PLAN_KEYS.CURRICULUM_ONLY, kind: model.FAKE_ACCOUNT_KINDS.CURRICULUM_ONLY },
    { id: "org_phase8_home_daycare", name: "Phase 8 Home Daycare Org", email: "phase8.homedaycare@example.invalid", plan: entitlements.PLAN_KEYS.HOME_DAYCARE, kind: model.FAKE_ACCOUNT_KINDS.HOME_DAYCARE },
    { id: "org_phase8_small_center", name: "Phase 8 Small Center Org", email: "phase8.smallcenter@example.invalid", plan: entitlements.PLAN_KEYS.SMALL_CENTER, kind: model.FAKE_ACCOUNT_KINDS.SMALL_CENTER },
    { id: "org_phase8_growing_center", name: "Phase 8 Growing Center Org", email: "phase8.growingcenter@example.invalid", plan: entitlements.PLAN_KEYS.GROWING_CENTER, kind: model.FAKE_ACCOUNT_KINDS.GROWING_CENTER },
    { id: "org_phase8_large_center", name: "Phase 8 Large Center Org", email: "phase8.largecenter@example.invalid", plan: entitlements.PLAN_KEYS.LARGE_CENTER, kind: model.FAKE_ACCOUNT_KINDS.LARGE_CENTER },
    { id: "org_phase8_founding", name: "Phase 8 Founding Member Org", email: "phase8.founding@example.invalid", plan: entitlements.PLAN_KEYS.FOUNDING_MEMBER, kind: model.FAKE_ACCOUNT_KINDS.FOUNDING_MEMBER },
  ];
  planOrgs.forEach((entry) => {
    const planOrg = ensurePlanOrg(store, {
      organizationId: entry.id,
      name: entry.name,
      ownerEmail: entry.email,
      planKey: entry.plan,
    });
    const staff = listValues(store.staffMemberships).find((row) => row.organizationId === planOrg.id && row.role === orgPermissions.ORG_ROLES.DIRECTOR_OWNER);
    ensureFakeAccount(store, {
      organizationId: planOrg.id,
      kind: entry.kind,
      email: entry.email,
      displayName: entry.name,
      role: orgPermissions.ORG_ROLES.DIRECTOR_OWNER,
      planKey: entry.plan,
      staffMembershipId: staff?.id || "",
    });
  });

  addAudit(store, orgId, "seed_phase8", "Phase 8 family/guardian/household fixtures seeded. Testing Account — Fake Data Only.", "organization", orgId, actorEmail);

  store.familyFoundation.meta.phase8SeededFor = orgId;
  store.familyFoundation.meta.updatedAt = model.nowIso();

  return {
    organizationId: orgId,
    alreadySeeded: false,
    householdIds: [hhLin.id, hhRivera.id, hhCole.id, hhShared.id],
    contactIds: {
      priya: priya.id,
      diego: diego.id,
      elena: elenaG.id,
      frank: frank.id,
      grace: grace.id,
      pickupOnly: pickupOnly.id,
      emergencyOnly: emergencyOnly.id,
      sharedGuardian: sharedGuardian.id,
      suspended: suspended.id,
    },
    childIds: { ava: ava.id, ben: ben.id, carlos: carlos.id, dana: dana.id, elena: elena.id },
    fakeAccountCount: listValues(store.familyFoundation.fakeAccounts).length,
  };
}

function resetPhase8Preview(store, { organizationId = "" } = {}) {
  model.ensureFamilyFoundationStore(store);
  if (!organizationId) {
    store.familyFoundation = {};
    model.ensureFamilyFoundationStore(store);
    return { reset: true, scope: "all" };
  }
  const ff = store.familyFoundation;
  ["households", "contacts", "householdMemberships", "childHouseholdLinks", "accessRules", "invitations", "fakeAccounts", "audit", "mergeReviews"].forEach((key) => {
    Object.keys(ff[key] || {}).forEach((id) => {
      if (ff[key][id]?.organizationId === organizationId) delete ff[key][id];
    });
  });
  if (ff.meta?.phase8SeededFor === organizationId) delete ff.meta.phase8SeededFor;
  return { reset: true, scope: organizationId };
}

module.exports = {
  ensurePhase8Preview,
  resetPhase8Preview,
  ensureFakeAccount,
};
