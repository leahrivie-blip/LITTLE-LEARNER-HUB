/**
 * Deterministic fake AI-generation fixtures for Phase 7 testing.
 * Never includes real children, families, staff, or protected information.
 * Always labeled "Testing Preview — AI Not Called."
 */

const formsModel = require("./forms-center-data-model.js");

function section(title, description, fields) {
  return {
    title,
    description: description || "",
    fields: fields.map((field, index) => ({
      tempKey: field.tempKey || `field_${title.replace(/\W+/g, "_").toLowerCase()}_${index}`,
      type: field.type,
      label: field.label,
      helpText: field.helpText || "",
      required: field.required === true,
      options: Array.isArray(field.options) ? field.options : [],
      conditionalOn: field.conditionalOn || null,
      confidence: typeof field.confidence === "number" ? field.confidence : 0.9,
    })),
  };
}

function detectScenario(input) {
  const haystack = `${input.prompt}\n${input.pastedText}`.toLowerCase();
  if (/medic(?:ation|ine)|dosage|administer/.test(haystack)) return "medication";
  if (/photo|media|social\s*media|image\s*permission/.test(haystack)) return "photo";
  if (/field\s*trip|excursion|off[- ]site/.test(haystack)) return "field_trip";
  if (/emergency\s*contact|authorized\s*pickup|pickup\s*person/.test(haystack)) return "emergency";
  if (/enrollment|registration|start\s*date|child\s*information/.test(haystack)) return "enrollment";
  if (/handbook|policy\s*acknowledgment|tuition|payment\s*agreement/.test(haystack)) return "policy";
  if (/incident|injury|illness\s*report/.test(haystack)) return "incident";
  return "generic";
}

function baseDisclaimer() {
  return "Review and customize this draft for your program, policies, families, and state licensing requirements before use. An AI-generated form is never a guarantee of legal or licensing compliance.";
}

function buildMedicationSuggestion(input) {
  return {
    title: "Medication Authorization Form",
    description: "Authorize the program to administer a specific medication to a child according to family and physician instructions.",
    providerInstructions: "Confirm your medication policy and licensing requirements before publishing. Do not give medical advice through this form.",
    familyInstructions: "Complete one form per medication. Bring the medication in its original labeled container.",
    category: formsModel.FORM_CATEGORIES.HEALTH_MEDICATION,
    intendedRecipient: input.intendedRecipient || "guardian",
    filingDestination: "child",
    reviewReminder: "Re-review medication authorizations whenever dosage, medication, or physician instructions change.",
    expirationReminder: "Consider setting an authorization end date and reviewing expired authorizations regularly.",
    sections: [
      section("Child information", "Identify the child this authorization applies to.", [
        { type: formsModel.FIELD_TYPES.SMART_CHILD_NAME, label: "Child's full name", required: true },
        { type: formsModel.FIELD_TYPES.SMART_CHILD_DATE_OF_BIRTH, label: "Date of birth", required: true },
        { type: formsModel.FIELD_TYPES.SMART_PARENT_GUARDIAN_NAME, label: "Parent / guardian name", required: true },
      ]),
      section("Medication details", "Medication, dosage, and administration instructions.", [
        { type: formsModel.FIELD_TYPES.SHORT_TEXT, label: "Medication name", required: true },
        { type: formsModel.FIELD_TYPES.SHORT_TEXT, label: "Reason for medication", required: true },
        { type: formsModel.FIELD_TYPES.YES_NO, label: "Is this a prescription medication?", required: true },
        { type: formsModel.FIELD_TYPES.SHORT_TEXT, label: "Dosage", required: true },
        { type: formsModel.FIELD_TYPES.SHORT_TEXT, label: "Administration method", required: true, helpText: "Example: oral, topical, inhaler." },
        { type: formsModel.FIELD_TYPES.SHORT_TEXT, label: "Times to administer", required: true },
        { type: formsModel.FIELD_TYPES.DATE, label: "Authorization start date", required: true },
        { type: formsModel.FIELD_TYPES.DATE, label: "Authorization end date", required: false },
        { type: formsModel.FIELD_TYPES.LONG_TEXT, label: "Possible side effects or special instructions", required: false },
        { type: formsModel.FIELD_TYPES.SMART_PHYSICIAN, label: "Prescribing physician", required: false },
      ]),
      section("Acknowledgments and signatures", "Family authorization and provider acceptance.", [
        { type: formsModel.FIELD_TYPES.ACKNOWLEDGMENT, label: "I authorize the program to administer this medication as described.", required: true },
        { type: formsModel.FIELD_TYPES.SIGNATURE_PARENT, label: "Parent / guardian signature", required: true },
        { type: formsModel.FIELD_TYPES.SIGNATURE_PROVIDER, label: "Provider acceptance signature", required: false },
      ]),
    ],
    disclaimer: baseDisclaimer(),
  };
}

