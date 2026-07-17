/**
 * Shared program ownership helpers.
 *
 * Program data (children, schedule/calendar) is owned by programId.
 * Firebase UIDs remain on records for createdBy/updatedBy audit.
 * Legacy childData[uid] / scheduleByUser[uid] stay readable for rollback
 * and for unmigrated single-provider accounts.
 */
const crypto = require("node:crypto");

const CHILD_DATA_KEYS = Object.freeze([
  "Profiles",
  "Observations",
  "SupportPlans",
  "Goals",
  "Differentiations",
  "Attendance",
  "Meals",
  "MealPresets",
  "Reports",
  "Communications",
  "Naps",
  "Diapers",
  "ActivityLogs",
  "Photos",
  "Documents",
]);

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function programIdForOwnerEmail(ownerEmail) {
  const email = normalizeEmail(ownerEmail);
  if (!email) return "";
  const digest = crypto.createHash("sha256").update(`llh-program:${email}`).digest("hex").slice(0, 16);
  return `prog_${digest}`;
}

function ensureProgramsCollection(store) {
  store.programs = store.programs && typeof store.programs === "object" ? store.programs : {};
  store.programData = store.programData && typeof store.programData === "object" ? store.programData : {};
  store.programDataBackups = store.programDataBackups && typeof store.programDataBackups === "object"
    ? store.programDataBackups
    : {};
  store.childData = store.childData && typeof store.childData === "object" ? store.childData : {};
  store.scheduleByUser = store.scheduleByUser && typeof store.scheduleByUser === "object"
    ? store.scheduleByUser
    : {};
  store.users = store.users && typeof store.users === "object" ? store.users : {};
  return store;
}

function emptyChildPayload() {
  return CHILD_DATA_KEYS.reduce((acc, key) => {
    acc[key] = [];
    return acc;
  }, {});
}

function countChildRows(data = {}) {
  return CHILD_DATA_KEYS.reduce((total, key) => {
    const rows = Array.isArray(data[key]) ? data[key].length : 0;
    return total + rows;
  }, 0);
}

function summarizeChildPayload(data = {}) {
  return CHILD_DATA_KEYS.reduce((acc, key) => {
    acc[key] = Array.isArray(data[key]) ? data[key].length : 0;
    return acc;
  }, {});
}

function ensureProgramForOwner(store, ownerEmail, {
  ownerUid = "",
  name = "",
  actorEmail = "",
} = {}) {
  ensureProgramsCollection(store);
  const email = normalizeEmail(ownerEmail);
  if (!email) throw new Error("Program owner email is required.");
  const programId = programIdForOwnerEmail(email);
  const now = new Date().toISOString();
  const existing = store.programs[programId];
  if (existing) {
    if (ownerUid && !existing.ownerUid) existing.ownerUid = ownerUid;
    if (name && !existing.name) existing.name = name;
    existing.updatedAt = now;
  } else {
    store.programs[programId] = {
      id: programId,
      ownerEmail: email,
      ownerUid: ownerUid || "",
      name: name || "",
      createdAt: now,
      updatedAt: now,
      createdByEmail: normalizeEmail(actorEmail || email),
    };
  }
  if (!store.programData[programId]) {
    store.programData[programId] = {
      programId,
      child: null,
      schedule: null,
    };
  }
  const owner = store.users[email] || { email };
  store.users[email] = {
    ...owner,
    email,
    programId,
    // Owners are not "linked" to someone else; clear accidental self-link noise.
    linkedProgramOwnerEmail: owner.linkedProgramOwnerEmail && normalizeEmail(owner.linkedProgramOwnerEmail) !== email
      ? normalizeEmail(owner.linkedProgramOwnerEmail)
      : "",
    role: owner.role || "owner",
    updatedAt: now,
  };
  return store.programs[programId];
}

function resolveOwnerEmailForUser(user = {}, fallbackEmail = "") {
  const email = normalizeEmail(user.email || fallbackEmail);
  const linked = normalizeEmail(user.linkedProgramOwnerEmail || "");
  if (linked && linked !== email) return linked;
  return email;
}

/**
 * Resolve which shared program an authenticated actor should read/write.
 * Single-provider owners get a stable programId for their own email.
 * Staff/directors inherit the owner's programId via linkedProgramOwnerEmail.
 */
