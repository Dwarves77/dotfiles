/**
 * ThemeStrip: the customer-facing themes strip on all four list pages (Regulations, Market Intel, Research,
 * Operations), server component (lane S3-B generalises the Research-only strip of lane SURF, 2026-09-01;
 * moved here from src/components/research/ThemeStrip.tsx).
 *
 * Which themes: those with at least one item ON THIS PAGE, most convergent first, each naming every page it
 * spans. Where a chip goes: the detail page of the theme's highest-centrality item on THIS page (pivot rank,
 * then title). That is what the strip always did on Research, where the top pivot was normally a Research
 * item; it is now explicit and holds on every page. The up to three other-member links under a chip are
 * unchanged.
 *
 * Data: one soft-failing read (fetchThemeChips in supabase-server.ts, every shaping decision in the pure,
 * tested buildThemeChips in src/lib/research/theme-brief.mjs). Soft-fails to nothing on any read error: a
 * strip must never break a list page. Members are classified by their own item type and domain (the router
 * the detail pages use), so a chip never links to a page that will 404 it.
 *
 * FIX carried here (lane S3-B): the previous strip selected a column named `type` from intelligence_items,
 * which is `item_type`. [HYPOTHESIS, not verifiable without the database] that read errored and the strip
 * rendered nothing; the rewritten read uses the real column.
 */

import { fetchThemeChips } from "@/lib/supabase-server";
import { ThemeStripView } from "@/components/shell/ThemeStripView";
import type { DetailSurface } from "@/lib/item-links";

export async function ThemeStrip({ surface }: { surface: DetailSurface }) {
  const chips = await fetchThemeChips({ surface, max: 6 });
  if (chips.length === 0) return null; // honest omission: no live theme touches this page, no strip
  return <ThemeStripView chips={chips} />;
}
