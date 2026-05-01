/**
 * UI primitives barrel — Phase C component system.
 *
 * Card / StatCard / RowCard form the three-card system documented in
 * design_handoff_2026-04/preview (`cl-card`, `cl-stat-card`, `cl-row-card`).
 * PriorityBadge is the single badge primitive used everywhere a priority
 * level needs visual treatment (replaces the older Badge component, which
 * the orchestrator will remove once all callsites are migrated).
 *
 * Other ui/* components (Button, Toast, Toggle, ModeBadge, etc.) are not
 * re-exported here yet — add as the migration progresses.
 */

export { Card } from "./Card";
export { RowCard } from "./RowCard";
export { StatCard } from "./StatCard";
export { PriorityBadge } from "./PriorityBadge";
