# Product-code wiring truth — is all of our code actually wired? (2026-08-09)

Operator question: the goldens being unwired is a symptom; are the MAIN functions of the site, the
skills, and the build/manage tooling actually wired and reachable, or are there dead/orphaned/half-built
pieces the same way? Method: four parallel read-only readers across API routes, UI surfaces/components,
the generation pipeline + skills, and operational tooling/fleet; the single load-bearing finding
(skills-not-loaded) independently re-verified against source. Every finding carries a rule-14 status token.
This is a wiring audit (is it invoked/reachable), not a correctness review.

## Headline

The CORE is sound. The one generation path is single and live, all five customer surfaces are built and
reachable, CI is active, and every non-running subsystem (the fleet, two CI schedules) is a DELIBERATE,
documented disablement, not orphaning. The real gaps are a bounded set: 3 orphan API routes, a cluster of
dead UI, a skills-to-runtime drift risk, and the audit-layer gaps already found. None corrupts data
(gate_a_health: verified_failing_revalidation=0).

## SOUND — verified wired

- **Single generation path** [CONFIRMED — subagent trace + doctrine]: `POST /api/agent/run` → `generate-brief.ts` → `canonical-pipeline.ts`. `synthesiseAndWriteBrief` is defined only in canonical-pipeline and called only from its own generate/re-ground/re-research tiers. No competing or dead brief generator exists; the other ~25 Anthropic callers are non-brief (Q&A, staging, Haiku classifiers) and were checked.
- **All 5 customer surfaces built + routed + reachable** [CONFIRMED — subagent import-graph]: Regulations, Market Intel, Research, Operations, Community each have a live index route + detail route + a real ledger component, all in the sidebar nav. No stubs or "coming soon".
- **CI active** [CONFIRMED]: discipline, bug-class-guard, data-audit-lane (nightly), trust-recompute, uptime-probes all live and their entrypoints exist. No broken/missing-script jobs.
- **Fleet halt is intentional** [CONFIRMED]: all charters carry the STEP 0 budget kill-switch verbatim and the halt row is open; two independent layers engaged. Not an orphan.
- **2 CI schedules disabled by design** [CONFIRMED]: source-monitoring + spot-check-monthly, the acquisition freeze — dispatch-only, documented.

## GAPS — real, bounded, named

1. **Skills are not loaded at runtime; content is hand-copied into code** [CONFIRMED — independently re-verified]. No runtime code reads a `SKILL.md` from disk (`src/lib/llm/skill-loader.ts:14` documents why — serverless can't resolve `.claude/skills/`). The brief pipeline's format contract is hand-encoded in `system-prompt.ts` + `formats/*.ts`; the Assistant uses a hand-copied `ENVIRONMENTAL_POLICY_SKILL_CORE` constant. Consequence: the skill files are the nominal source of truth but the runtime reads copies, so editing a skill does NOT change generation, and nothing guards skill↔code drift. This is a deliberate, documented tradeoff, not a break — but the drift risk is unguarded. Two skills are fully unreferenced by runtime: `sprint-followups-discipline` (a DEV-process skill — expected not-in-runtime) and a 7th skill `caros-ledge-surface-contracts` (0 references in src/ or scripts/ — orphan/docs-only).
2. **3 orphan API routes** [CONFIRMED — subagent grep, zero callers]: `admin/promotion-policy` (no reference anywhere), `admin/users` (only a code comment, has working GET/POST provisioning), `version` (intentional public build-metadata endpoint — benign, keep). So 2 genuine orphans + 1 intentional. No broken routes; the two "stub" hits (community mute-user, tier-opinions) are documented Phase-D placeholders.
3. **Dead UI** [CONFIRMED — subagent import-graph, zero importers]: `SectorSynopsis.tsx` (~330 lines, never rendered) — and `.claude/CLAUDE.md` asserts it "is currently still rendered", which is DRIFT. Plus 5 redesign-superseded Regulations controls (`BulkSelectBar`, `SectorChipFilter`, `ConfidenceFacet`, `SortRow`, `ViewToggles`) and 3 leaf utilities, all with zero importers.
4. **Audit-layer wiring gaps** [CONFIRMED — the wiring sweep]: `audit-finding-status.mjs` (the rule-14 checker, cited in CLAUDE.md as the enforcer, run by nothing), `stale-verified-audit.mjs`, `surface-visibility-audit.mjs` (both live-data audits with governing cites, absent from the lane). `wave-acceptance-audit.mjs` + `defect-signature-scan.mjs` are self-labeled scaffolds (honest-not-silent).

## Doc drift found (rule-13 corollary — correct in place)

- `.claude/CLAUDE.md`: claims `SectorSynopsisView` is "currently still rendered against full_brief" — it is not mounted anywhere. Correct to "shelved, not mounted".

## Fix plan (decision-ready; one follow-up PR after #415)

- **Skill↔code drift guard**: add a sync-check that fails CI if a hand-encoded skill constant diverges from its SKILL.md's binding section (or an explicit operator ruling that the code is the operative SoT and skills are design docs — a decision, not a default). This is the deepest fix and needs your call on which direction.
- **Orphan routes**: remove `admin/promotion-policy` + `admin/users` or wire them to their intended callers (decision: were they planned features?). Keep `version`.
- **Dead UI**: delete `SectorSynopsis` (or honor the shelved-sector-activation decision and keep it explicitly parked) + the 5 superseded Regulations controls; fix the CLAUDE.md drift line.
- **Audit-layer**: wire `stale-verified` + `surface-visibility` into the lane; wire `audit-finding-status` into CI; add a STANDING gate that fails the build on any unwired proof (reusing `execution-wiring.mjs`) so this class cannot recur silently.
- **7th skill**: register `caros-ledge-surface-contracts` as consumed or archive it.

## What this audit does NOT claim

It is a wiring audit, not a line-by-line correctness audit. "Reachable" ≠ "bug-free". Orphan-ness for
each item rests on import/caller grep evidence; where a reader could not confirm, it is not listed.
