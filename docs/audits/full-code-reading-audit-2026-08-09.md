# Full code READING audit — every line, defects + root cause (2026-08-09)

Companion to `full-code-audit-2026-08-09.md` (that one was the instrument pass —
compiler/ts-prune/depcheck/graph scans for dead code). **This one is the reading
pass**: operator-directed ("audit all lines of code, find problems now"), executed
as **16 parallel readers, each assigned a disjoint slice, each reading every line
in full** — not sampled. Surface read: ~95,000 lines of `fsi-app/src`, ~11,600 of
the `.discipline` engine, ~9,600 of live `scripts/verify` + `scripts/lib`, all
200+ migrations, the capture-worker edge function. Coverage computed per slice
(`wc` over files read) and reconciled to inventory. Every P0 in the security
cluster was **re-verified by direct grep of source** before landing here — no P0
rests on a reader's word alone. Cross-checked against prior ledgers so accepted
dispositions are not re-raised.

## Severity totals

- **P0 (security / integrity / prod-breaking):** 17 distinct.
- **P1 (correctness):** ~70, dominated by one class (below).
- **P2 (hygiene with a real failure mode):** ~90.
- Plus a full **capability map** of the system (the artifact whose absence let the
  fleet be hand-built beside a finished pipeline) → `docs/inventories/capabilities.md`.

## The class that is everywhere — dropped Supabase errors

