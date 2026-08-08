"use strict";

/**
 * Phase 4 — Canonical data (one source of truth).
 * TESTING / HDH spine. Does not rewrite stores or touch production.
 *
 * Finish line: every feature reads the same durable record.
 * These helpers are thin reads over that record — not a second database.
 *
 * Authoritative homes:
 * - Program → store.programs[programId]
 * - Child → store.programData[programId].child.data.Profiles (+ care arrays)
 * - Family → store.familyHouseholds[id] (membership = childIds)
 * - Staff → store.users (programId / linkedProgramOwnerEmail); programMembers = index
 * - Classroom → store.programData[programId].schedule.classrooms
 * - Lesson catalog → store.siteContent.curriculum.lessonPlans
 * - Lesson assignment → schedule items (type lesson_plan)
 * - Calendar/Weekly Plan → store.programData[programId].schedule (authoritative)
 * - Daily logs / Observations / assigned Forms → same child blob
 * - Billing (SaaS subscription) → store.users Stripe/plan fields
 * - Tuition billing (provider→family) → store.tuitionRates / tuitionInvoices / tuitionPayments
 * - Messages → three labeled channels (support / FH / Communications)
 *
 * Temporary mirrors (read-fallback only; do not treat as sources of truth):
 * - store.childData[uid]
 * - store.scheduleByUser[uid]
 * - localStorage llhWeeklyPlanner / llhChild:* / llhAccounts (client caches)
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
      archived: Boolean(row.archived),
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
      archived: Boolean(room.archived),
    })).filter((room) => room.id),
    schedule,
    source,
    programId,
  };
}

function getCanonicalSchedule(store, programId, scheduleLib) {
  const rooms = getCanonicalClassrooms(store, programId, scheduleLib);
  let items = [];
  try {
    if (scheduleLib?.normalizeScheduleDocument) {
      items = scheduleLib.normalizeScheduleDocument(rooms.schedule || {}).items || [];
    } else if (Array.isArray(rooms.schedule?.items)) {
      items = rooms.schedule.items;
    }
  } catch (_error) {
    items = [];
  }
  return {
    classrooms: rooms.classrooms,
    items,
    source: rooms.source,
    programId,
    updatedAt: rooms.schedule?.updatedAt || "",
  };
}

function getCanonicalStaff(store, programId) {
  const program = getCanonicalProgram(store, programId);
  const ownerEmail = program?.ownerEmail || "";
  const users = Object.values(store?.users || {});
  const fromUsers = users
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
      classroomIds: Array.isArray(u.classroomIds) ? u.classroomIds.map(String) : [],
      accountStatus: u.accountStatus || "Active",
      isOwner: ownerEmail && normalizeEmail(u.email) === ownerEmail,
      source: "users",
    }));

  const memberKey = ownerEmail;
  const memberRows = Array.isArray(store?.programMembers?.[memberKey])
    ? store.programMembers[memberKey]
    : [];
  const memberEmails = new Set(
    memberRows.map((row) => normalizeEmail(row?.email)).filter(Boolean),
  );
  const userEmails = new Set(fromUsers.map((u) => u.email));

  return {
    staff: fromUsers,
    ownerEmail,
    source: "users",
    programId,
    index: {
      programMembersCount: memberRows.length,
      membersMissingFromUsers: [...memberEmails].filter((email) => !userEmails.has(email)),
      usersMissingFromMembers: fromUsers
        .filter((u) => !u.isOwner && !memberEmails.has(u.email))
        .map((u) => u.email),
    },
  };
}

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
      snapshotNameOnly: Boolean(cached?.name) && !live,
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
        childRefs,
        status: h.status || "active",
        magicToken: h.magicToken || "",
        hasStaleNameSnapshot: Array.isArray(h.children) && h.children.some((c) => c && c.name),
      };
    });
  return { households, source: "familyHouseholds+Profiles", programId };
}

function getCanonicalLessonCatalog(store) {
  const plans = store?.siteContent?.curriculum?.lessonPlans;
  const list = Array.isArray(plans) ? plans : [];
  return {
    lessonPlans: list.map((plan) => ({
      id: String(plan?.id || ""),
      title: plan?.title || plan?.name || "",
    })).filter((plan) => plan.id),
    source: "siteContent.curriculum.lessonPlans",
  };
}

function getCanonicalBilling(store, programId) {
  const program = getCanonicalProgram(store, programId);
  const ownerEmail = program?.ownerEmail || "";
  const user = store?.users?.[ownerEmail] || {};
  return {
    ownerEmail,
    plan: user.plan || "Free",
    subscriptionStatus: user.subscriptionStatus || "",
    stripeCustomerId: user.stripeCustomerId || "",
    stripeSubscriptionStatus: user.stripeSubscriptionStatus || "",
    source: "users",
    note: "SaaS subscription billing only — not provider→family tuition.",
  };
}

/** Provider → family childcare tuition (Phase 8). Separate from SaaS Billing. */
function getCanonicalTuitionBilling(store, programId) {
  const key = String(programId || "");
  const rates = Object.values(store?.tuitionRates || {}).filter((r) => r && String(r.programId) === key);
  const invoices = Object.values(store?.tuitionInvoices || {}).filter((i) => i && String(i.programId) === key);
  const payments = Object.values(store?.tuitionPayments || {}).filter((p) => p && String(p.programId) === key);
  return {
    programId: key,
    rateCount: rates.length,
    invoiceCount: invoices.length,
    paymentCount: payments.length,
    source: "tuitionRates+tuitionInvoices+tuitionPayments",
    refs: "programId + householdId + childIds (canonical Profiles / familyHouseholds)",
    note: "Separate from store.users Stripe SaaS fields. Simulated payments in testing.",
  };
}

