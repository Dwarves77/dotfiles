"use client";

import { useEffect, useState } from "react";
import { useSettingsStore } from "@/stores/settingsStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { JURISDICTIONS } from "@/lib/constants";
import { Chip, TextInput } from "@/components/account/AccountPrimitives";

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

const DAYS: Array<{ id: string; label: string }> = [
  { id: "monday", label: "Mon" },
  { id: "tuesday", label: "Tue" },
  { id: "wednesday", label: "Wed" },
  { id: "thursday", label: "Thu" },
  { id: "friday", label: "Fri" },
];

const CADENCE: Array<{ id: Cadence; label: string }> = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
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
    <div>
      <p style={{ fontSize: "11.5px", color: "var(--color-text-secondary)", margin: "0 0 14px" }}>
        Tune how often the briefing lands, when, and which jurisdictions it weights.{" "}
        <b>Schedule is workspace-scoped</b>
        {orgName ? (
          <>
            {" "}— it persists to {orgName}.
          </>
        ) : (
          <> — join or create a workspace to persist it.</>
        )}
      </p>

      <div style={{ display: "flex", gap: 32, flexWrap: "wrap", margin: "0 0 16px" }}>
        <div>
          <FieldLabel>Cadence</FieldLabel>
          <div style={{ display: "flex", gap: 6 }}>
            {CADENCE.map((c) => (
              <Chip key={c.id} label={c.label} on={schedule.cadence === c.id} onClick={() => canEdit && update({ cadence: c.id })} />
            ))}
          </div>
        </div>
        {schedule.cadence !== "daily" && (
          <div>
            <FieldLabel>Day</FieldLabel>
            <div style={{ display: "flex", gap: 6 }}>
              {DAYS.map((d) => (
                <Chip key={d.id} label={d.label} on={schedule.day === d.id} onClick={() => canEdit && update({ day: d.id })} />
              ))}
            </div>
          </div>
        )}
        <div>
          <FieldLabel>Time (24h, your local timezone)</FieldLabel>
          <TextInput
            type="time"
            value={schedule.time}
            disabled={!canEdit}
            onChange={(e) => update({ time: e.target.value })}
            style={{ width: 110, fontWeight: 700 }}
          />
        </div>
      </div>

      <div style={{ margin: "0 0 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, margin: "0 0 8px" }}>
          <FieldLabel noMargin>Weight these jurisdictions</FieldLabel>
          <span style={{ fontSize: "10.5px", color: "var(--color-text-muted)" }}>{weightNote}</span>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {JURISDICTIONS.map((j) => (
            <Chip key={j.id} label={j.label} pill on={schedule.jurisdictions.includes(j.id)} onClick={() => canEdit && toggleJurisdiction(j.id)} />
          ))}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ background: "var(--color-bg-ai-strip)", border: "1px solid var(--color-active-border)", borderRadius: 6, padding: "10px 16px" }}>
          <p style={{ fontSize: 12, fontWeight: 800, margin: 0, color: "var(--color-text-primary)" }}>Delivery · in-app</p>
          <p style={{ fontSize: "10.5px", color: "var(--color-text-muted)", margin: "2px 0 0" }}>
            Lands in your dashboard. Email and push follow the notifications channel work.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {saved && !dirty && (
            <span style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--color-success)" }}>
              Saved to {orgName || "workspace"}.
            </span>
          )}
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "12.5px",
              fontWeight: 800,
              padding: "11px 20px",
              borderRadius: 6,
              border: canSave ? "1px solid var(--color-primary)" : "1px solid var(--color-border)",
              background: canSave ? "var(--color-primary)" : "rgba(0,0,0,0.08)",
              color: canSave ? "#FFFFFF" : "var(--color-text-muted)",
              cursor: canSave ? "pointer" : "default",
            }}
          >
            {saving ? "Saving…" : "Save schedule"}
          </button>
        </div>
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
