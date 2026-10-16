# Wave 2 common rules (every P2-02 .. P2-07 and P2-S1 brief includes this file by reference)

Repo github.com/Dwarves77/caros-ledge, default branch main (P2-00 and P2-01 merged: 7ecd1af3). Branch slice/<id> from main.
Git author exactly `Claude <noreply@anthropic.com>` (`git -c user.name=Claude -c user.email=noreply@anthropic.com commit`). No personal
name, e-mail or home path anywhere in the tree (scripts/ci/tree-checks.mjs fails the run). Work in your own fresh clone under the
session scratchpad (`gh repo clone Dwarves77/caros-ledge <dir>`; `npm ci`; never a junction, never a shared node_modules).
The old repo is C:\Users\jason\dotfiles, branch master at 646fb098c; headers cite it as `old_repo/<path>` with the `fsi-app/`
prefix dropped: `// Ported from old_repo/src/lib/x.ts (lines a-b)` (several lines per file allowed). A file with no old source
gets a line in scripts/ci/new-files.txt (`path | reason`).

READ WHOLE before writing: your register(s) (docs/plans/rebuild/part1/<x>.md), every old file its section 7 marks KEEP or
REFACTOR, the ASSEMBLY-INPUTS-2026-10-12.md rows that name your lane id (D.2 to D.6 interfaces, E.2 duplicates, H.1 defects),
the data-invariants.md lines for your INV ids, protected-properties.md for your PROP ids, and P2-01's merged tree under
src/core (its exports are the only `@/core/*` you may import unless your brief names another merged slice).

BUILD RULES
- Imports: `@/core/*` of merged slices only. A runtime call into a slice that is not merged goes through a `deps` object your brief
  names, with the exact member names given; no stub modules, no placeholder exports. P2-08 (turn) wires the deps.
- Rule tables and vocabularies are DATA: `.json` under `<module>/data/`, validated with zod at load. loc.mjs counts only
  ts/tsx/js/mjs code lines; data is not code. Logic stays in code.
- Handler pattern (from P2-01): `route()`, `requireUser`/`requireAdmin`/`requireOrgRole`, `parseJson`, `HttpError`, `dbError`,
  `LookupError` (503 with Retry-After for a failed guard or lookup read). Every Supabase read destructures `error` and acts on it; a
  failed read is never an empty list, never "not found", never cached. Bounded reads through `boundedRead`; whole-table reads only
  through `fetchAllRows` with a cap and a total order.
- Every runtime entry (a pass, a drain, a job, a stage) is a function `(deps, input) => Promise<{ counts: Record<string, number>;
  outcome: "ok" | "partial" | "failed"; notes: string[] }>` with a `dry` flag in `input`; it never calls `process.exit`, never reads
  the wall clock except through `deps.now`, and returns its counts to the caller (P2-08's recorder writes the ledger row). Rule 17:
  a runtime that has a downstream calls it in the same run through `deps`.
- Everything FREE: no `@anthropic-ai/*`, `openai`, Browserless or any metered client; no model-id literal. The injected-brief seam
  (session-authored input) is the replacement for every model call your register lists.
- Build mode: no schedule, no cron, no cadence anywhere; every runtime is dispatched (rule 16).
- Tests: `tests/<area>/*.test.ts`, node --test through tests/_support (reuse fake-db.ts, personas.ts, the client-swap loader);
  domain tests only, no snapshots. Every INV and attack in your brief is proven RED first against a deliberately broken copy
  (list the mutations in the report), then green. Route handlers get the persona matrix (anon, viewer, member, admin, owner,
  other-org member, platform admin) with expected statuses.
- No file under src/ over 400 code lines. No new dependency without a `budget` line in package.json saying why.
- Budget is a ceiling to build to. A feature is NEVER dropped to fit: if the budget cannot hold every feature in the brief, land
  everything and report the overage per file with the reason. src/core total must stay under the 25,000 gate across the wave.
- Nothing outside your directories except: scripts/ci/new-files.txt lines, `tests/`, and the P2-01 amendments your brief allows.
  Never edit another slice's files; a need in another slice goes in the report's INTERFACE GAPS line.

LANDING: `npm run lint && npm run typecheck && npm run build && npm test && npm run tree-checks && npm run loc` green locally;
ONE PR titled `<id> <name> (<LOC> lines)`; ONE CI run (a second only for a fix the coordinator asks for); nothing pushed after
green; `[skip ci]` on any WIP commit. PR body = the 10-line REPORT: 1 files and LOC per directory; 2 interface delivered (export
list diff against the brief); 3 invariants and attacks tested (ids, mutation count); 4 defects fixed (B- ids); 5 not ported and why;
6 headers audited (count, all resolving); 7 beyond the brief (each with its reason); 8 proof result; 9 CI run id; 10 decisions
for the coordinator. Then an IMPROVEMENTS block (`what | why better | cost | what it touches`), none applied unless inside budget
with no design and no interface change (then reported as built). Do not spawn agents. Do not ask the operator anything.

ADDENDUM 2026-10-16: READ FIRST, before the register: docs/plans/rebuild/WHY-2026-10-16.md (operator-authored). Its section 7 is the
decision procedure for every file you write and every improvement you weigh: an improvement that improves capability, learning or
self-maintenance at a cost smaller than its gain, keeps the design, every ruling, the free path and integrity, triggers the next
step, and changes neither the design nor how modules connect, is BUILT inside your budget and REPORTED; anything else goes on the
IMPROVEMENTS block with your recommendation. Section 6 names the failures and what prevents each; your report says which of them
your slice met and how.

ADDENDUM 2026-10-16 (operator: one system, not independent systems). Every slice from here on: (1) names in its report, for each
runtime it ships, WHO calls it (the turn stage, a route, another runtime) and WHAT it calls next; a runtime with no caller or no
downstream is not done; (2) a surface slice (P2-10 onward) proves its page from the output of a fixture turn (P2-08's
tests/integration/one-turn.test.ts extended with the surface's reader), never from rows it seeds itself; (3) no slice adds a
second way to do what a merged slice already does: the connection check in CI (scripts/ci/connections.mjs, P2-08) fails a
page-local engine or an uncalled runtime.
