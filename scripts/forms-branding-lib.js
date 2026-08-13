/**
 * Shared Forms branding (program-level + per-form overrides).
 * Reuses Program Settings name/address/phone/email/logo — does not invent a second logo store.
 * Snapshot branding onto assigned documents so later logo/name changes do not rewrite history.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.FormsBrandingLib = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MAX_LOGO_CHARS = 900000; // ~base64 ceiling for 512KB images

  function cleanText(value, max) {
    const limit = Number.isFinite(Number(max)) ? Number(max) : 200;
    return String(value || "")
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      .replace(/on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/<\/?[^>]+>/g, "")
      .trim()
      .slice(0, limit);
  }

  function normalizeHeaderAlign(raw) {
    const key = String(raw || "").trim().toLowerCase();
    return key === "center" ? "center" : "left";
  }

  /** Program-level Forms branding defaults (stored under programSettings.formsBranding). */
  function normalizeProgramFormsBranding(raw) {
    const src = raw && typeof raw === "object" ? raw : {};
    return {
      showLogo: src.showLogo !== false,
      showProgramName: src.showProgramName !== false,
      showContact: src.showContact !== false,
      headerAlign: normalizeHeaderAlign(src.headerAlign),
      // Architected for future account/plan rules — do not invent billing entitlements here.
      showLlhFooter: src.showLlhFooter !== false,
      llhFooterControlledByPlan: true
    };
  }

  /** Per-form branding override (does not delete program branding). */
  function normalizeFormBrandingOverride(raw) {
    const src = raw && typeof raw === "object" ? raw : {};
    const hideAll = src.hideAll === true || src.hideBranding === true;
    return {
      inherit: src.inherit !== false,
      hideAll: hideAll,
      showLogo: hideAll ? false : src.showLogo !== false,
      showProgramName: hideAll ? false : src.showProgramName !== false,
      showContact: hideAll ? false : src.showContact !== false,
      headerAlign: normalizeHeaderAlign(src.headerAlign),
      showLlhFooter: hideAll ? false : src.showLlhFooter !== false
    };
  }

  /**
   * Resolve live branding for Preview / new Print from program settings + form override.
   */
  function resolveFormsBranding(opts) {
    const options = opts && typeof opts === "object" ? opts : {};
    const settings = options.programSettings && typeof options.programSettings === "object"
      ? options.programSettings
      : {};
    const programDefaults = normalizeProgramFormsBranding(settings.formsBranding || {});
    const override = options.formOverride
      ? normalizeFormBrandingOverride(options.formOverride)
      : {
        inherit: true,
        hideAll: false,
        showLogo: programDefaults.showLogo,
        showProgramName: programDefaults.showProgramName,
        showContact: programDefaults.showContact,
        headerAlign: programDefaults.headerAlign,
        showLlhFooter: programDefaults.showLlhFooter
      };

    const showLogo = override.inherit
      ? (override.hideAll ? false : programDefaults.showLogo && override.showLogo !== false)
      : Boolean(override.showLogo);
    const showProgramName = override.inherit
      ? (override.hideAll ? false : programDefaults.showProgramName && override.showProgramName !== false)
      : Boolean(override.showProgramName);
    const showContact = override.inherit
      ? (override.hideAll ? false : programDefaults.showContact && override.showContact !== false)
      : Boolean(override.showContact);
    const showLlhFooter = override.inherit
      ? (override.hideAll ? false : programDefaults.showLlhFooter && override.showLlhFooter !== false)
      : Boolean(override.showLlhFooter);

    const programName = cleanText(
      settings.programName || settings.businessName || options.programDisplayName || "",
      160
    );
    let logoDataUrl = String(settings.logoDataUrl || "").trim();
    if (logoDataUrl && !/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(logoDataUrl)) {
      logoDataUrl = "";
    }
    if (logoDataUrl.length > MAX_LOGO_CHARS) logoDataUrl = "";

    return {
      programName: programName,
      address: cleanText(settings.address || "", 240),
      phone: cleanText(settings.contactPhone || settings.phone || "", 60),
      email: cleanText(settings.contactEmail || settings.email || "", 120),
      website: cleanText(settings.website || "", 160),
      logoDataUrl: showLogo ? logoDataUrl : "",
      showLogo: Boolean(showLogo && logoDataUrl),
      showProgramName: Boolean(showProgramName && programName),
      showContact: showContact,
      headerAlign: override.headerAlign || programDefaults.headerAlign,
      showLlhFooter: showLlhFooter,
      llhFooterText: "Created with Little Learner Hub"
    };
  }

  /**
   * Compact branding snapshot for assigned/signed documents.
   */
  function snapshotFormsBranding(resolved) {
    const r = resolved && typeof resolved === "object" ? resolved : {};
    return {
      programName: cleanText(r.programName || "", 160),
      address: cleanText(r.address || "", 240),
      phone: cleanText(r.phone || "", 60),
      email: cleanText(r.email || "", 120),
      website: cleanText(r.website || "", 160),
      logoDataUrl: r.showLogo ? String(r.logoDataUrl || "").slice(0, MAX_LOGO_CHARS) : "",
      showLogo: Boolean(r.showLogo && r.logoDataUrl),
      showProgramName: Boolean(r.showProgramName),
      showContact: r.showContact !== false,
      headerAlign: normalizeHeaderAlign(r.headerAlign),
      showLlhFooter: r.showLlhFooter !== false,
      llhFooterText: cleanText(r.llhFooterText || "Created with Little Learner Hub", 80),
      snapshottedAt: new Date().toISOString()
    };
  }

  function brandingContactLine(branding) {
    const b = branding && typeof branding === "object" ? branding : {};
    const parts = [];
    if (b.showContact !== false) {
      if (b.address) parts.push(b.address);
      if (b.phone) parts.push(b.phone);
      if (b.email) parts.push(b.email);
      if (b.website) parts.push(b.website);
    }
    return parts.join(" · ");
  }

  /** Plain-text header for printTextDocument / blank packets. */
  function renderBrandingPlainHeader(branding, opts) {
    const b = branding && typeof branding === "object" ? branding : {};
    const options = opts && typeof opts === "object" ? opts : {};
    const lines = [];
    if (b.showLogo && b.logoDataUrl) {
      lines.push("[Program logo on file]");
    }
    if (b.showProgramName && b.programName) lines.push(b.programName);
    if (options.formTitle) lines.push(String(options.formTitle));
    const contact = brandingContactLine(b);
    if (contact) lines.push(contact);
    return lines.join("\n");
  }

  /**
   * Prefer document branding snapshot for historical print/preview.
   * Falls back to live resolve only when no snapshot exists (legacy docs).
   */
  function brandingForDocument(doc, liveResolved) {
    const snap = doc && typeof doc === "object" ? (doc.formsBranding || doc.brandingSnapshot) : null;
    if (snap && typeof snap === "object" && (snap.snapshottedAt || snap.programName || snap.logoDataUrl)) {
      return {
        programName: cleanText(snap.programName || "", 160),
        address: cleanText(snap.address || "", 240),
        phone: cleanText(snap.phone || "", 60),
        email: cleanText(snap.email || "", 120),
        website: cleanText(snap.website || "", 160),
        logoDataUrl: String(snap.logoDataUrl || "").slice(0, MAX_LOGO_CHARS),
        showLogo: Boolean(snap.showLogo && snap.logoDataUrl),
        showProgramName: snap.showProgramName !== false && Boolean(snap.programName),
        showContact: snap.showContact !== false,
        headerAlign: normalizeHeaderAlign(snap.headerAlign),
        showLlhFooter: snap.showLlhFooter !== false,
        llhFooterText: cleanText(snap.llhFooterText || "Created with Little Learner Hub", 80),
        fromSnapshot: true
      };
    }
    const live = liveResolved && typeof liveResolved === "object" ? liveResolved : {};
    return Object.assign({}, live, { fromSnapshot: false });
  }

  return {
    MAX_LOGO_CHARS: MAX_LOGO_CHARS,
    normalizeProgramFormsBranding: normalizeProgramFormsBranding,
    normalizeFormBrandingOverride: normalizeFormBrandingOverride,
    resolveFormsBranding: resolveFormsBranding,
    snapshotFormsBranding: snapshotFormsBranding,
    brandingContactLine: brandingContactLine,
    renderBrandingPlainHeader: renderBrandingPlainHeader,
    brandingForDocument: brandingForDocument
  };
});
