#pragma once
#include <cstdint>
#include <cstdio>
#include <algorithm>

namespace eng {

using board_t = uint64_t;
using row_t   = uint16_t;

constexpr board_t ROW_MASK = 0xFFFFULL;
constexpr board_t COL_MASK = 0x000F000F000F000FULL;

inline row_t reverse_row(row_t row) {
    return (row >> 12) | ((row >> 4) & 0x00F0) | ((row << 4) & 0x0F00) | (row << 12);
}

inline board_t unpack_col(row_t row) {
    board_t tmp = row;
    return (tmp | (tmp << 12ULL) | (tmp << 24ULL) | (tmp << 36ULL)) & COL_MASK;
}

inline board_t transpose(board_t x) {
    board_t a1 = x & 0xF0F00F0FF0F00F0FULL;
    board_t a2 = x & 0x0000F0F00000F0F0ULL;
    board_t a3 = x & 0x0F0F00000F0F0000ULL;
    board_t a  = a1 | (a2 << 12) | (a3 >> 12);
    board_t b1 = a & 0xFF00FF0000FF00FFULL;
    board_t b2 = a & 0x00FF00FF00000000ULL;
    board_t b3 = a & 0x00000000FF00FF00ULL;
    return b1 | (b2 >> 24) | (b3 << 24);
}

// Precondition: board must have at least one non-empty tile (never called on
// an all-zero board in practice, since a game always starts with tiles placed).
// A fully empty board would overflow the counting nibble and return 0 instead
// of 16.
inline int count_empty(board_t x) {
    x |= (x >> 2) & 0x3333333333333333ULL;
    x |= (x >> 1);
    x = ~x & 0x1111111111111111ULL;
    x += x >> 32;
    x += x >> 16;
    x += x >> 8;
    x += x >> 4;
    return int(x & 0xf);
}

inline int get_max_rank(board_t board) {
    int r = 0;
    while (board) { r = std::max(r, int(board & 0xf)); board >>= 4; }
    return r;
}

inline int count_distinct_tiles(board_t board) {
    uint16_t bitset = 0;
    while (board) { bitset |= 1 << (board & 0xf); board >>= 4; }
    bitset >>= 1;
    int count = 0;
    while (bitset) { bitset &= bitset - 1; count++; }
    return count;
}

inline void print_board(board_t board, FILE* out = stdout) {
    for (int i = 0; i < 4; i++) {
        for (int j = 0; j < 4; j++) {
            uint8_t p = board & 0xf;
            fprintf(out, "%6u", p == 0 ? 0 : (1u << p));
            board >>= 4;
        }
        fprintf(out, "\n");
    }
}

// Move directions
enum Move { UP = 0, DOWN = 1, LEFT = 2, RIGHT = 3, NUM_MOVES = 4 };

} // namespace eng
