/**
 * Phase 5 starter built-in form library — 29 general U.S. childcare templates.
 *
 * This file is a structured-import payload (see built-in-form-library-importer.js).
 * It is the canonical source for the built-in library seeded on testing.
 *
 * Every template:
 * - is a general U.S. childcare template, not tied to any single state
 * - includes a standard review reminder plus an extra reminder for sensitive topics
 * - is written to be genuinely useful, not a placeholder shell
 * - never claims legal, medical, or licensing approval
 */

const model = require("./built-in-form-library-data-model.js");

const C = model.BUILT_IN_CATEGORIES;
const REVIEW = model.DEFAULT_REVIEW_REMINDER;
const MEDICAL_REMINDER = "Medical information should be reviewed with families and, when appropriate, a healthcare provider. This template does not provide medical advice.";
const LICENSING_REMINDER = "Confirm this form meets your state and local licensing requirements before use — requirements vary by state.";
const LEGAL_REMINDER = "This is a customizable template, not legal advice. Consider having a professional review agreements before use.";
const SAFE_SLEEP_REMINDER = "Safe-sleep practices should follow current pediatric guidance. This template does not guarantee compliance with every state's licensing requirements.";

function section(id, title, description, fields) {
  return { id, title, description: description || "", fields };
}

function f(type, id, label, extra = {}) {
  return { id, type, label, ...extra };
}

// Shorthand helpers for commonly reused fields.
const short = (id, label, extra = {}) => f("short_text", id, label, extra);
const long = (id, label, extra = {}) => f("long_text", id, label, extra);
const email = (id, label = "Email", extra = {}) => f("email", id, label, extra);
const phone = (id, label = "Phone number", extra = {}) => f("phone", id, label, extra);
const dateField = (id, label = "Date", extra = {}) => f("date", id, label, extra);
const number = (id, label, extra = {}) => f("number", id, label, extra);
const single = (id, label, options, extra = {}) => f("single_select", id, label, { options, ...extra });
const multi = (id, label, options, extra = {}) => f("multi_select", id, label, { options, ...extra });
const checks = (id, label, options, extra = {}) => f("checkboxes", id, label, { options, ...extra });
const yesNo = (id, label, extra = {}) => f("yes_no", id, label, extra);
const heading = (id, label) => f("content_heading", id, label);
const paragraph = (id, label, helpText) => f("content_paragraph", id, label, { helpText });
const divider = (id) => f("content_divider", id, "Divider");
const acknowledgment = (id, label, extra = {}) => f("acknowledgment", id, label, { required: true, ...extra });
const sigParent = (id, label = "Parent / guardian signature (testing-only placeholder)", extra = {}) => f("signature_parent", id, label, { required: true, ...extra });
const sigProvider = (id, label = "Provider / staff signature (testing-only placeholder)", extra = {}) => f("signature_provider", id, label, { required: true, ...extra });
const initialsField = (id, label = "Staff initials", extra = {}) => f("initials", id, label, extra);
const childName = (id = "child_name", extra = {}) => f("smart_child_name", id, "Child's full name", { required: true, ...extra });
const childDob = (id = "child_dob", extra = {}) => f("smart_child_date_of_birth", id, "Child's date of birth", { required: true, ...extra });
const guardianName = (id = "guardian_name", label = "Parent / guardian name", extra = {}) => f("smart_parent_guardian_name", id, label, { required: true, ...extra });
const guardianPhone = (id = "guardian_phone", label = "Parent / guardian phone", extra = {}) => f("smart_parent_phone", id, label, { required: true, ...extra });
const emergencyName = (id = "emergency_contact_name", extra = {}) => f("smart_emergency_contact_name", id, "Emergency contact name", { required: true, ...extra });
const emergencyPhone = (id = "emergency_contact_phone", extra = {}) => f("smart_emergency_contact_phone", id, "Emergency contact phone", { required: true, ...extra });
const authorizedPickup = (id = "authorized_pickup", extra = {}) => f("smart_authorized_pickup", id, "Authorized pickup", extra);
const allergies = (id = "allergies", extra = {}) => f("smart_allergies", id, "Allergies", extra);
const medications = (id = "medications", extra = {}) => f("smart_medications", id, "Current medications", extra);
const physician = (id = "physician", extra = {}) => f("smart_physician", id, "Physician / clinic", extra);
const insurance = (id = "insurance", extra = {}) => f("smart_insurance", id, "Insurance information", extra);

