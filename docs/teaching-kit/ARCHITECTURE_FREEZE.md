# Teaching Kit architecture freeze (curriculum upgrade period)

**Status:** Active as of 2026-08-04  
**Scope:** Admin Teaching Kit Enrichment Editor and related publish/rollback APIs

## Freeze rules

While real lesson plans are being upgraded into Teaching Kits:

1. **Do not redesign** the Teaching Kit data model.
2. **Do not rename** existing enrichment / history / draft fields.
3. **Do not change the editor workflow** unless there is a critical bug that blocks safe upgrades.
4. **Avoid UI redesigns** during the curriculum upgrade campaign.
5. Treat the Enrichment Editor as **feature complete**.
6. **Allowed:** bug fixes, performance improvements, accessibility improvements, and **safety** hardening (version history, rollback, concurrency warnings, audit logs).
7. **New product features** go to a separate backlog unless they are required to safely upgrade curriculum.

## Stable surfaces (do not redesign)

- `enrichmentDraft` — admin-only draft channel
- `enrichmentDraftUndo` — one-shot discard undo
- `enrichmentPublishHistory` — version snapshots (publish + draft save backups)
- `saveMode: enrichment_draft` / `publish_enrichment`
- `POST /api/admin/curriculum/enrichment-rollback`
- Lesson-scoped activity writes (`lessonPlanId` isolation)
- Curriculum wipe guards / `expectedUpdatedAt` concurrency stamps

## Customer flags

Customer Teaching Kit Viewer, Print Center, and Attachments remain **OFF** until an intentional launch. Curriculum enrichment work must not enable those flags.

## Safety baseline for upgrades

See [UPGRADE_SAFETY.md](./UPGRADE_SAFETY.md) and `npm run test:tk-upgrade-safety`:

- Version history before draft saves and before publish
- Restore / rollback of any retained snapshot for that lesson
- Exact change summary between versions
- Concurrent-edit warning (no silent overwrite)
- Per-lesson save isolation
- Audit log for save / publish / restore / rollback
- Audit log of save / publish / restore / rollback

## Out of scope during freeze

- Teaching Kit Viewer / Print Center / Attachments customer launch
- New enrichment field schemas
- Bulk rewrite of published curriculum
- Family Hub / billing / entitlement changes tied to Teaching Kits
