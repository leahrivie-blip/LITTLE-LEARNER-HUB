/**
 * Owner Admin — Testing environment management (Phase 2).
 * TESTING ONLY. Requires HOME_DAYCARE_HUB_TESTING + valid admin token.
 * Does not merge July Testing Lab / foundation org models.
 */
"use strict";

const crypto = require("node:crypto");
const accountAccess = require("../scripts/account-access.js");
const canonicalData = require("./canonical-data.js");

const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const AUDIT_LIMIT = 2000;

const TESTER_STATUSES = Object.freeze({
  INVITED: "invited",
  PENDING: "invitation_pending",
  ACTIVATED: "activated",
  ACTIVE: "active",
  INACTIVE: "inactive",
  TESTING_COMPLETE: "testing_complete",
  DISABLED: "disabled",
  EXPIRED: "expired",
  REVOKED: "revoked",
});

const TESTING_FEATURE_KEYS = Object.freeze([
  "familyHub",
  "forms",
  "billing",
  "director",
  "teacherWorkflow",
  "experimentalDailyWorkflow",
  "multiRole",
  "aiFeatures",
  "fullPlatform",
]);

const GLOBAL_TESTING_FLAG_KEYS = Object.freeze([
  "familyHub",
  "forms",
  "billing",
  "aiFeatures",
  "experimentalDailyWorkflow",
  "newNavigation",
  "ownerTestingAdmin",
]);

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function nowIso() {
  return new Date().toISOString();
}

function cleanText(value, max = 500) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

function ensureCollections(store) {
  store.users = store.users && typeof store.users === "object" ? store.users : {};
  store.programs = store.programs && typeof store.programs === "object" ? store.programs : {};
  store.programData = store.programData && typeof store.programData === "object" ? store.programData : {};
  store.hdhTesterInvites = store.hdhTesterInvites && typeof store.hdhTesterInvites === "object"
    ? store.hdhTesterInvites
    : {};
  store.ownerTestingAudit = Array.isArray(store.ownerTestingAudit) ? store.ownerTestingAudit : [];
  store.siteContent = store.siteContent && typeof store.siteContent === "object" ? store.siteContent : {};
  store.siteContent.featureFlags = store.siteContent.featureFlags && typeof store.siteContent.featureFlags === "object"
    ? store.siteContent.featureFlags
    : {};
  if (!store.siteContent.featureFlags.testingPlatform || typeof store.siteContent.featureFlags.testingPlatform !== "object") {
    store.siteContent.featureFlags.testingPlatform = {
      familyHub: true,
      forms: true,
      billing: false,
      aiFeatures: false,
      experimentalDailyWorkflow: true,
      newNavigation: true,
      ownerTestingAdmin: true,
    };
  }
  return store;
}

function appendAudit(store, entry) {
  ensureCollections(store);
  const row = {
    id: newId("ota"),
    at: nowIso(),
    actorEmail: normalizeEmail(entry.actorEmail || "admin"),
    action: cleanText(entry.action, 80),
    targetEmail: normalizeEmail(entry.targetEmail || ""),
    programId: cleanText(entry.programId || "", 80),
    detail: cleanText(entry.detail || "", 1000),
    meta: entry.meta && typeof entry.meta === "object" ? entry.meta : null,
  };
  store.ownerTestingAudit.unshift(row);
  store.ownerTestingAudit = store.ownerTestingAudit.slice(0, AUDIT_LIMIT);
  return row;
}

function normalizeFeatures(raw = {}) {
  const out = {};
  TESTING_FEATURE_KEYS.forEach((key) => {
    if (typeof raw[key] === "boolean") out[key] = raw[key];
  });
  if (out.fullPlatform) {
    TESTING_FEATURE_KEYS.forEach((key) => {
      if (key !== "fullPlatform") out[key] = true;
    });
  }
  return out;
}

function globalTestingFlags(store) {
  ensureCollections(store);
  const flags = store.siteContent.featureFlags.testingPlatform || {};
  const out = {};
  GLOBAL_TESTING_FLAG_KEYS.forEach((key) => {
    out[key] = flags[key] !== false;
  });
  return out;
}

function inviteExpired(invite, nowMs = Date.now()) {
  const exp = Date.parse(invite?.expiresAt || "");
  if (Number.isFinite(exp)) return exp <= nowMs;
  const created = Date.parse(invite?.invitedAt || "");
  if (!Number.isFinite(created)) return false;
  return created + INVITE_TTL_MS <= nowMs;
}

function publicInvite(invite = {}, { appOrigin = "" } = {}) {
  const token = String(invite.token || "").trim();
  const pending = ["pending", "invited", "invitation_pending"].includes(String(invite.status || "pending")) && token;
  const origin = String(appOrigin || "").replace(/\/$/, "");
  return {
    id: invite.id || "",
    email: invite.email || "",
    name: invite.name || "",
    childName: invite.childName || "Demo Child",
    programName: invite.programName || "",
    programType: invite.programType || "home_daycare",
    role: invite.role || "owner",
    status: invite.status || "pending",
    invitedAt: invite.invitedAt || "",
    acceptedAt: invite.acceptedAt || "",
    expiresAt: invite.expiresAt || "",
    emailSent: Boolean(invite.emailSent),
    emailError: invite.emailError || "",
    testingFocus: Array.isArray(invite.testingFocus) ? invite.testingFocus : [],
    features: invite.features || {},
    notes: invite.notes || "",
    programId: invite.programId || "",
    acceptUrl: pending && origin
      ? `${origin}/?testerInvite=${encodeURIComponent(token)}`
      : "",
  };
}

function deriveTesterStatus(user, invites = []) {
  if (!user && !invites.length) return TESTER_STATUSES.INVITED;
  if (user?.accountStatus === "Disabled" || user?.testingStatus === "disabled") {
    return TESTER_STATUSES.DISABLED;
  }
  if (user?.testingStatus === "testing_complete") return TESTER_STATUSES.TESTING_COMPLETE;
  if (user?.testingStatus === "inactive") return TESTER_STATUSES.INACTIVE;
  const pending = invites.find((i) => i.status === "pending" && !inviteExpired(i));
  if (!user?.testingInviteAcceptedAt && !user?.hdhIndependentTester && pending) {
    return TESTER_STATUSES.PENDING;
  }
  if (user?.hdhIndependentTester || user?.testingInviteAcceptedAt || user?.isTestingAccount) {
    const last = Date.parse(user.lastLoginAt || user.lastSeenAt || "");
    if (Number.isFinite(last) && Date.now() - last < 1000 * 60 * 60 * 24 * 14) {
      return TESTER_STATUSES.ACTIVE;
    }
    return TESTER_STATUSES.ACTIVATED;
  }
  const expired = invites.find((i) => i.status === "expired" || inviteExpired(i));
  if (expired && !user) return TESTER_STATUSES.EXPIRED;
  const revoked = invites.find((i) => i.status === "revoked");
  if (revoked && !user) return TESTER_STATUSES.REVOKED;
  if (pending) return TESTER_STATUSES.PENDING;
  return TESTER_STATUSES.INVITED;
}

function programSummary(store, programId) {
  const program = store.programs?.[programId];
  if (!program) return null;
  const child = store.programData?.[programId]?.child?.data || {};
  const profiles = Array.isArray(child.Profiles) ? child.Profiles.length : 0;
  const staff = Object.values(store.users || {}).filter((u) => (
    u.programId === programId || normalizeEmail(u.linkedProgramOwnerEmail) === normalizeEmail(program.ownerEmail)
  ));
  const owner = store.users?.[normalizeEmail(program.ownerEmail)] || {};
  return {
    id: program.id,
    name: program.name || owner.businessName || owner.daycareName || program.ownerEmail || "Untitled program",
    accountType: program.accountType || owner.accountType || "home_daycare",
    ownerEmail: program.ownerEmail || "",
    ownerName: [owner.firstName, owner.lastName].filter(Boolean).join(" ") || owner.name || program.ownerEmail || "",
    staffCount: staff.length,
    childrenCount: profiles,
    familyHubEnabled: Boolean(owner.testingFeatures?.familyHub !== false),
    billingEnabled: Boolean(owner.testingFeatures?.billing),
    testingCohort: program.testingCohort || owner.testingCohort || "",
    status: program.testingStatus || (owner.accountStatus === "Disabled" ? "disabled" : "active"),
    createdAt: program.createdAt || "",
    lastActivity: program.updatedAt || owner.lastSeenAt || owner.lastLoginAt || "",
    isTestingProgram: Boolean(program.isTestingProgram || owner.hdhIndependentTester || owner.isTestingAccount),
  };
}

