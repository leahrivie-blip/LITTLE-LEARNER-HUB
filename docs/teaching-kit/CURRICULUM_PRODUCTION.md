# Curriculum Production

**Status:** Ready for owner review (draft PR)  
**Branch:** `cursor/tk-curriculum-production-9ad1`  
**Critical:** Do **not** merge, deploy, or enable flags until explicit approval.

---

## Goal

Stop adding major AI capabilities. Begin upgrading the existing lesson library using the completed Teaching Kit workflow.

Work **one lesson at a time**:

1. Analyze the existing lesson  
2. Preserve all legacy content  
3. Generate AI draft improvements (fixture / approved AI modules only)  
4. Complete every Teaching Kit section  
5. Review quality  
6. Save as **enrichment draft**  
7. **Never** publish automatically  

Stages (do not skip):

**Legacy → In Progress → Needs Review → Complete**

---

## Priority order

Upgrade highest-traffic lessons first (analytics views + owner priority):

1. Farm Animals (`cur-lp-preschool-farm-animals`)  
2. All About Me (`cur-lp-preschool-all-about-me`)  
3. Colors Everywhere (`cur-lp-preschool-colors-everywhere`)  
4. Community Helpers (`cur-lp-preschool-community-helpers`)  
5. Weather Watchers (`cur-lp-preschool-weather-watchers`)  

Continue with remaining catalog lessons only after this priority queue is draft-complete.

---

## Reuse first

Before creating anything new, the runner prefers:

- Existing printables  
- Vocabulary cards  
- Posters  
- Activities  
- Teacher resources  
- Family activities  

via the Reusable Library + Curriculum Director connection hints. New resources are recorded only when no reusable match exists.

---

## Module

`scripts/teaching-kit-curriculum-production.js`

Composes approved modules only (no new major AI):

- AI Lesson Teacher — analyze / apply decisions  
- Complete kit fixture packs (`server/enrichment-ai.js`)  
- Reusable Library — prefer reuse over generate  
- Curriculum Director — reuse hints  
- Quality Review — readiness report (draft gate signal only)

---

## Feature flags

All Teaching Kit flags remain **default `false`**:

- `teachingKitViewer`  
- `teachingKitPrintCenter`  
- `teachingKitAttachments`  
- `teachingKitEnrichmentEditor`  
- `teachingKitAuthoring`  
- `teachingKitCurriculumDirector`  
- `teachingKitQualityReview`  

The production suite may enable Enrichment Editor **only inside a temporary store** to persist drafts, then restores flags to `false`.

---

## Tests

```bash
npm run test:teaching-kit-curriculum-production
```

Artifacts (under `/opt/cursor/artifacts/`):

- `tk-curriculum-production-report.json`  
- `tk-curriculum-production-upgrade-details.json`  
- `tk-curriculum-production-progress.html`  
- Screenshots: progress desktop/mobile + Farm Animals draft editor  

---

## Guarantees

- No merge / no deploy in this phase  
- Feature flags default **false**  
- Draft-only — never `publish_enrichment` from the runner  
- Legacy published fields preserved  
- Reuse-first  
- Stages not skipped  
- One lesson at a time  
