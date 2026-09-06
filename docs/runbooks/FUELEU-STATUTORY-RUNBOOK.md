# FuelEU Maritime statutory rows-file runbook

Lane FUELEU-ROWS, 2026-09-06. Governs `statutory_computations`, the FuelEU Annex IV penalty writer
(`fsi-app/scripts/propagation/write-statutory.mjs`), and the pre-flight gate this lane added
(`fsi-app/scripts/propagation/validate-statutory-rows-file.mjs`). Written against audit finding 3
(`docs/audits/plan-completion-audit-2026-09-05/W3-W4-sourcing-propagation.md` §"§4, FuelEU Annex IV first
statutory writer").

## Legal caveat (read before touching a rows-file)

Every figure this pipeline uses is the regulation's own published input, transcribed verbatim with its
exact article/annex and text span cited per figure — never invented, never rounded beyond what the source
itself states. This is a **transcription**, not a legal interpretation of Regulation (EU) 2023/1805, and
not tax, compliance, or legal advice. The site publishes each figure together with its source and that
source's credibility rating (CLAUDE.md rule 18), so a reader can verify every number against the primary
text themselves rather than trusting the site's arithmetic alone.

## What is real today (2026-09-06) vs. what is not

**Real, verified, in the codebase already (unchanged by this lane):**
`src/lib/statutory/fueleu-annex-iv.mjs`'s formula (Annex IV Part A(a) compliance balance, Part B(a)
penalty, Article 23(2) consecutive-deficit multiplier) and `scripts/propagation/write-statutory.mjs`'s
2025 target (89.3368 gCO2eq/MJ) — both CONFIRMED by a coordinator's live EUR-Lex browser read,
2026-09-02 (see each file's own header). `fsi-app/src/__tests__/fueleu-annex-iv.test.mjs`'s "WORKED
EXAMPLE" test independently hand-computes the formula against illustrative round numbers (target 90,
actual 100, 50,000,000 MJ → −500,000,000 gCO2eq → €292,682.93) — a **self-consistency** check (the module
re-derived by hand and compared), not a number taken from an external published worked example (see
"What this lane could not source" below for why).

**Real, new this lane (2026-09-06):**
`scripts/propagation/fixtures/fueleu-annex-i-iv-statutory-constants-2026-09-06.json` — the Article 4(2)
GHG intensity limit table for every period the regulation states (2025 through 2050), re-verified against
EUR-Lex `CELEX:32023R1805` this session, and a restatement (not a re-verification — see that file's own
`_note`) of the already-confirmed Annex IV Part B(a) constants. This file is a **reference**, not a
`write-statutory.mjs --rows-file` — see its own `_purpose` field for exactly why the schemas differ.

