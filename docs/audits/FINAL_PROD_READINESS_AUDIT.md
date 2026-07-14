# Final Production Readiness Audit

Generated: 2026-07-14T18:00:01.948Z
Production URL: https://little-learner-hub.onrender.com
Test account: leahivie@icloud.com

## Verdict: **NOT production-ready**

Checks: 28 PASS / 11 FAIL / 1 SKIP
Issues: CRITICAL 2 · HIGH 5 · MEDIUM 4 · LOW 0

## CRITICAL

### 1. domain-https://littlelearnerhub.com/
- **Page:** https://littlelearnerhub.com/
- **Steps:** Open https://littlelearnerhub.com/ in a browser
- **Expected:** Little Learner Hub homepage loads
- **Actual:** Cloudflare challenge / Bluehost — site never loads
- **Recommended fix:** Point DNS at Render (see docs/DOMAIN_DNS_FIX.md); turn off stuck Cloudflare challenge

### 2. domain-https://www.littlelearnerhub.com/
- **Page:** https://www.littlelearnerhub.com/
- **Steps:** Open https://www.littlelearnerhub.com/ in a browser
- **Expected:** Little Learner Hub homepage loads
- **Actual:** Cloudflare challenge / Bluehost — site never loads
- **Recommended fix:** Point DNS at Render (see docs/DOMAIN_DNS_FIX.md); turn off stuck Cloudflare challenge

## HIGH

### 1. nav-lessons
- **Page:** Lesson Plan Library
- **Steps:** Open Lesson Plan Library
- **Expected:** Loads
- **Actual:** locator.click: Timeout 8000ms exceeded.
Call log:
  - waiting for locator('[data-view=\'lessons\']').first()
    - locator resolved to <button class="nav-link" data-view="lessons" aria-hidden="false" data-nav-capability="lesson_plans">…</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div role="dialog" id="authModal" aria-modal="true" class="modal open" aria-hidden="false" aria-labelledby="authTitle">…</div> intercepts pointer events
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div role="dialog" id="authModal" aria-modal="true" class="modal open" aria-hidden="false" aria-labelledby="authTitle">…</div> intercepts pointer events
    - retrying click action
      - waiting 100ms
    15 × waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <div role="dialog" id="authModal" aria-modal="true" class="modal open" aria-hidden="false" aria-labelledby="authTitle">…</div> intercepts pointer events
     - retrying click action
       - waiting 500ms

- **Recommended fix:** Fix navigation to lessons

### 2. catalog-incomplete-days
- **Page:** Curriculum catalog
- **Steps:** Inspect /api/site-content curriculumLibrary.lessonPlans
- **Expected:** Mon–Fri activities present for weekly plans
- **Actual:** 48 incomplete; e.g. Zoo Adventure: monday,tuesday,wednesday,thursday,friday
- **Recommended fix:** Re-import incomplete plans (e.g. Space Adventure) into production catalog

