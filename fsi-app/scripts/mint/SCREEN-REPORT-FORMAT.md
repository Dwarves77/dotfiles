# Relevance re-screen report format — what the coordinator hands the operator for ratification

Lane M-SCREEN builds the $0 rule-based relevance re-screen ADR-020 requires (MINT-RUNBOOK.md §0/§7):
`screen-rules.mjs` (the classifier) and `screen-worklist.mjs` (the runner that classifies a full census
export and writes the two files this document describes). This file specifies what the coordinator reads
out of the runner's output and how it is presented to the operator for a ratification decision — the
screen recommends, it does not itself write to the database (no DB access, no network, per the runbook's
$0 rule).

## 1. Inputs to this document

`screen-worklist.mjs --input <census-dump.json>` writes two files next to (or into `--out-dir`):

- `<basename>.screen-results.json` — the full machine-readable record, one entry per row: `id`,
  `document_url`, `title`, `surface_tags`, `verdict`, `rule`, `basis`, plus top-level `counts` (per verdict,
  per rule) and a `malformed` array for input rows the screen refused to classify (missing `id` or
  `document_url` — never given a fabricated verdict).
- `<basename>.screen-summary.md` — the human-readable version of the same data: counts per verdict, counts
  per rule, the full off_vertical list with reasons, the full ambiguous list, and the malformed list.

Both are inputs to the coordinator's own operator-facing report; neither is itself applied to the DB.

## 2. The three verdicts and what happens to each

| Verdict | What it means | What the coordinator does with it |
|---|---|---|
| `on_vertical` | Rule-matched as freight-sustainability-adjacent under ADR-020 (an edge zone ruled IN, or a core sustainability topic). | Proceeds into the normal mint pipeline (MINT-RUNBOOK.md §1 onward) — fetch, author, validate, hand off. The screen is a gate BEFORE fetch spend, not a mint decision itself; a green screen still has to clear C1-C7. |
| `off_vertical` | Rule-matched against the runbook's denylist (customs/tariff/nomenclature, ATM/air-services bilaterals, seafarer-certification recognition, vehicle type-approval corrections, crypto/MiCA, language-correction decisions, general tax-administration procedure) or a decoded CELEX root known to be one of these. | **Never minted.** Reported to the operator as a candidate for `archive_reason='off_domain'` disposition on the census row — the same eligibility-gate path ADR-020 Amendment 1 used (MINT-RUNBOOK.md §7). The census row still gets a disposition; it is never left `would_mint` and never silently dropped from the 3,661 count. |
| `ambiguous` | No rule fired with confidence, or signals conflicted, or the item is a not-yet-enacted preparatory act with no title signal. | **Never auto-declined and never auto-minted.** Routed to a human-review bucket. The operator reads the `basis` string, makes the call, and the disposition (mint / archive / re-tag) is recorded manually — the screen does not guess on the operator's behalf. |

Every row's `rule` field names the exact rule in `screen-rules.mjs` that produced the verdict, so a wrong
call is traceable to one line without re-deriving the classifier's reasoning.

## 3. What the operator sees, and what they ratify

The coordinator presents the operator with, in this order:

1. **Topline counts** (from `counts.byVerdict`): how many of the classified rows landed on_vertical /
   off_vertical / ambiguous, and how many input rows were malformed and excluded from all three buckets.
2. **Counts per rule** (from `counts.byRule`): which denylist/allowlist rule is doing the work, so the
   operator can sanity-check that no single rule is silently carrying an outsized share of the disposition
   (a signal the rule's pattern may be mismatched, over- or under-firing).
3. **The full off_vertical list**, each entry showing `id`, `title`, `document_url`, the firing `rule`, and
   the `basis` sentence. The operator ratifies this list as a batch: approve to apply
   `archive_reason='off_domain'` to each corresponding `census_worklist` row (reversible, per ADR-020's
   "archive reversibility is load-bearing" consequence — nothing here is a delete), or pull specific rows
   out for a second look before archiving.
4. **The full ambiguous list**, same per-row shape. These are NOT proposed for archiving — they are a
   worklist for a human relevance call. The operator either (a) reclassifies a row by eye and tells the
   coordinator which bucket it belongs in, or (b) leaves it `would_mint` pending a future re-screen pass
   (e.g. after a new rule is added to `screen-rules.mjs` for a pattern this batch surfaced).
5. **The malformed list**, if non-empty: rows the screen could not read at all (no `id` or no
   `document_url` in the export). These indicate an export/dump problem upstream, not a relevance
   question — the operator's action is to fix the export, not to disposition the row.

## 4. What ratification produces

- Every off_vertical row the operator approves gets `census_worklist.dryrun_disposition` left as-is (the
  screen does not touch `dryrun_disposition` — that column already encodes the mint chokepoint's own
  verdict) but gets an archive disposition recorded against it via the coordinator's normal archive path,
  the same `archive_reason='off_domain'` mechanism ADR-020 Amendment 1 used.
- Every on_vertical row proceeds to M1..Mn batches for the actual per-item mint procedure (MINT-RUNBOOK.md
  §1-6).
- Every ambiguous row stays parked with its `basis` attached until a human resolves it — it is never
  counted as either minted or archived until that happens, so the 3,661 queue count stays honest at every
  point in the process (no row silently disappears from the total in either direction).

## 5. Traceability

Because every verdict carries the exact `rule` name that produced it, a disputed disposition — an operator
saying "this off_vertical call looks wrong" — is resolved by reading one named rule in `screen-rules.mjs`
(its regex or CELEX-root entry) against the one row's title/URL, not by re-running or re-deriving the whole
classifier. If a rule is found to be too broad or too narrow, the fix is a one-line change to that rule in
`screen-rules.mjs`, covered by a red/green test in `screen-rules.test.mjs` proving the fix, and a re-run of
`screen-worklist.mjs` against the same input to see exactly which rows moved.
