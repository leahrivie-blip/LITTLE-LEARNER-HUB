# Curriculum Draft Review Queue (Phase 1)

Permanent Admin → Content → Draft Review Queue for proposed Teaching Kit upgrades.

## Scope

- Owner-only (`leahivie@icloud.com` session email; client-supplied email/role ignored)
- Draft packages target **existing** lesson IDs only — never silent lesson creation
- Full owner workflow: submit → open review → preview → printable/image review → compare → request revision → approve → publish (typed confirmation) → discard/rollback
- First local seed packages: Amazing Apples (Toddler) and All About Me (Preschool)
- Details: [OWNER-WORKFLOW.md](./OWNER-WORKFLOW.md)

## API

`POST /api/admin/curriculum/draft-review` with `{ action, ... }`

Actions include: `list`, `get`, `submit`, `submit-seed`, `save-edited`, `add-notes`, `request-revision`, `discard`, `rollback`, `compare`, `mark-in-review`, `preview`, `printable-review`, `image-review`, `approve-printable`, `approve`, `publish`, `ready-for-approval`

Optional submit token: `CURRICULUM_DRAFT_SUBMIT_TOKEN` (server-side only; not required for owner review; do not set in production yet).

## Test

```bash
npm run test:curriculum-draft-review
npm run test:draft-review-owner-workflow
```

## Seed packages

`docs/curriculum-draft-review/seed/{amazing-apples,all-about-me}/`
