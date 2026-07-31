/**
 * Dynamic SEO curriculum hub pages.
 * Pages are built from the live public curriculum library (published/featured plans
 * and activities) so titles, themes, and counts update as content is published.
 */
"use strict";

const HUB_PAGES = Object.freeze([
  {
    path: "/infant-lesson-plans",
    slug: "infant-lesson-plans",
    kind: "age-lessons",
    age: "Infant",
    navLabel: "Infant Lesson Plans",
    title: "Infant Lesson Plans for Daycare | Little Learner Hub by Leah",
    description:
      "Browse real infant lesson plans used in Little Learner Hub — themes, weekly overviews, and free starter plans for babies in home daycare and centers.",
    h1: "Infant Lesson Plans for Childcare Providers",
    intro:
      "These are published Infant lesson plans from the Little Learner Hub library. Each card below comes from a real plan in the curriculum — not placeholder copy — so the list grows as new infant themes are published.",
    related: ["/toddler-lesson-plans", "/preschool-lesson-plans", "/daycare-curriculum", "/sensory-activities", "/circle-time-ideas"],
    faq: [
      ["What ages do infant lesson plans cover?", "Infant plans in Little Learner Hub are written for babies in childcare settings and are organized separately from Toddler and Preschool content."],
      ["Can I try infant lesson plans for free?", "Yes. The Free plan includes complete starter lesson plans across Infant, Toddler, and Preschool with no credit card required."],
      ["Are infant plans printable?", "Yes. Free starter plans can be opened, printed, and downloaded. Pro unlocks the full infant library with unlimited curriculum printing."],
    ],
  },
  {
    path: "/toddler-lesson-plans",
    slug: "toddler-lesson-plans",
    kind: "age-lessons",
    age: "Toddler",
    navLabel: "Toddler Lesson Plans",
    title: "Toddler Lesson Plans for Daycare | Little Learner Hub by Leah",
    description:
      "Explore real toddler lesson plans from Little Learner Hub — classroom themes, weekly overviews, and free starter plans for mixed-age home daycares and centers.",
    h1: "Toddler Lesson Plans for Childcare Providers",
    intro:
      "These Toddler lesson plans are pulled live from the Little Learner Hub curriculum library. Providers can preview themes and weekly overviews, then open free starter plans or upgrade for the full toddler catalog.",
    related: ["/infant-lesson-plans", "/preschool-lesson-plans", "/daycare-curriculum", "/childcare-activities", "/process-art-activities"],
    faq: [
      ["Do toddler lesson plans work for mixed ages?", "Toddler plans are written for toddler classrooms and home daycares. Providers can adapt activities for nearby ages, and the library also includes Infant and Preschool plans."],
      ["How many toddler plans can I open for free?", "Free includes a curated set of complete starter lesson plans across Infant, Toddler, and Preschool. Additional toddler themes stay browsable as previews until you upgrade."],
      ["What is inside a toddler lesson plan?", "Published plans include a weekly overview, learning domains, and classroom activities. Free starter plans unlock the full week; Pro plans show a preview until unlocked."],
    ],
  },
  {
    path: "/preschool-lesson-plans",
    slug: "preschool-lesson-plans",
    kind: "age-lessons",
    age: "Preschool",
    navLabel: "Preschool Lesson Plans",
    title: "Preschool Lesson Plans for Teachers | Little Learner Hub by Leah",
    description:
      "Browse real preschool lesson plans from Little Learner Hub — themes, learning domains, weekly overviews, and free starter plans for preschool classrooms.",
    h1: "Preschool Lesson Plans for Teachers & Providers",
    intro:
      "Preschool lesson plans below are live library entries from Little Learner Hub. Use free starter plans right away, or browse additional preschool themes and unlock the full library with Pro.",
    related: ["/infant-lesson-plans", "/toddler-lesson-plans", "/daycare-curriculum", "/circle-time-ideas", "/process-art-activities"],
    faq: [
      ["Are preschool lesson plans ready for classroom use?", "Yes. Plans are built for real preschool days with themes, weekly overviews, and activities. Free starter plans open completely; Pro unlocks every published preschool plan."],
      ["Can preschool teachers request new themes?", "Yes. Members can request lesson plans through the website with age group, topic, and learning goals."],
      ["Do preschool plans include circle time and art?", "Many preschool weeks include Circle Time, Art, Sensory Play, and other activity types. Browse the Circle Time and Process Art hub pages for activity-level ideas."],
    ],
  },
  {
    path: "/childcare-activities",
    slug: "childcare-activities",
    kind: "activities",
    categories: null, // all published activities
    navLabel: "Childcare Activities",
    title: "Childcare Activities for Daycare & Preschool | Little Learner Hub by Leah",
    description:
      "Browse real childcare activities from the Little Learner Hub library — circle time, sensory play, art, literacy, and more tied to published lesson plans.",
    h1: "Childcare Activities from the Lesson Plan Library",
    intro:
      "Activity cards on this page are pulled from published Little Learner Hub lesson plans. Filter ideas by age or jump into related hubs for Circle Time, Sensory, and Process Art.",
    related: ["/circle-time-ideas", "/sensory-activities", "/process-art-activities", "/daycare-curriculum", "/toddler-lesson-plans"],
    faq: [
      ["Where do these childcare activities come from?", "Each activity is part of a published Infant, Toddler, or Preschool lesson plan in the Little Learner Hub curriculum library."],
      ["Can I use activities without a paid plan?", "You can browse titles and parent lesson themes for free. Complete free starter lesson plans unlock full activity details; Pro unlocks the full activity library."],
      ["How are activities organized?", "Activities use classroom categories such as Circle Time, Sensory Play, Art, Literacy, Fine Motor, Gross Motor, Music & Movement, STEM/Discovery, Dramatic Play, and Outdoor Play."],
    ],
  },
  {
    path: "/circle-time-ideas",
    slug: "circle-time-ideas",
    kind: "activities",
    categories: ["Circle Time", "Music & Movement"],
    navLabel: "Circle Time Ideas",
    title: "Circle Time Ideas for Daycare & Preschool | Little Learner Hub by Leah",
    description:
      "Real circle time ideas from Little Learner Hub lesson plans — songs, group gathering activities, and classroom openers for infants, toddlers, and preschoolers.",
    h1: "Circle Time Ideas for Childcare Classrooms",
    intro:
      "These Circle Time and Music & Movement activities are taken directly from published lesson plans in Little Learner Hub. Open a free starter plan to see full steps, or browse more ideas in the library.",
    related: ["/childcare-activities", "/infant-lesson-plans", "/toddler-lesson-plans", "/preschool-lesson-plans", "/daycare-curriculum"],
    faq: [
      ["What counts as a circle time idea here?", "This page lists published activities tagged Circle Time or Music & Movement inside Little Learner Hub lesson plans."],
      ["Can I preview circle time activities for free?", "Yes. Browse the list below, then open free starter lesson plans for full activity details. Pro unlocks every published circle-time activity."],
      ["Are ideas available for every age?", "Circle Time activities appear across Infant, Toddler, and Preschool plans when those weeks include a gathering or music block."],
    ],
  },
  {
    path: "/daycare-curriculum",
    slug: "daycare-curriculum",
    kind: "curriculum-hub",
    navLabel: "Daycare Curriculum",
    title: "Daycare Curriculum & Weekly Lesson Plans | Little Learner Hub by Leah",
    description:
      "See the live daycare curriculum inside Little Learner Hub — Infant, Toddler, and Preschool lesson plans, themes, and free starter weeks providers can open today.",
    h1: "Daycare Curriculum Built from Real Weekly Lesson Plans",
    intro:
      "This curriculum hub is generated from the current Little Learner Hub library: published lesson plans by age, featured themes, and free starter weeks. Counts and cards update automatically when new plans are published.",
    related: ["/infant-lesson-plans", "/toddler-lesson-plans", "/preschool-lesson-plans", "/childcare-activities", "/pricing"],
    faq: [
      ["What is included in the daycare curriculum?", "Little Learner Hub includes Infant, Toddler, and Preschool lesson plans with activities, weekly overviews, and learning domains. Free unlocks 10 complete starter plans; Pro unlocks the full library."],
      ["Is this curriculum for home daycare or centers?", "Both. Home daycares, family childcare, preschool classrooms, and centers use the same online library and planning tools."],
      ["How often is new curriculum added?", "New lesson plans and activities are published into the library over time. This page reads the live catalog, so new published themes appear here after they go live."],
    ],
  },
  {
    path: "/sensory-activities",
    slug: "sensory-activities",
    kind: "activities",
    categories: ["Sensory Play"],
    navLabel: "Sensory Activities",
    title: "Sensory Activities for Toddlers & Preschool | Little Learner Hub by Leah",
    description:
      "Browse real sensory activities from Little Learner Hub lesson plans — sensory play ideas tied to infant, toddler, and preschool weekly themes.",
    h1: "Sensory Activities from Real Lesson Plans",
    intro:
      "Sensory Play activities below come from published Little Learner Hub lesson plans. Each card shows the activity title, age, and parent lesson theme so you can jump into a related week.",
    related: ["/childcare-activities", "/process-art-activities", "/toddler-lesson-plans", "/infant-lesson-plans", "/daycare-curriculum"],
    faq: [
      ["Are these sensory activities age-labeled?", "Yes. Each activity shows the parent lesson age (Infant, Toddler, or Preschool) from the published plan it belongs to."],
      ["Can I get full sensory activity steps for free?", "Open a free starter lesson plan that includes Sensory Play to see full details. Pro unlocks sensory activities across the complete library."],
      ["Do sensory activities connect to weekly themes?", "Yes. Activities stay attached to their parent lesson plan theme so classroom weeks stay cohesive."],
    ],
  },
  {
    path: "/process-art-activities",
    slug: "process-art-activities",
    kind: "activities",
    categories: ["Art"],
    titleMatch: /process|open[- ]ended|collage|paint|stamp|scribble|create/i,
    navLabel: "Process Art Activities",
    title: "Process Art Activities for Preschool & Toddlers | Little Learner Hub by Leah",
    description:
      "Process-focused art activities from Little Learner Hub lesson plans — open-ended art ideas for toddlers and preschoolers inside real weekly themes.",
    h1: "Process Art Activities for Early Childhood Classrooms",
    intro:
      "Art activities on this page come from published Little Learner Hub lesson plans. We highlight open-ended / process-style art ideas when titles match, and always include the parent lesson theme so providers can open the related week.",
    related: ["/childcare-activities", "/sensory-activities", "/preschool-lesson-plans", "/toddler-lesson-plans", "/daycare-curriculum"],
    faq: [
      ["What is process art in this library?", "These are Art-category activities from published lesson plans, with preference for open-ended making over rigid crafts. Full steps unlock inside free starter plans or with Pro."],
      ["Which ages have process art activities?", "Art activities appear across Toddler and Preschool plans most often, with Infant art/sensory-making when a week includes it."],
      ["How do I open the full activity?", "Choose a free starter lesson plan linked below, or create a free account and browse the activity library. Pro unlocks every published art activity."],
    ],
  },
]);