function buildPhotoSuggestion(input) {
  return {
    title: "Photo and Media Permission Form",
    description: "Collect separate family permissions for classroom, newsletter, website, and social-media photo use.",
    providerInstructions: "Do not combine every photo permission into one required yes/no. Keep each use case separate so families can choose.",
    familyInstructions: "Choose the photo and media permissions that feel right for your family. You may update these later.",
    category: formsModel.FORM_CATEGORIES.PERMISSIONS,
    intendedRecipient: input.intendedRecipient || "guardian",
    filingDestination: "child",
    reviewReminder: "Review photo permissions annually or when a family requests a change.",
    expirationReminder: "",
    sections: [
      section("Child information", "", [
        { type: formsModel.FIELD_TYPES.SMART_CHILD_NAME, label: "Child's full name", required: true },
        { type: formsModel.FIELD_TYPES.SMART_PARENT_GUARDIAN_NAME, label: "Parent / guardian name", required: true },
      ]),
      section("Permission choices", "Separate permissions for each use.", [
        { type: formsModel.FIELD_TYPES.YES_NO, label: "Private family communication (messages, daily updates)", required: true },
        { type: formsModel.FIELD_TYPES.YES_NO, label: "Classroom displays", required: true },
        { type: formsModel.FIELD_TYPES.YES_NO, label: "Program newsletter", required: true },
        { type: formsModel.FIELD_TYPES.YES_NO, label: "Program website", required: true },
        { type: formsModel.FIELD_TYPES.YES_NO, label: "Social media", required: true },
        { type: formsModel.FIELD_TYPES.YES_NO, label: "Promotional materials", required: true },
        { type: formsModel.FIELD_TYPES.YES_NO, label: "Group photographs", required: true },
        { type: formsModel.FIELD_TYPES.YES_NO, label: "Child's name may appear with photos", required: true },
        { type: formsModel.FIELD_TYPES.LONG_TEXT, label: "Restrictions or notes", required: false },
      ]),
      section("Acknowledgment", "", [
        { type: formsModel.FIELD_TYPES.ACKNOWLEDGMENT, label: "I understand I may revoke or update these permissions in writing.", required: true },
        { type: formsModel.FIELD_TYPES.SIGNATURE_PARENT, label: "Parent / guardian signature", required: true },
        { type: formsModel.FIELD_TYPES.DATE, label: "Signature date", required: true },
      ]),
    ],
    disclaimer: baseDisclaimer(),
  };
}

