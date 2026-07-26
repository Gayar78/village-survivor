export function hashSeed(seed: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0 || 0x6d2b79f5;
}

export class SeededRandom {
  private state: number;

  public constructor(seed: string) {
    this.state = hashSeed(seed);
  }

  public next(): number {
    let value = (this.state += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  }

  public between(minimum: number, maximum: number): number {
    return minimum + (maximum - minimum) * this.next();
  }

  public integer(minimum: number, maximumInclusive: number): number {
    return Math.floor(this.between(minimum, maximumInclusive + 1));
  }
}
