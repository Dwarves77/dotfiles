# Last proposer pass — fetch-drain

Per `PROPOSER-RUNBOOK.md` §2's attestation format. `fetch-drain` has 2 artifacts (`fetch-drain-run-001`,
`fetch-drain-run-002`) — F28's rule (d) requires this file starting at N=2, and this is that pass.

**Artifacts read:** fetch-drain-run-001, fetch-drain-run-002.

**Full traces read:** `/root/work/build/fetch-error-dispositions.md` (both artifacts' sole
`full_trace_refs` entry — run-002 replays run-001's own error-row population, so the same document
carries both runs' evidence; per-class tables for all 127 still-error rows plus the 5 cleared-on-replay
and 2 pre-emptively-skipped rows are read in full, not just the class-summary counts).

**Hypotheses:**
1. `fetch-drain-run-001.json`'s TCP-stall/hang finding (diputados.gob.mx, a PDF) and
   `fetch-drain-run-002.json`'s `defects_found[0]` (gios.gov.pl, npc.gov.cn — plain HTML, same
   "Connection timed out (os error 110)" signature) together confirm the timeout defect is HOST-LEVEL
   (any slow/unresponsive TCP peer under v1.5's no-fetch-timeout design), not PDF-specific as the F1
   finding alone might have suggested. The fix (`AbortSignal.timeout(45000)`, commit `0735a410`, v1.6)
   is AUTHORED but **NOT YET DEPLOYED** as of run-002 — both artifacts' `defects_found[0]`-class entries
   share `fix_ref: "commit 0735a410 ... authored, not yet deployed as of this run"` verbatim.
2. `fetch-drain-run-002.json`'s `defects_found[1]` — 12 of 127 errors are
   `http2 error: stream error received: unexpected internal error encountered`, 10 of 12 on `*.gov.au`
   domains sharing an IPv6 prefix family, plus `fred.stlouisfed.org` and
   `pollution-waste.canada.ca` — is EXPLICITLY named `fix_ref: null` and explicitly NOT addressed by
   v1.6's `AbortSignal.timeout` (a connection-layer error, not a hang). This is a genuinely open,
   separate investigation thread, not something v1.6's deploy will incidentally close.
3. No new hypothesis beyond what run-002 already diagnosed — both open items are named, with root
   causes, in `fetch-drain-run-002.json`'s own `defects_found`. This pass's job is to confirm neither
   has quietly been superseded (it has not — v1.6 remains undeployed as of this pass) and to flag the
   deploy as the standing blocker on the resume queue (build plan §4: "deploy worker v1.6 + finish
   drain").

**Proposal:**
1. **Deploy worker v1.6** (commit `0735a410`) — the `AbortSignal.timeout(45000)` fix is authored and
   proven against both `fetch-drain-run-001`/`-002`'s timeout-class rows but has never shipped. This is
   not a code proposal (the code exists); it is the deploy step itself, already queued in the build
   plan's resume order (§4).
2. **Open an HTTP/2 investigation thread** for the `*.gov.au`-clustered `http2_stream_error` class (12
   of 127 rows) — determine whether Deno's fetch client needs an HTTP/1.1 fallback for this host
   cluster, or whether the CDN/edge configuration on these hosts is the actual fault, before proposing a
   code fix. `fix_ref: null` stands; this pass does not close it, it scopes the next investigation.

**Family gates status:** not yet run — v1.6's deploy is the coordinator-level action this pass surfaces,
not a code change this lane gates. The HTTP/2 thread has no proposal to gate yet (investigation-first).
