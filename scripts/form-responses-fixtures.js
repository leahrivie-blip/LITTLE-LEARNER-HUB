/**
 * Phase 6 fake fixtures — form assignments, responses, signatures, and
 * medication log entries. No real emails, SMS, Stripe, or AI. All guardian
 * emails use the safe @example.invalid domain and are clearly fake.
 */

const foundation = require("./foundation-data-model.js");
const orgPermissions = require("./org-permissions.js");
const formsModel = require("./forms-center-data-model.js");
const model = require("./form-responses-data-model.js");
const formsFixtures = require("./forms-center-preview-fixtures.js");
const libraryFixtures = require("./built-in-form-library-fixtures.js");
const { createOrganizationCopyFromTemplate } = require("./built-in-form-library-copy.js");

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

function findByDisplayName(store, collection, organizationId, displayName) {
  return listValues(store[collection]).find((row) => row.organizationId === organizationId && row.displayName === displayName) || null;
}

function ensureClassroom(store, organizationId, name) {
  const existing = listValues(store.classrooms).find((row) => row.organizationId === organizationId && row.name === name);
  if (existing) return existing;
  const classroom = foundation.createClassroomRecord({ organizationId, name, ageGroupDefault: "preschool", color: "#8b6be8" });
  store.classrooms[classroom.id] = classroom;
  return classroom;
}

function ensureStaff(store, organizationId, { displayName, email, role }) {
  const existing = findByDisplayName(store, "staffMemberships", organizationId, displayName);
  if (existing) return existing;
  const member = foundation.createStaffMembershipRecord({ organizationId, userEmail: email, displayName, role });
  store.staffMemberships[member.id] = member;
  return member;
}

function ensureClassroomStaff(store, organizationId, classroomId, staffMembershipId) {
  const existing = listValues(store.classroomStaffAssignments).find((row) => (
    row.organizationId === organizationId && row.classroomId === classroomId && row.staffMembershipId === staffMembershipId
  ));
  if (existing) return existing;
  const assignment = foundation.createClassroomStaffAssignmentRecord({ organizationId, classroomId, staffMembershipId });
  store.classroomStaffAssignments[assignment.id] = assignment;
  return assignment;
}

function ensureChild(store, organizationId, displayName) {
  const existing = findByDisplayName(store, "childRecords", organizationId, displayName);
  if (existing) return existing;
  const child = foundation.createChildRecord({ organizationId, displayName });
  store.childRecords[child.id] = child;
  return child;
}

function ensureClassroomChild(store, organizationId, classroomId, childId) {
  const existing = listValues(store.classroomChildAssignments).find((row) => (
    row.organizationId === organizationId && row.classroomId === classroomId && row.childId === childId
  ));
  if (existing) return existing;
  const assignment = foundation.createClassroomChildAssignmentRecord({ organizationId, classroomId, childId });
  store.classroomChildAssignments[assignment.id] = assignment;
  return assignment;
}

function ensureGuardian(store, { email, displayName }) {
  const existing = listValues(store.guardians).find((row) => row.email === email);
  if (existing) return existing;
  const guardian = foundation.createGuardianRecord({ email, displayName });
  store.guardians[guardian.id] = guardian;
  return guardian;
}

function ensureRelationship(store, organizationId, childId, guardianId, { relationshipLabel = "parent", verified = true } = {}) {
  const existing = listValues(store.childGuardianRelationships).find((row) => (
    row.organizationId === organizationId && row.childId === childId && row.guardianId === guardianId
  ));
  if (existing) return existing;
  const relationship = foundation.createChildGuardianRelationshipRecord({ organizationId, childId, guardianId, relationshipLabel, verified });
  store.childGuardianRelationships[relationship.id] = relationship;
  return relationship;
}

function ensureAssistantOverride(store, organizationId, staffMembershipId, permissions) {
  const existing = listValues(store.assistantPermissionOverrides).find((row) => row.organizationId === organizationId && row.staffMembershipId === staffMembershipId);
  if (existing) { existing.permissions = permissions; return existing; }
  const override = foundation.createAssistantPermissionOverrideRecord({ organizationId, staffMembershipId, permissions });
  store.assistantPermissionOverrides[override.id] = override;
  return override;
}

function ensurePublishedFormId(store, organizationId, title) {
  return listValues(store.formsCenter?.forms || {}).find((form) => form.organizationId === organizationId && form.title === title && form.status === formsModel.FORM_STATUSES.PUBLISHED) || null;
}

