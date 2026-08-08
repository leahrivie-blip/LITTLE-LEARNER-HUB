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
    Object.freeze({
      id: "selected_resources",
      label: "Selected Resources",
      documentMode: "selected_resources",
      parts: ["cover"],
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

  function coversApi() {
    return (typeof globalThis !== "undefined" && globalThis.LlhLessonPlanCovers)
      || (typeof require === "function" ? (() => { try { return require("./lesson-plan-covers.js"); } catch (_e) { return null; } })()
      : null);
  }

  /** Presentation-only cover resolve — does not mutate curriculum records.
   *  Cover art is independent of activity photo inclusion (includeImages).
   */
  function resolvePrintCover(model) {
    const explicit = text(model && model.coverImageUrl);
    if (explicit) {
      return { url: explicit, alt: text(model.coverImageAlt) || text(model.title) || "Lesson cover" };
    }
    const api = coversApi();
    if (api && typeof api.resolveLessonPlanCover === "function") {
      const resolved = api.resolveLessonPlanCover({
        id: model && model.lessonPlanId,
        title: model && model.title,
        theme: model && model.theme,
        age: model && model.age,
        ageGroup: model && model.age,
        coverImageUrl: model && model.coverImageUrl,
        coverImageAlt: model && model.coverImageAlt,
      });
      if (resolved && text(resolved.url)) {
        return { url: text(resolved.url), alt: text(resolved.alt) || text(model && model.title) || "Lesson cover" };
      }
    }
    return { url: "", alt: "" };
  }

  function sectionThemeClass(tab) {
    const t = text(tab).toLowerCase();
    if (t.includes("content") || t === "toc") return "tk-theme-toc";
    if (t.includes("overview")) return "tk-theme-overview";
    if (t.includes("weekly") || t.includes("week")) return "tk-theme-weekly";
    if (t.includes("daily") || ["monday", "tuesday", "wednesday", "thursday", "friday"].some((d) => t === d || t.includes(d))) {
      return "tk-theme-daily";
    }
    if (t.includes("activit")) return "tk-theme-activities";
    if (t.includes("book")) return "tk-theme-books";
    if (t.includes("song")) return "tk-theme-songs";
    if (t.includes("printable")) return "tk-theme-printables";
    if (t.includes("toolkit") || t.includes("material") || t.includes("setup") || t.includes("families")) return "tk-theme-toolkit";
    if (t.includes("cover")) return "tk-theme-cover";
    return "tk-theme-default";
  }

  const ICON_SVGS = Object.freeze({
    materials: '<path d="M4 8h16v11H4z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    setup: '<circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    steps: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1.5"/><circle cx="4" cy="12" r="1.5"/><circle cx="4" cy="18" r="1.5"/>',
    tip: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 1 3.5 10.8V16H8.5v-2.2A6 6 0 0 1 12 3z"/>',
    watch: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 1.5"/>',
    adapt: '<path d="M12 4v4M12 16v4M4 12h4M16 12h4"/><circle cx="12" cy="12" r="3"/>',
    safety: '<path d="M12 3l8 4v5c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7l8-4z"/>',
    cleanup: '<path d="M4 7h16M9 7V5h6v2M8 7l1 12h6l1-12"/>',
    family: '<circle cx="9" cy="8" r="3"/><circle cx="16" cy="9" r="2.5"/><path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5"/><path d="M14 20c0-2.2 1.6-3.6 4-3.8"/>',
    book: '<path d="M4 5h7a3 3 0 0 1 3 3v11H7a3 3 0 0 0-3 3V5z"/><path d="M20 5h-7a3 3 0 0 0-3 3v11h7a3 3 0 0 1 3 3V5z"/>',
    song: '<path d="M9 18V6l10-2v12"/><circle cx="7" cy="18" r="2.5"/><circle cx="17" cy="16" r="2.5"/>',
    print: '<path d="M6 9V3h12v6"/><path d="M6 17H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><path d="M6 13h12v8H6z"/>',
    vocab: '<path d="M4 6h10M4 12h16M4 18h12"/>',
    focus: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
    schedule: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>',
    domain: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/>',
    prep: '<path d="M9 11V6a3 3 0 1 1 6 0v5"/><path d="M7 11h10l-1 9H8l-1-9z"/>',
    info: '<circle cx="12" cy="12" r="8"/><path d="M12 10v6M12 7h.01"/>',
    objective: '<path d="M12 3v18M5 10l7-7 7 7"/>',
  });

  function iconHtml(kind) {
    const key = text(kind).toLowerCase();
    const svg = ICON_SVGS[key];
    if (svg) {
      return `<span class="tk-print-icon tk-print-icon--svg" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svg}</svg></span>`;
    }
    if (!key) return "";
    return `<span class="tk-print-icon" aria-hidden="true">${escapeHtml(kind)}</span>`;
  }

  function emptyStateHtml(title, copy) {
    return `
      <div class="tk-print-empty-state tk-print-keep">
        <div class="tk-print-empty-mark" aria-hidden="true"></div>
        <p class="tk-print-empty-title">${escapeHtml(title)}</p>
        <p class="tk-print-empty-copy">${escapeHtml(copy)}</p>
      </div>
    `;
  }

  function metaCardHtml(label, value) {
    if (!text(value)) return "";
    return `<div class="tk-print-cover-meta-card"><span class="tk-print-meta-label">${escapeHtml(label)}</span><strong class="tk-print-meta-value">${escapeHtml(value)}</strong></div>`;
  }

  function coverHeroFallbackHtml() {
    return `
      <div class="tk-print-cover-hero-fallback" aria-hidden="true">
        <svg class="tk-print-cover-art" viewBox="0 0 640 360" xmlns="http://www.w3.org/2000/svg" role="presentation">
          <defs>
            <linearGradient id="tkCoverSky" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#f7f2ff"/>
              <stop offset="100%" stop-color="#e8def8"/>
            </linearGradient>
          </defs>
          <rect width="640" height="360" rx="28" fill="url(#tkCoverSky)"/>
          <circle cx="520" cy="78" r="46" fill="#f6e7a8" opacity=".9"/>
          <path d="M0 250C90 210 150 270 240 240C330 210 390 250 480 230C560 214 610 236 640 220V360H0Z" fill="#d9c7f5"/>
          <path d="M0 290C110 260 170 310 270 285C370 260 430 300 530 280C590 270 620 286 640 278V360H0Z" fill="#cbb6ef"/>
          <rect x="250" y="150" width="140" height="110" rx="14" fill="#fff" stroke="#542e94" stroke-width="4"/>
          <path d="M250 180h140" stroke="#d1c2f0" stroke-width="3"/>
          <path d="M250 210h140" stroke="#d1c2f0" stroke-width="3"/>
          <path d="M250 240h90" stroke="#d1c2f0" stroke-width="3"/>
          <circle cx="180" cy="200" r="28" fill="#fff" stroke="#6b46c1" stroke-width="3"/>
          <circle cx="460" cy="195" r="22" fill="#fff" stroke="#6b46c1" stroke-width="3"/>
        </svg>
        <p class="tk-print-cover-hero-brand">Little Learner Hub</p>
      </div>
    `;
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

  function panelHtml(label, innerHtml, icon, tone) {
    if (!text(innerHtml)) return "";
    const toneClass = text(tone) ? ` tk-print-panel--${escapeHtml(text(tone))}` : "";
    return `
      <div class="tk-print-panel tk-print-keep${toneClass}">
        <div class="tk-print-panel-label">${icon ? iconHtml(icon) : ""}<span>${escapeHtml(label)}</span></div>
        <div class="tk-print-panel-body">${innerHtml}</div>
      </div>
    `;
  }

  function calloutHtml(kind, title, innerHtml) {
    if (!text(innerHtml)) return "";
    const map = {
      tip: "tk-print-callout-tip",
      watch: "tk-print-callout-watch",
      extend: "tk-print-callout-extend",
      cleanup: "tk-print-callout-cleanup",
      note: "tk-print-callout",
    };
    const cls = map[text(kind)] || map.note;
    return `
      <aside class="${cls} tk-print-keep">
        <strong>${escapeHtml(title)}</strong>
        <div>${innerHtml}</div>
      </aside>
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
    const kit = opts.kit;
    if (!kit || kit.ok === false || kit.locked || !kit.companion) {
      return { ok: false, reason: kit?.locked ? "locked" : "unavailable" };
    }
    // Print Center UI flag OR designed-document eligibility (upgraded Complete Teaching Kit /
    // explicit binder intent). Do not force upgraded kits into a text PDF when the UI flag is off.
    const printCenterOn = opts.printCenterEnabled === true;
    const designedEligible = opts.designedDocumentEligible === true;
    if (!printCenterOn && !designedEligible) {
      return { ok: false, reason: "print_flag_off" };
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
      selectedResources: opts.selectedResources && typeof opts.selectedResources === "object"
        ? opts.selectedResources
        : null,
      adminPreview: opts.adminPreview === true,
      includeImages: opts.includeImages !== false,
      inkSaver: opts.inkSaver === true,
      paperSize: normalizePaperSize(opts.paperSize),
      watermark: text(opts.watermark),
      footerLabel: text(kit?.companion?.binder?.footerLabel) || `${text(kit?.title) || "Teaching Kit"} · Little Learner Hub`,
      plan: opts.plan && typeof opts.plan === "object" ? opts.plan : null,
    };
  }

  function page(tab, title, bodyHtml, footerLabel, extraClass) {
    const theme = sectionThemeClass(tab);
    return `
      <section class="tk-print-page ${theme}${extraClass ? ` ${extraClass}` : ""}" data-tk-print-tab="${escapeHtml(tab)}">
        <header class="tk-print-running">
          <span class="tk-print-running-brand">Little Learner Hub</span>
          <span class="tk-print-running-section">${escapeHtml(presentLabel(tab, tab))}</span>
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
    const mode = selection.documentMode || "entire_binder";
    const packLabel = mode === "full_weekly"
      ? "Full Weekly Lesson Plan"
      : (model.packLabel || "Complete Teaching Kit");
    const subtitle = mode === "entire_binder" || mode === "week_binder"
      ? (model.packSubtitle || "Teacher Binder")
      : presentLabel(mode, selection.presetLabel || "");
    const cover = resolvePrintCover(model);
    const coverImg = cover.url
      ? `<div class="tk-print-cover-hero"><div class="tk-print-cover-image"><img src="${escapeHtml(cover.url)}" alt="${escapeHtml(cover.alt)}" loading="eager" decoding="async" onerror="this.closest('.tk-print-cover-hero')?.classList.add('is-missing'); this.remove()" /></div></div>`
      : `<div class="tk-print-cover-hero">${coverHeroFallbackHtml()}</div>`;
    const adminBanner = selection.adminPreview
      ? `<div class="tk-print-admin-banner">ADMIN PREVIEW · Draft / preview only · Does not change production content</div>`
      : "";
    return `
      <section class="tk-print-page tk-print-cover tk-theme-cover" data-tk-print-tab="Cover">
        ${adminBanner}
        <div class="tk-print-cover-frame">
          <header class="tk-print-brand-row">
            <div class="tk-print-brand-mark" aria-hidden="true"></div>
            <div>
              <p class="tk-print-brand">Little Learner Hub</p>
              <p class="tk-print-cover-kicker">${escapeHtml(packLabel)}</p>
            </div>
          </header>
          ${coverImg}
          <div class="tk-print-cover-copy">
            <h1>${escapeHtml(model.title || "Teaching Kit")}</h1>
            ${subtitle ? `<p class="tk-print-cover-subtitle">${escapeHtml(subtitle)}</p>` : ""}
            <div class="tk-print-cover-meta">
              ${metaCardHtml("Age", model.age)}
              ${metaCardHtml("Theme", model.theme)}
              ${metaCardHtml("Duration", model.duration)}
            </div>
          </div>
        </div>
        <footer class="tk-print-footer">
          <span>${escapeHtml(selection.footerLabel)}</span>
          <span class="tk-print-page-number"></span>
        </footer>
      </section>
    `;
  }

  function tocBody(model) {
    const rows = (model.sections || [])
      .filter((section) => !["cover", "toc"].includes(section.id))
      .map((section, index) => `
        <li class="tk-print-toc-row">
          <span class="tk-print-toc-num">${escapeHtml(String(index + 1))}</span>
          <span class="tk-print-toc-label">${escapeHtml(section.label)}</span>
        </li>
      `);
    if (!rows.length) return "";
    return `<ol class="tk-print-toc">${rows.join("")}</ol>`;
  }

  function adminBannerHtml(selection) {
    if (!selection.adminPreview) return "";
    return `<div class="tk-print-admin-banner">ADMIN PREVIEW · Draft / preview only · Does not change production content</div>`;
  }

  function overviewSnapshotHtml(model) {
    const o = model.overview || {};
    const vocab = (o.vocabulary || []).map((word) => word.word).filter(Boolean);
    const prep = (o.teacherPrep || []).map((task) => `${task.label}${task.minutes ? ` (~${task.minutes} min)` : ""}`);
    return `
      <div class="tk-print-snapshot-grid">
        ${hasDisplayValue(o.weeklyOverview) ? panelHtml("Week focus", `<p class="tk-print-tight">${escapeHtml(shortText(o.weeklyOverview, 180))}</p>`, "focus") : ""}
        ${panelHtml("Objectives", bulletListHtml(o.learningObjectives, 6), "objective")}
        ${panelHtml("Domains", chipRowHtml(o.learningDomains), "domain")}
        ${panelHtml("Vocabulary", chipRowHtml(vocab.slice(0, 12)), "vocab")}
        ${panelHtml("Prep", bulletListHtml(prep, 5), "prep")}
        ${o.estimatedPrepMinutes ? `<div class="tk-print-stat-pill"><span>Estimated prep</span><strong>${escapeHtml(String(o.estimatedPrepMinutes))} min</strong></div>` : ""}
      </div>
    `;
  }

  function overviewBody(model) {
    const o = model.overview || {};
    const vocab = (o.vocabulary || []).map((word) => word.word).filter(Boolean);
    const prep = (o.teacherPrep || []).map((task) => {
      const detail = task.detail ? ` — ${task.detail}` : "";
      return `${task.label}${task.minutes ? ` (~${task.minutes} min)` : ""}${detail}`;
    });
    return [
      model.description || o.description
        ? panelHtml("Description", `<p class="tk-print-tight">${escapeHtml(shortText(model.description || o.description, 280))}</p>`, "info")
        : "",
      panelHtml("Weekly focus", `<p class="tk-print-tight">${escapeHtml(o.weeklyFocus || o.weeklyOverview || "")}</p>`, "focus"),
      panelHtml("Learning objectives", bulletListHtml(o.learningObjectives, 8), "objective"),
      panelHtml("Developmental domains", chipRowHtml(o.learningDomains), "domain"),
      panelHtml("Vocabulary", chipRowHtml(vocab), "vocab"),
      panelHtml("Master materials", checkboxListHtml(o.masterMaterials, 30), "materials"),
      panelHtml("Teacher prep", checkboxListHtml(prep, 10), "prep"),
      panelHtml("Safety", bulletListHtml(o.safety, 6), "safety"),
      panelHtml("Adaptations / inclusion", bulletListHtml(toBullets(o.adaptations, 5), 5), "adapt"),
      panelHtml("Observation focus", bulletListHtml(o.observationFocus, 5), "watch"),
      panelHtml("Family connection", bulletListHtml(toBullets(o.familyConnection, 4), 4), "family"),
      model.theme || model.age || model.duration
        ? panelHtml("Lesson facts", bulletListHtml([
          model.theme ? `Theme: ${model.theme}` : "",
          model.age ? `Age group: ${model.age}` : "",
          model.duration ? `Duration: ${model.duration}` : "",
        ].filter(Boolean), 4), "info")
        : "",
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

  function dailyActivitySummaryHtml(summary, index) {
    if (!summary || !summary.title) return "";
    const materials = materialsList(summary.materials);
    const steps = toBullets(summary.steps, 4);
    const prompts = (summary.teacherPrompts || []).map((prompt) => text(prompt.text)).filter(Boolean);
    return `
      <article class="tk-print-day-activity tk-print-keep">
        <header class="tk-print-day-activity-head">
          <span class="tk-print-day-activity-index">Activity ${escapeHtml(String(index + 1))}</span>
          <h4>${escapeHtml(summary.title)}</h4>
          <div class="tk-print-badge-row">
            ${summary.category ? badgeHtml(summary.category) : ""}
          </div>
        </header>
        ${hasDisplayValue(summary.description) ? `<p class="tk-print-tight">${escapeHtml(shortText(summary.description, 160))}</p>` : ""}
        <div class="tk-print-day-activity-grid tk-print-activity-primary">
          ${panelHtml("Materials", checkboxListHtml(materials, 6), "materials")}
          ${panelHtml("Setup", `<p class="tk-print-tight">${escapeHtml(shortText(summary.setup, 120))}</p>`, "setup")}
          ${panelHtml("What children do", numberedListHtml(steps, 4), "steps")}
          ${panelHtml("Teacher prompts", bulletListHtml(prompts, 3), "tip")}
        </div>
        <div class="tk-print-activity-secondary">
          ${calloutHtml("watch", "Watch for", bulletListHtml(summary.observationIdeas, 3))}
          ${hasDisplayValue(summary.adaptations) ? calloutHtml("extend", "Adaptations", bulletListHtml(toBullets(summary.adaptations, 2), 2)) : ""}
        </div>
      </article>
    `;
  }

  function dailyPlanBody(day, options = {}) {
    const detailed = options.detailed !== false;
    const scheduleBits = (day.schedule || []).map((slot) => `${slot.time ? `${slot.time} ` : ""}${slot.label}`).filter(Boolean);
    const summaries = detailed
      ? (day.activitySummaries || []).map((summary, index) => dailyActivitySummaryHtml(summary, index)).join("\n")
      : "";
    const activityFallback = !summaries
      ? panelHtml("Activities", bulletListHtml(day.activityTitles || [], 8), "steps")
      : "";
    return `
      <article class="tk-print-day-sheet tk-print-keep">
        <header class="tk-print-day-sheet-head">
          <h3>${escapeHtml(day.dayLabel)}</h3>
          ${day.focus ? `<p><strong>Daily focus:</strong> ${escapeHtml(shortText(day.focus, 160))}</p>` : ""}
        </header>
        <div class="tk-print-day-sheet-grid">
          ${panelHtml("Schedule", bulletListHtml(scheduleBits, 6), "schedule")}
          ${panelHtml("Circle time", bulletListHtml(day.circleTime, 5), "tip")}
          ${panelHtml("Book of the day", bulletListHtml((day.books || []).map((book) => book.author ? `${book.title} — ${book.author}` : book.title), 3), "book")}
          ${panelHtml("Song of the day", bulletListHtml((day.songs || []).map((song) => song.title), 3), "song")}
          ${panelHtml("Invitation to play", bulletListHtml(toBullets(day.invitationToPlay, 3), 3), "focus")}
          ${panelHtml("Sensory", bulletListHtml(toBullets(day.sensory, 3), 3), "materials")}
          ${panelHtml("Fine motor", bulletListHtml(toBullets(day.fineMotor, 3), 3), "prep")}
          ${panelHtml("Gross motor", bulletListHtml(toBullets(day.grossMotor, 3), 3), "steps")}
          ${panelHtml("Outdoor play", bulletListHtml(toBullets(day.outdoorPlay, 3), 3), "focus")}
          ${panelHtml("Small group", bulletListHtml(toBullets(day.smallGroup, 3), 3), "family")}
          ${panelHtml("Art", bulletListHtml(toBullets(day.art, 3), 3), "domain")}
          ${panelHtml("STEM", bulletListHtml(toBullets(day.stem, 3), 3), "domain")}
          ${activityFallback}
          ${panelHtml("Materials for this day", checkboxListHtml(day.materials, 12), "materials")}
          ${panelHtml("Teacher prep", checkboxListHtml(day.teacherPrep, 6), "prep")}
          ${panelHtml("Observation focus", bulletListHtml(day.observations, 5), "watch")}
          ${panelHtml("Teacher notes", bulletListHtml(toBullets(day.teacherNotes, 3), 3), "tip")}
          ${panelHtml("Family connection", bulletListHtml(toBullets(day.parentMessage, 3), 3), "family")}
        </div>
        ${summaries ? `<div class="tk-print-day-activities"><div class="tk-print-section-banner">Today's activities</div>${summaries}</div>` : ""}
      </article>
    `;
  }

  function activityCardBody(activity, selection, compact) {
    const materials = materialsList(activity.materials?.length ? activity.materials : activity.materialsText);
    const steps = toBullets(activity.steps, compact ? 5 : 8);
    const tips = [
      ...toBullets(activity.teacherRole, 2),
      ...(activity.teacherPrompts || []).map((prompt) => text(prompt.text)).filter(Boolean),
    ].slice(0, compact ? 3 : 6);
    const watch = (activity.observationIdeas || []).slice(0, compact ? 3 : 5);
    const photoBits = [];
    if (selection.includeImages && activity.setupPhotoUrl) {
      photoBits.push(`<figure class="tk-print-card-photo"><img src="${escapeHtml(activity.setupPhotoUrl)}" alt="${escapeHtml(activity.setupAlt || `Setup for ${activity.title}`)}" loading="eager" decoding="async" onerror="this.closest('figure')?.remove()" /><figcaption>Setup</figcaption></figure>`);
    }
    if (selection.includeImages && activity.examplePhotoUrl) {
      photoBits.push(`<figure class="tk-print-card-photo"><img src="${escapeHtml(activity.examplePhotoUrl)}" alt="${escapeHtml(activity.exampleAlt || `Example for ${activity.title}`)}" loading="eager" decoding="async" onerror="this.closest('figure')?.remove()" /><figcaption>Finished</figcaption></figure>`);
    }
    return `
      <article class="tk-print-keep tk-print-activity-card">
        <header class="tk-print-activity-head">
          <div>
            <h3>${escapeHtml(activity.title)}</h3>
            <div class="tk-print-badge-row">
              ${badgeHtml(activity.category)}
              ${activity.estimatedMinutes ? badgeHtml(`~${activity.estimatedMinutes} min`) : ""}
              ${badgeHtml(activity.groupSize)}
              ${badgeHtml(activity.dayLabel)}
            </div>
            ${hasDisplayValue(activity.objective) ? `<p class="tk-print-objective">${escapeHtml(shortText(activity.objective, 140))}</p>` : ""}
            ${!compact && (activity.developmentalDomains || []).length ? `<div class="tk-print-domain-row">${chipRowHtml(activity.developmentalDomains)}</div>` : ""}
          </div>
          ${photoBits.length ? `<div class="tk-print-card-photos">${photoBits.join("")}</div>` : ""}
        </header>
        <div class="tk-print-activity-grid tk-print-activity-primary">
          ${panelHtml("Materials", checkboxListHtml(materials, compact ? 6 : 12), "materials")}
          ${panelHtml("Setup", `<p class="tk-print-tight">${escapeHtml(shortText(activity.setup, compact ? 110 : 180))}</p>`, "setup")}
          ${panelHtml("What to do", numberedListHtml(steps, compact ? 5 : 8), "steps")}
          ${panelHtml("Teacher prompts", bulletListHtml(tips, compact ? 3 : 6), "tip")}
        </div>
        ${!compact ? `<div class="tk-print-activity-secondary">
          ${calloutHtml("watch", "Observation", bulletListHtml(watch, 5))}
          ${hasDisplayValue(activity.adaptations) ? calloutHtml("extend", "Extensions & adaptations", bulletListHtml(toBullets(activity.adaptations, 3), 3)) : ""}
          ${(activity.cleanupTips || []).length ? calloutHtml("cleanup", "Cleanup", bulletListHtml(activity.cleanupTips, 4)) : ""}
          ${hasDisplayValue(activity.familyExtension) ? calloutHtml("tip", "Family extension", bulletListHtml(toBullets(activity.familyExtension, 2), 2)) : ""}
          ${hasDisplayValue(activity.safetyNotes) ? panelHtml("Safety", bulletListHtml(toBullets(activity.safetyNotes, 2), 2), "safety") : ""}
        </div>` : `<div class="tk-print-activity-secondary">${calloutHtml("watch", "Watch for", bulletListHtml(watch, 3))}</div>`}
      </article>
    `;
  }

  function printablesBody(model, selection) {
    const items = model.printables || [];
    if (!items.length) return "";
    const hasPdfAttachments = items.some((item) => !item.embedAsImage);
    const hasImagePrintables = items.some((item) => item.embedAsImage);
    const noteParts = [];
    if (hasImagePrintables) {
      noteParts.push("Image printables appear full-page when available.");
    }
    if (hasPdfAttachments) {
      noteParts.push("Additional printable PDF file(s) are included separately — their pages are listed here and must be opened or downloaded from the Teaching Kit. They are not merged into this binder document.");
    }
    if (!noteParts.length) {
      noteParts.push("Printable resources for this lesson are listed below.");
    }
    const note = `<div class="tk-print-callout tk-print-keep"><strong>Printable resources</strong><span>${escapeHtml(noteParts.join(" "))}</span></div>`;
    const cards = items.map((item) => `
      <article class="tk-print-resource-card tk-print-printable-card tk-print-keep">
        <header>
          <h3>${escapeHtml(item.title)}</h3>
          <div class="tk-print-badge-row">
            ${badgeHtml(item.category || "Printable")}
            ${item.embedAsImage ? badgeHtml("Image printable") : badgeHtml("PDF included separately")}
          </div>
        </header>
        ${item.previewUrl
          ? `<div class="tk-print-resource-preview"><img src="${escapeHtml(item.previewUrl)}" alt="${escapeHtml(item.title)}" loading="eager" decoding="async" onerror="this.remove()" /></div>`
          : `<div class="tk-print-printable-thumb-fallback" aria-hidden="true">${iconHtml("print")}</div>`}
        <div class="tk-print-resource-meta">
          ${item.pageCount ? `<span>${escapeHtml(String(item.pageCount))} pages</span>` : ""}
          ${(item.usedInWeek || []).length ? `<span>${escapeHtml(item.usedInWeek.map((slot) => [slot.dayLabel, slot.moment].filter(Boolean).join(" · ")).join("; "))}</span>` : ""}
        </div>
        ${hasDisplayValue(item.description) ? `<p class="tk-print-tight">${escapeHtml(shortText(item.description, 160))}</p>` : ""}
        ${hasDisplayValue(item.purpose) ? panelHtml("Purpose", `<p class="tk-print-tight">${escapeHtml(shortText(item.purpose, 140))}</p>`, "focus") : ""}
        ${hasDisplayValue(item.suggestedUse) ? panelHtml("Suggested use", `<p class="tk-print-tight">${escapeHtml(shortText(item.suggestedUse, 140))}</p>`, "tip") : ""}
        ${hasDisplayValue(item.printingDirections) ? panelHtml("Printing notes", `<p class="tk-print-tight">${escapeHtml(shortText(item.printingDirections, 180))}</p>`, "print") : ""}
        ${item.embedAsImage
          ? `<p class="tk-print-muted">Full printable image included on the following page.</p>`
          : `<p class="tk-print-muted"><strong>Additional printable PDF included separately.</strong> Pages were not merged into this binder document.</p>`}
      </article>
    `).join("");
    return note + `<div class="tk-print-resource-grid">${cards}</div>`;
  }

  function printableImagePages(model, selection) {
    if (!selection.includeImages) return "";
    return (model.printables || [])
      .filter((item) => item.embedAsImage && (item.previewUrl || item.fileUrl))
      .map((item) => page(
        "Printables",
        item.title,
        `<figure class="tk-print-printable-full tk-print-keep">
          <img src="${escapeHtml(item.previewUrl || item.fileUrl)}" alt="${escapeHtml(item.title)}" loading="eager" decoding="async" onerror="this.closest('figure')?.classList.add('is-missing')" />
          <figcaption>${escapeHtml(item.title)}${item.printingDirections ? ` · ${escapeHtml(shortText(item.printingDirections, 100))}` : ""}</figcaption>
        </figure>`,
        selection.footerLabel,
        "tk-print-page-printable",
      ))
      .join("\n");
  }

  function songsBody(model, lyricsOnly) {
    const songs = (model.songs || []).filter((song) => (lyricsOnly ? song.lyricsPrintable : true));
    if (!songs.length) {
      return lyricsOnly
        ? emptyStateHtml(
          "No printable lyrics for this lesson",
          "Lyrics appear here only for original, public-domain, or licensed songs. Teaching tips and movement ideas still live in the Songs pack.",
        )
        : emptyStateHtml(
          "No songs attached yet",
          "Additional songs can be attached in future lesson updates. This page is ready when song resources are added.",
        );
    }
    return `<div class="tk-print-resource-grid">${songs.map((song) => `
      <article class="tk-print-resource-card tk-print-song-card tk-print-keep">
        <header>
          <div>
            <p class="tk-print-card-kicker">${iconHtml("song")}<span>Song</span></p>
            <h3>${escapeHtml(song.title)}</h3>
          </div>
          <div class="tk-print-badge-row">
            ${badgeHtml(song.rights || "")}
            ${(song.relatedDays || []).length ? badgeHtml((song.relatedDays || []).join(", ")) : (song.relatedDay ? badgeHtml(song.relatedDay) : "")}
          </div>
        </header>
        ${hasDisplayValue(song.whenToUse) ? panelHtml("Best time / transition", bulletListHtml(toBullets(song.whenToUse, 2), 2), "schedule") : ""}
        ${hasDisplayValue(song.notes) ? panelHtml("Teaching tips", bulletListHtml(toBullets(song.notes, 3), 3), "tip") : ""}
        ${hasDisplayValue(song.motions) ? panelHtml("Movement ideas", bulletListHtml(toBullets(song.motions, 4), 4), "steps") : ""}
        ${hasDisplayValue(song.props) ? panelHtml("Props", checkboxListHtml(toBullets(song.props, 4), 4), "materials") : ""}
        ${song.lyricsPrintable && song.lyrics
          ? panelHtml("Lyrics", `<p class="tk-print-tight">${escapeHtml(song.lyrics)}</p>`, "song")
          : (lyricsOnly
            ? ""
            : `<div class="tk-print-lyrics-note tk-print-keep"><strong>Lyrics not shown</strong><span>Rights do not allow displaying these lyrics in the binder. Use the song title and teaching tips during circle time.</span></div>`)}
      </article>
    `).join("")}</div>`;
  }

  function booksBody(model, selection) {
    const books = model.books || [];
    if (!books.length) {
      return emptyStateHtml(
        "No books attached yet",
        "Book guides appear here when titles are linked to the lesson. This layout is ready for covers, prompts, and extensions.",
      );
    }
    return `<div class="tk-print-book-stack">${books.map((book) => {
      const cover = selection?.includeImages && book.coverImageUrl
        ? `<div class="tk-print-book-cover"><img src="${escapeHtml(book.coverImageUrl)}" alt="${escapeHtml(book.coverImageAlt || book.title)}" loading="eager" decoding="async" onerror="this.parentElement.classList.add('is-placeholder'); this.remove()" /></div>`
        : `<div class="tk-print-book-cover is-placeholder" aria-hidden="true"><span>Book</span></div>`;
      const dayBits = (book.relatedDays || []).length
        ? (book.relatedDays || []).join(", ")
        : (book.relatedDay || "");
      return `
      <article class="tk-print-book-card tk-print-keep">
        ${cover}
        <div class="tk-print-book-body">
          <header>
            <p class="tk-print-card-kicker">${iconHtml("book")}<span>Book guide</span></p>
            <h3>${escapeHtml(book.title)}</h3>
            ${book.author ? `<p class="tk-print-book-author">by ${escapeHtml(book.author)}</p>` : ""}
            <div class="tk-print-badge-row">${dayBits ? badgeHtml(dayBits) : ""}</div>
          </header>
          ${hasDisplayValue(book.whyThisBook) ? panelHtml("Why this book", `<p class="tk-print-tight">${escapeHtml(shortText(book.whyThisBook, 180))}</p>`, "focus") : ""}
          ${(book.vocabularyConnections || []).length ? panelHtml("Vocabulary", chipRowHtml(book.vocabularyConnections), "vocab") : ""}
          ${panelHtml("Before reading", bulletListHtml(book.beforeReadingQuestions, 3), "book")}
          ${panelHtml("During reading", bulletListHtml(book.duringReadingPrompts, 4), "book")}
          ${panelHtml("After reading", bulletListHtml(book.afterReadingQuestions || book.readAloudQuestions, 4), "book")}
          ${panelHtml("Extension", bulletListHtml(book.extensionIdeas, 3), "adapt")}
        </div>
      </article>`;
    }).join("")}</div>`;
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
    const vocab = (model.overview?.vocabulary || []).map((word) => word.word).filter(Boolean).slice(0, 16);
    return `
      <div class="tk-print-toolkit-intro">
        <div class="tk-print-section-banner">Monday Morning Setup</div>
        ${setup.estimatedPrepMinutes ? `<div class="tk-print-stat-pill"><span>Estimated prep</span><strong>${escapeHtml(String(setup.estimatedPrepMinutes))} min</strong></div>` : ""}
        ${(setup.missingMaterials || []).length ? `<div class="tk-print-callout tk-print-keep"><strong>Needs attention</strong><span>${escapeHtml(setup.missingMaterials.join(" · "))}</span></div>` : ""}
      </div>
      <div class="tk-print-toolkit-groups">
        <section class="tk-print-toolkit-group" data-toolkit-group="materials">
          <h3 class="tk-print-toolkit-group-title">${iconHtml("materials")}<span>Setup materials</span></h3>
          ${checkboxListHtml(setup.materials, 24) || emptyStateHtml("Materials checklist ready", "Materials will appear here when authored for this lesson.")}
        </section>
        <section class="tk-print-toolkit-group" data-toolkit-group="prep">
          <h3 class="tk-print-toolkit-group-title">${iconHtml("prep")}<span>Prep checklist</span></h3>
          ${checkboxListHtml(prep, 10) || emptyStateHtml("Prep checklist ready", "Prep tasks will appear here when authored for this lesson.")}
        </section>
        <section class="tk-print-toolkit-group" data-toolkit-group="print">
          <h3 class="tk-print-toolkit-group-title">${iconHtml("print")}<span>Print checklist</span></h3>
          ${checkboxListHtml(printChecklist, 8) || emptyStateHtml("Print checklist ready", "Printable checklist items will appear here when linked.")}
        </section>
        <section class="tk-print-toolkit-group" data-toolkit-group="vocab">
          <h3 class="tk-print-toolkit-group-title">${iconHtml("vocab")}<span>Vocabulary</span></h3>
          ${chipRowHtml(vocab) || emptyStateHtml("Vocabulary ready", "Theme words will appear here when authored.")}
        </section>
        <section class="tk-print-toolkit-group" data-toolkit-group="tips">
          <h3 class="tk-print-toolkit-group-title">${iconHtml("tip")}<span>Teaching tips</span></h3>
          ${bulletListHtml(toolkit.teachingTips, 5) || ""}
          ${panelHtml("Safety", bulletListHtml(model.overview?.safety, 4), "safety")}
          ${panelHtml("Cleanup", bulletListHtml(toolkit.cleanup, 4), "cleanup")}
        </section>
        <section class="tk-print-toolkit-group" data-toolkit-group="observe">
          <h3 class="tk-print-toolkit-group-title">${iconHtml("watch")}<span>Observation</span></h3>
          ${bulletListHtml(toolkit.observationGuidance, 4) || emptyStateHtml("Observation prompts ready", "What to watch for will appear here when authored.")}
        </section>
        <section class="tk-print-toolkit-group" data-toolkit-group="adapt">
          <h3 class="tk-print-toolkit-group-title">${iconHtml("adapt")}<span>Adaptations</span></h3>
          ${bulletListHtml(toBullets(toolkit.adaptations, 3), 3) || ""}
        </section>
        <section class="tk-print-toolkit-group" data-toolkit-group="family">
          <h3 class="tk-print-toolkit-group-title">${iconHtml("family")}<span>Family resources</span></h3>
          ${bulletListHtml(toBullets(toolkit.familyResources, 3), 3) || ""}
        </section>
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
    chunks.push(coverFromModel(model, selection));
    if (sectionIds.has("toc")) {
      const toc = tocBody(model);
      if (toc) chunks.push(page("Contents", "Table of Contents", adminBannerHtml(selection) + toc, selection.footerLabel));
    }
    if (sectionIds.has("overview")) {
      chunks.push(page("Overview", "Overview", adminBannerHtml(selection) + overviewBody(model), selection.footerLabel));
    }
    if (sectionIds.has("weekAtAGlance")) {
      const wag = weekGlanceBody(model);
      if (wag) chunks.push(page("Weekly Plan", "Weekly Plan", adminBannerHtml(selection) + wag, selection.footerLabel));
    }
    if (sectionIds.has("dailyPlans")) {
      (model.days || []).forEach((day) => {
        const body = dailyPlanBody(day, { detailed: true });
        if (!text(body.replace(/<[^>]+>/g, ""))) return;
        chunks.push(page("Daily Plans", `${day.dayLabel}`, adminBannerHtml(selection) + body, selection.footerLabel));
      });
    }
    if (sectionIds.has("activities")) {
      chunks.push(packActivityPages(model.activities || [], selection, "Activities", false));
    }
    if (sectionIds.has("printables")) {
      chunks.push(page("Printables", "Printables", printablesBody(model, selection), selection.footerLabel));
      chunks.push(printableImagePages(model, selection));
    }
    if (sectionIds.has("songs")) {
      const body = songsBody(model, false);
      if (body) chunks.push(page("Songs", "Songs", body, selection.footerLabel));
    }
    if (sectionIds.has("books")) {
      const body = booksBody(model, selection);
      if (body) chunks.push(page("Books", "Book Guide", body, selection.footerLabel));
    }
    if (sectionIds.has("examples") && selection.includeImages) {
      const leftovers = (model.examples || []).filter((image) => {
        const onCards = (model.activities || []).some((activity) => (
          activity.examplePhotoUrl === image.url || activity.setupPhotoUrl === image.url
        ));
        const onPrintable = (model.printables || []).some((item) => item.previewUrl === image.url || item.fileUrl === image.url);
        return !onCards && !onPrintable;
      });
      if (leftovers.length) {
        chunks.push(page("Example Images", "Example Images", examplesBody({ examples: leftovers }), selection.footerLabel));
      }
    }
    if (sectionIds.has("toolkit")) {
      chunks.push(page("Teacher Toolkit", "Teacher Toolkit", toolkitBody(model), selection.footerLabel));
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
      const body = dailyPlanBody(day, { detailed: false });
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
      (model.books || []).length ? `<div class="tk-print-section-banner">Books</div>${booksBody(model, selection)}` : "",
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

  function assembleSelectedResources(model, selection) {
    const selected = selection.selectedResources || {};
    const chunks = [];
    chunks.push(coverFromModel(model, selection));
    const dayKeys = asSelectedList(selected.days);
    const activityIds = new Set(asSelectedList(selected.activityIds));
    const songTitles = new Set(asSelectedList(selected.songs).map((item) => item.toLowerCase()));
    const bookTitles = new Set(asSelectedList(selected.books).map((item) => item.toLowerCase()));
    const printableIds = new Set(asSelectedList(selected.printableIds));
    const include = {
      overview: selected.overview === true,
      weekly: selected.weekly === true || selected.weekAtAGlance === true,
      toolkit: selected.toolkit === true,
      materials: selected.materials === true,
      songs: selected.songs === true || songTitles.size > 0,
      books: selected.books === true || bookTitles.size > 0,
      activities: selected.activities === true || activityIds.size > 0,
      printables: selected.printables === true || printableIds.size > 0,
    };

    if (include.overview) {
      chunks.push(page("Overview", "Overview", overviewBody(model), selection.footerLabel));
    }
    if (include.weekly) {
      const wag = weekGlanceBody(model, dayKeys.length ? dayKeys : null);
      if (wag) chunks.push(page("Weekly Plan", "Weekly Plan", wag, selection.footerLabel));
    }
    if (dayKeys.length) {
      (model.days || []).filter((day) => dayKeys.includes(day.day)).forEach((day) => {
        chunks.push(page("Daily Plans", day.dayLabel, dailyPlanBody(day, { detailed: true }), selection.footerLabel));
      });
    }
    if (include.activities) {
      const acts = (model.activities || []).filter((item) => (
        activityIds.size === 0 || activityIds.has(item.id) || activityIds.has(item.title)
      ));
      if (acts.length) chunks.push(packActivityPages(acts, selection, "Activities", false));
    }
    if (include.songs) {
      const songs = songTitles.size
        ? { songs: (model.songs || []).filter((song) => songTitles.has(String(song.title || "").toLowerCase())) }
        : model;
      const body = songsBody(songs, false);
      if (body) chunks.push(page("Songs", "Songs", body, selection.footerLabel));
    }
    if (include.books) {
      const books = bookTitles.size
        ? { books: (model.books || []).filter((book) => bookTitles.has(String(book.title || "").toLowerCase())) }
        : model;
      const body = booksBody(books, selection);
      if (body) chunks.push(page("Books", "Book Guide", body, selection.footerLabel));
    }
    if (include.printables) {
      const printables = printableIds.size
        ? { printables: (model.printables || []).filter((item) => printableIds.has(item.id) || printableIds.has(item.title)) }
        : model;
      if ((printables.printables || []).length) {
        chunks.push(page("Printables", "Selected Printables", printablesBody(printables, selection), selection.footerLabel));
        chunks.push(printableImagePages(printables, selection));
      }
    }
    if (include.materials) {
      chunks.push(page(
        "Materials",
        "Materials List",
        panelHtml("Master materials", checkboxListHtml(model.overview?.masterMaterials, 40), "M"),
        selection.footerLabel,
      ));
    }
    if (include.toolkit) {
      chunks.push(page("Teacher Toolkit", "Teacher Toolkit", toolkitBody(model), selection.footerLabel));
    }
    return chunks;
  }

  function asSelectedList(value) {
    if (Array.isArray(value)) return value.map((item) => text(item)).filter(Boolean);
    if (value === true) return [];
    return [];
  }

  function assembleMode(model, selection) {
    const mode = selection.documentMode || "entire_binder";
    const daysFilter = selection.days || [];
    if (mode === "entire_binder") return assembleEntireBinder(model, selection);
    if (mode === "full_weekly") return assembleFullWeekly(model, selection);
    if (mode === "selected_resources") return assembleSelectedResources(model, selection);

    const chunks = [];
    if (selection.parts.cover !== false && mode !== "one_activity" && mode !== "song_lyrics") {
      chunks.push(coverFromModel(model, selection));
    }

    if (mode === "overview" || mode === "weekly_overview") {
      const body = [
        overviewBody(model),
        weekGlanceBody(model),
      ].join("\n");
      chunks.push(page("Overview", "Weekly Overview", body, selection.footerLabel));
      return chunks;
    }
    if (mode === "one_day") {
      const dayKey = daysFilter[0] || "monday";
      const day = (model.days || []).find((item) => item.day === dayKey);
      if (day) {
        chunks.push(page(
          "Daily Plans",
          `${model.title || "Lesson"} · ${day.dayLabel}`,
          dailyPlanBody(day, { detailed: true }),
          selection.footerLabel,
        ));
      }
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
      if (body) chunks.push(page("Song Guide", "Song Lyrics / Song Guide", body, selection.footerLabel));
      else chunks.push(page("Song Guide", "Song Guide", emptyStateHtml("No printable lyrics available for this lesson", "Use the Songs pack for teaching tips and movement ideas. Lyrics appear here only when rights allow."), selection.footerLabel));
      return chunks;
    }
    if (mode === "books") {
      chunks.push(page("Books", "Book Guide", booksBody(model, selection), selection.footerLabel));
      return chunks;
    }
    if (mode === "materials") {
      const dayKey = daysFilter[0];
      const day = dayKey ? (model.days || []).find((item) => item.day === dayKey) : null;
      const materials = day?.materials?.length ? day.materials : model.overview?.masterMaterials;
      chunks.push(page(
        "Materials",
        day ? `${day.dayLabel} Materials` : "Materials List",
        panelHtml(day ? `${day.dayLabel} materials` : "Master materials", checkboxListHtml(materials, 50), "materials"),
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
        chunks.push(page("Printables", "Printable Resources", printablesBody(model, selection), selection.footerLabel));
        chunks.push(printableImagePages(model, selection));
      } else {
        chunks.push(page("Printables", "Printable Resources", emptyStateHtml("No printable resources have been added to this lesson yet.", "When printables are linked, teachers will see thumbnails, purpose, suggested use, and printing notes here."), selection.footerLabel));
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
    // Critical binder design so print preview stays designed even if main stylesheet is delayed.
    // Full rules (including app print chrome hiding) also live in styles.css.
    return "<style data-tk-print-design>" + ".teaching-kit-print-article,\n.tk-print-root {\n--tk-purple-deep: #542e94;\n--tk-purple: #6b46c1;\n--tk-purple-soft: #f5f0fc;\n--tk-purple-line: #e8e0f4;\n--tk-ink: #2d1b4e;\n--tk-muted: #6b5f82;\n--tk-accent: var(--tk-purple-deep);\n--tk-accent-soft: var(--tk-purple-soft);\n--tk-border: #e8e0f4;\n--tk-display: Georgia, \"Palatino Linotype\", \"Palatino\", \"Times New Roman\", serif;\n--tk-body: \"Avenir Next\", \"Segoe UI\", \"Helvetica Neue\", sans-serif;\ncolor: var(--tk-ink);\nbackground: #fff;\ncounter-reset: tk-page;\nfont-family: var(--tk-body);\nfont-size: 10.5pt;\nline-height: 1.45;\n-webkit-print-color-adjust: exact;\nprint-color-adjust: exact;\n}\n.tk-theme-overview { --tk-accent: #542e94; --tk-accent-soft: #f3eefd; }\n.tk-theme-weekly { --tk-accent: #0f766e; --tk-accent-soft: #ecfdf5; }\n.tk-theme-daily { --tk-accent: #1d4ed8; --tk-accent-soft: #eff6ff; }\n.tk-theme-activities { --tk-accent: #b45309; --tk-accent-soft: #fff7ed; }\n.tk-theme-books { --tk-accent: #9a3412; --tk-accent-soft: #fff7ed; }\n.tk-theme-songs { --tk-accent: #7e22ce; --tk-accent-soft: #faf5ff; }\n.tk-theme-printables { --tk-accent: #0369a1; --tk-accent-soft: #f0f9ff; }\n.tk-theme-toolkit { --tk-accent: #334155; --tk-accent-soft: #f8fafc; }\n.tk-theme-toc,\n.tk-theme-default,\n.tk-theme-cover { --tk-accent: #542e94; --tk-accent-soft: #f3eefd; }\n.tk-print-page {\nposition: relative;\ndisplay: flex;\nflex-direction: column;\nbreak-after: page;\npage-break-after: always;\npadding: 12px 8px 18px;\nmin-height: 0;\nbox-sizing: border-box;\ncounter-increment: tk-page;\n}\n.tk-print-page:last-of-type {\nbreak-after: auto;\npage-break-after: auto;\n}\n.tk-print-running {\ndisplay: flex;\njustify-content: space-between;\nalign-items: center;\ngap: 12px;\nfont-size: 0.62rem;\nfont-weight: 700;\nletter-spacing: 0.08em;\ntext-transform: uppercase;\ncolor: var(--tk-muted);\nbackground: #fff;\nmargin: 0 0 14px;\npadding: 6px 10px 6px 12px;\nborder-bottom: 1px solid var(--tk-border);\nborder-left: 3px solid var(--tk-accent);\nborder-radius: 0;\nflex: 0 0 auto;\n}\n.tk-print-running span:last-child {\ncolor: var(--tk-accent);\nfont-weight: 800;\n}\n.tk-print-title-bar {\nbackground: transparent;\nborder: none;\nborder-left: 4px solid var(--tk-accent);\nborder-radius: 0;\npadding: 4px 0 4px 14px;\nmargin: 0 0 18px;\n}\n.tk-print-page-title {\nmargin: 0;\nfont-family: var(--tk-display);\nfont-size: 1.35rem;\nfont-weight: 700;\ncolor: var(--tk-ink);\nline-height: 1.2;\nbreak-after: avoid;\npage-break-after: avoid;\n}\n.tk-print-rule { display: none; }\n.tk-print-body {\nflex: 1 1 auto;\nmin-height: 0;\npadding-bottom: 10px;\nfont-size: 10.5pt;\nline-height: 1.45;\n}\n.tk-print-footer {\nmargin-top: auto;\npadding: 10px 4px 0;\ndisplay: flex;\njustify-content: space-between;\ngap: 12px;\nfont-size: 0.65rem;\nfont-weight: 600;\ncolor: var(--tk-muted);\nborder-top: 1px solid var(--tk-border);\nflex: 0 0 auto;\n}\n.tk-print-page-number::after { content: counter(tk-page); }\n.tk-print-keep { break-inside: avoid; page-break-inside: avoid; }\n.tk-print-muted { color: var(--tk-muted); }\n.tk-print-tight { margin: 0; line-height: 1.4; }\n.tk-print-list,\n.tk-print-bullets,\n.tk-print-steps,\n.tk-print-check,\n.tk-print-cell-list {\nmargin: 0;\npadding-left: 0;\nlist-style: none;\n}\n.tk-print-bullets li,\n.tk-print-list li {\nposition: relative;\npadding-left: 14px;\nmargin: 4px 0;\n}\n.tk-print-bullets li::before,\n.tk-print-list li::before {\ncontent: \"\";\nposition: absolute;\nleft: 0;\ntop: 0.5em;\nwidth: 5px;\nheight: 5px;\nborder-radius: 50%;\nbackground: var(--tk-accent);\n}\n.tk-print-steps { counter-reset: tk-step; }\n.tk-print-steps li {\ncounter-increment: tk-step;\nposition: relative;\npadding-left: 24px;\nmargin: 5px 0;\n}\n.tk-print-steps li::before {\ncontent: counter(tk-step);\nposition: absolute;\nleft: 0;\ntop: 0.05em;\nwidth: 17px;\nheight: 17px;\nborder-radius: 50%;\nbackground: var(--tk-accent-soft);\ncolor: var(--tk-accent);\nborder: 1px solid var(--tk-border);\nfont-size: 0.65rem;\nfont-weight: 800;\ndisplay: grid;\nplace-items: center;\n}\n.tk-print-check li {\ndisplay: grid;\ngrid-template-columns: 14px 1fr;\ngap: 8px;\nalign-items: start;\nmargin: 4px 0;\npadding-left: 0;\n}\n.tk-print-check li::before { content: none !important; display: none !important; }\n.tk-print-check-box {\nwidth: 12px;\nheight: 12px;\nmargin-top: 3px;\nborder: 1.5px solid var(--tk-accent);\nborder-radius: 3px;\nbackground: #fff;\nflex-shrink: 0;\n}\n.tk-print-panel {\nborder: 1px solid var(--tk-border);\nborder-radius: 10px;\nbackground: #fff;\noverflow: hidden;\nmargin: 0 0 12px;\n}\n.tk-print-panel-label {\ndisplay: flex;\nalign-items: center;\ngap: 7px;\nbackground: #faf8fc;\ncolor: var(--tk-ink);\nfont-size: 0.68rem;\nfont-weight: 800;\nletter-spacing: 0.06em;\ntext-transform: uppercase;\npadding: 6px 10px;\nborder-bottom: 1px solid var(--tk-border);\n}\n.tk-print-icon {\ndisplay: inline-grid;\nplace-items: center;\nwidth: 18px;\nheight: 18px;\nborder-radius: 50%;\nbackground: var(--tk-accent-soft);\ncolor: var(--tk-accent);\nfont-size: 0.6rem;\nfont-weight: 800;\nflex-shrink: 0;\n}\n.tk-print-icon--svg svg {\ndisplay: block;\nwidth: 12px;\nheight: 12px;\n}\n.tk-print-panel-body {\npadding: 10px 12px;\n}\n.tk-print-badge-row,\n.tk-print-chip-row {\ndisplay: flex;\nflex-wrap: wrap;\ngap: 6px;\nmargin: 8px 0;\n}\n.tk-print-badge,\n.tk-print-chip {\ndisplay: inline-flex;\nalign-items: center;\npadding: 3px 10px;\nborder-radius: 999px;\nbackground: var(--tk-accent-soft);\ncolor: var(--tk-accent);\nborder: 1px solid var(--tk-border);\nfont-size: 0.7rem;\nfont-weight: 700;\nline-height: 1.3;\n}\n.tk-print-snapshot-grid,\n.tk-print-day-sheet-grid,\n.tk-print-activity-grid,\n.tk-print-resource-grid,\n.tk-print-day-pair,\n.tk-print-activity-primary,\n.tk-print-activity-secondary {\ndisplay: grid;\ngap: 12px;\n}\n.tk-print-snapshot-grid { grid-template-columns: 1fr 1fr; margin-bottom: 14px; }\n.tk-print-day-sheet-grid { grid-template-columns: 1fr 1fr; }\n.tk-print-activity-grid { grid-template-columns: 1fr 1fr; }\n.tk-print-resource-grid { grid-template-columns: 1fr 1fr; }\n.tk-print-day-pair { grid-template-columns: 1fr; gap: 16px; }\n.tk-print-activity-primary { grid-template-columns: 1fr 1fr; }\n.tk-print-activity-secondary { grid-template-columns: 1fr 1fr; }\n.tk-print-activity-primary .tk-print-panel-label,\n.tk-print-activity-primary .tk-print-panel-body {\nfont-weight: 600;\n}\n.tk-print-activity-secondary .tk-print-panel-body {\ncolor: var(--tk-muted);\nfont-size: 0.92em;\n}\n.tk-print-stat-pill {\ndisplay: inline-flex;\njustify-content: space-between;\nalign-items: center;\ngap: 12px;\npadding: 8px 14px;\nborder-radius: 999px;\nbackground: #fff;\ncolor: var(--tk-ink);\nborder: 1.5px solid var(--tk-accent);\nfont-size: 0.85rem;\nmargin: 4px 0 12px;\n}\n.tk-print-stat-pill strong {\ncolor: var(--tk-accent);\nfont-weight: 800;\n}\n.tk-print-wag-table {\nwidth: 100%;\nborder-collapse: collapse;\ntable-layout: fixed;\nfont-size: 8.5pt;\nmargin: 8px 0 14px;\n}\n.tk-print-wag-table th,\n.tk-print-wag-table td {\nborder: 1px solid var(--tk-border);\npadding: 6px 5px;\nvertical-align: top;\nbackground: #fff;\n}\n.tk-print-wag-table thead th {\nbackground: var(--tk-accent-soft);\ncolor: var(--tk-accent);\nfont-size: 0.68rem;\nfont-weight: 800;\nletter-spacing: 0.04em;\ntext-transform: uppercase;\n}\n.tk-print-wag-table tbody th {\nbackground: #faf8fc;\ncolor: var(--tk-ink);\nfont-size: 0.68rem;\nfont-weight: 800;\ntext-transform: uppercase;\nwidth: 0.85in;\n}\n.tk-print-cell-list li {\nmargin: 3px 0;\npadding-left: 10px;\nposition: relative;\n}\n.tk-print-cell-list li::before {\ncontent: \"\";\nposition: absolute;\nleft: 0;\ntop: 0.45em;\nwidth: 4px;\nheight: 4px;\nborder-radius: 50%;\nbackground: var(--tk-accent);\n}\n.tk-print-domain-row {\ndisplay: flex;\nflex-wrap: wrap;\ngap: 6px;\nmargin: 8px 0 12px;\n}\n.tk-print-day-sheet {\nborder: 1px solid var(--tk-border);\nborder-radius: 12px;\noverflow: hidden;\nbackground: #fff;\nmargin-bottom: 14px;\n}\n.tk-print-day-sheet-head {\nbackground: var(--tk-accent-soft);\ncolor: var(--tk-ink);\npadding: 10px 14px;\nborder-bottom: 1px solid var(--tk-border);\nborder-left: 4px solid var(--tk-accent);\n}\n.tk-print-day-sheet-head h3 {\nmargin: 0 0 3px;\nfont-family: var(--tk-display);\nfont-size: 1.1rem;\ncolor: var(--tk-accent);\n}\n.tk-print-day-sheet-head p {\nmargin: 0;\nfont-size: 0.88rem;\ncolor: var(--tk-muted);\n}\n.tk-print-day-sheet-grid { padding: 12px; }\n.tk-print-activity-card {\nborder: 1px solid var(--tk-border);\nborder-radius: 12px;\nbackground: #fff;\nmargin: 0 0 14px;\noverflow: hidden;\nbox-shadow: 0 1px 0 rgba(45, 27, 78, 0.04);\n}\n.tk-print-activity-head {\ndisplay: grid;\ngrid-template-columns: 1fr auto;\ngap: 10px;\npadding: 12px 14px;\nbackground: #faf8fc;\nborder-bottom: 1px solid var(--tk-border);\n}\n.tk-print-activity-head h3 {\nmargin: 0 0 6px;\nfont-family: var(--tk-display);\ncolor: var(--tk-ink);\nfont-size: 1.08rem;\nline-height: 1.25;\n}\n.tk-print-objective {\nmargin: 6px 0 0;\ncolor: var(--tk-muted);\nfont-size: 0.88rem;\nfont-style: italic;\n}\n.tk-print-activity-grid { padding: 12px; }\n.tk-print-card-photos {\ndisplay: flex;\ngap: 6px;\n}\n.tk-print-card-photo {\nmargin: 0;\nwidth: 0.95in;\nborder: 1px solid var(--tk-border);\nborder-radius: 8px;\noverflow: hidden;\nbackground: #fff;\ntext-align: center;\n}\n.tk-print-card-photo img {\ndisplay: block;\nwidth: 100%;\nheight: 0.75in;\nobject-fit: cover;\n}\n.tk-print-card-photo figcaption {\nfont-size: 0.6rem;\nfont-weight: 800;\ncolor: var(--tk-accent);\npadding: 3px 0;\ntext-transform: uppercase;\nletter-spacing: 0.04em;\n}\n.tk-print-callout {\ndisplay: grid;\ngap: 3px;\nbackground: #fff;\nborder: 1px solid var(--tk-border);\nborder-left: 4px solid var(--tk-accent);\nborder-radius: 10px;\npadding: 10px 12px;\nmargin: 0 0 12px;\n}\n.tk-print-callout strong {\nfont-size: 0.72rem;\nfont-weight: 800;\nletter-spacing: 0.04em;\ntext-transform: uppercase;\ncolor: var(--tk-accent);\n}\n.tk-print-callout-tip {\nborder-left-color: #0f766e;\nbackground: #f0fdf9;\n}\n.tk-print-callout-tip strong { color: #0f766e; }\n.tk-print-callout-watch {\nborder-left-color: #7e22ce;\nbackground: #faf5ff;\n}\n.tk-print-callout-watch strong { color: #7e22ce; }\n.tk-print-callout-extend {\nborder-left-color: #1d4ed8;\nbackground: #eff6ff;\n}\n.tk-print-callout-extend strong { color: #1d4ed8; }\n.tk-print-callout-cleanup {\nborder-left-color: #b45309;\nbackground: #fff7ed;\n}\n.tk-print-callout-cleanup strong { color: #b45309; }\n.tk-print-section-banner {\ndisplay: inline-flex;\nmargin: 8px 0 12px;\npadding: 5px 14px;\nborder-radius: 999px;\nbackground: var(--tk-accent-soft);\ncolor: var(--tk-accent);\nborder: 1px solid var(--tk-border);\nfont-size: 0.68rem;\nfont-weight: 800;\nletter-spacing: 0.06em;\ntext-transform: uppercase;\n}\n.tk-print-resource-card {\nborder: 1px solid var(--tk-border);\nborder-radius: 12px;\npadding: 12px;\nbackground: #fff;\nmargin-bottom: 12px;\n}\n.tk-print-resource-card header {\ndisplay: flex;\njustify-content: space-between;\nflex-wrap: wrap;\ngap: 8px;\nalign-items: start;\nmargin-bottom: 8px;\n}\n.tk-print-resource-card h3 {\nmargin: 0;\nfont-family: var(--tk-display);\ncolor: var(--tk-ink);\nfont-size: 1rem;\nline-height: 1.25;\n}\n.tk-print-resource-preview img {\nwidth: 100%;\nmax-height: 1.4in;\nobject-fit: cover;\nborder-radius: 8px;\nborder: 1px solid var(--tk-border);\n}\n.tk-print-resource-meta {\ndisplay: flex;\nflex-wrap: wrap;\ngap: 8px;\ncolor: var(--tk-muted);\nfont-size: 0.74rem;\nmargin: 6px 0;\n}\n.tk-print-book-card {\ndisplay: grid;\ngrid-template-columns: 0.85in 1fr;\ngap: 12px;\nalign-items: start;\nborder: 1px solid var(--tk-border);\nborder-radius: 12px;\npadding: 12px;\nbackground: #fff;\nmargin-bottom: 12px;\n}\n.tk-print-book-cover {\nwidth: 0.85in;\nmin-height: 1.15in;\nborder-radius: 4px 8px 8px 4px;\nbackground: linear-gradient(135deg, var(--tk-accent-soft) 0%, #fff 50%, var(--tk-accent-soft) 100%);\nborder: 1px solid var(--tk-border);\nborder-left: 4px solid var(--tk-accent);\ndisplay: grid;\nplace-items: center;\nfont-size: 0.55rem;\nfont-weight: 800;\ntext-transform: uppercase;\nletter-spacing: 0.04em;\ncolor: var(--tk-accent);\ntext-align: center;\npadding: 4px;\noverflow: hidden;\n}\n.tk-print-book-cover img {\nwidth: 100%;\nheight: 100%;\nobject-fit: cover;\nborder-radius: 2px 6px 6px 2px;\n}\n.tk-print-book-card .tk-print-book-author {\nmargin: 0 0 6px;\nfont-size: 0.82rem;\ncolor: var(--tk-muted);\nfont-style: italic;\n}\n.tk-print-song-card {\nborder: 1px solid var(--tk-border);\nborder-radius: 12px;\npadding: 12px 14px;\nbackground: #fff;\nmargin-bottom: 12px;\n}\n.tk-print-song-card header {\nmargin-bottom: 8px;\n}\n.tk-print-song-card h3 {\nmargin: 0 0 6px;\nfont-family: var(--tk-display);\nfont-size: 1.02rem;\n}\n.tk-print-lyrics-note {\ndisplay: grid;\ngap: 2px;\nmargin: 10px 0 0;\npadding: 10px 12px;\nborder-radius: 10px;\nbackground: var(--tk-accent-soft);\nborder: 1px solid var(--tk-border);\nborder-left: 4px solid var(--tk-accent);\nfont-size: 0.82rem;\ncolor: var(--tk-ink);\n}\n.tk-print-lyrics-note strong {\nfont-size: 0.68rem;\nfont-weight: 800;\ntext-transform: uppercase;\nletter-spacing: 0.04em;\ncolor: var(--tk-accent);\n}\n.tk-print-cover {\ndisplay: flex;\nflex-direction: column;\njustify-content: space-between;\nbackground: linear-gradient(180deg, #fffefb 0%, #faf7f2 55%, #f5f0fc 100%);\ncolor: var(--tk-ink);\nborder-radius: 0;\npadding: 0 0 18px;\nmin-height: 9.2in;\n}\n.tk-print-cover .tk-print-running {\nmargin-bottom: 0;\nborder-left-color: var(--tk-purple-deep);\n}\n.tk-print-cover .tk-print-footer {\ncolor: var(--tk-muted);\nborder-top-color: var(--tk-border);\npadding: 12px 16px 0;\n}\n.tk-print-cover-inner {\nflex: 1 1 auto;\ndisplay: flex;\nflex-direction: column;\npadding: 0 16px;\n}\n.tk-print-brand-row {\ndisplay: flex;\nalign-items: center;\ngap: 10px;\nmargin: 0 0 10px;\n}\n.tk-print-brand-mark {\nwidth: 28px;\nheight: 28px;\nborder-radius: 8px;\nbackground: var(--tk-purple-soft);\nborder: 1.5px solid var(--tk-purple-line);\ndisplay: grid;\nplace-items: center;\nfont-size: 0.7rem;\nfont-weight: 800;\ncolor: var(--tk-purple-deep);\nflex-shrink: 0;\n}\n.tk-print-brand {\nletter-spacing: 0.12em;\ntext-transform: uppercase;\nfont-size: 0.72rem;\nfont-weight: 800;\ncolor: var(--tk-purple-deep);\nmargin: 0;\n}\n.tk-print-cover-kicker {\ndisplay: inline-flex;\nalign-self: flex-start;\nmargin: 0 0 14px;\npadding: 4px 12px;\nborder-radius: 999px;\nbackground: var(--tk-purple-soft);\nborder: 1px solid var(--tk-border);\ncolor: var(--tk-purple-deep);\nfont-size: 0.72rem;\nfont-weight: 700;\nletter-spacing: 0.04em;\ntext-transform: uppercase;\n}\n.tk-print-cover-hero,\n.tk-print-cover-image {\nwidth: calc(100% + 32px);\nmargin: 0 -16px 18px;\nborder-radius: 0 0 16px 16px;\noverflow: hidden;\nborder: none;\nborder-bottom: 1px solid var(--tk-border);\nmin-height: 55%;\nmax-height: 62vh;\n}\n.tk-print-cover-hero img,\n.tk-print-cover-image img {\ndisplay: block;\nwidth: 100%;\nheight: 100%;\nmin-height: 3.2in;\nmax-height: 4.5in;\nobject-fit: cover;\n}\n.tk-print-cover h1 {\nmargin: 0 0 10px;\nfont-family: var(--tk-display);\nfont-size: 2.5rem;\nline-height: 1.08;\ncolor: var(--tk-ink);\nfont-weight: 700;\n}\n.tk-print-cover-subtitle {\nmargin: 0 0 16px;\nfont-size: 1.05rem;\ncolor: var(--tk-muted);\nfont-weight: 500;\n}\n.tk-print-cover-meta {\ndisplay: grid;\ngrid-template-columns: repeat(2, minmax(0, 1fr));\ngap: 12px;\nmargin: 0 0 16px;\n}\n.tk-print-cover-meta-card {\nbackground: #fff;\nborder: 1px solid var(--tk-border);\nborder-radius: 10px;\npadding: 10px 12px;\n}\n.tk-print-cover-meta-card span,\n.tk-print-meta-label {\ndisplay: block;\nfont-size: 0.62rem;\nletter-spacing: 0.06em;\ntext-transform: uppercase;\ncolor: var(--tk-muted);\nfont-weight: 700;\nmargin-bottom: 4px;\n}\n.tk-print-cover-meta-card strong,\n.tk-print-meta-value {\ndisplay: block;\nmargin-top: 0;\nfont-size: 1rem;\nfont-weight: 700;\ncolor: var(--tk-ink);\nline-height: 1.3;\n}\n.tk-print-cover .tk-print-chip {\nbackground: var(--tk-purple-soft);\ncolor: var(--tk-purple-deep);\nborder-color: var(--tk-border);\n}\n.tk-print-cover-fallback,\n.tk-print-cover-hero-fallback {\ndisplay: flex;\nflex-direction: column;\nalign-items: center;\njustify-content: center;\ngap: 12px;\nmin-height: 3.2in;\nmax-height: 4.5in;\nwidth: 100%;\nborder: none;\nborder-radius: 0 0 16px 16px;\nmargin: 0;\npadding: 24px 16px;\nbackground:\nradial-gradient(circle at 18% 22%, rgba(107, 70, 193, 0.08), transparent 32%),\nradial-gradient(circle at 82% 18%, rgba(246, 231, 168, 0.35), transparent 28%),\nlinear-gradient(165deg, #f7f2ff 0%, #ede4f8 45%, #e8def8 100%);\nposition: relative;\noverflow: hidden;\n}\n.tk-print-cover-fallback::before,\n.tk-print-cover-hero-fallback::before {\ncontent: \"\";\nposition: absolute;\ninset: 0;\nbackground:\nradial-gradient(circle at 12% 78%, rgba(217, 199, 245, 0.5) 0%, transparent 22%),\nradial-gradient(circle at 88% 72%, rgba(203, 182, 239, 0.4) 0%, transparent 20%);\npointer-events: none;\n}\n.tk-print-cover-fallback span {\nposition: relative;\nz-index: 1;\nfont-size: 0.72rem;\nletter-spacing: 0.1em;\ntext-transform: uppercase;\nfont-weight: 800;\ncolor: var(--tk-purple-deep);\n}\n.tk-print-cover-art {\nposition: relative;\nz-index: 1;\nwidth: min(100%, 420px);\nheight: auto;\ndisplay: block;\n}\n.tk-print-cover-hero-brand {\nposition: relative;\nz-index: 1;\nmargin: 0;\nfont-size: 0.78rem;\nfont-weight: 800;\nletter-spacing: 0.1em;\ntext-transform: uppercase;\ncolor: var(--tk-purple-deep);\n}\n.tk-print-empty-state {\ndisplay: flex;\nflex-direction: column;\nalign-items: center;\njustify-content: center;\ntext-align: center;\ngap: 8px;\npadding: 28px 20px;\nmargin: 14px 0;\nborder: 1px dashed var(--tk-border);\nborder-radius: 14px;\nbackground: #faf8fc;\n}\n.tk-print-empty-mark {\nwidth: 40px;\nheight: 40px;\nborder-radius: 50%;\nbackground: var(--tk-accent-soft);\nborder: 1.5px solid var(--tk-border);\nmargin-bottom: 4px;\n}\n.tk-print-empty-title {\nmargin: 0;\nfont-family: var(--tk-display);\nfont-size: 1rem;\nfont-weight: 700;\ncolor: var(--tk-ink);\n}\n.tk-print-empty-copy {\nmargin: 0;\nfont-size: 0.85rem;\ncolor: var(--tk-muted);\nmax-width: 28em;\nline-height: 1.45;\n}\n.tk-print-toolkit-groups {\ndisplay: grid;\ngrid-template-columns: repeat(2, minmax(0, 1fr));\ngap: 14px;\nmargin: 12px 0 16px;\n}\n.tk-print-toolkit-group {\nborder: 1px solid var(--tk-border);\nborder-radius: 12px;\nbackground: #fff;\noverflow: hidden;\n}\n.tk-print-toolkit-group-title {\nmargin: 0;\npadding: 8px 12px;\nfont-size: 0.68rem;\nfont-weight: 800;\nletter-spacing: 0.06em;\ntext-transform: uppercase;\ncolor: var(--tk-accent);\nbackground: var(--tk-accent-soft);\nborder-bottom: 1px solid var(--tk-border);\n}\n.tk-print-toolkit-group .tk-print-panel {\nborder: none;\nborder-radius: 0;\nmargin: 0;\n}\n.tk-print-toolkit-group .tk-print-panel-label {\nbackground: #faf8fc;\nfont-size: 0.64rem;\n}\n.tk-print-vocab-line {\nmargin: 0;\nline-height: 1.6;\nfont-weight: 600;\nword-spacing: 0.12em;\nletter-spacing: 0.02em;\n}\n.tk-print-toc {\nlist-style: none;\nmargin: 0;\npadding: 0;\ndisplay: grid;\ngap: 4px;\n}\n.tk-print-toc-row {\ndisplay: flex;\ngap: 14px;\nalign-items: center;\nborder-bottom: 1px solid var(--tk-border);\npadding: 10px 0;\n}\n.tk-print-toc-num {\nwidth: 28px;\nheight: 28px;\nborder-radius: 999px;\nbackground: var(--tk-accent-soft);\ncolor: var(--tk-accent);\ndisplay: inline-flex;\nalign-items: center;\njustify-content: center;\nfont-weight: 800;\nfont-size: 0.78rem;\nflex-shrink: 0;\n}\n.tk-print-toc-label {\nfont-weight: 600;\ncolor: var(--tk-ink);\n}\n.tk-print-day-activity {\nborder: 1px solid var(--tk-border);\nborder-radius: 12px;\npadding: 12px;\nmargin: 12px 0;\nbackground: #fff;\n}\n.tk-print-day-activity-head {\ndisplay: flex;\nflex-wrap: wrap;\ngap: 8px;\nalign-items: baseline;\nmargin-bottom: 8px;\n}\n.tk-print-day-activity-index {\nfont-size: 0.65rem;\nfont-weight: 800;\ntext-transform: uppercase;\nletter-spacing: 0.05em;\ncolor: var(--tk-accent);\n}\n.tk-print-day-activity-head h4 {\nmargin: 0;\nfont-family: var(--tk-display);\nfont-size: 0.98rem;\n}\n.tk-print-day-activity-grid {\ndisplay: grid;\ngrid-template-columns: 1fr 1fr;\ngap: 10px;\n}\n.tk-print-printable-full {\nmargin: 0;\ntext-align: center;\n}\n.tk-print-printable-full img {\nmax-width: 100%;\nmax-height: 8.5in;\nobject-fit: contain;\n}\n.tk-print-select-block {\nmargin-top: 14px;\npadding-top: 12px;\nborder-top: 1px solid var(--tk-border);\n}\n.tk-select {\nwidth: 100%;\nmargin-top: 6px;\npadding: 8px 10px;\nborder-radius: 8px;\nborder: 1px solid var(--tk-border);\nbackground: #fff;\n}\n{\ndisplay: grid;\ngrid-template-columns: 1fr 1fr;\ngap: 12px;\nmargin-bottom: 12px;\nfont-weight: 700;\n}\n{\ndisplay: block;\nborder-bottom: 1.5px solid var(--tk-border);\nmin-height: 1.1em;\nmargin: 8px 0;\n}\n{\ngrid-template-columns: 1fr 1fr;\nmargin-bottom: 12px;\n}\n{\nborder: 1px solid var(--tk-border);\nborder-radius: 10px;\npadding: 10px 12px;\nbackground: #faf8fc;\n}\nh3 {\nmargin: 0 0 6px;\ncolor: var(--tk-ink);\nfont-size: 0.9rem;\nfont-family: var(--tk-display);\n}\n.tk-print-photo-row {\ndisplay: grid;\ngrid-template-columns: 1fr 1fr;\ngap: 12px;\nmargin: 12px 0 16px;\n}\n.tk-print-photo {\nborder: 1px solid var(--tk-border);\nborder-radius: 10px;\noverflow: hidden;\ntext-align: center;\nfont-size: 0.74rem;\nfont-weight: 700;\nbackground: #faf8fc;\n}\n.tk-print-photo img {\nwidth: 100%;\nmax-height: 2.1in;\nheight: auto;\nobject-fit: contain;\ndisplay: block;\n}\n.tk-print-photo-ph {\nmin-height: 1.4in;\ndisplay: grid;\nplace-items: center;\nbackground: var(--tk-accent-soft);\ncolor: var(--tk-accent);\n}\n.tk-print-admin-banner,\n.tk-owner-preview-banner {\nbackground: #7c2d12;\ncolor: #fff;\nfont-weight: 800;\nletter-spacing: 0.04em;\ntext-transform: uppercase;\nfont-size: 0.68rem;\npadding: 7px 12px;\nborder-radius: 8px;\nmargin: 0 0 12px;\n}\n.tk-owner-preview-banner {\ndisplay: inline-block;\n}\n.tk-print-section h3 {\nfont-family: var(--tk-display);\nfont-size: 1rem;\nmargin: 0 0 8px;\ncolor: var(--tk-ink);\n}\n.tk-print-message {\npadding: 10px 12px;\nborder-radius: 10px;\nborder: 1px solid var(--tk-border);\nbackground: #faf8fc;\nline-height: 1.45;\n}\n.tk-print-watermark {\nposition: fixed;\ninset: 35% 8%;\ntext-align: center;\nfont-size: 1.1rem;\nfont-weight: 800;\ncolor: rgba(84, 46, 148, 0.1);\ntransform: rotate(-18deg);\npointer-events: none;\nz-index: 5;\n}\n.tk-print-cover-frame {\ndisplay: flex;\nflex-direction: column;\ngap: 18px;\nflex: 1 1 auto;\nmin-height: 0;\n}\n.tk-print-cover-copy h1 {\nmargin: 0 0 8px;\nfont-family: Georgia, \"Palatino Linotype\", \"Times New Roman\", serif;\nfont-size: 2.35rem;\nline-height: 1.08;\ncolor: var(--tk-purple-deep, #542e94);\nletter-spacing: -0.02em;\n}\n.tk-print-card-kicker {\ndisplay: inline-flex;\nalign-items: center;\ngap: 6px;\nmargin: 0 0 6px;\ncolor: var(--tk-accent, var(--tk-purple, #6b46c1));\nfont-size: 0.68rem;\nfont-weight: 800;\nletter-spacing: 0.08em;\ntext-transform: uppercase;\n}\n.tk-print-book-stack {\ndisplay: grid;\ngap: 16px;\n}\n.tk-print-book-cover.is-placeholder,\n.tk-print-printable-thumb-fallback {\ndisplay: grid;\nplace-items: center;\nmin-height: 1.6in;\nborder-radius: 10px;\nbackground:\nlinear-gradient(160deg, #f7f2ff 0%, #efe7fb 55%, #e4daf6 100%);\nborder: 1px solid #e8e0f4;\ncolor: var(--tk-purple-deep, #542e94);\nfont-weight: 800;\nletter-spacing: 0.06em;\ntext-transform: uppercase;\nfont-size: 0.72rem;\n}\n.tk-print-printable-thumb-fallback {\nmin-height: 1.1in;\nmargin-bottom: 8px;\n}\n.tk-print-toolkit-intro {\ndisplay: grid;\ngap: 10px;\nmargin-bottom: 14px;\n}\n.tk-print-cover-hero.is-missing .tk-print-cover-image {\ndisplay: none;\n}\n.tk-print-empty-mark {\nwidth: 42px;\nheight: 42px;\nmargin: 0 auto 10px;\nborder-radius: 12px;\nbackground:\nradial-gradient(circle at 30% 30%, #fff, transparent 45%),\nlinear-gradient(145deg, #efe7fb, #d9c8f4);\nborder: 1px solid #e8e0f4;\n}\n.tk-print-callout-tip,\n.tk-print-callout-watch,\n.tk-print-callout-extend,\n.tk-print-callout-cleanup {\ndisplay: grid;\ngap: 4px;\nborder-radius: 10px;\npadding: 10px 12px;\nmargin: 0 0 8px;\nbackground: #fff;\nborder: 1px solid #e8e0f4;\nborder-left-width: 4px;\n}\n.tk-print-callout-tip { border-left-color: #7c3aed; background: #faf7ff; }\n.tk-print-callout-watch { border-left-color: #2563eb; background: #f5f8ff; }\n.tk-print-callout-extend { border-left-color: #b45309; background: #fffaf3; }\n.tk-print-callout-cleanup { border-left-color: #0f766e; background: #f3fbfa; }\n.tk-print-callout-tip strong,\n.tk-print-callout-watch strong,\n.tk-print-callout-extend strong,\n.tk-print-callout-cleanup strong {\nfont-size: 0.72rem;\nletter-spacing: 0.05em;\ntext-transform: uppercase;\ncolor: var(--tk-ink, #2d1b4e);\n}\n.tk-print-root.is-ink-saver .tk-print-cover,\n.tk-print-root.is-ink-saver .tk-print-running,\n.tk-print-root.is-ink-saver .tk-print-day-sheet-head,\n.tk-print-root.is-ink-saver .tk-print-section-banner,\n.tk-print-root.is-ink-saver .tk-print-stat-pill,\n.tk-print-root.is-ink-saver .tk-print-wag-table thead th,\n.tk-print-root.is-ink-saver .tk-print-cover-fallback,\n.tk-print-root.is-ink-saver .tk-print-cover-hero-fallback {\nbackground: #fff !important;\ncolor: #111 !important;\nborder: 1px solid #333 !important;\nborder-left-color: #333 !important;\n}\n.tk-print-root.is-ink-saver .tk-print-cover h1,\n.tk-print-root.is-ink-saver .tk-print-page-title,\n.tk-print-root.is-ink-saver .tk-print-panel-label,\n.tk-print-root.is-ink-saver .tk-print-badge,\n.tk-print-root.is-ink-saver .tk-print-chip {\ncolor: #111 !important;\nbackground: #fff !important;\n}\n@media (max-width: 700px) {\n.tk-print-snapshot-grid,\n.tk-print-day-sheet-grid,\n.tk-print-activity-grid,\n.tk-print-resource-grid,\n.tk-print-cover-meta,\n.tk-print-toolkit-groups,\n.tk-print-activity-primary,\n.tk-print-activity-secondary,\n.tk-print-book-card {\ngrid-template-columns: 1fr;\n}\n.tk-print-book-card {\ngrid-template-columns: 0.75in 1fr;\n}\n}" + "</style>";
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
      validation: model.validation || null,
    };
    built.validation = model.validation || null;
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
