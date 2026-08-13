/**
 * Teaching Kit binder print/download job lifecycle.
 * Request IDs, honest stages, timeouts, structured errors, PDF validation.
 * Does not generate PDFs — wraps the existing binder/print pipeline.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.LLHTeachingKitBinderJob = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const STAGES = Object.freeze([
    Object.freeze({ id: "received", label: "Request received", message: "Preparing your binder…" }),
    Object.freeze({ id: "collecting", label: "Lesson collected", message: "Collecting lesson pages…" }),
    Object.freeze({ id: "activities", label: "Activities", message: "Adding activities…" }),
    Object.freeze({ id: "printables", label: "Printables", message: "Adding printables…" }),
    Object.freeze({ id: "building", label: "Building binder", message: "Building PDF…" }),
    Object.freeze({ id: "download", label: "Starting download", message: "Starting download…" }),
    Object.freeze({ id: "print", label: "Preparing print view", message: "Preparing print view…" }),
    Object.freeze({ id: "success", label: "Ready", message: "Your binder is ready. Download started." }),
    Object.freeze({ id: "success_print", label: "Ready", message: "Print view is ready." }),
    Object.freeze({ id: "error", label: "Failed", message: "We couldn't finish this binder download. Nothing was changed. Try again, or download a smaller section." }),
  ]);

  const ERRORS = Object.freeze({
    PRINTABLE_MISSING: "Binder couldn't be completed because one printable is unavailable.",
    LESSON_NOT_FOUND: "That lesson could not be found. Nothing was changed.",
    TEACHING_KIT_UNAVAILABLE: "This Teaching Kit is not ready to print yet.",
    MALFORMED_MANIFEST: "The print selection was not valid. Choose Entire Binder or a smaller section and try again.",
    EMPTY_MANIFEST: "Select at least one resource before printing.",
    PDF_GENERATION_FAILURE: "We couldn't build this binder PDF. Nothing was changed. Try again, or download a smaller section.",
    PDF_MERGE_FAILURE: "Binder pages were built, but printable PDFs could not be merged.",
    CORRUPTED_RESOURCE: "A selected printable file is unreadable. Remove it or re-link the PDF, then try again.",
    REQUEST_TIMEOUT: "We couldn't finish this binder download. Nothing was changed. Try again, or download a smaller section.",
    UNEXPECTED_ERROR: "The binder request failed unexpectedly. Nothing was changed.",
    PRINT_VIEW_BLOCKED: "The print view could not be opened. Try Download PDF, then print that file.",
    BLOB_FAILURE: "The PDF was generated but the browser could not start the download. Try Download again.",
    PDF_VALIDATION_FAILURE: "The generated file was not a valid PDF. Nothing was changed. Please try again.",
    BUSY: "This binder request is already in progress.",
    PIPELINE_MISSING: "PDF download is unavailable right now. Please refresh and try again.",
    WATERMARK_REQUIRED: "A trial watermark is required. Please try again.",
    TRIAL_BLOCKED: "Download could not start. Please try again.",
    SELECTION_NOT_FOUND: "That selection was not found in this Teaching Kit.",
  });

  const REASON_TO_CODE = Object.freeze({
    attachment_missing: "PRINTABLE_MISSING",
    missing_attachment: "PRINTABLE_MISSING",
    invalid_attachment: "CORRUPTED_RESOURCE",
    corrupted_resource: "CORRUPTED_RESOURCE",
    unavailable: "TEACHING_KIT_UNAVAILABLE",
    print_flag_off: "TEACHING_KIT_UNAVAILABLE",
    empty_selection: "EMPTY_MANIFEST",
    selection_not_found: "SELECTION_NOT_FOUND",
    malformed_manifest: "MALFORMED_MANIFEST",
    binder_pdf_failed: "PDF_GENERATION_FAILURE",
    binder_pdf_render_failed: "PDF_GENERATION_FAILURE",
    no_binder_pages: "PDF_GENERATION_FAILURE",
    html2canvas_timeout: "REQUEST_TIMEOUT",
    request_timeout: "REQUEST_TIMEOUT",
    timeout: "REQUEST_TIMEOUT",
    merge_failed: "PDF_MERGE_FAILURE",
    invalid_binder_pdf: "PDF_VALIDATION_FAILURE",
    empty_pdf: "PDF_VALIDATION_FAILURE",
    pdf_validation_failed: "PDF_VALIDATION_FAILURE",
    browser_pdf_deps_missing: "PIPELINE_MISSING",
    pdf_pipeline_missing: "PIPELINE_MISSING",
    pdf_lib_missing: "PIPELINE_MISSING",
    busy: "BUSY",
    watermark_required: "WATERMARK_REQUIRED",
    watermark_missing: "WATERMARK_REQUIRED",
    trial_blocked: "TRIAL_BLOCKED",
    print_view_blocked: "PRINT_VIEW_BLOCKED",
    blob_failure: "BLOB_FAILURE",
    lesson_not_found: "LESSON_NOT_FOUND",
  });

  let requestSeq = 0;

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function createBinderRequestId() {
    requestSeq += 1;
    const rand = Math.random().toString(36).slice(2, 8);
    return `tk-binder-${Date.now().toString(36)}-${requestSeq}-${rand}`;
  }

  function timeoutForScope(selection) {
    const mode = text(selection?.documentMode || selection?.preset || "entire_binder").toLowerCase();
    if (mode === "entire_binder" || mode === "week_binder" || mode === "full_weekly" || mode === "full_weekly_plan") {
      return 180000;
    }
    if (mode === "one_day" || mode === "today_pack" || mode === "selected_resources") {
      return 120000;
    }
    return 90000;
  }

  function pageCaptureTimeoutMs() {
    return 20000;
  }

  function fetchTimeoutMs() {
    return 20000;
  }

  function ownerMessage(codeOrReason, fallback) {
    const raw = text(codeOrReason);
    if (ERRORS[raw]) return ERRORS[raw];
    const mapped = REASON_TO_CODE[raw];
    if (mapped && ERRORS[mapped]) return ERRORS[mapped];
    return text(fallback) || ERRORS.UNEXPECTED_ERROR;
  }

  function errorCode(reason) {
    const raw = text(reason);
    if (ERRORS[raw]) return raw;
    return REASON_TO_CODE[raw] || "UNEXPECTED_ERROR";
  }

  function stageById(id) {
    return STAGES.find((item) => item.id === id) || STAGES[0];
  }

  function stageMessage(id, extra) {
    const stage = stageById(id);
    const extraText = text(extra);
    if (!extraText) return stage.message;
    if (id === "building" && extraText) return extraText;
    return stage.message;
  }

  function isActiveRequest(state, requestId) {
    return Boolean(state && requestId && text(state.binderRequestId) === text(requestId));
  }

  function withTimeout(promise, timeoutMs, reason) {
    const ms = Math.max(1000, Number(timeoutMs) || 180000);
    const code = reason || "REQUEST_TIMEOUT";
    let timer = null;
    let settled = false;
    return new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        const error = new Error(ownerMessage(code));
        error.code = errorCode(code);
        error.reason = "request_timeout";
        reject(error);
      }, ms);
      Promise.resolve(promise).then(
        (value) => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  function isPdfSignature(bytes) {
    if (!bytes || bytes.byteLength < 8) return false;
    const head = bytes instanceof Uint8Array
      ? bytes.subarray(0, 5)
      : new Uint8Array(bytes.slice ? bytes.slice(0, 5) : bytes).subarray(0, 5);
    return String.fromCharCode(head[0], head[1], head[2], head[3], head[4]) === "%PDF-";
  }

  function validatePdfBytes(bytes, options = {}) {
    const minBytes = Number(options.minBytes) || 64;
    if (!bytes || !bytes.byteLength) {
      return { ok: false, reason: "empty_pdf", code: "PDF_VALIDATION_FAILURE", byteLength: 0 };
    }
    if (bytes.byteLength < minBytes) {
      return { ok: false, reason: "empty_pdf", code: "PDF_VALIDATION_FAILURE", byteLength: bytes.byteLength };
    }
    if (!isPdfSignature(bytes)) {
      return { ok: false, reason: "pdf_validation_failed", code: "PDF_VALIDATION_FAILURE", byteLength: bytes.byteLength };
    }
    return { ok: true, reason: "ok", byteLength: bytes.byteLength };
  }

  function logDiagnostics(payload) {
    const safe = payload && typeof payload === "object" ? payload : {};
    const record = {
      binderRequestId: text(safe.binderRequestId),
      lessonPlanId: text(safe.lessonPlanId),
      scope: text(safe.scope || safe.documentMode || safe.preset),
      intent: text(safe.intent),
      manifestItemCount: Number(safe.manifestItemCount) || 0,
      printableCount: Number(safe.printableCount) || 0,
      generationMs: Number(safe.generationMs) || 0,
      mergeMs: Number(safe.mergeMs) || 0,
      byteLength: Number(safe.byteLength) || 0,
      pageCount: Number(safe.pageCount) || 0,
      status: text(safe.status || (safe.ok ? "ok" : "error")),
      errorCode: text(safe.errorCode || safe.code),
    };
    try {
      console.info("[llh-tk-binder]", JSON.stringify(record));
    } catch (_err) { /* ignore */ }
    return record;
  }

  function openPrintTarget(doc) {
    const documentRef = doc || (typeof document !== "undefined" ? document : null);
    if (!documentRef || typeof documentRef.createElement !== "function") {
      return { ok: false, reason: "no_document", frame: null };
    }
    documentRef.querySelectorAll?.(".llh-teaching-kit-print-target").forEach((node) => {
      try { node.remove(); } catch (_err) { /* ignore */ }
    });
    const frame = documentRef.createElement("iframe");
    frame.className = "llh-teaching-kit-print-target";
    frame.setAttribute("title", "Preparing print view");
    frame.setAttribute("aria-label", "Preparing print view");
    frame.setAttribute("data-tk-print-target", "1");
    frame.style.cssText = "position:fixed;left:-12000px;top:0;width:816px;height:1056px;border:0;background:#fff;opacity:1;pointer-events:none;";
    documentRef.body.appendChild(frame);
    try {
      const targetDoc = frame.contentDocument;
      if (targetDoc) {
        targetDoc.open();
        targetDoc.write("<!doctype html><title>Preparing print view…</title><body style=\"font-family:system-ui,sans-serif;padding:24px;color:#333\"><p>Preparing print view…</p></body>");
        targetDoc.close();
      }
    } catch (_err) { /* ignore */ }
    return { ok: true, reason: "opened", frame };
  }

  function triggerBlobDownload(blob, fileName, options = {}) {
    const documentRef = options.document || (typeof document !== "undefined" ? document : null);
    const urlApi = options.URL || (typeof URL !== "undefined" ? URL : null);
    if (!blob || !documentRef || !urlApi?.createObjectURL) {
      return { ok: false, reason: "blob_failure", objectUrl: "" };
    }
    const url = urlApi.createObjectURL(blob);
    const link = documentRef.createElement("a");
    link.href = url;
    link.download = text(fileName) || "Teaching-Kit-Binder.pdf";
    link.rel = "noopener";
    documentRef.body.appendChild(link);
    link.click();
    link.remove();
    const revokeMs = Number(options.revokeMs) || 4000;
    setTimeout(() => {
      try { urlApi.revokeObjectURL(url); } catch (_err) { /* ignore */ }
    }, revokeMs);
    return { ok: true, reason: "started", objectUrl: url, fileName: link.download };
  }

  function binderBusyPatch(state, patch) {
    const next = state && typeof state === "object" ? state : {};
    Object.keys(patch || {}).forEach((key) => {
      next[key] = patch[key];
    });
    return next;
  }

  return {
    STAGES,
    ERRORS,
    createBinderRequestId,
    timeoutForScope,
    pageCaptureTimeoutMs,
    fetchTimeoutMs,
    ownerMessage,
    errorCode,
    stageById,
    stageMessage,
    isActiveRequest,
    withTimeout,
    isPdfSignature,
    validatePdfBytes,
    logDiagnostics,
    openPrintTarget,
    triggerBlobDownload,
    binderBusyPatch,
  };
});
