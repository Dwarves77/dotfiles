// supabase-server-rpc-scope.test.mjs — RECONCILE (2026-09-04, items 1/2/3) source-text proof.
//
// REPLACES two deleted test files from the pre-reconciliation architecture:
//   - supabase-server-domain-scope.test.mjs (PERF-11) — proved a two-attempt fail-soft ladder
//     (scoped call, then an unconditional unscoped fallback on ANY error) around
//     buildWorkspaceItemsQuery's `includeDomainArg`.
//   - supabase-server-cursor-scope.test.mjs (PERF-12) — proved a THIRD fail-soft attempt layered on
//     top of the domain ladder, plus an `includeCursorArg` parameter and a `CURSOR_SCOPED_RPCS`
//     constant on the ORG-SCOPED `get_workspace_intelligence_listings` (a migration that shipped a
//     5-arg overload beside 305's live 2-arg one — the exact PostgREST-ambiguity defect 305 exists to
//     prevent).
//
// THE RECONCILIATION (this lane, ADR-027 reconciliation report): all three fail-soft ladders are
// gone. The coordinator's DDL-before-code guarantee means a missing RPC parameter is a genuine
// deployment defect, not a condition to silently route around — supabase-server.ts now makes ONE
// direct RPC call per caller, logs any real error via console.error, and returns an empty result
// rather than retrying into a differently-scoped call. The keyset cursor moved OFF the org-scoped RPC
// entirely, onto the org-independent `get_workspace_intelligence_listings_public` (migration 306) —
// `CURSOR_SCOPED_RPCS`/`includeCursorArg` no longer exist anywhere in this file; the org-scoped
// `buildWorkspaceItemsQuery` keeps only `includeDomainArg` (migration 305's `p_domain`, unaffected by
// this reconciliation).
//
// Same rationale as the two files this replaces for WHY this is a source-text proof rather than a
// live import: this module pulls in `next/cache` (unstable_cache), which resolves only inside Next's
// own module graph (confirmed originally by PERF-11: a bare `node -e "import('./supabase-server.ts')"`
// fails with "Cannot find module '.../node_modules/next/cache'"). tsc (run separately in this lane's
// gate) proves the code compiles; this proves the SHAPE of the single-call architecture is present
// and has not silently regrown a retry ladder or a second cursor-carrying overload.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SRC = dirname(fileURLToPath(import.meta.url));
const CODE = readFileSync(join(SRC, "supabase-server.ts"), "utf8");

test("DOMAIN_SCOPED_RPCS still names get_workspace_intelligence_listings (migration 305, unaffected by this reconciliation)", () => {
  const m = CODE.match(/const DOMAIN_SCOPED_RPCS = new Set<string>\(\[([\s\S]*?)\]\);/);
  assert.ok(m, "DOMAIN_SCOPED_RPCS set not found");
  assert.match(m[1], /"get_workspace_intelligence_listings"/);
});

test("regression guard: CURSOR_SCOPED_RPCS (the org-scoped cursor variant, item 2's 'no second overload ever') does not exist", () => {
  assert.doesNotMatch(
    CODE,
    /\bCURSOR_SCOPED_RPCS\b/,
    "CURSOR_SCOPED_RPCS named an org-scoped RPC carrying a keyset-cursor overload beside its live " +
      "2-arg signature (the exact PostgREST-ambiguity defect migration 305's fix prevents) — the " +
      "cursor now lives ONLY on the public RPC (PUBLIC_CURSOR_SCOPED_RPCS). If this fails, someone " +
      "reintroduced the org-scoped cursor overload this reconciliation deleted.",
  );
});

test("buildWorkspaceItemsQuery keeps only includeDomainArg — no includeCursorArg parameter", () => {
  const m = CODE.match(/export function buildWorkspaceItemsQuery\(([\s\S]*?)\n\)/);
  assert.ok(m, "buildWorkspaceItemsQuery signature not found");
  const signature = m[1];
  assert.match(signature, /includeDomainArg\?\s*:\s*boolean/, "includeDomainArg parameter missing");
  assert.doesNotMatch(
    signature,
    /includeCursorArg/,
    "buildWorkspaceItemsQuery must not carry an includeCursorArg parameter — the org-scoped RPC never " +
      "carries a cursor (see PUBLIC_CURSOR_SCOPED_RPCS's own header for where the cursor actually lives)",
  );
});

test("buildWorkspaceItemsQuery only adds p_domain when includeDomainArg is explicitly true AND page.domain is a number", () => {
  const m = CODE.match(/export function buildWorkspaceItemsQuery\(([\s\S]*?)\n\}/);
  assert.ok(m, "buildWorkspaceItemsQuery body not found");
  const body = m[1];
  assert.match(
    body,
    /if\s*\(includeDomainArg\s*&&\s*DOMAIN_SCOPED_RPCS\.has\(rpcName\)\s*&&\s*typeof page\?\.domain === "number"\)/,
    "the three-way guard (flag AND known-scoped RPC name AND a real domain value) must gate p_domain",
  );
});

