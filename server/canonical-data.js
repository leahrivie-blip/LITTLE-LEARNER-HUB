"use strict";

/**
 * Phase 4 — Canonical data adapters (read-first).
 * TESTING / HDH spine. Does not rewrite stores or touch production.
 *
 * Authoritative IDs (do not rename):
 * - programId
 * - child.id (Profiles)
 * - classroom.id (schedule.classrooms)
 * - household.id
 * - user email (staff / owners)
 */

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function emptyChildBlob() {
  return {
    Profiles: [],
    Observations: [],
    SupportPlans: [],
    Goals: [],
    Differentiations: [],
    Attendance: [],
    Meals: [],
    MealPresets: [],
    Reports: [],
    Communications: [],
    Naps: [],
    Diapers: [],
    ActivityLogs: [],
    Photos: [],
    Documents: [],
  };
}

/**
 * Resolve program record + owner email for a programId.
 */
function getCanonicalProgram(store, programId) {
  const programs = store?.programs && typeof store.programs === "object" ? store.programs : {};
  const program = programs[programId] || null;
  if (!program) return null;
  return {
    id: program.id || programId,
    name: program.name || "",
    ownerEmail: normalizeEmail(program.ownerEmail),
    accountType: program.accountType || "home_daycare",
    isTestingProgram: Boolean(program.isTestingProgram),
    createdAt: program.createdAt || "",
    source: "programs",
  };
}

/**
 * Child Profiles for a program — prefers programData, else empty.
 * Does not invent IDs or merge household snapshots into Profiles.
 */
function getCanonicalChildren(store, programId, programOwnership) {
  if (!programId) return { children: [], source: "none", programId: "", data: emptyChildBlob() };
  let data = emptyChildBlob();
  let source = "empty";
  try {
    const direct = store?.programData?.[programId]?.child?.data;
    if (direct && typeof direct === "object") {
      data = { ...emptyChildBlob(), ...direct };
      source = "programData";
    } else if (programOwnership?.readProgramChildData) {
      const ownerEmail = getCanonicalProgram(store, programId)?.ownerEmail || "";
      const ctx = programOwnership.resolveProgramContext(store, { email: ownerEmail, uid: "" });
      if (ctx?.programId) {
        const read = programOwnership.readProgramChildData(store, ctx);
        data = { ...emptyChildBlob(), ...(read?.data || {}) };
        source = read?.source || "programOwnership";
      }
    }
  } catch (_error) {
    source = "error";
  }
  const children = (Array.isArray(data.Profiles) ? data.Profiles : [])
    .filter((row) => row && row.id)
    .map((row) => ({
      id: String(row.id),
      name: row.name || "",
      classroomId: row.classroomId || row.classroom || "",
      ageGroup: row.ageGroup || "",
      status: row.status || "active",
    }));
  return { children, profiles: data.Profiles || [], data, source, programId };
}

function getCanonicalClassrooms(store, programId, scheduleLib) {
  const schedule = store?.programData?.[programId]?.schedule;
  let classrooms = [];
  let source = "empty";
  try {
    if (scheduleLib?.normalizeScheduleDocument) {
      classrooms = scheduleLib.normalizeScheduleDocument(schedule || {}).classrooms || [];
      source = schedule ? "programData.schedule" : "default";
    } else if (Array.isArray(schedule?.classrooms)) {
      classrooms = schedule.classrooms;
      source = "programData.schedule";
    }
  } catch (_error) {
    source = "error";
  }
  return {
    classrooms: (classrooms || []).map((room) => ({
      id: String(room.id || ""),
      name: room.name || "",
      ageGroup: room.ageGroup || "",
    })).filter((room) => room.id),
    source,
    programId,
  };
}

function getCanonicalStaff(store, programId) {
  const program = getCanonicalProgram(store, programId);
  const ownerEmail = program?.ownerEmail || "";
  const users = Object.values(store?.users || {});
  const members = users
    .filter((u) => {
      if (!u?.email) return false;
      if (String(u.programId || "") === String(programId)) return true;
      if (ownerEmail && normalizeEmail(u.email) === ownerEmail) return true;
      if (ownerEmail && normalizeEmail(u.linkedProgramOwnerEmail) === ownerEmail) return true;
      return false;
    })
    .map((u) => ({
      email: normalizeEmail(u.email),
      name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.name || u.email,
      role: u.role || "owner",
      classroomIds: Array.isArray(u.classroomIds) ? u.classroomIds : [],
      accountStatus: u.accountStatus || "Active",
      isOwner: ownerEmail && normalizeEmail(u.email) === ownerEmail,
    }));
  return { staff: members, ownerEmail, source: "users+programId", programId };
}

/**
 * Resolve household membership from childIds; names from Profiles when available.
 */
