/**
 * Teaching Kit Slice 1E/1F — Print Center / professional binder print HTML.
 * Client print-preview assembly (window.print). Does not bypass trial exports;
 * callers must authorize via existing confirmTrialCurriculumExport first.
 * Slice 1F: Letter/A4, page-break polish, image scaling, print authorization gate helper.
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

  const PAPER_SIZES = Object.freeze([
    Object.freeze({ id: "letter", label: "US Letter", cssSize: "letter" }),
    Object.freeze({ id: "a4", label: "A4", cssSize: "A4" }),
  ]);

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
      label: "Weekly Teaching Kit",
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

  /**
   * Pure gate used by printTeachingKitBinder — keeps trial/Pro enforcement testable.
   * Callers must still run confirmTrialCurriculumExport before building HTML.
   */
  function evaluatePrintAuthorization(input) {
    const opts = input || {};
    if (opts.printCenterEnabled !== true) {
      return { ok: false, reason: "print_flag_off" };
    }
    const kit = opts.kit;
    if (!kit || kit.ok === false || kit.locked || !kit.companion) {
      return { ok: false, reason: kit?.locked ? "locked" : "unavailable" };
    }
    const gate = opts.gate;
    if (!gate || gate.allowed !== true) {
      if (gate?.cancelled) return { ok: false, reason: "trial_cancelled" };
      if (gate?.exhausted) return { ok: false, reason: "trial_exhausted" };
      return { ok: false, reason: "trial_blocked" };
    }
    if (gate.counted && !text(gate.watermark)) {
      return { ok: false, reason: "watermark_required" };
    }
    return { ok: true, reason: "ok" };
  }

  /**
   * Which Print Center parts have real content. Used to disable empty options
   * and skip blank print sections.
   */
  function evaluatePrintPartAvailability(kit, options = {}) {
    const companion = kit && kit.companion ? kit.companion : {};
    const removed = options.removedActivityIds || {};
    const activities = (companion.activities || []).filter((item) => !removed[item.id]);
    const books = companion.books || [];
    const songs = companion.songs || [];
    const vocab = companion.vocabulary || [];
    const printables = companion.printables || [];
    const setup = companion.mondayMorningSetup || {};
    const family = text(companion.parentConnection?.readyToSendMessage);
    const daysWithContent = WEEKDAYS.filter((day) => {
      const model = companion.days?.[day];
      return Boolean(model && ((model.activities || []).length || text(model.focus) || (model.schedule || []).length));
    });
    const obsCount = activities.reduce((sum, act) => sum + (act.observationIdeas || []).length, 0)
      || WEEKDAYS.reduce((sum, day) => sum + ((companion.days?.[day]?.observations || []).length), 0);
    const photoCount = activities.filter((act) => act.hasExamplePhoto || act.hasSetupPhoto
      || act.examplePhotoUrl || act.setupPhotoUrl || act.exampleImageUrl || act.setupImageUrl).length;

    function row(available, count, reason) {
      return { available: Boolean(available), count: Number(count) || 0, reason: reason || "" };
    }

    return {
      cover: row(true, 1, ""),
      setup: row(
        (setup.materials || []).length || (setup.prepTasks || []).length,
        (setup.materials || []).length,
        "Monday Setup materials/prep not authored yet",
      ),
      daily: row(daysWithContent.length, daysWithContent.length, "No daily classroom pages with content yet"),
      activities: row(activities.length, activities.length, "No activities to print"),
      songsBooks: row(books.length + songs.length, books.length + songs.length, "No songs or books yet"),
      vocabulary: row(vocab.length, vocab.length, "No vocabulary yet"),
      family: row(Boolean(family), family ? 1 : 0, "No family connection message yet"),
      observations: row(obsCount, obsCount, "No observation prompts yet"),
      printables: row(printables.length, printables.length, "No printables linked yet"),
      images: row(photoCount, photoCount, "No example/setup photos yet"),
    };
  }

  function normalizePaperSize(value) {
    const id = text(value).toLowerCase();
    return PAPER_SIZES.some((item) => item.id === id) ? id : "letter";
  }

  function pageSizeCss(paperSize) {
    const match = PAPER_SIZES.find((item) => item.id === normalizePaperSize(paperSize));
    return match ? match.cssSize : "letter";
  }

  /** Inline @page rule so Letter vs A4 works across browsers (class selectors cannot scope @page). */
  function pageSizeStyleTag(paperSize) {
    const size = pageSizeCss(paperSize);
    return `<style data-tk-print-page-size>@page{size:${size};margin:0.55in;}</style>`;
  }

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function presentApi() {
    return (typeof globalThis !== "undefined" && globalThis.LLHTeachingKitPresent)
      || (typeof require === "function" ? (() => { try { return require("./teaching-kit-present.js"); } catch (_e) { return null; } })()
      : null);
  }

  function presentLabel(value, fallback) {
    const api = presentApi();
    return api?.presentLabel ? api.presentLabel(value, fallback) : (text(value) || text(fallback) || "");
  }

  function hasDisplayValue(value) {
    const api = presentApi();
    if (api?.hasDisplayValue) return api.hasDisplayValue(value);
    return Boolean(text(value));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function listHtml(items, emptyHtml) {
    const rows = (items || []).map((item) => text(item)).filter(Boolean);
    if (!rows.length) return emptyHtml == null ? "" : emptyHtml;
    return `<ul class="tk-print-list">${rows.map((row) => `<li>${escapeHtml(row)}</li>`).join("")}</ul>`;
  }

  function sectionHtml(title, innerHtml) {
    if (!text(innerHtml)) return "";
    return `
      <div class="tk-print-keep tk-print-section">
        <h3>${escapeHtml(title)}</h3>
        ${innerHtml}
      </div>
    `;
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
      presetLabel: presentLabel(preset.id, preset.label),
      parts,
      days,
      activities,
      includeImages: opts.includeImages !== false,
      inkSaver: opts.inkSaver === true,
      paperSize: normalizePaperSize(opts.paperSize),
      watermark: text(opts.watermark),
      footerLabel: text(kit?.companion?.binder?.footerLabel) || `${text(kit?.title) || "Teaching Kit"} · Little Learner Hub`,
    };
  }

  function page(tab, title, bodyHtml, footerLabel) {
    return `
      <section class="tk-print-page" data-tk-print-tab="${escapeHtml(tab)}">
        <header class="tk-print-running">
          <span>Little Learner Hub</span>
          <span>${escapeHtml(presentLabel(tab, tab))}</span>
        </header>
        <h2 class="tk-print-page-title">${escapeHtml(title)}</h2>
        <hr class="tk-print-rule" />
        <div class="tk-print-body">${bodyHtml}</div>
        <footer class="tk-print-footer">
          <span>${escapeHtml(footerLabel)}</span>
          <span class="tk-print-page-number" aria-hidden="true"></span>
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
    const materials = listHtml((setup.materials || []).map((item) => item.label));
    const prep = listHtml((setup.prepTasks || []).map((item) => `${item.label}${item.minutes ? ` (~${item.minutes} min)` : ""}${item.detail ? ` — ${item.detail}` : ""}`));
    const printList = listHtml((setup.printChecklist || []).map((item) => `${item.label}${(item.usedInWeek || []).length ? ` (${item.usedInWeek.join("; ")})` : ""}`));
    const body = `
      <p class="tk-print-lede"><strong>Estimated prep time:</strong> about ${escapeHtml(String(setup.estimatedPrepMinutes || 0))} minutes</p>
      ${(setup.missingMaterials || []).length
        ? `<div class="tk-print-callout tk-print-keep"><strong>Needs attention:</strong> ${escapeHtml(setup.missingMaterials.join(" · "))}</div>`
        : ""}
      ${sectionHtml("Materials to gather", materials)}
      ${sectionHtml("Prep tasks", prep)}
      ${sectionHtml("Print checklist", printList)}
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
      const schedule = listHtml((model.schedule || []).map((slot) => `${slot.time} — ${slot.label}${slot.kind ? ` · ${presentLabel(slot.kind)}` : ""}`));
      const booksHtml = (model.books || []).map((book) => `
          <div class="tk-print-block tk-print-keep">
            <strong>${escapeHtml(book.title)}</strong>
            ${(book.readAloudQuestions || []).length
              ? `<p><em>Read-aloud questions:</em> ${escapeHtml(book.readAloudQuestions.join(" · "))}</p>`
              : ""}
          </div>
        `).join("");
      const songsHtml = (model.songs || []).map((song) => `
          <div class="tk-print-block tk-print-keep">
            <strong>${escapeHtml(song.title)}</strong>
            ${song.lyrics ? `<p><em>${escapeHtml(song.lyrics)}</em></p>` : ""}
            ${song.motions ? `<p>Motions: ${escapeHtml(song.motions)}</p>` : ""}
          </div>
        `).join("");
      const body = `
        ${hasDisplayValue(model.focus || kit.theme) ? `<p class="tk-print-lede">${escapeHtml(model.focus || kit.theme || "")}</p>` : ""}
        ${sectionHtml("Schedule", schedule)}
        ${hasDisplayValue((model.materials || []).join(" · ")) ? sectionHtml("Materials", `<p>${escapeHtml((model.materials || []).join(" · "))}</p>`) : ""}
        ${sectionHtml("Transitions", listHtml(model.transitions || []))}
        ${sectionHtml("Books", booksHtml)}
        ${sectionHtml("Songs", songsHtml)}
        ${hasDisplayValue(model.parentMessage) ? sectionHtml("Family connection", `<div class="tk-print-message">${escapeHtml(model.parentMessage || "")}</div>`) : ""}
        ${sectionHtml("Observation opportunities", listHtml(model.observations || []))}
      `;
      html += page("Daily", `${DAY_LABELS[day] || presentLabel(day)} Classroom`, body, selection.footerLabel);
    });
    return html;
  }

  function activitiesHtml(kit, selection) {
    const activities = selection.activities || [];
    if (!activities.length) return "";
    let html = dividerHtml("Activities", "Activity Cards", selection);
    activities.forEach((activity) => {
      const exampleUrl = activity.examplePhotoUrl || activity.exampleImageUrl || "";
      const setupUrl = activity.setupPhotoUrl || activity.setupImageUrl || "";
      const photoBits = [];
      if (selection.includeImages && exampleUrl) {
        photoBits.push(`<div class="tk-print-photo"><img src="${escapeHtml(exampleUrl)}" alt="${escapeHtml(activity.exampleAlt || `Finished example for ${activity.title || "activity"}`)}" loading="eager" decoding="async" /><span>Example</span></div>`);
      }
      if (selection.includeImages && setupUrl) {
        photoBits.push(`<div class="tk-print-photo"><img src="${escapeHtml(setupUrl)}" alt="${escapeHtml(activity.setupAlt || `Setup for ${activity.title || "activity"}`)}" loading="eager" decoding="async" /><span>Setup</span></div>`);
      }
      const photos = photoBits.length
        ? `<div class="tk-print-photo-row tk-print-keep">${photoBits.join("")}</div>`
        : "";
      const prompts = listHtml((activity.teacherPrompts || []).map((prompt) => {
        const label = presentLabel(prompt.label || "Prompt");
        const copy = text(prompt.text || "");
        return copy ? `${label}: ${copy}` : "";
      }));
      const body = `
        <p class="tk-print-meta">${escapeHtml(presentLabel(activity.activityCategory || ""))}${activity.dayOfWeek ? ` · ${escapeHtml(DAY_LABELS[activity.dayOfWeek] || presentLabel(activity.dayOfWeek))}` : ""}</p>
        ${photos}
        ${hasDisplayValue(activity.learningObjective) ? sectionHtml("Learning objective", `<p>${escapeHtml(activity.learningObjective)}</p>`) : ""}
        ${hasDisplayValue((activity.materials || []).join(" · ") || activity.materialsText) ? sectionHtml("Materials", `<p>${escapeHtml((activity.materials || []).join(" · ") || activity.materialsText)}</p>`) : ""}
        ${hasDisplayValue(activity.setup) ? sectionHtml("Setup", `<p class="tk-print-pre">${escapeHtml(activity.setup)}</p>`) : ""}
        ${hasDisplayValue(activity.steps) ? sectionHtml("Steps", `<p class="tk-print-pre">${escapeHtml(activity.steps)}</p>`) : ""}
        ${sectionHtml("Teacher prompts", prompts)}
        ${sectionHtml("Cleanup tips", listHtml(activity.cleanupTips || []))}
        ${sectionHtml("Observation opportunities", listHtml(activity.observationIdeas || []))}
        ${hasDisplayValue(activity.ageModifications || activity.adaptations) ? sectionHtml("Age adaptations", `<p class="tk-print-pre">${escapeHtml(activity.ageModifications || activity.adaptations)}</p>`) : ""}
        ${hasDisplayValue(activity.safetyNotes) ? sectionHtml("Safety notes", `<p class="tk-print-pre">${escapeHtml(activity.safetyNotes)}</p>`) : ""}
      `;
      html += page("Activities", activity.title || "Activity", body, selection.footerLabel);
    });
    return html;
  }

  function songsBooksHtml(kit, selection) {
    const books = kit?.companion?.books || [];
    const songs = kit?.companion?.songs || [];
    if (!books.length && !songs.length) return "";
    const body = `
      <h3>Books</h3>
      ${books.map((book) => `
        <div class="tk-print-block">
          <strong>${escapeHtml(book.title)}</strong>${book.author ? ` — ${escapeHtml(book.author)}` : ""}
          ${(book.readAloudQuestions || book.afterReadingQuestions || []).length
            ? `<p><em>Read-aloud questions:</em> ${escapeHtml((book.readAloudQuestions || book.afterReadingQuestions).join(" · "))}</p>`
            : ""}
        </div>
      `).join("") || ""}
      <h3>Songs</h3>
      ${songs.map((song) => `
        <div class="tk-print-block">
          <strong>${escapeHtml(song.title)}</strong>
          ${song.lyricsPrintable && song.lyrics ? `<p><em>${escapeHtml(song.lyrics)}</em></p>` : ""}
          ${song.motions ? `<p>Motions: ${escapeHtml(song.motions)}</p>` : ""}
        </div>
      `).join("") || ""}
    `;
    return dividerHtml("Songs & Books", "Songs & Books", selection)
      + page("Songs & Books", "Songs & Books", body, selection.footerLabel);
  }

  function vocabularyHtml(kit, selection) {
    const words = kit?.companion?.vocabulary || [];
    if (!words.length) return "";
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
    if (!message && !points.length) return "";
    const body = `
      <h3>Ready-to-send family message</h3>
      <div class="tk-print-message">${escapeHtml(message)}</div>
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
    if (!prompts.length) return "";
    const body = listHtml(prompts);
    return dividerHtml("Observe", "Observation Prompts", selection)
      + page("Observe", "Observation Prompts", body, selection.footerLabel);
  }

  function printablesHtml(kit, selection) {
    const printables = kit?.companion?.printables || [];
    if (!printables.length) return "";
    const body = printables.map((item) => `
          <div class="tk-print-block">
            <strong>${escapeHtml(item.title)}</strong>
            <p>Used in week: ${escapeHtml((item.usedInWeek || []).map((slot) => `${slot.dayLabel || slot.day} · ${slot.moment}`).join("; ") || "See weekly plan")}</p>
          </div>
        `).join("");
    return page("Setup", "Printables — Where Used in the Week", body, selection.footerLabel);
  }

  function setupHtmlIfAvailable(kit, selection, availability) {
    if (availability.setup && availability.setup.available === false) return "";
    return setupHtml(kit, selection);
  }

  function buildBinderPrintHtml(kit, options) {
    if (!kit || kit.ok === false || kit.locked || !kit.companion) {
      return { ok: false, reason: "unavailable", html: "", pageCount: 0 };
    }
    const selection = normalizeSelection(kit, options);
    const availability = evaluatePrintPartAvailability(kit, {
      removedActivityIds: options && options.removedActivityIds,
    });
    // Never emit blank sections — force-disable unavailable parts even if UI checked them.
    const parts = { ...selection.parts };
    Object.keys(PART_LABELS).forEach((key) => {
      if (parts[key] && availability[key] && availability[key].available === false) {
        parts[key] = false;
      }
    });
    if (selection.includeImages && availability.images && availability.images.available === false) {
      selection.includeImages = false;
    }
    selection.parts = parts;
    const chunks = [];
    chunks.push(pageSizeStyleTag(selection.paperSize));
    if (selection.watermark) {
      chunks.push(`<div class="tk-print-watermark" aria-hidden="true">${escapeHtml(selection.watermark)}</div>`);
    }
    if (parts.cover) chunks.push(coverHtml(kit, selection));
    if (parts.setup) chunks.push(setupHtmlIfAvailable(kit, selection, availability));
    if (parts.daily) chunks.push(dailyHtml(kit, selection));
    if (parts.activities) chunks.push(activitiesHtml(kit, selection));
    if (parts.songsBooks) chunks.push(songsBooksHtml(kit, selection));
    if (parts.vocabulary) chunks.push(vocabularyHtml(kit, selection));
    if (parts.family) chunks.push(familyHtml(kit, selection));
    if (parts.observations) chunks.push(observationsHtml(kit, selection));
    if (parts.printables) chunks.push(printablesHtml(kit, selection));

    // Empty kits still produce a cover + calm empty notice when cover is selected.
    if (chunks.filter((chunk) => String(chunk).includes("tk-print-page")).length === 0) {
      chunks.push(page(
        "Cover",
        kit.title || "Teaching Kit",
        `<p class="tk-print-muted">This Teaching Kit does not have printable section content yet. Add activities and materials in the lesson plan, then rebuild the binder.</p>`,
        selection.footerLabel,
      ));
    }

    const html = `
      <div class="tk-print-root${selection.inkSaver ? " is-ink-saver" : ""}" data-teaching-kit-print-root data-tk-paper="${escapeHtml(selection.paperSize)}">
        ${chunks.join("\n")}
      </div>
    `;
    return {
      ok: true,
      reason: "ok",
      html,
      selection,
      paperSize: selection.paperSize,
      pageCount: (html.match(/tk-print-page/g) || []).length,
    };
  }

  return {
    PRESETS,
    PART_LABELS,
    PAPER_SIZES,
    WEEKDAYS,
    escapeHtml,
    presentLabel,
    defaultPartsForPreset,
    normalizeSelection,
    normalizePaperSize,
    pageSizeCss,
    pageSizeStyleTag,
    evaluatePrintAuthorization,
    evaluatePrintPartAvailability,
    buildBinderPrintHtml,
  };
});
