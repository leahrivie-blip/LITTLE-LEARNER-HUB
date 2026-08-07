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

  /** Split prose into short teacher-friendly bullets (presentation only). */
  function toBullets(value, limit = 8) {
    if (Array.isArray(value)) {
      return value.map((item) => text(item)).filter(Boolean).slice(0, limit);
    }
    const raw = text(value);
    if (!raw) return [];
    const numbered = raw.match(/(?:^|\n)\s*\d+[\.)]\s+[^\n]+/g);
    if (numbered && numbered.length >= 2) {
      return numbered.map((line) => line.replace(/^\s*\d+[\.)]\s*/, "").trim()).filter(Boolean).slice(0, limit);
    }
    const lines = raw.split(/\r?\n+|;\s+|\u2022|\u2023/).map((line) => line.replace(/^[-*•]\s*/, "").trim()).filter(Boolean);
    if (lines.length >= 2) return lines.slice(0, limit);
    const sentences = raw.split(/(?<=[.!?])\s+/).map((line) => line.trim()).filter((line) => line.length > 2);
    return (sentences.length ? sentences : [raw]).slice(0, limit);
  }

  function materialsList(value) {
    if (Array.isArray(value)) return value.map((item) => text(item)).filter(Boolean);
    const raw = text(value);
    if (!raw) return [];
    return raw.split(/\r?\n+|,\s+|;\s+|·\s+/).map((item) => item.replace(/^[-*•M]\s*/, "").trim()).filter(Boolean);
  }

  function checkboxListHtml(items, limit = 20) {
    const rows = (items || []).map((item) => text(item)).filter(Boolean).slice(0, limit);
    if (!rows.length) return "";
    return `<ul class="tk-print-check">${rows.map((row) => `<li><span class="tk-print-check-box" aria-hidden="true"></span><span>${escapeHtml(row)}</span></li>`).join("")}</ul>`;
  }

  function numberedListHtml(items, limit = 8) {
    const rows = (items || []).map((item) => text(item)).filter(Boolean).slice(0, limit);
    if (!rows.length) return "";
    return `<ol class="tk-print-steps">${rows.map((row) => `<li>${escapeHtml(row)}</li>`).join("")}</ol>`;
  }

  function bulletListHtml(items, limit = 8) {
    const rows = (items || []).map((item) => text(item)).filter(Boolean).slice(0, limit);
    if (!rows.length) return "";
    return `<ul class="tk-print-bullets">${rows.map((row) => `<li>${escapeHtml(row)}</li>`).join("")}</ul>`;
  }

  function panelHtml(label, innerHtml, icon) {
    if (!text(innerHtml)) return "";
    return `
      <div class="tk-print-panel tk-print-keep">
        <div class="tk-print-panel-label">${icon ? `<span class="tk-print-icon" aria-hidden="true">${escapeHtml(icon)}</span>` : ""}<span>${escapeHtml(label)}</span></div>
        <div class="tk-print-panel-body">${innerHtml}</div>
      </div>
    `;
  }

  function badgeHtml(label) {
    const copy = text(label);
    if (!copy) return "";
    return `<span class="tk-print-badge">${escapeHtml(copy)}</span>`;
  }

  function chipRowHtml(items) {
    const rows = (items || []).map((item) => text(item)).filter(Boolean);
    if (!rows.length) return "";
    return `<div class="tk-print-chip-row">${rows.map((row) => `<span class="tk-print-chip">${escapeHtml(row)}</span>`).join("")}</div>`;
  }

  function shortText(value, max = 140) {
    const raw = text(value);
    if (!raw) return "";
    if (raw.length <= max) return raw;
    return `${raw.slice(0, max - 1).trim()}…`;
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
        <div class="tk-print-title-bar">
          <h2 class="tk-print-page-title">${escapeHtml(title)}</h2>
        </div>
        <div class="tk-print-body">${bodyHtml}</div>
        <footer class="tk-print-footer">
          <span>${escapeHtml(footerLabel)}</span>
          <span class="tk-print-page-number" aria-hidden="true"></span>
        </footer>
      </section>
    `;
  }

  function coverFromModel(model, selection) {
    const packLabel = selection.documentMode === "full_weekly" ? "Full Weekly Lesson Plan" : "Entire Binder Kit";
    const coverImg = selection.includeImages && model.coverImageUrl
      ? `<div class="tk-print-cover-image"><img src="${escapeHtml(model.coverImageUrl)}" alt="${escapeHtml(model.coverImageAlt || model.title)}" loading="eager" decoding="async" /></div>`
      : "";
    const sectionPills = (model.sections || [])
      .filter((section) => !["cover", "toc"].includes(section.id))
      .map((section) => section.label);
    return `
      <section class="tk-print-page tk-print-cover" data-tk-print-tab="Cover">
        <div class="tk-print-cover-inner">
          <p class="tk-print-brand">Little Learner Hub</p>
          <p class="tk-print-cover-kicker">${escapeHtml(packLabel)}</p>
          ${coverImg}
          <h1>${escapeHtml(model.title || "Teaching Kit")}</h1>
          <div class="tk-print-cover-meta">
            ${model.age ? `<div class="tk-print-cover-meta-card"><span>Age</span><strong>${escapeHtml(model.age)}</strong></div>` : ""}
            ${model.theme ? `<div class="tk-print-cover-meta-card"><span>Theme</span><strong>${escapeHtml(model.theme)}</strong></div>` : ""}
            ${model.duration ? `<div class="tk-print-cover-meta-card"><span>Duration</span><strong>${escapeHtml(model.duration)}</strong></div>` : ""}
            <div class="tk-print-cover-meta-card"><span>Activities</span><strong>${escapeHtml(String((model.activities || []).length))}</strong></div>
          </div>
          ${chipRowHtml(sectionPills)}
          <p class="tk-print-cover-note">Teacher binder pages · Empty sections are omitted automatically.</p>
        </div>
        <footer class="tk-print-footer">
          <span>${escapeHtml(selection.footerLabel)}</span>
          <span class="tk-print-page-number"></span>
        </footer>
      </section>
    `;
  }

  function overviewSnapshotHtml(model) {
    const o = model.overview || {};
    const vocab = (o.vocabulary || []).map((word) => word.word).filter(Boolean);
    const prep = (o.teacherPrep || []).map((task) => `${task.label}${task.minutes ? ` (~${task.minutes} min)` : ""}`);
    return `
      <div class="tk-print-snapshot-grid">
        ${hasDisplayValue(o.weeklyOverview) ? panelHtml("Week focus", `<p class="tk-print-tight">${escapeHtml(shortText(o.weeklyOverview, 180))}</p>`, "*") : ""}
        ${panelHtml("Objectives", bulletListHtml(o.learningObjectives, 6), "O")}
        ${panelHtml("Domains", chipRowHtml(o.learningDomains), "D")}
        ${panelHtml("Vocabulary", chipRowHtml(vocab.slice(0, 12)), "Aa")}
        ${panelHtml("Prep", bulletListHtml(prep, 5), "T")}
        ${o.estimatedPrepMinutes ? `<div class="tk-print-stat-pill"><span>Estimated prep</span><strong>${escapeHtml(String(o.estimatedPrepMinutes))} min</strong></div>` : ""}
      </div>
    `;
  }

  function overviewBody(model) {
    const o = model.overview || {};
    return [
      overviewSnapshotHtml(model),
      panelHtml("Master materials", checkboxListHtml(o.masterMaterials, 24), "M"),
      panelHtml("Safety", bulletListHtml(o.safety, 5), "!"),
      panelHtml("Watch for", bulletListHtml(o.observationFocus, 5), "W"),
      panelHtml("Adaptations", bulletListHtml(toBullets(o.adaptations, 4), 4), "+"),
      panelHtml("Family connection", bulletListHtml(toBullets(o.familyConnection, 3), 3), "F"),
    ].join("\n");
  }

  function weekGlanceCell(lines) {
    const rows = (lines || []).map((item) => text(item)).filter(Boolean).slice(0, 4);
    if (!rows.length) return `<span class="tk-print-muted">—</span>`;
    return `<ul class="tk-print-cell-list">${rows.map((row) => `<li>${escapeHtml(shortText(row, 70))}</li>`).join("")}</ul>`;
  }

  function weekGlanceBody(model, daysFilter) {
    const days = (model.days || []).filter((day) => !daysFilter || daysFilter.includes(day.day));
    if (!days.length) return "";
    const rows = [
      ["Focus", (day) => [day.focus]],
      ["Circle", (day) => day.circleTime],
      ["Book", (day) => (day.books || []).map((book) => book.title)],
      ["Song", (day) => (day.songs || []).map((song) => song.title)],
      ["Activities", (day) => day.activityTitles || (day.activities || []).map((item) => item.title)],
      ["Centers", (day) => [day.sensory, day.fineMotor, day.art, day.stem, day.smallGroup].filter(Boolean)],
      ["Movement", (day) => [day.grossMotor || day.outdoorPlay].filter(Boolean)],
      ["Watch for", (day) => day.observations],
    ];
    const head = `<tr><th scope="col">Plan</th>${days.map((day) => `<th scope="col">${escapeHtml(day.dayLabel)}</th>`).join("")}</tr>`;
    const body = rows.map(([label, getter]) => {
      const cells = days.map((day) => weekGlanceCell(getter(day)));
      if (cells.every((cell) => cell.includes("tk-print-muted"))) return "";
      return `<tr><th scope="row">${escapeHtml(label)}</th>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`;
    }).filter(Boolean).join("");
    return `
      <table class="tk-print-wag-table">
        <thead>${head}</thead>
        <tbody>${body}</tbody>
      </table>
    `;
  }

  function dailyPlanBody(day) {
    const scheduleBits = (day.schedule || []).map((slot) => `${slot.time ? `${slot.time} ` : ""}${slot.label}`).filter(Boolean);
    return `
      <article class="tk-print-day-sheet tk-print-keep">
        <header class="tk-print-day-sheet-head">
          <h3>${escapeHtml(day.dayLabel)}</h3>
          ${day.focus ? `<p>${escapeHtml(shortText(day.focus, 120))}</p>` : ""}
        </header>
        <div class="tk-print-day-sheet-grid">
          ${panelHtml("Schedule", bulletListHtml(scheduleBits, 6), "S")}
          ${panelHtml("Circle", bulletListHtml(day.circleTime, 4), "C")}
          ${panelHtml("Books", bulletListHtml((day.books || []).map((book) => book.title), 3), "B")}
          ${panelHtml("Songs", bulletListHtml((day.songs || []).map((song) => song.title), 3), "N")}
          ${panelHtml("Activities", bulletListHtml(day.activityTitles || [], 6), "A")}
          ${panelHtml("Materials", checkboxListHtml(day.materials, 8), "M")}
          ${panelHtml("Watch for", bulletListHtml(day.observations, 4), "W")}
          ${panelHtml("Family", bulletListHtml(toBullets(day.parentMessage, 2), 2), "F")}
        </div>
      </article>
    `;
  }

  function activityCardBody(activity, selection, compact) {
    const materials = materialsList(activity.materials?.length ? activity.materials : activity.materialsText);
    const steps = toBullets(activity.steps, compact ? 5 : 7);
    const tips = [
      ...toBullets(activity.teacherRole, 2),
      ...(activity.teacherPrompts || []).map((prompt) => text(prompt.text)).filter(Boolean),
    ].slice(0, compact ? 3 : 5);
    const watch = (activity.observationIdeas || []).slice(0, compact ? 3 : 5);
    const photoBits = [];
    if (selection.includeImages && activity.setupPhotoUrl) {
      photoBits.push(`<figure class="tk-print-card-photo"><img src="${escapeHtml(activity.setupPhotoUrl)}" alt="${escapeHtml(activity.setupAlt || `Setup for ${activity.title}`)}" loading="eager" decoding="async" /><figcaption>Setup</figcaption></figure>`);
    }
    if (selection.includeImages && activity.examplePhotoUrl) {
      photoBits.push(`<figure class="tk-print-card-photo"><img src="${escapeHtml(activity.examplePhotoUrl)}" alt="${escapeHtml(activity.exampleAlt || `Example for ${activity.title}`)}" loading="eager" decoding="async" /><figcaption>Finished</figcaption></figure>`);
    }
    return `
      <article class="tk-print-keep tk-print-activity-card">
        <header class="tk-print-activity-head">
          <div>
            <h3>${escapeHtml(activity.title)}</h3>
            <div class="tk-print-badge-row">
              ${badgeHtml(activity.category)}
              ${badgeHtml(activity.dayLabel)}
            </div>
            ${hasDisplayValue(activity.objective) ? `<p class="tk-print-objective">${escapeHtml(shortText(activity.objective, 110))}</p>` : ""}
          </div>
          ${photoBits.length ? `<div class="tk-print-card-photos">${photoBits.join("")}</div>` : ""}
        </header>
        <div class="tk-print-activity-grid">
          ${panelHtml("Materials", checkboxListHtml(materials, compact ? 6 : 10), "M")}
          ${panelHtml("Setup", `<p class="tk-print-tight">${escapeHtml(shortText(activity.setup, compact ? 110 : 160))}</p>`, "U")}
          ${panelHtml("What to do", numberedListHtml(steps, compact ? 5 : 7), "1")}
          ${panelHtml("Teacher tips", bulletListHtml(tips, compact ? 3 : 5), "P")}
          ${panelHtml("What to watch for", bulletListHtml(watch, compact ? 3 : 5), "W")}
          ${!compact && hasDisplayValue(activity.safetyNotes) ? panelHtml("Safety", bulletListHtml(toBullets(activity.safetyNotes, 2), 2), "!") : ""}
        </div>
      </article>
    `;
  }

  function printablesBody(model) {
    const items = model.printables || [];
    if (!items.length) return "";
    const note = `<div class="tk-print-callout tk-print-keep"><strong>Printable resources</strong><span>Titles and directions below. File pages are not merged into this PDF yet — download each printable from the Teaching Kit.</span></div>`;
    const cards = items.map((item) => `
      <article class="tk-print-resource-card tk-print-keep">
        <header>
          <h3>${escapeHtml(item.title)}</h3>
          ${badgeHtml(item.category || "Printable")}
        </header>
        ${item.previewUrl ? `<div class="tk-print-resource-preview"><img src="${escapeHtml(item.previewUrl)}" alt="${escapeHtml(item.title)}" loading="eager" decoding="async" /></div>` : ""}
        <div class="tk-print-resource-meta">
          ${item.pageCount ? `<span>${escapeHtml(String(item.pageCount))} pages</span>` : ""}
          ${(item.usedInWeek || []).length ? `<span>${escapeHtml(item.usedInWeek.map((slot) => [slot.dayLabel, slot.moment].filter(Boolean).join(" · ")).join("; "))}</span>` : ""}
        </div>
        ${hasDisplayValue(item.printingDirections) ? `<p class="tk-print-tight">${escapeHtml(shortText(item.printingDirections, 160))}</p>` : ""}
        ${item.hasEmbeddedPages ? "" : `<p class="tk-print-muted">File pages not embedded in this PDF.</p>`}
      </article>
    `).join("");
    return note + `<div class="tk-print-resource-grid">${cards}</div>`;
  }

  function songsBody(model, lyricsOnly) {
    const songs = (model.songs || []).filter((song) => (lyricsOnly ? song.lyricsPrintable : true));
    if (!songs.length) return "";
    return `<div class="tk-print-resource-grid">${songs.map((song) => `
      <article class="tk-print-resource-card tk-print-keep">
        <header><h3>${escapeHtml(song.title)}</h3>${badgeHtml(song.rights || "Song")}</header>
        ${hasDisplayValue(song.notes) ? panelHtml("Teaching tips", bulletListHtml(toBullets(song.notes, 3), 3), "P") : ""}
        ${hasDisplayValue(song.motions) ? panelHtml("Motions / props", bulletListHtml(toBullets(song.motions, 3), 3), "N") : ""}
        ${song.lyricsPrintable && song.lyrics ? panelHtml("Lyrics", `<p class="tk-print-tight">${escapeHtml(song.lyrics)}</p>`, "L") : (lyricsOnly ? "" : `<p class="tk-print-muted">Lyrics not included (rights do not allow display).</p>`)}
      </article>
    `).join("")}</div>`;
  }

  function booksBody(model) {
    const books = model.books || [];
    if (!books.length) return "";
    return `<div class="tk-print-resource-grid">${books.map((book) => `
      <article class="tk-print-resource-card tk-print-keep">
        <header>
          <h3>${escapeHtml(book.title)}</h3>
          ${book.author ? badgeHtml(`by ${book.author}`) : badgeHtml("Book")}
        </header>
        ${hasDisplayValue(book.whyThisBook) ? `<p class="tk-print-tight">${escapeHtml(shortText(book.whyThisBook, 140))}</p>` : ""}
        ${panelHtml("Discussion prompts", bulletListHtml(book.readAloudQuestions, 4), "?")}
        ${panelHtml("Extensions", bulletListHtml(book.extensionIdeas, 3), "+")}
      </article>
    `).join("")}</div>`;
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
    const prep = (setup.prepTasks || []).map((task) => `${task.label}${task.minutes ? ` (~${task.minutes} min)` : ""}`);
    const printChecklist = (setup.printChecklist || []).map((item) => `${item.label}${(item.usedInWeek || []).length ? ` (${item.usedInWeek.join("; ")})` : ""}`);
    return `
      <div class="tk-print-section-banner">Monday Morning Setup</div>
      ${setup.estimatedPrepMinutes ? `<div class="tk-print-stat-pill"><span>Estimated prep</span><strong>${escapeHtml(String(setup.estimatedPrepMinutes))} min</strong></div>` : ""}
      ${(setup.missingMaterials || []).length ? `<div class="tk-print-callout tk-print-keep"><strong>Needs attention</strong><span>${escapeHtml(setup.missingMaterials.join(" · "))}</span></div>` : ""}
      <div class="tk-print-day-sheet-grid">
        ${panelHtml("Master materials", checkboxListHtml(setup.materials, 24), "M")}
        ${panelHtml("Prep checklist", checkboxListHtml(prep, 10), "M")}
        ${panelHtml("Print checklist", checkboxListHtml(printChecklist, 8), "M")}
        ${panelHtml("Vocabulary", chipRowHtml((model.overview?.vocabulary || []).map((word) => word.word).slice(0, 12)), "Aa")}
        ${panelHtml("Teaching tips", bulletListHtml(toolkit.teachingTips, 5), "P")}
        ${panelHtml("Safety", bulletListHtml(model.overview?.safety, 4), "!")}
        ${panelHtml("Cleanup", bulletListHtml(toolkit.cleanup, 4), "X")}
        ${panelHtml("Observation", bulletListHtml(toolkit.observationGuidance, 4), "W")}
        ${panelHtml("Adaptations", bulletListHtml(toBullets(toolkit.adaptations, 3), 3), "+")}
        ${panelHtml("Family resources", bulletListHtml(toBullets(toolkit.familyResources, 3), 3), "F")}
      </div>
    `;
  }

  function teacherNotesBody() {
    const dayLines = WEEKDAYS.map((day) => `
      <div class="tk-print-notes-card tk-print-keep">
        <h3>${escapeHtml(DAY_LABELS[day])}</h3>
        <p class="tk-print-write-line"></p>
        <p class="tk-print-write-line"></p>
      </div>
    `).join("");
    return `
      <div class="tk-print-notes-meta">
        <label>Week of <span class="tk-print-write-inline"></span></label>
        <label>Child / Group <span class="tk-print-write-inline"></span></label>
      </div>
      <div class="tk-print-notes-grid">${dayLines}</div>
      <div class="tk-print-notes-card tk-print-keep">
        <h3>What worked?</h3>
        <p class="tk-print-write-line"></p>
        <p class="tk-print-write-line"></p>
        <h3>What should we repeat / extend?</h3>
        <p class="tk-print-write-line"></p>
        <h3>Child support notes</h3>
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
    // PAGE 1: branded cover
    chunks.push(coverFromModel(model, selection));
    // PAGE 2: Week at a Glance grid (+ compact snapshot, not a prose essay)
    if (sectionIds.has("weekAtAGlance") || sectionIds.has("overview")) {
      const wag = [
        sectionIds.has("overview") ? overviewSnapshotHtml(model) : "",
        sectionIds.has("weekAtAGlance") ? weekGlanceBody(model) : "",
      ].join("\n");
      chunks.push(page("Week at a Glance", "Week at a Glance", wag, selection.footerLabel));
    }
    // PAGE 3+: daily plan sheets
    if (sectionIds.has("dailyPlans")) {
      (model.days || []).forEach((day) => {
        const body = dailyPlanBody(day);
        if (!text(body.replace(/<[^>]+>/g, ""))) return;
        chunks.push(page("Daily Plans", `${day.dayLabel} Plan`, body, selection.footerLabel));
      });
    }
    if (sectionIds.has("activities")) {
      chunks.push(packActivityPages(model.activities || [], selection, "Activity Cards", false));
    }
    if (sectionIds.has("books") || sectionIds.has("songs")) {
      const body = [
        sectionIds.has("books") ? `<div class="tk-print-section-banner">Books</div>${booksBody(model)}` : "",
        sectionIds.has("songs") ? `<div class="tk-print-section-banner">Songs</div>${songsBody(model, false)}` : "",
      ].join("\n");
      if (text(body.replace(/<[^>]+>/g, ""))) {
        chunks.push(page("Resources", "Books & Songs", body, selection.footerLabel));
      }
    }
    if (sectionIds.has("printables")) {
      chunks.push(page("Printables", "Printables", printablesBody(model), selection.footerLabel));
    }
    // Remaining example images only if not already placed on activity cards
    if (sectionIds.has("examples") && selection.includeImages) {
      const leftovers = (model.examples || []).filter((image) => {
        const onCards = (model.activities || []).some((activity) => (
          activity.examplePhotoUrl === image.url || activity.setupPhotoUrl === image.url
        ));
        return !onCards;
      });
      if (leftovers.length) {
        chunks.push(page("Example Images", "Example Images", examplesBody({ examples: leftovers }), selection.footerLabel));
      }
    }
    if (sectionIds.has("toolkit")) {
      chunks.push(page("Teacher Toolkit", "Teacher Toolkit", toolkitBody(model), selection.footerLabel));
    }
    if (sectionIds.has("overview")) {
      chunks.push(page("Materials", "Materials & Guidance", [
        panelHtml("Master materials", checkboxListHtml(model.overview?.masterMaterials, 30), "M"),
        panelHtml("Safety", bulletListHtml(model.overview?.safety, 5), "!"),
        panelHtml("Adaptations", bulletListHtml(toBullets(model.overview?.adaptations, 4), 4), "+"),
        panelHtml("Family connection", bulletListHtml(toBullets(model.overview?.familyConnection, 3), 3), "F"),
      ].join("\n"), selection.footerLabel));
    }
    if (sectionIds.has("teacherNotes")) {
      chunks.push(page("Teacher Notes", "Teacher Notes / Planning", teacherNotesBody(), selection.footerLabel));
    }
    return chunks;
  }

  function assembleFullWeekly(model, selection) {
    const chunks = [];
    chunks.push(coverFromModel(model, { ...selection, documentMode: "full_weekly" }));
    const glance = weekGlanceBody(model);
    const wagPage = [
      overviewSnapshotHtml(model),
      glance,
    ].join("\n");
    if (text(wagPage.replace(/<[^>]+>/g, ""))) {
      chunks.push(page("Week at a Glance", "Week at a Glance", wagPage, selection.footerLabel));
    }
    const dayEntries = (model.days || []).map((day) => {
      const body = dailyPlanBody(day);
      if (!text(body.replace(/<[^>]+>/g, ""))) return null;
      return { label: day.dayLabel, html: body };
    }).filter(Boolean);
    for (let i = 0; i < dayEntries.length; i += 2) {
      const slice = dayEntries.slice(i, i + 2);
      chunks.push(page(
        "Daily Plans",
        slice.map((entry) => entry.label).join(" & "),
        `<div class="tk-print-day-pair">${slice.map((entry) => entry.html).join("")}</div>`,
        selection.footerLabel,
      ));
    }
    if ((model.activities || []).length) {
      chunks.push(packActivityPages(model.activities, selection, "Activities", true));
    }
    const refs = [
      panelHtml("Materials checklist", checkboxListHtml((model.overview?.masterMaterials || []).slice(0, 30), 30), "M"),
      (model.books || []).length ? `<div class="tk-print-section-banner">Books</div>${booksBody(model)}` : "",
      (model.songs || []).length ? `<div class="tk-print-section-banner">Songs</div>${songsBody(model, false)}` : "",
      panelHtml("Safety", bulletListHtml(model.overview?.safety, 4), "!"),
      panelHtml("Watch for", bulletListHtml(model.overview?.observationFocus, 4), "W"),
      panelHtml("Adaptations", bulletListHtml(toBullets(model.overview?.adaptations, 3), 3), "+"),
      `<div class="tk-print-section-banner">Planning Notes</div>${teacherNotesBody()}`,
    ].join("\n");
    if (text(refs.replace(/<[^>]+>/g, ""))) {
      chunks.push(page("Resources", "Materials · Books · Songs · Notes", refs, selection.footerLabel));
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
      chunks.push(page(
        "Materials",
        "Materials List",
        panelHtml("Master materials", checkboxListHtml(model.overview?.masterMaterials, 40), "M"),
        selection.footerLabel,
      ));
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

  function designStyleTag() {
    // Critical binder design tokens/layout so print preview stays designed even if
    // the main stylesheet is delayed/partial. Full rules remain in styles.css.
    return `<style data-tk-print-design>
.tk-print-root{--tk-purple-deep:#542e94;--tk-purple:#6b46c1;--tk-purple-soft:#f3eefd;--tk-purple-line:#d1c2f0;--tk-ink:#2d1b4e;--tk-muted:#6b5f82;color:var(--tk-ink);background:#fff}
.tk-print-running{background:var(--tk-purple-deep);color:#fff;border-radius:8px;padding:7px 10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;font-size:.68rem;display:flex;justify-content:space-between}
.tk-print-title-bar{background:var(--tk-purple-soft);border:1px solid var(--tk-purple-line);border-left:6px solid var(--tk-purple);border-radius:10px;padding:8px 12px;margin:0 0 12px}
.tk-print-page-title{margin:0;color:var(--tk-purple-deep);font-size:1.22rem}
.tk-print-cover{background:radial-gradient(circle at 85% 18%,rgba(255,255,255,.18),transparent 28%),linear-gradient(155deg,#3b1d6e 0%,#542e94 45%,#6b46c1 100%)!important;color:#fff!important;border-radius:14px;padding:28px 24px;min-height:9.2in;display:flex;flex-direction:column;justify-content:space-between}
.tk-print-cover .tk-print-footer{color:rgba(255,255,255,.88);border-top:1px solid rgba(255,255,255,.28)}
.tk-print-cover-meta{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.tk-print-cover-meta-card{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.22);border-radius:10px;padding:8px 10px}
.tk-print-panel{border:1px solid var(--tk-purple-line);border-radius:10px;overflow:hidden;background:#fff}
.tk-print-panel-label{display:flex;gap:6px;align-items:center;background:var(--tk-purple-soft);color:var(--tk-purple-deep);font-size:.72rem;font-weight:800;text-transform:uppercase;padding:5px 8px}
.tk-print-wag-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:8.5pt}
.tk-print-wag-table th,.tk-print-wag-table td{border:1px solid var(--tk-purple-line);padding:5px 4px;vertical-align:top}
.tk-print-wag-table thead th{background:var(--tk-purple-deep);color:#fff}
.tk-print-activity-card,.tk-print-day-sheet,.tk-print-resource-card{border:1px solid var(--tk-purple-line);border-radius:12px;overflow:hidden;background:#fff}
.tk-print-check-box{width:12px;height:12px;border:1.5px solid var(--tk-purple);border-radius:3px;display:inline-block}
</style>`;
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
        ${designStyleTag()}
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
