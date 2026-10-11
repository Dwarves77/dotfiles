## Section 7: Worked Examples

Each example follows the template: What failed → Class problem → Class fix → Recognition signals fired.

### Example 1: Batch resilience — Q4 sources 21/22

**What failed.** The Q4 bias-classification batch script (`fsi-app/scripts/q4-bias-batch-assign.mjs`) ran 20 sources cleanly in its sample validation, then failed at sources 21+22 of the 776-source full batch with two distinct errors: Anthropic API request timed out at source 21 (Yukon Department of Environment); pg client emitted `Connection terminated unexpectedly` at source 22 (International Transport Forum), crashing the script unrecoverably. Sample validation (20 sources) didn't trigger either failure mode reliably because: Anthropic API timeouts are intermittent network events with low per-call probability; Supabase pooler disconnects idle connections after a window that 20 fast calls don't expose.

**Class problem.** Long-running batch scripts lack durable resilience primitives. Every batch reinvents retry/reconnect/rate-limit/idempotency from scratch. Q4 was the first instance to fail visibly; Q7 daily recompute would have hit the same pg-disconnect failure mode at first production run; every future LLM batch (classifier re-runs, brief regeneration) would re-discover Anthropic timeouts the same way.

**Class fix.** Extracted `fsi-app/scripts/lib/batch-primitives.mjs` with `withRetry`, `withRateLimit`, `withIdempotency`, `createPgPool`, `createProgressReporter` primitives. Refactored Q4 batch script + Q7 daily batch script to consume the library. Codified Batch-script resilience rule as 7th named binding rule in sprint-followups-discipline. Extended OBS-51 with Resolution section pointing at the library + rule + refactors.

**Recognition signals fired.** Signal 2 (infrastructure-variation: Anthropic timeout + pg disconnect are platform realities); signal 4 (reinventing-the-wheel: every future batch would rebuild). Class confirmed.

### Example 2: Sweep methodology — Build 6 admin gating

**What failed.** The Build 6 admin-gating sweep (commit 6d18773) enumerated remembered admin routes and verified each calls `isPlatformAdmin`. The sweep missed 13 routes because the dispatcher relied on recall rather than `Glob src/app/api/admin/**/*.ts`. A 2026-05-19 code-level positive-test audit (dispatched after seeding `jasonlosh@hotmail.com` with `is_platform_admin=true`) found the 13 Build-6-missed routes but ALSO missed 4 additional ungated routes under the `sources/[id]/` subtree AND miscalled 2 worker-secret cron routes as `requireAuth`-only based on directory location. Track B-code re-enumeration (commit 4c7b546) applied enumerate-first discipline (Glob the surface + grep each enumerated route) and produced a correct 15-route fix scope.

**Class problem.** Sweep dispatches that enumerate from memory or pattern-match miss items; the failure mode is invisible until a later sweep catches the gap. Pattern applies to any sweep on any surface family (route, column, constraint, file pattern).

**Class fix.** Sweep-discipline rule (4th named binding rule in sprint-followups-discipline, commit ae8734c) mandates Glob-first or schema-query-first enumeration + criterion check per enumerated item + explicit discrepancy surfacing in the dispatch report.

**Recognition signals fired.** Signal 1 (recurrence: Build 6 + 2026-05-19 audit + Track B-code, three sweeps three failure-modes); signal 4 (reinventing: any future sweep on any surface family would reinvent). Class confirmed.

### Example 3: Type-system drift — Q2 schema-vs-code break

**What failed.** Q2 migration 090 renamed `sources.tier` to `sources.base_tier` and added `sources.effective_tier`. Deployed master code (at commit 537ad38 and earlier) still read `sources.tier`. Production reads broke immediately at the PostgREST column-resolution layer. Sample validation insufficient because the codebase uses stringly-typed Supabase clients (no generated `Database` types); typecheck didn't catch the breakage at compile time, only at request time in production.

**Class problem.** Schema migrations that rename or restructure columns break deployed consumers silently when the type system doesn't surface the drift at compile time. Pattern recurs anywhere schema and code drift independently.

**Class fix.** Compatibility-shim pattern: migration 094 added `sources.tier` back as a regular column synced to `base_tier` via BEFORE INSERT OR UPDATE trigger plus CHECK constraint enforcing the lockstep. Phase 1.5 consumer migration switches each call site explicitly to `base_tier` or `effective_tier` per operator-decided default rule (customer-facing → effective; admin/system-internal → base). Shim drops via cleanup migration once Phase 1.5 verification confirms all consumers migrated.

