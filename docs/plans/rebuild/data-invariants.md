# Data invariants (extracted from the old maintenance, remediation, verify, proof and lib scripts)

CLEAN-3 extraction, 2026-10-11. Source: the whole-read audit registers under docs/archive/audits/2026-10-11-complete-audit-registers/. Format: INV-NNN | property | resolver behaviour | old file(s) | register:line. A step or audit with no standing invariant carries a NONE line with its reason.

Count: 174 invariant lines (INV-001 to INV-174) and 16 NONE lines. INV-153 to INV-155 were appended by lane P1-01 (2026-10-11) from the whole read of the auth-db module (docs/plans/rebuild/part1/auth-db.md); INV-156 to INV-161 by lane P1-03 (2026-10-12) from the whole read of the intake-a module (docs/plans/rebuild/part1/intake-a.md); INV-162 to INV-164 by lane P1-06 (2026-10-12) from the whole read of the sources-b module (docs/plans/rebuild/part1/sources-b.md); INV-165 to INV-168 by lane P1-02 (2026-10-12) from the whole read of the workspace module (docs/plans/rebuild/part1/workspace.md); INV-169 to INV-174 by lane Merge (2026-10-12) from the whole read of its module (docs/plans/rebuild/part1/auth-db.md); their last column cites that register's section.

Register labels used in the last column (all under docs/archive/audits/2026-10-11-complete-audit-registers/, line numbers are lines of that file): B1b = B1b-whole-reads-maintenance; B1a3 = B1a-part3-whole-reads-harness-runs; B2p1 = B2-part1-lib; B2p2 = B2-part2-proof; B2p3 = B2-part3-verify; B2p4 = B2-part4-other-scripts; D1p1 = D1-part1-github; D1p2 = D1-part2-engine-hooks-claude; D1p3 = D1-part3-fitness; D1p4 = D1-part4-governance; C1, C2, C3 = the C-migrations registers (C3 also C3a, C3b, C3c); C4 = C4-db-live.

