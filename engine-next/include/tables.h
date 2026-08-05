#pragma once
#include "board.h"
#include "weights.h"
#include <cmath>
#include <vector>

namespace eng {

class Tables {
public:
    std::vector<row_t>   row_left, row_right;
    std::vector<board_t> col_up, col_down;
    std::vector<float>   heur_score;
    std::vector<float>   raw_score;

    explicit Tables(const Weights& w) {
        row_left.resize(65536);
        row_right.resize(65536);
        col_up.resize(65536);
        col_down.resize(65536);
        heur_score.resize(65536);
        raw_score.resize(65536);
        corner_weight_ = w.corner_weight;
        build(w);
    }

    inline board_t move_up(board_t board) const {
        board_t ret = board;
        board_t t = transpose(board);
        ret ^= col_up[(t >> 0) & ROW_MASK] << 0;
        ret ^= col_up[(t >> 16) & ROW_MASK] << 4;
        ret ^= col_up[(t >> 32) & ROW_MASK] << 8;
        ret ^= col_up[(t >> 48) & ROW_MASK] << 12;
        return ret;
    }
    inline board_t move_down(board_t board) const {
        board_t ret = board;
        board_t t = transpose(board);
        ret ^= col_down[(t >> 0) & ROW_MASK] << 0;
        ret ^= col_down[(t >> 16) & ROW_MASK] << 4;
        ret ^= col_down[(t >> 32) & ROW_MASK] << 8;
        ret ^= col_down[(t >> 48) & ROW_MASK] << 12;
        return ret;
    }
    inline board_t move_left(board_t board) const {
        board_t ret = board;
        ret ^= board_t(row_left[(board >> 0) & ROW_MASK]) << 0;
        ret ^= board_t(row_left[(board >> 16) & ROW_MASK]) << 16;
        ret ^= board_t(row_left[(board >> 32) & ROW_MASK]) << 32;
        ret ^= board_t(row_left[(board >> 48) & ROW_MASK]) << 48;
        return ret;
    }
    inline board_t move_right(board_t board) const {
        board_t ret = board;
        ret ^= board_t(row_right[(board >> 0) & ROW_MASK]) << 0;
        ret ^= board_t(row_right[(board >> 16) & ROW_MASK]) << 16;
        ret ^= board_t(row_right[(board >> 32) & ROW_MASK]) << 32;
        ret ^= board_t(row_right[(board >> 48) & ROW_MASK]) << 48;
        return ret;
    }

    inline board_t execute_move(int move, board_t board) const {
        switch (move) {
            case UP:    return move_up(board);
            case DOWN:  return move_down(board);
            case LEFT:  return move_left(board);
            case RIGHT: return move_right(board);
            default:    return ~0ULL;
        }
    }

    inline float score_helper(board_t board, const std::vector<float>& t) const {
        return t[(board >> 0) & ROW_MASK] + t[(board >> 16) & ROW_MASK] +
               t[(board >> 32) & ROW_MASK] + t[(board >> 48) & ROW_MASK];
    }

    inline float score_heur(board_t board) const {
        float base = score_helper(board, heur_score) + score_helper(transpose(board), heur_score);
        if (corner_weight_ != 0.0f) base += corner_bonus(board) * corner_weight_;
        return base;
    }

    inline float score_actual(board_t board) const {
        return score_helper(board, raw_score);
    }

private:
    float corner_weight_ = 0.0f;

    // Cheap whole-board term: reward configurations where the maximum tile sits
    // in a corner AND its immediate neighbors decrease monotonically away from
    // that corner (an actual "snake" anchor), rather than just rewarding corner
    // placement alone, which can be satisfied by otherwise poor boards.
    inline float corner_bonus(board_t board) const {
        int nibs[16];
        board_t tmp = board;
        int max_rank = 0, max_pos = 0;
        for (int i = 0; i < 16; ++i) {
            nibs[i] = int(tmp & 0xf);
            tmp >>= 4;
            if (nibs[i] > max_rank) { max_rank = nibs[i]; max_pos = i; }
        }
        // nibble layout: row = pos/4, col = pos%4 (matches board.h packing order)
        int row = max_pos / 4, col = max_pos % 4;
        bool in_corner = (row == 0 || row == 3) && (col == 0 || col == 3);
        if (!in_corner) return 0.0f;

        int row_step = (row == 0) ? 1 : -1;
        int col_step = (col == 0) ? 1 : -1;
        float snake_score = 0.0f;
        for (int r = 0; r < 4; ++r) {
            int expected_prev = -1;
            for (int c = 0; c < 4; ++c) {
                int rr = (row_step > 0) ? r : 3 - r;
                int cc = (col_step > 0) ? c : 3 - c;
                int idx = rr * 4 + cc;
                if (expected_prev >= 0 && nibs[idx] <= expected_prev) snake_score += 1.0f;
                expected_prev = nibs[idx];
            }
        }
        return float(max_rank) + snake_score;
    }
    void build(const Weights& w) {
        for (unsigned row = 0; row < 65536; ++row) {
            unsigned line[4] = {
                (row >> 0) & 0xf, (row >> 4) & 0xf,
                (row >> 8) & 0xf, (row >> 12) & 0xf
            };

            float score = 0.0f;
            for (int i = 0; i < 4; ++i) {
                int rank = line[i];
                if (rank >= 2) score += (rank - 1) * float(1 << rank);
            }
            raw_score[row] = score;

            float sum = 0;
            int empty = 0, merges = 0, prev = 0, counter = 0;
            for (int i = 0; i < 4; ++i) {
                int rank = line[i];
                sum += std::pow(float(rank), w.sum_power);
                if (rank == 0) {
                    empty++;
                } else {
                    if (prev == rank) counter++;
                    else if (counter > 0) { merges += 1 + counter; counter = 0; }
                    prev = rank;
                }
            }
            if (counter > 0) merges += 1 + counter;

            float mono_left = 0, mono_right = 0;
            for (int i = 1; i < 4; ++i) {
                if (line[i - 1] > line[i])
                    mono_left += std::pow(float(line[i - 1]), w.monotonicity_power) - std::pow(float(line[i]), w.monotonicity_power);
                else
                    mono_right += std::pow(float(line[i]), w.monotonicity_power) - std::pow(float(line[i - 1]), w.monotonicity_power);
            }

            heur_score[row] = w.lost_penalty +
                w.empty_weight * empty +
                w.merges_weight * merges -
                w.monotonicity_weight * std::min(mono_left, mono_right) -
                w.sum_weight * sum;

            for (int i = 0; i < 3; ++i) {
                int j;
                for (j = i + 1; j < 4; ++j) if (line[j] != 0) break;
                if (j == 4) break;
                if (line[i] == 0) {
                    line[i] = line[j]; line[j] = 0; i--;
                } else if (line[i] == line[j]) {
                    if (line[i] != 0xf) line[i]++;
                    line[j] = 0;
                }
            }

            row_t result = row_t((line[0] << 0) | (line[1] << 4) | (line[2] << 8) | (line[3] << 12));
            row_t rev_result = reverse_row(result);
            unsigned rev_row = reverse_row(row_t(row));

            row_left[row]      = row_t(row) ^ result;
            row_right[rev_row] = row_t(rev_row) ^ rev_result;
            col_up[row]        = unpack_col(row_t(row)) ^ unpack_col(result);
            col_down[rev_row]  = unpack_col(row_t(rev_row)) ^ unpack_col(rev_result);
        }
    }
};

} // namespace eng
