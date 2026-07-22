/**
 * Phase 9 Family Hub API — testing preview only.
 * Mounted at /api/family-hub/*.
 *
 * Gate (also enforced by expansion-feature-flags):
 * - Non-production host
 * - ALLOW_FAMILY_HUB_TESTING_PREVIEW
 * - stored familyHub=true
 * - Authenticated fake guardian member session
 * - Active verified child relationship + child-specific access
 *
 * Production always rejects. No email/SMS/push/Stripe/live AI.
 * Phase 10 adds family-visible updates, Daily Reports, media (authenticated only).
 * Full messaging/notifications deferred to Phase 11.
 */

const foundation = require("../scripts/foundation-data-model.js");
const expansionFlags = require("../scripts/expansion-feature-flags.js");
const familyModel = require("../scripts/family-foundation-data-model.js");
const hub = require("../scripts/family-hub-data-model.js");
const fixtures = require("../scripts/family-hub-fixtures.js");
const updatesModel = require("../scripts/family-updates-data-model.js");
const updatesFixtures = require("../scripts/family-updates-fixtures.js");
const messagingModel = require("../scripts/family-messaging-data-model.js");
const messagingFixtures = require("../scripts/family-messaging-fixtures.js");
const enrollmentFixtures = require("../scripts/enrollment-fixtures.js");
const recordsFixtures = require("../scripts/records-center-fixtures.js");
const licensingFixtures = require("../scripts/licensing-center-fixtures.js");
const licensingModel = require("../scripts/licensing-center-data-model.js");
const todayHubModel = require("../scripts/today-hub-data-model.js");
const todayHubFixtures = require("../scripts/today-hub-fixtures.js");
const billingModel = require("../scripts/billing-simulator-data-model.js");
const billingFixtures = require("../scripts/billing-simulator-fixtures.js");
const { createFamilyHubMessagingHandlers } = require("./family-hub-messaging-handlers.js");
const { createFamilyHubEnrollmentHandlers } = require("./family-hub-enrollment-handlers.js");
const { createFamilyHubRecordsHandlers } = require("./family-hub-records-handlers.js");
const formsModel = require("../scripts/forms-center-data-model.js");
const responsesModel = require("../scripts/form-responses-data-model.js");
const { buildRecipientPayload } = require("../scripts/form-recipient-payload.js");
const documentSnapshot = require("../scripts/form-document-snapshot.js");
const orgPermissions = require("../scripts/org-permissions.js");
const tempPasswordAuth = require("./temp-password-auth.js");

const PRODUCTION_HOST = "littlelearnershubbyleah.com";
const TESTING_BANNER = "Testing Account — Fake Data Only.";

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

function safeLower(value) {
  return String(value || "").trim().toLowerCase();
}

function getHeader(request, name) {
  const key = String(name || "").toLowerCase();
  const headers = request && request.headers ? request.headers : {};
  if (headers && typeof headers.get === "function") {
    return String(headers.get(name) || headers.get(key) || "").trim();
  }
  if (headers && Object.prototype.hasOwnProperty.call(headers, key)) {
    return String(headers[key] || "").trim();
  }
  const found = Object.keys(headers || {}).find((headerName) => headerName.toLowerCase() === key);
  return found ? String(headers[found] || "").trim() : "";
}

function productionSiteFromUrl(siteUrl) {
  const value = String(siteUrl || "").toLowerCase();
  return Boolean(value) && value.indexOf(PRODUCTION_HOST) !== -1;
}

function resolveEnv(expansionEnvironment) {
  let env = null;
  if (typeof expansionEnvironment === "function") {
    try { env = expansionEnvironment(); } catch { env = null; }
  }
  if (!env || typeof env !== "object") {
    env = expansionFlags.resolveExpansionEnvironment({ env: process.env, siteUrl: process.env.SITE_URL || "" });
  }
  const siteUrl = String(env.siteUrl || process.env.SITE_URL || "");
  const liveProduction = env.liveProduction === true || productionSiteFromUrl(siteUrl);
  return {
    ...env,
    liveProduction,
    allowFamilyHubTestingPreview: env.allowFamilyHubTestingPreview === true && !liveProduction,
    siteUrl,
  };
}

