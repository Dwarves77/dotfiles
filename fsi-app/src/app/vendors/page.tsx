import { permanentRedirect } from "next/navigation";

/**
 * /vendors — moved to /community/vendors as part of PR-D IA refactor
 * (2026-05-06). The canonical 308 redirect is configured in
 * next.config.ts; this server component is a defense-in-depth
 * fallback so the route still redirects if Next config redirects
 * are ever bypassed (e.g. dev with rewrite middleware shadowing).
 *
 * permanentRedirect throws a NEXT_REDIRECT signal with status 308.
 */
export default function VendorsRedirect(): never {
  permanentRedirect("/community/vendors");
}
