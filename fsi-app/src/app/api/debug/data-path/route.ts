import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Diagnostic endpoint — shows where data is coming from
// DELETE THIS FILE after debugging is complete
export async function GET(request: NextRequest) {
  const results: Record<string, unknown> = {};

  // 1. Check env vars
  results.envVars = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? "SET" : "MISSING",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "SET (length: " + process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length + ")" : "MISSING",
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? "SET" : "MISSING",
  };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    results.conclusion = "SUPABASE NOT CONFIGURED — app is using static seed data";
    return NextResponse.json(results);
  }

  const supabase = createClient(url, anonKey);

  // 2. Test direct resources table query (anon key)
  try {
    const { data: rows, error } = await supabase
      .from("resources")
      .select("id, what_is_it, note")
      .eq("id", "o1")
      .single();

    if (error) {
      results.resourcesTable = { error: error.message, code: error.code };
    } else {
      results.resourcesTable = {
        id: rows.id,
        what_is_it_starts: rows.what_is_it?.substring(0, 80),
        note_starts: rows.note?.substring(0, 80),
      };
    }
  } catch (e: any) {
    results.resourcesTable = { error: e.message };
  }

  // 3. Test intelligence_items table query (anon key)
  try {
    const { data: rows, error } = await supabase
      .from("intelligence_items")
      .select("legacy_id, what_is_it, summary")
      .eq("legacy_id", "o1")
      .single();

    if (error) {
      results.intelligenceItemsTable = { error: error.message, code: error.code };
    } else {
      results.intelligenceItemsTable = {
        legacy_id: rows.legacy_id,
        what_is_it_starts: rows.what_is_it?.substring(0, 80),
        summary_starts: rows.summary?.substring(0, 80),
      };
    }
  } catch (e: any) {
    results.intelligenceItemsTable = { error: e.message };
  }

  // 4. Test RPC function (anon key)
  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc(
      "get_workspace_intelligence",
      { p_org_id: "a0000000-0000-0000-0000-000000000001" }
    );

    if (rpcErr) {
      results.rpcFunction = { error: rpcErr.message, code: rpcErr.code };
    } else {
      const o1 = rpcData?.find((r: any) => r.legacy_id === "o1");
      results.rpcFunction = {
        totalRows: rpcData?.length || 0,
        o1_found: !!o1,
        o1_what_is_it_starts: o1?.what_is_it?.substring(0, 80),
        o1_summary_starts: o1?.summary?.substring(0, 80),
      };
    }
  } catch (e: any) {
    results.rpcFunction = { error: e.message };
  }

  // 5. Check what fetchDashboardData would return
  try {
    const { fetchDashboardData } = await import("@/lib/supabase-server");
    const dashData = await fetchDashboardData();
    const o1 = dashData.resources.find((r) => r.id === "o1");
    results.fetchDashboardData = {
      totalResources: dashData.resources.length,
      o1_found: !!o1,
      o1_note_starts: o1?.note?.substring(0, 80),
      o1_whatIsIt_starts: o1?.whatIsIt?.substring(0, 80),
      o1_whyMatters_starts: o1?.whyMatters?.substring(0, 80),
    };
  } catch (e: any) {
    results.fetchDashboardData = { error: e.message };
  }

  // 6. Check seed data for comparison
  try {
    const seedModule = await import("@/data");
    const seedO1 = seedModule.resources.find((r: any) => r.id === "o1");
    results.seedData = {
      totalSeedResources: seedModule.resources.length,
      o1_note_starts: seedO1?.note?.substring(0, 80),
      o1_whatIsIt_starts: seedO1?.whatIsIt?.substring(0, 80),
    };
  } catch (e: any) {
    results.seedData = { error: e.message };
  }

  // Conclusion
  const dashO1 = (results.fetchDashboardData as any)?.o1_whatIsIt_starts || "";
  const seedO1 = (results.seedData as any)?.o1_whatIsIt_starts || "";
  if (dashO1 === seedO1) {
    results.conclusion = "DATA IS FROM SEED — Supabase data not reaching the UI";
  } else {
    results.conclusion = "DATA IS FROM SUPABASE — check browser cache if UI shows old content";
  }

  return NextResponse.json(results, { headers: { "Cache-Control": "no-store" } });
}
