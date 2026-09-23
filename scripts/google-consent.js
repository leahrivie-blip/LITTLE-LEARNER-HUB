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
  const suppressMetaWhileGoogleOpen = () => {
    const meta = document.getElementById("llhMetaCookieNotice");
    if (!meta) return;
    meta.setAttribute("data-google-consent-suppressed", "1");
    meta.setAttribute("aria-hidden", "true");
    meta.hidden = true;
    meta.style.display = "none";
    try { document.body.classList.remove("has-meta-cookie-notice"); } catch { /* ignore */ }
  };
  const restoreMetaAfterGoogleClosed = () => {
    const meta = document.getElementById("llhMetaCookieNotice");
    try { document.body.classList.remove("has-google-consent-banner"); } catch { /* ignore */ }
    if (!meta || meta.getAttribute("data-google-consent-suppressed") !== "1") return;
    meta.removeAttribute("data-google-consent-suppressed");
    meta.removeAttribute("aria-hidden");
    meta.hidden = false;
    meta.style.display = "";
    try { document.body.classList.add("has-meta-cookie-notice"); } catch { /* ignore */ }
  };
  const open = () => {
    document.getElementById("llhGoogleConsentBanner")?.remove();
    try { document.body.classList.remove("has-google-consent-banner"); } catch { /* ignore */ }
    suppressMetaWhileGoogleOpen();
    const current = read();
    const banner = document.createElement("section");
    banner.id = "llhGoogleConsentBanner";
    banner.className = "llh-meta-cookie-notice llh-google-consent-banner";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-label", "Analytics and advertising preferences");
    banner.innerHTML = `<p>Optional analytics and advertising: ${current?.granted === true ? "accepted" : current?.granted === false ? "rejected" : "not decided"}. See our <a href="/privacy">Privacy Policy</a>.</p><button type="button" data-google-consent="accept">Accept analytics and advertising</button><button type="button" data-google-consent="reject">Reject optional tracking</button><button type="button" data-google-consent="withdraw">Withdraw consent</button>`;
    banner.addEventListener("click", (event) => {
      const choice = event.target?.dataset?.googleConsent;
      if (!choice) return;
      const granted = choice === "accept";
      if (!granted) clearAdvertisingIdentifiers();
      update(granted);
      try {
        if (banner.__llhConsentResize) root.removeEventListener("resize", banner.__llhConsentResize);
        document.body.style.removeProperty("--llh-consent-reserve");
      } catch { /* ignore */ }
      banner.remove();
      restoreMetaAfterGoogleClosed();
      try {
        if (typeof root.ensureMetaCookieNotice === "function") root.ensureMetaCookieNotice();
      } catch { /* optional */ }
    });
    document.body.appendChild(banner);
    // Reserve space under the fixed banner so signed-in calendar/binder/print
    // controls are not covered (must not silently drop body padding).
    try { document.body.classList.add("has-google-consent-banner"); } catch { /* ignore */ }
    const syncConsentReserve = () => {
      try {
        const height = Math.ceil(banner.getBoundingClientRect().height || 0);
        if (!height) return;
        const reserve = Math.max(112, height + 20);
        document.body.style.setProperty("--llh-consent-reserve", `${reserve}px`);
      } catch { /* ignore */ }
    };
    syncConsentReserve();
    try {
      root.requestAnimationFrame(syncConsentReserve);
      root.addEventListener("resize", syncConsentReserve, { passive: true });
      banner.__llhConsentResize = syncConsentReserve;
    } catch { /* optional */ }
  };
  const existing = read();
  if (existing && typeof existing.granted === "boolean") update(existing.granted);
  if (!existing || typeof existing.granted !== "boolean" || root.location.pathname === "/privacy-settings") open();
  root.LLHGoogleConsent = Object.freeze({ update, read, open, hasConsent: () => read()?.granted === true });
})(window, document);
