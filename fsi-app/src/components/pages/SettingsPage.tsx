"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { Resource, Supersession } from "@/types/resource";
import { useSettingsStore, type DashboardRegionKey } from "@/stores/settingsStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useResourceStore } from "@/stores/resourceStore";
import { ALL_SECTORS } from "@/lib/constants";
import { BAND_ORDER, type PlatformPriority } from "@/lib/urgency/bands";
import { Masthead } from "@/components/ui/Masthead";
import { TabRow, type TabRowItem } from "@/components/ui/TabRow";
import { SectionIndex, type SectionIndexEntry } from "@/components/detail/DetailShell";
import { RailCard } from "@/components/list-surface/ListSurfaceRailCards";
import { nowFrom } from "@/lib/render-now";
import { formatLocaleDate, formatNumber } from "@/lib/format";
import {
  AccountCard,
  HonestFrame,
  SegmentedControl,
  ToggleSwitch,
  type SegmentedOption,
} from "@/components/account/AccountPrimitives";
import { NotificationPreferences } from "@/components/profile/NotificationPreferences";
import { BriefingScheduleSection } from "@/components/settings/BriefingScheduleSection";
import { usePersonalStateHydration } from "@/lib/hooks/usePersonalState";
import type { ListSurfaceSortKey } from "@/components/list-surface/list-surface-helpers";

// ───────────────────────────────────────────────────────────────────────────
// SettingsPage — /settings, artboard 15 (docs/design/handoff-2026-09-06/
// screens/15-settings.png, dc.html id="p15").
//
// The artboard composes TWO columns under the merged Account tab row:
//   left  (minmax(0,1fr), gap 18) — Dashboard defaults · Freight sectors ·
//                                   Notifications
//   right (300px, gap 14)         — Briefing schedule · Appearance ·
//                                   Data & supersessions
// Ruling R9 keeps the S1..S6 section index directly below the tab row, and
// the five app features the artboard draws no region for (Saved searches,
// Data summary, CSV upload, Supersession history, Archive, Help) stay as
// anchored sections BELOW the two designed columns — ruling R7's "leave it
// and list it", placed after the last designed region of the column.
//
// Every card is a shared part: AccountCard for the left column's plates,
// RailCard (the list surfaces' own rail card) for the right column's,
// SegmentedControl / ToggleSwitch from AccountPrimitives for the controls.
// ───────────────────────────────────────────────────────────────────────────

const DataSummary = dynamic(() => import("@/components/settings/DataSummary").then((m) => ({ default: m.DataSummary })), { ssr: false });
const SupersessionHistory = dynamic(() => import("@/components/settings/SupersessionHistory").then((m) => ({ default: m.SupersessionHistory })), { ssr: false });
const ArchiveViewer = dynamic(() => import("@/components/settings/ArchiveViewer").then((m) => ({ default: m.ArchiveViewer })), { ssr: false });
const SavedSearchesSection = dynamic(() => import("@/components/settings/SavedSearchesSection").then((m) => ({ default: m.SavedSearchesSection })), { ssr: false });
const Spec09CsvUpload = dynamic(() => import("@/components/settings/Spec09CsvUpload").then((m) => ({ default: m.Spec09CsvUpload })), { ssr: false });

interface Props {
  initialResources: Resource[];
  initialArchived: Resource[];
  supersessions: Supersession[];
  userId: string;
  userEmail?: string;
  /** Server render instant (src/lib/render-now.ts). */
  nowIso?: string;
}

// Ruling R9 (2026-09-07, docs/design/handoff-2026-09-06/DEVIATION-LOG.md): the five second-level
// items become anchored SECTIONS in one scrolling page, reusing the sticky S1 . S2 . S3 SectionIndex
// from the detail architecture (src/components/detail/DetailShell.tsx) rather than a second tab row.
// `key` doubles as the anchor id every card below is mounted under. Operator ruling 1 (2026-09-07,
// second set): "Settings section index: keep as built. R9 stands."
// Addendum item 7 (2026-09-07): notification preferences are their own anchored section, after
// General — a sixth entry alongside R9's original five.
const SETTINGS_SECTIONS: SectionIndexEntry[] = [
  { id: "general", label: "General" },
  { id: "notifications", label: "Notifications" },
  { id: "saved", label: "Saved searches" },
  { id: "data", label: "Data & supersessions" },
  { id: "archive", label: "Archive" },
  { id: "help", label: "Help" },
];

