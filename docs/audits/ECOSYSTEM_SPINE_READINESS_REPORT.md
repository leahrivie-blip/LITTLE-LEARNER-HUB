# Ecosystem Spine Readiness Report

**Shell:** `20260804-ecosystem-spine`
**Decision:** Ecosystem spine PASSED
**Ecosystem Readiness Score:** 90 / 100
**Operational readiness:** 88 / 100
**Rule:** Testing only. Do not merge. Do not deploy production. Licensing deferred.

## Connection spine
- Lesson Plans ↔ Child Roster — assign stamps `classroomId` + `childIds`; Daily Logs shows week lesson
- Family Hub ↔ Child Profile — live name/photo/medical/classroom overlay
- Family Hub ↔ Messages — thread + bridge + Improve wording
- Family Hub ↔ Attendance / Observations / Goals / Support Plans / Forms — shared feed + Today
- Child ↔ Classroom ↔ Staff — classroomId roster + staff classroom filter (staff ops still limited)

## Automations shipped
- Form assigned → parent notified (existing)
- Form completed → provider inbox notification
- Parent request → provider approve/decline + parent update
- Observation/Goals/SupportPlans share → FH notify
- Incident → Communications + Documents on file + parent message
- Daily Logs → end-of-day report / parent message / weekly summary (grounded)
- Archive/delete child → unlink/revoke Family Hub

## Remaining disconnected / out-of-product workflows
- SMS/email delivery outside Family Hub (in-app only)
- Legal e-sign certificates (testing acknowledgment only)
- Tuition / payments (future phase)
- Full staff ops beyond classroom-filtered invites (future phase)
- State licensing portals (deferred — not started)

## Recommendation
Do **not** begin Licensing & Compliance until you explicitly approve.
Next strongest product step: tighten staff classroom ops and optional SMS/email delivery,
or continue polishing AI inside Daily Logs / Messages with more grounded weekly flows.
Do not merge. Do not deploy production.
