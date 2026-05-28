/**
 * RegulationSections — composes the 7 numbered sections on the
 * regulation detail page.
 *
 * Sprint 3 A5.3 (2026-05-27). Receives raw `IntelligenceItemSectionRow[]`
 * from the server (via the page.tsx fetch) and dispatches each row to
 * its section-specific renderer. Sections come pre-sorted by
 * section_order from the DB query.
 *
 * Integrity-preserving: rows whose parser returns null (malformed
 * markdown) are silently omitted. The block as a whole returns null
 * when no rows are present, so the parent surface can choose to
 * suppress or fall through to the legacy markdown view.
 *
 * Section_key → headings used in the badge are pulled from the row's
 * content_md heading where available; the canonical SKILL.md heading
 * is the fallback.
 */

import type { IntelligenceItemSectionRow } from "@/lib/supabase-server";
import {
  parseRegulationSection,
  type RegulationSectionKey,
} from "@/lib/agent/extract-regulation-sections";
import { SectionCard } from "./SectionCard";
import { ActionList } from "./ActionList";
import { ProseSection } from "./ProseSection";
import { ObligationsTable } from "./ObligationsTable";
import { RegulationTimeline } from "./RegulationTimeline";
import { SourcesList } from "./SourcesList";

const CANONICAL_HEADINGS: Record<RegulationSectionKey, string> = {
  "3": "Issues Requiring Immediate Action",
  "4": "How the Workspace Sits in the Compliance Chain",
  "8": "Substantive Requirements",
  "10": "Registration and Reporting Obligations",
  "11": "Operational System Requirements",
  "14": "Confirmed Regulatory Timeline",
  "15": "Sources",
};

const KNOWN_KEYS = new Set<string>(["3", "4", "8", "10", "11", "14", "15"]);

export function RegulationSections({ rows }: { rows: IntelligenceItemSectionRow[] }) {
  const known = rows.filter((r) => KNOWN_KEYS.has(r.section_key));
  if (known.length === 0) return null;

  return (
    <div>
      {known.map((row) => {
        const key = row.section_key as RegulationSectionKey;
        const heading = CANONICAL_HEADINGS[key];
        const parsed = parseRegulationSection(key, heading, row.content_md);
        if (!parsed) return null;

        return (
          <SectionCard
            key={key}
            sectionKey={key}
            heading={heading}
            tag={sectionTag(parsed)}
            id={`section-${key}`}
          >
            {renderBody(parsed)}
          </SectionCard>
        );
      })}
    </div>
  );
}

function sectionTag(
  parsed: ReturnType<typeof parseRegulationSection>
): string | undefined {
  if (!parsed) return undefined;
  switch (parsed.kind) {
    case "action_list":
      return parsed.items.length > 0 ? `Always · ${parsed.items.length}` : "Always";
    case "obligations_table":
      return parsed.rows.length > 0 ? `Always · ${parsed.rows.length}` : "Always";
    case "timeline":
      return parsed.entries.length > 0 ? `Always · ${parsed.entries.length}` : "Always";
    case "sources_list":
      return parsed.entries.length > 0
        ? `Always · ${parsed.entries.length} source${parsed.entries.length === 1 ? "" : "s"}`
        : "Always";
    default:
      return "Always";
  }
}

function renderBody(
  parsed: NonNullable<ReturnType<typeof parseRegulationSection>>
): React.ReactNode {
  switch (parsed.kind) {
    case "action_list":
      return <ActionList items={parsed.items} />;
    case "prose_with_source":
      return <ProseSection markdown={parsed.markdown} source={parsed.source} />;
    case "obligations_table":
      return <ObligationsTable rows={parsed.rows} />;
    case "prose":
      return <ProseSection markdown={parsed.markdown} />;
    case "timeline":
      return <RegulationTimeline entries={parsed.entries} />;
    case "sources_list":
      return <SourcesList entries={parsed.entries} />;
  }
}
