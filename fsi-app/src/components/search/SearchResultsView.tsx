"use client";

/**
 * SearchResultsView: the presentational half of `/search`, split out of `src/app/search/page.tsx`
 * (lane W10-CommandBar, 2026-09-21) so it can be mounted standalone by the rendering guard's UX
 * smoke suite. `page.tsx` is an async SERVER component reading cookies via
 * `createSupabaseServerClient`; a smoke spec bundles a client entry point and cannot construct a
 * Next.js request context, so the row-bearing markup (F35's actual subject) lives here instead,
 * taking already-resolved data as plain props, the same server/view split
 * `OperationsItemsView.tsx` and the other `*View.tsx` components in this app already use.
 *
 * Same frame and masthead as every other list surface (README section 0.3): Masthead (carrying its
 * own CommandBar) + PageFrame, one SectionCard holding the results on the shared `ListRow` part, no
 * new row component, per F45 (duplicate-code) and F42 (shared-part reuse).
 */

import { Masthead } from "@/components/ui/Masthead";
import { PageFrame } from "@/components/layout/PageFrame";
import { SectionCard } from "@/components/ui/SectionCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ListRow, ListRowColumnHeader } from "@/components/ui/ListRow";
import { StateNote } from "@/components/ui/StateNote";
import { LegendRailCard } from "@/components/list-surface/ListSurfaceRailCards";
import { bandFromPriority } from "@/lib/urgency/bands";
import { itemDetailHref } from "@/lib/item-links";
import { jurisdictionCode, metaLine } from "@/lib/dashboard/row-fields";
import { formatNumber } from "@/lib/format";
import type { SearchResultRow } from "@/app/api/search/logic";

export interface SearchResultsViewProps {
  q: string;
  results: SearchResultRow[];
  /** The bounded read's own ceiling (logic.ts's MAX_RESULTS), so a full page can say "showing the
   *  top N" honestly instead of implying it has every match (BOUNDED, F38/F39). */
  maxResults: number;
  dateLabel: string;
  nowIso?: string;
}

export function SearchResultsView({ q, results, maxResults, dateLabel, nowIso }: SearchResultsViewProps) {
  const atCap = results.length >= maxResults;

  return (
    <>
      <div style={{ padding: "20px 40px 0" }}>
        <Masthead
          title="Search"
          dateLabel={dateLabel}
          nowIso={nowIso}
          dek={q ? <>Results for &ldquo;{q}&rdquo;</> : <>Search or ask across the workspace</>}
          commandBar={{ itemCount: results.length, scope: "search" }}
        />
      </div>
      <PageFrame rail={<LegendRailCard />}>
        <SectionCard>
          <SectionHeading title={q ? `Results · ${formatNumber(results.length)}` : "Search"} />

          {atCap && (
            <div style={{ padding: "0 16px 10px" }}>
              <StateNote>
                Showing the top {formatNumber(maxResults)} matches. Narrow the search to see more precise
                results.
              </StateNote>
            </div>
          )}

          {!q ? (
            <div style={{ padding: 16 }}>
              <StateNote>
                Type a search in the bar above and press Enter, or use its Ask button to ask a question
                instead.
              </StateNote>
            </div>
          ) : results.length === 0 ? (
            <div style={{ padding: 16 }}>
              <StateNote>No results for &ldquo;{q}&rdquo;.</StateNote>
            </div>
          ) : (
            <>
              <ListRowColumnHeader titleLabel="Title · type · modes" />
              {results.map((r) => {
                const href = itemDetailHref({ id: r.id, type: r.item_type, domain: r.domain });
                const band = bandFromPriority(r.priority);
                return (
                  <ListRow
                    key={r.id}
                    href={href}
                    band={band}
                    jurisdiction={jurisdictionCode({ jurisdiction: r.jurisdictions?.[0] ?? undefined })}
                    title={r.title}
                    meta={metaLine({
                      type: r.item_type ?? undefined,
                      modes: r.transport_modes ?? undefined,
                      topic: r.topic ?? undefined,
                    })}
                  />
                );
              })}
            </>
          )}
        </SectionCard>
      </PageFrame>
    </>
  );
}
