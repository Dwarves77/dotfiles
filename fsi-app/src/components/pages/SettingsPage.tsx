"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { Resource, Supersession } from "@/types/resource";
import { useSettingsStore } from "@/stores/settingsStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { ALL_SECTORS } from "@/lib/constants";
import { AccountMasthead } from "@/components/account/AccountMasthead";
import {
  SubTabBar,
  type SubTab,
  AccountCard,
  HonestFrame,
  Chip,
  ToggleSwitch,
} from "@/components/account/AccountPrimitives";
import { NotificationPreferences } from "@/components/profile/NotificationPreferences";
import { BriefingScheduleSection } from "@/components/settings/BriefingScheduleSection";

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

interface Props {
  initialResources: Resource[];
  initialArchived: Resource[];
  supersessions: Supersession[];
  userId: string;
  userEmail?: string;
}

type TabKey = "general" | "saved" | "data" | "archive" | "help";

const TABS: SubTab<TabKey>[] = [
  { key: "general", label: "General" },
  { key: "saved", label: "Saved searches" },
  { key: "data", label: "Data & supersessions" },
  { key: "archive", label: "Archive" },
  { key: "help", label: "Help" },
];

const LEGACY_HASH_ALIASES: Record<string, TabKey> = {
  notifications: "general",
  briefing: "general",
  dashboard: "general",
  exports: "general",
};

const HOME_SECTIONS: Array<{ key: string; label: string }> = [
  { key: "SummaryStrip", label: "Summary strip" },
  { key: "WeeklyBriefing", label: "Weekly briefing" },
  { key: "WhatChanged", label: "What changed" },
  { key: "TopUrgency", label: "Top urgency" },
  { key: "DueThisQuarter", label: "Due this quarter" },
  { key: "Supersessions", label: "Supersessions" },
];

export function SettingsPage({ initialResources, initialArchived, supersessions, userId, userEmail = "" }: Props) {
  const initialTab: TabKey = useMemo(() => {
    if (typeof window === "undefined") return "general";
    const h = window.location.hash.replace(/^#/, "");
    if (TABS.some((t) => t.key === h)) return h as TabKey;
    if (h in LEGACY_HASH_ALIASES) return LEGACY_HASH_ALIASES[h];
    return "general";
  }, []);
  const [tab, setTab] = useState<TabKey>(initialTab);

  const resourceMap = useMemo(() => {
    const map = new Map<string, Resource>();
    initialResources.forEach((r) => map.set(r.id, r));
    initialArchived.forEach((r) => map.set(r.id, r));
    return map;
  }, [initialResources, initialArchived]);

  const onTabClick = (key: TabKey) => {
    setTab(key);
    if (typeof window !== "undefined") history.replaceState(null, "", `#${key}`);
  };

  return (
    <div>
      <AccountMasthead active="settings" userEmail={userEmail} />
      <div style={{ padding: "26px 36px 80px" }}>
        <SubTabBar tabs={TABS} active={tab} onSelect={onTabClick} ariaLabel="Settings sections" />

        {tab === "general" && (
          <div style={{ display: "grid", gap: 16 }}>
            <DashboardSettingsCard />
            <FreightSectorsCard />
            <AccountCard title="Notifications" meta="In-app channel available now · email and push coming soon">
              <p style={{ fontSize: "11.5px", color: "var(--color-text-secondary)", margin: "0 0 4px" }}>
                Choose what gets your attention. Conservative by default — higher-volume notifications are off
                until you opt in.
              </p>
              <NotificationPreferences userId={userId} />
            </AccountCard>
            <AccountCard title="Briefing schedule" meta="Cadence · time · jurisdictions · delivery">
              <BriefingScheduleSection />
            </AccountCard>
          </div>
        )}

        {tab === "saved" && (
          <AccountCard title="Saved searches" meta="Named filter combinations · stored locally" maxWidth={720}>
            <SavedSearchesSection />
          </AccountCard>
        )}

        {tab === "data" && (
          <div style={{ display: "grid", gap: 16 }}>
            <AccountCard title="Data summary">
              <DataSummary resources={initialResources} archived={initialArchived} />
            </AccountCard>
            <AccountCard title="Supersession history">
              <SupersessionHistory supersessions={supersessions} resourceMap={resourceMap} />
            </AccountCard>
          </div>
        )}

        {tab === "archive" && (
          <AccountCard
            title="Archive"
            meta={`${initialArchived.length} item${initialArchived.length !== 1 ? "s" : ""} · still recoverable`}
          >
            {initialArchived.length === 0 ? (
              <p style={{ fontSize: 12, lineHeight: 1.6, color: "var(--color-text-secondary)", margin: 0 }}>
                Nothing archived. Briefs you archive and items you dismiss collect here, out of the working
                view but never deleted.
              </p>
            ) : (
              <ArchiveViewer />
            )}
          </AccountCard>
        )}

        {tab === "help" && (
          <HonestFrame heading="Help centre pending">
            Documentation and contact routes land here. Until then, workspace owners reach the team through
            the onboarding channel.
          </HonestFrame>
        )}
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
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
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
            <Chip label="Light" on={theme === "light"} onClick={() => setTheme("light")} />
            <Chip label="Dark" on={theme === "dark"} onClick={() => setTheme("dark")} />
          </div>
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
                    padding: "7px 0",
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
