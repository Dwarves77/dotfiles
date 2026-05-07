/**
 * RoleBadge — small role indicator for an author in a group context.
 *
 * Phase D additive. Pure presentational.
 *
 * Data source (real, schema-backed):
 *   community_group_members.role (Migration 029), values:
 *     'admin' | 'moderator' | 'member'
 *
 * Wiring status:
 *   /api/community/posts does not currently join the author's role in
 *   the rendering group; the route returns author = { user_id, name,
 *   headshot_url }. As with VerifierBadge, this component takes an
 *   explicit `role` prop that is undefined in the live data state, so
 *   the badge silently does nothing today. When a follow-up widens the
 *   API to include the author's role-in-group, the badge lights up for
 *   admins and moderators automatically.
 *
 * Visual rule:
 *   - 'member' renders null. The vast majority of authors are members;
 *     surfacing the label everywhere is visual noise.
 *   - 'admin' and 'moderator' surface a tone-distinct chip.
 */

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
