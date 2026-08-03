/**
 * Teaching Kit Slice 1E — Print Center / professional binder print HTML.
 * Client print-preview assembly (window.print). Does not bypass trial exports;
 * callers must authorize via existing confirmTrialCurriculumExport first.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.LLHTeachingKitPrint = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const WEEKDAYS = Object.freeze(["monday", "tuesday", "wednesday", "thursday", "friday"]);
  const DAY_LABELS = Object.freeze({
    monday: "Monday",
    tuesday: "Tuesday",
    wednesday: "Wednesday",
    thursday: "Thursday",
    friday: "Friday",
  });

  const PRESETS = Object.freeze([
    Object.freeze({
      id: "today_pack",
      label: "Today’s classroom pack",
      parts: ["cover", "daily", "activities", "songsBooks", "family", "observations"],
      daysMode: "today",
    }),
    Object.freeze({
      id: "monday_setup_pack",
      label: "Monday Morning Setup pack",
      parts: ["cover", "setup", "printables"],
      daysMode: "none",
    }),
    Object.freeze({
      id: "week_binder",
      label: "Week binder",
      parts: ["cover", "setup", "daily", "activities", "songsBooks", "vocabulary", "family", "observations", "printables"],
      daysMode: "all",
      default: true,
    }),
    Object.freeze({
      id: "family_pack",
      label: "Family pack",
      parts: ["cover", "family", "vocabulary", "songsBooks"],
      daysMode: "none",
    }),
  ]);

  const PART_LABELS = Object.freeze({
    cover: "Cover page",
    setup: "Monday Morning Setup",
    daily: "Daily Classroom pages",
    activities: "Activity cards",
    songsBooks: "Songs & Books",
    vocabulary: "Vocabulary",
    family: "Parent connection",
    observations: "Observation prompts",
    printables: "Printables (Used in week)",
  });

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function listHtml(items) {
    const rows = (items || []).map((item) => text(item)).filter(Boolean);
    if (!rows.length) return `<p class="tk-print-muted">None listed</p>`;
    return `<ul class="tk-print-list">${rows.map((row) => `<li>${escapeHtml(row)}</li>`).join("")}</ul>`;
  }

  function defaultPartsForPreset(presetId) {
    const preset = PRESETS.find((item) => item.id === presetId) || PRESETS.find((item) => item.default);
    return { ...(preset?.parts || []).reduce((acc, key) => {
      acc[key] = true;
      return acc;
    }, {
      cover: false,
      setup: false,
      daily: false,
      activities: false,
      songsBooks: false,
      vocabulary: false,
      family: false,
      observations: false,
      printables: false,
    }) };
  }

  function normalizeSelection(kit, options) {
    const opts = options || {};
    const presetId = text(opts.preset) || "week_binder";
    const preset = PRESETS.find((item) => item.id === presetId) || PRESETS.find((item) => item.default);
    const parts = opts.parts && typeof opts.parts === "object"
      ? { ...defaultPartsForPreset(preset.id), ...opts.parts }
      : defaultPartsForPreset(preset.id);

    const removed = opts.removedActivityIds && typeof opts.removedActivityIds === "object"
      ? opts.removedActivityIds
      : {};
    const allActivities = kit?.companion?.activities || [];
    const activities = allActivities.filter((item) => !removed[item.id]);

    let days = [];
    if (preset.daysMode === "all") days = WEEKDAYS.slice();
    else if (preset.daysMode === "today") days = [text(opts.day) || kit?.companion?.today?.day || "monday"];
    if (Array.isArray(opts.days) && opts.days.length) {
      days = opts.days.map((day) => text(day).toLowerCase()).filter((day) => WEEKDAYS.includes(day));
    }
    if (parts.daily && !days.length) days = WEEKDAYS.slice();

    return {
      presetId: preset.id,
      presetLabel: preset.label,
      parts,
      days,
      activities,
      includeImages: opts.includeImages !== false,
      inkSaver: opts.inkSaver === true,
      watermark: text(opts.watermark),
      footerLabel: text(kit?.companion?.binder?.footerLabel) || `${text(kit?.title) || "Teaching Kit"} · Teaching Kit`,
    };
  }

  function page(tab, title, bodyHtml, footerLabel) {
    return `
      <section class="tk-print-page" data-tk-print-tab="${escapeHtml(tab)}">
        <header class="tk-print-running">
          <span>Little Learner Hub</span>
          <span>${escapeHtml(tab)}</span>
        </header>
        <h2 class="tk-print-page-title">${escapeHtml(title)}</h2>
        <hr class="tk-print-rule" />
        <div class="tk-print-body">${bodyHtml}</div>
        <footer class="tk-print-footer">
          <span>${escapeHtml(footerLabel)}</span>
          <span class="tk-print-page-number"></span>
        </footer>
      </section>
    `;
  }

  function coverHtml(kit, selection) {
    const cover = kit?.companion?.binder?.cover || {};
    const tabs = kit?.companion?.binder?.tabs || [];
    return `
      <section class="tk-print-page tk-print-cover" data-tk-print-tab="Cover">
        <div class="tk-print-cover-inner">
          <p class="tk-print-brand">${escapeHtml(cover.brand || "Little Learner Hub")}</p>
          <h1>${escapeHtml(cover.title || kit.title || "Teaching Kit")}</h1>
          <p class="tk-print-subtitle">${escapeHtml(cover.subtitle || `Complete Teaching Kit · ${kit.age || ""}`)}</p>
          ${cover.theme ? `<p class="tk-print-theme">Theme: ${escapeHtml(cover.theme)}</p>` : ""}
          <p class="tk-print-preset">Print pack: ${escapeHtml(selection.presetLabel)}</p>
          <ol class="tk-print-tab-list">
            ${tabs.map((tab) => `<li>${escapeHtml(tab.label)}</li>`).join("")}
          </ol>
          <p class="tk-print-cover-note">Professional classroom companion binder — keep Setup on the prep shelf and Daily pages open during the day.</p>
        </div>
        <footer class="tk-print-footer">
          <span>${escapeHtml(selection.footerLabel)}</span>
          <span class="tk-print-page-number"></span>
        </footer>
      </section>
    `;
  }

  function dividerHtml(tab, title, selection) {
    return `
      <section class="tk-print-page tk-print-divider" data-tk-print-tab="${escapeHtml(tab)}">
        <div class="tk-print-divider-tab">${escapeHtml(tab)}</div>
        <h2>${escapeHtml(title)}</h2>
        <p class="tk-print-muted">Section divider · ${escapeHtml(selection.footerLabel)}</p>
        <footer class="tk-print-footer">
          <span>${escapeHtml(selection.footerLabel)}</span>
          <span class="tk-print-page-number"></span>
        </footer>
      </section>
    `;
  }

  function setupHtml(kit, selection) {
    const setup = kit?.companion?.mondayMorningSetup || {};
    const body = `
      <p><strong>Estimated prep time:</strong> about ${escapeHtml(String(setup.estimatedPrepMinutes || 0))} minutes</p>
      ${(setup.missingMaterials || []).length
        ? `<div class="tk-print-callout"><strong>Needs attention:</strong> ${escapeHtml(setup.missingMaterials.join(" · "))}</div>`
        : ""}
      <h3>Materials to gather</h3>
      ${listHtml((setup.materials || []).map((item) => item.label))}
      <h3>Prep tasks</h3>
      ${listHtml((setup.prepTasks || []).map((item) => `${item.label}${item.minutes ? ` (~${item.minutes} min)` : ""}${item.detail ? ` — ${item.detail}` : ""}`))}
      <h3>Print checklist</h3>
      ${listHtml((setup.printChecklist || []).map((item) => `${item.label}${(item.usedInWeek || []).length ? ` (${item.usedInWeek.join("; ")})` : ""}`))}
    `;
    return dividerHtml("Setup", "Monday Morning Setup", selection)
      + page("Setup", "Monday Morning Setup", body, selection.footerLabel);
  }

  function dailyHtml(kit, selection) {
    const days = selection.days || [];
    if (!days.length) return "";
    let html = dividerHtml("Daily", "Daily Classroom Pages", selection);
    days.forEach((day) => {
      const model = kit?.companion?.days?.[day] || {};
      const body = `
        <p class="tk-print-muted">${escapeHtml(model.focus || kit.theme || "")}</p>
        <h3>Schedule</h3>
        ${listHtml((model.schedule || []).map((slot) => `${slot.time} — ${slot.label} (${slot.kind})`))}
        <h3>Materials</h3>
        <p>${escapeHtml((model.materials || []).join(" · ") || "None listed")}</p>
        <h3>Transitions</h3>
        ${listHtml(model.transitions || [])}
        <h3>Books</h3>
        ${(model.books || []).map((book) => `
          <div class="tk-print-block">
            <strong>${escapeHtml(book.title)}</strong>
            ${(book.readAloudQuestions || []).length
              ? `<p><em>Read-aloud questions:</em> ${escapeHtml(book.readAloudQuestions.join(" · "))}</p>`
              : ""}
          </div>
        `).join("") || `<p class="tk-print-muted">None listed</p>`}
        <h3>Songs</h3>
        ${(model.songs || []).map((song) => `
          <div class="tk-print-block">
            <strong>${escapeHtml(song.title)}</strong>
            ${song.lyrics ? `<p><em>${escapeHtml(song.lyrics)}</em></p>` : ""}
            ${song.motions ? `<p>Motions: ${escapeHtml(song.motions)}</p>` : ""}
          </div>
        `).join("") || `<p class="tk-print-muted">None listed</p>`}
        <h3>Parent connection</h3>
        <div class="tk-print-message">${escapeHtml(model.parentMessage || "")}</div>
        <h3>Observation ideas</h3>
        ${listHtml(model.observations || [])}
      `;
      html += page("Daily", `${DAY_LABELS[day] || day} Classroom`, body, selection.footerLabel);
    });
    return html;
  }

  function activitiesHtml(kit, selection) {
    const activities = selection.activities || [];
    if (!activities.length) return "";
    let html = dividerHtml("Activities", "Activity Cards", selection);
    activities.forEach((activity) => {
      const photos = selection.includeImages
        ? `<div class="tk-print-photo-row">
            <div class="tk-print-photo">${activity.examplePhotoUrl
              ? `<img src="${escapeHtml(activity.examplePhotoUrl)}" alt="Example" />`
              : `<div class="tk-print-photo-ph">Example photo</div>`}<span>Example</span></div>
            <div class="tk-print-photo">${activity.setupPhotoUrl
              ? `<img src="${escapeHtml(activity.setupPhotoUrl)}" alt="Setup" />`
              : `<div class="tk-print-photo-ph">Setup photo</div>`}<span>Setup</span></div>
          </div>`
        : "";
      const body = `
        <p class="tk-print-muted">${escapeHtml(activity.activityCategory || "")}${activity.dayOfWeek ? ` · ${escapeHtml(DAY_LABELS[activity.dayOfWeek] || activity.dayOfWeek)}` : ""}</p>
        ${photos}
        <h3>Learning objective</h3>
        <p>${escapeHtml(activity.learningObjective || "None listed")}</p>
        <h3>Materials</h3>
        <p>${escapeHtml((activity.materials || []).join(" · ") || activity.materialsText || "None listed")}</p>
        <h3>Setup</h3>
        <p class="tk-print-pre">${escapeHtml(activity.setup || "None listed")}</p>
        <h3>Steps</h3>
        <p class="tk-print-pre">${escapeHtml(activity.steps || "None listed")}</p>
        <h3>Teacher prompts</h3>
        ${listHtml((activity.teacherPrompts || []).map((prompt) => `${prompt.label || "Prompt"}: ${prompt.text || ""}`))}
        <h3>Cleanup tips</h3>
        ${listHtml(activity.cleanupTips || [])}
        <h3>Observation ideas</h3>
        ${listHtml(activity.observationIdeas || [])}
      `;
      html += page("Activities", activity.title || "Activity", body, selection.footerLabel);
    });
    return html;
  }

  function songsBooksHtml(kit, selection) {
    const books = kit?.companion?.books || [];
    const songs = kit?.companion?.songs || [];
    const body = `
      <h3>Books</h3>
      ${books.map((book) => `
        <div class="tk-print-block">
          <strong>${escapeHtml(book.title)}</strong>${book.author ? ` — ${escapeHtml(book.author)}` : ""}
          ${(book.readAloudQuestions || []).length
            ? `<p><em>Read-aloud questions:</em> ${escapeHtml(book.readAloudQuestions.join(" · "))}</p>`
            : ""}
        </div>
      `).join("") || `<p class="tk-print-muted">None listed</p>`}
      <h3>Songs</h3>
      ${songs.map((song) => `
        <div class="tk-print-block">
          <strong>${escapeHtml(song.title)}</strong>
          ${song.lyrics ? `<p><em>${escapeHtml(song.lyrics)}</em></p>` : ""}
          ${song.motions ? `<p>Motions: ${escapeHtml(song.motions)}</p>` : ""}
        </div>
      `).join("") || `<p class="tk-print-muted">None listed</p>`}
    `;
    return dividerHtml("Songs & Books", "Songs & Books", selection)
      + page("Songs & Books", "Songs & Books", body, selection.footerLabel);
  }

  function vocabularyHtml(kit, selection) {
    const words = kit?.companion?.vocabulary || [];
    const body = listHtml(words.map((word) => {
      const bits = [word.word];
      if (word.definition) bits.push(word.definition);
      if (word.discussionIdea) bits.push(word.discussionIdea);
      return bits.join(" — ");
    }));
    return dividerHtml("Songs & Books", "Vocabulary", selection)
      + page("Songs & Books", "Vocabulary", body, selection.footerLabel);
  }

  function familyHtml(kit, selection) {
    const message = kit?.companion?.parentConnection?.readyToSendMessage || "";
    const points = kit?.companion?.parentConnection?.pickupTalkingPoints || [];
    const body = `
      <h3>Ready-to-send family message</h3>
      <div class="tk-print-message">${escapeHtml(message || "None listed")}</div>
      <h3>Pickup talking points</h3>
      ${listHtml(points)}
    `;
    return dividerHtml("Families", "Parent Connection", selection)
      + page("Families", "Parent Connection", body, selection.footerLabel);
  }

  function observationsHtml(kit, selection) {
    const prompts = [];
    (selection.activities || []).forEach((activity) => {
      (activity.observationIdeas || []).forEach((idea) => {
        prompts.push(`${activity.title}: ${idea}`);
      });
    });
    if (!prompts.length) {
      WEEKDAYS.forEach((day) => {
        const model = kit?.companion?.days?.[day];
        (model?.observations || []).forEach((idea) => prompts.push(`${DAY_LABELS[day]}: ${idea}`));
      });
    }
    const body = listHtml(prompts);
    return dividerHtml("Observe", "Observation Prompts", selection)
      + page("Observe", "Observation Prompts", body, selection.footerLabel);
  }

  function printablesHtml(kit, selection) {
    const printables = kit?.companion?.printables || [];
    const body = printables.length
      ? printables.map((item) => `
          <div class="tk-print-block">
            <strong>${escapeHtml(item.title)}</strong>
            <p>Used in week: ${escapeHtml((item.usedInWeek || []).map((slot) => `${slot.dayLabel || slot.day} · ${slot.moment}`).join("; ") || "See weekly plan")}</p>
          </div>
        `).join("")
      : `<p class="tk-print-muted">No linked printables for this kit.</p>`;
    return page("Setup", "Printables — Where Used in the Week", body, selection.footerLabel);
  }

  function buildBinderPrintHtml(kit, options) {
    if (!kit || kit.ok === false || kit.locked || !kit.companion) {
      return { ok: false, reason: "unavailable", html: "" };
    }
    const selection = normalizeSelection(kit, options);
    const parts = selection.parts;
    const chunks = [];
    if (selection.watermark) {
      chunks.push(`<div class="tk-print-watermark" aria-hidden="true">${escapeHtml(selection.watermark)}</div>`);
    }
    if (parts.cover) chunks.push(coverHtml(kit, selection));
    if (parts.setup) chunks.push(setupHtml(kit, selection));
    if (parts.daily) chunks.push(dailyHtml(kit, selection));
    if (parts.activities) chunks.push(activitiesHtml(kit, selection));
    if (parts.songsBooks) chunks.push(songsBooksHtml(kit, selection));
    if (parts.vocabulary) chunks.push(vocabularyHtml(kit, selection));
    if (parts.family) chunks.push(familyHtml(kit, selection));
    if (parts.observations) chunks.push(observationsHtml(kit, selection));
    if (parts.printables) chunks.push(printablesHtml(kit, selection));

    const html = `
      <div class="tk-print-root${selection.inkSaver ? " is-ink-saver" : ""}" data-teaching-kit-print-root>
        ${chunks.join("\n")}
      </div>
    `;
    return {
      ok: true,
      reason: "ok",
      html,
      selection,
      pageCount: (html.match(/tk-print-page/g) || []).length,
    };
  }

  return {
    PRESETS,
    PART_LABELS,
    WEEKDAYS,
    escapeHtml,
    defaultPartsForPreset,
    normalizeSelection,
    buildBinderPrintHtml,
  };
});
