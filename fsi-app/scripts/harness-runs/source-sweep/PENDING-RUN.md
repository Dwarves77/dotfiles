# Pending run — source-sweep

F28's staleness-coupling rule (rule (c), `.discipline/fitness/functions/F28-harness-run-integrity.mjs`)
only fires for a family that already has ≥1 valid artifact (see `auditStalenessCoupling`'s own guard
clause — a family with zero valid artifacts is entirely rule (b)'s to report, not rule (c)'s). This marker
therefore does not (and cannot) make `source-sweep` green today: **rule (b) — "every registered family has
at least one VALID run artifact" — is unconditional and reports `NO ARTIFACTS` for `source-sweep`
regardless of this file.** It is written anyway, in the exact format `parsePendingRunHash` reads, for the
same reason `fetch-drain-run-001.json`/`-002.json`'s shared `harness_version` note and
`forward-events/PENDING-RUN.md` both exist: so the FIRST real run has something concrete to supersede, and
so the driver's hash at write time is on record rather than only inferable from a future diff.

**What this acknowledges:** `scripts/turns/run-source-sweep.mjs` (this family's driver) and the two
dormant modules it gives a runtime to, `src/lib/sources/register-walk.mjs` and
`src/lib/sources/feed-walk.mjs`, were authored and registered (`ALLOWED_FAMILIES`, `GOVERNING_FILES`,
CONVENTION.md's table) in an environment with **neither live network access** to the sources these
walkers enumerate (eur-lex.europa.eu, federalregister.gov, an arbitrary feed host) **nor Supabase
credentials** — the same ADR-023 gap `.github/workflows/producers.yml`'s own header names for the data
producers, closed for THIS family by `.github/workflows/source-sweep.yml`. No walk could be run here to
produce a genuine first artifact, and a placeholder one was deliberately not fabricated (see
`PROTOCOL.md`'s own header and this task's operator instruction: "a first placeholder-free artifact is not
allowed").

**harness_version at write time:** `sha256:87e06e9784e8e21b`

**The planned run that supersedes this marker:** the first `source-sweep-run-001.json` produced by
`node scripts/turns/run-source-sweep.mjs` (dispatched via `.github/workflows/source-sweep.yml`, which
carries the two secrets — `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — and real GitHub-Actions
network egress this environment lacks). Per F28's reverse-audit (an artifact matching this marker's
recorded hash means "the planned run happened — delete the marker"), this file is deleted the moment that
first artifact lands and its `harness_version` matches the value above (or updated to a new hash, per rule
(c), if the driver changes again before that first run lands).
