# Teaching Kit Linked Resources — Create / Upload Printable

**Status:** Draft PR for owner review — **do not merge or deploy without approval**  
**Branch:** `cursor/tk-linked-printable-upload-a7d4`  
**Flags:** No Teaching Kit customer flags changed (all remain default `false`)

---

## Problem

In Admin → Curriculum → Lesson Plans → (lesson) → Upgrade Lesson / Linked Resources, owners could only **link existing** resources. There was no way to create or upload a new printable from inside the Teaching Kit / lesson editor.

## Fix

Owner-only **Create / Upload Printable** in Linked Resources (classic lesson editor + Enrichment Week mode):

1. Upload a PDF (max 5 MB; magic-byte validated)  
2. Enter title, type, age group, theme, description, page count, printing instructions, access level  
3. Optional preview image (max 2 MB; PNG/JPEG/WEBP/GIF)  
4. Save as **draft only** and auto-link to the open lesson  
5. Preview/download, replace/edit, unlink, delete (archive; permanent remove for disposable fixtures)  
6. Hidden from customers until resource + lesson are explicitly published  
7. Server auth via `requireTeachingKitOwnerAdminSession` (session email `leahivie@icloud.com`) — client email/role ignored  
8. Never auto-publishes  
9. Appears in Teaching Kit printables mapping for Entire Kit / All Printables / Selected Resources once linked  

## Endpoint

`POST /api/admin/curriculum/resources/tk-printable`

Actions: `create` | `update` | `replace_pdf` | `replace_preview` | `unlink` | `delete`

## Test

```bash
npm run test:tk-linked-printable-upload
```

Disposable store only. Artifacts under `/opt/cursor/artifacts/tk-linked-printable-upload/`.

## Safety

- Does not modify Farm Animals or other real curriculum in tests  
- Enrichment drafts / published enrichment / activities preserved on create  
- Sibling lessons untouched  
- Feature flags remain false  
