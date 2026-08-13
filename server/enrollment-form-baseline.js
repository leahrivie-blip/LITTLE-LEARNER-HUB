/**
 * Baseline Enrollment Form schema for Little Learner Hub (testing Forms spine).
 *
 * Extends the existing Wave 3+ structured field / template architecture.
 * Does NOT create a second Forms store, PDF engine, or enrollment CRM.
 *
 * Historical protection:
 * - Assigned Documents already snapshot `fields` + body at Confirm & Send.
 * - Editing this baseline / a provider template never rewrites old submissions.
 * - Stable field IDs keep answers valid when labels later change.
 *
 * Child Profile overlap (canonical current record — separate from signed snapshot):
 * - name ← legal first + last (+ preferred)
 * - dob ← date of birth
 * - classroom / classroomId ← classroom/program
 * - enrollmentDate ← requested/start date
 * - parentInfo / guardians ← guardian 1 (+ 2 summary)
 * - emergencyContact ← emergency contacts summary
 * - pickupContacts ← authorized pickup summary
 * - allergies / medical ← medical section
 * Profile edits must not mutate historical enrollment submissions.
 */
(function enrollmentFormBaselineModule(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) root.LlhEnrollmentBaseline = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function factory() {
  "use strict";

const ENROLLMENT_FORM_KIND = "enrollment_baseline";
const ENROLLMENT_PACK_FORM_ID = "hdh-pack-enrollment";
const ENROLLMENT_RESOURCE_ID = "form-enrollment-forms-enrollment-packet";
const ENROLLMENT_TEMPLATE_TITLE = "Enrollment Form";
const ENROLLMENT_CATEGORY = "Enrollment";

const BASELINE_DISCLAIMER =
  "Customize this form for your program. State or licensing-specific requirements may need to be added separately.";

const WEEKDAYS = Object.freeze([
  { id: "monday", label: "Monday" },
  { id: "tuesday", label: "Tuesday" },
  { id: "wednesday", label: "Wednesday" },
  { id: "thursday", label: "Thursday" },
  { id: "friday", label: "Friday" },
]);

const CHILD_PROFILE_FIELD_MAP = Object.freeze({
  "enroll.child.legal_first_name": { profileKey: "name", role: "name_first" },
  "enroll.child.legal_last_name": { profileKey: "name", role: "name_last" },
  "enroll.child.preferred_name": { profileKey: "name", role: "preferred" },
  "enroll.child.dob": { profileKey: "dob" },
  "enroll.child.classroom": { profileKey: "classroom" },
  "enroll.child.requested_start_date": { profileKey: "enrollmentDate" },
  "enroll.guardian1.full_name": { profileKey: "parentInfo", role: "guardian1_name" },
  "enroll.guardian1.email": { profileKey: "parentInfo", role: "guardian1_email" },
  "enroll.guardian1.primary_phone": { profileKey: "parentInfo", role: "guardian1_phone" },
  "enroll.medical.allergies": { profileKey: "allergies" },
  "enroll.medical.food_allergies": { profileKey: "allergies", role: "food" },
  "enroll.medical.conditions": { profileKey: "medical", role: "conditions" },
  "enroll.medical.medications": { profileKey: "medical", role: "medications" },
  "enroll.medical.emergency_info": { profileKey: "medical", role: "emergency" },
});

function field(id, type, label, extras = {}) {
  const base = {
    id,
    type,
    label,
    helpText: extras.helpText || "",
    required: Boolean(extras.required),
    options: Array.isArray(extras.options) ? extras.options : [],
    placeholder: extras.placeholder || "",
    sectionId: extras.sectionId || "",
    visible: extras.visible !== false,
    optionalByDefault: Boolean(extras.optionalByDefault),
    ageGroup: extras.ageGroup || "", // "", "infant_toddler", "older"
    configurable: extras.configurable !== false,
    permissionItem: Boolean(extras.permissionItem),
    documentItem: Boolean(extras.documentItem),
    acknowledgmentItem: Boolean(extras.acknowledgmentItem),
    customizable: extras.customizable !== false,
  };
  if ((type === "radio" || type === "dropdown") && base.options.length) {
    base.options = base.options.map((opt, index) => {
      if (typeof opt === "string") {
        return { id: `opt_${index + 1}`, label: opt, value: opt };
      }
      return {
        id: opt.id || `opt_${index + 1}`,
        label: opt.label || opt.value || `Option ${index + 1}`,
        value: opt.value || opt.label || `Option ${index + 1}`,
      };
    });
  }
  return base;
}

function yesNo(id, label, extras = {}) {
  return field(id, "yes_no", label, extras);
}

function shortText(id, label, extras = {}) {
  return field(id, "short_text", label, extras);
}

function longText(id, label, extras = {}) {
  return field(id, "long_text", label, extras);
}

function dateField(id, label, extras = {}) {
  return field(id, "date", label, extras);
}

function timeField(id, label, extras = {}) {
  return field(id, "time", label, extras);
}

function checkbox(id, label, extras = {}) {
  return field(id, "checkbox", label, extras);
}

function dropdown(id, label, options, extras = {}) {
  return field(id, "dropdown", label, { ...extras, options });
}

function signature(id, label, extras = {}) {
  return field(id, "signature", label, { ...extras, required: extras.required !== false });
}

function buildWeekdayScheduleFields(sectionId) {
  const out = [];
  WEEKDAYS.forEach((day) => {
    out.push(checkbox(`enroll.schedule.${day.id}.attending`, `${day.label} — Attending`, {
      sectionId,
      required: false,
    }));
    out.push(timeField(`enroll.schedule.${day.id}.arrival`, `${day.label} — Expected arrival`, {
      sectionId,
      required: false,
    }));
    out.push(timeField(`enroll.schedule.${day.id}.departure`, `${day.label} — Expected departure`, {
      sectionId,
      required: false,
    }));
  });
  out.push(longText("enroll.schedule.notes", "Schedule notes", {
    sectionId,
    required: false,
    optionalByDefault: true,
  }));
  out.push(yesNo("enroll.schedule.variable", "Variable / rotating schedule?", {
    sectionId,
    required: false,
    optionalByDefault: true,
    helpText: "If yes, describe the rotation in schedule notes.",
  }));
  return out;
}

function buildGuardianFields(prefix, sectionId, { requiredDefaults = true } = {}) {
  return [
    shortText(`enroll.${prefix}.full_name`, "Full name", {
      sectionId,
      required: requiredDefaults,
    }),
    shortText(`enroll.${prefix}.relationship`, "Relationship to child", {
      sectionId,
      required: requiredDefaults,
    }),
    shortText(`enroll.${prefix}.home_address`, "Home address", {
      sectionId,
      required: false,
    }),
    checkbox(`enroll.${prefix}.same_as_child_address`, "Same as child address", {
      sectionId,
      required: false,
    }),
    shortText(`enroll.${prefix}.primary_phone`, "Primary phone", {
      sectionId,
      required: requiredDefaults,
    }),
    shortText(`enroll.${prefix}.secondary_phone`, "Secondary phone", {
      sectionId,
      required: false,
      optionalByDefault: true,
    }),
    shortText(`enroll.${prefix}.email`, "Email", {
      sectionId,
      required: requiredDefaults,
    }),
    shortText(`enroll.${prefix}.employer`, "Employer", {
      sectionId,
      required: false,
      optionalByDefault: true,
    }),
    shortText(`enroll.${prefix}.work_phone`, "Work phone", {
      sectionId,
      required: false,
      optionalByDefault: true,
    }),
    dropdown(`enroll.${prefix}.preferred_contact`, "Preferred contact method", [
      "Phone call",
      "Text message",
      "Email",
      "In person",
    ], {
      sectionId,
      required: false,
    }),
  ];
}

function buildRepeatPersonFields(kind, count, sectionId, extraFieldBuilder) {
  const out = [];
  for (let i = 1; i <= count; i += 1) {
    const prefix = `enroll.${kind}.${i}`;
    out.push(shortText(`${prefix}.name`, `${kind === "emergency" ? "Emergency contact" : "Authorized pickup"} ${i} — Name`, {
      sectionId,
      required: i === 1,
    }));
    out.push(shortText(`${prefix}.relationship`, `${kind === "emergency" ? "Emergency contact" : "Authorized pickup"} ${i} — Relationship`, {
      sectionId,
      required: i === 1,
    }));
    out.push(shortText(`${prefix}.primary_phone`, `${kind === "emergency" ? "Emergency contact" : "Authorized pickup"} ${i} — Primary phone`, {
      sectionId,
      required: i === 1,
    }));
    if (typeof extraFieldBuilder === "function") {
      out.push(...extraFieldBuilder(prefix, i, sectionId));
    }
  }
  return out;
}

function buildBaselineSections() {
  return [
    { id: "child_info", title: "Child Information", order: 0, visible: true, optional: false, fixed: true },
    { id: "schedule", title: "Enrollment Schedule & Hours", order: 1, visible: true, optional: false, fixed: true },
    { id: "guardian1", title: "Parent / Guardian 1", order: 2, visible: true, optional: false, fixed: true },
    { id: "guardian2", title: "Parent / Guardian 2", order: 3, visible: true, optional: true, fixed: false },
    { id: "household", title: "Household / Custody Information", order: 4, visible: true, optional: true, fixed: false },
    { id: "emergency", title: "Emergency Contacts", order: 5, visible: true, optional: false, fixed: true },
    { id: "authorized_pickup", title: "Authorized Pickup", order: 6, visible: true, optional: false, fixed: true },
    { id: "medical", title: "Medical Information", order: 7, visible: true, optional: false, fixed: true },
    { id: "development", title: "Development & Individual Needs", order: 8, visible: true, optional: true, fixed: false },
    { id: "daily_care", title: "Daily Care Information", order: 9, visible: true, optional: true, fixed: false },
    { id: "getting_to_know", title: "Getting to Know Your Child", order: 10, visible: true, optional: true, fixed: false },
    { id: "permissions", title: "Permissions & Consents", order: 11, visible: true, optional: false, fixed: true },
    { id: "documents", title: "Required Document Checklist", order: 12, visible: true, optional: true, fixed: false },
    { id: "policies", title: "Policy Acknowledgments", order: 13, visible: true, optional: false, fixed: true },
    { id: "signatures", title: "Signatures", order: 14, visible: true, optional: false, fixed: true },
  ];
}

function buildBaselineFields() {
  const fields = [];

  // Section 1 — Child Information
  fields.push(
    shortText("enroll.child.legal_first_name", "Legal first name", { sectionId: "child_info", required: true }),
    shortText("enroll.child.middle_name", "Middle name", { sectionId: "child_info", required: false, optionalByDefault: true }),
    shortText("enroll.child.legal_last_name", "Last name", { sectionId: "child_info", required: true }),
    shortText("enroll.child.preferred_name", "Preferred name", { sectionId: "child_info", required: false }),
    dateField("enroll.child.dob", "Date of birth", { sectionId: "child_info", required: true }),
    dropdown("enroll.child.gender", "Gender", ["Girl", "Boy", "Prefer not to say", "Other"], {
      sectionId: "child_info",
      required: false,
      optionalByDefault: true,
      configurable: true,
      helpText: "Optional — programs may hide this field.",
    }),
    shortText("enroll.child.home_address", "Home address", { sectionId: "child_info", required: true }),
    shortText("enroll.child.city", "City", { sectionId: "child_info", required: true }),
    shortText("enroll.child.state", "State", { sectionId: "child_info", required: true }),
    shortText("enroll.child.zip", "ZIP", { sectionId: "child_info", required: true }),
    shortText("enroll.child.primary_language", "Primary language", { sectionId: "child_info", required: false }),
    dateField("enroll.child.requested_start_date", "Requested / start date", { sectionId: "child_info", required: true }),
    shortText("enroll.child.classroom", "Classroom / program", { sectionId: "child_info", required: false }),
    dropdown("enroll.child.enrollment_type", "Enrollment type", [
      "Full-time",
      "Part-time",
      "Drop-in",
      "Other",
    ], { sectionId: "child_info", required: true }),
  );

  // Section 2 — Schedule
  fields.push(...buildWeekdayScheduleFields("schedule"));

  // Section 3–4 — Guardians
  fields.push(...buildGuardianFields("guardian1", "guardian1", { requiredDefaults: true }));
  fields.push(...buildGuardianFields("guardian2", "guardian2", { requiredDefaults: false }));

  // Section 5 — Household / custody
  fields.push(
    shortText("enroll.household.lives_with", "Who does the child live with?", {
      sectionId: "household",
      required: false,
    }),
    yesNo("enroll.household.custody_restrictions", "Are there custody restrictions?", {
      sectionId: "household",
      required: false,
    }),
    yesNo("enroll.household.court_orders", "Are there court orders affecting pickup/contact?", {
      sectionId: "household",
      required: false,
    }),
    yesNo("enroll.household.documentation_provided", "Documentation provided?", {
      sectionId: "household",
      required: false,
    }),
    longText("enroll.household.custody_notes", "Custody / restriction notes", {
      sectionId: "household",
      required: false,
      helpText: "Share only what the program needs for safe pickup and contact.",
    }),
    longText("enroll.household.not_authorized", "Persons specifically NOT authorized to pick up or contact the child", {
      sectionId: "household",
      required: false,
    }),
  );

  // Section 6 — Emergency contacts (3 slots)
  fields.push(...buildRepeatPersonFields("emergency", 3, "emergency", (prefix, index, sectionId) => [
    shortText(`${prefix}.secondary_phone`, `Emergency contact ${index} — Secondary phone`, {
      sectionId,
      required: false,
      optionalByDefault: true,
    }),
    yesNo(`${prefix}.authorized_pickup`, `Emergency contact ${index} — Authorized pickup?`, {
      sectionId,
      required: false,
    }),
  ]));

  // Section 7 — Authorized pickup (3 slots)
  fields.push(
    field("enroll.pickup.policy_note", "info", "Identification may be required according to program policy.", {
      sectionId: "authorized_pickup",
      required: false,
      helpText: "Staff may ask for photo ID before releasing a child.",
    }),
  );
  for (let i = 1; i <= 3; i += 1) {
    fields.push(
      shortText(`enroll.pickup.${i}.name`, `Authorized pickup ${i} — Name`, {
        sectionId: "authorized_pickup",
        required: i === 1,
      }),
      shortText(`enroll.pickup.${i}.relationship`, `Authorized pickup ${i} — Relationship`, {
        sectionId: "authorized_pickup",
        required: i === 1,
      }),
      shortText(`enroll.pickup.${i}.phone`, `Authorized pickup ${i} — Phone`, {
        sectionId: "authorized_pickup",
        required: i === 1,
      }),
      longText(`enroll.pickup.${i}.notes`, `Authorized pickup ${i} — Notes`, {
        sectionId: "authorized_pickup",
        required: false,
        optionalByDefault: true,
      }),
    );
  }

  // Section 8 — Medical
  fields.push(
    shortText("enroll.medical.physician", "Pediatrician / physician", { sectionId: "medical", required: false }),
    shortText("enroll.medical.physician_phone", "Physician phone", { sectionId: "medical", required: false }),
    shortText("enroll.medical.preferred_hospital", "Preferred hospital", { sectionId: "medical", required: false }),
    shortText("enroll.medical.insurance", "Health insurance information", {
      sectionId: "medical",
      required: false,
      optionalByDefault: true,
      configurable: true,
    }),
    longText("enroll.medical.allergies", "Allergies", { sectionId: "medical", required: false }),
    longText("enroll.medical.food_allergies", "Food allergies", { sectionId: "medical", required: false }),
    longText("enroll.medical.medications", "Medications", { sectionId: "medical", required: false }),
    longText("enroll.medical.conditions", "Medical conditions", { sectionId: "medical", required: false }),
    longText("enroll.medical.dietary", "Dietary restrictions", { sectionId: "medical", required: false }),
    longText("enroll.medical.emergency_info", "Emergency medical information", { sectionId: "medical", required: false }),
    longText("enroll.medical.special_instructions", "Special health instructions", { sectionId: "medical", required: false }),
  );

  // Section 9 — Development (optional by default)
  fields.push(
    longText("enroll.development.considerations", "Developmental considerations", {
      sectionId: "development", required: false, optionalByDefault: true,
    }),
    longText("enroll.development.speech", "Speech / language considerations", {
      sectionId: "development", required: false, optionalByDefault: true,
    }),
    longText("enroll.development.physical", "Physical accommodations", {
      sectionId: "development", required: false, optionalByDefault: true,
    }),
    longText("enroll.development.sensory", "Sensory needs", {
      sectionId: "development", required: false, optionalByDefault: true,
    }),
    longText("enroll.development.social_emotional", "Social-emotional / behavioral support considerations", {
      sectionId: "development", required: false, optionalByDefault: true,
    }),
    longText("enroll.development.outside_services", "Outside services / therapies", {
      sectionId: "development", required: false, optionalByDefault: true,
    }),
    longText("enroll.development.teacher_support", "Additional teacher support notes", {
      sectionId: "development", required: false, optionalByDefault: true,
    }),
  );

  // Section 10 — Daily care (age-aware optional fields)
  fields.push(
    longText("enroll.daily.breast_formula", "Breast milk / formula", {
      sectionId: "daily_care", required: false, optionalByDefault: true, ageGroup: "infant_toddler",
    }),
    longText("enroll.daily.bottle_schedule", "Bottle schedule", {
      sectionId: "daily_care", required: false, optionalByDefault: true, ageGroup: "infant_toddler",
    }),
    longText("enroll.daily.feeding_instructions", "Feeding instructions", {
      sectionId: "daily_care", required: false, optionalByDefault: true, ageGroup: "infant_toddler",
    }),
    longText("enroll.daily.food_introduction", "Food introduction status", {
      sectionId: "daily_care", required: false, optionalByDefault: true, ageGroup: "infant_toddler",
    }),
    longText("enroll.daily.nap_schedule", "Nap schedule", {
      sectionId: "daily_care", required: false, optionalByDefault: true, ageGroup: "infant_toddler",
    }),
    longText("enroll.daily.sleep_routine", "Sleep routine", {
      sectionId: "daily_care", required: false, optionalByDefault: true, ageGroup: "infant_toddler",
    }),
    yesNo("enroll.daily.pacifier", "Uses a pacifier?", {
      sectionId: "daily_care", required: false, optionalByDefault: true, ageGroup: "infant_toddler",
    }),
    longText("enroll.daily.comfort_items", "Comfort items", {
      sectionId: "daily_care", required: false, optionalByDefault: true, ageGroup: "infant_toddler",
    }),
    longText("enroll.daily.soothing", "Soothing strategies", {
      sectionId: "daily_care", required: false, optionalByDefault: true, ageGroup: "infant_toddler",
    }),
    longText("enroll.daily.diapering", "Diapering information", {
      sectionId: "daily_care", required: false, optionalByDefault: true, ageGroup: "infant_toddler",
    }),
    longText("enroll.daily.toileting_infant", "Toileting information", {
      sectionId: "daily_care", required: false, optionalByDefault: true, ageGroup: "infant_toddler",
    }),
    longText("enroll.daily.toileting_status", "Toileting status", {
      sectionId: "daily_care", required: false, optionalByDefault: true, ageGroup: "older",
    }),
    longText("enroll.daily.rest_needs", "Rest / nap needs", {
      sectionId: "daily_care", required: false, optionalByDefault: true, ageGroup: "older",
    }),
    longText("enroll.daily.eating_preferences", "Eating concerns / preferences", {
      sectionId: "daily_care", required: false, optionalByDefault: true, ageGroup: "older",
    }),
    longText("enroll.daily.comfort_needs", "Comfort needs", {
      sectionId: "daily_care", required: false, optionalByDefault: true, ageGroup: "older",
    }),
  );

  // Section 11 — Getting to know
  fields.push(
    longText("enroll.know.enjoys", "What does your child enjoy?", { sectionId: "getting_to_know", required: false }),
    longText("enroll.know.favorites", "Favorite toys or activities", { sectionId: "getting_to_know", required: false }),
    longText("enroll.know.happy", "What makes your child happy?", { sectionId: "getting_to_know", required: false }),
    longText("enroll.know.upset", "What tends to upset or frustrate your child?", { sectionId: "getting_to_know", required: false }),
    longText("enroll.know.comforted", "How does your child prefer to be comforted?", { sectionId: "getting_to_know", required: false }),
    longText("enroll.know.fears", "Does your child have any fears?", { sectionId: "getting_to_know", required: false }),
    longText("enroll.know.family_culture", "Family routines, traditions, or cultural information teachers should know", {
      sectionId: "getting_to_know", required: false,
    }),
    longText("enroll.know.anything_else", "Is there anything else you want us to know about your child?", {
      sectionId: "getting_to_know", required: false,
    }),
  );

  // Section 12 — Permissions (separate items)
  const permissionLabels = [
    ["emergency_medical", "Emergency medical treatment"],
    ["emergency_transport", "Emergency transportation"],
    ["walking_trips", "Walking trips"],
    ["field_trips", "Field trips"],
    ["program_transport", "Program transportation"],
    ["sunscreen", "Sunscreen"],
    ["insect_repellent", "Insect repellent"],
    ["diaper_cream", "Diaper cream / topical products"],
    ["classroom_photos", "Classroom / internal photos"],
    ["website_social_photos", "Website / social media photos"],
    ["video", "Video"],
    ["water_activities", "Water activities"],
  ];
  permissionLabels.forEach(([key, label]) => {
    fields.push(yesNo(`enroll.permission.${key}`, label, {
      sectionId: "permissions",
      required: true,
      permissionItem: true,
      configurable: true,
    }));
  });

  // Section 13 — Documents checklist
  const documentLabels = [
    ["immunization", "Immunization record"],
    ["birth_certificate", "Birth certificate (if program requires)"],
    ["health_physical", "Health / physical form"],
    ["allergy_action_plan", "Allergy action plan"],
    ["medication_auth", "Medication authorization"],
    ["custody_docs", "Custody documentation"],
    ["subsidy", "Childcare subsidy / assistance documentation"],
    ["other", "Other / custom document"],
  ];
  documentLabels.forEach(([key, label]) => {
    fields.push(checkbox(`enroll.document.${key}`, label, {
      sectionId: "documents",
      required: false,
      documentItem: true,
      configurable: true,
    }));
  });

  // Section 14 — Policy acknowledgments
  const policyLabels = [
    ["handbook", "Parent handbook"],
    ["tuition", "Tuition / payment policy"],
    ["attendance", "Attendance policy"],
    ["late_pickup", "Late pickup policy"],
    ["illness", "Illness / exclusion policy"],
    ["medication", "Medication policy"],
    ["guidance", "Guidance / discipline policy"],
    ["emergency", "Emergency procedures"],
    ["media", "Media / photo policy"],
    ["other", "Other / custom policy"],
  ];
  policyLabels.forEach(([key, label]) => {
    fields.push(checkbox(`enroll.policy.${key}`, label, {
      sectionId: "policies",
      required: true,
      acknowledgmentItem: true,
      configurable: true,
    }));
  });

  // Section 15 — Signatures (printable / existing signature placeholders)
  fields.push(
    shortText("enroll.sign.parent1_printed", "Parent / guardian printed name", {
      sectionId: "signatures", required: true,
    }),
    signature("enroll.sign.parent1_signature", "Parent / guardian signature", {
      sectionId: "signatures", required: true,
    }),
    dateField("enroll.sign.parent1_date", "Parent / guardian signature date", {
      sectionId: "signatures", required: true,
    }),
    shortText("enroll.sign.parent2_printed", "Second parent / guardian printed name", {
      sectionId: "signatures", required: false, optionalByDefault: true,
    }),
    signature("enroll.sign.parent2_signature", "Second parent / guardian signature", {
      sectionId: "signatures", required: false, optionalByDefault: true,
    }),
    dateField("enroll.sign.parent2_date", "Second parent / guardian signature date", {
      sectionId: "signatures", required: false, optionalByDefault: true,
    }),
    shortText("enroll.sign.director_printed", "Director / provider printed name", {
      sectionId: "signatures", required: false,
    }),
    signature("enroll.sign.director_signature", "Director / provider signature", {
      sectionId: "signatures", required: false,
    }),
    dateField("enroll.sign.director_date", "Director / provider signature date", {
      sectionId: "signatures", required: false,
    }),
  );

  return fields.map((item, index) => ({ ...item, order: index }));
}

function buildEnrollmentConfig(overrides = {}) {
  return {
    minEmergencyContacts: Math.max(1, Math.min(3, Number(overrides.minEmergencyContacts) || 1)),
    minAuthorizedPickup: Math.max(0, Math.min(3, Number(overrides.minAuthorizedPickup) || 1)),
    showInfantToddlerCare: overrides.showInfantToddlerCare !== false,
    showOlderChildCare: overrides.showOlderChildCare !== false,
    showGenderField: overrides.showGenderField !== false,
    showInsuranceField: overrides.showInsuranceField !== false,
  };
}

function buildEnrollmentBaselineTemplate(overrides = {}) {
  const sections = (overrides.sections || buildBaselineSections()).map((section, index) => ({
    id: String(section.id),
    title: String(section.title || section.id),
    order: Number.isFinite(Number(section.order)) ? Number(section.order) : index,
    visible: section.visible !== false,
    optional: Boolean(section.optional),
    fixed: Boolean(section.fixed),
  }));
  const fields = Array.isArray(overrides.fields) ? overrides.fields : buildBaselineFields();
  const enrollmentConfig = buildEnrollmentConfig(overrides.enrollmentConfig || {});
  return {
    id: overrides.id || "starter-enrollment-baseline",
    title: overrides.title || ENROLLMENT_TEMPLATE_TITLE,
    category: overrides.category || ENROLLMENT_CATEGORY,
    libraryCategory: "enrollment",
    description: "Baseline childcare enrollment packet — customize for your program.",
    body: overrides.body || [
      "ENROLLMENT FORM",
      "",
      BASELINE_DISCLAIMER,
      "",
      "Complete each section. Identification may be required for authorized pickup according to program policy.",
    ].join("\n"),
    bodyText: undefined,
    fields,
    sections,
    enrollmentConfig,
    formKind: ENROLLMENT_FORM_KIND,
    fieldSchemaVersion: 1,
    requiresSignature: true,
    sourceType: overrides.sourceType || "starter",
    packFormId: ENROLLMENT_PACK_FORM_ID,
    resourceId: ENROLLMENT_RESOURCE_ID,
    complianceDisclaimer: BASELINE_DISCLAIMER,
    originTemplateId: overrides.originTemplateId || "",
  };
}

function isEnrollmentBaselineTemplate(template = {}) {
  if (!template || typeof template !== "object") return false;
  if (String(template.formKind || "") === ENROLLMENT_FORM_KIND) return true;
  if (String(template.packFormId || "") === ENROLLMENT_PACK_FORM_ID) return true;
  const fields = Array.isArray(template.fields) ? template.fields : [];
  if (fields.some((field) => String(field?.id || "").startsWith("enroll."))) return true;
  // Starter pack id / resource only — do not treat arbitrary titled body-only rows as baseline.
  if (String(template.id || "") === ENROLLMENT_PACK_FORM_ID) return true;
  if (String(template.resourceId || "") === ENROLLMENT_RESOURCE_ID && fields.length > 0) return true;
  return false;
}

function normalizeEnrollmentSections(rawSections, { fallbackToBaseline = true } = {}) {
  const baseline = buildBaselineSections();
  const byId = new Map(baseline.map((section) => [section.id, { ...section }]));
  const list = Array.isArray(rawSections) ? rawSections : [];
  list.forEach((raw, index) => {
    if (!raw || typeof raw !== "object") return;
    const id = String(raw.id || "").trim();
    if (!id) return;
    const prev = byId.get(id) || {
      id,
      title: raw.title || id,
      order: index,
      visible: true,
      optional: true,
      fixed: false,
    };
    byId.set(id, {
      ...prev,
      title: String(raw.title || prev.title || id).slice(0, 160),
      order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : prev.order,
      visible: raw.visible !== false,
      optional: raw.optional != null ? Boolean(raw.optional) : prev.optional,
      fixed: raw.fixed != null ? Boolean(raw.fixed) : prev.fixed,
    });
  });
  const out = [...byId.values()].sort((a, b) => Number(a.order) - Number(b.order))
    .map((section, index) => ({ ...section, order: index }));
  if (!out.length && fallbackToBaseline) return baseline;
  return out;
}

function applyEnrollmentVisibility(template = {}, config = {}) {
  const enrollmentConfig = buildEnrollmentConfig({
    ...(template.enrollmentConfig || {}),
    ...config,
  });
  const sections = normalizeEnrollmentSections(template.sections);
  const hiddenSectionIds = new Set(
    sections.filter((section) => section.visible === false).map((section) => section.id),
  );
  const fields = (Array.isArray(template.fields) ? template.fields : []).map((fieldItem) => {
    let visible = fieldItem.visible !== false;
    if (hiddenSectionIds.has(String(fieldItem.sectionId || ""))) visible = false;
    if (fieldItem.id === "enroll.child.gender" && !enrollmentConfig.showGenderField) visible = false;
    if (fieldItem.id === "enroll.medical.insurance" && !enrollmentConfig.showInsuranceField) visible = false;
    if (fieldItem.ageGroup === "infant_toddler" && !enrollmentConfig.showInfantToddlerCare) visible = false;
    if (fieldItem.ageGroup === "older" && !enrollmentConfig.showOlderChildCare) visible = false;
    return { ...fieldItem, visible };
  });
  return {
    ...template,
    sections,
    fields,
    enrollmentConfig,
    formKind: ENROLLMENT_FORM_KIND,
  };
}

function visibleEnrollmentFields(template = {}) {
  const applied = applyEnrollmentVisibility(template);
  return (applied.fields || []).filter((fieldItem) => fieldItem.visible !== false);
}

function reorderEnrollmentSections(sections, fromIndex, toIndex) {
  const list = normalizeEnrollmentSections(sections);
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= list.length || toIndex >= list.length) return list;
  const [item] = list.splice(fromIndex, 1);
  list.splice(toIndex, 0, item);
  return list.map((section, index) => ({ ...section, order: index }));
}

function setEnrollmentSectionVisible(sections, sectionId, visible) {
  return normalizeEnrollmentSections(sections).map((section) => (
    String(section.id) === String(sectionId)
      ? { ...section, visible: Boolean(visible) }
      : section
  ));
}

function renameEnrollmentSection(sections, sectionId, title) {
  const nextTitle = String(title || "").trim().slice(0, 160);
  if (!nextTitle) return normalizeEnrollmentSections(sections);
  return normalizeEnrollmentSections(sections).map((section) => (
    String(section.id) === String(sectionId)
      ? { ...section, title: nextTitle }
      : section
  ));
}

function addCustomEnrollmentField(fields, {
  sectionId,
  type = "short_text",
  label = "Custom question",
  required = false,
  options = [],
} = {}) {
  const safeType = ["short_text", "long_text", "checkbox", "yes_no", "radio", "dropdown"].includes(type)
    ? type
    : "short_text";
  const id = `enroll.custom.${sectionId || "general"}.${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const list = Array.isArray(fields) ? fields.slice() : [];
  const fieldItem = field(id, safeType, label, {
    sectionId: sectionId || "getting_to_know",
    required: Boolean(required),
    options,
    configurable: true,
    customizable: true,
  });
  fieldItem.order = list.length;
  list.push(fieldItem);
  return list;
}

function addCustomPermission(fields, label = "Custom permission") {
  return addCustomEnrollmentField(fields, {
    sectionId: "permissions",
    type: "yes_no",
    label,
    required: true,
  }).map((item) => (
    item.id.startsWith("enroll.custom.permissions.")
      ? { ...item, permissionItem: true }
      : item
  ));
}

function addCustomDocumentItem(fields, label = "Custom document") {
  return addCustomEnrollmentField(fields, {
    sectionId: "documents",
    type: "checkbox",
    label,
    required: false,
  }).map((item) => (
    item.id.startsWith("enroll.custom.documents.")
      ? { ...item, documentItem: true }
      : item
  ));
}

function addCustomPolicyAcknowledgment(fields, label = "Custom policy acknowledgment") {
  return addCustomEnrollmentField(fields, {
    sectionId: "policies",
    type: "checkbox",
    label,
    required: true,
  }).map((item) => (
    item.id.startsWith("enroll.custom.policies.")
      ? { ...item, acknowledgmentItem: true }
      : item
  ));
}

/**
 * Map enrollment answers → soft Child Profile patch (current record only).
 * Never mutates historical submission snapshots.
 */
function buildChildProfilePatchFromEnrollmentAnswers(answers = {}, fields = []) {
  const ans = answers && typeof answers === "object" ? answers : {};
  const patch = {};
  const first = String(ans["enroll.child.legal_first_name"] || "").trim();
  const last = String(ans["enroll.child.legal_last_name"] || "").trim();
  const preferred = String(ans["enroll.child.preferred_name"] || "").trim();
  if (first || last) {
    patch.name = [first, last].filter(Boolean).join(" ");
    if (preferred && preferred.toLowerCase() !== first.toLowerCase()) {
      patch.name = `${patch.name} (${preferred})`;
    }
  }
  if (ans["enroll.child.dob"]) patch.dob = String(ans["enroll.child.dob"]).trim();
  if (ans["enroll.child.classroom"]) patch.classroom = String(ans["enroll.child.classroom"]).trim();
  if (ans["enroll.child.requested_start_date"]) {
    patch.enrollmentDate = String(ans["enroll.child.requested_start_date"]).trim();
  }
  const g1Name = String(ans["enroll.guardian1.full_name"] || "").trim();
  const g1Email = String(ans["enroll.guardian1.email"] || "").trim();
  const g1Phone = String(ans["enroll.guardian1.primary_phone"] || "").trim();
  if (g1Name || g1Email || g1Phone) {
    patch.parentInfo = [g1Name, g1Email, g1Phone].filter(Boolean).join(" · ");
  }
  const allergies = [
    String(ans["enroll.medical.allergies"] || "").trim(),
    String(ans["enroll.medical.food_allergies"] || "").trim(),
  ].filter(Boolean);
  if (allergies.length) patch.allergies = allergies.join("; ");
  const medicalBits = [
    ans["enroll.medical.conditions"] ? `Conditions: ${ans["enroll.medical.conditions"]}` : "",
    ans["enroll.medical.medications"] ? `Medications: ${ans["enroll.medical.medications"]}` : "",
    ans["enroll.medical.emergency_info"] ? `Emergency: ${ans["enroll.medical.emergency_info"]}` : "",
  ].filter(Boolean);
  if (medicalBits.length) patch.medical = medicalBits.join(" | ");

  const emergencyParts = [];
  for (let i = 1; i <= 3; i += 1) {
    const name = String(ans[`enroll.emergency.${i}.name`] || "").trim();
    const phone = String(ans[`enroll.emergency.${i}.primary_phone`] || "").trim();
    if (name || phone) emergencyParts.push([name, phone].filter(Boolean).join(" "));
  }
  if (emergencyParts.length) patch.emergencyContact = emergencyParts.join("; ");

  const pickupParts = [];
  for (let i = 1; i <= 3; i += 1) {
    const name = String(ans[`enroll.pickup.${i}.name`] || "").trim();
    const phone = String(ans[`enroll.pickup.${i}.phone`] || "").trim();
    if (name || phone) pickupParts.push([name, phone].filter(Boolean).join(" "));
  }
  if (pickupParts.length) patch.pickupContacts = pickupParts.join("; ");

  // fields arg reserved for future required-field awareness
  void fields;
  return patch;
}

function enrollmentBaselineStats(template = buildEnrollmentBaselineTemplate()) {
  const applied = applyEnrollmentVisibility(template);
  const fields = applied.fields || [];
  const sections = applied.sections || [];
  return {
    sectionCount: sections.length,
    fieldCount: fields.length,
    visibleFieldCount: fields.filter((f) => f.visible !== false).length,
    weekdayScheduleFields: fields.filter((f) => String(f.id).includes(".schedule.")).length,
    emergencyContactSlots: 3,
    authorizedPickupSlots: 3,
    permissionCount: fields.filter((f) => f.permissionItem).length,
  };
}

  return {
    ENROLLMENT_FORM_KIND,
    ENROLLMENT_PACK_FORM_ID,
    ENROLLMENT_RESOURCE_ID,
    ENROLLMENT_TEMPLATE_TITLE,
    ENROLLMENT_CATEGORY,
    BASELINE_DISCLAIMER,
    WEEKDAYS,
    CHILD_PROFILE_FIELD_MAP,
    buildBaselineSections,
    buildBaselineFields,
    buildEnrollmentConfig,
    buildEnrollmentBaselineTemplate,
    isEnrollmentBaselineTemplate,
    normalizeEnrollmentSections,
    applyEnrollmentVisibility,
    visibleEnrollmentFields,
    reorderEnrollmentSections,
    setEnrollmentSectionVisible,
    renameEnrollmentSection,
    addCustomEnrollmentField,
    addCustomPermission,
    addCustomDocumentItem,
    addCustomPolicyAcknowledgment,
    buildChildProfilePatchFromEnrollmentAnswers,
    enrollmentBaselineStats
  };
}));
