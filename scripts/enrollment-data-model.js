/**
 * Phase 12 — Enrollment pipeline: inquiry → tour → application → waitlist/offer → forms → enrolled.
 * Fake data only. No real email/SMS/push/Stripe/AI. Production public inquiries remain unavailable.
 */

const crypto = require("node:crypto");
const familyModel = require("./family-foundation-data-model.js");
const foundation = require("./foundation-data-model.js");
const hub = require("./family-hub-data-model.js");
const messagingModel = require("./family-messaging-data-model.js");

const PIPELINE_STAGES = Object.freeze({
  NEW_INQUIRY: "new_inquiry",
  CONTACTED: "contacted",
  TOUR_REQUESTED: "tour_requested",
  TOUR_SCHEDULED: "tour_scheduled",
  TOUR_COMPLETED: "tour_completed",
  APPLICATION_STARTED: "application_started",
  APPLICATION_SUBMITTED: "application_submitted",
  UNDER_REVIEW: "under_review",
  MISSING_INFORMATION: "missing_information",
  WAITLISTED: "waitlisted",
  OFFER_PREPARED: "offer_prepared",
  OFFER_SENT_TESTING: "offer_sent_testing",
  OFFER_ACCEPTED: "offer_accepted",
  OFFER_DECLINED: "offer_declined",
  ENROLLMENT_FORMS_IN_PROGRESS: "enrollment_forms_in_progress",
  READY_FOR_ENROLLMENT: "ready_for_enrollment",
  ENROLLED: "enrolled",
  WITHDRAWN: "withdrawn",
  DECLINED_BY_PROGRAM: "declined_by_program",
  EXPIRED: "expired",
  ARCHIVED: "archived",
});

const FAMILY_FRIENDLY_STATUS = Object.freeze({
  [PIPELINE_STAGES.NEW_INQUIRY]: "We received your interest",
  [PIPELINE_STAGES.CONTACTED]: "Our team is in touch",
  [PIPELINE_STAGES.TOUR_REQUESTED]: "Tour requested",
  [PIPELINE_STAGES.TOUR_SCHEDULED]: "Tour scheduled",
  [PIPELINE_STAGES.TOUR_COMPLETED]: "Tour completed",
  [PIPELINE_STAGES.APPLICATION_STARTED]: "Application in progress",
  [PIPELINE_STAGES.APPLICATION_SUBMITTED]: "Application submitted",
  [PIPELINE_STAGES.UNDER_REVIEW]: "Application under review",
  [PIPELINE_STAGES.MISSING_INFORMATION]: "Items need your attention",
  [PIPELINE_STAGES.WAITLISTED]: "On the waitlist",
  [PIPELINE_STAGES.OFFER_PREPARED]: "Offer being prepared",
  [PIPELINE_STAGES.OFFER_SENT_TESTING]: "Enrollment offer available",
  [PIPELINE_STAGES.OFFER_ACCEPTED]: "Offer accepted — pending program approval",
  [PIPELINE_STAGES.OFFER_DECLINED]: "Offer declined",
  [PIPELINE_STAGES.ENROLLMENT_FORMS_IN_PROGRESS]: "Enrollment forms in progress",
  [PIPELINE_STAGES.READY_FOR_ENROLLMENT]: "Ready for enrollment",
  [PIPELINE_STAGES.ENROLLED]: "Enrolled",
  [PIPELINE_STAGES.WITHDRAWN]: "Withdrawn",
  [PIPELINE_STAGES.DECLINED_BY_PROGRAM]: "Not moving forward at this time",
  [PIPELINE_STAGES.EXPIRED]: "Application expired",
  [PIPELINE_STAGES.ARCHIVED]: "Archived",
});

const WAITLIST_STATUSES = Object.freeze({
  ACTIVE: "active",
  OFFERED: "offered",
  PAUSED: "paused",
  DECLINED: "declined",
  WITHDRAWN: "withdrawn",
  ENROLLED: "enrolled",
  ARCHIVED: "archived",
});

