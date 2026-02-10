export interface RNG {
  next(): number;
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
}

function fnv1aHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createRng(seed: string): RNG {
  let state = fnv1aHash(seed) || 0x12345678;

  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };

  return {
    next,
    int(min, max) {
      if (max < min) {
        throw new Error(`Invalid int range ${min}..${max}`);
      }
      return Math.floor(next() * (max - min + 1)) + min;
    },
    pick(items) {
      if (items.length === 0) {
        throw new Error('Cannot pick from empty array');
      }
      return items[Math.floor(next() * items.length)];
    },
  };
}
