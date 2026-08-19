/**
 * Owner Visual Production review UI.
 * Plans visuals from owner instructions. Never generates or attaches assets.
 */
(function initVisualProductionUi(global) {
  "use strict";

  const STATUS_CLASS = {
    DRAFT: "draft",
    READY_FOR_REVIEW: "ready",
    NEEDS_REVIEW: "needs",
    APPROVED: "approved",
    GENERATED: "generated",
    ATTACHED: "attached",
  };

  const state = {
    lessonId: "",
    lessonTitle: "",
    instruction: "",
    cards: [],
    selectedId: "",
    busy: false,
    message: "",
    isError: false,
    mounted: false,
  };

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function host() {
    return document.getElementById("adminVisualProductionApp");
  }

  function isOwner() {
    try {
      if (typeof isTeachingKitPrintableOwnerClient === "function") {
        return isTeachingKitPrintableOwnerClient();
      }
      const session = typeof adminSession === "function" ? adminSession() : null;
      const email = String(session?.email || "").trim().toLowerCase();
      return [
        "leahivie@icloud.com",
        "leahrivie@icloud.com",
        "leahrivie@gmail.com",
        "little.learners.hub.customer@gmail.com",
      ].includes(email);
    } catch {
      return false;
    }
  }

  async function api(action, extra) {
    const token = (typeof adminSession === "function" ? adminSession()?.token : "") || "";
    if (!token) throw new Error("Admin session required.");
    if (!isOwner()) throw new Error("Visual Production is restricted to the owner account.");
    const response = await fetch("/api/admin/curriculum/visual-production", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action, ...extra }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(json.error || `Visual Production failed (${response.status})`);
      error.payload = json;
      throw error;
    }
    return json;
  }

  function selectedCard() {
    return state.cards.find((card) => card.id === state.selectedId) || state.cards[0] || null;
  }

  function listHtml() {
    if (!state.cards.length) {
      return `<p class="muted-copy">No planned visuals yet. Paste owner visual instructions after the lesson is imported with Master Paste.</p>`;
    }
    return `
      <ul class="vp-card-list">
        ${state.cards.map((card) => `
          <li>
            <button type="button" class="vp-card-nav ${card.id === state.selectedId ? "is-active" : ""}" data-vp-select="${esc(card.id)}">
              <strong>${esc(card.activityName || "Untitled asset")}</strong>
              <span>${esc(card.assetType || "UNKNOWN")}</span>
              <span class="tag vp-status vp-status--${esc(STATUS_CLASS[card.status] || "draft")}">${esc(card.statusLabel || card.status)}</span>
            </button>
          </li>
        `).join("")}
      </ul>
    `;
  }

  function detailHtml(card) {
    if (!card) return "";
    const flags = Array.isArray(card.reviewFlags) && card.reviewFlags.length
      ? card.reviewFlags.map((flag) => `<li>${esc(flag)}</li>`).join("")
      : "<li>None</li>";
    const forbidden = (card.forbiddenElements || []).map((item) => `<li>${esc(item)}</li>`).join("") || "<li>None</li>";
    const required = (card.structuredBrief?.requiredElements || []).map((item) => `<li>${esc(item)}</li>`).join("") || "<li>None</li>";
    return `
      <article class="vp-review" data-vp-review="${esc(card.id)}">
        <header>
          <p class="eyebrow">Planned visual — review before any generation</p>
          <h3>${esc(card.activityName || "Untitled asset")}</h3>
          <p>
            <span class="tag">${esc(card.assetType || "UNKNOWN")}</span>
            <span class="tag">${esc(card.visualStyle || "UNKNOWN")}</span>
            <span class="tag vp-status vp-status--${esc(STATUS_CLASS[card.status] || "draft")}">${esc(card.statusLabel || card.status)}</span>
          </p>
        </header>
        <section>
          <h4>Original visual instruction</h4>
          <pre class="vp-pre">${esc(card.originalInstruction || "")}</pre>
        </section>
        <section>
          <h4>Structured brief</h4>
          <dl class="vp-dl">
            <dt>Subject</dt><dd>${esc(card.structuredBrief?.subject || "")}</dd>
            <dt>Composition</dt><dd>${esc(card.structuredBrief?.composition || "")}</dd>
            <dt>Materials</dt><dd>${esc(card.structuredBrief?.materials || "")}</dd>
            <dt>Environment</dt><dd>${esc(card.structuredBrief?.environment || "")}</dd>
            <dt>People</dt><dd>${esc(card.structuredBrief?.people || "")}</dd>
            <dt>Printable layout</dt><dd>${esc(card.structuredBrief?.printableLayout || "")}</dd>
          </dl>
        </section>
        <section>
          <h4>Required elements</h4>
          <ul>${required}</ul>
        </section>
        <section>
          <h4>Forbidden elements</h4>
          <ul>${forbidden}</ul>
        </section>
        <section>
          <h4>Proposed generation prompt</h4>
          <pre class="vp-pre">${esc(card.generationPrompt || "")}</pre>
          <h4>Negative prompt</h4>
          <pre class="vp-pre">${esc(card.negativePrompt || "")}</pre>
        </section>
        <section>
          <h4>Review flags</h4>
          <ul>${flags}</ul>
        </section>
        <div class="form-actions">
          <button type="button" class="primary-button" data-vp-approve ${card.canApprove ? "" : "disabled"}>Approve planned visual</button>
          <button type="button" class="ghost-button" data-vp-needs-review>Mark needs review</button>
          <button type="button" class="ghost-button" data-vp-generate disabled title="${esc(card.generateBlockedReason || "")}">Generate (blocked)</button>
          <button type="button" class="ghost-button" data-vp-attach disabled title="${esc(card.attachBlockedReason || "")}">Attach (blocked)</button>
        </div>
        <p class="muted-copy">Approve never runs automatically. Generate and attach stay blocked until you give a later explicit instruction for a specific approved brief.</p>
      </article>
    `;
  }

  function render() {
    const el = host();
    if (!el) return;
    const card = selectedCard();
    el.innerHTML = `
      <div class="section-heading">
        <div>
          <p class="eyebrow">Content · Visual Production</p>
          <h3>Lesson visual briefs</h3>
          <p class="muted-copy">Master Paste first. Then paste exact visual instructions. This screen only plans briefs for review — it does not generate, attach, publish, or replace existing assets.</p>
        </div>
        <button type="button" class="ghost-button" data-admin-section-tab="curriculum-lesson-plans">Back to Lesson Plans</button>
      </div>
      ${state.message ? `<p class="form-message ${state.isError ? "is-error" : "is-success"}">${esc(state.message)}</p>` : ""}
      <form class="panel-form admin-stacked-form" data-vp-plan-form>
        <label>Lesson ID
          <input name="lessonId" value="${esc(state.lessonId)}" placeholder="cur-lp-..." required />
        </label>
        ${state.lessonTitle ? `<p class="muted-copy">Lesson: ${esc(state.lessonTitle)}</p>` : ""}
        <label>Owner visual instructions
          <textarea name="instruction" rows="12" placeholder="Farm Sensory Bin:&#10;Activity image.&#10;Realistic daycare setup.&#10;No children.&#10;...">${esc(state.instruction)}</textarea>
        </label>
        <div class="form-actions">
          <button class="primary-button" type="submit" ${state.busy ? "disabled" : ""}>Plan visuals for review</button>
          <button class="ghost-button" type="button" data-vp-refresh ${state.busy || !state.lessonId ? "disabled" : ""}>Refresh planned visuals</button>
        </div>
      </form>
      <div class="vp-layout">
        <aside>${listHtml()}</aside>
        <div>${detailHtml(card)}</div>
      </div>
    `;
  }

  async function refreshList() {
    if (!state.lessonId) {
      state.cards = [];
      return;
    }
    const data = await api("list", { lessonId: state.lessonId });
    state.cards = Array.isArray(data.cards) ? data.cards : [];
    if (state.selectedId && !state.cards.some((card) => card.id === state.selectedId)) {
      state.selectedId = state.cards[0]?.id || "";
    }
    if (!state.selectedId && state.cards[0]) state.selectedId = state.cards[0].id;
  }

  async function run(task) {
    if (state.busy) return;
    state.busy = true;
    state.message = "";
    state.isError = false;
    render();
    try {
      await task();
    } catch (error) {
      state.isError = true;
      state.message = error.message || "Visual Production failed.";
      if (error.payload?.card) {
        state.cards = state.cards.map((card) => (card.id === error.payload.card.id ? error.payload.card : card));
      }
    } finally {
      state.busy = false;
      render();
    }
  }

  function bind(el) {
    if (!el || el.dataset.vpBound === "true") return;
    el.dataset.vpBound = "true";
    el.addEventListener("click", (event) => {
      const select = event.target.closest("[data-vp-select]");
      if (select) {
        state.selectedId = select.getAttribute("data-vp-select") || "";
        render();
        return;
      }
      if (event.target.closest("[data-vp-refresh]")) {
        void run(refreshList);
        return;
      }
      if (event.target.closest("[data-vp-approve]")) {
        const card = selectedCard();
        if (!card) return;
        void run(async () => {
          const data = await api("approve", { id: card.id, confirmApprove: true });
          state.cards = state.cards.map((item) => (item.id === data.card.id ? data.card : item));
          state.message = "Planned visual approved. Generation and attachment remain blocked until you request them explicitly.";
        });
        return;
      }
      if (event.target.closest("[data-vp-needs-review]")) {
        const card = selectedCard();
        if (!card) return;
        void run(async () => {
          const data = await api("needs-review", { id: card.id });
          state.cards = state.cards.map((item) => (item.id === data.card.id ? data.card : item));
          state.message = "Marked NEEDS_REVIEW. Nothing was generated or attached.";
        });
      }
    });
    el.addEventListener("submit", (event) => {
      const form = event.target.closest("[data-vp-plan-form]");
      if (!form) return;
      event.preventDefault();
      const lessonId = String(form.lessonId?.value || "").trim();
      const instruction = String(form.instruction?.value || "").trim();
      state.lessonId = lessonId;
      state.instruction = instruction;
      void run(async () => {
        const data = await api("plan", { lessonId, instruction });
        state.cards = Array.isArray(data.cards) ? data.cards : [];
        state.selectedId = state.cards[0]?.id || "";
        state.message = data.message || "Planned visuals are ready for review.";
        await refreshList();
      });
    });
  }

  function mount(options) {
    const opts = options && typeof options === "object" ? options : {};
    if (opts.lessonId) state.lessonId = String(opts.lessonId);
    if (opts.lessonTitle) state.lessonTitle = String(opts.lessonTitle);
    if (opts.instruction) state.instruction = String(opts.instruction);
    state.mounted = true;
    bind(host());
    render();
    if (state.lessonId) void run(refreshList);
  }

  function openForLesson(lessonId, lessonTitle) {
    state.lessonId = String(lessonId || "");
    state.lessonTitle = String(lessonTitle || "");
    if (typeof setAdminSectionTab === "function") {
      setAdminSectionTab("curriculum-visual-production");
    }
    mount({ lessonId: state.lessonId, lessonTitle: state.lessonTitle });
  }

  global.LLHVisualProductionUi = { mount, openForLesson };
})(typeof window !== "undefined" ? window : globalThis);
