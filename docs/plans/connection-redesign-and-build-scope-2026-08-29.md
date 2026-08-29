# Connection-layer redesign + full build scope (2026-08-29)

**Status: ⛔ OPERATOR REVIEW — nothing below executes until ruled.** Written against `origin/master`
`fb11762` and the live DB (`kwrsbpiseruzbfwjpvsp`), after a full (not skimmed) read of every file in
the connection layer, its producers, its consumers, the governing ADRs (018/019/020), the flywheel
build plan (U0–U9), the recursive-compounding plan, and master execution plan v2. Every data claim
below is `[CONFIRMED]` by a live query or full file read this session unless labelled otherwise.

Vault landing path when ratified: `docs/plans/connection-redesign-and-build-scope-2026-08-29.md`.

---

## 1. What a connection is FOR (out of the box we built)

The repo's own primary sources, not a new invention:

- `discover.mjs:3` — *"The differentiator: each surface educated by the others."*
- `specs/08-flywheel-design.md` — the failure prevented: *"five surfaces that each look intelligent,
  share a navigation bar, and silently disagree."*
- `recursive-compounding-discovery-2026-08-10.md` L2 — a cluster's shape reveals what is MISSING;
  gaps become discovery targets. **Edges are also the substrate that tells the system what to ingest
  next.**

So a connection has exactly three jobs: (1) route a reader from one surface to the related thing on
another surface, (2) group items into themes that carry briefs, (3) expose gaps that feed discovery.
Anything in the layer serving none of those three jobs is dead weight.

**The box we were in:** treating "connection" as one thing — a co-occurrence score above a floor —
and then debating the floor. The corpus itself shows THREE distinct connection classes with
different mechanics, only one of which the scorer models:

| Class | Mechanism | State today |
|---|---|---|
| **Affinity** — items about the same operational reality | shared scenario/compliance/jurisdiction tags, idf-weighted (ADR-019) | LIVE and healthy — 1,703 of 1,863 edges carry ≥2 basis entries, 93.6% cross-type |
| **Family** — siblings under one enabling instrument (six member-state fuel-excise derogations; RED II scheme-recognition decisions) | today: only via a shared scenario tag at the floor | the 160 near-floor edges ARE this class — all exactly 0.3000, 151/160 single-basis. Semantically correct, structurally minimum |
| **Lineage** — child act → parent act (implements / amends / derogates under) | NOT modelled. `entity-resolve.mjs:105` already names it: *"those references are valuable RELATIONSHIP data — implementing-act → parent-act linkage. Capturing them as edges is a future capability"* | 42 live items name a parent instrument in their title; typed edges: zero |

Measured this session on the live 274-item corpus: 26 implementing/delegated acts, 10 authorising
decisions, 42 items whose title names a parent instrument (43 mentions). Of those 43 parent
mentions, only **9 resolve to an item inside the live corpus** (3 of those 9 pairs have no edge at
all today). The other **~33 point at instruments NOT in the corpus** — which is not a defect, it is
**the L2 gap signal**: the corpus holds children whose enabling acts it does not hold. That is
exactly the "cluster shape reveals what is missing" loop, delivered by data we already store.

---

## 2. What the full read found broken (evidence per item)

### 2.1 `same_instrument` is dead by construction, not dormant `[CONFIRMED]`

