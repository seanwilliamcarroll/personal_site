---
title: "Benchmarking Tries: Arena vs unique_ptr"
pubDatetime: 2026-03-15T00:01:00-05:00
description: "Implementing a trie led me into cache effects, const_cast, and what the compiler can and can't optimize away."
tags:
  - projects
  - cpp
  - performance
draft: false
---

**TL;DR:** Implementing a trie led me into cache effects, `const_cast`, and what the compiler can and can't optimize away.

---

## What tries are and where they appear

A [trie](https://en.wikipedia.org/wiki/Trie) (prefix tree) stores strings by sharing common prefixes. Each node has up to 26 children (for lowercase English); a path from root to node spells out a prefix. Terminal nodes mark complete words. Insert, search, and prefix queries are all O(m) where m is the string length — independent of how many strings are stored.

Tries show up in systems work more than I initially expected:

- **Compiler lexers** — keyword recognition can be compiled into a trie or DFA
- **Symbol tables** — O(m) lookup vs O(m log n) for a balanced tree
- **IP routing tables** — longest prefix match is fundamentally a trie query
- **Autocomplete** — prefix enumeration is what tries are designed for

The compressed variant ([Patricia trie / radix tree](https://en.wikipedia.org/wiki/Radix_tree)) appears in the Linux kernel and in production routing tables.

---

## Two implementations

My first trie was arena-style without me consciously choosing it. I needed somewhere to put nodes, `vector<unique_ptr<Node>>` was the most natural container, and children were raw `Node*` pointers into that vector. The commit message: "My initial implementation of trie." It worked. I moved on to `remove` and `getWordsWithPrefix`.

I didn't know the term "arena" at the time — it just felt natural that keeping nodes in a contiguous vector would be better for memory access. When Claude reviewed the implementation, it gave me the vocabulary: this was [arena allocation](https://en.wikipedia.org/wiki/Region-based_memory_management), and the cache effects I was intuitively worried about were real. It also mentioned that my approach wasn't the typical textbook implementation, where each node owns its children directly via smart pointers.

So I built a second version to compare. That gave me two implementations with the same API but fundamentally different allocation strategies:

**ArenaTrie:** Nodes live in a flat `vector<unique_ptr<Node>>`. Children are raw `Node*` pointers into the arena. Creating a node means pushing onto the vector — one allocation that may occasionally trigger a resize.

**PtrTrie:** Each node owns its children via `array<unique_ptr<Node>, 26>`. Creating a node means a separate `make_unique<Node>()` — an individual heap allocation every time.

Since we were already talking about cache effects, I wondered if I could actually demonstrate the difference with benchmarks. And from there, a natural follow-up: how much would compiler optimizations close the gap? Claude generated the Google Benchmark harness and test suite to measure both.

Same API, same traversal logic. Both implementations share a `find_last_node` helper that walks the trie to the last matching node. I used a `const_cast` pattern to avoid duplicating this between const and non-const versions — casting away const feels wrong on instinct, but the alternative is two identical functions that differ only in return type. Duplicated code is one of my great pet peeves, and this is an idiomatic place for the technique. It meant the two implementations really do differ only in allocation strategy, not in traversal code.

The benchmarks test two word distributions: **dense** (words share long prefixes, heavy overlap) and **sparse** (words spread across the alphabet, little sharing).

Raw benchmark data: [release](/data/trie_bench_release.txt), [debug](/data/trie_bench_debug.txt)

---

## Insert: arena wins, and it's not close

**Release:**

| Benchmark    | 256  | 4K    | 64K    |
| ------------ | ---- | ----- | ------ |
| Arena Dense  | 19μs | 243μs | 3.1ms  |
| Ptr Dense    | 44μs | 542μs | 12.1ms |
| Arena Sparse | 21μs | 303μs | 4.7ms  |
| Ptr Sparse   | 51μs | 677μs | 19.8ms |

<div style="max-width: 600px; margin: 1.5em auto;">
<canvas data-chart='{"title":"Insert Performance","yLabel":"Time (μs)","log":true,"labels":["256","4K","64K"],"datasets":[{"label":"Arena Dense","color":"#3b82f6","data":[19.2,243,3134]},{"label":"Ptr Dense","color":"#ef4444","data":[44,542,12111]},{"label":"Arena Sparse","color":"#93c5fd","data":[21.3,303,4703]},{"label":"Ptr Sparse","color":"#fca5a5","data":[51,677,19847]}]}'></canvas>
</div>
<div style="max-width: 600px; margin: 1.5em auto;">
<canvas data-chart='{"title":"Insert: Arena Speedup vs Ptr","yLabel":"Speedup (×)","labels":["256","4K","64K"],"datasets":[{"label":"Dense","color":"#3b82f6","data":[2.29,2.23,3.87]},{"label":"Sparse","color":"#93c5fd","data":[2.39,2.23,4.22]}]}'></canvas>
</div>

Arena is ~4x faster across the board. Each PtrTrie insert does a separate heap allocation per new node. ArenaTrie pushes into a contiguous vector — fewer allocations and better locality during construction. The compiler can inline `make_unique`, eliminate overhead, generate tight code — but it can't turn a thousand separate heap allocations into a single vector push.

Sparse words are slower than dense in both implementations — more unique prefixes means more nodes to create. But the arena/ptr ratio stays consistent.

---

## Search: the compiler erases the difference

**Release:**

| Benchmark  | 256   | 4K    | 64K   |
| ---------- | ----- | ----- | ----- |
| Arena Hit  | 1.0μs | 20μs  | 1.1ms |
| Ptr Hit    | 1.1μs | 19μs  | 993μs |
| Arena Miss | 84ns  | 1.3μs | 20μs  |
| Ptr Miss   | 77ns  | 1.1μs | 17μs  |

<div style="max-width: 600px; margin: 1.5em auto;">
<canvas data-chart='{"title":"Search Performance","yLabel":"Time (μs)","log":true,"labels":["256","4K","64K"],"datasets":[{"label":"Arena Hit","color":"#3b82f6","data":[1.04,20,1056]},{"label":"Ptr Hit","color":"#ef4444","data":[1.11,18.8,993]},{"label":"Arena Miss","color":"#93c5fd","data":[0.084,1.26,20]},{"label":"Ptr Miss","color":"#fca5a5","data":[0.077,1.08,17.2]}]}'></canvas>
</div>
<div style="max-width: 600px; margin: 1.5em auto;">
<canvas data-chart='{"title":"Search: Arena Speedup vs Ptr","yLabel":"Speedup (×)","labels":["256","4K","64K"],"datasets":[{"label":"Hit","color":"#3b82f6","data":[1.07,0.94,0.94]},{"label":"Miss","color":"#93c5fd","data":[0.92,0.86,0.86]}]}'></canvas>
</div>

Nearly identical. PtrTrie is actually marginally faster on misses.

This makes sense once you think about what search does: it follows a single path through the trie — sequential pointer chasing either way. The compiler optimizes `unique_ptr::get()` to the same instruction as a raw pointer dereference. There's no remaining overhead to measure.

Misses are much faster than hits because they bail early. Searching for "zzzzzzz" in a trie of "a"-prefixed words fails at the root — one pointer check and you're done.

---

## Prefix collection: identical in release

**Release:**

| Benchmark | 256  | 4K    | 64K   |
| --------- | ---- | ----- | ----- |
| Arena     | 73ns | 317ns | 2.1μs |
| Ptr       | 73ns | 314ns | 2.1μs |

`getWordsWithPrefix("aaa")` does a DFS from the prefix node, collecting all terminal descendants. In release, the times match to the nanosecond.

---

## The tradeoff

Arena can't free individual nodes. When you remove a word from ArenaTrie, you clear the terminal flag, but the node stays in the arena — a zombie that wastes memory. PtrTrie can prune dead branches on removal, actually freeing memory back to the allocator.

My PtrTrie `remove` walks the parent chain and deletes childless nodes bottom-up. ArenaTrie's `remove` just flips a boolean. The arena trades memory reclamation for construction speed.

---

## Debug vs release

I ran every benchmark in both debug and release. The debug results tell a consistent story: smart pointer abstractions have real overhead when the optimizer isn't allowed to strip them away.

Search was ~7-8x slower in debug — every `unique_ptr::get()` and `operator bool()` that the optimizer would normally erase into a raw pointer dereference or null check is instead a real function call. Prefix collection was ~10x slower, with arena ~13% faster than PtrTrie — a gap that vanishes completely in release, confirming it's unoptimized smart pointer operations during DFS traversal, not a real cache locality benefit.

The insert gap is the exception. Arena stayed ~3.5x faster in debug — almost the same ratio as release. That's the tell: **the allocation difference is real and the compiler can't erase it.** It can eliminate any amount of abstraction overhead, but it can't turn a thousand separate heap allocations into a single vector push.

Debug-build benchmarks measure your abstractions. Release-build benchmarks measure your algorithm and your data layout. The two give you very different — and complementary — information.

---

## What I took away

The result I keep coming back to is the search benchmark. Arena and PtrTrie produce the _exact same search performance_ in release, despite fundamentally different memory ownership models. The compiler turns `unique_ptr::get()` into a raw pointer dereference, `unique_ptr::operator bool()` into a null check — the abstraction cost is genuinely zero.

The only place the allocation strategy matters is construction — and there, it matters a lot, because the compiler can't optimize away heap allocations. It can strip any amount of abstraction overhead, but it can't change where your data lives in memory.

This lines up with a pattern I keep seeing in these benchmarks: **the optimizer is excellent at removing abstraction overhead but can't change your data's memory layout.** If your nodes are scattered across the heap, no amount of inlining will make them contiguous. But if you're just chasing pointers through an existing structure, the compiler will make your smart-pointer code as fast as raw-pointer code.

The practical advice falls out naturally: **arena for build-once-query-many** (dictionaries, autocomplete indices, routing tables), **unique_ptr for long-lived structures with churn** (where you need to reclaim memory on removal). And in either case, don't worry about query performance — the compiler has you covered.
