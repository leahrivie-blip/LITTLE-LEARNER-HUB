/**
 * Phase D: shared curriculum lesson plan + activity viewer/print rendering.
 * Browser: globalThis.CurriculumLessonViewerRender
 * Node: module.exports
 */
const CURRICULUM_WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const DAY_LABELS = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
};

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
  const resolveActivityId = options.resolveActivityId || (() => "");
  const activityId = resolveActivityId(lessonPlanId, item);
  const goals = Array.isArray(item.learningGoals) ? item.learningGoals.filter(Boolean) : [];
  const domains = Array.isArray(item.learningDomains) ? item.learningDomains.filter(Boolean) : [];
  return `
    <article class="curriculum-activity-card">
      <div class="curriculum-activity-card-head">
        <h4>${escapeHtml(item.title || "Activity")}</h4>
        ${item.activityCategory ? `<span class="tag">${escapeHtml(item.activityCategory)}</span>` : ""}
      </div>
      ${domains.length ? curriculumActivityFieldHtml("Learning domains", domains) : ""}
      ${curriculumActivityFieldHtml("Materials", item.materials)}
      ${curriculumActivityFieldHtml("Setup", item.setup)}
      ${curriculumActivityFieldHtml("Directions", item.steps)}
      ${curriculumActivityFieldHtml("Teacher role", item.teacherRole)}
      ${curriculumActivityFieldHtml("Suggested teacher language", item.teacherLanguage)}
      ${goals.length ? curriculumActivityFieldHtml("Learning goals", goals) : ""}
      ${curriculumActivityFieldHtml("Vocabulary", item.vocabulary)}
      ${curriculumActivityFieldHtml("Extensions", item.extensions)}
      ${curriculumActivityFieldHtml("Adaptations", item.adaptations)}
      ${curriculumActivityFieldHtml("Safety notes", item.safetyNotes)}
      ${curriculumActivityFieldHtml("Age modifications", item.ageModifications)}
      ${activityId ? `<button class="ghost-button curriculum-open-activity-button" type="button" data-open-curriculum-activity="${escapeHtml(activityId)}">Open Activity</button>` : ""}
    </article>
  `;
}

