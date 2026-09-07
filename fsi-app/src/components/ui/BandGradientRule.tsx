"use client";

/**
 * BandGradientRule — the band-proportion gradient rule (UI system handoff
 * 2026-09-06, README: "The four-band gradient rule (3px, segment widths
 * proportional to the live band counts) is the brand mark — it tops the
 * frame and the masthead." Confirmed by the operator ruling for this
 * session over the two open-decision option turns (artboards 18/19): the
 * page artboards already show this treatment, it is not chosen from the
 * option turns.
 *
 * Segment widths are proportional to the LIVE counts passed in — never a
 * fixed four-way split — so the rule visually reports the workspace's
 * actual urgency mix.
 */

import { BAND_ORDER } from "@/lib/urgency/bands";

export interface BandGradientRuleProps {
  counts: Record<string, number>;
  height?: number;
}

export function BandGradientRule({ counts, height = 3 }: BandGradientRuleProps) {
  const total = BAND_ORDER.reduce((sum, b) => sum + (counts[b.key] ?? 0), 0);
  const segments =
    total > 0
      ? BAND_ORDER.map((b) => ({ hex: b.hex, pct: ((counts[b.key] ?? 0) / total) * 100 }))
      : BAND_ORDER.map((b) => ({ hex: b.hex, pct: 25 }));

  let acc = 0;
  const stops = segments
    .map((s) => {
      const from = acc;
      acc += s.pct;
      return `${s.hex} ${from}%, ${s.hex} ${acc}%`;
    })
    .join(", ");

  return (
    <div
      aria-hidden="true"
      style={{ height, flexShrink: 0, background: `linear-gradient(90deg, ${stops})` }}
    />
  );
}
