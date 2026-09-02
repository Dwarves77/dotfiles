"use client";

/**
 * RecalculationNotice — Layer 4's third component. Renders one old->new pair from
 * `fetchSupersededNotices()` (src/lib/propagation/methods/superseded-notices.ts): "a figure you may have
 * already seen just changed, here is why." Fed by GET /api/notices.
 *
 * Deliberately NOT gated through admissibleFor() — a notice is not itself a figure being consumed for
 * display/analysis/calculation/filing; it is a diff BETWEEN two past figures, both of which already
 * passed (or failed) that gate on their own render elsewhere. Showing "this went stale" is exactly the
 * information a reader who trusted the old number needs, independent of whether either value would
 * currently be admissible for some use.
 */

import type { SupersededNotice } from "@/lib/propagation/methods/superseded-notices.ts";

export interface RecalculationNoticeItem extends SupersededNotice {
  /** The entity/decision's human-readable name, when resolvable (entities.display_name-shaped). Falls
   *  back to the raw entityId when no label is available — never blank. */
  entityLabel?: string | null;
  /** Where a reader can see the entity/decision in full, when one exists. */
  href?: string | null;
}

function formatNum(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2 });
}

function formatDelta(oldValue: number | null, newValue: number | null, unit: string | null, currency: string | null): string {
  const suffix = currency ? "" : unit ? ` ${unit}` : "";
  const prefix = currency ? `${currency} ` : "";
  return `${prefix}${formatNum(oldValue)}${suffix} → ${prefix}${formatNum(newValue)}${suffix}`;
}

export interface RecalculationNoticeProps {
  notices: RecalculationNoticeItem[];
  /** Shown when `notices` is empty — a positive, honest empty state, never silence. */
  emptyMessage?: string;
}

function NoticeRow({ n }: { n: RecalculationNoticeItem }) {
  const versionChanged = n.oldMethodVersion !== n.newMethodVersion;
  return (
    <li className="cl-row-card" style={{ listStyle: "none", marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span className="cl-card-title" style={{ fontSize: 14 }}>
          {n.href ? (
            <a href={n.href} style={{ color: "inherit", textDecoration: "underline" }}>
              {n.entityLabel || n.entityId || "Unlabeled entity"}
            </a>
          ) : (
            n.entityLabel || n.entityId || "Unlabeled entity"
          )}
        </span>
        <span className="cl-card-meta">{new Date(n.supersededAt).toLocaleString()}</span>
      </div>

      <div className="cl-card-body" style={{ marginTop: 6 }}>
        {formatDelta(n.oldValue, n.newValue, n.unit, n.currency)}
      </div>

      <div className="cl-card-meta" style={{ marginTop: 6 }}>
        {n.methodId}@{n.oldMethodVersion}
        {versionChanged ? ` → ${n.methodId}@${n.newMethodVersion}` : " (same method version — recomputed from changed inputs)"}
      </div>

      {n.triggeringEvent && (
        <div className="cl-card-meta" style={{ marginTop: 4 }}>
          Triggered by a {n.triggeringEvent.changeKind} on {n.triggeringEvent.table} ({n.triggeringEvent.pk}), {new Date(n.triggeringEvent.occurredAt).toLocaleString()}
        </div>
      )}
    </li>
  );
}

export function RecalculationNotice({ notices, emptyMessage = "No recalculations since your last visit." }: RecalculationNoticeProps) {
  if (notices.length === 0) {
    return (
      <div className="cl-card" style={{ padding: "16px 18px" }} data-figure-kind="recalculation-notice-empty">
        <div className="cl-card-body">{emptyMessage}</div>
      </div>
    );
  }

  return (
    <ul style={{ padding: 0, margin: 0 }} data-figure-kind="recalculation-notice-list">
      {notices.map((n) => (
        <NoticeRow key={n.newValueId} n={n} />
      ))}
    </ul>
  );
}
