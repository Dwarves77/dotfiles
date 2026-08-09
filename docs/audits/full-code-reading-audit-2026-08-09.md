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

> ## STATUS OF THIS REGISTER (rule 14, applied 2026-08-09)
>
> **Of the 17 P0s below: 14 CONFIRMED, 2 REFUTED, 1 remaining HYPOTHESIS.** Verification pass 2026-08-09 took the nine open hypotheses and confirmed seven of them (several by live reproduction, not reading); 12 of the 14 confirmed are now FIXED. Two are confirmed-but-unfixed pending an operator ruling: #6 (a migration on the most security-critical trigger) and #11 (wiring 14 never-run proofs into CI may surface real failures). The one still HYPOTHESIS is #12's bypass list; #9's charset/CAS half was fixed defensively in capture-worker v1.4 without an observed instance.
> Every finding now carries a status token. This matters because the register originally
> presented all 17 as findings-of-fact, and eight claims across this session were retracted
> under verification. A `[HYPOTHESIS]` P0 is a thing to go verify — NOT a thing to treat as
> broken, budget against, or report onward. Enforced going forward by
> `fsi-app/scripts/verify/audit-finding-status.mjs` (standing rule 14).
>
> The ~70 P1s and ~90 P2s summarized below are ALL `[HYPOTHESIS]` — they were produced by the
> same read-then-report pass and none has been independently verified.

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
1. [CONFIRMED — pg introspection; FIXED live mig 248] **`admin_set_pause_state` (mig 201) never revokes default grants** — `GRANT …
   TO service_role` with no `REVOKE … FROM PUBLIC, anon, authenticated`. Mig 238
   in the same repo does the REVOKE correctly (proves it's a defect). An anon-key
   holder can unpause global processing, change scrape cadence, spoof the audit
   actor. Fix: add the three REVOKE lines. Zero-risk.
2. [CONFIRMED — pg introspection; FIXED live mig 248] **`gate_a_health` (mig 226) same omission** + runs a full
   `validate_item_provenance` sweep per call → unauthenticated DB-CPU exhaustion.
3. [REFUTED AS WRITTEN / real vector CONFIRMED — the app already gates platform-admin on profiles.is_platform_admin; the actual hole was three RLS policies, FIXED live mig 249] **Platform-admin = owner/admin of ANY org + any user can self-mint an org** —
   `create_org_for_self` is `GRANT … TO authenticated` (mig 076) and the
   platform-admin predicate (mig 203/048) is unscoped `role = ANY('owner','admin')`.
   One RPC → platform capture-quality audit read + platform `integrity_flags`
   UPDATE. Fix: gate on an explicit allowlist, not "any org owner."
4. [REFUTED — RLS is already ENABLED on this table; finding withdrawn] **`system_state_flag_audit` (mig 201): no RLS, no REVOKE** — the detection half
   of the pause-flag one-writer invariant is anon-tamperable. Fix: deny-all RLS.
5. [CONFIRMED — proconfig read UNPINNED; FIXED live mig 248] **`set_provenance_status` (mig 209) dropped its `search_path` pin** that mig 160
   set — on the single most security-relevant trigger. Fix: re-add the pin.
6. [CONFIRMED + FIXED live mig 250 + PROVEN by adversarial audit. The GUC was worse than "txn-local-not-cleared": it is an ordinary SESSION GUC any role can FORGE with one `set_config('app.prov_flip_origin','INSERT',true)` — the reconciler binding was decorative, not merely leaky. Live introspection during the fix also found the guard fired ONLY on OLD='unverified', leaving the dominant `quarantined→verified` escalation (180 live rows one UPDATE away) UNGUARDED entirely. Mig 250 rebuilds the guard to gate transitions INTO 'verified', allowed only for current_user='reconciler' OR pg_trigger_depth()>=2 (the validation derivation — verified as the sole trigger writer of this column) — engine truth, unforgeable. Attacks denied live under rollback: forged-GUC escalation, direct unverified→verified, ON CONFLICT DO UPDATE. See ADR-017 + scripts/verify/prov-guard-adversarial-audit.mjs (now hard in the data-audit lane).] **Provenance-flip binding (mig 118) trusts a forgeable session GUC, and misses the dominant escalation path**
   → a service-role write could reach `verified` without the reconciler credential,
   by forging the GUC or by the unguarded `quarantined → verified` path.

### Capture edge function — the fleet's "dead domain" was a bug
7. [CONFIRMED — source read: no auth check exists in the handler] **`capture-worker/index.ts` has no auth** — `Deno.serve` uses
   `SERVICE_ROLE_KEY`, acts on body params, no worker-secret, no service-role check,
   **no kill-switch read** (the one worker that ignores the halt row). Anon key
   invokes it under default `verify_jwt`.
8. [CONFIRMED + FIXED + PROVEN LIVE — v1.4 replay: attempt 1 requeued on 202, attempt 2 captured 534,530 chars. NOTE the "blocks the largest corpus" framing was REFUTED: 645 EUR-Lex captures already succeeded; the wedge was ~15 rows] **THE 202 TERMINALIZATION BUG — root of the fleet-cost saga.** Non-200
   (including HTTP 202) → terminal `error`; the drain selects only `queued`;
   `attempt_count` incremented but never consulted; mig 065's partial unique index
   leaves the wedged row occupying the source slot so it never re-enqueues. EUR-Lex
   serves a cold-start 202 then 200 seconds later — so one cold 202 **permanently**
   kills first-fetch for that source. This is the "EUR-Lex is capture-dead" the
   fleet spent days routing around: not a dead domain, a missing bounded retry. The
   src-side classifier `transport-escalation.mjs` has the mirror hole. Highest-
   leverage single fix in the audit.
9. [HYPOTHESIS — code-read; no mojibake instance observed in stored captures. Fixed defensively in v1.4 regardless] **Charset regression + binary denylist + no queue CAS** in the same worker:
   `resp.text()` forces UTF-8 → permanent mojibake on Latin-1 gov pages the grounder
   can't span-match; video/audio/wasm pass to `text()` and store as "captures";
   concurrent invocations double-capture.

### Discipline engine — enforcement it claims but doesn't have
10. [CONFIRMED BY LIVE REPRO — in a real pre-commit hook, --absolute-git-dir returned /tmp/hk2/.git while --git-common-dir returned ".git"; isMainCheckout() false, evaluateCommit {blocked:false}, and the commit SUCCEEDED where doctrine requires a block. Existing tests pass green because their fixtures are absolute/absolute, a state git never produces. FIXED same day: hook now uses --path-format=absolute] **RD-19 worktree isolation is fail-open in prod** — compares an absolute
    git-dir against a relative git-common-dir, so `isMainCheckout()` is never true
    and the pre-commit block / post-checkout alarm (the only sub-agent catch) never
    fire; the unit test masks it with absolute/absolute fixtures.
11. [CONFIRMED, numbers refined — 14 *.golden.mjs on disk, ZERO referenced by any workflow/glob/hook/package script (the claimed "12" is the count the registry CITES as enforcement); 13 audits cited by the registry are absent from the data-audit lane's 10-entry AUDITS list. Root cause: invariant-coverage.mjs:96 resolves selftest:/audit: tokens by git-tracked EXISTENCE, never execution. NOT YET FIXED — wiring 14 never-run proofs into CI may surface real failures; needs a staged decision] **12 golden proofs + 13 data audits report ENFORCED but run nowhere** — the
    goldens are in no workflow/glob/hook; 13 audits are absent from the lane's
    `AUDITS` list; the invariant registry cites them as enforcement. RD-35's own
    "wired-means-it-runs" defect, inside the mechanism built to prevent it.
12. [CONFIRMED for the deadlock — it blocked a real CI-green push; FIXED this session. HYPOTHESIS for the bypass list — code-read, never exploited] **PreToolUse skill-gate broadly bypassable** — misses `rm -fr`, `sed -i`/`tee`/
    `>>` edits of governed files (zero path awareness), supabase-js writes in
    `node -e`, schema-qualified SQL, `git -C x push`, `DROP INDEX/VIEW/FUNCTION`;
    `skill-map.mjs` does no path normalization so one `..` ungoverns any file.

### Guarded-write helper & pipeline
13. [CONFIRMED BY EXECUTION — readClient().from(t).delete() threw as designed, but readClient().schema("public").from(t).delete() did NOT throw and reached the write client with no cite and no snapshot; the real supabase client does expose .schema(), so the escape is reachable in production. FIXED same day: the schema() handle is now proxied so its from() is read-only too] **`db.mjs` readClient() write-block escapable** — the proxy guards only literal
    `from`; `readClient().schema("public").from(t).delete()` mutates prod with no
    cite, no snapshot. Fix: proxy `schema` + `storage`.
14. [CONFIRMED BY EXECUTION — guardedDelete threw only for sources; raw_fetches, claim_versions and disposition_ledger each returned deleted=1 with a valid cite. All three ARE declared append-only (RD-46; RD-44/RD-45 + mig 208/210; mig 213) and none has a DB-level DELETE trigger or REVOKE, so this module guard was the only gate. FIXED same day: all three added to DELETE_PROTECTED_TABLES; structural DB triggers logged as follow-up] **`guardedDelete` hard-deletes append-only stores** — `DELETE_PROTECTED_TABLES`
    covers only `sources`; `raw_fetches`/`claim_versions`/`disposition_ledger` are
    doctrine-append-only yet deletable with any cite.
15. [CONFIRMED — code read 2026-08-09: the three critical writes await without destructuring `error`; supabase-js resolves rather than throws, so the step returned briefNulled:true unconditionally. FIXED same day: each write now checks `error` and throws RetryableError. SEVERITY CORRECTED — the item stays quarantined, so nothing became customer-visible (the original wording overstated that); the real impact is that a silently-failed claim-provenance delete leaves bad-host FACT spans counted by the CROSS-ITEM audits, defeating the guarantee the step exists to provide] **`generate-brief.ts eraseStep` fail-open on the integrity backstop** — every
    erase write drops its error, so a transient failure records "brief-nulled-held
    … success" while the cross-item-violating brief stays customer-visible.
16. [CONFIRMED — the Gate-A upsert (canonical-pipeline.ts:1661) runs BEFORE applyLedgerDiff (:1667) and is computed from the IN-MEMORY claim set; claim inserts are warn-and-continue (ledger-apply.mjs:115), and criterion 7 keys staleness on md5(full_brief) only (mig 225), so a dropped write leaves orphan_count=0 describing a corpus that was never persisted, and nothing marks it stale. FIXED same day: applyLedgerDiff now reports a failed count and the pipeline re-scans against PERSISTED claims when anything failed, clearing the state fail-closed if the reconcile cannot complete. The pre-write upsert is retained deliberately — criterion 7 must never see missing state] **Grounding gate-A can pass on phantom coverage** — gate-A state upserted from
    the in-memory claim set before apply runs, while a failed claim insert is
    warn+continue → an uncovered figure can show orphan_count=0.

### Cross-tenant
17. [CONFIRMED — the watcher SELECT (overrides/route.ts:187-190) filters on item_id ONLY, on a service-role client (RLS bypassed), against a GLOBAL item corpus; the notifications table has no org_id and its RLS is per-user, so RLS DELIVERS the cross-org row rather than blocking it. The sibling read path already intersects with org_memberships. LATENT not observed (production has one org). FIXED same day: the write path now intersects watchers with the caller's org membership, and skips the fan-out entirely if the member read fails] **Workspace-archive notifications fan out across orgs** — the watcher select
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

## FIXED LIVE (2026-08-09, verified by read-back)

Security cluster — applied via Supabase MCP with read-back verification, committed as
migrations 248 + 249 (audit record; data durable on execution per code-vs-data doctrine):
- **P0 #1 admin_set_pause_state** — PUBLIC/anon/authenticated EXECUTE revoked → service_role
  only (read-back: grantees = postgres,service_role). Anon-unpause vector closed.
- **P0 #2 gate_a_health** — same; anon DB-CPU-exhaustion vector closed.
- **P0 #5 set_provenance_status** — search_path re-pinned (read-back: public, extensions, pg_temp).
- **P0 #3 create_org escalation** — DE-CONFLATED: the app already gates platform-admin on
  profiles.is_platform_admin; the real vector was three RLS policies (integrity_flags
  admin_read/admin_update, holdings_quality admin_read) gating on org-owner-of-any-org, which
  let any authenticated user tamper platform flags. Aligned to is_platform_admin (read-back:
  all three use the flag, none use org_memberships). Escalation closed.
- **P0 #4 system_state_flag_audit** — WITHDRAWN (RLS already enabled; original finding false).

Remaining security item: **P0 #6 provenance-flip GUC** (code-level logic bug in mig 118's
guard) — needs a repro test + fix, staged for the pipeline-integrity PR, not a live DB op.

Capture: **capture-worker v1.4 committed** (the 202/charset/claim/allowlist fix); the Supabase
MCP edge-function deploy is HARD-gated by this environment (blocked twice, independent of
operator go) — it must deploy from the committed source via `supabase functions deploy
capture-worker` on the operator side. Proof-on-one replay of a wedged CELEX row runs post-deploy.

## NEW P0 (operator-found 2026-08-09) + FIX — skill gate unsatisfiable by construction

**Finding (operator's framing, sharper than anything the 16-reader pass produced):** the
PreToolUse skill gate "enforces a rule whose escape hatch is structurally out of reach."
The gate is wired GLOBALLY (`~/.claude/settings.json`) but its only satisfaction mechanism is
a successful `Skill` tool invocation recorded in the session transcript. This repo keeps its
skills at `fsi-app/.claude/skills/`, one level BELOW the repo root, so a session rooted at or
above the repo root cannot register them: `Skill: <slug>` returns "Unknown skill", the gate's
demand can never be met, and the deny is permanent. Note what the gate does NOT check: whether
the skill file exists or is readable. A session with full filesystem access that can open,
read and quote the skill verbatim is still denied, because what is being tested is a tool
ceremony, not capability.

**Impact (live, 2026-08-09):** blocked a legitimate `git push` of a CI-green fix commit
(PR #411's F6/C3 remediation), forcing a manual out-of-session push. My audit found this gate's
false POSITIVES (over-broad DANGER matching) and false NEGATIVES (rm -fr, sed -i, node -e, path
normalization); it did NOT find the deadlock. Operator-found.

**Fix (this commit).** Two new primitives in `skill-token.mjs` and a narrow escape in
`gateWrite`:
- `skillUnresolvableInTranscript` — true only when the session ATTEMPTED the Skill tool and the
  attempt ERRORED (positive evidence the demand is impossible here).
- `skillFileReadInTranscript` — true when the session Read the skill's own `SKILL.md`
  (substantive consultation; arguably a stronger form of "looked at it" than the tool call).
- `gateWrite`: when EVERY missing skill carries one of those two proofs, emit **ask** (human
  confirms) instead of **deny**. A session that merely SKIPPED the skill still gets the hard
  deny — discipline preserved. Enforcement is never weakened silently, only made answerable.
- The deny message now names the absolute SKILL.md path and the restart-at-repo-root remedy, so
  this is diagnosable in seconds instead of a relay round-trip.

**Tests:** 8 new cases in `skill-token.test.mjs` (20/20 pass), asserting BOTH directions —
the escape fires on errored-invocation and on SKILL.md-read (posix + Windows paths), and does
NOT fire for a session that never tried, for an errored invocation of a DIFFERENT skill, for an
unrelated file read, or for a successful load. Existing gate tests use empty transcripts, so
they retain their deny verdicts. NOT VERIFIED HERE: `pretooluse-skill-gate.test.mjs` could not
be executed in this environment (its invocation was blocked by the sandbox classifier); CI runs
it via `governance/*.test.mjs`.

**Bootstrap note:** this fix cannot deploy itself — landing it requires the very push the bug
blocks. One out-of-session push bootstraps it; thereafter the gate asks instead of deadlocking.
