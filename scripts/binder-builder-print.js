/**
 * Binder Builder — print HTML for US Letter physical binders.
 *
 * Isolated from Teaching Kit digital binder print. Never includes admin chrome,
 * materials lists, or preparation checklists.
 */
(function (root, factory) {
  const api = factory(
    root && root.LLHBinderBuilderTransform
      ? root.LLHBinderBuilderTransform
      : (typeof require === "function" ? require("./binder-builder-transform.js") : null),
    root && root.LLHBinderBuilderQr
      ? root.LLHBinderBuilderQr
      : (typeof require === "function" ? require("./binder-builder-qr.js") : null),
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LLHBinderBuilderPrint = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (transform, qr) {
  "use strict";

  if (!transform || !qr) {
    throw new Error("Binder Builder print requires transform and qr modules.");
  }

  const { buildBinderDocument, buildPagePlan, asText } = transform;
  const { qrFigureHtml, validateBinderUrl } = qr;

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

  function sectionBlock(title, body) {
    const text = asText(body?.text != null ? body.text : body);
    if (!text) return "";
    return [
      `<section class="bb-activity-section">`,
      `<h4>${esc(title)}</h4>`,
      `<p>${multiline(text)}</p>`,
      `</section>`,
    ].join("");
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

  function imageHtml(image, className) {
    let url = asText(image?.url);
    // Print-safe image refs only: relative app paths or http(s). Never javascript: etc.
    if (url && !(url.startsWith("/") || /^https?:\/\//i.test(url))) {
      url = "";
    }
    if (!url) return `<div class="${esc(className)} bb-image-fallback" role="img" aria-label="Decorative placeholder"></div>`;
    const alt = esc(image?.alt || "Lesson image");
    return `<div class="${esc(className)}"><img src="${esc(url)}" alt="${alt}" loading="lazy" decoding="async" onerror="this.parentElement.classList.add('is-broken'); this.remove();"></div>`;
  }

  function footerHtml(doc, pageLabel) {
    return [
      `<footer class="bb-page-footer">`,
      `<span>Little Learner Hub</span>`,
      `<span>${esc(doc.theme || doc.title || "")}</span>`,
      `<span class="bb-page-label">${esc(pageLabel || "")}</span>`,
      `</footer>`,
    ].join("");
  }

  function renderCover(doc) {
    const p = doc.personalization || {};
    const personalBits = [p.teacherName, p.classroomName, p.programName].filter(Boolean);
    return [
      `<article class="bb-page bb-page-cover" data-bb-page="cover">`,
      `<div class="bb-cover-brand">Little Learner Hub</div>`,
      imageHtml(doc.coverImage, "bb-cover-media"),
      `<div class="bb-cover-copy">`,
      `<p class="bb-cover-descriptor">${esc(doc.coverDescriptor)}</p>`,
      `<h1>${esc(doc.title)}</h1>`,
      doc.theme ? `<p class="bb-cover-theme">${esc(doc.theme)}</p>` : "",
      doc.ageGroup ? `<p class="bb-cover-age">${esc(doc.ageGroup)}</p>` : "",
      p.subtitle ? `<p class="bb-cover-subtitle">${esc(p.subtitle)}</p>` : "",
      personalBits.length ? `<p class="bb-cover-personal">${esc(personalBits.join(" · "))}</p>` : "",
      `</div>`,
      `</article>`,
    ].join("");
  }

  function renderWelcome(doc) {
    return [
      `<article class="bb-page bb-page-welcome" data-bb-page="welcome">`,
      `<header class="bb-page-header"><p class="bb-kicker">Welcome</p><h2>How to Use This Binder</h2></header>`,
      `<div class="bb-prose">${multiline(doc.welcomeCopy)}</div>`,
      footerHtml(doc, "Welcome"),
      `</article>`,
    ].join("");
  }

  function renderWeekAtAGlance(doc) {
    const dayRows = (doc.days || []).map((day) => [
      `<tr>`,
      `<th scope="row">${esc(day.label)}</th>`,
      `<td><strong>${esc(day.title?.text || "—")}</strong>`,
      day.description?.text ? `<span class="bb-muted"> — ${esc(day.description.text)}</span>` : "",
      `</td>`,
      `</tr>`,
    ].join("")).join("");

    return [
      `<article class="bb-page bb-page-week" data-bb-page="weekAtAGlance">`,
      `<header class="bb-page-header"><p class="bb-kicker">Overview</p><h2>Week at a Glance</h2></header>`,
      `<p class="bb-week-theme"><strong>Theme:</strong> ${esc(doc.theme || doc.title)}</p>`,
      doc.weekFocus?.text ? `<p><strong>Weekly focus:</strong> ${esc(doc.weekFocus.text)}</p>` : "",
      doc.developmentalFocus?.text ? `<p><strong>Learning focus:</strong> ${esc(doc.developmentalFocus.text)}</p>` : "",
      `<table class="bb-week-table"><tbody>${dayRows}</tbody></table>`,
      footerHtml(doc, "Week at a Glance"),
      `</article>`,
    ].join("");
  }

  function renderDayDivider(doc, day) {
    return [
      `<article class="bb-page bb-page-divider" data-bb-page="dayDivider" data-bb-day="${esc(day.dayKey)}">`,
      `<div class="bb-divider-inner">`,
      `<p class="bb-divider-day">${esc(day.label)}</p>`,
      `<h2>${esc(day.title?.text || day.label)}</h2>`,
      day.description?.text ? `<p class="bb-divider-today"><span>Today we…</span> ${esc(day.description.text)}</p>` : "",
      imageHtml(day.image, "bb-divider-media"),
      `</div>`,
      footerHtml(doc, day.label),
      `</article>`,
    ].join("");
  }

  function renderActivityCard(activity) {
    return [
      `<section class="bb-activity-card" data-bb-activity="${esc(activity.id)}">`,
      `<div class="bb-activity-head">`,
      `<h3>${esc(activity.title)}</h3>`,
      imageHtml(activity.image, "bb-activity-media"),
      `</div>`,
      sectionBlock("Introduction", activity.introduction),
      sectionBlock("What We're Doing", activity.whatWereDoing),
      sectionBlock("How To Do It", activity.howToDoIt),
      sectionBlock("What Children Are Learning", activity.learning),
      sectionBlock("Teacher Questions", activity.questions),
      sectionBlock("Support & Adaptation", activity.support),
      sectionBlock("Challenge / Extension", activity.challenge),
      sectionBlock("Safety Note", activity.safety),
      sectionBlock("Cleanup", activity.cleanup),
      includedCallout(activity.includedResources),
      `</section>`,
    ].join("");
  }

  function renderDayPlans(doc, day) {
    const cards = (day.activities || []).map(renderActivityCard).join("");
    const body = cards || `<p class="bb-empty-note">No activities are configured for ${esc(day.label)}.</p>`;
    return [
      `<article class="bb-page bb-page-day-plans" data-bb-page="dayPlans" data-bb-day="${esc(day.dayKey)}">`,
      `<header class="bb-page-header"><p class="bb-kicker">${esc(day.label)}</p><h2>${esc(day.title?.text || "Daily Plan")}</h2></header>`,
      body,
      footerHtml(doc, `${day.label} Activities`),
      `</article>`,
    ].join("");
  }

  function renderBooks(doc) {
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
      `<header class="bb-page-header"><p class="bb-kicker">Stories</p><h2>Story Time</h2></header>`,
      entries,
      footerHtml(doc, "Story Time"),
      `</article>`,
    ].join("");
  }

  function renderSongs(doc) {
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
      `<header class="bb-page-header"><p class="bb-kicker">Music</p><h2>Music &amp; Movement</h2></header>`,
      entries,
      footerHtml(doc, "Music & Movement"),
      `</article>`,
    ].join("");
  }

  function renderLearningCenters(doc) {
    const items = (doc.learningCenters || []).map((center) => [
      `<section class="bb-center-card">`,
      `<h3>${esc(center.label)}</h3>`,
      `<p>${multiline(center.text)}</p>`,
      `</section>`,
    ].join("")).join("");
    return [
      `<article class="bb-page bb-page-centers" data-bb-page="learningCenters">`,
      `<header class="bb-page-header"><p class="bb-kicker">Bonus</p><h2>Learning Centers</h2></header>`,
      `<div class="bb-center-grid">${items}</div>`,
      footerHtml(doc, "Learning Centers"),
      `</article>`,
    ].join("");
  }

  function renderFamily(doc) {
    return [
      `<article class="bb-page bb-page-family" data-bb-page="familyConnection">`,
      `<header class="bb-page-header"><p class="bb-kicker">Home</p><h2>Family Connection</h2></header>`,
      `<div class="bb-prose">${multiline(doc.familyConnection?.text)}</div>`,
      footerHtml(doc, "Family Connection"),
      `</article>`,
    ].join("");
  }

  function renderEndOfWeek(doc) {
    const end = doc.endOfWeek || {};
    return [
      `<article class="bb-page bb-page-end" data-bb-page="endOfWeek">`,
      `<header class="bb-page-header"><p class="bb-kicker">Closing</p><h2>End of Week</h2></header>`,
      end.explored?.text ? `<section class="bb-end-block"><h3>This Week We Explored</h3><p>${multiline(end.explored.text)}</p></section>` : "",
      end.skills?.text ? `<section class="bb-end-block"><h3>Skills We Practiced</h3><p>${multiline(end.skills.text)}</p></section>` : "",
      end.noticed?.text ? `<section class="bb-end-block"><h3>Things You May Have Noticed</h3><p>${multiline(end.noticed.text)}</p></section>` : "",
      end.notesAreaEnabled !== false
        ? `<section class="bb-end-block"><h3>Notes</h3><div class="bb-notes-area" aria-hidden="true"></div></section>`
        : "",
      asText(doc.familyConnection?.text)
        ? `<p class="bb-family-reminder">Remember to share this week's Family Connection with caregivers.</p>`
        : "",
      footerHtml(doc, "End of Week"),
      `</article>`,
    ].join("");
  }

  /**
   * @param {object} draft
   * @param {object|null} lesson
   * @param {{ qrSvgByUrl?: Record<string, string>, mode?: "print"|"preview" }} [options]
   */
  function buildBinderPrintHtml(draft, lesson, options = {}) {
    const document = buildBinderDocument(draft, lesson, { qrSvgByUrl: options.qrSvgByUrl || {} });
    const pages = buildPagePlan(document);
    const mode = options.mode === "preview" ? "preview" : "print";

    const pageHtml = pages.map((page) => {
      if (page.type === "cover") return renderCover(document);
      if (page.type === "welcome") return renderWelcome(document);
      if (page.type === "weekAtAGlance") return renderWeekAtAGlance(document);
      if (page.type === "dayDivider") {
        const day = (document.days || []).find((item) => item.dayKey === page.dayKey);
        return day ? renderDayDivider(document, day) : "";
      }
      if (page.type === "dayPlans") {
        const day = (document.days || []).find((item) => item.dayKey === page.dayKey);
        return day ? renderDayPlans(document, day) : "";
      }
      if (page.type === "books") return renderBooks(document);
      if (page.type === "songs") return renderSongs(document);
      if (page.type === "learningCenters") return renderLearningCenters(document);
      if (page.type === "familyConnection") return renderFamily(document);
      if (page.type === "endOfWeek") return renderEndOfWeek(document);
      return "";
    }).filter(Boolean).join("\n");

    return {
      document,
      pages,
      html: [
        `<div class="bb-print-root" data-bb-mode="${mode}">`,
        pageHtml,
        `</div>`,
      ].join("\n"),
    };
  }

  return {
    buildBinderPrintHtml,
    esc,
  };
});