**Recognition signals fired.** Signal 3 (shared codepath: ~50 consumer sites across ~25 files); signal 4 (reinventing: every future schema rename would face same drift). Class confirmed.

### Example 4: API contract gaps — Q10 URL canonicalization

**What failed.** Source registry lookups did exact-string URL matches across 10 resolution sites in `src/lib/sources/` and `src/app/api/admin/canonical-sources/`. Citations with trailing-slash/www/query-param drift silently failed to resolve to the registered source, instead creating duplicates in `provisional_sources`. The pattern was invisible until a deliberate duplicate scan surfaced 9 duplicate sets in `sources` + 29 cross-table collisions between `sources` and `provisional_sources`.

**Class problem.** Identifier comparisons across system boundaries need canonicalization. Same class includes timestamp normalization, jurisdiction code matching, any normalize-before-compare pattern.

**Class fix.** Extracted `canonicalizeUrl` helper at `fsi-app/src/lib/sources/url-canonicalize.ts`. Applied at all 10 enumerated resolution sites. Migration 087 backfilled existing URLs (`sources.url`, `provisional_sources.url`, AND `intelligence_items.source_url` denormalized cache; the cache was a Suspect in the Sources-schema-touch precondition audit and surfaced for resolution rather than silently broken). Q10 duplicate-merge dispatch deferred per operator (bounded operator-merge work).

**Recognition signals fired.** Signal 3 (shared codepath: 10 resolution sites with same broken pattern); signal 4 (reinventing: future source-resolution code without the helper would rebuild). Class confirmed.

### Example 5: Tool reliability — Glob filesystem snapshot inconsistency

**What failed.** Glob tool calls in different sub-agent contexts at the SAME git SHA returned different results for the same path pattern. Specifically `docs/sprint-1/followups.md` was visible in some worktree contexts and not in others. Surfaced 4+ times across Q1, Q3, Q6, Q10 sub-agent reports each mentioning a variant of "docs/sprint-1/followups.md not visible in my worktree."

**Class problem.** Agent-layer tooling occasionally returns inconsistent filesystem state across contexts. Pattern is platform-tool-layer; root cause not yet investigated. Hypothesis space: stale filesystem snapshot in tool implementation; per-worktree visibility variance; permission-scope inheritance from main session.

**Class fix (partial).** Defensive discipline encoded in dispatch briefs: "if Glob returns 'No files found' for a path you expect to exist, try direct Read of the expected path AND a Bash ls as backstop before concluding absence." No primitive extracted yet because root cause unknown. Tracked as emerging pattern (Section 4.5) pending systematic investigation. Promotion to full primitive-extraction class fix happens when root cause is understood.

**Recognition signals fired.** Signal 1 (recurrence: 4+ instances); signal 2 (infrastructure-variation: tool layer). Class confirmed; class FIX is partial.

### Example 6: Architectural codification — source-credibility-model encoding as proactive class fix

**What failed.** Not a failure in the usual sense. The six-element source credibility model existed only as a long architectural conversation transcript (2026-05-19 conversation that closed 10 questions Q1-Q10). Without canonical encoding, future dispatches would reference the model from operator memory or by re-reading transcripts, with inevitable drift as the model evolved. Build 8 (Research) would re-derive the Q9 Research signal set from scratch; effective_tier consumers would re-derive the COALESCE formula; bias vocabulary would drift across classifier prompt updates.

**Class problem.** Architectural decisions that live only in transcript become unreferenceable; future work reinvents or drifts. Pattern applies to any architectural decision: data models, design principles, vocabularies, signal sets, formulas.

**Class fix.** Encode as canonical skill: `fsi-app/.claude/skills/source-credibility-model/SKILL.md` (commit 6065dea) with the full six-element model, verbatim Q4 bias vocabulary, verbatim Q7 thresholds, verbatim Q9 signal-set table, cross-references to env-policy hierarchy + platform-intent + design-principles + the decisions doc. Plus Source-credibility-model load-trigger rule as 5th named binding rule in sprint-followups-discipline (Option A pattern) so future dispatches load the skill at the right moments.

**Recognition signals fired.** Signal 4 (reinventing: every future build touching credibility surfaces would re-derive the model from transcript). Class confirmed.

**Note.** This is a PROACTIVE class fix, not failure-driven. The class-over-instance principle applies to architectural codification too, not just bug-driven remediation. Same lens: would future work reinvent? Yes → codify.

### Example 7: Bypassing-existing-infrastructure — worktree cleanup

