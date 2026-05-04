# W2.F — Auto-verification pipeline

## Purpose

The W2.B discovery agent will surface thousands of candidate sources across
Tier 1 jurisdictions per cycle. Manual review of every candidate is
unsustainable. The verification pipeline triages each candidate into one
of three confidence tiers and acts on the classification — only the
borderline (M) cases reach a human queue, and only the high-confidence
(H) cases land directly in `sources` (where they're then spot-checked
by a platform admin within 7 days via the W2.E queue).

## The three tiers

| Tier | Action | Surfaces in human queue? | What it means |
|------|--------|-------------------------|---------------|
| **H** | INSERT INTO `sources` (`status='active'`, `admin_only=false`) | Yes — W2.E "awaiting spot-check" queue | High confidence: reachable, on a known authoritative domain, AI relevance ≥85, AI freight relevance ≥60, English |
| **M** | INSERT INTO `provisional_sources` (`status='pending_review'`) | Yes — existing provisional review queue | Uncertain: reachable but at least one signal is borderline |
| **L** | Audit log only — no source row written | No (noise reduction) | Low confidence: unreachable, duplicate, AI relevance <60, or freight relevance <30 |

Tier-L rows are queryable in `source_verifications` for forensics if a
candidate is later re-discovered or questioned, but they don't surface in
any human queue.

## Exact thresholds

```ts
AI_RELEVANCE_H = 85    // ai_relevance_score >= 85 → eligible for H
AI_RELEVANCE_M = 60    // ai_relevance_score < 60 → forced L
AI_FREIGHT_H   = 60    // ai_freight_score >= 60 → eligible for H
AI_FREIGHT_M   = 30    // ai_freight_score < 30 → forced L
```

H requires **all** of:
- reachable (HEAD 2xx after redirect resolution, or 405 fallback)
- not a duplicate of an existing `sources.url`
- domain confidence = "high" (matched a `.gov` / IGO / standards-body pattern)
- AI relevance ≥ 85
- AI freight relevance ≥ 60
- language = English

If any of those is false but no L-trigger fires, the row drops to M.

L-triggers (any one forces L):
- reachability fail (3 retries with 200/800/3200ms backoff)
- duplicate of existing source
- AI relevance < 60
- AI freight < 30

If the Haiku call itself fails (network/parse error), the row goes to **M, not L** —
we don't reject what we couldn't classify; operator review is the safety net.

Non-English content goes to **M (Phase D deferred)**, not L. The platform
will support non-English Phase D; M-queueing preserves the discovery for
re-classification when Phase D ships.

## Pipeline steps

1. **HEAD reachability** — manual redirect tracking (up to 3 hops), 8s timeout, 3 retries with exponential backoff (200ms / 800ms / 3200ms). 405 (method not allowed) is treated as reachable since some servers reject HEAD but accept GET.
2. **Domain pattern check** — regex against `KNOWN_AUTHORITATIVE_PATTERNS` (54 patterns, see below). Returns `high` / `medium` / `low` confidence.
3. **Duplicate check** — query `sources.url` for rows on the same hostname; client-side comparison of pathnames (exact match → duplicate; sub-path of an already-monitored root → duplicate). Postgres' `host()` function is on `inet` not `text` so a server-side host index would require a generated column; deferring that to W2.G.
4. **Content fetch** — plain `fetch()` GET on the resolved URL, strip `<script>`/`<style>`/tags, collapse whitespace, slice to 6000 chars. Browserless is intentionally not used here — most authoritative sources serve readable static HTML and the JS-render cost would 10x this step.
5. **Language detection** — inlined heuristic (ASCII-letter ratio + English stopword density). No `franc` dependency. False negatives drop the row to M, which is the safe direction. The 8-stopword threshold over a 4000-char sample reliably distinguishes English from Romance/Germanic Latin-script siblings.
6. **Single combined Haiku call** — returns `{ ai_relevance_score, ai_freight_score, ai_trust_tier, rationale }` in one JSON payload. Three separate calls would triple the cost without buying independence.
7. **Score aggregation** — conservative: any L-trigger forces L; otherwise H thresholds; fall through to M.
8. **Action execution** — H inserts into `sources`, M inserts into `provisional_sources` (`status='pending_review'`), L is a no-op for source rows. Every candidate writes one row into `source_verifications` regardless of action.

