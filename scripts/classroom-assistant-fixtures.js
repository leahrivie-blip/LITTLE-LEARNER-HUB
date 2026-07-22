/**
 * Classroom Assistant fake fixtures.
 * Testing only. No email/SMS/push/live AI/Stripe.
 */

const foundation = require("./foundation-data-model.js");
const directorFixtures = require("./director-center-preview-fixtures.js");
const todayHub = require("./today-hub-data-model.js");
const model = require("./classroom-assistant-data-model.js");

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

function safeLower(value) {
  return String(value || "").trim().toLowerCase();
}

function fakeEmail(value, fallback = "classroom.assistant@example.invalid") {
  const raw = safeLower(value || fallback);
  if (raw.endsWith("@example.invalid")) return raw;
  const local = raw.split("@")[0].replace(/[^a-z0-9._-]+/g, ".").replace(/^\.+|\.+$/g, "") || "classroom.assistant";
  return `${local}@example.invalid`;
}

function findReusableOrg(store, { organizationId = "", adminEmail = "" } = {}) {
  foundation.ensureFoundationStore(store);
  if (organizationId && store.organizations?.[organizationId]?.preview === true) return store.organizations[organizationId];
  const directorOrgId = store.directorCenterPreview?.organizationId;
  if (directorOrgId && store.organizations?.[directorOrgId]?.preview === true) return store.organizations[directorOrgId];
  const todayOrgId = store.todayHub?.meta?.phase15SeededFor;
  if (todayOrgId && store.organizations?.[todayOrgId]?.preview === true) return store.organizations[todayOrgId];
  const email = safeLower(adminEmail);
  return listValues(store.organizations).find((org) => (
    org?.preview === true && (!email || safeLower(org.ownerEmail) === email || safeLower(org.ownerEmail).endsWith("@example.invalid"))
  )) || null;
}

function ensureReusableOrg(store, options = {}) {
  const existing = findReusableOrg(store, options);
  if (existing) return existing;
  const seeded = directorFixtures.seedPreviewSuite(store, {
    adminEmail: fakeEmail(options.adminEmail),
    scenario: "small_center",
  });
  return seeded.organization || store.organizations?.[store.directorCenterPreview?.organizationId];
}

function primaryClassroomId(store, orgId) {
  return listValues(store.classrooms).find((row) => row.organizationId === orgId && !row.archivedAt && row.status !== "archived")?.id || "";
}

function ensureChild(store, orgId, displayName, classroomId, ageGroup = "Preschool") {
  const existing = listValues(store.childRecords).find((row) => (
    row.organizationId === orgId && safeLower(row.displayName) === safeLower(displayName)
  ));
  if (existing) return existing;
  const child = foundation.createChildRecord({
    organizationId: orgId,
    displayName,
    legacyChildId: `ca-${displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
  });
  child.preview = true;
  child.classroomAssistant = true;
  child.ageGroup = ageGroup;
  child.firstName = displayName.split(/\s+/)[0];
  store.childRecords[child.id] = child;
  if (classroomId) {
    const assignment = foundation.createClassroomChildAssignmentRecord({
      organizationId: orgId,
      classroomId,
      childId: child.id,
    });
    assignment.preview = true;
    assignment.classroomAssistant = true;
    store.classroomChildAssignments[assignment.id] = assignment;
  }
  return child;
}

function ensureChildAliases(store, orgId) {
  store.children = store.children && typeof store.children === "object" ? store.children : {};
  store.previewChildren = store.previewChildren && typeof store.previewChildren === "object" ? store.previewChildren : {};
  for (const child of listValues(store.childRecords).filter((row) => row.organizationId === orgId)) {
    const alias = {
      id: child.id,
      organizationId: orgId,
      displayName: child.displayName,
      firstName: child.firstName || String(child.displayName || "").split(/\s+/)[0],
      classroomId: listValues(store.classroomChildAssignments).find((row) => (
        row.organizationId === orgId && row.childId === child.id && (!row.status || row.status === "active") && !row.endsAt
      ))?.classroomId || child.classroomId || "",
      preview: true,
      classroomAssistant: true,
    };
    store.children[child.id] = { ...(store.children[child.id] || {}), ...alias };
    store.previewChildren[child.id] = { ...(store.previewChildren[child.id] || {}), ...alias };
  }
}

function upsertAttendance({ store, orgId, child, classroomId, status, adminEmail, date }) {
  const existing = listValues(store.todayHub.attendance).find((row) => (
    row.organizationId === orgId && row.childId === child.id && row.date === date && row.classroomAssistant === true
  ));
  const row = todayHub.createAttendanceRecord({
    id: existing?.id || "",
    organizationId: orgId,
    childId: child.id,
    classroomId,
    date,
    status,
    checkedInAt: status === todayHub.ATTENDANCE_STATUSES.CHECKED_IN ? `${date}T08:10:00.000Z` : "",
    dropOffPerson: "Classroom Assistant Fixture",
    notes: status === todayHub.ATTENDANCE_STATUSES.ABSENT ? "Absent fixture - should not receive group entries." : "Checked in fixture.",
    lastActorEmail: adminEmail,
    lastActorRole: "director_owner",
  });
  row.classroomAssistant = true;
  row.testingOnly = true;
  store.todayHub.attendance[row.id] = row;
  return row;
}

function ensureClassroomAssistantPreview(store, {
  organizationId = "",
  adminEmail = "classroom.assistant@example.invalid",
} = {}) {
  model.ensureClassroomAssistantStore(store);
  todayHub.ensureTodayHubStore(store);
  const org = ensureReusableOrg(store, { organizationId, adminEmail });
  const orgId = org.id;
  const actorEmail = fakeEmail(adminEmail);
  if (org.ownerEmail) org.ownerEmail = fakeEmail(org.ownerEmail, actorEmail);
  const classroomId = primaryClassroomId(store, orgId);
  const names = [
    ["Timmy", "Toddler"],
    ["Susan", "Preschool"],
    ["Jack", "Preschool"],
    ["Ava", "Toddler"],
    ["Maya", "Preschool"],
    ["Ben", "Preschool"],
  ];
  const childMap = {};
  for (const [name, age] of names) {
    childMap[name.toLowerCase()] = ensureChild(store, orgId, name, classroomId, age);
  }
  ensureChildAliases(store, orgId);
  const date = todayHub.todayDate();
  for (const key of ["timmy", "susan", "jack", "ava", "maya"]) {
    upsertAttendance({
      store,
      orgId,
      child: childMap[key],
      classroomId,
      status: todayHub.ATTENDANCE_STATUSES.CHECKED_IN,
      adminEmail: actorEmail,
      date,
    });
  }
  upsertAttendance({
    store,
    orgId,
    child: childMap.ben,
    classroomId,
    status: todayHub.ATTENDANCE_STATUSES.ABSENT,
    adminEmail: actorEmail,
    date,
  });
  const ca = model.ensureClassroomAssistantStore(store);
  ca.meta.classroomAssistantSeededFor = orgId;
  ca.meta.classroomAssistantActorEmail = actorEmail;
  ca.meta.classroomAssistantChildIds = Object.fromEntries(Object.entries(childMap).map(([key, child]) => [key, child.id]));
  ca.meta.fakeDataOnly = true;
  ca.meta.liveAiUsed = false;
  ca.meta.updatedAt = model.nowIso();
  return {
    organizationId: orgId,
    actorEmail,
    childIds: ca.meta.classroomAssistantChildIds,
    classroomId,
    date,
  };
}

module.exports = {
  ensureClassroomAssistantPreview,
};
