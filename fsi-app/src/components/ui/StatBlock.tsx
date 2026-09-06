"use client";

/**
 * StatBlock — label / Anton numeral / note (UI system handoff 2026-09-06,
 * README §0.4). What profile and admin counters use — never a band tile.
 */

export interface StatBlockProps {
  label: string;
  value: React.ReactNode;
  note?: React.ReactNode;
  loading?: boolean;
}

export function StatBlock({ label, value, note, loading }: StatBlockProps) {
  return (
    <div>
      <p
        style={{
          fontSize: "var(--fs-105)",
          fontWeight: 800,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--ink-3)",
          margin: "0 0 4px",
        }}
      >
        {label}
      </p>
      {loading ? (
        <span
          aria-hidden="true"
          style={{ display: "block", width: 48, height: 26, borderRadius: 5, background: "var(--tag)" }}
        />
      ) : (
        <p
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 26,
            lineHeight: 1,
            letterSpacing: "0.04em",
            color: "var(--ink)",
            margin: 0,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </p>
      )}
      {note && (
        <p style={{ fontSize: "var(--fs-11)", color: "var(--ink-2)", margin: "4px 0 0" }}>{note}</p>
      )}
    </div>
  );
}
