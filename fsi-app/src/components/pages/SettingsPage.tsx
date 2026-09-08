"use client";

import { useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import type { Resource, Supersession } from "@/types/resource";
import { useSettingsStore } from "@/stores/settingsStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useResourceStore } from "@/stores/resourceStore";
import { ALL_SECTORS } from "@/lib/constants";
import { Masthead } from "@/components/ui/Masthead";
import { TabRow, type TabRowItem } from "@/components/ui/TabRow";
import { SectionIndex, type SectionIndexEntry } from "@/components/detail/DetailShell";
import { nowFrom } from "@/lib/render-now";
import { formatLocaleDate } from "@/lib/format";
import {
  AccountCard,
  HonestFrame,
  Chip,
  ToggleSwitch,
} from "@/components/account/AccountPrimitives";
import { NotificationPreferences } from "@/components/profile/NotificationPreferences";
import { BriefingScheduleSection } from "@/components/settings/BriefingScheduleSection";
import { usePersonalStateHydration } from "@/lib/hooks/usePersonalState";

// ───────────────────────────────────────────────────────────────────────────
// SettingsPage — Account · Settings (redesign T10, HANDOFF §6.10).
// Rebuilt against "Pages - 10 Account". The General tab carries dashboard
// settings, the full 40-sector grid, notifications, and the briefing
// schedule; the remaining tabs reuse the existing data components inside
// the redesigned card chrome. Store wiring (settingsStore / workspaceStore
// / NotificationPreferences / BriefingScheduleSection) is unchanged — only
// the presentation follows the mock.
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
// `key` doubles as the anchor id every card below is mounted under.
// Addendum item 7 (2026-09-07, docs/design/handoff-2026-09-06/DEVIATION-LOG.md): notification
// preferences move off the profile page and become their own anchored "Notifications" section,
// placed immediately after General — a sixth SectionIndex entry alongside R9's original five.
const SETTINGS_SECTIONS: SectionIndexEntry[] = [
  { id: "general", label: "General" },
  { id: "notifications", label: "Notifications" },
  { id: "saved", label: "Saved searches" },
  { id: "data", label: "Data & supersessions" },
  { id: "archive", label: "Archive" },
  { id: "help", label: "Help" },
];

const HOME_SECTIONS: Array<{ key: string; label: string }> = [
  { key: "SummaryStrip", label: "Summary strip" },
  { key: "WeeklyBriefing", label: "Weekly briefing" },
  { key: "WhatChanged", label: "What changed" },
  { key: "TopUrgency", label: "Top urgency" },
  { key: "DueThisQuarter", label: "Due this quarter" },
  { key: "Supersessions", label: "Supersessions" },
];

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
  // Archive tab rendered "No archived resources" directly under a header
  // saying "N items · still recoverable", and the tab only worked after a
  // client-side nav from a surface that does hydrate. Same pair HomeSurface
  // and RegulationsLedger already use, not a second mechanism.
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
  // initialArchived would gate the Archive tab shut for someone whose only
  // archived items are personal — the restore path would be unreachable.
  // Zero personal rows reproduces the previous count exactly.
  const personalArchivedCount = useResourceStore(
    (s) =>
      [...s.personalState.values()].filter(
        (p) => p.isArchived && !s.archived.some((r) => r.id === p.itemId)
      ).length
  );
  const archiveCount = initialArchived.length + personalArchivedCount;

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
  // (ruling R9) — the settings' own five second-level items are anchored
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
          dek="Dashboard defaults, freight sectors, notifications, briefing schedule."
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
            linkLabel: "See audit log →",
          }}
        />
      </div>
      <div style={{ padding: "16px 40px 0" }}>
        <TabRow tabs={accountTabs} ariaLabel="Account sections" />
      </div>
      <div style={{ padding: "16px 40px 80px" }}>
        <SectionIndex sections={SETTINGS_SECTIONS} />

        <div id="general" style={{ scrollMarginTop: 56, display: "grid", gap: 16, marginBottom: 32 }}>
          <DashboardSettingsCard />
          <FreightSectorsCard />
          <AccountCard title="Briefing schedule" meta="Cadence · time · jurisdictions · delivery">
            <BriefingScheduleSection />
          </AccountCard>
        </div>

        <div id="notifications" style={{ scrollMarginTop: 56, marginBottom: 32 }}>
          <AccountCard title="Notifications" meta="In-app channel available now · email and push coming soon">
            <p style={{ fontSize: "11.5px", color: "var(--color-text-secondary)", margin: "0 0 4px" }}>
              Choose what gets your attention. Conservative by default — higher-volume notifications are off
              until you opt in.
            </p>
            <NotificationPreferences userId={userId} />
          </AccountCard>
        </div>

        <div id="saved" style={{ scrollMarginTop: 56, marginBottom: 32 }}>
          <AccountCard title="Saved searches" meta="Named filter combinations · stored locally" maxWidth={720}>
            <SavedSearchesSection />
          </AccountCard>
        </div>

        <div id="data" style={{ scrollMarginTop: 56, display: "grid", gap: 16, marginBottom: 32 }}>
          <AccountCard title="Data summary">
            <DataSummary resources={initialResources} archived={initialArchived} />
          </AccountCard>
          <AccountCard
            title="Upload operational data (CSV)"
            meta="Surcharge audits · DQI · auxiliary energy · EUDR claims · custody chains · indexation terms"
          >
            <Spec09CsvUpload />
          </AccountCard>
          <AccountCard title="Supersession history">
            <SupersessionHistory supersessions={supersessions} resourceMap={resourceMap} />
          </AccountCard>
        </div>

        <div id="archive" style={{ scrollMarginTop: 56, marginBottom: 32 }}>
          <AccountCard
            title="Archive"
            meta={`${archiveCount} item${archiveCount !== 1 ? "s" : ""} · still recoverable`}
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