function buildEmergencySuggestion(input) {
  return {
    title: "Emergency Contact Form",
    description: "Collect primary guardians, emergency contacts, and authorized pickup people for a child.",
    providerInstructions: "Confirm your emergency-contact and pickup verification policies before publishing.",
    familyInstructions: "List people we may contact in an emergency and people authorized to pick up your child.",
    category: formsModel.FORM_CATEGORIES.EMERGENCY_CONTACTS,
    intendedRecipient: input.intendedRecipient || "guardian",
    filingDestination: "child",
    reviewReminder: "Ask families to review emergency contacts at least twice a year.",
    expirationReminder: "",
    sections: [
      section("Child information", "", [
        { type: formsModel.FIELD_TYPES.SMART_CHILD_NAME, label: "Child's full name", required: true },
        { type: formsModel.FIELD_TYPES.SMART_CHILD_DATE_OF_BIRTH, label: "Date of birth", required: true },
      ]),
      section("Parent / guardian contacts", "", [
        { type: formsModel.FIELD_TYPES.SMART_PARENT_GUARDIAN_NAME, label: "Primary guardian name", required: true },
        { type: formsModel.FIELD_TYPES.SMART_PARENT_PHONE, label: "Primary guardian phone", required: true },
        { type: formsModel.FIELD_TYPES.EMAIL, label: "Primary guardian email", required: false },
        { type: formsModel.FIELD_TYPES.SHORT_TEXT, label: "Secondary guardian name", required: false },
        { type: formsModel.FIELD_TYPES.PHONE, label: "Secondary guardian phone", required: false },
      ]),
      section("Emergency contacts and authorized pickup", "", [
        { type: formsModel.FIELD_TYPES.SMART_EMERGENCY_CONTACT_NAME, label: "Emergency contact 1 name", required: true },
        { type: formsModel.FIELD_TYPES.SMART_EMERGENCY_CONTACT_PHONE, label: "Emergency contact 1 phone", required: true },
        { type: formsModel.FIELD_TYPES.SMART_AUTHORIZED_PICKUP, label: "Authorized pickup person", required: false },
        { type: formsModel.FIELD_TYPES.LONG_TEXT, label: "Custody or access notes", required: false, helpText: "Share only what staff need to keep the child safe. Avoid pasting court documents here unless your policy requires it.", confidence: 0.7 },
      ]),
      section("Acknowledgment", "", [
        { type: formsModel.FIELD_TYPES.ACKNOWLEDGMENT, label: "I confirm this emergency contact information is current.", required: true },
        { type: formsModel.FIELD_TYPES.SIGNATURE_PARENT, label: "Parent / guardian signature", required: true },
      ]),
    ],
    disclaimer: baseDisclaimer(),
  };
}

function buildEnrollmentSuggestion(input) {
  return {
    title: "Child Enrollment Form",
    description: "Collect the basic child, family, schedule, and care information needed to start enrollment.",
    providerInstructions: "Customize for your enrollment packet, classroom placement process, and state requirements.",
    familyInstructions: "Please complete each section so we can prepare for your child's first day.",
    category: formsModel.FORM_CATEGORIES.ENROLLMENT,
    intendedRecipient: input.intendedRecipient || "guardian",
    filingDestination: "child",
    reviewReminder: "Review enrollment packets whenever your program policies or licensing rules change.",
    expirationReminder: "",
    sections: [
      section("Child information", "", [
        { type: formsModel.FIELD_TYPES.SMART_CHILD_NAME, label: "Child's full name", required: true },
        { type: formsModel.FIELD_TYPES.SHORT_TEXT, label: "Preferred name", required: false },
        { type: formsModel.FIELD_TYPES.SMART_CHILD_DATE_OF_BIRTH, label: "Date of birth", required: true },
        { type: formsModel.FIELD_TYPES.DATE, label: "Requested start date", required: true },
        { type: formsModel.FIELD_TYPES.SHORT_TEXT, label: "Preferred schedule / days", required: true },
      ]),
      section("Family information", "", [
        { type: formsModel.FIELD_TYPES.SMART_PARENT_GUARDIAN_NAME, label: "Parent / guardian name", required: true },
        { type: formsModel.FIELD_TYPES.SMART_PARENT_PHONE, label: "Phone", required: true },
        { type: formsModel.FIELD_TYPES.EMAIL, label: "Email", required: true },
        { type: formsModel.FIELD_TYPES.LONG_TEXT, label: "Home address", required: true },
      ]),
      section("Health and care preferences", "", [
        { type: formsModel.FIELD_TYPES.SMART_ALLERGIES, label: "Allergies", required: false },
        { type: formsModel.FIELD_TYPES.LONG_TEXT, label: "Dietary needs", required: false },
        { type: formsModel.FIELD_TYPES.LONG_TEXT, label: "Comfort and care preferences", required: false },
      ]),
      section("Acknowledgments and signatures", "", [
        { type: formsModel.FIELD_TYPES.ACKNOWLEDGMENT, label: "I confirm the information in this enrollment form is accurate.", required: true },
        { type: formsModel.FIELD_TYPES.SIGNATURE_PARENT, label: "Parent / guardian signature", required: true },
        { type: formsModel.FIELD_TYPES.SIGNATURE_PROVIDER, label: "Provider signature", required: false },
      ]),
    ],
    disclaimer: baseDisclaimer(),
  };
}

