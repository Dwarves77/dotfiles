import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { CommunityShell } from "@/components/community/CommunityShell";

export const dynamic = "force-dynamic";

/**
 * /community/browse — group browsing surface (stub).
 *
 * The full browse experience (search, filters, join/request flows)
 * lands in C4. This stub mounts the same CommunityShell so the
 * sidebar swap and masthead are consistent, then renders a small
 * "coming with C4" placeholder where the group grid will live.
 */
export default async function CommunityBrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ region?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/community/browse");

  const REGIONS = [
    { code: "EU", label: "EU / Europe" },
    { code: "UK", label: "United Kingdom" },
    { code: "US", label: "United States" },
    { code: "LATAM", label: "Latin America" },
    { code: "APAC", label: "Asia Pacific" },
    { code: "HK", label: "Hong Kong" },
    { code: "MEA", label: "Middle East & Africa" },
    { code: "GLOBAL", label: "Global / Cross-jurisdictional" },
  ];

  const params = await searchParams;
  const initialRegion = params?.region?.toUpperCase() || "EU";

  return (
    <CommunityShell
      currentUser={{
        id: user.id,
        email: user.email ?? "",
        name: user.email?.split("@")[0] ?? "",
        headshotUrl: null,
        employer: "",
      }}
      memberships={[]}
      invitations={[]}
      topics={[]}
      regions={REGIONS}
      regionCounts={{}}
      initialRegion={initialRegion}
    >
      <div
        style={{
          padding: "48px 32px",
          border: "1px dashed var(--color-border)",
          borderRadius: 8,
          background: "var(--color-bg-surface)",
          textAlign: "center",
          maxWidth: 880,
        }}
      >
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 22,
            fontWeight: 400,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "var(--color-text-primary)",
            margin: "0 0 8px",
          }}
        >
          Browse
        </h2>
        <p
          style={{
            fontSize: 13,
            color: "var(--color-text-secondary)",
            margin: 0,
            lineHeight: 1.55,
          }}
        >
          Browse coming with C4 — full group directory, region filters,
          join/request flows.
        </p>
      </div>
    </CommunityShell>
  );
}
