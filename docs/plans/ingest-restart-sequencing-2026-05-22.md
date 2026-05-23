# Ingest restart sequencing + leakage prerequisite (2026-05-22)

**Scope:** captures the operator's decisions on dispatch E's 7 surfaced items, answers the pre-restart verification question, and locks the 5-step sequence going forward.

## Operator context

Auto-ingest was **intentionally** shut off during the build. The 3-day silence in `intelligence_items.added_date` is the deliberate operational state, not a regression. The eventual restart is **recurring per-source-type cadence ingest** because different source types update at different rates (regulatory sources monthly, market data hourly, trade press daily, etc.). Restart is its own dispatch, separately authorized.

## Decision dispositions on E's 7 items

| E's item | Disposition | Owner / next step |
|---|---|---|
| Staleness fix (A1 / A2 / A3) | DEFERRED to ingest-restart planning | Not a bug, not a hotfix. Will be designed alongside per-source-type cadence + cost gating |
| Leakage fix (B1 / B2 / B3 / B4) | URGENT, prerequisite for ingest restart | Follow B4 = REC-OBS-G path (skill-named). Both halves must land together. Operator approval before landing |
| Domain INT-to-label mapping | URGENT, lands with leakage fix | Document in source-credibility-model skill or a shared constants file referenced by both classifier and surfaces |
| Cost gating | DEFERRED to ingest-restart planning | Belongs with cadence design + cost-discipline rule |
| Customer-facing posture while gaps remain | RESOLVED by backfill + leakage fix | No separate work needed |
| Backfill scope | IN FLIGHT | Backfill plan dispatch producing the migration; consumes E's report + mismatch counts doc |

## Pre-restart verification question (operator asked)

> When ingest is reactivated per source-type cadence, will the scheduling layer route through the same 3 insert sites that currently hardcode `domain=1`?

**Two of three: YES. Third: independent of ingest but should be fixed in the same dispatch.**

### Site 1: `fsi-app/src/app/api/worker/drain-first-fetch/route.ts:276`

```
const seedRow: Record<string, unknown> = {
  source_id: source.id,
  source_url: source.url,
  domain: 1,                 // <-- hardcoded
  status: "monitoring",
  pipeline_stage: "draft",
};
```

This is the primary ingest worker. Consumes `pending_first_fetch` queue, which is filled by the migration 065 trigger when an operator registers a source or flips `auto_run_enabled`. When the restart layer adds per-source-type scheduled triggers, the queue will fill on cadence and this worker will drain it. **On the restart path. Hard prerequisite.**

### Site 2: `fsi-app/src/app/api/admin/scan/route.ts:252`

```
const { error } = await supabase.from("staged_updates").insert({
  update_type: "new_item",
  proposed_changes: {
    ...
    domain: 1,                    // <-- hardcoded
    item_type: "regulation",      // <-- ALSO hardcoded; every scanned item is forced to regulation
    ...
  },
  ...
});
```

Admin-initiated scan stages items for review. This route also hardcodes `item_type: "regulation"` (which is a SECOND bug compounding the domain leakage). If the restart layer wraps `/api/admin/scan` in a cron / scheduler (likely for per-source-type cadence), this path becomes active on restart. **On the restart path. Hard prerequisite.** The hardcoded item_type is a separate fix beyond just the domain emission.

### Site 3: `fsi-app/src/app/api/community/posts/[id]/promote/route.ts:370`

```
const { data: item, error: itemErr } = await service
  .from("intelligence_items")
  .insert({
    title: itemPayload.title,
    ...
    jurisdictions: itemPayload.jurisdictions ?? [],
    domain: 1,                    // <-- hardcoded
  })
```

This is admin-triggered (community admin promoting a community post). Not auto-ingest. Won't be activated by the restart layer. **NOT on the restart path, but fix anyway in the same leakage dispatch for vocabulary consistency.**

### Summary of prerequisite

**Leakage fix is a hard prerequisite for the FIRST source-type cadence reactivation**, not a "before all sources" thing. The first reactivation through `pending_first_fetch` or any scheduled admin scan will start producing newly mis-classified items unless the leakage fix has landed.

`/api/community/posts/[id]/promote` is independent of restart but must ship in the same leakage fix for consistency.

## Additional verification: full insert-site sweep (2026-05-22)

After E's report identified 3 insert sites, a follow-up sweep of all `.from("intelligence_items")` usage in `fsi-app/src/app/api/**` found a FOURTH insert path E did not enumerate explicitly:

