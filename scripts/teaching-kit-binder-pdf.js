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
      host.className = "llh-teaching-kit-print-host";
      host.setAttribute("aria-hidden", "true");
      host.innerHTML = `<article class="printable-resource-page teaching-kit-print-article">${hostOrHtml || ""}</article>`;
      document.body.appendChild(host);
    }

    try {
      const pages = Array.from(host.querySelectorAll(".tk-print-page"));
      if (!pages.length) return { ok: false, reason: "no_binder_pages", bytes: null };
      const paper = letterSize(options.paperSize);
      const pdfDoc = await PDFLib.PDFDocument.create();
      for (const pageEl of pages) {
        const canvas = await html2canvas(pageEl, {
          backgroundColor: "#ffffff",
          scale: options.scale || 2,
          useCORS: true,
          logging: false,
          windowWidth: pageEl.scrollWidth,
        });
        const pngBytes = await canvasToPngBytes(canvas);
        if (!pngBytes) continue;
        const image = await pdfDoc.embedPng(pngBytes);
        const pdfPage = pdfDoc.addPage([paper.width, paper.height]);
        const imgRatio = image.width / image.height;
        const pageRatio = paper.width / paper.height;
        let drawW = paper.width;
        let drawH = paper.height;
        if (imgRatio > pageRatio) {
          drawH = drawW / imgRatio;
        } else {
          drawW = drawH * imgRatio;
        }
        const x = (paper.width - drawW) / 2;
        const y = (paper.height - drawH) / 2;
        pdfPage.drawImage(image, { x, y, width: drawW, height: drawH });
      }
      if (!pdfDoc.getPageCount()) return { ok: false, reason: "no_binder_pages", bytes: null };
      const bytes = await pdfDoc.save();
      return {
        ok: true,
        reason: "ok",
        bytes,
        engine: "html2canvas",
        paperSize: paper.css.toLowerCase(),
        pageCount: pdfDoc.getPageCount(),
      };
    } finally {
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
