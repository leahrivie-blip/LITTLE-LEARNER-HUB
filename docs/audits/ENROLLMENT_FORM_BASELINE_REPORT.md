# Enrollment Form Baseline — Testing Report

**Branch:** `cursor/enrollment-form-baseline-51c0`  
**PR:** #653 (draft; base `cursor/forms-paperwork-wave8-4eae`)  
**Shell:** `20260813-enrollment-baseline1`  
**Cache:** `llh-shell-v235-enrollment-baseline1`  
**Date:** 2026-08-13  
**Rule:** Testing only. Do not merge. Do not deploy production.

---

## 1. Existing enrollment architecture found

| Piece | Location |
|---|---|
| Forms Center / Paperwork HQ / Template Library | `app.js` (HDH testing-fenced) + Wave 1–8 server libs |
| Structured Form Builder | `scripts/form-builder-lib.js` + `server/form-fields-lib.js` |
| Enrollment starter pack entry | `HOME_DAYCARE_FORMS_PACK` → `hdh-pack-enrollment` |
| Template store | `programData[programId].forms.templates[]` |
| Assigned / signed history | Child `Documents[]` snapshots `fields` + body at Confirm & Send |
| Print / PDF | Existing `printTextDocument()` (browser print / Save as PDF) |
| Child Profile overlap | `name`, `dob`, `classroom`, `enrollmentDate`, `parentInfo`, `emergencyContact`, `pickupContacts`, `allergies`, `medical` |

No second Forms store, PDF engine, or enrollment CRM was added.

---

## 2. Files changed

- `server/enrollment-form-baseline.js` (new)
- `scripts/enrollment-form-baseline.js` (browser UMD copy)
- `scripts/enrollment-form-builder.js` (new)
- `scripts/test-enrollment-form-baseline.js` (new)
- `scripts/form-builder-lib.js`
- `server/form-fields-lib.js` (MAX_FIELDS 80 → 220; section metadata)
- `server/program-forms-lib.js` (sections/config normalize + enrollment duplicate seed)
- `app.js` (enrollment section-card editor wiring)
- `styles.css`, `index.html`, `service-worker.js`, `llh-shell-manifest.json`, `package.json`
- `.cursor/rules/forms-paperwork-feature-freeze.mdc` (owner-approved exception note)

---

## 3. Exact sections / fields added

15 sections / **165** structured fields, including:

1. Child Information  
2. Enrollment Schedule & Hours (Mon–Fri attending + arrival + departure; notes; variable schedule)  
3. Parent / Guardian 1  
4. Parent / Guardian 2 (optional section)  
5. Household / Custody Information  
6. Emergency Contacts (3 slots)  
7. Authorized Pickup (3 slots + ID policy note)  
8. Medical Information  
9. Development & Individual Needs (optional by default)  
10. Daily Care Information (infant/toddler + older, configurable)  
11. Getting to Know Your Child  
12. Permissions & Consents (12 separate yes/no items)  
13. Required Document Checklist  
14. Policy Acknowledgments  
15. Signatures (printable / existing signature placeholders — no new e-sign vendor)

---

## 4. What the owner can customize

- Show/hide optional sections; rename section titles; reorder sections  
- Required/optional + visible per field (labels editable; IDs fixed)  
- Age-care toggles (infant/toddler vs older), gender, insurance  
- Min emergency contacts / min authorized pickup  
- Add custom short / multiline / yes-no questions  
- Add custom permission / document / policy acknowledgment  
- Preview Form, Print Blank Form, Save Changes  

---

## 5. What intentionally remains fixed

- Stable internal field IDs (`enroll.*`)  
- Forms spine stores / assign / Family Hub / signature wave architecture  
- No new PDF generator; no new e-sign infrastructure  
- Production env / Render / Postgres untouched  
- Non-enrollment Forms Center behavior unchanged  

---

## 6. Historical enrollment answers protected

- Confirm & Send already snapshots `fields` + body onto the Document  
- Template label/visibility edits bump template content only  
- Tests prove historical snapshot labels/answers stay unchanged after template edits  

---

## 7. Child Profile overlap handling

- Soft mapping helper: `buildChildProfilePatchFromEnrollmentAnswers()`  
- Canonical current profile keys only (name/dob/classroom/enrollmentDate/parentInfo/emergency/pickup/allergies/medical)  
- Does **not** auto-rewrite profile or mutate signed enrollment snapshots  

---

## 8. Print / preview behavior

- Preview uses enrollment renderer with **no** builder controls  
- Print Blank builds plain text via existing `printTextDocument`  
- Includes program name, child name line, section headings, blank lines/boxes  
- Print CSS hides editor chrome  

---

## 9. Tests run and results

| Suite | Result |
|---|---|
| `npm run test:enrollment-form-baseline` | **PASSED** |
| `npm run test:forms-wave3-builder` | **PASSED** |

---

## 10. Testing-site deploy / version

**Not deployed** to Render testing in this run (STOP gate).  
Shell ready for testing deploy when approved: `20260813-enrollment-baseline1`.

---

## 11. Screenshots

Artifacts: `/opt/cursor/artifacts/enrollment-baseline/screenshots/`

1. `01-owner-form-editor.png` — owner section-card editor  
2. `02-section-customized.png` — Child Information Edit section  
3. `03-full-preview.png` / `03b-full-preview-scrolled.png` — family preview  
4. `04-print-blank.png` — blank printable enrollment form  

---

## 12. Blockers for owner testing

None for local/testing-branch owner testing of the Enrollment Form editor, preview, print-blank, and save path.

Remaining non-blockers (pre-existing Forms spine):

- Testing acknowledgment is not a legal e-sign certificate  
- Parent structured fill-in for assigned docs still uses the existing Wave answer/sign path  
- Testing-site Render deploy not performed in this run  
