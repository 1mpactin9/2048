import type { AutoAction, Engine, EngineContext } from "./types";
import { DIRECTIONS } from "./types";
import { move } from "./move";

export const PlaceholderEngine: Engine = {
  name: "Placeholder (random legal)",
  chooseAction(ctx: EngineContext): AutoAction {
    const order = [...DIRECTIONS];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (const dir of order) {
      if (move(ctx.grid, dir).transcript.moved) return { kind: "move", dir };
    }
    return { kind: "stop" };
  },
};
