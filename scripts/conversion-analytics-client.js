/**
 * Conversion Intelligence — typed client event helpers with deduplication.
 * Analytics failures must never break normal user functionality.
 */
(function conversionAnalyticsClient(global) {
  const DEDUPE_PREFIX = "llhConvDedupe:";
  const SESSION_KEY = "llhConvSessionStarted";

  /** @type {readonly string[]} */
  const VIEW_EVENTS = Object.freeze([
    "session_started",
    "lesson_viewed",
    "activity_viewed",
    "printable_viewed",
    "pricing_viewed",
    "pro_content_encountered",
    "premium_preview_seen",
    "free_week_started",
    "free_activity_used",
    "subscription_confirmed",
  ]);

  /**
   * @param {string} name
   * @param {Record<string, string|number|boolean|undefined>} [detail]
   * @returns {string}
   */
  function dedupeKey(name, detail = {}) {
    const parts = [name];
    if (detail.resourceId) parts.push(String(detail.resourceId));
    if (detail.lessonId) parts.push(String(detail.lessonId));
    if (detail.ctaLocation) parts.push(String(detail.ctaLocation));
    if (detail.featureType) parts.push(String(detail.featureType));
    if (detail.location) parts.push(String(detail.location));
    if (name === "session_started") parts.push("session");
    return parts.join(":");
  }

  /**
   * @param {string} key
   * @returns {boolean}
   */
  function wasRecentlyTracked(key) {
    try {
      const raw = sessionStorage.getItem(`${DEDUPE_PREFIX}${key}`);
      if (!raw) return false;
      const ts = Number(raw);
      if (!Number.isFinite(ts)) return false;
      return Date.now() - ts < 30 * 60 * 1000;
    } catch {
      return false;
    }
  }

  /**
   * @param {string} key
   */
  function markTracked(key) {
    try {
      sessionStorage.setItem(`${DEDUPE_PREFIX}${key}`, String(Date.now()));
    } catch {
      /* ignore */
    }
  }

  /**
   * @param {string} name
   * @param {Record<string, string|number|boolean|undefined>} [detail]
   */
  function trackConversionEvent(name, detail = {}) {
    try {
      if (typeof global.trackEvent !== "function") return;
      const key = dedupeKey(name, detail);
      if (VIEW_EVENTS.includes(name) && wasRecentlyTracked(key)) return;
      if (VIEW_EVENTS.includes(name)) markTracked(key);
      global.trackEvent(name, detail);
    } catch (error) {
      try {
        console.warn("[conversion-analytics] track failed:", error?.message || error);
      } catch {
        /* ignore */
      }
    }
  }

  function ensureSessionStarted() {
    try {
      if (sessionStorage.getItem(SESSION_KEY) === "1") return;
      sessionStorage.setItem(SESSION_KEY, "1");
      trackConversionEvent("session_started", { location: global.location?.pathname || "/" });
    } catch {
      /* ignore */
    }
  }

  /**
   * @param {Record<string, string|number|boolean|undefined>} detail
   */
  function trackProContentEncountered(detail = {}) {
    trackConversionEvent("pro_content_encountered", detail);
  }

  /**
   * @param {Record<string, string|number|boolean|undefined>} detail
   */
  function trackLessonViewed(detail = {}) {
    trackConversionEvent("lesson_viewed", detail);
  }

  /**
   * @param {Record<string, string|number|boolean|undefined>} detail
   */
  function trackActivityViewed(detail = {}) {
    trackConversionEvent("activity_viewed", detail);
  }

  /**
   * @param {Record<string, string|number|boolean|undefined>} detail
   */
  function trackPricingViewed(detail = {}) {
    trackConversionEvent("pricing_viewed", detail);
  }

  /**
   * @param {Record<string, string|number|boolean|undefined>} detail
   */
  function trackUpgradeCtaClicked(detail = {}) {
    trackConversionEvent("upgrade_cta_clicked", detail);
  }

  /**
   * @param {Record<string, string|number|boolean|undefined>} detail
   */
  function trackLessonSaved(detail = {}) {
    trackConversionEvent("lesson_saved", detail);
  }

  /**
   * @param {Record<string, string|number|boolean|undefined>} detail
   */
  function trackPrintableViewed(detail = {}) {
    trackConversionEvent("printable_viewed", detail);
  }

  /**
   * Deduped CTA impression — keyed by ctaLocation + promptId.
   * @param {Record<string, string|number|boolean|undefined>} detail
   */
  function trackUpgradeCtaImpression(detail = {}) {
    try {
      if (typeof global.trackEvent !== "function") return;
      const ctaLocation = String(detail.ctaLocation || detail.location || detail.promptId || "other");
      const promptId = String(detail.promptId || "");
      const key = dedupeKey("upgrade_cta_impression", { ctaLocation, promptId, location: ctaLocation });
      if (wasRecentlyTracked(key)) return;
      markTracked(key);
      global.trackEvent("upgrade_cta_impression", {
        ...detail,
        ctaLocation,
        promptId: promptId || undefined,
      });
    } catch (error) {
      try {
        console.warn("[conversion-analytics] impression track failed:", error?.message || error);
      } catch {
        /* ignore */
      }
    }
  }

  global.LLHConversionAnalytics = Object.freeze({
    trackConversionEvent,
    trackProContentEncountered,
    trackLessonViewed,
    trackActivityViewed,
    trackPricingViewed,
    trackUpgradeCtaClicked,
    trackUpgradeCtaImpression,
    trackLessonSaved,
    trackPrintableViewed,
    ensureSessionStarted,
    dedupeKey,
    wasRecentlyTracked,
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureSessionStarted, { once: true });
  } else {
    ensureSessionStarted();
  }
})(typeof window !== "undefined" ? window : globalThis);
