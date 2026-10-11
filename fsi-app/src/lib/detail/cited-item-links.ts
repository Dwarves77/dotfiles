import { itemDetailHref } from "@/lib/item-links";

export interface CitedItemRow {
  id: string;
  legacy_id: string | null;
  title: string;
  item_type: string | null;
  domain: number | null;
}

export function citedItemsWithHrefs(rows: CitedItemRow[]): Array<{ id: string; title: string; href: string }> {
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    href: itemDetailHref({ id: r.legacy_id || r.id, type: r.item_type, domain: r.domain }),
  }));
}
