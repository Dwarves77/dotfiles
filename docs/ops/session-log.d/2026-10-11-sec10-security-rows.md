# 2026-10-11, lane SEC-10 (sec10-security-rows): the seven security rows of the complete audit

Branch lane/sec10-security-rows from origin/master 2c710d144, PR 1122. Backlog rows B-0001 to B-0007 and B-0040.

## Accomplished

- B-0001, `src/app/api/agent/run/route.ts`: both per-item guard reads now fail closed. A read error on the provenance read or on the cooldown read returns 503 `{ error: "guard_unavailable", detail: <message> }` and `start()` is not called. The "RESIDUAL (flagged, deferred)" comment is replaced by one sentence of fact (refresh regenerates the body; sectionStep canonical-pipeline.ts:1576 and groundStep :1683 still skip a verified item regardless of refresh; BACKLOG B-2273). The three service-role `createClient` constructions (source_url lookup, guard client, d3 audit client) are replaced by one `getServiceSupabase()` per request. Lines 1576 and 1683 confirmed by reading canonical-pipeline.ts (`it.provenance_status === "verified"` and `prov?.provenance_status === "verified"`).
- B-0002, B-0003, B-0040, `src/app/api/orgs/[org_id]/invitations/[id]/route.ts`: the org_invitations ownership read (id, org_id, status) now runs on `auth.supabase` BEFORE the `revoke_invitation` RPC, with its error handled: read error is 500, no row or `org_id` mismatch is 404 "Invitation not found", both with zero RPC calls. The RPC call and its error mapping are unchanged (42501 to 403, P0002 to 404, 22023 to 409). The post-RPC block and its dropped-error read are deleted.
- B-0004, `src/app/api/orgs/[org_id]/invitations/route.ts`: the log line is `[invitation] org=<org_id> invitation=<id> role=<role>`: no email, no URL, no token. The invite URL is still returned to the inviter in the JSON (asserted unchanged).
- B-0005, B-0006: `src/lib/api/auth.ts` `requireAuth` returns `{ userId, supabase }` (new exported `AuthContext`), `supabase` being the bearer-bound anon client it already built to verify the JWT; `src/lib/api/route-guard.ts` `UserRoute` gains `userClient: SupabaseClient`, `requireUserRoute` passes it through, `AdminRoute` (extends UserRoute) carries it too while its `supabase` stays the service client; `src/app/api/search/route.ts` drops the `createClient` import, the service-role client and `SUPABASE_SERVICE_ROLE_KEY`, and runs `runSearch(auth.userClient ...)`.
- `requireUserRoute(` caller count: 15 route files under `src/app/api` (`grep -rl "requireUserRoute(" src/app/api | grep -v npmtest | wc -l`; the plain `grep -rl | wc -l` gives 17 because two new test stubs carry the text). Every other caller ignores the new field.
- Five attack tests (below), all red against master then green.

## Review of B-0005 and B-0006 (positives and negatives, then the decision)

- Option A, keep the service-role client in `/api/search`. Positive: none that `/search` (the page) lacks, since the page runs the same `runSearch` on the cookie client. Negative: a user route reading with RLS off; a second service-client construction site (the F19 class); privilege differs by entry point for the same retrieval.
- Option B, run on the caller's RLS client. Positive: identical privilege at both entry points; `search_intelligence_items` is SECURITY INVOKER and filters verified AND NOT archived itself (migration 159, header line 18 read in this lane); one fewer service-role site; the client already exists inside `requireAuth` and was being discarded. Negative: `requireUserRoute` must expose the bearer-bound client (`userClient`, a field no other caller reads).
- Decision: B, executed. No `GRANT` or `REVOKE` on `search_intelligence_items` exists in the migration tree (grep of supabase/migrations: only 159 and 160 mention it), so the default execute grant applies to the bearer-bound `authenticated` caller exactly as it does for the page. Live behaviour of the RPC under the bearer client was not exercised (no database access in this lane).

## Attack tests (rule 15), red against origin/master source then green

Red run: the tests alone (commit a90143633) over master's source. Green: after the fixes.

