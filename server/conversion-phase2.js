/**
 * Conversion Intelligence Phase 2A — isolated metric builders.
 * Extends #766 without replacing the funnel or creating a competing store.
 */

const conversionEvents = require("./conversion-events.js");
const membershipAccess = require("../scripts/membership-access.js");

const {
  COHORT_WINDOWS_DAYS,
  resolveCanonicalEvent,
  eventActorKey,
  normalizeAttributionSource,
  extractAgeGroup,
  extractResourceId,
  extractCtaLocation,
  normalizeOffer,
  resolvePersona,
  isCtaImpressionEvent,
} = conversionEvents;

function eventTime(event) {
  const ts = new Date(/** @type {{ createdAt?: string }} */ (event)?.createdAt || 0).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function normalizeEmail(value = "") {
  return String(value || "").trim().toLowerCase();
}

function median(arr) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function fmtMinutes(mins) {
  if (mins == null) return "Not enough data yet";
  if (mins < 60) return `${Math.round(mins)} min`;
  if (mins < 1440) return `${(mins / 60).toFixed(1)} hr`;
  return `${(mins / 1440).toFixed(1)} days`;
}

function ratePct(part, whole) {
  if (!whole) return null;
  return Number(((part / whole) * 100).toFixed(1));
}

function rateLabel(part, whole) {
  const r = ratePct(part, whole);
  return r == null ? "—" : `${r}%`;
}

/**
 * Deterministic activation for one profile.
 * Activated = ≥2 distinct curriculum resources AND ≥1 meaningful action after signup.
 * @param {{ signupAt?: string, events?: Array<unknown> }} profile
 */
function computeActivationState(profile) {
  const signupMs = profile.signupAt ? new Date(profile.signupAt).getTime() : 0;
  const events = [...(profile.events || [])].sort((a, b) => eventTime(a) - eventTime(b));
  /** @type {Set<string>} */
  const uniqueResources = new Set();
  let hasMeaningful = false;
  let activationMs = 0;

  for (const ev of events) {
    const t = eventTime(ev);
    if (signupMs && t < signupMs) continue;
    const c = resolveCanonicalEvent(ev);
    if (!c) continue;

    if (c === "lesson_viewed" || c === "activity_viewed") {
      const id = extractResourceId(ev);
      if (id) uniqueResources.add(id);
    }
    if (c === "activity_viewed" || c === "lesson_saved" || c === "printable_viewed" || c === "printable_downloaded") {
      hasMeaningful = true;
    }
    if (uniqueResources.size >= 2 && hasMeaningful && !activationMs) {
      activationMs = t;
    }
  }

  return {
    activated: Boolean(activationMs),
    activatedAt: activationMs ? new Date(activationMs).toISOString() : "",
    activatedAtMs: activationMs || 0,
    distinctResources: uniqueResources.size,
    hasMeaningfulAction: hasMeaningful,
  };
}

/**
 * Enrich profiles with Phase 2A fields (mutates in place for efficiency).
 * @param {Map<string, Record<string, unknown>>} profiles
 * @param {Record<string, Record<string, unknown>>} usersByEmail
 * @param {(user: Record<string, unknown>) => boolean} isPaidFn
 */
function enrichProfilesPhase2(profiles, usersByEmail, isPaidFn) {
  for (const profile of profiles.values()) {
    const email = normalizeEmail(String(profile.email || ""));
    const user = email ? usersByEmail[email] : null;
    const activation = computeActivationState(/** @type {{ signupAt?: string, events?: Array<unknown> }} */ (profile));
    profile.activated = activation.activated;
    profile.activatedAt = activation.activatedAt;
    profile.activatedAtMs = activation.activatedAtMs;

    const paidAt = String(user?.firstPaidInvoiceAt || user?.metaPurchaseAt || "");
    const paidMs = paidAt ? new Date(paidAt).getTime() : 0;
    profile.paidAtMs = Number.isFinite(paidMs) && paidMs > 0 ? paidMs : 0;
    if (typeof isPaidFn === "function" && user) {
      profile.converted = isPaidFn(user);
      profile.paidActive = profile.converted;
    }

    // Persona: latest signup_persona_selected, then onboardingPersona, then accountType+role.
    let personaFromEvent = "";
    for (const ev of [.../** @type {Array<unknown>} */ (profile.events || [])].sort((a, b) => eventTime(b) - eventTime(a))) {
      const name = String(/** @type {{ name?: string }} */ (ev).name || "");
      if (name !== "signup_persona_selected") continue;
      const detail = /** @type {{ detail?: Record<string, string> }} */ (ev).detail || {};
      personaFromEvent = String(detail.persona || "");
      if (personaFromEvent) break;
    }
    profile.persona = resolvePersona({
      persona: personaFromEvent,
      onboardingPersona: String(user?.onboardingPersona || ""),
      accountType: String(user?.accountType || ""),
      role: String(user?.role || ""),
    });

    const attr = /** @type {Record<string, string>} */ (user?.attribution || {});
    profile.firstTouch = {
      source: normalizeAttributionSource({ attribution: attr, source: attr.source }),
      medium: String(attr.medium || attr.utm_medium || "").slice(0, 80) || "Unknown",
      campaign: String(attr.campaign || attr.utm_campaign || "").slice(0, 120) || "Unknown",
      content: String(attr.content || attr.utm_content || "").slice(0, 120) || "Unknown",
      referrer: String(attr.referrer || "").slice(0, 160) || "",
      landingPage: String(attr.landingPage || "").slice(0, 160) || "",
    };
    if (profile.source === "Unknown" && profile.firstTouch.source !== "Unknown") {
      profile.source = profile.firstTouch.source;
    }

    profile.billingOffer = String(user?.billingOffer || "");
    profile.priceLock = String(user?.priceLock || "");
    profile.hasProAccess = user ? membershipAccess.membershipHasProAccess(user) : false;
    profile.hadPaidHistory = Boolean(user?.firstPaidInvoiceAt);
  }
  return profiles;
}

/**
 * @param {Map<string, Record<string, unknown>>} profiles
 */
function buildActivation(profiles) {
  let signups = 0;
  let activated = 0;
  let activatedPaid = 0;
  let nonActivatedPaid = 0;
  /** @type {number[]} */
  const toActivationMins = [];

  for (const profile of profiles.values()) {
    if (!profile.signupAt && !profile.events?.length) continue;
    // Count actors with signup evidence.
    const isSignup = Boolean(profile.signupAt)
      || /** @type {Array<unknown>} */ (profile.events || []).some((e) => resolveCanonicalEvent(e) === "account_created");
    if (!isSignup) continue;
    signups += 1;
    if (profile.activated) {
      activated += 1;
      if (profile.converted) activatedPaid += 1;
      const signupMs = new Date(String(profile.signupAt)).getTime();
      const actMs = Number(profile.activatedAtMs || 0);
      if (Number.isFinite(signupMs) && actMs > signupMs) {
        toActivationMins.push((actMs - signupMs) / 60000);
      }
    } else if (profile.converted) {
      nonActivatedPaid += 1;
    }
  }

  const nonActivated = Math.max(signups - activated, 0);
  return {
    definition: "≥2 distinct curriculum resources (lesson_viewed/activity_viewed) AND ≥1 meaningful action (activity_viewed/lesson_saved/printable_viewed/printable_downloaded) after signup",
    signups,
    activatedUsers: activated,
    activationRate: rateLabel(activated, signups),
    activationRatePct: ratePct(activated, signups),
    medianSignupToActivation: fmtMinutes(median(toActivationMins)),
    activatedToPaidRate: rateLabel(activatedPaid, activated),
    activatedToPaidPct: ratePct(activatedPaid, activated),
    nonActivatedToPaidRate: rateLabel(nonActivatedPaid, nonActivated),
    nonActivatedToPaidPct: ratePct(nonActivatedPaid, nonActivated),
    sampleSize: signups,
  };
}

/**
 * @param {Map<string, Record<string, unknown>>} profiles
 * @param {number} [nowMs]
 */
function buildSignupCohorts(profiles, nowMs = Date.now()) {
  /** @type {Map<string, { cohortKey: string, signupCount: number, windows: Record<string, { eligible: number, paid: number, rate: string|null, mature: boolean }> }>} */
  const cohorts = new Map();

  for (const profile of profiles.values()) {
    const signupAt = String(profile.signupAt || "");
    const signupMs = signupAt ? new Date(signupAt).getTime() : 0;
    if (!Number.isFinite(signupMs) || !signupMs) continue;

    const d = new Date(signupMs);
    const cohortKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    if (!cohorts.has(cohortKey)) {
      const windows = {};
      for (const w of COHORT_WINDOWS_DAYS) {
        windows[`${w}d`] = { eligible: 0, paid: 0, rate: null, mature: false };
      }
      cohorts.set(cohortKey, { cohortKey, signupCount: 0, windows });
    }
    const row = /** @type {NonNullable<ReturnType<typeof cohorts.get>>} */ (cohorts.get(cohortKey));
    row.signupCount += 1;

    const paidMs = Number(profile.paidAtMs || 0);
    const converted = Boolean(profile.converted);

    for (const w of COHORT_WINDOWS_DAYS) {
      const key = `${w}d`;
      const windowEnd = signupMs + w * 86400000;
      const mature = windowEnd <= nowMs;
      row.windows[key].mature = mature;
      if (!mature) continue;
      row.windows[key].eligible += 1;
      if (converted && paidMs > 0 && paidMs <= windowEnd && paidMs >= signupMs) {
        row.windows[key].paid += 1;
      }
    }
  }

  const rows = [...cohorts.values()]
    .sort((a, b) => b.cohortKey.localeCompare(a.cohortKey))
    .slice(0, 60)
    .map((row) => {
      /** @type {Record<string, string|number>} */
      const out = { cohort: row.cohortKey, signups: row.signupCount };
      for (const w of COHORT_WINDOWS_DAYS) {
        const key = `${w}d`;
        const win = row.windows[key];
        if (!win.mature || win.eligible === 0) {
          out[`paidWithin${w}d`] = "—";
          out[`rate${w}d`] = "pending";
          out[`eligible${w}d`] = win.eligible;
        } else {
          out[`paidWithin${w}d`] = win.paid;
          out[`rate${w}d`] = rateLabel(win.paid, win.eligible);
          out[`eligible${w}d`] = win.eligible;
        }
      }
      return out;
    });

  return {
    windowsDays: [...COHORT_WINDOWS_DAYS],
    cohorts: rows,
    note: "Immature windows show pending/— and are excluded from denominators.",
  };
}

/**
 * First-touch campaign/creative attribution from user.attribution.
 * @param {Map<string, Record<string, unknown>>} profiles
 */
function buildCampaignAttribution(profiles) {
  /** @type {Map<string, { source: string, medium: string, campaign: string, content: string, signups: number, activated: number, pricingViews: number, checkoutStarts: number, paid: number }>} */
  const byKey = new Map();

  for (const profile of profiles.values()) {
    const isSignup = Boolean(profile.signupAt)
      || /** @type {Array<unknown>} */ (profile.events || []).some((e) => resolveCanonicalEvent(e) === "account_created");
    if (!isSignup) continue;
    const ft = /** @type {{ source?: string, medium?: string, campaign?: string, content?: string }} */ (profile.firstTouch || {});
    const source = ft.source || profile.source || "Unknown";
    const medium = ft.medium || "Unknown";
    const campaign = ft.campaign || "Unknown";
    const content = ft.content || "Unknown";
    const key = `${source}|${medium}|${campaign}|${content}`;
    if (!byKey.has(key)) {
      byKey.set(key, { source, medium, campaign, content, signups: 0, activated: 0, pricingViews: 0, checkoutStarts: 0, paid: 0 });
    }
    const row = /** @type {NonNullable<ReturnType<typeof byKey.get>>} */ (byKey.get(key));
    row.signups += 1;
    if (profile.activated) row.activated += 1;
    if (Number(profile.pricingViews) > 0) row.pricingViews += 1;
    if (Number(profile.checkoutStarts) > 0) row.checkoutStarts += 1;
    if (profile.converted) row.paid += 1;
  }

  const firstTouch = [...byKey.values()]
    .map((row) => ({
      ...row,
      conversionRate: rateLabel(row.paid, row.signups),
      conversionRatePct: ratePct(row.paid, row.signups),
    }))
    .sort((a, b) => b.signups - a.signups);

  // Later-touch (read-only): last pricing_viewed / checkout_started event attribution, separate section.
  /** @type {Map<string, { source: string, campaign: string, content: string, events: number, paidActors: Set<string> }>} */
  const later = new Map();
  for (const [actorKey, profile] of profiles) {
    let lastTouch = null;
    for (const ev of [.../** @type {Array<unknown>} */ (profile.events || [])].sort((a, b) => eventTime(a) - eventTime(b))) {
      const c = resolveCanonicalEvent(ev);
      if (c !== "pricing_viewed" && c !== "checkout_started") continue;
      const attr = /** @type {{ attribution?: Record<string, string> }} */ (ev).attribution || {};
      lastTouch = {
        source: normalizeAttributionSource({ attribution: attr, source: attr.source }),
        campaign: String(attr.campaign || attr.utm_campaign || "Unknown"),
        content: String(attr.content || attr.utm_content || "Unknown"),
      };
    }
    if (!lastTouch) continue;
    const key = `${lastTouch.source}|${lastTouch.campaign}|${lastTouch.content}`;
    if (!later.has(key)) {
      later.set(key, { source: lastTouch.source, campaign: lastTouch.campaign, content: lastTouch.content, events: 0, paidActors: new Set() });
    }
    const row = /** @type {NonNullable<ReturnType<typeof later.get>>} */ (later.get(key));
    row.events += 1;
    if (profile.converted) row.paidActors.add(actorKey);
  }

  const laterTouch = [...later.values()].map((row) => ({
    source: row.source,
    campaign: row.campaign,
    content: row.content,
    touchEvents: row.events,
    paid: row.paidActors.size,
    label: "Later-touch / last-touch (not first-touch)",
  })).sort((a, b) => b.touchEvents - a.touchEvents);

  return {
    firstTouch,
    laterTouch,
    note: "Main table is first-touch only. Later-touch is separate and must not be mixed.",
  };
}

/**
 * @param {Map<string, Record<string, unknown>>} profiles
 */
function buildPersonaSegmentation(profiles) {
  /** @type {Map<string, { persona: string, signups: number, activated: number, pricingViews: number, checkoutStarts: number, paid: number }>} */
  const byPersona = new Map();

  for (const profile of profiles.values()) {
    const isSignup = Boolean(profile.signupAt)
      || /** @type {Array<unknown>} */ (profile.events || []).some((e) => resolveCanonicalEvent(e) === "account_created");
    if (!isSignup) continue;
    const persona = String(profile.persona || "unknown");
    if (!byPersona.has(persona)) {
      byPersona.set(persona, { persona, signups: 0, activated: 0, pricingViews: 0, checkoutStarts: 0, paid: 0 });
    }
    const row = /** @type {NonNullable<ReturnType<typeof byPersona.get>>} */ (byPersona.get(persona));
    row.signups += 1;
    if (profile.activated) row.activated += 1;
    if (Number(profile.pricingViews) > 0) row.pricingViews += 1;
    if (Number(profile.checkoutStarts) > 0) row.checkoutStarts += 1;
    if (profile.converted) row.paid += 1;
  }

  return [...byPersona.values()]
    .map((row) => ({
      ...row,
      conversionRate: rateLabel(row.paid, row.signups),
      conversionRatePct: ratePct(row.paid, row.signups),
    }))
    .sort((a, b) => b.signups - a.signups);
}

/**
 * Users who engaged with content of each age group (not signup assignment).
 * @param {Array<unknown>} events
 * @param {Map<string, Record<string, unknown>>} profiles
 */
function buildAgeGroupSegmentation(events, profiles) {
  /** @type {Map<string, { ageGroup: string, engagedActors: Set<string>, lessonEngagement: number, printableEngagement: number, proEncounters: number, pricingViews: number, checkoutStarts: number, paidActors: Set<string> }>} */
  const byAge = new Map();

  const ensure = (age) => {
    if (!byAge.has(age)) {
      byAge.set(age, {
        ageGroup: age,
        engagedActors: new Set(),
        lessonEngagement: 0,
        printableEngagement: 0,
        proEncounters: 0,
        pricingViews: 0,
        checkoutStarts: 0,
        paidActors: new Set(),
      });
    }
    return /** @type {NonNullable<ReturnType<typeof byAge.get>>} */ (byAge.get(age));
  };

  for (const event of events) {
    const actor = eventActorKey(event);
    if (!actor) continue;
    const c = resolveCanonicalEvent(event);
    if (!c) continue;
    const age = extractAgeGroup(event) || (c === "lesson_viewed" || c === "activity_viewed" || c === "printable_viewed" || c === "printable_downloaded" || c === "pro_content_encountered" ? "Unknown" : "");
    if (!age) continue;
    // Only count age groups from content engagement events.
    if (!["lesson_viewed", "activity_viewed", "printable_viewed", "printable_downloaded", "pro_content_encountered"].includes(c)) {
      continue;
    }
    const row = ensure(age);
    row.engagedActors.add(actor);
    if (c === "lesson_viewed" || c === "activity_viewed") row.lessonEngagement += 1;
    if (c === "printable_viewed" || c === "printable_downloaded") row.printableEngagement += 1;
    if (c === "pro_content_encountered") row.proEncounters += 1;
  }

  // Pricing / checkout / paid for actors who engaged that age group.
  for (const [age, row] of byAge) {
    void age;
    for (const actor of row.engagedActors) {
      const profile = profiles.get(actor);
      if (!profile) continue;
      if (Number(profile.pricingViews) > 0) row.pricingViews += 1;
      if (Number(profile.checkoutStarts) > 0) row.checkoutStarts += 1;
      if (profile.converted) row.paidActors.add(actor);
    }
  }

  return {
    note: "Counts are users who engaged with content in each age group — not signup age assignment.",
    rows: [...byAge.values()].map((row) => {
      const engaged = row.engagedActors.size;
      const paid = row.paidActors.size;
      return {
        ageGroup: row.ageGroup,
        engagedUsers: engaged,
        lessonEngagement: row.lessonEngagement,
        printableEngagement: row.printableEngagement,
        proEncounters: row.proEncounters,
        pricingViews: row.pricingViews,
        checkoutStarts: row.checkoutStarts,
        paidConversions: paid,
        conversionRate: rateLabel(paid, engaged),
        conversionRatePct: ratePct(paid, engaged),
      };
    }).sort((a, b) => b.engagedUsers - a.engagedUsers),
  };
}

/**
 * @param {Map<string, Record<string, unknown>>} profiles
 */
function buildOfferAttribution(profiles) {
  /** @type {Map<string, { offer: string, checkoutStarts: number, paid: number, actorsCheckout: Set<string>, actorsPaid: Set<string> }>} */
  const byOffer = new Map();

  const ensure = (offer) => {
    if (!byOffer.has(offer)) {
      byOffer.set(offer, { offer, checkoutStarts: 0, paid: 0, actorsCheckout: new Set(), actorsPaid: new Set() });
    }
    return /** @type {NonNullable<ReturnType<typeof byOffer.get>>} */ (byOffer.get(offer));
  };

  for (const [actorKey, profile] of profiles) {
    const events = [.../** @type {Array<unknown>} */ (profile.events || [])].sort((a, b) => eventTime(a) - eventTime(b));
    /** @type {string} */
    let lastCheckoutOffer = "unknown";
    /** @type {Array<{ t: number, offer: string }>} */
    const checkouts = [];

    for (const ev of events) {
      const c = resolveCanonicalEvent(ev);
      if (c !== "checkout_started") continue;
      const offer = normalizeOffer(ev);
      lastCheckoutOffer = offer;
      checkouts.push({ t: eventTime(ev), offer });
      const row = ensure(offer);
      row.checkoutStarts += 1;
      row.actorsCheckout.add(actorKey);
    }

    if (profile.converted) {
      const paidMs = Number(profile.paidAtMs || 0);
      // Last checkout_start BEFORE paid conversion.
      let attributed = "unknown";
      for (const c of checkouts) {
        if (paidMs && c.t > paidMs) break;
        attributed = c.offer;
      }
      if (attributed === "unknown") {
        attributed = normalizeOffer({ billingOffer: profile.billingOffer, priceLock: profile.priceLock });
      }
      const row = ensure(attributed);
      row.paid += 1;
      row.actorsPaid.add(actorKey);
    } else if (!checkouts.length && lastCheckoutOffer) {
      void lastCheckoutOffer;
    }
  }

  return [...byOffer.values()].map((row) => ({
    offer: row.offer,
    checkoutStarts: row.actorsCheckout.size,
    checkoutStartEvents: row.checkoutStarts,
    paidConversions: row.actorsPaid.size,
    conversionRate: rateLabel(row.actorsPaid.size, row.actorsCheckout.size),
    conversionRatePct: ratePct(row.actorsPaid.size, row.actorsCheckout.size),
  })).sort((a, b) => b.checkoutStarts - a.checkoutStarts);
}

/**
 * Extend lesson pre-purchase association (not causal).
 * @param {Array<unknown>} events
 * @param {Map<string, Record<string, unknown>>} profiles
 */
function buildLessonPurchaseAssociation(events, profiles) {
  /** @type {Map<string, {
   *  lessonId: string,
   *  title: string,
   *  ageGroup: string,
   *  viewers: Set<string>,
   *  firstViewByActor: Map<string, number>,
   *  saves: number,
   *  printables: number,
   *  proEncounters: number,
   *  pricingWithin7d: Set<string>,
   *  purchasesWithin30d: Set<string>,
   * }>} */
  const lessons = new Map();

  const ensure = (id, title, age) => {
    if (!lessons.has(id)) {
      lessons.set(id, {
        lessonId: id,
        title: title || id,
        ageGroup: age || "Unknown",
        viewers: new Set(),
        firstViewByActor: new Map(),
        saves: 0,
        printables: 0,
        proEncounters: 0,
        pricingWithin7d: new Set(),
        purchasesWithin30d: new Set(),
      });
    }
    return /** @type {NonNullable<ReturnType<typeof lessons.get>>} */ (lessons.get(id));
  };

  for (const event of events) {
    const actor = eventActorKey(event);
    if (!actor) continue;
    const c = resolveCanonicalEvent(event);
    if (!c) continue;
    const detail = /** @type {{ detail?: Record<string, string> }} */ (event).detail || {};
    const lessonId = extractResourceId(event) || String(detail.lessonId || "").trim();
    const title = String(detail.title || detail.lessonTitle || "").trim();
    const age = extractAgeGroup(event) || "Unknown";
    const t = eventTime(event);

    if (c === "lesson_viewed" || c === "activity_viewed") {
      if (!lessonId) continue;
      const row = ensure(lessonId, title, age);
      row.viewers.add(actor);
      if (!row.firstViewByActor.has(actor)) row.firstViewByActor.set(actor, t);
    }
    if (c === "lesson_saved" && lessonId) {
      ensure(lessonId, title, age).saves += 1;
    }
    if ((c === "printable_viewed" || c === "printable_downloaded") && lessonId) {
      ensure(lessonId, title, age).printables += 1;
    }
    if (c === "pro_content_encountered" && lessonId) {
      ensure(lessonId, title, age).proEncounters += 1;
    }
  }

  // Pricing within 7d / purchases within 30d of first lesson view.
  for (const row of lessons.values()) {
    for (const [actor, firstViewMs] of row.firstViewByActor) {
      const profile = profiles.get(actor);
      if (!profile) continue;
      for (const ev of /** @type {Array<unknown>} */ (profile.events || [])) {
        const c = resolveCanonicalEvent(ev);
        const t = eventTime(ev);
        if (c === "pricing_viewed" && t >= firstViewMs && t <= firstViewMs + 7 * 86400000) {
          row.pricingWithin7d.add(actor);
        }
      }
      if (profile.converted && Number(profile.paidAtMs) > 0) {
        const paidMs = Number(profile.paidAtMs);
        if (paidMs >= firstViewMs && paidMs <= firstViewMs + 30 * 86400000) {
          row.purchasesWithin30d.add(actor);
        }
      }
    }
  }

  const topLessons = [...lessons.values()].map((row) => {
    const uniqueViewers = row.viewers.size;
    const purchases = row.purchasesWithin30d.size;
    return {
      lessonId: row.lessonId,
      title: row.title,
      ageGroup: row.ageGroup,
      uniqueViewers,
      saves: row.saves,
      printableInteractions: row.printables,
      proEncounters: row.proEncounters,
      pricingViewsWithin7d: row.pricingWithin7d.size,
      purchasesWithin30d: purchases,
      conversionRate: rateLabel(purchases, uniqueViewers),
      conversionRatePct: ratePct(purchases, uniqueViewers),
      associationLabel: "Pre-purchase association (not causal)",
    };
  }).sort((a, b) => b.purchasesWithin30d - a.purchasesWithin30d || b.uniqueViewers - a.uniqueViewers)
    .slice(0, 40);

  return {
    associationDisclaimer: "Pre-purchase association (not causal)",
    attributionWindows: { pricingDays: 7, purchaseDays: 30 },
    topLessons,
  };
}

/**
 * Maturity-safe lost-user lifecycle segments.
 * @param {Map<string, Record<string, unknown>>} profiles
 * @param {number} [nowMs]
 */
function buildLostUserSegments(profiles, nowMs = Date.now()) {
  /** @type {Record<string, { id: string, label: string, count: number, users: Array<{ user: string, signupDate: string, lastActive: string, reasons: string[] }> }>} */
  const segments = {
    never_meaningful_use: { id: "never_meaningful_use", label: "Signup, never meaningful use", count: 0, users: [] },
    activated_never_returned: { id: "activated_never_returned", label: "Activated, never returned", count: 0, users: [] },
    returned_then_disappeared: { id: "returned_then_disappeared", label: "Returned, then disappeared", count: 0, users: [] },
    high_engagement_never_purchased: { id: "high_engagement_never_purchased", label: "High engagement, never purchased", count: 0, users: [] },
    checkout_no_completion: { id: "checkout_no_completion", label: "Checkout started, no completion", count: 0, users: [] },
    previously_paid_ended: { id: "previously_paid_ended", label: "Previously paid, ended", count: 0, users: [] },
  };

  const push = (segId, profile, reasons) => {
    const seg = segments[segId];
    if (!seg) return;
    seg.count += 1;
    if (seg.users.length < 25 && profile.email) {
      seg.users.push({
        user: String(profile.email).replace(/(.{2}).+(@.+)/, "$1…$2"),
        signupDate: String(profile.signupAt || "").slice(0, 10) || "—",
        lastActive: String(profile.lastActive || "").slice(0, 16).replace("T", " ") || "—",
        reasons,
      });
    }
  };

  for (const profile of profiles.values()) {
    const signupMs = profile.signupAt ? new Date(String(profile.signupAt)).getTime() : 0;
    const lastActiveMs = profile.lastActive ? new Date(String(profile.lastActive)).getTime() : 0;
    const ageDays = signupMs ? (nowMs - signupMs) / 86400000 : 0;
    const sessions = profile.sessions instanceof Set ? profile.sessions.size : Number(profile.sessions) || 0;
    const activated = Boolean(profile.activated);
    const converted = Boolean(profile.converted);

    // F. Previously paid, ended
    if (profile.hadPaidHistory && !profile.hasProAccess) {
      push("previously_paid_ended", profile, ["firstPaidInvoiceAt present", "no current Pro access"]);
    }

    if (converted) continue;

    // A. Signup, never meaningful use — maturity ≥3 days
    if (signupMs && ageDays >= 3 && !activated) {
      push("never_meaningful_use", profile, ["not activated", "signup ≥3 days ago"]);
    }

    // B. Activated, never returned — activation ≥7 days, no event after activation+1d
    const actMs = Number(profile.activatedAtMs || 0);
    if (activated && actMs && (nowMs - actMs) >= 7 * 86400000) {
      const afterCutoff = actMs + 86400000;
      const returned = /** @type {Array<unknown>} */ (profile.events || []).some((e) => eventTime(e) > afterCutoff);
      if (!returned) {
        push("activated_never_returned", profile, ["no event after activation + 1 day", "activation ≥7 days ago"]);
      }
    }

    // C. Returned, then disappeared
    if (sessions >= 2 && lastActiveMs && (nowMs - lastActiveMs) >= 7 * 86400000 && !converted) {
      push("returned_then_disappeared", profile, ["≥2 sessions", "lastActive >7 days ago"]);
    }

    // D. High engagement, never purchased — signup ≥7 days
    // Intent computed by caller via computeIntentScore — we approximate with signals.
    const highSignals = Number(profile.pricingViews) >= 1
      && Number(profile.upgradeClicks) >= 1
      && (Number(profile.lessonViews) >= 3 || Number(profile.proEncounters) >= 1);
    if (signupMs && ageDays >= 7 && highSignals && !converted) {
      push("high_engagement_never_purchased", profile, ["strong buying signals", "signup ≥7 days", "not converted"]);
    }

    // E. Checkout started, no completion — checkout ≥2 days old
    if (Number(profile.checkoutStarts) > 0 && !converted) {
      let lastCheckoutMs = 0;
      for (const ev of /** @type {Array<unknown>} */ (profile.events || [])) {
        if (resolveCanonicalEvent(ev) === "checkout_started") {
          lastCheckoutMs = Math.max(lastCheckoutMs, eventTime(ev));
        }
      }
      if (lastCheckoutMs && (nowMs - lastCheckoutMs) >= 2 * 86400000) {
        push("checkout_no_completion", profile, ["checkout started", "no authoritative paid", "checkout ≥2 days ago"]);
      }
    }
  }

  return {
    note: "Very new users are excluded via maturity guards.",
    segments: Object.values(segments),
  };
}

/**
 * Read-only high-intent action queue categories (no persistence).
 * @param {Map<string, Record<string, unknown>>} profiles
 * @param {(profile: Record<string, unknown>) => { level: string, score: number, reasons: string[] }} intentFn
 * @param {number} [nowMs]
 */
function buildHighIntentQueue(profiles, intentFn, nowMs = Date.now()) {
  const rows = [];
  for (const profile of profiles.values()) {
    if (profile.converted) continue;
    if (!profile.email) continue;
    /** @type {string[]} */
    const categories = [];
    const sessions = profile.sessions instanceof Set ? profile.sessions.size : Number(profile.sessions) || 0;
    const activated = Boolean(profile.activated);

    const hasAbandonEvent = /** @type {Array<unknown>} */ (profile.events || []).some(
      (e) => String(/** @type {{ name?: string }} */ (e).name || "") === "pro_checkout_abandoned",
    );
    let lastCheckoutMs = 0;
    for (const ev of /** @type {Array<unknown>} */ (profile.events || [])) {
      if (resolveCanonicalEvent(ev) === "checkout_started") lastCheckoutMs = Math.max(lastCheckoutMs, eventTime(ev));
    }
    const checkoutMature = lastCheckoutMs && (nowMs - lastCheckoutMs) >= 2 * 86400000;
    if (Number(profile.checkoutStarts) > 0 && (hasAbandonEvent || (checkoutMature && !profile.checkoutCompleted))) {
      categories.push("Checkout abandoned");
    }
    if (Number(profile.pricingViews) >= 2) categories.push("Pricing viewed repeatedly");
    if (Number(profile.proEncounters) >= 2) categories.push("Repeated Pro encounters");
    if (sessions >= 2 && !activated) categories.push("Returned multiple times, still free");
    const intent = typeof intentFn === "function" ? intentFn(profile) : { level: "Low engagement", score: 0, reasons: [] };
    if (intent.level === "High purchase intent") categories.push("Highly engaged free user");
    const isSignup = Boolean(profile.signupAt)
      || /** @type {Array<unknown>} */ (profile.events || []).some((e) => resolveCanonicalEvent(e) === "account_created");
    if (isSignup && !activated) categories.push("Signup, no activation");

    if (!categories.length && intent.level === "Low engagement") continue;
    if (!categories.length) continue;

    rows.push({
      user: String(profile.email).replace(/(.{2}).+(@.+)/, "$1…$2"),
      email: profile.email,
      signupDate: String(profile.signupAt || "").slice(0, 10) || "—",
      source: profile.source || "Unknown",
      categories,
      intentLevel: intent.level,
      intentScore: intent.score,
      sessions,
      lessonsViewed: Number(profile.lessonViews) || 0,
      pricingViews: Number(profile.pricingViews) || 0,
      upgradeClicks: Number(profile.upgradeClicks) || 0,
      checkoutStarted: Number(profile.checkoutStarts) > 0 ? "Yes" : "No",
      lastActive: String(profile.lastActive || "").slice(0, 16).replace("T", " ") || "—",
    });
  }
  return rows.sort((a, b) => b.intentScore - a.intentScore || b.categories.length - a.categories.length).slice(0, 50);
}

/**
 * Extend CTA performance with unique-actor impressions + CTR.
 * Avoids double-counting historical upgrade_prompt_shown and new upgrade_cta_impression.
 * @param {Array<unknown>} events
 */
function buildCtaPerformanceWithImpressions(events) {
  /** @type {Map<string, {
   *  cta: string,
   *  impressionActors: Set<string>,
   *  clickActors: Set<string>,
   *  checkoutActors: Set<string>,
   *  purchaseActors: Set<string>,
   *  clicks: number,
   * }>} */
  const ctas = new Map();
  /** @type {Map<string, { checkout: boolean, purchased: boolean }>} */
  const actorState = new Map();
  /** Actors who already got an impression credited via new canonical event (prevents historical double-count). */
  /** @type {Set<string>} */
  const canonicalImpressionKeys = new Set();

  const ensure = (cta) => {
    if (!ctas.has(cta)) {
      ctas.set(cta, {
        cta,
        impressionActors: new Set(),
        clickActors: new Set(),
        checkoutActors: new Set(),
        purchaseActors: new Set(),
        clicks: 0,
      });
    }
    return /** @type {NonNullable<ReturnType<typeof ctas.get>>} */ (ctas.get(cta));
  };

  for (const event of events) {
    const actor = eventActorKey(event);
    if (!actor) continue;
    if (!actorState.has(actor)) actorState.set(actor, { checkout: false, purchased: false });
    const state = /** @type {NonNullable<ReturnType<typeof actorState.get>>} */ (actorState.get(actor));
    const name = String(/** @type {{ name?: string }} */ (event).name || "");
    const canonical = resolveCanonicalEvent(event);
    if (canonical === "checkout_started") state.checkout = true;
    if (canonical === "checkout_completed" || canonical === "paid_subscription_active") state.purchased = true;

    if (isCtaImpressionEvent(event)) {
      const cta = extractCtaLocation(event);
      const row = ensure(cta);
      const key = `${actor}|${cta}`;
      if (name === "upgrade_cta_impression") {
        canonicalImpressionKeys.add(key);
        row.impressionActors.add(actor);
      } else if (name === "upgrade_prompt_shown") {
        // Historical evidence only if no new canonical impression for same actor+cta.
        if (!canonicalImpressionKeys.has(key)) {
          row.impressionActors.add(actor);
        }
      }
    }

    if (canonical === "upgrade_cta_clicked") {
      const cta = extractCtaLocation(event);
      const row = ensure(cta);
      row.clicks += 1;
      row.clickActors.add(actor);
    }
  }

  for (const row of ctas.values()) {
    for (const actor of row.clickActors) {
      const state = actorState.get(actor);
      if (!state) continue;
      if (state.checkout) row.checkoutActors.add(actor);
      if (state.purchased) row.purchaseActors.add(actor);
    }
  }

  return [...ctas.values()].map((row) => {
    const impressions = row.impressionActors.size;
    const uniqueClicks = row.clickActors.size;
    return {
      cta: row.cta,
      impressions,
      clicks: row.clicks,
      uniqueClicks,
      ctr: rateLabel(uniqueClicks, impressions),
      ctrPct: ratePct(uniqueClicks, impressions),
      checkoutStarts: row.checkoutActors.size,
      purchases: row.purchaseActors.size,
      conversionRate: rateLabel(row.purchaseActors.size, uniqueClicks || row.clicks),
      conversionRatePct: ratePct(row.purchaseActors.size, uniqueClicks || row.clicks),
    };
  }).sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks);
}

module.exports = {
  computeActivationState,
  enrichProfilesPhase2,
  buildActivation,
  buildSignupCohorts,
  buildCampaignAttribution,
  buildPersonaSegmentation,
  buildAgeGroupSegmentation,
  buildOfferAttribution,
  buildLessonPurchaseAssociation,
  buildLostUserSegments,
  buildHighIntentQueue,
  buildCtaPerformanceWithImpressions,
};
