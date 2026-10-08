import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { resolveOrgIdFromCookies } from "@/lib/api/org";
import { getWorkspaceProfile } from "@/lib/workspace/profile";
import { readUpcoming, defaultJurisdictionFilter, resolveScope, scopeLabel } from "@/lib/forward-events/read-upcoming.mjs";
import { withErrorCapture } from "@/lib/telemetry/capture-error";
import { checkRateLimit, clientKey } from "@/lib/api/rate-limit";

// GET /api/obligations/upcoming — PERF-10 (2026-09-04, root-cause fix, ADR-026 Follow-up).
//
// WHY THIS EXISTS. UpcomingObligationsStrip.tsx (both variants — the list strip on /regulations and
// /market, and the detail rail card on regulations/[slug], the latter formerly via
// src/lib/detail/regulation-obligations.ts) called fetchUpcomingObligations DIRECTLY inside its own
// server render, via createSupabaseServerClient — a cookies() read that forced those pages `ƒ`
// (Dynamic) at build time, independent of the shared-layout cause this lane's layout.tsx commit
// removes. regulations/[slug]/page.tsx now mounts UpcomingObligationsStrip/ObligationRegister
// directly, both hitting this route and /api/obligations/register instead — src/lib/detail/
// regulation-obligations.ts, regulation-obligations-core.ts and regulation-obligations-core.test.mjs
// were DELETED this lane (F25 module-liveness flagged regulation-obligations.ts as having zero
// production importers the moment this route replaced its only call site; deleting the whole chain,
// its now-pointless "core" split, and its test together was the honest fix, not a reason-bearing
// allowlist entry for code with no remaining purpose).
//
// read-upcoming.mjs's own header is EXPLICIT and deliberate: "must always be called with the
// REQUEST-SCOPED client... Never call it with a service-role client from a customer-facing page —
// that would bypass RLS entirely." This lane respects that prohibition rather than reversing it (see
// this lane's REPORT for the write-set-boundary note on why UpcomingObligationsStrip.tsx/
// ObligationRegister.tsx were touched despite not being explicitly listed). The fix is NOT to bypass
// RLS — it is to move the SAME request-scoped, cookie-bound call from the PAGE's own server render
// into a ROUTE HANDLER's request handling. A Route Handler's own Dynamic-API dependency does NOT
// propagate to a page that merely fetch()s it client-side (the same mechanism this lane's
// /api/auth/identity and /api/workspace/bootstrap routes already exploit) — so this route can call
// cookies() freely (fully respecting read-upcoming.mjs's requirement) while the PAGE that now
// fetch()s it client-side carries no Dynamic API of its own.
//
// CONTRACT: GET with no `itemId` = list variant (top strip, jurisdiction-defaulted to the caller's
// workspace when signed in with an org — degrades to "no filter" when signed out/no-org, same as
// before). `?itemId=<uuid-or-legacy_id>` = detail variant (one item's own upcoming events, no
// mirror of UpcomingObligationsStrip's variant="detail" contract: kept, contract parity between an API route and its consuming component, not duplicated code.
// jurisdiction filter — mirrors UpcomingObligationsStrip's own variant="detail" contract exactly).
// `?limit=N` overrides the default (8 for list, 20 for detail). Public: no requireAuth — the
// underlying RLS policy (migration 274: public SELECT gated on is_archived) already governs what an
// anonymous caller sees, same as before this lane (the component rendered for signed-out visitors
// too). Cache-Control: private, no-store — this is a per-viewer-personalized read (workspace
// jurisdiction default), not the org-independent public listing (that lives in src/lib/data.ts,
// server-cached separately).

// SCOPED READ (lane MKT-1, operator ruling 2026-10-08, the Market policy timeline). `?scope=1` asks for the
// list variant narrowed to an ACTIVE SCOPE: `modes` and `regions` (comma separated) when the caller sends
// them (the Market ledger's URL facets), else the workspace profile's transport modes and jurisdictions.
// The response then also carries `scope` (the resolved modes, regions, their source and the visible label)
// and `hiddenByScope` (events in the same upcoming window the scope removed). `?scope=all` is the widen
// control: no mode and no jurisdiction filter at all. No `scope` parameter at all is the pre-existing read,
// byte for byte (Regulations mounts that form).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handleGET(request: NextRequest) {
  const limited = checkRateLimit(clientKey(request));
  if (limited) return limited;
  const { searchParams } = new URL(request.url);
  const itemIdParam = searchParams.get("itemId");
  const limitParam = searchParams.get("limit");
  const limit = limitParam && Number.isFinite(Number(limitParam)) ? Number(limitParam) : undefined;
  const variant: "list" | "detail" = itemIdParam ? "detail" : "list";
  const scopeParam = variant === "list" ? searchParams.get("scope") : null;
  const scoped = scopeParam === "1";
  const widened = scopeParam === "all";

  try {
    const supabase = await createSupabaseServerClient();

    let resolvedItemId: string | null = itemIdParam;
    if (variant === "detail" && itemIdParam && !UUID_RE.test(itemIdParam)) {
      try {
        const { data } = await supabase.from("intelligence_items").select("id").eq("legacy_id", itemIdParam).maybeSingle();
        resolvedItemId = data?.id ?? null;
      } catch {
        resolvedItemId = null;
      }
    }
    if (variant === "detail" && !resolvedItemId) {
      return NextResponse.json({ events: [], hasJurisdictionFilter: false }, { headers: { "Cache-Control": "private, no-store" } });
    }

    let jurisdictionFilter: string[] | null = null;
    let modeFilter: string[] | null = null;
    let resolvedScope: ReturnType<typeof resolveScope> | null = null;
    if (variant === "list" && !widened) {
      try {
        const orgId = await resolveOrgIdFromCookies();
        const profile = await getWorkspaceProfile(supabase, orgId);
        if (scoped) {
          resolvedScope = resolveScope({
            facetModes: searchParams.get("modes"),
            facetRegions: searchParams.get("regions"),
            profileModes: profile.transportModes,
            profileJurisdictions: profile.jurisdictions,
          });
          jurisdictionFilter = resolvedScope.regions;
          modeFilter = resolvedScope.modes;
        } else {
          jurisdictionFilter = defaultJurisdictionFilter(profile.jurisdictions);
        }
      } catch {
        // soft-fail to "no filter", the same posture the component took. A scoped read whose profile could
        // not be read still honours the facets it was handed.
        jurisdictionFilter = null;
        if (scoped) {
          resolvedScope = resolveScope({ facetModes: searchParams.get("modes"), facetRegions: searchParams.get("regions") });
          jurisdictionFilter = resolvedScope.regions;
          modeFilter = resolvedScope.modes;
        }
      }
    }

    const { events, hiddenByScope } = await readUpcoming(supabase, {
      itemId: variant === "detail" ? (resolvedItemId ?? undefined) : undefined,
      limit: limit ?? (variant === "detail" ? 20 : 8),
      jurisdictionFilter,
      modeFilter,
      countHidden: scoped,
    });

    const body: Record<string, unknown> = { events, hasJurisdictionFilter: !!jurisdictionFilter };
    if (scoped && resolvedScope) {
      body.scope = { modes: resolvedScope.modes, regions: resolvedScope.regions, source: resolvedScope.source, label: scopeLabel(resolvedScope) };
      body.hiddenByScope = hiddenByScope ?? 0;
    }
    return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("[api/obligations/upcoming] failed, returning empty:", e);
    return NextResponse.json(
      { events: [], hasJurisdictionFilter: false },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }
}

export const GET = withErrorCapture("/api/obligations/upcoming", handleGET);
