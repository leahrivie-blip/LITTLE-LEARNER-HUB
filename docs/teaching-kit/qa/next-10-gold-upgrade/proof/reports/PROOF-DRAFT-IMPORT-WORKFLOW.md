# Proof Draft Import — owner-only Admin workflow

**Status:** Draft PR workflow only. Do **not** merge, deploy, or run against production until disposable-fixture tests pass **and** the owner approves.

**Packages allowed (exactly two):**
- Amazing Apples — Toddler (`cur-lp-toddler-amazing-apples`)
- All About Me — Preschool (`cur-lp-preschool-all-about-me`)

Farm Animals and the other eight lessons are blocked.

---

## What it does

1. **Dry-run** — shows exact enrichment fields and draft printable resource changes; fingerprints published body + activity links.
2. **Confirm enrichment** — writes `enrichmentDraft` only on the existing lesson. Creates a `proof_import_snapshot` rollback id. Never replaces published lesson fields.
3. **Confirm printable** — uploads/links the finished PDF as `status=draft` only. Never publishes.
4. **Verify** — re-checks fingerprints, draft survival, public 404 probe, and honest Quality Review scores (actual draft catalog — no fake published credit).

Publish is intentionally **not** part of this workflow.

---

## Auth

- Endpoint: `POST /api/admin/curriculum/proof-draft-import`
- Gate: `requireTeachingKitOwnerAdminSession` → session email must be `leahivie@icloud.com`
- Client-supplied `adminEmail` / `role` claims are ignored

---

## Admin UI

Curriculum Lesson Plans → **Import Proof Draft** (owner session only).

Confirm phrases:
- Enrichment: `IMPORT ENRICHMENT DRAFT`
- Printable: `IMPORT DRAFT PRINTABLE`

---

## Rollback

After enrichment confirm, use the returned `rollbackId`:

```http
POST /api/admin/curriculum/enrichment-rollback
{ "planId": "<lessonId>", "versionId": "<rollbackId>" }
```

Unlink draft printable via Teaching Kit printable `unlink` (or archive). Published lesson body should never need restore if fingerprints stayed equal.

---

## Tests

```bash
npm run test:proof-draft-import
```

Disposable store only. Artifacts: `/opt/cursor/artifacts/proof-draft-import/`.

---

## Safety checklist

- [x] enrichmentDraft only (no published replace)
- [x] draft printable only
- [x] no duplicate lessons
- [x] no temporary published resource records
- [x] draft PDF → 404 on public file endpoint
- [x] Farm Animals blocked / untouched
- [x] no Publish step
- [ ] owner approval before any production run
- [ ] no merge/deploy until approved
