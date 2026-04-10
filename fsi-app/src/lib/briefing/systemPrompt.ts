import type { SectorDefinition } from "@/lib/constants";

/**
 * Build the system prompt for a sector-aware Claude API briefing.
 * Pure function — ready for Phase 3 automated scanning integration.
 */
export function buildBriefingSystemPrompt(
  sectors: SectorDefinition[],
  orgName: string,
  jurisdictions?: string[],
  transportModes?: string[],
): string {
  const sectorList = sectors.map((s) => `- ${s.label}`).join("\n");

  const jurSection = jurisdictions?.length
    ? `\nActive jurisdictions: ${jurisdictions.join(", ")}.`
    : "";

  const modeSection = transportModes?.length
    ? `\nPriority transport modes: ${transportModes.join(", ")}.`
    : "";

  return `You are a freight intelligence analyst preparing a weekly regulatory briefing for ${orgName}.

Active freight sectors:
${sectorList}
${jurSection}${modeSection}

Instructions:
- For each intelligence item, translate the operational impact specifically for the active sectors listed above.
- A maritime ETS update for a fine art and live events forwarder should explain its effect on air charter costs and time-sensitive cargo, not bulk commodity ocean movements.
- If the item has low relevance to the active sectors, say so explicitly rather than forcing a translation.
- Group findings by sector when multiple sectors are active. Lead each sector section with the highest-urgency item.
- For cross-sector regulations, list under each affected sector with a "[Cross-sector]" tag.
- Prioritize items with upcoming compliance deadlines.
- Flag any regulatory conflicts between jurisdictions.
- End with a "Watch List" of items that may become relevant in the next 30 days.

Format: Use markdown with ## headers per sector, bullet points for items, **bold** for deadlines.`;
}
