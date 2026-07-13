# Little Learner Hub Design System

**Status:** Approved direction — design system first, then unified scheduling foundation  
**Date:** July 13, 2026  
**Visual reference:** Main Calendar mockup layout (spacing, hierarchy, simplicity)  
**Brand feel:** Professional childcare + modern SaaS + warm early childhood education  

**Not this:** Corporate HR blue · hospital UI · generic business dashboard · random tool pile  

---

## 1. Product vision

Little Learner Hub should feel like one connected childcare platform.

When someone logs in they should immediately know:

- What week they are on  
- What lesson plan is assigned  
- What is coming next  
- What needs attention  

No hunting through disconnected tools.

### Build order (locked)

1. **Design system** (this document + tokens)  
2. **Cloud ScheduleItem foundation**  
3. **Migrate** Calendar → Weekly Planner → Dashboard → Lesson Library onto that foundation  
4. **Retire** Curriculum Planner after the unified system works  

Do not rush feature implementation ahead of the system.

---

## 2. Brand personality

| Do | Don’t |
|----|-------|
| Soft educational warmth | Rainbow explosion |
| Clean modern SaaS layouts | Heavy gradients everywhere |
| Soft, muted brand colors | Bright primary billboard colors |
| Shared chrome across pages | Every card a different color |
| Fewer, clearer actions | Button-heavy crowded screens |
| Generous whitespace | Busy stacked sections |

---

## 3. Color system

### Core palette

| Token | Role | Hex | Usage |
|-------|------|-----|-------|
| `--llh-primary` | Soft lavender / purple | `#7B6BB5` | Primary buttons, active nav, key links |
| `--llh-primary-soft` | Lavender wash | `#EDE8F7` | Selected states, soft fills |
| `--llh-primary-deep` | Deep lavender | `#5A4D8A` | Hover / pressed primary |
| `--llh-secondary` | Soft sky blue | `#7BA8C9` | Secondary actions, info chips, calendar accents |
| `--llh-secondary-soft` | Sky wash | `#E5F1F8` | Secondary soft fills |
| `--llh-success` | Mint green | `#5DB89A` | Success, completed checks, positive status |
| `--llh-success-soft` | Mint wash | `#E3F6EF` | Success backgrounds |
| `--llh-accent` | Soft peach / coral | `#E8A07A` | Sparse accent — CTAs that need warmth, not primary chrome |
| `--llh-accent-soft` | Peach wash | `#FBECE3` | Accent soft fills |
| `--llh-highlight` | Warm yellow | `#E8C96A` | Sparse highlight — attention, “today”, stars |
| `--llh-highlight-soft` | Yellow wash | `#FBF5DE` | Highlight soft fills |
| `--llh-bg` | Page background | `#F7F6F9` | App canvas (very light cool gray / lavender mist) |
| `--llh-surface` | Surface / cards | `#FFFFFF` | Panels, cards, modals |
| `--llh-ink` | Primary text | `#2A2A35` | Headings & body |
| `--llh-muted` | Secondary text | `#6B6B7B` | Supporting copy |
| `--llh-line` | Borders | `#E4E1EA` | Dividers, field borders |

### Semantic aliases

```text
--llh-danger:        #C56B6B
--llh-danger-soft:   #F8E8E8
--llh-focus-ring:    rgba(123, 107, 181, 0.35)
```

### Color rules

1. **Primary chrome is lavender** — not sky blue. Sky blue is secondary support.  
2. Soft washes for backgrounds; saturated tokens only for text/icons/borders on white.  
3. At most **one** accent/highlight color in a given section.  
4. Status colors (mint / coral / yellow) are for meaning — not decoration.  
5. No full-page rainbow. No every-card-different-color.  
6. No heavy multi-stop gradients as the main visual idea. A faint wash on the app shell is enough.

### Logo color set (future mark)

Lavender · Sky Blue · Mint · Peach · Warm Yellow — used as **connected dots**, not as five competing UI themes.

---

## 4. Typography

Avoid generic stacks (Inter, Roboto, Arial, system UI as the brand face).

| Role | Family | Weight | Notes |
|------|--------|--------|-------|
| Display / page titles | **Fraunces** | 600–700 | Warm, soft serif — early childhood dignity without playfulness overload |
| UI / body | **Plus Jakarta Sans** | 400–600 | Modern SaaS clarity |
| Eyebrows / labels | **Plus Jakarta Sans** | 600 | Uppercase or small caps via letter-spacing, not a third family |

### Scale

| Token | Size | Line height | Use |
|-------|------|-------------|-----|
| `--llh-text-display` | 32–40px | 1.15 | Page H1 |
| `--llh-text-title` | 22–28px | 1.25 | Section H2 |
| `--llh-text-subtitle` | 18px | 1.35 | Card titles |
| `--llh-text-body` | 15–16px | 1.5 | Body |
| `--llh-text-small` | 13px | 1.4 | Meta, helper |
| `--llh-text-eyebrow` | 11–12px | 1.3 | Labels, uppercase |

### Type rules

- One H1 per page.  
- Prefer shorter headlines; put detail in muted supporting lines.  
- Do not compete with brand using oversized marketing headlines inside the logged-in app.

---

## 5. Layout & spacing

Inspired by the Main Calendar mockups: large headers, room to breathe, clear hierarchy.

