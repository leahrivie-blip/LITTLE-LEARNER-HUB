# Cover Redesign Full Regression Audit

**Started:** 2026-07-23T01:56:55.547Z
**Finished:** 2026-07-23T01:57:38.026Z
**Commit:** ebf3124

Auditing merged main after PR #272 cover redesign.

## Summary

- Passed: **54**
- Failed: **0**
- Warnings: **1**
- Tested: **55**

## Stats

```json
{
  "planCountApi": 89,
  "libraryOpenMs": 2148,
  "cardAudit": {
    "totalCards": 112,
    "uniqueTitles": 57,
    "jpgLoaded": 39,
    "freeBadges": 9,
    "proBadges": 48
  },
  "consoleErrors": [
    "Failed to load resource: the server responded with a status of 403 (Forbidden)"
  ],
  "failedRequests": [
    "403 http://127.0.0.1:19901/api/curriculum/activities/cur-act-bfe1691d6680764f"
  ]
}
```

## Passed

- Static wiring: overlays, admin upload, 53 JPG covers present
- Boot seeded lesson plans available (89)
- Library loads quickly (2148ms)
- Lesson cards rendered (112 instances, 57 unique titles)
- Cover images load correctly (53 checked; 4 offscreen lazy ok)
- FREE/PRO badges display on cards
- Age group displays on cards
- Lesson plan titles display on cover overlay
- Activity count displays on cards
- Favorite star present on cards
- Cover images use object-fit:cover with ~16:9 framing
- No horizontal page scrolling on desktop library
- Featured banner shows overlaid title + View Lesson Plan
- Favorite / Unfavorite toggles on lesson card
- View Lesson Plan opens viewer
- Viewer shows Use This Plan
- Viewer Download control present
- Viewer Back control present
- Use This Plan opens assign / calendar choice
- Back button returns from lesson viewer
- Activity Center opens (198 cards)
- View Activity opens activity viewer
- Calendar view opens
- Navigation: home
- Navigation: calendar
- Navigation: lessons
- Navigation: activities
- Navigation: daily-logs
- Navigation: children
- Navigation: ai
- Navigation: behavior
- Navigation: settings
- Sidebar navigation clicks work (10 links)
- Free user sees free content (57 free badges)
- Free user sees locked PRO / upgrade cues
- Free user can open free lesson content path
- Founding Member can use plans (Use This Plan visible)
- Founding Member library access works
- Admin login API works
- Admin UI surface reachable
- Admin cover upload endpoint responds (401)
- Cover images persist after refresh (/images/lesson-covers/colors-everywhere.jpg)
- Tablet: no horizontal scrolling
- Tablet: Use This Plan remains clickable
- Tablet: title overlays render
- Mobile: no horizontal scrolling
- Mobile: buttons remain clickable
- Mobile: covers scale/load correctly
- Mobile: age + title visible on cards
- Mobile: Activity Center navigates
- Mobile: Calendar navigates
- No failed lesson-cover image requests
- No critical console errors from cover redesign
- Pro user Add to Calendar / Use This Plan flow opens

## Warnings

- Viewer Print control not detected

## Failed

- None

## Screenshots

- `/opt/cursor/artifacts/cover-redesign-audit/screenshots/audit-desktop-library.png`
- `/opt/cursor/artifacts/cover-redesign-audit/screenshots/audit-desktop-lesson-viewer.png`
- `/opt/cursor/artifacts/cover-redesign-audit/screenshots/audit-desktop-activities.png`
- `/opt/cursor/artifacts/cover-redesign-audit/screenshots/audit-desktop-calendar.png`
- `/opt/cursor/artifacts/cover-redesign-audit/screenshots/audit-desktop-free-user.png`
- `/opt/cursor/artifacts/cover-redesign-audit/screenshots/audit-tablet-library.png`
- `/opt/cursor/artifacts/cover-redesign-audit/screenshots/audit-mobile-library.png`
- `/opt/cursor/artifacts/cover-redesign-audit/screenshots/audit-mobile-calendar.png`