/** dc.html p15's "Show all N sectors" disclosure draws twelve chips collapsed. The count in the
 *  artboard's own label is its mock corpus; the live list is `ALL_SECTORS`. */
const COLLAPSED_SECTOR_COUNT = 12;

export function SettingsPage({ initialResources, initialArchived, supersessions, userId, userEmail = "", nowIso }: Props) {

  const resourceMap = useMemo(() => {
    const map = new Map<string, Resource>();
    initialResources.forEach((r) => map.set(r.id, r));
    initialArchived.forEach((r) => map.set(r.id, r));
    return map;
  }, [initialResources, initialArchived]);

  // ── Hydrate the shared resource store ──
  // ArchiveViewer takes no props: it reads `archived`, `resources`, and
  // `personalState` straight off the store. Nothing on this page put them
  // there. On a hard load of /settings the store was still empty, so the
  // Archive section rendered "No archived resources" directly under a header
  // saying "N items · still recoverable". Same pair HomeSurface and
  // RegulationsLedger already use, not a second mechanism.
  //
  // Actions are read as individual selectors rather than by destructuring the
  // whole store: this component already subscribes narrowly below, and a
  // whole-store subscription would re-render the entire settings surface on
  // every unrelated store write.
  const setResources = useResourceStore((s) => s.setResources);
  const setArchived = useResourceStore((s) => s.setArchived);

  useEffect(() => {
    setResources(initialResources);
    setArchived(initialArchived);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialResources, initialArchived]);

  // Personal archive layer (migration 235). user_item_state is per-user so it
  // is fetched client-side, not carried on the SSR payload. Without this the
  // personalArchivedCount selector below is permanently 0, which makes the
  // restore path unreachable for anyone whose only archived items are personal
  // — the exact case the count was written to cover.
  usePersonalStateHydration();

  // Dual-scope archive (migration 235): items this user archived for themselves
  // live in user_item_state, not in the org-scoped SSR payload. Counting only
  // initialArchived would gate the Archive section shut for someone whose only
  // archived items are personal — the restore path would be unreachable.
  // Zero personal rows reproduces the previous count exactly.
  const personalArchivedCount = useResourceStore(
    (s) =>
      [...s.personalState.values()].filter(
        (p) => p.isArchived && !s.archived.some((r) => r.id === p.itemId)
      ).length
  );
  const archiveCount = initialArchived.length + personalArchivedCount;

  // dc.html p15 scope line: "... briefing schedule · scoped to <b>Dietl / Rockit</b>".
  const orgName = useWorkspaceStore((s) => s.orgName);

  const dateLabel = formatLocaleDate(nowFrom(nowIso), {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  // Merged Account tab row (README screen 15: "a sub-tab of Account, same
  // frame" — the same eight-entry row UserProfilePage renders, "Settings"
  // active here). The first seven are real links back to /profile,
  // carrying the tab to restore via `?tab=`; see that component's own
  // header for the shared contract. Below it: ONE tab row on the page
  // (ruling R9) — the settings' own second-level items are anchored
  // sections under a sticky SectionIndex, not a second tab row.
  const accountTabs: TabRowItem[] = [
    { key: "personal", label: "Personal", href: "/profile?tab=personal" },
    { key: "organization", label: "Organization", href: "/profile?tab=organization" },
    { key: "members", label: "Members & roles", href: "/profile?tab=members" },
    { key: "sectors", label: "Sector profile", href: "/profile?tab=sectors" },
    { key: "jurisdictions", label: "Jurisdictions", href: "/profile?tab=jurisdictions" },
    { key: "verifier", label: "Verifier badge", href: "/profile?tab=verifier" },
    { key: "activity", label: "Activity", href: "/profile?tab=activity" },
    { key: "settings", label: "Settings", active: true },
  ];

  return (
    <div>
      <div style={{ padding: "20px 40px 0" }}>
        <Masthead
          title="Settings"
          dateLabel={dateLabel}
          eyebrowSuffix="Personal"
          dek={
            <>
              Dashboard defaults, freight sectors, notifications, briefing schedule
              {orgName ? (
                <>
                  {" · scoped to "}
                  {/* The workspace name wraps as ONE unit: "Dietl / Rockit" broken across a line
                      leaves "Rockit" alone, exactly the orphan the operator ruled out on
                      2026-09-07 ("balance the lines"). */}
                  <b style={{ color: "var(--color-text-primary)", whiteSpace: "nowrap" }}>{orgName}</b>
                </>
              ) : null}
            </>
          }
          commandBar={{
            itemCount: 0,
            scope: "settings",
            placeholder: 'Search settings — or ask "how do I change my briefing day?"',
          }}
          notice={{
            text: (
              <>
                <b>Applies workspace-wide</b> · changes here affect every member, not just you
              </>
            ),
            // DEFECT 5 (lane opsclip, train 61): "See audit log →" shipped as <a href="#"> and did
            // nothing. There is no audit-log route and no audit-log table in the product
            // [CONFIRMED: src/app has no such route, and the only `audit` identifiers in src/ are
            // admin-side verification helpers], so per ruling 1.1's class the link is removed and
            // the notice text stands on its own. It comes back the day the surface exists, as a
            // `linkHref`, which Masthead now requires before it will render any link at all.
          }}
        />
      </div>
      <div style={{ padding: "16px 40px 0" }}>
        <TabRow tabs={accountTabs} ariaLabel="Account sections" />
      </div>
      <div style={{ padding: "16px 40px 0" }}>
        <SectionIndex sections={SETTINGS_SECTIONS} />
      </div>

      {/* dc.html p15: `padding:18px 40px 40px; grid-template-columns:minmax(0,1fr) 300px; gap:28px;
          align-items:start`. */}
      <div
        data-audit="settings-columns"
        style={{
          padding: "18px 40px 0",
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) 300px",
          gap: 28,
          alignItems: "start",
        }}
        className="cl-settings-columns"
      >
        <style>{`@media (max-width: 1100px){ .cl-settings-columns{ grid-template-columns:1fr !important; } }`}</style>

        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 18 }}>
          <div id="general" data-audit="settings-defaults" style={{ scrollMarginTop: 56 }}>
            <DashboardDefaultsCard />
          </div>
          <div data-audit="settings-sectors">
            <FreightSectorsCard />
          </div>
          <div id="notifications" data-audit="settings-notifications" style={{ scrollMarginTop: 56 }}>
            <AccountCard title="Notifications" meta="In-app now · email and push coming" bodyPadding="4px 16px 10px">
              <NotificationPreferences userId={userId} />
            </AccountCard>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <RailCard title="Briefing schedule" dataAudit="settings-briefing">
            <BriefingScheduleSection />
          </RailCard>
          <RailCard title="Appearance" dataAudit="settings-appearance">
            <p style={{ fontSize: 12, lineHeight: 1.5, color: "var(--color-text-secondary)", margin: 0 }}>
              Light only. There is one theme; the product reads like a printed ledger and stays that way.
            </p>
          </RailCard>
          <DataAndSupersessionsRailCard />
        </div>
      </div>

      {/* Ruling R7: features the artboard draws no region for stay exactly as they are, placed
          after the last designed region of the column. */}
      <div style={{ padding: "18px 40px 80px", display: "grid", gap: 24 }}>
        <div id="saved" style={{ scrollMarginTop: 56 }}>
          <AccountCard title="Saved searches" meta="Named filter combinations · stored locally" bodyPadding="14px 16px 16px">
            <SavedSearchesSection />
          </AccountCard>
        </div>

        <div id="data" style={{ scrollMarginTop: 56, display: "grid", gap: 16 }}>
          <AccountCard title="Data summary" bodyPadding="14px 16px 16px">
            <DataSummary resources={initialResources} archived={initialArchived} />
          </AccountCard>
          <AccountCard
            title="Upload operational data (CSV)"
            meta="Surcharge audits · DQI · auxiliary energy · EUDR claims · custody chains · indexation terms"
            bodyPadding="14px 16px 16px"
          >
            <Spec09CsvUpload />
          </AccountCard>
          <AccountCard title="Supersession history" bodyPadding="14px 16px 16px">
            <SupersessionHistory supersessions={supersessions} resourceMap={resourceMap} />
          </AccountCard>
        </div>

        <div id="archive" style={{ scrollMarginTop: 56 }}>
          <AccountCard
            title="Archive"
            meta={`${archiveCount} item${archiveCount !== 1 ? "s" : ""} · still recoverable`}
            bodyPadding="14px 16px 16px"
          >
            {archiveCount === 0 ? (
              <p style={{ fontSize: 12, lineHeight: 1.6, color: "var(--color-text-secondary)", margin: 0 }}>
                Nothing archived. Briefs you archive and items you dismiss collect here, out of the working
                view but never deleted.
              </p>
            ) : (
              <ArchiveViewer />
            )}
          </AccountCard>
        </div>

        <div id="help" style={{ scrollMarginTop: 56 }}>
          <HonestFrame heading="Help centre pending">
            Documentation and contact routes land here. Until then, workspace owners reach the team through
            the onboarding channel.
          </HonestFrame>
        </div>
      </div>
    </div>
  );
}

