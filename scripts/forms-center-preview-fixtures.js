/**
 * Fake Forms Center preview fixtures only.
 * No emails, Stripe, AI, production children, or response collection.
 */

const formsModel = require("./forms-center-data-model.js");
const foundation = require("./foundation-data-model.js");
const entitlements = require("./entitlement-model.js");

const PREVIEW_MARKER = "Admin Preview — Test Data Only";

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

function previewOrgForAdmin(store, email) {
  return listValues(store.organizations).find((org) => (
    org && org.preview === true && String(org.ownerEmail || "").toLowerCase() === email
  )) || null;
}

function ensurePreviewOrganization(store, { adminEmail = "forms.preview@example.test", organizationId = "" } = {}) {
  foundation.ensureFoundationStore(store);
  const email = String(adminEmail || "").trim().toLowerCase() || "forms.preview@example.test";
  let org = organizationId ? store.organizations?.[organizationId] : null;
  if (!org) org = previewOrgForAdmin(store, email);
  if (!org) {
    org = foundation.createOrganizationRecord({
      accountType: foundation.ACCOUNT_TYPES.CENTER,
      ownerEmail: email,
      name: "Forms Center Preview Program",
    });
    org.preview = true;
    org.previewLabel = PREVIEW_MARKER;
    store.organizations[org.id] = org;
    const profile = foundation.createProgramProfileRecord({
      organizationId: org.id,
      programName: "Forms Center Preview Program",
      directorOwnerName: "Mia Preview Director",
      address: "400 Preview Path, Test City, TS 00000",
      phone: "(555) 010-4400",
      email,
      licenseNumber: "FORMS-PREVIEW-001",
      programType: foundation.PROGRAM_TYPES.CHILDCARE_CENTER,
      classroomCount: 3,
    });
    profile.preview = true;
    store.programProfiles[profile.id] = profile;
  }
  const entitlement = listValues(store.organizationEntitlements).find((row) => row.organizationId === org.id);
  if (!entitlement) {
    const next = entitlements.createOrganizationEntitlementRecord({
      organizationId: org.id,
      basePlanKey: entitlements.PLAN_KEYS.SMALL_CENTER,
    });
    next.preview = true;
    next.live = false;
    store.organizationEntitlements[next.id] = next;
  }
  return org;
}

function addAudit(store, form, action, actorEmail, message, versionId = "", changes = null) {
  const audit = formsModel.createAuditRecord({
    organizationId: form.organizationId,
    formId: form.id,
    versionId,
    action,
    actorEmail,
    message,
    changes,
    preview: true,
  });
  store.formsCenter.audit[audit.id] = audit;
  return audit;
}

function saveDraftSnapshot(store, form, sections, fields, actorEmail) {
  const normalizedSections = formsModel.normalizeSections(sections);
  const firstSectionId = normalizedSections[0]?.id || "";
  const savedFields = fields.map((field, index) => {
    const record = formsModel.createFormFieldRecord({
      ...field,
      formId: form.id,
      organizationId: form.organizationId,
      sectionId: field.sectionId || firstSectionId,
      order: index,
      preview: true,
    });
    store.formsCenter.fields[record.id] = record;
    return record;
  });
  form.currentDraft = {
    sections: normalizedSections,
    fieldIds: savedFields.map((field) => field.id),
  };
  form.updatedByEmail = actorEmail;
  form.updatedAt = formsModel.nowIso();
  store.formsCenter.forms[form.id] = form;
  addAudit(store, form, "save_draft", actorEmail, "Preview draft snapshot saved.");
  return savedFields;
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
  form.updatedAt = version.createdAt;
  form.updatedByEmail = actorEmail;
  store.formsCenter.forms[form.id] = form;
  addAudit(store, form, "publish", actorEmail, `Published version ${version.versionNumber}.`, version.id);
  return version;
}

