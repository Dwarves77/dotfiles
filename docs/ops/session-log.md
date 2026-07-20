# Session Log

Dated, appended entries. Newest first. Per the operating manual (standing rule #6 +
self-annealing protocol), session state lives here — never in `CLAUDE.md` (doctrine, not state).

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

## 2026-07-17 — Session C (coverage discovery lane): reactivated for a plain-text export, read-only

Operator-requested one-shot deliverable: a complete coverage inventory as a flat pipe-delimited plain-text export for external cross-validation against another AI model (relay-safe, no attachments). Produced three sections directly to chat, delivered in numbered parts: SECTION 1 tracked instruments (242 live items, is_archived=false, verified+quarantined, identifier|title|jurisdiction|item_type|status), SECTION 2 all 21 coverage_gap_candidates rows (rank|instrument|jurisdiction|class|priority|major_or_minor), SECTION 3 all 611 active registered source hosts aggregated from `sources` (host|tier|authority_or_worklist_republisher|n, tier counts reconcile exactly 220+222+65+54+16+33+1=611). No review-lane restores had landed as of this export (disposition_ledger carries no 'restored' disposition value; only merged_into/tombstone_delete_*). Zero writes, zero leases, zero corpus mutation — pure read + format. Appended from own tree (`.worktrees/wt-session-c`) per the standing worktree-separation rule.

## 2026-07-17 — Session C (coverage discovery lane): Gemini cross-check integration, one pass

Operator-directed reactivation: an external model (Gemini) reviewed the exported inventory; operator classified its output into 7 numbered directives. Migration 216 applied (entity-confirmation before every add/change): schema gains `data_class` (instrument/data_feed, CHECK-constrained, default-backfilled instrument for the existing 21+1 rows); 1 new instrument row (rank 22, NY 6 NYCRR Part 218 HDV emission standards, CARB-aligned, entity-confirmed, jurisdiction us-ny checked clean against the 15-code state/country collision list); 6 new data_feed rows (rank 23-28, BLS/Eurostat/EIA free-API candidates and Platts/ecoinvent/CDP licensed candidates, all entity-confirmed, 2 URL corrections found and fixed: EIA "retail-pricing" does not exist as a real path, corrected to "retail-sales"; Eurostat version segment corrected "v1.0"->"1.0"); 4 existing instrument rows enriched with entity-confirmed adjunct URLs (rank 1 CORSIA + ICAO CCR, rank 2 UK CBAM + gov.uk consultation collection, rank 3 CSDDD CELEX 32024L1760 identity-confirmed, rank 10 Singapore + nea.gov.sg). Table total: 28 rows (22 instrument / 6 data_feed). Read-back verified: 28/22/6/4-enriched, exact match.

SOURCE-HOST CANDIDATES verified (not registered, per instruction): dec.ny.gov (NYSDEC, real, hosts the Part 218 adopted-amendment documents), nea.gov.sg (Singapore NEA, real, hosts the carbon tax page), sinir.gov.br (Brazil's national solid-waste info system SINIR/SINIR+, real, legally established under the SAME Law 12.305/2010 already in-corpus as the quarantined "Lei no 12.305/2010" item, Ministry of Environment operated), retc.mma.gob.cl (Chile's pollutant/GHG emissions-and-transfers registry, real, public, 40,000+ industrial establishments, Ministry of Environment operated). All four listed for a future registration wave, no sources-table write made.

DECLINED, no table rows: CARB TRUCRS (Truck Regulation Upload, Compliance and Reporting System) and Clean Truck Check (CTC-VIS) both entity-confirmed real and distinct from each other (TRUCRS does not cover CTC reporting), but both are fleet-operator compliance-verification/reporting portals for a fleet's OWN vehicles, an enforcement-query product-feature question, not third-party corpus or feed data. No other items from the external review overlapped an existing row; no additional declines beyond these two.

ARCHITECTURE NOTE (recorded here and in the migration 216 column comment on data_class): the 6 data_feed rows imply a feed-intake architecture distinct from the regulatory grounding pipeline, an API-attestation model (feed, series, query, retrieval_timestamp, value) that never mints a FACT claim into section_claim_provenance, a second intake door. This is a NAMED POST-DRAIN BUILD UNIT for the steady-state ledger. Not scoped, not built, not this table's job.

Zero corpus writes, zero leases, zero sources-table writes (host candidates listed only). Committed and pushed from own worktree (`.worktrees/wt-session-c`, branch `corpus-integrity/cc-grounding-executor-c`). Session C lane complete again, idling.

## 2026-07-17 — Session C (coverage discovery lane): category-driven discovery, superseding order, multi-session job begins

SUPERSEDING ORDER (operator): the Gemini review was a diagnosis of missing CLASSES, not a final instance list. Expand each class to full jurisdictional/vertical membership; bank per class; push after each bank. Nine classes total (7 named initially + classes 8 Market Intel sources and 9 Research/horizon-scan sources added mid-turn as an addendum, completing the per-surface source audit: Regulations, Operations, Market Intel, Research all now have a deliberately-discovered source base; Community is human-space by doctrine, no machine sources).

SCHEMA DEVIATION FLAGGED: the operator's literal wording asked for "a new coverage_class column" naming the 9 classes; `coverage_class` already exists with the DIFFERENT meaning of the original evidence hierarchy (MISSING/AMBIGUOUS_ARCHIVED/HAVE_QUARANTINED). Not overloading it. Migration 217 adds a distinct `discovery_class` column (9-value CHECK, sized for all 9 classes up front) and extends `data_class` with a third value `tracker` (for classes 4-6, neither regulatory instrument nor numeric feed).

BANK 1 of 9 (CLASS 1, jurisdictional labor-cost feeds): 8 new entity-confirmed rows (rank 29-36), completing membership across UK (ONS ASHE), Japan (MHLW/e-Stat), Singapore (MOM), Brazil (IBGE, transport-sector-specific survey identified as the stronger match over the general wage survey), Mexico (INEGI EAT, same transport-sector-specific pattern), UAE (FCSA/UAE.Stat), Switzerland (BFS/OFS Earnings Structure Survey), South Africa (Stats SA QES) -- joining the existing BLS (rank 23) and Eurostat (rank 24) pattern instances for full class membership (10 total labor-cost-feed rows across all 9 discovery_class values will accumulate as banks proceed). Retrieval-before-generation catch: ILO ILOSTAT (ilo.org / ilostat.ilo.org) NOT added as a new gap, already a registered platform source (T3 authority, global aggregator, not a per-jurisdiction primary). None of the 8 new rows had a confirmed dedicated REST API in this pass (BLS/EIA/Eurostat remain the only 3 with confirmed API paths); the rest are confirmed real download/portal-access sources, noted per-row for the future feed-build task to resolve API-vs-portal access before implementation. Table total: 36 rows. Committed and pushed from own worktree.

NEXT BANK: CLASS 2 (energy and electricity price feeds, pattern EIA, expand jurisdictionally).

BANK 2 of 9 (CLASS 2, energy and electricity price feeds): 9 new entity-confirmed rows (rank 37-45) across EU (Eurostat nrg_pc_205, industrial electricity, confirmed API-accessible), UK (DESNZ Quarterly Energy Prices), Japan (METI/ANRE), Singapore (EMA regulated tariff + USEP wholesale, strong dual-series fit), Brazil (ANEEL open data, API requires Conecta authorization, an access-friction note not a license cost), Mexico (CRE/CFE industrial tariff schedules), Switzerland (ElCom LINDAS linked-data endpoint, the strongest non-US/EU machine-queryable fit found this bank), South Africa (NERSA/Eskom), UAE (FCSA electricity-tariff-by-sector dataset, same host/platform as the rank-34 labor dataset, distinct dataset id DF_ELECTR_TCO). Retrieval-before-generation catch: IEA (iea.org, T3 authority) NOT added, already a registered platform source. Only EIA/Eurostat (both classes) confirmed a documented REST/linked-data endpoint outright this bank; ElCom's LINDAS service is the closest analog found for a non-US/EU jurisdiction. Table total: 45 rows. Committed and pushed from own worktree.

