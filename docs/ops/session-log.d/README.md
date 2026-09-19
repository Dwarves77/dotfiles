# Session Log (per-lane files)

Entry format, carried over from the top of `docs/ops/session-log.md` (deviation from a byte-verbatim
copy, noted here: the source line uses an em dash before "never in `CLAUDE.md`"; this copy uses a comma
in its place, per this session's own no-em-dash constraint):

> Dated, appended entries. Newest first. Per the operating manual (standing rule #6 + self-annealing
> protocol), session state lives here, never in `CLAUDE.md` (doctrine, not state).

## Why this directory exists

D28 (`docs/plans/defect-fix-plan-2026-09-12.md`, W9 lane L18): every lane appended to the one
`docs/ops/session-log.md` file, so every rebase onto a master that had merged another lane's own
appended entry conflicted on it. One night, four lanes (L14, L6, L12, L9c) and L13 hit that conflict, and
two push chains swallowed it and pushed half-rebased trees that then failed the memory gate. A file under
this directory satisfies the SAME vault requirement (`fsi-app/.discipline/governance/memory-gate.mjs`,
step 2b of `fsi-app/.discipline/hooks/pre-push`, and the CI "Memory gate" step in
`.github/workflows/discipline.yml`) with nothing shared to conflict on.

## The rule

**One file per lane per day. Never edit another lane's file.**

- Filename: `YYYY-MM-DD-<slug>.md`, where `<slug>` is the lane's own short identifier (e.g. `l18`, the
  lane number from the defect-fix plan or dispatch brief).
- A lane appends to or creates only its own dated file. It never opens or edits a file another lane
  created, even to fix a typo, even after that lane's own work has merged.
- The content inside each file follows the same entry shape session-log.md entries already use: what was
  accomplished, decisions made, blockers, next steps, dated.
- `docs/ops/session-log.md` stays live for coordinator entries (defect-fix plans, cross-lane rulings,
  session close-outs that are not one lane's own work).
- A file in this directory is recognized by the memory gate as satisfying its vault requirement; this
  README file itself is not (its name carries no date or slug, by design, so simply adding this README
  does not, on its own, satisfy the gate for any other range).
- The UX compliance block (required when a lane's range touches a `.tsx` or `.css` file) goes in that
  same lane's own file here, not in `docs/ops/session-log.md`; the memory gate reads it there (lane
  D28b, 2026-09-19).
