/**
 * Tiny boot helpers that run before the large app.js finishes.
 * - Shows homepage HTML immediately (never leave testers on a blank shell)
 * - Queues Log In / Sign Up / primary nav until app helpers exist
 * - Loads app.js after first paint so marketing content is visible first
 */
(function () {
  "use strict";

  const APP_SRC = "app.js?v=20260804-js-split-r3";
  const ONBOARDING_SRC = "scripts/new-user-onboarding.js?v=20260804-free-ux-phase2-r1";
  let appLoadStarted = false;
  let appScriptLoaded = false;

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
      .then(() => {
        appScriptLoaded = true;
        setStatus("Starting Little Learner Hub…");
        return loadScript(ONBOARDING_SRC);
      })
      .then(() => {
        // app.js clears status via markAppBootReady; keep a soft fallback.
        window.setTimeout(() => {
          if (document.body.classList.contains("app-boot-ready")) setStatus("");
        }, 500);
        // Guests: if verification/boot never flips ready, still clear the sticky pill
        // so the page does not look permanently broken while content remains usable.
        window.setTimeout(() => {
          if (!document.body.classList.contains("app-boot-ready")) {
            setStatus("Still starting… you can keep browsing this page.");
          }
        }, 20000);
        window.setTimeout(() => {
          if (!document.body.classList.contains("app-boot-ready")) setStatus("");
        }, 45000);
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

  function queueNav(view) {
    if (!view) return;
    setStatus("Loading Little Learner Hub…");
    startCoreAppLoad();
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (typeof window.setView === "function" && document.body.classList.contains("app-boot-ready")) {
        window.clearInterval(timer);
        setStatus("");
        try { window.setView(view); } catch (_error) { /* ignore */ }
        return;
      }
      if (typeof window.setView === "function" && appScriptLoaded && Date.now() - started > 8000) {
        // App parsed but boot-ready gate still pending — try the navigation anyway.
        window.clearInterval(timer);
        try { window.setView(view, { allowDuringBootVerification: true }); } catch (_error) { /* ignore */ }
        return;
      }
      if (Date.now() - started > 90000) {
        window.clearInterval(timer);
        setStatus("Loading is taking longer than usual. Please refresh and try again.");
      }
    }, 250);
  }

  document.addEventListener("click", (event) => {
    const openLogin = event.target.closest?.("[data-action='open-login'], #signinButton");
    const startFree = event.target.closest?.("[data-action='start-free'], #getStartedButton, #createAccountButton");
    if (openLogin || startFree) {
      if (typeof window.openAuthModal === "function") return;
      event.preventDefault();
      event.stopPropagation();
      queueAuth(startFree ? "signup" : "login");
      return;
    }

    // Sidebar / bottom-nav data-view clicks before app.js is ready.
    const nav = event.target.closest?.("[data-view]");
    if (!nav) return;
    if (typeof window.setView === "function" && document.body.classList.contains("app-boot-ready")) return;
    const view = nav.getAttribute("data-view");
    if (!view || view === "home") return;
    event.preventDefault();
    event.stopPropagation();
    queueNav(view);
  }, true);

  function onReady() {
    ensureStatusNode();
    revealHomeIfStuck();
    // Safety: never keep the authenticated boot hide in place for more than a few seconds.
    window.setTimeout(() => {
      if (!document.body.classList.contains("app-boot-ready")) revealHomeIfStuck();
    }, 2500);
    // Load the large app after first paint so homepage content is visible first.
    // Preload in <head> should already be fetching app.js by this point.
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

  window.LLHBootCritical = { setStatus, queueAuth, queueNav, startCoreAppLoad, revealHomeIfStuck };
})();
