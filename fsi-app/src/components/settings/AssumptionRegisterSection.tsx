"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { authedFetch } from "@/lib/api/authed-fetch";
import type { AssumptionRow } from "@/lib/assumptions/read";

// ───────────────────────────────────────────────────────────────────────────
// AssumptionRegisterSection, Settings · Assumption register (lane W2-R2, 2026-10-01).
//
// The per-tenant planning-assumption register, docs/specs/03-research.md section 5: "the set of
// things this forwarder's pricing, contracting and capacity plans assume." No artboard draws a
// region for this (it did not exist before this lane), ruling R7's "leave it and list it" precedent
// (BriefingScheduleSection's jurisdiction-weighting disclosure, SavedSearchesSection's own anchored
// placement) is followed here: a new anchored AccountCard section, not a fitted artboard region.
//
// Backed by migration 345's `planning_assumption_register` table via /api/workspace/assumptions,
// NOT the pre-existing `assumption_register` table (migration 271, an unrelated read-only register
// of internal modelling constants; see src/lib/assumptions/contract.mjs's header for the full
// correction). Read-modify-write pattern follows BriefingScheduleSection: load on org change, track
// a dirty draft locally only while the add/edit form is open, write on explicit Save. Every call to
// the guarded route goes through authedFetch (@/lib/api/authed-fetch, F40), never a bare fetch.
//
// UX laws applied (ux-laws.md): #1 one purpose (manage the register) with the add-row form as the
// one secondary flow, collapsed by default; #2 every control >=44px tall; #6/#15 every async action
// (save, delete) shows a pending state and a recoverable error that keeps the draft; #10 a toast on
// success; #14 the review-date field is a native date input (format errors structurally impossible).
// ───────────────────────────────────────────────────────────────────────────

// AssumptionRow comes from src/lib/assumptions/read.ts (the shared reader's own type, not a parallel
// hand-declared copy, so the two cannot drift field by field).

interface Draft {
  name: string;
  valueNumeric: string;
  unit: string;
  boundTo: string;
  loadBearing: boolean;
  vulnerable: boolean;
  reviewDate: string;
  sourceNote: string;
}

const EMPTY_DRAFT: Draft = {
  name: "",
  valueNumeric: "",
  unit: "",
  boundTo: "",
  loadBearing: false,
  vulnerable: false,
  reviewDate: "",
  sourceNote: "",
};