function getCanonicalMessagingInventory(store, programId) {
  const households = getCanonicalHouseholds(store, programId);
  const householdIds = new Set(households.households.map((h) => h.id));
  const fhMessages = (Array.isArray(store?.familyHubMessages) ? store.familyHubMessages : [])
    .filter((m) => householdIds.has(m?.householdId));
  const support = Array.isArray(store?.messages) ? store.messages.length : 0;
  const kids = getCanonicalChildren(store, programId);
  const communications = Array.isArray(kids.data?.Communications) ? kids.data.Communications.length : 0;
  return {
    channels: {
      messageSupport: { count: support, source: "store.messages" },
      familyHub: { count: fhMessages.length, source: "store.familyHubMessages" },
      careCommunications: { count: communications, source: "programData.child.Communications" },
    },
    note: "Three channels by design — do not merge. Label clearly in UI.",
  };
}

/**
 * Drift report — read-only. Never deletes or rewrites.
 * safeFixes are recommendations only.
 */
function reportCanonicalDrift(store, programId, deps = {}) {
  const program = getCanonicalProgram(store, programId);
  const children = getCanonicalChildren(store, programId, deps.programOwnership);
  const classrooms = getCanonicalClassrooms(store, programId, deps.scheduleLib);
  const schedule = getCanonicalSchedule(store, programId, deps.scheduleLib);
  const households = getCanonicalHouseholds(store, programId, deps);
  const staff = getCanonicalStaff(store, programId);
  const lessons = getCanonicalLessonCatalog(store);
  const billing = getCanonicalBilling(store, programId);
  const tuitionBilling = getCanonicalTuitionBilling(store, programId);
  const messaging = getCanonicalMessagingInventory(store, programId);

  const childIdSet = new Set(children.children.map((c) => c.id));
  const roomIdSet = new Set(
    classrooms.classrooms.filter((r) => !r.archived).map((r) => r.id),
  );
  const lessonIdSet = new Set(lessons.lessonPlans.map((p) => p.id));

  const missingFromProfiles = [];
  const staleSnapshotNames = [];
  households.households.forEach((h) => {
    (h.childRefs || []).forEach((ref) => {
      if (!childIdSet.has(String(ref.id))) {
        missingFromProfiles.push({ householdId: h.id, childId: String(ref.id) });
      }
      if (ref.snapshotNameOnly) {
        staleSnapshotNames.push({ householdId: h.id, childId: ref.id, snapshotName: ref.name });
      }
    });
  });

  const unknownClassrooms = children.children
    .filter((c) => c.classroomId && roomIdSet.size && !roomIdSet.has(String(c.classroomId)))
    .map((c) => ({ childId: c.id, classroomId: c.classroomId }));

  const orphanProfiles = children.children.filter((c) => c.archived);

  const lessonItems = (schedule.items || []).filter((item) => item && item.type === "lesson_plan" && !item.archived);
  const lessonMissingClassroom = lessonItems
    .filter((item) => item.classroomId && roomIdSet.size && !roomIdSet.has(String(item.classroomId)))
    .map((item) => ({ itemId: item.id, classroomId: item.classroomId, weekStartDate: item.weekStartDate || "" }));
  const lessonMissingCatalog = lessonItems
    .filter((item) => item.lessonPlanId && lessonIdSet.size && !lessonIdSet.has(String(item.lessonPlanId)))
    .map((item) => ({
      itemId: item.id,
      lessonPlanId: item.lessonPlanId,
      note: "Catalog id missing — classroom snapshot may still be valid (intentional copy)",
    }));
  const lessonChildMismatches = [];
  lessonItems.forEach((item) => {
    const ids = Array.isArray(item.childIds) ? item.childIds : [];
    ids.forEach((cid) => {
      if (!childIdSet.has(String(cid))) {
        lessonChildMismatches.push({ itemId: item.id, childId: String(cid), weekStartDate: item.weekStartDate || "" });
      }
    });
  });

  const ownerEmail = program?.ownerEmail || "";
  const ownerUid = store?.users?.[ownerEmail]?.firebaseUid || program?.ownerUid || "";
  const legacyChild = ownerUid ? store?.childData?.[ownerUid] : null;
  const legacySchedule = ownerUid ? store?.scheduleByUser?.[ownerUid] : null;
  const programHasChild = Boolean(store?.programData?.[programId]?.child?.data);
  const programHasSchedule = Boolean(store?.programData?.[programId]?.schedule);

  const legacyMirrors = {
    childDataUidPresent: Boolean(legacyChild?.data),
    scheduleByUserUidPresent: Boolean(legacySchedule),
    childReadWouldUseLegacy: children.source.startsWith("legacy"),
    scheduleReadWouldUseLegacy: schedule.source.startsWith("legacy"),
    note: "Legacy UID mirrors are temporary migration fallbacks — programData is authoritative when present.",
  };

  const staffDrift = {
    membersMissingFromUsers: staff.index.membersMissingFromUsers,
    usersMissingFromMembers: staff.index.usersMissingFromMembers,
  };

  const dailyLogCounts = {
    Meals: Array.isArray(children.data?.Meals) ? children.data.Meals.length : 0,
    Naps: Array.isArray(children.data?.Naps) ? children.data.Naps.length : 0,
    Attendance: Array.isArray(children.data?.Attendance) ? children.data.Attendance.length : 0,
    ActivityLogs: Array.isArray(children.data?.ActivityLogs) ? children.data.ActivityLogs.length : 0,
    Observations: Array.isArray(children.data?.Observations) ? children.data.Observations.length : 0,
    Documents: Array.isArray(children.data?.Documents) ? children.data.Documents.length : 0,
  };

  const orphanDailyLogChildIds = [];
  ["Meals", "Naps", "Attendance", "ActivityLogs", "Observations", "Documents"].forEach((key) => {
    (Array.isArray(children.data?.[key]) ? children.data[key] : []).forEach((row) => {
      const cid = String(row?.childId || "");
      if (cid && !childIdSet.has(cid)) {
        orphanDailyLogChildIds.push({ collection: key, childId: cid, id: row.id || "" });
      }
    });
  });

  const drift = {
    householdChildMissingFromProfiles: missingFromProfiles,
    householdStaleNameSnapshots: staleSnapshotNames,
    childClassroomMissingFromSchedule: unknownClassrooms,
    lessonClassroomMissingFromSchedule: lessonMissingClassroom,
    lessonCatalogIdMissing: lessonMissingCatalog,
    lessonChildMissingFromProfiles: lessonChildMismatches,
    staffIndexDrift: staffDrift,
    orphanDailyLogRows: orphanDailyLogChildIds.slice(0, 50),
    legacyMirrors,
  };

  const blocking = missingFromProfiles.length
    + unknownClassrooms.length
    + lessonMissingClassroom.length
    + lessonChildMismatches.length
    + orphanDailyLogChildIds.length
    + staffDrift.membersMissingFromUsers.length;

  const safeFixesSuggested = [];
  if (staleSnapshotNames.length) {
    safeFixesSuggested.push("Refresh household display names from Profiles (keep childIds; do not delete households).");
  }
  if (staffDrift.usersMissingFromMembers.length) {
    safeFixesSuggested.push("Reconcile programMembers index from users (derived index only).");
  }
  if (legacyMirrors.childDataUidPresent && programHasChild) {
    safeFixesSuggested.push("Legacy childData mirror present alongside programData — safe to leave; prefer program reads.");
  }
  if (legacyMirrors.scheduleByUserUidPresent && programHasSchedule) {
    safeFixesSuggested.push("Legacy scheduleByUser mirror present alongside programData.schedule — prefer program reads.");
  }
  if (missingFromProfiles.length) {
    safeFixesSuggested.push("Report only: household childIds not in Profiles — do not auto-delete; confirm with provider.");
  }

  return {
    programId,
    program,
    counts: {
      children: children.children.length,
      classrooms: classrooms.classrooms.length,
      households: households.households.length,
      staff: staff.staff.length,
      lessonCatalog: lessons.lessonPlans.length,
      lessonAssignments: lessonItems.length,
      dailyLogs: dailyLogCounts,
    },
    sources: {
      children: children.source,
      classrooms: classrooms.source,
      schedule: schedule.source,
      households: households.source,
      staff: staff.source,
      lessonCatalog: lessons.source,
      billing: billing.source,
      tuitionBilling: tuitionBilling.source,
    },
    billing,
    tuitionBilling,
    messaging,
    drift,
    orphanProfilesArchived: orphanProfiles.length,
    safeFixesSuggested,
    ok: blocking === 0,
    readOnly: true,
  };
}