// ── Left column 1 · Dashboard defaults ──────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        // dc.html p15 field label: 10px / .12em / 700 uppercase, 6px below.
        fontSize: "10px",
        fontWeight: 700,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "var(--color-text-muted)",
        margin: "0 0 6px",
      }}
    >
      {children}
    </p>
  );
}

/** dc.html p15 "Default sort": the list surfaces' own three sorts, same words, same order. */
const SORT_OPTIONS: ReadonlyArray<SegmentedOption<ListSurfaceSortKey>> = [
  { id: "next-date", label: "Next date" },
  { id: "newest", label: "Newest" },
  { id: "az", label: "A-Z" },
];

/** dc.html p15 "Default export". The artboard draws a third "PDF" segment; `exportFormat` has no
 *  `pdf` value and no PDF export path exists anywhere in the app, so a PDF segment would be a
 *  control with nothing behind it (DEVIATION-LOG 2026-09-08, lane settings60). */
const EXPORT_OPTIONS: ReadonlyArray<SegmentedOption<"html" | "slack">> = [
  { id: "html", label: "HTML" },
  { id: "slack", label: "Slack" },
];

/** dc.html p15 "Alert bands": the artboard's three words are the urgency vocabulary itself, so the
 *  segments come from BAND_ORDER rather than a fourth hand-typed label set. `alertPriorities`
 *  stores the platform priority scale; bands.ts is the one place that maps between them. */
