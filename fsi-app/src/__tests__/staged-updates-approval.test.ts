/**
 * Regression test for the staged_updates approval pipeline.
 *
 * W1.B — verifies that the post-fix handler in
 *   src/app/api/staged-updates/route.ts
 * upholds the materialization contract documented in
 *   docs/W1B-approval-handler-analysis.md.
 *
 * ─────────────────────────────────────────────────────────────────
 * INFRASTRUCTURE STATUS — TODO
 * ─────────────────────────────────────────────────────────────────
 * `fsi-app/package.json` (as of W1.B) installs no test runner — there
 * is no `vitest`, no `jest`, no `test` npm script. The repo's CLAUDE.md
 * references vitest in passing but no setup has been committed.
 *
 * To make this file executable:
 *   1. `npm i -D vitest @types/node`
 *   2. Add `"test": "vitest run"` to package.json scripts.
 *   3. Add `vitest.config.ts` configured with `environment: 'node'`.
 *   4. Provide a Supabase test instance (local supabase CLI or a
 *      dedicated branch) and set TEST_SUPABASE_URL / TEST_SUPABASE_SERVICE_ROLE_KEY
 *      in `.env.test.local`.
 *   5. Run migrations 001-034 against the test instance before each run
 *      (preferably as a `globalSetup` hook).
 *
 * The body of each test below is real, runnable code; it just imports
 * `vitest` which isn't installed yet. Until step 1 is done these tests
 * will fail at module-resolution time. That is intentional — it
 * surfaces the missing test infrastructure rather than hiding it
 * behind a fake "skip" annotation.
 * ─────────────────────────────────────────────────────────────────
 */

// @ts-expect-error — vitest is not yet installed; see TODO above.
import { describe, expect, test, beforeAll, afterEach } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.TEST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY =
  process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_BASE = process.env.TEST_API_BASE || "http://localhost:3000";
const AUTH_BEARER = process.env.TEST_AUTH_BEARER; // Supabase JWT for a test admin user

let supabase: SupabaseClient;

// Tracks rows we created so afterEach can tear them down.
const createdStagedUpdateIds: string[] = [];
const createdIntelItemIds: string[] = [];

beforeAll(() => {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error(
      "TEST_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY must be set; see file header."
    );
  }
  if (!AUTH_BEARER) {
    throw new Error(
      "TEST_AUTH_BEARER must be set to a Supabase JWT for an authenticated admin user."
    );
  }
  supabase = createClient(SUPABASE_URL, SERVICE_KEY);
});

afterEach(async () => {
  if (createdIntelItemIds.length > 0) {
    await supabase
      .from("intelligence_items")
      .delete()
      .in("id", createdIntelItemIds);
    createdIntelItemIds.length = 0;
  }
  if (createdStagedUpdateIds.length > 0) {
    await supabase
      .from("staged_updates")
      .delete()
      .in("id", createdStagedUpdateIds);
    createdStagedUpdateIds.length = 0;
  }
});

async function insertStagedUpdate(
  proposed: Record<string, unknown>
): Promise<string> {
  const legacyId = `w1b-test-${Math.random().toString(36).slice(2, 10)}`;
  const payload = { legacy_id: legacyId, ...proposed };
  const { data, error } = await supabase
    .from("staged_updates")
    .insert({
      update_type: "new_item",
      proposed_changes: payload,
      reason: "W1.B regression test fixture",
      confidence: "MEDIUM",
      status: "pending",
    })
    .select("id")
    .single();
  if (error || !data) throw error || new Error("insert failed");
  createdStagedUpdateIds.push(data.id);
  return data.id;
}

async function approve(stagedId: string): Promise<Response> {
  return fetch(`${API_BASE}/api/staged-updates`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${AUTH_BEARER}`,
    },
    body: JSON.stringify({ id: stagedId, action: "approve" }),
  });
}

describe("staged_updates approval pipeline (W1.B)", () => {
  test("approving a new_item staged_update creates an intelligence_items row", async () => {
    const stagedId = await insertStagedUpdate({
      title: "Test Regulation A",
      summary: "fixture",
      domain: 1,
      item_type: "regulation",
      source_url: "https://example.test/a",
      status: "monitoring",
      severity: "medium",
      priority: "MODERATE",
    });

    const res = await approve(stagedId);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.materialized_item_id).toBeTruthy();
    createdIntelItemIds.push(body.materialized_item_id);

    // Verify intel item exists.
    const { data: intel, error: intelErr } = await supabase
      .from("intelligence_items")
      .select("id, title")
      .eq("id", body.materialized_item_id)
      .single();
    expect(intelErr).toBeNull();
    expect(intel?.title).toBe("Test Regulation A");

    // Verify staged_updates row reflects success.
    const { data: staged } = await supabase
      .from("staged_updates")
      .select("status, materialized_at, materialized_item_id, materialization_error")
      .eq("id", stagedId)
      .single();
    expect(staged?.status).toBe("approved");
    expect(staged?.materialized_at).toBeTruthy();
    expect(staged?.materialized_item_id).toBe(body.materialized_item_id);
    expect(staged?.materialization_error).toBeNull();
  });

  test("approving a staged_update with malformed payload sets materialization_error and rolls back transaction", async () => {
    // Missing required `domain` (CHECK BETWEEN 1 AND 7) and an unknown column
    // `bogus_field`. The intel insert MUST fail.
    const stagedId = await insertStagedUpdate({
      title: "Malformed Fixture",
      bogus_field: "should not be a column",
      // domain intentionally omitted
      item_type: "regulation",
      source_url: "https://example.test/malformed",
    });

    const res = await approve(stagedId);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/Approved but failed to apply/i);
    expect(body.materialization_error).toBeTruthy();

    // No intel row created.
    const { count } = await supabase
      .from("intelligence_items")
      .select("*", { count: "exact", head: true })
      .eq("source_url", "https://example.test/malformed");
    expect(count).toBe(0);

    // Staged row reflects failure: status approved (intent durable) but
    // materialized_at NULL and materialization_error populated.
    const { data: staged } = await supabase
      .from("staged_updates")
      .select("status, materialized_at, materialized_item_id, materialization_error")
      .eq("id", stagedId)
      .single();
    expect(staged?.status).toBe("approved");
    expect(staged?.materialized_at).toBeNull();
    expect(staged?.materialized_item_id).toBeNull();
    expect(staged?.materialization_error).toBeTruthy();
  });

  test("approving the same staged_update twice is idempotent — second call returns the same intel item, no duplicate", async () => {
    const stagedId = await insertStagedUpdate({
      title: "Idempotency Fixture",
      domain: 2,
      item_type: "regulation",
      source_url: "https://example.test/idem",
      status: "monitoring",
      severity: "medium",
      priority: "MODERATE",
    });

    const first = await approve(stagedId);
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    const firstId = firstBody.materialized_item_id;
    expect(firstId).toBeTruthy();
    createdIntelItemIds.push(firstId);

    const second = await approve(stagedId);
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.idempotent).toBe(true);
    expect(secondBody.materialized_item_id).toBe(firstId);

    // Exactly one intel row exists.
    const { count } = await supabase
      .from("intelligence_items")
      .select("*", { count: "exact", head: true })
      .eq("source_url", "https://example.test/idem");
    expect(count).toBe(1);
  });
});