function createPreviewForm(store, org, actorEmail, spec) {
  const form = formsModel.createFormRecord({
    organizationId: org.id,
    title: spec.title,
    description: spec.description,
    category: spec.category,
    status: spec.status || formsModel.FORM_STATUSES.DRAFT,
    sourceFormId: spec.sourceFormId || "",
    createdByEmail: actorEmail,
    preview: true,
  });
  store.formsCenter.forms[form.id] = form;
  addAudit(store, form, "create", actorEmail, "Preview form created.");
  saveDraftSnapshot(store, form, spec.sections, spec.fields, actorEmail);
  if (spec.publish) {
    publishForm(store, form, actorEmail);
  }
  if (spec.secondVersion) {
    saveDraftSnapshot(store, form, spec.secondVersion.sections || spec.sections, spec.secondVersion.fields, actorEmail);
    form.hasUnpublishedChanges = true;
    form.draftVersionNumber = (form.latestVersionNumber || 1) + 1;
    publishForm(store, form, actorEmail);
  }
  if (spec.status === formsModel.FORM_STATUSES.ARCHIVED) {
    form.previousStatus = form.status === formsModel.FORM_STATUSES.PUBLISHED
      ? formsModel.FORM_STATUSES.PUBLISHED
      : formsModel.FORM_STATUSES.DRAFT;
    form.status = formsModel.FORM_STATUSES.ARCHIVED;
    form.archivedAt = formsModel.nowIso();
    store.formsCenter.forms[form.id] = form;
    addAudit(store, form, "archive", actorEmail, "Preview form archived.");
  }
  return form;
}

function section(title, description = "") {
  return formsModel.createFormSection({ title, description });
}

