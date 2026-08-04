/**
 * Tiny boot helpers that run before the large app.js finishes.
 * - Shows homepage HTML immediately (never leave testers on a blank shell)
 * - Queues Log In / Sign Up until openAuthModal exists
 * - Loads app.js after first paint so marketing content is visible first
 */
(function () {
  "use strict";

  const APP_SRC = "app.js?v=20260804-js-split-r2";
  const ONBOARDING_SRC = "scripts/new-user-onboarding.js?v=20260804-free-ux-phase2-r1";
  let appLoadStarted = false;

  function ensureStatusNode() {
    let el = document.getElementById("llhLazyStatus");
    if (el) return el;
    el = document.createElement("div");
    el.id = "llhLazyStatus";
    el.className = "llh-lazy-status";
    el.hidden = true;
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    (document.body || document.documentElement).appendChild(el);
    return el;
  }

  function setStatus(text) {
    const el = ensureStatusNode();
    el.hidden = !text;
    el.textContent = text || "";
  }

  function revealHomeIfStuck() {
    // Early boot CSS can hide inactive views for returning users until app-boot-ready.
    // Keep a usable home shell so testers never see "login buttons only".
    try {
      document.documentElement.classList.remove("llh-boot-authenticated");
      const home = document.getElementById("view-home");
      if (home && !document.body.classList.contains("app-boot-ready")) {
        home.classList.add("active-view");
        home.removeAttribute("hidden");
        home.style.display = "";
      }
    } catch (_error) { /* ignore */ }
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[data-llh-core="${src}"]`)) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.async = false;
      script.dataset.llhCore = src;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.body.appendChild(script);
    });
  }

  function startCoreAppLoad() {
    if (appLoadStarted) return;
    appLoadStarted = true;
    setStatus("Loading Little Learner Hub…");
    loadScript(APP_SRC)
      .then(() => loadScript(ONBOARDING_SRC))
      .then(() => {
        // app.js will clear status via markAppBootReady; keep a soft fallback.
        window.setTimeout(() => {
          if (document.body.classList.contains("app-boot-ready")) setStatus("");
        }, 500);
      })
      .catch((error) => {
        console.error("[llh-boot]", error);
        setStatus("Could not finish loading. Please refresh.");
        revealHomeIfStuck();
      });
  }

  function queueAuth(mode) {
    setStatus("Loading Little Learner Hub…");
    startCoreAppLoad();
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (typeof window.openAuthModal === "function") {
        window.clearInterval(timer);
        setStatus("");
        try { window.openAuthModal(mode); } catch (_error) { /* ignore */ }
        return;
      }
      if (Date.now() - started > 90000) {
        window.clearInterval(timer);
        setStatus("Loading is taking longer than usual. Please refresh and try again.");
        revealHomeIfStuck();
      }
    }, 200);
  }

  document.addEventListener("click", (event) => {
    const openLogin = event.target.closest?.("[data-action='open-login'], #signinButton");
    const startFree = event.target.closest?.("[data-action='start-free'], #getStartedButton, #createAccountButton");
    if (!openLogin && !startFree) return;
    if (typeof window.openAuthModal === "function") return;
    event.preventDefault();
    event.stopPropagation();
    queueAuth(startFree ? "signup" : "login");
  }, true);

  function onReady() {
    ensureStatusNode();
    revealHomeIfStuck();
    // Safety: never keep the authenticated boot hide in place for more than a few seconds.
    window.setTimeout(() => {
      if (!document.body.classList.contains("app-boot-ready")) revealHomeIfStuck();
    }, 2500);
    // Load the large app after first paint so homepage content is visible first.
    const start = () => startCoreAppLoad();
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => window.requestAnimationFrame(start));
    } else {
      window.setTimeout(start, 0);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onReady);
  } else {
    onReady();
  }

  const observer = new MutationObserver(() => {
    if (document.body.classList.contains("app-boot-ready")) {
      setStatus("");
      observer.disconnect();
    }
  });
  function observeBody() {
    if (!document.body) return;
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
  }
  if (document.body) observeBody();
  else document.addEventListener("DOMContentLoaded", observeBody);

  window.LLHBootCritical = { setStatus, queueAuth, startCoreAppLoad, revealHomeIfStuck };
})();
