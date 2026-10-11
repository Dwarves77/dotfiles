# 2026-10-11, lane E1b (e1b-audit-walk): the signed-in site walk, run by CI because only CI holds the smoke account

## Accomplished

1. `fsi-app/scripts/verify/audit-walk.mjs` (new): signs in once with the live smoke's own `signIn` and `preflight` (imported from `.discipline/rendering/live/`, no second copy), derives the route list from the `page.tsx` files under `src/app` (static routes as they are, dynamic routes resolved to one real instance from the nearest static ancestor page, admin instances never resolved), then records per page and viewport: status, title, h1, headings, empty-state texts, console errors, failed requests, bad responses, horizontal overflow, a screenshot and the body text. Signed in: the dashboard, the five surfaces and one instance per dynamic kind at 1440 and 375, every other static route at 1440. Anonymous: every static route at 1440 (records the sign-in gate).
2. Interaction pass (operator addendum): per surface, desktop, read-only: open the first list row and record the detail route and headings; apply one filter and one sort chosen by accessible name (row count and first row before and after); expand every collapsed section on the detail and record empty-state texts; follow one cross-surface link from the detail (the spec 08 section 7 human test) and record where it lands or dead-ends; screenshot each state; the detail again at 375. Never clicked: any control whose name matches `FORBIDDEN_NAME` (the operator's nine words plus the other write verbs). Every non-GET request to the app origin is aborted and counted (`blockedWrites`), so nothing a click triggers can write.
3. `.github/workflows/live-smoke.yml`: a `walk` boolean `workflow_dispatch` input (default false) and two steps gated on it: run `audit-walk.mjs` with the `LIVE_SMOKE_*` secrets the smoke step already uses, then upload the output directory as artifact `audit-walk` (retention 1 day). Nothing else in the file changed.
4. `fsi-app/scripts/verify/audit-walk.test.mjs` (new, 16 tests): route derivation, instance resolution, visit plan, row shaping, summary, the do-not-click list, the filter and sort pickers, cross-surface link choice, landing classification, interaction shaping.

## Read and reused

Read: `live-smoke.mjs`, `live-preflight.mjs`, `live-content.mjs`, `live-assertions.mjs`, `live-smoke.yml`, the SMOKE-1 to SMOKE-5 logs, `route-policy.ts`, `proxy.ts`, spec 07, spec 08 section 7, the E1 register and its scratch script. Reused: `signIn` and `preflight` from the live smoke (the sign-in form, the host allowlist), the artifact upload shape of the smoke's own report step, the `data-*` hooks (`#across-pages`) the smoke already asserts. `settle` in live-smoke.mjs is not exported and was not touched (live-smoke.mjs is a governing file of the live-smoke family); the walk waits for network idle inline.

## Red then green and execution

- `node --test fsi-app/scripts/verify/audit-walk.test.mjs`: 16 pass, 0 fail.
- `node fsi-app/scripts/verify/audit-walk.mjs --plan`: prints the derived plan (43 static routes, 8 dynamic patterns). [CONFIRMED]
- Browser pass proven against a loopback fixture (scratch, `fsi-app/scripts/tmp/e1b/fixture-interact.mjs`): a list with a sort select, an "Air" filter, a "Save filter" button that POSTs, a detail with a collapsed "Penalties" section, a "Delete notes" expander, a details element and a cross-surface link. Result: filter "Air" chosen (2 rows to 1), "Save filter" never clicked, sort changed the first row, 2 sections expanded, "Delete notes" skipped, cross link landed on /market/m1, detail at 375 clean, zero POSTs reached the server. [CONFIRMED]

## Decisions

- The walk runs under `!cancelled()` so a red smoke step does not suppress it: it is evidence, not a verdict.
- Dynamic admin routes are not resolved: the smoke account is never a platform admin.
- The walk is dispatch-only (`walk` input). It does not run on `deployment_status`, so it adds no cost to the automatic smoke.

## Not done

- The first real run: the executor merges, dispatches `live-smoke.yml` with `walk=true`, and the E1 register's 38 UNPROVEN rows are finished from the artifact. [WORK: e1b-register-finish]
- A cross-surface link is looked for inside `#across-pages` first, then in `main`; a detail that offers none is recorded as "offers no link", which is the finding the spec 08 human test asks for. [NOT-WORK: the walk records it, no action in this lane]