test("fetchWorkspaceResources makes exactly ONE call to buildWorkspaceItemsQuery — no retry ladder", () => {
  const m = CODE.match(/async function fetchWorkspaceResources\(([\s\S]*?)\nasync function /);
  assert.ok(m, "fetchWorkspaceResources not found (or the function after it was renamed — adjust the anchor)");
  const body = m[1];

  const calls = [...body.matchAll(/buildWorkspaceItemsQuery\(/g)];
  assert.equal(
    calls.length,
    1,
    `fetchWorkspaceResources calls buildWorkspaceItemsQuery ${calls.length} time(s) — expected exactly ` +
      "1 (a retry ladder that calls it a second time on error is the fail-soft pattern this " +
      "reconciliation removed; a real RPC failure must be logged and surfaced empty, never silently " +
      "retried into a differently-scoped call)",
  );
  assert.match(
    body,
    /const query = buildWorkspaceItemsQuery\(serviceClient, rpcName, orgId, options\.page, true\);/,
    "expected the single direct call, includeDomainArg always true (buildWorkspaceItemsQuery itself " +
      "decides whether p_domain actually attaches)",
  );
  assert.match(
    body,
    /if \(error\) \{\s*\n\s*console\.error\(/,
    "a real RPC error must be logged via console.error, not silently swallowed into a retry",
  );
  assert.doesNotMatch(
    body,
    /\bwantsDomainScope\b|\bwantsCursorScope\b/,
    "the old fail-soft ladder's gate variables (wantsDomainScope/wantsCursorScope) must not reappear",
  );
});

test("PUBLIC_DOMAIN_SCOPED_RPCS and PUBLIC_CURSOR_SCOPED_RPCS both name the org-independent public RPC (migration 306)", () => {
  const domainSet = CODE.match(/const PUBLIC_DOMAIN_SCOPED_RPCS = new Set<string>\(\[([\s\S]*?)\]\);/);
  const cursorSet = CODE.match(/const PUBLIC_CURSOR_SCOPED_RPCS = new Set<string>\(\[([\s\S]*?)\]\);/);
  assert.ok(domainSet, "PUBLIC_DOMAIN_SCOPED_RPCS set not found");
  assert.ok(cursorSet, "PUBLIC_CURSOR_SCOPED_RPCS set not found");
  assert.match(domainSet[1], /"get_workspace_intelligence_listings_public"/);
  assert.match(cursorSet[1], /"get_workspace_intelligence_listings_public"/);
});

test("fetchPublicWorkspaceResources makes exactly ONE rpc() call — no retry ladder", () => {
  const m = CODE.match(/async function fetchPublicWorkspaceResources\(([\s\S]*?)\n\}\n\n\/\*\*/);
  assert.ok(m, "fetchPublicWorkspaceResources not found (or the block after it was renamed — adjust the anchor)");
  const body = m[1];

  const calls = [...body.matchAll(/serviceClient\.rpc\(rpcName, rpcArgs\)/g)];
  assert.equal(
    calls.length,
    1,
    `fetchPublicWorkspaceResources calls serviceClient.rpc(rpcName, rpcArgs) ${calls.length} time(s) — ` +
      "expected exactly 1 (one direct call built from the final signature, no fail-soft retry)",
  );
  assert.match(
    body,
    /if \(error\) \{\s*\n\s*console\.error\(/,
    "a real RPC error must be logged via console.error, not silently swallowed into a retry",
  );
});

test("fetchPublicWorkspaceResources attaches p_after_* only when a full afterPriority+afterId pair is present", () => {
  const m = CODE.match(/async function fetchPublicWorkspaceResources\(([\s\S]*?)\n\}\n\n\/\*\*/);
  assert.ok(m);
  const body = m[1];
  assert.match(
    body,
    /const usingCursor =\s*\n\s*PUBLIC_CURSOR_SCOPED_RPCS\.has\(rpcName\) &&\s*\n\s*typeof page\?\.afterPriority === "string" &&\s*\n\s*page\.afterPriority\.length > 0 &&\s*\n\s*typeof page\?\.afterId === "string" &&\s*\n\s*page\.afterId\.length > 0;/,
    "usingCursor must require a real, non-empty afterPriority AND afterId — an empty-string/undefined " +
      "cursor field must never be sent as a real keyset boundary",
  );
});

test("migration 306 fixes the CASE-WHEN-NULL bug with a searched CASE (IS NULL), not the simple form (x = NULL, never true)", () => {
  const migPath = join(SRC, "../../supabase/migrations/306_public_workspace_intelligence_listings.sql");
  const sql = readFileSync(migPath, "utf8");
  assert.match(
    sql,
    /v_after_rank := CASE\s*\n\s*WHEN p_after_priority IS NULL THEN NULL/,
    "v_after_rank must be computed with a searched `CASE WHEN p_after_priority IS NULL THEN NULL ...` " +
      "— the simple form `CASE p_after_priority WHEN NULL THEN ...` compiles to `p_after_priority = " +
      "NULL`, which three-valued logic makes never true, silently corrupting every NULL-cursor call",
  );
  // Strip SQL line comments before checking for the buggy form — the migration's own header PROSE
  // deliberately quotes `CASE p_after_priority WHEN NULL THEN ...` to describe the bug it fixes, which
  // would otherwise false-positive this guard.
  const codeOnly = sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
  assert.doesNotMatch(
    codeOnly,
    /CASE p_after_priority\s*\n?\s*WHEN NULL THEN/,
    "the buggy simple-CASE form (CASE p_after_priority WHEN NULL THEN ...) must not reappear in live code",
  );
  assert.match(sql, /p_after_priority text DEFAULT NULL/);
  assert.match(sql, /p_after_added_date date DEFAULT NULL/);
  assert.match(sql, /p_after_id uuid DEFAULT NULL/);
});

test("migration 306 carries exactly ONE signature for get_workspace_intelligence_listings_public (no second overload)", () => {
  const migPath = join(SRC, "../../supabase/migrations/306_public_workspace_intelligence_listings.sql");
  const sql = readFileSync(migPath, "utf8");
  const creates = [...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.get_workspace_intelligence_listings_public\(/g)];
  assert.equal(
    creates.length,
    1,
    `found ${creates.length} CREATE statement(s) for get_workspace_intelligence_listings_public — a ` +
      "second CREATE with a different parameter list would ship a second overload, the exact " +
      "PostgREST-ambiguity defect this reconciliation exists to prevent",
  );
});

test("no org-scoped cursor migration file exists (PERF-12's original 5-arg overload draft was deleted, not applied)", () => {
  const migDir = join(SRC, "../../supabase/migrations");
  const files = readdirSync(migDir);
  const suspects = files.filter((f) => /cursor/i.test(f));
  assert.deepEqual(
    suspects,
    [],
    `found migration file(s) with "cursor" in the name: ${suspects.join(", ")} — PERF-12's original ` +
      "org-scoped cursor migration must stay deleted (never applied); the only live cursor-carrying " +
      "signature is get_workspace_intelligence_listings_public inside migration 306",
  );
  // The cursor param belongs to exactly ONE function: get_workspace_intelligence_listings_public
  // (migration 306). A LATER migration extending that SAME function in place (CREATE OR REPLACE with
  // the identical parameter list — e.g. migration 308 appending a trailing `item_grade` RETURNS TABLE
  // column, lane CHIPS 2026-09-05) is legitimate maintenance, not a second/different cursor-scoped
  // overload — the defect this test guards against is a NEW function, or a DIFFERENT parameter list,
  // introducing a second signature. So: extract every file's parameter list for that one function name
  // and require it to be byte-identical to migration 306's, and require p_after_priority to appear
  // ONLY inside that function's own declaration (never bound to some other function name).
  const SIGNATURE_RE =
    /CREATE OR REPLACE FUNCTION public\.get_workspace_intelligence_listings_public\(([\s\S]*?)\)\s*\n RETURNS TABLE/;
  const canonicalSql = readFileSync(join(migDir, "306_public_workspace_intelligence_listings.sql"), "utf8");
  const canonicalParams = canonicalSql.match(SIGNATURE_RE)?.[1]?.trim();
  assert.ok(canonicalParams, "migration 306 must declare get_workspace_intelligence_listings_public's parameter list");

  for (const f of files) {
    if (!f.endsWith(".sql")) continue;
    const sql = readFileSync(join(migDir, f), "utf8");
    if (!/p_after_priority/.test(sql)) continue;
    if (f === "306_public_workspace_intelligence_listings.sql") continue;
    const params = sql.match(SIGNATURE_RE)?.[1]?.trim();
    assert.ok(
      params,
      `${f} mentions p_after_priority but does not (re)declare ` +
        "get_workspace_intelligence_listings_public with a matching signature block — a cursor param " +
        "bound to any other function name is exactly the second-overload defect this test guards against",
    );
    assert.equal(
      params,
      canonicalParams,
      `${f} redeclares get_workspace_intelligence_listings_public with a parameter list that differs ` +
        "from migration 306's — that is a second, incompatible overload (the PERF-12 defect), not a " +
        "legitimate in-place extension",
    );
    // The whole file's occurrence(s) of p_after_priority must all sit inside that one function's own
    // CREATE-statement block, not leak into some other function's parameter list.
    const otherFunctionParamLists = [
      ...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(([\s\S]*?)\)\s*\n RETURNS/g),
    ].filter((m) => m[1] !== "get_workspace_intelligence_listings_public");
    for (const m of otherFunctionParamLists) {
      assert.doesNotMatch(
        m[2],
        /p_after_priority/,
        `${f}: function ${m[1]} must not carry a p_after_priority parameter — only ` +
          "get_workspace_intelligence_listings_public is cursor-scoped",
      );
    }
  }
});
