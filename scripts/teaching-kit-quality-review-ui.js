/**
 * AI Curriculum Quality Review — Library Health Dashboard UI.
 * Behind featureFlags.teachingKitQualityReview (default false).
 */
(function (root) {
  "use strict";

  const state = {
    tab: "overview",
    payload: null,
    status: "",
    busy: false,
  };

  function isEnabled() {
    const flags = (typeof effectiveSiteContent === "function" ? effectiveSiteContent() : null)?.featureFlags || {};
    if (root.LLHTeachingKit?.isTeachingKitQualityReviewEnabled) {
      return root.LLHTeachingKit.isTeachingKitQualityReviewEnabled(flags) === true;
    }
    return flags.teachingKitQualityReview === true;
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

  async function callQuality(action, extra = {}) {
    const token = adminToken();
    if (!token) {
      state.status = "Admin unlock required.";
      return null;
    }
    const response = await fetch("/api/admin/curriculum/quality-review", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ adminToken: token, action, ...extra }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      state.status = data.error || "Quality Review request failed.";
      return null;
    }
    return data;
  }

  function kpi(label, value, note) {
    return `<article class="tk-quality-kpi"><p class="eyebrow">${esc(label)}</p><strong>${esc(value)}</strong>${note ? `<small class="muted-copy">${esc(note)}</small>` : ""}</article>`;
  }

  function listBlock(title, rows, empty, note) {
    return `
      <section class="tk-quality-block">
        <h5>${esc(title)}</h5>
        ${note ? `<p class="muted-copy">${esc(note)}</p>` : ""}
        <ul class="tk-quality-list">
          ${(rows || []).map((row) => `<li>${typeof row === "string" ? esc(row) : row}</li>`).join("") || `<li class="muted-copy">${esc(empty || "None yet.")}</li>`}
        </ul>
      </section>
    `;
  }

  function lessonLine(r) {
    const workflow = r.workflow || r.publishReadiness || "";
    const libraryRaw = r.libraryStatus || r.blocking || (r.blockingCount > 0 ? "Quality notes" : "No quality notes");
    const ownerApi = root.LLHTeachingKitOwnerWorkspace;
    const library = ownerApi?.ownerFacingLibraryHealthStatus
      ? ownerApi.ownerFacingLibraryHealthStatus(libraryRaw)
      : (/blocked|needs changes/i.test(String(libraryRaw)) ? "Quality notes" : libraryRaw);
    const premium = r.premiumReadinessPercent != null ? ` · readiness ${esc(r.premiumReadinessPercent)}%` : "";
    return `<strong>${esc(r.title)}</strong> · ${esc(workflow || r.qualityLabel)} · ${esc(library)} · quality ${esc(r.qualityScore)}%${premium}`;
  }

  function render() {
    const host = document.querySelector("#adminLibraryHealthHost");
    if (!host) return;
    if (!isEnabled()) {
      host.innerHTML = "";
      host.hidden = true;
      return;
    }
    host.hidden = false;
    const health = state.payload?.libraryHealth || {};
    const dq = health.dataQuality || {};
    const tabs = [
      ["overview", "Overview"],
      ["gaps", "Content gaps"],
      ["usage", "Usage & demand"],
    ];
    let body = "";
    if (state.tab === "overview") {
      body = `
        <div class="tk-quality-kpi-grid">
          ${kpi("Lessons", health.summary?.lessonCount ?? 0)}
          ${kpi("Avg quality", `${health.summary?.averageQuality ?? 0}%`)}
          ${kpi("Needing review", health.summary?.needingReview ?? 0)}
          ${kpi("Quality notes", health.summary?.blockingLessons ?? 0)}
        </div>
        <p class="muted-copy">Data quality: ${esc(dq.analyticsLabel || "—")} · ${esc(dq.qualityMethod || "")}</p>
        ${listBlock("Highest quality lessons", (health.highestQuality || []).slice(0, 10).map(lessonLine))}
        ${listBlock("Lowest quality lessons", (health.lowestQuality || []).slice(0, 10).map(lessonLine))}
        ${listBlock("Lessons needing review", (health.needingReview || []).slice(0, 12).map(lessonLine))}
      `;
    } else if (state.tab === "gaps") {
      body = `
        ${listBlock("Missing books", (health.missingBooks || []).map((r) => esc(r.title)))}
        ${listBlock("Missing songs", (health.missingSongs || []).map((r) => esc(r.title)))}
        ${listBlock("Missing printables", (health.missingPrintables || []).map((r) => esc(r.title)))}
        ${listBlock("Missing example images", (health.missingExampleImages || []).map((r) => esc(r.title)))}
        ${listBlock("Missing teacher toolkit items", (health.missingToolkit || []).map((r) => esc(r.title)))}
        ${listBlock("Duplicate / repetitive resources", (health.duplicateResources || []).map((r) => esc(r.title)))}
      `;
    } else {
      body = `
        ${listBlock("Most viewed lessons", (health.mostViewed || []).map((r) => `<strong>${esc(r.title)}</strong> · ${esc(r.views)} views`), "None yet.", dq.analyticsLabel)}
        ${listBlock("Most assigned lessons", (health.mostAssigned || []).map((r) => `<strong>${esc(r.title)}</strong> · ${esc(r.assigns)} assigns`), "None yet.", dq.analyticsLabel)}
        ${listBlock("Most downloaded printables (by lesson demand)", (health.mostDownloadedPrintables || []).map((r) => `<strong>${esc(r.title)}</strong> · ${esc(r.downloads)} downloads`), "None yet.", dq.analyticsLabel)}
        ${listBlock("Lessons driving Pro upgrades", (health.drivingProUpgrades || []).map((r) => `<strong>${esc(r.title)}</strong> · ${esc(r.proUpgrades)}`), "None detected in range.", dq.analyticsLabel)}
        ${listBlock("Searched but not found", (health.searchedButMissing || []).map((g) => esc(g.query || g.message || g)), "None yet.", dq.searchGapsLabel)}
        ${listBlock("Build next", (health.businessBuildNext || []).map((line) => esc(line)))}
      `;
    }

    host.innerHTML = `
      <section class="tk-quality-panel" data-library-health>
        <div class="tk-quality-head">
          <div>
            <p class="eyebrow">AI Curriculum Quality Review</p>
            <strong>Library Health Dashboard</strong>
            <p class="muted-copy">Continuously improve curriculum quality. Reports only — nothing publishes automatically.</p>
          </div>
          <button type="button" class="primary-button" data-quality-refresh ${state.busy ? "disabled" : ""}>${state.busy ? "Loading…" : "Refresh library health"}</button>
        </div>
        <nav class="tk-quality-tabs" aria-label="Library Health">
          ${tabs.map(([id, label]) => `
            <button type="button" class="${state.tab === id ? "is-active" : ""}" data-quality-tab="${id}">${esc(label)}</button>
          `).join("")}
        </nav>
        <div class="tk-quality-body">${body}</div>
        ${state.status ? `<p class="muted-copy tk-quality-status">${esc(state.status)}</p>` : ""}
      </section>
    `;
  }

  async function refresh() {
    state.busy = true;
    state.status = "Building library health…";
    render();
    const data = await callQuality("library_health");
    state.busy = false;
    if (data) {
      state.payload = data;
      state.status = `Library health ready · ${data.libraryHealth?.summary?.lessonCount || 0} lessons · ${data.libraryHealth?.dataQuality?.analyticsLabel || ""}`;
    }
    render();
  }

  function bind() {
    if (bind._ready) return;
    bind._ready = true;
    document.addEventListener("click", async (event) => {
      if (!event.target.closest("#adminLibraryHealthHost") || !isEnabled()) return;
      const tab = event.target.closest("[data-quality-tab]");
      if (tab) {
        state.tab = tab.getAttribute("data-quality-tab") || "overview";
        render();
        return;
      }
      if (event.target.closest("[data-quality-refresh]")) await refresh();
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

  root.LLHTeachingKitQualityReviewUI = {
    mount,
    refresh,
    render,
    isEnabled,
    getState: () => state,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