const PATH_INDEX = new Map(HUB_PAGES.map((page) => [page.path, page]));

function hubPageRoutes() {
  return HUB_PAGES.map((page) => ({
    path: page.path,
    changefreq: "weekly",
    priority: "0.85",
  }));
}

function hubPages() {
  return HUB_PAGES.slice();
}

function normalizeCategory(value) {
  return String(value || "").trim().toLowerCase();
}

function activityMatchesCategories(activity, categories) {
  if (!categories || !categories.length) return true;
  const cat = normalizeCategory(activity.activityCategory);
  return categories.some((entry) => normalizeCategory(entry) === cat);
}

function excerpt(text, maxWords = 36) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  if (words.length <= maxWords) return words.join(" ");
  return `${words.slice(0, maxWords).join(" ")}…`;
}

function sortFreeFirst(items, freeIds) {
  return items.slice().sort((a, b) => {
    const aFree = freeIds.has(a.id) || freeIds.has(a.lessonPlanId) || a.locked === false ? 1 : 0;
    const bFree = freeIds.has(b.id) || freeIds.has(b.lessonPlanId) || b.locked === false ? 1 : 0;
    if (bFree !== aFree) return bFree - aFree;
    const featuredDelta = ((b.status === "featured" ? 1 : 0) - (a.status === "featured" ? 1 : 0));
    if (featuredDelta) return featuredDelta;
    return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
  });
}

