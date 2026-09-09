// honest-empty, an empty result and a failed read must produce different states
// (lane duenext, 2026-09-08, defect 3 "the fallback that lies").
//
// THE DEFECT. `fetchDashboardData` ended its happy path with
//
//     if (!resources.length) return { ...emptyFallback, _error: SEED_FALLBACK_ERROR, _fallbackTrigger: "rpc_error" };
//
// An empty result is not an error. That line printed "Data temporarily unavailable. Refresh to
// retry." on a page whose read had not failed, and it told the admin platform-flags queue
// `Trigger: rpc_error` about events that were not RPC errors. Both halves are visible live:
// integrity_flags carries rows at 2026-09-08T09:36:35Z and 2026-09-08T16:18:47Z with
// subject_ref "/", created_by "seed-fallback-trigger" and description "Seed-fallback activated on
// /. Trigger: rpc_error.", the operator's banner, and the reason the two dashboard cards were
// blank, in the same row.
//
// WHY NO TEST CAUGHT IT. `fallback-guard.npmtest.mjs` proves such a payload is not CACHED (lane
// rsc503). Nothing proved what it SAYS. These tests are that half: the two states must differ, and
// only the failure may claim a failure.
//
// Structural, over the real source: `fetchDashboardData` needs a live Supabase to execute, and this
// repo's npmtest lane runs without credentials by design (rule 15: a no-cred run must be
// diagnosable, never a false red). The assertions below therefore read the decision itself out of
// the module text, which is exactly where the defect lived.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..");
const SERVER = readFileSync(resolve(ROOT, "src/lib/supabase-server.ts"), "utf8");
const DATA = readFileSync(resolve(ROOT, "src/lib/data.ts"), "utf8");

const DASHBOARD = SERVER.slice(
  SERVER.indexOf("export async function fetchDashboardData"),
  SERVER.indexOf("// ── Slim Fetch Variants"),
);

test("an empty result no longer routes to the failure payload", () => {
  assert.ok(
    !/if \(!resources\.length\) \{\s*return \{ \.\.\.emptyFallback/.test(DASHBOARD),
    'the "!resources.length means broken" inference is the defect and must not return',
  );
});

test("only a genuinely failed read claims a failure", () => {
  assert.match(
    DASHBOARD,
    /if \(resourcesReadFailed\) \{\s*\n\s*return \{ \.\.\.emptyFallback, _error: SEED_FALLBACK_ERROR, _fallbackTrigger: "rpc_error" \};/,
    "the failure payload must be gated on the read having actually failed",
  );
});

test("the two states are distinguishable at the seam that produces them", () => {
  const fetcher = SERVER.slice(
    SERVER.indexOf("async function fetchWorkspaceResources"),
    SERVER.indexOf("export const DUE_NEXT_READ_LIMIT"),
  );
  assert.match(fetcher, /failed: boolean;/, "the reader must report WHICH of the two happened");
  assert.match(
    fetcher,
    /return \{ active: \[\], archived: \[\], uuidToUiId: new Map\(\), failed: Boolean\(error\) \}/,
    "failed is true only when the RPC returned an error, never merely because the result was empty",
  );
  assert.match(fetcher, /failed: false \}/, "and false on the success path");
});

test("a successful empty read returns the real payload, with no _error and no trigger", () => {
  // The only `_error`-bearing returns left in fetchDashboardData are the four legitimate ones:
  // unconfigured, no org, the failed read, and the catch. None of them is reachable from a
  // successful-but-empty read.
  const errorReturns = [...DASHBOARD.matchAll(/_fallbackTrigger: ("[a-zA-Z_]+"|isReadTimeout)/g)].map((m) => m[1]);
  assert.deepEqual(
    errorReturns,
    ['"supabase_not_configured"', '"null_orgId"', '"rpc_error"', "isReadTimeout"],
    "exactly four failure exits, each naming a real failure; an honest empty is not among them",
  );
});

test("no code path invents an audit date", () => {
  // Both halves of the same fabrication. fetchDashboardData used to seed auditDate with TODAY and
  // then raise it by any changelog entry later than today, which no entry can be, so the card
  // asserted "Detection pass <today>" every day regardless of what ran. data.ts's failure factory
  // did the same with a constant baked into the bundle.
  assert.ok(
    !/let auditDate = new Date\(\)\.toISOString\(\)/.test(DASHBOARD),
    "auditDate must not be seeded with today",
  );
  assert.ok(
    !/import \{ AUDIT_DATE \}/.test(DATA),
    "and the failure factory no longer imports a baked-in date",
  );
  assert.match(DATA, /auditDate: "",/, 'a hard failure renders "No detection pass on record", which is true');
});

// Lane CHANGEDATA (2026-09-09), defect C: the ORDER those two evidence sources are consulted in
// matters as much as their presence. `item_changelog` is a stale, unrelated table (9 rows, all
// frozen at one date, live-measured 2026-09-09) and consulting it BEFORE the rows the card
// actually renders (`recentChanges`) means the header can never reflect what is on screen. See
// computeAuditDate's own tests (brief-rows.npmtest.mjs) for the full behavioural proof; this test
// only proves fetchDashboardData delegates to that one function rather than re-deriving its own
// (possibly differently-ordered) copy.
test("the header's audit date is computed by the SAME function the rows go through", () => {
  assert.match(
    SERVER,
    /import \{ computeAuditDate \} from "@\/lib\/dashboard\/brief-rows"/,
    "fetchDashboardData must not carry a private re-derivation of this precedence",
  );
  assert.match(
    DASHBOARD,
    /const auditDate = computeAuditDate\(recentChanges, changelogDates\)/,
    "recentChanges (the rows this card renders) must be the argument order's PRIMARY evidence",
  );
});
