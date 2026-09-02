/**
 * CommunityPulse — the Dashboard's first-class Community block (five-surface rebalance, Lane DASH,
 * 2026-09-02). Server component; async.
 *
 * DATA PATH: getCommunityPulse() (src/lib/data.ts, NEW read added by this lane — named in the lane
 * report). Community is not an intelligence_items surface (groups/threads, per
 * source-credibility-model Section 8), so unlike the other three pulse cards this has no existing
 * category-routed fetcher to reuse; getCommunityPulse mirrors getSurfaceCoverageSnapshot's own
 * org-membership scoping (never a raw cross-org scan) rather than inventing a second scoping rule.
 * Threads carry no priority band (Community has none), so the shared card renders their left rule
 * in the neutral border color, never a fabricated severity.
 */

import { getCommunityPulse } from "@/lib/data";
import { SurfacePulseCard, type SurfacePulseItem } from "./SurfacePulseCard";
import { formatRelative, toDate } from "@/lib/relative-time";

export async function CommunityPulse() {
  const { activeGroups, threads } = await getCommunityPulse();

  const items: SurfacePulseItem[] = threads.map((t) => {
    const when = toDate(t.lastActivityAt);
    const activity = when ? `active ${formatRelative(when)}` : null;
    return {
      id: t.id,
      href: t.groupSlug ? `/community/${encodeURIComponent(t.groupSlug)}` : "/community",
      title: t.title,
      meta: [t.groupName, `${t.replyCount} ${t.replyCount === 1 ? "reply" : "replies"}`, activity]
        .filter((v): v is string => !!v)
        .join(" · "),
    };
  });

  return (
    <SurfacePulseCard
      title="Community"
      titleHref="/community"
      countLabel={activeGroups > 0 ? `${items.length} of ${activeGroups} room${activeGroups === 1 ? "" : "s"}` : undefined}
      items={items}
      emptyBody="No room activity in your workspace yet. Peer threads bound to a corridor, jurisdiction or technology appear here once your workspace joins a regional room and someone posts."
      emptyCtaLabel="Open Community →"
      emptyCtaHref="/community"
    />
  );
}
