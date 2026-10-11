interface SystemErrorBannerProps {
  message?: string;
  /**
   * Additive extension (lane rsc503, 2026-09-08): the reason clause from
   * `describeFallbackTrigger(data._fallbackTrigger)`. Undefined renders exactly what this
   * banner rendered before, so every existing caller is unaffected.
   */
  reason?: string;
}

export function SystemErrorBanner({ message, reason }: SystemErrorBannerProps) {
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
        {reason && <span style={{ marginLeft: 6, color: "var(--ink-2)" }}>{reason}</span>}
      </span>
    </div>
  );
}