function resolveHouseholdChildRefs(household, profileById) {
  const snap = Array.isArray(household?.children) ? household.children : [];
  const snapById = new Map(snap.map((c) => [String(c?.id || ""), c]));
  const ids = (Array.isArray(household?.childIds) && household.childIds.length
    ? household.childIds
    : snap.map((c) => c?.id)
  ).map((id) => String(id || "")).filter(Boolean);
  return [...new Set(ids)].map((id) => {
    const live = profileById?.get(id);
    const cached = snapById.get(id);
    return {
      id,
      name: String(live?.name || cached?.name || "").trim(),
      fromProfiles: Boolean(live),
    };
  });
}

function getCanonicalHouseholds(store, programId, deps = {}) {
  const program = getCanonicalProgram(store, programId);
  const ownerEmail = program?.ownerEmail || "";
  const kids = getCanonicalChildren(store, programId, deps.programOwnership);
  const profileById = new Map(
    (kids.children || []).map((c) => [String(c.id), c]),
  );
  const households = Object.values(store?.familyHouseholds || {})
    .filter((h) => {
      if (!h) return false;
      if (String(h.programId || "") === String(programId)) return true;
      if (ownerEmail && normalizeEmail(h.ownerEmail || h.providerEmail || h.createdByEmail) === ownerEmail) return true;
      if (ownerEmail && normalizeEmail(h.programOwnerEmail) === ownerEmail) return true;
      return false;
    })
    .map((h) => {
      const childRefs = resolveHouseholdChildRefs(h, profileById);
      return {
        id: h.id,
        label: h.label || h.name || h.email || "Household",
        email: h.email || "",
        childIds: childRefs.map((c) => c.id),
        childNames: childRefs.map((c) => c.name).filter(Boolean),
        status: h.status || "active",
        magicToken: h.magicToken || "",
      };
    });
  return { households, source: "familyHouseholds+Profiles", programId };
}

/**
 * Drift report: household childIds missing from Profiles; classroomIds on children missing from schedule.
 */
function reportCanonicalDrift(store, programId, deps = {}) {
  const children = getCanonicalChildren(store, programId, deps.programOwnership);
  const classrooms = getCanonicalClassrooms(store, programId, deps.scheduleLib);
  const households = getCanonicalHouseholds(store, programId, deps);
  const staff = getCanonicalStaff(store, programId);
  const childIdSet = new Set(children.children.map((c) => c.id));
  const roomIdSet = new Set(classrooms.classrooms.map((r) => r.id));

  const missingFromProfiles = [];
  households.households.forEach((h) => {
    (h.childIds || []).forEach((cid) => {
      if (!childIdSet.has(String(cid))) {
        missingFromProfiles.push({ householdId: h.id, childId: String(cid) });
      }
    });
  });

  const unknownClassrooms = children.children
    .filter((c) => c.classroomId && roomIdSet.size && !roomIdSet.has(String(c.classroomId)))
    .map((c) => ({ childId: c.id, classroomId: c.classroomId }));

  return {
    programId,
    counts: {
      children: children.children.length,
      classrooms: classrooms.classrooms.length,
      households: households.households.length,
      staff: staff.staff.length,
    },
    sources: {
      children: children.source,
      classrooms: classrooms.source,
      households: households.source,
      staff: staff.source,
    },
    drift: {
      householdChildMissingFromProfiles: missingFromProfiles,
      childClassroomMissingFromSchedule: unknownClassrooms,
    },
    ok: missingFromProfiles.length === 0 && unknownClassrooms.length === 0,
  };
}

/**
 * Build a program-scoped read model for Owner Admin (no writes).
 */
function buildCanonicalProgramBundle(store, programId, deps = {}) {
  const program = getCanonicalProgram(store, programId);
  if (!program) return null;
  const children = getCanonicalChildren(store, programId, deps.programOwnership);
  const classrooms = getCanonicalClassrooms(store, programId, deps.scheduleLib);
  const staff = getCanonicalStaff(store, programId);
  const households = getCanonicalHouseholds(store, programId, deps);
  const drift = reportCanonicalDrift(store, programId, deps);
  return {
    program,
    children: children.children,
    classrooms: classrooms.classrooms,
    staff: staff.staff,
    households: households.households,
    sources: {
      children: children.source,
      classrooms: classrooms.source,
      staff: staff.source,
      households: households.source,
    },
    drift,
  };
}

module.exports = {
  getCanonicalProgram,
  getCanonicalChildren,
  getCanonicalClassrooms,
  getCanonicalStaff,
  getCanonicalHouseholds,
  resolveHouseholdChildRefs,
  reportCanonicalDrift,
  buildCanonicalProgramBundle,
  emptyChildBlob,
};
