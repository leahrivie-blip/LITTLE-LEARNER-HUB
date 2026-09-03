(function attachGoogleAdsFreeSignupConversion(root) {
  "use strict";

  const SEND_TO = "AW-18405245658/fkIMCOi6xO0cENqFp8hE";
  const ACCOUNT_CREATED_KEY = "llhGoogleAdsFreeSignupAccountCreated";
  const DISPATCHED_KEY = "llhGoogleAdsFreeSignupConversionDispatched";

  function canUseAdvertisingMeasurement() {
    try {
      return root.LLHGoogleConsent?.hasConsent?.() === true;
    } catch {
      return false;
    }
  }

  function markAccountCreated() {
    try {
      root.sessionStorage.setItem(ACCOUNT_CREATED_KEY, "1");
      return true;
    } catch {
      return false;
    }
  }

  function emitAfterFreeSignupCompletion() {
    try {
      if (!canUseAdvertisingMeasurement()) return false;
      if (root.sessionStorage.getItem(ACCOUNT_CREATED_KEY) !== "1") return false;
      if (root.sessionStorage.getItem(DISPATCHED_KEY) === "1") return false;
      if (typeof root.gtag !== "function") return false;
      root.sessionStorage.setItem(DISPATCHED_KEY, "1");
      root.gtag("event", "conversion", { send_to: SEND_TO });
      return true;
    } catch {
      return false;
    }
  }

  root.LLHGoogleAdsFreeSignupConversion = Object.freeze({
    markAccountCreated,
    emitAfterFreeSignupCompletion,
  });
})(window);
