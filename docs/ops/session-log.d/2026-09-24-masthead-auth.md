# 2026-09-24, lane MASTHEAD-AUTH (brief-live-findings.md finding 2)

Branch `lane/masthead-auth` from `origin/master` 44187dfa. Ids consumed: RD-82 (invariant, skill
category 51). RD-83, F55 and F56 not used.

## Accomplished

- **Measured cause [CONFIRMED, real chromium on the guard's own compose mounts AND read-only on
  carosledge.com, logged out].** `Masthead.tsx`'s `@media (min-width: 1440px)` grid
  (`minmax(0,1fr) 420px`, the command bar's column) applied by viewport width to every masthead,
  including the auth frame's right panel, which renders no command bar in a 330px row. Title
  content box at a 1440 viewport: /login 0.0px against "SIGN" 51.3px, /signup 0.0px against
  "ACCOUNT" 99.9px, onboarding 26.0px against "FREIGHT?" 103.8px; `word-break: break-word` then
  broke every word at every letter. At 1024 (330px / 365px) and 375 (93px / 270px) the title fit.
  Live and guard mount agreed to the tenth of a pixel. The brief's hypothesis ("squeezed by an empty
  slot or a min-width") is refined: the squeeze is a reserved empty grid track, keyed off the
  viewport rather than the card.
- **Fix, `src/components/ui/Masthead.tsx`.** The 1440 grid is scoped to
  `.cl-masthead[data-masthead-cmdbar]`, and the header carries that attribute only when a command bar
  renders. After: 330px / 330px / 470px title boxes at 1440, one line each. Mastheads without a bar
  (/community, /market/series, /admin/factors, auth, onboarding) now keep the flex row at 1440, so the
  title takes the whole row instead of the row minus 444px.
- **Found while checking 375, fixed [CONFIRMED live]: the auth frame clipped the whole sign-in form
  off a phone.** `AuthFrame.tsx`'s two-track grid had no narrow form: at 375 the tracks resolved to
  "393.094px 96px", the form panel started at x=393 and the frame's `overflow: hidden` hid it. Below
  768 the frame is now one column (README 0.3 "Below 768 the layout is one column"; Mobile 390 "375
  must not clip"), the form panel first, the identity mark and the disclaimer after it, 16px gutters.
  768 and up unchanged.
- **Class fix in the guard, RD-82.** One detector, `ux-assert.mjs` `detectWordBrokenTitles` plus its
  in-page collector `TITLE_WORDS_SRC` (every `h1..h6` and `[data-guard-title]`, each word measured in
  its own computed face, break opportunities at whitespace and after hyphens), run by: layout-guard
  rule **L13** (every route, 1440 and 1024); `assertUxClean` (so every UX smoke spec, 375 and
  desktop); and a new auth PAGE leg in `auth-onboarding-smoke.mjs` (the real /login, /signup,
  onboarding at 375, 1024, 1440, through the audit's compose mounts), asserting RD-82 and the
  clipped-overflow detector only (the law-2 target findings there are the dated L9 baseline).
  Carve-out: a word wider than the title's whole container (the extreme fixtures' 632 to 778px
  tokens) is the designed last-resort break, not a squeezed box.
- **Proven by attack.** Full rendering guard with master's `Masthead.tsx` and `AuthFrame.tsx` and the
  new guard: FAIL, 9 failures (L13 on /login, /signup, /onboarding at 1440; the auth page leg's RD-82
  on the same three; its clipped-overflow on the same three at 375). After the fix: PASS twice, layout
  guard 0 findings outside the baseline. `rd-82-title-words.npmtest.mjs` re-injects the pre-fix rule
  into the real /login mount and requires exactly the "content box 0px < longest word "Sign" 51.3px"
  finding, then requires none without it. Baseline untouched.
- **Font proof.** Guard mount (compose-login/-signup/-onboarding, 375/1024/1440): `document.fonts`
  loaded, all six declared faces (Jakarta 400/500/600/700/800, Anton 400) loaded; title
  `Anton, system-ui, sans-serif`, eyebrow and dek `"Plus Jakarta Sans", system-ui, sans-serif` (/login
  and /signup pass no dek; onboarding's dek is Jakarta). The title's word widths equal Anton-only
  widths (51.3) and differ from the fallback (67.0), so the guard measured the real face, not a
  fallback. Live (16 routes at 1440 signed in: dashboard, the four list surfaces and a detail page of each
  of regulations/research/operations plus /market/series, /map, /watchlist, /community, /admin,
  /settings, /onboarding, /profile which redirected to the dashboard; and /login, /signup at
  375/1024/1440 logged out):
  status loaded, Anton 400 and Jakarta 400/600/700/800 loaded from `/_next/static/media/*.woff2`
  (Jakarta 500 where used), every masthead title in Anton at Anton widths, eyebrow/dek/body in
  Jakarta. No wrong or fallback face found on any family. Declarations: `src/app/layout.tsx:12-17`
  (@fontsource imports), `src/app/globals.css:8-9` (`--font-jakarta`, `--font-anton`), `:33-34`
  (`--font-sans`, `--font-display`), `:147` (body), `src/app/theme.css:67-68`; guard faces
  `.discipline/rendering/smoke/smoke-fixtures.mjs` `fontFaceCss()`.
- **Precondition added anyway, and proven by attack.** Neither the layout guard nor the new page leg
  had ever confirmed the stylesheet it mounts loaded the faces (RD-80's `assertFontsReady` injects
  first, so it cannot see a missing declaration). `verifyFontsLoaded` (smoke-fixtures.mjs, no
  injection) now runs before every layout-guard measurement (a failure is a harness error, never
  baselined) and before every auth page measurement; its attack test fails it on a page with no
  declarations (all six specs reported) and passes it with the guard stylesheet.

## Corrections made during the lane

- The rule's first run missed /login entirely: its visibility test required width AND height, and the
  defect's title was 0.0px wide by 176px tall. Now either axis. Recorded in RD-82 and category 51.
- First guard run with the rule in `assertUxClean` fired on six extreme-data fixtures (100-character
  unbroken tokens). Refined with the container carve-out, not an allowlist.
- A comment inside Masthead's `<style>` text tripped the guard's thousands check (bare "1440") and
  then React's SSR escaping of the literal string "<style>" (hydration smoke). The explanatory note
  moved to a JSX comment outside the style text.

## Open, owed

- The auth pages' law-2 target findings ("Privacy" 38x13, "Forgot password?" 106x18, the Sign in /
  Create account tabs 39px tall 2px apart, onboarding "+ 78 more jurisdictions" 129x18) are already in
  the layout guard's dated L9 baseline (expires 2026-10-15), owned by AuthPanel / AuthFrame /
  OnboardingWizard; not changed here, per the operator's baseline ruling of 2026-09-09.
- Form-first order on a phone is this lane's reading of ux-laws 1 and 9; logged-out mobile is not
  drawn (handoff README "Not yet designed"). One declaration to reverse if the operator rules
  otherwise.

## UX compliance

- **/login (phone, below 768)**, primary goal: sign in. Path: open /login, the form is the first
  thing on screen (one step, no scroll to reach it). One primary action: "Sign in" (the magic-link
  button stays secondary). Feedback states unchanged: "Signing in…" pending, the error banner with the
  server's message on failure (input preserved), redirect on success; magic link "Sending link…",
  then the check-email panel.
- **/signup (phone)**, primary goal: create an account. Path: open /signup, the form leads. One
  primary action: the create-account submit. Feedback states unchanged (pending label, error banner,
  check-email completion panel).
- **Onboarding (phone)**, primary goal: finish the workspace setup step shown. Path: the wizard panel
  leads the single column; the stepper shows progress (law 11). One primary action per step, as
  before. Feedback states unchanged.
- **/login, /signup, onboarding (1440)**: the Masthead title renders on one line in the right panel
  (it was one letter per line); no change to actions or feedback.
- **Every masthead without a command bar at 1440** (/community, /market/series, /admin/factors): the
  title takes the whole row; no action changed. Mastheads with a command bar: unchanged.
- Law 2: no target added or resized; the existing auth-page target findings are baselined (above).