| Test | Red (master source) | Green |
|---|---|---|
| 1 revoke order, `src/app/api/orgs/invitations-revoke-order.npmtest.mjs` | 4 fail, 2 pass: mismatched org recorded an RPC call, missing row recorded an RPC, read error did not stop the RPC | 6 of 6 |
| 2 invitation log (same file) | fails: the log line carried the token URL and the email | passes (no token, no `/invitations/`, no email; JSON still returns `invite_url`) |
| 3 agent/run guards, `src/app/api/agent/run/guard-fail-closed.npmtest.mjs` | 3 fail, 3 pass: provenance read error and cooldown read error did not return 503; the route called `createClient` instead of `getServiceSupabase` | 6 of 6 (503 x2, 200 skipped, 429 cooldown, 202 start once, one `getServiceSupabase` and zero `createClient`) |
| 4 search user client, `src/app/api/search/route-user-client.npmtest.mjs` | 2 fail, 1 pass: `Error: supabaseUrl is required` thrown by the service client construction; source grep found the key and the import | 3 of 3 (RPC and re-fetch observed on the fake user client; short query never reaches the client; route source has no `SUPABASE_SERVICE_ROLE_KEY`, no `createClient`, no `getServiceSupabase`) |
| 5 requireAuth returns the client, `src/lib/api/auth.npmtest.mjs` (extended) | 1 fail (resolved object had no `supabase`), 11 pass | 12 of 12. Runs the real `requireAuth` and the real client with `globalThis.fetch` replaced (HS256 token makes the installed `getClaims` fall back to `getUser`, one fetch to `/auth/v1/user`); asserts `.from` and `.rpc` exist and every fetch carried the caller's own bearer |
| route-guard, `src/lib/api/route-guard.npmtest.mjs` (extended) | 1 fail, 8 pass | 9 of 9 (`userClient` passed through by `requireUserRoute`, carried by `requireAdminRoute`, whose `supabase` stays the service client) |

## B-0007 evidence

- `node --test src/app/api/workspace/viewer-read-only-routes.npmtest.mjs`: 27 tests, 27 pass, 0 fail (run in this lane).
- Registry check: `viewer-read-only-routes` is NOT named in `fsi-app/.discipline/registry.mjs` (grep returned nothing). It executes through the npmtest glob: `fsi-app/.discipline/hooks/lib/run-npmtest-suites.sh` (git ls-files, suffix `.npmtest.mjs`), called by `.github/workflows/ci.yml:300-305`, and `fsi-app/.discipline/governance/coverage-report.json` records the file with `"proofWired": true`. The brief says to STOP if the file is not in the registry, so B-0007 is NOT flipped here and the evidence is handed to the coordinator (line under Open items).

## Backlog rows

The backlog landed on master (AUD-LAND-2, aa92d9daa) while this lane ran and arrived with rule 18's merge. In `docs/audits/2026-10-11-complete-audit/BACKLOG-2026-10-11.md` every one of these ids appears twice (the "65 rows marked SECURITY or DATA-INTEGRITY" table, lines 58-97, and the full Backlog table, lines 179-218); both copies were flipped so they cannot disagree.

- B-0001, B-0002, B-0003, B-0004, B-0005, B-0006, B-0040: STATUS cell `CLOSED: PR 1122` in both tables (14 cells).
- B-0007: NOT flipped (registry condition, see B-0007 evidence). Proposed cell if the coordinator accepts the glob wiring: `REFUTED: closed by migration 371 and PR 1003 (viewer-read-only-routes.npmtest.mjs, 27 tests pass, wired by the npmtest glob and coverage-report proofWired true; no registry.mjs row)`.
- B-2273 added as the last row of the Backlog table (line 2451): KIND PRODUCT-DEFECT, CLASS CAPABILITY, AREA lib-agent, TOKEN CONFIRMED, SOURCE sec10, OBJECT fsi-app/src/lib/agent/canonical-pipeline.ts, STATUS empty, finding text as the brief gave it. The summary counts in the file header (2272 rows) were not touched (outside the STATUS-cell and new-row write scope).

## Read and reused

- Reused `getServiceSupabase` (lib/supabase-service.ts, memoized, fail-closed) instead of three `createClient` sites; reused the bearer-bound client `requireAuth` already built instead of a new client factory; reused `runSearch` and `SearchSupabaseClient` unchanged; reused the jiti plus stub-alias pattern of viewer-read-only-routes.npmtest.mjs and the injected-deps convention of route-guard.npmtest.mjs; extended auth.npmtest.mjs and route-guard.npmtest.mjs rather than new files for the guard-level attacks. No new module was added (no F25 or F14 exposure).

Coverage table (each file read whole with the Read tool, one call each):

