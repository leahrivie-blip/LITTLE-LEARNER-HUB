/**
 * Finish-My-Week conversion helpers.
 * Isolated client module — does not grant access and never stores PII.
 */
(function finishWeekConversion(global) {
  "use strict";

  const RETURN_KEY = "llhUpgradeReturnContext";
  const RETURN_MAX_AGE_MS = 2 * 60 * 60 * 1000;

  /** @readonly */
  const INTENT = Object.freeze({
    FINISH_WEEK: "finish_week",
    UNLOCK_WEEK: "unlock_week",
    PREMIUM_DAY: "premium_day",
    PREMIUM_ACTIVITY: "premium_activity",
    PRINT_WEEK: "print_week",
    PRINTABLE: "printable",
    SAVE_PREMIUM: "save_premium",
    TEACHING_KIT: "teaching_kit",
    DUPLICATE_PLAN: "duplicate_plan",
  });

  const EVENT_ALIASES = Object.freeze({
    free_week_started: "lesson_viewed",
    free_activity_used: "activity_viewed",
    premium_preview_seen: "pro_content_encountered",
    finish_week_cta_clicked: "upgrade_cta_clicked",
    full_week_unlock_clicked: "upgrade_cta_clicked",
    print_week_cta_clicked: "upgrade_cta_clicked",
    printable_unlock_clicked: "upgrade_cta_clicked",
    checkout_completed_returned: "checkout_completed",
    subscription_confirmed: "paid_subscription_active",
  });

  /**
   * @param {string} intent
   * @returns {{ title: string, body: string, cta: string, event: string }}
   */
  function copyForIntent(intent) {
    switch (String(intent || "")) {
      case INTENT.PRINTABLE:
        return {
          title: "Your printable is ready with Pro.",
          body: "Unlock the printable pack for this week — materials stay on the server until your membership is confirmed.",
          cta: "Unlock Printable Pack",
          event: "printable_unlock_clicked",
        };
      case INTENT.PRINT_WEEK:
        return {
          title: "Your Monday–Friday plan is ready to print.",
          body: "Pro unlocks the full teacher packet for this week so you can print it instead of rebuilding it by hand.",
          cta: "Print My Entire Week",
          event: "print_week_cta_clicked",
        };
      case INTENT.PREMIUM_DAY:
        return {
          title: "Finish the rest of your week.",
          body: "Tuesday through Friday are already planned. Unlock the full week to open directions, notes, and printables.",
          cta: "Unlock the Full Week",
          event: "full_week_unlock_clicked",
        };
      case INTENT.PREMIUM_ACTIVITY:
        return {
          title: "Finish this activity with Pro.",
          body: "You can see what this activity is. Pro unlocks the directions, materials, and teacher notes.",
          cta: "Finish My Lesson Plan",
          event: "full_week_unlock_clicked",
        };
      case INTENT.SAVE_PREMIUM:
        return {
          title: "Save the rest of this week with Pro.",
          body: "Your Free saved work stays. Pro lets you keep the full week plan in one place.",
          cta: "Finish My Week",
          event: "finish_week_cta_clicked",
        };
      case INTENT.TEACHING_KIT:
        return {
          title: "Unlock this teaching kit.",
          body: "The kit outline is ready. Pro opens the full teaching materials for this week.",
          cta: "Finish My Lesson Plan",
          event: "full_week_unlock_clicked",
        };
      case INTENT.DUPLICATE_PLAN:
        return {
          title: "Copy the full week with Pro.",
          body: "Duplicating a complete plan is included with Pro so you can reuse the week you already started.",
          cta: "Finish My Lesson Plan",
          event: "finish_week_cta_clicked",
        };
      case INTENT.UNLOCK_WEEK:
        return {
          title: "Unlock the Full Week",
          body: "See the rest of Monday–Friday — activities, teaching notes, and printables — without planning it yourself.",
          cta: "Unlock the Full Week",
          event: "full_week_unlock_clicked",
        };
      case INTENT.FINISH_WEEK:
      default:
        return {
          title: "Finish My Week",
          body: "You already started. The rest of the week is planned — unlock it when you want the full packet.",
          cta: "Finish My Week",
          event: "finish_week_cta_clicked",
        };
    }
  }

  function weeklyPriceFraming() {
    return "About $4.61/week, billed $19.99 monthly.";
  }

  /**
   * @param {unknown} value
   * @returns {string}
   */
  function safeText(value, max = 180) {
    return String(value == null ? "" : value).trim().slice(0, max);
  }

  /**
   * @param {string} value
   * @returns {string}
   */
  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * @param {Record<string, unknown>} ctx
   */
  function captureReturnContext(ctx) {
    if (!ctx || typeof ctx !== "object") return;
    const next = {
      intent: safeText(ctx.intent, 40),
      lessonId: safeText(ctx.lessonId, 160),
      activityId: safeText(ctx.activityId, 160),
      view: safeText(ctx.view, 40),
      action: safeText(ctx.action, 40),
      capturedAt: Date.now(),
    };
    try {
      sessionStorage.setItem(RETURN_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  /**
   * @param {HTMLElement|null} button
   */
  function captureFromCta(button) {
    if (!button || !button.dataset) return;
    const intent = safeText(button.dataset.upgradeIntent || button.dataset.finishWeekIntent, 40);
    captureReturnContext({
      intent: intent || INTENT.FINISH_WEEK,
      lessonId: button.dataset.returnLesson || button.dataset.lessonId || "",
      activityId: button.dataset.returnActivity || "",
      view: button.dataset.returnView || "",
      action: button.dataset.returnAction || intent || "",
    });
    if (intent) trackFunnelEvent(copyForIntent(intent).event, { ctaLocation: intent });
  }

  function readReturnContext() {
    try {
      const raw = sessionStorage.getItem(RETURN_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      const age = Date.now() - Number(parsed.capturedAt || 0);
      if (!Number.isFinite(age) || age < 0 || age > RETURN_MAX_AGE_MS) {
        clearReturnContext();
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  function clearReturnContext() {
    try { sessionStorage.removeItem(RETURN_KEY); } catch { /* ignore */ }
  }

  /**
   * Restore place after authoritative paid confirmation only.
   * @param {{ isPaid: boolean, openLesson?: (id: string) => void, setView?: (view: string) => void }} opts
   */
  function restoreAfterPaidConfirm(opts) {
    const paid = Boolean(opts && opts.isPaid);
    const ctx = readReturnContext();
    if (!paid || !ctx) return { restored: false, reason: paid ? "no_context" : "not_paid" };
    try {
      if (ctx.lessonId && typeof opts.openLesson === "function") {
        opts.openLesson(ctx.lessonId);
        clearReturnContext();
        return { restored: true, intent: ctx.intent, lessonId: ctx.lessonId };
      }
      if (ctx.view && typeof opts.setView === "function") {
        opts.setView(ctx.view);
        clearReturnContext();
        return { restored: true, intent: ctx.intent, view: ctx.view };
      }
    } catch {
      return { restored: false, reason: "restore_failed" };
    }
    return { restored: false, reason: "no_target" };
  }

  /**
   * @param {unknown} weekPreview
   * @returns {string}
   */
  function weekOutlineHtml(weekPreview) {
    const days = Array.isArray(weekPreview?.days) ? weekPreview.days : [];
    if (!days.length) return "";
    const rows = days.map((day) => {
      const activities = Array.isArray(day.activities) ? day.activities : [];
      if (!activities.length) {
        return `<li class="fw-week-day fw-week-day--empty"><span class="fw-week-day-label">${escapeHtml(day.dayLabel || day.day)}</span><span class="fw-week-day-empty">No activities listed</span></li>`;
      }
      const cards = activities.map((activity) => {
        const meta = [];
        if (activity.activityCategory) meta.push(escapeHtml(activity.activityCategory));
        if (activity.printableIncluded) meta.push("Printable included");
        if (Number.isFinite(activity.prepMinutes) && activity.prepMinutes > 0) {
          meta.push(`Approx. prep: ${Number(activity.prepMinutes)} minutes`);
        }
        return `<article class="fw-week-activity">
          <h4>${escapeHtml(activity.title || "Activity")}</h4>
          ${meta.length ? `<p class="fw-week-activity-meta">${meta.join(" · ")}</p>` : ""}
          <p class="fw-week-lock" role="status"><span aria-hidden="true">🔒</span> Locked — unlock the full week for directions</p>
        </article>`;
      }).join("");
      return `<li class="fw-week-day"><span class="fw-week-day-label">${escapeHtml(day.dayLabel || day.day)}</span>${cards}</li>`;
    }).join("");
    return `<ol class="fw-week-outline" aria-label="Authorized week preview">${rows}</ol>`;
  }

  /**
   * @param {Record<string, boolean>|null} packet
   * @returns {string}
   */
  function packetSummaryHtml(packet) {
    if (!packet || typeof packet !== "object") return "";
    const labels = [
      ["hasWeeklyOverview", "Weekly overview"],
      ["monday", "Monday activities"],
      ["tuesday", "Tuesday activities"],
      ["wednesday", "Wednesday activities"],
      ["thursday", "Thursday activities"],
      ["friday", "Friday activities"],
      ["hasTeachingNotes", "Teaching notes"],
      ["hasObservationPrompts", "Observation prompts"],
      ["hasFamilyConnection", "Family connection"],
      ["hasPrintablePack", "Printable pack"],
    ];
    const items = labels
      .filter(([key]) => packet[key] === true)
      .map(([, label]) => `<li>${escapeHtml(label)}</li>`)
      .join("");
    if (!items) return "";
    return `<div class="fw-packet-summary" aria-label="What the paid week packet includes">
      <p>This week’s paid packet includes:</p>
      <ul>${items}</ul>
    </div>`;
  }

  /**
   * Dashboard card from REAL state only. Fabricated metrics are omitted.
   * @param {Record<string, unknown>} state
   * @returns {string}
   */
  function dashboardCardHtml(state) {
    if (!state || state.show !== true) return "";
    const lines = Array.isArray(state.lines) ? state.lines : [];
    const printableLine = Number(state.printableCount) > 0
      ? `<p class="fw-dash-printables">${Number(state.printableCount)} printable${Number(state.printableCount) === 1 ? "" : "s"} available with the full week</p>`
      : "";
    const lessonId = safeText(state.lessonId, 160);
    return `
      <section class="free-dashboard-upgrade-card fw-finish-week-card" role="region" aria-label="Finish my week" data-free-upgrade-surface="finish-week">
        <div class="free-dashboard-upgrade-card-copy">
          <p class="free-dashboard-upgrade-card-badge">Your week</p>
          <h3>Finish My Week</h3>
          ${state.startedTitle ? `<p>You started <strong>${escapeHtml(state.startedTitle)}</strong>.</p>` : ""}
          ${lines.length ? `<ul class="fw-dash-progress">${lines.map((line) => `<li>${line.done ? "✓" : "○"} ${escapeHtml(line.label)}</li>`).join("")}</ul>` : ""}
          ${printableLine}
          <p class="muted-copy">The rest of the week is already planned. Unlock it when you want the full packet.</p>
          ${state.checkoutPlan === "monthly" || !state.checkoutPlan ? `<p class="muted-copy">${escapeHtml(weeklyPriceFraming())} Billed <strong>$19.99/month</strong>.</p>` : ""}
        </div>
        <div class="free-dashboard-upgrade-card-actions">
          <button class="primary-button" type="button" data-checkout-plan="${escapeHtml(state.checkoutPlan || "monthly")}" data-upgrade-intent="${INTENT.FINISH_WEEK}" data-return-lesson="${escapeHtml(lessonId)}" data-return-view="lessons">${escapeHtml(copyForIntent(INTENT.FINISH_WEEK).cta)}</button>
          <button class="ghost-button" type="button" data-view="plans">Compare Plans</button>
          <button class="ghost-button" type="button" data-dismiss-founding-upgrade>Maybe later</button>
        </div>
      </section>
    `;
  }

  /**
   * @param {string} name
   * @param {Record<string, string|number|boolean|undefined>} [detail]
   */
  function trackFunnelEvent(name, detail = {}) {
    try {
      const clean = {};
      Object.entries(detail || {}).forEach(([key, value]) => {
        if (["email", "name", "phone", "address", "childName", "classroom", "center", "message"].includes(key)) return;
        if (typeof value === "string") clean[key] = value.slice(0, 160);
        else if (typeof value === "number" || typeof value === "boolean") clean[key] = value;
      });
      const analytics = global.LLHConversionAnalytics;
      if (analytics && typeof analytics.trackConversionEvent === "function") {
        analytics.trackConversionEvent(name, clean);
        return;
      }
      if (typeof global.trackEvent === "function") {
        global.trackEvent(name, clean);
      }
    } catch {
      /* never break UX */
    }
  }

  global.LLHFinishWeekConversion = Object.freeze({
    INTENT,
    EVENT_ALIASES,
    copyForIntent,
    weeklyPriceFraming,
    captureReturnContext,
    captureFromCta,
    readReturnContext,
    clearReturnContext,
    restoreAfterPaidConfirm,
    weekOutlineHtml,
    packetSummaryHtml,
    dashboardCardHtml,
    trackFunnelEvent,
  });
})(typeof window !== "undefined" ? window : globalThis);
