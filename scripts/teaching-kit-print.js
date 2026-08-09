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
      id: "one_song",
      label: "One Song",
      documentMode: "one_song",
      parts: ["songsBooks"],
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
      label: "Printables Only",
      documentMode: "printables",
      parts: ["cover", "printables"],
      daysMode: "none",
    }),
    Object.freeze({
      id: "one_printable",
      label: "One Printable",
      documentMode: "one_printable",
      parts: ["printables"],
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

  function mergeApi() {
    return (typeof globalThis !== "undefined" && globalThis.LLHTeachingKitPrintablePdfMerge)
      || (typeof require === "function" ? (() => { try { return require("./teaching-kit-printable-pdf-merge.js"); } catch (_e) { return null; } })()
      : null);
  }

  function binderPdfApi() {
    return (typeof globalThis !== "undefined" && globalThis.LLHTeachingKitBinderPdf)
      || (typeof require === "function" ? (() => { try { return require("./teaching-kit-binder-pdf.js"); } catch (_e) { return null; } })()
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


  /** True when cleanup text is just a copy of safety (do not print both). */
  function isDuplicateSafetyCleanup(safetyNotes, cleanupTips) {
    const safety = toBullets(safetyNotes, 8).map((line) => text(line).toLowerCase()).filter(Boolean).sort().join("|");
    const cleanup = (Array.isArray(cleanupTips) ? cleanupTips : toBullets(cleanupTips, 8))
      .map((line) => text(line).toLowerCase()).filter(Boolean).sort().join("|");
    return Boolean(safety && cleanup && safety === cleanup);
  }

  function toolkitGroupHtml(groupId, title, icon, innerHtml) {
    if (!text(String(innerHtml || "").replace(/<[^>]+>/g, " "))) return "";
    return `
      <section class="tk-print-toolkit-group" data-toolkit-group="${escapeHtml(groupId)}">
        <h3 class="tk-print-toolkit-group-title">${iconHtml(icon)}<span>${escapeHtml(title)}</span></h3>
        ${innerHtml}
      </section>
    `;
  }

  function materialsGroupedHtml(materials, limit = 60) {
    const rows = (materials || []).map((item) => {
      if (item && typeof item === "object") {
        return {
          label: text(item.label || item.name || item.title),
          category: text(item.category || item.group || item.materialCategory),
        };
      }
      return { label: text(item), category: "" };
    }).filter((item) => item.label);
    if (!rows.length) return "";
    const hasCategories = rows.some((item) => item.category);
    if (!hasCategories) return checkboxListHtml(rows.map((item) => item.label), limit);
    const groups = new Map();
    rows.forEach((item) => {
      const key = item.category || "Other";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item.label);
    });
    return [...groups.entries()].map(([category, labels]) => `
      <div class="tk-print-materials-group tk-print-keep">
        <h4 class="tk-print-materials-group-title">${escapeHtml(category)}</h4>
        ${checkboxListHtml(labels, limit)}
      </div>
    `).join("");
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

  function asIdList(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    const out = [];
    value.forEach((item) => {
      const id = text(item);
      if (!id || seen.has(id)) return;
      seen.add(id);
      out.push(id);
    });
    return out;
  }

  function kitSelectionKey(kit, plan) {
    return text(kit?.lessonPlanId || kit?.id || plan?.id || kit?.title || "teaching-kit");
  }

  function matchByStableId(item, idSet) {
    if (!item || !idSet || !idSet.size) return false;
    const id = text(item.id);
    if (id && idSet.has(id)) return true;
    return false;
  }

  /**
   * Single source of truth: normalize UI/API options into a print request.
   * Downstream preview, print, and PDF download all consume this shape.
   */
  function buildPrintRequest(kit, options) {
    const opts = options || {};
    const presetId = text(opts.preset) || "week_binder";
    const preset = PRESETS.find((item) => item.id === presetId) || PRESETS.find((item) => item.default);
    const parts = opts.parts && typeof opts.parts === "object"
      ? { ...defaultPartsForPreset(preset.id), ...opts.parts }
      : defaultPartsForPreset(preset.id);
    const selectedResources = opts.selectedResources && typeof opts.selectedResources === "object"
      ? opts.selectedResources
      : null;
    const documentMode = resolveDocumentMode(preset.id, opts);

    let dayIds = [];
    if (preset.daysMode === "all") dayIds = WEEKDAYS.slice();
    else if (preset.daysMode === "today") {
      dayIds = [text(opts.day) || kit?.companion?.today?.day || "monday"].filter((day) => WEEKDAYS.includes(day));
    }
    if (Array.isArray(opts.days) && opts.days.length) {
      dayIds = opts.days.map((day) => text(day).toLowerCase()).filter((day) => WEEKDAYS.includes(day));
    }
    if (selectedResources) {
      const selectedDays = asIdList(selectedResources.days).map((day) => day.toLowerCase()).filter((day) => WEEKDAYS.includes(day));
      if (selectedDays.length) dayIds = selectedDays;
    }
    if (parts.daily && !dayIds.length && documentMode !== "selected_resources" && documentMode !== "one_day") {
      dayIds = WEEKDAYS.slice();
    }
    if (documentMode === "one_day" && !dayIds.length) {
      dayIds = [text(opts.day) || "monday"];
    }

    const activityIds = asIdList([
      ...(Array.isArray(opts.activityIds) ? opts.activityIds : []),
      ...(selectedResources && Array.isArray(selectedResources.activityIds) ? selectedResources.activityIds : []),
      text(opts.activityId),
    ].filter(Boolean));
    const songIds = asIdList([
      ...(Array.isArray(opts.songIds) ? opts.songIds : []),
      ...(selectedResources && Array.isArray(selectedResources.songIds) ? selectedResources.songIds : []),
      text(opts.songId),
    ].filter(Boolean));
    const bookIds = asIdList([
      ...(Array.isArray(opts.bookIds) ? opts.bookIds : []),
      ...(selectedResources && Array.isArray(selectedResources.bookIds) ? selectedResources.bookIds : []),
      text(opts.bookId),
    ].filter(Boolean));
    const printableIds = asIdList([
      ...(Array.isArray(opts.printableIds) ? opts.printableIds : []),
      ...(selectedResources && Array.isArray(selectedResources.printableIds) ? selectedResources.printableIds : []),
      text(opts.printableId),
    ].filter(Boolean));

    const removedActivityIds = opts.removedActivityIds && typeof opts.removedActivityIds === "object"
      ? opts.removedActivityIds
      : {};
    const allActivities = kit?.companion?.activities || [];
    const activities = allActivities.filter((item) => item && !removedActivityIds[item.id]);

    return {
      kitKey: kitSelectionKey(kit, opts.plan),
      presetId: preset.id,
      presetLabel: presentLabel(preset.id, preset.label),
      documentMode,
      parts,
      dayIds,
      // Legacy alias used by older assemblers/tests.
      days: dayIds.slice(),
      // Included-kit activities after removals (legacy selection shape).
      activities,
      activityIds,
      activityId: activityIds[0] || "",
      songIds,
      songId: songIds[0] || "",
      bookIds,
      bookId: bookIds[0] || "",
      printableIds,
      printableId: printableIds[0] || "",
      selectedResources,
      removedActivityIds,
      adminPreview: opts.adminPreview === true,
      includeImages: opts.includeImages !== false,
      inkSaver: opts.inkSaver === true,
      paperSize: normalizePaperSize(opts.paperSize),
      watermark: text(opts.watermark),
      footerLabel: text(kit?.companion?.binder?.footerLabel) || `${text(kit?.title) || "Teaching Kit"} · Little Learner Hub`,
      plan: opts.plan && typeof opts.plan === "object" ? opts.plan : null,
      intent: text(opts.intent) || "print",
    };
  }

  /** @deprecated Prefer buildPrintRequest — kept as a thin alias for callers/tests. */
  function normalizeSelection(kit, options) {
    return buildPrintRequest(kit, options);
  }

  function pushManifestItem(items, type, id, label) {
    const key = `${type}:${id || label}`;
    if (items._seen.has(key)) return;
    items._seen.add(key);
    items.push({ type, id: text(id), label: text(label) || text(id), kind: type });
  }

  function dayHasPrintableContent(day) {
    if (!day) return false;
    return Boolean(
      text(day.focus)
      || (day.schedule || []).length
      || (day.activities || []).length
      || (day.books || []).length
      || (day.songs || []).length
      || (day.materials || []).length
      || (day.observations || []).length
      || text(day.parentMessage)
      || text(day.invitationToPlay)
      || text(day.sensory)
      || text(day.fineMotor)
      || text(day.grossMotor)
      || text(day.outdoorPlay)
      || text(day.art)
      || text(day.stem)
      || text(day.smallGroup)
      || text(day.circleTime)
    );
  }

  /**
   * Entire Binder Kit section list — shared by summary, preview, print, and PDF.
   * Only includes sections that exist for this kit and remain enabled by parts.
   */
  function resolveEntireBinderSectionItems(model, selection, include) {
    const items = [];
    items._seen = new Set();
    const parts = selection?.parts || {};
    const coverOn = parts.cover !== false;
    const dailyOn = parts.daily !== false;
    const activitiesOn = parts.activities !== false;
    const songsBooksOn = parts.songsBooks !== false;
    const setupOn = parts.setup !== false;
    const printablesOn = parts.printables !== false;
    const vocabOn = parts.vocabulary !== false;
    const familyOn = parts.family !== false;
    const observationsOn = parts.observations !== false;

    if (coverOn) {
      pushManifestItem(items, "section", "cover", "Branded cover");
      if ((model.sections || []).some((section) => section.id === "toc")) {
        pushManifestItem(items, "section", "toc", "Table of contents");
      }
    }
    if (include.overview) {
      pushManifestItem(items, "section", "overview", "Weekly overview");
    }
    if (include.weekly && dailyOn) {
      pushManifestItem(items, "section", "weekly", "Weekly plan");
    }
    if (include.daily && dailyOn) {
      (model.days || []).forEach((day) => {
        if (!dayHasPrintableContent(day)) return;
        pushManifestItem(items, "day", day.day, `${day.dayLabel} plan`);
      });
      pushManifestItem(items, "section", "daily_materials", "Daily materials and preparation");
    }
    if (include.activities && activitiesOn && (model.activities || []).length) {
      pushManifestItem(items, "section", "activities", "Activity cards");
    }
    if (include.songs && songsBooksOn && (model.songs || []).length) {
      pushManifestItem(items, "section", "songs", "Songs");
    }
    if (include.books && songsBooksOn && (model.books || []).length) {
      pushManifestItem(items, "section", "books", "Books and discussion prompts");
    }
    if (include.vocabulary && vocabOn && (model.overview?.vocabulary || []).length) {
      pushManifestItem(items, "section", "vocabulary", "Vocabulary");
    }
    if (observationsOn && (
      (model.overview?.observationFocus || []).length
      || (model.days || []).some((day) => (day.observations || []).length)
      || (model.activities || []).some((activity) => (activity.observationIdeas || []).length)
    )) {
      pushManifestItem(items, "section", "observations", "Observation / documentation prompts");
    }
    if (familyOn && text(model.overview?.familyConnection)) {
      pushManifestItem(items, "section", "family", "Family connection");
    }
    if (include.toolkit && setupOn) {
      pushManifestItem(items, "section", "toolkit", "Teacher Toolkit");
    }
    if (include.materials && setupOn) {
      pushManifestItem(items, "section", "materials", "Materials list");
    }
    if (include.printables && printablesOn && (model.printables || []).length) {
      pushManifestItem(items, "section", "printables", "Approved / available printables");
    }
    if (selection?.includeImages !== false && activitiesOn && (model.examples || []).length) {
      pushManifestItem(items, "section", "images", "Approved example images");
    }
    delete items._seen;
    return items;
  }

  function titleCaseFileSlug(value) {
    return String(value == null ? "" : value)
      .trim()
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      || "Teaching-Kit";
  }

  /** Clear customer-facing PDF filename for Teaching Kit downloads. */
  function teachingKitPdfFileName(kit, selection = {}, built = null) {
    const titleSlug = titleCaseFileSlug(kit?.title || built?.model?.title || "Teaching-Kit");
    const mode = text(built?.documentMode || selection.documentMode || selection.preset || "entire_binder");
    if (mode === "entire_binder" || mode === "week_binder" || selection.preset === "week_binder") {
      return `Little-Learner-Hub-${titleSlug}-Teacher-Binder.pdf`;
    }
    if (mode === "full_weekly" || selection.preset === "full_weekly_plan") {
      return `Little-Learner-Hub-${titleSlug}-Full-Weekly-Lesson-Plan.pdf`;
    }
    const pack = titleCaseFileSlug(selection.presetLabel || selection.preset || mode);
    return `Little-Learner-Hub-${titleSlug}-${pack}.pdf`;
  }

  function sectionManifestFromHtml(html) {
    return [...String(html || "").matchAll(/data-tk-print-tab="([^"]+)"/g)].map((match) => match[1]);
  }

  /**
   * Resolve a normalized print request against the printable model by stable IDs.
   * Same manifest drives preview HTML, browser print, and PDF download.
   */
  function resolvePrintManifest(kit, request, model) {
    const req = request || {};
    const mode = text(req.documentMode) || "entire_binder";
    const selected = req.selectedResources && typeof req.selectedResources === "object"
      ? req.selectedResources
      : null;
    const items = [];
    items._seen = new Set();

    const dayIdSet = new Set(asIdList(req.dayIds || req.days));
    const activityIdSet = new Set(asIdList(req.activityIds));
    const songIdSet = new Set(asIdList(req.songIds));
    const bookIdSet = new Set(asIdList(req.bookIds));
    const printableIdSet = new Set(asIdList(req.printableIds));

    const allDays = model?.days || [];
    const allActivities = model?.activities || [];
    const allSongs = model?.songs || [];
    const allBooks = model?.books || [];
    const allPrintables = model?.printables || [];

    let days = allDays.slice();
    let activities = allActivities.slice();
    let songs = allSongs.slice();
    let books = allBooks.slice();
    let printables = allPrintables.slice();
    let include = {
      cover: true,
      overview: false,
      vocabulary: false,
      weekly: false,
      toolkit: false,
      materials: false,
      songs: false,
      books: false,
      activities: false,
      printables: false,
      daily: false,
      lyricsOnly: false,
    };
    let materialsScope = "full_kit";
    let materialsLabel = "Materials List";
    let empty = false;
    let emptyReason = "";

    if (mode === "entire_binder" || mode === "full_weekly") {
      include = {
        ...include,
        overview: true,
        vocabulary: true,
        weekly: true,
        toolkit: mode === "entire_binder",
        materials: mode === "entire_binder",
        songs: true,
        books: true,
        activities: true,
        printables: mode === "entire_binder",
        daily: true,
      };
      // Entire Binder Kit summary lists every applicable section — never songs alone.
      const sectionItems = mode === "entire_binder"
        ? resolveEntireBinderSectionItems(model, req, include)
        : [{ type: "pack", id: mode, label: req.presetLabel || "Full Weekly Lesson Plan", kind: "pack" }];
      if (mode === "entire_binder") {
        sectionItems.forEach((item) => pushManifestItem(items, item.type || "section", item.id, item.label));
        if (!items.length) {
          pushManifestItem(items, "pack", mode, req.presetLabel || "Entire Binder Kit");
        }
      } else {
        pushManifestItem(items, "pack", mode, req.presetLabel || mode);
      }
    } else if (mode === "overview" || mode === "weekly_overview") {
      include.overview = true;
      include.weekly = true;
      pushManifestItem(items, "pack", "weekly_overview", "Weekly Overview");
    } else if (mode === "one_day") {
      const dayKey = [...dayIdSet][0] || "monday";
      days = allDays.filter((day) => day.day === dayKey);
      activities = allActivities.filter((item) => item.dayOfWeek === dayKey);
      include.daily = true;
      include.activities = activities.length > 0;
      if (days[0]) pushManifestItem(items, "day", days[0].day, days[0].dayLabel);
      else {
        empty = true;
        emptyReason = "Selected day was not found in this Teaching Kit.";
      }
    } else if (mode === "activities") {
      include.activities = true;
      activities.forEach((item) => pushManifestItem(items, "activity", item.id, item.title));
      if (!activities.length) {
        empty = true;
        emptyReason = "No activities are available in this Teaching Kit.";
      }
    } else if (mode === "one_activity") {
      const wanted = text(req.activityId || [...activityIdSet][0]);
      activities = wanted
        ? allActivities.filter((item) => item.id === wanted)
        : [];
      include.activities = true;
      include.cover = false;
      if (activities[0]) pushManifestItem(items, "activity", activities[0].id, activities[0].title);
      else {
        empty = true;
        emptyReason = wanted
          ? "The selected activity was not found in this Teaching Kit."
          : "Select an activity before printing.";
      }
    } else if (mode === "songs") {
      include.songs = true;
      songs.forEach((item) => pushManifestItem(items, "song", item.id, item.title));
      if (!songs.length) {
        empty = true;
        emptyReason = "No songs are attached to this Teaching Kit.";
      }
    } else if (mode === "one_song") {
      const wanted = text(req.songId || [...songIdSet][0]);
      songs = wanted
        ? allSongs.filter((item) => item.id === wanted)
        : [];
      include.songs = true;
      include.cover = false;
      if (songs[0]) pushManifestItem(items, "song", songs[0].id, songs[0].title);
      else {
        empty = true;
        emptyReason = wanted
          ? "The selected song was not found in this Teaching Kit."
          : "Select a song before printing.";
      }
    } else if (mode === "song_lyrics") {
      include.songs = true;
      include.lyricsOnly = true;
      include.cover = false;
      songs = allSongs.filter((song) => song.lyricsPrintable);
      songs.forEach((item) => pushManifestItem(items, "song_lyrics", item.id, item.title));
      if (!songs.length) {
        // Honest empty guide page is intentional for this preset.
        pushManifestItem(items, "pack", "song_lyrics", "Song Lyrics");
      }
    } else if (mode === "books") {
      include.books = true;
      books.forEach((item) => pushManifestItem(items, "book", item.id, item.title));
      if (!books.length) {
        empty = true;
        emptyReason = "No books are attached to this Teaching Kit.";
      }
    } else if (mode === "materials") {
      include.materials = true;
      const dayKey = [...dayIdSet][0];
      const day = dayKey ? allDays.find((item) => item.day === dayKey) : null;
      if (day) {
        days = [day];
        materialsScope = "selected_days";
        materialsLabel = `${day.dayLabel} Materials`;
        pushManifestItem(items, "materials", day.day, materialsLabel);
      } else {
        pushManifestItem(items, "materials", "full_kit", "Materials List");
      }
    } else if (mode === "toolkit" || mode === "monday_setup") {
      include.toolkit = true;
      pushManifestItem(items, "pack", mode, mode === "monday_setup" ? "Monday Morning Setup" : "Teacher Toolkit");
    } else if (mode === "printables") {
      include.printables = true;
      printables.forEach((item) => pushManifestItem(items, "printable", item.id, item.title));
      if (!printables.length) {
        pushManifestItem(items, "pack", "printables", "Printables");
      }
    } else if (mode === "one_printable") {
      const wanted = text(req.printableId || [...printableIdSet][0]);
      printables = wanted
        ? allPrintables.filter((item) => item.id === wanted)
        : [];
      include.printables = true;
      include.cover = false;
      if (printables[0]) pushManifestItem(items, "printable", printables[0].id, printables[0].title);
      else {
        empty = true;
        emptyReason = wanted
          ? "The selected printable was not found in this Teaching Kit."
          : "Select a printable before printing.";
      }
    } else if (mode === "family") {
      include.overview = true;
      include.vocabulary = true;
      include.songs = true;
      include.books = true;
      pushManifestItem(items, "pack", "family", "Family pack");
    } else if (mode === "selected_resources") {
      include.cover = req.parts?.cover !== false;
      include.overview = selected?.overview === true;
      include.vocabulary = selected?.vocabulary === true;
      include.weekly = selected?.weekly === true || selected?.weekAtAGlance === true;
      include.toolkit = selected?.toolkit === true;
      include.materials = selected?.materials === true;

      const wantAllActivities = selected?.activities === true;
      const wantAllSongs = selected?.songs === true;
      const wantAllBooks = selected?.books === true;
      const wantAllPrintables = selected?.printables === true;

      if (dayIdSet.size) {
        days = allDays.filter((day) => dayIdSet.has(day.day));
        include.daily = true;
        days.forEach((day) => pushManifestItem(items, "day", day.day, day.dayLabel));
      } else {
        days = [];
      }

      if (activityIdSet.size) {
        activities = allActivities.filter((item) => matchByStableId(item, activityIdSet));
        include.activities = true;
      } else if (wantAllActivities) {
        activities = allActivities.slice();
        include.activities = true;
      } else {
        activities = [];
        include.activities = false;
      }
      activities.forEach((item) => pushManifestItem(items, "activity", item.id, item.title));

      if (songIdSet.size) {
        songs = allSongs.filter((item) => matchByStableId(item, songIdSet));
        include.songs = true;
      } else if (wantAllSongs) {
        songs = allSongs.slice();
        include.songs = true;
      } else {
        songs = [];
        include.songs = false;
      }
      songs.forEach((item) => pushManifestItem(items, "song", item.id, item.title));

      if (bookIdSet.size) {
        books = allBooks.filter((item) => matchByStableId(item, bookIdSet));
        include.books = true;
      } else if (wantAllBooks) {
        books = allBooks.slice();
        include.books = true;
      } else {
        books = [];
        include.books = false;
      }
      books.forEach((item) => pushManifestItem(items, "book", item.id, item.title));

      if (printableIdSet.size) {
        printables = allPrintables.filter((item) => matchByStableId(item, printableIdSet));
        include.printables = true;
      } else if (wantAllPrintables) {
        printables = allPrintables.slice();
        include.printables = true;
      } else {
        printables = [];
        include.printables = false;
      }
      printables.forEach((item) => pushManifestItem(items, "printable", item.id, item.title));

      if (include.overview) pushManifestItem(items, "section", "overview", "Overview");
      if (include.vocabulary) pushManifestItem(items, "section", "vocabulary", "Vocabulary");
      if (include.weekly) pushManifestItem(items, "section", "weekly", "Weekly Plan");
      if (include.toolkit) pushManifestItem(items, "section", "toolkit", "Teacher Toolkit");

      if (include.materials) {
        if (dayIdSet.size || activityIdSet.size || (include.activities && activities.length && !wantAllActivities)) {
          materialsScope = dayIdSet.size ? "selected_days" : "selected_activities";
          materialsLabel = dayIdSet.size
            ? `Materials for selected day${dayIdSet.size === 1 ? "" : "s"}`
            : "Materials for selected activities";
        } else {
          materialsScope = "full_kit";
          materialsLabel = "Materials List (full kit)";
        }
        pushManifestItem(items, "materials", materialsScope, materialsLabel);
      }

      if (!items.length) {
        empty = true;
        emptyReason = "Select at least one resource before printing.";
      }
    } else {
      pushManifestItem(items, "pack", mode, req.presetLabel || mode);
    }

    delete items._seen;
    const itemLabels = items.map((item) => item.label).filter(Boolean);
    const summary = humanPrintScopeSummary({
      mode,
      presetId: req.presetId,
      presetLabel: req.presetLabel,
      items,
      days,
      activities,
      empty,
    });

    return {
      ok: !empty,
      empty,
      emptyReason,
      canPrint: !empty,
      kitKey: req.kitKey || kitSelectionKey(kit, req.plan),
      request: req,
      documentMode: mode,
      presetId: req.presetId,
      presetLabel: req.presetLabel,
      include,
      days,
      dayIds: days.map((day) => day.day),
      activities,
      activityIds: activities.map((item) => item.id).filter(Boolean),
      songs,
      songIds: songs.map((item) => item.id).filter(Boolean),
      books,
      bookIds: books.map((item) => item.id).filter(Boolean),
      printables,
      printableIds: printables.map((item) => item.id).filter(Boolean),
      materialsScope,
      materialsLabel,
      items,
      itemCount: items.length,
      itemLabels,
      summary,
      paperSize: req.paperSize || "letter",
      intent: req.intent || "print",
    };
  }

  /** Customer-facing scope label — never "1 item selected" for a whole pack/day. */
  function humanPrintScopeSummary({
    mode = "",
    presetId = "",
    presetLabel = "",
    items = [],
    days = [],
    activities = [],
    empty = false,
  } = {}) {
    if (empty || !items.length) return "No items selected";
    const preset = presentLabel(presetId || mode, presetLabel || mode);
    if (mode === "entire_binder" || presetId === "week_binder") return "Entire Binder Kit selected";
    if (mode === "full_weekly" || presetId === "full_weekly_plan") return "Full Weekly Lesson Plan selected";
    if (mode === "overview" || mode === "weekly_overview" || presetId === "weekly_overview") {
      return "Weekly Overview selected";
    }
    if (mode === "one_day" || presetId === "today_pack") {
      const dayLabel = days[0]?.dayLabel
        || items.find((item) => item.kind === "day" || item.type === "day")?.label;
      return dayLabel ? `${dayLabel} selected` : "One day selected";
    }
    if (mode === "one_activity" || presetId === "one_activity") {
      const title = activities[0]?.title
        || items.find((item) => item.kind === "activity" || item.type === "activity")?.label;
      return title ? `${title} selected` : "One activity selected";
    }
    if (mode === "activities" || presetId === "activities_only") return "Activities Only selected";
    if (mode === "materials" || presetId === "materials_list") return "Materials List selected";
    if (mode === "toolkit" || presetId === "teacher_toolkit") return "Teacher Toolkit selected";
    if (mode === "printables" || mode === "all_printables" || presetId === "all_printables") {
      return "Printables Only selected";
    }
    if (mode === "songs" || presetId === "songs_pack") return "Songs pack selected";
    if (mode === "one_song" || presetId === "one_song") {
      const title = items.find((item) => item.kind === "song" || item.type === "song")?.label;
      return title ? `${title} selected` : "One song selected";
    }
    if (mode === "books" || presetId === "book_guide") return "Book Guide selected";
    if (mode === "song_lyrics" || presetId === "song_lyrics") return "Song Lyrics selected";
    if (mode === "selected" || mode === "selected_resources" || presetId === "selected_resources") {
      if (items.length === 1) return `${items[0].label} selected`;
      return `${items.length} selected resources`;
    }
    if (items.length === 1 && (items[0].kind === "pack" || items[0].type === "pack")) {
      return `${items[0].label} selected`;
    }
    if (preset && preset !== mode) return `${preset} selected`;
    if (items.length === 1) return `${items[0].label} selected`;
    return `${items.length} resources selected`;
  }

  function partCountLabel(partKey, count) {
    const n = Number(count);
    if (!Number.isFinite(n) || n <= 0) return "";
    const units = {
      cover: n === 1 ? "page" : "pages",
      setup: n === 1 ? "material" : "materials",
      daily: n === 1 ? "day with content" : "days with content",
      activities: n === 1 ? "activity" : "activities",
      songsBooks: n === 1 ? "song/book" : "songs/books",
      vocabulary: n === 1 ? "word" : "words",
      family: n === 1 ? "message" : "messages",
      observations: n === 1 ? "prompt" : "prompts",
      printables: n === 1 ? "printable" : "printables",
      images: n === 1 ? "photo" : "photos",
    };
    const unit = units[partKey] || (n === 1 ? "item" : "items");
    return ` — ${n} ${unit}`;
  }

  function summarizePrintSelection(manifest) {
    if (!manifest) return { summary: "No items selected", itemCount: 0, itemLabels: [] };
    return {
      summary: manifest.summary || "No items selected",
      itemCount: Number(manifest.itemCount) || 0,
      itemLabels: Array.isArray(manifest.itemLabels) ? manifest.itemLabels.slice() : [],
      canPrint: manifest.canPrint !== false && !manifest.empty,
      emptyReason: manifest.emptyReason || "",
      documentMode: manifest.documentMode || "",
      presetLabel: manifest.presetLabel || "",
    };
  }

  function scopedMaterialsList(model, manifest) {
    if (!manifest || manifest.materialsScope === "full_kit") {
      return model?.overview?.masterMaterialsDetailed?.length
        ? model.overview.masterMaterialsDetailed
        : (model?.overview?.masterMaterials || []);
    }
    if (manifest.materialsScope === "selected_days") {
      const lists = (manifest.days || []).flatMap((day) => day.materials || []);
      return uniqueMaterialLabels(lists);
    }
    const fromActivities = (manifest.activities || []).flatMap((activity) => (
      activity.materials?.length ? activity.materials : materialsList(activity.materialsText)
    ));
    return uniqueMaterialLabels(fromActivities);
  }

  function uniqueMaterialLabels(values) {
    const seen = new Set();
    const out = [];
    (values || []).forEach((value) => {
      const label = text(typeof value === "string" ? value : value?.label);
      if (!label) return;
      const key = label.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(typeof value === "string" ? label : { ...value, label });
    });
    return out;
  }

  function applyManifestToModel(model, manifest) {
    if (!model || !manifest) return model;
    const next = { ...model };
    const mode = manifest.documentMode;
    if (mode === "one_day" || mode === "selected_resources") {
      next.days = (manifest.days || []).slice();
    }
    if (["one_activity", "activities", "one_day", "selected_resources"].includes(mode)) {
      next.activities = (manifest.activities || []).slice();
    }
    if (["songs", "one_song", "song_lyrics", "selected_resources", "family"].includes(mode)) {
      next.songs = (manifest.songs || []).slice();
    }
    if (["books", "selected_resources", "family"].includes(mode)) {
      next.books = (manifest.books || []).slice();
    }
    if (["printables", "one_printable", "selected_resources"].includes(mode)) {
      next.printables = (manifest.printables || []).slice();
    }
    return next;
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
      ? `<div class="tk-print-cover-hero"><div class="tk-print-cover-image"><img src="${escapeHtml(cover.url)}" alt="${escapeHtml(cover.alt)}" loading="eager" decoding="async" onerror="this.style.display='none'; const fb=this.nextElementSibling; if(fb) fb.hidden=false;" />${coverHeroFallbackHtml().replace('class="tk-print-cover-hero-fallback"', 'class="tk-print-cover-hero-fallback" hidden')}</div></div>`
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

  function partEnabled(selection, key) {
    if (!selection || !selection.parts || typeof selection.parts !== "object") return true;
    return selection.parts[key] !== false;
  }

  function overviewBody(model, selection = null) {
    const o = model.overview || {};
    const vocab = (o.vocabulary || []).map((word) => word.word).filter(Boolean);
    const prep = (o.teacherPrep || []).map((task) => {
      const detail = task.detail ? ` — ${task.detail}` : "";
      return `${task.label}${task.minutes ? ` (~${task.minutes} min)` : ""}${detail}`;
    });
    const includeVocab = partEnabled(selection, "vocabulary");
    const includeFamily = partEnabled(selection, "family");
    const includeObservations = partEnabled(selection, "observations");
    const includeSetup = partEnabled(selection, "setup");
    return [
      model.description || o.description
        ? panelHtml("Description", `<p class="tk-print-tight">${escapeHtml(shortText(model.description || o.description, 280))}</p>`, "info")
        : "",
      panelHtml("Weekly focus", `<p class="tk-print-tight">${escapeHtml(o.weeklyFocus || o.weeklyOverview || "")}</p>`, "focus"),
      panelHtml("Learning objectives", bulletListHtml(o.learningObjectives, 8), "objective"),
      panelHtml("Developmental domains", chipRowHtml(o.learningDomains), "domain"),
      includeVocab ? panelHtml("Vocabulary", chipRowHtml(vocab), "vocab") : "",
      includeSetup && (o.masterMaterials || []).length
        ? panelHtml(
          "Materials / prep summary",
          `<p class="tk-print-tight">This week uses about <strong>${escapeHtml(String((o.masterMaterials || []).length))}</strong> supply items across activities and centers. See the <strong>Materials List</strong> print option for the complete weekly checklist.</p>${checkboxListHtml((o.masterMaterials || []).slice(0, 8), 8)}`,
          "materials",
        )
        : "",
      includeSetup ? panelHtml("Teacher prep", checkboxListHtml(prep, 10), "prep") : "",
      panelHtml("Safety", bulletListHtml(o.safety, 6), "safety"),
      panelHtml("Adaptations / inclusion", bulletListHtml(toBullets(o.adaptations, 5), 5), "adapt"),
      includeObservations ? panelHtml("Observation focus", bulletListHtml(o.observationFocus, 5), "watch") : "",
      includeFamily ? panelHtml("Family connection", bulletListHtml(toBullets(o.familyConnection, 4), 4), "family") : "",
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
    const includeObservations = options.includeObservations !== false;
    const includeFamily = options.includeFamily !== false;
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
          ${includeObservations ? panelHtml("Observation focus", bulletListHtml(day.observations, 5), "watch") : ""}
          ${panelHtml("Teacher notes", bulletListHtml(toBullets(day.teacherNotes, 3), 3), "tip")}
          ${includeFamily ? panelHtml("Family connection", bulletListHtml(toBullets(day.parentMessage, 3), 3), "family") : ""}
        </div>
        ${summaries ? `<div class="tk-print-day-activities"><div class="tk-print-section-banner">Today's activities</div>${summaries}</div>` : ""}
      </article>
    `;
  }

  function activityCardBody(activity, selection, compact) {
    const materials = materialsList(activity.materials?.length ? activity.materials : activity.materialsText);
    const stepLimit = compact ? 6 : 12;
    const promptLimit = compact ? 4 : 10;
    const watchLimit = compact ? 4 : 8;
    const steps = toBullets(activity.steps, stepLimit);
    const tips = [
      ...toBullets(activity.teacherRole, compact ? 2 : 4),
      ...(activity.teacherPrompts || []).map((prompt) => text(prompt.text)).filter(Boolean),
    ].slice(0, promptLimit);
    const watch = (activity.observationIdeas || []).slice(0, watchLimit);
    const adaptBits = [
      ...toBullets(activity.adaptations, compact ? 2 : 4),
      ...toBullets(activity.extensions, compact ? 2 : 4),
    ].slice(0, compact ? 3 : 6);
    const cleanupTips = (activity.cleanupTips || []).map((tip) => text(tip)).filter(Boolean);
    const showCleanup = cleanupTips.length && !isDuplicateSafetyCleanup(activity.safetyNotes, cleanupTips);
    const showSafety = hasDisplayValue(activity.safetyNotes);
    const photoBits = [];
    if (selection.includeImages && activity.setupPhotoUrl) {
      photoBits.push(`<figure class="tk-print-card-photo"><img src="${escapeHtml(activity.setupPhotoUrl)}" alt="${escapeHtml(activity.setupAlt || `Setup for ${activity.title}`)}" loading="eager" decoding="async" onerror="this.closest('figure')?.remove()" /><figcaption>Setup</figcaption></figure>`);
    }
    if (selection.includeImages && activity.examplePhotoUrl) {
      photoBits.push(`<figure class="tk-print-card-photo"><img src="${escapeHtml(activity.examplePhotoUrl)}" alt="${escapeHtml(activity.exampleAlt || `Example for ${activity.title}`)}" loading="eager" decoding="async" onerror="this.closest('figure')?.remove()" /><figcaption>Finished</figcaption></figure>`);
    }
    const printableRef = activity.relatedPrintableId || activity.relatedPrintableTitle
      ? panelHtml(
        "Linked printable",
        `<p class="tk-print-tight">${escapeHtml(activity.relatedPrintableTitle || "Printable resource linked to this activity")}</p>`,
        "print",
      )
      : "";
    return `
      <article class="tk-print-activity-card">
        <header class="tk-print-activity-head tk-print-keep">
          <div>
            <h3>${escapeHtml(activity.title)}</h3>
            <div class="tk-print-badge-row">
              ${badgeHtml(activity.category)}
              ${badgeHtml(activity.ageGroup)}
              ${activity.estimatedMinutes ? badgeHtml(`~${activity.estimatedMinutes} min`) : ""}
              ${badgeHtml(activity.groupSize)}
              ${badgeHtml(activity.dayLabel)}
            </div>
            ${hasDisplayValue(activity.objective) ? `<p class="tk-print-objective">${escapeHtml(shortText(activity.objective, compact ? 120 : 200))}</p>` : ""}
            ${!compact && hasDisplayValue(activity.description) && activity.description !== activity.objective
              ? `<p class="tk-print-tight">${escapeHtml(shortText(activity.description, 180))}</p>` : ""}
            ${!compact && (activity.developmentalDomains || []).length ? `<div class="tk-print-domain-row">${chipRowHtml(activity.developmentalDomains)}</div>` : ""}
          </div>
          ${photoBits.length ? `<div class="tk-print-card-photos">${photoBits.join("")}</div>` : ""}
        </header>
        <div class="tk-print-activity-grid tk-print-activity-primary">
          ${panelHtml("Materials", checkboxListHtml(materials, compact ? 6 : 14), "materials")}
          ${panelHtml("Setup", `<p class="tk-print-tight">${escapeHtml(shortText(activity.setup, compact ? 110 : 220))}</p>`, "setup")}
          ${panelHtml("What to do", numberedListHtml(steps, stepLimit), "steps")}
          ${panelHtml("Teacher prompts", bulletListHtml(tips, promptLimit), "tip")}
        </div>
        ${!compact ? `<div class="tk-print-activity-secondary">
          ${calloutHtml("watch", "Observation", bulletListHtml(watch, watchLimit))}
          ${adaptBits.length ? calloutHtml("extend", "Extensions & adaptations", bulletListHtml(adaptBits, 6)) : ""}
          ${showCleanup ? calloutHtml("cleanup", "Cleanup", bulletListHtml(cleanupTips, 6)) : ""}
          ${hasDisplayValue(activity.familyExtension) ? calloutHtml("tip", "Family extension", bulletListHtml(toBullets(activity.familyExtension, 3), 3)) : ""}
          ${showSafety ? panelHtml("Safety", bulletListHtml(toBullets(activity.safetyNotes, 4), 4), "safety") : ""}
          ${printableRef}
        </div>` : `<div class="tk-print-activity-secondary">${calloutHtml("watch", "Watch for", bulletListHtml(watch, 3))}${printableRef}</div>`}
      </article>
    `;
  }

  function printablesBody(model, selection) {
    const items = model.printables || [];
    if (!items.length) return "";
    const hasPdfAttachments = items.some((item) => item.hasPdfAttachment || (!item.embedAsImage && (item.fileData || item.fileUrl)));
    const hasImagePrintables = items.some((item) => item.embedAsImage);
    const missingAttachments = items.filter((item) => !item.embedAsImage && !(item.fileData || item.fileUrl));
    const noteParts = [];
    if (hasImagePrintables) {
      noteParts.push("Image printables appear full-page when available.");
    }
    if (hasPdfAttachments) {
      noteParts.push("Attached printable PDF page(s) are merged into Download PDF / Print in the selected order, keeping each printable’s original page size and orientation.");
    }
    if (missingAttachments.length) {
      noteParts.push(`${missingAttachments.length} listed printable${missingAttachments.length === 1 ? "" : "s"} have no attached PDF file yet.`);
    }
    if (!noteParts.length) {
      noteParts.push("Printable resources for this lesson are listed below.");
    }
    const note = `<div class="tk-print-callout tk-print-keep" data-tk-printables-note><strong>Printable resources</strong><span>${escapeHtml(noteParts.join(" "))}</span></div>`;
    const cards = items.map((item) => {
      const hasFile = Boolean(item.fileData || item.fileUrl);
      const badge = item.embedAsImage
        ? "Image printable"
        : (hasFile ? "PDF pages included in download" : "PDF attachment missing");
      return `
      <article class="tk-print-resource-card tk-print-printable-card tk-print-keep" data-tk-printable-id="${escapeHtml(item.id || "")}" data-tk-printable-attachment="${hasFile && !item.embedAsImage ? "1" : "0"}">
        <header>
          <h3>${escapeHtml(item.title)}</h3>
          <div class="tk-print-badge-row">
            ${badgeHtml(item.category || "Printable")}
            ${badgeHtml(badge)}
          </div>
        </header>
        ${item.previewUrl
          ? `<div class="tk-print-resource-preview"><img src="${escapeHtml(item.previewUrl)}" alt="${escapeHtml(item.title)}" loading="eager" decoding="async" onerror="this.remove()" /></div>`
          : ""}
        <div class="tk-print-resource-meta">
          ${item.pageCount ? `<span>${escapeHtml(String(item.pageCount))} pages</span>` : ""}
          ${(item.usedInWeek || []).length ? `<span>${escapeHtml(item.usedInWeek.map((slot) => [slot.dayLabel, slot.moment].filter(Boolean).join(" · ")).join("; "))}</span>` : ""}
        </div>
        ${hasDisplayValue(item.description) ? `<p class="tk-print-tight">${escapeHtml(shortText(item.description, 180))}</p>` : ""}
        ${hasDisplayValue(item.purpose) ? panelHtml("Purpose", `<p class="tk-print-tight">${escapeHtml(shortText(item.purpose, 160))}</p>`, "focus") : ""}
        ${hasDisplayValue(item.suggestedUse) ? panelHtml("Suggested use", `<p class="tk-print-tight">${escapeHtml(shortText(item.suggestedUse, 160))}</p>`, "tip") : ""}
        ${hasDisplayValue(item.teacherNotes) ? panelHtml("Teacher notes", `<p class="tk-print-tight">${escapeHtml(shortText(item.teacherNotes, 160))}</p>`, "tip") : ""}
        ${hasDisplayValue(item.printingDirections) ? panelHtml("Printing notes", `<p class="tk-print-tight">${escapeHtml(shortText(item.printingDirections, 200))}</p>`, "print") : ""}
        ${item.embedAsImage
          ? `<p class="tk-print-muted">Full printable image included on the following page.</p>`
          : (hasFile
            ? `<p class="tk-print-muted" data-tk-attachment-included="1"><strong>Actual PDF pages are included</strong> in Download PDF / Print for this selection.</p>`
            : `<p class="tk-print-muted" data-tk-attachment-missing="1"><strong>No PDF file is attached</strong> for this printable. Download will stop with a clear message instead of substituting another file.</p>`)}
      </article>`;
    }).join("");
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
            ${badgeHtml(song.category)}
            ${badgeHtml(song.rights || "")}
            ${(song.relatedDays || []).length ? badgeHtml((song.relatedDays || []).join(", ")) : (song.relatedDay ? badgeHtml(song.relatedDay) : "")}
          </div>
        </header>
        ${hasDisplayValue(song.purpose) ? panelHtml("Teaching purpose", `<p class="tk-print-tight">${escapeHtml(shortText(song.purpose, 180))}</p>`, "focus") : ""}
        ${hasDisplayValue(song.whenToUse) ? panelHtml("Best time / transition", bulletListHtml(toBullets(song.whenToUse, 3), 3), "schedule") : ""}
        ${hasDisplayValue(song.notes) ? panelHtml("Teaching tips", bulletListHtml(toBullets(song.notes, 5), 5), "tip") : ""}
        ${hasDisplayValue(song.motions) ? panelHtml("Movement / actions", bulletListHtml(toBullets(song.motions, 6), 6), "steps") : ""}
        ${hasDisplayValue(song.props) ? panelHtml("Props", checkboxListHtml(toBullets(song.props, 6), 6), "materials") : ""}
        ${(song.vocabulary || []).length ? panelHtml("Vocabulary / concepts", chipRowHtml(song.vocabulary), "vocab") : ""}
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
          ${hasDisplayValue(book.whyThisBook) ? panelHtml("Purpose / why this book", `<p class="tk-print-tight">${escapeHtml(shortText(book.whyThisBook, 220))}</p>`, "focus") : ""}
          ${(book.vocabularyConnections || []).length ? panelHtml("Vocabulary", chipRowHtml(book.vocabularyConnections), "vocab") : ""}
          ${panelHtml("Before reading", bulletListHtml(book.beforeReadingQuestions, 5), "book")}
          ${panelHtml("During reading", bulletListHtml(book.duringReadingPrompts, 6), "book")}
          ${panelHtml("After reading", bulletListHtml(book.afterReadingQuestions || book.readAloudQuestions, 6), "book")}
          ${panelHtml("Extension / related activity", bulletListHtml(book.extensionIdeas, 5), "adapt")}
          ${hasDisplayValue(book.teacherNotes) ? panelHtml("Teacher notes", bulletListHtml(toBullets(book.teacherNotes, 4), 4), "tip") : ""}
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

  function materialsChecklistBody(model, options = {}) {
    const day = options.day || null;
    const manifest = options.manifest || null;
    const title = options.title
      || (day ? `${day.dayLabel} materials` : (manifest?.materialsLabel || "Master materials"));
    let source;
    if (manifest && !day) {
      source = scopedMaterialsList(model, manifest);
    } else if (day?.materials?.length) {
      source = day.materials;
    } else {
      source = model.overview?.masterMaterialsDetailed?.length
        ? model.overview.masterMaterialsDetailed
        : model.overview?.masterMaterials;
    }
    const materialsHtml = materialsGroupedHtml(source, options.limit || 60)
      || checkboxListHtml(source, options.limit || 60);
    if (!materialsHtml) {
      return emptyStateHtml("No materials list yet", "Materials appear here once supplies are listed on the lesson or its activities.");
    }
    const scopeNote = manifest && manifest.materialsScope && manifest.materialsScope !== "full_kit"
      ? `<p class="tk-print-muted tk-print-tight">Scoped to ${escapeHtml(manifest.materialsLabel || "selected content")} — not the full-kit list.</p>`
      : "";
    return `${scopeNote}${panelHtml(title, materialsHtml, "materials")}`;
  }

  function evaluatePresetAvailability(kit, options = {}) {
    const companion = kit && kit.companion ? kit.companion : {};
    const parts = evaluatePrintPartAvailability(kit, options);
    const songs = companion.songs || [];
    const hasPrintableLyrics = songs.some((song) => {
      const rights = text(song.rightsStatus || song.rightsMode || song.rights);
      const allowed = song.lyricsPrintable === true
        || /public domain|traditional|original/i.test(rights)
        || /^(original|public[_-]?domain|traditional)$/i.test(rights);
      return allowed && text(song.lyrics);
    });
    const printables = companion.printables || [];
    const activities = parts.activities?.available;
    const books = (companion.books || []).length > 0;
    const songCount = songs.length > 0;
    const materials = (companion.mondayMorningSetup?.materials || []).length > 0
      || WEEKDAYS.some((day) => (companion.days?.[day]?.materials || []).length > 0)
      || (companion.materialsModel?.master || []).length > 0;
    const toolkit = parts.setup?.available
      || Boolean(text(companion.parentConnection?.readyToSendMessage))
      || (companion.vocabulary || []).length > 0;

    return {
      week_binder: { available: true, reason: "" },
      full_weekly_plan: { available: parts.daily?.available !== false, reason: parts.daily?.reason || "" },
      weekly_overview: { available: true, reason: "" },
      today_pack: { available: parts.daily?.available !== false, reason: parts.daily?.reason || "No daily pages yet" },
      activities_only: { available: Boolean(activities), reason: parts.activities?.reason || "No activities yet" },
      one_activity: { available: Boolean(activities), reason: parts.activities?.reason || "No activities yet" },
      songs_pack: { available: songCount, reason: "No songs attached yet" },
      one_song: { available: songCount, reason: "No songs attached yet" },
      song_lyrics: { available: hasPrintableLyrics, reason: hasPrintableLyrics ? "" : "No printable lyrics available for this lesson" },
      book_guide: { available: books, reason: "No books attached yet" },
      materials_list: { available: materials || parts.setup?.available, reason: "No materials list yet" },
      teacher_toolkit: { available: toolkit, reason: "Teacher Toolkit content not authored yet" },
      all_printables: { available: true, reason: "" }, // polished empty state when none
      one_printable: { available: printables.length > 0, reason: "No printables linked yet" },
      monday_setup_pack: { available: parts.setup?.available !== false, reason: parts.setup?.reason || "" },
      family_pack: { available: parts.family?.available !== false || (companion.vocabulary || []).length > 0, reason: "No family connection yet" },
      selected_resources: { available: true, reason: "" },
    };
  }

  function toolkitBody(model) {
    const toolkit = model.toolkit || {};
    const setup = toolkit.mondayMorningSetup || {};
    const prep = (setup.prepTasks || []).map((task) => `${task.label}${task.minutes ? ` (~${task.minutes} min)` : ""}`);
    const printChecklist = (setup.printChecklist || []).map((item) => `${item.label}${(item.usedInWeek || []).length ? ` (${item.usedInWeek.join("; ")})` : ""}`);
    const vocab = (model.overview?.vocabulary || []).map((word) => word.word).filter(Boolean).slice(0, 20);
    const materialsInner = materialsGroupedHtml(setup.materials, 40) || checkboxListHtml(setup.materials, 40);
    const groups = [
      toolkitGroupHtml("materials", "Setup materials", "materials", materialsInner),
      toolkitGroupHtml("prep", "Prep checklist", "prep", checkboxListHtml(prep, 12)),
      toolkitGroupHtml("print", "Print checklist", "print", checkboxListHtml(printChecklist, 10)),
      toolkitGroupHtml("vocab", "Vocabulary", "vocab", chipRowHtml(vocab)),
      toolkitGroupHtml("tips", "Teaching tips", "tip", bulletListHtml(toolkit.teachingTips, 8)),
      toolkitGroupHtml("safety", "Safety", "safety", bulletListHtml(model.overview?.safety, 4)),
      toolkitGroupHtml("cleanup", "Cleanup", "cleanup", bulletListHtml(toolkit.cleanup, 4)),
      toolkitGroupHtml("observe", "Observation", "watch", bulletListHtml(toolkit.observationGuidance, 6)),
      toolkitGroupHtml("adapt", "Adaptations", "adapt", bulletListHtml(toBullets(toolkit.adaptations, 5), 5)),
      toolkitGroupHtml("family", "Family resources", "family", bulletListHtml(toBullets(toolkit.familyResources, 5), 5)),
    ].filter(Boolean).join("\n");
    return `
      <div class="tk-print-toolkit-intro">
        <div class="tk-print-section-banner">Monday Morning Setup</div>
        ${setup.estimatedPrepMinutes ? `<div class="tk-print-stat-pill"><span>Estimated prep</span><strong>${escapeHtml(String(setup.estimatedPrepMinutes))} min</strong></div>` : ""}
        ${(setup.missingMaterials || []).length ? `<div class="tk-print-callout tk-print-keep"><strong>Needs attention</strong><span>${escapeHtml(setup.missingMaterials.join(" · "))}</span></div>` : ""}
      </div>
      <div class="tk-print-toolkit-groups">${groups}</div>
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
    // Print Center "Sections" checkboxes (selection.parts) must actually trim binder output.
    if (partEnabled(selection, "cover")) {
      chunks.push(coverFromModel(model, selection));
      if (sectionIds.has("toc")) {
        const toc = tocBody(model);
        if (toc) chunks.push(page("Contents", "Table of Contents", adminBannerHtml(selection) + toc, selection.footerLabel));
      }
    }
    if (sectionIds.has("overview")) {
      const overviewHtml = overviewBody(model, selection);
      if (text(overviewHtml.replace(/<[^>]+>/g, " "))) {
        chunks.push(page("Overview", "Overview", adminBannerHtml(selection) + overviewHtml, selection.footerLabel));
      }
    }
    if (sectionIds.has("weekAtAGlance") && partEnabled(selection, "daily")) {
      const wag = weekGlanceBody(model);
      if (wag) chunks.push(page("Weekly Plan", "Weekly Plan", adminBannerHtml(selection) + wag, selection.footerLabel));
    }
    if (sectionIds.has("dailyPlans") && partEnabled(selection, "daily")) {
      (model.days || []).forEach((day) => {
        const body = dailyPlanBody(day, { detailed: true, includeObservations: partEnabled(selection, "observations") });
        if (!text(body.replace(/<[^>]+>/g, ""))) return;
        chunks.push(page("Daily Plans", `${day.dayLabel}`, adminBannerHtml(selection) + body, selection.footerLabel));
      });
    }
    if (sectionIds.has("activities") && partEnabled(selection, "activities")) {
      chunks.push(packActivityPages(model.activities || [], selection, "Activities", false));
    }
    if (sectionIds.has("songs") && partEnabled(selection, "songsBooks")) {
      const body = songsBody(model, false);
      if (body) chunks.push(page("Songs", "Songs", body, selection.footerLabel));
    }
    if (sectionIds.has("books") && partEnabled(selection, "songsBooks")) {
      const body = booksBody(model, selection);
      if (body) chunks.push(page("Books", "Book Guide", body, selection.footerLabel));
    }
    if (sectionIds.has("toolkit") && partEnabled(selection, "setup")) {
      const toolkitHtml = toolkitBody(model);
      if (text(toolkitHtml.replace(/<[^>]+>/g, " "))) {
        chunks.push(page("Teacher Toolkit", "Teacher Toolkit", toolkitHtml, selection.footerLabel));
      }
    }
    if (sectionIds.has("materials") && partEnabled(selection, "setup")) {
      const body = materialsChecklistBody(model);
      if (body) chunks.push(page("Materials", "Materials List", body, selection.footerLabel));
    }
    if (sectionIds.has("printables") && partEnabled(selection, "printables")) {
      const body = printablesBody(model, selection);
      if (body) {
        chunks.push(page("Printables", "Printables", body, selection.footerLabel));
        chunks.push(printableImagePages(model, selection));
      }
    }
    if (sectionIds.has("examples") && selection.includeImages && partEnabled(selection, "activities")) {
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
    return chunks;
  }

  function assembleFullWeekly(model, selection) {
    const chunks = [];
    if (partEnabled(selection, "cover")) {
      chunks.push(coverFromModel(model, { ...selection, documentMode: "full_weekly" }));
    }
    if (partEnabled(selection, "daily") || partEnabled(selection, "vocabulary") || partEnabled(selection, "observations")) {
      const glance = partEnabled(selection, "daily") ? weekGlanceBody(model) : "";
      const wagPage = [
        overviewSnapshotHtml(model),
        glance,
      ].join("\n");
      if (text(wagPage.replace(/<[^>]+>/g, ""))) {
        chunks.push(page("Week at a Glance", "Week at a Glance", wagPage, selection.footerLabel));
      }
    }
    if (partEnabled(selection, "daily")) {
      const dayEntries = (model.days || []).map((day) => {
        const body = dailyPlanBody(day, { detailed: false, includeObservations: partEnabled(selection, "observations") });
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
    }
    if (partEnabled(selection, "activities") && (model.activities || []).length) {
      chunks.push(packActivityPages(model.activities, selection, "Activities", true));
    }
    const refs = [
      partEnabled(selection, "setup")
        ? panelHtml("Materials checklist", checkboxListHtml((model.overview?.masterMaterials || []).slice(0, 30), 30), "M")
        : "",
      partEnabled(selection, "songsBooks") && (model.books || []).length
        ? `<div class="tk-print-section-banner">Books</div>${booksBody(model, selection)}`
        : "",
      partEnabled(selection, "songsBooks") && (model.songs || []).length
        ? `<div class="tk-print-section-banner">Songs</div>${songsBody(model, false)}`
        : "",
      panelHtml("Safety", bulletListHtml(model.overview?.safety, 4), "!"),
      partEnabled(selection, "observations")
        ? panelHtml("Watch for", bulletListHtml(model.overview?.observationFocus, 4), "W")
        : "",
      panelHtml("Adaptations", bulletListHtml(toBullets(model.overview?.adaptations, 3), 3), "+"),
      `<div class="tk-print-section-banner">Planning Notes</div>${teacherNotesBody()}`,
    ].join("\n");
    if (text(refs.replace(/<[^>]+>/g, ""))) {
      chunks.push(page("Resources", "Materials · Books · Songs · Notes", refs, selection.footerLabel));
    }
    return chunks;
  }

  function assembleSelectedResources(model, selection, manifest) {
    const include = manifest?.include || {};
    const chunks = [];
    if (include.cover !== false && partEnabled(selection, "cover")) {
      chunks.push(coverFromModel(model, selection));
    }

    if (include.overview) {
      chunks.push(page("Overview", "Overview", overviewBody(model, selection), selection.footerLabel));
    } else if (include.vocabulary) {
      const vocab = (model.overview?.vocabulary || []).map((word) => word.word).filter(Boolean);
      chunks.push(page(
        "Overview",
        "Vocabulary",
        panelHtml("Vocabulary", chipRowHtml(vocab), "vocab")
          || emptyStateHtml("No vocabulary words yet", "Vocabulary appears here when words are authored on the lesson."),
        selection.footerLabel,
      ));
    }
    if (include.weekly) {
      const dayKeys = (manifest?.dayIds || []).slice();
      const wag = weekGlanceBody(model, dayKeys.length ? dayKeys : null);
      if (wag) chunks.push(page("Weekly Plan", "Weekly Plan", wag, selection.footerLabel));
    }
    (manifest?.days || []).forEach((day) => {
      chunks.push(page("Daily Plans", day.dayLabel, dailyPlanBody(day, { detailed: true }), selection.footerLabel));
    });
    if (include.activities && (manifest?.activities || []).length) {
      chunks.push(packActivityPages(manifest.activities, selection, "Activities", false));
    }
    if (include.songs && (manifest?.songs || []).length) {
      const body = songsBody({ songs: manifest.songs }, false);
      if (body) chunks.push(page("Songs", "Songs", body, selection.footerLabel));
    }
    if (include.books && (manifest?.books || []).length) {
      const body = booksBody({ books: manifest.books }, selection);
      if (body) chunks.push(page("Books", "Book Guide", body, selection.footerLabel));
    }
    if (include.printables && (manifest?.printables || []).length) {
      const scoped = { printables: manifest.printables };
      chunks.push(page("Printables", "Selected Printables", printablesBody(scoped, selection), selection.footerLabel));
      chunks.push(printableImagePages(scoped, selection));
    }
    if (include.materials) {
      chunks.push(page(
        "Materials",
        manifest?.materialsLabel || "Materials List",
        materialsChecklistBody(model, { manifest }),
        selection.footerLabel,
      ));
    }
    if (include.toolkit) {
      chunks.push(page("Teacher Toolkit", "Teacher Toolkit", toolkitBody(model), selection.footerLabel));
    }
    return chunks;
  }

  function assembleMode(model, selection, manifest) {
    const mode = selection.documentMode || "entire_binder";
    const scopedModel = applyManifestToModel(model, manifest);
    if (mode === "entire_binder") return assembleEntireBinder(scopedModel, selection);
    if (mode === "full_weekly") return assembleFullWeekly(scopedModel, selection);
    if (mode === "selected_resources") return assembleSelectedResources(scopedModel, selection, manifest);

    const chunks = [];
    const allowCover = selection.parts.cover !== false
      && mode !== "one_activity"
      && mode !== "one_song"
      && mode !== "one_printable"
      && mode !== "song_lyrics"
      && manifest?.include?.cover !== false;
    if (allowCover) {
      chunks.push(coverFromModel(scopedModel, selection));
    }

    if (mode === "overview" || mode === "weekly_overview") {
      // Weekly Overview pack stays overview-only (cover + overview/week glance).
      // Section checkboxes trim overview panels (vocab / family / setup prep) via overviewBody.
      const body = [
        overviewBody(scopedModel, selection),
        weekGlanceBody(scopedModel),
      ].join("\n");
      chunks.push(page("Overview", "Weekly Overview", body, selection.footerLabel));
      return chunks;
    }
    if (mode === "one_day") {
      const day = (manifest?.days || [])[0] || null;
      if (day && partEnabled(selection, "daily")) {
        chunks.push(page(
          "Daily Plans",
          `${scopedModel.title || "Lesson"} · ${day.dayLabel}`,
          dailyPlanBody(day, {
            detailed: true,
            includeObservations: partEnabled(selection, "observations"),
            includeFamily: partEnabled(selection, "family"),
          }),
          selection.footerLabel,
        ));
      }
      if (partEnabled(selection, "activities") && (manifest?.activities || []).length) {
        chunks.push(packActivityPages(manifest.activities, selection, "Activities", true));
      }
      return chunks;
    }
    if (mode === "activities") {
      if (partEnabled(selection, "activities")) {
        chunks.push(packActivityPages(scopedModel.activities || [], selection, "Activities", false));
      }
      return chunks;
    }
    if (mode === "one_activity") {
      const activity = (manifest?.activities || [])[0] || null;
      if (activity) {
        chunks.push(page(
          "Activities",
          activity.title,
          activityCardBody(activity, selection, false),
          selection.footerLabel,
        ));
      } else {
        chunks.push(page(
          "Activities",
          "Activity",
          emptyStateHtml("Selected activity not found", "Choose an activity from this Teaching Kit, then print again."),
          selection.footerLabel,
        ));
      }
      return chunks;
    }
    if (mode === "songs" || mode === "one_song") {
      chunks.push(page(
        "Songs",
        mode === "one_song" ? ((manifest?.songs || [])[0]?.title || "Song") : "Songs",
        songsBody(scopedModel, false),
        selection.footerLabel,
      ));
      return chunks;
    }
    if (mode === "song_lyrics") {
      const body = songsBody(scopedModel, true);
      if (body) chunks.push(page("Song Guide", "Song Lyrics / Song Guide", body, selection.footerLabel));
      else chunks.push(page("Song Guide", "Song Guide", emptyStateHtml("No printable lyrics available for this lesson", "Use the Songs pack for teaching tips and movement ideas. Lyrics appear here only when rights allow."), selection.footerLabel));
      return chunks;
    }
    if (mode === "books") {
      chunks.push(page("Books", "Book Guide", booksBody(scopedModel, selection), selection.footerLabel));
      return chunks;
    }
    if (mode === "materials") {
      const day = (manifest?.days || [])[0] || null;
      chunks.push(page(
        "Materials",
        manifest?.materialsLabel || (day ? `${day.dayLabel} Materials` : "Materials List"),
        materialsChecklistBody(scopedModel, { day, manifest }),
        selection.footerLabel,
      ));
      return chunks;
    }
    if (mode === "toolkit" || mode === "monday_setup") {
      chunks.push(page("Teacher Toolkit", mode === "monday_setup" ? "Monday Morning Setup" : "Teacher Toolkit", toolkitBody(scopedModel), selection.footerLabel));
      return chunks;
    }
    if (mode === "printables") {
      if ((scopedModel.printables || []).length) {
        chunks.push(page("Printables", "Printable Resources", printablesBody(scopedModel, selection), selection.footerLabel));
        chunks.push(printableImagePages(scopedModel, selection));
      } else {
        chunks.push(page("Printables", "Printable Resources", emptyStateHtml("No printable resources have been added to this lesson yet.", "When printables are linked, teachers will see thumbnails, purpose, suggested use, and printing notes here."), selection.footerLabel));
      }
      return chunks;
    }
    if (mode === "one_printable") {
      const printable = (manifest?.printables || [])[0] || null;
      if (printable) {
        const scoped = { printables: [printable] };
        chunks.push(page("Printables", printable.title, printablesBody(scoped, selection), selection.footerLabel));
        chunks.push(printableImagePages(scoped, selection));
      } else if (!(model.printables || []).length) {
        chunks.push(page("Printables", "Printable Resources", emptyStateHtml("No printable resources have been added to this lesson yet.", "When printables are linked through Admin, they appear here automatically."), selection.footerLabel));
      } else {
        chunks.push(page("Printables", "Printable Resources", emptyStateHtml("Selected printable not found", "Choose a printable linked to this Teaching Kit, then print again."), selection.footerLabel));
      }
      return chunks;
    }
    if (mode === "family") {
      const body = [
        hasDisplayValue(scopedModel.overview?.familyConnection) ? sectionHtml("Family connection", `<div class="tk-print-message">${escapeHtml(scopedModel.overview.familyConnection)}</div>`) : "",
        sectionHtml("Vocabulary", listHtml((scopedModel.overview?.vocabulary || []).map((word) => word.word))),
        sectionHtml("Songs", listHtml((scopedModel.songs || []).map((song) => song.title))),
        sectionHtml("Books", listHtml((scopedModel.books || []).map((book) => book.title))),
      ].join("\n");
      chunks.push(page("Families", "Parent Connection", body, selection.footerLabel));
      return chunks;
    }
    return assembleEntireBinder(scopedModel, selection);
  }

  function designStyleTag() {
    // Critical binder design so print preview stays designed even if main stylesheet is delayed.
    // Full rules (including app print chrome hiding) also live in styles.css.
    return "<style data-tk-print-design>" + ".teaching-kit-print-article,\n.tk-print-root {\n  --tk-purple-deep: #542e94;\n  --tk-purple: #6b46c1;\n  --tk-purple-soft: #f5f0fc;\n  --tk-purple-line: #e8e0f4;\n  --tk-ink: #2d1b4e;\n  --tk-muted: #6b5f82;\n  --tk-accent: var(--tk-purple-deep);\n  --tk-accent-soft: var(--tk-purple-soft);\n  --tk-border: #e8e0f4;\n  --tk-display: Georgia, \"Palatino Linotype\", \"Palatino\", \"Times New Roman\", serif;\n  --tk-body: \"Avenir Next\", \"Segoe UI\", \"Helvetica Neue\", sans-serif;\n  color: var(--tk-ink);\n  background: #fff;\n  counter-reset: tk-page;\n  font-family: var(--tk-body);\n  font-size: 10.5pt;\n  line-height: 1.45;\n  -webkit-print-color-adjust: exact;\n  print-color-adjust: exact;\n}\n\n/* —— Section theme accents (tint headers/badges, not full-page washes) —— */\n.tk-theme-overview { --tk-accent: #542e94; --tk-accent-soft: #f3eefd; }\n.tk-theme-weekly { --tk-accent: #0f766e; --tk-accent-soft: #ecfdf5; }\n.tk-theme-daily { --tk-accent: #1d4ed8; --tk-accent-soft: #eff6ff; }\n.tk-theme-activities { --tk-accent: #b45309; --tk-accent-soft: #fff7ed; }\n.tk-theme-books { --tk-accent: #9a3412; --tk-accent-soft: #fff7ed; }\n.tk-theme-songs { --tk-accent: #7e22ce; --tk-accent-soft: #faf5ff; }\n.tk-theme-printables { --tk-accent: #0369a1; --tk-accent-soft: #f0f9ff; }\n.tk-theme-toolkit { --tk-accent: #334155; --tk-accent-soft: #f8fafc; }\n.tk-theme-toc,\n.tk-theme-default,\n.tk-theme-cover { --tk-accent: #542e94; --tk-accent-soft: #f3eefd; }\n\n.tk-print-page {\n  position: relative;\n  display: flex;\n  flex-direction: column;\n  break-after: page;\n  page-break-after: always;\n  padding: 12px 8px 18px;\n  min-height: 0;\n  box-sizing: border-box;\n  counter-increment: tk-page;\n}\n.tk-print-page:last-of-type {\n  break-after: auto;\n  page-break-after: auto;\n}\n\n/* —— Running header: light bar + thin accent —— */\n.tk-print-running {\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n  gap: 12px;\n  font-size: 0.62rem;\n  font-weight: 700;\n  letter-spacing: 0.08em;\n  text-transform: uppercase;\n  color: var(--tk-muted);\n  background: #fff;\n  margin: 0 0 14px;\n  padding: 6px 10px 6px 12px;\n  border-bottom: 1px solid var(--tk-border);\n  border-left: 3px solid var(--tk-accent);\n  border-radius: 0;\n  flex: 0 0 auto;\n}\n.tk-print-running span:last-child {\n  color: var(--tk-accent);\n  font-weight: 800;\n}\n\n/* —— Title bar: minimal left accent —— */\n.tk-print-title-bar {\n  background: transparent;\n  border: none;\n  border-left: 4px solid var(--tk-accent);\n  border-radius: 0;\n  padding: 4px 0 4px 14px;\n  margin: 0 0 18px;\n}\n.tk-print-page-title {\n  margin: 0;\n  font-family: var(--tk-display);\n  font-size: 1.35rem;\n  font-weight: 700;\n  color: var(--tk-ink);\n  line-height: 1.2;\n  break-after: avoid;\n  page-break-after: avoid;\n}\n.tk-print-rule { display: none; }\n\n.tk-print-body {\n  flex: 1 1 auto;\n  min-height: 0;\n  padding-bottom: 10px;\n  font-size: 10.5pt;\n  line-height: 1.45;\n}\n\n.tk-print-footer {\n  margin-top: auto;\n  padding: 10px 4px 0;\n  display: flex;\n  justify-content: space-between;\n  gap: 12px;\n  font-size: 0.65rem;\n  font-weight: 600;\n  color: var(--tk-muted);\n  border-top: 1px solid var(--tk-border);\n  flex: 0 0 auto;\n}\n.tk-print-page-number::after { content: counter(tk-page); }\n\n.tk-print-keep { break-inside: avoid; page-break-inside: avoid; }\n.tk-print-muted { color: var(--tk-muted); }\n.tk-print-tight { margin: 0; line-height: 1.4; }\n\n/* —— Lists —— */\n.tk-print-list,\n.tk-print-bullets,\n.tk-print-steps,\n.tk-print-check,\n.tk-print-cell-list {\n  margin: 0;\n  padding-left: 0;\n  list-style: none;\n}\n.tk-print-bullets li,\n.tk-print-list li {\n  position: relative;\n  padding-left: 14px;\n  margin: 4px 0;\n}\n.tk-print-bullets li::before,\n.tk-print-list li::before {\n  content: \"\";\n  position: absolute;\n  left: 0;\n  top: 0.5em;\n  width: 5px;\n  height: 5px;\n  border-radius: 50%;\n  background: var(--tk-accent);\n}\n.tk-print-steps { counter-reset: tk-step; }\n.tk-print-steps li {\n  counter-increment: tk-step;\n  position: relative;\n  padding-left: 24px;\n  margin: 5px 0;\n}\n.tk-print-steps li::before {\n  content: counter(tk-step);\n  position: absolute;\n  left: 0;\n  top: 0.05em;\n  width: 17px;\n  height: 17px;\n  border-radius: 50%;\n  background: var(--tk-accent-soft);\n  color: var(--tk-accent);\n  border: 1px solid var(--tk-border);\n  font-size: 0.65rem;\n  font-weight: 800;\n  display: grid;\n  place-items: center;\n}\n\n/* Checklists: checkbox only — no ::before bullets */\n.tk-print-check li {\n  display: grid;\n  grid-template-columns: 14px 1fr;\n  gap: 8px;\n  align-items: start;\n  margin: 4px 0;\n  padding-left: 0;\n}\n.tk-print-check li::before { content: none !important; display: none !important; }\n.tk-print-check-box {\n  width: 12px;\n  height: 12px;\n  margin-top: 3px;\n  border: 1.5px solid var(--tk-accent);\n  border-radius: 3px;\n  background: #fff;\n  flex-shrink: 0;\n}\n\n/* —— Panels —— */\n.tk-print-panel {\n  border: 1px solid var(--tk-border);\n  border-radius: 10px;\n  background: #fff;\n  overflow: hidden;\n  margin: 0 0 12px;\n}\n.tk-print-panel-label {\n  display: flex;\n  align-items: center;\n  gap: 7px;\n  background: #faf8fc;\n  color: var(--tk-ink);\n  font-size: 0.68rem;\n  font-weight: 800;\n  letter-spacing: 0.06em;\n  text-transform: uppercase;\n  padding: 6px 10px;\n  border-bottom: 1px solid var(--tk-border);\n}\n.tk-print-icon {\n  display: inline-grid;\n  place-items: center;\n  width: 18px;\n  height: 18px;\n  border-radius: 50%;\n  background: var(--tk-accent-soft);\n  color: var(--tk-accent);\n  font-size: 0.6rem;\n  font-weight: 800;\n  flex-shrink: 0;\n}\n.tk-print-icon--svg svg {\n  display: block;\n  width: 12px;\n  height: 12px;\n}\n.tk-print-panel-body {\n  padding: 10px 12px;\n}\n\n/* —— Chips & badges —— */\n.tk-print-badge-row,\n.tk-print-chip-row {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 6px;\n  margin: 8px 0;\n}\n.tk-print-badge,\n.tk-print-chip {\n  display: inline-flex;\n  align-items: center;\n  padding: 3px 10px;\n  border-radius: 999px;\n  background: var(--tk-accent-soft);\n  color: var(--tk-accent);\n  border: 1px solid var(--tk-border);\n  font-size: 0.7rem;\n  font-weight: 700;\n  line-height: 1.3;\n}\n\n/* —— Grids —— */\n.tk-print-snapshot-grid,\n.tk-print-day-sheet-grid,\n.tk-print-activity-grid,\n.tk-print-resource-grid,\n.tk-print-notes-grid,\n.tk-print-day-pair,\n.tk-print-activity-primary,\n.tk-print-activity-secondary {\n  display: grid;\n  gap: 12px;\n}\n.tk-print-snapshot-grid { grid-template-columns: 1fr 1fr; margin-bottom: 14px; }\n.tk-print-day-sheet-grid { grid-template-columns: 1fr 1fr; }\n.tk-print-activity-grid { grid-template-columns: 1fr 1fr; }\n.tk-print-resource-grid { grid-template-columns: 1fr 1fr; }\n.tk-print-day-pair { grid-template-columns: 1fr; gap: 16px; }\n.tk-print-activity-primary { grid-template-columns: 1fr 1fr; }\n.tk-print-activity-secondary { grid-template-columns: 1fr 1fr; }\n.tk-print-activity-primary .tk-print-panel-label,\n.tk-print-activity-primary .tk-print-panel-body {\n  font-weight: 600;\n}\n.tk-print-activity-secondary .tk-print-panel-body {\n  color: var(--tk-muted);\n  font-size: 0.92em;\n}\n\n/* —— Stat pill: soft outline —— */\n.tk-print-stat-pill {\n  display: inline-flex;\n  justify-content: space-between;\n  align-items: center;\n  gap: 12px;\n  padding: 8px 14px;\n  border-radius: 999px;\n  background: #fff;\n  color: var(--tk-ink);\n  border: 1.5px solid var(--tk-accent);\n  font-size: 0.85rem;\n  margin: 4px 0 12px;\n}\n.tk-print-stat-pill strong {\n  color: var(--tk-accent);\n  font-weight: 800;\n}\n\n/* —— WAG table: soft header —— */\n.tk-print-wag-table {\n  width: 100%;\n  border-collapse: collapse;\n  table-layout: fixed;\n  font-size: 8.5pt;\n  margin: 8px 0 14px;\n}\n.tk-print-wag-table th,\n.tk-print-wag-table td {\n  border: 1px solid var(--tk-border);\n  padding: 6px 5px;\n  vertical-align: top;\n  background: #fff;\n}\n.tk-print-wag-table thead th {\n  background: var(--tk-accent-soft);\n  color: var(--tk-accent);\n  font-size: 0.68rem;\n  font-weight: 800;\n  letter-spacing: 0.04em;\n  text-transform: uppercase;\n}\n.tk-print-wag-table tbody th {\n  background: #faf8fc;\n  color: var(--tk-ink);\n  font-size: 0.68rem;\n  font-weight: 800;\n  text-transform: uppercase;\n  width: 0.85in;\n}\n.tk-print-cell-list li {\n  margin: 3px 0;\n  padding-left: 10px;\n  position: relative;\n}\n.tk-print-cell-list li::before {\n  content: \"\";\n  position: absolute;\n  left: 0;\n  top: 0.45em;\n  width: 4px;\n  height: 4px;\n  border-radius: 50%;\n  background: var(--tk-accent);\n}\n\n/* —— Domain row —— */\n.tk-print-domain-row {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 6px;\n  margin: 8px 0 12px;\n}\n\n/* —— Day sheet —— */\n.tk-print-day-sheet {\n  border: 1px solid var(--tk-border);\n  border-radius: 12px;\n  overflow: hidden;\n  background: #fff;\n  margin-bottom: 14px;\n}\n.tk-print-day-sheet-head {\n  background: var(--tk-accent-soft);\n  color: var(--tk-ink);\n  padding: 10px 14px;\n  border-bottom: 1px solid var(--tk-border);\n  border-left: 4px solid var(--tk-accent);\n}\n.tk-print-day-sheet-head h3 {\n  margin: 0 0 3px;\n  font-family: var(--tk-display);\n  font-size: 1.1rem;\n  color: var(--tk-accent);\n}\n.tk-print-day-sheet-head p {\n  margin: 0;\n  font-size: 0.88rem;\n  color: var(--tk-muted);\n}\n.tk-print-day-sheet-grid { padding: 12px; }\n\n/* —— Activity cards —— */\n.tk-print-activity-card {\n  border: 1px solid var(--tk-border);\n  border-radius: 12px;\n  background: #fff;\n  margin: 0 0 14px;\n  overflow: hidden;\n  box-shadow: 0 1px 0 rgba(45, 27, 78, 0.04);\n}\n.tk-print-activity-head {\n  display: grid;\n  grid-template-columns: 1fr auto;\n  gap: 10px;\n  padding: 12px 14px;\n  background: #faf8fc;\n  border-bottom: 1px solid var(--tk-border);\n}\n.tk-print-activity-head h3 {\n  margin: 0 0 6px;\n  font-family: var(--tk-display);\n  color: var(--tk-ink);\n  font-size: 1.08rem;\n  line-height: 1.25;\n}\n.tk-print-objective {\n  margin: 6px 0 0;\n  color: var(--tk-muted);\n  font-size: 0.88rem;\n  font-style: italic;\n}\n.tk-print-activity-grid { padding: 12px; }\n.tk-print-card-photos {\n  display: flex;\n  gap: 6px;\n}\n.tk-print-card-photo {\n  margin: 0;\n  width: 0.95in;\n  border: 1px solid var(--tk-border);\n  border-radius: 8px;\n  overflow: hidden;\n  background: #fff;\n  text-align: center;\n}\n.tk-print-card-photo img {\n  display: block;\n  width: 100%;\n  height: 0.75in;\n  object-fit: cover;\n}\n.tk-print-card-photo figcaption {\n  font-size: 0.6rem;\n  font-weight: 800;\n  color: var(--tk-accent);\n  padding: 3px 0;\n  text-transform: uppercase;\n  letter-spacing: 0.04em;\n}\n\n/* —— Callouts —— */\n.tk-print-callout {\n  display: grid;\n  gap: 3px;\n  background: #fff;\n  border: 1px solid var(--tk-border);\n  border-left: 4px solid var(--tk-accent);\n  border-radius: 10px;\n  padding: 10px 12px;\n  margin: 0 0 12px;\n}\n.tk-print-callout strong {\n  font-size: 0.72rem;\n  font-weight: 800;\n  letter-spacing: 0.04em;\n  text-transform: uppercase;\n  color: var(--tk-accent);\n}\n.tk-print-callout-tip {\n  border-left-color: #0f766e;\n  background: #f0fdf9;\n}\n.tk-print-callout-tip strong { color: #0f766e; }\n.tk-print-callout-watch {\n  border-left-color: #7e22ce;\n  background: #faf5ff;\n}\n.tk-print-callout-watch strong { color: #7e22ce; }\n.tk-print-callout-extend {\n  border-left-color: #1d4ed8;\n  background: #eff6ff;\n}\n.tk-print-callout-extend strong { color: #1d4ed8; }\n.tk-print-callout-cleanup {\n  border-left-color: #b45309;\n  background: #fff7ed;\n}\n.tk-print-callout-cleanup strong { color: #b45309; }\n\n/* —— Section banner: light accent pill —— */\n.tk-print-section-banner {\n  display: inline-flex;\n  margin: 8px 0 12px;\n  padding: 5px 14px;\n  border-radius: 999px;\n  background: var(--tk-accent-soft);\n  color: var(--tk-accent);\n  border: 1px solid var(--tk-border);\n  font-size: 0.68rem;\n  font-weight: 800;\n  letter-spacing: 0.06em;\n  text-transform: uppercase;\n}\n\n/* —— Resource / book / song cards —— */\n.tk-print-resource-card {\n  border: 1px solid var(--tk-border);\n  border-radius: 12px;\n  padding: 12px;\n  background: #fff;\n  margin-bottom: 12px;\n}\n.tk-print-resource-card header {\n  display: flex;\n  justify-content: space-between;\n  flex-wrap: wrap;\n  gap: 8px;\n  align-items: start;\n  margin-bottom: 8px;\n}\n.tk-print-resource-card h3 {\n  margin: 0;\n  font-family: var(--tk-display);\n  color: var(--tk-ink);\n  font-size: 1rem;\n  line-height: 1.25;\n}\n.tk-print-resource-preview img {\n  width: 100%;\n  max-height: 1.4in;\n  object-fit: cover;\n  border-radius: 8px;\n  border: 1px solid var(--tk-border);\n}\n.tk-print-resource-meta {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 8px;\n  color: var(--tk-muted);\n  font-size: 0.74rem;\n  margin: 6px 0;\n}\n\n/* Book cards: horizontal layout */\n.tk-print-book-card {\n  display: grid;\n  grid-template-columns: 0.85in 1fr;\n  gap: 12px;\n  align-items: start;\n  border: 1px solid var(--tk-border);\n  border-radius: 12px;\n  padding: 12px;\n  background: #fff;\n  margin-bottom: 12px;\n}\n.tk-print-book-cover {\n  width: 0.85in;\n  min-height: 1.15in;\n  border-radius: 4px 8px 8px 4px;\n  background: linear-gradient(135deg, var(--tk-accent-soft) 0%, #fff 50%, var(--tk-accent-soft) 100%);\n  border: 1px solid var(--tk-border);\n  border-left: 4px solid var(--tk-accent);\n  display: grid;\n  place-items: center;\n  font-size: 0.55rem;\n  font-weight: 800;\n  text-transform: uppercase;\n  letter-spacing: 0.04em;\n  color: var(--tk-accent);\n  text-align: center;\n  padding: 4px;\n  overflow: hidden;\n}\n.tk-print-book-cover img {\n  width: 100%;\n  height: 100%;\n  object-fit: cover;\n  border-radius: 2px 6px 6px 2px;\n}\n.tk-print-book-card .tk-print-book-author {\n  margin: 0 0 6px;\n  font-size: 0.82rem;\n  color: var(--tk-muted);\n  font-style: italic;\n}\n\n/* Song cards */\n.tk-print-song-card {\n  border: 1px solid var(--tk-border);\n  border-radius: 12px;\n  padding: 12px 14px;\n  background: #fff;\n  margin-bottom: 12px;\n}\n.tk-print-song-card header {\n  margin-bottom: 8px;\n}\n.tk-print-song-card h3 {\n  margin: 0 0 6px;\n  font-family: var(--tk-display);\n  font-size: 1.02rem;\n}\n.tk-print-lyrics-note {\n  display: grid;\n  gap: 2px;\n  margin: 10px 0 0;\n  padding: 10px 12px;\n  border-radius: 10px;\n  background: var(--tk-accent-soft);\n  border: 1px solid var(--tk-border);\n  border-left: 4px solid var(--tk-accent);\n  font-size: 0.82rem;\n  color: var(--tk-ink);\n}\n.tk-print-lyrics-note strong {\n  font-size: 0.68rem;\n  font-weight: 800;\n  text-transform: uppercase;\n  letter-spacing: 0.04em;\n  color: var(--tk-accent);\n}\n\n/* —— Cover page —— */\n.tk-print-cover {\n  display: flex;\n  flex-direction: column;\n  justify-content: space-between;\n  background: linear-gradient(180deg, #fffefb 0%, #faf7f2 55%, #f5f0fc 100%);\n  color: var(--tk-ink);\n  border-radius: 0;\n  padding: 0 0 18px;\n  min-height: 9.2in;\n}\n.tk-print-cover .tk-print-running {\n  margin-bottom: 0;\n  border-left-color: var(--tk-purple-deep);\n}\n.tk-print-cover .tk-print-footer {\n  color: var(--tk-muted);\n  border-top-color: var(--tk-border);\n  padding: 12px 16px 0;\n}\n.tk-print-cover-inner {\n  flex: 1 1 auto;\n  display: flex;\n  flex-direction: column;\n  padding: 0 16px;\n}\n.tk-print-brand-row {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  margin: 0 0 10px;\n}\n.tk-print-brand-mark {\n  width: 28px;\n  height: 28px;\n  border-radius: 8px;\n  background: var(--tk-purple-soft);\n  border: 1.5px solid var(--tk-purple-line);\n  display: grid;\n  place-items: center;\n  font-size: 0.7rem;\n  font-weight: 800;\n  color: var(--tk-purple-deep);\n  flex-shrink: 0;\n}\n.tk-print-brand {\n  letter-spacing: 0.12em;\n  text-transform: uppercase;\n  font-size: 0.72rem;\n  font-weight: 800;\n  color: var(--tk-purple-deep);\n  margin: 0;\n}\n.tk-print-cover-kicker {\n  display: inline-flex;\n  align-self: flex-start;\n  margin: 0 0 14px;\n  padding: 4px 12px;\n  border-radius: 999px;\n  background: var(--tk-purple-soft);\n  border: 1px solid var(--tk-border);\n  color: var(--tk-purple-deep);\n  font-size: 0.72rem;\n  font-weight: 700;\n  letter-spacing: 0.04em;\n  text-transform: uppercase;\n}\n.tk-print-cover-hero,\n.tk-print-cover-image {\n  width: calc(100% + 32px);\n  margin: 0 -16px 18px;\n  border-radius: 0 0 16px 16px;\n  overflow: hidden;\n  border: none;\n  border-bottom: 1px solid var(--tk-border);\n  min-height: 55%;\n  max-height: 62vh;\n}\n.tk-print-cover-hero img,\n.tk-print-cover-image img {\n  display: block;\n  width: 100%;\n  height: 100%;\n  min-height: 3.2in;\n  max-height: 4.5in;\n  object-fit: cover;\n}\n.tk-print-cover h1 {\n  margin: 0 0 10px;\n  font-family: var(--tk-display);\n  font-size: 2.5rem;\n  line-height: 1.08;\n  color: var(--tk-ink);\n  font-weight: 700;\n}\n.tk-print-cover-subtitle {\n  margin: 0 0 16px;\n  font-size: 1.05rem;\n  color: var(--tk-muted);\n  font-weight: 500;\n}\n.tk-print-cover-meta {\n  display: grid;\n  grid-template-columns: repeat(2, minmax(0, 1fr));\n  gap: 12px;\n  margin: 0 0 16px;\n}\n.tk-print-cover-meta-card {\n  background: #fff;\n  border: 1px solid var(--tk-border);\n  border-radius: 10px;\n  padding: 10px 12px;\n}\n.tk-print-cover-meta-card span,\n.tk-print-meta-label {\n  display: block;\n  font-size: 0.62rem;\n  letter-spacing: 0.06em;\n  text-transform: uppercase;\n  color: var(--tk-muted);\n  font-weight: 700;\n  margin-bottom: 4px;\n}\n.tk-print-cover-meta-card strong,\n.tk-print-meta-value {\n  display: block;\n  margin-top: 0;\n  font-size: 1rem;\n  font-weight: 700;\n  color: var(--tk-ink);\n  line-height: 1.3;\n}\n.tk-print-cover .tk-print-chip {\n  background: var(--tk-purple-soft);\n  color: var(--tk-purple-deep);\n  border-color: var(--tk-border);\n}\n\n/* Cover fallbacks: soft illustrated feel */\n.tk-print-cover-fallback,\n.tk-print-cover-hero-fallback {\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n  gap: 12px;\n  min-height: 3.2in;\n  max-height: 4.5in;\n  width: 100%;\n  border: none;\n  border-radius: 0 0 16px 16px;\n  margin: 0;\n  padding: 24px 16px;\n  background:\n    radial-gradient(circle at 18% 22%, rgba(107, 70, 193, 0.08), transparent 32%),\n    radial-gradient(circle at 82% 18%, rgba(246, 231, 168, 0.35), transparent 28%),\n    linear-gradient(165deg, #f7f2ff 0%, #ede4f8 45%, #e8def8 100%);\n  position: relative;\n  overflow: hidden;\n}\n.tk-print-cover-fallback::before,\n.tk-print-cover-hero-fallback::before {\n  content: \"\";\n  position: absolute;\n  inset: 0;\n  background:\n    radial-gradient(circle at 12% 78%, rgba(217, 199, 245, 0.5) 0%, transparent 22%),\n    radial-gradient(circle at 88% 72%, rgba(203, 182, 239, 0.4) 0%, transparent 20%);\n  pointer-events: none;\n}\n.tk-print-cover-fallback span {\n  position: relative;\n  z-index: 1;\n  font-size: 0.72rem;\n  letter-spacing: 0.1em;\n  text-transform: uppercase;\n  font-weight: 800;\n  color: var(--tk-purple-deep);\n}\n.tk-print-cover-art {\n  position: relative;\n  z-index: 1;\n  width: min(100%, 420px);\n  height: auto;\n  display: block;\n}\n.tk-print-cover-hero-brand {\n  position: relative;\n  z-index: 1;\n  margin: 0;\n  font-size: 0.78rem;\n  font-weight: 800;\n  letter-spacing: 0.1em;\n  text-transform: uppercase;\n  color: var(--tk-purple-deep);\n}\n\n/* —— Empty state —— */\n.tk-print-empty-state {\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n  text-align: center;\n  gap: 8px;\n  padding: 28px 20px;\n  margin: 14px 0;\n  border: 1px dashed var(--tk-border);\n  border-radius: 14px;\n  background: #faf8fc;\n}\n.tk-print-empty-mark {\n  width: 40px;\n  height: 40px;\n  border-radius: 50%;\n  background: var(--tk-accent-soft);\n  border: 1.5px solid var(--tk-border);\n  margin-bottom: 4px;\n}\n.tk-print-empty-title {\n  margin: 0;\n  font-family: var(--tk-display);\n  font-size: 1rem;\n  font-weight: 700;\n  color: var(--tk-ink);\n}\n.tk-print-empty-copy {\n  margin: 0;\n  font-size: 0.85rem;\n  color: var(--tk-muted);\n  max-width: 28em;\n  line-height: 1.45;\n}\n\n/* —— Toolkit groups —— */\n.tk-print-toolkit-groups {\n  display: grid;\n  grid-template-columns: repeat(2, minmax(0, 1fr));\n  gap: 14px;\n  margin: 12px 0 16px;\n}\n.tk-print-toolkit-group {\n  border: 1px solid var(--tk-border);\n  border-radius: 12px;\n  background: #fff;\n  overflow: hidden;\n}\n.tk-print-toolkit-group-title {\n  margin: 0;\n  padding: 8px 12px;\n  font-size: 0.68rem;\n  font-weight: 800;\n  letter-spacing: 0.06em;\n  text-transform: uppercase;\n  color: var(--tk-accent);\n  background: var(--tk-accent-soft);\n  border-bottom: 1px solid var(--tk-border);\n}\n.tk-print-toolkit-group .tk-print-panel {\n  border: none;\n  border-radius: 0;\n  margin: 0;\n}\n.tk-print-toolkit-group .tk-print-panel-label {\n  background: #faf8fc;\n  font-size: 0.64rem;\n}\n\n/* —— Vocab —— */\n.tk-print-vocab-line {\n  margin: 0;\n  line-height: 1.6;\n  font-weight: 600;\n  word-spacing: 0.12em;\n  letter-spacing: 0.02em;\n}\n\n/* —— TOC —— */\n.tk-print-toc {\n  list-style: none;\n  margin: 0;\n  padding: 0;\n  display: grid;\n  gap: 4px;\n}\n.tk-print-toc-row {\n  display: flex;\n  gap: 14px;\n  align-items: center;\n  border-bottom: 1px solid var(--tk-border);\n  padding: 10px 0;\n}\n.tk-print-toc-num {\n  width: 28px;\n  height: 28px;\n  border-radius: 999px;\n  background: var(--tk-accent-soft);\n  color: var(--tk-accent);\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  font-weight: 800;\n  font-size: 0.78rem;\n  flex-shrink: 0;\n}\n.tk-print-toc-label {\n  font-weight: 600;\n  color: var(--tk-ink);\n}\n\n/* —— Day activity (concise) —— */\n.tk-print-day-activity {\n  border: 1px solid var(--tk-border);\n  border-radius: 12px;\n  padding: 12px;\n  margin: 12px 0;\n  background: #fff;\n}\n.tk-print-day-activity-head {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 8px;\n  align-items: baseline;\n  margin-bottom: 8px;\n}\n.tk-print-day-activity-index {\n  font-size: 0.65rem;\n  font-weight: 800;\n  text-transform: uppercase;\n  letter-spacing: 0.05em;\n  color: var(--tk-accent);\n}\n.tk-print-day-activity-head h4 {\n  margin: 0;\n  font-family: var(--tk-display);\n  font-size: 0.98rem;\n}\n.tk-print-day-activity-grid {\n  display: grid;\n  grid-template-columns: 1fr 1fr;\n  gap: 10px;\n}\n\n/* —— Printables full page —— */\n.tk-print-printable-full {\n  margin: 0;\n  text-align: center;\n}\n.tk-print-printable-full img {\n  max-width: 100%;\n  max-height: 8.5in;\n  object-fit: contain;\n}\n\n/* —— Notes & photos —— */\n.tk-print-select-block {\n  margin-top: 14px;\n  padding-top: 12px;\n  border-top: 1px solid var(--tk-border);\n}\n.tk-select {\n  width: 100%;\n  margin-top: 6px;\n  padding: 8px 10px;\n  border-radius: 8px;\n  border: 1px solid var(--tk-border);\n  background: #fff;\n}\n.tk-print-notes-meta {\n  display: grid;\n  grid-template-columns: 1fr 1fr;\n  gap: 12px;\n  margin-bottom: 12px;\n  font-weight: 700;\n}\n.tk-print-write-inline,\n.tk-print-write-line {\n  display: block;\n  border-bottom: 1.5px solid var(--tk-border);\n  min-height: 1.1em;\n  margin: 8px 0;\n}\n.tk-print-notes-grid {\n  grid-template-columns: 1fr 1fr;\n  margin-bottom: 12px;\n}\n.tk-print-notes-card {\n  border: 1px solid var(--tk-border);\n  border-radius: 10px;\n  padding: 10px 12px;\n  background: #faf8fc;\n}\n.tk-print-notes-card h3 {\n  margin: 0 0 6px;\n  color: var(--tk-ink);\n  font-size: 0.9rem;\n  font-family: var(--tk-display);\n}\n.tk-print-photo-row {\n  display: grid;\n  grid-template-columns: 1fr 1fr;\n  gap: 12px;\n  margin: 12px 0 16px;\n}\n.tk-print-photo {\n  border: 1px solid var(--tk-border);\n  border-radius: 10px;\n  overflow: hidden;\n  text-align: center;\n  font-size: 0.74rem;\n  font-weight: 700;\n  background: #faf8fc;\n}\n.tk-print-photo img {\n  width: 100%;\n  max-height: 2.1in;\n  height: auto;\n  object-fit: contain;\n  display: block;\n}\n.tk-print-photo-ph {\n  min-height: 1.4in;\n  display: grid;\n  place-items: center;\n  background: var(--tk-accent-soft);\n  color: var(--tk-accent);\n}\n\n/* —— Admin banners —— */\n.tk-print-admin-banner,\n.tk-owner-preview-banner {\n  background: #7c2d12;\n  color: #fff;\n  font-weight: 800;\n  letter-spacing: 0.04em;\n  text-transform: uppercase;\n  font-size: 0.68rem;\n  padding: 7px 12px;\n  border-radius: 8px;\n  margin: 0 0 12px;\n}\n.tk-owner-preview-banner {\n  display: inline-block;\n}\n\n.tk-print-section h3 {\n  font-family: var(--tk-display);\n  font-size: 1rem;\n  margin: 0 0 8px;\n  color: var(--tk-ink);\n}\n.tk-print-message {\n  padding: 10px 12px;\n  border-radius: 10px;\n  border: 1px solid var(--tk-border);\n  background: #faf8fc;\n  line-height: 1.45;\n}\n\n.tk-print-watermark {\n  position: fixed;\n  inset: 35% 8%;\n  text-align: center;\n  font-size: 1.1rem;\n  font-weight: 800;\n  color: rgba(84, 46, 148, 0.1);\n  transform: rotate(-18deg);\n  pointer-events: none;\n  z-index: 5;\n}\n\n/* —— Ink saver —— */\n\n.tk-print-cover-frame {\n  display: flex;\n  flex-direction: column;\n  gap: 18px;\n  flex: 1 1 auto;\n  min-height: 0;\n}\n.tk-print-cover-copy h1 {\n  margin: 0 0 8px;\n  font-family: Georgia, \"Palatino Linotype\", \"Times New Roman\", serif;\n  font-size: 2.35rem;\n  line-height: 1.08;\n  color: var(--tk-purple-deep, #542e94);\n  letter-spacing: -0.02em;\n}\n.tk-print-card-kicker {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  margin: 0 0 6px;\n  color: var(--tk-accent, var(--tk-purple, #6b46c1));\n  font-size: 0.68rem;\n  font-weight: 800;\n  letter-spacing: 0.08em;\n  text-transform: uppercase;\n}\n.tk-print-book-stack {\n  display: grid;\n  gap: 16px;\n}\n.tk-print-book-cover.is-placeholder,\n.tk-print-printable-thumb-fallback {\n  display: grid;\n  place-items: center;\n  min-height: 1.6in;\n  border-radius: 10px;\n  background:\n    linear-gradient(160deg, #f7f2ff 0%, #efe7fb 55%, #e4daf6 100%);\n  border: 1px solid #e8e0f4;\n  color: var(--tk-purple-deep, #542e94);\n  font-weight: 800;\n  letter-spacing: 0.06em;\n  text-transform: uppercase;\n  font-size: 0.72rem;\n}\n.tk-print-printable-thumb-fallback {\n  min-height: 1.1in;\n  margin-bottom: 8px;\n}\n.tk-print-toolkit-intro {\n  display: grid;\n  gap: 10px;\n  margin-bottom: 14px;\n}\n.tk-print-cover-hero.is-missing .tk-print-cover-image {\n  display: none;\n}\n.tk-print-cover-image .tk-print-cover-hero-fallback[hidden] {\n  display: none !important;\n}\n.tk-print-cover-image .tk-print-cover-hero-fallback:not([hidden]) {\n  display: flex;\n  min-height: 3.2in;\n  max-height: 4.5in;\n}\n.tk-print-empty-mark {\n  width: 42px;\n  height: 42px;\n  margin: 0 auto 10px;\n  border-radius: 12px;\n  background:\n    radial-gradient(circle at 30% 30%, #fff, transparent 45%),\n    linear-gradient(145deg, #efe7fb, #d9c8f4);\n  border: 1px solid #e8e0f4;\n}\n.tk-print-callout-tip,\n.tk-print-callout-watch,\n.tk-print-callout-extend,\n.tk-print-callout-cleanup {\n  display: grid;\n  gap: 4px;\n  border-radius: 10px;\n  padding: 10px 12px;\n  margin: 0 0 8px;\n  background: #fff;\n  border: 1px solid #e8e0f4;\n  border-left-width: 4px;\n}\n.tk-print-callout-tip { border-left-color: #7c3aed; background: #faf7ff; }\n.tk-print-callout-watch { border-left-color: #2563eb; background: #f5f8ff; }\n.tk-print-callout-extend { border-left-color: #b45309; background: #fffaf3; }\n.tk-print-callout-cleanup { border-left-color: #0f766e; background: #f3fbfa; }\n.tk-print-callout-tip strong,\n.tk-print-callout-watch strong,\n.tk-print-callout-extend strong,\n.tk-print-callout-cleanup strong {\n  font-size: 0.72rem;\n  letter-spacing: 0.05em;\n  text-transform: uppercase;\n  color: var(--tk-ink, #2d1b4e);\n}\n\n.tk-print-root.is-ink-saver .tk-print-cover,\n.tk-print-root.is-ink-saver .tk-print-running,\n.tk-print-root.is-ink-saver .tk-print-day-sheet-head,\n.tk-print-root.is-ink-saver .tk-print-section-banner,\n.tk-print-root.is-ink-saver .tk-print-stat-pill,\n.tk-print-root.is-ink-saver .tk-print-wag-table thead th,\n.tk-print-root.is-ink-saver .tk-print-cover-fallback,\n.tk-print-root.is-ink-saver .tk-print-cover-hero-fallback {\n  background: #fff !important;\n  color: #111 !important;\n  border: 1px solid #333 !important;\n  border-left-color: #333 !important;\n}\n.tk-print-root.is-ink-saver .tk-print-cover h1,\n.tk-print-root.is-ink-saver .tk-print-page-title,\n.tk-print-root.is-ink-saver .tk-print-panel-label,\n.tk-print-root.is-ink-saver .tk-print-badge,\n.tk-print-root.is-ink-saver .tk-print-chip {\n  color: #111 !important;\n  background: #fff !important;\n}\n\n@media (max-width: 700px) {\n  .tk-print-snapshot-grid,\n  .tk-print-day-sheet-grid,\n  .tk-print-activity-grid,\n  .tk-print-resource-grid,\n  .tk-print-notes-grid,\n  .tk-print-cover-meta,\n  .tk-print-toolkit-groups,\n  .tk-print-activity-primary,\n  .tk-print-activity-secondary,\n  .tk-print-book-card {\n    grid-template-columns: 1fr;\n  }\n  .tk-print-book-card {\n    grid-template-columns: 0.75in 1fr;\n  }\n}\n\n@media print {\n  body.printing-teaching-kit .lesson-workspace-topchrome,\n  body.printing-teaching-kit .lesson-workspace-action-bars,\n  body.printing-teaching-kit .lesson-workspace-more-menu,\n  body.printing-teaching-kit .lesson-workspace-action-sheet,\n  body.printing-teaching-kit .tk-ops-nav,\n  body.printing-teaching-kit .tk-ops-tabs,\n  body.printing-teaching-kit .tk-binder-section-nav,\n  body.printing-teaching-kit .tk-surface:not(.teaching-kit-print-article),\n\n  body.printing-teaching-kit #resourceViewerModal .modal-card {\n    box-shadow: none !important;\n    border: 0 !important;\n  }\n  body.printing-teaching-kit .teaching-kit-print-article,\n  body.printing-teaching-kit .tk-print-root {\n    display: block !important;\n  }\n  body.printing-teaching-kit .tk-print-page {\n    min-height: auto;\n    height: auto;\n  }\n  body.printing-teaching-kit .tk-print-keep,\n  body.printing-teaching-kit .tk-print-photo-row,\n  body.printing-teaching-kit .tk-print-callout,\n  body.printing-teaching-kit .tk-print-block,\n  body.printing-teaching-kit .tk-print-day-card,\n  body.printing-teaching-kit .tk-print-activity-card,\n  body.printing-teaching-kit .tk-print-book-card,\n  body.printing-teaching-kit .tk-print-song-card,\n  body.printing-teaching-kit .tk-print-empty-state {\n    break-inside: avoid;\n    page-break-inside: avoid;\n  }\n  body.printing-teaching-kit .tk-print-photo img,\n  body.printing-teaching-kit .tk-print-card-photo img {\n    max-height: 0.85in;\n    -webkit-print-color-adjust: exact;\n    print-color-adjust: exact;\n  }\n  body.printing-teaching-kit .tk-print-cover-hero img,\n  body.printing-teaching-kit .tk-print-cover-image img {\n    max-height: 4.5in;\n    min-height: 3in;\n    -webkit-print-color-adjust: exact;\n    print-color-adjust: exact;\n  }\n  body.printing-teaching-kit .tk-print-cover-hero,\n  body.printing-teaching-kit .tk-print-cover-image,\n  body.printing-teaching-kit .tk-print-cover-fallback,\n  body.printing-teaching-kit .tk-print-cover-hero-fallback {\n    max-height: 4.5in;\n    -webkit-print-color-adjust: exact;\n    print-color-adjust: exact;\n  }\n  body.printing-teaching-kit .tk-print-root,\n  body.printing-teaching-kit .teaching-kit-print-article {\n    -webkit-print-color-adjust: exact;\n    print-color-adjust: exact;\n  }\n  /* Default fallback; binder HTML also injects a matching @page size tag. */\n  @page {\n    size: letter;\n    margin: 0.55in;\n  }\n}\n\n/* Quality pass: safe cover crop, page-break hygiene, materials groups */\n.tk-print-cover-hero img,\n.tk-print-cover-image img {\n  object-fit: cover;\n  object-position: center;\n  width: 100%;\n  max-height: 4.5in;\n}\n.tk-print-book-cover img,\n.tk-print-resource-preview img,\n.tk-print-printable-full img,\n.tk-print-card-photo img {\n  object-fit: contain;\n  object-position: center;\n}\n.tk-print-printable-full img {\n  max-width: 100%;\n  max-height: 8.5in;\n  width: auto;\n  height: auto;\n}\n.tk-print-wag-table {\n  overflow: hidden;\n  word-break: break-word;\n  hyphens: auto;\n}\n.tk-print-wag-table th,\n.tk-print-wag-table td {\n  overflow-wrap: anywhere;\n}\n.tk-print-activity-card,\n.tk-print-book-card,\n.tk-print-song-card,\n.tk-print-day-activity,\n.tk-print-resource-card,\n.tk-print-toolkit-group,\n.tk-print-panel,\n.tk-print-callout-tip,\n.tk-print-callout-watch,\n.tk-print-callout-extend,\n.tk-print-callout-cleanup {\n  break-inside: avoid;\n  page-break-inside: avoid;\n}\n/* Large activity cards may span pages intentionally; keep panels/headers together. */\n.tk-print-activity-card {\n  break-inside: auto;\n  page-break-inside: auto;\n}\n.tk-print-activity-card > .tk-print-activity-head,\n.tk-print-activity-card .tk-print-panel,\n.tk-print-activity-card .tk-print-callout-tip,\n.tk-print-activity-card .tk-print-callout-watch,\n.tk-print-activity-card .tk-print-callout-extend,\n.tk-print-activity-card .tk-print-callout-cleanup {\n  break-inside: avoid;\n  page-break-inside: avoid;\n}\n.tk-print-title-bar,\n.tk-print-page-title,\n.tk-print-running {\n  break-after: avoid;\n  page-break-after: avoid;\n}\n.tk-print-check li {\n  break-inside: avoid;\n  page-break-inside: avoid;\n}\n.tk-print-materials-group {\n  margin: 0 0 12px;\n}\n.tk-print-materials-group-title {\n  margin: 0 0 6px;\n  font-size: 0.78rem;\n  font-weight: 800;\n  letter-spacing: 0.04em;\n  text-transform: uppercase;\n  color: var(--tk-accent, #542e94);\n}" + "</style>";
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
      return { ok: false, reason: "unavailable", html: "", pageCount: 0, manifest: null };
    }
    const selection = buildPrintRequest(kit, options);
    const model = buildModel(kit, { ...options, plan: selection.plan || options?.plan });
    if (!model.ok) {
      return { ok: false, reason: model.reason || "unavailable", html: "", pageCount: 0, manifest: null };
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

    const manifest = resolvePrintManifest(kit, selection, model);
    if (manifest.empty && selection.documentMode === "selected_resources") {
      return {
        ok: false,
        reason: "empty_selection",
        html: "",
        pageCount: 0,
        selection,
        manifest,
        summary: summarizePrintSelection(manifest),
      };
    }
    // Fail closed when a specific ID was requested but could not be resolved.
    // If the kit simply has no items yet, continue to the honest empty-state page.
    if (manifest.empty && selection.documentMode === "one_activity" && selection.activityId) {
      return {
        ok: false,
        reason: "selection_not_found",
        html: "",
        pageCount: 0,
        selection,
        manifest,
        summary: summarizePrintSelection(manifest),
      };
    }
    if (manifest.empty && selection.documentMode === "one_song" && selection.songId) {
      return {
        ok: false,
        reason: "selection_not_found",
        html: "",
        pageCount: 0,
        selection,
        manifest,
        summary: summarizePrintSelection(manifest),
      };
    }
    if (manifest.empty && selection.documentMode === "one_printable" && selection.printableId && (model.printables || []).length) {
      return {
        ok: false,
        reason: "selection_not_found",
        html: "",
        pageCount: 0,
        selection,
        manifest,
        summary: summarizePrintSelection(manifest),
      };
    }

    const chunks = assembleMode(model, selection, manifest);
    const built = wrapPrintRoot(chunks, selection);
    built.selection = selection;
    built.manifest = manifest;
    built.summary = summarizePrintSelection(manifest);
    const merger = mergeApi();
    const attachmentPlan = merger?.planPrintableAttachments
      ? merger.planPrintableAttachments(manifest, {
        // HTML preview can still list printables; merge/download enforces attachments.
        requireAttachment: false,
        failOnMissing: false,
      })
      : { ok: true, attachments: [], missing: [], duplicatesSkipped: [], summary: "" };
    built.attachmentPlan = attachmentPlan;
    built.model = {
      ok: model.ok,
      title: model.title,
      sections: model.sections,
      capabilities: model.capabilities,
      source: model.source,
      validation: model.validation || null,
    };
    built.validation = model.validation || null;
    built.sectionManifest = sectionManifestFromHtml(built.html);
    built.fileName = teachingKitPdfFileName(kit, selection, built);
    // Content fingerprint so preview/print/download can assert same resolved selection.
    const partKey = Object.keys(selection.parts || {})
      .sort()
      .map((key) => `${key}:${selection.parts[key] ? 1 : 0}`)
      .join(",");
    built.contentFingerprint = [
      selection.documentMode,
      selection.paperSize || "letter",
      selection.inkSaver ? "ink1" : "ink0",
      selection.includeImages === false ? "img0" : "img1",
      partKey,
      ...(manifest.itemLabels || []),
      ...(manifest.dayIds || []),
      ...(manifest.activityIds || []),
      ...(manifest.songIds || []),
      ...(manifest.bookIds || []),
      ...(manifest.printableIds || []),
      manifest.materialsScope || "",
      ...(built.sectionManifest || []),
      ...(attachmentPlan.attachments || []).map((item) => item.id),
    ].join("|");
    return built;
  }

  /** Preview uses the exact same builder as print/PDF download. */
  function buildPrintPreviewHtml(kit, options) {
    return buildBinderPrintHtml(kit, { ...(options || {}), intent: "preview" });
  }

  /**
   * Build the final downloadable/printable PDF for a selection:
   * binder HTML → PDF, then merge selected printable PDF attachments in order.
   */
  async function buildMergedTeachingKitPdf(kit, options = {}) {
    const built = buildBinderPrintHtml(kit, options);
    if (!built.ok) {
      return {
        ok: false,
        reason: built.reason || "build_failed",
        bytes: null,
        built,
        report: null,
      };
    }

    const merger = mergeApi();
    const binderApi = binderPdfApi();
    if (!merger?.mergeTeachingKitPdf || !binderApi?.renderBinderPdf) {
      return {
        ok: false,
        reason: "pdf_pipeline_missing",
        bytes: null,
        built,
        report: null,
      };
    }

    const selectedPdfPrintables = (built.manifest?.printables || []).filter((item) => !item.embedAsImage);
    const strictPlan = merger.planPrintableAttachments(built.manifest, {
      // Fail closed when the selection includes PDF printables that must be attached.
      requireAttachment: selectedPdfPrintables.length > 0,
      failOnMissing: selectedPdfPrintables.length > 0,
    });
    if (!strictPlan.ok) {
      return {
        ok: false,
        reason: strictPlan.reason || "attachment_missing",
        bytes: null,
        built,
        report: strictPlan,
        message: strictPlan.summary,
      };
    }

    const binderInput = options.host || built.html;
    const binderRendered = await binderApi.renderBinderPdf(binderInput, {
      paperSize: built.paperSize || options.paperSize || "letter",
      stylesHref: options.stylesHref,
      forceBrowser: options.forceBrowser === true || Boolean(options.host),
    });
    // Allow printable-only packs to skip binder pages when binder render is empty
    // but attachments exist (e.g. one_printable with cover omitted).
    const allowAttachmentOnly = ["printables", "one_printable"].includes(built.documentMode)
      && strictPlan.attachments.length > 0;
    if (!binderRendered.ok && !allowAttachmentOnly) {
      return {
        ok: false,
        reason: binderRendered.reason || "binder_pdf_failed",
        bytes: null,
        built,
        report: strictPlan,
        message: binderRendered.message
          || "Could not render the Teaching Kit binder to PDF. Please try again.",
      };
    }

    const merged = await merger.mergeTeachingKitPdf({
      binderPdfBytes: binderRendered.ok ? binderRendered.bytes : null,
      manifest: built.manifest,
      attachmentPlan: strictPlan,
      fetchBytes: options.fetchBytes,
      failOnInvalid: true,
    });
    if (!merged.ok) {
      return {
        ok: false,
        reason: merged.reason || "merge_failed",
        bytes: null,
        built,
        report: merged.report || strictPlan,
        message: merged.report?.summary || "",
      };
    }

    return {
      ok: true,
      reason: "ok",
      bytes: merged.bytes,
      built,
      report: {
        ...merged.report,
        binderEngine: binderRendered.engine || null,
        contentFingerprint: built.contentFingerprint,
        selectedPrintableIds: built.manifest?.printableIds || [],
        includedPrintableIds: (merged.report?.included || []).map((item) => item.id),
      },
      manifest: built.manifest,
      contentFingerprint: built.contentFingerprint,
    };
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
    buildPrintRequest,
    normalizeSelection,
    resolvePrintManifest,
    resolveEntireBinderSectionItems,
    summarizePrintSelection,
    humanPrintScopeSummary,
    partCountLabel,
    applyManifestToModel,
    normalizePaperSize,
    pageSizeCss,
    pageSizeStyleTag,
    teachingKitPdfFileName,
    sectionManifestFromHtml,
    evaluatePrintAuthorization,
    evaluatePrintPartAvailability,
    evaluatePresetAvailability,
    buildBinderPrintHtml,
    buildPrintPreviewHtml,
    buildMergedTeachingKitPdf,
    buildEntireBinderKitHtml,
    buildFullWeeklyLessonPlanHtml,
    buildFullWeeklyLessonPlanText,
  };
});
