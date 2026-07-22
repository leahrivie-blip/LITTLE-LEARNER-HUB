/**
 * Phase 20 — Fake-data migration simulator.
 * Inspect / preview / confirm-apply / rollback simulation for validated fake orgs only.
 * Never runs a real production migration.
 */

const crypto = require("node:crypto");
const resilience = require("./platform-resilience-data-model.js");

const PHASE = 20;
const FEATURE_MARKER = "phase20-migration-simulator";
const TESTING_BANNER = "Private Testing Environment — Fake Data Only";

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function nowIso() {
  return new Date().toISOString();
}

function cleanText(value, max = 500) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

function ensureMigrationStore(store) {
  if (!store.migrationSimulator || typeof store.migrationSimulator !== "object") {
    store.migrationSimulator = {};
  }
  const ms = store.migrationSimulator;
  for (const key of ["inspections", "previews", "applications", "rollbacks", "history"]) {
    if (!ms[key] || typeof ms[key] !== "object") ms[key] = {};
  }
  if (!ms.meta || typeof ms.meta !== "object") {
    ms.meta = {
      phase: PHASE,
      featureMarker: FEATURE_MARKER,
      testingOnly: true,
      noProductionMigration: true,
      createdAt: nowIso(),
    };
  }
  ms.meta.updatedAt = nowIso();
  return ms;
}

function assertFakeOrg(organizationId) {
  if (!resilience.isFakeOrganizationId(organizationId)) {
    const err = new Error("Migration simulator limited to validated fake organizations.");
    err.code = "real_target_rejected";
    throw err;
  }
}

/**
 * Inspect legacy/testing records for a fake org without mutating them.
 */
function inspectFakeOrganization(store, organizationId) {
  assertFakeOrg(organizationId);
  const accounts = listValues(store.familyFoundation?.fakeAccounts || {})
    .filter((a) => a.organizationId === organizationId)
    .map((a) => ({
      id: a.id,
      kind: a.kind,
      email: a.email,
      role: a.role,
      // never passwordHash
    }));
  const classrooms = listValues(store.directorCenter?.classrooms || store.classrooms || {})
    .filter((c) => c.organizationId === organizationId)
    .map((c) => ({
      id: c.id,
      label: c.name || c.label || c.id,
      permanentId: c.id,
    }));
  const children = listValues(store.directorCenter?.children || store.childRecords || {})
    .filter((c) => c.organizationId === organizationId)
    .map((c) => ({ id: c.id, displayName: c.displayName || c.firstName || c.id, classroomId: c.classroomId || "" }));
  const staff = listValues(store.staffExperience?.profiles || store.staffMemberships || {})
    .filter((s) => s.organizationId === organizationId)
    .map((s) => ({ id: s.id, displayName: s.displayName || s.email || s.id, role: s.role || "" }));
  const contacts = listValues(store.familyFoundation?.contacts || {})
    .filter((c) => c.organizationId === organizationId)
    .map((c) => ({
      id: c.id,
      accessLevel: c.accessLevel || c.kind || "",
      email: c.email || "",
    }));
  const labSession = store.testingLab?.session || {};
  const duplicates = [];
  const emails = accounts.map((a) => String(a.email || "").toLowerCase()).filter(Boolean);
  const seen = new Set();
  for (const email of emails) {
    if (seen.has(email)) duplicates.push({ type: "fake_account_email", value: email });
    seen.add(email);
  }
  const missing = [];
  if (!classrooms.length) missing.push({ type: "classroom", detail: "No classroom records for org" });
  if (!accounts.length) missing.push({ type: "fake_account", detail: "No fake accounts for org" });
  const conflicts = [];
  for (const child of children) {
    if (child.classroomId && !classrooms.some((c) => c.id === child.classroomId)) {
      conflicts.push({ type: "child_classroom_missing", childId: child.id, classroomId: child.classroomId });
    }
  }

  return {
    ok: true,
    phase: PHASE,
    featureMarker: FEATURE_MARKER,
    testingBanner: TESTING_BANNER,
    testingOnly: true,
    mutated: false,
    organizationId,
    scenario: labSession.scenario || "",
    counts: {
      fakeAccounts: accounts.length,
      classrooms: classrooms.length,
      children: children.length,
      staff: staff.length,
      guardians: contacts.length,
    },
    classroomLabelMatches: classrooms.map((c) => ({
      label: c.label,
      permanentClassroomId: c.permanentId,
      matchStrategy: "exact_id_or_label",
    })),
    ownershipPreview: {
      organizationId,
      programOwnerHint: accounts.find((a) => a.kind === "owner")?.email || accounts[0]?.email || "",
    },
    linkPreviews: {
      children,
      staff,
      guardians: contacts,
      forms: "Deferred deep link — Forms Center responses stay under org scope",
      calendar: "Deferred — scheduleByUser not rewritten",
      lessons: "Deferred — curriculum library untouched",
      billing: "Fake billing simulator records only when present",
      documents: "Records Center private files remain private",
    },
    issues: { duplicates, missing, conflicts, invalid: [] },
    at: nowIso(),
  };
}

