(function attachGoogleAdsConversions(root) {
  "use strict";

  const SEND_TO = Object.freeze({
    free_signup: "AW-18405245658/fkIMCOi6xO0cENqFp8hE",
    trial_start: "AW-18405245658/yNEYCOu6xO0cENqFp8hE",
  });

  function emit(type, details = {}) {
    if (!Object.prototype.hasOwnProperty.call(SEND_TO, type) || typeof root.gtag !== "function") return false;
    const payload = { send_to: SEND_TO[type], value: 0, currency: "USD" };
    const key = `llhGoogleAds:${type}:${String(details.dedupeKey || "")}`;
    try {
      if (!details.dedupeKey || root.sessionStorage.getItem(key)) return false;
      root.sessionStorage.setItem(key, "1");
    } catch {
      return false;
    }
    try {
      root.gtag("event", "conversion", payload);
      return true;
    } catch {
      return false;
    }
  }

  root.LLHGoogleAdsConversions = Object.freeze({ emit });
})(window);
