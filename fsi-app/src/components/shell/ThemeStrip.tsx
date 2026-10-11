import { fetchThemeChips } from "@/lib/supabase-server";
import { ThemeStripView } from "@/components/shell/ThemeStripView";
import type { DetailSurface } from "@/lib/item-links";

export async function ThemeStrip({ surface }: { surface: DetailSurface }) {
  const chips = await fetchThemeChips({ surface, max: 6 });
  if (chips.length === 0) return null; // honest omission: no live theme touches this page, no strip
  return <ThemeStripView chips={chips} />;
}
