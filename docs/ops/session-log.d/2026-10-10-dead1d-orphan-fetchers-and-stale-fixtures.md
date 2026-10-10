# 2026-10-10, lane DEAD-1d (dead1d-orphan-fetchers-and-stale-fixtures): orphan supabase-server fetchers and stale search fixture

## Accomplished

- `fsi-app/src/app/api/search/route.npmtest.mjs`: LIVE_INTELLIGENCE_ITEMS_COLUMNS no longer lists the three columns migration 368 dropped (linked_forum_thread_ids, linked_regulation_ids, linked_vendor_ids); a new test derives the dropped-column set from the migration tree (last ADD or DROP COLUMN event per column wins) and fails when the fixture lists one. Red first (the three columns restored: 1 fail, the three named), green after (9 pass).

## NOT done

- Work in progress; this section is completed before the PR is opened. [WORK: owed]