function resolveProgramContext(store, identity = {}) {
  ensureProgramsCollection(store);
  const actorEmail = normalizeEmail(identity.email || "");
  const actorUid = String(identity.uid || "");
  if (!actorEmail) {
    return {
      ok: false,
      error: "Authenticated email is required for program data access.",
    };
  }
  const user = store.users[actorEmail] || { email: actorEmail, role: "owner" };
  const ownerEmail = resolveOwnerEmailForUser(user, actorEmail);
  const owner = store.users[ownerEmail] || { email: ownerEmail, role: "owner" };
  const program = ensureProgramForOwner(store, ownerEmail, {
    ownerUid: owner.firebaseUid || (ownerEmail === actorEmail ? actorUid : ""),
    name: owner.businessName || owner.daycareName || owner.programName || "",
    actorEmail,
  });
  // Keep member row aligned.
  if (ownerEmail !== actorEmail) {
    store.users[actorEmail] = {
      ...user,
      email: actorEmail,
      programId: program.id,
      linkedProgramOwnerEmail: ownerEmail,
      updatedAt: new Date().toISOString(),
    };
  }
  const role = String((ownerEmail === actorEmail ? (user.role || "owner") : (user.role || "teacher"))).toLowerCase();
  const canManageStaff = role === "owner" || role === "director" || !user.role;
  const canWriteProgramData = true; // all active members can contribute operational data
  return {
    ok: true,
    programId: program.id,
    program,
    ownerEmail,
    actorEmail,
    actorUid,
    role,
    canManageStaff,
    canWriteProgramData,
    inheritsAccess: ownerEmail !== actorEmail,
  };
}

function legacyChildRecord(store, uid) {
  if (!uid) return null;
  return store.childData?.[uid] || null;
}

function legacyScheduleRecord(store, uid) {
  if (!uid) return null;
  return store.scheduleByUser?.[uid] || null;
}

function readProgramChildData(store, context) {
  ensureProgramsCollection(store);
  const programBucket = store.programData[context.programId] || {};
  if (programBucket.child?.data) {
    return {
      source: "program",
      programId: context.programId,
      data: programBucket.child.data,
      updatedAt: programBucket.child.updatedAt || "",
      updatedByUid: programBucket.child.updatedByUid || "",
      updatedByEmail: programBucket.child.updatedByEmail || "",
    };
  }
  // Prefer owner's legacy UID bucket, then actor's (pre-link personal data).
  const ownerUid = context.program?.ownerUid || store.users?.[context.ownerEmail]?.firebaseUid || "";
  const ownerLegacy = legacyChildRecord(store, ownerUid);
  if (ownerLegacy?.data) {
    return {
      source: "legacy_owner_uid",
      programId: context.programId,
      data: ownerLegacy.data,
      updatedAt: ownerLegacy.updatedAt || "",
      updatedByUid: ownerLegacy.uid || ownerUid,
      updatedByEmail: ownerLegacy.email || context.ownerEmail,
    };
  }
  const actorLegacy = legacyChildRecord(store, context.actorUid);
  if (actorLegacy?.data && context.actorEmail === context.ownerEmail) {
    return {
      source: "legacy_actor_uid",
      programId: context.programId,
      data: actorLegacy.data,
      updatedAt: actorLegacy.updatedAt || "",
      updatedByUid: actorLegacy.uid || context.actorUid,
      updatedByEmail: actorLegacy.email || context.actorEmail,
    };
  }
  return {
    source: "empty",
    programId: context.programId,
    data: null,
    updatedAt: "",
    updatedByUid: "",
    updatedByEmail: "",
  };
}

