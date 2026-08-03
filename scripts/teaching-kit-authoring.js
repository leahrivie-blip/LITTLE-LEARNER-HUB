/**
 * Complete Teaching Kit System — binder authoring helpers (classic lesson editor).
 * Behind featureFlags.teachingKitAuthoring (default false).
 * Does not enable or depend on teachingKitEnrichmentEditor.
 *
 * Browser: globalThis.LLHTeachingKitAuthoring
 * Node: module.exports
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LLHTeachingKitAuthoring = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const SETTING_TAGS = Object.freeze(["small_group", "large_group", "indoor", "outdoor"]);
  const SETTING_LABELS = Object.freeze({
    small_group: "Small group",
    large_group: "Large group",
    indoor: "Indoor",
    outdoor: "Outdoor",
  });

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function isAuthoringEnabled(flags) {
    if (root && root.LLHTeachingKit && typeof root.LLHTeachingKit.isTeachingKitAuthoringEnabled === "function") {
      return root.LLHTeachingKit.isTeachingKitAuthoringEnabled(flags) === true;
    }
    return flags && flags.teachingKitAuthoring === true;
  }

  function linesFromTextarea(value) {
    return text(value)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function settingTagsFromItem(item) {
    return asArray(item?.settingTags)
      .map((tag) => text(tag).toLowerCase().replace(/\s+/g, "_"))
      .filter((tag) => SETTING_TAGS.includes(tag));
  }

  function substitutionsFromItem(item) {
    return asArray(item?.substitutions)
      .filter((sub) => sub && typeof sub === "object")
      .map((sub) => ({
        need: text(sub.need || sub.from),
        use: text(sub.use || sub.to),
      }))
      .filter((sub) => sub.need && sub.use)
      .slice(0, 12);
  }

  function teacherTipsFromItem(item) {
    return asArray(item?.teacherTips).map(text).filter(Boolean).slice(0, 8);
  }

  /**
   * Binder completeness checklist for authoring guidance (never blocks save).
   */
  function buildBinderCompleteness(plan, activities) {
    const acts = asArray(activities).filter((a) => a && a.status !== "archived");
    const fromDaily = [];
    ["monday", "tuesday", "wednesday", "thursday", "friday"].forEach((day) => {
      asArray(plan?.dailyPlans?.[day]?.items).forEach((item) => {
        if (text(item?.title)) fromDaily.push(item);
      });
    });
    const cards = acts.length ? acts : fromDaily;
    const toolkit = plan?.teachingKit?.teacherToolkit || {};
    const checks = [
      { id: "overview", label: "Weekly overview", ready: Boolean(text(plan?.weeklyOverview)) },
      { id: "objectives", label: "Learning objectives", ready: Boolean(text(plan?.objectives)) },
      { id: "daily", label: "Daily lesson plans", ready: cards.length > 0 },
      { id: "materials", label: "Materials", ready: Boolean(text(plan?.weeklyMaterials) || cards.some((c) => text(c.materials))) },
      { id: "prep", label: "Teacher preparation", ready: Boolean(text(toolkit.teacherPreparation) || asArray(toolkit.prepChecklist).length) },
      { id: "setup", label: "Setup instructions", ready: cards.some((c) => text(c.setup)) },
      { id: "tips", label: "Teacher tips", ready: cards.some((c) => teacherTipsFromItem(c).length) },
      { id: "vocabulary", label: "Vocabulary", ready: Boolean(text(plan?.vocabularyWords) || cards.some((c) => text(c.vocabulary))) },
      { id: "observations", label: "Observation prompts", ready: Boolean(text(plan?.observationOpportunities) || cards.some((c) => text(c.observationOpportunities))) },
      { id: "groups", label: "Small / large group options", ready: cards.some((c) => {
        const tags = settingTagsFromItem(c);
        return tags.includes("small_group") || tags.includes("large_group");
      }) },
      { id: "indoor_outdoor", label: "Indoor / outdoor options", ready: cards.some((c) => {
        const tags = settingTagsFromItem(c);
        return tags.includes("indoor") || tags.includes("outdoor")
          || text(c.indoorAlternatives) || text(c.outdoorAlternatives);
      }) },
      { id: "family", label: "Family connection", ready: Boolean(text(plan?.familyConnection)) },
      { id: "printables", label: "Printable resources", ready: asArray(plan?.resourceIds).length > 0 },
      { id: "songs", label: "Songs", ready: asArray(plan?.songs).length > 0 },
      { id: "books", label: "Books", ready: asArray(plan?.books).length > 0 },
      { id: "examples", label: "Example images", ready: cards.some((c) => text(c.exampleImageUrl) || text(c.setupImageUrl)) },
      { id: "toolkit", label: "Teacher toolkit", ready: Boolean(
        asArray(toolkit.prepChecklist).length
        || asArray(toolkit.observationFocus).length
        || text(toolkit.notes)
        || text(toolkit.teacherPreparation),
      ) },
    ];
    const readyCount = checks.filter((c) => c.ready).length;
    const percent = checks.length ? Math.round((readyCount / checks.length) * 100) : 0;
    return {
      checks,
      readyCount,
      total: checks.length,
      percent,
      label: percent >= 90 ? "Complete" : percent >= 50 ? "Enriched" : "Legacy",
    };
  }

  function binderChecklistHtml(plan, activities) {
    const summary = buildBinderCompleteness(plan, activities);
    return `
      <section class="tk-authoring-checklist" data-tk-authoring-checklist>
        <div class="tk-authoring-checklist-head">
          <div>
            <h4>Teaching Kit binder checklist</h4>
            <p class="muted-copy">Guidance only — never blocks saving. Aim for a complete digital teacher binder.</p>
          </div>
          <div class="tk-authoring-checklist-score">
            <strong>${summary.percent}%</strong>
            <span class="tag">${esc(summary.label)}</span>
          </div>
        </div>
        <div class="tk-authoring-bar" aria-hidden="true"><i style="width:${summary.percent}%"></i></div>
        <ul class="tk-authoring-check-list">
          ${summary.checks.map((check) => `
            <li class="${check.ready ? "is-ready" : "is-missing"}">
              <span>${esc(check.label)}</span>
              <strong>${check.ready ? "Ready" : "Missing"}</strong>
            </li>
          `).join("")}
        </ul>
      </section>
    `;
  }

  function teacherToolkitEditorHtml(plan) {
    const toolkit = plan?.teachingKit?.teacherToolkit && typeof plan.teachingKit.teacherToolkit === "object"
      ? plan.teachingKit.teacherToolkit
      : {};
    const prep = asArray(toolkit.prepChecklist).join("\n");
    const focus = asArray(toolkit.observationFocus).join("\n");
    return `
      <details class="admin-fieldset tk-authoring-toolkit" id="admin-lesson-toolkit" open data-tk-authoring-toolkit>
        <summary><strong>Teacher Toolkit</strong></summary>
        <p class="muted-copy">Prep checklist and observation focus for the binder — additive to existing lesson content.</p>
        <label>Teacher preparation
          <textarea name="tkTeacherPreparation" rows="3" placeholder="What teachers should prepare before the week begins">${esc(toolkit.teacherPreparation || "")}</textarea>
        </label>
        <label>Prep checklist (one item per line)
          <textarea name="tkPrepChecklist" rows="4" placeholder="Print animal cards&#10;Set up discovery basket&#10;Prep outdoor sensory bin">${esc(prep)}</textarea>
        </label>
        <label>Observation focus (one item per line)
          <textarea name="tkObservationFocus" rows="3" placeholder="Sorting by attribute&#10;New vocabulary use">${esc(focus)}</textarea>
        </label>
        <label>Toolkit notes
          <textarea name="tkToolkitNotes" rows="2" placeholder="Optional notes for the Teacher Toolkit tab">${esc(toolkit.notes || "")}</textarea>
        </label>
      </details>
    `;
  }

  function activityBinderFieldsHtml(item) {
    const tips = teacherTipsFromItem(item).join("\n");
    const tags = new Set(settingTagsFromItem(item));
    const subs = substitutionsFromItem(item)
      .map((sub) => `${sub.need} → ${sub.use}`)
      .join("\n");
    return `
      <fieldset class="admin-fieldset tk-authoring-activity-binder" data-tk-activity-binder>
        <legend>Teaching Kit binder fields</legend>
        <p class="muted-copy">These fields enrich the activity card for the digital teacher binder. Existing lesson text above stays intact.</p>
        <label>Teacher tips (one per line)
          <textarea rows="2" data-curriculum-teacher-tips placeholder="Invite children to sort by size">${esc(tips)}</textarea>
        </label>
        <label>Supply substitutions (Need → Use, one per line)
          <textarea rows="2" data-curriculum-substitutions placeholder="plastic animals → printed animal cards">${esc(subs)}</textarea>
        </label>
        <fieldset class="admin-fieldset tk-authoring-setting-tags">
          <legend>Group &amp; setting options</legend>
          <div class="tk-authoring-tag-grid">
            ${SETTING_TAGS.map((tag) => `
              <label class="admin-inline-toggle">
                <input type="checkbox" data-curriculum-setting-tag value="${esc(tag)}" ${tags.has(tag) ? "checked" : ""} />
                <span>${esc(SETTING_LABELS[tag] || tag)}</span>
              </label>
            `).join("")}
          </div>
        </fieldset>
        <label>Indoor alternatives
          <textarea rows="2" data-curriculum-indoor-alternatives placeholder="How to run this indoors if weather changes">${esc(item.indoorAlternatives || "")}</textarea>
        </label>
        <label>Outdoor alternatives
          <textarea rows="2" data-curriculum-outdoor-alternatives placeholder="How to expand this outdoors">${esc(item.outdoorAlternatives || "")}</textarea>
        </label>
        <label>Cleanup tips
          <textarea rows="2" data-curriculum-cleanup-tips placeholder="Quick cleanup cues for teachers">${esc(item.cleanupTips || "")}</textarea>
        </label>
        <div class="form-grid-two">
          <label>Setup image URL
            <input type="url" data-curriculum-setup-image-url value="${esc(item.setupImageUrl || "")}" placeholder="https://… or /api/media/…" />
          </label>
          <label>Example image URL
            <input type="url" data-curriculum-example-image-url value="${esc(item.exampleImageUrl || "")}" placeholder="https://… or /api/media/…" />
          </label>
        </div>
        <div class="tk-authoring-ai-row">
          <button type="button" class="ghost-button" data-tk-authoring-ai-activity>Suggest binder tips with AI</button>
          <small class="muted-copy">AI only suggests — nothing replaces existing lesson data until you insert.</small>
        </div>
        <div class="tk-authoring-ai-tray" data-tk-authoring-ai-tray hidden></div>
      </fieldset>
    `;
  }

  function binderJumpLinkHtml() {
    return `<a class="lesson-editor-jump-link" href="#admin-lesson-toolkit" data-admin-lesson-jump="toolkit">Toolkit</a>
      <a class="lesson-editor-jump-link" href="#admin-lesson-binder" data-admin-lesson-jump="binder">Binder</a>`;
  }

  function binderPanelHtml(plan, activities) {
    return `
      <div id="admin-lesson-binder" class="tk-authoring-binder-panel" data-tk-authoring-panel>
        <h4>Complete Teaching Kit binder</h4>
        <p class="muted-copy">Author the full digital teacher binder without leaving the classic lesson editor. The Enrichment Editor flag stays off.</p>
        ${binderChecklistHtml(plan, activities)}
        ${teacherToolkitEditorHtml(plan)}
      </div>
    `;
  }

  function parseSubstitutionsText(value) {
    return linesFromTextarea(value).map((line) => {
      const parts = line.split(/\s*→\s*|\s*->\s*/);
      if (parts.length < 2) return null;
      const need = text(parts[0]);
      const use = text(parts.slice(1).join(" "));
      if (!need || !use) return null;
      return { need, use };
    }).filter(Boolean).slice(0, 12);
  }

  function collectActivityBinderFields(row) {
    if (!row) return {};
    const tips = linesFromTextarea(row.querySelector("[data-curriculum-teacher-tips]")?.value).slice(0, 8);
    const substitutions = parseSubstitutionsText(row.querySelector("[data-curriculum-substitutions]")?.value);
    const settingTags = [...row.querySelectorAll("input[data-curriculum-setting-tag]:checked")]
      .map((input) => text(input.value).toLowerCase().replace(/\s+/g, "_"))
      .filter((tag) => SETTING_TAGS.includes(tag));
    return {
      teacherTips: tips,
      substitutions,
      settingTags,
      indoorAlternatives: text(row.querySelector("[data-curriculum-indoor-alternatives]")?.value),
      outdoorAlternatives: text(row.querySelector("[data-curriculum-outdoor-alternatives]")?.value),
      cleanupTips: text(row.querySelector("[data-curriculum-cleanup-tips]")?.value),
      setupImageUrl: text(row.querySelector("[data-curriculum-setup-image-url]")?.value),
      exampleImageUrl: text(row.querySelector("[data-curriculum-example-image-url]")?.value),
    };
  }

  function collectTeacherToolkitFromForm(form) {
    if (!form) return null;
    const prepEl = form.querySelector('[name="tkPrepChecklist"]');
    const focusEl = form.querySelector('[name="tkObservationFocus"]');
    const notesEl = form.querySelector('[name="tkToolkitNotes"]');
    const prepNotesEl = form.querySelector('[name="tkTeacherPreparation"]');
    if (!prepEl && !focusEl && !notesEl && !prepNotesEl) return null;
    return {
      teacherPreparation: text(prepNotesEl?.value),
      prepChecklist: linesFromTextarea(prepEl?.value).slice(0, 24),
      observationFocus: linesFromTextarea(focusEl?.value).slice(0, 24),
      notes: text(notesEl?.value),
    };
  }

  /**
   * Apply AI suggestions into binder fields without wiping existing values (union / append).
   */
  function applyAiSuggestionsToActivityFields(current, suggestions) {
    const enrich = root && root.LLHTeachingKitEnrichment;
    if (!enrich?.applySuggestionsToDraft) {
      return { item: current, inserted: 0 };
    }
    const draft = {
      activities: {
        current: {
          teacherTips: teacherTipsFromItem(current),
          substitutions: substitutionsFromItem(current),
          settingTags: settingTagsFromItem(current),
          observationPrompts: linesFromTextarea(current.observationOpportunities),
          vocabulary: text(current.vocabulary).split(/[,;\n]+/).map(text).filter(Boolean),
        },
      },
      week: {},
    };
    const accepted = asArray(suggestions).map((sug) => ({
      ...sug,
      decision: "accepted",
      selected: true,
    }));
    const applied = enrich.applySuggestionsToDraft(draft, accepted, { activityKey: "current" });
    const next = applied.draft.activities.current || {};
    return {
      item: {
        ...current,
        teacherTips: asArray(next.teacherTips),
        substitutions: asArray(next.substitutions),
        settingTags: asArray(next.settingTags),
        observationOpportunities: asArray(next.observationPrompts).length
          ? asArray(next.observationPrompts).join("\n")
          : current.observationOpportunities,
        vocabulary: asArray(next.vocabulary).length
          ? asArray(next.vocabulary).join(", ")
          : current.vocabulary,
      },
      inserted: (applied.inserted || []).length,
    };
  }

  return {
    SETTING_TAGS,
    SETTING_LABELS,
    isAuthoringEnabled,
    buildBinderCompleteness,
    binderChecklistHtml,
    teacherToolkitEditorHtml,
    activityBinderFieldsHtml,
    binderJumpLinkHtml,
    binderPanelHtml,
    collectActivityBinderFields,
    collectTeacherToolkitFromForm,
    applyAiSuggestionsToActivityFields,
    teacherTipsFromItem,
    settingTagsFromItem,
    substitutionsFromItem,
  };
});
