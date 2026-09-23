import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { CommunityShell } from "@/components/community/CommunityShell";
import { loadCommunityShellContext } from "@/lib/community/shell-context";
import { ModerationQueue } from "@/components/community/ModerationQueue";
import { SectionHeader } from "@/components/ui/SectionHeader";

export const dynamic = "force-dynamic";


/**
 * /community/moderation — global moderation queue (Phase C, Block C8).
 *
 * Renders <ModerationQueue /> with no groupId prop. RLS on
 * moderation_reports narrows the visible set to:
 *   - reports the caller filed (reporter_user_id = auth.uid()), and
 *   - reports targeting posts in groups where the caller is admin/moderator,
 *   - all reports if the caller is platform admin.
 *
 * Auth is the shared cookie session via createSupabaseServerClient —
 * unauthenticated callers are redirected to /login like every other
 * /community/* page. Non-admin members will simply see an empty queue.
 *
 * The page is wrapped in CommunityShell so the community sidebar /
 * masthead remain consistent. searchParams.region is honoured for the
 * shell context only.
 */
export default async function CommunityModerationPage({
  searchParams,
}: {
  searchParams: Promise<{ region?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/community/moderation");

  const shell = await loadCommunityShellContext(supabase, user);

  const sp = await searchParams;
  const initialRegion = sp?.region?.toUpperCase() || "EU";

  return (
    <CommunityShell
      {...shell}
      initialRegion={initialRegion}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <header>
          {/* W10-Masthead (2026-09-22): F49 allow-entry expired (ruling 2026-09-20); replaced with
              the SectionHeader part, same reasoning across all six /community/* sub-routes. */}
          <SectionHeader title="Moderation queue" />
          <p
            style={{
              fontSize: 12,
              color: "var(--color-text-muted)",
              margin: "4px 0 0",
              maxWidth: 720,
              lineHeight: 1.55,
            }}
          >
            Reports you filed, reports on posts in groups you administer,
            and (for platform admins) every open report across the
            community. RLS narrows the visible set automatically.
          </p>
        </header>

        <ModerationQueue />
      </div>
    </CommunityShell>
  );
}
