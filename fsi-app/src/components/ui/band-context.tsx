"use client";

/**
 * Band context (lane PARITY-PARTS, 2026-09-24, operator check 1; README 0.5 "Band tints behind
 * text carry meaning (which band this item is in) and appear on every page that has a band
 * context ... details (callout, ACTION strips)").
 *
 * The class defect: a detail page knows its item's band, but the parts that paint a tint below it
 * (ItemGroup's header and ACTION strip, every StateNote) only received it when a caller remembered
 * to thread it through, and FactBlocks never did, so every item group and most state notes on the
 * four detail pages rendered white or neutral. Threading a prop through every call site is the
 * per-page fix that drifted; this is the part-level one: `DetailPageWrapper` provides the item's
 * band (and its one real action sentence, when the record carries one) ONCE, and ItemGroup and
 * StateNote read it whenever their own `band` prop is absent. Outside a detail page there is no
 * provider, so list and admin state notes keep their README 0.4 neutral variant unchanged.
 *
 * `action` is data, never copy: the item's own top `recommendedActions[].action` (the pipeline's
 * field), or null. A group whose item carries no action renders no ACTION strip; nothing is
 * invented to fill it (ItemGroup.tsx's DATA HONESTY note, CLAUDE.md rule 2).
 */

import { createContext, useContext, type ReactNode } from "react";
import type { UrgencyBand } from "@/lib/urgency/bands";

export interface BandContextValue {
  band: UrgencyBand | null;
  action: string | null;
}

const BandContext = createContext<BandContextValue>({ band: null, action: null });

export function BandProvider({ band, action = null, children }: { band: UrgencyBand | null; action?: string | null; children: ReactNode }) {
  return <BandContext.Provider value={{ band, action: action && action.trim() ? action.trim() : null }}>{children}</BandContext.Provider>;
}

export function useBandContext(): BandContextValue {
  return useContext(BandContext);
}
