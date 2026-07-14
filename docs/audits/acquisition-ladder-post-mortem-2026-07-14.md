# Acquisition-ladder post-mortem + discovery-rung completion (2026-07-14)

The operator's CRITICAL DISPATCH findings, logged verbatim, plus what was built to close them. The acquisition
ladder was incomplete: it had no rung that generates a NEW candidate URL — no "find where the document lives"
step — so every disposition made under it ("exhausted", "quarantined", "ungroundable", "thin") is suspect
until re-diagnosed through the completed ladder.

Related: [rd33-retro-apply](./rd33-retro-apply-2026-07-14.md) ·
[fetch-align-diff-engine](../plans/fetch-align-diff-engine-2026-07-14.md) ·
[dispatch-discipline-protocol](../runbooks/dispatch-discipline-protocol.md) (this is the largest instance of
the failure class it names). Doctrines: `referenced-law-exists` (RD-34), `caller-count-is-not-wiring-verification`
(RD-35), `no-shadow-capability`.

## PART 1 — What was broken (operator, verbatim intent)

**Specified system (skill + doctrine):** earth-exhaustion says "researched to exhaustion." RD-7 is
roadblock-alternative-search. env-policy specifies intelligent acquisition: if one transport fails, try
another; if the data doesn't live at the held URL, FIND the URL where it does.

**Built system:** the ladder as implemented was reground-from-stored-pool → re-fetch THE SAME URL →
re-research THE SAME POOL → hold/erase. Every rung re-interrogated content already held or one fixed address.
There was NO rung that generates a new candidate URL. The exhaustion records prove it: "1 (candidate ×
transport)" — one candidate, always. la-eweo failed 5× against the same 175-byte stub and the system called
that exhaustion. It exhausted nothing — it retried one dead address.

**Why built wrong:** the ladder was built during the freeze era (scrape hold + loop OFF), when a
search-for-primary step could not legally fire. It was deferred instead of built-but-gated. The skill kept
saying the system does it; no dispatch flagged the constraint as unenforced; the gap sat invisible until the
operator's manual Google searches performed the missing rung by hand and found in seconds what the machine
failed to find in 5 runs (CELEX 32024R1610 for eu-trucking; the codified LAMC for la-eweo). **The largest
instance of the named failure class: skill prose without a code path.**

**Compounding defects (confirmed by the holdings audit):**
- (a) CAPTURE QUALITY: the corroborator 60KB cap amputated large documents; portal shells stored as
  "captures" (550KB → 52 clean chars); 175-byte stubs recorded as holdings.
- (b) NON-ENGLISH EXTRACTION: g14 holds 956KB of clean Spanish gazette and produced 0 claims over 5 runs —
  silent extraction failure, never flagged as language-specific.
- (c) DISCOVERY ABSENT AT MINT TOO: items were only ever as good as the URL they were minted with; a wrong
  variant (trailing-slash CELEX, consultation page, press release) doomed the item permanently.

## PART 2 — What the investigation actually found (findings-before-fixes)

The discovery rung was **not entirely absent** — `seek-more.mjs` (resolvers eurlex/uk/lovdata/gazette/api +
`generateCandidates` + `runSeekMore` + `exhaustionFlagRow`/`persistExhaustionRecord`) is a fully-built,
unit-tested discovery unit. **It had ZERO live callers** — dormant on an unactioned wake-list, its own test the
only caller — while the live ladder (`fetchPrimaryDeep`) ran an inferior **title-only** `webSearchAlternatives`
shadow. This is the operator's predicted **ruled≠done / dormant-capability** finding, and the shadow-capability
one-home violation (two search mechanisms, the inferior one live).

The WIRING TRUTH SWEEP (read-only capability×context census, same day) confirmed it and its siblings; the
headline sibling it surfaced is the **split-wake asymmetry** (see PART 3).

## PART 3 — What was built (Unit 1, this dispatch — WIRE, DON'T REBUILD)

- **Discovery derivation completed** (`identifier-variants.mjs`, 11 goldens incl. the mandated
  `eli/reg/2024/1610/oj` → CELEX `32024R1610` + fetchable `/legal-content` URL): the deltas seek-more lacked —
  bare-number→CELEX with type fan-out, separator mutations, US Federal-Register-by-doc, endpoint-search
  ladder, SC-13 deterministic ranker.
