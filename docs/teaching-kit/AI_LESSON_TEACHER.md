# AI Lesson Teacher

**Status:** Ready for owner review (draft PR)  
**Branch:** `cursor/tk-ai-lesson-teacher-9ad1`  
**Flag:** `featureFlags.teachingKitEnrichmentEditor` (**default `false`**)  
**Critical:** Do **not** merge, deploy, or enable flags until explicit approval.

---

## Goal

When an admin clicks **Upgrade Lesson**, the workspace is not an empty editor. The **AI Lesson Teacher** analyzes the lesson, scores completeness, prepares a gap-fill Teaching Kit draft, and presents a **Current Lesson vs AI Draft** review. Publish stays fully manual.

---

## Workflow

1. **Upgrade Lesson** opens the Enrichment Editor.
2. Local analysis scores every Teaching Kit area: Complete / Needs Improvement / Missing.
3. **Prepare AI Draft** (auto-starts when gaps exist and admin token is present) calls `POST /api/admin/curriculum/enrichment-ai-suggest` with `scope: "lesson"`.
4. Server generates a lesson pack (week + first activities), filters to gap sections only, and returns suggestions **without writing the store**.
5. Side-by-side review: Accept / Reject / Edit before accept · Accept all · Reject all · Accept selected.
6. Accepted rows apply **additively** into `enrichmentDraft` only.
7. Completion % / analysis panel refresh after each accept.
8. **Save draft** / **Publish…** remain explicit admin actions.

Never overwrites published content without approval. Never deletes legacy content. Never auto-publishes.

---

## Completeness sections scored

Overview · Objectives · Vocabulary · Materials · Daily plan · Activities · Teacher tips · Observation prompts · Songs · Books · Book questions · Family connections · Printables · Images · Teacher Toolkit

Score = **completeness only**, not educational quality.

---

## AI draft coverage

| Area | What AI drafts |
| --- | --- |
| Week | Overview, objectives, materials, teacher prep, toolkit, family |
| Books | Title suggestions + before/during/after questions (no copyrighted book text) |
| Songs | Public-domain / original LLH style + motions (no copyrighted lyrics) |
| Printables | Editable ideas: vocab cards, instruction sheets, observation sheets, parent letters |
| Activities | Tips, setup, steps, prompts, vocab, adaptations, extensions, indoor/outdoor |
| Images | Style-guide **briefs only** (setup / finished example) — admin uploads or creates final images |

---

## API

`POST /api/admin/curriculum/enrichment-ai-suggest`

```json
{
  "planId": "cur-lp-…",
  "scope": "lesson",
  "activityKey": ""
}
```

Response includes `suggestions`, `analysis`, and guarantees:

- `autoSaved: false`
- `autoPublished: false`
- `curriculumUnchanged: true`
- `publishedContentPreserved: true`

---

## Modules

| Path | Role |
| --- | --- |
| `scripts/teaching-kit-ai-lesson-teacher.js` | Analyze, filter gaps, apply decisions |
| `server/enrichment-ai.js` | `buildLessonTeacherFixtureSuggestions` |
| `scripts/teaching-kit-enrichment-editor.js` | Analysis panel + side-by-side review UI |

---

## Tests

```bash
npm run test:teaching-kit-ai-lesson-teacher
```

Flags stay default `false` outside the suite.

---

## Known limitations

- Without OpenAI, lesson scope uses the structured fixture pack (deterministic, reviewable).
- Complete-kit generation batches every activity (see `COMPLETE_KIT_GENERATION.md`).
- Image briefs are text only — no automatic image generation or upload.
- Songs/books are suggestions only; copyrighted lyrics and book text are never reproduced.
- Completion score does not judge pedagogy quality.
- **Regenerate only this section** is planned as a follow-up (not in the complete-kit PR).

---

## Production readiness

See latest score in `COMPLETE_KIT_GENERATION.md` (complete-kit phase).
