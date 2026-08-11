/**
 * Wave 6 — Canonical document detail + completed-record renderer.
 * One UI for Paperwork HQ, Child/Staff Documents, Family Hub (role-appropriate).
 */
(function formsDocumentDetailModule(global) {
  "use strict";

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /** Display ISO timestamps in a friendly local format; do not rewrite stored values. */
  function formatLocalDateTime(iso) {
    const raw = String(iso || "").trim();
    if (!raw) return "";
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw.slice(0, 16);
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(d);
    } catch (_e) {
      return d.toLocaleString();
    }
  }

  function formatLocalDate(iso) {
    const raw = String(iso || "").trim();
    if (!raw) return "";
    const d = new Date(raw.length === 10 ? `${raw}T12:00:00` : raw);
    if (Number.isNaN(d.getTime())) return raw.slice(0, 10);
    try {
      return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(d);
    } catch (_e) {
      return d.toLocaleDateString();
    }
  }

  function closeDetailPanel() {
    const existing = document.querySelector("[data-llh-doc-detail-root]");
    if (existing) existing.remove();
    document.body.classList.remove("llh-doc-detail-open");
  }

  function renderTimelineHtml(timeline = []) {
    if (!timeline.length) {
      return `<p class="llh-doc-muted" data-llh-doc-timeline-empty>No tracking events yet for this form.</p>`;
    }
    return `<ol class="llh-doc-timeline" aria-label="Document history">${timeline.map((row) => `
      <li class="llh-doc-timeline-item">
        <time datetime="${escapeHtml(row.at || "")}">${escapeHtml(formatLocalDateTime(row.at))}</time>
        <strong>${escapeHtml(row.summary || row.action || "Updated")}</strong>
        <span class="llh-doc-muted">${escapeHtml([row.actorRoleLabel, row.actorDisplay].filter(Boolean).join(" · "))}</span>
      </li>
    `).join("")}</ol>`;
  }

  function renderVersionsHtml(versions = [], { selectedVersionId = "", canOpenRecord = true } = {}) {
    if (!versions.length) {
      return `<p class="llh-doc-muted">No version history yet.</p>`;
    }
    return `<ul class="llh-doc-versions" aria-label="Version history">${versions.map((ver) => {
      const selected = String(ver.id) === String(selectedVersionId);
      const badge = ver.voided
        ? "VOIDED"
        : (ver.supersededByVersionId ? "SUPERSEDED" : (ver.isCurrent ? "CURRENT" : "HISTORICAL"));
      const signedLine = ver.signedAt
        ? `Signed ${formatLocalDateTime(ver.signedAt)}${ver.signerDisplayName ? ` by ${ver.signerDisplayName}` : ""}`
        : "Unsigned";
      const voidLine = ver.voided
        ? `Voided ${formatLocalDateTime(ver.voidedAt)}${ver.voidReason ? ` — ${ver.voidReason}` : ""}`
        : "";
      return `
        <li class="llh-doc-version ${selected ? "is-selected" : ""} ${ver.voided ? "is-voided" : ""}" data-version-id="${escapeHtml(ver.id)}">
          <div>
            <strong>Version ${escapeHtml(String(ver.versionNumber || ""))}</strong>
            <span class="llh-doc-badge" aria-label="Version state ${escapeHtml(badge)}">${escapeHtml(badge)}</span>
            <p class="llh-doc-muted">${escapeHtml(ver.stateLabel || "")} · ${escapeHtml(signedLine)}</p>
            ${voidLine ? `<p class="llh-doc-muted">${escapeHtml(voidLine)}</p>` : ""}
            ${ver.supersededByVersionId ? `<p class="llh-doc-muted">Replaced by a later version</p>` : ""}
          </div>
          ${canOpenRecord ? `<button type="button" class="ghost-button" data-llh-open-version-record="${escapeHtml(ver.id)}">Open record</button>` : ""}
        </li>`;
    }).join("")}</ul>`;
  }

  function renderDetailPanelHtml(detail, { surface = "director" } = {}) {
    const doc = detail.document || {};
    const sig = detail.signature || {};
    const recipient = detail.recipient || {};
    const tracking = detail.tracking || {};
    const caps = detail.capabilities || {};
    const isUpload = caps.isUploadedDocument || doc.presentation === "uploaded_document" || doc.sourceType === "upload";
    const who = recipient.recipientKind === "staff"
      ? (recipient.assigneeEmail || "Staff")
      : (doc.assigneeType === "program"
        ? "Program"
        : (recipient.childName || recipient.recipientLabel || "Recipient"));
    const trackingBits = [
      tracking.assignedAt ? `Assigned ${formatLocalDateTime(tracking.assignedAt)}` : "",
      !isUpload && tracking.viewedAt ? `Viewed ${formatLocalDateTime(tracking.viewedAt)}` : (!isUpload ? "Not opened yet" : ""),
      tracking.startedAt ? `Started ${formatLocalDateTime(tracking.startedAt)}` : "",
      tracking.submittedAt ? `Submitted ${formatLocalDateTime(tracking.submittedAt)}` : "",
      tracking.completedAt ? `Completed ${formatLocalDateTime(tracking.completedAt)}` : "",
      tracking.remindedAt ? `Reminded ${formatLocalDateTime(tracking.remindedAt)}` : "",
      doc.uploadedAt ? `Uploaded ${formatLocalDateTime(doc.uploadedAt)}` : "",
      doc.expiresAt ? `Expires ${formatLocalDate(doc.expiresAt)}${doc.expirationLabel ? ` · ${doc.expirationLabel}` : ""}` : "",
      tracking.archived ? "Archived (hidden from active queues; history kept)" : "",
    ].filter(Boolean);

    return `
      <div class="llh-doc-detail" data-llh-doc-detail-root="1" role="dialog" aria-modal="true" aria-labelledby="llhDocDetailTitle" data-presentation="${escapeHtml(isUpload ? "uploaded_document" : "llh_form")}">
        <div class="llh-doc-detail-sheet">
          <header class="llh-doc-detail-head">
            <div>
              <p class="llh-doc-kicker">${isUpload ? "Uploaded document" : "Document detail"}</p>
              <h2 id="llhDocDetailTitle">${escapeHtml(doc.title || "Form")}</h2>
              <p class="llh-doc-muted">${escapeHtml(doc.typeLabel || "")} · ${escapeHtml(doc.category || "")} · ${escapeHtml(doc.statusLabel || doc.status || "")}${doc.expirationLabel ? ` · ${escapeHtml(doc.expirationLabel)}` : ""}</p>
            </div>
            <button type="button" class="ghost-button" data-llh-doc-detail-close aria-label="Close document detail">Close</button>
          </header>
          <div class="llh-doc-detail-body">
            <section class="llh-doc-section" aria-labelledby="llhDocRecip">
              <h3 id="llhDocRecip">${isUpload ? "Linked to" : "Recipient"}</h3>
              <p><strong>${escapeHtml(who)}</strong>${recipient.classroomName ? ` · ${escapeHtml(recipient.classroomName)}` : ""}</p>
              <p class="llh-doc-muted">${isUpload ? "On file" : "Assigned"} ${escapeHtml(formatLocalDate(doc.assignedAt || doc.uploadedAt))}${doc.dueDate ? ` · Due ${escapeHtml(formatLocalDate(doc.dueDate))}` : ""}</p>
            </section>
            ${isUpload ? `
              <section class="llh-doc-section" aria-labelledby="llhDocFile">
                <h3 id="llhDocFile">File</h3>
                <p><strong>${escapeHtml(doc.fileName || "Uploaded file")}</strong></p>
                <p class="llh-doc-muted">${escapeHtml(doc.mimeType || "file")}${doc.mediaUrl ? "" : " · file reference missing"}</p>
                <p class="llh-doc-muted">This is an uploaded document, not an LLH completed form.</p>
              </section>
            ` : `
              <section class="llh-doc-section" aria-labelledby="llhDocSig">
                <h3 id="llhDocSig">Signature</h3>
                <p>${sig.required === false ? "Signature not required" : (sig.status === "signed"
                  ? `<strong>Signed electronically</strong> by ${escapeHtml(sig.signerDisplayName || "Signer")} (${escapeHtml(sig.signerRoleLabel || sig.signerRole || "")})`
                  : "<strong>Awaiting signature</strong>")}</p>
                ${sig.signedAt ? `<p class="llh-doc-muted">${escapeHtml(formatLocalDateTime(sig.signedAt))} · ${escapeHtml(sig.methodLabel || "")}${sig.versionSigned ? ` · Version ${escapeHtml(String(sig.versionSigned))}` : ""}</p>` : ""}
              </section>
            `}
            <section class="llh-doc-section" aria-labelledby="llhDocTrack">
              <h3 id="llhDocTrack">Tracking</h3>
              <ul class="llh-doc-track-list">${trackingBits.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>
            </section>
            ${!isUpload ? `
              <section class="llh-doc-section" aria-labelledby="llhDocVer">
                <h3 id="llhDocVer">Versions</h3>
                <p class="llh-doc-muted">Current version ${escapeHtml(String(doc.currentVersionNumber || 1))}. Opening an older signed version shows exactly what was signed.</p>
                ${renderVersionsHtml(detail.versions || [], {
                  selectedVersionId: doc.currentVersionId,
                  canOpenRecord: caps.canPrint !== false,
                })}
              </section>
            ` : ""}
            ${caps.canViewAudit ? `
              <section class="llh-doc-section" aria-labelledby="llhDocHist">
                <h3 id="llhDocHist">History</h3>
                ${renderTimelineHtml(detail.timeline || [])}
              </section>
            ` : (surface === "family" ? "" : `<p class="llh-doc-muted">Full audit history is available to Owners and Directors.</p>`)}
            ${!isUpload && doc.bodyPreview ? `
              <section class="llh-doc-section" aria-labelledby="llhDocBody">
                <h3 id="llhDocBody">Current form text</h3>
                <pre class="llh-doc-pre">${escapeHtml(doc.bodyPreview)}</pre>
              </section>
            ` : ""}
          </div>
          <footer class="llh-doc-detail-foot">
            ${isUpload
              ? `<button type="button" class="primary-button" data-llh-doc-open-upload ${!doc.mediaUrl ? "disabled" : ""} data-media-url="${escapeHtml(doc.mediaUrl || "")}">Preview / download file</button>`
              : `<button type="button" class="primary-button" data-llh-doc-print-current ${caps.canPrint === false ? "disabled" : ""}>Print / download completed record</button>`}
            ${caps.canCorrectReissue ? `<button type="button" class="ghost-button" data-llh-doc-correct-reissue>Correct / reissue</button>` : ""}
            ${caps.canVoid ? `<button type="button" class="ghost-button llh-doc-void-btn" data-llh-doc-void>Void signed version</button>` : ""}
            <button type="button" class="ghost-button" data-llh-doc-detail-close>Done</button>
          </footer>
        </div>
      </div>`;
  }

  /**
   * Professional completed-record HTML for print window.
   * Never dumps raw IDs, hashes, IP, audit JSON, or base64 as text.
   */
  function renderCompletedRecordPrintHtml(record = {}) {
    const markers = Array.isArray(record.markers) ? record.markers : [];
    const sig = record.signature || null;
    const answers = Array.isArray(record.answers) ? record.answers : [];
    const markerBanner = markers.length
      ? `<div class="llh-print-banner" role="status">${markers.map((m) => escapeHtml(m)).join(" · ")}</div>`
      : "";
    const voidBlock = record.voided
      ? `<p class="llh-print-void"><strong>VOIDED</strong>${record.voidedAt ? ` · ${escapeHtml(formatLocalDateTime(record.voidedAt))}` : ""}${record.voidReason ? ` · Reason: ${escapeHtml(record.voidReason)}` : ""}</p>`
      : "";

    let signatureBlock = "<p class=\"llh-print-muted\">Not signed</p>";
    if (sig) {
      const method = sig.method || "";
      let markHtml = "";
      if (method === "drawn" && sig.drawnSignatureDataUrl) {
        markHtml = `<div class="llh-print-drawn"><img src="${escapeHtml(sig.drawnSignatureDataUrl)}" alt="Drawn electronic signature" width="280" height="100" /></div>`;
      } else if (method === "typed" && sig.typedSignature) {
        markHtml = `<p class="llh-print-typed" aria-label="Typed electronic signature">${escapeHtml(sig.typedSignature)}</p>`;
      } else if (method === "acknowledgment_text") {
        markHtml = `<p class="llh-print-ack">${escapeHtml(sig.typedSignature || sig.signerDisplayName || "Acknowledged")}</p>
          <p class="llh-print-muted">${escapeHtml(sig.acknowledgmentText || "Historical acknowledgment method")}</p>`;
      } else {
        markHtml = `<p class="llh-print-typed">${escapeHtml(sig.signerDisplayName || "Signed")}</p>`;
      }
      signatureBlock = `
        <div class="llh-print-sig">
          <p><strong>${escapeHtml(sig.indicator || "Signed Electronically")}</strong></p>
          ${markHtml}
          <p>${escapeHtml(sig.signerDisplayName || "")}${sig.signerRoleLabel ? ` · ${escapeHtml(sig.signerRoleLabel)}` : ""}</p>
          <p class="llh-print-muted">${escapeHtml(formatLocalDateTime(sig.signedAt))} · ${escapeHtml(sig.methodLabel || "")}</p>
        </div>`;
    }

    const whoLine = [
      record.childName ? `Child: ${record.childName}` : "",
      record.staffEmail ? `Staff: ${record.staffEmail}` : "",
      record.recipientLabel && !record.childName ? record.recipientLabel : "",
      record.classroomName ? `Classroom: ${record.classroomName}` : "",
    ].filter(Boolean).join(" · ");

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(record.title || "Completed form")}</title>
  <style>
    @page { margin: 0.6in; }
    body { font-family: "Source Serif 4", "Iowan Old Style", Georgia, serif; color: #24312f; line-height: 1.55; padding: 28px; max-width: 760px; margin: 0 auto; background: #fff; }
    .brand { font-family: "Segoe UI", system-ui, sans-serif; color: #2f5f5c; font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; font-weight: 700; }
    h1 { font-size: 26px; margin: 8px 0 6px; color: #1f3d3a; }
    h2 { font-size: 16px; margin: 22px 0 8px; color: #2f5f5c; border-bottom: 1px solid #d5e0dc; padding-bottom: 4px; font-family: "Segoe UI", system-ui, sans-serif; }
    .meta { color: #5a6663; font-size: 13px; margin: 0 0 8px; font-family: "Segoe UI", system-ui, sans-serif; }
    .llh-print-banner { background: #f4efe4; border: 1px solid #d9c9a8; color: #5a4a28; padding: 10px 12px; margin: 12px 0; font-family: "Segoe UI", system-ui, sans-serif; font-weight: 700; }
    .llh-print-void { color: #8a2f2f; font-family: "Segoe UI", system-ui, sans-serif; }
    .body { white-space: pre-wrap; font-size: 14px; margin: 0 0 16px; }
    .answers { list-style: none; padding: 0; margin: 0; }
    .answers li { display: grid; grid-template-columns: 1fr 1.2fr; gap: 8px; padding: 6px 0; border-bottom: 1px solid #e6ecea; font-family: "Segoe UI", system-ui, sans-serif; font-size: 13px; }
    .llh-print-typed { font-family: "Segoe Script", "Brush Script MT", cursive; font-size: 28px; margin: 6px 0; }
    .llh-print-ack { font-size: 16px; font-weight: 600; }
    .llh-print-drawn img { max-width: 280px; height: auto; border-bottom: 1px solid #c5d0cd; display: block; }
    .llh-print-muted { color: #6a7572; font-size: 12px; font-family: "Segoe UI", system-ui, sans-serif; }
    footer { margin-top: 28px; padding-top: 10px; border-top: 1px solid #d5e0dc; font-size: 11px; color: #6a7572; font-family: "Segoe UI", system-ui, sans-serif; }
  </style>
</head>
<body>
  <div class="brand">${escapeHtml(record.heading || "Little Learner Hub")}${record.programName ? ` · ${escapeHtml(record.programName)}` : ""}</div>
  <h1>${escapeHtml(record.title || "Form")}</h1>
  <p class="meta">${escapeHtml(whoLine)}</p>
  <p class="meta">Version ${escapeHtml(String(record.versionNumber || 1))}${record.completedAt ? ` · Completed ${escapeHtml(formatLocalDateTime(record.completedAt))}` : ""}${record.category ? ` · ${escapeHtml(record.category)}` : ""}</p>
  ${markerBanner}
  ${voidBlock}
  <h2>Form content</h2>
  <div class="body">${escapeHtml(record.bodyText || "")}</div>
  ${answers.length ? `<h2>Completed answers</h2><ul class="answers">${answers.map((a) => `<li><span>${escapeHtml(a.label)}</span><strong>${escapeHtml(a.value)}</strong></li>`).join("")}</ul>` : ""}
  <h2>Signature Record</h2>
  ${signatureBlock}
  <footer>${escapeHtml(record.footerNote || "Electronic Signature · Signature Record")}</footer>
</body>
</html>`;
  }

  function printCompletedRecord(record) {
    const html = renderCompletedRecordPrintHtml(record || {});
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      // Fallback: inject temporary iframe
      const iframe = document.createElement("iframe");
      iframe.setAttribute("aria-hidden", "true");
      iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
      document.body.appendChild(iframe);
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      doc.open();
      doc.write(html);
      doc.close();
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => iframe.remove(), 1000);
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    // Release large drawn data URI from opener scope ASAP (html already written).
    setTimeout(() => {
      try { printWindow.print(); } catch (_e) { /* ignore */ }
    }, 50);
  }

  async function fetchJson(url, headers) {
    const res = await fetch(url, { headers, cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(json.error || `Request failed (${res.status})`);
      err.status = res.status;
      err.code = json.code;
      throw err;
    }
    return json;
  }

  async function openCanonicalDocumentDetail(options = {}) {
    const {
      documentId,
      assigneeType = "",
      surface = "director",
      getStaffHeaders,
      getFamilyHeaders,
      mode = "detail",
      versionId = "",
    } = options;
    if (!documentId) throw new Error("Missing document id.");

    if (mode === "print" || mode === "completed") {
      return openCompletedRecord({
        documentId,
        assigneeType,
        surface,
        versionId,
        getStaffHeaders,
        getFamilyHeaders,
      });
    }

    closeDetailPanel();
    let detail;
    if (surface === "family") {
      // Family uses completed-record + public versions from /me payload path via completed endpoint.
      const headers = typeof getFamilyHeaders === "function" ? await getFamilyHeaders() : {};
      const recordPayload = await fetchJson(
        `/api/family-hub/documents/${encodeURIComponent(documentId)}/completed-record${versionId ? `?versionId=${encodeURIComponent(versionId)}` : ""}`,
        headers,
      );
      // Build a lightweight family detail (no audit).
      detail = {
        document: {
          id: documentId,
          title: recordPayload.record?.title,
          category: recordPayload.record?.category,
          typeLabel: "Family form",
          statusLabel: recordPayload.record?.signature ? "Completed" : "On file",
          assignedAt: "",
          dueDate: "",
          currentVersionNumber: recordPayload.record?.versionNumber,
          currentVersionId: recordPayload.record?.versionId,
          bodyPreview: recordPayload.record?.bodyText?.slice?.(0, 4000) || "",
        },
        recipient: {
          recipientKind: "child",
          childName: recordPayload.record?.childName,
          recipientLabel: recordPayload.record?.recipientLabel,
        },
        signature: recordPayload.record?.signature
          ? {
            required: true,
            status: "signed",
            signerDisplayName: recordPayload.record.signature.signerDisplayName,
            signerRoleLabel: recordPayload.record.signature.signerRoleLabel,
            signedAt: recordPayload.record.signature.signedAt,
            methodLabel: recordPayload.record.signature.methodLabel,
            versionSigned: recordPayload.record.versionNumber,
          }
          : { required: true, status: "unsigned" },
        versions: [],
        tracking: { completedAt: recordPayload.record?.completedAt },
        timeline: [],
        capabilities: { canViewAudit: false, canPrint: true, canViewVersions: true },
        _familyRecord: recordPayload.record,
      };
    } else {
      const headers = typeof getStaffHeaders === "function" ? await getStaffHeaders() : {};
      const qs = new URLSearchParams();
      if (assigneeType) qs.set("assigneeType", assigneeType);
      detail = await fetchJson(
        `/api/program-forms/documents/${encodeURIComponent(documentId)}/detail?${qs.toString()}`,
        headers,
      );
    }

    const wrap = document.createElement("div");
    wrap.innerHTML = renderDetailPanelHtml(detail, { surface });
    const root = wrap.firstElementChild;
    document.body.appendChild(root);
    document.body.classList.add("llh-doc-detail-open");
    const closeBtn = root.querySelector("[data-llh-doc-detail-close]");
    if (closeBtn) closeBtn.focus();

    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        teardown();
      }
    };
    function teardown() {
      document.removeEventListener("keydown", onKey);
      closeDetailPanel();
    }
    document.addEventListener("keydown", onKey);
    root.addEventListener("click", (event) => {
      if (event.target.closest("[data-llh-doc-detail-close]")) {
        teardown();
        return;
      }
      const uploadOpen = event.target.closest("[data-llh-doc-open-upload]");
      if (uploadOpen) {
        event.preventDefault();
        const mediaUrl = uploadOpen.getAttribute("data-media-url")
          || detail.document?.mediaUrl
          || "";
        if (!mediaUrl) {
          if (typeof global.showActionFeedback === "function") {
            global.showActionFeedback("No file is attached to this record.");
          }
          return;
        }
        window.open(mediaUrl, "_blank", "noopener,noreferrer");
        return;
      }
      const printBtn = event.target.closest("[data-llh-doc-print-current]");
      if (printBtn) {
        event.preventDefault();
        openCompletedRecord({
          documentId,
          assigneeType,
          surface,
          versionId: detail.document?.currentVersionId || "",
          getStaffHeaders,
          getFamilyHeaders,
          familyRecordCache: detail._familyRecord,
        }).catch((err) => {
          if (typeof global.showActionFeedback === "function") {
            global.showActionFeedback(err.message || "Could not open completed record.");
          }
        });
        return;
      }
      const verBtn = event.target.closest("[data-llh-open-version-record]");
      if (verBtn) {
        event.preventDefault();
        openCompletedRecord({
          documentId,
          assigneeType,
          surface,
          versionId: verBtn.getAttribute("data-llh-open-version-record") || "",
          getStaffHeaders,
          getFamilyHeaders,
        }).catch((err) => {
          if (typeof global.showActionFeedback === "function") {
            global.showActionFeedback(err.message || "Could not open version record.");
          }
        });
        return;
      }

      // Wave 8 — Owner/Director void / correct-reissue from the same detail panel.
      const voidBtn = event.target.closest("[data-llh-doc-void]");
      if (voidBtn) {
        event.preventDefault();
        if (!detail.capabilities?.canVoid) return;
        const reason = window.prompt("Void reason (required). This keeps the signed history but marks it VOIDED.");
        if (reason == null) return;
        const trimmed = String(reason || "").trim();
        if (!trimmed) {
          if (typeof global.showActionFeedback === "function") {
            global.showActionFeedback("A void reason is required.");
          }
          return;
        }
        voidBtn.disabled = true;
        voidBtn.textContent = "Voiding…";
        (async () => {
          try {
            const headers = typeof getStaffHeaders === "function" ? await getStaffHeaders() : {};
            const res = await fetch("/api/program-forms/versions/void", {
              method: "POST",
              headers: { ...headers, "Content-Type": "application/json", Accept: "application/json" },
              body: JSON.stringify({
                documentId,
                assigneeType: assigneeType || detail.document?.assigneeType || "child",
                voidReason: trimmed,
              }),
              cache: "no-store",
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json.error || "Could not void signed version.");
            if (typeof global.showActionFeedback === "function") {
              global.showActionFeedback("Signed version voided. History kept.");
            }
            teardown();
            if (typeof options.onChanged === "function") options.onChanged({ action: "void", document: json.document });
            else {
              await openCanonicalDocumentDetail({
                documentId,
                assigneeType: assigneeType || detail.document?.assigneeType || "",
                surface,
                getStaffHeaders,
                getFamilyHeaders,
                onChanged: options.onChanged,
              });
            }
          } catch (err) {
            voidBtn.disabled = false;
            voidBtn.textContent = "Void signed version";
            if (typeof global.showActionFeedback === "function") {
              global.showActionFeedback(err.message || "Could not void signed version.");
            }
          }
        })();
        return;
      }

      const correctBtn = event.target.closest("[data-llh-doc-correct-reissue]");
      if (correctBtn) {
        event.preventDefault();
        if (!detail.capabilities?.canCorrectReissue) return;
        const reason = window.prompt("Correction reason (required). Creates a new unsigned version and voids the prior signed one.");
        if (reason == null) return;
        const trimmed = String(reason || "").trim();
        if (!trimmed) {
          if (typeof global.showActionFeedback === "function") {
            global.showActionFeedback("A correction reason is required.");
          }
          return;
        }
        const nextBody = window.prompt(
          "Updated form text for the new version (edit as needed):",
          String(detail.document?.bodyPreview || ""),
        );
        if (nextBody == null) return;
        correctBtn.disabled = true;
        correctBtn.textContent = "Reissuing…";
        (async () => {
          try {
            const headers = typeof getStaffHeaders === "function" ? await getStaffHeaders() : {};
            const res = await fetch("/api/program-forms/versions/supersede", {
              method: "POST",
              headers: { ...headers, "Content-Type": "application/json", Accept: "application/json" },
              body: JSON.stringify({
                documentId,
                assigneeType: assigneeType || detail.document?.assigneeType || "child",
                reason: trimmed,
                nextBody: String(nextBody || ""),
                voidPrior: true,
              }),
              cache: "no-store",
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json.error || "Could not correct / reissue.");
            if (typeof global.showActionFeedback === "function") {
              global.showActionFeedback("New version created. Prior signature voided — recipient must resign.");
            }
            teardown();
            if (typeof options.onChanged === "function") options.onChanged({ action: "supersede", document: json.document });
            else {
              await openCanonicalDocumentDetail({
                documentId,
                assigneeType: assigneeType || detail.document?.assigneeType || "",
                surface,
                getStaffHeaders,
                getFamilyHeaders,
                onChanged: options.onChanged,
              });
            }
          } catch (err) {
            correctBtn.disabled = false;
            correctBtn.textContent = "Correct / reissue";
            if (typeof global.showActionFeedback === "function") {
              global.showActionFeedback(err.message || "Could not correct / reissue.");
            }
          }
        })();
      }
    });
    return detail;
  }

  async function openCompletedRecord(options = {}) {
    const {
      documentId,
      assigneeType = "",
      surface = "director",
      versionId = "",
      getStaffHeaders,
      getFamilyHeaders,
      familyRecordCache = null,
    } = options;
    let record = familyRecordCache;
    if (!record) {
      if (surface === "family") {
        const headers = typeof getFamilyHeaders === "function" ? await getFamilyHeaders() : {};
        const qs = versionId ? `?versionId=${encodeURIComponent(versionId)}` : "";
        const payload = await fetchJson(
          `/api/family-hub/documents/${encodeURIComponent(documentId)}/completed-record${qs}`,
          headers,
        );
        record = payload.record;
      } else {
        const headers = typeof getStaffHeaders === "function" ? await getStaffHeaders() : {};
        const qs = new URLSearchParams();
        if (assigneeType) qs.set("assigneeType", assigneeType);
        if (versionId) qs.set("versionId", versionId);
        const payload = await fetchJson(
          `/api/program-forms/documents/${encodeURIComponent(documentId)}/completed-record?${qs.toString()}`,
          headers,
        );
        record = payload.record;
      }
    }
    printCompletedRecord(record);
    // Help GC release drawn payload reference.
    if (record && record.signature) {
      record = { ...record, signature: { ...record.signature, drawnSignatureDataUrl: undefined } };
    }
    return record;
  }

  const api = {
    openCanonicalDocumentDetail,
    openCompletedRecord,
    printCompletedRecord,
    renderCompletedRecordPrintHtml,
    renderDetailPanelHtml,
    formatLocalDateTime,
    formatLocalDate,
    closeDetailPanel,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.LLHFormsDocumentDetail = api;
})(typeof window !== "undefined" ? window : global);