function publishForm(store, form, actorEmail) {
  const snapshot = formsModel.snapshotFromForm(store, form);
  const version = formsModel.createFormVersionRecord({
    form,
    versionNumber: (form.latestVersionNumber || 0) + 1,
    fields: snapshot.fields,
    sections: snapshot.sections,
    createdByEmail: actorEmail,
    preview: true,
  });
  store.formsCenter.versions[version.id] = version;
  form.status = formsModel.FORM_STATUSES.PUBLISHED;
  form.latestVersionNumber = version.versionNumber;
  form.publishedVersionId = version.id;
  form.publishedAt = version.createdAt;
  form.hasUnpublishedChanges = false;
  store.formsCenter.forms[form.id] = form;
  return version;
}

/**
 * Ensures a published organization copy of the Phase 5 built-in Medication
 * Administration Log template exists, so Phase 6 can exercise the medication
 * log response structure without any medical recommendations of its own.
 */
function ensureMedicationLogForm(store, organizationId, actorEmail) {
  const existing = ensurePublishedFormId(store, organizationId, "Medication Administration Log");
  if (existing) return existing;
  libraryFixtures.ensureCatalogSeeded(store);
  const template = libraryFixtures.templateByKey(store, "medication-administration-log");
  if (!template) return null;
  const version = libraryFixtures.currentVersion(store, template);
  if (!version) return null;
  const created = createOrganizationCopyFromTemplate(store, {
    template,
    version,
    organizationId,
    actorEmail,
  });
  return publishForm(store, created.form, actorEmail) && created.form;
}

function createAssignmentAndResponse(store, {
  organizationId, form, version, recipientType, recipientId, relatedChildId = "", relatedClassroomId = "",
  dueDate = "", instructions = "", requiredSignatureRoles = [], requireProviderCountersignature = false,
  editableAfterSubmission = false, actorEmail,
}) {
  const assignment = model.createAssignmentRecord({
    organizationId,
    formId: form.id,
    formVersionId: version.id,
    formVersionNumber: version.versionNumber,
    builtInSourceTemplateId: form.sourceTemplateId || "",
    recipientType,
    recipientId,
    relatedChildId,
    relatedClassroomId,
    dueDate,
    instructions,
    requiredSignatureRoles,
    requireProviderCountersignature,
    editableAfterSubmission,
    createdByEmail: actorEmail,
  });
  store.formResponses.assignments[assignment.id] = assignment;
  const response = model.createResponseRecord({
    assignmentId: assignment.id,
    organizationId,
    formId: form.id,
    formVersionId: version.id,
    formVersionNumber: version.versionNumber,
    recipientType,
    recipientId,
    relatedChildId,
    relatedClassroomId,
    createdByEmail: actorEmail,
  });
  store.formResponses.responses[response.id] = response;
  audit(store, organizationId, response.id, assignment.id, "assignment_created", actorEmail, `Fixture assignment of "${form.title}".`);
  return { assignment, response };
}

function audit(store, organizationId, responseId, assignmentId, action, actorEmail, message, changes = null) {
  const row = model.createAuditRecord({ organizationId, responseId, assignmentId, action, actorEmail, message, changes });
  store.formResponses.audit[row.id] = row;
  return row;
}

function firstFillableFieldsAnswers(version, { partial = false } = {}) {
  const answers = {};
  const fields = (version.fields || []).filter((field) => formsModel.fieldCollectsInput(field.type));
  const slice = partial ? fields.slice(0, Math.max(1, Math.ceil(fields.length / 2))) : fields;
  slice.forEach((field) => {
    if (["single_select", "yes_no"].includes(field.type)) answers[field.id] = field.options?.[0]?.label || "Yes";
    else if (["multi_select", "checkboxes"].includes(field.type)) answers[field.id] = field.options?.[0] ? [field.options[0].label] : [];
    else if (field.type === "date") answers[field.id] = "2026-08-01";
    else if (["signature_parent", "signature_provider", "initials"].includes(field.type)) answers[field.id] = "";
    else answers[field.id] = `Fixture answer for ${field.label}`;
  });
  return answers;
}

