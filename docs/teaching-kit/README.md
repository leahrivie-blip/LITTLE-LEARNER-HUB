# Teaching Kit — Product Design & Architecture

**Status**

- Slice 1A **done** — flags + schema passthrough
- Slice 1B **done** — `mapLessonPlanToTeachingKit` read-model
- Slice 1C **done** — flagged `GET …/teaching-kit` API
- Slice 1D **done — awaiting review** — flagged companion UI
- Teaching Kit flags remain **disabled** (`false`) by default
- Product design **v4 approved** as the build target
- Slice 1E (Build My Kit PDF / Print Center) **not started**

## Start here

| Deliverable | Path |
| --- | --- |
| Product specification (v4) | [GOLD_STANDARD_PRODUCT_SPEC.md](./GOLD_STANDARD_PRODUCT_SPEC.md) |
| Clickable companion mockup | [mockups/gold-standard.html](./mockups/gold-standard.html) |
| Technical architecture | [../TEACHING_KIT_PHASE1_ARCHITECTURE.md](../TEACHING_KIT_PHASE1_ARCHITECTURE.md) |
| Viewer UI (Slice 1D) | `scripts/teaching-kit-viewer.js` |
| API (Slice 1C) | `GET /api/curriculum/lesson-plans/:id/teaching-kit` |
| Tests | `npm run test:teaching-kit-slice-1a` … `1d` |

### Slice 1D exit criteria

- Companion UI matches approved mockup surfaces (read-only)
- Behind `teachingKitViewer` only; fail closed to legacy lesson workspace
- Back · favorite/save · Use This Plan / assign preserved
- Flags remain false; no merge/deploy/enablement

### How to preview locally (not production)

1. Run the app with admin credentials.
2. In admin site-content, set `featureFlags.teachingKitViewer: true` (local only).
3. Open an unlocked lesson plan — Teaching Kit companion replaces the legacy tab workspace.
4. Reset the flag to `false` when finished.

## Hold

No Slice 1E, merge, deploy, or flag enablement until Slice 1D review is approved.
