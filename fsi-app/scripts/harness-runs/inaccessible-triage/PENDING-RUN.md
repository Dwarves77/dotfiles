# Pending run -- inaccessible-triage

F28 rule (b) (first-run acknowledgment, `.discipline/fitness/functions/F28-harness-run-integrity.mjs`):
this family was registered by lane M8 (2026-09-18, closing the 2026-09-18 stage audit's S1 finding --
`docs/audits/stage-audit-2026-09-18/s1-collect.md`, "Inaccessible-source triage ladder" row -- that
`scripts/sources/inaccessible-triage.mjs` left no committed harness artifact, only an ephemeral GitHub
Actions dossier upload). No live dispatch was possible from the authoring environment (no Supabase
credentials, no Actions runner) -- the same posture `ledger-consume`, `corpus-turn`, and `brief-apply`
each recorded at their own registration. This marker acknowledges that and names the planned run that
discharges it.

**What lands.** `scripts/lib/run-artifact.mjs`'s `ALLOWED_FAMILIES` gained `"inaccessible-triage"`;
`scripts/harness-runs/governing-files.mjs`'s `GOVERNING_FILES` gained an `inaccessible-triage` entry (the
driver plus the four ladder modules a triage run actually exercises -- `primary-fallback.mjs`,
`seek-more.mjs`, `officialness.mjs`, `host-authority.ts`); `scripts/harness-runs/CONVENTION.md` gained the
directory-layout entry, family-description prose, standing-metric paragraph, and harness_version table
row in the same commit, kept in parity with `governing-files.mjs` per the CONVENTION-TABLE-PARITY test.
`scripts/sources/inaccessible-triage.mjs`'s own `main()` now writes a committed, structured harness-run
artifact every run (dry or apply) -- `per_item` for every triaged, skipped, and errored source; `metrics`
mirroring the existing `_summary.json` shape plus the DB-write outcome; `full_trace_refs` pointing at the
dossier directory (the dossiers themselves stay OUT of the artifact and out of git -- a dossier can carry
a full fetched page body, CLAUDE.md rule 5) -- dep-injected (`claimRunIdFn`/`writeRunArtifactFn`) so its
own unit tests (`inaccessible-triage.test.mjs`) never touch the filesystem, the same discipline every
other family's tests already apply.

**Why this family, not `source-sweep`.** CONVENTION.md's own registration-order rule: "never a family
folded into an existing one just because it seemed similar." The triage ladder discovers no candidate
URLs, writes nothing to `portal_link_candidates`, and walks no register/feed/sitemap -- its only DB
mutation is `sources.fetch_status`/`fetch_status_at` (migration 147) on the SAME suspended rows it read,
the opposite direction of every source-sweep walker's own write. A genuinely distinct run shape, per the
CONVENTION's own test (CONVENTION.md's header, "meta-harness"/"forward-events" section).

**harness_version at write time:** `sha256:4b0527a5aa3d4fbe` (computed via `hashHarnessVersion` against
`governing-files.mjs`'s own `GOVERNING_FILES['inaccessible-triage']`, 5 files: the driver plus the four
ladder modules named above).

**The planned run that discharges this marker:** the next real
`node scripts/sources/inaccessible-triage.mjs` dispatch (dry or apply) will land
`inaccessible-triage-run-001.json` with `harness_version: sha256:4b0527a5aa3d4fbe`, and this marker is
deleted the moment that artifact lands (or updated to a new hash, per rule (c), if the governing files
change again before that run lands). Per this stage's brief: the run itself is a coordinator dispatch
(SELECT-only/no-network access does not permit this lane to run it) -- the mechanism is proven by
`inaccessible-triage.test.mjs`'s own real-wiring test (`claimRunId`/`writeRunArtifact`, no fakes, a temp
directory `readRunHistory` reads back cleanly).
