# Pending run — mint

F28 rule (c) (staleness coupling, `.discipline/fitness/functions/F28-harness-run-integrity.mjs`): the
`mint` family's governing files re-hash to a value no landed artifact records. This marker acknowledges
the change and names the planned run that supersedes it, per that rule's own escape hatch.

**Discharged (2026-09-02, population-turn run #12 → `mint-run-014.json`, hash `sha256:9a3e4c77ec4d9342`):**
the marker Lane WSEQ wrote (shared write sequence + screen-verdict kit check) named that run and that
run landed it: 42 attempted, 40 `minted_verified`, 0 `apply_failed`, 2 `validation_failed`.

**What changed (2026-09-02, coordinator, from reading mint-run-014 — migration 289 parity):** the two
failures were both `[2] ungrounded_url` on EUR-Lex "(01)" identifiers (CELEX 32023D0628(01),
32023D0207(01)): the criterion-2 URL extractor `https?://[^\s)\]}"'<>]+` stops at the first `)`, so the
prose URL extracted as `...(01` and matched no grounded URL. The live `validate_item_provenance` had the
same regex, so the local rejection was correct parity, and fixing one layer alone would have produced
`minted_unverified` rows. Migration 289 patched the live function in place (pre-md5 pinned, one
occurrence, post-check) to `https?://(?:[^\s()\]}"'<>]|\([^\s()]*\))+` (one-level balanced parentheses;
a URL inside prose parentheses still stops before the unmatched `)`), and `validate-mint-payload.mjs`
`URL_RE` mirrors it with two tests (the failing CELEX case grounds; the prose-parenthesis case still
grounds). `export-census-rows.mjs` (a runtime file, not a governing one, but named for the full picture)
also gained `isOjFileName` / `extractOjActTitle`: the same two rows carried the OJ file name
`C_2023226EN.01000601.xml` as `title` (`captured_title` from `<title>`); a file name is now never a
title, and the body-lead fallback extracts the act title ("COMMISSION DECISION of 19 April 2023 …
(2023/C 226/06)") with origin `captured_body_act_title`.

That marker's own recorded hash was `sha256:c2e34028ebc18ab2` (superseded below — kept here, out of F28's
exact "harness_version at write time:" phrasing, purely as history; F28's parser reads only the single
current-hash line further down).

**Superseded before that run landed (2026-09-02, Lane INTAKE, wave2 "build the tools before populating"
ruling):** no `population-turn` dispatch ran between the marker above and this re-stamp — the mint family
still has no run past `mint-run-014.json` — but Lane INTAKE's write set (`src/lib/intake/record-facts.mjs`,
`item-type-required-slots.json`, `payload-schema.json`, this runbook's own new §13) are FOUR of this
family's eight governing files, so the hash the marker names is stale again regardless. What changed:
`record-facts.mjs` gained five new extraction fields (`binding_position`, `due_date`/`date_precision`,
`corridor_identity`, `research_credibility` — MINT-RUNBOOK.md §13 has the full account) that every future
record-grade payload now carries; `item-type-required-slots.json` registered two new item_types
(`notice`, `presidential_document`) and added slots to `market_signal`/`initiative`/`research_finding`
(the five long-registered regulation-family item_types are UNCHANGED, by design — see §13); `payload-schema.json`
documents the five new `item.*` fields (`additionalProperties` unchanged at every level). No mint batch
ran against these files — this is a tools-before-population change, per the operator's own wave2 ruling,
not a population run this marker's own escape hatch would otherwise require. `hashHarnessVersion(MINT_GOVERNING_FILES)`
(from `scripts/lib/run-artifact.mjs` / `run-mint-batch.mjs`, computed the same way the CI/pre-push gate
computes it) now reads:

**harness_version at write time:** `sha256:0091d3bcf17e7edf`

**The planned run that supersedes this marker:** the next `population-turn` apply dispatch (still limit
200, still the first full slice after the screen gate and the kit check — Lane INTAKE changed nothing
about that plan, only what a record-grade payload additionally carries) — this is still `mint-run-015.json`
(no run has landed between `mint-run-014.json` and this re-stamp), and its artifact re-hashes to
`sha256:0091d3bcf17e7edf`, at which point this marker is stale-by-match and must be deleted per F28's
reverse-audit.