### 3. logout
- **Page:** auth
- **Steps:** locator.click: Timeout 45000ms exceeded.
Call log:
  - waiting for locator('#signOutButton, [data-sign-out], button:has-text(\'Sign Out\')').first()
    - locator resolved to <button type="button" id="signOutButton" class="ghost-button">Sign Out</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <button type="button" class="lesson-workspace-activity-row" data-open-curriculum-activity="cur-act-preschool-all-about-me-monday-2">…</button> from <div aria-hidden="false" id="resourceViewerModal" class="modal resource-viewer-modal lesson-workspace-mode open">…</div> subtree intercepts pointer events
    - retrying click action
    - waiting 20ms
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <button role="tab" type="button" aria-selected="false" class="lesson-workspace-tab" data-lesson-workspace-tab="plan">Plan</button> from <div aria-hidden="false" id="resourceViewerModal" class="modal resource-viewer-modal lesson-workspace-mode open">…</div> subtree intercepts pointer events
  2 × retrying click action
      - waiting 100ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div aria-hidden="false" id="resourceViewerModal" class="modal resource-viewer-modal lesson-workspace-mode open">…</div> intercepts pointer events
  21 × retrying click action
       - waiting 500ms
       - waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <button type="button" class="lesson-workspace-activity-row" data-open-curriculum-activity="cur-act-preschool-all-about-me-monday-2">…</button> from <div aria-hidden="false" id="resourceViewerModal" class="modal resource-viewer-modal lesson-workspace-mode open">…</div> subtree intercepts pointer events
     - retrying click action
       - waiting 500ms
       - waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <button role="tab" type="button" aria-selected="false" class="lesson-workspace-tab" data-lesson-workspace-tab="plan">Plan</button> from <div aria-hidden="false" id="resourceViewerModal" class="modal resource-viewer-modal lesson-workspace-mode open">…</div> subtree intercepts pointer events
     - retrying click action
       - waiting 500ms
       - waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <div aria-hidden="false" id="resourceViewerModal" class="modal resource-viewer-modal lesson-workspace-mode open">…</div> intercepts pointer events
     - retrying click action
       - waiting 500ms
       - waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <div aria-hidden="false" id="resourceViewerModal" class="modal resource-viewer-modal lesson-workspace-mode open">…</div> intercepts pointer events
  - retrying click action
    - waiting 500ms
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <button type="button" class="lesson-workspace-activity-row" data-open-curriculum-activity="cur-act-preschool-all-about-me-monday-2">…</button> from <div aria-hidden="false" id="resourceViewerModal" class="modal resource-viewer-modal lesson-workspace-mode open">…</div> subtree intercepts pointer events
  - retrying click action
    - waiting 500ms
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <button role="tab" type="button" aria-selected="false" class="lesson-workspace-tab" data-lesson-workspace-tab="plan">Plan</button> from <div aria-hidden="false" id="resourceViewerModal" class="modal resource-viewer-modal lesson-workspace-mode open">…</div> subtree intercepts pointer events
  - retrying click action
    - waiting 500ms

- **Expected:** Workflow succeeds without error
- **Actual:** locator.click: Timeout 45000ms exceeded.
Call log:
  - waiting for locator('#signOutButton, [data-sign-out], button:has-text(\'Sign Out\')').first()
    - locator resolved to <button type="button" id="signOutButton" class="ghost-button">Sign Out</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <button type="button" class="lesson-workspace-activity-row" data-open-curriculum-activity="cur-act-preschool-all-about-me-monday-2">…</button> from <div aria-hidden="false" id="resourceViewerModal" class="modal resource-viewer-modal lesson-workspace-mode open">…</div> subtree intercepts pointer events
    - retrying click action
    - waiting 20ms
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <button role="tab" type="button" aria-selected="false" class="lesson-workspace-tab" data-lesson-workspace-tab="plan">Plan</button> from <div aria-hidden="false" id="resourceViewerModal" class="modal resource-viewer-modal lesson-workspace-mode open">…</div> subtree intercepts pointer events
  2 × retrying click action
      - waiting 100ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div aria-hidden="false" id="resourceViewerModal" class="modal resource-viewer-modal lesson-workspace-mode open">…</div> intercepts pointer events
  21 × retrying click action
       - waiting 500ms
       - waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <button type="button" class="lesson-workspace-activity-row" data-open-curriculum-activity="cur-act-preschool-all-about-me-monday-2">…</button> from <div aria-hidden="false" id="resourceViewerModal" class="modal resource-viewer-modal lesson-workspace-mode open">…</div> subtree intercepts pointer events
     - retrying click action
       - waiting 500ms
       - waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <button role="tab" type="button" aria-selected="false" class="lesson-workspace-tab" data-lesson-workspace-tab="plan">Plan</button> from <div aria-hidden="false" id="resourceViewerModal" class="modal resource-viewer-modal lesson-workspace-mode open">…</div> subtree intercepts pointer events
     - retrying click action
       - waiting 500ms
       - waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <div aria-hidden="false" id="resourceViewerModal" class="modal resource-viewer-modal lesson-workspace-mode open">…</div> intercepts pointer events
     - retrying click action
       - waiting 500ms
       - waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <div aria-hidden="false" id="resourceViewerModal" class="modal resource-viewer-modal lesson-workspace-mode open">…</div> intercepts pointer events
  - retrying click action
    - waiting 500ms
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <button type="button" class="lesson-workspace-activity-row" data-open-curriculum-activity="cur-act-preschool-all-about-me-monday-2">…</button> from <div aria-hidden="false" id="resourceViewerModal" class="modal resource-viewer-modal lesson-workspace-mode open">…</div> subtree intercepts pointer events
  - retrying click action
    - waiting 500ms
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <button role="tab" type="button" aria-selected="false" class="lesson-workspace-tab" data-lesson-workspace-tab="plan">Plan</button> from <div aria-hidden="false" id="resourceViewerModal" class="modal resource-viewer-modal lesson-workspace-mode open">…</div> subtree intercepts pointer events
  - retrying click action
    - waiting 500ms

