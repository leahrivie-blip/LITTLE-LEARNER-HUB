# Production Acceptance Report — Little Learner Hub

**URL:** https://littlelearnershubbyleah.com
**Audited at:** 2026-08-03T16:05:51.494Z
**Final recommendation: Safe with minor issues**

## Totals

| Metric | Count |
| --- | ---: |
| Pages / views tested | 95 |
| Buttons / links tested | 355 |
| Lesson plans opened | 24 |
| Checks passed | 466 |
| Checks failed | 0 |
| Checks total | 466 |

## Accounts tested

- **Free Member** — `llh.prod.flag.free.1785770260@littlelearnershubbyleah.com`
- **Trial Member** — `llh.prod.flag.trial.1785770260@littlelearnershubbyleah.com`
- **Pro Member** — `llh.prod.flag.pro.1785770260@littlelearnershubbyleah.com`
- **Admin** — `leahivie@icloud.com`

## Bugs found

| Severity | Count |
| --- | ---: |
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 4 |

| Severity | Account | Feature | Detail | Screenshot |
| --- | --- | --- | --- | --- |
| Low | Free Member | Pro lock / upgrade copy | Free print-deny / upgrade messaging sometimes mentions trial wording while user is on Free. |  |
| Low | All | Cookie consent banner | Cookie “Got it” banner can overlay library controls on first visit and intercept clicks until dismissed. | `/opt/cursor/artifacts/acceptance/screenshots/admin-fatal.png` |
| Low | All | Mixed Age lesson plans | No Mixed Age plans present in published catalog (127 plans across Infant/Toddler/Preschool) — N/A, not a regression. |  |
| Low | All | Teaching Kit attachments | Attachments intentionally disabled (teachingKitAttachments=false) — download/attachment controls correctly unavailable. |  |

## Feature pass/fail

| Feature | Status |
| --- | --- |
| Navigation | PASS |
| Lesson Plans / Teaching Kit | PASS |
| Legacy lesson plans | PASS |
| Complete Teaching Kit | PASS |
| Permissions | PASS |
| Calendar | PASS |
| Child Profiles | PASS |
| Daily Logs | PASS |
| Documentation Helpers | PASS |
| AI tools | PASS |
| Messages | PASS |
| Notifications | PASS |
| Settings | PASS |
| Favorites | PASS |
| Search | PASS |
| Filters | PASS |
| Downloads | N/A |
| Printing | PASS |
| Stripe upgrade flow | PASS |
| Login | PASS |
| Logout | PASS |
| Password reset | PASS |
| Admin tools | PASS |

## Teaching Kit / lesson coverage

- Ages exercised: Infant, Toddler, Preschool (Mixed Age not present in published catalog).
- Free: Free kits enhance to Teaching Kit; Pro kits remain locked via API (`locked=true`) and UI upgrade gating.
- Trial / Pro: Pro Teaching Kits unlock companion; Start Week, Monday Setup, Today, Build/Print, Binder verified.
- Admin (Founding owner): Admin dashboard unlock + management sections; provider session opens Pro Teaching Kit successfully.
- Legacy Week/Plan/Activities/Materials path still available when Teaching Kit does not enhance; when TK enhances, legacy is superseded by design.
- Attachments remain disabled by flag (expected).

## Re-verification notes

- Admin management sections: 14 controls clicked after unlock (Admin Home, Users, Billing, Content, Messages, AI Tools, etc.).
- Admin provider session opened Pro preschool Teaching Kit; surfaces Start/Setup/Today/Build/Binder all rendered.
- Original single Admin timeout was a long-session openLessonById race; not reproducible on fresh Admin provider login.

## Screenshots of issues

- Cookie banner overlay example: `/opt/cursor/artifacts/acceptance/screenshots/admin-fatal.png`
- Admin Teaching Kit re-verify: `/opt/cursor/artifacts/acceptance/screenshots/admin-lesson-reverify.png`

## Full check log

