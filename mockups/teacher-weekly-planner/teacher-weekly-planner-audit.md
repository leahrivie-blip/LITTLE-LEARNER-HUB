# Teacher Weekly Planner Audit

Generated: 2026-07-17T15:58:54.842Z

## Summary

- Scanned files: **67**
- Ready before repair: **62**
- Ready after autofill/repair: **62**
- Source plans needing densify/repair: **0**
- Still broken after repair: **0**
- Ocean sample complete: **true**

## By age group

- **Infant**: 8 plans · 2 source gaps · 8/8 ready after repair
- **Toddler**: 12 plans · 2 source gaps · 12/12 ready after repair
- **Preschool**: 42 plans · 5 source gaps · 42/42 ready after repair

## Root cause

Sparse `activitySlots` (category preference left null holes), missing daily circle/outdoor fields, and single-activity weekdays caused empty planner boxes. Runtime repair densifies every Mon–Fri cell before PDF generation; export shaping no longer leaves slot holes.

## Plans with source gaps (before autofill)

- None
