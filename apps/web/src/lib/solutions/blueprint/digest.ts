import type { IBlueprintDefinition } from "@/types/solution/blueprint";

/**
 * Canonical JSON serialization for blueprint digests (GIN-451).
 *
 * Keys are sorted recursively so the same definition always serializes the
 * same way regardless of object-key insertion order.
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = canonicalize(value[key]);
    }
    return out;
  }
  return value;
}

export function serializeBlueprint(definition: IBlueprintDefinition): string {
  return JSON.stringify(canonicalize(definition));
}

/** FNV-1a 64-bit hex digest — stable, sync, no SubtleCrypto dependency. */
export function digestBlueprint(definition: IBlueprintDefinition): string {
  const input = serializeBlueprint(definition);
  let hash = BigInt("0xcbf29ce484222325");
  const prime = BigInt("0x100000001b3");
  const mask = BigInt("0xffffffffffffffff");
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}
