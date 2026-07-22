/**
 * Phase 21 Provider Productivity fixtures.
 * Fake/testing only. No email/SMS/push/live AI/Stripe. All Phase 21-created
 * emails use @example.invalid.
 */

const foundation = require("./foundation-data-model.js");
const orgPermissions = require("./org-permissions.js");
const directorFixtures = require("./director-center-preview-fixtures.js");
const model = require("./provider-productivity-data-model.js");

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

function safeLower(value) {
  return String(value || "").trim().toLowerCase();
}

function fakeEmail(value, fallback = "phase21.provider@example.invalid") {
  const raw = safeLower(value);
  if (raw.endsWith("@example.invalid")) return raw;
  const local = raw.split("@")[0].replace(/[^a-z0-9._-]+/g, ".").replace(/^\.+|\.+$/g, "") || "phase21.provider";
  return `${local}@example.invalid`;
}

function programStyleFromOrg(store, orgId, fallback = "center") {
  const org = store.organizations?.[orgId] || {};
  const profile = listValues(store.programProfiles).find((row) => row.organizationId === orgId) || {};
  const joined = `${org.accountType || ""} ${profile.programType || ""}`.toLowerCase();
  if (joined.includes("home") || joined.includes("single_provider")) return "home_daycare";
  return fallback === "home_daycare" ? "home_daycare" : "center";
}

function findReusableOrg(store, { organizationId = "", adminEmail = "" } = {}) {
  foundation.ensureFoundationStore(store);
  if (organizationId && store.organizations?.[organizationId]?.preview === true) {
    return store.organizations[organizationId];
  }
  const directorOrgId = store.directorCenterPreview?.organizationId;
  if (directorOrgId && store.organizations?.[directorOrgId]?.preview === true) {
    return store.organizations[directorOrgId];
  }
  const todayOrgId = store.todayHub?.meta?.phase15SeededFor;
  if (todayOrgId && store.organizations?.[todayOrgId]?.preview === true) {
    return store.organizations[todayOrgId];
  }
  const email = safeLower(adminEmail);
  return listValues(store.organizations).find((org) => (
    org
    && org.preview === true
    && (!email || safeLower(org.ownerEmail) === email || safeLower(org.ownerEmail).endsWith("@example.invalid"))
  )) || null;
}

function ensureReusableOrg(store, { organizationId = "", adminEmail = "", programStyle = "" } = {}) {
  let org = findReusableOrg(store, { organizationId, adminEmail });
  if (org) return org;

  const scenario = programStyle === "home_daycare" ? "home_daycare" : "small_center";
  const seeded = directorFixtures.seedPreviewSuite(store, {
    adminEmail: fakeEmail(adminEmail),
    scenario,
  });
  org = seeded.organization || (store.directorCenterPreview?.organizationId && store.organizations?.[store.directorCenterPreview.organizationId]);
  if (!org) {
    org = foundation.createOrganizationRecord({
      accountType: programStyle === "home_daycare" ? foundation.ACCOUNT_TYPES.HOME_DAYCARE : foundation.ACCOUNT_TYPES.CENTER,
      ownerEmail: fakeEmail(adminEmail),
      name: programStyle === "home_daycare" ? "Phase 21 Home Daycare (Preview)" : "Phase 21 Center (Preview)",
    });
    org.preview = true;
    org.previewLabel = directorFixtures.PREVIEW_MARKER;
    org.fakeDataOnly = true;
    store.organizations[org.id] = org;
  }
  return org;
}

function childIdsForOrg(store, orgId) {
  return listValues(store.childRecords).filter((row) => row.organizationId === orgId).map((row) => row.id).slice(0, 4);
}

function primaryClassroomId(store, orgId) {
  return (listValues(store.classrooms).find((row) => row.organizationId === orgId && !row.archivedAt) || {}).id || "";
}

function ensureSearchChildAlias(store, orgId) {
  store.children = store.children && typeof store.children === "object" ? store.children : {};
  for (const child of listValues(store.childRecords).filter((row) => row.organizationId === orgId)) {
    if (!store.children[child.id]) {
      store.children[child.id] = {
        id: child.id,
        organizationId: orgId,
        displayName: child.displayName || child.name || child.firstName || child.id,
        firstName: child.firstName || child.displayName || child.id,
        classroomId: listValues(store.classroomChildAssignments || {})
          .find((row) => row.childId === child.id && row.organizationId === orgId && (!row.status || row.status === "active") && !row.endsAt)?.classroomId || "",
        preview: true,
        phase21: true,
      };
    }
  }
}

function normalizeFakeOrgEmails(store, orgId, actorEmail) {
  const org = store.organizations?.[orgId];
  if (org) org.ownerEmail = fakeEmail(org.ownerEmail || actorEmail);
  for (const profile of listValues(store.programProfiles).filter((row) => row.organizationId === orgId)) {
    if (profile.email) profile.email = fakeEmail(profile.email);
  }
  for (const member of listValues(store.staffMemberships).filter((row) => row.organizationId === orgId)) {
    if (member.userEmail) member.userEmail = fakeEmail(member.userEmail);
  }
  for (const guardian of listValues(store.guardians).filter((row) => row.organizationId === orgId)) {
    if (guardian.email) guardian.email = fakeEmail(guardian.email);
  }
}

