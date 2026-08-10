/**
 * Wave 3 — Structured form field schema (shared validation).
 * Used by program templates + AI structured drafts.
 * Does not create a separate template store.
 */
"use strict";

const crypto = require("node:crypto");

const FIELD_TYPES = Object.freeze([
  "info",
  "short_text",
  "long_text",
  "number",
  "date",
  "time",
  "checkbox",
  "yes_no",
  "radio",
  "dropdown",
  "initials",
  "signature",
  "file",
]);

const CHOICE_TYPES = new Set(["radio", "dropdown"]);
const MAX_FIELDS = 80;
const MAX_OPTIONS = 40;
const MAX_LABEL = 200;
const MAX_HELP = 500;
const MAX_OPTION = 160;
const MAX_ID = 80;

const FIELD_TYPE_ALIASES = Object.freeze({
  informational: "info",
  informational_text: "info",
  "informational text": "info",
  text: "short_text",
  short: "short_text",
  "short text": "short_text",
  long: "long_text",
  textarea: "long_text",
  "long text": "long_text",
  integer: "number",
  yesno: "yes_no",
  "yes/no": "yes_no",
  boolean: "yes_no",
  multiple_choice: "radio",
  "multiple choice": "radio",
  select: "dropdown",
  signature_placeholder: "signature",
  "signature placeholder": "signature",
  file_placeholder: "file",
  "file field": "file",
  upload: "file",
});

