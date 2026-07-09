# Full-Pipeline Conservation Audit — 2026-07-09

Read-only census + mechanism trace of the whole pipeline, one boundary at a time. Ruling requested:
reconcile each finding **against the standards already in place** (the built gates), not new ones.

## The principle (recorded)
**Data obeys conservation.** Nothing appears without a source event; nothing vanishes without a
disposition record; nothing exists twice. Every stage boundary (source → capture → pool → synthesis →
sections → claims → provenance → validation → surface → render) must conserve. Every defect this
program has found is a conservation violation at one boundary — this audit checks them all at once.

## The stage-loss table (the core artifact)

| Stage | Count | Loss at boundary | Class |
|---|---|---|---|
| Sources registered | 1,193 (746 active) | — | — |
| Provisional pending → promoted | 489 → **0** | 489 never promoted | **(iii) UNEXPLAINED → BUILD GAP** (no promotion mechanism) |
| Items with stored pool (>200ch) | 352 | — | — |
| Items minted (all-time) | 654 | — | — |
| → archived | 366 | 315 with disposition / **51 without** | 315 = (i) recorded; **51 = (iii) UNEXPLAINED** |
| → live | 288 | — | — |
| Live → has full_brief | 288 → 280 | 8 (5 verified + 3 quarantined) | **5 verified-no-brief = (iii) UNEXPLAINED** |
| Verified with brief → has sections | 240 → 240 | 0 | conserved |
| Verified → has claims | 240 → 240 | 0 | conserved |
| Claims total | 8,773 (FACT 7,116 / GAP 1,074 / ANALYSIS 583) | — | — |
| FACT claims → have source_id | — | **710 FACT claims (on 73 verified items) have NO source** | **(iii) UNEXPLAINED → the moat finding** |
| Verified → passes CURRENT gate | 240 → 177 | **63 fail** `validate_item_provenance` (mig-158) | **(ii) known hold** (correction rides re-validation, loop OFF) |
| Verified → on a surface | 240 → 240 | **0 no-surface, 0 off-surface** | conserved (exactly-one-surface proven) |

## Axis 1 — MISSING
- **489 provisional sources, 0 ever promoted.** Sourced-never-promoted. No cron/worker promotes
  `provisional_sources` → active `sources` (root-cause-audit confirmed). **BUILD GAP.**
- **5 verified items with no full_brief** — verified-but-empty; how they verified with no brief is a
  boundary violation. **UNEXPLAINED** (investigate; likely legacy/status-set-without-generation).
- **29 of 103 verified reg-family items have no timeline** (mig-240 harvest didn't parse them; 4 are
  the known §14-unparseable holds). INCOMPLETE.
- **No key-figure store exists at all** — 0 tables, 0 columns. Key-figure extraction never ran because
  there is nowhere to write it. **BUILD GAP** (U-06).
- **Identified-then-dropped sources:** 97 of 103 reg briefs carry a "New Sources Identified" prose table
  naming real, un-registered sources (e.g. DG ENV PPWR deck). Never registered/fetched. Seek-more candidate.

## Axis 2 — INCOMPLETE
- **710 FACT claims (no source) across 73 of 240 verified items (30%).** All 710 are FACT (checked —
  none are the by-design source-free GAP/ANALYSIS). A FACT claim must trace to a source. **This is the
  central finding.**
- **432 reg-family FACT claims grounded below the T2 authority floor** (source present but sub-floor).
- **63 of 240 verified items fail the current gate** — the exact data-vs-standard gap.
- Truncation/completeness flags: ~27 open (`truncation-guard` 2 + `completeness-exposure` 25), each
  event-bound to re-ground at hold-lift.

## Axis 3 — DOUBLED
- **Instrument-identity dedup: 0 dups** among live/verified/quarantined/archived — BUT the
  `instrument_identifier` key is **95% empty** (13 of 288 live items populate it), so that guard is
  largely inoperative; dedup is actually held by **source_url uniqueness (0 dup URLs — clean)**.
- **Content near-dup: 4 candidate groups** (same jurisdiction + title-stem). Reported for ruling, NOT
  auto-deleted (Fit-for-55 lesson: package-topical pairs are legitimately distinct).
- **Render/cross-surface: conserved** — 0 no-surface, 0 multi-surface-domain → exactly-one-surface for all.
- **Claim-level: 166 duplicate claim rows** (75 groups) — same item + section + span stamped 2+ times.

## Axis 4 — WHY (defect-class table, mechanism not symptom)

