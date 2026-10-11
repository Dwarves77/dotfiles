# Agent plan for the consolidation (ruled 2026-10-11: "Use sonnet and haiku agents to complete this now")

Safety rules for every wave: disjoint write sets (no two live lanes touch one file); Haiku only for mechanical work
from an explicit list (every Haiku PR's diff is read by the executor before merge); Sonnet for anything with a
judgment; a deletion is proven by the same PR's green CI (what remains still passes) plus the executor's post-merge
master check; rule 19 (two CI runs per PR max); no force, no stash, no live data, no schedules (build mode); the
executor is the only merger. Budget: 1,077 Actions minutes left; wave 1 lands first because it cuts the per-PR cost
from ~30 billed to ~10.

WAVE 0 (now, no CI): executor finishes in-flight (GATE-PUSH-1b, 1100 + 384/385, 1108, chain proof fire 10, SMOKE-5)
and lands the four audit registers + the plan in docs/audits/whole-build-audit-2026-10-11/ in its next coord PR.
AUD-SYS-2A finishes (register). Haiku fact lanes produce the explicit lists: E-LIST (audits to archive + inbound
links + INDEX lines), ABSENT-LIST (the 16 ABSENT rows with their spec text verbatim, for the coordinator's BUILD/DROP
ruling). C-LIST (checks to merge/delete, from 2A+2B overlap groups and dead rows) after 2A lands.

WAVE 1 (CI, Sonnet): PIPE-1 builds `.github/workflows/ci.yml` (five jobs) beside the old workflows; merge; executor
switches the required contexts to the five new names; PIPE-2 (Haiku) deletes the old PR-triggered workflows and their
shape tests from PIPE-1's explicit list. Two PRs.

WAVE 2 (after PIPE-1; parallel, disjoint): REG-1 (Sonnet) one registry + runner for fitness/invariants/verify/goldens,
the data audits folded into the post-merge smoke job; REG-2 (Haiku) deletes the C-LIST rows; HOOK-1 (Sonnet) the hook
to three steps; HALF-1 (Sonnet) obligation_objects writer wired from the existing obligations runtime; HALF-2 (Sonnet)
publish_aggregate drop + the ADR-041 boundary check; ACCEPT-1 (Sonnet) per-surface acceptance test tables; BUILD/DROP
lanes for the 16 ABSENT rows per the coordinator's ruling.

WAVE 3 (Haiku unless noted): ARCH-1 archives per E-LIST; RULES-1 (Sonnet, coord/) rule corpus -> CLAUDE.md + lane
contract; MAP-1 regenerates the system map from register 1.

WAVE 4: Stage 9 on the operator's word.
