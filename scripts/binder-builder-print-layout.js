/**
 * Binder Builder — print pagination, TOC, and validation helpers.
 * Presentation-layer only. Never mutates source lessons.
 */
(function (root, factory) {
  const api = factory(
    root && root.LLHBinderBuilderModel
      ? root.LLHBinderBuilderModel
      : (typeof require === "function" ? require("./binder-builder-model.js") : null),
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LLHBinderBuilderPrintLayout = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (model) {
  "use strict";

  if (!model) {
    throw new Error("Binder Builder print layout requires model module.");
  }

  const { WEEKDAY_LABELS } = model;
  const TOC_ENTRIES_PER_PAGE = 28;

  /**
   * @param {string} value
   * @returns {string}
   */
  function asText(value) {
    return String(value == null ? "" : value).trim();
  }

  /**
   * Build TOC outline entries from a content page plan (no cover/TOC pages yet).
   * @param {Array<{ type: string, dayKey?: string, activityId?: string, label?: string }>} contentPages
   * @param {object} document
   * @returns {Array<{ title: string, indent: boolean, match: { type: string, dayKey?: string, activityId?: string } }>}
   */
  function buildTocOutline(contentPages, document) {
    const pages = Array.isArray(contentPages) ? contentPages : [];
    const doc = document || {};
    /** @type {Array<{ title: string, indent: boolean, match: { type: string, dayKey?: string, activityId?: string } }>} */
    const entries = [];

    pages.forEach((page) => {
      if (!page || !page.type) return;
      if (page.type === "welcome") {
        entries.push({ title: "How to Use This Binder", indent: false, match: { type: "welcome" } });
        return;
      }
      if (page.type === "weekAtAGlance") {
        entries.push({ title: "Week at a Glance", indent: false, match: { type: "weekAtAGlance" } });
        return;
      }
      if (page.type === "weeklyGridCalendar") {
        entries.push({ title: "Weekly Grid Calendar", indent: false, match: { type: "weeklyGridCalendar" } });
        return;
      }
      if (page.type === "dayDivider") {
        const label = WEEKDAY_LABELS[page.dayKey] || page.label || "Day";
        entries.push({ title: label, indent: false, match: { type: "dayDivider", dayKey: page.dayKey } });
        return;
      }
      if (page.type === "dayPlans") {
        const day = (doc.days || []).find((d) => d.dayKey === page.dayKey);
        const activity = (day?.activities || []).find((a) => a.id === page.activityId);
        const title = asText(activity?.title) || asText(page.label) || "Activity";
        entries.push({
          title,
          indent: true,
          match: { type: "dayPlans", dayKey: page.dayKey, activityId: page.activityId },
        });
        return;
      }
      if (page.type === "books") {
        entries.push({ title: "Story Time", indent: false, match: { type: "books" } });
        return;
      }
      if (page.type === "songs") {
        entries.push({ title: "Music & Movement", indent: false, match: { type: "songs" } });
        return;
      }
      if (page.type === "familyConnection") {
        entries.push({ title: "Family Connection", indent: false, match: { type: "familyConnection" } });
        return;
      }
      if (page.type === "endOfWeek") {
        entries.push({ title: "End of Week", indent: false, match: { type: "endOfWeek" } });
      }
    });

    return entries;
  }

  /**
   * @param {{ type: string, dayKey?: string, activityId?: string }} match
   * @param {{ type: string, dayKey?: string, activityId?: string }} page
   */
  function pageMatches(match, page) {
    if (!match || !page || match.type !== page.type) return false;
    if (match.dayKey && match.dayKey !== page.dayKey) return false;
    if (match.activityId && match.activityId !== page.activityId) return false;
    return true;
  }

  /**
   * Finalize page plan with cover, TOC page(s), sequential page numbers, and resolved TOC entries.
   * @param {Array<object>} contentPages pages after cover (welcome…end)
   * @param {object} document
   * @returns {{ pages: Array<object>, tocEntries: Array<object> }}
   */
  function finalizePrintPagePlan(contentPages, document) {
    const content = Array.isArray(contentPages) ? contentPages.slice() : [];
    const outline = buildTocOutline(content, document);
    const tocPageCount = Math.max(1, Math.ceil(Math.max(outline.length, 1) / TOC_ENTRIES_PER_PAGE));

    /** @type {Array<object>} */
    const pages = [{ type: "cover", label: "Front Cover" }];
    for (let i = 0; i < tocPageCount; i += 1) {
      pages.push({
        type: "tableOfContents",
        tocIndex: i,
        tocPageCount,
        label: i === 0 ? "Table of Contents" : "Table of Contents — Continued",
      });
    }
    pages.push(...content);

    pages.forEach((page, index) => {
      page.pageNumber = index + 1;
    });

    const tocEntries = outline.map((entry) => {
      const target = pages.find((page) => pageMatches(entry.match, page));
      return {
        title: entry.title,
        indent: entry.indent === true,
        pageNumber: target ? target.pageNumber : null,
        match: entry.match,
      };
    });

    pages.forEach((page) => {
      if (page.type !== "tableOfContents") return;
      const start = (page.tocIndex || 0) * TOC_ENTRIES_PER_PAGE;
      page.tocEntries = tocEntries.slice(start, start + TOC_ENTRIES_PER_PAGE);
    });

    return { pages, tocEntries };
  }

  /**
   * Lightweight print HTML validation for regressions / render gate.
   * @param {string} html
   * @param {Array<object>} pages
   */
  function validateBinderPrintOutput(html, pages) {
    const source = String(html || "");
    const plan = Array.isArray(pages) ? pages : [];
    /** @type {Array<{ code: string, message: string }>} */
    const issues = [];

    const articles = source.match(/<article\b[^>]*class="[^"]*bb-page/g) || [];
    if (articles.length !== plan.length) {
      issues.push({
        code: "page_count_mismatch",
        message: `Print containers (${articles.length}) !== page plan (${plan.length}).`,
      });
    }

    if (/browser print|about:blank|file:\/\//i.test(source) && /bb-page-footer/.test(source)) {
      // ignore — not browser chrome
    }

    // Browser metadata strings should not be authored into binder HTML
    if (/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(source) && /bb-print-root/.test(source)) {
      // Dates in lesson copy are allowed; only flag explicit browser chrome markers
    }
    if (/class="[^"]*bb-browser-chrome/.test(source)) {
      issues.push({ code: "browser_chrome", message: "Browser chrome markers present in print HTML." });
    }

    const emptyFrames = (source.match(/bb-activity-media(?![^>]*\S)/g) || []).length;
    if (/bb-activity-media[^>]*>\s*<\/div>/.test(source)) {
      issues.push({ code: "empty_image_frame", message: "Empty activity image frame detected." });
    }
    void emptyFrames;

    const footers = (source.match(/bb-footer-brand/g) || []).length;
    const numbered = (source.match(/bb-footer-page/g) || []).length;
    const coverCount = plan.filter((p) => p.type === "cover").length;
    const expectedFooters = Math.max(0, plan.length - coverCount);
    if (footers < expectedFooters) {
      issues.push({
        code: "missing_footer_brand",
        message: `Expected ${expectedFooters} brand footers, found ${footers}.`,
      });
    }
    if (numbered < expectedFooters) {
      issues.push({
        code: "missing_page_numbers",
        message: `Expected ${expectedFooters} page numbers, found ${numbered}.`,
      });
    }

    const pageNums = plan.filter((p) => p.type !== "cover").map((p) => p.pageNumber);
    const sorted = pageNums.slice().sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i] === sorted[i - 1]) {
        issues.push({ code: "duplicate_page_numbers", message: `Duplicate page number ${sorted[i]}.` });
        break;
      }
    }

    if (!/data-bb-page="tableOfContents"/.test(source)) {
      issues.push({ code: "missing_toc", message: "Table of Contents page missing from print HTML." });
    }
    if (!/data-bb-page="weeklyGridCalendar"/.test(source) && plan.some((p) => p.type === "weeklyGridCalendar")) {
      issues.push({ code: "missing_grid_calendar", message: "Weekly Grid Calendar missing from print HTML." });
    }

    const tocBad = (plan.find((p) => p.type === "tableOfContents")?.tocEntries || [])
      .filter((e) => !e.pageNumber);
    if (tocBad.length) {
      issues.push({
        code: "toc_unresolved",
        message: `${tocBad.length} TOC entries lack page numbers.`,
      });
    }

    return {
      ok: issues.length === 0,
      issues,
      articleCount: articles.length,
      planCount: plan.length,
      footerBrandCount: footers,
      pageNumberCount: numbered,
    };
  }

  return {
    TOC_ENTRIES_PER_PAGE,
    buildTocOutline,
    finalizePrintPagePlan,
    validateBinderPrintOutput,
    pageMatches,
  };
});
