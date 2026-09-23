import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { CommunityShell } from "@/components/community/CommunityShell";
import { loadCommunityShellContext } from "@/lib/community/shell-context";
import { BenchmarksPanel } from "@/components/community/BenchmarksPanel";
import { SectionHeader } from "@/components/ui/SectionHeader";

export const dynamic = "force-dynamic";


/**
 * /community/benchmarks — house-seeded recurring benchmark surveys (spec 05 §3, §5 components
 * 3/4). The page itself only assembles CommunityShell's context (same boilerplate as every other
 * /community/* page); the data fetch against COMMUNITY-A's
 * GET /api/community/benchmarks/current lives client-side in BenchmarksPanel (see its header for
 * why: aggregate-only data on a calendar cadence, fetched once, no polling).
 */
export default async function CommunityBenchmarksPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/community/benchmarks");

  const shell = await loadCommunityShellContext(supabase, user);

  return (
    <CommunityShell
      {...shell}
      initialRegion="EU"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <header>
          {/* W10-Masthead (2026-09-22): F49 allow-entry expired (ruling 2026-09-20); replaced with
              the SectionHeader part, same reasoning across all six /community/* sub-routes. */}
          <SectionHeader title="Benchmarks" />
          <p
            style={{
              fontSize: 12,
              color: "var(--color-text-muted)",
              margin: "4px 0 0",
              maxWidth: 720,
              lineHeight: 1.55,
            }}
          >
            House-run, aggregate-only surveys (spec 05 §3). Cleared for k-anonymity, dominance and
            lag by construction — every value shown here is a distribution, never one member's
            answer.
          </p>
        </header>
        <BenchmarksPanel />
      </div>
    </CommunityShell>
  );
}