INV-001 | A source's scope_*, expected_output and jurisdiction_iso classification flags are proposed from name and role, and drift beyond 30 points is flagged | auto-adopt high-confidence and deterministic proposals; resolve zero-proposal, drift and anomaly flags; drift check needs at least 10 items | fsi-app/scripts/maintenance/apply-classifications.mjs | B1b:90
INV-002 | A quarantined item carries a disposition within 14 days or a valid deferral (valid = deferred_until in the future, reason present) | insert one disposition_deferred integrity_flag per valid deferral row; reject rows failing deferral validation; apply must dedupe per item | fsi-app/scripts/maintenance/apply-deferrals.mjs, fsi-app/scripts/lib/deferral.mjs | B1b:91
INV-003 | A figure found by a search lane is attached to its item only with url and verbatim quote present | feed {item_id,token,url,quote} rows to provenance-heal STEP SOURCE; rows lacking url or quote are notReady, never an error | fsi-app/scripts/maintenance/attach-found-sources.mjs | B1b:92
INV-004 | Every live row has format_type equal to specForItemType(item_type) | stamp format_type where NULL | fsi-app/scripts/maintenance/backfill-format-type.mjs | B1b:93
INV-005 | A pending canonical_source_candidates row is ruled approve, reject or defer by rule, never left pending; deferral caps at 3 wall attempts | polite fetch (1 req/s), wall/page-class/content-proof/authority checks; approve registers the source through the registry and repoints the item source_id and source_url; reject; defer up to WALL_MAX_ATTEMPTS=3 | fsi-app/scripts/maintenance/canonical-autoverify.mjs | B1b:94
INV-006 | Two verified non-archived items never share a canonical key; exactly one verified row survives per key | keep the single verified row, archive the rest with reason duplicate_of_verified and clear their key, identifier and source_url; refuse (no guess) when 0 or 2+ verified; clear a stray archive_reason on a live keeper | fsi-app/scripts/maintenance/canonical-key-dedup.mjs | B1b:95
INV-007 | A live regulation-family item on a static-text host has a capture of more than 200 characters | fetch through the free direct ladder (no paid render), fall back to CELEX txt and Cellar, insert an agent_run_searches row and one roadblock summary flag; honour SCRAPE_HOLD once per run; 1 req/s/host | fsi-app/scripts/maintenance/capture-static-primaries.mjs | B1b:96
INV-008 | A census_worklist would_mint row is on-vertical | archive reversibly rows the shared relevance screen calls off_vertical; park ambiguous rows | fsi-app/scripts/maintenance/census-off-vertical.mjs | B1b:97
INV-009 | No open flag remains from the acquire-primaries batch of 2026-07-16 (its writer is deleted) | resolve every open flag with that created_by | fsi-app/scripts/maintenance/close-acquire-primaries-holds.mjs | B1b:98
INV-010 | Flywheel gap and anticipate findings are born resolved (analyze-corpus); no open flywheel-gap or flywheel-anticipate flag lingers | drain open flywheel-gap:% and flywheel-anticipate:% flags with the shared reflection note | fsi-app/scripts/maintenance/close-coverage-reflections.mjs | B1b:99
INV-011 | A per-item gate-a-verifier-sweep flag is closed when the item is verified (superseded) or archived (moot) | resolve the flag; list still-quarantined ids (no code writes this family any more) | fsi-app/scripts/maintenance/close-flags-for-verified-items.mjs | B1b:100
INV-012 | Informational run-log flags and authorship-shard BLOCKER flags recorded for counsel do not stay open; legacy-remediation PARKED rows carry a deferral flag | resolve the allowlist of run-log flags; add a companion disposition_deferred flag for parked rows once (needs an existing-deferral check; a deferral date must never be asserted at module load) | fsi-app/scripts/maintenance/close-legal-confirmation-rows.mjs, fsi-app/scripts/maintenance/close-run-logs.mjs | B1b:101,102
INV-013 | A maintenance artifact reaches the git history of the dispatched ref | git add, commit, push with 2 retries; never push on master | fsi-app/scripts/maintenance/commit-worklist-artifact.sh | B1b:103
INV-014 | An obligation exists for every forward event and derivation is idempotent on forward_event_id | derive obligations from forward events through the guarded insert; optional object-candidate batch | fsi-app/scripts/maintenance/derive-obligations.mjs | B1b:104
NONE: enumerate-unclassified-hosts is a read-only report of provisional hosts no class rule places; it writes only files in the run out-dir and enforces nothing | fsi-app/scripts/maintenance/enumerate-unclassified-hosts.mjs | B1b:105
INV-015 | An approved staged_updates row is materialized or rejected with a reason, never left approved-unmaterialized; a staged update is transit-only | run each approved unmaterialized row through applyStagedUpdate; reject with a reason when it cannot materialize | fsi-app/scripts/maintenance/finish-staged-updates.mjs | B1b:106
INV-016 | A forward event's obligation_text is the output of the current extractor; section-backed duplicates and unique-index collision losers do not exist | re-run the pure extractor per item, rewrite obligation_text, delete duplicates and collision losers (guarded, snapshotted; FK cascade removes dependent obligations) | fsi-app/scripts/maintenance/forward-events-retext.mjs | B1b:107
INV-017 | Every item's item_gate_a_state.gate_a_version equals the current GATE_A_VERSION | rescan lagging items (limit 50 chained, default 500, refuse over 2000), touch the item to re-fire the provenance trigger | fsi-app/scripts/maintenance/gate-a-rescan.mjs | B1b:108
INV-018 | Each real organisation has one institution record and one base_tier across its own-domain sources; standards bodies sit at T4 when the class table agrees | merge mis-keyed hosting-domain institutions into the same-name real one (delete the duplicate); canonicalise base_tier to the own-domain rows; raise standards-body rows to T4 when classTierForHost agrees | fsi-app/scripts/maintenance/institution-canonicalize.mjs | B1b:109
INV-019 | A lineage-gap:absent-parent flag stays open only while the parent is not held | write a discovery-target artifact; resolve flags whose parents are now held | fsi-app/scripts/maintenance/lineage-gap-targets.mjs | B1b:110
INV-020 | Every non-tool item with a source has origin_class derived from item_type and source tier; tool and null-source rows stay NULL | stamp origin_class where NULL via originClassFor | fsi-app/scripts/maintenance/origin-class-backfill.mjs, fsi-app/scripts/maintenance/lib/origin-class-map.mjs | B1b:111,152
INV-021 | Quarantined items are planned for disposition with deferral candidates | run the planner, write plan.json and a harness_runs row; no item or flag write | fsi-app/scripts/maintenance/plan-quarantine-disposition.mjs | B1b:112
INV-022 | A quarantined or archived-unreasoned item is healed by capture, grounding, slot-fill, Gate A and re-derive, or stripped of the unprovable claim | heal-provenance selections quarantined-live, archived-unreasoned, ids, slots-backfill, kit-backfill, +strip-unprovable; time budget HEAL_TIME_BUDGET_SECONDS | fsi-app/scripts/maintenance/provenance-heal.mjs | B1b:113
INV-023 | sources.effective_tier equals the tier derived from citations, promotion and demotion, opinions and scored outcomes, clamped to plus or minus 1 of base_tier; a tier_override is never moved | plan and apply effective_tier movement via trust.ts, honouring emergency pause and cadence; override guard rechecked at write | fsi-app/scripts/maintenance/recompute-tiers.mjs | B1b:114
INV-024 | The six trust_score_* columns of every non-paused source equal planTrustScores | recompute; an emergency stop (global_processing_paused) fails closed | fsi-app/scripts/maintenance/recompute-trust-scores.mjs, fsi-app/scripts/maintenance/lib/emergency-pause.mjs | B1b:115,149
INV-025 | A verified record-grade item has more than its title as a FACT (551 hollow records were minted) | archive record_hollow items whose only FACT is the [title] claim, release key, identifier and source_url, return the census row to would_mint; series items exempt; restore from snapshot | fsi-app/scripts/maintenance/record-hollow-sweep.mjs | B1b:116
INV-026 | A capped fetch is retried before an item is left capped | spawn the refetch-capped worklist; apply refuses without the typed guard token | fsi-app/scripts/maintenance/refetch-capped.mjs | B1b:117
INV-027 | Quarantined items get a cheap-verify regeneration pass at zero cost | wrap runResolver (cheap-verify plus snapshot) | fsi-app/scripts/maintenance/regen-quarantined.mjs | B1b:118
NONE: remediate-orphan-sources was a wrapper whose upstream scripts/verify/remediate-orphan-sources.mjs was deleted 2026-10-11; the orphan-host rule is carried by the resolve-cited-host-gate line | fsi-app/scripts/maintenance/remediate-orphan-sources.mjs | B1b:119
INV-028 | A census row held by validation is reopened only for a stated reason | wrap mint reopen-validation-holds; --arg reason-contains required, blank refused | fsi-app/scripts/maintenance/reopen-validation-holds.mjs | B1b:120
NONE: repair-smoke-account was a single-use creation of a profiles row and one member org_memberships row for the smoke account; it refuses platform admins and accounts with any membership | fsi-app/scripts/maintenance/repair-smoke-account.mjs | B1b:121
INV-029 | An orphaned cited host is registered through the class table, never left | resolve cited-host-gate flags: register each cited host at the class-table tier through registerSource, else route to the null-tier-host worklist; resolve a flag only when at least one URL was extracted | fsi-app/scripts/maintenance/resolve-cited-host-gate.mjs, fsi-app/scripts/maintenance/lib/flag-url-extract.mjs | B1b:122,151
INV-030 | An error-body capture is replaced by a real capture | resolve error-body-gate flags: re-fetch free (captureCitedUrl) and store a capture, else append to the attach-found-sources seed; honour SCRAPE_HOLD | fsi-app/scripts/maintenance/resolve-error-body-gate.mjs | B1b:123
INV-031 | A provisional source resolves by the SC-13 rules and none stays pending | promote by existing institution (a), class table (b), committed host verdict (b2), else the null-tier-host worklist (d); export unplaced hosts | fsi-app/scripts/maintenance/resolve-provisional-sources.mjs, fsi-app/scripts/maintenance/enumerate-unclassified-hosts.mjs | B1b:124,105
INV-032 | A host verdict batch maps a host to a class in the HOST_CLASS_TIER set; the later batch wins and rejection of one entry never throws | load host-verdicts-NNN.json into one Map; reject entries per entry | fsi-app/scripts/maintenance/host-verdicts/load-host-verdicts.mjs, fsi-app/scripts/maintenance/host-verdicts/schema.json | B1b:154,156
INV-033 | A refetch-capped hold clears only when every FACT span is verbatim in some stored capture | check each FACT span against ALL stored captures; supersede unmatched claims through claim_versions; resolve flags | fsi-app/scripts/maintenance/resolve-refetch-holds.mjs | B1b:125
INV-034 | Every open flywheel-signal flag is resolved and decisive edges are written | write decisive item_cross_references edges, resolve open flywheel-signal:* flags, insert new ones already resolved; de-dup status-agnostic | fsi-app/scripts/maintenance/resolve-signals.mjs | B1b:126
INV-035 | A CELEX Decision item is typed regulation not initiative, with its three slots written as FACT-or-GAP claims before the type changes | insert claims first, then update type, format and title, then queue the flywheel (the hand-off must pass the db client) | fsi-app/scripts/maintenance/retype-eu-decisions.mjs | B1b:127
INV-036 | Coverage-gap and portal-link candidate queues are decided by rule | decide coverage_gap_candidates and portal_link_candidates by rule or a committed ruling file via scripts/review; build review digests | fsi-app/scripts/maintenance/review-apply-coverage-gaps.mjs, fsi-app/scripts/maintenance/review-apply-portal-links.mjs, fsi-app/scripts/maintenance/review-digests.mjs | B1b:128,129,130
INV-037 | docs/inventories/db-check-constraints.json equals the live CHECK constraint vocabulary | read pg_constraint over direct Postgres and rewrite the inventory (compared by check-vocabulary-drift) | fsi-app/scripts/maintenance/schema-vocabulary-inventory.mjs, fsi-app/scripts/maintenance/lib/vocab-inventory.mjs | B1b:131,153
INV-038 | Every live corridor has a corridor entity and an entity_scope row | seed corridor entities, then write entity_scope for every live corridor | fsi-app/scripts/maintenance/seed-corridors.mjs | B1b:132
INV-039 | sources.source_role is current and active-only where required | planAndApply role cleanup (raw SQL today; must be a guarded write) | fsi-app/scripts/maintenance/source-role-cleanup.mjs | B1b:133
INV-040 | sources.source_type is non-NULL | stamp source_type where NULL via backfill-source-type | fsi-app/scripts/maintenance/source-type-backfill.mjs | B1b:134
INV-041 | Every untagged item has a tag proposal and every open flywheel-tag flag is decided by rule | write flywheel-tag: proposal flags via proposeTags and resolve stale ones; autoAdoptTags does a merge-only tag write after re-checking keyword evidence, then resolves | fsi-app/scripts/maintenance/tag-proposals.mjs, fsi-app/scripts/maintenance/tag-ratification.mjs | B1b:135,136
INV-042 | A source whose class-table tier differs from base_tier has a recorded host_class_table opinion, and these opinions never move a tier | append a source_tier_opinions row; the only reader is the admin disagreement RPC | fsi-app/scripts/maintenance/tier-opinions.mjs | B1b:137
INV-043 | Every live item has a timeline row | derive item_timelines through an 8-step waterfall (last two are captured-date and created_at fallbacks), write changelog rows, one resolved flag for the undateable | fsi-app/scripts/maintenance/timeline-backfill.mjs | B1b:138
INV-044 | instrument_identifier series codes match the item's legislation.gov.uk URL | rewrite the code (uksi to wsi etc.) with compare-and-set on the old identifier | fsi-app/scripts/maintenance/uk-series-code-reconcile.mjs | B1b:139
NONE: w1-dispositions parses a plan doc into WIRE/DELETE/HOLD/KEEP lists, writes nothing and feeds no stage | fsi-app/scripts/maintenance/w1-dispositions.mjs (absent at the CLEAN-3 base) | B1b:140
NONE: write-run-artifact folds step summaries into a harness-runs file; the live record is the harness_runs table | fsi-app/scripts/maintenance/write-run-artifact.mjs | B1b:141
NONE: maintenance lib bootstrap (cli.mjs, consolidate-attach-worklist, extract-worklist-seed) is plumbing for one-off steps | fsi-app/scripts/maintenance/lib/cli.mjs, fsi-app/scripts/maintenance/lib/consolidate-attach-worklist.mjs, fsi-app/scripts/maintenance/lib/extract-worklist-seed.mjs | B1b:147,148,150
INV-045 | A market series write is followed in the same run by its derivation edges, fail-closed | after a producer write author derivation_edges for the 1-week delta of each touched series; assert edges authored | fsi-app/scripts/producers/market/author-market-series-delta.mjs | B1b:167
INV-046 | A producer writes a figure only after grounding, source rating by class and three gates, and checks a kill switch first | plan rows against existing rows, gate, then guarded write; ENABLED flag and runtime env gate | fsi-app/scripts/producers/market/ecb-fx-producer.mjs, fsi-app/scripts/producers/market/eia-v2-petroleum-spot-producer.mjs, fsi-app/scripts/producers/market/eu-weekly-oil-bulletin.mjs, fsi-app/scripts/producers/regional/run-envelope-producer.mjs | B1b:170,171,172,191
INV-047 | Published price statistics rows derive only from ratified series items | upsert published_price_statistics from series-item-map entries with status ratified | fsi-app/scripts/producers/market/refresh-published-price-statistics.mjs, fsi-app/scripts/producers/market/ratify-series-items.mjs | B1b:175,176
NONE: the remaining producers (sbti, carrier-ets, state-cost, eea-hdv, ukpn, regional, research-assessment) are feature runtimes and are kept by CLEAN-3; their gates (licence refusal of --apply, ENABLED=false) are runtime behaviour | fsi-app/scripts/producers/ | B1b:177,180,185,187
INV-048 | A script reads that may fail only because a migration is unapplied report absent, never crash | readTolerant/isAbsentError treat a missing-relation error as absent | fsi-app/scripts/lib/absent-tolerant.mjs | B2p1:10
INV-049 | A script's database layer cannot write through a read client and every guarded write cites its reason and snapshots the prior state | readClient is a Proxy whose write methods (including schema()) throw; guardedUpdate/UpdateByIds/Delete(protected tables)/Insert/InsertMany/Upsert require a cite and snapshot to scripts/_snapshots; readAll paginates in primary-key order from the committed table-primary-keys map; registerSource stamps source_role at birth | fsi-app/scripts/lib/db.mjs, fsi-app/scripts/lib/table-primary-keys.mjs | B2p1:26,77
INV-050 | The JS canonical-key derivation equals migration 255 derive_canonical_instrument_key | one JS mirror (deriveKey) pinned to migration 255 vectors | fsi-app/scripts/lib/canonical-key.mjs, fsi-app/scripts/lib/canonical-key.selftest.mjs | B2p1:17,18
INV-051 | While scrape_cadence is off, any chained, workflow_run or push-to-master firing is dry | read system_state by raw REST, fail closed, print KEY=VALUE for the runner env | fsi-app/scripts/lib/chained-dry-guard.mjs | B2p1:20,21
INV-052 | item_changelog has one write site and is idempotent per item, field and batch | recordItemChange through an adapter client, dry default | fsi-app/scripts/lib/changelog.mjs | B2p1:22
INV-053 | A deferral is valid only with reason of at least 30 characters including a disposition keyword, a future date, an owner and a resolution_event | isValidDeferral/assertValidDeferral/isValidRenewal/sameBlockerReason; a renewal that repackages the same blocker is rejected | fsi-app/scripts/lib/deferral.mjs, fsi-app/scripts/lib/deferral.selftest.mjs | B2p1:28,29
INV-054 | An open integrity_flag older than the dwell bound is exempt only when RD-28-held, deferred, standing debt or on a quarantined item (the lib constant DWELL_BOUND_DAYS is 30; the audit CLI description says 14 days: the two disagree and the rebuild must pick one) | classify flag age with DWELL_BOUND_DAYS and the exemptions; the audit exits 1 on a non-exempt breach | fsi-app/scripts/lib/flag-age.mjs, fsi-app/scripts/lib/flag-age.selftest.mjs, fsi-app/scripts/verify/flag-age-audit.mjs | B2p1:42,43; B2p3:44
INV-055 | A quarantined item has an open investigation flag and none sits undispositioned past 14 days (a standing deferral is fine) | computeQuarantineDwell classifies enqueueMissing, undispositioned, deferred, withinBound with DWELL_BOUND_DAYS=14 | fsi-app/scripts/lib/quarantine-dwell.mjs, fsi-app/scripts/verify/quarantine-disposition-audit.mjs | B2p1:63; B2p3:85
INV-056 | A FACT claim failing the authority floor is re-homed to a held primary capture only when it is verbatim and tier-sufficient, the source is a primary instrument class and the capture is not an error body | freeReattributeDecision with three gates | fsi-app/scripts/lib/free-pass.mjs | B2p1:44
INV-057 | item_gate_a_state has exactly one writer | readGateAStateRow/upsertGateAState through guarded functions | fsi-app/scripts/lib/gate-a-state-writer.mjs | B2p1:46
INV-058 | A harness run id is unique and equals harness_runs max+1 at landing | renumber against harness_runs max+1, retry on unique violation, rename the artifact to the landed id; exit 1 on failure or on no creds in Actions | fsi-app/scripts/lib/record-harness-run.mjs, fsi-app/scripts/lib/harness-run-number.mjs | B2p1:48,69
INV-059 | A loop_run_id is trusted only when well-formed and its artifact resolves in the committed harness ledger export | resolveHarnessRunContext with ledger-verified trust and FAMILY_BY_WORKFLOW_NAME | fsi-app/scripts/lib/loop-run-id.mjs, fsi-app/scripts/lib/upstream-artifact.mjs | B2p1:57,80
INV-060 | A run artifact validates against the run schema (including the no-op contract), stamps trigger, upstream_run_id, github_run_id and governing_hash, and claims its run id atomically | validateRunArtifact, writeRunArtifact, claimRunId (mkdir-atomic), hashHarnessVersion | fsi-app/scripts/lib/run-artifact.mjs | B2p1:73
INV-061 | Every registry identity decision uses one institution-key rule | hostOf, SHARED_PORTAL_KEYDEPTH, institutionKey, sameInstitution (db.mjs re-exports) | fsi-app/scripts/lib/institution-key.mjs | B2p1:52
INV-062 | A candidate source is resolved, then rated through the institution class table, never hand-typed | makeResolveSource factory loads committed host verdicts and rates by class | fsi-app/scripts/lib/rate-source-by-class.mjs | B2p1:66
INV-063 | A per-item mutation lease is acquired before a re-grounding write and released after | acquire/heartbeat/release/withLease RPC wrappers (migration 211) | fsi-app/scripts/lib/mutation-lease.mjs, fsi-app/scripts/_reground/lease.mjs | B2p1:59; B2p4:13
INV-064 | A script that loads credentials loads them only through the one env-file loader, and a no-credential run self-skips with exit 2 | loadLocalEnvFile (FSI_NO_ENV_FILE switch), withoutCredentials, CREDENTIAL_VARS; bare process.loadEnvFile refused | fsi-app/scripts/lib/env-file.mjs | B2p1:35
INV-065 | A pure drift engine can tell IMPLEMENTED, DRIFTED or UNCONFIRMABLE for an intent predicate over source AST | AST predicates (calls, noRawSourceFetch) via lazy typescript; surface-class registry of 7 classes | fsi-app/scripts/lib/drift-check.mjs, fsi-app/scripts/lib/surface-registry.mjs, fsi-app/scripts/lib/verify.mjs | B2p1:30,75,83
INV-066 | A fetch failure is never read as a negative answer (non-answer must not resolve to a definitive answer) | lexicon probe over a 14-line window; forms: fetch-negative, classify default, error-body, orchestration; reports candidates, not verdicts | fsi-app/scripts/lib/fetch-negative-probe.mjs, fsi-app/scripts/lib/inconclusive-probe.mjs | B2p1:40,50
INV-067 | Admin JSX contains no human-gate phrase outside the ruled allowlist (emergency stop, SC-3 override, community) | scan src/components/admin/profile with FORBIDDEN vs ALLOWLIST regexes (soft, exit 0) | fsi-app/scripts/lib/admin-phrase-scan.mjs, fsi-app/scripts/verify/admin-phrase-scan.mjs | B2p1:11; B2p3:11
INV-068 | A migration can be replayed from an empty database in production ledger order, one transaction per file, stopping at the first error with no tolerate list | classes apply/satisfied/skip from the production ledger, APPLIED-MAP.json and files on disk; psql one-file-one-txn; loopback-only guard; migration 299 excluded; ensure supabase_migrations ledger table | fsi-app/scripts/proof/applied-map.mjs, fsi-app/scripts/proof/replay-migrations.mjs, fsi-app/scripts/proof/apply-pending-migrations.mjs | B2p2:10,12,52
INV-069 | The replayed schema equals the production schema (tables, columns, constraints, indexes, functions, triggers, policies, grants) | dump production schema only (refuse data and roles), apply to an oracle cluster as supabase_admin with ON_ERROR_STOP, diff the catalogs with search_path pinned; default ACLs compared to the dump | fsi-app/scripts/proof/schema-diff.mjs, fsi-app/scripts/proof/apply-schema-dump.mjs, fsi-app/scripts/proof/dump-production-schema.mjs, fsi-app/scripts/proof/create-oracle-db.mjs | B2p2:14,31,34,58
INV-070 | Every role a replayed migration creates exists on both the stack and the oracle; zero CREATE ROLE found is a failure, not a pass | role check, non-vacuous | fsi-app/scripts/proof/chain-role-check.mjs, fsi-app/scripts/proof/dump-roles.mjs | B2p2:29,36
INV-071 | A local proof stack is isolated from production | refuse forbidden credential names, non-loopback URL vars, production host markers; require CHAIN_PROOF_LOCAL=1 and service key equal to the proof key | fsi-app/scripts/proof/preflight.mjs, fsi-app/scripts/proof/write-local-env.mjs, fsi-app/scripts/verify/attacks/attack-cli.mjs | B2p2:50,75; B2p3:12
INV-072 | An attack suite is non-vacuous: an empty suite or a script attack exiting 0 on SKIP is red, and every SQL attack rolls back and never records database values | savepoint steps under impersonated roles (owner, service, anon, user:key), always ROLLBACK; script attacks require verdict lines; 44 attacks (37 sql, 5 script, 1 sql-block, 1 tier-override) | fsi-app/scripts/proof/attacks/attack-engine.mjs, fsi-app/scripts/proof/attacks/run-attacks.mjs, fsi-app/scripts/proof/attacks/script-attack.mjs, fsi-app/scripts/proof/attacks/attacks.json | B2p2:16,19,22,24
INV-073 | An automatic tier writer never writes over an admin tier_override | run the real recompute-tiers apply on a local stack over a control source and an overridden source; the override must hold; restore the snapshot | fsi-app/scripts/proof/attacks/tier-override-attack.mjs | B2p2:26
INV-074 | The chain steps run in hop order in apply mode with a read-back assertion per step, and every hop is covered by a step | verifySchemaNames EXPLAINs every manifest statement; assertions count, max, growth, any_of, snapshot_changed; 22 steps and 16 hops validated against the loop-hops registry | fsi-app/scripts/proof/steps/run-chain-steps.mjs, fsi-app/scripts/proof/steps/manifest.mjs, fsi-app/scripts/proof/steps/assertions.mjs, fsi-app/scripts/proof/steps/chain-steps.json | B2p2:60,62,64,68
INV-075 | Every public table denies the wrong persona: RLS matrix over every public table, 4 personas and 5 commands in a rolled-back transaction, with coverage, truncate and probe invariants | views are security_invoker with read and write denied; system-only SECURITY DEFINER writers are not executable by anon | fsi-app/scripts/verify/attacks/rls-persona-matrix.mjs, fsi-app/scripts/verify/attacks/rls-persona-attacks.mjs, fsi-app/scripts/verify/attacks/rls-view-function-attacks.mjs | B2p3:17,18,20
INV-076 | Every API route method answers each persona (anon, viewer, other-org, member, admin) as the route guard register states | one request per route method per persona against a local next start; invariants COVERAGE, TOKENS, ANON, ADMIN, WORKER, WRITES, PAGE | fsi-app/scripts/verify/attacks/routes-attacked.mjs, fsi-app/scripts/verify/fixtures/route-personas.mjs | B2p3:22,43
INV-077 | Audit findings carry a status token and open audit findings carry a disposition | scan docs/audits, session-log.d and register files for [CONFIRMED]/[HYPOTHESIS]/[REFUTED] and dispositions; strict exit 1 on unlabeled finding | fsi-app/scripts/verify/audit-finding-status.mjs | B2p3:24
INV-078 | No portal_link_candidates row stays status=candidate beyond 14 days unless named in a committed verdict batch | exit 1 on breach, 2 on read failure | fsi-app/scripts/verify/candidate-dwell-audit.mjs (absent at the CLEAN-3 base) | B2p3:26
INV-079 | Live CHECK-constraint allowed sets equal the tracked docs/inventories/db-check-constraints.json | diffVocabulary(live, tracked); exit 2 without creds before importing pg | fsi-app/scripts/verify/check-vocabulary-drift.mjs, fsi-app/scripts/verify/lib/vocab-drift.mjs | B2p3:30,62
INV-080 | A FACT claim's source_tier_at_grounding equals the tier derived from its source COALESCE(tier_override, base_tier); non-FACT stamps are NULL | SC-7 compare every claim stamp to the derived tier (JS cross-check also in ledger-onepass); exit 1 on mismatch | fsi-app/scripts/verify/claims-tier-audit.mjs, fsi-app/scripts/verify/ledger-onepass-audit.mjs | B2p3:32,50
INV-081 | A verified item has no HIGH FACT below the per-type tier floor unless the claim tier is recorded (migration 302) | per-type floor copy of migration 141 checked in a JS cross-check of the SQL gate | fsi-app/scripts/verify/ledger-onepass-audit.mjs | B2p3:50
INV-082 | FACT claims are not conflated (S-CONFLATE) or numerically inconsistent (S-NUMERIC) | heuristic triage over FACT claims, read-only, default since 24 hours | fsi-app/scripts/verify/defect-signature-scan.mjs | B2p3:34
INV-083 | A disposition_deferred flag is never expired-open, never on a deleted subject, and never a renewal that merely repackages the blocker | read-only scan; exit 1 | fsi-app/scripts/verify/deferral-hygiene-audit.mjs | B2p3:35
INV-084 | RLS on derivation_edges, harness_runs and auxiliary_energy_profiles denies anon and cross-org reads while service role sees the row | rolled-back adversarial probes (shared probe primitives); spec09 audit needs two live orgs with members | fsi-app/scripts/verify/derivation-edges-rls-adversarial-audit.mjs, fsi-app/scripts/verify/harness-runs-rls-adversarial-audit.mjs, fsi-app/scripts/verify/spec09-org-rls-adversarial-audit.mjs, fsi-app/scripts/verify/lib/rls-adversarial-probe.mjs | B2p3:36,47,95,57
INV-085 | The migration 240 data-audit block guard and the migration 201 pause-flag writer guard reject unmarked writes and accept marked ones | temp-table triggers in a rolled-back transaction: GREEN-1..3 and RED-1..3 (240); RED unmarked bounce and GREEN marked succeed (201) | fsi-app/scripts/verify/layer-c-insert-gate-proof.mjs, fsi-app/scripts/verify/pause-flag-guard-proof.mjs | B2p3:49,80
INV-086 | Provenance binding (migration 250) cannot be forged by a GUC, a direct write, an ON CONFLICT path or a derivation path | adversarial probes A forged GUC, B direct, C on-conflict, D restrictive allowed, E derivation path, each rolled back; prints GREEN verdict lines | fsi-app/scripts/verify/prov-guard-adversarial-audit.mjs | B2p3:84
INV-087 | FACTs grounded to suspended sources do not exceed the committed baseline | trend monitor against _baselines/facts-on-suspended.json | fsi-app/scripts/verify/no-generic-source-audit.mjs, fsi-app/scripts/verify/_baselines/facts-on-suspended.json | B2p3:75,10
INV-088 | Every institution host has one base_tier unless a tier_override is set (SC-6) | resolve via institution.ts; exit 1 on violation | fsi-app/scripts/verify/one-tier-per-host-audit.mjs | B2p3:77
INV-089 | Every archived source-y item has a registered active source host | source-registration invariant, orphan-source audit | fsi-app/scripts/verify/orphan-source-audit.mjs | B2p3:78
INV-090 | The migration ledger, repo files and APPLIED-MAP.json agree, and every object created outside the ledger exists in the live catalog unless a later file ends it | about 12 failure codes; production schema_migrations vs files vs map; per-entry diff class (identical, comments-only, code-differs) | fsi-app/scripts/verify/migration-history-audit.mjs, fsi-app/scripts/verify/migration-history-diff.mjs, fsi-app/scripts/verify/migration-history-objects.mjs, fsi-app/scripts/migrations/migration-compare.mjs, fsi-app/scripts/migrations/build-applied-map.mjs | B2p3:66,68,70; B2p4:94,98
INV-091 | Every live public table, view and materialized view has a committed CREATE in the migrations | compare live objects to migration-created objects; allowlist empty | fsi-app/scripts/verify/schema-drift-audit.mjs, fsi-app/scripts/verify/lib/schema-drift.mjs | B2p3:91,58
INV-092 | Stored full_brief bodies carry no internal section markers | scan against src/lib/agent/section-markers.mjs pattern list | fsi-app/scripts/verify/section-marker-audit.mjs | B2p3:92
INV-093 | No live intelligence_item is source-less beyond the grandfathered list | source-link audit | fsi-app/scripts/verify/source-link-audit.mjs | B2p3:94
INV-094 | Stored provenance_status agrees with validate_item_provenance() in both directions | rpc per item, serial | fsi-app/scripts/verify/substrate-agreement-audit.mjs | B2p3:97
INV-095 | Every UI .select column has a writer somewhere (no field-grain UI orphan) | scan select columns against writers with an allowlist; opaque writes suppress | fsi-app/scripts/verify/ui-orphan-audit.mjs, fsi-app/scripts/verify/lib/ui-orphan-scan.mjs, fsi-app/scripts/verify/ui-orphan-allowlist.json, fsi-app/scripts/verify/lib/dead-column-scan.mjs | B2p3:103,60,102,51
INV-096 | Spec 00 coherence: refs resolve, ids intact, identifiers valid, merges preserve links, origin class weakest, links typed and reciprocal, hierarchy, alias provenance | 17 assertions plus H1 and H2; 7 run live, 12 skip with a kind and reason; fixture mode without creds | fsi-app/scripts/verify/surface-acceptance.mjs | B2p3:98
INV-097 | Each store is built and filled | population report lists store row counts (market_series, emission_factors, regional_data_facts, state_cost_facts, published_price_statistics, theme_briefs, item_timelines, item_forward_events, entity_refs, format_type) and queues (briefs pending, open flags by family, fetch-drain queue, ledger-consume owed); --strict fails unfilled | fsi-app/scripts/verify/population-report.mjs, fsi-app/scripts/verify/verification-audit-report.mjs | B2p3:81,105
INV-098 | Every harness family has recorded dispatch evidence or a workflow history | walk family.json files for artifacts, harness_runs rows and gh run history; verdict ARTIFACT_RECORDED, WORKFLOW_RUN_HISTORY_ONLY, NO_EVIDENCE_FOUND, EVIDENCE_UNAVAILABLE | fsi-app/scripts/verify/harness-family-schedule-walker-audit.mjs, fsi-app/scripts/verify/lib/harness-family-walk-scan.mjs, fsi-app/scripts/verify/harness-family-walk-allowlist.json | B2p3:45,54,46
INV-099 | Every loop-fired evidence entry matches a real harness_runs row; a forged or stale entry fails | attack on loop-fired-evidence.json; empty passes without DB | fsi-app/scripts/verify/loop-fired-evidence-audit.mjs (absent at the CLEAN-3 base) | B2p3:64
INV-100 | Every data audit and every golden runs as its own process and a run that passes nothing fails | derive audits from // data-audit: markers (hard or soft; block rows reflected to integrity_flags unless --read-only); goldens run PASS, SKIP with reason or FAIL | fsi-app/scripts/verify/run-data-audit-lane.mjs, fsi-app/scripts/verify/run-goldens.mjs | B2p3:87,89
NONE: shared information_schema read helper and the retired duplicate-table schema snapshot fixture are plumbing for deleted audits | fsi-app/scripts/verify/lib/information-schema-scan.mjs, fsi-app/scripts/verify/lib/fixtures/duplicate-table-schema-snapshot.json | B2p3:56,53
NONE: forbid-fires-attack and the F9 real-project attack prove the design-audit selectors and the type-error fitness function fire; carried as property lines in the protected-properties file | fsi-app/scripts/verify/attacks/forbid-fires-attack.mjs, fsi-app/scripts/verify/attacks/f9-real-project-attack.mjs | B2p3:13,15
INV-101 | A re-grounding write stamps a canonical instrument_identifier only after the target matches and under a mutation lease; archived items are deleted only after a tombstone to disposition_ledger, under a lease, with a bucket allowlist and census gate | verifyTargetMatch before id-stamp; tombstone then guardedDelete | fsi-app/scripts/_reground/id-stamp.mjs, fsi-app/scripts/_reground/tombstone-delete.mjs, fsi-app/scripts/_reground/target-match-probe.mjs | B2p4:12,15,14
NONE: _reground executor-ground and free-pass-run are operator-run CLIs (kept as feature runtimes by the brief only where imported); the free-pass decision is carried by the free-pass line | fsi-app/scripts/_reground/executor-ground.mjs, fsi-app/scripts/_reground/free-pass-run.mjs | B2p4:10,11
NONE: _ruling/null-tier-host-ruling.mjs is a data-only export ruling (57 hosts to class tier) whose rule is carried by the cited-host line | fsi-app/scripts/_ruling/null-tier-host-ruling.mjs | B2p4:16
NONE: _worklists files are seed data and machine evidence for attach-found-sources and a provenance-heal summary | fsi-app/scripts/_worklists/ | B2p4:17,18,19,20,21,22,23
INV-102 | Every live brief conforms to the skill structure (7 code-checkable conformance checks) | soft data audit; --apply writes integrity_flags via guarded paths | fsi-app/scripts/audit-skill-conformance.mjs | B2p4:25
INV-103 | Every item has item_timelines parsed from its stored section 14 timeline in all 5 formats | guarded delete and insert, dry default; pure resolveTimelineEntriesForItem exported | fsi-app/scripts/backfill-item-timelines.mjs | B2p4:26
INV-104 | Source classification proposals, tag proposals and term needs are derived by rule and every flag is born resolved when nothing is derivable | classification adopt/propose with drift auto-resolve and anomaly retire; tag proposals dedup via planReflect; term-need flags for adopted vocabulary terms with no authoritative holding and non-CELEX absent lineage parents | fsi-app/scripts/classification/apply-classifications.mjs, fsi-app/scripts/classification/propose-classifications.mjs, fsi-app/scripts/connections/propose-tags.mjs, fsi-app/scripts/connections/apply-tags.mjs, fsi-app/scripts/connections/raise-term-needs.mjs | B2p4:28,30,34,40,42
INV-105 | A term mentioned repeatedly without being held is adopted by rule at the trust.ts threshold and at least 2 sources | count mentions across 4 detectors, write vocabulary_terms and mentions; refuse apply before migration 355 | fsi-app/scripts/connections/term-recurrence.mjs | B2p4:46
NONE: connections/analyze-corpus, discover-for-items, generate-theme-brief and ratify-flag-to-census are feature runtimes kept by CLEAN-3 | fsi-app/scripts/connections/ | B2p4:32,36,38,44
INV-106 | The judgement drain reads its kill switches before doing anything and fails closed | STEP 0 reads judgement_drain, global_processing_paused and open fleet-budget-halt flag; leases items; finish releases leases | fsi-app/scripts/drain/switch.mjs, fsi-app/scripts/drain/plan-drain.mjs | B2p4:58,54
INV-107 | The entity spine exists for every instrument, jurisdiction and organisation in the live corpus with deterministic ids, and historical emission_factors and market_series rows have derivation edges | backfill entities and FK columns, typed lineage edges and lineage-gap flags, derivation edges via the producers' own author functions; dry default | fsi-app/scripts/entities/backfill-entities.mjs, fsi-app/scripts/entities/backfill-lineage-edges.mjs, fsi-app/scripts/entities/backfill-derivation-edges.mjs | B2p4:62,64,60
INV-108 | Every live item has forward events extracted and compliance_deadline synced | extract for live items with zero item_forward_events rows, dry default, resumable | fsi-app/scripts/forward-events/dispatch-extraction.mjs | B2p4:71
INV-109 | emission_factors rows are unique on their natural key, licence-gated and append-only; market_series obeys its CHECKs; assumption_register holds the catalogued assumptions | seed with natural-key idempotency (validateFactor), pending needs_runner_fetch rows filtered; assumptions seeded by diff; migration 258 and 268 behaviour proofs | fsi-app/scripts/gen/emission-factors-common.mjs, fsi-app/scripts/gen/emission-factors-desnz.mjs, fsi-app/scripts/gen/emission-factors-epa.mjs, fsi-app/scripts/gen/assumption-register-common.mjs, fsi-app/scripts/gen/assumption-register-seed.mjs, fsi-app/scripts/gen/migration-258-behaviour.sql, fsi-app/scripts/gen/migration-268-behaviour.sql | B2p4:74,76,77,79,81,87,88
INV-110 | The Gate A honesty gauge is readable and its alarm count is zero | probe /api/health/surfaces JSON; exit 1 on unreadable gauge or alarm above 0 | fsi-app/scripts/health/gate-a-probe.mjs | B2p4:89
INV-111 | Every stored capture is classified for completeness, sufficiency and staleness (holdings quality) | classify captures, write holdings_quality once with --write | fsi-app/scripts/holdings-audit.mjs | B2p4:90
INV-112 | The migrations inventory table is derived from each migration's -- subject: line | derive docs/inventories/migrations.md, omit unlisted never-applied files | fsi-app/scripts/inventories/generate-migrations-inventory.mjs | B2p4:91
INV-113 | market_series.entity_id is stamped from the producer registry through the definer RPC | backfill_market_series_entity; dry default | fsi-app/scripts/migrations/data/backfill-market-series-entity.mjs | B2p4:96
INV-114 | Every live-quarantined item has a planned disposition (within_bound, already_deferred, enqueue_missing, deferral_candidate with a named reason class) | cheap-verify resolver plus dwell classification; writes a harness artifact and a harness_runs row; apply writes plan.json for apply-deferrals | fsi-app/scripts/plan-quarantine-disposition.mjs, fsi-app/scripts/regen-quarantined.mjs | B2p4:101,113
INV-115 | Statutory computations are written only from validated rows files and gated by admissibility | validateRowsFile exit 0/1/2; write-statutory is a designed no-op while the rows file is absent; harness artifact family statutory | fsi-app/scripts/propagation/write-statutory.mjs, fsi-app/scripts/propagation/validate-statutory-rows-file.mjs, fsi-app/scripts/propagation/resolve-statutory-rows-file.mjs, fsi-app/scripts/propagation/seed-derived-values.mjs | B2p4:111,109,105,107
INV-116 | Legacy capped pool rows are re-fetched with a diff-on-recapture guard (ADR-016 storage-side uncap) | build the worklist by result_chars class, execute re-fetch through the live ladder; expected divergence report | fsi-app/scripts/remediation/refetch-capped-worklist.mjs | B2p4:114
INV-117 | A review queue is decided by rule with a validated, non-stale ruling and residue decision, no human | applySimpleQueue validates the ruling, stale-checks, guardedUpdateByIds; coverage gaps grouped by class x priority; portal links grouped by host x pattern with drop -> rejected | fsi-app/scripts/review/apply-coverage-gaps.mjs, fsi-app/scripts/review/apply-portal-links.mjs, fsi-app/scripts/review/build-review-digests.mjs, fsi-app/scripts/review/lib/apply-core.mjs, fsi-app/scripts/review/lib/coverage-gaps.mjs, fsi-app/scripts/review/lib/digest-core.mjs, fsi-app/scripts/review/lib/portal-links.mjs, fsi-app/scripts/review/lib/rule-ruling.mjs, fsi-app/scripts/review/lib/ruling.mjs | B2p4:116,118,120,122,124,126,128,130,132
INV-118 | sources.source_role is classified by the deterministic classifySourceRole | re-run over sources, propose and apply fixes via direct pg with --execute --confirm | fsi-app/scripts/source-role-cleanup.mjs | B2p4:134
INV-119 | sources.source_type is backfilled once and never overwritten | classifySourceType where source_type IS NULL (migration 288) | fsi-app/scripts/sources/backfill-source-type.mjs | B2p4:136
INV-120 | A suspended source is re-probed by the acquisition ladder (reprobe, bounded alternative search, same-floor qualify) and its fetch_status updated | concurrency at most 4, per-host 1 s, time budget; dossiers and a harness artifact | fsi-app/scripts/sources/inaccessible-triage.mjs | B2p4:138
INV-121 | Operator-supplied and cited rows for the five spec09 tables are validated against a column contract, citations are required and rated via classTierForHost, and a missing rows file records a gap, never an invented row | parseOperatorRows, requireCitation, registerCitedSource, resolveEntityByName; one guardedInsertMany per row | fsi-app/scripts/spec09/lib/operator-rows-contract.mjs, fsi-app/scripts/spec09/lib/rows-file.mjs, fsi-app/scripts/spec09/lib/cli-csv-args.mjs | B2p4:151,153,150
NONE: one-shot SQL and doc files (flag-fabricated-items.sql, d3-runs.ddl.sql, forward-events DRY-RUN-REPORT, coordinator/lane-gate-cloud.sh, measure-bundles.mjs) enforce nothing about data | fsi-app/scripts/flag-fabricated-items.sql, fsi-app/scripts/d3-runs.ddl.sql, fsi-app/scripts/forward-events/DRY-RUN-REPORT.md, fsi-app/scripts/coordinator/lane-gate-cloud.sh, fsi-app/scripts/measure-bundles.mjs | B2p4:69,50,70,49,93
INV-122 | A production proof subset is FK-closed and checksum-verified before it is loaded, and loads only into a loopback stack | export a read-only FK-closed subset (40 verified items pinned and spread by surface and grade; closure from information_schema; verifyNoOrphans; counts only printed); load with sha256 check in one transaction under session_replication_role=replica, counts verified, requires empty harness_runs, switches only through admin_set_pause_state and admin_set_judgement_drain | fsi-app/scripts/proof/export-subset.mjs, fsi-app/scripts/proof/load-subset.mjs, fsi-app/scripts/proof/export-local-harness-runs.mjs | B2p2:42,45,40
INV-123 | The applied-migration inventory normalises the production list_migrations export and is the one reader replay and apply-pending use | parseAppliedInventory reads docs/inventories/applied-migrations.json written by the hand step | fsi-app/scripts/proof/sync-applied-migrations.mjs | B2p2:72
INV-124 | DESNZ freight factors are filled into fixture shells only after structural verification of the downloaded workbook | zero-dependency zip/OOXML read, 7 freight-goods air and sea rows, exit 2 on structural failure and 3 on network failure | fsi-app/scripts/gen/fetch-desnz-factors.mjs | B2p4:82
NONE: chain-proof plumbing (artifact emitter, lane-step runner, memory helper, prompt-version reader, step prepare hooks, verdict fixture, attack fixture users, persona fixtures, eager-pg-import negative control) enforces no property of its own | fsi-app/scripts/proof/emit-chain-proof-artifact.mjs, fsi-app/scripts/proof/run-lane-step.mjs, fsi-app/scripts/proof/mem.mjs, fsi-app/scripts/proof/steps/live-prompt-version.mjs, fsi-app/scripts/proof/steps/prepare.mjs, fsi-app/scripts/proof/steps/verdict-fixture.mjs, fsi-app/scripts/proof/attacks/fixtures.mjs, fsi-app/scripts/verify/fixtures/rls-personas.mjs, fsi-app/scripts/verify/fixtures/eager-pg-import.mjs | B2p2:38,55,47,63,66,70,20; B2p3:41,40
INV-125 | provenance_status is a cache of validate_item_provenance(): it is recomputed on every change of an item, section or claim (including DELETE), customers read only verified, non-archived items, and fail-close applies to a 0-section item | set_provenance_status() AFTER triggers on items, sections and claims; the customer RPCs and read policies carry the verified gate; close-on-verify resolves trigger-created data_quality flags (migrations 112, 114, 115, 117, 119, 120, 121, 139, 209) | fsi-app/supabase/migrations/112_provenance_invariant_schema.sql, fsi-app/supabase/migrations/114_validate_item_provenance.sql, fsi-app/supabase/migrations/115_set_provenance_status_trigger.sql, fsi-app/supabase/migrations/119_validate_item_provenance_failclose.sql, fsi-app/supabase/migrations/209_provenance_status_on_delete.sql | C1:245,247,248,252; C2:122,174
INV-126 | A FACT claim's authority floor is per item type (regulatory 2, research 4, technology 5, market, initiative and regional exempt), unconditional on item_type for the regulatory family, with the standard item's own authoring body at floor 4, the tier derived inline COALESCE(tier_override, base_tier), and (migration 302) a below-floor claim is rated and recorded as a warning, never refused | criterion 3 of validate_item_provenance() | fsi-app/supabase/migrations/138_reg_only_authority_floor.sql, fsi-app/supabase/migrations/141_per_type_authority_floor.sql, fsi-app/supabase/migrations/145_provenance_floor_inline_derive.sql, fsi-app/supabase/migrations/158_floor_unconditional_label_per_claim.sql, fsi-app/supabase/migrations/202_standard_own_body_floor.sql, fsi-app/supabase/migrations/302_criterion3_rating_not_refusal.sql | C2:121,124,128,141,167; C3:159
INV-127 | An ANALYSIS claim asserting an enacted-law requirement needs forward framing, each analysis paragraph is labelled, and an unproven or stale prose fact fails criterion 7 | criterion 4 (legal-line guard), per-claim label check, criterion 7 gate_a_unproven_or_stale in validate_item_provenance() | fsi-app/supabase/migrations/142_legal_line_guard.sql, fsi-app/supabase/migrations/225_gate_a_criterion7.sql | C2:125,189
INV-128 | A provenance flip to verified is made only by the reconciler role or at trigger depth 2 or more, never by a forged GUC | guard_provenance_flip() on pg_trigger_depth() >= 2 or current_user = reconciler (migration 250 replaces the stamp_prov_origin GUC) | fsi-app/supabase/migrations/118_provenance_flip_binding.sql, fsi-app/supabase/migrations/250_provenance_verified_depth_binding.sql | C1:251; C2:211
INV-129 | A mint-time hold reason is recorded on the claim and a held FACT fails the gate | section_claim_provenance.mint_hold_reason and fact_mint_hold in validate_item_provenance() | fsi-app/supabase/migrations/206_mint_gate_hold_marker.sql | C2:171
INV-130 | Changed or erased claims are kept (non-destructive grounding): claim_versions is append-only history with proof required for supersession | claim_versions table with supersede_reason and proof_required CHECKs (migrations 208, 321) | fsi-app/supabase/migrations/208_claim_versions_nondestructive_grounding.sql, fsi-app/supabase/migrations/321_claim_versions_record_briefs_supersede.sql | C2:173; C3:178
INV-131 | A derived claim names its basis claim | claim_kind includes DERIVED and scp_derived_requires_basis CHECK | fsi-app/supabase/migrations/227_derived_claim_kind.sql | C2:191
INV-132 | At most one verified non-archived item per canonical instrument key; the key derivation preserves the OJ sequence suffix | canonical_instrument_key column, derive_canonical_instrument_key(), trigger and partial UNIQUE index (migrations 200, 255) | fsi-app/supabase/migrations/200_canonical_instrument_key.sql, fsi-app/supabase/migrations/255_canonical_key_oj_sequence_suffix.sql | C2:165,216
INV-133 | A source-shaped row is not archived as an item without a registered active source | guard trg_guard_source_archive on intelligence_items using _url_host() | fsi-app/supabase/migrations/135_source_registration_guard.sql | C2:118
INV-134 | The pause flags system_state.global_processing_paused and scrape_cadence have exactly one writer, admin_set_pause_state(), and an unmarked write is rejected; judgement_drain has its own guarded writer | guard_pause_flag_writer() BEFORE UPDATE trigger with marker GUC (201); guard_judgement_drain_writer() and admin_set_judgement_drain() (354); EXECUTE revoked from PUBLIC, anon, authenticated (248, 369) | fsi-app/supabase/migrations/201_pause_flag_session_guard.sql, fsi-app/supabase/migrations/248_security_grants_hardening_2026_08_09.sql, fsi-app/supabase/migrations/354_judgement_drain_switch.sql, fsi-app/supabase/migrations/369_privilege_functions_views.sql | C2:166,209; C3:209,221
INV-135 | No intelligence_items insert is accepted while an open data-audit block lacks a valid dated waiver | guard_data_audit_block() BEFORE INSERT trigger on intelligence_items | fsi-app/supabase/migrations/240_layer_c_insert_gate.sql | C2:204
INV-136 | Org membership: a banned user cannot be re-admitted by invitation, an invitation never demotes an owner or admin, and role transitions on org_memberships are guarded | org_member_bans, org_memberships_ban_guard(), accept_invitation promotion-only ON CONFLICT, org_membership_role_guard (migrations 156, 191, 370, 371) | fsi-app/supabase/migrations/156_org_member_bans.sql, fsi-app/supabase/migrations/191_org_membership_ban_guard.sql, fsi-app/supabase/migrations/370_privilege_table_policies.sql, fsi-app/supabase/migrations/371_definer_hygiene.sql | C2:139,162; C3:222,223
INV-137 | Privilege-bearing columns cannot be changed by the owning user: profiles.is_platform_admin, role, org_id, workspace_role and nine status columns, organizations.plan, community member verification and post sign-off | column-level INSERT/UPDATE grants plus guard triggers profiles_privilege_guard, organizations_plan_guard, community_member_profiles verification guard, community_posts guard (migrations 364, 367, 370); is_platform_admin is readable by nobody but the system through the definer is_platform_admin() (375) | fsi-app/supabase/migrations/364_profiles_privilege_columns.sql, fsi-app/supabase/migrations/367_profiles_status_columns.sql, fsi-app/supabase/migrations/370_privilege_table_policies.sql, fsi-app/supabase/migrations/375_admin_flag_private.sql | C3:218,219,222,227
INV-138 | Every SECURITY DEFINER function has an explicit grant list and a pinned search_path; capture_worker_fetch is service-role only; dead anon SELECT grants are revoked on 49 relations | REVOKE EXECUTE FROM PUBLIC, anon, authenticated with service_role grants (363, 369, 371); pinned search_path classes A-E (371); revoke 49 dead anon SELECT grants (migration 386, which existed only on a branch at audit time) | fsi-app/supabase/migrations/363_capture_worker_fetch_grants.sql, fsi-app/supabase/migrations/371_definer_hygiene.sql | C3:217,223; C3c:104
INV-139 | All 122 public tables have RLS enabled; 25 tables have no policy and are deny-all; anon holds SELECT only (never INSERT, UPDATE, DELETE or TRUNCATE) and authenticated has no TRUNCATE, TRIGGER or REFERENCES | ENABLE ROW LEVEL SECURITY on every table (384 reconciles 11); revoke wide default grants per table because default privileges grant anon r and authenticated arwd | fsi-app/supabase/migrations/384_schema_drift_reconcile_production_only.sql | C4:44-76,983-1003; C3:236
INV-140 | derivation_edges and harness_runs are unreadable and unwritable by anon and authenticated | REVOKE ALL FROM anon, authenticated and ENABLE RLS deny-all (330, 331) | fsi-app/supabase/migrations/330_derivation_edges_rls.sql, fsi-app/supabase/migrations/331_harness_runs.sql | C3:186,187
INV-141 | A statutory figure never absorbs an unvalidated estimate; derived values are read only through the admissible view; the derivation graph is acyclic and entity relations are cycle-refusing | assert_statutory_purity() trigger on statutory_computations; derived_values_admissible view; assert_acyclic(); entity_relations cycle-refusing trigger (285, 286, 377) | fsi-app/supabase/migrations/285_derivation_dag_and_derived_values.sql, fsi-app/supabase/migrations/286_statutory_and_estimates.sql, fsi-app/supabase/migrations/377_entity_hierarchy_and_aliases.sql | C3:145,146,229
INV-142 | A propagation event is emitted by trigger for each change to the tracked fact tables, resolving the entity | emit_propagation_event() triggers (284, 352, 373, 376, 377, 379, 380) | fsi-app/supabase/migrations/284_propagation_outbox.sql, fsi-app/supabase/migrations/352_outbox_entity_for_emission_factors.sql, fsi-app/supabase/migrations/373_outbox_entity_for_series_and_facts.sql | C3:144,207,225
INV-143 | An aggregate is published only at k of at least 10 (ADR-035) and only through publish_aggregate | sensitive_field_policy CHECK k_min >= 10; publish_aggregate SECURITY DEFINER with EXECUTE revoked (287, 347, 369) | fsi-app/supabase/migrations/287_sensitive_aggregates.sql, fsi-app/supabase/migrations/347_aggregate_floor_adr035.sql | C3:147,202
INV-144 | emission_factors are append-only and licence-gated; mode vocabulary has the canonical token ocean; market_series is unique on series_key and reference_period | licence_clear_sources view, append-only trigger, CHECKs, UNIQUE (258, 263, 268) | fsi-app/supabase/migrations/258_emission_factors_and_licence_gate.sql, fsi-app/supabase/migrations/263_mode_vocabulary_ocean_canonical.sql, fsi-app/supabase/migrations/268_market_series.sql | C2:219; C3:123,128
INV-145 | One forward event per natural text identity; one obligation per forward event; an obligation object is entity-registering and carries a verbatim-span proof | UNIQUE uq_item_forward_events_text_identity (307), UNIQUE forward_event_id (290), obligation_objects guard and verbatim-span triggers (376) | fsi-app/supabase/migrations/307_item_forward_events_text_identity_dedupe.sql, fsi-app/supabase/migrations/290_obligations.sql, fsi-app/supabase/migrations/376_obligation_objects.sql | C3:150,164,228
INV-146 | Corrections are append-only and their evidence is verbatim; reliability and census ledgers only append | item_corrections append-only trigger and span_is_verbatim (356); source_reliability_ledger append-only (353); census_worklist guarded status ladder (221); item_source_evidence reverted (216, 218) | fsi-app/supabase/migrations/356_item_corrections.sql, fsi-app/supabase/migrations/353_prediction_scoring_and_reliability_ledger.sql, fsi-app/supabase/migrations/221_census_worklist.sql | C3:208,211; C2:186
INV-147 | The theme column of intelligence_items is guarded by a vocabulary trigger; entity_kind admits material; a vocabulary term is adopted only with an adopted stamp | intelligence_items_theme_guard() (357); vocabulary_terms adopted-stamp CHECK (355) | fsi-app/supabase/migrations/357_vocabulary_kinds.sql, fsi-app/supabase/migrations/355_vocabulary_terms.sql | C3:212; C3b:92
INV-148 | A signpost score columns move together; at most one current research assessment per item | CHECK signposts_score_columns_together (353); unique one-current index (344) | fsi-app/supabase/migrations/353_prediction_scoring_and_reliability_ledger.sql, fsi-app/supabase/migrations/344_research_assessments.sql | C3:199,208
INV-149 | The workspace is org-scoped: spec09 tables, tags, notes, assignments, portfolios and watchlists are readable and writable only by members (writes only by users who can write in the org); portfolios and members respect caps | user_belongs_to_org, user_can_write_in_org, user_org_role helpers in policies; portfolios caps via triggers (311, 313, 358, 359, 362, 370) | fsi-app/supabase/migrations/311_spec09_org_scope_and_pool_drop.sql, fsi-app/supabase/migrations/313_workspace_tags.sql, fsi-app/supabase/migrations/362_portfolios.sql | C3:168,170,213,214,216
INV-150 | Community counters (member count, reply count, case-study validation count) are maintained by SECURITY DEFINER triggers and RLS has no recursion | counter trigger functions (190); user_is_group_member helpers (046) | fsi-app/supabase/migrations/190_community_counter_integrity.sql, fsi-app/supabase/migrations/046_community_rls_recursion_fix.sql | C2:161; C1:182
INV-151 | Child tables of intelligence_items are readable only when the parent is readable; the one known gap is intelligence_changes.changes_read_authenticated | select policies gated on parent verified and not archived (168); sections, forward events and obligations require is_archived false only | fsi-app/supabase/migrations/168_aux_table_parent_gates.sql | C2:151; C4:101-1003
INV-152 | The live database equals db-catalog.json on every named object (122 tables, 6 views, 84 rpc and 50 trigger functions, 11 extensions, 69 triggers, 214 policies) and every trigger is enabled | catalog snapshot compared by name | fsi-app/.discipline/governance/db-catalog.json | C4:1-76
INV-153 | An organization always keeps at least one owner: the last owner cannot be demoted or removed | migration 370 org_membership_role_guard (BEFORE INSERT OR UPDATE OR DELETE on org_memberships) refuses it for every caller except service_role and postgres; the members route repeats the count check before its service-role PATCH, POST and DELETE | fsi-app/supabase/migrations/370_privilege_table_policies.sql, fsi-app/src/app/api/orgs/[org_id]/members/route.ts | P1-01 auth-db.md section 8
INV-154 | Every signed-in user has a profiles row (org_memberships.user_id references profiles.id and the rpcs do not create it) | ensureProfile inserts the row after the auth callback's code exchange and heals a missing row on the first identity resolution of a session; a 23505 is re-read, never reported; no trigger on auth.users exists | fsi-app/src/lib/auth/provision-personal-workspace.ts, fsi-app/src/app/auth/callback/route.ts, fsi-app/src/lib/api/server-bootstrap.ts | P1-01 auth-db.md section 8
INV-155 | An invitation revoke is scoped to the URL's organization before any write, and an invitation token never reaches a log line | the org_invitations ownership read runs on the caller's client before revoke_invitation (read error 500, mismatch 404, zero rpc calls); the invite log line carries org, invitation id and role only (PR 1122) | fsi-app/src/app/api/orgs/[org_id]/invitations/[id]/route.ts, fsi-app/src/app/api/orgs/[org_id]/invitations/route.ts | P1-01 auth-db.md section 8
INV-156 | Every FACT claim's source_span is present verbatim (case-insensitive) in the result_content of the agent_run_searches row it is attributed to, and attribution follows the capture that contains the span, not merely the row that shares its URL | the grounding kept filter drops a FACT whose span is in no pool capture; crossLinkClaimSources stamps search_result_id from the first row whose capture contains the span (same URL first, any pool row second, URL match last); criterion 3 of validate_item_provenance refuses the item otherwise | fsi-app/src/lib/agent/canonical-pipeline.ts (1950-1954), fsi-app/src/lib/agent/parse-output.ts (969-1003), fsi-app/supabase/migrations/207_own_body_types_extension.sql | P1-03 intake-a.md section 8
INV-157 | A session-authored brief is written only when its sourcePoolHash equals the hash of the item's current stored pool, and never over an item whose item_grade is not record unless the caller passes allowBriefOverwrite | generateBriefFromInjected re-reads agent_run_searches, recomputes hashSourcePool and refuses on mismatch (stale pool) or on a brief-grade item without the flag; the required-slot check refuses a body that leaves a slot silently unaddressed | fsi-app/src/lib/agent/canonical-pipeline.ts (925-940, 1370-1402), fsi-app/src/lib/agent/source-pool-hash.mjs | P1-03 intake-a.md section 8
INV-158 | A re-ground never commits a claim ledger weaker than the prior one on a dominance axis (total collapsed below half a non-trivial prior, FACT count collapsed, floor-qualifying FACTs lost to zero, verified eligibility lost), and a claim the new ledger does not reproduce is kept unless a claim_versions row archived it first | summarizeLedger and ledgerRegression gate the apply (a regression is a diagnostic, the prior ledger stands); applyLedgerDiff archives to claim_versions before every change and before every replace-ledger removal, and keeps the claim when the archive write fails | fsi-app/src/lib/agent/ledger-dominance.mjs, fsi-app/src/lib/agent/ledger-apply.mjs (117-189), fsi-app/src/lib/agent/canonical-pipeline.ts (2083-2109) | P1-03 intake-a.md section 8
INV-159 | The 25 brief metadata fields are written only when they validate against the contract: severity in the five labels with its locked priority, topic_tags at most 3 from the closed 7, compliance_object_tags at most 4 from the closed 19 plus adopted terms, theme only on research_summary from the DB list plus adopted terms, signal_band only on market_signal_brief, trajectory_points only with signal_band price; an out-of-vocabulary compliance object or theme is banked as a candidate, never silently dropped | parseYamlFrontmatter throws on any violation (the regeneration fails); heldCompObjTag keeps vocabulary values and banks the rest in compliance_object_candidates; toDbTheme and toThemeCandidate split theme and theme_candidate; assertDbValue throws on parser-to-DB drift | fsi-app/src/lib/agent/parse-output.ts (380-827), fsi-app/src/lib/agent/metadata-vocab.ts, fsi-app/supabase/migrations/102_severity_band_theme_columns.sql, fsi-app/supabase/migrations/107_intelligence_items_trajectory_points.sql, fsi-app/supabase/migrations/136_theme_candidate_capture.sql, fsi-app/supabase/migrations/355_vocabulary_terms.sql, fsi-app/supabase/migrations/357_vocabulary_kinds.sql | P1-03 intake-a.md section 8
INV-160 | Every required slot of an item type (item_type_required_slots) is covered in the brief by a FACT claim carrying the slot_key or by an explicit GAP statement, and a slot FACT exists only when its span is a verbatim clause of a floor-qualifying pool source confirmed by its author, never a forced or paraphrased one | uncoveredSlots refuses a synthesis that leaves a slot silently unaddressed; nominateForSlot offers only verbatim clauses from the floor pool; decideSlotClaim returns GAP or RELABEL without a confirmation; criterion missing_required_slot of validate_item_provenance holds the item | fsi-app/src/lib/agent/slot-prompt.mjs, fsi-app/src/lib/agent/slot-forcing.mjs, fsi-app/src/lib/agent/canonical-pipeline.ts (938, 1962-1990), fsi-app/supabase/migrations/326_regulation_directive_slot_gap_source_says_so.sql | P1-03 intake-a.md section 8
INV-161 | A brief run on an item starts only for a platform admin, at most once per hour per item, never on a provenance_status verified item without an explicit refresh, and is refused when a guard read fails or when an open data-audit block has no valid dated waiver | requireAdminRoute; the verified and cooldown reads answer 503 guard_unavailable on error and 429 within the hour; preflightStep halts on the open integrity_flags block unless hasValidWaiver | fsi-app/src/app/api/agent/run/route.ts (26, 79-112), fsi-app/src/workflows/generate-brief.ts (90-143), fsi-app/src/lib/agent/audit-gate.ts (54-56, 148-159) | P1-03 intake-a.md section 8
INV-162 | A coverage figure is the count of dual-verified catalogued instruments (firm-core relevance AND identity verified) over all catalogued instruments in that cell; a cell with nothing catalogued is "not covered", never a zero; a failed read is an error state and is never cached | buildCoverageMatrix counts numerator and denominator per (mode, data class, geography); buildCoverageView marks an absent cell present:false; the cached loader throws inside unstable_cache so an outage is not stored, and the page renders the error state with no numbers | fsi-app/src/lib/coverage/coverage-matrix.mjs, fsi-app/src/lib/coverage/load-matrix.mjs, fsi-app/src/lib/coverage/matrix-data.ts, fsi-app/src/lib/coverage/index-data.ts | P1-06 sources-b.md section 8
INV-163 | A reader's coverage request creates at most one open (open or in_review) coverage_gap integrity flag per subject path; the path is a same-site path and the label is at most 120 characters with control characters stripped; the flag text is composed server-side | validateCoverageRequest refuses a scheme, a host, a protocol-relative start and dot segments; recordCoverageRequest reads open flags for the path first and answers already:true instead of inserting (select-then-insert, no atomic guard) | fsi-app/src/lib/coverage/request-coverage.mjs | P1-06 sources-b.md section 8
INV-164 | Every paid agent_runs row after the spend-freeze baseline traces to an operator authorization: a subject-bearing row to a priced-line marker for the same item or source logged at or before it, a subject-less row to a batch marker whose model matches and whose window contains it; an unreadable baseline fails closed | computeSpendHealth marks the probe unhealthy on any untraced row or an unparseable baseline; the month's rows are read in full (paginated, ordered by id) | fsi-app/src/lib/health/spend-health.mjs, fsi-app/src/app/api/health/spend/route.ts | P1-06 sources-b.md section 8
INV-165 | A team-scope archive requires the owner or admin role and a reason, stamps archived_by, and notifies the item's watchers and owner inside the archiver's org only; a personal archive is ungated, notifies nobody and hides the item for that user alone; when both exist the personal layer wins | overrides POST refuses a member with 403 and a missing reason with 400 (a failed role lookup is a 500, fail closed), writes archived_by, fans out to org members on user_watchlist plus the owner, excluding the archiver; personal-state POST writes only the session user's row; mergeWithOverrides checks the personal layer first | fsi-app/src/app/api/workspace/overrides/route.ts, fsi-app/src/app/api/workspace/personal-state/route.ts, fsi-app/src/stores/resourceStore.ts, fsi-app/supabase/migrations/235_dual_scope_archive.sql | P1-02 workspace.md section 8
INV-166 | Attribution columns on workspace rows (item_workspace_tags.created_by, workspace_tags.created_by, item_assignments.assigned_by, item_notes.author_user_id, user_item_state.user_id, workspace_item_overrides.archived_by and owner_assigned_by) are stamped from the session, never from the request body; a repeat tag apply keeps the first applier and date | every route writes auth.userId and ignores any body field of that name; the tag apply upserts with ignoreDuplicates (ON CONFLICT DO NOTHING) | fsi-app/src/app/api/workspace/tags/[id]/items/route.ts, fsi-app/src/app/api/workspace/overrides/route.ts, fsi-app/src/app/api/workspace/personal-state/route.ts, fsi-app/src/lib/workspace/item-notes.mjs, fsi-app/src/lib/workspace/item-assignments.mjs, fsi-app/supabase/migrations/313_workspace_tags.sql | P1-02 workspace.md section 8
INV-167 | An owner or assignee named on a workspace item holds a membership in the caller's org, and a viewer is never assigned work; one outsider refuses the whole request and nothing is written; an unverifiable roster or membership read fails closed | overrides POST reads org_memberships for the ownerUserId (500 on a read error, 403 when absent); assignMembers loads the org roster, refuses outsiders and viewers before any insert | fsi-app/src/app/api/workspace/overrides/route.ts, fsi-app/src/lib/workspace/item-assignments.mjs, fsi-app/src/lib/workspace/item-collab-shared.mjs | P1-02 workspace.md section 8
INV-168 | The workspace_settings.profile and alert_config jsonb columns are patched key-wise: a writer reads the row, merges its own keys and never replaces a sibling key | OrganisationProfileSection merges org_roles and org_size into the existing profile; BriefingScheduleSection merges the five briefing keys into the existing alert_config; the settingsStore debouncedSave (lines 72-91) replaces alert_config, default_filters and home_sections whole and violates this, unreachable today because loadFromWorkspace has no caller; the port routes all three writers through one key-wise patch | fsi-app/src/components/settings/OrganisationProfileSection.tsx, fsi-app/src/components/settings/BriefingScheduleSection.tsx, fsi-app/src/stores/settingsStore.ts | P1-02 workspace.md section 8
INV-169 | The mint chokepoint is the only runtime INSERT into intelligence_items; it refuses (fail-closed) on a read error of its source_url or legacy_id probes, its dedup corpus or its source-registry lookup, and its dedup corpus covers every non-archived row (no row cap) | probe, dedup over the full paginated corpus, then the single INSERT; refuse with the read error named | fsi-app/src/lib/intake/mint-item.ts | P1-04 intake-b.md section 8
INV-170 | A staged new_item never mints a portal root URL, never carries a non-column chokepoint input (relevance, capturedText, key_deadlines, source_name, authority_level) into the INSERT, and every staged_updates disposition stamp it writes is checked | entity gate before the chokepoint; strip the inputs before STAGE and before the seed; a failed stamp is reported, not dropped | fsi-app/src/lib/intake/apply-staged-update.ts, fsi-app/src/lib/intake/run-intake-cycle.ts | P1-04 intake-b.md section 8
INV-171 | A record-grade claim set holds at most one claim per slot, every FACT source_span is a verbatim substring of the captured text under the database's criterion-3 rule, and the stub full_brief is built only from claim text with digit-free boilerplate | one walker and one claim constructor; assertVerbatim before emission; buildRecordFullBrief from claim_text only | fsi-app/src/lib/intake/record-facts.mjs, fsi-app/src/lib/intake/record-facts-research.mjs | P1-04 intake-b.md section 8
INV-172 | A substantive update (any intelligence_items column outside the non-substantive deny list) reruns connection discovery, forward-event extraction deduped on the migration-307 text-identity key with stale events flagged and never deleted, and the compliance_deadline sync, and re-links entities when jurisdiction_iso or canonical_instrument_key changed; an empty or bookkeeping-only change runs none | isSubstantiveUpdate then the participation steps, each independent and recorded as a defect on failure | fsi-app/src/lib/intake/apply-staged-update.ts, fsi-app/src/lib/intake/flywheel-steps.mjs | P1-04 intake-b.md section 8
INV-173 | A missing observation (an SDMX missing obs_status) never carries a value; an aggregate takes the weakest origin_class, the least contractable derivation and the worst freshness of its inputs; freshness is derived from the as-of triple and the cadence, never asserted | makeEnvelope throws on the zero-fill case; propagate; stalenessOf | fsi-app/src/lib/contracts/envelope.mjs, fsi-app/src/lib/contracts/vocabularies.mjs | P1-04 intake-b.md section 8
INV-174 | An emission factor is selected by tier rank, then scope specificity, then recency; an invalid, superseded, out-of-window or licence-unclear candidate is skipped and reported, never served; an unregistered source key fails the embed gate closed | resolveActiveFactor with a skipped list; mayEmbedAsSeed false on an unknown key | fsi-app/src/lib/contracts/factor-tier.mjs, fsi-app/src/lib/contracts/source-licence.mjs | P1-04 intake-b.md section 8
NONE: migrations 001-011, 013-130 and the data-only reclassifications (019, 045, 074, 086, 097) are schema history and one-off DML with no standing invariant beyond the guards listed above | fsi-app/supabase/migrations/ | C1:137-262

