"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { Resource, Supersession } from "@/types/resource";
import { DashboardSettings } from "@/components/settings/DashboardSettings";
import { NotificationPreferences } from "@/components/profile/NotificationPreferences";
import { BriefingScheduleSection } from "@/components/settings/BriefingScheduleSection";

// Hotfix-3 Fix #1 (2026-05-07): tab-deferred panels for /settings.
// SettingsPage is a `"use client"` shell — `dynamic({ ssr: false })`
// from inside a client component DOES move chunks out of the entry per
// the App Router chunking model. This is the inverse of the failed
// 2026-05-06 wave (which used `ssr: true` from server pages and didn't
// defer). General tab components (DashboardSettings, NotificationPreferences,
// BriefingScheduleSection) stay statically imported because General is
// the default tab on first paint. Non-default tab bodies are deferred.
//
// Each deferred panel ships as a separate async chunk loaded only when
// the user clicks the corresponding tab.
const DataSummary = dynamic(
  () =>
    import("@/components/settings/DataSummary").then((m) => ({
      default: m.DataSummary,
    })),
  { ssr: false }
);
const SupersessionHistory = dynamic(
  () =>
    import("@/components/settings/SupersessionHistory").then((m) => ({
      default: m.SupersessionHistory,
    })),
  { ssr: false }
);
const ArchiveViewer = dynamic(
  () =>
    import("@/components/settings/ArchiveViewer").then((m) => ({
      default: m.ArchiveViewer,
    })),
  { ssr: false }
);
const SavedSearchesSection = dynamic(
  () =>
    import("@/components/settings/SavedSearchesSection").then((m) => ({
      default: m.SavedSearchesSection,
    })),
  { ssr: false }
);
const HelpSection = dynamic(
  () =>
    import("@/components/settings/HelpSection").then((m) => ({
      default: m.HelpSection,
    })),
  { ssr: false }
);

// ───────────────────────────────────────────────────────────────────────────
// SettingsPage (Phase C, PR-D IA refactor 2026-05-06)
// Tabbed settings shell. Tabs (post-refactor, per design intent —
// dashboard-v3.html and visual-reconciliation §3.10):
//   General · Dashboard · Exports · Data & supersessions · Archive
//
// PR-D moved Notifications out of its own tab into a section inside
// the General tab — the design preview groups Notifications + briefing
// schedule under General. NotificationPreferences is the same component
// it was before; it now renders as a section within the General panel
// rather than under its own tab.
//
// Backward compat: settings#notifications hash now resolves to
// "general" (with NotificationPreferences in-frame) rather than 404'ing
// to an unknown tab. The hash-to-tab mapping below treats the legacy
// notifications hash as an alias for general.
//
// Phase C remains pragmatic about splitting the monolithic
// DashboardSettings — General/Dashboard/Exports all render the existing
// component as sections. Each tab below renders the part that maps to it.
// ───────────────────────────────────────────────────────────────────────────

interface Props {
  initialResources: Resource[];
  initialArchived: Resource[];
  supersessions: Supersession[];
  userId: string;
}

type TabKey =
  | "general"
  | "dashboard"
  | "exports"
  | "saved"
  | "data"
  | "archive"
  | "help";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "general", label: "General" },
  { key: "dashboard", label: "Dashboard" },
  { key: "exports", label: "Exports" },
  { key: "saved", label: "Saved searches" },
  { key: "data", label: "Data & supersessions" },
  { key: "archive", label: "Archive" },
  { key: "help", label: "Help" },
];

// Legacy hash aliases: post-PR-D, #notifications resolves to General
// (where the NotificationPreferences section now lives) rather than
// 404'ing the user. PR-L adds: #briefing → General (where the briefing
// schedule restoration now lives).
const LEGACY_HASH_ALIASES: Record<string, TabKey> = {
  notifications: "general",
  briefing: "general",
};