- **Folded into the one home**: `seek-more.generateCandidates` now merges the richer derivation
  (consolidation-is-behavior-preserving); identifier-resolved canonical URLs → source's own search surface →
  open-web LAST.
- **Wired into the live ladder**: `fetchPrimaryDeep` injects `generateCandidates` as `discoverCandidates` into
  `fetchPrimaryWithFallback` (discovery-first). The title-only `webSearchAlternatives` shadow was **retired**
  (folded into the one home, not left standing).
- **Split-wake closed**: `persistPrimaryExhaustion` writes the durable N×M exhaustion record
  (`persistExhaustionRecord`) at the exhaustion point, so a hold/erase carries proof-of-exhaustion
  (earth-exhaustion / RD-34) — not just an ephemeral in-memory array. (The discovery half had been woken
  without the persistence half — the census's headline finding.)
- **Furniture inline gate**: `looksLikeFurniture` (conservative — never false-rejects real thin legal text)
  wired into `captureForStorage`, so a chrome-only shell is excluded at capture, not stored as a holding.
- **Behavioral flow-golden** (`reground-ladder.golden.test.mjs`): a failing item → declared-primary roadblock
  → discovery derives the CELEX candidate → win; and total exhaustion → the full N×M record. Unit 1's exit
  test — caller-count is not wiring verification (RD-35).

## PART 4 — WIRING TRUTH SWEEP: dormant-list + capability census (census agent, read-only, $0)

Seek-more's true siblings (UNACTIONED — built/ruled, no named wake), spend/disposition-path first:

1. **[DISPOSITION] durable exhaustion record not persisted** — CLOSED this dispatch (persistPrimaryExhaustion).
2. **[SPEND+DISPOSITION] `runSeekMore` uncalled** — the one home unifying discovery + persist + winner-capture;
   discovery was wired via `generateCandidates` directly, leaving `runSeekMore` superseded. Reconcile or retire.
3. **[DATA DISPOSITION] furniture detector not inline** — CLOSED this dispatch (`looksLikeFurniture` at capture).
4. **[DISPOSITION-adjacent] `source_conflicts` writer-less** (`openSourceConflict` 0 callers) — `evaluateDemotion.critical_conflict` stub stays unfed.
5. **[SPEND-latent] `/api/admin/sources/verify`** runs `verifyCandidate` (fetch+Haiku) with no pause gate — caller-less today.
6. **[GOVERNANCE] `surface-visibility-audit.mjs` unwired** — nothing re-runs it.
7. **[NEW DEAD CODE] `webSearchAlternatives`** — retired into the one home; the def is now a comment (removed).
8. Lower: dead exports (`auditSections`, `checkFetchQuality`, `VERIFICATION_HAIKU_SYSTEM_PROMPT`), dead RPCs, notifications trio, `trajectory_points` read-no-writer.

Items 2, 4, 5, 6 remain open — the flow-golden backlog + dormant-sibling remediation, sequenced after GATE A.

## PART 5 — Consequence (the reframe)

DATA INTEGRITY is intact (the floor never certified the bad captures — zero false-verified items). DATA REACH
was failing silently and mislabeling its failures. Therefore **the entire quarantine population is re-diagnosed
through the completed ladder (Unit 2, $0) before any further disposition, delete, or spend.** The re-diagnosed
population table — not the stale manifest — is the input to the resumed pass. Reported at GATE A alongside the
census findings and the dormant-list action status.

## Compounding-defect disposition (honest scope, per dispatch-discipline)

- **60KB cap**: reconciled — `PRIMARY_MAX_CHARS=600000` (primary un-capped post-#155); the 60KB is
  `CORROBORATOR_MAX_CHARS`. Floor-qualifiers already reach the model in FULL via the truncation-moat
  tier-ordering (source-blocks.mjs). Residual = mis-attribution cases, covered by floor-first attribution. No
  rewrite; documented.
- **Non-English extraction (g14)**: diagnosed as a Spanish-gazette extraction failure (URL fine, 956KB clean
  held, 0 claims). Flagged as a **named per-language capability gap** — Unit 2 records it as the `language`
  blocker class; a non-EN extraction fix is a named follow-on, not a silent 0-claim run.
