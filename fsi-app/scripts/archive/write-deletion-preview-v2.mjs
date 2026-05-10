import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FSI_APP_ROOT = resolve(__dirname, "..");
const DOTFILES_ROOT = resolve(FSI_APP_ROOT, "..");

const d = JSON.parse(readFileSync(resolve(FSI_APP_ROOT, "scripts/tmp/deletion-preview-title-only.json"), "utf8"));

const hostOf = (u) => { try { return new URL(u).host; } catch { return "(no-url)"; } };
const hardDelete = d.hard_delete.slice().sort((a, b) => (hostOf(a.source_url) || "").localeCompare(hostOf(b.source_url) || ""));

const lines = [];
const push = (s) => lines.push(s);

push("# Deletion preview, 2026-05-10 (revised, title-only matching)");
push("");
push("Read-only diff preview. NO DELETE or UPDATE has been executed. Per-row approval required before any destructive action. Replaces prior preview which used title + summary + full_brief matching and produced false positives.");
push("");
push("Generated from snapshot post-cold-start. " + d.total_items + " total intelligence_items in scope.");
push("");
push("---");
push("");

push("## Bucket A: HARD DELETE candidates (title-pattern garbage extractions)");
push("");
push("**Count: " + hardDelete.length + " items.**");
push("");
push("### Signature match criteria");
push("");
push("Pattern matching restricted to `title` field only (per Claude Code review). Garbage extractions have titles literally describing a fetch failure. Legitimate items have content-describing titles even when the body mentions terms like 'Cloudflare' or 'security check' in passing.");
push("");
push("Title regex (three buckets):");
push("");
push("- **blocked**: `cloudflare`, `just a moment`, `checking your browser`, `attention required`, `challenge-platform`, `captcha`, `recaptcha`, `hcaptcha`, `security check`, `security verification`, `access denied`, `access restricted`, `access issue`, `access error`, `please verify you are human`, `enable javascript`, `page verification`, `website security/access/verification`, `verification page/portal`");
push("- **not_found**: `404`, `404 not found`, `404 page`, `404 error`, `page not found`, `no longer (available|exists)`, `requested url .+ not found`, `page (has moved|cannot be found|doesn't exist)`, `page error`, `directory and services portal.*404`, `website page not found`");
push("- **maintenance**: `under maintenance`, `temporarily unavailable`, `service unavailable`, `we'll be back`, `scheduled maintenance`, `website service unavailable`, `feed unavailable`, `rss feed unavailable`, `feed change notice`");
push("");
push("Validation against prior 6 false positives confirmed: zero of {Battery & Electric Vehicle Technology, ADB Sustainable Transport, Stockholm Environment Institute, ITF International Transport Forum, Journal of Sustainable Transport, Erasmus Smart Port} appear in this title-only list.");
push("");

push("### Reason breakdown");
push("");
const reasonCounts = {};
for (const h of hardDelete) for (const r of h._reasons) reasonCounts[r] = (reasonCounts[r] || 0) + 1;
push("| Reason | Count |");
push("|---|---:|");
for (const [r, c] of Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])) push("| " + r + " | " + c + " |");
push("");

push("### By host (top 15)");
push("");
const byHost = {};
for (const h of hardDelete) byHost[hostOf(h.source_url)] = (byHost[hostOf(h.source_url)] || 0) + 1;
push("| Host | Count |");
push("|---|---:|");
for (const [h, c] of Object.entries(byHost).sort((a, b) => b[1] - a[1]).slice(0, 15)) push("| " + h + " | " + c + " |");
push("");
push("Most affected hosts are tier-1 regulators behind Cloudflare or recently-restructured government portals (irena.org, parliament.uk, oecd.org, transportation.gov). The fetch-quality filter (PR #86) prevents this on next attempt; the source rows themselves should NOT be removed, only the garbage intelligence_items rows.");
push("");

push("### Full row list (sorted by host)");
push("");
push("| # | id | title | source host | reasons | created |");
push("|---|---|---|---|---|---|");
let i = 1;
for (const h of hardDelete) {
  const reasons = h._reasons.join(",");
  const title = (h.title || "").slice(0, 90).replace(/\|/g, "\\|");
  push("| " + i + " | `" + h.id + "` | " + title + " | " + hostOf(h.source_url) + " | " + reasons + " | " + (h.created_at || "").slice(0, 10) + " |");
  i++;
}
push("");