function buildTesterRow(store, email, { appOrigin = "" } = {}) {
  const key = normalizeEmail(email);
  const user = store.users?.[key] || null;
  const invites = Object.values(store.hdhTesterInvites || {})
    .filter((invite) => normalizeEmail(invite.email) === key)
    .sort((a, b) => String(b.invitedAt || "").localeCompare(String(a.invitedAt || "")));
  const latestInvite = invites[0] || null;
  const programId = user?.programId || latestInvite?.programId || "";
  const program = programId ? programSummary(store, programId) : null;
  const status = deriveTesterStatus(user, invites);
  const features = {
    ...normalizeFeatures(latestInvite?.features || {}),
    ...normalizeFeatures(user?.testingFeatures || {}),
  };
  if (user?.multiRoleTester) features.multiRole = true;
  const name = user
    ? ([user.firstName, user.lastName].filter(Boolean).join(" ") || user.name || "")
    : (latestInvite?.name || "");
  return {
    email: key,
    name: name || key,
    status,
    role: user?.role || latestInvite?.role || "owner",
    accountType: user?.accountType || latestInvite?.programType || "home_daycare",
    programId: program?.id || "",
    programName: program?.name || latestInvite?.programName || "",
    createdAt: user?.createdAt || latestInvite?.invitedAt || "",
    lastLoginAt: user?.lastLoginAt || user?.lastSeenAt || "",
    activatedAt: user?.testingInviteAcceptedAt || latestInvite?.acceptedAt || "",
    features,
    testingFocus: user?.testingFocus || latestInvite?.testingFocus || [],
    testingCohort: user?.testingCohort || latestInvite?.testingCohort || "",
    notes: user?.testingNotes || latestInvite?.notes || "",
    familyHubEnabled: features.familyHub !== false,
    billingTestEnabled: Boolean(features.billing),
    formsEnabled: features.forms !== false,
    multiRoleTester: Boolean(user?.multiRoleTester || features.multiRole),
    hdhIndependentTester: Boolean(user?.hdhIndependentTester),
    isTestingAccount: Boolean(user?.isTestingAccount || user?.hdhIndependentTester || latestInvite),
    invite: latestInvite ? publicInvite(latestInvite, { appOrigin }) : null,
    invites: invites.map((invite) => publicInvite(invite, { appOrigin })),
  };
}

function listTesters(store, { q = "", status = "", appOrigin = "" } = {}) {
  ensureCollections(store);
  const emails = new Set();
  Object.values(store.hdhTesterInvites || {}).forEach((invite) => {
    if (invite?.email) emails.add(normalizeEmail(invite.email));
  });
  Object.values(store.users || {}).forEach((user) => {
    if (user?.hdhIndependentTester || user?.isTestingAccount || user?.testingInviteAcceptedAt) {
      emails.add(normalizeEmail(user.email));
    }
  });
  let rows = [...emails].filter(Boolean).map((email) => buildTesterRow(store, email, { appOrigin }));
  const query = String(q || "").trim().toLowerCase();
  if (query) {
    rows = rows.filter((row) => (
      row.email.includes(query)
      || row.name.toLowerCase().includes(query)
      || row.programName.toLowerCase().includes(query)
      || row.role.toLowerCase().includes(query)
      || row.accountType.toLowerCase().includes(query)
      || String(row.testingCohort || "").toLowerCase().includes(query)
    ));
  }
  if (status) {
    const want = String(status).trim().toLowerCase();
    rows = rows.filter((row) => row.status === want);
  }
  rows.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  return rows;
}

function listPrograms(store, { q = "", testingOnly = true } = {}) {
  ensureCollections(store);
  let rows = Object.keys(store.programs || {}).map((id) => programSummary(store, id)).filter(Boolean);
  if (testingOnly) {
    rows = rows.filter((row) => row.isTestingProgram || row.accountType);
  }
  const query = String(q || "").trim().toLowerCase();
  if (query) {
    rows = rows.filter((row) => (
      row.name.toLowerCase().includes(query)
      || row.ownerEmail.includes(query)
      || row.accountType.includes(query)
      || String(row.testingCohort || "").toLowerCase().includes(query)
    ));
  }
  rows.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  return rows;
}

function seedDemoChild(programOwnership, store, context, childName, classroomId = "") {
  const now = nowIso();
  const name = cleanText(childName || "Demo Child", 80) || "Demo Child";
  const existing = programOwnership.readProgramChildData(store, context);
  const data = existing?.data && typeof existing.data === "object"
    ? JSON.parse(JSON.stringify(existing.data))
    : programOwnership.emptyChildPayload ? programOwnership.emptyChildPayload() : {
      Profiles: [], Observations: [], SupportPlans: [], Goals: [], Differentiations: [],
      Attendance: [], Meals: [], MealPresets: [], Reports: [], Communications: [],
      Naps: [], Diapers: [], ActivityLogs: [], Photos: [], Documents: [],
    };
  if (!Array.isArray(data.Profiles)) data.Profiles = [];
  if (!data.Profiles.length) {
    data.Profiles.push({
      id: newId("tester-child"),
      name,
      ageGroup: "Toddler",
      classroomId: classroomId || "",
      createdAt: now,
      notes: "Testing starter child — not production data.",
    });
    programOwnership.writeProgramChildData(store, context, data);
  }
  return data.Profiles[0];
}

function seedCenterClassrooms(scheduleLib, store, context, classroomNames = []) {
  if (!scheduleLib || !context?.ok) return [];
  const current = programOwnershipReadScheduleSafe(store, context, scheduleLib);
  const names = (classroomNames.length ? classroomNames : ["Infants", "Toddlers", "Preschool"])
    .map((n) => cleanText(n, 80))
    .filter(Boolean)
    .slice(0, 8);
  const classrooms = names.map((name, idx) => ({
    id: `classroom-${idx + 1}`,
    name,
  }));
  const doc = scheduleLib.normalizeScheduleDocument({
    classrooms: classrooms.length ? classrooms : current.classrooms,
    items: current.items || [],
    updatedAt: nowIso(),
  });
  store.programData[context.programId] = store.programData[context.programId] || { programId: context.programId };
  store.programData[context.programId].schedule = {
    ...doc,
    updatedByEmail: context.actorEmail || "",
    updatedByUid: context.actorUid || "",
  };
  return doc.classrooms;
}

function programOwnershipReadScheduleSafe(store, context, scheduleLib) {
  try {
    return scheduleLib.normalizeScheduleDocument(
      store.programData?.[context.programId]?.schedule || { classrooms: [], items: [] },
    );
  } catch {
    return { classrooms: [{ id: "classroom-main", name: "Main Classroom" }], items: [] };
  }
}

