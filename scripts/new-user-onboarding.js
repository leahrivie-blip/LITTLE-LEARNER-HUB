/**
 * Phase 1 — New user onboarding (Free → experience → informed Trial).
 * Does not change Stripe, pricing, trial length, auth, signup, billing, curriculum, or Family Hub.
 * Relies on globals from app.js (trackEvent, setView, escapeHtml, startProTrial, etc.).
 */
(function initNewUserOnboarding(global) {
  const ONBOARDING_KEY = "llhNewUserOnboardingV1";
  const FREE_STARTER_DISMISS_KEY = "llhFreeStarterCardsDismissed";
  const VALUE_MOMENTS_KEY = "llhUpgradeValueMoments";
  const TRIAL_SUPPRESS_SESSION_KEY = "llhSuppressTrialPromptSession";
  const EXPERIMENT_VERSION = "A"; // A: welcome + chooser; future B/C/D

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }

  function defaultState() {
    return {
      active: false,
      step: "welcome",
      experiment: EXPERIMENT_VERSION,
      accountCreatedAt: "",
      continueAt: "",
      freeSelectedAt: "",
      trialSelectedAt: "",
      trialStartedAt: "",
      fromOnboardingCheckout: false,
      deferGenericUpgrades: false,
      milestones: {
        firstLessonAt: "",
        firstActivityAt: "",
        firstCalendarAt: "",
        firstFavoriteAt: "",
        firstPrintableViewAt: "",
        firstPrintableDownloadAt: "",
        firstAiAt: "",
        firstUpgradeAt: "",
      },
      checklist: {
        openLesson: false,
        addCalendar: false,
        exploreActivities: false,
        tryDocs: false,
      },
      lessonOpenCount: 0,
    };
  }

  function getState() {
    return { ...defaultState(), ...readJson(ONBOARDING_KEY, {}) };
  }

  function saveState(next) {
    writeJson(ONBOARDING_KEY, next);
    return next;
  }

  function updateState(patch) {
    return saveState({ ...getState(), ...patch });
  }

  function esc(value) {
    if (typeof global.escapeHtml === "function") return global.escapeHtml(value);
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function track(name, detail = {}) {
    if (typeof global.trackEvent === "function") {
      global.trackEvent(name, { experiment: EXPERIMENT_VERSION, ...detail });
    }
  }

  function isTrialPromptSuppressedThisSession() {
    try {
      return sessionStorage.getItem(TRIAL_SUPPRESS_SESSION_KEY) === "1";
    } catch {
      return false;
    }
  }

  function suppressTrialPromptsThisSession() {
    try {
      sessionStorage.setItem(TRIAL_SUPPRESS_SESSION_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  function isFreeStarterDismissed() {
    try {
      return localStorage.getItem(FREE_STARTER_DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  }

  function dismissFreeStarterCards() {
    try {
      localStorage.setItem(FREE_STARTER_DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    document.querySelectorAll("[data-free-starter-explore]").forEach((node) => node.remove());
  }

  function getValueMoments() {
    return readJson(VALUE_MOMENTS_KEY, { count: 0, kinds: [] });
  }

  function markValueMoment(kind) {
    const current = getValueMoments();
    const kinds = Array.isArray(current.kinds) ? current.kinds.slice() : [];
    if (!kinds.includes(kind)) kinds.push(kind);
    const next = { count: kinds.length, kinds, lastAt: new Date().toISOString(), lastKind: kind };
    writeJson(VALUE_MOMENTS_KEY, next);
    return next;
  }

  function hasReachedMeaningfulUpgradeValueMoment() {
    const moments = getValueMoments();
    if ((moments.count || 0) >= 1) return true;
    const state = getState();
    if ((state.lessonOpenCount || 0) >= 2) return true;
    if (state.milestones?.firstLessonAt && state.milestones?.firstActivityAt) return true;
    return false;
  }

  function shouldDeferGenericUpgradePrompts() {
    const state = getState();
    if (!state.deferGenericUpgrades) return false;
    if (hasReachedMeaningfulUpgradeValueMoment()) return false;
    return true;
  }

  function isOnboardingModalStep(step) {
    return ["welcome", "explore", "trial-explain", "trial-cancel", "trial-success"].includes(step);
  }

  function isNewUserOnboardingActive() {
    const state = getState();
    return Boolean(state.active && isOnboardingModalStep(state.step));
  }

  function modalEl() {
    return document.querySelector("#newUserOnboardingModal");
  }

  function openModal() {
    const modal = modalEl();
    if (!modal) return;
    document.body.classList.add("auth-modal-open", "nuo-open");
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    renderOnboarding();
  }

  function closeModal() {
    const modal = modalEl();
    if (!modal) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("nuo-open");
    if (!document.querySelector("#authModal.open, #proModal.open, #featurePreviewModal.open")) {
      document.body.classList.remove("auth-modal-open");
    }
  }

  function checklistProgress(state) {
    const items = [
      state.checklist.openLesson,
      state.checklist.addCalendar,
      state.checklist.exploreActivities,
    ];
    const done = items.filter(Boolean).length;
    return { done, total: items.length, complete: done === items.length };
  }

  function renderChecklistHtml(state, { celebrate = false } = {}) {
    const progress = checklistProgress(state);
    const rows = [
      { key: "openLesson", label: "Open your first lesson plan" },
      { key: "addCalendar", label: "Save one to your calendar" },
      { key: "exploreActivities", label: "Explore Activities" },
    ];
    return `
      <div class="nuo-checklist" role="list">
        ${rows.map((row) => `
          <div class="nuo-checklist-item ${state.checklist[row.key] ? "is-complete" : ""}" role="listitem">
            <span class="nuo-check" aria-hidden="true">${state.checklist[row.key] ? "✓" : ""}</span>
            <span>${esc(row.label)}</span>
          </div>
        `).join("")}
      </div>
      <div class="nuo-progress" aria-live="polite">
        <div class="nuo-progress-bar"><span style="width:${Math.round((progress.done / progress.total) * 100)}%"></span></div>
        <p class="nuo-progress-label">${progress.done} of ${progress.total} complete</p>
      </div>
      ${celebrate && progress.complete ? `<p class="nuo-celebrate">Nice work — you’re off to a great start!</p>` : ""}
    `;
  }

  function renderWelcome() {
    return `
      <div class="nuo-screen nuo-welcome">
        <p class="nuo-emoji" aria-hidden="true">🎉</p>
        <h2 id="newUserOnboardingTitle">Welcome to Little Learner Hub!</h2>
        <p class="nuo-lead">Your free account is ready.</p>
        <p>Little Learner Hub was built by a childcare provider to save you time every week.</p>
        <p class="muted-copy">We'll help you get started in under a minute.</p>
        <div class="nuo-actions">
          <button type="button" class="primary-button" data-nuo-action="continue">Continue</button>
        </div>
      </div>
    `;
  }

  function renderExplore() {
    return `
      <div class="nuo-screen nuo-explore">
        <h2 id="newUserOnboardingTitle">Choose how you want to explore</h2>
        <p class="nuo-lead">This is onboarding — pick the pace that feels right. You can switch anytime from Settings.</p>
        <div class="nuo-cards">
          <article class="nuo-card">
            <h3>Continue with Free</h3>
            <p>Explore the platform at your own pace.</p>
            <ul>
              <li>Free lesson plans</li>
              <li>Free activities</li>
              <li>Planning tools</li>
              <li>Upgrade anytime</li>
            </ul>
            <button type="button" class="ghost-button" data-nuo-action="choose-free">Continue with Free</button>
          </article>
          <article class="nuo-card nuo-card--featured">
            <p class="nuo-badge">Most Popular</p>
            <h3>⭐ Start Your 7-Day Pro Trial</h3>
            <p>Experience everything before deciding.</p>
            <ul>
              <li>Premium lesson plans</li>
              <li>Premium activities</li>
              <li>Calendar tools</li>
              <li>Documentation Helpers</li>
              <li>AI tools</li>
              <li>Premium resources</li>
              <li>Printables</li>
            </ul>
            <p class="nuo-fine">No charge today. Cancel anytime before your trial ends.</p>
            <button type="button" class="primary-button" data-nuo-action="choose-trial">Start My Free Trial</button>
          </article>
        </div>
      </div>
    `;
  }

  function renderTrialExplain() {
    return `
      <div class="nuo-screen nuo-trial-explain">
        <h2 id="newUserOnboardingTitle">Start Your 7-Day Pro Trial</h2>
        <p class="nuo-lead">Unlock everything in Little Learner Hub for 7 days.</p>
        <ul class="nuo-includes">
          <li>Premium lesson plans</li>
          <li>Premium activities</li>
          <li>Calendar planning</li>
          <li>Documentation Helpers</li>
          <li>AI tools</li>
          <li>Premium resources</li>
          <li>Printables</li>
        </ul>
        <p>To start your trial, you'll enter a payment method through our secure checkout.</p>
        <p><strong>You will not be charged today.</strong></p>
        <p class="muted-copy">You can cancel anytime before your trial ends to avoid being charged.</p>
        <div class="nuo-actions">
          <button type="button" class="primary-button" data-nuo-action="checkout">Continue to Secure Checkout</button>
          <button type="button" class="ghost-button" data-nuo-action="back-explore">Back</button>
        </div>
        <p class="nuo-fine">Secure checkout powered by Stripe.</p>
      </div>
    `;
  }

  function renderTrialCancel() {
    return `
      <div class="nuo-screen nuo-trial-cancel">
        <h2 id="newUserOnboardingTitle">No problem!</h2>
        <p class="nuo-lead">Your free account is still ready to use, and you can start your trial anytime.</p>
        <div class="nuo-actions">
          <button type="button" class="primary-button" data-nuo-action="continue-free-after-cancel">Continue Exploring for Free</button>
        </div>
      </div>
    `;
  }

  function renderTrialSuccess(state) {
    return `
      <div class="nuo-screen nuo-trial-success">
        <p class="nuo-emoji" aria-hidden="true">🎉</p>
        <h2 id="newUserOnboardingTitle">Your 7-Day Pro Trial is Active!</h2>
        <p class="nuo-lead">Let's explore your new features.</p>
        ${renderChecklistHtml(state, { celebrate: true })}
        <div class="nuo-start-grid">
          <button type="button" class="nuo-start-card" data-nuo-nav="lessons">📚 Open a lesson plan</button>
          <button type="button" class="nuo-start-card" data-nuo-nav="calendar">📅 Add one to your calendar</button>
          <button type="button" class="nuo-start-card" data-nuo-nav="activities">🎨 Explore Activities</button>
        </div>
        <div class="nuo-actions">
          <button type="button" class="primary-button" data-nuo-action="finish-trial-success">Start exploring</button>
        </div>
      </div>
    `;
  }

  function renderOnboarding() {
    const modal = modalEl();
    const body = document.querySelector("#newUserOnboardingBody");
    if (!modal || !body) return;
    const state = getState();
    let html = "";
    switch (state.step) {
      case "welcome":
        html = renderWelcome();
        break;
      case "explore":
        html = renderExplore();
        break;
      case "trial-explain":
        html = renderTrialExplain();
        break;
      case "trial-cancel":
        html = renderTrialCancel();
        break;
      case "trial-success":
        html = renderTrialSuccess(state);
        break;
      default:
        html = "";
    }
    body.innerHTML = html;
  }

  function freeStarterExploreHtml() {
    if (typeof global.isLoggedIn === "function" && !global.isLoggedIn()) return "";
    if (typeof global.isProUser === "function" && global.isProUser()) return "";
    if (typeof global.hasAdminFullAccess === "function" && global.hasAdminFullAccess()) return "";
    if (isFreeStarterDismissed()) return "";
    if (isNewUserOnboardingActive()) return "";
    const state = getState();
    // Show after Free path, or for Free owners who still had the old welcome pending.
    const showForFreePath = Boolean(state.freeSelectedAt) || state.step === "free-start";
    const legacyWelcomePending = (() => {
      try {
        return localStorage.getItem("llhFreeWelcomeCardDismissed") !== "1" && !state.freeSelectedAt && !state.trialStartedAt;
      } catch {
        return false;
      }
    })();
    if (!showForFreePath && !legacyWelcomePending) return "";
    if (typeof global.canSeePaidUpgradeOffer === "function" && !global.canSeePaidUpgradeOffer() && !showForFreePath) {
      return "";
    }
    return `
      <section class="free-starter-explore" data-free-starter-explore role="region" aria-label="Welcome to Little Learner Hub">
        <div class="free-starter-explore-copy">
          <p class="free-starter-explore-badge">Welcome!</p>
          <h3>Let's get you started</h3>
          <p>Explore the product first — no pressure to upgrade.</p>
        </div>
        <div class="free-starter-explore-grid">
          <button type="button" class="nuo-start-card" data-nuo-nav="lessons">📚 Browse Lesson Plans</button>
          <button type="button" class="nuo-start-card" data-nuo-nav="activities">🎨 Explore Activities</button>
          <button type="button" class="nuo-start-card" data-nuo-nav="calendar">📅 Open Calendar</button>
        </div>
        <div class="free-starter-explore-actions">
          <button type="button" class="ghost-button" data-dismiss-free-starter>Dismiss</button>
        </div>
      </section>
    `;
  }

  function trialDashboardChecklistHtml() {
    const state = getState();
    if (!state.trialStartedAt) return "";
    if (typeof global.isProUser === "function" && !global.isProUser()) return "";
    if (state.step === "done" && checklistProgress(state).complete) return "";
    if (isNewUserOnboardingActive()) return "";
    return `
      <section class="nuo-dashboard-checklist" role="region" aria-label="First week checklist">
        <p class="eyebrow">Welcome!</p>
        <h3>Let's get you started</h3>
        <p class="muted-copy">A few quick wins to experience Pro during your trial.</p>
        ${renderChecklistHtml(state, { celebrate: true })}
      </section>
    `;
  }

  function beginAfterFreeSignup() {
    const now = new Date().toISOString();
    saveState({
      ...defaultState(),
      active: true,
      step: "welcome",
      accountCreatedAt: now,
      deferGenericUpgrades: true,
      experiment: EXPERIMENT_VERSION,
    });
    try {
      localStorage.removeItem(FREE_STARTER_DISMISS_KEY);
      localStorage.removeItem("llhFreeWelcomeCardDismissed");
    } catch {
      /* ignore */
    }
    track("welcome_screen_viewed", { step: "welcome" });
    if (typeof global.setView === "function") {
      global.setView("calendar", { fromAuthLanding: true });
    }
    window.setTimeout(() => openModal(), 40);
  }

  function finishFreePath() {
    const now = new Date().toISOString();
    updateState({
      active: false,
      step: "free-start",
      freeSelectedAt: getState().freeSelectedAt || now,
      deferGenericUpgrades: true,
    });
    try {
      localStorage.setItem("llhFreeWelcomeCardDismissed", "1");
    } catch {
      /* ignore */
    }
    closeModal();
    if (typeof global.setView === "function") global.setView("calendar", { fromAuthLanding: true });
    if (typeof global.renderMainCalendar === "function") {
      try { global.renderMainCalendar(); } catch { /* ignore */ }
    }
    if (typeof global.refreshFreePlanUpgradeChrome === "function") {
      try { global.refreshFreePlanUpgradeChrome(); } catch { /* ignore */ }
    }
  }

  async function startCheckoutFromOnboarding() {
    updateState({ fromOnboardingCheckout: true });
    if (typeof global.startProTrial !== "function") return;
    await global.startProTrial({
      skipConfirm: true,
      fromOnboarding: true,
      force: true,
    });
  }

  function handleTrialCheckoutCancel() {
    suppressTrialPromptsThisSession();
    updateState({
      active: true,
      step: "trial-cancel",
      fromOnboardingCheckout: false,
      deferGenericUpgrades: true,
    });
    if (typeof global.setView === "function") global.setView("calendar", { fromAuthLanding: true });
    openModal();
  }

  function handleTrialCheckoutSuccess() {
    const now = new Date().toISOString();
    const state = getState();
    const created = state.accountCreatedAt || state.trialSelectedAt || now;
    updateState({
      active: true,
      step: "trial-success",
      trialStartedAt: now,
      fromOnboardingCheckout: false,
      deferGenericUpgrades: false,
    });
    track("trial_started", { source: "new_user_onboarding" });
    try {
      const ms = Date.now() - new Date(created).getTime();
      if (Number.isFinite(ms) && ms >= 0) track("time_to_trial", { ms, seconds: Math.round(ms / 1000) });
    } catch {
      /* ignore */
    }
    if (typeof global.setView === "function") global.setView("calendar", { fromAuthLanding: true });
    openModal();
  }

  function noteMilestone(milestoneKey, eventName, detail = {}) {
    const state = getState();
    const milestones = { ...(state.milestones || {}) };
    const firstTime = !milestones[milestoneKey];
    if (firstTime) {
      milestones[milestoneKey] = new Date().toISOString();
      track(eventName, detail);
      if (milestoneKey === "firstLessonAt" && state.accountCreatedAt) {
        const ms = Date.now() - new Date(state.accountCreatedAt).getTime();
        if (Number.isFinite(ms) && ms >= 0) track("time_to_first_lesson", { ms, seconds: Math.round(ms / 1000) });
      }
      if (milestoneKey === "firstUpgradeAt" && state.accountCreatedAt) {
        const ms = Date.now() - new Date(state.accountCreatedAt).getTime();
        if (Number.isFinite(ms) && ms >= 0) track("time_to_upgrade", { ms, seconds: Math.round(ms / 1000) });
      }
    }
    const checklist = { ...(state.checklist || {}) };
    if (milestoneKey === "firstLessonAt") checklist.openLesson = true;
    if (milestoneKey === "firstCalendarAt") checklist.addCalendar = true;
    if (milestoneKey === "firstActivityAt") checklist.exploreActivities = true;
    if (milestoneKey === "firstAiAt") checklist.tryDocs = true;
    let lessonOpenCount = state.lessonOpenCount || 0;
    if (milestoneKey === "firstLessonAt" || eventName === "first_lesson_opened") {
      /* count handled in observe */
    }
    updateState({ milestones, checklist, lessonOpenCount });
    if (state.step === "trial-success" && isNewUserOnboardingActive()) renderOnboarding();
    return firstTime;
  }

  function observeAnalyticsEvent(name, detail = {}) {
    if (name === "lesson_plan_view") {
      const state = getState();
      updateState({ lessonOpenCount: (state.lessonOpenCount || 0) + 1 });
      if ((state.lessonOpenCount || 0) + 1 >= 2) markValueMoment("several_lessons");
      noteMilestone("firstLessonAt", "first_lesson_opened", detail);
    }
    if (name === "resource_view" && /activit/i.test(String(detail.category || ""))) {
      noteMilestone("firstActivityAt", "first_activity_opened", detail);
    }
    if (name === "schedule_assign_lesson" || name === "lesson_plan_added_to_calendar") {
      noteMilestone("firstCalendarAt", "first_calendar_assignment", detail);
    }
    if (name === "resource_print" || name === "generated_print" || name === "generated_pdf") {
      noteMilestone("firstPrintableViewAt", "first_printable_viewed", detail);
      noteMilestone("firstPrintableDownloadAt", "first_printable_downloaded", detail);
      markValueMoment("printable");
    }
    if (name === "generated_goal_printable_view") {
      noteMilestone("firstPrintableViewAt", "first_printable_viewed", detail);
      markValueMoment("printable");
    }
    if (name === "ai_generation_success") {
      noteMilestone("firstAiAt", "first_ai_feature_used", detail);
      markValueMoment("ai_tool");
    }
    if (name === "checkout_success") {
      noteMilestone("firstUpgradeAt", "first_upgrade", detail);
    }
    if (name === "upgrade_prompt_shown") {
      markValueMoment(detail.promptId || "upgrade_prompt");
    }
  }

  function navigateStarter(view) {
    markValueMoment("starter_nav");
    if (view === "activities") {
      noteMilestone("firstActivityAt", "first_activity_opened", { source: "starter_card" });
    }
    dismissFreeStarterCards();
    if (getState().step === "trial-success") {
      updateState({ active: false, step: "done" });
      closeModal();
    }
    if (typeof global.setView === "function") global.setView(view);
  }

  async function onAction(action) {
    if (action === "continue") {
      track("welcome_continue_pressed");
      updateState({ step: "explore", continueAt: new Date().toISOString() });
      track("welcome_screen_viewed", { step: "explore" });
      renderOnboarding();
      return;
    }
    if (action === "choose-free") {
      track("free_selected", { source: "new_user_onboarding" });
      updateState({ freeSelectedAt: new Date().toISOString(), deferGenericUpgrades: true });
      finishFreePath();
      return;
    }
    if (action === "choose-trial") {
      if (isTrialPromptSuppressedThisSession()) {
        updateState({ step: "trial-cancel" });
        renderOnboarding();
        return;
      }
      track("trial_selected", { source: "new_user_onboarding" });
      updateState({ step: "trial-explain", trialSelectedAt: new Date().toISOString() });
      renderOnboarding();
      return;
    }
    if (action === "back-explore") {
      updateState({ step: "explore" });
      renderOnboarding();
      return;
    }
    if (action === "checkout") {
      await startCheckoutFromOnboarding();
      return;
    }
    if (action === "continue-free-after-cancel") {
      track("free_selected", { source: "trial_checkout_canceled" });
      updateState({ freeSelectedAt: new Date().toISOString() });
      finishFreePath();
      return;
    }
    if (action === "finish-trial-success") {
      updateState({ active: false, step: "done" });
      closeModal();
      if (typeof global.setView === "function") global.setView("lessons");
    }
  }

  function onDocumentClick(event) {
    const actionBtn = event.target.closest("[data-nuo-action]");
    if (actionBtn) {
      event.preventDefault();
      onAction(actionBtn.getAttribute("data-nuo-action"));
      return;
    }
    const navBtn = event.target.closest("[data-nuo-nav]");
    if (navBtn) {
      event.preventDefault();
      navigateStarter(navBtn.getAttribute("data-nuo-nav"));
      return;
    }
    const dismissStarter = event.target.closest("[data-dismiss-free-starter]");
    if (dismissStarter) {
      event.preventDefault();
      dismissFreeStarterCards();
      return;
    }
  }

  function maybeResumeOnBoot() {
    const state = getState();
    if (state.fromOnboardingCheckout) return;
    if (state.active && isOnboardingModalStep(state.step)) {
      window.setTimeout(() => openModal(), 80);
    }
  }

  // Public API
  global.NewUserOnboarding = {
    EXPERIMENT_VERSION,
    getState,
    beginAfterFreeSignup,
    freeStarterExploreHtml,
    trialDashboardChecklistHtml,
    shouldDeferGenericUpgradePrompts,
    hasReachedMeaningfulUpgradeValueMoment,
    markValueMoment,
    isTrialPromptSuppressedThisSession,
    suppressTrialPromptsThisSession,
    handleTrialCheckoutCancel,
    handleTrialCheckoutSuccess,
    observeAnalyticsEvent,
    noteMilestone,
    maybeResumeOnBoot,
    isNewUserOnboardingActive,
    openModal,
    closeModal,
    renderOnboarding,
  };

  // Back-compat helpers used by app.js overrides
  global.beginNewUserOnboardingAfterFreeSignup = beginAfterFreeSignup;
  global.renderFreeStarterExploreHtml = freeStarterExploreHtml;
  global.renderTrialDashboardChecklistHtml = trialDashboardChecklistHtml;
  global.shouldDeferGenericUpgradePrompts = shouldDeferGenericUpgradePrompts;
  global.hasReachedMeaningfulUpgradeValueMoment = hasReachedMeaningfulUpgradeValueMoment;
  global.markUpgradeValueMoment = markValueMoment;
  global.isTrialPromptSuppressedThisSession = isTrialPromptSuppressedThisSession;

  document.addEventListener("click", onDocumentClick);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", maybeResumeOnBoot);
  } else {
    maybeResumeOnBoot();
  }
})(typeof window !== "undefined" ? window : globalThis);
