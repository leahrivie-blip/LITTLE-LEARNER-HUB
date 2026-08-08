/**
 * Teaching Kit Slice 1D/1F — flagged companion UI (read-only binder surfaces).
 * Renders Start Week / Monday Setup / Today / Open Everything / Activity /
 * Build My Kit / Binder preview from the Slice 1C API payload.
 * Fail closed: callers keep legacy workspace when API/flag is unavailable.
 * Slice 1F: loading polish, empty-kit safety, smoother panel nav, Letter/A4 option.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.LLHTeachingKitViewer = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SURFACES = Object.freeze([
    { id: "start", label: "Start Week" },
    { id: "setup", label: "Monday Setup" },
    { id: "today", label: "Today" },
    { id: "binder", label: "Binder" },
    { id: "build", label: "Build / Print" },
  ]);

  const BINDER_SECTION_ORDER = Object.freeze([
    "overview",
    "weekly_plan",
    "activities",
    "printables",
    "songs",
    "books",
    "examples",
    "teacher_toolkit",
  ]);

  const WEEKDAYS = Object.freeze(["monday", "tuesday", "wednesday", "thursday", "friday"]);
  const DAY_SHORT = Object.freeze({
    monday: "Mon",
    tuesday: "Tue",
    wednesday: "Wed",
    thursday: "Thu",
    friday: "Fri",
  });

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function presentApi() {
    return (typeof globalThis !== "undefined" && globalThis.LLHTeachingKitPresent)
      || (typeof require === "function" ? (() => { try { return require("./teaching-kit-present.js"); } catch (_e) { return null; } })()
      : null);
  }

  function presentLabel(value, fallback) {
    const api = presentApi();
    return api?.presentLabel ? api.presentLabel(value, fallback) : (text(value) || text(fallback) || "");
  }

  function presentRights(value) {
    const api = presentApi();
    return api?.presentRightsStatus ? api.presentRightsStatus(value) : presentLabel(value, "");
  }

  function presentKind(value) {
    const api = presentApi();
    return api?.presentKind ? api.presentKind(value) : presentLabel(value, "Item");
  }

  function hasDisplayValue(value) {
    const api = presentApi();
    if (api?.hasDisplayValue) return api.hasDisplayValue(value);
    return Boolean(text(value));
  }

  function detailBlockHtml(title, bodyHtml, { open = false, className = "" } = {}) {
    if (!text(bodyHtml)) return "";
    return `
      <details class="tk-detail${className ? ` ${className}` : ""}"${open ? " open" : ""}>
        <summary>${escapeHtml(title)}</summary>
        <div class="tk-detail-body">${bodyHtml}</div>
      </details>
    `;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function dayModel(kit, day) {
    const days = kit && kit.companion && kit.companion.days ? kit.companion.days : {};
    return days[day] || kit?.companion?.today || null;
  }

  function activityById(kit, id) {
    const list = kit?.companion?.activities || [];
    return list.find((item) => item.id === id) || null;
  }

  function chipsHtml(items) {
    return (items || [])
      .filter(Boolean)
      .map((item) => `<span class="tk-chip">${escapeHtml(item)}</span>`)
      .join("");
  }

  function lazyImgHtml(src, alt, className) {
    const url = text(src);
    if (!url) return "";
    const cls = className ? ` class="${escapeHtml(className)}"` : "";
    return `<img${cls} src="${escapeHtml(url)}" alt="${escapeHtml(alt || "")}" loading="lazy" decoding="async" data-tk-lazy="1" />`;
  }

  function sectionById(kit, sectionId) {
    return (kit?.sections || []).find((section) => section.id === sectionId) || null;
  }

  const BINDER_TAB_LABELS = Object.freeze({
    overview: "Overview",
    weekly_plan: "Weekly Plan",
    activities: "Activities",
    printables: "Printables",
    songs: "Songs",
    books: "Books",
    examples: "Example Images",
    teacher_toolkit: "Teacher Toolkit",
  });

  function isOwnerPreviewKit(kit, chrome) {
    return Boolean(
      (chrome && chrome.ownerPreview === true)
      || kit?.featureFlags?.ownerPreview === true
      || (typeof document !== "undefined" && document.body?.classList?.contains("teaching-kit-owner-preview")),
    );
  }

  function emptyBinderStateHtml(sectionLabel, ownerPreview) {
    if (ownerPreview) {
      return `
        <div class="tk-empty-state" data-tk-empty-state="1" role="status">
          <strong>${escapeHtml(sectionLabel)} — not added yet</strong>
          <p class="tk-muted">Owner preview: this binder tab stays visible so you can see what still needs authoring. Customers will not see empty sections.</p>
        </div>
      `;
    }
    return `<p class="tk-muted">No ${escapeHtml(sectionLabel.toLowerCase())} in this kit yet.</p>`;
  }

  function photoSlotHtml(url, alt, caption, ownerPreview, kind) {
    const src = text(url);
    const label = kind === "setup" ? "Setup photo" : "Example photo";
    if (src) {
      return `
        <div class="tk-photo${kind === "setup" ? " tk-photo-setup" : ""}">
          <img class="tk-photo-img" src="${escapeHtml(src)}" alt="${escapeHtml(alt || label)}" loading="lazy" decoding="async" data-tk-lazy="1" data-tk-photo-fallback="${escapeHtml(label)} unavailable" onerror="this.onerror=null;this.removeAttribute('src');this.className='tk-photo-placeholder';this.alt='';this.textContent=this.getAttribute('data-tk-photo-fallback')||'Photo unavailable';" />
          <div class="tk-photo-caption">${escapeHtml(caption || label)}</div>
        </div>
      `;
    }
    if (ownerPreview) {
      return `
        <div class="tk-photo${kind === "setup" ? " tk-photo-setup" : ""}">
          <div class="tk-photo-placeholder tk-photo-missing" data-tk-image-missing="${escapeHtml(kind)}">Image not added yet</div>
          <div class="tk-photo-caption">${escapeHtml(label)}</div>
        </div>
      `;
    }
    return "";
  }

  function visibleBinderTabs(kit, chrome) {
    const ownerPreview = isOwnerPreviewKit(kit, chrome);
    const provider = kit?.companion?.providerBinder || kit?.companion?.binder || {};
    const fromProvider = Array.isArray(provider.providerTabs)
      ? provider.providerTabs
      : (Array.isArray(provider.tabs) ? provider.tabs : []);
    if (fromProvider.length) {
      return fromProvider
        .filter((tab) => tab.visible !== false || ownerPreview)
        .map((tab) => ({
          ...tab,
          label: BINDER_TAB_LABELS[tab.id] || tab.label,
          empty: tab.empty === true || Number(tab.itemCount || 0) === 0,
        }));
    }
    // Fallback: derive from kit.sections using vision order.
    return BINDER_SECTION_ORDER.map((id) => {
      const map = {
        overview: "overview",
        weekly_plan: "weekly_plan",
        activities: "daily_activities",
        printables: "printables",
        songs: "songs",
        books: "books",
        examples: "examples",
        teacher_toolkit: "teacher_toolkit",
      };
      const section = sectionById(kit, map[id] || id);
      const hasContent = Boolean(section && (section.visible || section.content));
      if (!hasContent && !ownerPreview) return null;
      return {
        id,
        label: BINDER_TAB_LABELS[id] || section?.label || id,
        sectionId: section?.id || map[id] || id,
        visible: true,
        empty: !hasContent,
        itemCount: section?.itemCount || 0,
      };
    }).filter(Boolean);
  }

  function checklistHtml(items, prefix) {
    const rows = items || [];
    if (!rows.length) {
      return `<p class="tk-muted tk-empty-line">Nothing listed yet for this section.</p>`;
    }
    return rows
      .map((item, index) => {
        const id = item.id || `${prefix}-${index}`;
        const missing = item.missing || item.criticalMissing;
        return `
          <div class="tk-check-row${missing ? " is-missing" : ""}" data-tk-check="${escapeHtml(id)}">
            <span class="tk-checkbox" aria-hidden="true"></span>
            <div>
              <strong>${escapeHtml(item.label || item.title || "")}</strong>
              ${item.detail || item.minutes || (item.usedInWeek && item.usedInWeek.length)
                ? `<p class="tk-muted">${escapeHtml(
                  item.detail
                    || (item.minutes ? `~${item.minutes} min` : "")
                    || (item.usedInWeek || []).join(" · "),
                )}</p>`
                : ""}
            </div>
          </div>
        `;
      })
      .join("");
  }

  function isSparseKit(kit) {
    const quality = kit?.quality || {};
    const activityCount = Number(quality.activityCount || kit?.companion?.activities?.length || 0);
    const sections = Array.isArray(kit?.sections) ? kit.sections.length : 0;
    const prep = Number(kit?.companion?.mondayMorningSetup?.estimatedPrepMinutes || 0);
    return activityCount === 0 && sections === 0 && prep === 0;
  }

  function emptyKitBannerHtml(kit) {
    if (!isSparseKit(kit)) return "";
    return `
      <div class="tk-empty-banner" data-tk-empty-kit role="status">
        <strong>This lesson plan is still empty</strong>
        <p class="tk-muted">No activities or materials yet — the Teaching Kit stays available so nothing breaks. Add content in the lesson plan, or use the classic workspace tabs if you prefer.</p>
      </div>
    `;
  }

  function loadingWorkspaceHtml(chrome) {
    const title = (chrome && chrome.title) || "Teaching Kit";
    return `
      <div class="lesson-workspace teaching-kit-workspace is-loading" data-teaching-kit-loading aria-busy="true">
        <div class="tk-loading-banner">
          <div class="tk-loading-spinner" aria-hidden="true"></div>
          <div>
            <strong>Opening Teaching Kit</strong>
            <p class="tk-muted">Preparing ${escapeHtml(title)}…</p>
          </div>
        </div>
        <div class="tk-loading-skeleton" aria-hidden="true">
          <div class="tk-skel tk-skel-wide"></div>
          <div class="tk-skel"></div>
          <div class="tk-skel tk-skel-mid"></div>
        </div>
      </div>
    `;
  }

  function renderLoadingWorkspace(body, chrome) {
    if (!body) return;
    body.innerHTML = `<article class="printable-resource-page curriculum-lesson-viewer lesson-workspace-article teaching-kit-article">${loadingWorkspaceHtml(chrome || {})}</article>`;
    body.classList.add("teaching-kit-loading");
  }

  function startSurfaceHtml(kit) {
    const setup = kit.companion?.mondayMorningSetup || {};
    const prep = setup.estimatedPrepMinutes || 0;
    const sparse = isSparseKit(kit);
    return `
      <section class="tk-surface" data-tk-panel="start">
        ${emptyKitBannerHtml(kit)}
        <div class="tk-banner">
          <div>
            <h3 class="tk-banner-title">${escapeHtml(kit.title || "Teaching Kit")}</h3>
            <p class="tk-muted">${sparse
              ? "Companion surfaces are ready — content will appear here as you fill in the lesson plan."
              : "Your classroom companion for the week — setup, teach, observe, and send home."}</p>
            <div class="tk-chips">
              ${chipsHtml([
                kit.age,
                kit.plan,
                prep ? `~${prep} min Monday prep` : (sparse ? "Draft / empty" : ""),
                "Printable binder",
              ])}
            </div>
          </div>
          <div class="tk-stack tk-start-actions">
            <button type="button" class="tk-btn tk-btn-primary tk-btn-lg" data-tk-goto="setup">Open Monday Morning Setup</button>
            <button type="button" class="tk-btn tk-btn-secondary" data-tk-goto="today">Open Today’s Classroom</button>
            <button type="button" class="tk-btn tk-btn-ghost" data-tk-goto="binder">Open Digital Binder</button>
            <button type="button" class="tk-btn tk-btn-ghost" data-tk-goto="build">Build &amp; Print My Kit</button>
          </div>
        </div>
        <div class="tk-grid-3 tk-start-guide">
          <article class="tk-card"><h4>Before children arrive</h4><p class="tk-muted">Materials, prep tasks, supplies, and what to print.</p></article>
          <article class="tk-card"><h4>During the day</h4><p class="tk-muted">Schedule, activities, books, songs, transitions, notes.</p></article>
          <article class="tk-card"><h4>In your hands</h4><p class="tk-muted">A binder-ready kit you can customize before printing.</p></article>
        </div>
      </section>
    `;
  }

  function setupSurfaceHtml(kit, state) {
    const setup = kit.companion?.mondayMorningSetup || {};
    const materialsModel = kit.companion?.materialsModel || null;
    const missing = setup.missingMaterials || [];
    const status = setup.materialsStatus || {};
    const breakdown = setup.prepBreakdown || {};
    const listedCount = (setup.materials || []).length;
    const statusChip = missing.length
      ? `<span class="tk-chip tk-chip-danger">${escapeHtml(String(missing.length))} missing</span>`
      : (status.mode === "gather"
        ? `<span class="tk-chip">${escapeHtml(String(listedCount))} to gather</span>`
        : `<span class="tk-chip tk-chip-ok">Ready</span>`);
    return `
      <section class="tk-surface" data-tk-panel="setup">
        <div class="tk-banner-time">
          <div>
            <div class="tk-eyebrow">Estimated prep time</div>
            <div class="tk-big">About ${escapeHtml(String(setup.estimatedPrepMinutes || 0))} minutes</div>
            <p class="tk-muted">Gather ${escapeHtml(String(breakdown.gather || 0))} min · stations ${escapeHtml(String(breakdown.stations || 0))} min · print ${escapeHtml(String(breakdown.print || 0))} min</p>
          </div>
          <div class="tk-chips">
            <span class="tk-chip tk-chip-ok">${escapeHtml(String(listedCount))} listed</span>
            ${statusChip}
          </div>
        </div>
        <div class="tk-banner-missing ${missing.length ? "" : "tk-banner-info"}">
          <div>
            <strong>${escapeHtml(missing.length ? "Needs attention before the week begins" : "Materials status")}</strong>
            <p class="tk-muted${missing.length ? " tk-danger-text" : ""}">${escapeHtml(status.summary || (missing.length ? missing.join(" · ") : "Gather listed supplies before Monday."))}</p>
            ${status.fixHint ? `<p class="tk-muted"><strong>How to fix:</strong> ${escapeHtml(status.fixHint)}</p>` : ""}
            ${(status.items || []).length ? `
              <ul class="tk-list tk-missing-list">
                ${(status.items || []).slice(0, 12).map((item) => `
                  <li><strong>${escapeHtml(item.label)}</strong> — ${escapeHtml(item.howToFix || item.status || "")}</li>
                `).join("")}
              </ul>
            ` : ""}
          </div>
        </div>
        ${materialsModel ? `
          <article class="tk-card">
            <h4>Materials by day</h4>
            <p class="tk-muted">Master week list is normalized (duplicates collapsed safely). Daily and activity lists stay attached below.</p>
            <p class="tk-muted"><strong>Master (week):</strong> ${escapeHtml((materialsModel.master || []).join(" · ") || "None listed")}</p>
            ${["monday", "tuesday", "wednesday", "thursday", "friday"].map((day) => {
              const row = materialsModel.byDay?.[day];
              return `<p class="tk-muted"><strong>${escapeHtml(row?.dayLabel || day)}:</strong> ${escapeHtml((row?.materials || []).join(" · ") || "None listed")}</p>`;
            }).join("")}
            ${materialsModel.duplicatesCollapsed ? `<p class="tk-muted">Collapsed ${escapeHtml(String(materialsModel.duplicatesCollapsed))} clear duplicate label${materialsModel.duplicatesCollapsed === 1 ? "" : "s"}.</p>` : ""}
          </article>
        ` : ""}
        <div class="tk-grid-2">
          <div class="tk-stack">
            <article class="tk-card">
              <h4>Materials to gather</h4>
              ${checklistHtml((setup.materials || []).map((item) => ({
                ...item,
                missing: missing.some((label) => text(label).toLowerCase() === text(item.label).toLowerCase()),
                detail: item.critical ? "Critical for the week" : "Optional / supporting",
              })), "mat")}
            </article>
            <article class="tk-card">
              <h4>Prep tasks</h4>
              ${checklistHtml(setup.prepTasks || [], "prep")}
            </article>
          </div>
          <div class="tk-stack">
            <article class="tk-card tk-card-warn">
              <h4>Print checklist</h4>
              ${checklistHtml(setup.printChecklist || [], "print")}
              <p class="tk-muted tk-note">${state && state.printCenterEnabled
                ? "Open <strong>Build / Print</strong> to assemble the Teaching Kit binder."
                : "Print Center is flagged off — use legacy print from More, or enable teachingKitPrintCenter locally to preview."}</p>
            </article>
            <article class="tk-card">
              <h4>After setup</h4>
              <p class="tk-muted">Open <strong>Today’s Classroom</strong> and leave it up all day. Use <strong>Open Everything I Need Today</strong> when you want the full packet.</p>
              <button type="button" class="tk-btn tk-btn-primary" data-tk-goto="today">Start Today’s Classroom</button>
            </article>
          </div>
        </div>
      </section>
    `;
  }

  function todaySurfaceHtml(kit, state) {
    const day = state.day || "monday";
    const today = dayModel(kit, day) || {};
    const open = state.openEverything;
    const packet = kit.companion?.openEverything;
    // Rebuild open-everything for selected day from companion days when possible
    const dayPacketItems = [];
    (today.activities || []).forEach((activity) => {
      dayPacketItems.push({ kind: "activity", id: activity.id, title: activity.title, detail: "Activity card" });
    });
    (today.books || []).forEach((book) => {
      dayPacketItems.push({ kind: "book", id: `book:${book.title}`, title: book.title, detail: "Book · read-aloud questions" });
    });
    (today.songs || []).forEach((song) => {
      dayPacketItems.push({ kind: "song", id: `song:${song.title}`, title: song.title, detail: "Song · lyrics + motions" });
    });
    (kit.companion?.printables || []).forEach((printable) => {
      const used = (printable.usedInWeek || []).some((slot) => slot.day === day);
      if (used || !(printable.usedInWeek || []).length) {
        dayPacketItems.push({
          kind: "printable",
          id: printable.id,
          title: printable.title,
          detail: "Printable",
          usedInWeek: printable.usedInWeek,
        });
      }
    });
    if (today.parentMessage) {
      dayPacketItems.push({
        kind: "parent_message",
        id: "parent-message",
        title: "Parent connection",
        detail: "Ready-to-send family message",
        body: today.parentMessage,
      });
    }

    const dayLabel = today.dayLabel || DAY_SHORT[day] || "Today";
    return `
      <section class="tk-surface" data-tk-panel="today">
        <div class="tk-day-strip" role="tablist" aria-label="Week days">
          ${WEEKDAYS.map((weekday) => `
            <button type="button" role="tab" class="tk-day${weekday === day ? " is-active" : ""}" data-tk-day="${weekday}" aria-selected="${weekday === day ? "true" : "false"}">${escapeHtml(DAY_SHORT[weekday])}</button>
          `).join("")}
        </div>
        <div class="tk-today-launcher${open ? " is-open" : ""}" data-tk-today-launcher>
          <div class="tk-today-launcher-copy">
            <p class="tk-eyebrow">${escapeHtml(dayLabel)} classroom</p>
            <h3 class="tk-today-launcher-title">${escapeHtml(today.focus || kit.theme || "Today’s plan")}</h3>
          </div>
          <button type="button" class="tk-btn ${open ? "tk-btn-secondary" : "tk-btn-primary"}" data-tk-open-everything aria-expanded="${open ? "true" : "false"}">${open ? "Close daily packet" : "Open Everything I Need Today"}</button>
        </div>
        ${open ? `
          <div class="tk-tray tk-tray-inline" data-tk-tray>
            <div class="tk-tray-head">
              <h4>Daily packet · ${escapeHtml(dayLabel)}</h4>
              <div class="tk-tray-head-actions">
                <span class="tk-chip tk-chip-ok">${escapeHtml(String(dayPacketItems.length))} items</span>
                <button type="button" class="tk-btn tk-btn-ghost tk-btn-sm" data-tk-open-everything aria-label="Close daily packet">Close</button>
              </div>
            </div>
            ${dayPacketItems.map((item) => `
              <div class="tk-tray-item">
                <div class="tk-thumb" aria-hidden="true"></div>
                <div class="tk-tray-copy">
                  <strong class="tk-card-title">${escapeHtml(item.title)}</strong>
                  <p class="tk-muted tk-card-meta">${escapeHtml(item.detail || presentKind(item.kind))}</p>
                  ${item.usedInWeek && item.usedInWeek.length
                    ? `<div class="tk-used-map">${item.usedInWeek.map((slot) => `<span class="tk-used-pill">${escapeHtml(`${presentLabel(slot.dayLabel || slot.day)} · ${presentLabel(slot.moment || "during day")}`)}</span>`).join("")}</div>`
                    : ""}
                  ${item.body ? `<div class="tk-message">${escapeHtml(item.body)}</div>` : ""}
                </div>
                ${item.kind === "activity"
                  ? `<button type="button" class="tk-btn tk-btn-secondary tk-btn-sm" data-tk-open-activity="${escapeHtml(item.id)}">Open</button>`
                  : item.kind === "parent_message"
                    ? `<button type="button" class="tk-btn tk-btn-primary tk-btn-sm" data-tk-copy-parent>Copy</button>`
                    : `<span class="tk-chip">${escapeHtml(presentKind(item.kind))}</span>`}
              </div>
            `).join("")}
          </div>
        ` : ""}
        <div class="tk-grid-2">
          <div class="tk-stack">
            <h3 class="tk-section-title">Today’s schedule</h3>
            <div class="tk-timeline">
              ${(today.schedule || []).map((slot) => `
                <div class="tk-slot">
                  <div class="tk-time">${escapeHtml(slot.time)}</div>
                  <div class="tk-what">${escapeHtml(slot.label)}</div>
                  <div class="tk-kind">${escapeHtml(presentKind(slot.kind))}</div>
                </div>
              `).join("") || `<p class="tk-muted">No schedule items for this day.</p>`}
            </div>
            <article class="tk-card">
              <h4>Materials · transitions</h4>
              <p class="tk-muted">${escapeHtml((today.materials || []).join(" · ") || "None listed")}</p>
              <ul class="tk-list">
                ${(today.transitions || []).map((line) => `<li>${escapeHtml(line)}</li>`).join("")}
              </ul>
            </article>
            <article class="tk-card">
              <h4>Observation ideas (today’s activities)</h4>
              <ul class="tk-list">
                ${(today.observations || []).map((line) => `<li>${escapeHtml(line)}</li>`).join("") || "<li class=\"tk-muted\">None listed</li>"}
              </ul>
            </article>
          </div>
          <div class="tk-stack">
            <article class="tk-card">
              <h4>Books today</h4>
              ${(today.books || []).map((book) => `
                <p><strong>${escapeHtml(book.title)}</strong>${book.author ? ` <span class="tk-muted">· ${escapeHtml(book.author)}</span>` : ""}</p>
                ${(book.readAloudQuestions || []).length
                  ? `<div class="tk-prompt"><strong>Read-aloud questions</strong>${escapeHtml((book.readAloudQuestions || []).join(" · "))}</div>`
                  : ""}
              `).join("") || `<p class="tk-muted">No books listed for today.</p>`}
            </article>
            <article class="tk-card">
              <h4>Songs today</h4>
              ${(today.songs || []).map((song) => `
                <p><strong>${escapeHtml(song.title)}</strong></p>
                ${song.lyrics ? `<p class="tk-lyrics"><em>${escapeHtml(song.lyrics)}</em></p>` : ""}
                ${song.motions ? `<p class="tk-muted"><strong>Motions:</strong> ${escapeHtml(song.motions)}</p>` : ""}
              `).join("") || `<p class="tk-muted">No songs listed for today.</p>`}
            </article>
            <article class="tk-card">
              <h4>Vocabulary</h4>
              <ul class="tk-list">
                ${(today.vocabulary || []).map((word) => `
                  <li><strong>${escapeHtml(word.word)}</strong>${word.definition ? ` — ${escapeHtml(word.definition)}` : ""}${word.discussionIdea ? ` <span class="tk-muted">${escapeHtml(word.discussionIdea)}</span>` : ""}</li>
                `).join("") || "<li class=\"tk-muted\">None listed</li>"}
              </ul>
            </article>
            <article class="tk-card tk-card-soft">
              <h4>Parent connection</h4>
              <div class="tk-message" data-tk-parent-message>${escapeHtml(today.parentMessage || kit.companion?.parentConnection?.readyToSendMessage || "")}</div>
              <button type="button" class="tk-btn tk-btn-primary tk-btn-sm" data-tk-copy-parent>Copy message</button>
            </article>
            <article class="tk-card">
              <h4>Today’s activities</h4>
              <div class="tk-stack">
                ${(today.activities || []).map((activity) => `
                  <div class="tk-activity-row">
                    <div>
                      <strong class="tk-card-title">${escapeHtml(activity.title)}</strong>
                      <p class="tk-muted tk-card-meta">${escapeHtml(presentLabel(activity.activityCategory || activity.sectionId || "activity"))}</p>
                    </div>
                    <button type="button" class="tk-btn tk-btn-secondary tk-btn-sm" data-tk-open-activity="${escapeHtml(activity.id)}">Open</button>
                  </div>
                `).join("") || `<p class="tk-muted">No activities for this day.</p>`}
              </div>
            </article>
          </div>
        </div>
      </section>
    `;
  }

  function activityBackLabel(state) {
    if (state.returnSurface === "binder") return "Back to Binder";
    if (state.returnSurface === "build") return "Back to Build / Print";
    if (state.returnSurface === "setup") return "Back to Monday Setup";
    return "Back to Today";
  }

  function activitySurfaceHtml(kit, state, chrome) {
    const activity = activityById(kit, state.activityId);
    const ownerPreview = isOwnerPreviewKit(kit, chrome);
    if (!activity) {
      return `<section class="tk-surface" data-tk-panel="activity"><p class="tk-muted">Activity not found.</p><button type="button" class="tk-btn tk-btn-ghost" data-tk-goto="${escapeHtml(state.returnSurface || "today")}">${escapeHtml(activityBackLabel(state))}</button></section>`;
    }
    const showSub = state.showSubstitute;
    const backTarget = ["binder", "build", "setup", "today", "start"].includes(state.returnSurface)
      ? state.returnSurface
      : "today";
    const photoPair = [
      photoSlotHtml(activity.examplePhotoUrl || activity.exampleImageUrl, activity.exampleAlt, activity.exampleCaption || "Example photo", ownerPreview, "example"),
      photoSlotHtml(activity.setupPhotoUrl || activity.setupImageUrl, activity.setupAlt, activity.setupCaption || "Setup photo", ownerPreview, "setup"),
    ].filter(Boolean).join("");
    return `
      <section class="tk-surface" data-tk-panel="activity">
        <div class="tk-activity-chrome">
          <button type="button" class="tk-btn tk-btn-ghost tk-btn-sm" data-tk-goto="${escapeHtml(backTarget)}">${escapeHtml(activityBackLabel({ returnSurface: backTarget }))}</button>
          <button type="button" class="tk-btn tk-btn-accent tk-btn-sm" data-tk-toggle-substitute aria-expanded="${showSub ? "true" : "false"}">Substitute This Activity</button>
        </div>
        <h3 class="tk-activity-title">${escapeHtml(activity.title)}</h3>
        <p class="tk-muted tk-card-meta">${escapeHtml(presentLabel(activity.activityCategory || ""))}${activity.dayOfWeek ? ` · ${escapeHtml(DAY_SHORT[activity.dayOfWeek] || activity.dayOfWeek)}` : ""}</p>
        ${photoPair ? `<div class="tk-photo-pair">${photoPair}</div>` : (ownerPreview ? `<div class="tk-photo-pair">${photoSlotHtml("", "", "Example photo", true, "example")}${photoSlotHtml("", "", "Setup photo", true, "setup")}</div>` : "")}
        <div class="tk-grid-2">
          <div class="tk-stack">
            ${hasDisplayValue(activity.purpose) ? `<article class="tk-card"><h4>Purpose</h4><p class="tk-muted tk-pre">${escapeHtml(activity.purpose)}</p></article>` : (ownerPreview ? `<article class="tk-card tk-field-empty"><h4>Purpose</h4><p class="tk-muted">Not added yet.</p></article>` : "")}
            ${hasDisplayValue(activity.learningObjective) || ownerPreview ? `<article class="tk-card"><h4>Learning objective</h4><p class="tk-muted">${escapeHtml(activity.learningObjective || (ownerPreview ? "Not added yet." : ""))}</p></article>` : ""}
            ${(activity.developmentalDomains || []).length ? `<article class="tk-card"><h4>Developmental domains</h4><p class="tk-muted">${escapeHtml(activity.developmentalDomains.join(" · "))}</p></article>` : ""}
            <article class="tk-card"><h4>Timing &amp; grouping</h4><p class="tk-muted">Setup: ${escapeHtml(activity.setupMinutes != null ? `${activity.setupMinutes} min` : (ownerPreview ? "not set" : "—"))} · Duration: ${escapeHtml(activity.activityDurationMinutes != null ? `${activity.activityDurationMinutes} min` : (activity.estimatedMinutes ? `~${activity.estimatedMinutes} min` : "—"))} · Group: ${escapeHtml(activity.groupSize || "Flexible")} · Placement: ${escapeHtml(activity.dailyPlacement || "During the day")}</p></article>
            <article class="tk-card"><h4>Exact materials</h4><p class="tk-muted">${escapeHtml((activity.materials || []).join(" · ") || activity.materialsText || (ownerPreview ? "Not added yet." : "None listed"))}</p></article>
            <article class="tk-card"><h4>Preparation</h4><p class="tk-muted tk-pre">${escapeHtml(activity.preparation || activity.setup || (ownerPreview ? "Not added yet." : "No prep notes yet."))}</p></article>
            <article class="tk-card"><h4>Step-by-step directions</h4><p class="tk-muted tk-pre">${escapeHtml(activity.steps || (ownerPreview ? "Not added yet." : "No steps listed yet."))}</p></article>
            <article class="tk-card">
              <h4>Open-ended teacher prompts</h4>
              ${(activity.teacherPrompts || []).map((prompt) => `
                <div class="tk-prompt"><strong>${escapeHtml(prompt.label || "Prompt")}</strong>${escapeHtml(prompt.text || "")}</div>
              `).join("") || `<p class="tk-muted">${ownerPreview ? "Not added yet." : "None listed"}</p>`}
            </article>
            ${(activity.vocabulary || []).length ? `
              <article class="tk-card">
                <h4>Vocabulary</h4>
                <p class="tk-muted">${escapeHtml((activity.vocabulary || []).map((word) => word.word || word).join(" · "))}</p>
              </article>
            ` : ""}
            <article class="tk-card"><h4>Cleanup instructions</h4><ul class="tk-list">${(activity.cleanupTips || []).map((tip) => `<li>${escapeHtml(tip)}</li>`).join("") || `<li class="tk-muted">${ownerPreview ? "Not added yet." : "None listed"}</li>`}</ul></article>
          </div>
          <div class="tk-stack">
            <article class="tk-card tk-card-warn">
              <h4>Observation / documentation prompts</h4>
              <ul class="tk-list">${(activity.observationIdeas || []).map((idea) => `<li>${escapeHtml(idea)}</li>`).join("") || `<li class="tk-muted">${ownerPreview ? "Not added yet." : "None listed"}</li>`}</ul>
            </article>
            ${activity.extraSupport || ownerPreview ? `<article class="tk-card"><h4>Differentiation — extra support</h4><p class="tk-muted tk-pre">${escapeHtml(activity.extraSupport || "Not added yet.")}</p></article>` : ""}
            ${activity.extensions || ownerPreview ? `<article class="tk-card"><h4>Extension — additional challenge</h4><p class="tk-muted tk-pre">${escapeHtml(activity.extensions || "Not added yet.")}</p></article>` : ""}
            ${activity.mixedAgeAdaptations || ownerPreview ? `<article class="tk-card"><h4>Mixed-age adaptations</h4><p class="tk-muted tk-pre">${escapeHtml(activity.mixedAgeAdaptations || "Not added yet.")}</p></article>` : ""}
            ${activity.adaptations ? `<article class="tk-card"><h4>Adaptations</h4><p class="tk-muted tk-pre">${escapeHtml(activity.adaptations)}</p></article>` : ""}
            ${activity.indoorAlternative || ownerPreview ? `<article class="tk-card"><h4>Indoor alternative</h4><p class="tk-muted tk-pre">${escapeHtml(activity.indoorAlternative || "Not added yet.")}</p></article>` : ""}
            ${activity.outdoorOption || ownerPreview ? `<article class="tk-card"><h4>Outdoor option</h4><p class="tk-muted tk-pre">${escapeHtml(activity.outdoorOption || "Not added yet.")}</p></article>` : ""}
            ${activity.safetyNotes || ownerPreview ? `<article class="tk-card"><h4>Safety notes</h4><p class="tk-muted tk-pre">${escapeHtml(activity.safetyNotes || "Not added yet.")}</p></article>` : ""}
            ${activity.familyConnection || ownerPreview ? `<article class="tk-card"><h4>Family connection</h4><p class="tk-muted tk-pre">${escapeHtml(activity.familyConnection || "Not added yet.")}</p></article>` : ""}
            ${activity.printableInstructions || ownerPreview ? `<article class="tk-card"><h4>Printable instructions</h4><p class="tk-muted tk-pre">${escapeHtml(activity.printableInstructions || "Not added yet.")}</p></article>` : ""}
            ${(activity.settingTags || []).length ? `
              <article class="tk-card">
                <h4>Group / setting</h4>
                <p class="tk-muted">${escapeHtml((activity.settingTags || []).map((tag) => String(tag || "").replace(/_/g, " ")).join(" · "))}</p>
              </article>
            ` : ""}
            ${(activity.supplySubstitutions || []).length ? `
              <article class="tk-card">
                <h4>Supply substitutions</h4>
                <ul class="tk-list">${(activity.supplySubstitutions || []).map((sub) => `
                  <li>No <strong>${escapeHtml(sub.need)}</strong> → use <strong>${escapeHtml(sub.use)}</strong></li>
                `).join("")}</ul>
              </article>
            ` : ""}
            ${showSub ? `
              <article class="tk-card tk-card-sub">
                <h4>Substitute This Activity</h4>
                <p class="tk-muted">Suggestions from this week’s kit${(activity.substituteCandidates || []).some((item) => item.sharedReadyMaterialCount > 0) ? " using materials you already have" : ""}.</p>
                ${(activity.substituteCandidates || []).map((candidate) => `
                  <div class="tk-kit-item">
                    <div>
                      <strong>${escapeHtml(candidate.title)}</strong>
                      <p class="tk-muted">${escapeHtml(candidate.reason || "")}</p>
                    </div>
                    <button type="button" class="tk-btn tk-btn-primary tk-btn-sm" data-tk-open-activity="${escapeHtml(candidate.activityId)}">View</button>
                  </div>
                `).join("") || `<p class="tk-muted">No substitutes available for this activity.</p>`}
                <button type="button" class="tk-btn tk-btn-ghost tk-btn-sm" data-tk-toggle-substitute>Keep ${escapeHtml(activity.title)}</button>
              </article>
            ` : ""}
          </div>
        </div>
      </section>
    `;
  }

  function buildSurfaceHtml(kit, state, chrome) {
    const build = kit.companion?.buildMyKit || {};
    const removed = state.removedActivityIds || {};
    const activities = build.activities || [];
    const includedCount = activities.filter((item) => !removed[item.id]).length;
    const printApi = typeof globalThis !== "undefined" ? globalThis.LLHTeachingKitPrint : null;
    const presets = printApi?.PRESETS || [];
    const partLabels = printApi?.PART_LABELS || {};
    const parts = state.printParts || {};
    const printEnabled = Boolean(state.printCenterEnabled);
    const ownerPreview = isOwnerPreviewKit(kit, chrome);
    const availability = printApi?.evaluatePrintPartAvailability
      ? printApi.evaluatePrintPartAvailability(kit, { removedActivityIds: removed, ownerPreview })
      : {};
    const presetAvailability = printApi?.evaluatePresetAvailability
      ? printApi.evaluatePresetAvailability(kit, { removedActivityIds: removed, ownerPreview })
      : {};
    const photoCount = Number(kit.quality?.activitiesWithExamplePhoto || 0)
      + Number(kit.quality?.activitiesWithSetupPhoto || 0);
    const imagesAvailable = photoCount > 0;
    const printables = kit.companion?.printables || [];
    return `
      <section class="tk-surface tk-build-surface" data-tk-panel="build">
        <div class="tk-build-layout">
          <div class="tk-stack">
            <h3 class="tk-section-title">Build My Kit · Print Center</h3>
            <article class="tk-card">
              <h4>Print pack</h4>
              <div class="tk-stack">
                ${presets.map((preset) => {
                  const meta = presetAvailability[preset.id] || { available: true, reason: "" };
                  const available = meta.available !== false;
                  return `
                  <label class="tk-radio-row${available ? "" : " is-disabled"}">
                    <input type="radio" name="tk-print-preset" value="${escapeHtml(preset.id)}" ${state.printPreset === preset.id ? "checked" : ""} data-tk-print-preset="${escapeHtml(preset.id)}" ${available ? "" : "disabled"} />
                    <span>${escapeHtml(preset.label)}${available ? "" : ` — ${escapeHtml(meta.reason || "Not available yet")}`}</span>
                  </label>`;
                }).join("") || `<p class="tk-muted">Print module not loaded.</p>`}
              </div>
              ${state.printPreset === "today_pack" ? `
                <div class="tk-print-select-block">
                  <h4>Choose day</h4>
                  <div class="tk-chip-row">
                    ${WEEKDAYS.map((day) => `
                      <label class="tk-radio-row">
                        <input type="radio" name="tk-print-day" value="${day}" ${state.day === day ? "checked" : ""} data-tk-print-day="${day}" />
                        <span>${escapeHtml(DAY_SHORT[day] || day)}</span>
                      </label>
                    `).join("")}
                  </div>
                </div>
              ` : ""}
              ${state.printPreset === "one_activity" ? `
                <div class="tk-print-select-block">
                  <h4>Choose activity</h4>
                  <select class="tk-select" data-tk-print-activity>
                    ${activities.map((item) => `
                      <option value="${escapeHtml(item.id)}" ${state.printActivityId === item.id ? "selected" : ""}>${escapeHtml(item.title)}</option>
                    `).join("")}
                  </select>
                </div>
              ` : ""}
              ${state.printPreset === "one_printable" ? `
                <div class="tk-print-select-block">
                  <h4>Choose printable</h4>
                  <select class="tk-select" data-tk-print-printable>
                    ${printables.map((item) => `
                      <option value="${escapeHtml(item.id || item.title)}" ${state.printPrintableId === (item.id || item.title) ? "selected" : ""}>${escapeHtml(item.title)}</option>
                    `).join("") || `<option value="">No printables linked yet</option>`}
                  </select>
                </div>
              ` : ""}
              ${state.printPreset === "selected_resources" ? `
                <div class="tk-print-select-block">
                  <h4>Choose resources</h4>
                  <label class="tk-check-inline"><input type="checkbox" data-tk-selected-res="overview" ${state.selectedResources?.overview ? "checked" : ""} /> Overview</label>
                  <label class="tk-check-inline"><input type="checkbox" data-tk-selected-res="vocabulary" ${state.selectedResources?.vocabulary ? "checked" : ""} /> Vocabulary</label>
                  <label class="tk-check-inline"><input type="checkbox" data-tk-selected-res="weekly" ${state.selectedResources?.weekly ? "checked" : ""} /> Weekly Plan</label>
                  <label class="tk-check-inline"><input type="checkbox" data-tk-selected-res="activities" ${state.selectedResources?.activities ? "checked" : ""} /> Activities</label>
                  <label class="tk-check-inline"><input type="checkbox" data-tk-selected-res="songs" ${state.selectedResources?.songs ? "checked" : ""} /> Songs</label>
                  <label class="tk-check-inline"><input type="checkbox" data-tk-selected-res="books" ${state.selectedResources?.books ? "checked" : ""} /> Book Guide</label>
                  <label class="tk-check-inline"><input type="checkbox" data-tk-selected-res="printables" ${state.selectedResources?.printables ? "checked" : ""} /> Printables</label>
                  <label class="tk-check-inline"><input type="checkbox" data-tk-selected-res="materials" ${state.selectedResources?.materials ? "checked" : ""} /> Materials List</label>
                  <label class="tk-check-inline"><input type="checkbox" data-tk-selected-res="toolkit" ${state.selectedResources?.toolkit ? "checked" : ""} /> Teacher Toolkit</label>
                  ${WEEKDAYS.map((day) => `
                    <label class="tk-check-inline"><input type="checkbox" data-tk-selected-day="${day}" ${(state.selectedResources?.days || []).includes(day) ? "checked" : ""} /> ${escapeHtml(DAY_SHORT[day] || day)} plan</label>
                  `).join("")}
                </div>
              ` : ""}
              ${ownerPreview ? `<p class="tk-owner-preview-banner" role="status">ADMIN PREVIEW — print outputs are labeled and do not publish changes.</p>` : ""}
            </article>
            <article class="tk-card">
              <h4>Sections</h4>
              ${Object.keys(partLabels).map((key) => {
                const meta = availability[key] || { available: true, count: null, reason: "" };
                const available = meta.available !== false;
                const checked = available && parts[key];
                const countLabel = meta.count != null ? ` (${meta.count})` : "";
                if (!available && !ownerPreview) return "";
                return `
                  <label class="tk-check-inline${available ? "" : " is-disabled"}">
                    <input type="checkbox" data-tk-print-part="${escapeHtml(key)}" ${checked ? "checked" : ""} ${available ? "" : "disabled"} />
                    <span>${escapeHtml(partLabels[key])}${escapeHtml(countLabel)}${available ? "" : ` — ${escapeHtml(meta.reason || "Not available yet")}`}</span>
                  </label>
                `;
              }).join("")}
            </article>
            <article class="tk-card">
              <h4>Options</h4>
              <label class="tk-check-inline${imagesAvailable ? "" : " is-disabled"}">
                <input type="checkbox" data-tk-print-option="includeImages" ${imagesAvailable && state.includeImages !== false ? "checked" : ""} ${imagesAvailable ? "" : "disabled"} />
                <span>Include example / setup photos${imagesAvailable ? ` (${photoCount})` : " — no photos added yet"}</span>
              </label>
              <label class="tk-check-inline">
                <input type="checkbox" data-tk-print-option="inkSaver" ${state.inkSaver ? "checked" : ""} />
                <span>Ink-saver (simplified styling)</span>
              </label>
              <div class="tk-paper-row" role="group" aria-label="Paper size">
                ${(printApi?.PAPER_SIZES || [
                  { id: "letter", label: "US Letter" },
                  { id: "a4", label: "A4" },
                ]).map((paper) => `
                  <label class="tk-radio-row">
                    <input type="radio" name="tk-print-paper" value="${escapeHtml(paper.id)}" ${state.paperSize === paper.id ? "checked" : ""} data-tk-print-paper="${escapeHtml(paper.id)}" />
                    <span>${escapeHtml(paper.label)}</span>
                  </label>
                `).join("")}
              </div>
            </article>
            <h3 class="tk-section-title">Activities in this kit</h3>
            ${emptyKitBannerHtml(kit)}
            ${activities.map((item) => {
              const off = Boolean(removed[item.id]);
              return `
                <div class="tk-kit-item${off ? " is-off" : ""}">
                  <button type="button" class="tk-toggle${off ? "" : " is-on"}" data-tk-toggle-activity="${escapeHtml(item.id)}" aria-pressed="${off ? "false" : "true"}" aria-label="${off ? "Add" : "Remove"} ${escapeHtml(item.title)}"></button>
                  <div>
                    <strong>${escapeHtml(item.title)}</strong>
                    <p class="tk-muted">${escapeHtml(DAY_SHORT[item.dayOfWeek] || item.dayOfWeek || "")}${item.substituteAvailable ? " · substitute available" : ""}</p>
                  </div>
                  ${item.substituteAvailable
                    ? `<button type="button" class="tk-btn tk-btn-accent tk-btn-sm" data-tk-open-activity="${escapeHtml(item.id)}" data-tk-from-build="1">Substitute</button>`
                    : `<button type="button" class="tk-btn tk-btn-ghost tk-btn-sm" data-tk-open-activity="${escapeHtml(item.id)}" data-tk-from-build="1">Open</button>`}
                </div>
              `;
            }).join("") || `<p class="tk-muted">No activities in this kit yet — you can still print a cover and notes.</p>`}
          </div>
          <aside class="tk-stack tk-build-summary">
            <article class="tk-card">
              <h4>Binder always branded</h4>
              <ul class="tk-list">
                <li>Cover page with LLH mark</li>
                <li>Color tab section dividers</li>
                <li>Running header + numbered footer</li>
                <li>US Letter or A4 classroom layout</li>
                <li>Blank sections are skipped automatically</li>
              </ul>
            </article>
            <article class="tk-card tk-card-soft">
              <h4>Ready to print</h4>
              <p class="tk-muted"><strong>${escapeHtml(String(includedCount))} activities</strong> · ${escapeHtml(presentLabel(state.printPreset || "week_binder", "Entire Binder Kit"))} · ${escapeHtml(state.paperSize === "a4" ? "A4" : "US Letter")}</p>
              <div class="tk-build-cta-stack">
                <button type="button" class="tk-btn tk-btn-primary" data-tk-print-binder ${printEnabled ? "" : "disabled"} aria-disabled="${printEnabled ? "false" : "true"}">${printEnabled ? "Print binder" : "Print binder (unavailable)"}</button>
                <button type="button" class="tk-btn tk-btn-secondary" data-tk-download-binder ${printEnabled ? "" : "disabled"} aria-disabled="${printEnabled ? "false" : "true"}">${printEnabled ? "Download PDF" : "Download PDF (unavailable)"}</button>
                <button type="button" class="tk-btn tk-btn-ghost" data-tk-goto="binder">Preview Binder</button>
              </div>
              <p class="tk-muted tk-note" id="tk-print-help">${printEnabled
                ? "Print and Download use the same Complete Teaching Kit document (not the open tab). Choose a pack above, then print or save as PDF."
                : "Print Center is not available for this session. Binder preview and lesson downloads still work from the action bar."}</p>
            </article>
          </aside>
        </div>
      </section>
    `;
  }

  function binderSectionBodyHtml(kit, tabId, state) {
    const map = {
      overview: "overview",
      weekly_plan: "weekly_plan",
      activities: "daily_activities",
      printables: "printables",
      songs: "songs",
      books: "books",
      examples: "examples",
      teacher_toolkit: "teacher_toolkit",
    };
    const section = sectionById(kit, map[tabId] || tabId);
    const content = section?.content || {};
    const removed = state.removedActivityIds || {};

    if (tabId === "overview") {
      return `
        <div class="tk-binder-section-body">
          <h3 class="tk-section-title">Overview</h3>
          <p class="tk-lead">${escapeHtml(content.weeklyOverview || "Your complete week is organized in this binder — open each tab as you teach.")}</p>
          <div class="tk-chips">
            ${chipsHtml([content.age || kit.age, content.theme || kit.theme, kit.plan])}
          </div>
          ${(sectionById(kit, "objectives")?.content?.objectives || []).length ? `
            <article class="tk-binder-block">
              <h4>Learning objectives</h4>
              <ul class="tk-list">${(sectionById(kit, "objectives").content.objectives || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
            </article>
          ` : ""}
          ${(sectionById(kit, "materials")?.content?.materials || []).length ? `
            <article class="tk-binder-block">
              <h4>Week materials</h4>
              <p class="tk-muted">${escapeHtml((sectionById(kit, "materials").content.materials || []).join(" · "))}</p>
            </article>
          ` : ""}
        </div>
      `;
    }

    if (tabId === "weekly_plan") {
      const days = content.days || [];
      const ownerPreview = isOwnerPreviewKit(kit);
      function fieldRow(label, value) {
        const v = text(value);
        if (v) return `<p class="tk-muted"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(v)}</p>`;
        if (ownerPreview) return `<p class="tk-muted tk-field-empty"><strong>${escapeHtml(label)}:</strong> Not added yet</p>`;
        return "";
      }
      function listRow(label, items) {
        const list = (items || []).map(text).filter(Boolean);
        if (list.length) {
          return `<div class="tk-muted"><strong>${escapeHtml(label)}:</strong><ul class="tk-list">${list.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`;
        }
        if (ownerPreview) return `<p class="tk-muted tk-field-empty"><strong>${escapeHtml(label)}:</strong> Not added yet</p>`;
        return "";
      }
      return `
        <div class="tk-binder-section-body">
          <h3 class="tk-section-title">Weekly Plan</h3>
          <p class="tk-muted">Monday through Friday — focus, materials, and teaching supports.</p>
          <div class="tk-week-grid">
            ${days.map((day) => `
              <article class="tk-binder-block${day.incomplete ? " is-incomplete" : ""}">
                <h4>${escapeHtml(day.dayLabel || day.day)}</h4>
                ${day.focus
                  ? `<p class="tk-muted"><strong>Daily focus:</strong> ${escapeHtml(day.focus)}</p>`
                  : (ownerPreview
                    ? `<p class="tk-muted tk-field-empty"><strong>Daily focus:</strong> Not added yet — Quality Review will block approval until set.</p>`
                    : `<p class="tk-muted">Focus not set for this day.</p>`)}
                <p class="tk-muted"><strong>${escapeHtml(String(day.activityCount || 0))}</strong> activities</p>
                ${fieldRow("Circle time", day.circleTime)}
                ${fieldRow("Book", day.book)}
                ${fieldRow("Song", day.song)}
                ${fieldRow("Invitation to play", day.invitationToPlay)}
                ${fieldRow("Sensory", day.sensory)}
                ${fieldRow("Fine motor", day.fineMotor)}
                ${fieldRow("Gross motor", day.grossMotor)}
                ${fieldRow("Art / creative", day.artCreative)}
                ${fieldRow("Small group", day.smallGroup)}
                ${fieldRow("Large group", day.largeGroup)}
                ${fieldRow("Indoor alternative", day.indoorAlternative)}
                ${fieldRow("Outdoor option", day.outdoorOption)}
                ${listRow("Daily materials", day.dailyMaterials)}
                ${fieldRow("Teacher preparation", day.teacherPreparation)}
                ${listRow("Suggested questions", day.suggestedQuestions)}
                ${listRow("Observation focus", day.observationFocus)}
                ${listRow("Transition support", day.transitionSupport)}
                ${fieldRow("Family connection", day.familyConnection)}
                ${fieldRow("Teacher notes", day.teacherNotes)}
                ${(day.activityLinks || []).length ? `
                  <div class="tk-muted"><strong>Activity links:</strong>
                    <div class="tk-chips">${(day.activityLinks || []).map((link) => `
                      <button type="button" class="tk-chip tk-chip-btn" data-tk-open-activity="${escapeHtml(link.id)}" data-tk-from-binder="1">${escapeHtml(link.title)}</button>
                    `).join("")}</div>
                  </div>
                ` : ""}
                <button type="button" class="tk-btn tk-btn-ghost tk-btn-sm" data-tk-day="${escapeHtml(day.day)}">Open Today view</button>
              </article>
            `).join("") || emptyBinderStateHtml("Weekly Plan", ownerPreview)}
          </div>
        </div>
      `;
    }

    if (tabId === "activities") {
      const ownerPreview = isOwnerPreviewKit(kit);
      const activities = (content.activities || kit.companion?.activities || [])
        .filter((item) => !removed[item.id]);
      return `
        <div class="tk-binder-section-body">
          <h3 class="tk-section-title">Activities</h3>
          <p class="tk-muted">Reusable teaching resources — open any card for full directions.</p>
          <div class="tk-stack">
            ${activities.map((activity) => {
              const thumb = activity.examplePhotoUrl || activity.exampleImageUrl || activity.setupPhotoUrl || activity.setupImageUrl;
              return `
              <article class="tk-binder-activity">
                <div class="tk-binder-activity-media">
                  ${thumb
                    ? lazyImgHtml(thumb, activity.exampleAlt || `Example for ${activity.title}`)
                    : (ownerPreview
                      ? `<div class="tk-photo-placeholder tk-photo-missing tk-photo-placeholder-sm" data-tk-image-missing="example">Image not added yet</div>`
                      : "")}
                </div>
                <div>
                  <h4>${escapeHtml(activity.title)}</h4>
                  <p class="tk-muted">${escapeHtml(activity.activityCategory || "")}${activity.dayOfWeek ? ` · ${escapeHtml(DAY_SHORT[activity.dayOfWeek] || activity.dayOfWeek)}` : ""}</p>
                  <p class="tk-muted">${escapeHtml(activity.learningObjective || activity.description || "Open for materials, setup, steps, and prompts.")}</p>
                  <button type="button" class="tk-btn tk-btn-secondary tk-btn-sm" data-tk-open-activity="${escapeHtml(activity.id)}" data-tk-from-binder="1">Open activity</button>
                </div>
              </article>
            `;
            }).join("") || emptyBinderStateHtml("Activities", ownerPreview)}
          </div>
        </div>
      `;
    }

    if (tabId === "printables") {
      const printables = content.printables || kit.companion?.printables || [];
      return `
        <div class="tk-binder-section-body">
          <h3 class="tk-section-title">Printables</h3>
          <p class="tk-muted">Ink-friendly resources for the week. PDFs generate only when you print.</p>
          <div class="tk-stack">
            ${printables.map((printable) => `
              <article class="tk-binder-block">
                <h4>${escapeHtml(printable.title || "Printable")}</h4>
                <p class="tk-muted">${escapeHtml(printable.kind || printable.type || "Classroom printable")}</p>
                ${(printable.usedInWeek || []).length
                  ? `<div class="tk-used-map">${printable.usedInWeek.map((slot) => `<span class="tk-used-pill">${escapeHtml(`${slot.dayLabel || slot.day} · ${slot.moment || ""}`)}</span>`).join("")}</div>`
                  : ""}
              </article>
            `).join("") || emptyBinderStateHtml("Printables", isOwnerPreviewKit(kit))}
          </div>
        </div>
      `;
    }

    if (tabId === "songs") {
      const songs = content.songs || kit.companion?.songs || [];
      const ownerPreview = isOwnerPreviewKit(kit);
      return `
        <div class="tk-binder-section-body">
          <h3 class="tk-section-title">Songs</h3>
          <div class="tk-stack">
            ${songs.map((song) => `
              <article class="tk-binder-block">
                <h4>${escapeHtml(song.title || "Song")}</h4>
                ${song.rightsStatus ? `<p class="tk-muted tk-card-meta"><strong>Rights:</strong> ${escapeHtml(presentRights(song.rightsStatus))}</p>` : ""}
                ${hasDisplayValue(song.tune) ? `<p class="tk-muted"><strong>Tune:</strong> ${escapeHtml(song.tune)}</p>` : ""}
                ${hasDisplayValue(song.whenToUse) ? `<p class="tk-muted"><strong>When to use:</strong> ${escapeHtml(song.whenToUse)}</p>` : ""}
                ${hasDisplayValue(song.teacherDirections) ? detailBlockHtml("Teacher directions", `<p class="tk-muted">${escapeHtml(song.teacherDirections)}</p>`) : ""}
                ${song.lyricsPrintable && song.lyrics ? detailBlockHtml("Lyrics", `<p class="tk-muted tk-pre tk-lyrics">${escapeHtml(song.lyrics)}</p>`) : (song.lyrics ? "" : (ownerPreview ? `<p class="tk-muted tk-field-empty">Lyrics not added (or not printable for rights reasons).</p>` : ""))}
                ${hasDisplayValue(song.motions) ? `<p class="tk-muted"><strong>Motions:</strong> ${escapeHtml(song.motions)}</p>` : ""}
                ${hasDisplayValue(song.ageAdaptations) ? detailBlockHtml("Age adaptations", `<p class="tk-muted">${escapeHtml(song.ageAdaptations)}</p>`) : ""}
                ${song.linkedWeekday ? `<p class="tk-muted tk-card-meta"><strong>Linked day:</strong> ${escapeHtml(presentLabel(song.linkedWeekday))}</p>` : ""}
              </article>
            `).join("") || emptyBinderStateHtml("Songs", ownerPreview)}
          </div>
        </div>
      `;
    }

    if (tabId === "books") {
      const books = content.books || kit.companion?.books || [];
      const ownerPreview = isOwnerPreviewKit(kit);
      return `
        <div class="tk-binder-section-body">
          <h3 class="tk-section-title">Books</h3>
          <div class="tk-stack">
            ${books.map((book) => `
              <article class="tk-binder-block">
                <h4>${escapeHtml(book.title || "Book")}</h4>
                ${book.author ? `<p class="tk-muted">by ${escapeHtml(book.author)}</p>` : ""}
                ${book.suggestedWeekday ? `<p class="tk-muted"><strong>Suggested day:</strong> ${escapeHtml(book.suggestedWeekday)}</p>` : ""}
                ${book.whyThisBook ? `<p class="tk-muted"><strong>Why it fits:</strong> ${escapeHtml(book.whyThisBook)}</p>` : ""}
                ${(book.beforeReadingQuestions || []).length ? `<div class="tk-muted"><strong>Before reading</strong><ul class="tk-list">${book.beforeReadingQuestions.map((q) => `<li>${escapeHtml(q)}</li>`).join("")}</ul></div>` : ""}
                ${(book.duringReadingPrompts || []).length ? `<div class="tk-muted"><strong>During reading</strong><ul class="tk-list">${book.duringReadingPrompts.map((q) => `<li>${escapeHtml(q)}</li>`).join("")}</ul></div>` : ""}
                ${(book.afterReadingQuestions || book.questions || book.readAloudQuestions || []).length
                  ? `<div class="tk-muted"><strong>After reading</strong><ul class="tk-list">${(book.afterReadingQuestions || book.questions || book.readAloudQuestions).map((q) => `<li>${escapeHtml(q)}</li>`).join("")}</ul></div>`
                  : (ownerPreview ? `<p class="tk-muted tk-field-empty">Discussion questions not added yet.</p>` : "")}
                ${(book.vocabularyConnections || []).length ? `<p class="tk-muted"><strong>Vocabulary:</strong> ${escapeHtml(book.vocabularyConnections.join(" · "))}</p>` : ""}
                ${book.extensionIdea ? `<p class="tk-muted"><strong>Extension:</strong> ${escapeHtml(book.extensionIdea)}</p>` : ""}
                ${(book.alternativeBooks || []).length ? `<p class="tk-muted"><strong>Alternatives:</strong> ${escapeHtml(book.alternativeBooks.join(" · "))}</p>` : ""}
                ${book.libraryNote ? `<p class="tk-muted"><strong>Library:</strong> ${escapeHtml(book.libraryNote)}</p>` : ""}
              </article>
            `).join("") || emptyBinderStateHtml("Books", ownerPreview)}
          </div>
        </div>
      `;
    }

    if (tabId === "examples") {
      const ownerPreview = isOwnerPreviewKit(kit);
      const withPhotos = content.activitiesWithPhotos
        || (kit.companion?.activities || []).filter((card) => card.hasExamplePhoto || card.hasSetupPhoto);
      const allActs = kit.companion?.activities || [];
      const gallerySource = withPhotos.length ? withPhotos : (ownerPreview ? allActs : []);
      return `
        <div class="tk-binder-section-body">
          <h3 class="tk-section-title">Example Images</h3>
          <p class="tk-muted">Classroom-achievable setup and finished examples. Original Little Learner Hub assets only.</p>
          <div class="tk-example-gallery">
            ${gallerySource.map((activity) => `
              <figure class="tk-example-card">
                ${activity.examplePhotoUrl || activity.setupPhotoUrl || activity.exampleImageUrl || activity.setupImageUrl
                  ? lazyImgHtml(
                    activity.examplePhotoUrl || activity.exampleImageUrl || activity.setupPhotoUrl || activity.setupImageUrl,
                    activity.exampleAlt || activity.setupAlt || `Visual example for ${activity.title}`,
                  )
                  : `<div class="tk-photo-placeholder tk-photo-missing">${ownerPreview ? "Image not added yet" : "No image"}</div>`}
                <figcaption>
                  <strong>${escapeHtml(activity.title)}</strong>
                  <span class="tk-muted">${activity.hasSetupPhoto && activity.hasExamplePhoto ? "Setup + finished" : (activity.hasSetupPhoto ? "Setup" : (activity.hasExamplePhoto ? "Finished example" : (ownerPreview ? "Needs images" : "")))}</span>
                </figcaption>
              </figure>
            `).join("") || emptyBinderStateHtml("Example Images", ownerPreview)}
          </div>
        </div>
      `;
    }

    if (tabId === "teacher_toolkit") {
      const toolkit = content || {};
      const ownerPreview = isOwnerPreviewKit(kit);
      const blocks = [
        ["Teacher preparation", toolkit.teacherPreparation, "text"],
        ["Teacher tips", toolkit.teacherTips, "list"],
        ["Setup and cleanup shortcuts", toolkit.setupCleanupShortcuts, "list"],
        ["Daily materials summary", toolkit.dailyMaterialsSummary, "text"],
        ["Master materials checklist", toolkit.masterMaterialsChecklist, "list"],
        ["Material substitutions", toolkit.materialSubstitutions, "list"],
        ["Vocabulary", toolkit.vocabulary, "list"],
        ["Observation focus", toolkit.observationFocus, "list"],
        ["Observation prompts", toolkit.observationPrompts, "list"],
        ["Documentation prompts (milestones)", toolkit.documentationPrompts, "list"],
        ["Mixed-age adaptations", toolkit.mixedAgeAdaptations, "text"],
        ["Extra-support adaptations", toolkit.extraSupportAdaptations, "text"],
        ["Additional-challenge extensions", toolkit.challengeExtensions, "text"],
        ["Small-group options", toolkit.smallGroupOptions, "text"],
        ["Large-group options", toolkit.largeGroupOptions, "text"],
        ["Indoor alternatives", toolkit.indoorAlternatives, "text"],
        ["Outdoor options", toolkit.outdoorOptions, "text"],
        ["Family connection", toolkit.familyConnection, "text"],
        ["Safety and inclusion notes", toolkit.safetyInclusionNotes, "text"],
        ["End-of-week reflection", toolkit.endOfWeekReflection, "text"],
        ["Suggested questions to ask children", toolkit.suggestedQuestions, "list"],
        ["Prep checklist", toolkit.prepChecklist, "list"],
        ["Teacher notes", toolkit.notes, "text"],
      ];
      const rendered = blocks.map(([label, value, kind]) => {
        if (kind === "list") {
          const items = Array.isArray(value) ? value.filter(Boolean) : [];
          if (!items.length) {
            return ownerPreview
              ? `<article class="tk-binder-block tk-field-empty"><h4>${escapeHtml(label)}</h4><p class="tk-muted">Not added yet.</p></article>`
              : "";
          }
          return `<article class="tk-binder-block"><h4>${escapeHtml(label)}</h4><ul class="tk-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></article>`;
        }
        const v = text(value);
        if (!v) {
          return ownerPreview
            ? `<article class="tk-binder-block tk-field-empty"><h4>${escapeHtml(label)}</h4><p class="tk-muted">Not added yet.</p></article>`
            : "";
        }
        return `<article class="tk-binder-block"><h4>${escapeHtml(label)}</h4><p class="tk-muted tk-pre">${escapeHtml(v)}</p></article>`;
      }).filter(Boolean).join("");
      return `
        <div class="tk-binder-section-body">
          <h3 class="tk-section-title">Teacher Toolkit</h3>
          <p class="tk-muted">Preparation, adaptations, materials, observation, and week-end reflection — keep this tab handy while you teach.</p>
          ${rendered || emptyBinderStateHtml("Teacher Toolkit", ownerPreview)}
        </div>
      `;
    }

    return `<div class="tk-binder-section-body"><p class="tk-muted">Section unavailable.</p></div>`;
  }

  function binderSurfaceHtml(kit, state, chrome) {
    const binder = kit.companion?.providerBinder || kit.companion?.binder || {};
    const cover = binder.cover || {};
    const tabs = visibleBinderTabs(kit, chrome);
    const activeTab = tabs.some((tab) => tab.id === state.binderTab)
      ? state.binderTab
      : (tabs[0]?.id || "overview");
    const removed = state.removedActivityIds || {};
    const activityCount = (kit.companion?.activities || []).filter((item) => !removed[item.id]).length;
    return `
      <section class="tk-surface tk-binder-digital" data-tk-panel="binder">
        <header class="tk-binder-hero">
          ${cover.imageUrl || kit.coverImageUrl
            ? `<div class="tk-binder-cover-media">${lazyImgHtml(cover.imageUrl || kit.coverImageUrl, cover.imageAlt || kit.coverImageAlt || kit.title || "Lesson cover")}</div>`
            : `<div class="tk-binder-cover-media tk-binder-cover-fallback" aria-hidden="true"></div>`}
          <div class="tk-binder-hero-copy">
            <div class="tk-binder-mark">${escapeHtml(cover.brand || "Little Learner Hub")}</div>
            <h3 class="tk-banner-title">${escapeHtml(cover.title || kit.title || "Teaching Kit")}</h3>
            <p class="tk-lead">${escapeHtml(cover.subtitle || "Everything you need for this week is already here.")}</p>
            <div class="tk-chips">
              ${chipsHtml([kit.age, kit.plan, kit.theme, `${activityCount} activities`, "Print-friendly"])}
            </div>
          </div>
        </header>
        <nav class="tk-binder-section-nav" role="tablist" aria-label="Teaching Kit binder sections">
          ${tabs.map((tab) => `
            <button type="button" role="tab" class="tk-binder-section-tab${tab.id === activeTab ? " is-active" : ""}" data-tk-binder-tab="${escapeHtml(tab.id)}" aria-selected="${tab.id === activeTab ? "true" : "false"}">${escapeHtml(tab.label)}${tab.empty ? ` <span class="tk-tab-empty-mark" title="Empty in owner preview">·</span>` : ""}</button>
          `).join("") || `<span class="tk-muted">No binder sections with content yet.</span>`}
        </nav>
        <div class="tk-binder-section-panel" data-tk-binder-panel="${escapeHtml(activeTab)}">
          ${tabs.length ? binderSectionBodyHtml(kit, activeTab, state) : `
            <p class="tk-muted">This lesson does not have binder content yet. Use Start Week or Today while the plan is filled in.</p>
          `}
        </div>
        <div class="tk-stack tk-binder-actions">
          <button type="button" class="tk-btn tk-btn-ghost" data-tk-goto="build">Build &amp; Print</button>
          ${state.printCenterEnabled
            ? `<button type="button" class="tk-btn tk-btn-primary" data-tk-print-binder>Print binder</button>
               <button type="button" class="tk-btn tk-btn-secondary" data-tk-download-binder>Download PDF</button>`
            : ""}
          <button type="button" class="tk-btn tk-btn-secondary" data-tk-goto="today">Back to Today</button>
        </div>
      </section>
    `;
  }

  function surfaceHtml(kit, state, chrome) {
    switch (state.surface) {
      case "setup":
        return setupSurfaceHtml(kit, state, chrome);
      case "today":
        return todaySurfaceHtml(kit, state, chrome);
      case "activity":
        return activitySurfaceHtml(kit, state, chrome);
      case "build":
        return buildSurfaceHtml(kit, state, chrome);
      case "binder":
        return binderSurfaceHtml(kit, state, chrome);
      case "start":
      default:
        return startSurfaceHtml(kit, chrome);
    }
  }

  function workspaceHtml(kit, state, chrome) {
    const navSurface = state.surface === "activity"
      ? (state.returnSurface || "today")
      : state.surface;
    const age = chrome.age || kit.age || "";
    // Prefer chrome.planLabel when provided (including "") so entitled members can hide Free/Pro tags.
    const planLabel = Object.prototype.hasOwnProperty.call(chrome || {}, "planLabel")
      ? String(chrome.planLabel || "")
      : String(kit.plan || "");
    const planBadgeClass = /pro/i.test(String(planLabel)) ? "pro-badge" : "free-badge";
    const theme = chrome.theme || kit.theme || "";
    const ownerPreview = chrome.ownerPreview === true;
    const ownerPreviewBanner = ownerPreview ? `
          <div class="tk-owner-preview-banner" data-tk-owner-preview-banner role="status">
            <strong>Owner preview only</strong>
            <p class="tk-muted">You are previewing the Teaching Kit (Viewer, Print Center, and Attachments) on your owner account. Every other account still uses the current lesson experience until customer flags are enabled.</p>
          </div>
        ` : "";
    return `
      <div class="lesson-workspace teaching-kit-workspace${ownerPreview ? " is-owner-preview" : ""}" data-lesson-workspace data-teaching-kit-workspace${ownerPreview ? " data-tk-owner-preview=\"1\"" : ""}>
        <div class="lesson-workspace-topchrome">
          <header class="lesson-workspace-header">
            <button type="button" class="lesson-workspace-back ghost-button" data-lesson-workspace-back>${escapeHtml(chrome.backLabel || "Back")}</button>
            <div class="lesson-workspace-title-block">
              <h2 class="lesson-workspace-title">${escapeHtml(kit.title || chrome.title || "Teaching Kit")}</h2>
              <p class="lesson-workspace-meta">
                ${age ? `<span class="tag">${escapeHtml(age)}</span>` : ""}
                ${planLabel ? `<span class="tag access-tag ${planBadgeClass}">${escapeHtml(planLabel)}</span>` : ""}
                ${theme ? `<span class="tag lesson-workspace-theme-tag">${escapeHtml(theme)}</span>` : ""}
                <span class="tag tk-mode-tag">Teaching Kit</span>
                ${ownerPreview ? `<span class="tag tk-owner-preview-tag">Owner preview</span>` : ""}
              </p>
            </div>
            ${chrome.saveButtonHtml || ""}
          </header>
          ${ownerPreviewBanner}
          <nav class="lesson-workspace-tabs tk-ops-nav" role="tablist" aria-label="Teaching Kit sections">
            ${SURFACES.map((item) => `
              <button type="button" role="tab" class="lesson-workspace-tab tk-ops-tab${navSurface === item.id ? " is-active" : ""}" data-tk-goto="${item.id}" aria-selected="${navSurface === item.id ? "true" : "false"}">${escapeHtml(item.label)}</button>
            `).join("")}
          </nav>
        </div>
        <div class="tk-workspace-scroll" data-tk-workspace-scroll>
          <div class="lesson-workspace-panels tk-panels">
            <div class="lesson-workspace-panel is-active tk-panel-host" data-tk-host>
              ${surfaceHtml(kit, state, chrome)}
            </div>
          </div>
          <div class="tk-workspace-sticky-actions" data-tk-sticky-actions>
            ${chrome.actionBarsHtml || ""}
          </div>
          ${ownerPreview ? "" : (chrome.feedbackHtml || "")}
          ${ownerPreview ? "" : (chrome.copyrightHtml || "")}
        </div>
        ${chrome.actionSheetHtml || ""}
      </div>
    `;
  }

  function defaultState(kit, options) {
    const opts = options && typeof options === "object" ? options : {};
    const today = kit?.companion?.today?.day || "monday";
    const printApi = typeof globalThis !== "undefined" ? globalThis.LLHTeachingKitPrint : null;
    const presetId = "week_binder";
    const initialActivityId = text(opts.initialActivityId);
    const initialSurface = text(opts.initialSurface);
    const knownSurface = SURFACES.some((item) => item.id === initialSurface) || initialSurface === "activity";
    const surface = initialActivityId
      ? "activity"
      : (knownSurface ? initialSurface : "start");
    const binderTabs = visibleBinderTabs(kit);
    const initialBinderTab = text(opts.initialBinderTab);
    return {
      surface,
      day: text(opts.initialDay) || today,
      activityId: initialActivityId,
      binderTab: binderTabs.some((tab) => tab.id === initialBinderTab)
        ? initialBinderTab
        : (binderTabs[0]?.id || "overview"),
      openEverything: false,
      showSubstitute: false,
      returnSurface: "today",
      removedActivityIds: {},
      printCenterEnabled: Boolean(opts.printCenterEnabled),
      printPreset: presetId,
      printParts: printApi?.defaultPartsForPreset
        ? printApi.defaultPartsForPreset(presetId)
        : {
          cover: true,
          setup: true,
          daily: true,
          activities: true,
          songsBooks: true,
          vocabulary: true,
          family: true,
          observations: true,
          printables: true,
        },
      includeImages: true,
      inkSaver: false,
      paperSize: "letter",
      printActivityId: initialActivityId || "",
      printPrintableId: "",
      selectedResources: {
        overview: false,
        vocabulary: false,
        weekly: false,
        activities: true,
        songs: false,
        books: false,
        printables: false,
        materials: false,
        toolkit: false,
        days: [],
      },
    };
  }

  function renderInto(host, kit, state, chrome) {
    if (!host) return;
    host.innerHTML = `<article class="printable-resource-page curriculum-lesson-viewer lesson-workspace-article teaching-kit-article">${workspaceHtml(kit, state, chrome)}</article>`;
    host.classList.remove("teaching-kit-loading");
  }

  function syncOpsNav(root, state) {
    const navSurface = state.surface === "activity"
      ? (state.returnSurface || "today")
      : state.surface;
    root.querySelectorAll(".tk-ops-tab[data-tk-goto]").forEach((tab) => {
      const id = tab.getAttribute("data-tk-goto");
      const active = id === navSurface;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });
  }

  function bindWorkspace(root, ctx) {
    if (!root || !ctx || !ctx.kit) return () => {};
    const state = ctx.state || defaultState(ctx.kit);
    const chrome = ctx.chrome || {};
    const kit = ctx.kit;

    function focusPanel(host) {
      if (!host) return;
      host.classList.remove("tk-panel-enter");
      // Force reflow so the enter animation replays on each surface change.
      void host.offsetWidth;
      host.classList.add("tk-panel-enter");
      const heading = host.querySelector(".tk-banner-title, .tk-section-title, h3, h4");
      if (heading && typeof heading.focus === "function") {
        heading.setAttribute("tabindex", "-1");
        try { heading.focus({ preventScroll: true }); } catch { heading.focus(); }
      }
      const top = root.querySelector(".lesson-workspace-topchrome") || root;
      if (typeof top.scrollIntoView === "function") {
        top.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }

    function rerender(options) {
      const opts = options && typeof options === "object" ? options : {};
      const scrollHost = root.querySelector("[data-tk-workspace-scroll]");
      const savedScroll = opts.preserveScroll && scrollHost ? scrollHost.scrollTop : null;
      const host = root.querySelector("[data-tk-host]");
      if (host) {
        // Panel-only swap keeps chrome/listeners intact for snappy navigation.
        host.innerHTML = surfaceHtml(kit, state, chrome);
        syncOpsNav(root, state);
        if (!opts.preserveScroll) focusPanel(host);
        if (savedScroll != null && scrollHost) {
          scrollHost.scrollTop = savedScroll;
          requestAnimationFrame(() => {
            const again = root.querySelector("[data-tk-workspace-scroll]");
            if (again) again.scrollTop = savedScroll;
          });
        }
        return;
      }
      const article = root.closest("article") || root;
      const body = article.parentElement;
      if (!body) return;
      renderInto(body, kit, state, chrome);
      const nextRoot = body.querySelector("[data-teaching-kit-workspace]");
      if (nextRoot) bindWorkspace(nextRoot, { kit, state, chrome, onCopy: ctx.onCopy, onPrint: ctx.onPrint });
    }

    function onClick(event) {
      const preset = event.target.closest("[data-tk-print-preset]");
      if (preset) {
        const id = preset.getAttribute("data-tk-print-preset") || preset.value;
        const printApi = typeof globalThis !== "undefined" ? globalThis.LLHTeachingKitPrint : null;
        state.printPreset = id || state.printPreset;
        if (printApi?.defaultPartsForPreset) {
          state.printParts = printApi.defaultPartsForPreset(state.printPreset);
        }
        rerender();
        return;
      }

      const paper = event.target.closest("[data-tk-print-paper]");
      if (paper) {
        const id = paper.getAttribute("data-tk-print-paper") || paper.value;
        const printApi = typeof globalThis !== "undefined" ? globalThis.LLHTeachingKitPrint : null;
        state.paperSize = printApi?.normalizePaperSize
          ? printApi.normalizePaperSize(id)
          : (id === "a4" ? "a4" : "letter");
        return;
      }

      const part = event.target.closest("[data-tk-print-part]");
      if (part && part.matches("input")) {
        if (part.disabled) return;
        const key = part.getAttribute("data-tk-print-part");
        if (key) {
          state.printParts = { ...(state.printParts || {}), [key]: Boolean(part.checked) };
        }
        return;
      }

      const option = event.target.closest("[data-tk-print-option]");
      if (option && option.matches("input")) {
        const key = option.getAttribute("data-tk-print-option");
        if (key === "includeImages") state.includeImages = Boolean(option.checked);
        if (key === "inkSaver") state.inkSaver = Boolean(option.checked);
        return;
      }

      const printBtn = event.target.closest("[data-tk-print-binder], [data-tk-download-binder]");
      if (printBtn) {
        event.preventDefault();
        if (!state.printCenterEnabled) return;
        if (typeof ctx.onPrint === "function") {
          const selectedResources = state.printPreset === "selected_resources"
            ? {
              ...(state.selectedResources || {}),
              days: [...(state.selectedResources?.days || [])],
            }
            : null;
          ctx.onPrint({
            preset: state.printPreset,
            parts: state.printParts,
            removedActivityIds: state.removedActivityIds,
            day: state.day,
            activityId: state.printActivityId || state.activityId || "",
            printableId: state.printPrintableId || "",
            selectedResources,
            adminPreview: isOwnerPreviewKit(kit, chrome),
            includeImages: state.includeImages !== false,
            inkSaver: Boolean(state.inkSaver),
            paperSize: state.paperSize || "letter",
            intent: printBtn.hasAttribute("data-tk-download-binder") ? "download" : "print",
          });
        }
        return;
      }

      const printDay = event.target.closest("[data-tk-print-day]");
      if (printDay) {
        state.day = printDay.getAttribute("data-tk-print-day") || state.day;
        return;
      }

      const selectedRes = event.target.closest("[data-tk-selected-res]");
      if (selectedRes && selectedRes.matches("input")) {
        const key = selectedRes.getAttribute("data-tk-selected-res");
        if (key) {
          state.selectedResources = {
            ...(state.selectedResources || {}),
            [key]: Boolean(selectedRes.checked),
          };
        }
        return;
      }

      const selectedDay = event.target.closest("[data-tk-selected-day]");
      if (selectedDay && selectedDay.matches("input")) {
        const day = selectedDay.getAttribute("data-tk-selected-day");
        const days = new Set(state.selectedResources?.days || []);
        if (selectedDay.checked) days.add(day);
        else days.delete(day);
        state.selectedResources = {
          ...(state.selectedResources || {}),
          days: [...days],
        };
        return;
      }

      const binderTab = event.target.closest("[data-tk-binder-tab]");
      if (binderTab) {
        event.preventDefault();
        state.surface = "binder";
        state.binderTab = binderTab.getAttribute("data-tk-binder-tab") || state.binderTab;
        state.openEverything = false;
        state.showSubstitute = false;
        rerender();
        return;
      }

      const goto = event.target.closest("[data-tk-goto]");
      if (goto) {
        event.preventDefault();
        state.surface = goto.getAttribute("data-tk-goto") || "start";
        state.openEverything = false;
        state.showSubstitute = false;
        if (state.surface !== "activity") state.activityId = "";
        if (state.surface === "binder" && !state.binderTab) {
          state.binderTab = visibleBinderTabs(kit)[0]?.id || "overview";
        }
        rerender();
        return;
      }

      const dayBtn = event.target.closest("[data-tk-day]");
      if (dayBtn) {
        event.preventDefault();
        state.day = dayBtn.getAttribute("data-tk-day") || state.day;
        state.surface = "today";
        state.openEverything = false;
        rerender();
        return;
      }

      const openEverything = event.target.closest("[data-tk-open-everything]");
      if (openEverything) {
        event.preventDefault();
        state.surface = "today";
        state.openEverything = !state.openEverything;
        rerender({ preserveScroll: true });
        return;
      }

      const openActivity = event.target.closest("[data-tk-open-activity]");
      if (openActivity) {
        event.preventDefault();
        if (openActivity.getAttribute("data-tk-from-build")) state.returnSurface = "build";
        else if (openActivity.getAttribute("data-tk-from-binder")) state.returnSurface = "binder";
        else state.returnSurface = "today";
        state.activityId = openActivity.getAttribute("data-tk-open-activity") || "";
        state.surface = "activity";
        state.showSubstitute = Boolean(openActivity.getAttribute("data-tk-from-build"));
        state.openEverything = false;
        rerender();
        return;
      }

      const toggleSub = event.target.closest("[data-tk-toggle-substitute]");
      if (toggleSub) {
        event.preventDefault();
        state.showSubstitute = !state.showSubstitute;
        rerender();
        return;
      }

      const toggleActivity = event.target.closest("[data-tk-toggle-activity]");
      if (toggleActivity) {
        event.preventDefault();
        const id = toggleActivity.getAttribute("data-tk-toggle-activity");
        if (!id) return;
        if (state.removedActivityIds[id]) delete state.removedActivityIds[id];
        else state.removedActivityIds[id] = true;
        rerender();
        return;
      }

      const copyParent = event.target.closest("[data-tk-copy-parent]");
      if (copyParent) {
        event.preventDefault();
        const messageEl = root.querySelector("[data-tk-parent-message]");
        const message = text(messageEl?.textContent || kit.companion?.parentConnection?.readyToSendMessage || "");
        if (!message) return;
        if (typeof ctx.onCopy === "function") ctx.onCopy(message);
        else if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(message).catch(() => {});
        }
        copyParent.textContent = "Copied";
        setTimeout(() => {
          copyParent.textContent = "Copy message";
        }, 1600);
      }
    }

    function onKeydown(event) {
      const tab = event.target.closest(".tk-ops-tab[data-tk-goto], .tk-day[data-tk-day], .tk-binder-section-tab[data-tk-binder-tab]");
      if (!tab || !root.contains(tab)) return;
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "Home" && event.key !== "End") {
        return;
      }
      let group;
      if (tab.classList.contains("tk-day")) {
        group = Array.from(root.querySelectorAll(".tk-day[data-tk-day]"));
      } else if (tab.classList.contains("tk-binder-section-tab")) {
        group = Array.from(root.querySelectorAll(".tk-binder-section-tab[data-tk-binder-tab]"));
      } else {
        group = Array.from(root.querySelectorAll(".tk-ops-tab[data-tk-goto]"));
      }
      if (!group.length) return;
      const index = group.indexOf(tab);
      if (index < 0) return;
      event.preventDefault();
      let next = index;
      if (event.key === "ArrowRight") next = (index + 1) % group.length;
      if (event.key === "ArrowLeft") next = (index - 1 + group.length) % group.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = group.length - 1;
      group[next].focus();
      group[next].click();
    }

    root.addEventListener("click", onClick);
    root.addEventListener("keydown", onKeydown);
    function onChange(event) {
      const activitySelect = event.target.closest("[data-tk-print-activity]");
      if (activitySelect) {
        state.printActivityId = activitySelect.value || "";
      }
      const printableSelect = event.target.closest("[data-tk-print-printable]");
      if (printableSelect) {
        state.printPrintableId = printableSelect.value || "";
      }
    }
    root.addEventListener("change", onChange);
    const host = root.querySelector("[data-tk-host]");
    if (host) focusPanel(host);
    return () => {
      root.removeEventListener("click", onClick);
      root.removeEventListener("keydown", onKeydown);
      root.removeEventListener("change", onChange);
    };
  }

  /**
   * Browser entry: replace lesson workspace body when Teaching Kit viewer flag is on.
   * @returns {Promise<{ enhanced: boolean, reason: string, unbind?: Function }>}
   */
  async function enhanceLessonWorkspace(options) {
    const opts = options || {};
    const body = opts.body;
    const kitPayload = opts.teachingKit;
    const flags = opts.featureFlags || {};
    if (!body) return { enhanced: false, reason: "missing_body" };
    if (flags.teachingKitViewer !== true) return { enhanced: false, reason: "viewer_flag_off" };
    if (!kitPayload || kitPayload.ok === false || kitPayload.locked) {
      return { enhanced: false, reason: kitPayload?.locked ? "locked" : "unavailable" };
    }
    if (!kitPayload.companion) return { enhanced: false, reason: "missing_companion" };

    const kit = {
      ...kitPayload,
      featureFlags: {
        ...(kitPayload.featureFlags || {}),
        ...flags,
      },
    };
    const state = defaultState(kit, {
      printCenterEnabled: flags.teachingKitPrintCenter === true || opts.printCenterEnabled === true,
      initialActivityId: opts.initialActivityId,
      initialSurface: opts.initialSurface,
      initialDay: opts.initialDay,
      initialBinderTab: opts.initialBinderTab,
    });
    const chrome = {
      ...(opts.chrome || {}),
      ownerPreview: (opts.chrome && opts.chrome.ownerPreview === true)
        || flags.ownerPreview === true
        || kit.featureFlags?.ownerPreview === true,
    };
    renderInto(body, kit, state, chrome);
    const root = body.querySelector("[data-teaching-kit-workspace]");
    if (!root) return { enhanced: false, reason: "render_failed" };
    const unbind = bindWorkspace(root, {
      kit,
      state,
      chrome,
      onCopy: opts.onCopy,
      onPrint: opts.onPrint,
    });
    body.dataset.teachingKitEnhanced = "1";
    body.classList.remove("teaching-kit-loading");
    return { enhanced: true, reason: "ok", state, unbind, sparse: isSparseKit(kitPayload) };
  }

  return {
    SURFACES,
    BINDER_SECTION_ORDER,
    WEEKDAYS,
    escapeHtml,
    presentLabel,
    presentRights,
    presentKind,
    hasDisplayValue,
    isSparseKit,
    visibleBinderTabs,
    loadingWorkspaceHtml,
    renderLoadingWorkspace,
    defaultState,
    workspaceHtml,
    surfaceHtml,
    binderSurfaceHtml,
    renderInto,
    bindWorkspace,
    enhanceLessonWorkspace,
  };
});