The repo has a written post-mortem rule ("treat any `.select()` that destructures
`data` without `error` as a code smell") AND a CI probe for it (`error-drop-probe`).
The probe is SOFT (report-only, `|| true`) — it has never blocked a merge. So the
exact bug the rule names appears in nearly every slice: **45 instances in
community/workspace routes alone**, 5+ in `supabase-server.ts` (the file the
post-mortem was written about), 6+ in `canonical-pipeline.ts`, plus the capture
worker, verification, admin components, and stores. Uniform failure mode: a
transient DB error becomes a silent empty result — a false 403/404, a silently
truncated registry count, an audit row that never writes, a grounding pool that
reads empty. Largest correctness liability in the codebase, and the clearest proof
of the root cause: **a rule without a hard gate does not hold.**

## P0 register (verified by direct grep)

### DB grants & RLS — privilege / spend exposure
1. **`admin_set_pause_state` (mig 201) never revokes default grants** — `GRANT …
   TO service_role` with no `REVOKE … FROM PUBLIC, anon, authenticated`. Mig 238
   in the same repo does the REVOKE correctly (proves it's a defect). An anon-key
   holder can unpause global processing, change scrape cadence, spoof the audit
   actor. Fix: add the three REVOKE lines. Zero-risk.
2. **`gate_a_health` (mig 226) same omission** + runs a full
   `validate_item_provenance` sweep per call → unauthenticated DB-CPU exhaustion.
3. **Platform-admin = owner/admin of ANY org + any user can self-mint an org** —
   `create_org_for_self` is `GRANT … TO authenticated` (mig 076) and the
   platform-admin predicate (mig 203/048) is unscoped `role = ANY('owner','admin')`.
   One RPC → platform capture-quality audit read + platform `integrity_flags`
   UPDATE. Fix: gate on an explicit allowlist, not "any org owner."
4. **`system_state_flag_audit` (mig 201): no RLS, no REVOKE** — the detection half
   of the pause-flag one-writer invariant is anon-tamperable. Fix: deny-all RLS.
5. **`set_provenance_status` (mig 209) dropped its `search_path` pin** that mig 160
   set — on the single most security-relevant trigger. Fix: re-add the pin.
6. **Provenance-flip binding (mig 118) trusts a txn-local GUC as statement-local**
   → a service-role txn can flip `unverified → verified` without the reconciler
   credential, inside the guard's own threat model.

### Capture edge function — the fleet's "dead domain" was a bug
7. **`capture-worker/index.ts` has no auth** — `Deno.serve` uses
   `SERVICE_ROLE_KEY`, acts on body params, no worker-secret, no service-role check,
   **no kill-switch read** (the one worker that ignores the halt row). Anon key
   invokes it under default `verify_jwt`.
8. **THE 202 TERMINALIZATION BUG — root of the fleet-cost saga.** Non-200
   (including HTTP 202) → terminal `error`; the drain selects only `queued`;
   `attempt_count` incremented but never consulted; mig 065's partial unique index
   leaves the wedged row occupying the source slot so it never re-enqueues. EUR-Lex
   serves a cold-start 202 then 200 seconds later — so one cold 202 **permanently**
   kills first-fetch for that source. This is the "EUR-Lex is capture-dead" the
   fleet spent days routing around: not a dead domain, a missing bounded retry. The
   src-side classifier `transport-escalation.mjs` has the mirror hole. Highest-
   leverage single fix in the audit.
9. **Charset regression + binary denylist + no queue CAS** in the same worker:
   `resp.text()` forces UTF-8 → permanent mojibake on Latin-1 gov pages the grounder
   can't span-match; video/audio/wasm pass to `text()` and store as "captures";
   concurrent invocations double-capture.

### Discipline engine — enforcement it claims but doesn't have
10. **RD-19 worktree isolation is fail-open in prod** — compares an absolute
    git-dir against a relative git-common-dir, so `isMainCheckout()` is never true
    and the pre-commit block / post-checkout alarm (the only sub-agent catch) never
    fire; the unit test masks it with absolute/absolute fixtures.
11. **12 golden proofs + 13 data audits report ENFORCED but run nowhere** — the
    goldens are in no workflow/glob/hook; 13 audits are absent from the lane's
    `AUDITS` list; the invariant registry cites them as enforcement. RD-35's own
    "wired-means-it-runs" defect, inside the mechanism built to prevent it.
12. **PreToolUse skill-gate broadly bypassable** — misses `rm -fr`, `sed -i`/`tee`/
    `>>` edits of governed files (zero path awareness), supabase-js writes in
    `node -e`, schema-qualified SQL, `git -C x push`, `DROP INDEX/VIEW/FUNCTION`;
    `skill-map.mjs` does no path normalization so one `..` ungoverns any file.

### Guarded-write helper & pipeline
13. **`db.mjs` readClient() write-block escapable** — the proxy guards only literal
    `from`; `readClient().schema("public").from(t).delete()` mutates prod with no
    cite, no snapshot. Fix: proxy `schema` + `storage`.
14. **`guardedDelete` hard-deletes append-only stores** — `DELETE_PROTECTED_TABLES`
    covers only `sources`; `raw_fetches`/`claim_versions`/`disposition_ledger` are
    doctrine-append-only yet deletable with any cite.
15. **`generate-brief.ts eraseStep` fail-open on the integrity backstop** — every
    erase write drops its error, so a transient failure records "brief-nulled-held
    … success" while the cross-item-violating brief stays customer-visible.
16. **Grounding gate-A can pass on phantom coverage** — gate-A state upserted from
    the in-memory claim set before apply runs, while a failed claim insert is
    warn+continue → an uncovered figure can show orphan_count=0.

### Cross-tenant
17. **Workspace-archive notifications fan out across orgs** — the watcher select
    has no org scope (service-role bypasses RLS); other orgs' members receive
    "archived for your workspace" carrying org A's reason. The read-path sibling
    already fixes this class; the write path still has it.

## Fixed in this commit (live crash, self-inflicted, zero-risk)

**`PlatformIntegrityFlagsView` crashed on `workflow_gap`.** The category list and
palette omitted `workflow_gap` (mig 050); `palette[category]` returned undefined
and `p.fg` threw, taking down the Platform-flags admin tab the moment any such flag
existed. The fleet self-metering rows written today are `category='workflow_gap'` —
so this audit's own program was crashing that tab live. Added the category to
list/labels/palette and made the lookup fall back rather than throw on any future
unknown category. TS- and lint-clean (two pre-existing `any` in the file corrected
in passing). Only code change in the commit; all P0/P1 above are staged for the
phased plan with operator sign-off.

## Root cause — why it is like this (five mechanisms, evidence-backed)

1. **Soft gates for hard rules.** The two largest classes — dropped errors and
   unwired "enforcement" — both have detectors that are report-only or run nowhere.
   A rule the machine names but does not block is a suggestion; across dozens of
   dispatches, suggestions decay. Fix: make the detectors that exist into gates.
2. **Rebuild-severs-wiring** (from the instrument audit, reconfirmed): template
   rebuilds orphan ruled-live wiring; dispositions written once assert states the
   import graph no longer supports.
3. **Doctrine asserting state** — the "doctrine not state" rule is violated by the
   doctrine's own store list, route claims, and stale category vocab; the same
   drift appears as invalid-value writes (item_type `law`, severity short-keys)
   that die at the DB CHECK.
4. **Security posture regressing one migration at a time** — 160 pinned
   search_paths, later migrations dropped them; 238 revokes grants, 201/226 don't.
   Each migration is locally reasonable; nothing audits the trend.
5. **Construction with no liveness/existence check** — components built ahead of
   mounts, charters (prose pipelines) built beside finished code, retired-file
   pointers left sanctioned. The system never asks mechanically "does this run, is
   it reachable, does its target still exist?"

## Remediation plan (phased; site-code needs operator sign-off per standing rule)

- **P0-security (1 migration PR + 1 edge-fn PR, urgent):** six grant/RLS/
  search_path fixes (all mirror an existing correct pattern, near-zero risk) +
  capture-worker auth/pause-gate. Fast-track.
- **P0-capture (1 PR):** 202 retry + charset + claim CAS. Highest leverage in the
  audit — reopens EUR-Lex (largest blocked corpus) and dissolves the fleet's "dead
  domain" workarounds.
- **P0-enforcement (1 PR):** wire goldens + audits into CI, fix RD-19's path
  compare, close skill-gate/skill-map bypasses, proxy `schema` in db.mjs, turn the
  dropped-error probe HARD (diff-gated on new instances).
- **P1 dropped-error sweep (2-3 PRs):** mechanical, file-family at a time, starting
  with `supabase-server.ts` and community routes.
- **P1 correctness rulings (per-area PRs):** timezone/#418 recurrences,
  counts-from-visible-rows violations, vocab-drift writes, optimistic-rollback
  races, index-vs-detail classifier disagreements.
- **P2:** batched once P0/P1 land.
- **Capabilities inventory (P0 of the plan, no code):** the living map of what
  exists, so the next session designs from assets — prevents the fleet-vs-pipeline
  duplication.

Through-line for every phase: **make the detector that already exists into a gate.**
The repo does not lack discipline mechanisms — it has 11,600 lines of them. It
lacks the wiring that makes them fire. Cheapest, highest-leverage work on the list.

---

## Verification + correction log (2026-08-09, live)

Applying verify-before-fix to the P0s as they are actioned. This section is the
honest correction record — several reading-audit findings read worse than live
reality, which is exactly why no finding ships a fix unverified.

**Security grants (§P0 1–5): re-verified by pg introspection.**
- CONFIRMED: `admin_set_pause_state` and `gate_a_health` carry `anon,authenticated`
  grants (`reorder_user_list_item` beside them is `service_role`-only — the intended
  shape); `create_org_for_self` is `authenticated`-granted (escalation primitive real);
  `set_provenance_status` proconfig is UNPINNED (regressed from mig 160).
- **DOWNGRADED:** `system_state_flag_audit` "no RLS" was **FALSE** — RLS is enabled.
  Finding withdrawn.

**Capture 202 (§P0 8): CONFIRMED as a bug, but the "corpus-blocking" framing was
OVERSTATED.** Live EUR-Lex queue: **645 done**, 25 error (dominant reason the 202
warm-up), 28 fresh queued. EUR-Lex is NOT capture-dead — it captures ~91% of the
time. The 202 wedge affects ~15 rows, not thousands. The 2,457 "eligible blocked"
worklist entries are mostly UNATTEMPTED (fleet halted + the charter-v3 domain-skip I
authored over-generalized a local 202 cluster into "skip the domain"), not victims of
this bug — and 645 are already captured and only need AUTHORING. The real EUR-Lex
unlock is authoring the 645 captured docs (zero-fetch) + attempting the ~1,750
uncaptured at the observed 91% rate, none of which needs the capture worker.

**Capture fix shipped to the repo (v1.4), deploy pending operator approval.**
`supabase/functions/capture-worker/index.ts` v1.4: transient statuses (202/408/429/5xx
+ network errors) RE-QUEUE up to `MAX_ATTEMPTS=5` instead of terminalizing; charset-aware
decode (fixes the Latin-1 mojibake class); atomic queued/error→fetching claim (fixes
concurrent double-capture); content-type allowlist (fixes binaries stored as garbage);
write-failure paths re-queue instead of wedging at 'fetching'. Verified: escapes intact,
all call sites arity-correct, `agent_runs.status` CHECK honored (retry writes no run row —
`retry` is not an allowed status value). The Supabase MCP deploy was blocked by the
environment's prod-mutation permission gate; deploy is operator-gated (MCP approval, or
`supabase functions deploy capture-worker` from the committed source). Proof-on-one
replay of wedged row `924479fd` (CELEX:32005D0417) runs immediately post-deploy.