| # | Class | Mechanism (stage / path) | Blast radius | Guard status | Class-kill (reconcile to standard) |
|---|---|---|---|---|---|
| 1 | Unsourced FACT on verified items | criterion-3 authority floor was **conditional on the model's own `priority`** → LOW/MODERATE items verified without the floor | 63 items / 710 claims | **GUARD GAP — FIXED** (mig-158 unconditional floor); correction rides re-validation, loop-OFF gated | **Re-ground the 63 from their stored pools** → re-attribute FACT claims → re-validate. All 63 pool-recoverable (0 need a fetch). |
| 2 | Provisional never promoted | no cron promotes `provisional_sources`; only a human admin button | 489 | **BUILD GAP** | Wire autonomous promotion (loop-flip wave, operator-gated) |
| 3 | Quarantine not drained | `regen-quarantined.mjs` is manual-only, not cron-wired | 48 | **BUILD GAP** | Cron-wire research-or-erase (loop-flip wave) |
| 4 | Unexplained archives | early archive path didn't require `archive_reason` | 51 (all unverified) | **GUARD GAP** (historical) | Backfill disposition reason |
| 5 | Duplicate claim rows | grounding step not idempotent on (item, section, span) | 166 rows | **GUARD GAP** | Dedup rows + add a unique constraint |
| 6 | Instrument-dedup inoperative | `instrument_identifier` 95% unpopulated | 275 items | **GUARD GAP** (mitigated by URL uniqueness) | Backfill identifier from parsed instrument, or ratify URL-uniqueness as the dedup SoT |
| 7 | No key-figure store | never built | all items | **BUILD GAP** | Design + build the store + extraction |
| 8 | 5 verified-no-brief | status set without a generated brief | 5 | **GUARD GAP** | Re-generate or quarantine (investigate first) |

## Remediation program (reconcile against current standards) — ranked by customer impact

1. **[HIGHEST — customer-facing accuracy] Re-ground the 63 unsourced-FACT verified items** to the
   mig-158 standard. All 63 recover from stored pools → **zero fetches, scrape-hold-safe**, Sonnet-only.
   Recovers proper source attribution (fixes accuracy WITHOUT losing the items). **SPEND QUOTE: ~63 ×
   $0.15 ≈ $9.50** — over the $5 line → **your go-line** (batch-spend gate).
2. **[NOW, zero-spend, guarded]** Dedup the 166 duplicate claim rows (keep earliest; idempotency
   standard) + backfill the 51 unexplained archive dispositions. Executing these under this dispatch.
3. **[operator/loop-flip-gated]** Provisional promotion (489) + quarantine drain (48) — genuine BUILD
   GAPS; the drain wiring rides the loop-flip wave (your switch).
4. **[design]** Key-figure store (BUILD GAP) — needs a design pass, not a hotfix.

## Reconciliation status (2026-07-09)

**Executed now (guarded, zero-spend):**
- **Dedup — 88 exact-duplicate claim-provenance rows removed** (74 byte-identical groups, keep-earliest;
  `section_claim_provenance` 8,773 → 8,685). The **3 remaining span-dups are genuine attribution
  CONFLICTS** (differing source/kind) — left for your ruling, NOT deleted (they may be two real sources
  for one span, or a FACT/ANALYSIS split). Moat data intact.

**Gated by the credential-binding guard (the moat write-protection working):**
- Any `intelligence_items` UPDATE that would flip provenance is refused for `current_user=postgres` by
  `guard_provenance_flip()` — writes must run through the **bound reconciler credential** (the app/script
  path; operator-controlled per the Phase-2 residual). **This is a guard firing CORRECTLY** — the
  anti-example on the defect-class table. Consequence: provenance reconciliation (the 63 re-ground + the
  51 archive-reason backfill, which now recommends quarantined under mig-158) **cannot run via MCP** — it
  requires the reconciler path. The 51 backfill is low-value → deferred.

**Quoted — needs your go-line (batch spend + reconciler credential):**
- **Re-ground the 63 unsourced-FACT verified items from their stored pools.** All 63 are pool-recoverable
  → **ZERO fetches (scrape-hold-safe), Sonnet-only.** Recovers proper source attribution → re-validate →
  recovered items re-pass mig-158; the genuinely-ungroundable honestly quarantine. **SPEND ≈ 63 × $0.15 ≈
  $9.50** (over the $5 line). Runs through the reconciler-cred script path, not MCP.

## Related
- [[root-cause-why-the-queue-2026-07-08]] — the "detection built, drain not" frame this quantifies
- [[site-gap-register-2026-07-09]] · [[deletion-reclassification-log]]
