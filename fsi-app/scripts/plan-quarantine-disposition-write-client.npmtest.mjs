// plan-quarantine-disposition-write-client.npmtest.mjs -- the ONE test that must reach
// plan-quarantine-disposition.mjs's real buildHarnessRunsClient() branch (no recordHarnessRunFn
// override), which dynamically imports "@supabase/supabase-js". Split out of
// plan-quarantine-disposition.test.mjs (lane QUARANTINE-DISPOSITION, 2026-09-28, coordinator-reported CI
// failure on PR #819, job 109066940557): that file is discovered by the no-npm discipline suite
// (run-test-suite.sh), whose resolver hook refuses any npm package import -- "Cannot find package
// '@supabase/supabase-js'" -- confirmed live. Every OTHER test in that file supplies a
// recordHarnessRunFn override, so none of them reach this import; this is the one that doesn't, by
// design (it exists to prove the guarded `sb` is never touched). Per lane-common-contract.md's own
// convention ("a test that needs jiti or an npm package is a *.npmtest.mjs instead"), it lives here,
// discovered by discipline.yml's *.npmtest.mjs glob with no other file to edit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPlanner } from "./plan-quarantine-disposition.mjs";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-09-28T00:00:00Z");
const iso = (ms) => new Date(NOW.getTime() + ms).toISOString();

function fakeDb({ items, flags, harnessRuns = [] }) {
  return async (table) => {
    if (table === "intelligence_items") return items;
    if (table === "integrity_flags") return flags;
    if (table === "harness_runs") return harnessRuns;
    throw new Error(`fakeDb: unexpected table ${table}`);
  };
}

// Regression: live run 36446625925 (2026-09-28) passed the READ-GUARDED `sb` (scripts/lib/db.mjs's
// readClient() proxy, whose .from(table).insert THROWS by design, rule 015) straight into
// recordHarnessRun, so the harness_runs insert threw every time and was swallowed silently (no
// recordHarnessRunFn override in real dispatches -- only tests supply one). This proves `sb` is NEVER
// touched for the insert when no override is given: a throwing `sb` must not be the thing that fails.
test("runPlanner (no recordHarnessRunFn override): never calls .insert on the guarded `sb` -- fails only on missing creds for the SEPARATE write client, never on sb.from(...).insert throwing", async (t) => {
  const familyDir = mkdtempSync(join(tmpdir(), "qd-plan-test-"));
  t.after(() => rmSync(familyDir, { recursive: true, force: true }));

  const items = [{ id: "a", legacy_id: "it-a", item_type: "regulation" }];
  const flags = [{ subject_ref: "a", created_at: iso(-20 * DAY), created_by: "trigger", status: "open" }];

  // Mimics scripts/lib/db.mjs's readClient() guard proxy: .from(table).insert throws synchronously.
  const guardedSb = {
    from() {
      return {
        insert() { throw new Error("db.mjs: write refused -- use a guarded function (rule 015)"); },
        select() { return this; }, eq() { return this; }, single() { return Promise.resolve({ data: null }); },
      };
    },
  };

  const savedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  t.after(() => {
    if (savedUrl !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = savedUrl;
    if (savedKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey;
  });

  const r = await runPlanner(
    { mode: "dry", out: null, dispatchApplyDeferrals: false },
    { sb: guardedSb, readAllFn: fakeDb({ items, flags }), log: () => {}, now: NOW, familyDir }
    // no recordHarnessRunFn override -- exercises the real buildHarnessRunsClient() branch.
  );

  assert.equal(r.harnessRunRow.ok, false);
  assert.match(r.harnessRunRow.error, /NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY/, "must fail on missing credentials for the dedicated write client, never on guardedSb.from(...).insert throwing (rule 015)");
  assert.doesNotMatch(r.harnessRunRow.error, /write refused|rule 015/, "guardedSb's own throw text must never appear -- proves guardedSb.insert was never called");
});
