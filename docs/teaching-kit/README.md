# Teaching Kit — UI Mockups (Phase 1 Architecture)

**Status:** Architecture approved · Slice 1A implemented (flags + schema passthrough only)  
**Open the clickable prototype:** [mockups/interactive.html](./mockups/interactive.html)  
**Architecture:** [../TEACHING_KIT_PHASE1_ARCHITECTURE.md](../TEACHING_KIT_PHASE1_ARCHITECTURE.md)  
**Canonical config module:** [`../../scripts/teaching-kit.js`](../../scripts/teaching-kit.js)  
**Slice 1A tests:** `npm run test:teaching-kit-slice-1a`

Viewer, Print Center, attachments, and flag enablement are **not** shipped in Slice 1A.

## Screens in the prototype

1. **Desktop lesson kit viewer** — binder tabs, header actions, empty sections hidden  
2. **Mobile lesson kit viewer** — compact header + More menu  
3. **Build My Kit (Print Center)** — section checkboxes, presets, generate one PDF  
4. **Future attachments strip** — flashcards / posters / labels readiness (visual only)

## Screenshots

| Screen | File |
| --- | --- |
| Desktop kit viewer | [mockups/screenshots/desktop-kit-viewer.png](./mockups/screenshots/desktop-kit-viewer.png) |
| Mobile kit viewer | [mockups/screenshots/mobile-kit-viewer.png](./mockups/screenshots/mobile-kit-viewer.png) |
| Build My Kit | [mockups/screenshots/build-my-kit.png](./mockups/screenshots/build-my-kit.png) |
| Build My Kit modal | [mockups/screenshots/build-my-kit-modal.png](./mockups/screenshots/build-my-kit-modal.png) |
| Future attachments | [mockups/screenshots/future-attachments.png](./mockups/screenshots/future-attachments.png) |

## Design notes

- Uses Little Learner Hub design tokens (`styles/llh-design-tokens.css`)
- Preserves existing product language (Free/Pro badge, Assign, Favorite)
- **Build My Kit** is the differentiator: providers select only what they need
- Legacy print is shown as secondary until Print Center replaces it

## Out of scope for these mockups

Admin editor redesign, quality dashboard, bulk migration, Stripe/billing, Family Hub.
