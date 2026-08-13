/**
 * Fixed-count repeatable groups for Forms (testing-site).
 *
 * Safe pattern: expand a group definition into N independent field slots at
 * template-edit time. Dynamic unlimited "Add another" is intentionally NOT
 * supported here — that would risk snapshot/answer/print/signature integrity.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.FormsRepeatGroups = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /** @typedef {{ id: string, label: string, type: string, required?: boolean, helperText?: string, options?: string[], printLines?: number }} GroupFieldDef */

  /** @type {Record<string, { id: string, title: string, defaultCount: number, minCount: number, maxCount: number, fields: GroupFieldDef[] }>} */
  const GROUP_PRESETS = {
    emergency_contact: {
      id: "emergency_contact",
      title: "Emergency Contact",
      defaultCount: 2,
      minCount: 1,
      maxCount: 5,
      fields: [
        { id: "name", label: "Name", type: "short_text", required: true },
        { id: "relationship", label: "Relationship", type: "short_text", required: true },
        { id: "phone", label: "Phone", type: "short_text", required: true },
        { id: "altPhone", label: "Alternate phone", type: "short_text" },
        { id: "authorizedPickup", label: "Authorized for pickup?", type: "yes_no" }
      ]
    },
    authorized_pickup: {
      id: "authorized_pickup",
      title: "Authorized Pickup Person",
      defaultCount: 2,
      minCount: 1,
      maxCount: 5,
      fields: [
        { id: "name", label: "Name", type: "short_text", required: true },
        { id: "relationship", label: "Relationship", type: "short_text", required: true },
        { id: "phone", label: "Phone", type: "short_text", required: true },
        { id: "notes", label: "Notes", type: "long_text", printLines: 2 }
      ]
    },
    medication: {
      id: "medication",
      title: "Medication",
      defaultCount: 2,
      minCount: 1,
      maxCount: 5,
      fields: [
        { id: "name", label: "Medication name", type: "short_text", required: true },
        { id: "dose", label: "Dose", type: "short_text", required: true },
        { id: "time", label: "Time", type: "time" },
        { id: "instructions", label: "Instructions", type: "long_text", printLines: 2 }
      ]
    },
    child: {
      id: "child",
      title: "Child",
      defaultCount: 1,
      minCount: 1,
      maxCount: 5,
      fields: [
        { id: "name", label: "Name", type: "short_text", required: true },
        { id: "dob", label: "Date of birth", type: "date", required: true }
      ]
    },
    household_member: {
      id: "household_member",
      title: "Household Member",
      defaultCount: 2,
      minCount: 1,
      maxCount: 6,
      fields: [
        { id: "name", label: "Name", type: "short_text", required: true },
        { id: "relationship", label: "Relationship", type: "short_text", required: true }
      ]
    },
    incident_witness: {
      id: "incident_witness",
      title: "Incident Witness",
      defaultCount: 1,
      minCount: 1,
      maxCount: 4,
      fields: [
        { id: "name", label: "Name", type: "short_text", required: true },
        { id: "roleContact", label: "Role / contact information", type: "short_text" }
      ]
    }
  };

  /**
   * @returns {Array<{ id: string, title: string, defaultCount: number, minCount: number, maxCount: number }>}
   */
  function listRepeatGroupPresets() {
    return Object.keys(GROUP_PRESETS).map((key) => {
      const g = GROUP_PRESETS[key];
      return {
        id: g.id,
        title: g.title,
        defaultCount: g.defaultCount,
        minCount: g.minCount,
        maxCount: g.maxCount
      };
    });
  }

  /**
   * Expand a fixed-count group into independent fields (safe for snapshots).
   * @param {string} presetId
   * @param {number} count
   * @param {{ idPrefix?: string, sectionId?: string, existingIds?: Set<string>|string[] }} [opts]
   * @returns {{ ok: true, fields: object[], sectionTitle: string, count: number } | { ok: false, error: string }}
   */
  function expandFixedRepeatGroup(presetId, count, opts) {
    const preset = GROUP_PRESETS[String(presetId || "").trim()];
    if (!preset) return { ok: false, error: "That person/group type is not available." };
    const min = preset.minCount;
    const max = preset.maxCount;
    let n = Math.round(Number(count));
    if (!Number.isFinite(n)) n = preset.defaultCount;
    n = Math.min(max, Math.max(min, n));
    const existing = new Set(
      Array.isArray(opts && opts.existingIds)
        ? opts.existingIds.map((x) => String(x || "").trim()).filter(Boolean)
        : opts && opts.existingIds instanceof Set
          ? Array.from(opts.existingIds)
          : []
    );
    const prefix = String((opts && opts.idPrefix) || preset.id).trim() || preset.id;
    const sectionId = String((opts && opts.sectionId) || "").trim();
    /** @type {object[]} */
    const fields = [];
    for (let i = 1; i <= n; i += 1) {
      fields.push({
        id: uniqueId(`${prefix}.${i}.heading`, existing),
        label: `${preset.title} ${i}`,
        type: "info",
        required: false,
        visible: true,
        helperText: "",
        sectionId: sectionId || undefined,
        printLines: 0
      });
      for (const def of preset.fields) {
        const field = {
          id: uniqueId(`${prefix}.${i}.${def.id}`, existing),
          label: def.label,
          type: def.type,
          required: !!def.required,
          visible: true,
          helperText: def.helperText || "",
          sectionId: sectionId || undefined
        };
        if (Array.isArray(def.options) && def.options.length) field.options = def.options.slice();
        if (Number.isFinite(Number(def.printLines)) && Number(def.printLines) > 0) {
          field.printLines = Math.min(12, Math.max(1, Math.round(Number(def.printLines))));
        }
        fields.push(field);
      }
    }
    return {
      ok: true,
      fields,
      sectionTitle: preset.title,
      count: n,
      presetId: preset.id
    };
  }

  /**
   * @param {string} base
   * @param {Set<string>} existing
   * @returns {string}
   */
  function uniqueId(base, existing) {
    let next = String(base || "field").replace(/[^a-zA-Z0-9._-]/g, "_");
    let n = 1;
    while (existing.has(next)) {
      next = `${base}_${n}`.replace(/[^a-zA-Z0-9._-]/g, "_");
      n += 1;
    }
    existing.add(next);
    return next;
  }

  return {
    GROUP_PRESETS,
    listRepeatGroupPresets,
    expandFixedRepeatGroup,
    MAX_DYNAMIC_REPEATERS_SUPPORTED: false,
    DYNAMIC_REPEATER_NOTE:
      "Unlimited dynamic “Add another” is not implemented — fixed 1–N slots preserve snapshots, printing, signatures, and validation."
  };
});