NEXT BANK: CLASS 3 (commercial fuel and green-premium assessments, pattern Platts, expand the licensed-market landscape: Argus, Bunker Index class).

BANK 3 of 9 (CLASS 3, commercial fuel and green-premium assessments): 4 new entity-confirmed rows (rank 46-49) expanding the pattern instance S&P Global/Platts (rank 26) across both the licensed-market landscape and the free bunker-index tier. Argus Media Marine Fuels (LICENSED, 120+ daily bunker spot assessments plus a 24-month forward-curve product and broader alt-fuel grade coverage — ammonia, LNG, methanol — than Platts as sourced here; spend-flagged same posture as rank 26). Ship & Bunker world bunker prices (FREE, daily port-level VLSFO/HSFO/MGO, no registration wall found, most immediately actionable row in the class). Bunker Index / BIX World and Regional Indices (FREE, unweighted spot-average indices, live since April 2009, longest-running free bunker index found). MABUX Global Bunker Index (MIXED access, free indication pages plus a stated-but-not-confirmed API/subscription tier, site itself disclaims the published prices as indications only, listed for class completeness at lower confidence than the other three). Retrieval-before-generation catch: spglobal.com is already a registered host (rank 26 Platts) — checked all 5 candidate hosts (argusmedia.com, shipandbunker.com, bunkerindex.com, general-index.com, mabux.com, spglobal.com, platts.com, opis.com) against the live sources table before drafting; only spglobal.com was already registered. OPIS (Oil Price Information Service) confirmed as an S&P Global Commodity Insights brand since the 2022 IHS Markit merger — not added as a separate row, noted as an ADJUNCT on rank 26 instead of minting a same-corporate-family duplicate. General Index (a real FCA-regulated commodity price index provider, 750+ marine fuel spot prices across 500+ ports) was entity-confirmed but NOT added as a row this bank — its own ICE Developer Portal listing and general-index.com content gave enough to confirm it is real and licensed, but no access-model/pricing detail was found to write a confident spend-flagged note; carried forward as a known candidate rather than force-written thin. Table total: 49 rows. Committed and pushed from own worktree.

NEXT BANK: CLASS 4 (state and subnational rulemaking trackers, pattern NY DEC regulatory agenda; CARB-adopter states first — CA, WA, OR, NY, NJ, MA — then the full ACT/ACF adopter list, plus Canadian provinces and German Länder where freight-relevant; data_class='tracker').

BANK 4 of 9 (CLASS 4, state and subnational rulemaking trackers): 11 new entity-confirmed rows (rank 50-60) sweeping the full ACT-adopter-state landscape plus 2 freight-relevant Canadian provinces. CA (CARB Rulemaking Activity index) carries a MONITORING FLAG worth surfacing to the operator directly: per an April 2026 Legal Planet report, CARB is under a settlement obligation (separate from the already-voted Advanced Clean Fleets repeal for private/federal fleets, effective Jan 1 2027) to propose repeal of Advanced Clean Trucks itself, board hearing targeted by Oct 31 2026 — since all 10 other ACT-adopter states incorporate CARB's rule by reference, this is the single highest-leverage regulatory-reversal signal found across the whole discovery job so far. WA carries an active near-term rulemaking window (comment period June 23-Aug 13 2026, adoption targeted November 2026). OR and VT are both currently enforcement-paused (OR 2025-2026 pause; VT per Governor Executive Order 04-25) while remaining formally adopted — a WINDOW-CLOSING-class distinction, not full repeal. NJ and CO hosts (dep.nj.gov, cdphe.colorado.gov) were confirmed NOT previously registered as platform sources at all — clean net-new gaps. Retrieval-before-generation catch, host-vs-page granularity: checked all 13 candidate agency hosts against the live sources table before drafting; 11 were already registered but only at the GENERAL agency-landing-page level (e.g. ecology.wa.gov/air-climate, not the WAC-173-423-specific rulemaking page), so those 11 rows are genuine gaps at the correct granularity and were inserted; 2 candidates — NY (dec.ny.gov/regulatory, functionally identical to rank 22's authoritative_url) and NM (both the general Air Quality Bureau page AND the specific ACT/ACCII transportation tracker page) — were found ALREADY registered at matching tracker-page granularity and were deliberately NOT inserted, to avoid minting duplicate rows. German Länder were checked and found not applicable: heavy-duty vehicle emissions in Germany are regulated federally/EU-level, already represented in-corpus as EU HDV CO2 standard items, no Land-level ZEV-mandate rulemaking equivalent to the US state-adoption pattern exists — an honest scope-narrowing per the integrity rule, not a silent omission. Table total: 60 rows. Committed and pushed from own worktree.

NEXT BANK: CLASS 5 (national compliance-reporting portals, pattern SINIR/RETC; EU per-state EPR registers, UK schemes, Asia equivalents; data_class='tracker').

BANK 5 of 9 (CLASS 5, national compliance-reporting portals): 6 new entity-confirmed rows (rank 61-66) expanding the pattern instances SINIR (Brazil) and RETC (Chile), neither of which had actually been written as coverage_gap_candidates rows despite being named the pattern back in the Gemini-delta pass. Retrieval-before-generation catch, and a significant one: SINIR is ALREADY a registered platform source, including the exact logistica-reversa data-portal URL that IS the compliance-reporting-portal pattern this class describes -- deliberately NOT re-inserted as a gap row, it is HAVE not MISSING. RETC (retc.mma.gob.cl) was confirmed genuinely unregistered and inserted. Expanded to Germany (LUCID/ZSVR, the EU's largest and most consequential national packaging register -- mandatory since July 2022 with a distribution-ban penalty for non-registration), France (Registre National des Producteurs via ADEME/SYDEREP, IDU-based per-stream registration underneath the Citeo/Adelphe/Leko producer-responsibility organizations), UK (EPR-for-packaging public registers, daily-updated producer register, an active near-term registration calendar through April 2026), Japan (JCPRA, the designated compliance body under the Container and Packaging Recycling Act), South Korea (KECO's Resource Circulation Compliance System under Ministry of Environment oversight). SCOPE NOTE flagged explicitly, not silently narrowed: "EU per-state EPR registers" is represented by Germany and France only, not all 27 EU member states -- a full 27-state sweep is a distinct, larger scoping decision the operator should rule on separately, whether as its own future bank or left at this representative-sample level. Table total: 66 rows. Committed and pushed from own worktree.

NEXT BANK: CLASS 6 (enforcement and compliance-verification systems, pattern CARB TRUCRS, previously DECLINED in the Gemini-delta pass as a product-feature question rather than corpus/feed data — the operator now wants every instance of this class listed in a distinct PRODUCT-DECISION section stating what each instance would enable; state/national fleet-compliance systems, vessel-compliance systems like THETIS-MRV, operator-verification registries; data_class='tracker').

