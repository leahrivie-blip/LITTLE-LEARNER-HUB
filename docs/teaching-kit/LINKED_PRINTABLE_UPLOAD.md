# Teaching Kit Linked Resources — Create / Upload Printable

**Status:** Production bugfix for form state persistence — draft PR  
**Branch:** `cursor/tk-printable-form-persist-a7d4`  
**Flags:** No Teaching Kit customer flags changed (all remain default `false`)

---

## Problem

In Admin → Curriculum → Lesson Plans → (lesson) → Linked Resources → Create / Upload Printable, controlled form updates could overwrite other fields with stale/default state. Selecting the PDF re-rendered the panel, cleared the title and file input, and could remove the preview picker.

Root causes:

1. The printable UI was a nested `<form>` inside `#adminCurriculumLessonPlanForm`. Browsers drop nested form tags, so fields merged into the lesson form (duplicate `name`s) and Save submitted the wrong form.
2. Linked Resources host re-renders rebuilt the panel from defaults with no in-progress draft, so metadata and `File` objects were lost.

## Fix

1. Move `#admin-lesson-resources` **outside** the lesson plan `<form>`
2. Render the uploader as `<div id="adminTkPrintableForm" role="form">` with `data-tk-printable-field` keys (not colliding `name`s)
3. Keep `adminTkPrintableDraft` for metadata + PDF/preview `File` objects across every re-render
4. Hydrate the panel after Linked Resources / enrichment re-renders (restore values + filenames via `DataTransfer`)
5. Save via `[data-tk-printable-save]` reading the draft — never the outer lesson form
6. Still draft-only; never auto-publishes; no customer flag changes

## Endpoint

`POST /api/admin/curriculum/resources/tk-printable`

Actions: `create` | `update` | `replace_pdf` | `replace_preview` | `unlink` | `delete`

## Test

```bash
npm run test:tk-linked-printable-upload
```

Includes API coverage plus a real Playwright workflow:

fill every field → select PDF → select preview → force Linked Resources re-render → verify values/filenames → Save draft & link → refresh → confirm linked draft persists.

Disposable store only. Artifacts under `/opt/cursor/artifacts/tk-linked-printable-upload/`.

## Safety

- Does not modify Farm Animals or other real curriculum in tests  
- Enrichment drafts / published enrichment / activities preserved on create  
- Sibling lessons untouched  
- Feature flags remain false  
- No publish path in this uploader  
