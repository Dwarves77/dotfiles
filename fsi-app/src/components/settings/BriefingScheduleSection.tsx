"use client";

import { useEffect, useState } from "react";
import { useSettingsStore } from "@/stores/settingsStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { JURISDICTIONS } from "@/lib/constants";
import { Chip, SegmentedControl, type SegmentedOption } from "@/components/account/AccountPrimitives";

// ───────────────────────────────────────────────────────────────────────────
// BriefingScheduleSection — Account · Settings · Briefing schedule (T10).
//
// Rebuilt against "Pages - 10 Account". Cadence / day / time / jurisdiction
// weights / in-app delivery. Save is enabled only when the form is dirty and
// on success reports "Saved to {workspace}".
//
// Storage unchanged: workspace_settings.alert_config (JSONB) read-modify-write
// with keys briefingCadence / briefingDay / briefingTime / briefingDelivery /
// briefingJurisdictions. Workspace-scoped; owner/admin can edit.
// ───────────────────────────────────────────────────────────────────────────

type Cadence = "daily" | "weekly" | "biweekly";

interface ScheduleState {
  cadence: Cadence;
  day: string;
  time: string;
  jurisdictions: string[];
}

const DEFAULT_SCHEDULE: ScheduleState = {
  cadence: "weekly",
  day: "monday",
  time: "08:00",
  jurisdictions: [],
};

// dc.html p15 draws Mon | Sun. `briefingDay`'s stored union is monday..friday, so Sunday is not a
// value this schedule can hold; the five days the app actually persists are the segments
// (DEVIATION-LOG 2026-09-08, lane settings60).
const DAYS: ReadonlyArray<SegmentedOption<string>> = [
  { id: "monday", label: "Mon" },
  { id: "tuesday", label: "Tue" },
  { id: "wednesday", label: "Wed" },
  { id: "thursday", label: "Thu" },
  { id: "friday", label: "Fri" },
];

// dc.html p15 draws Weekly | Daily, in that order. Biweekly is a third cadence the app already
// persists and the artboard does not draw: ruling R7 keeps it, as the trailing segment.
const CADENCE: ReadonlyArray<SegmentedOption<Cadence>> = [
  { id: "weekly", label: "Weekly" },
  { id: "daily", label: "Daily" },
  { id: "biweekly", label: "Biweekly" },
];

function sameSchedule(a: ScheduleState, b: ScheduleState): boolean {
  return (
    a.cadence === b.cadence &&
    a.day === b.day &&
    a.time === b.time &&
    a.jurisdictions.length === b.jurisdictions.length &&
    a.jurisdictions.every((j) => b.jurisdictions.includes(j))
  );
}

