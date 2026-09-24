/**
 * /admin/parts/nav-card: the NavCard sign-off page (lane W10-NavCard, 2026-09-23, parts-brief 2.14
 * NAV CARD).
 *
 * "Read parts-brief 2.10 (NAV CARD)...": coordinator note, the live parts-brief renumbered this
 * section to 2.14 (2.10 is now CHIPS) since the dispatch was written; NAV CARD's content (252px
 * always; margin 20px 0 16px 16px; four-band 3px cap; two-row footer) is unchanged, only the
 * section number moved. This page cites the live section number, 2.14, per "the artboard [and the
 * live doc] wins over the README and you say so."
 *
 * NavCard is `Sidebar.tsx` (`data-part="nav-card"` on both the desktop `<aside>` and the mobile
 * drawer `<aside>`), already the ONE nav-card implementation site-wide before this lane (AppShell.tsx
 * is its only call site; the auth frame at /login, /signup, /onboarding renders AuthFrame.tsx instead,
 * per bundle ruling 3, and CommunityShell.tsx only hides the global card with scoped CSS, it does not
 * retype one). This lane's own work is the `data-part` marker, this fixture page, and the /market/series
 * + Research-facet-row fixes named in the same brief section.
 *
 * Renders the real `Sidebar` part against `NAV_COUNTS_FIXTURE` (nav-counts-fixture.ts), frozen via a
 * read-only SELECT against the live corpus (project kwrsbpiseruzbfwjpvsp), 2026-09-23, that file's
 * own header carries the exact queries and date. NO DATABASE READ at request time on this page: the
 * fixture file is a static import; NavCardPartsDemo.tsx patches the client bootstrap fetch to return
 * the frozen counts (same mechanism as CommandBarPartsDemo.tsx, reuse before construction).
 *
 * F49 (parts-not-pages): this page imports Sidebar (via NavCardFixtureFrame) and renders it
 * unmodified; no nav-card literal style is retyped here.
 *
 * Platform-layer surface, not customer-facing (caros-ledge-platform-intent Value Delivery Check
 * applies; see this lane's final report).
 */
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
              {NAV_COUNTS_FIXTURE.research} · Operations {NAV_COUNTS_FIXTURE.operations} · Community{" "}
              {NAV_COUNTS_FIXTURE.community} · Watchlist {NAV_COUNTS_FIXTURE.watchlist}
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