function curriculumLessonDayDetailsHtml(dayPlan = {}) {
  const blocks = [];
  const addText = (label, value) => {
    if (!hasText(value)) return;
    blocks.push(`<div class="curriculum-activity-field"><strong>${escapeHtml(label)}</strong>${curriculumMultilineSectionHtml(value)}</div>`);
  };
  addText("Daily theme", dayPlan.theme);
  addText("Daily objectives", dayPlan.objectives);
  if (Array.isArray(dayPlan.learningDomains) && dayPlan.learningDomains.length) {
    blocks.push(curriculumActivityFieldHtml("Daily learning domains", dayPlan.learningDomains));
  }
  addText("Daily materials", dayPlan.materials);
  addText("Daily vocabulary", dayPlan.vocabulary);
  if (Array.isArray(dayPlan.books) && dayPlan.books.length) {
    blocks.push(`<div class="curriculum-activity-field"><strong>Books</strong>${curriculumBooksSectionHtml(dayPlan.books)}</div>`);
  }
  if (Array.isArray(dayPlan.songs) && dayPlan.songs.length) {
    blocks.push(`<div class="curriculum-activity-field"><strong>Songs and fingerplays</strong>${curriculumSongsSectionHtml(dayPlan.songs)}</div>`);
  }
  if (Array.isArray(dayPlan.circleTime) && dayPlan.circleTime.length) {
    blocks.push(`<div class="curriculum-activity-field"><strong>Circle-time ideas</strong>${curriculumTextListSectionHtml(dayPlan.circleTime)}</div>`);
  }
  if (Array.isArray(dayPlan.transitions) && dayPlan.transitions.length) {
    blocks.push(`<div class="curriculum-activity-field"><strong>Transition ideas</strong>${curriculumTextListSectionHtml(dayPlan.transitions)}</div>`);
  }
  addText("Outdoor play", dayPlan.outdoorPlay);
  addText("Family connection", dayPlan.familyConnection);
  if (Array.isArray(dayPlan.observations) && dayPlan.observations.length) {
    blocks.push(`<div class="curriculum-activity-field"><strong>Observation opportunities</strong>${curriculumTextListSectionHtml(dayPlan.observations)}</div>`);
  }
  addText("Adaptations", dayPlan.adaptations);
  addText("Safety notes", dayPlan.safetyNotes);
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
  const sections = [];
  const addText = (label, value) => {
    if (!hasText(value)) return;
    sections.push({ label, html: curriculumMultilineSectionHtml(value) });
  };
  addText("Weekly Overview", plan.weeklyOverview);
  addText("Weekly Learning Objectives", plan.objectives);
  addText("Weekly Materials", plan.weeklyMaterials);
  addText("Weekly Vocabulary", plan.vocabularyWords);
  if (Array.isArray(plan.books) && plan.books.length) {
    sections.push({ label: "Weekly Books", html: curriculumBooksSectionHtml(plan.books) });
  }
  if (Array.isArray(plan.songs) && plan.songs.length) {
    sections.push({ label: "Weekly Songs and Fingerplays", html: curriculumSongsSectionHtml(plan.songs) });
  }
  addText("Family Connection", plan.familyConnection);
  addText("Observation Opportunities", plan.observationOpportunities);
  addText("Adaptations", plan.adaptations);
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

function renderCurriculumLessonPlanHtml(plan = {}, options = {}) {
  const showAdminStatus = Boolean(options.showAdminStatus);
  const domains = (Array.isArray(plan.learningDomains) ? plan.learningDomains : [])
    .map((domain) => `<span class="tag">${escapeHtml(domain)}</span>`)
    .join("");
  const weeklyOverviewInline = hasText(plan.weeklyOverview)
    ? `<div class="curriculum-lesson-overview-lead">${curriculumMultilineSectionHtml(plan.weeklyOverview)}</div>`
    : "";
  return `
    <header class="curriculum-lesson-header">
      <h3>${escapeHtml(plan.title || "Lesson Plan")}</h3>
      <div class="tag-row">
        <span class="tag">${escapeHtml(plan.age || "Preschool")}</span>
        ${plan.theme ? `<span class="tag">${escapeHtml(plan.theme)}</span>` : ""}
        <span class="tag access-tag">${escapeHtml(plan.plan || "Free")}</span>
        ${showAdminStatus && plan.status ? `<span class="tag">${escapeHtml(plan.status)}</span>` : ""}
      </div>
      ${domains ? `<div class="tag-row curriculum-lesson-domains">${domains}</div>` : ""}
      ${weeklyOverviewInline}
    </header>
    ${curriculumLessonWeeklySectionsHtml(plan) ? `<section class="curriculum-lesson-weekly">${curriculumLessonWeeklySectionsHtml(plan)}</section>` : ""}
    <section class="curriculum-lesson-daily-section">
      <h3>Daily Plans</h3>
      ${curriculumLessonDailyPlansHtml(plan, options)}
    </section>
  `;
}

function renderCurriculumActivityHtml(activity = {}, options = {}) {
  const goals = Array.isArray(activity.learningGoals) ? activity.learningGoals.filter(Boolean) : [];
  const domains = Array.isArray(activity.learningDomains) ? activity.learningDomains.filter(Boolean) : [];
  const category = activity.activityCategory || "";
  const parentTitle = options.parentTitle || activity.parentTitle || "";
  const lessonId = options.lessonPlanId || activity.lessonPlanId || "";
  return `
    <header class="curriculum-activity-header">
      ${category ? `<span class="tag">${escapeHtml(category)}</span>` : ""}
      ${parentTitle ? `<p class="curriculum-activity-parent">Parent lesson: <strong>${escapeHtml(parentTitle)}</strong></p>` : ""}
    </header>
    <section class="curriculum-activity-body">
      ${curriculumActivityFieldHtml("Learning domains", domains)}
      ${curriculumActivityFieldHtml("Materials", activity.materials)}
      ${curriculumActivityFieldHtml("Setup", activity.setup)}
      ${curriculumActivityFieldHtml("Directions", activity.steps)}
      ${curriculumActivityFieldHtml("Teacher role", activity.teacherRole)}
      ${curriculumActivityFieldHtml("Suggested teacher language", activity.teacherLanguage)}
      ${goals.length ? curriculumActivityFieldHtml("Learning goals", goals) : ""}
      ${curriculumActivityFieldHtml("Vocabulary", activity.vocabulary)}
      ${curriculumActivityFieldHtml("Extensions", activity.extensions)}
      ${curriculumActivityFieldHtml("Adaptations", activity.adaptations)}
      ${curriculumActivityFieldHtml("Safety notes", activity.safetyNotes)}
      ${curriculumActivityFieldHtml("Age modifications", activity.ageModifications)}
    </section>
    ${lessonId ? `
      <div class="curriculum-activity-actions">
        <button class="ghost-button" type="button" data-view-resource="${escapeHtml(lessonId)}">Open Parent Lesson</button>
      </div>
    ` : ""}
  `;
}

function lockedCurriculumLessonPreviewHtml(resource = {}) {
  const plan = resource._curriculumLessonPlan || {};
  const overview = String(plan.weeklyOverview || resource.description || "").trim();
  const words = overview.split(/\s+/).filter(Boolean);
  const excerpt = words.slice(0, 40).join(" ");
  const domains = (Array.isArray(plan.learningDomains) ? plan.learningDomains : [])
    .slice(0, 3)
    .map((domain) => `<span class="tag">${escapeHtml(domain)}</span>`)
    .join("");
  return {
    title: resource.title || plan.title || "Lesson Plan",
    html: `
      <div class="fp-field"><label>Age Group</label><div class="fp-field-value">${escapeHtml(plan.age || resource.age || "Preschool")}</div></div>
      <div class="fp-field"><label>Theme</label><div class="fp-field-value">${escapeHtml(plan.theme || resource.theme || "—")}</div></div>
      ${domains ? `<div class="fp-field"><label>Learning Domains</label><div class="fp-field-value tag-row">${domains}</div></div>` : ""}
      ${excerpt ? `<div class="fp-field"><label>Weekly Overview Preview</label><div class="fp-field-value">${escapeHtml(excerpt)}${words.length > 40 ? "…" : ""}</div></div>` : ""}
      <p class="muted-copy">Full daily plans, activities, books, songs, teacher language, and printable content unlock with Pro.</p>
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
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== "undefined") {
  globalThis.CurriculumLessonViewerRender = api;
}
