/**
 * Phase 12 enrollment fixtures — resettable fake pipeline scenarios.
 * Uses @example.invalid contacts and fake children only.
 */

const phase11 = require("./family-messaging-fixtures.js");
const foundation = require("./foundation-data-model.js");
const model = require("./enrollment-data-model.js");

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

function ensurePhase12Preview(store, { adminEmail = "phase12.owner@example.invalid", organizationId = "" } = {}) {
  model.ensureEnrollmentStore(store);
  const seeded11 = phase11.ensurePhase11Preview(store, { adminEmail, organizationId });
  const orgId = seeded11.organizationId || organizationId;

  if (store.enrollment.meta?.phase12SeededFor === orgId) {
    return {
      organizationId: orgId,
      alreadySeeded: true,
      contactIds: seeded11.contactIds,
      childIds: seeded11.childIds,
      caseIds: store.enrollment.meta.phase12CaseIds || {},
    };
  }

  const contactIds = seeded11.contactIds || {};
  const childIds = seeded11.childIds || {};
  const classroom = listValues(store.classrooms).find((row) => row.organizationId === orgId && /Sunshine/i.test(row.name || ""))
    || listValues(store.classrooms).find((row) => row.organizationId === orgId);
  const classroomId = classroom?.id || "";
  const staff = listValues(store.staffMemberships).find((row) => row.organizationId === orgId && row.role === foundation.STAFF_ROLES.LEAD_TEACHER)
    || listValues(store.staffMemberships).find((row) => row.organizationId === orgId);
  const staffEmail = staff?.userEmail || "lead.teacher@example.invalid";
  const directorEmail = adminEmail;

  store.enrollment.priorityRules[orgId] = model.defaultPriorityRules(orgId);
  store.enrollment.messageTemplates[orgId] = model.defaultMessageTemplates(orgId);

  const capacity = model.createCapacityRecord({
    organizationId: orgId,
    classroomId,
    classroomName: classroom?.name || "Sunshine Room (Fixture)",
    ageRangeLabel: "2–3 years",
    licensedCapacity: 12,
    planClassroomLimit: 12,
    currentEnrollment: 10,
    expectedDepartures: 1,
    futureStarts: 1,
    scheduleAvailabilityNote: "Full-time Mon–Fri mornings preferred (fixture).",
  });
  store.enrollment.capacity[capacity.id] = capacity;

  const caseIds = {};

  function putCase(key, caseInput, extras = {}) {
    const row = model.createCaseRecord({
      organizationId: orgId,
      preferredClassroomId: classroomId,
      assignedStaffEmail: staffEmail,
      createdByEmail: directorEmail,
      ...caseInput,
    });
    store.enrollment.cases[row.id] = row;
    caseIds[key] = row.id;
    if (extras.inquiry) {
      const inq = model.createInquiryRecord({ ...extras.inquiry, organizationId: orgId, caseId: row.id });
      store.enrollment.inquiries[inq.id] = inq;
      row.inquiryId = inq.id;
    }
    if (extras.tour) {
      const tour = model.createTourRecord({ ...extras.tour, organizationId: orgId, caseId: row.id, assignedStaffEmail: staffEmail });
      store.enrollment.tours[tour.id] = tour;
      row.tourId = tour.id;
      row.tourStatus = tour.status;
    }
    if (extras.waitlist) {
      const wl = model.createWaitlistRecord({ ...extras.waitlist, organizationId: orgId, caseId: row.id, preferredClassroomId: classroomId, createdByEmail: directorEmail });
      store.enrollment.waitlist[wl.id] = wl;
      row.waitlistId = wl.id;
      row.waitlistPriority = wl.priorityCategory;
    }
    if (extras.packet) {
      const pkt = model.createPacketRecord({ ...extras.packet, organizationId: orgId, caseId: row.id });
      store.enrollment.packets[pkt.id] = pkt;
      row.packetId = pkt.id;
    }
    if (extras.offer) {
      const offer = model.createOfferRecord({
        ...extras.offer,
        organizationId: orgId,
        caseId: row.id,
        classroomId,
        childName: row.childName,
      });
      store.enrollment.offers[offer.id] = offer;
      row.offerId = offer.id;
    }
    return row;
  }

  // New inquiry
  putCase("new_inquiry", {
    stage: model.PIPELINE_STAGES.NEW_INQUIRY,
    guardianName: "Jordan Blake",
    guardianEmail: "jordan.blake@example.invalid",
    guardianPhone: "555-0101",
    childName: "Riley Blake (Fixture)",
    childBirthDate: "2024-06-01",
    childAgeMonths: 24,
    desiredStartDate: "2026-09-01",
    desiredSchedule: "Full time",
    daysNeeded: ["mon", "tue", "wed", "thu", "fri"],
    hoursNeeded: "8am–5pm",
    preferredAgeGroup: "Toddler",
    heardAbout: "Friend referral",
    tourRequested: true,
    familyNotes: "Looking for toddler care (fake).",
  }, {
    inquiry: {
      guardianName: "Jordan Blake",
      guardianEmail: "jordan.blake@example.invalid",
      guardianPhone: "555-0101",
      childName: "Riley Blake (Fixture)",
      childBirthDate: "2024-06-01",
      desiredStartDate: "2026-09-01",
      desiredSchedule: "Full time",
      daysNeeded: ["mon", "tue", "wed", "thu", "fri"],
      hoursNeeded: "8am–5pm",
      preferredAgeGroup: "Toddler",
      heardAbout: "Friend referral",
      tourRequest: true,
      notes: "New inquiry fixture",
    },
  });

  // Tour scheduled
  const slot = model.createTourSlotRecord({
    organizationId: orgId,
    startsAt: "2026-08-01T15:00:00.000Z",
    endsAt: "2026-08-01T15:45:00.000Z",
    assignedStaffEmail: staffEmail,
    notes: "Testing tour slot",
  });
  store.enrollment.tourSlots[slot.id] = slot;

  putCase("tour_scheduled", {
    stage: model.PIPELINE_STAGES.TOUR_SCHEDULED,
    guardianName: "Sam Ortiz",
    guardianEmail: "sam.ortiz@example.invalid",
    childName: "Mia Ortiz (Fixture)",
    childBirthDate: "2023-01-15",
    childAgeMonths: 42,
    desiredStartDate: "2026-10-01",
    desiredSchedule: "Part time",
    daysNeeded: ["mon", "wed", "fri"],
    tourStatus: model.TOUR_STATUSES.SCHEDULED,
  }, {
    tour: {
      slotId: slot.id,
      status: model.TOUR_STATUSES.SCHEDULED,
      scheduledAt: slot.startsAt,
      familyQuestions: "Do you have outdoor play each day?",
      followUpNeeded: true,
    },
  });

  // Application in progress + missing forms
  const packetInProgress = {
    title: "Enrollment packet — application in progress",
    items: model.defaultPacketItems().map((item, idx) => ({
      ...item,
      status: idx < 3 ? model.PACKET_ITEM_STATUSES.IN_PROGRESS : model.PACKET_ITEM_STATUSES.NOT_STARTED,
      formVersionId: `fv_fixture_${item.key}`,
    })),
    overallStatus: "in_progress",
  };
  putCase("application_in_progress", {
    stage: model.PIPELINE_STAGES.APPLICATION_STARTED,
    guardianName: "Priya Lin",
    guardianEmail: "priya.lin@example.invalid",
    contactId: contactIds.priya || "",
    householdId: listValues(store.familyFoundation?.householdMemberships || {}).find((m) => m.contactId === contactIds.priya)?.householdId || "",
    childName: "New Sibling Lin (Fixture)",
    childBirthDate: "2025-02-01",
    childAgeMonths: 16,
    desiredStartDate: "2026-11-01",
    applicationStatus: "in_progress",
    siblingInfo: "Sibling of Ava Lin (existing enrolled fixture)",
  }, { packet: packetInProgress });

  putCase("missing_forms", {
    stage: model.PIPELINE_STAGES.MISSING_INFORMATION,
    guardianName: "Casey Ng",
    guardianEmail: "casey.ng@example.invalid",
    childName: "Theo Ng (Fixture)",
    childBirthDate: "2022-09-01",
    childAgeMonths: 46,
    desiredStartDate: "2026-08-15",
    applicationStatus: "returned",
    missingInformation: ["Immunization record", "Authorized pickup signatures"],
    internalNotes: "INTERNAL: waiting on pediatric office fax (never show to family).",
  }, {
    packet: {
      title: "Enrollment packet — missing items",
      overallStatus: "missing_information",
      items: model.defaultPacketItems().map((item) => ({
        ...item,
        formVersionId: `fv_fixture_${item.key}`,
        status: ["health_immunization", "authorized_pickup"].includes(item.key)
          ? model.PACKET_ITEM_STATUSES.RETURNED
          : model.PACKET_ITEM_STATUSES.APPROVED,
        returnedReason: ["health_immunization", "authorized_pickup"].includes(item.key) ? "Please upload a clearer scan (testing)." : "",
        signaturePreserved: !["health_immunization", "authorized_pickup"].includes(item.key),
        approvedAt: ["health_immunization", "authorized_pickup"].includes(item.key) ? "" : "2026-07-01T12:00:00.000Z",
      })),
    },
  });

  // Waitlisted infant
  putCase("waitlisted_infant", {
    stage: model.PIPELINE_STAGES.WAITLISTED,
    guardianName: "Alex Rivera",
    guardianEmail: "alex.rivera@example.invalid",
    childName: "Baby Rivera (Fixture)",
    childBirthDate: "2026-05-01",
    childAgeMonths: 2,
    desiredStartDate: "2027-01-15",
    preferredAgeGroup: "Infant",
    waitlistPriority: "sibling",
  }, {
    waitlist: {
      status: model.WAITLIST_STATUSES.ACTIVE,
      priorityCategory: "sibling",
      siblingPreference: true,
      childAgeMonths: 2,
      projectedAgeMonths: 8,
      scheduleNeeded: "Full time",
      subsidyNoteInternal: "INTERNAL subsidy note — family must never see",
      displayPosition: null,
      showNumericalPosition: false,
      priorityExplanation: "Sibling preference category; director reviews before any offer.",
    },
  });

  // Siblings scenario (second child on waitlist)
  putCase("siblings", {
    stage: model.PIPELINE_STAGES.WAITLISTED,
    guardianName: "Priya Lin",
    guardianEmail: "priya.lin@example.invalid",
    contactId: contactIds.priya || "",
    childName: "Sibling Applicant Lin (Fixture)",
    childBirthDate: "2024-11-01",
    childAgeMonths: 20,
    desiredStartDate: "2026-12-01",
    siblingInfo: "Applying with sibling already enrolled",
  }, {
    waitlist: {
      status: model.WAITLIST_STATUSES.ACTIVE,
      priorityCategory: "sibling",
      siblingPreference: true,
      childAgeMonths: 20,
    },
  });

  // Shared-household child inquiry
  putCase("shared_household", {
    stage: model.PIPELINE_STAGES.CONTACTED,
    guardianName: "Marcus Cole",
    guardianEmail: "marcus.cole@example.invalid",
    contactId: contactIds.marcus || "",
    childName: "Shared HH Child (Fixture)",
    childBirthDate: "2023-05-01",
    childAgeMonths: 38,
    desiredStartDate: "2026-09-15",
    householdId: listValues(store.familyFoundation?.householdMemberships || {}).find((m) => m.contactId === contactIds.marcus)?.householdId || "",
    internalNotes: "Shared household with another guardian — conversion must reuse household.",
  });

  // Offer awaiting response
  putCase("offer_awaiting", {
    stage: model.PIPELINE_STAGES.OFFER_SENT_TESTING,
    guardianName: "Taylor Brooks",
    guardianEmail: "taylor.brooks@example.invalid",
    childName: "Jamie Brooks (Fixture)",
    childBirthDate: "2022-03-01",
    childAgeMonths: 52,
    desiredStartDate: "2026-09-01",
    desiredSchedule: "Full time",
  }, {
    offer: {
      status: model.OFFER_STATUSES.SENT_TESTING,
      proposedStartDate: "2026-09-01",
      schedule: "Full time Mon–Fri",
      tuitionAmountSimulated: 1200,
      registrationFeeSimulated: 75,
      depositSimulated: 200,
      expiresAt: "2026-08-20T23:59:59.000Z",
      providerTerms: "Fake testing terms only. No real payment.",
      requiredFormKeys: ["enrollment_application", "emergency_contacts", "tuition_agreement"],
    },
    packet: {
      title: "Offer packet",
      overallStatus: "in_progress",
      items: model.defaultPacketItems().slice(0, 3).map((item) => ({ ...item, status: model.PACKET_ITEM_STATUSES.NOT_STARTED, formVersionId: `fv_${item.key}` })),
    },
  });

  // Accepted offer (awaiting conversion)
  putCase("offer_accepted", {
    stage: model.PIPELINE_STAGES.OFFER_ACCEPTED,
    guardianName: "Harper Quinn",
    guardianEmail: "harper.quinn@example.invalid",
    childName: "Noah Quinn (Fixture)",
    childBirthDate: "2021-12-01",
    childAgeMonths: 55,
    desiredStartDate: "2026-08-25",
  }, {
    offer: {
      status: model.OFFER_STATUSES.ACCEPTED,
      proposedStartDate: "2026-08-25",
      schedule: "Full time",
      tuitionAmountSimulated: 1100,
      registrationFeeSimulated: 50,
      depositSimulated: 150,
      acceptedAt: "2026-07-15T14:00:00.000Z",
      expiresAt: "2026-08-01T23:59:59.000Z",
    },
  });

  // Declined offer
  putCase("offer_declined", {
    stage: model.PIPELINE_STAGES.OFFER_DECLINED,
    guardianName: "Reese Patel",
    guardianEmail: "reese.patel@example.invalid",
    childName: "Kai Patel (Fixture)",
    childBirthDate: "2023-08-01",
    childAgeMonths: 35,
    desiredStartDate: "2026-09-01",
  }, {
    offer: {
      status: model.OFFER_STATUSES.DECLINED,
      proposedStartDate: "2026-09-01",
      schedule: "Part time",
      tuitionAmountSimulated: 800,
      declinedAt: "2026-07-10T10:00:00.000Z",
      declineReasonFamily: "Chose another program (fake).",
    },
  });

  // Future start (enrolled but future)
  putCase("future_start", {
    stage: model.PIPELINE_STAGES.ENROLLED,
    guardianName: "Morgan Lee",
    guardianEmail: "morgan.lee@example.invalid",
    childName: "Future Start Child (Fixture)",
    childBirthDate: "2024-01-01",
    childAgeMonths: 30,
    desiredStartDate: "2026-12-01",
    futureStart: true,
    enrolledAt: "2026-07-01T12:00:00.000Z",
    classroomPlacementId: classroomId,
  });

  // Duplicate-warning scenario (email matches Priya)
  putCase("duplicate_warning", {
    stage: model.PIPELINE_STAGES.READY_FOR_ENROLLMENT,
    guardianName: "Priya Lin",
    guardianEmail: "priya.lin@example.invalid",
    childName: "Ava Lin (Fixture)",
    childBirthDate: "2021-04-01",
    desiredStartDate: "2026-09-01",
    contactId: contactIds.priya || "",
    childId: childIds.ava || "",
    internalNotes: "Conversion should warn about duplicate guardian/child — never auto-merge.",
  });

  // Completed enrollment conversion
  putCase("completed_conversion", {
    stage: model.PIPELINE_STAGES.ENROLLED,
    guardianName: "Completed Family",
    guardianEmail: "completed.family@example.invalid",
    childName: "Completed Child (Fixture)",
    childBirthDate: "2022-01-01",
    childAgeMonths: 54,
    desiredStartDate: "2026-07-01",
    enrolledAt: "2026-07-01T09:00:00.000Z",
    classroomPlacementId: classroomId,
    householdId: "hh_fixture_completed",
    contactId: "fcontact_fixture_completed",
    childId: "child_fixture_completed",
  });

  // Notify Priya about missing sibling application (in-app only)
  const appCaseId = caseIds.application_in_progress;
  if (appCaseId) {
    model.createEnrollmentNotification(store, {
      organizationId: orgId,
      recipientEmail: "priya.lin@example.invalid",
      recipientRole: "guardian",
      kind: model.ENROLLMENT_NOTIFICATION_KINDS.APPLICATION_AVAILABLE,
      title: "Enrollment application available (testing)",
      preview: "Continue your testing enrollment checklist in Family Hub.",
      caseId: appCaseId,
    });
  }
  const missingId = caseIds.missing_forms;
  if (missingId) {
    model.createEnrollmentNotification(store, {
      organizationId: orgId,
      recipientEmail: "casey.ng@example.invalid",
      recipientRole: "guardian",
      kind: model.ENROLLMENT_NOTIFICATION_KINDS.MISSING_INFORMATION,
      title: "Enrollment items need attention (testing)",
      preview: "Some forms were returned for correction.",
      caseId: missingId,
    });
  }
  const offerId = caseIds.offer_awaiting;
  if (offerId) {
    model.createEnrollmentNotification(store, {
      organizationId: orgId,
      recipientEmail: "taylor.brooks@example.invalid",
      recipientRole: "guardian",
      kind: model.ENROLLMENT_NOTIFICATION_KINDS.OFFER_AVAILABLE,
      title: "Fake enrollment offer available",
      preview: "Review your testing-only offer. No real payment.",
      caseId: offerId,
    });
  }

  store.enrollment.meta.phase12SeededFor = orgId;
  store.enrollment.meta.phase12CaseIds = caseIds;
  store.enrollment.meta.updatedAt = model.nowIso();

  return {
    organizationId: orgId,
    alreadySeeded: false,
    contactIds,
    childIds,
    caseIds,
    capacityId: capacity.id,
  };
}

function resetPhase12Preview(store, opts = {}) {
  model.ensureEnrollmentStore(store);
  store.enrollment.cases = {};
  store.enrollment.inquiries = {};
  store.enrollment.tours = {};
  store.enrollment.tourSlots = {};
  store.enrollment.waitlist = {};
  store.enrollment.offers = {};
  store.enrollment.packets = {};
  store.enrollment.capacity = {};
  store.enrollment.conversionSummaries = {};
  store.enrollment.audit = {};
  store.enrollment.rateLimit = {};
  if (store.enrollment.meta) {
    delete store.enrollment.meta.phase12SeededFor;
    delete store.enrollment.meta.phase12CaseIds;
  }
  return ensurePhase12Preview(store, opts);
}

module.exports = {
  ensurePhase12Preview,
  resetPhase12Preview,
};
