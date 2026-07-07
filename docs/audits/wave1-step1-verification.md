# Wave 1a Step 1 — Post-merge verification checklist

Run after these prerequisites are complete:
1. Migration 051 applied to production (`cd fsi-app && npx supabase db push`)
2. PostgREST schema cache reloaded (`psql "$SUPABASE_DB_URL" -c "NOTIFY pgrst, 'reload schema';"`)
3. Backfill executed (`cd fsi-app && node scripts/wave1-last-scanned-backfill.mjs`)
4. agent/run error-capture fix deployed to Vercel

Each check restores one of the four behaviors that were silently disabled before migration 051. See [fsi-app/.claude/CLAUDE.md § agent/run error-swallow post-mortem](../fsi-app/.claude/CLAUDE.md) for context.

## ✅ 1. Provisional gate active

**Goal:** confirm `/api/agent/run` rejects sources with `status='provisional'` before any Browserless render or LLM call.

Steps:
1. Insert a test source row:
   ```sql
   INSERT INTO sources (id, name, url, status, tier, access_method, admin_only)
   VALUES (gen_random_uuid(), 'verification-test-provisional', 'https://example.com/verify-prov', 'provisional', 7, 'scrape', false)
   RETURNING id;
   ```
2. POST to `/api/agent/run` with `{ "sourceUrl": "https://example.com/verify-prov" }` from an authenticated admin session.
3. **Expected:** HTTP 403, body `{ "error": "Source is provisional. Activate it (status='active') before processing." }`. Vercel logs should show no `[agent/run] FETCH` line.
4. Cleanup: `DELETE FROM sources WHERE name = 'verification-test-provisional';`

## ✅ 2. Per-source pause check active

**Goal:** confirm `pauseReason()` is called with the source's actual `id`, not `undefined`.

Steps:
1. Pick an active source with at least one `intelligence_items` row (so the route gets past the targetItem lookup). Note its id.
2. Set per-source pause:
   ```sql
   UPDATE sources SET processing_paused = true WHERE id = '<id>';
   ```
3. POST to `/api/agent/run` with that source's URL.
4. **Expected:** HTTP 409, body contains a per-source pause reason (not the global pause message). Vercel log line `[agent/run] sources lookup error` should NOT appear (column exists post-migration).
5. Cleanup: `UPDATE sources SET processing_paused = false WHERE id = '<id>';`

## ✅ 3. 1h scan cooldown active

**Goal:** confirm a second call within 1h returns 429.

Steps:
1. Pick an active source with an `intelligence_items` row.
2. Trigger `/api/agent/run` once. Wait for a 200 response.
3. Immediately trigger `/api/agent/run` again with the same `sourceUrl`.
4. **Expected on second call:** HTTP 429, body `{ "error": "Source scanned too recently", "next_available": "<ISO timestamp>" }`, header `Retry-After: <seconds>` present.

## ✅ 4. last_scanned UPDATE active

**Goal:** confirm the timestamp actually advances on a successful run.

Steps:
1. Pick an active source. Record `last_scanned` value:
   ```sql
   SELECT last_scanned FROM sources WHERE url = '<url>';
   ```
2. Trigger `/api/agent/run` (use a source that's >1h since last scan, or wait out the cooldown).
3. After 200 response, re-query:
   ```sql
   SELECT last_scanned FROM sources WHERE url = '<url>';
   ```
4. **Expected:** `last_scanned` is now within the last few seconds, advanced from the previous value (which may have been backfilled `last_checked`).

## Pass criteria

All four checks pass → step 1 ships. Surface results back to the dispatch thread for gate-3 recovery acknowledgment.

If any fails: capture the failure mode (HTTP code, body, log line) and halt — do not proceed to gate 5 Wave 1a code dispatch until step 1's recovered behaviors are confirmed working in production.
