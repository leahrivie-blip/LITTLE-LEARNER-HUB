# Cleanup report (inventory only — no deletes/edits in this PR)

**Date:** 2026-08-08  
**PR scope:** Report only. Do **not** delete or edit the archived disposable lesson or Farm Animals in this PR.

---

## 1. Archived DISPOSABLE TK Printable Prod Verify

### Finding in repo

The exact title **“DISPOSABLE TK Printable Prod Verify”** is **not present in Git**. It is expected to exist only in the **production Admin curriculum store** (created during an earlier printable prod-verify pass).

### Closest repo allowlist / fixtures (do not confuse with prod title)

| ID | Title / note | Action in this PR |
|---|---|---|
| `cur-lp-19fcc8a9f18314f85fb` | ZZ QA Disposable Teaching Kit Fixture 2026-08-04 (server allowlist) | None |
| `cur-lp-tk-printable-upload-fixture` | Test-only TK printable upload fixture | None |
| `cur-lp-qa-farm-animals-image-classifications` | QA Farm Animals image classifications fixture | None |

### Recommended future cleanup (owner-approved, separate PR)

1. In production Admin, search title: `DISPOSABLE TK Printable Prod Verify` (and variants with `ZZ QA` / `Disposable`).
2. Confirm `disposableQaFixture === true` **and** `status === archived`.
3. Inventory linked `resourceIds`, enrichment draft/history, and media asset refs.
4. Permanent delete only via owner path:  
   `POST /api/admin/curriculum/disposable-fixture/permanent-delete`  
   with exact title + phrase `PERMANENTLY DELETE`.
5. Re-search Admin + public library to confirm absence; confirm no customer-visible resource URLs remain.

**This PR does not perform that delete.**

---

## 2. Farm Animals — duplicated printable ideas

### Canonical lesson (do not modify)

- Lesson ID: `cur-lp-preschool-farm-animals`
- Title: Farm Animals
- Related toddler lesson (also out of scope): `cur-lp-toddler-farm-friends`

### Duplicate / pending printable idea pattern

Gold-upgrade tooling stamps a “Picture Card Pack” printable idea onto theme kits (Farm Animals was the style reference). Pending title-only items appear in upgrade scripts:

- `Farm Animals Preschool Picture Card Pack`
- `Farm Animals Original Songs and Movements`

Director docs also call out duplicate printable consolidation / master-resource reuse (e.g. Farm Animal Vocabulary master for Barnyard).

Proof packages for Amazing Apples / All About Me intentionally follow the same **Picture Card Pack** pattern but use **proof-only** resource IDs:

- `cur-res-proof-amazing-apples-picture-cards`
- `cur-res-proof-all-about-me-picture-cards`

### Recommended future cleanup (separate PR, after owner review)

1. Export Farm Animals linked resources + `enrichmentDraft.week.printableIdeas` / `printableIds` from production Admin.
2. Diff against master resources and Director `duplicate_printables` findings.
3. Decide keep vs archive vs merge for duplicate idea rows (titles only vs real `cur-res-*` files).
4. Do **not** alter Farm Animals while proof draft import for the two lessons is still under review.

**This PR does not edit Farm Animals.**

---

## 3. Safety reminders for any later cleanup PR

- No Teaching Kit customer flag changes unless explicitly requested
- No publish of proof drafts as part of cleanup
- Prefer archive → confirm → permanent delete for disposables
- Keep a before/after fingerprint of Farm Animals published body if any resource unlink is later approved
