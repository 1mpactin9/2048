// minimal typings for seedrandom (no @types package installed)
declare module 'seedrandom' {
  export interface PRNG {
    (): number;
    quick(): number;
    int32(): number;
    double(): number;
    state(): unknown;
  }
  export interface SeedRandomOptions {
    state?: boolean | unknown;
    global?: boolean;
  }
  export default function seedrandom(
    seed?: string,
    options?: SeedRandomOptions,
  ): PRNG;
}
