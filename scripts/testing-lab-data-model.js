/**
 * Phase 18 — Testing and Preview Lab data model.
 * Fake data only. No passwords stored in fixtures. No Stripe/email/SMS/push/live AI.
 */

const crypto = require("node:crypto");

const TESTING_BANNER = "Private Testing Environment — Fake Data Only";
const ACCOUNT_BANNER = "Testing Account — Fake Data Only";

const SCENARIO_PACKS = Object.freeze({
  HOME_DAYCARE: "home_daycare",
  SMALL_CENTER: "small_center",
  GROWING_CENTER: "growing_center",
  LARGE_CENTER: "large_center",
  CURRICULUM_ONLY: "curriculum_only",
  FOUNDING_MEMBER: "founding_member",
});

const FEATURE_STATES = Object.freeze([
  "empty_new_account",
  "partially_configured",
  "fully_configured",
  "near_plan_limit",
  "plan_limit_reached",
  "missing_staff_permissions",
  "restricted_guardian",
  "wrong_classroom",
  "no_children_assigned",
  "forms_awaiting_signatures",
  "returned_form",
  "missing_enrollment_paperwork",
  "unfiled_record",
  "expiring_immunization",
  "staff_certification_expiring",
  "licensing_inspection_upcoming",
  "open_corrective_action",
  "ratio_warning",
  "incomplete_daily_reports",
  "unread_messages",
  "family_update",
  "past_due_fake_invoice",
  "failed_fake_payment",
  "coverage_gap",
  "offline_loading_foundation",
  "empty_result",
  "validation_error",
  "permission_denied",
  "expired_session",
  "archived_data",
]);

const DEVICE_PRESETS = Object.freeze({
  small_phone: { label: "Small phone", width: 360, height: 740, rotatable: true },
  large_phone: { label: "Large phone", width: 430, height: 932, rotatable: true },
  tablet_portrait: { label: "Tablet portrait", width: 768, height: 1024, rotatable: true },
  tablet_landscape: { label: "Tablet landscape", width: 1024, height: 768, rotatable: true },
  laptop: { label: "Laptop", width: 1280, height: 800, rotatable: false },
  desktop: { label: "Desktop", width: 1440, height: 900, rotatable: false },
});

const CHECKLIST_ITEMS = Object.freeze([
  "account_login",
  "navigation",
  "director",
  "teacher",
  "assistant",
  "family",
  "curriculum_only",
  "forms",
  "enrollment",
  "records",
  "licensing",
  "today",
  "staff",
  "billing",
  "phone",
  "tablet",
  "computer",
  "permissions",
  "empty_error_states",
]);

const NOTE_STATUSES = Object.freeze({
  PASS: "pass",
  NEEDS_CHANGE: "needs_change",
  BUG: "bug",
  QUESTION: "question",
  NOT_TESTED: "not_tested",
});

const ROLE_PREVIEW_TARGETS = Object.freeze([
  "owner",
  "director",
  "lead_teacher",
  "teacher",
  "assistant_broad",
  "assistant_limited",
  "parent_multi_child",
  "restricted_guardian",
  "pickup_only",
  "curriculum_only",
]);

const PREVIEW_TTL_MS = 60 * 60 * 1000;

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

function ensureTestingLabStore(store) {
  if (!store.testingLab || typeof store.testingLab !== "object") store.testingLab = {};
  const lab = store.testingLab;
  for (const key of ["audit", "notes", "checklist", "rolePreviews", "deviceSessions", "idempotencyKeys"]) {
    if (!lab[key] || typeof lab[key] !== "object") lab[key] = {};
  }
  if (!lab.meta || typeof lab.meta !== "object") {
    lab.meta = {
      createdAt: nowIso(),
      testingOnly: true,
      fakeOrganizationOnly: true,
      noProduction: true,
      noMain: true,
      noRealUsers: true,
      noStripe: true,
      noOutboundEmail: true,
      noOutboundSms: true,
      noPush: true,
      noLiveAi: true,
      noProductionStorage: true,
      noPasswordsInFixtures: true,
      banner: TESTING_BANNER,
    };
  }
  lab.meta.updatedAt = nowIso();
  if (!lab.session || typeof lab.session !== "object") {
    lab.session = {
      organizationId: "",
      scenario: "",
      accountId: "",
      planKey: "",
      device: "desktop",
      featureState: "fully_configured",
      seedStatus: "idle",
      rolePreviewId: "",
    };
  }
  return lab;
}

