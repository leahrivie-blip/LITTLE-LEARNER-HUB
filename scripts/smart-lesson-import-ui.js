/**
 * Phase 2 Smart Import admin UI — workflow hub, review, bulk table, assistant.
 * Mounts into Play-Based Lessons via LLHSmartLessonImportUi.
 */
(function smartLessonImportUiModule() {
  "use strict";

  const WORKFLOWS = [
    { id: "create-one", label: "Create One Lesson Plan", blurb: "Start a blank plan in the guided editor." },
    { id: "import-multiple", label: "Import Multiple Lesson Plans", blurb: "Paste one or many plans in everyday language." },
    { id: "create-monthly", label: "Create Monthly Curriculum", blurb: "Jump to Monthly Curriculums builder." },
    { id: "import-into-existing", label: "Import Into Existing Curriculum", blurb: "Import plans and assign them to week slots." },
    { id: "continue-draft", label: "Continue Draft", blurb: "Restore your last unfinished smart import." },
  ];

  const ASSISTANT_PROMPTS = [
    "Fill in the missing math activities.",
    "Make this more play-based.",
    "Add adaptations for younger toddlers.",
    "Create stronger observation opportunities.",
    "Turn this into a preschool plan.",
    "Create an infant version.",
    "Add this to October Preschool Curriculum.",
    "Separate this into four weekly lesson plans.",
    "Fix the materials so nothing is missing.",
    "Generate books and songs for each day.",
    "Make all activities include complete directions.",
  ];

  let state = {
    workflow: "hub", // hub | paste | review | bulk
    intent: "import-multiple",
    pasteText: "",
    reviews: [],
    selectedReviewId: "",
    assistantInput: "",
    assistantChanges: [],
    undoStack: [],
    dirty: false,
    message: "",
    messageSuccess: false,
    curriculumMode: "standalone",
    existingSeriesId: "",
    newSeries: {
      title: "",
      month: "October",
      season: "Fall",
      age: "Preschool",
      weekCount: 4,
      plan: "Free",
    },
    saving: false,
  };

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function engine() {
    return globalThis.LlhSmartLessonImport || null;
  }

  function pushUndo() {
    state.undoStack.push(JSON.stringify({
      reviews: state.reviews,
      pasteText: state.pasteText,
      workflow: state.workflow,
    }));
    if (state.undoStack.length > 15) state.undoStack.shift();
  }

  function undoLast() {
    const raw = state.undoStack.pop();
    if (!raw) {
      state.message = "Nothing to undo.";
      state.messageSuccess = false;
      return;
    }
    try {
      const snap = JSON.parse(raw);
      state.reviews = snap.reviews || [];
      state.pasteText = snap.pasteText || state.pasteText;
      state.workflow = snap.workflow || state.workflow;
      state.message = "Undid the last change.";
      state.messageSuccess = true;
      persist();
    } catch {
      state.message = "Could not undo.";
      state.messageSuccess = false;
    }
  }

  function persist() {
    const api = engine();
    if (!api) return;
    state.dirty = true;
    api.saveDraftSession({
      workflow: state.workflow,
      intent: state.intent,
      pasteText: state.pasteText,
      reviews: state.reviews,
      curriculumMode: state.curriculumMode,
      existingSeriesId: state.existingSeriesId,
      newSeries: state.newSeries,
      assistantChanges: state.assistantChanges,
    });
  }

  function statusBadge(status) {
    const map = {
      complete: ["Complete", "smart-import-status is-complete"],
      "ai-suggested": ["AI suggested", "smart-import-status is-ai"],
      "needs-review": ["Needs review", "smart-import-status is-review"],
      missing: ["Missing required", "smart-import-status is-missing"],
      ready: ["Ready", "smart-import-status is-complete"],
      "failed-partial": ["Partial import", "smart-import-status is-review"],
      mapped: ["Cover ready", "smart-import-status is-complete"],
    };
    const [label, cls] = map[status] || [status, "smart-import-status"];
    return `<span class="${cls}">${esc(label)}</span>`;
  }

  function seriesOptionsHtml() {
    const series = globalThis.siteContent?.curriculum?.series
      || globalThis.adminSiteContent?.curriculum?.series
      || [];
    const list = Array.isArray(series) ? series : [];
    if (!list.length) return `<option value="">No monthly curriculums yet</option>`;
    return [
      `<option value="">Select curriculum…</option>`,
      ...list.map((item) => `<option value="${esc(item.id)}" ${state.existingSeriesId === item.id ? "selected" : ""}>${esc(item.title || item.id)} (${esc(item.age || "")})</option>`),
    ].join("");
  }

  function renderHub() {
    const draft = engine()?.loadDraftSession?.();
    const history = engine()?.loadImportHistory?.() || [];
    return `
      <section class="smart-import-hub" aria-label="Lesson plan workflows">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Smart Import</p>
            <h3>How do you want to work today?</h3>
            <p class="muted-copy">Paste lesson plans in everyday language, review suggestions, then save drafts or publish. You should spend time reviewing — not retyping fields.</p>
          </div>
        </div>
        <div class="smart-import-workflow-grid">
          ${WORKFLOWS.map((item) => `
            <button type="button" class="smart-import-workflow-card" data-smart-workflow="${item.id}">
              <strong>${esc(item.label)}</strong>
              <span>${esc(item.blurb)}</span>
              ${item.id === "continue-draft" && draft ? `<em>Draft saved ${esc(new Date(draft.savedAt || Date.now()).toLocaleString())}</em>` : ""}
            </button>
          `).join("")}
        </div>
        ${history.length ? `
          <details class="smart-import-history">
            <summary>Import history (${history.length})</summary>
            <ul>
              ${history.slice(0, 8).map((entry) => `
                <li>
                  <strong>${esc(entry.title || "Import")}</strong>
                  <span class="muted-copy">${esc(entry.at || "")} · ${esc(String(entry.count || 0))} plan(s) · ${esc(entry.result || "")}</span>
                </li>
              `).join("")}
            </ul>
          </details>
        ` : ""}
      </section>
    `;
  }

  function renderPaste() {
    const api = engine();
    return `
      <section class="smart-import-paste-layout">
        <div class="smart-import-paste-main">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Step 1 · Import and organize</p>
              <h3>Paste lesson plan(s)</h3>
              <p class="muted-copy">One large box for everyday language. Paste a single week or several plans at once — the importer separates them and maps fields automatically.</p>
            </div>
            <button type="button" class="ghost-button" data-smart-back-hub>← All workflows</button>
          </div>
          <label class="smart-import-paste-label">
            <span class="visually-hidden">Lesson plan paste</span>
            <textarea id="smartImportPasteText" rows="18" placeholder="Example:&#10;Preschool Apple Week&#10;Focus on counting, colors, fine motor, science, and vocabulary.&#10;Monday: Apple investigation&#10;Tuesday: Apple counting&#10;Wednesday: Apple painting&#10;Thursday: Taste test&#10;Friday: Apple pie dramatic play">${esc(state.pasteText)}</textarea>
          </label>
          <div class="smart-import-curriculum-box">
            <h4>Curriculum organization</h4>
            <div class="smart-import-radio-row">
              ${[
                ["standalone", "Standalone weekly lesson plan"],
                ["existing", "Add to existing monthly curriculum"],
                ["new", "Create a new monthly curriculum"],
                ["unassigned", "Save as an unassigned draft"],
              ].map(([value, label]) => `
                <label class="admin-inline-toggle">
                  <input type="radio" name="smartImportCurriculumMode" value="${value}" ${state.curriculumMode === value ? "checked" : ""} data-smart-curriculum-mode />
                  <span>${label}</span>
                </label>
              `).join("")}
            </div>
            ${state.curriculumMode === "existing" ? `
              <label>Existing curriculum
                <select data-smart-existing-series>${seriesOptionsHtml()}</select>
              </label>
            ` : ""}
            ${state.curriculumMode === "new" ? `
              <div class="form-grid-two">
                <label>Curriculum name<input data-smart-new-series-title value="${esc(state.newSeries.title)}" placeholder="October Preschool Curriculum" /></label>
                <label>Age group<input data-smart-new-series-age value="${esc(state.newSeries.age)}" /></label>
                <label>Month<input data-smart-new-series-month value="${esc(state.newSeries.month)}" /></label>
                <label>Season<input data-smart-new-series-season value="${esc(state.newSeries.season)}" /></label>
                <label>Weeks
                  <select data-smart-new-series-weeks>
                    ${[4, 5].map((n) => `<option value="${n}" ${Number(state.newSeries.weekCount) === n ? "selected" : ""}>${n}</option>`).join("")}
                  </select>
                </label>
                <label>Free / Pro
                  <select data-smart-new-series-plan>
                    ${["Free", "Pro"].map((p) => `<option ${state.newSeries.plan === p ? "selected" : ""}>${p}</option>`).join("")}
                  </select>
                </label>
              </div>
            ` : ""}
          </div>
          <div class="account-actions-row">
            <button type="button" class="primary-button" data-smart-run-import>Import and organize</button>
            <button type="button" class="ghost-button" data-smart-clear-paste>Clear</button>
          </div>
          <p class="form-message ${state.messageSuccess ? "success" : ""}" data-smart-message>${esc(state.message)}</p>
        </div>
        <aside class="smart-import-assistant" aria-label="Import Assistant">
          <h4>Import Assistant</h4>
          <p class="muted-copy">Ask for help after you import. Commands update the draft and list exactly what changed.</p>
          <div class="smart-import-assistant-prompts">
            ${ASSISTANT_PROMPTS.map((prompt) => `
              <button type="button" class="ghost-button smart-import-chip" data-smart-assistant-prompt="${esc(prompt)}">${esc(prompt)}</button>
            `).join("")}
          </div>
          <label>Custom command
            <textarea rows="3" data-smart-assistant-input placeholder="Tell the assistant what to fix…">${esc(state.assistantInput)}</textarea>
          </label>
          <button type="button" class="primary-button" data-smart-assistant-run ${state.reviews.length ? "" : "disabled"}>Run assistant</button>
          ${state.assistantChanges.length ? `
            <div class="smart-import-assistant-log">
              <strong>What changed</strong>
              <ul>${state.assistantChanges.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
            </div>
          ` : ""}
        </aside>
      </section>
    `;
  }

  function selectedReview() {
    return state.reviews.find((r) => r.id === state.selectedReviewId) || state.reviews[0] || null;
  }

  function renderReviewDetail(review) {
    if (!review) return `<div class="empty-state">Import plans to review them here.</div>`;
    const plan = review.plan || {};
    return `
      <div class="smart-import-review-detail" data-smart-review-id="${esc(review.id)}">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Step 2 · Review before saving</p>
            <h3>${esc(plan.title || "Untitled plan")}</h3>
            <p class="muted-copy">${esc(plan.age || "")} · ${esc(plan.theme || "")} · ${review.dayCount} days · ${review.activityCount} activities · ${statusBadge(review.importStatus)}</p>
          </div>
        </div>
        <div class="smart-import-field-status-grid">
          ${(review.fieldStatuses || []).map((field) => `
            <div class="smart-import-field-chip ${field.status}">
              <strong>${esc(field.label)}</strong>
              ${statusBadge(field.status)}
            </div>
          `).join("")}
        </div>
        <div class="form-grid-two smart-import-edit-grid">
          <label>Title<input data-smart-field="title" value="${esc(plan.title || "")}" /></label>
          <label>Age group<input data-smart-field="age" value="${esc(plan.age || "")}" /></label>
          <label>Theme<input data-smart-field="theme" value="${esc(plan.theme || "")}" /></label>
          <label>Free / Pro
            <select data-smart-field="plan">
              ${["Free", "Pro"].map((p) => `<option ${plan.plan === p ? "selected" : ""}>${p}</option>`).join("")}
            </select>
          </label>
          <label>Primary collection
            <select data-smart-field="primaryCollection">
              ${(engine()?.PRIMARY_COLLECTIONS || []).map((c) => `<option ${plan.primaryCollection === c ? "selected" : ""}>${esc(c)}</option>`).join("")}
            </select>
          </label>
          <label>Tags<input data-smart-field="tags" value="${esc((plan.tags || review.tags || []).join(", "))}" placeholder="Math, Literacy, Seasonal" /></label>
        </div>
        <label>Weekly overview<textarea rows="2" data-smart-field="weeklyOverview">${esc(plan.weeklyOverview || "")}</textarea></label>
        <label>Learning objectives<textarea rows="2" data-smart-field="objectives">${esc(plan.objectives || "")}</textarea></label>
        <label>Materials<textarea rows="2" data-smart-field="weeklyMaterials">${esc(plan.weeklyMaterials || "")}</textarea></label>
        <label>Learning domains<input data-smart-field="learningDomains" value="${esc((plan.learningDomains || []).join(", "))}" /></label>
        <label>Vocabulary<textarea rows="2" data-smart-field="vocabularyWords">${esc(plan.vocabularyWords || "")}</textarea></label>
        <label>Family connection<textarea rows="2" data-smart-field="familyConnection">${esc(plan.familyConnection || "")}</textarea></label>
        <label>Observations<textarea rows="2" data-smart-field="observationOpportunities">${esc(plan.observationOpportunities || "")}</textarea></label>
        <label>Adaptations<textarea rows="2" data-smart-field="adaptations">${esc(plan.adaptations || "")}</textarea></label>
        <div class="smart-import-day-summary">
          <h4>Monday–Friday snapshot</h4>
          <ul>
            ${["monday", "tuesday", "wednesday", "thursday", "friday"].map((day) => {
              const items = plan.dailyPlans?.[day]?.items || [];
              return `<li><strong>${esc(day)}</strong>: ${items.length ? items.map((item) => esc(item.title || "Activity")).join(", ") : "<em>missing</em>"}</li>`;
            }).join("")}
          </ul>
        </div>
        ${(review.suggestions || []).length ? `
          <div class="smart-import-suggestions">
            <h4>Suggestions to approve</h4>
            <p class="muted-copy">AI-added information is never published until you accept it.</p>
            ${(review.suggestions || []).map((suggestion, index) => `
              <label class="smart-import-suggestion-row">
                <input type="checkbox" data-smart-accept-suggestion="${index}" ${suggestion.accepted ? "checked" : ""} />
                <span>
                  <strong>${esc(suggestion.field)}</strong> — ${esc(suggestion.reason || "")}
                  <em>${esc(typeof suggestion.value === "string" ? suggestion.value : JSON.stringify(suggestion.value))}</em>
                </span>
              </label>
            `).join("")}
            <button type="button" class="ghost-button" data-smart-accept-all>Accept all suggestions</button>
          </div>
        ` : ""}
        ${(review.publishErrors || []).length ? `
          <div class="access-notice" role="status">
            <strong>Before publishing:</strong>
            <ul>${review.publishErrors.map((err) => `<li>${esc(err)}</li>`).join("")}</ul>
            <p class="muted-copy">Draft saves are always allowed.</p>
          </div>
        ` : `<p class="form-message success">Ready to publish (after cover generation if needed).</p>`}
        <div class="account-actions-row">
          <label>Curriculum week
            <select data-smart-week-number>
              <option value="0">Unassigned</option>
              ${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${Number(review.curriculumAssignment?.weekNumber) === n ? "selected" : ""}>Week ${n}</option>`).join("")}
            </select>
          </label>
          <button type="button" class="ghost-button" data-smart-open-manual>Open in full editor</button>
        </div>
      </div>
    `;
  }

  function renderBulk() {
    const api = engine();
    return `
      <section class="smart-import-bulk">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Bulk review</p>
            <h3>${state.reviews.length} lesson plan${state.reviews.length === 1 ? "" : "s"} organized</h3>
            <p class="muted-copy">Select rows for bulk actions, then save drafts or publish. Nothing AI-suggested is saved until you accept it.</p>
          </div>
          <div class="account-actions-row">
            <button type="button" class="ghost-button" data-smart-back-paste>← Edit paste</button>
            <button type="button" class="ghost-button" data-smart-undo>Undo last AI change</button>
          </div>
        </div>
        <div class="smart-import-bulk-actions">
          <button type="button" class="ghost-button" data-smart-bulk="set-age" data-age="Preschool">Set Preschool</button>
          <button type="button" class="ghost-button" data-smart-bulk="set-age" data-age="Toddler">Set Toddler</button>
          <button type="button" class="ghost-button" data-smart-bulk="set-plan" data-plan="Free">Set Free</button>
          <button type="button" class="ghost-button" data-smart-bulk="set-plan" data-plan="Pro">Set Pro</button>
          <button type="button" class="ghost-button" data-smart-bulk="set-status" data-status="draft">Set Draft</button>
          <button type="button" class="ghost-button" data-smart-bulk="set-status" data-status="published">Set Published</button>
          <button type="button" class="ghost-button" data-smart-bulk="generate-covers">Generate cartoon covers</button>
          <button type="button" class="ghost-button" data-smart-bulk="accept-all-suggestions">Accept suggestions</button>
          <button type="button" class="ghost-button" data-smart-bulk="duplicate-age" data-age="Toddler">Duplicate for Toddler</button>
          <button type="button" class="ghost-button" data-smart-bulk="delete">Delete selected drafts</button>
        </div>
        <div class="smart-import-bulk-layout">
          <div class="smart-import-table-wrap">
            <table class="smart-import-table">
              <thead>
                <tr>
                  <th><input type="checkbox" data-smart-select-all ${state.reviews.every((r) => r.selected) ? "checked" : ""} /></th>
                  <th>Title</th>
                  <th>Age</th>
                  <th>Theme</th>
                  <th>Days</th>
                  <th>Activities</th>
                  <th>Status</th>
                  <th>Access</th>
                  <th>Publish</th>
                  <th>Curriculum</th>
                  <th>Cover</th>
                </tr>
              </thead>
              <tbody>
                ${state.reviews.map((review) => `
                  <tr class="${state.selectedReviewId === review.id ? "is-active" : ""}" data-smart-select-row="${esc(review.id)}">
                    <td><input type="checkbox" data-smart-row-select="${esc(review.id)}" ${review.selected ? "checked" : ""} /></td>
                    <td><button type="button" class="linkish" data-smart-focus-review="${esc(review.id)}">${esc(review.plan?.title || "Untitled")}</button></td>
                    <td>${esc(review.plan?.age || "")}</td>
                    <td>${esc(review.plan?.theme || "")}</td>
                    <td>${review.dayCount}</td>
                    <td>${review.activityCount}</td>
                    <td>${statusBadge(review.importStatus)}</td>
                    <td>${esc(review.plan?.plan || "Free")}</td>
                    <td>${esc(review.status || "draft")}</td>
                    <td>${esc(review.curriculumAssignment?.mode || state.curriculumMode)}${review.curriculumAssignment?.weekNumber ? ` · W${review.curriculumAssignment.weekNumber}` : ""}</td>
                    <td>${statusBadge(review.coverStatus || "missing")}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
          ${renderReviewDetail(selectedReview())}
        </div>
        <aside class="smart-import-assistant smart-import-assistant-inline" aria-label="Import Assistant">
          <h4>Import Assistant</h4>
          <div class="smart-import-assistant-prompts">
            ${ASSISTANT_PROMPTS.slice(0, 6).map((prompt) => `
              <button type="button" class="ghost-button smart-import-chip" data-smart-assistant-prompt="${esc(prompt)}">${esc(prompt)}</button>
            `).join("")}
          </div>
          <label>Command<textarea rows="2" data-smart-assistant-input>${esc(state.assistantInput)}</textarea></label>
          <button type="button" class="primary-button" data-smart-assistant-run>Run assistant</button>
          ${state.assistantChanges.length ? `<ul class="smart-import-assistant-log">${state.assistantChanges.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}
        </aside>
        <div class="account-actions-row smart-import-save-row">
          <button type="button" class="primary-button" data-smart-save-drafts ${state.saving ? "disabled" : ""}>${state.saving ? "Saving…" : "Save selected as drafts"}</button>
          <button type="button" class="ghost-button" data-smart-save-publish ${state.saving ? "disabled" : ""}>Save &amp; publish ready plans</button>
          <button type="button" class="ghost-button" data-smart-back-hub>Done / back to hub</button>
        </div>
        <p class="form-message ${state.messageSuccess ? "success" : ""}" data-smart-message>${esc(state.message)}</p>
        <p class="muted-copy">Collections available: ${(api?.PRIMARY_COLLECTIONS || []).slice(0, 6).join(" · ")}…</p>
      </section>
    `;
  }

  function renderPanel() {
    if (state.workflow === "paste") return renderPaste();
    if (state.workflow === "review" || state.workflow === "bulk") return renderBulk();
    return renderHub();
  }

  function readPasteExtras(root) {
    const mode = root.querySelector("[data-smart-curriculum-mode]:checked")?.value;
    if (mode) state.curriculumMode = mode;
    state.existingSeriesId = root.querySelector("[data-smart-existing-series]")?.value || state.existingSeriesId;
    state.newSeries = {
      title: root.querySelector("[data-smart-new-series-title]")?.value || state.newSeries.title,
      age: root.querySelector("[data-smart-new-series-age]")?.value || state.newSeries.age,
      month: root.querySelector("[data-smart-new-series-month]")?.value || state.newSeries.month,
      season: root.querySelector("[data-smart-new-series-season]")?.value || state.newSeries.season,
      weekCount: Number(root.querySelector("[data-smart-new-series-weeks]")?.value || state.newSeries.weekCount) || 4,
      plan: root.querySelector("[data-smart-new-series-plan]")?.value || state.newSeries.plan,
    };
    state.pasteText = root.querySelector("#smartImportPasteText")?.value || state.pasteText;
    state.assistantInput = root.querySelector("[data-smart-assistant-input]")?.value || state.assistantInput;
  }

  function syncReviewFieldsFromDom(root) {
    const review = selectedReview();
    if (!review || !root) return;
    const plan = { ...review.plan };
    root.querySelectorAll("[data-smart-field]").forEach((input) => {
      const key = input.getAttribute("data-smart-field");
      if (!key) return;
      if (key === "learningDomains" || key === "tags") {
        plan[key] = String(input.value || "").split(",").map((s) => s.trim()).filter(Boolean);
      } else {
        plan[key] = input.value;
      }
    });
    const weekNumber = Number(root.querySelector("[data-smart-week-number]")?.value || 0);
    review.plan = plan;
    review.tags = plan.tags || review.tags;
    review.primaryCollection = plan.primaryCollection;
    review.curriculumAssignment = {
      ...(review.curriculumAssignment || {}),
      mode: state.curriculumMode,
      seriesId: state.existingSeriesId,
      weekNumber,
      newSeries: state.newSeries,
    };
    root.querySelectorAll("[data-smart-accept-suggestion]").forEach((box) => {
      const index = Number(box.getAttribute("data-smart-accept-suggestion"));
      if (review.suggestions?.[index]) review.suggestions[index].accepted = box.checked;
    });
    const api = engine();
    if (api) {
      const withAccepted = api.applyAcceptedSuggestions(review.plan, review.suggestions || []);
      review.plan = withAccepted;
      const rebuilt = api.buildReviewModel({ data: withAccepted, warnings: review.warnings, errors: review.errors }, {
        suggestions: review.suggestions,
        tags: review.tags,
        primaryCollection: review.primaryCollection,
        curriculumAssignment: review.curriculumAssignment,
      });
      Object.assign(review, rebuilt, {
        id: review.id,
        index: review.index,
        sourceText: review.sourceText,
        selected: review.selected,
        status: review.status,
        planTier: review.plan?.plan,
      });
    }
  }

  function runImport() {
    const api = engine();
    if (!api) {
      state.message = "Smart import engine is not loaded.";
      state.messageSuccess = false;
      return;
    }
    const text = state.pasteText.trim();
    if (!text) {
      state.message = "Paste at least one lesson plan first.";
      state.messageSuccess = false;
      return;
    }
    pushUndo();
    const existingTitles = (typeof curriculumLessonPlansForAdmin === "function"
      ? curriculumLessonPlansForAdmin()
      : []).map((plan) => plan.title);
    const result = api.importSmartPaste(text, { existingTitles, mode: "v5" });
    state.reviews = (result.reviews || []).map((review, index) => ({
      ...review,
      curriculumAssignment: {
        mode: state.curriculumMode,
        seriesId: state.existingSeriesId,
        weekNumber: state.curriculumMode === "standalone" || state.curriculumMode === "unassigned" ? 0 : (index + 1),
        newSeries: state.newSeries,
      },
      status: "draft",
    }));
    state.selectedReviewId = state.reviews[0]?.id || "";
    state.workflow = "bulk";
    state.message = result.ok
      ? `Organized ${result.chunkCount} lesson plan${result.chunkCount === 1 ? "" : "s"}. Review suggestions before saving.`
      : "Import partially understood — review what was captured.";
    state.messageSuccess = Boolean(result.ok);
    api.pushImportHistory({
      title: state.reviews[0]?.plan?.title || "Smart import",
      count: state.reviews.length,
      result: state.messageSuccess ? "organized" : "partial",
    });
    persist();
  }

  function runAssistant(command) {
    const api = engine();
    if (!api) return;
    const cmd = String(command || state.assistantInput || "").trim();
    if (!cmd) return;
    if (!state.reviews.length) {
      state.message = "Import plans before using the assistant.";
      state.messageSuccess = false;
      return;
    }
    pushUndo();
    syncReviewFieldsFromDom(document.querySelector(".smart-import-review-detail"));
    const result = api.runAssistantCommand(cmd, state.reviews, {
      seriesId: state.existingSeriesId,
    });
    state.reviews = result.reviews;
    state.assistantChanges = result.changes || [];
    state.assistantInput = "";
    state.message = state.assistantChanges.join(" ") || "Assistant finished.";
    state.messageSuccess = true;
    persist();
  }

  async function saveReviews({ publishReady = false } = {}) {
    if (state.saving) return;
    syncReviewFieldsFromDom(document.querySelector(".smart-import-review-detail"));
    const selected = state.reviews.filter((r) => r.selected);
    const targets = selected.length ? selected : state.reviews;
    if (!targets.length) {
      state.message = "No plans to save.";
      state.messageSuccess = false;
      rerender();
      return;
    }
    if (typeof saveAdminCurriculumLessonPlanRecord !== "function" && typeof saveAdminCurriculumLessonPlanForm !== "function") {
      // Fallback path used in tests / partial loads: stash into import draft for manual editor.
      const first = targets[0];
      if (typeof openAdminCurriculumLessonEditor === "function") {
        const id = first.plan.id || `cur-lp-${Date.now().toString(16)}`;
        globalThis.adminCurriculumLessonImportDraft = {
          ...first.plan,
          id,
          status: publishReady && !(first.publishErrors || []).length ? "published" : "draft",
        };
        openAdminCurriculumLessonEditor(id, { scroll: true });
        state.message = "Opened the first plan in the editor. Save from there, then return for the rest.";
        state.messageSuccess = true;
        rerender();
        return;
      }
      state.message = "Save API is not available.";
      state.messageSuccess = false;
      rerender();
      return;
    }

    state.saving = true;
    rerender();
    let saved = 0;
    let failed = 0;
    const savedIds = [];
    for (const review of targets) {
      try {
        const api = engine();
        let plan = api.applyAcceptedSuggestions(review.plan, review.suggestions || []);
        if (!plan.coverImageUrl && api) {
          const withCover = api.applyBulkAction([review], "generate-covers")[0];
          plan = withCover.plan;
          review.coverStatus = withCover.coverStatus;
        }
        const publishErrors = api.validateForPublish(plan);
        const wantsPublish = publishReady && review.status === "published";
        if (wantsPublish && publishErrors.length) {
          failed += 1;
          review.importStatus = "needs-review";
          review.publishErrors = publishErrors;
          continue;
        }
        const id = plan.id || `cur-lp-${Date.now().toString(16)}${Math.random().toString(16).slice(2, 8)}`;
        const payload = {
          ...plan,
          id,
          status: wantsPublish ? "published" : "draft",
          tags: plan.tags || review.tags || [],
          primaryCollection: plan.primaryCollection || review.primaryCollection || "",
        };
        if (typeof saveAdminCurriculumLessonPlanRecord === "function") {
          await saveAdminCurriculumLessonPlanRecord(payload);
        } else {
          globalThis.adminCurriculumLessonImportDraft = payload;
          openAdminCurriculumLessonEditor(id, { scroll: false });
          const form = document.querySelector("#adminCurriculumLessonPlanForm");
          if (form) await saveAdminCurriculumLessonPlanForm(form);
        }
        savedIds.push({ id, weekNumber: review.curriculumAssignment?.weekNumber || 0, review });
        saved += 1;
      } catch (error) {
        failed += 1;
        review.importStatus = "needs-review";
        review.errors = [...(review.errors || []), error.message || "Save failed"];
      }
    }

    // Curriculum assignment (best-effort) for new/existing series.
    try {
      await assignSavedToCurriculum(savedIds);
    } catch (error) {
      state.message = `Saved ${saved} plan(s), but curriculum assignment needs review: ${error.message}`;
      state.messageSuccess = false;
      state.saving = false;
      persist();
      rerender();
      return;
    }

    state.saving = false;
    state.message = failed
      ? `Saved ${saved} plan(s). ${failed} still need review — partial progress was kept.`
      : `Saved ${saved} lesson plan${saved === 1 ? "" : "s"} as ${publishReady ? "published where ready / drafts otherwise" : "drafts"}.`;
    state.messageSuccess = failed === 0;
    if (failed === 0) {
      engine()?.clearDraftSession?.();
      state.dirty = false;
    } else {
      persist();
    }
    rerender();
    if (typeof renderAdminCurriculumLessonPlanManager === "function") {
      // Keep smart import panel mounted with message; list refreshes underneath via host re-render hook.
    }
  }

  async function assignSavedToCurriculum(savedIds) {
    if (!savedIds.length) return;
    if (state.curriculumMode === "standalone" || state.curriculumMode === "unassigned") return;
    const seriesApi = globalThis.LLHMonthlyCurriculumPhase1;
    if (!seriesApi?.saveSeries && typeof fetch !== "function") return;

    // Prefer using existing Phase 1 client helpers when present via site content mutation.
    if (state.curriculumMode === "existing" && state.existingSeriesId) {
      const seriesList = globalThis.siteContent?.curriculum?.series || [];
      const series = seriesList.find((item) => item.id === state.existingSeriesId);
      if (!series) return;
      const weeks = [...(series.weeks || [])];
      savedIds.forEach(({ id, weekNumber }) => {
        if (!weekNumber) return;
        const slot = weeks.find((w) => Number(w.weekNumber) === Number(weekNumber));
        if (slot) slot.lessonPlanId = id;
        else weeks.push({ weekNumber, lessonPlanId: id, displayOrder: weekNumber });
      });
      if (typeof seriesApi.saveSeriesDirect === "function") {
        await seriesApi.saveSeriesDirect({ ...series, weeks });
      }
      return;
    }

    if (state.curriculumMode === "new") {
      // Stash intent for Phase 1 builder; auto-create when helper exists.
      if (typeof seriesApi?.createSeriesFromImport === "function") {
        await seriesApi.createSeriesFromImport({
          ...state.newSeries,
          weeks: savedIds
            .filter((item) => item.weekNumber)
            .map((item) => ({ weekNumber: item.weekNumber, lessonPlanId: item.id, displayOrder: item.weekNumber })),
        });
      }
    }
  }

  function chooseWorkflow(id) {
    state.intent = id;
    if (id === "create-one") {
      if (typeof createAdminCurriculumLessonPlan === "function") createAdminCurriculumLessonPlan();
      state.workflow = "hub";
      return;
    }
    if (id === "create-monthly") {
      if (typeof setAdminSectionTab === "function") setAdminSectionTab("curriculum-series");
      state.workflow = "hub";
      return;
    }
    if (id === "continue-draft") {
      const draft = engine()?.loadDraftSession?.();
      if (!draft) {
        state.message = "No saved smart-import draft found.";
        state.messageSuccess = false;
        state.workflow = "hub";
        return;
      }
      state.workflow = draft.workflow === "hub" ? "paste" : (draft.workflow || "paste");
      state.intent = draft.intent || "import-multiple";
      state.pasteText = draft.pasteText || "";
      state.reviews = draft.reviews || [];
      state.curriculumMode = draft.curriculumMode || "standalone";
      state.existingSeriesId = draft.existingSeriesId || "";
      state.newSeries = draft.newSeries || state.newSeries;
      state.assistantChanges = draft.assistantChanges || [];
      state.selectedReviewId = state.reviews[0]?.id || "";
      state.message = "Restored your unfinished import.";
      state.messageSuccess = true;
      return;
    }
    if (id === "import-into-existing") {
      state.curriculumMode = "existing";
    } else {
      state.curriculumMode = state.curriculumMode === "existing" ? "standalone" : state.curriculumMode;
    }
    state.workflow = "paste";
    state.message = "";
  }

  function rerender() {
    const host = document.querySelector("#smartLessonImportApp");
    if (!host) return;
    host.innerHTML = renderPanel();
  }

  function onClick(event) {
    const workflowBtn = event.target.closest("[data-smart-workflow]");
    if (workflowBtn) {
      chooseWorkflow(workflowBtn.getAttribute("data-smart-workflow"));
      rerender();
      return;
    }
    if (event.target.closest("[data-smart-back-hub]")) {
      if (state.dirty && state.reviews.length && !window.confirm("Leave smart import? Your draft is autosaved and can be restored with Continue Draft.")) {
        return;
      }
      state.workflow = "hub";
      rerender();
      return;
    }
    if (event.target.closest("[data-smart-back-paste]")) {
      syncReviewFieldsFromDom(document.querySelector(".smart-import-review-detail"));
      state.workflow = "paste";
      rerender();
      return;
    }
    if (event.target.closest("[data-smart-clear-paste]")) {
      state.pasteText = "";
      rerender();
      return;
    }
    if (event.target.closest("[data-smart-run-import]")) {
      readPasteExtras(document.querySelector(".smart-import-paste-layout") || document);
      runImport();
      rerender();
      return;
    }
    if (event.target.closest("[data-smart-undo]")) {
      undoLast();
      rerender();
      return;
    }
    const promptBtn = event.target.closest("[data-smart-assistant-prompt]");
    if (promptBtn) {
      state.assistantInput = promptBtn.getAttribute("data-smart-assistant-prompt") || "";
      runAssistant(state.assistantInput);
      rerender();
      return;
    }
    if (event.target.closest("[data-smart-assistant-run]")) {
      const root = event.target.closest("aside") || document;
      state.assistantInput = root.querySelector("[data-smart-assistant-input]")?.value || state.assistantInput;
      runAssistant(state.assistantInput);
      rerender();
      return;
    }
    const bulkBtn = event.target.closest("[data-smart-bulk]");
    if (bulkBtn) {
      const api = engine();
      if (!api) return;
      pushUndo();
      const action = bulkBtn.getAttribute("data-smart-bulk");
      state.reviews = api.applyBulkAction(state.reviews, action, {
        age: bulkBtn.getAttribute("data-age"),
        plan: bulkBtn.getAttribute("data-plan"),
        status: bulkBtn.getAttribute("data-status"),
      });
      if (!state.reviews.find((r) => r.id === state.selectedReviewId)) {
        state.selectedReviewId = state.reviews[0]?.id || "";
      }
      state.message = `Applied bulk action: ${action}.`;
      state.messageSuccess = true;
      persist();
      rerender();
      return;
    }
    if (event.target.closest("[data-smart-accept-all]")) {
      const api = engine();
      const review = selectedReview();
      if (!api || !review) return;
      pushUndo();
      review.suggestions = (review.suggestions || []).map((s) => ({ ...s, accepted: true }));
      review.plan = api.applyAcceptedSuggestions(review.plan, review.suggestions);
      Object.assign(review, api.buildReviewModel({ data: review.plan }, {
        suggestions: review.suggestions,
        curriculumAssignment: review.curriculumAssignment,
      }), { id: review.id, selected: review.selected, status: review.status, sourceText: review.sourceText, index: review.index });
      persist();
      rerender();
      return;
    }
    const focusBtn = event.target.closest("[data-smart-focus-review]");
    if (focusBtn) {
      syncReviewFieldsFromDom(document.querySelector(".smart-import-review-detail"));
      state.selectedReviewId = focusBtn.getAttribute("data-smart-focus-review");
      rerender();
      return;
    }
    if (event.target.closest("[data-smart-open-manual]")) {
      const review = selectedReview();
      if (!review || typeof openAdminCurriculumLessonEditor !== "function") return;
      syncReviewFieldsFromDom(document.querySelector(".smart-import-review-detail"));
      const id = review.plan.id || `cur-lp-${Date.now().toString(16)}`;
      globalThis.adminCurriculumLessonImportDraft = { ...review.plan, id, status: review.status || "draft" };
      openAdminCurriculumLessonEditor(id, { scroll: true });
      return;
    }
    if (event.target.closest("[data-smart-save-drafts]")) {
      saveReviews({ publishReady: false });
      return;
    }
    if (event.target.closest("[data-smart-save-publish]")) {
      state.reviews = state.reviews.map((r) => (r.selected ? { ...r, status: "published" } : r));
      saveReviews({ publishReady: true });
      return;
    }
  }

  function onChange(event) {
    const selectAll = event.target.closest("[data-smart-select-all]");
    if (selectAll) {
      state.reviews = state.reviews.map((r) => ({ ...r, selected: selectAll.checked }));
      persist();
      return;
    }
    const rowSelect = event.target.closest("[data-smart-row-select]");
    if (rowSelect) {
      const id = rowSelect.getAttribute("data-smart-row-select");
      state.reviews = state.reviews.map((r) => (r.id === id ? { ...r, selected: rowSelect.checked } : r));
      persist();
      return;
    }
    if (event.target.matches("[data-smart-curriculum-mode]")) {
      state.curriculumMode = event.target.value;
      persist();
      rerender();
      return;
    }
    if (event.target.matches("#smartImportPasteText")
      || event.target.matches("[data-smart-field]")
      || event.target.matches("[data-smart-assistant-input]")
      || event.target.matches("[data-smart-week-number]")
      || event.target.matches("[data-smart-accept-suggestion]")
      || event.target.matches("[data-smart-existing-series]")
      || event.target.matches("[data-smart-new-series-title]")
      || event.target.matches("[data-smart-new-series-age]")
      || event.target.matches("[data-smart-new-series-month]")
      || event.target.matches("[data-smart-new-series-season]")
      || event.target.matches("[data-smart-new-series-weeks]")
      || event.target.matches("[data-smart-new-series-plan]")) {
      if (event.target.id === "smartImportPasteText") state.pasteText = event.target.value;
      if (event.target.matches("[data-smart-existing-series]")) state.existingSeriesId = event.target.value;
      readPasteExtras(document.querySelector(".smart-import-paste-layout") || document);
      if (event.target.matches("[data-smart-field]") || event.target.matches("[data-smart-accept-suggestion]") || event.target.matches("[data-smart-week-number]")) {
        syncReviewFieldsFromDom(document.querySelector(".smart-import-review-detail"));
      }
      persist();
    }
  }

  function onBeforeUnload(event) {
    if (!state.dirty || !state.reviews.length) return;
    event.preventDefault();
    event.returnValue = "";
  }

  function mountIntoLessonPlanManager(target) {
    if (!target) return;
    const host = target.querySelector("#smartLessonImportApp");
    if (!host) return;
    host.innerHTML = renderPanel();
  }

  function bindGlobalHandlers() {
    if (globalThis.__llhSmartImportBound) return;
    globalThis.__llhSmartImportBound = true;
    document.addEventListener("click", (event) => {
      if (!event.target.closest("#smartLessonImportApp")) return;
      onClick(event);
    });
    document.addEventListener("change", (event) => {
      if (!event.target.closest("#smartLessonImportApp")) return;
      onChange(event);
    });
    document.addEventListener("input", (event) => {
      if (!event.target.closest("#smartLessonImportApp")) return;
      onChange(event);
    });
    window.addEventListener("beforeunload", onBeforeUnload);
  }

  const uiApi = {
    WORKFLOWS,
    ASSISTANT_PROMPTS,
    getState: () => state,
    setState: (patch) => { state = { ...state, ...patch }; },
    renderPanel,
    mountIntoLessonPlanManager,
    bindGlobalHandlers,
    chooseWorkflow,
    runImport,
    runAssistant,
    saveReviews,
    rerender,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = uiApi;
  }
  if (typeof globalThis !== "undefined") {
    globalThis.LLHSmartLessonImportUi = uiApi;
    uiApi.bindGlobalHandlers();
  }
})();
