# Operator Ruling R14 (2026-09-25)

**Date:** 2026-09-25

**Operator verbatim:** "we are NOT updating the data on the site, we are building the tools that manage that data first, that must be complete before we do anything else"

**Coordinator's gloss:** No lane changes live data on the site (no item dispositions, backfills, re-mints, populating tables) until the data-management tools are complete. Audit findings that describe data state (e.g. the Supabase audit's RW-3 quarantine dwell: 66/78 past 14 days; RW-2/UI-3 state_cost_facts with readers and no producer) are read as TOOL gaps (the disposition tool, the producer) to build, never as data to fix by hand or batch. Security/access-control fixes (like migration 330) are not data updates. Consistent with R4 (data management is the work) and standing rule 16 (build mode).

**Consequences:**
- Every lane below that would change live data waits
- Lanes build the managing tools first
- 6.3 data (migration 299 + 146-item re-mint, brief batches, statutory upload) and any audit remediation that writes data are held behind the tools
- Data-management tools must be complete and tested before any live data is updated on the site
