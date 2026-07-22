/**
 * Review-and-safety analyzer for AI Form Builder suggestions.
 * Surfaces warnings before a provider saves a draft. Never claims legal
 * compliance. Never executes pasted instructions.
 */

const formsModel = require("./forms-center-data-model.js");

const SENSITIVE_PATTERNS = [
  { code: "sensitive_medical", label: "Sensitive medical content", pattern: /medic(?:ation|ine)|allerg(?:y|ies)|diagnos|dosage|physician|insurance|injury|illness|seizure/i },
  { code: "sensitive_custody", label: "Sensitive custody / access content", pattern: /custody|restraining\s*order|court\s*order|parenting\s*plan|supervised\s*visit/i },
  { code: "sensitive_financial", label: "Sensitive financial content", pattern: /tuition|payment|bank|routing|credit\s*card|ssn|social\s*security|fee|invoice/i },
  { code: "sensitive_legal", label: "Sensitive legal content", pattern: /liability|waiver|indemnif|attorney|legal\s*guardian|lawsuit|hold\s*harmless/i },
];

const STATE_SPECIFIC_PATTERN = /\b(georgia|oklahoma|texas|florida|california|new\s*york|licensing\s*rule|state\s*regulation|DHR|DFCS|DCF)\b/i;

function listFields(suggestion) {
  const rows = [];
  (suggestion.sections || []).forEach((section, sectionIndex) => {
    (section.fields || []).forEach((field, fieldIndex) => {
      rows.push({ section, sectionIndex, field, fieldIndex });
    });
  });
  return rows;
}

function buildReview(suggestion = {}, input = {}) {
  const warnings = [];
  const recommendations = [];
  const fields = listFields(suggestion);
  const sourceText = `${input.prompt || ""}\n${input.pastedText || ""}\n${suggestion.title || ""}\n${suggestion.description || ""}`;

  if (!suggestion.title || suggestion.title === "Untitled Form" || suggestion.title.length < 4) {
    warnings.push({ code: "missing_title", severity: "high", message: "The suggested title is missing or too vague. Add a clear form title before saving." });
  }
  if (!(suggestion.sections || []).length) {
    warnings.push({ code: "missing_sections", severity: "high", message: "No sections were generated. Add at least one section before saving." });
  }
  if (!fields.length) {
    warnings.push({ code: "missing_fields", severity: "high", message: "No fields were generated. Add the questions your form needs before saving." });
  }
  if ((suggestion.description || "").trim().length < 12) {
    warnings.push({ code: "unclear_description", severity: "medium", message: "The form description is unclear or missing. Families and staff benefit from a short purpose statement." });
  }

  const labels = fields.map((row) => String(row.field.label || "").trim().toLowerCase()).filter(Boolean);
  const seen = new Map();
  labels.forEach((label) => {
    seen.set(label, (seen.get(label) || 0) + 1);
  });
  [...seen.entries()].filter(([, count]) => count > 1).forEach(([label]) => {
    warnings.push({ code: "possible_duplicate", severity: "medium", message: `Possible duplicate question: “${label}”. Consider combining or clarifying these fields.` });
  });

  fields.filter((row) => (row.field.confidence ?? 1) < 0.7).forEach((row) => {
    warnings.push({
      code: "low_confidence_field",
      severity: "medium",
      message: `“${row.field.label || "A field"}” could not be confidently categorized. Review the field type and wording before saving.`,
      fieldLabel: row.field.label || "",
    });
  });

  SENSITIVE_PATTERNS.forEach((entry) => {
    if (entry.pattern.test(sourceText) || fields.some((row) => entry.pattern.test(`${row.field.label} ${row.field.helpText || ""}`))) {
      warnings.push({
        code: entry.code,
        severity: "high",
        message: `${entry.label} was detected. Review carefully and confirm your program’s policies and licensing requirements before publishing.`,
      });
    }
  });

  if (STATE_SPECIFIC_PATTERN.test(sourceText)) {
    warnings.push({
      code: "state_specific_language",
      severity: "high",
      message: "State-specific language was detected. This draft is not labeled as compliant with any state. Confirm the wording with your licensing rules before use.",
    });
  }

  const hasSignature = fields.some((row) => row.field.type === formsModel.FIELD_TYPES.SIGNATURE_PARENT || row.field.type === formsModel.FIELD_TYPES.SIGNATURE_PROVIDER);
  const hasAck = fields.some((row) => row.field.type === formsModel.FIELD_TYPES.ACKNOWLEDGMENT);
  const hasInitials = fields.some((row) => row.field.type === formsModel.FIELD_TYPES.INITIALS);

  if (!hasSignature && input.requestOptions?.signatures !== false) {
    recommendations.push({ code: "recommend_signature", message: "Consider adding a parent/guardian or provider signature field before publishing." });
  }
  if (!hasAck && /permission|authoriz|agree|acknowledg|policy|handbook|consent/i.test(sourceText)) {
    recommendations.push({ code: "recommend_acknowledgment", message: "This looks like a permission or agreement form. Consider adding an acknowledgment checkbox." });
  }
  if (!hasInitials && input.requestOptions?.initials === true) {
    recommendations.push({ code: "recommend_initials", message: "You asked for initials — confirm an initials field is present and required where needed." });
  }
  if (!suggestion.reviewReminder) {
    recommendations.push({ code: "recommend_review_reminder", message: "Add a review reminder so your team knows when to revisit this form." });
  }

  warnings.push({
    code: "provider_responsibility",
    severity: "info",
    message: "You are responsible for verifying licensing and legal requirements before using this form. An AI-generated draft is never a guarantee of legal or licensing compliance.",
  });

  return {
    warningCount: warnings.filter((row) => row.severity !== "info").length,
    highSeverityCount: warnings.filter((row) => row.severity === "high").length,
    warnings,
    recommendations,
    legalReminder: "Never treat an AI-generated form as legally compliant. Review and customize it for your program, families, and state licensing requirements before publishing.",
    compare: {
      originalPrompt: input.prompt || suggestion.originalPrompt || "",
      originalPastedText: input.pastedText || suggestion.originalPastedText || "",
      generatedTitle: suggestion.title || "",
      generatedSectionCount: (suggestion.sections || []).length,
      generatedFieldCount: fields.length,
    },
  };
}

module.exports = {
  buildReview,
};
