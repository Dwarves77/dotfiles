# Stream C audit fixes

Three production bugs surfaced in the audit + Stream C investigation.
This doc captures the diagnosis and the minimum-diff fix shipped on
branch `polish/audit-fixes`.

---

## Bug 1 — AI prompt bar opened nothing

### Diagnosis

- `fsi-app/src/components/ui/AiPromptBar.tsx:50` correctly dispatches a
  `CustomEvent("open-ask-assistant", { detail: { question } })` when the
  user submits the inline prompt.
- `fsi-app/src/components/AskAssistant.tsx:24` listened for the event
  but the handler only ran `setIsOpen(true)` — the `detail.question`
  payload was discarded, so the panel opened blank and the user had to
  retype.
- `AskAssistant` was never imported in the tree. `git grep AskAssistant`
  returns only the file itself plus a `docs/SCOPE_AUDIT.md` mention, so
  the panel was unmountable and the event listener never registered.

### Fix

- `fsi-app/src/components/AskAssistant.tsx`:
  - Event handler now reads `event.detail.question`, sets `input`, and
    calls `handleAskWithQuestion(q)` on the next tick so state-timing
    doesn't drop the auto-submit.
  - `handleAsk` extracted into `handleAskWithQuestion(rawQuestion)` so
    the event path can submit a question without rounding through
    React state.
  - Old `handleAsk` retained as a thin wrapper
    (`() => handleAskWithQuestion(input)`) so the existing JSX bindings
    in the input/send button keep working.
- `fsi-app/src/components/AppShell.tsx`:
  - Imports `AskAssistant` and `useAuth`.
  - Mounts `<AskAssistant />` as a sibling of the main shell column,
    gated on `user` (matches the existing auth-route exclusion logic
    for `/login` + `/auth`). The panel has its own fixed positioning
    so layout is undisturbed.

---

## Bug 2 — React #418 hydration error on `/research`

### Diagnosis

- `fsi-app/src/components/research/ResearchView.tsx:631-637` (pre-fix)
  formatted the "First seen" column with
  `new Date(item.addedDate).toLocaleDateString("en-GB", { ... })`.
- Server SSR runs in UTC; the browser renders in the user's local TZ.
  For dates near midnight UTC the two outputs diverge (e.g. server
  emits "5 May 2026", client emits "4 May 2026"), which Next then
  flags as React #418 (hydration text mismatch).

### Fix

- `fsi-app/src/components/research/ResearchView.tsx`:
  - Added module-level `formatDateUTC(iso)` helper that uses
    `getUTCDate / getUTCMonth / getUTCFullYear` so server and client
    render the same string regardless of TZ.
  - Replaced the `toLocaleDateString` call inside `PipelineRow` with
    `formatDateUTC(item.addedDate)`. Output format ("5 May 2026")
    matches the previous "en-GB" short pattern.

---

## Bug 3 — Admin Issues Queue intermittent landing

### Diagnosis

- `fsi-app/src/lib/hooks/useAdminAttention.ts` derives `enabled` from
  `useAuth().loading`, `user`, and `useWorkspaceStore().userRole`.
  On first paint `userRole` is `undefined` (workspaceStore hydrates
  from the org-membership fetch in `AuthProvider`), so `enabled=false`.
- The polling effect already had `enabled` in its dep array and called
  `startPolling()` on flip, which calls `fetchCounts()` once before
  starting the interval. In theory that should populate the badge.
- In practice the immediate fetch was racy: on the very first
  enabled→true flip, document visibility could short-circuit the
  `if (visible) startPolling()` line, leaving the queue empty until
  the next visibility change, and a stale `counts === null` would
  surface as an empty admin landing.

### Fix

- `fsi-app/src/lib/hooks/useAdminAttention.ts:124-158`:
  - Added an unconditional `fetchCounts()` call inside the effect on
    the `enabled === true` branch, separate from the visibility-gated
    `startPolling()`. This guarantees the queue populates as soon as
    `enabled` flips true even if the tab is hidden, and removes the
    "first admin paint shows empty" race.
  - Added `fetchCounts` to the effect dependency array. `fetchCounts`
    is stable (`useCallback` with `[]` deps), so this does not cause
    extra re-runs — it just makes the dependency relationship
    explicit for the linter and future maintainers.
  - `enabledRef` pattern preserved for use inside the interval
    callback (it still guards the network call from firing after a
    role transition during an in-flight tick).

---

## Files modified

- `fsi-app/src/components/AppShell.tsx`
- `fsi-app/src/components/AskAssistant.tsx`
- `fsi-app/src/components/research/ResearchView.tsx`
- `fsi-app/src/lib/hooks/useAdminAttention.ts`
- `docs/STREAM-C-FIXES.md` (this file, new)