function seedFormsCenterPreview(store, {
  adminEmail = "forms.preview@example.test",
  organizationId = "",
} = {}) {
  foundation.ensureFoundationStore(store);
  formsModel.ensureFormsCenterStore(store);
  store.formsCenterPreview = {
    seededAt: formsModel.nowIso(),
    label: PREVIEW_MARKER,
    adminEmail: String(adminEmail || "").trim().toLowerCase(),
    emailSent: false,
    stripeTouched: false,
    aiTouched: false,
    responseCollection: false,
  };

  const org = ensurePreviewOrganization(store, { adminEmail, organizationId });
  const actorEmail = String(adminEmail || "").trim().toLowerCase() || org.ownerEmail || "forms.preview@example.test";

  Object.keys(store.formsCenter.forms).forEach((id) => {
    const form = store.formsCenter.forms[id];
    if (form?.organizationId === org.id && form.preview === true) delete store.formsCenter.forms[id];
  });
  Object.keys(store.formsCenter.fields).forEach((id) => {
    const field = store.formsCenter.fields[id];
    if (field?.organizationId === org.id && field.preview === true) delete store.formsCenter.fields[id];
  });
  Object.keys(store.formsCenter.versions).forEach((id) => {
    const version = store.formsCenter.versions[id];
    if (version?.organizationId === org.id && version.preview === true) delete store.formsCenter.versions[id];
  });
  Object.keys(store.formsCenter.audit).forEach((id) => {
    const row = store.formsCenter.audit[id];
    if (row?.organizationId === org.id && row.preview === true) delete store.formsCenter.audit[id];
  });

  const emergencySections = [
    section("Child Information", "Basic child details for emergency reference."),
    section("Parent / Guardian Contacts"),
    section("Emergency Contacts and Medical Notes"),
  ];
  const emergency = createPreviewForm(store, org, actorEmail, {
    title: "Emergency Contact Form",
    description: "Multi-section emergency contact and health details for a child's file.",
    category: formsModel.FORM_CATEGORIES.EMERGENCY_CONTACTS,
    publish: true,
    sections: emergencySections,
    fields: [
      { type: formsModel.FIELD_TYPES.SMART_CHILD_NAME, label: "Child's full name", required: true, sectionId: emergencySections[0].id },
      { type: formsModel.FIELD_TYPES.SMART_CHILD_DATE_OF_BIRTH, label: "Date of birth", required: true, sectionId: emergencySections[0].id },
      { type: formsModel.FIELD_TYPES.SMART_PARENT_GUARDIAN_NAME, label: "Parent / guardian name", required: true, sectionId: emergencySections[1].id },
      { type: formsModel.FIELD_TYPES.SMART_PARENT_PHONE, label: "Primary phone", required: true, sectionId: emergencySections[1].id },
      { type: formsModel.FIELD_TYPES.EMAIL, label: "Parent email", required: true, sectionId: emergencySections[1].id },
      { type: formsModel.FIELD_TYPES.SMART_EMERGENCY_CONTACT_NAME, label: "Emergency contact name", required: true, sectionId: emergencySections[2].id },
      { type: formsModel.FIELD_TYPES.SMART_EMERGENCY_CONTACT_PHONE, label: "Emergency contact phone", required: true, sectionId: emergencySections[2].id },
      { type: formsModel.FIELD_TYPES.SMART_ALLERGIES, label: "Allergies or medical alerts", sectionId: emergencySections[2].id },
    ],
    secondVersion: {
      fields: [
        { type: formsModel.FIELD_TYPES.CONTENT_PARAGRAPH, label: "Emergency instructions", helpText: "Please keep this information current and notify the provider of any changes.", sectionId: emergencySections[0].id },
        { type: formsModel.FIELD_TYPES.SMART_CHILD_NAME, label: "Child's full name", required: true, sectionId: emergencySections[0].id },
        { type: formsModel.FIELD_TYPES.SMART_CHILD_DATE_OF_BIRTH, label: "Date of birth", required: true, sectionId: emergencySections[0].id },
        { type: formsModel.FIELD_TYPES.SMART_PARENT_GUARDIAN_NAME, label: "Parent / guardian name", required: true, sectionId: emergencySections[1].id },
        { type: formsModel.FIELD_TYPES.SMART_PARENT_PHONE, label: "Primary phone", required: true, sectionId: emergencySections[1].id },
        { type: formsModel.FIELD_TYPES.EMAIL, label: "Parent email", required: true, sectionId: emergencySections[1].id },
        { type: formsModel.FIELD_TYPES.SMART_EMERGENCY_CONTACT_NAME, label: "Emergency contact name", required: true, sectionId: emergencySections[2].id },
        { type: formsModel.FIELD_TYPES.SMART_EMERGENCY_CONTACT_PHONE, label: "Emergency contact phone", required: true, sectionId: emergencySections[2].id },
        { type: formsModel.FIELD_TYPES.SMART_ALLERGIES, label: "Allergies or medical alerts", sectionId: emergencySections[2].id },
        { type: formsModel.FIELD_TYPES.SMART_PHYSICIAN, label: "Physician / clinic", sectionId: emergencySections[2].id },
      ],
    },
  });

  const photoSections = [section("Permission Choices"), section("Testing-only Signatures")];
  createPreviewForm(store, org, actorEmail, {
    title: "Photo Permission Form",
    description: "Parent permission choices for classroom photos and program documentation.",
    category: formsModel.FORM_CATEGORIES.PERMISSIONS,
    publish: true,
    sections: photoSections,
    fields: [
      { type: formsModel.FIELD_TYPES.SMART_CHILD_NAME, label: "Child's name", required: true, sectionId: photoSections[0].id },
      { type: formsModel.FIELD_TYPES.CHECKBOXES, label: "I give permission for photos to be used for:", options: ["Daily reports to families", "Classroom documentation panels", "Private program newsletter", "No public social media"], required: true, sectionId: photoSections[0].id },
      { type: formsModel.FIELD_TYPES.ACKNOWLEDGMENT, label: "I understand I can update this permission in writing.", required: true, sectionId: photoSections[0].id },
      { type: formsModel.FIELD_TYPES.SIGNATURE_PARENT, label: "Parent signature placeholder (testing only)", required: true, sectionId: photoSections[1].id },
      { type: formsModel.FIELD_TYPES.DATE, label: "Date", required: true, sectionId: photoSections[1].id },
    ],
  });

  const tripSections = [section("Trip Details"), section("Permission and Emergency")];
  createPreviewForm(store, org, actorEmail, {
    title: "Field Trip Permission Form",
    description: "Permission slip for off-site classroom experiences.",
    category: formsModel.FORM_CATEGORIES.FIELD_TRIPS,
    publish: true,
    sections: tripSections,
    fields: [
      { type: formsModel.FIELD_TYPES.SMART_CHILD_NAME, label: "Child's name", required: true, sectionId: tripSections[0].id },
      { type: formsModel.FIELD_TYPES.SHORT_TEXT, label: "Destination", required: true, sectionId: tripSections[0].id },
      { type: formsModel.FIELD_TYPES.DATE, label: "Trip date", required: true, sectionId: tripSections[0].id },
      { type: formsModel.FIELD_TYPES.YES_NO, label: "My child may attend this field trip.", required: true, sectionId: tripSections[1].id },
      { type: formsModel.FIELD_TYPES.SMART_EMERGENCY_CONTACT_PHONE, label: "Emergency phone for trip day", required: true, sectionId: tripSections[1].id },
      { type: formsModel.FIELD_TYPES.SIGNATURE_PARENT, label: "Parent signature placeholder (testing only)", required: true, sectionId: tripSections[1].id },
    ],
  });

  const childInfoSections = [section("Updates"), section("Care Notes")];
  createPreviewForm(store, org, actorEmail, {
    title: "Child Information Update",
    description: "Draft form for families to update child details during the year.",
    category: formsModel.FORM_CATEGORIES.CHILD_INFORMATION,
    status: formsModel.FORM_STATUSES.DRAFT,
    sections: childInfoSections,
    fields: [
      { type: formsModel.FIELD_TYPES.SMART_CHILD_NAME, label: "Child's name", required: true, sectionId: childInfoSections[0].id },
      { type: formsModel.FIELD_TYPES.LONG_TEXT, label: "What information has changed?", required: true, sectionId: childInfoSections[0].id },
      { type: formsModel.FIELD_TYPES.SMART_MEDICATIONS, label: "Medication updates", sectionId: childInfoSections[1].id },
      { type: formsModel.FIELD_TYPES.LONG_TEXT, label: "Comfort items or routines to update", sectionId: childInfoSections[1].id },
    ],
  });

  const agreementSections = [section("Agreement"), section("Acknowledgment")];
  createPreviewForm(store, org, actorEmail, {
    title: "Custom Parent Agreement",
    description: "Archived custom agreement example for preview filtering.",
    category: formsModel.FORM_CATEGORIES.PARENT_AGREEMENTS,
    publish: true,
    status: formsModel.FORM_STATUSES.ARCHIVED,
    sections: agreementSections,
    fields: [
      { type: formsModel.FIELD_TYPES.CONTENT_PARAGRAPH, label: "Agreement terms", helpText: "Families agree to follow program policies, tuition terms, and communication expectations.", sectionId: agreementSections[0].id },
      { type: formsModel.FIELD_TYPES.ACKNOWLEDGMENT, label: "I have read and understand this agreement.", required: true, sectionId: agreementSections[1].id },
      { type: formsModel.FIELD_TYPES.SIGNATURE_PARENT, label: "Parent signature placeholder (testing only)", required: true, sectionId: agreementSections[1].id },
    ],
  });

  const emergencySnapshot = formsModel.snapshotFromForm(store, emergency);
  const duplicated = formsModel.createFormRecord({
    organizationId: org.id,
    title: "Emergency Contact Form Copy",
    description: "Duplicated template example with new field IDs.",
    category: formsModel.FORM_CATEGORIES.EMERGENCY_CONTACTS,
    sourceFormId: emergency.id,
    createdByEmail: actorEmail,
    preview: true,
  });
  const cloned = formsModel.cloneSnapshotForForm(emergencySnapshot, {
    formId: duplicated.id,
    organizationId: org.id,
    preview: true,
  });
  cloned.fields.forEach((field) => { store.formsCenter.fields[field.id] = field; });
  duplicated.currentDraft = { sections: cloned.sections, fieldIds: cloned.fieldIds };
  store.formsCenter.forms[duplicated.id] = duplicated;
  addAudit(store, duplicated, "duplicate", actorEmail, "Preview duplicated template created.", "", { sourceFormId: emergency.id });

  return {
    ok: true,
    preview: true,
    label: PREVIEW_MARKER,
    organizationId: org.id,
    emailSent: false,
    stripeTouched: false,
    aiTouched: false,
    responseCollection: false,
    counts: {
      forms: listValues(store.formsCenter.forms).filter((form) => form.organizationId === org.id).length,
      versions: listValues(store.formsCenter.versions).filter((version) => version.organizationId === org.id).length,
      fields: listValues(store.formsCenter.fields).filter((field) => field.organizationId === org.id).length,
      audit: listValues(store.formsCenter.audit).filter((row) => row.organizationId === org.id).length,
    },
    forms: listValues(store.formsCenter.forms).filter((form) => form.organizationId === org.id),
  };
}

module.exports = {
  PREVIEW_MARKER,
  seedFormsCenterPreview,
  ensurePreviewOrganization,
};
