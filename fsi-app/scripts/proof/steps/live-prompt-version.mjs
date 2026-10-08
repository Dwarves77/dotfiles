// scripts/proof/steps/live-prompt-version.mjs -- PROOF-3 (lane proof3-chain-steps, 2026-10-07): the live
// FIRST_FETCH_CLASSIFY_PROMPT_VERSION, the value a ledger verdict must carry to be usable.
//
// It is read the way run-ledger-consume.mjs reads it: first-fetch-classify.ts imports through the `@/` alias, which
// only jiti resolves, so the module loads through jiti with the same alias. jiti is an npm package, so it is imported
// lazily inside the function; run-chain-steps.mjs imports this module lazily too, which keeps the runner and its
// tests loadable in the discipline job that runs without npm ci.
//
// This is a read of an exported constant: no prompt is sent anywhere and no model is called.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** @returns {Promise<string>} sha256:<16 hex> */
export async function livePromptVersion() {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
  const mod = await jiti.import("../../../src/lib/llm/first-fetch-classify.ts");
  const v = mod.FIRST_FETCH_CLASSIFY_PROMPT_VERSION;
  if (typeof v !== "string" || !/^sha256:[0-9a-f]{16}$/.test(v)) throw new Error("FIRST_FETCH_CLASSIFY_PROMPT_VERSION is not a sha256:<16 hex> string");
  return v;
}
