declare module "seedrandom" {
  interface PRNG {
    (): number;
  }
  function seedrandom(seed?: string): PRNG;
  export default seedrandom;
}

declare module "throttle-debounce" {
  export function debounce<T extends (...args: never[]) => unknown>(
    delay: number,
    callback: T,
  ): T & { cancel: () => void };
  export function throttle<T extends (...args: never[]) => unknown>(
    delay: number,
    callback: T,
  ): T & { cancel: () => void };
}