# Wave-1 Archive-Logs Disposition + Vault-Topology Finding

Date: 2026-07-07
Scope: disposition of 6 untracked machine-evidence files in `docs/archive/logs/`, plus
the Obsidian-vault topology finding that reshaped the operator's "mirror to the vault" rider.
Decision: **track all 6 in place** (operator ruling 2026-07-07). No production data touched.

## The finding that reshaped the plan

The rider was: "mirror the re-homed evidence files into the Obsidian vault (the designated
backup knowledge space); untracked-on-disk is fragile across clean checkouts; repo stays SSOT;
one-way mirror; keep the two-homes drift class from re-forming."

That rests on a premise that the machine does not support. Verified directly:

- `%APPDATA%\obsidian\obsidian.json` registers **exactly one vault**: `C:\Users\jason\dotfiles\docs`
  — the repo's own `docs/` folder. `ts` present, `open: true`.
- No Obsidian Sync: `docs/.obsidian/` has no `sync.json` / sync dir; no community plugins.
- No other `.obsidian` vault anywhere under `C:\Users\jason` (find, depth 3).

**Therefore the Obsidian vault IS the repo's `docs/`.** There is no separate "designated backup
knowledge space" to mirror into — `docs/archive/logs/` is already inside the vault. Consequences:

- "Mirror into the vault" is a no-op: the files are already in the vault by virtue of being in `docs/`.
- Gitignoring them does NOT make them durable — a `git clean -fdx` or a fresh clone wipes untracked
  files under `docs/` all the same. There is no out-of-band copy.
- The ONLY mechanism that delivers the rider's actual GOAL (durable evidence surviving clean
  checkouts, readable in Obsidian, repo = SSOT, no two-homes drift) is **git-tracking in place**.
  Tracking collapses the "two homes" to one — the strongest possible form of "no drift."

Surfaced under remediation-discipline §3.5 (stop-and-surface on unstable inputs) rather than
executing a mirror to a home that does not exist.

## The 6 files (now tracked)

All had zero live consumers at the new path; the ADR-010 docs/→archive/logs/ move broke nothing at
runtime. They were untracked only because the old `.gitignore` patterns (anchored at `docs/` ROOT)
stopped matching once the files moved to `docs/archive/logs/` — the patterns were already dead
(`git check-ignore` returned none). They join dozens of sibling evidence logs already tracked in the
same directory from the taxonomy triage.

| File | Size | What it is |
|---|---|---|
| `_audit-jurisdiction-raw-2026-05-11.json` | 19 KB | Point-in-time jurisdiction-column snapshot; raw evidence for the jurisdiction-normalization audit |
| `wave1-api-discovery-2026-05-09.jsonl` | 1.2 MB | RSS/API/access-method probe of every source (regenerable network probe) |
| `wave1-api-discovery-2026-05-09.jsonl.backup` | 300 KB | Partial pre-completion copy (manual cp, no producer) |
| `wave1-cold-start-log.jsonl` | 472 KB | Append-only cold-start scan log |
| `wave1-last-scanned-backfill-log.json` | 928 B | Result log of the migration-051 last_scanned backfill (783 probed, 182 updated) |
| `wave1-track1-routing-applied.json` | 190 KB | Ledger of access-method routing applied to sources |

## Fixes applied in this change

- **A — tracked + ignore hygiene.** `git add` the 6; removed the dead root-anchored ignore block from
  `.gitignore` (replaced with a pointer comment to this note).
- **B — DEFERRED to the flagged bucket** (see below). Repointing the producers trips the pre-commit
  discipline engine on PRE-EXISTING violations unrelated to a log-path change, so it is not bundled
  into this docs-hygiene commit.
- **C — stale pointer** in `docs/audits/jurisdiction-normalization-audit-2026-05-11.md:7`
  (`docs/_audit-…` → `docs/archive/logs/_audit-…`).
- **D — this record** + an INDEX line.

## Flagged, NOT silently done (operator's call)

**Fix B (producer repoint) is deferred, not applied.** All five wave1 producers still write to
`docs/` ROOT rather than `docs/archive/logs/`. Repointing them is consistency-only (they are
completed one-shots), and touching them carries a real, disproportionate cost:

- The two TRACKED producers — `wave1-cold-start.mjs` and `wave1-last-scanned-backfill.mjs` — trip the
  pre-commit **discipline engine** the moment they are staged, on PRE-EXISTING violations a log-path
  edit does not introduce: rule **[015]** (raw row-mutation outside the guarded `scripts/lib/db.mjs`
  path) on both, and rule **[016]** (direct Anthropic call outside the canonical path) at
  `wave1-cold-start.mjs:246`. Landing a cosmetic repoint would require either a guarded-path /
  canonical-path refactor of legacy dispatch-bound scripts, a `Write-Guard-Override:` trailer ([015]
  only — [016] offers no trailer), or `--no-verify` (a hook bypass, avoided). None is worth a
  log-directory nicety on a completed one-shot; if these scripts are ever revived as maintained code,
  do the guarded refactor THEN.
- The three `wave1-api-discovery*.mjs` scripts are git-IGNORED and untracked (`.gitignore:40`,
`fsi-app/scripts/wave1-api-discovery*.mjs`, with the rationale "wave1-* discovery scripts are
dispatch-bound and not maintained code"). They are completed one-shots, so repointing their output
is consistency-only, not required for correctness — and because they are untracked, any edit lives
only in the working tree and would NOT commit. So a repoint here is left flagged, not applied
(force-tracking a deliberately-ignored file is a scope escalation for the operator to authorise).
Exact edits if a re-run is ever wanted (or the operator elects to `git add -f` them):

- `fsi-app/scripts/wave1-api-discovery-apply-routing.mjs:43-44` — repoint BOTH the input
  `JSONL_PATH` and the output `LOG_PATH` (`docs/…` → `docs/archive/logs/…`); repointing only the
  output would leave a re-run unable to find its input.
- `fsi-app/scripts/wave1-api-discovery.mjs:77` — writes `wave1-api-discovery-*.jsonl` to old `docs/` root.
- `fsi-app/scripts/wave1-api-discovery-summarize.mjs:22` — writes `wave1-track1-summary.md` to old
  `docs/` root, but the SoT summary now lives at `docs/audits/wave1-track1-summary.md`.

Note the ignore comment says "wave1-* discovery scripts" but the pattern only matches
`wave1-api-discovery*.mjs`; `wave1-cold-start.mjs` and `wave1-last-scanned-backfill.mjs` are `wave1-*`
yet NOT `api-discovery`, so they are tracked — which is why Fix B could repoint them cleanly.

Also lower-priority: `docs/archive/walk-away-handoff-2026-05-09.md` carries ~10 stale `dotfiles/docs/wave1-*`
pointers that now resolve to scattered new homes (some → `archive/logs/`, some → `docs/audits/` or
`docs/plans/`). `docs/archive/` is explicitly not-indexed/not-loaded per the operating manual, so left
for an archive-hygiene pass if wanted.

## Durability rider — satisfied

"Durable evidence, readable in Obsidian, repo = SSOT, one-way, no two-homes drift" is met by tracking
in place: durable (git survives clean checkouts), in Obsidian (docs/ IS the vault), SSOT (the repo),
one home (nothing to mirror back from). The two-homes drift class cannot form because there is one home.
