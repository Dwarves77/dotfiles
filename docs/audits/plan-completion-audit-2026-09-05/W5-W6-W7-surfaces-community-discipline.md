# W5/W6/W7 plan-completion audit — surfaces, community, discipline (2026-09-05)

**Tree audited:** `1e6d9e8b` (branch `audit/auditw567-2026-09-05`, worktree `/root/work/lanes/auditw567`)
— REBASE-47: train 47 merged with train 46 master, "the most complete tree that exists" per dispatch;
this is what T46 validation runs against.

**Method:** read-only. Every finding below is `[CONFIRMED]` by one of: (a) opening the named file in
full and reading the code/comment; (b) `grep`/`find` across the tracked tree (no `node_modules`); (c)
live read-only SQL against Supabase project `kwrsbpiseruzbfwjpvsp` via the MCP `execute_sql` tool, run
2026-09-05, SELECT only; (d) running `node fsi-app/.discipline/fitness/runner.mjs` and
`node fsi-app/.discipline/governance/closure-gate.mjs` on this tree, pasted verbatim below. No writes,
no migrations applied, no full test suite or build run (other lanes share this container). Prior-agent
claims (`docs/audits/wiring-audit-2026-09-04/*`, `docs/PROGRAM-BOARD.md`, `docs/ops/session-log.md`,
`docs/plans/complete-system-build-plan-2026-09-04.md`) were treated as hypotheses to re-check, not
evidence, per the operator's instruction and CLAUDE.md rule 14. Where a claim could not be re-verified in
the time available it is labeled `[HYPOTHESIS]`, never asserted as fact.

**Scope:** plan §2 W5 (surfaces), W6 (community as ruled), W7 (discipline — F25 widened, execution-wiring,
closure-gate, F14/F23/F28/F35/F38, STALE-NEXT, the W7.1 allowlist and every expiry entry on this tree).

## Gate runs, pasted verbatim

```
$ node fsi-app/.discipline/fitness/runner.mjs   (32 functions checked)
...
Fitness summary: 32 function(s) checked, 0 violation(s).
```
F14 producer-consumer-orphan: PASS. F23 governed-surface-coverage: PASS. F25 module-liveness: PASS.
F28 harness-run-integrity: PASS. F35 row-ux-coverage: PASS. F38 unbounded-supabase-read: PASS.

```
$ node fsi-app/.discipline/governance/closure-gate.mjs
===== CLOSURE GATE =====
current train: 46
1. NEVER-RUN     : PASS
2. STALE-NEXT    : PASS
3. WRITER-READER : PASS  (summary: {"tables":34,"rpcs":29,"writeOrphans":1,"allowlisted":0,"gating":1,"readOrphans":0})
4. LANE-CONTRACT : PASS
=== closure gate PASS ===
```

Both gates are genuinely green on this tree today. But `currentTrain()` (`.discipline/governance/
closure-gate.mjs:283`) reads `git log --oneline HEAD` and finds the highest `waveNN`/`trainNN` token
already in this branch's own history — it reports **46**, not 47, because this worktree (REBASE-47) has
not yet had a "train 47" commit land on it. `[CONFIRMED, code read]`: the STALE-NEXT allowlist
(`closure-gate.mjs:498-529`) carries seven entries with `expiryTrain: 46`, each re-granted from an
earlier expiry with the comment "T46 validation fails this entry if it is still open" — and the check's
own comparison is `currentTrain > al.expiryTrain` (strict), so at `currentTrain=46` these do **not**
yet fail (46 is not `>` 46). The instant a commit carrying "train 47"/"wave 47" lands on this branch's
history, `currentTrain()` becomes 47, `47 > 46` is true, and all seven flip red with no code change
required. This is not a defect in the gate (it is doing exactly what its own design says), but it is a
real, imminent closure-gate failure sitting one train-landing away, undischarged, on the tree this
audit was told to trust as "most complete."

## W5 — Surfaces: nothing renders empty by design

