/**
 * Binder Builder — print HTML for US Letter physical binders.
 *
 * Isolated from Teaching Kit digital binder print. Never includes admin chrome,
 * materials lists (weekly), or preparation checklists.
 */
(function (root, factory) {
  const api = factory(
    root && root.LLHBinderBuilderTransform
      ? root.LLHBinderBuilderTransform
      : (typeof require === "function" ? require("./binder-builder-transform.js") : null),
    root && root.LLHBinderBuilderQr
      ? root.LLHBinderBuilderQr
      : (typeof require === "function" ? require("./binder-builder-qr.js") : null),
    root && root.LLHBinderBuilderPrintLayout
      ? root.LLHBinderBuilderPrintLayout
      : (typeof require === "function" ? require("./binder-builder-print-layout.js") : null),
    root && root.LLHBinderBuilderModel
      ? root.LLHBinderBuilderModel
      : (typeof require === "function" ? require("./binder-builder-model.js") : null),
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LLHBinderBuilderPrint = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (transform, qr, printLayout, model) {
  "use strict";

  if (!transform || !qr || !printLayout || !model) {
    throw new Error("Binder Builder print requires transform, qr, print-layout, and model modules.");
  }

  const { buildBinderDocument, buildContentPagePlan, asText } = transform;
  const { qrFigureHtml, validateBinderUrl } = qr;
  const { finalizePrintPagePlan, validateBinderPrintOutput } = printLayout;
  const { WEEKDAYS, WEEKDAY_LABELS } = model;

  const DAY_COLOR_CLASS = {
    monday: "bb-day-monday",
    tuesday: "bb-day-tuesday",
    wednesday: "bb-day-wednesday",
    thursday: "bb-day-thursday",
    friday: "bb-day-friday",
  };

  /** Set for the duration of buildBinderPrintHtml so image URLs can be absolutized. */
  let currentAssetOrigin = "";


  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function multiline(value) {
    const raw = asText(value);
    if (!raw) return "";
    return esc(raw).replace(/\n/g, "<br>");
  }

  function sectionBlock(title, body, className = "") {
    const text = asText(body?.text != null ? body.text : body);
    if (!text) return "";
    return [
      `<section class="bb-activity-section${className ? ` ${esc(className)}` : ""}">`,
      `<h4>${esc(title)}</h4>`,
      `<p>${multiline(text)}</p>`,
      `</section>`,
    ].join("");
  }

  function stripLeadingStepNumber(line) {
    return String(line || "").replace(/^\d+[\.\)]\s+/, "").trim();
  }

  function stepsBlock(title, body) {
    const text = asText(body?.text != null ? body.text : body);
    if (!text) return "";
    const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    if (lines.length > 1) {
      return [
        `<section class="bb-activity-section">`,
        `<h4>${esc(title)}</h4>`,
        `<ol class="bb-activity-steps">`,
        ...lines.map((line) => `<li>${esc(stripLeadingStepNumber(line))}</li>`),
        `</ol>`,
        `</section>`,
      ].join("");
    }
    return sectionBlock(title, body);
  }

  function learningBlock(title, body) {
    const text = asText(body?.text != null ? body.text : body);
    if (!text) return "";
    const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    if (lines.length > 1) {
      return [
        `<section class="bb-activity-section">`,
        `<h4>${esc(title)}</h4>`,
        `<ul class="bb-activity-learning">`,
        ...lines.map((line) => `<li>${esc(line)}</li>`),
        `</ul>`,
        `</section>`,
      ].join("");
    }
    return sectionBlock(title, body);
  }

  function includedCallout(text) {
    const raw = asText(text);
    if (!raw) return "";
    const lines = raw.split(/\n+/).map((line) => line.replace(/^[✓✔•\-\*]\s*/, "").trim()).filter(Boolean);
    if (!lines.length) return "";
    return [
      `<aside class="bb-included">`,
      `<p class="bb-included-label">Included</p>`,
      `<ul>`,
      ...lines.map((line) => `<li>✓ ${esc(line)}</li>`),
      `</ul>`,
      `</aside>`,
    ].join("");
  }

  function tipCallout(body) {
    const text = asText(body?.text != null ? body.text : body);
    if (!text) return "";
    return [
      `<aside class="bb-teacher-tip">`,
      `<p class="bb-teacher-tip-label">Teacher Tip</p>`,
      `<p>${multiline(text)}</p>`,
      `</aside>`,
    ].join("");
  }

  /**
   * Resolve binder media URLs for print. Relative /api/... paths need an absolute origin
   * or Chromium print/PDF can leave empty frames.
   * @param {string} url
   * @param {string} [assetOrigin]
   */
  function resolvePrintAssetUrl(url, assetOrigin) {
    const raw = asText(url);
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith("/") && asText(assetOrigin)) {
      return `${String(assetOrigin).replace(/\/$/, "")}${raw}`;
    }
    if (raw.startsWith("/")) return raw;
    return "";
  }

  /**
   * Print image helper. By default omits markup when there is no URL (no empty placeholder).
   * Cover may pass { allowFallback: true } for an intentional decorative fallback.
   * Print uses eager loading so browser PDF does not leave reserved empty frames.
   */
  function imageHtml(image, className, options = {}) {
    let url = resolvePrintAssetUrl(image?.url, options.assetOrigin || currentAssetOrigin);
    if (url && !(url.startsWith("/") || /^https?:\/\//i.test(url))) {
      url = "";
    }
    if (!url) {
      if (options.allowFallback === true) {
        return `<div class="${esc(className)} bb-image-fallback" role="img" aria-label="Decorative placeholder"></div>`;
      }
      return "";
    }
    const alt = esc(image?.alt || "Lesson image");
    // Eager + sync decode: lazy images frequently fail to paint in window.print()/PDF.
    // onerror collapses the frame and marks broken for readiness/owner review.
    // Washi accents live on .bb-media-stack so the photo frame can keep overflow:hidden
    // (prevents object-fit images from painting over instructions below).
    return [
      `<div class="bb-media-stack">`,
      `<span class="bb-washi bb-washi-a" aria-hidden="true"></span>`,
      `<span class="bb-washi bb-washi-b" aria-hidden="true"></span>`,
      `<div class="${esc(className)}" data-bb-image-frame="1" data-bb-image-url="${esc(url)}">`,
      `<img src="${esc(url)}" alt="${alt}" loading="eager" decoding="sync" data-bb-print-image="1" `,
      `onload="this.setAttribute('data-bb-image-state','loaded');" `,
      `onerror="this.setAttribute('data-bb-image-state','failed');var f=this.parentElement;if(f){f.classList.add('is-broken');f.setAttribute('data-bb-image-state','failed');var s=f.parentElement;if(s&&s.classList.contains('bb-media-stack')){s.classList.add('is-broken');}this.remove();}"`,
      `>`,
      `</div>`,
      `</div>`,
    ].join("");
  }

  /**
   * Custom footer: centered brand + bottom-right page number.
   * Cover omits footer. No browser chrome / timestamps / URLs.
   */
  function footerHtml(pageNumber) {
    const n = Number(pageNumber);
    if (!Number.isFinite(n) || n < 1) return "";
    return [
      `<footer class="bb-page-footer">`,
      `<span class="bb-footer-brand">Little Learner Hub</span>`,
      `<span class="bb-footer-page">Page ${esc(String(n))}</span>`,
      `</footer>`,
    ].join("");
  }

  function dayToneClass(dayKey) {
    return DAY_COLOR_CLASS[dayKey] || "";
  }

  function renderCover(doc) {
    const p = doc.personalization || {};
    const personalBits = [p.teacherName, p.classroomName, p.programName].filter(Boolean);
    return [
      `<article class="bb-page bb-page-cover" data-bb-page="cover">`,
      `<div class="bb-cover-frame">`,
      `<p class="bb-cover-brand">Little Learner Hub</p>`,
      `<p class="bb-cover-descriptor">Weekly Teaching Binder</p>`,
      imageHtml(doc.coverImage, "bb-cover-media", { allowFallback: true }),
      `<div class="bb-cover-copy">`,
      `<h1>${esc(doc.title)}</h1>`,
      doc.theme ? `<p class="bb-cover-theme">${esc(doc.theme)}</p>` : "",
      doc.ageGroup ? `<p class="bb-cover-age">${esc(doc.ageGroup)}</p>` : "",
      p.subtitle ? `<p class="bb-cover-subtitle">${esc(p.subtitle)}</p>` : "",
      personalBits.length ? `<p class="bb-cover-personal">${esc(personalBits.join(" · "))}</p>` : "",
      `</div>`,
      `</div>`,
      `</article>`,
    ].join("");
  }

  function renderTableOfContents(doc, page) {
    const entries = Array.isArray(page.tocEntries) ? page.tocEntries : [];
    const continued = (page.tocIndex || 0) > 0;
    const rows = entries.map((entry) => [
      `<li class="bb-toc-row${entry.indent ? " is-indent" : ""}">`,
      `<span class="bb-toc-title">${esc(entry.title)}</span>`,
      `<span class="bb-toc-dots" aria-hidden="true"></span>`,
      `<span class="bb-toc-page">${esc(String(entry.pageNumber || ""))}</span>`,
      `</li>`,
    ].join("")).join("");

    return [
      `<article class="bb-page bb-page-toc" data-bb-page="tableOfContents" data-bb-toc-index="${esc(String(page.tocIndex || 0))}">`,
      `<header class="bb-page-header bb-banner-header">`,
      `<p class="bb-kicker">Navigation</p>`,
      `<h2>${continued ? "Table of Contents — Continued" : "Table of Contents"}</h2>`,
      `</header>`,
      `<ol class="bb-toc-list" data-bb-toc-list>${rows}</ol>`,
      footerHtml(page.pageNumber),
      `</article>`,
    ].join("");
  }

  function renderWelcome(doc, page) {
    const lines = asText(doc.welcomeCopy).split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const cards = lines.slice(0, 4).map((line, index) => [
      `<section class="bb-welcome-card">`,
      `<p class="bb-welcome-num">${esc(String(index + 1))}</p>`,
      `<p>${esc(line)}</p>`,
      `</section>`,
    ].join("")).join("");
    const quick = lines[0]
      ? `<aside class="bb-quick-start"><p class="bb-quick-start-label">Quick Start</p><p>${esc(lines[0])}</p></aside>`
      : "";

    return [
      `<article class="bb-page bb-page-welcome" data-bb-page="welcome">`,
      `<header class="bb-page-header bb-banner-header">`,
      `<p class="bb-kicker">Welcome</p>`,
      `<h2>How to Use This Binder</h2>`,
      `</header>`,
      quick,
      `<div class="bb-welcome-grid">${cards || `<div class="bb-prose">${multiline(doc.welcomeCopy)}</div>`}</div>`,
      footerHtml(page.pageNumber),
      `</article>`,
    ].join("");
  }

  function normalizeWeekdayKey(value) {
    const raw = asText(value).toLowerCase();
    if (WEEKDAYS.includes(raw)) return raw;
    const map = {
      mon: "monday", tue: "tuesday", wed: "wednesday", thu: "thursday", fri: "friday",
      monday: "monday", tuesday: "tuesday", wednesday: "wednesday", thursday: "thursday", friday: "friday",
    };
    return map[raw] || "";
  }

  /** Explicit day→title only. Never fall back to books[0]/songs[0]. */
  function resourceTitleForDay(entries, dayKey) {
    const key = normalizeWeekdayKey(dayKey);
    if (!key) return "";
    const hit = (entries || []).find((item) => normalizeWeekdayKey(item?.weekday || item?.suggestedWeekday || item?.linkedWeekday) === key);
    return asText(hit?.title);
  }

  function renderWeekAtAGlance(doc, page) {
    const days = Array.isArray(doc.days) ? doc.days : [];
    const books = Array.isArray(doc.books) ? doc.books : [];
    const songs = Array.isArray(doc.songs) ? doc.songs : [];
    const weekStories = books.map((b) => asText(b.title)).filter(Boolean);
    const weekSongs = songs.map((s) => asText(s.title)).filter(Boolean);

    const plannerCols = days.map((day) => {
      const activities = Array.isArray(day.activities) ? day.activities : [];
      const items = activities.length
        ? [
          `<ul class="bb-week-planner-acts">`,
          ...activities.map((act) => `<li>${esc(act.title || "Activity")}</li>`),
          `</ul>`,
        ].join("")
        : `<p class="bb-week-planner-empty">—</p>`;
      // Only show story/song under a day when an explicit weekday association exists.
      const dayBook = resourceTitleForDay(books, day.dayKey);
      const daySong = resourceTitleForDay(songs, day.dayKey);
      const extras = [];
      if (dayBook) extras.push(`<p class="bb-week-extra"><span>Story</span> ${esc(dayBook)}</p>`);
      if (daySong) extras.push(`<p class="bb-week-extra"><span>Song</span> ${esc(daySong)}</p>`);
      return [
        `<section class="bb-week-planner-day ${dayToneClass(day.dayKey)}" data-bb-week-day="${esc(day.dayKey || "")}">`,
        `<h3>${esc(day.label || "")}</h3>`,
        day.title?.text ? `<p class="bb-week-planner-focus">${esc(day.title.text)}</p>` : "",
        items,
        extras.join(""),
        `</section>`,
      ].join("");
    }).join("");

    return [
      `<article class="bb-page bb-page-week" data-bb-page="weekAtAGlance">`,
      `<header class="bb-page-header bb-banner-header">`,
      `<p class="bb-kicker">Overview</p>`,
      `<h2>Week at a Glance</h2>`,
      `</header>`,
      `<div class="bb-week-summary">`,
      `<p class="bb-week-theme"><strong>Theme:</strong> ${esc(doc.theme || doc.title)}</p>`,
      doc.weekFocus?.text ? `<p class="bb-week-focus"><strong>Weekly focus:</strong> ${esc(doc.weekFocus.text)}</p>` : "",
      doc.developmentalFocus?.text
        ? `<p class="bb-week-learning"><strong>Learning focus:</strong> ${esc(doc.developmentalFocus.text)}</p>`
        : "",
      weekStories.length
        ? `<p class="bb-week-catalog" data-bb-week-stories><strong>Stories this week:</strong> ${esc(weekStories.join(" · "))}</p>`
        : "",
      weekSongs.length
        ? `<p class="bb-week-catalog" data-bb-week-songs><strong>Songs this week:</strong> ${esc(weekSongs.join(" · "))}</p>`
        : "",
      `</div>`,
      `<div class="bb-week-planner" data-bb-week-planner aria-label="Monday through Friday weekly planner">`,
      plannerCols,
      `</div>`,
      footerHtml(page.pageNumber),
      `</article>`,
    ].join("");
  }

  /**
   * Full-page Monday–Friday planning grid (landscape). Uses only existing lesson data.
   */
  function renderWeeklyGridCalendar(doc, page) {
    const days = WEEKDAYS.map((dayKey) => {
      const day = (doc.days || []).find((item) => item.dayKey === dayKey) || {
        dayKey,
        label: WEEKDAY_LABELS[dayKey],
        title: { text: "" },
        activities: [],
      };
      return day;
    });
    const books = Array.isArray(doc.books) ? doc.books : [];
    const songs = Array.isArray(doc.songs) ? doc.songs : [];

    const rows = [
      {
        key: "focus",
        label: "Daily Focus",
        cell: (day) => asText(day.title?.text) || "—",
      },
      {
        key: "main",
        label: "Main Activity",
        cell: (day) => asText(day.activities?.[0]?.title) || "—",
      },
      {
        key: "second",
        label: "Second Activity",
        cell: (day) => asText(day.activities?.[1]?.title) || "—",
      },
      {
        key: "additional",
        label: "Additional Activity",
        cell: (day) => asText(day.activities?.[2]?.title) || "—",
      },
      {
        key: "story",
        label: "Story or Book",
        // Explicit weekday association only — never repeat books[0] across the week.
        cell: (day) => resourceTitleForDay(books, day.dayKey) || "—",
      },
      {
        key: "song",
        label: "Song or Movement",
        cell: (day) => resourceTitleForDay(songs, day.dayKey) || "—",
      },
      {
        key: "notes",
        label: "Teacher Notes",
        cell: () => "",
        notes: true,
      },
    ];

    const head = [
      `<div class="bb-grid-corner" aria-hidden="true"></div>`,
      ...days.map((day) => (
        `<div class="bb-grid-day-head ${dayToneClass(day.dayKey)}">${esc(day.label || WEEKDAY_LABELS[day.dayKey])}</div>`
      )),
    ].join("");

    const body = rows.map((row) => [
      `<div class="bb-grid-row-label">${esc(row.label)}</div>`,
      ...days.map((day) => {
        if (row.notes) {
          return `<div class="bb-grid-cell bb-grid-notes ${dayToneClass(day.dayKey)}" data-bb-grid-row="${esc(row.key)}" data-bb-grid-day="${esc(day.dayKey)}"></div>`;
        }
        const value = row.cell(day);
        const empty = !value || value === "—";
        return [
          `<div class="bb-grid-cell ${dayToneClass(day.dayKey)}${empty ? " is-empty" : ""}" data-bb-grid-row="${esc(row.key)}" data-bb-grid-day="${esc(day.dayKey)}">`,
          empty ? `<span class="bb-grid-dash">—</span>` : esc(value),
          `</div>`,
        ].join("");
      }),
    ].join("")).join("");

    return [
      `<article class="bb-page bb-page-grid-calendar" data-bb-page="weeklyGridCalendar">`,
      `<header class="bb-page-header bb-banner-header bb-grid-header">`,
      `<p class="bb-kicker">Planner</p>`,
      `<h2>Weekly Grid Calendar</h2>`,
      `<p class="bb-grid-theme">${esc(doc.theme || doc.title || "")}${doc.ageGroup ? ` · ${esc(doc.ageGroup)}` : ""}</p>`,
      `</header>`,
      `<div class="bb-week-grid" data-bb-week-grid role="table" aria-label="Monday through Friday weekly grid calendar">`,
      head,
      body,
      `</div>`,
      footerHtml(page.pageNumber),
      `</article>`,
    ].join("");
  }

  function renderDayDivider(doc, day, page) {
    const media = imageHtml(day.image, "bb-divider-media");
    const imageFree = media ? "" : " is-image-free";
    const activities = Array.isArray(day.activities) ? day.activities : [];
    const list = activities.length
      ? [
        `<ul class="bb-divider-acts">`,
        ...activities.map((act) => `<li>${esc(act.title || "Activity")}</li>`),
        `</ul>`,
      ].join("")
      : "";
    const focusText = asText(day.description?.text) || asText(day.title?.text);
    return [
      `<article class="bb-page bb-page-divider${imageFree} ${dayToneClass(day.dayKey)}" data-bb-page="dayDivider" data-bb-day="${esc(day.dayKey)}">`,
      `<div class="bb-divider-accent" aria-hidden="true"></div>`,
      `<div class="bb-divider-frame">`,
      `<p class="bb-divider-day">${esc(day.label)}</p>`,
      `<h2>${esc(day.title?.text || day.label)}</h2>`,
      focusText
        ? `<aside class="bb-divider-focus"><p class="bb-divider-focus-label">Today We’re Exploring</p><p>${esc(focusText)}</p></aside>`
        : "",
      list
        ? `<div class="bb-divider-plan"><p class="bb-divider-plan-label">Today’s Activities</p>${list}</div>`
        : "",
      media,
      `<div class="bb-divider-ornament" aria-hidden="true"></div>`,
      `</div>`,
      footerHtml(page.pageNumber),
      `</article>`,
    ].join("");
  }

  /**
   * Customer-facing activity page. Omits weekly materials / prep / shopping / assembly.
   * Shows short activity-level materials and tips only when supplied on the lesson item.
   */
  function renderActivityCard(activity) {
    return [
      `<section class="bb-activity-card" data-bb-activity="${esc(activity.id)}">`,
      imageHtml(activity.image, "bb-activity-media"),
      sectionBlock("What We Are Doing", activity.whatWereDoing),
      sectionBlock("What You Need", activity.materials, "bb-materials"),
      stepsBlock("How To Do It", activity.howToDoIt),
      learningBlock("What Children Are Learning", activity.learning),
      tipCallout(activity.support),
      includedCallout(activity.includedResources),
      `</section>`,
    ].join("");
  }

  function renderDayPlans(doc, day, page = {}) {
    const activity = (day.activities || []).find((item) => item.id === page.activityId);
    if (!activity) return "";
    const hasImage = Boolean(asText(activity.image?.url));
    return [
      `<article class="bb-page bb-page-day-plans ${dayToneClass(day.dayKey)}${hasImage ? "" : " is-image-free"}" data-bb-page="dayPlans" data-bb-day="${esc(day.dayKey)}" data-bb-activity-page="${esc(activity.id)}">`,
      `<header class="bb-page-header">`,
      `<p class="bb-kicker">${esc(day.label)}</p>`,
      `<h2>${esc(activity.title)}</h2>`,
      activity.category ? `<p class="bb-activity-type">${esc(activity.category)}</p>` : "",
      `</header>`,
      renderActivityCard(activity),
      footerHtml(page.pageNumber),
      `</article>`,
    ].join("");
  }

  function talkAboutPrompt(book) {
    return asText(book?.questions?.text) || asText(book?.beforeReading?.text) || asText(book?.connection?.text);
  }

  function renderBooks(doc, page) {
    const entries = (doc.books || []).map((book) => {
      const validated = book.resourceUrl ? validateBinderUrl(book.resourceUrl) : { ok: false };
      const qrHtml = book.qrEnabled && validated.ok && book.qrSvg
        ? qrFigureHtml({
          url: validated.url,
          svg: book.qrSvg,
          label: "Scan to watch/listen",
        })
        : "";
      const talk = talkAboutPrompt(book);
      return [
        `<section class="bb-book-card" data-bb-book-card="${esc(book.id || book.title || "")}">`,
        `<h3>${esc(book.title)}</h3>`,
        book.author ? `<p class="bb-book-author">${esc(book.author)}</p>` : "",
        qrHtml,
        talk ? `<p class="bb-talk-about"><strong>Talk about:</strong> ${esc(talk.split(/\n/)[0])}</p>` : "",
        `</section>`,
      ].join("");
    }).join("");

    return [
      `<article class="bb-page bb-page-books" data-bb-page="books">`,
      `<header class="bb-page-header bb-banner-header"><p class="bb-kicker">Literacy</p><h2>Story Time</h2></header>`,
      `<div class="bb-resource-grid">${entries || `<p class="bb-empty-note">No stories selected for this binder.</p>`}</div>`,
      footerHtml(page.pageNumber),
      `</article>`,
    ].join("");
  }

  function renderSongs(doc, page) {
    const entries = (doc.songs || []).map((song) => {
      const validated = song.resourceUrl ? validateBinderUrl(song.resourceUrl) : { ok: false };
      const qrHtml = song.qrEnabled && validated.ok && song.qrSvg
        ? qrFigureHtml({
          url: validated.url,
          svg: song.qrSvg,
          label: "Scan to play",
        })
        : "";
      return [
        `<section class="bb-song-card" data-bb-song-card="${esc(song.id || song.title || "")}">`,
        `<h3>${esc(song.title)}</h3>`,
        qrHtml,
        sectionBlock("When to Use", song.whenToUse),
        sectionBlock("Movement", song.movements),
        `</section>`,
      ].join("");
    }).join("");

    return [
      `<article class="bb-page bb-page-songs" data-bb-page="songs">`,
      `<header class="bb-page-header bb-banner-header"><p class="bb-kicker">Music</p><h2>Music &amp; Movement</h2></header>`,
      `<div class="bb-resource-grid">${entries || `<p class="bb-empty-note">No songs selected for this binder.</p>`}</div>`,
      footerHtml(page.pageNumber),
      `</article>`,
    ].join("");
  }

  function renderLearningCenters(doc, page) {
    const items = (doc.learningCenters || []).map((center) => (
      `<section class="bb-center-card"><h3>${esc(center.label || center.key)}</h3><p>${multiline(center.text)}</p></section>`
    )).join("");
    return [
      `<article class="bb-page bb-page-centers" data-bb-page="learningCenters">`,
      `<header class="bb-page-header bb-banner-header"><p class="bb-kicker">Centers</p><h2>Learning Centers</h2></header>`,
      items,
      footerHtml(page.pageNumber),
      `</article>`,
    ].join("");
  }

  function renderFamily(doc, page) {
    return [
      `<article class="bb-page bb-page-family" data-bb-page="familyConnection">`,
      `<header class="bb-page-header bb-banner-header"><p class="bb-kicker">Home</p><h2>Family Connection</h2></header>`,
      `<section class="bb-family-card">`,
      `<p>${multiline(doc.familyConnection?.text)}</p>`,
      `</section>`,
      footerHtml(page.pageNumber),
      `</article>`,
    ].join("");
  }

  function renderEndOfWeek(doc, page) {
    const end = doc.endOfWeek || {};
    return [
      `<article class="bb-page bb-page-end" data-bb-page="endOfWeek">`,
      `<header class="bb-page-header bb-banner-header"><p class="bb-kicker">Closing</p><h2>End of Week</h2></header>`,
      end.explored?.text
        ? `<section class="bb-end-block"><h3>This Week We Explored</h3><p>${multiline(end.explored.text)}</p></section>`
        : "",
      end.skills?.text
        ? `<section class="bb-end-block"><h3>Skills We Practiced</h3><p>${multiline(end.skills.text)}</p></section>`
        : "",
      end.noticed?.text
        ? `<section class="bb-end-block"><h3>Things You May Have Noticed</h3><p>${multiline(end.noticed.text)}</p></section>`
        : "",
      end.notesAreaEnabled !== false
        ? `<section class="bb-end-block"><h3>Notes</h3><div class="bb-notes-area" aria-hidden="true"></div></section>`
        : "",
      asText(doc.familyConnection?.text)
        ? `<p class="bb-family-reminder">Remember to share this week's Family Connection with caregivers.</p>`
        : "",
      footerHtml(page.pageNumber),
      `</article>`,
    ].join("");
  }

  function renderPage(document, page) {
    if (page.type === "cover") return renderCover(document);
    if (page.type === "tableOfContents") return renderTableOfContents(document, page);
    if (page.type === "welcome") return renderWelcome(document, page);
    if (page.type === "weekAtAGlance") return renderWeekAtAGlance(document, page);
    if (page.type === "weeklyGridCalendar") return renderWeeklyGridCalendar(document, page);
    if (page.type === "dayDivider") {
      const day = (document.days || []).find((item) => item.dayKey === page.dayKey);
      return day ? renderDayDivider(document, day, page) : "";
    }
    if (page.type === "dayPlans") {
      const day = (document.days || []).find((item) => item.dayKey === page.dayKey);
      return day ? renderDayPlans(document, day, page) : "";
    }
    if (page.type === "books") return renderBooks(document, page);
    if (page.type === "songs") return renderSongs(document, page);
    if (page.type === "learningCenters") return renderLearningCenters(document, page);
    if (page.type === "familyConnection") return renderFamily(document, page);
    if (page.type === "endOfWeek") return renderEndOfWeek(document, page);
    return "";
  }

  /**
   * @param {object} draft
   * @param {object|null} lesson
   * @param {{ qrSvgByUrl?: Record<string, string>, mode?: "print"|"preview", assetOrigin?: string }} [options]
   */
  function buildBinderPrintHtml(draft, lesson, options = {}) {
    currentAssetOrigin = asText(options.assetOrigin);
    try {
      const document = buildBinderDocument(draft, lesson, { qrSvgByUrl: options.qrSvgByUrl || {} });
      const contentPages = buildContentPagePlan(document);
      const { pages, tocEntries } = finalizePrintPagePlan(contentPages, document);
      const mode = options.mode === "preview" ? "preview" : "print";

      const pageHtml = pages.map((page) => renderPage(document, page)).filter(Boolean).join("\n");
      const html = [
        `<div class="bb-print-root bb-scrapbook" data-bb-mode="${mode}" data-bb-theme="scrapbook-pink-lavender">`,
        pageHtml,
        `</div>`,
      ].join("\n");

      return {
        document,
        pages,
        tocEntries,
        html,
        validation: validateBinderPrintOutput(html, pages),
      };
    } finally {
      currentAssetOrigin = "";
    }
  }

  /**
   * Wait for print images inside a host element to load or fail.
   * Distinguishes assigned-but-failed from never-assigned (no frame).
   * @param {ParentNode} root
   * @param {{ timeoutMs?: number }} [opts]
   */
  function waitForPrintImages(root, opts = {}) {
    const timeoutMs = Math.max(1000, Number(opts.timeoutMs) || 20000);
    const imgs = [...(root?.querySelectorAll?.("img[data-bb-print-image]") || [])];
    if (!imgs.length) {
      return Promise.resolve({ loaded: [], failed: [], timedOut: [] });
    }

    function markFailed(img) {
      const src = img.getAttribute("src") || "";
      img.setAttribute("data-bb-image-state", "failed");
      const frame = img.parentElement;
      if (frame) {
        frame.classList.add("is-broken");
        frame.setAttribute("data-bb-image-state", "failed");
      }
      try { img.remove(); } catch { /* ignore */ }
      return src;
    }

    return new Promise((resolve) => {
      let settled = false;
      const loaded = [];
      const failed = [];
      let remaining = imgs.length;

      const finish = (timedOut = []) => {
        if (settled) return;
        settled = true;
        resolve({ loaded: [...loaded], failed: [...failed], timedOut });
      };

      const tick = () => {
        remaining -= 1;
        if (remaining <= 0) finish([]);
      };

      const timer = setTimeout(() => {
        const timedOut = [];
        imgs.forEach((img) => {
          const state = img.getAttribute("data-bb-image-state");
          if (state === "loaded" || state === "failed") return;
          if (img.complete && img.naturalWidth > 0) {
            img.setAttribute("data-bb-image-state", "loaded");
            loaded.push(img.getAttribute("src") || "");
            return;
          }
          timedOut.push(markFailed(img));
          failed.push(timedOut[timedOut.length - 1]);
        });
        finish(timedOut);
      }, timeoutMs);

      imgs.forEach((img) => {
        const src = img.getAttribute("src") || "";
        if (img.complete && img.naturalWidth > 0) {
          img.setAttribute("data-bb-image-state", "loaded");
          loaded.push(src);
          tick();
          return;
        }
        if (img.complete && img.naturalWidth === 0) {
          failed.push(markFailed(img));
          tick();
          return;
        }
        img.addEventListener("load", () => {
          if (settled) return;
          img.setAttribute("data-bb-image-state", "loaded");
          loaded.push(src);
          tick();
          if (remaining <= 0) clearTimeout(timer);
        }, { once: true });
        img.addEventListener("error", () => {
          if (settled) return;
          failed.push(markFailed(img));
          tick();
          if (remaining <= 0) clearTimeout(timer);
        }, { once: true });
      });
    });
  }

  return {
    buildBinderPrintHtml,
    validateBinderPrintOutput,
    waitForPrintImages,
    resolvePrintAssetUrl,
    esc,
  };
});
