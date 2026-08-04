/**
 * Tiny boot helpers that run before the large app.js finishes.
 * - Shows homepage HTML immediately (never leave testers on a blank shell)
 * - /admin: show unlock form immediately and login via API without waiting for app.js
 * - Queues Log In / Sign Up / primary nav until app helpers exist
 * - Loads app.js after first paint so marketing content is visible first
 */
(function () {
  "use strict";

  const APP_SRC = "app.js?v=20260804-js-split-r4";
  const ONBOARDING_SRC = "scripts/new-user-onboarding.js?v=20260804-free-ux-phase2-r1";
  let appLoadStarted = false;
  let appScriptLoaded = false;
  let earlyAdminWired = false;

  function isAdminRoute() {
    try {
      return /^\/admin\/?$/i.test(window.location.pathname || "")
        || document.documentElement.classList.contains("llh-boot-admin-route");
    } catch (_error) {
      return false;
    }
  }

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
    if (isAdminRoute()) return;
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

  function showAdminViewEarly() {
    try {
      document.documentElement.classList.add("llh-boot-admin-route");
      document.documentElement.classList.remove("llh-boot-authenticated");
      const home = document.getElementById("view-home");
      const admin = document.getElementById("view-admin");
      if (home) {
        home.classList.remove("active-view");
        home.style.display = "none";
      }
      if (admin) {
        admin.classList.add("active-view");
        admin.removeAttribute("hidden");
        admin.style.display = "block";
      }
      const protectedContent = document.getElementById("adminProtectedContent");
      if (protectedContent && !isAdminSessionStored()) {
        protectedContent.hidden = true;
      }
    } catch (_error) { /* ignore */ }
  }

  function isAdminSessionStored() {
    try {
      if (localStorage.getItem("llhAdminUnlocked") !== "true") return false;
      const raw = localStorage.getItem("llhAdminSession");
      if (!raw) return false;
      const session = JSON.parse(raw);
      return Boolean(session && session.token);
    } catch (_error) {
      return false;
    }
  }

  function rememberedAdminEmail() {
    try {
      return String(localStorage.getItem("llhAdminRememberEmail") || "").trim();
    } catch (_error) {
      return "";
    }
  }

  function saveEarlyAdminSession(sessionDetail, trustDevice) {
    const session = {
      email: sessionDetail?.email || "",
      name: sessionDetail?.name || "Owner",
      token: sessionDetail?.token || "",
      mode: sessionDetail?.mode || "server",
      loggedInAt: new Date().toISOString(),
      trustedDevice: trustDevice !== false,
    };
    localStorage.setItem("llhAdminSession", JSON.stringify(session));
    localStorage.setItem("llhAdminUnlocked", "true");
    if (session.email) localStorage.setItem("llhAdminRememberEmail", session.email);
    if (trustDevice !== false) localStorage.setItem("llhAdminRememberDevice", "true");
    else localStorage.removeItem("llhAdminRememberDevice");
    if (!localStorage.getItem("llhAdminPreviewMode")) {
      localStorage.setItem("llhAdminPreviewMode", "Admin");
    }
    localStorage.setItem("llhAdminLastView", "admin");
    return session;
  }

  function ensureEarlyAdminShell() {
    const lockPanel = document.getElementById("adminLockPanel");
    if (!lockPanel) return null;
    let form = lockPanel.querySelector("#adminUnlockForm");
    if (form) return form;
    const emailValue = rememberedAdminEmail().replace(/"/g, "&quot;");
    lockPanel.innerHTML = `
      <div class="admin-lock-content" data-llh-early-admin-shell>
        <div>
          <p class="eyebrow">Private Owner Area</p>
          <h3>Admin dashboard is protected</h3>
          <p>Log in as the owner to open the testing Admin dashboard.</p>
        </div>
        <form id="adminUnlockForm" class="admin-unlock-form" data-llh-early-admin-form>
          <label>Owner Email<input name="adminEmail" type="email" required value="${emailValue}" placeholder="owner@example.com" autocomplete="username" /></label>
          <label>Owner Password<input name="adminPassword" type="password" required placeholder="Owner password" autocomplete="current-password" /></label>
          <label>Admin Access Code<input name="adminCode" type="password" required placeholder="Enter owner code" autocomplete="off" /></label>
          <label class="checkbox-row admin-trust-device-row">
            <input type="checkbox" name="trustDevice" id="adminTrustDeviceInput" checked />
            <span>Trust this device — keep Admin unlocked</span>
          </label>
          <button class="primary-button" type="submit">Unlock Admin</button>
          <p class="form-note">Works on the testing site even while the full app is still loading.</p>
          <span id="adminUnlockMessage" class="form-message"></span>
        </form>
      </div>
    `;
    return lockPanel.querySelector("#adminUnlockForm");
  }

  function paintEarlyUnlockedBar(session) {
    const lockPanel = document.getElementById("adminLockPanel");
    if (!lockPanel) return;
    const email = (session && session.email) || rememberedAdminEmail() || "owner";
    lockPanel.hidden = false;
    lockPanel.innerHTML = `
      <div class="admin-unlocked-bar" data-llh-early-admin-unlocked>
        <div>
          <p class="eyebrow">Private Owner Area</p>
          <strong>Admin unlocked for ${email}</strong>
          <span>Full Admin tools finish loading in the background. Keep this tab open.</span>
        </div>
        <button class="ghost-button" type="button" id="llhEarlyAdminLockButton">Lock Admin</button>
      </div>
    `;
    const lockBtn = document.getElementById("llhEarlyAdminLockButton");
    if (lockBtn) {
      lockBtn.addEventListener("click", () => {
        try {
          localStorage.removeItem("llhAdminSession");
          localStorage.removeItem("llhAdminUnlocked");
          localStorage.removeItem("llhAdminPreviewMode");
          localStorage.removeItem("llhAdminRememberDevice");
        } catch (_error) { /* ignore */ }
        window.location.reload();
      });
    }
  }

  async function earlyAdminLogin(email, password, code) {
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email, password, code }),
    });
    let data = {};
    try { data = await response.json(); } catch (_error) { data = {}; }
    if (!response.ok) {
      throw new Error(data.error || data.message || "Admin login failed.");
    }
    return data;
  }

  function wireEarlyAdminUnlock() {
    if (earlyAdminWired) return;
    const form = ensureEarlyAdminShell();
    if (!form) return;
    earlyAdminWired = true;

    const emailInput = form.querySelector('[name="adminEmail"]');
    if (emailInput && !emailInput.value) {
      emailInput.value = rememberedAdminEmail();
    }

    // Capture-phase handler so app.js's later submit listener does not block early unlock
    // while the huge bundle is still parsing (or if it never finishes).
    form.addEventListener("submit", async (event) => {
      // If full app already owns admin unlock, let it handle submit.
      if (document.body.classList.contains("app-boot-ready") && typeof window.adminLogin === "function") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const fd = new FormData(form);
      const email = String(fd.get("adminEmail") || "").trim();
      const password = String(fd.get("adminPassword") || "");
      const code = String(fd.get("adminCode") || "");
      const trustDevice = fd.get("trustDevice") !== null;
      const message = document.getElementById("adminUnlockMessage");
      const button = form.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      if (message) {
        message.textContent = "Checking owner login…";
        message.classList.add("success");
      }
      try {
        const session = await earlyAdminLogin(email, password, code);
        saveEarlyAdminSession(session, trustDevice);
        paintEarlyUnlockedBar(session);
        setStatus("Admin unlocked — loading dashboard tools…");
        startCoreAppLoad();
        prefetchAdminPack();
        // When app.js finally boots, land on admin.
        const started = Date.now();
        const timer = window.setInterval(() => {
          if (typeof window.setView === "function") {
            window.clearInterval(timer);
            try {
              window.setView("admin", { allowDuringBootVerification: true, fromBoot: true });
            } catch (_error) { /* ignore */ }
            if (document.body.classList.contains("app-boot-ready")) setStatus("");
            return;
          }
          if (Date.now() - started > 120000) {
            window.clearInterval(timer);
            setStatus("Admin is unlocked. Refresh if the full dashboard does not appear.");
          }
        }, 300);
      } catch (error) {
        if (message) {
          message.textContent = error.message || "Admin login failed.";
          message.classList.remove("success");
        }
      } finally {
        if (button) button.disabled = false;
      }
    }, true);
  }

  function prefetchAdminPack() {
    try {
      if (typeof window.LLHLazyLoader?.ensure === "function") {
        window.LLHLazyLoader.ensure("adminSurface").catch(() => {});
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
    setStatus(isAdminRoute() ? "Loading Admin tools…" : "Loading Little Learner Hub…");
    if (isAdminRoute()) prefetchAdminPack();
    loadScript(APP_SRC)
      .then(() => {
        appScriptLoaded = true;
        setStatus(isAdminRoute() ? "Starting Admin…" : "Starting Little Learner Hub…");
        return loadScript(ONBOARDING_SRC);
      })
      .then(() => {
        window.setTimeout(() => {
          if (document.body.classList.contains("app-boot-ready")) setStatus("");
        }, 500);
        window.setTimeout(() => {
          if (!document.body.classList.contains("app-boot-ready")) {
            setStatus(isAdminRoute()
              ? "Admin unlock is ready above — full tools are still starting…"
              : "Still starting… you can keep browsing this page.");
          }
        }, 20000);
        window.setTimeout(() => {
          if (!document.body.classList.contains("app-boot-ready") && !isAdminRoute()) setStatus("");
        }, 45000);
        if (isAdminRoute() && typeof window.setView === "function") {
          try {
            window.setView("admin", { allowDuringBootVerification: true, fromBoot: true });
          } catch (_error) { /* ignore */ }
        }
      })
      .catch((error) => {
        console.error("[llh-boot]", error);
        setStatus(isAdminRoute()
          ? "Could not finish loading Admin tools. You can still unlock above, then refresh."
          : "Could not finish loading. Please refresh.");
        if (!isAdminRoute()) revealHomeIfStuck();
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
    if (view === "admin") {
      showAdminViewEarly();
      wireEarlyAdminUnlock();
    }
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
    if (isAdminRoute()) {
      showAdminViewEarly();
      wireEarlyAdminUnlock();
      if (isAdminSessionStored()) {
        paintEarlyUnlockedBar(JSON.parse(localStorage.getItem("llhAdminSession") || "{}"));
        setStatus("Admin session found — loading dashboard…");
      } else {
        setStatus("Admin unlock is ready — full tools load after you sign in.");
      }
      // On /admin, start the big bundle immediately (no double-rAF delay).
      startCoreAppLoad();
      prefetchAdminPack();
      return;
    }

    revealHomeIfStuck();
    window.setTimeout(() => {
      if (!document.body.classList.contains("app-boot-ready")) revealHomeIfStuck();
    }, 2500);
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

  window.LLHBootCritical = {
    setStatus,
    queueAuth,
    queueNav,
    startCoreAppLoad,
    revealHomeIfStuck,
    showAdminViewEarly,
    wireEarlyAdminUnlock,
  };
})();
