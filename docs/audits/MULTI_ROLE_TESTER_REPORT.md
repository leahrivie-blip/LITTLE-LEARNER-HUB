# Multi-Role Tester Experience

Testing-site only. One login per tester; Admin can enable **Multi-Role Tester** so that account can Switch View without extra emails.

## Operator steps

1. Admin → User Profile → Membership → **Enable Multi-Role Tester**
2. Tester signs in with their usual account (testing site)
3. Header shows **Switch View** → Owner / Director / Teacher / Assistant / Parent
4. Banner: “You are currently viewing the app as a {Role}” + blurb + **?** help + **Return to My Tester View**
5. Admin → **View role-switch log** on that user’s profile
6. **Report a Bug** FAB captures role, page, device, browser, time
7. On logout: “Which role did you test today?” check-in (skippable once)

## Sandbox fences

While Switch View is active (and for multi-role testers generally):

- No Admin / Testing Center
- No billing capability
- No analytics / other testers / production data
- Role switch API requires `multiRoleTester` on the store user

## Files

- `scripts/multi-role-tester.js` — client module
- `scripts/test-multi-role-tester.js` — API + harness acceptance
- Hooks in `app.js`, APIs in `server/index.js`, styles in `styles.css`

## Verification

`npm run test:multi-role-tester` — 21/21 passed (static, API permission/logging, Admin enable/list, Switch View chrome, smart feedback, role help).
