Status: RULED 2026-10-11

# Build plan and agent plan: fix it all (2026-10-11, ruled by the operator: "fix everything now")

Inputs (all delivered today): registers 1 (traceability, 179 rows), 2A/2B (enforcement, 396 rows), 3 (failure
ledger, 121 reds), DB-1 (schema, 262 objects), ABSENT-LIST (21 rows), C-LIST (45 overlap groups, 33 dead/unwired),
E-LIST (214 files to archive), OWED-LIST (every tagged-but-not-done finding; landing). Principle: subtract first,
then close every owed row, then build the eleven missing capabilities, then run for real. Nothing is "flagged for
later": every row below ends in a lane name or a REFUTED with evidence.

The yardstick (operator 2026-10-11): a skill, tool, check or lane is useful only if it serves CAPABILITY (makes the
output better than anything that exists), LEARNING (lets the system improve and adapt as sources and rules change),
or the MINIMUM SELF-MAINTENANCE that protects those two. Every brief names the class; a thing serving none is deleted.
New ideas built on others' as the basis; nothing repeated.

Done means: register 1 shows 0 ABSENT/UNWIRED/UNCONSUMED/UNPROVEN rows (or RETIRED by ADR); the registry has under
150 rows, every one with evidence; DB-1 shows 0 DEAD objects and every READ-ONLY table with a writer or a ruling;
OWED-LIST shows 0 open rows; one CI workflow, a code PR under 12 billed minutes; the chain proof green; the
acceptance tables green for everything built; then Stage 9 proves the runtime half on real data.

## Waves (each wave's merge is gated by the previous wave's green master)

W1  PIPELINE (today). PIPE-1 merges; executor switches required checks to the five jobs; then the parked PRs in
    one sequence under the new pipeline: 1111 MIGTEST-2, 1109 SMOKE-5, 1112 HALF-1, 1100 DRIFT-1 (+384/385
    applied), 1108 headers, chain proof fire 10, the audit-directory PR (registers + plans into docs/audits and
    docs/plans). Proof: a docs PR under 3 billed minutes, a code PR under 12.
