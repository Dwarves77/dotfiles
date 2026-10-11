interface RoleBadgeProps {
  /** Role of the author within the current group. */
  role?: "admin" | "moderator" | "member" | null;
}

export function RoleBadge({ role }: RoleBadgeProps) {
  if (role !== "admin" && role !== "moderator") return null;

  const isAdmin = role === "admin";
  const label = isAdmin ? "Admin" : "Mod";

  return (
    <span
      aria-label={isAdmin ? "Group admin" : "Group moderator"}
      title={isAdmin ? "Group admin" : "Group moderator"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "1px 6px",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: isAdmin
          ? "var(--color-text-primary)"
          : "var(--color-text-secondary)",
        border: "1px solid var(--color-border)",
        borderRadius: 3,
        background: isAdmin
          ? "var(--color-bg-raised, var(--color-bg-base))"
          : "transparent",
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}