function cleanText(value = "", max = 200) {
  return String(value || "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/<\/?[^>]+>/g, "")
    .trim()
    .slice(0, max);
}

function normalizeFieldType(raw = "") {
  const key = String(raw || "").trim().toLowerCase();
  if (FIELD_TYPES.includes(key)) return key;
  return FIELD_TYPE_ALIASES[key] || "";
}

function newFieldId(prefix = "fld") {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`;
}

function normalizeOptions(rawOptions, type) {
  if (!CHOICE_TYPES.has(type)) return [];
  const list = Array.isArray(rawOptions) ? rawOptions : [];
  const seen = new Set();
  const out = [];
  list.forEach((opt, index) => {
    if (out.length >= MAX_OPTIONS) return;
    const label = cleanText(
      typeof opt === "string" ? opt : (opt?.label || opt?.value || opt?.text || ""),
      MAX_OPTION,
    );
    if (!label) return;
    const key = label.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const value = cleanText(
      typeof opt === "object" && opt?.value != null ? opt.value : label,
      MAX_OPTION,
    ) || label;
    out.push({
      id: cleanText(opt?.id || `opt_${index + 1}`, 40) || `opt_${index + 1}`,
      label,
      value,
    });
  });
  return out;
}

/**
 * Normalize one field. Throws { status: 400 } on invalid shapes when strict.
 */
function normalizeFormField(raw = {}, { order = 0, strict = true } = {}) {
  const type = normalizeFieldType(raw.type || raw.fieldType);
  if (!type) {
    if (!strict) return null;
    const err = new Error(`Unsupported field type: ${raw.type || "(missing)"}.`);
    err.status = 400;
    err.code = "invalid_field_type";
    throw err;
  }
  let id = cleanText(raw.id || "", MAX_ID);
  if (!id) id = newFieldId("fld");
  if (!/^[a-zA-Z0-9._:-]+$/.test(id)) {
    if (!strict) id = newFieldId("fld");
    else {
      const err = new Error(`Invalid field id: ${id}`);
      err.status = 400;
      err.code = "invalid_field_id";
      throw err;
    }
  }
  const options = normalizeOptions(raw.options, type);
  if (CHOICE_TYPES.has(type) && options.length < 2) {
    const err = new Error(`${type} fields require at least 2 options.`);
    err.status = 400;
    err.code = "invalid_field_options";
    throw err;
  }
  const label = cleanText(raw.label || (type === "info" ? "Information" : "Field"), MAX_LABEL)
    || (type === "info" ? "Information" : "Field");
  return {
    id,
    type,
    label,
    helpText: cleanText(raw.helpText || raw.help || raw.description || "", MAX_HELP),
    required: type === "info" || type === "file" ? false : Boolean(raw.required),
    options,
    order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : Number(order) || 0,
    placeholder: cleanText(raw.placeholder || "", 160),
  };
}

function normalizeFormFields(rawFields, { strict = true } = {}) {
  const list = Array.isArray(rawFields) ? rawFields.slice(0, MAX_FIELDS) : [];
  const out = [];
  const ids = new Set();
  list.forEach((raw, index) => {
    const field = normalizeFormField(raw, { order: index, strict });
    if (!field) return;
    if (ids.has(field.id)) {
      const err = new Error(`Duplicate field id: ${field.id}`);
      err.status = 400;
      err.code = "duplicate_field_id";
      throw err;
    }
    ids.add(field.id);
    out.push(field);
  });
  return out
    .sort((a, b) => Number(a.order) - Number(b.order))
    .map((field, index) => ({ ...field, order: index }));
}

/** Validate AI-proposed structured draft (template-only — never invents roster records). */
function validateAiStructuredDraft(draft = {}, { strict = true } = {}) {
  const title = cleanText(draft.title || "", 160);
  const bodyText = cleanText(draft.bodyText || draft.body || draft.instructions || "", 20000);
  let fields = [];
  try {
    fields = normalizeFormFields(draft.fields || draft.structuredFields || [], { strict });
  } catch (error) {
    if (strict) throw error;
    fields = [];
  }
  if (!title && !bodyText && !fields.length) {
    const err = new Error("AI draft must include a title, instructions, or fields.");
    err.status = 400;
    err.code = "empty_ai_draft";
    throw err;
  }
  // Reject attempts to invent canonical records.
  if (draft.childId || draft.householdId || draft.assigneeEmail || draft.staffEmails || draft.childIds) {
    const err = new Error("AI drafts templates only and cannot invent child/family/staff records.");
    err.status = 400;
    err.code = "ai_invented_roster";
    throw err;
  }
  return {
    title: title || "Custom form",
    category: cleanText(draft.category || "Other", 80) || "Other",
    bodyText,
    body: bodyText,
    fields,
    requiresSignature: draft.requiresSignature !== false,
    fieldSchemaVersion: 1,
    source: "ai_structured_draft",
  };
}

/**
 * Best-effort parse of AI text that may include a fenced JSON block with fields.
 * Returns { bodyText, fields, meta } — never throws for parse failure.
 */
function extractStructuredDraftFromAiText(text = "") {
  const raw = String(text || "");
  let bodyText = raw;
  let fields = [];
  let meta = {};
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonCandidate = fence ? fence[1] : (raw.match(/\{[\s\S]*"fields"\s*:\s*\[[\s\S]*][\s\S]*\}/) || [])[0];
  if (jsonCandidate) {
    try {
      const parsed = JSON.parse(jsonCandidate);
      const validated = validateAiStructuredDraft(parsed, { strict: false });
      fields = validated.fields;
      meta = {
        title: validated.title,
        category: validated.category,
        requiresSignature: validated.requiresSignature,
      };
      if (validated.bodyText) bodyText = validated.bodyText;
      else bodyText = raw.replace(fence ? fence[0] : jsonCandidate, "").trim();
    } catch (_error) {
      fields = [];
    }
  }
  return { bodyText: cleanText(bodyText, 20000), fields, meta };
}

function fieldsFingerprint(fields = []) {
  try {
    return crypto.createHash("sha256").update(JSON.stringify(fields || [])).digest("hex");
  } catch (_error) {
    return "";
  }
}

function templateContentFingerprint({ body = "", fields = [] } = {}) {
  const bodyHash = crypto.createHash("sha256").update(String(body || "").trim()).digest("hex");
  return { bodyHash, fieldsHash: fieldsFingerprint(fields) };
}

module.exports = {
  FIELD_TYPES,
  CHOICE_TYPES,
  MAX_FIELDS,
  MAX_OPTIONS,
  FIELD_TYPE_ALIASES,
  cleanText,
  normalizeFieldType,
  newFieldId,
  normalizeFormField,
  normalizeFormFields,
  validateAiStructuredDraft,
  extractStructuredDraftFromAiText,
  fieldsFingerprint,
  templateContentFingerprint,
};