// ── General · Dashboard settings ────────────────────────────────────────────

function LabelRow({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: "9.5px",
        fontWeight: 800,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "var(--color-text-muted)",
        margin: "0 0 8px",
      }}
    >
      {children}
    </p>
  );
}

function DashboardSettingsCard() {
  const defaultSort = useSettingsStore((s) => s.defaultSort);
  const setDefaultSort = useSettingsStore((s) => s.setDefaultSort);
  const exportFormat = useSettingsStore((s) => s.exportFormat);
  const setExportFormat = useSettingsStore((s) => s.setExportFormat);
  const alertPriorities = useSettingsStore((s) => s.alertPriorities);
  const setAlertPriorities = useSettingsStore((s) => s.setAlertPriorities);
  const toggleSection = useSettingsStore((s) => s.toggleSection);
  const showSummaryStrip = useSettingsStore((s) => s.showSummaryStrip);
  const showWeeklyBriefing = useSettingsStore((s) => s.showWeeklyBriefing);
  const showWhatChanged = useSettingsStore((s) => s.showWhatChanged);
  const showTopUrgency = useSettingsStore((s) => s.showTopUrgency);
  const showDueThisQuarter = useSettingsStore((s) => s.showDueThisQuarter);
  const showSupersessions = useSettingsStore((s) => s.showSupersessions);
  const sectionState: Record<string, boolean> = {
    showSummaryStrip,
    showWeeklyBriefing,
    showWhatChanged,
    showTopUrgency,
    showDueThisQuarter,
    showSupersessions,
  };

  const sortOpts: Array<{ id: typeof defaultSort; label: string }> = [
    { id: "urgency", label: "Urgency" },
    { id: "priority", label: "Priority" },
    { id: "alpha", label: "Alpha" },
    { id: "added", label: "Added" },
  ];
  const priorityOpts = ["CRITICAL", "HIGH", "MODERATE", "LOW"];

  return (
    <AccountCard title="Dashboard settings">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px 32px" }} className="cl-set-grid">
        <style>{`@media (max-width: 720px){ .cl-set-grid{ grid-template-columns:1fr !important; } }`}</style>
        <div>
          <LabelRow>Appearance</LabelRow>
          <div style={{ display: "flex", gap: 6 }}>
            <Chip label="Light" on onClick={() => {}} />
          </div>
          <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: "6px 0 0" }}>
            Light only. There is one theme; the product reads like a printed ledger and stays that way.
          </p>
        </div>
        <div>
          <LabelRow>Default sort</LabelRow>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {sortOpts.map((o) => (
              <Chip key={o.id} label={o.label} on={defaultSort === o.id} onClick={() => setDefaultSort(o.id)} />
            ))}
          </div>
        </div>
        <div>
          <LabelRow>Default export format</LabelRow>
          <div style={{ display: "flex", gap: 6 }}>
            <Chip label="HTML" on={exportFormat === "html"} onClick={() => setExportFormat("html")} />
            <Chip label="Slack" on={exportFormat === "slack"} onClick={() => setExportFormat("slack")} />
          </div>
        </div>
        <div>
          <LabelRow>Alert priorities</LabelRow>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {priorityOpts.map((p) => {
              const on = alertPriorities.includes(p);
              return (
                <Chip
                  key={p}
                  label={p.charAt(0) + p.slice(1).toLowerCase()}
                  on={on}
                  onClick={() =>
                    setAlertPriorities(on ? alertPriorities.filter((x) => x !== p) : [...alertPriorities, p])
                  }
                />
              );
            })}
          </div>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <LabelRow>Home sections</LabelRow>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px 24px" }} className="cl-home-grid">
            <style>{`@media (max-width: 720px){ .cl-home-grid{ grid-template-columns:1fr !important; } }`}</style>
            {HOME_SECTIONS.map((h) => {
              const on = sectionState[`show${h.key}`];
              return (
                <div
                  key={h.key}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                    minHeight: 44,
                    padding: "0 2px",
                    borderBottom: "1px solid var(--color-border-subtle)",
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)" }}>{h.label}</span>
                  <ToggleSwitch on={on} onFlip={() => toggleSection(h.key)} label={`Show ${h.label}`} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AccountCard>
  );
}

// ── General · Freight sectors (40-checkbox grid) ────────────────────────────

function FreightSectorsCard() {
  const sectorProfile = useWorkspaceStore((s) => s.sectorProfile);
  const setSectorProfile = useWorkspaceStore((s) => s.setSectorProfile);

  const toggle = (id: string) =>
    setSectorProfile(sectorProfile.includes(id) ? sectorProfile.filter((x) => x !== id) : [...sectorProfile, id]);

  return (
    <AccountCard
      title="Freight sectors"
      meta={
        <span style={{ display: "flex", gap: 14, alignItems: "baseline" }}>
          <span>{sectorProfile.length} selected</span>
          <button
            type="button"
            onClick={() => setSectorProfile(ALL_SECTORS.map((s) => s.id))}
            style={{ fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 800, color: "var(--color-primary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            Select all
          </button>
          <button
            type="button"
            onClick={() => setSectorProfile([])}
            style={{ fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 800, color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            Clear
          </button>
        </span>
      }
      bodyPad={false}
    >
      <p style={{ fontSize: "11.5px", color: "var(--color-text-secondary)", margin: 0, padding: "12px 20px 0" }}>
        Select the sectors your organization operates in. This filters your default view, briefings, and
        urgency scoring.
      </p>
      <div
        style={{
          padding: "14px 20px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
          gap: 8,
        }}
      >
        {ALL_SECTORS.map((sector) => {
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
                gap: 9,
                padding: "9px 12px",
                borderRadius: 6,
                width: "100%",
                textAlign: "left",
                background: on ? "var(--color-bg-ai-strip)" : "var(--surface)",
                border: on ? "1px solid var(--color-active-border)" : "1px solid var(--color-border)",
                color: "var(--color-text-primary)",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 4,
                  flexShrink: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 800,
                  color: "#FFFFFF",
                  background: on ? "var(--color-primary)" : "var(--surface)",
                  border: on ? "1px solid var(--color-primary)" : "1px solid var(--color-border-strong)",
                }}
              >
                {on ? "✓" : ""}
              </span>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{sector.label}</span>
            </button>
          );
        })}
      </div>
    </AccountCard>
  );
}
