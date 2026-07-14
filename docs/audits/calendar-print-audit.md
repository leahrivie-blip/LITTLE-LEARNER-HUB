# Calendar & Print / Download Audit

Generated: 2026-07-14T16:44:36.519Z

## Counts

- PASS: **14**
- RETRY: **2**
- NEEDS_IMPROVEMENT: **1**

## Findings

- [PASS] **login**: Logged in as leahivie@icloud.com (attempt 1)
- [PASS] **download-weekly-click**: {"ok":true,"via":"label"}
- [PASS] **download-weekly-pdf**: all-about-me-weekly-calendar.pdf size=9541 pdf=true
- [PASS] **pdf-weekly-day-boxes**: {"days":["Monday","Tuesday","Wednesday","Thursday","Friday"],"branding":true,"landscape":true,"size":9541}
- [PASS] **print-ui-week-tabs**: {"hasBoard":false,"dayHits":[],"branding":false,"snippet":"← Back to Lesson Plans All About Me Preschool · Free Add to My Week Add to Calendar Print Weekly Calendar Download Weekly Calendar More Week Plan Activities Materials Mon Tue Wed Thu Fri Mirror Me Open-Ended Exploration M
- [PASS] **print-mobile-viewport**: Captured mobile viewport while lesson viewer open
- [PASS] **calendar-add-note**: {"today":"2026-07-14","afterSave":"Audit note 1784047384615","hasFn":true}
- [PASS] **calendar-add-lesson**: {"ok":false,"reason":"This week already has a lesson plan assigned."}
- [PASS] **calendar-edit-note**: {"ok":true,"notes":"Audit note 1784047384615 edited"}
- [PASS] **calendar-persist-refresh**: {"notePersisted":true,"lessonVisible":true,"snippet":"← Back to Dashboard PLANNING HOME Calendar PLANNING HOME July 2026 Tap any day to open it. Add notes and events on any day — lesson plans still run Monday–Friday. ‹ Prev MONTH January February March April May June July August 
- [RETRY] **health**: attempt 1 health={"ok":false,"status":503}
- [RETRY] **health**: attempt 2 health={"ok":false,"status":503}
- [PASS] **login**: Logged in as leahivie@icloud.com (attempt 3)
- [PASS] **calendar-persist-relogin**: {"notePersisted":false,"lessonVisible":true,"hasCalendar":true,"snippet":"← Back to Dashboard PLANNING HOME Calendar PLANNING HOME July 2026 Tap any day to open it. Add notes and events on any day — lesson plans still run Monday–Friday. ‹ Prev MONTH January February March April M
- [PASS] **calendar-delete-note**: {"ok":true,"via":"clear"}
- [PASS] **pro-lesson-activities**: {"attempt":1,"open":true,"hasActivities":true,"loading":false,"syncing":false,"overviewOnly":false,"snippet":"← Back to Lesson Plans Amazing Insects Preschool 3-5 Years · Pro Add to My Week Add to Calendar Print Weekly Calendar Download Weekly Calendar More Week Plan Activities M
- [NEEDS_IMPROVEMENT] **space-adventure-live** (high): {"foundId":"cur-lp-preschool-space-adventure","days":["Mon","Tue","Wed","Thu","Fri"],"wedFriLive":false,"snippet":"← Back to Lesson Plans Space Adventure Preschool 3-5 Years · Pro Add to My Week Add to Calendar Print Weekly Calendar Download Weekly Calendar More Week Plan Activit