function createTesterInvite(store, body, { actorEmail, appOrigin, programOwnership, scheduleLib, tempPasswordAuth }) {
  ensureCollections(store);
  const email = normalizeEmail(body.email);
  if (!email) throw Object.assign(new Error("Enter the tester's email address."), { status: 400 });
  const name = cleanText(body.name || "", 120);
  const programType = accountAccess.normalizeAccountType(body.programType || body.accountType || "home_daycare");
  const role = accountAccess.normalizeUserRole(body.role || "owner");
  const programMode = String(body.programMode || "new").trim().toLowerCase() === "existing" ? "existing" : "new";
  const programName = cleanText(body.programName || "", 160)
    || (programType === "center" ? "Test Childcare Center" : "Test Home Daycare");
  const features = normalizeFeatures(body.features || {});
  const testingFocus = Array.isArray(body.testingFocus)
    ? body.testingFocus.map((v) => cleanText(v, 60)).filter(Boolean).slice(0, 12)
    : [];
  const notes = cleanText(body.notes || "", 2000);
  const testingCohort = cleanText(body.testingCohort || "", 80);
  const childName = cleanText(body.childName || "Demo Child", 80) || "Demo Child";
  const origin = String(appOrigin || "").replace(/\/$/, "");

  const pending = Object.values(store.hdhTesterInvites).find((invite) => (
    normalizeEmail(invite.email) === email
    && invite.status === "pending"
    && !inviteExpired(invite)
  ));
  if (pending) {
    const err = new Error("That email already has a pending tester invite.");
    err.status = 409;
    err.invite = publicInvite(pending, { appOrigin: origin });
    throw err;
  }

  let programId = cleanText(body.existingProgramId || body.programId || "", 80);
  let ownerEmailForProgram = email;

  if (programMode === "existing") {
    if (!programId || !store.programs[programId]) {
      throw Object.assign(new Error("Select an existing test program."), { status: 400 });
    }
    ownerEmailForProgram = normalizeEmail(store.programs[programId].ownerEmail);
  } else if (role !== "owner") {
    // Create a program owner shell so staff can join a real program.
    const shellToken = crypto.randomBytes(4).toString("hex");
    const ownerShellEmail = normalizeEmail(body.programOwnerEmail)
      || normalizeEmail(`owner+${shellToken}@llh-testing.invalid`);
    const program = programOwnership.ensureProgramForOwner(store, ownerShellEmail, {
      name: programName,
      actorEmail,
    });
    store.programs[program.id].accountType = programType;
    store.programs[program.id].isTestingProgram = true;
    store.programs[program.id].testingCohort = testingCohort;
    store.programs[program.id].name = programName;
    store.users[ownerShellEmail] = {
      ...(store.users[ownerShellEmail] || { email: ownerShellEmail }),
      email: ownerShellEmail,
      role: "owner",
      accountType: programType,
      programId: program.id,
      businessName: programName,
      isTestingAccount: true,
      hdhIndependentTester: true,
      testingFeatures: features,
      plan: "Pro",
      subscriptionStatus: "Pro Subscription Active",
      stripeSubscriptionStatus: "active",
      createdAt: store.users[ownerShellEmail]?.createdAt || nowIso(),
      updatedAt: nowIso(),
    };
    programId = program.id;
    ownerEmailForProgram = ownerShellEmail;
    if (programType === "center" && scheduleLib) {
      const ctx = programOwnership.resolveProgramContext(store, { email: ownerShellEmail, uid: "" });
      seedCenterClassrooms(scheduleLib, store, ctx, body.classrooms || []);
    }
  } else {
    // Owner of a new program — program materializes on accept, but pre-create when activateNow.
    programId = "";
  }

  const token = crypto.randomBytes(24).toString("hex");
  const now = new Date();
  const invite = {
    id: newId("tester-invite"),
    token,
    email,
    name,
    childName,
    programName,
    programType,
    role,
    programMode,
    programId,
    programOwnerEmail: ownerEmailForProgram,
    status: "pending",
    invitedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + INVITE_TTL_MS).toISOString(),
    invitedByEmail: normalizeEmail(actorEmail),
    invitedByAdmin: true,
    emailSent: false,
    features,
    testingFocus,
    testingCohort,
    notes,
    createSampleData: body.createSampleData !== false,
  };
  store.hdhTesterInvites[token] = invite;

  let temporaryPassword = "";
  let activatedUser = null;
  if (body.activateNow === true && tempPasswordAuth) {
    temporaryPassword = tempPasswordAuth.generateTemporaryPassword();
    const passwordHash = tempPasswordAuth.hashPasswordSha256(temporaryPassword);
    const existing = store.users[email] || { email };
    let user = tempPasswordAuth.applyTempPasswordToUser({
      ...existing,
      email,
      name: name || existing.name || "",
      firstName: cleanText(body.firstName || name.split(" ")[0] || "", 60),
      lastName: cleanText(body.lastName || name.split(" ").slice(1).join(" ") || "", 60),
      role,
      accountType: programType,
      businessName: programName,
      daycareName: programName,
      hdhIndependentTester: role === "owner",
      isTestingAccount: true,
      testingInviteAcceptedAt: nowIso(),
      testingFeatures: features,
      testingFocus,
      testingCohort,
      testingNotes: notes,
      multiRoleTester: Boolean(features.multiRole),
      plan: "Pro",
      subscriptionStatus: "Pro Subscription Active",
      stripeSubscriptionStatus: "active",
      accountStatus: "Active",
      createdAt: existing.createdAt || nowIso(),
      updatedAt: nowIso(),
    }, { passwordHash });

    if (role === "owner") {
      const program = programOwnership.ensureProgramForOwner(store, email, {
        name: programName,
        actorEmail,
      });
      store.programs[program.id].accountType = programType;
      store.programs[program.id].isTestingProgram = true;
      store.programs[program.id].testingCohort = testingCohort;
      store.programs[program.id].name = programName;
      user.programId = program.id;
      user.linkedProgramOwnerEmail = "";
      programId = program.id;
      const ctx = programOwnership.resolveProgramContext(store, { email, uid: "" });
      if (invite.createSampleData) {
        if (programType === "center" && scheduleLib) {
          const rooms = seedCenterClassrooms(scheduleLib, store, ctx, body.classrooms || []);
          seedDemoChild(programOwnership, store, ctx, childName, rooms[0]?.id || "");
        } else {
          seedDemoChild(programOwnership, store, ctx, childName);
        }
      }
    } else {
      user.programId = programId;
      user.linkedProgramOwnerEmail = ownerEmailForProgram;
      user.programAccessViaOwner = true;
      if (Array.isArray(body.classroomIds)) {
        user.classroomIds = body.classroomIds.map((id) => cleanText(id, 80)).filter(Boolean).slice(0, 20);
      }
    }

    store.users[email] = user;
    invite.status = "accepted";
    invite.acceptedAt = nowIso();
    invite.programId = programId;
    store.hdhTesterInvites[token] = invite;
    activatedUser = user;
  }

  appendAudit(store, {
    actorEmail,
    action: activatedUser ? "tester_created_activated" : "tester_invited",
    targetEmail: email,
    programId,
    detail: `${name || email} · ${programType} · ${role}`,
    meta: { features, testingFocus, programMode },
  });

  return {
    invite: publicInvite(invite, { appOrigin: origin }),
    acceptUrl: publicInvite(invite, { appOrigin: origin }).acceptUrl,
    temporaryPassword: temporaryPassword || undefined,
    tester: buildTesterRow(store, email, { appOrigin: origin }),
    activated: Boolean(activatedUser),
  };
}