BANK 6 of 9 (CLASS 6, enforcement and compliance-verification systems): 3 new entity-confirmed rows (rank 67-69), reversing the migration-216 blanket decline of this class per direct operator instruction, framed as a distinct PRODUCT-DECISION section rather than a content-gap list. CARB TRUCRS (road) — the fleet-self-reporting system itself is not integrable, but CARB''s separate public compliance-status LOOKUP tool built on top of it would enable a workspace-facing carrier-vetting feature, a genuine product decision routed to the operator rather than resolved unilaterally. IMO GISIS Ship Fuel Oil Consumption Database (ocean) — confirmed anonymised-by-design at the individual-ship level, so unlike TRUCRS it CANNOT enable a per-carrier lookup; its value is limited to anonymised aggregate trend content. EU Union Registry/EUTL aviation compliance registry (air) — deliberately selected as the air-mode instance given the workspace''s air-primary profile; publishes aggregated verified-emissions/allowance data, operator-level granularity not confirmed available. Retrieval-before-generation catch: THETIS-MRV (mrv.emsa.europa.eu) is ALREADY a registered platform source — not re-added; caught before drafting, no erroneous row written. (A first-draft ADJUNCT note mistakenly pointed at rank 1 (CORSIA/aviation, unrelated to maritime MRV) — caught and removed before the migration was applied, not left in the record.) Table total: 69 rows. Committed and pushed from own worktree.

OPERATOR RULINGS RECEIVED MID-TURN (three rulings, addressed in this order before continuing to Bank 7):

RULING 1, EU EPR scope correction: the Bank 5 (migration 221) 2-state Germany/France sample was rejected as insufficient but a full 27-state sweep was also rejected as excessive. Operator specified the FSI lens: expand to member states with material freight volume for the operator''s verticals/lanes. BANK 5b (migration 223, applied AFTER migration 222/Bank 6 for sequencing reasons since the ruling arrived mid-turn — documented here rather than silently reordered) added 8 more entity-confirmed EU EPR registers (Netherlands/Verpact, Belgium/dual Fost Plus+Valipac, Italy/CONAI+RENAP, Spain/Ecoembes+national register, Poland/BDO, Austria/ARA, Sweden/Naturvardsverket, Denmark/DPA) plus ONE deliberately-not-individually-confirmed EU-EPR-remainder collective row (entity_confirmed=false) recording the ~19 smaller member states as a universe without pricing each one, flagged explicitly as a future expansion-wave decision rather than silently treated as complete. Retrieval-before-generation catch: naturvardsverket.se root landing page was already registered but not the EPR-specific guidance page — same host-vs-page granularity distinction as Class 4, genuine gap, row inserted. Class 5 total across both banks: 15 rows (66 -> 78 total table rows after this bank).

RULING 2, CARB repeal-rulemaking signal routing: the operator confirmed the Bank 4 CARB monitoring flag (rank 50) is precisely the pre-enactment early-signal pattern Class 9''s regulatory-pipeline-signals sub-part formalizes, and directed it be carried forward as a CONFIRMED HIGH-priority instance when Class 9 is reached, reasoning: a CARB repeal rulemaking is a know-before-competitors event that shifts planning assumptions for every ACT/ACF-adopter-state row already in the table. NOTED HERE as a forward commitment; will be executed as part of Bank 9 (Class 9c, regulatory-pipeline early signals), not resolved in this entry.

RULING 3, Class 6 five-surface test: the operator ruled that each Bank 6 row must carry an explicit inline five-surface test (Regulations/Operations/Market Intel/Research/Community) rather than resting on the prior blanket-decline framing, citing a "Clean Truck Check Operations=IN" template finding from a prior pass. MIGRATION 224 applied as a notes-append UPDATE on ranks 67-69 (not re-issuing the INSERTs, since 222 was already applied and standing rule 1 forbids editing applied migrations). Findings: rank 67 TRUCRS = Operations=IN (single-surface feature-build candidate); rank 68 IMO GISIS = Research=IN, not Operations (anonymised-by-design output means no per-carrier lookup is possible, so despite sharing the enforcement_verification_system label this row is a content-source gap, not a product feature like rank 67); rank 69 EU Union Registry = Market Intel=IN confirmed, Operations=CONDITIONAL pending an unresolved operator-level-granularity verification question. Table total unchanged at 78 rows (notes-append only). Committed and pushed from own worktree.

NEXT BANK: CLASS 7 (lifecycle and disclosure verification, pattern ecoinvent/CDP already at ranks 27-28 pre-category; expand the LCA-database and disclosure-repository landscape relevant to packaging and carrier emissions, access-classed; data_class='data_feed').

BANK 7 of 9 (CLASS 7, lifecycle and disclosure verification): 3 new entity-confirmed rows (rank 79-81) expanding the pattern instances ecoinvent (rank 27, licensed LCA database) and CDP (rank 28, licensed corporate disclosure). Sphera LCA Data/GaBi -- a direct ecoinvent competitor, LICENSED same posture as rank 27, but carries a packaging-specific calculator tool ecoinvent as sourced here does not describe, so listed as a genuine alternative rather than assumed redundant. EPD International EPD Library -- FREE, public, third-party-VERIFIED individual product declarations (a materially different data shape from the modeled-LCI-database pattern of ecoinvent/Sphera), the strongest free-access row in the class. SBTi Target Dashboard -- FREE, downloadable corporate GHG-target data, distinct access posture from rank 28''s paid CDP corporate tier for a related client-conversation use case (validated net-zero commitments). Retrieval-before-generation caught two hits before drafting: cdp.net/en/supply-chain (the carrier/logistics Scope 3 disclosure angle originally scoped for this bank, given the class''s "carrier emissions" framing) is ALREADY a registered platform source -- not re-added, a real near-miss caught before it became a duplicate row; sciencebasedtargets.org root landing page is already registered but not the Target Dashboard sub-page itself, a genuine gap at the correct granularity (same host-vs-page pattern seen in classes 4 and 5). Table total: 81 rows. Committed and pushed from own worktree.

NEXT BANK: CLASS 8 (Market Intel sources, 4 sub-parts: freight rate indices, carbon/compliance market pricing, capacity/demand signals, SAF/alt-fuel trackers beyond Platts; discovery_class='market_intel_source').

BANK 8 of 9 (CLASS 8, Market Intel sources): 9 new entity-confirmed rows (rank 82-90) across all 4 addendum sub-parts. Freight rate indices: Freightos FBX (broader 12-lane coverage than the already-registered Drewry WCI), Xeneta (the only dual ocean+air real-transaction benchmarking platform found), TAC Index (the air-cargo-specific equivalent, matching the workspace''s air-primary mode). Carbon/compliance market pricing: EEX and ICE as the two primary EXCHANGE-level sources (distinct from ICAP, which aggregates/visualizes prices FROM exchanges like these and is already registered) -- ICE''s new EUA2 futures contract flagged as a forward-looking ETS2/road-transport-fuel signal. Capacity/demand signals: IATA CargoIS (the deepest air-cargo capacity/demand dataset found in the whole discovery job, licensed, flagged per the operator''s original instruction) and UNCTADstat container port throughput (one row chosen over the near-duplicate World Bank mirror per dedup-before-grounding). SAF/alt-fuel: Fastmarkets (IOSCO-approved methodology, a genuine credibility differentiator) and General Index''s SAF-specific product line (distinct from its Class 3 bunker-fuel mention, not a duplicate). Retrieval-before-generation caught THREE real near-misses before drafting: Drewry WCI and ICAP Allowance Price Explorer are both ALREADY registered at their exact candidate pages -- the class''s two single most obvious/most-cited instances, both already HAVE, both correctly excluded rather than duplicated; World Bank Carbon Pricing Dashboard likewise already registered. Table total: 90 rows. Committed and pushed from own worktree.

NEXT BANK: CLASS 9 (Research/horizon-scan sources, 4 sub-parts: standing research institutions — flagged for source-registration-lane judgment rather than table rows; preprint/journal feeds; regulatory-pipeline early signals — carries forward the Bank-4 CARB repeal-rulemaking MONITORING flag as a confirmed HIGH-priority instance per operator ruling 2; technology-maturity trackers; discovery_class='research_horizon_source'). Final class before the consolidation order.

