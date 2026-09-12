---
id: ADR-028
title: Record grade is a transit state, not a terminal one
status: accepted
date: 2026-09-11
scope:
  - "fsi-app/src/lib/intake/mint-item.ts"
  - "fsi-app/src/lib/agent/canonical-pipeline.ts"
  - "fsi-app/supabase/migrations/278_item_grade.sql"
  - "fsi-app/scripts/turns/run-population-flywheel.mjs"
  - "fsi-app/src/app/api/**/*"
supersedes: null
related:
  - ADR-025 (deterministic derivations auto-adopt)
  - ADR-023 (producer execution model: named runtime, named schedule)
---

# ADR-028: Record grade is a transit state, not a terminal one

## Context

Operator ruling, 2026-09-09, verbatim (docs/ops/session-log.md:16493-16500): "the fix is making sure a full brief, analysis of the data and all information is pulled and then put through the flywheel to make sure we are connecting data points across the site, right now we have a completely broken and unwired set of tools. it should NOT be locked out, it's integral to the site, so this needs addressed. You're giving me these three like they are options to fix but ALL of them look like they need fixed, the system isn't working because all of this is a problem and briefs need to exist for all items as well."

Measured 2026-09-11 [CONFIRMED, captured in brief-chain-build-plan-2026-09-11.md section 0]: A new item is minted at `item_grade='record'` with a stub `full_brief` and zero analysis fields (summary, why_matters, key_data, sources_used). The mint writes connection discovery, forward events, and compliance_deadline. What it does not do: upgrade the item to a brief, write entity_refs or instrument_entity_id, stamp format_type, or populate the required-for-surfaces fields (Who pays, requirement trajectory, penalties, entry_into_force). The brief-upgrade queuing (Part 3, task 3.5) and execution (Part 3, task 3.4) do not run automatically for new items; Part 2 (the brief contract) is the design, Part 3 is the execution.

## Decision

1. **A record item is admitted to the five customer surfaces in record grade.** This is unchanged from the operator's 2026-09-01 ruling that record-grade items may appear on customer surfaces (docs/plans/system-completion-plan-2026-09-02.md:31). A record item can be read by a customer; it carries forward events, entity references, and obligation discovery applied at mint.

2. **A record item is not done (definition of done per section 0 of complete-system-build-plan-2026-09-04.md) until the brief runtime has upgraded it to a brief.** The upgrade is mandatory and automatic for every new item: queued at mint (task 3.5 of the W9 plan), executed by the runtime (task 3.4 of the W9 plan, the brief-apply driver), and recorded in a harness artifact (rule 17).

3. **The item_grade field is a cache of the brief-runtime state**, not a flag that an operator or a coordination step must decide. The value transitions `record` -> `brief` when the runtime completes; a record item that has been processed by the brief runtime appears on the surfaces as a brief-graded item. The grade is mechanical; it reflects the current upgrade state.

4. **Every new item created by any population path (mint-item.ts) has the brief-upgrade task queued at birth.** The task is part of the item's own creation contract, the same way forward-event extraction and connection discovery are (rule 17). A mint that does not queue the upgrade task is a defect in the mint, never a coordination step.

## Consequences

- The brief-chain-build-plan-2026-09-11 (W9) has three parts: Part 1 (this ADR and the design), Part 2 (the brief contract: what every brief must carry, what surfaces read), Part 3 (the runtime: the upgrade machinery, queued at mint, executed deterministically). W9 is done when Part 3 runs and the harness records every new item's upgrade.
- The W2 done-criterion (population to completion) is amended to include "and is upgraded to a brief by W9's runtime" for every record item, per complete-system-build-plan-2026-09-04.md amendment task 1.5.
- No configuration flag, no per-item decision, no operator review of the grade value itself. The grade is the system's own state.

## References

- complete-system-build-plan-2026-09-04.md: section 0 (definition of done), section 1 (W9 workstream)
- brief-chain-build-plan-2026-09-11.md: Part 1 (architecture design), Part 2 (brief contract), Part 3 (runtime execution)
- ADR-025 (deterministic derivations auto-adopt; same principle applies to brief upgrades)
- ADR-023 (producer execution model: briefs are produced by a named runtime)
- rule 17 (CLAUDE.md standing rules: nothing in the build runs alone; the upgrade must be part of the item's creation contract)

## Related

- [brief-chain-build-plan-2026-09-11](../plans/brief-chain-build-plan-2026-09-11.md): the W9 workstream plan this ADR is Part 1 of
- [complete-system-build-plan-2026-09-04](../plans/complete-system-build-plan-2026-09-04.md): section 0 (definition of done) and the W9 workstream entry this ADR backs
- [ADR-023-producer-execution-model](./ADR-023-producer-execution-model.md): briefs are produced by a named runtime, the execution model this ADR's Decision item 2 depends on
- [08-flywheel-design](../specs/08-flywheel-design.md): the flywheel connections (discovery, forward events, obligations, tags) that a record item carries at mint, ahead of the brief-runtime upgrade this ADR defines
