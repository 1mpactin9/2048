#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UsageMode {
    Max,
    Balanced,
    Limit,
}

impl UsageMode {
    pub fn from_code(code: u32) -> Self {
        match code {
            0 => UsageMode::Max,
            2 => UsageMode::Limit,
            _ => UsageMode::Balanced,
        }
    }

    pub fn to_code(self) -> u32 {
        match self {
            UsageMode::Max => 0,
            UsageMode::Balanced => 1,
            UsageMode::Limit => 2,
        }
    }

    pub fn time_budget_ms(self) -> u64 {
        match self {
            UsageMode::Max => 800,
            UsageMode::Balanced => 200,
            UsageMode::Limit => 45,
        }
    }

    pub fn node_budget_scale(self) -> f64 {
        match self {
            UsageMode::Max => 2.5,
            UsageMode::Balanced => 1.0,
            UsageMode::Limit => 0.35,
        }
    }

    pub fn tick_delay_ms(self) -> u64 {
        match self {
            UsageMode::Max => 0,
            UsageMode::Balanced => 60,
            UsageMode::Limit => 160,
        }
    }

    pub fn max_sampled_cells(self) -> usize {
        match self {
            UsageMode::Max => 8,
            UsageMode::Balanced => 6,
            UsageMode::Limit => 4,
        }
    }

    pub fn manipulation_rounds_cap(self) -> usize {
        match self {
            UsageMode::Max => 12,
            UsageMode::Balanced => 5,
            UsageMode::Limit => 3,
        }
    }
}

impl Default for UsageMode {
    fn default() -> Self {
        UsageMode::Balanced
    }
}
