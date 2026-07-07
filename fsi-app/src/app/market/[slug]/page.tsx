/**
 * Market signal detail (`/market/[slug]`) — server component.
 *
 * Mirrors `/regulations/[slug]/page.tsx` adapted for Market Intel signals.
 * Loads the intelligence_items row via fetchIntelligenceItem (resolves by
 * legacy_id or UUID), handles UUID→slug redirect, and renders
 * MarketSignalDetailSurface.
 *
 * Related signals (same signal-band) are sourced from the workspace-wide
 * Market Intel set via getMarketIntelItems, with the current item excluded.
 * The same band-assignment + severity-derivation helpers used in
 * MarketPage.tsx are re-implemented here (MarketPage's helpers are not
 * exported) — when migration 102 populates `signal_band` and `severity`
 * on the items themselves, both surfaces flow through the same column
 * reads and the regex fallback retires.
 */

import { createClient } from "@supabase/supabase-js";
import { notFound, redirect } from "next/navigation";
import { fetchIntelligenceItem, fetchIntelligenceItemSections } from "@/lib/supabase-server";
import { getMarketIntelItems } from "@/lib/data";
import {
  MarketSignalDetailSurface,
  type PriceStat,
} from "@/components/pages/MarketSignalDetailSurface";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MarketSignalDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const t0 = Date.now();
  const { slug } = await params;
  const id = decodeURIComponent(slug);

  // UUID → slug redirect (mirrors /regulations/[slug] pattern). When the
  // URL is a raw UUID AND the matching row has a legacy_id, redirect (307)
  // to the human-readable slug URL. RLS doesn't grant anon access to base
  // intelligence_items SELECTs, so this uses the service-role key.
  let redirectTo: string | null = null;
  if (
    UUID_RE.test(id) &&
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  ) {
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } }
      );
      const { data: byId } = await supabase
        .from("intelligence_items")
        .select("legacy_id")
        .eq("id", id)
        .maybeSingle();
      if (byId?.legacy_id) {
        redirectTo = `/market/${encodeURIComponent(byId.legacy_id)}`;
      }
    } catch {
      // Soft-fail; fetchIntelligenceItem still tries by uuid.
    }
  }
  if (redirectTo) redirect(redirectTo);

  const detail = await fetchIntelligenceItem(id);
  if (!detail) {
    notFound();
  }

  const { resource: r } = detail;

  // Sprint 4: fetch section rows for section-aware display. Mirrors the
  // pattern in research/[slug]/page.tsx. fetchIntelligenceItemSections
  // handles UUID resolution and provenance gating internally. Returns []
  // on any error or when no sections have been generated yet.
  const sections = await fetchIntelligenceItemSections(id);

  // Sprint 4: fetch real source-growth convergence fields (independent_citers,
  // confirmation_count) from the item's source row. These are migration 054
  // columns written by aggregateConvergence / compoundSourceCredibility.
  // Fetched here so the surface receives real values and never proxies from
  // sources_used.length or any other derived count.
  // Soft-fail: convergence is null when the source row is absent or has no
  // convergence data, in which case the surface omits the corroboration note.
  let convergence: { independent_citers: number; confirmation_count: number } | null = null;
  if (
    r.sourceId &&
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  ) {
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } }
      );
      const { data: srcRow } = await supabase
        .from("sources")
        .select("independent_citers, confirmation_count")
        .eq("id", r.sourceId)
        .maybeSingle();
      if (
        srcRow &&
        typeof srcRow.independent_citers === "number" &&
        srcRow.independent_citers > 0
      ) {
        convergence = {
          independent_citers: srcRow.independent_citers,
          confirmation_count: srcRow.confirmation_count ?? srcRow.independent_citers,
        };
      }
    } catch {
      // Soft-fail — surface omits corroboration note.
    }
  }

  // Redesign T05: hero price board. Published price statistics (migration 151)
  // for this signal — the KNOWN NEW BACKEND live-feed store (HANDOFF §7). Fetched
  // fail-soft: the table is empty until the feed writer populates it, in which
  // case the surface renders the honest §4 published-statistics pending frame
  // (never faked ticks). Service-role read, mirroring the convergence fetch.
  let priceBoard: PriceStat[] = [];
  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  ) {
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } }
      );
      const { data: priceRows } = await supabase
        .from("published_price_statistics")
        .select(
          "label, value_display, unit, context_line, severity_tone, source_tier, released_at, next_release_at, next_release_label, sort_order"
        )
        .eq("item_id", r.id)
        .order("sort_order", { ascending: true });
      if (Array.isArray(priceRows)) {
        priceBoard = priceRows.map((p) => ({
          label: p.label,
          valueDisplay: p.value_display,
          unit: p.unit,
          contextLine: p.context_line,
          severityTone: p.severity_tone,
          sourceTier: p.source_tier,
          releasedAt: p.released_at,
          nextReleaseAt: p.next_release_at,
          nextReleaseLabel: p.next_release_label,
        }));
      }
    } catch {
      // Soft-fail (table not yet applied, or no rows) — honest pending frame.
    }
  }

  // Related signals: pull the Market Intel set, find items in the same
  // band as this one, exclude self, cap at 5. Failures degrade to an
  // empty list (the surface renders "no related signals" cleanly).
  const marketIntel = await getMarketIntelItems().catch(() => ({
    resources: [],
    total: 0,
  }));

  // Redesign T05: the hero (breadcrumb + title + deck + actions + tabs) now
  // lives inside MarketSignalDetailSurface per the approved mock (Pages - 05
  // Signal Detail), mirroring the T03 detail archetype. Compute the breadcrumb
  // middle segment ("B1 · Price signals · United States") and the deck sub-line
  // server-side from real fields. The prior EditorialMasthead + separate
  // back-link are replaced by the in-hero breadcrumb (DESIGN-DEVIATIONS D3/T05).
  const publisher = r.sourceName || r.enforcementBody || null;
  const published = r.added ? `published ${formatDate(r.added)}` : null;
  const deck = [publisher, published].filter(Boolean).join(" · ") || undefined;

  console.log(`[perf] /market/${id} data ${Date.now() - t0}ms`);

  return (
    <MarketSignalDetailSurface
      resource={r}
      relatedPool={marketIntel.resources}
      sections={sections}
      convergence={convergence}
      priceBoard={priceBoard}
      deck={deck}
    />
  );
}

function formatDate(d: string): string {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
