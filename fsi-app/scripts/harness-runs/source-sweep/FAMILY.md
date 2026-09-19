# source-sweep family

Moved from `CONVENTION.md` (lane N2, 2026-09-19); meaning unchanged from the original prose, em dashes
and section signs replaced per pre-commit rule 022.

`source-sweep` (RT lane, 2026-09-01), registered over `scripts/turns/run-source-sweep.mjs` and the two
dormant, pure, dep-injected enumeration modules it gives a runtime to for the first time,
`src/lib/sources/register-walk.mjs` (the date-paged EUR-Lex OJ / Federal Register index walk) and
`src/lib/sources/feed-walk.mjs` (the RSS/Atom feed walk): a sixth shape again, whose "runs" are
enumeration passes over a source's index/feed for a date range, writing discovered candidate URLs to the
`portal_link_candidates` ledger (never a mint, never an extraction, never a fetch-drain replay).

**source-sweep's standing metric** (build plan section 2's "measurement, not assertion," per family):
*candidates discovered per walk*, broken down by walker (`register-eurlex` days, `register-federal-register`
pages, `feed` entries) and by disposition (`upserted` vs `failed` in the ledger write), the
enumeration-family counterpart to `fetch-drain`'s capture-success-rate-per-attempt-class. A dry run's plan
and an apply run's actual ledger write are reported as the same shape (`persist`'s injected counting in
dry mode vs its real upsert in apply mode, see `run-source-sweep.mjs`'s own header), so the two are
directly comparable run over run.
