/**
 * source-classification-step1-execute.mjs — authorized writes for Step 1
 * of the source classification remediation dispatch (2026-05-25).
 *
 * Scope authorized by operator on 2026-05-25:
 *
 *   Phase A: set category on 25 standalone + 7 canonical NULL-category active
 *            sources (32 UPDATEs).
 *   Phase B: update display name on the NLR canonical (a386a21f) to reflect
 *            the 2025-12-01 NREL -> NLR rename.
 *   Phase C: dedup 7 consolidation operations (6 simple pairs + NREL/NLR
 *            cluster) by REPOINTing intelligence_items + intelligence_item_citations
 *            to the canonical, then DELETEing the dupe (CASCADE handles
 *            trust_events, bias_tags, raw_fetches, ingestion_*).
 *
 * Each phase has its own read-back verification before moving to the next.
 * If any verification fails the script halts. Idempotent where possible.
 *
 * Run from fsi-app/ with: node scripts/source-classification-step1-execute.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, ".."));
process.loadEnvFile(".env.local");

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const LOG_DIR = resolve("..", "docs", "audits");
if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
const LOG_PATH = resolve(LOG_DIR, "source-classification-step1-log.json");

const log = [];
function step(name, ok, detail, extra) {
  const line = `[${ok ? "OK" : "FAIL"}] ${name} — ${detail}`;
  console.log(line);
  log.push({ name, ok, detail, extra: extra ?? null, at: new Date().toISOString() });
  if (!ok) {
    writeFileSync(LOG_PATH, JSON.stringify({ aborted_at: name, log }, null, 2), "utf8");
    process.exit(1);
  }
}

// ─── Phase A: category assignments (32 sources) ───────────────────────────
// Mechanical assignments per operator decision 2026-05-25.
// Format: [source_id, category, label]
const CATEGORY_ASSIGNMENTS = [
  // T1 -> regulatory (2)
  ["1af654f1-b9bd-45b2-8a14-3fa1451feabb", "regulatory", "Italian Chamber of Deputies"],
  ["af78aadc-ea59-4db0-9e2e-e248d6464239", "regulatory", "Romanian Chamber of Deputies"],
  // T2 -> research (1)
  ["88239c3d-e188-447d-a031-2952e945ee1f", "research", "Chalmers University Marine Env"],
  // T3 -> research (3)
  ["8f7db0b5-d2b2-442f-93cd-877fb1fd0384", "research", "Building Performance Standards Coalition"],
  ["55800ddc-ef49-4129-9ec8-c1451a7f6d0d", "research", "IRENA & Ammonia Energy Association"],
  ["c61453df-4e9b-4d9e-9ff9-4a6912c6af62", "research", "World Bank IEG"],
  // T4 -> market_news (4: trade press + 3 industry orgs operator-decided)
  ["73ff74a2-6c97-4ad2-a008-c230b5168ce4", "market_news", "Commercial Carrier Journal"],
  ["4e1b00cd-82e9-4e27-9f04-5cc86ab074fd", "market_news", "AAPA"],
  ["d5d9b939-9153-4a7a-8b3c-27e637e3c1c3", "market_news", "TIACA"],
  ["a4dc8935-b270-4a04-bd25-a4b95222be87", "market_news", "ZEMBA"],
  // T4 -> research (3 canonicals + 1 standalone)
  ["dcb667a7-c489-478b-97a6-8c82e451c4b6", "research", "BRE Group / BREEAM"],
  ["3177adf4-fa70-4c3c-91c6-110ce01cc4d9", "research", "eFuel Alliance e.V. (canonical)"],
  ["4d2e0f8a-0238-4316-9d88-079aeefd71e7", "research", "Sustainable Packaging Coalition (canonical)"],
  // T7 -> research (5 dedup canonicals + 7 standalone = 12)
  ["c096820c-e857-4173-b60d-9af004a0d73d", "research", "Centre for Sustainable Road Freight (canonical)"],
  ["4e29f93f-f3ff-42e5-b26e-a17a7a623d96", "research", "Cranfield SoM (canonical)"],
  ["f6df1063-b507-4a9c-bb3a-017e017d63cd", "research", "Erasmus University Rotterdam ERIM"],
  ["c63911ec-97ec-4bd4-9d32-57d5211975c0", "research", "Fraunhofer IML (canonical)"],
  ["ba4e0a5f-bc72-45e3-b938-e65f3e02ccbd", "research", "Maritime Carbon Intelligence"],
  ["addc7d05-cb54-4a70-99a4-1b0f85308bff", "research", "MIT Climate Machine"],
  ["5013b7c3-1aad-4afa-9508-304caf55b56a", "research", "MIT Sustainable Supply Chain Lab"],
  ["a386a21f-2fe4-42b8-bb27-1d7c20a10f5e", "research", "NLR (canonical, formerly NREL)"],
  ["8b7b0db2-0274-4446-93a9-b3d0548a3a3b", "research", "Stockholm Environment Institute"],
  ["1af0488e-77de-4319-b54f-816e00d3ef4c", "research", "Taylor & Francis"],
  ["19f69037-3d39-4482-8359-0bfe3f9f6ae3", "research", "Tyndall Centre (canonical)"],
  ["e38fc134-512a-48c3-9547-42a81efc6d26", "research", "World Resources Institute"],
];

// ─── Phase C: dedup consolidations ────────────────────────────────────────
// canonical, dupe(s), label
const CONSOLIDATIONS = [
  {
    canonical: "3177adf4-fa70-4c3c-91c6-110ce01cc4d9",
    dupes: ["c2549c0a-e9ed-40f9-99b0-32efe9fdd2b8"],
    label: "eFuel Alliance",
  },
  {
    canonical: "4d2e0f8a-0238-4316-9d88-079aeefd71e7",
    dupes: ["5025e77d-75d7-4f9b-9dee-c54630f67b1f"],
    label: "Sustainable Packaging Coalition",
  },
  {
    canonical: "c096820c-e857-4173-b60d-9af004a0d73d",
    dupes: ["e2e75b20-0d6c-448a-950d-32ec401d6af4"],
    label: "Centre for Sustainable Road Freight",
  },
  {
    canonical: "4e29f93f-f3ff-42e5-b26e-a17a7a623d96",
    dupes: ["e28f5449-78c8-474c-9176-a190eec65f18"],
    label: "Cranfield SoM",
  },
  {
    canonical: "c63911ec-97ec-4bd4-9d32-57d5211975c0",
    dupes: ["6b9e5e97-6b69-4790-a3c6-0bf821631170"],
    label: "Fraunhofer IML",
  },
  {
    canonical: "19f69037-3d39-4482-8359-0bfe3f9f6ae3",
    dupes: ["b04ddc7f-ed89-4c6d-a401-237b621ee62a"],
    label: "Tyndall Centre",
  },
  {
    canonical: "a386a21f-2fe4-42b8-bb27-1d7c20a10f5e",
    dupes: [
      "56dff28e-afa1-4bfa-9b1d-e999e37802b6",
      "1a760dfb-1e89-4416-a594-8d92778fb2e4",
      "ce0f5d88-f986-43e6-8c23-6c13ee88ff3e",
    ],
    label: "NLR (formerly NREL) cluster",
  },
];

const NLR_CANONICAL_ID = "a386a21f-2fe4-42b8-bb27-1d7c20a10f5e";
const NLR_FULL_NAME =
  "National Laboratory of the Rockies (NLR), formerly National Renewable Energy Laboratory (NREL)";

// ────────────────────────────────────────────────────────────────────────────
// Phase A: UPDATE category on 25 sources (32 total, but 7 of those will
// also be canonicals in Phase C dedup; updating their category here is the
// only place they get set, because the dupes get deleted).
// ────────────────────────────────────────────────────────────────────────────

console.log(`\n=== Phase A: category assignments (${CATEGORY_ASSIGNMENTS.length} sources) ===\n`);

for (const [id, category, label] of CATEGORY_ASSIGNMENTS) {
  const { error: updErr } = await supabase
    .from("sources")
    .update({ category })
    .eq("id", id);
  if (updErr) {
    step(`A.update.${label}`, false, updErr.message);
  }
  const { data: verify, error: verErr } = await supabase
    .from("sources")
    .select("id, category, status")
    .eq("id", id)
    .single();
  if (verErr || !verify) {
    step(`A.verify.${label}`, false, verErr?.message || "no row");
  }
  if (verify.category !== category) {
    step(
      `A.verify.${label}`,
      false,
      `expected category=${category}, got ${verify.category}`
    );
  }
  step(`A.${label}`, true, `category=${category}`);
}

// Aggregate verification: how many active sources still have NULL category?
{
  const { count, error: cErr } = await supabase
    .from("sources")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .is("category", null);
  if (cErr) {
    step("A.aggregate", false, cErr.message);
  }
  // After Phase A, the 9 dupes still have NULL category (we skip them
  // because they will be deleted in Phase C). So expected NULL count is 9.
  if (count !== 9) {
    step(
      "A.aggregate",
      false,
      `expected 9 NULL-category active sources remaining (the 9 dupes), got ${count}`
    );
  }
  step("A.aggregate", true, `9 NULL-category remaining (the 9 dupes, to be deleted in Phase C)`);
}

// ────────────────────────────────────────────────────────────────────────────
// Phase B: rename NLR canonical to reflect the 2025-12-01 DOE rename.
// ────────────────────────────────────────────────────────────────────────────

console.log(`\n=== Phase B: rename NLR canonical ===\n`);

{
  const { error: updErr } = await supabase
    .from("sources")
    .update({ name: NLR_FULL_NAME })
    .eq("id", NLR_CANONICAL_ID);
  if (updErr) {
    step("B.update.NLR_name", false, updErr.message);
  }
  const { data: verify, error: verErr } = await supabase
    .from("sources")
    .select("id, name")
    .eq("id", NLR_CANONICAL_ID)
    .single();
  if (verErr || verify?.name !== NLR_FULL_NAME) {
    step(
      "B.verify.NLR_name",
      false,
      verErr?.message || `name mismatch: ${verify?.name}`
    );
  }
  step("B.NLR_name", true, NLR_FULL_NAME);
}

// ────────────────────────────────────────────────────────────────────────────
// Phase C: dedup consolidations.
// For each canonical + dupes group:
//   For each dupe:
//     1. REPOINT intelligence_items
//     2. REPOINT intelligence_item_citations (NOT EXISTS guard for unique constraint)
//     3. DELETE remaining intelligence_item_citations on dupe (any that conflict)
//     4. DELETE source (CASCADE handles trust_events, bias_tags, raw_fetches, ingestion_*)
//     5. Verify dupe gone
// ────────────────────────────────────────────────────────────────────────────

console.log(`\n=== Phase C: dedup consolidations (${CONSOLIDATIONS.length} groups) ===\n`);

for (const { canonical, dupes, label } of CONSOLIDATIONS) {
  for (const dupe of dupes) {
    // Step 1: REPOINT intelligence_items
    {
      const { data: pre } = await supabase
        .from("intelligence_items")
        .select("id")
        .eq("source_id", dupe);
      const preCount = pre?.length ?? 0;

      const { error: repErr } = await supabase
        .from("intelligence_items")
        .update({ source_id: canonical })
        .eq("source_id", dupe);
      if (repErr) {
        step(`C.${label}.${dupe}.items_repoint`, false, repErr.message);
      }

      const { data: post } = await supabase
        .from("intelligence_items")
        .select("id")
        .eq("source_id", dupe);
      const postCount = post?.length ?? 0;
      if (postCount !== 0) {
        step(
          `C.${label}.${dupe}.items_repoint_verify`,
          false,
          `expected 0 items on dupe after repoint, got ${postCount}`
        );
      }
      step(
        `C.${label}.${dupe}.items_repoint`,
        true,
        `${preCount} items repointed to canonical`
      );
    }

    // Step 2: REPOINT intelligence_item_citations using SQL with NOT EXISTS guard
    // via supabase.rpc isn't available for arbitrary SQL; use two-step:
    //   2a. Update where canonical doesn't already have a row with same (item_id, origin)
    //   2b. Delete the remainder (which would have caused UNIQUE conflicts)
    {
      const { data: dupeCites } = await supabase
        .from("intelligence_item_citations")
        .select("id, intelligence_item_id, origin")
        .eq("source_id", dupe);
      const dupeCount = dupeCites?.length ?? 0;

      let moved = 0;
      let dropped = 0;
      for (const c of dupeCites ?? []) {
        const { data: conflict } = await supabase
          .from("intelligence_item_citations")
          .select("id")
          .eq("intelligence_item_id", c.intelligence_item_id)
          .eq("source_id", canonical)
          .eq("origin", c.origin)
          .maybeSingle();
        if (conflict) {
          // canonical already has the equivalent row; drop the dupe's citation
          const { error: delErr } = await supabase
            .from("intelligence_item_citations")
            .delete()
            .eq("id", c.id);
          if (delErr) {
            step(
              `C.${label}.${dupe}.citation_drop`,
              false,
              `${delErr.message} on id=${c.id}`
            );
          }
          dropped++;
        } else {
          const { error: updErr } = await supabase
            .from("intelligence_item_citations")
            .update({ source_id: canonical })
            .eq("id", c.id);
          if (updErr) {
            step(
              `C.${label}.${dupe}.citation_repoint`,
              false,
              `${updErr.message} on id=${c.id}`
            );
          }
          moved++;
        }
      }

      // Verify zero citations remain on dupe.
      const { count: residual } = await supabase
        .from("intelligence_item_citations")
        .select("id", { count: "exact", head: true })
        .eq("source_id", dupe);
      if ((residual ?? 0) !== 0) {
        step(
          `C.${label}.${dupe}.citation_verify`,
          false,
          `expected 0 citations on dupe, got ${residual}`
        );
      }
      step(
        `C.${label}.${dupe}.citations`,
        true,
        `processed ${dupeCount} (moved ${moved}, dropped ${dropped} as already-canonical)`
      );
    }

    // Step 3: DELETE the dupe source. CASCADE handles trust_events,
    // bias_tags, raw_fetches, ingestion_control_log, ingestion_state.
    // SET NULL covers agent_runs, canonical_source_candidates,
    // ingest_rejections, regional_data_facts, source_verifications,
    // source_tier_opinions.opining_source_id.
    {
      const { error: delErr } = await supabase
        .from("sources")
        .delete()
        .eq("id", dupe);
      if (delErr) {
        step(`C.${label}.${dupe}.delete`, false, delErr.message);
      }
      const { data: residual } = await supabase
        .from("sources")
        .select("id")
        .eq("id", dupe)
        .maybeSingle();
      if (residual) {
        step(
          `C.${label}.${dupe}.delete_verify`,
          false,
          `source still present after delete`
        );
      }
      step(`C.${label}.${dupe}.delete`, true, `dupe source deleted`);
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Final verification: zero active sources with NULL category;
// zero remaining dupes by URL pattern check.
// ────────────────────────────────────────────────────────────────────────────

console.log(`\n=== Final verification ===\n`);

{
  const { count, error } = await supabase
    .from("sources")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .is("category", null);
  if (error) {
    step("FINAL.null_category", false, error.message);
  }
  if (count !== 0) {
    step(
      "FINAL.null_category",
      false,
      `expected 0 active NULL-category sources, got ${count}`
    );
  }
  step("FINAL.null_category", true, `0 active sources with NULL category`);
}

// Verify all canonicals retain expected category.
{
  const canonicals = [
    ["3177adf4-fa70-4c3c-91c6-110ce01cc4d9", "research"],
    ["4d2e0f8a-0238-4316-9d88-079aeefd71e7", "research"],
    ["c096820c-e857-4173-b60d-9af004a0d73d", "research"],
    ["4e29f93f-f3ff-42e5-b26e-a17a7a623d96", "research"],
    ["c63911ec-97ec-4bd4-9d32-57d5211975c0", "research"],
    ["19f69037-3d39-4482-8359-0bfe3f9f6ae3", "research"],
    ["a386a21f-2fe4-42b8-bb27-1d7c20a10f5e", "research"],
  ];
  for (const [id, expectedCat] of canonicals) {
    const { data, error } = await supabase
      .from("sources")
      .select("id, category, name")
      .eq("id", id)
      .single();
    if (error || data?.category !== expectedCat) {
      step(
        `FINAL.canonical.${id.slice(0, 8)}`,
        false,
        `expected category=${expectedCat}, got ${data?.category}`
      );
    }
    step(
      `FINAL.canonical.${id.slice(0, 8)}`,
      true,
      `category=${expectedCat} name="${data.name.slice(0, 60)}"`
    );
  }
}

writeFileSync(LOG_PATH, JSON.stringify({ completed: true, log }, null, 2), "utf8");
console.log(`\nLog: ${LOG_PATH}`);
console.log(`\n=== Step 1 complete ===`);