const ALERT_BAND_OPTIONS: ReadonlyArray<SegmentedOption<PlatformPriority>> = BAND_ORDER.filter(
  (b) => b.key !== "awareness",
).map((b) => ({ id: b.priority, label: b.label }));

/** dc.html p15's toggle grid, in the artboard's order. Each label is a region the rebuilt dashboard
 *  actually renders (DashboardBrief: band tiles → Due next → What changed; rail = Across the
 *  platform, Watchlist, Legend), which is why settingsStore carries these names. */
const DASHBOARD_REGIONS: ReadonlyArray<{ key: DashboardRegionKey; label: string }> = [
  { key: "BandTiles", label: "Band tiles" },
  { key: "DueNext", label: "Due next" },
  { key: "WhatChanged", label: "What changed" },
  { key: "WatchlistRail", label: "Watchlist rail" },
  { key: "AcrossPlatform", label: "Across the platform" },
  { key: "Supersessions", label: "Supersessions" },
];

function DashboardDefaultsCard() {
  const defaultSort = useSettingsStore((s) => s.defaultSort);
  const setDefaultSort = useSettingsStore((s) => s.setDefaultSort);
  const exportFormat = useSettingsStore((s) => s.exportFormat);
  const setExportFormat = useSettingsStore((s) => s.setExportFormat);
  const alertPriorities = useSettingsStore((s) => s.alertPriorities);
  const setAlertPriorities = useSettingsStore((s) => s.setAlertPriorities);
  const toggleSection = useSettingsStore((s) => s.toggleSection);
  const showBandTiles = useSettingsStore((s) => s.showBandTiles);
  const showDueNext = useSettingsStore((s) => s.showDueNext);
  const showWhatChanged = useSettingsStore((s) => s.showWhatChanged);
  const showWatchlistRail = useSettingsStore((s) => s.showWatchlistRail);
  const showAcrossPlatform = useSettingsStore((s) => s.showAcrossPlatform);
  const showSupersessions = useSettingsStore((s) => s.showSupersessions);
  const regionState: Record<DashboardRegionKey, boolean> = {
    BandTiles: showBandTiles,
    DueNext: showDueNext,
    WhatChanged: showWhatChanged,
    WatchlistRail: showWatchlistRail,
    AcrossPlatform: showAcrossPlatform,
    Supersessions: showSupersessions,
  };

  return (
    <AccountCard title="Dashboard defaults" meta="Applies on every load" bodyPad={false}>
      {/* dc.html p15: `padding:14px 16px 16px; grid-template-columns:repeat(3,1fr); gap:16px`. */}
      <div
        style={{ padding: "14px 16px 16px", display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 16 }}
        className="cl-set-controls"
      >
        <style>{`@media (max-width: 720px){ .cl-set-controls{ grid-template-columns:1fr !important; } .cl-set-toggles{ grid-template-columns:1fr !important; } }`}</style>
        <div className="cl-set-control-cell" style={{ minWidth: 0 }}>
          <FieldLabel>Default sort</FieldLabel>
          <SegmentedControl
            options={SORT_OPTIONS}
            selected={[defaultSort]}
            onSelect={setDefaultSort}
            ariaLabel="Default sort"
          />
        </div>
        <div className="cl-set-control-cell" style={{ minWidth: 0 }}>
          <FieldLabel>Default export</FieldLabel>
          <SegmentedControl
            options={EXPORT_OPTIONS}
            selected={[exportFormat]}
            onSelect={setExportFormat}
            ariaLabel="Default export"
          />
        </div>
        <div className="cl-set-control-cell" style={{ minWidth: 0 }}>
          <FieldLabel>Alert bands</FieldLabel>
          <SegmentedControl
            multiple
            options={ALERT_BAND_OPTIONS}
            selected={alertPriorities as PlatformPriority[]}
            onSelect={(id) =>
              setAlertPriorities(
                alertPriorities.includes(id)
                  ? alertPriorities.filter((x) => x !== id)
                  : [...alertPriorities, id],
              )
            }
            ariaLabel="Alert bands"
          />
        </div>
      </div>
      {/* dc.html p15: `padding:0 16px 14px; grid-template-columns:repeat(3,1fr); gap:0 24px`, each
          row `min-height:44px` with a hairline under it. */}
      <div
        style={{ padding: "0 16px 14px", display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: "0 24px" }}
        className="cl-set-toggles"
      >
        {DASHBOARD_REGIONS.map((region) => (
          <div
            key={region.key}
            className="cl-set-toggle-row"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
              minHeight: 44,
              borderBottom: "1px solid rgba(0,0,0,.06)",
              fontSize: "12.5px",
              color: "var(--color-text-primary)",
            }}
          >
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {region.label}
            </span>
            <ToggleSwitch
              on={regionState[region.key]}
              onFlip={() => toggleSection(region.key)}
              label={`Show ${region.label}`}
            />
          </div>
        ))}
      </div>
    </AccountCard>
  );
}