- **Recommended fix:** Investigate and fix before calling production-ready

### 4. permissions-live-roles
- **Page:** Permissions
- **Steps:** Login as Director, Lead Teacher, Assistant and hit restricted URLs
- **Expected:** Each role sees correct nav + route guards
- **Actual:** Only one test account credential provided (LLH_TEST_EMAIL)
- **Recommended fix:** Provide role-specific test accounts (or Admin-created staff invites) for live E2E

### 5. billing-plan-variety
- **Page:** Billing
- **Steps:** Login as Free, Trial, Pro, Founding and verify upgrade/cancel/retention
- **Expected:** Each plan path verified end-to-end including Stripe portal actions
- **Actual:** Only one production test credential available; Stripe upgrade/cancel not executed to avoid mutating live billing
- **Recommended fix:** Provide dedicated Free/Trial/Pro/Founding test accounts + allowlisted Stripe test mode or staging

## MEDIUM

### 1. account-name-fields
- **Page:** Account profile
- **Steps:** Inspect saved account after login
- **Expected:** Name fields populated for known users
- **Actual:** Missing first/last name
- **Recommended fix:** Ensure signup/profile sync writes firstName/lastName

### 2. feedback-modal
- **Page:** support
- **Steps:** locator.click: Timeout 45000ms exceeded.
Call log:
  - waiting for locator('[data-open-feedback]').first()
    - locator resolved to <button type="button" class="ghost-button" data-open-feedback="Bug">Report a Bug</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div aria-hidden="false" id="resourceViewerModal" class="modal resource-viewer-modal lesson-workspace-mode open">…</div> intercepts pointer events
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div aria-hidden="false" id="resourceViewerModal" class="modal resource-viewer-modal lesson-workspace-mode open">…</div> intercepts pointer events
    - retrying click action
      - waiting 100ms
    87 × waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <div aria-hidden="false" id="resourceViewerModal" class="modal resource-viewer-modal lesson-workspace-mode open">…</div> intercepts pointer events
     - retrying click action
       - waiting 500ms

- **Expected:** Workflow succeeds without error
- **Actual:** locator.click: Timeout 45000ms exceeded.
Call log:
  - waiting for locator('[data-open-feedback]').first()
    - locator resolved to <button type="button" class="ghost-button" data-open-feedback="Bug">Report a Bug</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div aria-hidden="false" id="resourceViewerModal" class="modal resource-viewer-modal lesson-workspace-mode open">…</div> intercepts pointer events
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div aria-hidden="false" id="resourceViewerModal" class="modal resource-viewer-modal lesson-workspace-mode open">…</div> intercepts pointer events
    - retrying click action
      - waiting 100ms
    87 × waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <div aria-hidden="false" id="resourceViewerModal" class="modal resource-viewer-modal lesson-workspace-mode open">…</div> intercepts pointer events
     - retrying click action
       - waiting 500ms

- **Recommended fix:** Investigate and fix before calling production-ready

### 3. console-errors
- **Page:** Global
- **Steps:** Browse core flows
- **Expected:** No page errors
- **Actual:** Failed to load resource: the server responded with a status of 503 () || Failed to load resource: the server responded with a status of 503 () || Failed to load resource: the server responded with a status of 503 () || Failed to load resource: the server responded with a status of 503 () || Failed to load resource: the server responded with a status of 503 ()
- **Recommended fix:** Fix JS exceptions listed in console-errors.json

### 4. failed-requests
- **Page:** Network
- **Steps:** Browse core flows
- **Expected:** No failed first-party requests
- **Actual:** https://little-learner-hub.onrender.com/api/schedule/migrate :: net::ERR_ABORTED || https://little-learner-hub.onrender.com/api/schedule :: net::ERR_ABORTED
- **Recommended fix:** Inspect failed-requests.json

