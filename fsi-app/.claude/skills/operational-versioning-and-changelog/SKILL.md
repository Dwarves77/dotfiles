---
name: operational-versioning-and-changelog
description: STUB. Append-only versioning + operator-visible change log on every detail page. Implements Section 6.6. Replaces today's three storage shapes (intelligence_item_versions, item_changelog, intelligence_changes, version_history JSONB) with one canonical store.
---

# Operational: Versioning and Changelog

## Purpose

When an item changes, the change is logged with who/when/why/what-changed-from-what. Operators see "this rule was amended on [date]; previously the threshold was X, now it is Y." Rollback is possible. Audit trail for legal defensibility.

Today: three storage shapes for change history; one is current (`intelligence_item_versions`, 8 rows from trigger), two are dead. No operator-visible change-tracking.

## When to use

- Every UPDATE to `intelligence_items` (trigger captures the diff)
- Every regeneration (full version snapshot per pre-existing trigger)
- Every reclassification (writer attributed)

## Inputs

- The UPDATE statement
- Previous row state
- New row state
- Writer identity (Haiku / Sonnet / human / migration / classifier-skill)

## Outputs

To canonical version table:
- `intelligence_item_id`
- `version_number` (sequential per item)
- `state_at` (full row snapshot or diff)
- `writer` (which path made the change)
- `changed_at` (timestamp)
- `change_summary` (operator-readable description, computed by writer)

## Operator-visible change log (TO BUILD)

Every detail page renders:
- "Last revised [date]"
- "Changes in this revision: [summary]"
- Click to see full version diff
- Items unchanged for > 90 days carry "Stable as of [date]" indicator
- Dashboard "What changed" feed shows actual changes, not re-ingestions

## Inherits

- [[rule-cross-reference-integrity]] (version log is canonical; surfaces read it)

## Composition

Triggered by UPDATE on `intelligence_items`. Composed with [[writer-summary-card-surface]] (renders "last revised" annotation).

## Audit cross-reference

- v2 audit Section 6.6 (versioning and audit trail)
- v2 audit Section 3 / S10 (modern relational tables populated only by 010 backfill)
- Schema audit: catalogs three storage shapes for change history
