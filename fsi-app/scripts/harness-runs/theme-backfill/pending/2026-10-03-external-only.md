## Change

Lane EXTERNAL-ONLY (2026-10-03, ADR-042): `src/lib/agent/metadata-vocab.ts`, one of this family's two
governing files, loses the `PLANNING_ASSUMPTION_REGISTER_FIELDS` constant (the planning-assumption register
was removed). `DB_THEME_VALUE_LIST` and `toDbTheme`, the single home `backfill-themes.mjs` classifies against,
are untouched, so what a theme-backfill run means is unchanged. Covered by `system-prompt.test.mjs`, not a
live run.

## Planned run

The next `theme-backfill` dispatch landing `theme-backfill-run-002.json`. Delete this file the moment that
artifact lands.
