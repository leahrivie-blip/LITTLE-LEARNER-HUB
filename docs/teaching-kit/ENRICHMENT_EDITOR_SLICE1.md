# Teaching Kit Enrichment Editor — Slice 1

**Status:** Ready for owner review (do not merge / deploy / enable flag without approval)  
**Flag:** `featureFlags.teachingKitEnrichmentEditor` (**default `false`**)  
**Scope:** Editor framework · navigation · progress tracking · draft workflow  

---

## What Slice 1 delivers

| Area | Included |
| --- | --- |
| Feature flag | `teachingKitEnrichmentEditor` defaults **false**; no public exposure change |
| Admin entry | **Enrich Teaching Kit** + completion/gap library UI only when flag is on |
| Framework | Focused shell, mode tabs, Upgrade Summary panel |
| Navigation | Activity queue statuses, Activity N of M, Previous/Next, Jump to…, day chips |
| Progress | Overall % bar, Legacy → Enriched → Complete, Upgrade Summary counts |
| Draft workflow | Autosave + Save draft via `saveMode: "enrichment_draft"` (one lesson only) |
| Published safety | Draft channel only; published member lesson body unchanged |

## Explicitly out of Slice 1

- Photo upload / replace / remove (read-only placeholders only)
- AI tip suggestions
- Live Preview (provider Teaching Kit viewer)
- Publish enrichment to providers (`saveMode: "publish_enrichment"` → `403 enrichment_publish_disabled`)
- Lesson rewrite, migration, or bulk curriculum updates

---

## Safety constraints (enforced)

1. Flag off → Enrich UI hidden; draft API returns `404 enrichment_editor_disabled`.  
2. Draft save updates **only** `enrichmentDraft` on the **current** lesson id.  
3. No bulk curriculum rewrite; no migration of existing plans.  
4. Existing lesson plans remain backward compatible (optional `enrichmentDraft` ignored by members).  
5. Checklist / Upgrade Summary never blocks draft save.

---

## Local review (flag on temporarily)

1. Admin → site content feature flags: set `teachingKitEnrichmentEditor: true` (or patch via admin site-content save).  
2. Open Curriculum lesson plans → **Enrich Teaching Kit**.  
3. Confirm: first incomplete activity, queue statuses, Activity N of M, Jump, Upgrade Summary, draft save.  
4. Confirm Publish is disabled; photo zones say later slice; Live Preview stub.  
5. **Reset flag to `false`** after review.

---

## Viewport verification

Automated in `npm run test:teaching-kit-enrichment-slice-1` at:

| Viewport | Size |
| --- | --- |
| Desktop | 1280 × 800 |
| Tablet | 768 × 1024 |
| Mobile | 390 × 844 |

Checks: shell visible, chrome/counter present, summary or toggle present, no horizontal overflow on shell.

---

## Regression tests

```bash
npm run test:teaching-kit-enrichment          # pure helpers
npm run test:teaching-kit-enrichment-slice-1  # flag gate + draft API + viewports
npm run check
```

---

## Rollback instructions

No data migration to undo.

1. **Immediate hide:** set `siteContent.featureFlags.teachingKitEnrichmentEditor` to `false` (or omit).  
2. Draft API becomes unavailable (`enrichment_editor_disabled`); any stored `enrichmentDraft` blobs remain inert.  
3. Member-facing lessons unchanged (they never read `enrichmentDraft`).  
4. Optional code rollback: revert this slice’s commits; leave flag false either way.  
5. **Do not** bulk-delete `enrichmentDraft` unless intentionally clearing admin drafts.

---

## Approval gate

- Do **not** merge to `main` until owner approves Slice 1.  
- Do **not** deploy or enable the flag in production until owner approves.  
- After approval, stop and wait before starting Slice 2 (photos / preview / publish as planned).
