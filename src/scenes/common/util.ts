// Small helpers shared by the scene modules.

/** A deterministic PRNG (xorshift32) so every visit builds the same scene. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

export const deg = (d: number) => (d * Math.PI) / 180;