## Final Haiku prompt

```
You are a source verification classifier for a freight-sustainability intelligence platform.

Given a candidate source URL and a content excerpt, return STRICT JSON:
{
  "ai_relevance_score": 0-100,        // sustainability/climate/freight regulatory content relevance
  "ai_freight_score": 0-100,          // does this jurisdiction publish things that affect freight (cargo, shipping, customs, trade, transport, supply chain)
  "ai_trust_tier": "T1"|"T2"|"T3",    // T1 = canonical primary source (Federal Register, EUR-Lex, IMO); T2 = canonical regulator (EPA, CARB, EMSA); T3 = reputable secondary (industry assoc, standards bodies, think tanks)
  "rationale": "<=150 char summary"
}

Rules:
- Tier reflects canonicalness, not jurisdictional level. CARB = T2 (same as EPA). State agencies issuing primary regulation = T2.
- Score 100 only for explicit primary-source government/IGO regulatory publications.
- Score < 60 means not relevant — pipeline will reject.
- Be strict: when in doubt about freight relevance, score lower. Operator review is the safety net.
- Output JSON only, no prose, no markdown, no code fences.
```

The user message includes the candidate URL, candidate name, the
discovered-for jurisdiction, and the 6000-char content excerpt.

## Authoritative domain patterns (54)

The pattern list lives in `src/lib/sources/verification.ts` as
`KNOWN_AUTHORITATIVE_PATTERNS`. Order is for log readability; first
match wins.

### National government TLDs (16)

`.gov`, `.gov.uk`, `.gc.ca`, `canada.ca`, `.gov.au`, `.govt.nz`,
`.gov.in`, `.gov.sg`, `.gov.br`, `.go.kr`, `.go.jp`, `.gob.cl`,
`.bcn.cl`, `.gob.mx`, `.gov.cn`, `.npc.gov.cn`.

### EU institutions (5)

`.europa.eu`, `eur-lex.europa.eu`, `consilium.europa.eu`, `ec.europa.eu`,
`emsa.europa.eu`. (`.eea.europa.eu` is also listed under standards.)

### US Federal regulators (7)

`federalregister.gov`, `regulations.gov`, `epa.gov`, `dot.gov`, `cbp.gov`,
`faa.gov`, `fmcsa.dot.gov`. These are caught by `.gov` already; explicit
listing is for log clarity.

### US State agencies issuing primary regulation (6)

`ca.gov`, `arb.ca.gov` (CARB), `ny.gov`, `wa.gov`, `oregon.gov`, `mass.gov`.
Per spec: tier reflects canonicalness, not jurisdictional level — CARB
gets `confidence=high` here and `T2` from the Haiku classifier, the same
as EPA.

### Intergovernmental organizations (9)

`un.org`, `unfccc.int`, `imo.org`, `icao.int`, `iea.org`, `worldbank.org`,
`oecd.org`, `wto.org`, `wcoomd.org`.

### Standards bodies and recognized industry/research authorities (13)

`iso.org`, `ifrs.org`, `ghgprotocol.org`, `sciencebasedtargets.org`,
`cdp.net`, `smartfreightcentre.org`, `theicct.org`, `itf-oecd.org`,
`fiata.org`, `clecat.org`, `iru.org`, `eea.europa.eu`, `climate-laws.org`,
`ecolex.org`.

Patterns marked `confidence=high` (44 of 54) are sufficient on their own
to pass the domain gate when the Haiku scores also meet H thresholds;
`confidence=medium` (10 of 54) require the row to drop to M for human
review.

### Rationale

The list is anchored in `CURRENT_SKILL.md` Section "Top sources comparison"
plus the broader library section ("Additional authoritative sources"). It
covers the four operational pressure zones in the source skill (carbon
pricing & fuel mandates, transport-emissions measurement, trade-embedded
climate instruments, US baselines) across Tier 1 jurisdictions (US, EU,
UK, Canada, Asia hubs, LatAm, IGOs).

The list is intentionally conservative — high-confidence patterns are
canonical primary publishers or recognized regulators with stable
reputational status. Marginal cases (think tanks, NGO trackers, trade
press, classification societies) get medium confidence so they route
through the M queue for human authorization rather than auto-approving.

