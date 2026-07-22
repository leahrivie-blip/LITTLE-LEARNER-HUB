/**
 * Classroom Assistant UI — flagship classroom logging experience.
 * Fake/testing only. One text box, preview before save, offline sync.
 */
(function initClassroomAssistantUI(global) {
  const DEFAULT_BASE = "/api/director-center/classroom-assistant";
  const OFFLINE_KEY_PREFIX = "llh-ca-offline-queue::";
  const PAGE_MARKER = "phase-ca-classroom-assistant-page";

  const FALLBACK_EXAMPLES = [
    {
      id: "meal",
      label: "Group meal",
      text: "Breakfast was at 8:30. Everyone had bananas, apples, and milk. Timmy decided not to eat his breakfast.",
    },
    {
      id: "activity",
      label: "Activity highlight",
      text: "Today we went on a walk and looked for butterflies. Everyone loved it. Susan was especially excited and pointed them out to all her friends.",
    },
    {
      id: "nap",
      label: "Nap exception",
      text: "Everyone had a great nap except Ava, who slept for only 20 minutes.",
    },
    {
      id: "summary",
      label: "Daily summary",
      text: "Today we painted, played outside, and had pizza for lunch. Everyone enjoyed painting except Jack, who preferred reading books.",
    },
    {
      id: "care",
      label: "Care logs",
      text: "Changed Timmy's diaper at 10:15. Wet. Ava used the potty successfully at 10:40.",
    },
    {
      id: "difficult",
      label: "Hard conversation",
      text: "Timmy bit a friend today during block play and was upset afterward. We stayed calm, separated the children, and comforted both.",
    },
  ];

  const state = {
    dashboard: null,
    parsed: null,
    applied: null,
    lessonDraft: null,
    lessonSaved: null,
    offlineQueue: [],
    networkState: "online",
    draftText: "",
    showAdmin: false,
    showMore: false,
    activeDraftType: "",
    error: "",
    notice: "",
    loading: false,
    layout: "flagship",
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function tokenFromOptions(options) {
    if (typeof options.getToken === "function") return options.getToken() || "";
    if (typeof global.adminSession === "function") return global.adminSession()?.token || "";
    return global.localStorage?.getItem("llhAdminToken") || global.sessionStorage?.getItem("llhAdminToken") || "";
  }

  function detectNetworkState() {
    if (global.LLHPlatformResilience?.detectNetworkState) {
      return global.LLHPlatformResilience.detectNetworkState();
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline";
    return "online";
  }

  function offlineKey(options) {
    return `${OFFLINE_KEY_PREFIX}${options.organizationId || state.dashboard?.organization?.id || "default"}`;
  }

  function loadOfflineQueue(options) {
    try {
      const raw = global.localStorage?.getItem(offlineKey(options));
      const parsed = raw ? JSON.parse(raw) : [];
      state.offlineQueue = Array.isArray(parsed) ? parsed : [];
    } catch {
      state.offlineQueue = [];
    }
    return state.offlineQueue;
  }

  function saveOfflineQueue(options, queue) {
    state.offlineQueue = Array.isArray(queue) ? queue : [];
    try {
      global.localStorage?.setItem(offlineKey(options), JSON.stringify(state.offlineQueue));
    } catch { /* quota */ }
    return state.offlineQueue;
  }

  function headers(options) {
    const token = tokenFromOptions(options);
    const out = { Accept: "application/json", "Content-Type": "application/json" };
    if (token) out.Authorization = `Bearer ${token}`;
    return out;
  }

  async function api(options, method, path, body) {
    const base = options.apiBase || DEFAULT_BASE;
    const url = path.startsWith(DEFAULT_BASE)
      ? `${base}${path.slice(DEFAULT_BASE.length)}`
      : path.startsWith("/")
        ? `${base}${path}`
        : `${base}/${path}`;
    const response = await fetch(url, {
      method,
      headers: headers(options),
      cache: "no-store",
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok && response.status !== 207) {
      const error = new Error(data.error || `Request failed (${response.status})`);
      error.payload = data;
      throw error;
    }
    return data;
  }

  async function loadDashboard(options) {
    const qs = options.organizationId ? `?organizationId=${encodeURIComponent(options.organizationId)}` : "";
    state.dashboard = await api(options, "GET", `/dashboard${qs}`);
    loadOfflineQueue(options);
  }

  function examples() {
    return state.dashboard?.examplePrompts?.length ? state.dashboard.examplePrompts : FALLBACK_EXAMPLES;
  }

  function captureDraftFromDom(container) {
    const textarea = container?.querySelector?.("[data-ca-note]");
    if (textarea) state.draftText = String(textarea.value || "");
  }

  function restoreFocus(container) {
    const textarea = container?.querySelector?.("[data-ca-note]");
    if (!textarea) return;
    textarea.focus({ preventScroll: true });
    try {
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
    } catch { /* ignore */ }
  }

  function childChipsHtml() {
    const children = state.dashboard?.checkedInChildren || [];
    if (!children.length) return `<p class="muted-copy ca-inline-note">No children checked in yet — name a child if needed.</p>`;
    return `
      <div class="ca-chip-row" aria-label="Checked-in children">
        ${children.map((child) => `<span class="ca-chip">${escapeHtml(child.displayName || child.firstName || child.id)}</span>`).join("")}
      </div>
    `;
  }

  function examplesHtml() {
    return `
      <div class="ca-examples" data-ca-examples>
        <p class="ca-examples-label">Try an example</p>
        <div class="ca-chip-row">
          ${examples().map((item) => `
            <button type="button" class="ghost-button ca-example-chip" data-ca-example="${escapeHtml(item.id)}">${escapeHtml(item.label)}</button>
          `).join("")}
        </div>
      </div>
    `;
  }

  function listBlock(title, items) {
    if (!items?.length) return "";
    return `<div class="ca-preview-block"><h4>${escapeHtml(title)}</h4><ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`;
  }

  function previewSummaryHtml(plan) {
    const lines = [];
    if (plan.meal) {
      lines.push(`Meal: ${plan.meal.mealType || "meal"}${plan.meal.time ? ` at ${plan.meal.time}` : ""}${(plan.meal.foods || []).length ? ` — ${(plan.meal.foods || []).join(", ")}` : ""}`);
      for (const ex of plan.meal.exceptions || []) lines.push(`Exception: ${ex.childName} — ${ex.note || "did not eat"}`);
    }
    if (plan.activity) {
      lines.push(`Activity: ${plan.activity.title || "classroom activity"}`);
      for (const item of [...(plan.activity.highlights || []), ...(plan.activity.exceptions || [])]) {
        lines.push(`${item.childName}: ${item.note || "observation"}`);
      }
    }
    if (plan.nap) {
      lines.push("Nap/rest noted");
      for (const ex of plan.nap.exceptions || []) lines.push(`${ex.childName}: ${ex.durationMinutes || "?"} min`);
    }
    if (plan.diaper?.entries?.length) {
      for (const item of plan.diaper.entries) lines.push(`Diaper: ${item.childName} (${item.status || "check"})`);
    }
    if (plan.potty?.entries?.length) {
      for (const item of plan.potty.entries) lines.push(`Potty: ${item.childName} (${item.result || "attempt"})`);
    }
    if (plan.medication?.entries?.length) {
      for (const item of plan.medication.entries) lines.push(`Medication review: ${item.childName} — ${item.medicationName || "medication"}`);
    }
    if (plan.attendance?.entries?.length) {
      for (const item of plan.attendance.entries) lines.push(`Attendance: ${item.childName} — ${item.action || "note"}`);
    }
    if (!lines.length) lines.push("General classroom note ready for review.");
    return listBlock("What will be organized", lines);
  }

  function suggestionsHtml(plan) {
    const suggestions = plan?.suggestions || [];
    if (!suggestions.length) return "";
    const recommended = suggestions.filter((row) => row.recommended);
    const rest = suggestions.filter((row) => !row.recommended);
    const ordered = [...recommended, ...rest];
    return `
      <div class="ca-suggestions-panel">
        <h4>Smart suggestions</h4>
        <p class="muted-copy">One tap drafts the wording. Nothing is sent until you confirm.</p>
        <div class="ca-suggestions">
          ${ordered.map((suggestion) => `
            <button
              type="button"
              class="ghost-button ca-suggestion-chip${suggestion.recommended ? " is-recommended" : ""}"
              data-ca-accept-suggestion="${escapeHtml(suggestion.type)}"
            >${escapeHtml(suggestion.label)}</button>
          `).join("")}
        </div>
        ${state.activeDraftType && plan.professionalDrafts?.[state.activeDraftType] ? `
          <article class="ca-draft-preview">
            <h5>${escapeHtml(plan.professionalDrafts[state.activeDraftType].title || state.activeDraftType)}</h5>
            <p>${escapeHtml(plan.professionalDrafts[state.activeDraftType].body || "")}</p>
          </article>
        ` : ""}
      </div>
    `;
  }

  function previewHtml() {
    const plan = state.parsed?.plan;
    if (!plan) {
      return `
        <div class="ca-empty-preview">
          <p>Type what happened. Classroom Assistant will organize meals, care logs, activities, and family wording — then wait for your review.</p>
        </div>
      `;
    }
    return `
      <section class="ca-preview" aria-live="polite">
        <div class="ca-review-banner">Preview only — nothing is saved until you confirm.</div>
        <p class="ca-target-line"><strong>${escapeHtml(String((plan.targets || []).length))}</strong> child record(s) · Live AI: ${escapeHtml(String(plan.liveAiUsed === true))}</p>
        ${plan.difficultSituation ? `<p class="ca-sensitive">${escapeHtml(plan.difficultSituation.guidance || "Use calm, factual wording.")}</p>` : ""}
        ${previewSummaryHtml(plan)}
        ${suggestionsHtml(plan)}
        ${plan.offlineQueued ? `
          <p class="muted-copy">Queued offline. Sync will parse and save when you are back online.</p>
        ` : `
          <button type="button" class="primary-button ca-confirm-btn" data-ca-confirm-apply>Confirm &amp; save</button>
        `}
      </section>
    `;
  }

  function offlineHtml() {
    const pending = (state.offlineQueue || []).filter((row) => row.status === "pending_sync");
    if (!pending.length && state.networkState !== "offline") {
      return `<p class="ca-offline-quiet muted-copy">Offline ready — notes will queue automatically if connection drops.</p>`;
    }
    return `
      <section class="ca-card ca-offline-card" data-ca-offline>
        <h3>Offline queue</h3>
        <p>Network: <strong>${escapeHtml(state.networkState)}</strong> · Pending: ${pending.length}</p>
        ${pending.length ? `<ul class="dc-list">${pending.slice(0, 4).map((row) => `<li>${escapeHtml(row.text || row.plan?.sourceText || row.id)}</li>`).join("")}</ul>` : ""}
        <button type="button" class="ghost-button" data-ca-sync-offline ${state.networkState === "offline" ? "disabled" : ""}>Sync now</button>
      </section>
    `;
  }

  function adminHtml() {
    if (!state.showAdmin) {
      return `
        <button type="button" class="ghost-button ca-linkish" data-ca-toggle-admin>
          Admin Assistant — paste lesson plans &amp; curriculum
        </button>
      `;
    }
    const draft = state.lessonDraft;
    return `
      <section class="ca-card ca-admin-panel" data-ca-admin>
        <div class="ca-admin-head">
          <h3>Admin Assistant</h3>
          <button type="button" class="ghost-button" data-ca-toggle-admin>Hide</button>
        </div>
        <p class="ca-computer-note">Best on a computer. Paste once, review fields, then confirm.</p>
        <form data-ca-lesson-parse-form class="ca-form">
          <textarea name="text" rows="4" placeholder="Title: Butterfly Week&#10;Age group: Preschool&#10;Monday: Walk and look for butterflies&#10;Materials: paper, crayons"></textarea>
          <button type="submit" class="ghost-button">Organize lesson draft</button>
        </form>
        ${draft ? `
          <div class="ca-lesson-preview">
            <h4>${escapeHtml(draft.title)}</h4>
            <p><strong>Ages:</strong> ${escapeHtml((draft.ageGroups || []).join(", "))}</p>
            <p><strong>Domains:</strong> ${escapeHtml((draft.learningDomains || []).join(", "))}</p>
            <p><strong>Materials:</strong> ${escapeHtml((draft.materials || []).join(", "))}</p>
            <p><strong>Objectives:</strong> ${escapeHtml((draft.objectives || []).join(", "))}</p>
            <button type="button" class="primary-button" data-ca-confirm-lesson>Confirm lesson draft</button>
          </div>
        ` : ""}
      </section>
    `;
  }

  function shellClasses() {
    return [
      "ca-shell",
      state.layout === "flagship" ? "ca-shell-flagship" : "ca-shell-embedded",
      state.networkState === "offline" ? "is-offline" : "",
    ].filter(Boolean).join(" ");
  }

  function renderInto(container, options) {
    if (!container) return;
    state.networkState = detectNetworkState();
    const d = state.dashboard || {};
    const pending = (state.offlineQueue || []).filter((row) => row.status === "pending_sync").length;

    container.innerHTML = `
      <section
        class="${shellClasses()}"
        data-feature-marker="phase-ca-classroom-assistant"
        data-page-marker="${escapeHtml(options.layout === "flagship" ? PAGE_MARKER : "")}"
        data-offline-capable="true"
        data-layout="${escapeHtml(state.layout)}"
      >
        <header class="ca-hero">
          <p class="fh-banner">${escapeHtml(d.testingBanner || "Testing Account - Fake Data Only. Not production operations.")}</p>
          <div class="ca-hero-top">
            <div>
              <p class="ca-eyebrow">Classroom Assistant</p>
              <h2>Just tell us what happened</h2>
              <p class="ca-lede">One note. We organize meals, care logs, activities, and family wording — you review before anything saves.</p>
            </div>
            ${options.layout === "flagship" ? "" : `
              <button type="button" class="ghost-button ca-open-full" data-ca-open-full>Open full page</button>
            `}
          </div>
          ${state.networkState === "offline" ? `
            <p class="ca-offline-banner" role="status">You're offline. Keep typing — notes queue and sync when you're back.</p>
          ` : pending ? `
            <p class="ca-offline-banner ca-sync-ready" role="status">${pending} note(s) waiting to sync.</p>
          ` : ""}
        </header>

        <section class="ca-checked" data-feature-marker="phase-ca-classroom-assistant-mobile">
          <div class="ca-checked-head">
            <h3>Checked in today</h3>
            <span class="muted-copy">${escapeHtml(String((d.checkedInChildren || []).length))} children</span>
          </div>
          ${childChipsHtml()}
        </section>

        ${state.error ? `<p class="dc-error" role="alert">${escapeHtml(state.error)}</p>` : ""}
        ${state.notice ? `<p class="ca-notice" role="status">${escapeHtml(state.notice)}</p>` : ""}

        <section class="ca-composer ca-card">
          <h3 class="ca-composer-title">Today's classroom note</h3>
          <form data-ca-parse-form class="ca-form">
            <label class="sr-only" for="ca-note-input">Classroom note</label>
            <textarea
              id="ca-note-input"
              class="ca-note"
              name="text"
              data-ca-note
              rows="6"
              placeholder="Example: Breakfast was at 8:30. Everyone had bananas and milk. Timmy decided not to eat."
            >${escapeHtml(state.draftText)}</textarea>
            <div class="ca-composer-actions">
              <button type="submit" class="primary-button" ${state.loading ? "disabled" : ""}>
                ${state.loading ? "Working…" : "Preview"}
              </button>
              <button type="button" class="ghost-button" data-ca-clear-note>Clear</button>
            </div>
          </form>
          ${examplesHtml()}
        </section>

        ${previewHtml()}
        ${offlineHtml()}
        ${adminHtml()}

        <details class="ca-more" ${state.showMore ? "open" : ""}>
          <summary data-ca-toggle-more>What's included &amp; recent notes</summary>
          <ul class="dc-list ca-included-list" data-ca-included>
            <li>Group meals, activities, naps, diaper, potty, medication, attendance, and daily summaries</li>
            <li>Checked-in awareness with individual exceptions</li>
            <li>Parent messages, incident/behavior reports, observations, developmental notes, documentation</li>
            <li>Preview before save · Offline sync · Admin lesson/curriculum paste</li>
          </ul>
          <h4>Recent saved notes</h4>
          <ul class="dc-list">
            ${(d.recentNotes || []).slice(0, 6).map((row) => `
              <li>${escapeHtml(row.label || row.kind)} — ${escapeHtml(row.childName || "group")}${row.note ? `: ${escapeHtml(row.note)}` : ""}</li>
            `).join("") || "<li>No saved notes yet.</li>"}
          </ul>
        </details>
      </section>
    `;
    bind(container, options);
  }

  async function syncOffline(options, { auto = false } = {}) {
    loadOfflineQueue(options);
    const pending = (state.offlineQueue || []).filter((row) => row.status === "pending_sync");
    if (!pending.length) {
      if (!auto) state.notice = "Nothing waiting to sync.";
      return;
    }
    if (detectNetworkState() === "offline") {
      state.notice = "Still offline — sync will run when connection returns.";
      return;
    }
    const result = await api(options, "POST", "/offline/sync", {
      organizationId: options.organizationId || "",
      confirm: true,
      queue: pending,
    });
    const synced = new Set(result.syncedIds || []);
    const next = (state.offlineQueue || [])
      .map((row) => (synced.has(row.id) ? { ...row, status: "synced", syncedAt: new Date().toISOString() } : row))
      .filter((row) => row.status === "pending_sync");
    saveOfflineQueue(options, next);
    if (result.dashboard) state.dashboard = result.dashboard;
    else await loadDashboard(options);
    state.notice = `Synced ${synced.size} offline note(s).`;
  }

  function queueOfflineApply(options, plan) {
    const item = {
      id: `caoffline_${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 8)}`,
      organizationId: options.organizationId || state.dashboard?.organization?.id || "",
      action: "apply_plan",
      text: plan?.sourceText || state.draftText || "",
      plan: plan || null,
      createdAt: new Date().toISOString(),
      status: "pending_sync",
      liveAiUsed: false,
      testingOnly: true,
    };
    saveOfflineQueue(options, [...loadOfflineQueue(options), item]);
    return item;
  }

  function bind(container, options) {
    container.querySelector("[data-ca-note]")?.addEventListener("input", (event) => {
      state.draftText = String(event.target.value || "");
    });

    container.querySelectorAll("[data-ca-example]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.getAttribute("data-ca-example");
        const example = examples().find((row) => row.id === id);
        if (!example) return;
        state.draftText = example.text;
        state.parsed = null;
        state.activeDraftType = "";
        state.notice = `Loaded “${example.label}” example — tap Preview when ready.`;
        state.error = "";
        renderInto(container, options);
        restoreFocus(container);
      });
    });

    container.querySelector("[data-ca-clear-note]")?.addEventListener("click", () => {
      state.draftText = "";
      state.parsed = null;
      state.activeDraftType = "";
      state.notice = "";
      state.error = "";
      renderInto(container, options);
      restoreFocus(container);
    });

    container.querySelector("[data-ca-toggle-admin]")?.addEventListener("click", () => {
      captureDraftFromDom(container);
      state.showAdmin = !state.showAdmin;
      renderInto(container, options);
    });

    container.querySelector("[data-ca-toggle-more]")?.addEventListener("click", () => {
      state.showMore = !state.showMore;
    });

    container.querySelector("[data-ca-open-full]")?.addEventListener("click", () => {
      if (typeof global.setView === "function") global.setView("classroom-assistant");
    });

    container.querySelector("[data-ca-parse-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      captureDraftFromDom(container);
      const text = String(state.draftText || "").trim();
      state.error = "";
      state.notice = "";
      state.activeDraftType = "";
      if (!text) {
        state.error = "Type a short classroom note first.";
        renderInto(container, options);
        return;
      }
      state.loading = true;
      renderInto(container, options);
      try {
        if (detectNetworkState() === "offline") {
          const item = {
            id: `caoffline_${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 8)}`,
            organizationId: options.organizationId || state.dashboard?.organization?.id || "",
            action: "apply_plan",
            text,
            plan: null,
            createdAt: new Date().toISOString(),
            status: "pending_sync",
            liveAiUsed: false,
            testingOnly: true,
            queuedWithoutPreview: true,
          };
          saveOfflineQueue(options, [...loadOfflineQueue(options), item]);
          state.parsed = {
            preview: true,
            plan: {
              id: item.id,
              sourceText: text,
              requiresReview: true,
              liveAiUsed: false,
              offlineQueued: true,
              targets: [],
              suggestions: [
                { type: "parent_message", label: "Parent message", oneClick: true, recommended: true },
                { type: "daily_report", label: "Daily report", oneClick: true, recommended: true },
                { type: "observation", label: "Observation", oneClick: true },
                { type: "incident_report", label: "Incident report", oneClick: true },
                { type: "behavior_report", label: "Behavior note", oneClick: true },
                { type: "developmental_note", label: "Developmental note", oneClick: true },
                { type: "documentation", label: "Documentation", oneClick: true },
              ],
              professionalDrafts: {},
            },
          };
          state.notice = "Queued offline. It will organize and sync when you're back online.";
        } else {
          state.parsed = await api(options, "POST", "/parse", {
            text,
            organizationId: options.organizationId || "",
          });
          state.notice = "Preview ready — review, use a suggestion if you like, then confirm.";
        }
      } catch (error) {
        if (detectNetworkState() === "offline" || /failed to fetch|network/i.test(error.message || "")) {
          state.networkState = "offline";
          queueOfflineApply(options, { sourceText: text });
          state.notice = "Connection lost — note queued for sync.";
        } else {
          state.error = error.message;
        }
      } finally {
        state.loading = false;
      }
      renderInto(container, options);
    });

    container.querySelector("[data-ca-confirm-apply]")?.addEventListener("click", async () => {
      if (!state.parsed?.plan || state.parsed.plan.offlineQueued) return;
      state.error = "";
      state.loading = true;
      renderInto(container, options);
      try {
        if (detectNetworkState() === "offline") {
          queueOfflineApply(options, state.parsed.plan);
          state.notice = "Saved to offline queue. Syncing when connection returns.";
        } else {
          state.applied = await api(options, "POST", "/apply", {
            planId: state.parsed.plan.id,
            plan: state.parsed.plan,
            confirm: true,
            organizationId: options.organizationId || "",
          });
          state.notice = "Saved. Ready for the next classroom note.";
          state.parsed = null;
          state.activeDraftType = "";
          state.draftText = "";
          await loadDashboard(options);
        }
      } catch (error) {
        if (detectNetworkState() === "offline" || /failed to fetch|network/i.test(error.message || "")) {
          queueOfflineApply(options, state.parsed.plan);
          state.networkState = "offline";
          state.notice = "Connection lost — note queued offline.";
        } else {
          state.error = error.message;
        }
      } finally {
        state.loading = false;
      }
      renderInto(container, options);
    });

    container.querySelector("[data-ca-sync-offline]")?.addEventListener("click", async () => {
      state.error = "";
      try {
        await syncOffline(options);
      } catch (error) {
        state.error = error.message;
      }
      renderInto(container, options);
    });

    container.querySelectorAll("[data-ca-accept-suggestion]").forEach((button) => {
      button.addEventListener("click", async () => {
        const type = button.getAttribute("data-ca-accept-suggestion") || "daily_report";
        const suggestion = (state.parsed?.plan?.suggestions || []).find((item) => item.type === type)
          || { type, label: button.textContent || type, oneClick: true };
        state.activeDraftType = type;
        if (state.parsed?.plan?.offlineQueued || detectNetworkState() === "offline") {
          state.notice = `“${suggestion.label}” will be available after sync.`;
          renderInto(container, options);
          return;
        }
        try {
          await api(options, "POST", "/suggestions/accept", {
            planId: state.parsed?.plan?.id || "",
            suggestion,
            confirm: true,
            organizationId: options.organizationId || "",
          });
          state.notice = `Draft ready: ${suggestion.label}. Review the wording below, then confirm the classroom note when you're happy.`;
          await loadDashboard(options);
        } catch (error) {
          state.error = error.message;
        }
        renderInto(container, options);
      });
    });

    container.querySelector("[data-ca-lesson-parse-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const text = new FormData(event.target).get("text") || "";
      state.error = "";
      try {
        const res = await api(options, "POST", "/admin/lesson-plan/parse", {
          text,
          organizationId: options.organizationId || "",
        });
        state.lessonDraft = res.draft;
        state.notice = "Lesson draft organized — review fields, then confirm.";
      } catch (error) {
        state.error = error.message;
      }
      renderInto(container, options);
    });

    container.querySelector("[data-ca-confirm-lesson]")?.addEventListener("click", async () => {
      if (!state.lessonDraft) return;
      state.error = "";
      try {
        const res = await api(options, "POST", "/admin/lesson-plan/confirm", {
          draftId: state.lessonDraft.id,
          confirm: true,
          organizationId: options.organizationId || "",
        });
        state.lessonSaved = res.draft;
        state.lessonDraft = null;
        state.notice = "Lesson draft saved to fake curriculum preview.";
        await loadDashboard(options);
      } catch (error) {
        state.error = error.message;
      }
      renderInto(container, options);
    });
  }

  function attachNetworkListeners(options, container) {
    if (container.__caNetworkBound) return;
    container.__caNetworkBound = true;
    const refresh = async () => {
      state.networkState = detectNetworkState();
      if (state.networkState === "online") {
        try { await syncOffline(options, { auto: true }); } catch { /* keep queued */ }
      }
      captureDraftFromDom(container);
      renderInto(container, options);
    };
    global.addEventListener("online", refresh);
    global.addEventListener("offline", refresh);
  }

  async function mount(container, options = {}) {
    if (!container) return;
    const opts = {
      apiBase: options.apiBase || DEFAULT_BASE,
      getToken: options.getToken,
      organizationId: options.organizationId || "",
      layout: options.layout || "flagship",
    };
    state.layout = opts.layout;
    try {
      await loadDashboard(opts);
      await syncOffline(opts, { auto: true });
    } catch (error) {
      state.error = error.message;
      loadOfflineQueue(opts);
    }
    renderInto(container, opts);
    attachNetworkListeners(opts, container);
  }

  global.renderClassroomAssistantTab = async function renderClassroomAssistantTab(container, options = {}) {
    return mount(container, { ...options, layout: "embedded" });
  };

  global.renderClassroomAssistantPage = async function renderClassroomAssistantPage(options = {}) {
    const section = document.querySelector("#view-classroom-assistant");
    if (!section) return;
    section.innerHTML = `<div id="ca-page-mount" class="ca-page-mount"><p class="muted-copy">Loading Classroom Assistant…</p></div>`;
    const mountEl = section.querySelector("#ca-page-mount") || section;
    return mount(mountEl, {
      ...options,
      layout: "flagship",
      apiBase: options.apiBase || DEFAULT_BASE,
      getToken: options.getToken || (() => (typeof adminSession === "function" ? (adminSession()?.token || "") : "")),
      organizationId: options.organizationId || "",
    });
  };
})(typeof window !== "undefined" ? window : globalThis);