function lessonHref(plan) {
  const id = encodeURIComponent(plan.id);
  if (plan.locked === false) return `/?lesson=${id}`;
  return `/daycare-lesson-plans`;
}

function libraryHref() {
  return "/daycare-lesson-plans";
}

function signupHref() {
  return "/?signup=1";
}

function buildSnapshotHelpers(snapshot = {}) {
  const lessonPlans = Array.isArray(snapshot.lessonPlans) ? snapshot.lessonPlans : [];
  const activities = Array.isArray(snapshot.activities) ? snapshot.activities : [];
  const series = Array.isArray(snapshot.series) ? snapshot.series : [];
  const freeIds = new Set(snapshot.freeLessonPlanIds || []);
  const counts = {
    lessonPlans: lessonPlans.length,
    activities: activities.length,
    infant: lessonPlans.filter((p) => p.age === "Infant").length,
    toddler: lessonPlans.filter((p) => p.age === "Toddler").length,
    preschool: lessonPlans.filter((p) => p.age === "Preschool").length,
    free: lessonPlans.filter((p) => freeIds.has(p.id) || p.locked === false).length,
  };
  return { lessonPlans, activities, series, freeIds, counts, updatedAt: snapshot.updatedAt || "" };
}

function selectLessonsForPage(page, helpers) {
  const { lessonPlans, freeIds } = helpers;
  if (page.kind === "age-lessons") {
    return sortFreeFirst(lessonPlans.filter((plan) => plan.age === page.age), freeIds);
  }
  if (page.kind === "curriculum-hub") {
    return sortFreeFirst(lessonPlans, freeIds);
  }
  return [];
}

