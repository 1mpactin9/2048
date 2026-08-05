#pragma once
#include "board.h"
#include "tables.h"
#include "weights.h"
#include "transposition_table.h"
#include <algorithm>
#include <cstdint>
#include <chrono>

namespace eng {

struct SearchConfig {
    float  cprob_thresh   = 0.0001f;
    int    cache_depth_limit = 15;
    int    min_search_depth  = 3;
    int    depth_bias        = 2;   // starting depth_limit = max(min_search_depth, distinct_tiles - depth_bias)
    int    max_search_depth  = 8;   // hard ceiling regardless of tile count (depth 9+ costs grow ~10x/level)
    size_t tt_size_pow2       = (1u << 22);
    bool   use_cache          = true;
    double time_budget_sec    = 0.2; // per-move wall-clock budget; 0 disables iterative deepening (uses fixed depth)
};

struct SearchStats {
    uint64_t moves_evaled = 0;
    uint64_t cache_hits = 0;
    int      max_depth_reached = 0;
};

class Engine {
public:
    Engine(const Weights& w, const SearchConfig& cfg)
        : weights_(w), cfg_(cfg), tables_(w), tt_(cfg.tt_size_pow2) {}

    inline board_t execute_move(int move, board_t board) const {
        return tables_.execute_move(move, board);
    }

    inline float score_heur(board_t board) const { return tables_.score_heur(board); }
    inline float score_actual(board_t board) const { return tables_.score_actual(board); }

    // Returns best move index (0..3), or -1 if no legal move.
    // Uses iterative deepening bounded by a wall-clock time budget (if set),
    // so search cost adapts to available time instead of blowing up unbounded
    // at high tile counts. Falls back to a single fixed-depth pass if
    // time_budget_sec <= 0.
    int best_move(board_t board, SearchStats* stats_out = nullptr) {
        int start_depth = std::max(cfg_.min_search_depth, count_distinct_tiles(board) - cfg_.depth_bias);
        start_depth = std::min(start_depth, cfg_.max_search_depth);

        auto t0 = std::chrono::steady_clock::now();
        int best_move_idx = -1;
        uint64_t total_evaled = 0, total_hits = 0;
        int max_depth_reached = 0;

        if (cfg_.time_budget_sec <= 0.0) {
            Ctx ctx{start_depth, 0, 0, 0, 0, {}, false, false};
            best_move_idx = search_at_depth(board, ctx);
            total_evaled = ctx.moves_evaled;
            total_hits = ctx.cache_hits;
            max_depth_reached = ctx.maxdepth;
        } else {
            auto deadline = t0 + std::chrono::duration_cast<std::chrono::steady_clock::duration>(
                std::chrono::duration<double>(cfg_.time_budget_sec));
            double prev_depth_time = 0.0;

            for (int depth = start_depth; depth <= cfg_.max_search_depth; ++depth) {
                double elapsed_before = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
                if (depth > start_depth && prev_depth_time > 0.0 &&
                    elapsed_before + prev_depth_time * 4.0 > cfg_.time_budget_sec) {
                    break;
                }

                Ctx ctx{depth, 0, 0, 0, 0, deadline, true, false};
                double lvl0 = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
                int move = search_at_depth(board, ctx);
                double lvl1 = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
                prev_depth_time = lvl1 - lvl0;

                total_evaled += ctx.moves_evaled;
                total_hits += ctx.cache_hits;

                // Discard this depth's move if the search was cut short mid-way;
                // an aborted pass mixes deep evaluations with heuristic fallbacks
                // and is not a reliable comparison across the top-level moves.
                if (!ctx.aborted) {
                    max_depth_reached = ctx.maxdepth;
                    if (move >= 0) best_move_idx = move;
                }

                if (ctx.aborted || lvl1 >= cfg_.time_budget_sec) break;
            }
        }

        // Safety net: if even the first depth aborted and produced nothing usable,
        // fall back to a plain one-ply heuristic choice so we never return -1
        // while a legal move exists.
        if (best_move_idx < 0) {
            float best_score = -1.0f;
            for (int m = 0; m < NUM_MOVES; ++m) {
                board_t nb = tables_.execute_move(m, board);
                if (nb == board) continue;
                float s = tables_.score_heur(nb);
                if (s > best_score) { best_score = s; best_move_idx = m; }
            }
        }

        if (stats_out) {
            stats_out->moves_evaled = total_evaled;
            stats_out->cache_hits = total_hits;
            stats_out->max_depth_reached = max_depth_reached;
        }
        return best_move_idx;
    }

    void reset_cache() { tt_.clear(); }
    const TranspositionTable& transposition_table() const { return tt_; }

private:
    struct Ctx {
        int depth_limit;
        int curdepth = 0;
        uint64_t moves_evaled = 0;
        uint64_t cache_hits = 0;
        int maxdepth = 0;
        std::chrono::steady_clock::time_point deadline{};
        bool has_deadline = false;
        bool aborted = false;
    };

    int search_at_depth(board_t board, Ctx& ctx) {
        int best_move_idx = -1;
        float best_score = -1.0f;
        for (int m = 0; m < NUM_MOVES; ++m) {
            board_t nb = tables_.execute_move(m, board);
            if (nb == board) continue;
            float s = score_tilechoose(ctx, nb, 1.0f) + 1e-6f;
            if (ctx.aborted) break;
            if (s > best_score) { best_score = s; best_move_idx = m; }
        }
        return best_move_idx;
    }

    float score_tilechoose(Ctx& ctx, board_t board, float cprob) {
        if (ctx.aborted) return tables_.score_heur(board);

        if (ctx.has_deadline && (ctx.moves_evaled & 0xFFF) == 0 &&
            std::chrono::steady_clock::now() >= ctx.deadline) {
            ctx.aborted = true;
            return tables_.score_heur(board);
        }

        if (cprob < cfg_.cprob_thresh || ctx.curdepth >= ctx.depth_limit) {
            ctx.maxdepth = std::max(ctx.curdepth, ctx.maxdepth);
            return tables_.score_heur(board);
        }

        if (cfg_.use_cache && ctx.curdepth < cfg_.cache_depth_limit) {
            float cached;
            if (tt_.lookup(board, ctx.curdepth, cached)) {
                ctx.cache_hits++;
                return cached;
            }
        }

        int num_open = count_empty(board);
        cprob /= num_open;

        float res = 0.0f;
        board_t tmp = board;
        board_t tile_2 = 1;
        while (tile_2) {
            if ((tmp & 0xf) == 0) {
                res += score_move(ctx, board | tile_2, cprob * 0.9f) * 0.9f;
                res += score_move(ctx, board | (tile_2 << 1), cprob * 0.1f) * 0.1f;
            }
            tmp >>= 4;
            tile_2 <<= 4;
        }
        res /= num_open;

        if (cfg_.use_cache && ctx.curdepth < cfg_.cache_depth_limit) {
            tt_.store(board, uint8_t(ctx.curdepth), res);
        }
        return res;
    }

    float score_move(Ctx& ctx, board_t board, float cprob) {
        float best = 0.0f;
        ctx.curdepth++;
        for (int m = 0; m < NUM_MOVES; ++m) {
            board_t nb = tables_.execute_move(m, board);
            ctx.moves_evaled++;
            if (nb != board) {
                best = std::max(best, score_tilechoose(ctx, nb, cprob));
            }
        }
        ctx.curdepth--;
        return best;
    }

    Weights weights_;
    SearchConfig cfg_;
    Tables tables_;
    TranspositionTable tt_;
};

} // namespace eng
