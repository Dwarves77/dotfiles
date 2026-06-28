// Pause-state checks shared by every fetch-capable route. Phase 0.1 (2026-06-28) made the global
// hold MECHANICAL: EVERY outbound-fetch entry point — workers AND admin routes (check-sources,
// drain-first-fetch, spot-check, scan, bulk-import, fetch-now, discover, agent/run) — calls
// pausedResponse()/isGloballyPaused() at its fetch entry, so no fetch fires while the hold is set,
// regardless of queue or trigger. This SUPERSEDES the prior "manual admin actions bypass" carve-out:
// to fetch during a hold the operator lifts system_state.global_processing_paused.
//
// Graceful degradation: if migration 016 hasn't been applied yet, these helpers treat the system as
// unpaused (the safer default — pausing only when the data layer explicitly says so).

import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { ScrapeCadence, ScrapeSchedule } from "@/lib/sources/scrape-schedule";

export interface ScrapeState extends ScrapeSchedule {
  /** Independent emergency stop (system_state.global_processing_paused) — hard-halts regardless of cadence. */
  emergencyPaused: boolean;
}

/** Read the global scrape schedule + emergency-stop from the system_state singleton. On any read error
 *  this fails CLOSED to {off, unset, not-emergency} → isGloballyPaused() returns true (the safe default
 *  for a scrape gate: better to NOT scrape than to scrape uncontrolled). */
export async function getScrapeState(supabase: SupabaseClient): Promise<ScrapeState> {
  try {
    const { data, error } = await supabase
      .from("system_state")
      .select("scrape_cadence, scrape_start_date, global_processing_paused")
      .eq("id", true)
      .maybeSingle();
    if (error) return { cadence: "off", startDate: null, emergencyPaused: false };
    return {
      cadence: ((data?.scrape_cadence as ScrapeCadence) ?? "off"),
      startDate: (data?.scrape_start_date as string | null) ?? null,
      emergencyPaused: !!data?.global_processing_paused,
    };
  } catch {
    return { cadence: "off", startDate: null, emergencyPaused: false };
  }
}

// "Is scraping switched OFF right now?" = the global cadence is 'off' OR the emergency stop is set.
// This is the per-request FETCH gate that every fetch-capable route + the workers call. The AUTOMATED
// worker ADDITIONALLY checks scrapeWindowOpen() (scrape-schedule.ts) to fire only on a scheduled day
// (decision C); operator paths (fetch-now/scan) obey only this off-gate, so they work any day while on.
export async function isGloballyPaused(supabase: SupabaseClient): Promise<boolean> {
  const s = await getScrapeState(supabase);
  return s.cadence === "off" || s.emergencyPaused;
}

export async function isSourcePaused(
  supabase: SupabaseClient,
  sourceId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("sources")
      .select("processing_paused")
      .eq("id", sourceId)
      .maybeSingle();
    if (error) return false;
    return !!data?.processing_paused;
  } catch {
    return false;
  }
}

/**
 * Convenience: returns null if neither flag is set, or a string reason if paused.
 */
export async function pauseReason(
  supabase: SupabaseClient,
  sourceId?: string
): Promise<string | null> {
  if (await isGloballyPaused(supabase)) {
    return "All source processing is globally paused.";
  }
  if (sourceId && (await isSourcePaused(supabase, sourceId))) {
    return "This source is paused.";
  }
  return null;
}

/**
 * Fetch-entry global-pause guard (Phase 0.1). Returns a 503 NextResponse when global processing is
 * paused, else null. Call at the fetch entry of every fetch-capable route, AFTER auth:
 *   const paused = await pausedResponse(supabase); if (paused) return paused;
 */
export async function pausedResponse(supabase: SupabaseClient): Promise<NextResponse | null> {
  if (await isGloballyPaused(supabase)) {
    return NextResponse.json(
      { error: "global_processing_paused: outbound fetch holds are in effect; lift the hold to proceed", paused: true },
      { status: 503 }
    );
  }
  return null;
}
