/**
 * Trial length / source classification for Admin + audits.
 *
 * Standard intro trial is always 7 days (card required).
 * Promo codes and admin manual extensions are separate kinds.
 * TRY1MONTH is retired from new signups; historical redemptions stay promo-extended.
 */
"use strict";

const STANDARD_TRIAL_DAYS = 7;
const STANDARD_TRIAL_LABEL = "7-Day Pro Trial";
const STANDARD_TRIAL_KIND = "standard_7day";
const PROMO_TRIAL_KIND = "promo_extended";
const MANUAL_TRIAL_KIND = "manual_extension";
const LEGACY_TRIAL_KIND = "legacy";
const UNEXPECTED_30_KIND = "unexpected_30day";
const MISMATCH_KIND = "stripe_local_mismatch";
const UNKNOWN_TRIAL_KIND = "unknown";

const KIND_LABELS = {
  [STANDARD_TRIAL_KIND]: "Standard 7-Day Trial",
  [PROMO_TRIAL_KIND]: "Correct Promo-Extended Trial",
  [MANUAL_TRIAL_KIND]: "Correct Manual Extension",
  [LEGACY_TRIAL_KIND]: "Legacy Trial",
  [UNEXPECTED_30_KIND]: "Unexpected 30-Day Trial",
  [MISMATCH_KIND]: "Stripe/Local Mismatch",
  [UNKNOWN_TRIAL_KIND]: "Trial (source unclear)",
};

function parseIsoMs(value) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function trialDurationDays(user = {}) {
  const startMs = parseIsoMs(user.trialStart);
  const endMs = parseIsoMs(user.trialEnd);
  if (startMs === null || endMs === null || endMs < startMs) return null;
  return Math.round((endMs - startMs) / 86400000);
}

function promoCodeFromUser(user = {}) {
  const direct = String(user.promoCodeUsed || user.pendingPromoCode || "").trim().toUpperCase();
  if (direct) return direct;
  const redemptions = Array.isArray(user.promoRedemptions) ? user.promoRedemptions : [];
  const first = redemptions.find((row) => String(row?.code || "").trim());
  return first ? String(first.code).trim().toUpperCase() : "";
}

function hasManualExtensionMarker(user = {}, auditEntries = []) {
  if (String(user.trialSource || "").toLowerCase() === MANUAL_TRIAL_KIND) return true;
  if (String(user.trialExtensionSource || "").trim() === "manual_admin") return true;
  if (Number(user.trialExtendedDaysTotal || 0) > 0) return true;
  if (Number(user.manualTrialExtensionDays || 0) > 0) return true;
  if (user.trialManuallyExtendedAt || user.trialExtendedAt || user.trialExtendedManually) return true;
  const audits = Array.isArray(auditEntries) ? auditEntries : [];
  return audits.some((entry) => {
    const note = String(entry?.note || entry?.action || "").toLowerCase();
    const updates = entry?.updates || {};
    return note.includes("extend trial")
      || Number(updates.extendTrialDays || 0) > 0
      || String(updates.trialSource || "") === MANUAL_TRIAL_KIND;
  });
}

function displayNameFromUser(user = {}) {
  return String(
    user.name
    || user.fullName
    || user.displayName
    || [user.firstName, user.lastName].filter(Boolean).join(" ")
    || "",
  ).trim();
}

/**
 * Classify how a trial was granted.
 * Prefers explicit trialSource stamps; falls back to promo / duration heuristics.
 */
