/**
 * Canonical learning-domain labels for curriculum lesson plans.
 * Single source of truth for editor, API, import parser, and Operator composer.
 */
"use strict";

const CURRICULUM_LEARNING_DOMAINS = Object.freeze([
  "Social Emotional",
  "Language & Literacy",
  "Math",
  "Science",
  "Physical Development",
  "Creative Arts",
]);

const CURRICULUM_LEARNING_DOMAINS_SET = new Set(CURRICULUM_LEARNING_DOMAINS);

const LEARNING_DOMAIN_ALIASES = Object.freeze({
  "fine motor": "Physical Development",
  "gross motor": "Physical Development",
  physical: "Physical Development",
  "physical development": "Physical Development",
  motor: "Physical Development",
  "motor development": "Physical Development",
  literacy: "Language & Literacy",
  language: "Language & Literacy",
  "language and literacy": "Language & Literacy",
  "language & literacy": "Language & Literacy",
  "language + literacy": "Language & Literacy",
  social: "Social Emotional",
  "social-emotional": "Social Emotional",
  "social emotional": "Social Emotional",
  "social emotional development": "Social Emotional",
  sel: "Social Emotional",
  art: "Creative Arts",
  arts: "Creative Arts",
  creative: "Creative Arts",
  "creative arts": "Creative Arts",
  maths: "Math",
  mathematics: "Math",
  math: "Math",
  science: "Science",
});

function normalizedShortText(value, max = 240) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function resolveLearningDomainLabel(raw) {
  const item = normalizedShortText(raw, 80);
  if (!item) return null;
  const lower = item.toLowerCase();
  const exact = CURRICULUM_LEARNING_DOMAINS.find((domain) => domain.toLowerCase() === lower);
  if (exact) return exact;
  if (LEARNING_DOMAIN_ALIASES[lower]) return LEARNING_DOMAIN_ALIASES[lower];
  const stripped = lower.replace(/\s+(development|skills)\s*$/, "").trim();
  if (LEARNING_DOMAIN_ALIASES[stripped]) return LEARNING_DOMAIN_ALIASES[stripped];
  const strippedExact = CURRICULUM_LEARNING_DOMAINS.find((domain) => domain.toLowerCase() === stripped);
  if (strippedExact) return strippedExact;
  return null;
}

function normalizeLearningDomainsInput(value) {
  if (value == null) return [];
  if (typeof value === "string") {
    return value.split(/[,;\n·|]/).map((part) => normalizedShortText(part, 80)).filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizedShortText(item, 80)).filter(Boolean);
  }
  if (typeof value === "object") {
    return { __invalidType: "object", raw: value };
  }
  return [normalizedShortText(value, 80)].filter(Boolean);
}

/**
 * Normalize learningDomains with safe alias mapping and canonical ordering.
 * Returns { ok, value, received, rejected, unknown, repairable, error }.
 */
function normalizeLearningDomainsValue(value, options = {}) {
  const { allowEmpty = false } = options;
  const rawInput = normalizeLearningDomainsInput(value);
  if (rawInput && typeof rawInput === "object" && rawInput.__invalidType) {
    return {
      ok: false,
      value: [],
      received: rawInput.raw,
      rejected: ["[invalid type: object]"],
      unknown: ["[invalid type: object]"],
      repairable: false,
      error: "learningDomains must be an array of approved domain labels",
    };
  }

  const received = rawInput;
  const seen = new Set();
  const rejected = [];
  const unknown = [];
  received.forEach((item) => {
    const resolved = resolveLearningDomainLabel(item);
    if (!resolved) {
      rejected.push(item);
      unknown.push(item);
      return;
    }
    seen.add(resolved);
  });

  const ordered = CURRICULUM_LEARNING_DOMAINS.filter((domain) => seen.has(domain));
  if (!ordered.length) {
    const isEmpty = received.length === 0;
    const allUnknown = received.length > 0 && unknown.length === received.length;
    return {
      ok: allowEmpty,
      value: [],
      received,
      rejected,
      unknown,
      repairable: isEmpty && !allowEmpty,
      error: isEmpty
        ? "learningDomains must include at least one approved domain"
        : (allUnknown
          ? `learningDomains contains unsupported value(s): ${unknown.slice(0, 3).join(", ")}`
          : "learningDomains must include at least one approved domain"),
    };
  }

  return {
    ok: true,
    value: ordered.slice(0, 6),
    received,
    rejected,
    unknown,
    repairable: false,
    error: null,
  };
}

function parseLearningDomainsList(textValue) {
  return normalizeLearningDomainsValue(textValue, { allowEmpty: true }).value;
}

function formatLearningDomainsValidationError(norm, context = {}) {
  return {
    field: "learningDomains",
    message: norm.error || "learningDomains must include at least one approved domain",
    received: Array.isArray(norm.received) ? norm.received.slice(0, 8) : norm.received,
    rejected: (norm.rejected || []).slice(0, 8),
    allowed: [...CURRICULUM_LEARNING_DOMAINS],
    stage: context.stage || "composer_validation",
    repairAttempted: context.repairAttempted === true,
  };
}

function learningDomainsErrorMessage(norm, context = {}) {
  return JSON.stringify(formatLearningDomainsValidationError(norm, context));
}

module.exports = {
  CURRICULUM_LEARNING_DOMAINS,
  CURRICULUM_LEARNING_DOMAINS_SET,
  LEARNING_DOMAIN_ALIASES,
  resolveLearningDomainLabel,
  normalizeLearningDomainsValue,
  parseLearningDomainsList,
  formatLearningDomainsValidationError,
  learningDomainsErrorMessage,
};