## Not found in the registers

Old files in the CLEAN-3 deleted set that no register row names (path, repo-relative path or basename searched across all 41 registers): 442 of 1859.

- docs/runbooks/maintenance.d/01-community-topics-seed.md
- docs/runbooks/maintenance.d/02-tier-opinions.md
- docs/runbooks/maintenance.d/04-origin-class-backfill.md
- docs/runbooks/maintenance.d/04a-source-type-backfill.md
- docs/runbooks/maintenance.d/04b-derive-obligations.md
- docs/runbooks/maintenance.d/04c-seed-corridors.md
- docs/runbooks/maintenance.d/05-census-off-vertical.md
- docs/runbooks/maintenance.d/06-review-digests.md
- docs/runbooks/maintenance.d/06a-tag-proposals.md
- docs/runbooks/maintenance.d/07-tag-ratification.md
- docs/runbooks/maintenance.d/08-provenance-heal.md
- docs/runbooks/maintenance.d/08a-institution-canonicalize.md
- docs/runbooks/maintenance.d/08b-attach-found-sources.md
- docs/runbooks/maintenance.d/09-reopen-validation-holds.md
- docs/runbooks/maintenance.d/10-record-hollow-sweep.md
- docs/runbooks/maintenance.d/11-canonical-key-dedup.md
- docs/runbooks/maintenance.d/12-forward-events-retext.md
- docs/runbooks/maintenance.d/13-review-apply-provisional-sources.md
- docs/runbooks/maintenance.d/14-review-apply-canonical-candidates.md
- docs/runbooks/maintenance.d/15-review-apply-portal-links.md
- docs/runbooks/maintenance.d/16-review-apply-coverage-gaps.md
- docs/runbooks/maintenance.d/17-apply-classifications.md
- docs/runbooks/maintenance.d/18-seed-benchmark-instruments.md
- docs/runbooks/maintenance.d/19-spec09-reroute.md
- docs/runbooks/maintenance.d/20-spec09-grid-queue.md
- docs/runbooks/maintenance.d/21-spec09-oem-roadmap.md
- docs/runbooks/maintenance.d/22-propose-classifications.md
- docs/runbooks/maintenance.d/23-generate-theme-brief.md
- docs/runbooks/maintenance.d/24-ratify-flag-to-census.md
- docs/runbooks/maintenance.d/25-assumption-register-seed.md
- docs/runbooks/maintenance.d/26-backfill-lineage-edges.md
- docs/runbooks/maintenance.d/27-screen-worklist.md
- docs/runbooks/maintenance.d/28-verification-audit-report.md
- docs/runbooks/maintenance.d/29-spec09-surcharge-audit-csv.md
- docs/runbooks/maintenance.d/30-spec09-dqi-csv.md
- docs/runbooks/maintenance.d/31-spec09-auxiliary-energy-csv.md
- docs/runbooks/maintenance.d/32-spec09-indexation-csv.md
- docs/runbooks/maintenance.d/33-chained-automatically.md
- docs/runbooks/maintenance.d/34-regen-quarantined.md
- docs/runbooks/maintenance.d/35-close-acquire-primaries-holds.md
- docs/runbooks/maintenance.d/36-refetch-capped.md
- docs/runbooks/maintenance.d/37-source-role-cleanup.md
- docs/runbooks/maintenance.d/38-canonical-autoverify.md
- docs/runbooks/maintenance.d/39-remediate-orphan-sources.md
- docs/runbooks/maintenance.d/40-timeline-backfill.md
- docs/runbooks/maintenance.d/41-close-run-logs.md
- docs/runbooks/maintenance.d/42-resolve-error-body-gate.md
- docs/runbooks/maintenance.d/43-resolve-cited-host-gate.md
- docs/runbooks/maintenance.d/44-uk-series-code-reconcile.md
- docs/runbooks/maintenance.d/45-resolve-signals.md
- docs/runbooks/maintenance.d/46-resolve-provisional-sources.md
- docs/runbooks/maintenance.d/46a-enumerate-unclassified-hosts.md
- docs/runbooks/maintenance.d/47-finish-staged-updates.md
- docs/runbooks/maintenance.d/48-schema-vocabulary-inventory.md
- docs/runbooks/maintenance.d/49-resolve-refetch-holds.md
- docs/runbooks/maintenance.d/50-close-coverage-reflections.md
- docs/runbooks/maintenance.d/51-close-legal-confirmation-rows.md
- docs/runbooks/maintenance.d/52-close-flags-for-verified-items.md
- docs/runbooks/maintenance.d/56-capture-static-primaries.md
- docs/runbooks/maintenance.d/57-disk-io-budget.md
- docs/runbooks/maintenance.d/58-recompute-tiers.md
- docs/runbooks/maintenance.d/59-lineage-gap-targets.md
- docs/runbooks/maintenance.d/A1-holdings-audit.md
- docs/runbooks/maintenance.d/A2-verify-checks-wired-via-data-audit-lane.md
- docs/runbooks/maintenance.d/A3-check-vocabulary-drift.md
- docs/runbooks/maintenance.d/A4-f51-hotspot-standing-number.md
- fsi-app/.discipline/consistency/checks/C5-program-anchors-reality.mjs
- fsi-app/.discipline/consistency/lib/inventory-parser.mjs
- fsi-app/.discipline/fitness/functions/F16-transport-hold-gate.mjs
- fsi-app/.discipline/fitness/functions/F18-one-url-canonicalizer.mjs
- fsi-app/.discipline/fitness/functions/F19-no-service-anon-downgrade.mjs
- fsi-app/.discipline/fitness/functions/F2-admin-routes-isPlatformAdmin.mjs
- fsi-app/.discipline/fitness/functions/F20-pause-flag-one-writer.mjs
- fsi-app/.discipline/fitness/functions/F23-governed-surface-coverage.mjs
- fsi-app/.discipline/fitness/functions/F27-producer-seam-proof.mjs
- fsi-app/.discipline/fitness/functions/F31-derived-values-gate.mjs
- fsi-app/.discipline/fitness/functions/F32-statutory-purity.mjs
- fsi-app/.discipline/fitness/functions/F36-date-format-timezone-pin.mjs
- fsi-app/.discipline/fitness/functions/F41-dead-media-query-class.mjs
- fsi-app/.discipline/fitness/functions/F43-default-open-disclosure.mjs
- fsi-app/.discipline/fitness/functions/F49-parts-not-pages.mjs
- fsi-app/.discipline/fitness/functions/F6-migrations-numeric-ordering.mjs
- fsi-app/.discipline/fitness/functions/F67-unguarded-main-invocation.mjs
- fsi-app/.discipline/fitness/functions/F70-definer-hygiene.mjs
- fsi-app/.discipline/fitness/functions/F8-client-server-tier-boundary.mjs
- fsi-app/.discipline/fitness/functions/F9-build-compiles.mjs
- fsi-app/.discipline/fitness/lib/code-scan.mjs
- fsi-app/.discipline/fitness/lib/file-content.mjs
- fsi-app/.discipline/fitness/lib/glob.mjs
- fsi-app/.discipline/fitness/lib/selftest-spawn.mjs
- fsi-app/.discipline/fitness/lib/sql-mask.mjs
- fsi-app/.discipline/fitness/lib/table-access.mjs
- fsi-app/.discipline/fitness/lib/yml-read.mjs
- fsi-app/.discipline/fixtures/check-vocabulary/bad-status-value.mjs
- fsi-app/.discipline/fixtures/rd-master-022/base.tsx.txt
- fsi-app/.discipline/fixtures/rd-master-022/c1.tsx.txt
- fsi-app/.discipline/fixtures/rd-master-022/c2.tsx.txt
- fsi-app/.discipline/governance/invariants.d/AC-2-grounding-models.mjs
- fsi-app/.discipline/governance/invariants.d/AC-3-per-format-design-before-scale.mjs
- fsi-app/.discipline/governance/invariants.d/AC-4-no-vacuum.mjs
- fsi-app/.discipline/governance/invariants.d/EP-13-skill-prompt-parity.mjs
- fsi-app/.discipline/governance/invariants.d/EP-14-entity-spine-text-key-ratchet.mjs
- fsi-app/.discipline/governance/invariants.d/EP-6-cause-effect.mjs
- fsi-app/.discipline/governance/invariants.d/EP-7-severity-labels.mjs
- fsi-app/.discipline/governance/invariants.d/EP-8-qualification-capture.mjs
- fsi-app/.discipline/governance/invariants.d/PI-3-community-coequal.mjs
- fsi-app/.discipline/governance/invariants.d/PI-4-assistant-research-helper.mjs
- fsi-app/.discipline/governance/invariants.d/PI-5-every-decline-names-the-five-contracts.mjs
- fsi-app/.discipline/governance/invariants.d/RD-1-classify-before-discard.mjs
- fsi-app/.discipline/governance/invariants.d/RD-10-spend-chokepoint.mjs
- fsi-app/.discipline/governance/invariants.d/RD-11-transport-hold-gate.mjs
- fsi-app/.discipline/governance/invariants.d/RD-13-error-body-groundability-gate.mjs
- fsi-app/.discipline/governance/invariants.d/RD-13-one-url-canonicalizer.mjs
- fsi-app/.discipline/governance/invariants.d/RD-14-line-read-is-not-verification.mjs
- fsi-app/.discipline/governance/invariants.d/RD-14-transport-escalation-write-gate.mjs
- fsi-app/.discipline/governance/invariants.d/RD-15-no-service-anon-downgrade.mjs
- fsi-app/.discipline/governance/invariants.d/RD-16-transport-hold-all-four.mjs
- fsi-app/.discipline/governance/invariants.d/RD-2-class-fixes-mechanical.mjs
- fsi-app/.discipline/governance/invariants.d/RD-21-generation-pause-split.mjs
- fsi-app/.discipline/governance/invariants.d/RD-22-mint-source-link.mjs
- fsi-app/.discipline/governance/invariants.d/RD-23-pause-flag-one-writer.mjs
- fsi-app/.discipline/governance/invariants.d/RD-24-single-grounding-entry.mjs
- fsi-app/.discipline/governance/invariants.d/RD-25-paid-row-attribution.mjs
- fsi-app/.discipline/governance/invariants.d/RD-26-pre-logged-acquire-justification.mjs
- fsi-app/.discipline/governance/invariants.d/RD-28-verified-is-resting-state.mjs
- fsi-app/.discipline/governance/invariants.d/RD-29-fresh-snapshot-never-paid.mjs
- fsi-app/.discipline/governance/invariants.d/RD-3-primitive-thresholds.mjs
- fsi-app/.discipline/governance/invariants.d/RD-31-operator-priced-spend.mjs
- fsi-app/.discipline/governance/invariants.d/RD-32-data-existence-before-acquisition.mjs
- fsi-app/.discipline/governance/invariants.d/RD-33-no-execution-from-stale-state.mjs
- fsi-app/.discipline/governance/invariants.d/RD-34-referenced-law-exists.mjs
- fsi-app/.discipline/governance/invariants.d/RD-35-flow-golden-mandate.mjs
- fsi-app/.discipline/governance/invariants.d/RD-36-re-grounds-never-destroy.mjs
- fsi-app/.discipline/governance/invariants.d/RD-37-charset-aware-decode.mjs
- fsi-app/.discipline/governance/invariants.d/RD-39-suspended-source-unselectable.mjs
- fsi-app/.discipline/governance/invariants.d/RD-40-no-fact-on-suspended-source.mjs
- fsi-app/.discipline/governance/invariants.d/RD-41-mint-gates-report-only.mjs
- fsi-app/.discipline/governance/invariants.d/RD-42-disposition-content-gate.mjs
- fsi-app/.discipline/governance/invariants.d/RD-44-grounding-is-non-destructive.mjs
- fsi-app/.discipline/governance/invariants.d/RD-45-erase-only-on-proven-inaccuracy.mjs
- fsi-app/.discipline/governance/invariants.d/RD-46-primary-text-permanent.mjs
- fsi-app/.discipline/governance/invariants.d/RD-48-target-instrument-match.mjs
- fsi-app/.discipline/governance/invariants.d/RD-49-confidentiality-ruled-purge-exception.mjs
- fsi-app/.discipline/governance/invariants.d/RD-49-schema-drift-committed-source.mjs
- fsi-app/.discipline/governance/invariants.d/RD-5-status-is-a-cache.mjs
- fsi-app/.discipline/governance/invariants.d/RD-50-fork-log-frozen.mjs
- fsi-app/.discipline/governance/invariants.d/RD-51-cached-shape-key-rotation.mjs
- fsi-app/.discipline/governance/invariants.d/RD-52-governed-surface-coverage-ratchet.mjs
- fsi-app/.discipline/governance/invariants.d/RD-53-db-object-migration-home.mjs
- fsi-app/.discipline/governance/invariants.d/RD-54-module-liveness.mjs
- fsi-app/.discipline/governance/invariants.d/RD-55-harness-run-integrity.mjs
- fsi-app/.discipline/governance/invariants.d/RD-56-derived-values-gate.mjs
- fsi-app/.discipline/governance/invariants.d/RD-57-statutory-purity.mjs
- fsi-app/.discipline/governance/invariants.d/RD-58-surface-acceptance-register.mjs
- fsi-app/.discipline/governance/invariants.d/RD-59-bundle-safe-module-evaluation.mjs
- fsi-app/.discipline/governance/invariants.d/RD-60-row-ux-measured-on-real-component.mjs
- fsi-app/.discipline/governance/invariants.d/RD-61-date-format-timezone-pin.mjs
- fsi-app/.discipline/governance/invariants.d/RD-63-unbounded-supabase-read.mjs
- fsi-app/.discipline/governance/invariants.d/RD-64-unbounded-in-filter.mjs
- fsi-app/.discipline/governance/invariants.d/RD-65-authed-api-fetch.mjs
- fsi-app/.discipline/governance/invariants.d/RD-66-dead-media-query-class.mjs
- fsi-app/.discipline/governance/invariants.d/RD-67-card-shell-one-component.mjs
- fsi-app/.discipline/governance/invariants.d/RD-68.mjs
- fsi-app/.discipline/governance/invariants.d/RD-69-no-dash-glyphs.mjs
- fsi-app/.discipline/governance/invariants.d/RD-69.mjs
- fsi-app/.discipline/governance/invariants.d/RD-7-roadblock-alternative-search.mjs
- fsi-app/.discipline/governance/invariants.d/RD-70.mjs
- fsi-app/.discipline/governance/invariants.d/RD-71.mjs
- fsi-app/.discipline/governance/invariants.d/RD-73.mjs
- fsi-app/.discipline/governance/invariants.d/RD-74-loop-hop-wiring.mjs
- fsi-app/.discipline/governance/invariants.d/RD-75.mjs
- fsi-app/.discipline/governance/invariants.d/RD-76.mjs
- fsi-app/.discipline/governance/invariants.d/RD-77.mjs
- fsi-app/.discipline/governance/invariants.d/RD-80.mjs
- fsi-app/.discipline/governance/invariants.d/RD-82.mjs
- fsi-app/.discipline/governance/invariants.d/RD-84.mjs
- fsi-app/.discipline/governance/invariants.d/RD-85.mjs
- fsi-app/.discipline/governance/invariants.d/RD-87-chained-dry-guard-wired.mjs
- fsi-app/.discipline/governance/invariants.d/RD-88-clock-fragility.mjs
- fsi-app/.discipline/governance/invariants.d/RD-88.mjs
- fsi-app/.discipline/governance/invariants.d/RD-89-unguarded-main-invocation.mjs
- fsi-app/.discipline/governance/invariants.d/RD-89.mjs
- fsi-app/.discipline/governance/invariants.d/RD-9-producer-consumer-orphan.mjs
- fsi-app/.discipline/governance/invariants.d/RD-90-actions-artifact-budget.mjs
- fsi-app/.discipline/governance/invariants.d/RD-90.mjs
- fsi-app/.discipline/governance/invariants.d/RD-92-model-id-literal.mjs
- fsi-app/.discipline/governance/invariants.d/RD-93-definer-hygiene.mjs
- fsi-app/.discipline/governance/invariants.d/RD-97-source-diffed-as-text.mjs
- fsi-app/.discipline/governance/invariants.d/RD-98-wip-commit-skips-ci.mjs
- fsi-app/.discipline/governance/invariants.d/RD-9b-producer-composition-proof.mjs
- fsi-app/.discipline/governance/invariants.d/RG-1-plan-reground.mjs
- fsi-app/.discipline/governance/invariants.d/SC-1-syndication-math.mjs
- fsi-app/.discipline/governance/invariants.d/SC-10-floor-source-complete.mjs
- fsi-app/.discipline/governance/invariants.d/SC-11-floor-first-attribution.mjs
- fsi-app/.discipline/governance/invariants.d/SC-12-slot-forcing-genuine-support.mjs
- fsi-app/.discipline/governance/invariants.d/SC-13-register-step-deterministic-tier.mjs
- fsi-app/.discipline/governance/invariants.d/SC-14-standard-own-body-floor.mjs
- fsi-app/.discipline/governance/invariants.d/SC-15-source-role-at-birth.mjs
- fsi-app/.discipline/governance/invariants.d/SC-2-source-registration.mjs
- fsi-app/.discipline/governance/invariants.d/SC-3-effective-tier-formula.mjs
- fsi-app/.discipline/governance/invariants.d/SC-5-domain-int-ssot.mjs
- fsi-app/.discipline/governance/invariants.d/SC-6-one-tier-per-host.mjs
- fsi-app/.discipline/governance/invariants.d/SC-7-claims-tier.mjs
- fsi-app/.discipline/governance/invariants.d/SC-8-authority-floor.mjs
- fsi-app/.discipline/governance/invariants.d/SC-9-moat-base-tier-only.mjs
- fsi-app/.discipline/governance/invariants.d/SF-1-inventory-consistency.mjs
- fsi-app/.discipline/governance/invariants.d/SF-10-customer-surface-rendering.mjs
- fsi-app/.discipline/governance/invariants.d/SF-11-secrets-registered.mjs
- fsi-app/.discipline/governance/invariants.d/SF-12-doctrine-no-uncited-gate.mjs
- fsi-app/.discipline/governance/invariants.d/SF-2-migration-ordering.mjs
- fsi-app/.discipline/governance/invariants.d/SF-3-admin-gating.mjs
- fsi-app/.discipline/governance/invariants.d/SF-4-client-server-tier-boundary.mjs
- fsi-app/.discipline/governance/invariants.d/SF-5-build-compiles.mjs
- fsi-app/.discipline/governance/invariants.d/SF-6-no-hardcoded-user-path.mjs
- fsi-app/.discipline/governance/invariants.d/SF-7-worktree-convention.mjs
- fsi-app/.discipline/governance/invariants.d/SF-8-canonical-anthropic-path.mjs
- fsi-app/.discipline/governance/invariants.d/SF-9-generation-config-no-raw-env.mjs
- fsi-app/.discipline/governance/loop-hops.d/01-sweep-to-fetch-drain.json
- fsi-app/.discipline/governance/loop-hops.d/02-sweep-to-ledger-consume.json
- fsi-app/.discipline/governance/loop-hops.d/03-ledger-consume-to-population-turn.json
- fsi-app/.discipline/governance/loop-hops.d/04-ledger-consume-to-corpus-turn.json
- fsi-app/.discipline/governance/loop-hops.d/05-population-turn-to-downstream-chain.json
- fsi-app/.discipline/governance/loop-hops.d/06-corpus-turn-to-downstream-chain.json
- fsi-app/.discipline/governance/loop-hops.d/07-downstream-chain-to-propagation-drain.json
- fsi-app/.discipline/governance/loop-hops.d/08-data-producers-to-propagation-drain.json
- fsi-app/.discipline/governance/loop-hops.d/09-population-turn-to-brief-export.json
- fsi-app/.discipline/governance/loop-hops.d/10-brief-apply-to-gate-a-rescan.json
- fsi-app/.discipline/governance/loop-hops.d/11-population-turn-to-gate-a-rescan.json
- fsi-app/.discipline/governance/loop-hops.d/12-brief-apply-to-source-resolution.json
- fsi-app/.discipline/governance/loop-hops.d/13-research-walker-to-source-resolution.json
- fsi-app/.discipline/governance/loop-hops.d/14-propagation-drain-to-question-answers.json
- fsi-app/.discipline/governance/loop-hops.d/15-population-turn-to-question-answers.json
- fsi-app/.discipline/governance/loop-hops.d/16-corpus-turn-to-theme-briefs.json
- fsi-app/.discipline/lib/firing-log.mjs
- fsi-app/.discipline/lib/fixtures/no-npm-resolve-hook.mjs
- fsi-app/.discipline/lib/fixtures/no-npm-resolve-register.mjs
- fsi-app/.discipline/lib/gate-firings.mjs
- fsi-app/.discipline/lib/mask-source.mjs
- fsi-app/.discipline/lib/read-migration-sql.mjs
- fsi-app/.discipline/lib/session-context.mjs
- fsi-app/.discipline/rendering/action-card-assert.mjs
- fsi-app/.discipline/rendering/audit/normalise.mjs
- fsi-app/.discipline/rendering/audit/open-state-sweep.mjs
- fsi-app/.discipline/rendering/audit/overflow-sweep.mjs
- fsi-app/.discipline/rendering/audit/run-audit.mjs
- fsi-app/.discipline/rendering/audit/seed-2026-09-07.md
- fsi-app/.discipline/rendering/audit/spec/absence.json
- fsi-app/.discipline/rendering/audit/spec/account-members.json
- fsi-app/.discipline/rendering/audit/spec/actionrow.json
- fsi-app/.discipline/rendering/audit/spec/admin-issues-rail.json
- fsi-app/.discipline/rendering/audit/spec/admin-stat-tiles.json
- fsi-app/.discipline/rendering/audit/spec/auth-frame.json
- fsi-app/.discipline/rendering/audit/spec/bandgradientrule.json
- fsi-app/.discipline/rendering/audit/spec/bandtile.json
- fsi-app/.discipline/rendering/audit/spec/chips.json
- fsi-app/.discipline/rendering/audit/spec/community-table.json
- fsi-app/.discipline/rendering/audit/spec/compose-01-dashboard.json
- fsi-app/.discipline/rendering/audit/spec/compose-02-regulations-list.json
- fsi-app/.discipline/rendering/audit/spec/compose-03-regulation-detail.json
- fsi-app/.discipline/rendering/audit/spec/compose-04-market-list.json
- fsi-app/.discipline/rendering/audit/spec/compose-05-market-detail.json
- fsi-app/.discipline/rendering/audit/spec/compose-06-research-list.json
- fsi-app/.discipline/rendering/audit/spec/compose-07-research-detail.json
- fsi-app/.discipline/rendering/audit/spec/compose-08-operations-list.json
- fsi-app/.discipline/rendering/audit/spec/compose-09-operations-profile.json
- fsi-app/.discipline/rendering/audit/spec/compose-10-map.json
- fsi-app/.discipline/rendering/audit/spec/compose-11-watchlist.json
- fsi-app/.discipline/rendering/audit/spec/compose-12-community.json
- fsi-app/.discipline/rendering/audit/spec/compose-13-admin-registry.json
- fsi-app/.discipline/rendering/audit/spec/compose-13-admin.json
- fsi-app/.discipline/rendering/audit/spec/compose-14-account.json
- fsi-app/.discipline/rendering/audit/spec/compose-15-settings.json
- fsi-app/.discipline/rendering/audit/spec/compose-16-auth.json
- fsi-app/.discipline/rendering/audit/spec/compose-16-signup.json
- fsi-app/.discipline/rendering/audit/spec/compose-17-onboarding.json
- fsi-app/.discipline/rendering/audit/spec/compose-regulations-register.json
- fsi-app/.discipline/rendering/audit/spec/detailsection.json
- fsi-app/.discipline/rendering/audit/spec/detailtagrow.json
- fsi-app/.discipline/rendering/audit/spec/factblocks.json
- fsi-app/.discipline/rendering/audit/spec/factcard.json
- fsi-app/.discipline/rendering/audit/spec/filterchipgroup.json
- fsi-app/.discipline/rendering/audit/spec/highrelevance.json
- fsi-app/.discipline/rendering/audit/spec/impactmeter.json
- fsi-app/.discipline/rendering/audit/spec/inthisliststat.json
- fsi-app/.discipline/rendering/audit/spec/list-surface-virtualized.json
- fsi-app/.discipline/rendering/audit/spec/list-surface.json
- fsi-app/.discipline/rendering/audit/spec/listrow.json
- fsi-app/.discipline/rendering/audit/spec/map-register.json
- fsi-app/.discipline/rendering/audit/spec/market-research-rows.json
- fsi-app/.discipline/rendering/audit/spec/masthead.json
- fsi-app/.discipline/rendering/audit/spec/milestonetimeline.json
- fsi-app/.discipline/rendering/audit/spec/mobile-01-dashboard.json
- fsi-app/.discipline/rendering/audit/spec/mobile-02-regulations-list.json
- fsi-app/.discipline/rendering/audit/spec/mobile-03-regulation-detail.json
- fsi-app/.discipline/rendering/audit/spec/mobile-04-market-list.json
- fsi-app/.discipline/rendering/audit/spec/mobile-06-research-list.json
- fsi-app/.discipline/rendering/audit/spec/mobile-08-operations-list.json
- fsi-app/.discipline/rendering/audit/spec/mobile-10-map.json
- fsi-app/.discipline/rendering/audit/spec/mobile-11-watchlist.json
- fsi-app/.discipline/rendering/audit/spec/mobile-18-drawer.json
- fsi-app/.discipline/rendering/audit/spec/onboarding-stepper.json
- fsi-app/.discipline/rendering/audit/spec/operations-matrix-nofigure.json
- fsi-app/.discipline/rendering/audit/spec/operations-matrix-selected.json
- fsi-app/.discipline/rendering/audit/spec/operations-matrix-six-regions.json
- fsi-app/.discipline/rendering/audit/spec/operations-matrix.json
- fsi-app/.discipline/rendering/audit/spec/page-frame.json
- fsi-app/.discipline/rendering/audit/spec/railcards.json
- fsi-app/.discipline/rendering/audit/spec/section-card-lists.json
- fsi-app/.discipline/rendering/audit/spec/sectionindex.json
- fsi-app/.discipline/rendering/audit/spec/settings-notifications.json
- fsi-app/.discipline/rendering/audit/spec/settings-section-index.json
- fsi-app/.discipline/rendering/audit/spec/skeleton.json
- fsi-app/.discipline/rendering/audit/spec/statblock.json
- fsi-app/.discipline/rendering/audit/spec/statenote.json
- fsi-app/.discipline/rendering/audit/spec/summarydepthswitch.json
- fsi-app/.discipline/rendering/audit/spec/tabrow.json
- fsi-app/.discipline/rendering/audit/spec/tagpopover.json
- fsi-app/.discipline/rendering/audit/spec/watchbutton.json
- fsi-app/.discipline/rendering/browser/rendered-text.mjs
- fsi-app/.discipline/rendering/capture-compose-11-watchlist.mjs
- fsi-app/.discipline/rendering/capture-compose-dashboard.mjs
- fsi-app/.discipline/rendering/capture-compose-details.mjs
- fsi-app/.discipline/rendering/capture-compose-lists-screenshots.mjs
- fsi-app/.discipline/rendering/capture-compose-page.mjs
- fsi-app/.discipline/rendering/capture-dashrow-screenshot.mjs
- fsi-app/.discipline/rendering/capture-defect-fix-screenshots.mjs
- fsi-app/.discipline/rendering/capture-detail-mobile-screenshots.mjs
- fsi-app/.discipline/rendering/capture-meterfix-screenshots.mjs
- fsi-app/.discipline/rendering/capture-opsmatrix5-screenshots.mjs
- fsi-app/.discipline/rendering/capture-uxfix-lists-fixture-screenshots.mjs
- fsi-app/.discipline/rendering/capture-uxfix-lists-screenshots.mjs
- fsi-app/.discipline/rendering/compose-composite.mjs
- fsi-app/.discipline/rendering/exemptions-375.mjs
- fsi-app/.discipline/rendering/exemptions-law2-desktop.mjs
- fsi-app/.discipline/rendering/fixtures/fonts/anton/anton-latin-400-normal.woff2
- fsi-app/.discipline/rendering/fixtures/fonts/plus-jakarta-sans/plus-jakarta-sans-latin-400-normal.woff2
- fsi-app/.discipline/rendering/fixtures/fonts/plus-jakarta-sans/plus-jakarta-sans-latin-500-normal.woff2
- fsi-app/.discipline/rendering/fixtures/fonts/plus-jakarta-sans/plus-jakarta-sans-latin-600-normal.woff2
- fsi-app/.discipline/rendering/fixtures/fonts/plus-jakarta-sans/plus-jakarta-sans-latin-700-normal.woff2
- fsi-app/.discipline/rendering/fixtures/fonts/plus-jakarta-sans/plus-jakarta-sans-latin-800-normal.woff2
- fsi-app/.discipline/rendering/layout-guard/allowlists.mjs
- fsi-app/.discipline/rendering/layout-guard/baseline.json
- fsi-app/.discipline/rendering/layout-guard/collect.mjs
- fsi-app/.discipline/rendering/layout-guard/generate-manifests.mjs
- fsi-app/.discipline/rendering/layout-guard/manifests.json
- fsi-app/.discipline/rendering/layout-guard/manifests.mjs
- fsi-app/.discipline/rendering/layout-guard/routes.mjs
- fsi-app/.discipline/rendering/layout-guard/run-layout-guard.mjs
- fsi-app/.discipline/rendering/panel21c-accept.mjs
- fsi-app/.discipline/rendering/smoke/action-card-smoke.mjs
- fsi-app/.discipline/rendering/smoke/admin-stat-tiles-smoke.mjs
- fsi-app/.discipline/rendering/smoke/command-bar-search-portal-smoke.mjs
- fsi-app/.discipline/rendering/smoke/community-smoke.mjs
- fsi-app/.discipline/rendering/smoke/corridor-scope-smoke.mjs
- fsi-app/.discipline/rendering/smoke/cross-page-smoke.mjs
- fsi-app/.discipline/rendering/smoke/detail-surfaces-smoke.mjs
- fsi-app/.discipline/rendering/smoke/guard-assert.mjs
- fsi-app/.discipline/rendering/smoke/impact-meter-partial-smoke.mjs
- fsi-app/.discipline/rendering/smoke/inference-section-smoke.mjs
- fsi-app/.discipline/rendering/smoke/labour-chain-smoke.mjs
- fsi-app/.discipline/rendering/smoke/lead-time-chart-smoke.mjs
- fsi-app/.discipline/rendering/smoke/masthead-balance-smoke.mjs
- fsi-app/.discipline/rendering/smoke/narrow-overflow-live-fixes-smoke.mjs
- fsi-app/.discipline/rendering/smoke/ops-matrix-acceptance-smoke.mjs
- fsi-app/.discipline/rendering/smoke/parity-checks-smoke.mjs
- fsi-app/.discipline/rendering/smoke/record-grade-smoke.mjs
- fsi-app/.discipline/rendering/smoke/research-rows-smoke.mjs
- fsi-app/.discipline/rendering/smoke/scroll-container-attack-smoke.mjs
- fsi-app/.discipline/rendering/smoke/section-index-smoke.mjs
- fsi-app/.discipline/rendering/smoke/settings-section-index-smoke.mjs
- fsi-app/.discipline/rendering/smoke/spec09-smoke.mjs
- fsi-app/.discipline/rendering/smoke/stub-auth-provider.mjs
- fsi-app/.discipline/rendering/smoke/stub-community-css.mjs
- fsi-app/.discipline/rendering/smoke/stub-empty-css.mjs
- fsi-app/.discipline/rendering/smoke/stub-next-link.mjs
- fsi-app/.discipline/rendering/smoke/stub-next-navigation-account.mjs
- fsi-app/.discipline/rendering/smoke/stub-next-navigation-admin.mjs
- fsi-app/.discipline/rendering/smoke/stub-next-navigation-community.mjs
- fsi-app/.discipline/rendering/smoke/stub-next-navigation-item.mjs
- fsi-app/.discipline/rendering/smoke/stub-next-navigation-login.mjs
- fsi-app/.discipline/rendering/smoke/stub-next-navigation-onboarding.mjs
- fsi-app/.discipline/rendering/smoke/stub-next-navigation-settings.mjs
- fsi-app/.discipline/rendering/smoke/stub-next-navigation-signup.mjs
- fsi-app/.discipline/rendering/smoke/stub-next-navigation.mjs
- fsi-app/.discipline/rendering/smoke/stub-supabase-browser-account.mjs
- fsi-app/.discipline/rendering/smoke/stub-supabase-browser-auth.mjs
- fsi-app/.discipline/rendering/smoke/stub-supabase-browser-no-session.mjs
- fsi-app/.discipline/rendering/smoke/stub-supabase-browser.mjs
- fsi-app/.discipline/rendering/smoke/ux-harness.mjs
- fsi-app/.discipline/rendering/ux-assert.mjs
- fsi-app/.discipline/rendering/verify-meterfix-surfaces.mjs
- fsi-app/.discipline/rendering/verify-ppwr-title-style.mjs
- fsi-app/.discipline/rules/017-generation-config-no-raw-env.mjs
- fsi-app/.discipline/rules/019-source-reclassify-not-archive.mjs
- fsi-app/.discipline/rules/021-cached-shape-key.mjs
- fsi-app/scripts/producers/oem/fixtures/eea-hdv-sample.header.json
- fsi-app/scripts/producers/operations/fixtures/ukpn-capacity-heatmap-sample.header.md
- fsi-app/scripts/producers/regional/fixtures/neso-carbon-intensity-sample.header.md
- fsi-app/scripts/turns/question-answers/fixtures/question-answers-000.fixture.json
- fsi-app/scripts/turns/theme-briefs/fixtures/theme-briefs-000.fixture.json
- fsi-app/scripts/verify/no-personal-identifiers.test.mjs
- fsi-app/src/__tests__/market-eu-oil-bulletin-parser.fixtures.mjs
- fsi-app/src/__tests__/market-series-registry.test.mjs
- fsi-app/src/__tests__/oil-bulletin-workbook.fixtures.mjs
- fsi-app/src/__tests__/origin-class-mapping.test.mjs
- fsi-app/src/__tests__/prose-renderer-scope.test.mjs
- fsi-app/src/app/api/agent/run/guard-fail-closed.npmtest.mjs
- fsi-app/src/app/api/orgs/invitations-revoke-order.npmtest.mjs
- fsi-app/src/app/api/search/route-user-client.npmtest.mjs
- fsi-app/src/components/community/community-sidebar-route.test.mjs
- fsi-app/src/components/dashboard/band-tile-count-source.npmtest.mjs
- fsi-app/src/components/list-surface/live-facet-counts.npmtest.mjs
- fsi-app/src/components/regulations/UpcomingObligationsStripScope.npmtest.mjs
- fsi-app/src/components/sources/SourceStateStrips.npmtest.mjs
- fsi-app/src/components/ui/AntonTitleLetterSpacing.npmtest.mjs
- fsi-app/src/lib/agent/canonical-pipeline.markers.npmtest.mjs
- fsi-app/src/lib/agent/canonical-pipeline.research-context.npmtest.mjs
- fsi-app/src/lib/agent/canonical-pipeline.write-fields.npmtest.mjs
- fsi-app/src/lib/agent/gate-a-match.test.mjs
- fsi-app/src/lib/agent/gate-a-scan-harvest-skips.test.mjs
- fsi-app/src/lib/agent/gate-a-scan.test.mjs
- fsi-app/src/lib/agent/holdings-keying.npmtest.mjs
- fsi-app/src/lib/agent/timeline-harvest-unlock.npmtest.mjs
- fsi-app/src/lib/community/no-dm-guard.test.mjs
- fsi-app/src/lib/connections/resource-lookup.npmtest.mjs
- fsi-app/src/lib/sources/change-sweep.test.mjs
- fsi-app/src/lib/sources/classify-source-role.identity-signals.test.mjs
- fsi-app/src/lib/sources/classify-source-role.selftest.mjs
- fsi-app/src/lib/sources/host-authority-class-tier.test.mjs
- fsi-app/src/lib/sources/host-authority-d14-residue-ruling.npmtest.mjs
- fsi-app/src/lib/sources/host-authority-gov-label-and-legal-publisher.npmtest.mjs
- fsi-app/src/lib/sources/host-authority-ruling-conformance.test.mjs
- fsi-app/src/lib/sources/host-authority.npmtest.mjs
- fsi-app/src/lib/sources/institution.test.mjs
- fsi-app/src/lib/sources/reconcile.npmtest.mjs
- fsi-app/src/lib/sources/standards-body-class.test.mjs
- fsi-app/src/lib/sources/tier-opinion-dedup.npmtest.mjs
- fsi-app/src/lib/sources/transport-hold-wiring.npmtest.mjs
- fsi-app/src/lib/sources/w2f-basetier.npmtest.mjs
- fsi-app/src/lib/supabase-server-dropped-errors.npmtest.mjs
- fsi-app/src/lib/workspace/notes-path-retired.test.mjs
- fsi-app/src/lib/workspace/relevance.test.mjs
