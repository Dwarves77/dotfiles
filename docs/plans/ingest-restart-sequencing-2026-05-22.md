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
