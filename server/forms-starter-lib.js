/**
 * Starter Form Library architecture (testing-site).
 * Masters are copied into provider-editable templates — never mutated in place.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./forms-repeat-groups.js"));
  } else {
    root.FormsStarterLib = factory(root.FormsRepeatGroups || null);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (FormsRepeatGroups) {
  "use strict";

  /**
   * Catalog of supported starter keys. Most are architecture placeholders;
   * only a small representative set ships structured fields in this wave.
   * @type {Array<{ key: string, title: string, description: string, audience: string, built: boolean }>}
   */
  const STARTER_CATALOG = [
    { key: "enrollment", title: "Enrollment Form", description: "Full childcare enrollment packet.", audience: "family", built: true },
    { key: "emergency_contact", title: "Emergency Contact Form", description: "Emergency contacts for a child.", audience: "family", built: true },
    { key: "authorized_pickup", title: "Authorized Pickup Form", description: "People allowed to pick up a child.", audience: "family", built: true },
    { key: "child_info_update", title: "Child Information Update", description: "Update child basics mid-year.", audience: "family", built: true },
    { key: "medication_authorization", title: "Medication Authorization", description: "Authorize medication at care.", audience: "family", built: false },
    { key: "allergy_action_plan", title: "Allergy Information / Action Plan", description: "Allergy details and response plan.", audience: "family", built: false },
    { key: "infant_feeding_plan", title: "Infant Feeding Plan", description: "Infant feeding preferences.", audience: "family", built: false },
    { key: "infant_daily_care", title: "Infant Daily Care Plan", description: "Daily infant care notes.", audience: "family", built: false },
    { key: "sleep_routine_plan", title: "Sleep Routine Plan", description: "Nap and sleep routines.", audience: "family", built: false },
    { key: "toilet_learning_plan", title: "Toilet Learning Plan", description: "Toilet learning partnership plan.", audience: "family", built: false },
    { key: "sunscreen_permission", title: "Sunscreen Permission", description: "Permission to apply sunscreen.", audience: "family", built: false },
    { key: "photo_media_permission", title: "Photo / Media Permission", description: "Photo and media consent.", audience: "family", built: false },
    { key: "field_trip_permission", title: "Field Trip Permission", description: "Field trip consent.", audience: "family", built: false },
    { key: "transportation_permission", title: "Transportation Permission", description: "Transportation consent.", audience: "family", built: false },
    { key: "water_play_permission", title: "Water Play Permission", description: "Water play consent.", audience: "family", built: false },
    { key: "family_questionnaire", title: "Family Questionnaire", description: "Getting-to-know-you family form.", audience: "family", built: false },
    { key: "parent_conference_notes", title: "Parent Conference Notes", description: "Conference documentation.", audience: "staff", built: false },
    { key: "developmental_concern", title: "Developmental Concern / Support Notes", description: "Development support notes.", audience: "staff", built: false },
    { key: "behavior_support_plan", title: "Behavior Support Plan", description: "Behavior support partnership.", audience: "staff", built: false },
    { key: "incident_accident", title: "Incident / Accident Report", description: "Incident documentation.", audience: "staff", built: false },
    { key: "late_pickup", title: "Late Pickup Acknowledgment", description: "Late pickup acknowledgment.", audience: "family", built: false },
    { key: "tuition_agreement", title: "Tuition / Payment Agreement", description: "Tuition and payment terms.", audience: "family", built: false },
    { key: "withdrawal", title: "Withdrawal Form", description: "Withdrawal notice.", audience: "family", built: false },
    { key: "waitlist", title: "Waitlist Form", description: "Waitlist interest form.", audience: "family", built: false },
    { key: "staff_information", title: "Staff Information Form", description: "Staff onboarding basics.", audience: "staff", built: false },
    { key: "staff_emergency", title: "Staff Emergency Contact Form", description: "Staff emergency contacts.", audience: "staff", built: false }
  ];

  /**
   * @param {string} id
   * @param {string} label
   * @param {string} type
   * @param {object} [extra]
   */
  function field(id, label, type, extra) {
    return Object.assign(
      {
        id,
        label,
        type,
        required: false,
        visible: true,
        helperText: ""
      },
      extra || {}
    );
  }

  /**
   * @param {string} id
   * @param {string} title
   * @param {object[]} fields
   * @param {object} [extra]
   */
  function section(id, title, fields, extra) {
    return Object.assign(
      {
        id,
        title,
        description: "",
        visible: true,
        fields
      },
      extra || {}
    );
  }

  /**
   * Build structured fields for a small representative starter set.
   * @param {string} key
   * @returns {{ title: string, description: string, audience: string, sections: object[], fields: object[] } | null}
   */
  function buildStarterDefinition(key) {
    const k = String(key || "").trim();
    const expand = FormsRepeatGroups && typeof FormsRepeatGroups.expandFixedRepeatGroup === "function"
      ? FormsRepeatGroups.expandFixedRepeatGroup.bind(FormsRepeatGroups)
      : null;

    if (k === "emergency_contact") {
      const group = expand
        ? expand("emergency_contact", 3, { idPrefix: "starter.emergency", sectionId: "sec.emergency" })
        : { ok: false };
      const fields = group && group.ok
        ? group.fields
        : [
            field("starter.emergency.1.name", "Emergency contact 1 — Name", "short_text", { required: true, sectionId: "sec.emergency" }),
            field("starter.emergency.1.phone", "Emergency contact 1 — Phone", "short_text", { required: true, sectionId: "sec.emergency" })
          ];
      const sections = [
        section("sec.child", "Child", [
          field("starter.child.name", "Child’s full name", "short_text", { required: true, sectionId: "sec.child" }),
          field("starter.child.dob", "Date of birth", "date", { required: true, sectionId: "sec.child" })
        ]),
        section("sec.emergency", "Emergency Contacts", fields),
        section("sec.sign", "Signature", [
          field("starter.sign.parent", "Parent/guardian signature", "signature", { required: true, sectionId: "sec.sign" }),
          field("starter.sign.date", "Date", "date", { required: true, sectionId: "sec.sign" })
        ])
      ];
      return {
        title: "Emergency Contact Form",
        description: "Please list emergency contacts for your child.",
        audience: "family",
        sections,
        fields: flattenSections(sections)
      };
    }

    if (k === "authorized_pickup") {
      const group = expand
        ? expand("authorized_pickup", 3, { idPrefix: "starter.pickup", sectionId: "sec.pickup" })
        : { ok: false };
      const pickupFields = group && group.ok ? group.fields : [];
      const sections = [
        section("sec.child", "Child", [
          field("starter.pickup.child.name", "Child’s full name", "short_text", { required: true, sectionId: "sec.child" })
        ]),
        section("sec.pickup", "Authorized Pickup People", pickupFields.length ? pickupFields : [
          field("starter.pickup.1.name", "Pickup person 1 — Name", "short_text", { required: true, sectionId: "sec.pickup" }),
          field("starter.pickup.1.phone", "Pickup person 1 — Phone", "short_text", { required: true, sectionId: "sec.pickup" })
        ]),
        section("sec.sign", "Signature", [
          field("starter.pickup.sign", "Parent/guardian signature", "signature", { required: true, sectionId: "sec.sign" }),
          field("starter.pickup.date", "Date", "date", { required: true, sectionId: "sec.sign" })
        ])
      ];
      return {
        title: "Authorized Pickup Form",
        description: "List people authorized to pick up your child.",
        audience: "family",
        sections,
        fields: flattenSections(sections)
      };
    }

    if (k === "child_info_update") {
      const sections = [
        section("sec.child", "Child Information", [
          field("starter.update.child.name", "Child’s full name", "short_text", { required: true, sectionId: "sec.child" }),
          field("starter.update.child.dob", "Date of birth", "date", { required: true, sectionId: "sec.child" }),
          field("starter.update.child.preferred", "Preferred name / nickname", "short_text", { sectionId: "sec.child" }),
          field("starter.update.child.allergies", "Current allergies", "long_text", { sectionId: "sec.child", printLines: 3 }),
          field("starter.update.child.meds", "Current medications", "long_text", { sectionId: "sec.child", printLines: 3 }),
          field("starter.update.child.notes", "Other updates we should know", "long_text", { sectionId: "sec.child", printLines: 3 })
        ]),
        section("sec.sign", "Signature", [
          field("starter.update.sign", "Parent/guardian signature", "signature", { required: true, sectionId: "sec.sign" }),
          field("starter.update.date", "Date", "date", { required: true, sectionId: "sec.sign" })
        ])
      ];
      return {
        title: "Child Information Update",
        description: "Use this form to update your child’s information.",
        audience: "family",
        sections,
        fields: flattenSections(sections)
      };
    }

    return null;
  }

  /**
   * @param {object[]} sections
   * @returns {object[]}
   */
  function flattenSections(sections) {
    const out = [];
    for (const sec of sections || []) {
      for (const f of sec.fields || []) {
        out.push(Object.assign({}, f, { sectionId: f.sectionId || sec.id }));
      }
    }
    return out;
  }

  /**
   * Create an independent editable copy from a starter key.
   * Enrollment continues to use the dedicated enrollment baseline builder.
   * @param {string} key
   * @param {{ programId?: string, nowIso?: string }} [opts]
   * @returns {{ ok: true, template: object } | { ok: false, error: string, deferToEnrollment?: boolean }}
   */
  function createEditableStarterCopy(key, opts) {
    const k = String(key || "").trim();
    if (k === "enrollment") {
      return {
        ok: false,
        error: "Use the Enrollment Form baseline to create an editable enrollment copy.",
        deferToEnrollment: true
      };
    }
    const def = buildStarterDefinition(k);
    if (!def) {
      const catalog = STARTER_CATALOG.find((c) => c.key === k);
      if (catalog && !catalog.built) {
        return {
          ok: false,
          error: `"${catalog.title}" is listed for later — architecture is ready, but this starter is not built yet.`
        };
      }
      return { ok: false, error: "Starter form not found." };
    }
    const now = String((opts && opts.nowIso) || new Date().toISOString());
    const stamp = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const template = {
      id: `tpl-starter-${k}-${stamp}`,
      title: def.title,
      description: def.description,
      status: "draft",
      audience: def.audience === "staff" ? "staff" : "family",
      assignmentScope: def.audience === "staff" ? "staff" : "child",
      starterKey: k,
      sourceStarterKey: k,
      isProviderCopy: true,
      fields: def.fields.map((f) => Object.assign({}, f)),
      sections: (def.sections || []).map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description || "",
        visible: s.visible !== false,
        fieldIds: (s.fields || []).map((f) => f.id)
      })),
      branding: { inheritProgram: true },
      createdAt: now,
      updatedAt: now
    };
    return { ok: true, template };
  }

  /**
   * @returns {typeof STARTER_CATALOG}
   */
  function listStarterCatalog() {
    return STARTER_CATALOG.map((c) => Object.assign({}, c));
  }

  /**
   * Starters that can be added later without changing Forms architecture.
   * @returns {Array<{ key: string, title: string }>}
   */
  function listStartersReadyForContentOnly() {
    return STARTER_CATALOG.filter((c) => !c.built && c.key !== "enrollment").map((c) => ({
      key: c.key,
      title: c.title
    }));
  }

  return {
    STARTER_CATALOG,
    listStarterCatalog,
    buildStarterDefinition,
    createEditableStarterCopy,
    listStartersReadyForContentOnly
  };
});
