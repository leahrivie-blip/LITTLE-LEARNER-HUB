/**
 * Critical boot for testing / slow networks.
 *
 * Rules:
 * - Never leave testers on a blank shell.
 * - /admin unlock form works with ZERO dependency on app.js.
 * - Log In / Start Free open the existing #authModal immediately (no app.js wait).
 * - Do NOT auto-download/parse multi-MB app.js on the top-level testing page —
 *   that freezes the main thread so login looks broken ("Opening your hub…" forever).
 * - After member login: show a lightweight signed-in shell immediately, and load
 *   the full app.js workspace in a background iframe so the parent tab stays usable.
 */
(function () {
  "use strict";

  const APP_SRC = "app.js?v=20260805-admin-control-center-r10";
  const ONBOARDING_SRC = "scripts/new-user-onboarding.js?v=20260804-free-ux-phase2-r1";
  let appLoadStarted = false;
  let appScriptLoaded = false;
  let earlyAdminWired = false;
  let earlyAuthWired = false;
  let authMode = "login";
  let hubFrameWatchTimer = 0;
  const testingShellState = {
    email: "",
    tab: "calendar",
    scheduleItems: [],
    lessons: [],
    messages: null,
    status: "",
    loaded: false,
  };

  function isHubBootFrame() {
    try {
      return new URLSearchParams(window.location.search || "").get("hubBoot") === "1";
    } catch (_error) {
      return false;
    }
  }

  function memberAuthHeaders() {
    const headers = { Accept: "application/json" };
    try {
      const token = localStorage.getItem("llhMemberSessionToken");
      if (token) headers.Authorization = `Bearer ${token}`;
    } catch (_error) { /* ignore */ }
    return headers;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 20000) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller
      ? window.setTimeout(() => {
        try { controller.abort(); } catch (_error) { /* ignore */ }
      }, timeoutMs)
      : 0;
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller ? controller.signal : options.signal,
      });
      let data = {};
      try { data = await response.json(); } catch (_error) { data = {}; }
      return { response, data };
    } catch (error) {
      if (error && (error.name === "AbortError" || /abort/i.test(String(error.message || "")))) {
        throw new Error("Login is taking too long. Check your connection and try again.");
      }
      throw error;
    } finally {
      if (timer) window.clearTimeout(timer);
    }
  }

  function isAdminRoute() {
    try {
      return /^\/admin\/?$/i.test(window.location.pathname || "")
        || document.documentElement.classList.contains("llh-boot-admin-route");
    } catch (_error) {
      return false;
    }
  }

  function isTestingHost() {
    try {
      const host = String(window.location.hostname || "");
      return /little-learner-hub-testing/i.test(host) || host === "localhost" || host === "127.0.0.1";
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

  function ensureHubLoadingGate() {
    let gate = document.getElementById("llhHubLoadingGate");
    if (gate) return gate;
    gate = document.createElement("div");
    gate.id = "llhHubLoadingGate";
    gate.className = "llh-hub-loading-gate";
    gate.hidden = true;
    gate.setAttribute("role", "status");
    gate.setAttribute("aria-live", "polite");
    gate.innerHTML = [
      '<div class="llh-hub-loading-card">',
      '<p class="eyebrow">Little Learner Hub</p>',
      '<strong id="llhHubLoadingTitle">Opening your hub…</strong>',
      '<p id="llhHubLoadingDetail">Signed in — loading your workspace. This can take a moment on the first open.</p>',
      '</div>',
    ].join("");
    const shell = document.querySelector(".app-shell");
    if (shell && shell.parentNode) shell.parentNode.insertBefore(gate, shell);
    else (document.body || document.documentElement).appendChild(gate);
    return gate;
  }

  function showHubLoadingGate(title, detail) {
    const gate = ensureHubLoadingGate();
    const titleEl = document.getElementById("llhHubLoadingTitle");
    const detailEl = document.getElementById("llhHubLoadingDetail");
    if (titleEl && title) titleEl.textContent = title;
    if (detailEl && detail) detailEl.textContent = detail;
    gate.hidden = false;
    try {
      document.documentElement.classList.add("llh-boot-hub-loading");
      document.body?.classList.add("llh-boot-hub-loading");
    } catch (_error) { /* ignore */ }
  }

  function hideHubLoadingGate() {
    const gate = document.getElementById("llhHubLoadingGate");
    if (gate) gate.hidden = true;
    try {
      document.documentElement.classList.remove("llh-boot-hub-loading");
      document.body?.classList.remove("llh-boot-hub-loading");
    } catch (_error) { /* ignore */ }
  }

  function setStatus(text) {
    const el = ensureStatusNode();
    el.hidden = !text;
    el.textContent = text || "";
    const shellActive = Boolean(
      document.body?.classList.contains("llh-testing-member-shell")
      || document.body?.classList.contains("llh-testing-admin-shell")
      || document.body?.classList.contains("llh-hub-frame-visible")
    );
    // Never cover the interactive signed-in testing shell with the blocking gate.
    if (
      text
      && !shellActive
      && !isHubBootFrame()
      && (readStoredMemberEmail() || document.documentElement.classList.contains("llh-boot-authenticated"))
    ) {
      showHubLoadingGate("Opening your hub…", text);
    }
    if (!text || shellActive) hideHubLoadingGate();
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
      const lock = document.getElementById("adminLockPanel");
      if (lock) {
        lock.hidden = false;
        lock.style.display = "";
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
    if (form) {
      lockPanel.hidden = false;
      lockPanel.style.display = "";
      return form;
    }
    const emailValue = rememberedAdminEmail().replace(/"/g, "&quot;");
    lockPanel.hidden = false;
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
          <p class="form-note">Works even while the full app is still loading.</p>
          <span id="adminUnlockMessage" class="form-message"></span>
        </form>
      </div>
    `;
    return lockPanel.querySelector("#adminUnlockForm");
  }

  function lockTestingAdmin() {
    try {
      localStorage.removeItem("llhAdminSession");
      localStorage.removeItem("llhAdminUnlocked");
      localStorage.removeItem("llhAdminPreviewMode");
      localStorage.removeItem("llhAdminRememberDevice");
    } catch (_error) { /* ignore */ }
    window.location.replace("/admin");
  }

  function adminAuthHeaders() {
    const headers = { Accept: "application/json" };
    try {
      const raw = localStorage.getItem("llhAdminSession");
      const session = raw ? JSON.parse(raw) : null;
      if (session?.token) headers.Authorization = `Bearer ${session.token}`;
    } catch (_error) { /* ignore */ }
    return headers;
  }

  function paintEarlyUnlockedBar(session, options = {}) {
    const lockPanel = document.getElementById("adminLockPanel");
    if (!lockPanel) return;
    const email = escapeHtml((session && session.email) || rememberedAdminEmail() || "owner");
    const detail = options.detail || (isTestingHost()
      ? "Loading the full Admin dashboard…"
      : "Loading dashboard tools now…");
    lockPanel.hidden = false;
    lockPanel.innerHTML = `
      <div class="admin-unlocked-bar" data-llh-early-admin-unlocked>
        <div>
          <p class="eyebrow">Private Owner Area</p>
          <strong>Admin unlocked for ${email}</strong>
          <span>${escapeHtml(detail)}</span>
        </div>
        <button class="ghost-button" type="button" id="llhEarlyAdminLockButton">Lock Admin</button>
      </div>
    `;
    const lockBtn = document.getElementById("llhEarlyAdminLockButton");
    if (lockBtn) {
      lockBtn.addEventListener("click", () => lockTestingAdmin());
    }
  }

  function enterTestingAdminShell(session) {
    // Compatibility: never keep testers on the lightweight shell — load full Admin.
    paintEarlyUnlockedBar(session || {}, {
      detail: "Loading the full Admin dashboard…",
    });
    showAdminViewEarly();
    startCoreAppLoad({ reason: "admin-shell-compat" });
    prefetchAdminPack();
    waitForSetViewAdmin();
  }

  async function loadTestingAdminShellData() {
    const body = document.querySelector("[data-llh-admin-shell-body]");
    if (body) body.innerHTML = `<p class="form-note">Loading owner status…</p>`;
    const headers = adminAuthHeaders();
    try {
      const [sessionRes, readyRes, contentRes, commsRes] = await Promise.all([
        fetchJsonWithTimeout("/api/admin/session", { headers }, 15000).catch(() => null),
        fetchJsonWithTimeout("/api/launch-readiness", { headers: { Accept: "application/json" } }, 15000).catch(() => null),
        fetchJsonWithTimeout("/api/site-content", { headers: { Accept: "application/json" } }, 20000).catch(() => null),
        fetchJsonWithTimeout("/api/admin/communications", { headers }, 15000).catch(() => null),
      ]);

      const sessionOk = Boolean(sessionRes?.response?.ok && sessionRes.data?.valid);
      const blockers = Array.isArray(readyRes?.data?.blockers) ? readyRes.data.blockers : [];
      const library = contentRes?.data?.siteContent?.curriculumLibrary || {};
      const plans = Array.isArray(library.lessonPlans) ? library.lessonPlans.length : 0;
      const activities = Array.isArray(library.activities) ? library.activities.length : 0;
      const communications = Array.isArray(commsRes?.data?.communications)
        ? commsRes.data.communications
        : [];
      const recent = communications.slice(0, 5).map((item) => `
        <li>
          <strong>${escapeHtml(item.subject || item.type || item.kind || "Message")}</strong>
          <span>${escapeHtml(item.createdAt || item.updatedAt || item.status || "")}</span>
        </li>
      `).join("");

      if (body) {
        body.innerHTML = `
          <div class="llh-shell-card-grid">
            <article class="llh-shell-card">
              <strong>Admin session</strong>
              <span>${sessionOk ? "Valid owner session" : "Session check failed — try unlock again"}</span>
            </article>
            <article class="llh-shell-card">
              <strong>Launch readiness</strong>
              <span>${blockers.length ? `Blockers: ${escapeHtml(blockers.join(", "))}` : "No blockers reported"}</span>
            </article>
            <article class="llh-shell-card">
              <strong>Curriculum library</strong>
              <span>${plans} lesson plans · ${activities} activities</span>
            </article>
            <article class="llh-shell-card">
              <strong>Communications</strong>
              <span>${communications.length} recent item${communications.length === 1 ? "" : "s"}</span>
            </article>
          </div>
          <h4 style="margin-top:16px">Recent communications</h4>
          <ul class="llh-shell-schedule-list">${recent || "<li>No communications yet.</li>"}</ul>
          <p class="form-note">Legacy upload form below remains available. Full visual Admin widgets that live inside app.js are skipped on testing so this page stays responsive.</p>
        `;
      }
    } catch (error) {
      if (body) {
        body.innerHTML = `<p class="form-note">${escapeHtml(error?.message || "Could not load admin status.")}</p>`;
      }
    }
  }

  async function earlyAdminLogin(email, password, code) {
    const { response, data } = await fetchJsonWithTimeout("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email, password, code }),
    }, 60000);
    if (!response.ok) throw new Error(data.error || data.message || "Admin login failed.");
    return data;
  }

  function wireEarlyAdminUnlock() {
    const form = ensureEarlyAdminShell();
    if (!form) return;
    // Always neutralize native GET navigation (credentials in the URL).
    try {
      form.setAttribute("method", "post");
      form.setAttribute("action", "#");
    } catch (_error) { /* ignore */ }
    const emailInput = form.querySelector('[name="adminEmail"]');
    if (emailInput && !emailInput.value) emailInput.value = rememberedAdminEmail();

    // Re-bind if the unlock form node was replaced after an earlier wire.
    if (form.dataset.llhEarlyAdminWired === "true" && earlyAdminWired) return;
    form.dataset.llhEarlyAdminWired = "true";
    earlyAdminWired = true;

    form.addEventListener("submit", async (event) => {
      // Always stop native navigation first — never leak credentials into the URL.
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
        if (false && isTestingHost()) {
          // Disabled: lightweight shell hid Testing Center / full Admin.
          enterTestingAdminShell(session);
          if (message) {
            message.textContent = "Admin unlocked.";
            message.classList.add("success");
          }
        } else {
          paintEarlyUnlockedBar(session);
          setStatus("Admin unlocked — loading dashboard…");
          startCoreAppLoad({ reason: "admin-unlocked" });
          prefetchAdminPack();
          waitForSetViewAdmin();
        }
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

  function waitForSetViewAdmin() {
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (typeof window.setView === "function") {
        window.clearInterval(timer);
        try {
          window.setView("admin", { allowDuringBootVerification: true, fromBoot: true });
        } catch (_error) { /* ignore */ }
        // Testing Control Center: land on Admin Home (clear dashboard). Testing Center
        // stays one click away in the Admin sidebar.
        if (isTestingHost()) {
          const openAdminHome = () => {
            try {
              if (typeof window.setAdminSectionTab === "function") {
                window.setAdminSectionTab("admin-home");
                return true;
              }
            } catch (_error) { /* ignore */ }
            return false;
          };
          if (!openAdminHome()) {
            let tries = 0;
            const tabTimer = window.setInterval(() => {
              tries += 1;
              if (openAdminHome() || tries > 40) window.clearInterval(tabTimer);
            }, 250);
          }
        }
        if (document.body.classList.contains("app-boot-ready")) setStatus("");
        return;
      }
      if (Date.now() - started > 120000) {
        window.clearInterval(timer);
        setStatus("Admin is unlocked. Refresh if the full dashboard does not appear.");
      }
    }, 300);
  }

  function prefetchAdminPack() {
    try {
      if (typeof window.LLHLazyLoader?.ensure === "function") {
        window.LLHLazyLoader.ensure("adminSurface").catch(() => {});
      }
    } catch (_error) { /* ignore */ }
  }

  /* ─── Early auth modal (no app.js) ─── */

  function authModal() {
    return document.getElementById("authModal");
  }

  function setEarlyAuthMode(mode) {
    authMode = mode === "signup" ? "signup" : "login";
    const title = document.getElementById("authTitle");
    const submit = document.getElementById("authSubmitButton");
    const switchBtn = document.getElementById("switchAuthModeButton");
    const nameFields = document.getElementById("authNameFields");
    const business = document.getElementById("authBusinessFields");
    const phone = document.getElementById("authPhoneField");
    const wizard = document.getElementById("signupWizardProgress");
    if (title) title.textContent = authMode === "signup" ? "Create your free account" : "Log in to Little Learner Hub";
    if (submit) submit.textContent = authMode === "signup" ? "Continue" : "Log In";
    if (switchBtn) switchBtn.textContent = authMode === "signup" ? "Already have an account? Log in" : "Create account";
    const showSignup = authMode === "signup";
    [nameFields, business, phone].forEach((el) => {
      if (!el) return;
      el.classList.toggle("hidden-field", !showSignup);
      el.setAttribute("aria-hidden", showSignup ? "false" : "true");
    });
    if (wizard) {
      wizard.classList.toggle("hidden-field", !showSignup);
      wizard.setAttribute("aria-hidden", showSignup ? "false" : "true");
    }
    const pass = document.getElementById("passwordInput");
    if (pass) pass.setAttribute("autocomplete", authMode === "signup" ? "new-password" : "current-password");
  }

  function openEarlyAuthModal(mode) {
    // Prefer full app helper once ready.
    if (typeof window.openAuthModal === "function" && document.body.classList.contains("app-boot-ready")) {
      try { window.openAuthModal(mode); return; } catch (_error) { /* fall through */ }
    }
    const modal = authModal();
    if (!modal) {
      setStatus("Auth form missing — please refresh.");
      return;
    }
    setEarlyAuthMode(mode);
    ensureTestingAuthHint();
    document.body.classList.add("auth-modal-open");
    modal.hidden = false;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    setStatus("");
    const email = document.getElementById("emailInput");
    // On testing, discourage Chrome from autofilling a retired breached password.
    const pass = document.getElementById("passwordInput");
    if (isTestingHost() && pass && mode !== "signup") {
      pass.setAttribute("autocomplete", "new-password");
      try { pass.value = ""; } catch (_error) { /* ignore */ }
    }
    window.setTimeout(() => { try { email?.focus(); } catch (_e) { /* ignore */ } }, 50);
  }

  function closeEarlyAuthModal() {
    if (typeof window.closeAuthModal === "function" && document.body.classList.contains("app-boot-ready")) {
      try { window.closeAuthModal(); return; } catch (_error) { /* fall through */ }
    }
    const modal = authModal();
    document.body.classList.remove("auth-modal-open");
    if (!modal) return;
    modal.classList.remove("open");
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
  }

  function setAuthMessage(text, ok) {
    const el = document.getElementById("authMessage");
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("success", !!ok);
  }

  async function earlyPasswordLogin(email, password) {
    const { response, data } = await fetchJsonWithTimeout("/api/auth/password-login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email, password }),
    }, 20000);
    if (!response.ok) throw new Error(data.error || "The email or password did not match. Please try again.");
    return data;
  }

  /**
   * app.js expects llhUser to be a plain email string (see loadAccountState).
   * Earlier testing boot mistakenly stored a JSON object — repair that here.
   */
  function normalizeStoredMemberSession() {
    try {
      const raw = localStorage.getItem("llhUser");
      if (!raw) return "";
      const trimmed = String(raw).trim();
      if (!trimmed.startsWith("{")) return trimmed.toLowerCase();
      const parsed = JSON.parse(trimmed);
      const email = String(parsed?.email || "").trim().toLowerCase();
      if (!email) {
        localStorage.removeItem("llhUser");
        return "";
      }
      localStorage.setItem("llhUser", email);
      if (parsed?.plan) {
        try { localStorage.setItem("llhPlan", String(parsed.plan)); } catch (_e) { /* ignore */ }
      }
      return email;
    } catch (_error) {
      return "";
    }
  }

  function readStoredMemberEmail() {
    return normalizeStoredMemberSession();
  }

  function saveEarlyMemberSession(email, data) {
    const clean = String(email || "").trim().toLowerCase();
    // Must match app.js: llhUser is the email string, not a JSON blob.
    localStorage.setItem("llhUser", clean);
    const plan = String(data?.plan || localStorage.getItem("llhPlan") || "Pro").trim() || "Pro";
    try { localStorage.setItem("llhPlan", plan); } catch (_error) { /* ignore */ }
    if (data?.name) {
      try { localStorage.setItem("llhUserName", String(data.name)); } catch (_error) { /* ignore */ }
    }
    if (data?.memberSessionToken) {
      try {
        localStorage.setItem("llhMemberSessionToken", String(data.memberSessionToken));
      } catch (_error) { /* ignore */ }
    }
  }

  function paintEarlySignedIn(email) {
    const clean = String(email || "").trim().toLowerCase();
    try {
      document.documentElement.classList.add("llh-boot-authenticated");
      document.body?.classList.add("llh-early-signed-in");
      document.body?.classList.remove("home-view");
    } catch (_error) { /* ignore */ }
    ["signinButton", "openLoginBtn"].forEach((id) => {
      const loginBtn = document.getElementById(id);
      if (!loginBtn) return;
      loginBtn.textContent = clean ? `Signed in · ${clean}` : "Signed in";
      loginBtn.setAttribute("aria-label", "Signed in");
    });
    document.querySelectorAll('[data-action="start-free"], #getStartedButton, #createAccountButton').forEach((el) => {
      try { el.hidden = true; } catch (_error) { /* ignore */ }
    });
    setStatus(`Signed in as ${clean || "member"}. Opening your hub…`);
  }

  function ensureTestingAuthHint() {
    if (!isTestingHost()) return;
    const form = document.getElementById("authForm");
    if (!form || form.querySelector("[data-llh-testing-auth-hint]")) return;
    const hint = document.createElement("p");
    hint.className = "form-note";
    hint.dataset.llhTestingAuthHint = "1";
    hint.textContent = "Testing tip: if Chrome says a password was found in a data breach, that is Chrome’s warning about an old saved password — not this site rejecting you. Clear the saved password, type the current testing password, then try again.";
    const message = document.getElementById("authMessage");
    if (message && message.parentNode) message.parentNode.insertBefore(hint, message);
    else form.appendChild(hint);
  }

  function wireEarlyAuth() {
    if (earlyAuthWired) return;
    earlyAuthWired = true;

    // Expose immediately so other scripts / queued clicks can open UI.
    window.openAuthModal = window.openAuthModal || openEarlyAuthModal;
    window.closeAuthModal = window.closeAuthModal || closeEarlyAuthModal;
    window.LLHEarlyAuth = { open: openEarlyAuthModal, close: closeEarlyAuthModal };
    ensureTestingAuthHint();

    document.getElementById("closeModal")?.addEventListener("click", (event) => {
      event.preventDefault();
      closeEarlyAuthModal();
    });

    document.getElementById("switchAuthModeButton")?.addEventListener("click", (event) => {
      event.preventDefault();
      setEarlyAuthMode(authMode === "signup" ? "login" : "signup");
    });

    const form = document.getElementById("authForm");
    if (!form) return;
    form.addEventListener("submit", async (event) => {
      // Once full app owns auth, let it handle.
      if (document.body.classList.contains("app-boot-ready") && typeof window.loginWithProvider === "function") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const email = String(document.getElementById("emailInput")?.value || "").trim().toLowerCase();
      const password = String(document.getElementById("passwordInput")?.value || "");
      const submit = document.getElementById("authSubmitButton");
      if (!email || !password) {
        setAuthMessage("Enter your email and password.");
        return;
      }
      if (authMode === "signup") {
        setAuthMessage("Starting account setup…", true);
        if (submit) submit.disabled = true;
        startCoreAppLoad({ reason: "signup" });
        const started = Date.now();
        const timer = window.setInterval(() => {
          if (typeof window.openAuthModal === "function" && document.body.classList.contains("app-boot-ready")) {
            window.clearInterval(timer);
            if (submit) submit.disabled = false;
            try {
              window.openAuthModal("signup");
              const emailEl = document.getElementById("emailInput");
              const passEl = document.getElementById("passwordInput");
              if (emailEl) emailEl.value = email;
              if (passEl) passEl.value = password;
              setAuthMessage("Finish creating your account below.", true);
            } catch (_error) { /* ignore */ }
            return;
          }
          if (Date.now() - started > 90000) {
            window.clearInterval(timer);
            if (submit) submit.disabled = false;
            setAuthMessage("Still loading account tools. Please wait and try again.");
          }
        }, 300);
        return;
      }

      if (submit) submit.disabled = true;
      setAuthMessage("Signing in…", true);
      try {
        const data = await earlyPasswordLogin(email, password);
        saveEarlyMemberSession(email, data);
        setAuthMessage("Signed in — opening your hub…", true);
        paintEarlySignedIn(email);
        // Hard handoff: reload so app.js boots with a real email session and lands
        // on Calendar. Soft in-place load left testers on the marketing home screen.
        await new Promise((resolve) => window.setTimeout(resolve, 80));
        window.location.replace(`${window.location.pathname || "/"}?fromLogin=1`);
        return;
      } catch (error) {
        setAuthMessage(error.message || "Login failed.");
      } finally {
        if (submit) submit.disabled = false;
      }
    }, true);
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

  function startCoreAppLoad(options = {}) {
    if (appLoadStarted) return;
    appLoadStarted = true;
    const reason = options.reason || "manual";
    const loadingText = reason === "admin-unlocked" || isAdminRoute()
      ? "Loading Admin tools…"
      : "Loading Little Learner Hub…";
    // Paint the full-screen gate BEFORE inserting multi-MB app.js (parse freezes the tab).
    showHubLoadingGate(
      reason === "admin-unlocked" || isAdminRoute() ? "Opening Admin…" : "Opening your hub…",
      loadingText
    );
    setStatus(loadingText);
    try { void ensureHubLoadingGate().offsetHeight; } catch (_error) { /* ignore */ }

    const begin = () => {
      loadScript(APP_SRC)
        .then(() => {
          appScriptLoaded = true;
          setStatus("Starting Little Learner Hub…");
          return loadScript(ONBOARDING_SRC);
        })
        .then(() => {
          // Re-bind full openAuthModal if app defined it.
          window.setTimeout(() => {
            if (document.body.classList.contains("app-boot-ready")) setStatus("");
          }, 500);
          window.setTimeout(() => {
            if (!document.body.classList.contains("app-boot-ready")) {
              setStatus("Still starting… your sign-in is saved; the hub is catching up.");
            }
          }, 20000);
          // Failsafe: if verification error UI is up, never keep the early overlay forever.
          window.setTimeout(() => {
            const errorGate = document.getElementById("appBootGate");
            const errorVisible = errorGate && !errorGate.hidden;
            if (errorVisible || document.body.classList.contains("app-booted")) {
              if (!document.body.classList.contains("app-boot-ready")) {
                hideHubLoadingGate();
              }
            }
          }, 25000);
        })
        .catch((error) => {
          console.error("[llh-boot]", error);
          const signedIn = Boolean(readStoredMemberEmail());
          setStatus(signedIn
            ? "Signed in — could not finish opening the hub. Please refresh."
            : "Could not finish loading. Please refresh.");
          if (signedIn) {
            // Never dump a signed-in tester back onto the marketing home after login.
            showHubLoadingGate(
              "Signed in — refresh to continue",
              "Your login worked. The hub bundle did not finish loading. Please refresh this page."
            );
            return;
          }
          hideHubLoadingGate();
          revealHomeIfStuck();
        });
      };
    // Two frames so the overlay is visible before the main-thread parse freeze.
    window.requestAnimationFrame(() => window.requestAnimationFrame(begin));
  }

  function clearFromLoginParam() {
    try {
      const params = new URLSearchParams(window.location.search || "");
      if (!params.has("fromLogin") && !params.has("hubBoot")) return;
      params.delete("fromLogin");
      const clean = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash || ""}`;
      window.history.replaceState({}, "", clean);
    } catch (_error) { /* ignore */ }
  }

  function showTestingView(viewId) {
    const targetId = viewId === "admin" ? "view-admin" : `view-${viewId}`;
    document.querySelectorAll(".view").forEach((view) => {
      const on = view.id === targetId;
      view.classList.toggle("active-view", on);
      if (on) {
        view.hidden = false;
        view.style.display = "";
      } else {
        view.classList.remove("active-view");
      }
    });
    const home = document.getElementById("view-home");
    if (home && targetId !== "view-home") {
      home.style.display = "none";
    }
  }

  function signOutTestingMember() {
    try {
      localStorage.removeItem("llhUser");
      localStorage.removeItem("llhMemberSessionToken");
      localStorage.removeItem("llhUserName");
    } catch (_error) { /* ignore */ }
    window.location.replace("/");
  }

  function markTestingNavActive(tab) {
    document.querySelectorAll("#platformNav [data-view]").forEach((btn) => {
      const on = btn.getAttribute("data-view") === tab;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-current", on ? "page" : "false");
    });
  }

  function shellHost() {
    return document.getElementById("mainCalendarApp") || document.getElementById("view-calendar");
  }

  function renderTestingShellPanel() {
    const tab = testingShellState.tab || "calendar";
    const host = shellHost();
    if (!host) return;
    // Keep one interactive host so tab switches never leave stale panels in hidden views.
    showTestingView("calendar");
    markTestingNavActive(tab === "lessons" || tab === "messages" ? tab : "calendar");

    const items = testingShellState.scheduleItems || [];
    const lessons = testingShellState.lessons || [];
    let bodyHtml = "";
    if (tab === "lessons") {
      const cards = lessons.slice(0, 24).map((plan) => `
        <article class="llh-shell-card">
          <strong>${escapeHtml(plan.title || plan.name || "Lesson plan")}</strong>
          <span>${escapeHtml([plan.age, plan.theme].filter(Boolean).join(" · ") || "Curriculum library")}</span>
        </article>
      `).join("");
      bodyHtml = `
        <h4>Lesson Plans</h4>
        <p class="form-note">${lessons.length ? `Showing ${Math.min(24, lessons.length)} of ${lessons.length} plans from the library.` : "Loading lesson plans…"}</p>
        <div class="llh-shell-card-grid">${cards || "<p>No lesson plans loaded yet.</p>"}</div>
      `;
    } else if (tab === "messages") {
      const unread = testingShellState.messages?.unreadCount ?? testingShellState.messages?.unread ?? 0;
      bodyHtml = `
        <h4>Messages</h4>
        <p>Inbox is ready for this testing session.</p>
        <p class="form-note">Unread: ${escapeHtml(String(unread))}. Full conversation tools stay in the main app build; this panel confirms your signed-in session can reach messaging APIs.</p>
      `;
    } else {
      const rows = items.slice(0, 20).map((item) => `
        <li>
          <strong>${escapeHtml(item.title || item.name || item.type || "Scheduled item")}</strong>
          <span>${escapeHtml(item.date || item.day || item.startAt || item.when || "")}</span>
        </li>
      `).join("");
      bodyHtml = `
        <h4>Calendar</h4>
        <p class="form-note">${items.length ? `${items.length} schedule item${items.length === 1 ? "" : "s"} on your account.` : "No schedule items yet — your calendar is ready to use. Add plans from Lesson Plans or Admin."}</p>
        <ul class="llh-shell-schedule-list">${rows || "<li>Today is clear. Open Lesson Plans to browse the library.</li>"}</ul>
      `;
    }

    host.innerHTML = `
      <div class="llh-testing-member-panel" data-llh-testing-member-shell>
        <p class="eyebrow">Signed in</p>
        <h3>Welcome back${testingShellState.email ? `, ${escapeHtml(testingShellState.email)}` : ""}</h3>
        <p>Your testing hub is ready. Use the buttons or left navigation — this workspace does not wait on the heavy app bundle.</p>
        <div class="llh-testing-member-actions">
          <button type="button" class="${tab === "calendar" ? "primary-button" : "ghost-button"}" data-llh-shell-action="calendar" aria-current="${tab === "calendar" ? "page" : "false"}">Calendar</button>
          <button type="button" class="${tab === "lessons" ? "primary-button" : "ghost-button"}" data-llh-shell-action="lessons" aria-current="${tab === "lessons" ? "page" : "false"}">Lesson Plans</button>
          <button type="button" class="${tab === "messages" ? "primary-button" : "ghost-button"}" data-llh-shell-action="messages" aria-current="${tab === "messages" ? "page" : "false"}">Messages</button>
          <button type="button" class="ghost-button" data-llh-shell-action="admin">Open Admin</button>
          <button type="button" class="ghost-button" data-llh-shell-action="signout">Sign out</button>
        </div>
        <div class="llh-shell-body" data-llh-shell-body>${bodyHtml}</div>
        <p class="form-note" data-llh-shell-status>${escapeHtml(testingShellState.status || "Ready.")}</p>
      </div>
    `;

    host.querySelectorAll("[data-llh-shell-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.getAttribute("data-llh-shell-action");
        if (action === "admin") {
          window.location.href = "/admin";
          return;
        }
        if (action === "signout") {
          signOutTestingMember();
          return;
        }
        openTestingShellTab(action);
      });
    });
  }

  function openTestingShellTab(tab) {
    const allowed = new Set(["calendar", "lessons", "messages"]);
    testingShellState.tab = allowed.has(tab) ? tab : "calendar";
    try {
      const titles = {
        calendar: "Calendar · Little Learner Hub",
        lessons: "Lesson Plans · Little Learner Hub",
        messages: "Messages · Little Learner Hub",
      };
      document.title = titles[testingShellState.tab] || titles.calendar;
    } catch (_error) { /* ignore */ }
    renderTestingShellPanel();
    if (testingShellState.tab === "messages" && !testingShellState.messages) {
      loadTestingShellMessages();
    }
  }

  async function loadTestingShellData() {
    testingShellState.status = "Loading your calendar and lesson library…";
    renderTestingShellPanel();
    try {
      const [scheduleRes, contentRes] = await Promise.all([
        fetchJsonWithTimeout("/api/schedule", { headers: memberAuthHeaders() }, 20000).catch(() => null),
        fetchJsonWithTimeout("/api/site-content", { headers: { Accept: "application/json" } }, 20000).catch(() => null),
      ]);
      if (scheduleRes?.response?.ok) {
        testingShellState.scheduleItems = Array.isArray(scheduleRes.data?.items) ? scheduleRes.data.items : [];
      }
      const library = contentRes?.data?.siteContent?.curriculumLibrary || contentRes?.data?.curriculumLibrary || {};
      testingShellState.lessons = Array.isArray(library.lessonPlans) ? library.lessonPlans : [];
      testingShellState.loaded = true;
      testingShellState.status = `Ready · ${testingShellState.lessons.length} lesson plans available · ${testingShellState.scheduleItems.length} schedule items`;
    } catch (error) {
      testingShellState.status = error?.message || "Could not load library data. Admin and Sign out still work.";
    }
    renderTestingShellPanel();
  }

  async function loadTestingShellMessages() {
    testingShellState.status = "Loading messages…";
    renderTestingShellPanel();
    try {
      const { response, data } = await fetchJsonWithTimeout("/api/messages/center", {
        headers: memberAuthHeaders(),
      }, 20000);
      if (!response.ok) throw new Error(data.error || "Could not load messages.");
      testingShellState.messages = data;
      testingShellState.status = `Messages ready · unread ${data.unreadCount ?? data.unread ?? 0}`;
    } catch (error) {
      testingShellState.messages = { unreadCount: 0 };
      testingShellState.status = error?.message || "Messages unavailable right now.";
    }
    renderTestingShellPanel();
  }

  function enterTestingMemberShell(email) {
    // Compatibility: never keep testers on the lightweight shell — load full app.
    const clean = String(email || "").trim().toLowerCase();
    paintEarlySignedIn(clean);
    setStatus("Signed in — opening your hub…");
    startCoreAppLoad({ reason: "member-shell-compat" });
  }

  // Kept as no-ops so older callsites/tests do not break; full app.js iframe boot was unreliable.
  function updateTestingMemberShellStatus(text) {
    testingShellState.status = text || testingShellState.status;
    const status = document.querySelector("[data-llh-shell-status]");
    if (status && testingShellState.status) status.textContent = testingShellState.status;
  }
  function revealHubFrame() { return false; }
  function startBackgroundHubFrame() { /* intentionally disabled */ }

  function queueAuth(mode) {
    wireEarlyAuth();
    openEarlyAuthModal(mode);
    // On testing, do NOT start parsing app.js while the modal is open — that freezes
    // the main thread and makes Log In / Start Free look dead. Load only on submit
    // (signup) or after successful early login.
    if (!isTestingHost()) {
      window.setTimeout(() => startCoreAppLoad({ reason: mode }), 50);
    }
  }

  function queueNav(view) {
    if (!view) return;
        if (view === "admin") {
      showAdminViewEarly();
      wireEarlyAdminUnlock();
      if (isAdminSessionStored()) {
        startCoreAppLoad({ reason: "admin-nav" });
        prefetchAdminPack();
        waitForSetViewAdmin();
      }
      return;
    }
    setStatus("Loading Little Learner Hub…");
    startCoreAppLoad({ reason: "nav:" + view });
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
    wireEarlyAuth();
    const memberEmail = normalizeStoredMemberSession();
    if (memberEmail) {
      try {
        document.documentElement.classList.add("llh-boot-authenticated");
      } catch (_error) { /* ignore */ }
    }

    // iframe workspace boot: load app.js here only (never nest another iframe).
    if (isHubBootFrame()) {
      try {
        document.documentElement.classList.add("llh-hub-boot-frame");
        document.body?.classList.add("llh-hub-boot-frame");
      } catch (_error) { /* ignore */ }
      setStatus("Starting workspace…");
      startCoreAppLoad({ reason: "hub-boot-frame" });
      return;
    }

    if (isAdminRoute()) {
      showAdminViewEarly();
      wireEarlyAdminUnlock();
      if (isAdminSessionStored()) {
        const session = JSON.parse(localStorage.getItem("llhAdminSession") || "{}");
        paintEarlyUnlockedBar(session, {
          detail: "Admin session found — loading the full dashboard now.",
        });
        setStatus("Admin session found — loading dashboard…");
        startCoreAppLoad({ reason: "admin-session" });
        prefetchAdminPack();
        waitForSetViewAdmin();
      } else {
        // CRITICAL: do NOT start app.js / Teaching Kit until unlock.
        setStatus("");
      }
      return;
    }

    // Returning / just-logged-in member on testing:
    // Show a usable signed-in shell immediately. Load multi-MB app.js in a
    // background iframe so the parent tab does not freeze on "Opening your hub…".
    if (memberEmail && isTestingHost()) {
      paintEarlySignedIn(memberEmail);
      setStatus("Signed in — opening your hub…");
      startCoreAppLoad({ reason: "returning-session" });
      return;
    }

    // Non-testing signed-in boot (production path): load app in-page.
    if (memberEmail) {
      paintEarlySignedIn(memberEmail);
      setStatus("Signed in — opening your hub…");
      startCoreAppLoad({ reason: "returning-session" });
      return;
    }

    revealHomeIfStuck();
    window.setTimeout(() => {
      if (!document.body.classList.contains("app-boot-ready")) revealHomeIfStuck();
    }, 2500);

    // Guest homepage on testing: do NOT auto-parse app.js — it freezes Log In.
    // Early auth modal handles Log In / Start Free without the big bundle.
    if (isTestingHost()) {
      setStatus("");
      return;
    }

    // Production: warm the bundle after idle so first paint stays usable.
    const warm = () => {
      if (appLoadStarted) return;
      if (document.visibilityState === "hidden") return;
      startCoreAppLoad({ reason: "idle-warm" });
    };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(warm, { timeout: 8000 });
    } else {
      window.setTimeout(warm, 8000);
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
      hideHubLoadingGate();
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
    hideHubLoadingGate,
    showHubLoadingGate,
    queueAuth,
    queueNav,
    startCoreAppLoad,
    revealHomeIfStuck,
    showAdminViewEarly,
    wireEarlyAdminUnlock,
    openEarlyAuthModal,
    enterTestingMemberShell,
    enterTestingAdminShell,
    startBackgroundHubFrame,
    revealHubFrame,
  };
})();
