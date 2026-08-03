/**
 * AI Curriculum Director — admin UI (library-wide).
 * Behind featureFlags.teachingKitCurriculumDirector (default false).
 */
(function (root) {
  "use strict";

  const state = {
    tab: "coverage", // coverage | recommendations | masters | planning | business
    payload: null,
    status: "",
    planningQuestion: "",
    planningAnswer: null,
    masterForm: { title: "", type: "vocabulary", body: "", theme: "" },
    busy: false,
  };

  function directorApi() {
    return root.LLHTeachingKitCurriculumDirector || null;
  }

  function isEnabled() {
    const flags = (typeof effectiveSiteContent === "function" ? effectiveSiteContent() : null)?.featureFlags || {};
    if (root.LLHTeachingKit?.isTeachingKitCurriculumDirectorEnabled) {
      return root.LLHTeachingKit.isTeachingKitCurriculumDirectorEnabled(flags) === true;
    }
    return flags.teachingKitCurriculumDirector === true;
  }

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function adminToken() {
    try {
      return typeof adminSession === "function" ? (adminSession()?.token || "") : "";
    } catch {
      return "";
    }
  }

  async function callDirector(action, extra = {}) {
    const token = adminToken();
    if (!token) {
      state.status = "Admin unlock required.";
      return null;
    }
    const response = await fetch("/api/admin/curriculum/director", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ adminToken: token, action, ...extra }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      state.status = data.error || "Curriculum Director request failed.";
      return null;
    }
    return data;
  }

  function kpi(label, value) {
    return `<article class="tk-director-kpi"><p class="eyebrow">${esc(label)}</p><strong>${esc(value)}</strong></article>`;
  }

  function listBlock(title, rows, empty) {
    return `
      <section class="tk-director-block">
        <h5>${esc(title)}</h5>
        <ul class="tk-director-list">
          ${(rows || []).map((row) => `<li>${typeof row === "string" ? esc(row) : row}</li>`).join("") || `<li class="muted-copy">${esc(empty || "None yet.")}</li>`}
        </ul>
      </section>
    `;
  }

  function renderCoverage(data) {
    const c = data.coverage || {};
    const s = c.summary || {};
    return `
      <div class="tk-director-kpi-grid">
        ${kpi("Lessons", s.lessonCount ?? 0)}
        ${kpi("Never upgraded", s.neverUpgraded ?? 0)}
        ${kpi("Missing printables", s.missingPrintables ?? 0)}
        ${kpi("Missing songs", s.missingSongs ?? 0)}
        ${kpi("Missing books", s.missingBooks ?? 0)}
        ${kpi("Missing images", s.missingExampleImages ?? 0)}
        ${kpi("Incomplete themes", s.incompleteThemes ?? 0)}
      </div>
      ${listBlock("Incomplete themes", (c.incompleteThemes || []).map((t) => `<strong>${esc(t.theme)}</strong> · ${esc(t.averageCompletion)}% · ${esc(t.planCount)} lesson(s)`), "All themes look complete.")}
      ${listBlock("Weakest age groups", (c.weakestAgeGroups || []).map((a) => `<strong>${esc(a.ageBand)}</strong> · avg ${esc(a.avgCompletion)}% · ${esc(a.lessons)} lessons`), "No age data.")}
      ${listBlock("Lowest completion", (c.lowestCompletion || []).slice(0, 12).map((r) => `<strong>${esc(r.title)}</strong> · ${esc(r.completionPercent)}% · missing ${(r.missing || []).join(", ") || "—"}`))}
      ${listBlock("Most viewed", (c.mostViewed || []).slice(0, 10).map((r) => `<strong>${esc(r.title)}</strong> · ${esc(r.views)} views`))}
      ${listBlock("Never upgraded", (c.neverUpgraded || []).slice(0, 12).map((r) => esc(r.title)))}
    `;
  }

  function renderRecommendations(data) {
    const recs = data.recommendations?.recommendations || data.recommendations || [];
    return listBlock(
      "AI recommendations",
      recs.map((r) => `<span class="tag">${esc(r.severity || "info")}</span> ${esc(r.message)}`),
      "No recommendations yet.",
    );
  }

  function renderMasters(data) {
    const health = data.resourceHealth || {};
    const masters = data.directorState?.masterResources || [];
    return `
      <p class="muted-copy">Master resources live independently of lessons. Link one pack into many themes; updating the master updates linked <em>draft</em> references — publish stays in your control.</p>
      <form class="tk-director-master-form" data-director-master-save>
        <label><span>Title</span><input name="title" value="${esc(state.masterForm.title)}" required placeholder="Farm Animal Vocabulary" /></label>
        <label><span>Type</span>
          <select name="type">
            ${["vocabulary", "printable", "song", "book", "observation", "family_connection", "teacher_tip", "toolkit", "activity"].map((t) => `
              <option value="${t}" ${state.masterForm.type === t ? "selected" : ""}>${t}</option>
            `).join("")}
          </select>
        </label>
        <label><span>Theme</span><input name="theme" value="${esc(state.masterForm.theme)}" placeholder="Farm Animals" /></label>
        <label class="tk-director-span"><span>Body</span><textarea name="body" rows="3" placeholder="cow · pig · hen · sheep · horse">${esc(state.masterForm.body)}</textarea></label>
        <button type="submit" class="primary-button">Save master resource</button>
      </form>
      ${listBlock(
        "Master resources",
        masters.map((m) => {
          const h = (health.rows || []).find((r) => r.id === m.id);
          return `<strong>${esc(m.title)}</strong> · ${esc(m.type)} · linked by ${esc(h?.linkedBy ?? m.linkedPlanIds?.length ?? 0)}
            <br/><span class="muted-copy">${esc((h?.flags || []).join(", ") || "healthy")}</span>
            <div class="form-actions">
              <button type="button" class="ghost-button" data-director-link-master="${esc(m.id)}">Auto-link related lessons</button>
              <button type="button" class="ghost-button" data-director-propagate="${esc(m.id)}">Propagate update to drafts</button>
            </div>`;
        }),
        "No master resources yet — save Farm Animal Vocabulary as a master, then link it into Barnyard, Veterinarian, and Baby Animals.",
      )}
      ${listBlock("Never used", (health.neverUsed || []).map((r) => esc(r.title)))}
      ${listBlock("Duplicates detected", (health.duplicates || []).map((r) => esc(r.title)))}
    `;
  }

  function renderPlanning(data) {
    const answer = state.planningAnswer || data.planning || null;
    return `
      <p class="muted-copy">Ask library-scale questions. Answers use curriculum intelligence + usage — nothing publishes automatically.</p>
      <div class="tk-director-planning-examples">
        ${[
          "Build my Fall curriculum.",
          "Which themes should I create next?",
          "What themes are missing for infants?",
          "Which lesson should I upgrade today?",
          "What should I post on TikTok based on the most popular lessons?",
          "What reusable resources should I build next?",
        ].map((q) => `<button type="button" class="ghost-button" data-director-ask="${esc(q)}">${esc(q)}</button>`).join("")}
      </div>
      <label><span>Your question</span>
        <textarea data-director-planning-input rows="2">${esc(state.planningQuestion)}</textarea>
      </label>
      <button type="button" class="primary-button" data-director-planning-send>Ask Curriculum Director</button>
      ${answer ? `
        <article class="tk-director-answer">
          <p class="eyebrow">Answer</p>
          <p>${esc(answer.answer || "")}</p>
        </article>
      ` : ""}
    `;
  }

  function renderBusiness(data) {
    const b = data.businessInsights || {};
    return `
      <p class="muted-copy">Curriculum usage connected to business signals (views, downloads, assigns, upgrade drivers, search gaps).</p>
      ${listBlock("Most viewed lessons", (b.mostViewedLessons || []).slice(0, 10).map((r) => `<strong>${esc(r.title)}</strong> · ${esc(r.views)} views`))}
      ${listBlock("Most downloaded / printable demand", (b.mostDownloadedPrintables || []).slice(0, 10).map((r) => `<strong>${esc(r.title)}</strong> · ${esc(r.downloads)} downloads`))}
      ${listBlock("Most assigned", (b.mostAssignedLessons || []).slice(0, 10).map((r) => `<strong>${esc(r.title)}</strong> · ${esc(r.assigns)} assigns`))}
      ${listBlock("Driving Pro upgrades", (b.lessonsDrivingProUpgrades || []).map((r) => `<strong>${esc(r.title)}</strong> · ${esc(r.proUpgrades)}`))}
      ${listBlock("Searched but not found", (b.searchedButMissing || []).map((g) => esc(g.query || g.message || g)))}
      ${listBlock("Build next (usage-based)", (b.buildNext || []).map((line) => esc(line)))}
    `;
  }

  function render() {
    const host = document.querySelector("#adminCurriculumDirectorHost");
    if (!host) return;
    if (!isEnabled() || !directorApi()) {
      host.innerHTML = "";
      host.hidden = true;
      return;
    }
    host.hidden = false;
    const tabs = [
      ["coverage", "Coverage"],
      ["recommendations", "AI Recommendations"],
      ["masters", "Reusable Resources"],
      ["planning", "AI Planning"],
      ["business", "Business Insights"],
    ];
    const data = state.payload || {};
    let body = "";
    if (state.tab === "coverage") body = renderCoverage(data);
    else if (state.tab === "recommendations") body = renderRecommendations(data);
    else if (state.tab === "masters") body = renderMasters(data);
    else if (state.tab === "planning") body = renderPlanning(data);
    else if (state.tab === "business") body = renderBusiness(data);

    host.innerHTML = `
      <section class="tk-director-panel" data-curriculum-director>
        <div class="tk-director-head">
          <div>
            <p class="eyebrow">AI Curriculum Director</p>
            <strong>Library-wide intelligence — every upgrade gets smarter</strong>
            <p class="muted-copy">Knows themes, printables, vocabulary, songs, books, activities, observations, family activities, and teacher tips across Little Learner Hub. Reuse first.</p>
          </div>
          <button type="button" class="primary-button" data-director-refresh ${state.busy ? "disabled" : ""}>${state.busy ? "Loading…" : "Refresh intelligence"}</button>
        </div>
        <nav class="tk-director-tabs" aria-label="Curriculum Director">
          ${tabs.map(([id, label]) => `
            <button type="button" class="${state.tab === id ? "is-active" : ""}" data-director-tab="${id}">${esc(label)}</button>
          `).join("")}
        </nav>
        <div class="tk-director-body">${body}</div>
        ${state.status ? `<p class="muted-copy tk-director-status">${esc(state.status)}</p>` : ""}
      </section>
    `;
  }

  async function refresh() {
    state.busy = true;
    state.status = "Building curriculum intelligence…";
    render();
    const data = await callDirector("snapshot");
    state.busy = false;
    if (data) {
      state.payload = data;
      state.status = `Intelligence ready · ${data.intelligence?.planCount || 0} lessons · ${data.intelligence?.masterResources?.length || 0} masters`;
    }
    render();
  }

  function bind() {
    if (bind._ready) return;
    bind._ready = true;
    document.addEventListener("click", async (event) => {
      const host = event.target.closest("#adminCurriculumDirectorHost");
      if (!host || !isEnabled()) return;
      const tab = event.target.closest("[data-director-tab]");
      if (tab) {
        state.tab = tab.getAttribute("data-director-tab") || "coverage";
        render();
        return;
      }
      if (event.target.closest("[data-director-refresh]")) {
        await refresh();
        return;
      }
      const ask = event.target.closest("[data-director-ask]");
      if (ask) {
        state.planningQuestion = ask.getAttribute("data-director-ask") || "";
        state.tab = "planning";
        render();
        return;
      }
      if (event.target.closest("[data-director-planning-send]")) {
        const question = state.planningQuestion || host.querySelector("[data-director-planning-input]")?.value || "";
        state.busy = true;
        render();
        const data = await callDirector("planning", { question });
        state.busy = false;
        if (data?.planning) {
          state.planningAnswer = data.planning;
          state.status = "Planning answer ready (draft guidance only).";
          if (state.payload) state.payload.planning = data.planning;
        }
        render();
        return;
      }
      const linkBtn = event.target.closest("[data-director-link-master]");
      if (linkBtn) {
        const data = await callDirector("auto_link_master", { masterId: linkBtn.getAttribute("data-director-link-master") });
        if (data) {
          state.status = data.message || `Linked to ${data.linkedPlanIds?.length || 0} lesson draft(s).`;
          await refresh();
        } else render();
        return;
      }
      const propBtn = event.target.closest("[data-director-propagate]");
      if (propBtn) {
        const data = await callDirector("propagate_master", { masterId: propBtn.getAttribute("data-director-propagate") });
        if (data) {
          state.status = data.message || "Propagated to drafts.";
          await refresh();
        } else render();
      }
    });

    document.addEventListener("input", (event) => {
      if (!event.target.matches("[data-director-planning-input]")) return;
      state.planningQuestion = event.target.value || "";
    });

    document.addEventListener("submit", async (event) => {
      if (!event.target.matches("[data-director-master-save]")) return;
      event.preventDefault();
      const form = event.target;
      const item = {
        title: form.title?.value || "",
        type: form.type?.value || "vocabulary",
        theme: form.theme?.value || "",
        body: form.body?.value || "",
      };
      state.masterForm = item;
      const data = await callDirector("save_master", { item });
      if (data?.duplicate) {
        state.status = data.message || "Similar master already exists.";
        render();
        return;
      }
      if (data?.saved) {
        state.status = `Saved master “${data.saved.title}”. Published lessons unchanged.`;
        state.masterForm = { title: "", type: "vocabulary", body: "", theme: "" };
        await refresh();
      } else render();
    });
  }

  async function mount() {
    bind();
    if (!isEnabled()) {
      render();
      return;
    }
    if (!state.payload) await refresh();
    else render();
  }

  root.LLHTeachingKitCurriculumDirectorUI = {
    mount,
    refresh,
    render,
    isEnabled,
    getState: () => state,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