function buildPolicySuggestion(input) {
  return {
    title: "Parent Handbook Acknowledgment",
    description: "Confirm that a family received and reviewed the current parent handbook or policy update.",
    providerInstructions: "Attach or reference the exact handbook version/date your families received.",
    familyInstructions: "Please review the handbook or policy summary, ask any questions, and acknowledge receipt.",
    category: formsModel.FORM_CATEGORIES.PARENT_AGREEMENTS,
    intendedRecipient: input.intendedRecipient || "guardian",
    filingDestination: "program",
    reviewReminder: "Issue a new acknowledgment whenever the handbook version changes.",
    expirationReminder: "",
    sections: [
      section("Family information", "", [
        { type: formsModel.FIELD_TYPES.SMART_PARENT_GUARDIAN_NAME, label: "Parent / guardian name", required: true },
        { type: formsModel.FIELD_TYPES.SMART_CHILD_NAME, label: "Child's full name", required: true },
        { type: formsModel.FIELD_TYPES.SHORT_TEXT, label: "Handbook version or date", required: true },
      ]),
      section("Acknowledgment", "", [
        { type: formsModel.FIELD_TYPES.CONTENT_PARAGRAPH, label: "Policy reminder", helpText: "I have received and reviewed the current parent handbook / policy summary and understand I am responsible for following program policies." },
        { type: formsModel.FIELD_TYPES.ACKNOWLEDGMENT, label: "I agree to follow the program policies described in the handbook.", required: true },
        { type: formsModel.FIELD_TYPES.LONG_TEXT, label: "Questions discussed with the program", required: false },
        { type: formsModel.FIELD_TYPES.SIGNATURE_PARENT, label: "Parent / guardian signature", required: true },
        { type: formsModel.FIELD_TYPES.DATE, label: "Signature date", required: true },
      ]),
    ],
    disclaimer: baseDisclaimer(),
  };
}

function buildFieldTripSuggestion(input) {
  return {
    title: "Field Trip Permission Form",
    description: "Collect permission for a child to attend a specific field trip or off-site activity.",
    providerInstructions: "Fill in destination, timing, transportation, and cost details before sending to families.",
    familyInstructions: "Review the trip details and choose whether your child may attend.",
    category: formsModel.FORM_CATEGORIES.FIELD_TRIPS,
    intendedRecipient: input.intendedRecipient || "guardian",
    filingDestination: "child",
    reviewReminder: "Use a fresh permission form for each trip unless your policy allows a recurring authorization.",
    expirationReminder: "",
    sections: [
      section("Child and trip details", "", [
        { type: formsModel.FIELD_TYPES.SMART_CHILD_NAME, label: "Child's full name", required: true },
        { type: formsModel.FIELD_TYPES.SHORT_TEXT, label: "Destination", required: true },
        { type: formsModel.FIELD_TYPES.DATE, label: "Trip date", required: true },
        { type: formsModel.FIELD_TYPES.SHORT_TEXT, label: "Departure and return time", required: true },
        { type: formsModel.FIELD_TYPES.SHORT_TEXT, label: "Transportation method", required: true },
        { type: formsModel.FIELD_TYPES.SHORT_TEXT, label: "Cost", required: false },
        { type: formsModel.FIELD_TYPES.LONG_TEXT, label: "Items needed / meals", required: false },
      ]),
      section("Permission and medical reminders", "", [
        { type: formsModel.FIELD_TYPES.YES_NO, label: "My child may attend this field trip", required: true },
        { type: formsModel.FIELD_TYPES.SMART_ALLERGIES, label: "Allergy or medical reminders for this trip", required: false },
        { type: formsModel.FIELD_TYPES.ACKNOWLEDGMENT, label: "I understand the trip details and supervision plan described above.", required: true },
        { type: formsModel.FIELD_TYPES.SIGNATURE_PARENT, label: "Parent / guardian signature", required: true },
      ]),
    ],
    disclaimer: baseDisclaimer(),
  };
}

