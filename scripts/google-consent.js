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
  const clearAdvertisingIdentifiers = () => {
    try {
      ["gclid", "gbraid", "wbraid"].forEach((key) => root.localStorage.removeItem(key));
      root.localStorage.removeItem("llhAttribution");
    } catch { /* optional storage */ }
  };
  const open = () => {
    document.getElementById("llhGoogleConsentBanner")?.remove();
    const current = read();
    const banner = document.createElement("section");
    banner.id = "llhGoogleConsentBanner";
    banner.className = "llh-meta-cookie-notice";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-label", "Analytics and advertising preferences");
    banner.innerHTML = `<p>Optional analytics and advertising: ${current?.granted === true ? "accepted" : current?.granted === false ? "rejected" : "not decided"}. See our <a href="/privacy">Privacy Policy</a>.</p><button type="button" data-google-consent="accept">Accept analytics and advertising</button><button type="button" data-google-consent="reject">Reject optional tracking</button><button type="button" data-google-consent="withdraw">Withdraw consent</button>`;
    banner.addEventListener("click", (event) => {
      const choice = event.target?.dataset?.googleConsent;
      if (!choice) return;
      const granted = choice === "accept";
      if (!granted) clearAdvertisingIdentifiers();
      update(granted);
      banner.remove();
    });
    document.body.appendChild(banner);
  };
  const existing = read();
  if (existing && typeof existing.granted === "boolean") update(existing.granted);
  if (!existing || typeof existing.granted !== "boolean" || root.location.pathname === "/privacy-settings") open();
  root.LLHGoogleConsent = Object.freeze({ update, read, open, hasConsent: () => read()?.granted === true });
})(window, document);
