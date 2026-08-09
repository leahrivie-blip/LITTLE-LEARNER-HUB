# Owner Draft Review Workflow

Authoritative product bar: [../teaching-kit/TEACHING_KIT_MASTER_SPECIFICATION.md](../teaching-kit/TEACHING_KIT_MASTER_SPECIFICATION.md)

## What this unlocks

Admin → Content → Draft Review Queue is the owner-only path to:

1. See every submitted Teaching Kit draft
2. Open Review in the **real** Teaching Kit editor (works even when `teachingKitEnrichmentEditor` store flag is false, for `leahivie@icloud.com` only)
3. Preview the customer Teaching Kit while remaining owner-only
4. Inspect every draft printable page and every required image
5. Compare published vs proposed (readable added/removed/replaced/rewritten/unchanged)
6. Request revision on the **same** queue item
7. Approve, then Publish with typed confirmation
8. Discard draft or roll back draft versions without touching unrelated lessons

## Hard rules

- Scores are diagnostic only
- Publish Ready never appears while hard blockers remain
- Publish requires Approve + typed phrase `PUBLISH TEACHING KIT`
- Draft PDFs/images stay 403/404 for non-owners
- Farm Animals and customer Teaching Kit flags must remain unchanged during review tests
- Do not start the next ten lessons until Amazing Apples + All About Me are manually approved

## Tests

```bash
npm run test:curriculum-draft-review
npm run test:draft-review-owner-workflow
```
