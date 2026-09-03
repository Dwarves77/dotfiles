/**
 * EvidenceAgeChip — time-decay chip on contributed evidence (spec 05 §4: "Gartner halves review
 * weight every 12 months... A corroborated 2024 SAF premium is not evidence about 2026", spec 05 §5
 * component 7, acceptance 8: "contributed evidence displays its age and decayed weight").
 *
 * The chip TEXT is computed by COMMUNITY-A (evidenceAge() in src/lib/community, read-only from this
 * lane) and rendered here VERBATIM — this component performs no date math and asserts no meaning
 * about the string beyond displaying it, exactly as the wave3 contract specifies ("chip text like
 * 'this month' / '3 mo old · 80% weight'; render as given").
 */

import { Clock } from "lucide-react";

interface EvidenceAgeChipProps {
  chip: string | null | undefined;
}

export function EvidenceAgeChip({ chip }: EvidenceAgeChipProps) {
  if (!chip) return null;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "1px 7px",
        fontSize: 10.5,
        fontWeight: 600,
        color: "var(--color-text-muted)",
        border: "1px solid var(--color-border)",
        borderRadius: 3,
        flexShrink: 0,
        overflowWrap: "anywhere",
      }}
    >
      <Clock size={10} aria-hidden="true" />
      {chip}
    </span>
  );
}
