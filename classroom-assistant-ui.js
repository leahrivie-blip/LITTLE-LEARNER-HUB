/**
 * Classroom Assistant UI.
 * Fake/testing only. Local parse preview must be reviewed before save.
 */
(function initClassroomAssistantUI(global) {
  const DEFAULT_BASE = "/api/director-center/classroom-assistant";
  const state = {
    dashboard: null,
    parsed: null,
    applied: null,
    lessonDraft: null,
    lessonSaved: null,
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
    if (!response.ok) {
      const error = new Error(data.error || `Request failed (${response.status})`);
      error.payload = data;
      throw error;
    }
    return data;
  }

  async function loadDashboard(options) {
    const qs = options.organizationId ? `?organizationId=${encodeURIComponent(options.organizationId)}` : "";
    state.dashboard = await api(options, "GET", `/dashboard${qs}`);
  }

  function childChipsHtml() {
    const children = state.dashboard?.checkedInChildren || [];
    return `
      <div class="ca-chip-row" aria-label="Checked-in children">
        ${children.map((child) => `<span class="ca-chip">${escapeHtml(child.displayName || child.firstName || child.id)}</span>`).join("") || "<span class=\"muted-copy\">No children checked in yet.</span>"}
      </div>
    `;
  }

  function mealPreviewHtml(meal) {
    if (!meal) return "";
    return `
      <article class="ca-card">
        <h4>Group meal</h4>
        <p><strong>${escapeHtml(meal.mealType || "Meal")}</strong>${meal.time ? ` at ${escapeHtml(meal.time)}` : ""}</p>
        <p>Foods: ${escapeHtml((meal.foods || []).join(", ") || "Not detected")}</p>
        <p>Group ate: ${escapeHtml(String(meal.groupAte === true))}</p>
        ${(meal.exceptions || []).length ? `<ul>${meal.exceptions.map((item) => `<li>${escapeHtml(item.childName)}: ${escapeHtml(item.note || "Exception")}</li>`).join("")}</ul>` : ""}
      </article>
    `;
  }

  function activityPreviewHtml(activity) {
    if (!activity) return "";
    const notes = [...(activity.highlights || []), ...(activity.exceptions || [])];
    return `
      <article class="ca-card">
        <h4>Activity / observation</h4>
        <p><strong>${escapeHtml(activity.title || "Activity")}</strong>${activity.time ? ` at ${escapeHtml(activity.time)}` : ""}</p>
        ${activity.groupEnjoyed !== undefined ? `<p>Group enjoyed: ${escapeHtml(String(activity.groupEnjoyed))}</p>` : ""}
        ${notes.length ? `<ul>${notes.map((item) => `<li>${escapeHtml(item.childName)}: ${escapeHtml(item.note || "Observation")}</li>`).join("")}</ul>` : ""}
      </article>
    `;
  }

  function napPreviewHtml(nap) {
    if (!nap) return "";
    return `
      <article class="ca-card">
        <h4>Nap / rest</h4>
        <p>Group slept: ${escapeHtml(String(nap.groupSlept === true))}</p>
        ${(nap.exceptions || []).length ? `<ul>${nap.exceptions.map((item) => `<li>${escapeHtml(item.childName)}: ${escapeHtml(item.durationMinutes || "")} minutes ${escapeHtml(item.note || "")}</li>`).join("")}</ul>` : ""}
      </article>
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
        </div>
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
    container.innerHTML = `
      <section class="ca-shell" data-feature-marker="phase-ca-classroom-assistant">
        <section class="ca-hero">
          <p class="fh-banner">${escapeHtml(d.testingBanner || "Testing Account - Fake Data Only. Not production operations.")}</p>
          <h2>Classroom Assistant</h2>
          <p>Write one plain-language note. Classroom Assistant creates a preview only. You review before anything saves.</p>
          <p class="muted-copy">No live AI, email, SMS, push, Stripe, or production operations.</p>
        </section>
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
        <section class="ca-card">
          <h3>Recent saved notes</h3>
          <ul class="dc-list">
            ${(d.recentNotes || []).slice(0, 6).map((row) => `<li>${escapeHtml(row.label || row.kind)} - ${escapeHtml(row.childName || (row.childIds || []).join(", ") || "group")} ${row.note ? `- ${escapeHtml(row.note)}` : ""}</li>`).join("") || "<li>No saved notes yet.</li>"}
          </ul>
        </section>
      </section>
    `;
    bind(container, options);
  }

  function bind(container, options) {
    container.querySelector("[data-ca-parse-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      state.error = "";
      state.notice = "";
      const text = new FormData(event.target).get("text") || "";
      try {
        state.parsed = await api(options, "POST", "/parse", { text, organizationId: options.organizationId || "" });
        state.notice = "Preview ready. Please review before saving.";
      } catch (error) {
        state.error = error.message;
      }
      renderInto(container, options);
    });

    container.querySelector("[data-ca-confirm-apply]")?.addEventListener("click", async () => {
      if (!state.parsed?.plan) return;
      state.error = "";
      try {
        state.applied = await api(options, "POST", "/apply", {
          planId: state.parsed.plan.id,
          confirm: true,
          organizationId: options.organizationId || "",
        });
        state.notice = "Reviewed classroom note saved to fake preview records.";
        await loadDashboard(options);
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

  global.renderClassroomAssistantTab = async function renderClassroomAssistantTab(container, options = {}) {
    if (!container) return;
    const opts = {
      apiBase: options.apiBase || DEFAULT_BASE,
      getToken: options.getToken,
      organizationId: options.organizationId || "",
    };
    try {
      await loadDashboard(opts);
    } catch (error) {
      state.error = error.message;
    }
    renderInto(container, opts);
  };
})(typeof window !== "undefined" ? window : globalThis);