function applyInviteAcceptOverrides(store, invite, identity, programOwnership, scheduleLib) {
  const email = normalizeEmail(identity.email);
  const now = nowIso();
  const programType = accountAccess.normalizeAccountType(invite.programType || "home_daycare");
  const role = accountAccess.normalizeUserRole(invite.role || "owner");
  const programName = cleanText(invite.programName || "", 160)
    || (programType === "center" ? "Test Childcare Center" : "Test Home Daycare");
  const features = normalizeFeatures(invite.features || {});
  const existingUser = store.users?.[email] || { email };
  const base = {
    ...existingUser,
    email,
    name: invite.name || existingUser.name || "",
    role,
    accountType: programType,
    businessName: programName,
    daycareName: programName,
    hdhIndependentTester: role === "owner",
    isTestingAccount: true,
    hdhTesterInvitedByEmail: invite.invitedByEmail || "",
    testingInviteAcceptedAt: now,
    testingFeatures: features,
    testingFocus: invite.testingFocus || [],
    testingCohort: invite.testingCohort || "",
    testingNotes: invite.notes || "",
    multiRoleTester: Boolean(features.multiRole || existingUser.multiRoleTester),
    plan: "Pro",
    subscriptionStatus: "Pro Subscription Active",
    stripeSubscriptionStatus: "active",
    accountStatus: existingUser.accountStatus === "Disabled" ? "Disabled" : "Active",
    updatedAt: now,
  };

  if (role === "owner") {
    base.linkedProgramOwnerEmail = "";
    base.programAccessViaOwner = false;
    store.users[email] = base;
    const program = programOwnership.ensureProgramForOwner(store, email, {
      ownerUid: identity.uid || existingUser.firebaseUid || "",
      name: programName,
      actorEmail: email,
    });
    store.programs[program.id].accountType = programType;
    store.programs[program.id].isTestingProgram = true;
    store.programs[program.id].testingCohort = invite.testingCohort || "";
    store.programs[program.id].name = programName;
    store.users[email].programId = program.id;
    const context = programOwnership.resolveProgramContext(store, identity);
    if (invite.createSampleData !== false) {
      if (programType === "center" && scheduleLib) {
        const rooms = seedCenterClassrooms(scheduleLib, store, context, []);
        seedDemoChild(programOwnership, store, context, invite.childName || "Demo Child", rooms[0]?.id || "");
      } else {
        seedDemoChild(programOwnership, store, context, invite.childName || "Demo Child");
      }
    }
    invite.programId = program.id;
  } else {
    const ownerEmail = normalizeEmail(invite.programOwnerEmail || "");
    const programId = invite.programId || (ownerEmail ? programOwnership.programIdForOwnerEmail?.(ownerEmail) : "");
    if (!programId || !store.programs[programId]) {
      throw Object.assign(new Error("This staff invite is missing a test program. Ask the owner admin to recreate it."), { status: 400 });
    }
    base.programId = programId;
    base.linkedProgramOwnerEmail = normalizeEmail(store.programs[programId].ownerEmail);
    base.programAccessViaOwner = true;
    base.hdhIndependentTester = false;
    store.users[email] = base;
  }

  invite.status = "accepted";
  invite.acceptedAt = now;
  invite.acceptedByUid = identity.uid || "";
  store.hdhTesterInvites[invite.token] = invite;
  appendAudit(store, {
    actorEmail: email,
    action: "tester_activated",
    targetEmail: email,
    programId: store.users[email].programId || "",
    detail: `Accepted invite as ${role} / ${programType}`,
  });
  return store.users[email];
}

function updateTester(store, email, updates, { actorEmail }) {
  ensureCollections(store);
  const key = normalizeEmail(email);
  const user = store.users[key];
  if (!user) throw Object.assign(new Error("Tester account not found. They may still be invited only."), { status: 404 });

  if (typeof updates.role === "string" && updates.role) {
    user.role = accountAccess.normalizeUserRole(updates.role);
  }
  if (typeof updates.accountType === "string" && updates.accountType) {
    user.accountType = accountAccess.normalizeAccountType(updates.accountType);
    if (user.programId && store.programs[user.programId]) {
      store.programs[user.programId].accountType = user.accountType;
    }
  }
  if (updates.features && typeof updates.features === "object") {
    user.testingFeatures = {
      ...(user.testingFeatures || {}),
      ...normalizeFeatures(updates.features),
    };
    if (typeof updates.features.multiRole === "boolean") {
      user.multiRoleTester = updates.features.multiRole;
    }
  }
  if (typeof updates.multiRoleTester === "boolean") {
    user.multiRoleTester = updates.multiRoleTester;
    user.testingFeatures = { ...(user.testingFeatures || {}), multiRole: updates.multiRoleTester };
  }
  if (typeof updates.notes === "string") user.testingNotes = cleanText(updates.notes, 2000);
  if (typeof updates.testingCohort === "string") user.testingCohort = cleanText(updates.testingCohort, 80);
  if (Array.isArray(updates.testingFocus)) {
    user.testingFocus = updates.testingFocus.map((v) => cleanText(v, 60)).filter(Boolean).slice(0, 12);
  }
  if (typeof updates.testingStatus === "string") {
    const allowed = new Set(Object.values(TESTER_STATUSES));
    const next = String(updates.testingStatus).trim().toLowerCase();
    if (allowed.has(next)) user.testingStatus = next;
  }
  if (updates.disable === true) {
    user.accountStatus = "Disabled";
    user.testingStatus = TESTER_STATUSES.DISABLED;
  }
  if (updates.reactivate === true) {
    user.accountStatus = "Active";
    user.testingStatus = TESTER_STATUSES.ACTIVE;
  }
  user.updatedAt = nowIso();
  store.users[key] = user;
  appendAudit(store, {
    actorEmail,
    action: updates.disable ? "tester_disabled"
      : updates.reactivate ? "tester_reactivated"
        : "tester_updated",
    targetEmail: key,
    programId: user.programId || "",
    detail: cleanText(JSON.stringify({
      role: user.role,
      accountType: user.accountType,
      features: user.testingFeatures,
      testingStatus: user.testingStatus,
    }), 900),
  });
  return buildTesterRow(store, key);
}

function resendInvite(store, email, { actorEmail, appOrigin }) {
  ensureCollections(store);
  const key = normalizeEmail(email);
  let match = Object.entries(store.hdhTesterInvites).find(([, invite]) => (
    normalizeEmail(invite.email) === key
    && (invite.status === "pending" || invite.status === "expired" || invite.status === "revoked")
  ));
  // Activated testers: recreate a fresh invite link from the latest invite or user profile.
  if (!match) {
    match = Object.entries(store.hdhTesterInvites).find(([, invite]) => normalizeEmail(invite.email) === key);
  }
  const user = store.users[key];
  if (!match && !user) {
    throw Object.assign(new Error("No invite found to resend. Create a new tester invite instead."), { status: 404 });
  }
  const oldToken = match?.[0];
  const previous = match?.[1] || {};
  if (oldToken) delete store.hdhTesterInvites[oldToken];
  const token = crypto.randomBytes(24).toString("hex");
  const now = new Date();
  const next = {
    ...previous,
    id: previous.id || newId("tester-invite"),
    token,
    email: key,
    name: previous.name || user?.name || "",
    programName: previous.programName || user?.businessName || "",
    programType: previous.programType || user?.accountType || "home_daycare",
    role: previous.role || user?.role || "owner",
    programId: previous.programId || user?.programId || "",
    features: previous.features || user?.testingFeatures || {},
    testingFocus: previous.testingFocus || user?.testingFocus || [],
    testingCohort: previous.testingCohort || user?.testingCohort || "",
    notes: previous.notes || user?.testingNotes || "",
    status: "pending",
    invitedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + INVITE_TTL_MS).toISOString(),
    invitedByEmail: previous.invitedByEmail || normalizeEmail(actorEmail),
    invitedByAdmin: true,
    revokedAt: undefined,
    acceptedAt: undefined,
    resentAt: now.toISOString(),
    resentByEmail: normalizeEmail(actorEmail),
    emailSent: false,
  };
  store.hdhTesterInvites[token] = next;
  appendAudit(store, {
    actorEmail,
    action: "tester_invite_resent",
    targetEmail: key,
    programId: next.programId || "",
    detail: "Invite link regenerated",
  });
  return publicInvite(next, { appOrigin });
}

function resetTesterAccess(store, email, { actorEmail, tempPasswordAuth, mode = "password" }) {
  ensureCollections(store);
  const key = normalizeEmail(email);
  const user = store.users[key];
  if (!user) throw Object.assign(new Error("Tester not found."), { status: 404 });
  if (mode === "data" || mode === "full") {
    // Soft reset: clear sample operational arrays but keep Profiles shell.
    if (user.programId && store.programData?.[user.programId]?.child?.data) {
      const data = store.programData[user.programId].child.data;
      ["Attendance", "Meals", "Naps", "Diapers", "ActivityLogs", "Reports", "Communications", "Photos"].forEach((k) => {
        data[k] = [];
      });
      store.programData[user.programId].child.updatedAt = nowIso();
    }
  }
  let temporaryPassword;
  if (mode === "password" || mode === "full") {
    temporaryPassword = tempPasswordAuth.generateTemporaryPassword();
    const passwordHash = tempPasswordAuth.hashPasswordSha256(temporaryPassword);
    store.users[key] = tempPasswordAuth.applyTempPasswordToUser(user, { passwordHash });
  }
  appendAudit(store, {
    actorEmail,
    action: mode === "data" ? "tester_data_reset" : mode === "full" ? "tester_full_reset" : "tester_access_reset",
    targetEmail: key,
    programId: user.programId || "",
    detail: `Reset mode: ${mode}`,
  });
  return { temporaryPassword, tester: buildTesterRow(store, key) };
}