BANK 9 of 9 (CLASS 9, Research/horizon-scan sources, FINAL CATEGORY-DISCOVERY BANK): a real finding on sub-part (a) before any new rows. Checked all 8 named standing research institutions (ICCT, ITF/OECD, IEA transport, Fraunhofer IML, TNO, MIT CTL, Smart Freight Centre, RMI) against the live sources table before drafting -- ALL EIGHT were ALREADY registered, several at freight-specific sub-pages (ICCT''s Freight sector page, RMI Aviation, Fraunhofer IML AI-in-logistics, Smart Freight Centre''s GLEC Framework pages). Zero new rows inserted for this sub-part; this is the retrieval-before-generation discipline confirming rather than contradicting the operator''s own instinct ("these are correctly SOURCES to register") -- the source-registration lane already did this work, well before this discovery job started. 8 new entity-confirmed rows (rank 91-98) across the remaining 3 sub-parts. Preprint/journal feeds: SSRN Transportation Research Network (the cleanest category fit, a dedicated freight/transport vertical, not a generic search), arXiv physics.soc-ph listing (honestly noted as an imperfect fit -- arXiv has no dedicated freight/logistics category), Transportation Research Part D (the specific ScienceDirect journal page, distinct from the already-registered sciencedirect.com root). Regulatory-pipeline early signals: EU Have Your Say (the EU-equivalent early-signal instance, distinct subdomain from the many already-registered ec.europa.eu content pages), ICAO CAEP (air-mode-specific, genuinely not among the many already-registered icao.int pages), and rank 96 -- the CARB repeal-rulemaking signal carried forward from Bank 4/rank 50 exactly per operator ruling 2, deliberately using the SAME authoritative_url as rank 50 but framed for the RESEARCH surface (planning-assumption-shift, know-before-competitors) rather than the OPERATIONS surface (the state-tracker itself) -- not a duplicate, a distinct surface-consumption purpose per the five-surface-test discipline established in Bank 6. Technology-maturity trackers: IEA Hydrogen Tracker/Production Projects Database (distinct from the already-registered Global Hydrogen Review REPORT -- this is the live interactive data tool), PNNL Port Electrification Handbook (US-specific, honestly noted as a reference/handbook rather than a live tracked-projects database, since no equivalent live database was confirmed in this pass). Retrieval-before-generation caught federalregister.gov root already registered (functions as the pipeline-signal tracker itself) -- not re-added despite being the natural US Federal-Register-proposed-rule-stage instance the sub-part description named. Table total: 98 rows. Committed and pushed from own worktree.

ALL 9 CATEGORY-DISCOVERY BANKS NOW COMPLETE. Table stands at 98 rows across the original single-pass discovery (ranks 1-21), the Gemini-delta pass (ranks 22-28), and 9 category-driven banks (ranks 29-98, plus the Bank-5b EU-EPR-expansion insertion at ranks 70-78 and the Bank-6 five-surface-test notes-append with no new ranks). NEXT: execute the operator''s "consolidation order" -- the single unified acquisition-priority backlog list synthesized across the whole completed table, per the standing instruction "THEN execute the consolidation order (the single acquisition backlog list) against the completed table." Mechanics not yet specified in detail by the operator; will need to interpret the ordering/grouping logic (by estimated_priority, by data_class/discovery_class, by spend-flag status, or some combination) or ask before executing, since this is described as a distinct final synthesis step rather than another bank.

## 2026-07-17 — Session C (coverage discovery lane): CONSOLIDATION ORDER, gate landing, discovery mandate closes

CONSOLIDATION MECHANICS RULED (operator): 4-section STRUCTURE keyed on ACTIONABILITY not priority (1 FREE-ACQUIRE READY / 2 FREE-INTEGRATE READY / 3 OPERATOR SPEND-LICENSE DECISIONS / 4 PRODUCT/SCOPE DECISIONS), persisted BOTH as a durable computed view (`acquisition_backlog_v`) AND a one-time plain-text chat report, plus a header block (topline counts) and a RESOLVED section (audit value: what discovery confirmed as already-held). Also ordered: land the gate-column migration (disposition/surface_test/CHECK) per Session A''s 2026-07-17 PENDING-C schema handoff, post the migration number so Session A wires PI-5.enforcedBy.

GATE LANDED (migration 228): `disposition` (kept/declined/parked) + `surface_test` jsonb + a CHECK requiring all 5 surface keys ({verdict,reason} non-empty) whenever disposition IN (declined,parked) -- the DB-side twin of Session A''s `surface-contract-gate.golden.mjs` PART A. No backfill/seeding per the ruling: all 98 rows kept disposition=NULL. **Migration number for Session A: 228** (PI-5.enforcedBy should add migration:228).

GATE EXERCISED LIVE (migration 229): 4 real dispositions, not synthetic -- rank 16 (EU 2019/880, the session-start "hold at relevance-unconfirmed" scope flag, now given a fresh honest all-OUT five-surface test under current platform scope) plus the 3 Class 6 rows (67/68/69, prose five-surface test from migration 224 now also structured as jsonb). Gate verified live BEFORE trusting it: an ad-hoc test UPDATE (rank 78, disposition=declined, no surface_test) was correctly REJECTED (Postgres 23514), confirmed no row was touched, then the real dispositions were applied. Right-failure-forced verification, not just "it should work."

CONSOLIDATION VIEW (migration 230, fixed in 231): `acquisition_backlog_v` derives `backlog_section` from disposition + data_class + a new `access_model` column (free/licensed/mixed/not_applicable, backfilled deterministically from each row''s own freight_relevance text, 96/98 rows matched cleanly, 2 exceptions -- rank 28 CDP, rank 96 CARB-carried-forward -- individually classified by content). TWO ROUTING BUGS caught during verification before any report was shown to the operator: (1) rank 78 (EU-EPR-remainder) wrongly shared access_model with the Class 6 rows and fell into Section 4 -- reclassified free, moved to Section 2; (2) rank 16 (EU 2019/880) fell into Section 1 because Section 4 was gated on access_model instead of disposition directly -- view corrected to gate Section 4 on disposition=parked AND surface_test IS NOT NULL. Re-verified post-fix: sections reconcile exactly 21+61+12+4=98, Section 4 roster exactly {16,67,68,69}, zero unsectioned rows. Caught by verification discipline, not by luck -- exactly the kind of computed-artifact bug that ships silently without a reconciliation check.

REPORT delivered to the operator directly in chat (all 4 sections, full rows, plus header block and RESOLVED section) per the "one-time plain-text report... for the operator's direct read and for pricing" instruction. Not duplicated here -- see the chat transcript for the full text; this log entry records the mechanics and verification, not the content.

Committed and pushed from own worktree: migrations 228, 229, 230, 231 plus this doc pair, one bank.

**SESSION C COVERAGE-DISCOVERY MANDATE COMPLETE.** All 9 category-driven banks delivered (98 total coverage_gap_candidates rows), the Bank-4/Bank-9 CARB repeal-rulemaking signal cross-referenced on both the Operations and Research surfaces, the Bank-5b EU-EPR scope correctly re-scoped per operator ruling, the Class-6 PRODUCT-DECISION section built with a mechanical five-surface gate now live in the schema, and the consolidation backlog delivered both as a durable view and a one-time report. Idling per the standing instruction ("then idle, your discovery mandate completes with it").

## 2026-07-18 — Session C (coverage discovery lane): reactivated for Gemini second-pass integration

REACTIVATION (operator): a second Gemini review of the delivered consolidation report proposed 4 new candidates (Bizot Green Protocol, EU Union Database for Biofuels, FMC tariff/surcharge monitoring, CAAS Sustainable Air Hub Blueprint) plus a closing question about other localized-penalty verticals/lanes. Operator directed standard-rules integration (entity-confirm before insert) plus a class-membership check the closing question prompted directly.

