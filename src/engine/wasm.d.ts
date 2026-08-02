declare module "*/engine2048.js" {
  const init: () => Promise<unknown>;

  export function suggest_move(
    flat: Uint32Array,
    size: number,
    depth: number,
    usage_code: number,
  ): number;

  export function suggest_action(
    flat: Uint32Array,
    size: number,
    swaps_left: number,
    deletes_left: number,
    depth: number,
    usage_code: number,
  ): Uint32Array;

  export function suggest_move_det(
    flat: Uint32Array,
    size: number,
    depth: number,
    seed: Uint32Array,
    calls: number,
    manipulate: boolean,
    usage_code: number,
  ): number;

  export function suggest_action_det(
    flat: Uint32Array,
    size: number,
    swaps_left: number,
    deletes_left: number,
    depth: number,
    seed: Uint32Array,
    calls: number,
    manipulate: boolean,
    usage_code: number,
  ): Uint32Array;

  export function predict_spawn(
    flat: Uint32Array,
    size: number,
    seed: Uint32Array,
    calls: number,
    manipulate: boolean,
    usage_code: number,
  ): Uint32Array;

  export default init;
}
