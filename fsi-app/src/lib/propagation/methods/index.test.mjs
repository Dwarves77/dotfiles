// methods/index.test.mjs — proves the registerMethod()/METHODS seam: registration, lookup, the duplicate-
// registration guard, and that METHODS is a read-only surface (no back door around registerMethod). Pure —
// zero npm dependencies.
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerMethod, getMethod, methodKey, METHODS, __clearRegistryForTests } from "./index.ts";

test.beforeEach(() => {
  __clearRegistryForTests();
});

test("methodKey: composes methodId@methodVersion", () => {
  assert.equal(methodKey("corridor-emission-blend", "1"), "corridor-emission-blend@1");
});

test("registerMethod + getMethod: a registered method is retrievable by its exact (id, version)", () => {
  const fn = () => ({ ok: true, derivation: "calculated", originClass: "derived", lifecycle: "verified", admissibility: "analysis_ok", confidence: 0.8 });
  registerMethod("m", "1", fn);
  assert.equal(getMethod("m", "1"), fn);
});

test("getMethod: an unregistered (id, version) returns undefined, never throws", () => {
  assert.equal(getMethod("nope", "1"), undefined);
});

test("getMethod: a different version of a registered method is NOT found (versions are independent keys)", () => {
  const fn1 = () => ({ ok: true, derivation: "calculated", originClass: "derived", lifecycle: "verified", admissibility: "analysis_ok", confidence: 0.8 });
  registerMethod("m", "1", fn1);
  assert.equal(getMethod("m", "2"), undefined);
});

test("registerMethod RED: registering the same (id, version) twice throws — never silently overwrites", () => {
  const fn1 = () => ({ ok: true, derivation: "calculated", originClass: "derived", lifecycle: "verified", admissibility: "analysis_ok", confidence: 0.8 });
  const fn2 = () => ({ ok: true, derivation: "calculated", originClass: "derived", lifecycle: "verified", admissibility: "analysis_ok", confidence: 0.9 });
  registerMethod("m", "1", fn1);
  assert.throws(() => registerMethod("m", "1", fn2), /already registered/);
  // the original registration is untouched by the failed second attempt
  assert.equal(getMethod("m", "1"), fn1);
});

test("registerMethod: a NEW version of a method already registered is fine (versions never collide)", () => {
  const fn1 = () => ({ ok: true, derivation: "calculated", originClass: "derived", lifecycle: "verified", admissibility: "analysis_ok", confidence: 0.8 });
  const fn2 = () => ({ ok: true, derivation: "calculated", originClass: "derived", lifecycle: "verified", admissibility: "analysis_ok", confidence: 0.9 });
  registerMethod("m", "1", fn1);
  assert.doesNotThrow(() => registerMethod("m", "2", fn2));
  assert.equal(getMethod("m", "1"), fn1);
  assert.equal(getMethod("m", "2"), fn2);
});

test("METHODS.get / METHODS.has / METHODS.key mirror the module-level functions", () => {
  const fn = () => ({ ok: true, derivation: "calculated", originClass: "derived", lifecycle: "verified", admissibility: "analysis_ok", confidence: 0.8 });
  registerMethod("m", "1", fn);
  assert.equal(METHODS.has("m", "1"), true);
  assert.equal(METHODS.has("m", "2"), false);
  assert.equal(METHODS.get("m", "1"), fn);
  assert.equal(METHODS.key("m", "1"), "m@1");
});

test("METHODS.registeredKeys: reflects every registration, for diagnostics only", () => {
  registerMethod("a", "1", () => ({}));
  registerMethod("b", "2", () => ({}));
  assert.deepEqual(METHODS.registeredKeys().sort(), ["a@1", "b@2"]);
});

test("METHODS is frozen: assigning a new property is a silent no-op in sloppy mode / throws in strict — either way REGISTRY itself is never exposed", () => {
  assert.equal(Object.isFrozen(METHODS), true);
});
