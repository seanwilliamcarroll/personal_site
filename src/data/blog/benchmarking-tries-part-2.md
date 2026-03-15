---
title: 'Benchmarking Tries, Part 2: What "Arena" Actually Means'
pubDatetime: 2026-03-16T00:01:00-05:00
description: 'My first "arena" trie wasn''t an arena at all — fixing that revealed real cache locality effects, disassembly surprises, and data-oriented design wins.'
tags:
  - projects
  - cpp
  - performance
draft: false
---

**TL;DR:** My first "arena" trie wasn't an arena at all — fixing that revealed real cache locality effects I'd only assumed before. Then the disassembly kept raising new questions, and each one led to another variant worth testing.

**Note:** This post corrects errors from the [original trie benchmark post](/posts/benchmarking-tries). The "arena" in that post used `vector<unique_ptr<Node>>`, which still scatters nodes across the heap — the insert speedup was real, but the cache locality explanation was wrong. I'm leaving the original as-is for reference.

---

**Contents**

1. [The mistake](#the-mistake)
2. [Five implementations](#five-implementations)
3. [Insert: arenas win, deque wins biggest](#insert-arenas-win-deque-wins-biggest)
4. [Search hits: cache locality is real (this time)](#search-hits-cache-locality-is-real-this-time)
5. [Search misses: when one instruction is the whole hot path](#search-misses-when-one-instruction-is-the-whole-hot-path)
6. [Zero-as-null: fixing what the disassembly showed us](#zero-as-null-fixing-what-the-disassembly-showed-us)
7. [Data-oriented layout: separating hot and cold fields](#data-oriented-layout-separating-hot-and-cold-fields)
8. [The rest of the picture](#the-rest-of-the-picture)
9. [Conclusion](#conclusion)

Source code: [seanwilliamcarroll/ds](https://github.com/seanwilliamcarroll/ds) — raw benchmark data: [release](/data/trie_bench_release.csv), [debug](/data/trie_bench_debug.csv)

---

## The mistake

In the [previous post](/posts/benchmarking-tries), I compared two trie implementations: an "arena" that stored nodes in a `vector<unique_ptr<Node>>`, and a `PtrTrie` where each node owns its children via `unique_ptr`. I attributed the arena's insert speedup partly to cache locality — nodes being contiguous in memory.

The problem: `vector<unique_ptr<Node>>` is not an arena. Each `make_unique<Node>()` is a separate heap allocation. The vector holds the _`unique_ptr` objects_ contiguously — 8-byte pointers packed together — but the _nodes themselves_ are scattered across the heap, exactly like PtrTrie. There may have been some partial cache locality benefit from the contiguous pointer array itself (sequential pointer loads could prefetch well), but the nodes those pointers referred to had no locality guarantees whatsoever. The insert speedup was real (fewer allocation events due to vector's geometric growth vs individual `make_unique` calls), but the cache locality story I told about node layout was wrong.

Once I realized this, the obvious question: what happens when you build a _real_ arena?

---

## Five implementations

What started as three implementations grew to five as the benchmarks kept raising questions.

**The first three** were the straightforward correction — build real arenas and compare:

**IndexArenaTrie (sentinel):** Nodes live directly in a `vector<Node>` — actual contiguous memory. Children store `size_t` indices into the vector rather than pointers. Indices survive reallocation, so the vector can grow freely. This is the "real" arena: nodes are physically adjacent in memory. A missing child is represented by a sentinel value (`numeric_limits<size_t>::max()`).

**DequeArenaTrie:** Nodes live in a `deque<Node>`. A deque allocates in fixed-size chunks — nodes within a chunk are contiguous, but chunks themselves may be scattered. Children store `Node*` pointers, which are safe because `deque` guarantees pointer stability on `push_back`. A middle ground: better locality than scattered heap allocations, but not fully contiguous.

**PtrTrie:** The baseline from the original post. Each node owns its children via `array<unique_ptr<Node>, 26>`. Every new node is an individual heap allocation. Nodes end up wherever the allocator puts them.

A side benefit of the index-based approach: it eliminated the `const_cast` pattern I used in the other implementations. Since `find_last_node_index` returns a `size_t`, there's no const/non-const pointer overload to deduplicate.

**The next two** came from looking at the disassembly. The search miss results showed IndexArena's sentinel check compiling to `cmn` + `b.eq` (two instructions), while PtrTrie's nullptr check got `cbz` — a fused compare-and-branch (one instruction). That raised the question: what if we used zero as our null index instead?

**IndexArenaTrie (zero-as-null):** Same code, templated with a `bool UseSentinelValue` parameter. When `false`, `NULL_INDEX = 0` and the root node lives at index 1 (reserving index 0 as "null"). Children default-initialize to 0, making the null check eligible for `cbz`.

Then, after seeing how much the per-node layout affected cache behavior, I wanted to try something I'd seen in CppCon talks about data-oriented design — organizing data by access pattern rather than logical grouping. I hadn't tried it before, but the trie seemed like a clean case.

**DataOrientedIndexArenaTrie:** Same zero-as-null strategy, but `is_end_of_word` is pulled out of the Node struct into a parallel `vector<bool>`. Node shrinks from 216 bytes[^1] to 208 bytes (just the children array, no padding). During search traversal, every cache line is 100% useful data.

---

## Insert: arenas win, deque wins biggest

| Benchmark               | 256  | 4K    | 64K    |
| ----------------------- | ---- | ----- | ------ |
| Index Dense (sentinel)  | 16μs | 154μs | 3.5ms  |
| DataOriented Dense      | 16μs | 132μs | 3.0ms  |
| Deque Dense             | 12μs | 151μs | 1.8ms  |
| Ptr Dense               | 44μs | 544μs | 11.5ms |
| Index Sparse (sentinel) | 18μs | 232μs | 3.9ms  |
| DataOriented Sparse     | 16μs | 220μs | 3.3ms  |
| Deque Sparse            | 13μs | 190μs | 2.8ms  |
| Ptr Sparse              | 50μs | 672μs | 19.4ms |

All arenas beat PtrTrie convincingly — IndexArena by ~3.3x, DequeArena by ~6.4x at 64K dense. The surprise is that DequeArena is the fastest inserter, nearly twice as fast as IndexArena at 64K.

Why? IndexArena's `vector<Node>` occasionally reallocates and copies the entire array when it grows. Each Node is 216 bytes[^1] so at 64K nodes that's ~13.5MB being copied on resize. DequeArena's `deque` never moves existing nodes — it just allocates a new chunk and updates its internal bookkeeping. The reallocation cost outweighs the locality benefit during construction.

DataOriented is slightly faster than the sentinel IndexArena (3.0ms vs 3.5ms at 64K dense) — smaller 208-byte nodes mean less data to copy on each reallocation.

This is a tradeoff the old post missed entirely, because the old "arena" wasn't paying this cost either — it was just shuffling 8-byte pointers on resize, not 216-byte nodes.

---

## Search hits: cache locality is real (this time)

| Benchmark            | 256   | 4K   | 64K   |
| -------------------- | ----- | ---- | ----- |
| Index Hit (sentinel) | 912ns | 23μs | 580μs |
| DataOriented Hit     | 984ns | 23μs | 397μs |
| Deque Hit            | 1.2μs | 21μs | 930μs |
| Ptr Hit              | 1.1μs | 18μs | 878μs |

This is the result the old post was looking for but couldn't find. At 64K words, IndexArena (sentinel) searches are 1.5x faster than PtrTrie, and DataOriented pushes that to 2.2x. The old post reported identical search times — because both implementations scattered nodes on the heap, there was no locality difference to measure.

Now there is. IndexArena's nodes are contiguous in a `vector<Node>`. When searching for a word, you follow a path of ~6 nodes. In PtrTrie, those 6 nodes could be anywhere in a ~13.5MB heap region. In IndexArena, they're within a contiguous block — the CPU's hardware prefetcher can anticipate sequential access, and nodes created close in time (which often means structurally close in the trie) end up physically close in memory.

DequeArena falls in between, as expected: nodes within a chunk get locality benefits, but cross-chunk traversals don't.

The effect is size-dependent. At 256 words, the entire trie fits comfortably in L2 cache (4 MiB per core on this hardware) regardless of layout, so there's no meaningful difference. At 64K, the working set exceeds cache, and physical layout starts to matter.

There's a wrinkle, though. Looking at the full range of sizes, IndexArena is actually ~20-30% _slower_ than PtrTrie at 512 and 4K, roughly tied at 32K, and only pulls ahead decisively at 64K. The disassembly[^2] reveals the cost: IndexArena pays a `madd` (multiply-add by 216) every iteration to convert an index to an address. Since 216 isn't a power of 2, the compiler can't reduce this to a shift — it's a real multiply. PtrTrie skips this entirely: the pointer _is_ the address.

At mid-range sizes where everything fits in cache, this per-iteration overhead dominates. At 64K, cache locality overwhelms it.

---

## Search misses: when one instruction is the whole hot path

| Benchmark             | 256   | 4K    | 64K  |
| --------------------- | ----- | ----- | ---- |
| Index Miss (sentinel) | 127ns | 2.0μs | 32μs |
| Deque Miss            | 108ns | 1.7μs | 26μs |
| Ptr Miss              | 77ns  | 1.1μs | 17μs |

Misses tell a different story: PtrTrie is fastest across all sizes. This makes sense — a miss on "zzzzzzz" in a trie of "a"-prefixed words fails at the root node, one array lookup and done. The benchmark repeats this n times on the same hot node. No traversal means no cache effects — just raw per-lookup overhead.

Looking at the disassembly[^2], PtrTrie gets `cbz` — a fused compare-and-branch-if-zero — where IndexArena's sentinel needs `cmn` + `b.eq` (two instructions). My initial guess was that this explained the gap, but disassembling the isolated comparison[^3] showed both are actually single-instruction checks (`cmp x8, #0` vs `cmn x0, #1`). And disassembling the actual child access (`node->children[idx]`) produces identical code for both — an `add` with a left-shift-by-3 and a `ldr`. So the per-check cost is the same; the miss benchmark difference comes from the overall loop structure, where PtrTrie avoids the `madd` multiply entirely.

But the `cbz` observation raised a question worth testing: what if the null check _could_ use `cbz`?

---

## Zero-as-null: fixing what the disassembly showed us

The sentinel check (`cmn` + `b.eq`) costs two instructions in the search loop where a zero comparison gets the fused `cbz`. Could we eliminate that overhead by using 0 as our null index?

I templated `IndexArenaTrie` with a `bool UseSentinelValue` parameter. When `false`, `NULL_INDEX = 0` and the root node lives at index 1 (reserving index 0 as "null"). Children default-initialize to 0, and the null check becomes a comparison against zero — eligible for `cbz`.

Search hits and inserts showed no meaningful difference — the `madd` multiply and cache effects dominate. But the miss benchmark told a clear story:

| Size | Sentinel | Zero-null | Speedup |
| ---- | -------- | --------- | ------- |
| 256  | 127ns    | 70ns      | 1.81x   |
| 512  | 249ns    | 138ns     | 1.80x   |
| 4K   | 1.97μs   | 1.01μs    | 1.95x   |
| 32K  | 15.6μs   | 8.0μs     | 1.94x   |
| 64K  | 31.6μs   | 16.0μs    | 1.98x   |

A consistent ~1.9x speedup across all sizes. That's much larger than a single instruction should account for — until you consider that the miss benchmark's hot path is literally: load one child index, compare to null, repeat. The null comparison _is_ the bottleneck, so `cbz` vs `cmn` + `b.eq` is the difference between one and two instructions on the critical path.

In debug builds the effect vanishes (sentinel 1.77ms vs zero-null 1.80ms at 64K) — unoptimized function call overhead masks the instruction-level difference, same pattern we saw with search hits.

For any real workload where misses traverse more than one node, this difference would be negligible. But it's a nice confirmation that the disassembly predictions hold up — and it set the stage for the last experiment.

---

## Data-oriented layout: separating hot and cold fields

All the implementations so far store `is_end_of_word` inside the Node struct. But think about what happens during a search traversal: you visit ~6 nodes, and at each one you only look at the `children` array to find the next index. You never check `is_end_of_word` until the very last node. That bool — plus its 7 bytes of alignment padding — is dead weight in every cache line you pull in along the way.

This is the textbook case for data-oriented design: organize data by how it's _accessed_, not by what it logically _belongs to_. I'd seen this idea in CppCon talks but hadn't tried it myself. The change is simple: pull `is_end_of_word` out of Node and into a parallel `vector<bool>`, indexed the same way. Node shrinks from 216 bytes to 208 bytes.

Comparing against IndexArenaZeroNull (same null strategy, same traversal logic — the only difference is where the bool lives):

**Search hits:**

| Size | IndexArena | DataOriented | Speedup   |
| ---- | ---------- | ------------ | --------- |
| 256  | 904ns      | 984ns        | 0.92x     |
| 4K   | 24.9μs     | 23.4μs       | 1.07x     |
| 32K  | 204μs      | 190μs        | 1.07x     |
| 64K  | 582μs      | 397μs        | **1.47x** |

A 1.47x improvement at 64K from removing 8 bytes per node. The total memory savings is modest — 13.0MB vs 13.5MB for the children arrays — but every cache line pulled in during traversal is now 100% useful data. No padding, no cold bools.

The same size-dependent pattern holds: no difference at 256 (fits in cache regardless), growing advantage as the working set exceeds cache.

**Insert:**

| Size | IndexArena | DataOriented | Speedup |
| ---- | ---------- | ------------ | ------- |
| 64K  | 3.51ms     | 3.02ms       | 1.16x   |

Also faster — smaller nodes mean less data to copy on vector reallocation.

**Search misses and prefix collection:** Identical to IndexArenaZeroNull, as expected — misses don't traverse far enough to hit cache effects, and prefix collection operates on a small subtree.

**Debug flips the result:** DataOriented is _slower_ in debug — 6.14ms vs 5.63ms for search hits, 19.0ms vs 14.3ms for inserts at 64K. The extra `vector<bool>` bookkeeping (separate indexing, an additional `push_back` per insert) adds overhead that the optimizer eliminates in release. In debug, that abstraction cost outweighs the cache benefit.

---

## The rest of the picture

**Prefix collection** is identical across all five implementations. `getWordsWithPrefix("aaa")` collects terminal nodes from a small subtree that fits in cache regardless of the overall trie's memory layout.

| Benchmark        | 256  | 4K    | 64K   |
| ---------------- | ---- | ----- | ----- |
| Index (sentinel) | 75ns | 325ns | 2.2μs |
| Deque            | 74ns | 319ns | 2.1μs |
| Ptr              | 74ns | 314ns | 2.1μs |

**Debug vs release** reveals what the optimizer is and isn't responsible for:

- **Insert** ratios hold steady across both builds: IndexArena is ~3x faster and DequeArena ~4-6x faster than PtrTrie. The allocation strategy dominates — the optimizer can't change where memory comes from.
- **Search hits** shift dramatically. In debug at 64K, DequeArena (4.3ms) is fastest, followed by IndexArena (5.5ms), then PtrTrie (6.5ms). In release, IndexArena (580μs) leaps to first place while PtrTrie (878μs) and DequeArena (930μs) are closer together. The optimizer doesn't create cache locality — but it strips away enough abstraction overhead to let cache effects become the dominant factor.
- **Prefix collection** shows a uniform ~13x debug-to-release slowdown. These operations access so few nodes that memory layout doesn't matter.
- **Search misses** show much larger ratios (~55x+) because the per-miss cost in release is so small that even modest debug overhead produces outsized ratios.

---

## Conclusion

The old post's conclusion was: "the optimizer is excellent at removing abstraction overhead but can't change your data's memory layout." That's still true — but the irony is that I didn't have any data layout difference to measure. Both implementations scattered nodes on the heap, so of course search was identical.

Building a real arena and then iterating on it told a more interesting story:

- **DequeArena** is the fastest inserter — avoiding vector reallocation matters more than node contiguity during construction.
- **IndexArena** wins search at scale — but only once the working set exceeds cache, overwhelming the per-iteration `madd` overhead. Below that threshold, PtrTrie is faster.
- **Zero-as-null** confirmed that disassembly predictions hold up — `cbz` vs `cmn` + `b.eq` produced a measurable ~1.9x difference on a synthetic hot path.
- **Data-oriented layout** pushed the search advantage to 2.2x over PtrTrie at 64K — just by removing 8 bytes of padding per node. My first time trying data-oriented design, and the result was the largest single improvement in this post.
- **The tradeoff is three-way:** DataOriented IndexArena for query-heavy workloads where you can pay the insert cost, DequeArena for balanced insert/query workloads, PtrTrie when you need per-node memory reclamation.

The lesson I keep learning: measure before concluding. The old post had the right instinct about cache effects but the wrong evidence. It took building an actual arena — and then not stopping there — to see whether the theory held up.

---

## Footnotes

[^1]:
    26 × 8-byte children (208) + 1-byte `bool` + 7 bytes alignment padding = 216. All three Node types are the same size despite storing different child types (`size_t`, `Node*`, `unique_ptr<Node>`) — they're all 8 bytes on this platform. Verified with:

    ```cpp
    struct IndexNode {
        bool is_end_of_word = false;
        std::array<size_t, 26> children;
    };
    printf("IndexNode: %zu bytes\n", sizeof(IndexNode));  // 216
    printf("  is_end_of_word offset: %zu\n", offsetof(IndexNode, is_end_of_word));  // 0
    printf("  children offset: %zu\n", offsetof(IndexNode, children));  // 8
    ```

[^2]:
    Compiled with `c++ -std=c++17 -O2 -S -o search_loop.s search_loop.cpp` on Apple Silicon, then extracted the inner loops with `awk '/^__Z10index_find/,/\.cfi_endproc/' search_loop.s` and `awk '/^__Z8ptr_find/,/\.cfi_endproc/' search_loop.s`:

    **IndexArena:**

    ```asm
    mov    w11, #216                  ; multiplier (hoisted before loop)
    ; loop body:
    ldrsb  x12, [x9]                 ; load char
    madd   x13, x0, x11, x8          ; node_addr = index * 216 + base
    add    x12, x13, x12, lsl #3     ; + char_offset * 8
    sub    x12, x12, #768            ; adjust for 'a' offset
    ldr    x0, [x12]                 ; load child index
    cmn    x0, #1                    ; compare to sentinel
    b.eq   exit                      ; branch if NULL_INDEX
    ```

    **PtrTrie:**

    ```asm
    ; loop body:
    ldrsb  x10, [x8]                 ; load char
    add    x10, x0, x10, lsl #3      ; node_ptr + char_offset * 8
    sub    x10, x10, #768            ; adjust for 'a' offset
    ldr    x0, [x10]                 ; load child pointer
    cbz    x0, exit                  ; compare-and-branch-if-zero
    ```

    Source used to generate the disassembly:

    ```cpp
    __attribute__((noinline))
    size_t index_find(const std::vector<IndexNode>& nodes, const std::string& word) {
        size_t current = 0;
        for (char c : word) {
            size_t child = nodes[current].children[c - 'a'];
            if (child == NULL_INDEX) { return NULL_INDEX; }
            current = child;
        }
        return current;
    }

    __attribute__((noinline))
    const PtrNode* ptr_find(const PtrNode* root, const std::string& word) {
        const PtrNode* current = root;
        for (char c : word) {
            const PtrNode* child = current->children[c - 'a'];
            if (child == nullptr) { return nullptr; }
            current = child;
        }
        return current;
    }
    ```

[^3]:
    Compiled with `c++ -std=c++17 -O2 -S -o sentinel_check.s sentinel_check.cpp` on Apple Silicon, then extracted with `grep -A 8 'check_nullptr\|check_sentinel' sentinel_check.s`:

    ```asm
    ; nullptr check              ; sentinel check
    cmp  x8, #0                  cmn  x0, #1
    cset w0, eq                  cset w0, eq
    ```

    `cmn x0, #1` adds 1 and checks for zero — true exactly when `x0 == 0xFFFF...FFFF`. One instruction each, no constant load needed. Source:

    ```cpp
    static constexpr size_t NULL_INDEX = std::numeric_limits<size_t>::max();

    __attribute__((noinline))
    bool check_nullptr(const std::unique_ptr<int>& ptr) {
        return ptr == nullptr;
    }

    __attribute__((noinline))
    bool check_sentinel(size_t index) {
        return index == NULL_INDEX;
    }
    ```
