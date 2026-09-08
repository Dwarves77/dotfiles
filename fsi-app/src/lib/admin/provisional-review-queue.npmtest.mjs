// The invariant: the number on the badge and the number on the table it labels count the same rows.
//
// The production defect this would have caught (click-through audit 2026-09-08, /admin): the tab
// badge and the issues queue read 489 while the table header read "491 PENDING", with 491 Approve
// buttons in the DOM. `fetchProvisionalSources` selected status IN (pending_review, needs_more_data)
// and the header printed its own row count; the RPC behind the badge counted pending_review alone.
// Confirmed against the live database that day: 489 + 2 = 491.
//
// Both halves are checked here, because the defect lived in the SPACE between them: the app-side
// read and the SQL function have to name the same status set, and neither one alone can tell.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..", "..");
const ROOT = resolve(APP, "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": APP } });
const { PROVISIONAL_REVIEW_STATUSES, isAwaitingReview } = jiti("./provisional-review-queue.ts");

test("the queue's population is exactly the two statuses an operator still has to act on", () => {
  assert.deepEqual([...PROVISIONAL_REVIEW_STATUSES], ["pending_review", "needs_more_data"]);
  assert.equal(isAwaitingReview("pending_review"), true);
  assert.equal(isAwaitingReview("needs_more_data"), true);
  // A resolved row leaves the queue, so it must leave the count with it.
  assert.equal(isAwaitingReview("confirmed"), false);
  assert.equal(isAwaitingReview("promoted"), false);
  assert.equal(isAwaitingReview(null), false);
  assert.equal(isAwaitingReview(undefined), false);
});

test("the row fetcher selects the constant, not a hand-typed list", () => {
  const src = readFileSync(resolve(APP, "lib/supabase-server.ts"), "utf8");
  const fn = src.slice(src.indexOf("async function fetchProvisionalSources"));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  assert.ok(body.includes("PROVISIONAL_REVIEW_STATUSES"), "fetchProvisionalSources reads the constant");
  assert.ok(
    !/\.in\("status",\s*\[\s*"/.test(body),
    "a re-typed status literal here is how the two definitions drifted apart"
  );
});

test("the counting RPC counts the same two statuses as the queue it labels", () => {
  // The badge's figure comes from admin_attention_counts(). Migration 314 is its live definition;
  // this pins the count expression to the same population the constant above names.
  const sql = readFileSync(
    resolve(ROOT, "supabase/migrations/314_attention_counts_provisional_queue_population.sql"),
    "utf8"
  );
  // From the statement, not the header: the header quotes the OLD expression while explaining it.
  const expr = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION"));
  const clause = expr.slice(0, expr.indexOf("AS provisional_sources_pending"));
  for (const status of PROVISIONAL_REVIEW_STATUSES) {
    assert.ok(clause.includes(`'${status}'`), `the RPC counts ${status}`);
  }
  assert.ok(
    !/status\s*=\s*'pending_review'/.test(clause),
    "counting pending_review alone is the 489-vs-491 defect"
  );
});
