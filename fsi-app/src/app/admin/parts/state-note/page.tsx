/**
 * /admin/parts/state-note: the StateNote sign-off page (lane W10-StateNote, 2026-09-23,
 * parts-brief 2.7). Renders every STATE_NOTE_FIXTURES entry through the real `StateNote` part,
 * from static hand-built fixture data (see state-note-fixtures.tsx header for why this part's
 * fixtures are traceable-to-production-usage rather than a frozen SELECT), NO database read.
 *
 * F49 (parts-not-pages): this page imports StateNote and renders each fixture through it; no
 * part's literal shell styles are retyped here.
 *
 * Coordinator correction (2026-09-23): this page does NOT edit `src/app/admin/parts/page.tsx`
 * (the shared index). Lane ListRow is converting that index to derive its entries from the
 * per-part folders under `src/app/admin/parts`; this page appears there automatically once that
 * lands.
 *
 * Platform-layer surface, not customer-facing (caros-ledge-platform-intent Value Delivery Check
 * applies; see this lane's final report).
 */
import { requirePlatformAdmin } from "@/lib/auth/admin";
import { PartsPageHeading } from "@/components/admin/PartsPageHeading";
import { SectionCard } from "@/components/ui/SectionCard";
import { StateNote } from "@/components/ui/StateNote";
import { band as bandFromKey, BAND_ORDER } from "@/lib/urgency/bands";
import {
  STATE_NOTE_FIXTURES,
  STATE_NOTE_CATEGORY_LABEL,
  type StateNoteFixture,
} from "@/lib/detail/state-note-fixtures";

const CATEGORY_ORDER: StateNoteFixture["category"][] = [
  "empty",
  "loading",
  "error",
  "not-scored",
  "action-strip",
  "detail-callout",
];

function FixtureRow({ fixture }: { fixture: StateNoteFixture }) {
  const band = fixture.band ? bandFromKey(fixture.band) : undefined;
  const action = fixture.action
    ? {
        label: fixture.action.label,
        // `clickOnly` fixtures wire an inert no-op so the action target still renders at its real
        // 28px hit-target size (law 2) without fabricating the production side effect (an
        // ask-assistant dispatch, a router.refresh(), a track-collapse toggle). Never a `"#"`
        // fallback href (opsclip ruling).
        ...(fixture.action.href ? { href: fixture.action.href } : { onClick: () => {} }),
      }
    : undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: "var(--fs-105)", color: "var(--ink-3)" }}>
        {fixture.label} <span style={{ opacity: 0.7 }}>· {fixture.citation}</span>
      </div>
      <div style={{ width: 640, maxWidth: "100%" }}>
        <StateNote band={band} action={action}>
          {fixture.children}
        </StateNote>
      </div>
    </div>
  );
}

export default async function AdminPartsStateNotePage() {
  await requirePlatformAdmin("/admin/parts/state-note");

  const byCategory = CATEGORY_ORDER.map((category) => ({
    category,
    fixtures: STATE_NOTE_FIXTURES.filter((f) => f.category === category),
  })).filter((g) => g.fixtures.length > 0);

  return (
    <>
      <PartsPageHeading>
        StateNote, {STATE_NOTE_FIXTURES.length} states across {byCategory.length} categories, every band
        tint, no database read
      </PartsPageHeading>
      <div style={{ padding: "16px 36px 80px", display: "flex", flexDirection: "column", gap: 24 }}>
        <SectionCard padding="0" style={{ overflow: "hidden" }} dataAudit="state-note-gallery-bands">
          <div style={{ padding: "16px 20px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: "var(--fs-11)", color: "var(--ink-3)" }}>
              Every band tint (parts-brief 2.7): Immediate #FEF2F2 · Action #FFF7ED · Monitor #EFF6FF ·
              Awareness #F0FDF4; neutral #5A5552 on #F5F2EE
            </div>
            {BAND_ORDER.map((b) => (
              <div key={b.key} style={{ width: 640, maxWidth: "100%" }}>
                <StateNote band={b}>
                  {b.label} band · border-left {b.cssVar} · background {b.tintCssVar}
                </StateNote>
              </div>
            ))}
            <div style={{ width: 640, maxWidth: "100%" }}>
              <StateNote>Neutral (no band) · border-left var(--brand) · background var(--tag)</StateNote>
            </div>
          </div>
        </SectionCard>

        {byCategory.map(({ category, fixtures }) => (
          <SectionCard
            key={category}
            padding="0"
            style={{ overflow: "hidden" }}
            dataAudit={`state-note-gallery-${category}`}
          >
            <div style={{ padding: "16px 20px 20px", display: "flex", flexDirection: "column", gap: 18 }}>
              <div
                style={{
                  fontSize: "var(--fs-10)",
                  fontWeight: 800,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--ink-3)",
                }}
              >
                {STATE_NOTE_CATEGORY_LABEL[category]} · {fixtures.length} example
                {fixtures.length === 1 ? "" : "s"}
              </div>
              {fixtures.map((f) => (
                <FixtureRow key={f.id} fixture={f} />
              ))}
            </div>
          </SectionCard>
        ))}
      </div>
    </>
  );
}