| Token | Value |
|-------|-------|
| `--llh-space-1` | 4px |
| `--llh-space-2` | 8px |
| `--llh-space-3` | 12px |
| `--llh-space-4` | 16px |
| `--llh-space-5` | 24px |
| `--llh-space-6` | 32px |
| `--llh-space-7` | 48px |
| `--llh-radius-sm` | 8px |
| `--llh-radius-md` | 12px |
| `--llh-radius-lg` | 16px |
| `--llh-shadow-soft` | `0 8px 24px rgba(42, 42, 53, 0.06)` |

### Layout principles

- **Large page headers** with one eyebrow + one title + one short supporting line.  
- **More whitespace** between sections (`space-5` / `space-6`), not denser stacks.  
- **Card-based layouts** for interactive/content containers (owner direction for app chrome).  
- **Fewer buttons** — one primary action per region.  
- **Mobile:** increase vertical rhythm; avoid horizontal button piles; stack actions.  
- Target content width ~960–1100px for planning views; full-bleed only when needed.

---

## 6. Components (Phase 1 kit)

### Buttons

| Variant | Style |
|---------|-------|
| Primary | Lavender fill `#7B6BB5`, white text |
| Secondary | White fill, lavender border/text |
| Soft | Lavender wash fill, deep lavender text |
| Ghost | No fill, muted text |
| Danger | Soft danger wash or outline — sparse |

Rules: max **one primary** button in a card/header cluster. Prefer 2–3 total actions visible.

### Form fields

- White surface, `--llh-line` border, `--llh-radius-sm`  
- Focus: lavender ring (`--llh-focus-ring`)  
- Labels above fields (not placeholder-only)  
- Consistent height (~44px) for inputs/selects  

### Cards / panels

- White surface, light border OR soft shadow (pick one per context — don’t stack both heavily)  
- Radius `--llh-radius-md`  
- Padding `--llh-space-5`  
- Cards group **one job** (week detail, this-week overview, day block)

### Chips / tags

- Soft washes only (primary-soft, secondary-soft, success-soft, accent-soft, highlight-soft)  
- Small type; never five bright chips in a row  

### Icons

- One consistent set (outline, 1.5–2px stroke)  
- Lavender or muted ink; mint/peach only for status  
- No emoji as UI icons in product chrome  

### Navigation

- Quiet sidebar; active item = lavender soft fill + primary text  
- Same labels everywhere: Dashboard · Calendar · Weekly Planner · Lesson Library  

---

## 7. Screen patterns (scheduling surfaces)

These patterns inherit the design system; they do not invent new palettes.

### Main Calendar — Planning

- Month grid, week bars for lesson themes  
- Soft chips for events / closures / reminders  
- Week detail panel with few actions: Open Weekly Planner · Change Lesson Plan · Add  

### Weekly Planner — Execution

- Theme header + date range  
- Day checklists, notes, materials, goals, reminders  
- Print Weekly Schedule  
- Change plan via Calendar/Library — not a second assign system  

### Dashboard — Overview only

- THIS WEEK + UPCOMING  
- Stores nothing; reads ScheduleItem  
- Few buttons; no mini-planner  

### Lesson Library — Catalog

- Use This Plan → Plan This Week → Choose Week → Save → Open Weekly Planner  
- One write  

---

## 8. Logo direction (future)

**Concept:** Connected Learning Hub  

Connected dots forming a subtle flower / star — children, teachers, families, learning linked together.

**Colors in the mark (not the whole UI):** lavender, sky blue, mint, peach, warm yellow.

Do not ship a final logo in Phase 1 scheduling work unless separately approved. Treat this as brand direction for future mark + favicon work.

Files:

- `docs/design-system/logo-direction.png`  
- Showcase page includes a placeholder mark using the palette  

---

## 9. Accessibility

- Body text contrast ≥ 4.5:1 on white / soft washes  
- Do not use color alone for status (pair with label/icon)  
- Focus rings visible on keyboard  
- Tap targets ≥ 44px on mobile  

---

## 10. Adoption plan

| Stage | Work |
|-------|------|
| **DS-0** | Tokens file + docs + showcase (this PR) |
| **DS-1** | New scheduling surfaces (Calendar, rebuilt Dashboard widgets, assign flow) **must** use tokens |
| **DS-2** | Weekly Planner restyle onto tokens |
| **DS-3** | Lesson Library chrome onto tokens |
| **DS-4** | Broader app shell / remaining views — gradual, not a big-bang rewrite |

**Rule:** Do not introduce new hex values in feature work. Extend tokens instead.

Token file: [`styles/llh-design-tokens.css`](../../styles/llh-design-tokens.css)  
Showcase: [`docs/design-system/showcase.html`](./showcase.html)

---

## 11. Explicit non-goals (now)

- Full site restyle in one pass  
- Multi-center / director permission UI  
- Parent calendar delivery  
- Final production logo lock  
- Deleting Curriculum Planner  

---

## 12. Checklist before scheduling UI build

- [x] Palette locked (lavender primary, sky secondary, mint / peach / yellow sparse)  
- [x] Typography direction locked (Fraunces + Plus Jakarta Sans)  
- [x] Layout principles locked (calendar mockup spacing / hierarchy)  
- [x] Component starter kit documented  
- [ ] Owner visual OK on showcase + logo direction  
- [ ] Then: ScheduleItem foundation implementation  

*Design system first. Foundation second. Migration third.*
