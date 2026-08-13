/**
 * Childcare Question Bank for Forms Center (testing-site).
 * Selecting a bank item COPIES fields into the form — bank edits never mutate forms.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.FormsQuestionBank = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /** @typedef {{ id: string, label: string, type: string, required?: boolean, helperText?: string, options?: string[], printLines?: number }} BankField */
  /** @typedef {{ id: string, category: string, title: string, keywords?: string[], fields: BankField[] }} BankItem */

  /** @type {string[]} */
  const CATEGORIES = [
    "Child Information",
    "Parent / Guardian",
    "Emergency",
    "Authorized Pickup",
    "Medical",
    "Allergies",
    "Medication",
    "Schedule",
    "Infant Care",
    "Feeding",
    "Sleep",
    "Toileting",
    "Development",
    "Behavior / Social Emotional",
    "Permissions",
    "Transportation",
    "Field Trips",
    "Photos / Media",
    "Family Information",
    "Staff",
    "Incident / Accident",
    "Health",
    "Policies",
    "Signatures",
    "Other"
  ];

  /**
   * @param {string} id
   * @param {string} category
   * @param {string} title
   * @param {BankField[]} fields
   * @param {string[]} [keywords]
   * @returns {BankItem}
   */
  function item(id, category, title, fields, keywords) {
    return {
      id: String(id || "").trim(),
      category: String(category || "Other").trim() || "Other",
      title: String(title || "").trim(),
      keywords: Array.isArray(keywords) ? keywords.map((k) => String(k || "").trim()).filter(Boolean) : [],
      fields: Array.isArray(fields) ? fields : []
    };
  }

  /**
   * @param {string} id
   * @param {string} label
   * @param {string} type
   * @param {Partial<BankField>} [extra]
   * @returns {BankField}
   */
  function f(id, label, type, extra) {
    return Object.assign(
      {
        id: String(id || "").trim(),
        label: String(label || "").trim(),
        type: String(type || "short_text").trim() || "short_text",
        required: false
      },
      extra && typeof extra === "object" ? extra : {}
    );
  }

  /** @type {BankItem[]} */
  const QUESTION_BANK = [
    item("qb.child.full-name", "Child Information", "Child’s full name", [
      f("childFullName", "Child’s full name", "short_text", { required: true })
    ], ["name", "child"]),
    item("qb.child.dob", "Child Information", "Date of birth", [
      f("childDob", "Date of birth", "date", { required: true })
    ], ["birthday", "age"]),
    item("qb.child.preferred-name", "Child Information", "Preferred / nickname", [
      f("childPreferredName", "Preferred name / nickname", "short_text")
    ]),
    item("qb.child.gender", "Child Information", "Gender (optional)", [
      f("childGender", "Gender (optional)", "short_text")
    ]),
    item("qb.parent.name", "Parent / Guardian", "Parent/guardian name", [
      f("parentName", "Parent/guardian name", "short_text", { required: true })
    ]),
    item("qb.parent.relationship", "Parent / Guardian", "Relationship to child", [
      f("parentRelationship", "Relationship to child", "short_text", { required: true })
    ]),
    item("qb.parent.phone", "Parent / Guardian", "Phone number", [
      f("parentPhone", "Phone number", "short_text", { required: true })
    ]),
    item("qb.parent.email", "Parent / Guardian", "Email address", [
      f("parentEmail", "Email address", "short_text", { required: true })
    ]),
    item("qb.parent.address", "Parent / Guardian", "Home address", [
      f("parentAddress", "Home address", "long_text", { printLines: 2 })
    ]),
    item("qb.emergency.name", "Emergency", "Emergency contact name", [
      f("emergencyName", "Emergency contact name", "short_text", { required: true })
    ]),
    item("qb.emergency.phone", "Emergency", "Emergency contact phone", [
      f("emergencyPhone", "Phone number", "short_text", { required: true })
    ]),
    item("qb.emergency.relationship", "Emergency", "Emergency contact relationship", [
      f("emergencyRelationship", "Relationship to child", "short_text")
    ]),
    item("qb.pickup.who", "Authorized Pickup", "Who is authorized to pick up this child?", [
      f("pickupWho", "Who is authorized to pick up this child?", "long_text", {
        required: true,
        printLines: 3,
        helperText: "List full names of people allowed to pick up your child."
      })
    ]),
    item("qb.pickup.authorized-yesno", "Authorized Pickup", "Is this person authorized for pickup?", [
      f("pickupAuthorized", "Is this person authorized for pickup?", "yes_no", { required: true })
    ]),
    item("qb.allergies.yesno", "Allergies", "Does your child have any allergies?", [
      f("hasAllergies", "Does your child have any allergies?", "yes_no", { required: true })
    ]),
    item("qb.allergies.describe", "Allergies", "Please describe allergies", [
      f("allergyDetails", "Please describe allergies", "long_text", {
        printLines: 3,
        helperText: "Include allergens, reactions, and what staff should do."
      })
    ]),
    item("qb.meds.yesno", "Medication", "Does your child take any medications?", [
      f("takesMedications", "Does your child take any medications?", "yes_no", { required: true })
    ]),
    item("qb.meds.details", "Medication", "Medication details", [
      f("medicationDetails", "Medication name, dose, and timing", "long_text", { printLines: 3 })
    ]),
    item("qb.medical.conditions", "Medical", "Medical conditions / diagnoses", [
      f("medicalConditions", "Medical conditions or diagnoses", "long_text", { printLines: 3 })
    ]),
    item("qb.medical.doctor", "Medical", "Primary doctor / clinic", [
      f("doctorName", "Doctor / clinic name", "short_text"),
      f("doctorPhone", "Doctor / clinic phone", "short_text")
    ]),
    item("qb.health.dietary", "Health", "Dietary restrictions", [
      f("dietaryRestrictions", "Does your child have any dietary restrictions?", "long_text", {
        printLines: 2
      })
    ]),
    item("qb.schedule.usual-days", "Schedule", "Usual attendance days", [
      f("usualDays", "Usual attendance days", "short_text", {
        helperText: "Example: Monday–Friday"
      })
    ]),
    item("qb.schedule.arrival", "Schedule", "Usual arrival time", [
      f("usualArrival", "Usual arrival time", "time")
    ]),
    item("qb.schedule.departure", "Schedule", "Usual departure time", [
      f("usualDeparture", "Usual departure time", "time")
    ]),
    item("qb.sleep.nap-time", "Sleep", "What time does your child usually nap?", [
      f("napTime", "What time does your child usually nap?", "time")
    ]),
    item("qb.sleep.routine", "Sleep", "Sleep / nap routine notes", [
      f("sleepNotes", "Sleep or nap routine notes", "long_text", { printLines: 3 })
    ]),
    item("qb.feeding.plan", "Feeding", "Feeding notes / plan", [
      f("feedingNotes", "Feeding notes or plan", "long_text", { printLines: 3 })
    ]),
    item("qb.infant.bottle", "Infant Care", "Bottle / feeding preferences", [
      f("bottlePrefs", "Bottle or feeding preferences", "long_text", { printLines: 3 })
    ]),
    item("qb.toileting.status", "Toileting", "Toileting status / needs", [
      f("toiletingNotes", "Toileting status or needs", "long_text", { printLines: 2 })
    ]),
    item("qb.behavior.comfort", "Behavior / Social Emotional", "What comforts your child when upset?", [
      f("comfortWhenUpset", "What comforts your child when upset?", "long_text", { printLines: 3 })
    ]),
    item("qb.development.concerns", "Development", "Developmental concerns or supports", [
      f("developmentNotes", "Developmental concerns or supports", "long_text", { printLines: 3 })
    ]),
    item("qb.permissions.generic", "Permissions", "I give permission for…", [
      f("permissionStatement", "I give permission for…", "long_text", {
        printLines: 2,
        helperText: "Describe the permission clearly for families."
      }),
      f("permissionAgree", "I agree", "checkbox", { required: true })
    ]),
    item("qb.photos.permission", "Photos / Media", "Photo / media permission", [
      f(
        "photoPermission",
        "I give permission for photos/videos of my child for program use",
        "yes_no",
        { required: true }
      )
    ]),
    item("qb.transport.permission", "Transportation", "Transportation permission", [
      f(
        "transportPermission",
        "I give permission for my child to be transported by the program as described",
        "yes_no",
        { required: true }
      )
    ]),
    item("qb.fieldtrip.permission", "Field Trips", "Field trip permission", [
      f("fieldTripPermission", "I give permission for my child to attend field trips", "yes_no", {
        required: true
      })
    ]),
    item("qb.family.languages", "Family Information", "Languages spoken at home", [
      f("homeLanguages", "Languages spoken at home", "short_text")
    ]),
    item("qb.staff.name", "Staff", "Staff member name", [
      f("staffName", "Staff member name", "short_text", { required: true })
    ]),
    item("qb.staff.emergency", "Staff", "Staff emergency contact", [
      f("staffEmergencyName", "Emergency contact name", "short_text", { required: true }),
      f("staffEmergencyPhone", "Emergency contact phone", "short_text", { required: true })
    ]),
    item("qb.incident.witness", "Incident / Accident", "Witness name / contact", [
      f("witnessName", "Witness name", "short_text"),
      f("witnessContact", "Witness contact information", "short_text")
    ]),
    item("qb.policies.ack", "Policies", "I have read and agree to the program policies", [
      f("policiesAck", "I have read and agree to the program policies", "checkbox", { required: true })
    ]),
    item("qb.signatures.parent", "Signatures", "Parent/guardian signature", [
      f("parentSignature", "Parent/guardian signature", "signature", { required: true }),
      f("parentSignatureDate", "Date", "date", { required: true })
    ]),
    item("qb.signatures.staff", "Signatures", "Staff signature", [
      f("staffSignature", "Staff signature", "signature", { required: true }),
      f("staffSignatureDate", "Date", "date", { required: true })
    ]),
    item("qb.other.notes", "Other", "Additional notes", [
      f("additionalNotes", "Additional notes", "long_text", { printLines: 4 })
    ])
  ];

  /**
   * @returns {BankItem[]}
   */
  function listQuestionBank() {
    return QUESTION_BANK.map((entry) => ({
      id: entry.id,
      category: entry.category,
      title: entry.title,
      keywords: entry.keywords.slice(),
      fields: entry.fields.map((field) => Object.assign({}, field, {
        options: Array.isArray(field.options) ? field.options.slice() : undefined
      }))
    }));
  }

  /**
   * @param {string} query
   * @param {string} [category]
   * @returns {BankItem[]}
   */
  function searchQuestionBank(query, category) {
    const q = String(query || "").trim().toLowerCase();
    const cat = String(category || "").trim();
    return listQuestionBank().filter((entry) => {
      if (cat && entry.category !== cat) return false;
      if (!q) return true;
      const hay = [entry.title, entry.category, ...(entry.keywords || []), ...entry.fields.map((f) => f.label)]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  /**
   * Copy bank item fields into independent form fields with unique ids.
   * @param {string} bankItemId
   * @param {{ existingIds?: Set<string>|string[], idPrefix?: string }} [opts]
   * @returns {{ ok: true, fields: object[] } | { ok: false, error: string }}
   */
  function copyQuestionBankItem(bankItemId, opts) {
    const id = String(bankItemId || "").trim();
    const source = QUESTION_BANK.find((entry) => entry.id === id);
    if (!source) return { ok: false, error: "Question not found in the Question Bank." };
    const existing = new Set(
      Array.isArray(opts && opts.existingIds)
        ? opts.existingIds.map((x) => String(x || "").trim()).filter(Boolean)
        : opts && opts.existingIds instanceof Set
          ? Array.from(opts.existingIds)
          : []
    );
    const prefix = String((opts && opts.idPrefix) || "qb").trim() || "qb";
    const stamp = Date.now().toString(36);
    const fields = source.fields.map((field, index) => {
      let nextId = `${prefix}.${stamp}.${index}.${field.id}`.replace(/[^a-zA-Z0-9._-]/g, "_");
      let n = 1;
      while (existing.has(nextId)) {
        nextId = `${prefix}.${stamp}.${index}.${field.id}.${n}`.replace(/[^a-zA-Z0-9._-]/g, "_");
        n += 1;
      }
      existing.add(nextId);
      const copied = {
        id: nextId,
        label: field.label,
        type: field.type,
        required: !!field.required,
        helperText: field.helperText || "",
        visible: true
      };
      if (Array.isArray(field.options) && field.options.length) copied.options = field.options.slice();
      if (Number.isFinite(Number(field.printLines)) && Number(field.printLines) > 0) {
        copied.printLines = Math.min(12, Math.max(1, Math.round(Number(field.printLines))));
      }
      return copied;
    });
    return { ok: true, fields, sourceTitle: source.title, sourceId: source.id };
  }

  return {
    CATEGORIES,
    QUESTION_BANK,
    listQuestionBank,
    searchQuestionBank,
    copyQuestionBankItem
  };
});