function selectActivitiesForPage(page, helpers) {
  const { activities, freeIds } = helpers;
  if (page.kind !== "activities") return [];
  let list = activities.filter((activity) => activityMatchesCategories(activity, page.categories));
  if (page.titleMatch instanceof RegExp) {
    const preferred = sortFreeFirst(
      list.filter((activity) => page.titleMatch.test(activity.title || "")),
      freeIds,
    );
    // Keep process-style matches first, then remaining category activities.
    const preferredIds = new Set(preferred.map((item) => item.id));
    const remainder = sortFreeFirst(
      list.filter((item) => !preferredIds.has(item.id)),
      freeIds,
    );
    return preferred.concat(remainder);
  }
  return sortFreeFirst(list, freeIds);
}

function renderLessonCardsHtml(plans, { escapeHtml, limit = 18 } = {}) {
  const slice = plans.slice(0, limit);
  if (!slice.length) {
    return `<p class="muted">Published lesson plans for this page will appear here as soon as they are live in the library.</p>`;
  }
  return `<div class="seo-card-grid">${slice.map((plan) => {
    const badge = plan.locked === false ? "Free starter" : "Library preview";
    const overview = excerpt(plan.weeklyOverview || "", 34);
    const domains = Array.isArray(plan.learningDomains) ? plan.learningDomains.slice(0, 3) : [];
    return `
      <article class="seo-card">
        <p class="seo-card-meta"><span class="seo-badge">${escapeHtml(badge)}</span> · ${escapeHtml(plan.age || "")}</p>
        <h3><a href="${escapeHtml(lessonHref(plan))}">${escapeHtml(plan.title || "Lesson plan")}</a></h3>
        ${plan.theme ? `<p class="seo-theme">Theme: ${escapeHtml(plan.theme)}</p>` : ""}
        ${overview ? `<p>${escapeHtml(overview)}</p>` : ""}
        ${domains.length ? `<p class="muted">${domains.map((d) => escapeHtml(d)).join(" · ")}</p>` : ""}
        <p><a href="${escapeHtml(lessonHref(plan))}">${plan.locked === false ? "Open free lesson plan" : "Browse in lesson library"}</a></p>
      </article>`;
  }).join("\n")}</div>`;
}

function renderActivityCardsHtml(activities, { escapeHtml, limit = 24 } = {}) {
  const slice = activities.slice(0, limit);
  if (!slice.length) {
    return `<p class="muted">Published activities for this page will appear here as soon as they are live in the library.</p>`;
  }
  return `<div class="seo-card-grid">${slice.map((activity) => {
    const parentAge = activity.parentAge || "";
    const parentTitle = activity.parentTitle || "Lesson plan";
    const parentId = activity.lessonPlanId || "";
    const href = parentId ? `/?lesson=${encodeURIComponent(parentId)}` : libraryHref();
    const badge = activity.locked === false ? "In free starter plan" : "From library plan";
    return `
      <article class="seo-card">
        <p class="seo-card-meta"><span class="seo-badge">${escapeHtml(badge)}</span>${parentAge ? ` · ${escapeHtml(parentAge)}` : ""} · ${escapeHtml(activity.activityCategory || "Activity")}</p>
        <h3>${escapeHtml(activity.title || "Activity")}</h3>
        <p class="seo-theme">From lesson: <a href="${escapeHtml(href)}">${escapeHtml(parentTitle)}</a></p>
        <p><a href="${escapeHtml(href)}">Open related lesson plan</a></p>
      </article>`;
  }).join("\n")}</div>`;
}