function buildMigrationPreview(store, organizationId, inspection) {
  assertFakeOrg(organizationId);
  const insp = inspection || inspectFakeOrganization(store, organizationId);
  const create = [
    { kind: "migration_history_row", detail: "Append migration application record" },
    { kind: "foundation_link_labels", detail: `Map ${insp.counts.classrooms} classroom labels to permanent IDs` },
  ];
  const update = [
    { kind: "testing_lab_session", detail: "Stamp lastMigrationPreviewAt on fake Lab session" },
  ];
  const skip = [
    { kind: "users", detail: "Never rewrite production users" },
    { kind: "stripe", detail: "Never touch Stripe fields" },
    { kind: "passwords", detail: "Never migrate password hashes into reports" },
  ];
  const flag = [...insp.issues.duplicates, ...insp.issues.missing, ...insp.issues.conflicts].map((i) => ({
    kind: i.type,
    detail: i.detail || i.value || i.childId || "",
  }));

  return {
    id: newId("migprev"),
    organizationId,
    at: nowIso(),
    testingOnly: true,
    requiresConfirm: true,
    noProduction: true,
    wouldCreate: create,
    wouldUpdate: update,
    wouldSkip: skip,
    wouldFlag: flag,
    inspectionSummary: {
      counts: insp.counts,
      issueCount: flag.length,
    },
  };
}

function applyFakeMigration(store, preview, { confirm, actorEmail } = {}) {
  if (confirm !== true) {
    const err = new Error("Explicit confirmation required before fake-data migration.");
    err.code = "confirmation_required";
    throw err;
  }
  assertFakeOrg(preview.organizationId);
  ensureMigrationStore(store);
  const backup = {
    id: newId("migbak"),
    organizationId: preview.organizationId,
    at: nowIso(),
    session: { ...(store.testingLab?.session || {}) },
    testingOnly: true,
  };
  store.migrationSimulator.applications[backup.id] = {
    id: newId("migapp"),
    backupId: backup.id,
    previewId: preview.id,
    organizationId: preview.organizationId,
    appliedAt: nowIso(),
    actorEmail: cleanText(actorEmail, 160).toLowerCase(),
    testingOnly: true,
    mutatedCollections: ["testingLab.session", "migrationSimulator.history"],
  };
  store.migrationSimulator.rollbacks[backup.id] = backup;
  if (store.testingLab?.session) {
    store.testingLab.session.lastMigrationAppliedAt = nowIso();
    store.testingLab.session.lastMigrationPreviewId = preview.id;
  }
  const history = {
    id: newId("mighist"),
    action: "fake_migration_applied",
    organizationId: preview.organizationId,
    previewId: preview.id,
    backupId: backup.id,
    actorEmail: cleanText(actorEmail, 160).toLowerCase(),
    at: nowIso(),
    testingOnly: true,
    preservesOriginalRecords: true,
  };
  store.migrationSimulator.history[history.id] = history;
  return {
    ok: true,
    applied: true,
    testingOnly: true,
    organizationId: preview.organizationId,
    backupId: backup.id,
    historyId: history.id,
    note: "Fake migration stamped Lab session only. Original records preserved. Production untouched.",
  };
}

function rollbackFakeMigration(store, backupId, { confirm, actorEmail } = {}) {
  if (confirm !== true) {
    const err = new Error("Explicit confirmation required for rollback simulation.");
    err.code = "confirmation_required";
    throw err;
  }
  ensureMigrationStore(store);
  const backup = store.migrationSimulator.rollbacks[backupId];
  if (!backup) {
    const err = new Error("Rollback backup not found.");
    err.code = "not_found";
    throw err;
  }
  assertFakeOrg(backup.organizationId);
  if (store.testingLab?.session && backup.session) {
    store.testingLab.session.scenario = backup.session.scenario || store.testingLab.session.scenario;
    store.testingLab.session.featureState = backup.session.featureState || store.testingLab.session.featureState;
    delete store.testingLab.session.lastMigrationAppliedAt;
    delete store.testingLab.session.lastMigrationPreviewId;
  }
  const history = {
    id: newId("mighist"),
    action: "fake_migration_rollback",
    organizationId: backup.organizationId,
    backupId,
    actorEmail: cleanText(actorEmail, 160).toLowerCase(),
    at: nowIso(),
    testingOnly: true,
  };
  store.migrationSimulator.history[history.id] = history;
  return {
    ok: true,
    rolledBack: true,
    testingOnly: true,
    organizationId: backup.organizationId,
    historyId: history.id,
  };
}

function exportSanitizedReport(inspection, preview) {
  return {
    reportType: "migration_simulator_sanitized",
    phase: PHASE,
    featureMarker: FEATURE_MARKER,
    testingBanner: TESTING_BANNER,
    testingOnly: true,
    noSecrets: true,
    noPasswords: true,
    noTokens: true,
    organizationId: inspection?.organizationId || preview?.organizationId || "",
    counts: inspection?.counts || {},
    issues: inspection?.issues || {},
    preview: preview
      ? {
          id: preview.id,
          wouldCreate: preview.wouldCreate,
          wouldUpdate: preview.wouldUpdate,
          wouldSkip: preview.wouldSkip,
          wouldFlag: preview.wouldFlag,
        }
      : null,
    exportedAt: nowIso(),
  };
}

module.exports = {
  PHASE,
  FEATURE_MARKER,
  TESTING_BANNER,
  ensureMigrationStore,
  inspectFakeOrganization,
  buildMigrationPreview,
  applyFakeMigration,
  rollbackFakeMigration,
  exportSanitizedReport,
  assertFakeOrg,
};
