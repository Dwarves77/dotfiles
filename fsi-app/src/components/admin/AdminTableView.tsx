"use client";

/**
 * AdminTableView: shared admin table-view primitives (lane L34, system
 * health audit 2026-09-17 section 2: "Admin views (IngestRejectionsView,
 * TierOpinionDisagreementsView, PendingJurisdictionReviewView,
 * SourceAdminControls, ...) | 10 | wire: one admin table view primitive").
 *
 * Extraction, not redesign: every export here renders the exact DOM and
 * styles its callers already rendered inline, verified byte-identical
 * before extraction. Two visual families exist across the ten views and
 * neither is forced onto the other (that would be a redesign):
 *
 *   Family A (Tailwind className cards, `--color-*` tokens): the toolbar
 *   header (title + description + Refresh), the error banner, the inline
 *   ok/err status banner, the fixed bottom-right toast, the two stat-card
 *   shapes, and the Ingest/Tier th/td pair. Used by IngestRejectionsView,
 *   PendingJurisdictionReviewView, TierOpinionDisagreementsView,
 *   IntegrityFlagsView, PlatformIntegrityFlagsView, CoverageMatrixView.
 *
 *   Family B (inline style, `--surface`/`--raised`/`--text` tokens): the
 *   panel frame (outer card + header bar with title/meta), the dashed
 *   two-paragraph empty state, and the th/td style constants. Used by
 *   AssumptionRegisterPanel, ErrorGroupsView, CorpusTurnPanel,
 *   FlagsRejectionsQueue.
 *
 * Prior art checked (lane-common-contract item 6) before writing this file:
 * src/components/ui/Toast.tsx, ErrorState.tsx, SystemErrorBanner.tsx,
 * RowTable.tsx and StatBlock.tsx were read in full. None matches the DOM/
 * className/style shape these ten views already render (different markup,
 * different design-token namespace), so reusing them would change rendered
 * output: a redesign, not an extraction, and the thing the lane brief
 * forbids. This module is therefore the one new home for these two
 * families' shared pieces, not a second home for something that already
 * exists.
 */

import { cloneElement, type ReactElement, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";

// ── Family A: toolbar header (title + description + Refresh) ──────────────

export function AdminSectionHeader({
  title,
  description,
  descriptionMaxWidthClassName,
  onRefresh,
  loading,
}: {
  title: string;
  description: ReactNode;
  /** Matches each caller's own max-w-* Tailwind class exactly (some views
   *  set none). Optional so a caller with no max-width class renders the
   *  same DOM it always did. */
  descriptionMaxWidthClassName?: string;
  onRefresh: () => void;
  loading?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>
          {title}
        </h2>
        <p
          className={`text-sm mt-1${descriptionMaxWidthClassName ? ` ${descriptionMaxWidthClassName}` : ""}`}
          style={{ color: "var(--color-text-secondary)" }}
        >
          {description}
        </p>
      </div>
      <Button variant="secondary" size="sm" onClick={onRefresh} disabled={loading}>
        <RefreshCw size={12} />
        Refresh
      </Button>
    </div>
  );
}

// ── Family A: error banner ─────────────────────────────────────────────────

export function AdminErrorBanner({ error }: { error: string | null | undefined }) {
  if (!error) return null;
  return (
    <div
      className="p-3 rounded-md text-sm"
      style={{
        color: "var(--color-error)",
        border: "1px solid var(--color-error)",
        backgroundColor: "rgba(220,38,38,0.04)",
      }}
    >
      {error}
    </div>
  );
}

// ── Family A: inline ok/err status banner ──────────────────────────────────

export interface AdminStatus {
  kind: "ok" | "err";
  text: string;
}

export function AdminStatusBanner({ status }: { status: AdminStatus | null }) {
  if (!status) return null;
  return (
    <div
      className="text-xs p-2 rounded"
      style={{
        color: status.kind === "ok" ? "var(--color-success)" : "var(--color-error)",
        backgroundColor: status.kind === "ok" ? "rgba(22,163,74,0.04)" : "rgba(220,38,38,0.04)",
        border: status.kind === "ok" ? "1px solid rgba(22,163,74,0.2)" : "1px solid rgba(220,38,38,0.2)",
      }}
    >
      {status.text}
    </div>
  );
}

/** The minimal inline colored status text (no box): SourceAdminControls'
 *  two internal copies (SourceRowControls, SourceTierOverrideControl). */
export function AdminInlineStatusText({ status }: { status: AdminStatus | null }) {
  if (!status) return null;
  return (
    <div className="text-[11px]" style={{ color: status.kind === "ok" ? "var(--color-success)" : "var(--color-error)" }}>
      {status.text}
    </div>
  );
}

// ── Family A: fixed bottom-right toast ─────────────────────────────────────

export function AdminFixedToast({ toast }: { toast: string }) {
  if (!toast) return null;
  return (
    <div
      className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg border text-sm font-medium shadow-lg"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-surface)",
        color: "var(--color-text-primary)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
      }}
    >
      {toast}
    </div>
  );
}

// ── Family A: stat cards (two shapes) ──────────────────────────────────────

/** Small stat card with an optional meta line: IngestRejectionsView and
 *  PendingJurisdictionReviewView's "Stat" component. */