## LOW

_None found in this run._

## Coverage gaps (not fully exercised)
- Dedicated Free / Trial / Pro / Founding accounts (only one credential available)
- Live Director / Lead Teacher / Assistant sessions (permission matrix verified in code only)
- Stripe upgrade / downgrade / cancel / trial expiration (avoided mutating live billing)
- Password reset email delivery end-to-end
- Creating brand-new signup accounts that would pollute production user store

## Raw results
- [PASS] health (public) — launchReady=false founding remaining=25
- [FAIL] domain-https://littlelearnerhub.com/ (public) — https://littlelearnerhub.com/ status=403 blocked/challenge
- [FAIL] domain-https://www.littlelearnerhub.com/ (public) — https://www.littlelearnerhub.com/ status=403 blocked/challenge
- [PASS] homepage-hero-signup (public) — Hero CTA visible: Sign Up — It’s Free
- [PASS] homepage-mid-signup (public) — Sign Up — Create Free Account
- [PASS] homepage-final-signup (public) — Sign Up — Get Started
- [PASS] homepage-topbar-signup (public) — Sign Up
- [PASS] homepage-value-prop (public) — Stop Spending Your Evenings on Childcare Paperwork
- [PASS] homepage-pricing (public) — Pricing section present
- [PASS] homepage-founding (public) — Founding offer present
- [PASS] homepage-placeholders (public) — No obvious placeholder copy
- [PASS] signup-modal-from-hero (auth) — Modal open (Create your Little Learner Hub account)
- [PASS] mobile-topbar-signup (mobile) — Sign Up
- [PASS] mobile-hero-signup (mobile) — Hero signup in first viewport
- [PASS] mobile-no-hscroll (mobile) — No horizontal overflow on homepage
- [PASS] login (auth) — Logged in as leahivie@icloud.com
- [PASS] account-identity (auth) — {"email":"","plan":"Free","accountType":"","role":"","firstName":"","lastName":"","businessName":"","founding":false,"bodyPro":false,"bodyAuth":true}
- [FAIL] account-name-fields (auth) — First/last name empty on test account profile
- [FAIL] nav-lessons (navigation) — locator.click: Timeout 8000ms exceeded.
Call log:
  - waiting for locator('[data-view=\'lessons\']').first()
    - locator resolved to <button class="nav-link" data-view="lessons" aria-hidden="false" data-nav-capability="lesson_plans">…</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div role="dialog" id="authModal" aria-modal="true" class="modal open" aria-hidden="false" aria-labelledby="authTitle">…</div> intercepts pointer events
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div role="dialog" id="authModal" aria-modal="true" class="modal open" aria-hidden="false" aria-labelledby="authTitle">…</div> intercepts pointer events
    - retrying click action
      - waiting 100ms
    15 × waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <div role="dialog" id="authModal" aria-modal="true" class="modal open" aria-hidden="false" aria-labelledby="authTitle">…</div> intercepts pointer events
     - retrying click action
       - waiting 500ms

- [PASS] nav-activities (navigation) — Activity Library
- [PASS] nav-calendar (navigation) — Calendar
- [PASS] nav-children (navigation) — Child Profiles
- [PASS] nav-ai (navigation) — Documentation Helpers
- [PASS] nav-settings (navigation) — Settings
- [PASS] lesson-open (lessons) — Opened: All About Me
          
            Preschool
            Free
            
    
- [PASS] catalog-counts (lessons) — plans=59 activities=656
- [FAIL] catalog-incomplete-days (lessons) — 48 plans missing weekday activities (sample Zoo Adventure; Pet Pals; Gardening & Plant Life)
- [PASS] children-list (children) — 8 child entry points
- [PASS] child-tabs (children) — tabs rendered after open
- [PASS] daily-logs (daily-logs) — Daily Logs surface loaded
- [PASS] calendar-load (calendar) — Calendar loaded
- [FAIL] feedback-modal (support) — locator.click: Timeout 45000ms exceeded.
Call log:
  - waiting for locator('[data-open-feedback]').first()
    - locator resolved to <button type="button" class="ghost-button" data-open-feedback="Bug">Report a Bug</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div aria-hidden="false" id="resourceViewerModal" class="modal resource-viewer-modal lesson-workspace-mode open">…</div> intercepts pointer events
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div aria-hidden="false" id="resourceViewerModal" class="modal resource-viewer-modal lesson-workspace-mode open">…</div> intercepts pointer events
    - retrying click action
      - waiting 100ms
    87 × waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <div aria-hidden="false" id="resourceViewerModal" class="modal resource-viewer-modal lesson-workspace-mode open">…</div> intercepts pointer events
     - retrying click action
       - waiting 500ms

