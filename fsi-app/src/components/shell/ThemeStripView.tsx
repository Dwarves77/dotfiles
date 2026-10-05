/**
 * ThemeStripView: the presentational half of ThemeStrip (lane S3-B), split out so the UX smoke spec can mount
 * it with fixture data (the server half reads the database). One card per theme: the item it opens on this
 * page (one 44px link, single-line with the full title on `title`), the theme's size and the pages it spans,
 * a brief badge (stale said in words), and up to three other members as small links with 8px of clearance.
 * Horizontal scroll is the strip's own, declared with data-guard-strip.
 */

import type { buildThemeChips } from "@/lib/research/theme-brief.mjs";

type Chip = ReturnType<typeof buildThemeChips>[number];

export function ThemeStripView({ chips }: { chips: Chip[] }) {
  if (chips.length === 0) return null;
  return (
    <section style={{ maxWidth: 1180, margin: "0 auto", padding: "18px 36px 0" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
        <h2
          style={{
            fontSize: 13,
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            color: "var(--color-text-primary)",
            margin: 0,
          }}
        >
          Themes across the corpus
        </h2>
        <span style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>{chips.length} active</span>
      </div>
      <div data-guard-strip style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4 }}>
        {chips.map((c) => (
          <div
            key={c.themeId}
            style={{
              flex: "0 0 260px",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              padding: "10px 12px",
              background: "var(--color-surface)",
            }}
          >
            <a
              href={c.href}
              title={c.itemTitle}
              style={{ display: "flex", alignItems: "center", minHeight: 44, textDecoration: "none", color: "inherit" }}
            >
              <span
                data-guard-title
                style={{
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: "var(--color-text-primary)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  minWidth: 0,
                }}
              >
                {c.itemTitle}
              </span>
            </a>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, margin: "5px 0 8px" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--color-text-muted)" }}>
                {c.memberCount} {c.memberCount === 1 ? "item" : "items"}
              </span>
              {c.pages.map((p) => (
                <span
                  key={p.surface}
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.03em",
                    padding: "1px 5px",
                    borderRadius: 4,
                    color: "var(--color-primary)",
                    background: "var(--color-active-bg, rgba(37,99,235,0.08))",
                  }}
                >
                  {p.label}
                </span>
              ))}
              {c.hasBrief && (
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    padding: "1px 5px",
                    borderRadius: 4,
                    color: c.stale ? "var(--color-warning)" : "var(--color-text-muted)",
                    border: "1px solid currentColor",
                  }}
                >
                  {c.stale ? "Brief · stale" : "Brief"}
                </span>
              )}
            </div>
            {c.links.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {c.links.map((m) => (
                  <a
                    key={m.href}
                    href={m.href}
                    title={m.title}
                    style={{
                      display: "block",
                      minHeight: 24,
                      lineHeight: "24px",
                      fontSize: 11,
                      color: "var(--color-text-secondary)",
                      textDecoration: "none",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    · {m.title}
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