| Item | Plan ref | 1 Reachable | 2 Run | 3 Populated | 4 Visible | 5 Gated | 6 Documented | Verdict | What's missing |
|---|---|---|---|---|---|---|---|---|---|
| Spec-09 CSV upload flow (`POST /api/workspace/spec09-upload`, `Spec09CsvUpload.tsx`, `csv-upload-contract.mjs`) | §W5 item 1 | DONE — route exists, wired into `SettingsPage.tsx:175` via dynamic import `[CONFIRMED, file read]` | NOT — no `scripts/harness-runs/**` or `scripts/_snapshots/spec09-csv-upload/` artifact found anywhere in the tree (`find` returned nothing) `[CONFIRMED]` | NOT — all six target tables (`surcharge_audits`, `tce_data_quality`, `auxiliary_energy_profiles`, `eudr_plot_claims`, `custody_chains`, `indexation_clauses`) = 0 rows live `[CONFIRMED SQL, 2026-09-05]` | DONE (honest-empty) — every panel renders a named gap line, not a blank state (verified `OemRoadmapPanelView.tsx`, `ReroutingPanelView.tsx`, `SurchargeAuditPanelView.tsx`, `IndexationPanelView.tsx`, `GridQueuePanelView.tsx`, `DqiPanelView.tsx`, `AuxiliaryEnergyPanelView.tsx` — all `rows.length===0` branches print a `*_GAP_LINE` constant citing `scripts/spec09/SOURCES.md`) `[CONFIRMED, files read]` | Partially — F25 wiring passes; no dedicated adversarial/contract test found for the upload route beyond `run-fixture-import.mjs` (a local, deps-injected proof, not CI-wired by design, per its own allowlist entry) `[CONFIRMED]` | DONE — `scripts/spec09/SOURCES.md` fully current, cites this exact route and lane | **BUILT, WIRED, NOT RUN** (BUILT-DORMANT) | **Live schema mismatch found**: the route's `logic.ts:61` stamps `org_id` on every insert row, and its own header says this depends on "migration 311's new org-scoped SELECT policies" — but migration 311 (`311_spec09_org_scope_and_pool_drop.sql`) is **not applied** to the live DB. `surcharge_audits` has **0** `org_id` columns live `[CONFIRMED SQL]`, and `carrier_compliance_pools` (which 311 claims to drop) still exists live with 9 columns `[CONFIRMED SQL]`. Any real POST to this route today would fail on an unknown column, not silently succeed — this is a two-track-policy (CLAUDE.md rule 3) violation: code shipped ahead of its DDL. |
| `oem_tech_roadmaps` rows-file path (`--rows-file`, `oem-roadmap-rows-file.example.json`) | §W5 item 1 | DONE — `maintenance.yml` has a `spec09-oem-roadmap` step accepting `--arg <rows-file>` `[CONFIRMED, workflow grep]` | NOT — 0 rows live, no harness-run artifact found | NOT | DONE (honest-empty, see `OemRoadmapPanelView.tsx`) | n/a (no live data to gate against) | Partial — the example rows-file is explicitly marked "DRAFT, unreviewed, placeholder values only" in `SOURCES.md`; no ratified rows-file is checked in | **BUILT, WIRED, NOT RUN** | No operator-reviewed rows-file exists yet; the CALSTART/ZETI candidate lead is named `[HYPOTHESIS]` in `SOURCES.md`, not confirmed. |
| `grid_connection_queues` rows-file path | §W5 item 1 | DONE — `spec09-grid-queue` maintenance step wired | NOT — 0 rows, no artifact | NOT | DONE (honest-empty) | Partial, same as above | Same | **BUILT, WIRED, NOT RUN** | Same shape: example rows-file is a placeholder; Ofgem/ENA candidate lead is `[HYPOTHESIS]`, unconfirmed. |
| `reroute_events` / reroute monitor (`ReroutingPanel`/`ReroutingPanelView`, `reroute-producer.mjs`) | §W5 item 1 | DONE — `spec09-reroute` maintenance step wired | NOT — 0 rows, no artifact | NOT (also blocked on a second `corridor` entity — only one exists in the spine, `CNSHA-NLRTM:ocean`, per `SOURCES.md`, not independently re-counted by SQL this lane) `[HYPOTHESIS: entity count, from doc, not re-queried]` | DONE (honest-empty, `REROUTE_GAP_LINE` names the exact blocking reason) | Partial | DONE, self-documented in `SOURCES.md` | **BUILT, WIRED, NOT RUN** | Second corridor entity not yet confirmed present; no ratified rows-file. |
| `RecordGradeBadge` (row-level, all four surfaces) | §W5 item "row chips on all four surfaces" | Partial — mounted in `RegulationsLedger.tsx:1748` (row) and `OperationsItemsView.tsx:158` (row) `[CONFIRMED, grep]`; **not** mounted in `MarketIntelLedger.tsx` or `ResearchLedger.tsx` at all — `grep -n itemGrade|RecordGradeBadge` on both returns zero matches `[CONFIRMED]` | n/a (component-level) | n/a | NOT (Market/Research list rows) / Partial (Regulations/Operations rows render, but their data source is one of the 11 RPCs — see item_grade row below — so the badge currently renders nothing live even where mounted) | DONE for the mounted two — F35 row-UX coverage passes | DONE (component itself documented in its own header) | **PARTIAL** | Two of four surfaces (Market, Research) have no `RecordGradeBadge`/`itemGrade` reference anywhere in their ledger row component — this is a genuine, undocumented gap, not a "3 of 4, Operations excluded" gap as the 2026-09-04 audit reported (that claim is now **refuted** — see below). The two surfaces that DO mount it (Regulations, Operations) still render nothing live because of the item_grade RPC gap immediately below. |
| `item_grade` in the listing RPCs after migration 310 | §W5 item explicit | DONE — migration file `310_listing_rpcs_item_grade.sql` exists, adds `item_grade` to all 11 RPCs, with its own pre/post-check block | **NOT** — migration 310 is **not applied** to the live database. Highest applied migration is 307 (`307_item_forward_events_text_identity_dedupe`, `20260905012221`); 308/309/310/311 all exist as files, none applied `[CONFIRMED SQL, `supabase_migrations.schema_migrations` query]` | NOT for the RPC-projected column — live `pg_get_functiondef` check on all 11 named functions (`_workspace_active_items`, `get_workspace_intelligence_slim[_public]`, `get_workspace_intelligence_listings[_public]`, `get_market_intel_items[_public]`, `get_operations_items[_public]`, `get_research_items[_public]`) shows **zero** of them project `item_grade` `[CONFIRMED SQL, `pg_get_functiondef(...) ILIKE '%item_grade%'` = false on all 11]`. The base table IS populated: `intelligence_items.item_grade` = 1101 `record` / 417 `brief` (non-archived) `[CONFIRMED SQL]` — the column has real data, it just isn't projected to the RPCs any ledger row reads. | NOT for ledger rows on any surface (only the four detail-page fetchers, which use `select("*")` directly against `intelligence_items` bypassing the RPC layer, see `src/lib/supabase-server.ts` around each mapper) | n/a | DONE — the migration file itself is a model of self-documentation (pre-check MD5s, post-check row-count assertions) | **BUILT, NOT RUN (BUILT-DORMANT)** | Migration 310 needs to be applied by the coordinator via the Supabase MCP. Until then, every `RecordGradeBadge` mount on a LIST/ledger row (as opposed to a detail page) renders nothing, on every surface, regardless of how many surfaces mount the component. `src/lib/supabase-server.ts`'s own comments (lines ~916-921, ~1530-1532) correctly and honestly document this as dormant-passthrough, not a silent bug — the code is honest, the DB state is the gap. |
| CSV upload / row chips / spec-09 panels — "no panel ships that cannot receive data" | §W5 done-condition | DONE per code (upload flow exists) | See above | See above | DONE (honest-empty everywhere checked) | Partial | DONE | **PARTIAL overall** | The mechanism to receive data now exists (upload route + rows-file CLI path) for every named table; none has been exercised for real (no run artifact, 0 rows in all nine spec-09 tables), and one path (CSV upload) would error live today due to the unapplied migration 311. |

