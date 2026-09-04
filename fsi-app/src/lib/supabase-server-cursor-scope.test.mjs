// PERF-12 (2026-09-04, ADR-027 §2): supabase-server.ts's keyset-cursor fail-soft path, proved as a
// SOURCE-TEXT test — same rationale and pattern as supabase-server-domain-scope.test.mjs (PERF-11):
// this module pulls in `next/cache` and cannot be bare-node-imported; tsc proves it compiles, this
// proves the SHAPE of the cursor fail-soft ladder is present and has not silently regressed to
// "trust the cursor-scoped call" (which would return zero rows for every request made before
// migration 306 is live — the same failure class PERF-11 designed the domain retry around).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SRC = dirname(fileURLToPath(import.meta.url));
const CODE = readFileSync(join(SRC, "supabase-server.ts"), "utf8");

test("CURSOR_SCOPED_RPCS names get_workspace_intelligence_listings (migration 306's target)", () => {
  const m = CODE.match(/const CURSOR_SCOPED_RPCS = new Set<string>\(\[([\s\S]*?)\]\);/);
  assert.ok(m, "CURSOR_SCOPED_RPCS set not found");
  assert.match(m[1], /"get_workspace_intelligence_listings"/);
});

test("buildWorkspaceItemsQuery only adds p_after_* when includeCursorArg is explicitly true AND a full cursor triple is present", () => {
  const m = CODE.match(/export function buildWorkspaceItemsQuery\(([\s\S]*?)\n\}/);
  assert.ok(m, "buildWorkspaceItemsQuery not found");
  const body = m[1];
  assert.match(body, /includeCursorArg\?\s*:\s*boolean/, "includeCursorArg parameter missing");
  assert.match(
    body,
    /const usingCursor =\s*\n\s*!!includeCursorArg &&\s*\n\s*CURSOR_SCOPED_RPCS\.has\(rpcName\) &&/,
    "the usingCursor guard (flag AND known-scoped RPC name) must gate p_after_* — dropping either " +
      "risks sending cursor args to an RPC that does not accept them yet"
  );
  assert.match(
    body,
    /typeof page\?\.afterPriority === "string" &&\s*\n\s*page\.afterPriority\.length > 0 &&\s*\n\s*typeof page\?\.afterId === "string" &&\s*\n\s*page\.afterId\.length > 0;/,
    "usingCursor must require a real, non-empty afterPriority AND afterId — an empty-string/undefined " +
      "cursor field must never be sent as a real keyset boundary"
  );
  // The cursor path ranges from 0 (the WHERE clause already excluded everything at/before the
  // cursor), never from page.offset (a running total-consumed count, meaningless once the server
  // filters by row identity instead of position) — mixing the two would silently skip or repeat rows.
  assert.match(
    body,
    /const from = usingCursor \? 0 : page\.offset;/,
    "cursor-scoped calls must range from 0, not from the accumulated offset"
  );
});

test("fetchWorkspaceResources tries the cursor-scoped call first, then falls back to the domain-only/unscoped ladder on error (never trusts success)", () => {
  const m = CODE.match(/async function fetchWorkspaceResources\(([\s\S]*?)\nasync function /);
  assert.ok(m, "fetchWorkspaceResources not found (or the function after it was renamed — adjust the anchor)");
  const body = m[1];

  assert.match(
    body,
    /const wantsCursorScope =\s*\n\s*wantsDomainScope &&\s*\n\s*CURSOR_SCOPED_RPCS\.has\(rpcName\) &&/,
    "wantsCursorScope gate missing or changed shape — cursor scope must also require domain scope " +
      "(the /regulations caller always wants both together)"
  );
  assert.match(
    body,
    /const cursorQuery = buildWorkspaceItemsQuery\(serviceClient, rpcName, orgId, options\.page, true, true\);/,
    "cursor attempt must pass includeDomainArg=true AND includeCursorArg=true together"
  );
  assert.match(
    body,
    /if \(items === null && wantsDomainScope\) \{/,
    "the domain-only fallback must only run when items are still unset AND domain scope was actually " +
      "wanted — this is the SAME existing PERF-11 branch, now gated so the cursor attempt's own " +
      "success is not silently overwritten by a redundant second call"
  );
  assert.match(
    body,
    /if \(items === null\) \{/,
    "the final fully-unscoped fallback (PERF-11, unchanged) must still exist as the last resort"
  );
});

test("migration 306's own file exists and is guarded (WRITTEN NOT APPLIED discipline)", () => {
  const migPath = join(SRC, "../../supabase/migrations/306_workspace_intelligence_listings_cursor.sql");
  const sql = readFileSync(migPath, "utf8");
  assert.match(sql, /p_after_priority text DEFAULT NULL/);
  assert.match(sql, /p_after_added_date date DEFAULT NULL/);
  assert.match(sql, /p_after_id uuid DEFAULT NULL/);
  assert.match(sql, /v_pre305_md5\s+constant text := '6e329b1f407a0e14ee19596b26eb3198'/, "pre-305 md5 guard missing or changed (must match 305's own known-good value)");
  assert.match(sql, /RAISE EXCEPTION 'ABORT 306/, "must abort rather than silently apply against an unrecognized baseline");
  assert.match(sql, /IF v_def LIKE '%p_after_id%' THEN/, "idempotent already-applied check missing");
});