function renderAgeBreakdownHtml(helpers, { escapeHtml } = {}) {
  const { counts } = helpers;
  return `
    <ul class="seo-stat-list">
      <li><strong>${counts.infant}</strong> Infant lesson plans</li>
      <li><strong>${counts.toddler}</strong> Toddler lesson plans</li>
      <li><strong>${counts.preschool}</strong> Preschool lesson plans</li>
      <li><strong>${counts.activities}</strong> published activities in the library</li>
      <li><strong>${counts.free}</strong> free starter lesson plans you can open today</li>
    </ul>`;
}

function renderRelatedNavHtml(page, { escapeHtml } = {}) {
  const links = (page.related || [])
    .map((path) => PATH_INDEX.get(path))
    .filter(Boolean)
    .map((related) => `<a href="${escapeHtml(related.path)}">${escapeHtml(related.navLabel)}</a>`);
  const extras = [
    `<a href="${escapeHtml(libraryHref())}">Lesson plan library</a>`,
    `<a href="/pricing">Pricing</a>`,
    `<a href="/features">Features</a>`,
  ];
  return `<nav class="seo-related" aria-label="Related curriculum pages"><h2>Related curriculum pages</h2><p>${links.concat(extras).join(" · ")}</p></nav>`;
}

function renderFaqHtml(faqItems, { escapeHtml } = {}) {
  if (!faqItems?.length) return "";
  return `<section aria-label="Frequently asked questions"><h2>Frequently asked questions</h2>${
    faqItems.map(([q, a]) => `<article><h3>${escapeHtml(q)}</h3><p>${escapeHtml(a)}</p></article>`).join("\n")
  }</section>`;
}

function faqSchemaForPage(page, absoluteUrl) {
  const faqItems = page.faq || [];
  if (!faqItems.length) return null;
  return {
    "@type": "FAQPage",
    "@id": `${absoluteUrl(page.path)}#faq`,
    mainEntity: faqItems.map(([q, a]) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };
}

function itemListSchemaForPage(page, items, absoluteUrl) {
  if (!items.length) return null;
  return {
    "@type": "ItemList",
    "@id": `${absoluteUrl(page.path)}#list`,
    name: page.h1,
    numberOfItems: items.length,
    itemListElement: items.slice(0, 24).map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.title,
      url: absoluteUrl(page.kind === "activities" && item.lessonPlanId
        ? `/?lesson=${encodeURIComponent(item.lessonPlanId)}`
        : (item.locked === false ? `/?lesson=${encodeURIComponent(item.id)}` : "/daycare-lesson-plans")),
    })),
  };
}