CLASS FINDING: "vertical-specific operational standards" (Bizot''s pattern -- a voluntary industry standard governing operational practice for a specific cargo vertical) was never one of the original 9 discovery classes. Migration 232 adds a 10th discovery_class value, `vertical_operational_standard`, rather than force-fitting Bizot/its siblings into an ill-fitting existing bucket -- the same honesty discipline applied when discovery_class itself was first introduced back in migration 217.

4 EXTERNAL CANDIDATES, entity-confirmed and added (rank 99, 102-104): Bizot Green Protocol (fine-art vertical, 16-25C/40-60%RH HVAC relaxation + greener-transport-first mode-shift standard, HIGH priority, five-surface test recorded informationally in notes -- Operations=IN, Regulations=CONDITIONAL, Research=CONDITIONAL, Market Intel/Community=OUT); EU Union Database for Biofuels (access model confirmed per direct operator instruction BEFORE sectioning -- NOT public, registered-economic-operator-gated, so access_model=licensed despite carrying no commercial fee, routing it to Section 3 rather than Section 1; Regulations=IN, Operations=IN per the operator''s five-surface framing); FMC tariff/surcharge monitoring (fmc.gov root already registered, but the surcharge-monitoring-specific page was not -- genuine gap; Operations=IN, Market Intel=IN per operator instruction, routed Section 2 as a free tracker); CAAS Singapore Sustainable Air Hub Blueprint (real, legally-implemented SAF-uplift mandate + levy from 2026, host previously unregistered, Section 1 air HIGH exactly as instructed).

MEMBERSHIP CHECK 1 (vertical-standards siblings across the operator''s other cargo verticals, per direct instruction): live events -- Julie''s Bicycle (Green Touring Guide, Industry Green Tool, Creative Green certification) is the direct sibling, but juliesbicycle.com is ALREADY a registered platform source -- correctly NOT re-added, documented as HAVE. Film/TV -- BAFTA Albert (carbon calculator + 1-3-star certification, BAFTA-led UK screen-industry standard since 2011) is a genuine new gap, added (rank 100). High-value automotive -- FIA Environmental Accreditation Programme (3-star, ISO 14001/20121/EMAS-based, 260+ accredited orgs, all 2023 F1 teams Three-Star) is a genuine new gap, added (rank 101), motorsport-specific rather than classic-car-logistics-specific but a real operational-standard analog.

MEMBERSHIP CHECK 2 (airport-level SAF mandate siblings, prompted directly by Gemini''s closing question about other localized-penalty lanes -- logged here as the actual prompt source, not invented independently): Japan''s METI/MLIT 10%-SAF-by-2030 mandate (Basic Policy for Promoting Decarbonization in Aviation, Dec 2022; binding supply-side mechanism under the Act on the Sophistication of Energy Supply Structures, approved Sept 2024) is a genuine sibling to Singapore''s CAAS mandate -- added (rank 105). meti.go.jp root + one GX-policy subpage are already registered, neither is this mandate''s dedicated page (genuine gap at correct granularity); a single canonical primary-government URL for the mandate itself was not confirmed live in this pass (only secondary/trade-press sources), flagged honestly rather than asserting an unconfirmed URL.

CAUGHT AND FIXED BEFORE ANY REPORT: migration 232''s INSERT omitted access_model on all 7 new rows, which would have made them invisible to acquisition_backlog_v. Caught immediately via a verification query (not assumed correct), fixed in migration 233 (5 rows free, 1 licensed). Re-verified: view sections reconcile 26+62+13+4=105, exactly matching the table total, before this report was written.

Table total: 105 rows (98 + 7). Committed and pushed from own worktree. Idling again per the standing instruction.

## 2026-07-18 — Session C (coverage discovery lane): FINAL PRICING RULINGS, discovery arc closes

REACTIVATION (operator): final dispositions for every open Section 3 and Section 4 row, executed through the migration-228 gate, plus one last membership check before idling.

SECTION 3 (13 rows dispositioned, migrations 234): DECLINED 12 -- ocean-fuel bucket (Platts/26, Argus/46, MABUX/49) and LCA/disclosure bucket (ecoinvent/27, Sphera/79, CDP-corporate/28, Transportation Research Part D/93) declined on free-stack-suffices grounds per the prior turn''s free-alternative analysis; air bucket (Xeneta/83, CargoIS/87, Fastmarkets/89, General Index/90) declined -- the operator weighed the real loss-material gaps found in that analysis against brief-grade sufficiency and ruled against acquiring transaction-grade air-rate data at this time, a judgment call belonging to the operator, not a mechanical outcome of the free-stack finding alone. UDB/102 declined-not-eligible per an ADDENDUM that arrived in the same message and superseded an interim "parked pending eligibility check" instruction -- the operator confirmed the workspace''s SAF purchases are a book-and-claim BENEFICIARY position, not an upstream economic-operator role, so UDB registration does not apply; the interim parked state was never written to the database, avoiding a spurious intermediate row history. PARKED 1: TAC Index/84, the sole loss-material row kept open, with a `watch_condition` key recorded in its surface_test (additive, not schema-required) naming the revisit trigger.

SECTION 4 (4 rows closed, migration 235): DECLINED 2 -- EU 2019/880 (rank 16) on an explicit operator scope ruling (customs/provenance compliance is a different, not-currently-scoped build) recorded verbatim, closing the session-start "hold at relevance-unconfirmed" flag; CARB TRUCRS (rank 67) on an explicit operator ruling that SUPERSEDES the migration-229 mechanical five-surface finding of Operations=IN -- the operator drew a scope boundary the mechanical test could not: the product informs about rules and cost exposure, it does not vet individual vendors, and a per-vehicle compliance lookup is procurement tooling outside the product regardless of the structural Operations fit the test found. TAKEN 2: IMO GISIS (rank 68) and EU Union Registry/EUTL (rank 69), both reclassified from Class-6 product-decision rows (data_class=tracker, access_model=not_applicable) to plain accepted free content sources (data_class=instrument, access_model=free, disposition=kept) so they route to Section 1 per direct operator instruction -- GISIS at Research/HIGH (fleet fuel-consumption ground truth under CII/EEXI/FuelEU), EUTL at Market Intel with an open verification note on Operations-surface granularity carried forward rather than resolved (assessed at acquisition; re-sections if the data proves aggregate-and-lagged).

BUG CAUGHT DURING TOPLINE VERIFICATION (migration 237, before any report reached the operator): the view''s Section-4 gate keyed purely on disposition=''parked'', which does not distinguish TAC''s spend-decision "parked with watch" from a genuine product/scope decision -- without the fix, TAC misrouted into Section 4 and Section 4 showed 1 open row instead of the 0 the operator''s own closing instruction expects (all 4 original Section 4 rows are now resolved). Fixed by keying Section 3 vs Section 4 on the presence of the `watch_condition` key already written into TAC''s surface_test in migration 234 -- an honest, already-existing signal, not new schema invented to patch around a one-row case. Re-verified post-fix: 32+62+1+0, Section 4 genuinely empty.

DISCREPANCY FLAGGED, not silently reconciled: the operator''s instruction described "Section 3 reduced to 2 parked rows," but that line was written before the same-message addendum re-sectioned UDB from parked to declined-not-eligible. The correct current count is 1 parked row (TAC only), not 2 -- reported honestly to the operator as a stale expectation rather than forced to match by leaving UDB parked against the addendum''s own explicit instruction.

