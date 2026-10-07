/**
 * CrossPageSection (lane S3-B): the ONE "Connected intelligence" section every detail page mounts, so a reader sees
 * what an item connects to on the OTHER pages and what that connection means, wherever they start.
 *
 * Two blocks, each rendering nothing when its data is absent (the section itself renders nothing when
 * both are):
 *   1. Intersections: the item's stated coupling (intelligence_items.intersection_summary), then the items
 *      on other pages that share an operational scenario AND a compliance object with it, grouped by page,
 *      each with its coupling in plain words (human labels from tag-labels.mjs, never a slug, never a
 *      score). Strong and medium are inline; weak ones sit in a collapsed "Possible connections" group
 *      (docs/specs/00-foundation-the-spine.md section 6). Same-page intersections follow the other pages.
 *   2. Theme analysis: the cluster this item belongs to. When the theme has a brief: its title, what it
 *      means, what follows on THIS page (only this page's ramifications subsection), what to watch, then
 *      the other members grouped by page, with how the items connect and what is missing behind one
 *      disclosure. A stale brief says so and still shows; a brief written before migration 351 shows its
 *      markdown; a theme with no brief shows its members and names what is missing.
 *
 * View-models are built by pure, tested modules (connection-view-model.mjs buildIntersectionView,
 * research/theme-brief.mjs buildThemeAnalysisView); this file only draws them. There is no async action on
 * this block: the primary action is opening a connected item (every row is one 44px link), and the two
 * disclosures are native <details> with a 44px summary.
 *
 * ARTBOARD NOTE (CLAUDE.md rule 20): no artboard draws this section; it is built from the existing shell
 * parts (DetailSection, DetailSubSection, StateNote, GfmSection) and recorded as a design change owed.
 */

import type { CSSProperties, ReactNode } from "react";
import { DetailSection } from "@/components/detail/DetailShell";
import { DetailSubSection } from "@/components/ui/DetailSubSection";
import { StateNote } from "@/components/ui/StateNote";
import { GfmSection } from "@/components/shared/GfmSection";
import { InferenceSection, inferenceClaimOf as claimOf, type InferenceSectionData } from "@/components/detail/InferenceSection";
import { CONNECTED_SECTION_ID, connectedSectionOrd, inferencesSectionOrd } from "@/lib/detail/section-index-data";
import { pickVisibleInferences } from "@/lib/detail/inference-view.mjs";
import { admissibleForInference } from "@/components/shared/InferenceClaim";
import { buildIntersectionView } from "@/lib/connections/connection-view-model.mjs";
import { cleanPreContractBriefText } from "@/lib/research/theme-brief-text.mjs";
import type { buildThemeAnalysisView } from "@/lib/research/theme-brief.mjs";
import type { ItemConnection } from "@/types/resource";

export type ThemeAnalysisView = NonNullable<ReturnType<typeof buildThemeAnalysisView>>;
type IntersectionView = NonNullable<ReturnType<typeof buildIntersectionView>>;
type Group = IntersectionView["groups"][number];

export interface CrossPageData {
  /** The item's own stated intersection coupling, or null. */
  intersectionSummary?: string | null;
  /** The item's theme analysis for the viewing page, or null when the item is in no theme. */
  theme?: ThemeAnalysisView | null;
  /** Lane P2: the current, customer-visible inferences that cite the item; rendered as their own section after
   *  this one, so every detail page that mounts CrossPageSection carries them with no second mount. */
  inferences?: InferenceSectionData | null;
}

const LABEL: CSSProperties = {
  fontSize: "var(--fs-105)",
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--ink-3)",
  margin: "0 0 4px",
};

const ROW_LINK: CSSProperties = {
  display: "block",
  minHeight: 44,
  padding: "10px 0",
  borderBottom: "1px solid var(--line-3)",
  textDecoration: "none",
  color: "inherit",
};

const ROW_TITLE: CSSProperties = {
  fontSize: "var(--fs-125)",
  fontWeight: 700,
  lineHeight: 1.35,
  color: "var(--ink)",
  margin: 0,
  overflowWrap: "anywhere",
};

const SUMMARY_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  minHeight: 44,
  cursor: "pointer",
  fontSize: "var(--fs-13)",
  fontWeight: 700,
  color: "var(--ink)",
};