export function SettingsPage({
  initialResources,
  initialArchived,
  supersessions,
  userId,
}: Props) {
  // Pick initial tab from URL hash if present. Legacy aliases (e.g.
  // #notifications) resolve to their post-PR-D parent tab (General).
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
    if (typeof window !== "undefined") {
      history.replaceState(null, "", `#${key}`);
    }
  };

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "var(--color-background)" }}
    >
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8">
        <p
          className="text-xs uppercase tracking-wide mb-1"
          style={{ color: "var(--color-text-muted)" }}
        >
          Personal preferences
        </p>
        <h1
          className="text-2xl font-bold"
          style={{ color: "var(--color-text-primary)" }}
        >
          Settings
        </h1>
        <p
          className="text-sm mt-1"
          style={{ color: "var(--color-text-secondary)" }}
        >
          General · dashboard · exports · data · archive
        </p>

        {/* Tabs */}
        <div
          className="flex flex-wrap gap-0 border-b mt-6 mb-6"
          style={{ borderColor: "var(--color-border)" }}
        >
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => onTabClick(t.key)}
              className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider cursor-pointer transition-colors"
              style={{
                color:
                  tab === t.key
                    ? "var(--color-primary)"
                    : "var(--color-text-secondary)",
                borderBottom: `3px solid ${
                  tab === t.key ? "var(--color-primary)" : "transparent"
                }`,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Panels */}
        {tab === "general" && (
          <div className="space-y-5">
            <Card>
              <DashboardSettings />
            </Card>
            {/* PR-D IA refactor: Notifications relocated from a
                standalone tab into a General section. The component
                contract (NotificationPreferences) is unchanged — it
                still loads/saves via the same /api/notifications path
                and takes the same userId prop. */}
            <Card
              title="Notifications"
              meta="In-app channel only in Phase C · email + push ship in Phase D"
            >
              <p
                className="text-sm mb-4"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Choose what gets your attention. We&apos;re conservative by
                default — higher-volume notifications are off until you opt in.
              </p>
              <NotificationPreferences userId={userId} />
            </Card>
            {/* PR-L Settings restoration (Decision #14, F9): Briefing
                schedule lives under General per the design preview. The
                component reads/writes workspace_settings.alert_config,
                preserving any existing keys. */}
            <Card
              title="Briefing schedule"
              meta="Cadence · time · jurisdictions · delivery"
            >
              <BriefingScheduleSection />
            </Card>
          </div>
        )}

        {tab === "dashboard" && (
          <Card
            title="Dashboard cards"
            meta="Toggle which cards appear on home"
          >
            {/* DashboardSettings drives every dashboard-side preference today.
                Until we split it out per tab, we render it here so users can
                find their toggles regardless of which tab they pick. */}
            <DashboardSettings />
          </Card>
        )}

        {tab === "exports" && (
          <Card
            title="Default export format"
            meta="Used by share menus and the Export Builder"
          >
            <p
              className="text-sm mb-3"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Pick your default export format. Individual exports can override
              this per file.
            </p>
            <DashboardSettings />
          </Card>
        )}

        {tab === "data" && (
          <div className="space-y-5">
            <Card title="Data summary">
              <DataSummary
                resources={initialResources}
                archived={initialArchived}
              />
            </Card>
            <Card title="Supersession history">
              <SupersessionHistory
                supersessions={supersessions}
                resourceMap={resourceMap}
              />
            </Card>
          </div>
        )}

        {tab === "archive" && (
          <Card
            title="Archived items"
            meta={`${initialArchived.length} item${
              initialArchived.length !== 1 ? "s" : ""
            } · still recoverable`}
          >
            <ArchiveViewer />
          </Card>
        )}

        {/* PR-L Settings restoration (Decision #14, F10): SAVED SEARCHES.
            L1 surface persists to localStorage; surface a candidate
            backend split for L2 (saved_searches table). */}
        {tab === "saved" && (
          <Card
            title="Saved searches"
            meta="Named filter combinations · stored locally"
          >
            <SavedSearchesSection />
          </Card>
        )}

        {/* PR-L Settings restoration (Decision #14, F14): HELP card with
            documentation links, support contact, and version info. */}
        {tab === "help" && (
          <Card
            title="Help"
            meta="Documentation · support · version"
          >
            <HelpSection />
          </Card>
        )}
      </div>
    </div>
  );
}

// ── Card wrapper ──────────────────────────────────────────────────────────

function Card({
  title,
  meta,
  children,
}: {
  title?: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-lg border mb-5"
      style={{
        borderColor: "var(--color-border-subtle)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      {(title || meta) && (
        <header
          className="flex items-baseline justify-between gap-3 flex-wrap px-5 py-4 border-b"
          style={{ borderColor: "var(--color-border-subtle)" }}
        >
          {title && (
            <h3
              className="text-base font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              {title}
            </h3>
          )}
          {meta && (
            <span
              className="text-xs"
              style={{ color: "var(--color-text-muted)" }}
            >
              {meta}
            </span>
          )}
        </header>
      )}
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}