SKILL ADDENDUM ROUTED TO SESSION A''S QUEUE (not a Session-C action -- logging for A''s scope-gate unit per the operator''s explicit routing instruction): add the vendor-vetting boundary to the surface-contracts skill (caros-ledge-platform-intent) as a standing scope principle, TRUCRS as its worked example. Principle, verbatim per the operator: "Caro''s Ledge informs about rules, their timelines, and their cost exposure to the operator''s vendors and lanes; it does not assess individual vendors'' compliance status; vendor vetting is out of scope on every surface." This generalizes the migration-235 TRUCRS ruling (which found real structural Operations fit per the mechanical five-surface test, but was declined on this scope principle regardless) into a standing rule future dispatches can apply without re-deriving it from a single worked example.

FINAL MEMBERSHIP CHECK (migration 236, before idling): SAF book-and-claim claims-substantiation coverage, prompted by the operator''s own confirmed exposure as a SAF purchaser in a book-and-claim beneficiary position. STATUS CORRECTION found on rank 12 (EU Green Claims Directive): the Commission announced an intention to withdraw the proposal in June 2025 (formal status still unclear); the actually-binding instrument on the same subject is a DIFFERENT directive (EU 2024/825, Empowering Consumers for the Green Transition, applies 27 Sept 2026), added as its own row rather than silently conflated with rank 12''s identity. 4 new entity-confirmed HIGH-priority rows added (106-109): the EmpCo directive itself, WEF''s SAFc emissions accounting/reporting guidelines, IATA''s own SAF Accounting Policy Paper (chain-of-custody), and a real 3-authority SAF-specific greenwashing enforcement precedent (UK ASA v. Virgin Atlantic, Amsterdam Court v. KLM, EU Commission 20-airline collective action) -- directly on-point for the workspace''s own SAF/book-and-claim marketing-claim exposure, not generic greenwashing precedent. Checked and honestly NOT added: no GHG Protocol document specifically dedicated to SAF/aviation book-and-claim accounting was confirmed distinct from its general Scope 3 guidance.

FINAL TOPLINE: table total 109 rows (98 discovery-job rows + 4 Gemini-second-pass residual + ... see full arithmetic: 105 after the Gemini second-pass bank, +4 from this bank''s SAF membership check = 109). Backlog view: Section 1 = 32 (26 original + GISIS + EUTL + 4 new SAF/EmpCo rows), Section 2 = 62 (unchanged), Section 3 = 1 (TAC Index, watched), Section 4 = 0 (genuinely empty, all rulings closed). Disposition counts: 14 declined, 1 parked, 2 kept, 92 undispositioned (the original discovery-job rows, never forced into a disposition per the migration-228 no-backfill rule -- still correctly NULL).

Committed and pushed from own worktree.

**DISCOVERY ARC COMPLETE.** Session C''s full mandate closes here: 9 category-driven discovery banks, a Gemini-review integration pass (two rounds), a mechanically-enforced surface-contract gate now live and exercised on real dispositions (not fixtures), a durable consolidation view that self-corrects as rows change, and every open spend/product/scope question this job surfaced now has a recorded, gated disposition. Idling.

## 2026-07-18 — Session C (coverage discovery lane): post-closure correction (rank 12) + PROGRAM-BOARD registration

REACTIVATION (operator), two items after the arc was declared closed:

**Item 1 — rank 12 (EU Green Claims Directive) reclassified, migration 238.** The migration-236 STATUS UPDATE note treated rank 12 as effectively stalled/dead. Operator-verified current status corrects this: the Commission announced an intention to withdraw in June 2025 but has **not** formally terminated the proposal; the trilogue was cancelled, not concluded; European Parliament committee chairs have signaled possible revival. This is an open regulatory-status question, not a closed one. Reclassified disposition→parked with a `watch_condition` key (trigger: formal withdrawal of the proposal, OR trilogue re-scheduling) — the same MECHANISM used for TAC Index (rank 84, migration 234), though the underlying reason differs (TAC = an open spend/license decision; rank 12 = an open regulatory-status watch), recorded explicitly in `surface_test.regulations.reason` so the two are not conflated. Directive (EU) 2024/825 / EmpCo (rank 106) remains the separate binding-instrument row, unchanged.

FLAGGED, not silently resolved: migration 237''s view CASE routes any parked row carrying a `watch_condition` key into backlog_section 3, labeled "OPERATOR SPEND/LICENSE DECISIONS ... PLUS parked rows carrying a watch_condition." Rank 12 is not a spend/license decision — applying the ruling literally still places it in a Section-3 view row whose label describes spend decisions, a genuine category mismatch to anyone reading Section 3 at face value. Not corrected in this pass since the operator's instruction asked for the parked-with-watch TREATMENT specifically ("same treatment as TAC"), not a view-routing change. Flagged here and in migration 238's header for a future decision on whether the view needs a third watch-flavor (regulatory-status vs spend-decision) to route rank 12-shaped rows correctly. Post-migration topline verified: Section 1 = 31 (was 32, rank 12 moved out), Section 2 = 62 (unchanged), Section 3 = 2 (TAC + rank 12, was 1), Section 4 = 0 (unchanged).

**Item 2 — PROGRAM-BOARD.md was NOT updated across the whole discovery arc.** Checked before assuming: grepped `docs/PROGRAM-BOARD.md` for any reference to Session C, coverage_gap_candidates, or coverage-discovery — zero hits across all 9 discovery banks, the gate, the consolidation view, the Gemini integration passes, and the final pricing rulings (migrations 214-237). The standing rule ("every session that opens or closes a thread ... updates this board in the same PR") was not honored by this lane at any point before now. Corrected this pass: added a master-thread-table row (Section 1 of the board) and a dedicated dated section documenting the full arc's state (CLOSED, with the rank-12 correction folded in as the board's source of truth reflects the corrected state, not the momentarily-stale one). Landed in the same commit as migration 238 and this log entry, per the standing rule.

Committed and pushed from own worktree (migration 238, this doc pair, `docs/PROGRAM-BOARD.md`).

**One item stays open, not for Session C:** the vendor-vetting-boundary skill addendum remains routed to Session A's queue (unchanged from the prior entry) — Session C does not own `caros-ledge-platform-intent`.

Idling. Discovery arc remains closed; this was a correction pass, not a reopening of new discovery work.

## 2026-07-19 — Session C (discovery lane): NEW MANDATE, missing-from-the-world gap census, sweep 1 complete

REACTIVATION (operator). Context refresh read in full: `docs/PROGRAM-BOARD.md` (current tail: Phase R hardened, four extraction builds live — portal harvest B1, register walk B2, feed transport B3, change-sweep B4, all merged 2026-07-19), ADR-015 (source-monitoring restored as the founding operating design, superseding ADR-012's manual-by-design reframe), `docs/audits/ingest-behavioral-read-2026-07-18.md` (established the true prior state: one-document-per-item extraction, no source sweep, change-detection signal terminates, F1-F20 findings), `docs/plans/ingest-repair-and-extraction-build-plan-2026-07-19.md` (Phase R/1/2/3/4 sequencing; Session C's 109-row census is USED as Phase-3 outside-in feedstock, consumed only after Phase-1 extraction per the false-denominator rule). The crawl-rebuild spec is confirmed superseded; its register-enumeration research survives as salvage only.

NEW MANDATE: measure what the four customer surfaces (Regulations/Operations/Market Intel/Research) need that NO held source's full universe contains — the missing-from-the-world half of the gap census, complementary to Session A/B's full-corpus census of HELD sources (Session A enumerating with Chrome, Session B managing the census worklist). Fetch-light only (API/feed/plain-HTTP); browser-rendering-required items are logged, not fetched, and route to Session A's queue. Three sweeps ordered: (1) audit the 62 already-dispositioned free feeds for current content, (2) adjacent enumerable universes not among held sources, (3) Research feedstock catalogs (ICAO/IMO/ISO/CEN/transport-research indexes). Every enumerated item: classify against the four contracts, dryRun-disposition, census row. Zero corpus writes, zero source registrations: discovery-not-intake, per Session C's own standing doctrine.