function setGlobalFlags(store, flags, { actorEmail }) {
  ensureCollections(store);
  const next = { ...store.siteContent.featureFlags.testingPlatform };
  GLOBAL_TESTING_FLAG_KEYS.forEach((key) => {
    if (typeof flags[key] === "boolean") next[key] = flags[key];
  });
  store.siteContent.featureFlags.testingPlatform = next;
  appendAudit(store, {
    actorEmail,
    action: "testing_flags_updated",
    detail: cleanText(JSON.stringify(next), 900),
  });
  return globalTestingFlags(store);
}

function dashboardStats(store) {
  ensureCollections(store);
  const testers = listTesters(store);
  const programs = listPrograms(store, { testingOnly: true });
  const byType = { home_daycare: 0, center: 0, single_provider: 0 };
  const byRole = { owner: 0, director: 0, teacher: 0, assistant: 0 };
  testers.forEach((t) => {
    if (byType[t.accountType] != null) byType[t.accountType] += 1;
    if (byRole[t.role] != null) byRole[t.role] += 1;
  });
  const homeDaycares = programs.filter((p) => p.accountType === "home_daycare" || p.accountType === "single_provider").length;
  const centers = programs.filter((p) => p.accountType === "center").length;
  const children = programs.reduce((sum, p) => sum + (p.childrenCount || 0), 0);
  const staff = programs.reduce((sum, p) => sum + (p.staffCount || 0), 0);
  const households = Object.values(store.familyHouseholds || {});
  const forms = Object.values(store.formPackets || {}).length;
  const messages = Array.isArray(store.familyHubMessages) ? store.familyHubMessages.length : 0;
  const feedback = (Array.isArray(store.feedbackItems) ? store.feedbackItems : [])
    .filter((item) => item?.context?.testingSite || item?.testingOnly || String(item?.source || "").includes("testing"));
  const openFeedback = feedback.filter((item) => !["Resolved", "Completed", "Archived", "Won't Change"].includes(item.status)).length;
  const recentSignups = Object.values(store.users || {})
    .filter((u) => u?.isTestingAccount || u?.hdhIndependentTester || u?.testingInviteAcceptedAt)
    .sort((a, b) => String(b.createdAt || b.testingInviteAcceptedAt || "").localeCompare(String(a.createdAt || a.testingInviteAcceptedAt || "")))
    .slice(0, 8)
    .map((u) => ({
      email: u.email,
      name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.name || u.email,
      role: u.role || "owner",
      accountType: u.accountType || "home_daycare",
      at: u.createdAt || u.testingInviteAcceptedAt || "",
    }));
  const flags = globalTestingFlags(store);
  return {
    environment: "TESTING",
    totalPrograms: programs.length,
    homeDaycares,
    centers,
    totalTesters: testers.length,
    activeTesters: testers.filter((t) => t.status === "active" || t.status === "activated").length,
    pendingInvites: testers.filter((t) => ["invitation_pending", "invited", "pending"].includes(t.status)).length,
    disabledTesters: testers.filter((t) => t.status === "disabled").length,
    programs: programs.length,
    byType,
    byRole,
    children,
    totalChildren: children,
    families: households.length,
    totalFamilies: households.length,
    staff,
    totalStaff: staff,
    forms,
    messages,
    openFeedback,
    recentSignups,
    featureFlags: flags,
    recentAudit: store.ownerTestingAudit.slice(0, 12),
    systemHealth: {
      testingFence: true,
      ownerTestingAdmin: flags.ownerTestingAdmin !== false,
      familyHub: flags.familyHub !== false,
      forms: flags.forms !== false,
      billingTest: flags.billing === true,
      aiFeatures: flags.aiFeatures === true,
      emailConfigured: null, // filled by API handler when available
      status: "ok",
    },
  };
}

async function sendTesterInviteEmail({ sendEmail, supportEmailConfigStatus, invite, acceptUrl, actorEmail }) {
  const status = typeof supportEmailConfigStatus === "function" ? supportEmailConfigStatus() : { ready: false };
  if (!status?.ready || typeof sendEmail !== "function") {
    return { sent: false, configured: Boolean(status?.ready), skipped: true };
  }
  try {
    const result = await sendEmail({
      to: invite.email,
      replyTo: actorEmail || undefined,
      subject: "You're invited to test Little Learner Hub (TESTING)",
      text: [
        `Hi${invite.name ? ` ${invite.name}` : ""},`,
        "",
        "You are invited to the Little Learner Hub TESTING environment (not production).",
        `Program: ${invite.programName || "Test program"}`,
        `Role: ${invite.role || "owner"}`,
        `Type: ${invite.programType || "home_daycare"}`,
        "",
        "Accept your invite:",
        acceptUrl,
        "",
        `This invite expires on ${String(invite.expiresAt || "").slice(0, 10)}.`,
        "",
        "— Little Learner Hub Testing",
      ].join("\n"),
      html: `
        <p>Hi${invite.name ? ` ${String(invite.name).replace(/</g, "")}` : ""},</p>
        <p>You are invited to the <strong>Little Learner Hub TESTING</strong> environment (not production).</p>
        <p>Program: <strong>${String(invite.programName || "Test program").replace(/</g, "")}</strong><br/>
        Role: <strong>${String(invite.role || "owner").replace(/</g, "")}</strong><br/>
        Type: <strong>${String(invite.programType || "home_daycare").replace(/</g, "")}</strong></p>
        <p><a href="${String(acceptUrl).replace(/"/g, "")}">Accept your invite</a></p>
        <p>This invite expires on ${String(invite.expiresAt || "").slice(0, 10)}.</p>
        <p>— Little Learner Hub Testing</p>
      `,
    });
    return { sent: Boolean(result?.sent), configured: true, error: result?.error || "" };
  } catch (error) {
    return { sent: false, configured: true, error: error.message || "email_failed" };
  }
}

