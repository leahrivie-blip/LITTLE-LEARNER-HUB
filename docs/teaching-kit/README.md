# Teaching Kit — Product Design & Architecture

**Status**

- Slice 1A implementation **approved** (flags + schema passthrough) — **not merged / not deployed**
- Gold-standard product UX ready for **owner review** before Slice 1B
- All Teaching Kit feature flags remain **disabled**

## Start here (product validation)

| Deliverable | Path |
| --- | --- |
| **Gold-standard product specification** | [GOLD_STANDARD_PRODUCT_SPEC.md](./GOLD_STANDARD_PRODUCT_SPEC.md) |
| **Clickable end-to-end UX mockup** | [mockups/gold-standard.html](./mockups/gold-standard.html) |
| Architecture (technical) | [../TEACHING_KIT_PHASE1_ARCHITECTURE.md](../TEACHING_KIT_PHASE1_ARCHITECTURE.md) |
| Earlier architecture wireframes | [mockups/interactive.html](./mockups/interactive.html) |

### Example kit in the gold-standard mockup

**Bugs & Butterflies** · Toddler · Pro · 1 week  

Journey screens: Desktop binder · Mobile · Activity detail · Build My Kit · Print preview · Flow map

### Screenshots (gold standard)

| Screen | File |
| --- | --- |
| Desktop overview | [mockups/screenshots/gold-desktop-overview.png](./mockups/screenshots/gold-desktop-overview.png) |
| Desktop weekly plan | [mockups/screenshots/gold-desktop-weekly.png](./mockups/screenshots/gold-desktop-weekly.png) |
| Mobile | [mockups/screenshots/gold-mobile.png](./mockups/screenshots/gold-mobile.png) |
| Activity detail | [mockups/screenshots/gold-activity-detail.png](./mockups/screenshots/gold-activity-detail.png) |
| Build My Kit | [mockups/screenshots/gold-build-my-kit.png](./mockups/screenshots/gold-build-my-kit.png) |
| Print preview | [mockups/screenshots/gold-print-preview.png](./mockups/screenshots/gold-print-preview.png) |

## Design principles (locked for review)

- Digital teacher binder, not a thin lesson card  
- **Build My Kit**: print only what you need as one PDF  
- Empty sections hidden for providers  
- Preserve Assign / Favorite / calendar  
- Entitlements never bypassed (Trial watermark path before PDF)  
- No implementation / data-model build until UX approved  

## Out of scope until authorized

Slice 1B+, merge of PR #436, deploy, flag enablement, admin editor redesign, Family Hub.
