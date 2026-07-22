/**
 * Phase 18 Testing Lab fixtures — orchestrates Phase 1–17 fake scenario packs.
 * Never stores passwords. Uses @example.invalid only.
 */

const model = require("./testing-lab-data-model.js");
const directorFixtures = require("./director-center-preview-fixtures.js");
const familyFixtures = require("./family-foundation-fixtures.js");
const familyModel = require("./family-foundation-data-model.js");
const orgPermissions = require("./org-permissions.js");
const foundation = require("./foundation-data-model.js");
const entitlements = require("./entitlement-model.js");
const todayFixtures = require("./today-hub-fixtures.js");
const staffFixtures = require("./staff-experience-fixtures.js");
const billingFixtures = require("./billing-simulator-fixtures.js");
const licensingFixtures = require("./licensing-center-fixtures.js");
const recordsFixtures = require("./records-center-fixtures.js");
const enrollmentFixtures = require("./enrollment-fixtures.js");
const messagingFixtures = require("./family-messaging-fixtures.js");
const updatesFixtures = require("./family-updates-fixtures.js");
const hubFixtures = require("./family-hub-fixtures.js");

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

function mapScenarioToDirector(scenario) {
  if (scenario === model.SCENARIO_PACKS.CURRICULUM_ONLY) return "home_daycare";
  if (scenario === model.SCENARIO_PACKS.FOUNDING_MEMBER) return "small_center";
  if (scenario === model.SCENARIO_PACKS.LARGE_CENTER) return "large_center";
  if (scenario === model.SCENARIO_PACKS.GROWING_CENTER) return "growing_center";
  if (scenario === model.SCENARIO_PACKS.HOME_DAYCARE) return "home_daycare";
  return "small_center";
}

function ensureExtraFakeAccounts(store, organizationId, adminEmail) {
  const members = listValues(store.staffMemberships).filter((m) => m.organizationId === organizationId);
  const contacts = listValues(store.familyFoundation?.contacts || {}).filter((c) => c.organizationId === organizationId);
  const existingKinds = new Set(listValues(store.familyFoundation?.fakeAccounts || {})
    .filter((a) => a.organizationId === organizationId)
    .map((a) => a.kind));

  function addStaffFake(kind, email, displayName, roleRe, role) {
    if (existingKinds.has(kind)) return;
    const member = members.find((m) => roleRe.test(m.role || "")) || members.find((m) => roleRe.test(m.userEmail || ""));
    if (!member && role) {
      // Create a lightweight membership for preview if missing
      const id = model.newId("stm");
      store.staffMemberships = store.staffMemberships || {};
      store.staffMemberships[id] = {
        id,
        organizationId,
        userEmail: email,
        displayName,
        role,
        status: foundation.STAFF_STATUS.ACTIVE,
        createdAt: model.nowIso(),
        updatedAt: model.nowIso(),
      };
      familyFixtures.ensureFakeAccount(store, {
        organizationId,
        kind,
        email,
        displayName,
        role,
        staffMembershipId: id,
      });
      return;
    }
    if (!member) return;
    familyFixtures.ensureFakeAccount(store, {
      organizationId,
      kind,
      email,
      displayName,
      role: member.role,
      staffMembershipId: member.id,
    });
  }

  addStaffFake("teacher", "phase18.teacher@example.invalid", "Phase 18 Teacher", /teacher/i, orgPermissions.ORG_ROLES.LEAD_TEACHER);
  addStaffFake("substitute", "phase18.substitute@example.invalid", "Phase 18 Substitute", /substitut/i, orgPermissions.ORG_ROLES.ASSISTANT_STAFF);

  // Emergency contact only
  if (!existingKinds.has("emergency_only")) {
    const emergency = contacts.find((c) => /emergency|pat\.pickup/i.test(`${c.email} ${c.displayName}`)) || contacts[contacts.length - 1];
    if (emergency) {
      familyFixtures.ensureFakeAccount(store, {
        organizationId,
        kind: "emergency_only",
        email: "phase18.emergency@example.invalid",
        displayName: "Phase 18 Emergency Contact",
        role: orgPermissions.ORG_ROLES.PARENT_GUARDIAN,
        contactId: emergency.id,
      });
    }
  }

  // Financially responsible (priya already full guardian — alias account)
  if (!existingKinds.has("financial_guardian")) {
    const priya = contacts.find((c) => /priya/i.test(c.email || ""));
    if (priya) {
      familyFixtures.ensureFakeAccount(store, {
        organizationId,
        kind: "financial_guardian",
        email: "phase18.financial@example.invalid",
        displayName: "Phase 18 Financial Guardian",
        role: orgPermissions.ORG_ROLES.PARENT_GUARDIAN,
        contactId: priya.id,
      });
    }
  }

  // Non-financial guardian
  if (!existingKinds.has("non_financial_guardian")) {
    const frank = contacts.find((c) => /frank/i.test(c.email || ""));
    if (frank) {
      familyFixtures.ensureFakeAccount(store, {
        organizationId,
        kind: "non_financial_guardian",
        email: "phase18.nonfinancial@example.invalid",
        displayName: "Phase 18 Non-Financial Guardian",
        role: orgPermissions.ORG_ROLES.PARENT_GUARDIAN,
        contactId: frank.id,
      });
    }
  }

  model.appendAudit(store, {
    organizationId,
    action: "extra_fake_accounts_ensured",
    actorEmail: adminEmail,
    detail: "Ensured Phase 18 extra fake account kinds (no passwords stored)",
  });
}