function addSignature(store, response, { signerRole, signerName, signerIdentity, order = 1 }) {
  const sig = model.createSignatureRecord({
    responseId: response.id,
    formVersionId: response.formVersionId,
    organizationId: response.organizationId,
    signerRole,
    signerName,
    signerIdentity,
    typedName: signerName,
    signatureOrder: order,
    submissionEventId: model.newId("frevt"),
  });
  store.formResponses.signatures[sig.id] = sig;
  response.signatureIds = [...(response.signatureIds || []), sig.id];
  return sig;
}

/**
 * Idempotent Phase 6 fixture seed. Builds fake children/guardians/staff/
 * classroom, at least one program-level form, and a full spread of
 * assignment/response/signature scenarios required for testing.
 */
function ensurePhase6Preview(store, { adminEmail = "forms.preview@example.test", organizationId = "" } = {}) {
  model.ensureFormResponsesStore(store);
  formsModel.ensureFormsCenterStore(store);
  foundation.ensurePhase3Store(store);
  const organization = formsFixtures.ensurePreviewOrganization(store, { adminEmail, organizationId });
  const orgId = organization.id;
  if (store.formResponses.meta.phase6FixturesSeeded === true) {
    return { seeded: false, organizationId: orgId };
  }
  const actorEmail = String(adminEmail || "").trim().toLowerCase() || organization.ownerEmail;

  // Ensure at least one published form with two versions exists for assignment.
  if (!ensurePublishedFormId(store, orgId, "Emergency Contact Form")) {
    formsFixtures.seedFormsCenterPreview(store, { adminEmail: actorEmail, organizationId: orgId });
  }
  const emergencyForm = ensurePublishedFormId(store, orgId, "Emergency Contact Form");
  const photoForm = ensurePublishedFormId(store, orgId, "Photo Permission Form");
  const tripForm = ensurePublishedFormId(store, orgId, "Field Trip Permission Form");
  const agreementForm = listValues(store.formsCenter.forms).find((form) => form.organizationId === orgId && form.title === "Custom Parent Agreement");

  // Staff: director/owner, lead teacher, two assistants (broad + limited), plain staff recipient.
  const classroom = ensureClassroom(store, orgId, "Sunflower Room");
  const owner = ensureStaff(store, orgId, { displayName: "Preview Owner", email: organization.ownerEmail, role: orgPermissions.ORG_ROLES.DIRECTOR_OWNER });
  const teacher = ensureStaff(store, orgId, { displayName: "Preview Lead Teacher", email: "phase6.teacher@example.invalid", role: orgPermissions.ORG_ROLES.LEAD_TEACHER });
  const assistantBroad = ensureStaff(store, orgId, { displayName: "Preview Assistant Broad", email: "phase6.assistant.broad@example.invalid", role: orgPermissions.ORG_ROLES.ASSISTANT_STAFF });
  const assistantLimited = ensureStaff(store, orgId, { displayName: "Preview Assistant Limited", email: "phase6.assistant.limited@example.invalid", role: orgPermissions.ORG_ROLES.ASSISTANT_STAFF });
  const staffRecipient = ensureStaff(store, orgId, { displayName: "Preview New Hire Staff", email: "phase6.staff.recipient@example.invalid", role: orgPermissions.ORG_ROLES.ASSISTANT_STAFF });
  ensureClassroomStaff(store, orgId, classroom.id, teacher.id);
  ensureClassroomStaff(store, orgId, classroom.id, assistantBroad.id);
  ensureClassroomStaff(store, orgId, classroom.id, assistantLimited.id);
  ensureAssistantOverride(store, orgId, assistantBroad.id, { ...foundation.defaultAssistantPermissions(true), viewFormResponses: true });
  ensureAssistantOverride(store, orgId, assistantLimited.id, { ...foundation.defaultAssistantPermissions(false), viewFormResponses: false });

  // Children + guardians, including siblings, two-guardian, and restricted scenarios.
  const ava = ensureChild(store, orgId, "Ava Lin (Fixture)");
  const ben = ensureChild(store, orgId, "Ben Lin (Fixture)");
  const carlos = ensureChild(store, orgId, "Carlos Rivera (Fixture)");
  const dana = ensureChild(store, orgId, "Dana Cole (Fixture)");
  [ava, ben, carlos, dana].forEach((child) => ensureClassroomChild(store, orgId, classroom.id, child.id));

  const priya = ensureGuardian(store, { email: "priya.lin@example.invalid", displayName: "Priya Lin (Fixture Guardian)" });
  ensureRelationship(store, orgId, ava.id, priya.id, { relationshipLabel: "parent", verified: true });
  ensureRelationship(store, orgId, ben.id, priya.id, { relationshipLabel: "parent", verified: true }); // siblings, same guardian

  const diego = ensureGuardian(store, { email: "diego.rivera@example.invalid", displayName: "Diego Rivera (Fixture Guardian)" });
  const elena = ensureGuardian(store, { email: "elena.rivera@example.invalid", displayName: "Elena Rivera (Fixture Guardian)" });
  ensureRelationship(store, orgId, carlos.id, diego.id, { relationshipLabel: "parent", verified: true });
  ensureRelationship(store, orgId, carlos.id, elena.id, { relationshipLabel: "parent", verified: true }); // two verified guardians

  const frank = ensureGuardian(store, { email: "frank.cole@example.invalid", displayName: "Frank Cole (Fixture Guardian)" });
  const grace = ensureGuardian(store, { email: "grace.cole@example.invalid", displayName: "Grace Cole (Fixture Restricted Guardian)" });
  ensureRelationship(store, orgId, dana.id, frank.id, { relationshipLabel: "parent", verified: true });
  ensureRelationship(store, orgId, dana.id, grace.id, { relationshipLabel: "restricted_no_contact", verified: false }); // restricted/unverified — must never receive assignments

  const created = [];

  // 1. Not started — Ava's Emergency Contact Form, assigned to guardian Priya.
  if (emergencyForm) {
    const version = store.formsCenter.versions[emergencyForm.publishedVersionId];
    const { response } = createAssignmentAndResponse(store, {
      organizationId: orgId, form: emergencyForm, version, recipientType: model.RECIPIENT_TYPES.GUARDIAN, recipientId: priya.id,
      relatedChildId: ava.id, dueDate: "2026-08-15", instructions: "Please confirm emergency contacts for the new program year.",
      requiredSignatureRoles: [model.SIGNER_ROLES.PARENT_GUARDIAN], actorEmail,
    });
    created.push(["not_started", response.id]);
  }

  // 2. Partially completed — Ben's Emergency Contact Form (sibling of Ava, same guardian).
  if (emergencyForm) {
    const version = store.formsCenter.versions[emergencyForm.publishedVersionId];
    const { response } = createAssignmentAndResponse(store, {
      organizationId: orgId, form: emergencyForm, version, recipientType: model.RECIPIENT_TYPES.GUARDIAN, recipientId: priya.id,
      relatedChildId: ben.id, dueDate: "2026-08-15", requiredSignatureRoles: [model.SIGNER_ROLES.PARENT_GUARDIAN], actorEmail,
    });
    response.answers = firstFillableFieldsAnswers(version, { partial: true });
    response.status = model.RESPONSE_STATUSES.IN_PROGRESS;
    response.startedAt = model.nowIso();
    response.lastSavedAt = response.startedAt;
    response.currentSectionId = version.sections?.[0]?.id || "";
    store.formResponses.responses[response.id] = response;
    created.push(["partially_completed", response.id]);
  }

  // 3. Submitted — Carlos's Photo Permission Form, guardian Diego signed.
  if (photoForm) {
    const version = store.formsCenter.versions[photoForm.publishedVersionId];
    const { response } = createAssignmentAndResponse(store, {
      organizationId: orgId, form: photoForm, version, recipientType: model.RECIPIENT_TYPES.GUARDIAN, recipientId: diego.id,
      relatedChildId: carlos.id, requiredSignatureRoles: [model.SIGNER_ROLES.PARENT_GUARDIAN], actorEmail,
    });
    response.answers = firstFillableFieldsAnswers(version);
    response.status = model.RESPONSE_STATUSES.SUBMITTED;
    response.startedAt = model.nowIso();
    response.submittedAt = response.startedAt;
    response.lastSavedAt = response.startedAt;
    addSignature(store, response, { signerRole: model.SIGNER_ROLES.PARENT_GUARDIAN, signerName: "Diego Rivera", signerIdentity: "guardian:" + diego.id });
    store.formResponses.responses[response.id] = response;
    created.push(["submitted", response.id]);
  }

  // 4. Awaiting provider signature — Dana's Field Trip Permission Form.
  if (tripForm) {
    const version = store.formsCenter.versions[tripForm.publishedVersionId];
    const { response } = createAssignmentAndResponse(store, {
      organizationId: orgId, form: tripForm, version, recipientType: model.RECIPIENT_TYPES.GUARDIAN, recipientId: frank.id,
      relatedChildId: dana.id, requiredSignatureRoles: [model.SIGNER_ROLES.PARENT_GUARDIAN, model.SIGNER_ROLES.PROVIDER],
      requireProviderCountersignature: true, actorEmail,
    });
    response.answers = firstFillableFieldsAnswers(version);
    response.status = model.RESPONSE_STATUSES.SUBMITTED;
    response.startedAt = model.nowIso();
    response.submittedAt = response.startedAt;
    response.lastSavedAt = response.startedAt;
    addSignature(store, response, { signerRole: model.SIGNER_ROLES.PARENT_GUARDIAN, signerName: "Frank Cole", signerIdentity: "guardian:" + frank.id });
    store.formResponses.responses[response.id] = response;
    created.push(["awaiting_provider_signature", response.id]);
  }

  // 5. Returned for correction — Ava's Photo Permission Form.
  if (photoForm) {
    const version = store.formsCenter.versions[photoForm.publishedVersionId];
    const { response } = createAssignmentAndResponse(store, {
      organizationId: orgId, form: photoForm, version, recipientType: model.RECIPIENT_TYPES.GUARDIAN, recipientId: priya.id,
      relatedChildId: ava.id, requiredSignatureRoles: [model.SIGNER_ROLES.PARENT_GUARDIAN], actorEmail,
    });
    response.answers = firstFillableFieldsAnswers(version);
    response.status = model.RESPONSE_STATUSES.SUBMITTED;
    response.submittedAt = model.nowIso();
    const sig = addSignature(store, response, { signerRole: model.SIGNER_ROLES.PARENT_GUARDIAN, signerName: "Priya Lin", signerIdentity: "guardian:" + priya.id });
    model.invalidateSignature(sig, "Response was returned for correction; a new signature is required after resubmission.");
    response.status = model.RESPONSE_STATUSES.RETURNED_FOR_CORRECTION;
    response.returnMessage = "Please double-check the emergency phone number — it looks incomplete.";
    response.returnedAt = model.nowIso();
    store.formResponses.responses[response.id] = response;
    created.push(["returned_for_correction", response.id]);
  }

  // 6. Approved — Carlos's Emergency Contact Form.
  if (emergencyForm) {
    const version = store.formsCenter.versions[emergencyForm.publishedVersionId];
    const { response } = createAssignmentAndResponse(store, {
      organizationId: orgId, form: emergencyForm, version, recipientType: model.RECIPIENT_TYPES.GUARDIAN, recipientId: elena.id,
      relatedChildId: carlos.id, requiredSignatureRoles: [model.SIGNER_ROLES.PARENT_GUARDIAN], actorEmail,
    });
    response.answers = firstFillableFieldsAnswers(version);
    response.status = model.RESPONSE_STATUSES.APPROVED;
    response.submittedAt = model.nowIso();
    response.approvedAt = response.submittedAt;
    addSignature(store, response, { signerRole: model.SIGNER_ROLES.PARENT_GUARDIAN, signerName: "Elena Rivera", signerIdentity: "guardian:" + elena.id });
    store.formResponses.responses[response.id] = response;
    created.push(["approved", response.id]);
  }

  // 7. Overdue — Ben's Field Trip Permission Form, due date already passed, still in progress.
  if (tripForm) {
    const version = store.formsCenter.versions[tripForm.publishedVersionId];
    const { response } = createAssignmentAndResponse(store, {
      organizationId: orgId, form: tripForm, version, recipientType: model.RECIPIENT_TYPES.GUARDIAN, recipientId: priya.id,
      relatedChildId: ben.id, dueDate: "2026-01-10", requiredSignatureRoles: [model.SIGNER_ROLES.PARENT_GUARDIAN], actorEmail,
    });
    response.status = model.RESPONSE_STATUSES.IN_PROGRESS;
    response.startedAt = model.nowIso();
    store.formResponses.responses[response.id] = response;
    created.push(["overdue", response.id]);
  }

  // 8. Expired — Dana's Photo Permission Form, past due and left not started.
  if (photoForm) {
    const version = store.formsCenter.versions[photoForm.publishedVersionId];
    const { response } = createAssignmentAndResponse(store, {
      organizationId: orgId, form: photoForm, version, recipientType: model.RECIPIENT_TYPES.GUARDIAN, recipientId: frank.id,
      relatedChildId: dana.id, dueDate: "2026-01-05", actorEmail,
    });
    response.status = model.RESPONSE_STATUSES.EXPIRED;
    store.formResponses.responses[response.id] = response;
    created.push(["expired", response.id]);
  }

  // 9. Archived — Ava's Field Trip Permission Form.
  if (tripForm) {
    const version = store.formsCenter.versions[tripForm.publishedVersionId];
    const { response } = createAssignmentAndResponse(store, {
      organizationId: orgId, form: tripForm, version, recipientType: model.RECIPIENT_TYPES.GUARDIAN, recipientId: priya.id,
      relatedChildId: ava.id, actorEmail,
    });
    response.previousStatus = model.RESPONSE_STATUSES.APPROVED;
    response.status = model.RESPONSE_STATUSES.ARCHIVED;
    response.archivedAt = model.nowIso();
    store.formResponses.responses[response.id] = response;
    created.push(["archived", response.id]);
  }

  // 10. Voided — Carlos's Field Trip Permission Form (trip cancelled).
  if (tripForm) {
    const version = store.formsCenter.versions[tripForm.publishedVersionId];
    const { response } = createAssignmentAndResponse(store, {
      organizationId: orgId, form: tripForm, version, recipientType: model.RECIPIENT_TYPES.GUARDIAN, recipientId: diego.id,
      relatedChildId: carlos.id, actorEmail,
    });
    response.status = model.RESPONSE_STATUSES.VOIDED;
    response.voidReason = "Trip was cancelled by the program; this permission form is no longer needed.";
    response.voidedAt = model.nowIso();
    store.formResponses.responses[response.id] = response;
    created.push(["voided", response.id]);
  }

  // 11. Staff recipient — Custom Parent Agreement reused as a staff acknowledgment form.
  if (agreementForm) {
    const version = store.formsCenter.versions[agreementForm.publishedVersionId];
    if (version) {
      const { response } = createAssignmentAndResponse(store, {
        organizationId: orgId, form: agreementForm, version, recipientType: model.RECIPIENT_TYPES.STAFF, recipientId: staffRecipient.id,
        requiredSignatureRoles: [model.SIGNER_ROLES.STAFF], actorEmail,
      });
      created.push(["staff_recipient", response.id]);
    }
  }

  // 12. Classroom-level assignment for the Sunflower Room.
  if (emergencyForm) {
    const version = store.formsCenter.versions[emergencyForm.publishedVersionId];
    const { response } = createAssignmentAndResponse(store, {
      organizationId: orgId, form: emergencyForm, version, recipientType: model.RECIPIENT_TYPES.CLASSROOM, recipientId: classroom.id,
      relatedClassroomId: classroom.id, actorEmail,
    });
    created.push(["classroom_assignment", response.id]);
  }

  // 13. Program-level assignment — entire program, Custom Parent Agreement.
  if (agreementForm) {
    const version = store.formsCenter.versions[agreementForm.publishedVersionId];
    if (version) {
      const { response } = createAssignmentAndResponse(store, {
        organizationId: orgId, form: agreementForm, version, recipientType: model.RECIPIENT_TYPES.PROGRAM, recipientId: orgId,
        actorEmail,
      });
      created.push(["program_assignment", response.id]);
    }
  }

  // 14. Multiple signatures — Dana's Emergency Contact Form with guardian + provider both signing.
  if (emergencyForm) {
    const version = store.formsCenter.versions[emergencyForm.publishedVersionId];
    const { response } = createAssignmentAndResponse(store, {
      organizationId: orgId, form: emergencyForm, version, recipientType: model.RECIPIENT_TYPES.GUARDIAN, recipientId: frank.id,
      relatedChildId: dana.id, requiredSignatureRoles: [model.SIGNER_ROLES.PARENT_GUARDIAN, model.SIGNER_ROLES.PROVIDER],
      requireProviderCountersignature: true, actorEmail,
    });
    response.answers = firstFillableFieldsAnswers(version);
    response.status = model.RESPONSE_STATUSES.APPROVED;
    response.submittedAt = model.nowIso();
    response.approvedAt = response.submittedAt;
    addSignature(store, response, { signerRole: model.SIGNER_ROLES.PARENT_GUARDIAN, signerName: "Frank Cole", signerIdentity: "guardian:" + frank.id, order: 1 });
    addSignature(store, response, { signerRole: model.SIGNER_ROLES.PROVIDER, signerName: "Preview Owner", signerIdentity: "staff:" + owner.id, order: 2 });
    store.formResponses.responses[response.id] = response;
    created.push(["multiple_signatures", response.id]);
  }

  // 15. Newer form version available — Ben's Emergency Contact Form pinned to version 1
  // even though the form now has a published version 2 (from Phase 4 fixtures).
  if (emergencyForm) {
    const v1 = listValues(store.formsCenter.versions).find((version) => version.formId === emergencyForm.id && version.versionNumber === 1);
    if (v1) {
      const { response } = createAssignmentAndResponse(store, {
        organizationId: orgId, form: emergencyForm, version: v1, recipientType: model.RECIPIENT_TYPES.GUARDIAN, recipientId: elena.id,
        relatedChildId: carlos.id, actorEmail,
      });
      response.status = model.RESPONSE_STATUSES.APPROVED;
      response.submittedAt = model.nowIso();
      response.approvedAt = response.submittedAt;
      store.formResponses.responses[response.id] = response;
      created.push(["connected_to_older_form_version", response.id]);
    }
  }

  // 16. Medication Administration Log — one response with a correction history.
  const medForm = ensureMedicationLogForm(store, orgId, actorEmail);
  if (medForm) {
    const version = store.formsCenter.versions[medForm.publishedVersionId];
    const { response } = createAssignmentAndResponse(store, {
      organizationId: orgId, form: medForm, version, recipientType: model.RECIPIENT_TYPES.CLASSROOM, recipientId: classroom.id,
      relatedClassroomId: classroom.id, relatedChildId: ava.id, actorEmail,
    });
    response.status = model.RESPONSE_STATUSES.IN_PROGRESS;
    response.startedAt = model.nowIso();
    store.formResponses.responses[response.id] = response;
    const originalEntry = model.createMedicationLogEntry({
      responseId: response.id,
      organizationId: orgId,
      childId: ava.id,
      medicationName: "Children's Allergy Relief (fixture)",
      authorizationReference: "MED-AUTH-FIXTURE-1",
      logDate: "2026-08-03",
      scheduledTime: "12:00",
      actualTime: "12:05",
      dosage: "5 mL",
      method: "Oral",
      administeredByMembershipId: teacher.id,
      administeredByName: teacher.displayName,
      result: model.MEDICATION_RESULTS.GIVEN,
      notes: "Given with lunch as authorized.",
      staffInitials: "LT",
    });
    store.formResponses.medicationLogEntries[originalEntry.id] = originalEntry;
    const correction = model.createMedicationLogEntry({
      responseId: response.id,
      organizationId: orgId,
      childId: ava.id,
      medicationName: originalEntry.medicationName,
      authorizationReference: originalEntry.authorizationReference,
      logDate: originalEntry.logDate,
      scheduledTime: originalEntry.scheduledTime,
      actualTime: "12:07",
      dosage: originalEntry.dosage,
      method: originalEntry.method,
      administeredByMembershipId: teacher.id,
      administeredByName: teacher.displayName,
      result: model.MEDICATION_RESULTS.GIVEN,
      notes: "Correction: actual administration time was logged one minute off.",
      staffInitials: "LT",
      supersedesEntryId: originalEntry.id,
    });
    originalEntry.supersededByEntryId = correction.id;
    store.formResponses.medicationLogEntries[originalEntry.id] = originalEntry;
    store.formResponses.medicationLogEntries[correction.id] = correction;
    created.push(["medication_log", response.id]);
  }

  store.formResponses.meta.phase6FixturesSeeded = true;
  store.formResponses.meta.updatedAt = model.nowIso();

  return {
    ok: true,
    organizationId: orgId,
    seeded: true,
    createdCount: created.length,
    scenarios: created,
    fixtures: {
      classroomId: classroom.id,
      ownerMembershipId: owner.id,
      teacherMembershipId: teacher.id,
      assistantBroadMembershipId: assistantBroad.id,
      assistantLimitedMembershipId: assistantLimited.id,
      staffRecipientMembershipId: staffRecipient.id,
      children: { ava: ava.id, ben: ben.id, carlos: carlos.id, dana: dana.id },
      guardians: { priya: priya.id, diego: diego.id, elena: elena.id, frank: frank.id, grace: grace.id },
    },
  };
}

module.exports = {
  ensurePhase6Preview,
};
