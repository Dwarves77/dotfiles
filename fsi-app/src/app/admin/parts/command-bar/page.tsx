/**
 * /admin/parts/command-bar: the CommandBar sign-off page (lane W10-CommandBar-parts, 2026-09-23).
 *
 * "Small. `/admin/parts/command-bar`, the sign-off picture for the part built by lane
 * W10-CommandBar (#769): the bar at 1440 and 375, the inline results state with real search
 * results frozen from a real query, the Ask-disabled state, the page-scoped placeholder variants
 * (enumerate by grep). Add to the parts index. No change to the part unless the fixture reveals a
 * defect; then fix at the part and say so." (brief section 3)
 *
 * NO DATABASE READ AT REQUEST TIME. The frozen search results (`search-results-fixture.ts`) come
 * from one read-only SELECT against the live search path (`search_intelligence_items` RPC,
 * migration 159, mirroring `src/app/api/search/logic.ts::runSearch`), project kwrsbpiseruzbfwjpvsp,
 * 2026-09-23; the query, row ids and date are in that file's own header, per the operator's fixture
 * convention. This page itself makes no SELECT.
 *
 * F49 (parts-not-pages): this page imports CommandBar (and its own fixture-only demo wrapper,
 * CommandBarPartsDemo.tsx) rather than retyping any command-bar literal style here.
 *
 * Ask-disabled state: CommandBarPartsDemo mocks the shared `/api/workspace/bootstrap` singleton to
 * `assistantEnabled: false` for the WHOLE page (see that file's header for why this is page-wide,
 * not per-instance), so every bar below demonstrates the disabled Ask affordance; a dedicated
 * section calls it out explicitly with a zoomed-in view of the button itself.
 *
 * Placeholder variants enumerated 2026-09-23 by `grep -rn "placeholder" src --include="*.tsx"` for
 * every literal string reaching a `commandBar={{ placeholder: ... }}` / `searchPlaceholder` /
 * `<DetailMasthead placeholder=...>` call site (excluding unrelated inputs, e.g. the market-signal
 * notes textarea, which is not a CommandBar caller). One entry per DISTINCT string; two call sites
 * sharing the same literal (the account and organization panels in UserProfilePage.tsx) are listed
 * once, both files named.
 *
 * Platform-layer surface, not customer-facing (caros-ledge-platform-intent Value Delivery Check).
 */
import { requirePlatformAdmin } from "@/lib/auth/admin";
import { CommandBar } from "@/components/ui/CommandBar";
import { SectionCard } from "@/components/ui/SectionCard";
import { PartsPageHeading } from "@/components/admin/PartsPageHeading";
import {
  SEARCH_FIXTURE_QUERY,
  SEARCH_FIXTURE_DATE,
  SEARCH_FIXTURE_PROJECT,
  SEARCH_FIXTURE_RESULTS,
  SEARCH_FIXTURE_VERIFIED_COUNT,
} from "@/components/ui/__fixtures__/search-results-fixture";
import { CommandBarInlineResultsDemo } from "./CommandBarPartsDemo";

interface PlaceholderVariant {
  surface: string;
  file: string;
  placeholder: string | null;
}

/** Enumerated by grep 2026-09-23 (this file's own header names the exact command). `null` means
 *  "no page-scoped override, the default item-count placeholder renders", the Regulations list's
 *  own case. */
const PLACEHOLDER_VARIANTS: PlaceholderVariant[] = [
  { surface: "Regulations (list)", file: "RegulationsLedger.tsx", placeholder: null },
  {
    surface: "Market Intel (list)",
    file: "MarketIntelLedger.tsx",
    placeholder: 'Search signals, series, producers — or ask "how does Brent affect my air freight?"',  // glyph:verbatim
  },
  {
    surface: "Operations (list)",
    file: "OperationsLedger.tsx",
    placeholder: 'Search regions and dimensions — or ask "warehouse labor rates, Singapore vs LA?"',  // glyph:verbatim
  },
  {
    surface: "Research (list)",
    file: "ResearchLedger.tsx",
    placeholder: 'Search findings and themes — or ask "what affects my FY26 Scope 3 baseline?"',  // glyph:verbatim
  },
  {
    surface: "Regulation detail",
    file: "RegulationDetailSurface.tsx",
    placeholder: "Ask about this regulation — e.g. when does the largest deadline hit",  // glyph:verbatim
  },
  {
    surface: "Market signal detail",
    file: "MarketSignalDetailSurface.tsx",
    placeholder: "Ask about this signal — e.g. when does the largest deadline hit",  // glyph:verbatim
  },
  {
    surface: "Operations detail",
    file: "OperationsDetailSurface.tsx",
    placeholder: "Ask about this profile — e.g. when does the largest deadline hit",  // glyph:verbatim
  },
  {
    surface: "Research finding detail",
    file: "ResearchFindingDetailSurface.tsx",
    placeholder: "Ask about this finding — e.g. when does the largest deadline hit",  // glyph:verbatim
  },
  {
    surface: "Community",
    file: "app/community/page.tsx",
    placeholder: 'Search posts, groups, members — or ask "what did the EU room flag this week?"',  // glyph:verbatim
  },
  {
    surface: "Map",
    file: "app/map/page.tsx",
    placeholder: 'Search a jurisdiction — or ask "where are my immediate items?"',  // glyph:verbatim
  },
  {
    surface: "Admin dashboard",
    file: "AdminDashboard.tsx",
    placeholder: 'Search sources, workspaces, flags — or ask "which provisional sources are T1?"',  // glyph:verbatim
  },
  {
    surface: "Settings",
    file: "SettingsPage.tsx",
    placeholder: 'Search settings — or ask "how do I change my briefing day?"',  // glyph:verbatim
  },
  {
    surface: "Account / Organization",
    file: "UserProfilePage.tsx (2 call sites)",
    placeholder: 'Search settings — or ask "how do I add a member?"',  // glyph:verbatim
  },
  {
    surface: "Watchlist",
    file: "WatchlistSurface.tsx",
    placeholder: 'Search your watchlist — or ask "what changed on my watched items?"',  // glyph:verbatim
  },
  {
    surface: "Operations calculator",
    file: "OperationsCalculatorPageView.tsx",
    placeholder: 'Search or ask about this estimate, e.g. "what drives the payback period?"',
  },
  {
    surface: "Obligation register",
    file: "ObligationRegisterPageView.tsx",
    placeholder: 'Search the register — or ask "what is due in the next 30 days?"',  // glyph:verbatim
  },
];

function DemoLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: "10px 20px 0", fontSize: "var(--fs-11)", color: "var(--ink-3)" }}>{children}</div>
  );
}

export default async function AdminPartsCommandBarPage() {
  await requirePlatformAdmin("/admin/parts/command-bar");

  return (
    <>
      <PartsPageHeading>
        CommandBar, 4 states, {SEARCH_FIXTURE_RESULTS.length} frozen rows (query &quot;{SEARCH_FIXTURE_QUERY}&quot;,
        project {SEARCH_FIXTURE_PROJECT}, {SEARCH_FIXTURE_DATE}), no database read at request time
      </PartsPageHeading>
      <div style={{ padding: "16px 36px 80px", display: "flex", flexDirection: "column", gap: 24 }}>
        <SectionCard padding="0" style={{ overflow: "hidden" }} dataAudit="command-bar-gallery-1440">
          <DemoLabel>at 1440 (desktop, 40px tall, ⌘K hint visible)</DemoLabel>
          <div style={{ padding: "16px 20px 20px" }}>
            <div style={{ width: 1440, maxWidth: "100%" }}>
              <CommandBar itemCount={SEARCH_FIXTURE_VERIFIED_COUNT} scope="command-bar-fixture-1440" />
            </div>
          </div>
        </SectionCard>

        <SectionCard padding="0" style={{ overflow: "hidden" }} dataAudit="command-bar-gallery-375">
          <DemoLabel>at 375 (mobile spec, 44px tall, ⌘K hint hidden)</DemoLabel>
          <div style={{ padding: "16px 20px 20px" }}>
            <div style={{ width: 375, maxWidth: "100%" }}>
              <CommandBar itemCount={SEARCH_FIXTURE_VERIFIED_COUNT} scope="command-bar-fixture-375" />
            </div>
          </div>
        </SectionCard>

        <SectionCard padding="0" style={{ overflow: "visible" }} dataAudit="command-bar-gallery-inline-results">
          <DemoLabel>
            inline results state, real rows frozen from a real query (&quot;{SEARCH_FIXTURE_QUERY}&quot;), the same
            shared ListRow, StandardSearch&apos;s own dropdown
          </DemoLabel>
          <div style={{ padding: "16px 20px 200px" }}>
            <div style={{ width: 700, maxWidth: "100%" }}>
              <CommandBarInlineResultsDemo itemCount={SEARCH_FIXTURE_VERIFIED_COUNT} scope="command-bar-fixture-results" />
            </div>
          </div>
        </SectionCard>

        <SectionCard padding="0" style={{ overflow: "hidden" }} dataAudit="command-bar-gallery-ask-disabled">
          <DemoLabel>
            Ask-disabled state. The assistant flag is off in this fixture context (no .env in this worktree;
            CommandBar fails closed until bootstrap resolves), so the Ask button carries the disabled
            attribute and a title naming the reason; Search still works regardless
          </DemoLabel>
          <div style={{ padding: "16px 20px 20px" }}>
            <div style={{ width: 480, maxWidth: "100%" }}>
              <CommandBar itemCount={SEARCH_FIXTURE_VERIFIED_COUNT} scope="command-bar-fixture-ask-disabled" />
            </div>
          </div>
        </SectionCard>

        <SectionCard padding="0" style={{ overflow: "hidden" }} dataAudit="command-bar-gallery-placeholders">
          <DemoLabel>
            page-scoped placeholder variants, {PLACEHOLDER_VARIANTS.length} surfaces, enumerated by grep
            (this page&apos;s own header names the command)
          </DemoLabel>
          <div style={{ padding: "16px 20px 20px", display: "flex", flexDirection: "column", gap: 18 }}>
            {PLACEHOLDER_VARIANTS.map((v) => (
              <div key={v.surface}>
                <div style={{ fontSize: "var(--fs-10)", color: "var(--ink-3)", marginBottom: 4 }}>
                  {v.surface} <span style={{ opacity: 0.7 }}>· {v.file}</span>
                  {v.placeholder === null ? " · no override, default item-count placeholder" : ""}
                </div>
                <div style={{ width: 520, maxWidth: "100%" }}>
                  <CommandBar
                    itemCount={SEARCH_FIXTURE_VERIFIED_COUNT}
                    scope={`command-bar-fixture-placeholder-${v.surface}`}
                    placeholder={v.placeholder ?? undefined}
                  />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </>
  );
}
