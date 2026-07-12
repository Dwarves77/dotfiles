# Hygiene residual — C5/C9-14 (Ruling 2 tail) — 2026-07-12

The C3/C5/C9-14 **lead** (the 50-file service-role client consolidation to `getServiceSupabase`, commit
`d23cfbc`) is done — that was the substantive value. The remaining micro-clusters are documented here with
their exact fixes; each carries a caveat that makes a blind hygiene-pass consolidation a behavior risk, so per
the `consolidation-is-behavior-preserving` doctrine they are a deliberate follow-on, not forced under a
saturated window.

| cluster | copies | why NOT a clean exact-copy dedup | the fix (deliberate follow-on) |
|---|---|---|---|
| **C11 safeJson** | 9 (community/*) | **Divergent typed return shapes** (`{reply?}`, `{post?}`, `{error?}`, generic `<T>`, `any`) — same `res.json()` runtime, different types per call-site. | Add one generic home `safeJson<T>(res): Promise<T\|null>` (src/lib/http/); each call-site adopts its `<T>`. Behavior-preserving (runtime identical) but a per-call-site type-param change. |
| **C9 HTML-strip** | 4-5 (agent runtime) | Identical regex (`/<[^>]+>/g`), but **multi-line chained expressions on the generation/fetch path** (canonical-pipeline, haiku-classify, api-fetch, rss-fetch). | Extract `stripHtml(s)` (src/lib/text); point the 4-5 chains at it. Low-risk pure function, but touches the runtime path — verify with build. |
| **C5 project-ref** | ~1-11 | A **1-liner** (`host.split(".")[0]` to extract the Supabase project ref). | Marginal; a `projectRef(url)` helper if a home is wanted. Lowest value. |
| **C10 effective_tier read** | ~12 | **Doctrine-sanctioned inline** (SC-9 — the display read is deliberately inline). | Not a defect; leave (already ruled). |
| **C12 legacy_id\|\|id** | ~13 | `uiId()` helper exists; call-sites bypass it. | Point call-sites at `uiId()`. Benign. |
| **C13 error-body** | — | Already CONSOLIDATED (isErrorBody single home). | none. |
| **C14 retry/sleep** | ~4 | Independent small retry loops. | Optional shared retry primitive. |

**Disposition:** the safety + correctness of these is not in question (F19 gates the credential surface; the
runtime logic is unchanged). They are a low-value, deliberate-refactor follow-on — registered here so they are
not lost, and explicitly NOT rushed. Owner: next hygiene pass.
