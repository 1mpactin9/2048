#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UsageMode {
    Max,
    Balanced,
    Limit,
    Custom(u64),
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
            UsageMode::Custom(_) => 1,
        }
    }

    pub fn time_budget_ms(self) -> u64 {
        match self {
            UsageMode::Max => 800,
            UsageMode::Balanced => 50,
            UsageMode::Limit => 20,
            UsageMode::Custom(ms) => ms,
        }
    }

    pub fn node_budget_scale(self) -> f64 {
        match self {
            UsageMode::Max => 4.0,
            UsageMode::Balanced => 1.0,
            UsageMode::Limit => 0.3,
            UsageMode::Custom(_) => 2.0,
        }
    }

    pub fn tick_delay_ms(self) -> u64 {
        match self {
            UsageMode::Max => 0,
            UsageMode::Balanced => 60,
            UsageMode::Limit => 160,
            UsageMode::Custom(_) => 30,
        }
    }

    pub fn max_sampled_cells(self) -> usize {
        match self {
            UsageMode::Max => 12,
            UsageMode::Balanced => 8,
            UsageMode::Limit => 5,
            UsageMode::Custom(_) => 10,
        }
    }

    pub fn manipulation_rounds_cap(self) -> usize {
        match self {
            UsageMode::Max => usize::MAX,
            UsageMode::Balanced => usize::MAX,
            UsageMode::Limit => 6,
            UsageMode::Custom(_) => usize::MAX,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            UsageMode::Max => "Max",
            UsageMode::Balanced => "Balanced",
            UsageMode::Limit => "Limit",
            UsageMode::Custom(_) => "Custom",
        }
    }
}

impl Default for UsageMode {
    fn default() -> Self {
        UsageMode::Balanced
    }
}