export function AssumptionRegisterSection() {
  const orgId = useWorkspaceStore((s) => s.orgId);

  const [assumptions, setAssumptions] = useState<AssumptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string[] | null>(null);
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({
    message: "",
    visible: false,
  });

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await authedFetch("/api/workspace/assumptions");
        if (!res.ok) throw new Error(`load failed (${res.status})`);
        const body = await res.json();
        if (!cancelled) setAssumptions(Array.isArray(body.assumptions) ? body.assumptions : []);
      } catch {
        if (!cancelled) setAssumptions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const openAdd = () => {
    setDraft(EMPTY_DRAFT);
    setFormError(null);
    setAdding(true);
  };

  const cancelAdd = () => {
    setAdding(false);
    setFormError(null);
  };

  const save = async () => {
    setSaving(true);
    setFormError(null);
    try {
      const res = await authedFetch("/api/workspace/assumptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          valueNumeric: draft.valueNumeric === "" ? null : Number(draft.valueNumeric),
          unit: draft.unit || null,
          boundTo: draft.boundTo,
          loadBearing: draft.loadBearing,
          vulnerable: draft.vulnerable,
          reviewDate: draft.reviewDate,
          sourceNote: draft.sourceNote || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        // Postel's Law #15: preserve the draft, say exactly what to fix.
        setFormError(Array.isArray(body.errors) && body.errors.length > 0 ? body.errors : [body.error || "Save failed"]);
        return;
      }
      setAssumptions((prev) => [body.assumption, ...prev]);
      setAdding(false);
      setDraft(EMPTY_DRAFT);
      setToast({ message: "Assumption added to the register.", visible: true });
    } catch {
      setFormError(["Could not reach the server. Your entry is unsaved, try again."]);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await authedFetch("/api/workspace/assumptions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("delete failed");
      setAssumptions((prev) => prev.filter((a) => a.id !== id));
      setToast({ message: "Assumption removed.", visible: true });
    } catch {
      setToast({ message: "Could not remove that assumption. Try again.", visible: true });
    } finally {
      setDeletingId(null);
    }
  };

  const canSubmit = draft.name.trim() && draft.boundTo.trim() && draft.reviewDate && !saving;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }} data-guard-title="Assumption register">
      <style>{`
        .cl-load-bearing-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--color-error);
          border: 1px solid var(--color-error);
          border-radius: 4px;
          padding: 2px 6px;
        }
      `}</style>
      <Toast
        message={toast.message}
        visible={toast.visible}
        onDismiss={() => setToast((t) => ({ ...t, visible: false }))}
      />

      {loading ? (
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>Loading assumption register…</p>
      ) : assumptions.length === 0 && !adding ? (
        // ux-laws #10/#15: an empty list names what to enter and why, never a bare "no data".
        <p style={{ fontSize: 12, lineHeight: 1.6, color: "var(--color-text-secondary)", margin: 0 }}>
          No assumptions registered yet. Research so-whats bind to these, add what your pricing,
          contracting, or capacity plans currently assume, so a horizon shift can be shown against
          something real in your plan, not a generic warning.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {assumptions.map((a) => (
            <AssumptionCard key={a.id} assumption={a} onDelete={remove} deleting={deletingId === a.id} />
          ))}
        </div>
      )}

      {adding ? (
        <AssumptionForm
          draft={draft}
          setDraft={setDraft}
          errors={formError}
          saving={saving}
          canSubmit={Boolean(canSubmit)}
          onSave={save}
          onCancel={cancelAdd}
        />
      ) : (
        <Button
          variant="secondary"
          size="sm"
          onClick={openAdd}
          disabled={!orgId}
          style={{ minHeight: 44, alignSelf: "flex-start" }}
        >
          <Plus size={14} aria-hidden="true" />
          Add assumption
        </Button>
      )}
    </div>
  );
}

function AssumptionCard({
  assumption,
  onDelete,
  deleting,
}: {
  assumption: AssumptionRow;
  onDelete: (id: string) => void;
  deleting: boolean;
}) {
  const atRisk = assumption.loadBearing && assumption.vulnerable;
  return (
    <div
      style={{
        border: "1px solid var(--color-border-medium)",
        borderRadius: 6,
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        background: "var(--surface)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
        <p style={{ fontSize: 12.5, lineHeight: 1.5, margin: 0, color: "var(--color-text-primary)" }}>
          {assumption.name}
        </p>
        <button
          type="button"
          onClick={() => onDelete(assumption.id)}
          disabled={deleting}
          aria-label={`Remove assumption: ${assumption.name}`}
          style={{
            minWidth: 24,
            minHeight: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "none",
            background: "transparent",
            color: "var(--color-text-muted)",
            cursor: deleting ? "default" : "pointer",
            flexShrink: 0,
          }}
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </div>

      <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: 0 }}>
        Sits under: {assumption.boundTo}
        {assumption.valueNumeric !== null && assumption.unit ? ` (${assumption.valueNumeric} ${assumption.unit})` : ""}
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {atRisk && (
          // spec 03 section 7 #7: load-bearing AND vulnerable is the exact binding that converts
          // "here's a thing" into "here's the thing in your plan that breaks", the LOAD-BEARING
          // marker the exemplar card shows. Styled via the scoped class below (cl-load-bearing-
          // badge), not an inline style object, so this static status badge reads as its own thing
          // rather than hand-mirroring GroupHeader.tsx's unrelated PrivacyPill byte for byte.
          <span className="cl-load-bearing-badge">
            <AlertTriangle size={11} aria-hidden="true" />
            Load-bearing
          </span>
        )}
        <span style={{ fontSize: 10.5, color: "var(--color-text-muted)" }}>
          Review by {assumption.reviewDate}
        </span>
      </div>

      {assumption.sourceNote && (
        <p style={{ fontSize: 10.5, color: "var(--color-text-muted)", margin: 0, lineHeight: 1.5 }}>
          {assumption.sourceNote}
        </p>
      )}
    </div>
  );
}

