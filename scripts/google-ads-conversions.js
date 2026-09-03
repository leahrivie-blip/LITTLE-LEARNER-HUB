(function attachGoogleAdsConversions(root) {
  "use strict";

  const SEND_TO = Object.freeze({
    free_signup: "AW-18405245658/fkIMCOi6xO0cENqFp8hE",
    trial_start: "AW-18405245658/yNEYCOu6xO0cENqFp8hE",
    paid_subscription: "AW-18405245658/uUk_CO66xO0cENqFp8hE",
  });

  function emit(type, details = {}) {
    if (!Object.prototype.hasOwnProperty.call(SEND_TO, type) || typeof root.gtag !== "function") return false;
    const payload = { send_to: SEND_TO[type] };
    if (type === "paid_subscription") {
      const value = Number(details.value);
      const currency = String(details.currency || "").toUpperCase();
      const transactionId = String(details.transactionId || "").trim();
      if (!transactionId || !Number.isFinite(value) || value < 0 || !/^[A-Z]{3}$/.test(currency)) return false;
      payload.value = value;
      payload.currency = currency;
      payload.transaction_id = transactionId;
    }
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
