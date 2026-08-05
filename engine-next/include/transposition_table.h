#pragma once
#include "board.h"
#include <vector>
#include <cstdint>

namespace eng {

// Fixed-size direct-mapped cache keyed by board hash.
// Avoids unbounded memory growth of a std::unordered_map while still giving
// large speedups on repeated subtrees (transpositions across move branches,
// and across successive top-level searches within the same game).
class TranspositionTable {
public:
    struct Entry {
        board_t key = 0;
        float   heuristic = 0.0f;
        uint8_t depth = 0;
        bool    used = false;
    };

    explicit TranspositionTable(size_t size_pow2_entries = (1u << 22)) {
        size_ = size_pow2_entries;
        mask_ = size_ - 1;
        table_.resize(size_);
    }

    inline void clear() {
        std::fill(table_.begin(), table_.end(), Entry{});
        hits_ = 0;
        stores_ = 0;
    }

    inline bool lookup(board_t key, int max_depth, float& out_heuristic) const {
        const Entry& e = table_[index(key)];
        if (e.used && e.key == key && e.depth <= max_depth) {
            out_heuristic = e.heuristic;
            return true;
        }
        return false;
    }

    inline void store(board_t key, uint8_t depth, float heuristic) {
        Entry& e = table_[index(key)];
        // Replacement policy: prefer entries with a shallower recorded depth
        // (deeper search = more expensive/valuable = keep), else overwrite.
        if (!e.used || e.depth >= depth || e.key == key) {
            e.key = key;
            e.depth = depth;
            e.heuristic = heuristic;
            e.used = true;
        }
        stores_++;
    }

    size_t capacity() const { return size_; }
    mutable uint64_t hits_ = 0;
    uint64_t stores_ = 0;

    inline void note_hit() const { hits_++; }

private:
    inline size_t index(board_t key) const {
        // 64-bit mix (splitmix64 finalizer) for good distribution across the table.
        uint64_t h = key;
        h ^= h >> 30; h *= 0xbf58476d1ce4e5b9ULL;
        h ^= h >> 27; h *= 0x94d049bb133111ebULL;
        h ^= h >> 31;
        return h & mask_;
    }

    size_t size_;
    size_t mask_;
    std::vector<Entry> table_;
};

} // namespace eng
