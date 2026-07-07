# Tier-H Spot-Check Procedure

Operational runbook for the W3 calibration audit.

## Why this exists

The W3 verification pipeline auto-approves a candidate URL to **tier H** when:

- the URL is reachable (HEAD 2xx, or 405 with GET fallback);
- the host matches one of 57 entries in `KNOWN_AUTHORITATIVE_PATTERNS`;
- a Haiku classifier (using `VERIFICATION_HAIKU_SYSTEM_PROMPT`) returns
  `ai_relevance_score ≥ 70` **and** `ai_freight_score ≥ 50`.

Tier-H rows are written directly to `sources` with `status='active'`, no
human review. ~105 rows landed in the last 7 days. The spot-check
re-validates a random 20 to confirm calibration is holding in production.

## What it audits

For each of 20 randomly-sampled tier-H sources from the last 7 days:

1. **Reachability** — fresh HEAD with up to 3 redirects, 8 s timeout.
2. **Domain pattern** — the same 57-entry list, same regex semantics.
3. **Content** — fresh GET, HTML stripped, trimmed to 6 000 chars.
4. **Haiku re-classification** — same model
   (`claude-haiku-4-5-20251001`), same system prompt, fresh content.
5. **Drift** — new scores compared against the
   `source_verifications.ai_relevance_score` /
   `ai_freight_score` recorded at original verification time.

## Classification rubric

Each sampled row is bucketed into exactly one verdict:

| Verdict        | Condition                                                                                |
|----------------|------------------------------------------------------------------------------------------|
| `confirm-H`    | reachable; new relevance ≥ 70; new freight ≥ 50                                          |
| `should-be-M`  | reachable; relevance 50–69 *or* freight 25–49 (over-promoted to H)                       |
| `should-be-L`  | reachable; relevance < 50 *or* freight < 25 (false positive)                             |
| `unreachable`  | HEAD failed all 3 attempts, or no content could be fetched/classified                    |

> Domain mismatches are **logged but do not flip the verdict** on their own.
> The original pipeline already required a domain match to reach tier H, so
> a no-match here means the pattern list drifted, not that the original
> score was wrong. Investigate `verification.ts` if multiple sampled rows
> show `domain_match: false`.

## Recalibration thresholds

The script writes a `recalibration_recommendation` based on the
false-positive rate (`(should-be-M + should-be-L) / sample_size`):

| FP rate         | Recommendation                                                          |
|-----------------|-------------------------------------------------------------------------|
| ≤ 5%            | calibrated; no change                                                   |
| > 5% and ≤ 20%  | raise H thresholds by ~5 points (rel ≥ 75, frt ≥ 55) and re-run         |
| > 20%           | raise to rel ≥ 80, frt ≥ 60 and manually review every flagged row       |

If `median_relevance_drift < -10`, the recommendation appends a note to
inspect the prompt for drift before recalibrating thresholds — the
classifier might be stricter than at the time of original verification,
in which case raising thresholds would compound the bias.

## Outputs

The script writes two files at the repo root each run (overwriting):

- `docs/SPOT-CHECK-RESULTS.json` — machine-readable per-source verdicts
  plus aggregate summary and recommendation.
- `docs/SPOT-CHECK-RESULTS.md` — readable table of the 20 rows, summary
  block, and recalibration text.

## Running it

```bash
cd fsi-app
node supabase/seed/audit-tier-h-spot-check.mjs
```

Required env in `fsi-app/.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`

## Cost

20 Haiku classifications × ~$0.001 ≈ **$0.02 per run**. HEAD/GET
requests against the candidate URLs are free. Running cost is printed
to stdout after each row.

## Idempotency

Each invocation draws a fresh random sample (`Math.random()` shuffle on
the eligible set) — repeated runs build empirical evidence on the
calibration distribution. Outputs are overwritten, not appended.

## Source-of-truth pointers

The script copies — verbatim — two artifacts from
`fsi-app/src/lib/sources/verification.ts`:

- `KNOWN_AUTHORITATIVE_PATTERNS` (57 entries)
- `VERIFICATION_HAIKU_SYSTEM_PROMPT`

If `verification.ts` changes either, this script must be updated to
match. Otherwise the audit isn't checking the same thing the pipeline
runs. The script logs a warning if the pattern count is not 57.

## When to run

- After every batch of W3 auto-approvals (e.g., weekly cron).
- Before raising or lowering thresholds in `verification.ts`.
- After modifying `VERIFICATION_HAIKU_SYSTEM_PROMPT` (rule-of-thumb:
  prompt change + spot-check before merge).
