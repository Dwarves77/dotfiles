# WO-19 — origin_class backfill mapping (ratification draft)

**Status: DRAFT, awaiting operator ratification.** Per master execution plan v2 (`docs/plans/master-
execution-plan-2026-08-17.md`) WO-19 step 2: "the mapping table itself is ⛔ operator-ratified before it
runs." This document is the artifact that ratification is against. Nothing in it has been executed — the
schema change it depends on (`origin_class` on `intelligence_items`) ships in migration 267
(`supabase/migrations/267_origin_class_and_envelope.sql`), which itself carries **no backfill** (see that
migration's header). This mapping runs as a **separate, later pass** once 267 is applied and this document
is ratified.

Scope: `intelligence_items` only (1,062 rows per Appendix A of the master plan, `[PLAN-STATED]`, not
re-verified here — this session has no DB access, per its own brief). `regional_data_facts` and
`state_cost_facts` are explicitly OUT of scope for this document: `regional_data_facts`' 75 rows are
RE-KEYED through the full number envelope (operator ruling, Addendum 26, option A) — a different,
heavier operation than a single-column classification, priced separately; `state_cost_facts` is already
enveloped at 13/13 rows and its `origin_class` backfill is a 13-row hand-classification, not a rule table.

## 1. What is and is not derivable, and why the rule is item_type + source tier only

**The vocabulary is not widened for this backfill.** Operator ruling (Addendum 26, binding, quoted
verbatim from `docs/ops/session-log.md`): *"the live 7-value `origin_class` vocabulary is NOT widened;
backfill stamps what is derivable from source metadata; NULL explicitly documented as 'pre-vocabulary'."*
The master plan (WO-19 step 1) narrows the derivable inputs further: item_type + source tier ONLY — no
guessing, no reading item content, no per-row judgment calls that a mapping table cannot make
mechanically and repeatably.

**The two inputs, both live schema, neither invented:**

- `intelligence_items.item_type` — migration 004's CHECK, 12 values: `regulation`, `directive`,
  `standard`, `guidance`, `technology`, `market_signal`, `regional_data`, `research_finding`,
  `innovation`, `framework`, `tool`, `initiative`.
- `sources.tier` (via `intelligence_items.source_id → sources.id`) — migration 004's CHECK, 1–7, with the
  live column comment (`COMMENT ON COLUMN sources.tier`, migration 004 line 624) as the ONLY authoritative
  label set: **T1 = official legal text, T2 = regulator guidance, T3 = IGO, T4 = expert analysis,
  T5 = industry, T6 = news, T7 = provisional.**

**What is deliberately NOT an input, and why:** "peer-reviewed" and "primary study" (the master plan's own
wording for `research_finding`) are not columns anywhere in this schema. `sources` has no
`is_peer_reviewed` flag, no publication-type field. Inventing a proxy for "peer-reviewed" that isn't
actually derivable from tier alone would be exactly the guessing WO-19 step 1 forbids ("no guessing").
The rule table below therefore treats T1–T3 (official/regulatory/intergovernmental bodies) as the closest
mechanical proxy for institutional rigor and T4 (expert analysis) as the closest proxy for traceable
editorial synthesis — both stated as proxies, not as "peer review", in §2's rationale column — and leaves
anything the tier scheme genuinely cannot distinguish as NULL rather than stretched to fit.

**Two schema facts that shape every row of the table below, both `[CONFIRMED]` by reading migration 004:**

1. `intelligence_items.source_id` is nullable (`REFERENCES sources(id) ON DELETE SET NULL`). A row with a
   NULL `source_id` has no tier to read and gets `origin_class = NULL` regardless of item_type — there is
   no institutional signal to classify against, and item_type alone was ruled insufficient by omission
   (the plan pairs it with tier, not offers it as an alternative).
2. `sources.tier` is itself editable over a source's life (`tier_history` jsonb, migration 004). This
   backfill reads `sources.tier` **as it stands at backfill time**, not `tier_at_creation`. A source that
   was promoted or demoted since an item was ingested is classified by its CURRENT standing, which matches
   how `origin_class` is meant to read today (a live judgment of reliability), not how it read when the
   item was created.

## 2. The rule table

`item_type` groups are ordered as the master plan states them; within each group, tiers are grouped by
what they can support without stretching. A row with `source_id IS NULL` always resolves to `NULL`
regardless of item_type or the table below — that case is not repeated per item_type for brevity.

| item_type | sources.tier | → origin_class | Rationale |
|---|---|---|---|
| `regulation`, `directive`, `standard` | T1 (official legal text) | `official` | The instrument's own text, from an official register — the plan's literal example. |
| `regulation`, `directive`, `standard` | T2 (regulator guidance) | `official` | The regulator's own guidance on its own instrument is still an official-body publication, not a third-party account of one. |
| `regulation`, `directive`, `standard` | T3, T4, T5, T6, T7 | `NULL` (pre-vocabulary) | An item TYPED as a regulation/directive/standard whose SOURCE is not itself an official register (e.g. an industry summary, a news report of a regulation) is a case tier+item_type cannot safely resolve: the content may still be an accurate restatement of law, but stamping `official` here would assert the wrong thing about provenance, and stamping anything weaker asserts something about the legal text that isn't true either. Left for editorial review, not guessed. |
| `guidance`, `framework` | T1, T2 (official body) | `official` | The plan's literal example: guidance/framework FROM an official body. |
| `guidance`, `framework` | T3 (IGO) | `official` | An intergovernmental organisation issuing its own guidance/framework is an official multilateral body, the same class as T1/T2 for this purpose. |
| `guidance`, `framework` | T5 (industry) | `partner` | The plan's literal example: guidance/framework FROM an industry body — licensed/third-party content, the `partner` class's own definition in vocabularies.mjs ("Licensed third party"). |
| `guidance`, `framework` | T4, T6, T7 | `NULL` (pre-vocabulary) | Expert commentary ON guidance, a news report ABOUT a framework, or a provisional source are accounts of the thing, not the thing, and tier alone cannot tell "reliable secondary account" from "unverified". |
| `research_finding` | T1, T2, T3 | `verified` | Findings sourced from an official, regulatory, or intergovernmental body carry the institutional traceability `verified` requires ("traced to a primary source with a provenance chain") — the closest mechanical proxy this schema has for the plan's "primary study source", stated as a proxy, not asserted as peer review. |
| `research_finding` | T4 (expert analysis) | `verified` | Our own editorial synthesis of an expert-analysis source, traced — matches `verified`'s definition directly; this is the closest proxy for "peer-reviewed" the tier scheme supports, and it is named as a proxy here rather than claimed as literal peer review. |
| `research_finding` | T5 (industry) | `community-corroborated` | Industry-sourced research is credible but not institutionally or academically vetted by this schema's own tier definitions — `community-corroborated`'s "still unverified" language fits better than `verified`'s "traced provenance chain" claim. |
| `research_finding` | T6, T7 | `NULL` (pre-vocabulary) | News-sourced or provisional-sourced findings have no traceable methodology signal at all. |
| `market_signal` | T1–T6 | `community-corroborated` | The plan's literal, unconditional instruction for this item_type — a signal is inherently a corroborated-not-verified class of claim by its own nature (spec 00's `market_signal` framing), independent of source tier, so no tier split is applied here. |
| `market_signal` | T7 (provisional) | `NULL` (pre-vocabulary) | A provisional source has not yet earned even the "corroborated" reading; distinguishing this one tier from the other six is conservative, not a stretch, since T7 is explicitly the not-yet-vetted tier. |
| `regional_data` | T1, T2, T3 | `official` | Official statistical and regulatory bodies (the Eurostat/BLS/state-register shape this item_type is built around) publishing their own regional figures. |
| `regional_data` | T4, T5 | `derived` | Our own compilation of an expert-analysis or industry source into a regional figure — `derived`'s definition ("our calculation from stated inputs under a named, versioned method") fits a compiled regional data point better than `verified`'s literal-source-tracing language, since a regional_data item is typically an aggregate rather than a single traced document. |
| `regional_data` | T6, T7 | `NULL` (pre-vocabulary) | News-derived or provisional regional figures carry no compilation-method signal to classify against. |
| `technology`, `innovation` | T1, T2, T3 | `verified` | Official/regulatory/IGO technology assessments are traced institutional content — `verified` fits directly. |
| `technology`, `innovation` | T4, T5 | `community-corroborated` | Expert-analysis or industry claims about emerging technology are exactly the "signal with the distribution shown, never a point estimate" class `community-corroborated` describes — credible but not institutionally settled. |
| `technology`, `innovation` | T6, T7 | `NULL` (pre-vocabulary) | No institutional or traceable-method signal. |
| `initiative` | T1, T2, T3 | `official` | An initiative launched or reported by an official/regulatory/IGO body is that body's own account of its own action. |
| `initiative` | T4, T5 | `partner` | Third-party (expert or industry) reporting on an initiative is licensed/secondary account territory, not the initiative-owner's own voice — closer to `partner`'s "licensed third party" than to `verified`'s "our editorial, traced to a primary source" (we are not the ones who traced it; the source did). |
| `initiative` | T6, T7 | `NULL` (pre-vocabulary) | News or provisional reporting on an initiative carries no institutional-voice signal. |
| `tool` | any tier | `NULL` (pre-vocabulary) — **not ruled on** | The master plan's own item_type grouping (WO-19 step 1) never mentions `tool`, and nothing in spec 00 §3.6 or vocabularies.mjs gives this item_type a semantic distinct from the others above. Stamping it by analogy to `technology`/`innovation` would be exactly the guessing the plan forbids. **This row needs an explicit operator ruling before it can leave NULL** — flagged here rather than silently decided. |