function GroupList({ groups }: { groups: Group[] }) {
  return (
    <>
      {groups.map((g) => (
        <div key={g.surface} style={{ marginTop: 14 }}>
          <p style={LABEL}>
            {g.label}
            {g.samePage ? " (this page)" : ""} · {g.items.length}
          </p>
          {g.items.map((it) => (
            <a key={it.id} href={it.href} style={ROW_LINK}>
              <p data-guard-title style={ROW_TITLE}>
                {it.title}
              </p>
              {it.coupling && (
                <p style={{ fontSize: "var(--fs-11)", lineHeight: 1.5, color: "var(--ink-2)", margin: "3px 0 0" }}>{it.coupling}</p>
              )}
            </a>
          ))}
        </div>
      ))}
    </>
  );
}

function IntersectionsBlock({ view }: { view: IntersectionView }) {
  return (
    <DetailSubSection
      title="Intersections"
      subtitle="Items that share an operational scenario and a compliance object with this one"
      first
    >
      {view.summary && (
        <div style={{ marginBottom: 4 }}>
          <p style={LABEL}>Stated coupling</p>
          <GfmSection markdown={view.summary} />
        </div>
      )}
      <GroupList groups={view.groups} />
      {view.possible.length > 0 && (
        <details style={{ marginTop: 14 }}>
          <summary style={SUMMARY_STYLE}>
            Possible connections ({view.possibleCount})
          </summary>
          <p style={{ fontSize: "var(--fs-11)", color: "var(--ink-3)", margin: "0 0 4px" }}>
            Weaker overlaps, kept apart from the connections above.
          </p>
          <GroupList groups={view.possible} />
        </details>
      )}
    </DetailSubSection>
  );
}

function staleNote(theme: ThemeAnalysisView): string {
  return theme.supersedesThemeId
    ? "Stale: this synthesis was written for an earlier version of this theme and its membership has changed since."
    : "Stale: this theme's membership has changed since the synthesis was written.";
}

function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: 14 }}>
      <p style={LABEL}>{label}</p>
      {children}
    </div>
  );
}

function ThemeAnalysis({ theme, surfaceLabel, first }: { theme: ThemeAnalysisView; surfaceLabel: string; first: boolean }) {
  const pageNames = theme.pages.map((p) => p.label).join(", ");
  const subtitle = `${theme.memberCount} ${theme.memberCount === 1 ? "item" : "items"}${pageNames ? ` across ${pageNames}` : ""}`;
  const s = theme.sections;
  const disclosure = s && (s.connection || s.gaps) ? s : null;
  // Lane P3: a brief written BEFORE the structured-sections contract (no sections) carries the generator's
  // working numbers and raw tag slugs in its prose; one pure pass (theme-brief-text.mjs) removes exactly those.
  // A brief with sections is rendered as written, unchanged.
  const legacy = !s;
  const shownTitle = legacy && theme.title ? cleanPreContractBriefText(theme.title) : theme.title;
  return (
    <DetailSubSection title="Theme analysis" subtitle={subtitle} first={first}>
      {theme.hasBrief && theme.title && (
        <p data-guard-title style={{ ...ROW_TITLE, fontSize: "var(--fs-14)", fontWeight: 600 }}>
          {shownTitle}
        </p>
      )}
      {theme.hasBrief && theme.stale && (
        <div style={{ marginTop: 10 }}>
          <StateNote>{staleNote(theme)}</StateNote>
        </div>
      )}
      {s ? (
        <>
          {s.meaning && (
            <Block label="What it means">
              <GfmSection markdown={s.meaning} />
            </Block>
          )}
          {s.forThisPage ? (
            <Block label={`What follows on ${surfaceLabel}`}>
              <GfmSection markdown={s.forThisPage} />
            </Block>
          ) : (
            theme.ramificationsMissing && (
              <Block label={`What follows on ${surfaceLabel}`}>
                <p style={{ fontSize: "var(--fs-12)", color: "var(--ink-2)", margin: 0 }}>
                  This brief has no ramifications written for {surfaceLabel}. A new brief for this theme will add them.
                </p>
              </Block>
            )
          )}
          {s.watch && (
            <Block label="What to watch">
              <GfmSection markdown={s.watch} />
            </Block>
          )}
        </>
      ) : theme.hasBrief && theme.briefMd ? (
        <div style={{ marginTop: 10 }}>
          <GfmSection markdown={cleanPreContractBriefText(theme.briefMd)} />
        </div>
      ) : null}
      {!theme.hasBrief && theme.absence && (
        <div style={{ marginTop: 10 }}>
          <StateNote>{theme.absence}</StateNote>
        </div>
      )}
      {theme.membersByPage.length > 0 && (
        <Block label="Other items in this theme">
          {theme.membersByPage.map((g) => (
            <div key={g.surface} style={{ marginTop: 10 }}>
              <p style={LABEL}>
                {g.label}
                {g.samePage ? " (this page)" : ""} · {g.total}
              </p>
              {g.items.map((it) => (
                <a key={it.id} href={it.href} style={ROW_LINK}>
                  <p data-guard-title style={ROW_TITLE}>
                    {it.title}
                  </p>
                </a>
              ))}
              {g.moreHref && (
                <a href={g.moreHref} style={{ ...ROW_LINK, borderBottom: "none", fontSize: "var(--fs-11)", fontWeight: 700, color: "var(--ink-2)" }}>
                  and {g.total - g.items.length} more on {g.label}
                </a>
              )}
            </div>
          ))}
        </Block>
      )}
      {disclosure && (
        <details style={{ marginTop: 14 }}>
          <summary style={SUMMARY_STYLE}>How the items connect{disclosure.gaps ? " and what is missing" : ""}</summary>
          {disclosure.connection && (
            <Block label="How the items connect">
              <GfmSection markdown={disclosure.connection} />
            </Block>
          )}
          {disclosure.gaps && (
            <Block label="What is missing">
              <GfmSection markdown={disclosure.gaps} />
            </Block>
          )}
        </details>
      )}
    </DetailSubSection>
  );
}