const TOUR_STATUSES = Object.freeze({
  REQUESTED: "requested",
  SCHEDULED: "scheduled",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  NO_SHOW: "no_show",
  RESCHEDULED: "rescheduled",
});

const OFFER_STATUSES = Object.freeze({
  DRAFT: "draft",
  SENT_TESTING: "sent_testing",
  ACCEPTED: "accepted",
  DECLINED: "declined",
  EXPIRED: "expired",
  WITHDRAWN: "withdrawn",
});

const PACKET_ITEM_STATUSES = Object.freeze({
  NOT_STARTED: "not_started",
  IN_PROGRESS: "in_progress",
  SUBMITTED: "submitted",
  RETURNED: "returned",
  APPROVED: "approved",
  MISSING: "missing",
});

const ENROLLMENT_NOTIFICATION_KINDS = Object.freeze({
  INQUIRY_RECEIVED: "inquiry_received",
  TOUR_SCHEDULED: "tour_scheduled",
  TOUR_CHANGED: "tour_changed",
  APPLICATION_AVAILABLE: "application_available",
  MISSING_INFORMATION: "missing_information",
  WAITLIST_UPDATE: "waitlist_update",
  OFFER_AVAILABLE: "offer_available",
  FORMS_RETURNED: "forms_returned",
  ENROLLMENT_ACCEPTED: "enrollment_accepted",
});

const TESTING_BANNER = "Testing Account — Fake Data Only. Not a real enrollment.";
const PUBLIC_INQUIRY_DISABLED_MESSAGE = "Public production inquiries are unavailable. Use the testing-preview inquiry form only.";

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function nowIso() {
  return new Date().toISOString();
}

function cleanText(value, max = 1000) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanLongText(value, max = 8000) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);
}

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

function ensureEnrollmentStore(store) {
  if (!store || typeof store !== "object") throw new Error("store is required");
  hub.ensureFamilyHubStore(store);
  messagingModel.ensureFamilyMessagingStore(store);
  foundation.ensureFoundationStore(store);
  store.enrollment = store.enrollment && typeof store.enrollment === "object" ? store.enrollment : {};
  const en = store.enrollment;
  en.cases = en.cases && typeof en.cases === "object" && !Array.isArray(en.cases) ? en.cases : {};
  en.inquiries = en.inquiries && typeof en.inquiries === "object" && !Array.isArray(en.inquiries) ? en.inquiries : {};
  en.tours = en.tours && typeof en.tours === "object" && !Array.isArray(en.tours) ? en.tours : {};
  en.tourSlots = en.tourSlots && typeof en.tourSlots === "object" && !Array.isArray(en.tourSlots) ? en.tourSlots : {};
  en.waitlist = en.waitlist && typeof en.waitlist === "object" && !Array.isArray(en.waitlist) ? en.waitlist : {};
  en.offers = en.offers && typeof en.offers === "object" && !Array.isArray(en.offers) ? en.offers : {};
  en.packets = en.packets && typeof en.packets === "object" && !Array.isArray(en.packets) ? en.packets : {};
  en.capacity = en.capacity && typeof en.capacity === "object" && !Array.isArray(en.capacity) ? en.capacity : {};
  en.priorityRules = en.priorityRules && typeof en.priorityRules === "object" && !Array.isArray(en.priorityRules) ? en.priorityRules : {};
  en.conversionSummaries = en.conversionSummaries && typeof en.conversionSummaries === "object" && !Array.isArray(en.conversionSummaries) ? en.conversionSummaries : {};
  en.audit = en.audit && typeof en.audit === "object" && !Array.isArray(en.audit) ? en.audit : {};
  en.rateLimit = en.rateLimit && typeof en.rateLimit === "object" && !Array.isArray(en.rateLimit) ? en.rateLimit : {};
  en.messageTemplates = en.messageTemplates && typeof en.messageTemplates === "object" && !Array.isArray(en.messageTemplates) ? en.messageTemplates : {};
  en.meta = {
    ...(en.meta && typeof en.meta === "object" ? en.meta : {}),
    createdAt: en.meta?.createdAt || nowIso(),
    updatedAt: nowIso(),
    phase: 12,
    testingOnly: true,
    publicProductionInquiriesUnavailable: true,
    noOutboundEmail: true,
    noOutboundSms: true,
    noPush: true,
    noStripe: true,
    noLiveAi: true,
    noAutomaticEnrollmentDecisions: true,
    note: "Phase 12 enrollment pipeline. Fake/testing only. External delivery disabled.",
  };
  return store;
}

