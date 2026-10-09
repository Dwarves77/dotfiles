# 2026-10-06 lane C-TOGGLE (c-toggle-promote): remove the promote notification toggle (ADR-041)

## Ruling

Operator, 2026-10-06, verbatim: "Remove the toggle." The Settings toggle "When a post gets promoted"
(`on_promote`) belonged to the editorial promotion path that `docs/decisions/ADR-041-community-is-social-only.md`
retired. Context: `docs/ops/session-log.d/2026-10-03-c-social.md`.

## Accomplished

- `fsi-app/src/components/profile/NotificationPreferences.tsx`: removed the `on_promote` row, the type field, the default, the select column and the upsert key. Header comment notes the column is no longer read or written.
- `fsi-app/src/lib/notifications/dispatch.ts`: `"promote"` removed from `NotificationKind`. No emitter existed (grep of `src`, `scripts`, `.discipline` for `kind: "promote"` found none).
- `fsi-app/src/components/community/NotificationsList.tsx`: removed the `promote` label, icon case and the `Star` import (the `Kind` type derives from `NotificationKind`).
- `fsi-app/src/app/api/community/notifications/route.ts` and `counts/route.ts`: comments only, kind list corrected (neither route validates kind).
- `fsi-app/.discipline/notification-preferences-save-path.test.mjs` (write set expanded by the coordinator): `OWED_DROP_COLUMNS = ["on_promote"]` exempts the column from the inverse "every column is upserted" check only, and a new test asserts the upsert never names it. The sanity test still pins the full migration 032 column list.

## Read and reused

Read CLAUDE.md, the lane contract, ADR-041, the C-SOCIAL log, ux-laws, the four source files above and the save-path discipline test in full. Reused the existing `NotificationPreferences.npmtest.mjs` (extended) and the source-text `.npmtest.mjs` pattern; no new module. Consumers of `NotificationKind`: `NotificationsList.tsx` only (grep). Consumers of `NotificationPreferences`: `SettingsPage.tsx`, `OnboardingWizard.tsx`.

## Save safety

[CONFIRMED, read of migration 032] `on_promote` is `boolean not null default true`, so an upsert that omits it inserts a valid row and an update leaves the stored value alone. The save cannot fail because the column still exists.

## Red then green

- `dispatch-kinds.npmtest.mjs` (new): failed against old code on the `promote` match in `NotificationsList.tsx` (the first run's failure output was read); passes now.
- `NotificationPreferences.npmtest.mjs` (two new tests): written before the edit, passed after it; the old component contains `on_promote` in four code lines, so the first test cannot pass against it.
- Save-path discipline test, new component with the old test: failed with "NotificationPreferences.tsx no longer upserts column on_promote". With the exclusion: 9 of 9 pass.
- Local: 16 of 16 pass across the three files; `npx tsc --noEmit` clean.

## Owed (not done, by rule)

- Data migration, population-stage, two-track note: schema DDL applies via Supabase CLI before dependent code commits, data migrations run after merge. Owed: `ALTER TABLE notification_preferences DROP COLUMN on_promote`. When it lands, remove `OWED_DROP_COLUMNS` and the `on_promote` entry in the discipline test's column pin. [WORK: PLAN-2]
- Owed migration: `notifications_kind_check` (migration 032 L48) still allows `'promote'`; amend it to drop that kind in the same migration batch. Live rows of that kind are not checked here (no database access in this lane). [WORK: PLAN-2]
- Stale doc text, not in the write set: `docs/plans/C7-notifications-spec.md` still describes `on_promote`. [WORK: DOCS-5]

## DESIGN CHANGES OWED (for Claude Design, rule 20)

The Settings artboard (p15, notifications card) in `docs/design/handoff-2026-09-07/Caros Ledge UI System.dc.html` draws the "When a post gets promoted" row ("Editorial promoted your post or a verifier signed off"). Removed from the build by ADR-041 and the 2026-10-06 ruling; Claude Design to remove the row. The settings card now shows four toggles plus the locked invitations row.

## UX compliance

Block touched: Settings and onboarding step 4 notification preferences card. This lane only removes one toggle row.

- Primary goal: choose which notifications to receive; unchanged.
- Path in steps: one tap per toggle; one row shorter. No step added.
- One primary action: the toggles are peers and the master switch comes first, unchanged.
- Feedback state per async action: save keeps its Saving, Saved and Couldn't save states untouched.
- Touch targets: remaining rows keep min-height 48; nothing resized.
- Row components: no row component added or changed; `NotifRow` untouched (its geometry tests still pass).