export function AdminStatCard({
  label,
  value,
  meta,
  critical,
}: {
  label: string;
  value: string;
  meta?: string;
  critical?: boolean;
}) {
  return (
    <div
      className="p-3 rounded-lg border"
      style={{
        borderColor: critical ? "var(--color-warning)" : "var(--color-border)",
        backgroundColor: critical ? "rgba(217,119,6,0.04)" : "var(--color-surface)",
      }}
    >
      <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
        {label}
      </div>
      <div
        className="text-xl font-semibold tabular-nums mt-1"
        style={{ color: critical ? "var(--color-warning)" : "var(--color-text-primary)" }}
      >
        {value}
      </div>
      {meta && (
        <div className="text-[11px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
          {meta}
        </div>
      )}
    </div>
  );
}

/** Larger stat cell, no meta line: IntegrityFlagsView's own "StatCell"
 *  component (PlatformIntegrityFlagsView has a same-named but NOT
 *  byte-identical "StatCell", checked and left local; see this file's
 *  header comment). */
export function AdminStatCellLarge({
  label,
  value,
  critical,
}: {
  label: string;
  value: string;
  critical?: boolean;
}) {
  return (
    <div
      className="p-4 rounded-lg"
      style={{
        border: critical ? "1px solid var(--color-warning)" : "1px solid var(--color-border)",
        backgroundColor: critical ? "rgba(217, 119, 6, 0.05)" : "var(--color-surface)",
      }}
    >
      <div
        className="text-[11px] font-bold uppercase tracking-wider mb-2"
        style={{ color: critical ? "var(--color-warning)" : "var(--color-text-muted)" }}
      >
        {label}
      </div>
      <div
        className="text-2xl font-semibold tabular-nums"
        style={{ color: critical ? "var(--color-warning)" : "var(--color-text-primary)" }}
      >
        {value}
      </div>
    </div>
  );
}

// ── Family A: icon empty state (dashed card, icon + h3 + p + optional footer)

export function AdminIconEmptyState({
  icon,
  iconColor,
  title,
  description,
  footer,
}: {
  /** A single icon element (e.g. `<CheckCircle size={28} />`), styled here
   *  by cloning in the color: no wrapping element, so the DOM matches each
   *  caller's original single-svg markup exactly. */
  icon: ReactElement;
  iconColor: string;
  title: string;
  description: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center py-12 text-center rounded-lg"
      style={{ border: "1px dashed var(--color-border)", backgroundColor: "var(--color-surface)" }}
    >
      {cloneElement(icon, { style: { color: iconColor } } as Record<string, unknown>)}
      <h3 className="mt-3 text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
        {title}
      </h3>
      <p className="mt-1 text-xs max-w-md" style={{ color: "var(--color-text-secondary)" }}>
        {description}
      </p>
      {footer && (
        <p className="mt-3 text-[11px] inline-flex items-center gap-1.5" style={{ color: "var(--color-text-muted)" }}>
          {footer}
        </p>
      )}
    </div>
  );
}

// ── Family A: Ingest/Tier th/td pair ───────────────────────────────────────

export function AdminTh({ children }: { children: ReactNode }) {
  return (
    <th
      className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider"
      style={{ color: "var(--color-text-muted)" }}
    >
      {children}
    </th>
  );
}

export function AdminTd({ children, align }: { children: ReactNode; align?: "left" | "right" }) {
  return (
    <td className="px-3 py-2 align-top" style={{ textAlign: align ?? "left" }}>
      {children}
    </td>
  );
}

// ── Family B: panel frame (outer card + header bar) ────────────────────────

export function AdminPanelFrame({
  title,
  right,
  children,
}: {
  title: string;
  /** The header bar's right-hand slot, rendered exactly as given: a text
   *  meta span (wrap it in `AdminPanelMetaText`) or a control (a Refresh
   *  `Button`, as CorpusTurnPanel and FlagsRejectionsQueue's own header use
   *  no meta text at all). Not wrapped here: callers differ on what goes
   *  there and wrapping a Button in a text span would change the DOM. */
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 20px",
          background: "var(--raised)",
          borderBottom: "1px solid var(--color-border-subtle)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 12,
        }}
      >
        <span
          style={{
            fontSize: 12.5,
            fontWeight: 800,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: "var(--text)",
          }}
        >
          {title}
        </span>
        {right}
      </div>
      {children}
    </div>
  );
}

/** The plain-text meta line used in the header's right-hand slot:
 *  AssumptionRegisterPanel and ErrorGroupsView's own inline span. */
export function AdminPanelMetaText({ children }: { children: ReactNode }) {
  return <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-2)" }}>{children}</span>;
}

// ── Family B: dashed two-paragraph empty state ─────────────────────────────

export function AdminEmptyDashedFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      style={{
        margin: 16,
        border: "1px dashed var(--color-border-strong)",
        background: "var(--color-background)",
        borderRadius: 8,
        padding: "14px 16px",
      }}
    >
      <p style={{ fontSize: 12.5, fontWeight: 800, color: "var(--text)", margin: "0 0 4px" }}>{title}</p>
      <p style={{ fontSize: 12.5, lineHeight: 1.65, color: "var(--text-2)", margin: 0 }}>{children}</p>
    </div>
  );
}

// ── Family B: th/td style constants ────────────────────────────────────────

export const adminThStyle: React.CSSProperties = {
  padding: "9px 16px",
  fontSize: 10.5,
  fontWeight: 800,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

export const adminTdStyle: React.CSSProperties = {
  padding: "9px 16px",
  verticalAlign: "middle",
};
