// /api/admin/sources/pause-global — the global scrape-SCHEDULE control (admin-only).
//
// POST body (either/both keys):
//   - { cadence: 'off'|'weekly'|'monthly', start_date?: 'YYYY-MM-DD' }  -> set the global scrape schedule
//   - { paused: boolean }                                              -> set the independent EMERGENCY STOP
// GET -> the current schedule + emergency state + computed next-scrape date.
//
// The global scrape schedule on the system_state singleton is the SINGLE source of truth for WHEN the
// whole system scrapes (per-source update_frequency cadence retired). cadence='off' = nothing scrapes
// (the hold). global_processing_paused is the independent emergency stop — it hard-halts without erasing
// the saved cadence/start_date (so a panic-stop preserves the plan). isGloballyPaused() = off OR emergency.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { isPlatformAdmin } from "@/lib/auth/admin";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { nextScrapeDate, type ScrapeCadence } from "@/lib/sources/scrape-schedule";

const CADENCES: ScrapeCadence[] = ["off", "weekly", "monthly"];
const YMD = /^\d{4}-\d{2}-\d{2}$/;

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function stateResponse(
  data: { scrape_cadence?: string | null; scrape_start_date?: string | null; global_processing_paused?: boolean | null; updated_at?: string | null } | null,
  extra: Record<string, unknown> = {}
) {
  const cadence = (data?.scrape_cadence as ScrapeCadence) ?? "off";
  const startDate = (data?.scrape_start_date as string | null) ?? null;
  const next = nextScrapeDate({ cadence, startDate }, new Date());
  return {
    ...extra,
    paused: !!data?.global_processing_paused,
    cadence,
    start_date: startDate,
    next_scrape: next ? next.toISOString().slice(0, 10) : null,
    updated_at: data?.updated_at ?? null,
  };
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  let body: { paused?: boolean; cadence?: string; start_date?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const hasPaused = typeof body.paused === "boolean";
  const hasCadence = typeof body.cadence === "string";
  if (!hasPaused && !hasCadence) {
    return NextResponse.json(
      { error: "provide `cadence` (off|weekly|monthly) and/or `paused` (boolean)" },
      { status: 400 }
    );
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (hasPaused) update.global_processing_paused = body.paused;

  if (hasCadence) {
    const cadence = body.cadence as ScrapeCadence;
    if (!CADENCES.includes(cadence)) {
      return NextResponse.json({ error: "cadence must be one of: off, weekly, monthly" }, { status: 400 });
    }
    update.scrape_cadence = cadence;
    if (cadence === "off") {
      // Preserve the saved anchor unless the caller explicitly clears it (so toggling off→on keeps the plan).
      if (body.start_date === null) update.scrape_start_date = null;
    } else {
      // weekly/monthly need an anchor. Use the provided start_date, else default to today (UTC).
      let start = typeof body.start_date === "string" ? body.start_date.slice(0, 10) : null;
      if (start && !YMD.test(start)) {
        return NextResponse.json({ error: "start_date must be YYYY-MM-DD" }, { status: 400 });
      }
      if (!start) start = new Date().toISOString().slice(0, 10);
      update.scrape_start_date = start;
    }
  }

  const supabase = getServiceClient();

  const admin = await isPlatformAdmin(auth.userId, supabase);
  if (!admin) {
    return NextResponse.json(
      { error: "Platform admin access required" },
      { status: 403, headers: rateLimitHeaders(auth.userId) }
    );
  }

  const { error } = await supabase.from("system_state").update(update).eq("id", true);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Read back so the client reflects the persisted truth + the freshly-computed next scrape.
  const { data } = await supabase
    .from("system_state")
    .select("scrape_cadence, scrape_start_date, global_processing_paused, updated_at")
    .eq("id", true)
    .maybeSingle();

  return NextResponse.json(stateResponse(data, { success: true }), { headers: rateLimitHeaders(auth.userId) });
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const supabase = getServiceClient();

  const admin = await isPlatformAdmin(auth.userId, supabase);
  if (!admin) {
    return NextResponse.json(
      { error: "Platform admin access required" },
      { status: 403, headers: rateLimitHeaders(auth.userId) }
    );
  }

  const { data, error } = await supabase
    .from("system_state")
    .select("scrape_cadence, scrape_start_date, global_processing_paused, updated_at")
    .eq("id", true)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(stateResponse(data), { headers: rateLimitHeaders(auth.userId) });
}
