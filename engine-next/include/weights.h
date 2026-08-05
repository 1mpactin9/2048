#pragma once

namespace eng {

struct Weights {
    float lost_penalty         = 200000.0f;
    float monotonicity_power   = 4.0f;
    float monotonicity_weight  = 47.0f;
    float sum_power            = 3.5f;
    float sum_weight           = 11.0f;
    float merges_weight        = 700.0f;
    float empty_weight         = 270.0f;
};

} // namespace eng
