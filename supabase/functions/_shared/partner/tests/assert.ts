// Minimal assertion helpers, matching the dependency-free style of the other
// edge function tests (see finalize-quick-build-parse/diff_test.ts).

export const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

// Object key order is ignored (jsonb does not preserve it); array order is not.
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonical((value as Record<string, unknown>)[k])]));
  }
  return value;
};

export const assertEquals = (actual: unknown, expected: unknown, message?: string) => {
  const a = JSON.stringify(canonical(actual));
  const e = JSON.stringify(canonical(expected));
  if (a !== e) throw new Error(`${message || "assertEquals"}: ${a} !== ${e}`);
};

export const assertRejects = async (fn: () => Promise<unknown>, label: string) => {
  try {
    await fn();
  } catch {
    return;
  }
  throw new Error(`expected rejection: ${label}`);
};
