/**
 * Phase 21 — Provider Productivity, Child-Led Planning, Ease of Use.
 */
(function initProviderProductivityUI(global) {
  const DEFAULT_BASE = "/api/director-center/productivity";
  const state = {
    panel: "home",
    dashboard: null,
    activities: [],
    search: null,
    loading: false,
    error: "",
    notice: "",
    lastInterest: null,
    lastSuggestions: [],
    lastSavedSuggestion: null,
    lastPlanEntry: null,
    setup: null,
    notificationPrefs: null,
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function compact(value) {
    return String(value || "").trim();
  }

  function escapeSelector(value) {
    if (global.CSS && typeof global.CSS.escape === "function") return global.CSS.escape(String(value || ""));
    return String(value || "").replace(/["\\]/g, "\\$&");
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
    const preview = global.sessionStorage?.getItem("llhRolePreviewMembershipId") || "";
    if (preview) out["x-llh-role-preview-membership-id"] = preview;
    return out;
  }

  async function api(options, method, path, body) {
    const base = options.apiBase || DEFAULT_BASE;
    const url = path.startsWith("http")
      ? path
      : path.startsWith(DEFAULT_BASE)
        ? `${base}${path.slice(DEFAULT_BASE.length)}`
        : path.startsWith("/")
          ? path
          : `${base}${path}`;
    const response = await fetch(url, {
      method,
      headers: headers(options),
      cache: "no-store",
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || data.message || `Request failed (${response.status})`);
      error.payload = data;
      throw error;
    }
    return data;
  }

  async function loadDashboard(options) {
    state.loading = true;
    state.error = "";
    const qs = options.organizationId ? `?organizationId=${encodeURIComponent(options.organizationId)}` : "";
    try {
      state.dashboard = await api(options, "GET", `/api/director-center/productivity/dashboard${qs}`);
      state.setup = state.dashboard.setup;
      state.notificationPrefs = state.dashboard.notificationPrefs;
      state.activities = state.dashboard.activities || [];
    } catch (error) {
      state.error = error.message;
    } finally {
      state.loading = false;
    }
  }

  function panelNavHtml() {
    const panels = [
      ["home", "Home"],
      ["child_led", "Child-led flow"],
      ["activities", "Activities"],
      ["search", "Search"],
      ["setup", "Setup"],
      ["tools", "Tools"],
    ];
    return `
      <nav class="pp-nav" aria-label="Ease and Planning panels">
        ${panels.map(([id, label]) => `
          <button type="button" class="ghost-button pp-nav-btn${state.panel === id ? " active" : ""}" data-pp-open-panel="${escapeHtml(id)}">${escapeHtml(label)}</button>
        `).join("")}
      </nav>
    `;
  }

  function statusHtml() {
    if (state.error) return `<p class="dc-error">${escapeHtml(state.error)}</p>`;
    if (state.notice) return `<p class="muted-copy">${escapeHtml(state.notice)}</p>`;
    return "";
  }

  function phoneHtml(phone) {
    return `
      <section class="pp-section pp-phone" data-feature-marker="phase21-child-led-mobile">
        <h3>${escapeHtml(phone?.headline || "Phone-friendly daily tools")}</h3>
        <p class="muted-copy">${escapeHtml(phone?.note || "Daily child-led ideas, activity browsing, search, and favorites work on your phone.")}</p>
        <p><strong>Planning:</strong> ${escapeHtml(phone?.planningLabel || "")} · <strong>Setup:</strong> ${escapeHtml(phone?.setupStatus || "")}</p>
      </section>
    `;
  }

  function homePanelHtml() {
    const d = state.dashboard || {};
    const pref = d.preference || {};
    const lists = {
      interests: d.interests || [],
      suggestions: d.suggestions || [],
      savedIdeas: d.savedIdeas || [],
      planEntries: d.planEntries || [],
    };
    return `
      <section class="pp-panel" data-pp-panel="home">
        <section class="pp-hero" data-feature-marker="phase21-provider-productivity">
          <p class="fh-banner">${escapeHtml(d.testingBanner || "Testing Account — Fake Data Only. Not production operations.")}</p>
          <h2>Ease & Planning</h2>
          <p>Plan in the way your program actually works. Lesson plans are optional; child interests, quick activities, and simple next steps are enough.</p>
        </section>
        <section class="pp-section">
          <h3>Today at a glance</h3>
          <div class="pp-metrics">
            <span><strong>${escapeHtml(String(lists.interests.length))}</strong> interests</span>
            <span><strong>${escapeHtml(String(lists.suggestions.length))}</strong> ideas</span>
            <span><strong>${escapeHtml(String(lists.savedIdeas.length))}</strong> saved</span>
            <span><strong>${escapeHtml(String(lists.planEntries.length))}</strong> planned</span>
          </div>
          <p class="muted-copy">Preference: ${escapeHtml(d.planningLabels?.[pref.planningPreference] || pref.planningPreference || "Not sure yet")}. Formal lesson plans are not required for this flow.</p>
          <button type="button" class="primary-button" data-pp-open-panel="child_led">Record a child interest</button>
          <button type="button" class="ghost-button" data-pp-open-panel="activities">Browse activities</button>
        </section>
        ${phoneHtml(d.phone)}
      </section>
    `;
  }

  function childLedPanelHtml() {
    const suggestions = state.lastSuggestions.length ? state.lastSuggestions : (state.dashboard?.suggestions || []).slice(0, 4);
    return `
      <section class="pp-panel" data-pp-panel="child_led" data-feature-marker="phase21-child-led-mobile">
        <h3>Child-led flow</h3>
        <p class="muted-copy">Record an interest, get local suggestions, review one, save it, add it to today, then jot what happened.</p>
        <form class="pp-form" data-pp-interest-form>
          <label>What did you notice?
            <textarea name="note" rows="3" required placeholder="Example: Maya keeps lining up stones and cups."></textarea>
          </label>
          <label>Theme
            <select name="theme">
              <option value="open_ended_play">Open-ended play</option>
              <option value="loose_parts">Loose parts</option>
              <option value="outdoor_exploration">Outdoor exploration</option>
              <option value="sensory_experiences">Sensory experiences</option>
              <option value="practical_life">Practical life</option>
            </select>
          </label>
          <label>Possible next step
            <input name="nextStep" placeholder="Offer bowls and fabric nearby." />
          </label>
          <button type="submit" class="primary-button">Record interest</button>
        </form>

        <div class="pp-list">
          ${state.lastInterest ? `
            <p><strong>Recorded:</strong> ${escapeHtml(state.lastInterest.note)}</p>
            <button type="button" class="ghost-button" data-pp-generate-suggestions="${escapeHtml(state.lastInterest.id)}">Get suggestions</button>
          ` : "<p class=\"muted-copy\">No new interest recorded in this session yet.</p>"}
        </div>

        <section class="pp-section">
          <h4>Suggestions to review</h4>
          ${suggestions.map((suggestion) => `
            <article class="pp-row" data-pp-suggestion-row="${escapeHtml(suggestion.id)}">
              <div>
                <strong>${escapeHtml(suggestion.title)}</strong>
                <p class="muted-copy">${escapeHtml(suggestion.prompt)}</p>
                <p class="muted-copy">Local catalog only · live AI used: ${escapeHtml(String(suggestion.liveAiUsed === true))}</p>
              </div>
              <label class="pp-inline"><input type="checkbox" data-pp-review-check="${escapeHtml(suggestion.id)}" ${suggestion.reviewed ? "checked" : ""} /> I reviewed this idea</label>
              <button type="button" class="ghost-button" data-pp-review="${escapeHtml(suggestion.id)}">Confirm review</button>
              <button type="button" class="ghost-button" data-pp-save-suggestion="${escapeHtml(suggestion.id)}">Save</button>
              <button type="button" class="primary-button" data-pp-add-today="${escapeHtml(suggestion.id)}">Add to today</button>
            </article>
          `).join("") || "<p class=\"muted-copy\">Suggestions appear here after you record an interest.</p>"}
        </section>

        <form class="pp-form" data-pp-what-happened-form>
          <h4>What happened?</h4>
          <textarea name="note" rows="3" placeholder="A short note is enough."></textarea>
          <button type="submit" class="ghost-button">Save note</button>
        </form>
      </section>
    `;
  }

  function activitiesPanelHtml() {
    const activities = state.activities || [];
    return `
      <section class="pp-panel" data-pp-panel="activities">
        <h3>Activity browse</h3>
        <p class="muted-copy">Find simple activities by interest, skill, setting, or time. Favorites stay easy to reach.</p>
        <form class="pp-filters" data-pp-activity-filter-form>
          <input name="q" placeholder="Search activities" />
          <select name="indoorOutdoor">
            <option value="">Any setting</option>
            <option value="indoor">Indoor</option>
            <option value="outdoor">Outdoor</option>
            <option value="both">Both</option>
          </select>
          <input name="timeMinutes" type="number" min="1" placeholder="Max minutes" />
          <button type="submit" class="ghost-button">Filter</button>
        </form>
        <div class="pp-list">
          ${activities.map((activity) => `
            <article class="pp-row">
              <div>
                <strong>${escapeHtml(activity.title)}</strong>
                <p class="muted-copy">${escapeHtml(activity.materials)} · ${escapeHtml(activity.timeMinutes)} min · ${escapeHtml(activity.setting)}</p>
              </div>
              <button type="button" class="ghost-button" data-pp-favorite-activity="${escapeHtml(activity.id)}">${activity.favorited ? "Unfavorite" : "Favorite"}</button>
              <button type="button" class="ghost-button" data-pp-duplicate-activity="${escapeHtml(activity.id)}">Duplicate</button>
              <button type="button" class="primary-button" data-pp-plan-activity="${escapeHtml(activity.id)}">Add to weekly</button>
            </article>
          `).join("") || "<p class=\"muted-copy\">No matching activities.</p>"}
        </div>
      </section>
    `;
  }

  function searchPanelHtml() {
    const groups = state.search?.groups || [];
    return `
      <section class="pp-panel" data-pp-panel="search">
        <h3>Universal search</h3>
        <p class="muted-copy">Search respects the selected role. A parent or teacher search will not show invoices or staff-only records.</p>
        <form class="pp-filters" data-pp-search-form>
          <input name="q" placeholder="Search children, forms, activities..." value="${escapeHtml(state.search?.query || "")}" />
          <select name="role">
            <option value="director">Director</option>
            <option value="teacher">Teacher</option>
            <option value="guardian">Parent/guardian</option>
          </select>
          <button type="submit" class="ghost-button">Search</button>
        </form>
        <div class="pp-list">
          ${groups.map((group) => `
            <section class="pp-section">
              <h4>${escapeHtml(group.type)}</h4>
              ${(group.results || []).map((item) => `<p class="pp-search-result"><strong>${escapeHtml(item.title)}</strong> <span class="muted-copy">${escapeHtml(item.type)}</span></p>`).join("")}
            </section>
          `).join("") || "<p class=\"muted-copy\">Search results will appear here.</p>"}
        </div>
      </section>
    `;
  }

  function setupPanelHtml() {
    const setup = state.setup || state.dashboard?.setup || {};
    return `
      <section class="pp-panel" data-pp-panel="setup">
        <h3>Guided setup</h3>
        <p class="pp-computer-note">Computer recommended for guided setup. You can save and continue later at any time.</p>
        <p class="muted-copy">Status: ${escapeHtml(setup.status || "not started")} · ${escapeHtml(String(setup.progressPercent || 0))}%</p>
        <div class="pp-list">
          ${(setup.steps || []).map((step) => `
            <article class="pp-row">
              <div>
                <strong>${escapeHtml(step.label)}</strong>
                <p class="muted-copy">${step.completed ? "Complete" : step.skipped ? "Skipped" : step.optional ? "Optional" : "Not done yet"}</p>
              </div>
              <button type="button" class="ghost-button" data-pp-complete-step="${escapeHtml(step.id)}">Save</button>
              <button type="button" class="ghost-button" data-pp-skip-step="${escapeHtml(step.id)}">Skip</button>
            </article>
          `).join("") || "<p class=\"muted-copy\">Loading setup checklist.</p>"}
        </div>
        <button type="button" class="primary-button" data-pp-finish-later>Save and continue later</button>
      </section>
    `;
  }

  function toolsPanelHtml() {
    const prefs = state.notificationPrefs || {};
    return `
      <section class="pp-panel" data-pp-panel="tools">
        <h3>Helpful tools</h3>
        <p class="pp-computer-note">Computer recommended for bulk actions. Phase 21 never sends outbound notifications.</p>
        <section class="pp-section">
          <h4>Notification preferences</h4>
          <p class="muted-copy">Outbound email, SMS, and push are off in this preview.</p>
          <button type="button" class="ghost-button" data-pp-save-notifications>Keep grouped daily summary</button>
          <p class="muted-copy">Summary mode: ${escapeHtml(prefs.summaryMode || "daily")}</p>
        </section>
        <section class="pp-section">
          <h4>Bulk assign</h4>
          <button type="button" class="primary-button" data-pp-bulk-assign>Confirm fake weekly assignment</button>
        </section>
        <section class="pp-section">
          <h4>Fake scan</h4>
          <form class="pp-filters" data-pp-scan-form>
            <input name="fileName" placeholder="fake-menu-photo.jpg" />
            <button type="submit" class="ghost-button">Store fake scan</button>
          </form>
        </section>
        <button type="button" class="ghost-button" data-pp-undo>Undo last action</button>
      </section>
    `;
  }

  function currentPanelHtml() {
    if (!state.dashboard && state.loading) return `<section class="pp-panel" data-pp-panel="home"><p class="muted-copy">Loading Ease & Planning...</p></section>`;
    if (state.panel === "child_led") return childLedPanelHtml();
    if (state.panel === "activities") return activitiesPanelHtml();
    if (state.panel === "search") return searchPanelHtml();
    if (state.panel === "setup") return setupPanelHtml();
    if (state.panel === "tools") return toolsPanelHtml();
    return homePanelHtml();
  }

  function renderInto(root, options) {
    root.innerHTML = `
      <section class="pp-shell" data-feature-marker="phase21-provider-productivity">
        ${panelNavHtml()}
        ${state.loading ? "<p class=\"muted-copy\">Loading...</p>" : ""}
        ${statusHtml()}
        ${currentPanelHtml()}
      </section>
    `;
    bind(root, options);
  }

  async function refresh(root, options) {
    await loadDashboard(options);
    renderInto(root, options);
  }

  function bind(root, options) {
    root.querySelectorAll("[data-pp-open-panel]").forEach((button) => {
      button.addEventListener("click", () => {
        state.panel = button.getAttribute("data-pp-open-panel") || "home";
        state.notice = "";
        renderInto(root, options);
      });
    });

    root.querySelector("[data-pp-interest-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.target).entries());
      try {
        const res = await api(options, "POST", "/api/director-center/productivity/interests", data);
        state.lastInterest = res.interest;
        state.notice = "Interest recorded.";
        await refresh(root, options);
        state.panel = "child_led";
        renderInto(root, options);
      } catch (error) {
        state.error = error.message;
        renderInto(root, options);
      }
    });

    root.querySelector("[data-pp-generate-suggestions]")?.addEventListener("click", async (event) => {
      try {
        const id = event.currentTarget.getAttribute("data-pp-generate-suggestions");
        const res = await api(options, "POST", `/api/director-center/productivity/interests/${encodeURIComponent(id)}/suggestions`, {});
        state.lastSuggestions = res.suggestions || [];
        state.notice = "Suggestions generated from the local catalog.";
        renderInto(root, options);
      } catch (error) {
        state.error = error.message;
        renderInto(root, options);
      }
    });

    root.querySelectorAll("[data-pp-review]").forEach((button) => {
      button.addEventListener("click", async () => {
        const id = button.getAttribute("data-pp-review");
        const checked = root.querySelector(`[data-pp-review-check="${escapeSelector(id)}"]`)?.checked === true;
        try {
          const res = await api(options, "POST", `/api/director-center/productivity/suggestions/${encodeURIComponent(id)}/review`, { confirm: checked, reviewed: checked });
          state.lastSuggestions = state.lastSuggestions.map((row) => (row.id === id ? res.suggestion : row));
          state.notice = "Review confirmed.";
          renderInto(root, options);
        } catch (error) {
          state.error = error.message;
          renderInto(root, options);
        }
      });
    });

    root.querySelectorAll("[data-pp-save-suggestion]").forEach((button) => {
      button.addEventListener("click", async () => {
        const id = button.getAttribute("data-pp-save-suggestion");
        try {
          const res = await api(options, "POST", `/api/director-center/productivity/suggestions/${encodeURIComponent(id)}/save`, {});
          state.lastSavedSuggestion = res.suggestion;
          state.notice = "Idea saved.";
          await refresh(root, options);
          state.panel = "child_led";
          renderInto(root, options);
        } catch (error) {
          state.error = error.message;
          renderInto(root, options);
        }
      });
    });

    root.querySelectorAll("[data-pp-add-today]").forEach((button) => {
      button.addEventListener("click", async () => {
        const id = button.getAttribute("data-pp-add-today");
        const suggestion = state.lastSuggestions.find((row) => row.id === id) || (state.dashboard?.suggestions || []).find((row) => row.id === id);
        try {
          const res = await api(options, "POST", "/api/director-center/productivity/plan-entries", {
            suggestionId: id,
            title: suggestion?.title || "",
            target: "today",
            initiationMode: "child_initiated",
          });
          state.lastPlanEntry = res.planEntry;
          state.notice = "Added to today.";
          await refresh(root, options);
          state.panel = "child_led";
          renderInto(root, options);
        } catch (error) {
          state.error = error.message;
          renderInto(root, options);
        }
      });
    });

    root.querySelector("[data-pp-what-happened-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const note = compact(new FormData(event.target).get("note"));
      try {
        await api(options, "POST", "/api/director-center/productivity/what-happened", {
          planEntryId: state.lastPlanEntry?.id || "",
          interestId: state.lastInterest?.id || "",
          note,
        });
        state.notice = "What happened note saved.";
        await refresh(root, options);
        state.panel = "child_led";
        renderInto(root, options);
      } catch (error) {
        state.error = error.message;
        renderInto(root, options);
      }
    });

    root.querySelector("[data-pp-activity-filter-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const params = new URLSearchParams(Object.fromEntries(new FormData(event.target).entries()));
      try {
        const res = await api(options, "GET", `/api/director-center/productivity/activities?${params}`);
        state.activities = res.activities || [];
        state.notice = "Activities filtered.";
        renderInto(root, options);
      } catch (error) {
        state.error = error.message;
        renderInto(root, options);
      }
    });

    root.querySelectorAll("[data-pp-favorite-activity]").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          await api(options, "POST", `/api/director-center/productivity/activities/${encodeURIComponent(button.getAttribute("data-pp-favorite-activity"))}/favorite`, {});
          state.notice = "Favorite updated.";
          await refresh(root, options);
          state.panel = "activities";
          renderInto(root, options);
        } catch (error) {
          state.error = error.message;
          renderInto(root, options);
        }
      });
    });

    root.querySelectorAll("[data-pp-duplicate-activity], [data-pp-plan-activity]").forEach((button) => {
      button.addEventListener("click", async () => {
        const activityId = button.getAttribute("data-pp-duplicate-activity") || button.getAttribute("data-pp-plan-activity");
        const duplicate = button.hasAttribute("data-pp-duplicate-activity");
        try {
          if (duplicate) {
            await api(options, "POST", `/api/director-center/productivity/activities/${encodeURIComponent(activityId)}/duplicate`, {});
            state.notice = "Activity duplicated into saved ideas.";
          } else {
            await api(options, "POST", "/api/director-center/productivity/plan-entries", { activityId, target: "weekly", initiationMode: "invitation_offered" });
            state.notice = "Activity added to weekly planning.";
          }
          await refresh(root, options);
          state.panel = "activities";
          renderInto(root, options);
        } catch (error) {
          state.error = error.message;
          renderInto(root, options);
        }
      });
    });

    root.querySelector("[data-pp-search-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const params = new URLSearchParams(Object.fromEntries(new FormData(event.target).entries()));
      try {
        state.search = await api(options, "GET", `/api/director-center/productivity/search?${params}`);
        state.notice = "Search complete.";
        renderInto(root, options);
      } catch (error) {
        state.error = error.message;
        renderInto(root, options);
      }
    });

    root.querySelectorAll("[data-pp-complete-step], [data-pp-skip-step]").forEach((button) => {
      button.addEventListener("click", async () => {
        const completeStepId = button.getAttribute("data-pp-complete-step") || "";
        const skipStepId = button.getAttribute("data-pp-skip-step") || "";
        try {
          const res = await api(options, "POST", "/api/director-center/productivity/setup", { completeStepId, skipStepId });
          state.setup = res.setup;
          state.notice = completeStepId ? "Setup step saved." : "Setup step skipped.";
          renderInto(root, options);
        } catch (error) {
          state.error = error.message;
          renderInto(root, options);
        }
      });
    });

    root.querySelector("[data-pp-finish-later]")?.addEventListener("click", async () => {
      try {
        const res = await api(options, "POST", "/api/director-center/productivity/setup", { finishLater: true });
        state.setup = res.setup;
        state.notice = "Setup saved for later.";
        renderInto(root, options);
      } catch (error) {
        state.error = error.message;
        renderInto(root, options);
      }
    });

    root.querySelector("[data-pp-save-notifications]")?.addEventListener("click", async () => {
      try {
        const res = await api(options, "PATCH", "/api/director-center/productivity/notification-prefs", { summaryMode: "daily", groupRelated: true });
        state.notificationPrefs = res.notificationPrefs;
        state.notice = "Notification preferences saved. Outbound delivery remains off.";
        renderInto(root, options);
      } catch (error) {
        state.error = error.message;
        renderInto(root, options);
      }
    });

    root.querySelector("[data-pp-bulk-assign]")?.addEventListener("click", async () => {
      try {
        await api(options, "POST", "/api/director-center/productivity/bulk-assign", {
          confirm: true,
          activityIds: ["act_loose_parts_tray", "act_mud_kitchen"],
          target: "weekly",
        });
        state.notice = "Fake bulk assignment saved.";
        await refresh(root, options);
        state.panel = "tools";
        renderInto(root, options);
      } catch (error) {
        state.error = error.message;
        renderInto(root, options);
      }
    });

    root.querySelector("[data-pp-scan-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const fileName = compact(new FormData(event.target).get("fileName")) || "fake-scan.jpg";
      try {
        await api(options, "POST", "/api/director-center/productivity/scan", { fileName });
        state.notice = "Fake scan stored.";
        renderInto(root, options);
      } catch (error) {
        state.error = error.message;
        renderInto(root, options);
      }
    });

    root.querySelector("[data-pp-undo]")?.addEventListener("click", async () => {
      try {
        const res = await api(options, "POST", "/api/director-center/productivity/undo", {});
        state.notice = res.undone ? "Last action undone." : "Nothing to undo.";
        await refresh(root, options);
        state.panel = "tools";
        renderInto(root, options);
      } catch (error) {
        state.error = error.message;
        renderInto(root, options);
      }
    });
  }

  global.renderProviderProductivityTab = async function renderProviderProductivityTab(container, options = {}) {
    if (!container) return;
    const opts = {
      apiBase: options.apiBase || DEFAULT_BASE,
      getToken: options.getToken,
      organizationId: options.organizationId || "",
    };
    if (options.initialPanel) state.panel = String(options.initialPanel);
    await loadDashboard(opts);
    renderInto(container, opts);
  };
})(typeof window !== "undefined" ? window : globalThis);
