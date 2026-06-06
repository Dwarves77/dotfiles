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

import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { notFound, redirect } from "next/navigation";
import { fetchIntelligenceItem, fetchIntelligenceItemSections } from "@/lib/supabase-server";
import { getMarketIntelItems } from "@/lib/data";
import { EditorialMasthead } from "@/components/ui/EditorialMasthead";
import { MarketSignalDetailSurface } from "@/components/pages/MarketSignalDetailSurface";
import { JURISDICTIONS } from "@/lib/constants";
import { isoToDisplayLabel } from "@/lib/jurisdictions/iso";

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

  // Related signals: pull the Market Intel set, find items in the same
  // band as this one, exclude self, cap at 5. Failures degrade to an
  // empty list (the surface renders "no related signals" cleanly).
  const marketIntel = await getMarketIntelItems().catch(() => ({
    resources: [],
    total: 0,
  }));

  // Eyebrow jurisdiction label — prefer ISO data, then legacy single string,
  // then "Global". Mirrors /regulations/[slug].
  const jurisLabel =
    r.jurisdictionIso && r.jurisdictionIso.length > 0
      ? r.jurisdictionIso.map(isoToDisplayLabel).join(" · ")
      : JURISDICTIONS.find((j) => j.id === r.jurisdiction)?.label ||
        r.jurisdiction ||
        "Global";

  const published = r.added ? `Published ${formatDate(r.added)}` : null;
  const reviewed = r.lastVerifiedDate ? `Reviewed ${formatDate(r.lastVerifiedDate)}` : null;
  const metaParts = [published, reviewed].filter(Boolean) as string[];

  console.log(`[perf] /market/${id} data ${Date.now() - t0}ms`);

  return (
    <>
      <div style={{ padding: "10px 32px 0" }}>
        <Link
          href="/market"
          prefetch={false}
          style={{
            color: "var(--muted)",
            fontSize: 12,
            textDecoration: "none",
          }}
        >
          ← Market Intelligence
        </Link>
      </div>
      <EditorialMasthead
        eyebrow={`Market Intel · ${jurisLabel}`}
        title={r.title}
        meta={metaParts.join(" · ")}
      />
      <MarketSignalDetailSurface
        resource={r}
        relatedPool={marketIntel.resources}
        sections={sections}
        convergence={convergence}
      />
    </>
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
