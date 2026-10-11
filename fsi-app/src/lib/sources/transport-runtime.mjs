// @ts-check

import { escalateFetch } from "./transport-escalation.mjs";

/**
 * @typedef {{ status?: number, text?: string, truncated?: boolean, fullLength?: number, fullTextLength?: number, cap?: number }} RichResult
 */

/**
 * Run the escalation ladder with the injected transports and adapt the verdict to a FetchResult-shaped object.
 * Each injected transport returns a RichResult; the winning transport's truncation metadata is preserved.
 *
 * @param {string} url
 * @param {number} max  the char cap for this fetch (reported back as `cap`).
 * @param {{
 *   cacheGet?: (url:string)=>Promise<RichResult|null>|RichResult|null,
 *   apiFetch?: (url:string)=>Promise<RichResult|null>|RichResult|null,
 *   directFetch?: (url:string)=>Promise<RichResult>|RichResult,
 *   browserlessRender?: (url:string)=>Promise<RichResult>|RichResult,
 *   seekMore?: (url:string)=>Promise<any>|any,
 *   renderAllowed?: boolean,
 * }} [deps]
 * @returns {Promise<{ text:string, truncated:boolean, fullLength:number, cap:number, transport:string,
 *   outcome:'content'|'seek_more'|'no_reachable_source', holdReason:string|null, seekMoreTask:any,
 *   reason:string|null, lastFailureText:string }>}
 */
export async function escalateToFetchResult(url, max, deps = {}) {
  // renderAllowed (D25, defect-fix-plan-2026-09-12, lane L16 -- coordinator correction 2026-09-13):
  // default true preserves every existing caller's behavior byte-for-byte. false REMOVES "render" from
  // the ladder entirely -- not by filtering selectTransportOrder's own order (that stays host-driven,
  // unchanged), but by never handing escalateFetch a browserlessRender closure at all. escalateFetch's own
  // queue loop skips any transport whose impl is falsy (`if (tried.has(t) || !impl[t]) continue;`) and its
  // JS-shell escalation push is ALSO gated on `impl.render` being truthy -- so with renderAllowed:false a
  // JS-shell or block verdict on the direct transport falls straight through to the ladder's own (f)
  // exhaustion path (NO_REACHABLE_SOURCE), never touching Browserless, even if a `browserlessRender` dep
  // is (redundantly) passed in. This is the free-transport-only mode capture-static-primaries.mjs uses --
  // see that file's header for why a maintenance step that must spend $0 needs a way to run the SAME
  // tested per-failure-class ladder with the paid tier structurally unreachable, rather than reimplementing
  // a second, divergent transport chooser.
  const { cacheGet, apiFetch, directFetch, browserlessRender, seekMore, renderAllowed = true } = deps;
  // Capture each transport's RICH result (keyed by the ladder's transport name) so the winning transport's
  // truncation metadata — dropped by the verdict — survives, and so a terminal failure's raw body is reachable.
  /** @type {Map<string, RichResult>} */
  const captured = new Map();
  /** @param {string} name @param {((u:string)=>Promise<RichResult|null>|RichResult|null)|undefined} fn */
  const bind = (name, fn) =>
    fn
      ? async (/** @type {string} */ u) => {
          const r = (await fn(u)) || null;
          if (r) captured.set(name, r);
          // escalateFetch classifies on { status, text } only — hand it exactly that (never mutate the rich r).
          return r ? { status: r.status ?? 200, text: r.text ?? "" } : r;
        }
      : undefined;

  const verdict = await escalateFetch(url, {
    cacheGet: bind("cache", cacheGet),
    apiFetch: bind("api", apiFetch),
    directFetch: bind("direct", directFetch),
    browserlessRender: renderAllowed ? bind("render", browserlessRender) : undefined,
    seekMore,
  });

  const base = {
    text: "",
    truncated: false,
    fullLength: 0,
    cap: max,
    transport: verdict.transport,
    outcome: verdict.outcome,
    holdReason: verdict.holdReason,
    seekMoreTask: verdict.seekMoreTask,
    reason: /** @type {string|null} */ (null),
    lastFailureText: "",
  };

  if (verdict.outcome === "content") {
    const win = captured.get(verdict.transport) || {};
    const text = verdict.text || win.text || "";
    return {
      ...base,
      text,
      truncated: !!win.truncated,
      fullLength: win.fullLength ?? win.fullTextLength ?? text.length,
      cap: win.cap ?? max,
    };
  }

  // NON-content (seek_more / no_reachable_source): expose the terminal attempt's raw body + failure class so the
  // PRIMARY caller (which re-runs detectRoadblock and MUST NOT lose the reason signal) can carry it. The error
  // body is NEVER returned as `text` and NEVER stored — the caller decides (corroborators drop it outright).
  const last = verdict.attempts && verdict.attempts.length ? verdict.attempts[verdict.attempts.length - 1] : null;
  const lastFailureText = (last && captured.get(last.transport)?.text) || "";
  return { ...base, reason: last ? last.class : null, lastFailureText };
}
