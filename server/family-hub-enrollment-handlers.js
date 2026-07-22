/**
 * Phase 12 Family Hub enrollment handlers — family-visible enrollment checklist only.
 * Internal notes, waitlist rules, other applicants, capacity, and confidential reasons never exposed.
 */

const enrollmentModel = require("../scripts/enrollment-data-model.js");
const enrollmentFixtures = require("../scripts/enrollment-fixtures.js");

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

function safeLower(value) {
  return String(value || "").trim().toLowerCase();
}

function createFamilyHubEnrollmentHandlers({
  familyModel,
  hub,
  withGuardian,
  deny,
  readJson,
  writeStore,
  jsonResponse,
  TESTING_BANNER,
}) {
  function casesForGuardian(store, actor) {
    enrollmentModel.ensureEnrollmentStore(store);
    enrollmentFixtures.ensurePhase12Preview(store, { organizationId: actor.organizationId });
    const email = safeLower(actor.contact?.email || actor.email || "");
    const contactId = actor.contact?.id || "";
    return listValues(store.enrollment.cases).filter((row) => (
      row.organizationId === actor.organizationId
      && (
        (email && safeLower(row.guardianEmail) === email)
        || (contactId && row.contactId === contactId)
      )
    ));
  }

  function familyPacketView(packet) {
    if (!packet) return null;
    return {
      id: packet.id,
      title: packet.title,
      overallStatus: packet.overallStatus,
      items: (packet.items || []).map((item) => ({
        key: item.key,
        title: item.title,
        status: item.status,
        returnedReason: item.status === enrollmentModel.PACKET_ITEM_STATUSES.RETURNED ? item.returnedReason : "",
        // Never expose internal provider review notes beyond returned reason.
      })),
    };
  }

  function familyTourView(tour) {
    if (!tour) return null;
    return {
      id: tour.id,
      status: tour.status,
      scheduledAt: tour.scheduledAt,
      familyQuestions: tour.familyQuestions || "",
      // providerNotes intentionally omitted
    };
  }

  function familyOfferView(offer) {
    if (!offer) return null;
    return {
      id: offer.id,
      testingOnly: true,
      fakeLabel: offer.fakeLabel,
      status: offer.status,
      childName: offer.childName,
      proposedStartDate: offer.proposedStartDate,
      schedule: offer.schedule,
      classroomId: offer.classroomId,
      ageGroup: offer.ageGroup,
      tuitionAmountSimulated: offer.tuitionAmountSimulated,
      registrationFeeSimulated: offer.registrationFeeSimulated,
      depositSimulated: offer.depositSimulated,
      expiresAt: offer.expiresAt,
      providerTerms: offer.providerTerms,
      requiredFormKeys: offer.requiredFormKeys,
      stripeCheckoutUsed: false,
      realChargeAttempted: false,
    };
  }

  function familyWaitlistView(waitlist) {
    if (!waitlist) return null;
    return {
      id: waitlist.id,
      status: waitlist.status,
      desiredStartDate: waitlist.desiredStartDate,
      scheduleNeeded: waitlist.scheduleNeeded,
      // Never expose priority rules, subsidy notes, or internal provider notes.
      showNumericalPosition: waitlist.showNumericalPosition === true,
      displayPosition: waitlist.showNumericalPosition === true ? waitlist.displayPosition : null,
      familyMessage: "Your place on the waitlist is reviewed by the program. A guaranteed number is shown only if your program chooses to share one.",
    };
  }

  async function handleEnrollmentList(request, response) {
    const ctx = withGuardian(request, response, { capability: "digital" });
    if (!ctx) return;
    const { store, actor } = ctx;
    // Pickup-only / emergency-only already denied by capability digital via requireChildAccess patterns;
    // also deny when contact has no digital/full access on any child and is pickup-only style.
    const rules = listValues(store.familyFoundation?.accessRules || {}).filter((r) => r.contactId === actor.contact.id && r.status === "active");
    const anyDigital = rules.some((rule) => familyModel.evaluateContactChildAccess({
      store,
      organizationId: actor.organizationId,
      contactId: actor.contact.id,
      childId: rule.childId,
      capability: "digital",
    }).allowed);
    if (!anyDigital && rules.length) {
      // Still allow if they have an enrollment case tied to their email (applicant not yet enrolled).
      const applicantCases = casesForGuardian(store, actor);
      if (!applicantCases.length) {
        return deny(response, 403, "enrollment_denied", hub.RESTRICTED_UNAVAILABLE_MESSAGE);
      }
    }
    const cases = casesForGuardian(store, actor).map((row) => {
      const safe = enrollmentModel.familySafeCaseView(row, { includeInternal: false });
      return {
        ...safe,
        tour: familyTourView(row.tourId ? store.enrollment.tours[row.tourId] : null),
        packet: familyPacketView(row.packetId ? store.enrollment.packets[row.packetId] : null),
        offer: familyOfferView(row.offerId ? store.enrollment.offers[row.offerId] : null),
        waitlist: familyWaitlistView(row.waitlistId ? store.enrollment.waitlist[row.waitlistId] : null),
        checklist: buildChecklist(store, row),
      };
    });
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      testingBanner: TESTING_BANNER,
      phase: 12,
      cases,
      programContact: {
        note: "Contact your program through Family Hub Messages (in-app testing only).",
      },
    });
  }

  function buildChecklist(store, row) {
    const packet = row.packetId ? store.enrollment.packets[row.packetId] : null;
    const items = [];
    if (row.tourId) items.push({ key: "tour", label: "Tour", status: row.tourStatus || "scheduled" });
    if (packet) {
      for (const item of packet.items || []) {
        items.push({ key: item.key, label: item.title, status: item.status, returnedReason: item.returnedReason || "" });
      }
    }
    if (row.offerId) items.push({ key: "offer", label: "Enrollment offer", status: store.enrollment.offers[row.offerId]?.status || "pending" });
    if (row.missingInformation?.length) {
      items.push({ key: "missing", label: "Missing information", status: "attention", details: row.missingInformation });
    }
    items.push({ key: "status", label: "Enrollment status", status: row.stage, labelFriendly: enrollmentModel.FAMILY_FRIENDLY_STATUS[row.stage] });
    return items;
  }

  async function handleEnrollmentCase(request, response, caseId) {
    const ctx = withGuardian(request, response, { capability: "digital" });
    if (!ctx) return;
    const { store, actor } = ctx;
    const cases = casesForGuardian(store, actor);
    const row = cases.find((c) => c.id === caseId);
    if (!row) return deny(response, 404, "not_found", hub.RESTRICTED_UNAVAILABLE_MESSAGE);
    // Cross-check: never return another household's case
    if (safeLower(row.guardianEmail) !== safeLower(actor.contact.email) && row.contactId !== actor.contact.id) {
      return deny(response, 403, "wrong_household", hub.RESTRICTED_UNAVAILABLE_MESSAGE);
    }
    jsonResponse(response, 200, {
      ok: true,
      testingBanner: TESTING_BANNER,
      case: enrollmentModel.familySafeCaseView(row),
      tour: familyTourView(row.tourId ? store.enrollment.tours[row.tourId] : null),
      packet: familyPacketView(row.packetId ? store.enrollment.packets[row.packetId] : null),
      offer: familyOfferView(row.offerId ? store.enrollment.offers[row.offerId] : null),
      waitlist: familyWaitlistView(row.waitlistId ? store.enrollment.waitlist[row.waitlistId] : null),
      checklist: buildChecklist(store, row),
      // Explicitly omitted: internalNotes, confidentialDeclineReason, capacity, other applicants, priority rules
    });
  }

  async function handleSavePacketProgress(request, response, caseId) {
    const ctx = withGuardian(request, response, { capability: "digital" });
    if (!ctx) return;
    const body = await readJson(request).catch(() => ({}));
    const { store, actor } = ctx;
    const row = casesForGuardian(store, actor).find((c) => c.id === caseId);
    if (!row) return deny(response, 404, "not_found", hub.RESTRICTED_UNAVAILABLE_MESSAGE);
    const packet = row.packetId ? store.enrollment.packets[row.packetId] : null;
    if (!packet) return deny(response, 404, "packet_not_found", hub.RESTRICTED_UNAVAILABLE_MESSAGE);
    const item = packet.items.find((i) => i.key === body.key);
    if (!item) return deny(response, 404, "item_not_found");
    if (body.status === enrollmentModel.PACKET_ITEM_STATUSES.IN_PROGRESS || body.status === enrollmentModel.PACKET_ITEM_STATUSES.SUBMITTED) {
      item.status = body.status;
      packet.updatedAt = enrollmentModel.nowIso();
      row.applicationStatus = body.status === enrollmentModel.PACKET_ITEM_STATUSES.SUBMITTED ? "submitted" : "in_progress";
      if (body.status === enrollmentModel.PACKET_ITEM_STATUSES.SUBMITTED) {
        enrollmentModel.setCaseStage(store, row, enrollmentModel.PIPELINE_STAGES.APPLICATION_SUBMITTED, actor.contact.email, "Family submitted form item");
      }
    }
    writeStore(store);
    jsonResponse(response, 200, { ok: true, packet: familyPacketView(packet), testingBanner: TESTING_BANNER });
  }

  async function handleOfferRespond(request, response, offerId) {
    const ctx = withGuardian(request, response, { capability: "digital" });
    if (!ctx) return;
    const body = await readJson(request).catch(() => ({}));
    if (body.useStripe === true || body.charge === true) {
      return deny(response, 400, "stripe_disabled", "Real payment is not available for testing offers.");
    }
    const { store, actor } = ctx;
    enrollmentModel.ensureEnrollmentStore(store);
    const offer = store.enrollment.offers[offerId];
    if (!offer || offer.organizationId !== actor.organizationId) {
      return deny(response, 404, "not_found", hub.RESTRICTED_UNAVAILABLE_MESSAGE);
    }
    const row = casesForGuardian(store, actor).find((c) => c.id === offer.caseId);
    if (!row) return deny(response, 403, "wrong_household", hub.RESTRICTED_UNAVAILABLE_MESSAGE);
    if (body.accept === true) {
      offer.status = enrollmentModel.OFFER_STATUSES.ACCEPTED;
      offer.acceptedAt = enrollmentModel.nowIso();
      offer.guardianAcknowledgment = enrollmentModel.cleanText(body.acknowledgment || "I acknowledge this fake testing offer.", 500);
      enrollmentModel.setCaseStage(store, row, enrollmentModel.PIPELINE_STAGES.OFFER_ACCEPTED, actor.contact.email, "Family accepted fake offer");
    } else if (body.decline === true) {
      offer.status = enrollmentModel.OFFER_STATUSES.DECLINED;
      offer.declinedAt = enrollmentModel.nowIso();
      offer.declineReasonFamily = enrollmentModel.cleanText(body.reason, 400);
      enrollmentModel.setCaseStage(store, row, enrollmentModel.PIPELINE_STAGES.OFFER_DECLINED, actor.contact.email, "Family declined offer");
    } else {
      return deny(response, 400, "invalid_response");
    }
    offer.stripeCheckoutUsed = false;
    offer.realChargeAttempted = false;
    offer.updatedAt = enrollmentModel.nowIso();
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      offer: familyOfferView(offer),
      case: enrollmentModel.familySafeCaseView(row),
      stripeCheckoutUsed: false,
      testingBanner: TESTING_BANNER,
    });
  }

  return {
    handleEnrollmentList,
    handleEnrollmentCase,
    handleSavePacketProgress,
    handleOfferRespond,
  };
}

module.exports = {
  createFamilyHubEnrollmentHandlers,
};
