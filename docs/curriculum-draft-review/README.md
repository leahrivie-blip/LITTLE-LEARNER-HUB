# Curriculum Draft Review Queue (Phase 1)

Permanent Admin → Content → Draft Review Queue for proposed Teaching Kit upgrades.

**Content bar for every upgrade:** [../teaching-kit/TEACHING_KIT_MASTER_SPECIFICATION.md](../teaching-kit/TEACHING_KIT_MASTER_SPECIFICATION.md)

## Scope

- Owner-only (`leahivie@icloud.com` session email; client-supplied email/role ignored)
- Draft packages target **existing** lesson IDs only — never silent lesson creation
- Phase 1: submit, review, revise, discard, rollback — **no publish**
- First local seed packages: Amazing Apples (Toddler) and All About Me (Preschool)
- Lesson brief → one draft kit → checks → queue → owner feedback on the same queue item (Master Spec workflow)

## API

`POST /api/admin/curriculum/draft-review` with `{ action, ... }`

Phase 1 actions: `list`, `get`, `submit`, `submit-seed`, `save-edited`, `add-notes`, `request-revision`, `discard`, `rollback`, `compare`, `mark-in-review`

Optional future submit token: `CURRICULUM_DRAFT_SUBMIT_TOKEN` (server-side only; not required for owner review; do not set in production yet).

## Test

```bash
npm run test:curriculum-draft-review
```

## Seed packages

`docs/curriculum-draft-review/seed/{amazing-apples,all-about-me}/`