| File | Lines | Read calls |
|---|---|---|
| briefs-2026-10-04/COMMON.md (scratchpad) | 123 | 1 |
| briefs-2026-10-04/sec10.md (scratchpad) | 82 | 1 |
| CLAUDE.md (repo root) | 120 | 1 |
| fsi-app/src/app/api/agent/run/route.ts (as on master) | 145 | 1 |
| fsi-app/src/app/api/orgs/[org_id]/invitations/[id]/route.ts (as on master) | 69 | 1 |
| fsi-app/src/app/api/orgs/[org_id]/invitations/route.ts (as on master) | 174 | 1 |
| fsi-app/src/app/api/search/route.ts (as on master) | 61 | 1 |
| fsi-app/src/app/api/search/logic.ts (not in the write set; needed for the test 4 fake) | 104 | 1 |
| fsi-app/src/lib/api/auth.ts (as on master) | 123 | 1 |
| fsi-app/src/lib/api/route-guard.ts (as on master) | 121 | 1 |
| fsi-app/src/lib/api/auth.npmtest.mjs (as on master) | 118 | 1 |
| fsi-app/src/lib/api/route-guard.npmtest.mjs (as on master) | 94 | 1 |
| fsi-app/src/app/api/workspace/viewer-read-only-routes.npmtest.mjs | 130 | 1 |
| fsi-app/src/lib/supabase-service.ts | 43 | 1 |
| docs/audits/2026-10-11-complete-audit/BACKLOG-2026-10-11.md | 2450 | 0 whole (targeted by row id, see NOT done) |

A second run of this lane committed `1724fc1b4` ("WIP sec10: session log finalized [skip ci]") in this same worktree after this run's final commit `20df358f0`, changing only this log (verified: `git diff 20df358f0 HEAD --name-only` lists only this file, so every source and test file at HEAD is the tree this run tested). That commit left a `[skip ci]` subject at the branch head, which would leave the required checks unreported, so this run made one more commit with a normal subject (its caller-count correction below is kept, and verified: 15 production route files, the two test files that carry the text excluded). The second run's statement that it re-derived the red results by restoring master's six source files is its own and was not repeated by this run; the red evidence in the table above is this run's tests-only commit `a90143633`.

Also loaded whole through the Skill tool by the governing-skill hook before writes: caros-ledge-platform-intent, remediation-discipline, environmental-policy-and-innovation (plus fsi-app/.claude/CLAUDE.md, 441 lines, delivered by the hook). `canonical-pipeline.ts` was read only at lines 1574-1578 and 1681-1685 to confirm the two cited line numbers; it is not in the write set and is not edited.

## Decisions

- `userClient` (not `supabase`) is the new field on `UserRoute`, as the brief fixed, because `AdminRoute extends UserRoute` and its `supabase` is the service client.
- The agent/run route keeps `getServiceSupabase()` for the guards as the brief fixed, although `requireAdminRoute` already hands back `auth.supabase` (the same memoized service client); the source_url lookup, both guards and the audit hook now share the one client.
- The stale `canonical-pipeline.ts:866/921` citation in the same comment was updated to the step names, and the dash glyph on that line was replaced (rule 10).
- The lookup-by-source_url read in agent/run still only warns on error (`item lookup by source_url failed`); it ends in a 404 when no id results, so it does not open a guard. Not part of any assigned row.

## Checks run (rule 17, on the tree after rule 18's merge of origin/master, which brought in AUD-LAND-2)

- `npx eslint --max-warnings=0` on every changed js/mjs/ts file: no output, clean.
- `node fsi-app/.discipline/fitness/runner.mjs`: 44 functions checked, 0 violations.
- `npx tsc --noEmit -p .` (fsi-app): exit 0, no output.
- Touched tests: auth 12/12, route-guard 9/9, invitations-revoke-order 6/6, guard-fail-closed 6/6, route-user-client 3/3, viewer-read-only-routes 27/27.

## NOT done

- B-0007 STATUS cell not flipped because `viewer-read-only-routes` is not named in registry.mjs and the brief says to stop in that case; evidence is above. [WORK: owed]
- The backlog file (2450 lines, 694,018 bytes before this lane) was NOT read whole (rule 20): a whole read is about 700 KB, which does not fit one context beside the code; it was edited by row id with sed (14 STATUS cells, 1 appended row) and the result was checked by grep and by `git diff --stat` (15 insertions, 14 deletions). [NOT-WORK: scope statement, the brief limits the write to those cells and one row]
- The header summary of the backlog still says 2272 rows and was not updated for B-2273. [WORK: owed]
- The B-2273 defect itself (sectionStep and groundStep ignore `refresh`) is recorded, not fixed: canonical-pipeline.ts is outside the write set and its change is SKILL.md-gated. [WORK: owed]
- The bearer-bound client's RPC and re-fetch were proven on fakes only; no live call (no database access in this lane). [NOT-WORK: build-mode scope statement, rule 5 of the lane contract]

## Open items

- B-0007 registry-row question: the file is execution-wired by the npmtest glob but has no registry.mjs row; the coordinator decides whether to flip B-0007 to REFUTED on the evidence above or to assign a lane that adds a registry row. [WORK: owed]
- Operator-visible behaviour change for the coordinator: `/api/agent/run` now answers 503 `guard_unavailable` on a guard read error where it used to proceed; admin callers that retry on 5xx will retry. [NOT-WORK: intended fail-closed behaviour, no action]
