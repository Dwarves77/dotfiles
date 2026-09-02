// Smoke-spec stub for next/link (Lane GATES-1, 2026-09-02). See harness.mjs's header for why this
// is aliased in rather than the real module: next/link needs the App Router context an esbuild
// browser bundle has none of. Renders to the same DOM shape Next's <Link> produces (an <a href>),
// so the overflow/placeholder detectors see identical markup; `prefetch` is dropped (a Next-only
// prop with no DOM equivalent) and every other prop passes through untouched.
import React from 'react';

export default function Link({ href, children, prefetch, ...rest }) {
  return React.createElement('a', { href, ...rest }, children);
}
