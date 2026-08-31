/**
 * Binder Builder — URL validation and print-safe QR SVG generation.
 *
 * Rejects malformed URLs. Does not scrape third-party media.
 * Uses the audited `qrcode` package in Node and the vendored browser build in the UI.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LLHBinderBuilderQr = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const DEFAULT_SIZE = 168;
  const DEFAULT_MARGIN = 2;

  /** @type {Map<string, string>} */
  const svgCache = new Map();

  /**
   * @param {unknown} raw
   * @returns {{ ok: boolean, url: string, hostname: string, error: string }}
   */
  function validateBinderUrl(raw) {
    const input = String(raw == null ? "" : raw).trim();
    if (!input) {
      return { ok: false, url: "", hostname: "", error: "URL is empty." };
    }
    if (/\s/.test(input)) {
      return { ok: false, url: "", hostname: "", error: "URL must not contain spaces." };
    }
    let parsed;
    try {
      parsed = new URL(input);
    } catch {
      return { ok: false, url: "", hostname: "", error: "URL is malformed." };
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return { ok: false, url: "", hostname: "", error: "Only http(s) URLs are allowed." };
    }
    if (!parsed.hostname || parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      return { ok: false, url: "", hostname: "", error: "URL hostname is not valid for print resources." };
    }
    // Prefer https for customer-facing QR links; allow http but warn via ok:true + note?
    // Spec: permit generic HTTPS URLs. Soft-accept http for owner-configured resources.
    return {
      ok: true,
      url: parsed.toString(),
      hostname: parsed.hostname,
      error: "",
    };
  }

  function loadNodeQrcode() {
    try {
      if (typeof require === "function") return require("qrcode");
    } catch {
      return null;
    }
    return null;
  }

  function loadBrowserQrcode() {
    if (root && root.QRCode) return root.QRCode;
    if (typeof globalThis !== "undefined" && globalThis.QRCode) return globalThis.QRCode;
    return null;
  }

  /**
   * @param {string} url
   * @param {{ size?: number, margin?: number }} [options]
   * @returns {Promise<string>}
   */
  function renderQrSvg(url, options = {}) {
    const validated = validateBinderUrl(url);
    if (!validated.ok) {
      return Promise.reject(new Error(validated.error || "Invalid URL"));
    }
    const size = Math.max(120, Math.min(320, Number(options.size) || DEFAULT_SIZE));
    const margin = Number.isFinite(Number(options.margin)) ? Number(options.margin) : DEFAULT_MARGIN;
    const cacheKey = `${validated.url}|${size}|${margin}`;
    if (svgCache.has(cacheKey)) {
      return Promise.resolve(svgCache.get(cacheKey) || "");
    }

    const nodeLib = loadNodeQrcode();
    if (nodeLib && typeof nodeLib.toString === "function") {
      return nodeLib
        .toString(validated.url, {
          type: "svg",
          errorCorrectionLevel: "M",
          margin,
          width: size,
          color: { dark: "#1a1a1a", light: "#ffffff" },
        })
        .then((svg) => {
          const safe = String(svg || "").trim();
          if (!safe.includes("<svg")) throw new Error("QR generation failed.");
          svgCache.set(cacheKey, safe);
          return safe;
        });
    }

    const browserLib = loadBrowserQrcode();
    if (browserLib && typeof browserLib.toString === "function") {
      return new Promise((resolve, reject) => {
        browserLib.toString(
          validated.url,
          {
            type: "svg",
            errorCorrectionLevel: "M",
            margin,
            width: size,
            color: { dark: "#1a1a1a", light: "#ffffff" },
          },
          (error, svg) => {
            if (error) {
              reject(error);
              return;
            }
            const safe = String(svg || "").trim();
            if (!safe.includes("<svg")) {
              reject(new Error("QR generation failed."));
              return;
            }
            svgCache.set(cacheKey, safe);
            resolve(safe);
          },
        );
      });
    }

    return Promise.reject(new Error("QR library is unavailable."));
  }

  /**
   * Synchronous helper for tests when Node qrcode is present.
   * @param {string} url
   * @param {{ size?: number, margin?: number }} [options]
   */
  function renderQrSvgSync(url, options = {}) {
    const validated = validateBinderUrl(url);
    if (!validated.ok) throw new Error(validated.error || "Invalid URL");
    const nodeLib = loadNodeQrcode();
    if (!nodeLib || typeof nodeLib.toString !== "function") {
      throw new Error("Sync QR requires the Node qrcode package.");
    }
    const size = Math.max(120, Math.min(320, Number(options.size) || DEFAULT_SIZE));
    const margin = Number.isFinite(Number(options.margin)) ? Number(options.margin) : DEFAULT_MARGIN;
    // qrcode's toString returns a Promise in modern API — use create + svg-tag renderer sync path.
    // Prefer async in production; sync path uses deasync-free approach via cached only.
    throw new Error("Use renderQrSvg (async). Sync helper is not available.");
  }

  function clearQrCache() {
    svgCache.clear();
  }

  /**
   * Build a print-safe QR figure HTML fragment. Returns empty string when invalid/missing.
   * @param {{ url?: string, label?: string, title?: string, svg?: string }} options
   */
  function qrFigureHtml(options = {}) {
    const url = String(options.url || "").trim();
    const svg = String(options.svg || "").trim();
    const label = String(options.label || "Scan for Resource").trim();
    const title = String(options.title || "").trim();
    if (!url || !svg || !svg.includes("<svg")) return "";
    const validated = validateBinderUrl(url);
    if (!validated.ok) return "";
    const esc = (value) => String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
    // Customer print: QR + short scan cue only — never print the raw URL string.
    return [
      `<figure class="bb-qr-figure">`,
      title ? `<figcaption class="bb-qr-title">${esc(title)}</figcaption>` : "",
      `<div class="bb-qr-code" aria-hidden="true">${svg}</div>`,
      `<p class="bb-qr-label">${esc(label)}</p>`,
      `</figure>`,
    ].filter(Boolean).join("");
  }

  return {
    validateBinderUrl,
    renderQrSvg,
    renderQrSvgSync,
    clearQrCache,
    qrFigureHtml,
    DEFAULT_SIZE,
    DEFAULT_MARGIN,
  };
});
