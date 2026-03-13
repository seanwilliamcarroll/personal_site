---
title: "Benchmarking Union-Find's Two Optimizations"
pubDatetime: 2026-03-14T00:01:00-05:00
description: "A completely opaque data structure turned out to be a flat array of ints with two elegant optimizations — I benchmarked each one to understand what it actually contributes."
tags:
  - projects
  - cpp
  - performance
draft: false
---

**TL;DR:** A completely opaque data structure turned out to be a flat array of ints with two elegant optimizations — I benchmarked each one to understand what it actually contributes.

I'd heard of Union-Find — it shows up on every list of "data structures you should know." But I didn't really know anything about it beyond the name and the basic idea: track which elements are in the same group. It was completely opaque to me. I'm glad I decided to actually dig in, because what I found was one of the most elegant data structures I've encountered: the entire thing is a flat array of ints, and two simple optimizations make it effectively constant-time.

---

## What Union-Find is

[Union-Find](https://en.wikipedia.org/wiki/Disjoint-set_data_structure) maintains a partition of elements into disjoint sets. Two operations: `find(x)` returns the representative of x's set, `unite(x, y)` merges two sets.

The clever part — which I didn't know going in — is the representation. Each element has a parent pointer stored in a flat array. Roots point to themselves. `find` walks parent pointers to the root. The entire structure is just `vector<int>`.

Two optimizations make this nearly O(1). I didn't know about either going in — I learned them during this project, mostly by asking Claude the right questions.

**Union by rank:** When merging two trees, attach the shorter one under the taller. This keeps tree height O(log n) instead of O(n).

To see why this matters, consider uniting 5 elements in sequence. Every element starts as its own root:

```
parent: [0, 1, 2, 3, 4]     ← each element points to itself
rank:   [0, 0, 0, 0, 0]
```

**Without rank**, `unite(x, y)` always sets `parent[find(y)] = find(x)` — no regard for tree height. Call `unite(1, 0)`, `unite(2, 1)`, `unite(3, 2)`, `unite(4, 3)`:

```
unite(1, 0):  find(1)=1, find(0)=0.  parent[0] = 1.
  parent: [1, 1, 2, 3, 4]           0 → 1

unite(2, 1):  find(2)=2, find(1)=1.  parent[1] = 2.
  parent: [1, 2, 2, 3, 4]           0 → 1 → 2

unite(3, 2):  find(3)=3, find(2)=2.  parent[2] = 3.
  parent: [1, 2, 3, 3, 4]           0 → 1 → 2 → 3

unite(4, 3):  find(4)=4, find(3)=3.  parent[3] = 4.
  parent: [1, 2, 3, 4, 4]           0 → 1 → 2 → 3 → 4
```

A chain. `find(0)` walks four hops. With n elements, depth is n-1.

**With rank**, `unite` compares the ranks of the two roots and attaches the shorter tree under the taller. When ranks are equal, one is chosen as root and its rank increments:

```
unite(1, 0):  find(1)=1, find(0)=0.  rank[1]=0, rank[0]=0.
              Equal rank → parent[1] = 0, rank[0]++.
  parent: [0, 0, 2, 3, 4]
  rank:   [1, 0, 0, 0, 0]           1 → 0 (root, rank 1)

unite(2, 1):  find(2)=2, find(1)=0.  rank[2]=0, rank[0]=1.
              rank 0 < rank 1 → parent[2] = 0.
  parent: [0, 0, 0, 3, 4]
  rank:   [1, 0, 0, 0, 0]           1 → 0 ← 2

unite(3, 2):  find(3)=3, find(2)=0.  rank[3]=0, rank[0]=1.
              rank 0 < rank 1 → parent[3] = 0.
  parent: [0, 0, 0, 0, 4]
  rank:   [1, 0, 0, 0, 0]           1 → 0 ← 2, 3 → 0

unite(4, 3):  find(4)=4, find(3)=0.  rank[4]=0, rank[0]=1.
              rank 0 < rank 1 → parent[4] = 0.
  parent: [0, 0, 0, 0, 0]
  rank:   [1, 0, 0, 0, 0]           1,2,3,4 all → 0
```

Same four unites, entirely different tree shape. Every element is one hop from root 0. The chain never forms.

**Path compression:** After `find(x)`, rewrite every node on the path to point directly to the root. Future finds on those nodes skip the walk entirely.

Start with the worst-case chain from above (built without rank):

```
parent: [1, 2, 3, 4, 4]             0 → 1 → 2 → 3 → 4
```

Call `find(0)`. First, walk parent pointers to find the root:

```
parent[0] = 1 → parent[1] = 2 → parent[2] = 3 → parent[3] = 4 → parent[4] = 4.  Root is 4.
```

Four hops. Now walk the path a second time, repointing each node directly to the root:

```
parent[0] = 4    (was 1)
  parent: [4, 2, 3, 4, 4]

parent[1] = 4    (was 2)
  parent: [4, 4, 3, 4, 4]

parent[2] = 4    (was 3)
  parent: [4, 4, 4, 4, 4]

parent[3] = 4    (already 4, no change)
```

After that one find, the tree is flat. Every element points directly to root 4. Every subsequent call — `find(0)`, `find(1)`, `find(2)`, `find(3)` — is a single hop. The first find paid the cost of walking the chain; every find after that is O(1). That's the amortization: you pay once to flatten, then benefit forever.

Together these give O(α(n)) amortized per operation, where α is the [inverse Ackermann function](https://en.wikipedia.org/wiki/Ackermann_function#Inverse). For any n you'll ever see in practice, α(n) ≤ 4.

---

## Where it shows up

Once I understood how Union-Find works, it made sense why so many people recommend knowing it:

- **Type inference** — Hindley-Milner unification merges type variables into equivalence classes. Union-Find is the core data structure.
- **Alias analysis** — determining whether two pointers might refer to the same memory. Alias sets are maintained with Union-Find.
- **Register coalescing** — merging virtual registers that can share a physical register.
- **Kruskal's MST** — uses Union-Find to detect cycles during minimum spanning tree construction.

These are all "group things together, then ask which group something belongs to" problems. That's the Union-Find shape. Claude helped me see this pattern — I'd ask "where does this actually get used?" and the answers kept connecting back to compilers and systems code I care about.

---

## How I got here

I knew what Union-Find was _supposed to do_ but had no idea how to implement one efficiently. My first attempt reached for the tools I was comfortable with: an `unordered_map` from each element to a `shared_ptr<unordered_set>` representing its component. `find` called `min_element` on the set. `unite` iterated over one set and inserted each element into the other. The commit message: "Super rough, inefficient stab at UF."

It passed the tests. It was also O(n) for both operations, with heap allocations, hash collisions, and pointer indirection on every call.

The next attempt replaced the hash sets with a `Component` struct holding a representative and element set. Still O(n) unites — I was still thinking about Union-Find as "containers of elements" rather than "trees of parent pointers." I didn't know about the forest representation yet.

This is where Claude was most useful as a tutor. I showed it what I had and asked how the real thing works. The parent-pointer forest is one of those ideas that's obvious once you see it — every element just stores an `int` pointing to its parent, the whole thing is a flat array — but I wouldn't have arrived there from my hash-map-of-sets starting point without being pointed in the right direction.

That single change — from hash maps of sets to `vector<int>` — is the foundation of Union-Find's performance. Everything else is optimization on top of this representation.

Claude then walked me through path compression and union by rank. Path compression was intuitive once I understood the forest: after you walk to the root, just repoint everything along the way so future walks are shorter. My first version only repointed the starting node:

```cpp
int find(int x) {
    int x_walker = x;
    while (parent[x_walker] != x_walker) {
        x_walker = parent[x_walker];
    }
    parent[x] = x_walker;  // only x, not intermediates
    return x_walker;
}
```

I fixed this almost immediately — a second pass walks the path again and repoints every intermediate node directly to the root. Then union by rank, which keeps trees balanced by always attaching the shorter tree under the taller.

At this point I had the standard implementation with both optimizations. But I wanted to understand what each one actually contributes. Are there cases where one matters more than the other? To find out, I templatized the class:

```cpp
template <bool UseUnionByRank, bool UsePathCompression>
class UnionFind { ... };
```

The `if constexpr` branches compile away entirely, so each variant has zero overhead from the parameterization. Four implementations from one codebase, each as fast as hand-written. Claude generated the Google Benchmark harness and test suite to measure all four.

---

## Benchmarks

All numbers are from release builds on Apple Silicon (10-core M-series, 4 MiB L2 per core) using Google Benchmark. I ran debug builds too — the comparison turned out to be part of the story.

Raw benchmark data: [release](/data/union_find_bench_release.txt), [debug](/data/union_find_bench_debug.txt)

### Adversarial chain: one find after worst-case construction

Build a chain via `unite(i, i-1)` for all `i`, creating maximum tree depth. Then call `find` once on the deepest node.

| Variant          | 1K    | 32K    | 256K  |
| ---------------- | ----- | ------ | ----- |
| None             | 1.3μs | 12.5μs | 83μs  |
| Rank only        | 424ns | 1.1μs  | 1.2μs |
| Compression only | 2.5μs | 24μs   | 146μs |
| Both             | 422ns | 1.1μs  | 1.2μs |

<div style="max-width: 600px; margin: 1.5em auto;">
<canvas data-chart='{"title":"Adversarial Chain: One Find","yLabel":"Time (μs)","log":true,"labels":["1K","32K","256K"],"datasets":[{"label":"None","color":"#ef4444","data":[1.283,12.5,82.65]},{"label":"Rank only","color":"#3b82f6","data":[0.424,1.1,1.15]},{"label":"Compression only","color":"#f59e0b","data":[2.507,24.3,146.1]},{"label":"Both","color":"#22c55e","data":[0.422,1.06,1.19]}]}'></canvas>
</div>
<div style="max-width: 600px; margin: 1.5em auto;">
<canvas data-chart='{"title":"Adversarial Chain: Speedup vs No Optimization","yLabel":"Speedup (×)","log":true,"labels":["1K","32K","256K"],"datasets":[{"label":"Rank only","color":"#3b82f6","data":[3.03,11.4,71.9]},{"label":"Compression only","color":"#f59e0b","data":[0.51,0.51,0.57]},{"label":"Both","color":"#22c55e","data":[3.04,11.8,69.5]}]}'></canvas>
</div>

Rank dominates. It prevents the deep chain from forming in the first place, so the single find has almost nothing to walk. At 256K, rank keeps the find at ~1.2μs — effectively constant, barely changed from 32K.

The surprise: **compression only is slower than no optimization.** It pays the cost of rewriting every parent pointer during the walk, but since this is a single find, the flattening never pays off. The investment has no return. This is the textbook argument for amortization made visible — compression is pure overhead unless you query the same paths again.

### Repeated find: same node queried many times

Same adversarial chain, but call `find` once before timing to trigger compression (if enabled), then measure subsequent calls.

| Variant          | 1K     | 32K    | 256K   |
| ---------------- | ------ | ------ | ------ |
| None             | 267ns  | 8.5μs  | 67μs   |
| Rank only        | 0.25ns | 0.25ns | 0.25ns |
| Compression only | 0.53ns | 0.58ns | 0.54ns |
| Both             | 0.40ns | 0.37ns | 0.38ns |

<div style="max-width: 600px; margin: 1.5em auto;">
<canvas data-chart='{"title":"Repeated Find After Chain","yLabel":"Time (ns)","log":true,"labels":["1K","32K","256K"],"datasets":[{"label":"None","color":"#ef4444","data":[267,8500,67000]},{"label":"Rank only","color":"#3b82f6","data":[0.249,0.248,0.248]},{"label":"Compression only","color":"#f59e0b","data":[0.534,0.584,0.537]},{"label":"Both","color":"#22c55e","data":[0.403,0.372,0.382]}]}'></canvas>
</div>
<div style="max-width: 600px; margin: 1.5em auto;">
<canvas data-chart='{"title":"Repeated Find: Speedup vs No Optimization","yLabel":"Speedup (×)","log":true,"labels":["1K","32K","256K"],"datasets":[{"label":"Rank only","color":"#3b82f6","data":[1072,34274,270161]},{"label":"Compression only","color":"#f59e0b","data":[500,14555,124721]},{"label":"Both","color":"#22c55e","data":[663,22849,175393]}]}'></canvas>
</div>

The most dramatic result in the whole suite. Without optimization, every find re-walks the full chain — time scales linearly with n. With either optimization, repeated finds are O(1) regardless of size.

Rank keeps trees shallow from the start. Compression flattens them after the first walk. Either way, subsequent finds go straight to the root.

The sub-nanosecond times (0.25ns for rank only) suggest the compiler may be partially hoisting the result — a single L1 cache hit is ~1ns on this hardware. But whether it's 0.25ns or 1ns doesn't matter. The story is the six-orders-of-magnitude gap between 67μs and 0.25ns at 256K elements.

### Random workload: n unites + n finds

Typical usage — not adversarial. Random unite patterns followed by random finds.

| Variant          | 1K    | 32K   | 256K  |
| ---------------- | ----- | ----- | ----- |
| None             | 6.4μs | 248μs | 2.0ms |
| Rank only        | 2.3μs | 79μs  | 622μs |
| Compression only | 2.1μs | 61μs  | 471μs |
| Both             | 2.2μs | 68μs  | 527μs |

<div style="max-width: 600px; margin: 1.5em auto;">
<canvas data-chart='{"title":"Random Workload: n Unites + n Finds","yLabel":"Time (μs)","log":true,"labels":["1K","32K","256K"],"datasets":[{"label":"None","color":"#ef4444","data":[6.375,248,1961]},{"label":"Rank only","color":"#3b82f6","data":[2.31,78.8,622]},{"label":"Compression only","color":"#f59e0b","data":[2.09,61.1,471]},{"label":"Both","color":"#22c55e","data":[2.24,67.9,527]}]}'></canvas>
</div>
<div style="max-width: 600px; margin: 1.5em auto;">
<canvas data-chart='{"title":"Random Workload: Speedup vs No Optimization","yLabel":"Speedup (×)","labels":["1K","32K","256K"],"datasets":[{"label":"Rank only","color":"#3b82f6","data":[2.76,3.15,3.15]},{"label":"Compression only","color":"#f59e0b","data":[3.05,4.06,4.16]},{"label":"Both","color":"#22c55e","data":[2.85,3.65,3.72]}]}'></canvas>
</div>

Here the story flips: **compression beats rank.** Random unite order doesn't build worst-case chains, so rank has less to prevent. But compression still benefits from flattening paths that get walked repeatedly during the find phase.

Interestingly, "both" isn't meaningfully better than compression alone. The combined O(α(n)) guarantee matters theoretically — it protects you against adversarial inputs — but for typical data, compression does most of the work.

### Debug vs release

Debug was uniformly ~10x slower across all variants and benchmarks. The relative results — which variant beats which — were identical.

This makes sense. Union-Find is just array operations. There's no abstraction layer (no iterators, no smart pointers, no virtual dispatch) for the optimizer to strip away. Release just generates tighter loop code for the same operations. The algorithmic differences dominate in both builds.

---

## What I took away

I started this knowing almost nothing about Union-Find beyond the name. I ended up with a data structure I genuinely find elegant — the entire thing is a flat array of ints, and two simple ideas (keep trees short, flatten paths you walk) make it effectively constant-time.

The standard advice is "use both optimizations." That's still right — it's what gives you O(α(n)) and protects against worst-case inputs. But now I understand _why_, and when each optimization earns its keep:

- **Rank is defensive.** It prevents bad tree shapes from forming. If you only find each element once, rank is all you need — compression is pure overhead.
- **Compression is offensive.** It makes repeated queries fast by flattening paths after the first walk. For typical workloads with repeated finds, compression contributes more than rank.
- **Both together** is the standard answer because you usually can't predict your access pattern. Rank handles the worst case, compression handles the common case.

The result that sticks with me is the adversarial single-find: compression makes things _worse_ when it can't amortize. Knowing when an optimization's cost exceeds its benefit is the kind of thing you only learn by measuring.
