// POST /api/community/benchmarks/[key]/respond
//
// Body: { value_numeric } — submit (or replace) the caller's own response to a house-seeded benchmark
// instrument (spec 05 §1, §3, required components 3, 4). THE MISSING WRITE PATH named in COMMUNITY-A's
// report: "no write path for community_benchmark_responses / organisation_key derivation".
//
// GUARD-ENFORCED, three independent refusals, checked in this order, before any row is written
// (src/lib/community/respond.mjs evaluateResponseSubmission — the pure decision this route composes):
//
//   1. Verification: the caller's community_member_profiles row must be verified=true AND already carry
//      an organisation_key (migration 293's CHECK guarantees these travel together — see that
//      migration's header, and POST /api/community/profile/verify, the only route that sets them). A
//      caller with no profile, or verified=false, is refused with a plain reason and a link to
//      /community/profile.
//   2. Open window: the instrument (looked up by `key`, the human-readable slug, e.g.
//      "saf-premium-air-2026-q3") must be currently open — BOTH src/lib/community/benchmark.mjs
//      isOpenForResponses (the calendar window) AND status = 'open' (the seeder's own bookkeeping
//      column) must agree; disagreement between the two refuses, it does not silently pick one.
//   3. Value bounds: value_numeric validated against src/lib/community/respond.mjs FIELD_BOUNDS for the
//      instrument's field_key (non-negative, sane per-unit ceiling — a fat-finger guard, not a
//      plausibility model).
//
// organisation_key is NEVER read from the request — it is read server-side from the caller's OWN
// already-verified profile row via the service-role client (community_member_profiles's REVOKE forbids
// the authenticated client from ever selecting organisation_key directly — migration 293). The write
// itself also goes through the service-role client, because community_benchmark_responses carries no
// authenticated INSERT policy at all (migration 294: "organisation_key must be server-derived...
// spoofable k-anonymity is worse than no k-anonymity check at all").
//
// Upserts on (instrument_id, organisation_key) — migration 294's own UNIQUE constraint — so a repeat
// submission from the same organisation (a second member at the same employer, or the same member
// resubmitting) REPLACES rather than duplicates. (The table's second UNIQUE constraint,
// (instrument_id, respondent_user_id), can never independently conflict here: organisation_key is
// deterministic per verified domain, so the same respondent_user_id always carries the same
// organisation_key for a given instrument — see organisation-key.mjs.)
//
// Response: { accepted: true, aggregate } where `aggregate` is the SAME k-anonymous computation
// GET /api/community/benchmarks/current returns (aggregateBenchmarkResponses, benchmark.mjs) —
// recomputed fresh after this write. NEVER echoes any organisation's individual value, including the
// caller's own — only the aggregate (a value once publishable, or null with a reason while the pool has
// not cleared k-anonymity/dominance/lag).
//
// Auth: cookie session. Rate limit: standard 60/min/user.

import { NextRequest, NextResponse } from "next/server";
import {
  requireCommunityAuth,
  isCommunityAuthError,
} from "@/lib/api/community-auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { getServiceSupabase } from "@/lib/supabase-service";
import {
  isOpenForResponses,
  aggregateBenchmarkResponses,
  evaluateResponseSubmission,
} from "@/lib/community/index.mjs";

interface InstrumentRow {
  id: string;
  key: string;
  field_key: string;
  status: string;
  opens_at: string;
  closes_at: string;
  period_end: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const auth = await requireCommunityAuth(request);
  if (isCommunityAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const { key } = await params;

  let body: { value_numeric?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const value =
    typeof body?.value_numeric === "number" ? body.value_numeric : Number(body?.value_numeric);

  const service = getServiceSupabase();

  const { data: instrument, error: instrumentErr } = await service
    .from("community_benchmark_instruments")
    .select("id, key, field_key, status, opens_at, closes_at, period_end")
    .eq("key", key)
    .maybeSingle();
  if (instrumentErr) {
    return NextResponse.json({ error: instrumentErr.message }, { status: 500 });
  }
  if (!instrument) {
    return NextResponse.json(
      { error: `No benchmark instrument named "${key}"` },
      { status: 404, headers: rateLimitHeaders(auth.userId) }
    );
  }
  const row = instrument as InstrumentRow;

  const { data: profile, error: profileErr } = await service
    .from("community_member_profiles")
    .select("verified, organisation_key")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 500 });
  }

  const organisationKeyResult = {
    organisationKey: profile?.verified && profile?.organisation_key ? (profile.organisation_key as string) : null,
    refused: !profile?.verified || !profile?.organisation_key,
    reason: !profile
      ? "no community profile yet — set up your profile and verify a corporate email first"
      : !profile.verified
        ? "verify a corporate email first"
        : !profile.organisation_key
          ? "no organisation_key on file — re-verify"
          : null,
  };

  const decision = evaluateResponseSubmission({
    organisationKeyResult,
    instrumentOpen:
      row.status === "open" &&
      isOpenForResponses({ opensAt: row.opens_at, closesAt: row.closes_at }),
    instrumentStatus: row.status,
    value,
    fieldKey: row.field_key,
  });

  if (!decision.accepted) {
    return NextResponse.json(
      { error: decision.reason, verify_url: "/community/profile" },
      { status: 403, headers: rateLimitHeaders(auth.userId) }
    );
  }

  const { error: upsertErr } = await service.from("community_benchmark_responses").upsert(
    {
      instrument_id: row.id,
      respondent_user_id: auth.userId,
      organisation_key: organisationKeyResult.organisationKey,
      value_numeric: value,
      submitted_at: new Date().toISOString(),
    },
    { onConflict: "instrument_id,organisation_key" }
  );
  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  const { data: responses, error: responsesErr } = await service
    .from("community_benchmark_responses")
    .select("organisation_key, value_numeric, submitted_at")
    .eq("instrument_id", row.id);
  if (responsesErr) {
    return NextResponse.json({ error: responsesErr.message }, { status: 500 });
  }
  const pool = (responses ?? []).map((r) => ({
    organisationKey: r.organisation_key as string,
    valueNumeric: r.value_numeric as number | null,
    submittedAt: r.submitted_at as string,
  }));
  const aggregate = aggregateBenchmarkResponses({ key: row.key, periodEnd: row.period_end }, pool);

  return NextResponse.json(
    {
      accepted: true,
      aggregate: {
        publishable: aggregate.publishable,
        value: aggregate.value,
        distinct_organisations: aggregate.distinctOrganisations,
        min_contributors: aggregate.minContributors,
        response_count: aggregate.responseCount,
        reason: aggregate.reason,
      },
    },
    { status: 201, headers: rateLimitHeaders(auth.userId) }
  );
}
