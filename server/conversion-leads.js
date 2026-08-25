/**
 * Phase 2B — Owner-only conversion lead workflow (status, notes, reasons).
 * Additive persistence on store.conversionLeads (JSON blob). No Postgres schema.
 * Owner status never fabricates authoritative paid conversion.
 */

const crypto = require("node:crypto");

/** @typedef {"new"|"activated"|"high_intent"|"follow_up"|"contacted"|"considering"|"not_ready"|"converted"|"lost"} ConversionLeadStatus */

/** @typedef {"price"|"not_enough_value"|"needs_different_age_group"|"needs_specific_content"|"hard_to_use"|"prefers_current_method"|"director_approval"|"center_budget"|"not_ready_yet"|"technical_issue"|"just_browsing"|"other"} NonBuyerReason */

/** @readonly */
const LEAD_STATUSES = Object.freeze([
  "new",
  "activated",
  "high_intent",
  "follow_up",
  "contacted",
  "considering",
  "not_ready",
  "converted",
  "lost",
]);

/** @readonly */
const NON_BUYER_REASONS = Object.freeze([
  "price",
  "not_enough_value",
  "needs_different_age_group",
  "needs_specific_content",
  "hard_to_use",
  "prefers_current_method",
  "director_approval",
  "center_budget",
  "not_ready_yet",
  "technical_issue",
  "just_browsing",
  "other",
]);

/** Owner-facing labels for non-buyer reason keys (display only). */
const REASON_DISPLAY_LABELS = Object.freeze({
  price: "Too expensive",
  not_enough_value: "Not enough value",
  needs_different_age_group: "Needs different age group",
  needs_specific_content: "Needs more lesson plans",
  hard_to_use: "Hard to use",
  prefers_current_method: "Prefers current method",
  director_approval: "Director approval needed",
  center_budget: "Center budget",
  not_ready_yet: "Not ready yet",
  technical_issue: "Technical issue",
  just_browsing: "Just looking",
  other: "Other",
});

/** Owner-facing labels for lead status keys (display only). */
const STATUS_DISPLAY_LABELS = Object.freeze({
  new: "New signup",
  activated: "Activated",
  high_intent: "High purchase intent",
  follow_up: "Follow-up",
  contacted: "Contacted",
  considering: "Considering",
  not_ready: "Not ready",
  converted: "Converted",
  lost: "Lost",
});

const NOTE_MAX_LENGTH = 2000;
const REASON_CONTEXT_MAX_LENGTH = 1000;
const NOTES_HISTORY_CAP = 100;
const REASONS_HISTORY_CAP = 50;

/**
 * @param {string} value
 */
function normalizeEmail(value = "") {
  return String(value || "").trim().toLowerCase();
}

/**
 * Strip HTML / control chars; trim; enforce length.
 * @param {unknown} raw
 * @param {number} [maxLen]
 * @returns {string}
 */
function sanitizeOwnerText(raw, maxLen = NOTE_MAX_LENGTH) {
  let text = String(raw == null ? "" : raw);
  text = text.replace(/<[^>]*>/g, " ");
  text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  text = text.replace(/\s+/g, " ").trim();
  if (text.length > maxLen) text = text.slice(0, maxLen);
  return text;
}

/**
 * @param {unknown} status
 * @returns {status is ConversionLeadStatus}
 */
function isValidLeadStatus(status) {
  return LEAD_STATUSES.includes(/** @type {ConversionLeadStatus} */ (String(status || "")));
}

/**
 * @param {unknown} reason
 * @returns {reason is NonBuyerReason}
 */
function isValidNonBuyerReason(reason) {
  return NON_BUYER_REASONS.includes(/** @type {NonBuyerReason} */ (String(reason || "")));
}

/**
 * Owner-facing label for a reason key (display only).
 * @param {string} reason
 */
function reasonDisplayLabel(reason) {
  const key = String(reason || "").trim();
  if (!key) return "";
  return REASON_DISPLAY_LABELS[key] || key;
}

/**
 * Owner-facing label for a lead status key (display only).
 * @param {string} status
 */
