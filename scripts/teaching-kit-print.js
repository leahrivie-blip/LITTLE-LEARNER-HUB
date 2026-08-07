/**
 * Teaching Kit professional print/download HTML.
 * Builds printable documents from LLHTeachingKitPrintableModel — never from the
 * currently visible modal/tab DOM. Display-only; does not mutate curriculum.
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

  /** Print Center presets — each maps to a document mode (not the visible tab). */
  const PRESETS = Object.freeze([
    Object.freeze({
      id: "week_binder",
      label: "Entire Binder Kit",
      documentMode: "entire_binder",
      parts: ["cover", "setup", "daily", "activities", "songsBooks", "vocabulary", "family", "observations", "printables"],
      daysMode: "all",
      default: true,
    }),
    Object.freeze({
      id: "full_weekly_plan",
      label: "Full Weekly Lesson Plan",
      documentMode: "full_weekly",
      parts: ["cover", "daily", "activities", "songsBooks", "vocabulary", "observations"],
      daysMode: "all",
    }),
    Object.freeze({
      id: "weekly_overview",
      label: "Weekly Overview",
      documentMode: "overview",
      parts: ["cover", "setup", "vocabulary"],
      daysMode: "none",
    }),
    Object.freeze({
      id: "today_pack",
      label: "One Day",
      documentMode: "one_day",
      parts: ["cover", "daily", "activities", "songsBooks", "family", "observations"],
      daysMode: "today",
    }),
    Object.freeze({
      id: "activities_only",
      label: "Activities Only",
      documentMode: "activities",
      parts: ["cover", "activities"],
      daysMode: "none",
    }),
    Object.freeze({
      id: "one_activity",
      label: "One Activity",
      documentMode: "one_activity",
      parts: ["activities"],
      daysMode: "none",
    }),
    Object.freeze({
      id: "songs_pack",
      label: "Songs",
      documentMode: "songs",
      parts: ["cover", "songsBooks"],
      daysMode: "none",
    }),
    Object.freeze({
      id: "song_lyrics",
      label: "Song Lyrics",
      documentMode: "song_lyrics",
      parts: ["songsBooks"],
      daysMode: "none",
    }),
    Object.freeze({
      id: "book_guide",
      label: "Book Guide",
      documentMode: "books",
      parts: ["cover", "songsBooks"],
      daysMode: "none",
    }),
    Object.freeze({
      id: "materials_list",
      label: "Materials List",
      documentMode: "materials",
      parts: ["cover", "setup"],
      daysMode: "none",
    }),
    Object.freeze({
      id: "teacher_toolkit",
      label: "Teacher Toolkit",
      documentMode: "toolkit",
      parts: ["cover", "setup", "vocabulary", "observations", "family"],
      daysMode: "none",
    }),
    Object.freeze({
      id: "all_printables",
      label: "All Printables",
      documentMode: "printables",
      parts: ["cover", "printables"],
      daysMode: "none",
    }),
    Object.freeze({
      id: "monday_setup_pack",
      label: "Monday Morning Setup pack",
      documentMode: "monday_setup",
      parts: ["cover", "setup", "printables"],
      daysMode: "none",
    }),
    Object.freeze({
      id: "family_pack",
      label: "Family pack",
      documentMode: "family",
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

  function modelApi() {
    return (typeof globalThis !== "undefined" && globalThis.LLHTeachingKitPrintableModel)
      || (typeof require === "function" ? (() => { try { return require("./teaching-kit-printable-model.js"); } catch (_e) { return null; } })()
      : null);
  }

  function presentApi() {
    return (typeof globalThis !== "undefined" && globalThis.LLHTeachingKitPresent)
      || (typeof require === "function" ? (() => { try { return require("./teaching-kit-present.js"); } catch (_e) { return null; } })()
      : null);
  }

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function presentLabel(value, fallback) {
    const api = presentApi();
    return api?.presentLabel ? api.presentLabel(value, fallback) : (text(value) || text(fallback) || "");
  }

  function hasDisplayValue(value) {
    const api = presentApi();
    if (api?.hasDisplayValue) return api.hasDisplayValue(value);
    if (Array.isArray(value)) return value.some((item) => hasDisplayValue(item));
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

  function listHtml(items) {
    const rows = (items || []).map((item) => text(item)).filter(Boolean);
    if (!rows.length) return "";
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

  function pageSizeStyleTag(paperSize) {
    const size = pageSizeCss(paperSize);
    return `<style data-tk-print-page-size>@page{size:${size};margin:0.55in;}</style>`;
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

  function resolveDocumentMode(presetId, options) {
    if (text(options?.documentMode)) return text(options.documentMode);
    const preset = PRESETS.find((item) => item.id === presetId);
    return text(preset?.documentMode) || "entire_binder";
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

    const documentMode = resolveDocumentMode(preset.id, opts);
    return {
      presetId: preset.id,
      presetLabel: presentLabel(preset.id, preset.label),
      documentMode,
      parts,
      days,
      activities,
      activityId: text(opts.activityId),
      includeImages: opts.includeImages !== false,
      inkSaver: opts.inkSaver === true,
      paperSize: normalizePaperSize(opts.paperSize),
      watermark: text(opts.watermark),
      footerLabel: text(kit?.companion?.binder?.footerLabel) || `${text(kit?.title) || "Teaching Kit"} · Little Learner Hub`,
      plan: opts.plan && typeof opts.plan === "object" ? opts.plan : null,
    };
  }

  function page(tab, title, bodyHtml, footerLabel, extraClass) {
    return `
      <section class="tk-print-page${extraClass ? ` ${extraClass}` : ""}" data-tk-print-tab="${escapeHtml(tab)}">
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

  function coverFromModel(model, selection) {
    const meta = [
      model.age ? `Age group: ${model.age}` : "",
      model.duration ? `Duration: ${model.duration}` : "",
      model.theme ? `Theme: ${model.theme}` : "",
    ].filter(Boolean);
    const coverImg = selection.includeImages && model.coverImageUrl
      ? `<div class="tk-print-cover-image"><img src="${escapeHtml(model.coverImageUrl)}" alt="${escapeHtml(model.coverImageAlt || model.title)}" loading="eager" decoding="async" /></div>`
      : "";
    return `
      <section class="tk-print-page tk-print-cover" data-tk-print-tab="Cover">
        <div class="tk-print-cover-inner">
          <p class="tk-print-brand">${escapeHtml(model.brand || "Little Learner Hub")}</p>
          ${coverImg}
          <h1>${escapeHtml(model.title || "Teaching Kit")}</h1>
          <p class="tk-print-subtitle">${escapeHtml(selection.documentMode === "full_weekly" ? "Full Weekly Lesson Plan" : "Complete Teaching Kit · Digital Teacher Binder")}</p>
          ${meta.map((line) => `<p class="tk-print-theme">${escapeHtml(line)}</p>`).join("")}
          <p class="tk-print-preset">Print pack: ${escapeHtml(selection.presetLabel)}</p>
          <p class="tk-print-cover-note">Classroom companion — print only the pack you need. Empty sections are omitted automatically.</p>
        </div>
        <footer class="tk-print-footer">
          <span>${escapeHtml(selection.footerLabel)}</span>
          <span class="tk-print-page-number"></span>
        </footer>
      </section>
    `;
  }

  function tocHtml(model, selection, sectionIds) {
    const rows = (model.sections || []).filter((section) => sectionIds.has(section.id) && section.id !== "cover" && section.id !== "toc");
    if (!rows.length) return "";
    const body = `
      <ol class="tk-print-toc">
        ${rows.map((section) => `<li><strong>${escapeHtml(section.label)}</strong></li>`).join("")}
      </ol>
      <p class="tk-print-muted">Only sections with real stored content are listed.</p>
    `;
    return page("Contents", "Table of Contents", body, selection.footerLabel);
  }

  function overviewBody(model) {
    const o = model.overview || {};
    const vocab = (o.vocabulary || []).map((word) => {
      const bits = [word.word];
      if (word.definition) bits.push(word.definition);
      return bits.join(" — ");
    });
    const prep = (o.teacherPrep || []).map((task) => `${task.label}${task.minutes ? ` (~${task.minutes} min)` : ""}${task.detail ? ` — ${task.detail}` : ""}`);
    return [
      hasDisplayValue(o.weeklyOverview) ? `<p class="tk-print-lede">${escapeHtml(o.weeklyOverview)}</p>` : "",
      sectionHtml("Learning objectives", listHtml(o.learningObjectives)),
      sectionHtml("Learning domains", listHtml(o.learningDomains)),
      sectionHtml("Vocabulary", listHtml(vocab)),
      sectionHtml("Master materials", listHtml(o.masterMaterials)),
      sectionHtml("Teacher prep", listHtml(prep)),
      o.estimatedPrepMinutes ? `<p><strong>Estimated prep:</strong> about ${escapeHtml(String(o.estimatedPrepMinutes))} minutes</p>` : "",
      sectionHtml("Safety", listHtml(o.safety)),
      hasDisplayValue(o.adaptations) ? sectionHtml("Inclusion / adaptations", `<p class="tk-print-pre">${escapeHtml(o.adaptations)}</p>`) : "",
      sectionHtml("Observation focus", listHtml(o.observationFocus)),
      hasDisplayValue(o.familyConnection) ? sectionHtml("Family connection", `<div class="tk-print-message">${escapeHtml(o.familyConnection)}</div>`) : "",
    ].join("\n");
  }

  function weekGlanceBody(model, daysFilter) {
    const days = (model.days || []).filter((day) => !daysFilter || daysFilter.includes(day.day));
    return days.map((day) => {
      const fields = [
        ["Daily focus", day.focus],
        ["Circle time", day.circleTime],
        ["Book", (day.books || []).map((book) => book.title).filter(Boolean)],
        ["Song", (day.songs || []).map((song) => song.title).filter(Boolean)],
        ["Invitation to play", day.invitationToPlay],
        ["Activities", day.activityTitles || (day.activities || []).map((item) => item.title)],
        ["Sensory", day.sensory],
        ["Fine motor", day.fineMotor],
        ["Gross motor / outdoor", day.grossMotor || day.outdoorPlay],
        ["Art", day.art],
        ["STEM", day.stem],
        ["Small group", day.smallGroup],
        ["Observation focus", day.observations],
        ["Family connection", day.parentMessage],
      ];
      const bits = fields.map(([label, value]) => {
        if (!hasDisplayValue(value)) return "";
        const copy = Array.isArray(value) ? value.filter(Boolean).join("; ") : text(value);
        if (!copy) return "";
        return `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(copy)}</p>`;
      }).join("");
      if (!bits) return "";
      return `<div class="tk-print-keep tk-print-day-card"><h3>${escapeHtml(day.dayLabel)}</h3>${bits}</div>`;
    }).join("");
  }

  function dailyPlanBody(day) {
    const schedule = listHtml((day.schedule || []).map((slot) => `${slot.time ? `${slot.time} — ` : ""}${slot.label}${slot.kind ? ` · ${slot.kind}` : ""}`));
    return [
      hasDisplayValue(day.focus) ? `<p class="tk-print-lede">${escapeHtml(day.focus)}</p>` : "",
      hasDisplayValue(day.objectives) ? sectionHtml("Daily objectives", `<p class="tk-print-pre">${escapeHtml(day.objectives)}</p>`) : "",
      sectionHtml("Schedule", schedule),
      sectionHtml("Circle time", listHtml(day.circleTime)),
      sectionHtml("Books", listHtml((day.books || []).map((book) => [book.title, book.author ? `by ${book.author}` : ""].filter(Boolean).join(" — ")))),
      sectionHtml("Songs", listHtml((day.songs || []).map((song) => song.title))),
      hasDisplayValue(day.invitationToPlay) ? sectionHtml("Invitation to play", `<p class="tk-print-pre">${escapeHtml(day.invitationToPlay)}</p>`) : "",
      sectionHtml("Activities", listHtml(day.activityTitles || [])),
      hasDisplayValue(day.sensory) ? sectionHtml("Sensory", `<p class="tk-print-pre">${escapeHtml(day.sensory)}</p>`) : "",
      hasDisplayValue(day.fineMotor) ? sectionHtml("Fine motor", `<p class="tk-print-pre">${escapeHtml(day.fineMotor)}</p>`) : "",
      hasDisplayValue(day.grossMotor || day.outdoorPlay) ? sectionHtml("Gross motor / outdoor", `<p class="tk-print-pre">${escapeHtml(day.grossMotor || day.outdoorPlay)}</p>`) : "",
      hasDisplayValue(day.art) ? sectionHtml("Art", `<p class="tk-print-pre">${escapeHtml(day.art)}</p>`) : "",
      hasDisplayValue(day.stem) ? sectionHtml("STEM", `<p class="tk-print-pre">${escapeHtml(day.stem)}</p>`) : "",
      hasDisplayValue(day.smallGroup) ? sectionHtml("Small group", `<p class="tk-print-pre">${escapeHtml(day.smallGroup)}</p>`) : "",
      sectionHtml("Materials", listHtml(day.materials)),
      sectionHtml("Transitions", listHtml(day.transitions)),
      sectionHtml("Observation focus", listHtml(day.observations)),
      hasDisplayValue(day.parentMessage) ? sectionHtml("Family connection", `<div class="tk-print-message">${escapeHtml(day.parentMessage)}</div>`) : "",
      hasDisplayValue(day.adaptations) ? sectionHtml("Adaptations", `<p class="tk-print-pre">${escapeHtml(day.adaptations)}</p>`) : "",
      hasDisplayValue(day.safetyNotes) ? sectionHtml("Safety", `<p class="tk-print-pre">${escapeHtml(day.safetyNotes)}</p>`) : "",
    ].join("\n");
  }

  function activityCardBody(activity, selection, compact) {
    const prompts = listHtml((activity.teacherPrompts || []).map((prompt) => `${prompt.label}: ${prompt.text}`));
    const photoBits = [];
    if (!compact && selection.includeImages && activity.examplePhotoUrl) {
      photoBits.push(`<div class="tk-print-photo"><img src="${escapeHtml(activity.examplePhotoUrl)}" alt="${escapeHtml(activity.exampleAlt || activity.title)}" loading="eager" decoding="async" /><span>Example</span></div>`);
    }
    if (!compact && selection.includeImages && activity.setupPhotoUrl) {
      photoBits.push(`<div class="tk-print-photo"><img src="${escapeHtml(activity.setupPhotoUrl)}" alt="${escapeHtml(activity.setupAlt || activity.title)}" loading="eager" decoding="async" /><span>Setup</span></div>`);
    }
    const photos = photoBits.length ? `<div class="tk-print-photo-row tk-print-keep">${photoBits.join("")}</div>` : "";
    const meta = [activity.category, activity.dayLabel].filter(Boolean).join(" · ");
    return `
      <div class="tk-print-keep tk-print-activity-card">
        <h3>${escapeHtml(activity.title)}</h3>
        ${meta ? `<p class="tk-print-meta">${escapeHtml(meta)}</p>` : ""}
        ${photos}
        ${hasDisplayValue(activity.objective) ? sectionHtml("Objective", `<p>${escapeHtml(activity.objective)}</p>`) : ""}
        ${!compact && hasDisplayValue(activity.description) ? sectionHtml("Description", `<p class="tk-print-pre">${escapeHtml(activity.description)}</p>`) : ""}
        ${hasDisplayValue(activity.materialsText || (activity.materials || []).join(" · ")) ? sectionHtml("Materials", `<p>${escapeHtml(activity.materialsText || (activity.materials || []).join(" · "))}</p>`) : ""}
        ${hasDisplayValue(activity.setup) ? sectionHtml("Setup", `<p class="tk-print-pre">${escapeHtml(activity.setup)}</p>`) : ""}
        ${hasDisplayValue(activity.steps) ? sectionHtml("What to do", `<p class="tk-print-pre">${escapeHtml(activity.steps)}</p>`) : ""}
        ${!compact && hasDisplayValue(activity.teacherRole) ? sectionHtml("Teacher support", `<p class="tk-print-pre">${escapeHtml(activity.teacherRole)}</p>`) : ""}
        ${!compact ? sectionHtml("Teacher prompts", prompts) : ""}
        ${!compact ? sectionHtml("Learning goals", listHtml(activity.learningGoals)) : ""}
        ${sectionHtml("What to watch for", listHtml(activity.observationIdeas))}
        ${!compact ? sectionHtml("Vocabulary", listHtml(activity.vocabulary)) : ""}
        ${!compact && hasDisplayValue(activity.extensions) ? sectionHtml("Extensions", `<p class="tk-print-pre">${escapeHtml(activity.extensions)}</p>`) : ""}
        ${!compact && hasDisplayValue(activity.adaptations || activity.ageModifications) ? sectionHtml("Adaptations", `<p class="tk-print-pre">${escapeHtml(activity.adaptations || activity.ageModifications)}</p>`) : ""}
        ${hasDisplayValue(activity.safetyNotes) ? sectionHtml("Safety", `<p class="tk-print-pre">${escapeHtml(activity.safetyNotes)}</p>`) : ""}
      </div>
    `;
  }

  function printablesBody(model) {
    const items = model.printables || [];
    if (!items.length) return "";
    const note = `<p class="tk-print-callout tk-print-keep"><strong>Printable resources:</strong> Titles and directions below. Actual printable file pages are not merged into this binder PDF yet — download each printable from the Teaching Kit when needed.</p>`;
    const cards = items.map((item) => `
      <div class="tk-print-block tk-print-keep">
        <strong>${escapeHtml(item.title)}</strong>
        ${item.category ? `<p class="tk-print-meta">${escapeHtml(item.category)}</p>` : ""}
        ${item.pageCount ? `<p>Pages: ${escapeHtml(String(item.pageCount))}</p>` : ""}
        ${hasDisplayValue(item.printingDirections) ? `<p class="tk-print-pre">${escapeHtml(item.printingDirections)}</p>` : ""}
        ${(item.usedInWeek || []).length ? `<p>Used in week: ${escapeHtml(item.usedInWeek.map((slot) => [slot.dayLabel, slot.moment].filter(Boolean).join(" · ")).join("; "))}</p>` : ""}
        ${item.hasEmbeddedPages ? "" : `<p class="tk-print-muted">File pages not embedded in this PDF.</p>`}
      </div>
    `).join("");
    return note + cards;
  }

  function songsBody(model, lyricsOnly) {
    const songs = (model.songs || []).filter((song) => (lyricsOnly ? song.lyricsPrintable : true));
    if (!songs.length) return "";
    return songs.map((song) => `
      <div class="tk-print-block tk-print-keep">
        <strong>${escapeHtml(song.title)}</strong>
        ${song.rights ? `<p class="tk-print-meta">${escapeHtml(song.rights)}</p>` : ""}
        ${hasDisplayValue(song.notes) ? `<p>${escapeHtml(song.notes)}</p>` : ""}
        ${hasDisplayValue(song.motions) ? `<p><em>Motions / props:</em> ${escapeHtml(song.motions)}</p>` : ""}
        ${song.lyricsPrintable && song.lyrics ? `<p class="tk-print-pre"><em>${escapeHtml(song.lyrics)}</em></p>` : (lyricsOnly ? "" : `<p class="tk-print-muted">Lyrics not included (rights do not allow display).</p>`)}
      </div>
    `).join("");
  }

  function booksBody(model) {
    const books = model.books || [];
    if (!books.length) return "";
    return books.map((book) => `
      <div class="tk-print-block tk-print-keep">
        <strong>${escapeHtml(book.title)}</strong>
        ${book.author ? `<p>by ${escapeHtml(book.author)}</p>` : ""}
        ${hasDisplayValue(book.whyThisBook) ? `<p>${escapeHtml(book.whyThisBook)}</p>` : ""}
        ${sectionHtml("Discussion prompts", listHtml(book.readAloudQuestions))}
        ${sectionHtml("Extension ideas", listHtml(book.extensionIdeas))}
      </div>
    `).join("");
  }

  function examplesBody(model) {
    const images = model.examples || [];
    if (!images.length) return "";
    return `<div class="tk-print-photo-row">${images.map((image) => `
      <div class="tk-print-photo tk-print-keep">
        <img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.alt || image.caption || "Example")}" loading="eager" decoding="async" />
        <span>${escapeHtml(image.caption || image.kind || "Example")}</span>
      </div>
    `).join("")}</div>`;
  }

  function toolkitBody(model) {
    const toolkit = model.toolkit || {};
    const setup = toolkit.mondayMorningSetup || {};
    const prep = (setup.prepTasks || []).map((task) => `${task.label}${task.minutes ? ` (~${task.minutes} min)` : ""}${task.detail ? ` — ${task.detail}` : ""}`);
    const printChecklist = (setup.printChecklist || []).map((item) => `${item.label}${(item.usedInWeek || []).length ? ` (${item.usedInWeek.join("; ")})` : ""}`);
    return [
      `<h3>Monday Morning Setup</h3>`,
      setup.estimatedPrepMinutes ? `<p class="tk-print-lede"><strong>Estimated prep time:</strong> about ${escapeHtml(String(setup.estimatedPrepMinutes))} minutes</p>` : "",
      (setup.missingMaterials || []).length
        ? `<div class="tk-print-callout tk-print-keep"><strong>Needs attention:</strong> ${escapeHtml(setup.missingMaterials.join(" · "))}</div>`
        : "",
      sectionHtml("Master materials", listHtml(setup.materials)),
      sectionHtml("Prep checklist", listHtml(prep)),
      sectionHtml("Print checklist", listHtml(printChecklist)),
      sectionHtml("Vocabulary", listHtml((model.overview?.vocabulary || []).map((word) => word.word))),
      sectionHtml("Teaching tips", listHtml(toolkit.teachingTips)),
      sectionHtml("Safety", listHtml(model.overview?.safety)),
      sectionHtml("Cleanup", listHtml(toolkit.cleanup)),
      sectionHtml("Observation guidance", listHtml(toolkit.observationGuidance)),
      hasDisplayValue(toolkit.adaptations) ? sectionHtml("Adaptations / inclusion", `<p class="tk-print-pre">${escapeHtml(toolkit.adaptations)}</p>`) : "",
      hasDisplayValue(toolkit.familyResources) ? sectionHtml("Family resources", `<div class="tk-print-message">${escapeHtml(toolkit.familyResources)}</div>`) : "",
      hasDisplayValue(toolkit.notes) ? sectionHtml("Teacher notes", `<p class="tk-print-pre">${escapeHtml(toolkit.notes)}</p>`) : "",
    ].join("\n");
  }

  function teacherNotesBody() {
    const dayLines = WEEKDAYS.map((day) => `
      <div class="tk-print-notes-row tk-print-keep">
        <h3>${escapeHtml(DAY_LABELS[day])}</h3>
        <p class="tk-print-write-line"></p>
        <p class="tk-print-write-line"></p>
      </div>
    `).join("");
    return `
      <p><strong>Week of:</strong> ________________________ &nbsp;&nbsp; <strong>Child / Group:</strong> ________________________</p>
      ${dayLines}
      <div class="tk-print-keep">
        <h3>What worked?</h3>
        <p class="tk-print-write-line"></p>
        <p class="tk-print-write-line"></p>
        <h3>What should we repeat / extend?</h3>
        <p class="tk-print-write-line"></p>
        <p class="tk-print-write-line"></p>
        <h3>Child support notes</h3>
        <p class="tk-print-write-line"></p>
        <p class="tk-print-write-line"></p>
      </div>
    `;
  }

  function countPrintPages(html) {
    return (String(html || "").match(/data-tk-print-tab=/g) || []).length;
  }

  function packActivityPages(activities, selection, tab, compact) {
    if (!activities.length) return "";
    const chunks = [];
    // Practical density: Full Weekly packs ~3 cards/page; Entire Binder ~2 richer cards/page.
    const perPage = compact ? 3 : 2;
    for (let i = 0; i < activities.length; i += perPage) {
      const slice = activities.slice(i, i + perPage);
      const body = slice.map((activity) => activityCardBody(activity, selection, compact)).join("\n");
      const title = slice.length === 1 ? slice[0].title : (compact ? "Activity Instructions" : "Activity Cards");
      chunks.push(page(tab, title, body, selection.footerLabel));
    }
    return chunks.join("\n");
  }

  function buildModel(kit, options) {
    const api = modelApi();
    if (!api?.buildPrintableTeachingKitModel) {
      return { ok: false, reason: "model_missing" };
    }
    return api.buildPrintableTeachingKitModel(kit, options?.plan || null, {
      removedActivityIds: options?.removedActivityIds,
    });
  }

  function assembleEntireBinder(model, selection) {
    const sectionIds = new Set((model.sections || []).map((section) => section.id));
    const chunks = [];
    chunks.push(coverFromModel(model, selection));
    chunks.push(tocHtml(model, selection, sectionIds));
    if (sectionIds.has("overview")) {
      chunks.push(page("Overview", "Tab 1 — Overview", overviewBody(model), selection.footerLabel));
    }
    if (sectionIds.has("weekAtAGlance")) {
      chunks.push(page("Week at a Glance", "Tab 2 — Week at a Glance", weekGlanceBody(model), selection.footerLabel));
    }
    if (sectionIds.has("dailyPlans")) {
      (model.days || []).forEach((day) => {
        const body = dailyPlanBody(day);
        if (!text(body.replace(/<[^>]+>/g, ""))) return;
        chunks.push(page("Daily Plans", `${day.dayLabel} · Daily Plan`, body, selection.footerLabel));
      });
    }
    if (sectionIds.has("activities")) {
      chunks.push(packActivityPages(model.activities || [], selection, "Activity Cards", false));
    }
    if (sectionIds.has("printables")) {
      chunks.push(page("Printables", "Tab 5 — Printables", printablesBody(model), selection.footerLabel));
    }
    if (sectionIds.has("songs")) {
      chunks.push(page("Songs", "Tab 6 — Songs", songsBody(model, false), selection.footerLabel));
    }
    if (sectionIds.has("books")) {
      chunks.push(page("Books", "Tab 7 — Books", booksBody(model), selection.footerLabel));
    }
    if (sectionIds.has("examples") && selection.includeImages) {
      chunks.push(page("Example Images", "Tab 8 — Example Images", examplesBody(model), selection.footerLabel));
    }
    if (sectionIds.has("toolkit")) {
      chunks.push(page("Teacher Toolkit", "Tab 9 — Teacher Toolkit", toolkitBody(model), selection.footerLabel));
    }
    if (sectionIds.has("teacherNotes")) {
      chunks.push(page("Teacher Notes", "Tab 10 — Teacher Notes / Planning", teacherNotesBody(), selection.footerLabel));
    }
    return chunks;
  }

  function assembleFullWeekly(model, selection) {
    const chunks = [];
    chunks.push(coverFromModel(model, { ...selection, documentMode: "full_weekly" }));
    const overview = overviewBody(model);
    const glance = weekGlanceBody(model);
    const overviewCombined = [
      text(overview.replace(/<[^>]+>/g, "")) ? overview : "",
      text(glance.replace(/<[^>]+>/g, "")) ? `<h3>Week at a Glance</h3>${glance}` : "",
    ].join("\n");
    if (text(overviewCombined.replace(/<[^>]+>/g, ""))) {
      chunks.push(page("Overview", "Overview & Week at a Glance", overviewCombined, selection.footerLabel));
    }
    // Pack weekdays into fewer pages for a practical teacher plan (~8–12 pages total).
    const dayEntries = (model.days || []).map((day) => {
      const body = dailyPlanBody(day);
      if (!text(body.replace(/<[^>]+>/g, ""))) return null;
      return {
        label: day.dayLabel,
        html: `<div class="tk-print-keep tk-print-day-card"><h3>${escapeHtml(day.dayLabel)}</h3>${body}</div>`,
      };
    }).filter(Boolean);
    for (let i = 0; i < dayEntries.length; i += 2) {
      const slice = dayEntries.slice(i, i + 2);
      const label = slice.map((entry) => entry.label).join(" & ");
      chunks.push(page("Daily Plans", label, slice.map((entry) => entry.html).join("\n"), selection.footerLabel));
    }
    if ((model.activities || []).length) {
      chunks.push(packActivityPages(model.activities, selection, "Activities", true));
    }
    const refs = [
      sectionHtml("Materials", listHtml((model.overview?.masterMaterials || []).slice(0, 40))),
      sectionHtml("Books", listHtml((model.books || []).map((book) => [book.title, book.author ? `by ${book.author}` : ""].filter(Boolean).join(" — ")))),
      sectionHtml("Songs", listHtml((model.songs || []).map((song) => song.title))),
      sectionHtml("Safety", listHtml(model.overview?.safety)),
      sectionHtml("Observation focus", listHtml(model.overview?.observationFocus)),
      hasDisplayValue(model.overview?.adaptations) ? sectionHtml("Adaptations", `<p class="tk-print-pre">${escapeHtml(model.overview.adaptations)}</p>`) : "",
      teacherNotesBody(),
    ].join("\n");
    if (text(refs.replace(/<[^>]+>/g, ""))) {
      chunks.push(page("Resources", "Materials · Guidance · Planning Notes", refs, selection.footerLabel));
    }
    return chunks;
  }

  function assembleMode(model, selection) {
    const mode = selection.documentMode || "entire_binder";
    const daysFilter = selection.days || [];
    if (mode === "entire_binder") return assembleEntireBinder(model, selection);
    if (mode === "full_weekly") return assembleFullWeekly(model, selection);

    const chunks = [];
    if (selection.parts.cover !== false && mode !== "one_activity" && mode !== "song_lyrics") {
      chunks.push(coverFromModel(model, selection));
    }

    if (mode === "overview" || mode === "weekly_overview") {
      chunks.push(page("Overview", "Weekly Overview", overviewBody(model), selection.footerLabel));
      return chunks;
    }
    if (mode === "one_day") {
      const dayKey = daysFilter[0] || "monday";
      const day = (model.days || []).find((item) => item.day === dayKey);
      if (day) chunks.push(page("Daily Plans", `${day.dayLabel} Plan`, dailyPlanBody(day), selection.footerLabel));
      const dayActs = (model.activities || []).filter((item) => item.dayOfWeek === dayKey);
      if (dayActs.length) chunks.push(packActivityPages(dayActs, selection, "Activities", true));
      return chunks;
    }
    if (mode === "activities") {
      chunks.push(packActivityPages(model.activities || [], selection, "Activities", false));
      return chunks;
    }
    if (mode === "one_activity") {
      const activity = (model.activities || []).find((item) => item.id === selection.activityId)
        || (model.activities || [])[0];
      if (activity) chunks.push(page("Activities", activity.title, activityCardBody(activity, selection, false), selection.footerLabel));
      return chunks;
    }
    if (mode === "songs") {
      chunks.push(page("Songs", "Songs", songsBody(model, false), selection.footerLabel));
      return chunks;
    }
    if (mode === "song_lyrics") {
      const body = songsBody(model, true);
      if (body) chunks.push(page("Song Lyrics", "Song Lyrics", body, selection.footerLabel));
      return chunks;
    }
    if (mode === "books") {
      chunks.push(page("Books", "Book Guide", booksBody(model), selection.footerLabel));
      return chunks;
    }
    if (mode === "materials") {
      chunks.push(page("Materials", "Materials List", sectionHtml("Master materials", listHtml(model.overview?.masterMaterials)), selection.footerLabel));
      return chunks;
    }
    if (mode === "toolkit" || mode === "monday_setup") {
      chunks.push(page("Teacher Toolkit", mode === "monday_setup" ? "Monday Morning Setup" : "Teacher Toolkit", toolkitBody(model), selection.footerLabel));
      return chunks;
    }
    if (mode === "printables") {
      if ((model.printables || []).length) {
        chunks.push(page("Printables", "Printable Resources", printablesBody(model), selection.footerLabel));
      }
      return chunks;
    }
    if (mode === "family") {
      const body = [
        hasDisplayValue(model.overview?.familyConnection) ? sectionHtml("Family connection", `<div class="tk-print-message">${escapeHtml(model.overview.familyConnection)}</div>`) : "",
        sectionHtml("Vocabulary", listHtml((model.overview?.vocabulary || []).map((word) => word.word))),
        sectionHtml("Songs", listHtml((model.songs || []).map((song) => song.title))),
        sectionHtml("Books", listHtml((model.books || []).map((book) => book.title))),
      ].join("\n");
      chunks.push(page("Families", "Parent Connection", body, selection.footerLabel));
      return chunks;
    }
    return assembleEntireBinder(model, selection);
  }

  function wrapPrintRoot(chunks, selection) {
    const pages = chunks.filter((chunk) => String(chunk || "").includes("tk-print-page"));
    if (!pages.length) {
      pages.push(page(
        "Cover",
        selection.footerLabel || "Teaching Kit",
        `<p class="tk-print-muted">This Teaching Kit does not have printable section content yet.</p>`,
        selection.footerLabel,
      ));
    }
    const html = `
      <div class="tk-print-root${selection.inkSaver ? " is-ink-saver" : ""}" data-teaching-kit-print-root data-tk-document-mode="${escapeHtml(selection.documentMode || "")}" data-tk-paper="${escapeHtml(selection.paperSize)}">
        ${pageSizeStyleTag(selection.paperSize)}
        ${selection.watermark ? `<div class="tk-print-watermark" aria-hidden="true">${escapeHtml(selection.watermark)}</div>` : ""}
        ${pages.join("\n")}
      </div>
    `;
    return {
      ok: true,
      reason: "ok",
      html,
      selection,
      paperSize: selection.paperSize,
      documentMode: selection.documentMode,
      pageCount: countPrintPages(html),
    };
  }

  function buildBinderPrintHtml(kit, options) {
    if (!kit || kit.ok === false || kit.locked || !kit.companion) {
      return { ok: false, reason: "unavailable", html: "", pageCount: 0 };
    }
    const selection = normalizeSelection(kit, options);
    const model = buildModel(kit, { ...options, plan: selection.plan || options?.plan });
    if (!model.ok) {
      return { ok: false, reason: model.reason || "unavailable", html: "", pageCount: 0 };
    }

    // Strip unavailable legacy parts for selection reporting (Print Center checkboxes).
    const availability = evaluatePrintPartAvailability(kit, {
      removedActivityIds: options && options.removedActivityIds,
    });
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

    // Filter model activities for removed IDs already handled in model builder.
    if (selection.documentMode === "one_activity" && selection.activityId) {
      model.activities = (model.activities || []).filter((item) => item.id === selection.activityId);
    }

    const chunks = assembleMode(model, selection);
    const built = wrapPrintRoot(chunks, selection);
    built.model = {
      ok: model.ok,
      title: model.title,
      sections: model.sections,
      capabilities: model.capabilities,
      source: model.source,
    };
    return built;
  }

  function buildFullWeeklyLessonPlanHtml(kit, options) {
    return buildBinderPrintHtml(kit, { ...(options || {}), preset: "full_weekly_plan", documentMode: "full_weekly" });
  }

  function buildEntireBinderKitHtml(kit, options) {
    return buildBinderPrintHtml(kit, { ...(options || {}), preset: "week_binder", documentMode: "entire_binder" });
  }

  /** Plain-text Full Weekly Lesson Plan for PDF download path (practical teacher plan). */
  function buildFullWeeklyLessonPlanText(kit, options) {
    const selection = normalizeSelection(kit, { ...(options || {}), preset: "full_weekly_plan", documentMode: "full_weekly" });
    const model = buildModel(kit, { ...options, plan: selection.plan || options?.plan });
    if (!model.ok) return "";
    const lines = [];
    const push = (value) => { if (text(value)) lines.push(text(value)); };
    const blank = () => { if (lines.length && lines[lines.length - 1] !== "") lines.push(""); };
    const heading = (label) => { blank(); lines.push(label); };
    const bullets = (items) => (items || []).forEach((item) => { if (text(item)) lines.push(`- ${text(item)}`); });

    lines.push("Little Learner Hub · Full Weekly Lesson Plan");
    push(model.title);
    if (model.theme) push(`Theme: ${model.theme}`);
    if (model.age) push(`Age group: ${model.age}`);
    if (model.duration) push(`Duration: ${model.duration}`);

    const o = model.overview || {};
    heading("Overview");
    push(o.weeklyOverview);
    if (o.learningObjectives?.length) { heading("Learning objectives"); bullets(o.learningObjectives); }
    if (o.learningDomains?.length) { heading("Learning domains"); bullets(o.learningDomains); }
    if (o.vocabulary?.length) {
      heading("Vocabulary");
      bullets(o.vocabulary.map((word) => word.word));
    }
    if (o.masterMaterials?.length) { heading("Materials"); bullets(o.masterMaterials.slice(0, 40)); }
    if (o.safety?.length) { heading("Safety"); bullets(o.safety); }
    if (hasDisplayValue(o.adaptations)) { heading("Adaptations"); push(o.adaptations); }
    if (o.observationFocus?.length) { heading("Observation focus"); bullets(o.observationFocus); }
    if (hasDisplayValue(o.familyConnection)) { heading("Family connection"); push(o.familyConnection); }

    heading("Week at a Glance");
    (model.days || []).forEach((day) => {
      const focus = day.focus || (day.activityTitles || []).slice(0, 3).join("; ");
      if (!focus && !(day.activityTitles || []).length) return;
      push(`${day.dayLabel}: ${focus || (day.activityTitles || []).join("; ")}`);
    });

    (model.days || []).forEach((day) => {
      const has = day.focus || day.schedule?.length || day.activityTitles?.length || day.books?.length || day.songs?.length;
      if (!has) return;
      heading(day.dayLabel);
      if (day.focus) push(day.focus);
      if (day.activityTitles?.length) { push("Activities"); bullets(day.activityTitles); }
      if (day.books?.length) bullets(day.books.map((book) => `Book: ${book.title}`));
      if (day.songs?.length) bullets(day.songs.map((song) => `Song: ${song.title}`));
      if (day.observations?.length) { push("What to watch for"); bullets(day.observations); }
    });

    if ((model.activities || []).length) {
      heading("Activity Instructions");
      (model.activities || []).forEach((activity) => {
        blank();
        push(activity.title);
        if (activity.category || activity.dayLabel) push([activity.category, activity.dayLabel].filter(Boolean).join(" · "));
        if (activity.objective) { push("Objective"); push(activity.objective); }
        if (activity.materialsText) { push("Materials"); push(activity.materialsText); }
        if (activity.setup) { push("Setup"); push(activity.setup); }
        if (activity.steps) { push("What to do"); push(activity.steps); }
        if (activity.observationIdeas?.length) { push("What to watch for"); bullets(activity.observationIdeas); }
        if (activity.safetyNotes) { push("Safety"); push(activity.safetyNotes); }
      });
    }

    if ((model.books || []).length) {
      heading("Books");
      bullets((model.books || []).map((book) => [book.title, book.author ? `by ${book.author}` : ""].filter(Boolean).join(" — ")));
    }
    if ((model.songs || []).length) {
      heading("Songs");
      bullets((model.songs || []).map((song) => song.title));
    }

    heading("Planning Notes");
    push("Week of: ____________________    Child/Group: ____________________");
    WEEKDAYS.forEach((day) => push(`${DAY_LABELS[day]} notes: ________________________________`));
    push("What worked? ________________________________");
    push("What should we repeat/extend? ________________________________");
    push("Child support notes: ________________________________");

    while (lines.length && lines[lines.length - 1] === "") lines.pop();
    return `${lines.join("\n")}\n`;
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
    buildEntireBinderKitHtml,
    buildFullWeeklyLessonPlanHtml,
    buildFullWeeklyLessonPlanText,
  };
});
