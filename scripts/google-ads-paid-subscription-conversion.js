(function attachGoogleAdsPaidSubscriptionConversion(root) {
  "use strict";

  const SEND_TO = "AW-18405245658/oFU5CM7VwYAdENqFp8hE";
  const DISPATCHED_PREFIX = "llhGoogleAdsPaidSubscriptionConversion:";

  function hasAdvertisingConsent() {
    try {
      return root.LLHGoogleConsent?.hasConsent?.() === true;
    } catch {
      return false;
    }
  }

  function emitAfterPaidSubscriptionConfirmed({ sessionId, amountTotal, currency, trialDays = 0 } = {}) {
    try {
      const cleanSessionId = String(sessionId || "").trim();
      const cleanCurrency = String(currency || "").trim().toUpperCase();
      const cents = Number(amountTotal);
      if (!hasAdvertisingConsent() || !cleanSessionId || Number(trialDays) > 0 || cleanCurrency !== "USD" || !(cents > 0)) {
        return false;
      }
      if (typeof root.gtag !== "function") return false;
      const dedupeKey = `${DISPATCHED_PREFIX}${cleanSessionId}`;
      if (root.sessionStorage.getItem(dedupeKey) === "1") return false;
      root.gtag("event", "conversion", {
        send_to: SEND_TO,
        value: cents / 100,
        currency: cleanCurrency,
        transaction_id: cleanSessionId,
      });
      root.sessionStorage.setItem(dedupeKey, "1");
      return true;
    } catch {
      return false;
    }
  }

  root.LLHGoogleAdsPaidSubscriptionConversion = Object.freeze({
    emitAfterPaidSubscriptionConfirmed,
  });
})(window);