function createAuditRecord({ organizationId, caseId, action, actorEmail, actorRole, detail, previous, next }) {
  return {
    id: newId("enaudit"),
    organizationId: cleanText(organizationId, 80),
    caseId: cleanText(caseId, 80),
    action: cleanText(action, 80),
    actorEmail: cleanText(actorEmail, 160).toLowerCase(),
    actorRole: cleanText(actorRole, 40),
    detail: cleanText(detail, 500),
    previous: previous == null ? null : previous,
    next: next == null ? null : next,
    createdAt: nowIso(),
  };
}

function appendAudit(store, input) {
  ensureEnrollmentStore(store);
  const row = createAuditRecord(input);
  store.enrollment.audit[row.id] = row;
  return row;
}

function createCaseRecord(input = {}) {
  const now = nowIso();
  const stage = PIPELINE_STAGES[String(input.stage || "").toUpperCase()] || input.stage || PIPELINE_STAGES.NEW_INQUIRY;
  return {
    id: input.id || newId("encase"),
    organizationId: cleanText(input.organizationId, 80),
    programLocationId: cleanText(input.programLocationId, 80),
    testingOnly: true,
    fakeLabel: cleanText(input.fakeLabel || "FAKE testing enrollment case", 120),
    stage,
    stageHistory: Array.isArray(input.stageHistory) ? input.stageHistory : [{ stage, at: now, by: cleanText(input.createdByEmail, 160).toLowerCase() }],
    guardianName: cleanText(input.guardianName, 120),
    guardianEmail: cleanText(input.guardianEmail, 160).toLowerCase(),
    guardianPhone: cleanText(input.guardianPhone, 40),
    childName: cleanText(input.childName, 120),
    childBirthDate: cleanText(input.childBirthDate, 40),
    childAgeMonths: Number.isFinite(Number(input.childAgeMonths)) ? Number(input.childAgeMonths) : null,
    desiredStartDate: cleanText(input.desiredStartDate, 40),
    desiredSchedule: cleanText(input.desiredSchedule, 120),
    daysNeeded: Array.isArray(input.daysNeeded) ? input.daysNeeded.map((d) => cleanText(d, 20)).slice(0, 7) : [],
    hoursNeeded: cleanText(input.hoursNeeded, 80),
    preferredClassroomId: cleanText(input.preferredClassroomId, 80),
    preferredAgeGroup: cleanText(input.preferredAgeGroup, 80),
    siblingInfo: cleanText(input.siblingInfo, 400),
    programInterests: cleanText(input.programInterests, 400),
    heardAbout: cleanText(input.heardAbout, 200),
    tourRequested: input.tourRequested === true,
    providerQuestions: Array.isArray(input.providerQuestions) ? input.providerQuestions.slice(0, 20) : [],
    familyNotes: cleanLongText(input.familyNotes, 2000),
    internalNotes: cleanLongText(input.internalNotes, 4000),
    confidentialDeclineReason: cleanLongText(input.confidentialDeclineReason, 1000),
    assignedStaffEmail: cleanText(input.assignedStaffEmail, 160).toLowerCase(),
    householdId: cleanText(input.householdId, 80),
    contactId: cleanText(input.contactId, 80),
    childId: cleanText(input.childId, 80),
    inquiryId: cleanText(input.inquiryId, 80),
    tourId: cleanText(input.tourId, 80),
    waitlistId: cleanText(input.waitlistId, 80),
    offerId: cleanText(input.offerId, 80),
    packetId: cleanText(input.packetId, 80),
    missingInformation: Array.isArray(input.missingInformation) ? input.missingInformation.map((x) => cleanText(x, 120)).slice(0, 30) : [],
    applicationStatus: cleanText(input.applicationStatus || "not_started", 40),
    tourStatus: cleanText(input.tourStatus || "", 40),
    waitlistPriority: cleanText(input.waitlistPriority || "", 80),
    futureStart: input.futureStart === true,
    enrolledAt: cleanText(input.enrolledAt, 40),
    classroomPlacementId: cleanText(input.classroomPlacementId, 80),
    createdByEmail: cleanText(input.createdByEmail, 160).toLowerCase(),
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
    archived: input.archived === true,
  };
}

