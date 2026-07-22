// Type shim for the wasm-pack `--target web` output at `engine/pkg/engine2048.js`.
// wasm-pack ships a sibling `.d.ts` when built; this ambient declaration is a
// fallback so `tsc --noEmit` still passes before the package has been built.
declare module '*/engine2048.js' {
  /**
   * Instantiate the WASM module. Must be awaited once before calling any
   * exported function (the generated glue's default export).
   */
  const init: () => Promise<unknown>;

  /**
   * Direction-only suggestion. `flat` is a row-major `Uint32Array` of tile
   * values (`0` = empty); `size` is the board edge; `depth = 0` uses the
   * adaptive default. Returns `0 = up, 1 = down, 2 = left, 3 = right`, or a
   * value `> 3` (`u32::MAX`) when no legal move exists.
   */
  export function suggest_move(flat: Uint32Array, size: number, depth: number): number;

  /**
   * Full action suggestion (move or power-up). Returns a flat `u32` array:
   * `[0, dir]` move, `[1, r, c]` delete, `[2, r1, c1, r2, c2]` swap, `[3]`
   * none. `swaps_left` / `deletes_left` are remaining charges; power-ups are
   * only considered when `> 0` and the board is congested or stuck.
   */
  export function suggest_action(
    flat: Uint32Array,
    size: number,
    swaps_left: number,
    deletes_left: number,
    depth: number,
  ): Uint32Array;

  export default init;
}
