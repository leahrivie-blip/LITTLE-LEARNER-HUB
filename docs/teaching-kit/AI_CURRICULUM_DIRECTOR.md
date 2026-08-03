# AI Curriculum Director

**Status:** Ready for owner review (draft PR)  
**Branch:** `cursor/tk-curriculum-director-9ad1`  
**Flag:** `featureFlags.teachingKitCurriculumDirector` (**default `false`**)  
**Critical:** Do **not** merge, deploy, or enable flags until explicit approval.

---

## Goal

AI should no longer think about only one lesson. It should understand the **entire Little Learner Hub curriculum** so every new lesson or upgrade gets smarter by knowing what already exists in the library.

Admins remain the final reviewer and publisher. Director actions never auto-publish.

---

## Curriculum Intelligence

When upgrading a lesson, AI can see library-wide:

- themes  
- printables  
- vocabulary cards  
- songs  
- books  
- activities  
- observation prompts  
- family activities  
- teacher tips  
- master reusable resources  

Reuse whenever possible instead of recreating.

Per-lesson upgrade hints are also merged into AI Teacher Assistant `connections` when **both** Director and Enrichment Editor/Authoring AI assist are enabled.

---

## Coverage Dashboard

Admin panel (Curriculum Lesson Plans → Director host) answers:

- Which themes are incomplete?  
- Which age groups are weakest?  
- Which lessons are missing printables / songs / books / example images?  
- Which lessons have never been upgraded?  
- Which lessons are viewed the most?  
- Which lessons have the lowest completion score?  

---

## AI Recommendations

Examples the Director returns:

- “Your Transportation curriculum is weaker than Farm.”  
- Age-band toolkit gaps (e.g. Toddler behind Preschool)  
- “Weather Watchers needs books.”  
- Duplicate printable consolidation  
- “Five lessons could reuse the same vocabulary cards.”  
- “Barnyard should reuse the Farm Animal Vocabulary master.”  

---

## Reusable Resource Manager (masters)

Master resources live independently of lessons on:

`siteContent.teachingKitCurriculumDirector.masterResources`

Example: **Farm Animal Vocabulary** can link into Farm Animals, Barnyard, Veterinarian, Animal Sounds, Baby Animals.

- **Auto-link related lessons** — theme match → draft references  
- **Propagate update** — pushes master body into linked lesson `enrichmentDraft.week.linkedMasterResources`  
- Published lesson fields are **not** overwritten; publish remains manual  

---

## Resource Health

Per master:

- Linked by X lessons  
- Never used  
- Duplicate detected  
- Needs update  
- Missing preview image  
- Missing printable  
- Missing accessibility text  

---

## AI Curriculum Planning

Ask questions such as:

- Build my Fall curriculum.  
- Which themes should I create next?  
- What themes are missing for infants?  
- Which lesson should I upgrade today?  
- What should I post on TikTok based on the most popular lessons?  
- What reusable resources should I build next?  

---

## AI Business Insights

Composes usage signals (views, downloads, assigns, upgrade/subscribe drivers) with search no-results:

- Most viewed / downloaded / assigned lessons  
- Lessons driving Pro upgrades / subscribe interest  
- Searched-but-missing demand  
- Build-next recommendations from real usage  

---

## API

`POST /api/admin/curriculum/director`

Actions: `snapshot`, `coverage`, `recommendations`, `intelligence_for_lesson`, `planning`, `business_insights`, `save_master`, `link_master`, `auto_link_master`, `propagate_master`, `resource_health`.

Requires admin token + `teachingKitCurriculumDirector === true`. Returns `autoPublished: false`.

---

## UI

- Host: `#adminCurriculumDirectorHost` on Curriculum Lesson Plans (when flag on)  
- Tabs: Coverage · AI Recommendations · Reusable Resources · AI Planning · Business Insights  
- Scripts: `teaching-kit-curriculum-director.js`, `teaching-kit-curriculum-director-ui.js`

---

## Tests

```bash
npm run test:teaching-kit-curriculum-director
```

Unit + API + Playwright screenshots. Suite enables the Director flag only for the test run, then resets to `false`.

---

## Guarantees

- Feature flags default **false**  
- No merge / no deploy in this phase  
- No auto-publish  
- Master propagate updates **drafts only**  
- Long-term vision: every new lesson, printable, activity, and image strengthens the whole library  
