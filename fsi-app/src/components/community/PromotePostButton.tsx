"use client";

// PromotePostButton — small button rendered inside C5's Post.tsx that
// opens PromotePostDialog. Self-contained: keeps its own dialog-open
// state; emits no callbacks back to the parent. The dialog itself
// triggers the API call and a router.refresh() on success.
//
// Visibility (Phase C default rule):
//   * Group admins/moderators can promote.
//   * Platform admins can promote.
//   * Other group members CANNOT see the button — staging via
//     kind='staged' is allowed at the API level but not surfaced in
//     the UI for Phase C. This is conservative: the button shouldn't
//     proliferate before group-admins have the moderation muscle.
//   * Phase D extension: render the button for all members with the
//     dialog defaulting to (and only allowing) kind='staged'. To
//     enable, drop the `canPromote` gate below.
//
// Integration into C5's Post.tsx:
//   - C5 owns Post.tsx. C6 expects Post.tsx to import this component
//     and render it in the post's action row, passing currentUser
//     and post props. See docs/C6-promote-spec.md for the prop shape.
//
// Props:
//   - post: { id, group_id, body, parent_post_id, promoted_at } —
//     the minimum shape needed for the dialog to pre-fill and for the
//     button to render its "Promoted" tag when already promoted.
//   - currentUser: { id, isGroupAdmin, isPlatformAdmin } — the caller's
//     permissions in this group + on the platform. C5's parent passes
//     this through; PromotePostButton trusts the gate.

import { useState } from "react";
import { ArrowUpRight, Check } from "lucide-react";
import { PromotePostDialog } from "./PromotePostDialog";

export interface PromotePostButtonPost {
  id: string;
  group_id: string;
  body: string;
  parent_post_id: string | null;
  promoted_at: string | null;
}

export interface PromotePostButtonUser {
  id: string;
  isGroupAdmin: boolean;
  isPlatformAdmin: boolean;
}

interface PromotePostButtonProps {
  post: PromotePostButtonPost;
  currentUser: PromotePostButtonUser;
}

export function PromotePostButton({ post, currentUser }: PromotePostButtonProps) {
  const [open, setOpen] = useState(false);

  // Replies (parent_post_id != null) are not promotable. Promotion is a
  // top-level-post action.
  if (post.parent_post_id) return null;

  const canPromote = currentUser.isGroupAdmin || currentUser.isPlatformAdmin;
  if (!canPromote) return null;

  // Already promoted — render a static "Promoted" tag, no action.
  if (post.promoted_at) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-alt)] px-2.5 py-1 text-xs font-medium text-[var(--color-text-secondary)]"
        aria-label="This post has been promoted to platform intelligence"
      >
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
        Promoted
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
        aria-label="Promote this post to platform intelligence"
      >
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        Promote to public
      </button>

      {open && (
        <PromotePostDialog
          post={post}
          currentUser={currentUser}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
