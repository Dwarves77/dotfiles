import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { CommunityShell } from "@/components/community/CommunityShell";
import { loadCommunityShellContext } from "@/lib/community/shell-context";
import { EntityDiscoveryPanel } from "@/components/community/EntityDiscoveryPanel";
import type { CommunityEntityRef } from "@/components/community/types";

export const dynamic = "force-dynamic";


/**
 * /community/discover — cross-group topic discovery + topic follow/digest (spec 05 §5 components
 * 3 and 6). See EntityDiscoveryPanel.tsx's header for why entities stand in for "topics" here.
 * This page only assembles the candidate spine-entity list (same server-side read as
 * community/[slug]/page.tsx's composer — no entity search API exists, see EntityPicker.tsx) and
 * CommunityShell's context; the discovery/follow/digest behaviour lives in the client panel.
 */
export default async function CommunityDiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ entityQuery?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/community/discover");

  const sp = await searchParams;
  const entityQuery = sp?.entityQuery?.trim();

  const shell = await loadCommunityShellContext(supabase, user);
  const { topics } = shell;

  let entityQueryBuilder = supabase
    .from("entities")
    .select("entity_id, kind, canonical_name")
    .eq("status", "active")
    .order("canonical_name", { ascending: true })
    .limit(60);
  if (entityQuery) {
    entityQueryBuilder = entityQueryBuilder.ilike("canonical_name", `%${entityQuery}%`);
  }
  const { data: entityRows, error: entityErr } = await entityQueryBuilder;
  if (entityErr) console.warn("community/discover: entity candidate read failed", entityErr.message);
  const candidateEntities: CommunityEntityRef[] = (entityRows ?? []) as CommunityEntityRef[];

  return (
    <CommunityShell
      {...shell}
      initialRegion="EU"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <header>
          {/* fitness-allow: F49 (case not drawn, lane w10a 2026-09-18: same reason as
              community/benchmarks/page.tsx's own h2 marker. No matching part. Review-by:
              SectionHeader lane / operator ruling.) */}
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 22,
              fontWeight: 400,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "var(--color-text-primary)",
              margin: 0,
            }}
          >
            Discover by entity
          </h2>
          <p
            style={{
              fontSize: 12,
              color: "var(--color-text-muted)",
              margin: "4px 0 0",
              maxWidth: 720,
              lineHeight: 1.55,
            }}
          >
            Every thread binds to a spine entity, so following one surfaces every thread that
            touches it — across every group, not just the room it was posted in.
          </p>
        </header>
        <EntityDiscoveryPanel candidateEntities={candidateEntities} />
      </div>
    </CommunityShell>
  );
}
