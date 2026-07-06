# Transport Escalation Matrix — read-only audit of TODAY's unified transport (2026-07-06)

Standing dispatch, deliverable 1. A read-only audit of the CURRENT unified transport
(`canonical-pipeline.ts::fetchWithTransport`, the single primitive that delegates to direct-HTTP /
Browserless / try-both), per failure class, followed by the decisive write-side finding and the ladder this
dispatch adds (RD-14). No behavior claim below is speculative — each cites `file:line`.

## The unified transport as it stands (before RD-14)

- `fetchWithTransport(url, max, {dropIfBlocked})` — `canonical-pipeline.ts:110`. Order: direct-HTTP first for
  eligible legal hosts (`directFetchEligible`, `:70`) → Browserless escalating plain→stealth→unblock
  (`canonical-fetch.mjs:116`) → TRY-BOTH plain-HTTP fallback for any host (`:126-127`).
- `fetchMeta` (corroborator) passes `dropIfBlocked:true` (`:135`) → a still-blocked result returns `text:""`
  (`:128`) and is filtered by the `>200ch` pool bar.
- `blFetchClean` (primary) KEEPS a blocked body (`:404`) so `fetchPrimaryWithFallback`'s `detectRoadblock`
  (`primary-fallback.mjs:53`) sees the reason and runs the bounded official-alternative web search
  (`primary-fallback.mjs:161`).

## Per-failure-class matrix (TODAY)

| Failure class | Where classified | Alternate transport tried? | Stored as content? | Marked? |
|---|---|---|---|---|
| **HTTP 404 / 410** (primary) | `detectRoadblock` `http_4xx` (`primary-fallback.mjs:58`) | Yes — bounded alt-search (`primary-fallback.mjs:161`) | No if all alts fail (`ok:false, text:""` `:172`) | Fetch-status `blocked` behind mig 147 (`canonical-pipeline.ts:418`) |
| **HTTP 404 / 410** (corroborator) | `detectRoadblock` via `fetchMeta` | No (corroborators aren't alt-searched) | No — dropped `>200` filter (`:128,:594`) | No |
| **403 / Access-Denied** | `detectRoadblock` `challenge_stub` (head ≤600, `:65`) OR Browserless `looksBlocked` (`canonical-fetch.mjs:107`) | Yes — try-both plain fallback (`:126-127`) | **See decisive finding** | Fetch-status `blocked` (mig 147) |
| **5xx** | `detectRoadblock` `http_5xx` (`:58`) | Yes — alt-search (primary) | No if unresolved | Fetch-status `blocked` (mig 147) |
| **cdn_block / bot-wall body** | `detectRoadblock` `cdn_block` (head ≤300, `:79`) / `challenge_stub` | Yes — try-both plain fallback (`:126`) | No (corroborator dropped; primary → alt-search) | `cdn_block` fetch-status (mig 147) |
| **JS-shell / soft-404 (200 + error body)** | `detectRoadblock` `soft_404`/`empty_stub` (head ≤300, `:71`) | Try-both plain fallback | **See decisive finding** | `soft_404` fetch-status (mig 147) |
| **Request-Access hosts** (federalregister/eCFR) | NOT caught by `detectRoadblock` (permission wall, not a challenge marker) | Try-both plain (same wall) | **See decisive finding — the real leak** | No |

## THE DECISIVE QUESTION — when BOTH transports fail, does the capture layer STILL STORE the error body?

**Before RD-14: partially YES — that is the 193-junk mechanism, and RD-13 only masked it.**

- The READ-side gate RD-13 (`canonical-pipeline.ts:864`, `partitionErrorBodies`) prevents an error body from
  being **grounded**. But it runs at ground time on the ALREADY-STORED pool.
- The WRITE path stored `fetched` content gated only by `>200ch` (`:621` `poolRows`, `:717` refresh, `:883`
  ground-fallback). **`detectRoadblock` and `isErrorBody` are DIFFERENT detectors and disagree.**
  `detectRoadblock` scopes its markers to the head (`≤300` cdn/soft-404, `≤600` challenge); `isErrorBody`
  scans `2500ch` and trips on `≥2` distinct markers. A nav shell whose `403 Forbidden` / `Access denied`
  markers sit **past char 600** reads as `roadblocked:false, reason:"ok"` to `detectRoadblock` → the primary
  path returns it as content → it is **STORED** as `result_content_excerpt`. RD-13 then refuses to ground it,
  but the junk is already in `agent_run_searches`.
- The **Request-Access wall** (federalregister/eCFR HTML) is caught by NEITHER `detectRoadblock` (no challenge
  marker) NOR `isErrorBody` (its marker set has no "request access" / "you don't have permission to access"
  signature) → it was stored AND could be grounded (only mitigated by low span-match luck).

**After RD-14: NO — the write side refuses.** `captureForStorage` (`transport-escalation.mjs`) is applied at
every pool-INSERT site (`canonical-pipeline.ts` generate `:596`, refresh, ground-fallback) BEFORE the INSERT.
A capture is excluded when `isErrorBody` flags it **OR** the transport classifier deems it a failure (the
capture-time SUPERSET — it also catches the Request-Access wall + JS shell `isErrorBody` misses). An error
body is **never stored as source content**; a junk-only capture **HOLDS** `NO_REACHABLE_SOURCE` (event-bound
to re-fetch at hold-lift) rather than fabricating a brief over an error page; excluded captures are SURFACED
as a `source_issue` integrity_flag (`surfaceCaptureExclusions`), never silently dropped.

## The RD-14 escalation ladder (per class, mechanical — `transport-escalation.mjs`)

- **(a)** canonical-URL cache first (RD-11 `fetch-hold.mjs`, injected `cacheGet`).
- **(b)** block / bot-wall on one transport → try the OTHER, in EITHER direction (proven for the 403 class,
  not only `cdn_block`).
- **(c)** JS-shell / soft-404 (a 200 client-render placeholder) → the Browserless render path.
- **(d)** API host (federalregister.gov + eCFR) → the OFFICIAL JSON API, never the HTML page (`apiEndpointFor`).
- **(e)** genuine 404/410/soft-404 after the ladder → a SEEK-MORE task (alternate-URL discovery), NEVER a
  stored error body.
- **(f)** ladder exhausted on blocks → record the verdict (`sources.fetch_status` when mig 147 lands; the
  integrity_flag pattern until then) + item HOLDS `NO_REACHABLE_SOURCE`, event-bound.

**Doctrine (skill category 13):** transport failure is never terminal and never stored; quarantine is the
honest state only for genuine ungroundability after mechanical exhaustion, named and event-bound, never a
fetch-failure artifact.

## Scope note
`escalateFetch` is the TESTED decision module (transports dependency-injected; no real fetch in tests). The
live runtime fetch primitive remains `fetchWithTransport`; **the write-side capture gate IS wired live** at
the pool-INSERT sites (the class kill). The seek-more (e) durable queue + the `fetch_status` verdict (f) land
with the hold-lift re-fetch batch + migration 147.
