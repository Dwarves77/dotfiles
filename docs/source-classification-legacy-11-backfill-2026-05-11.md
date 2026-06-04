# Legacy 11 source-classification backfill

Date: 2026-05-11
Operator: jasonlosh@gmail.com (autonomous, pre-approved)
Project: Supabase `kwrsbpiseruzbfwjpvsp` (`public.sources`)
Framework reference: `C:/Users/jason/dotfiles/docs/source-classification-framework-2026-05-10.md`

## Scope

Backfilled `classification_confidence` and `classification_rationale` for the 11 legacy pre-backfill rows. These rows were classified before the framework backfill ran (assigned at `2026-05-10T21:20:49Z`) and were not in the JSON intermediary at `scripts/tmp/_backfill-classify-out.json`, so the regular metadata backfill did not touch them. Reconstructed values from each source's `source_role`, `url`, and the framework doc's role examples.

## Counts

- Pre-run count: **11**
- Updated count: **11**
- Tier overrides: **0** (all 11 already matched the framework's role-default tier mapping)
- Post-run count: **0**
- Error count: **0**

Idempotent guard: `WHERE classification_confidence IS NULL` clause on every UPDATE; halt-on-first-error (not triggered).

## Per-row results

| id | name | source_role | tier (kept or override) | confidence | rationale |
|---|---|---|---|---|---|
| 0768a0d2-4f2e-4b4f-a84e-05084c107f79 | American Alliance of Museums (AAM) | industry_association | 5 (kept) | HIGH | US museum sector association per framework Role 1.8 examples (AAM listed); fine_art vertical aligns |
| 1d0265c2-38ce-463e-befb-f623146ee517 | European Commission DG FISMA (finance) | primary_legal_authority | 1 (kept) | HIGH | EU regulatory body, primary_legal_authority by URL pattern (DG FISMA per framework Worked Example 1) |
| 2d27b8d9-96cb-4843-9df4-5dc31315d514 | European Banking Authority (EBA) | primary_legal_authority | 1 (kept) | HIGH | EU banking regulator, primary_legal_authority per framework Role 1.1 examples (EBA listed) |
| 390fb3eb-c17c-474e-9783-d0c71822c37b | US Securities and Exchange Commission (SEC) | primary_legal_authority | 1 (kept) | HIGH | US securities regulator, primary_legal_authority per framework Role 1.1 examples (SEC listed) |
| 5cb7d618-f2ef-47ff-8b89-d9a512b427bc | Gallery Climate Coalition (about + resources) | industry_association | 5 (kept) | HIGH | Fine-art sector association per framework Worked Example 5 (GCC about+resources path); industry_association T5 |
| 7aa784cf-6765-4e60-bc56-8fb884897261 | European Securities and Markets Authority (ESMA) | primary_legal_authority | 1 (kept) | HIGH | EU markets regulator, primary_legal_authority per framework Role 1.1 examples (ESMA listed) |
| 7fd006b9-e51a-4adc-b92d-8a8a48654168 | International Institute for Conservation (IIC) | industry_association | 5 (kept) | HIGH | Conservation sector association per framework Role 1.8 examples (IIC listed); fine_art vertical aligns |
| bb01d11f-edea-4eee-aab6-cf531305101a | ICOM Committee for Conservation (ICOM-CC) | industry_association | 5 (kept) | HIGH | Conservation sector association per framework Role 1.8 examples (ICOM-CC listed); fine_art vertical aligns |
| c75ea058-f29a-4606-a76e-bb0295565958 | UK Financial Conduct Authority (FCA) | primary_legal_authority | 1 (kept) | HIGH | UK financial regulator, primary_legal_authority per framework Role 1.1 examples (FCA listed) |
| e1cf70bc-7981-4c83-b9f3-bae57b035cee | Carbon Pulse | trade_press | 5 (kept) | HIGH | Carbon-markets editorial publication per framework Role 1.7 examples (Carbon Pulse listed as trade_press T5) |
| f81c2cd0-2627-4e92-aa07-478ef395c2a2 | Gallery Climate Coalition (research) | academic_research | 3 (kept) | HIGH | GCC research-arm path per framework Worked Example 5 (academic_research T3 secondary registration) |

## Tier-override breakdown

None. All 11 rows already carried the framework-default tier for their assigned `source_role`:

| source_role | framework default | rows in this batch |
|---|---|---|
| primary_legal_authority | T1 | 5 (FISMA, EBA, SEC, ESMA, FCA) |
| industry_association | T5 | 4 (AAM, GCC about, IIC, ICOM-CC) |
| trade_press | T5 | 1 (Carbon Pulse) |
| academic_research | T3 | 1 (GCC research) |

## Confidence rationale (HIGH for all 11)

Every row in this batch is explicitly named (or a clear URL-pattern split) in the framework doc:
- 5 primary_legal_authority rows are listed verbatim under Role 1.1 examples
- 3 industry_association conservation/fine-art rows (AAM, IIC, ICOM-CC) are listed under Role 1.8 examples
- 2 GCC rows (about, research) are the explicit URL-pattern split from Worked Example 5
- 1 trade_press row (Carbon Pulse) is named with its T5 tier in Role 1.7

No source_role/tier/scope coherence concerns; no MEDIUM or LOW assignments warranted.

## SQL pattern applied (per row)

```sql
UPDATE public.sources
SET classification_confidence = $1,   -- 'HIGH'
    classification_rationale  = $2    -- short rationale (under 128 chars)
WHERE id = $3
  AND classification_confidence IS NULL;
```

`tier` was not modified for any row in this batch (no Option A overrides triggered).

## Artifacts

- Investigation script: `C:/Users/jason/dotfiles/fsi-app/scripts/tmp/legacy-11-investigate.mjs`
- Execution script: `C:/Users/jason/dotfiles/fsi-app/scripts/tmp/legacy-11-execute.mjs`

## Verification

Re-running the post-condition query returned 0 rows:

```sql
SELECT count(*) FROM public.sources
WHERE source_role IS NOT NULL AND classification_confidence IS NULL;
-- 0
```

End report.
