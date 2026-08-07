# Phase 2 Complete — Owner Admin Tester Control

**Branch:** `cursor/owner-admin-testers-phase2-9c23`  
**Spine:** HDH / `main` (July branch not merged)  
**Fence:** `HOME_DAYCARE_HUB_TESTING` + admin token  
**Date:** 2026-08-07  

---

## How to use it (end-to-end)

1. Open the **testing** host with Admin unlock.  
2. Confirm the orange **TESTING ENVIRONMENT** banner.  
3. Sidebar → **Testers** (or Admin Home → Open Testers).  
4. **Add tester** → choose Home Daycare or Center, role, features → optionally **Generate test login now**.  
5. Copy invite link / temp password.  
6. Open tester detail → edit features, resend invite, disable/reactivate, reset access, **View as tester**.  
7. Use **Feature Flags**, **Programs**, **Audit Log**, and **View As** tabs as needed.  
8. Always use **Exit tester view** to leave impersonation/preview.

Automated check: `npm run test:owner-testing-admin-phase2` (20/20).

---

## Completed checklist

### Owner Admin → Testers
- [x] Dedicated **Testers** admin group (not buried only under Advanced)
- [x] Testing dashboard with ENVIRONMENT: TESTING + counts
- [x] Add Tester wizard (name, email, program, type, role, features, notes, cohort)
- [x] Create **Home Daycare** or **Center** programs
- [x] Add to existing test program **or** create new
- [x] Role assignment (owner / director / teacher / assistant)
- [x] Activate now + temp password (testing-only)
- [x] Search testers
- [x] Tester detail page
- [x] Enable/disable feature access per tester
- [x] Disable / reactivate
- [x] Archive (soft — no hard delete by default)
- [x] Resend / recreate invite link (including activated testers)
- [x] Reset access (temp password)
- [x] Reset demo care data (scoped; profiles kept; confirmation)
- [x] Status chips (pending / activated / active / disabled / etc.)

### Programs / Flags / Audit / View As
- [x] Test programs list (type, owner, staff, children, status)
- [x] Global testing feature flags (explicitly production-unaffected)
- [x] Per-tester feature overrides
- [x] Audit log (create, update, disable, view-as, flags, resets)
- [x] Stronger View As banner: `OWNER ADMIN — VIEWING AS …` + Exit
- [x] Role preview buttons + View as specific tester (impersonation + audit)

### Testing safety / separation
- [x] Sticky TESTING ENVIRONMENT banner on testing host
- [x] APIs 404 when `HOME_DAYCARE_HUB_TESTING` is off
- [x] Admin token required for all `/api/admin/testing/*`
- [x] No July foundation org merge
- [x] No curriculum publish / production customer changes in this work

### Connection fixes started (not only documented)
- [x] Lesson week assign now links **childIds** (classroom roster by default)
- [x] Teacher Today shows linked child count + **Log to daily logs**
- [x] `POST /api/schedule/log-planned-activity` writes ActivityLogs for linked children (group-aware, exclusions supported)
- [x] Server-side staff write ACL: assistants/teachers scoped by role + classroom; owners/directors unrestricted
- [x] Owner Admin ↔ Tester management is now a first-class console

---

## Still missing / deferred (before or during Phase 3)

| Item | Notes |
|---|---|
| Email send for invites | Still copy-link primary when Resend is off (safe) |
| Hard delete tester | Intentionally omitted; archive only |
| Full program detail tabs (children/families/forms drill-down) | List + users summary exists; deeper tabs can wait |
| Family Hub one-click parent preview of a specific household | View As Parent + invites exist; household picker polish later |
| Error center linked to tester sessions | Platform Error Center exists; not yet tester-threaded |
| Feedback inbox with auto page/role/flag context | General feedback exists; dedicated testing feedback still Phase 2+ |
| Rich center setup (multiple named staff in one wizard step) | Director create works; bulk staff pack can come next |
| Lesson→child UI picker on Calendar assign screen | API defaults childIds; richer picker UI still open |
| Production Blueprint dual-service declaration | Still Dashboard-managed testing host |

---

## Recommendations before Phase 3 (Navigation Cleanup)

1. **Use Testers for a real week** — add one home daycare owner + one center director + one teacher; confirm invite/login/View As feel obvious.  
2. **Keep Advanced → Testing Center** as a secondary sandbox for plan Free/Pro preview; primary path is now **Testers**.  
3. **Phase 3 should simplify customer nav**, not re-open Owner Admin IA unless Testers usage reveals pain.  
4. **Do not merge July Testing Lab** — continue porting only UX ideas onto HDH/`main`.  
5. Next connection priorities after nav: Family Hub household completeness, forms status model, then billing simulator (still test-only).

---

## Key files

- `server/owner-testing-admin.js` — APIs  
- `scripts/owner-testing-admin-ui.js` — Admin UI  
- `styles/owner-testing-admin.css` — TESTING chrome  
- `server/program-ownership.js` — write ACL  
- `server/index.js` — routes + lesson/activity connections  
- `scripts/test-owner-testing-admin-phase2.js` — regression  
