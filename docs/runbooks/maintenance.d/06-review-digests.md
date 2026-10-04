## 6. `review-digests`

**CORRECTED, Lane REVIEW-WIRE, 2026-09-04**: this section previously said "this script does NOT exist in
this worktree" - that was true when section 6 was first written (R1 was a sibling, not-yet-landed lane) and is
**no longer true**. `fsi-app/scripts/review/build-review-digests.mjs` exists, is real, tested
(`scripts/review/build-review-digests.test.mjs` + every `scripts/review/lib/*.test.mjs`), and this MAINT
step correctly runs it - the "NOT PRESENT" branch below is now dead code on every real dispatch (kept
only as the same fail-clearly guard it always was, in case a future worktree checkout somehow lacks the
file). sections 13-16 below are the four consumer steps this digest exists to feed
(`review-apply-provisional-sources`/`review-apply-canonical-candidates`/`review-apply-portal-links`/
`review-apply-coverage-gaps`), wired for the first time in the same lane.

**Purpose**: run `fsi-app/scripts/review/build-review-digests.mjs --out <dir>` - the read-only
ratification-digest builder for the four review queues never worked (Lane R1, 2026-09-02): 911
provisional sources (`sources` WHERE `status='provisional'`), 27 canonical candidates
(`canonical_source_candidates` WHERE `decision='pending'`), 1,837 portal links
(`portal_link_candidates` WHERE `status='candidate'`, plus 3 already `promoted`), 91 gap dispositions
(`coverage_gap_candidates` WHERE `disposition IS NULL`) - counts `[CONFIRMED, live SQL via
mcp__Supabase__execute_sql, project kwrsbpiseruzbfwjpvsp, 2026-09-04]`. (This section previously stated
a canonical-candidates count of 331, carried over from an earlier, unverified draft of this section - that
number was never independently measured and is **wrong**; 27 is the actual live count as of this lane's
own read-only query, run the same day this correction lands.) Writes nothing to the database - only
`readAll` calls; the ruling JSON it emits is what an operator edits and sections 13-16's apply steps are the only
things that ever write.

**Upstream**: `fsi-app/scripts/review/build-review-digests.mjs`'s own `main({out, queue}, {readAll})`,
called unmodified. Its `QUEUES[]` array is the authoritative map from queue to apply script to MAINT
step name - the exact names sections 13-16 below now use.

**Dispatch**: `mode=dry` reports whether the script is present (present, live, per the correction above)
and does nothing else. `mode=apply` runs it with `--out <this run's artifact dir>`, writing
`<queue>.digest.md` (human-readable, one section per group) and `<queue>.ruling.json` (the file an
operator edits: sets `decision` on every group) per queue into that dir; the coordinator then commits the
ruling file(s) under `docs/ratifications/2026-09/` (or wherever the operator is asked to review them)
before dispatching the matching `review-apply-*` step. `--queue <queue-id>` (not exposed through this
MAINT step's own `arg` - dispatch the underlying script by hand for a single-queue rebuild) narrows to
one of `provisional-sources`/`canonical-candidates`/`portal-links`/`coverage-gaps`.

**Ruling**: none - this step only ever reads and writes digest files, never a table.

**Artifact / read back**: whatever `build-review-digests.mjs` writes under the out-dir, uploaded
whole. `read_back` is always empty by design - this step changes no live table, only files. See
`docs/ratifications/2026-09/README.md` for the full "how to rule on a digest" walkthrough.

---

