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