**What failed.** Operator audit (2026-05-20) surfaced 22+ stale git worktrees at `C:/Users/jason/dotfiles-wt-*` from merged-branch dispatches in this session and prior. Worktrees accumulated because the sibling-to-repo-root path convention this session adopted did not match the paths that `superpowers:finishing-a-development-branch` (FaDB) recognizes as eligible for automatic cleanup. FaDB only auto-cleans worktrees under `.worktrees/`, `worktrees/`, or `~/.config/superpowers/worktrees/`; sibling paths are treated as host-managed; FaDB refuses to remove them. Cleanup never ran.

**Class problem.** Not "we lack cleanup logic" — FaDB owns cleanup discipline. The actual class problem was "we built worktree creation in a way that hid our worktrees from the skill that would have cleaned them up." This is a non-obvious form of anti-pattern 5 (reinventing primitives): we weren't writing new cleanup code, we were creating a parallel convention that bypassed an existing primitive.

**Class fix.** Two-part conformance:
- Going-forward: new worktrees go under `C:/Users/jason/dotfiles/.worktrees/wt-<name>` per FaDB recognized paths. FaDB Step 6 auto-cleanup applies on dispatch completion. Convention note added to sprint-followups-discipline.
- Instance cleanup: `fsi-app/scripts/cleanup-merged-worktrees.mjs` enumerates worktrees, verifies merge state + cleanliness + push state, removes worktree + deletes branch in --execute mode. Auto-excludes protect-list. Dry-run default. Bulk-cleaned 15 session-merged worktrees at commit 261a751.

**Recognition signals fired.** Signal 1 (recurrence — 22+ instances), Signal 3 (shared codepath — every dispatch creates worktree the same way), Signal 4 (reinventing — built parallel cleanup convention to address what FaDB already solved). 3 of 4 → class confirmed.

**Meta-lesson worth surfacing.** Before building new primitives, invoke existing skills to verify nothing already owns the discipline. The using-superpowers skill mandates this; we missed it because the worktree workflow felt project-internal. The 22 stale worktrees were the compound interest on that improvisation. Adding to anti-pattern 5: "reinventing" includes inventing PARALLEL CONVENTIONS that bypass existing primitives, not just inventing new code.

**Sub-issue (OBS-53, second-order class problem).** The cleanup script's fallback path was not junction-aware. When `git worktree remove --force` failed on a specific worktree (Windows path edge case), the operator fallback `rm -rf` followed an internal `node_modules` junction back to the main repo and destroyed `C:/Users/jason/dotfiles/fsi-app/node_modules`. Required `npm install` to restore. Resolution: cleanup script extended with junction-aware fallback that removes junctions explicitly (via `rmdir` not `rm -rf`) before recursive removal. Documented in this same dispatch.

**Sub-issue (OBS-54 sub-finding, third-order class problem).** The 3-axis skill audit (commit `383974e`, 2026-05-20) reported drift across 3 worktrees; sync sub-dispatches found only 1 actually existed on disk. The other 2 paths were stale `additionalDirectories` entries in `~/.claude/settings.json` left from earlier worktree creations and never cleaned at worktree-removal time. A wider sweep found 6 total stale entries spanning 4 missing paths (`dotfiles-migration-026`, `dotfiles-hotfix-surfaces`, `dotfiles-wt-track-b-doc`, `dotfiles-wt-skill-credibility`).

**Resolution: 3-step worktree-cleanup-after-merge discipline (codified in this same dispatch).** Worktree cleanup is multi-step:

1. `git worktree remove <path>` (or `--force` if needed). Detaches the worktree from git's bookkeeping.
2. `rm -rf <worktree-path>` IF the directory persists after step 1. Use junction-aware fallback per OBS-53.
3. Remove every `additionalDirectories` entry in `~/.claude/settings.json` (and any similar config registry, including permission `allow` rules pointing into the worktree path) that references the removed worktree's path.

`finishing-a-development-branch` Step 6 handles step 1 automatically for worktrees under the recognized paths convention. Steps 2 and 3 still require explicit discipline; the convention does not subsume them. Extending `fsi-app/scripts/cleanup-merged-worktrees.mjs` to also perform step 3 (config-registry sweep) is a primitive-extraction candidate; bundle with the next worktree-cleanup-script touch.

**Binding lesson for audit dispatches.** Drift detection that relies on path registration (settings.json, config files, skill registries) without filesystem validation produces false positives. Audit dispatches that scan registered paths MUST validate filesystem presence (`test -d` or equivalent) before treating an entry as a drift instance to remediate. The 3-axis audit's AXIS 2 (load discipline + drift) is the worked instance: it reported 3 drifting worktrees from registered paths; only 1 was real. Going-forward audit-dispatch briefs include filesystem-validation as a pre-flight step.
