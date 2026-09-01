# Pending run — fetch-drain

**Governing files changed:** landing train 3 (2026-09-01) merged `build/wave-f1b` (capture-worker
v1.6 — fetch timeout + pre-buffer size guard) into the same train as `build/wave-mh4`'s meta-harness.
`supabase/functions/capture-worker/index.ts` is fetch-drain's sole governing file per
`scripts/harness-runs/CONVENTION.md`'s `harness_version` table (F28's `GOVERNING_FILES['fetch-drain']`),
so v1.6's edit moved `harness_version` even though no fetch-drain batch has run against the new code —
v1.6 is not yet deployed (this lane makes no DB or edge-function writes; deploy is next in the resume
queue per Addendum 74).

**harness_version at write time:** `sha256:a7306c752b8fb806`

**Planned run:** the next real fetch-drain batch, run after v1.6 is deployed (resume queue: "v1.6
deploy + drain finish + ladder"), is what supersedes this marker — it will land as
`fetch-drain-run-003.json` per `scripts/harness-runs/fetch-drain/PROTOCOL.md`'s manual writer
procedure (fetch-drain has no self-emitting runner the way `screen-worklist.mjs` does — see
`scripts/harness-runs/screen/PENDING-RUN.md` for that contrast). When that run lands, delete this
file — F28 (`harness-run-integrity`) treats a `PENDING-RUN.md` whose recorded hash a landed artifact
already matches as stale and flags it for removal.

No fetch-drain classification behavior changed here — `fetch-drain-run-002.json`'s recorded outcome
still holds exactly as recorded; only the underlying capture-worker gained a fetch timeout and a
pre-buffer size guard, changes to *how* it fetches, not to any rule this harness family enforces.
