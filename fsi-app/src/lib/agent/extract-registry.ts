// src/lib/agent/extract-registry.ts
//
// The format dispatch registry — the single place item_type -> FormatSpec is resolved. sectionBrief
// (and any surface that needs a format's section list / grounding model) goes through here, so adding
// or changing a format is a one-line edit, never a switch scattered across the pipeline.

import type { FormatSpec } from "@/lib/agent/format-spec";
import { regulationSpec } from "@/lib/agent/formats/regulation";
import { researchSpec } from "@/lib/agent/formats/research";
import { marketSpec } from "@/lib/agent/formats/market";
import { technologySpec } from "@/lib/agent/formats/technology";
import { operationsSpec } from "@/lib/agent/formats/operations";

export const FORMAT_SPECS: FormatSpec[] = [
  regulationSpec,
  researchSpec,
  marketSpec,
  technologySpec,
  operationsSpec,
];

const BY_ITEM_TYPE = new Map<string, FormatSpec>();
for (const spec of FORMAT_SPECS) for (const t of spec.itemTypes) BY_ITEM_TYPE.set(t, spec);

/** Resolve the FormatSpec that owns this item_type, or null when none does. */
export function specForItemType(itemType: string | null | undefined): FormatSpec | null {
  if (!itemType) return null;
  return BY_ITEM_TYPE.get(itemType) ?? null;
}
