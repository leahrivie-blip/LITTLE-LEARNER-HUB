/**
 * Owner Draft Review — complete printable PDF page review.
 * Renders every page as a thumbnail; large preview with prev/next/zoom;
 * download + system print; does not mark reviewed merely because the file opens.
 */
(function initCurriculumDraftPrintableReview(global) {
  "use strict";

  const CHECKLIST = [
    { id: "branding", label: "Branding present" },
    { id: "website", label: "Website address present" },
    { id: "cutLines", label: "Cut lines present (if needed)" },
    { id: "margins", label: "Margins look printable" },
    { id: "labels", label: "Labels readable" },
    { id: "illustrations", label: "Illustrations present" },
  ];

  let pdfjsLibPromise = null;

  async function loadPdfJs() {
    if (pdfjsLibPromise) return pdfjsLibPromise;
    pdfjsLibPromise = import("/scripts/vendor/pdf.min.mjs").then((mod) => {
      const lib = mod?.default || mod;
      if (lib?.GlobalWorkerOptions) {
        lib.GlobalWorkerOptions.workerSrc = "/scripts/vendor/pdf.worker.min.mjs";
      }
      return lib;
    });
    return pdfjsLibPromise;
  }

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function adminToken() {
    try {
      return (typeof adminSession === "function" ? adminSession()?.token : "") || "";
    } catch {
      return "";
    }
  }

  function fileUrlFor(resourceId) {
    const token = encodeURIComponent(adminToken());
    return `/api/admin/curriculum/resources/file?id=${encodeURIComponent(resourceId)}&adminToken=${token}`;
  }

  function createViewerState(printable) {
    return {
      printable,
      resourceId: printable.id,
      pageCount: Number(printable.pageCount) || 0,
      pagesViewed: new Set(
        Array.isArray(printable.approval?.pagesViewed)
          ? printable.approval.pagesViewed.map(Number).filter((n) => n > 0)
          : [],
      ),
      checklist: { ...(printable.approval?.checklist || {}) },
      loading: false,
      error: "",
      pdfDoc: null,
      thumbUrls: [],
      previewOpen: false,
      previewPage: 1,
      zoom: 1.15,
      corrupt: false,
      missing: false,
    };
  }

  function dataUrlToArrayBuffer(dataUrl) {
    const text = String(dataUrl || "");
    const match = text.match(/^data:([^;]+);base64,(.+)$/i);
    if (!match) return null;
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  async function fetchPdfBytes(resourceId) {
    // Prefer the shared admin helper — the file API returns JSON { resource: { fileData|mediaUrl } },
    // not raw PDF bytes.
    if (typeof fetchCurriculumResourceFile === "function") {
      try {
        const href = await fetchCurriculumResourceFile(resourceId);
        if (String(href || "").startsWith("data:application/pdf")) {
          const buf = dataUrlToArrayBuffer(href);
          if (buf) return buf;
        }
        if (href) {
          const res = await fetch(href, { headers: { Authorization: `Bearer ${adminToken()}` } });
          if (!res.ok) {
            const err = new Error(`Could not load PDF (${res.status}).`);
            err.code = res.status === 404 || res.status === 403 ? "missing" : "load_failed";
            throw err;
          }
          const buf = await res.arrayBuffer();
          const head = new Uint8Array(buf.slice(0, 5));
          const magic = String.fromCharCode(...head);
          if (!magic.startsWith("%PDF")) {
            const err = new Error("File is not a valid PDF.");
            err.code = "corrupt";
            throw err;
          }
          return buf;
        }
      } catch (error) {
        if (error?.code === "missing" || error?.code === "corrupt" || error?.code === "load_failed") throw error;
        // Fall through to direct API parse.
      }
    }

    const response = await fetch(`/api/admin/curriculum/resources/file?id=${encodeURIComponent(resourceId)}`, {
      headers: { Authorization: `Bearer ${adminToken()}` },
    });
    if (response.status === 404 || response.status === 403) {
      const err = new Error("Draft PDF missing or inaccessible.");
      err.code = "missing";
      throw err;
    }
    if (!response.ok) {
      const err = new Error(`Could not load PDF (${response.status}).`);
      err.code = "load_failed";
      throw err;
    }
    const contentType = String(response.headers.get("content-type") || "");
    if (contentType.includes("application/pdf")) {
      const buf = await response.arrayBuffer();
      const head = new Uint8Array(buf.slice(0, 5));
      if (!String.fromCharCode(...head).startsWith("%PDF")) {
        const err = new Error("File is not a valid PDF.");
        err.code = "corrupt";
        throw err;
      }
      return buf;
    }
    const json = await response.json().catch(() => ({}));
    const resource = json.resource || json;
    const fileData = resource.fileData || "";
    const mediaUrl = resource.mediaUrl || "";
    if (String(fileData).startsWith("data:application/pdf")) {
      const buf = dataUrlToArrayBuffer(fileData);
      if (!buf) {
        const err = new Error("PDF file is empty or corrupt.");
        err.code = "corrupt";
        throw err;
      }
      return buf;
    }
    if (mediaUrl) {
      const res = await fetch(mediaUrl, { headers: { Authorization: `Bearer ${adminToken()}` } });
      if (!res.ok) {
        const err = new Error(`Could not load PDF media (${res.status}).`);
        err.code = "missing";
        throw err;
      }
      return res.arrayBuffer();
    }
    const err = new Error("Draft PDF missing or inaccessible.");
    err.code = "missing";
    throw err;
  }

  async function renderPageToDataUrl(pdfDoc, pageNumber, scale) {
    const page = await pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { alpha: false });
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL("image/jpeg", 0.82);
  }

  async function loadDocument(viewer) {
    viewer.loading = true;
    viewer.error = "";
    viewer.corrupt = false;
    viewer.missing = false;
    viewer.thumbUrls = [];
    try {
      const bytes = await fetchPdfBytes(viewer.resourceId);
      const pdfjs = await loadPdfJs();
      const loadingTask = pdfjs.getDocument({ data: bytes, useSystemFonts: true });
      viewer.pdfDoc = await loadingTask.promise;
      viewer.pageCount = viewer.pdfDoc.numPages || viewer.pageCount || 0;
      if (!viewer.pageCount) {
        viewer.corrupt = true;
        viewer.error = "PDF opened but reported zero pages.";
        return viewer;
      }
      const thumbs = [];
      for (let i = 1; i <= viewer.pageCount; i += 1) {
        // Cap very long PDFs for memory: still render every page, but at small scale.
        const scale = viewer.pageCount > 40 ? 0.22 : (viewer.pageCount > 20 ? 0.28 : 0.35);
        thumbs.push(await renderPageToDataUrl(viewer.pdfDoc, i, scale));
      }
      viewer.thumbUrls = thumbs;
    } catch (error) {
      if (error?.code === "missing") viewer.missing = true;
      else viewer.corrupt = true;
      viewer.error = error?.message || "Unable to render PDF pages.";
      viewer.pdfDoc = null;
    } finally {
      viewer.loading = false;
    }
    return viewer;
  }

  function allPagesViewed(viewer) {
    if (!viewer.pageCount) return false;
    for (let i = 1; i <= viewer.pageCount; i += 1) {
      if (!viewer.pagesViewed.has(i)) return false;
    }
    return true;
  }

  function markPageViewed(viewer, pageNumber) {
    const n = Number(pageNumber);
    if (!n || n < 1) return;
    viewer.pagesViewed.add(n);
  }

  function renderChecklist(viewer) {
    return CHECKLIST.map((item) => `
      <label class="tk-draft-pdf-check">
        <input type="checkbox" data-pdf-check="${esc(item.id)}" data-pdf-resource="${esc(viewer.resourceId)}"
          ${viewer.checklist[item.id] ? "checked" : ""} />
        <span>${esc(item.label)}</span>
      </label>
    `).join("");
  }

  function renderThumbGrid(viewer) {
    if (viewer.loading) {
      return `<p class="muted-copy tk-draft-pdf-status" data-pdf-status>Loading every page…</p>`;
    }
    if (viewer.error) {
      return `
        <div class="tk-draft-pdf-error" role="alert">
          <strong>${viewer.missing ? "Missing PDF" : "Corrupt or unreadable PDF"}</strong>
          <p>${esc(viewer.error)}</p>
          <p class="muted-copy">This printable cannot be marked reviewed until a valid multi-page (or single-page) PDF loads and every page is inspected.</p>
        </div>
      `;
    }
    if (!viewer.thumbUrls.length) {
      return `<p class="muted-copy">No pages to display.</p>`;
    }
    return `
      <p class="tk-draft-pdf-count"><strong>${viewer.pageCount}</strong> page${viewer.pageCount === 1 ? "" : "s"} ·
        ${viewer.pagesViewed.size} inspected
        ${allPagesViewed(viewer) ? " · complete" : " · inspect every page before approve"}</p>
      <div class="tk-draft-pdf-thumbs" role="list">
        ${viewer.thumbUrls.map((url, idx) => {
          const page = idx + 1;
          const seen = viewer.pagesViewed.has(page);
          return `
            <button type="button" class="tk-draft-pdf-thumb ${seen ? "is-seen" : ""}" role="listitem"
              data-pdf-open-page="${page}" data-pdf-resource="${esc(viewer.resourceId)}"
              aria-label="Open page ${page} preview">
              <img src="${url}" alt="Page ${page} thumbnail" loading="lazy" />
              <span>Page ${page}${seen ? " · seen" : ""}</span>
            </button>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderPreviewOverlay(viewer) {
    if (!viewer.previewOpen || !viewer.pdfDoc) return "";
    return `
      <div class="tk-draft-pdf-lightbox" data-pdf-lightbox data-pdf-resource="${esc(viewer.resourceId)}" role="dialog" aria-modal="true" aria-label="Printable page preview">
        <div class="tk-draft-pdf-lightbox-bar">
          <strong>Page ${viewer.previewPage} of ${viewer.pageCount}</strong>
          <div class="form-actions">
            <button type="button" class="ghost-button" data-pdf-prev data-pdf-resource="${esc(viewer.resourceId)}">Previous</button>
            <button type="button" class="ghost-button" data-pdf-next data-pdf-resource="${esc(viewer.resourceId)}">Next</button>
            <button type="button" class="ghost-button" data-pdf-zoom-out data-pdf-resource="${esc(viewer.resourceId)}">Zoom −</button>
            <button type="button" class="ghost-button" data-pdf-zoom-in data-pdf-resource="${esc(viewer.resourceId)}">Zoom +</button>
            <button type="button" class="ghost-button" data-pdf-close data-pdf-resource="${esc(viewer.resourceId)}">Close</button>
          </div>
        </div>
        <div class="tk-draft-pdf-lightbox-stage" data-pdf-stage>
          <canvas data-pdf-preview-canvas></canvas>
        </div>
      </div>
    `;
  }

  function renderCard(viewer) {
    const r = viewer.printable;
    const canApprove = allPagesViewed(viewer) && !viewer.corrupt && !viewer.missing && viewer.pageCount > 0;
    return `
      <article class="tk-draft-printable-card" data-pdf-card="${esc(viewer.resourceId)}">
        <header class="section-heading">
          <div>
            <p class="eyebrow">Printable review</p>
            <h4>${esc(r.title)}</h4>
          </div>
          <p class="muted-copy">${esc(r.type)} · ${esc(r.status)} · customer access: ${esc(r.publicAccess || "owner-only")}</p>
        </header>
        <p>${esc(r.printingInstructions || "No printing directions yet.")}</p>
        <p class="muted-copy">Linked activities: ${(r.linkedActivities || []).map((a) => a.title).join(", ") || "None listed"}</p>
        <p class="muted-copy">Approval: ${esc(r.approval?.status || "pending")}
          ${r.approval?.pagesComplete ? " · all pages inspected" : ""}</p>
        <div class="tk-draft-pdf-checklist" aria-label="Printable quality checklist">
          ${renderChecklist(viewer)}
        </div>
        <div class="tk-draft-pdf-body" data-pdf-body="${esc(viewer.resourceId)}">
          ${renderThumbGrid(viewer)}
        </div>
        ${renderPreviewOverlay(viewer)}
        <div class="form-actions tk-draft-pdf-actions">
          <button type="button" class="ghost-button" data-pdf-download="${esc(viewer.resourceId)}">Download draft PDF</button>
          <button type="button" class="ghost-button" data-pdf-print="${esc(viewer.resourceId)}" ${viewer.corrupt || viewer.missing ? "disabled" : ""}>System print preview</button>
          <label class="ghost-button tk-draft-pdf-replace">
            Replace PDF
            <input type="file" accept="application/pdf,.pdf" hidden data-pdf-replace-input="${esc(viewer.resourceId)}" />
          </label>
          <button type="button" class="primary-button" data-draft-review-approve-printable="${esc(viewer.resourceId)}"
            ${canApprove ? "" : "disabled"} title="${canApprove ? "Approve after inspecting every page" : "Inspect every page thumbnail/preview before approve"}">
            Approve printable
          </button>
          <button type="button" class="ghost-button" data-draft-review-revise-printable="${esc(viewer.resourceId)}">Request printable revision</button>
        </div>
        ${canApprove ? "" : `<p class="muted-copy tk-draft-pdf-gate">Approve stays disabled until every page has been opened or marked seen. Opening the file alone is not enough.</p>`}
      </article>
    `;
  }

  async function paintPreviewCanvas(viewer) {
    const card = document.querySelector(`[data-pdf-card="${CSS.escape(viewer.resourceId)}"]`);
    const canvas = card?.querySelector("[data-pdf-preview-canvas]");
    if (!canvas || !viewer.pdfDoc) return;
    const page = await viewer.pdfDoc.getPage(viewer.previewPage);
    const viewport = page.getViewport({ scale: viewer.zoom });
    const ctx = canvas.getContext("2d", { alpha: false });
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    markPageViewed(viewer, viewer.previewPage);
  }

  async function persistProgress(api, draftId, viewer) {
    if (typeof api !== "function" || !draftId) return;
    await api("record-printable-pages", {
      id: draftId,
      resourceId: viewer.resourceId,
      pageCount: viewer.pageCount,
      pagesViewed: Array.from(viewer.pagesViewed).sort((a, b) => a - b),
      checklist: viewer.checklist,
    });
  }

  async function downloadPdf(resourceId) {
    try {
      if (typeof fetchCurriculumResourceFile === "function") {
        const href = await fetchCurriculumResourceFile(resourceId);
        const a = document.createElement("a");
        a.href = href;
        a.download = `${resourceId}.pdf`;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
        return;
      }
    } catch { /* fall through */ }
    const a = document.createElement("a");
    a.href = fileUrlFor(resourceId);
    a.download = `${resourceId}.pdf`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function systemPrint(viewer) {
    if (!viewer.pdfDoc) return;
    const win = window.open("", "_blank", "noopener,noreferrer");
    if (!win) {
      window.alert("Allow pop-ups to open system print preview.");
      return;
    }
    const imgs = [];
    for (let i = 1; i <= viewer.pageCount; i += 1) {
      imgs.push(await renderPageToDataUrl(viewer.pdfDoc, i, 1.4));
      markPageViewed(viewer, i);
    }
    win.document.write(`<!doctype html><html><head><title>Printable preview</title>
      <style>body{margin:0;font-family:Georgia,serif} img{display:block;width:100%;max-width:8.5in;margin:0 auto 12px;page-break-after:always}</style>
      </head><body>${imgs.map((src, i) => `<img src="${src}" alt="Page ${i + 1}" />`).join("")}
      <script>window.onload=function(){window.focus();window.print();}<\\/script>
      </body></html>`);
    win.document.close();
  }

  const api = {
    CHECKLIST,
    createViewerState,
    loadDocument,
    renderCard,
    renderThumbGrid,
    allPagesViewed,
    markPageViewed,
    paintPreviewCanvas,
    persistProgress,
    downloadPdf,
    systemPrint,
    fileUrlFor,
    async openPage(viewer, pageNumber) {
      viewer.previewPage = Math.min(Math.max(1, Number(pageNumber) || 1), viewer.pageCount || 1);
      viewer.previewOpen = true;
      markPageViewed(viewer, viewer.previewPage);
    },
    closePreview(viewer) {
      viewer.previewOpen = false;
    },
  };

  global.LLHCurriculumDraftPrintableReview = api;
})(typeof window !== "undefined" ? window : globalThis);
