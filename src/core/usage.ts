export type UsageMode = "max" | "balanced" | "limit";

export const USAGE_MODES: UsageMode[] = ["max", "balanced", "limit"];

export const DEFAULT_USAGE_MODE: UsageMode = "balanced";

interface UsageProfile {
  timeBudgetMs: number;
  nodeBudgetScale: number;
  tickDelayMs: number;
  maxSampledCells: number;
  manipulationRoundsCap: number;
}

const PROFILES: Record<UsageMode, UsageProfile> = {
  max: {
    timeBudgetMs: 800,
    nodeBudgetScale: 2.5,
    tickDelayMs: 0,
    maxSampledCells: 8,
    manipulationRoundsCap: 12,
  },
  balanced: {
    timeBudgetMs: 200,
    nodeBudgetScale: 1.0,
    tickDelayMs: 60,
    maxSampledCells: 6,
    manipulationRoundsCap: 5,
  },
  limit: {
    timeBudgetMs: 45,
    nodeBudgetScale: 0.35,
    tickDelayMs: 160,
    maxSampledCells: 4,
    manipulationRoundsCap: 3,
  },
};

export function usageProfile(mode: UsageMode): UsageProfile {
  return PROFILES[mode];
}

export function usageModeToCode(mode: UsageMode): number {
  switch (mode) {
    case "max":
      return 0;
    case "limit":
      return 2;
    default:
      return 1;
  }
}

export function usageModeFromCode(code: number): UsageMode {
  switch (code) {
    case 0:
      return "max";
    case 2:
      return "limit";
    default:
      return "balanced";
  }
}

export function isUsageMode(value: string): value is UsageMode {
  return value === "max" || value === "balanced" || value === "limit";
}