function setCaseStage(store, caseRow, stage, actorEmail, note) {
  ensureEnrollmentStore(store);
  if (!Object.values(PIPELINE_STAGES).includes(stage)) throw new Error("invalid_stage");
  const previous = caseRow.stage;
  caseRow.stage = stage;
  caseRow.updatedAt = nowIso();
  caseRow.stageHistory = Array.isArray(caseRow.stageHistory) ? caseRow.stageHistory : [];
  caseRow.stageHistory.push({ stage, at: caseRow.updatedAt, by: cleanText(actorEmail, 160).toLowerCase(), note: cleanText(note, 200) });
  if (stage === PIPELINE_STAGES.ARCHIVED) caseRow.archived = true;
  appendAudit(store, {
    organizationId: caseRow.organizationId,
    caseId: caseRow.id,
    action: "stage_change",
    actorEmail,
    detail: note || "",
    previous,
    next: stage,
  });
  return caseRow;
}

function createInquiryRecord(input = {}) {
  const now = nowIso();
  return {
    id: input.id || newId("eninq"),
    organizationId: cleanText(input.organizationId, 80),
    caseId: cleanText(input.caseId, 80),
    testingOnly: true,
    fakeLabel: "FAKE testing inquiry — not a real family submission",
    source: cleanText(input.source || "testing_preview_form", 80),
    guardianName: cleanText(input.guardianName, 120),
    guardianEmail: cleanText(input.guardianEmail, 160).toLowerCase(),
    guardianPhone: cleanText(input.guardianPhone, 40),
    childName: cleanText(input.childName, 120),
    childBirthDate: cleanText(input.childBirthDate, 40),
    desiredStartDate: cleanText(input.desiredStartDate, 40),
    desiredSchedule: cleanText(input.desiredSchedule, 120),
    daysNeeded: Array.isArray(input.daysNeeded) ? input.daysNeeded.map((d) => cleanText(d, 20)).slice(0, 7) : [],
    hoursNeeded: cleanText(input.hoursNeeded, 80),
    preferredClassroomId: cleanText(input.preferredClassroomId, 80),
    preferredAgeGroup: cleanText(input.preferredAgeGroup, 80),
    siblingInfo: cleanText(input.siblingInfo, 400),
    programInterests: cleanText(input.programInterests, 400),
    heardAbout: cleanText(input.heardAbout, 200),
    tourRequest: input.tourRequest === true,
    providerAnswers: input.providerAnswers && typeof input.providerAnswers === "object" ? input.providerAnswers : {},
    notes: cleanLongText(input.notes, 2000),
    rateLimitKey: cleanText(input.rateLimitKey, 200),
    createdAt: input.createdAt || now,
  };
}

function createTourSlotRecord(input = {}) {
  return {
    id: input.id || newId("entslot"),
    organizationId: cleanText(input.organizationId, 80),
    startsAt: cleanText(input.startsAt, 40),
    endsAt: cleanText(input.endsAt, 40),
    capacity: Number.isFinite(Number(input.capacity)) ? Number(input.capacity) : 2,
    assignedStaffEmail: cleanText(input.assignedStaffEmail, 160).toLowerCase(),
    notes: cleanText(input.notes, 400),
    active: input.active !== false,
    createdAt: input.createdAt || nowIso(),
  };
}