`discover.mjs:111` fires on equal `canonical_instrument_key`, weight 0.9, the layer's strongest
signal. Migration 200's partial unique index `uq_intelligence_items_canonical_key_verified_live`
guarantees the key is UNIQUE over exactly the population both production callers load
(`backfill-edges.mjs:53`, `mint-item.ts:270-271`: verified + non-archived). Invariant EP-11
(`canonical-key-uniqueness.mjs`, data-audit lane) enforces the same. Two items in the discovery
corpus can never share a key. 0 of 1,863 edges carry the signal; live key population 661 keys /
658 distinct / every duplicate has exactly one verified-live row. The column means IDENTITY
(migration 200's twin-defect guard, kept); the scorer treated it as GROUPING. Identity won, by
design, and the guard is correct — the scorer branch is the dead half.

`discover.test.mjs:9-16` green-tests this signal with an input (two verified-live items, one key)
the schema makes impossible — CLAUDE.md rule 15's "proof that does not execute" one level deeper: a
proof that executes over an impossible world.

### 2.2 A dead fetch on three hot pages `[CONFIRMED]`

`supabase-server.ts:167 fetchXrefPairs()` (`.limit(500)` over a 1,924-row table, comment says
"currently ~50 pairs") runs on the dashboard, map, and listings data paths (lines 1644/1892/2028)
inside their 8s `Promise.all`. Its only consumers, `getXrefs`/`getVerification` in
`verification.ts`, are imported by **nothing** (repo-wide grep: zero call sites). The pairs thread
through `data.ts` types and die. Every dashboard/map/listings load pays a 500-row query + payload
for data no component renders. Separately `src/data/index.ts:41` exports a static seed `xrefPairs`.
CLAUDE.md rule 9: deprecation means deletion.

### 2.3 The record is wrong in two places `[CONFIRMED]`

- The L4 flag `connections-scorer/threshold-floor-0.30` and `docs/ops/u6-theme-briefs-run-2026-08-21.md`
  say the near-floor band comes from *"a single low-idf shared_scenario tag."* Measured: those tags
  carry **idf = 1.000** (REF_FREQ 11.5; `fuel-excise-duty-relief` freq 6 → full weight). ADR-019
  only discounts above-median tags and says so. `[REFUTED]` per rule 14 — correct in place.
- The U6 run record's counts (1,954 edges / 178 near-floor) predate the vocabulary retirement; live
  is 1,863 / 160.

### 2.4 Typed relationships are rendered but never produced `[CONFIRMED]`

`connection-view-model.mjs:14 RELATIONSHIP_LABEL` already renders `supersedes / implements /
conflicts / amends / depends_on`. Live `relationship` values are only `related` and `references` —
no producer emits a typed value. The UI vocabulary for lineage exists; the producer doesn't. This is
the same built-but-unfed class the flywheel plan exists to close.

### 2.5 What is NOT broken (anti-scope — binding unless overruled)

- **The 0.30 floor stays.** The near-floor edges are correct family clusters (verbatim rows read:
  the six-state fuel-excise family, the RED II scheme-recognition family). A1 closes "no scorer
  change". Raising the floor would delete 160 of the most on-topic edges.
- **ADR-019 idf stays.** Measured working exactly as designed; domain-defining tags at full weight.
- **ADR-018 both-directions-at-rest stays.** The 644 double-stored pairs are the DECIDED shape
  (source-filtered readers need both). No halving migration. (Corrects my own earlier "worth a
  cleanup" remark — it would have violated ADR-018.)
- **Migration 200's unique index and EP-11 stay.** The twin-defect guard is right.
- **`cluster.mjs`, `gaps.mjs`, `pair-view.mjs`, `theme-stats.mjs`, `brief-staleness.mjs`,
  `write-edges.mjs`, both admin routes/views, the card** — read in full; sound; no changes beyond
  comment corrections where they restate the same_instrument weight.

---

## 3. The redesign, as work orders (Sonnet-executor grade)

Numbered to follow WO-26. Every WO inherits the standing executor contract (§5). "Gates" =
`sh fsi-app/.discipline/run-test-suite.sh` (currently 1421/1421) + `tsc` clean + fitness 21/0 +
memory-gate files in the same PR.

### WO-27 — Remove the parts that are breaking it ($0, no schema, no ruling needed beyond this doc)

**A. Delete the dead signal.**
- `discover.mjs`: remove the `same_instrument` branch (lines 110-113) and `W.same_instrument`;
  replace with a comment naming `uq_intelligence_items_canonical_key_verified_live` + EP-11 as the
  reason the signal is structurally impossible (so nobody re-adds it).
- `discover.test.mjs`: delete the two impossible-input tests (`same instrument dominates`,
  `sameSurfaceStrong`); the remaining assertions keep the suite honest.
- Correct the weight-listing comments that restate 0.9: `pair-view.mjs:23-27`,
  `IntersectionDetectionView.tsx:10-13`.
- Prove no graph change: signal appears on 0/1,863 edges, so a `--dry` backfill run before/after
  must produce identical edge sets (executor states the diff).

**B. Delete the dead fetch chain.**
- Remove `fetchXrefPairs` + its three call sites + the `xrefPairs` threading in `data.ts` (types,
  fallbacks) + `verification.ts` entirely + the `src/data/index.ts` static export + the
  `VerificationResult` type if nothing else consumes it (executor re-greps before deleting).
- Verification: repo-wide grep zero for `xrefPairs|getXrefs|getVerification`; the three pages build
  and render; suite/tsc/fitness green.

**C. Correct the record (rule 14, in place).**
- `integrity_flags`: update the A1 flag text (low-idf → full-idf, counts 178→160), close A2/A3/A4
  per the standing verdicts, close A5 as `[REFUTED — dead by construction, removed in WO-27]`.
  Guarded path, rule-015 snapshot first.
- `docs/ops/u6-theme-briefs-run-2026-08-21.md`: append a dated correction block (never rewrite
  history silently).
- Session-log addendum + PROGRAM-BOARD row in the same PR (memory gate).

**D. ADR-021** — "Connection classes: identity is not grouping." Records: the three-class model
(§1), the same_instrument removal and its proof, the anti-scope list (§2.5), and that the family
class is served today by scenario tags at the floor (accepted, documented). Small ADR, follows
ADR-009 frontmatter.

*Stop conditions: none — documentation + deletion of provably-dead code + guarded flag updates, all
inside standing merge authority. No migration, no live-data deletion, no spend.*

### WO-28 — Lineage: typed parent-act edges + the gap feed ($0 compute; one ⛔ check)

The future capability `entity-resolve.mjs` names, built where that file says it belongs.

**A. Relationship typing (pure).** Extend `entity-resolve.mjs` (one home — do NOT create a parallel
module): classify a detected in-title reference by pattern —
`Implementing Regulation … of Regulation X` → `implements`; `Delegated Regulation …
supplementing X` → `depends_on` (label exists) or `amends` per pattern; `… amending X` → `amends`;
`authorising … in accordance with Article N of Directive X` → `derogates_under` (NEW label —
add to `RELATIONSHIP_LABEL` in `connection-view-model.mjs`, one line + test). `planLinkWrites`
emits the typed relationship instead of blanket `related` when a pattern matches; direction is
child → parent. Pure, deterministic, unit-tested with fixtures from the live titles read this
session.

**B. The gap feed (the compounding half).** A parent mention that resolves to ZERO corpus items is
not noise — it is an L2 discovery target ("child in corpus, enabling act absent"). Emit it as an
`integrity_flags` coverage_gap candidate under a distinct namespace (`lineage-gap:` — mirror
`analyze-corpus.mjs`'s `flywheel-gap:` dedup/resolve pattern exactly, including resolve-on-refresh).
Sized live: ~33 unresolved parent mentions today → a bounded first crop, not a flood.

**C. Wiring.** `linkStep` already runs per generation (`generate-brief.ts:292`) — typing rides it
with no new schedule. A one-shot backfill invocation over the 42 title-mention items runs via the
existing script conventions, operator-cadence, default off (Execution-model ruling).

*Stop condition RESOLVED `[CONFIRMED this session]`:* `item_cross_references_relationship_check`
allows exactly `{related, supersedes, implements, conflicts, amends, depends_on}`. So:
- **Phase 1 (no migration):** ship `implements` / `amends` / `depends_on` typing — all already
  permitted by the CHECK.
- **`derogates_under` is NOT in the CHECK** — adding it is a one-line CHECK widening that rides the
  WO-12/19 migration window (batch the DDL); until then derogation patterns emit `depends_on`
  with the precise verb kept in an edge `basis` entry, so no information is lost while the CHECK
  waits.

**Latent defect found while verifying (fix in WO-28, test-first):** `mint-item.ts:251` writes
`relationship: "references"` for the news-duplicate link edge — a value the CHECK **forbids** — and
the error is swallowed by `.then(() => {}, () => {})`. Live table confirms: relationship values are
100% `related` (1,863 pd + 51 manual + 10 entity), zero `references` rows ever. **Every
`dedup:linked` mint has silently failed to write its edge** since the CHECK landed. Fix: write a
CHECK-legal value (`related`, or `depends_on` once typed), and add a test that fails on a
CHECK-violating relationship literal anywhere in src/ (grep-based, same pattern as
vocab-drift-guard).
*Expected effect: 9 in-corpus pairs gain typed edges (3 brand new), the card starts rendering
"Implements / Amends / Depends on" labels it already knows, the dedup:linked edge write works for
the first time, and the gap queue gains its first lineage-shaped discovery targets.*

### WO-29 — Family basis, deferred until the evidence says build (explicitly NOT now)

A stored `instrument_family_key` (migration + deriver + backfill) was considered and is **rejected
for now**: only 9 parent links resolve in-corpus, so a family key would corroborate almost nothing
the scenario tags don't already carry. Revisit trigger, recorded so it isn't lost: when WO-28's gap
feed has pulled enabling acts into the corpus and resolved lineage pairs exceed ~50, a family basis
signal earns an ADR + comparative replay (the ADR-019 method — never a direct scorer edit).

---

## 4. The rest of the build, integrated (sequence + status, from plan v2 + rulings on record)

Rulings already held (Addendum 26 — not re-asked): WO-12.3 RE-KEY the 75 rows · WO-16.2 FEED
`published_price_statistics` from `market_series` · WO-19 proceed, 7-value vocabulary NOT widened,
backfill mapping ⛔ ratify before run.

| Order | Work | Why here | Gate state |
|---|---|---|---|
| 1 | **WO-27** (removals + record) | $0, independent, shrinks the layer before anything builds on it | none |
| 2 | **WO-19** `origin_class` → items/facts | **CLOCK — unclassifiable retroactively**; every day of intake is unlabelled data | ⛔ backfill mapping table ratification (the mapping, not the WO) |
| 3 | **WO-12** envelope extension (contracts-module codegen, migration, RE-KEY per ruling) | same contracts-home family as WO-19; one migration window can carry both | ⛔ DDL window (two-track policy) |
| 4 | **WO-20** assumption register | completes the Stage 8 spine; confirmed greenfield (no table) | none beyond spine |
| 5 | **WO-28** (lineage) | rides regeneration wiring; benefits from spine's origin_class stamping new edges' items | none for phase 1 (CHECK verified — implements/amends/depends_on legal today); `derogates_under` rides the WO-12/19 DDL window |
| 6 | **WO-16 → 17 → 18** producers | gated by spine per plan v2; every row lands enveloped + classed from day one | WO-16 kill-switched, default off |
| 7 | **WO-13/14/23/24** Market · **WO-10/11/21/22** Operations · **WO-15/25** Research | v2 Stage 4-6 order; WO-13 executes the WO-5 B4 re-point + B1 chip if ruled yes | ⛔ WO-5 rulings B1-B4 (4 open) |
| 8 | **U7** contract advance (graph candidates into briefs) | wants WO-27/28's cleaner graph first; A3 asserts only graph-shown links | regeneration = metered, pilot-first, priced |
| 9 | **U8** drift gate | independent, anytime, $0 | none |
| — | **U9** | **Discrepancy, flagged:** listed "not started," but the U9 components are ON MASTER and wired (`ItemConnectionsCard`, `connection-view-model.mjs`, `resource-lookup.ts`, all four detail surfaces — headers cite "flywheel U9 (D1)"). Owed: a close-out audit against the U9 definition, not a build | audit, then board correction |

**Vault gap, named:** the governing texts for WO-10/11/13/14/15/20/21/22/24/25 exist only in the
never-committed v1 plan (v2 says "v1 text governs the rest"; v1 lives in chat). **Each needs a
spec-from-repo pass (v2 rule 0.15 schema re-read + consumer read) landing a corrected WO text in
the vault before a Sonnet executor touches it.** WO-20's is small (confirmed greenfield); the
Stage 4-6 ones are the real exposure.

---

## 5. Executor contract (binding on every agent running a WO above)

1. `/ledger` first; after any compaction, again. Read this doc + the WO's named files IN FULL.
2. Rule 0.15: re-read every touched table's schema + live count; diff against this doc's claims;
   STOP on mismatch.
3. Worktree + PR only (RD-19); never the main checkout; never `--no-verify`; never `git add -A`
   (two CRLF-noise files); commit named files.
4. Gates before PR: canonical suite (`sh fsi-app/.discipline/run-test-suite.sh` — NOT `npm test`),
   `tsc`, fitness functions, memory-gate files in the same PR.
5. $0 default. Any metered call: STOP, price, wait. ⛔ rows are hard stops. Schema/DDL waits for
   the operator window (two-track policy). Data writes: guarded path + rule-015 snapshot.
6. Rule 14 labels on every reported finding; rule B10 on every claimed limit.

---

## 6a. Multi-agent execution model (Sonnet lanes, zero-overlap by construction)

Coordinator: the Fable session (this one) — owns sequencing, all DB writes, all memory-file writes,
and landing. Executors: **Sonnet agents, one lane each**. Non-overlap is enforced by three
mechanical rules, not by hope:

1. **File ownership.** Each lane's prompt names its writable file set; a lane may READ anything but
   WRITE only its named files (rule B6, one writer per file). Lanes in the same wave have provably
   disjoint write sets, listed below.
2. **Memory files are coordinator-only.** No agent ever touches `docs/ops/session-log.md`,
   `docs/PROGRAM-BOARD.md`, or `docs/INDEX.md`. The coordinator appends them once per landing —
   work parallelizes, landings serialize, so the three append-heavy shared files can never conflict.
3. **DB writes are coordinator-only** (guarded path + rule-015 snapshot, one writer per system).
   Agents produce code and reports; they never hold service-role credentials.

| Wave | Parallel lanes (write set per lane) | Serialized because |
|---|---|---|
| **1 — now** | **A:** WO-27A dead signal — `discover.mjs`, `discover.test.mjs`, `pair-view.mjs`, `IntersectionDetectionView.tsx` ∥ **B:** WO-27B dead fetch — `supabase-server.ts`, `data.ts`, `verification.ts` (delete), `src/data/index.ts`, `types/resource.ts` (VerificationResult only) | **C** (flag updates, DB) and **D** (ADR-021 + record corrections + memory files) are coordinator work, C parallel to A/B, D after A/B so the addendum states measured results |
| **2** | WO-19+12 authoring (contracts module + migration family — ONE lane, they share `factor-tier.mjs`/`source-licence.mjs`) ∥ WO-28 phase 1 (`entity-resolve.mjs`, `entity-resolve.test.mjs`, `link-items.ts`, `connection-view-model.mjs` + test, `mint-item.ts` references-fix) ∥ WO-20 spec-from-repo (new doc only) ∥ U8 drift gate (`.discipline/` only) ∥ U9 close-out audit (read-only) | WO-19/12's migration waits for the DDL window; everything else in the wave is code/docs |
| **3** | WO-16 (new `market_series` + producers) ∥ WO-17 (`regional_data_facts` producers) ∥ WO-18 (`emission_factors` seeders via `scripts/gen/`) | all gated on wave 2's applied spine DDL; write sets disjoint by table/producer directory |
| **4** | Market lane (WO-13→14→23→24) ∥ Operations lane (WO-10→11→21→22) ∥ Research lane (WO-15→25) | serialized WITHIN each lane (same surface components), parallel ACROSS lanes (disjoint `src/components/<surface>` + `src/app/<surface>` trees); each WO's spec-from-repo pass lands before its executor starts |
| **5** | U7 contract advance (single lane — touches `system-prompt.ts` + `contract-version.mjs`, the two-homes guard) | metered regeneration stays operator-priced |

**Landing protocol (per PR):** agents finish → coordinator runs the canonical suite + `tsc` +
fitness once over the merged worktree → coordinator writes the memory files → single browser
landing (branch → per-directory upload → empty-diff gate → PR → checks → merge under standing
authority). One PR in flight per repo at a time; the next wave's agents may already be working
while a PR lands, because their write sets exclude the landing set.

---

## 6. What needs Jason before execution starts

1. **Ratify this scope** (or amend): the three-class model, WO-27/28 as specced, WO-29 deferred,
   the sequence in §4.
2. **A1 close-out**: "no scorer change" per §2.5 (the flag text correction rides WO-27 regardless).
3. **WO-19 backfill mapping** ratification when presented (the WO itself is already ruled proceed).
4. **WO-5 rulings B1-B4** (unchanged, four rows — B2 near-moot at 45/48 populated, B4 recommended
   re-point-in-WO-13).
5. **DDL window** for the WO-12(+19) migration family when authored.