export function BriefingScheduleSection() {
  const orgId = useSettingsStore((s) => s.orgId);
  const briefingDay = useSettingsStore((s) => s.briefingDay);
  const setBriefingDay = useSettingsStore((s) => s.setBriefingDay);
  const userRole = useWorkspaceStore((s) => s.userRole);
  const orgName = useWorkspaceStore((s) => s.orgName);
  const canEdit = userRole === "owner" || userRole === "admin";

  const [schedule, setSchedule] = useState<ScheduleState>({ ...DEFAULT_SCHEDULE, day: briefingDay });
  const [baseline, setBaseline] = useState<ScheduleState>({ ...DEFAULT_SCHEDULE, day: briefingDay });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // dc.html p15's time field reads "08:00 · Europe/London". The zone is the reader's own, which
  // only the browser knows, so it is resolved after mount rather than guessed on the server (a
  // render-time read would differ between SSR and hydration; see src/lib/render-now.ts).
  const [timeZone, setTimeZone] = useState<string | null>(null);
  useEffect(() => {
    try {
      setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || null);
    } catch {
      setTimeZone(null);
    }
  }, []);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase
        .from("workspace_settings")
        .select("alert_config")
        .eq("org_id", orgId)
        .maybeSingle();
      if (cancelled) return;
      const ac = (data?.alert_config ?? {}) as Record<string, unknown>;
      const loaded: ScheduleState = {
        cadence: (ac.briefingCadence as Cadence) ?? "weekly",
        day: (ac.briefingDay as string) ?? briefingDay,
        time: (ac.briefingTime as string) ?? "08:00",
        jurisdictions: (ac.briefingJurisdictions as string[] | undefined) ?? [],
      };
      setSchedule(loaded);
      setBaseline(loaded);
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, briefingDay]);

  const dirty = !sameSchedule(schedule, baseline);

  const update = (patch: Partial<ScheduleState>) => {
    setSaved(false);
    setSchedule((prev) => ({ ...prev, ...patch }));
  };

  const toggleJurisdiction = (id: string) =>
    update({
      jurisdictions: schedule.jurisdictions.includes(id)
        ? schedule.jurisdictions.filter((j) => j !== id)
        : [...schedule.jurisdictions, id],
    });

  const save = async () => {
    if (!orgId || !canEdit || !dirty) return;
    setSaving(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: row } = await supabase
        .from("workspace_settings")
        .select("alert_config")
        .eq("org_id", orgId)
        .maybeSingle();
      const existing = (row?.alert_config ?? {}) as Record<string, unknown>;
      await supabase
        .from("workspace_settings")
        .update({
          alert_config: {
            ...existing,
            briefingCadence: schedule.cadence,
            briefingDay: schedule.day,
            briefingTime: schedule.time,
            briefingDelivery: "in_app",
            briefingJurisdictions: schedule.jurisdictions,
          },
        })
        .eq("org_id", orgId);
      setBriefingDay(schedule.day as typeof briefingDay);
      setBaseline(schedule);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const weightNote =
    schedule.jurisdictions.length === 0
      ? "All jurisdictions weighted equally"
      : `${schedule.jurisdictions.length} weighted — others still included at base weight`;

  const canSave = dirty && canEdit && !!orgId && !saving;

  return (
    // dc.html p15's rail card: Cadence · Day · Time · note · Save schedule, stacked, gap 10.
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <FieldLabel>Cadence</FieldLabel>
        <SegmentedControl
          options={CADENCE}
          selected={[schedule.cadence]}
          onSelect={(id) => canEdit && update({ cadence: id })}
          ariaLabel="Briefing cadence"
          disabled={!canEdit}
        />
      </div>
      {schedule.cadence !== "daily" && (
        <div>
          <FieldLabel>Day</FieldLabel>
          <SegmentedControl
            options={DAYS}
            selected={[schedule.day]}
            onSelect={(id) => canEdit && update({ day: id })}
            ariaLabel="Briefing day"
            disabled={!canEdit}
          />
        </div>
      )}
      <div>
        <FieldLabel>Time · your local timezone</FieldLabel>
        <div
          style={{
            border: "1px solid var(--color-border-medium)",
            borderRadius: 6,
            minHeight: 44,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "0 10px",
            background: "var(--surface)",
            fontSize: 13,
          }}
        >
          <input
            type="time"
            value={schedule.time}
            disabled={!canEdit}
            onChange={(e) => update({ time: e.target.value })}
            aria-label="Briefing time"
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 13,
              border: "none",
              outline: "none",
              background: "transparent",
              color: "var(--color-text-primary)",
              padding: 0,
            }}
          />
          {timeZone && <span style={{ color: "var(--color-text-secondary)" }}>· {timeZone}</span>}
        </div>
      </div>

      {/* Ruling R7: jurisdiction weighting is a working feature the artboard draws no region for
          (dc.html p15 points at "Account → Jurisdictions", where no weighting control exists), so
          it stays exactly as it is as a card-foot disclosure — R7's own placement precedent. */}
      <details>
        <summary
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--color-text-secondary)",
            cursor: "pointer",
            minHeight: 24,
            display: "flex",
            alignItems: "center",
          }}
        >
          Jurisdiction weighting
        </summary>
        <div style={{ margin: "8px 0 0" }}>
          <p style={{ fontSize: "10.5px", color: "var(--color-text-muted)", margin: "0 0 6px" }}>{weightNote}</p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {JURISDICTIONS.map((j) => (
              <Chip key={j.id} label={j.label} pill on={schedule.jurisdictions.includes(j.id)} onClick={() => canEdit && toggleJurisdiction(j.id)} />
            ))}
          </div>
          <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: "8px 0 0", lineHeight: 1.5 }}>
            Delivery is in-app. Email and push follow the notifications channel work.
          </p>
        </div>
      </details>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "12.5px",
            fontWeight: 700,
            padding: "8px 14px",
            minHeight: 44,
            borderRadius: 6,
            whiteSpace: "nowrap",
            border: canSave ? "1px solid var(--color-primary)" : "1px solid var(--color-border)",
            background: canSave ? "var(--color-primary)" : "rgba(0,0,0,0.08)",
            color: canSave ? "#FFFFFF" : "var(--color-text-muted)",
            cursor: canSave ? "pointer" : "default",
          }}
        >
          {saving ? "Saving…" : "Save schedule"}
        </button>
        {saved && !dirty && (
          <span style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--color-success)" }}>
            Saved to {orgName || "workspace"}.
          </span>
        )}
      </div>
    </div>
  );
}

function FieldLabel({ children, noMargin }: { children: React.ReactNode; noMargin?: boolean }) {
  return (
    <p
      style={{
        fontSize: "9.5px",
        fontWeight: 800,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "var(--color-text-muted)",
        margin: noMargin ? 0 : "0 0 8px",
      }}
    >
      {children}
    </p>
  );
}
