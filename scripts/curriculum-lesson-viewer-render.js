/**
 * Phase D: shared curriculum lesson plan + activity viewer/print rendering.
 * Browser: globalThis.CurriculumLessonViewerRender
 * Node: module.exports
 */
(function curriculumLessonViewerRenderModule() {
if (typeof require === "function" && typeof module !== "undefined" && !globalThis.LlhCopyright) {
  try { require("./llh-copyright.js"); } catch (_err) { /* browser bundle path */ }
}
const safeApi = typeof globalThis !== "undefined" ? globalThis.CurriculumSafeValues : null;
const CURRICULUM_WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const DAY_LABELS = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
};

function asStringArray(value) {
  if (safeApi?.curriculumAsStringArray) return safeApi.curriculumAsStringArray(value);
  if (Array.isArray(value)) return value.map((entry) => String(entry ?? "").trim()).filter(Boolean);
  const text = String(value ?? "").trim();
  return text ? text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) : [];
}

function normalizePlanForRender(plan = {}) {
  if (safeApi?.normalizeCurriculumLessonPlanForRender) return safeApi.normalizeCurriculumLessonPlanForRender(plan);
  return plan && typeof plan === "object" ? plan : {};
}

function normalizeActivityForRender(activity = {}) {
  if (safeApi?.normalizeCurriculumDailyItemForRender) return safeApi.normalizeCurriculumDailyItemForRender(activity);
  return activity && typeof activity === "object" ? activity : {};
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function printableLineHtml(line) {
  if (/^(-|\*)\s+/.test(line) || /^\[\s?\]\s+/.test(line)) {
    const cleaned = line.replace(/^(-|\*|\[\s?\])\s*/, "").trim();
    return `<li>${escapeHtml(cleaned)}</li>`;
  }
  if (/^\d+\.\s/.test(line.trim())) {
    return `<p class="curriculum-numbered-line">${escapeHtml(line)}</p>`;
  }
  return `<p>${escapeHtml(line)}</p>`;
}

function printableLinesHtml(lines) {
  const html = [];
  let listOpen = false;
  const closeList = () => {
    if (!listOpen) return;
    html.push("</ul>");
    listOpen = false;
  };
  lines.forEach((line) => {
    if (/^(-|\*)\s+/.test(line) || /^\[\s?\]\s+/.test(line)) {
      if (!listOpen) {
        html.push('<ul class="printable-list curriculum-goal-list">');
        listOpen = true;
      }
      html.push(printableLineHtml(line));
      return;
    }
    closeList();
    html.push(printableLineHtml(line));
  });
  closeList();
  return html.join("");
}

function curriculumMultilineSectionHtml(text) {
  const lines = String(text || "").split("\n").map((line) => line.trimEnd()).filter((line) => line.length);
  return printableLinesHtml(lines);
}

function hasText(value) {
  return Boolean(String(value || "").trim());
}

function curriculumBooksSectionHtml(books) {
  if (!Array.isArray(books) || !books.length) return "";
  return books.map((book) => `
    <div class="curriculum-book-entry">
      <strong>${escapeHtml(book.title || "")}</strong>
      ${book.author ? `<span class="curriculum-book-author">by ${escapeHtml(book.author)}</span>` : ""}
      ${book.notes ? `<p>${escapeHtml(book.notes)}</p>` : ""}
    </div>
  `).join("");
}

function curriculumSongsSectionHtml(songs) {
  if (!Array.isArray(songs) || !songs.length) return "";
  return songs.map((song) => `
    <div class="curriculum-song-entry">
      <strong>${escapeHtml(song.title || "")}</strong>
      ${song.notes ? `<p>${escapeHtml(song.notes)}</p>` : ""}
    </div>
  `).join("");
}

function curriculumTextListSectionHtml(items) {
  if (!Array.isArray(items) || !items.length) return "";
  return `<ul class="curriculum-goal-list">${items.filter(Boolean).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function curriculumActivityFieldHtml(label, value) {
  if (Array.isArray(value)) {
    const items = value.filter((item) => hasText(item));
    if (!items.length) return "";
    return `<div class="curriculum-activity-field"><strong>${escapeHtml(label)}</strong>${curriculumTextListSectionHtml(items)}</div>`;
  }
  if (!hasText(value)) return "";
  return `<div class="curriculum-activity-field"><strong>${escapeHtml(label)}</strong>${curriculumMultilineSectionHtml(value)}</div>`;
}

function curriculumLessonDayActivityCardHtml(lessonPlanId, item, options = {}) {
  const activity = normalizeActivityForRender(item);
  const resolveActivityId = options.resolveActivityId || (() => "");
  const activityId = resolveActivityId(lessonPlanId, activity);
  const goals = asStringArray(activity.learningGoals);
  const domains = asStringArray(activity.learningDomains);
  return `
    <article class="curriculum-activity-card">
      <div class="curriculum-activity-card-head">
        <h4>${escapeHtml(activity.title || "Activity")}</h4>
        ${activity.activityCategory ? `<span class="tag">${escapeHtml(activity.activityCategory)}</span>` : ""}
      </div>
      ${curriculumActivityFieldHtml("Objective", activity.objective)}
      ${curriculumActivityFieldHtml("Description", activity.description)}
      ${curriculumActivityFieldHtml("Materials", activity.materials)}
      ${curriculumActivityFieldHtml("Setup", activity.setup)}
      ${curriculumActivityFieldHtml("Directions", activity.steps)}
      ${curriculumActivityFieldHtml("Teacher role", activity.teacherRole)}
      ${goals.length ? curriculumActivityFieldHtml("Learning goals", goals) : ""}
      ${curriculumActivityFieldHtml("Observation opportunities", activity.observationOpportunities)}
      ${domains.length ? curriculumActivityFieldHtml("Learning domains", domains) : ""}
      ${curriculumActivityFieldHtml("Suggested teacher language", activity.teacherLanguage)}
      ${curriculumActivityFieldHtml("Vocabulary", activity.vocabulary)}
      ${curriculumActivityFieldHtml("Extensions", activity.extensions)}
      ${curriculumActivityFieldHtml("Adaptations", activity.adaptations)}
      ${curriculumActivityFieldHtml("Safety notes", activity.safetyNotes)}
      ${curriculumActivityFieldHtml("Age modifications", activity.ageModifications)}
      ${activityId ? `<button class="ghost-button curriculum-open-activity-button" type="button" data-open-curriculum-activity="${escapeHtml(activityId)}">Open Activity</button>` : ""}
    </article>
  `;
}

function curriculumLessonDayDetailsHtml(dayPlan = {}) {
  const plan = dayPlan && typeof dayPlan === "object" ? dayPlan : {};
  const blocks = [];
  const addText = (label, value) => {
    if (!hasText(value)) return;
    blocks.push(`<div class="curriculum-activity-field"><strong>${escapeHtml(label)}</strong>${curriculumMultilineSectionHtml(value)}</div>`);
  };
  addText("Daily theme", plan.theme);
  addText("Daily objectives", plan.objectives);
  const dayDomains = asStringArray(plan.learningDomains);
  if (dayDomains.length) {
    blocks.push(curriculumActivityFieldHtml("Daily learning domains", dayDomains));
  }
  addText("Daily materials", plan.materials);
  addText("Daily vocabulary", plan.vocabulary);
  if (Array.isArray(plan.books) && plan.books.length) {
    blocks.push(`<div class="curriculum-activity-field"><strong>Books</strong>${curriculumBooksSectionHtml(plan.books)}</div>`);
  }
  if (Array.isArray(plan.songs) && plan.songs.length) {
    blocks.push(`<div class="curriculum-activity-field"><strong>Songs and fingerplays</strong>${curriculumSongsSectionHtml(plan.songs)}</div>`);
  }
  if (Array.isArray(plan.circleTime) && plan.circleTime.length) {
    blocks.push(`<div class="curriculum-activity-field"><strong>Circle-time ideas</strong>${curriculumTextListSectionHtml(plan.circleTime)}</div>`);
  }
  if (Array.isArray(plan.transitions) && plan.transitions.length) {
    blocks.push(`<div class="curriculum-activity-field"><strong>Transition ideas</strong>${curriculumTextListSectionHtml(plan.transitions)}</div>`);
  }
  addText("Outdoor play", plan.outdoorPlay);
  addText("Family connection", plan.familyConnection);
  if (Array.isArray(plan.observations) && plan.observations.length) {
    blocks.push(`<div class="curriculum-activity-field"><strong>Observation opportunities</strong>${curriculumTextListSectionHtml(plan.observations)}</div>`);
  }
  addText("Adaptations", plan.adaptations);
  addText("Safety notes", plan.safetyNotes);
  return blocks.join("");
}

function curriculumLessonDayPanelHtml(day, dayPlan = {}, lessonPlanId, options = {}) {
  const details = curriculumLessonDayDetailsHtml(dayPlan);
  const items = Array.isArray(dayPlan.items) ? dayPlan.items : [];
  const cards = items.length
    ? items.map((item) => curriculumLessonDayActivityCardHtml(lessonPlanId, item, options)).join("")
    : "";
  const activitiesBlock = cards
    ? `<div class="curriculum-activity-field"><strong>Activities</strong><div class="curriculum-import-preview-activities">${cards}</div></div>`
    : `<p class="muted-copy">No activities scheduled for this day.</p>`;
  return `
    <section class="curriculum-day-panel-section">
      ${details}
      ${activitiesBlock}
    </section>
  `;
}

function curriculumLessonWeeklySectionsHtml(plan = {}) {
  const normalized = normalizePlanForRender(plan);
  const sections = [];
  const addText = (label, value) => {
    if (!hasText(value)) return;
    sections.push({ label, html: curriculumMultilineSectionHtml(value) });
  };
  addText("Weekly Overview", normalized.weeklyOverview);
  const domains = asStringArray(normalized.learningDomains);
  if (domains.length) {
    sections.push({
      label: "Learning Domains",
      html: `<div class="tag-row">${domains.map((domain) => `<span class="tag">${escapeHtml(domain)}</span>`).join("")}</div>`,
    });
  }
  addText("Learning Objectives", normalized.objectives);
  addText("Weekly Materials", normalized.weeklyMaterials);
  addText("Vocabulary", normalized.vocabularyWords);
  if (Array.isArray(normalized.books) && normalized.books.length) {
    sections.push({ label: "Books", html: curriculumBooksSectionHtml(normalized.books) });
  }
  if (Array.isArray(normalized.songs) && normalized.songs.length) {
    sections.push({ label: "Songs and Fingerplays", html: curriculumSongsSectionHtml(normalized.songs) });
  }
  addText("Family Connection", normalized.familyConnection);
  addText("Observation Opportunities", normalized.observationOpportunities);
  addText("Adaptations", normalized.adaptations);
  if (!sections.length) return "";
  return sections.map((section, index) => `
    <details class="curriculum-lesson-section"${index < 2 ? " open" : ""}>
      <summary>${escapeHtml(section.label)}</summary>
      <div class="curriculum-lesson-section-body">${section.html}</div>
    </details>
  `).join("");
}

function curriculumLessonDailyPlansHtml(plan = {}, options = {}) {
  const dailyPlans = plan.dailyPlans && typeof plan.dailyPlans === "object" ? plan.dailyPlans : {};
  const mode = options.mode || "screen";
  if (mode === "print") {
    return CURRICULUM_WEEKDAYS.map((day) => {
      const dayPlan = dailyPlans[day] || {};
      const hasContent = curriculumLessonDayDetailsHtml(dayPlan) || (dayPlan.items || []).length;
      if (!hasContent) return "";
      return `
        <section class="curriculum-print-day">
          <h4>${DAY_LABELS[day]}</h4>
          ${curriculumLessonDayPanelHtml(day, dayPlan, plan.id, options)}
        </section>
      `;
    }).filter(Boolean).join("");
  }
  const tabs = CURRICULUM_WEEKDAYS.map((day, index) => `
    <button class="curriculum-day-tab${index === 0 ? " is-active" : ""}" type="button" data-curriculum-lesson-day="${day}" role="tab" aria-selected="${index === 0 ? "true" : "false"}">${DAY_LABELS[day]}</button>
  `).join("");
  const panels = CURRICULUM_WEEKDAYS.map((day, index) => `
    <div class="curriculum-day-panel${index === 0 ? " is-active" : ""}" data-curriculum-lesson-day-panel="${day}" role="tabpanel">
      ${curriculumLessonDayPanelHtml(day, dailyPlans[day] || {}, plan.id, options)}
    </div>
  `).join("");
  return `
    <div class="curriculum-lesson-daily">
      <div class="curriculum-day-tabs" role="tablist" aria-label="Weekday plans">${tabs}</div>
      <div class="curriculum-day-panels">${panels}</div>
    </div>
  `;
}

function copyrightFooterHtml() {
  const api = typeof globalThis !== "undefined" ? globalThis.LlhCopyright : null;
  if (api?.noticeBlockHtml) return api.noticeBlockHtml("llh-copyright-block curriculum-copyright-footer");
  return `<footer class="llh-copyright-block curriculum-copyright-footer" aria-label="Copyright"><p class="llh-copyright-notice">© 2026 Little Learner Hub by Leah. All Rights Reserved.</p></footer>`;
}

function renderCurriculumLessonPlanHtml(plan = {}, options = {}) {
  const normalized = normalizePlanForRender(plan);
  const showAdminStatus = Boolean(options.showAdminStatus);
  return `
    <header class="curriculum-lesson-header">
      <h3>${escapeHtml(normalized.title || "Lesson Plan")}</h3>
      <div class="tag-row">
        <span class="tag">${escapeHtml(normalized.age || "Preschool")}</span>
        ${normalized.theme ? `<span class="tag">${escapeHtml(normalized.theme)}</span>` : ""}
        <span class="tag access-tag">${escapeHtml(normalized.plan || "Free")}</span>
        ${showAdminStatus && normalized.status ? `<span class="tag">${escapeHtml(normalized.status)}</span>` : ""}
      </div>
      ${curriculumLessonWeeklySectionsHtml(normalized) ? `<section class="curriculum-lesson-weekly">${curriculumLessonWeeklySectionsHtml(normalized)}</section>` : ""}
    </header>
    <section class="curriculum-lesson-daily-section">
      <h3>Daily Plans</h3>
      ${curriculumLessonDailyPlansHtml(normalized, options)}
    </section>
    ${copyrightFooterHtml()}
  `;
}

function renderCurriculumActivityHtml(activity = {}, options = {}) {
  const normalized = normalizeActivityForRender(activity);
  const goals = asStringArray(normalized.learningGoals);
  const domains = asStringArray(normalized.learningDomains);
  const category = normalized.activityCategory || "";
  const parentTitle = options.parentTitle || activity.parentTitle || "";
  const parentAge = options.parentAge || activity.parentAge || "";
  const lessonId = options.lessonPlanId || activity.lessonPlanId || "";
  return `
    <header class="curriculum-activity-header">
      <h3>${escapeHtml(normalized.title || "Activity")}</h3>
      <div class="tag-row">
        ${category ? `<span class="tag">${escapeHtml(category)}</span>` : ""}
        ${parentAge ? `<span class="tag">${escapeHtml(parentAge)}</span>` : ""}
      </div>
      ${parentTitle ? `<p class="curriculum-activity-parent">Parent lesson: <strong>${escapeHtml(parentTitle)}</strong></p>` : ""}
    </header>
    <section class="curriculum-activity-body">
      ${curriculumActivityFieldHtml("Objective", normalized.objective)}
      ${curriculumActivityFieldHtml("Description", normalized.description)}
      ${curriculumActivityFieldHtml("Materials", normalized.materials)}
      ${curriculumActivityFieldHtml("Setup", normalized.setup)}
      ${curriculumActivityFieldHtml("Directions", normalized.steps)}
      ${curriculumActivityFieldHtml("Teacher role", normalized.teacherRole)}
      ${goals.length ? curriculumActivityFieldHtml("Learning goals", goals) : ""}
      ${curriculumActivityFieldHtml("Observation opportunities", normalized.observationOpportunities)}
      ${domains.length ? curriculumActivityFieldHtml("Learning domains", domains) : ""}
      ${curriculumActivityFieldHtml("Suggested teacher language", normalized.teacherLanguage)}
      ${curriculumActivityFieldHtml("Vocabulary", normalized.vocabulary)}
      ${curriculumActivityFieldHtml("Extensions", normalized.extensions)}
      ${curriculumActivityFieldHtml("Adaptations", normalized.adaptations)}
      ${curriculumActivityFieldHtml("Safety notes", normalized.safetyNotes)}
      ${curriculumActivityFieldHtml("Age modifications", normalized.ageModifications)}
    </section>
    ${lessonId ? `
      <div class="curriculum-activity-actions">
        <button class="ghost-button" type="button" data-view-resource="${escapeHtml(lessonId)}">Open Parent Lesson</button>
      </div>
    ` : ""}
    ${copyrightFooterHtml()}
  `;
}

function lockedFoundingOfferHtml(showFoundingOffer) {
  if (!showFoundingOffer) return "";
  return `
    <div class="fp-founding-offer" data-fp-founding-offer>
      <p class="fp-founding-offer-eyebrow">🔥 Founding Member Pricing Still Available</p>
      <p>Lock in <strong>$9.99/month for life</strong> and receive unlimited access to:</p>
      <ul class="fp-pro-upgrade-benefits fp-founding-benefits">
        <li>• Every Pro Lesson Plan</li>
        <li>• Every Activity</li>
        <li>• Future Curriculum Releases</li>
        <li>• Documentation Helpers</li>
        <li>• New Features as They Launch</li>
      </ul>
      <p class="fp-founding-regular-price">Regular Price: <span>$19.99/month</span></p>
    </div>
  `;
}

function lockedCurriculumLessonPreviewHtml(resource = {}, options = {}) {
  // Pro lesson previews intentionally sell quality without revealing plan content.
  // Visible: title (set by caller), age, theme, learning domains, weekly overview.
  // Hidden: objectives, materials, vocabulary, books, songs, family connection,
  // observations, adaptations, Mon–Fri activities/names/descriptions, teacher notes/goals.
  const plan = normalizePlanForRender(resource._curriculumLessonPlan || {});
  const overview = String(plan.weeklyOverview || resource.description || "").trim();
  const domains = asStringArray(plan.learningDomains)
    .slice(0, 6)
    .map((domain) => `<span class="tag">${escapeHtml(domain)}</span>`)
    .join("");
  const upgradeCtaHtml = String(options.upgradeCtaHtml || "").trim();
  const upgradeNote = String(options.upgradeNote || "").trim();
  const showFoundingOffer = options.showFoundingOffer !== false;

  return {
    title: resource.title || plan.title || "Lesson Plan",
    html: `
      <div class="fp-pro-teaser" data-fp-pro-teaser>
        <div class="fp-field"><label>Age Group</label><div class="fp-field-value">${escapeHtml(plan.age || resource.age || "Preschool")}</div></div>
        <div class="fp-field"><label>Theme</label><div class="fp-field-value">${escapeHtml(plan.theme || resource.theme || "—")}</div></div>
        ${domains ? `<div class="fp-field"><label>Learning Domains</label><div class="fp-field-value tag-row">${domains}</div></div>` : ""}
        ${overview ? `<div class="fp-field"><label>Weekly Overview</label><div class="fp-field-value">${escapeHtml(overview)}</div></div>` : ""}
      </div>
      <section class="fp-pro-upgrade-card" data-fp-pro-upgrade-card aria-label="Pro Lesson Plan upgrade">
        <p class="fp-pro-upgrade-eyebrow">🔒 Pro Lesson Plan</p>
        <h3>This is a Pro Lesson Plan.</h3>
        <p class="muted-copy">You're viewing a preview only.</p>
        <p>Unlock:</p>
        <ul class="fp-pro-upgrade-benefits">
          <li>✓ Complete Monday–Friday lesson plans</li>
          <li>✓ Activities and directions</li>
          <li>✓ Books and songs</li>
          <li>✓ Materials lists</li>
          <li>✓ Family connections</li>
          <li>✓ Observation opportunities</li>
          <li>✓ Printable curriculum</li>
          <li>✓ Curriculum Planner access</li>
          <li>✓ New lesson plans added every week</li>
        </ul>
        <p class="muted-copy">Unlock the full curriculum library and access new lesson plans added every week.</p>
        ${lockedFoundingOfferHtml(showFoundingOffer)}
        ${upgradeCtaHtml ? `<div class="fp-pro-upgrade-actions pro-modal-actions">${upgradeCtaHtml}</div>` : ""}
        ${upgradeNote ? `<p class="fp-pro-upgrade-note"><small>${escapeHtml(upgradeNote)}</small></p>` : ""}
      </section>
    `,
  };
}

function lockedCurriculumActivityPreviewHtml(resource = {}, options = {}) {
  // Pro activity previews show overview metadata only — no activity how-to content.
  // Visible: title (set by caller), age, activity type, day, learning domains, parent lesson.
  // Hidden: description, objective, materials, setup, steps, teacher role/language,
  // learning goals, observations, vocabulary, extensions, adaptations, safety notes.
  const activity = resource._curriculumActivity && typeof resource._curriculumActivity === "object"
    ? resource._curriculumActivity
    : {};
  const age = resource.age || activity.parentAge || "All Ages";
  const category = resource.activityCategory || activity.activityCategory || resource.theme || "";
  const dayRaw = String(activity.dayOfWeek || "").trim().toLowerCase();
  const dayLabel = dayRaw
    ? `${dayRaw.charAt(0).toUpperCase()}${dayRaw.slice(1)}`
    : "";
  const domains = asStringArray(activity.learningDomains || resource.learningDomains)
    .slice(0, 3)
    .map((domain) => `<span class="tag">${escapeHtml(domain)}</span>`)
    .join("");
  const parentTitle = resource._curriculumParentTitle || activity.parentTitle || "";
  const upgradeCtaHtml = String(options.upgradeCtaHtml || "").trim();
  const upgradeNote = String(options.upgradeNote || "").trim();
  const showFoundingOffer = options.showFoundingOffer !== false;

  return {
    title: resource.title || activity.title || "Activity",
    html: `
      <div class="fp-pro-teaser" data-fp-pro-teaser data-fp-pro-activity-teaser>
        <div class="fp-field"><label>Age Group</label><div class="fp-field-value">${escapeHtml(age)}</div></div>
        ${category ? `<div class="fp-field"><label>Activity Type</label><div class="fp-field-value">${escapeHtml(category)}</div></div>` : ""}
        ${dayLabel ? `<div class="fp-field"><label>Day</label><div class="fp-field-value">${escapeHtml(dayLabel)}</div></div>` : ""}
        ${parentTitle ? `<div class="fp-field"><label>From Lesson Plan</label><div class="fp-field-value">${escapeHtml(parentTitle)}</div></div>` : ""}
        ${domains ? `<div class="fp-field"><label>Learning Domains</label><div class="fp-field-value tag-row">${domains}</div></div>` : ""}
      </div>
      <section class="fp-pro-upgrade-card" data-fp-pro-upgrade-card aria-label="Pro Activity upgrade">
        <p class="fp-pro-upgrade-eyebrow">🔒 Pro Activity</p>
        <h3>Unlock this premium activity</h3>
        <p class="muted-copy">This premium activity includes:</p>
        <ul class="fp-pro-upgrade-benefits">
          <li>✓ Learning Objective</li>
          <li>✓ Materials List</li>
          <li>✓ Setup Instructions</li>
          <li>✓ Step-by-Step Directions</li>
          <li>✓ Teacher Role &amp; Language</li>
          <li>✓ Learning Goals</li>
          <li>✓ Observation Opportunities</li>
          <li>✓ Vocabulary Supports</li>
          <li>✓ Extensions &amp; Adaptations</li>
        </ul>
        ${lockedFoundingOfferHtml(showFoundingOffer)}
        ${upgradeCtaHtml ? `<div class="fp-pro-upgrade-actions pro-modal-actions">${upgradeCtaHtml}</div>` : ""}
        ${upgradeNote ? `<p class="fp-pro-upgrade-note"><small>${escapeHtml(upgradeNote)}</small></p>` : ""}
      </section>
    `,
  };
}

const api = {
  CURRICULUM_WEEKDAYS,
  escapeHtml,
  curriculumMultilineSectionHtml,
  curriculumBooksSectionHtml,
  curriculumSongsSectionHtml,
  curriculumLessonWeeklySectionsHtml,
  curriculumLessonDailyPlansHtml,
  curriculumLessonDayActivityCardHtml,
  curriculumLessonDayDetailsHtml,
  renderCurriculumLessonPlanHtml,
  renderCurriculumActivityHtml,
  lockedCurriculumLessonPreviewHtml,
  lockedCurriculumActivityPreviewHtml,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== "undefined") {
  globalThis.CurriculumLessonViewerRender = api;
}
})();