function createTourRecord(input = {}) {
  const now = nowIso();
  return {
    id: input.id || newId("entour"),
    organizationId: cleanText(input.organizationId, 80),
    caseId: cleanText(input.caseId, 80),
    slotId: cleanText(input.slotId, 80),
    status: Object.values(TOUR_STATUSES).includes(input.status) ? input.status : TOUR_STATUSES.SCHEDULED,
    scheduledAt: cleanText(input.scheduledAt, 40),
    assignedStaffEmail: cleanText(input.assignedStaffEmail, 160).toLowerCase(),
    attendance: cleanText(input.attendance || "", 40),
    providerNotes: cleanLongText(input.providerNotes, 2000),
    familyQuestions: cleanLongText(input.familyQuestions, 2000),
    followUpNeeded: input.followUpNeeded === true,
    invitationTemplateStored: true,
    invitationSentExternally: false,
    history: Array.isArray(input.history) ? input.history : [{ status: input.status || TOUR_STATUSES.SCHEDULED, at: now }],
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

function createWaitlistRecord(input = {}) {
  const now = nowIso();
  return {
    id: input.id || newId("enwl"),
    organizationId: cleanText(input.organizationId, 80),
    caseId: cleanText(input.caseId, 80),
    desiredStartDate: cleanText(input.desiredStartDate, 40),
    childAgeMonths: Number.isFinite(Number(input.childAgeMonths)) ? Number(input.childAgeMonths) : null,
    projectedAgeMonths: Number.isFinite(Number(input.projectedAgeMonths)) ? Number(input.projectedAgeMonths) : null,
    scheduleNeeded: cleanText(input.scheduleNeeded, 120),
    preferredClassroomId: cleanText(input.preferredClassroomId, 80),
    dateAdded: input.dateAdded || now,
    priorityCategory: cleanText(input.priorityCategory || "standard", 80),
    siblingPreference: input.siblingPreference === true,
    subsidyNoteInternal: cleanLongText(input.subsidyNoteInternal, 1000),
    providerNotes: cleanLongText(input.providerNotes, 2000),
    status: Object.values(WAITLIST_STATUSES).includes(input.status) ? input.status : WAITLIST_STATUSES.ACTIVE,
    displayPosition: input.displayPosition == null ? null : Number(input.displayPosition),
    showNumericalPosition: input.showNumericalPosition === true,
    priorityExplanation: cleanText(input.priorityExplanation || "Priority is reviewed by the director before any offer.", 300),
    history: Array.isArray(input.history) ? input.history : [{
      status: input.status || WAITLIST_STATUSES.ACTIVE,
      priorityCategory: input.priorityCategory || "standard",
      at: now,
      by: cleanText(input.createdByEmail, 160).toLowerCase(),
    }],
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

function createOfferRecord(input = {}) {
  const now = nowIso();
  return {
    id: input.id || newId("enoffer"),
    organizationId: cleanText(input.organizationId, 80),
    caseId: cleanText(input.caseId, 80),
    testingOnly: true,
    fakeLabel: "FAKE testing enrollment offer — no real charge",
    childName: cleanText(input.childName, 120),
    programLocationId: cleanText(input.programLocationId, 80),
    classroomId: cleanText(input.classroomId, 80),
    ageGroup: cleanText(input.ageGroup, 80),
    proposedStartDate: cleanText(input.proposedStartDate, 40),
    schedule: cleanText(input.schedule, 120),
    tuitionAmountSimulated: Number(input.tuitionAmountSimulated) || 0,
    registrationFeeSimulated: Number(input.registrationFeeSimulated) || 0,
    depositSimulated: Number(input.depositSimulated) || 0,
    currency: "USD",
    expiresAt: cleanText(input.expiresAt, 40),
    requiredFormKeys: Array.isArray(input.requiredFormKeys) ? input.requiredFormKeys.map((k) => cleanText(k, 80)).slice(0, 30) : [],
    providerTerms: cleanLongText(input.providerTerms, 4000),
    guardianAcknowledgment: cleanText(input.guardianAcknowledgment, 500),
    status: Object.values(OFFER_STATUSES).includes(input.status) ? input.status : OFFER_STATUSES.DRAFT,
    acceptedAt: cleanText(input.acceptedAt, 40),
    declinedAt: cleanText(input.declinedAt, 40),
    declineReasonFamily: cleanText(input.declineReasonFamily, 400),
    stripeCheckoutUsed: false,
    realChargeAttempted: false,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

function createPacketRecord(input = {}) {
  const now = nowIso();
  const items = Array.isArray(input.items) ? input.items : [];
  return {
    id: input.id || newId("enpkt"),
    organizationId: cleanText(input.organizationId, 80),
    caseId: cleanText(input.caseId, 80),
    title: cleanText(input.title || "Enrollment packet (testing)", 160),
    items: items.map((item) => ({
      key: cleanText(item.key, 80),
      title: cleanText(item.title, 160),
      formTemplateId: cleanText(item.formTemplateId, 80),
      formVersionId: cleanText(item.formVersionId, 80),
      assignmentId: cleanText(item.assignmentId, 80),
      status: Object.values(PACKET_ITEM_STATUSES).includes(item.status) ? item.status : PACKET_ITEM_STATUSES.NOT_STARTED,
      signaturePreserved: item.signaturePreserved === true,
      returnedReason: cleanText(item.returnedReason, 400),
      approvedAt: cleanText(item.approvedAt, 40),
    })),
    overallStatus: cleanText(input.overallStatus || "in_progress", 40),
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

function createCapacityRecord(input = {}) {
  return {
    id: input.id || newId("encap"),
    organizationId: cleanText(input.organizationId, 80),
    classroomId: cleanText(input.classroomId, 80),
    classroomName: cleanText(input.classroomName, 120),
    ageRangeLabel: cleanText(input.ageRangeLabel, 80),
    licensedCapacity: Number(input.licensedCapacity) || 0,
    planClassroomLimit: Number(input.planClassroomLimit) || 0,
    currentEnrollment: Number(input.currentEnrollment) || 0,
    expectedDepartures: Number(input.expectedDepartures) || 0,
    futureStarts: Number(input.futureStarts) || 0,
    scheduleAvailabilityNote: cleanText(input.scheduleAvailabilityNote, 300),
    updatedAt: nowIso(),
  };
}

function capacityGuidance(capacityRow, requestedStarts = 1) {
  if (!capacityRow) {
    return { level: "unknown", warning: "No capacity data for this classroom.", canAutoPlace: false };
  }
  const limit = Math.min(
    capacityRow.licensedCapacity || Infinity,
    capacityRow.planClassroomLimit || Infinity,
  );
  const projected = (capacityRow.currentEnrollment || 0) - (capacityRow.expectedDepartures || 0) + (capacityRow.futureStarts || 0) + requestedStarts;
  const available = Number.isFinite(limit) ? limit - ((capacityRow.currentEnrollment || 0) - (capacityRow.expectedDepartures || 0) + (capacityRow.futureStarts || 0)) : null;
  if (available != null && available < requestedStarts) {
    return {
      level: "over_capacity",
      warning: `Placement would exceed capacity guidance (projected ${projected} vs limit ${limit}). Director review required; automatic exceed is blocked.`,
      canAutoPlace: false,
      available,
      projected,
      limit,
    };
  }
  if (available != null && available <= 2) {
    return {
      level: "tight",
      warning: `Limited availability (${available} seat(s) under guidance). Final placement requires authorized provider decision.`,
      canAutoPlace: false,
      available,
      projected,
      limit,
    };
  }
  return {
    level: "ok",
    warning: "Capacity guidance looks available. Authorized provider must still confirm placement.",
    canAutoPlace: false,
    available,
    projected,
    limit,
  };
}

function createConversionSummary(input = {}) {
  return {
    id: input.id || newId("enconv"),
    organizationId: cleanText(input.organizationId, 80),
    caseId: cleanText(input.caseId, 80),
    householdAction: cleanText(input.householdAction || "reuse_or_create", 40),
    householdId: cleanText(input.householdId, 80),
    contactAction: cleanText(input.contactAction || "reuse_or_create", 40),
    contactId: cleanText(input.contactId, 80),
    childAction: cleanText(input.childAction || "reuse_or_create", 40),
    childId: cleanText(input.childId, 80),
    classroomId: cleanText(input.classroomId, 80),
    duplicateWarnings: Array.isArray(input.duplicateWarnings) ? input.duplicateWarnings.slice(0, 20) : [],
    autoMerge: false,
    providerMustConfirm: true,
    confirmed: input.confirmed === true,
    confirmedAt: cleanText(input.confirmedAt, 40),
    confirmedByEmail: cleanText(input.confirmedByEmail, 160).toLowerCase(),
    preservesInquiryTourApplicationWaitlistOfferForms: true,
    createdAt: input.createdAt || nowIso(),
  };
}

function findDuplicateWarnings(store, caseRow) {
  ensureEnrollmentStore(store);
  const warnings = [];
  const contacts = listValues(store.familyFoundation?.contacts || {});
  const children = listValues(store.childRecords || store.children || {});
  const email = cleanText(caseRow.guardianEmail, 160).toLowerCase();
  const childName = cleanText(caseRow.childName, 120).toLowerCase();
  for (const contact of contacts) {
    if (contact.organizationId !== caseRow.organizationId) continue;
    if (cleanText(contact.email, 160).toLowerCase() === email && email) {
      warnings.push({
        type: "possible_duplicate_guardian",
        contactId: contact.id,
        message: `Guardian email matches existing contact ${contact.id}. Review before creating. Never auto-merge.`,
      });
    }
  }
  for (const child of children) {
    if (child.organizationId && child.organizationId !== caseRow.organizationId) continue;
    if (cleanText(child.displayName || child.name || "", 120).toLowerCase() === childName && childName) {
      warnings.push({
        type: "possible_duplicate_child",
        childId: child.id,
        message: `Child name matches existing child ${child.id}. Review before creating. Never auto-merge.`,
      });
    }
  }
  return warnings;
}

function createEnrollmentNotification(store, input = {}) {
  messagingModel.ensureFamilyMessagingStore(store);
  const note = messagingModel.createNotificationRecord({
    organizationId: input.organizationId,
    recipientEmail: input.recipientEmail,
    recipientRole: input.recipientRole || "guardian",
    kind: input.kind,
    title: input.title,
    preview: input.preview || input.body || "",
    conversationId: "",
    targetType: "enrollment",
    targetId: input.targetId || input.caseId || "",
    deepLink: input.deepLink || "#family-hub?tab=enrollment",
    adminOnly: input.adminOnly === true,
  });
  note.sentExternally = false;
  note.deliveryChannelsAttempted = { inApp: true, email: false, sms: false, push: false };
  note.enrollmentCaseId = cleanText(input.caseId, 80);
  store.familyMessaging.notifications[note.id] = note;
  return note;
}

function familySafeCaseView(caseRow, { includeInternal = false } = {}) {
  if (!caseRow) return null;
  const view = {
    id: caseRow.id,
    testingOnly: true,
    fakeLabel: caseRow.fakeLabel,
    statusLabel: FAMILY_FRIENDLY_STATUS[caseRow.stage] || "In progress",
    stage: caseRow.stage,
    childName: caseRow.childName,
    desiredStartDate: caseRow.desiredStartDate,
    desiredSchedule: caseRow.desiredSchedule,
    tourStatus: caseRow.tourStatus,
    applicationStatus: caseRow.applicationStatus,
    missingInformation: caseRow.missingInformation || [],
    offerId: caseRow.offerId,
    packetId: caseRow.packetId,
    futureStart: caseRow.futureStart === true,
    enrolledAt: caseRow.enrolledAt || "",
    programContactNote: "Contact your program through Family Hub Messages (in-app testing only).",
  };
  if (includeInternal) {
    view.internalNotes = caseRow.internalNotes;
    view.confidentialDeclineReason = caseRow.confidentialDeclineReason;
    view.waitlistPriority = caseRow.waitlistPriority;
  }
  return view;
}

function defaultPacketItems() {
  return [
    { key: "enrollment_application", title: "Enrollment application", status: PACKET_ITEM_STATUSES.NOT_STARTED },
    { key: "emergency_contacts", title: "Emergency contacts", status: PACKET_ITEM_STATUSES.NOT_STARTED },
    { key: "authorized_pickup", title: "Authorized pickup", status: PACKET_ITEM_STATUSES.NOT_STARTED },
    { key: "health_immunization", title: "Health and immunization records", status: PACKET_ITEM_STATUSES.NOT_STARTED },
    { key: "allergies", title: "Allergies", status: PACKET_ITEM_STATUSES.NOT_STARTED },
    { key: "medication_authorization", title: "Medication authorization", status: PACKET_ITEM_STATUSES.NOT_STARTED },
    { key: "permissions_releases", title: "Permissions and releases", status: PACKET_ITEM_STATUSES.NOT_STARTED },
    { key: "tuition_agreement", title: "Tuition agreement", status: PACKET_ITEM_STATUSES.NOT_STARTED },
    { key: "handbook_acknowledgment", title: "Handbook acknowledgment", status: PACKET_ITEM_STATUSES.NOT_STARTED },
  ];
}

function checkInquiryRateLimit(store, key, { windowMs = 60_000, max = 5 } = {}) {
  ensureEnrollmentStore(store);
  const now = Date.now();
  const entry = store.enrollment.rateLimit[key] || { hits: [] };
  entry.hits = (entry.hits || []).filter((t) => now - t < windowMs);
  if (entry.hits.length >= max) {
    store.enrollment.rateLimit[key] = entry;
    return { allowed: false, retryAfterMs: windowMs - (now - entry.hits[0]) };
  }
  entry.hits.push(now);
  store.enrollment.rateLimit[key] = entry;
  return { allowed: true };
}

function defaultPriorityRules(organizationId) {
  return {
    id: newId("enprio"),
    organizationId,
    rules: [
      { key: "sibling", label: "Sibling preference", weight: 10 },
      { key: "staff_child", label: "Staff child", weight: 8 },
      { key: "date_added", label: "Date added", weight: 1 },
    ],
    requireDirectorReviewBeforeOfferOrDenial: true,
    noAutomaticDiscriminatoryDecisions: true,
    showNumericalPositionByDefault: false,
    updatedAt: nowIso(),
  };
}

function defaultMessageTemplates(organizationId) {
  return {
    id: newId("enmsgtmpl"),
    organizationId,
    tourInvitationEmail: { subject: "Tour invitation (testing template)", body: "Stored for future use. Not sent.", sentExternally: false },
    tourInvitationSms: { body: "Stored for future use. Not sent.", sentExternally: false },
    offerEmail: { subject: "Enrollment offer (testing template)", body: "Stored for future use. Not sent.", sentExternally: false },
    updatedAt: nowIso(),
  };
}

module.exports = {
  PIPELINE_STAGES,
  FAMILY_FRIENDLY_STATUS,
  WAITLIST_STATUSES,
  TOUR_STATUSES,
  OFFER_STATUSES,
  PACKET_ITEM_STATUSES,
  ENROLLMENT_NOTIFICATION_KINDS,
  TESTING_BANNER,
  PUBLIC_INQUIRY_DISABLED_MESSAGE,
  newId,
  nowIso,
  cleanText,
  cleanLongText,
  listValues,
  ensureEnrollmentStore,
  createAuditRecord,
  appendAudit,
  createCaseRecord,
  setCaseStage,
  createInquiryRecord,
  createTourSlotRecord,
  createTourRecord,
  createWaitlistRecord,
  createOfferRecord,
  createPacketRecord,
  createCapacityRecord,
  capacityGuidance,
  createConversionSummary,
  findDuplicateWarnings,
  createEnrollmentNotification,
  familySafeCaseView,
  defaultPacketItems,
  checkInquiryRateLimit,
  defaultPriorityRules,
  defaultMessageTemplates,
};