- [PASS] plans-view (billing) — Plans/pricing view loads for account
- [FAIL] logout (auth) — locator.click: Timeout 45000ms exceeded.
Call log:
  - waiting for locator('#signOutButton, [data-sign-out], button:has-text(\'Sign Out\')').first()
    - locator resolved to <button type="button" id="signOutButton" class="ghost-button">Sign Out</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <button type="button" class="lesson-workspace-activity-row" data-open-curriculum-activity="cur-act-preschool-all-about-me-monday-2">…</button> from <div aria-hidden="false" id="resourceViewerModal" class="modal resource-viewer-modal lesson-workspace-mode open">…</div> subtree intercepts pointer events
    - retrying click action
    - waiting 20ms
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <button role="tab" type="button" aria-selected="false" class="lesson-workspace-tab" data-lesson-workspace-tab="plan">Plan</button> from <div aria-hidden="false" id="resourceViewerModal" class="modal resource-viewer-modal lesson-workspace-mode open">…</div> subtree intercepts pointer events
  2 × retrying click action
      - waiting 100ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div aria-hidden="false" id="resourceViewerModal" class="modal resource-viewer-modal lesson-workspace-mode open">…</div> intercepts pointer events
  21 × retrying click action
       - waiting 500ms
       - waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <button type="button" class="lesson-workspace-activity-row" data-open-curriculum-activity="cur-act-preschool-all-about-me-monday-2">…</button> from <div aria-hidden="false" id="resourceViewerModal" class="modal resource-viewer-modal lesson-workspace-mode open">…</div> subtree intercepts pointer events
     - retrying click action
       - waiting 500ms
       - waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <button role="tab" type="button" aria-selected="false" class="lesson-workspace-tab" data-lesson-workspace-tab="plan">Plan</button> from <div aria-hidden="false" id="resourceViewerModal" class="modal resource-viewer-modal lesson-workspace-mode open">…</div> subtree intercepts pointer events
     - retrying click action
       - waiting 500ms
       - waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <div aria-hidden="false" id="resourceViewerModal" class="modal resource-viewer-modal lesson-workspace-mode open">…</div> intercepts pointer events
     - retrying click action
       - waiting 500ms
       - waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <div aria-hidden="false" id="resourceViewerModal" class="modal resource-viewer-modal lesson-workspace-mode open">…</div> intercepts pointer events
  - retrying click action
    - waiting 500ms
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <button type="button" class="lesson-workspace-activity-row" data-open-curriculum-activity="cur-act-preschool-all-about-me-monday-2">…</button> from <div aria-hidden="false" id="resourceViewerModal" class="modal resource-viewer-modal lesson-workspace-mode open">…</div> subtree intercepts pointer events
  - retrying click action
    - waiting 500ms
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <button role="tab" type="button" aria-selected="false" class="lesson-workspace-tab" data-lesson-workspace-tab="plan">Plan</button> from <div aria-hidden="false" id="resourceViewerModal" class="modal resource-viewer-modal lesson-workspace-mode open">…</div> subtree intercepts pointer events
  - retrying click action
    - waiting 500ms

- [SKIP] admin-unlock (admin) — LLH_ADMIN_EMAIL/PASSWORD/CODE not provided — Admin unlock not re-tested in this run
- [PASS] permissions-matrix (security) — Owner billing; teacher/assistant correctly restricted in account-access.js
- [FAIL] permissions-live-roles (security) — Could not exercise Director/Lead Teacher/Assistant live sessions — only one LLH_TEST account credential is available in this environment
- [FAIL] billing-plan-variety (billing) — Free/Trial/Pro/Founding were not each exercised with dedicated live accounts in this run (single test credential)
- [FAIL] console-errors (performance) — 11 console errors (see artifacts)
- [FAIL] failed-requests (performance) — 2 failed requests