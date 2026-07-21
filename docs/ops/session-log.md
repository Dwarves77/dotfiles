# Session Log

Dated, appended entries. Newest first. Per the operating manual (standing rule #6 +
self-annealing protocol), session state lives here — never in `CLAUDE.md` (doctrine, not state).

---

## 2026-07-18 — Session E execution lane COMPLETE (dormant-systems audit → operator rulings R1-R5)

Worktree `wt-audit`. Two mandates. **Mandate 1** delivered the complete dormant-systems audit (PR #343):
the built-wired-gated-off class the 2026-07-11 full-system audit's P1-P4 taxonomy missed, five inventories,
three-state judgments. **Mandate 2** executed the operator's post-audit rulings R1-R5 as five sequenced
PRs, each CI-green-then-merged, no admin-merge:

- **#344 (Phase 2, governance):** ADR-015 restores the founding source-monitoring design as the operating
  model and SUPERSEDES ADR-012 (its manual-by-design reframe was a mislabeled spend-crisis freeze; R5
  dispute recorded asserting neither side, moot as doctrine). Register: `research-is-horizon-scan` gained a
  feedstock-gap residual; `no-execution-from-stale-state` (RD-33) gained the worklist-note-is-a-proposal
  extension. `ACTIVE_PHASE` advanced `phase-intake-gate` → `phase-2` (derived from GOVERNING-PROGRAM's own
  dependency order; intake-gate anchors verified). Cosmetic G-9/G-10. Founding `fsi-app/.claude/CLAUDE.md`
  text unamended — it won.
- **#345 (Phase 3, purges):** P-1..P-8 removed (discover route + discovery.ts; staged-updates route; two
  product-orphan routes; q7 route; the dead `rss-fetch.ts` transport with `secFairAccessUaForUrl` re-homed
  to `sec-fair-access.ts`; the `source_conflicts` dormant slice + `computeConflictResolutionImpact`).
  Migration 215 (source_conflicts DROP) authored then APPLIED this session (content gate passed, 0 rows).
  Every gate/register/comment reference to a purged item amended in the same PR; no target force-deleted
  over a live caller.
- **#346 (Phase 4, skill-gate G-12):** `skill-token.mjs` now requires a `Skill` invocation to have RESOLVED
  (`is_error !== true`, correlated by `tool_use_id`), not merely to appear in the transcript. Selftests
  12/12 + hook 26/26.
- **#347 (Phase 5, checks + spec):** section-7 checks run LIVE (operator granted full access) — cadence
  `off`, scan returns 503, source-monitoring + spot-check `disabled_manually`, SW-3 flag 1-open, drain 66,
  D-report merged; **six of seven closed**, deployed Vercel env values the one unreachable (secret-scope
  tool limit, re-arm-time operator check, moot for fetch-blocking). Two-tier crawl rebuild SPEC drafted for
  operator pricing (awareness tick at check-sources → one intake path at run-intake-cycle → depth tier
  behind `GROUNDING_ACQUIRE_ENABLED`; source-type-agnostic waves 1/2/3; costed wave-one ~$16-37 over the 106
  MISSING `coverage_gap_candidates`; no build until priced).

**Decisions/holds (operator-confirmed):** (1) the deferred `source_trust_events` never-emitted event-type
narrowing stays HELD on the merits — the crawl-spec §8.1 decision line records the evidence (neither the
depth tier nor phase-3 fruition uses those types; the sealed-corroboration moat is permanent → evidence
points to purge, at the operator's ruling, as a content-gated migration). (2) The relabel primitive Session
A specced is deferred to the session that resumes Session A.

**Blockers/next (operator-owned):** price the crawl-spec waves; rule purge on the deferred trust-event
types; the resume-A session builds the relabel primitive. Live corpus at close: 276 live / 210 verified /
66 quarantined; 825 active sources. Session E lane DONE; the operator takes the crawl spec from here.

---

## 2026-07-15 — Spend-watch RED diagnosis + operator-priced reconciliation (PR #336)

Operator interrupted the waves ("DIAGNOSE — SPEND-WATCH RED", 4 emails). Verdict: **(a) stale frozen-state
config; (b) disproven — no leak.** Full disposition: [spend-watch-disposition-2026-07-15](spend-watch-disposition-2026-07-15.md).

- **Trip cause:** `spend-health.mjs` gated on the app acquire lock (master gate) + priced-line/I2 marker rows —
  the retired acquisition-freeze posture. `funded-pass` arms the lock only in its local process (never the
  deployed app) and wrote no markers, so every legitimate priced run false-reds. 4 fails 07-13→07-15; began
  07-13, before the priced run.
- **(b) traced clean:** grounding crons frozen (`source-monitoring` disabled_manually); every post-freeze paid
  row uses a sanctioned `fetch_method` and traces to this session's authorizations (priced $20 + Step-2 $12 +
  A/B + retries; ≈$31.9, within authorized bounds). No untraceable row.
- **Reconciliation (commit `4da0169`, CI green):** spend-health drops the app-lock-master-gate (→ informational);
  sole alarm = a post-freeze paid row not tracing to an operator-priced line. `funded-pass` now writes a cost-0
  `priced-line` marker per item before grounding it. `FREEZE_SINCE_ISO` moved 07-13→07-15T03:00Z (designed
  resumed-spend escape). Workflow/route comments corrected off the $75/80%+lock model. Tests 28/28.
- **Lane state:** branch CI green; **production-green lands on PR #336 merge + Vercel deploy** (the probe hits
  carosledge.com). Waves UNBLOCKED by this dated disposition per the operator stop-condition.

---

## 2026-07-15 — Step-2 stop-and-surface + criterion diagnosis + spend-bound hardening (PR #336)

**Context:** Resumed with Step 2 (floor-first re-attribution, `funded-pass --bound=12` over 23 quarantined reg-family items) running in the background from before the compact.

**Stop-and-surface — Step-2 premise falsified.** Killed the background run at **$1.19** (dominance guard protects mid-item state). Read the hold reason directly from the live `validate_item_provenance` (`STABLE`, so callable for **$0**) across all 23 items instead of paying to re-run grounding. The holds are **compound / multi-criterion**, and floor-tier is only one of **five** blockers:
- **C3 `fact_below_authority_floor`** — 16 items, 262 facts (the genuine tier residue).
- **C5 `missing_required_slot`** — 8 items. Content exists but claims aren't `[slot_key]`-tagged (verified reg items carry a literal `[primary_deadline]`/`[effective_date]` prefix; these don't). Cheap re-tag, not paid re-ground.
- **C2 `ungrounded_url`** — 5 items. Legit unregistered primaries (`diputados.gob.mx` = Mexican Congress T1) + furniture (bbhub.io, s.fhg.de). C2 is a presence check → free registration clears it.
- **C4 label** (`analysis_missing_label` / `unlabeled_assertion`) — 6 items. Prose relabel.
- **C3 `fact_span_not_in_source`** — 3 items, 40 facts. Integrity (span not verbatim in source) — charset/truncation class → investigate.

Decisive proof: the priced run already full-resynth'd **SB 253** (now 33/33 facts at T1) and it stayed quarantined — held on a missing `[primary_deadline]` tag, **not** tier. **7 of 23 have no floor blocker at all**; blanket floor-first re-attribution would flip ~0. Diagnosed for **$1.19**.

**Spend-defect claim RETRACTED (honest correction).** I initially alarmed that the priced run overran its $20 bound to $21.86 (runner "undercounts 19%"). **Wrong — my misattribution.** The $21.86 was *total-session* grounding across 31 items: priced run **$17.26** on its 23 (under $20) + **$4.60** on 10 other items (the authorized Segment-0 Haiku/Sonnet A/B on EPA + Brazil/manual re-fetches). The runner counted correctly; the bound held. Caught by diagnosing before "fixing."

**Bound hardening LANDED (operator ruling: fix the bound first).** No live defect, but one real latent silent-overrun path: the bound summed only `itemLedger` (item-attributed rows); a paid row with `item_id` NULL but `source_id` SET (a source-only ground/classify call) was neither halted by `spendWatchHalt` (which only run-halts item-AND-source-null rows) nor counted. Fix: `authoritativeCumulative()` (pure, red-then-green) + `cumulativeSpendSince(runStart)` — the bound now gates on `sum(cost_usd_estimated)` over the whole run window, so the ceiling can't be reconstructed below the DB total. Per-item cost stays for gain/runaway tripwires; close summary reports authoritative actuals + any per-item gap. Commit **1e40e06** on `remediation/re-grounds-never-destroy`; **CI green** (Discipline engine + Bug-class guard).

**Corpus state (reg-family, live):** 156 verified / 141 quarantined / 51 unverified / 5 pending. (Earlier "195/24" was a mis-recollection; 141 is the real quarantine set, 23 hold facts = the worklist.)

**Decisions / findings:** (1) The quarantine blocker is **not** primarily sub-floor tier — it's a 5-way criterion mix, most cheaply fixable (registration/slot-tag/label), NOT paid re-grounding. (2) `validate_item_provenance` is the free, authoritative per-item hold oracle — use it before any paid remediation. (3) A hard $ ceiling must gate on authoritative DB spend, never a reconstruction that can drift below it.

**Next steps (await operator ruling):** re-scoped criterion-stratified remediation — **Wave 0** (free: register legit primary URLs → clears C2, flips Mexico) → **Wave 1** (cheap: `[slot_key]` re-tags + label fixes → ~6 no-floor items) → **Wave 2** (the 16 C3-floor items = the coverage-floor unit, partial flips + honest holds) → **Wave 3** (3 span-not-in-source integrity). Parked: stale_verified (45), reattribution-verified-half (42).

---

## 2026-07-13 — register-step-gap (SC-13), stale-verified + backlog disposition, ISR, vault-graph

**Standing constraints held throughout:** `$0`, `GROUNDING_ACQUIRE_ENABLED` OFF, session moved **$0.00** (DB
reads + guarded metadata writes only; no grounding, no paid calls). Ceiling now $130 (code-only, not a spend
unlock). All merges CI-green on GitHub.

**Merged to master (final tip `44ddfee`):**
- **#308** — Program Board §7: corrected flag-system queue, ISR unit re-added, Unit 2 lineage, REJOIN line.
- **#309** — **register-step-gap unit (SC-13):** register-at-grounding is deterministic-only
  (`codifiedTierForHost`/`decidePoolHostRegistration`; codified→register, ambiguous→worklist, never a guessed
  tier). Probe-cleared (floor fails-closed on NULL both directions; guessed-5 census clean — 0 verified items
  rest on a guessed tier). Golden + invariant SC-13 + skill text; the `register-step-gap` flag text corrected to
  the live query. Residuals surfaced: brief-cited `?? 5` leak (follow-on), 124 guessed-5 rows.
- **#312** — **stale-verified root-cause + backlog disposition (Part A + Part B):**
  - Part A root-cause: `archivePatch()` resets `provenance_status` off `verified` on archive (the stale cache).
    Backfill of the 200 archived rows **BLOCKED on the bound reconciler credential** (mig-43 provenance guard;
    service_role denied) — go-forward fix lands, backfill re-runs when the cred is restored. `stale-verified-audit.mjs`
    (is_archived=false) GREEN (0/182 customer-visible). Corrected the over-stated "168 customer-facing" claim:
    all archived → 0 customer-visible stale-verified (cosmetic).
  - Part B: 336 past-bound → 60 RD-28-held + 20 quarantined-item-exempt (new flag-age boundary: quarantine-
    disposition-audit owns live-quarantined item-flags) + 256 closed (199 archived / 51 deleted / 5 seed / 1
    entity). 48 expired deferrals → 2 renewed + 128 closed-moot + 5 orphaned deleted. 124 guessed-5 → one FK-safe
    review-batch flag. **flag-age + deferral-hygiene both GREEN at exit.** register-gap was 52 live not 182.
- **#311** — ISR detail-cache (`unstable_cache` keyed by id + tag invalidation via a worker-authed revalidate
  route pinged from the workflow; `revalidate:300` backstop) — the 503 ceiling-removal.
- **#310** — vault docs-graph: 606 `[[wikilinks]]`→markdown relative links across 112 docs, ADR-010 amended
  (markdown links supersede wikilinks), 11 new cross-links, orphan triage.

**Decisions/notes:** `is_archived` is the primary axis for flag disposition (archived = terminally
dispositioned → close). The flag-age scope now correctly excludes live-quarantined item-flags (owned by
quarantine-disposition-audit). Ran 2 code/docs units as parallel isolated-worktree subagents (verified + merged).

**Blocked / operator-awaited:** (1) reconciler credential (blocks the archived-row provenance backfill + the
reconcile lane); (2) MCP cred-indirection in `~/.claude.json` — env-indirection is supported via `${VAR}` but
the ruling's verify-before-delete step needs a Claude Code restart (unverifiable in-session) — staged for the
operator; (3) the guessed-5 ambiguous-host registration batch (review-batch flag surfaced); (4) the next
sanctioned grounding run go/no-go (realizes the SC-13 flip + Unit-3 keepers).

**Next:** operator restart-verify for MCP indirection; reconciler-cred DDL window; then the sanctioned grounding
run and the standing sequence resume (T9 re-spec, registry expansion, T10 units, coverage floor, launch clauses).

---

## 2026-07-07 — §7 backend sweep + two integrity-clean data programs

**Accomplished** (6 PRs merged to prod, CI + both Vercel deploys green; master `63ba920`):

- **#227** — Template 11 verifier sign-off wired to the live table (migration 154, withdraw RLS policy).
- **#228** — Map mode filter wired to real `transport_modes` tags (was a pending note).
- **#229** — Member-created vertical groups (migration 155 `community_groups.vertical`; POST route; rail + create modal).
- **#230** — Org-scoped member ban with block-rejoin (migration 156 `org_member_bans` + `accept_invitation` ban guard; ban-then-delete fails closed).
- **#231** — State-cost data program: 13 US states' 2026 minimum wage → `state_cost_facts`, read-path wired to Operations By-state sub-list.
- **#232** — EIA price-board feed writer: 4 weekly spot figures → `published_price_statistics`.

**Data written** (durable on script execution, guarded + snapshotted + read-back verified):
- Batch-1 re-collection: 3 flipped → verified, 21 held with exhaustion records (cohort-fail stop held; no forced flips).
- 13 min-wage facts (source NCSL, tier 4, each corroborated vs a 2nd source; citations = NCSL enacting-instrument descriptors, never memory-recalled code sections).
- 4 EIA figures: WTI $73.59/bbl · Brent $73.63/bbl · Jet Fuel Gulf Coast $2.788/gal · Henry Hub $3.20/MMBtu (all week of 2026-06-26).

**Decisions** (operator rulings 2026-07-07 — also in memory `project_caros_ledge_2026_07_07_rulings`):
- **Cadence stays OFF** — `scrape_cadence='off'` + `global_processing_paused=true` unchanged. Conserve the ~20k/mo Browserless budget; mechanism is ready, enabling it commits autonomous spend. Reversible.
- **Member ban = ORG-SCOPED**, not platform-wide. Redesign mock copy ("blocks the account platform-wide") is SUPERSEDED; UI copy corrected to org-scoped.
- **Both data programs RUN** with REAL cited figures — never fabricated ticks.

**Integrity note (the vetting question, answered by outcome):** for external price data, prefer the
keyed authoritative API over WebFetch of gov HTML. DOL/FRED/EIA data *pages* return 403 to bots; the
**EIA v2 API** (`EIA_API_KEY` in `.env.local`) returns exact dated JSON values + release period.
A vague search snippet ("~$69/bbl", no date/release) was explicitly REFUSED rather than written.
Same keys available and preferred: `DATA_GOV_API_KEY`, `NREL_API_KEY`, `REGULATIONS_GOV_API_KEY`.
EUA carbon left honest-pending (EIA publishes no EU carbon price; no vetted source wired).

**Spend:** ledger unchanged at $43.04 / $85 — the data programs used web/EIA-API (free), zero
Browserless, zero Sonnet. Batch-1 spend ($13.44) persists in `agent_runs.cost_usd_estimated`
(one row per pipeline step), verified matching measured spend exactly.

**Blockers / open questions:**
- None blocking. All authorized tasks complete.

**Next steps (deferred, flagged — operator decision):**
- **First-class run-ledger table** (offered, not yet accepted): one row per campaign run
  `{run_label, items, flipped, held, measured_spend, program_total, timestamp}` so spend is
  queryable by run instead of summed from `agent_runs`.
- **Admin → Workspaces `MembersPanel`** ban wiring still toast-only; needs a platform-admin-vs-owner
  authority decision on the owner-only route before wiring. (Account panel role/remove/ban is functional.)

*(Post-session note: docs/ triaged into the taxonomy + operating manual installed in commits
`c0b4eac`/`cfa4a20`, ADR-010 — after the six feature PRs above.)*

## 2026-07-07 — P3c grounding-holes unit (S1-07, the moat gate)

**Accomplished:**
- Probe-first (read-only SQL, $0): floor bypass = 90/113 verified reg-family items on LOW/MODERATE
  priority, 72 holding 947 sub-floor FACT claims (385 tier-NULL/no-source_id across 39 items, 562 at
  tiers 3-6); ANALYSIS per-claim = 1 failing claim of 517 (Japan MLIT); stub exposure = 38/309 stubs
  across 23 items on novel hosts (all real institutional URLs on inspection).
- **Cited-host gate** (code, live on merge): criterion-2 auto-stubbing in `groundBriefImpl` restricted
  to hosts known to the item's real pool / registry / own source_url (exact-host OR institution
  match); novel hosts flagged via `integrity_flags`, never stubbed — closes the model-cites-itself
  circularity while preserving the safety4sea fix for known hosts. Pure half `cited-host-gate.mjs`
  red-then-green (6 tests); two `{ data }`-only error-drops cured in the rewrite. 244/244 tests, tsc clean.
- **Migration 158 AUTHORED, NOT applied** (per the Phase-3 dispatch): reg-family authority floor
  unconditional on item_type (model's own priority choice can no longer disarm it; `floor_basis`
  added); criterion-4 ANALYSIS label per-claim (paragraph-scoped — expression validated read-only
  against prod). Reason strings unchanged (consumer-stable). Inventory row 158 + matrix S1-07
  disposition landed same commit.