function ensurePhase18Preview(store, {
  adminEmail = "phase18.admin@example.invalid",
  scenario = model.SCENARIO_PACKS.SMALL_CENTER,
  organizationId = "",
} = {}) {
  model.ensureTestingLabStore(store);
  if (!store.siteContent) store.siteContent = {};
  if (!store.siteContent.featureFlags) store.siteContent.featureFlags = {};
  store.siteContent.featureFlags.directorCenter = true;
  store.siteContent.featureFlags.formsCenter = true;
  store.siteContent.featureFlags.familyHub = true;
  store.siteContent.featureFlags.testingLab = true;

  const directorScenario = mapScenarioToDirector(scenario);
  directorFixtures.seedPreviewSuite(store, { adminEmail, scenario: directorScenario });

  const org = listValues(store.organizations).find((o) => /Preview|Phase/i.test(o.name || ""))
    || listValues(store.organizations)[0];
  const orgId = organizationId || org?.id || "";
  if (!orgId || !model.isFakeOrganizationId(orgId)) {
    throw new Error("Testing Lab refuses non-fake organization targets.");
  }

  familyFixtures.ensurePhase8Preview(store, { adminEmail, organizationId: orgId });
  hubFixtures.ensurePhase9Preview(store, { organizationId: orgId });
  updatesFixtures.ensurePhase10Preview(store, { organizationId: orgId });
  messagingFixtures.ensurePhase11Preview(store, { organizationId: orgId });
  enrollmentFixtures.ensurePhase12Preview(store, { organizationId: orgId });
  recordsFixtures.ensurePhase13Preview(store, { organizationId: orgId });
  licensingFixtures.ensurePhase14Preview(store, { organizationId: orgId });
  todayFixtures.ensurePhase15Preview(store, { organizationId: orgId });
  staffFixtures.ensurePhase16Preview(store, { adminEmail, organizationId: orgId });
  billingFixtures.ensurePhase17Preview(store, { adminEmail, organizationId: orgId });

  ensureExtraFakeAccounts(store, orgId, adminEmail);

  // Plan key for curriculum/founding scenarios
  let planKey = entitlements.PLAN_KEYS.SMALL_CENTER;
  if (scenario === model.SCENARIO_PACKS.HOME_DAYCARE) planKey = entitlements.PLAN_KEYS.HOME_DAYCARE;
  if (scenario === model.SCENARIO_PACKS.GROWING_CENTER) planKey = entitlements.PLAN_KEYS.GROWING_CENTER;
  if (scenario === model.SCENARIO_PACKS.LARGE_CENTER) planKey = entitlements.PLAN_KEYS.LARGE_CENTER;
  if (scenario === model.SCENARIO_PACKS.CURRICULUM_ONLY) planKey = entitlements.PLAN_KEYS.CURRICULUM_ONLY;
  if (scenario === model.SCENARIO_PACKS.FOUNDING_MEMBER) planKey = entitlements.PLAN_KEYS.FOUNDING_MEMBER;

  store.testingLab.session = {
    organizationId: orgId,
    scenario,
    accountId: "",
    planKey,
    device: store.testingLab.session?.device || "desktop",
    featureState: "fully_configured",
    seedStatus: "seeded",
    rolePreviewId: "",
  };

  if (!Object.keys(store.testingLab.checklist).length) {
    store.testingLab.checklist = model.defaultChecklist(orgId);
  }

  store.testingLab.meta.phase18SeededFor = orgId;
  store.testingLab.meta.phase18Scenario = scenario;
  store.testingLab.meta.updatedAt = model.nowIso();

  model.appendAudit(store, {
    organizationId: orgId,
    action: "scenario_loaded",
    actorEmail: adminEmail,
    detail: `Loaded scenario pack ${scenario}`,
  });

  return {
    organizationId: orgId,
    scenario,
    planKey,
    alreadySeeded: false,
    fakeAccountCount: listValues(store.familyFoundation?.fakeAccounts || {}).filter((a) => a.organizationId === orgId).length,
  };
}

function resetPhase18Preview(store, opts = {}) {
  model.ensureTestingLabStore(store);
  const orgId = opts.organizationId || store.testingLab.session?.organizationId || "";
  if (orgId && !model.isFakeOrganizationId(orgId)) {
    throw new Error("Reset refused: organization is not a validated fake testing target.");
  }
  // Clear lab session state collections only; re-seed orchestrates feature fixtures
  store.testingLab.audit = {};
  store.testingLab.notes = {};
  store.testingLab.checklist = {};
  store.testingLab.rolePreviews = {};
  store.testingLab.deviceSessions = {};
  if (store.testingLab.meta) {
    delete store.testingLab.meta.phase18SeededFor;
    delete store.testingLab.meta.phase18Scenario;
  }
  model.appendAudit(store, {
    organizationId: orgId,
    action: "scenario_reset",
    actorEmail: opts.adminEmail || "",
    detail: "Reset testing lab collections before reseed",
  });
  return ensurePhase18Preview(store, opts);
}

module.exports = {
  ensurePhase18Preview,
  resetPhase18Preview,
  mapScenarioToDirector,
  ensureExtraFakeAccounts,
};