// ── Left column 2 · Freight sectors ─────────────────────────────────────────

function FreightSectorsCard() {
  const sectorProfile = useWorkspaceStore((s) => s.sectorProfile);
  const setSectorProfile = useWorkspaceStore((s) => s.setSectorProfile);
  const [expanded, setExpanded] = useState(false);

  const toggle = (id: string) =>
    setSectorProfile(sectorProfile.includes(id) ? sectorProfile.filter((x) => x !== id) : [...sectorProfile, id]);

  // dc.html p15's collapsed grid draws the selected sectors first, then fills to twelve from the
  // rest of the list in its own order. The artboard's own twelve are a sample of a 36-sector mock;
  // the live list is ALL_SECTORS.
  const visible = useMemo(() => {
    if (expanded) return ALL_SECTORS;
    const selected = ALL_SECTORS.filter((s) => sectorProfile.includes(s.id));
    const rest = ALL_SECTORS.filter((s) => !sectorProfile.includes(s.id));
    return [...selected, ...rest].slice(0, COLLAPSED_SECTOR_COUNT);
  }, [expanded, sectorProfile]);

  const linkStyle = {
    fontFamily: "var(--font-sans)",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--color-text-primary)",
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 0,
    minHeight: 24,
    textDecoration: "underline",
    textDecorationColor: "rgba(0,0,0,.3)",
  } as const;

  return (
    <AccountCard
      title="Freight sectors"
      meta={`${sectorProfile.length} selected · filters your default view, briefings and relevance scoring`}
      bodyPadding="14px 16px 16px"
      foot={
        <>
          <button type="button" onClick={() => setExpanded((v) => !v)} style={linkStyle}>
            {expanded ? "Show fewer sectors" : `Show all ${formatNumber(ALL_SECTORS.length)} sectors`}
          </button>
          <span style={{ color: "var(--color-text-muted)", display: "inline-flex", gap: 6, alignItems: "center" }}>
            <button
              type="button"
              onClick={() => setSectorProfile(ALL_SECTORS.map((s) => s.id))}
              style={{ ...linkStyle, color: "var(--color-text-muted)", textDecoration: "none" }}
            >
              Select all
            </button>
            ·
            <button
              type="button"
              onClick={() => setSectorProfile([])}
              style={{ ...linkStyle, color: "var(--color-text-muted)", textDecoration: "none" }}
            >
              Clear
            </button>
          </span>
        </>
      }
    >
      {/* dc.html p15: `grid-template-columns:repeat(4,1fr); gap:8px`, each chip `8px 10px` with a
          13px square box. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 8 }} className="cl-sector-grid">
        <style>{`@media (max-width: 900px){ .cl-sector-grid{ grid-template-columns:repeat(2, minmax(0,1fr)) !important; } }`}</style>
        {visible.map((sector) => {
          const on = sectorProfile.includes(sector.id);
          return (
            <button
              key={sector.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(sector.id)}
              style={{
                fontFamily: "var(--font-sans)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                minHeight: 44,
                borderRadius: 6,
                width: "100%",
                textAlign: "left",
                fontSize: "12.5px",
                background: on ? "var(--color-surface-raised)" : "var(--surface)",
                border: on ? "1px solid var(--color-primary)" : "1px solid var(--color-border)",
                color: "var(--color-text-primary)",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 13,
                  height: 13,
                  borderRadius: 3,
                  flex: "none",
                  boxSizing: "border-box",
                  background: on ? "var(--color-primary)" : "var(--surface)",
                  border: on ? "1.5px solid var(--color-primary)" : "1.5px solid var(--color-border-strong)",
                }}
              />
              <span style={{ minWidth: 0 }}>{sector.label}</span>
            </button>
          );
        })}
      </div>
    </AccountCard>
  );
}

// ── Right column 3 · Data & supersessions ───────────────────────────────────

/** Saved searches have no table (SavedSearchesSection: `fsi-saved-searches` in localStorage), so
 *  the count is only knowable after mount. Null renders the skeleton the handoff requires for a
 *  count still loading — never a 0, which would be a fact. */
function useSavedSearchCount(): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("fsi-saved-searches");
      const parsed = raw ? JSON.parse(raw) : [];
      setCount(Array.isArray(parsed) ? parsed.length : 0);
    } catch {
      setCount(0);
    }
  }, []);
  return count;
}

function DataAndSupersessionsRailCard() {
  const savedCount = useSavedSearchCount();
  const linkStyle = {
    fontSize: "12.5px",
    fontWeight: 600,
    color: "var(--color-text-primary)",
    minHeight: 24,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  } as const;

  return (
    <RailCard title="Data & supersessions" dataAudit="settings-data-links">
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <a href="#saved" style={linkStyle}>
          Saved searches ·{" "}
          {savedCount === null ? (
            <span
              aria-label="Saved search count loading"
              style={{ display: "inline-block", width: 16, height: 10, background: "var(--tag)", borderRadius: 4 }}
            />
          ) : (
            formatNumber(savedCount)
          )}
        </a>
        <a href="#data" style={linkStyle}>
          Data summary
        </a>
        <a href="#archive" style={linkStyle}>
          Archive
        </a>
      </div>
    </RailCard>
  );
}
