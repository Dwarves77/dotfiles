# 2026-10-06 lane auth1-repeated-signup (AUTH-1): a repeated signup no longer says a link was sent

## Accomplished
- Defect confirmed in production auth logs (2026-10-06 00:43 UTC): `supabase.auth.signUp` for an already registered address returns no error, a user with an empty `identities` array (action `user_repeated_signup`), and sends no email. `/signup` showed "We sent a confirmation link to <email>".
- New pure helper `fsi-app/src/lib/auth/classify-signup-result.mjs` (+ 4 tests) returns `confirmation_sent`, `already_registered` (user present, `identities` an empty array) or `error`. Reads only `error`, `data.user`, `data.user.identities`.
- `/signup` uses it. `already_registered` shows "This email address already has an account." with links "Sign in" (/login, keeps the redirect param) and "Reset your password" (/auth/reset-password), form kept so the address can be corrected. No sentence about email being sent or not sent. `confirmation_sent` and `error` unchanged.
- New part `AuthAlreadyRegisteredNotice` in `AuthPanel.tsx`, built on the existing `AuthErrorBanner`.
- Smoke: new signup leg in `auth-onboarding-smoke.mjs` mounts the real page via `compose-signup`, submits the repeated and the fresh fixture at 375 and 1440 (stub signUp reads `window.__SIGNUP_FIXTURE__`, default unchanged).

## Read and reused
- Read: CLAUDE.md, lane-common-contract, ux-laws, design-principles, signup page, AuthPanel, login page (forgot link target), stub-supabase-browser-auth, auth-onboarding-smoke, compose-signup mount, safe-return-path.mjs (the .mjs-helper-imported-from-tsx precedent).
- Reused: AuthErrorBanner, the compose-signup audit mount, the existing auth-onboarding spec and its ux-assert checks, the existing /login and /auth/reset-password routes.

## Evidence
- Red: smoke leg against the old page failed 6 checks (no already-registered wording, claimed an email was sent, no reset link). Green after the change: 31 checks, clean. Helper tests 4 of 4 pass.

## UX compliance
- Laws 14/15: the form and typed address are preserved; the message says in plain language what is true (the address has an account) and gives the two next steps. Law 3: links reuse /login and /auth/reset-password wording from the login page.
- Law 2: links are inline-block with 7px vertical padding and 20px between them; the leg runs the word-break and clipping checks at 375 and 1440 on the new state. The full law-2 floor stays under the dated L9 baseline for auth pages.
- DP: no new component family beyond one small part composed of an existing banner; no new colours or type sizes.

## NOT done
- No F35 registration: no registered row component changed. No F28 marker: none of the touched files is a governing file (checked family.json files).
- tsc and lint left to CI.
