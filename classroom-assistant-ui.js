/**
 * Classroom Assistant UI.
 * Fake/testing only. Local parse preview must be reviewed before save.
 * Offline notes queue locally and sync after reconnect.
 */
(function initClassroomAssistantUI(global) {
  const DEFAULT_BASE = "/api/director-center/classroom-assistant";
  const OFFLINE_KEY_PREFIX = "llh-ca-offline-queue::";
  const state = {
    dashboard: null,
    parsed: null,
    applied: null,
    lessonDraft: null,
    lessonSaved: null,
    offlineQueue: [],
    networkState: "online",
    error: "",
    notice: "",
    loading: false,
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

  function childChipsHtml() {
    const children = state.dashboard?.checkedInChildren || [];
    return `
      <div class="ca-chip-row" aria-label="Checked-in children">
        ${children.map((child) => `<span class="ca-chip">${escapeHtml(child.displayName || child.firstName || child.id)}</span>`).join("") || "<span class=\"muted-copy\">No children checked in yet.</span>"}
      </div>
    `;
  }

  function includedHtml() {
    const items = [
      "Group meals, activities, naps, diaper changes, potty logs, medication logs, attendance, and daily summaries from natural language",
      "Recognizes checked-in children and individual exceptions",
      "Turns short notes into parent messages, incident/behavior reports, observations, developmental notes, daily reports, and documentation",
      "Helps with wording for difficult family conversations",
      "Preview everything before saving",
      "Admin Assistant for lesson plans and curriculum paste → organize → review",
      "Smart suggestions to reduce repetitive typing",
      "Offline mode with automatic sync after reconnect",
    ];
    return `
      <section class="ca-card" data-ca-included>
        <h3>What's included</h3>
        <ul class="dc-list ca-included-list">
          ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </section>
    `;
  }

  function simpleCard(title, bodyHtml) {
    if (!bodyHtml) return "";
    return `<article class="ca-card"><h4>${escapeHtml(title)}</h4>${bodyHtml}</article>`;
  }

  function mealPreviewHtml(meal) {
    if (!meal) return "";
    return simpleCard("Group meal", `
      <p><strong>${escapeHtml(meal.mealType || "Meal")}</strong>${meal.time ? ` at ${escapeHtml(meal.time)}` : ""}</p>
      <p>Foods: ${escapeHtml((meal.foods || []).join(", ") || "Not detected")}</p>
      <p>Group ate: ${escapeHtml(String(meal.groupAte === true))}</p>
      ${(meal.exceptions || []).length ? `<ul>${meal.exceptions.map((item) => `<li>${escapeHtml(item.childName)}: ${escapeHtml(item.note || "Exception")}</li>`).join("")}</ul>` : ""}
    `);
  }

  function activityPreviewHtml(activity) {
    if (!activity) return "";
    const notes = [...(activity.highlights || []), ...(activity.exceptions || [])];
    return simpleCard("Activity / observation", `
      <p><strong>${escapeHtml(activity.title || "Activity")}</strong>${activity.time ? ` at ${escapeHtml(activity.time)}` : ""}</p>
      ${activity.groupEnjoyed !== undefined ? `<p>Group enjoyed: ${escapeHtml(String(activity.groupEnjoyed))}</p>` : ""}
      ${notes.length ? `<ul>${notes.map((item) => `<li>${escapeHtml(item.childName)}: ${escapeHtml(item.note || "Observation")}</li>`).join("")}</ul>` : ""}
    `);
  }

  function napPreviewHtml(nap) {
    if (!nap) return "";
    return simpleCard("Nap / rest", `
      <p>Group slept: ${escapeHtml(String(nap.groupSlept === true))}</p>
      ${(nap.exceptions || []).length ? `<ul>${nap.exceptions.map((item) => `<li>${escapeHtml(item.childName)}: ${escapeHtml(item.durationMinutes || "")} minutes ${escapeHtml(item.note || "")}</li>`).join("")}</ul>` : ""}
    `);
  }

  function carePreviewHtml(plan) {
    const parts = [];
    if (plan.diaper) {
      parts.push(simpleCard("Diaper", `
        <p>Status: ${escapeHtml(plan.diaper.status || "checked")}${plan.diaper.time ? ` at ${escapeHtml(plan.diaper.time)}` : ""}</p>
        <ul>${(plan.diaper.entries || []).map((item) => `<li>${escapeHtml(item.childName)}: ${escapeHtml(item.status || "")}</li>`).join("") || "<li>Group diaper check</li>"}</ul>
      `));
    }
    if (plan.potty) {
      parts.push(simpleCard("Potty", `
        <p>Result: ${escapeHtml(plan.potty.result || "attempt")}${plan.potty.time ? ` at ${escapeHtml(plan.potty.time)}` : ""}</p>
        <ul>${(plan.potty.entries || []).map((item) => `<li>${escapeHtml(item.childName)}: ${escapeHtml(item.result || "")}</li>`).join("") || "<li>Group potty note</li>"}</ul>
      `));
    }
    if (plan.medication) {
      parts.push(simpleCard("Medication (extra review)", `
        <p>${escapeHtml(plan.medication.medicationName || "medication")}${plan.medication.time ? ` at ${escapeHtml(plan.medication.time)}` : ""}</p>
        <ul>${(plan.medication.entries || []).map((item) => `<li>${escapeHtml(item.childName)}</li>`).join("")}</ul>
      `));
    }
    if (plan.attendance) {
      parts.push(simpleCard("Attendance", `
        <p>${escapeHtml(plan.attendance.summary || plan.attendance.action || "Attendance note")}</p>
        <ul>${(plan.attendance.entries || []).map((item) => `<li>${escapeHtml(item.childName)}: ${escapeHtml(item.action || "")}</li>`).join("") || ""}</ul>
      `));
    }
    return parts.join("");
  }

  function draftsHtml(plan) {
    const drafts = plan?.professionalDrafts || {};
    const keys = Object.keys(drafts);
    if (!keys.length) return "";
    return `
      <section class="ca-card">
        <h4>Professional drafts (preview)</h4>
        <p class="muted-copy">One-click suggestions convert short notes into family-ready wording. Nothing sends outbound.</p>
        ${keys.map((key) => {
          const draft = drafts[key];
          return `<details class="ca-draft"><summary>${escapeHtml(draft.title || key)}</summary><p>${escapeHtml(draft.body || "")}</p></details>`;
        }).join("")}
        ${plan.difficultSituation ? `<p class="ca-sensitive">Difficult-situation help detected: ${escapeHtml((plan.difficultSituation.kinds || []).join(", "))}. ${escapeHtml(plan.difficultSituation.guidance || "")}</p>` : ""}
      </section>
    `;
  }

  function offlineHtml() {
    const pending = (state.offlineQueue || []).filter((row) => row.status === "pending_sync");
    return `
      <section class="ca-card" data-ca-offline>
        <h3>Offline mode</h3>
        <p class="muted-copy">Network: <strong>${escapeHtml(state.networkState)}</strong>. Pending sync: ${pending.length}.</p>
        ${pending.length ? `<ul class="dc-list">${pending.slice(0, 5).map((row) => `<li>${escapeHtml(row.text || row.plan?.sourceText || row.id)}</li>`).join("")}</ul>` : "<p class=\"muted-copy\">No queued notes.</p>"}
        <button type="button" class="ghost-button" data-ca-sync-offline ${state.networkState === "offline" ? "disabled" : ""}>Sync queued notes now</button>
      </section>
    `;
  }

  function previewHtml() {
    const plan = state.parsed?.plan;
    if (!plan) return `<p class="muted-copy">Type a classroom note and choose Parse preview. Nothing saves until you confirm.</p>`;
    return `
      <section class="ca-preview">
        <div class="ca-review-banner">Review before save. This preview used local parsing only; live AI used: ${escapeHtml(String(plan.liveAiUsed === true))}.</div>
        <p><strong>Targets:</strong> ${escapeHtml((plan.targets || []).length)} child record(s)</p>
        <div class="ca-card-grid">
          ${mealPreviewHtml(plan.meal)}
          ${activityPreviewHtml(plan.activity)}
          ${napPreviewHtml(plan.nap)}
          ${carePreviewHtml(plan)}
        </div>
        ${draftsHtml(plan)}
        ${plan.confidence?.unmatchedNames?.length ? `<p class="muted-copy">Unmatched names: ${escapeHtml(plan.confidence.unmatchedNames.join(", "))}</p>` : ""}
        <div class="ca-suggestions">
          ${(plan.suggestions || []).map((suggestion) => `
            <button type="button" class="ghost-button ca-suggestion-chip" data-ca-accept-suggestion="${escapeHtml(suggestion.type)}">${escapeHtml(suggestion.label)}</button>
          `).join("")}
        </div>
        <button type="button" class="primary-button" data-ca-confirm-apply>Confirm and save reviewed note</button>
      </section>
    `;
  }

  function lessonDraftHtml() {
    const draft = state.lessonDraft;
    if (!draft) return `<p class="muted-copy">Paste curriculum text here. Review on a computer is recommended before saving.</p>`;
    return `
      <section class="ca-card">
        <p class="ca-computer-note">Computer recommended: review fields before saving this fake curriculum draft.</p>
        <h4>${escapeHtml(draft.title)}</h4>
        <p><strong>Age groups:</strong> ${escapeHtml((draft.ageGroups || []).join(", "))}</p>
        <p><strong>Domains:</strong> ${escapeHtml((draft.learningDomains || []).join(", "))}</p>
        <p><strong>Materials:</strong> ${escapeHtml((draft.materials || []).join(", "))}</p>
        <p><strong>Objectives:</strong> ${escapeHtml((draft.objectives || []).join(", "))}</p>
        <p><strong>Vocabulary:</strong> ${escapeHtml((draft.vocabulary || []).join(", "))}</p>
        <p><strong>Adaptations:</strong> ${escapeHtml((draft.adaptations || []).join(", "))}</p>
        ${Object.keys(draft.activitiesByDay || {}).length ? `
          <ul>${Object.entries(draft.activitiesByDay).map(([day, acts]) => `<li>${escapeHtml(day)}: ${escapeHtml((acts || []).join("; "))}</li>`).join("")}</ul>
        ` : `<p><strong>Activities:</strong> ${escapeHtml((draft.activities || []).join("; "))}</p>`}
        <button type="button" class="primary-button" data-ca-confirm-lesson>Confirm reviewed lesson plan draft</button>
      </section>
    `;
  }

  function renderInto(container, options) {
    const d = state.dashboard || {};
    state.networkState = detectNetworkState();
    container.innerHTML = `
      <section class="ca-shell" data-feature-marker="phase-ca-classroom-assistant" data-offline-capable="true">
        <section class="ca-hero">
          <p class="fh-banner">${escapeHtml(d.testingBanner || "Testing Account - Fake Data Only. Not production operations.")}</p>
          <h2>Classroom Assistant</h2>
          <p>Write one plain-language note. Classroom Assistant organizes meals, care logs, reports, and family wording for review before anything saves.</p>
          <p class="muted-copy">No live AI, email, SMS, push, Stripe, or production operations.</p>
          ${state.networkState === "offline" ? `<p class="ca-offline-banner" role="status">You are offline. Keep working — notes queue locally and sync when connection returns.</p>` : ""}
        </section>
        ${includedHtml()}
        <section class="ca-card" data-feature-marker="phase-ca-classroom-assistant-mobile">
          <h3>Checked in today</h3>
          ${childChipsHtml()}
        </section>
        ${state.error ? `<p class="dc-error">${escapeHtml(state.error)}</p>` : ""}
        ${state.notice ? `<p class="muted-copy">${escapeHtml(state.notice)}</p>` : ""}
        <section class="ca-grid">
          <section class="ca-card">
            <h3>Natural language note</h3>
            <form data-ca-parse-form class="ca-form">
              <textarea name="text" rows="5" placeholder="Breakfast was at 8:30. Everyone had bananas, apples, and milk. Timmy decided not to eat his breakfast."></textarea>
              <button type="submit" class="primary-button">Parse preview</button>
            </form>
            ${previewHtml()}
          </section>
          <section class="ca-card">
            <h3>Admin lesson plan paste</h3>
            <p class="muted-copy">Best on a computer. Paste text, review fields, then confirm save.</p>
            <form data-ca-lesson-parse-form class="ca-form">
              <textarea name="text" rows="5" placeholder="Title: Butterfly Week&#10;Age group: Preschool&#10;Monday: Walk and look for butterflies&#10;Materials: paper, crayons"></textarea>
              <button type="submit" class="ghost-button">Parse lesson plan draft</button>
            </form>
            ${lessonDraftHtml()}
          </section>
        </section>
        ${offlineHtml()}
        <section class="ca-card">
          <h3>Recent saved notes</h3>
          <ul class="dc-list">
            ${(d.recentNotes || []).slice(0, 8).map((row) => `<li>${escapeHtml(row.label || row.kind)} - ${escapeHtml(row.childName || (row.childIds || []).join(", ") || "group")} ${row.note ? `- ${escapeHtml(row.note)}` : ""}</li>`).join("") || "<li>No saved notes yet.</li>"}
          </ul>
        </section>
      </section>
    `;
    bind(container, options);
  }

  async function syncOffline(options, { auto = false } = {}) {
    loadOfflineQueue(options);
    const pending = (state.offlineQueue || []).filter((row) => row.status === "pending_sync");
    if (!pending.length) {
      if (!auto) state.notice = "No offline notes to sync.";
      return;
    }
    if (detectNetworkState() === "offline") {
      state.notice = "Still offline. Notes will sync when connection returns.";
      return;
    }
    const result = await api(options, "POST", "/offline/sync", {
      organizationId: options.organizationId || "",
      confirm: true,
      queue: pending,
    });
    const synced = new Set(result.syncedIds || []);
    const next = (state.offlineQueue || []).map((row) => (
      synced.has(row.id) ? { ...row, status: "synced", syncedAt: new Date().toISOString() } : row
    )).filter((row) => row.status === "pending_sync");
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
      text: plan.sourceText || "",
      plan,
      createdAt: new Date().toISOString(),
      status: "pending_sync",
      liveAiUsed: false,
      testingOnly: true,
    };
    const next = [...loadOfflineQueue(options), item];
    saveOfflineQueue(options, next);
    return item;
  }

  function bind(container, options) {
    container.querySelector("[data-ca-parse-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      state.error = "";
      state.notice = "";
      const text = String(new FormData(event.target).get("text") || "").trim();
      try {
        if (detectNetworkState() === "offline") {
          if (!text) {
            state.error = "Enter a classroom note before queuing offline.";
            renderInto(container, options);
            return;
          }
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
              suggestions: [
                { type: "daily_report", label: "Will sync to daily reports", oneClick: true },
                { type: "parent_message", label: "Will draft parent message on sync", oneClick: true },
              ],
              professionalDrafts: {},
              targets: [],
            },
          };
          state.notice = "Offline note queued. It will parse, organize, and sync automatically when connection returns. Review on sync is still confirmed by Sync.";
          renderInto(container, options);
          return;
        }
        state.parsed = await api(options, "POST", "/parse", { text, organizationId: options.organizationId || "" });
        state.notice = "Preview ready. Please review before saving.";
      } catch (error) {
        if (detectNetworkState() === "offline" || /failed to fetch|network/i.test(error.message || "")) {
          state.networkState = "offline";
          state.error = "You appear offline. Re-submit to queue the note for automatic sync.";
        } else {
          state.error = error.message;
        }
      }
      renderInto(container, options);
    });

    container.querySelector("[data-ca-confirm-apply]")?.addEventListener("click", async () => {
      if (!state.parsed?.plan) return;
      state.error = "";
      try {
        if (state.parsed.plan.offlineQueued) {
          state.notice = "Already queued offline. Use Sync queued notes when online, or wait for automatic reconnect sync.";
          renderInto(container, options);
          return;
        }
        if (detectNetworkState() === "offline") {
          queueOfflineApply(options, state.parsed.plan);
          state.notice = "Saved to offline queue. It will sync automatically when connection returns.";
          renderInto(container, options);
          return;
        }
        state.applied = await api(options, "POST", "/apply", {
          planId: state.parsed.plan.id,
          plan: state.parsed.plan,
          confirm: true,
          organizationId: options.organizationId || "",
        });
        state.notice = "Reviewed classroom note saved to fake preview records.";
        await loadDashboard(options);
      } catch (error) {
        if (detectNetworkState() === "offline" || /failed to fetch|network/i.test(error.message || "")) {
          queueOfflineApply(options, state.parsed.plan);
          state.networkState = "offline";
          state.notice = "Connection lost. Note queued offline and will sync later.";
        } else {
          state.error = error.message;
        }
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
        const suggestion = (state.parsed?.plan?.suggestions || []).find((item) => item.type === type) || { type, label: button.textContent || type };
        try {
          await api(options, "POST", "/suggestions/accept", {
            planId: state.parsed?.plan?.id || "",
            suggestion,
            confirm: true,
            organizationId: options.organizationId || "",
          });
          state.notice = "Suggestion saved in fake preview records.";
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
        const res = await api(options, "POST", "/admin/lesson-plan/parse", { text, organizationId: options.organizationId || "" });
        state.lessonDraft = res.draft;
        state.notice = "Lesson plan draft parsed. Review before saving.";
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
        state.notice = "Reviewed fake lesson plan draft saved.";
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
      renderInto(container, options);
    };
    global.addEventListener("online", refresh);
    global.addEventListener("offline", refresh);
  }

  global.renderClassroomAssistantTab = async function renderClassroomAssistantTab(container, options = {}) {
    if (!container) return;
    const opts = {
      apiBase: options.apiBase || DEFAULT_BASE,
      getToken: options.getToken,
      organizationId: options.organizationId || "",
    };
    try {
      await loadDashboard(opts);
      await syncOffline(opts, { auto: true });
    } catch (error) {
      state.error = error.message;
      loadOfflineQueue(opts);
    }
    renderInto(container, opts);
    attachNetworkListeners(opts, container);
  };
})(typeof window !== "undefined" ? window : globalThis);