function buildCanonicalProgramBundle(store, programId, deps = {}) {
  const program = getCanonicalProgram(store, programId);
  if (!program) return null;
  const children = getCanonicalChildren(store, programId, deps.programOwnership);
  const classrooms = getCanonicalClassrooms(store, programId, deps.scheduleLib);
  const schedule = getCanonicalSchedule(store, programId, deps.scheduleLib);
  const staff = getCanonicalStaff(store, programId);
  const households = getCanonicalHouseholds(store, programId, deps);
  const drift = reportCanonicalDrift(store, programId, deps);
  return {
    program,
    children: children.children,
    classrooms: classrooms.classrooms,
    scheduleItems: schedule.items,
    staff: staff.staff,
    households: households.households,
    sources: drift.sources,
    drift,
  };
}

/**
 * Plain-language map for ops / completion reports.
 */
function describeCanonicalHomes() {
  return {
    Program: "store.programs[programId]",
    Child: "store.programData[programId].child.data.Profiles",
    Family: "store.familyHouseholds[id] (childIds membership; names from Profiles)",
    Staff: "store.users (filtered by programId / linkedProgramOwnerEmail)",
    Classroom: "store.programData[programId].schedule.classrooms",
    LessonPlanCatalog: "store.siteContent.curriculum.lessonPlans",
    LessonAssignment: "store.programData[programId].schedule.items (type=lesson_plan)",
    WeeklyPlanner: "DERIVED from schedule lesson item snapshot (llhWeeklyPlanner = temporary cache only)",
    DailyLog: "same child blob (Meals, Naps, Attendance, ActivityLogs, …)",
    Observation: "child blob Observations",
    FormsAssigned: "child blob Documents (child/family) + programSettings.staffFormDocuments (staff email → users)",
    FormsLibrary: "system: formGroups/siteContent.forms; provider: programSettings.formTemplates",
    FormsSignatures: "same Document/staffFormDocuments row (signedAt/By/Role, bodyHash, contentVersion, signedSnapshot)",
    FamilyHub: "familyHouseholds + live child blob overlay",
    BillingSaaS: "store.users Stripe/plan fields (LLH subscription — not family tuition)",
    TuitionBilling: "store.tuitionRates / tuitionInvoices / tuitionPayments (provider→family; refs programId+householdId+childIds)",
    MessageSupport: "store.messages",
    FamilyHubMessages: "store.familyHubMessages",
    CareNotes: "child blob Communications",
  };
}

module.exports = {
  getCanonicalProgram,
  getCanonicalChildren,
  getCanonicalClassrooms,
  getCanonicalSchedule,
  getCanonicalStaff,
  getCanonicalHouseholds,
  getCanonicalLessonCatalog,
  getCanonicalBilling,
  getCanonicalTuitionBilling,
  getCanonicalMessagingInventory,
  resolveHouseholdChildRefs,
  reportCanonicalDrift,
  buildCanonicalProgramBundle,
  describeCanonicalHomes,
  emptyChildBlob,
};
