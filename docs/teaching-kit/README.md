# Teaching Kit — Product Design & Architecture

**Status**

- Slice 1A–1D **done**
- Slice 1E **done — awaiting review** — Print Center / binder print
- Teaching Kit flags remain **disabled** (`false`) by default
- Product design **v4 approved** as the build target
- Slice 1F+ **not started**

## Start here

| Deliverable | Path |
| --- | --- |
| Product specification (v4) | [GOLD_STANDARD_PRODUCT_SPEC.md](./GOLD_STANDARD_PRODUCT_SPEC.md) |
| Clickable companion mockup | [mockups/gold-standard.html](./mockups/gold-standard.html) |
| Technical architecture | [../TEACHING_KIT_PHASE1_ARCHITECTURE.md](../TEACHING_KIT_PHASE1_ARCHITECTURE.md) |
| Print Center (Slice 1E) | `scripts/teaching-kit-print.js` |
| Viewer UI (Slice 1D) | `scripts/teaching-kit-viewer.js` |
| Tests | `npm run test:teaching-kit-slice-1a` … `1e` |

### Slice 1E exit criteria

- Build My Kit Print Center with presets + section toggles
- Professional binder print layout (cover · tabs · branding · footers)
- Selected activities/sections only
- Trial export authorize path runs before print (no bypass)
- Legacy print still works; flags remain false

### Local preview only (not production)

1. Admin site-content: `teachingKitViewer: true` and `teachingKitPrintCenter: true`
2. Open an unlocked lesson → Build / Print → Print Teaching Kit binder
3. Reset both flags to `false`

## Hold

No Slice 1F+, merge, deploy, or flag enablement until Slice 1E review is approved.
