const KNOWN = [
  2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768,
  65536, 131072, 262144, 524288, 1048576,
];

export function tileColors(value: number): { bg: string; fg: string } {
  if (KNOWN.includes(value)) {
    return { bg: `var(--tile-${value}-bg)`, fg: `var(--tile-${value}-fg)` };
  }
  return { bg: "var(--tile-super-bg)", fg: "var(--tile-super-fg)" };
}

export function tileFontScale(value: number): number {
  if (value < 1000) return 1;
  if (value < 10000) return 0.82;
  if (value < 100000) return 0.68;
  if (value < 1000000) return 0.55;
  return 0.45;
}