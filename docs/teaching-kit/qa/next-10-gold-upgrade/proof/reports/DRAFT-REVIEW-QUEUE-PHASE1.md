# Curriculum Draft Review Queue (Phase 1)

Permanent owner-only Admin workflow for reviewing upgraded Teaching Kit packages **before** publish.

**Do not merge/deploy/import to production until Phase 1 is approved.**

## Where

Admin → Content → **Draft Review Queue**

## Phase 1 (this PR)

- Incoming draft storage on existing lesson IDs
- Submit Amazing Apples + All About Me as the first proof batch
- Queue list with scores, blockers, printable counts, status
- Open draft → Preview Teaching Kit (desktop/mobile via Enrichment Live Preview)
- Compare vs published
- Request revision (notes + `Changes Requested`)
- Discard incoming draft
- Roll back to pre-submit enrichment snapshot
- Draft PDFs remain `status=draft` (public 404)
- **No Approve / No Publish**

## Phase 2 (later, after you test Phase 1)

- Approve draft (not the same as publish)
- Separate manual Publish
- Batches up to 10

## API

`POST /api/admin/curriculum/draft-review`

Owner session required (`leahivie@icloud.com`). Client email/role claims ignored.

Optional automated submit (server env only, never in frontend):

`CURRICULUM_DRAFT_SUBMIT_TOKEN` + header `X-LLH-Curriculum-Submit-Token`

### Phase 1 actions

`list` · `get` · `preview` · `compare` · `submit` · `submit-seed-packages` · `request-revision` · `discard` · `rollback`

### Blocked until Phase 2

`approve` · `publish`

## Safety

- Never creates duplicate lessons (Create as new lesson blocked in Phase 1)
- Never publishes resources or lessons
- Snapshots + rollback IDs on submit
- Farm Animals blocked
- Published body fingerprint must stay unchanged

## Tests

```bash
npm run test:draft-review-queue
```

## Relationship to old proof importer

The temporary two-lesson phrase importer is superseded by this queue. Package loaders/safety helpers remain for seed submit only.
