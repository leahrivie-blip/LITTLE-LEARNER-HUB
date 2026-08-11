/**
 * Wave 7 — Paperwork upload UI (Child / Staff / Program).
 * Keeps file selection across metadata edits (no remount wipe).
 */
(function formsUploadUiModule(global) {
  "use strict";

  const MAX_MB = 5;
  const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp";

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        reject(new Error("Choose a file."));
        return;
      }
      if (file.size > MAX_MB * 1024 * 1024) {
        reject(new Error(`File must be ${MAX_MB} MB or smaller.`));
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read that file."));
      reader.onload = () => resolve(String(reader.result || ""));
      reader.readAsDataURL(file);
    });
  }

  function closePanel() {
    const el = document.querySelector("[data-llh-upload-root]");
    if (el) el.remove();
    document.body.classList.remove("llh-upload-open");
  }

  function buildPanelHtml({
    assigneeType = "child",
    childId = "",
    assigneeEmail = "",
    childOptions = [],
    staffOptions = [],
    categories = ["Upload", "Medical", "Enrollment", "Permission", "Certification", "Policy", "Other"],
  } = {}) {
    const childOpts = (childOptions || []).map((c) => (
      `<option value="${escapeHtml(c.id)}" ${String(c.id) === String(childId) ? "selected" : ""}>${escapeHtml(c.name || c.id)}</option>`
    )).join("");
    const staffOpts = (staffOptions || []).map((s) => (
      `<option value="${escapeHtml(s.email)}" ${String(s.email).toLowerCase() === String(assigneeEmail).toLowerCase() ? "selected" : ""}>${escapeHtml(s.name || s.email)}</option>`
    )).join("");
    const catOpts = categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    return `
      <div class="llh-upload-modal" data-llh-upload-root="1" role="dialog" aria-modal="true" aria-labelledby="llhUploadTitle">
        <div class="llh-upload-sheet">
          <header class="llh-upload-head">
            <div>
              <p class="llh-upload-kicker">Upload document</p>
              <h2 id="llhUploadTitle">Add paperwork file</h2>
              <p class="llh-upload-help">PDF, JPEG, PNG, or WebP · max ${MAX_MB} MB. This becomes a paperwork record (not a structured LLH form).</p>
            </div>
            <button type="button" class="ghost-button" data-llh-upload-close aria-label="Close upload panel">Close</button>
          </header>
          <form class="llh-upload-form" data-llh-upload-form novalidate data-assignee-type="${escapeHtml(assigneeType)}">
            <label class="llh-upload-field">Title
              <input type="text" name="title" maxlength="120" required placeholder="e.g. Immunization record" data-upload-meta="title" />
            </label>
            <label class="llh-upload-field">Category
              <select name="category" data-upload-meta="category">${catOpts}</select>
            </label>
            ${assigneeType === "child" ? `
              <label class="llh-upload-field">Child
                <select name="childId" required data-upload-meta="childId">${childOpts || "<option value=\"\">Select child…</option>"}</select>
              </label>
              <label class="llh-upload-check">
                <input type="checkbox" name="shareWithFamily" value="true" data-upload-meta="shareWithFamily" />
                Share with Family Hub (explicit)
              </label>
            ` : ""}
            ${assigneeType === "staff" ? `
              <label class="llh-upload-field">Staff
                <select name="assigneeEmail" required data-upload-meta="assigneeEmail">${staffOpts || "<option value=\"\">Select staff…</option>"}</select>
              </label>
              <p class="llh-upload-help">Staff uploads are never visible in Family Hub.</p>
            ` : ""}
            ${assigneeType === "program" ? `<p class="llh-upload-help">Program-only paperwork — not shared with families or staff unless you assign separately.</p>` : ""}
            <label class="llh-upload-field">Expires (optional)
              <input type="date" name="expiresAt" data-upload-meta="expiresAt" />
            </label>
            <label class="llh-upload-field">File
              <input type="file" name="file" accept="${ACCEPT}" required data-llh-upload-file aria-describedby="llhUploadFileHelp" />
            </label>
            <p id="llhUploadFileHelp" class="llh-upload-help">Accepted: PDF, PNG, JPEG, WebP. Changing title/category will not clear your selected file.</p>
            <p class="llh-upload-file-name is-hidden" data-llh-upload-filename role="status"></p>
            <p class="llh-upload-error is-hidden" data-llh-upload-error role="alert"></p>
            <div class="llh-upload-actions">
              <button type="button" class="ghost-button" data-llh-upload-close>Cancel</button>
              <button type="submit" class="primary-button" data-llh-upload-submit>Upload document</button>
            </div>
          </form>
        </div>
      </div>`;
  }

  function openUploadModal(options = {}) {
    closePanel();
    const wrap = document.createElement("div");
    wrap.innerHTML = buildPanelHtml(options);
    const root = wrap.firstElementChild;
    document.body.appendChild(root);
    document.body.classList.add("llh-upload-open");

    const form = root.querySelector("[data-llh-upload-form]");
    const fileInput = root.querySelector("[data-llh-upload-file]");
    const nameEl = root.querySelector("[data-llh-upload-filename]");
    const errEl = root.querySelector("[data-llh-upload-error]");
    const dirty = global.LLHFormsDirtyState;
    const formId = `upload-${options.assigneeType || "child"}-${Date.now()}`;
    let selectedFile = null;
    let selectedDataUrl = "";
    let submitting = false;

    function showError(msg) {
      if (!errEl) return;
      errEl.textContent = msg || "";
      errEl.classList.toggle("is-hidden", !msg);
    }

    form.querySelectorAll("[data-upload-meta]").forEach((el) => {
      el.addEventListener("input", () => {
        if (dirty?.touch) dirty.touch(formId, el.name, el.type === "checkbox" ? (el.checked ? "1" : "") : el.value);
      });
      el.addEventListener("change", () => {
        if (dirty?.touch) dirty.touch(formId, el.name, el.type === "checkbox" ? (el.checked ? "1" : "") : el.value);
      });
    });

    fileInput.addEventListener("change", () => {
      selectedFile = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
      selectedDataUrl = "";
      if (nameEl) {
        nameEl.textContent = selectedFile ? `Selected: ${selectedFile.name}` : "";
        nameEl.classList.toggle("is-hidden", !selectedFile);
      }
      if (dirty?.touch) dirty.touch(formId, "fileName", selectedFile?.name || "");
      showError("");
    });

    function teardown(result) {
      document.removeEventListener("keydown", onKey);
      if (dirty?.clearForm) dirty.clearForm(formId);
      closePanel();
      if (typeof options.onClose === "function") options.onClose(result);
    }

    function onKey(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        teardown({ cancelled: true });
      }
    }
    document.addEventListener("keydown", onKey);

    root.addEventListener("click", (event) => {
      if (event.target.closest("[data-llh-upload-close]")) {
        event.preventDefault();
        teardown({ cancelled: true });
      }
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (submitting) return;
      showError("");
      if (!selectedFile) {
        showError("Choose a PDF or image file.");
        fileInput.focus();
        return;
      }
      const title = String(form.title?.value || "").trim();
      if (!title) {
        showError("Enter a title.");
        form.title?.focus();
        return;
      }
      submitting = true;
      const submitBtn = form.querySelector("[data-llh-upload-submit]");
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Uploading…";
      }
      try {
        if (!selectedDataUrl) selectedDataUrl = await fileToDataUrl(selectedFile);
        const payload = {
          assigneeType: options.assigneeType || form.getAttribute("data-assignee-type") || "child",
          title,
          category: String(form.category?.value || "Upload"),
          expiresAt: String(form.expiresAt?.value || ""),
          notes: "",
          originalFileName: selectedFile.name,
          fileData: selectedDataUrl,
          idempotencyKey: (global.crypto && crypto.randomUUID)
            ? crypto.randomUUID().replace(/-/g, "").slice(0, 24)
            : `idemp${Date.now().toString(36)}`,
        };
        if (payload.assigneeType === "child") {
          payload.childId = String(form.childId?.value || options.childId || "");
          payload.shareWithFamily = Boolean(form.shareWithFamily?.checked);
          if (!payload.childId) throw new Error("Choose a child.");
        }
        if (payload.assigneeType === "staff") {
          payload.assigneeEmail = String(form.assigneeEmail?.value || options.assigneeEmail || "").toLowerCase();
          payload.shareWithFamily = false;
          if (!payload.assigneeEmail) throw new Error("Choose a staff member.");
        }
        if (payload.assigneeType === "program") payload.shareWithFamily = false;

        const headers = typeof options.getStaffHeaders === "function"
          ? await options.getStaffHeaders()
          : { "Content-Type": "application/json" };
        headers["Content-Type"] = "application/json";
        const res = await fetch("/api/program-forms/uploads", {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          cache: "no-store",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Upload failed.");
        // Release data URL from memory after success.
        selectedDataUrl = "";
        teardown({ cancelled: false, result: json });
      } catch (error) {
        submitting = false;
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Upload document";
        }
        showError(error.message || "Upload failed.");
      }
    });

    const first = form.querySelector("input[name='title']");
    if (first) first.focus();
    return { formId, close: () => teardown({ cancelled: true }) };
  }

  const api = {
    openUploadModal,
    closePanel,
    buildPanelHtml,
    fileToDataUrl,
    MAX_UPLOAD_MB: MAX_MB,
    ACCEPT,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.LLHFormsUploadUi = api;
})(typeof window !== "undefined" ? window : global);
