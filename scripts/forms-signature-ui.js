/**
 * Wave 5 — Family Hub / Staff electronic signature UI (typed + drawn + legacy ack).
 * Mobile-first (~390px). Keeps drawn canvases small for memory safety.
 */
(function formsSignatureUiModule(global) {
  "use strict";

  const MAX_CANVAS_CSS_WIDTH = 360;
  const CANVAS_HEIGHT = 140;
  const DRAWN_MAX_CHARS = 48000;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function buildPanelHtml({
    documentId = "",
    title = "Form",
    bodyText = "",
    fields = [],
    answers = {},
    currentVersionId = "",
    bodyHash = "",
    preferredName = "",
    audience = "family",
  } = {}) {
    const fieldRows = (Array.isArray(fields) ? fields : [])
      .filter((f) => f && f.type !== "signature" && f.type !== "file")
      .map((field) => {
        const value = answers && answers[field.id] != null ? answers[field.id] : "";
        const required = field.required ? "required" : "";
        const label = `${escapeHtml(field.label || "Field")}${field.required ? " *" : ""}`;
        if (field.type === "info") {
          return `<p class="llh-sign-info" data-field-id="${escapeHtml(field.id)}">${escapeHtml(field.helpText || field.label || "")}</p>`;
        }
        if (field.type === "long_text") {
          return `<label class="llh-sign-field">${label}<textarea name="${escapeHtml(field.id)}" data-sign-answer="${escapeHtml(field.id)}" rows="3" maxlength="4000" ${required}>${escapeHtml(value)}</textarea></label>`;
        }
        if (field.type === "checkbox" || field.type === "yes_no") {
          return `<label class="llh-sign-check"><input type="checkbox" name="${escapeHtml(field.id)}" data-sign-answer="${escapeHtml(field.id)}" ${value ? "checked" : ""} ${required}/> ${label}</label>`;
        }
        if (field.type === "dropdown" || field.type === "radio") {
          const opts = (field.options || []).map((opt) => (
            `<option value="${escapeHtml(opt.value || opt.label)}" ${String(value) === String(opt.value || opt.label) ? "selected" : ""}>${escapeHtml(opt.label || opt.value)}</option>`
          )).join("");
          return `<label class="llh-sign-field">${label}<select name="${escapeHtml(field.id)}" data-sign-answer="${escapeHtml(field.id)}" ${required}><option value="">Select…</option>${opts}</select></label>`;
        }
        const inputType = field.type === "number" ? "number" : (field.type === "date" ? "date" : (field.type === "time" ? "time" : "text"));
        return `<label class="llh-sign-field">${label}<input type="${inputType}" name="${escapeHtml(field.id)}" data-sign-answer="${escapeHtml(field.id)}" value="${escapeHtml(value)}" maxlength="400" ${required} /></label>`;
      }).join("");

    return `
      <div class="llh-sign-modal" data-llh-sign-root="1" role="dialog" aria-modal="true" aria-labelledby="llhSignTitle">
        <div class="llh-sign-sheet">
          <header class="llh-sign-head">
            <h2 id="llhSignTitle">Electronic Signature</h2>
            <p class="llh-sign-sub">${escapeHtml(title)} · Signature Record</p>
            <button type="button" class="ghost-button llh-sign-close" data-llh-sign-close aria-label="Close signature panel">Close</button>
          </header>
          <div class="llh-sign-body">
            ${bodyText ? `<details class="llh-sign-doc" open><summary>Review form</summary><pre class="llh-sign-pre">${escapeHtml(bodyText)}</pre></details>` : ""}
            <form class="llh-sign-form" data-llh-sign-form novalidate
              data-document-id="${escapeHtml(documentId)}"
              data-version-id="${escapeHtml(currentVersionId)}"
              data-body-hash="${escapeHtml(bodyHash)}"
              data-audience="${escapeHtml(audience)}">
              ${fieldRows ? `<fieldset class="llh-sign-fields"><legend>Required details</legend>${fieldRows}</fieldset>` : ""}
              <fieldset class="llh-sign-method">
                <legend>How do you want to sign?</legend>
                <label><input type="radio" name="signatureMethod" value="typed" checked /> Type my name</label>
                <label><input type="radio" name="signatureMethod" value="drawn" /> Draw signature</label>
                <label><input type="radio" name="signatureMethod" value="acknowledgment_text" /> Acknowledge in text</label>
              </fieldset>
              <div class="llh-sign-typed" data-sign-pane="typed">
                <label class="llh-sign-field">Typed electronic signature
                  <input type="text" name="typedSignature" autocomplete="name" inputmode="text" maxlength="120" value="${escapeHtml(preferredName)}" placeholder="Type your full name" />
                </label>
              </div>
              <div class="llh-sign-drawn is-hidden" data-sign-pane="drawn">
                <p class="llh-sign-help" id="llhSignPadHelp">Draw inside the box. Use Clear to reset. Sign &amp; Submit is separate so drawing never submits.</p>
                <div class="llh-sign-pad-wrap">
                  <canvas class="llh-sign-pad" data-llh-sign-pad width="320" height="${CANVAS_HEIGHT}" aria-label="Drawn signature pad" aria-describedby="llhSignPadHelp"></canvas>
                </div>
                <div class="llh-sign-pad-actions">
                  <button type="button" class="ghost-button" data-llh-sign-clear>Clear signature</button>
                  <img class="llh-sign-preview is-hidden" data-llh-sign-preview alt="Signature preview" />
                </div>
              </div>
              <div class="llh-sign-ack is-hidden" data-sign-pane="acknowledgment_text">
                <label class="llh-sign-check">
                  <input type="checkbox" name="ackConfirm" />
                  I acknowledge I have reviewed this form and am signing electronically.
                </label>
              </div>
              <p class="llh-sign-error is-hidden" data-llh-sign-error role="alert"></p>
              <div class="llh-sign-actions">
                <button type="button" class="ghost-button" data-llh-sign-close>Cancel</button>
                <button type="submit" class="primary-button" data-llh-sign-submit>Sign &amp; Submit</button>
              </div>
              <p class="llh-sign-legal-note">Electronic Signature — testing signature record for your program (not a legal certification badge).</p>
            </form>
          </div>
        </div>
      </div>
    `;
  }

  function collectAnswers(form) {
    const answers = {};
    form.querySelectorAll("[data-sign-answer]").forEach((el) => {
      const id = el.getAttribute("data-sign-answer");
      if (!id) return;
      if (el.type === "checkbox") answers[id] = Boolean(el.checked);
      else answers[id] = el.value;
    });
    return answers;
  }

  function bindPad(canvas, preview) {
    if (!canvas) return { isEmpty: () => true, clear: () => {}, toDataUrl: () => "" };
    const ctx = canvas.getContext("2d");
    let drawing = false;
    let dirty = false;
    const resize = () => {
      const wrap = canvas.parentElement;
      const cssWidth = Math.min(MAX_CANVAS_CSS_WIDTH, Math.max(240, (wrap?.clientWidth || 320) - 4));
      const ratio = typeof window !== "undefined" && window.devicePixelRatio ? Math.min(window.devicePixelRatio, 2) : 1;
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${CANVAS_HEIGHT}px`;
      canvas.width = Math.floor(cssWidth * ratio);
      canvas.height = Math.floor(CANVAS_HEIGHT * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.fillStyle = "#fffef8";
      ctx.fillRect(0, 0, cssWidth, CANVAS_HEIGHT);
      ctx.strokeStyle = "#1f2a24";
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      dirty = false;
      if (preview) {
        preview.classList.add("is-hidden");
        preview.removeAttribute("src");
      }
    };
    resize();

    const point = (event) => {
      const rect = canvas.getBoundingClientRect();
      const src = event.touches && event.touches[0] ? event.touches[0] : event;
      return { x: src.clientX - rect.left, y: src.clientY - rect.top };
    };
    const start = (event) => {
      drawing = true;
      dirty = true;
      const p = point(event);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      event.preventDefault();
    };
    const move = (event) => {
      if (!drawing) return;
      const p = point(event);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      event.preventDefault();
    };
    const end = (event) => {
      if (!drawing) return;
      drawing = false;
      if (preview) {
        const url = canvas.toDataURL("image/png");
        if (url && url.length < DRAWN_MAX_CHARS) {
          preview.src = url;
          preview.classList.remove("is-hidden");
        }
      }
      if (event) event.preventDefault();
    };

    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", move);
    canvas.addEventListener("mouseup", end);
    canvas.addEventListener("mouseleave", end);
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", end, { passive: false });

    return {
      isEmpty: () => !dirty,
      clear: () => resize(),
      toDataUrl: () => {
        if (!dirty) return "";
        const url = canvas.toDataURL("image/png");
        if (url.length > DRAWN_MAX_CHARS) {
          throw new Error("Drawn signature is too large. Clear the pad and try again.");
        }
        return url;
      },
      resize,
    };
  }

  function openSignatureModal(options = {}) {
    return new Promise((resolve) => {
      const existing = document.querySelector("[data-llh-sign-root]");
      if (existing) existing.remove();
      const wrap = document.createElement("div");
      wrap.innerHTML = buildPanelHtml(options);
      const root = wrap.firstElementChild;
      document.body.appendChild(root);
      document.body.classList.add("llh-sign-open");

      const form = root.querySelector("[data-llh-sign-form]");
      const errorEl = root.querySelector("[data-llh-sign-error]");
      const canvas = root.querySelector("[data-llh-sign-pad]");
      const preview = root.querySelector("[data-llh-sign-preview]");
      const pad = bindPad(canvas, preview);
      let settled = false;

      const close = (result) => {
        if (settled) return;
        settled = true;
        document.body.classList.remove("llh-sign-open");
        root.remove();
        resolve(result);
      };

      const showError = (message) => {
        if (!errorEl) return;
        errorEl.textContent = message || "";
        errorEl.classList.toggle("is-hidden", !message);
      };

      const syncMethod = () => {
        const method = form.querySelector('input[name="signatureMethod"]:checked')?.value || "typed";
        root.querySelectorAll("[data-sign-pane]").forEach((pane) => {
          pane.classList.toggle("is-hidden", pane.getAttribute("data-sign-pane") !== method);
        });
      };
      form.querySelectorAll('input[name="signatureMethod"]').forEach((input) => {
        input.addEventListener("change", syncMethod);
      });
      syncMethod();

      root.querySelectorAll("[data-llh-sign-close]").forEach((btn) => {
        btn.addEventListener("click", () => close({ cancelled: true }));
      });
      root.querySelector("[data-llh-sign-clear]")?.addEventListener("click", () => {
        pad.clear();
        showError("");
      });

      // Dirty-state integration for answers + typed signature.
      form.querySelectorAll("input, textarea, select").forEach((el) => {
        el.addEventListener("input", () => {
          if (global.LLHFormsDirtyState) {
            global.LLHFormsDirtyState.touch(options.documentId || "sign", el.name || el.id, el.type === "checkbox" ? el.checked : el.value);
          }
        });
      });

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        showError("");
        const method = form.querySelector('input[name="signatureMethod"]:checked')?.value || "typed";
        const answers = collectAnswers(form);
        // Client-side required check (server still validates).
        const missing = [];
        form.querySelectorAll("[data-sign-answer][required]").forEach((el) => {
          if (el.type === "checkbox") {
            if (!el.checked) missing.push(el.name);
          } else if (!String(el.value || "").trim()) missing.push(el.name);
        });
        if (missing.length) {
          showError("Please complete the required fields before signing.");
          const first = form.querySelector(`[data-sign-answer="${CSS.escape(missing[0])}"]`);
          first?.focus?.();
          first?.scrollIntoView?.({ block: "center", behavior: "smooth" });
          return;
        }
        let typedSignature = String(form.typedSignature?.value || "").trim();
        let drawnSignatureDataUrl = "";
        if (method === "typed") {
          if (!typedSignature) {
            showError("Type your name to create an electronic signature.");
            form.typedSignature?.focus?.();
            return;
          }
        } else if (method === "drawn") {
          try {
            drawnSignatureDataUrl = pad.toDataUrl();
          } catch (error) {
            showError(error.message || "Could not capture drawn signature.");
            return;
          }
          if (!drawnSignatureDataUrl) {
            showError("Draw your signature before submitting.");
            return;
          }
          typedSignature = typedSignature || options.preferredName || "Signed";
        } else if (method === "acknowledgment_text") {
          if (!form.ackConfirm?.checked) {
            showError("Confirm the acknowledgment before signing.");
            return;
          }
          typedSignature = typedSignature || options.preferredName || "Acknowledged";
        }
        const submitBtn = form.querySelector("[data-llh-sign-submit]");
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = "Signing…";
        }
        close({
          cancelled: false,
          documentId: options.documentId,
          expectedVersionId: options.currentVersionId || form.getAttribute("data-version-id") || "",
          expectedBodyHash: options.bodyHash || form.getAttribute("data-body-hash") || "",
          signatureMethod: method,
          typedSignature,
          drawnSignatureDataUrl,
          answers,
          audience: options.audience || "family",
        });
      });
    });
  }

  const api = {
    openSignatureModal,
    buildPanelHtml,
    MAX_DRAWN_DATA_URI_CHARS: DRAWN_MAX_CHARS,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.LLHFormsSignatureUi = api;
})(typeof window !== "undefined" ? window : global);
