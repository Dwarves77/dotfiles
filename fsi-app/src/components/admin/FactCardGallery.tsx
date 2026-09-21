"use client";

/**
 * FactCardGallery: the fixture-rendering body for /admin/parts/fact-card (lane w10-factcard-b,
 * 2026-09-20; Amendment 1 section B.2). Renders every FactCard fixture through the real component,
 * grouped so a reviewer can sign off each requirement named in the ruling: every kind, every form,
 * the no-lead case, density="matrix", a long claim, a card with no provenance.
 */
import { SectionCard } from "@/components/ui/SectionCard";
import { FactCard } from "@/components/ui/FactCard";
import type { FactCardFixture, MatrixFixture } from "@/lib/detail/fact-card-fixtures";

const GROUP_LABEL: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--text-2)",
  margin: "0 0 12px",
};

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <SectionCard padding={20} style={{ margin: "0 0 24px" }} dataAudit={`fact-card-gallery-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
      <p style={GROUP_LABEL}>{title}</p>
      {children}
    </SectionCard>
  );
}

export function FactCardGallery({
  defaultFixtures,
  matrixFixtures,
}: {
  defaultFixtures: FactCardFixture[];
  matrixFixtures: MatrixFixture[];
}) {
  return (
    <div data-part-gallery="fact-card">
      <Group title="Default density: every kind, every form, no-lead, long claim, no provenance">
        {defaultFixtures.map((f) => (
          <div key={f.label} style={{ margin: "0 0 16px" }}>
            <p style={{ fontSize: 10.5, color: "var(--text-2)", margin: "0 0 4px" }}>{f.label}</p>
            <FactCard model={f.model} />
          </div>
        ))}
      </Group>

      <Group title='density="matrix": operations panel variant (figure branch and no-figure branch)'>
        {matrixFixtures.map((f) => (
          <div key={f.label} style={{ margin: "0 0 16px" }}>
            <p style={{ fontSize: 10.5, color: "var(--text-2)", margin: "0 0 4px" }}>{f.label}</p>
            <FactCard density="matrix" fact={f.fact} baseFact={f.baseFact} />
          </div>
        ))}
      </Group>
    </div>
  );
}
