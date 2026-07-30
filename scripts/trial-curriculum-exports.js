/**
 * Server-authoritative Trial curriculum export allowance.
 *
 * Trial members may browse the full Pro library and use up to 3 protected
 * curriculum exports (print/download of premium LLH curriculum) during the trial.
 * Provider-owned records and Free curriculum never consume this allowance.
 *
 * Node + browser-safe (logic helpers); mutation helpers are Node-oriented.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LLHTrialCurriculumExports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const TRIAL_EXPORT_ALLOWANCE = 3;
  const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
  const RELEASE_WINDOW_MS = 5 * 60 * 1000;
  const RATE_LIMIT_WINDOW_MS = 60 * 1000;
  const RATE_LIMIT_MAX = 12;

  const COPY = Object.freeze({
    core:
      "Your 7-day Pro trial includes full browsing of the Pro curriculum library and up to 3 premium curriculum prints or downloads. Upgrade to Founding or Pro for unlimited curriculum access, printing and downloads.",
    foundingWhileOpen:
      "Founding Members receive unlimited curriculum access for $9.99/month locked while membership remains continuously active.",
    proMonthly:
      "Pro includes unlimited curriculum access, printing and downloads for $19.99/month.",
    exhausted:
      "You’ve used all 3 premium curriculum prints or downloads included with your trial. You can continue browsing during your trial or upgrade for unlimited access.",
    beforeExport: "This will use 1 of your 3 trial curriculum exports.",
    remaining: (n) => `You have ${n} trial curriculum exports remaining.`,
    unlimitedLabel: "Unlimited curriculum printing and downloads",
    freeCore:
      "Free includes 10 complete starter lesson plans across Infant, Toddler and Preschool—no credit card required.",
    freeBrowse:
      "Browse the complete library and preview additional themes. Upgrade to Founding or Pro to unlock every lesson plan, new plans added weekly, and unlimited curriculum printing and downloads.",
    foundingCard:
      "Founding includes the complete lesson-plan and activity libraries, new content added weekly, and unlimited curriculum printing and downloads for $9.99/month locked while membership remains continuously active.",
    proCard:
      "Pro includes the complete lesson-plan and activity libraries, new content added weekly, and unlimited curriculum printing and downloads for $19.99/month.",
  });

  function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  function shortAccountRef(user) {
    const email = normalizeEmail(user?.email);
    if (email && email.includes("@")) {
      const local = email.split("@")[0] || "member";
      const safe = local.replace(/[^a-z0-9]/gi, "").slice(0, 6) || "member";
      return `LLH-${safe.toUpperCase()}-${String(email.length).padStart(2, "0")}`;
    }
    const id = String(user?.id || user?.uid || "member").replace(/[^a-z0-9]/gi, "").slice(-6) || "MEMBER";
    return `LLH-${id.toUpperCase()}`;
  }

  function watermarkText(user) {
    return `Little Learner Hub Trial Preview • Account ${shortAccountRef(user)}`;
  }

  function emptyState(nowIso = new Date().toISOString()) {
    return {
      allowance: TRIAL_EXPORT_ALLOWANCE,
      used: 0,
      remaining: TRIAL_EXPORT_ALLOWANCE,
      events: [],
      idempotency: {},
      lastExportAt: "",
      updatedAt: nowIso,
    };
  }

  function normalizeState(raw) {
    const base = emptyState();
    if (!raw || typeof raw !== "object") return base;
    const used = Math.max(0, Math.min(TRIAL_EXPORT_ALLOWANCE, Number(raw.used) || 0));
    const events = Array.isArray(raw.events) ? raw.events.slice(-50) : [];
    const idempotency = raw.idempotency && typeof raw.idempotency === "object" ? { ...raw.idempotency } : {};
    return {
      allowance: TRIAL_EXPORT_ALLOWANCE,
      used,
      remaining: Math.max(0, TRIAL_EXPORT_ALLOWANCE - used),
      events,
      idempotency,
      lastExportAt: String(raw.lastExportAt || ""),
      updatedAt: String(raw.updatedAt || base.updatedAt),
      stripeCustomerId: String(raw.stripeCustomerId || ""),
    };
  }

  function isProtectedCurriculumExport({
    isTrialUser,
    isPremiumCurriculum,
    isFreeCurriculum,
    isProviderOwned,
  }) {
    if (!isTrialUser) return false;
    if (isProviderOwned) return false;
    if (isFreeCurriculum) return false;
    return Boolean(isPremiumCurriculum);
  }

  function pruneIdempotency(state, nowMs = Date.now()) {
    const next = { ...state, idempotency: { ...state.idempotency } };
    for (const [key, entry] of Object.entries(next.idempotency)) {
      const at = Date.parse(entry?.at || "") || 0;
      if (!at || nowMs - at > IDEMPOTENCY_TTL_MS) delete next.idempotency[key];
    }
    return next;
  }

  /**
   * Authorize (consume) one protected export.
   * Same idempotencyKey returns the prior decision without consuming again.
   */
  function authorizeExport(state, {
    idempotencyKey,
    resourceType,
    resourceId,
    action,
    stripeCustomerId,
    nowMs = Date.now(),
  } = {}) {
    const key = String(idempotencyKey || "").trim();
    if (!key) {
      return { ok: false, error: "Idempotency key is required.", status: 400, state: normalizeState(state) };
    }
    let next = pruneIdempotency(normalizeState(state), nowMs);
    const prior = next.idempotency[key];
    if (prior) {
      return {
        ok: true,
        allowed: prior.allowed !== false,
        reused: true,
        remaining: next.remaining,
        used: next.used,
        watermark: prior.watermark || "",
        state: next,
        eventId: prior.eventId || "",
        message: prior.allowed === false ? COPY.exhausted : COPY.remaining(next.remaining),
      };
    }

    if (next.used >= TRIAL_EXPORT_ALLOWANCE) {
      next.idempotency[key] = {
        allowed: false,
        at: new Date(nowMs).toISOString(),
        resourceType: String(resourceType || ""),
        resourceId: String(resourceId || ""),
        action: String(action || "export"),
      };
      next.updatedAt = new Date(nowMs).toISOString();
      return {
        ok: true,
        allowed: false,
        reused: false,
        remaining: 0,
        used: next.used,
        watermark: "",
        state: next,
        message: COPY.exhausted,
      };
    }

    const eventId = `tce_${nowMs.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    next.used += 1;
    next.remaining = Math.max(0, TRIAL_EXPORT_ALLOWANCE - next.used);
    next.lastExportAt = new Date(nowMs).toISOString();
    next.updatedAt = next.lastExportAt;
    if (stripeCustomerId) next.stripeCustomerId = String(stripeCustomerId);
    const event = {
      id: eventId,
      idempotencyKey: key,
      resourceType: String(resourceType || ""),
      resourceId: String(resourceId || ""),
      action: String(action || "export"),
      at: next.lastExportAt,
      released: false,
    };
    next.events = [...next.events, event].slice(-50);
    next.idempotency[key] = {
      allowed: true,
      at: next.lastExportAt,
      eventId,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      action: event.action,
    };
    return {
      ok: true,
      allowed: true,
      reused: false,
      remaining: next.remaining,
      used: next.used,
      watermark: "",
      state: next,
      eventId,
      message: COPY.remaining(next.remaining),
      beforeMessage: COPY.beforeExport,
    };
  }

  /** Release a just-authorized export after a failed print/download (same key, short window). */
  function releaseExport(state, { idempotencyKey, nowMs = Date.now() } = {}) {
    const key = String(idempotencyKey || "").trim();
    let next = pruneIdempotency(normalizeState(state), nowMs);
    const prior = next.idempotency[key];
    if (!prior || prior.allowed === false) {
      return { ok: true, released: false, state: next, remaining: next.remaining, used: next.used };
    }
    const at = Date.parse(prior.at || "") || 0;
    if (!at || nowMs - at > RELEASE_WINDOW_MS) {
      return { ok: false, error: "Release window expired.", status: 409, state: next };
    }
    if (prior.released) {
      return { ok: true, released: false, state: next, remaining: next.remaining, used: next.used };
    }
    next.used = Math.max(0, next.used - 1);
    next.remaining = Math.max(0, TRIAL_EXPORT_ALLOWANCE - next.used);
    next.updatedAt = new Date(nowMs).toISOString();
    next.idempotency[key] = { ...prior, released: true, allowed: false };
    next.events = next.events.map((ev) => (
      ev.id === prior.eventId ? { ...ev, released: true } : ev
    ));
    return { ok: true, released: true, state: next, remaining: next.remaining, used: next.used };
  }

  function rateLimitOk(bucket, nowMs = Date.now()) {
    const windowStart = nowMs - RATE_LIMIT_WINDOW_MS;
    const hits = (Array.isArray(bucket) ? bucket : []).filter((t) => Number(t) > windowStart);
    if (hits.length >= RATE_LIMIT_MAX) {
      return { ok: false, hits, retryAfterMs: Math.max(0, (hits[0] + RATE_LIMIT_WINDOW_MS) - nowMs) };
    }
    return { ok: true, hits: [...hits, nowMs] };
  }

  function statusPayload(user, state, { foundingSpotsRemaining = null } = {}) {
    const normalized = normalizeState(state);
    const payload = {
      ok: true,
      allowance: TRIAL_EXPORT_ALLOWANCE,
      used: normalized.used,
      remaining: normalized.remaining,
      lastExportAt: normalized.lastExportAt || null,
      trialStart: user?.trialStart || null,
      trialEnd: user?.trialEnd || null,
      stripeCustomerId: user?.stripeCustomerId || normalized.stripeCustomerId || null,
      accountRef: shortAccountRef(user),
      watermark: watermarkText(user),
      copy: {
        core: COPY.core,
        exhausted: COPY.exhausted,
        beforeExport: COPY.beforeExport,
        remaining: COPY.remaining(normalized.remaining),
        foundingWhileOpen: COPY.foundingWhileOpen,
        proMonthly: COPY.proMonthly,
      },
    };
    if (foundingSpotsRemaining != null && Number(foundingSpotsRemaining) > 0) {
      payload.copy.foundingWhileOpen = COPY.foundingWhileOpen;
    }
    return payload;
  }

  return {
    TRIAL_EXPORT_ALLOWANCE,
    IDEMPOTENCY_TTL_MS,
    RELEASE_WINDOW_MS,
    RATE_LIMIT_WINDOW_MS,
    RATE_LIMIT_MAX,
    COPY,
    shortAccountRef,
    watermarkText,
    emptyState,
    normalizeState,
    isProtectedCurriculumExport,
    authorizeExport,
    releaseExport,
    rateLimitOk,
    statusPayload,
  };
});
