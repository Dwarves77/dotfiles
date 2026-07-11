import Link from "next/link";

/**
 * App-wide not-found page (Wave-α A7, 2026-07-11).
 *
 * Renders inside the root layout's AppShell, so it carries the normal app
 * chrome. Previously `notFound()` calls fell through to the unstyled Next
 * default 404. Honest copy: the page names the two real causes (bad link /
 * item not published) without fabricating detail.
 */
export default function NotFound() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        padding: "48px 24px",
        textAlign: "center",
      }}
    >
      <p
        style={{
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--color-text-muted)",
          margin: 0,
        }}
      >
        404 — Not found
      </p>
      <h1
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: "var(--color-text-primary)",
          margin: "10px 0 8px",
        }}
      >
        This page doesn&apos;t exist
      </h1>
      <p
        style={{
          fontSize: 14,
          lineHeight: 1.6,
          color: "var(--color-text-secondary)",
          maxWidth: "48ch",
          margin: "0 0 20px",
        }}
      >
        The link may be outdated, or the item it points to is not published.
      </p>
      <Link
        href="/"
        prefetch={false}
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: "var(--color-primary)",
          textDecoration: "none",
          padding: "10px 18px",
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          background: "var(--color-surface)",
        }}
      >
        Back to Dashboard
      </Link>
    </div>
  );
}
