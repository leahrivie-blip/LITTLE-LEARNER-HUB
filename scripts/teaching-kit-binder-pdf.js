/**
 * Render Teaching Kit binder HTML to PDF bytes (US Letter by default).
 * Node/tests: Playwright Chromium page.pdf
 * Browser: html2canvas + pdf-lib (Letter pages, contain-fit, no stretch)
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.LLHTeachingKitBinderPdf = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function pdfLibApi() {
    if (typeof globalThis !== "undefined" && globalThis.PDFLib) return globalThis.PDFLib;
    if (typeof require === "function") {
      try { return require("pdf-lib"); } catch (_err) { return null; }
    }
    return null;
  }

  function letterSize(paperSize) {
    const id = text(paperSize).toLowerCase();
    if (id === "a4") return { width: 595.28, height: 841.89, css: "A4" };
    return { width: 612, height: 792, css: "Letter" };
  }

  function wrapBinderHtml(html, options = {}) {
    const paper = letterSize(options.paperSize);
    const stylesHref = text(options.stylesHref);
    const styleTag = stylesHref
      ? `<link rel="stylesheet" href="${stylesHref}" />`
      : "";
    return `<!doctype html><html><head><meta charset="utf-8" />
      ${styleTag}
      <style>
        html, body { margin: 0; padding: 0; background: #fff; }
        body.printing-teaching-kit { background: #fff; }
        .tk-print-page { box-sizing: border-box; }
      </style>
    </head>
    <body class="printing-resource printing-teaching-kit">
      ${html}
    </body></html>`;
  }

  async function renderBinderPdfWithPlaywright(html, options = {}) {
    let chromium;
    try {
      ({ chromium } = require("playwright"));
    } catch (_err) {
      return { ok: false, reason: "playwright_missing", bytes: null };
    }
    const paper = letterSize(options.paperSize);
    const browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    try {
      const page = await browser.newPage();
      const doc = wrapBinderHtml(html, options);
      await page.setContent(doc, { waitUntil: "load", timeout: options.timeoutMs || 60000 });
      await page.evaluate(async () => {
        const images = Array.from(document.images || []);
        await Promise.all(images.map((img) => {
          if (img.complete) return null;
          return new Promise((resolve) => {
            img.addEventListener("load", resolve, { once: true });
            img.addEventListener("error", resolve, { once: true });
          });
        }));
      }).catch(() => {});
      const bytes = await page.pdf({
        format: paper.css,
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: "0.55in", bottom: "0.55in", left: "0.55in", right: "0.55in" },
      });
      await page.close();
      return {
        ok: true,
        reason: "ok",
        bytes: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
        engine: "playwright",
        paperSize: paper.css.toLowerCase(),
      };
    } finally {
      await browser.close();
    }
  }

  async function canvasToPngBytes(canvas) {
    if (typeof canvas.toDataURL !== "function") return null;
    const dataUrl = canvas.toDataURL("image/png");
    const mergeApi = (typeof globalThis !== "undefined" && globalThis.LLHTeachingKitPrintablePdfMerge)
      || (typeof require === "function" ? (() => { try { return require("./teaching-kit-printable-pdf-merge.js"); } catch (_e) { return null; } })()
      : null);
    if (mergeApi?.dataUrlToBytes) return mergeApi.dataUrlToBytes(dataUrl);
    return null;
  }

  function patchCanvasGradientForHtml2Canvas() {
    // html2canvas can throw "addColorStop: The provided double value is non-finite"
    // when site CSS uses color-mix()/complex gradients. Guard the canvas API for the
    // duration of binder PDF capture so one bad stop cannot abort the whole download.
    if (typeof CanvasGradient === "undefined" || !CanvasGradient.prototype) {
      return () => {};
    }
    const proto = CanvasGradient.prototype;
    if (proto.__llhAddColorStopPatched) return () => {};
    const original = proto.addColorStop;
    proto.addColorStop = function patchedAddColorStop(offset, color) {
      const value = Number(offset);
      if (!Number.isFinite(value)) return undefined;
      const clamped = Math.min(1, Math.max(0, value));
      try {
        return original.call(this, clamped, color);
      } catch (_err) {
        return undefined;
      }
    };
    proto.__llhAddColorStopPatched = true;
    return () => {
      proto.addColorStop = original;
      delete proto.__llhAddColorStopPatched;
    };
  }

  function prepareClonedBinderDocument(clonedDoc) {
    if (!clonedDoc) return;
    const style = clonedDoc.createElement("style");
    style.setAttribute("data-llh-binder-pdf-safe", "1");
    style.textContent = `
      html, body { background: #fff !important; }
      .tk-print-page, .tk-print-page * {
        backdrop-filter: none !important;
        filter: none !important;
        box-shadow: none !important;
        text-shadow: none !important;
      }
      .tk-print-page {
        background: #ffffff !important;
        background-image: none !important;
      }
      .tk-print-cover,
      .tk-print-title-bar,
      .tk-print-running,
      .tk-print-section-banner,
      .tk-print-brand-mark {
        background-image: none !important;
      }
    `;
    (clonedDoc.head || clonedDoc.documentElement).appendChild(style);
  }

  function revealPrintHostForCapture(host) {
    // Default CSS keeps `.llh-teaching-kit-print-host { display: none }` until
    // body.printing-teaching-kit (browser print). PDF capture needs measurable
    // layout without flashing the binder on screen.
    if (!host || !host.style) return () => {};
    const prev = {
      display: host.style.display,
      visibility: host.style.visibility,
      position: host.style.position,
      left: host.style.left,
      top: host.style.top,
      width: host.style.width,
      height: host.style.height,
      opacity: host.style.opacity,
      pointerEvents: host.style.pointerEvents,
      zIndex: host.style.zIndex,
      overflow: host.style.overflow,
    };
    host.style.display = "block";
    host.style.visibility = "visible";
    host.style.position = "fixed";
    host.style.left = "-12000px";
    host.style.top = "0";
    host.style.width = "816px";
    host.style.height = "auto";
    host.style.opacity = "1";
    host.style.pointerEvents = "none";
    host.style.zIndex = "-1";
    host.style.overflow = "visible";
    return () => {
      Object.keys(prev).forEach((key) => {
        host.style[key] = prev[key] || "";
      });
    };
  }

  async function renderBinderPdfInBrowser(hostOrHtml, options = {}) {
    const PDFLib = pdfLibApi();
    const html2canvas = (typeof globalThis !== "undefined" && globalThis.html2canvas) || null;
    if (!PDFLib?.PDFDocument || !html2canvas) {
      return { ok: false, reason: "browser_pdf_deps_missing", bytes: null };
    }

    let host = null;
    let temporary = false;
    if (hostOrHtml && hostOrHtml.nodeType === 1) {
      host = hostOrHtml;
    } else {
      temporary = true;
      host = document.createElement("div");
      host.className = "llh-teaching-kit-print-host llh-teaching-kit-pdf-capture";
      host.setAttribute("aria-hidden", "true");
      host.innerHTML = `<article class="printable-resource-page teaching-kit-print-article">${hostOrHtml || ""}</article>`;
      document.body.appendChild(host);
    }

    const restoreGradient = patchCanvasGradientForHtml2Canvas();
    const restoreHostVisibility = revealPrintHostForCapture(host);
    try {
      let pages = Array.from(host.querySelectorAll(".tk-print-page"));
      // If the live print host was cleared (Preview cleanup race), rebuild from
      // its last HTML snapshot when available.
      if (!pages.length && host.getAttribute("data-tk-print-html")) {
        host.innerHTML = host.getAttribute("data-tk-print-html");
        pages = Array.from(host.querySelectorAll(".tk-print-page"));
      }
      if (!pages.length) {
        return {
          ok: false,
          reason: "no_binder_pages",
          bytes: null,
          message: "No binder pages were available to download. Please try Preview, then Download PDF again.",
        };
      }
      const paper = letterSize(options.paperSize);
      const pdfDoc = await PDFLib.PDFDocument.create();
      let pageErrors = 0;
      for (const pageEl of pages) {
        const width = Math.max(
          Number(pageEl.scrollWidth) || 0,
          Number(pageEl.offsetWidth) || 0,
          Number(pageEl.clientWidth) || 0,
          816,
        );
        const height = Math.max(
          Number(pageEl.scrollHeight) || 0,
          Number(pageEl.offsetHeight) || 0,
          Number(pageEl.clientHeight) || 0,
          1,
        );
        let canvas = null;
        try {
          canvas = await html2canvas(pageEl, {
            backgroundColor: "#ffffff",
            scale: options.scale || 2,
            useCORS: true,
            logging: false,
            windowWidth: width,
            windowHeight: height,
            onclone: prepareClonedBinderDocument,
          });
        } catch (err) {
          pageErrors += 1;
          console.warn("[llh-tk-pdf] html2canvas page failed", err?.message || err);
          continue;
        }
        const pngBytes = await canvasToPngBytes(canvas);
        if (!pngBytes) continue;
        const image = await pdfDoc.embedPng(pngBytes);
        const pdfPage = pdfDoc.addPage([paper.width, paper.height]);
        const imgRatio = image.width / Math.max(image.height, 1);
        const pageRatio = paper.width / paper.height;
        let drawW = paper.width;
        let drawH = paper.height;
        if (imgRatio > pageRatio) {
          drawH = drawW / imgRatio;
        } else {
          drawW = drawH * imgRatio;
        }
        if (!Number.isFinite(drawW) || !Number.isFinite(drawH) || drawW <= 0 || drawH <= 0) {
          pageErrors += 1;
          continue;
        }
        const x = (paper.width - drawW) / 2;
        const y = (paper.height - drawH) / 2;
        pdfPage.drawImage(image, { x, y, width: drawW, height: drawH });
      }
      if (!pdfDoc.getPageCount()) {
        return {
          ok: false,
          reason: pageErrors ? "binder_pdf_render_failed" : "no_binder_pages",
          bytes: null,
          message: pageErrors
            ? "Could not render binder pages to PDF. Please try Print selection, or retry Download PDF."
            : "No binder pages were available to download.",
        };
      }
      const bytes = await pdfDoc.save();
      return {
        ok: true,
        reason: "ok",
        bytes,
        engine: "html2canvas",
        paperSize: paper.css.toLowerCase(),
        pageCount: pdfDoc.getPageCount(),
        pageErrors,
      };
    } catch (error) {
      return {
        ok: false,
        reason: "binder_pdf_failed",
        bytes: null,
        message: error?.message || "Could not build the Teaching Kit PDF. Please try again.",
      };
    } finally {
      try { restoreGradient(); } catch (_err) { /* ignore */ }
      if (temporary && host && host.parentNode) host.parentNode.removeChild(host);
    }
  }

  async function renderBinderPdf(htmlOrHost, options = {}) {
    const isBrowserHost = typeof document !== "undefined"
      && htmlOrHost
      && typeof htmlOrHost === "object"
      && htmlOrHost.nodeType === 1;
    if (isBrowserHost || (typeof document !== "undefined" && options.forceBrowser === true)) {
      return renderBinderPdfInBrowser(htmlOrHost, options);
    }
    if (typeof process !== "undefined" && process.versions?.node) {
      return renderBinderPdfWithPlaywright(String(htmlOrHost || ""), options);
    }
    return renderBinderPdfInBrowser(htmlOrHost, options);
  }

  return {
    letterSize,
    wrapBinderHtml,
    renderBinderPdf,
    renderBinderPdfWithPlaywright,
    renderBinderPdfInBrowser,
  };
});