function leadStatusDisplayLabel(status) {
  const key = String(status || "").trim();
  if (!key) return "";
  return STATUS_DISPLAY_LABELS[key] || key;
}

/**
 * Read-only roll-up of owner-entered non-buyer reasons (latest per lead).
 * Does not infer reasons — only counts explicitly captured owner reasons.
 * @param {Record<string, unknown>} store
 */
function buildOwnerReasonFrequency(store) {
  const map = ensureConversionLeadsStore(store);
  /** @type {Map<string, number>} */
  const counts = new Map();

  for (const lead of Object.values(map)) {
    if (!lead || typeof lead !== "object") continue;
    const reasons = Array.isArray(lead.reasons) ? lead.reasons : [];
    if (!reasons.length) continue;
    const latest = reasons[reasons.length - 1];
    const key = String(latest?.reason || "").trim();
    if (!key || !isValidNonBuyerReason(key)) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return [...counts.entries()]
    .map(([reason, count]) => ({
      reason,
      label: reasonDisplayLabel(reason),
      count,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/**
 * Ensure additive conversionLeads map exists on store (mutates).
 * @param {Record<string, unknown>} store
 * @returns {Record<string, Record<string, unknown>>}
 */
function ensureConversionLeadsStore(store) {
  if (!store || typeof store !== "object") return {};
  if (!store.conversionLeads || typeof store.conversionLeads !== "object" || Array.isArray(store.conversionLeads)) {
    store.conversionLeads = {};
  }
  return /** @type {Record<string, Record<string, unknown>>} */ (store.conversionLeads);
}

/**
 * @param {Record<string, unknown>} store
 * @param {string} email
 * @returns {Record<string, unknown>|null}
 */
function getConversionLead(store, email) {
  const key = normalizeEmail(email);
  if (!key) return null;
  const map = ensureConversionLeadsStore(store);
  const lead = map[key];
  return lead && typeof lead === "object" ? lead : null;
}

/**
 * @param {Record<string, unknown>} store
 * @param {string} email
 * @returns {Record<string, unknown>}
 */
function ensureLeadRecord(store, email) {
  const key = normalizeEmail(email);
  const map = ensureConversionLeadsStore(store);
  if (!map[key] || typeof map[key] !== "object") {
    map[key] = {
      email: key,
      status: "",
      statusUpdatedAt: "",
      statusUpdatedBy: "",
      notes: [],
      reasons: [],
      updatedAt: new Date().toISOString(),
    };
  }
  return map[key];
}

/**
 * Deterministic derived status from analytics + authoritative paid — never from owner alone.
 * @param {{ converted?: boolean, activated?: boolean, intentLevel?: string, categories?: string[] }} profileOrRow
 * @returns {ConversionLeadStatus}
 */
function deriveLeadStatus(profileOrRow = {}) {
  if (profileOrRow.converted) return "converted";
  const categories = Array.isArray(profileOrRow.categories) ? profileOrRow.categories : [];
  if (profileOrRow.intentLevel === "High purchase intent" || categories.includes("Highly engaged free user")) {
    return "high_intent";
  }
  if (profileOrRow.activated) return "activated";
  return "new";
}

/**
 * Owner status supplements derived; never overrides authoritative paid for "converted" facts.
 * @param {ConversionLeadStatus|string} derived
 * @param {string} [ownerStatus]
 * @param {boolean} [authoritativePaid]
 */
function resolveEffectiveStatus(derived, ownerStatus = "", authoritativePaid = false) {
  if (authoritativePaid) return "converted";
  if (ownerStatus && isValidLeadStatus(ownerStatus)) {
    // Owner may label "converted" but billing remains authoritative elsewhere.
    return /** @type {ConversionLeadStatus} */ (ownerStatus);
  }
  return /** @type {ConversionLeadStatus} */ (derived || "new");
}

/**
 * @param {Record<string, unknown>} store
 * @param {string} email
 * @param {string} status
 * @param {string} [by]
 */
function setLeadStatus(store, email, status, by = "") {
  if (!isValidLeadStatus(status)) {
    const err = new Error("Invalid conversion lead status.");
    // @ts-ignore
    err.code = "invalid_lead_status";
    throw err;
  }
  const lead = ensureLeadRecord(store, email);
  const now = new Date().toISOString();
  lead.status = status;
  lead.statusUpdatedAt = now;
  lead.statusUpdatedBy = normalizeEmail(by) || "owner";
  lead.updatedAt = now;
  return publicLead(lead);
}

/**
 * Append timestamped note (history preserved).
 * @param {Record<string, unknown>} store
 * @param {string} email
 * @param {unknown} noteText
 * @param {string} [by]
 */
function addLeadNote(store, email, noteText, by = "") {
  const text = sanitizeOwnerText(noteText, NOTE_MAX_LENGTH);
  if (!text) {
    const err = new Error("Note text is required.");
    // @ts-ignore
    err.code = "invalid_note";
    throw err;
  }
  const lead = ensureLeadRecord(store, email);
  if (!Array.isArray(lead.notes)) lead.notes = [];
  /** @type {Array<Record<string, string>>} */
  const notes = /** @type {Array<Record<string, string>>} */ (lead.notes);
  notes.push({
    id: `note_${crypto.randomBytes(6).toString("hex")}`,
    text,
    createdAt: new Date().toISOString(),
    createdBy: normalizeEmail(by) || "owner",
  });
  if (notes.length > NOTES_HISTORY_CAP) {
    lead.notes = notes.slice(-NOTES_HISTORY_CAP);
  }
  lead.updatedAt = new Date().toISOString();
  return publicLead(lead);
}

/**
 * Append structured non-buyer reason (history preserved).
 * @param {Record<string, unknown>} store
 * @param {string} email
 * @param {string} reason
 * @param {unknown} [context]
 * @param {string} [by]
 */
function addLeadReason(store, email, reason, context = "", by = "") {
  if (!isValidNonBuyerReason(reason)) {
    const err = new Error("Invalid non-buyer reason.");
    // @ts-ignore
    err.code = "invalid_reason";
    throw err;
  }
  const lead = ensureLeadRecord(store, email);
  if (!Array.isArray(lead.reasons)) lead.reasons = [];
  /** @type {Array<Record<string, string>>} */
  const reasons = /** @type {Array<Record<string, string>>} */ (lead.reasons);
  reasons.push({
    id: `reason_${crypto.randomBytes(6).toString("hex")}`,
    reason: String(reason),
    context: sanitizeOwnerText(context, REASON_CONTEXT_MAX_LENGTH),
    createdAt: new Date().toISOString(),
    createdBy: normalizeEmail(by) || "owner",
  });
  if (reasons.length > REASONS_HISTORY_CAP) {
    lead.reasons = reasons.slice(-REASONS_HISTORY_CAP);
  }
  lead.updatedAt = new Date().toISOString();
  return publicLead(lead);
}

/**
 * Safe public shape for admin API (no customer exposure).
 * @param {Record<string, unknown>|null} lead
 */
function publicLead(lead) {
  if (!lead || typeof lead !== "object") {
    return {
      email: "",
      status: "",
      statusUpdatedAt: "",
      statusUpdatedBy: "",
      notes: [],
      reasons: [],
      latestNote: null,
      latestReason: null,
      updatedAt: "",
    };
  }
  const notes = Array.isArray(lead.notes) ? lead.notes : [];
  const reasons = Array.isArray(lead.reasons) ? lead.reasons : [];
  const latestNote = notes.length ? notes[notes.length - 1] : null;
  const latestReason = reasons.length ? reasons[reasons.length - 1] : null;
  return {
    email: String(lead.email || ""),
    status: String(lead.status || ""),
    statusUpdatedAt: String(lead.statusUpdatedAt || ""),
    statusUpdatedBy: String(lead.statusUpdatedBy || ""),
    notes: notes.map((n) => ({
      id: String(n.id || ""),
      text: String(n.text || ""),
      createdAt: String(n.createdAt || ""),
      createdBy: String(n.createdBy || ""),
    })),
    reasons: reasons.map((r) => ({
      id: String(r.id || ""),
      reason: String(r.reason || ""),
      context: String(r.context || ""),
      createdAt: String(r.createdAt || ""),
      createdBy: String(r.createdBy || ""),
    })),
    latestNote: latestNote
      ? {
          id: String(latestNote.id || ""),
          text: String(latestNote.text || ""),
          createdAt: String(latestNote.createdAt || ""),
          createdBy: String(latestNote.createdBy || ""),
        }
      : null,
    latestReason: latestReason
      ? {
          id: String(latestReason.id || ""),
          reason: String(latestReason.reason || ""),
          context: String(latestReason.context || ""),
          createdAt: String(latestReason.createdAt || ""),
          createdBy: String(latestReason.createdBy || ""),
        }
      : null,
    updatedAt: String(lead.updatedAt || ""),
  };
}

/**
 * Enrich a high-intent queue row with owner lead fields + action context.
 * @param {Record<string, unknown>} row
 * @param {Record<string, unknown>|null} profile
 * @param {Record<string, unknown>|null} lead
 * @param {boolean} authoritativePaid
 */
function enrichQueueRow(row, profile, lead, authoritativePaid) {
  const pub = publicLead(lead);
  const derivedStatus = deriveLeadStatus({
    converted: authoritativePaid || Boolean(row.converted || profile?.converted),
    activated: Boolean(profile?.activated ?? row.activated),
    intentLevel: String(row.intentLevel || ""),
    categories: /** @type {string[]} */ (row.categories || []),
  });
  const ownerStatus = String(pub.status || "");
  const effectiveStatus = resolveEffectiveStatus(derivedStatus, ownerStatus, authoritativePaid);
  const ageGroups = profile?.ageGroups instanceof Set
    ? [...profile.ageGroups]
    : Array.isArray(profile?.ageGroups)
      ? profile.ageGroups
      : [];
  const firstTouch = /** @type {Record<string, string>} */ (profile?.firstTouch || {});
  const latestLessons = [];
  for (const ev of /** @type {Array<unknown>} */ (profile?.events || []).slice().reverse()) {
    const name = String(/** @type {{ name?: string }} */ (ev).name || "");
    if (name !== "lesson_viewed" && name !== "activity_viewed") continue;
    const detail = /** @type {{ detail?: Record<string, string> }} */ (ev).detail || {};
    const title = String(detail.title || detail.lessonTitle || detail.resourceId || detail.lessonId || "").slice(0, 80);
    if (title) latestLessons.push(title);
    if (latestLessons.length >= 3) break;
  }

  return {
    ...row,
    // OBSERVED / DERIVED fields labeled in UI
    activated: Boolean(profile?.activated),
    activatedAt: String(profile?.activatedAt || "").slice(0, 16).replace("T", " ") || "—",
    persona: String(profile?.persona || "unknown"),
    ageGroups: ageGroups.length ? ageGroups : ["Unknown"],
    proEncounters: Number(profile?.proEncounters || row.proEncounters || 0),
    ctaImpressions: Number(profile?.ctaImpressions || 0),
    offer: String(profile?.billingOffer || row.offer || "unknown"),
    campaign: String(firstTouch.campaign || "Unknown"),
    content: String(firstTouch.content || "Unknown"),
    medium: String(firstTouch.medium || "Unknown"),
    paidAuthoritative: Boolean(authoritativePaid),
    paidFreeLabel: authoritativePaid ? "Paid (authoritative)" : "Free / unpaid",
    recentLessons: latestLessons,
    derivedStatus,
    ownerStatus: ownerStatus || "",
    effectiveStatus,
    leadStatus: effectiveStatus,
    capturedReason: pub.latestReason ? pub.latestReason.reason : "",
    capturedReasonContext: pub.latestReason ? pub.latestReason.context : "",
    latestNotePreview: pub.latestNote ? String(pub.latestNote.text).slice(0, 120) : "",
    latestNoteAt: pub.latestNote ? String(pub.latestNote.createdAt).slice(0, 16).replace("T", " ") : "",
    notesCount: pub.notes.length,
    reasonsCount: pub.reasons.length,
  };
}

/**
 * Build owner action queue from profiles + high-intent rows + leads.
 * Includes high-intent unpaid and optionally activated unpaid / checkout unpaid for workflow.
 * @param {Map<string, Record<string, unknown>>} profiles
 * @param {Array<Record<string, unknown>>} highIntentQueue
 * @param {Record<string, unknown>} store
 * @param {(user: Record<string, unknown>) => boolean} isPaidFn
 * @param {Record<string, Record<string, unknown>>} usersByEmail
 */
function buildOwnerActionQueue(profiles, highIntentQueue, store, isPaidFn, usersByEmail) {
  /** @type {Map<string, Record<string, unknown>>} */
  const byEmail = new Map();

  for (const row of highIntentQueue || []) {
    const email = normalizeEmail(String(row.email || ""));
    if (!email) continue;
    byEmail.set(email, { ...row, email });
  }

  // Surface activated/checkout/high-signal unpaid, plus authoritative paid (for honest converted filter).
  for (const profile of profiles.values()) {
    const email = normalizeEmail(String(profile.email || ""));
    if (!email) continue;
    const user = usersByEmail[email];
    const paid = user && typeof isPaidFn === "function" ? isPaidFn(user) : Boolean(profile.converted);
    const worth = paid
      || Boolean(profile.activated)
      || Number(profile.checkoutStarts) > 0
      || Number(profile.pricingViews) >= 2
      || Number(profile.proEncounters) >= 2
      || Boolean(getConversionLead(store, email));
    if (!worth && !byEmail.has(email)) continue;
    if (!byEmail.has(email)) {
      byEmail.set(email, {
        user: String(email).replace(/(.{2}).+(@.+)/, "$1…$2"),
        email,
        signupDate: String(profile.signupAt || "").slice(0, 10) || "—",
        source: profile.source || "Unknown",
        categories: paid ? ["Authoritative paid"] : [],
        intentLevel: paid ? "Converted" : "Low engagement",
        intentScore: 0,
        sessions: profile.sessions instanceof Set ? profile.sessions.size : Number(profile.sessions) || 0,
        lessonsViewed: Number(profile.lessonViews) || 0,
        pricingViews: Number(profile.pricingViews) || 0,
        upgradeClicks: Number(profile.upgradeClicks) || 0,
        checkoutStarted: Number(profile.checkoutStarts) > 0 ? "Yes" : "No",
        lastActive: String(profile.lastActive || "").slice(0, 16).replace("T", " ") || "—",
      });
    }
  }

  const rows = [];
  for (const [email, row] of byEmail) {
    const profile = [...profiles.values()].find((p) => normalizeEmail(String(p.email || "")) === email) || null;
    const user = usersByEmail[email] || null;
    const paid = user && typeof isPaidFn === "function" ? isPaidFn(user) : Boolean(profile?.converted);
    const lead = getConversionLead(store, email);
    rows.push(enrichQueueRow(row, profile, lead, paid));
  }

  return rows.sort((a, b) => {
    if (a.paidAuthoritative !== b.paidAuthoritative) return a.paidAuthoritative ? 1 : -1;
    return (Number(b.intentScore) || 0) - (Number(a.intentScore) || 0)
      || (Array.isArray(b.categories) ? b.categories.length : 0) - (Array.isArray(a.categories) ? a.categories.length : 0)
      || String(b.lastActive || "").localeCompare(String(a.lastActive || ""));
  });
}

/**
 * @param {Array<Record<string, unknown>>} rows
 * @param {Record<string, string>} filters
 */
function filterOwnerActionQueue(rows, filters = {}) {
  const activated = String(filters.activated || "all");
  const highIntent = String(filters.highIntent || "all");
  const persona = String(filters.persona || "all");
  const ageGroup = String(filters.ageGroup || "all");
  const source = String(filters.source || filters.campaign || "all");
  const offer = String(filters.offer || "all");
  const leadStatus = String(filters.leadStatus || filters.status || "all");
  const reason = String(filters.reason || "all");
  const cohort = String(filters.cohort || filters.signupCohort || "all");
  const converted = String(filters.converted || "all");

  return (rows || []).filter((row) => {
    if (activated === "activated" && !row.activated) return false;
    if (activated === "non_activated" && row.activated) return false;
    if (highIntent === "yes" || highIntent === "high") {
      if (row.intentLevel !== "High purchase intent" && !(Array.isArray(row.categories) && row.categories.includes("Highly engaged free user"))) {
        return false;
      }
    }
    if (persona !== "all" && String(row.persona || "") !== persona) return false;
    if (ageGroup !== "all") {
      const groups = Array.isArray(row.ageGroups) ? row.ageGroups.map(String) : [];
      if (!groups.includes(ageGroup)) return false;
    }
    if (source !== "all") {
      const src = String(row.source || "");
      const camp = String(row.campaign || "");
      if (src !== source && camp !== source) return false;
    }
    if (offer !== "all" && String(row.offer || "unknown") !== offer) return false;
    if (leadStatus !== "all" && String(row.effectiveStatus || row.leadStatus || "") !== leadStatus) return false;
    if (reason !== "all" && String(row.capturedReason || "") !== reason) return false;
    if (cohort !== "all" && String(row.signupDate || "") !== cohort) return false;
    if (converted === "converted" && !row.paidAuthoritative) return false;
    if (converted === "not_converted" && row.paidAuthoritative) return false;
    return true;
  });
}

/**
 * Actionable summary counts — vanity metrics avoided.
 * @param {Array<Record<string, unknown>>} queueRows
 * @param {Map<string, Record<string, unknown>>} profiles
 */
function buildOwnerWorkflowSummary(queueRows, profiles) {
  let highIntentUnpaid = 0;
  let activatedUnpaid = 0;
  let checkoutStartedUnpaid = 0;
  let followUp = 0;
  let contacted = 0;
  let considering = 0;
  let lost = 0;
  let convertedAuthoritative = 0;

  for (const p of profiles.values()) {
    if (p.converted) {
      convertedAuthoritative += 1;
      continue;
    }
    if (p.activated) activatedUnpaid += 1;
    if (Number(p.checkoutStarts) > 0) checkoutStartedUnpaid += 1;
  }

  for (const row of queueRows || []) {
    if (!row.paidAuthoritative && (row.intentLevel === "High purchase intent"
      || (Array.isArray(row.categories) && row.categories.includes("Highly engaged free user")))) {
      highIntentUnpaid += 1;
    }
    const st = String(row.ownerStatus || row.effectiveStatus || "");
    if (st === "follow_up") followUp += 1;
    if (st === "contacted") contacted += 1;
    if (st === "considering") considering += 1;
    if (st === "lost") lost += 1;
  }

  return {
    highIntentUnpaid,
    activatedUnpaid,
    checkoutStartedUnpaid,
    followUp,
    contacted,
    considering,
    lost,
    converted: convertedAuthoritative,
    note: "converted count uses authoritative billing/membership — owner status cannot fabricate paid conversion.",
  };
}

/**
 * Detail view: OBSERVED / DERIVED / OWNER ENTERED clearly separated.
 * @param {string} email
 * @param {Map<string, Record<string, unknown>>} profiles
 * @param {Array<unknown>} events
 * @param {Record<string, unknown>} store
 * @param {(email: string, events: Array<unknown>) => Record<string, unknown>} buildJourneyFn
 * @param {boolean} authoritativePaid
 */
function buildConversionLeadDetail(email, profiles, events, store, buildJourneyFn, authoritativePaid) {
  const key = normalizeEmail(email);
  const profile = [...profiles.values()].find((p) => normalizeEmail(String(p.email || "")) === key) || null;
  const lead = publicLead(getConversionLead(store, key));
  const journey = typeof buildJourneyFn === "function" ? buildJourneyFn(key, events) : { timeline: [] };
  const derivedStatus = deriveLeadStatus({
    converted: authoritativePaid,
    activated: Boolean(profile?.activated),
    intentLevel: "",
    categories: [],
  });

  return {
    emailMasked: key ? key.replace(/(.{2}).+(@.+)/, "$1…$2") : "—",
    email: key,
    layers: {
      observed: {
        label: "What happened",
        description: "Actual events and account fields from analytics/store.",
        signupAt: String(profile?.signupAt || "").slice(0, 19) || "—",
        lastActive: String(profile?.lastActive || "").slice(0, 19) || "—",
        source: String(profile?.source || "Unknown"),
        firstTouch: profile?.firstTouch || null,
        lessonViews: Number(profile?.lessonViews || 0),
        activityViews: Number(profile?.activityViews || 0),
        proEncounters: Number(profile?.proEncounters || 0),
        pricingViews: Number(profile?.pricingViews || 0),
        upgradeClicks: Number(profile?.upgradeClicks || 0),
        checkoutStarts: Number(profile?.checkoutStarts || 0),
        timeline: Array.isArray(journey?.timeline) ? journey.timeline : [],
      },
      derived: {
        label: "What the system suggests",
        description: "Deterministic classifications from events (not causal claims).",
        activated: Boolean(profile?.activated),
        activatedAt: String(profile?.activatedAt || "") || "",
        persona: String(profile?.persona || "unknown"),
        derivedStatus,
        paidAuthoritative: Boolean(authoritativePaid),
        associationNote: "Lesson → purchase figures are pre-purchase association (not causal).",
      },
      ownerEntered: {
        label: "What you recorded",
        description: "Owner-only status, notes, and non-buyer reasons. Never invents paid conversion.",
        status: lead.status || "",
        statusUpdatedAt: lead.statusUpdatedAt || "",
        notes: lead.notes,
        reasons: lead.reasons,
        effectiveStatus: resolveEffectiveStatus(derivedStatus, lead.status, authoritativePaid),
      },
    },
    lead,
  };
}

/**
 * Lost-user workflow groups for Owner (analysis only — no auto-contact).
 * @param {{ segments?: Array<{ id: string, label: string, count: number, users?: unknown[] }> }} lostUsers
 */
function buildLostUserWorkflow(lostUsers) {
  const segs = Array.isArray(lostUsers?.segments) ? lostUsers.segments : [];
  const byId = Object.fromEntries(segs.map((s) => [s.id, s]));
  return {
    note: "Analysis/workflow only — do not auto-contact. Maturity guards apply.",
    groups: [
      {
        id: "signup_never_activated",
        label: "Signup but never activated",
        count: byId.never_meaningful_use?.count || 0,
        users: byId.never_meaningful_use?.users || [],
      },
      {
        id: "activated_then_disappeared",
        label: "Activated then disappeared",
        count: (byId.activated_never_returned?.count || 0) + (byId.returned_then_disappeared?.count || 0),
        users: [
          ...(byId.activated_never_returned?.users || []),
          ...(byId.returned_then_disappeared?.users || []),
        ].slice(0, 25),
      },
      {
        id: "engaged_never_checkout",
        label: "Engaged heavily but never started checkout",
        count: byId.high_engagement_never_purchased?.count || 0,
        users: byId.high_engagement_never_purchased?.users || [],
      },
      {
        id: "checkout_not_paid",
        label: "Checkout started but not paid",
        count: byId.checkout_no_completion?.count || 0,
        users: byId.checkout_no_completion?.users || [],
      },
      {
        id: "previously_paid_ended",
        label: "Previously paid, ended",
        count: byId.previously_paid_ended?.count || 0,
        users: byId.previously_paid_ended?.users || [],
      },
    ],
  };
}

module.exports = {
  LEAD_STATUSES,
  NON_BUYER_REASONS,
  NOTE_MAX_LENGTH,
  REASON_CONTEXT_MAX_LENGTH,
  normalizeEmail,
  sanitizeOwnerText,
  isValidLeadStatus,
  isValidNonBuyerReason,
  ensureConversionLeadsStore,
  getConversionLead,
  ensureLeadRecord,
  deriveLeadStatus,
  resolveEffectiveStatus,
  setLeadStatus,
  addLeadNote,
  addLeadReason,
  publicLead,
  enrichQueueRow,
  buildOwnerActionQueue,
  filterOwnerActionQueue,
  buildOwnerWorkflowSummary,
  buildOwnerReasonFrequency,
  buildConversionLeadDetail,
  buildLostUserWorkflow,
  reasonDisplayLabel,
  leadStatusDisplayLabel,
  REASON_DISPLAY_LABELS,
  STATUS_DISPLAY_LABELS,
};
