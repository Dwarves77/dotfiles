# GATE A — the truth basis (2026-07-14)

The three tables the operator ruled are the input to everything after: the re-diagnosed quarantine
population, the wiring-findings, and the dormant-list action status. Produced through the COMPLETED ladder
(Unit 1 wired the discovery rung), $0 — no fetch, no LLM. My single reply from the operator authorizes Unit 3
(the fetches/re-collections) or parks it.

Sources: [acquisition-ladder-post-mortem](../audits/acquisition-ladder-post-mortem-2026-07-14.md) ·
`scripts/quarantine-rediagnose.mjs` → `scripts/tmp/quarantine-rediagnosis.json` ·
[holdings audit](../audits/rd33-retro-apply-2026-07-14.md). doc-numbers-reference-queries.

## TABLE 1 — Re-diagnosed quarantine population (32 live quarantined items)

**The reframe, corrected by the completed ladder:** the operator's hypothesis was "most of quarantine is
content the system never went and got." The completed ladder shows the DOMINANT class is actually
**reattribution debt (21/32, 66%)** — items that DO hold floor-qualifying content AND a full ledger, held
sub-floor on the authority-floor/attribution issue. Only **~11 are genuinely reach-related.** Data reach DID
fail silently — but on ~1/3 of the set, not most of it.

| TRUE blocker | count | what it means | action (Unit 3) | cost class |
|---|---|---|---|---|
| **reattribution_debt** | 21 | covers_grounding + full ledger (17–75 facts) held sub-floor — content is HELD and grounded | floor-first re-attribution / relabel — **NOT a fetch** | **$0** (its own unit) |
| **needs_discovery_fetch** | 3 | machine-derived candidate exists (identifier resolves) | fetch the candidate → ground | cents-class fetch |
| **wrong_url** | 1 | discovered candidate DIFFERS from the held source URL (eu_clean_trucking: ELI held, CELEX derived) | re-point → fetch candidate | cents-class fetch |
| **needs_search** | 4 | no machine candidate yet — open-web/title (or an IMO resolver) required. **NOT "absent"** until N×M logged (referenced-law-exists) | open-web discovery → fetch | cents-class + search |
| **truncated** | 2 | standards held large but sub-floor (c8, green-building) | re-collect via fetch-align-diff engine | cents-class fetch |
| **language** | 1 | g14: Spanish gazette, 956KB clean held, 0 claims — extraction failure, URL fine | non-EN extraction fix (named capability gap) | $0 fetch; build |

**Projected fetch plan (Unit 3, cheapest-first per run-structure):**
- Tier (a) **re-point + candidate fetches** = wrong_url (1) + needs_discovery_fetch (3) = **4 cents-class fetches** (identifier resolves the URL — the highest-yield, cheapest fixes; includes the eu_clean_trucking proof).
- Tier (b) **open-web discovery fetches** = needs_search (4) — discovery search then fetch (includes australia-NEV, g19, c5, MEPC.377(80) which needs an IMO resolver).
- Tier (c) **re-collections via the diff engine** = truncated (2).
- **language (1)** = a build (non-EN extraction), not a fetch — flagged.
- **reattribution_debt (21)** = the $0 relabel unit — runs WITHOUT any fetch; the single largest lever, and it costs nothing.

Proof-set placement: **eu_clean_trucking → wrong_url** (re-point to CELEX 32024R1610 — machine-derived, candidate_differs=YES ✓); **la-eweo → needs_discovery_fetch** (amlegal shell; discovery has a candidate); **g14 → language**; **australia-NEV → needs_search**.

## TABLE 2 — Wiring findings (WIRING TRUTH SWEEP + this dispatch)

| edge / capability | pre-07-14 | now | status |
|---|---|---|---|
| discovery rung on fetch failure | title-only shadow | identifier-driven `generateCandidates` wired one-home | **CLOSED** (#333) |
| durable exhaustion record (earth-exhaustion/RD-15) | not persisted | `persistPrimaryExhaustion` at exhaustion point | **CLOSED** (#333) |
| furniture detector inline at capture | not inline | `looksLikeFurniture` in `captureForStorage` | **CLOSED** (#333) |
| `webSearchAlternatives` title-only shadow | live | retired into the one home | **CLOSED** (#333) |
| behavioral flow-golden for the ladder | none | `reground-ladder.golden.test.mjs` | **CLOSED** (#333) |
| `runSeekMore` orchestrator | 0 callers | still 0 (discovery wired via `generateCandidates` directly) | **OPEN** — reconcile or retire |
| `source_conflicts` writer (`openSourceConflict`) | 0 callers | 0 callers; `evaluateDemotion.critical_conflict` stub unfed | OPEN (disposition-adjacent) |
| `/api/admin/sources/verify` pause gate | none | none (caller-less) | OPEN (spend-latent) |
| `surface-visibility-audit.mjs` re-run | unwired | unwired | OPEN (governance) |

## TABLE 3 — T8 dormant-list action status (seek-more's siblings)

Seek-more's true siblings — built/ruled, no named wake, unactioned like seek-more was:

| dormant entry | status | note |
|---|---|---|
| `runSeekMore` | **UNACTIONED** | superseded by direct `generateCandidates` wiring; the one home unifying discovery+persist+capture — reconcile or retire |
| `persistExhaustionRecord`/`exhaustionFlagRow` | **WOKEN** (this dispatch) | wired via `persistPrimaryExhaustion` |
| `generateCandidates` + resolvers | **WOKEN** (this dispatch) | `fetchPrimaryDeep` |
| `openSourceConflict` → `source_conflicts` | UNACTIONED | conflict-driven demotion never produced |
| `surface-visibility-audit.mjs` | UNACTIONED | not in lane, not in invariants |
| dead exports/routes/RPCs (auditSections, checkFetchQuality, notifications trio, dead RPCs, trajectory_points read-no-writer) | UNACTIONED (minor) | non-spend, non-disposition |

## The ask (GATE A)

**Nothing fetched. $0 spent this dispatch.** Awaiting the operator's ruling to run Unit 3 (or park it):
1. Authorize the fetch plan above (4 cents-class re-point/candidate fetches first, then 4 open-web discovery, then 2 diff-engine re-collections)? Or a subset / different order?
2. The **21-item reattribution_debt** class is $0 (relabel/re-attribution, no fetch) — run it now as its own unit regardless of the fetch ruling?
3. The **language** (g14 non-EN extraction) and **runSeekMore reconcile-or-retire** items — build now, or backlog?
