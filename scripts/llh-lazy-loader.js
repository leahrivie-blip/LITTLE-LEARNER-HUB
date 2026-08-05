/**
 * On-demand script packs for Little Learner Hub.
 * Keeps Teaching Kit, Admin, analytics, and heavy exporters off the critical boot path.
 */
(function (root) {
  "use strict";

  const VERSION = "20260805-admin-control-center-r9";
  const loadedUrls = new Set();
  const loading = new Map();
  const packReady = new Map();

  function withVersion(url) {
    if (!url || url.includes("?") || url.startsWith("/api/")) return url;
    return `${url}?v=${VERSION}`;
  }

  const PACKS = {
    teachingKit: [
      "scripts/teaching-kit-mapper.js",
      "scripts/teaching-kit.js",
      "scripts/teaching-kit-status.js",
      "scripts/teaching-kit-print.js",
      "scripts/teaching-kit-viewer.js",
      "scripts/teaching-kit-enrichment.js",
      "scripts/teaching-kit-upgrade-workspace.js",
      "scripts/teaching-kit-ai-lesson-teacher.js",
      "scripts/teaching-kit-reusable-library.js",
      "scripts/teaching-kit-ai-teacher-assistant.js",
      "scripts/teaching-kit-curriculum-director.js",
      "scripts/teaching-kit-curriculum-director-ui.js",
      "scripts/teaching-kit-quality-review.js",
      "scripts/teaching-kit-quality-review-ui.js",
      "scripts/teaching-kit-enrichment-editor.js",
      "scripts/teaching-kit-authoring.js",
    ],
    curriculumAdmin: [
      "scripts/curriculum-sentinel.js",
      "scripts/curriculum-import-enrich.js",
      "scripts/curriculum-lesson-import-parser.js",
      "scripts/curriculum-lesson-import-v4.js",
      "scripts/curriculum-import-preview.js",
    ],
    admin: [
      "scripts/admin-analytics-diagnostics.js",
      "admin-workspace.js",
      "admin-insights.js",
      "scripts/admin-control-center.js",
    ],
    exports: [
      "scripts/llh-lesson-docx.js",
      "scripts/lesson-plan-weekly-export.js",
      "scripts/llh-teacher-weekly-planner.js",
      "scripts/trial-curriculum-exports.js",
    ],
    comms: [
      "comms-center.js",
    ],
  };

  // Admin curriculum tooling needs Teaching Kit + import tools together.
  PACKS.adminSurface = []
    .concat(PACKS.admin, PACKS.curriculumAdmin, PACKS.teachingKit);

  function loadScript(url) {
    const finalUrl = withVersion(url);
    if (loadedUrls.has(finalUrl) || document.querySelector(`script[data-llh-lazy="${finalUrl}"]`)) {
      loadedUrls.add(finalUrl);
      return Promise.resolve();
    }
    if (loading.has(finalUrl)) return loading.get(finalUrl);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = finalUrl;
      script.async = false;
      script.dataset.llhLazy = finalUrl;
      script.onload = () => {
        loadedUrls.add(finalUrl);
        loading.delete(finalUrl);
        resolve();
      };
      script.onerror = () => {
        loading.delete(finalUrl);
        reject(new Error(`Failed to load ${finalUrl}`));
      };
      document.head.appendChild(script);
    });
    loading.set(finalUrl, promise);
    return promise;
  }

  async function ensure(packName) {
    const name = String(packName || "").trim();
    if (!name) return;
    if (packReady.get(name) === "ready") return;
    if (packReady.get(name) instanceof Promise) return packReady.get(name);
    const urls = PACKS[name];
    if (!urls || !urls.length) {
      packReady.set(name, "ready");
      return;
    }
    const work = (async () => {
      setBootStatus(`Loading ${labelForPack(name)}…`);
      for (const url of urls) {
        await loadScript(url);
      }
      packReady.set(name, "ready");
      clearBootStatus();
    })().catch((error) => {
      packReady.delete(name);
      clearBootStatus();
      console.warn("[llh-lazy]", name, error);
      throw error;
    });
    packReady.set(name, work);
    return work;
  }

  function isReady(packName) {
    return packReady.get(packName) === "ready";
  }

  function labelForPack(name) {
    if (name === "teachingKit" || name === "adminSurface") return "Teaching Kit tools";
    if (name === "admin" || name === "curriculumAdmin") return "Admin tools";
    if (name === "comms") return "Messages";
    if (name === "exports") return "export tools";
    return "extra tools";
  }

  function setBootStatus(text) {
    const el = document.getElementById("llhLazyStatus");
    if (el) {
      el.hidden = false;
      el.textContent = text;
    }
  }

  function clearBootStatus() {
    const el = document.getElementById("llhLazyStatus");
    if (el) {
      el.hidden = true;
      el.textContent = "";
    }
  }

  function packForView(view) {
    const v = String(view || "").trim();
    if (v === "admin" || v === "admin-preview") return "adminSurface";
    if (v === "messages" || v === "comms") return "comms";
    // Teaching Kit authoring/viewer stacks — not the regular lesson library browse.
    if (v === "lesson-editor" || /teaching-kit/.test(v)) return "teachingKit";
    return "";
  }

  function prefetchIdle(packNames) {
    const run = () => {
      (packNames || []).forEach((name) => {
        ensure(name).catch(() => {});
      });
    };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(run, { timeout: 4000 });
    } else {
      window.setTimeout(run, 2000);
    }
  }

  root.LLHLazyLoader = {
    VERSION,
    PACKS,
    ensure,
    isReady,
    packForView,
    prefetchIdle,
    loadScript,
  };
})(typeof window !== "undefined" ? window : globalThis);
