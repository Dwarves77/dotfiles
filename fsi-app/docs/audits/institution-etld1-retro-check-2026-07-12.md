# Institution eTLD+1 retro-check (Ruling 2 C4) — 2026-07-12

**mig-158 discipline:** the naive `slice(-2)` fed institution-identity, which feeds the eTLD+1 merge rulings
(EcoVadis-class) and the tier-stamp channel. So the retro-check must answer: **did any merge / suspension /
tier stamp execute on a mis-grouped identity?** Read-only, live DB (`kwrsbpiseruzbfwjpvsp`).

## The ruler

- **Canonical `hostInstitution` (src/lib/sources/institution.ts) is CORRECT** — its `TWO_LEVEL` super-domain set
  includes `europa.eu`, `canada.ca`, `co.uk`, `gov.uk`, `com.au`, `ca.gov`, so it keeps eur-lex.europa.eu /
  ec.europa.eu / eea.europa.eu **distinct**. Now locked by golden tests (`institution.test.mjs`, 5/5, globbed).
- **The divergent tool** is `scripts/source-institution-backfill.mjs` — it uses an ad-hoc `SLD` set
  (`gov/ac/co/…`) + `slice(-2)`, which mis-groups `europa.eu` / `canada.ca` subdomains.

## What the backfill wrote (it RAN)

- `sources.institution_id` populated on **722 sources**; `institutions` table exists (migration 122).
- **6 institution_id groups span multiple base_tiers** — the mis-merge signature:
  - **`europa.eu` collapsed 17 distinct institutions into one**, spanning T1–T3:
    eur-lex.europa.eu=T1, esma=T1, eba=T1, ec.europa.eu=T2, europarl=T2, consilium=T2, easa=T2, eea=T3,
    clean-hydrogen=T3, + more. eur-lex (T1 legal text) merged with agencies.
  - **`canada.ca`** merged `tc.canada.ca` (Transport Canada) with `canada.ca`.
  - **CDN-host class confirmed:** `amazonaws.com` → institution "Smart Freight Centre"; `windows.net` →
    "International Energy Agency" (a source's cloud host became its institution).

## The verdict on "did a wrong verdict execute?"

- **Tier stamps: SAFE.** base_tiers are **per-source** and **divergent** inside the mis-merged groups (eur-lex
  still T1, ec still T2). The mis-grouping did **not** homogenize tiers — no tier stamp executed *on* the
  mis-grouped identity.
- **Merges / suspensions: NONE via this channel.** `institution_id` / the `institutions` table have **ZERO
  runtime consumers** in `src` (grep: only a comment; the tier resolver `buildResolver` keys on the in-memory
  canonical `hostInstitution`, never `institution_id`). So no merge/suspension ran on the mis-grouping.
- **Unit 1 is not exposed by it either:** the trust evaluators (`evaluateProvisionalSource` etc.) are
  **per-source** (read `source.trust_metrics`), not institution_id-grouped aggregates.

**Conclusion:** the mis-merge is a **dormant, corrupted write-orphan** — real, but it has fed **no** verdict and
Unit 1's per-source evaluators won't inherit it. This is *good news* (the mig-158 "wrong verdicts on a corrected
ruler" case does not fully apply — no verdict was made), but the corrupted stored grouping is a **landmine** for
any future consumer and is corrected before one is built.

## Correction plan (guarded, Step-2 method — queued before T10/Unit 1)

1. **Ruler fixed + locked** — `institution.test.mjs` (done). 
2. **Fix the tool** — `source-institution-backfill.mjs` must use the canonical `hostInstitution` (not its SLD
   set), and EXCLUDE CDN/cloud hosts (amazonaws/windows.net/cloudfront/…) from being institutions (a source on
   a CDN has a source-URL data issue, not a real institution).
3. **Correct the data** — re-group the 6 mis-merged `institution_id` groups via the canonical (split europa.eu
   into its 17, canada.ca into 2; null the CDN-host institutions). Guarded data-op: dry-run → per-row read-back
   → execute; reversible (institution_id nullable). Zero-spend (no fetch/Sonnet).
4. Gate + log; runs before Unit 1 (T10) wires anything that could read institution grouping.
