/**
 * Forms Ecosystem — testing-site complete forms library, AI builder,
 * structured fields, connections, dashboard, and parent fill UI.
 * Does not replace the Phase 1 Documents spine; extends it.
 *
 * Global: window.FormsEcosystem
 */
(function initFormsEcosystem(global) {
  "use strict";

  const STORAGE_KEY = "llhFormsEcosystemV1";
  const DRAFT_KEY = "llhFormsEcosystemAiDraftV1";

  const FIELD_TYPES = Object.freeze([
    "text", "paragraph", "number", "phone", "email", "address",
    "date", "time", "dropdown", "checkbox", "radio",
    "signature", "initials", "file", "photo",
    "child", "parent", "staff", "classroom",
  ]);

  const CATEGORIES = Object.freeze([
    { id: "enrollment", label: "Enrollment", icon: "📋" },
    { id: "medical", label: "Medical", icon: "🩺" },
    { id: "daily", label: "Daily Care", icon: "☀️" },
    { id: "behavior", label: "Behavior & Documentation", icon: "📝" },
    { id: "staff", label: "Staff", icon: "👥" },
    { id: "licensing", label: "Licensing", icon: "✅" },
    { id: "parent", label: "Parent Communication", icon: "💬" },
  ]);

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function field(type, key, label, opts = {}) {
    return {
      type,
      key,
      label,
      required: Boolean(opts.required),
      placeholder: opts.placeholder || "",
      options: Array.isArray(opts.options) ? opts.options : undefined,
      help: opts.help || "",
      connect: opts.connect || "",
      section: opts.section || "",
    };
  }

  function sigBlock(section = "Signatures") {
    return [
      field("signature", "parentSignature", "Parent / Guardian signature", { required: true, section }),
      field("date", "parentSignedDate", "Date signed", { required: true, section }),
      field("signature", "providerSignature", "Provider signature", { section }),
    ];
  }

  function childHeader(section = "Child") {
    return [
      field("child", "childId", "Child", { required: true, section, connect: "child" }),
      field("text", "childName", "Child name", { required: true, section, connect: "childName" }),
      field("date", "dob", "Date of birth", { section, connect: "dob" }),
      field("parent", "parentName", "Parent / Guardian", { required: true, section, connect: "parentInfo" }),
    ];
  }

  /** Map catalog titles → existing Forms Library / pack resource IDs (no duplicates). */
  const EXISTING = Object.freeze({
    "Enrollment Application": "form-enrollment-forms-enrollment-packet",
    "Enrollment Packet": "form-enrollment-forms-enrollment-packet",
    "Child Information": "form-enrollment-forms-child-information-form",
    "Family Information": "form-enrollment-forms-family-information-sheet",
    "Emergency Contacts": "form-enrollment-forms-emergency-contact-form",
    "Authorized Pickup": "form-enrollment-forms-authorized-pickup-form",
    "Tuition Agreement": "form-business-forms-tuition-agreement",
    "Parent Handbook Acknowledgment": "hdh-form-handbook-acknowledgment",
    "Photo & Video Permission": "form-enrollment-forms-photo-release-form",
    "Transportation Permission": "form-enrollment-forms-transportation-permission",
    "Walking Field Trip Permission": "form-enrollment-forms-field-trip-permission",
    "Sunscreen Permission": "form-medical-forms-sunscreen-authorization",
    "Water Play Permission": "form-enrollment-forms-water-play-permission",
    "Medical Information": "form-medical-forms-health-record",
    "Immunization Record": "form-medical-forms-immunization-record",
    "Allergy Information": "form-medical-forms-allergy-form",
    "Medication Authorization": "form-medical-forms-medication-authorization",
    "Medication Log": "form-medical-forms-medication-log",
    "Individual Health Plan": "form-medical-forms-special-health-care-plan",
    "Food Restrictions": "form-medical-forms-food-substitution-form",
    "Daily Report": "form-daily-forms-daily-report",
    "Infant Daily Report": "form-daily-forms-infant-daily-sheet",
    "Diaper Log": "form-daily-forms-diaper-change-log",
    "Potty Log": "form-daily-forms-potty-training-log",
    "Nap Log": "form-daily-forms-nap-log",
    "Meal Log": "form-daily-forms-meal-tracking-sheet",
    "Observation": "form-program-planning-forms-observation-planning-sheet",
    "Developmental Assessment": null, // new structured
    "Learning Goals": "form-program-planning-forms-child-goal-planning-form",
    "Parent Conference": "form-parent-communication-parent-conference-form",
    "Incident Report": "form-daily-forms-incident-report",
    "Injury Report": "form-medical-forms-injury-report",
    "Illness Report": "form-medical-forms-illness-report",
    "Employment Application": null,
    "Staff Information": "form-staff-forms-staff-information-sheet",
    "Training Record": "form-staff-forms-training-log",
    "Fire Drill": "form-safety-forms-fire-drill-record",
    "Tornado Drill": "form-safety-forms-tornado-drill-record",
    "Emergency Drill": "form-safety-forms-emergency-drill-log",
    "Cleaning Checklist": "form-daily-forms-daily-cleaning-checklist",
    "Playground Inspection": "form-safety-forms-playground-safety-checklist",
    "Visitor Log": "form-safety-forms-visitor-sign-in-sheet",
    "Parent Survey": null,
    "Vacation Notice": "form-business-forms-vacation-notice",
    "Withdrawal Form": "form-business-forms-withdrawal-form",
    "Supply Request": "form-parent-communication-supply-request-note",
    "Infant Safe Sleep Authorization": "hdh-form-infant-safe-sleep",
    "Diaper Cream Authorization": "hdh-form-diaper-cream-authorization",
  });

  function buildCatalog() {
    const items = [];
    function add(category, title, description, fields, opts = {}) {
      const existingId = EXISTING[title] !== undefined ? EXISTING[title] : null;
      const isNew = !existingId && EXISTING[title] !== undefined ? EXISTING[title] === null : !existingId;
      items.push({
        id: opts.id || `fe-${category}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`,
        category,
        title,
        description,
        existingResourceId: existingId || "",
        isNew: Boolean(isNew || opts.forceNew),
        connections: opts.connections || [],
        fields,
      });
    }

    // —— Enrollment ——
    add("enrollment", "Enrollment Application", "Start-of-care application and checklist for new families.", [
      ...childHeader("Family & child"),
      field("date", "startDate", "Requested start date", { required: true, section: "Schedule", connect: "enrollmentDate" }),
      field("paragraph", "scheduleNotes", "Preferred schedule", { section: "Schedule", connect: "scheduleNotes" }),
      field("checkbox", "packetItems", "Packet items included", {
        section: "Checklist",
        options: ["Child info", "Emergency contacts", "Medical", "Tuition", "Handbook", "Permissions"],
      }),
      ...sigBlock(),
    ], { connections: ["enroll_child", "profile"] });

    add("enrollment", "Child Information", "Core child profile details for the file.", [
      ...childHeader(),
      field("text", "preferredName", "Preferred name", { section: "Child" }),
      field("text", "primaryLanguage", "Primary language", { section: "Child" }),
      field("address", "homeAddress", "Home address", { section: "Child", connect: "address" }),
      field("paragraph", "comfortItems", "Comfort items / favorites", { section: "Routines" }),
      field("paragraph", "notes", "What should we know?", { section: "Routines", connect: "notes" }),
      ...sigBlock(),
    ], { connections: ["profile"] });

    add("enrollment", "Family Information", "Household and guardian details.", [
      ...childHeader("Guardians"),
      field("phone", "parentPhone", "Primary phone", { required: true, section: "Guardians", connect: "parentPhone" }),
      field("email", "parentEmail", "Primary email", { required: true, section: "Guardians", connect: "parentEmail" }),
      field("text", "guardian2", "Second guardian", { section: "Guardians" }),
      field("phone", "guardian2Phone", "Second guardian phone", { section: "Guardians" }),
      field("paragraph", "householdNotes", "Household notes", { section: "Household" }),
      ...sigBlock(),
    ], { connections: ["profile"] });

    add("enrollment", "Emergency Contacts", "Who to call in an emergency.", [
      ...childHeader(),
      field("text", "emergency1Name", "Emergency contact 1", { required: true, section: "Contacts", connect: "emergencyContact" }),
      field("phone", "emergency1Phone", "Phone", { required: true, section: "Contacts" }),
      field("text", "emergency1Relation", "Relationship", { section: "Contacts" }),
      field("text", "emergency2Name", "Emergency contact 2", { section: "Contacts" }),
      field("phone", "emergency2Phone", "Phone", { section: "Contacts" }),
      field("text", "hospital", "Preferred hospital", { section: "Medical preference" }),
      ...sigBlock(),
    ], { connections: ["emergency"] });

    add("enrollment", "Authorized Pickup", "Who may pick up the child.", [
      ...childHeader(),
      field("paragraph", "pickupList", "Authorized pickup people (name + phone)", { required: true, section: "Pickup", connect: "pickupContacts" }),
      field("text", "pickupPassword", "Pick-up password", { section: "Pickup" }),
      field("paragraph", "restricted", "People not authorized", { section: "Pickup" }),
      ...sigBlock(),
    ], { connections: ["pickup"] });

    add("enrollment", "Custody Information", "Court orders and custody notes that staff must follow.", [
      ...childHeader(),
      field("paragraph", "custodyNotes", "Custody / parenting plan notes", { required: true, section: "Custody", connect: "notes" }),
      field("checkbox", "hasCourtOrder", "Court order on file?", { section: "Custody", options: ["Yes — attach copy", "No court order"] }),
      field("file", "courtOrderFile", "Upload court order (optional)", { section: "Custody", type: "file" }),
      ...sigBlock(),
    ], { connections: ["profile"], forceNew: true });

    add("enrollment", "Child Schedule", "Days and hours in care.", [
      ...childHeader(),
      field("checkbox", "careDays", "Days in care", {
        required: true,
        section: "Schedule",
        options: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        connect: "scheduleNotes",
      }),
      field("time", "dropOff", "Typical drop-off", { section: "Schedule" }),
      field("time", "pickUp", "Typical pick-up", { section: "Schedule" }),
      field("paragraph", "scheduleNotes", "Schedule notes", { section: "Schedule", connect: "scheduleNotes" }),
      ...sigBlock(),
    ], { connections: ["profile"], forceNew: true });

    add("enrollment", "Tuition Agreement", "Rates, due dates, and payment expectations.", [
      ...childHeader(),
      field("number", "tuitionAmount", "Tuition amount", { required: true, section: "Tuition" }),
      field("dropdown", "billingCycle", "Billing cycle", { section: "Tuition", options: ["Weekly", "Bi-weekly", "Monthly"] }),
      field("paragraph", "tuitionTerms", "Payment terms", { section: "Tuition" }),
      ...sigBlock(),
    ], { connections: ["profile"] });

    add("enrollment", "Parent Handbook Acknowledgment", "Family receipt of handbook policies.", [
      ...childHeader(),
      field("text", "handbookVersion", "Handbook version / date", { required: true, section: "Acknowledgment" }),
      field("checkbox", "ackPolicies", "I have read and agree to the handbook", { required: true, section: "Acknowledgment", options: ["I agree"] }),
      ...sigBlock(),
    ], { connections: ["profile"] });

    add("enrollment", "Photo & Video Permission", "Permission for photos and classroom documentation.", [
      ...childHeader(),
      field("radio", "photoPermission", "Photo / video permission", {
        required: true,
        section: "Permission",
        options: ["Yes — classroom & Family Hub", "Classroom only", "No photos"],
        connect: "photoPermission",
      }),
      ...sigBlock(),
    ], { connections: ["profile"] });

    add("enrollment", "Transportation Permission", "Permission for vehicle transport.", [
      ...childHeader(),
      field("paragraph", "transportDetails", "When / where transportation applies", { required: true, section: "Permission" }),
      field("checkbox", "carSeat", "Appropriate car seat provided", { section: "Permission", options: ["Yes"] }),
      ...sigBlock(),
    ]);

    add("enrollment", "Walking Field Trip Permission", "Permission for neighborhood walks and short outings.", [
      ...childHeader(),
      field("paragraph", "tripDetails", "Typical walking trip details", { section: "Permission" }),
      field("checkbox", "walkAck", "I permit supervised walking trips", { required: true, section: "Permission", options: ["I permit"] }),
      ...sigBlock(),
    ]);

    add("enrollment", "Sunscreen Permission", "Permission to apply sunscreen.", [
      ...childHeader(),
      field("text", "sunscreenBrand", "Product / brand", { section: "Permission" }),
      field("checkbox", "sunscreenAck", "I authorize sunscreen application", { required: true, section: "Permission", options: ["I authorize"] }),
      ...sigBlock(),
    ]);

    add("enrollment", "Insect Repellent Permission", "Permission to apply insect repellent.", [
      ...childHeader(),
      field("text", "repellentBrand", "Product / brand", { section: "Permission" }),
      field("checkbox", "repellentAck", "I authorize insect repellent", { required: true, section: "Permission", options: ["I authorize"] }),
      ...sigBlock(),
    ], { forceNew: true });

    add("enrollment", "Water Play Permission", "Permission for water / splash play.", [
      ...childHeader(),
      field("checkbox", "waterAck", "I permit water play activities", { required: true, section: "Permission", options: ["I permit"] }),
      ...sigBlock(),
    ]);

    add("enrollment", "Nap Permission", "Nap / rest preferences and safe-sleep notes.", [
      ...childHeader(),
      field("paragraph", "napRoutine", "Nap routine & preferences", { section: "Rest", connect: "notes" }),
      field("checkbox", "napAck", "I understand rest-time policies", { required: true, section: "Rest", options: ["I understand"] }),
      ...sigBlock(),
    ], { forceNew: true });

    add("enrollment", "Potty Training Information", "Toileting stage and supports.", [
      ...childHeader(),
      field("dropdown", "pottyStage", "Current stage", {
        section: "Toileting",
        options: ["Diapers", "Training", "Mostly independent", "Fully independent"],
      }),
      field("paragraph", "pottyNotes", "Words, cues, and supplies", { section: "Toileting", connect: "notes" }),
      ...sigBlock(),
    ], { forceNew: true });

    // —— Medical ——
    add("medical", "Medical Information", "General health information for the child file.", [
      ...childHeader(),
      field("paragraph", "conditions", "Medical conditions", { section: "Health", connect: "medicalNotes" }),
      field("paragraph", "allergies", "Allergies", { section: "Health", connect: "allergies" }),
      field("text", "physician", "Physician", { section: "Physician", connect: "physician" }),
      field("phone", "physicianPhone", "Physician phone", { section: "Physician" }),
      ...sigBlock(),
    ], { connections: ["medical", "allergy"] });

    add("medical", "Physician Information", "Doctor and clinic contacts.", [
      ...childHeader(),
      field("text", "physician", "Physician name", { required: true, section: "Physician", connect: "physician" }),
      field("phone", "physicianPhone", "Phone", { required: true, section: "Physician" }),
      field("address", "clinicAddress", "Clinic address", { section: "Physician" }),
      ...sigBlock(),
    ], { connections: ["medical"], forceNew: true });

    add("medical", "Immunization Record", "Immunization status and expiration reminders.", [
      ...childHeader(),
      field("dropdown", "immStatus", "Immunization status", {
        required: true,
        section: "Immunizations",
        options: ["Up to date", "Catch-up schedule", "Exemption on file"],
        connect: "immunizationStatus",
      }),
      field("date", "immExpires", "Next due / review date", { section: "Immunizations", connect: "immunizationExpires" }),
      field("file", "immFile", "Upload record", { section: "Immunizations" }),
      ...sigBlock(),
    ], { connections: ["immunization"] });

    add("medical", "Allergy Information", "Allergies and emergency response.", [
      ...childHeader(),
      field("paragraph", "allergies", "Allergies (food, med, environmental)", { required: true, section: "Allergies", connect: "allergies" }),
      field("paragraph", "reactionPlan", "Reaction / emergency plan", { required: true, section: "Allergies", connect: "medicalNotes" }),
      field("checkbox", "epiPen", "Epinephrine on site?", { section: "Allergies", options: ["Yes", "No"] }),
      ...sigBlock(),
    ], { connections: ["allergy"] });

    add("medical", "Medication Authorization", "Parent permission to store and give medication.", [
      ...childHeader(),
      field("text", "medName", "Medication name", { required: true, section: "Medication", connect: "medication" }),
      field("text", "dosage", "Dosage", { required: true, section: "Medication" }),
      field("text", "medTimes", "Times to give", { section: "Medication" }),
      field("date", "medStart", "Start date", { section: "Medication" }),
      field("date", "medEnd", "End date", { section: "Medication" }),
      field("paragraph", "medInstructions", "Special instructions", { section: "Medication" }),
      ...sigBlock(),
    ], { connections: ["medication"] });

    add("medical", "Medication Log", "Record each dose given.", [
      field("child", "childId", "Child", { required: true, section: "Log" }),
      field("text", "medName", "Medication", { required: true, section: "Log", connect: "medication" }),
      field("date", "logDate", "Date", { required: true, section: "Log" }),
      field("time", "logTime", "Time", { required: true, section: "Log" }),
      field("text", "doseGiven", "Dose given", { required: true, section: "Log" }),
      field("staff", "givenBy", "Given by", { section: "Log" }),
      field("paragraph", "logNotes", "Notes", { section: "Log" }),
    ], { connections: ["medication_log"] });

    add("medical", "Individual Health Plan", "Ongoing health supports for a child.", [
      ...childHeader(),
      field("paragraph", "healthPlan", "Plan details", { required: true, section: "Plan", connect: "medicalNotes" }),
      ...sigBlock(),
    ], { connections: ["medical"] });

    add("medical", "Asthma Action Plan", "Asthma triggers, meds, and emergency steps.", [
      ...childHeader(),
      field("paragraph", "triggers", "Triggers", { section: "Asthma" }),
      field("paragraph", "greenYellowRed", "Green / Yellow / Red zone actions", { required: true, section: "Asthma", connect: "medicalNotes" }),
      ...sigBlock(),
    ], { connections: ["medical"], forceNew: true });

    add("medical", "Seizure Plan", "Seizure response plan for staff.", [
      ...childHeader(),
      field("paragraph", "seizurePlan", "Response steps & medications", { required: true, section: "Plan", connect: "medicalNotes" }),
      ...sigBlock(),
    ], { connections: ["medical"], forceNew: true });

    add("medical", "Diabetes Plan", "Blood sugar, snacks, and emergency contacts.", [
      ...childHeader(),
      field("paragraph", "diabetesPlan", "Care plan details", { required: true, section: "Plan", connect: "medicalNotes" }),
      ...sigBlock(),
    ], { connections: ["medical"], forceNew: true });

    add("medical", "Food Restrictions", "Dietary restrictions and substitutions.", [
      ...childHeader(),
      field("paragraph", "foodRestrictions", "Foods to avoid / substitute", { required: true, section: "Diet", connect: "allergies" }),
      ...sigBlock(),
    ], { connections: ["allergy"] });

    // —— Daily Care ——
    add("daily", "Daily Report", "End-of-day summary for families.", [
      field("child", "childId", "Child", { required: true, section: "Today" }),
      field("date", "reportDate", "Date", { required: true, section: "Today" }),
      field("paragraph", "meals", "Meals", { section: "Care" }),
      field("paragraph", "naps", "Naps", { section: "Care" }),
      field("paragraph", "mood", "Mood & activities", { section: "Care" }),
      field("paragraph", "notesForFamily", "Note for family", { section: "Care" }),
    ], { connections: ["daily_log"] });

    add("daily", "Infant Daily Report", "Feeding, diapers, and sleep for infants.", [
      field("child", "childId", "Child", { required: true, section: "Infant" }),
      field("date", "reportDate", "Date", { required: true, section: "Infant" }),
      field("paragraph", "bottles", "Bottles / feedings", { section: "Infant" }),
      field("paragraph", "diapers", "Diapers", { section: "Infant" }),
      field("paragraph", "sleep", "Sleep", { section: "Infant" }),
    ], { connections: ["daily_log"] });

    add("daily", "Bottle Log", "Individual bottle feeding log.", [
      field("child", "childId", "Child", { required: true, section: "Bottle" }),
      field("date", "logDate", "Date", { required: true, section: "Bottle" }),
      field("time", "logTime", "Time", { required: true, section: "Bottle" }),
      field("number", "ounces", "Ounces", { section: "Bottle" }),
      field("staff", "loggedBy", "Logged by", { section: "Bottle" }),
    ], { connections: ["daily_log"], forceNew: true });

    add("daily", "Diaper Log", "Diaper changes through the day.", [
      field("child", "childId", "Child", { required: true, section: "Diaper" }),
      field("date", "logDate", "Date", { required: true, section: "Diaper" }),
      field("time", "logTime", "Time", { required: true, section: "Diaper" }),
      field("dropdown", "diaperType", "Type", { section: "Diaper", options: ["Wet", "BM", "Both", "Dry check"] }),
    ], { connections: ["daily_log"] });

    add("daily", "Potty Log", "Toileting attempts and successes.", [
      field("child", "childId", "Child", { required: true, section: "Potty" }),
      field("date", "logDate", "Date", { required: true, section: "Potty" }),
      field("time", "logTime", "Time", { required: true, section: "Potty" }),
      field("dropdown", "result", "Result", { section: "Potty", options: ["Success", "Attempt", "Accident"] }),
    ], { connections: ["daily_log"] });

    add("daily", "Nap Log", "Rest times.", [
      field("child", "childId", "Child", { required: true, section: "Nap" }),
      field("date", "logDate", "Date", { required: true, section: "Nap" }),
      field("time", "napStart", "Fell asleep", { section: "Nap" }),
      field("time", "napEnd", "Woke up", { section: "Nap" }),
    ], { connections: ["daily_log"] });

    add("daily", "Meal Log", "Meals and portions offered.", [
      field("child", "childId", "Child", { required: true, section: "Meal" }),
      field("date", "logDate", "Date", { required: true, section: "Meal" }),
      field("dropdown", "mealType", "Meal", { section: "Meal", options: ["Breakfast", "AM snack", "Lunch", "PM snack", "Dinner"] }),
      field("paragraph", "foods", "Foods offered / eaten", { section: "Meal" }),
    ], { connections: ["daily_log"] });

    // —— Behavior & Documentation ——
    add("behavior", "Observation", "Quick developmental observation.", [
      field("child", "childId", "Child", { required: true, section: "Observation" }),
      field("date", "obsDate", "Date", { required: true, section: "Observation" }),
      field("dropdown", "domain", "Domain", {
        section: "Observation",
        options: ["Social-Emotional", "Language", "Cognitive", "Physical", "Approaches to Learning"],
      }),
      field("paragraph", "observation", "What you saw", { required: true, section: "Observation" }),
    ], { connections: ["observation"] });

    add("behavior", "Developmental Assessment", "Period assessment across domains.", [
      ...childHeader(),
      field("paragraph", "strengths", "Strengths", { required: true, section: "Assessment" }),
      field("paragraph", "emerging", "Emerging skills", { section: "Assessment" }),
      field("paragraph", "goals", "Next goals", { section: "Assessment", connect: "activeGoals" }),
      ...sigBlock(),
    ], { connections: ["profile"], forceNew: true });

    add("behavior", "Learning Goals", "Shared learning goals with families.", [
      ...childHeader(),
      field("paragraph", "goals", "Learning goals", { required: true, section: "Goals", connect: "activeGoals" }),
      ...sigBlock(),
    ], { connections: ["profile"] });

    add("behavior", "Parent Conference", "Conference notes and next steps.", [
      ...childHeader(),
      field("date", "conferenceDate", "Conference date", { required: true, section: "Conference" }),
      field("paragraph", "discussion", "Discussion notes", { section: "Conference" }),
      field("paragraph", "nextSteps", "Next steps", { section: "Conference" }),
      ...sigBlock(),
    ]);

    add("behavior", "Incident Report", "Document an incident and parent notification.", [
      ...childHeader(),
      field("date", "incidentDate", "Date", { required: true, section: "Incident" }),
      field("time", "incidentTime", "Time", { section: "Incident" }),
      field("paragraph", "whatHappened", "What happened", { required: true, section: "Incident" }),
      field("paragraph", "actionsTaken", "Actions taken", { section: "Incident" }),
      field("checkbox", "parentNotified", "Parent notified", { section: "Incident", options: ["Yes"] }),
      ...sigBlock(),
    ], { connections: ["incident_family_hub"] });

    add("behavior", "Injury Report", "Injury details and first aid.", [
      ...childHeader(),
      field("date", "injuryDate", "Date", { required: true, section: "Injury" }),
      field("paragraph", "injuryDetails", "Injury & first aid", { required: true, section: "Injury" }),
      ...sigBlock(),
    ], { connections: ["incident_family_hub"] });

    add("behavior", "Illness Report", "Symptoms and exclusion notes.", [
      ...childHeader(),
      field("date", "illnessDate", "Date", { required: true, section: "Illness" }),
      field("paragraph", "symptoms", "Symptoms", { required: true, section: "Illness" }),
      field("paragraph", "returnGuidance", "Return-to-care guidance", { section: "Illness" }),
      ...sigBlock(),
    ], { connections: ["incident_family_hub"] });

    add("behavior", "Behavior Support Plan", "Supportive strategies for challenging behavior.", [
      ...childHeader(),
      field("paragraph", "triggers", "Triggers / context", { section: "Plan" }),
      field("paragraph", "strategies", "Support strategies", { required: true, section: "Plan", connect: "notes" }),
      ...sigBlock(),
    ], { connections: ["profile"], forceNew: true });

    // —— Staff ——
    add("staff", "Employment Application", "Applicant information for hiring.", [
      field("text", "applicantName", "Applicant name", { required: true, section: "Applicant" }),
      field("phone", "applicantPhone", "Phone", { required: true, section: "Applicant" }),
      field("email", "applicantEmail", "Email", { section: "Applicant" }),
      field("paragraph", "experience", "Childcare experience", { section: "Applicant" }),
      field("signature", "applicantSignature", "Signature", { required: true, section: "Signatures" }),
    ], { forceNew: true });

    add("staff", "Staff Information", "Staff contact and onboarding details.", [
      field("staff", "staffId", "Staff member", { section: "Staff" }),
      field("text", "staffName", "Name", { required: true, section: "Staff" }),
      field("phone", "staffPhone", "Phone", { required: true, section: "Staff" }),
      field("email", "staffEmail", "Email", { section: "Staff" }),
      field("paragraph", "emergency", "Emergency contact", { section: "Staff" }),
    ]);

    add("staff", "Emergency Contact", "Staff emergency contact card.", [
      field("text", "staffName", "Staff name", { required: true, section: "Staff" }),
      field("text", "emergencyName", "Emergency contact", { required: true, section: "Emergency" }),
      field("phone", "emergencyPhone", "Phone", { required: true, section: "Emergency" }),
    ], { forceNew: true });

    add("staff", "CPR Record", "CPR / First Aid certification.", [
      field("text", "staffName", "Staff name", { required: true, section: "Certification" }),
      field("date", "cprDate", "Certification date", { required: true, section: "Certification" }),
      field("date", "cprExpires", "Expiration", { required: true, section: "Certification", connect: "staffCertExpires" }),
      field("file", "cprFile", "Certificate upload", { section: "Certification" }),
    ], { connections: ["staff_reminder"], forceNew: true });

    add("staff", "Background Check", "Background check documentation.", [
      field("text", "staffName", "Staff name", { required: true, section: "Check" }),
      field("date", "checkDate", "Completed date", { required: true, section: "Check" }),
      field("date", "checkExpires", "Renewal date", { section: "Check", connect: "staffCertExpires" }),
      field("file", "checkFile", "Upload clearance", { section: "Check" }),
    ], { connections: ["staff_reminder"], forceNew: true });

    add("staff", "Training Record", "Training hours and topics.", [
      field("text", "staffName", "Staff name", { required: true, section: "Training" }),
      field("text", "trainingTitle", "Training title", { required: true, section: "Training" }),
      field("date", "trainingDate", "Date", { required: true, section: "Training" }),
      field("number", "hours", "Hours", { section: "Training" }),
    ]);

    add("staff", "Staff Evaluation", "Performance evaluation notes.", [
      field("text", "staffName", "Staff name", { required: true, section: "Evaluation" }),
      field("date", "evalDate", "Date", { required: true, section: "Evaluation" }),
      field("paragraph", "strengths", "Strengths", { section: "Evaluation" }),
      field("paragraph", "goals", "Goals", { section: "Evaluation" }),
      field("signature", "evaluatorSignature", "Evaluator signature", { section: "Signatures" }),
    ], { forceNew: true });

    add("staff", "Time Off Request", "Staff time-off request.", [
      field("text", "staffName", "Staff name", { required: true, section: "Request" }),
      field("date", "startDate", "Start", { required: true, section: "Request" }),
      field("date", "endDate", "End", { required: true, section: "Request" }),
      field("paragraph", "reason", "Reason (optional)", { section: "Request" }),
      field("signature", "staffSignature", "Signature", { section: "Signatures" }),
    ], { forceNew: true });

    // —— Licensing ——
    add("licensing", "Fire Drill", "Fire drill log entry.", [
      field("date", "drillDate", "Date", { required: true, section: "Drill" }),
      field("time", "drillTime", "Time", { required: true, section: "Drill" }),
      field("number", "evacMinutes", "Evacuation minutes", { section: "Drill" }),
      field("paragraph", "notes", "Notes", { section: "Drill" }),
      field("staff", "recordedBy", "Recorded by", { section: "Drill" }),
    ]);

    add("licensing", "Tornado Drill", "Tornado drill log entry.", [
      field("date", "drillDate", "Date", { required: true, section: "Drill" }),
      field("time", "drillTime", "Time", { required: true, section: "Drill" }),
      field("paragraph", "notes", "Notes", { section: "Drill" }),
      field("staff", "recordedBy", "Recorded by", { section: "Drill" }),
    ]);

    add("licensing", "Emergency Drill", "General emergency drill log.", [
      field("date", "drillDate", "Date", { required: true, section: "Drill" }),
      field("dropdown", "drillType", "Type", { section: "Drill", options: ["Lockdown", "Shelter", "Other"] }),
      field("paragraph", "notes", "Notes", { section: "Drill" }),
    ]);

    add("licensing", "Cleaning Checklist", "Daily / weekly cleaning checklist.", [
      field("date", "checkDate", "Date", { required: true, section: "Cleaning" }),
      field("checkbox", "areas", "Areas cleaned", {
        section: "Cleaning",
        options: ["Toys", "Tables", "Bathrooms", "Floors", "Kitchen", "Cribs / mats"],
      }),
      field("staff", "completedBy", "Completed by", { section: "Cleaning" }),
    ]);

    add("licensing", "Playground Inspection", "Outdoor safety inspection.", [
      field("date", "checkDate", "Date", { required: true, section: "Playground" }),
      field("checkbox", "items", "Checked", {
        section: "Playground",
        options: ["Equipment secure", "Surfacing OK", "Hazards removed", "Gates latched"],
      }),
      field("paragraph", "issues", "Issues found", { section: "Playground" }),
    ]);

    add("licensing", "Medication Audit", "Audit of stored medications.", [
      field("date", "auditDate", "Date", { required: true, section: "Audit" }),
      field("paragraph", "findings", "Findings", { section: "Audit" }),
      field("staff", "auditor", "Auditor", { section: "Audit" }),
    ], { forceNew: true });

    add("licensing", "Refrigerator Temperature", "Fridge temperature log.", [
      field("date", "logDate", "Date", { required: true, section: "Temp" }),
      field("time", "logTime", "Time", { required: true, section: "Temp" }),
      field("number", "tempF", "Temperature (°F)", { required: true, section: "Temp" }),
      field("staff", "loggedBy", "Logged by", { section: "Temp" }),
    ], { forceNew: true });

    add("licensing", "Freezer Temperature", "Freezer temperature log.", [
      field("date", "logDate", "Date", { required: true, section: "Temp" }),
      field("time", "logTime", "Time", { required: true, section: "Temp" }),
      field("number", "tempF", "Temperature (°F)", { required: true, section: "Temp" }),
      field("staff", "loggedBy", "Logged by", { section: "Temp" }),
    ], { forceNew: true });

    add("licensing", "Visitor Log", "Visitor sign-in sheet.", [
      field("date", "visitDate", "Date", { required: true, section: "Visitor" }),
      field("time", "inTime", "Time in", { required: true, section: "Visitor" }),
      field("time", "outTime", "Time out", { section: "Visitor" }),
      field("text", "visitorName", "Visitor name", { required: true, section: "Visitor" }),
      field("text", "purpose", "Purpose", { section: "Visitor" }),
    ]);

    add("licensing", "Vehicle Inspection", "Vehicle safety checklist before transport.", [
      field("date", "checkDate", "Date", { required: true, section: "Vehicle" }),
      field("checkbox", "checks", "Checked", {
        section: "Vehicle",
        options: ["Tires", "Lights", "Seat belts / seats", "First aid kit", "Fuel"],
      }),
      field("staff", "inspector", "Inspector", { section: "Vehicle" }),
    ], { forceNew: true });

    // —— Parent Communication ——
    add("parent", "Parent Survey", "Short feedback survey for families.", [
      field("parent", "parentName", "Parent name", { section: "Survey" }),
      field("dropdown", "satisfaction", "Overall satisfaction", {
        section: "Survey",
        options: ["Excellent", "Good", "Okay", "Needs improvement"],
      }),
      field("paragraph", "feedback", "What should we keep / improve?", { section: "Survey" }),
    ], { forceNew: true });

    add("parent", "Vacation Notice", "Family vacation / absence notice.", [
      ...childHeader(),
      field("date", "awayStart", "Away from", { required: true, section: "Absence" }),
      field("date", "awayEnd", "Return", { required: true, section: "Absence" }),
      field("paragraph", "notes", "Notes", { section: "Absence" }),
      ...sigBlock(),
    ]);

    add("parent", "Withdrawal Form", "Notice of withdrawal from care.", [
      ...childHeader(),
      field("date", "lastDay", "Last day of care", { required: true, section: "Withdrawal", connect: "enrollmentDate" }),
      field("paragraph", "reason", "Reason (optional)", { section: "Withdrawal" }),
      ...sigBlock(),
    ], { connections: ["withdraw"] });

    add("parent", "Schedule Change", "Request to change care days/hours.", [
      ...childHeader(),
      field("paragraph", "newSchedule", "Requested new schedule", { required: true, section: "Change", connect: "scheduleNotes" }),
      field("date", "effectiveDate", "Effective date", { section: "Change" }),
      ...sigBlock(),
    ], { connections: ["profile"], forceNew: true });

    add("parent", "Supply Request", "Request supplies from families.", [
      field("child", "childId", "Child", { section: "Request" }),
      field("paragraph", "supplies", "Items needed", { required: true, section: "Request" }),
      field("date", "neededBy", "Needed by", { section: "Request" }),
    ]);

    add("parent", "Event RSVP", "RSVP for program events.", [
      field("parent", "parentName", "Parent name", { required: true, section: "RSVP" }),
      field("child", "childId", "Child", { section: "RSVP" }),
      field("text", "eventName", "Event", { required: true, section: "RSVP" }),
      field("radio", "attending", "Attending?", { required: true, section: "RSVP", options: ["Yes", "No", "Maybe"] }),
      field("number", "guestCount", "Number attending", { section: "RSVP" }),
    ], { forceNew: true });

    return items;
  }

  const CATALOG = buildCatalog();

  /** Titles to merge into app.js formGroups (printable library) — only truly new names. */
  const NEW_LIBRARY_TITLES = Object.freeze({
    "Enrollment Forms": [
      "Custody Information",
      "Child Schedule Form",
      "Insect Repellent Permission",
      "Nap Permission",
      "Potty Training Information",
      "Walking Field Trip Permission",
    ],
    "Medical Forms": [
      "Physician Information Form",
      "Asthma Action Plan",
      "Seizure Plan",
      "Diabetes Plan",
      "Medical Information Form",
    ],
    "Daily Forms": [
      "Bottle Log",
      "Infant Daily Report",
    ],
    "Staff Forms": [
      "Employment Application",
      "Staff Emergency Contact",
      "CPR Record",
      "Background Check Record",
      "Staff Evaluation",
      "Time Off Request",
    ],
    "Safety Forms": [
      "Medication Audit Log",
      "Refrigerator Temperature Log",
      "Freezer Temperature Log",
      "Vehicle Inspection Checklist",
    ],
    "Parent Communication": [
      "Parent Survey",
      "Schedule Change Request",
      "Event RSVP",
    ],
    "Program Planning Forms": [
      "Developmental Assessment Form",
      "Behavior Support Plan",
    ],
  });

  function getState() {
    try {
      const raw = global.localStorage?.getItem(STORAGE_KEY);
      if (!raw) return { recentActivity: [], dismissedTips: {} };
      const parsed = JSON.parse(raw);
      return {
        recentActivity: Array.isArray(parsed.recentActivity) ? parsed.recentActivity.slice(0, 40) : [],
        dismissedTips: parsed.dismissedTips && typeof parsed.dismissedTips === "object" ? parsed.dismissedTips : {},
      };
    } catch (_e) {
      return { recentActivity: [], dismissedTips: {} };
    }
  }

  function saveState(next) {
    try {
      global.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (_e) { /* ignore */ }
  }

  function pushActivity(entry) {
    const state = getState();
    state.recentActivity = [{
      id: `act-${Date.now()}`,
      at: new Date().toISOString(),
      ...entry,
    }, ...state.recentActivity].slice(0, 40);
    saveState(state);
  }

  function getAiDraft() {
    try {
      const raw = global.localStorage?.getItem(DRAFT_KEY);
      return raw ? JSON.parse(raw) : { prompt: "", schema: null, body: "", history: [] };
    } catch (_e) {
      return { prompt: "", schema: null, body: "", history: [] };
    }
  }

  function saveAiDraft(draft) {
    try {
      global.localStorage?.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch (_e) { /* ignore */ }
  }

  function catalogByCategory() {
    const map = {};
    CATEGORIES.forEach((c) => { map[c.id] = []; });
    CATALOG.forEach((item) => {
      if (!map[item.category]) map[item.category] = [];
      map[item.category].push(item);
    });
    return map;
  }

  function findCatalogItem(idOrTitle) {
    const key = String(idOrTitle || "").trim().toLowerCase();
    return CATALOG.find((item) => item.id === idOrTitle || item.title.toLowerCase() === key) || null;
  }

  function matchPromptToCatalog(prompt) {
    const p = String(prompt || "").toLowerCase();
    if (!p.trim()) return null;
    const scored = CATALOG.map((item) => {
      let score = 0;
      const title = item.title.toLowerCase();
      if (p.includes(title)) score += 10;
      title.split(/\s+/).forEach((word) => {
        if (word.length > 3 && p.includes(word)) score += 2;
      });
      if (/enroll|packet|application/.test(p) && item.category === "enrollment" && /enrollment|application/i.test(item.title)) score += 6;
      if (/medic/.test(p) && /medication/i.test(item.title)) score += 8;
      if (/field trip|permission slip|walking/.test(p) && /field trip|permission/i.test(item.title)) score += 7;
      if (/allerg/.test(p) && /allerg/i.test(item.title)) score += 8;
      if (/incident|injury/.test(p) && /incident|injury/i.test(item.title)) score += 7;
      if (/handbook/.test(p) && /handbook/i.test(item.title)) score += 7;
      return { item, score };
    }).sort((a, b) => b.score - a.score);
    return scored[0]?.score > 0 ? scored[0].item : null;
  }

  function schemaToBody(schema) {
    if (!schema?.fields?.length) return schema?.title || "Form";
    const sections = [];
    let current = "";
    const lines = [`${schema.title || "Form"}`, "", schema.description || "", ""];
    schema.fields.forEach((f) => {
      if (f.section && f.section !== current) {
        current = f.section;
        lines.push("", current.toUpperCase(), "");
      }
      const req = f.required ? " *" : "";
      if (f.type === "checkbox" || f.type === "radio") {
        const opts = (f.options || []).map((o) => `[ ] ${o}`).join("  ");
        lines.push(`${f.label}${req}: ${opts}`);
      } else if (f.type === "signature") {
        lines.push(`${f.label}${req}: ______________________________`);
      } else if (f.type === "paragraph") {
        lines.push(`${f.label}${req}:`, "__________________________________________________________________", "__________________________________________________________________");
      } else {
        lines.push(`${f.label}${req}: ______________________________`);
      }
    });
    lines.push("", "IMPORTANT: Review for your state licensing requirements before use with families.");
    return lines.filter((line, i, arr) => !(line === "" && arr[i - 1] === "")).join("\n");
  }

  function cloneSchema(item, overrides = {}) {
    return {
      id: overrides.id || `schema-${Date.now()}`,
      catalogId: item.id,
      title: overrides.title || item.title,
      description: overrides.description || item.description,
      category: item.category,
      connections: item.connections || [],
      existingResourceId: item.existingResourceId || "",
      fields: (overrides.fields || item.fields || []).map((f) => ({ ...f, options: f.options ? [...f.options] : undefined })),
      language: overrides.language || "en",
      updatedAt: new Date().toISOString(),
    };
  }

  function generateFromPrompt(prompt) {
    const matched = matchPromptToCatalog(prompt);
    const base = matched || findCatalogItem("Enrollment Application") || CATALOG[0];
    const schema = cloneSchema(base, {
      title: matched ? base.title : guessTitleFromPrompt(prompt),
      description: matched
        ? base.description
        : `Custom form generated from: “${String(prompt).slice(0, 120)}”`,
    });
    if (!matched && /allerg/i.test(prompt) && !schema.fields.some((f) => f.key === "allergies")) {
      schema.fields.splice(Math.max(0, schema.fields.length - 3), 0,
        field("paragraph", "allergies", "Allergies", { required: true, section: "Health", connect: "allergies" }));
    }
    if (/pickup|pick-up|authorized/i.test(prompt) && !schema.fields.some((f) => f.connect === "pickupContacts")) {
      schema.fields.splice(Math.max(0, schema.fields.length - 3), 0,
        field("paragraph", "pickupList", "Authorized pickup people", { required: true, section: "Pickup", connect: "pickupContacts" }));
    }
    if (/emergency/i.test(prompt) && !schema.fields.some((f) => f.connect === "emergencyContact")) {
      schema.fields.splice(Math.max(0, schema.fields.length - 3), 0,
        field("text", "emergency1Name", "Emergency contact", { required: true, section: "Contacts", connect: "emergencyContact" }),
        field("phone", "emergency1Phone", "Emergency phone", { required: true, section: "Contacts" }));
    }
    const body = schemaToBody(schema);
    const draft = {
      prompt: String(prompt || ""),
      schema,
      body,
      history: [{ at: new Date().toISOString(), action: "generate", prompt: String(prompt || "") }],
    };
    saveAiDraft(draft);
    pushActivity({ type: "ai_generate", title: schema.title, detail: "AI form generated" });
    return draft;
  }

  function guessTitleFromPrompt(prompt) {
    const p = String(prompt || "").trim();
    if (/medic/i.test(p)) return "Medication Authorization";
    if (/field trip|permission slip/i.test(p)) return "Walking Field Trip Permission";
    if (/enroll/i.test(p)) return "Enrollment Application";
    if (/allerg/i.test(p)) return "Allergy Information";
    if (/incident/i.test(p)) return "Incident Report";
    return p.length > 48 ? `${p.slice(0, 45)}…` : (p || "Custom Form");
  }

  const REFINE_ACTIONS = Object.freeze([
    { id: "shorter", label: "Make it shorter", hint: "Keep only essential fields" },
    { id: "allergies", label: "Add allergy questions", hint: "Add allergy + reaction fields" },
    { id: "friendlier", label: "Friendlier language", hint: "Warm, plain-language labels" },
    { id: "signatures", label: "Add signature fields", hint: "Ensure parent + provider signatures" },
    { id: "required", label: "Make fields required", hint: "Mark key fields required" },
    { id: "spanish", label: "Translate to Spanish", hint: "Spanish labels (bilingual keep keys)" },
    { id: "emergency", label: "Add emergency contacts", hint: "Add emergency contact fields" },
    { id: "pickup", label: "Add pickup information", hint: "Add authorized pickup fields" },
  ]);

  const SPANISH_LABELS = Object.freeze({
    "Child name": "Nombre del niño/a",
    "Date of birth": "Fecha de nacimiento",
    "Parent / Guardian": "Padre / Tutor",
    "Parent / Guardian signature": "Firma del padre / tutor",
    "Provider signature": "Firma del proveedor",
    "Date signed": "Fecha de firma",
    "Allergies": "Alergias",
    "Allergies (food, med, environmental)": "Alergias (alimentos, medicamentos, ambientales)",
    "Emergency contact": "Contacto de emergencia",
    "Emergency contact 1": "Contacto de emergencia 1",
    "Authorized pickup people (name + phone)": "Personas autorizadas para recoger (nombre + teléfono)",
    "Phone": "Teléfono",
    "Primary phone": "Teléfono principal",
    "Primary email": "Correo electrónico principal",
  });

  function refineSchema(instructionOrId, customText = "") {
    const draft = getAiDraft();
    if (!draft.schema) throw new Error("Generate a form first, then refine it.");
    const schema = cloneSchema(
      { ...draft.schema, fields: draft.schema.fields, connections: draft.schema.connections },
      { title: draft.schema.title, description: draft.schema.description, language: draft.schema.language },
    );
    schema.id = draft.schema.id;
    schema.catalogId = draft.schema.catalogId;
    const action = String(instructionOrId || "").toLowerCase();
    const free = String(customText || instructionOrId || "").toLowerCase();

    if (action === "shorter" || /shorter|simplify|fewer/.test(free)) {
      const keepConnect = new Set(["childName", "parentInfo", "allergies", "emergencyContact", "pickupContacts", "signature"]);
      schema.fields = schema.fields.filter((f) => f.required || keepConnect.has(f.connect) || f.type === "signature" || f.type === "child" || f.type === "parent");
      schema.description = `${schema.description || ""} (Shortened essential version)`.trim();
    }
    if (action === "allergies" || /allerg/.test(free)) {
      if (!schema.fields.some((f) => f.key === "allergies" || f.connect === "allergies")) {
        const idx = Math.max(0, schema.fields.findIndex((f) => f.type === "signature"));
        const insertAt = idx >= 0 ? idx : schema.fields.length;
        schema.fields.splice(insertAt, 0,
          field("paragraph", "allergies", "Allergies", { required: true, section: "Health", connect: "allergies" }),
          field("paragraph", "reactionPlan", "Reaction / emergency plan", { required: true, section: "Health", connect: "medicalNotes" }));
      }
    }
    if (action === "friendlier" || /friendlier|warmer|plain/.test(free)) {
      schema.fields = schema.fields.map((f) => ({
        ...f,
        label: f.label
          .replace(/^I authorize/i, "It’s okay for us to")
          .replace(/Parent \/ Guardian/g, "Parent or caregiver")
          .replace(/Required Information/i, "A few details we need"),
        help: f.help || (f.required ? "This helps us care for your child safely." : ""),
      }));
      schema.description = "A warm, plain-language version for families.";
    }
    if (action === "signatures" || /signature/.test(free)) {
      if (!schema.fields.some((f) => f.type === "signature" && /parent/i.test(f.key + f.label))) {
        schema.fields.push(...sigBlock());
      }
      if (!schema.fields.some((f) => f.type === "initials")) {
        schema.fields.splice(schema.fields.length - 1, 0, field("initials", "parentInitials", "Parent initials", { section: "Signatures", required: true }));
      }
    }
    if (action === "required" || /required|make fields required/.test(free)) {
      schema.fields = schema.fields.map((f) => (
        ["text", "paragraph", "phone", "email", "date", "child", "parent", "signature"].includes(f.type)
          ? { ...f, required: true }
          : f
      ));
    }
    if (action === "spanish" || /spanish|español|espanol/.test(free)) {
      schema.language = "es";
      schema.fields = schema.fields.map((f) => ({
        ...f,
        label: SPANISH_LABELS[f.label] || `${f.label} / ${f.label}`,
      }));
      schema.title = schema.title.includes("/") ? schema.title : `${schema.title} / Formulario`;
    }
    if (action === "emergency" || /emergency/.test(free)) {
      if (!schema.fields.some((f) => f.connect === "emergencyContact")) {
        const idx = Math.max(0, schema.fields.findIndex((f) => f.type === "signature"));
        schema.fields.splice(idx >= 0 ? idx : schema.fields.length, 0,
          field("text", "emergency1Name", "Emergency contact", { required: true, section: "Emergency", connect: "emergencyContact" }),
          field("phone", "emergency1Phone", "Emergency phone", { required: true, section: "Emergency" }));
      }
    }
    if (action === "pickup" || /pickup|pick-up|authorized pickup/.test(free)) {
      if (!schema.fields.some((f) => f.connect === "pickupContacts")) {
        const idx = Math.max(0, schema.fields.findIndex((f) => f.type === "signature"));
        schema.fields.splice(idx >= 0 ? idx : schema.fields.length, 0,
          field("paragraph", "pickupList", "Authorized pickup people (name + phone)", { required: true, section: "Pickup", connect: "pickupContacts" }));
      }
    }

    const body = schemaToBody(schema);
    const next = {
      ...draft,
      schema,
      body,
      history: [...(draft.history || []), { at: new Date().toISOString(), action: action || "custom", prompt: customText || instructionOrId }],
    };
    saveAiDraft(next);
    pushActivity({ type: "ai_refine", title: schema.title, detail: action || "refine" });
    return next;
  }

  function dashboardStats() {
    const docs = (typeof childStore === "function" ? (childStore("Documents") || []) : [])
      .filter((d) => !d.archived);
    const children = (typeof childStore === "function" ? (childStore("Profiles") || []) : [])
      .filter((c) => c && !c.archived);
    const activeIds = new Set(children.map((c) => String(c.id)));
    const live = docs.filter((d) => activeIds.has(String(d.childId || "")));
    const today = new Date().toISOString().slice(0, 10);
    const waitingToSend = live.filter((d) => ["draft", "needed", "assigned"].includes(String(d.status || "").toLowerCase()) && !d.shareWithFamily);
    const waitingOnParent = live.filter((d) => d.shareWithFamily && !d.signedAt && !d.providerReviewed);
    const completed = live.filter((d) => d.providerReviewed || ["on_file", "reviewed", "signed"].includes(String(d.status || "").toLowerCase()));
    const expiringSoon = live.filter((d) => {
      const exp = d.expiresAt || d.answers?.immExpires || d.answers?.cprExpires || d.answers?.checkExpires;
      if (!exp) return false;
      const days = (new Date(exp) - new Date(today)) / 86400000;
      return days >= 0 && days <= 30;
    });
    const requiredCatalog = CATALOG.filter((c) => ["enrollment", "medical"].includes(c.category)).slice(0, 8);
    let missingRequired = 0;
    children.forEach((child) => {
      requiredCatalog.forEach((form) => {
        const has = live.some((d) => String(d.childId) === String(child.id)
          && (String(d.catalogId || "") === form.id || String(d.title || "").toLowerCase() === form.title.toLowerCase())
          && (d.signedAt || d.providerReviewed));
        if (!has) missingRequired += 1;
      });
    });
    const state = getState();
    return {
      waitingToSend: waitingToSend.length,
      waitingOnParent: waitingOnParent.length,
      completed: completed.length,
      expiringSoon: expiringSoon.length,
      missingRequired,
      recentActivity: state.recentActivity.slice(0, 8),
      totalDocs: live.length,
      children: children.length,
      libraryCount: CATALOG.length,
      newCount: CATALOG.filter((c) => c.isNew).length,
      existingMapped: CATALOG.filter((c) => c.existingResourceId).length,
    };
  }

  function renderFieldControl(f, value = "", opts = {}) {
    const name = esc(f.key);
    const val = value == null ? "" : value;
    const req = f.required ? "required" : "";
    const ph = esc(f.placeholder || "");
    const disabled = opts.readOnly ? "disabled" : "";
    const common = `name="${name}" data-fe-field="${name}" data-fe-type="${esc(f.type)}" ${req} ${disabled}`;
    switch (f.type) {
      case "paragraph":
        return `<textarea ${common} rows="3" placeholder="${ph}">${esc(val)}</textarea>`;
      case "number":
        return `<input type="number" ${common} value="${esc(val)}" placeholder="${ph}" />`;
      case "phone":
        return `<input type="tel" ${common} value="${esc(val)}" placeholder="${ph || "555-555-5555"}" />`;
      case "email":
        return `<input type="email" ${common} value="${esc(val)}" placeholder="${ph || "name@email.com"}" />`;
      case "date":
        return `<input type="date" ${common} value="${esc(val)}" />`;
      case "time":
        return `<input type="time" ${common} value="${esc(val)}" />`;
      case "dropdown":
        return `<select ${common}><option value="">Select…</option>${(f.options || []).map((o) => `<option value="${esc(o)}" ${String(val) === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
      case "checkbox": {
        const selected = Array.isArray(val) ? val : String(val || "").split("|").filter(Boolean);
        return `<div class="fe-check-grid">${(f.options || ["Yes"]).map((o) => `
          <label class="fe-check"><input type="checkbox" name="${name}" value="${esc(o)}" data-fe-field="${name}" data-fe-type="checkbox" ${selected.includes(o) ? "checked" : ""} ${disabled} /> <span>${esc(o)}</span></label>`).join("")}</div>`;
      }
      case "radio":
        return `<div class="fe-radio-grid">${(f.options || []).map((o) => `
          <label class="fe-check"><input type="radio" name="${name}" value="${esc(o)}" data-fe-field="${name}" data-fe-type="radio" ${String(val) === o ? "checked" : ""} ${req} ${disabled} /> <span>${esc(o)}</span></label>`).join("")}</div>`;
      case "signature":
        return `<input type="text" ${common} value="${esc(val)}" placeholder="Type full name to sign" class="fe-signature-input" autocomplete="name" />`;
      case "initials":
        return `<input type="text" ${common} value="${esc(val)}" placeholder="Initials" maxlength="8" class="fe-initials-input" />`;
      case "file":
      case "photo":
        return `<input type="${f.type === "photo" ? "file" : "file"}" accept="${f.type === "photo" ? "image/*" : "*/*"}" ${common} class="fe-file-input" />`;
      case "address":
        return `<textarea ${common} rows="2" placeholder="${ph || "Street, city, state, ZIP"}">${esc(val)}</textarea>`;
      case "child":
      case "parent":
      case "staff":
      case "classroom": {
        let options = [];
        try {
          if (f.type === "child" && typeof childStore === "function") {
            options = (childStore("Profiles") || []).filter((c) => !c.archived).map((c) => ({ value: c.id, label: c.name }));
          } else if (f.type === "classroom" && typeof getScheduleClassrooms === "function") {
            options = (getScheduleClassrooms() || []).map((c) => ({ value: c.id || c.name, label: c.name || c.id }));
          } else if (f.type === "staff" && typeof listStaffDirectory === "function") {
            options = (listStaffDirectory() || []).map((s) => ({ value: s.email || s.id || s.name, label: s.name || s.email }));
          }
        } catch (_e) { /* ignore */ }
        if (!options.length) {
          return `<input type="text" ${common} value="${esc(val)}" placeholder="${ph || f.label}" />`;
        }
        return `<select ${common}><option value="">Select…</option>${options.map((o) => `<option value="${esc(o.value)}" ${String(val) === String(o.value) ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select>`;
      }
      default:
        return `<input type="text" ${common} value="${esc(val)}" placeholder="${ph}" />`;
    }
  }

  function renderBeautifulForm(schema, answers = {}, opts = {}) {
    if (!schema?.fields?.length) return `<p class="muted-copy">No structured fields on this form yet.</p>`;
    const sections = [];
    const bySection = new Map();
    schema.fields.forEach((f) => {
      const key = f.section || "Details";
      if (!bySection.has(key)) bySection.set(key, []);
      bySection.get(key).push(f);
    });
    const total = schema.fields.filter((f) => f.required).length || schema.fields.length;
    const filled = schema.fields.filter((f) => {
      const v = answers[f.key];
      return Array.isArray(v) ? v.length : String(v || "").trim();
    }).length;
    const pct = Math.min(100, Math.round((filled / Math.max(1, schema.fields.length)) * 100));
    bySection.forEach((fields, sectionName) => {
      sections.push(`
        <section class="fe-form-section">
          <header class="fe-form-section-head">
            <span class="fe-section-icon" aria-hidden="true">◆</span>
            <h4>${esc(sectionName)}</h4>
          </header>
          <div class="fe-form-fields">
            ${fields.map((f) => `
              <label class="fe-field ${f.required ? "is-required" : ""}">
                <span class="fe-field-label">${esc(f.label)}${f.required ? " *" : ""}</span>
                ${f.help ? `<span class="fe-field-help">${esc(f.help)}</span>` : ""}
                ${renderFieldControl(f, answers[f.key], opts)}
              </label>`).join("")}
          </div>
        </section>`);
    });
    return `
      <div class="fe-beautiful-form" data-fe-form="${esc(schema.id || "")}">
        <div class="fe-form-progress" role="status" aria-label="Form progress">
          <div class="fe-form-progress-bar"><span style="width:${pct}%"></span></div>
          <p class="fe-form-progress-label">${pct}% complete${opts.mode === "parent" ? " — finish on your phone anytime" : ""}</p>
        </div>
        ${sections.join("")}
      </div>`;
  }

  function collectAnswers(root) {
    if (!root) return {};
    const answers = {};
    root.querySelectorAll("[data-fe-field]").forEach((el) => {
      const key = el.getAttribute("data-fe-field");
      const type = el.getAttribute("data-fe-type");
      if (!key) return;
      if (type === "checkbox") {
        if (!Array.isArray(answers[key])) answers[key] = [];
        if (el.checked) answers[key].push(el.value);
        return;
      }
      if (type === "radio") {
        if (el.checked) answers[key] = el.value;
        return;
      }
      if (type === "file" || type === "photo") {
        answers[key] = el.files?.[0]?.name || answers[key] || "";
        return;
      }
      answers[key] = el.value;
    });
    return answers;
  }

  function applyConnections(doc, answers = {}) {
    if (!doc?.childId || typeof childStore !== "function" || typeof saveChildStore !== "function") {
      return { updated: false, changes: [] };
    }
    const profiles = childStore("Profiles") || [];
    const idx = profiles.findIndex((c) => String(c.id) === String(doc.childId));
    if (idx < 0) return { updated: false, changes: [] };
    const child = { ...profiles[idx] };
    const changes = [];
    const set = (key, value, label) => {
      const v = Array.isArray(value) ? value.join(", ") : String(value || "").trim();
      if (!v) return;
      if (String(child[key] || "") === v) return;
      child[key] = v;
      changes.push(label || key);
    };

    const schema = doc.fieldsSchema || getAiDraft().schema || findCatalogItem(doc.catalogId || doc.title);
    const fields = schema?.fields || [];
    fields.forEach((f) => {
      const raw = answers[f.key];
      if (raw == null || raw === "" || (Array.isArray(raw) && !raw.length)) return;
      switch (f.connect) {
        case "allergies": set("allergies", raw, "allergies"); break;
        case "emergencyContact": set("emergencyContact", raw, "emergency contact"); set("emergency", raw, "emergency"); break;
        case "pickupContacts": set("pickupContacts", raw, "authorized pickup"); break;
        case "parentInfo": set("parentInfo", raw, "parent info"); break;
        case "notes": set("notes", [child.notes, raw].filter(Boolean).join("\n"), "notes"); break;
        case "medicalNotes": set("medicalNotes", raw, "medical notes"); break;
        case "physician": set("physician", raw, "physician"); break;
        case "enrollmentDate": set("enrollmentDate", raw, "enrollment date"); break;
        case "activeGoals": set("activeGoals", raw, "learning goals"); break;
        case "scheduleNotes": set("scheduleNotes", raw, "schedule"); break;
        case "photoPermission": set("photoPermission", raw, "photo permission"); break;
        case "immunizationStatus": set("immunizationStatus", raw, "immunization status"); break;
        case "immunizationExpires": set("immunizationExpires", raw, "immunization expiration"); break;
        case "dob": set("dob", raw, "date of birth"); break;
        case "childName": if (!child.name) set("name", raw, "name"); break;
        default: break;
      }
    });

    // Direct answer keys commonly used
    if (answers.allergies) set("allergies", answers.allergies, "allergies");
    if (answers.pickupList) set("pickupContacts", answers.pickupList, "authorized pickup");
    if (answers.emergency1Name) {
      const combined = [answers.emergency1Name, answers.emergency1Phone].filter(Boolean).join(" · ");
      set("emergencyContact", combined, "emergency contact");
      set("emergency", combined);
    }
    if (answers.medName && typeof appendChildRecord === "function") {
      try {
        appendChildRecord("Communications", {
          childId: doc.childId,
          type: "medication",
          title: `Medication on file: ${answers.medName}`,
          notes: [answers.dosage, answers.medTimes, answers.medInstructions].filter(Boolean).join(" · "),
          date: new Date().toISOString().slice(0, 10),
          sourceDocumentId: doc.id,
        });
        changes.push("medication daily-log note");
      } catch (_e) { /* ignore */ }
    }

    const connections = schema?.connections || doc.connections || [];
    if (connections.includes("enroll_child") || /enrollment application|enrollment packet/i.test(doc.title || "")) {
      if (doc.signedAt || answers.parentSignature) {
        set("enrollmentStatus", "Enrolled", "enrollment status");
        if (!child.enrollmentDate) set("enrollmentDate", new Date().toISOString().slice(0, 10), "enrollment date");
      }
    }
    if (connections.includes("withdraw") && answers.lastDay) {
      set("enrollmentStatus", "Withdrawn", "enrollment status");
    }

    if (answers.immExpires || child.immunizationExpires) {
      const exp = answers.immExpires || child.immunizationExpires;
      if (typeof appendOpsAlert === "function") {
        appendOpsAlert({
          type: "form_reminder",
          title: `Immunization review: ${child.name || "Child"}`,
          detail: `Due / expires ${exp}`,
          childId: child.id,
          hrefView: "children",
          priority: "high",
        });
        changes.push("immunization reminder");
      }
    }

    if (!changes.length) return { updated: false, changes: [] };
    const next = profiles.map((c, i) => (i === idx ? { ...child, updatedAt: new Date().toISOString() } : c));
    saveChildStore("Profiles", next);
    pushActivity({ type: "connection", title: doc.title || "Form", detail: `Updated ${changes.join(", ")}` });
    return { updated: true, changes };
  }

  function onFormSigned(doc) {
    if (!doc) return null;
    const answers = doc.answers && typeof doc.answers === "object" ? doc.answers : {};
    // Prefer structured answers; fall back to parsing signature-only docs
    const result = applyConnections(doc, answers);
    if (doc.shareWithFamily || (doc.connections || []).includes("incident_family_hub") || /incident|injury|illness/i.test(doc.title || "")) {
      pushActivity({ type: "family_hub", title: doc.title || "Form", detail: "Visible in Family Hub" });
    }
    return result;
  }

  function dashboardHtml() {
    if (typeof isHomeDaycareHubTestingEnabled === "function" && !isHomeDaycareHubTestingEnabled()) return "";
    const s = dashboardStats();
    return `
      <section class="section-block fe-dashboard" id="feFormsDashboard" data-fe-dashboard>
        <p class="eyebrow">Forms ecosystem</p>
        <h3>Forms Dashboard</h3>
        <p class="muted-copy">One place to see paperwork waiting to send, waiting on parents, completed, expiring, and missing — plus recent activity.</p>
        <div class="fe-dash-grid" role="list">
          <article class="fe-dash-card" role="listitem"><strong>${s.waitingToSend}</strong><span>Waiting to send</span></article>
          <article class="fe-dash-card is-warn" role="listitem"><strong>${s.waitingOnParent}</strong><span>Waiting on parent</span></article>
          <article class="fe-dash-card is-ok" role="listitem"><strong>${s.completed}</strong><span>Completed</span></article>
          <article class="fe-dash-card is-alert" role="listitem"><strong>${s.expiringSoon}</strong><span>Expiring soon</span></article>
          <article class="fe-dash-card" role="listitem"><strong>${s.missingRequired}</strong><span>Missing required</span></article>
          <article class="fe-dash-card" role="listitem"><strong>${s.libraryCount}</strong><span>Library forms</span></article>
        </div>
        <div class="account-actions-row" style="margin-top:12px;">
          <button class="primary-button" type="button" data-fe-jump="feAiBuilder">Open AI Form Builder</button>
          <button class="ghost-button" type="button" data-fe-jump="feLibraryPanel">Browse Forms Library</button>
          <button class="ghost-button" type="button" data-view="forms">Classic Forms Library</button>
          <button class="ghost-button" type="button" data-hdh-forms-refresh>Refresh</button>
        </div>
        ${s.recentActivity.length ? `
          <div class="fe-activity" style="margin-top:14px;">
            <h4>Recent activity</h4>
            <ul class="fe-activity-list">
              ${s.recentActivity.map((a) => `<li><strong>${esc(a.title || a.type)}</strong> <span class="muted-copy">${esc(a.detail || "")}${a.at ? ` · ${esc(String(a.at).slice(0, 16).replace("T", " "))}` : ""}</span></li>`).join("")}
            </ul>
          </div>` : `<p class="muted-copy" style="margin-top:12px;">No recent form activity yet — generate or assign a form to get started.</p>`}
      </section>`;
  }

  function libraryHtml() {
    if (typeof isHomeDaycareHubTestingEnabled === "function" && !isHomeDaycareHubTestingEnabled()) return "";
    const byCat = catalogByCategory();
    return `
      <section class="section-block fe-library" id="feLibraryPanel" data-fe-library>
        <p class="eyebrow">Complete library</p>
        <h3>Built-in Forms Library</h3>
        <p class="muted-copy">${CATALOG.length} forms across ${CATEGORIES.length} categories. Existing templates are reused — not duplicated. New structured forms fill gaps for enrollment, medical plans, licensing logs, and parent communication.</p>
        <div class="fe-library-filters" role="tablist">
          <button type="button" class="fe-filter is-active" data-fe-filter="all">All</button>
          ${CATEGORIES.map((c) => `<button type="button" class="fe-filter" data-fe-filter="${esc(c.id)}">${esc(c.label)} <span>${(byCat[c.id] || []).length}</span></button>`).join("")}
        </div>
        ${CATEGORIES.map((c) => `
          <div class="fe-library-category" data-fe-category="${esc(c.id)}">
            <h4><span aria-hidden="true">${c.icon}</span> ${esc(c.label)}</h4>
            <div class="fe-library-grid">
              ${(byCat[c.id] || []).map((item) => `
                <article class="fe-library-card" data-fe-catalog-id="${esc(item.id)}">
                  <div class="fe-library-card-top">
                    <strong>${esc(item.title)}</strong>
                    <span class="fe-badge ${item.existingResourceId ? "is-existing" : "is-new"}">${item.existingResourceId ? "Linked" : "New"}</span>
                  </div>
                  <p>${esc(item.description)}</p>
                  <p class="fe-field-meta">${item.fields.length} smart fields · ${FIELD_TYPES.filter((t) => item.fields.some((f) => f.type === t)).length} field types</p>
                  <div class="fe-library-actions">
                    <button class="primary-button" type="button" data-fe-use-catalog="${esc(item.id)}">Use form</button>
                    <button class="ghost-button" type="button" data-fe-preview-catalog="${esc(item.id)}">Preview</button>
                    ${item.existingResourceId ? `<button class="ghost-button" type="button" data-fe-open-resource="${esc(item.existingResourceId)}">Open printable</button>` : ""}
                  </div>
                </article>`).join("")}
            </div>
          </div>`).join("")}
        <div id="feLibraryPreview" class="fe-library-preview" hidden></div>
      </section>`;
  }

  function aiBuilderHtml() {
    if (typeof isHomeDaycareHubTestingEnabled === "function" && !isHomeDaycareHubTestingEnabled()) return "";
    const draft = getAiDraft();
    const has = Boolean(draft.schema);
    const children = (typeof childStore === "function" ? (childStore("Profiles") || []) : []).filter((c) => !c.archived);
    return `
      <section class="section-block fe-ai-builder" id="feAiBuilder" data-fe-ai-builder>
        <p class="eyebrow">AI Form Builder</p>
        <h3>Describe the form you need</h3>
        <p class="muted-copy">Type a request in plain language. AI builds a structured form you can refine — without starting over.</p>
        <div class="fe-ai-examples">
          <button type="button" class="fe-chip" data-fe-example="Create an enrollment packet for my home daycare.">Enrollment packet</button>
          <button type="button" class="fe-chip" data-fe-example="Make a medication authorization form.">Medication auth</button>
          <button type="button" class="fe-chip" data-fe-example="Build a field trip permission slip.">Field trip slip</button>
          <button type="button" class="fe-chip" data-fe-example="Create an allergy information form with emergency contacts.">Allergy + emergency</button>
        </div>
        <form id="feAiPromptForm" class="panel-form fe-ai-prompt-form">
          <label>What do you need?
            <textarea name="prompt" rows="3" maxlength="800" required placeholder="Create an enrollment packet for my home daycare.">${esc(draft.prompt || "")}</textarea>
          </label>
          <button class="primary-button" type="submit">Generate form</button>
        </form>
        ${has ? `
          <div class="fe-ai-refine" data-fe-refine-panel>
            <p class="fe-refine-label">Refine without rebuilding</p>
            <div class="fe-ai-examples">
              ${REFINE_ACTIONS.map((a) => `<button type="button" class="fe-chip" data-fe-refine="${esc(a.id)}" title="${esc(a.hint)}">${esc(a.label)}</button>`).join("")}
            </div>
            <form id="feAiRefineForm" class="panel-form" style="margin-top:10px;">
              <label>Or type a custom change
                <input name="custom" maxlength="240" placeholder="Add a second emergency contact and make phone required" />
              </label>
              <button class="ghost-button" type="submit">Apply change</button>
            </form>
          </div>
          <div class="fe-ai-result">
            <div class="fe-ai-result-head">
              <div>
                <strong>${esc(draft.schema.title)}</strong>
                <p class="muted-copy">${esc(draft.schema.description || "")}${draft.schema.language === "es" ? " · Spanish labels" : ""}</p>
              </div>
              <div class="account-actions-row">
                <button class="ghost-button" type="button" data-fe-toggle-preview>Preview</button>
                <button class="primary-button" type="button" data-fe-save-template>Save as template</button>
                <button class="ghost-button" type="button" data-fe-assign-draft ${children.length ? "" : "disabled"}>Assign to child</button>
              </div>
            </div>
            <div id="feAiPreview" class="fe-ai-preview">
              ${renderBeautifulForm(draft.schema, {}, { mode: "preview" })}
            </div>
            ${children.length ? `
              <form id="feAssignDraftForm" class="panel-form" style="margin-top:12px;">
                <label>Assign to
                  <select name="childId" required>
                    ${children.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")}
                  </select>
                </label>
                <label class="settings-check-label"><input type="checkbox" name="shareWithFamily" checked /> Share with Family Hub for parent fill &amp; sign</label>
                <button class="primary-button" type="submit">Assign &amp; notify</button>
              </form>` : `<p class="form-note">Add a child to assign this form.</p>`}
          </div>` : `<p class="muted-copy" style="margin-top:12px;">Try a prompt above — you’ll get a structured form with smart fields, not a blank PDF.</p>`}
      </section>`;
  }

  function parentFillHtml(doc, opts = {}) {
    const schema = doc?.fieldsSchema;
    if (!schema?.fields?.length) return "";
    const answers = doc.answers || {};
    const canFill = opts.canFill !== false && !doc.signedAt;
    return `
      <div class="fe-parent-fill" data-fe-parent-doc="${esc(doc.id || "")}">
        <p class="fe-parent-lead">Complete the sections below — designed for phones. Required fields are marked *.</p>
        <form class="fe-parent-form" data-fe-parent-form="${esc(doc.id || "")}">
          ${renderBeautifulForm(schema, answers, { mode: "parent", readOnly: !canFill })}
          ${canFill ? `
            <div class="fe-parent-actions">
              <button class="primary-button" type="submit">Save &amp; sign</button>
              <p class="fh-meta">Testing signature — records your name, answers, and time for the provider.</p>
            </div>` : ""}
        </form>
      </div>`;
  }

  function mergeNewLibraryTitles() {
    try {
      if (typeof formGroups !== "object" || !formGroups) return { added: 0 };
      let added = 0;
      Object.entries(NEW_LIBRARY_TITLES).forEach(([group, titles]) => {
        if (!Array.isArray(formGroups[group])) formGroups[group] = [];
        titles.forEach((title) => {
          if (!formGroups[group].includes(title)) {
            formGroups[group].push(title);
            added += 1;
          }
        });
      });
      return { added };
    } catch (_e) {
      return { added: 0 };
    }
  }

  function auditReport() {
    const existingTitles = new Set();
    try {
      Object.values(typeof formGroups === "object" ? formGroups : {}).forEach((list) => {
        (list || []).forEach((t) => existingTitles.add(String(t)));
      });
    } catch (_e) { /* ignore */ }
    return {
      catalogTotal: CATALOG.length,
      categories: CATEGORIES.map((c) => ({
        ...c,
        count: CATALOG.filter((i) => i.category === c.id).length,
      })),
      linkedExisting: CATALOG.filter((i) => i.existingResourceId).length,
      newStructured: CATALOG.filter((i) => i.isNew).length,
      fieldTypes: FIELD_TYPES.slice(),
      refineActions: REFINE_ACTIONS.map((a) => a.label),
      printableLibraryGroups: typeof formGroups === "object" ? Object.keys(formGroups) : [],
      printableLibraryCount: existingTitles.size,
      connections: [
        "Allergy → Child Profile",
        "Medication → Communications / daily note",
        "Enrollment signed → Enrolled status",
        "Pickup → pickup list",
        "Immunization expiration → reminder",
        "Incident signed → Family Hub visibility",
        "Medical forms → Child Profile fields",
      ],
    };
  }

  function bindUi(root = global.document) {
    if (!root) return;

    root.addEventListener("click", (event) => {
      const jump = event.target.closest?.("[data-fe-jump]");
      if (jump) {
        const id = jump.getAttribute("data-fe-jump");
        const el = root.getElementById?.(id) || root.querySelector?.(`#${id}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }

      const filterBtn = event.target.closest?.("[data-fe-filter]");
      if (filterBtn && root.querySelector?.("[data-fe-library]")) {
        const key = filterBtn.getAttribute("data-fe-filter");
        root.querySelectorAll("[data-fe-filter]").forEach((b) => b.classList.toggle("is-active", b === filterBtn));
        root.querySelectorAll("[data-fe-category]").forEach((block) => {
          block.hidden = key !== "all" && block.getAttribute("data-fe-category") !== key;
        });
        return;
      }

      const example = event.target.closest?.("[data-fe-example]");
      if (example) {
        const form = root.querySelector("#feAiPromptForm");
        const ta = form?.querySelector('[name="prompt"]');
        if (ta) ta.value = example.getAttribute("data-fe-example") || "";
        form?.requestSubmit?.();
        return;
      }

      const refineBtn = event.target.closest?.("[data-fe-refine]");
      if (refineBtn) {
        try {
          refineSchema(refineBtn.getAttribute("data-fe-refine"));
          refreshHubPanels();
          if (typeof showActionFeedback === "function") showActionFeedback("Form updated — no rebuild needed.");
        } catch (err) {
          if (typeof showActionFeedback === "function") showActionFeedback(err.message || "Could not refine.");
        }
        return;
      }

      const previewCat = event.target.closest?.("[data-fe-preview-catalog]");
      if (previewCat) {
        const item = findCatalogItem(previewCat.getAttribute("data-fe-preview-catalog"));
        const host = root.querySelector("#feLibraryPreview");
        if (item && host) {
          host.hidden = false;
          host.innerHTML = `
            <article class="fe-preview-card">
              <h4>${esc(item.title)}</h4>
              <p class="muted-copy">${esc(item.description)}</p>
              ${renderBeautifulForm(cloneSchema(item), {}, { mode: "preview", readOnly: true })}
            </article>`;
          host.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
        return;
      }

      const useCat = event.target.closest?.("[data-fe-use-catalog]");
      if (useCat) {
        const item = findCatalogItem(useCat.getAttribute("data-fe-use-catalog"));
        if (item) {
          const draft = {
            prompt: `Use built-in form: ${item.title}`,
            schema: cloneSchema(item),
            body: schemaToBody(cloneSchema(item)),
            history: [{ at: new Date().toISOString(), action: "catalog", prompt: item.title }],
          };
          saveAiDraft(draft);
          pushActivity({ type: "library_use", title: item.title, detail: "Opened from library" });
          refreshHubPanels();
          root.getElementById?.("feAiBuilder")?.scrollIntoView({ behavior: "smooth" });
          if (typeof showActionFeedback === "function") showActionFeedback(`${item.title} ready in AI Form Builder.`);
        }
        return;
      }

      const openRes = event.target.closest?.("[data-fe-open-resource]");
      if (openRes && typeof showView === "function") {
        try {
          showView("forms");
        } catch (_e) { /* ignore */ }
        return;
      }

      if (event.target.closest?.("[data-fe-save-template]")) {
        saveDraftAsTemplate();
        return;
      }
    });

    root.addEventListener("submit", async (event) => {
      const promptForm = event.target.closest?.("#feAiPromptForm");
      if (promptForm) {
        event.preventDefault();
        const prompt = String(new FormData(promptForm).get("prompt") || "").trim();
        if (!prompt) return;
        generateFromPrompt(prompt);
        // Also try backend AI body enrichment when available
        try {
          if (typeof generateToolOutputWithBackend === "function" && typeof canUseAi === "function" && canUseAi()) {
            const draft = getAiDraft();
            const result = await generateToolOutputWithBackend("form", {
              formType: draft.schema.title,
              program: (typeof getProgramSettings === "function" && (getProgramSettings().programName || "")) || "Your program",
              purpose: draft.schema.description || prompt,
              fieldsNeeded: draft.schema.fields.map((f) => f.label).join(", "),
              providerNotes: prompt,
            });
            if (result?.output) {
              draft.body = String(result.output);
              saveAiDraft(draft);
            }
          }
        } catch (_e) { /* local schema is enough */ }
        refreshHubPanels();
        if (typeof showActionFeedback === "function") showActionFeedback("Form generated — refine it below.");
        return;
      }

      const refineForm = event.target.closest?.("#feAiRefineForm");
      if (refineForm) {
        event.preventDefault();
        const custom = String(new FormData(refineForm).get("custom") || "").trim();
        if (!custom) return;
        try {
          refineSchema("custom", custom);
          refreshHubPanels();
          if (typeof showActionFeedback === "function") showActionFeedback("Change applied.");
        } catch (err) {
          if (typeof showActionFeedback === "function") showActionFeedback(err.message || "Could not refine.");
        }
        return;
      }

      const assignForm = event.target.closest?.("#feAssignDraftForm");
      if (assignForm) {
        event.preventDefault();
        await assignDraftToChild(assignForm);
        return;
      }

      const parentForm = event.target.closest?.("[data-fe-parent-form]");
      if (parentForm) {
        event.preventDefault();
        await submitParentFill(parentForm);
      }
    });
  }

  function refreshHubPanels() {
    try {
      if (typeof renderHomeDaycareHubPage === "function"
        && global.document?.querySelector?.("#view-home-daycare-hub.active-view")) {
        renderHomeDaycareHubPage({ refreshHouseholds: false });
      }
    } catch (_e) { /* ignore */ }
  }

  function saveDraftAsTemplate() {
    const draft = getAiDraft();
    if (!draft.schema || typeof saveAiFormAsProgramTemplate !== "function") {
      if (typeof showActionFeedback === "function") showActionFeedback("Generate a form first.");
      return null;
    }
    const categoryMap = {
      enrollment: "Enrollment",
      medical: "Allergy / medical",
      daily: "Other",
      behavior: "Incident report",
      staff: "Staff",
      licensing: "Other",
      parent: "Other",
    };
    const saved = saveAiFormAsProgramTemplate({
      title: draft.schema.title,
      category: categoryMap[draft.schema.category] || "Other",
      body: draft.body || schemaToBody(draft.schema),
      fieldsSchema: draft.schema,
      catalogId: draft.schema.catalogId || "",
      connections: draft.schema.connections || [],
    });
    pushActivity({ type: "template", title: draft.schema.title, detail: "Saved program template" });
    if (typeof showActionFeedback === "function") showActionFeedback("Saved as program template.");
    refreshHubPanels();
    return saved;
  }

  async function assignDraftToChild(form) {
    const draft = getAiDraft();
    if (!draft.schema) throw new Error("Generate a form first.");
    const data = Object.fromEntries(new FormData(form).entries());
    const childId = String(data.childId || "").trim();
    const shareWithFamily = Boolean(form.querySelector('[name="shareWithFamily"]')?.checked);
    if (!childId) throw new Error("Choose a child.");
    const formSpec = {
      title: draft.schema.title,
      category: draft.schema.category || "Other",
      draftText: draft.body || schemaToBody(draft.schema),
      body: draft.body || schemaToBody(draft.schema),
      shareWithFamily,
      catalogId: draft.schema.catalogId || draft.schema.id,
      fieldsSchema: draft.schema,
      connections: draft.schema.connections || [],
      resourceId: draft.schema.existingResourceId || "",
    };
    let docs;
    if (typeof assignAndNotifyForm === "function") {
      docs = await assignAndNotifyForm(formSpec, [childId]);
    } else if (typeof assignFormDocumentToChild === "function") {
      docs = [assignFormDocumentToChild(childId, formSpec)];
    } else {
      throw new Error("Assign is unavailable.");
    }
    // Persist schema on the document record
    try {
      const saved = docs[0];
      if (saved?.id && typeof saveChildStore === "function") {
        const all = childStore("Documents") || [];
        saveChildStore("Documents", all.map((d) => (
          String(d.id) === String(saved.id)
            ? { ...d, fieldsSchema: draft.schema, catalogId: formSpec.catalogId, connections: formSpec.connections, answers: d.answers || {} }
            : d
        )));
      }
    } catch (_e) { /* ignore */ }
    pushActivity({ type: "assign", title: draft.schema.title, detail: shareWithFamily ? "Shared with Family Hub" : "Assigned" });
    if (typeof showActionFeedback === "function") showActionFeedback("Form assigned.");
    refreshHubPanels();
    return docs;
  }

  async function submitParentFill(form) {
    const docId = form.getAttribute("data-fe-parent-form");
    const answers = collectAnswers(form);
    // Persist answers on provider Documents when same browser / logged in
    try {
      if (typeof childStore === "function" && typeof saveChildStore === "function") {
        const docs = childStore("Documents") || [];
        const next = docs.map((d) => {
          if (String(d.id) !== String(docId)) return d;
          const merged = {
            ...d,
            answers,
            draftText: d.fieldsSchema ? schemaToBody({ ...d.fieldsSchema, title: d.title }) : d.draftText,
            updatedAt: new Date().toISOString(),
          };
          return merged;
        });
        saveChildStore("Documents", next);
        const doc = next.find((d) => String(d.id) === String(docId));
        if (doc) applyConnections(doc, answers);
      }
    } catch (_e) { /* ignore */ }

    if (typeof acknowledgeFamilyHubDocument === "function") {
      await acknowledgeFamilyHubDocument(docId);
    }
    pushActivity({ type: "parent_sign", title: "Form signed", detail: "Parent completed structured form" });
    if (typeof showActionFeedback === "function") showActionFeedback("Form signed — thank you!");
    try {
      if (typeof renderFamilyHubPage === "function") renderFamilyHubPage();
      else if (typeof loadFamilyHubParentView === "function") loadFamilyHubParentView();
    } catch (_e) { /* ignore */ }
  }

  function enhanceFamilyHubFormsHtml(originalHtml, data) {
    try {
      const documents = Array.isArray(data?.documents) ? data.documents : [];
      if (!documents.some((d) => d.fieldsSchema?.fields?.length)) return originalHtml;
      // Rebuild panel with structured fill when schema present
      const children = Array.isArray(data?.children) ? data.children : [];
      const childName = (id) => children.find((c) => c.id === id)?.name || "Child";
      return `
        <div class="fh-panel-stack fe-fh-forms">
          <p class="fh-meta">Complete each form on your phone — progress saves as you go. Sign when finished.</p>
          ${documents.map((doc) => {
            const canSign = Boolean(doc.canAcknowledge);
            const signedMeta = doc.signedAt
              ? `Signed ${String(doc.signedAt).slice(0, 16).replace("T", " ")}${doc.signedBy ? ` by ${esc(doc.signedBy)}` : ""}`
              : "";
            const hasSchema = Boolean(doc.fieldsSchema?.fields?.length);
            const body = String(doc.bodyText || "").trim();
            return `
              <article class="fh-card fe-fh-card" id="fh-doc-${esc(doc.id || "doc")}">
                <div class="fh-card-head">
                  <strong>${esc(doc.title || "Form")}</strong>
                  <span class="fh-status-tag">${esc(doc.statusLabel || doc.status || "Needed")}</span>
                </div>
                <p class="fh-meta">${esc(childName(doc.childId))} · ${esc(doc.category || "Other")}${doc.dueDate ? ` · Due ${esc(doc.dueDate)}` : ""}</p>
                ${hasSchema
                  ? parentFillHtml({ ...doc, id: doc.id }, { canFill: canSign })
                  : `
                    ${body ? `<details class="fh-form-body"><summary>Read full form</summary><pre class="fh-form-pre">${esc(body)}</pre></details>` : ""}
                    ${canSign && doc.id ? `<div class="fh-account-actions"><button class="primary-button" type="button" data-family-hub-sign-form="${esc(doc.id)}">Sign form</button></div>` : ""}
                  `}
                ${signedMeta ? `<p class="fh-meta">${signedMeta}</p>` : ""}
              </article>`;
          }).join("")}
        </div>`;
    } catch (_e) {
      return originalHtml;
    }
  }

  // Boot
  let bound = false;
  function boot() {
    mergeNewLibraryTitles();
    if (!bound && global.document) {
      bindUi(global.document);
      bound = true;
    }
  }
  if (global.document?.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  global.FormsEcosystem = {
    FIELD_TYPES,
    CATEGORIES,
    CATALOG,
    REFINE_ACTIONS,
    NEW_LIBRARY_TITLES,
    auditReport,
    dashboardStats,
    dashboardHtml,
    libraryHtml,
    aiBuilderHtml,
    parentFillHtml,
    renderBeautifulForm,
    generateFromPrompt,
    refineSchema,
    getAiDraft,
    saveAiDraft,
    findCatalogItem,
    cloneSchema,
    schemaToBody,
    applyConnections,
    onFormSigned,
    enhanceFamilyHubFormsHtml,
    mergeNewLibraryTitles,
    collectAnswers,
    pushActivity,
  };
})(typeof window !== "undefined" ? window : globalThis);
