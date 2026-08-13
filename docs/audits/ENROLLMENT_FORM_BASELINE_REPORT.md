# Enrollment Form Baseline — Testing Report (finish pass)

**Branch:** `cursor/enrollment-form-baseline-51c0`  
**PR:** #653 (draft; base `cursor/forms-paperwork-wave8-4eae`)  
**Shell:** `20260813-enrollment-baseline1`  
**Cache:** `llh-shell-v235-enrollment-baseline1`  
**Date:** 2026-08-13  
**Rule:** Testing only. Do not merge. Do not deploy production.

---

## Final counts

| Metric | Value |
|---|---|
| Sections | **17** |
| Fields | **205** |
| Permissions (independent) | **15** |
| Emergency contact slots | **3** |
| Authorized pickup slots | **3** |

### Exact section names

1. Program / Enrollment Information  
2. Child Information  
3. Child Attendance Schedule  
4. Parent / Guardian 1  
5. Parent / Guardian 2  
6. Household / Custody Information  
7. Emergency Contacts  
8. Authorized Pickup  
9. Medical Information  
10. Immunization / Health Documentation  
11. Development / Support Information  
12. Daily Care / Routines  
13. Getting to Know Your Child  
14. Permissions  
15. Required Document Checklist  
16. Program Policies / Acknowledgments  
17. Signatures  

---

## Architecture (unchanged spine)

| Piece | Location |
|---|---|
| Forms Center / Template Library | `app.js` (HDH testing-fenced) + Wave 1–8 server libs |
| Structured Form Builder | `scripts/form-builder-lib.js` + `server/form-fields-lib.js` |
| Enrollment baseline | `server/enrollment-form-baseline.js` (+ browser copy) |
| Enrollment editor/preview/print helpers | `scripts/enrollment-form-builder.js` |
| Template store | `programData[programId].forms.templates[]` |
| Assigned / signed history | Child `Documents[]` snapshots at Confirm & Send |
| Print | Existing `printTextDocument()` |

No second Forms store, PDF vendor, or e-sign vendor.

---

## Intentionally optional

- Guardian 2 (entire section)  
- Household / custody  
- Immunization / health documentation  
- Development / support  
- Daily care / routines  
- Getting to know your child  
- Required document checklist  
- Gender, insurance provider, insurance member/policy number  
- Dentist fields  
- Infant/toddler vs older daily-care field groups (owner toggles)  
- Second guardian signature block  

## Intentionally NOT included (and why)

- New e-sign vendor / certificate — reuse Wave 5 signature placeholders  
- New PDF engine — reuse `printTextDocument`  
- Auto-apply Child Profile overwrite — soft map helper only; `mergeChildProfilePatchSafely` fills blanks only and is **not** auto-wired  
- Deep court-order document intake beyond yes/no + notes — avoid unnecessary sensitive legal detail  
- Unlimited contact repeaters — fixed 3 slots fit existing field schema without a new repeater engine  

---

## Finish-pass deltas (vs first PR commit)

- Added `program_info` section (program name, start date, enrollment type incl. before/after school, preferred classroom, schedule type) without duplicating child IDs  
- Expanded guardian fields (city/state/ZIP, work address, lives with child, legal guardian)  
- Household: other members + clearer custody wording  
- Emergency: authorized-for-emergency-contact per slot  
- Medical: dentist, dentist phone, medication allergies, optional insurance member number  
- New optional Immunization / Health Documentation section  
- Development: motor, IEP/IFSP, strategies that work well  
- Getting-to-know: dislikes, words/signs, how communicates, favorite activities, important family info  
- Permissions: private family photos **separate** from public/social; outdoor play; food/activity  
- Print blank polish (weekday grouping, writing space, photo-ID statement, no field IDs)  
- `mergeChildProfilePatchSafely` + tests proving no silent overwrite  
- Age-aware toggles verified to affect family preview  

---

## Files changed (this finish pass + original)

- `server/enrollment-form-baseline.js`  
- `scripts/enrollment-form-baseline.js`  
- `scripts/enrollment-form-builder.js`  
- `scripts/test-enrollment-form-baseline.js`  
- `scripts/test-forms-wave8-closeout.js` (shell pin only)  
- `server/form-fields-lib.js` (`MAX_FIELDS` → 240)  
- `server/program-forms-lib.js`, `scripts/form-builder-lib.js`, `app.js`, `styles.css`, shell/cache files (from original PR)  
- `docs/audits/ENROLLMENT_FORM_BASELINE_REPORT.md`  

---

## Test results

| Suite | Result |
|---|---|
| `npm run test:enrollment-form-baseline` | **PASSED** |
| `npm run test:forms-wave3-builder` | **PASSED** |
| `npm run test:forms-wave8-closeout` | **PASSED** |
| `npm run check` | **PASSED** |

### Safety checks

| Check | Result |
|---|---|
| Historical-answer protection | **PASS** |
| Child Profile overwrite protection | **PASS** (soft merge blanks-only; not auto-applied) |
| Preview cleanliness (no builder/IDs) | **PASS** |
| Print Blank quality (no builder/IDs; packet layout) | **PASS** |
| Existing Forms regression (Wave 3 + Wave 8) | **PASS** |
| Production touched | **NO** |
| Merge performed | **NO** |
| Testing deploy performed | **NO** |

---

## Screenshots

`/opt/cursor/artifacts/enrollment-baseline/screenshots/`  
(from prior pass; structure titles updated in code — re-capture after testing deploy if desired)

---

## STOP for owner approval

Ready for owner testing on this branch after an approved testing-site deploy.  
Do **not** merge to production. Do **not** deploy production.
