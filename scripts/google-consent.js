(function googleConsent(root, document) {
  "use strict";
  const KEY = "llhGoogleConsent";
  const read = () => {
    try { return JSON.parse(root.localStorage.getItem(KEY) || "null"); } catch { return null; }
  };
  const update = (granted) => {
    const value = granted ? "granted" : "denied";
    try { root.localStorage.setItem(KEY, JSON.stringify({ granted, decidedAt: new Date().toISOString() })); } catch { /* optional storage */ }
    if (typeof root.gtag === "function") root.gtag("consent", "update", {
      ad_storage: value, analytics_storage: value, ad_user_data: value, ad_personalization: value,
    });
  };
  const existing = read();
  if (existing && typeof existing.granted === "boolean") update(existing.granted);
  if (existing && typeof existing.granted === "boolean") {
    root.LLHGoogleConsent = Object.freeze({ update, read });
    return;
  }
  if (document.getElementById("llhGoogleConsentBanner")) return;
  const banner = document.createElement("section");
  banner.id = "llhGoogleConsentBanner";
  banner.className = "llh-meta-cookie-notice";
  banner.setAttribute("role", "dialog");
  banner.setAttribute("aria-label", "Analytics and advertising preferences");
  banner.innerHTML = '<p>Choose whether Little Learner Hub may use optional analytics and advertising measurement. See our <a href="/privacy">Privacy Policy</a>.</p><button type="button" data-google-consent="accept">Accept analytics and advertising</button><button type="button" data-google-consent="reject">Reject optional tracking</button>';
  banner.addEventListener("click", (event) => {
    const choice = event.target?.dataset?.googleConsent;
    if (!choice) return;
    update(choice === "accept");
    banner.remove();
  });
  document.body.appendChild(banner);
  root.LLHGoogleConsent = Object.freeze({ update, read });
})(window, document);