**Decisions:**
- Novel-host citations fail closed (no stub → honest criterion-2 failure → research-or-erase), the
  flag is the review channel. Non-reg floors deliberately keep the CRITICAL/HIGH condition — no
  unruled widening.

**Blockers / open:**
- Mig 158 apply rides the operator window WITH the 72-item flip figure (flips at re-validation, not apply).
- RESIDUAL (reported, small follow-on): `registerPoolHostsForGrounding` should exclude
  `canonical:cited-*` stub rows to close the cross-run self-licensing seam (matrix, P3c section).

**Next:** browser wave (operator per-PR review), loop-live dormant builds, 165-fn search_path companion.

## 2026-07-07/08 — operator "Proceed — do not stop": 158/159 applied, browser wave landed, 160 authored

**Applied to prod (delegated, verified):**
- **Mig 158** (moat gate): read-back + 3 behavioral probes green; no flips at apply (ride re-validation).
- **Mig 159** (Ask FTS substrate): weighted search_tsv + GIN + ranked RPC (read predicate inside);
  probes 12/12/0. Ledger rows 158/159 recorded same-transaction.

**Merged (all CI-green):** #244 cross-run seam + 158 record · #245 WATCH end-to-end (writer route +
one shared button; prod route answers 401 already) · #246 admin members (caller-re-insert defect
killed; PUT add-by-email; AUTHORITY WIDENED owner→owner-or-platform-admin — flagged for review; ban
copy corrected to org-scoped) · #247 community un-orphan (rail links to browse/moderation; dead
CommunityView deleted; C9 realtime mount-or-remove decision flagged) · #248 Ask FTS retrieval +
**F15 closure** (last raw api.anthropic.com fetch on a customer path → spendStream, ticketed) ·
#249 hotfix: F15 allowlist shrink (A2 stale-entry audit correctly turned master RED for one commit
after #248; local pre-push proxy missed it — gap noted).

**Runtime probes:** overrides route fail-closed on prod (401 no-auth + bad-token); watchlist route
deployed (401); overrides POST handler already runtime-exercised (4 dismissal rows). Residual
browser-only item: NotesField happy path needs a real session.

**Authored, NOT applied:** **mig 160** — the reviewed search_path companion. Census reconciled:
165 unpinned = 56 app-owned (this migration; 26 SECURITY DEFINER) + 109 extension-owned (excluded
by design). Header carries re-generation query + post-apply verification recipe. Applies ONLY in
the operator's DDL window per the standing ruling.