function writeProgramChildData(store, context, data, { mirrorLegacy = true } = {}) {
  ensureProgramsCollection(store);
  const updatedAt = new Date().toISOString();
  store.programData[context.programId] = store.programData[context.programId] || { programId: context.programId };
  store.programData[context.programId].child = {
    data,
    updatedAt,
    updatedByUid: context.actorUid || "",
    updatedByEmail: context.actorEmail || "",
  };
  // Mirror to owner's legacy UID key so older clients/tools still see data during rollout.
  if (mirrorLegacy) {
    const mirrorUid = context.program?.ownerUid
      || store.users?.[context.ownerEmail]?.firebaseUid
      || (context.ownerEmail === context.actorEmail ? context.actorUid : "");
    if (mirrorUid) {
      store.childData[mirrorUid] = {
        uid: mirrorUid,
        email: context.ownerEmail,
        programId: context.programId,
        data,
        updatedAt,
        updatedByUid: context.actorUid || "",
        updatedByEmail: context.actorEmail || "",
      };
      if (!context.program.ownerUid) context.program.ownerUid = mirrorUid;
    }
  }
  store.users[context.ownerEmail] = {
    ...(store.users[context.ownerEmail] || { email: context.ownerEmail }),
    email: context.ownerEmail,
    programId: context.programId,
    childProfiles: Array.isArray(data?.Profiles) ? data.Profiles.length : 0,
    childObservations: Array.isArray(data?.Observations) ? data.Observations.length : 0,
    childGoals: Array.isArray(data?.Goals) ? data.Goals.length : 0,
    childDataUpdatedAt: updatedAt,
    updatedAt,
  };
  return { updatedAt, programId: context.programId };
}

function readProgramSchedule(store, context, scheduleLib) {
  ensureProgramsCollection(store);
  const programBucket = store.programData[context.programId] || {};
  if (programBucket.schedule) {
    const doc = scheduleLib.normalizeScheduleDocument(programBucket.schedule);
    return {
      source: "program",
      programId: context.programId,
      uid: context.actorUid,
      email: context.actorEmail,
      ownerEmail: context.ownerEmail,
      ...doc,
      updatedByUid: programBucket.schedule.updatedByUid || "",
      updatedByEmail: programBucket.schedule.updatedByEmail || "",
    };
  }
  const ownerUid = context.program?.ownerUid || store.users?.[context.ownerEmail]?.firebaseUid || "";
  const ownerLegacy = legacyScheduleRecord(store, ownerUid);
  if (ownerLegacy) {
    const doc = scheduleLib.normalizeScheduleDocument(ownerLegacy);
    return {
      source: "legacy_owner_uid",
      programId: context.programId,
      uid: context.actorUid,
      email: context.actorEmail,
      ownerEmail: context.ownerEmail,
      ...doc,
      updatedByUid: ownerLegacy.uid || ownerUid,
      updatedByEmail: ownerLegacy.email || context.ownerEmail,
    };
  }
  if (context.actorEmail === context.ownerEmail) {
    const actorLegacy = legacyScheduleRecord(store, context.actorUid);
    if (actorLegacy) {
      const doc = scheduleLib.normalizeScheduleDocument(actorLegacy);
      return {
        source: "legacy_actor_uid",
        programId: context.programId,
        uid: context.actorUid,
        email: context.actorEmail,
        ownerEmail: context.ownerEmail,
        ...doc,
        updatedByUid: actorLegacy.uid || context.actorUid,
        updatedByEmail: actorLegacy.email || context.actorEmail,
      };
    }
  }
  const empty = scheduleLib.normalizeScheduleDocument({
    classrooms: [{ id: "classroom-main", name: "Main Classroom" }],
    items: [],
    updatedAt: "",
  });
  return {
    source: "empty",
    programId: context.programId,
    uid: context.actorUid,
    email: context.actorEmail,
    ownerEmail: context.ownerEmail,
    ...empty,
    updatedByUid: "",
    updatedByEmail: "",
  };
}

function writeProgramSchedule(store, context, doc, scheduleLib, { mirrorLegacy = true } = {}) {
  ensureProgramsCollection(store);
  const normalized = scheduleLib.normalizeScheduleDocument(doc);
  const updatedAt = normalized.updatedAt || new Date().toISOString();
  const scheduleRecord = {
    classrooms: normalized.classrooms,
    items: normalized.items,
    updatedAt,
    schemaVersion: 1,
    updatedByUid: context.actorUid || "",
    updatedByEmail: context.actorEmail || "",
    programId: context.programId,
    ownerEmail: context.ownerEmail,
  };
  store.programData[context.programId] = store.programData[context.programId] || { programId: context.programId };
  store.programData[context.programId].schedule = scheduleRecord;
  if (mirrorLegacy) {
    const mirrorUid = context.program?.ownerUid
      || store.users?.[context.ownerEmail]?.firebaseUid
      || (context.ownerEmail === context.actorEmail ? context.actorUid : "");
    if (mirrorUid) {
      store.scheduleByUser[mirrorUid] = {
        uid: mirrorUid,
        email: context.ownerEmail,
        programId: context.programId,
        classrooms: scheduleRecord.classrooms,
        items: scheduleRecord.items,
        updatedAt,
        schemaVersion: 1,
        updatedByUid: context.actorUid || "",
        updatedByEmail: context.actorEmail || "",
      };
      if (!context.program.ownerUid) context.program.ownerUid = mirrorUid;
    }
  }
  return {
    programId: context.programId,
    uid: context.actorUid,
    email: context.actorEmail,
    ownerEmail: context.ownerEmail,
    classrooms: scheduleRecord.classrooms,
    items: scheduleRecord.items,
    updatedAt,
    schemaVersion: 1,
  };
}

