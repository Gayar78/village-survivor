import type { TowerGameState } from '@village-survivor/protocol';

const FNV_64_OFFSET = 0xcbf29ce484222325n;
const FNV_64_PRIME = 0x100000001b3n;
const UINT_64_MASK = 0xffffffffffffffffn;

/**
 * Serializes JSON-compatible data with lexicographically sorted object keys.
 *
 * Array order is deliberately retained: entity order is part of the simulation's
 * deterministic tie-breaking and may therefore affect a later tick.
 */
function canonicalJson(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) {
        throw new TypeError('Tower fingerprints require finite numbers.');
      }
      return JSON.stringify(value);
    case 'string':
      return JSON.stringify(value);
    case 'object': {
      if (Array.isArray(value)) {
        return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
      }
      const record = value as Record<string, unknown>;
      const entries = Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
      return `{${entries.join(',')}}`;
    }
    default:
      throw new TypeError(`Unsupported Tower fingerprint value: ${typeof value}.`);
  }
}

/**
 * Creates the stable, non-cryptographic fingerprint exchanged by Tower lockstep peers.
 *
 * It covers every public field of `TowerGameState`, including the seed and all
 * RNG-visible entities/offers/events. Object property insertion order is ignored.
 * The `tower-v1` prefix versions the canonical representation and hash algorithm.
 */
export function createTowerStateFingerprint(state: TowerGameState): string {
  const canonicalState = canonicalJson(state);
  let hash = FNV_64_OFFSET;

  // Hash both bytes of each UTF-16 code unit. This is stable across JS runtimes and
  // avoids depending on a platform TextEncoder implementation.
  for (let index = 0; index < canonicalState.length; index += 1) {
    const codeUnit = canonicalState.charCodeAt(index);
    hash ^= BigInt(codeUnit & 0xff);
    hash = (hash * FNV_64_PRIME) & UINT_64_MASK;
    hash ^= BigInt(codeUnit >>> 8);
    hash = (hash * FNV_64_PRIME) & UINT_64_MASK;
  }

  return `tower-v1:${hash.toString(16).padStart(16, '0')}`;
}
