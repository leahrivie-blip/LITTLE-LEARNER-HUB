# Curriculum upgrade safety protections

**Status:** Active as of 2026-08-04  
**Companion:** [ARCHITECTURE_FREEZE.md](./ARCHITECTURE_FREEZE.md)

## Guarantees while upgrading real lesson plans

| Protection | Behavior |
|---|---|
| Version history before every draft save | Prior draft snapshot prepended to `enrichmentPublishHistory` (`kind: "draft"`) when content changes |
| Version history before every publish | Prior published enrichment snapshot prepended (`kind: "publish"`) |
| Rollback retention | Up to **250** snapshots per lesson (effectively unlimited for upgrade campaigns) |
| Exact change view | Recovery panel → **Show exact changes** diffs tips, photos, family, materials, observations, vocabulary, substitutions |
| One-click restore | Restore any retained draft or publish snapshot for that lesson |
| Concurrent-edit warning | Draft save / restore / rollback warn on `409` — no silent overwrite |
| Lesson isolation | Saves update only the targeted `lessonPlanId` (+ its linked activities on publish/restore) |
| Audit log | `store.enrichmentEditorAudit` records save_draft, discard_draft, undo_discard, publish, restore_draft, restore_publish with timestamp + admin email |

## Verify restore works

Run disposable-fixture coverage only:

```bash
npm run test:tk-upgrade-safety
```

That script seeds an isolated plan, exercises draft history, draft restore, publish backup, publish rollback, concurrency stamps, sibling-lesson isolation, and audit entries. It never touches production curriculum.