## 3. Expected row counts — ALL MARKED [PLAN-STATED], NONE VERIFIED THIS SESSION

This session authored the migration and this mapping with **no database access** (stated in its own
brief) and per rule 0.15 of the master plan, every number below is `[PLAN-STATED]` from Appendix A of
`master-execution-plan-2026-08-17.md` (1,062 total rows, 826 verified, 806 live-verified — themselves
measured 2026-08-18 and due for re-confirmation before this mapping runs, since the corpus moves: Addendum
26 itself records 631 items added in a single August bulk import). **No item_type × tier breakdown exists
anywhere this session could read** — Appendix A gives table-level counts, not the cross-tabulation this
mapping needs. The coordinator must run the query in §4 to get real counts before executing the backfill;
until then, no row/coverage number in this document should be treated as anything but a placeholder for
"the query has not been run yet."

## 4. Exact SQL for the coordinator

**Step 0 — reversibility (rule 015, binding before any write on the guarded path):** run the guarded write
path (`fsi-app/scripts/lib/db.mjs`), which snapshots the pre-mutation `intelligence_items.origin_class`
column state to `_snapshots/` before any UPDATE executes. Since every row's `origin_class` is NULL before
this backfill (migration 267 adds the column with no default and no backfill), the snapshot is trivial —
1,062 NULLs — but it is still the mechanism that makes this reversible: a single `UPDATE intelligence_items
SET origin_class = NULL` restores the pre-backfill state exactly, and the snapshot is the audit record that
proves it.

