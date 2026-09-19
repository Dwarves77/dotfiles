import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { fetchAllRows } from "@/lib/db/paginate.mjs";
import { CommunityShell } from "@/components/community/CommunityShell";
import { loadCommunityShellContext } from "@/lib/community/shell-context";
import {
  PeerOrgDirectoryTable,
  type OrgTypeRegionRow,
  type SectorRow,
} from "@/components/community/PeerOrgDirectoryTable";

export const dynamic = "force-dynamic";


const UNSPECIFIED = "Unspecified";

interface ProfileAggRow {
  affiliation_type: string | null;
  region: string | null;
  sector_overrides: string[] | null;
  verifier_status: string | null;
}

/**
 * /community/directory — the peer-org directory (spec 05 §5 component 3: "peer-org directory,
 * aggregate, pseudonymous"). See PeerOrgDirectoryTable.tsx's header for the exact fields this reads
 * and why (no `organizations.type` column exists in the legacy schema, so `profiles.affiliation_type`
 * / `.region` / `.sector_overrides` / `.verifier_status` stand in — counts only, never a name).
 */
export default async function CommunityDirectoryPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/community/directory");

  // ── Shell context (mirrors the other /community/* pages) ────────────────
  const shell = await loadCommunityShellContext(supabase, user);

  // ── Aggregate peer-org data ───────────────────────────────────────────
  // Counts only, computed server-side from columns that are themselves never a name or company
  // (affiliation_type/region/sector_overrides/verifier_status).
  //
  // FIXED (CAP-1000, 2026-09-05, "two defects one cause" audit): this used to be a single
  // `.limit(5000)` call — PostgREST's db-max-rows setting caps ANY response at 1000 rows regardless
  // of what `.limit()` asks for, so the "well under 5000" comment's assumption was never actually
  // enforced past 1000 profiles; a silent undercount in byOrgTypeAndRegion/bySector below would have
  // had no signal at all (the exact PERF-13/OVERFETCH_CAP defect class this lane's audit named). Now
  // walks every row via fetchAllRows (paginate.mjs), ordered by the table's PK for the total order
  // offset paging requires, so the aggregate is exact at any member count.
  let profileRows: ProfileAggRow[] = [];
  let aggErr: { message: string } | null = null;
  try {
    profileRows = await fetchAllRows<ProfileAggRow>(
      (from, to) =>
        supabase
          .from("profiles")
          .select("affiliation_type, region, sector_overrides, verifier_status, id")
          .order("id", { ascending: true })
          .range(from, to),
      { pageSize: 1000 }
    );
  } catch (e) {
    aggErr = { message: e instanceof Error ? e.message : String(e) };
  }
  if (aggErr) console.warn("community/directory: profile aggregate read failed", aggErr.message);

  const rows = profileRows;

  const byOrgTypeAndRegionMap = new Map<string, OrgTypeRegionRow>();
  const bySectorMap = new Map<string, number>();
  for (const row of rows) {
    const orgType = (row.affiliation_type ?? "").trim() || UNSPECIFIED;
    const region = (row.region ?? "").trim() || UNSPECIFIED;
    const key = `${orgType}::${region}`;
    const entry = byOrgTypeAndRegionMap.get(key) ?? { orgType, region, members: 0, verified: 0 };
    entry.members += 1;
    if (row.verifier_status === "active") entry.verified += 1;
    byOrgTypeAndRegionMap.set(key, entry);

    for (const s of row.sector_overrides ?? []) {
      const sector = (s ?? "").trim();
      if (!sector) continue;
      bySectorMap.set(sector, (bySectorMap.get(sector) ?? 0) + 1);
    }
  }

  const byOrgTypeAndRegion = Array.from(byOrgTypeAndRegionMap.values()).sort(
    (a, b) => b.members - a.members
  );
  const bySector: SectorRow[] = Array.from(bySectorMap.entries())
    .map(([sector, members]) => ({ sector, members }))
    .sort((a, b) => b.members - a.members);

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
            Peer-org directory
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
            Aggregate counts only — org type, region, and sector. Never a name, never a company
            (spec 05 §2). {rows.length} member{rows.length === 1 ? "" : "s"} counted.
          </p>
        </header>

        <PeerOrgDirectoryTable
          byOrgTypeAndRegion={byOrgTypeAndRegion}
          bySector={bySector}
          totalMembers={rows.length}
        />
      </div>
    </CommunityShell>
  );
}
