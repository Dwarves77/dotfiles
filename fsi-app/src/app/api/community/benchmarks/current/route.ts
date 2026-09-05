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
//
// PUBLISH_AGGREGATE() WIRING (lane NOTICES, complete-system build plan, 2026-09-05). Migration 287
// shipped `publish_aggregate()` complete and self-tested but with "NOTHING TO GATE YET" (its own header,
// verbatim); migration 294 gave it a real, registered subject
// (`community_benchmark_responses.value_numeric`) and re-proved the gate live in its own post-check —
// but neither migration added a RUNTIME caller: this route, the one place a benchmark aggregate is ever
// served to a reader, computed and returned `aggregateBenchmarkResponses()`'s JS-only gate alone. Every
// instrument with at least one response (an all-zero pool has no real cohort worth a DB round trip or a
// log row) now also gets `publish_aggregate('community_benchmark_responses', 'value_numeric', ...)`
// consulted — member_ids only, no member_values (see benchmark.mjs's own header for why the DB's
// generic sum would be the wrong statistic for a rate/percentage field) — and its refusal, when one
// comes back, overrides the JS gate's own "publishable" (applyPublishAggregateGate,
// src/lib/community/benchmark.mjs): the DB gate's durable audit log and its freeze / tracker-attack /
// complementary-suppression defences are real protections the JS-only gate does not attempt (that
// module's own header). An RPC error is fail-soft — the JS gate's own k_min=5/max_share_pct=25/
// min_lag_days=90 floors (the SAME numbers migration 294 registered) still govern; a transient failure
// to reach the extra DB-side defences degrades to that floor, never to "publish anything."

import { NextRequest, NextResponse } from "next/server";
import {
  requireCommunityAuth,
  isCommunityAuthError,
} from "@/lib/api/community-auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { getServiceSupabase } from "@/lib/supabase-service";
import {
  scopeBenchmarksForReader,
  aggregateBenchmarkResponses,
  distinctOrganisationKeys,
  applyPublishAggregateGate,
} from "@/lib/community/index.mjs";

interface PublishAggregateResult {
  refused: boolean;
  reason: string | null;
}

/** Calls the DB gate for one instrument's current cohort. Never throws — an RPC error or a
 *  malformed/absent response yields `null` (this route's own header: fail-soft to the JS gate's floor). */
async function consultPublishAggregateGate(
  service: ReturnType<typeof getServiceSupabase>,
  memberIds: string[],
  periodEnd: string
): Promise<PublishAggregateResult | null> {
  if (memberIds.length === 0) return null;
  try {
    const { data, error } = await service.rpc("publish_aggregate", {
      p_table: "community_benchmark_responses",
      p_column: "value_numeric",
      p_cohort_filter: { member_ids: memberIds, period_end: periodEnd },
    });
    if (error || !data || typeof data !== "object") return null;
    const payload = data as Record<string, unknown>;
    return {
      refused: payload.refused === true,
      reason: typeof payload.reason === "string" ? payload.reason : null,
    };
  } catch {
    return null;
  }
}

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

      // publish_aggregate() gate (see this file's own header) — the real, audited, attack-resistant
      // second opinion on top of the JS-only gate above.
      const gateResult = await consultPublishAggregateGate(
        service,
        distinctOrganisationKeys(pool),
        instrument.period_end
      );
      return { instrument, aggregate: applyPublishAggregateGate(aggregate, gateResult) };
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
