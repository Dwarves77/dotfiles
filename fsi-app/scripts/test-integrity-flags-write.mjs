/**
 * test-integrity-flags-write.mjs — end-to-end smoke test for the
 * integrity_flags agent contract from migration 048.
 *
 * Exercises the contract documented in fsi-app/.claude/CLAUDE.md
 * "Integrity flags — agent contract":
 *
 *   1. Service-role INSERT one row per category (6 rows)
 *   2. SELECT them back
 *   3. UPDATE one row's status open → in_review → resolved
 *   4. Verify all category/subject_type CHECKs reject bad values
 *   5. DELETE the seeded test rows so the suite is idempotent
 *
 * USAGE
 *   1. Apply migration 048 first:
 *        supabase db push
 *      (or `psql -f supabase/migrations/048_integrity_flags_platform.sql`)
 *   2. Set env:
 *        export NEXT_PUBLIC_SUPABASE_URL="https://<project>.supabase.co"
 *        export SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
 *   3. Run:
 *        node scripts/test-integrity-flags-write.mjs
 *
 * EXIT CODES
 *   0 — all checks pass
 *   1 — a check failed; details in stderr
 *
 * THIS SCRIPT IS NOT RUN BY THE DISPATCH PR. It would fail without
 * migration 048 applied to a live Supabase project. The PR ships the
 * test as a tool the operator can run after applying the migration.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Missing env. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TEST_AGENT_ID = "test-integrity-flags-write-script";

const SEED_ROWS = [
  {
    category: "design_drift",
    subject_type: "surface",
    subject_ref: "/admin",
    description:
      "Preview shows tab pill style A; live surface ships tab pill style B. No dispatch directive resolves which is intended.",
    recommended_actions: [
      {
        action: "Adopt preview style A",
        rationale: "Matches the editorial direction in design_handoff_2026-04",
      },
      {
        action: "Keep live style B",
        rationale: "Consistent with the rest of the admin shell",
      },
    ],
  },
  {
    category: "data_quality",
    subject_type: "item",
    subject_ref: "test:legacy-id-placeholder",
    description:
      "Brief markdown contains 29 inline citations but sources_used is empty. Possible parse-output regression.",
    recommended_actions: [
      {
        action: "Re-link source_id and rebuild sources_used",
        rationale: "Patterns observed in wave2-cleanup-execute.mjs",
      },
    ],
  },
  {
    category: "source_issue",
    subject_type: "source",
    subject_ref: "test:source-name-placeholder",
    description:
      "Canonical source URL returns 404 across three consecutive monitor runs.",
    recommended_actions: [
      { action: "Mark source needs_more_data" },
      { action: "Find replacement canonical URL" },
    ],
  },
  {
    category: "coverage_gap",
    subject_type: "jurisdiction",
    subject_ref: "ZZ-TEST",
    description:
      "Coverage matrix shows zero items for this jurisdiction across all topics.",
    recommended_actions: [
      { action: "Bulk-add sources from intersections panel" },
    ],
  },
  {
    category: "data_integrity",
    subject_type: "system",
    subject_ref: "intelligence_items.related_items",
    description:
      "Cross-row invariant break: 12 rows reference related_items that no longer exist.",
    recommended_actions: [
      { action: "Run referential-integrity sweep and null-out broken refs" },
    ],
  },
  {
    category: "surface_concern",
    subject_type: "surface",
    subject_ref: "/dashboard",
    description:
      "Filter chip overflow on viewport widths 360-400px during agent test.",
    recommended_actions: [{ action: "Wrap chip row at md breakpoint" }],
  },
];

async function step(name, fn) {
  process.stdout.write(`▸ ${name} ... `);
  try {
    await fn();
    console.log("ok");
  } catch (e) {
    console.log("FAIL");
    console.error(`  ${e?.message || e}`);
    process.exit(1);
  }
}

async function main() {
  // Idempotency: clean up any stale rows from previous runs first.
  await step("cleanup prior test rows", async () => {
    const { error } = await supabase
      .from("integrity_flags")
      .delete()
      .eq("created_by", TEST_AGENT_ID);
    if (error) throw new Error(error.message);
  });

  // 1. Service-role INSERT one row per category.
  let insertedIds = [];
  await step("insert 6 rows (one per category)", async () => {
    const rows = SEED_ROWS.map((r) => ({ ...r, created_by: TEST_AGENT_ID }));
    const { data, error } = await supabase
      .from("integrity_flags")
      .insert(rows)
      .select("id, category");
    if (error) throw new Error(error.message);
    if (!data || data.length !== SEED_ROWS.length) {
      throw new Error(
        `Expected ${SEED_ROWS.length} rows back, got ${data?.length ?? 0}`
      );
    }
    insertedIds = data.map((r) => r.id);
  });

  // 2. SELECT them back; verify all categories present.
  await step("select inserted rows + verify categories", async () => {
    const { data, error } = await supabase
      .from("integrity_flags")
      .select("category")
      .eq("created_by", TEST_AGENT_ID);
    if (error) throw new Error(error.message);
    const got = new Set((data || []).map((r) => r.category));
    const want = new Set(SEED_ROWS.map((r) => r.category));
    for (const c of want) {
      if (!got.has(c)) throw new Error(`Missing category in select: ${c}`);
    }
  });

  // 3. UPDATE status open → in_review → resolved.
  const targetId = insertedIds[0];
  await step("status transition open → in_review", async () => {
    const { error } = await supabase
      .from("integrity_flags")
      .update({ status: "in_review" })
      .eq("id", targetId);
    if (error) throw new Error(error.message);
    const { data, error: rerr } = await supabase
      .from("integrity_flags")
      .select("status")
      .eq("id", targetId)
      .single();
    if (rerr) throw new Error(rerr.message);
    if (data.status !== "in_review") {
      throw new Error(`Expected status=in_review, got ${data.status}`);
    }
  });

  await step("status transition in_review → resolved", async () => {
    const { error } = await supabase
      .from("integrity_flags")
      .update({
        status: "resolved",
        resolved_at: new Date().toISOString(),
        resolved_by: "test-script-resolver",
        resolution_note: "Resolved by test-integrity-flags-write.mjs",
      })
      .eq("id", targetId);
    if (error) throw new Error(error.message);
    const { data, error: rerr } = await supabase
      .from("integrity_flags")
      .select("status, resolved_at, resolved_by, resolution_note")
      .eq("id", targetId)
      .single();
    if (rerr) throw new Error(rerr.message);
    if (data.status !== "resolved") {
      throw new Error(`Expected status=resolved, got ${data.status}`);
    }
    if (!data.resolved_at || !data.resolved_by) {
      throw new Error("Resolution columns not persisted");
    }
  });

  // 4. CHECK constraint enforcement — bad category should be rejected.
  await step("CHECK rejects invalid category", async () => {
    const { error } = await supabase.from("integrity_flags").insert({
      category: "not_a_real_category",
      subject_type: "system",
      subject_ref: "test",
      description: "should be rejected",
      created_by: TEST_AGENT_ID,
    });
    if (!error) {
      throw new Error(
        "Expected CHECK constraint failure, but insert succeeded"
      );
    }
  });

  await step("CHECK rejects invalid subject_type", async () => {
    const { error } = await supabase.from("integrity_flags").insert({
      category: "data_quality",
      subject_type: "not_a_real_type",
      subject_ref: "test",
      description: "should be rejected",
      created_by: TEST_AGENT_ID,
    });
    if (!error) {
      throw new Error(
        "Expected CHECK constraint failure, but insert succeeded"
      );
    }
  });

  await step("CHECK rejects invalid status", async () => {
    const { error } = await supabase
      .from("integrity_flags")
      .update({ status: "totally_made_up" })
      .eq("id", insertedIds[1]);
    if (!error) {
      throw new Error(
        "Expected CHECK constraint failure, but update succeeded"
      );
    }
  });

  // 5. Cleanup — make the script idempotent.
  await step("delete seeded test rows", async () => {
    const { error } = await supabase
      .from("integrity_flags")
      .delete()
      .eq("created_by", TEST_AGENT_ID);
    if (error) throw new Error(error.message);
  });

  console.log("\n✓ All integrity_flags contract checks passed.");
}

main().catch((e) => {
  console.error("Unexpected error:", e);
  process.exit(1);
});
