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
    { id: "build", label: "Build / Print" },
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
          <div class="tk-stack">
            <button type="button" class="tk-btn tk-btn-primary" data-tk-goto="setup">Open Monday Morning Setup</button>
            <button type="button" class="tk-btn tk-btn-secondary" data-tk-goto="today">Open Today’s Classroom</button>
            <button type="button" class="tk-btn tk-btn-ghost" data-tk-goto="build">Build &amp; Print My Kit</button>
          </div>
        </div>
        <div class="tk-grid-3">
          <article class="tk-card"><h4>Before children arrive</h4><p class="tk-muted">Materials, prep tasks, supplies, and what to print.</p></article>
          <article class="tk-card"><h4>During the day</h4><p class="tk-muted">Schedule, activities, books, songs, transitions, notes.</p></article>
          <article class="tk-card"><h4>In your hands</h4><p class="tk-muted">A binder-ready kit you can customize before printing.</p></article>
        </div>
      </section>
    `;
  }

  function setupSurfaceHtml(kit, state) {
    const setup = kit.companion?.mondayMorningSetup || {};
    const missing = setup.missingMaterials || [];
    const breakdown = setup.prepBreakdown || {};
    return `
      <section class="tk-surface" data-tk-panel="setup">
        <div class="tk-banner-time">
          <div>
            <div class="tk-eyebrow">Estimated prep time</div>
            <div class="tk-big">About ${escapeHtml(String(setup.estimatedPrepMinutes || 0))} minutes</div>
            <p class="tk-muted">Gather ${escapeHtml(String(breakdown.gather || 0))} min · stations ${escapeHtml(String(breakdown.stations || 0))} min · print ${escapeHtml(String(breakdown.print || 0))} min</p>
          </div>
          <div class="tk-chips">
            <span class="tk-chip tk-chip-ok">${escapeHtml(String(Math.max(0, (setup.materials || []).length - missing.length)))} listed</span>
            ${missing.length ? `<span class="tk-chip tk-chip-danger">${escapeHtml(String(missing.length))} missing</span>` : `<span class="tk-chip tk-chip-ok">Ready</span>`}
          </div>
        </div>
        ${missing.length ? `
          <div class="tk-banner-missing">
            <div>
              <strong>Needs attention before the week begins</strong>
              <p class="tk-muted tk-danger-text">${escapeHtml(missing.join(" · "))}</p>
            </div>
          </div>
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

    return `
      <section class="tk-surface" data-tk-panel="today">
        <div class="tk-sticky-today">
          <div>
            <h3>${escapeHtml(today.dayLabel || DAY_SHORT[day] || "Today")} · leave this open</h3>
            <p class="tk-muted">${escapeHtml(today.focus || kit.theme || "Classroom companion for the day")}</p>
          </div>
          <button type="button" class="tk-btn tk-btn-primary tk-btn-lg" data-tk-open-everything>${open ? "Close packet" : "Open Everything I Need Today"}</button>
        </div>
        <div class="tk-day-strip" role="tablist" aria-label="Week days">
          ${WEEKDAYS.map((weekday) => `
            <button type="button" role="tab" class="tk-day${weekday === day ? " is-active" : ""}" data-tk-day="${weekday}" aria-selected="${weekday === day ? "true" : "false"}">${escapeHtml(DAY_SHORT[weekday])}</button>
          `).join("")}
        </div>
        ${open ? `
          <div class="tk-tray" data-tk-tray>
            <div class="tk-tray-head">
              <h4>Everything for ${escapeHtml(today.dayLabel || day)}</h4>
              <span class="tk-chip tk-chip-ok">${escapeHtml(String(dayPacketItems.length))} items</span>
            </div>
            ${dayPacketItems.map((item) => `
              <div class="tk-tray-item">
                <div class="tk-thumb" aria-hidden="true"></div>
                <div>
                  <strong>${escapeHtml(item.title)}</strong>
                  <p class="tk-muted">${escapeHtml(item.detail || item.kind)}</p>
                  ${item.usedInWeek && item.usedInWeek.length
                    ? `<div class="tk-used-map">${item.usedInWeek.map((slot) => `<span class="tk-used-pill">${escapeHtml(`${slot.dayLabel || slot.day} · ${slot.moment}`)}</span>`).join("")}</div>`
                    : ""}
                  ${item.body ? `<div class="tk-message">${escapeHtml(item.body)}</div>` : ""}
                </div>
                ${item.kind === "activity"
                  ? `<button type="button" class="tk-btn tk-btn-secondary tk-btn-sm" data-tk-open-activity="${escapeHtml(item.id)}">Open</button>`
                  : item.kind === "parent_message"
                    ? `<button type="button" class="tk-btn tk-btn-primary tk-btn-sm" data-tk-copy-parent>Copy</button>`
                    : `<span class="tk-chip">${escapeHtml(item.kind)}</span>`}
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
                  <div class="tk-kind">${escapeHtml(slot.kind)}</div>
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
                      <strong>${escapeHtml(activity.title)}</strong>
                      <p class="tk-muted">${escapeHtml(activity.activityCategory || activity.sectionId || "activity")}</p>
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

  function activitySurfaceHtml(kit, state) {
    const activity = activityById(kit, state.activityId);
    if (!activity) {
      return `<section class="tk-surface" data-tk-panel="activity"><p class="tk-muted">Activity not found.</p><button type="button" class="tk-btn tk-btn-ghost" data-tk-goto="today">Back to Today</button></section>`;
    }
    const showSub = state.showSubstitute;
    return `
      <section class="tk-surface" data-tk-panel="activity">
        <div class="tk-activity-chrome">
          <button type="button" class="tk-btn tk-btn-ghost tk-btn-sm" data-tk-goto="${escapeHtml(state.returnSurface === "build" ? "build" : "today")}">${state.returnSurface === "build" ? "Back to Build / Print" : "Back to Today"}</button>
          <button type="button" class="tk-btn tk-btn-accent tk-btn-sm" data-tk-toggle-substitute aria-expanded="${showSub ? "true" : "false"}">Substitute This Activity</button>
        </div>
        <h3 class="tk-activity-title">${escapeHtml(activity.title)}</h3>
        <p class="tk-muted">${escapeHtml(activity.activityCategory || "")}${activity.dayOfWeek ? ` · ${escapeHtml(DAY_SHORT[activity.dayOfWeek] || activity.dayOfWeek)}` : ""}</p>
        <div class="tk-photo-pair">
          <div class="tk-photo">
            ${activity.examplePhotoUrl
              ? `<img src="${escapeHtml(activity.examplePhotoUrl)}" alt="Example photo for ${escapeHtml(activity.title)}" />`
              : `<div class="tk-photo-placeholder">Example photo</div>`}
            <div class="tk-photo-caption">Example photo</div>
          </div>
          <div class="tk-photo tk-photo-setup">
            ${activity.setupPhotoUrl
              ? `<img src="${escapeHtml(activity.setupPhotoUrl)}" alt="Setup photo for ${escapeHtml(activity.title)}" />`
              : `<div class="tk-photo-placeholder">Setup photo</div>`}
            <div class="tk-photo-caption">Setup photo</div>
          </div>
        </div>
        <div class="tk-grid-2">
          <div class="tk-stack">
            <article class="tk-card"><h4>Setup instructions</h4><p class="tk-muted tk-pre">${escapeHtml(activity.setup || "No setup notes yet.")}</p></article>
            <article class="tk-card"><h4>Steps</h4><p class="tk-muted tk-pre">${escapeHtml(activity.steps || "No steps listed yet.")}</p></article>
            <article class="tk-card"><h4>Cleanup tips</h4><ul class="tk-list">${(activity.cleanupTips || []).map((tip) => `<li>${escapeHtml(tip)}</li>`).join("") || "<li class=\"tk-muted\">None listed</li>"}</ul></article>
          </div>
          <div class="tk-stack">
            <article class="tk-card"><h4>Materials</h4><p class="tk-muted">${escapeHtml((activity.materials || []).join(" · ") || activity.materialsText || "None listed")}</p></article>
            <article class="tk-card"><h4>Learning objective</h4><p class="tk-muted">${escapeHtml(activity.learningObjective || "None listed")}</p></article>
            <article class="tk-card">
              <h4>Teacher prompts</h4>
              ${(activity.teacherPrompts || []).map((prompt) => `
                <div class="tk-prompt"><strong>${escapeHtml(prompt.label || "Prompt")}</strong>${escapeHtml(prompt.text || "")}</div>
              `).join("") || `<p class="tk-muted">None listed</p>`}
            </article>
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
            <article class="tk-card tk-card-warn">
              <h4>Observation ideas</h4>
              <ul class="tk-list">${(activity.observationIdeas || []).map((idea) => `<li>${escapeHtml(idea)}</li>`).join("") || "<li class=\"tk-muted\">None listed</li>"}</ul>
            </article>
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

  function buildSurfaceHtml(kit, state) {
    const build = kit.companion?.buildMyKit || {};
    const removed = state.removedActivityIds || {};
    const activities = build.activities || [];
    const includedCount = activities.filter((item) => !removed[item.id]).length;
    const printApi = typeof globalThis !== "undefined" ? globalThis.LLHTeachingKitPrint : null;
    const presets = printApi?.PRESETS || [];
    const partLabels = printApi?.PART_LABELS || {};
    const parts = state.printParts || {};
    const printEnabled = Boolean(state.printCenterEnabled);
    return `
      <section class="tk-surface" data-tk-panel="build">
        <div class="tk-grid-2">
          <div class="tk-stack">
            <h3 class="tk-section-title">Build My Kit · Print Center</h3>
            <article class="tk-card">
              <h4>Print pack</h4>
              <div class="tk-stack">
                ${presets.map((preset) => `
                  <label class="tk-radio-row">
                    <input type="radio" name="tk-print-preset" value="${escapeHtml(preset.id)}" ${state.printPreset === preset.id ? "checked" : ""} data-tk-print-preset="${escapeHtml(preset.id)}" />
                    <span>${escapeHtml(preset.label)}</span>
                  </label>
                `).join("") || `<p class="tk-muted">Print module not loaded.</p>`}
              </div>
            </article>
            <article class="tk-card">
              <h4>Sections</h4>
              ${Object.keys(partLabels).map((key) => `
                <label class="tk-check-inline">
                  <input type="checkbox" data-tk-print-part="${escapeHtml(key)}" ${parts[key] ? "checked" : ""} />
                  <span>${escapeHtml(partLabels[key])}</span>
                </label>
              `).join("")}
            </article>
            <article class="tk-card">
              <h4>Options</h4>
              <label class="tk-check-inline">
                <input type="checkbox" data-tk-print-option="includeImages" ${state.includeImages !== false ? "checked" : ""} />
                <span>Include example / setup photos</span>
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
          <div class="tk-stack">
            <article class="tk-card">
              <h4>Binder always branded</h4>
              <ul class="tk-list">
                <li>Cover page with LLH mark</li>
                <li>Color tab section dividers</li>
                <li>Running header + numbered footer</li>
                <li>US Letter or A4 classroom layout</li>
              </ul>
            </article>
            <article class="tk-card tk-card-soft">
              <h4>Ready to print</h4>
              <p class="tk-muted"><strong>${escapeHtml(String(includedCount))} activities</strong> · ${escapeHtml(state.printPreset || "week_binder")} · ${escapeHtml(state.paperSize === "a4" ? "A4" : "US Letter")}</p>
              <button type="button" class="tk-btn tk-btn-primary" data-tk-print-binder ${printEnabled ? "" : "disabled"} aria-disabled="${printEnabled ? "false" : "true"}">${printEnabled ? "Print Teaching Kit binder" : "Print Teaching Kit binder (flagged off)"}</button>
              <button type="button" class="tk-btn tk-btn-secondary" data-tk-goto="binder">Preview binder</button>
              <p class="tk-muted tk-note" id="tk-print-help">${printEnabled
                ? "Opens a professional binder print layout. Trial exports use the existing watermarked allowance path."
                : "Enable <strong>teachingKitPrintCenter</strong> locally to print. Selection still works for preview."}</p>
            </article>
          </div>
        </div>
      </section>
    `;
  }

  function binderSurfaceHtml(kit, state) {
    const binder = kit.companion?.binder || {};
    const cover = binder.cover || {};
    const removed = state.removedActivityIds || {};
    const activityCount = (kit.companion?.activities || []).filter((item) => !removed[item.id]).length;
    return `
      <section class="tk-surface" data-tk-panel="binder">
        <div class="tk-binder-stage">
          <div class="tk-binder-spread">
            <div class="tk-binder-cover">
              <div>
                <div class="tk-binder-mark">${escapeHtml(cover.brand || "Little Learner Hub")}</div>
                <h3>${escapeHtml(cover.title || kit.title || "Teaching Kit")}</h3>
                <p>${escapeHtml(cover.subtitle || "")}</p>
                <div class="tk-tab-rail">
                  ${(binder.tabs || []).map((tab, index) => `<span>${escapeHtml(String(index + 1))} ${escapeHtml(tab.label)}</span>`).join("")}
                </div>
              </div>
              <p class="tk-binder-foot-note">Classroom companion binder · ${escapeHtml(String(activityCount))} activities</p>
            </div>
            <div class="tk-binder-pages">
              <article class="tk-binder-page" data-tab="Setup">
                <h4>Tab 1 — Monday Morning Setup</h4>
                <p class="tk-muted">Prep ~${escapeHtml(String(kit.companion?.mondayMorningSetup?.estimatedPrepMinutes || 0))} min · missing items listed at top</p>
                <hr class="tk-binder-rule" />
                <p>Materials checklist · timed prep tasks · print queue with Used in week notes.</p>
                <div class="tk-binder-footer"><span>${escapeHtml(binder.footerLabel || "Teaching Kit")}</span><span>2</span></div>
              </article>
              <article class="tk-binder-page" data-tab="Daily">
                <h4>Tab 2 — Daily Classroom</h4>
                <p class="tk-muted">Leave this page open during the day</p>
                <hr class="tk-binder-rule" />
                <p>Schedule · materials · transitions · book questions · song motions · parent message · observation ideas.</p>
                <div class="tk-binder-footer"><span>${escapeHtml(binder.footerLabel || "Teaching Kit")}</span><span>5</span></div>
              </article>
              <article class="tk-binder-page" data-tab="Activities">
                <h4>Tab 3 — Activity cards</h4>
                <p class="tk-muted">Example photo · setup photo · prompts · cleanup</p>
                <hr class="tk-binder-rule" />
                <p>Consistent card layout across the binder. Selected activities: ${escapeHtml(String(activityCount))}.</p>
                <div class="tk-binder-footer"><span>${escapeHtml(binder.footerLabel || "Teaching Kit")}</span><span>9</span></div>
              </article>
            </div>
          </div>
        </div>
        <div class="tk-stack tk-binder-actions">
          <button type="button" class="tk-btn tk-btn-ghost" data-tk-goto="build">Edit My Kit</button>
          ${state.printCenterEnabled
            ? `<button type="button" class="tk-btn tk-btn-primary" data-tk-print-binder>Print / Save PDF</button>`
            : ""}
          <button type="button" class="tk-btn tk-btn-secondary" data-tk-goto="today">Back to Today</button>
        </div>
      </section>
    `;
  }

  function surfaceHtml(kit, state) {
    switch (state.surface) {
      case "setup":
        return setupSurfaceHtml(kit, state);
      case "today":
        return todaySurfaceHtml(kit, state);
      case "activity":
        return activitySurfaceHtml(kit, state);
      case "build":
        return buildSurfaceHtml(kit, state);
      case "binder":
        return binderSurfaceHtml(kit, state);
      case "start":
      default:
        return startSurfaceHtml(kit);
    }
  }

  function workspaceHtml(kit, state, chrome) {
    const navSurface = ["activity", "binder"].includes(state.surface)
      ? (state.returnSurface || "today")
      : state.surface;
    const age = chrome.age || kit.age || "";
    const planLabel = chrome.planLabel || kit.plan || "";
    const planBadgeClass = /pro/i.test(String(planLabel)) ? "pro-badge" : "free-badge";
    const theme = chrome.theme || kit.theme || "";
    return `
      <div class="lesson-workspace teaching-kit-workspace" data-lesson-workspace data-teaching-kit-workspace>
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
              </p>
            </div>
            ${chrome.saveButtonHtml || ""}
          </header>
          <nav class="lesson-workspace-tabs tk-ops-nav" role="tablist" aria-label="Teaching Kit sections">
            ${SURFACES.map((item) => `
              <button type="button" role="tab" class="lesson-workspace-tab tk-ops-tab${navSurface === item.id ? " is-active" : ""}" data-tk-goto="${item.id}" aria-selected="${navSurface === item.id ? "true" : "false"}">${escapeHtml(item.label)}</button>
            `).join("")}
          </nav>
        </div>
        <div class="lesson-workspace-panels tk-panels">
          <div class="lesson-workspace-panel is-active tk-panel-host" data-tk-host>
            ${surfaceHtml(kit, state)}
          </div>
        </div>
        ${chrome.actionBarsHtml || ""}
        ${chrome.feedbackHtml || ""}
        ${chrome.copyrightHtml || ""}
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
    return {
      surface,
      day: text(opts.initialDay) || today,
      activityId: initialActivityId,
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
    };
  }

  function renderInto(host, kit, state, chrome) {
    if (!host) return;
    host.innerHTML = `<article class="printable-resource-page curriculum-lesson-viewer lesson-workspace-article teaching-kit-article">${workspaceHtml(kit, state, chrome)}</article>`;
    host.classList.remove("teaching-kit-loading");
  }

  function syncOpsNav(root, state) {
    const navSurface = ["activity", "binder"].includes(state.surface)
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

    function rerender() {
      const host = root.querySelector("[data-tk-host]");
      if (host) {
        // Panel-only swap keeps chrome/listeners intact for snappy navigation.
        host.innerHTML = surfaceHtml(kit, state);
        syncOpsNav(root, state);
        focusPanel(host);
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

      const printBtn = event.target.closest("[data-tk-print-binder]");
      if (printBtn) {
        event.preventDefault();
        if (!state.printCenterEnabled) return;
        if (typeof ctx.onPrint === "function") {
          ctx.onPrint({
            preset: state.printPreset,
            parts: state.printParts,
            removedActivityIds: state.removedActivityIds,
            day: state.day,
            includeImages: state.includeImages !== false,
            inkSaver: Boolean(state.inkSaver),
            paperSize: state.paperSize || "letter",
          });
        }
        return;
      }

      const goto = event.target.closest("[data-tk-goto]");
      if (goto) {
        event.preventDefault();
        state.surface = goto.getAttribute("data-tk-goto") || "start";
        state.openEverything = false;
        state.showSubstitute = false;
        if (state.surface !== "activity") state.activityId = "";
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
        rerender();
        return;
      }

      const openActivity = event.target.closest("[data-tk-open-activity]");
      if (openActivity) {
        event.preventDefault();
        state.returnSurface = openActivity.getAttribute("data-tk-from-build") ? "build" : "today";
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
      const tab = event.target.closest(".tk-ops-tab[data-tk-goto], .tk-day[data-tk-day]");
      if (!tab || !root.contains(tab)) return;
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "Home" && event.key !== "End") {
        return;
      }
      const group = tab.classList.contains("tk-day")
        ? Array.from(root.querySelectorAll(".tk-day[data-tk-day]"))
        : Array.from(root.querySelectorAll(".tk-ops-tab[data-tk-goto]"));
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
    const host = root.querySelector("[data-tk-host]");
    if (host) focusPanel(host);
    return () => {
      root.removeEventListener("click", onClick);
      root.removeEventListener("keydown", onKeydown);
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

    const state = defaultState(kitPayload, {
      printCenterEnabled: flags.teachingKitPrintCenter === true || opts.printCenterEnabled === true,
      initialActivityId: opts.initialActivityId,
      initialSurface: opts.initialSurface,
      initialDay: opts.initialDay,
    });
    const chrome = opts.chrome || {};
    renderInto(body, kitPayload, state, chrome);
    const root = body.querySelector("[data-teaching-kit-workspace]");
    if (!root) return { enhanced: false, reason: "render_failed" };
    const unbind = bindWorkspace(root, {
      kit: kitPayload,
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
    WEEKDAYS,
    escapeHtml,
    isSparseKit,
    loadingWorkspaceHtml,
    renderLoadingWorkspace,
    defaultState,
    workspaceHtml,
    surfaceHtml,
    renderInto,
    bindWorkspace,
    enhanceLessonWorkspace,
  };
});