function profileIdentityKey(profile = {}) {
  const id = String(profile.id || "").trim().toLowerCase();
  if (id) return `id:${id}`;
  const name = `${profile.firstName || ""}|${profile.lastName || ""}|${profile.dateOfBirth || profile.dob || ""}`
    .trim()
    .toLowerCase();
  return `name:${name}`;
}

function scheduleItemIdentityKey(item = {}) {
  const id = String(item.id || "").trim().toLowerCase();
  if (id) return `id:${id}`;
  return `slot:${item.type || ""}|${item.startDate || ""}|${item.title || ""}`.toLowerCase();
}

/**
 * Dry-run / apply migration of two UID buckets into one owner program.
 * Never deletes source UID buckets (rollback-friendly).
 */
function planProgramDataMigration(store, {
  ownerEmail,
  memberEmail = "",
  ownerUid = "",
  memberUid = "",
  apply = false,
  backupId = "",
} = {}) {
  ensureProgramsCollection(store);
  const owner = normalizeEmail(ownerEmail);
  const member = normalizeEmail(memberEmail);
  const ambiguities = [];
  const actions = [];
  if (!owner) {
    return { ok: false, error: "ownerEmail is required", ambiguities, actions };
  }
  const program = ensureProgramForOwner(store, owner, {
    ownerUid: ownerUid || store.users?.[owner]?.firebaseUid || "",
    actorEmail: owner,
  });
  const resolvedOwnerUid = program.ownerUid || ownerUid || store.users?.[owner]?.firebaseUid || "";
  const resolvedMemberUid = memberUid || store.users?.[member]?.firebaseUid || "";

  const ownerChild = legacyChildRecord(store, resolvedOwnerUid)?.data || null;
  const memberChild = member ? (legacyChildRecord(store, resolvedMemberUid)?.data || null) : null;
  const existingProgramChild = store.programData[program.id]?.child?.data || null;

  const ownerProfiles = Array.isArray(ownerChild?.Profiles) ? ownerChild.Profiles : [];
  const memberProfiles = Array.isArray(memberChild?.Profiles) ? memberChild.Profiles : [];
  const ownerKeys = new Set(ownerProfiles.map(profileIdentityKey));
  const duplicateProfiles = memberProfiles.filter((p) => ownerKeys.has(profileIdentityKey(p)));
  if (duplicateProfiles.length) {
    ambiguities.push({
      type: "duplicate_child_profiles",
      severity: "manual_review",
      count: duplicateProfiles.length,
      samples: duplicateProfiles.slice(0, 10).map((p) => ({
        id: p.id || "",
        firstName: p.firstName || "",
        lastName: p.lastName || "",
        key: profileIdentityKey(p),
      })),
      resolution: "Do not auto-merge duplicate children. Keep owner's copy; leave member copy in legacy UID bucket for manual review.",
    });
  }

  const ownerSchedule = legacyScheduleRecord(store, resolvedOwnerUid);
  const memberSchedule = member ? legacyScheduleRecord(store, resolvedMemberUid) : null;
  const ownerItems = Array.isArray(ownerSchedule?.items) ? ownerSchedule.items : [];
  const memberItems = Array.isArray(memberSchedule?.items) ? memberSchedule.items : [];
  const ownerItemKeys = new Set(ownerItems.map(scheduleItemIdentityKey));
  const duplicateItems = memberItems.filter((item) => ownerItemKeys.has(scheduleItemIdentityKey(item)));
  if (duplicateItems.length) {
    ambiguities.push({
      type: "duplicate_schedule_items",
      severity: "manual_review",
      count: duplicateItems.length,
      samples: duplicateItems.slice(0, 10).map((item) => ({
        id: item.id || "",
        title: item.title || "",
        startDate: item.startDate || "",
        key: scheduleItemIdentityKey(item),
      })),
      resolution: "Do not auto-merge conflicting calendar items. Keep owner schedule as program schedule; preserve member schedule in legacy UID bucket.",
    });
  }

  // Chosen strategy: program gets OWNER data (or existing program data). Member-only
  // unique rows are reported, not auto-combined into owner records.
  const memberOnlyProfiles = memberProfiles.filter((p) => !ownerKeys.has(profileIdentityKey(p)));
  if (memberOnlyProfiles.length) {
    ambiguities.push({
      type: "member_only_child_profiles",
      severity: "manual_review",
      count: memberOnlyProfiles.length,
      samples: memberOnlyProfiles.slice(0, 10).map((p) => ({
        id: p.id || "",
        firstName: p.firstName || "",
        lastName: p.lastName || "",
      })),
      resolution: "Preserved under member legacy UID. Import into program only after human approval.",
    });
  }
  const memberOnlyItems = memberItems.filter((item) => !ownerItemKeys.has(scheduleItemIdentityKey(item)));
  if (memberOnlyItems.length) {
    ambiguities.push({
      type: "member_only_schedule_items",
      severity: "manual_review",
      count: memberOnlyItems.length,
      samples: memberOnlyItems.slice(0, 10).map((item) => ({
        id: item.id || "",
        title: item.title || "",
        startDate: item.startDate || "",
      })),
      resolution: "Preserved under member legacy UID. Import into program only after human approval.",
    });
  }

  const childSource = existingProgramChild
    ? "existing_program"
    : (ownerChild ? "owner_legacy_uid" : (memberChild && !ownerChild ? "member_legacy_only_blocked" : "empty"));
  if (childSource === "member_legacy_only_blocked") {
    ambiguities.push({
      type: "member_has_data_owner_empty",
      severity: "manual_review",
      detail: "Owner UID has no child data but member UID does. Refusing auto-promotion of member data to protect billing owner primacy.",
    });
  }

  const scheduleSource = store.programData[program.id]?.schedule
    ? "existing_program"
    : (ownerSchedule ? "owner_legacy_uid" : (memberSchedule && !ownerSchedule ? "member_legacy_only_blocked" : "empty"));

  actions.push({
    action: "ensure_program",
    programId: program.id,
    ownerEmail: owner,
  });
  actions.push({
    action: "set_program_child_from",
    source: childSource,
    profiles: summarizeChildPayload(existingProgramChild || ownerChild || emptyChildPayload()),
  });
  actions.push({
    action: "set_program_schedule_from",
    source: scheduleSource,
    classrooms: Array.isArray((store.programData[program.id]?.schedule || ownerSchedule)?.classrooms)
      ? (store.programData[program.id]?.schedule || ownerSchedule).classrooms.length
      : 0,
    items: Array.isArray((store.programData[program.id]?.schedule || ownerSchedule)?.items)
      ? (store.programData[program.id]?.schedule || ownerSchedule).items.length
      : 0,
  });
  actions.push({
    action: "preserve_legacy_uid_buckets",
    ownerUid: resolvedOwnerUid || null,
    memberUid: resolvedMemberUid || null,
    note: "Legacy buckets are never deleted by this migration.",
  });
  if (member) {
    actions.push({
      action: "link_member_fields_only_when_apply_and_explicit",
      memberEmail: member,
      note: "Live Ashley/Ladiisha linking is NOT applied by default in this tooling.",
    });
  }

  const report = {
    ok: true,
    apply,
    applied: false,
    programId: program.id,
    ownerEmail: owner,
    memberEmail: member || "",
    ownerUid: resolvedOwnerUid || "",
    memberUid: resolvedMemberUid || "",
    childSource,
    scheduleSource,
    ownerChildCounts: summarizeChildPayload(ownerChild || emptyChildPayload()),
    memberChildCounts: summarizeChildPayload(memberChild || emptyChildPayload()),
    ownerSchedule: {
      classrooms: Array.isArray(ownerSchedule?.classrooms) ? ownerSchedule.classrooms.length : 0,
      items: ownerItems.length,
    },
    memberSchedule: {
      classrooms: Array.isArray(memberSchedule?.classrooms) ? memberSchedule.classrooms.length : 0,
      items: memberItems.length,
    },
    ambiguities,
    actions,
    backupId: backupId || "",
    rollback: {
      method: "restore programDataBackups[backupId] onto store.programData[programId]; legacy UID buckets remain untouched",
      legacyBucketsPreserved: true,
    },
  };

  if (!apply) return report;

  const id = backupId || `backup_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  store.programDataBackups[id] = {
    id,
    createdAt: new Date().toISOString(),
    programId: program.id,
    ownerEmail: owner,
    memberEmail: member || "",
    snapshot: JSON.parse(JSON.stringify(store.programData[program.id] || { programId: program.id })),
    ownerLegacyChild: resolvedOwnerUid ? JSON.parse(JSON.stringify(store.childData[resolvedOwnerUid] || null)) : null,
    ownerLegacySchedule: resolvedOwnerUid ? JSON.parse(JSON.stringify(store.scheduleByUser[resolvedOwnerUid] || null)) : null,
    memberLegacyChild: resolvedMemberUid ? JSON.parse(JSON.stringify(store.childData[resolvedMemberUid] || null)) : null,
    memberLegacySchedule: resolvedMemberUid ? JSON.parse(JSON.stringify(store.scheduleByUser[resolvedMemberUid] || null)) : null,
  };

  // Promote owner (or existing program) data into programData. Never auto-combine member conflicts.
  if (!store.programData[program.id]?.child && ownerChild) {
    store.programData[program.id] = store.programData[program.id] || { programId: program.id };
    store.programData[program.id].child = {
      data: ownerChild,
      updatedAt: new Date().toISOString(),
      updatedByUid: resolvedOwnerUid || "",
      updatedByEmail: owner,
      migratedFrom: "owner_legacy_uid",
    };
  }
  if (!store.programData[program.id]?.schedule && ownerSchedule) {
    store.programData[program.id] = store.programData[program.id] || { programId: program.id };
    store.programData[program.id].schedule = {
      classrooms: ownerSchedule.classrooms || [],
      items: ownerSchedule.items || [],
      updatedAt: ownerSchedule.updatedAt || new Date().toISOString(),
      schemaVersion: 1,
      updatedByUid: resolvedOwnerUid || "",
      updatedByEmail: owner,
      migratedFrom: "owner_legacy_uid",
      programId: program.id,
      ownerEmail: owner,
    };
  }

  report.applied = true;
  report.backupId = id;
  report.rollback.backupId = id;
  return report;
}

function rollbackProgramDataMigration(store, backupId) {
  ensureProgramsCollection(store);
  const backup = store.programDataBackups?.[backupId];
  if (!backup) return { ok: false, error: "Backup not found." };
  store.programData[backup.programId] = JSON.parse(JSON.stringify(backup.snapshot || { programId: backup.programId }));
  // Legacy buckets were never deleted; optionally restore if mirrors changed.
  if (backup.ownerLegacyChild && backup.ownerUid) {
    // ownerUid may not be on backup — recover from snapshot metadata
  }
  return {
    ok: true,
    backupId,
    programId: backup.programId,
    restoredAt: new Date().toISOString(),
    note: "programData restored from backup. Legacy UID buckets were preserved throughout.",
  };
}

function publicProgramFields(user = {}) {
  return {
    programId: user.programId || "",
    linkedProgramOwnerEmail: normalizeEmail(user.linkedProgramOwnerEmail || ""),
    programAccessViaOwner: Boolean(user.programAccessViaOwner),
  };
}

module.exports = {
  CHILD_DATA_KEYS,
  normalizeEmail,
  programIdForOwnerEmail,
  ensureProgramsCollection,
  ensureProgramForOwner,
  resolveOwnerEmailForUser,
  resolveProgramContext,
  readProgramChildData,
  writeProgramChildData,
  readProgramSchedule,
  writeProgramSchedule,
  planProgramDataMigration,
  rollbackProgramDataMigration,
  countChildRows,
  summarizeChildPayload,
  publicProgramFields,
  emptyChildPayload,
};