/**
 * Which of the two trailing sections will render, decided by the SAME functions the render uses, so the
 * section index (lane IDX-1) lists a tab exactly when its section exists: a tab for an empty section would
 * jump nowhere. `connected` is the section built here (intersections or theme analysis), `inferences` is the
 * InferenceSection that follows it.
 */
export function crossPagePresence({
  surfaceKey,
  connections = [],
  resourceLookup = {},
  crossPage,
}: {
  surfaceKey: string;
  connections?: ItemConnection[];
  resourceLookup?: Record<string, { id: string; title: string; priority: string }>;
  crossPage?: CrossPageData | null;
}): { connected: boolean; inferences: boolean } {
  const intersections = buildIntersectionView(connections, resourceLookup, {
    currentSurface: surfaceKey,
    summary: crossPage?.intersectionSummary ?? null,
  });
  const visible = pickVisibleInferences(
    crossPage?.inferences?.claims ?? [],
    (v: InferenceSectionData["claims"][number]) => admissibleForInference(claimOf(v), "display").ok,
  );
  return { connected: !!intersections || !!crossPage?.theme, inferences: visible.length > 0 };
}

export function CrossPageSection({
  surfaceKey,
  surfaceLabel,
  connections = [],
  resourceLookup = {},
  crossPage,
}: {
  /** The viewing page: regulations, market, research or operations. */
  surfaceKey: string;
  /** That page's customer-facing name, e.g. "Market Intel". */
  surfaceLabel: string;
  connections?: ItemConnection[];
  resourceLookup?: Record<string, { id: string; title: string; priority: string }>;
  crossPage?: CrossPageData | null;
}) {
  const intersections = buildIntersectionView(connections, resourceLookup, {
    currentSurface: surfaceKey,
    summary: crossPage?.intersectionSummary ?? null,
  });
  const theme = crossPage?.theme ?? null;
  const inferences = <InferenceSection inferences={crossPage?.inferences} index={inferencesSectionOrd(surfaceKey)} />;
  if (!intersections && !theme) return inferences;
  return (
    <>
      <DetailSection id={CONNECTED_SECTION_ID} title="Connected intelligence" aside="Intersections and theme analysis" index={connectedSectionOrd(surfaceKey)}>
        <div data-guard-container="cross-page">
          {intersections && <IntersectionsBlock view={intersections} />}
          {theme && <ThemeAnalysis theme={theme} surfaceLabel={surfaceLabel} first={!intersections} />}
        </div>
      </DetailSection>
      {inferences}
    </>
  );
}
