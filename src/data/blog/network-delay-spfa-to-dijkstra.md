---
title: "When BFS Isn't Enough: From SPFA to Dijkstra on Network Delay Time"
pubDatetime: 2026-03-18T00:01:00-05:00
description: "I accidentally implemented SPFA while thinking I was doing BFS with relaxation, then had to build a min-heap from scratch before I could do Dijkstra properly."
tags:
  - projects
  - cpp
  - performance
draft: false
---

**TL;DR:** I accidentally implemented SPFA while thinking I was doing "BFS with relaxation," then had to build a min-heap from scratch before I could do Dijkstra properly. The benchmarking that followed revealed a clean crossover point that shifts with graph density and size.

Source code: [seanwilliamcarroll/ds](https://github.com/seanwilliamcarroll/ds) — raw benchmark data: [release](/data/network_delay_bench_release.csv)

---

## The Problem

[LeetCode 743 — Network Delay Time](https://leetcode.com/problems/network-delay-time/): you have a directed, weighted graph of `n` nodes. Send a signal from node `k`. Return the minimum time until all nodes have received it, or `-1` if any node is unreachable.

<div style="display:flex;justify-content:center;margin:1.5em 0">
<svg viewBox="15 15 260 145" width="280" height="160" style="max-width:100%" role="img" aria-label="Directed graph: node 2 connects to nodes 1 and 3 with weight 1, node 3 connects to node 4 with weight 1">
  <defs>
    <marker id="ah" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="currentColor"/></marker>
  </defs>
  <g fill="none" stroke="currentColor" stroke-width="1.5">
    <!-- 2 → 3 -->
    <line x1="68" y1="40" x2="132" y2="40" marker-end="url(#ah)"/>
    <!-- 3 → 4 -->
    <line x1="168" y1="40" x2="232" y2="40" marker-end="url(#ah)"/>
    <!-- 2 → 1 -->
    <line x1="50" y1="58" x2="50" y2="122" marker-end="url(#ah)"/>
  </g>
  <!-- edge labels -->
  <g fill="currentColor" font-size="12" text-anchor="middle" font-style="italic">
    <text x="100" y="33">1</text>
    <text x="200" y="33">1</text>
    <text x="62" y="93">1</text>
  </g>
  <!-- nodes -->
  <g>
    <circle cx="50" cy="40" r="18" fill="var(--background, #fff)" stroke="currentColor" stroke-width="2"/>
    <text x="50" y="45" fill="currentColor" text-anchor="middle" font-size="14" font-weight="bold">2</text>
    <circle cx="150" cy="40" r="18" fill="var(--background, #fff)" stroke="currentColor" stroke-width="2"/>
    <text x="150" y="45" fill="currentColor" text-anchor="middle" font-size="14" font-weight="bold">3</text>
    <circle cx="250" cy="40" r="18" fill="var(--background, #fff)" stroke="currentColor" stroke-width="2"/>
    <text x="250" y="45" fill="currentColor" text-anchor="middle" font-size="14" font-weight="bold">4</text>
    <circle cx="50" cy="140" r="18" fill="var(--background, #fff)" stroke="currentColor" stroke-width="2"/>
    <text x="50" y="145" fill="currentColor" text-anchor="middle" font-size="14" font-weight="bold">1</text>
  </g>
</svg>
</div>

Signal from node 2 reaches 1 and 3 at t=1, then 4 at t=2. Answer: 2 — the time at which the _last_ node is reached.

This is a shortest-path problem in disguise. The answer is the maximum over all nodes of the shortest path from `k`. You're not looking for _a_ shortest path — you're computing the shortest path to _every_ node simultaneously.

---

## My First Attempt: Accidentally Inventing SPFA

My instinct was [BFS](https://en.wikipedia.org/wiki/Breadth-first_search). The wrinkle with weighted graphs is that the first time you visit a node isn't necessarily via the shortest path. My fix: if we later discover a shorter path to a node, re-enqueue it so its neighbors can be updated.

```cpp
std::deque<SearchState> neighbor_queue{{.next_node = k, .cost_to_reach = 0}};

while (!neighbor_queue.empty()) {
    const auto state = neighbor_queue.front();
    neighbor_queue.pop_front();
    if (minimum_time_from_k[state.next_node] > state.cost_to_reach) {
        minimum_time_from_k[state.next_node] = state.cost_to_reach;
        for (const auto &[neighbor, weight] : node_to_neighbors[state.next_node]) {
            neighbor_queue.push_back({neighbor, state.cost_to_reach + weight});
        }
    }
}
```

It works. It handles re-relaxation, terminates, and passes all the tests. I was fairly happy with it.

Claude pointed out this algorithm has a name: **[SPFA (Shortest Path Faster Algorithm)](https://en.wikipedia.org/wiki/Shortest_Path_Faster_Algorithm)**. It's a known variant of [Bellman-Ford](https://en.wikipedia.org/wiki/Bellman%E2%80%93Ford_algorithm) using a queue instead of repeated full-graph sweeps. Correct for non-negative weights, but worst-case O(V·E) — nodes can be visited many times depending on input shape.

The problem is that re-enqueue. On a dense graph, discovering a shorter path to node X means re-enqueuing all of X's neighbors — each of which might trigger further re-enqueues of _their_ neighbors. The cascade isn't bounded by anything except the structure of the graph. A node that sits at a hub with many incoming edges of varying weights can be re-enqueued once per improvement, and each re-enqueue fans out to all its neighbors.

The right tool for non-negative weighted shortest paths is [Dijkstra's algorithm](https://en.wikipedia.org/wiki/Dijkstra%27s_algorithm), which guarantees each node is settled exactly once. To implement Dijkstra, I needed a min-heap.

---

## A Necessary Detour: Building a Min-Heap

I'd used `std::priority_queue` before but never understood the internals. Before implementing Dijkstra, I wanted to build one from scratch — a flat-array [binary heap](https://en.wikipedia.org/wiki/Binary_heap) with `bubble_up` and `bubble_down`.

Claude wrote a 20-test suite covering edge cases (empty heap, duplicates, negative values, interleaved push/pop, and a `std::pair<int,int>` test simulating Dijkstra's `(distance, node)` usage). I implemented `MinHeap<T>` against those tests.

---

## Dijkstra Properly

With a working min-heap, Dijkstra's core loop is similar to SPFA's — but the heap means we always expand the globally cheapest node next, and one additional check means we never process a node twice:

```cpp
MinHeap<std::pair<int, int>> search_frontier;
search_frontier.push({0, k});

while (!search_frontier.empty()) {
    auto [time_so_far, node] = search_frontier.pop();
    if (time_so_far > minimum_time_from_k[node]) { continue; } // stale entry
    for (const auto &[next_node, weight] : node_to_neighbors[node]) {
        auto new_time = time_so_far + weight;
        if (minimum_time_from_k[next_node] > new_time) {
            minimum_time_from_k[next_node] = new_time;
            search_frontier.push({new_time, next_node});
        }
    }
}
```

The **stale entry check** is the key line. When a shorter path to a node is found after it's already in the heap, the old entry stays — there's no "decrease-key." When we pop it later with a worse cost, we skip it. Without this, Dijkstra degrades toward SPFA — processing the same node multiple times. With it, each node is settled exactly once, giving O((V+E) log V).

Implementing Dijkstra also cleaned up the SPFA code. My original SPFA tracked `prev_node` in every queue entry solely to look up edge weights from a separate `unordered_map<Edge, int>` — which required a custom `Edge` struct with a hash specialization. Moving to `(dest, weight)` pairs directly in the [adjacency list](https://en.wikipedia.org/wiki/Adjacency_list) — the same representation Dijkstra uses — eliminated the map, the struct, and the hash.

---

## Benchmarking

Two implementations of the same problem, different data structures underneath (deque vs min-heap). The natural question: does it matter, and when?

Claude wrote a Google Benchmark harness and visualization script at my direction. The interesting design problem was graph generation: random edges risk disconnected graphs, so every generated graph starts with a chain `1→2→...→n` guaranteeing reachability, then adds random edges on top. Density is parameterized as a percentage of the extra edges above the chain — 0% is a pure chain, 100% is all possible directed edges.

The benchmark ran a cartesian product: **n ∈ {10, 25, 50, 100, 200, 500}** × **density ∈ {0, 5, 10, 15, 20, 25, 50, 75, 100%}**.

---

## What the Numbers Said

**The crossover density shifts left as n grows.** SPFA is only faster at low density (few paths to re-relax), but the threshold drops as the graph gets larger:

| n    | SPFA faster at... | Dijkstra wins from... |
| ---- | ----------------- | --------------------- |
| 25   | ≤ 15%             | ≥ 20%                 |
| 50   | ≤ 5%              | ≥ 10%                 |
| 100  | ≤ 0%              | ≥ 5%                  |
| 200+ | only at 0%        | immediately at 5%     |

<div style="max-width: 600px; margin: 1.5em auto;">
<canvas data-chart='{"title":"SPFA vs Dijkstra — n = 50, by Density (%)","type":"line","xLinear":true,"yLabel":"CPU time (μs)","labels":["0","5","10","15","20","25","50","75","100"],"datasets":[{"label":"SPFA","color":"#636EFA","data":[2.59,7.37,11.06,14.49,17.21,20.06,36.48,51.44,63.43]},{"label":"Dijkstra","color":"#EF553B","data":[2.74,7.65,10.57,12.93,14.94,16.69,26.78,34.04,40.65]}]}'></canvas>
</div>
<div style="max-width: 600px; margin: 1.5em auto;">
<canvas data-chart='{"title":"SPFA vs Dijkstra — n = 200, by Density (%)","type":"line","xLinear":true,"yLabel":"CPU time (μs)","labels":["0","5","10","15","20","25","50","75","100"],"datasets":[{"label":"SPFA","color":"#636EFA","data":[8.42,81.80,140.80,198.07,254.45,313.59,600.25,886.54,1113.14]},{"label":"Dijkstra","color":"#EF553B","data":[8.72,69.99,102.63,131.20,157.70,178.57,297.84,405.60,502.12]}]}'></canvas>
</div>

**The chain advantage is flat.** At density=0%, SPFA consistently beats Dijkstra by ~5% regardless of n. A chain has one path to each node, so SPFA never re-enqueues — the only difference is O(1) deque operations vs O(log n) heap operations for the same linear traversal. The gap doesn't grow because chain length adds linearly to both algorithms' work.

**The Dijkstra advantage compounds.** At 100% density:

| n   | Dijkstra speedup |
| --- | ---------------- |
| 25  | 1.32×            |
| 50  | 1.56×            |
| 100 | 1.89×            |
| 200 | 2.22×            |
| 500 | 2.56×            |

<div style="max-width: 600px; margin: 1.5em auto;">
<canvas data-chart='{"title":"SPFA vs Dijkstra at 100% Density, by n","type":"line","xLog":true,"log":true,"yLabel":"CPU time (μs)","labels":["10","25","50","100","200","500"],"datasets":[{"label":"SPFA","color":"#636EFA","data":[3.04,14.97,63.43,267.88,1113.14,7273.63]},{"label":"Dijkstra","color":"#EF553B","data":[2.85,11.35,40.65,141.89,502.12,2847.0]}]}'></canvas>
</div>
<div style="max-width: 600px; margin: 1.5em auto;">
<canvas data-chart='{"title":"Dijkstra Speedup at 100% Density","yLabel":"Speedup (×)","labels":["10","25","50","100","200","500"],"datasets":[{"label":"Baseline","color":"#EF553B","data":[1,1,1,1,1,1]},{"label":"Dijkstra speedup","color":"#636EFA","data":[1.07,1.32,1.56,1.89,2.22,2.56]}]}'></canvas>
</div>

This is the re-enqueue cascade in action. On a fully connected graph, every time SPFA improves a node's distance, it re-enqueues all of that node's neighbors — and with high connectivity, that's most of the graph. The number of redundant node visits grows super-linearly with both size and density. Dijkstra avoids this entirely: once a node is popped from the heap, it's settled.

The heatmap made the crossover band immediately obvious: a diagonal boundary running from upper-left (small n, low density — SPFA territory) to lower-right (large n, any density — Dijkstra territory).

---

## What I Took Away

I came into this problem expecting to implement Dijkstra. What actually happened: I implemented SPFA without knowing it, got corrected by name, had to stop and build a min-heap from scratch, then came back and did the thing I'd set out to do.

The benchmarking wasn't planned — it came from a natural question once both implementations existed. The answer was cleaner than I expected: Dijkstra is the right default for non-negative weighted shortest paths, but SPFA isn't just "wrong Dijkstra." On a chain or near-chain graph, it genuinely wins. The crossover happens earlier than you might think — at n=200, even 5% density is enough for the heap to pay for itself.
