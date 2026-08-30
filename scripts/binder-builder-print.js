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
   * Print image helper. By default omits markup when there is no URL (no empty placeholder).
   * Cover may pass { allowFallback: true } for an intentional decorative fallback.
   */
  function imageHtml(image, className, options = {}) {
    let url = asText(image?.url);
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
    return `<div class="${esc(className)}"><img src="${esc(url)}" alt="${alt}" loading="lazy" decoding="async" onerror="this.parentElement.remove();"></div>`;
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

  function renderWeekAtAGlance(doc, page) {
    const days = Array.isArray(doc.days) ? doc.days : [];
    const books = Array.isArray(doc.books) ? doc.books : [];
    const songs = Array.isArray(doc.songs) ? doc.songs : [];
    const bookHint = books[0]?.title ? books[0].title : "";
    const songHint = songs[0]?.title ? songs[0].title : "";

    const plannerCols = days.map((day) => {
      const activities = Array.isArray(day.activities) ? day.activities : [];
      const items = activities.length
        ? [
          `<ul class="bb-week-planner-acts">`,
          ...activities.map((act) => `<li>${esc(act.title || "Activity")}</li>`),
          `</ul>`,
        ].join("")
        : `<p class="bb-week-planner-empty">—</p>`;
      const extras = [];
      if (bookHint) extras.push(`<p class="bb-week-extra"><span>Story</span> ${esc(bookHint)}</p>`);
      if (songHint) extras.push(`<p class="bb-week-extra"><span>Song</span> ${esc(songHint)}</p>`);
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
    const bookTitle = asText(books[0]?.title);
    const songTitle = asText(songs[0]?.title);

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
        cell: () => bookTitle || "—",
      },
      {
        key: "song",
        label: "Song or Movement",
        cell: () => songTitle || "—",
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
    return [
      `<article class="bb-page bb-page-divider${imageFree} ${dayToneClass(day.dayKey)}" data-bb-page="dayDivider" data-bb-day="${esc(day.dayKey)}">`,
      `<div class="bb-divider-frame">`,
      `<p class="bb-divider-day">${esc(day.label)}</p>`,
      `<h2>${esc(day.title?.text || day.label)}</h2>`,
      day.description?.text
        ? `<aside class="bb-divider-focus"><p class="bb-divider-focus-label">Today’s Focus</p><p>${esc(day.description.text)}</p></aside>`
        : "",
      list ? `<div class="bb-divider-plan"><p class="bb-divider-plan-label">Today’s Activities</p>${list}</div>` : "",
      media,
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

  function renderBooks(doc, page) {
    const entries = (doc.books || []).map((book) => {
      const validated = book.resourceUrl ? validateBinderUrl(book.resourceUrl) : { ok: false };
      const qrHtml = book.qrEnabled && validated.ok
        ? qrFigureHtml({
          url: validated.url,
          svg: book.qrSvg,
          title: book.title,
          label: "Scan for Story Resource",
        })
        : "";
      return [
        `<section class="bb-book-card">`,
        `<h3>${esc(book.title)}</h3>`,
        book.author ? `<p class="bb-muted">by ${esc(book.author)}</p>` : "",
        sectionBlock("Why This Story Fits", book.connection),
        sectionBlock("Before Reading", book.beforeReading),
        sectionBlock("Questions to Ask", book.questions),
        sectionBlock("After Reading", book.afterReading),
        sectionBlock("Alternative Book", book.alternative),
        qrHtml,
        `</section>`,
      ].join("");
    }).join("");

    return [
      `<article class="bb-page bb-page-books" data-bb-page="books">`,
      `<header class="bb-page-header bb-banner-header"><p class="bb-kicker">Literacy</p><h2>Story Time</h2></header>`,
      entries || `<p class="bb-empty-note">No stories selected for this binder.</p>`,
      footerHtml(page.pageNumber),
      `</article>`,
    ].join("");
  }

  function renderSongs(doc, page) {
    const entries = (doc.songs || []).map((song) => {
      const validated = song.resourceUrl ? validateBinderUrl(song.resourceUrl) : { ok: false };
      const qrHtml = song.qrEnabled && validated.ok
        ? qrFigureHtml({
          url: validated.url,
          svg: song.qrSvg,
          title: song.title,
          label: "Scan for Song Resource",
        })
        : "";
      return [
        `<section class="bb-song-card">`,
        `<h3>${esc(song.title)}</h3>`,
        sectionBlock("When to Use", song.whenToUse),
        sectionBlock("Movement Directions", song.movements),
        sectionBlock("Teacher Directions", song.directions),
        song.lyrics?.text ? sectionBlock("Lyrics", song.lyrics) : "",
        qrHtml,
        `</section>`,
      ].join("");
    }).join("");

    return [
      `<article class="bb-page bb-page-songs" data-bb-page="songs">`,
      `<header class="bb-page-header bb-banner-header"><p class="bb-kicker">Music</p><h2>Music &amp; Movement</h2></header>`,
      entries || `<p class="bb-empty-note">No songs selected for this binder.</p>`,
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
   * @param {{ qrSvgByUrl?: Record<string, string>, mode?: "print"|"preview" }} [options]
   */
  function buildBinderPrintHtml(draft, lesson, options = {}) {
    const document = buildBinderDocument(draft, lesson, { qrSvgByUrl: options.qrSvgByUrl || {} });
    const contentPages = buildContentPagePlan(document);
    const { pages, tocEntries } = finalizePrintPagePlan(contentPages, document);
    const mode = options.mode === "preview" ? "preview" : "print";

    const pageHtml = pages.map((page) => renderPage(document, page)).filter(Boolean).join("\n");
    const html = [
      `<div class="bb-print-root" data-bb-mode="${mode}">`,
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
  }

  return {
    buildBinderPrintHtml,
    validateBinderPrintOutput,
    esc,
  };
});