**Still not real — the actual gap this lane could not close:**
`write-statutory.mjs`'s `--rows-file` schema needs, per ship-year, `ghgIntensityActual`, `energyUsedMJ`
and `consecutiveDeficitYears` — figures a ship's company reports under the EU MRV Regulation (EU)
2015/757 to EMSA's THETIS-MRV register. **None of those three figures is published anywhere in
Regulation (EU) 2023/1805's own text.** Per this lane's own dispatch instruction ("if a figure is not in
the regulation text, leave the row out and say so") and CLAUDE.md rule 2 (never fabricate), no ship row
was written. `statutory_computations` stays at **0 rows**, unchanged by this lane, honestly.

## What this lane tried, and why each channel failed (so the next lane does not repeat it)

1. **EUR-Lex CELEX:32023R1805 via `WebFetch`** — reached Article 4(1)-(3) verbatim (twice, consistent),
   confirming and extending the 2025-2050 target table. Never reached Annex II or Annex IV in two attempts
   with differently-worded prompts, both cutting off around Article 5 — the same class of gap this lane's
   predecessor (the `BROWSER-WORKLIST.md` companion to the fixture rows-file) already found for a fuller
   browser session (EUR-Lex serves the Annexes through more client-side rendering `WebFetch` does not
   execute).
2. **EMSA's public THETIS-MRV portal** (`https://mrv.emsa.europa.eu/#public/emission-report`) — confirmed
   this session, `WebFetch` returns only page metadata (title, viewport), never the per-ship search
   results; it is a JS single-page app. No static bulk CSV/XLSX export of the per-ship dataset was found
   via `WebSearch` either (checked `emsa.europa.eu`, `data.europa.eu`).
3. **A published, numeric worked example from an authoritative body** — searched for a Commission/EMSA/
   DG MOVE guidance document with a fully worked compliance-balance-and-penalty example. The one credible
   lead found, an ESSF (European Sustainable Shipping Forum — a DG MOVE-hosted expert-group workshop)
   PDF titled "FuelEU calculation methodologies" (Intercargo-hosted, May 2025) with six named worked
   examples in its own §1.4 (pages 30-42) — `WebFetch` truncated the document before reaching the numeric
   content on two attempts with different prompts, and this container's egress proxy refused a direct
   `curl` download of the PDF (`intercargo.org` — 403, "organization policy"), so `pdftotext` (CLAUDE.md
   rule 12's own prescribed path for reading a PDF) was never reachable either. A private classification-
   society/verifier blog (`normecverifavia.com`) was found with a fully worked numeric example, but was
   **not** used: it is not "the regulation or its published guidance" (a private company's marketing
   article), and its digits reached this session only through `WebFetch`'s own LLM summarization pass —
   a real risk of numeric transcription error this lane was not willing to publish as a checkable ground
   truth without independent confirmation.

**Exact next dispatch to close this gap**, unchanged in substance from the predecessor worklist
(`scripts/_worklists/statutory-fueleu-annex-iv-2026-09-05.BROWSER-WORKLIST.md`, item 3) but now narrower
— the constant-table half of that worklist (items 1/2, Annex II factors and 2030-2050 targets) is now
answered for the target-year half by this lane's own reference file:

1. A session with a real rendered-browser tool (Chrome/`claude-in-chrome`, or a Cowork desktop session
   with the operator's own browser connected) opens `https://mrv.emsa.europa.eu/#public/emission-report`,
   picks one real, named ship (a real IMO number) with a published annual report for 2025, and records,
   **verbatim from the published report**: the ship's reported/derived GHG intensity of energy used
   (gCO2eq/MJ), its total energy used on board (MJ), and its consecutive-compliance-deficit-year count
   (THETIS-MRV does not publish this directly — an honest `1` starting point if no prior-year deficit
   history is confirmable, named as such in the row's citation).
2. That session fills one row of a new `scripts/_worklists/statutory-fueleu-annex-iv-<new-date>.json`
   (same `_schema` the 2026-09-05 fixture already documents) with `derivation: "observed"`, a real
   `citation` string, **and** a `source` block (`{url, article, quote, verified_at}`) per input — the new
   requirement this lane's validator enforces (see below).
3. The coordinator runs the exact dispatch in "Exact dispatch, next" below.

## The pre-flight gate this lane added

`fsi-app/scripts/propagation/validate-statutory-rows-file.mjs` (tested,
`fsi-app/scripts/propagation/validate-statutory-rows-file.test.mjs`, red-then-green against the tree's
own fixture) now runs **before** `write-statutory.mjs` in `propagation-drain.yml`'s
`backfill_and_statutory` step, whenever `scripts/propagation/fixtures/fueleu-annex-iv-rows.json` is
present. It refuses (exit 1, naming every violation):

- a file whose `_file_status` (or any row's `shipKey`/`citation`) carries a FIXTURE/SYNTHETIC/PLACEHOLDER
  marker;
- any `StatutoryInput` (`ghgIntensityActual`/`energyUsedMJ`/`consecutiveDeficitYears`) missing a
  structured `source` block (`url`, `article`, `quote`, `verified_at` — the same shape
  `scripts/spec09/lib/rows-file.mjs`'s `requireCitation()` already established for the other rows-file-
  driven producers, reused via `classTierForHost`, not reimplemented);
- a `source.url` whose host does not resolve to a codified tier in `src/lib/sources/host-authority.ts`
  (SC-13 — never a guessed tier). A real EU statutory source resolves to `eur-lex.europa.eu` (T1) or a
  `europa.eu`/gov host (T2, e.g. EMSA's `mrv.emsa.europa.eu`).

This closes the specific failure mode audit finding 3 named: a rows-file self-labeled "FIXTURE... NOT to
be applied to production" reaching the production apply path by a coordinator copying it to the path the
drain reads without re-checking the label. The gate refuses on sight now, not after the fact.

## Exact dispatch, next (once a real, reviewed rows-file exists at the drain's own path)

Once step 2 above produces a reviewed `scripts/_worklists/statutory-fueleu-annex-iv-<new-date>.json`,
copy it to `scripts/propagation/fixtures/fueleu-annex-iv-rows.json` (the exact path
`propagation-drain.yml`'s `write-statutory.mjs` step reads) and dispatch:

```
workflow: Propagation drain (propagation-drain.yml)
inputs: mode=apply, batch=500, backfill_entities=false, seed_derived_values=false,
        backfill_and_statutory=true
```

**Expected artifacts**: the validator's stdout (`validate-statutory-rows-file: "<path>" passes...`) in the
job log; `write-statutory.mjs`'s own summary line (`[write-statutory] summary: written=N ...`) — the run's
evidence, since this script has no dedicated harness-run family of its own (a
`docs/ops/dispatch-ledger.jsonl` entry is the run record); the row itself, readable via
`SELECT * FROM statutory_computations` (read-only SQL, Supabase project `kwrsbpiseruzbfwjpvsp`) once the
job completes. **Expected count for the first real row: 1** (this runbook's process produces exactly one
reviewed ship-year row per dispatch, by design — never a bulk unreviewed import).

## Read-only verification this lane ran (2026-09-06)

```sql
select count(*) from statutory_computations;  -- 0, unchanged by this lane
```
