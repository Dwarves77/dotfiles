# Supabase Migrations Inventory

Catalog of every migration file at `fsi-app/supabase/migrations/` + its application status in the live DB ledger (`supabase_migrations.schema_migrations`). Maintained per the Inventory-artifact emission rule.

## Status

**STUB** (created 2026-05-20). Last migration applied per ledger as of this commit: **097** (q4_bias_retune_option_b).

Next substantial dispatch that ships a migration populates this inventory per the 11th binding rule.

## Expected columns when populated

| Column | Source |
|---|---|
| Version | Filename prefix (e.g., `097`) |
| Name | Filename body (e.g., `q4_bias_retune_option_b`) |
| Purpose | One-line summary from migration header |
| Applied to live DB | yes / no / date |
| Ledger backfilled | yes / no |
| Touched by | Most-recent commit SHA + dispatch reference |

## Source of truth

Migration files + live DB ledger:

```sql
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
```

## Maintenance trigger

Any dispatch that ships a migration MUST update this inventory + emit `Inventory-emission: docs/inventories/migrations.md +1 entry (097)` style commit line.
