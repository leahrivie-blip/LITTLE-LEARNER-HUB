# Teaching Kit — Product Design & Architecture

**Status**

- Slice 1A–1F **done**
- Phase 1 final QA **complete** — see [PHASE1_QA_READINESS_REPORT.md](./PHASE1_QA_READINESS_REPORT.md)
- Teaching Kit flags remain **disabled** (`false`) by default
- Product design **v4 approved** as the build target
- Slice 1G (attachments) **optional / not started**
- **No merge, deploy, or flag enablement** until owner production sign-off

## Start here

| Deliverable | Path |
| --- | --- |
| Product specification (v4) | [GOLD_STANDARD_PRODUCT_SPEC.md](./GOLD_STANDARD_PRODUCT_SPEC.md) |
| **Phase 1 QA readiness report** | [PHASE1_QA_READINESS_REPORT.md](./PHASE1_QA_READINESS_REPORT.md) |
| Clickable companion mockup | [mockups/gold-standard.html](./mockups/gold-standard.html) |
| Technical architecture | [../TEACHING_KIT_PHASE1_ARCHITECTURE.md](../TEACHING_KIT_PHASE1_ARCHITECTURE.md) |
| Print Center (Slice 1E/1F) | `scripts/teaching-kit-print.js` |
| Viewer UI (Slice 1D/1F) | `scripts/teaching-kit-viewer.js` |
| Tests | `npm run test:teaching-kit-slice-1a` … `1f` + `test:teaching-kit-phase1-qa` |

### Slice 1F exit criteria

- Empty lesson plans do not break the Teaching Kit UI
- Large lesson plans map / render / print quickly
- Print keeps blocks together; footers/page numbers do not collide with content
- Binder supports **US Letter** and **A4**
- Images scale with `object-fit: contain` (not blurry crop / oversized stretch)
- Trial/Pro print authorization gate hardened (flag-off never consumes trial exports)
- Loading hint + smoother panel navigation; flags remain false

### Local preview only (not production)

1. Admin site-content: `teachingKitViewer: true` and `teachingKitPrintCenter: true`
2. Open an unlocked lesson → Build / Print → choose Letter or A4 → Print Teaching Kit binder
3. Also open an empty draft and a large plan to confirm polish
4. Reset both flags to `false`

## Hold

No merge, deploy, or flag enablement until the owner approves the [Phase 1 QA readiness report](./PHASE1_QA_READINESS_REPORT.md).