push("### SQL preview (DO NOT RUN; for review only)");
push("");
push("```sql");
push("-- " + hardDelete.length + " rows. Wrap in transaction. Verify count matches expected before commit.");
push("BEGIN;");
push("DELETE FROM intelligence_items WHERE id IN (");
push(hardDelete.map((h) => "  '" + h.id + "'").join(",\n"));
push(");");
push("-- Expected: DELETE " + hardDelete.length);
push("-- COMMIT or ROLLBACK after manual confirm.");
push("```");
push("");
push("---");
push("");

push("## Bucket B: FLAG-AND-HIDE candidates (true topic-relevance failures)");
push("");
push("**Count: " + d.topic_failures.length + " items.**");
push("");
push("Mechanism: migration 062 adds `intelligence_items.hidden_reason TEXT NULL`. UPDATE sets `pipeline_stage='archived'` AND `hidden_reason` populated. The integrity-flag column `agent_integrity_phrase` stays single-purpose (not overloaded).");
push("");

push("### Items + draft reason text");
push("");
for (const t of d.topic_failures) {
  push("#### `" + t.id + "`");
  push("");
  push("- **Title:** " + (t.title || "(empty)"));
  push("- **Source:** " + hostOf(t.source_url));
  push("- **Source URL:** " + t.source_url);
  push("- **Created:** " + (t.created_at || "").slice(0, 19));
  push("- **Summary preview:** " + (t.summary || "").slice(0, 200));
  push("");
  let draftReason = "";
  if (t.id === "eb08d16c-f51c-44bd-8f50-0fada86c67d4") {
    draftReason = "topic_out_of_scope: NYC City Council immigration / sanctuary city lawsuit. Subject matter is sanctuary city immigration enforcement, not freight, transport, sustainability, or any vertical Caros Ledge serves. Source (council.nyc.gov) is legitimate and should remain in the registry; topic gate, not source gate.";
  } else if (t.id === "0554d47e-3e90-40cb-aced-fcfb42ff793d") {
    draftReason = "topic_out_of_scope: Latvian Saeima homepage. The page is a parliamentary portal landing, not a freight, sustainability, transport, or operations item. The Haiku classifier promoted a homepage to an intelligence item. Source may be legitimate for future ingestion of specific Latvian transport / sustainability bills; current item is the wrong page.";
  }
  push("- **Draft `hidden_reason`:**");
  push("");
  push("  > " + draftReason);
  push("");
}

push("### SQL preview (DO NOT RUN; for review only)");
push("");
push("```sql");
push("-- After migration 062 applies (adds hidden_reason column):");
push("BEGIN;");
for (const t of d.topic_failures) {
  let r = "";
  if (t.id === "eb08d16c-f51c-44bd-8f50-0fada86c67d4") r = "topic_out_of_scope: NYC City Council immigration / sanctuary city lawsuit. Subject matter is sanctuary city immigration enforcement, not freight, transport, sustainability, or any vertical Caros Ledge serves. Source (council.nyc.gov) is legitimate and should remain in the registry; topic gate, not source gate.";
  else if (t.id === "0554d47e-3e90-40cb-aced-fcfb42ff793d") r = "topic_out_of_scope: Latvian Saeima homepage. The page is a parliamentary portal landing, not a freight, sustainability, transport, or operations item. The Haiku classifier promoted a homepage to an intelligence item. Source may be legitimate for future ingestion of specific Latvian transport / sustainability bills; current item is the wrong page.";
  push("UPDATE intelligence_items");
  push("  SET pipeline_stage = 'archived',");
  push("      hidden_reason = '" + r.replace(/'/g, "''") + "'");
  push("  WHERE id = '" + t.id + "';");
}
push("-- Expected: UPDATE " + d.topic_failures.length);
push("-- COMMIT or ROLLBACK.");
push("```");
push("");
push("---");
push("");

push("## Approval gate");
push("");
push("Per dispatch v2:");
push("");
push("- **Bucket A** (" + hardDelete.length + " rows hard delete): approve all, deny, or sub-select by id");
push("- **Bucket B** (" + d.topic_failures.length + " rows flag-and-hide): approve reason text per row + confirm migration 062 apply");
push("");
push("On approval, a separate execution script will run against the exact id list in this doc and refuse to operate on any id not present here.");
push("");
push("Migration 062 must be applied before Bucket B UPDATE can run (`hidden_reason` column required).");
push("");

writeFileSync(resolve(DOTFILES_ROOT, "docs/deletion-preview-2026-05-10.md"), lines.join("\n"), "utf8");
console.log("Wrote revised preview to docs/deletion-preview-2026-05-10.md");
console.log("Bucket A:", hardDelete.length);
console.log("Bucket B:", d.topic_failures.length);
