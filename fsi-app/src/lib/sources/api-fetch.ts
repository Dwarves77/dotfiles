// API source fetcher.
//
// Used by the access_method routing switch in /api/agent/run when a
// source's access_method is "api". Returns the same BrowserlessResult
// shape as src/lib/sources/browserless.ts so the downstream pipeline
// (raw persist, classification, intelligence_items write) is unchanged.
//
// The api_response_format column drives parser selection. JSON and XML
// responses are stringified to a normalized text body for the
// classification step; the raw response body is captured in `html` so
// the raw_fetches storage row preserves the bytes exactly as received.

import type { BrowserlessResult } from "@/lib/sources/browserless";

export class ApiFetchError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly renderMs?: number
  ) {
    super(message);
    this.name = "ApiFetchError";
  }
}

export interface ApiFetchSource {
  url: string;
  api_endpoint_url?: string | null;
  api_auth_method?: string | null;
  api_response_format?: string | null;
}

export interface ApiFetchOptions {
  /** Cap stripped-text output length (chars). Default: 100000. */
  maxTextLength?: number;
  /** Network timeout in ms. Default: 20000. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_TEXT = 100_000;

function authHeaders(method: string | null | undefined): Record<string, string> {
  if (!method || method === "none") return {};
  // Operator credentials are read from environment per source-id keyed
  // env vars; the registry-wide secret is the fallback for sources
  // that share a key. Phase 4 wires per-source credentials into the
  // api_auth_secret column and reads from there instead of env.
  const sharedKey = process.env.SOURCE_API_KEY ?? "";
  if (!sharedKey) return {};
  switch (method) {
    case "api_key_header":
      return { "x-api-key": sharedKey };
    case "bearer":
      return { Authorization: `Bearer ${sharedKey}` };
    case "basic":
      return { Authorization: `Basic ${sharedKey}` };
    default:
      return {};
  }
}

function jsonToText(body: string): string {
  try {
    const parsed: unknown = JSON.parse(body);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return body;
  }
}

function xmlToText(body: string, maxChars: number): string {
  return body
    .replace(/<\?xml[^?]*\?>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
}

export async function apiFetch(
  source: ApiFetchSource,
  options: ApiFetchOptions = {}
): Promise<BrowserlessResult> {
  const endpoint = source.api_endpoint_url ?? source.url;
  if (!endpoint) {
    throw new ApiFetchError("api_endpoint_url and url both empty");
  }

  const { maxTextLength = DEFAULT_MAX_TEXT, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  const headers: Record<string, string> = {
    "User-Agent": "CarosLedge-Ingest/1.0",
    Accept: "application/json, application/xml, text/xml, */*;q=0.5",
    ...authHeaders(source.api_auth_method),
  };

  // Some endpoints expect the api key as a query param. Append when
  // configured, never overwriting existing params.
  let url = endpoint;
  if (source.api_auth_method === "api_key_query") {
    const sharedKey = process.env.SOURCE_API_KEY ?? "";
    if (sharedKey) {
      const sep = endpoint.includes("?") ? "&" : "?";
      url = `${endpoint}${sep}api_key=${encodeURIComponent(sharedKey)}`;
    }
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  let status = 0;
  try {
    const res = await fetch(url, { method: "GET", headers, signal: controller.signal });
    status = res.status;
    if (!res.ok) {
      const body = await res.text();
      throw new ApiFetchError(
        `API ${res.status}: ${body.slice(0, 200)}`,
        res.status,
        Date.now() - start
      );
    }
    const html = await res.text();
    const format = (source.api_response_format ?? "json").toLowerCase();
    let text: string;
    if (format === "json") {
      text = jsonToText(html).slice(0, maxTextLength);
    } else if (format === "xml" || format === "rss" || format === "atom") {
      text = xmlToText(html, maxTextLength);
    } else if (format === "html") {
      text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxTextLength);
    } else {
      text = html.replace(/\s+/g, " ").trim().slice(0, maxTextLength);
    }
    return {
      status,
      html,
      text,
      htmlLength: html.length,
      textLength: text.length,
      renderMs: Date.now() - start,
    };
  } catch (e: unknown) {
    if (e instanceof ApiFetchError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    throw new ApiFetchError(msg, status || undefined, Date.now() - start);
  } finally {
    clearTimeout(timeoutHandle);
  }
}
