# Owner Draft Review Workflow

Authoritative product bar: [../teaching-kit/TEACHING_KIT_MASTER_SPECIFICATION.md](../teaching-kit/TEACHING_KIT_MASTER_SPECIFICATION.md)

## What this unlocks

Admin → Content → Draft Review Queue is the owner-only path to:

1. See every submitted Teaching Kit draft
2. Open Review in the **real** Teaching Kit editor (works even when `teachingKitEnrichmentEditor` store flag is false, for `leahivie@icloud.com` only)
3. Preview the customer Teaching Kit while remaining owner-only
4. Inspect **every draft printable page as a thumbnail**, open a large preview (prev/next/zoom), download, system print, checklist branding/website/cut lines/margins/labels/illustrations, then approve or request revision (opening the file alone is not enough). Replace a PDF without losing the lesson draft.
5. Inspect every required image
6. Compare published vs proposed (readable added/removed/replaced/rewritten/unchanged)
7. Request revision on the **same** queue item
8. Approve, then Publish with typed confirmation `PUBLISH TEACHING KIT` (optional `publishPrintables: true`)
9. Discard draft, roll back draft versions, or roll back a **published** disposable Teaching Kit via `publishSnapshot` without touching unrelated lessons

## Hard rules

- Scores are diagnostic only
- Publish Ready never appears while hard blockers remain
- Printable approve requires every page inspected (`record-printable-pages`)
- Publish requires Approve + typed phrase `PUBLISH TEACHING KIT`
- Draft PDFs/images stay 403/404 for non-owners
- Farm Animals and customer Teaching Kit flags must remain unchanged during review tests
- Do not start the next ten lessons until Amazing Apples + All About Me are manually approved
- See [OWNER-WORKFLOW-REPORT.md](./OWNER-WORKFLOW-REPORT.md) for GO/NO-GO and evidence

## Tests

```bash
npm run test:curriculum-draft-review
npm run test:draft-review-owner-workflow
```
