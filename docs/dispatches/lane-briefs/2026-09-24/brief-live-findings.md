# Live findings after the close, 2026-09-24 (coordinator): three defects for the fresh session. Read with the AUTH-IDENTITY brief; this file adds to it.

Live checker: `fsi-app/scripts/tmp/live-check.mjs` (gitignored). It is Playwright headless on the operator's saved session. The session file is outside the repo, in the coordinator scratchpad as `live-session.json`; its contents are never printed or committed. Usage: `node fsi-app/scripts/tmp/live-check.mjs /route ...`. When the site login expires, the operator signs in again through `live-signin-check.mjs` (a headed window; the operator types, agents never do). The app's built-in browser pane is also signed in and may be read.

## 1. The identity shown is not the signed-in identity (folds into lane AUTH-IDENTITY; P0 to verify)

The operator signed into Playwright's browser by hand as jasonlosh@hotmail.com (the operator's screenshot of the form). Results [CONFIRMED by the agent's DOM read]:
- The nav footer reads `jasonlosh@gmail.com · owner`.
- The nav has no Admin link.
- `/admin` loads without a redirect and shows "PLATFORM ADMIN".

`requirePlatformAdmin` admits only a profile with `is_platform_admin = true`. Only hotmail (`2b7d21eb-...`) has that; gmail (`a0764ff3-...`) is false [CONFIRMED by SELECT]. So the server session is hotmail, and the footer shows a different account's email [HYPOTHESIS: it comes from something other than the auth user, e.g. an org-owner or membership lookup that picks the first owner of "Dietl / Rockit"; both accounts are owners there].

Earlier the same day, the in-app browser pane showed an Admin nav link on the same site. The nav therefore differs between sessions with the same data, which is consistent with the single-shot identity defect in the AUTH-IDENTITY brief.

To do:
- Trace the footer email's source and the nav's `userRole` source to file:line.
- Every displayed identity field must derive from the authenticated user id, never from an org-level or membership pick.
- Test with two owner accounts in one org: each sees only its own email.
- Use `live-check.mjs` before and after the fix.

## 2. Sign-in page title breaks one letter per line (new lane MASTHEAD-AUTH)

On `/login`, in the AuthFrame right panel, the shared Masthead title "SIGN IN" renders one letter per line [CONFIRMED by the operator's screenshot]. This is a regression from lane W10-Masthead (#786), which put the Masthead on the auth frame. The rendering guard passed it twice.

Cause [HYPOTHESIS]: the title box collapses (a flex or grid item squeezed by an empty slot or a min-width). To do:
- Measure the title's box at 375, 1024 and 1440 with Playwright.
- Fix it in `Masthead.tsx` or the AuthFrame part, never with a page override.
- Check `/login`, `/signup` and onboarding.

Class fix in the guard: a new rule fails any heading or title whose content box is narrower than its longest word, i.e. it breaks inside a word. It is proven by attack: it must FAIL on master before the fix and PASS after. Never edit the baseline to pass it. The next free rule and fitness ids are in the 2026-09-23 entry (RD-82 / F55).

**Font check (operator reminder, 2026-09-24: the build was using the wrong font).** G3 / RD-80 made the guard measure with real fonts. Before trusting any guard PASS on this part, prove which faces were actually rendered:
- In the guard's mount and on the live site, read `document.fonts` (status and loaded faces) and the computed `font-family` of the Masthead title, eyebrow and dek on `/login`.
- Compare them with the faces the design names (Anton for titles; the body face per the README).

If the guard or CI measured with a fallback face, a narrower fallback could hide exactly this wrap. Then the fix includes a guard precondition that FAILS when a declared face is not loaded (no measurement on fallbacks), shown failing first. Also report whether the live site loads the right faces on every route family, with file:line of the font declarations.

## 3. A regulation link resolves to a page that does not exist (triage in the live regulation check)

`/regulations/d2da85da-0912-497a-b645-31e4ca73cd18` redirects to `/regulations/uae-national-net-zero-by-2050-transport-sector-roadmap`, which renders the H1 "This page doesn't exist" [CONFIRMED by a Playwright navigation].

This is the page named in ruling 6. Find out why the id resolves to a slug the detail route cannot load: a slug mismatch, a filtered or unpublished status, or a route query. Fix it at the cause. Also add a check that every slug the id-redirect can emit loads a detail page.

## Order for the fresh session (replaces item 0 of the 2026-09-24 close entry)

0. AUTH-IDENTITY with finding 1 folded in.
0b. MASTHEAD-AUTH.
1. The live regulation check, starting with finding 3.
2. The rest as listed in the close entry.