function classifyTrialSource(user = {}, { auditEntries = [] } = {}) {
  const stamped = String(user.trialSource || "").trim().toLowerCase();
  const promoCode = promoCodeFromUser(user);
  const promoLabel = String(user.promoLabelUsed || user.pendingPromoLabel || "").trim();
  const durationDays = trialDurationDays(user);
  const manual = hasManualExtensionMarker(user, auditEntries);

  let kind = UNKNOWN_TRIAL_KIND;
  let extensionSource = String(user.trialExtensionSource || "").trim();

  if (
    stamped === STANDARD_TRIAL_KIND
    || stamped === PROMO_TRIAL_KIND
    || stamped === MANUAL_TRIAL_KIND
    || stamped === LEGACY_TRIAL_KIND
    || stamped === UNEXPECTED_30_KIND
  ) {
    kind = stamped;
  } else if (manual) {
    kind = MANUAL_TRIAL_KIND;
  } else if (promoCode) {
    kind = PROMO_TRIAL_KIND;
  } else if (
    String(user.trial7day || "").toLowerCase() === "true"
    || /7[-\s]?day/i.test(promoLabel)
    || durationDays === STANDARD_TRIAL_DAYS
  ) {
    kind = STANDARD_TRIAL_KIND;
  } else if (durationDays != null && durationDays >= 28 && durationDays <= 31) {
    // ~1 month without a promo stamp — unexpected (not a legitimate promo redemption).
    kind = UNEXPECTED_30_KIND;
  } else if (durationDays != null && durationDays > 8) {
    kind = LEGACY_TRIAL_KIND;
  } else if (membershipLooksLikeTrial(user)) {
    kind = UNKNOWN_TRIAL_KIND;
  }

  if (kind === MANUAL_TRIAL_KIND && !extensionSource) {
    extensionSource = user.trialExtendedBy || "Admin manual extension";
  }
  if (kind === PROMO_TRIAL_KIND && !extensionSource) {
    extensionSource = promoCode
      ? `Promo code ${promoCode}${promoLabel ? ` (${promoLabel})` : ""}`
      : (promoLabel || "Promo code");
  }
  if (kind === STANDARD_TRIAL_KIND && !extensionSource) {
    extensionSource = STANDARD_TRIAL_LABEL;
  }
  if (kind === LEGACY_TRIAL_KIND && !extensionSource) {
    extensionSource = "Legacy / historical trial";
  }
  if (kind === UNEXPECTED_30_KIND && !extensionSource) {
    extensionSource = "Unexpected ~30-day trial without promo stamp";
  }

  const expectedDays = kind === STANDARD_TRIAL_KIND
    ? STANDARD_TRIAL_DAYS
    : (Number(user.promoTrialDays || user.pendingTrialDays || durationDays) || null);

  const daysRemaining = (() => {
    const endMs = parseIsoMs(user.trialEnd);
    if (endMs === null) return null;
    return Math.max(0, Math.ceil((endMs - Date.now()) / 86400000));
  })();

  const correct = kind === STANDARD_TRIAL_KIND
    && (durationDays === null || Math.abs(durationDays - STANDARD_TRIAL_DAYS) <= 1)
    && (daysRemaining === null || daysRemaining <= STANDARD_TRIAL_DAYS);

  const affected = kind === UNEXPECTED_30_KIND;

  return {
    kind,
    label: KIND_LABELS[kind] || KIND_LABELS[UNKNOWN_TRIAL_KIND],
    extensionSource: extensionSource || "—",
    promoCode: promoCode || "",
    promoLabel,
    name: displayNameFromUser(user),
    trialStart: user.trialStart || "",
    trialEnd: user.trialEnd || "",
    durationDays,
    expectedDays,
    daysRemaining,
    correct: kind === PROMO_TRIAL_KIND || kind === MANUAL_TRIAL_KIND ? true : correct,
    affected,
    verdict: kind === PROMO_TRIAL_KIND
      ? "correct_promo"
      : kind === MANUAL_TRIAL_KIND
        ? "correct_manual"
        : kind === STANDARD_TRIAL_KIND && correct
          ? "correct_standard"
          : kind === LEGACY_TRIAL_KIND
            ? "legacy"
            : kind === UNEXPECTED_30_KIND
              ? "affected_unexpected_30day"
              : "review",
  };
}