function renderHubPageBody(page, snapshot, { escapeHtml } = {}) {
  const helpers = buildSnapshotHelpers(snapshot);
  const lessons = selectLessonsForPage(page, helpers);
  const activities = selectActivitiesForPage(page, helpers);
  const featuredLessons = lessons.slice(0, page.kind === "curriculum-hub" ? 12 : 18);
  const featuredActivities = activities.slice(0, 24);
  const updatedLabel = helpers.updatedAt
    ? `Library updated ${escapeHtml(String(helpers.updatedAt).slice(0, 10))}.`
    : "Library updates automatically as new plans are published.";

  let primarySection = "";
  if (page.kind === "age-lessons") {
    primarySection = `
      <h2>Published ${escapeHtml(page.age)} lesson plans (${featuredLessons.length}${lessons.length > featuredLessons.length ? ` of ${lessons.length}` : ""})</h2>
      <p class="muted">${updatedLabel} Free starter plans open fully; other plans show library previews.</p>
      ${renderLessonCardsHtml(featuredLessons, { escapeHtml })}
      <p><a class="cta" href="${escapeHtml(libraryHref())}">Browse all lesson plans</a>
      <a class="cta cta-secondary" href="${escapeHtml(signupHref())}">Create free account</a></p>`;
  } else if (page.kind === "activities") {
    primarySection = `
      <h2>Published activities (${featuredActivities.length}${activities.length > featuredActivities.length ? ` of ${activities.length}` : ""})</h2>
      <p class="muted">${updatedLabel} Each activity links to its parent lesson plan.</p>
      ${renderActivityCardsHtml(featuredActivities, { escapeHtml })}
      <p><a class="cta" href="${escapeHtml(libraryHref())}">Open the lesson plan library</a>
      <a class="cta cta-secondary" href="${escapeHtml(signupHref())}">Start free with 10 starter plans</a></p>`;
  } else {
    const byAge = {
      Infant: sortFreeFirst(helpers.lessonPlans.filter((p) => p.age === "Infant"), helpers.freeIds).slice(0, 4),
      Toddler: sortFreeFirst(helpers.lessonPlans.filter((p) => p.age === "Toddler"), helpers.freeIds).slice(0, 4),
      Preschool: sortFreeFirst(helpers.lessonPlans.filter((p) => p.age === "Preschool"), helpers.freeIds).slice(0, 4),
    };
    primarySection = `
      <h2>Live curriculum snapshot</h2>
      <p class="muted">${updatedLabel}</p>
      ${renderAgeBreakdownHtml(helpers, { escapeHtml })}
      <h2>Free starter lesson plans</h2>
      ${renderLessonCardsHtml(sortFreeFirst(helpers.lessonPlans.filter((p) => helpers.freeIds.has(p.id) || p.locked === false), helpers.freeIds), { escapeHtml, limit: 10 })}
      <h2>Infant themes in the library</h2>
      ${renderLessonCardsHtml(byAge.Infant, { escapeHtml, limit: 4 })}
      <h2>Toddler themes in the library</h2>
      ${renderLessonCardsHtml(byAge.Toddler, { escapeHtml, limit: 4 })}
      <h2>Preschool themes in the library</h2>
      ${renderLessonCardsHtml(byAge.Preschool, { escapeHtml, limit: 4 })}
      <p><a class="cta" href="${escapeHtml(signupHref())}">Create free account</a>
      <a class="cta cta-secondary" href="${escapeHtml(libraryHref())}">Browse daycare lesson plans</a></p>`;
  }

  const dynamicFaq = (page.faq || []).map(([q, a]) => {
    if (page.kind === "age-lessons" && /how many|can i try/i.test(q)) {
      return [q, `${a} Right now this page lists ${lessons.length} published ${page.age} lesson plan${lessons.length === 1 ? "" : "s"} from the live library.`];
    }
    if (page.kind === "activities" && /where do these|what counts/i.test(q)) {
      return [q, `${a} This page currently features ${activities.length} matching activit${activities.length === 1 ? "y" : "ies"}.`];
    }
    if (page.kind === "curriculum-hub" && /what is included/i.test(q)) {
      return [q, `${a} Current published totals: ${helpers.counts.lessonPlans} lesson plans and ${helpers.counts.activities} activities.`];
    }
    return [q, a];
  });

  return {
    bodyHtml: `
      <h1>${escapeHtml(page.h1)}</h1>
      <p class="muted">Live from the Little Learner Hub curriculum library · ${escapeHtml(String(helpers.counts.lessonPlans))} lesson plans · ${escapeHtml(String(helpers.counts.activities))} activities</p>
      <p>${escapeHtml(page.intro)}</p>
      ${primarySection}
      ${renderRelatedNavHtml(page, { escapeHtml })}
      ${renderFaqHtml(dynamicFaq, { escapeHtml })}
      <section>
        <h2>Start with free starter lesson plans</h2>
        <p>Create a free account to open ${helpers.counts.free || 10} complete starter lesson plans across Infant, Toddler, and Preschool — no credit card required. Upgrade anytime for the full library, unlimited printing, and new plans as they publish.</p>
        <p><a class="cta" href="${escapeHtml(signupHref())}">Create your free account</a></p>
      </section>
    `,
    listItems: page.kind === "activities" ? featuredActivities : featuredLessons,
    faqItems: dynamicFaq,
  };
}

function getHubPage(pathname) {
  return PATH_INDEX.get(pathname) || null;
}

module.exports = {
  HUB_PAGES,
  hubPageRoutes,
  hubPages,
  getHubPage,
  buildSnapshotHelpers,
  selectLessonsForPage,
  selectActivitiesForPage,
  renderHubPageBody,
  faqSchemaForPage,
  itemListSchemaForPage,
  libraryHref,
  signupHref,
};