function seedFixtureRecords(store, {
  orgId,
  actorEmail,
  programStyle,
}) {
  const pp = model.ensureProductivityStore(store);
  pp.meta = pp.meta && typeof pp.meta === "object" ? pp.meta : {};
  const ids = {};
  const userKey = actorEmail;
  const children = childIdsForOrg(store, orgId);
  const classroomId = primaryClassroomId(store, orgId);
  const planningPreference = programStyle === "home_daycare"
    ? model.PLANNING_PREFERENCES.CHILD_LED_PLAY_BASED
    : model.PLANNING_PREFERENCES.MIXED_FLEXIBLE;

  const preference = model.setOrgPreference(store, orgId, {
    planningPreference,
    programStyle,
  });
  ids.preferenceOrganizationId = preference.organizationId;

  const setup = model.updateSetupProgress(store, orgId, {
    programStyle,
    completedStepIds: ["program_details", "planning_preference"],
    finishLater: true,
  });
  ids.setupStatus = setup.status;

  const interest = model.createInterestRecord({
    organizationId: orgId,
    childIds: children.slice(0, 2),
    classroomId,
    note: "A child kept returning to bowls, fabric, and stones during open play.",
    theme: programStyle === "home_daycare" ? "loose_parts" : "open_ended_play",
    nextStep: "Offer a simple invitation and observe what the children do next.",
    createdBy: actorEmail,
  });
  interest.preview = true;
  interest.phase21 = true;
  pp.interests[interest.id] = interest;
  ids.interestId = interest.id;

  const suggestions = model.generatePlaySuggestions(interest);
  suggestions.forEach((suggestion) => {
    suggestion.preview = true;
    suggestion.phase21 = true;
    suggestion.reviewed = false;
    suggestion.saved = false;
    pp.suggestions[suggestion.id] = suggestion;
  });
  ids.suggestionIds = suggestions.map((suggestion) => suggestion.id);

  model.toggleFavorite(store, {
    organizationId: orgId,
    userKey,
    itemType: "activity",
    itemId: "act_loose_parts_tray",
  });
  model.pushRecent(store, {
    organizationId: orgId,
    userKey,
    itemType: "activity",
    itemId: "act_mud_kitchen",
  });
  ids.favoriteActivityId = "act_loose_parts_tray";
  ids.recentActivityId = "act_mud_kitchen";

  const notificationPrefs = model.setNotificationPrefs(store, orgId, userKey, {
    groupRelated: true,
    avoidDuplicates: true,
    summaryMode: "daily",
    outboundEmail: false,
    outboundSms: false,
    outboundPush: false,
    categories: {
      attendance: true,
      forms: true,
      messages: true,
      billing: false,
      licensing: true,
      childLedIdeas: true,
    },
  });
  ids.notificationPrefsUserKey = notificationPrefs.userKey;

  model.pushRecent(store, {
    organizationId: orgId,
    userKey,
    itemType: "interest",
    itemId: interest.id,
  });

  pp.meta.phase21SeededFor = orgId;
  pp.meta.phase21Ids = ids;
  pp.meta.phase21ActorEmail = actorEmail;
  pp.meta.phase21ProgramStyle = programStyle;
  pp.meta.updatedAt = model.nowIso();
  return ids;
}

function ensurePhase21Preview(store, {
  organizationId = "",
  adminEmail = "phase21.provider@example.invalid",
  programStyle = "",
} = {}) {
  model.ensureProductivityStore(store);
  const org = ensureReusableOrg(store, { organizationId, adminEmail, programStyle });
  const orgId = org.id;
  const effectiveStyle = programStyle || programStyleFromOrg(store, orgId, "center");
  const actorEmail = fakeEmail(adminEmail);
  const pp = model.ensureProductivityStore(store);
  pp.meta = pp.meta && typeof pp.meta === "object" ? pp.meta : {};
  normalizeFakeOrgEmails(store, orgId, actorEmail);
  ensureSearchChildAlias(store, orgId);

  if (pp.meta.phase21SeededFor === orgId) {
    return {
      organizationId: orgId,
      alreadySeeded: true,
      ids: pp.meta.phase21Ids || {},
      actorEmail: pp.meta.phase21ActorEmail || actorEmail,
      programStyle: pp.meta.phase21ProgramStyle || effectiveStyle,
    };
  }

  const ids = seedFixtureRecords(store, {
    orgId,
    actorEmail,
    programStyle: effectiveStyle,
  });

  return {
    organizationId: orgId,
    alreadySeeded: false,
    ids,
    actorEmail,
    programStyle: effectiveStyle,
  };
}

module.exports = {
  ensurePhase21Preview,
};