SCHEMA: migration 239 creates `coverage_gap_census_findings`, a purpose-built table distinct from `coverage_gap_candidates`. The new artifact shape (per-feed audit findings, not new-instrument acquisition candidates) did not fit the existing table's columns, so a new table was authored rather than force-fit — the same discipline applied throughout this lane's prior work (adding `vertical_operational_standard`, adding disposition/surface_test as real columns). `dry_run_disposition` is explicitly kept separate from `coverage_gap_candidates.disposition`: the former is a predictive, non-binding judgment; the latter stays reserved for genuine operator-ruled outcomes.

SWEEP 1 COMPLETE (migration 240): all 62 Section-2 free feeds fetch-light-checked via WebFetch. Rank 78 (EU-EPR-remainder rollup placeholder, no single URL) handled directly as not_applicable; the remaining 61 real URLs fetched. Results: **33 would_mint** (live, fetchable now, classified against the four contracts, not yet wired as a surface-consumer — the genuine "gap the four surfaces need but nothing feeds them" finding), **21 browser_required_undetermined** (403 Forbidden bot-blocks the large majority, plus one 60s timeout, one TLS cert-chain failure, one empty-SPA-shell — each logged with the specific obstacle so Session A's Chrome pass knows what it is solving, not just that it needs to), **5 would_decline** (2 genuinely dead authoritative_url 404s — rank 76 Sweden Naturvardsverket, rank 82 Freightos FBX — a real source-health finding flagged for that lane, not a fetch obstacle; 3 single-dated-event pages, e.g. an ICE press release and an FMC news article, already fully captured as point facts with no ongoing feed value at the registered URL), **2 would_park** (content genuinely under-resolved this pass without being blocked — an unparsed PDF at rank 57, a structural-only ICAO CAEP page at rank 95 whose real feedstock value sits one hop deeper).

NOTABLE PATTERN CAUGHT: several ranks (30, 31, 94, 95) are landing/portal pages whose real data sits one hop deeper — a register-enumeration case matching the build plan's own Phase-1 finding that `extractPortalLinks` needs a paginated index-walk extension for exactly this source shape. Recorded per-row rather than generalized into new schema, since sweep 1's job is per-feed findings, not pipeline design.

Committed and pushed from own worktree (migrations 239-240, this doc pair, PROGRAM-BOARD.md).

Reporting sweep 1 tallies to the operator now per the "report at sweep boundaries" instruction; awaiting confirmation before sweep 2 (adjacent enumerable universes).

## 2026-07-19 — Session C (discovery lane): schema-stitch coordination, sweep-1 ruling execution, sweeps 2+3 complete

OPERATOR RULING on sweep 1 (accepted, tallies noted, override handling confirmed correct). Two adjustments before sweep 2, plus dispositions on the flagged items.

**Adjustment 1 — schema stitch with Session B's `census_worklist`.** Read (read-only; wt-session-b is another session's live worktree, never edited by this lane per RD-19) B's uncommitted `221_census_worklist.sql` directly from `C:/Users/jason/dotfiles/.worktrees/wt-session-b/fsi-app/supabase/migrations/`. Findings:

- **Structural grain mismatch, not a naming mismatch.** `census_worklist.source_id` is `NOT NULL REFERENCES sources(id)` -- every row requires an ALREADY-REGISTERED source. Verified directly: none of sweep 1's 25 flagged rows, nor any of sweep 2/3's 19 candidates, correspond to a registered `sources` row (checked via URL join, zero matches). This is not a bug to fix -- it is the honest shape of the two halves of this mandate: `census_worklist` models documents WITHIN an already-held source (Session A/B's half); `coverage_gap_census_findings` models candidate SOURCES not yet held (Session C's half, "the missing-from-the-world half" per the operator's own framing). The two tables cannot be joined by a literal foreign key at the row grain; a rollup view has to normalize both to a common reporting-level projection, not merge them.
- **Alignment where semantics genuinely match (not forced elsewhere):** `lane` already matches natively (both use bare 'A'/'C' values, no translation needed). `dry_run_disposition`'s `would_mint` value is semantically aligned between the two tables (same meaning: this would be worth minting) and should read as ONE concept across a rollup; the rest of each vocabulary is NOT forced to unify -- B's `dryrun_disposition` (dedup_hit/congruence_reject/invariant_reject/hold) is the literal mint-chokepoint dry-run verdict computed mechanically; C's (would_decline/would_park/browser_required_undetermined/not_applicable) is a fetch-light content-fit judgment. Forcing these into one vocabulary would lose real information on both sides. `surface_tags` (B, text[]) and `four_contract_classification` (C, jsonb keyed by surface with verdict/reason) carry the same four surfaces (regulations/operations/market_intel/research per platform-intent, Community correctly excluded on both sides) -- a rollup can derive a B-shaped tag array from C's jsonb (surfaces where verdict='IN') for display parity, without rewriting either table's native shape.
- **Ownership: B's own migration header already claims it.** `221_census_worklist.sql`'s header states verbatim: "Session B owns the table + standing dedup/rollup/flag-back duties." Reading this as B's stated intent to own the rollup view. Per the operator's "one PR between you, do not build two rollups" instruction, this session does NOT build a rollup view -- it is proposed here for B to build (or explicitly hand back) rather than built twice. Session B's current worktree is mid-flight (uncommitted migration, modified `docs/inventories/migrations.md`), so this coordination note is the async handoff mechanism (the same pattern as the original arc's PENDING-C handoff to Session A), not a live conversation.
- **Consequence for the pending-A rows:** because none of the 25 (sweep 1) + relevant sweep-2/3 browser_required rows reference a registered source, they CANNOT be inserted into `census_worklist` today -- doing so would require registering them as sources first, which is out of this lane's scope ("zero source registrations" is Session C's own standing doctrine, restated in the operator's own mandate). The pending-A marker therefore lives in `coverage_gap_census_findings.pending_dependency` for now (migration 242) and becomes `census_worklist`-native only if/when a future act registers these as real sources -- flagged as a real dependency chain, not silently worked around.