**Step 1 — measure the real cross-tabulation before ratifying anything above:**

```sql
SELECT
  ii.item_type,
  s.tier,
  count(*) AS n
FROM intelligence_items ii
LEFT JOIN sources s ON s.id = ii.source_id
GROUP BY ii.item_type, s.tier
ORDER BY ii.item_type, s.tier NULLS FIRST;
```

**Step 2 — the backfill itself (run only after §2's rule table is operator-ratified and Step 1's counts
have been reviewed against it — a tier/item_type cell with an unexpectedly large population is a reason to
re-open the rule, not a reason to run through it):**

```sql
UPDATE intelligence_items ii
SET origin_class = CASE
  WHEN ii.source_id IS NULL THEN NULL

  WHEN ii.item_type IN ('regulation', 'directive', 'standard')
    THEN CASE (SELECT s.tier FROM sources s WHERE s.id = ii.source_id)
      WHEN 1 THEN 'official' WHEN 2 THEN 'official' ELSE NULL END

  WHEN ii.item_type IN ('guidance', 'framework')
    THEN CASE (SELECT s.tier FROM sources s WHERE s.id = ii.source_id)
      WHEN 1 THEN 'official' WHEN 2 THEN 'official' WHEN 3 THEN 'official'
      WHEN 5 THEN 'partner' ELSE NULL END

  WHEN ii.item_type = 'research_finding'
    THEN CASE (SELECT s.tier FROM sources s WHERE s.id = ii.source_id)
      WHEN 1 THEN 'verified' WHEN 2 THEN 'verified' WHEN 3 THEN 'verified' WHEN 4 THEN 'verified'
      WHEN 5 THEN 'community-corroborated' ELSE NULL END

  WHEN ii.item_type = 'market_signal'
    THEN CASE WHEN (SELECT s.tier FROM sources s WHERE s.id = ii.source_id) BETWEEN 1 AND 6
      THEN 'community-corroborated' ELSE NULL END

  WHEN ii.item_type = 'regional_data'
    THEN CASE (SELECT s.tier FROM sources s WHERE s.id = ii.source_id)
      WHEN 1 THEN 'official' WHEN 2 THEN 'official' WHEN 3 THEN 'official'
      WHEN 4 THEN 'derived' WHEN 5 THEN 'derived' ELSE NULL END

  WHEN ii.item_type IN ('technology', 'innovation')
    THEN CASE (SELECT s.tier FROM sources s WHERE s.id = ii.source_id)
      WHEN 1 THEN 'verified' WHEN 2 THEN 'verified' WHEN 3 THEN 'verified'
      WHEN 4 THEN 'community-corroborated' WHEN 5 THEN 'community-corroborated' ELSE NULL END

  WHEN ii.item_type = 'initiative'
    THEN CASE (SELECT s.tier FROM sources s WHERE s.id = ii.source_id)
      WHEN 1 THEN 'official' WHEN 2 THEN 'official' WHEN 3 THEN 'official'
      WHEN 4 THEN 'partner' WHEN 5 THEN 'partner' ELSE NULL END

  -- item_type = 'tool': NOT RULED ON. Left NULL until the operator answers §2's flagged row.
  ELSE NULL
END
WHERE ii.origin_class IS NULL;   -- idempotent: a re-run only touches rows still unclassified
```