function createFamilyHubApi({
  readStore,
  writeStore,
  jsonResponse,
  readJson,
  normalizeEmail,
  expansionEnvironment,
}) {
  function env() {
    return resolveEnv(expansionEnvironment);
  }

  function previewGateOk(store) {
    const decision = expansionFlags.evaluateExpansionAccess({
      flagKey: expansionFlags.EXPANSION_FEATURE_KEYS.FAMILY_HUB,
      storedFlags: store?.siteContent?.featureFlags,
      environment: env(),
    });
    return decision;
  }

  function resolveGuardian(request, store) {
    const authHeader = getHeader(request, "authorization");
    const memberSession = tempPasswordAuth.resolveMemberSession(store, authHeader);
    let email = memberSession?.email || "";
    if (!email && process.env.NODE_ENV === "test" && authHeader.startsWith("Bearer test:")) {
      email = safeLower(authHeader.slice("Bearer test:".length));
    }
    if (!email) return { error: "login_required", status: 401 };
    // Staff attempting Family Hub as staff membership without guardian contact → deny
    const contact = hub.findContactByEmailAnyOrg(store, email);
    if (!contact) {
      return { error: "guardian_required", status: 403, email };
    }
    const fake = listValues(store.familyFoundation?.fakeAccounts || {}).find((row) => safeLower(row.email) === email);
    return {
      email,
      contact,
      organizationId: contact.organizationId,
      testingAccount: Boolean(fake),
      memberSession,
    };
  }

  function deny(response, status, code, error) {
    jsonResponse(response, status, {
      error: error || hub.RESTRICTED_UNAVAILABLE_MESSAGE,
      code,
      familyHub: true,
      preview: true,
    });
  }

  let messagingHandlers = null;

  function withGuardian(request, response, { capability = "digital", childId = "" } = {}) {
    const store = readStore();
    hub.ensureFamilyHubStore(store);
    const gate = previewGateOk(store);
    if (!gate.allowed) {
      jsonResponse(response, gate.status || 403, gate.payload || expansionFlags.unavailableExpansionPayload("familyHub"));
      return null;
    }
    const actor = resolveGuardian(request, store);
    if (actor.error) {
      deny(response, actor.status, actor.error, actor.error === "login_required"
        ? "Login required."
        : hub.RESTRICTED_UNAVAILABLE_MESSAGE);
      return null;
    }
    fixtures.ensurePhase9Preview(store, { organizationId: actor.organizationId });
    updatesFixtures.ensurePhase10Preview(store, { organizationId: actor.organizationId });
    messagingFixtures.ensurePhase11Preview(store, { organizationId: actor.organizationId });
    enrollmentFixtures.ensurePhase12Preview(store, { organizationId: actor.organizationId });
    recordsFixtures.ensurePhase13Preview(store, { organizationId: actor.organizationId });
    licensingFixtures.ensurePhase14Preview(store, { organizationId: actor.organizationId });
    todayHubFixtures.ensurePhase15Preview(store, { organizationId: actor.organizationId });
    billingFixtures.ensurePhase17Preview(store, { organizationId: actor.organizationId });
    const children = hub.permittedChildrenForContact(store, actor.contact.id);
    // For messaging capability, also include messages-only children and deny when none are messages-capable.
    if (capability === "messages") {
      const messageChildren = listValues(store.familyFoundation?.accessRules || {})
        .filter((rule) => rule.contactId === actor.contact.id && rule.organizationId === actor.organizationId && rule.status === "active")
        .filter((rule) => familyModel.evaluateContactChildAccess({
          store,
          organizationId: actor.organizationId,
          contactId: actor.contact.id,
          childId: rule.childId,
          capability: "messages",
        }).allowed)
        .map((rule) => {
          const child = store.childRecords?.[rule.childId];
          return {
            childId: rule.childId,
            displayName: child?.displayName || "",
            accessLevel: rule.accessLevel,
          };
        });
      if (!messageChildren.length && !childId && !getHeader(request, "x-llh-selected-child-id")) {
        deny(response, 403, "no_messages_access", hub.RESTRICTED_UNAVAILABLE_MESSAGE);
        return null;
      }
    }
    let selectedChildId = String(childId || getHeader(request, "x-llh-selected-child-id") || "").trim();
    if (selectedChildId) {
      const access = hub.requireChildAccess(store, actor.contact, selectedChildId, capability);
      if (!access.allowed) {
        deny(response, 403, access.reason || "child_access_denied", hub.RESTRICTED_UNAVAILABLE_MESSAGE);
        return null;
      }
    } else if (children.length === 1) {
      selectedChildId = children[0].childId;
    }
    return { store, actor, children, selectedChildId };
  }

  messagingHandlers = createFamilyHubMessagingHandlers({
    messagingModel,
    messagingFixtures,
    updatesModel,
    familyModel,
    hub,
    listValues,
    safeLower,
    withGuardian,
    deny,
    readJson,
    writeStore,
    jsonResponse,
    env,
    TESTING_BANNER,
  });

  const enrollmentHandlers = createFamilyHubEnrollmentHandlers({
    familyModel,
    hub,
    withGuardian,
    deny,
    readJson,
    writeStore,
    jsonResponse,
    TESTING_BANNER,
  });

  const recordsHandlers = createFamilyHubRecordsHandlers({
    familyModel,
    hub,
    withGuardian,
    deny,
    readJson,
    writeStore,
    jsonResponse,
    TESTING_BANNER,
  });

  function programContact(store, organizationId) {
    const org = store.organizations?.[organizationId];
    return {
      programName: org?.name || "Program",
      email: org?.ownerEmail || "",
      phone: "",
      note: "Contact your program for questions. Family Hub messaging arrives in a later phase.",
    };
  }

  function formsForContactChild(store, contact, childId) {
    responsesModel.ensureFormResponsesStore(store);
    formsModel.ensureFormsCenterStore(store);
    const guardianId = contact.foundationGuardianId;
    const assignments = listValues(store.formResponses.assignments).filter((row) => (
      row
      && row.organizationId === contact.organizationId
      && row.status === responsesModel.ASSIGNMENT_STATUSES.ACTIVE
      && row.recipientType === responsesModel.RECIPIENT_TYPES.GUARDIAN
      && row.recipientId === guardianId
      && (!childId || row.relatedChildId === childId || !row.relatedChildId)
    ));
    return assignments.map((assignment) => {
      const response = listValues(store.formResponses.responses).find((row) => row.assignmentId === assignment.id);
      const form = store.formsCenter?.forms?.[assignment.formId];
      const status = response?.status || responsesModel.RESPONSE_STATUSES.NOT_STARTED;
      return {
        assignmentId: assignment.id,
        formId: assignment.formId,
        formTitle: form?.title || assignment.formTitle || "Form",
        relatedChildId: assignment.relatedChildId || childId || "",
        dueAt: assignment.dueAt || "",
        status,
        statusLabel: responsesModel.RESPONSE_STATUS_LABELS[status] || status,
        actionNeeded: [
          responsesModel.RESPONSE_STATUSES.NOT_STARTED,
          responsesModel.RESPONSE_STATUSES.IN_PROGRESS,
          responsesModel.RESPONSE_STATUSES.RETURNED_FOR_CORRECTION,
        ].includes(status),
        awaitingOtherSignature: status === responsesModel.RESPONSE_STATUSES.SUBMITTED
          || status === responsesModel.RESPONSE_STATUSES.UNDER_REVIEW,
        returned: status === responsesModel.RESPONSE_STATUSES.RETURNED_FOR_CORRECTION,
        approved: status === responsesModel.RESPONSE_STATUSES.APPROVED,
        archived: status === responsesModel.RESPONSE_STATUSES.ARCHIVED,
      };
    });
  }

  function documentsForChild(store, organizationId, childId) {
    return listValues(store.familyHub.documents).filter((row) => (
      row.organizationId === organizationId
      && row.childId === childId
      && row.familyVisible === true
    )).map((doc) => ({
      id: doc.id,
      title: doc.title,
      childId: doc.childId,
      category: doc.category,
      status: doc.status,
      receivedAt: doc.receivedAt,
      approvedAt: doc.approvedAt,
      expiresAt: doc.expiresAt,
      reviewAt: doc.reviewAt,
      downloadAuthorized: doc.downloadAuthorized === true && doc.status === hub.DOCUMENT_STATUSES.FAMILY_VISIBLE,
      providerExplanation: doc.providerExplanation || "",
      pendingReview: doc.status === hub.DOCUMENT_STATUSES.PENDING_REVIEW,
      uploadRequested: doc.status === hub.DOCUMENT_STATUSES.UPLOAD_REQUESTED,
      officialRecord: doc.officialRecord === true,
    }));
  }

  function calendarForChild(store, organizationId, childId, classroomId = "") {
    return listValues(store.familyHub.calendarEvents).filter((row) => (
      row.organizationId === organizationId
      && row.familyVisible === true
      && (!row.childId || row.childId === childId)
      && (!classroomId || !row.classroomId || row.classroomId === classroomId)
    )).map((evt) => ({
      id: evt.id,
      title: evt.title,
      eventType: evt.eventType,
      startsAt: evt.startsAt,
      endsAt: evt.endsAt,
      allDay: evt.allDay === true,
      sharedThemeTitle: evt.sharedThemeTitle || "",
      childId: evt.childId || "",
    }));
  }

  function changeRequestsForContact(store, contactId, childId = "") {
    return listValues(store.familyHub.changeRequests).filter((row) => (
      row.contactId === contactId
      && (!childId || row.childId === childId || !row.childId)
    )).map((row) => ({
      id: row.id,
      type: row.type,
      status: row.status,
      childId: row.childId,
      payload: row.payload,
      createdAt: row.createdAt,
      reviewNote: row.status === hub.CHANGE_REQUEST_STATUSES.PENDING ? "" : (row.reviewNote || ""),
    }));
  }

  function familyFeedForChild(store, contact, childId) {
    updatesModel.ensureFamilyUpdatesStore(store);
    const orgId = contact.organizationId;
    const updates = updatesModel.updatesVisibleToChild(store, orgId, childId)
      .map((row) => updatesModel.familySafeUpdate(row, { childId }))
      .filter(Boolean);
    const dailyReports = listValues(store.familyUpdates.dailyReportShares)
      .filter((share) => share.organizationId === orgId && share.childId === childId && share.visibility === updatesModel.VISIBILITY.FAMILY_VISIBLE)
      .map((share) => updatesModel.familySafeDailyReport(store.previewDailyLogs?.[share.dailyLogId], share))
      .filter(Boolean)
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    const observations = listValues(store.familyUpdates.observationShares)
      .filter((share) => share.organizationId === orgId && share.childId === childId && share.visibility === updatesModel.VISIBILITY.FAMILY_VISIBLE)
      .map((share) => updatesModel.familySafeObservation(store.previewObservations?.[share.observationId], share))
      .filter(Boolean);
    const goals = listValues(store.familyUpdates.goalShares)
      .filter((share) => share.organizationId === orgId && share.childId === childId && share.visibility === updatesModel.VISIBILITY.FAMILY_VISIBLE)
      .map((share) => updatesModel.familySafeGoal(store.previewGoals?.[share.goalId], share))
      .filter(Boolean);
    const media = listValues(store.familyUpdates.media)
      .map((row) => {
        const gate = updatesModel.guardianMayViewMedia(store, contact, row);
        if (!gate.allowed) return null;
        return updatesModel.familySafeMedia(row, gate.visibleChildIds);
      })
      .filter(Boolean);
    const acknowledgments = listValues(store.familyUpdates.acknowledgments).filter((row) => (
      row.contactId === contact.id && row.childId === childId
    ));
    return { updates, dailyReports, observations, goals, media, acknowledgments };
  }

  // ─── Handlers ─────────────────────────────────────────────────────────────

  async function handleStatus(request, response) {
    const store = readStore();
    const gate = previewGateOk(store);
    if (!gate.allowed) {
      jsonResponse(response, gate.status || 403, gate.payload);
      return;
    }
    const actor = resolveGuardian(request, store);
    if (actor.error) {
      deny(response, actor.status, actor.error);
      return;
    }
    fixtures.ensurePhase9Preview(store, { organizationId: actor.organizationId });
    updatesFixtures.ensurePhase10Preview(store, { organizationId: actor.organizationId });
    messagingFixtures.ensurePhase11Preview(store, { organizationId: actor.organizationId });
    enrollmentFixtures.ensurePhase12Preview(store, { organizationId: actor.organizationId });
    recordsFixtures.ensurePhase13Preview(store, { organizationId: actor.organizationId });
    licensingFixtures.ensurePhase14Preview(store, { organizationId: actor.organizationId });
    writeStore(store);
    const children = hub.permittedChildrenForContact(store, actor.contact.id);
    const unreadMessages = messagingModel.unreadCountForEmail(store, actor.organizationId, actor.email);
    jsonResponse(response, 200, {
      ok: true,
      phase: 14,
      preview: true,
      label: TESTING_BANNER,
      familyHub: true,
      contactId: actor.contact.id,
      organizationId: actor.organizationId,
      childCount: children.length,
      // Nav decision: Messages replaces Calendar in the bottom bar (max five).
      // Calendar remains available under Account → Calendar.
      // Enrollment checklist is on Home (and tab=enrollment) to avoid crowding bottom nav.
      // Documents/records are on Home (and tab=records).
      // Licensing document tasks are on Home / Account when authorized (not a sixth bottom-nav item).
      navigation: ["home", "children", "forms", "messages", "account"],
      deferred: [],
      navDecision: "messages_replaces_calendar_in_bottom_nav_calendar_under_account_enrollment_records_licensing_billing_from_home",
      unreadMessages,
      roadmapNote: "Billing is available as a testing simulator under Account / Home. Outbound email/SMS/push stay disabled.",
      noOutboundEmail: true,
      noOutboundSms: true,
      noPush: true,
      noPublicMediaUrls: true,
      noStripeEnrollment: true,
      noPublicRecordUrls: true,
      noLegalComplianceClaim: true,
    });
  }

  async function handleHome(request, response, url) {
    const childId = url?.searchParams?.get("childId") || "";
    const ctx = withGuardian(request, response, { capability: "digital", childId });
    if (!ctx) return;
    const { store, actor, children, selectedChildId } = ctx;
    writeStore(store);

    if (!children.length) {
      jsonResponse(response, 200, {
        ok: true,
        label: TESTING_BANNER,
        welcome: `Welcome, ${actor.contact.displayName}.`,
        children: [],
        selectedChildId: "",
        empty: true,
        emptyMessage: "Nothing needs your attention right now.",
        actionNeeded: [],
        formsToComplete: [],
        awaitingSignature: [],
        returnedForms: [],
        upcomingCalendar: [],
        documentRequests: [],
        pendingChangeRequests: [],
        recentApproved: [],
        licensingTasks: [],
        licensingTaskCount: 0,
        programContact: programContact(store, actor.organizationId),
        roadmapNote: "More family tools are coming in later phases.",
      });
      return;
    }

    const activeChildId = selectedChildId || children[0].childId;
    const access = hub.requireChildAccess(store, actor.contact, activeChildId, "digital");
    const formsAccess = hub.requireChildAccess(store, actor.contact, activeChildId, "forms");
    const forms = formsAccess.allowed ? formsForContactChild(store, actor.contact, activeChildId) : [];
    const docs = documentsForChild(store, actor.organizationId, activeChildId);
    const calendar = calendarForChild(store, actor.organizationId, activeChildId);
    const changes = changeRequestsForContact(store, actor.contact.id, activeChildId);
    const feed = access.allowed ? familyFeedForChild(store, actor.contact, activeChildId) : {
      updates: [], dailyReports: [], observations: [], goals: [], media: [], acknowledgments: [],
    };
    const digitalChildren = (children || []).filter((child) => familyModel.evaluateContactChildAccess({
      store,
      organizationId: actor.organizationId,
      contactId: actor.contact.id,
      childId: child.childId,
      capability: "digital",
    }).allowed);
    const licensingTasks = buildLicensingTasksForGuardian(store, actor, digitalChildren);

    const formsToComplete = forms.filter((row) => row.actionNeeded && !row.returned);
    const returnedForms = forms.filter((row) => row.returned);
    const awaitingSignature = forms.filter((row) => row.awaitingOtherSignature);
    const documentRequests = docs.filter((row) => row.uploadRequested || row.pendingReview || row.status === hub.DOCUMENT_STATUSES.CORRECTION_REQUESTED || row.status === hub.DOCUMENT_STATUSES.REJECTED);
    const pendingChangeRequests = changes.filter((row) => row.status === hub.CHANGE_REQUEST_STATUSES.PENDING);
    const recentApproved = forms.filter((row) => row.approved).slice(0, 5);
    const upcomingCalendar = calendar.slice(0, 5);
    const todaysReport = (feed.dailyReports || []).find((row) => row.date === hub.nowIso().slice(0, 10)) || feed.dailyReports[0] || null;

    const actionNeeded = [
      ...formsToComplete.map((row) => ({ kind: "form", id: row.assignmentId, title: row.formTitle, href: "forms", childId: activeChildId })),
      ...returnedForms.map((row) => ({ kind: "form_returned", id: row.assignmentId, title: row.formTitle, href: "forms", childId: activeChildId })),
      ...documentRequests.filter((row) => row.uploadRequested).map((row) => ({ kind: "document_request", id: row.id, title: row.title, href: "children", childId: activeChildId })),
      ...licensingTasks.map((row) => ({ kind: "licensing_document", id: row.id, title: row.title, href: "licensing", childId: row.childId })),
      ...pendingChangeRequests.map((row) => ({ kind: "change_request", id: row.id, title: `Pending ${row.type.replace(/_/g, " ")}`, href: "account", childId: activeChildId })),
      ...(feed.updates || []).slice(0, 3).map((row) => ({ kind: "update", id: row.id, title: row.title, href: "home", childId: activeChildId })),
    ];

    jsonResponse(response, 200, {
      ok: true,
      label: TESTING_BANNER,
      welcome: `Welcome, ${actor.contact.displayName}.`,
      children,
      selectedChildId: activeChildId,
      accessLevel: access.accessLevel,
      empty: actionNeeded.length === 0 && upcomingCalendar.length === 0 && recentApproved.length === 0 && !(feed.updates || []).length,
      emptyMessage: "Nothing needs your attention right now.",
      actionNeeded,
      formsToComplete,
      awaitingSignature,
      returnedForms,
      upcomingCalendar,
      documentRequests,
      pendingChangeRequests,
      recentApproved,
      licensingTasks,
      licensingTaskCount: licensingTasks.length,
      recentUpdates: (feed.updates || []).slice(0, 8),
      todaysDailyReport: todaysReport,
      familyMedia: (feed.media || []).slice(0, 8),
      sharedObservations: (feed.observations || []).slice(0, 5),
      sharedGoals: (feed.goals || []).slice(0, 5),
      unreadMessages: messagingModel.unreadCountForEmail(store, actor.organizationId, actor.email),
      todayAttendance: attendanceStatusForGuardianChildren(store, actor.organizationId, digitalChildren),
      programContact: programContact(store, actor.organizationId),
      roadmapNote: "Billing arrives in a later phase.",
    });
  }

  async function handleChildren(request, response) {
    const ctx = withGuardian(request, response, { capability: "digital" });
    if (!ctx) return;
    const { store, actor, children } = ctx;
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      label: TESTING_BANNER,
      children,
      contactId: actor.contact.id,
    });
  }

  async function handleChildDetail(request, response, childId) {
    const ctx = withGuardian(request, response, { capability: "digital", childId });
    if (!ctx) return;
    const { store, actor } = ctx;
    const child = store.childRecords?.[childId];
    if (!child || child.organizationId !== actor.organizationId) {
      deny(response, 404, "child_not_found");
      return;
    }
    const access = hub.requireChildAccess(store, actor.contact, childId, "digital");
    const rule = store.familyFoundation.accessRules[access.ruleId] || listValues(store.familyFoundation.accessRules).find((row) => (
      row.contactId === actor.contact.id && row.childId === childId && row.status === "active"
    ));
    const summary = child.familySummary || {};
    const classroom = listValues(store.classroomChildAssignments).find((row) => (
      row.childId === childId && row.organizationId === actor.organizationId && !row.endsAt
    ));
    const classroomRecord = classroom ? store.classrooms?.[classroom.classroomId] : null;
    writeStore(store);
    const feed = familyFeedForChild(store, actor.contact, childId);
    jsonResponse(response, 200, {
      ok: true,
      label: TESTING_BANNER,
      child: {
        id: child.id,
        displayName: child.displayName,
        profileInitial: summary.profileInitial || String(child.displayName || "?").slice(0, 1).toUpperCase(),
        classroom: classroomRecord?.name || summary.classroomName || "",
        program: summary.programName || store.organizations?.[actor.organizationId]?.name || "",
        relationship: rule?.relationshipLabel || actor.contact.relationshipDefault || "guardian",
        accessLevel: access.accessLevel,
        accessLevelLabel: familyModel.ACCESS_LEVEL_LABELS[access.accessLevel] || access.accessLevel,
        emergencySummary: summary.emergencySummary || "",
        authorizedPickupSummary: summary.authorizedPickupSummary || "",
        allergySummary: summary.allergySummaryFamilyVisible || "",
      },
      upcomingCalendar: calendarForChild(store, actor.organizationId, childId, classroom?.classroomId),
      forms: hub.requireChildAccess(store, actor.contact, childId, "forms").allowed
        ? formsForContactChild(store, actor.contact, childId)
        : [],
      documents: documentsForChild(store, actor.organizationId, childId),
      pendingChangeRequests: changeRequestsForContact(store, actor.contact.id, childId)
        .filter((row) => row.status === hub.CHANGE_REQUEST_STATUSES.PENDING),
      recentUpdates: feed.updates,
      dailyReports: feed.dailyReports,
      familyMedia: feed.media,
      sharedObservations: feed.observations,
      sharedGoals: feed.goals,
      // Explicitly omitted: internal observations, staff notes, licensing, custody, incidents, private timelines
      restrictedOmitted: true,
    });
  }

  async function handleFormsList(request, response, url) {
    const childId = url?.searchParams?.get("childId") || "";
    const filter = String(url?.searchParams?.get("filter") || "all").toLowerCase();
    const ctx = withGuardian(request, response, { capability: "forms", childId });
    if (!ctx) return;
    const { store, actor, children, selectedChildId } = ctx;
    if (!selectedChildId && children.length > 1) {
      jsonResponse(response, 200, {
        ok: true,
        children,
        selectedChildId: "",
        forms: [],
        note: "Select a child to view forms.",
      });
      return;
    }
    const activeChildId = selectedChildId || children[0]?.childId || "";
    if (!activeChildId) {
      deny(response, 403, "no_child_access", hub.RESTRICTED_UNAVAILABLE_MESSAGE);
      return;
    }
    let forms = formsForContactChild(store, actor.contact, activeChildId);
    if (filter === "action_needed") forms = forms.filter((row) => row.actionNeeded);
    else if (filter === "in_progress") forms = forms.filter((row) => row.status === responsesModel.RESPONSE_STATUSES.IN_PROGRESS);
    else if (filter === "submitted") forms = forms.filter((row) => row.status === responsesModel.RESPONSE_STATUSES.SUBMITTED || row.status === responsesModel.RESPONSE_STATUSES.UNDER_REVIEW);
    else if (filter === "returned") forms = forms.filter((row) => row.returned);
    else if (filter === "approved") forms = forms.filter((row) => row.approved);
    else if (filter === "archived") forms = forms.filter((row) => row.archived);
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      label: TESTING_BANNER,
      children,
      selectedChildId: activeChildId,
      filter,
      forms,
    });
  }

  async function handleFormOpen(request, response, assignmentId) {
    const ctx = withGuardian(request, response, { capability: "forms" });
    if (!ctx) return;
    const { store, actor } = ctx;
    responsesModel.ensureFormResponsesStore(store);
    const assignment = store.formResponses.assignments[assignmentId];
    if (!assignment || assignment.organizationId !== actor.organizationId) {
      deny(response, 404, "assignment_not_found");
      return;
    }
    if (assignment.recipientType !== responsesModel.RECIPIENT_TYPES.GUARDIAN
      || assignment.recipientId !== actor.contact.foundationGuardianId) {
      deny(response, 403, "form_recipient_denied", hub.RESTRICTED_UNAVAILABLE_MESSAGE);
      return;
    }
    if (assignment.relatedChildId) {
      const access = hub.requireChildAccess(store, actor.contact, assignment.relatedChildId, "forms");
      if (!access.allowed) {
        deny(response, 403, access.reason, hub.RESTRICTED_UNAVAILABLE_MESSAGE);
        return;
      }
    }
    let record = listValues(store.formResponses.responses).find((row) => row.assignmentId === assignment.id);
    if (!record) {
      record = responsesModel.createResponseRecord({
        assignmentId: assignment.id,
        organizationId: assignment.organizationId,
        formId: assignment.formId,
        formVersionId: assignment.formVersionId,
        formVersionNumber: assignment.formVersionNumber,
        recipientType: assignment.recipientType,
        recipientId: assignment.recipientId,
        relatedChildId: assignment.relatedChildId,
        relatedClassroomId: assignment.relatedClassroomId,
      });
      store.formResponses.responses[record.id] = record;
    }
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      ...buildRecipientPayload(store, { assignment, response: record }),
      familyHub: true,
      label: TESTING_BANNER,
    });
  }

  async function handleFormSaveDraft(request, response, assignmentId) {
    const body = await readJson(request);
    const ctx = withGuardian(request, response, { capability: "forms" });
    if (!ctx) return;
    const { store, actor } = ctx;
    const assignment = store.formResponses.assignments[assignmentId];
    if (!assignment || assignment.recipientId !== actor.contact.foundationGuardianId) {
      deny(response, 403, "form_recipient_denied");
      return;
    }
    if (assignment.relatedChildId) {
      const access = hub.requireChildAccess(store, actor.contact, assignment.relatedChildId, "forms");
      if (!access.allowed) {
        deny(response, 403, access.reason);
        return;
      }
    }
    let record = listValues(store.formResponses.responses).find((row) => row.assignmentId === assignment.id);
    if (!record) {
      deny(response, 404, "response_not_found");
      return;
    }
    if (!responsesModel.EDITABLE_STATUSES.has(record.status)) {
      deny(response, 409, "response_not_editable", "This response can no longer be edited.");
      return;
    }
    const wasNotStarted = record.status === responsesModel.RESPONSE_STATUSES.NOT_STARTED;
    record.answers = { ...record.answers, ...(body.answers && typeof body.answers === "object" ? body.answers : {}) };
    if (wasNotStarted) {
      record.status = responsesModel.RESPONSE_STATUSES.IN_PROGRESS;
      record.startedAt = responsesModel.nowIso();
    }
    if (record.status === responsesModel.RESPONSE_STATUSES.RETURNED_FOR_CORRECTION && body.correcting === true) {
      // Stay editable while correcting
    }
    record.lastSavedAt = responsesModel.nowIso();
    record.updatedAt = record.lastSavedAt;
    store.formResponses.responses[record.id] = record;
    writeStore(store);
    jsonResponse(response, 200, { ok: true, savedAt: record.lastSavedAt, status: record.status });
  }

  async function handleFormSubmit(request, response, assignmentId) {
    const body = await readJson(request);
    const ctx = withGuardian(request, response, { capability: "forms" });
    if (!ctx) return;
    const { store, actor } = ctx;
    const assignment = store.formResponses.assignments[assignmentId];
    if (!assignment || assignment.recipientId !== actor.contact.foundationGuardianId) {
      deny(response, 403, "form_recipient_denied");
      return;
    }
    if (assignment.relatedChildId) {
      const access = hub.requireChildAccess(store, actor.contact, assignment.relatedChildId, "forms");
      if (!access.allowed) {
        deny(response, 403, access.reason);
        return;
      }
    }
    const record = listValues(store.formResponses.responses).find((row) => row.assignmentId === assignment.id);
    if (!record || !responsesModel.EDITABLE_STATUSES.has(record.status)) {
      deny(response, 409, "response_not_editable");
      return;
    }
    if (body.answers && typeof body.answers === "object") {
      record.answers = { ...record.answers, ...body.answers };
    }
    if (body.signature && typeof body.signature === "object") {
      const sig = responsesModel.createSignatureRecord({
        responseId: record.id,
        assignmentId: assignment.id,
        organizationId: assignment.organizationId,
        signerRole: responsesModel.SIGNER_ROLES.PARENT_GUARDIAN,
        signerName: body.signature.signerName || actor.contact.displayName,
        signerIdentity: `guardian:${actor.contact.foundationGuardianId}`,
        signatureType: body.signature.signatureType || "typed",
        typedName: body.signature.typedName || actor.contact.displayName,
        drawnDataUrl: body.signature.drawnDataUrl || "",
      });
      store.formResponses.signatures[sig.id] = sig;
    }
    const previous = record.status;
    record.status = previous === responsesModel.RESPONSE_STATUSES.RETURNED_FOR_CORRECTION
      ? responsesModel.RESPONSE_STATUSES.CORRECTED_AND_RESUBMITTED
      : responsesModel.RESPONSE_STATUSES.SUBMITTED;
    record.submittedAt = responsesModel.nowIso();
    record.updatedAt = record.submittedAt;
    store.formResponses.responses[record.id] = record;
    writeStore(store);
    jsonResponse(response, 200, { ok: true, status: record.status, submittedAt: record.submittedAt });
  }

  async function handleFormDocument(request, response, assignmentId) {
    const ctx = withGuardian(request, response, { capability: "forms" });
    if (!ctx) return;
    const { store, actor } = ctx;
    const assignment = store.formResponses.assignments[assignmentId];
    if (!assignment || assignment.recipientId !== actor.contact.foundationGuardianId) {
      deny(response, 403, "form_recipient_denied");
      return;
    }
    const record = listValues(store.formResponses.responses).find((row) => row.assignmentId === assignment.id);
    if (!record) {
      deny(response, 404, "response_not_found");
      return;
    }
    if (responsesModel.EDITABLE_STATUSES.has(record.status)) {
      deny(response, 409, "document_not_available_yet", "Your document view will be available once you submit this form.");
      return;
    }
    const view = documentSnapshot.resolveDocumentView(store, { assignment, response: record });
    jsonResponse(response, 200, { ok: true, frozen: view.frozen, content: view.content, familyHub: true });
  }

  async function handleDocuments(request, response, url) {
    const childId = url?.searchParams?.get("childId") || "";
    const ctx = withGuardian(request, response, { capability: "digital", childId });
    if (!ctx) return;
    const { store, actor, selectedChildId, children } = ctx;
    const activeChildId = selectedChildId || children[0]?.childId || "";
    if (!activeChildId) {
      deny(response, 403, "no_child_access");
      return;
    }
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      selectedChildId: activeChildId,
      documents: documentsForChild(store, actor.organizationId, activeChildId),
      note: "Only family-visible records are listed. Full Records Center arrives in a later phase.",
    });
  }

  async function handleUploadDocument(request, response) {
    const body = await readJson(request);
    const childId = String(body.childId || "").trim();
    const ctx = withGuardian(request, response, { capability: "digital", childId });
    if (!ctx) return;
    const { store, actor } = ctx;
    const doc = hub.createFamilyDocumentRecord({
      organizationId: actor.organizationId,
      childId,
      title: body.title || "Uploaded document (testing)",
      category: body.category || "upload",
      status: hub.DOCUMENT_STATUSES.PENDING_REVIEW,
      familyVisible: true,
      uploadedByContactId: actor.contact.id,
      downloadAuthorized: false,
    });
    doc.officialRecord = false;
    store.familyHub.documents[doc.id] = doc;
    writeStore(store);
    jsonResponse(response, 201, {
      ok: true,
      document: {
        id: doc.id,
        title: doc.title,
        status: doc.status,
        pendingReview: true,
        officialRecord: false,
      },
      note: "Upload received for provider review. It is not an approved official record.",
    });
  }

  async function handleCalendar(request, response, url) {
    const childId = url?.searchParams?.get("childId") || "";
    const ctx = withGuardian(request, response, { capability: "digital", childId });
    if (!ctx) return;
    const { store, actor, selectedChildId, children } = ctx;
    const activeChildId = selectedChildId || children[0]?.childId || "";
    if (!activeChildId) {
      deny(response, 403, "no_child_access");
      return;
    }
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      selectedChildId: activeChildId,
      events: calendarForChild(store, actor.organizationId, activeChildId),
      note: "Only family-visible program and classroom events are shown.",
    });
  }

  async function handleAccount(request, response) {
    const ctx = withGuardian(request, response, { capability: "digital" });
    if (!ctx) return;
    const { store, actor, children } = ctx;
    const memberships = listValues(store.familyFoundation.householdMemberships).filter((row) => (
      row.contactId === actor.contact.id && row.status === "active"
    ));
    const households = memberships.map((row) => {
      const hh = store.familyFoundation.households[row.householdId];
      const contacts = listValues(store.familyFoundation.householdMemberships)
        .filter((m) => m.householdId === row.householdId && m.status === "active")
        .map((m) => {
          const c = store.familyFoundation.contacts[m.contactId];
          return c ? { id: c.id, displayName: c.displayName, relationshipDefault: c.relationshipDefault } : null;
        })
        .filter(Boolean);
      return {
        id: hh?.id,
        displayName: hh?.displayName || "Household",
        contacts,
      };
    });
    let prefs = listValues(store.familyHub.notificationPreferences).find((row) => row.contactId === actor.contact.id);
    if (!prefs) {
      prefs = hub.defaultNotificationPreferences({
        contactId: actor.contact.id,
        organizationId: actor.organizationId,
      });
      store.familyHub.notificationPreferences[prefs.id] = prefs;
    }
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      label: TESTING_BANNER,
      account: {
        contactId: actor.contact.id,
        displayName: actor.contact.displayName,
        email: actor.contact.email,
        phone: actor.contact.phone || "",
      },
      children,
      households,
      changeRequests: changeRequestsForContact(store, actor.contact.id),
      notificationPreferences: prefs,
      note: "Critical information changes require provider review. Notifications are not sent in Phase 9.",
    });
  }

  async function handleChangeRequest(request, response) {
    const body = await readJson(request);
    const childId = String(body.childId || "").trim();
    const ctx = withGuardian(request, response, { capability: "digital", childId: childId || undefined });
    if (!ctx) return;
    const { store, actor } = ctx;
    const type = String(body.type || hub.CHANGE_REQUEST_TYPES.CONTACT_INFO);
    const allowed = Object.values(hub.CHANGE_REQUEST_TYPES);
    if (!allowed.includes(type)) {
      deny(response, 400, "invalid_change_type", "Unsupported change request type.");
      return;
    }
    // Never silently overwrite official records — queue for provider review only.
    const change = hub.createChangeRequestRecord({
      organizationId: actor.organizationId,
      contactId: actor.contact.id,
      childId,
      type,
      payload: body.payload && typeof body.payload === "object" ? body.payload : {},
      createdByEmail: actor.email,
    });
    store.familyHub.changeRequests[change.id] = change;
    writeStore(store);
    jsonResponse(response, 201, {
      ok: true,
      changeRequest: {
        id: change.id,
        type: change.type,
        status: change.status,
        childId: change.childId,
      },
      applied: false,
      note: "Request submitted for provider review. Official records were not changed.",
    });
  }

  async function handleNotificationPrefs(request, response) {
    const body = await readJson(request);
    const ctx = withGuardian(request, response, { capability: "digital" });
    if (!ctx) return;
    const { store, actor } = ctx;
    let prefs = listValues(store.familyHub.notificationPreferences).find((row) => row.contactId === actor.contact.id);
    if (!prefs) {
      prefs = hub.defaultNotificationPreferences({
        contactId: actor.contact.id,
        organizationId: actor.organizationId,
      });
    }
    if (body.channels && typeof body.channels === "object") {
      prefs.channels = {
        email: body.channels.email === true,
        sms: body.channels.sms === true,
        push: body.channels.push === true,
      };
    }
    if (body.cadence && typeof body.cadence === "object") {
      prefs.cadence = {
        immediate: body.cadence.immediate === true,
        dailyDigest: body.cadence.dailyDigest === true,
        weeklyDigest: body.cadence.weeklyDigest === true,
      };
    }
    prefs.updatedAt = hub.nowIso();
    store.familyHub.notificationPreferences[prefs.id] = prefs;
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      notificationPreferences: prefs,
      sent: false,
      note: "Preferences saved. No notifications are sent in Phase 9.",
    });
  }

  async function handleChangePassword(request, response) {
    const body = await readJson(request);
    const ctx = withGuardian(request, response, { capability: "digital" });
    if (!ctx) return;
    const { store, actor } = ctx;
    const currentPassword = String(body.currentPassword || "");
    const newPassword = String(body.newPassword || "");
    if (!currentPassword || !newPassword || newPassword.length < 10) {
      deny(response, 400, "invalid_password", "Current password and a new password (10+ characters) are required.");
      return;
    }
    store.users = store.users || {};
    const user = store.users[actor.email];
    if (!user) {
      deny(response, 404, "user_not_found");
      return;
    }
    const verified = tempPasswordAuth.verifyServerPasswordLogin(user, currentPassword);
    if (!verified.ok) {
      deny(response, 401, "bad_password", "Current password did not match.");
      return;
    }
    const nextHash = tempPasswordAuth.hashPasswordSha256(newPassword);
    store.users[actor.email] = {
      ...user,
      passwordHash: nextHash,
      serverPasswordAuth: true,
      mustChangePassword: false,
      updatedAt: hub.nowIso(),
    };
    const fake = listValues(store.familyFoundation.fakeAccounts).find((row) => safeLower(row.email) === actor.email);
    if (fake) {
      fake.passwordHash = nextHash;
      fake.updatedAt = hub.nowIso();
      store.familyFoundation.fakeAccounts[fake.id] = fake;
    }
    writeStore(store);
    jsonResponse(response, 200, { ok: true, passwordChanged: true });
  }

  async function handleSeed(request, response) {
    // Admin-only seed helper for tests/screenshots — still behind Family Hub preview gate.
    const store = readStore();
    const gate = previewGateOk(store);
    if (!gate.allowed) {
      jsonResponse(response, gate.status || 403, gate.payload);
      return;
    }
    const body = await readJson(request).catch(() => ({}));
    const seeded9 = fixtures.ensurePhase9Preview(store, { organizationId: body.organizationId || "" });
    const seeded10 = updatesFixtures.ensurePhase10Preview(store, { organizationId: seeded9.organizationId || body.organizationId || "" });
    const seeded11 = messagingFixtures.ensurePhase11Preview(store, { organizationId: seeded9.organizationId || body.organizationId || "" });
    const seeded12 = enrollmentFixtures.ensurePhase12Preview(store, { organizationId: seeded9.organizationId || body.organizationId || "" });
    const seeded13 = recordsFixtures.ensurePhase13Preview(store, { organizationId: seeded9.organizationId || body.organizationId || "" });
    const seeded14 = licensingFixtures.ensurePhase14Preview(store, { organizationId: seeded9.organizationId || body.organizationId || "" });
    const seeded15 = todayHubFixtures.ensurePhase15Preview(store, { organizationId: seeded9.organizationId || body.organizationId || "" });
    const seeded17 = billingFixtures.ensurePhase17Preview(store, { organizationId: seeded9.organizationId || body.organizationId || "" });
    if (!store.siteContent) store.siteContent = {};
    if (!store.siteContent.featureFlags) store.siteContent.featureFlags = {};
    store.siteContent.featureFlags.familyHub = true;
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      seeded: true,
      ...seeded9,
      phase10: seeded10,
      phase11: seeded11,
      phase12: seeded12,
      phase13: seeded13,
      phase14: seeded14,
      phase15: seeded15,
      phase17: seeded17,
      label: TESTING_BANNER,
    });
  }

  function attendanceStatusForGuardianChildren(store, organizationId, children) {
    todayHubModel.ensureTodayHubStore(store);
    const today = todayHubModel.todayDate();
    const permitted = new Set((children || []).map((c) => c.childId));
    return listValues(store.todayHub.attendance)
      .filter((row) => row.organizationId === organizationId && row.date === today && permitted.has(row.childId))
      .map((row) => ({
        attendanceId: row.id,
        childId: row.childId,
        childName: store.childRecords?.[row.childId]?.displayName || "Child",
        status: row.status,
        checkedInAt: row.checkedInAt || "",
        checkedOutAt: row.checkedOutAt || "",
        classroomId: row.classroomId,
        // Guardians never see other children's attendance or staff ratio internals.
      }));
  }

  function buildFamilyTodayTasks(store, actor, children, homePayload) {
    const tasks = [];
    const attendance = attendanceStatusForGuardianChildren(store, actor.organizationId, children);
    for (const row of attendance) {
      tasks.push({
        id: `att-${row.attendanceId}`,
        source: "attendance",
        priority: row.status === todayHubModel.ATTENDANCE_STATUSES.ABSENT ? "today" : "informational",
        title: `${row.childName}: ${String(row.status || "").replace(/_/g, " ")}`,
        summary: row.checkedInAt ? `Checked in ${row.checkedInAt}` : (row.checkedOutAt ? `Checked out ${row.checkedOutAt}` : "Attendance status for today"),
        href: "today",
        childId: row.childId,
        sourceRefId: row.attendanceId,
      });
    }
    for (const item of homePayload.actionNeeded || []) {
      tasks.push({
        id: `action-${item.kind}-${item.id}`,
        source: item.kind,
        priority: "today",
        title: item.title,
        summary: String(item.kind || "").replace(/_/g, " "),
        href: item.href,
        childId: item.childId || "",
        sourceRefId: item.id,
      });
    }
    if ((homePayload.unreadMessages || 0) > 0) {
      tasks.push({
        id: "unread-messages",
        source: "messages",
        priority: "today",
        title: `${homePayload.unreadMessages} unread message(s)`,
        summary: "Open Messages",
        href: "messages",
        sourceRefId: "unread",
      });
    }
    if (homePayload.todaysDailyReport) {
      tasks.push({
        id: `daily-${homePayload.todaysDailyReport.id || "today"}`,
        source: "daily_logs",
        priority: "informational",
        title: "Today’s Daily Report",
        summary: "Shared when the program releases it",
        href: "home",
        childId: homePayload.selectedChildId || "",
        sourceRefId: homePayload.todaysDailyReport.id || "daily",
      });
    }
    // Dedupe by source|sourceRefId|childId
    const seen = new Set();
    return tasks.filter((task) => {
      const key = `${task.source}|${task.sourceRefId}|${task.childId || ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function handleToday(request, response, url) {
    const childId = url?.searchParams?.get("childId") || "";
    const ctx = withGuardian(request, response, { capability: "digital", childId });
    if (!ctx) return;
    const { store, actor, children, selectedChildId } = ctx;
    writeStore(store);

    const digitalChildren = (children || []).filter((child) => familyModel.evaluateContactChildAccess({
      store,
      organizationId: actor.organizationId,
      contactId: actor.contact.id,
      childId: child.childId,
      capability: "digital",
    }).allowed);

    if (!digitalChildren.length) {
      jsonResponse(response, 200, {
        ok: true,
        label: TESTING_BANNER,
        featureMarker: "phase15-family-today",
        view: "guardian",
        empty: true,
        emptyMessage: hub.RESTRICTED_UNAVAILABLE_MESSAGE || "Nothing needs your attention right now.",
        children: [],
        attendance: [],
        tasks: [],
        notifications: [],
        noExternalDelivery: true,
      });
      return;
    }

    const activeChildId = selectedChildId || digitalChildren[0].childId;
    const attendance = attendanceStatusForGuardianChildren(store, actor.organizationId, digitalChildren);
    const formsAccess = hub.requireChildAccess(store, actor.contact, activeChildId, "forms");
    const forms = formsAccess.allowed ? formsForContactChild(store, actor.contact, activeChildId) : [];
    const docs = documentsForChild(store, actor.organizationId, activeChildId);
    const calendar = calendarForChild(store, actor.organizationId, activeChildId);
    const feed = hub.requireChildAccess(store, actor.contact, activeChildId, "digital").allowed
      ? familyFeedForChild(store, actor.contact, activeChildId)
      : { updates: [], dailyReports: [], observations: [], goals: [], media: [], acknowledgments: [] };
    const licensingTasks = buildLicensingTasksForGuardian(store, actor, digitalChildren);
    const formsToComplete = forms.filter((row) => row.actionNeeded && !row.returned);
    const documentRequests = docs.filter((row) => row.uploadRequested || row.pendingReview || row.status === hub.DOCUMENT_STATUSES.CORRECTION_REQUESTED || row.status === hub.DOCUMENT_STATUSES.REJECTED);
    const todaysReport = (feed.dailyReports || []).find((row) => row.date === hub.nowIso().slice(0, 10)) || feed.dailyReports[0] || null;
    const unreadMessages = messagingModel.unreadCountForEmail(store, actor.organizationId, actor.email);
    const actionNeeded = [
      ...formsToComplete.map((row) => ({ kind: "form", id: row.assignmentId, title: row.formTitle, href: "forms", childId: activeChildId })),
      ...documentRequests.filter((row) => row.uploadRequested).map((row) => ({ kind: "document_request", id: row.id, title: row.title, href: "records", childId: activeChildId })),
      ...licensingTasks.map((row) => ({ kind: "licensing_document", id: row.id, title: row.title, href: "licensing", childId: row.childId })),
      ...(feed.updates || []).slice(0, 3).map((row) => ({ kind: "update", id: row.id, title: row.title, href: "home", childId: activeChildId })),
    ];
    const homePayload = {
      actionNeeded,
      unreadMessages,
      todaysDailyReport: todaysReport,
      selectedChildId: activeChildId,
    };
    const tasks = buildFamilyTodayTasks(store, actor, digitalChildren, homePayload);
    const notifications = listValues(store.todayHub?.notifications || {})
      .filter((n) => n.organizationId === actor.organizationId && n.audience === "family" && !n.adminOnly)
      .filter((n) => !n.recipientEmail || safeLower(n.recipientEmail) === safeLower(actor.email))
      .filter((n) => !n.childId || digitalChildren.some((c) => c.childId === n.childId));

    jsonResponse(response, 200, {
      ok: true,
      label: TESTING_BANNER,
      featureMarker: "phase15-family-today",
      view: "guardian",
      date: todayHubModel.todayDate(),
      children: digitalChildren,
      selectedChildId: activeChildId,
      attendance,
      todaysDailyReport: todaysReport,
      formsNeedingAction: formsToComplete,
      documentsRequested: documentRequests,
      upcomingCalendar: calendar.slice(0, 5),
      unreadMessages,
      licensingTasks,
      enrollmentHref: "enrollment",
      tasks,
      notifications,
      noExternalDelivery: true,
      noTaskDuplication: true,
    });
  }

  function buildLicensingTasksForGuardian(store, actor, children) {
    licensingModel.ensureLicensingStore(store);
    licensingFixtures.ensurePhase14Preview(store, { organizationId: actor.organizationId });
    const permittedChildIds = new Set((children || []).map((c) => c.childId));
    const childNameById = new Map((children || []).map((c) => [c.childId, c.displayName || "Child"]));
    const familyVisibleStatuses = new Set([
      licensingModel.READINESS.MISSING,
      licensingModel.READINESS.EXPIRING_SOON,
      licensingModel.READINESS.EXPIRED,
      licensingModel.READINESS.DUE_SOON,
      licensingModel.READINESS.WAITING_UPLOAD,
      licensingModel.READINESS.WAITING_SIGNATURE,
      licensingModel.READINESS.WAITING_PROVIDER_REVIEW,
      licensingModel.READINESS.RETURNED_FOR_CORRECTION,
    ]);
    const uploadAllowedStatuses = new Set([
      licensingModel.READINESS.MISSING,
      licensingModel.READINESS.WAITING_UPLOAD,
      licensingModel.READINESS.EXPIRED,
      licensingModel.READINESS.EXPIRING_SOON,
      licensingModel.READINESS.RETURNED_FOR_CORRECTION,
    ]);
    return listValues(store.licensingCenter.requirements)
      .filter((row) => row.organizationId === actor.organizationId && !row.archived && !row.notApplicable)
      .filter((row) => row.scope === "child" && row.relatedChildId && permittedChildIds.has(row.relatedChildId))
      .filter((row) => /immunization|health|permission|emergency|medication/i.test(`${row.key} ${row.category} ${row.title}`))
      .map((row) => {
        // Preserve intentional fixture statuses; only refresh when already linked to a record.
        if (row.connectedRecordId) return licensingModel.syncRequirementToRecords(store, row);
        return row;
      })
      .filter((row) => familyVisibleStatuses.has(row.status))
      .map((row) => ({
        id: row.id,
        title: row.title,
        status: row.status,
        childId: row.relatedChildId,
        childDisplayName: childNameById.get(row.relatedChildId) || "Child",
        category: row.category,
        plainLanguage: row.plainLanguage || "",
        dueDate: row.dueDate || "",
        expirationDate: row.expirationDate || "",
        uploadAllowed: uploadAllowedStatuses.has(row.status),
        pendingProviderReview: row.status === licensingModel.READINESS.WAITING_PROVIDER_REVIEW
          || row.status === licensingModel.READINESS.WAITING_SIGNATURE,
        computerRecommended: true,
        testingOnly: true,
        noMedicalDecision: true,
        note: "Document organization only — not a medical decision or compliance certification.",
      }));
  }

  async function handleLicensingTasks(request, response) {
    const ctx = withGuardian(request, response, { capability: "digital" });
    if (!ctx) return;
    const { store, actor, children } = ctx;
    const digitalChildren = (children || []).filter((child) => familyModel.evaluateContactChildAccess({
      store,
      organizationId: actor.organizationId,
      contactId: actor.contact.id,
      childId: child.childId,
      capability: "digital",
    }).allowed);
    if (!digitalChildren.length) {
      deny(response, 403, "no_digital_access", hub.RESTRICTED_UNAVAILABLE_MESSAGE);
      return;
    }
    const tasks = buildLicensingTasksForGuardian(store, actor, digitalChildren);
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      label: TESTING_BANNER,
      disclaimer: licensingModel.DISCLAIMER,
      tasks,
      computerRecommended: true,
      noLegalComplianceClaim: true,
      noMedicalDecisions: true,
    });
  }

  async function handleUpdatesFeed(request, response, url) {
    const childId = url?.searchParams?.get("childId") || "";
    const ctx = withGuardian(request, response, { capability: "digital", childId });
    if (!ctx) return;
    const { store, actor, selectedChildId, children } = ctx;
    const activeChildId = selectedChildId || children[0]?.childId || "";
    if (!activeChildId) return deny(response, 403, "no_child_access", hub.RESTRICTED_UNAVAILABLE_MESSAGE);
    const feed = familyFeedForChild(store, actor.contact, activeChildId);
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      label: TESTING_BANNER,
      selectedChildId: activeChildId,
      children,
      updates: feed.updates,
      dailyReports: feed.dailyReports,
      media: feed.media,
      observations: feed.observations,
      goals: feed.goals,
    });
  }

  async function handleDailyReports(request, response, url) {
    const childId = url?.searchParams?.get("childId") || "";
    const ctx = withGuardian(request, response, { capability: "digital", childId });
    if (!ctx) return;
    const { store, actor, selectedChildId, children } = ctx;
    const activeChildId = selectedChildId || children[0]?.childId || "";
    if (!activeChildId) return deny(response, 403, "no_child_access", hub.RESTRICTED_UNAVAILABLE_MESSAGE);
    const feed = familyFeedForChild(store, actor.contact, activeChildId);
    // Isolation: never include another child's report
    const reports = (feed.dailyReports || []).filter((row) => row.childId === activeChildId);
    jsonResponse(response, 200, {
      ok: true,
      label: TESTING_BANNER,
      selectedChildId: activeChildId,
      children,
      dailyReports: reports,
    });
  }

  async function handleFamilyMediaList(request, response, url) {
    const childId = url?.searchParams?.get("childId") || "";
    const ctx = withGuardian(request, response, { capability: "digital", childId });
    if (!ctx) return;
    const { store, actor, selectedChildId, children } = ctx;
    const activeChildId = selectedChildId || children[0]?.childId || "";
    if (!activeChildId) return deny(response, 403, "no_child_access", hub.RESTRICTED_UNAVAILABLE_MESSAGE);
    const feed = familyFeedForChild(store, actor.contact, activeChildId);
    jsonResponse(response, 200, {
      ok: true,
      label: TESTING_BANNER,
      selectedChildId: activeChildId,
      media: feed.media,
    });
  }

  async function handleMediaContent(request, response, mediaId) {
    const ctx = withGuardian(request, response, { capability: "digital" });
    if (!ctx) return;
    const { store, actor } = ctx;
    updatesModel.ensureFamilyUpdatesStore(store);
    const media = store.familyUpdates.media[mediaId];
    const gate = updatesModel.guardianMayViewMedia(store, actor.contact, media);
    if (!gate.allowed) return deny(response, 403, gate.reason || "media_denied", hub.RESTRICTED_UNAVAILABLE_MESSAGE);
    if (env().liveProduction) return deny(response, 403, "production_media_locked");
    // Authenticated-only payload — never a permanent public URL
    jsonResponse(response, 200, {
      ok: true,
      mediaId,
      mimeType: media.mimeType,
      placeholderLabel: media.placeholderLabel,
      contentBase64: media.contentBase64 || "",
      downloadAllowed: media.downloadPermission === true
        && gate.visibleChildIds.every((childId) => updatesModel.consentAllowsDownload(store, actor.organizationId, childId)),
      publicUrl: null,
    });
  }

  async function handleAcknowledge(request, response) {
    const body = await readJson(request);
    const childId = String(body.childId || "").trim();
    const ctx = withGuardian(request, response, { capability: "digital", childId });
    if (!ctx) return;
    const { store, actor, selectedChildId } = ctx;
    const activeChildId = childId || selectedChildId;
    if (!activeChildId) return deny(response, 400, "child_required");
    const targetType = String(body.targetType || "update");
    const targetId = String(body.targetId || "").trim();
    if (!targetId) return deny(response, 400, "target_required");
    // Validate target is visible to this guardian/child
    const feed = familyFeedForChild(store, actor.contact, activeChildId);
    const visible = (
      (targetType === "update" && feed.updates.some((row) => row.id === targetId))
      || (targetType === "daily_report" && feed.dailyReports.some((row) => row.id === targetId))
      || (targetType === "media" && feed.media.some((row) => row.id === targetId))
      || (targetType === "observation" && feed.observations.some((row) => row.id === targetId))
      || (targetType === "goal" && feed.goals.some((row) => row.id === targetId))
    );
    if (!visible) return deny(response, 403, "target_not_visible", hub.RESTRICTED_UNAVAILABLE_MESSAGE);
    const ack = updatesModel.createAcknowledgmentRecord({
      organizationId: actor.organizationId,
      contactId: actor.contact.id,
      childId: activeChildId,
      targetType,
      targetId,
      note: body.note || "",
    });
    store.familyUpdates.acknowledgments[ack.id] = ack;
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      acknowledgment: ack,
      isLegalSignature: false,
      note: "Acknowledgment recorded. This is not a legal signature.",
    });
  }

  async function handleConcern(request, response) {
    const body = await readJson(request);
    const childId = String(body.childId || "").trim();
    const ctx = withGuardian(request, response, { capability: "digital", childId });
    if (!ctx) return;
    const { store, actor, selectedChildId } = ctx;
    const activeChildId = childId || selectedChildId;
    const concern = updatesModel.createConcernRequestRecord({
      organizationId: actor.organizationId,
      contactId: actor.contact.id,
      childId: activeChildId,
      targetType: body.targetType || "update",
      targetId: body.targetId || "",
      message: body.message || "",
    });
    store.familyUpdates.concernRequests[concern.id] = concern;
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      concernRequest: concern,
      note: "Stored for provider review. No message notification was sent.",
    });
  }

  async function handleBilling(request, response) {
    const ctx = withGuardian(request, response, { capability: "billing" });
    if (!ctx) return;
    const { store, actor, children } = ctx;
    billingModel.ensureBillingStore(store);
    billingFixtures.ensurePhase17Preview(store, { organizationId: actor.organizationId });

    const billingChildren = (children || []).filter((child) => {
      const access = familyModel.evaluateContactChildAccess({
        store,
        organizationId: actor.organizationId,
        contactId: actor.contact.id,
        childId: child.childId,
        capability: "billing",
      });
      return access.allowed;
    });
    if (!billingChildren.length) {
      return deny(response, 403, "billing_access_denied", hub.RESTRICTED_UNAVAILABLE_MESSAGE);
    }

    const profiles = listValues(store.billingSimulator.billingProfiles).filter((profile) => (
      profile.organizationId === actor.organizationId
      && Array.isArray(profile.responsibleContactIds)
      && profile.responsibleContactIds.includes(actor.contact.id)
    ));
    if (!profiles.length) {
      writeStore(store);
      return jsonResponse(response, 200, {
        ok: true,
        featureMarker: "phase17-family-billing",
        testingBanner: billingModel.TESTING_BANNER,
        empty: true,
        noRealPayment: true,
        noPayButtonConnected: true,
        invoices: [],
        balanceCents: 0,
        balanceDisplay: billingModel.formatCents(0),
      });
    }

    const profileIds = new Set(profiles.map((p) => p.id));
    const householdIds = new Set(profiles.map((p) => p.householdId).filter(Boolean));
    const invoices = listValues(store.billingSimulator.invoices)
      .filter((inv) => inv.organizationId === actor.organizationId && (
        profileIds.has(inv.billingProfileId) || householdIds.has(inv.householdId)
      ))
      .map((inv) => ({
        id: inv.id,
        status: inv.status,
        dueDate: inv.dueDate,
        totalCents: inv.totalCents,
        balanceCents: inv.balanceCents,
        totalDisplay: billingModel.formatCents(inv.totalCents),
        balanceDisplay: billingModel.formatCents(inv.balanceCents),
        discountCents: inv.discountCents,
        creditCents: inv.creditCents,
        subsidyCents: inv.subsidyCents,
        copayCents: inv.copayCents,
        childIds: inv.childIds,
        lineItems: (inv.lineItems || []).map((line) => ({
          id: line.id,
          chargeType: line.chargeType,
          description: line.description,
          childId: line.childId,
          amountCents: line.amountCents,
          amountDisplay: billingModel.formatCents(line.amountCents),
        })),
        notes: inv.notes || "",
        // Explicitly omit privateCollectionNotes, other payers, credentials
        myPayerSplit: (profiles[0]?.payerSplits || []).find((split) => split.contactId === actor.contact.id) || null,
        testingOnly: true,
      }));

    const ledger = listValues(store.billingSimulator.ledger)
      .filter((entry) => entry.organizationId === actor.organizationId
        && profileIds.has(entry.billingProfileId)
        && (!entry.payerContactId || entry.payerContactId === actor.contact.id))
      .map((entry) => ({
        id: entry.id,
        type: entry.type,
        amountCents: entry.amountCents,
        amountDisplay: billingModel.formatCents(entry.amountCents),
        invoiceId: entry.invoiceId,
        note: entry.note,
        createdAt: entry.createdAt,
        simulated: true,
      }));

    const openInvoices = invoices.filter((inv) => [
      billingModel.INVOICE_STATUSES.OPEN,
      billingModel.INVOICE_STATUSES.PARTIALLY_PAID,
      billingModel.INVOICE_STATUSES.PAST_DUE,
      billingModel.INVOICE_STATUSES.PAYMENT_FAILED_SIM,
      billingModel.INVOICE_STATUSES.SCHEDULED,
    ].includes(inv.status));
    const balanceCents = openInvoices.reduce((sum, inv) => billingModel.addCents(sum, inv.balanceCents), 0);
    const profile = profiles[0];

    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      featureMarker: "phase17-family-billing",
      testingBanner: billingModel.TESTING_BANNER,
      view: "guardian",
      noRealPayment: true,
      noPayButtonConnected: true,
      noPaymentCredentials: true,
      autopayPreferencePlaceholder: profile.autopayPreference || "off_placeholder",
      statementPreference: profile.statementPreference || "portal",
      balanceCents,
      balanceDisplay: billingModel.formatCents(balanceCents),
      openInvoices,
      invoices,
      paymentHistory: ledger,
      credits: ledger.filter((e) => e.type === billingModel.LEDGER_TYPES.CREDIT || e.type === billingModel.LEDGER_TYPES.REFUND),
      subsidyCopay: {
        subsidySource: profile.subsidySource || "",
        copayCents: profile.copayCents || 0,
        copayDisplay: billingModel.formatCents(profile.copayCents || 0),
        authorized: true,
      },
      printableStatement: {
        title: "Testing statement (printable)",
        householdId: profile.householdId,
        generatedAt: billingModel.nowIso(),
        balanceDisplay: billingModel.formatCents(balanceCents),
        testingOnly: true,
      },
      simulatedReceiptPlaceholder: {
        label: "Simulated receipt — no real payment processed",
        testingOnly: true,
      },
      recordRefs: {
        // Secure references only — ledger stays authoritative in billing simulator
        invoiceIds: invoices.map((i) => i.id),
        statementAvailable: true,
      },
      children: billingChildren,
      hiddenFromFamily: [
        "other_payer_private_information",
        "other_households",
        "internal_collection_notes",
        "provider_wide_financial_reports",
        "payment_credentials",
        "restricted_subsidy_notes",
      ],
    });
  }

  function matchRoute(method, pathname, url) {
    const path = String(pathname || "");
    const base = "/api/family-hub";
    if (!path.startsWith(base)) return null;

    if (method === "GET" && path === `${base}/status`) return (req, res) => handleStatus(req, res);
    if (method === "POST" && path === `${base}/seed`) return (req, res) => handleSeed(req, res);
    if (method === "GET" && path === `${base}/home`) return (req, res) => handleHome(req, res, url);
    if (method === "GET" && path === `${base}/today`) return (req, res) => handleToday(req, res, url);
    if (method === "GET" && path === `${base}/messages`) return (req, res) => messagingHandlers.handleMessagesInbox(req, res, url);
    if (method === "POST" && path === `${base}/messages/start`) return (req, res) => messagingHandlers.handleStartConversation(req, res);
    if (method === "POST" && path === `${base}/messages/draft`) return (req, res) => messagingHandlers.handleSaveDraft(req, res);
    if (method === "POST" && path === `${base}/messages/report-concern`) return (req, res) => messagingHandlers.handleReportConcernMessage(req, res);
    if (method === "POST" && path === `${base}/messages/attachments`) return (req, res) => messagingHandlers.handleAttachmentUpload(req, res);
    if (method === "GET" && /^\/api\/family-hub\/messages\/attachments\/[^/]+\/content$/.test(path)) {
      const id = decodeURIComponent(path.split("/attachments/")[1].split("/content")[0]);
      return (req, res) => messagingHandlers.handleAttachmentContent(req, res, id);
    }
    if (method === "GET" && /^\/api\/family-hub\/messages\/[^/]+$/.test(path)) {
      const id = decodeURIComponent(path.slice(`${base}/messages/`.length));
      return (req, res) => messagingHandlers.handleMessageThread(req, res, id);
    }
    if (method === "POST" && /\/messages\/[^/]+\/reply$/.test(path)) {
      const id = decodeURIComponent(path.split("/messages/")[1].split("/reply")[0]);
      return (req, res) => messagingHandlers.handleMessageReply(req, res, id);
    }
    if (method === "POST" && /\/messages\/[^/]+\/prefs$/.test(path)) {
      const id = decodeURIComponent(path.split("/messages/")[1].split("/prefs")[0]);
      return (req, res) => messagingHandlers.handleMessagePrefs(req, res, id);
    }
    if (method === "GET" && path === `${base}/notifications`) return (req, res) => messagingHandlers.handleFamilyNotifications(req, res);
    if (method === "POST" && path === `${base}/notifications/mark-read`) return (req, res) => messagingHandlers.handleMarkNotificationsRead(req, res);
    if (method === "GET" && /^\/api\/family-hub\/notifications\/[^/]+\/open$/.test(path)) {
      const id = decodeURIComponent(path.split("/notifications/")[1].split("/open")[0]);
      return (req, res) => messagingHandlers.handleNotificationOpen(req, res, id);
    }
    if (method === "GET" && path === `${base}/delivery-preferences`) return (req, res) => messagingHandlers.handleDeliveryPreferences(req, res);
    if (method === "POST" && path === `${base}/delivery-preferences`) return (req, res) => messagingHandlers.handleDeliveryPreferences(req, res);
    if (method === "GET" && path === `${base}/enrollment`) return (req, res) => enrollmentHandlers.handleEnrollmentList(req, res);
    if (method === "GET" && /^\/api\/family-hub\/enrollment\/[^/]+$/.test(path)) {
      const id = decodeURIComponent(path.slice(`${base}/enrollment/`.length));
      return (req, res) => enrollmentHandlers.handleEnrollmentCase(req, res, id);
    }
    if (method === "POST" && /\/enrollment\/[^/]+\/packet-progress$/.test(path)) {
      const id = decodeURIComponent(path.split("/enrollment/")[1].split("/packet-progress")[0]);
      return (req, res) => enrollmentHandlers.handleSavePacketProgress(req, res, id);
    }
    if (method === "POST" && /\/enrollment\/offers\/[^/]+\/respond$/.test(path)) {
      const id = decodeURIComponent(path.split("/enrollment/offers/")[1].split("/respond")[0]);
      return (req, res) => enrollmentHandlers.handleOfferRespond(req, res, id);
    }
    if (method === "GET" && path === `${base}/records`) return (req, res) => recordsHandlers.handleRecordsList(req, res, url);
    if (method === "POST" && path === `${base}/records/upload`) return (req, res) => recordsHandlers.handleUpload(req, res);
    if (method === "GET" && /^\/api\/family-hub\/records\/[^/]+$/.test(path)) {
      const id = decodeURIComponent(path.slice(`${base}/records/`.length));
      return (req, res) => recordsHandlers.handleRecordDetail(req, res, id);
    }
    if (method === "GET" && path === `${base}/licensing/tasks`) return (req, res) => handleLicensingTasks(req, res);
    if (method === "GET" && path === `${base}/billing`) return (req, res) => handleBilling(req, res);
    if (method === "GET" && path === `${base}/updates`) return (req, res) => handleUpdatesFeed(req, res, url);
    if (method === "GET" && path === `${base}/daily-reports`) return (req, res) => handleDailyReports(req, res, url);
    if (method === "GET" && path === `${base}/media`) return (req, res) => handleFamilyMediaList(req, res, url);
    if (method === "GET" && /^\/api\/family-hub\/media\/[^/]+\/content$/.test(path)) {
      const id = decodeURIComponent(path.split("/media/")[1].split("/content")[0]);
      return (req, res) => handleMediaContent(req, res, id);
    }
    if (method === "POST" && path === `${base}/acknowledge`) return (req, res) => handleAcknowledge(req, res);
    if (method === "POST" && path === `${base}/concern-request`) return (req, res) => handleConcern(req, res);
    if (method === "GET" && path === `${base}/children`) return (req, res) => handleChildren(req, res);
    if (method === "GET" && path.startsWith(`${base}/children/`)) {
      const id = decodeURIComponent(path.slice(`${base}/children/`.length).split("/")[0]);
      return (req, res) => handleChildDetail(req, res, id);
    }
    if (method === "GET" && path === `${base}/forms`) return (req, res) => handleFormsList(req, res, url);
    if (method === "GET" && /^\/api\/family-hub\/forms\/[^/]+$/.test(path)) {
      const id = decodeURIComponent(path.slice(`${base}/forms/`.length));
      return (req, res) => handleFormOpen(req, res, id);
    }
    if (method === "POST" && /\/forms\/[^/]+\/save-draft$/.test(path)) {
      const id = decodeURIComponent(path.split("/forms/")[1].split("/save-draft")[0]);
      return (req, res) => handleFormSaveDraft(req, res, id);
    }
    if (method === "POST" && /\/forms\/[^/]+\/submit$/.test(path)) {
      const id = decodeURIComponent(path.split("/forms/")[1].split("/submit")[0]);
      return (req, res) => handleFormSubmit(req, res, id);
    }
    if (method === "GET" && /\/forms\/[^/]+\/document$/.test(path)) {
      const id = decodeURIComponent(path.split("/forms/")[1].split("/document")[0]);
      return (req, res) => handleFormDocument(req, res, id);
    }
    if (method === "GET" && path === `${base}/documents`) return (req, res) => handleDocuments(req, res, url);
    if (method === "POST" && path === `${base}/documents/upload`) return (req, res) => handleUploadDocument(req, res);
    if (method === "GET" && path === `${base}/calendar`) return (req, res) => handleCalendar(req, res, url);
    if (method === "GET" && path === `${base}/account`) return (req, res) => handleAccount(req, res);
    if (method === "POST" && path === `${base}/account/change-request`) return (req, res) => handleChangeRequest(req, res);
    if (method === "POST" && path === `${base}/account/notification-preferences`) return (req, res) => handleNotificationPrefs(req, res);
    if (method === "POST" && path === `${base}/account/change-password`) return (req, res) => handleChangePassword(req, res);
    return null;
  }

  return { matchRoute };
}

module.exports = {
  createFamilyHubApi,
  TESTING_BANNER,
};