The list will grow over time. New patterns should be added with explicit
review against the same standard: would a freight forwarder's compliance
counsel cite this source unhesitatingly? If yes → high. If "yes with
context" → medium. If no → not in the list.

## Calibration notes

Initial thresholds (AI_RELEVANCE_H=85, AI_RELEVANCE_M=60,
AI_FREIGHT_H=60, AI_FREIGHT_M=30) are conservative. The California
pilot (W2.B Tier 1 jurisdiction) will calibrate via:

- Random-sample audit of tier-H rows against operator review verdicts
  (target: ≥95% precision — i.e. ≥95% of auto-approved rows confirmed
  in spot-check).
- Random-sample audit of tier-L rejections against re-review (target:
  ≤5% false-rejection rate — i.e. ≤5% of L rows would have been
  approved by a human).
- Tier-M queue size monitoring. If M is growing faster than human
  reviewers can clear, raise the M→H threshold (relax) for proven-clean
  sub-domains. If M is too small (large M→H jumps without human
  scrutiny), tighten.

Expected calibration trajectory:
- The L→M boundary (60/30) likely stays fixed — false-positives below
  this carry the highest reputational risk.
- The M→H boundary (85/60) will tighten or relax based on observed
  precision in the spot-check queue.
- The domain pattern list will expand as the discovery agent finds
  legitimate sources outside the initial 54.

## Quality monitoring

### Recently auto-approved viewer (W2.E surface)

`GET /api/admin/sources/recently-auto-approved?days=N` returns sources
auto-approved within the last N days where `spotchecked=FALSE`. Joined
with `source_verifications` so the operator sees AI scores, rationale,
and full pipeline log inline. The W2.E admin notification surface
("auto-approved awaiting spot-check") drives the operator to this list
when count > 0.

Default window: 7 days (matches the W2.E queue). Max: 90.

### Monthly random-sample audit job

A scheduled job (cron, defined in W2.G) selects:
- 50 random tier-H rows from the last 30 days
- 50 random tier-L rows from the last 30 days
- 50 random tier-M rows from the last 30 days

For each, an operator labels: `correct` / `should-be-H` / `should-be-M`
/ `should-be-L`. Aggregates feed into the calibration loop above.

### False-positive tracking

When a platform admin un-approves a previously auto-approved source
(e.g. via the `/admin/sources/[id]/visibility` toggle to `admin_only=true`,
or by setting `status='suspended'`), the action is captured by
`source_trust_events`. A weekly report joins `source_trust_events`
with `source_verifications.resulting_source_id` to surface the
auto-approval → un-approval pairs as false-positive labels feeding the
M→H threshold calibration.

## Idempotency

Running the pipeline twice on the same candidate URL produces:

- **Two `source_verifications` rows** (the audit log captures every run)
- **One `sources` row** (the second run's duplicate check rejects → tier L)
- **One `provisional_sources` row** (the M-queue insert respects the existing `UNIQUE(url)` constraint; on collision the action falls back to `queued-provisional` without an insert error)

This means the discovery agent can safely re-process the same candidate
batch on retry without polluting the registry.

## Schema

Migration `037_source_verification.sql` adds:
- `source_verifications` table (the audit log)
- 4 indexes (`url`, `tier`, `created_at DESC`, `resulting_source_id`)
- RLS read-only policy mirroring the trust-framework pattern

The migration adds **no columns** to `sources` or `provisional_sources` —
the constraint is "DO NOT change the existing `provisional_sources` or
`sources` schema beyond what migrations already defined."

Note: the `sources` table has no `scan_enabled` column. The spec mentioned
`scan_enabled=true` for tier H and `scan_enabled=false` for non-English
H. Since non-English is downgraded to M in aggregation (the closer
equivalent of "not yet scannable"), the H insert path always sets
`status='active'` and the M insert path always sets
`status='pending_review'`. If a true `scan_enabled` column is needed
for Phase D, that's a separate migration and a small change to the
H insert in `executeAction()`.

## Files

- `fsi-app/supabase/migrations/037_source_verification.sql` — audit table
- `fsi-app/src/lib/sources/verification.ts` — pipeline module
- `fsi-app/src/app/api/admin/sources/verify/route.ts` — POST endpoint
- `fsi-app/src/app/api/admin/sources/recently-auto-approved/route.ts` — viewer endpoint
- `docs/W2F-verification-pipeline.md` — this document