W2  SUBTRACT (parallel, disjoint write sets). REG-1 one registry/runner (in flight). HOOK-1 three-step hook. DB-2
    dead schema objects dropped, read-only tables ruled. SPEC-1 retired markers (Haiku). ACCEPT-1 acceptance tables
    (after REG-1). GATE-2 the disposition gate tightened (owed-without-lane fails; deferral-worded NOT-WORK fails;
    a lane with no log after 7 days fails; `[HYPOTHESIS]` in an audit older than 14 days fails). DRIFT-2 the fire-10
    residue (after fire 10). SEC-9 relaunch (after 1100). MASTER-RED-1 (1078) merged after fire 10 is green.
    SMOKE-6 (judgeAdminProbe wording, the SMOKE-5 owed row) and SA-1 (structured actions: the ruled
    `recommended_actions` column created by migration, the extractor's writer wired, dry) fold the two half-slices
    HALF-1 found.
W3  CLOSE EVERY OWED ROW. OWED-LIST is grouped by subsystem into lanes (expected 8 to 15: the TESTS-2 residue
    lenses aud-at1:73/aud-at2:74, audit-catalogue:43's 47 empty cells, the daudit rows, CONF-1 config parity, the
    register-3 "class prevented = NONE" rows, the fixture-tests-red-while-master-green class, the Docker image
    cache, the 20 disagreeing rows of register 1, the 14 of 2B, the 22 fitness/34 invariant disagreements of 2A).
    Each lane's brief lists its rows by file:line; its PR flips each to [CLOSED: PR N] or [REFUTED: evidence] in the
    same diff; the gate (GATE-2) refuses a merge that leaves a row of the lane's list open. Haiku for refutations
    and doc edits from an explicit list; Sonnet for anything that builds.
W4  THIN THE MEMORY. ARCH-1 archives the 214 files (Haiku, link rewrites from E-LIST). RULES-1 rule corpus into
    CLAUDE.md + one lane contract (Sonnet, coord/). MAP-1 system map regenerated from register 1 (Haiku). The
    session-log.d directory is kept; INDEX loses the archived lines. SKILLS-1 (Sonnet; operator 2026-10-11: "We are
    combining all of these skills and tools into singular functions"): the six custom skills under
    fsi-app/.claude/skills and the superpowers set are inventoried section by section (what it governs, what loads
    it per the PreToolUse gate's trigger map and the gate-audit.log's 5,855 decisions, whether a registry row or a
    rule already governs it); overlapping sections merge; untriggered sections and sections duplicating a registry
    row are deleted; the gate's trigger map becomes the single source; skill-slim's conservation test is updated to
    the merged text. Rule: a section stays if it governs a property with evidence of use.
W5  BUILD THE ELEVEN (the product). By surface, Sonnet, each with its acceptance tests from ACCEPT-1 as the
    definition of done and ux-laws/artboards for the look: REGS-B (obligation card, horizon lane, export/snapshot),
    MKT-B (peer cohort benchmark, capacity and reliability panel), RES-B (who-is-studying panel, obligation calendar
    join), OPS-B (feasibility gate layer, materials-compliance join, distance-to-node). Plus batch 3's remaining
    build lanes (REG-S4, PORT-2, PROD-2, DOM-2, WIRE-2) re-briefed against the registers. R-18 (16 unconfirmed legal
    facts) is a Stage 9 data task.
W6  STAGE 9 (operator's word). The population pass (migration 299 + the 146-item re-mint it was held for), real
    runs of every harness family, the live traceability column of register 1 filled from the ledger, production
    minutes measured against the 500/month target. Go-live follows.

## Agent plan

Roles: coordinator (designs, never executes), one executor (merges, applies migrations, refreshes, reports
master runs and minutes), build lanes (Sonnet), mechanical lanes (Haiku, explicit lists only, diff read by the
executor before merge), fact lanes (read-only, one register each).
Concurrency: at most 4 build lanes live at once plus the executor; write sets disjoint by construction (the
brief names every file; a second lane never gets a file a live lane holds). Every lane: one worktree, WIP
pushes with [skip ci], master merged in before the final push, rule 17 checks on the merged tree, ONE final push,
two CI runs maximum, then it ends; a second red comes to the coordinator with the failing line and the proposed
fix. Nothing pushed after the green run.
Minutes: 888 left this month at 1,112 used; the pause line is 1,500. Under the new pipeline a code PR is ~10
billed, a docs PR ~3. Estimate: W1 ~80, W2 ~90, W3 ~150, W4 ~15, W5 ~120: ~455, inside the budget with the
pause line respected; W6 runs after the monthly reset or inside measured headroom. The executor's minutes line
is in every report; at 1,500 everything but W1 stops.
Safety: every deletion is proven by the deleting PR's own green run; the executor's post-merge master check after
every burst; MASTER-RED-1 blocks merges on two consecutive master reds; data-deleting statements and
intelligence_summaries' drop go to the operator first; no schedules in build mode; no live writes before W6.
Reporting: the coordinator reports milestones (a wave landed, a red on master, the minutes line) and nothing
else; registers and plans are files in docs/, not chat.

## Sequence and dates (at today's pace)
W1 Oct 11. W2 Oct 11-12. W3 Oct 12-14. W4 Oct 14. W5 Oct 15-22. W6 from Oct 23 on the operator's word.
Go-live: early November, unchanged.

## Registers in this directory

Every table row in these registers ends in a disposition token naming the lane or PR that closes it.

- [aud-sys-1-traceability-2026-10-11](./aud-sys-1-traceability-2026-10-11.md): spec-to-runtime traceability, 179 rows.
- [aud-sys-2a-enforcement-2026-10-11](./aud-sys-2a-enforcement-2026-10-11.md): fitness functions, rules and invariants.
- [aud-sys-2b-enforcement-2026-10-11](./aud-sys-2b-enforcement-2026-10-11.md): workflow jobs, hooks and verify scripts.
- [aud-sys-3-failure-ledger-2026-10-11](./aud-sys-3-failure-ledger-2026-10-11.md): the 121 red runs and the class each one prevented.
- [db-1-schema-traceability-2026-10-11](./db-1-schema-traceability-2026-10-11.md): tables, functions and views.
- Machine lists (rule 5): [owed-list](../../archive/logs/whole-build-audit-2026-10-11/owed-list-2026-10-11.md), [owed-2-resolved](../../archive/logs/whole-build-audit-2026-10-11/owed-2-resolved-2026-10-11.md), [c-list](../../archive/logs/whole-build-audit-2026-10-11/c-list-2026-10-11.md), [e-list](../../archive/logs/whole-build-audit-2026-10-11/e-list-2026-10-11.md), [absent-list](../../archive/logs/whole-build-audit-2026-10-11/absent-list-2026-10-11.md).