function buildIncidentSuggestion(input) {
  return {
    title: "Incident or Injury Report",
    description: "Document what happened, care provided, and family notification for an incident or injury.",
    providerInstructions: "Complete as soon as practical. This is a recordkeeping draft, not medical advice.",
    familyInstructions: "Review the report and acknowledge that you were informed.",
    category: formsModel.FORM_CATEGORIES.INCIDENT_SAFETY,
    intendedRecipient: input.intendedRecipient || "staff",
    filingDestination: "child",
    reviewReminder: "Retain according to your licensing and insurance recordkeeping requirements.",
    expirationReminder: "",
    sections: [
      section("Incident details", "", [
        { type: formsModel.FIELD_TYPES.SMART_CHILD_NAME, label: "Child's full name", required: true },
        { type: formsModel.FIELD_TYPES.DATE, label: "Date of incident", required: true },
        { type: formsModel.FIELD_TYPES.SHORT_TEXT, label: "Time of incident", required: true },
        { type: formsModel.FIELD_TYPES.SHORT_TEXT, label: "Location", required: true },
        { type: formsModel.FIELD_TYPES.SHORT_TEXT, label: "Staff present", required: true },
        { type: formsModel.FIELD_TYPES.LONG_TEXT, label: "What happened", required: true },
        { type: formsModel.FIELD_TYPES.LONG_TEXT, label: "Injury or affected area", required: false },
        { type: formsModel.FIELD_TYPES.LONG_TEXT, label: "First aid or care provided", required: true },
      ]),
      section("Notification and follow-up", "", [
        { type: formsModel.FIELD_TYPES.SHORT_TEXT, label: "People notified", required: true },
        { type: formsModel.FIELD_TYPES.SHORT_TEXT, label: "Time parent contacted", required: false },
        { type: formsModel.FIELD_TYPES.LONG_TEXT, label: "Follow-up or prevention steps", required: false },
        { type: formsModel.FIELD_TYPES.SIGNATURE_PROVIDER, label: "Staff signature", required: true },
        { type: formsModel.FIELD_TYPES.SIGNATURE_PARENT, label: "Parent acknowledgment signature", required: false },
      ]),
    ],
    disclaimer: baseDisclaimer(),
  };
}

function buildGenericSuggestion(input) {
  const titleFromPrompt = (input.prompt || "").split(/[.!?\n]/)[0].trim().slice(0, 80);
  const title = titleFromPrompt || "Custom Program Form";
  const fields = [
    { type: formsModel.FIELD_TYPES.SHORT_TEXT, label: "Full name", required: true },
  ];
  if (input.involves.child) fields.unshift({ type: formsModel.FIELD_TYPES.SMART_CHILD_NAME, label: "Child's full name", required: true });
  if (input.involves.guardian) fields.push({ type: formsModel.FIELD_TYPES.SMART_PARENT_GUARDIAN_NAME, label: "Parent / guardian name", required: true });
  if (input.requestOptions.dates) fields.push({ type: formsModel.FIELD_TYPES.DATE, label: "Date", required: true });
  if (input.requestOptions.acknowledgments) fields.push({ type: formsModel.FIELD_TYPES.ACKNOWLEDGMENT, label: "I acknowledge the information in this form.", required: true });
  if (input.requestOptions.initials) fields.push({ type: formsModel.FIELD_TYPES.INITIALS, label: "Initials", required: true });
  if (input.requestOptions.signatures) fields.push({ type: formsModel.FIELD_TYPES.SIGNATURE_PARENT, label: "Signature", required: true });
  if (input.requestOptions.attachments) fields.push({ type: formsModel.FIELD_TYPES.LONG_TEXT, label: "Attachment notes (upload support coming later)", required: false, helpText: "File upload is prepared for a later phase. Capture attachment notes here for now.", confidence: 0.55 });
  if (input.requestOptions.conditionalQuestions) {
    fields.push({
      type: formsModel.FIELD_TYPES.YES_NO,
      label: "Do you need to share additional details?",
      required: false,
      tempKey: "needs_more_details",
    });
    fields.push({
      type: formsModel.FIELD_TYPES.LONG_TEXT,
      label: "Additional details",
      required: false,
      conditionalOn: { tempKey: "needs_more_details", equals: "Yes" },
      confidence: 0.75,
    });
  }
  fields.push({ type: formsModel.FIELD_TYPES.LONG_TEXT, label: "Additional notes", required: false });

  return {
    title,
    description: input.prompt ? `Draft generated from your description: ${input.prompt.slice(0, 180)}` : "Draft generated from pasted form text.",
    providerInstructions: "Review every suggested field before saving. Customize labels, required settings, and instructions for your program.",
    familyInstructions: "Please complete the sections below.",
    category: input.category || formsModel.FORM_CATEGORIES.CUSTOM,
    intendedRecipient: input.intendedRecipient || "guardian",
    filingDestination: input.filingDestination || "program",
    reviewReminder: "Review this draft carefully before publishing.",
    expirationReminder: "",
    sections: [
      section("Form details", "Suggested structure from your description or pasted text.", fields),
    ],
    disclaimer: baseDisclaimer(),
  };
}

