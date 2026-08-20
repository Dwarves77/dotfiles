# WO-6 — Tag-gap diagnosis (2026-08-20, $0, read-only)

**Question:** why do 645 of 806 flywheel-corpus items carry no scenario tags, leaving the connection
engine at 93.5% of a low ceiling and the themes coarse?

**Answer `[CONFIRMED]`:** tags have exactly two producers — the B.2 regeneration pipeline
(`src/lib/agent/parse-output.ts`, writes `operational_scenario_tags` open vocab 0-5 kebab-case +
`compliance_object_tags`, stamped with `regeneration_skill_version`) and seeded mints (U4,
`mint-item.ts` carries seed tags). **A bulk import in August 2026 added 631 items through neither
path.** The corpus was refilled underneath the engine.

## Measurements (live, 2026-08-20, intelligence_items = 1,062 rows)

Tag coverage by producer state:

| Population | n | with scenario tags | rate |
|---|---|---|---|
| Regenerated at 2026-05-27 contract | 210 | 208 | 99% |
| Regenerated at 2026-04-29 contract | 95 | 89 | 94% |
| Never regenerated | 757 | 15 | 2% |

Creation-month series (n / tagged): 2026-04: 145/131 · 2026-05: 271/154 · 2026-06: 1/1 ·
2026-07: 13/10 · **2026-08: 632/16**.

Of the 757 never-regenerated: 631 created August 2026; 743 have no legacy-id prefix; 668 are
non-archived. **Addressable set: 655 untagged, non-archived items**, every one of which already holds
its content in `intelligence_item_sections` — avg 6,589 chars, median 5,152, max 36,701, none under
500. Tag derivation needs **zero fetching**.

Distribution note: the tagged minority is uneven by type — market_signal 55/77 tagged vs framework
23/287, directive 10/80. The untagged mass is precisely the regulation/framework/directive bulk, which
is why the flywheel's compliance/scenario scoring starves and generic-framework hubs dominated.

## The fix (WO-7), scoped and priced — ⛔ awaiting operator price ruling

NOT full regeneration. A tags-only classifier pass over stored content:

1. One prompt derived from the SKILL.md tag contract (open scenario vocab, ~36-value core glossary in
   `skill-loader.ts`; closed compliance-object rules), enforcing parse-output's shape rules
   (kebab-case, 0-5 values).
2. Input per item: title + summary + stored sections (~1,800 tokens median). Output ~60 tokens.
   System prompt prompt-cached across the run.
3. Writes through the guarded path with a prior-state snapshot (rule 015); idempotent
   (skip items already tagged); never touches foreign-origin edges; `signal_band` classification for
   market items included in the same call at ~zero marginal cost if the operator rules yes (WO-5 row 2).
4. After the write: re-run discover → cluster guarded, measure against the approved B4 targets
   (largest theme <25%, zero generic-framework hubs, ≥10 themes) — that step is WO-8 with
   inverse-frequency weighting.

**Price at 655 items:**

| Tier | Per item | Total | Note |
|---|---|---|---|
| Haiku 4.5 ($1/$5 per MTok) | ~$0.003 | **$2–3** | The sanctioned classifier tier (generation-config MODEL-TIER RULE: classification defaults to Haiku) |
| Sonnet ($3/$15 per MTok) | ~$0.008 | **$5–7** | Regen-grade parity with the 05-27 campaign's tagger |

Both include cache writes and a retry allowance. Ceiling context: SPEND_CEILING_USD $85, ~$74 real
headroom. **Recommendation: Haiku, hard cap $5, spot-check 20 items against the 05-27-tagged
population for vocabulary drift before the flywheel re-run.** No call is made until the operator
names the tier and the cap.
