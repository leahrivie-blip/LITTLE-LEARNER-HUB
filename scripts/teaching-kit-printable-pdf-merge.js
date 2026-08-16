/**
 * Teaching Kit printable PDF merge — appends selected attached PDF pages
 * onto a binder PDF while preserving each printable's page size/orientation.
 *
 * Consumes the resolved print manifest (never bypasses selection).
 * Display/print only — does not mutate curriculum.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.LLHTeachingKitPrintablePdfMerge = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function pdfLibApi() {
    if (typeof globalThis !== "undefined" && globalThis.PDFLib) return globalThis.PDFLib;
    if (typeof require === "function") {
      try { return require("pdf-lib"); } catch (_err) { /* optional until installed */ }
    }
    return null;
  }

  function isPdfBytes(bytes) {
    if (!bytes || bytes.byteLength < 5) return false;
    const head = typeof bytes.slice === "function"
      ? bytes.slice(0, 5)
      : new Uint8Array(bytes).slice(0, 5);
    return String.fromCharCode(head[0], head[1], head[2], head[3], head[4]) === "%PDF-";
  }

  function dataUrlToBytes(dataUrl) {
    const raw = text(dataUrl);
    const match = raw.match(/^data:([^;,]+)?(;base64)?,(.*)$/i);
    if (!match) return null;
    const isBase64 = Boolean(match[2]);
    const payload = match[3] || "";
    if (typeof Buffer !== "undefined") {
      return isBase64
        ? new Uint8Array(Buffer.from(payload, "base64"))
        : new Uint8Array(Buffer.from(decodeURIComponent(payload), "utf8"));
    }
    if (isBase64 && typeof atob === "function") {
      const binary = atob(payload);
      const out = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
      return out;
    }
    return null;
  }

  function resolveFetchableUrl(source) {
    const ref = text(source);
    if (!ref) return "";
    if (/^data:/i.test(ref) || /^https?:\/\//i.test(ref) || /^blob:/i.test(ref)) return ref;
    // Browser merges often receive site-relative media paths from curriculum resources.
    if (
      ref.startsWith("/")
      && typeof globalThis !== "undefined"
      && globalThis.location
      && globalThis.location.origin
    ) {
      return `${globalThis.location.origin}${ref}`;
    }
    return ref;
  }

  async function defaultFetchBytes(source, _attachment, options = {}) {
    const ref = text(source);
    if (!ref) return null;
    if (/^data:/i.test(ref)) return dataUrlToBytes(ref);
    const href = resolveFetchableUrl(ref);
    if (typeof fetch === "function" && (/^https?:\/\//i.test(href) || /^blob:/i.test(href))) {
      const timeoutMs = Math.max(3000, Number(options.timeoutMs) || 20000);
      const controller = typeof AbortController === "function" ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
      try {
        const res = await fetch(href, {
          credentials: "include",
          signal: controller ? controller.signal : undefined,
        });
        if (!res.ok) throw new Error(`fetch_failed_${res.status}`);
        return new Uint8Array(await res.arrayBuffer());
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
    if (typeof require === "function" && !/^https?:\/\//i.test(ref) && !ref.startsWith("/")) {
      try {
        const fs = require("fs");
        if (fs.existsSync(ref)) return new Uint8Array(fs.readFileSync(ref));
      } catch (_err) { /* ignore */ }
    }
    return null;
  }

  /**
   * Plan attachment merge from a resolved print manifest.
   * Dedupes by printable id while preserving first-seen selection order.
   */
  function planPrintableAttachments(manifest, options = {}) {
    const printables = Array.isArray(manifest?.printables) ? manifest.printables : [];
    const include = manifest?.include?.printables === true
      || ["printables", "one_printable", "entire_binder", "selected_resources", "monday_setup"].includes(text(manifest?.documentMode));
    if (!include || !printables.length) {
      return {
        ok: true,
        attachments: [],
        missing: [],
        invalid: [],
        duplicatesSkipped: [],
        summary: "No printable PDF attachments in this selection.",
      };
    }

    const requireAttachment = options.requireAttachment === true
      || ["printables", "one_printable"].includes(text(manifest?.documentMode))
      || (text(manifest?.documentMode) === "selected_resources" && printables.length > 0);

    const seen = new Set();
    const attachments = [];
    const missing = [];
    const duplicatesSkipped = [];

    printables.forEach((item, index) => {
      if (!item) return;
      const id = text(item.id) || `printable-${index}`;
      if (seen.has(id)) {
        duplicatesSkipped.push({ id, title: text(item.title) || id });
        return;
      }
      seen.add(id);
      const source = text(item.fileData || item.fileUrl);
      const isPdf = item.hasPdfAttachment === true
        || item.embedAsImage === false
        || /application\/pdf/i.test(text(item.mimeType))
        || /\.pdf(\?|$)/i.test(source)
        || /\.pdf(\?|$)/i.test(text(item.fileName))
        || /^data:application\/pdf/i.test(source);
      if (item.embedAsImage) {
        // Image printables stay in the HTML binder path (full-page images).
        return;
      }
      if (!isPdf || !source) {
        missing.push({
          id,
          title: text(item.title) || id,
          reason: !source ? "missing_attachment" : "unsupported_type",
        });
        return;
      }
      attachments.push({
        id,
        title: text(item.title) || id,
        source,
        fileName: text(item.fileName),
        mimeType: text(item.mimeType) || "application/pdf",
        order: attachments.length,
      });
    });

    if (requireAttachment && missing.length && !attachments.length) {
      return {
        ok: false,
        reason: "attachment_missing",
        attachments,
        missing,
        invalid: [],
        duplicatesSkipped,
        summary: missing[0]?.reason === "missing_attachment"
          ? `Selected printable “${missing[0].title}” has no attached PDF file.`
          : `Selected printable “${missing[0].title}” is not a usable PDF attachment.`,
      };
    }

    // Fail closed when any explicitly selected printable PDF is missing a file.
    if (missing.length && (requireAttachment || options.failOnMissing === true)) {
      return {
        ok: false,
        reason: "attachment_missing",
        attachments,
        missing,
        invalid: [],
        duplicatesSkipped,
        summary: `Selected printable “${missing[0].title}” has no attached PDF file.`,
      };
    }

    return {
      ok: true,
      reason: "ok",
      attachments,
      missing,
      invalid: [],
      duplicatesSkipped,
      summary: attachments.length
        ? `${attachments.length} printable PDF attachment${attachments.length === 1 ? "" : "s"} will be included`
        : "No printable PDF attachments in this selection.",
    };
  }

  async function loadAttachmentBytes(attachment, fetchBytes) {
    const loader = typeof fetchBytes === "function" ? fetchBytes : defaultFetchBytes;
    try {
      const bytes = await loader(attachment.source, attachment);
      if (!bytes || !bytes.byteLength) {
        return { ok: false, reason: "missing_attachment", attachment };
      }
      if (!isPdfBytes(bytes)) {
        return { ok: false, reason: "invalid_attachment", attachment };
      }
      return { ok: true, bytes: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), attachment };
    } catch (error) {
      return {
        ok: false,
        reason: "invalid_attachment",
        attachment,
        error: error?.message || String(error),
      };
    }
  }

  /**
   * Merge binder PDF bytes with selected printable attachments.
   * Printable pages keep their original MediaBox (size/orientation).
   */
  async function mergeTeachingKitPdf(options = {}) {
    const PDFLib = pdfLibApi();
    if (!PDFLib?.PDFDocument) {
      return { ok: false, reason: "pdf_lib_missing", bytes: null, report: null };
    }

    const binderPdfBytes = options.binderPdfBytes || null;
    const plan = options.attachmentPlan || planPrintableAttachments(options.manifest || {}, options);
    if (!plan.ok) {
      return { ok: false, reason: plan.reason || "attachment_missing", bytes: null, report: plan };
    }

    const fetchBytes = options.fetchBytes;
    const loaded = [];
    const invalid = [];
    for (const attachment of plan.attachments) {
      const result = await loadAttachmentBytes(attachment, fetchBytes);
      if (!result.ok) {
        invalid.push({
          id: attachment.id,
          title: attachment.title,
          reason: result.reason,
        });
        if (options.failOnInvalid !== false) {
          return {
            ok: false,
            reason: result.reason || "invalid_attachment",
            bytes: null,
            report: {
              ...plan,
              invalid,
              summary: `Selected printable “${attachment.title}” could not be read as a PDF.`,
            },
          };
        }
        continue;
      }
      loaded.push(result);
    }

    const merged = await PDFLib.PDFDocument.create();
    const reportPages = [];
    let binderPageCount = 0;

    if (binderPdfBytes && binderPdfBytes.byteLength) {
      if (!isPdfBytes(binderPdfBytes)) {
        return { ok: false, reason: "invalid_binder_pdf", bytes: null, report: plan };
      }
      const binderDoc = await PDFLib.PDFDocument.load(binderPdfBytes, { ignoreEncryption: true });
      const binderIndices = binderDoc.getPageIndices();
      const binderPages = await merged.copyPages(binderDoc, binderIndices);
      binderPages.forEach((page) => merged.addPage(page));
      binderPageCount = binderPages.length;
      reportPages.push({
        kind: "binder",
        id: "binder",
        title: "Teaching Kit document",
        pageCount: binderPageCount,
        pageIndexStart: 0,
      });
    }

    let cursor = binderPageCount;
    const included = [];
    for (const entry of loaded) {
      const src = await PDFLib.PDFDocument.load(entry.bytes, { ignoreEncryption: true });
      const indices = src.getPageIndices();
      const pages = await merged.copyPages(src, indices);
      const sizes = pages.map((page) => {
        const size = page.getSize();
        return {
          width: Math.round(size.width * 100) / 100,
          height: Math.round(size.height * 100) / 100,
          orientation: size.width > size.height ? "landscape" : "portrait",
        };
      });
      pages.forEach((page) => merged.addPage(page));
      included.push({
        kind: "printable",
        id: entry.attachment.id,
        title: entry.attachment.title,
        pageCount: pages.length,
        pageIndexStart: cursor,
        pageIndexEnd: cursor + pages.length - 1,
        sizes,
      });
      reportPages.push({
        kind: "printable",
        id: entry.attachment.id,
        title: entry.attachment.title,
        pageCount: pages.length,
        pageIndexStart: cursor,
      });
      cursor += pages.length;
    }

    if (!merged.getPageCount()) {
      return {
        ok: false,
        reason: "empty_pdf",
        bytes: null,
        report: { ...plan, included, invalid, binderPageCount, totalPages: 0 },
      };
    }

    const bytes = await merged.save();
    return {
      ok: true,
      reason: "ok",
      bytes,
      report: {
        ...plan,
        invalid,
        included,
        binderPageCount,
        attachmentPageCount: cursor - binderPageCount,
        totalPages: cursor,
        pages: reportPages,
        duplicatesSkipped: plan.duplicatesSkipped || [],
        missing: plan.missing || [],
        summary: [
          binderPageCount ? `${binderPageCount} Teaching Kit page${binderPageCount === 1 ? "" : "s"}` : null,
          included.length
            ? `${included.length} printable attachment${included.length === 1 ? "" : "s"} (${cursor - binderPageCount} page${cursor - binderPageCount === 1 ? "" : "s"})`
            : null,
        ].filter(Boolean).join(" + ") || `${cursor} pages`,
      },
    };
  }

  async function inspectPdfPages(bytes) {
    const PDFLib = pdfLibApi();
    if (!PDFLib?.PDFDocument || !bytes) return { ok: false, pageCount: 0, pages: [] };
    const doc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
    const pages = doc.getPages().map((page, index) => {
      const size = page.getSize();
      return {
        index,
        width: Math.round(size.width * 100) / 100,
        height: Math.round(size.height * 100) / 100,
        orientation: size.width > size.height ? "landscape" : "portrait",
      };
    });
    return { ok: true, pageCount: pages.length, pages };
  }

  return {
    planPrintableAttachments,
    loadAttachmentBytes,
    mergeTeachingKitPdf,
    inspectPdfPages,
    isPdfBytes,
    dataUrlToBytes,
    defaultFetchBytes,
    resolveFetchableUrl,
  };
});
