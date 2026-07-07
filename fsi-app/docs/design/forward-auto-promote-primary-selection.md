# Design: Forward auto-promote of the highest-authority enacted source (primary selection)

**Status:** DESIGN ONLY (awaiting operator review). Not built. 2026-06-23.
**Relates to:** the truncation fix (PR #155), the backward promote-from-pool operation, the
authority-origin classifier (accuracy-moat doctrine), invariant SC-7 (claims-tier stamp).

## 1. The defect this prevents (root cause, mechanical)

The pipeline fixes the brief's **primary source** as `intelligence_items.source_url`,
unconditionally, at generate time:

- `generateOnce` ([canonical-pipeline.ts:402-410](../../src/lib/agent/canonical-pipeline.ts#L402-L410))
  fetches `it.source_url` as the primary. It is reconsidered **only on a roadblock**
  (timeout / stub / challenge / wrong-language) via the bounded alternative search — a
  *discovery* trigger, never an *authority* trigger.
- `buildSourceBlocks` ([canonical-pipeline.ts:127-134](../../src/lib/agent/canonical-pipeline.ts#L127-L134))
  destructures `[primary, ...corr] = fetched` and makes `it.source_url` **block 0** — the full,
  budget-privileged source that both synthesis (R1) and grounding (R2) read first.

So when `source_url` is a **portal/landing page** (a DG-ENV topic page, an agency programme page)
but the item's own discovered corroborator pool already contains the **enacted legal text**
(EUR-Lex CELEX, ELI, Federal Register, legislation.gov.uk), the pipeline still grounds against the
portal. The enacted text is present, higher-authority, and ignored. This is the corpus-wide
PORTAL-SOURCE defect (≥17 flagship regs) that the backward pass now cleans up one item at a time.

**The fix makes it not recur:** if primary selection *preferred the highest-authority enacted
source available* (whether that is `source_url` or a discovered corroborator), new items
self-correct at generation, and the backward pass shrinks to a one-time legacy cleanup.

## 2. The mechanism

At generate time, before fixing the primary, classify the **authority** of every candidate URL —
`source_url` plus the discovered corroborator URLs — and pick the primary by authority, not by
position.

Two signals, both already present in the codebase (one production, one prototype):

1. **Institutional tier** — `buildResolver(sources).resolveSpan(url) → {tier, sourceId}`
   ([institution.ts:62-80](../../src/lib/sources/institution.ts#L62-L80)). The canonical
   authority engine; already consumed by the grounding tier-stamp (SC-7). Lower tier = higher
   authority (T1 binding law … T7 overflow).
2. **Enacted-document shape** — a URL is the *enacted legal text* vs a portal/proposal. The
   prototype classifier is `classifyUrl` in `scripts/_diag/_reg-promote-from-pool.mjs`
   (CELEX/ELI score 6, FedReg/UK-law 5, IMO/BR/CA 4; **COM proposal and bare homepage score 0 and
   are never eligible**). This is the half that distinguishes "EUR-Lex CELEX of the Regulation"
   from "EUR-Lex homepage".

**Selection rule (proposed):** prefer candidate B over the current primary A as block-0 iff
B `isEnactedDocument` AND `institutionalTier(B) ≤ institutionalTier(A)` (strictly higher authority,
or equal authority but A is a portal and B is the enacted text). A tie or any ambiguity keeps A —
**conservative: never demote a working enacted primary, only promote over a portal.** The original
`source_url` is retained in the pool as a corroborator (no information lost). The promotion is
recorded (provenance event) so the surface can show *why* the brief grounds where it does.

**Reg-number guard (the multi-CELEX lesson):** the backward dry-run proved that a pool can hold
several enacted CELEXes (Euro 7's pool held HDV's 2019/1242; ETS-Shipping's held FuelEU's 2023/1805).
Highest-authority-score alone mis-picks. So the forward rule must also require the candidate to
**match the item** — its reg-number/title must correspond to the item, not merely be the
highest-scored enacted doc in the pool. For forward generation this is cheaper than the backward
case because the item's title + the generating query constrain the match; the rule should still
**refuse to auto-promote on ambiguity** and leave `source_url` as-is (the conservative default),
surfacing the candidate for review rather than guessing.

## 3. Convergence with the authority-origin classifier (the thing to surface)

**This IS authority-origin applied to source-selection.** The accuracy-moat doctrine defines
authority-origin as *per-claim grounding-eligibility* — is this span grounded in a source eligible
to confer grounding for this claim. "Prefer the highest-authority enacted source as primary" is the
same question asked one level up: *is this URL eligible to be the grounding substrate at all.*

Both consume the **same two signals** (institutional tier + enacted-document shape). Therefore
**build one authority module, not two:**

```
classifyAuthority(url, resolver) -> {
  institutionalTier,        // from buildResolver().resolveSpan(url)  (institution.ts)
  isEnactedDocument,        // from the promoted classifyUrl (CELEX/ELI/FedReg/… ; proposal/homepage = false)
  eligibleAsPrimary,        // tier + enacted-shape gate (this design)
}
```

- **Source-selection** (this design) consumes it to pick block-0.
- **The authority-origin classifier** (per-claim grounding-eligibility) consumes the same module to
  decide whether a claim's span sits in a grounding-eligible source.

The enacted-document classifier currently lives only as the `_diag` prototype `classifyUrl`. The
**first build step is to promote it out of scratch** into `src/lib/sources/` as the shared module —
NOT to reimplement it in the pipeline and again in the classifier. Surfacing this convergence is the
point: one module, two consumers, so the authority definition has a single home (the same
single-home discipline that institution.ts already enforces for tier).

## 4. Scope / non-goals

- **In scope:** primary-selection at generate time; promotion of the enacted classifier to a shared
  `src/lib/sources/` module; a recorded provenance event when the primary is auto-promoted.
- **Non-goal — legal role determination.** This selects the *source of text*, never matches the
  workspace to a defined role. The legal line (feedback: no-legal-role-determination) is untouched.
- **Non-goal — re-discovery.** This reorders *already-discovered* candidates by authority; it does
  not add a search. (Retrieval-before-generation / RD-8.)
- **Non-goal — demoting a good enacted primary.** Conservative: only promote over a portal/landing
  primary; tie/ambiguity keeps `source_url`.
- **Non-goal — the backward cleanup.** Existing portal-grounded items are handled by the
  promote-from-pool backward pass; this only stops *new* items from joining that backlog.

## 5. Risk + the test that proves it

- **Risk: a wrong auto-promote grounds the brief against the wrong law.** Mitigated by the
  reg-number-match guard + refuse-on-ambiguity + conservative-keep-source_url default. The
  institutional-tier floor (migration 141 / validate_item_provenance) is the backstop: a
  sub-floor or mismatched promote still has to clear grounding, exactly as the roadblock
  alternative-search does today (RD-7).
- **Proof-on-one before scale:** run it on an item whose `source_url` is a portal and whose pool
  holds the matching enacted CELEX, confirm (a) block-0 flips to the enacted text, (b) the brief
  reaches PPWR-level qualification density, (c) the legal line holds, (d) a wrong-CELEX pool
  (Euro 7-shaped) is **refused**, not mis-promoted. Same bar as the CBAM backward prove-on-one.

## 6. Recommendation

Build it as **one authority module** (promote `classifyUrl` → `src/lib/sources/`, add
`classifyAuthority`), consumed by both primary-selection and the authority-origin classifier.
Sequence it **after** the backward pass proves the promote-from-pool operation end-to-end (CBAM →
batch), because the backward pass validates the same enacted-classifier + reg-number-match logic on
real corpus data first — so the forward build inherits a tested classifier rather than a fresh one.
Do **not** fold this into the promote-from-pool tool (that is the one-time backward operator tool;
this is permanent pipeline logic with a different test surface).
