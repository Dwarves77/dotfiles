// GET /api/community/benchmarks/current?sector_profile=cold-chain,pharma&region=EU
//
// The aggregate-only route (spec 05 §1, §3, §5 components 3, 4). Lists the house-seeded benchmark
// instruments scoped to the caller's portfolio (src/lib/community/benchmark.mjs
// scopeBenchmarksForReader) and, for each, the current published aggregate — computed the SAME way
// scripts/community/seed-benchmark-instruments.mjs computes it (src/lib/community/benchmark.mjs
// aggregateBenchmarkResponses), so a reader and the house seeder never disagree about whether a given
// instrument has cleared the antitrust gates.
//
// Individual responses are NEVER returned or readable via this route — only the computed aggregate
// (value, or null with a `reason` while the pool has not yet cleared k-anonymity / the dominance cap /
// the three-month lag). This is also this system's `aggregateRoute` destination — the route
// evaluateAntitrustGuard() (POST /api/community/posts) points a refused, commercially-sensitive
// individual disclosure toward.
//
// Auth: cookie session (read-only; no antitrust-sensitive write happens on this route — submitting a
// response is a separate, not-yet-built write path this lane's interface contract does not name).
// Rate limit: standard 60/min/user.

import { NextRequest, NextResponse } from "next/server";
import {
  requireCommunityAuth,
  isCommunityAuthError,
} from "@/lib/api/community-auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { getServiceSupabase } from "@/lib/supabase-service";
import { scopeBenchmarksForReader, aggregateBenchmarkResponses } from "@/lib/community/index.mjs";

interface InstrumentRow {
  id: string;
  key: string;
  title: string;
  question: string;
  field_key: string;
  unit: string | null;
  sector_profile: string | null;
  region: string | null;
  calendar_cycle: string;
  opens_at: string;
  closes_at: string;
  period_end: string;
  status: string;
}

export async function GET(request: NextRequest) {
  const auth = await requireCommunityAuth(request);
  if (isCommunityAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const sectorProfile = (searchParams.get("sector_profile") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const region = searchParams.get("region");

  const { data: instruments, error: instrumentsErr } = await auth.supabase
    .from("community_benchmark_instruments")
    .select(
      "id, key, title, question, field_key, unit, sector_profile, region, calendar_cycle, opens_at, closes_at, period_end, status"
    )
    .order("closes_at", { ascending: false });
  if (instrumentsErr) {
    return NextResponse.json({ error: instrumentsErr.message }, { status: 500 });
  }

  const scoped = scopeBenchmarksForReader((instruments ?? []) as InstrumentRow[], {
    sectorProfile,
    region,
  }) as InstrumentRow[];

  const service = getServiceSupabase();
  const results = await Promise.all(
    scoped.map(async (instrument) => {
      const { data: responses, error: responsesErr } = await service
        .from("community_benchmark_responses")
        .select("organisation_key, value_numeric, submitted_at")
        .eq("instrument_id", instrument.id);
      if (responsesErr) {
        return {
          instrument,
          aggregate: {
            instrumentKey: instrument.key,
            publishable: false,
            distinctOrganisations: 0,
            minContributors: 5,
            maxShare: 0,
            ageDays: 0,
            value: null,
            responseCount: 0,
            reason: `could not compute: ${responsesErr.message}`,
          },
        };
      }
      const pool = (responses ?? []).map((r) => ({
        organisationKey: r.organisation_key as string,
        valueNumeric: r.value_numeric as number | null,
        submittedAt: r.submitted_at as string,
      }));
      const aggregate = aggregateBenchmarkResponses(
        { key: instrument.key, periodEnd: instrument.period_end },
        pool
      );
      return { instrument, aggregate };
    })
  );

  const benchmarks = results.map(({ instrument, aggregate }) => ({
    key: instrument.key,
    title: instrument.title,
    question: instrument.question,
    field_key: instrument.field_key,
    unit: instrument.unit,
    sector_profile: instrument.sector_profile,
    region: instrument.region,
    calendar_cycle: instrument.calendar_cycle,
    opens_at: instrument.opens_at,
    closes_at: instrument.closes_at,
    period_end: instrument.period_end,
    status: instrument.status,
    aggregate: {
      publishable: aggregate.publishable,
      value: aggregate.value,
      distinct_organisations: aggregate.distinctOrganisations,
      min_contributors: aggregate.minContributors,
      response_count: aggregate.responseCount,
      reason: aggregate.reason,
    },
  }));

  return NextResponse.json({ benchmarks }, { headers: rateLimitHeaders(auth.userId) });
}
