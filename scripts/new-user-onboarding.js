/**
 * Phase 1 — New user onboarding (Free → experience → informed Trial).
 * Does not change Stripe, pricing, trial length, auth, signup, billing, curriculum, or Family Hub.
 * Relies on globals from app.js (trackEvent, setView, escapeHtml, startProTrial, etc.).
 *
 * Recommendation architecture: getContentRecommendations() is the extension point for a future
 * AI Lesson Teacher / analytics provider. Today it returns manual Featured This Week titles.
 */
(function initNewUserOnboarding(global) {
  const ONBOARDING_KEY = "llhNewUserOnboardingV1";
  const FREE_STARTER_DISMISS_KEY = "llhFreeStarterCardsDismissed";
  const VALUE_MOMENTS_KEY = "llhUpgradeValueMoments";
  const TRIAL_SUPPRESS_SESSION_KEY = "llhSuppressTrialPromptSession";
  const TRIAL_WELCOME_BANNER_DISMISS_KEY = "llhTrialWelcomeBannerDismissed";
  const GETTING_STARTED_DISMISS_KEY = "llhGettingStartedDismissed";
  const EXPERIMENT_VERSION = "A";

  const DEFAULT_FEATURED_TITLES = Object.freeze([
    "Farm Animals",
    "All About Me",
    "Colors Everywhere",
  ]);

  const DEFAULT_FEATURED_IDS = Object.freeze([
    "cur-lp-preschool-farm-animals",
    "cur-lp-preschool-all-about-me",
    "cur-lp-toddler-colors-everywhere",
  ]);

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
      firstTimeUser: true,
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
        startTrialOrPremium: false,
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

  function isTrialWelcomeBannerDismissed() {
    try {
      return localStorage.getItem(TRIAL_WELCOME_BANNER_DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  }

  function dismissTrialWelcomeBanner() {
    try {
      localStorage.setItem(TRIAL_WELCOME_BANNER_DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    document.querySelectorAll("[data-trial-welcome-banner]").forEach((node) => node.remove());
  }

  function isGettingStartedDismissed() {
    try {
      return localStorage.getItem(GETTING_STARTED_DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  }

  function dismissGettingStarted() {
    try {
      localStorage.setItem(GETTING_STARTED_DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    document.querySelectorAll("[data-getting-started-checklist]").forEach((node) => node.remove());
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
    const kinds = moments.kinds || [];
    if (kinds.some((k) => ["locked_feature", "premium_limit", "printable", "ai_tool", "several_lessons"].includes(k))) {
      return true;
    }
    const state = getState();
    if ((state.lessonOpenCount || 0) >= 2) return true;
    return false;
  }

  function shouldDeferGenericUpgradePrompts() {
    const state = getState();
    if (!state.deferGenericUpgrades && !state.freeSelectedAt) return false;
    if (hasReachedMeaningfulUpgradeValueMoment()) return false;
    return Boolean(state.deferGenericUpgrades || state.freeSelectedAt);
  }

  function isOnboardingModalStep(step) {
    return ["welcome", "explore", "trial-explain", "trial-cancel", "trial-success"].includes(step);
  }

  function isNewUserOnboardingActive() {
    const state = getState();
    return Boolean(state.active && isOnboardingModalStep(state.step));
  }

  function isFirstTimeUser() {
    const state = getState();
    return Boolean(state.firstTimeUser || state.freeSelectedAt || state.trialStartedAt || state.accountCreatedAt);
  }

  /**
   * Future-ready recommendation provider.
   * source: "manual" (default) | "analytics" | "ai" (not implemented yet)
   */
  function getOnboardingConfig() {
    let site = {};
    try {
      site = typeof global.effectiveSiteContent === "function" ? (global.effectiveSiteContent() || {}) : {};
    } catch {
      site = {};
    }
    const cfg = site.onboardingRecommendations || site.featuredThisWeek || {};
    return {
      source: String(cfg.source || "manual"),
      featuredLessonIds: Array.isArray(cfg.featuredLessonIds) && cfg.featuredLessonIds.length
        ? cfg.featuredLessonIds.map(String)
        : DEFAULT_FEATURED_IDS.slice(),
      featuredLessonTitles: Array.isArray(cfg.featuredLessonTitles) && cfg.featuredLessonTitles.length
        ? cfg.featuredLessonTitles.map(String)
        : DEFAULT_FEATURED_TITLES.slice(),
      // Placeholder for future AI Lesson Teacher context (program type, age focus, etc.)
      aiContext: cfg.aiContext && typeof cfg.aiContext === "object" ? cfg.aiContext : null,
    };
  }

  function getContentRecommendations(context = {}) {
    const cfg = getOnboardingConfig();
    // Future: if (cfg.source === "ai") return await AILessonTeacher.recommend(context)
    // Future: if (cfg.source === "analytics") return analyticsTopLessons(context)
    return {
      source: cfg.source || "manual",
      reason: context.reason || "featured_this_week",
      titles: cfg.featuredLessonTitles.slice(),
      ids: cfg.featuredLessonIds.slice(),
      aiContext: cfg.aiContext,
    };
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

  function goToLessonPlans(options = {}) {
    if (typeof global.setView === "function") {
      global.setView("lessons", { fromAuthLanding: true, ...options });
    }
    if (typeof global.renderCategoryPage === "function") {
      try { global.renderCategoryPage("lessons"); } catch { /* ignore */ }
    }
  }

  function checklistProgress(state) {
    const isTrial = Boolean(state.trialStartedAt) || (typeof global.isProUser === "function" && global.isProUser() && state.trialStartedAt);
    const rows = gettingStartedRows(state, isTrial);
    const done = rows.filter((r) => r.done).length;
    return { done, total: rows.length, complete: done === rows.length && rows.length > 0 };
  }

  function gettingStartedRows(state, isTrial) {
    const checklist = state.checklist || {};
    const rows = [
      { key: "openLesson", label: "Open your first lesson plan", done: Boolean(checklist.openLesson || state.milestones?.firstLessonAt) },
      { key: "exploreActivities", label: "Explore Activities", done: Boolean(checklist.exploreActivities || state.milestones?.firstActivityAt) },
      { key: "addCalendar", label: "Save a lesson to your Calendar", done: Boolean(checklist.addCalendar || state.milestones?.firstCalendarAt) },
    ];
    if (isTrial || state.trialStartedAt) {
      rows.push({
        key: "startTrialOrPremium",
        label: "Explore a Premium Feature",
        done: Boolean(checklist.startTrialOrPremium || state.milestones?.firstAiAt || (state.lessonOpenCount || 0) >= 1 && state.trialStartedAt),
      });
    } else {
      rows.push({
        key: "startTrialOrPremium",
        label: "Start your Pro Trial",
        done: Boolean(checklist.startTrialOrPremium || state.trialStartedAt || state.milestones?.firstUpgradeAt),
      });
    }
    return rows;
  }

  function renderChecklistHtml(state, { celebrate = false, compact = false } = {}) {
    const isTrial = Boolean(state.trialStartedAt);
    const rows = gettingStartedRows(state, isTrial).slice(0, compact ? 3 : 4);
    const progress = {
      done: rows.filter((r) => r.done).length,
      total: rows.length,
    };
    progress.complete = progress.done === progress.total;
    return `
      <div class="nuo-checklist" role="list">
        ${rows.map((row) => `
          <div class="nuo-checklist-item ${row.done ? "is-complete" : ""}" role="listitem">
            <span class="nuo-check" aria-hidden="true">${row.done ? "✓" : ""}</span>
            <span>${esc(row.label)}</span>
          </div>
        `).join("")}
      </div>
      <div class="nuo-progress" aria-live="polite">
        <div class="nuo-progress-bar"><span style="width:${Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%"></span></div>
        <p class="nuo-progress-label">${progress.done} of ${progress.total} complete</p>
      </div>
      ${celebrate && progress.complete ? `<p class="nuo-celebrate">Nice work — you’re off to a great start!</p>` : ""}
    `;
  }

  function renderWelcome() {
    return `
      <div class="nuo-screen nuo-welcome">
        <p class="eyebrow">Little Learner Hub</p>
        <h2 id="newUserOnboardingTitle">Welcome — your classroom tools are ready</h2>
        <p class="nuo-lead">Built by a childcare provider for busy teachers and home daycares.</p>
        <p>We’ll help you find lesson plans, document children’s days, and keep families in the loop — without the paperwork pile.</p>
        <p class="muted-copy">This takes about a minute. You can change anything later in Settings.</p>
        <div class="nuo-actions">
          <button type="button" class="primary-button" data-nuo-action="continue">Let’s get started</button>
        </div>
      </div>
    `;
  }

  function renderExplore() {
    return `
      <div class="nuo-screen nuo-explore">
        <h2 id="newUserOnboardingTitle">Choose how you want to explore</h2>
        <p class="nuo-lead">Pick the pace that feels right. You can switch anytime from Settings.</p>
        <div class="nuo-cards">
          <article class="nuo-card nuo-card--free">
            <h3>Continue with Free</h3>
            <p>Explore the platform at your own pace — no credit card needed.</p>
            <ul>
              <li>Free lesson plans</li>
              <li>Free activities</li>
              <li>Planning tools</li>
              <li>Upgrade anytime</li>
            </ul>
            <button type="button" class="primary-button nuo-btn-free" data-nuo-action="choose-free">Continue with Free</button>
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
              <li>Premium resources &amp; printables</li>
            </ul>
            <div class="nuo-trial-terms">
              <p>You will enter a payment method through secure Stripe checkout.</p>
              <p><strong>You will not be charged today.</strong></p>
              <p>You can cancel before the trial ends to avoid being charged.</p>
              <p class="nuo-fine">7-day trial · Card required to start · Trial length unchanged</p>
            </div>
            <button type="button" class="primary-button" data-nuo-action="choose-trial">Continue to Secure Checkout</button>
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
        <div class="nuo-trial-terms">
          <p>You will enter a payment method through secure Stripe checkout.</p>
          <p><strong>You will not be charged today.</strong></p>
          <p>You can cancel before the trial ends to avoid being charged.</p>
          <p class="nuo-fine">7-day trial · Card required to start · Trial length unchanged</p>
        </div>
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
        <h2 id="newUserOnboardingTitle">Your Pro Trial is Active!</h2>
        <p class="nuo-lead">Everything is now unlocked. Here's where most providers start:</p>
        ${renderChecklistHtml(state, { celebrate: true, compact: true })}
        <div class="nuo-start-grid nuo-start-grid--rich">
          <article class="nuo-start-card-rich">
            <p class="nuo-start-icon" aria-hidden="true">📚</p>
            <h3>Lesson Plans</h3>
            <p>Open a ready-to-use plan and see the full week at a glance.</p>
            <button type="button" class="primary-button" data-nuo-nav="lessons">Open a lesson plan</button>
          </article>
          <article class="nuo-start-card-rich">
            <p class="nuo-start-icon" aria-hidden="true">📅</p>
            <h3>Calendar</h3>
            <p>Save one plan to your calendar so your week is ready.</p>
            <button type="button" class="ghost-button" data-nuo-nav="calendar">Save one to your calendar</button>
          </article>
          <article class="nuo-start-card-rich">
            <p class="nuo-start-icon" aria-hidden="true">🎨</p>
            <h3>Activities</h3>
            <p>Browse age-ready activities you can use today.</p>
            <button type="button" class="ghost-button" data-nuo-nav="activities">Explore Activities</button>
          </article>
        </div>
        <div class="nuo-actions">
          <button type="button" class="primary-button" data-nuo-action="finish-trial-success">Browse Lesson Plans</button>
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
    const showForFreePath = Boolean(state.freeSelectedAt) || state.step === "free-start";
    if (!showForFreePath) return "";
    return `
      <section class="free-starter-explore" data-free-starter-explore role="region" aria-label="Let's get you started">
        <div class="free-starter-explore-copy">
          <p class="free-starter-explore-badge">Welcome!</p>
          <h3>Let's get you started</h3>
          <p>Explore the product first — no pressure to upgrade.</p>
        </div>
        <div class="free-starter-explore-grid">
          <article class="nuo-start-card-rich">
            <p class="nuo-start-icon" aria-hidden="true">📚</p>
            <h3>Lesson Plans</h3>
            <p>Browse ready-to-use lesson plans for infants, toddlers, and preschoolers.</p>
            <button type="button" class="primary-button" data-nuo-nav="lessons">Browse Lesson Plans</button>
          </article>
          <article class="nuo-start-card-rich">
            <p class="nuo-start-icon" aria-hidden="true">🎨</p>
            <h3>Activities</h3>
            <p>Find age-ready activities organized by theme and learning domain.</p>
            <button type="button" class="ghost-button" data-nuo-nav="activities">Explore Activities</button>
          </article>
          <article class="nuo-start-card-rich">
            <p class="nuo-start-icon" aria-hidden="true">📅</p>
            <h3>Calendar</h3>
            <p>Plan your week by saving a lesson plan to your calendar.</p>
            <button type="button" class="ghost-button" data-nuo-nav="calendar">Open Calendar</button>
          </article>
        </div>
        <div class="free-starter-explore-actions">
          <button type="button" class="ghost-button" data-dismiss-free-starter>Dismiss</button>
        </div>
      </section>
    `;
  }

  function trialWelcomeBannerHtml() {
    const state = getState();
    if (!state.trialStartedAt) return "";
    if (isTrialWelcomeBannerDismissed()) return "";
    if (typeof global.isProUser === "function" && !global.isProUser()) return "";
    if (isNewUserOnboardingActive()) return "";
    return `
      <section class="nuo-trial-welcome-banner" data-trial-welcome-banner role="region" aria-label="Pro Trial welcome">
        <div class="nuo-trial-welcome-copy">
          <p class="nuo-emoji" aria-hidden="true">🎉</p>
          <h3>Your Pro Trial is Active!</h3>
          <p>Everything is now unlocked.</p>
          <p class="muted-copy">Here are a few great places to start:</p>
          <div class="nuo-trial-welcome-actions">
            <button type="button" class="primary-button" data-nuo-nav="lessons">Browse Premium Lesson Plans</button>
            <button type="button" class="ghost-button" data-nuo-nav="activities">Explore Activities</button>
            <button type="button" class="ghost-button" data-nuo-nav="calendar">Save a Lesson to Your Calendar</button>
          </div>
        </div>
        <button type="button" class="ghost-button nuo-dismiss" data-dismiss-trial-welcome aria-label="Dismiss welcome banner">Dismiss</button>
      </section>
    `;
  }

  function gettingStartedChecklistHtml() {
    if (!isFirstTimeUser()) return "";
    if (isGettingStartedDismissed()) return "";
    if (isNewUserOnboardingActive()) return "";
    const state = getState();
    if (!state.freeSelectedAt && !state.trialStartedAt && !state.accountCreatedAt) return "";
    const progress = checklistProgress(state);
    if (progress.complete) return "";
    return `
      <section class="nuo-getting-started" data-getting-started-checklist role="region" aria-label="Getting Started">
        <div class="nuo-getting-started-head">
          <div>
            <p class="eyebrow">Getting Started</p>
            <h3>Your first wins</h3>
          </div>
          <button type="button" class="ghost-button" data-dismiss-getting-started aria-label="Dismiss getting started">Dismiss</button>
        </div>
        ${renderChecklistHtml(state, { celebrate: true })}
      </section>
    `;
  }

  /** @deprecated Use trialWelcomeBannerHtml + gettingStartedChecklistHtml */
  function trialDashboardChecklistHtml() {
    return trialWelcomeBannerHtml() || gettingStartedChecklistHtml();
  }

  function lessonLibraryOnboardingHtml() {
    if (isNewUserOnboardingActive()) return "";
    const parts = [
      trialWelcomeBannerHtml(),
      freeStarterExploreHtml(),
      gettingStartedChecklistHtml(),
    ].filter(Boolean);
    return parts.join("");
  }

  function beginAfterFreeSignup() {
    const now = new Date().toISOString();
    saveState({
      ...defaultState(),
      active: true,
      step: "welcome",
      accountCreatedAt: now,
      deferGenericUpgrades: true,
      firstTimeUser: true,
      experiment: EXPERIMENT_VERSION,
    });
    try {
      localStorage.removeItem(FREE_STARTER_DISMISS_KEY);
      localStorage.removeItem("llhFreeWelcomeCardDismissed");
      localStorage.removeItem(GETTING_STARTED_DISMISS_KEY);
      localStorage.removeItem(TRIAL_WELCOME_BANNER_DISMISS_KEY);
    } catch {
      /* ignore */
    }
    track("welcome_screen_viewed", { step: "welcome" });
    goToLessonPlans();
    window.setTimeout(() => openModal(), 40);
  }

  function finishFreePath() {
    const now = new Date().toISOString();
    updateState({
      active: false,
      step: "free-start",
      freeSelectedAt: getState().freeSelectedAt || now,
      deferGenericUpgrades: true,
      firstTimeUser: true,
    });
    try {
      localStorage.setItem("llhFreeWelcomeCardDismissed", "1");
    } catch {
      /* ignore */
    }
    closeModal();
    goToLessonPlans();
    if (typeof global.refreshFreePlanUpgradeChrome === "function") {
      try { global.refreshFreePlanUpgradeChrome(); } catch { /* ignore */ }
    }
  }

  async function startCheckoutFromOnboarding() {
    updateState({ fromOnboardingCheckout: true });
    track("trial_checkout_opened", { source: "new_user_onboarding" });
    if (typeof global.startProTrial !== "function") return;
    await global.startProTrial({
      skipConfirm: true,
      fromOnboarding: true,
      force: true,
    });
  }

  function handleTrialCheckoutCancel() {
    suppressTrialPromptsThisSession();
    track("trial_checkout_cancelled", { source: "new_user_onboarding" });
    updateState({
      active: true,
      step: "trial-cancel",
      fromOnboardingCheckout: false,
      deferGenericUpgrades: true,
    });
    goToLessonPlans();
    openModal();
  }

  function handleTrialCheckoutSuccess() {
    const now = new Date().toISOString();
    const state = getState();
    const created = state.accountCreatedAt || state.trialSelectedAt || now;
    try {
      localStorage.removeItem(TRIAL_WELCOME_BANNER_DISMISS_KEY);
    } catch {
      /* ignore */
    }
    updateState({
      active: true,
      step: "trial-success",
      trialStartedAt: now,
      fromOnboardingCheckout: false,
      deferGenericUpgrades: false,
      firstTimeUser: true,
      checklist: { ...state.checklist, startTrialOrPremium: true },
    });
    track("trial_started", { source: "new_user_onboarding" });
    try {
      const ms = Date.now() - new Date(created).getTime();
      if (Number.isFinite(ms) && ms >= 0) track("time_to_trial", { ms, seconds: Math.round(ms / 1000) });
    } catch {
      /* ignore */
    }
    goToLessonPlans();
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
    if (milestoneKey === "firstAiAt" || milestoneKey === "firstUpgradeAt") checklist.startTrialOrPremium = true;
    const lessonOpenCount = state.lessonOpenCount || 0;
    updateState({ milestones, checklist, lessonOpenCount });
    if (state.step === "trial-success" && isNewUserOnboardingActive()) renderOnboarding();
    try {
      if (typeof global.renderCategoryPage === "function" && document.querySelector("#view-lessons.active-view")) {
        global.renderCategoryPage("lessons");
      }
    } catch {
      /* ignore */
    }
    return firstTime;
  }

  function observeAnalyticsEvent(name, detail = {}) {
    if (name === "lesson_plan_view") {
      const state = getState();
      const nextCount = (state.lessonOpenCount || 0) + 1;
      updateState({ lessonOpenCount: nextCount });
      if (nextCount >= 2) markValueMoment("several_lessons");
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
  }

  function navigateStarter(view) {
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
      updateState({ trialSelectedAt: new Date().toISOString(), step: "trial-explain" });
      // Terms are already on the Trial card; proceed to existing Stripe Checkout (card required).
      await startCheckoutFromOnboarding();
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
      goToLessonPlans();
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
    if (event.target.closest("[data-dismiss-free-starter]")) {
      event.preventDefault();
      dismissFreeStarterCards();
      return;
    }
    if (event.target.closest("[data-dismiss-trial-welcome]")) {
      event.preventDefault();
      dismissTrialWelcomeBanner();
      return;
    }
    if (event.target.closest("[data-dismiss-getting-started]")) {
      event.preventDefault();
      dismissGettingStarted();
    }
  }

  function maybeResumeOnBoot() {
    const state = getState();
    if (state.fromOnboardingCheckout) return;
    if (state.active && isOnboardingModalStep(state.step)) {
      window.setTimeout(() => openModal(), 80);
    }
  }

  global.NewUserOnboarding = {
    EXPERIMENT_VERSION,
    DEFAULT_FEATURED_TITLES,
    DEFAULT_FEATURED_IDS,
    getState,
    beginAfterFreeSignup,
    freeStarterExploreHtml,
    trialWelcomeBannerHtml,
    gettingStartedChecklistHtml,
    lessonLibraryOnboardingHtml,
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
    isFirstTimeUser,
    getOnboardingConfig,
    getContentRecommendations,
    openModal,
    closeModal,
    renderOnboarding,
  };

  global.beginNewUserOnboardingAfterFreeSignup = beginAfterFreeSignup;
  global.renderFreeStarterExploreHtml = freeStarterExploreHtml;
  global.renderTrialDashboardChecklistHtml = trialDashboardChecklistHtml;
  global.renderLessonLibraryOnboardingHtml = lessonLibraryOnboardingHtml;
  global.shouldDeferGenericUpgradePrompts = shouldDeferGenericUpgradePrompts;
  global.hasReachedMeaningfulUpgradeValueMoment = hasReachedMeaningfulUpgradeValueMoment;
  global.markUpgradeValueMoment = markValueMoment;
  global.isTrialPromptSuppressedThisSession = isTrialPromptSuppressedThisSession;
  global.getOnboardingContentRecommendations = getContentRecommendations;

  document.addEventListener("click", onDocumentClick);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", maybeResumeOnBoot);
  } else {
    maybeResumeOnBoot();
  }
})(typeof window !== "undefined" ? window : globalThis);