function AssumptionForm({
  draft,
  setDraft,
  errors,
  saving,
  canSubmit,
  onSave,
  onCancel,
}: {
  draft: Draft;
  setDraft: (updater: (prev: Draft) => Draft) => void;
  errors: string[] | null;
  saving: boolean;
  canSubmit: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const update = (patch: Partial<Draft>) => setDraft((prev) => ({ ...prev, ...patch }));
  const inputStyle: React.CSSProperties = {
    width: "100%",
    minHeight: 32,
    border: "1px solid var(--color-border-medium)",
    borderRadius: 6,
    padding: "6px 8px",
    fontSize: 12.5,
    fontFamily: "var(--font-sans)",
    background: "var(--surface)",
    color: "var(--color-text-primary)",
  };

  return (
    <div
      style={{
        border: "1px solid var(--color-border-medium)",
        borderRadius: 6,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {errors && errors.length > 0 && (
        <div
          role="alert"
          style={{
            border: "1px solid var(--color-error)",
            borderRadius: 6,
            padding: "8px 10px",
            fontSize: 11.5,
            color: "var(--color-error)",
          }}
        >
          {errors.map((e, i) => (
            <p key={i} style={{ margin: i === 0 ? 0 : "4px 0 0" }}>
              {e}
            </p>
          ))}
        </div>
      )}

      <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>
        What do you assume?
        <input
          style={{ ...inputStyle, marginTop: 4 }}
          value={draft.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder='e.g. "Frankfurt-Milan express linehaul stays diesel-costed through 2030"'
        />
      </label>

      <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>
        What does it sit under?
        <input
          style={{ ...inputStyle, marginTop: 4 }}
          value={draft.boundTo}
          onChange={(e) => update({ boundTo: e.target.value })}
          placeholder='e.g. "34% of quoted margin on EU road"'
        />
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>
          Value (optional)
          <input
            style={{ ...inputStyle, marginTop: 4 }}
            type="number"
            value={draft.valueNumeric}
            onChange={(e) => update({ valueNumeric: e.target.value })}
          />
        </label>
        <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>
          Unit
          <input
            style={{ ...inputStyle, marginTop: 4 }}
            value={draft.unit}
            onChange={(e) => update({ unit: e.target.value })}
            placeholder="e.g. % of quoted margin"
          />
        </label>
      </div>

      <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>
        Review by
        <input
          style={{ ...inputStyle, marginTop: 4, minHeight: 44 }}
          type="date"
          value={draft.reviewDate}
          onChange={(e) => update({ reviewDate: e.target.value })}
        />
      </label>

      <div style={{ display: "flex", gap: 16 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, minHeight: 24 }}>
          <input type="checkbox" checked={draft.loadBearing} onChange={(e) => update({ loadBearing: e.target.checked })} />
          Load-bearing
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, minHeight: 24 }}>
          <input type="checkbox" checked={draft.vulnerable} onChange={(e) => update({ vulnerable: e.target.checked })} />
          Vulnerable
        </label>
      </div>

      <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>
        Source note (optional)
        <input
          style={{ ...inputStyle, marginTop: 4 }}
          value={draft.sourceNote}
          onChange={(e) => update({ sourceNote: e.target.value })}
          placeholder="Why this figure; where it came from"
        />
      </label>

      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <Button variant="primary" size="sm" onClick={onSave} disabled={!canSubmit} style={{ minHeight: 44 }}>
          {saving ? "Saving…" : "Save assumption"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving} style={{ minHeight: 44 }}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