function applyRequestOptions(suggestion, input) {
  const next = JSON.parse(JSON.stringify(suggestion));
  if (input.category && input.category !== formsModel.FORM_CATEGORIES.CUSTOM) {
    next.category = input.category;
  }
  next.intendedRecipient = input.intendedRecipient || next.intendedRecipient;
  next.filingDestination = input.filingDestination || next.filingDestination;

  if (input.requestOptions.signatures) {
    const hasSignature = next.sections.some((sec) => sec.fields.some((field) => field.type === formsModel.FIELD_TYPES.SIGNATURE_PARENT || field.type === formsModel.FIELD_TYPES.SIGNATURE_PROVIDER));
    if (!hasSignature) {
      next.sections.push(section("Signatures", "", [
        { type: formsModel.FIELD_TYPES.SIGNATURE_PARENT, label: "Signature", required: true },
      ]));
    }
  }
  if (input.requestOptions.initials) {
    const hasInitials = next.sections.some((sec) => sec.fields.some((field) => field.type === formsModel.FIELD_TYPES.INITIALS));
    if (!hasInitials) {
      const last = next.sections[next.sections.length - 1];
      last.fields.push({ type: formsModel.FIELD_TYPES.INITIALS, label: "Initials", required: true, tempKey: "requested_initials" });
    }
  }
  if (input.requestOptions.acknowledgments) {
    const hasAck = next.sections.some((sec) => sec.fields.some((field) => field.type === formsModel.FIELD_TYPES.ACKNOWLEDGMENT));
    if (!hasAck) {
      const last = next.sections[next.sections.length - 1];
      last.fields.push({ type: formsModel.FIELD_TYPES.ACKNOWLEDGMENT, label: "I acknowledge the information in this form.", required: true, tempKey: "requested_ack" });
    }
  }
  return next;
}

function buildMockSuggestion(input) {
  const scenario = detectScenario(input);
  let suggestion;
  if (scenario === "medication") suggestion = buildMedicationSuggestion(input);
  else if (scenario === "photo") suggestion = buildPhotoSuggestion(input);
  else if (scenario === "emergency") suggestion = buildEmergencySuggestion(input);
  else if (scenario === "enrollment") suggestion = buildEnrollmentSuggestion(input);
  else if (scenario === "policy") suggestion = buildPolicySuggestion(input);
  else if (scenario === "field_trip") suggestion = buildFieldTripSuggestion(input);
  else if (scenario === "incident") suggestion = buildIncidentSuggestion(input);
  else suggestion = buildGenericSuggestion(input);

  suggestion = applyRequestOptions(suggestion, input);
  suggestion.scenario = scenario;
  suggestion.generatorLabel = "Testing Preview — AI Not Called.";
  suggestion.originalPrompt = input.prompt || "";
  suggestion.originalPastedText = input.pastedText || "";
  suggestion.importFoundation = {
    sourceType: input.pastedText ? "pasted_text" : "plain_language",
    futureSupportedTypes: ["pdf", "word", "image", "scanned_form"],
    note: "PDF, Word, image, and scanned-form extraction will connect later. Paste text for now.",
  };
  return suggestion;
}

module.exports = {
  detectScenario,
  buildMockSuggestion,
};
