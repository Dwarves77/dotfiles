/**
 * SystemErrorBanner — surfaced when a data fetcher falls back to empty
 * (Sprint 3 SF-2 Phase 1, 2026-05-27).
 *
 * Conditional render only. Pass `message` non-empty to show; pass
 * `undefined` to render nothing. The wrapper at `lib/data.ts` returns
 * its sentinel via `data._error` — the page server component spreads
 * that into this prop.
 *
 * Copy is operator-locked recoverable framing: "Data temporarily
 * unavailable. Refresh to retry." The seed-fallback dispatch records
 * a platform integrity_flag with dedupe (one open flag per route per
 * hour); customer-side action is to refresh.
 */

interface SystemErrorBannerProps {
  message?: string;
}

export function SystemErrorBanner({ message }: SystemErrorBannerProps) {
  if (!message) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        padding: "10px 16px",
        background: "var(--color-warning-bg, #FFF7F0)",
        borderBottom: "1px solid var(--color-warning-border, #F0D5B8)",
        color: "var(--color-text-primary)",
        fontSize: 13,
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 14 }}>⚠</span>
      <span>
        <b style={{ fontWeight: 700 }}>{message}</b>
      </span>
    </div>
  );
}