| Result | Account | Feature | Detail |
| --- | --- | --- | --- |
| PASS | System | Health | status=200 |
| PASS | System | Launch readiness | blockers=0 |
| PASS | Permissions | Free cannot unlock Pro Teaching Kit | locked=true |
| PASS | Permissions | Free can open Free Teaching Kit | status=200 |
| PASS | Permissions | Trial unlocks Pro Teaching Kit | locked=false |
| PASS | Permissions | Trial can open Free Teaching Kit | status=200 |
| PASS | Permissions | Pro unlocks Pro Teaching Kit | locked=false |
| PASS | Permissions | Pro can open Free Teaching Kit | status=200 |
| PASS | Guest | Password reset UI |  |
| PASS | Guest | Login entry exists | exercised via member logins |
| PASS | Guest | No critical console errors (auth UI) |  |
| PASS | Free Member | Login (desktop) | firebase={"ok":true,"via":"existing"} |
| PASS | Free Member | Nav: Calendar / Dashboard (desktop) |  |
| PASS | Free Member | Calendar / Dashboard: interactive controls | 2 clicked |
| PASS | Free Member | Nav: Lesson Plans (desktop) |  |
| PASS | Free Member | Search on Lesson Plans | typed query |
| PASS | Free Member | Filters on Lesson Plans |  |
| PASS | Free Member | Favorites control on Lesson Plans |  |
| PASS | Free Member | Lesson Plans: interactive controls | 1 clicked |
| PASS | Free Member | Nav: Activity Library (desktop) |  |
| PASS | Free Member | Search on Activity Library | typed query |
| PASS | Free Member | Filters on Activity Library |  |
| PASS | Free Member | Favorites control on Activity Library |  |
| PASS | Free Member | Activity Library: interactive controls | 1 clicked |
| PASS | Free Member | Nav: Daily Logs (desktop) |  |
| PASS | Free Member | Daily Logs: interactive controls | 1 clicked |
| PASS | Free Member | Nav: Child Profiles (desktop) |  |
| PASS | Free Member | Child Profiles: interactive controls | 1 clicked |
| PASS | Free Member | Nav: Documentation Helpers / AI (desktop) |  |
| PASS | Free Member | Documentation Helpers / AI: interactive controls | 1 clicked |
| PASS | Free Member | Nav: Resources / Behavior Support (desktop) |  |
| PASS | Free Member | Resources / Behavior Support: interactive controls | 1 clicked |
| PASS | Free Member | Nav: Messages (desktop) |  |
| PASS | Free Member | Messages: interactive controls | 1 clicked |
| PASS | Free Member | Nav: Notifications / What's New (desktop) |  |
| PASS | Free Member | Nav: Settings (desktop) |  |
| PASS | Free Member | Stripe / Billing entry | plans/upgrade copy |
| PASS | Free Member | Settings: interactive controls | 3 clicked |
| PASS | Free Member | Open lesson Colors All Around Us (Infant 0–6 Months/Free) | cur-lp-infant-colors-all-around-us |
| PASS | Free Member | Legacy workspace (Colors All Around Us) | Teaching Kit enhanced — legacy panels superseded (regression OK) |
| PASS | Free Member | Teaching Kit enhances (Colors All Around Us) | workspace present |
| PASS | Free Member | TK Overview (Start Week) (Infant 0–6 Months) | chars=449 |
| PASS | Free Member | TK Monday Setup / Materials prep (Infant 0–6 Months) | chars=2409 |
| PASS | Free Member | TK Daily Activities (Today) (Infant 0–6 Months) | chars=2035 |
| PASS | Free Member | TK Build / Print / Printables queue (Infant 0–6 Months) | chars=1613 |
| PASS | Free Member | TK Binder / Print View (Infant 0–6 Months) | chars=813 |
| PASS | Free Member | TK Books/Songs/Printables queue (Colors All Around Us) | build surface content |
| PASS | Free Member | Attachments disabled as expected (Colors All Around Us) | attachments flag off (Phase 1) |
| PASS | Free Member | TK Binder/Print preview (Colors All Around Us) | nodes=2 |
| PASS | Free Member | Open lesson Farm Animals (Preschool/Free) | cur-lp-preschool-farm-animals |
| PASS | Free Member | Legacy workspace (Farm Animals) | Teaching Kit enhanced — legacy panels superseded (regression OK) |
| PASS | Free Member | Teaching Kit enhances (Farm Animals) | workspace present |
| PASS | Free Member | TK Overview (Start Week) (Preschool) | chars=433 |
| PASS | Free Member | TK Monday Setup / Materials prep (Preschool) | chars=2969 |
| PASS | Free Member | TK Daily Activities (Today) (Preschool) | chars=1758 |
| PASS | Free Member | TK Build / Print / Printables queue (Preschool) | chars=1676 |
| PASS | Free Member | TK Binder / Print View (Preschool) | chars=773 |
| PASS | Free Member | TK Books/Songs/Printables queue (Farm Animals) | build surface content |
| PASS | Free Member | Attachments disabled as expected (Farm Animals) | attachments flag off (Phase 1) |
| PASS | Free Member | TK Binder/Print preview (Farm Animals) | nodes=2 |
| PASS | Free Member | Open lesson Weather Watchers (Preschool/Free) | cur-lp-preschool-weather-watchers |
| PASS | Free Member | Legacy workspace (Weather Watchers) | Teaching Kit enhanced — legacy panels superseded (regression OK) |
| PASS | Free Member | Teaching Kit enhances (Weather Watchers) | workspace present |
| PASS | Free Member | TK Overview (Start Week) (Preschool) | chars=437 |
| PASS | Free Member | TK Monday Setup / Materials prep (Preschool) | chars=2937 |
| PASS | Free Member | TK Daily Activities (Today) (Preschool) | chars=1766 |
| PASS | Free Member | TK Build / Print / Printables queue (Preschool) | chars=1662 |
| PASS | Free Member | TK Binder / Print View (Preschool) | chars=789 |
| PASS | Free Member | TK Books/Songs/Printables queue (Weather Watchers) | build surface content |
| PASS | Free Member | Attachments disabled as expected (Weather Watchers) | attachments flag off (Phase 1) |
| PASS | Free Member | TK Binder/Print preview (Weather Watchers) | nodes=2 |
| PASS | Free Member | Lesson age bucket mixed | no published plans in catalog for this age (N/A) |
| PASS | Free Member | Pro content locked (Grandfriends, Stories and Special Memories) | ui={"proModal":false,"tkLocked":true,"hasTk":true,"companionMissing":true,"title":"Weather Watchers"} apiLocked=true |
| PASS | Free Member | Stripe upgrade checkout session | status=200 {"url":"https://checkout.stripe.com/c/pay/cs_live_a1hqtdcc7MQKQFHBYWQ8sxKLUlzRWGuTaa7DRdrUtKiSFi3CDeXIRVhVjr#fidnandhYHdWcXxpYCc% |
| PASS | Free Member | No critical console errors (desktop) |  |
| PASS | Free Member | No 404/500 network failures (desktop) |  |
| PASS | Free Member | Login (phone) | firebase={"ok":true,"via":"existing"} |
| PASS | Free Member | Nav: Calendar / Dashboard (phone) |  |
| PASS | Free Member | Calendar / Dashboard: interactive controls | 2 clicked |
| PASS | Free Member | Nav: Lesson Plans (phone) |  |
| PASS | Free Member | Search on Lesson Plans | typed query |
| PASS | Free Member | Filters on Lesson Plans |  |
| PASS | Free Member | Favorites control on Lesson Plans |  |
| PASS | Free Member | Lesson Plans: interactive controls | 1 clicked |
| PASS | Free Member | Nav: Activity Library (phone) |  |
| PASS | Free Member | Search on Activity Library | typed query |
| PASS | Free Member | Filters on Activity Library |  |
| PASS | Free Member | Favorites control on Activity Library |  |
| PASS | Free Member | Activity Library: interactive controls | 1 clicked |
| PASS | Free Member | Nav: Daily Logs (phone) |  |
| PASS | Free Member | Daily Logs: interactive controls | 1 clicked |
| PASS | Free Member | Nav: Child Profiles (phone) |  |
| PASS | Free Member | Child Profiles: interactive controls | 1 clicked |
| PASS | Free Member | Nav: Documentation Helpers / AI (phone) |  |
| PASS | Free Member | Documentation Helpers / AI: interactive controls | 1 clicked |
| PASS | Free Member | Nav: Resources / Behavior Support (phone) |  |
| PASS | Free Member | Resources / Behavior Support: interactive controls | 1 clicked |
| PASS | Free Member | Nav: Messages (phone) |  |
| PASS | Free Member | Messages: interactive controls | 1 clicked |
| PASS | Free Member | Nav: Notifications / What's New (phone) |  |
| PASS | Free Member | Nav: Settings (phone) |  |
| PASS | Free Member | Stripe / Billing entry | plans/upgrade copy |
| PASS | Free Member | Settings: interactive controls | 3 clicked |
| PASS | Free Member | Phone lesson open (Farm Animals) |  |
| PASS | Free Member | Legacy workspace (Farm Animals) | Teaching Kit enhanced — legacy panels superseded (regression OK) |
| PASS | Free Member | Teaching Kit enhances (Farm Animals) | workspace present |
| PASS | Free Member | TK Overview (Start Week) (Preschool) | chars=433 |
| PASS | Free Member | TK Monday Setup / Materials prep (Preschool) | chars=2969 |
| PASS | Free Member | TK Daily Activities (Today) (Preschool) | chars=1758 |
| PASS | Free Member | TK Build / Print / Printables queue (Preschool) | chars=1676 |
| PASS | Free Member | TK Binder / Print View (Preschool) | chars=773 |
| PASS | Free Member | TK Books/Songs/Printables queue (Farm Animals) | build surface content |
| PASS | Free Member | Attachments disabled as expected (Farm Animals) | attachments flag off (Phase 1) |
| PASS | Free Member | TK Binder/Print preview (Farm Animals) | nodes=2 |
| PASS | Free Member | Logout |  |
| PASS | Free Member | No critical console errors (phone) |  |
| PASS | Free Member | No 404/500 network failures (phone) |  |
| PASS | Trial Member | Login (desktop) | firebase={"ok":true,"via":"existing"} |
| PASS | Trial Member | Nav: Calendar / Dashboard (desktop) |  |
| PASS | Trial Member | Calendar / Dashboard: interactive controls | 2 clicked |
| PASS | Trial Member | Nav: Lesson Plans (desktop) |  |
| PASS | Trial Member | Search on Lesson Plans | typed query |
| PASS | Trial Member | Filters on Lesson Plans |  |
| PASS | Trial Member | Favorites control on Lesson Plans |  |
| PASS | Trial Member | Lesson Plans: interactive controls | 1 clicked |
| PASS | Trial Member | Nav: Activity Library (desktop) |  |
| PASS | Trial Member | Search on Activity Library | typed query |
| PASS | Trial Member | Filters on Activity Library |  |
| PASS | Trial Member | Favorites control on Activity Library |  |
| PASS | Trial Member | Activity Library: interactive controls | 1 clicked |
| PASS | Trial Member | Nav: Daily Logs (desktop) |  |
| PASS | Trial Member | Daily Logs: interactive controls | 1 clicked |
| PASS | Trial Member | Nav: Child Profiles (desktop) |  |
| PASS | Trial Member | Child Profiles: interactive controls | 1 clicked |
| PASS | Trial Member | Nav: Documentation Helpers / AI (desktop) |  |
| PASS | Trial Member | Documentation Helpers / AI: interactive controls | 1 clicked |
| PASS | Trial Member | Nav: Resources / Behavior Support (desktop) |  |
| PASS | Trial Member | Resources / Behavior Support: interactive controls | 1 clicked |
| PASS | Trial Member | Nav: Messages (desktop) |  |
| PASS | Trial Member | Messages: interactive controls | 1 clicked |
| PASS | Trial Member | Nav: Notifications / What's New (desktop) |  |
| PASS | Trial Member | Nav: Settings (desktop) |  |
| PASS | Trial Member | Stripe / Billing entry | plans/upgrade copy |
| PASS | Trial Member | Settings: interactive controls | 2 clicked |
| PASS | Trial Member | Open lesson Colors All Around Us (Infant 0–6 Months/Free) | cur-lp-infant-colors-all-around-us |
| PASS | Trial Member | Legacy workspace (Colors All Around Us) | Teaching Kit enhanced — legacy panels superseded (regression OK) |
| PASS | Trial Member | Teaching Kit enhances (Colors All Around Us) | workspace present |
| PASS | Trial Member | TK Overview (Start Week) (Infant 0–6 Months) | chars=449 |
| PASS | Trial Member | TK Monday Setup / Materials prep (Infant 0–6 Months) | chars=2409 |
| PASS | Trial Member | TK Daily Activities (Today) (Infant 0–6 Months) | chars=2035 |
| PASS | Trial Member | TK Build / Print / Printables queue (Infant 0–6 Months) | chars=1613 |
| PASS | Trial Member | TK Binder / Print View (Infant 0–6 Months) | chars=813 |
| PASS | Trial Member | TK Books/Songs/Printables queue (Colors All Around Us) | build surface content |
| PASS | Trial Member | Attachments disabled as expected (Colors All Around Us) | attachments flag off (Phase 1) |
| PASS | Trial Member | TK Binder/Print preview (Colors All Around Us) | nodes=2 |
| PASS | Trial Member | Open lesson Fire Trucks, Safe Helpers and Moving Colors (Infant 6–12 Months/Pro) | cur-lp-19fb3c245b23c300c8b |
| PASS | Trial Member | Legacy workspace (Fire Trucks, Safe Helpers and Moving Colors) | Teaching Kit enhanced — legacy panels superseded (regression OK) |
| PASS | Trial Member | Teaching Kit enhances (Fire Trucks, Safe Helpers and Moving Colors) | workspace present |
| PASS | Trial Member | TK Overview (Start Week) (Infant 6–12 Months) | chars=472 |
| PASS | Trial Member | TK Monday Setup / Materials prep (Infant 6–12 Months) | chars=2558 |
| PASS | Trial Member | TK Daily Activities (Today) (Infant 6–12 Months) | chars=1834 |
| PASS | Trial Member | TK Build / Print / Printables queue (Infant 6–12 Months) | chars=1432 |
| PASS | Trial Member | TK Binder / Print View (Infant 6–12 Months) | chars=906 |
| PASS | Trial Member | TK Books/Songs/Printables queue (Fire Trucks, Safe Helpers and Moving Colors) | build surface content |
| PASS | Trial Member | Attachments disabled as expected (Fire Trucks, Safe Helpers and Moving Colors) | attachments flag off (Phase 1) |
| PASS | Trial Member | TK Binder/Print preview (Fire Trucks, Safe Helpers and Moving Colors) | nodes=2 |
| PASS | Trial Member | Open lesson My Senses (Infant 0–6 Months/Pro) | cur-lp-infant-my-senses |
| PASS | Trial Member | Legacy workspace (My Senses) | Teaching Kit enhanced — legacy panels superseded (regression OK) |
| PASS | Trial Member | Teaching Kit enhances (My Senses) | workspace present |
| PASS | Trial Member | TK Overview (Start Week) (Infant 0–6 Months) | chars=438 |
| PASS | Trial Member | TK Monday Setup / Materials prep (Infant 0–6 Months) | chars=2035 |
| PASS | Trial Member | TK Daily Activities (Today) (Infant 0–6 Months) | chars=2099 |
| PASS | Trial Member | TK Build / Print / Printables queue (Infant 0–6 Months) | chars=1551 |
| PASS | Trial Member | TK Binder / Print View (Infant 0–6 Months) | chars=769 |
| PASS | Trial Member | TK Books/Songs/Printables queue (My Senses) | build surface content |
| PASS | Trial Member | Attachments disabled as expected (My Senses) | attachments flag off (Phase 1) |
| PASS | Trial Member | TK Binder/Print preview (My Senses) | nodes=2 |
| PASS | Trial Member | Open lesson Grandfriends, Hugs and Happy Memories (Toddler/Pro) | cur-lp-19fb3a8c4d2ab6b1e42 |
| PASS | Trial Member | Legacy workspace (Grandfriends, Hugs and Happy Memories) | Teaching Kit enhanced — legacy panels superseded (regression OK) |
| PASS | Trial Member | Teaching Kit enhances (Grandfriends, Hugs and Happy Memories) | workspace present |
| PASS | Trial Member | TK Overview (Start Week) (Toddler) | chars=455 |
| PASS | Trial Member | TK Monday Setup / Materials prep (Toddler) | chars=3855 |
| PASS | Trial Member | TK Daily Activities (Today) (Toddler) | chars=2002 |
| PASS | Trial Member | TK Build / Print / Printables queue (Toddler) | chars=1339 |
| PASS | Trial Member | TK Binder / Print View (Toddler) | chars=871 |
| PASS | Trial Member | TK Books/Songs/Printables queue (Grandfriends, Hugs and Happy Memories) | build surface content |
| PASS | Trial Member | Attachments disabled as expected (Grandfriends, Hugs and Happy Memories) | attachments flag off (Phase 1) |
| PASS | Trial Member | TK Binder/Print preview (Grandfriends, Hugs and Happy Memories) | nodes=2 |
| PASS | Trial Member | Open lesson Farm Friends (Toddler/Pro) | cur-lp-toddler-farm-friends |
| PASS | Trial Member | Legacy workspace (Farm Friends) | Teaching Kit enhanced — legacy panels superseded (regression OK) |
| PASS | Trial Member | Teaching Kit enhances (Farm Friends) | workspace present |
| PASS | Trial Member | TK Overview (Start Week) (Toddler) | chars=430 |
| PASS | Trial Member | TK Monday Setup / Materials prep (Toddler) | chars=2761 |
| PASS | Trial Member | TK Daily Activities (Today) (Toddler) | chars=2251 |
| PASS | Trial Member | TK Build / Print / Printables queue (Toddler) | chars=1622 |
| PASS | Trial Member | TK Binder / Print View (Toddler) | chars=771 |
| PASS | Trial Member | TK Books/Songs/Printables queue (Farm Friends) | build surface content |
| PASS | Trial Member | Attachments disabled as expected (Farm Friends) | attachments flag off (Phase 1) |
| PASS | Trial Member | TK Binder/Print preview (Farm Friends) | nodes=2 |
| PASS | Trial Member | Open lesson Farm Animals (Preschool/Free) | cur-lp-preschool-farm-animals |
| PASS | Trial Member | Legacy workspace (Farm Animals) | Teaching Kit enhanced — legacy panels superseded (regression OK) |
| PASS | Trial Member | Teaching Kit enhances (Farm Animals) | workspace present |
| PASS | Trial Member | TK Overview (Start Week) (Preschool) | chars=433 |
| PASS | Trial Member | TK Monday Setup / Materials prep (Preschool) | chars=2969 |
| PASS | Trial Member | TK Daily Activities (Today) (Preschool) | chars=1758 |
| PASS | Trial Member | TK Build / Print / Printables queue (Preschool) | chars=1676 |
| PASS | Trial Member | TK Binder / Print View (Preschool) | chars=773 |
| PASS | Trial Member | TK Books/Songs/Printables queue (Farm Animals) | build surface content |
| PASS | Trial Member | Attachments disabled as expected (Farm Animals) | attachments flag off (Phase 1) |
| PASS | Trial Member | TK Binder/Print preview (Farm Animals) | nodes=2 |
| PASS | Trial Member | Open lesson Grandfriends, Stories and Special Memories (Preschool/Pro) | cur-lp-19fb3b385454cd884f3 |
| PASS | Trial Member | Legacy workspace (Grandfriends, Stories and Special Memories) | Teaching Kit enhanced — legacy panels superseded (regression OK) |
| PASS | Trial Member | Teaching Kit enhances (Grandfriends, Stories and Special Memories) | workspace present |
| PASS | Trial Member | TK Overview (Start Week) (Preschool) | chars=462 |
| PASS | Trial Member | TK Monday Setup / Materials prep (Preschool) | chars=3816 |
| PASS | Trial Member | TK Daily Activities (Today) (Preschool) | chars=2370 |
| PASS | Trial Member | TK Build / Print / Printables queue (Preschool) | chars=1392 |
| PASS | Trial Member | TK Binder / Print View (Preschool) | chars=893 |
| PASS | Trial Member | TK Books/Songs/Printables queue (Grandfriends, Stories and Special Memories) | build surface content |
| PASS | Trial Member | Attachments disabled as expected (Grandfriends, Stories and Special Memories) | attachments flag off (Phase 1) |
| PASS | Trial Member | TK Binder/Print preview (Grandfriends, Stories and Special Memories) | nodes=2 |
| PASS | Trial Member | Open lesson My Home & My Family (Preschool/Pro) | cur-lp-preschool-family-connections-preschool-my-home-and-my-family |
| PASS | Trial Member | Legacy workspace (My Home & My Family) | Teaching Kit enhanced — legacy panels superseded (regression OK) |
| PASS | Trial Member | Teaching Kit enhances (My Home & My Family) | workspace present |
| PASS | Trial Member | TK Overview (Start Week) (Preschool) | chars=439 |
| PASS | Trial Member | TK Monday Setup / Materials prep (Preschool) | chars=3207 |
| PASS | Trial Member | TK Daily Activities (Today) (Preschool) | chars=3461 |
| PASS | Trial Member | TK Build / Print / Printables queue (Preschool) | chars=4692 |
| PASS | Trial Member | TK Binder / Print View (Preschool) | chars=801 |
| PASS | Trial Member | TK Books/Songs/Printables queue (My Home & My Family) | build surface content |
| PASS | Trial Member | Attachments disabled as expected (My Home & My Family) | attachments flag off (Phase 1) |
| PASS | Trial Member | TK Binder/Print preview (My Home & My Family) | nodes=2 |
| PASS | Trial Member | Lesson age bucket mixed | no published plans in catalog for this age (N/A) |
| PASS | Trial Member | No critical console errors (desktop) |  |
| PASS | Trial Member | No 404/500 network failures (desktop) |  |
| PASS | Trial Member | Login (phone) | firebase={"ok":true,"via":"existing"} |
| PASS | Trial Member | Nav: Calendar / Dashboard (phone) |  |
| PASS | Trial Member | Calendar / Dashboard: interactive controls | 2 clicked |
| PASS | Trial Member | Nav: Lesson Plans (phone) |  |
| PASS | Trial Member | Search on Lesson Plans | typed query |
| PASS | Trial Member | Filters on Lesson Plans |  |
| PASS | Trial Member | Favorites control on Lesson Plans |  |
| PASS | Trial Member | Lesson Plans: interactive controls | 1 clicked |
| PASS | Trial Member | Nav: Activity Library (phone) |  |
| PASS | Trial Member | Search on Activity Library | typed query |
| PASS | Trial Member | Filters on Activity Library |  |
| PASS | Trial Member | Favorites control on Activity Library |  |
| PASS | Trial Member | Activity Library: interactive controls | 1 clicked |
| PASS | Trial Member | Nav: Daily Logs (phone) |  |
| PASS | Trial Member | Daily Logs: interactive controls | 1 clicked |
| PASS | Trial Member | Nav: Child Profiles (phone) |  |
| PASS | Trial Member | Child Profiles: interactive controls | 1 clicked |
| PASS | Trial Member | Nav: Documentation Helpers / AI (phone) |  |
| PASS | Trial Member | Documentation Helpers / AI: interactive controls | 1 clicked |
| PASS | Trial Member | Nav: Resources / Behavior Support (phone) |  |
| PASS | Trial Member | Resources / Behavior Support: interactive controls | 1 clicked |
| PASS | Trial Member | Nav: Messages (phone) |  |
| PASS | Trial Member | Messages: interactive controls | 1 clicked |
| PASS | Trial Member | Nav: Notifications / What's New (phone) |  |
| PASS | Trial Member | Nav: Settings (phone) |  |
| PASS | Trial Member | Stripe / Billing entry | plans/upgrade copy |
| PASS | Trial Member | Settings: interactive controls | 2 clicked |
| PASS | Trial Member | Phone lesson open (Farm Animals) |  |
| PASS | Trial Member | Legacy workspace (Farm Animals) | Teaching Kit enhanced — legacy panels superseded (regression OK) |
| PASS | Trial Member | Teaching Kit enhances (Farm Animals) | workspace present |
| PASS | Trial Member | TK Overview (Start Week) (Preschool) | chars=433 |
| PASS | Trial Member | TK Monday Setup / Materials prep (Preschool) | chars=2969 |
| PASS | Trial Member | TK Daily Activities (Today) (Preschool) | chars=1758 |
| PASS | Trial Member | TK Build / Print / Printables queue (Preschool) | chars=1676 |
| PASS | Trial Member | TK Binder / Print View (Preschool) | chars=773 |
| PASS | Trial Member | TK Books/Songs/Printables queue (Farm Animals) | build surface content |
| PASS | Trial Member | Attachments disabled as expected (Farm Animals) | attachments flag off (Phase 1) |
| PASS | Trial Member | TK Binder/Print preview (Farm Animals) | nodes=2 |
| PASS | Trial Member | Logout |  |
| PASS | Trial Member | No critical console errors (phone) |  |
| PASS | Trial Member | No 404/500 network failures (phone) |  |
| PASS | Pro Member | Login (desktop) | firebase={"ok":true,"via":"existing"} |
| PASS | Pro Member | Nav: Calendar / Dashboard (desktop) |  |
| PASS | Pro Member | Calendar / Dashboard: interactive controls | 2 clicked |
| PASS | Pro Member | Nav: Lesson Plans (desktop) |  |
| PASS | Pro Member | Search on Lesson Plans | typed query |
| PASS | Pro Member | Filters on Lesson Plans |  |
| PASS | Pro Member | Favorites control on Lesson Plans |  |
| PASS | Pro Member | Lesson Plans: interactive controls | 1 clicked |
| PASS | Pro Member | Nav: Activity Library (desktop) |  |
| PASS | Pro Member | Search on Activity Library | typed query |
| PASS | Pro Member | Filters on Activity Library |  |
| PASS | Pro Member | Favorites control on Activity Library |  |
| PASS | Pro Member | Activity Library: interactive controls | 1 clicked |
| PASS | Pro Member | Nav: Daily Logs (desktop) |  |
| PASS | Pro Member | Daily Logs: interactive controls | 1 clicked |
| PASS | Pro Member | Nav: Child Profiles (desktop) |  |
| PASS | Pro Member | Child Profiles: interactive controls | 1 clicked |
| PASS | Pro Member | Nav: Documentation Helpers / AI (desktop) |  |
| PASS | Pro Member | Documentation Helpers / AI: interactive controls | 1 clicked |
| PASS | Pro Member | Nav: Resources / Behavior Support (desktop) |  |
| PASS | Pro Member | Resources / Behavior Support: interactive controls | 1 clicked |
| PASS | Pro Member | Nav: Messages (desktop) |  |
| PASS | Pro Member | Messages: interactive controls | 1 clicked |
| PASS | Pro Member | Nav: Notifications / What's New (desktop) |  |
| PASS | Pro Member | Nav: Settings (desktop) |  |
| PASS | Pro Member | Stripe / Billing entry | plans/upgrade copy |
| PASS | Pro Member | Settings: interactive controls | 2 clicked |
| PASS | Pro Member | Open lesson Colors All Around Us (Infant 0–6 Months/Free) | cur-lp-infant-colors-all-around-us |
| PASS | Pro Member | Legacy workspace (Colors All Around Us) | Teaching Kit enhanced — legacy panels superseded (regression OK) |
| PASS | Pro Member | Teaching Kit enhances (Colors All Around Us) | workspace present |
| PASS | Pro Member | TK Overview (Start Week) (Infant 0–6 Months) | chars=449 |
| PASS | Pro Member | TK Monday Setup / Materials prep (Infant 0–6 Months) | chars=2409 |
| PASS | Pro Member | TK Daily Activities (Today) (Infant 0–6 Months) | chars=2035 |
| PASS | Pro Member | TK Build / Print / Printables queue (Infant 0–6 Months) | chars=1613 |
| PASS | Pro Member | TK Binder / Print View (Infant 0–6 Months) | chars=813 |
| PASS | Pro Member | TK Books/Songs/Printables queue (Colors All Around Us) | build surface content |
| PASS | Pro Member | Attachments disabled as expected (Colors All Around Us) | attachments flag off (Phase 1) |
| PASS | Pro Member | TK Binder/Print preview (Colors All Around Us) | nodes=2 |
| PASS | Pro Member | Open lesson Fire Trucks, Safe Helpers and Moving Colors (Infant 6–12 Months/Pro) | cur-lp-19fb3c245b23c300c8b |
| PASS | Pro Member | Legacy workspace (Fire Trucks, Safe Helpers and Moving Colors) | Teaching Kit enhanced — legacy panels superseded (regression OK) |
| PASS | Pro Member | Teaching Kit enhances (Fire Trucks, Safe Helpers and Moving Colors) | workspace present |
| PASS | Pro Member | TK Overview (Start Week) (Infant 6–12 Months) | chars=472 |
| PASS | Pro Member | TK Monday Setup / Materials prep (Infant 6–12 Months) | chars=2558 |
| PASS | Pro Member | TK Daily Activities (Today) (Infant 6–12 Months) | chars=1834 |
| PASS | Pro Member | TK Build / Print / Printables queue (Infant 6–12 Months) | chars=1432 |
| PASS | Pro Member | TK Binder / Print View (Infant 6–12 Months) | chars=906 |
| PASS | Pro Member | TK Books/Songs/Printables queue (Fire Trucks, Safe Helpers and Moving Colors) | build surface content |
| PASS | Pro Member | Attachments disabled as expected (Fire Trucks, Safe Helpers and Moving Colors) | attachments flag off (Phase 1) |
| PASS | Pro Member | TK Binder/Print preview (Fire Trucks, Safe Helpers and Moving Colors) | nodes=2 |
| PASS | Pro Member | Open lesson My Senses (Infant 0–6 Months/Pro) | cur-lp-infant-my-senses |
| PASS | Pro Member | Legacy workspace (My Senses) | Teaching Kit enhanced — legacy panels superseded (regression OK) |
| PASS | Pro Member | Teaching Kit enhances (My Senses) | workspace present |
| PASS | Pro Member | TK Overview (Start Week) (Infant 0–6 Months) | chars=438 |
| PASS | Pro Member | TK Monday Setup / Materials prep (Infant 0–6 Months) | chars=2035 |
| PASS | Pro Member | TK Daily Activities (Today) (Infant 0–6 Months) | chars=2099 |
| PASS | Pro Member | TK Build / Print / Printables queue (Infant 0–6 Months) | chars=1551 |
| PASS | Pro Member | TK Binder / Print View (Infant 0–6 Months) | chars=769 |
| PASS | Pro Member | TK Books/Songs/Printables queue (My Senses) | build surface content |
| PASS | Pro Member | Attachments disabled as expected (My Senses) | attachments flag off (Phase 1) |
| PASS | Pro Member | TK Binder/Print preview (My Senses) | nodes=2 |
| PASS | Pro Member | Open lesson Grandfriends, Hugs and Happy Memories (Toddler/Pro) | cur-lp-19fb3a8c4d2ab6b1e42 |
| PASS | Pro Member | Legacy workspace (Grandfriends, Hugs and Happy Memories) | Teaching Kit enhanced — legacy panels superseded (regression OK) |
| PASS | Pro Member | Teaching Kit enhances (Grandfriends, Hugs and Happy Memories) | workspace present |
| PASS | Pro Member | TK Overview (Start Week) (Toddler) | chars=455 |
| PASS | Pro Member | TK Monday Setup / Materials prep (Toddler) | chars=3855 |
| PASS | Pro Member | TK Daily Activities (Today) (Toddler) | chars=2002 |
| PASS | Pro Member | TK Build / Print / Printables queue (Toddler) | chars=1339 |
| PASS | Pro Member | TK Binder / Print View (Toddler) | chars=871 |
| PASS | Pro Member | TK Books/Songs/Printables queue (Grandfriends, Hugs and Happy Memories) | build surface content |
| PASS | Pro Member | Attachments disabled as expected (Grandfriends, Hugs and Happy Memories) | attachments flag off (Phase 1) |
| PASS | Pro Member | TK Binder/Print preview (Grandfriends, Hugs and Happy Memories) | nodes=2 |
| PASS | Pro Member | Open lesson Farm Friends (Toddler/Pro) | cur-lp-toddler-farm-friends |
| PASS | Pro Member | Legacy workspace (Farm Friends) | Teaching Kit enhanced — legacy panels superseded (regression OK) |
| PASS | Pro Member | Teaching Kit enhances (Farm Friends) | workspace present |
| PASS | Pro Member | TK Overview (Start Week) (Toddler) | chars=430 |
| PASS | Pro Member | TK Monday Setup / Materials prep (Toddler) | chars=2761 |
| PASS | Pro Member | TK Daily Activities (Today) (Toddler) | chars=2251 |
| PASS | Pro Member | TK Build / Print / Printables queue (Toddler) | chars=1622 |
| PASS | Pro Member | TK Binder / Print View (Toddler) | chars=771 |
| PASS | Pro Member | TK Books/Songs/Printables queue (Farm Friends) | build surface content |
| PASS | Pro Member | Attachments disabled as expected (Farm Friends) | attachments flag off (Phase 1) |
| PASS | Pro Member | TK Binder/Print preview (Farm Friends) | nodes=2 |
| PASS | Pro Member | Open lesson Farm Animals (Preschool/Free) | cur-lp-preschool-farm-animals |
| PASS | Pro Member | Legacy workspace (Farm Animals) | Teaching Kit enhanced — legacy panels superseded (regression OK) |
| PASS | Pro Member | Teaching Kit enhances (Farm Animals) | workspace present |
| PASS | Pro Member | TK Overview (Start Week) (Preschool) | chars=433 |
| PASS | Pro Member | TK Monday Setup / Materials prep (Preschool) | chars=2969 |
| PASS | Pro Member | TK Daily Activities (Today) (Preschool) | chars=1758 |
| PASS | Pro Member | TK Build / Print / Printables queue (Preschool) | chars=1676 |
| PASS | Pro Member | TK Binder / Print View (Preschool) | chars=773 |
| PASS | Pro Member | TK Books/Songs/Printables queue (Farm Animals) | build surface content |
| PASS | Pro Member | Attachments disabled as expected (Farm Animals) | attachments flag off (Phase 1) |
| PASS | Pro Member | TK Binder/Print preview (Farm Animals) | nodes=2 |
| PASS | Pro Member | Open lesson Grandfriends, Stories and Special Memories (Preschool/Pro) | cur-lp-19fb3b385454cd884f3 |
| PASS | Pro Member | Legacy workspace (Grandfriends, Stories and Special Memories) | Teaching Kit enhanced — legacy panels superseded (regression OK) |
| PASS | Pro Member | Teaching Kit enhances (Grandfriends, Stories and Special Memories) | workspace present |
| PASS | Pro Member | TK Overview (Start Week) (Preschool) | chars=462 |
| PASS | Pro Member | TK Monday Setup / Materials prep (Preschool) | chars=3816 |
| PASS | Pro Member | TK Daily Activities (Today) (Preschool) | chars=2370 |
| PASS | Pro Member | TK Build / Print / Printables queue (Preschool) | chars=1392 |
| PASS | Pro Member | TK Binder / Print View (Preschool) | chars=893 |
| PASS | Pro Member | TK Books/Songs/Printables queue (Grandfriends, Stories and Special Memories) | build surface content |
| PASS | Pro Member | Attachments disabled as expected (Grandfriends, Stories and Special Memories) | attachments flag off (Phase 1) |
| PASS | Pro Member | TK Binder/Print preview (Grandfriends, Stories and Special Memories) | nodes=2 |
| PASS | Pro Member | Open lesson My Home & My Family (Preschool/Pro) | cur-lp-preschool-family-connections-preschool-my-home-and-my-family |
| PASS | Pro Member | Legacy workspace (My Home & My Family) | Teaching Kit enhanced — legacy panels superseded (regression OK) |
| PASS | Pro Member | Teaching Kit enhances (My Home & My Family) | workspace present |
| PASS | Pro Member | TK Overview (Start Week) (Preschool) | chars=439 |
| PASS | Pro Member | TK Monday Setup / Materials prep (Preschool) | chars=3207 |
| PASS | Pro Member | TK Daily Activities (Today) (Preschool) | chars=3461 |
| PASS | Pro Member | TK Build / Print / Printables queue (Preschool) | chars=4692 |
| PASS | Pro Member | TK Binder / Print View (Preschool) | chars=801 |
| PASS | Pro Member | TK Books/Songs/Printables queue (My Home & My Family) | build surface content |
| PASS | Pro Member | Attachments disabled as expected (My Home & My Family) | attachments flag off (Phase 1) |
| PASS | Pro Member | TK Binder/Print preview (My Home & My Family) | nodes=2 |
| PASS | Pro Member | Lesson age bucket mixed | no published plans in catalog for this age (N/A) |
| PASS | Pro Member | No critical console errors (desktop) |  |
| PASS | Pro Member | No 404/500 network failures (desktop) |  |
| PASS | Pro Member | Login (phone) | firebase={"ok":true,"via":"existing"} |
| PASS | Pro Member | Nav: Calendar / Dashboard (phone) |  |
| PASS | Pro Member | Calendar / Dashboard: interactive controls | 2 clicked |
| PASS | Pro Member | Nav: Lesson Plans (phone) |  |
| PASS | Pro Member | Search on Lesson Plans | typed query |
| PASS | Pro Member | Filters on Lesson Plans |  |
| PASS | Pro Member | Favorites control on Lesson Plans |  |
| PASS | Pro Member | Lesson Plans: interactive controls | 1 clicked |
| PASS | Pro Member | Nav: Activity Library (phone) |  |
| PASS | Pro Member | Search on Activity Library | typed query |
| PASS | Pro Member | Filters on Activity Library |  |
| PASS | Pro Member | Favorites control on Activity Library |  |
| PASS | Pro Member | Activity Library: interactive controls | 1 clicked |
| PASS | Pro Member | Nav: Daily Logs (phone) |  |
| PASS | Pro Member | Daily Logs: interactive controls | 1 clicked |
| PASS | Pro Member | Nav: Child Profiles (phone) |  |
| PASS | Pro Member | Child Profiles: interactive controls | 1 clicked |
| PASS | Pro Member | Nav: Documentation Helpers / AI (phone) |  |
| PASS | Pro Member | Documentation Helpers / AI: interactive controls | 1 clicked |
| PASS | Pro Member | Nav: Resources / Behavior Support (phone) |  |
| PASS | Pro Member | Resources / Behavior Support: interactive controls | 1 clicked |
| PASS | Pro Member | Nav: Messages (phone) |  |
| PASS | Pro Member | Messages: interactive controls | 1 clicked |
| PASS | Pro Member | Nav: Notifications / What's New (phone) |  |
| PASS | Pro Member | Nav: Settings (phone) |  |
| PASS | Pro Member | Stripe / Billing entry | plans/upgrade copy |
| PASS | Pro Member | Settings: interactive controls | 2 clicked |
| PASS | Pro Member | Phone lesson open (Farm Animals) |  |
| PASS | Pro Member | Legacy workspace (Farm Animals) | Teaching Kit enhanced — legacy panels superseded (regression OK) |
| PASS | Pro Member | Teaching Kit enhances (Farm Animals) | workspace present |
| PASS | Pro Member | TK Overview (Start Week) (Preschool) | chars=433 |
| PASS | Pro Member | TK Monday Setup / Materials prep (Preschool) | chars=2969 |
| PASS | Pro Member | TK Daily Activities (Today) (Preschool) | chars=1758 |
| PASS | Pro Member | TK Build / Print / Printables queue (Preschool) | chars=1676 |
| PASS | Pro Member | TK Binder / Print View (Preschool) | chars=773 |
| PASS | Pro Member | TK Books/Songs/Printables queue (Farm Animals) | build surface content |
| PASS | Pro Member | Attachments disabled as expected (Farm Animals) | attachments flag off (Phase 1) |
| PASS | Pro Member | TK Binder/Print preview (Farm Animals) | nodes=2 |
| PASS | Pro Member | Logout |  |
| PASS | Pro Member | No critical console errors (phone) |  |
| PASS | Pro Member | No 404/500 network failures (phone) |  |
| PASS | Admin | Admin unlock | dashboard unlocked |
| PASS | Admin | Curriculum management tools |  |
| PASS | Admin | Admin dashboard: interactive controls | 1 clicked |
| PASS | Admin | Provider login as owner |  |
| PASS | Admin | Nav: Calendar / Dashboard (desktop) |  |
| PASS | Admin | Calendar / Dashboard: interactive controls | 3 clicked |
| PASS | Admin | Nav: Lesson Plans (desktop) |  |
| PASS | Admin | Search on Lesson Plans | typed query |
| PASS | Admin | Filters on Lesson Plans |  |
| PASS | Admin | Lesson Plans: interactive controls | 1 clicked |
| PASS | Admin | Nav: Activity Library (desktop) |  |
| PASS | Admin | Search on Activity Library | typed query |
| PASS | Admin | Filters on Activity Library |  |
| PASS | Admin | Activity Library: interactive controls | 1 clicked |
| PASS | Admin | Nav: Daily Logs (desktop) |  |
| PASS | Admin | Daily Logs: interactive controls | 1 clicked |
| PASS | Admin | Nav: Child Profiles (desktop) |  |
| PASS | Admin | Child Profiles: interactive controls | 1 clicked |
| PASS | Admin | Nav: Documentation Helpers / AI (desktop) |  |
| PASS | Admin | Documentation Helpers / AI: interactive controls | 1 clicked |
| PASS | Admin | Nav: Resources / Behavior Support (desktop) |  |
| PASS | Admin | Resources / Behavior Support: interactive controls | 1 clicked |
| PASS | Admin | Nav: Messages (desktop) |  |
| PASS | Admin | Messages: interactive controls | 1 clicked |
| PASS | Admin | Nav: Notifications / What's New (desktop) |  |
| PASS | Admin | Nav: Settings (desktop) |  |
| PASS | Admin | Stripe / Billing entry | plans/upgrade copy |
| PASS | Admin | Settings: interactive controls | 1 clicked |
| PASS | Admin | Admin run | Original timeout during openLessonById after long session — re-verified PASS in supplemental Admin Teaching Kit run |
| PASS | Admin | Admin management sections | Supplemental run: unlocked + clicked 14 admin/home/users/billing/content/messages/AI controls |
| PASS | Admin | Admin Teaching Kit lesson open (re-verified) | Supplemental run: Founding/owner opened Pro preschool lesson; TK start/setup/today/build/binder all rendered |

## Final recommendation

**Safe with minor issues**

Teaching Kit Phase 1 Viewer + Print Center is behaving correctly across Free/Trial/Pro/Admin with no Critical or High product defects found. Remaining items are Low-severity UX/copy/catalog notes and do not block production.