**Adjustment 2 — pending-A visibility.** Migration 242 adds `pending_dependency` (`session_a_chrome_render` | `session_a_register_walk` | NULL) to `coverage_gap_census_findings` and backfills: 21 sweep-1 rows (the 403/404/timeout/cert/SPA-shell blocks) get `session_a_chrome_render`; the 4 one-hop landing-page rows (30, 31, 94, 95) get `session_a_register_walk` (reachable, but real content sits behind a register/portal index -- B2's register-walk tooling is the actual fix, not raw Chrome rendering). Applied consistently to sweeps 2 and 3 at insert time (11 + 3 = 14 more `session_a_chrome_render` rows). Every browser-blocked row across all three sweeps now carries this marker; the per-surface gap tallies read as provisional wherever it is set, per the operator's "a third of sweep 1 deferred is a dependency, not a footnote" instruction.

**Ruling execution:**
- **Ranks 76, 82 (dead-URL 404s) filed as source-health integrity flags** (migration 241): category `source_issue`, `subject_type='system'` (neither corresponds to a registered `sources` row, so `subject_type='source'` would misrepresent them), `subject_ref` pointing at the `coverage_gap_candidates` rank, recommending a URL re-verification. 2 flags, status `open`.
- **The 3 single-event pages and 2 parked rows stand as dispositioned** -- no change from migration 240.
- **The 4 one-hop landing pages (30, 31, 94, 95)** -- correctly logged per-row in migration 240; migration 242 adds the `session_a_register_walk` pending marker on top, no other change.

**SWEEP 2 COMPLETE (migration 243): 15 adjacent-universe candidates**, spanning the operator's 5 named categories (rate indices, fuel/carbon price feeds, port authority tariffs, carrier surcharge notices, plain-HTTP register indexes). Dedup-checked against `coverage_gap_candidates` and the live `sources` table before fetch. Results: 3 would_mint (RGGI auction results, eCFR versioner API, Australia Federal Register of Legislation -- all live, machine-readable or fully static, classified, not among held sources), 11 browser_required_undetermined (mostly 403 bot-blocks; one 404 URL-guess miss on Hamburg Port Authority, honestly marked `entity_confirmed=false` since the correct URL was not independently re-verified; one ECONNRESET on Maersk), 1 would_park (UK legislation.gov.uk's developer/api sub-path rendered an inconsistent "Coming Soon" banner against the site's well-established live status -- flagged as an ambiguity rather than confidently resolved either way).

**SWEEP 3 COMPLETE (migration 244): 4 Research feedstock catalog candidates** per ADR-015's G-6 feedstock-gap registration -- ISO/TC 8 (Ships and marine technology), ISO/TC 104 (Freight containers), CEN/TC 320 (Transport, Logistics and Services), and TRID (Transport Research International Documentation, the TRB/OECD-ITRD joint database, "1.5 million records"). One candidate was checked and DROPPED before fetch: IMO's own document/resolution index is already registered (`imo.org` "Index of MEPC Resolutions and Guidelines related to MARPOL Annex VI", active) -- caught by dedup-before-generation against the live sources table, a HAVE not a gap. ICAO document-index coverage is already represented by `coverage_gap_candidates` rank 95 (CAEP, from sweep 1); not duplicated. Results: 1 would_mint (TRID, live and reachable), 3 browser_required_undetermined (ISO's two committee pages 403, CEN's committee page 500).

**MANDATE TOTALS across all three sweeps:** 81 census rows (62 + 15 + 4), 2 source-health integrity flags, zero corpus writes, zero source registrations, zero staged_updates rows throughout -- discovery-not-intake held across the whole reactivation.

Committed and pushed from own worktree (migrations 241-244, this doc pair, PROGRAM-BOARD.md).

Reporting final tallies to the operator; this closes the three-sweep mandate as dispatched.

## 2026-07-19 — Session C (discovery lane): FOUND-THEN-LOST SOURCE RECOVERY AUDIT

NEW MANDATE (operator, corrected mid-turn from an inbox approach to repo-archaeology): enumerate the historical source universe from the repo's own history, diff against today, disposition the LOST set, close the class. Read-only against history, $0, fetch-light.

METHOD + EVIDENCE BASE. Four parallel read-only agents (legacy `seed-resources.json` = 243 hosts; both session logs canonical + deprecated fsi-app fork = 96 named providers; `seed-sources.sql` + deleted `source-mapping.ts` + vendor sweep = 182 hosts; git-log/ADR/doctrine archaeology = 17 + absence findings) plus two artifacts read directly: `docs/audits/source-map-from-esgtoday-2026-05-09.md` (the 114-host "Source Registry Expansion" map) and its `source-map-existence-check-2026-05-10.md` (286 entries probed, 209 ABSENT then, pre-registry-growth). Deduplicated historical universe ~380 distinct provider hosts. Diffed against the union of ALL tracking tables (sources 1297 / 825 active, provisional_sources, canonical_source_candidates, portal_link_candidates, census_worklist 1331, both coverage tables, disposition_ledger) = 1371 distinct tracked hosts. LOST = absent from every one of them.

ABSENCE FINDING (load-bearing, stated as such): NO artifact literally labeled "Gemini" exists anywhere in history, tracked or deleted; every "gemini" string is the "Capgemini" substring or Session C's own second-pass methodology note. The operator's earlier-phase source research is NOT lost as a whole — it survives committed as `seed-resources.json` (119 legacy resource records) and the esgtoday-derived source map. What leaked is the subset of PROVIDERS inside it that never became tracked sources. Also confirmed: no committed-then-deleted provider list orphaned in history (deleted research scripts are LLM screeners, deleted seed-data files are scoring/clustering data), and no ADR names any external provider.

STEP 2 DIFF: the large majority (~340 of ~380) are HELD / CENSUSED / PREVIOUSLY-RULED. The 2026-05-10 existence-check's 209 ABSENT has mostly been filled since (registry grew 783→1297), including the finance regulators once absent (FCA, ESMA, EBA, EASA, DG FISMA now held). The genuinely-still-LOST set is 39 providers pre-boundary-ruling.

STEP 3 CENSUS (migrations 245 schema + 246 data): operator ruled the boundary — land 15 market-data + 7 regulators + 4 standards + IEA (operator_confirm) + 8 trade-press (would_park) = 35 rows; OMIT the 4 tier-6 vendor-claim tools (passionfruit.earth, slrconsulting.com, sparq360.com, sprih.com) entirely. Migration 245 (schema: sweep4 value, subject_type lost_historical_provider, dry_run_disposition operator_confirm, lens column freight_native/esg_finance, evidence/intent/auth-gate/confirm-question columns) was committed as a FILE BEFORE apply per the operator's schema-drift instruction, then applied. Migration 246 landed the 35 rows: lens split 20 esg_finance / 15 freight_native (operator's explicit 9-item maritime-emissions cluster — Rystad, Searoutes, BigMile, ZeroNorth, ENTSO-E, CDP-open-data-API, Terrascope, Normative, SEA-LNG — freight_native; the finance-supervisory inheritance esg_finance; the rest assigned by source nature); disposition split 13 would_mint (free regulators ECB/EIOPA/AFM/HKMA/SEBI/DG-GROW/NYC-Comptroller + free standards SASB/TCFD/SEA-LNG/ADEC + free feeds ENTSO-E/CDP-API), 21 would_park (commercial/paywalled data + SaaS tools + trade-press), 1 operator_confirm (IEA Monthly Electricity Statistics). Each row carries its historical_evidence trail and historical_intent. Section-C corporate actors (hundreds of carriers/forwarders/manufacturers/clients) deliberately excluded and recorded as excluded (subjects data providers report on, not providers; the existence-check itself framed their ~0% presence as by-design for a separate Market-Intel workstream).

OPERATOR ANSWERS recorded as given (ruling 4): IEA — active account confirmed, so the login-gated Monthly Electricity Statistics feed is operator-credentialed not cold (recorded in the IEA row's auth_gate + operator_confirm_question + notes). Market-data signups — no accounts held for MSCI, Moody's, Rystad, Workiva, FTSE Russell, Morgan Stanley, Normative, Terrascope (and by extension the rest), so they stay cold LOST candidates (recorded per-row).

STEP 4 CLASS CLOSURE (ADR-016, accepted, build queued): an append-only `source_contact_ledger`, one home, one row per source touch at the moment it happens, contact_type vocabulary discovered/evaluated/signed_up/newsletter_inbound/declined/parked/registered. `newsletter_inbound` is explicitly modeled — the data-provider-newsletter intake channel no current table covers, which is exactly how these 39 leaked (the IEA statsnews@iea.org case is the worked example). Class-over-instance fix: source knowledge can never again live only in a session-log paragraph, an inbox, or a dead worklist. Recommendation/design only; the operator sequences the build.

BATCHED OPERATOR-CONFIRM (was 2 questions; both now answered above): only IEA remained genuinely operator-gated, and the operator answered it plus the market-data batch in the same message.

Committed and pushed from own worktree: migration 245 (its own commit, file-before-apply), then migration 246 + ADR-016 + this doc pair + INDEX + PROGRAM-BOARD (second commit), one push (one PR). Idle after.
