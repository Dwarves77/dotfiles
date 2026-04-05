"use client";

import { parseAcronyms } from "@/lib/acronyms";
import { AcronymTooltip } from "./Tooltip";

/**
 * Renders text with acronym tooltips applied automatically.
 * Any recognized acronym (CBAM, ETS, SAF, etc.) gets a dotted underline
 * and hover tooltip with the full definition.
 */
export function AcronymText({ text, className, style }: {
  text: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const segments = parseAcronyms(text);

  return (
    <span className={className} style={style}>
      {segments.map((seg, i) =>
        seg.isAcronym ? (
          <AcronymTooltip key={i} text={seg.text} />
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </span>
  );
}
