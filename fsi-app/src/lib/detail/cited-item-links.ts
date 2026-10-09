// The cited items of an inference, each with the detail page the reader can open (DFIX-1, 2026-10-08, row 05-p2).
// One home for the row-to-link mapping: the title is the verified item title, the href is itemDetailHref routed by
// the item own type and domain (the same function every ledger uses) with the UI id (legacy_id, else the uuid).
// inference-view.mjs readCustomerInferences turns the result into the `titles` and `hrefs` maps the section reads.

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
