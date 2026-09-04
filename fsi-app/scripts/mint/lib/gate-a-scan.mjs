// gate-a-scan.mjs (mint kit) — RE-EXPORT of the single Gate-A scanner, src/lib/agent/gate-a-scan.mjs.
//
// Until 2026-09-04 this file was a hand-mirrored copy of the src/ original ("keep in sync", MINT-RUNBOOK.md);
// lane GATE-A-TOKENS' harvest fix landed here and not in the live copy, which is exactly the drift a copy
// invites. The kit now imports the one implementation. F28 governs both this path (unchanged) and the src/
// file it re-exports, so the mint family's harness hash moves with the real code. Rule 015's textual
// raw-write scan of scripts/ sees nothing here: this file performs no computation of its own.
export * from "../../../src/lib/agent/gate-a-scan.mjs";
