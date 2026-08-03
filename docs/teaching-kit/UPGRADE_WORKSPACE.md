# Teaching Kit Upgrade Workspace

**Status:** Ready for owner review (draft PR)  
**Branch:** `cursor/tk-upgrade-workspace-9ad1`  
**Flag:** `featureFlags.teachingKitEnrichmentEditor` (**default `false`**)  
**Critical:** Do **not** merge, deploy, or enable flags until explicit approval.

---

## Goal

Create a reusable workflow so **every existing lesson** can be upgraded into a complete Teaching Kit — one lesson at a time — without rebuilding the system.

> Open lesson → Upgrade with AI → Review → Edit → Publish → Next lesson  
> Nothing publishes automatically. Original published enrichment is preserved for rollback.

This is **not** a showcase-lesson polish pass.

---

## Admin workflow

1. Open **Upgrade Workspace** (curriculum lesson dashboard when Enrichment Editor flag is on).
2. Filter by stage, gaps (songs/books/printables/examples/toolkit/observations/family), AI Ready, age, theme, most incomplete.
3. Click **Upgrade Lesson** on any plan.
4. Use **Upgrade week with AI** / **Suggest with AI** on activities.
5. Review the approval tray → accept/edit/discard → insert into **draft only**.
6. Edit any draft fields (week + activity).
7. **Save draft** as often as needed.
8. **Publish…** only when ready (explicit confirm).
9. Optional **Rollback last publish** restores the prior published enrichment.
10. **Next lesson →** continues the one-at-a-time queue (most incomplete first).

There is **no** automatic bulk upgrade.

---

## AI draft coverage (new + existing)

| Area | Categories / fields |
| --- | --- |
| Week story | `weekly_overview`, `learning_objectives`, `materials_list` |
| Toolkit | `teacher_preparation`, `toolkit_prep`, `toolkit_observation` |
| Family | `family_connection`, `milestones` |
| Songs / books | `songs`, `books` (+ discussion questions) |
| Printables | `printable_ideas`, `vocab_cards` |
| Activities | tips, observations, vocabulary, substitutions, setting tags |
| Options | `indoor_alternatives`, `outdoor_alternatives`, adaptations, extensions |
| Directions | `setup`, `steps` |
| Images | `image_brief_setup`, `image_brief_example` (style-guide briefs; not glossy stock) |

AI never invents photo URLs, never auto-saves, never auto-publishes.

### Image generation stance

This slice ships **style-guide image briefs** as editable drafts. Admins upload matching classroom photos (or create images from the brief). Full automatic image generation remains optional/future and must still require human approve + upload/publish.

---

## Dashboard fields

For every lesson (flag on):

- Upgrade status (Legacy / In Progress / Needs Review / Ready / Complete)
- Completion %
- Gaps: songs, books, printables, examples, toolkit, observations, family
- Last updated
- AI Ready

Filters include most incomplete, AI Ready, age, theme, and gap types. Sort includes most incomplete and age/theme.

---

## Data safety

- Draft channel stays separate until Publish.
- Publish writes `enrichmentPublishHistory` snapshots.
- Rollback restores a prior snapshot without bulk side effects.
- Classic lesson bodies remain preservable (prior preserve remediation).

---

## Flags

All Teaching Kit flags remain **default `false`**. This PR does not enable them.

---

## Tests

```bash
npm run test:teaching-kit-upgrade-workspace
npm run test:teaching-kit-enrichment
npm run check
```

---

## Known limitations

- No analytics for “most viewed / most assigned” yet (metrics not on lesson plans).
- Image briefs are not auto-rendered photos.
- Shared activity masters still deferred.
- Flags must stay off until owner enable.

## Production readiness

**7 / 10** for workflow review — reusable upgrade path for any lesson; not production-enabled.
