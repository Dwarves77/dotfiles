import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { CommunityShell } from "@/components/community/CommunityShell";
import { loadCommunityShellContext } from "@/lib/community/shell-context";
import { ProfileForm } from "@/components/community/ProfileForm";

export const dynamic = "force-dynamic";


/**
 * /community/profile — verified-pseudonymous identity, self-service (spec 05 §2, §5 component 1;
 * lane COMMUNITY-C, 2026-09-03). Same CommunityShell-context boilerplate as every other /community/*
 * page (see benchmarks/page.tsx); the actual profile fetch/save/verify flow lives client-side in
 * ProfileForm (its own header explains why: three independent async actions with their own pending/
 * success/error states, better owned by one client component than threaded through server props).
 */
export default async function CommunityProfilePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/community/profile");

  const shell = await loadCommunityShellContext(supabase, user);

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
            Your profile
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
            Verified backing, pseudonymous display (spec 05 §2). Declare your organisation type, role,
            sector and region, then verify a corporate email to contribute to the house benchmark.
          </p>
        </header>
        <ProfileForm />
      </div>
    </CommunityShell>
  );
}
