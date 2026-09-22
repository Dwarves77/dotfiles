"use client";

/**
 * FactCardGallery: the fixture-rendering body for /admin/parts/fact-card (lane w10-factcard-b,
 * 2026-09-20; Amendment 1 section B.2; rebuilt to panel 21c by lane w10-factcard-d, 2026-09-21
 * per the operator's NOT-SIGNED review, build item 5).
 *
 * The page opens with the PANEL 21C FIXTURE ITSELF (two ItemGroups, five cards, two ACTION
 * strips, the same Belgium-packaging content the artboard draws) - review defect 5: "There is no
 * ItemGroup in the fixture... FactCard cannot be signed without its group." Review defect 3
 * ("WHITESPACE ABOVE EACH CARD... the kind label is rendered as an external caption above every
 * card... Remove the captions") is why this file carries ZERO per-card `<p>{label}</p>` captions
 * anywhere, including in the variant gallery below: a group's own ItemGroup title (once per
 * group, never once per card) is the only text above a card's own kind band.
 *
 * The variant gallery (every kind, every form, the no-lead case, the matrix density, a long
 * claim, a card with no provenance) moves BELOW the panel-21c fixture under one plain heading,
 * each variant inside its own ItemGroup (build item 5's "each variant inside a group, never a
 * caption above a card").
 *
 * Operator sign-off 2026-09-22, correction 3: "The '10 more facts below' line is fixture chrome,
 * remove from the part (the ItemGroup disclosure is the only overflow affordance)." Fourteen
 * default-density fixtures inside one ItemGroup tripped ItemGroup's real 4-card visible cap and
 * showed its `MoreBelowDisclosure` ("10 more facts below") - a genuine, correct control on a real
 * item group, but here it was only an accident of cramming every reference variant into a single
 * group. `chunkIntoGroupsOf4` splits the reference gallery across as many ItemGroups as it takes
 * to keep every one at or under its 4-card visible cap, so the disclosure never fires on this
 * page; the real ItemGroup component and its real overflow control are untouched.
 */
import { SectionCard } from "@/components/ui/SectionCard";
import { FactCard } from "@/components/ui/FactCard";
import { ItemGroup } from "@/components/ui/ItemGroup";
import type { FactCardFixture, MatrixFixture } from "@/lib/detail/fact-card-fixtures";
import type { PanelGroupFixture } from "@/lib/detail/fact-card-panel21c-fixture";

const GALLERY_GROUP_SIZE = 4;

function chunkIntoGroupsOf4<T>(items: T[]): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += GALLERY_GROUP_SIZE) {
    chunks.push(items.slice(i, i + GALLERY_GROUP_SIZE));
  }
  return chunks;
}

const PLAIN_HEADING: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: "var(--ink)",
  margin: "0 0 4px",
};

const PLAIN_SUBHEADING: React.CSSProperties = {
  fontSize: "var(--fs-12)",
  color: "var(--ink-3)",
  margin: "0 0 16px",
};

export function FactCardGallery({
  panelGroups,
  defaultFixtures,
  matrixFixtures,
}: {
  panelGroups: PanelGroupFixture[];
  defaultFixtures: FactCardFixture[];
  matrixFixtures: MatrixFixture[];
}) {
  return (
    <div data-part-gallery="fact-card">
      {/* Panel 21c: the sign-off fixture. Acceptance (operator, 2026-09-21): both groups
          together <= 1100px tall at 1440, each group carries a band pill + ACTION strip, zero
          adjacent same-kind cards (mergeAdjacentSameKind already guarantees this upstream in
          fact-card-model.ts - these fixtures simply never feed it two same-kind facts in a row). */}
      <SectionCard padding={20} style={{ margin: "0 0 24px" }} dataAudit="fact-card-gallery-panel-21c">
        <p style={PLAIN_HEADING}>Panel 21c fixture</p>
        <p style={PLAIN_SUBHEADING}>Two item groups, five cards, two ACTION strips - the sign-off picture, not a gallery.</p>
        <div data-part="s2-section">
          {panelGroups.map((g) => (
            <ItemGroup key={g.title} title={g.title} qualifier={g.qualifier} band={g.band} actionStrip={g.actionStrip}>
              {g.cards.map((f) => (
                <FactCard key={f.label} model={f.model} />
              ))}
            </ItemGroup>
          ))}
        </div>
      </SectionCard>

      {/* Variant gallery: reference only, not the artboard's own content. One plain heading,
          each variant inside its own ItemGroup, no per-card caption. */}
      <SectionCard padding={20} style={{ margin: "0 0 24px" }} dataAudit="fact-card-gallery-variants">
        <p style={PLAIN_HEADING}>Variant gallery</p>
        <p style={PLAIN_SUBHEADING}>Reference only: every kind, every form, no-lead, long claim, no provenance, density=&quot;matrix&quot;.</p>

        {chunkIntoGroupsOf4(defaultFixtures).map((chunk, i, all) => (
          <ItemGroup key={`default-${i}`} title={all.length > 1 ? `Default density (${i + 1} of ${all.length})` : "Default density"}>
            {chunk.map((f) => (
              <FactCard key={f.label} model={f.model} />
            ))}
          </ItemGroup>
        ))}

        {chunkIntoGroupsOf4(matrixFixtures).map((chunk, i, all) => (
          <ItemGroup
            key={`matrix-${i}`}
            title={all.length > 1 ? `density="matrix" (operations panel variant) (${i + 1} of ${all.length})` : 'density="matrix" (operations panel variant)'}
          >
            {chunk.map((f) => (
              <FactCard key={f.label} density="matrix" fact={f.fact} baseFact={f.baseFact} />
            ))}
          </ItemGroup>
        ))}
      </SectionCard>
    </div>
  );
}