const STARTER_TEMPLATES = [

  // ── A. ENROLLMENT AND CHILD INFORMATION ─────────────────────────────────

  {
    templateKey: "child-enrollment-form",
    title: "Child Enrollment Form",
    shortDescription: "Complete enrollment intake covering child, family, schedule, medical, and permission information.",
    purpose: "Collect the core information a program needs before a child's first day: identity, household, schedule, emergency contacts, medical needs, and required acknowledgments.",
    category: C.ENROLLMENT_CHILD_INFO,
    intendedUsers: ["family", "director"],
    ageGroups: ["all_ages"],
    tags: ["enrollment", "intake", "new family"],
    providerInstructions: "Send this form to new families before their child's start date. Review medical and authorized-pickup sections closely with the family before the first day of care.",
    familyInstructions: "Please complete every section as accurately as possible. Update your program if any of this information changes during the year.",
    reviewReminder: REVIEW,
    additionalReviewReminder: LICENSING_REMINDER,
    estimatedMinutes: 20,
    featured: true,
    sortWeight: 100,
    version: 1,
    changeSummary: "Initial published version.",
    sections: [
      section("child_information", "Child Information", "Basic identifying information for the child's file.", [
        childName(),
        short("preferred_name", "Preferred name / nickname"),
        childDob(),
        long("home_address", "Home address", { required: true }),
        dateField("start_date", "Requested start date", { required: true }),
      ]),
      section("schedule", "Schedule", "The days and hours the child will typically attend.", [
        checks("schedule_days", "Days of attendance", ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], { required: true }),
        short("schedule_hours", "Typical arrival and departure time", { required: true }),
        single("classroom_age_group", "Classroom or age group", ["Infant", "Toddler", "Preschool", "Pre-K", "School Age"], { required: true }),
      ]),
      section("parent_guardian", "Parent and Guardian Information", "", [
        guardianName("guardian_1_name", "Parent / guardian 1 name"),
        guardianPhone("guardian_1_phone", "Parent / guardian 1 phone"),
        email("guardian_1_email"),
        short("guardian_2_name", "Parent / guardian 2 name"),
        phone("guardian_2_phone", "Parent / guardian 2 phone"),
        long("custody_access_notes", "Custody or access notes", { helpText: "Only include information necessary for the safety of the child. Provide legal documentation separately if applicable." }),
      ]),
      section("emergency_pickup", "Emergency Contacts and Authorized Pickup", "", [
        emergencyName(),
        emergencyPhone(),
        short("emergency_contact_2_name", "Additional emergency contact name"),
        phone("emergency_contact_2_phone", "Additional emergency contact phone"),
        authorizedPickup("authorized_pickup_list", { helpText: "List every adult authorized to pick up this child besides the parents/guardians listed above." }),
      ]),
      section("medical_information", "Medical Information", "", [
        allergies(),
        long("dietary_needs", "Dietary needs or restrictions"),
        physician(),
        insurance(),
      ]),
      section("developmental_care", "Developmental Information and Comfort Preferences", "", [
        long("developmental_notes", "Developmental information staff should know"),
        long("comfort_preferences", "Comfort items, routines, or care preferences"),
      ]),
      section("permissions_acknowledgments", "Permissions and Acknowledgments", "", [
        paragraph("permissions_intro", "Program permissions", "By signing below, you acknowledge the information above is accurate and agree to notify the program of any changes."),
        acknowledgment("acknowledgment_accurate", "I confirm the information provided is accurate and complete to the best of my knowledge."),
        sigParent("parent_signature"),
        dateField("parent_signature_date", "Date signed", { required: true }),
        sigProvider("provider_signature"),
      ]),
    ],
  },

  {
    templateKey: "child-information-update-form",
    title: "Child Information Update Form",
    shortDescription: "Lets families update address, contacts, medical details, or schedule during the year.",
    purpose: "Give families a simple way to report changes to a child's file without resubmitting a full enrollment packet.",
    category: C.ENROLLMENT_CHILD_INFO,
    intendedUsers: ["family"],
    ageGroups: ["all_ages"],
    tags: ["update", "records"],
    providerInstructions: "Use this whenever a family reports a change. File the update alongside the original enrollment form; do not discard prior records.",
    familyInstructions: "Complete only the sections that have changed. Leave the rest blank.",
    reviewReminder: REVIEW,
    estimatedMinutes: 8,
    sortWeight: 90,
    version: 1,
    changeSummary: "Initial published version.",
    sections: [
      section("child_information", "Child Information", "", [
        childName(),
        childDob("child_dob_confirm", { required: false }),
      ]),
      section("what_changed", "Information Being Updated", "", [
        checks("update_type", "What is being updated?", ["Address", "Contact information", "Emergency contacts", "Medical information", "Allergies", "Authorized pickup", "Schedule", "Other"], { required: true }),
      ]),
      section("address_contact", "Address and Contact Information", "", [
        long("new_address", "New home address"),
        phone("new_phone", "Updated phone number"),
        email("new_email", "Updated email"),
      ]),
      section("emergency_medical", "Emergency Contacts and Medical Changes", "", [
        emergencyName("updated_emergency_name"),
        emergencyPhone("updated_emergency_phone"),
        long("medical_changes", "Medical changes"),
        long("allergy_changes", "Allergy changes"),
      ]),
      section("pickup_schedule", "Authorized Pickup and Schedule Changes", "", [
        long("pickup_changes", "Authorized-pickup changes"),
        long("schedule_changes", "Schedule changes"),
      ]),
      section("notes_signature", "Additional Notes", "", [
        long("additional_notes", "Additional notes"),
        sigParent("parent_signature"),
        dateField("signature_date"),
      ]),
    ],
  },

  {
    templateKey: "emergency-contact-form",
    title: "Emergency Contact Form",
    shortDescription: "Captures primary and secondary guardians plus two prioritized emergency contacts.",
    purpose: "Keep a fast-reference emergency contact sheet separate from the full enrollment packet, so staff can find the right person quickly in an emergency.",
    category: C.ENROLLMENT_CHILD_INFO,
    intendedUsers: ["family", "staff"],
    ageGroups: ["all_ages"],
    tags: ["emergency", "contacts"],
    providerInstructions: "Post or file this where staff can find it quickly. Confirm phone numbers are current at the start of every enrollment year.",
    familyInstructions: "List contacts in the order they should be called if we cannot reach you.",
    reviewReminder: REVIEW,
    estimatedMinutes: 8,
    featured: true,
    sortWeight: 95,
    version: 1,
    changeSummary: "Initial published version.",
    sections: [
      section("child_information", "Child Information", "", [childName(), childDob()]),
      section("primary_guardian", "Primary Guardian", "", [guardianName("primary_guardian_name"), guardianPhone("primary_guardian_phone"), email("primary_guardian_email")]),
      section("secondary_guardian", "Secondary Guardian", "", [short("secondary_guardian_name", "Secondary guardian name"), phone("secondary_guardian_phone", "Secondary guardian phone")]),
      section("emergency_contact_1", "Emergency Contact 1", "", [
        emergencyName("emergency_contact_1_name"),
        emergencyPhone("emergency_contact_1_phone"),
        short("emergency_contact_1_relationship", "Relationship to child", { required: true }),
        single("emergency_contact_1_priority", "Contact priority", ["Call first", "Call second", "Call third"], { required: true }),
        yesNo("emergency_contact_1_pickup", "Permission to pick up this child?", { required: true }),
      ]),
      section("emergency_contact_2", "Emergency Contact 2", "", [
        short("emergency_contact_2_name", "Emergency contact name"),
        phone("emergency_contact_2_phone", "Emergency contact phone"),
        short("emergency_contact_2_relationship", "Relationship to child"),
        single("emergency_contact_2_priority", "Contact priority", ["Call first", "Call second", "Call third"]),
        yesNo("emergency_contact_2_pickup", "Permission to pick up this child?"),
      ]),
      section("acknowledgment", "Parent Acknowledgment", "", [
        acknowledgment("ack_current", "I confirm these emergency contacts and phone numbers are current."),
        sigParent("parent_signature"),
        dateField("signature_date"),
      ]),
    ],
  },

  {
    templateKey: "authorized-pickup-form",
    title: "Authorized Pickup Form",
    shortDescription: "Adds or updates a person authorized to pick up a child, with optional date range and restrictions.",
    purpose: "Document exactly who may pick up a child, for how long, and any restrictions staff should know before releasing the child.",
    category: C.ENROLLMENT_CHILD_INFO,
    intendedUsers: ["family", "staff"],
    ageGroups: ["all_ages"],
    tags: ["pickup", "authorization", "safety"],
    providerInstructions: "Check photo identification for anyone not already known to staff, per your program's pickup policy.",
    familyInstructions: "Use this form any time you want to add, change, or remove someone authorized to pick up your child.",
    reviewReminder: REVIEW,
    estimatedMinutes: 6,
    sortWeight: 70,
    version: 1,
    changeSummary: "Initial published version.",
    sections: [
      section("child_information", "Child Information", "", [childName()]),
      section("authorized_person", "Authorized Person", "", [
        short("authorized_person_name", "Authorized person's name", { required: true }),
        short("authorized_person_relationship", "Relationship to child", { required: true }),
        phone("authorized_person_phone", "Phone number", { required: true }),
        long("authorized_person_address", "Address"),
        paragraph("id_expectation", "Identification", "Staff will ask to see a valid photo ID before releasing a child to anyone not already familiar to the classroom team."),
      ]),
      section("authorization_window", "Authorization Period", "", [
        dateField("authorization_start", "Authorization start date", { required: true }),
        dateField("authorization_end", "Authorization end date", { helpText: "Leave blank if this authorization does not expire." }),
        long("restrictions", "Restrictions", { helpText: "Example: weekdays only, or only with advance notice from a parent." }),
      ]),
      section("acknowledgment", "Parent Acknowledgment", "", [
        acknowledgment("ack_pickup", "I authorize this person to pick up my child under the conditions listed above."),
        sigParent("parent_signature"),
        dateField("signature_date"),
      ]),
    ],
  },

  // ── B. HEALTH AND MEDICAL ───────────────────────────────────────────────

  {
    templateKey: "medical-allergy-information-form",
    title: "Medical and Allergy Information Form",
    shortDescription: "Full medical profile covering physician, allergies, symptoms, dietary restrictions, and emergency treatment authorization.",
    purpose: "Give staff a single, current reference for a child's medical needs, allergies, and emergency treatment wishes.",
    category: C.HEALTH_MEDICAL,
    intendedUsers: ["family", "staff"],
    ageGroups: ["all_ages"],
    tags: ["medical", "allergy", "health"],
    providerInstructions: "Review this with the family at enrollment and at least once per program year. Store securely with other confidential health records.",
    familyInstructions: "Please be as specific as possible about symptoms and emergency steps so staff can respond quickly and correctly.",
    reviewReminder: REVIEW,
    additionalReviewReminder: MEDICAL_REMINDER,
    estimatedMinutes: 15,
    featured: true,
    sortWeight: 92,
    version: 1,
    changeSummary: "Initial published version.",
    sections: [
      section("child_information", "Child Information", "", [childName(), childDob()]),
      section("providers", "Physician, Dentist, and Hospital", "", [
        physician(),
        short("dentist", "Dentist"),
        short("preferred_hospital", "Preferred hospital"),
        insurance(),
      ]),
      section("conditions_allergies", "Medical Conditions and Allergies", "", [
        long("medical_conditions", "Medical conditions"),
        allergies(),
        long("allergy_symptoms", "Allergy symptoms to watch for"),
        long("emergency_action_steps", "Emergency action steps for a reaction", { helpText: "Example: administer prescribed medication, call 911, then call parent." }),
      ]),
      section("diet_medication_activity", "Dietary Restrictions, Medications, and Activity Limits", "", [
        long("dietary_restrictions", "Dietary restrictions"),
        medications(),
        long("activity_limitations", "Activity limitations"),
      ]),
      section("acknowledgment", "Emergency Treatment Authorization and Acknowledgment", "", [
        paragraph("treatment_intro", "Emergency treatment authorization", "In a medical emergency when a parent cannot be reached immediately, staff may seek emergency medical treatment for this child."),
        acknowledgment("ack_emergency_treatment", "I authorize emergency medical treatment for my child if I cannot be reached."),
        sigParent("parent_signature"),
        dateField("signature_date"),
      ]),
    ],
  },

  {
    templateKey: "medication-authorization-form",
    title: "Medication Authorization Form",
    shortDescription: "Parent authorization and instructions for administering a specific medication at the program.",
    purpose: "Document exact dosage, timing, and storage instructions before staff administer any medication, and record provider acceptance.",
    category: C.HEALTH_MEDICAL,
    intendedUsers: ["family", "staff"],
    ageGroups: ["all_ages"],
    tags: ["medication", "health"],
    providerInstructions: "Providers must follow their own licensing requirements and written medication policy. Confirm your program is licensed to administer this type of medication before accepting it.",
    familyInstructions: "Complete a new form for every medication and every time the dosage or schedule changes. Bring the medication in its original, labeled container.",
    reviewReminder: REVIEW,
    additionalReviewReminder: `${MEDICAL_REMINDER} ${LICENSING_REMINDER}`,
    estimatedMinutes: 10,
    sortWeight: 80,
    version: 1,
    changeSummary: "Initial published version.",
    sections: [
      section("child_information", "Child Information", "", [childName()]),
      section("medication_details", "Medication Details", "", [
        short("medication_name", "Medication name", { required: true }),
        long("medication_reason", "Reason for medication", { required: true }),
        single("medication_kind", "Prescription or nonprescription", ["Prescription", "Nonprescription (over-the-counter)"], { required: true }),
        short("dosage", "Dosage", { required: true }),
        single("administration_method", "Administration method", ["Oral", "Topical", "Inhaled", "Injection", "Other"], { required: true }),
        short("administration_times", "Times to be given", { required: true }),
        dateField("start_date", "Start date", { required: true }),
        dateField("end_date", "End date"),
        long("storage_instructions", "Storage instructions"),
        long("side_effects", "Possible side effects to watch for"),
        short("prescribing_physician", "Prescribing physician"),
      ]),
      section("instructions_acknowledgment", "Parent Instructions and Acceptance", "", [
        long("parent_instructions", "Additional instructions from parent"),
        paragraph("licensing_note", "Provider note", LICENSING_REMINDER),
        sigParent("parent_signature", "Parent signature (testing-only placeholder)"),
        dateField("parent_signature_date", "Date signed"),
        sigProvider("provider_acceptance", "Provider acceptance signature (testing-only placeholder)"),
      ]),
    ],
  },

  {
    templateKey: "medication-administration-log",
    title: "Medication Administration Log",
    shortDescription: "Structure for logging each dose given, staff initials, and child response — ready for repeatable entries in a later phase.",
    purpose: "Prepare the field structure needed to track medication administration over time. This phase does not build the repeatable log entries themselves.",
    category: C.HEALTH_MEDICAL,
    intendedUsers: ["staff"],
    ageGroups: ["all_ages"],
    tags: ["medication", "log", "phase 6 preparation"],
    providerInstructions: "This template documents the fields a future dose-by-dose log will use. Phase 5 does not collect repeatable entries yet — use your program's existing paper or system log until that capability is available.",
    familyInstructions: "",
    reviewReminder: REVIEW,
    additionalReviewReminder: MEDICAL_REMINDER,
    estimatedMinutes: 5,
    sortWeight: 40,
    version: 1,
    changeSummary: "Initial published version.",
    sections: [
      section("reference", "Child and Medication Reference", "", [
        childName(),
        short("medication_name", "Medication", { required: true }),
        short("authorized_dosage", "Authorized dosage", { required: true }),
      ]),
      section("entry_structure", "Log Entry Fields (structure only)", "Prepared for repeatable per-dose entries in a future phase.", [
        paragraph("entry_note", "About this section", "Each future log entry will capture: scheduled time, actual administration time, staff initials, child response, and whether a dose was missed or refused."),
        short("scheduled_time", "Scheduled time"),
        short("actual_time", "Actual administration time"),
        initialsField("staff_initials_entry"),
        long("child_response", "Child response"),
        yesNo("missed_or_refused", "Missed or refused dose?"),
        long("missed_reason", "Reason, if missed or refused"),
        long("follow_up_notes", "Follow-up notes"),
      ]),
    ],
  },

  {
    templateKey: "emergency-medical-treatment-authorization",
    title: "Emergency Medical Treatment Authorization",
    shortDescription: "Authorizes emergency medical care and documents contact attempts when a parent cannot be reached.",
    purpose: "Give staff clear, signed authorization to seek emergency care and a record of who was contacted and when.",
    category: C.HEALTH_MEDICAL,
    intendedUsers: ["family", "staff"],
    ageGroups: ["all_ages"],
    tags: ["emergency", "medical", "authorization"],
    providerInstructions: "Keep a copy accessible for field trips and off-site activities. Confirm insurance information is current every program year.",
    familyInstructions: "This authorization is only used when your child needs urgent care and you cannot be reached right away.",
    reviewReminder: REVIEW,
    additionalReviewReminder: MEDICAL_REMINDER,
    estimatedMinutes: 10,
    sortWeight: 65,
    version: 1,
    changeSummary: "Initial published version.",
    sections: [
      section("child_guardians", "Child and Guardians", "", [childName(), guardianName(), guardianPhone()]),
      section("medical_reference", "Physician, Insurance, and Conditions", "", [
        physician(),
        insurance(),
        long("medical_conditions", "Medical conditions"),
        allergies(),
        short("preferred_hospital", "Preferred hospital"),
      ]),
      section("authorization", "Emergency Authorization and Contact Attempts", "", [
        paragraph("authorization_text", "Authorization", "If my child needs emergency medical care and I cannot be reached immediately, I authorize program staff to seek treatment and share this medical information with emergency responders."),
        long("contact_attempts", "Record of contact attempts", { helpText: "Staff: log the time and method of each attempt to reach a parent or guardian." }),
        acknowledgment("ack_authorization", "I authorize emergency medical treatment as described above."),
        sigParent("parent_signature"),
        dateField("signature_date"),
      ]),
    ],
  },

  // ── C. PERMISSIONS AND RELEASES ─────────────────────────────────────────

  {
    templateKey: "photo-media-permission-form",
    title: "Photo and Media Permission Form",
    shortDescription: "Separate, specific permission choices for private communication, classroom display, newsletters, website, and social media.",
    purpose: "Avoid one broad yes/no photo question by letting families choose exactly where their child's photo and name may appear.",
    category: C.PERMISSIONS_RELEASES,
    intendedUsers: ["family"],
    ageGroups: ["all_ages"],
    tags: ["photo", "media", "permission"],
    providerInstructions: "Respect each individual choice separately — a family who declines social media may still allow private family communication photos.",
    familyInstructions: "Choose Yes or No for each use separately. You may change these choices in writing at any time.",
    reviewReminder: REVIEW,
    estimatedMinutes: 8,
    featured: true,
    sortWeight: 88,
    version: 1,
    changeSummary: "Initial published version.",
    sections: [
      section("child_information", "Child Information", "", [childName()]),
      section("permission_choices", "Permission Choices", "Please choose Yes or No for each use.", [
        yesNo("permission_private_communication", "Private family communication (daily reports, direct messages)", { required: true }),
        yesNo("permission_classroom_display", "Classroom displays and documentation panels", { required: true }),
        yesNo("permission_newsletter", "Program newsletter", { required: true }),
        yesNo("permission_website", "Program website", { required: true }),
        yesNo("permission_social_media", "Social media", { required: true }),
        yesNo("permission_promotional", "Promotional materials (brochures, flyers)", { required: true }),
        yesNo("permission_group_photos", "Group photographs that may include other children", { required: true }),
        yesNo("permission_name_usage", "Use of my child's first name alongside a photo", { required: true }),
        yesNo("permission_no_photos", "I do not give permission for any photos of my child", { required: true }),
      ]),
      section("restrictions_dates", "Restrictions and Revocation", "", [
        long("restrictions", "Restrictions or additional instructions"),
        dateField("start_date", "Permission start date"),
        dateField("end_date", "Permission end date"),
        paragraph("revocation_note", "Revoking permission", "You may revoke or change any of these permissions in writing at any time; the change will apply going forward."),
      ]),
      section("acknowledgment", "Parent Signature", "", [sigParent("parent_signature"), dateField("signature_date")]),
    ],
  },

  {
    templateKey: "sunscreen-insect-repellent-permission",
    title: "Sunscreen and Insect Repellent Permission",
    shortDescription: "Permission and instructions for applying sunscreen or insect repellent supplied by family or program.",
    purpose: "Document who supplies the product, any sensitivities, and separate permission for sunscreen versus insect repellent.",
    category: C.PERMISSIONS_RELEASES,
    intendedUsers: ["family"],
    ageGroups: ["all_ages"],
    tags: ["sunscreen", "insect repellent", "permission"],
    providerInstructions: "Confirm the product label and any known sensitivities before first application. Reapply according to the label and your program's outdoor-play schedule.",
    familyInstructions: "Let us know if you would like to supply your own product, and note any known sensitivities.",
    reviewReminder: REVIEW,
    estimatedMinutes: 6,
    sortWeight: 55,
    version: 1,
    changeSummary: "Initial published version.",
    sections: [
      section("child_information", "Child Information", "", [childName()]),
      section("product", "Product Details", "", [
        single("product_supplied_by", "Product supplied by", ["Family", "Program"], { required: true }),
        short("product_name", "Product name"),
        long("known_sensitivities", "Known sensitivities or reactions"),
        long("application_areas", "Areas of application"),
        short("application_frequency", "Application frequency"),
        long("special_instructions", "Special instructions"),
      ]),
      section("permission", "Permission", "", [
        yesNo("sunscreen_permission", "Permission to apply sunscreen", { required: true }),
        yesNo("insect_repellent_permission", "Permission to apply insect repellent", { required: true }),
      ]),
      section("acknowledgment", "Parent Signature", "", [sigParent("parent_signature"), dateField("signature_date")]),
    ],
  },

  {
    templateKey: "field-trip-permission-form",
    title: "Field Trip Permission Form",
    shortDescription: "Trip details, transportation, cost, and permission for a specific off-site classroom experience.",
    purpose: "Give families everything they need to know about a specific trip and record clear permission before departure.",
    category: C.PERMISSIONS_RELEASES,
    intendedUsers: ["family", "director"],
    ageGroups: ["preschool", "school_age"],
    tags: ["field trip", "permission"],
    providerInstructions: "Send home at least one week before the trip. Confirm every attending child's emergency information is current before departure.",
    familyInstructions: "Please review the trip details and return this form before the date listed.",
    reviewReminder: REVIEW,
    estimatedMinutes: 8,
    sortWeight: 60,
    version: 1,
    changeSummary: "Initial published version.",
    sections: [
      section("child_information", "Child Information", "", [childName()]),
      section("trip_details", "Trip Details", "", [
        short("destination", "Destination", { required: true }),
        dateField("trip_date", "Date", { required: true }),
        short("departure_time", "Departure time", { required: true }),
        short("return_time", "Return time", { required: true }),
        single("transportation_method", "Transportation method", ["Program vehicle", "Public transportation", "Walking", "Parent drop-off at destination", "Other"], { required: true }),
        long("supervision_plan", "Supervision plan", { helpText: "Example: staff-to-child ratio during the trip." }),
        short("cost", "Cost, if any"),
        long("items_needed", "Items needed"),
        long("meals", "Meals or snacks provided or needed"),
      ]),
      section("reminders", "Confirmations and Reminders", "", [
        acknowledgment("confirm_emergency_info", "I confirm my child's emergency contact information is current."),
        paragraph("medical_reminder", "Medical or allergy reminder", "Please notify staff of any medical needs your child may have specific to this activity."),
      ]),
      section("permission", "Permission", "", [
        yesNo("permission_choice", "My child may attend this field trip", { required: true }),
        sigParent("parent_signature"),
        dateField("signature_date"),
      ]),
    ],
  },

  {
    templateKey: "transportation-permission-form",
    title: "Transportation Permission Form",
    shortDescription: "Regular or one-time transportation permission with approved drivers, pickup/drop-off points, and restraint information.",
    purpose: "Document who may transport a child, where, and under what safety conditions, separate from a single field trip.",
    category: C.PERMISSIONS_RELEASES,
    intendedUsers: ["family", "director"],
    ageGroups: ["all_ages"],
    tags: ["transportation", "permission"],
    providerInstructions: "Confirm approved drivers and car-seat requirements meet your state's child passenger safety requirements.",
    familyInstructions: "Complete this form if your child will regularly or occasionally be transported by the program.",
    reviewReminder: REVIEW,
    additionalReviewReminder: LICENSING_REMINDER,
    estimatedMinutes: 8,
    sortWeight: 50,
    version: 1,
    changeSummary: "Initial published version.",
    sections: [
      section("child_information", "Child Information", "", [childName()]),
      section("transportation_details", "Transportation Details", "", [
        single("transportation_type", "Transportation type", ["Program vehicle", "Approved driver's personal vehicle", "Public transportation", "Walking"], { required: true }),
        long("authorized_destinations", "Authorized destinations"),
        single("frequency", "Regular or one-time transportation", ["Regular", "One-time"], { required: true }),
        short("pickup_location", "Pickup location"),
        short("dropoff_location", "Drop-off location"),
        long("approved_drivers", "Approved drivers"),
        long("car_seat_info", "Car seat or restraint information", { helpText: "Note the required seat type and who provides it." }),
      ]),
      section("emergency_restrictions", "Emergency Contacts and Restrictions", "", [
        emergencyName("transport_emergency_name"),
        emergencyPhone("transport_emergency_phone"),
        long("restrictions", "Restrictions"),
      ]),
      section("permission", "Parent Permission", "", [
        yesNo("permission_choice", "I give permission for this transportation", { required: true }),
        sigParent("parent_signature"),
        dateField("signature_date"),
      ]),
    ],
  },

  {
    templateKey: "water-activity-permission-form",
    title: "Water Activity Permission Form",
    shortDescription: "Permission for a specific water activity, including swimming ability and flotation-device needs.",
    purpose: "Confirm permission and safety details before any water play, wading, or swimming activity.",
    category: C.PERMISSIONS_RELEASES,
    intendedUsers: ["family", "director"],
    ageGroups: ["toddler", "preschool", "school_age"],
    tags: ["water activity", "swimming", "permission"],
    providerInstructions: "Confirm lifeguard or staff supervision ratios required for the specific water depth and activity type before the activity begins.",
    familyInstructions: "Let us know your child's swimming ability so staff can plan appropriate supervision and flotation support.",
    reviewReminder: REVIEW,
    additionalReviewReminder: LICENSING_REMINDER,
    estimatedMinutes: 6,
    sortWeight: 45,
    version: 1,
    changeSummary: "Initial published version.",
    sections: [
      section("child_information", "Child Information", "", [childName()]),
      section("activity_details", "Activity Details", "", [
        long("activity_description", "Activity description", { required: true }),
        short("activity_dates", "Date or recurring period", { required: true }),
        single("water_depth_type", "Water depth or activity type", ["Wading pool / sprinkler", "Shallow pool", "Swimming pool", "Open water"], { required: true }),
        single("swimming_ability", "Swimming ability", ["Non-swimmer", "Beginner", "Comfortable swimmer", "Strong swimmer"], { required: true }),
        long("flotation_device_info", "Flotation-device information"),
        long("medical_concerns", "Medical concerns related to water activity"),
      ]),
      section("permission", "Permission", "", [
        yesNo("permission_choice", "My child may participate in this water activity", { required: true }),
        sigParent("parent_signature"),
        dateField("signature_date"),
      ]),
    ],
  },

  // ── D. INFANT AND TODDLER CARE ──────────────────────────────────────────

  {
    templateKey: "infant-care-plan",
    title: "Infant Care Plan",
    shortDescription: "Feeding, sleep, diapering, and comfort plan written with the family for an individual infant.",
    purpose: "Keep every caregiver aligned on an infant's individual routine, from feeding to sleep to comfort preferences.",
    category: C.INFANT_TODDLER_CARE,
    intendedUsers: ["family", "staff"],
    ageGroups: ["infant"],
    tags: ["infant", "care plan"],
    providerInstructions: "Review and update this plan with the family regularly, especially as feeding and sleep routines change quickly in the first year.",
    familyInstructions: "Share as much detail as helpful — the more specific, the easier it is for staff to keep your baby's routine consistent.",
    reviewReminder: REVIEW,
    estimatedMinutes: 12,
    sortWeight: 75,
    version: 1,
    changeSummary: "Initial published version.",
    sections: [
      section("child_information", "Child Information", "", [childName(), childDob()]),
      section("feeding", "Feeding Schedule", "", [
        long("feeding_schedule", "Typical feeding schedule", { required: true }),
        single("milk_type", "Breast milk or formula", ["Breast milk", "Formula", "Both", "Not applicable"]),
        long("bottle_preparation", "Bottle preparation instructions"),
        long("food_introduction", "Foods introduced so far / foods to avoid"),
        allergies("infant_allergies"),
      ]),
      section("sleep", "Nap Schedule and Safe Sleep", "", [
        long("nap_schedule", "Typical nap schedule"),
        paragraph("safe_sleep_note", "Safe sleep", "Infants are placed on their backs in an approved crib or sleep space, free of blankets, pillows, and soft toys, following current safe-sleep guidance."),
        long("comfort_preferences", "Comfort preferences at sleep time"),
      ]),
      section("diapering_development", "Diapering and Developmental Needs", "", [
        long("diapering_notes", "Diapering notes"),
        long("developmental_needs", "Developmental needs staff should know"),
      ]),
      section("review", "Parent Instructions and Review", "", [
        long("parent_instructions", "Additional parent instructions"),
        dateField("review_date", "Plan review date"),
        sigParent("parent_signature"),
        sigProvider("provider_signature"),
      ]),
    ],
  },

  {
    templateKey: "safe-sleep-agreement",
    title: "Safe Sleep Agreement",
    shortDescription: "Documents agreed safe-sleep practices and any medical exception on file.",
    purpose: "Confirm shared understanding of safe-sleep practices between family and program, and document any medically necessary exception.",
    category: C.INFANT_TODDLER_CARE,
    intendedUsers: ["family", "staff"],
    ageGroups: ["infant"],
    tags: ["safe sleep", "infant"],
    providerInstructions: "Any exception to standard safe-sleep positioning requires written medical documentation on file, per most state licensing rules.",
    familyInstructions: "Ask your program any questions about safe-sleep practices before signing.",
    reviewReminder: REVIEW,
    additionalReviewReminder: SAFE_SLEEP_REMINDER,
    estimatedMinutes: 8,
    sortWeight: 58,
    version: 1,
    changeSummary: "Initial published version.",
    sections: [
      section("child_information", "Child Information", "", [childName()]),
      section("practices", "Safe Sleep Practices", "", [
        paragraph("practices_intro", "Our safe-sleep practices", "Infants are placed on their backs on a firm, approved sleep surface in an area free of soft bedding, bumpers, pillows, blankets, and toys."),
        single("sleep_position", "Sleep position", ["Back (standard)", "Other — medical exception required"], { required: true }),
        short("approved_sleep_space", "Approved sleep space", { required: true }),
        short("sleep_clothing", "Sleep clothing (e.g., sleep sack)"),
      ]),
      section("prohibited_exception", "Prohibited Items and Medical Exceptions", "", [
        acknowledgment("ack_prohibited_items", "I understand blankets, pillows, bumpers, and soft toys are not placed in the sleep space."),
        long("medical_exception", "Medical exception documentation, if applicable", { helpText: "Attach a note from a physician if your child needs an alternate sleep position for medical reasons." }),
      ]),
      section("questions_acknowledgment", "Parent Questions and Acknowledgment", "", [
        long("parent_questions", "Parent questions or notes"),
        acknowledgment("ack_agreement", "I have discussed this program's safe-sleep practices with staff and agree to follow this plan."),
        sigParent("parent_signature"),
        sigProvider("provider_signature"),
      ]),
    ],
  },

  {
    templateKey: "toilet-learning-plan",
    title: "Toilet Learning Plan",
    shortDescription: "Coordinated toileting plan covering readiness signs, home routine, and family-program consistency.",
    purpose: "Keep home and program approaches consistent during toilet learning, reducing confusion and setbacks for the child.",
    category: C.INFANT_TODDLER_CARE,
    intendedUsers: ["family", "staff"],
    ageGroups: ["toddler", "preschool"],
    tags: ["toilet learning", "toddler"],
    providerInstructions: "Update this plan as the child progresses. Consistency between home and program routines supports faster, less stressful progress.",
    familyInstructions: "Share the words and routine your family uses so staff can match your approach as closely as possible.",
    reviewReminder: REVIEW,
    estimatedMinutes: 8,
    sortWeight: 48,
    version: 1,
    changeSummary: "Initial published version.",
    sections: [
      section("child_information", "Child Information", "", [childName()]),
      section("readiness_routine", "Signs of Readiness and Typical Schedule", "", [
        long("readiness_signs", "Signs of readiness observed at home"),
        short("words_used", "Words used at home"),
        long("typical_schedule", "Typical bathroom schedule"),
        long("assistance_needed", "Assistance needed"),
      ]),
      section("clothing_encouragement", "Clothing and Encouragement", "", [
        short("clothing_recommendations", "Clothing recommendations"),
        long("rewards_encouragement", "Rewards or encouragement used at home"),
        long("accidents_approach", "How accidents are handled at home"),
      ]),
      section("family_preferences", "Family Preferences and Consistency Plan", "", [
        long("family_preferences", "Family preferences"),
        long("consistency_plan", "Family-program consistency plan"),
        dateField("review_date", "Plan review date"),
      ]),
      section("acknowledgment", "Acknowledgment", "", [acknowledgment("ack_plan", "Family and staff agree to follow this plan and revisit it as needed."), sigParent("parent_signature"), sigProvider("provider_signature")]),
    ],
  },

  // ── E. AGREEMENTS AND POLICIES ──────────────────────────────────────────

  {
    templateKey: "parent-handbook-acknowledgment",
    title: "Parent Handbook Acknowledgment",
    shortDescription: "Confirms a family received the current parent handbook and discussed any questions.",
    purpose: "Create a clear, dated record that a family received and understood the program's policies.",
    category: C.AGREEMENTS_POLICIES,
    intendedUsers: ["family", "director"],
    ageGroups: ["all_ages"],
    tags: ["handbook", "policy", "acknowledgment"],
    providerInstructions: "Update the handbook version/date field whenever the handbook changes, and collect a new acknowledgment.",
    familyInstructions: "Please read the handbook fully and ask any questions before signing.",
    reviewReminder: REVIEW,
    estimatedMinutes: 6,
    sortWeight: 62,
    version: 1,
    changeSummary: "Initial published version.",
    sections: [
      section("family_information", "Family Information", "", [guardianName(), childName("acknowledging_child_name", { required: false, label: "Child's name" })]),
      section("handbook_details", "Handbook Details", "", [
        short("handbook_version", "Handbook version / date", { required: true }),
        multi("policies_received", "Policies received", ["Enrollment policy", "Health and safety policy", "Discipline / behavior policy", "Payment and billing policy", "Emergency and closure policy", "Communication policy"]),
      ]),
      section("questions", "Questions Discussed", "", [long("questions_discussed", "Questions discussed")]),
      section("agreement", "Agreement", "", [
        acknowledgment("ack_received_read", "I have received and read the current parent handbook."),
        acknowledgment("ack_agree_policies", "I agree to follow the policies described in the handbook."),
        yesNo("electronic_communication_ack", "I agree to receive program communications electronically", { required: true }),
        sigParent("parent_signature"),
        sigProvider("provider_signature"),
        dateField("signature_date"),
      ]),
    ],
  },

  {
    templateKey: "tuition-payment-agreement",
    title: "Tuition and Payment Agreement",
    shortDescription: "Documents tuition amount, schedule, fees, and termination terms as a customizable starting point.",
    purpose: "Give programs a clear starting point for tuition terms to customize with their own rates and policies.",
    category: C.AGREEMENTS_POLICIES,
    intendedUsers: ["family", "director"],
    ageGroups: ["all_ages"],
    tags: ["tuition", "billing", "agreement"],
    providerInstructions: "This is a customizable template, not legal advice — replace the placeholder amounts and terms with your program's actual policies before use. This template does not connect to Stripe or collect payments.",
    familyInstructions: "Please review the tuition amount, due dates, and fee policy carefully before signing.",
    reviewReminder: REVIEW,
    additionalReviewReminder: LEGAL_REMINDER,
    estimatedMinutes: 10,
    sortWeight: 52,
    version: 1,
    changeSummary: "Initial published version.",
    sections: [
      section("child_family", "Child and Family", "", [childName(), guardianName()]),
      section("tuition_terms", "Tuition Terms", "", [
        short("tuition_amount", "Tuition amount", { required: true }),
        single("payment_schedule", "Payment schedule", ["Weekly", "Biweekly", "Monthly"], { required: true }),
        short("due_date", "Due date"),
        multi("accepted_methods", "Accepted payment methods", ["Cash", "Check", "Bank transfer", "Card", "Online portal"]),
        short("late_fee", "Late fee"),
        short("returned_payment_fee", "Returned-payment fee"),
      ]),
      section("policies", "Absence, Vacation, and Fee Policies", "", [
        long("absence_closure_policy", "Absence and closure policy"),
        long("vacation_policy", "Vacation policy"),
        short("registration_fee", "Registration or supply fees"),
        long("termination_terms", "Termination terms"),
      ]),
      section("acknowledgment", "Family Acknowledgment", "", [
        paragraph("legal_note", "Please note", "This is a customizable template, not legal advice."),
        acknowledgment("ack_terms", "I have read and agree to these tuition and payment terms."),
        sigParent("parent_signature"),
        sigProvider("provider_signature"),
        dateField("signature_date"),
      ]),
    ],
  },

  {
    templateKey: "attendance-schedule-agreement",
    title: "Attendance and Schedule Agreement",
    shortDescription: "Confirms contracted days, arrival/departure times, and late-pickup and absence policies.",
    purpose: "Set clear, mutual expectations about attendance so scheduling and staffing stay predictable for both sides.",
    category: C.AGREEMENTS_POLICIES,
    intendedUsers: ["family", "director"],
    ageGroups: ["all_ages"],
    tags: ["attendance", "schedule", "agreement"],
    providerInstructions: "Update this agreement whenever a family's contracted schedule changes.",
    familyInstructions: "Please review arrival/departure times and late-pickup policy carefully.",
    reviewReminder: REVIEW,
    estimatedMinutes: 6,
    sortWeight: 44,
    version: 1,
    changeSummary: "Initial published version.",
    sections: [
      section("child_information", "Child", "", [childName()]),
      section("schedule", "Contracted Schedule", "", [
        checks("contracted_days", "Contracted days", ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], { required: true }),
        short("arrival_time", "Arrival time", { required: true }),
        short("departure_time", "Departure time", { required: true }),
        long("late_pickup_policy", "Late pickup policy"),
        long("absence_notification", "Absence notification expectations"),
        long("schedule_change_policy", "Schedule-change policy"),
      ]),
      section("acknowledgment", "Agreement", "", [
        acknowledgment("ack_holiday_closures", "I acknowledge the program's holiday and closure calendar."),
        acknowledgment("ack_schedule_agreement", "I agree to this attendance and schedule agreement."),
        sigParent("parent_signature"),
        dateField("signature_date"),
      ]),
    ],
  },

  {
    templateKey: "policy-change-acknowledgment",
    title: "Policy Change Acknowledgment",
    shortDescription: "Short, reusable form to document that a family received and understood a specific policy update.",
    purpose: "Give programs a fast way to document any single policy change without rewriting the whole handbook.",
    category: C.AGREEMENTS_POLICIES,
    intendedUsers: ["family", "director"],
    ageGroups: ["all_ages"],
    tags: ["policy", "acknowledgment"],
    providerInstructions: "Use this any time a single policy changes mid-year, separate from a full handbook acknowledgment.",
    familyInstructions: "Please read the policy summary and ask questions before signing.",
    reviewReminder: REVIEW,
    estimatedMinutes: 4,
    sortWeight: 30,
    version: 1,
    changeSummary: "Initial published version.",
    sections: [
      section("policy_details", "Policy Details", "", [
        short("policy_title", "Policy title", { required: true }),
        dateField("effective_date", "Effective date", { required: true }),
        long("summary_of_change", "Summary of change", { required: true }),
        long("full_policy_reference", "Full policy text or reference"),
      ]),
      section("questions_acknowledgment", "Questions and Acknowledgment", "", [
        long("family_questions", "Family questions"),
        acknowledgment("ack_policy_change", "I have received and understand this policy change."),
        sigParent("parent_signature"),
        dateField("signature_date"),
      ]),
    ],
  },

  // ── F. INCIDENTS, BEHAVIOR, AND DEVELOPMENT ────────────────────────────

  {
    templateKey: "incident-injury-report",
    title: "Incident or Injury Report",
    shortDescription: "Documents what happened, first aid given, notifications made, and follow-up steps.",
    purpose: "Create a clear, complete record of any incident or injury for staff, families, and program records.",
    category: C.INCIDENTS_BEHAVIOR_DEVELOPMENT,
    intendedUsers: ["staff", "director"],
    ageGroups: ["all_ages"],
    tags: ["incident", "injury", "safety"],
    providerInstructions: "Complete as soon as possible after the incident, while details are fresh. A body-map field is planned for a future enhancement and is not included yet — describe the affected area in the text field below instead.",
    familyInstructions: "",
    reviewReminder: REVIEW,
    additionalReviewReminder: LICENSING_REMINDER,
    estimatedMinutes: 8,
    featured: true,
    sortWeight: 85,
    version: 1,
    changeSummary: "Initial published version.",
    sections: [
      section("basics", "Child, Date, and Location", "", [
        childName(),
        dateField("incident_date", "Date"),
        short("incident_time", "Time"),
        short("location", "Location", { required: true }),
        long("staff_present", "Staff present", { required: true }),
      ]),
      section("what_happened", "What Happened", "", [
        long("what_happened", "What happened", { required: true }),
        long("injury_affected_area", "Injury or affected area", { helpText: "Describe the area affected. A visual body-map field is planned for a future enhancement." }),
        long("first_aid_provided", "First aid provided"),
      ]),
      section("notifications_followup", "Notifications and Follow-Up", "", [
        long("people_notified", "People notified"),
        short("time_parent_contacted", "Time parent contacted"),
        yesNo("medical_followup_recommended", "Medical follow-up recommended?"),
        long("prevention_steps", "Corrective or prevention steps"),
      ]),
      section("acknowledgment", "Signatures", "", [sigProvider("staff_signature", "Staff signature (testing-only placeholder)"), sigParent("parent_ack", "Parent acknowledgment (testing-only placeholder)")]),
    ],
  },

  {
    templateKey: "illness-report",
    title: "Illness Report",
    shortDescription: "Documents symptoms, temperature, care provided, and return-to-care requirements.",
    purpose: "Give staff and families a shared, dated record of an illness at care and the plan for returning.",
    category: C.INCIDENTS_BEHAVIOR_DEVELOPMENT,
    intendedUsers: ["staff", "family"],
    ageGroups: ["all_ages"],
    tags: ["illness", "health"],
    providerInstructions: "Follow your program's exclusion and return-to-care policy for the symptoms observed.",
    familyInstructions: "",
    reviewReminder: REVIEW,
    additionalReviewReminder: LICENSING_REMINDER,
    estimatedMinutes: 6,
    sortWeight: 56,
    version: 1,
    changeSummary: "Initial published version.",
    sections: [
      section("child_symptoms", "Child and Symptoms", "", [
        childName(),
        long("symptoms", "Symptoms", { required: true }),
        short("temperature", "Temperature"),
        short("time_observed", "Time symptoms first observed"),
      ]),
      section("care_notification", "Care Provided and Notification", "", [
        long("care_provided", "Care provided"),
        yesNo("parent_contacted", "Parent contacted?"),
        short("pickup_time", "Pickup time"),
      ]),
      section("return_notes", "Return Requirements and Notes", "", [
        long("return_requirements", "Return requirements"),
        long("additional_notes", "Additional notes"),
      ]),
      section("acknowledgment", "Acknowledgment", "", [sigProvider("staff_signature", "Staff signature (testing-only placeholder)"), sigParent("parent_ack", "Parent acknowledgment (testing-only placeholder)")]),
    ],
  },

  {
    templateKey: "behavior-support-information-form",
    title: "Behavior Support Information Form",
    shortDescription: "Strengths-based profile of triggers, calming strategies, and successful approaches for a child.",
    purpose: "Give every caregiver a consistent, supportive, nonjudgmental plan for helping a child succeed.",
    category: C.INCIDENTS_BEHAVIOR_DEVELOPMENT,
    intendedUsers: ["family", "staff"],
    ageGroups: ["all_ages"],
    tags: ["behavior support", "strengths-based"],
    providerInstructions: "Use supportive, nonjudgmental language throughout. Review and update this plan together with the family regularly.",
    familyInstructions: "Share what works well at home — this helps us support your child consistently.",
    reviewReminder: REVIEW,
    estimatedMinutes: 10,
    sortWeight: 66,
    version: 1,
    changeSummary: "Initial published version.",
    sections: [
      section("strengths", "Child Strengths", "", [childName(), long("child_strengths", "Child strengths", { required: true })]),
      section("behaviors_triggers", "Behaviors Being Supported and Known Triggers", "", [
        long("behaviors_supported", "Behaviors being supported"),
        long("known_triggers", "Known triggers"),
        long("communication_methods", "Communication methods that work well"),
      ]),
      section("strategies", "Calming Strategies and Sensory Needs", "", [
        long("calming_strategies", "Calming strategies"),
        long("sensory_needs", "Sensory needs"),
        long("successful_approaches", "Approaches that have worked well"),
        long("approaches_to_avoid", "Approaches to avoid"),
      ]),
      section("priorities_review", "Family Priorities and Review", "", [
        long("family_priorities", "Family priorities"),
        long("provider_strategies", "Provider strategies"),
        dateField("review_date", "Review date"),
        acknowledgment("ack_plan", "Family and provider agree to support this plan together."),
      ]),
    ],
  },

  {
    templateKey: "developmental-progress-summary",
    title: "Developmental Progress Summary",
    shortDescription: "Whole-child progress summary across developmental domains with goals and next steps.",
    purpose: "Give families a clear, encouraging snapshot of their child's progress and shared next steps — not a diagnosis.",
    category: C.INCIDENTS_BEHAVIOR_DEVELOPMENT,
    intendedUsers: ["family", "staff"],
    ageGroups: ["all_ages"],
    tags: ["development", "progress", "assessment"],
    providerInstructions: "This summary reflects classroom observation, not a formal developmental screening or diagnosis. Refer families to a qualified professional for formal evaluation concerns.",
    familyInstructions: "",
    reviewReminder: REVIEW,
    additionalReviewReminder: "This summary is not a diagnosis or a formal developmental screening.",
    estimatedMinutes: 15,
    sortWeight: 63,
    version: 1,
    changeSummary: "Initial published version.",
    sections: [
      section("basics", "Child and Review Period", "", [childName(), short("review_period", "Review period", { required: true })]),
      section("strengths_domains_1", "Strengths, Interests, and Social-Emotional Development", "", [
        long("strengths_interests", "Strengths and interests"),
        long("social_emotional", "Social-emotional development"),
        long("language_literacy", "Language and literacy"),
      ]),
      section("domains_2", "Cognitive, Math, and Science", "", [
        long("cognitive_development", "Cognitive development"),
        long("early_math", "Early math"),
        long("science_discovery", "Science and discovery"),
      ]),
      section("domains_3", "Motor Skills and Creative Arts", "", [
        long("fine_motor", "Fine motor"),
        long("gross_motor", "Gross motor"),
        long("creative_arts", "Creative arts"),
        long("approaches_to_learning", "Approaches to learning"),
      ]),
      section("goals_input", "Goals, Next Steps, and Family Input", "", [
        long("current_goals", "Current goals"),
        long("suggested_next_steps", "Suggested next steps"),
        long("family_input", "Family input"),
        paragraph("not_a_diagnosis", "Please note", "This summary is based on classroom observation and is not a diagnosis or formal developmental screening."),
        sigProvider("teacher_signature", "Teacher acknowledgment (testing-only placeholder)"),
        sigParent("family_signature", "Family acknowledgment (testing-only placeholder)"),
      ]),
    ],
  },

  {
    templateKey: "family-conference-form",
    title: "Family Conference Form",
    shortDescription: "Structured notes for a family-teacher conference: strengths, progress, goals, and next steps.",
    purpose: "Keep conference conversations organized, two-directional, and easy to follow up on.",
    category: C.INCIDENTS_BEHAVIOR_DEVELOPMENT,
    intendedUsers: ["family", "staff"],
    ageGroups: ["all_ages"],
    tags: ["conference", "family engagement"],
    providerInstructions: "Send a copy home after the conference so families have a record of agreed next steps.",
    familyInstructions: "Come with any questions you'd like to discuss — this conference is a two-way conversation.",
    reviewReminder: REVIEW,
    estimatedMinutes: 8,
    sortWeight: 42,
    version: 1,
    changeSummary: "Initial published version.",
    sections: [
      section("basics", "Child and Conference Details", "", [
        childName(),
        dateField("conference_date", "Conference date", { required: true }),
        long("participants", "Participants"),
      ]),
      section("progress", "Strengths, Interests, and Progress", "", [
        long("strengths", "Strengths"),
        long("interests", "Interests"),
        long("progress", "Progress"),
        long("goals", "Goals"),
      ]),
      section("questions_next_steps", "Questions and Next Steps", "", [
        long("family_questions", "Family questions"),
        long("teacher_questions", "Teacher questions"),
        long("agreed_next_steps", "Agreed next steps"),
        dateField("followup_date", "Follow-up date"),
      ]),
      section("acknowledgment", "Acknowledgment", "", [sigProvider("teacher_signature", "Teacher acknowledgment (testing-only placeholder)"), sigParent("family_signature", "Family acknowledgment (testing-only placeholder)")]),
    ],
  },

  // ── G. PROGRAM EVENTS AND COMMUNICATION ─────────────────────────────────

  {
    templateKey: "family-information-preferences-form",
    title: "Family Information and Preferences Form",
    shortDescription: "Gathers communication preferences, cultural considerations, and family goals to support a welcoming relationship.",
    purpose: "Help programs learn about each family's preferences and priorities beyond the standard enrollment paperwork.",
    category: C.PROGRAM_EVENTS_COMMUNICATION,
    intendedUsers: ["family"],
    ageGroups: ["all_ages"],
    tags: ["family engagement", "preferences"],
    providerInstructions: "Use this information to personalize communication and classroom celebrations respectfully.",
    familyInstructions: "Share as much or as little as you're comfortable with — this helps us get to know your family.",
    reviewReminder: REVIEW,
    estimatedMinutes: 8,
    sortWeight: 38,
    version: 1,
    changeSummary: "Initial published version.",
    sections: [
      section("family_names", "Family Names and Relationships", "", [long("family_names_relationships", "Family names and relationships", { required: true })]),
      section("communication", "Communication Preferences", "", [
        single("preferred_communication_method", "Preferred communication method", ["App message", "Email", "Text", "Phone call", "In person"]),
        short("preferred_language", "Preferred language"),
      ]),
      section("culture_celebrations", "Cultural Considerations and Celebrations", "", [
        long("cultural_considerations", "Cultural or family considerations"),
        long("celebrations", "Celebrations important to our family"),
        long("dietary_practices", "Dietary practices"),
      ]),
      section("goals_notes", "Family Goals and Additional Information", "", [
        long("family_goals", "Family goals for this year"),
        long("additional_information", "Additional information"),
      ]),
    ],
  },

  {
    templateKey: "family-survey-feedback-form",
    title: "Family Survey and Feedback Form",
    shortDescription: "Program experience survey covering communication, curriculum, engagement, and environment.",
    purpose: "Give families a structured way to share feedback so programs can celebrate strengths and improve.",
    category: C.PROGRAM_EVENTS_COMMUNICATION,
    intendedUsers: ["family"],
    ageGroups: ["all_ages"],
    tags: ["survey", "feedback"],
    providerInstructions: "Review results as a team and share a summary of changes made in response, when appropriate.",
    familyInstructions: "Your honest feedback helps us improve. Contact information is optional.",
    reviewReminder: REVIEW,
    estimatedMinutes: 6,
    sortWeight: 34,
    version: 1,
    changeSummary: "Initial published version.",
    sections: [
      section("experience", "Program Experience", "", [
        single("overall_experience", "Overall program experience", ["Excellent", "Good", "Fair", "Needs improvement"], { required: true }),
        single("communication_rating", "Communication", ["Excellent", "Good", "Fair", "Needs improvement"]),
        single("curriculum_rating", "Curriculum", ["Excellent", "Good", "Fair", "Needs improvement"]),
        single("engagement_rating", "Family engagement", ["Excellent", "Good", "Fair", "Needs improvement"]),
        single("environment_rating", "Environment", ["Excellent", "Good", "Fair", "Needs improvement"]),
      ]),
      section("open_feedback", "Strengths and Suggestions", "", [
        long("strengths", "What is our program doing well?"),
        long("suggested_improvements", "Suggested improvements"),
      ]),
      section("contact", "Optional Contact Request", "", [yesNo("contact_request", "Would you like a staff member to follow up with you?"), phone("contact_phone", "Best phone number to reach you")]),
    ],
  },

  {
    templateKey: "volunteer-information-form",
    title: "Volunteer Information Form",
    shortDescription: "Volunteer intake covering availability, interests, and confidentiality and background-check acknowledgments.",
    purpose: "Collect the information programs need before scheduling a classroom or event volunteer.",
    category: C.PROGRAM_EVENTS_COMMUNICATION,
    intendedUsers: ["family", "director"],
    ageGroups: ["all_ages"],
    tags: ["volunteer"],
    providerInstructions: "Confirm your program's background-check requirements before scheduling any volunteer with direct child contact.",
    familyInstructions: "Thank you for volunteering! Please share your availability and interests below.",
    reviewReminder: REVIEW,
    additionalReviewReminder: LICENSING_REMINDER,
    estimatedMinutes: 6,
    sortWeight: 28,
    version: 1,
    changeSummary: "Initial published version.",
    sections: [
      section("volunteer_information", "Volunteer Information", "", [
        short("volunteer_name", "Volunteer name", { required: true }),
        short("relationship_to_program", "Relationship to program", { required: true }),
        phone("volunteer_phone", "Phone number", { required: true }),
        email("volunteer_email"),
      ]),
      section("availability_interests", "Availability and Interests", "", [
        long("availability", "Availability"),
        long("interests_skills", "Interests and skills"),
      ]),
      section("emergency_contact", "Emergency Contact", "", [short("volunteer_emergency_name", "Emergency contact name"), phone("volunteer_emergency_phone", "Emergency contact phone")]),
      section("acknowledgments", "Acknowledgments", "", [
        acknowledgment("ack_background_check", "I understand a background check may be required before volunteering."),
        acknowledgment("ack_confidentiality", "I agree to keep confidential any information about children and families I may learn while volunteering."),
        sigParent("volunteer_signature", "Volunteer signature (testing-only placeholder)"),
        dateField("signature_date"),
      ]),
    ],
  },

  {
    templateKey: "event-rsvp-form",
    title: "Event RSVP Form",
    shortDescription: "Quick RSVP for a program event with attendance count, food needs, and volunteer interest.",
    purpose: "Make it easy for families to RSVP and help programs plan food, space, and volunteers.",
    category: C.PROGRAM_EVENTS_COMMUNICATION,
    intendedUsers: ["family"],
    ageGroups: ["all_ages"],
    tags: ["event", "rsvp"],
    providerInstructions: "Reuse this template for each event by duplicating your program copy and updating the event details.",
    familyInstructions: "Please RSVP by the date noted in your event invitation.",
    reviewReminder: REVIEW,
    estimatedMinutes: 4,
    sortWeight: 25,
    version: 1,
    changeSummary: "Initial published version.",
    sections: [
      section("event_information", "Event Information", "", [short("event_name", "Event name", { required: true }), dateField("event_date", "Event date", { required: true })]),
      section("family_attendance", "Child and Family", "", [
        childName("rsvp_child_name", { required: false, label: "Child's name" }),
        single("attendance_choice", "Will you attend?", ["Yes", "No", "Maybe"], { required: true }),
        number("number_attending", "Number attending"),
      ]),
      section("needs", "Food Needs and Volunteer Interest", "", [
        long("food_needs", "Food needs or allergies to plan around"),
        yesNo("volunteer_interest", "Interested in volunteering at this event?"),
        long("questions", "Questions"),
      ]),
    ],
  },
];

module.exports = {
  STARTER_TEMPLATES,
};