function membershipLooksLikeTrial(user = {}) {
  const trialStatus = String(user.trialStatus || "").toLowerCase();
  const stripeStatus = String(user.stripeSubscriptionStatus || "").toLowerCase();
  const status = String(user.subscriptionStatus || "").toLowerCase();
  return Boolean(user.trialStart || user.trialEnd)
    || trialStatus.includes("in trial")
    || stripeStatus === "trialing"
    || (status.includes("trial") && !status.includes("trial ended") && !status.includes("no trial"));
}

function auditTrialAccounts(users = [], { auditsByEmail = {}, nowMs = Date.now() } = {}) {
  const rows = [];
  for (const user of users) {
    if (!membershipLooksLikeTrial(user) && !user.trialStart && !user.trialEnd) continue;
    const endMs = parseIsoMs(user.trialEnd);
    const active = endMs === null || endMs > nowMs;
    const stripeTrialing = String(user.stripeSubscriptionStatus || "").toLowerCase() === "trialing";
    if (!active && !stripeTrialing && !String(user.trialStatus || "").toLowerCase().includes("in trial")) {
      continue;
    }
    const email = String(user.email || "").toLowerCase();
    const classification = classifyTrialSource(user, {
      auditEntries: auditsByEmail[email] || user.membershipAuditRecent || [],
    });
    rows.push({
      name: classification.name || "",
      email,
      trialStart: classification.trialStart,
      localTrialEnd: classification.trialEnd,
      stripeTrialEnd: user.stripeTrialEnd || "",
      daysRemainingShown: classification.daysRemaining,
      durationDays: classification.durationDays,
      promoCode: classification.promoCode,
      extensionSource: classification.extensionSource,
      manualExtensionSource: classification.kind === MANUAL_TRIAL_KIND
        ? (classification.extensionSource || "manual_admin")
        : "",
      trialSource: classification.kind,
      kind: classification.kind,
      kindLabel: classification.label,
      finalClassification: classification.label,
      verdict: classification.verdict,
      correct: classification.correct,
      affected: classification.affected,
      stripeSubscriptionId: user.stripeSubscriptionId || "",
      stripeCustomerId: user.stripeCustomerId || "",
    });
  }
  rows.sort((a, b) => String(b.localTrialEnd || "").localeCompare(String(a.localTrialEnd || "")));
  const summary = {
    totalActiveTrials: rows.length,
    standard7day: rows.filter((r) => r.kind === STANDARD_TRIAL_KIND).length,
    promoExtended: rows.filter((r) => r.kind === PROMO_TRIAL_KIND).length,
    manuallyExtended: rows.filter((r) => r.kind === MANUAL_TRIAL_KIND).length,
    legacy: rows.filter((r) => r.kind === LEGACY_TRIAL_KIND).length,
    unexpected30day: rows.filter((r) => r.kind === UNEXPECTED_30_KIND).length,
    unknown: rows.filter((r) => r.kind === UNKNOWN_TRIAL_KIND).length,
    affectedUnexpected30day: rows.filter((r) => r.affected || r.kind === UNEXPECTED_30_KIND).length,
    stripeLocalMismatch: rows.filter((r) => r.kind === MISMATCH_KIND || r.localMatchesStripe === false).length,
    approxOneMonthRemaining: rows.filter((r) => r.daysRemainingShown != null && r.daysRemainingShown >= 25 && r.daysRemainingShown <= 31).length,
    try1monthCount: rows.filter((r) => String(r.promoCode || "").toUpperCase() === "TRY1MONTH").length,
  };
  return { summary, rows };
}

module.exports = {
  STANDARD_TRIAL_DAYS,
  STANDARD_TRIAL_LABEL,
  STANDARD_TRIAL_KIND,
  PROMO_TRIAL_KIND,
  MANUAL_TRIAL_KIND,
  LEGACY_TRIAL_KIND,
  UNEXPECTED_30_KIND,
  MISMATCH_KIND,
  UNKNOWN_TRIAL_KIND,
  KIND_LABELS,
  trialDurationDays,
  classifyTrialSource,
  auditTrialAccounts,
  membershipLooksLikeTrial,
};
