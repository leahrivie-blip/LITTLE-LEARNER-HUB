/**
 * Multi-Role Tester — testing-site only.
 * Admin grants `multiRoleTester` on a single tester account.
 * Switch View changes UI/permissions inside that tester's sandbox only.
 * Never grants Admin, Testing Center, analytics, billing, or other testers' data.
 */
(function multiRoleTesterModule(global) {
  "use strict";

  const STORAGE_KEY = "llhMultiRoleTesterView";
  const SESSION_PROMPT_KEY = "llhMultiRoleSessionPrompted";
  const ROLES = Object.freeze(["Owner", "Director", "Teacher", "Assistant", "Parent"]);

  const ROLE_META = Object.freeze({
    Owner: {
      key: "owner",
      blurb: "Business management, settings, and program overview.",
      can: ["Program home & settings", "Children & classrooms", "Staff management", "Families & enrollment tools"],
      cannot: ["Admin / Testing Center", "Analytics", "Billing controls", "Other testers’ data", "Production data"],
    },
    Director: {
      key: "director",
      blurb: "Staff management, classrooms, and day-to-day operations.",
      can: ["Staff management", "Classrooms & families", "Children & daily ops", "Forms & messaging"],
      cannot: ["Billing controls", "Admin / Testing Center", "Analytics", "Other testers’ sandboxes"],
    },
    Teacher: {
      key: "teacher",
      blurb: "Classroom tools, daily logs, observations, messaging.",
      can: ["Today / classroom tools", "Daily logs & observations", "Assigned children", "Messaging"],
      cannot: ["Staff management", "Billing", "Admin / Testing Center", "Business billing settings"],
    },
    Assistant: {
      key: "assistant",
      blurb: "Limited classroom tools only.",
      can: ["Today view", "Limited classroom tools", "Children (assigned)", "Messaging"],
      cannot: ["Staff management", "Billing", "Business settings", "Admin / Testing Center"],
    },
    Parent: {
      key: "parent",
      blurb: "Family Hub experience only.",
      can: ["Family Hub", "Parent messages & updates for linked children"],
      cannot: ["Provider work nav", "Staff tools", "Billing", "Admin / Testing Center", "Classroom management"],
    },
  });

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function isTestingSite() {
    try {
      return typeof global.isHomeDaycareHubTestingEnabled === "function"
        && global.isHomeDaycareHubTestingEnabled();
    } catch {
      return false;
    }
  }

  function currentAccountSafe() {
    try {
      return typeof global.currentAccount === "function" ? global.currentAccount() : null;
    } catch {
      return null;
    }
  }

  function isLoggedInSafe() {
    try {
      return typeof global.isLoggedIn === "function" ? global.isLoggedIn() : Boolean(global.currentUser);
    } catch {
      return Boolean(global.currentUser);
    }
  }

  function accountHasMultiRolePermission(account = currentAccountSafe()) {
    if (!account) return false;
    return account.multiRoleTester === true || account.hdhMultiRoleTester === true;
  }

  function canUseMultiRoleTester() {
    if (!isTestingSite()) return false;
    if (!isLoggedInSafe()) return false;
    // Never offer this as Admin View As — Admin uses Testing Center.
    try {
      if (typeof global.isAdminUnlocked === "function" && global.isAdminUnlocked()
        && typeof global.hasAdminFullAccess === "function" && global.hasAdminFullAccess()) {
        return false;
      }
    } catch { /* ignore */ }
    return accountHasMultiRolePermission();
  }

  function normalizeRoleLabel(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const hit = ROLES.find((r) => r.toLowerCase() === raw.toLowerCase());
    return hit || "";
  }

  function getActiveViewRole() {
    if (!canUseMultiRoleTester()) return "";
    try {
      return normalizeRoleLabel(localStorage.getItem(STORAGE_KEY) || "");
    } catch {
      return "";
    }
  }

  function getActiveViewRoleKey() {
    const label = getActiveViewRole();
    return label ? ROLE_META[label].key : "";
  }

  function isSimulating() {
    return Boolean(getActiveViewRole());
  }

  function clearView({ silent } = {}) {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    try {
      if (typeof global.setHdhTesterPersona === "function") {
        const persona = typeof global.getHdhTesterPersona === "function" ? global.getHdhTesterPersona() : {};
        if (persona.role === "parent") global.setHdhTesterPersona({ role: "teacher" });
      }
    } catch { /* ignore */ }
    applyChrome();
    refreshPlatform();
    if (!silent && typeof global.showActionFeedback === "function") {
      global.showActionFeedback("Returned to your tester view.");
    }
  }

  async function setViewRole(roleLabel, { source = "switch_view" } = {}) {
    if (!canUseMultiRoleTester()) {
      throw new Error("Multi-Role Tester is not enabled for this account.");
    }
    const next = normalizeRoleLabel(roleLabel);
    if (!next) throw new Error("Choose Owner, Director, Teacher, Assistant, or Parent.");
    const previous = getActiveViewRole() || "My Tester View";
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }

    // Parent uses Family Hub persona; others restore teacher persona for provider shell.
    try {
      if (typeof global.setHdhTesterPersona === "function") {
        if (next === "Parent") global.setHdhTesterPersona({ role: "parent" });
        else if (typeof global.getHdhTesterPersona === "function"
          && global.getHdhTesterPersona().role === "parent") {
          global.setHdhTesterPersona({ role: "teacher" });
        }
      }
    } catch { /* ignore */ }

    applyChrome();
    refreshPlatform();

    if (next === "Parent" && typeof global.setView === "function") {
      try { global.setView("family-hub", { skipAccessRedirect: true }); } catch { /* ignore */ }
    } else if (typeof global.setView === "function") {
      const landing = next === "Teacher" || next === "Assistant" ? "today" : "home";
      try { global.setView(landing, { allowDashboard: true, skipAccessRedirect: true }); } catch { /* ignore */ }
    }

    await logRoleSwitch({ fromRole: previous, toRole: next, source });
    if (typeof global.showActionFeedback === "function") {
      global.showActionFeedback(`Viewing as ${next}.`);
    }
    return next;
  }

  function refreshPlatform() {
    try { global.syncPlatformNavVisibility?.(); } catch { /* ignore */ }
    try { global.updateAdminNavVisibility?.(); } catch { /* ignore */ }
    try { global.updateAuthButtons?.(); } catch { /* ignore */ }
    try { global.syncFamilyHubParentChrome?.(); } catch { /* ignore */ }
    document.body.classList.toggle("multi-role-tester-simulating", isSimulating());
    document.body.dataset.multiRoleView = getActiveViewRole() || "";
  }

  function ensureDom() {
    let banner = document.querySelector("#multiRoleTesterBanner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "multiRoleTesterBanner";
      banner.className = "multi-role-tester-banner";
      banner.hidden = true;
      banner.setAttribute("role", "status");
      const host = document.querySelector("#memberUpdateBanner")
        || document.querySelector("#siteAnnouncementBanner")
        || document.querySelector("main")
        || document.body;
      host.parentNode?.insertBefore(banner, host.nextSibling) || document.body.prepend(banner);
    }

    let fab = document.querySelector("#reportBugFab");
    if (!fab) {
      fab = document.createElement("button");
      fab.id = "reportBugFab";
      fab.type = "button";
      fab.className = "report-bug-fab";
      fab.setAttribute("aria-label", "Report a Bug");
      fab.innerHTML = `<span aria-hidden="true">🐞</span><span>Report a Bug</span>`;
      document.body.appendChild(fab);
    }

    let help = document.querySelector("#multiRoleHelpModal");
    if (!help) {
      help = document.createElement("div");
      help.id = "multiRoleHelpModal";
      help.className = "modal";
      help.setAttribute("aria-hidden", "true");
      help.innerHTML = `
        <div class="modal-card multi-role-help-card" role="dialog" aria-modal="true" aria-labelledby="multiRoleHelpTitle">
          <button class="close-button" type="button" data-multi-role-help-close aria-label="Close">&times;</button>
          <p class="eyebrow">Role guide</p>
          <h2 id="multiRoleHelpTitle">Role permissions</h2>
          <div id="multiRoleHelpBody"></div>
          <div class="form-actions">
            <button class="ghost-button" type="button" data-multi-role-help-close>Close</button>
          </div>
        </div>`;
      document.body.appendChild(help);
    }

    let switcher = document.querySelector("#multiRoleSwitchModal");
    if (!switcher) {
      switcher = document.createElement("div");
      switcher.id = "multiRoleSwitchModal";
      switcher.className = "modal";
      switcher.setAttribute("aria-hidden", "true");
      switcher.innerHTML = `
        <div class="modal-card multi-role-switch-card" role="dialog" aria-modal="true" aria-labelledby="multiRoleSwitchTitle">
          <button class="close-button" type="button" data-multi-role-switch-close aria-label="Close">&times;</button>
          <p class="eyebrow">Multi-Role Tester</p>
          <h2 id="multiRoleSwitchTitle">Switch View</h2>
          <p class="muted-copy">Stay in your own sandbox. This never opens Admin, Testing Center, analytics, billing, or other testers.</p>
          <div class="multi-role-switch-grid" id="multiRoleSwitchGrid"></div>
          <div class="form-actions">
            <button class="primary-button" type="button" data-multi-role-return>Return to My Tester View</button>
            <button class="ghost-button" type="button" data-multi-role-switch-close>Cancel</button>
          </div>
        </div>`;
      document.body.appendChild(switcher);
    }

    let sessionModal = document.querySelector("#multiRoleSessionModal");
    if (!sessionModal) {
      sessionModal = document.createElement("div");
      sessionModal.id = "multiRoleSessionModal";
      sessionModal.className = "modal";
      sessionModal.setAttribute("aria-hidden", "true");
      sessionModal.innerHTML = `
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="multiRoleSessionTitle">
          <button class="close-button" type="button" data-multi-role-session-close aria-label="Close">&times;</button>
          <p class="eyebrow">Quick check-in</p>
          <h2 id="multiRoleSessionTitle">Which role did you test today?</h2>
          <form id="multiRoleSessionForm" class="panel-form">
            <label>Role tested
              <select id="multiRoleSessionRole" required>
                ${ROLES.map((r) => `<option value="${r}">${r}</option>`).join("")}
                <option value="My Tester View">My Tester View (default)</option>
              </select>
            </label>
            <label>What should Leah know?
              <textarea id="multiRoleSessionNotes" rows="4" maxlength="4000" placeholder="Anything confusing, broken, or great?"></textarea>
            </label>
            <div class="form-actions">
              <button class="primary-button" type="submit">Send &amp; continue</button>
              <button class="ghost-button" type="button" data-multi-role-session-skip>Skip</button>
            </div>
            <span class="form-message" id="multiRoleSessionMsg" aria-live="polite"></span>
          </form>
        </div>`;
      document.body.appendChild(sessionModal);
    }

    // Header Switch View control
    const actions = document.querySelector(".topbar .account-actions");
    if (actions && !document.querySelector("#multiRoleSwitchBtn")) {
      const btn = document.createElement("button");
      btn.id = "multiRoleSwitchBtn";
      btn.type = "button";
      btn.className = "ghost-button multi-role-switch-btn";
      btn.hidden = true;
      btn.textContent = "Switch View";
      const msgBtn = document.querySelector("#messageSupportBtn");
      if (msgBtn) actions.insertBefore(btn, msgBtn);
      else actions.prepend(btn);
    }
  }

  let applyingChrome = false;

  function applyChrome() {
    // Guard against syncPlatformNavVisibility → syncMultiRoleTesterChrome → applyChrome
    // → refreshPlatform → updateAuthButtons → syncPlatformNavVisibility recursion.
    if (applyingChrome) return;
    applyingChrome = true;
    try {
      ensureDom();
      const allowed = canUseMultiRoleTester();
      const active = getActiveViewRole();
      const switchBtn = document.querySelector("#multiRoleSwitchBtn");
      if (switchBtn) {
        switchBtn.hidden = !allowed;
        switchBtn.textContent = active ? `View: ${active}` : "Switch View";
      }

      const banner = document.querySelector("#multiRoleTesterBanner");
      if (banner) {
        if (allowed && active) {
          const meta = ROLE_META[active];
          banner.hidden = false;
          banner.innerHTML = `
          <div class="multi-role-tester-banner-inner">
            <div class="multi-role-tester-banner-copy">
              <p class="multi-role-tester-banner-title">
                You are currently viewing the app as ${/^[aeiou]/i.test(active) ? "an" : "a"} ${escapeHtml(active)}.
                <button type="button" class="multi-role-help-btn" data-multi-role-help="${escapeHtml(active)}" aria-label="What can ${escapeHtml(active)} do?">?</button>
              </p>
              <p class="multi-role-tester-banner-blurb">${escapeHtml(meta.blurb)}</p>
            </div>
            <div class="multi-role-tester-banner-actions">
              <button type="button" class="ghost-button" data-multi-role-open-switch>Switch View</button>
              <button type="button" class="primary-button" data-multi-role-return>Return to My Tester View</button>
            </div>
          </div>`;
        } else {
          banner.hidden = true;
          banner.innerHTML = "";
        }
      }

      const fab = document.querySelector("#reportBugFab");
      if (fab) {
        // Show for any logged-in testing-site user (not only multi-role).
        fab.hidden = !(isTestingSite() && isLoggedInSafe());
      }

      // Body simulation classes only — do not call refreshPlatform() here.
      // refreshPlatform → updateAuthButtons → syncPlatformNavVisibility → applyChrome.
      document.body.classList.toggle("multi-role-tester-simulating", isSimulating());
      document.body.dataset.multiRoleView = getActiveViewRole() || "";
    } finally {
      applyingChrome = false;
    }
  }

  function openSwitchModal() {
    ensureDom();
    const modal = document.querySelector("#multiRoleSwitchModal");
    const grid = document.querySelector("#multiRoleSwitchGrid");
    const active = getActiveViewRole();
    if (grid) {
      grid.innerHTML = ROLES.map((role) => {
        const meta = ROLE_META[role];
        const selected = role === active;
        return `
          <button type="button" class="multi-role-switch-option${selected ? " is-active" : ""}" data-multi-role-pick="${role}">
            <strong>${escapeHtml(role)}</strong>
            <span>${escapeHtml(meta.blurb)}</span>
          </button>`;
      }).join("");
    }
    modal?.classList.add("open");
    modal?.setAttribute("aria-hidden", "false");
    document.body.classList.add("auth-modal-open");
  }

  function closeSwitchModal() {
    const modal = document.querySelector("#multiRoleSwitchModal");
    modal?.classList.remove("open");
    modal?.setAttribute("aria-hidden", "true");
    if (!document.querySelector(".modal.open")) document.body.classList.remove("auth-modal-open");
  }

  function openHelp(roleLabel) {
    ensureDom();
    const role = normalizeRoleLabel(roleLabel) || getActiveViewRole() || "Teacher";
    const meta = ROLE_META[role];
    const body = document.querySelector("#multiRoleHelpBody");
    const title = document.querySelector("#multiRoleHelpTitle");
    if (title) title.textContent = `${role} — what you can and cannot do`;
    if (body && meta) {
      body.innerHTML = `
        <p class="muted-copy">${escapeHtml(meta.blurb)}</p>
        <div class="multi-role-help-columns">
          <div>
            <h3>Can</h3>
            <ul>${meta.can.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
          </div>
          <div>
            <h3>Cannot</h3>
            <ul>${meta.cannot.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
          </div>
        </div>
        <p class="form-note">You always stay in your own sandbox. Switching views never opens Admin, Testing Center, analytics, billing, or another tester’s data.</p>`;
    }
    const modal = document.querySelector("#multiRoleHelpModal");
    modal?.classList.add("open");
    modal?.setAttribute("aria-hidden", "false");
    document.body.classList.add("auth-modal-open");
  }

  function closeHelp() {
    const modal = document.querySelector("#multiRoleHelpModal");
    modal?.classList.remove("open");
    modal?.setAttribute("aria-hidden", "true");
    if (!document.querySelector(".modal.open")) document.body.classList.remove("auth-modal-open");
  }

  function collectClientContext(extra = {}) {
    const account = currentAccountSafe() || {};
    const activeView = getActiveViewRole() || "My Tester View";
    const pageId = document.querySelector(".active-view")?.id?.replace(/^view-/, "")
      || (location.hash || "").replace(/^#/, "")
      || "app";
    const width = window.innerWidth || 0;
    const deviceClass = width < 700 ? "Mobile" : width < 1100 ? "Tablet" : "Desktop";
    let appVersion = "";
    try {
      const scripts = [...document.scripts].map((s) => s.src).find((s) => /app\.js/.test(s));
      appVersion = scripts ? (new URL(scripts, location.href).searchParams.get("v") || "") : "";
    } catch { /* ignore */ }
    return {
      currentRole: activeView,
      accountRole: account.role || "",
      page: pageId,
      sourceUrl: location.href,
      deviceClass,
      screenWidth: width,
      screenHeight: window.innerHeight || 0,
      userAgent: navigator.userAgent || "",
      appVersion,
      time: new Date().toISOString(),
      testingSite: isTestingSite(),
      multiRoleTester: accountHasMultiRolePermission(account),
      sandboxEmail: global.currentUser || account.email || "",
      ...extra,
    };
  }

  function formatContextBlock(ctx) {
    return [
      "— Auto context —",
      `Current role: ${ctx.currentRole || "—"}`,
      `Page: ${ctx.page || "—"}`,
      `Device: ${ctx.deviceClass || "—"} (${ctx.screenWidth || "?"}×${ctx.screenHeight || "?"})`,
      `Browser: ${(ctx.userAgent || "").slice(0, 120)}`,
      `App version: ${ctx.appVersion || "—"}`,
      `Time: ${ctx.time || "—"}`,
      ctx.feature ? `Feature: ${ctx.feature}` : "",
    ].filter(Boolean).join("\n");
  }

  function openSmartFeedback(options = {}) {
    const type = options.type || "Bug";
    const ctx = collectClientContext({ feature: options.feature || "" });
    if (typeof global.openFeedbackModal === "function") {
      global.openFeedbackModal(type);
    } else {
      document.querySelector("#feedbackModal")?.classList.add("open");
    }
    const typeInput = document.querySelector("#feedbackTypeInput");
    if (typeInput) typeInput.value = type;

    // Smart guided fields (keep classic message box; enrich it).
    ensureSmartFeedbackFields();
    const trying = document.querySelector("#feedbackTryingInput");
    const happened = document.querySelector("#feedbackHappenedInput");
    const expected = document.querySelector("#feedbackExpectedInput");
    const kind = document.querySelector("#feedbackKindInput");
    if (trying) trying.value = "";
    if (happened) happened.value = "";
    if (expected) expected.value = "";
    if (kind) kind.value = type === "Bug" ? "bug" : "confusing";

    const contextEl = document.querySelector("#feedbackAutoContext");
    if (contextEl) contextEl.textContent = formatContextBlock(ctx);

    const subject = document.querySelector("#feedbackSubjectInput");
    if (subject && !subject.value) {
      subject.value = `${type}: ${ctx.page || "app"} (${ctx.currentRole})`;
    }

    // Stash context for submit
    try {
      sessionStorage.setItem("llhFeedbackAutoContext", JSON.stringify(ctx));
    } catch { /* ignore */ }
  }

  function ensureSmartFeedbackFields() {
    const form = document.querySelector("#feedbackForm");
    if (!form || form.querySelector("#feedbackAutoContext")) return;
    const messageLabel = form.querySelector("#feedbackMessageInput")?.closest("label");
    const block = document.createElement("div");
    block.className = "feedback-smart-block";
    block.innerHTML = `
      <div class="feedback-auto-context" id="feedbackAutoContext" aria-live="polite"></div>
      <label>What were you trying to do?
        <textarea id="feedbackTryingInput" rows="2" maxlength="1000" placeholder="e.g. Add a daily log for Mia"></textarea>
      </label>
      <label>What happened?
        <textarea id="feedbackHappenedInput" rows="2" maxlength="1000" placeholder="e.g. Save button did nothing"></textarea>
      </label>
      <label>What did you expect?
        <textarea id="feedbackExpectedInput" rows="2" maxlength="1000" placeholder="e.g. Log should save and show on Today"></textarea>
      </label>
      <label>Is this a bug or just confusing?
        <select id="feedbackKindInput">
          <option value="bug">Bug</option>
          <option value="confusing">Confusing</option>
          <option value="idea">Idea / improvement</option>
        </select>
      </label>
      <label class="feedback-screenshot-label">Screenshot URL (optional)
        <input type="url" id="feedbackScreenshotInput" maxlength="500" placeholder="Paste an image link if you have one" />
      </label>
      <p class="form-note">Your message below can stay short — we already capture role, page, device, and time.</p>`;
    if (messageLabel) form.insertBefore(block, messageLabel);
    else form.insertBefore(block, form.querySelector(".form-actions"));
  }

  function buildSmartFeedbackMessage() {
    const trying = document.querySelector("#feedbackTryingInput")?.value?.trim() || "";
    const happened = document.querySelector("#feedbackHappenedInput")?.value?.trim() || "";
    const expected = document.querySelector("#feedbackExpectedInput")?.value?.trim() || "";
    const kind = document.querySelector("#feedbackKindInput")?.value || "";
    const screenshot = document.querySelector("#feedbackScreenshotInput")?.value?.trim() || "";
    const base = document.querySelector("#feedbackMessageInput")?.value?.trim() || "";
    let ctx = {};
    try { ctx = JSON.parse(sessionStorage.getItem("llhFeedbackAutoContext") || "{}"); } catch { ctx = collectClientContext(); }
    const parts = [
      trying ? `Trying to: ${trying}` : "",
      happened ? `What happened: ${happened}` : "",
      expected ? `Expected: ${expected}` : "",
      kind ? `Kind: ${kind}` : "",
      screenshot ? `Screenshot: ${screenshot}` : "",
      base ? `Notes: ${base}` : "",
      "",
      formatContextBlock(ctx),
    ].filter((line, idx, arr) => line || arr[idx - 1]);
    return parts.join("\n");
  }

  async function logRoleSwitch({ fromRole, toRole, source }) {
    const email = String(global.currentUser || "").trim().toLowerCase();
    if (!email) return;
    const payload = {
      email,
      fromRole: String(fromRole || ""),
      toRole: String(toRole || ""),
      source: String(source || "switch_view"),
      context: collectClientContext(),
      at: new Date().toISOString(),
    };
    try {
      const headers = { "Content-Type": "application/json", "X-LLH-User-Email": email };
      if (typeof global.staffAuthHeaders === "function") {
        const auth = await global.staffAuthHeaders().catch(() => null);
        if (auth) Object.assign(headers, auth);
      } else {
        headers.Authorization = `Bearer test:${email}`;
      }
      await fetch("/api/home-daycare-hub/tester-role-switches", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
    } catch { /* non-blocking */ }
    try {
      global.trackEvent?.("tester_role_switch", { fromRole, toRole, source });
    } catch { /* ignore */ }
  }

  function maybePromptSessionEnd(reason = "logout") {
    if (!canUseMultiRoleTester() && !accountHasMultiRolePermission()) return false;
    try {
      if (sessionStorage.getItem(SESSION_PROMPT_KEY) === "1") return false;
    } catch { /* ignore */ }
    ensureDom();
    const modal = document.querySelector("#multiRoleSessionModal");
    const roleSelect = document.querySelector("#multiRoleSessionRole");
    if (roleSelect) roleSelect.value = getActiveViewRole() || "My Tester View";
    const msg = document.querySelector("#multiRoleSessionMsg");
    if (msg) msg.textContent = reason === "logout" ? "Before you go — quick role check-in." : "";
    modal?.classList.add("open");
    modal?.setAttribute("aria-hidden", "false");
    document.body.classList.add("auth-modal-open");
    modal.dataset.pendingLogout = reason === "logout" ? "1" : "0";
    return true;
  }

  function closeSessionModal() {
    const modal = document.querySelector("#multiRoleSessionModal");
    modal?.classList.remove("open");
    modal?.setAttribute("aria-hidden", "true");
    if (!document.querySelector(".modal.open")) document.body.classList.remove("auth-modal-open");
  }

  async function submitSessionFeedback(event) {
    event?.preventDefault?.();
    const role = document.querySelector("#multiRoleSessionRole")?.value || "My Tester View";
    const notes = document.querySelector("#multiRoleSessionNotes")?.value?.trim() || "";
    const ctx = collectClientContext({ feature: "session_end_prompt" });
    const message = [
      `Which role did you test today? ${role}`,
      notes ? `Notes: ${notes}` : "Notes: (none)",
      "",
      formatContextBlock(ctx),
    ].join("\n");
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "Tester Session",
          name: currentAccountSafe()?.name || "Tester",
          email: global.currentUser || "",
          subject: `Tester session — ${role}`,
          message,
          sourceUrl: location.href,
          page: ctx.page,
          role: ROLE_META[role]?.key || role,
          accountType: currentAccountSafe()?.accountType || "",
          context: ctx,
          testedRole: role,
        }),
      });
    } catch { /* ignore */ }
    try { sessionStorage.setItem(SESSION_PROMPT_KEY, "1"); } catch { /* ignore */ }
    const pendingLogout = document.querySelector("#multiRoleSessionModal")?.dataset?.pendingLogout === "1";
    closeSessionModal();
    if (pendingLogout) {
      clearView({ silent: true });
      if (typeof global.logout === "function") global.logout();
      else {
        try { localStorage.removeItem("llhUser"); } catch { /* ignore */ }
        global.currentUser = null;
        location.href = "/?view=login";
      }
    }
  }

  function bindEvents() {
    if (document.body.dataset.multiRoleBound === "1") return;
    document.body.dataset.multiRoleBound = "1";
    document.addEventListener("click", (event) => {
      const t = event.target;
      if (!(t instanceof Element)) return;
      if (t.closest("#multiRoleSwitchBtn") || t.closest("[data-multi-role-open-switch]")) {
        event.preventDefault();
        openSwitchModal();
        return;
      }
      const pick = t.closest("[data-multi-role-pick]");
      if (pick) {
        event.preventDefault();
        setViewRole(pick.getAttribute("data-multi-role-pick")).then(() => closeSwitchModal()).catch((err) => {
          global.showActionFeedback?.(err.message || "Could not switch view.");
        });
        return;
      }
      if (t.closest("[data-multi-role-return]")) {
        event.preventDefault();
        const prev = getActiveViewRole() || "role";
        clearView();
        logRoleSwitch({ fromRole: prev, toRole: "My Tester View", source: "return_my_view" });
        closeSwitchModal();
        return;
      }
      const help = t.closest("[data-multi-role-help]");
      if (help) {
        event.preventDefault();
        openHelp(help.getAttribute("data-multi-role-help"));
        return;
      }
      if (t.closest("[data-multi-role-help-close]")) {
        event.preventDefault();
        closeHelp();
        return;
      }
      if (t.closest("[data-multi-role-switch-close]")) {
        event.preventDefault();
        closeSwitchModal();
        return;
      }
      if (t.closest("#reportBugFab")) {
        event.preventDefault();
        openSmartFeedback({ type: "Bug" });
        return;
      }
      if (t.closest("[data-multi-role-session-close], [data-multi-role-session-skip]")) {
        event.preventDefault();
        try { sessionStorage.setItem(SESSION_PROMPT_KEY, "1"); } catch { /* ignore */ }
        const pendingLogout = document.querySelector("#multiRoleSessionModal")?.dataset?.pendingLogout === "1";
        closeSessionModal();
        if (pendingLogout && typeof global.logout === "function") global.logout();
      }
    });
    document.addEventListener("submit", (event) => {
      if (event.target?.id === "multiRoleSessionForm") {
        submitSessionFeedback(event);
      }
    });
  }

  function init() {
    ensureDom();
    bindEvents();
    applyChrome();
    // One platform sync after chrome is mounted (safe: applyChrome no longer calls refreshPlatform).
    refreshPlatform();
  }

  const api = {
    ROLES,
    ROLE_META,
    canUseMultiRoleTester,
    accountHasMultiRolePermission,
    getActiveViewRole,
    getActiveViewRoleKey,
    isSimulating,
    setViewRole,
    clearView,
    applyChrome,
    init,
    openSwitchModal,
    openHelp,
    openSmartFeedback,
    collectClientContext,
    buildSmartFeedbackMessage,
    maybePromptSessionEnd,
    formatContextBlock,
  };

  global.LLHMultiRoleTester = api;
  // Convenience globals used by app.js hooks
  global.canUseMultiRoleTester = canUseMultiRoleTester;
  global.getMultiRoleTesterViewRole = getActiveViewRoleKey;
  global.isMultiRoleTesterSimulating = isSimulating;
  global.syncMultiRoleTesterChrome = applyChrome;
  global.openMultiRoleSmartFeedback = openSmartFeedback;
  global.buildMultiRoleSmartFeedbackMessage = buildSmartFeedbackMessage;
  global.collectMultiRoleFeedbackContext = collectClientContext;
  global.maybePromptMultiRoleSessionEnd = maybePromptSessionEnd;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    setTimeout(init, 0);
  }
})(typeof window !== "undefined" ? window : globalThis);
