# Complete Teaching Kit Generation

**Status:** Ready for owner review (draft PR)  
**Branch:** `cursor/tk-complete-kit-generation-9ad1`  
**Flag:** `featureFlags.teachingKitEnrichmentEditor` (**default `false`**)  
**Critical:** Do **not** merge, deploy, or enable flags until explicit approval.

---

## Goal

When an admin clicks **Upgrade Lesson**, AI prepares a **complete draft Teaching Kit** for the entire lesson — every week section and every activity — reviewable beginning to end before publish.

This expands the approved AI Lesson Teacher beyond week + first-three-activities.

---

## Coverage

| Area | Drafted |
| --- | --- |
| Week | Overview, objectives, materials, teacher preparation |
| Developmental domains | Multiple milestone tags (Language, SEL, Fine/Gross motor, Cognition, Creativity) |
| Vocabulary | Week vocab cards + per-activity vocabulary |
| Daily plans | Every weekday activity receives a draft pack |
| Every activity | Tips, cleanup tip, observations, setup, steps, adaptations, extensions |
| Indoor / outdoor | Alternatives + setting tags |
| Small / large group | Group ideas + tags |
| Family | Family connection activities |
| Songs | Original / public-domain style only (no copyrighted lyrics) |
| Books | Recommendations + before/during/after prompts (no copyrighted text) |
| Printables | Vocab cards, instruction sheets, observation sheets, matching cards, craft templates, parent letters |
| Teacher Toolkit | Prep checklist + observation focus |
| Images | Setup + finished example briefs for **every** activity |

---

## Batching (one review session)

Large lessons process in safe batches (default **5 activities** per request):

1. Batch 0: week binder + activities `0…4`
2. Batch 1+: next activity slices until done

The editor accumulates rows and presents **one continuous side-by-side review**. Progress shows `Activities X/Y · N batches · seconds`.

API:

```json
{
  "planId": "…",
  "scope": "lesson",
  "activityOffset": 0,
  "activityLimit": 5,
  "includeWeek": true
}
```

Response includes `batch: { activityTotal, nextOffset, hasMore, … }`.

---

## Review controls

- Accept one suggestion  
- Accept a section (overview, songs, books, toolkit, …)  
- Accept an activity  
- Accept all / Reject all  
- Edit before accepting  

Nothing publishes automatically. Legacy content is never deleted.

---

## Completeness dashboard

Completion % now counts **published + enrichment draft** across the full kit (including image briefs and activity depth). A lesson with large missing areas is not reported as Complete.

---

## Tests

```bash
npm run test:teaching-kit-complete-kit-generation
npm run test:teaching-kit-ai-lesson-teacher
```

---

## Known limitations

- Fixture-backed when OpenAI is unset (deterministic packs).
- Image briefs are text only — photos still require admin upload/create.
- Songs/books never reproduce copyrighted material.
- Completion = completeness only, not pedagogy quality.
- **Regenerate only this section** is intentionally deferred to a follow-up PR.

---

## Production readiness (this phase)

**8/10** — full-lesson batched generation + section/activity accept wired; still flag-gated and not production-enabled.
