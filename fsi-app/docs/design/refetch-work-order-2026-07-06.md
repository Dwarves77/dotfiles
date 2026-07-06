# Re-Fetch / Re-Ground Work Order — hold-lift day (2026-07-06)

Standing dispatch item 5. The first FETCH batch after Jason rules cadence (lifts `SCRAPE_HOLD`). All items carry
an open `completeness-exposure` integrity_flag (45 emitted, guarded, idempotent) so the queue is the durable home.
**Browserless spend is quoted from the list size BEFORE the batch runs** (Prototyping plan 20k units/mo — conserve).

## Root cause on record
The capture layer stored **failed fetches** (Cloudflare/Radware bot walls, 403/Access-Denied, federalregister/eCFR
"Request Access" blocks, 404s, EUR-Lex nav shells) as "source content." 193 of 206 short captures (94%) were failed
fetches; corpus-wide **51+ FACT claims across 27 items (23 verified)** grounded to error bodies. This — not size caps
— is the data-collection defect. The error-body groundability gate (RD-13) now prevents FUTURE junk-grounding; this
work order re-collects the EXISTING inputs.

## Disposition groups

### A. RE-GROUND now (cheap, NO fetch) — cat-2 (17 items)
Their content is COMPLETE, just >12 KB (silently truncated at ground time by the old cap). Post the category-2 fix
(#193), **re-queue for ground-only** — no re-fetch, ~$0.15–0.40/item. These re-enter the payable set immediately.

### B. RE-FETCH at hold-lift, grouped by host strategy

| Strategy | Hosts | Action | Count |
|---|---|---|---|
| **(a) seek-more** | eur-lex.europa.eu 404s / portal URLs | the stored URL is dead/portal — search for the correct CELEX/instrument URL, then fetch | cat-3B 404s (2, named-breach already invalidated) + eur-lex portal captures |
| **(b) transport-fallback / deprioritize** | iea.org, iata.org, adb.org, itf-oecd.org, sciencedirect.com, ilo.org, iopscience, smartfreightcentre, un.org, c40.org, spglobal, congress.gov | bot-walled — try the transport-unit stealth fallback; if still blocked, **deprioritize** (secondary/corroborator, not primary) | ~16 error-body items + bot-walled stubs |
| **(c) Browserless render (JS-required)** | customs.go.jp, gob.mx, portwatch.imf.org, sdgs.un.org | body is behind JS — the Browserless render path (not plain fetch) | ~4 (customs.go.jp ×2, portwatch, ARPA-E) |
| **(d) API-not-HTML** | **federalregister.gov, ecfr.gov** | these have OFFICIAL APIs — fetch structured JSON via the API, NOT the HTML page (the HTML returns "Request Access" to scrapers). **Wire an API transport into the transport unit.** | federalregister recurs ~8× + eCFR |

### C. Fragments / truncated-at-cap
- **cat-1 (7)** — near-cap captures (2 quarantined, 5 verified): re-fetch the full document (the tail was lost to an old cap).
- **cat-3 fragments (8)** — real authoritative host, body behind nav/JS (ksrevisor, globalpetrolprices, latransportationplan, dieselnet, portwatch, customs.go.jp ×2, arpa-e): re-fetch.
- **cat-3B enacted suspects (3 live)** — a4 (SAF Order), eu-battery-regulation, 474ab4cd (energy-efficiency): re-fetch the full enacted text (stored as summary/preamble).

## The (d) API note for the transport unit
`federalregister.gov` and `ecfr.gov` return a "Request Access" scraping block on the HTML path but expose **official
JSON APIs** (`www.federalregister.gov/api/v1/...`, `www.ecfr.gov/api/...`). The transport unit's re-fetch path should
**prefer the API transport for these hosts** — deterministic, unblocked, structured — over Browserless HTML render.
This is a small addition to the transport unit's transport-selection (host → API-fetch vs Browserless vs direct-HTTP).

## Verified-exposed disposition (ruling on record)
The 23 verified error-body-grounded items are **flagged, NOT preemptively re-quarantined** (dispatch ruling). Status
changes on EVIDENCE only: re-fetch (or re-ground for cat-2) → re-validate → the item stays verified if its real FACTs
cover the slots, else quarantines honestly. The 2 named breaches (355af9e8, 6f1e6615) were the exception — their
"Page Not Found" FACTs were invalidated immediately; both remain legitimately verified.

## Durable home
Migration 147 (`sources.fetch_status` ∈ ok/cdn_block/soft_404/blocked/error) — pending Jason's DDL window — persists
each transport's verdict, so the NEXT audit reads a column instead of re-adjudicating 2,097 captures. The error-body
gate reads `isErrorBody` at read time until then (render-derive).