## W6 — Community as ruled: user-started rooms on a regional spine

| Item | Plan ref | 1 Reachable | 2 Run | 3 Populated | 4 Visible | 5 Gated | 6 Documented | Verdict | What's missing |
|---|---|---|---|---|---|---|---|---|---|
| `community-topics-seed` retirement | §W6.1 | n/a (deletion target) | n/a | n/a | n/a | n/a | n/a | **COMPLETE** | `[CONFIRMED, find]`: neither `scripts/seed/community-topics-seed.mjs` nor `scripts/maintenance/community-topics-seed.mjs` exists anywhere in the tracked tree. Fully retired, matching the operator's ruling. |
| User-started room / group creation flow | §W6.2 | DONE — `POST /api/community/groups` (`src/app/api/community/groups/route.ts`) creates a member-owned group, owner bootstrapped as admin; `CreateGroupModal` in `CommunityRooms.tsx:1723` posts to it, reachable from the Community surface `[CONFIRMED, file read + grep for the fetch call]` | DONE by proxy — `community_groups` = 7 rows live, but all 7 are the pre-window regional seed (`room-global`, `room-eu`, etc., created 2026-07-07 by `scripts/seed-community-regional-rooms.mjs`), not a user-created row; no user has used `CreateGroupModal` in production yet | Partial — 7 rows exist, 0 attributable to the create flow | DONE — the modal and its resulting group render on the Community surface | Not independently verified this lane (no fitness function specific to this flow was found) `[HYPOTHESIS]` | Partial | **PARTIAL** | The flow that exists creates **vertical, cross-regional** groups (`region: 'GLOBAL'` hardcoded in the route's own comment) — it is NOT "owner, region, entity binding" as §W6.2 specifies verbatim. There is no region-scoped or entity-bound room-creation path found anywhere in `src/app/api/community/**`. This **refutes** a hypothesis this lane initially formed from a narrow grep (`CreateRoom`/`createRoom`, case-sensitive) that no creation flow existed at all — a broader read of `CommunityRooms.tsx` and `groups/route.ts` found a real one, just not shaped the way the plan describes. |
| Antitrust guard | §W6.2 | DONE — `src/lib/community/antitrust.mjs` (`kAnonymity`, `dominanceCap`, `threeMonthLag`) is imported by `src/lib/community/benchmark.mjs:17`, which the 09-04 audit and this lane both traced to `/api/community/benchmarks/current` and `POST /api/community/posts` `[CONFIRMED, grep + prior audit cross-check]` | Not independently exercised this lane (no adversarial attack test run) `[HYPOTHESIS]` | n/a | n/a (guard logic, not a rendered row) | `antitrust.test.mjs` exists `[CONFIRMED, file listing]`; not confirmed CI-wired vs. rule 15's "attack, don't assert presence" bar in the time available | Partial | **PARTIAL — reachable and unit-tested, adversarial-proof not independently re-verified this lane** | Rule 15 requires a scripted attack proving the guard actually holds under a forged/adversarial input, not just a presence check; this lane did not have time to read `antitrust.test.mjs` in full to confirm it meets that bar — flagged rather than asserted either way. |
| Benchmarks | §W6.2 "benchmarks answered" | DONE — `/community/benchmarks` route + `BenchmarksPanel`, `community_benchmark_instruments` table | DONE (seeded) | `community_benchmark_instruments` = 3, `community_benchmark_responses` = 0 `[CONFIRMED SQL, unchanged from the 2026-09-04 audit's own count]` | DONE (renders 3 instruments) | Not verified this lane | Partial | **BUILT-DORMANT (unchanged since 2026-09-04)** | The anti-empty-room mechanism itself has nothing to show — 0 responses submitted. This is the same state the prior audit found three weeks ago; nothing in this tree moved it. |
| `community_promotion_transitions` writer | §W6.2 "0 rows, no writer today" | **NOT** — `src/lib/community/promotion.mjs` exists and its own header states "INSERT into `community_promotion_transitions` ... is the caller's job — this module never [inserts it directly]" `[CONFIRMED, file read]`; `grep` for any importer of `promotion.mjs` outside its own test returns **zero** results `[CONFIRMED]`. The one promotion-shaped route that IS wired, `POST /api/community/posts/[id]/promote`, writes to the **different**, older `post_promotions` table (migration 041), not `community_promotion_transitions` (migration 295) | NOT | `community_promotion_transitions` = 0 rows `[CONFIRMED SQL]` | NOT | NOT | Partial (module has a header explaining its own non-write design) | **NOT BUILT (as a wired writer) / DUPLICATE promotion path** | The plan's own text ("0 rows, no writer today") is still true on this tree, verbatim, three weeks later. There are now TWO promotion mechanisms in the codebase — the live `post_promotions`/`staged_updates` path (migration 041, actually wired) and the unwired 5-gate `community_promotion_transitions` machine (migration 295, `promotion.mjs`) that the plan calls for. Building the second without retiring or explicitly superseding the first risks exactly the "two writers for one concept" pattern CLAUDE.md rule 1 and the closure gate's WRITER-READER check exist to catch — worth an explicit ADR on which one is canonical. |
| Member-profile verification "live end to end" | §W6.2 | DONE — `/api/community/profile/verify` checks the caller's email domain against `FREE_MAIL_DOMAINS` `[CONFIRMED, route logic read]` | DONE (route logic correct, per code read) | `community_member_profiles` = 0 rows `[CONFIRMED SQL, unchanged from 2026-09-04]` | DONE (ProfileForm renders the flow) | Not verified this lane | Partial | **BUILT, NOT YET USED (unchanged)** | Zero live verifications since the prior audit. Not a defect (new, unexercised feature) but "live end to end" per the plan's own done-condition requires at least one real verification with a read-back, which has not happened. |
| Spec 05 §5 struck by ADR (sector-seeded groups replaced) | §W6.3 | Not verified this lane — `grep -rn "sector_profile"` was not re-run against `docs/decisions/` in full; the 2026-09-04 audit found no `sector_profile` seeding path in code at all | — | — | — | — | — | **NOT VERIFIED — HYPOTHESIS carried from prior audit, not re-checked** | This lane did not have time to confirm whether an ADR striking spec 05 §5 exists on this tree. Flagged as unverified rather than asserted either way. |

## W7 — Discipline: nothing unwired can land again, what is dead is gone

| Item | Plan ref | 1 Reachable | 2 Run | 3 Populated | 4 Visible | 5 Gated | 6 Documented | Verdict | What's missing |
|---|---|---|---|---|---|---|---|---|---|
| F25 module-liveness widened to `scripts/**`, `.discipline/**` | §W7.1 | DONE — confirmed by reading `F25-module-liveness.mjs` in full: `findDispatchRoots()` scans `.github/workflows/*.yml`, `package.json` scripts, esbuild stub aliases, `run-data-audit-lane.mjs`'s `AUDITS` table, and `*-golden.mjs` files as five distinct dispatch-detection sources, well beyond a plain import graph `[CONFIRMED, file read in full]` | DONE — `node fsi-app/.discipline/fitness/runner.mjs` shows F25 PASS on this tree, 0 violations, scanning the widened scope | n/a | n/a | DONE — F25 is itself the gate, wired into `run-test-suite.sh`/CI per its own file | DONE, extensively — the file's own header and every allowlist entry names its provenance | **COMPLETE (widening itself)** | The widening is real and well-built. See the allowlist finding immediately below for what the widening surfaced but did not resolve. |
| W7.1 allowlist expiry entries | §W7.1 | — | — | — | — | — | — | **PARTIAL — widened correctly, but a large deferred backlog was re-granted rather than resolved** | `[CONFIRMED, file read]`: an "ASSEMBLE-47 RATCHET NOTE" (lines 530-550) states ~49 files carried `expiry: 46`, set before train 46 itself had landed; because `latestTrainWave()` (reading `git log` for a `waveNN` token) crossed 46 the instant train 46's merge landed on `origin/master`, **all 49 entries flipped EXPIRED** before any lane had read them. Rather than a dedicated lane reading and dispositioning each file, the coordinator (ASSEMBLE-47) re-granted the whole batch to `wave52` with a comment naming this as "a standing, undischarged backlog item." This is the exact anti-pattern the build plan's own root-cause section describes: an open item pushed forward by number rather than resolved. Separately, `src/lib/contracts/provenance-envelope.mjs` (a named `w()` entry, expiry re-granted from an earlier train to 50) is deferred pending a workstream (WO-17) that "has not started" per the entry's own re-confirmation text. |
| Execution-wiring (`execution-wiring.mjs`) | §W7.1/W7.3 | DONE — exists, used by F15 and cited throughout F25's own comments as the authority for the `AUDITS`-table dispatch-detection idiom | Not independently re-run this lane as a standalone script (only exercised indirectly via the fitness runner, which passed) `[HYPOTHESIS: assumed working because dependents pass]` | n/a | n/a | DONE (it IS the gate) | DONE | **COMPLETE, not independently re-verified standalone** | — |
| Closure gate (NEVER-RUN, STALE-NEXT, WRITER-READER, LANE-CONTRACT) | §W7.5 | DONE — file exists, all four checks run and reported | DONE — ran on this tree, pasted above | n/a | n/a (a governance script, not a customer surface) | DONE (it is itself the gate) | DONE, extensively self-documented | **COMPLETE today; expiry cliff pending** | See the "Gate runs" section above: currentTrain=46 and seven STALE-NEXT entries expire exactly at train 46 (`currentTrain > expiryTrain` is the only reason they are not already red). WRITER-READER reports `writeOrphans: 1` and `gating: 1` — this lane did not have time to identify which table/RPC pair those refer to; flagged as **unverified**, not asserted resolved or broken. |
| STALE-NEXT check | §W7.5 explicit | DONE, see above | DONE, PASS on this tree | n/a | n/a | DONE | DONE | **COMPLETE (mechanically), with the expiry-cliff caveat above** | — |
| F14/F23/F28/F35/F38 | §W7 explicit list | DONE, all five reachable per the fitness runner's own file-count lines (F28: 1 file = the harness-run-integrity script itself; F38: 874 files scanned) | DONE — all five PASS on this tree, pasted above | n/a | n/a | DONE (each IS a gate) | Not individually re-read in full this lane; each PASS is taken from the runner's own output, not independently re-derived | **COMPLETE per this lane's gate run** | This lane ran the gates but did not open each of the five fitness-function source files in full to independently confirm their internal logic is sound — that would require a much longer read; the PASS result is trusted as the runner's own honest output, consistent with a clean `git status` and no local modifications to the discipline tree. |
| Hook registries: `.claude/settings*.json`, `install-hooks.mjs`, `.githooks` | §W7 explicit | Partial | — | — | — | — | — | **CONFIRMED, narrow scope** | `.claude/settings.json` and `.claude/settings.local.json` exist; no `.githooks/` directory exists anywhere in the tracked tree `[CONFIRMED, find]`. `install-hooks.mjs` is correctly allowlisted in F25 as an "operator-run, out-of-repo install step" (copies into `.git/hooks/`, which is genuinely outside the repo's tracked scope) — this matches the code's own documented behavior (reads `fsi-app/.discipline/hooks/`, writes to `.git/hooks/` via `--git-common-dir`) `[CONFIRMED, file header read]`. No further reachability claim is made here; a full audit of what each installed hook actually enforces at commit time was out of this lane's time budget. |
| Dead exports / Gate-A shims removed | §W7.2 | Not independently re-verified this lane | — | — | — | — | — | **NOT VERIFIED** | This lane did not grep the 19-dead-export list or `scripts/mint/lib/gate-a-*.mjs` against the current tree; carried forward as unverified rather than assumed complete or incomplete. |

## Findings against the operator's three concerns

**1. Tools built but unused or duplicated.**
- `[CONFIRMED]` `community_promotion_transitions`'s 5-gate machine (`promotion.mjs`, migration 295) is a
  complete, tested module with **zero** production callers, while a **different** promotion mechanism
  (`post_promotions`, migration 041, wired into `/api/community/posts/[id]/promote`) is the one actually
  live. Two promotion concepts exist in the schema; only one is used. This is exactly the "flywheel and
  harness don't make the system work as one unit" pattern the operator named — a second, unconnected
  machine sitting next to the real one.
- `[CONFIRMED]` The spec-09 CSV upload route and CLI rows-file paths are fully built and wired into
  `maintenance.yml`, but have never been run for real (no harness artifact for any of the nine tables),
  and the CSV upload route would error against the live schema today (migration 311 unapplied, `org_id`
  column absent). A tool built to close a gap, wired, but not yet exercised or even schema-compatible
  with the live database it targets.
- `[CONFIRMED]` ~49 files (F25 W7.1 widened scope) and one named module (`provenance-envelope.mjs`) are
  formally "built, no caller" and have had their review deadline pushed forward twice (train 46 → 52,
  and 43/46 → 50) rather than resolved — a real, admitted, undischarged backlog of unused-tool review.

**2. Flywheel and harness gaps.**
- `[CONFIRMED]` Migration 310 (item_grade into the 11 listing RPCs) is unapplied live, so the
  `RecordGradeBadge` row chip — built, tested, mounted on two of four surfaces — renders nothing on any
  ledger row anywhere in the product today. The harness has no artifact recording that this migration
  was ever applied, because it hasn't been. This is a "run" gap in the §0 sense: the code is Reachable
  but not Run against the live system it's meant to serve.
- `[CONFIRMED]` None of the nine spec-09 tables (`reroute_events`, `grid_connection_queues`,
  `oem_tech_roadmaps`, `surcharge_audits`, `tce_data_quality`, `auxiliary_energy_profiles`,
  `eudr_plot_claims`, `custody_chains`, `indexation_clauses`) has ever been populated by its own
  producer; live SQL confirms all nine at 0 rows, identical to the 2026-09-04 audit's count three weeks
  ago. The harness (maintenance.yml wiring, run artifacts) exists for the mechanism but has never fired.
- `[CONFIRMED]` The closure gate itself — the mechanism meant to catch exactly this class of drift — has
  seven allowlist entries whose only reason for currently passing is a strict-inequality comparison
  (`currentTrain > expiryTrain`, 46 > 46 is false) that will flip the instant a train-47 commit lands.
  The harness that is supposed to prevent silent drift has a self-acknowledged backlog it re-grants
  rather than closes.

**3. Runtimes that end without triggering their downstream (rule 17).**
- `[CONFIRMED]` The spec-09 CSV upload route, once it succeeds, stamps rows with `org_id` and returns —
  nothing in the route or `logic.ts` triggers a flywheel pass (connection discovery, tags, obligations)
  over the newly-inserted rows; these six tables are read directly by their panels, not minted through
  `intelligence_items`, so this may be architecturally correct (they are customer operational facts, not
  corpus items) rather than a rule-17 violation — flagged as `[HYPOTHESIS: not a violation, but not
  independently confirmed against spec 09's own definition of what should follow an upload]`.
- `[HYPOTHESIS, not independently traced this lane]` Whether the community group-creation flow
  (`POST /api/community/groups`) triggers any downstream discovery/notification path once a group is
  created was not traced in the time available.

## Prior claims refuted

1. **Refuted**: `docs/audits/wiring-audit-2026-09-04/A2-surfaces.md` ("RecordGradeBadge … `**not**
   OperationsDetailSurface.tsx`… the three surfaces this lane wired it into") — on this tree,
   `OperationsDetailSurface.tsx:782` and `OperationsItemsView.tsx:158` both mount `RecordGradeBadge`,
   with an explicit header citing "lane CHIPS, 2026-09-05, W3.4" as the fix. The badge is now on all four
   intelligence detail surfaces (Regulations, Market, Research, Operations) — the surface-level claim
   from three weeks ago no longer holds, `[CONFIRMED, file read]`. What the 2026-09-04 audit did NOT
   check (list/ledger rows as opposed to detail pages) is where the real remaining gap now sits (Market
   and Research ledgers have no row-level badge at all) — a different, narrower gap than what was
   reported, not the same gap restated.
2. **Refuted, self-refuted by this lane's own first pass**: this lane's own initial `grep` for
   `CreateRoom`/`createRoom` (case-sensitive, literal) found nothing and would have supported a
   "no user-started room flow exists" finding. A broader read of `CommunityRooms.tsx` (`CreateGroupModal`)
   and `src/app/api/community/groups/route.ts` found a real, wired, tested-by-code-comment creation flow.
   Recorded here as a refutation of what a narrower method in this same lane would have concluded, per
   CLAUDE.md rule 14's corollary that a flag or finding that dissolves under evidence gets a same-session
   correction.
3. **Not refuted, re-confirmed unchanged**: the plan's own text (`complete-system-build-plan-2026-09-04.md`
   §W6.2, "`community_promotion_transitions` writer (0 rows, no writer today)") is still exactly true on
   this tree. This is not a refutation — it is a claim that has NOT moved in three weeks, worth flagging
   because several other W6/W7 items DID move in that window while this one, explicitly named in the
   plan, did not.
4. **Not refuted, re-confirmed unchanged**: `published_price_statistics` = 4 rows, `community_member_profiles`
   = 0 rows, `community_benchmark_responses` = 0 rows — all identical to the 2026-09-04 audit's live
   counts, `[CONFIRMED SQL]`. No claim of progress on these specific figures should be trusted without a
   fresh count; this lane's own fresh count matches the old one exactly.
5. **Not verified either way**: the 2026-09-04 audit's claim that spec-09 sourcing gaps are "self-documented,
   not silent" — re-confirmed true and, if anything, strengthened: `scripts/spec09/SOURCES.md` on this
   tree is more current (dated 2026-09-05, names the CSV upload flow, the rows-file mechanism, and the
   `carrier_compliance_pools` drop) than the file the prior audit read.

## What could not be verified, and why

- The exact identity of the WRITER-READER check's reported `writeOrphans: 1` and `gating: 1` — the
  closure-gate output gives counts, not names, and tracing which table/RPC pair those refer to would
  require reading `.discipline/governance/closure-gate.mjs`'s `checkWriterReader()` inputs in more depth
  than this lane's time budget allowed.
- Whether the antitrust guard (`antitrust.mjs`) is proven by an actual adversarial attack test (rule 15's
  bar) rather than a presence-only unit test — `antitrust.test.mjs` exists but was not read in full.
- Whether an ADR striking spec 05 §5's sector-seeded-groups language exists on this tree — not re-checked
  against `docs/decisions/`.
- The 19-dead-export removal and Gate-A shim removal (§W7.2) — not independently re-verified.
- Whether the second corridor entity required to unblock `reroute_events` now exists in the live spine —
  relied on the (unverified-by-this-lane) count in `scripts/spec09/SOURCES.md` rather than a fresh SQL
  count against `entities WHERE kind='corridor'`.
- No browser was opened (per the lane's read-only/no-build mode); every "renders" claim above is a code
  read plus a live-data count, not a screenshot-confirmed render, consistent with the same limitation the
  2026-09-04 audit itself recorded.
