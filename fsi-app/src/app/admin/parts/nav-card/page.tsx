import { requirePlatformAdmin } from "@/lib/auth/admin";
import { SectionCard } from "@/components/ui/SectionCard";
import { PartsPageHeading } from "@/components/admin/PartsPageHeading";
import { NAV_COUNTS_FIXTURE, NAV_COUNTS_FIXTURE_DATE, NAV_COUNTS_FIXTURE_PROJECT } from "@/components/ui/__fixtures__/nav-counts-fixture";
import { NavCardFixtureFrame } from "./NavCardPartsDemo";

export default async function AdminPartsNavCardPage() {
  await requirePlatformAdmin("/admin/parts/nav-card");

  return (
    <>
      <PartsPageHeading>
        NavCard, one desktop card + mobile drawer variant of the same part, frozen counts, no database
        read
      </PartsPageHeading>
      <div style={{ padding: "16px 36px 80px", display: "flex", flexDirection: "column", gap: 24 }}>
        <SectionCard padding="16px 20px 20px" dataAudit="nav-card-provenance">
          <div style={{ fontSize: "var(--fs-11)", color: "var(--ink-3)", display: "flex", flexDirection: "column", gap: 4 }}>
            <span>
              Counts frozen {NAV_COUNTS_FIXTURE_DATE} via read-only SELECT, project{" "}
              {NAV_COUNTS_FIXTURE_PROJECT} (see nav-counts-fixture.ts header for the exact queries).
            </span>
            <span>
              Regulations {NAV_COUNTS_FIXTURE.regulations} · Market {NAV_COUNTS_FIXTURE.market} · Research{" "}
              {NAV_COUNTS_FIXTURE.research} · Operations {NAV_COUNTS_FIXTURE.operations} · Watchlist{" "}
              {NAV_COUNTS_FIXTURE.watchlist}
            </span>
            <span>
              byPriority: CRITICAL {NAV_COUNTS_FIXTURE.byPriority.CRITICAL} · HIGH{" "}
              {NAV_COUNTS_FIXTURE.byPriority.HIGH} · MODERATE {NAV_COUNTS_FIXTURE.byPriority.MODERATE} · LOW{" "}
              {NAV_COUNTS_FIXTURE.byPriority.LOW}
            </span>
          </div>
        </SectionCard>

        <SectionCard padding="0" style={{ overflow: "hidden" }} dataAudit="nav-card-desktop">
          <div style={{ padding: "14px 20px 0", fontSize: "var(--fs-10)", color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>
            Desktop card, 252px
          </div>
          <NavCardFixtureFrame />
        </SectionCard>

        <SectionCard padding="16px 20px 20px" dataAudit="nav-card-auth-frame-note">
          <div style={{ fontSize: "var(--fs-11)", color: "var(--ink-3)" }}>
            Bundle ruling 3: the auth frame (/login, /signup, /onboarding) renders no nav card. Those
            routes mount AuthFrame.tsx instead of AppShell&apos;s Sidebar. Confirmed live in AppShell.tsx&apos;s
            NO_SIDEBAR_ROUTES list.
          </div>
        </SectionCard>
      </div>
    </>
  );
}