### Site 4 (transitive): `fsi-app/src/app/api/staged-updates/route.ts:305`

```
const { data: inserted, error } = await supabase
  .from("intelligence_items")
  .insert(insertData)             // <-- insertData = staged_updates.proposed_changes minus 2 stripped fields
  .select("id")
  .single();
```

This is the `applyUpdate` helper's `new_item` branch. It inserts the staged_update's `proposed_changes` blob directly into `intelligence_items`. The `domain` value comes from whatever upstream code populated `proposed_changes` — TODAY, that is `/api/admin/scan/route.ts:252` which hardcodes `domain: 1` AND `item_type: "regulation"`.

**Transitivity**: if Site 2 (admin/scan) is fixed by B4 to stop hardcoding, the values that flow into staged_updates.proposed_changes become correct, and Site 4 inherits the fix automatically. No direct edit needed at Site 4. However, ANY future route that writes to staged_updates with hardcoded `domain` re-introduces the leakage because Site 4 is non-validating.

### Other intelligence_items mutation sites (not insert; non-risk)

- `agent/run/route.ts:680` — UPDATE on existing items; preserves existing domain unless the update payload includes one. Reviewed: the update payload does not set `domain`. Safe.
- `staged-updates/route.ts:316, 329, 347` — UPDATE / status_change / archive_item branches of `applyUpdate`. None set `domain`. Safe.
- `admin/canonical-sources/decide/route.ts:280`, `bulk-approve/route.ts:202`, `bulk-classify/route.ts:189`, `recommend-classification/route.ts:202` — sources-table operations that read intelligence_items for joins; do not insert. Safe.
- `admin/integrity-flags/*` — flag CRUD; reads + UPDATEs only. Safe.
- `admin/sources/[id]/regenerate-brief/route.ts:97` — UPDATE only. Safe.
- `intelligence-items/[id]/metadata/route.ts` — UPDATE only. Safe.
- `workspace/overrides/route.ts:26` — workspace_item_overrides; does not touch intelligence_items.domain. Safe.

### Worker entry point auth + cadence triggerability

| Route | Auth | Programmatic-cron-triggerable | Notes |
|---|---|---|---|
| `/api/worker/drain-first-fetch` | `x-worker-secret` header (per route comment line 26-30) | YES (cron sends header) | Consumes `pending_first_fetch` queue |
| `/api/worker/check-sources` | `x-worker-secret` header (line 24-28) | YES (cron sends header) | Source-health monitor only; no intelligence_items insert |
| `/api/admin/scan` | `requireAuth` + `isPlatformAdmin` user-session | NOT cron-triggerable today (would need WORKER_SECRET path added OR cron-as-admin-user) | If restart wraps scan, this gate must be relaxed or a parallel cron-friendly variant must be built |

So the most natural cron integration point is **drain-first-fetch** — already cron-secret-gated, already drains a queue, just needs the cron to fill `pending_first_fetch` on per-source-type cadence (probably via a thin enqueue-by-source-type cron route).

If a restart path uses `/api/admin/scan` instead, that route's auth model needs adjustment first (its current `requireAuth + isPlatformAdmin` blocks cron).

### Is `community/posts/promote` on ANY scheduled path?

Reviewed. The route requires:
- An authenticated session
- A community admin role check
- A POST body referencing a specific `posts.id` and a `kind` field

There is no time-based trigger anywhere in the codebase that would synthesize the required body + auth context. **NOT on any scheduled-ingest path** today. If a future "auto-promote highest-engagement community post weekly" feature ships, this route would become time-triggered. Worth flagging as a future consideration but not blocking.

### Verdict: B4 sufficiency

**B4 as scoped (classifier emits domain + all 3 hardcoded sites stop hardcoding) PROTECTS every plausible scheduled-ingest path TODAY**, because:

1. **drain-first-fetch:276** is the primary cron path. Direct fix.
2. **admin/scan:252** is the secondary cron candidate (if restart wraps scan). Direct fix. Also covers Site 4 transitively.
3. **community/posts/promote:370** is not scheduled but fixed anyway for consistency.
4. **staged-updates:305** is fixed transitively via admin/scan.

**Defense-in-depth recommendation (additive to B4, optional)**: add a validation guard in `applyUpdate.new_item` that warns/rejects when `proposed_changes.domain === 1` but `proposed_changes.item_type` clearly implies a non-regulation surface (e.g., `market_signal`, `research_finding`, `technology`). This catches future routes that write to staged_updates with hardcoded values, before they reach intelligence_items. Cost: ~10 lines + a 1-time vocabulary maintenance burden as item_types evolve. Operator can choose to add this in the same B4 dispatch or defer.

