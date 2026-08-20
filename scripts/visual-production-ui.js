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
    packs: [],
    selectedId: "",
    busy: false,
    message: "",
    isError: false,
    mounted: false,
    /** @type {Map<string, string>} */
    previewObjectUrls: new Map(),
    modalPreviewUrl: "",
    modalTitle: "",
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

  function adminToken() {
    return (typeof adminSession === "function" ? adminSession()?.token : "") || "";
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
    const token = adminToken();
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

  /**
   * Authenticated preview URL for new-tab / direct GET loads.
   * Reuses the existing adminToken query-param pattern.
   */
  function previewSrc(url) {
    const text = String(url || "").trim();
    if (!text) return "";
    const token = adminToken();
    if (!token) return text;
    return `${text}${text.includes("?") ? "&" : "?"}adminToken=${encodeURIComponent(token)}`;
  }

  function revokePreviewObjectUrls() {
    state.previewObjectUrls.forEach((objectUrl) => {
      try { URL.revokeObjectURL(objectUrl); } catch { /* ignore */ }
    });
    state.previewObjectUrls.clear();
  }

  /**
   * Load preview bytes with owner auth, then display via blob URL.
   * Avoids broken <img> Authorization header behavior while keeping adminToken GET support.
   */
  async function resolvePreviewObjectUrl(previewUrl) {
    const key = String(previewUrl || "").trim();
    if (!key) return "";
    if (state.previewObjectUrls.has(key)) return state.previewObjectUrls.get(key) || "";
    const token = adminToken();
    const authedUrl = previewSrc(key);
    const response = await fetch(authedUrl, {
      method: "GET",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Preview could not be loaded (${response.status}).`);
    }
    const blob = await response.blob();
    if (!blob || !blob.size) throw new Error("Preview response was empty.");
    const objectUrl = URL.createObjectURL(blob);
    state.previewObjectUrls.set(key, objectUrl);
    return objectUrl;
  }

  async function hydratePreviewImages(root) {
    const el = root || host();
    if (!el) return;
    const nodes = Array.from(el.querySelectorAll("[data-vp-preview-url]"));
    await Promise.all(nodes.map(async (node) => {
      const previewUrl = node.getAttribute("data-vp-preview-url") || "";
      if (!previewUrl) return;
      try {
        const objectUrl = await resolvePreviewObjectUrl(previewUrl);
        if (node.tagName === "IMG") {
          node.setAttribute("src", objectUrl);
          node.classList.remove("is-loading", "is-error");
          node.classList.add("is-ready");
        } else if (node.tagName === "A") {
          node.setAttribute("href", previewSrc(previewUrl));
        }
        const status = node.closest("[data-vp-preview-frame]")?.querySelector("[data-vp-preview-status]");
        if (status) status.textContent = "";
      } catch (error) {
        node.classList.add("is-error");
        const status = node.closest("[data-vp-preview-frame]")?.querySelector("[data-vp-preview-status]");
        if (status) status.textContent = error.message || "Preview failed to load.";
      }
    }));
  }

  function cardNavLabel(card) {
    if (card.pageNumber && card.pageTitle) {
      return `Page ${card.pageNumber}: ${card.pageTitle}`;
    }
    return card.activityName || card.pageTitle || "Untitled asset";
  }

  function listHtml() {
    if (!state.cards.length) {
      return `<p class="muted-copy">No planned visuals yet${state.lessonId ? " for this lesson" : ""}. Enter a Lesson ID (for example <code>cur-lp-preschool-zoo-adventure</code>) and click Refresh, or leave Lesson ID blank and Refresh to load all planned visuals.</p>`;
    }
    const sorted = state.cards.slice().sort((a, b) => {
      if (a.printablePackId && a.printablePackId === b.printablePackId) {
        return (a.pageNumber || 0) - (b.pageNumber || 0);
      }
      return String(a.updatedAt || "").localeCompare(String(b.updatedAt || ""));
    });
    return `
      <ul class="vp-card-list">
        ${sorted.map((card) => `
          <li>
            <button type="button" class="vp-card-nav ${card.id === state.selectedId ? "is-active" : ""}" data-vp-select="${esc(card.id)}">
              <strong>${esc(cardNavLabel(card))}</strong>
              <span>${esc(card.assetType || "UNKNOWN")}</span>
              <span class="tag vp-status vp-status--${esc(STATUS_CLASS[card.status] || "draft")}">${esc(card.statusLabel || card.status)}</span>
            </button>
          </li>
        `).join("")}
      </ul>
    `;
  }

  function previewFrameHtml(card, options) {
    const opts = options && typeof options === "object" ? options : {};
    const previewUrl = String(card.generatedPreviewUrl || "").trim();
    if (!previewUrl) return "";
    const title = card.pageNumber
      ? `Page ${card.pageNumber} — ${card.pageTitle || card.activityName || "Preview"}`
      : (card.activityName || "Generated preview");
    const sizeClass = opts.compact ? "vp-preview-image vp-preview-image--compact" : "vp-preview-image vp-preview-image--large";
    return `
      <div class="vp-preview-frame" data-vp-preview-frame>
        ${opts.showHeading === false ? "" : `<h4>${esc(title)}</h4>`}
        <p class="muted-copy">Preview only — not attached to the lesson.</p>
        <img
          class="${sizeClass} is-loading"
          data-vp-preview-url="${esc(previewUrl)}"
          alt="Generated visual preview for ${esc(title)}"
        />
        <p class="muted-copy vp-preview-status" data-vp-preview-status>Loading authenticated preview…</p>
        <div class="form-actions vp-preview-actions">
          <button type="button" class="primary-button" data-vp-open-preview="${esc(previewUrl)}" data-vp-open-title="${esc(title)}">Open full preview</button>
          <a class="ghost-button" data-vp-preview-url="${esc(previewUrl)}" href="${esc(previewSrc(previewUrl))}" target="_blank" rel="noopener noreferrer">Open in new tab</a>
        </div>
        ${card.generatedAt ? `<p class="muted-copy">Generated ${esc(card.generatedAt)}${card.generationModel ? ` · ${esc(card.generationModel)}` : ""}</p>` : ""}
      </div>
    `;
  }

  function packGalleryHtml() {
    const packCards = state.cards
      .filter((card) => card.printablePackId && card.generatedPreviewUrl && card.status === "GENERATED")
      .slice()
      .sort((a, b) => {
        if (a.printablePackId !== b.printablePackId) {
          return String(a.printablePackId).localeCompare(String(b.printablePackId));
        }
        return (a.pageNumber || 0) - (b.pageNumber || 0);
      });
    if (!packCards.length) return "";
    const byPack = new Map();
    packCards.forEach((card) => {
      const key = card.printablePackId;
      if (!byPack.has(key)) byPack.set(key, []);
      byPack.get(key).push(card);
    });
    return Array.from(byPack.entries()).map(([packId, pages]) => {
      const packTitle = pages[0]?.packTitle || "Printable pack";
      return `
        <section class="vp-pack-gallery" data-vp-pack-gallery="${esc(packId)}">
          <header>
            <h3>${esc(packTitle)}</h3>
            <p class="muted-copy">Pack ID ${esc(packId)} · generated pages in exact page-number order</p>
          </header>
          <div class="vp-pack-pages">
            ${pages.map((card) => `
              <article class="vp-pack-page" data-vp-select="${esc(card.id)}">
                <h4>Page ${esc(String(card.pageNumber || ""))} — ${esc(card.pageTitle || card.activityName || "")}</h4>
                ${previewFrameHtml(card, { compact: true, showHeading: false })}
              </article>
            `).join("")}
          </div>
        </section>
      `;
    }).join("");
  }

  function modalHtml() {
    if (!state.modalPreviewUrl) return "";
    return `
      <div class="vp-preview-modal" data-vp-preview-modal role="dialog" aria-modal="true" aria-label="Full visual preview">
        <div class="vp-preview-modal__backdrop" data-vp-close-modal></div>
        <div class="vp-preview-modal__panel">
          <header class="vp-preview-modal__header">
            <h3>${esc(state.modalTitle || "Full preview")}</h3>
            <button type="button" class="ghost-button" data-vp-close-modal>Close</button>
          </header>
          <img
            class="vp-preview-image vp-preview-image--modal is-loading"
            data-vp-preview-url="${esc(state.modalPreviewUrl)}"
            alt="${esc(state.modalTitle || "Full visual preview")}"
          />
          <p class="muted-copy vp-preview-status" data-vp-preview-status>Loading authenticated preview…</p>
          <div class="form-actions">
            <a class="primary-button" data-vp-preview-url="${esc(state.modalPreviewUrl)}" href="${esc(previewSrc(state.modalPreviewUrl))}" target="_blank" rel="noopener noreferrer">Open in new tab</a>
          </div>
        </div>
      </div>
    `;
  }

  function detailHtml(card) {
    if (!card) return "";
    const flags = Array.isArray(card.reviewFlags) && card.reviewFlags.length
      ? card.reviewFlags.map((flag) => `<li>${esc(flag)}</li>`).join("")
      : "<li>None</li>";
    const forbidden = (card.forbiddenElements || []).map((item) => `<li>${esc(item)}</li>`).join("") || "<li>None</li>";
    const required = (card.structuredBrief?.requiredElements || []).map((item) => `<li>${esc(item)}</li>`).join("") || "<li>None</li>";
    const heading = card.pageNumber
      ? `Page ${card.pageNumber}: ${card.pageTitle || card.activityName || "Untitled"}`
      : (card.activityName || "Untitled asset");
    return `
      <article class="vp-review" data-vp-review="${esc(card.id)}">
        <header>
          <p class="eyebrow">Planned visual — review before any generation</p>
          <h3>${esc(heading)}</h3>
          <p>
            <span class="tag">${esc(card.assetType || "UNKNOWN")}</span>
            <span class="tag">${esc(card.visualStyle || "UNKNOWN")}</span>
            <span class="tag vp-status vp-status--${esc(STATUS_CLASS[card.status] || "draft")}">${esc(card.statusLabel || card.status)}</span>
            ${card.printablePackId ? `<span class="tag">Pack ${esc(card.printablePackId)}</span>` : ""}
            ${card.activityLinkStatus === "pending" ? `<span class="tag">Activity link pending</span>` : ""}
            ${card.activityLinkStatus === "linked" ? `<span class="tag">Activity linked</span>` : ""}
          </p>
        </header>
        ${card.generatedPreviewUrl ? `
        <section class="vp-preview-section">
          <h4>Generated preview</h4>
          ${previewFrameHtml(card, { compact: false, showHeading: false })}
        </section>` : ""}
        <section>
          <h4>Original visual instruction</h4>
          <pre class="vp-pre">${esc(card.originalInstruction || "")}</pre>
        </section>
        ${Array.isArray(card.textOverlayRequirements) && card.textOverlayRequirements.length ? `
        <section>
          <h4>Post-generation text overlay (not drawn by the model)</h4>
          <ul>${card.textOverlayRequirements.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>
        </section>` : ""}
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
          <button type="button" class="primary-button" data-vp-generate ${card.canGenerate ? "" : "disabled"} title="${esc(card.generateBlockedReason || "")}">${card.canGenerate ? "Make this visual" : "Generate (blocked)"}</button>
          <button type="button" class="ghost-button" data-vp-attach disabled title="${esc(card.attachBlockedReason || "")}">Attach (blocked)</button>
        </div>
        <p class="muted-copy">Approve never runs automatically. Generate creates one preview for one approved brief. Attach stays blocked until you give a later explicit instruction for a specific approved brief.</p>
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
          <button class="ghost-button" type="button" data-vp-refresh ${state.busy ? "disabled" : ""}>Refresh planned visuals</button>
        </div>
      </form>
      ${packGalleryHtml()}
      <div class="vp-layout">
        <aside>${listHtml()}</aside>
        <div>${detailHtml(card)}</div>
      </div>
      ${modalHtml()}
    `;
    void hydratePreviewImages(el);
  }

  async function refreshList() {
    const data = await api("list", state.lessonId ? { lessonId: state.lessonId } : {});
    state.cards = Array.isArray(data.cards) ? data.cards : [];
    state.packs = Array.isArray(data.packs) ? data.packs : [];
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
      const closeModal = event.target.closest("[data-vp-close-modal]");
      if (closeModal) {
        state.modalPreviewUrl = "";
        state.modalTitle = "";
        render();
        return;
      }
      const openPreview = event.target.closest("[data-vp-open-preview]");
      if (openPreview) {
        event.preventDefault();
        state.modalPreviewUrl = openPreview.getAttribute("data-vp-open-preview") || "";
        state.modalTitle = openPreview.getAttribute("data-vp-open-title") || "Full preview";
        render();
        return;
      }
      const select = event.target.closest("[data-vp-select]");
      if (select && !event.target.closest("[data-vp-open-preview], a[data-vp-preview-url], [data-vp-close-modal]")) {
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
        return;
      }
      if (event.target.closest("[data-vp-generate]")) {
        const card = selectedCard();
        if (!card || !card.canGenerate) return;
        void run(async () => {
          const data = await api("generate", { id: card.id, confirmGenerate: true });
          state.cards = state.cards.map((item) => (item.id === data.card.id ? data.card : item));
          state.message = "Generated one preview for this approved brief. Review it below. Attachment remains blocked.";
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
    void run(refreshList);
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
