// PERF-11 (2026-09-04): supabase-server.ts's domain-scoping fail-soft path is exercised as a SOURCE-TEXT
// proof, matching the established pattern for logic embedded in that file (see
// src/__tests__/domain-laundering.test.mjs) — the module itself is not directly `import`-able by a bare
// `node --test` run: it pulls in `next/cache` (unstable_cache), which resolves only inside Next's own
// module graph (confirmed this lane: `node -e "import('./src/lib/supabase-server.ts')"` fails with
// "Cannot find module '.../node_modules/next/cache'"). tsc (this repo's real type-checker, run separately
// in this lane's gate) proves the code compiles; this proof proves the SHAPE of the fail-soft retry is
// present and has not silently regressed to "trust the domain-scoped call" (which would turn a pre-305
// deploy into an empty /regulations page — see ResourcePage.domain's own header for why that specific
// failure mode is the one this lane had to design around).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SRC = dirname(fileURLToPath(import.meta.url));
const CODE = readFileSync(join(SRC, "supabase-server.ts"), "utf8");

test("DOMAIN_SCOPED_RPCS names get_workspace_intelligence_listings (migration 305's target)", () => {
  const m = CODE.match(/const DOMAIN_SCOPED_RPCS = new Set<string>\(\[([\s\S]*?)\]\);/);
  assert.ok(m, "DOMAIN_SCOPED_RPCS set not found");
  assert.match(m[1], /"get_workspace_intelligence_listings"/);
});

test("buildWorkspaceItemsQuery only adds p_domain when includeDomainArg is explicitly true", () => {
  const m = CODE.match(/export function buildWorkspaceItemsQuery\(([\s\S]*?)\n\}/);
  assert.ok(m, "buildWorkspaceItemsQuery not found");
  const body = m[1];
  assert.match(body, /includeDomainArg\?\s*:\s*boolean/, "includeDomainArg parameter missing");
  assert.match(
    body,
    /if\s*\(includeDomainArg\s*&&\s*DOMAIN_SCOPED_RPCS\.has\(rpcName\)\s*&&\s*typeof page\?\.domain === "number"\)/,
    "the three-way guard (flag AND known-scoped RPC name AND a real domain value) must all be present " +
      "before p_domain is added to the RPC args — dropping any one of them risks sending p_domain to an " +
      "RPC that does not accept it yet"
  );
});

test("fetchWorkspaceResources tries the domain-scoped call first, then falls back to unscoped on error (never trusts success)", () => {
  const m = CODE.match(/async function fetchWorkspaceResources\(([\s\S]*?)\nasync function /);
  assert.ok(m, "fetchWorkspaceResources not found (or the function after it was renamed — adjust the anchor)");
  const body = m[1];

  assert.match(
    body,
    /const wantsDomainScope =\s*\n\s*typeof options\.page\?\.domain === "number" && DOMAIN_SCOPED_RPCS\.has\(rpcName\);/,
    "wantsDomainScope gate missing or changed shape"
  );
  // The scoped attempt must check `.error` itself and NEVER let a failed scoped call's (possibly null)
  // `items` reach the `error || !items?.length` empty-return below without a fallback attempt first —
  // that combination (trust the scoped call, return empty on its error) is exactly what would make
  // /regulations render zero rows for every request made before migration 305 is live.
  assert.match(body, /const scopedQuery = buildWorkspaceItemsQuery\(serviceClient, rpcName, orgId, options\.page, true\);/);
  assert.match(body, /if \(items === null\) \{/, "no unconditional fallback call when the scoped attempt did not yield items");
  assert.match(
    body,
    /const itemsQuery = buildWorkspaceItemsQuery\(serviceClient, rpcName, orgId, options\.page, false\);/,
    "the fallback call must explicitly pass includeDomainArg=false, not rely on a default"
  );
});

test("migration 305's own file exists and is guarded (WRITTEN NOT APPLIED discipline)", () => {
  const migPath = join(SRC, "../../supabase/migrations/305_workspace_intelligence_listings_domain_param.sql");
  const sql = readFileSync(migPath, "utf8");
  assert.match(sql, /p_domain integer DEFAULT NULL/);
  assert.match(sql, /v_pre_md5\s+constant text := '6e329b1f407a0e14ee19596b26eb3198'/, "pre-patch md5 guard missing or changed");
  assert.match(sql, /WHERE \(p_domain IS NULL OR ii\.domain = p_domain\)/);
});