**Held:** loop/cadence flip (operator's explicit word only). **Next:** loop-live dormant builds
(P2-6 change-detection, P2-2/3 scan-materialize, P2-5 scheduler), double-gated.

## 2026-07-08 — loop-live builds landed DORMANT (P2-6 + P2-5)

- **P2-6 change detection (mig 161 APPLIED + #252 merged):** check-sources fingerprints the SAME
  render the accessibility check pays for (content-change.mjs, 200ch error-page floor; first
  observation seeds, outages never read as change); monitoring_queue.change_detected +
  sources.last_content_changed_at now honest. Zero extra Browserless units.
- **P2-5 portal deep-link discovery (mig 162 APPLIED + PR):** portal_link_candidates ledger fed by
  portal-links.mjs from the same uncapped render html (same-host, instrument-signal, capped 40).
  Discovery not intake — classify→stage rides the loop flip.
- Both stay behind worker-auth + global pause + scrape-window gates; nothing runs until the
  operator flips cadence. Consume steps deliberately unwired (the flip is the operator's word).

## 2026-07-08 — dispatch closeout: red-merge guarantee, reconciliations, ratification

- **Branch protection LIVE on master**: 4 required checks, enforce_admins, no force-push/delete.
  PROVEN: deliberately-red PR #257 → normal merge refused ("base branch policy prohibits") →
  --admin refused ("Required status check is failing") → closed unmerged.
- **Coverage class-fix (#256)**: proof #1 (#255) exposed that CI ran ZERO app *.test.mjs (hand
  list); run-test-suite.sh src entries are now directory GLOBS (250→493 tests, join-by-
  construction); *.npmtest.mjs = the NAMED exclusion, runs in the npm-ci fitness job.
- **Reconciliations**: (a) applies = Supabase MCP execute_sql, explicit ref kwrsbpiseruzbfwjpvsp
  every call, sole authed org "JBL studio" (NO Dietl — fresh probe); apply-records retro-written
  into ledger rows 157/158/159/161/162. (b) census bridged exactly: 47→44 (3 batch-1 verify
  flips) →42 (2 quarantined dedup twins archived); verified-live 283→279 (4 verified twins
  archived); zero generation, zero re-validation. (c) intake gate LIVE (#208 reland + mig 146
  applied + F13/C5 green + ACTIVE_PHASE flipped via #218) — cadence hard-precondition SATISFIED;
  remaining flip gates = operator word + operator sequence only.
- **ADR-011**: DDL authority ratification codified (additive delegated w/ ledger identity +
  read-back; break-risky = operator window). Mig 160 stays HELD (named break-risky class).
- **Review queue**: members-route widening APPROVED (recorded); C9 realtime REMOVED per
  no-half-built doctrine (3 orphan files, zero importers, polling is the working consumer);
  NotesField happy path stays on the operator board.

## 2026-07-11 — Reconciliation remediation (full sequence)

- Executed the 2026-07-10 RECONCILIATION REMEDIATION dispatch end-to-end on branch `remediation/reconciliation-2026-07-10`. **Lane GREEN (8/8 hard, block-state GREEN)**; spend **$3.3523 / $10**; 0 fetches, 0 mints.
- 65-item backlog dispositioned: 7 recovered to verified (1 label $0, 6 slot-forcing/label), 62 honest-quarantined with valid RD-6 deferrals (event-bound to batch-1/hold-lift). **verified-live 240→179** (fail-closed, mig-158 precedent; snapshots recorded).
- Mechanism verdicts (proof-driven): ground-only cannot fix floor-class (4b verbatim rule); resynth clears floors on enacted-text pools but has a label/slot contract gap (pipeline REFERENCE fix owed). Conservation audit's "$9.50 ground-only" plan corrected.
- **Reconciler credential is broken post-mig-157** (can't read validator inputs; WITH CHECK refusals even on same-value writes) — operator DDL window owed; mig-163 ledgered idempotently (was applied out-of-band) with proof.
- Phase 2: undispositioned 0 (94 valid deferred); 4 technology retypes all KEPT (slot-forcing + label fixes). Phase 3: 0 attribution conflicts (closed), 4 near-dup rulings (xref + 2 merge flags), URL-dedup ratified (0 live dups; 8 REGISTRY dups = new backlog), 9 CELEX/ELI identifiers backfilled deterministically, 2 residual dup rows deleted.
- Phase 4: D-1 (join selectors), D-2 (one source-count selector), Q-1 (ONE tier vocabulary + drift-guard test; 4 private vocabs collapsed), Q-2 (gap labels), Q-3 (casino DELETED via gate; 2 housing-lottery siblings archived off_domain). Doc drifts fixed (F15 count → live pointer; U-11 $0-MTD → query).
- Closeout: `docs/ops/reconciliation-remediation-closeout-2026-07-11.md` (traceability matrix + open-units register).

## 2026-07-11 (later) — Full-system audit (multi-agent, read-only)

- Executed the FULL-SYSTEM AUDIT dispatch: 13 agents (DB-1..4, CODE-1..5b, X cross-wiring, INTENT), all accepted w/ nonzero tool counts + reconciled slices. Coverage PROVEN: 1,324 code files line-read + 24 declared-excluded (= 1,348); 85/85 tables (manifest "86" corrected), 5 views, 63 fns, 183 policies, migrations 001–163. Read-only held (zero DB writes/DDL/fetches/mints/program spend).
- Deliverables committed to docs/ops/full-system-audit-2026-07-11/: coverage-manifest + 13 registers + pool-coverage-62 (45 COVERED/8 PARTIAL/9 NOT-COVERED) + master-gap-register (12 P1s) + correction-plan (Tracks A–E, build-first lens per operator: the hold is deliberate).
- Headline P1s: get_market_intel_items org-gate ABSENT live (mig 108); /admin provisional queue silently EMPTY since 157 (489 rows invisible; anon client + dropped error); profiles UPDATE silent no-op + anon email exposure; staged-approve phantom-column duplicate-mint hazard; verified-gate bypass on related rails; seed-on-timeout; /api/agent/run ungated spend; scrape-hold transport holes.
- KEY RECORD CORRECTIONS: mig-158 is APPLIED+LEDGERED (project memory/inventory said HELD — stale; its blast radius was already discharged by the 2026-07-11 remediation); 15 applied-unledgered migrations (107–134); mig-099 never applied; browserless.ts NOT retired (7 importers).
- Intent verdicts: all 9 surfaces PARTIALLY DELIVER; biggest build-axis misses = Regulations flagship corpus (45 recoverable zero-fetch post-C1/C2), Operations sourceless facts, Community pre-adoption set, Dashboard seed leak.

## 2026-07-13 — Spend-watch hardening + flag-system investigation/rulings + secret scrub (Unit B in flight)

**Accomplished — landed on master (all $0, CI-green):**
- **#299** [PROGRAM-BOARD.md](../PROGRAM-BOARD.md) (thread board reconstructed from repo evidence); **#300** T8 conduction census ([conduction-census-2026-07-13.md](../../fsi-app/docs/ops/conduction-census-2026-07-13.md)) recovered + re-verified vs post-rebuild master.
- **#301** spend-watch false-red fix (frozen-and-quiet = PASS, kill permanent-red); **#302** sanctioned-window semantics (4-state verdict in `src/lib/health/spend-health.mjs`, 9 tests; health tests added to CI suite 729→738); **#303** summary-exit false-red fix (surfaced by #302's own `workflow_dispatch` verify — trailing `&&` on empty rows).
- **#304 (Unit A):** item 0 ceiling $75→$130 (both homes `MONTHLY_SPEND_CEILING_USD` + gauge; **no spend unlocked** — `GROUNDING_ACQUIRE_ENABLED` stays OFF); item 1 seed-fallback `null_orgId` routed OUT of `integrity_flags` (119/127 were anonymous homepage renders mis-filed as data_integrity; `service_role_missing` under-count fix). Verified live: MTD $75.25/$130, frozen=false, probe green.

**Flag-system investigation (read-only census → per-mechanism rulings):**
- 903 open `integrity_flags` = 22 mechanisms; 64% of subject_refs multi-mechanism → drain-to-zero WITHDRAWN (guards-win-fights). **Dwell gap:** `quarantine-disposition-audit` covers quarantined-ITEM age (RD-4/RD-6), NOT open-flag age — the two biggest blocks (skill-conformance 240 on verified items, seed-fallback 127 surface-scoped) are structurally invisible; 450 flags >30d trip nothing.
- **Item 2 APPLIED (data durable):** C1 re-baselined to the live contract via new SSOT `src/lib/agent/contract-version.mjs` (2026-05-27; was stale 2026-04-29 in auditor + b2-progress) + drift-guard test binding it to `system-prompt.ts`. **82 flags RESOLVED** with full attribution (null-note-closure bug fixed), **65 MINTED** (51 RD-28-held for verified resting-state, 14 actionable-regenerate). open 240→223. Auditor rewired to the rule-015 guarded write path (`guardedInsert`/`guardedUpdate`).

**Decisions:** ceiling $130 (item 0); FMC ruled **1b** (keep A/B/C — subsumption check found C's 25 claims **0/25 shared** with B → NOT a dup; add xrefs, close recon flags, flag same-entity-vs-related vocab gap); item-2 apply = **Option C** (mint 65 as RD-28-held; suppression rejected); **rotation of exposed creds DECLINED** by operator; settings `defaultMode` → `acceptEdits`.

**Secret-exposure (SF-11) closeout:** 4 creds (GitHub PAT, Pet Pursuit service-role JWT, anon key, expired session token) found across ~16 local files under `~/.claude`. Scrubbed 2 live configs (settings.json 260→246 allow, settings.local.json 209→195) + purged 4 `settings.json.bak-*` + 5 `.claude.json.backup.*` + 2 file-history + 2 `history.jsonl` lines. Final sweep CLEAN except 2 transcripts (left = accepted-risk). **Held:** `~/.claude.json` (home, live `mcpServers` creds) — MCP cred-indirection ruled, queued behind Unit B. Scrub = necessary-but-insufficient (rotation declined) recorded.

**Blockers / open:**
- **Unit B NOT landed:** item-2 DATA applied, but item-2 CODE + items 3/4/5 + 119 null_orgId closures + FMC-1b are uncommitted — lands as one PR (code-vs-data split: item-2 data durable, code pending).
- Item 6 (register-step-gap): scope-not-built.

**Diagnoses (read-only, complete — queued behind Unit B):** `/regulations/[slug]` 503 = prefetch fan-out + uncacheable render; likely emitter = unguarded `proxy.ts` `auth.getUser()` → fix = `prefetch={false}` + try/catch (trivial) + ISR/`unstable_cache` (own unit). React #418 = `WhatChanged.tsx:88` relative-time `Date.now()` in render (trivial client-only mount). Obsidian = no automation; `docs/` IS the vault; `/done` + commit is manual.

**Recommended next steps (sequenced):** (1) land **Unit B** PR — commit item-2 code + build items 3 (RD-6 renewal enforcement), 5 (all-subject-type flag-age audit + invariant, with RD-28-held exemption), 4 (historical-terminal closures), 119 null_orgId closures, FMC-1b (xrefs + recon closures). (2) two-finding **diagnoses**: #418 + trivial proxy/prefetch as a paired PR; 503 ISR as its own unit. (3) **vault unit** (docs graph + session memory; ADR-010 amendment = markdown links not wikilinks). (4) **session-close mechanization** (SessionEnd hook). (5) **MCP cred-indirection** on `~/.claude.json` (copy-first → verify → delete).

## 2026-07-13 (later) — Economy-of-information: standard-floor recal + operator-priced spend + free-pass ($0 session)

**Accomplished (all $0 — no lock, no fetch, no model spend; PRs #314 `b67b673` + #315 `c51fde2` merged, prod green):**
- **Floor recalibration (SC-14 / migration 202).** Scoped the `standard` authority floor to the item's OWN authoring body (institution_id SSOT); standards-body tier (4) on own body only, never a same-tier unrelated host. Monotonic + standard-only. Applied live via the direct postgres pooler; verified non-regressive (30/30 verified stay valid). **Recovered c3 (GRI) + c4 (ISO 14083) to verified at $0** (guarded touch + read-back). JS mirror `authorityFloorForFact` + accept/reject golden.
- **Operator-priced spend model (RD-31 + RD-32; doctrines `operator-sets-cost` + `data-existence-before-acquisition`).** Retired every standing dollar figure as a limit; the paid path requires an operator-priced line (cost + inventory-miss citation), refuses without both before the acquire lock; spend-watch = pure alarm; gauge = information-only. Built by a scoped subagent (verified 38/38 + 2 agent-introduced defects — a test regression + a tsc null-safety — caught and fixed on re-verify). Refusal confirmed on the live deploy (18/18).
- **Free-pass tooling.** holdings-inventory + free-pass re-attribution decision core (verbatim ∧ primary-instrument-class ∧ error-body-clean; 9/9 goldens on the three cases). DRY-RUN = 0 genuine flips — the moat working (holding a string ≠ holding the primary).
- Meta-gate PASS (80 invariants + 43 doctrines wired); tsc clean; consistency C3 green (migrations.md updated same-PR).

**Decisions:** spend authority collapses to two mechanisms (operator-priced lines + spend-watch alarm); no standing dollar figures anywhere; a `standard`'s floor is its authoring body's tier (the T2 floor was a category error, not a threshold). Delegated-pricing successor registered as the named **pre-Unit-5** gate.

**Blockers / open:** Part A archived-row provenance backfill still BLOCKED on the reconciler credential (DDL window). The manifest is unpriced (operator's pen).

**Next steps (all operator-parked — nothing machine-runnable until unblocked):** (1) manifest pricing (`scripts/tmp/acquisition-manifest-2026-07-13.md`); (2) 124-host guessed-5 re-tier scan; (3) MCP cred-indirection fresh-session steps; (4) reconciler DDL window. The next sanctioned grounding run + the standing sequence (T9/registry/T10/coverage/launch) resume from the REJOIN point once an operator action unblocks them.

## 2026-07-13 (session 2) — $0 work queue: 124-host + 44-host disposition, T9 report-the-gap, Unit 0c queued

**Accomplished ($0 — guarded metadata writes only, no lock/fetch/model):**
- **Item 1 (PR #317):** 124-host guessed-5 batch dispositioned (34 registered at ruled tiers, 6 worklist, batch flag resolved) + SC-13 class-table extension (`classTierForHost` lazy-registration + golden). Under-count corrected (38 span-bearing not 6; readClient cap) — halted + re-ruled before writing.
- **Item 2 (PR #318):** 44-host expansion was NEVER executed → completed via the class rule (4 gov→T2 +15 spans re-stamped, 4 inherit, 1 europa.eu granularity HALT, 35 worklist). Two fake-cert risks caught in DRY-RUN (law.cornell.edu Cornell-LII mis-minting T4; europa.eu collapse). Legal-aggregator class fix.
- **Item 4:** T9 8/8 accounting — CANNOT certify (report-the-gap): 8-stage flow unspecced, 0 source-less orphans, 0 machine-gated runs. Structurally blocked on Unit 0c.
- Earlier this session (PRs #308–#316): standard-floor recalibration (SC-14/mig-202, c3+c4 flipped $0), operator-priced spend model (RD-31/32), free-pass tooling, /done docs.

**Decisions:** STANDING RULE — a confirmed ruling is an OPEN thread until its execution report lands (rulings get board entries like builds). T9 dry-proof clause closes only after Unit 0c + first machine-gated run.

**Blockers / open:** Unit 0c not built (next session's first unit, 5 parts scoped). Item 4 blocked on it. Reconciler DDL window still owed (archived-row backfill). Manifest unpriced (operator's pen).

**Next steps:** (1) Unit 0c ($0, 5 parts, per-part verification). (2) then the T9 dry-proof + the standing sequence resume. All other threads operator-parked (manifest pricing, MCP indirection, reconciler DDL, sanctioned grounding run go/no-go).

## 2026-07-14 — Unit 0c COMPLETE + standing $0 batch (vault / residual sweep / decision sheet / MCP run-sheet)

**Unit 0c — COMPLETE (session 3, PRs #320 + #321; board §Unit-0c-COMPLETE).** Machine-gated intake cutover shipped: `/api/staged-updates` POST→410, AdminDashboard approve/reject + Research Pipeline publish/archive retired to visibility-only, EESC registered T3, phrase-scan 0 residuals. T9's last gate is now the FIRST machine-gated run (awaits the sanctioned-run word — it spends).

**Standing $0 batch (this session — all $0, guarded, CI-green):**
- **Item 1 VAULT UNIT (PR #322, `8bdcc43`):** session-memory mechanization — SessionEnd hook (loud /done + INDEX prior-art + born-link), `/start` boots PROGRAM-BOARD, `done.md` born-linked+board+commit steps, `CLAUDE.md` prior-art rule + standing-rule-8 wikilink→markdown re-issue, ADR-010 pt2, dead-link triage. (The 606-link docs-graph backfill was already #310.)
- **Item 2 RESIDUAL SWEEP (PR #323, `febf336`):** (a) re-attribution worklist enumerated ([reattribution-worklist-2026-07-14](./reattribution-worklist-2026-07-14.md) — 42 FACT spans/13 items on wikipedia/legiscan/policycommons at the retired `?? 5` T5 stamp; 37 on VERIFIED briefs → logged, NOT swept, follow-on unit queued); (b) `registerCitedSources` `?? 5` FIXED (base_tier now keys off `classTierForHost`; unclassified→worklist candidate, never a guessed row; golden 11/11); (c) board debt (execution-report rule per thread).
- **Item 3 decision sheet** (`scripts/tmp/acquisition-decision-sheet-2026-07-14.md`): 35 lines → Section 1 RE-SYNTH 8 (one-number scope stated) / Section 2 ACQUIRE 17 (2A 0-KB holes 12 + 2B partials 5) / Section 3 SKIP-FLAGGED 10. Empty PRICE boxes. Caught a manifest mislabel (CELEX 52023PC0445 = Weights & Dimensions, not "ReFuelEU").
- **Item 4 MCP run-sheet** (`scripts/tmp/mcp-indirection-run-sheet-2026-07-14.md`): exact copy→rewrite→restart→verify→discard steps; github@`C:/Users/jason` + supabase@`C:/Users/jason/corvette23`, stdio/npx, LITERAL→`${VAR}`; SF-11 preserved (agent never read a value).

**Decisions:** verified-brief provenance mutations are their own verified unit, never a sweep write (production-surface-verification + four-part standard). registerCitedSources fake-cert = the same `?? 5` seen backward in the corpus; go-forward fixed so the population can't grow.

**Blockers / open:** desk reduced to TWO operator acts — (a) prices on the decision sheet, (b) execute the MCP run-sheet. Still parked: sanctioned/first-machine-gated run (spends), reconciler DDL window, `reattribution-relabel` follow-on unit (spends/model).

## 2026-07-14 — Run-to-close batch → CRITICAL DISPATCH: acquisition discovery rung rebuilt (GATE A)

**Batch (PRs #330–#334, all $0 build + CI-green; the paid pass never fired — halted at GATE A on findings).**

- **#330 Holdings audit:** migration 203 `holdings_quality` (applied via apply_migration + inventoried), pure classifier (publisher-shape / furniture / structural-truncation / sufficiency) + 11 goldens, runner reads snapshot bodies from Storage. **930 rows / 626 items** written guarded (`guardedInsertMany`): 577 snapshots (64 STUB, 48 FURNITURE, 1 TRUNCATED, 464 clean), 353 pools, 45 stale_verified, **365 items hold a >40KB snapshot the 40K grounding read never saw** (the real truncation story). NO-KNOWN-DEFECT ≠ proof-of-completeness (grounding-side guarantee).
- **#331 RD-33 retro-apply + protocols:** mint (`sourceLinkDecision`+idempotency+fail-closed dedup), flip (`set_provenance_status` trigger over live claims), register (`registerCitedSources` live dedup) all **live-by-construction** — residual discharged. Registered `constraint-names-its-enforcement` (dispatch-discipline) + `ascending-cost-irreversibility-tiers` (run-structure) doctrines + runbooks.
- **#332 Fetch-align-diff engine (Wave-β B3):** `amendment-diff.mjs` deterministic core (segment-by-publisher-shape / span-match / delta / timeline-route) + 7 goldens. Fetch+persist deferred to tier-3.
- **#333 Acquisition discovery rung (the CRITICAL DISPATCH):** the ladder had **no discovery rung** — `seek-more.mjs` was fully built with **ZERO live callers** (dormant) while the live path ran an inferior title-only `webSearchAlternatives` shadow. **WIRE, DON'T REBUILD:** built `identifier-variants.mjs` (bare-number→CELEX + separators + US-FR + endpoint ladder + SC-13 ranker; mandated golden `eli/reg/2024/1610/oj`→**CELEX 32024R1610**+fetchable URL), folded into `generateCandidates` (one home), wired discovery-first into `fetchPrimaryWithFallback`/`fetchPrimaryDeep`, retired the shadow. Closed the **split-wake** the census caught (discovery woken without exhaustion-persistence → `persistPrimaryExhaustion`). Furniture inline gate (`looksLikeFurniture`→`captureForStorage`). Behavioral flow-golden `reground-ladder.golden.test.mjs` (Unit-1 exit test). Doctrines RD-34 `referenced-law-exists`, RD-35 `flow-golden-mandate`/`caller-count-is-not-wiring-verification`, `no-shadow-capability`. Post-mortem: [acquisition-ladder-post-mortem-2026-07-14](../audits/acquisition-ladder-post-mortem-2026-07-14.md).
- **#334 Unit 2 + GATE A:** $0 re-diagnosis of all 32 live quarantined items through the completed ladder. [gate-a-truth-basis-2026-07-14](./gate-a-truth-basis-2026-07-14.md).

**Decisions / findings:** (1) **The reframe was corrected by the completed ladder** — the dominant quarantine blocker is **reattribution_debt (21/32) = content HELD + grounded, held sub-floor**, NOT "content never fetched" (only ~11 reach-related). (2) `referenced-law-exists` mechanized: an identifier-bearing item is never "absent" — Unit 2 emits `needs_search`, never `genuine_absence`, until N×M is logged. (3) A capability with a passing test but zero live callers is dormant, not done — critical-path flows now need behavioral end-to-end goldens (the WIRING TRUTH SWEEP found seek-more's siblings). (4) The 60KB "cap" is `CORROBORATOR_MAX_CHARS` (primary is 600K post-#155; floor-first moat already delivers floor sources whole) — reconciled, not rewritten.

**Blockers / open — PAUSED AT GATE A (the one spend gate; $0 so far this batch):** awaiting the operator's ruling on Unit 3 — (a) authorize the fetch plan (4 cents-class re-points incl. eu_clean_trucking→CELEX → 4 open-web discovery → 2 diff-engine re-collections), a subset, or park; (b) run the **21-item reattribution_debt** class now as its own **$0** unit (biggest lever, no fetch); (c) g14 non-EN extraction + `runSeekMore` reconcile-or-retire — build now or backlog. Coverage-universe reconciliation still owed at GATE B.

**Next steps:** operator ruling on the three GATE-A questions → Unit 3 (ascending tiers, lock armed run-scoped) → GATE B close (T9 cert from run evidence, actuals, coverage-universe reconciliation, board + commit).

---

## 2026-07-14 (cont.) — GATE B: the $0 track (re-grounds-never-destroy)

Operator GO "$0 track + incident disposition" after the API spend was fixed. Guard-first, no paid calls (lock OFF). Landed in **PR #336** (`remediation/re-grounds-never-destroy`), GitHub CI **green**. Full close: [gate-b-close-2026-07-14](./gate-b-close-2026-07-14.md).

**Shipped ($0):** (1) **the guard — re-grounds-never-destroy (RD-36)**: `ledger-dominance.mjs` (three axes: FACT / floor-qualifying / verified-eligibility; supersedes count-only `thinning-guard`, deleted — one home). Two layers: `sectionBrief` reconciles by `section_key` so the ledger survives the FK cascade into the guard's snapshot (defect A); `groundBrief` restores-prior + writes a finding + loud `ok:false` on regression (defect B). Red golden = Brazil + the count-blind 55→55-GAP. (2) **charset-aware decode (RD-37)**: `charset-decode.mjs` — `directFetchClean` hardcoded UTF-8, mojibaking Latin-1 gov pages (planalto) to U+FFFD before the grounder saw them (defect C, the paired root of Brazil's 0 facts). (3) **no-shadow**: `runSeekMore` retired (0 callers; one home = `fetchPrimaryWithFallback`), `hardDivergence` per-path keying (portal SKIP is acquire-only → 5 false-held unblocked). (4) **durable re-points**: eu_clean_trucking→CELEX 32024R1610 (read-back VERIFIED) + Krone T-456/24 challenge intel (integrity_flags, EUR-Lex-sourced).

**Decisions / findings:** (1) **Diverged from the stated diagnosis, correctly** — the "non-EN extraction fix" was NOT a grounder-prompt gap (the wrong-language-span rule already existed); the real root was a **charset-decode defect** corrupting the bytes before the model. Reference-vs-working-artifact: cured in the pipeline. (2) The existing thinning guard was **blind twice over** — the section-cascade zeroed its snapshot AND it only checked total count. Both cured. (3) Brazil's 55 facts are **gone from the DB** (2 GAP now); recovery needs a re-fetch (correct charset) + re-ground — parked, protected. (4) `runSeekMore`'s behavioral goldens were already superseded by `reground-ladder.golden` on the wired path → clean retirement, no coverage lost.

**Verification:** 849 tests · tsc 0 · meta-gate PASS (85 invariants + 50 doctrines) · pre-push 4/4 · PR #336 CI green.

**Blockers / open:** (a) **Cost estimate requested before any spend** — the parked paid queue is priced as facts + a labeled projection (~$7 core / 20 items, empirical $0.34/item from Unit A; +~$3 for the optional 9 retries) in the GATE B doc; **operator sets the number**, lock stays OFF. (b) paid queue order: Brazil restore → g14 proof → 3 ceiling-cut → 5 portal-held → fetch plan (10) → (optional) 9 retries. (c) coverage-universe reconciliation delivered (source + instrument tables): **ABSENT majors** bafa.de/LkSG, fedlex.admin.ch, CII-EEXI/CORSIA/CSDDD/LkSG (keyword screen). (d) still owed: coverage-floor definition (next unit), stale_verified proposal (45), reattribution-verified-half (42 spans — stays parked).

**Next steps:** operator's priced/armed go on the paid queue → run in ruled order (ascending, lock armed run-scoped) → then coverage-floor definition unit.

---

## 2026-07-14 (cont.) — PRICED RUN closed ($17.74 of $20) + model-tier verdict

Operator PRICED GO ($20 bound, retries included) + MODEL-TIER amendment. Ran the paid queue in ruled order under the dominance guard + charset decode + $20-bound halt. **Total actuals $17.74** (Segment-0 A/B $0.43 + 28-item queue $16.30 + Brazil forced re-fetch $1.02), under the bound.

**Enablement landed first ($0, PR #336):** grounding model override (`GROUND_MODEL` knob in generation-config, rule-017-clean) so the A/B verdict sets the default; `totalBoundHalt()` (goldened) + `--bound` + APPLY-refuses-unbounded; Segment-0 A/B harness (guarded ledger resets, rule 015); `model-tier-rule` doctrine. Commits f7adb5f + 7978299.

**Segment 0 — grounding model A/B (EPA, fixed brief, only ground model varied):** Haiku 11 facts/11 floor-qualifying ($0.020) vs **Sonnet 24/24 ($0.108)**. VERDICT: **keep Sonnet for full grounding** — >2× the grounded coverage; at coverage-floor scale Haiku's ~50% loss outweighs the 5× cost saving. `GROUND_MODEL` stays Sonnet; Haiku retained for the cheap delta-review/classify tier. (First A/B invalid — Haiku verified the item → Sonnet skip-guarded; fixed with un-verify-between-models, re-ran clean.)

**Corpus: verified 188 → 195 (+7), quarantined 31 → 24 (−7).** 6 queue items verified + EPA.

**HEADLINE — the guard fired in production.** `us-hd-ghg` (`re-ground REGRESSION [total,facts,floor_qualifying]`) and `uk-rtfo` (`facts 15→1`) re-grounded weaker and were **held with prior ledgers retained** — the exact Brazil failure mode, now caught. re-grounds-never-destroy validated on real spend.

**Brazil incident — charset root FIXED, partial restore.** The queue's Brazil hold confirmed the diagnosis: `holdings_present` refused the re-fetch because the mojibake was in the SNAPSHOT store, not just the pool (I'd cleared only the pool). Cleared Brazil's `raw_fetches` snapshot (source 06ea2956, Brazil-only) + pool, forced a clean re-fetch: **0 facts → 17 facts** — the charset decode restored Portuguese extraction (§14 harvest parsed real "Lei 12.305/2010 enters force"). Still quarantined: 6 facts floor-qualify (planalto T1), **11 grounded to UNREGISTERED hosts** (null-tier → `fact_below_authority_floor`). The destroyed 55 are gone (fresh 17-fact extraction is the recoverable state).

**Decisions / findings:** (1) **The dominant held blocker across the run is UNREGISTERED-HOST / sub-floor** — g14 (diputados.gob.mx), Brazil (11 null-tier), australia-nev, china, korea (law.go.kr): the grounding WORKS and extracts facts from the correct primaries, but those hosts aren't in the registry → null-tier → below floor. This is a **source-registration gap, not a grounding failure** — the next high-leverage unit (register the primary hosts so their facts qualify). (2) `holdings_present` reads BOTH pool and snapshot — a forced re-fetch must clear the snapshot too. (3) A truncation-ceiling wall hit us-hd-ghg (600KB Federal Register doc, context-ceiling-wall(floor)) — surfaced, not silent.

**Blockers / open:** (a) **host-registration sweep** — register the unregistered primary hosts (diputados.gob.mx, law.go.kr, arena.gov.au, etc.) so the ~grounded-but-sub-floor items verify; biggest lever, mostly $0. (b) Brazil full verification pending that registration + a missing-slot fill. (c) 22 held items' dispositions (mostly sub-floor/slot — re-home or GAP). (d) coverage-floor definition (the absent majors: bafa/LkSG, CII/CORSIA/CSDDD). (e) stale_verified (45), reattribution-verified-half (42, parked).

**Next steps:** host-registration sweep (register the primaries the run surfaced → re-ground the sub-floor holds cheaply) → Brazil full restore → coverage-floor unit.

## 2026-07-17 — Session B (promotion lane): canada-clean-fuel promoted + partial drain

Session B repurposed to the PROMOTION PIPELINE (lane split found 0 mechanical Lane-B items). Per-item under mutation lease (H5, session-B holder).

BANK 1 — canada-clean-fuel (5b2c6655): PROMOTED. Derived canonical id SOR/2022-140 (verbatim x9 in the staged Justice-Canada primary; source_url is that exact SOR PDF), id-stamped via new scripts/_reground/id-stamp.mjs (verify-before-write, lease-checked, guarded) -> target-match match/subject-overlap(0.8) -> match/raw-id(1.0), id-confirmed clearance-grade. Mechanical drain: drain-clear versioned out 4 orphaned_no_prose_referent (Fuel LCA Model version notes + org-count; slot-safe, all 4 required slots FACT-covered at tier 2; preserved in claim_versions, non-destructive). RESIDUAL to Lane A: 7 in-prose ANALYSIS claims (2024 CATS credit-market data) fail criterion-4 analysis_missing_label_syntax -> per-claim prose-label judgment, beyond the three sanctioned exits. Lease released, worklist row annotated (primary_id_confirmed=true, lane A). $0. Live claims 73->69.

New tool: scripts/_reground/id-stamp.mjs — the 4ff5cf56 id-stamp promotion pattern factored for the B-CANDIDATE lane (verify-then-stamp, refuses + REASSIGN-TO-A if the proposed id does not id-confirm the staged capture).

BANK 2 — bec305e1 (Greenhouse Gas Emissions Standards for HD Vehicles Phase 3): PROMOTED. id-stamped 2024-06809 (FR doc number; verbatim x2 in the 600k-ch FR primary staged in the pool) -> match/raw-id, id-confirmed. drain-clear: 0 mechanical exits (0 cross-instrument, 0 orphaned); 4 relabel-manual true-but-secondary residual -> Lane A. Lease released. $0.

TOOL FIX (id-stamp.mjs): the first cut read only the raw_fetches snapshot; for pool-staged primaries (empty snapshot, primary in agent_run_searches) it wrongly scored 0 and REFUSED. Now unions snapshot + >200ch pool rows (id-confirmation checks own-id-present, which wins first in the verdict; drain-clear independently re-verifies the true primary before any clear). canada (bank 1) had a populated snapshot so its promotion was unaffected.

FINDING (promotion lane): subject-matched items id-stamp cleanly (canada SOR/2022-140, bec305e1 FR 2024-06809), but their drain residuals are dominantly relabel-manual / analysis_missing_label_syntax = judgment, not the mechanical exits. So the lane converts subject-overlap -> id-confirmed (a real unlock) + applies the few mechanical version-outs, but the items still land in Lane A for relabel judgment. Promotion reduces A's work; it does not usually fully verify.

BANK 3 — o13 (IMO Net-Zero Framework): REASSIGN-TO-A (not promoted). Staged capture is an IMO press briefing (imo-approves-netzero-regulations.aspx), not the enacted instrument; references many past MEPC resolutions but no own-id for the framework (its MARPOL Annex VI amendment, approved-not-yet-adopted at capture, is absent). Capture-suspect + re-acquisition judgment -> Lane A. Lease released. $0.

RUNNING TALLY (session-B promotion lane): 3 processed — 2 PROMOTED (canada SOR/2022-140, bec305e1 FR-2024-06809; both id-confirmed, mechanical exits applied, relabel residual to A), 1 REASSIGNED (o13 press-briefing capture). All leases clean. No paid spend. Pattern holds: id-stamp promotes cleanly where the staged capture IS the enacted primary bearing an own-id; press-briefing/portal captures and no-own-id frameworks reassign to A.

## 2026-07-17 — Session A (archive endgame): 198 verified-disposition removals + label-is-not-proof doctrine

VERIFIED DISPOSITION, not deletion — every removed row is sample-gated, tombstoned, snapshotted, reversible.

SAMPLE-VERIFY FINDING (the headline): archive_reason does NOT partition cleanly. Content-bearing intelligence items are scattered through every "delete" bucket; the title-level Haiku census rubber-stamped the label. Content-test across the 308 census-archive_correct delete candidates: reclassified_to_source 261 = 174 provably-empty / 87 content-bearing (56 with grounded claims); portal_artifact 19 = 16/3; error_page_artifact 6 = 5/1; source_not_item 5 = 0/5. Survivor-test on the 17 duplicate-family losers: only 3 have a mechanically-confirmed live verified survivor. NO label bucket clears 95%. This is the THIRD confirmation of label-is-not-proof (Oregon/Polish collision, o13 press briefing, now 110-of-308 at scale).

RE-PARTITION (operator-approved in full): delete ONLY the mechanically-verified set (100%, not sampled), route content-bearing/unconfirmed to per-item review.

BANK — 198 verified-disposition removals: 174 reclassified + 16 portal + 5 error provably-empty shells (brief_len=0 AND zero grounded claims; content survives in a live active source row) + 3 confirmed-survivor duplicates (o2 FuelEU→7a0ead55 61KB, EU 2025/40→g2 efdb3390 73KB, AFIR→62ba40b0 32KB; merged_into recorded). Reconciliation: disposition_ledger rows this op = 198 = deletions = archived-drop; archived 419→221; verified 202 / quarantined 33 UNCHANGED (zero live item touched); 3-random-tombstone spot-check: every snapshot_pointer resolves to an active source, every item truly deleted (delete followed tombstone). Session-A disposition count this bank: 198.

MECHANICAL GATE baked into the vehicle (label is not proof, enforced in code not trust): tombstone-delete.mjs gains --bucket (census archive_correct only) + --empty-only (brief_len=0 AND zero section_claim_provenance claims) + DELETABLE_REASONS allowlist (content-survives/duplicate/pure-artifact only; off_vertical/non_regulatory_source/Superseded/Repealed REFUSED). Golden scripts/verify/disposition-content-gate.golden.mjs (structural, 18/18). Doctrine label-is-not-proof + invariant RD-42 (SKILL.md Section 4 category 30). Meta-gate PASS (95 invariants + 62 doctrines wired).

NEXT (Session A): open the per-item review lane on the 199 (91 content-bearing skipped this op — 87 reclassified + 3 portal + 1 error; + 5 source_not_item + 14 unconfirmed duplicates = 110; + 33 null-reason + 56 review_valuable). RESTORE-first on named candidates (Blue Visby, UN SDGs, DEFRA, TxDOT, World Bank, ITF, Carbon Pricing Dashboard) — wrongly-archived paid-for intelligence. Restores enter drain_worklist as ordinary quarantined; Session B meets them through its normal queue. 16 HOLD stand never-delete.

INCIDENT + RESOLUTION (shared-checkout, resolved, no content loss): a mixed commit (683f410b) briefly bundled Session C's migration 214 with Session A's 6 uncommitted archive-endgame files; caught before push (operator hold-and-report). Session C `reset --soft` (non-destructive) and re-committed only its 2 files clean as 8e571a8f; Session A's 6 returned byte-identical and are committed here as A's own bank. Session C migrated to its own worktree (`.worktrees/wt-session-c`) — worktree separation closes the class. Standing rule now in force: each session appends this log ONLY from its own tree and pulls before pushing; trivial append conflicts resolve keep-both per the bank protocol.

## 2026-07-17 — Session C (coverage discovery lane): COMPLETE, pushed clean

Worktree: `.worktrees/wt-session-c`, branch `corpus-integrity/cc-grounding-executor-c` (isolated from the shared main tree per the worktree-separation rule above). Migration 215 (LatAm/MEAF completion pass, operator-directed) committed clean (`032bd8a2`, 2 files, no cross-session content) and pushed to origin. Pre-push guard 4/4 clean. No CI run fires yet (this repo's Actions trigger on `pull_request`, not plain branch push); a PR opens when the operator is ready to merge coverage_gap_candidates into master.

FINAL TABLE (`coverage_gap_candidates`, 21 rows, complete first pass across EU/US/UK/DE/CH/global/asia/latam/meaf): 18 MISSING, 1 AMBIGUOUS_ARCHIVED (IMO CII, resolves when the 199-item review lane lands), 2 HAVE_QUARANTINED (IMO Net-Zero/GFI e241fe75, China transport-ETS 3e756291 — both already in-drain, excluded from MISSING). 10 major / 11 minor. Read-only lane throughout: zero corpus writes, zero drain_worklist touches, zero leases. Session C lane COMPLETE, idling.

## 2026-07-17 — Session A (review lane bank 1): 7 named RESTOREs recovered

Review lane opened on the 199 (110 content-bearing/unconfirmed + 33 null-reason + 56 review_valuable). Standing taxonomy: RESTORE-to-live / CONFIRM-archive-with-reason / HOLD-with-evidence, per-item content read under lease.

New tool: scripts/_reground/restore-to-live.mjs — REVIEW-LANE RESTORE executor. Guarded un-archive (is_archived=false, archive_reason=null, reversible snapshot) under mutation lease; reads back the recomputed provenance_status; if not verified, enqueues to drain_worklist (Lane A) so the normal drain queue meets it. SAFETY: refuses an empty shell (brief_len=0 AND zero claims) — that is a CONFIRM-archive, never a RESTORE. Executes a RESTORE verdict, never infers it. Dry-run default.

BANK — 7 named candidates RESTORED (content read confirmed genuine intelligence wrongly archived as reclassified_to_source; paid-for inventory): TxDOT Freight Planning (41 claims), g27 UN SDGs 9&13 (30), g30 World Bank Transport (24), World Bank Transport Strategy 0a8b8ef0 (20), ITF 2019 (12), t5 Carbon Pricing Dashboard (35KB brief), o12 Blue Visby Solution (22KB brief). Recompute: g30 + 0a8b8ef0 -> live VERIFIED directly (grounded claims pass validate_item_provenance); TxDOT/g27/ITF/t5/o12 -> quarantined + enqueued drain_worklist Lane A. Counts: archived 221->214 (-7), verified 202->204 (+2), quarantined 33->38 (+5). All leases clean. $0.

HOLD-with-evidence: c828810c "World Bank Transport Sector Strategy" — near-duplicate of the restored 0a8b8ef0 (same worldbank.org/[ext/]en/topic/transport page, /ext/ URL-drift dup). Stays archived pending a dedup look; NOT restored (no live duplicate created). g30 is distinct (ieg.worldbankgroup.org = Independent Evaluation Group).

NEXT (review lane continues): remaining 80 content-bearing reclassified (incl. DEFRA), 3 portal + 1 error content-bearing, 5 source_not_item, 14 unconfirmed duplicates, 33 null-reason (per-item content look, reason recorded), 56 review_valuable. Session-A review-lane disposition count this bank: 7 RESTORE + 1 HOLD.

## 2026-07-17 — Session A (review lane bank 2): 80-item triage begins — 22 genuine-items RESTORED + content-is-not-nature

The 80 content-bearing reclassified do NOT sweep — item-vs-source NATURE is the RESTORE test and it is judgment-grade (operator ruling: the sweep becomes a per-item triage). Criterion: RESTORE what a freight customer reads as intelligence (named reg/standard/framework/program/finding with decision value); CONFIRM-archive what describes an access point/publisher/portal/register/org-overview (content survives as the source row the reclassification correctly created).

DOCTRINE — content-is-not-nature (second-order addendum to label-is-not-proof, extends the RD-42 doctrine + SKILL.md category 30): a mechanical content floor (brief present, claims real) is NECESSARY but NOT SUFFICIENT to restore — it cannot tell whether content CONSTITUTES an item or DESCRIBES a source. That discrimination is JUDGMENT, stays in the review lane permanently, never mechanized. label-is-not-proof binds OPERATOR labels too: the operator-named DEFRA presumption was OVERRIDDEN by content read (row = "UK DEFRA: Organizational Overview" = source-shaped) -> CONFIRM-archive on evidence.

GROUP ① GENUINE ITEMS RESTORED (22 this bank, jurisdiction-checked): CORSIA(a1), EEXI+CII, EU MRV(o6), EPA SmartWay(g8), GHG Protocol(c6), SBTi(c7), IPCC Climate Reports(g28), IPCC 2nd-Order Draft, Singapore Green Plan 2030(g20), ASEAN Transport Plan(g24), IDB LatAm Transport(g16), IDB Group Transport Framework, National Logistics Plan(BR), Georgia Multimodal Freight Network, WTO Trade+Environment Framework, UNCTAD Transport Infrastructure Programme, CEC North American Env Policy(g11), ESMA MiCA deadline, Port of LA Env Framework, + Australia/Brazil/China Regional Operations Profiles. Recompute: 4 -> live VERIFIED (IDB Group, WTO, UNCTAD, Port of LA), 18 -> quarantined + drain_worklist Lane A.

JURISDICTION MIS-CODE CAUGHT (the sweep is the cheapest moment): ASEAN Transport Plan(g24) carried ["MY","PH","SG","US-ID"] — "US-ID" (US-Idaho) was Indonesia "ID" mis-coded to a US state (the CO/Colombia collision class). Fixed to ["ID","MY","PH","SG"]. Georgia Multimodal + Port of LA correctly coded US (not GA-country / Louisiana).

COUNTS: archived 214->192 (-22), verified 204->208 (+4), quarantined 38->56 (+18). Review-lane RESTORE running total: 29 (7 named bank-1 + 22 this bank). All leases clean. $0.

SESSION B RELAUNCH SIGNAL LIVE: 23 restored quarantined items now in drain_worklist (> the ~15 threshold). Relaunch Session B (Sonnet, worktree .worktrees/wt-session-b, standing opener) to drain the 56 quarantined while Session A continues verdicts.

NEXT (review lane continues, per-item): GROUP ② source-descriptions -> CONFIRM-archive (EUR-Lex, EEA, Kansas/NC Register, portals, org-overviews, DEFRA; tombstone-delete ONLY where the source row exists+active, else register-first/HOLD). GROUP ③ the ~28 ambiguous per-item reads (research orgs/news outlets/agency pages) via the operator's discriminators: org restores only if it carries a specific finding/standard/position with freight value; agency PAGE=source, agency PROGRAM with obligations=item. Then the smaller buckets (5 source_not_item, 14 unconfirmed dups, 3 portal + 1 error content-bearing), 33 null-reason, 56 review_valuable. Full item-by-item ②/③ audit table at their bank.

## 2026-07-17 — Session A (review lane bank 3): Group ② — 22 source-descriptions CONFIRM-archived + tombstoned

GROUP ② source-descriptions (access points / publishers / portals / registers / org-overviews) → CONFIRM-archive + tombstone-delete (all 22 verified to have an ACTIVE source row = content survives; operator tombstone rule enforced in the tool). Disposition=confirm_archive_source_description.

The 22: EUR-Lex(g4, the legal database — archetype), EEA(g3), Kansas Register, North Carolina Register, NY Senate Legislation Portal, Colorado General Assembly Laws Portal, EIA Open Data Portal, EU Finance Portal, Montreal Environment Portal, edie News Portal, ICAP Allowance Price Explorer(Terms of Use), GEF Leadership/Org-Structure, GEF Restructured-Instrument Org-Framework, German Fed Ministry of Transport Policy Hub, ECLAC Organizational Overview, Community of European Railways Org-Overview, Access to Diário Oficial(access guide), Arkansas Dept of Energy+Environment, Pennsylvania DEP Agency-Programs-Overview, International Institute for Conservation(professional resources), American Alliance of Museums(professional resources), and UK DEFRA: Organizational Overview (the operator-named presumption overridden by content read).

TOOL: tombstone-delete.mjs gains --require-active-source (refuses to delete a content-bearing source-description unless its source row exists+active — content must survive somewhere before the item stops being the place it survives). Golden disposition-content-gate.golden.mjs extended to 20 checks (proves the source-survival gate). Meta-gate PASS.

SWEEP LEDGER created (docs/ops/sweep-ledger.md, SW-1): jurisdiction-code country/US-state collision class — 4 confirmed instances (Colombia/US-CO, India/US-IN, Indonesia/US-ID caught this session, + GA letters-identical). One-query corpus-wide sweep PENDING for when the review lane completes (close the class wholesale, not instance-by-instance). Logged so it is not lost.

COUNTS: archived 192->170 (-22). Session archive total: 419 -> 170. verified 208 / quarantined 56 unchanged. disposition_ledger: 22 confirm_archive_source_description + 198 archive-endgame + 1 prior = 221. All leases clean. $0.

NEXT: GROUP ③ the ~28 ambiguous per-item reads (research orgs / news outlets / industry bodies / agency pages / institution topic-areas / tools) via the operator discriminators. Then 5 source_not_item, 14 unconfirmed dups, 3 portal + 1 error content-bearing, 33 null-reason, 56 review_valuable. Full ②/③ audit table stands in this log across banks 3-N.

## 2026-07-17 — Session A (SURFACE-CONTRACT SCOPE GATE dispatch): five-surface scope test made mechanical

DISPATCH: scope verdicts failed 3x this week by testing against ONE surface instead of five. Make the five-surface test mechanical + universally loaded. Executed per the operator's COMBINED RULING.

STOP-AND-SURFACE (before touching anything): re-oriented against the LIVE coverage_gap_candidates and found the dispatch premise stale. Session C had applied migrations 216-219 (data_class instrument/data_feed split, labor/energy/fuel data-feed rows) — files NOT in my tree, C active within hours. The table has NO declined/parked concept and NO TRUCRS/Clean Truck Check rows; the 27 data_feed rows were KEPT (C's lane embodies the fix, did not commit the "declined despite Operations" error). Surfaced two decisions.

OPERATOR RULING: (1) SCHEMA OWNERSHIP — Session C owns coverage_gap_candidates + is mid-flight; C lands the disposition{kept,declined,parked} + surface_test jsonb + five-surface CHECK in its OWN migration at its own cadence; Session A does NOT touch the table. (2) SEEDING — DORMANT: nothing was ever declined, so no backfill, no synthetic rows; demonstrability lives in the golden's FIXTURES, never in production data; the gate binds the next real decline.

SESSION A EXECUTED (everything except schema):
- DOCTRINE every-decline-names-the-five-contracts (doctrine-register.mjs) → invariant PI-5-every-decline-names-the-five-contracts (invariants.mjs, skill caros-ledge-platform-intent). enforcedBy the golden; live DB binding PENDING-C, named-not-silently-unwired.
- GOLDEN scripts/verify/surface-contract-gate.golden.mjs (fixture-driven, 12 checks green): PART A proves the completeness gate red-then-green (declined/parked without the five-surface record FAILS; with it PASSES; kept/candidate exempt) — it is the SSOT for the JSON shape (CONTRACT_KEYS = regulations/operations/market_intel/research/community; each {verdict,reason} non-empty). PART B SCANS the migrations tree for C's migration and AUTO-ARMS the moment it lands (asserts surface_test + disposition{declined,parked} + a CHECK referencing all five keys); until then prints PENDING-C and passes.
- SKILL SECTION caros-ledge-platform-intent "The Five-Surface Scope Test" — five contracts verbatim, the every-decline rule (PI-5 anchor), the inline test format, FOUR worked examples (a: data-feeds-vs-Operations; b: Market Intel discovery omitted; c: Research discovery omitted; d: Clean Truck Check declined whole → Operations=IN, the gate catching its own author's dispatch). Marker baseline 10→12.
- STANDALONE SKILL .claude/skills/caros-ledge-surface-contracts/SKILL.md (operator's side; description triggers on any scope/coverage/source-inclusion/feature-inclusion question) — same content; delivered in full in chat for the operator to save.

The five contracts: Regulations = compliance-action text brief; Operations = structured jurisdictional cost intelligence; Market Intel = comparative/numerical; Research = structured horizon assessment (distance/maturity/credibility/assumption-shift); Community = human-operated, outside machine intake.

VERIFY: meta-gate PASS (96 invariants + 63 doctrines wired), golden 12/12, doctrine-contradiction exit 0. $0.

PENDING-C (owed by Session C, not Session A): add disposition + surface_test + five-surface CHECK to coverage_gap_candidates in C's own migration, no backfill; POST THE MIGRATION NUMBER HERE when applied so Session A adds migration:NNN to PI-5.enforcedBy (the golden auto-arms regardless).

NEXT (Session A): back to the review lane — GROUP ③ ~28 ambiguous per-item reads, then the smaller buckets, toward zero-archived (170).

## 2026-07-17 — Session A (review lane bank 4): Group ③ RESTORE side — 8 genuine items recovered

Group ③ = the content-bearing item-vs-source judgment reads (reclassified_to_source / source_not_item / institutional_source / off_domain, 55 rows triaged). This bank executes the RESTORE side only (reversible, lowest risk); the DELETE side (confirm-archive + tombstone of source-descriptions) is held for a dedicated bank with FULL content reads — label-is-not-proof forbids an irreversible delete on a 200-char snippet.

RESTORED (8, all content-rich, jurisdiction-checked, restore-then-drain → quarantined + drain_worklist Lane A):
- China's Environmental Code (regulation, 35 claims, 83KB; adopted 2026-03-12, in force 2026-08-15) — major reg, CN.
- Florida DEP Notice of Proposed Rulemaking Ch 62-210 (regulation, 48 claims) — US.
- North Carolina Transportation Climate Action EO 80/246 (directive, 39 claims) — US.
- New York DEC Regulatory Framework (framework, 37 claims, 65KB) — US.
- International Roadcheck 2026 (market_signal, 29 claims; CVSA enforcement blitz) — US.
- Colorado DOT Environmental Programs (regional_data/Operations, 13 claims) — US (NOT bare "CO" → no Colombia collision).
- Iowa DOT Freight Planning (regional_data/Operations, 17 claims) — US.
- Louisiana State Freight Plan 2024 (regional_data/Operations, 10 claims) — US.
JURISDICTION CHECK: all US or CN; none carry a bare collision-class token (CO/IN/ID/etc.). Clean.

CONFIRM-ARCHIVE source-descriptions IDENTIFIED (delete-side, HELD for content-read bank — active source verified, tombstone-eligible under the Group ② rule, but each needs a full-brief read before an irreversible delete): institution/research-org/publisher/journal/database profiles — g12 ECLAC, t3 OECD Environment, OECD Environment Policy Area, c9 CDP Supply Chain, Centre for Sustainable Road Freight, g22 CCICED, g23 Australia CCA, g29 IEA PAMs Database, r1 MIT CTL, r3 Fraunhofer IML, r5 SEI, r6 TNO, r35 ICCT, r13 GreenBiz, r19 Supply Chain Digital, r21 Sustainability Magazine, r9 Transportation Research Part E (journal); source_not_item portals — Alternative Fuels Data Center, IEA Data Explorer Platform, Montana Legislature/MCA. (g12/t3 = the known tool-typed institutional data-debt.)

HOLD (borderline — next-bank deep read): industry-body INITIATIVES that may carry a specific standard/position (restore candidates) — r24 ZEMBA, o10 ESPO/EcoPorts, g9 SPC/How2Recycle, l4 CER modal-shift (possible dup of the bank-3-tombstoned CER org-overview), o11 Lloyd's Register Decarb Hub, r17 Project Drawdown Explorer, a6 ICAO Carbon Calculator (tool/access-point). Possible DUPS of already-restored items (dedup before any action) — t2 WTO Env&Trade (vs bank-2 WTO), t4 UNCTAD SFT (vs bank-2 UNCTAD), World Bank Transport Strategy (vs bank-2 World Bank). Data oddities (claims but empty brief → needs regen, drain territory) — TCEQ Current Rules, ICAP Status Report 2026, Alternative Fuels DC. r2 Kuehne Climate Center = failed-brief refusal, no_src → register-source-first or HOLD. off_domain (4, correctly archived, NOT freight, never-delete accurate) — Matrix Hudson x2, MDEQ Water Advisories, RI Fish Passage.

COUNTS: archived 170→162 (−8), quarantined 56→64 (+8), verified 208. Session archive total 419→162. All leases clean. $0.

STATE RECONCILIATION (operator, this bank): Session B drained its queue — 2 promotions (CORSIA A42-22, EU MRV 2015-757 → verified-track; C's coverage_gap pending row can resolve, C-owned) + 21 reassignments to Session A's lane (drain_worklist, each with a recorded finding; several carry acquisition/conflation flags — READ the annotation before working). B self-activates on unclaimed rows.

NEXT (Session A, my sequencing): (1) the 21 B-reassignments — read each drain_worklist finding first. (2) Group ③ DELETE-side content-read bank (the confirm-archive source-descriptions above). (3) HOLD deep-reads + dup-checks. (4) smaller buckets (5 source_not_item done-triaged, dup_instrument survivor-IDs, null-reason 33, review_valuable). Toward archived zero (162).

## 2026-07-17 — Session A (B-reassignment bank 1 / drain bank 5): SW-1 jurisdiction collisions fixed + full 54-item B-queue disposition plan

Session B handed off 54 items to lane A (drain_worklist, assigned_by=session-B) — more than the stated 21 (21 = B's latest batch; 54 = B's full handoff). All lane A, quarantined, each with a precise finding. Read all 54.

EXECUTED THIS BANK — SW-1 jurisdiction-collision class (the cheapest moment = at handling), $0, guarded+snapshotted+read-back-confirmed (scripts/_reground/jurisdiction-collision-fix.mjs):
- Canada Clean Fuel Regs 5b2c6655: iso ["US-CA"]→["CA"] (Canada, NOT California — NEW collision member).
- Colombian Ministry of Transport 3e9c3ebe: iso ["US-CO"]→["CO"] (Colombia, not Colorado).
- India National Logistics Policy beae0a7e: iso ["US-IN"]→["IN"] (India, not Indiana).
- Japan Customs ad4cc6c6: ["AE","BD","JP"]→["JP"] (dropped UAE+Bangladesh pool-conflation).
ROOT CAUSE found: jurisdictions (text) was CORRECT while jurisdiction_iso was WRONG → the derivation fn
_derive_jurisdiction_iso_from_canonical maps country CA/IN → US-state US-CA/US-IN. SW-1 corpus-wide fix is a
DERIVATION-FUNCTION migration; per-row fixes close the live instances. Sweep-ledger SW-1 updated (CA added).

DISPOSITION PLAN for the remaining 50 (next banks; sequenced by $0-actionability):
$0 RELABELS (item_type/format mis-set, unambiguous): IPCC Climate Reports (regulation→research_finding), UAE
National Net Zero (regulation→framework), IPCC 2nd-Order Draft (keep research_finding, MONITORING pre-pub).
Needs proper relabel path (item_type + format_type re-pin) — not a raw column edit.
DEDUP (confirm survivor, merge-tombstone): UAE National Hydrogen Strategy-Transport vs UAE Hydrogen
Implementation (same pool[0]); Japan GX League (possible dup) — confirm then merge.
INTEGRITY FLAGS (title claim unsupported — do NOT ground, review for archive/re-ground): India NLP Carbon
(claim + confidentiality), China National Carbon Market Extension (claim + roadblock), UAE Hydrogen
Implementation (claim + roadblock). Highest-priority review class.
PORTAL/HUB/OVERVIEW re-point-or-reclassify (portal-source defect, task #8 class): GHG Protocol, Green Building
Standards, IMO Air Pollution overview-hub, Oregon DEQ Central Hub, Brazil Logística Reversa, Nashville programs
hub, Washington WAC code-index, SBTi org-homepage, IDB topic-page, UK SECR, UK Transport Decarb, IMO Net-Zero
(press-briefing capture). Re-point needs acquisition (spend-gated) OR reclassify-to-source.
ACQUISITION-BLOCKED HOLDS (roadblock/paywall/zero-staged-primary — spend-gated, RD-6 deferral): ISO 14083
(paywalled), Japan GX (DNS/403 roadblock), ITF 2019 (roadblock+off-vertical), the ZERO-STAGED-PRIMARY set
(Australia/Brazil/China Regional Ops Profiles, Blue Visby, ESMA MiCA, World Bank Carbon Pricing Dashboard —
my bank-2 restores, pre-capture-standard). PAID grounding dead ($75 ceiling) → free-acquisition path or HELD.
FRAMEWORK/PLANNING-DOC class (genuine, no instrument number — accept w/ GAP): Georgia Multimodal, BR National
Logistics Plan, TxDOT, Wisconsin, ASEAN (currency/succession judgment), Singapore Green Plan 2030.
"PROMOTED by session-B" (verify actual provenance_status — B's grounding wins): GLEC v3, ISSB IFRS S2, LA EWEO,
Lei 12.305/2010, Zero-Emission World Heritage, CORSIA, EU MRV. If verified, close the drain_worklist row.
SCOPE/STATUS JUDGMENT: UN SDGs 9&13 (scope), NY Truck&Motor Carrier (scope mismatch), Slovenia (status),
Japanese MLIT (placeholder title), Japan GX Freight (wrong class), Japan Top Runner (repointed, kept), EEXI/CII
(priority, gap-table). Colombia/CEC also carry non-jurisdiction defects (CEC wrong primary) beyond the iso fix.

COUNTS: archived 162 / verified 208 / quarantined 64 unchanged (jurisdiction fixes don't move archive/prov).
All leases clean. $0.

NEXT: (1) the INTEGRITY-FLAG 3 (highest priority — unsupported title claims). (2) verify the "PROMOTED" set +
close resolved drain_worklist rows. (3) $0 relabels via the proper relabel path. (4) dedup the UAE hydrogen pair.
(5) Group ③ DELETE-side content-read bank (archived source-descriptions). Acquisition-blocked holds await the
free-acquisition path / operator spend posture.

## 2026-07-17 — Session A (drain bank 6): the 3 integrity flags (unsupported title claims)

B flagged 3 items "TITLE CLAIM NOT SUPPORTED." Verified each; the integrity rule is absolute.

1. India's National Logistics Policy Carbon Intensity Standards (beae0a7e) → ARCHIVED (unsupported_title_claim).
   FABRICATED PREMISE, web-corroborated: the real NLP 2022 is a cost-reduction policy (logistics cost to 8-9% of
   GDP, ULIP/Gatishakti) with sustainability TOOLS (a Freight GHG *calculator*, Rail Green Points) — it has NO
   "carbon intensity standards" instrument. Carbon-intensity targets are India's economy-wide NDC (45% by 2030);
   vehicle limits are Bharat Stage VI (separate MoRTH). source_url 404. The item conflated three unrelated things
   into a non-existent instrument. Genuinely ungroundable → honest archive (research-or-erase "erase"). The real
   India carbon instrument (CCTS) is already a separate coverage_gap candidate (rank 11).
   + CONFIDENTIAL-DOC COMPLIANCE FLAG FILED (integrity_flags 963d4450, data_integrity): a CONFIDENTIAL NCAER report
   ("Logistics Cost in India", cover page prohibits third-party disclosure) was improperly staged into this item's
   grounding pool by B's finding; it PERSISTS in agent_run_searches/raw_fetches after archive. Needs an operator
   decision on purging + a fetch-time guard (class fix). Cannot self-resolve → the flag is the channel.
2. China's National Carbon Market Extension to Transportation Sector (3e756291) → HOLD (recorded).
   Real policy (Aug-2025 Green Low-Carbon Transformation Opinions) but China's carbon market covers
   power/steel/cement/aluminum ONLY — transport is NOT in scope; the "Extension to Transportation" title is
   PREMATURE/unsupported. Primary mee.gov.cn roadblocked (timeout). Not fabricated (real underlying policy) → HOLD,
   re-scope to the honest policy (transport-not-yet-covered, MONITORING) pending mee.gov.cn re-acquisition.
3. UAE National Hydrogen Strategy Implementation Decree (cfcf9e4c) → HOLD + DEDUP-flagged (recorded).
   The UAE hydrogen strategy is real but VOLUNTARY — there is NO "implementation decree" (pool = law-firm briefings,
   zero decree/cabinet-law number). "Decree" title unsupported (same class as UAE net-zero, bank 5). Primary
   u.ae/uae.gov.ae roadblocked. Also a DUP of "UAE National Hydrogen Strategy - Transport." → HOLD; on re-acquisition
   re-title to "strategy" + dedup the pair.

TOOL: scripts/_reground/archive-item.mjs (honest-archive / research-or-erase "erase" executor, guarded+leased+
snapshotted, removes from drain_worklist). Reusable for the erase disposition.

COUNTS: archived 162→163 (+1 India erase), quarantined 64→63 (−1), verified 208. Session archive net 419→163.
All leases clean. $0 (one free web-search corroboration). integrity_flags: +1 open (963d4450).

NEXT: verify the "PROMOTED-by-B" set (7: GLEC v3, ISSB IFRS S2, LA EWEO, Lei 12.305/2010, Zero-Emission World
Heritage, CORSIA, EU MRV) + close resolved drain_worklist rows; then $0 relabels via the proper relabel path;
dedup the UAE-hydrogen pair; Group ③ DELETE-side content-read bank. China/UAE holds await re-acquisition.

## 2026-07-18 — Session A restart: TWO-FILE session-log correction + NCAER ruling closed

**CORRECTION (own error, surfaced immediately, not buried):** on restart, reconciliation was run against
`fsi-app/docs/ops/session-log.md` — a SEPARATE, STALE fork of this file that stopped receiving real entries
after commit `42ac8969` (2026-07-17 compact-prep-handoff) while every subsequent bank (banks 1-6 of the
review lane, SW-1, the scope-gate dispatch, this file's own entries) kept landing HERE, at the canonical
root path (per `CLAUDE.md` standing rule 6 + the self-annealing protocol, both of which say `docs/ops/
session-log.md` meaning repo-root `docs/`, not `fsi-app/docs/`). This was misdiagnosed as an 8-commit
divergence-from-record and "backfilled" into the WRONG file (commits `eb468f03`, `88886d0b` on this branch)
before the mistake was caught. That backfill content is redundant now (this file already carries the real,
richer detail for every one of those banks) but is harmless where it sits — the fork is deprecated in place
with a pointer to this file rather than deleted, so no history is destroyed. Root cause: the `fsi-app/docs/`
tree duplicates several root `docs/` categories (ops/, audits/, compliance/) without doctrine distinguishing
which is canonical; this file and `CLAUDE.md` are unambiguous, `fsi-app/docs/ops/session-log.md` is not
referenced as canonical anywhere. Flagging for an operator decision on consolidating or deleting the
`fsi-app/docs/` duplicate tree at a later bank — not done here, out of scope for a reconciliation bank.

**PROCESS FIX (operator ruling 2026-07-18):** two INDEPENDENT sessions (this restart, and Session B's
2026-07-17 containment bank) each wrote real work to the stale fork without noticing. Two independent misses
means the fix is MECHANICAL, not advisory — "remember which file" has already failed twice. The deprecation
pointer added to the fork's header covers the near term (a session that opens and reads it gets redirected);
a cheap mechanical check (a discipline/pre-commit line flagging any commit touching `fsi-app/docs/ops/
session-log.md`) is the real close and is logged as SW-2 on the sweep ledger (`docs/ops/sweep-ledger.md`),
pending — not built this bank per operator instruction, so it stays visible rather than silently deferred.

**NCAER confidentiality incident (`integrity_flags` 963d4450, `beae0a7e`) — RULED AND CLOSED.** Session B's
containment (2026-07-17, commit `063d6b0b` on branch `-b`, also landed against the fsi-app fork — same
mistake, independently made) traced the pool row, found the original pipeline fetch was CDN-blocked and
captured nothing (a 269ch Akamai Access-Denied stub, not document content), confirmed via investigative
re-fetch that the host serves the document publicly (no auth) but deleted the local copy before writing the
record, and redacted the `agent_run_searches` row to a do-not-refetch containment marker (guarded,
non-destructive). Full record: `fsi-app/docs/compliance/confidentiality-incident-2026-07-17-ncaer.md`.

Session A independently re-verified before relying on it (operator instruction: complete the trace, don't
just read it): corpus-wide query of `section_claim_provenance` by `search_result_id` and by the registered
`dpiit.gov.in` `source_id` — 0 rows either way; corpus-wide scan of `agent_run_searches` for the document's
URL/host — the one row already found is the ONLY match anywhere. **Grounding-exposure finding, confirmed
independently twice: zero claims ever grounded from this document, zero customer-surface exposure, at any
point.** No counsel-notification trigger.

Actions completed: evidentiary-metadata gap (no content hash — the only real copy was deleted before this
requirement existed; re-fetching to backfill it would recreate the exposure) disclosed honestly rather than
filled. RD-46 doctrine addendum landed (`remediation-discipline` SKILL.md): confidentiality-ruled purges are
a sanctioned, per-instance, operator-ruled exception to append-only — registered as invariant RD-49 (exempt,
process-class, same footing as RD-8), meta-gate re-baselined 39→40, passing. Hardening ledger entry added
(`docs/PROGRAM-BOARD.md`): confidentiality-marking capture-gate detector, QUEUED, this incident as origin
case. `integrity_flags` 963d4450 resolved via `guardedUpdate` under a mutation lease on `beae0a7e` (snapshot
`2026-07-18T19-18-50-466Z_integrity_flags.jsonl`, reversible). All committed to `corpus-integrity/cc-grounding-
executor` (`88886d0b`), pushed, CI green.

RECONCILIATION (against the real record, this file): branch up to date with origin at `e827af6b` before this
bank. `mutation_leases` empty — no stale leases, nothing to release. `drain_worklist` 64 rows, all lane A (0
lane B, consistent with the "Lane B ~empty" finding). Live corpus at bank start: verified 208, quarantined 63,
archived 163 (matches this file's own last-recorded counts exactly, once the confusion above is set aside).

NEXT (operator's ordered queue): review-lane Group ③ DELETE-side content-read bank (archived source-
descriptions, per line 579 above), the 21 B-reassignments (drain bank 5's 54-item B-queue), the scope-gate
unit at a bank break, eu_clean_trucking full grounding pass, the SW-1 corpus-wide jurisdiction sweep.
Going forward: this file only, every bank, log entry inside the bank commit. Lease state (session A): clean.

## 2026-07-18 — Session A (review-lane bank 5): Group ③ DELETE-side, all 20 read, per-item judgment

Full content read (not title/excerpt) on all 20 confirm-archive candidates from bank 4's list. Mechanical
content floor (brief present, active source registered) is necessary but not sufficient per content-is-not-
nature — the actual call is whether the brief carries a specific finding/standard/program with freight
decision value, or is an org/publisher/portal/database profile. Claim count alone misleads in both directions
(OECD Environment Policy Area had 24 "claims" that were all taxonomy-menu facts about a topic-hub page — still
CONFIRM-ARCHIVE; several genuine RESTORE candidates below had 0 claims because grounding never ran on them).

**CONFIRM-ARCHIVE, tombstoned + deleted (14, all verified against an active source row first):**
- reclassified_to_source (10): OECD Environment Policy Area (c3004aa0, topic-hub taxonomy, zero findings),
  Centre for Sustainable Road Freight (685f0d28, brief's own text: "no quantified findings...homepage does not
  contain these numbers"), China CCICED (935680f5, source content dated 2009-2015, no current output), Australia
  Climate Change Authority (7566f099, real founding Act but zero direct obligations, every line "Legal
  Confirmation Required"/research gap), IEA Policies & Measures (6d2ec398, a database-of-other-policies catalog
  page), Stockholm Environment Institute (abd83595, brief's own scope note: "functions as an institutional
  intelligence profile...rather than a summary of specific empirical findings"), ICCT (e948b3a9, brief's own
  scope note explicitly defers specific findings to separate tracked items), Supply Chain Digital (b26de8fc,
  homepage headline index, no depth), Sustainability Magazine (3fb2905b, homepage topic index, no depth),
  Transportation Research Part E (0d59991d, a journal — brief's own text: "documents the journal as a source
  vehicle...rather than a specific research finding").
- source_not_item (2): IEA Data and Statistics Explorer Platform (d8305603, data-tool catalog description),
  Montana Legislature/MCA (60ade636, the entire state code, portal to everything not one instrument).
- institutional_source (2): ECLAC (72be8dd3, a thin 2016 bulletin summary, no reproducible findings — full
  Spanish-only text never read), OECD Environment (e360e82f, pure mission/mandate profile, zero findings).

**RESTORE (3, genuine specific finding/program with freight decision value, NOT an org profile despite the
reclassified_to_source label):**
- CDP Supply Chain (d30bc25d) → quarantined + drain_worklist Lane A. Real program: membership tiers, 2026
  disclosure-cycle deadline, ACTION REQUIRED section with owners/timeframes. Genuinely actionable, not "CDP
  exists."
- MIT Center for Transportation & Logistics (c2e45859) → quarantined + drain_worklist Lane A. Named 2025 State
  of Supply Chain Sustainability Report with quantified findings (Scope 3 >75% of footprints, biofuels cited as
  most practical near-term freight lever) and a specific, quotable, actionable finding (consolidated delivery
  vs. expedited-shipping emissions).
- Fraunhofer IML (c1cab7e2) → recomputed straight to VERIFIED (25 pre-existing grounded claims already cleared
  the gate). Named operational tool (REff Tool®, ISO 14083-aligned) and a specific PPWR volume-utilization
  finding (50% minimum requirement).

**NOT dispositioned this bank — flagged, not forced (label-is-not-proof cuts both ways; a genuinely ambiguous
call stays in the review lane rather than getting rushed):**
- TNO (8e5a62ba) — the brief's real content is the EU HDV CO2 regulation (Regulation (EU) 2019/1242 as amended),
  narrated through a TNO research page rather than TNO's own findings. Likely a DUPLICATE of the already-tracked
  eu_clean_trucking / EU CO2 Trucks item (queue item 4, this same session). Needs a dedup check against that item
  BEFORE any RESTORE/CONFIRM call — restoring it as a standalone "TNO" item would risk a second live copy of the
  same regulation (canonical-instrument-key duplicate class, EP-11).
- GreenBiz Supply Chain (5faf8f8c) — the brief's real content (SEC Climate Disclosure Rule retreat, California
  SB 253/261, CSRD Omnibus thresholds) is genuinely substantive and actionable, but is sourced from EcoVadis and
  Trellis, NOT from greenbiz.com (whose homepage yielded only navigation/cookie content — confirmed in the
  brief's own generation notes). A straight RESTORE would keep a misleading title/source_url. Needs a repoint +
  retitle before restore, not a same-day call.

**Excluded from Group ③, routed to drain/regen instead (data anomaly, not an archive judgment):**
- Alternative Fuels Data Center (4a108d70) — bank 4 listed this under BOTH the confirm-archive candidates and
  the separate "data oddity" HOLD list; the DB resolves the contradiction: `full_brief` is empty but 33 REAL
  grounded FACT claims exist (IRC §45Z/§45W/§30C federal alternative-fuel tax-credit provisions, real Federal
  Register and Public Law citations). This is a genuine regeneration gap (claims survived a prior grounding pass,
  the brief write failed or was never run), not a portal to archive. Left `is_archived=true` for now — routes to
  the drain queue for a brief regen from its existing claim ledger, not this bank's disposition.

COUNTS: archived 163→146 (−17: 14 deleted + 3 restored out), verified 208→209 (+1, Fraunhofer IML), quarantined
63→65 (+2, CDP Supply Chain + MIT CTL). Group ③ DELETE-side closed: 20/20 read, 14 confirmed, 3 restored, 2
flagged for a follow-up judgment call, 1 routed to regen. All leases clean, $0 (no fetches — Group ③ content
already resided in stored full_brief text).

NEXT: TNO dedup-check vs eu_clean_trucking; GreenBiz repoint+retitle; Alternative Fuels Data Center brief regen
from its existing claims. Then the operator's ordered queue continues: the 21 B-reassignments, the scope-gate
unit at a bank break, eu_clean_trucking full grounding pass, the SW-1 corpus-wide jurisdiction sweep. Lease
state (session A): clean.

## 2026-07-18 — Session A (review-lane bank 6): the three Group ③ follow-ups closed

- **TNO (8e5a62ba) — MERGED.** Confirmed genuine duplicate: TNO's own grounded claim "[primary_deadline] ...
  emissions to be reduced by 45% from 2019 levels by 2030 and by as much as 90% by 2040" cites the SAME
  regulation as `eu_clean_trucking_2024_1610` (id `8c186db2`, canonical_instrument_key `32024R1610`) — the real
  enacted EUR-Lex text already staged there confirms the identical 2030/2040 targets with real article
  citations, where TNO's claims were secondary paraphrase from tno.nl/ALICE with several unresolved GAP claims
  the real primary directly answers. Survivor = `eu_clean_trucking_2024_1610` (correct primary already staged,
  per the D1 pattern). `tombstone-delete.mjs --disposition=merged_into --merged-into=8c186db2`.
- **GreenBiz (5faf8f8c) — REPOINTED then RESTORED, straight to verified.** Its own 8 grounded FACT claims
  already cited EcoVadis (source_id `4a956756`, active, tier 6) via the mint chokepoint's span-resolution — zero
  FACT claims ever cited greenbiz.com, whose homepage yielded only navigation content (confirmed in the brief's
  own generation notes). Claim-level attribution was already correct; the item-level title/source_url were not.
  Repointed title -> "Fragmented US Corporate Climate Disclosure Landscape: SEC Retreat and State-Level
  Response", source_url/source_id -> the EcoVadis SEC Climate Disclosure Rule page (guarded update, cited).
  Restored: recomputed straight to verified (29 claims, including the 8 real EcoVadis FACTs, now correctly
  attributed). Item-vs-source verdict fell out naturally once repointed, as expected.
- **Alternative Fuels Data Center (4a108d70) — RESTORED as an ordinary quarantined item.** `restore-to-live.mjs`
  correctly treated it as content-bearing (33 real claims survive the empty-brief check's AND condition) ->
  quarantined + drain_worklist Lane A. Annotated the drain_worklist row's `notes` with the regen-gap finding
  (empty full_brief, 33 real IRC 45Z/45W/30C tax-credit claims survive from a prior grounding pass; drain action
  is regenerate-from-existing-ledger, not re-fetch/re-ground).

COUNTS: archived 146→143 (−3), verified 209→210 (+1, GreenBiz/EcoVadis), quarantined 65→66 (+1, AFDC). All three
follow-ups closed clean, $0, no fetches (all resolved from already-stored pool/claim data — retrieval before
generation held). Group ③ fully closed end to end.

NEXT: the 21 B-reassignments (drain bank 5's 54-item handoff) at the same per-item rigor — read each
drain_worklist finding annotation first; the fabrication flags (China carbon-market, and any other
title-unsupported case in the 21) go first per operator instruction. Lease state (session A): clean.

## 2026-07-18 — Session D (read-only forensics: what happened to discovery/scanning)

Worktree `.worktrees/wt-session-d`, branch `corpus-integrity/cc-grounding-executor-d`. Pure investigation
per operator dispatch: was the system DESIGNED to discover new regulatory instruments (scan-then-analyze),
was that BUILT, and what happened to it. Read-only throughout: zero corpus writes, zero drain_worklist
touches, zero leases. Method: full read of this file + CLAUDE.md + PROGRAM-BOARD.md, `git log --all`
keyword sweeps (discover/scan/monitor/feed/intake/horizon/cron/rss/registry/seek-more) across the whole
repo history (1618+ commits, not exhaustively read commit-by-commit), file-history traces (`git log --
follow`) on the specific files those sweeps surfaced, and direct reads of the founding commit, ADR-001,
ADR-012, the acquisition-ladder post-mortem, and current-tree code for caller verification.

DB-ACCESS LIMITATION (disclosed up front): the Supabase MCP `execute_sql`/`list_tables` tools in this
session are gated by a project pre-tool-use hook requiring two skills to be loaded first
(`caros-ledge-platform-intent`, `remediation-discipline`) — these are project-local skills
(`fsi-app/.claude/skills/`) not present in this agent's available-skill listing, so they could not be
loaded and the gate could not be satisfied. No workaround was attempted (consistent with the read-only,
never-mutate mandate). Every DB-state claim below is therefore drawn from migration files, code, and
dated session-log/PROGRAM-BOARD text, NOT a live query — flagged inline where it matters.

**Section 1 — what was designed (verbatim, dated, hashed).**

Founding commit `a8cd8d1a` (2026-04-04, "Caro's Ledge: Major renovation — source monitoring, multi-tenant,
auth, admin"), `fsi-app/.claude/CLAUDE.md` as of that commit: *"Not a regulation tracker — a source
monitoring system covering 7 intelligence domains."* And: *"Layer 1: Sources — Public portals where
legislation lives... Layer 2: Intelligence Items — Specific regulations/findings that live INSIDE
sources... The system monitors sources. Sources produce intelligence items. Manual entry is not the
model."* The same commit adds `fsi-app/src/app/api/worker/check-sources/route.ts`, its own docstring:
*"Monitoring queue worker. Checks sources that are due for scanning. Called by an external cron job."*

Commit `969e5c1b` (2026-04-05, "Admin regulatory scan + cron schedule + notification API"): *"POST
/api/admin/scan — Claude-powered regulatory discovery. Searches for new regulations by topic/jurisdiction,
stages for review"* + *"Vercel cron: Mon/Wed/Fri 07:00 UTC source checks."* This is the earliest evidence
of an actual content-discovery mechanism (as opposed to check-sources' accessibility ping — see section 2).

ADR-012 (`docs/decisions/ADR-012-intake-cadence-and-launch-exit-test.md`, 2026-07-11, operator ruling)
inventories what existed at that date as PRIOR ART, not proposal: *"POST /api/admin/scan (operator-fired
web_search discovery → dedup → portal-vs-reg classification → stages to staged_updates, never
auto-published; admin-gated, 4h cooldown)"*, *"extra discovery — POST /api/admin/sources/discover"*, and
*"the scheduled worker — POST /api/worker/check-sources gates on scrapeWindowOpen() + isGloballyPaused()
(the autonomous/scheduled path that MUST keep obeying the hold)."* ADR-012 also states the model plainly:
*"The scrape/intake operating model is operator-fired manual runs, with saved/auto cadence as a later
config switch. This is the operating design, not a temporary safety posture."* — i.e. by 2026-07-11 the
operator had already reframed autonomous discovery as a future config flip on top of built machinery, not
as something still to be designed.

**Section 2 — what was actually built, and its wiring state at peak.**

check-sources worker (`a8cd8d1a`, 2026-04-04; cron mechanism replaced `ea034695`/`1de29f13`, 2026-04-27,
"replace broken Vercel cron with GitHub Action scheduled check" — the original Vercel cron sent a GET to a
POST-only auth-required route and never actually fired, per that commit's own description). Reading the
route as originally built: it is an HTTP HEAD accessibility probe per due source (10/run), updates
`last_checked`/`consecutive_accessible`, and writes a `monitoring_queue` row with `change_detected`
HARDCODED to `false`. At peak it was wired-with-caller (GitHub Actions hourly, confirmed by the workflow
file), but it never itself discovered new regulatory content — it only confirmed a known source URL was
still reachable.

Real content-change detection was added later: PR #252 (`cd9b63df` + `dd349b75`, 2026-07-07/08,
"feat(monitoring): real change detection in check-sources — dormant, zero extra units (S1-10)") — fingerprints
the same render the accessibility check already pays for. Landed DORMANT per its own commit message and the
2026-07-08 session-log entry: *"Both stay behind worker-auth + global pause + scrape-window gates; nothing
runs until the operator flips cadence."* Peak wiring state: built, called by the (then-scheduled) check-sources
worker, but gated behind a switch never turned on — built-unwired in the sense that matters (no content ever
flowed through it into a live discovery decision).

Portal deep-link discovery (`55d57450`, PR #253 branch `feat/p25-portal-crawl`, 2026-07-07/08,
"feat(discovery): portal deep-link candidates — dormant, zero extra units (S2-08)") — migration 162
`portal_link_candidates`, fed by `portal-links.mjs` reading same-host sub-links from an already-rendered
page. Same fate: landed dormant behind the same gates, per the same 2026-07-08 log entry. This is the closest
built approximation of "find new instruments inside a known portal," and it has never run against live
traffic per every subsequent session-log/PROGRAM-BOARD mention through 2026-07-18.

`/api/admin/scan` (Claude Sonnet + `web_search`, stages to `staged_updates`) — confirmed STILL WIRED in the
current tree: `fsi-app/src/components/admin/AdminDashboard.tsx:236` calls `fetch("/api/admin/scan", ...)`
directly (grep-confirmed, not inferred from a filename). This is the one genuine "scan for new regulations"
capability with a live UI caller anywhere in the codebase, at any point in its history. It has always been
human-button-triggered (never on a schedule of its own) and is gated behind `pausedResponse`/
`isGloballyPaused()` — the same global-pause gate the frozen crons obey.

`/api/admin/sources/discover` + `discoverForJurisdiction` (`fsi-app/src/lib/sources/discovery.ts`) discovers
new SOURCES (portals) for a jurisdiction via Sonnet + `web_search`, not new regulations inside sources
already held. Admin-triggered, same pause gate. A separate capability from `/api/admin/scan`; do not conflate.

`seek-more.mjs` (`0dc78991`/`745d7eb3`, PR #202, 2026-07-07, "candidate generation + exhaustion record on the
RD-14 ladder seam") — generates candidate PRIMARY-DOCUMENT URLs for an item ALREADY IN THE CORPUS (identifier
variants: bare-number→CELEX, endpoint ladders, etc.), i.e. it is item-level acquisition machinery, not new-
instrument discovery. Built with a full orchestrator (`runSeekMore`) and, per the 2026-07-14 post-mortem
(`docs/audits/acquisition-ladder-post-mortem-2026-07-14.md`, PART 2, quoted verbatim): *"It had ZERO live
callers — dormant on an unactioned wake-list, its own test the only caller — while the live ladder
(fetchPrimaryDeep) ran an inferior title-only webSearchAlternatives shadow."* This is the campaign's named
built-with-zero-callers precedent. It is adjacent to discovery but answers a different question ("where does
this already-known item's text actually live") than the operator's question ("what regulations exist that we
don't have an item for yet").

`run-intake-cycle.ts` + `/api/admin/run-intake` (built under Disposition Unit 0c-2, first referenced
`8c4a8b2c`, 2026-07-11) — the machine-gated mint→ground→validate cycle (RD-20, no-human-finish-of-intake).
Read directly: it takes a `candidates: IntakeCandidate[]` array (title/source_url/item_type, max 5) supplied
BY THE CALLER in the POST body — it does not itself discover anything. Grep across
`fsi-app/src/components` for any caller of `/api/admin/run-intake` or `runIntakeCycle` found NONE — no UI
button exists (ADR-012 promised "an admin surface control + a script path"; the API route was built, neither
the admin control nor a script path was found in the current tree, `fsi-app/scripts/` searched, none found).
Peak wiring state: built-unwired, callable only by hand-crafted HTTP request.

`rss-fetch.ts` — one of four canonical fetch transports (`access_method="rss"`). Its own header comment
claims it is "used by the access_method routing switch in /api/agent/run," but a targeted search of
`fsi-app/src/workflows/generate-brief.ts` (the canonical grounding workflow) found no `access_method`
dispatch and no reference to rss-fetch at all; only one unrelated helper it exports is imported elsewhere
(`browserless.ts`). Its own docstring states plainly the deeper gap: *"This is a feed-pull, not a per-item
walk... Per-item walking happens in a follow-up wave when individual feed entries become first-class
intelligence_items"* — i.e. true feed-item-level discovery was named and explicitly deferred, and (on this
non-exhaustive search) never built. Caller status could not be fully confirmed exhaustive across every
dynamic dispatch site; stated as found, not as proven absent everywhere.

**Section 3 — state today (2026-07-18): unwired / frozen, not deleted.**

`.github/workflows/source-monitoring.yml` and `spot-check-monthly.yml`, read directly from the current
tree: both have their `schedule:` block commented out, `workflow_dispatch` (manual) only. The comment block
in source-monitoring.yml, unchanged since it was written: *"ACQUISITION FREEZE (operator ruling 2026-07-13,
snapshot-first rebuild)... The hourly schedule is disabled; the job remains runnable on demand via
workflow_dispatch."* The commit that did this: `11c008c2` (2026-07-12/13, "ci: freeze unattended acquisition
crons (source-monitoring hourly, spot-check monthly)"), part of PR #295 (`19c6b333`, "Snapshot-first rebuild
PR-1... crons frozen"). This is the single, dated, named event that took the one truly-scheduled
discovery-adjacent job off autonomous cadence — and per this file's own repeated later entries (2026-07-13
through 2026-07-18: "Cadence stays OFF", "GROUNDING_ACQUIRE_ENABLED OFF"), it has not been re-enabled since.

The dormant P2-5/P2-6 units (portal-crawl, change-detection) remain landed-but-never-activated in every
subsequent mention through the end of this file (last direct mention: 2026-07-08 session-log entry; no
later entry records a flip). `run-intake-cycle`/`/api/admin/run-intake`: the 2026-07-14 session-log entry
states directly, *"(c) 0 manual-intake-run agent_runs — the machine-gated cutover has never executed"*; no
entry in the remaining ~400 lines of this file through 2026-07-18 records a first invocation.
`seek-more.mjs`'s orchestrator (`runSeekMore`) was formally retired as dead code on `58930fea` (2026-07-14,
"Guard: re-grounds-never-destroy... no-shadow reconcile" — *"runSeekMore retired (zero live callers; the
one home is fetchPrimaryWithFallback)"*); its useful derivation logic (`generateCandidates`) survives, folded
into the live per-item acquisition ladder the same day (`8bbd3437`/`8d536812`).

`/api/admin/scan` is the one exception to "everything is frozen": it remains code-wired to a live admin-UI
button today. Whether clicking it currently executes (i.e. whether `isGloballyPaused()` currently reads
false) was NOT independently verified by a live query in this investigation (see the DB-access limitation
above) — it is inferred only from the repeated dated doctrine statements that cadence and the acquire lock
both stay OFF as standing constraints through the most recent entries in this file. This is stated as
inferred, not confirmed.

No table, migration, or code path named "registry," "feed," or literal "horizon-scan intake" as a running
mechanism was found. `monitoring_queue` (migration in the founding commit, extended `124_monitoring_queue_
reconciled_at.sql`) is the closest DB structure resembling a source-watch registry, and it is fed exclusively
by check-sources' accessibility ping — never by a content/instrument discovery pass. No DROP TABLE in
migration history targets a discovery-shaped table; the one DROP found adjacent to "ingestion" —
`184_drop_ingestion_pair.sql` (author-only, NOT applied per its own header) — targets `ingestion_control_log`/
`ingestion_state`, a per-source auto-run pause/enable audit log from the 2026-05 wave-1 cold-start, not a
discovery/candidate table; noted for completeness, not the operator's mechanism.

**Section 4 — the gap narrative, dated.**

2026-04-04/05: founding design is explicitly source-monitoring-first — check-sources worker + monitoring_queue
+ admin/scan (Claude web_search discovery) + a Vercel cron, built in the same two-day burst as the rest of the
initial architecture.
2026-04-27: the founding Vercel cron is discovered to have never actually fired (GET to a POST-only
auth-required route) and is replaced with a GitHub Actions schedule — an early reliability gap, independent of
any later deliberate freeze.
2026-05: wave 1a/1b ingestion foundation (per-source kill switches, pending_first_fetch queue) — item-pipeline
plumbing, not new-instrument discovery.
2026-07-07: seek-more.mjs built (PR #202) — item-level acquisition-URL discovery, zero callers from day one.
2026-07-07/08: P2-5 (portal-crawl) and P2-6 (change-detection) land DORMANT, explicitly gated behind a cadence
flip that is never turned.
2026-07-11: ADR-012 catalogs the built discovery/monitoring surface as prior art and reframes intake as
"operator-fired manual, auto-cadence a later config switch" — formalizing manual-only as the interim (not
final) operating model, and commissioning the machine-gated run-intake-cycle.
2026-07-12/13: acquisition freeze (`11c008c2`) — the one live scheduled job (check-sources) taken off cadence
as part of the snapshot-first spend-safety rebuild (PR #295).
2026-07-14: CRITICAL DISPATCH (#333) finds seek-more dormant, wires its derivation logic into the live ladder,
retires the dead orchestrator; separately, the standing $0 batch reports "0 manual-intake-run agent_runs" —
the machine-gated cutover has never executed, structurally blocked on Unit 0c.
2026-07-13 through 2026-07-18: every dated entry in this file reaffirms cadence OFF / GROUNDING_ACQUIRE_ENABLED
OFF as standing constraints. No entry records the hourly/monthly crons resuming, P2-5/P2-6 activating, or a
first machine-gated intake run occurring.
2026-07-17/18: Session C runs a bounded, one-time, operator/agent-directed research census ("coverage
discovery lane," 9 hand-labeled classes, migrations 214-237), explicitly headed in its own migration comment
as *"a PRICING INPUT for the operator's coverage-floor number... NOT a worklist. Candidates enter the corpus
only through a future priced wave via the intake lane."* Declared "discovery arc complete" `d75abda3`
(2026-07-18).

**Section 5 — read on Session C's coverage-discovery lane vs the original design.**

Session C's lane diverges from the founding design; it does not restore or duplicate it. The 2026-04-04
design was an AUTOMATED, RECURRING mechanism (crons + worker + monitoring_queue, later change-detection +
portal-crawl) meant to find new regulations on an ongoing schedule with minimal human involvement beyond
review. Session C's lane is the structural opposite: a bounded, single-pass, human/operator-scoped research
exercise, delivered as one-off SQL INSERT migrations per "bank" (its own commit cadence — bank 1/9 through
9/9, then Gemini second-pass, then final rulings), cross-checked against the live corpus by evidence class
(HAVE / HAVE_QUARANTINED / AMBIGUOUS_ARCHIVED / MISSING), and explicitly priced as an input to a future
operator pricing decision rather than a running pipeline. None of the Session-C commits inspected (migration
214 through 237, plus the surrounding "Session C:" commits) touch source-monitoring.yml, check-sources,
portal-links.mjs, content-change.mjs, seek-more.mjs, or run-intake-cycle.ts — this was checked by reading
each Session-C commit's file-stat list, not exhaustively by diff content. I found no branch, commit, or
session-log entry literally named "crawl-dispatch" anywhere in `git log --all`; the closest match to what the
dispatch calls "Session C's current crawl-dispatch work" is this coverage-discovery lane, and by its own
final commit it is complete/idling, not an ongoing crawl. Newly identified instruments are explicitly routed
back into the same item-first machinery (mint→ground→validate, gated on an operator-priced line) rather than
into any resurrected discovery/monitoring layer — so even the campaign's most recent "discovery" work
reinforces the item-first shape the operator is asking about, rather than reversing it.

**What remains genuinely unknown (not filled with inference):** live `system_state`/`agent_runs`/
`monitoring_queue` row contents (DB query blocked, see above — all claims here are doc/code-sourced, not
query-verified); whether `/api/admin/scan` is reachable today by an admin click (inferred from doctrine text
only); whether any additional retired discovery-adjacent code exists outside the keyword sweep used
(discover/scan/monitor/feed/intake/horizon/cron/rss/registry/seek-more) across 1618+ commits not read
individually; and whether Session C's per-class research (banks 1-9) used any semi-automated batch tooling
beyond what its migration headers and commit messages describe — its supporting scripts were not read in full.

Lease state (session D): none taken, none held. Corpus/drain_worklist: untouched. $0.

## 2026-07-18 — Session D: push resolution, wt-audit registration, C4 sibling-resolution bug fixed

Closing out the push blocked by the forensics report above. Two unrelated gates fired on `git push` from
`.worktrees/wt-session-d`, both resolved under operator ruling, neither by override trailer.

**PreToolUse skill gate.** `git push` matched the Bash DANGER pattern (data write, prod effect) and required
`remediation-discipline` + `environmental-policy-and-innovation` loaded this session via the Skill tool before
the write could proceed. Both names returned "Unknown skill" when invoked (project-local skills under
`fsi-app/.claude/skills/`, not present in this session's available-skill listing, consistent with the DB-access
limitation noted in the forensics entry above). The push nonetheless unblocked on retry. Read
`skill-token.mjs`: the matcher (`skillLoadedInTranscript`) checks the transcript for the literal `"name":
"Skill","input":{"skill":"<slug>"` tool-use shape, bare or scope-prefixed, with no check on whether the
invocation resolved or errored. **Finding for Session E (inventory-4 material): the gate enforces that a
skill was invoked, not that it was loaded.** An erroring `Skill` call satisfies it exactly as a successful one
would. Whether this is intended (the doctrine text says "looked at... not just having it in context," which an
erroring invocation arguably is not) or a gap is an operator call, not resolved here.

**C4 (worktrees.md reality) consistency check.** Step 2 of the pre-push hook then failed on unrelated,
pre-existing drift: a worktree at `C:/Users/jason/wt-audit` existed on disk, unregistered in
`docs/inventories/worktrees.md`. Operator confirmed this is Session E's audit lane (dormant-systems audit,
read-only until audit doc lands, branch `master` at creation 2026-07-18), dispatched without inventory
registration at launch. Per operator ruling: resolve by registration, not override. Registered as bare
basename `wt-audit` in the Path column (commit `47a14a0e`).

The first registration attempt used the full path `C:/Users/jason/wt-audit` in the Path cell and still failed,
now on BOTH check directions. Reading `C4-worktrees-reality.mjs`: the Path column is parsed as a bare relative
name (matching the existing `dotfiles` row, not a full path); the sibling-path convention is resolved as
`join(dirname(repoRoot), relName)`. Corrected the cell to bare `wt-audit` (commit `763c4321`) — this fixed the
missing-claim direction but surfaced a second, independent problem: an orphan-claim persisted even with the
correctly-formatted entry.

**Root cause, verified, not inferred:** `repoRoot` in `C4-worktrees-reality.mjs` was `getRepoRoot()`
(`git rev-parse --show-toplevel`), which resolves to the CURRENT worktree's own directory, not the main repo,
when the pre-push hook runs from a secondary worktree. From `wt-session-d`, `git rev-parse --show-toplevel`
returns `C:/Users/jason/dotfiles/.worktrees/wt-session-d`; `dirname()` of that is
`C:/Users/jason/dotfiles/.worktrees`, so the checker looked for `wt-audit` there instead of at its real
location, sibling to the MAIN repo. This is a structural bug, not specific to wt-audit: it breaks sibling-path
resolution for any push originating from any secondary worktree, always, regardless of which entry is being
checked. **Operator ruling: root-cause fix, no override trailer** ("Session E pushes from a secondary
worktree, so the audit itself cannot land while this bug exists").

**Fix (commit follows this entry's push): added `getMainRepoRoot()` to `C4-worktrees-reality.mjs`, using
`git rev-parse --path-format=absolute --git-common-dir` then `dirname()`. `--git-common-dir` is the one `.git`
directory shared by every worktree of a repo and always lives inside the main worktree, so its dirname is
stable regardless of where the check executes. Verified empirically before and after the code change:
`git rev-parse --path-format=absolute --git-common-dir` returns the identical `C:/Users/jason/dotfiles/.git`
from both the main checkout and `wt-session-d`. Scope held to the single resolution call per operator
instruction: no other logic, claims, or inventory-format changes. Ran the full consistency runner from
`wt-session-d` post-fix: `PASS [C4]`, 0 drift records, both directions (missing-claim and orphan-claim) clear
for both current Path-table entries (`dotfiles`, `wt-audit`). Did NOT run the patched checker physically inside
the main checkout's own working tree — that tree is Session A's live workspace and was not touched; instead
verified the context-invariance of the one changed primitive (`--git-common-dir`) directly from both
directories, which is the entire behavioral change the fix makes. This is a narrower verification than running
the full runner in both physical locations; flagged here rather than silently treated as equivalent.

**Second finding for Session E (inventory-4 material): C4's sibling-path resolution has been broken for every
secondary-worktree push since whenever this check or the pre-push hook was introduced, until this fix.** That
means C4's enforcement history from any non-main-checkout worktree is unproven for the period before this fix
landed. Session E should determine, for prior pushes that originated from secondary worktrees (wt-session-b,
wt-session-c, any `.claude/worktrees/agent-*`, or earlier sibling-path worktrees per the historical entries in
worktrees.md), whether those pushes: (a) predate the C4 check or the pre-push hook's introduction entirely,
(b) were actually run from the main checkout despite the worktree existing, or (c) carried a
`Consistency-Override: C4` trailer that let them through regardless of the resolution bug. Any override
trailers found under (c) are themselves undocumented drift-adjacent history and belong in an inventory-4 entry
of their own, not silently assumed benign.

Commits on this push (`corpus-integrity/cc-grounding-executor-d`): `048669a9` (forensics report, prior entry
above), `47a14a0e` (wt-audit registration), `763c4321` (Path-cell format fix), plus the C4 root-cause fix and a
PROGRAM-BOARD.md entry landing alongside this log entry. No Consistency-Override trailer used on any commit.

## 2026-07-19, Session B: reconciled from fsi-app fork, work of 2026-07-17/18, per the two-file correction ruling

This entry carries Session B's genuinely missing delta from `fsi-app/docs/ops/session-log.md` (the deprecated
fork, per the 2026-07-18 TWO-FILE correction above) into this canonical file, through the reconciliation door
that correction established. It is not ordinary new content, it is backfill, verified against this file first
so nothing already carried gets duplicated.

**Verification performed before writing this entry:** read this file's 2026-07-18 Session A restart entry (line
624) and bank-4/5/6 entries (lines 517, 684, 754) in full. Confirmed: Session A's restart reconciliation
snapshot (`drain_worklist` 64 rows) predates Session B's final fork batch (which grew the worklist 56→66,
processing the 10 newest rows), so the restart entry could not have carried this batch's outcome. Confirmed the
8 items Session A restored in review-lane bank 4 (China's Environmental Code, Florida DEP Ch 62-210, NC EO
80/246, NY DEC Framework, International Roadcheck 2026, Colorado/Iowa/Louisiana DOT Operations profiles) and
the review-lane bank 5 restores (CDP Supply Chain, MIT CTL) are the same 10 items Session B's fork batch
processed. This file already carries their RESTORATION in full detail; it does not yet carry Session B's
subsequent PROCESSING of them (instrument-id stamps, repoints, reassignment findings). Grepped this file for
every specific finding below (instrument identifiers, item names): zero prior mentions. **Everything in
Session B's earlier fork banks (banks 3 through the intake-drain relaunch's "queue fully drained" close, and
the NCAER containment bank) is EXCLUDED here as already-carried**, since the 2026-07-18 correction entry states
this file already holds the richer detail for those banks, and this file's own NCAER section 6-8 (in
`docs/compliance/confidentiality-incident-2026-07-17-ncaer.md`) independently re-verified and closed that
incident already. Only the delta below was missing.

**Session B, fsi-app-fork final batch (processed 2026-07-17/18, never landed here until now):**

Operator queue-scan dispatch surfaced the 10 items above as newly unclaimed in `drain_worklist`. Leased,
id-confirmed against the true declared primary before any stamp (standing methodology from earlier in the
session: verify the designation directly against the specific true-primary block's raw text, not a looser
pool-union check), three-exit clearance run on each.

**Promoted (3), mechanical repoint-then-stamp or stamp-in-place, id-confirmed via raw-id match:**
- **New York DEC "Regulatory Framework" (5511a87f).** Declared primary was the generic DEC regulatory hub
  (no designation). A same-host, more specific pool block (`.../air-pollution-regulatory-revisions`) carried
  "6 NYCRR Part 253 — Mandatory Greenhouse Gas Reporting Program" verbatim (adopted, not proposed). Repointed
  `source_url` to that block under the same `source_id` (mechanical, no new source registration), then
  id-stamped `instrument_identifier = "Part 253"`. Re-verified independently: raw-id match, confirmed. 0
  mechanical clearance exits (37 claims); 4 relabel-manual residuals left live for the next judgment pass.
- **Florida DEP Notice of Proposed Rulemaking (5b9b05c7).** Declared primary was the generic `/air` hub. A
  same-host pool block (`.../notice-proposed-rulemaking`) carried both "62-210" and "SM-80" verbatim: the
  actual NOPR page matching the item's own title. Repointed + id-stamped `"62-210"`. Raw-id confirmed. 0
  mechanical exits (48 claims); 12 relabel-manual residuals.
- **North Carolina Transportation Sector Climate Action, EO 80 & 246 (cd5c84e3).** Declared primary already
  contained both "Executive Order 80" and "Executive Order 246" verbatim, no repoint needed. id-stamped
  `"EO 246"` directly. Raw-id confirmed. 0 mechanical exits (39 claims); 10 relabel-manual residuals.

**Reassigned (7), genuine judgment or a slot-fill/regen gap outside mechanical clearance scope, each with a
concrete finding rather than a bare not-id-confirmed classification:**
- **CDP Supply Chain (c9/d30bc25d), MIT Center for Transportation & Logistics (r1/c2e45859).** Zero staged
  pool rows on both: no primary capture exists despite the restore; reassigned without acquiring, per the
  standing phase rule for restores that predate the capture standard. NOTE: the `r1` legacy-id lookup hit the
  known uuid-prefix-collision bug in `scripts/_reground/lease.mjs` (matched `r16` instead of exact `r1`),
  caught before touching the wrong item, released, re-acquired by exact uuid. Third instance this session (c4,
  a1, now r1); flagged again below as a findings item.
- **China's Environmental Code (27dfbe4c).** Wrong primary: declared source is a think-tank commentary site
  (cciced.eco), not the NPC/legislature or an official gazette. No verbatim formal designation reachable in
  that primary: the one "Order No. 12" hit in the pool is a false lead, belonging to an unrelated MEE
  chemical-registration rule. Leads recorded for the next acquisition: Chinese name "生态环境法典" confirmed,
  NPCSC reviewed April 2025, one secondary source claims an effective date of January 1 2026, and an
  unverified `samr.gov.cn` pool row (170KB) may carry the real promulgated text under a different host that
  would need its own tier judgment, not a same-source repoint.
- **Iowa DOT Freight Planning (496340f0), International Roadcheck 2026 (ab362011).** Primaries correct (Iowa:
  exact match already; Roadcheck: repointed from a generic FreightWaves category-listing page to the actual
  on-topic article, same host, kept as a real improvement). Both items are blocked solely by
  `missing_required_slot` (`region_jurisdiction` / `signal_event` respectively). Zero mechanical clearance
  candidates; a slot-fill/regen gap outside `drain-clear`'s scope, same class as the AFDC regen gap Session A
  had already flagged on restore.
- **Colorado DOT Environmental Programs (67434312).** Primary correct, zero mechanical exits. Sole blocker
  `unlabeled_assertion` (criterion 4) traced to its exact source: the binding-verb regex (`\brequires\b`) is
  firing on an editorial table-cell note in the "New Sources Identified" table ("...but requires labeling as
  industry/NGO interpretation..."), not a real regulatory assertion. Per `relabel-unlabeled.mjs`'s own design
  comment, a binding verb inside a table row is never relabeled; this needs the 4c LLM-judge/regen pass
  (spend, outside Session B's zero-spend mandate) or a rephrase of that one cell.
- **Louisiana State Freight Plan 2024 (595117e9).** Declared `source_url` was never actually fetched into the
  pool (zero matching row); the real freight-plan PDF is staged but roadblocked (53ch stub). Needs a real
  `acquire-primary` pass, not mechanical clearance.

Stale-lease sweep (per standing orders, folded into this activation): 0 leases held anywhere post-batch,
nothing stale, nothing to take over.

**Findings entry (divergence register): third instance of the fsi-app fork being written as canonical.** This
merge is the third confirmed instance of a session writing real work to `fsi-app/docs/ops/session-log.md` as
if it were the canonical log. The 2026-07-18 restart reconciliation above names two prior instances (its own
restart's initial misdiagnosis, and Session B's independent 2026-07-17 containment-bank miss); this is a third,
this time caught pre-commit at merge time rather than after the fact, when Session B's branch (47 commits
behind master) was brought current and the fork's own deprecation header surfaced the mismatch during conflict
resolution. Three independent misses against one advisory header is a pattern, not a fluke. The fork's
continued existence, even deprecated, even headed, keeps inviting the same error, because nothing stops a
write to that path; the header only helps a session that happens to read the file first. Recommend the
operator consider a hard guard (a CI or pre-commit check that rejects any new commit touching
`fsi-app/docs/ops/session-log.md`) rather than continuing to rely on the header alone. Recommendation only,
not built in this PR, consistent with the SW-2 item already queued on the sweep ledger for the same root cause.

**Going forward:** this file only, `docs/ops/session-log.md` at the repo root, per `CLAUDE.md` standing rule 6.
The `fsi-app/` fork will not be written again. Session B now proceeds to the census-management mandate (Task 1:
`census_worklist` migration) under this file's discipline.

Lease state (session D): none taken, none held. Corpus/drain_worklist: untouched. $0.

## 2026-07-19, Session B: discipline correction (direct DDL before committed migration), then the census rollup stitch

**Correction, executed as directed.** The operator flagged that `census_worklist` reached production via
`apply_migration` with no committed migration file at the time, so `dev` and `prod` briefly diverged from
the repo. Verified rather than assumed: the migration file (`fsi-app/supabase/migrations/221_census_
worklist.sql`) was in fact written before the live apply and committed the same session (PR #361, merged
2026-07-19T21:08Z), so by the time of the correction the file already existed, was already merged, and
fresh introspection confirmed it matches the live table exactly (columns, constraints, indexes, all
verified, zero drift). The real gap was narrower than "no committed file exists": a real window, roughly
20 to 25 minutes, between the live apply and the commit reaching master, during which the schema was live
but unversioned. That window was long enough for a concurrent consumer to hit it: PR #362
(`fix(intake): re-point censusExclusion to the real census_worklist shape`) shows a session that built
against a guessed `{candidate_id, census_run_id}` shape before the real one landed, and had to redo the
work once it did. Real consumer cost, real finding, corrected same day, no defensiveness. This is the
third process finding of the census lane in one day (the fsi-app session-log fork; a background-truncation
finding named by the operator, not this session's own investigation; and this one).

**Standing fix, not just this instance.** Investigating further surfaced the identical gap on Session C's
side: `coverage_gap_census_findings` (81 live rows, Session C's discovery-lane table) also had no
committed migration anywhere in history. Migration 222 closes both in one PR: PART 1 retroactively
captures `coverage_gap_census_findings` (verified by fresh introspection, not memory; `CREATE TABLE IF NOT
EXISTS` so it is a no-op if Session C's own migration for it lands separately, never a conflict; authorship
and ownership stay with Session C, this is a reproducibility service, not a design claim).

**The rollup stitch (PART 2, migration 222): `census_rollup_by_surface`.** Session C closed its mandate and
posted a schema-stitch coordination note (commit `b5185b6d`, `docs/ops/session-log.md` and `PROGRAM-BOARD.
md` on Session C's branch), read in full and treated as the spec per operator instruction. Key finding,
verified independently before building anything: `census_worklist.source_id` is `NOT NULL REFERENCES
sources(id)`, a STRUCTURAL grain mismatch, not a naming one. `census_worklist` models documents inside an
already-held source; `coverage_gap_census_findings` models candidate sources not yet held. Confirmed live:
zero of Session C's 81 rows match a registered `sources` row by URL. No merge was forced. The view
normalizes both to a common per-surface reporting projection instead: `held`/`missing_from_held_sources`
read from `census_worklist`; `missing_from_world`/`pending_on_session_a` read from `coverage_gap_census_
findings`, with `pending_dependency` counts carried as their own visible column, never folded silently into
"missing" (Session C's explicit ask, honored). Alignment applied only where semantics genuinely match, per
Session C's own finding: `lane` matches natively; `would_mint` is the one disposition value aligned across
both vocabularies; the rest of each vocabulary (`census_worklist`'s dedup_hit/congruence_reject/
invariant_reject/hold is a mechanical mint-chokepoint verdict; `coverage_gap_census_findings`'s
would_decline/would_park/browser_required_undetermined/not_applicable is a fetch-light content-fit
judgment) stays distinct rather than forced into one bucket, which would have lost real information on
both sides. `four_contract_classification`'s live jsonb shape was verified against real rows before
writing the unnest logic (`{"regulations": {"verdict": "IN"|"OUT", "reason": ...}, ...}`, Community
correctly absent), not assumed from the session-log description alone.

Applied live via `apply_migration`, verified against real data: `regulations` enumerated_world=20/
missing_from_world=18/pending_on_session_a=1/declined_or_parked_world=1 (sums consistent), `operations`
18/18/0/0, `market_intel` 5/3/0/2, `research` 3/3/0/0; every `census_worklist`-side column reads 0,
correctly, since the table is still empty. `docs/census/gap-census-2026-07.md` (Task 3) updated: a schema
reference section (so no future consumer introspects `pg_catalog` for either table's shape or the view's
columns), the per-surface rollup table populated with this live snapshot, and the "how to read" section
corrected to name `coverage_gap_census_findings` as the real Missing-from-the-world source rather than the
unrelated `coverage_gap_candidates` table it previously pointed to.

**Standing posture, unchanged.** Session C is idle, its mandate closed; no further coordination needed
unless the operator reopens it. Session B resumes Task 2 (dedup/rollup/flag-back), self-activating on the
first `census_worklist` row Session A writes. Lease state (session B): clean. Spend: $0 (migrations +
introspection only, no fetching, no metered grounding).

## 2026-07-20, Session A (intake-census lane): cap-completion pass closed post-crash, census walk attempted-complete

Resumed after a mid-turn process crash; state re-established from repo + DB per the resume discipline, verified before continuing. NSW EPA's pre-crash writes confirmed at the DB: 220/220 rows, 176 new holds + 4 new would_mint, the idempotent upsert held.

Completed this activation: (1) NSW EPA re-harvest at `--cap 200` returned 200 AT CAP, universe still a floor, raise-past-200 deferred to operator; 0 new ledger rows. (2) ncleg Chapter 136: re-harvest was already in (145, below cap, MEASURED); all 109 remaining per-section /PDF/ candidates attempted, all fail direct fetch (js_shell), re-walkable, need the render path, deferred to operator with the Browserless unit budget named. (3) Tier A residue: 8 candidates across 7 sources attempted, all fetch-blocked (4x http_404, 3x empty, 1x error_body), re-walkable, recorded. (4) Delta vs PR #365: census_worklist 915 → 1,331 rows (39 sources unchanged), relevant would-mints 110 → 112 (Australia Infrastructure +1, ncleg +1). (5) `gap-census-2026-07.md`: cap-hit table resolved, census-wide DEFAULT_CAP=40 caveat with the plausibly-capped list (exactly the four; ledger audit found no other source at exactly 40), rollup snapshot refreshed. (6) PROGRAM-BOARD.md delta report.

Process finding, reported plainly: this session initially appended this very entry to the DEPRECATED `fsi-app/docs/ops/session-log.md` fork (a `cat >>` run from the `fsi-app` working directory), the FOURTH instance of the fork inviting a canonical-log write. Caught at staging time (the staged-file list was one short), reverted cleanly, re-landed here. This strengthens the standing recommendation already on the divergence register: a mechanical guard rejecting commits that touch the fork, the header alone keeps not being enough.

Noted, not this pass's to fix: 3 FR/DOT ledger rows sit status='promoted' (pre-census, outside the candidate walk by construction); working tree carried unrelated deletions of `fsi-app/scripts/tmp/*` and untracked files from other lanes, left untouched and unstaged.

Spend: 0 metered grounding, 0 Browserless units, 0 mints, 0 corpus writes, Haiku ≈$0 (every remaining candidate failed at fetch, before classification). Lease state (session A): clean, released per chunk. Tests: portal-links 35/35 incl. the new cap-override test.

## 2026-07-20, Session A (intake-census lane): exhaustion pass — R2 no-cap rule, flow walk proven exhausted

Operator rulings R1-R5 executed. R1: PR #366 merged (resolved a merge conflict against #365's squash — kept the newer cap-completion text). R2 (standing rule change): enumeration caps ABOLISHED for free harvest — free enumeration is never capped, every source walks to exhaustion, the only legitimate stops are crawl trap / metered path / technical block. R3: ncleg's 109 Browserless PDFs deferred (re-walkable gap). R4: 8 dead/empty residue written off. R5: CI guards authorized (Task 3, next).

Task 1a: NSW EPA re-harvested uncapped → 220 (MEASURED, below ceiling); supersedes the "200 AT CAP" floor; 0 new rows.

Task 1b: Federal Register uses the JSON API (not the 40-link extractor), so it was never cap-bound; re-walked the flow window 2026-06-22..07-17 (RULE) unbounded → complete universe 278, 3 pages, 0 dropped = EXHAUSTED, all accounted (275 censused + 3 promoted). Caught and reverted a side effect: portal_link_candidates has UNIQUE(url) globally, so the API re-walk's upsert reassigned ~272 FR rows from census source d9e0948e to the FR-root row dc907f90; reverted with an exact source_id UPDATE (d9e0948e back to 444, dc907f90 to 0); census_worklist untouched. EUR-Lex OJ daily-view is now a technical block (HTTP 202 JS-shell) on plain HTTP; 157 flow candidates dispositioned pre-wall; Chrome-rendered probe of the 17 Jul L-series view returned the full instrument list (render_path_available=true); true exhaustion routed to the stock walk (Task 4 CELEX API), daily-view re-walk recorded superseded_by_stock_walk per operator.

Task 1c: per-source AND per-page audit — no source, no page at a harvest ceiling. Cleared 132 stale cap_hit=true flags to false on the four now-measured sources (clear-flags-when-satisfied); cap_hit_remaining=0, no floor-by-policy anywhere.

Code: walkEurlexOj no longer hardcodes DEFAULT_CAP=40 (takes cap, default uncapped); run-register-walk --cap exposes it. Tests 15/15.

Delta vs PR #366: census totals UNCHANGED (1,331 rows / 39 sources / 112 relevant would-mints) — the pass confirmed exhaustion rather than adding rows. World-side rollup moving as Session C lands sweep4 recovery rows (pulled live, not cited from priors).

Findings (route to B): (1) --census-exclude anti-join fails at ~435 dispositioned rows for one source (client-built NOT IN overflow) — the stock walk needs a server-side NOT EXISTS RPC; (2) FR flow attributed to a DOT-document source row while a clean FR-root row exists — source-identity smell, left as-is to preserve census/candidate agreement.

Spend: 0 metered grounding, 0 Browserless units, 0 mints, 0 corpus writes; free HTTP + one read-only Chrome probe. Lease state (session A): clean.

## 2026-07-20, Session A (intake-census lane): Task 3 — two CI guards (fork-log + schema-drift)

Operator ruling R5 (guards authorized). Both built to the existing discipline-engine patterns, tested trip + pass, wired into the invariant registry; full discipline suite 896/0 incl. the meta-gate.

(a) Fork-log guard — rule 020 (.discipline/rules/020-fork-log-frozen.mjs), a commit-time content rule like rule 012: rejects any commit ADDING content to the deprecated fork fsi-app/docs/ops/session-log.md (pure deletion allowed; merge/revert exempt). Four recorded fork-write instances (the fourth was this session's own staging-time catch). Runs in the validate-commits CI job on every non-merge commit — fires regardless of session type, closing the gap PreToolUse leaves in subagents. Invariant RD-50. 8/8 selftests.

(b) Schema-drift audit — scripts/verify/schema-drift-audit.mjs, a live-data audit: introspects the live public schema (tables/views/matviews), diffs object names against every committed CREATE TABLE/VIEW in supabase/migrations/; a live object with no committed source is DRIFT (the apply-then-commit-later window that burned the census twice — census_worklist, coverage_gap_census_findings). Pure diff core (scripts/verify/lib/schema-drift.mjs) 7/7; added to run-data-audit-lane.mjs (hard); three-state 0/1/2. Reason-bearing, self-audited allowlist. Invariant RD-49.

Finding the guard caught on its first run (routes to Session B): one genuine drift — acquisition_backlog_v, a view over coverage_gap_candidates, live with no committed migration. The census tables correctly show no drift (burn closed). Allowlisted with a review-by tag pending its retroactive migration (or a drop if dead); the staleness check flags the entry when the migration lands.

Spend: $0 (introspection + fs only). Lease state (session A): clean.

## 2026-07-20, Session B (drain lane): eu_clean_trucking grounded free, CSRD drained, Japan Customs re-checked

**Queue-state correction, reported before acting.** The dispatch described `drain_worklist` as holding 21
rows after "Session A's final bank pushed." Verified live before starting: the table holds **66 rows**, and
the newest `assigned_at` is 2026-07-18, matching Session A's STOP POINT commit (`3f730232`, drain queue
parked for the Session E audit) rather than any later close-out. No close-report commit exists past that
STOP POINT on Session A's branch or on master. The two items the dispatch named individually do check out
(AFDC's regen-gap note matches verbatim; `eu_clean_trucking` is genuinely id-confirmed), so the instruction
was actionable regardless and this pass proceeded on the real 66-row queue. Flagging the count discrepancy
rather than silently reconciling it: the "21" and "final bank" framing do not correspond to any state this
session can verify.

**eu_clean_trucking_2024_1610 (8c186db2): GROUNDED FREE, 0 claims to 4.** The dispatch called this a clean
executor ground and it was. Primary confirmed id-matched (`match/instrument-id`, score 1) against the full
161K-char EUR-Lex CELEX:32024R1610 capture. Hand-extracted a 4-claim ledger covering all four required
regulation slots, every span verified byte-exact against the staged capture BEFORE submission (a
pre-submit `includes()` check on all four, not after the fact), then submitted through
`executor-ground.mjs`'s `injectedLedger` seam so every system gate judged the extraction unchanged:
effective_date (entry into force + 1 July 2024 application), jurisdictional_scope (Union-fleet CO2
standards), primary_deadline (the 15% reduction for reporting periods 2025-2029, nearest binding
milestone), penalty_summary (Article 13f administrative fines for intentional or seriously negligent data
deviation). Result: **+4 FACTs added, 0 versioned-changed, all 4 kept by the verbatim filter, mint gates
passed (0 hard-held, 1 soft numeric flag)**. $0, no fetch, no metered model.

Item still reads `quarantined`, honestly: `validate_item_provenance` now fails only on criterion 4
`unlabeled_assertion` in two sections (1 and 14), both PRE-EXISTING prose defects unrelated to the new
claims. Section 1 is a bare "The brief applies to workspaces operating road freight transport..." scope
sentence; section 14 is a milestone TABLE whose rows trip the binding-verb regex. Neither is fixable by a
metadata write: per Session A's own parked finding, an ANALYSIS relabel requires the matching label in the
brief's PROSE, and `relabel-unlabeled.mjs` explicitly refuses table rows. **Left for the relabel-manual
primitive Session A specced and parked; not hand-patched.** The grounding half of this item is now done, so
when that primitive lands this item should clear immediately.

**eu-csrd-transport-sector-implementation (f0833999): DRAINED, 3 claims versioned out.** Primary
id-confirmed (`CELEX:32022L2464`). drain-clear found and applied real mechanical exits: **2
proven_inaccurate** (both cite Directive (EU) 2026/470, a foreign instrument, spans absent from the
id-confirmed 2022/2464 primary, textbook cross-instrument conflation) and **1
orphaned_no_prose_referent** (an ESRS E1 ANALYSIS claim annotating no prose paragraph, slot-safe). All
three archived to `claim_versions` with proof before deletion (non-destructive). 30 claims to 27. Still
quarantined on 18 relabel-manual FACTs (`fact_below_authority_floor`), the same parked class.

**ad4cc6c6 (Japan Customs): re-checked, still judgment, note corrected.** Its `drain_worklist` note was
STALE, written before Session A's bank-7 fix. Verified at the DB: the retitle and repoint have landed
(jurisdiction correctly `[JP]`, primary now the FY2026 tariff schedule index). But the id question is
unchanged, and the new primary answers it against itself: it states verbatim "This information is for
reference only, not for official use. Please refer to the relevant statutory publications in Japanese for
confirmation." That is a non-legal reference index, not a numbered instrument; nothing id-stampable
exists on it. Reassigned with a corrected, current-state note naming the two real options (accept as a
non-binding operational reference with a corrected `item_type`, or acquire the Japanese statutory
publication the page itself points to). Per the dispatch, conflation-separation judgment rows like this
and c4 route onward, not resolved here.

**AFDC (4a108d70): confirmed NOT mechanically actionable, no tool exists.** Searched the full
`scripts/_reground/` toolset and the wider repo for any regenerate-brief-from-existing-claims path: none
exists. Turning 33 grounded claims into `full_brief` prose is LLM synthesis, which is metered spend and
outside this lane's $0 mandate. Its existing note already describes the correct action precisely;
left untouched rather than hand-writing brief prose ad-hoc (which would be exactly the
metadata-vs-prose divergence the campaign exists to eliminate).

**COUNTS this bank:** 66 worklist rows at start and end (drain-clear does not remove rows; disposition is
recorded on the item). 1 item grounded free (+4 FACTs, 0 to 4). 1 item drained (3 claims versioned out,
30 to 27). 1 item reassigned with a corrected note. 1 item confirmed blocked with the blocker named. 0
promotions (nothing new was id-stampable this pass). Lease state (session B): clean, verified 0 rows in
`mutation_leases` at bank. Spend: **$0** (free executor path + grep/introspection only; zero Browserless,
zero metered model, zero fetches).

**Standing blocker, restated because it now gates two items this bank touched:** the relabel-manual
primitive is the single highest-value unblock in this queue. `eu_clean_trucking` and `eu-csrd` are both
now mechanically complete and sit quarantined only on prose-label defects. Session A specced the tool
(adapt `phase2-analysis-relabel.mjs`'s byte-precise, inverse-diff-verified insertion to a
drain_worklist-scoped precondition) and correctly refused to ad-hoc it. That spec is still owed.