function createOwnerTestingAdminApi(deps) {
  const {
    isTestingEnabled,
    validAdminToken,
    extractAdminToken,
    extractAdminTokenFromBody,
    readStore,
    peekStore,
    respondAfterPersist,
    jsonResponse,
    readJson,
    programOwnership,
    scheduleLib,
    tempPasswordAuth,
    siteUrl,
    sendEmail,
    supportEmailConfigStatus,
  } = deps;

  function requireTestingAdmin(request, response, url, body = {}) {
    if (!isTestingEnabled()) {
      jsonResponse(response, 404, { error: "Owner testing admin is only available on the testing site." });
      return null;
    }
    const token = extractAdminToken(request, url)
      || extractAdminTokenFromBody(request, body)
      || "";
    if (!validAdminToken(token)) {
      jsonResponse(response, 401, { error: "Admin access is required." });
      return null;
    }
    return token;
  }

  function appOriginFrom(request, body = {}) {
    // Owner Testing Admin is testing-only — never emit production invite hosts.
    const testingDefault = "https://little-learner-hub-testing.onrender.com";
    const blockedHosts = new Set([
      "littlelearnershubbyleah.com",
      "www.littlelearnershubbyleah.com",
      "little-learner-hub.onrender.com",
    ]);
    const normalize = (raw) => {
      const value = String(raw || "").trim();
      if (!value) return "";
      try {
        return new URL(value).origin;
      } catch {
        return value.replace(/\/$/, "");
      }
    };
    try {
      let origin = normalize(body.appOrigin)
        || normalize(request.headers.origin)
        || (request.headers.referer ? normalize(new URL(String(request.headers.referer)).origin) : "")
        || normalize(siteUrl)
        || testingDefault;
      const host = new URL(origin).hostname.toLowerCase();
      if (blockedHosts.has(host)) {
        origin = normalize(siteUrl) || testingDefault;
        if (blockedHosts.has(new URL(origin).hostname.toLowerCase())) {
          origin = testingDefault;
        }
      }
      return origin.replace(/\/$/, "");
    } catch {
      return normalize(siteUrl) || testingDefault;
    }
  }

  async function handleDashboard(request, response, url) {
    if (!requireTestingAdmin(request, response, url)) return;
    const store = ensureCollections(peekStore());
    const dashboard = dashboardStats(store);
    const emailStatus = typeof supportEmailConfigStatus === "function" ? supportEmailConfigStatus() : { ready: false };
    dashboard.systemHealth.emailConfigured = Boolean(emailStatus?.ready);
    dashboard.systemHealth.status = dashboard.systemHealth.ownerTestingAdmin === false ? "attention" : "ok";
    dashboard.emailDeliveryReady = Boolean(emailStatus?.ready);
    jsonResponse(response, 200, { ok: true, testingOnly: true, dashboard });
  }

  async function handleListTesters(request, response, url) {
    if (!requireTestingAdmin(request, response, url)) return;
    const store = ensureCollections(peekStore());
    const appOrigin = appOriginFrom(request);
    const testers = listTesters(store, {
      q: url.searchParams.get("q") || "",
      status: url.searchParams.get("status") || "",
      appOrigin,
    });
    jsonResponse(response, 200, { ok: true, testingOnly: true, testers });
  }

  async function handleGetTester(request, response, url, emailParam) {
    if (!requireTestingAdmin(request, response, url)) return;
    const store = ensureCollections(peekStore());
    const email = normalizeEmail(emailParam || url.searchParams.get("email"));
    if (!email) {
      jsonResponse(response, 400, { error: "email is required." });
      return;
    }
    const tester = buildTesterRow(store, email, { appOrigin: appOriginFrom(request) });
    if (!tester.isTestingAccount && !tester.invite) {
      jsonResponse(response, 404, { error: "Tester not found." });
      return;
    }
    jsonResponse(response, 200, {
      ok: true,
      testingOnly: true,
      tester,
      program: tester.programId ? programSummary(store, tester.programId) : null,
      audit: store.ownerTestingAudit.filter((row) => normalizeEmail(row.targetEmail) === email).slice(0, 50),
    });
  }

  async function handleCreateTester(request, response, url) {
    let body;
    try {
      body = await readJson(request);
    } catch {
      jsonResponse(response, 400, { error: "Invalid payload." });
      return;
    }
    if (!requireTestingAdmin(request, response, url, body)) return;
    const store = ensureCollections(readStore());
    try {
      const result = createTesterInvite(store, body, {
        actorEmail: body.adminEmail || "admin",
        appOrigin: appOriginFrom(request, body),
        programOwnership,
        scheduleLib,
        tempPasswordAuth,
      });
      const acceptUrl = result.acceptUrl || result.invite?.acceptUrl || "";
      let emailResult = { sent: false, configured: false };
      if (acceptUrl && body.sendEmail !== false) {
        emailResult = await sendTesterInviteEmail({
          sendEmail,
          supportEmailConfigStatus,
          invite: result.invite,
          acceptUrl,
          actorEmail: body.adminEmail || "admin",
        });
        if (result.invite?.id) {
          const token = Object.keys(store.hdhTesterInvites).find((key) => store.hdhTesterInvites[key]?.id === result.invite.id);
          if (token) {
            store.hdhTesterInvites[token].emailSent = Boolean(emailResult.sent);
            store.hdhTesterInvites[token].emailError = emailResult.error || "";
            result.invite.emailSent = Boolean(emailResult.sent);
          }
        }
      }
      const message = result.activated
        ? "Tester created and activated. Copy the temporary password now — it will not be shown again."
        : (emailResult.sent
          ? "Tester invite created and email sent."
          : "Tester invite created. Copy the invite link (email may be off on testing).");
      await respondAfterPersist(store, response, 200, {
        ok: true,
        testingOnly: true,
        ...result,
        email: emailResult,
        message,
      }, "Could not create tester.");
    } catch (error) {
      jsonResponse(response, error.status || 400, {
        error: error.message || "Could not create tester.",
        invite: error.invite || undefined,
      });
    }
  }

  async function handleUpdateTester(request, response, url, emailParam) {
    let body;
    try {
      body = await readJson(request);
    } catch {
      jsonResponse(response, 400, { error: "Invalid payload." });
      return;
    }
    if (!requireTestingAdmin(request, response, url, body)) return;
    const store = ensureCollections(readStore());
    try {
      const tester = updateTester(store, emailParam, body, {
        actorEmail: body.adminEmail || "admin",
      });
      await respondAfterPersist(store, response, 200, { ok: true, testingOnly: true, tester }, "Could not update tester.");
    } catch (error) {
      jsonResponse(response, error.status || 400, { error: error.message || "Could not update tester." });
    }
  }

  async function handleResend(request, response, url, emailParam) {
    let body = {};
    try {
      body = await readJson(request);
    } catch {
      body = {};
    }
    if (!requireTestingAdmin(request, response, url, body)) return;
    const store = ensureCollections(readStore());
    try {
      const invite = resendInvite(store, emailParam, {
        actorEmail: body.adminEmail || "admin",
        appOrigin: appOriginFrom(request, body),
      });
      let emailResult = { sent: false, configured: false };
      if (invite.acceptUrl && body.sendEmail !== false) {
        emailResult = await sendTesterInviteEmail({
          sendEmail,
          supportEmailConfigStatus,
          invite,
          acceptUrl: invite.acceptUrl,
          actorEmail: body.adminEmail || "admin",
        });
        const token = Object.keys(store.hdhTesterInvites).find((key) => store.hdhTesterInvites[key]?.token === invite.token || store.hdhTesterInvites[key]?.id === invite.id);
        if (token) {
          store.hdhTesterInvites[token].emailSent = Boolean(emailResult.sent);
          store.hdhTesterInvites[token].emailError = emailResult.error || "";
          invite.emailSent = Boolean(emailResult.sent);
        }
      }
      await respondAfterPersist(store, response, 200, {
        ok: true,
        testingOnly: true,
        invite,
        acceptUrl: invite.acceptUrl,
        email: emailResult,
        message: emailResult.sent
          ? "Invite regenerated and email sent."
          : "Invite link regenerated. Share it manually if email is off.",
      }, "Could not resend invite.");
    } catch (error) {
      jsonResponse(response, error.status || 400, { error: error.message || "Could not resend invite." });
    }
  }

  async function handleResetAccess(request, response, url, emailParam) {
    let body = {};
    try {
      body = await readJson(request);
    } catch {
      body = {};
    }
    if (!requireTestingAdmin(request, response, url, body)) return;
    const store = ensureCollections(readStore());
    try {
      const result = resetTesterAccess(store, emailParam, {
        actorEmail: body.adminEmail || "admin",
        tempPasswordAuth,
        mode: body.mode || "password",
      });
      await respondAfterPersist(store, response, 200, {
        ok: true,
        testingOnly: true,
        ...result,
        message: result.temporaryPassword
          ? "Access reset. Copy the temporary password now — it will not be shown again."
          : "Tester demo care data cleared (profiles kept).",
      }, "Could not reset tester access.");
    } catch (error) {
      jsonResponse(response, error.status || 400, { error: error.message || "Could not reset access." });
    }
  }

  async function handleArchiveTester(request, response, url, emailParam) {
    let body = {};
    try {
      body = await readJson(request);
    } catch {
      body = {};
    }
    if (!requireTestingAdmin(request, response, url, body)) return;
    const store = ensureCollections(readStore());
    const key = normalizeEmail(emailParam);
    // Soft-remove: disable + mark testing complete; revoke pending invites. Never hard-delete by default.
    Object.entries(store.hdhTesterInvites).forEach(([token, invite]) => {
      if (normalizeEmail(invite.email) === key && invite.status === "pending") {
        invite.status = "revoked";
        invite.revokedAt = nowIso();
        store.hdhTesterInvites[token] = invite;
      }
    });
    if (store.users[key]) {
      store.users[key].accountStatus = "Disabled";
      store.users[key].testingStatus = TESTER_STATUSES.TESTING_COMPLETE;
      store.users[key].updatedAt = nowIso();
    }
    appendAudit(store, {
      actorEmail: body.adminEmail || "admin",
      action: "tester_archived",
      targetEmail: key,
      detail: "Disabled + testing_complete; pending invites revoked. No hard delete.",
    });
    await respondAfterPersist(store, response, 200, {
      ok: true,
      testingOnly: true,
      tester: buildTesterRow(store, key, { appOrigin: appOriginFrom(request, body) }),
      message: "Tester archived (disabled). Data kept for audit — not permanently deleted.",
    }, "Could not archive tester.");
  }

  async function handleListPrograms(request, response, url) {
    if (!requireTestingAdmin(request, response, url)) return;
    const store = ensureCollections(peekStore());
    jsonResponse(response, 200, {
      ok: true,
      testingOnly: true,
      programs: listPrograms(store, { q: url.searchParams.get("q") || "" }),
    });
  }

  async function handleGetProgram(request, response, url, programId) {
    if (!requireTestingAdmin(request, response, url)) return;
    const store = ensureCollections(peekStore());
    const program = programSummary(store, programId);
    if (!program) {
      jsonResponse(response, 404, { error: "Program not found." });
      return;
    }
    // Phase 4: Owner Admin program detail reads through canonical adapters.
    const bundle = canonicalData.buildCanonicalProgramBundle(store, programId, {
      programOwnership,
      scheduleLib,
    });
    const users = (bundle?.staff || []).map((u) => {
      const raw = store.users?.[u.email] || {};
      return {
        email: u.email,
        name: u.name,
        role: u.role || "owner",
        accountType: raw.accountType || program.accountType,
        status: u.accountStatus || "Active",
        testingFeatures: raw.testingFeatures || {},
        lastLoginAt: raw.lastLoginAt || raw.lastSeenAt || "",
      };
    });
    const children = bundle?.children || [];
    const classrooms = bundle?.classrooms || [];
    const households = (bundle?.households || []).map((h) => {
      const raw = store.familyHouseholds?.[h.id] || {};
      let magicUrl = raw.magicUrl || "";
      if (!magicUrl && (h.magicToken || raw.magicToken)) {
        const token = h.magicToken || raw.magicToken;
        const origin = String(siteUrl || "").replace(/\/$/, "") || "";
        magicUrl = origin ? `${origin}/?familyHub=${encodeURIComponent(token)}` : `/?familyHub=${encodeURIComponent(token)}`;
      }
      return {
        id: h.id,
        label: h.label,
        email: h.email || "",
        status: h.status || "active",
        childIds: h.childIds || [],
        childNames: h.childNames || [],
        magicUrl,
        magicToken: h.magicToken || raw.magicToken || "",
        acceptedAt: raw.acceptedAt || "",
        createdAt: raw.createdAt || "",
      };
    });
    const ownerEmail = normalizeEmail(program.ownerEmail);
    const owner = store.users?.[ownerEmail] || {};
    jsonResponse(response, 200, {
      ok: true,
      testingOnly: true,
      program,
      users,
      children,
      classrooms,
      households,
      canonical: {
        sources: bundle?.sources || {},
        drift: bundle?.drift || null,
      },
      features: {
        global: globalTestingFlags(store),
        owner: normalizeFeatures(owner.testingFeatures || {}),
      },
      activity: store.ownerTestingAudit
        .filter((row) => row.programId === programId || users.some((u) => normalizeEmail(u.email) === normalizeEmail(row.targetEmail)))
        .slice(0, 40),
    });
  }

  async function handleCanonicalDrift(request, response, url) {
    if (!requireTestingAdmin(request, response, url)) return;
    const store = ensureCollections(peekStore());
    const programId = String(url.searchParams.get("programId") || "").trim();
    if (!programId) {
      jsonResponse(response, 400, { error: "programId is required." });
      return;
    }
    if (!store.programs?.[programId]) {
      jsonResponse(response, 404, { error: "Program not found." });
      return;
    }
    const report = canonicalData.reportCanonicalDrift(store, programId, {
      programOwnership,
      scheduleLib,
    });
    jsonResponse(response, 200, {
      ok: true,
      testingOnly: true,
      readOnly: true,
      homes: canonicalData.describeCanonicalHomes(),
      report,
    });
  }

  async function handleCreateProgram(request, response, url) {
    let body = {};
    try {
      body = await readJson(request);
    } catch {
      body = {};
    }
    if (!requireTestingAdmin(request, response, url, body)) return;
    const store = ensureCollections(readStore());
    const programType = accountAccess.normalizeAccountType(body.programType || body.accountType || "home_daycare");
    const programName = cleanText(body.programName || body.name || "", 160)
      || (programType === "center" ? "Test Childcare Center" : "Test Home Daycare");
    const shellToken = crypto.randomBytes(4).toString("hex");
    const ownerEmail = normalizeEmail(body.ownerEmail)
      || normalizeEmail(`program-owner+${shellToken}@llh-testing.invalid`);
    const program = programOwnership.ensureProgramForOwner(store, ownerEmail, {
      name: programName,
      actorEmail: body.adminEmail || "admin",
    });
    store.programs[program.id].accountType = programType;
    store.programs[program.id].isTestingProgram = true;
    store.programs[program.id].testingCohort = cleanText(body.testingCohort || "", 80);
    store.programs[program.id].name = programName;
    store.users[ownerEmail] = {
      ...(store.users[ownerEmail] || { email: ownerEmail }),
      email: ownerEmail,
      role: "owner",
      accountType: programType,
      programId: program.id,
      businessName: programName,
      isTestingAccount: true,
      hdhIndependentTester: true,
      plan: "Pro",
      subscriptionStatus: "Pro Subscription Active",
      stripeSubscriptionStatus: "active",
      createdAt: store.users[ownerEmail]?.createdAt || nowIso(),
      updatedAt: nowIso(),
    };
    const ctx = programOwnership.resolveProgramContext(store, { email: ownerEmail, uid: "" });
    if (programType === "center" && scheduleLib) {
      seedCenterClassrooms(scheduleLib, store, ctx, body.classrooms || []);
    }
    if (body.createSampleData !== false) {
      seedDemoChild(programOwnership, store, ctx, body.childName || "Demo Child");
    }
    appendAudit(store, {
      actorEmail: body.adminEmail || "admin",
      action: "program_created",
      targetEmail: ownerEmail,
      programId: program.id,
      detail: `${programName} · ${programType}`,
    });
    await respondAfterPersist(store, response, 200, {
      ok: true,
      testingOnly: true,
      program: programSummary(store, program.id),
      message: "Test program created.",
    }, "Could not create program.");
  }

  async function handleFeedbackList(request, response, url) {
    if (!requireTestingAdmin(request, response, url)) return;
    const store = ensureCollections(peekStore());
    const status = String(url.searchParams.get("status") || "").trim();
    const q = String(url.searchParams.get("q") || "").trim().toLowerCase();
    let items = (Array.isArray(store.feedbackItems) ? store.feedbackItems : [])
      .filter((item) => item?.context?.testingSite || item?.testingOnly || String(item?.source || "").includes("testing")
        || String(item?.type || "").toLowerCase().includes("test"));
    // If none tagged yet, still show recent feedback while on testing host so Leah has an inbox.
    if (!items.length) {
      items = (Array.isArray(store.feedbackItems) ? store.feedbackItems : []).slice(0, 100);
    }
    if (status) items = items.filter((item) => String(item.status || "").toLowerCase() === status.toLowerCase());
    if (q) {
      items = items.filter((item) => (
        String(item.message || "").toLowerCase().includes(q)
        || String(item.email || "").toLowerCase().includes(q)
        || String(item.type || "").toLowerCase().includes(q)
        || String(item.page || "").toLowerCase().includes(q)
      ));
    }
    jsonResponse(response, 200, {
      ok: true,
      testingOnly: true,
      feedback: items.slice(0, 200).map((item) => ({
        id: item.id,
        type: item.type,
        status: item.status || "New",
        message: item.message,
        email: item.email,
        name: item.name,
        page: item.page || item.context?.page || "",
        role: item.role || item.testedRole || item.context?.currentRole || "",
        accountType: item.accountType || "",
        createdAt: item.createdAt,
        device: item.deviceInfo || item.context?.deviceClass || "",
        severity: item.sentiment || "",
      })),
    });
  }

  async function handleFeedbackUpdate(request, response, url, feedbackId) {
    let body = {};
    try {
      body = await readJson(request);
    } catch {
      body = {};
    }
    if (!requireTestingAdmin(request, response, url, body)) return;
    const store = ensureCollections(readStore());
    const items = Array.isArray(store.feedbackItems) ? store.feedbackItems : [];
    const idx = items.findIndex((item) => item.id === feedbackId);
    if (idx < 0) {
      jsonResponse(response, 404, { error: "Feedback not found." });
      return;
    }
    if (body.status) items[idx].status = cleanText(body.status, 40);
    if (typeof body.adminNote === "string" && body.adminNote.trim()) {
      items[idx].adminNotes = Array.isArray(items[idx].adminNotes) ? items[idx].adminNotes : [];
      items[idx].adminNotes.unshift({
        at: nowIso(),
        by: body.adminEmail || "admin",
        note: cleanText(body.adminNote, 2000),
      });
    }
    items[idx].updatedAt = nowIso();
    store.feedbackItems = items;
    appendAudit(store, {
      actorEmail: body.adminEmail || "admin",
      action: "testing_feedback_updated",
      detail: `${feedbackId} → ${items[idx].status}`,
    });
    await respondAfterPersist(store, response, 200, { ok: true, feedback: items[idx] }, "Could not update feedback.");
  }

  async function handleFlagsGet(request, response, url) {
    if (!requireTestingAdmin(request, response, url)) return;
    const store = ensureCollections(peekStore());
    const global = globalTestingFlags(store);
    const testers = listTesters(store).map((t) => ({
      email: t.email,
      name: t.name,
      features: t.features,
    }));
    jsonResponse(response, 200, {
      ok: true,
      testingOnly: true,
      productionUnaffected: true,
      global,
      testers,
    });
  }

  async function handleFlagsPut(request, response, url) {
    let body;
    try {
      body = await readJson(request);
    } catch {
      jsonResponse(response, 400, { error: "Invalid payload." });
      return;
    }
    if (!requireTestingAdmin(request, response, url, body)) return;
    const store = ensureCollections(readStore());
    const global = setGlobalFlags(store, body.flags || body, { actorEmail: body.adminEmail || "admin" });
    await respondAfterPersist(store, response, 200, {
      ok: true,
      testingOnly: true,
      productionUnaffected: true,
      global,
    }, "Could not save feature flags.");
  }

  async function handleAuditList(request, response, url) {
    if (!requireTestingAdmin(request, response, url)) return;
    const store = ensureCollections(peekStore());
    const q = String(url.searchParams.get("q") || "").trim().toLowerCase();
    let rows = store.ownerTestingAudit.slice();
    if (q) {
      rows = rows.filter((row) => (
        row.action.includes(q)
        || row.targetEmail.includes(q)
        || row.actorEmail.includes(q)
        || String(row.detail || "").toLowerCase().includes(q)
      ));
    }
    jsonResponse(response, 200, { ok: true, testingOnly: true, audit: rows.slice(0, 200) });
  }

  async function handleViewAsLog(request, response, url) {
    let body = {};
    try {
      body = await readJson(request);
    } catch {
      body = {};
    }
    if (!requireTestingAdmin(request, response, url, body)) return;
    const store = ensureCollections(readStore());
    const entry = appendAudit(store, {
      actorEmail: body.adminEmail || "admin",
      action: body.action || "view_as_started",
      targetEmail: body.targetEmail || "",
      programId: body.programId || "",
      detail: cleanText(body.detail || body.role || "", 200),
      meta: { role: body.role || "", mode: body.mode || "preview" },
    });
    await respondAfterPersist(store, response, 200, { ok: true, entry }, "Could not record View As audit.");
  }

  function matchRoute(method, pathname, url) {
    const path = String(pathname || "");
    if (!path.startsWith("/api/admin/testing")) return null;
    if (method === "GET" && path === "/api/admin/testing/dashboard") return (req, res) => handleDashboard(req, res, url);
    if (method === "GET" && path === "/api/admin/testing/testers") return (req, res) => handleListTesters(req, res, url);
    if (method === "POST" && path === "/api/admin/testing/testers") return (req, res) => handleCreateTester(req, res, url);
    if (method === "GET" && path.startsWith("/api/admin/testing/testers/")) {
      const email = decodeURIComponent(path.slice("/api/admin/testing/testers/".length).split("/")[0]);
      return (req, res) => handleGetTester(req, res, url, email);
    }
    if (method === "PATCH" && path.startsWith("/api/admin/testing/testers/")) {
      const parts = path.slice("/api/admin/testing/testers/".length).split("/");
      const email = decodeURIComponent(parts[0] || "");
      if (parts[1] === "resend") return (req, res) => handleResend(req, res, url, email);
      if (parts[1] === "reset-access") return (req, res) => handleResetAccess(req, res, url, email);
      if (parts[1] === "archive") return (req, res) => handleArchiveTester(req, res, url, email);
      return (req, res) => handleUpdateTester(req, res, url, email);
    }
    if (method === "GET" && path === "/api/admin/testing/programs") return (req, res) => handleListPrograms(req, res, url);
    if (method === "POST" && path === "/api/admin/testing/programs") return (req, res) => handleCreateProgram(req, res, url);
    if (method === "GET" && path === "/api/admin/testing/canonical-drift") return (req, res) => handleCanonicalDrift(req, res, url);
    if (method === "GET" && path.startsWith("/api/admin/testing/programs/")) {
      const id = decodeURIComponent(path.slice("/api/admin/testing/programs/".length).split("/")[0]);
      return (req, res) => handleGetProgram(req, res, url, id);
    }
    if (method === "GET" && path === "/api/admin/testing/feedback") return (req, res) => handleFeedbackList(req, res, url);
    if (method === "PATCH" && path.startsWith("/api/admin/testing/feedback/")) {
      const id = decodeURIComponent(path.slice("/api/admin/testing/feedback/".length).split("/")[0]);
      return (req, res) => handleFeedbackUpdate(req, res, url, id);
    }
    if (method === "GET" && path === "/api/admin/testing/flags") return (req, res) => handleFlagsGet(req, res, url);
    if (method === "PUT" && path === "/api/admin/testing/flags") return (req, res) => handleFlagsPut(req, res, url);
    if (method === "GET" && path === "/api/admin/testing/audit") return (req, res) => handleAuditList(req, res, url);
    if (method === "POST" && path === "/api/admin/testing/view-as-log") return (req, res) => handleViewAsLog(req, res, url);
    return null;
  }

  return {
    matchRoute,
    ensureCollections,
    applyInviteAcceptOverrides,
    appendAudit,
    listTesters,
    buildTesterRow,
    globalTestingFlags,
    TESTING_FEATURE_KEYS,
    GLOBAL_TESTING_FLAG_KEYS,
    TESTER_STATUSES,
  };
}

module.exports = {
  createOwnerTestingAdminApi,
  ensureCollections,
  appendAudit,
  listTesters,
  buildTesterRow,
  globalTestingFlags,
  normalizeFeatures,
  TESTING_FEATURE_KEYS,
  GLOBAL_TESTING_FLAG_KEYS,
  TESTER_STATUSES,
};
