// src/lib/agent/two-pass-generate.mjs
//
// Reactive 2-pass brief generation, as a PURE orchestration (stream + yaml-locate injected) so the
// branching is unit-testable without network — same DI pattern as anthropic-stream.mjs.
//
// DEFAULT: ONE call (body + New Sources + YAML; NO ledger — it was dropped as vestigial: parseAgentOutput
// discards the inline ledger and grounding re-extracts its own). Only if that call TRUNCATES
// (stop_reason==='max_tokens') do we split: the brief BODY is the informative content and MUST come out
// WHOLE, so PASS 1 regenerates the body alone at the full ceiling and PASS 2 derives ONLY the 18-field
// YAML from the COMPLETE body. The body is NEVER split across passes (the section-coherence guarantee);
// pass 2 NEVER re-emits the body (no duplication). Normal briefs stay 1 (now-smaller) call.

export const GEN_MAX_TOKENS = 32000;
export const YAML_MAX_TOKENS = 8000;
const MODEL = "claude-sonnet-4-6";

const PASS1_SUFFIX = `\n\n=== TWO-PASS MODE (PASS 1 of 2) ===\nOutput ONLY the brief body and the "## New Sources Identified" table. DO NOT emit the YAML frontmatter block in this response — it is requested separately in pass 2. End immediately after the New Sources Identified table (or after the body if there are none).`;
const pass2Prompt = (body) => `=== TWO-PASS MODE (PASS 2 of 2) ===\nBelow is the COMPLETE, FINAL brief body. Emit ONLY the YAML frontmatter block (the 18 fields, fenced with --- on its own line opening and closing) derived from this body, per your contract. DO NOT re-emit the body. DO NOT emit any Claim Provenance Ledger. Output the --- ... --- block and nothing else.\n\nBRIEF BODY:\n${body}`;

const truncErr = (msg) => { const e = new Error(msg); e.fatal = false; return e; };

/**
 * @param {object} opts
 * @param {string|Array<{type:string,text:string,cache_control?:{type:string}}>} opts.system - plain string OR
 *        the prompt-cache block array (Phase-3a: pool as cached first block); passed to the body verbatim,
 *        so the pass-1/pass-2 truncation split shares the cached prefix.
 * @param {string} opts.user
 * @param {(args:{apiKey:string,body:object})=>Promise<{text:string,stopReason:(string|null)}>} opts.stream
 * @param {(text:string)=>({start:number}|null)} opts.findYaml  - locate a trailing YAML block (to strip stray pass-1 YAML)
 * @param {string} opts.apiKey
 * @param {number} [opts.genMax]
 * @param {number} [opts.yamlMax]
 * @returns {Promise<string>} combined brief text for parseAgentOutput
 */
export async function twoPassGenerate({ system, user, stream, findYaml, apiKey, genMax = GEN_MAX_TOKENS, yamlMax = YAML_MAX_TOKENS }) {
  const single = await stream({ apiKey, body: { model: MODEL, max_tokens: genMax, system, messages: [{ role: "user", content: user }] } });
  if (single.stopReason !== "max_tokens") return single.text; // normal path: ONE call (body + YAML)

  // TRUNCATED → genuinely large brief. PASS 1: BODY ONLY (no YAML) at the full ceiling.
  const p1 = await stream({ apiKey, body: { model: MODEL, max_tokens: genMax, system, messages: [{ role: "user", content: user + PASS1_SUFFIX }] } });
  if (p1.stopReason === "max_tokens") {
    throw truncErr(`ANTHROPIC body truncated at max_tokens (${genMax}) even body-only — brief body too large for a single pass (future: N-pass by section).`);
  }
  // Strip any YAML the model emitted anyway, so the stored body is clean and pass 2's YAML is the only one.
  const yblk = findYaml(p1.text);
  const body = (yblk ? p1.text.slice(0, yblk.start) : p1.text).replace(/\s+$/, "");

  // PASS 2: derive ONLY the 18-field YAML from the COMPLETE body.
  const p2 = await stream({ apiKey, body: { model: MODEL, max_tokens: yamlMax, system, messages: [{ role: "user", content: pass2Prompt(body) }] } });
  if (p2.stopReason === "max_tokens") {
    throw truncErr(`ANTHROPIC YAML pass truncated at max_tokens (${yamlMax}) — unexpected for an 18-field block.`);
  }
  return `${body}\n\n${p2.text.trim()}`; // parseAgentOutput locates the YAML at the very end
}