function appendAudit(store, entry = {}) {
  ensureTestingLabStore(store);
  const row = {
    id: newId("tlaud"),
    action: cleanText(entry.action, 80),
    actorEmail: cleanText(entry.actorEmail, 160).toLowerCase(),
    organizationId: cleanText(entry.organizationId, 80),
    detail: cleanText(entry.detail, 2000),
    at: nowIso(),
    testingOnly: true,
  };
  store.testingLab.audit[row.id] = row;
  return row;
}

function createRolePreviewSession(input = {}) {
  const now = Date.now();
  return {
    id: input.id || newId("tlprev"),
    organizationId: cleanText(input.organizationId, 80),
    targetKind: cleanText(input.targetKind, 80),
    membershipId: cleanText(input.membershipId, 80),
    contactId: cleanText(input.contactId, 80),
    label: cleanText(input.label || `Role preview: ${input.targetKind}`, 160),
    startedByEmail: cleanText(input.startedByEmail, 160).toLowerCase(),
    startedAt: input.startedAt || nowIso(),
    expiresAt: input.expiresAt || new Date(now + PREVIEW_TTL_MS).toISOString(),
    active: true,
    doesNotChangeStoredAdminRole: true,
    testingOnly: true,
  };
}

function isPreviewExpired(session) {
  if (!session || session.active !== true) return true;
  return Date.parse(session.expiresAt || 0) <= Date.now();
}

function createTestingNote(input = {}) {
  return {
    id: input.id || newId("tlnote"),
    organizationId: cleanText(input.organizationId, 80),
    checklistItem: cleanText(input.checklistItem, 80),
    status: Object.values(NOTE_STATUSES).includes(input.status) ? input.status : NOTE_STATUSES.NOT_TESTED,
    body: cleanText(input.body, 4000),
    authorEmail: cleanText(input.authorEmail, 160).toLowerCase(),
    createdAt: input.createdAt || nowIso(),
    updatedAt: input.updatedAt || nowIso(),
    testingOnly: true,
  };
}

function defaultChecklist(organizationId) {
  const rows = {};
  for (const item of CHECKLIST_ITEMS) {
    const id = `chk_${item}`;
    rows[id] = {
      id,
      organizationId,
      item,
      status: NOTE_STATUSES.NOT_TESTED,
      updatedAt: nowIso(),
    };
  }
  return rows;
}

function scenarioCatalog() {
  return Object.values(SCENARIO_PACKS).map((key) => ({
    key,
    label: key.replace(/_/g, " "),
    testingOnly: true,
  }));
}

function isFakeOrganizationId(organizationId) {
  const id = String(organizationId || "");
  if (!id) return false;
  if (/prod|live|stripe|customer/i.test(id) && !/preview|phase|fake|test|example/i.test(id)) return false;
  return true;
}

function isExampleInvalidEmail(email) {
  return /@example\.invalid$/i.test(String(email || "").trim());
}

module.exports = {
  TESTING_BANNER,
  ACCOUNT_BANNER,
  SCENARIO_PACKS,
  FEATURE_STATES,
  DEVICE_PRESETS,
  CHECKLIST_ITEMS,
  NOTE_STATUSES,
  ROLE_PREVIEW_TARGETS,
  PREVIEW_TTL_MS,
  newId,
  nowIso,
  cleanText,
  listValues,
  ensureTestingLabStore,
  appendAudit,
  createRolePreviewSession,
  isPreviewExpired,
  createTestingNote,
  defaultChecklist,
  scenarioCatalog,
  isFakeOrganizationId,
  isExampleInvalidEmail,
};