**New architecture risk**: if a future ingest dispatch builds a NEW worker route (not drain-first-fetch / admin/scan), it inherits classifier output if it uses the same classifier, but a developer could still hardcode `domain: 1` in a new insert. The validation guard above is the best defense. Otherwise the leakage class is "re-introducible by future code change". Worth a fitness function (F-class check) that grep-blocks new `domain: 1` literals in `intelligence_items.insert` payloads, but that's separate engine work.

### One follow-up surface limitation (not B4 scope; surfaced by backfill plan)

The backfill plan dispatch (`4c934e1`) surfaced that `surface-coverage.ts` and other surface filters route /research by `item_type === 'research_finding'`, not by `domain === 7`. After backfill executes, the 14 framework + 7 initiative rows moved to d=7 become semantically correct in domain but do NOT surface on /research until either:
- Application code adds d=7 to the /research filter, OR
- REC-OBS-G remediation wires the category-aware RPCs end-to-end on /research

This is a Fix D (architectural cleanup) concern, NOT a leakage-fix concern. Domain backfill alone fully fixes /regulations (193+ leaks resolved); partial impact on /market and /operations; minimal impact on /research until D lands.

## Sequence going forward

| Step | Owner | Gating |
|---|---|---|
| **a.** Wait for backfill plan agent to land | Background agent | None |
| **b.** Operator approves backfill migration; backfill executes; existing 193+ items reclassified | Operator + manual migration run | Operator signoff on migration SQL |
| **c.** Leakage fix dispatch lands: B4 path + insert sites stop hardcoding domain=1 + classifier emits domain + INT-to-label mapping documented | Dispatch (TBD) | Operator approval on dispatch scope |
| **d.** Verify backfill + leakage fix together produce correct domain assignment on a test item before any ingest restart | Manual smoke test | None gating, but blocking for step e |
| **e.** Ingest restart planning resumes: A-path choice + cost gating + per-source cadence + cron scheduling | Separate dispatch | Separate operator authorization |

Each step gates the next. Skipping ahead reintroduces the leakage class.

## What the leakage fix dispatch must cover (when authorized)

1. **B4 implementation per `caros-ledge-platform-intent` skill REC-OBS-G** — confirm what the skill names before implementing; if the named pattern differs from the obvious shape ("classifier emits domain alongside item_type"), follow the skill
2. **`drain-first-fetch/route.ts:276`** — replace `domain: 1` with classifier-emitted domain (or NULL if classifier unsure, with the strict downstream filter as defensive prophylaxis)
3. **`admin/scan/route.ts:252`** — replace BOTH `domain: 1` and `item_type: "regulation"` with classifier output. This route is currently double-buggy.
4. **`community/posts/[id]/promote/route.ts:370`** — replace `domain: 1` with classifier-emitted or operator-input domain at promotion time (community admin should pick the destination surface)
5. **Classifier emits domain** — update `fsi-app/src/lib/llm/first-fetch-classify.ts` to add `domain` to its output schema + Haiku prompt
6. **Domain INT-to-label mapping documented** — in `fsi-app/.claude/skills/source-credibility-model/SKILL.md` OR a shared constants file referenced by classifier + surfaces. Today the INT-to-domain mapping is implicit; surfaces reference `domain === 1` etc. without a named constant
7. **No `--no-verify` pushes** — pre-push hook runs 4 CI-parity checks
8. **Operator approval before landing** — surface the proposed code diff + the new classifier prompt for operator sign-off before merge

## Cross-references

- `docs/plans/ingest-pipeline-investigation-2026-05-22.md` (E's report; commit `a5347c0`)
- `docs/plans/regulations-classification-mismatch-counts-2026-05-22.md` (conservative quantification; commit `aac9986`)
- `docs/plans/classification-backfill-plan-2026-05-22.md` (in flight; will land at the backfill agent's commit)
- `docs/plans/dead-code-disposition-2026-05-21.md` (5-surface model + Q9 chip family context)

## Why this matters

The /regulations hotfix (A+B+C, `db3a8b0`) closed the customer-visible incoherence but is defensive prophylaxis only on the classification axis. Without the leakage fix + backfill, every new item produced on ingest restart will be mis-classified as a regulation, undoing the backfill's progress and reintroducing the visible leakage. The sequence above ensures the customer-facing surfaces stay coherent across the restart.