**Step 3 — post-backfill proof (coverage + zero-widening check, both must hold):**

```sql
-- Coverage: every row is either classified or explicitly pre-vocabulary, none left untouched by the CASE.
SELECT origin_class, count(*) FROM intelligence_items GROUP BY origin_class ORDER BY 2 DESC;

-- Zero-widening: only the live 7 values plus NULL ever appear (a CHECK constraint already guarantees
-- this at the DB level via migration 267's intelligence_items_origin_class_check — this query is the
-- belt to that constraint's braces).
SELECT DISTINCT origin_class FROM intelligence_items
WHERE origin_class IS NOT NULL
  AND origin_class NOT IN ('community','community-corroborated','modelled','derived','partner','verified','official');
-- must return ZERO rows
```

## 5. What is explicitly NOT decided here

- **`tool` item_type** — no rule; needs an operator ruling before this backfill can run to completion
  (§2's flagged row). Running the backfill with `tool` left NULL is safe (NULL is always a legal outcome);
  ratifying the OTHER 11 item_types and deferring `tool` separately is a valid partial-ratification path.
- **NOT NULL.** This backfill does not, and must not, set `origin_class NOT NULL` on
  `intelligence_items`. Per the master plan (WO-19 step 2) and migration 267's own header, that is a
  separate, later migration, decided only once the residual-NULL population (item_type = `tool`, any
  `source_id IS NULL` row, any of the explicitly-NULL tier cells above) is a reviewed, accepted "pre-
  vocabulary" set rather than an oversight.
- **`regional_data_facts` and `state_cost_facts` origin_class backfill** — out of scope, see §1.
