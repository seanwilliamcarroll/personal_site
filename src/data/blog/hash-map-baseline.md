---
title: "Four Hash Maps, Three Key Distributions, and One Catastrophe"
pubDatetime: 2026-03-24T00:01:00-05:00
description: "We wrote four hash map implementations, predicted how they'd perform, and declared open addressing the winner. Then we changed the key distribution and watched the winner become 11,000x slower."
tags:
  - projects
  - cpp
  - performance
draft: false
---

**TL;DR:** Open addressing crushed chaining with sequential keys — 19x faster on insert. Then we switched to normally distributed keys and open addressing became 11,000x slower. The "best" hash map depends entirely on your key distribution, and the best-case benchmark is the one you should trust least.

I'm learning performance engineering by building data structures from scratch and
benchmarking them. I'm working with Claude (an LLM) as a collaborator — it
provides the textbook analysis, I write the code, and we both make predictions
before running anything.

This post is about the first thing we built: hash maps. We wrote four
implementations, predicted how they'd perform, ran benchmarks with sequential
keys, and declared open addressing the winner. Then we changed the key
distribution and watched the winner become 11,000x slower.

Source code: [seanwilliamcarroll/ds](https://github.com/seanwilliamcarroll/ds) — raw benchmark data: [release](/data/hash_map_pattern_bench_release.csv)

---

## The implementations

Four `int → int` hash maps, each using `std::hash<int>` — which on most
compilers is the identity function. We confirmed this by inspecting the compiled
assembly: `hash(42)` compiles to literally `42`, no computation at all.[^identity]

[^identity]:
    At -O3 the compiler constant-folds `std::hash<int>()(42)` to
    the literal 42. At -O0 it emits a function call, but the function body is
    `ldrsw x0, [sp, #4]; ret` — load the int, sign-extend to `size_t`, return it.
    See `scripts/verify_identity_hash.sh`.

1. **Chaining** — separate chaining with linked lists. Each node heap-allocated.
2. **Linear Probing (LP)** — open addressing with tombstone deletion.
3. **Robin Hood (RH)** — open addressing with displacement insertion and backshift
   deletion (no tombstones).
4. **std::unordered_map** — the standard library baseline.

## The scenarios

Four operations, all at load factor 0.75 with N = 65,536 entries:

| Scenario         | What's timed                                    |
| ---------------- | ----------------------------------------------- |
| **Insert**       | Insert N keys into an empty map                 |
| **FindHit**      | Find all N keys (all present)                   |
| **FindMiss**     | Find N keys that aren't in the map              |
| **EraseAndFind** | Erase half the entries, then find the survivors |

All benchmarks ran on Apple Silicon M4, compiled with LLVM/Clang 21 at -O3.
Medians of 10 repetitions.

## The three key distributions

We test each scenario with three key distributions. This is the variable that
matters — and the one I almost didn't think to vary.

**Sequential:** Keys 0, 1, 2, ..., N-1. With identity hash and a power-of-two
table, these map to consecutive slots. This is the best case for open addressing
— the hardware prefetcher handles linear scans perfectly.

**Uniform random:** N unique keys drawn uniformly from [0, 10N). Scattered
across the table. Each lookup is a potential cache miss regardless of data
layout.

**Normal (clustered):** Keys drawn from a normal distribution centered at N/2
with standard deviation N/8. About 68% of keys cluster into roughly N/4
consecutive slots around the center of the table.

## Our predictions

Before running anything, we wrote down what we expected.

I knew chaining — it's the textbook default — and I'd heard the complaints about
`std::unordered_map` being slow. Linear probing and Robin Hood were new to me.
Claude provided the textbook analysis of clustering, probe distances, and
tombstone behavior.

I worried about Robin Hood: the displacement chains during insert and the
backshifting during delete sounded expensive. I also worried about LP: wouldn't
clusters degrade lookup?

Claude worried about clustering: primary clustering should hurt LP under
non-ideal conditions.

We wrote a prediction matrix:

| Scenario     | Chaining               | LP                     | RH                       | std    |
| ------------ | ---------------------- | ---------------------- | ------------------------ | ------ |
| Insert       | medium                 | fast                   | medium — swap overhead   | slow   |
| FindHit      | slow — pointer chase   | medium — clusters      | fast — uniform probes    | slow   |
| FindMiss     | slow — walk full chain | medium                 | fast — early termination | slow   |
| EraseAndFind | medium                 | slow — tombstones hurt | fast — clean table       | medium |

Our key beliefs:

- Chaining degrades gracefully; open addressing has sharp failure modes
- `std` is always slowest (chaining overhead + stdlib bloat)

## Act 1: Sequential keys

Sequential keys first. This is where most hash map benchmarks begin and end.

### Results (cpu_time, nanoseconds)

Bold marks the winner in each row.

| Scenario     |         LP |        RH |  Chain |    std |
| ------------ | ---------: | --------: | -----: | -----: |
| Insert       | **117.4K** |    197.7K |  2.30M |  1.20M |
| FindHit      |  **45.6K** |     48.7K |  51.7K |  97.6K |
| FindMiss     |      48.8K | **32.6K** |  37.6K |  80.7K |
| EraseAndFind |  **21.2K** |     25.9K | 319.6K | 354.3K |

LP wins three of four scenarios. RH takes FindMiss. Open addressing dominates.

<div style="max-width: 600px; margin: 1.5em auto;">
<canvas data-chart='{"title":"Sequential Keys — CPU Time by Scenario","yLabel":"Time (ns)","log":true,"labels":["Insert","FindHit","FindMiss","EraseAndFind"],"datasets":[{"label":"LP","color":"#3b82f6","data":[117400,45600,48800,21200]},{"label":"RH","color":"#f59e0b","data":[197700,48700,32600,25900]},{"label":"Chain","color":"#22c55e","data":[2300000,51700,37600,319600]},{"label":"std","color":"#ef4444","data":[1200000,97600,80700,354300]}]}'></canvas>
</div>

### Analysis

**Insert** — LP is fastest, as predicted. But it's 20x faster than chaining. We
expected maybe 2-3x. And our chaining is slower than `std` — we predicted the
opposite. `std::unordered_map`'s allocator handles per-node allocation better
than our naive `make_unique` calls.

**FindHit** — We predicted RH fastest thanks to its more uniform probe
distribution. In reality, LP, RH, and Chain are all within 13% of each other.
The table is about 780KB at this size — well beyond L1 cache (128KB on M4). At
this scale, the cost of a cache miss dominates the number of probes. Whether you
probe 2 slots or 4, you're paying for the same L2 cache hit.

**FindMiss** — RH wins as predicted. Chaining takes second — an empty bucket is
an instant "not found," and at load 0.75 a quarter of buckets are empty.

**EraseAndFind** — This is the prediction we were most confident about, and most
wrong. We said LP would be slow because tombstones degrade subsequent finds.
We said RH would be fast because backshift deletion keeps the table clean.
Reality: LP is fastest, 15x faster than chaining. Tombstone damage is real in
theory — but with sequential keys, LP has both advantages: probes are short
(keys scatter perfectly) and each probe is cache-friendly (a linear scan through
a flat array). Chaining has neither: it chases pointers through scattered heap
nodes, and each node is a potential cache miss. The constant factor of a cache
miss dwarfs the algorithmic difference in probe count.

### The tempting conclusion

Open addressing dominates. LP wins three of four scenarios. Chaining is 15-19x
slower on insert and erase. Case closed?

This is where many performance blog posts would end. We almost did. But I kept
coming back to the same question: these keys are 0, 1, 2, ..., N-1, hashed by
the identity function into consecutive slots. How often does that actually
happen? Almost every optimization here is a tradeoff based on an assumption
about the input. What happens when the assumption breaks?

## Act 2: Uniform random keys

Same scenarios, but now keys are uniformly random instead of sequential. No more
consecutive slots. No more prefetcher-friendly linear scans. Every lookup is a
potential cache miss.

### Results (cpu_time, nanoseconds)

| Scenario     |         LP |        RH |      Chain |    std |
| ------------ | ---------: | --------: | ---------: | -----: |
| Insert       | **698.3K** |     1.01M |      4.33M |  2.10M |
| FindHit      | **127.3K** |    138.3K |     149.4K | 356.0K |
| FindMiss     |     423.4K |    289.4K | **272.9K** | 589.0K |
| EraseAndFind |     102.3K | **62.7K** |     566.3K | 477.0K |

<div style="max-width: 600px; margin: 1.5em auto;">
<canvas data-chart='{"title":"Uniform Random Keys — CPU Time by Scenario","yLabel":"Time (ns)","log":true,"labels":["Insert","FindHit","FindMiss","EraseAndFind"],"datasets":[{"label":"LP","color":"#3b82f6","data":[698300,127300,423400,102300]},{"label":"RH","color":"#f59e0b","data":[1010000,138300,289400,62700]},{"label":"Chain","color":"#22c55e","data":[4330000,149400,272900,566300]},{"label":"std","color":"#ef4444","data":[2100000,356000,589000,477000]}]}'></canvas>
</div>

### Analysis

The sequential results were partly cache flattery — the hardware prefetcher
was doing work that open addressing got credit for. Removing that subsidy
reveals how much of Act 1's gap was the algorithm and how much was the
hardware.

LP's insert advantage drops from 20x to 6x over chaining. FindHit stays
close — LP, RH, and Chain are within 17% of each other. RH takes
EraseAndFind from LP. And the asymmetry is consistent: random keys hurt
open addressing far more than chaining. LP's insert slows down 6x from
sequential; chaining's slows down 1.9x. LP's FindMiss is the most dramatic
— 8.7x slower, as scattered miss probes through tombstones are expensive
when every probe is a cache miss.

The lesson: you can't separate the algorithm from the hardware. Sequential
keys didn't just test the hash map — they tested the prefetcher. Open
addressing still wins on absolute numbers here, but its margin is thinner
than Act 1 suggested, and it's not clear how much further it can erode.

## Act 3: Normal keys

After the uniform results, I kept thinking: how often does a real system insert
sequential keys into a hash map? With identity hash, the distribution of keys
_is_ the distribution of slots. And integer keys cluster in plenty of real
scenarios — auto-increment IDs, timestamps, geographic coordinates, sensor
readings.

So we tried a normal distribution: keys centered at N/2, standard deviation N/8.
About 68% of keys cluster into roughly N/4 consecutive slots. At load factor
0.75, open addressing normally expects ~4 probes per operation. What happens
when thousands of keys hash to the same neighborhood?

### Results (cpu_time, nanoseconds)

| Scenario     |       LP |        RH |     Chain |       std |
| ------------ | -------: | --------: | --------: | --------: |
| Insert       |  755M !! | 2,049M !! |     4.37M | **2.11M** |
| FindHit      |  525M !! |   608M !! |      493K |  **363K** |
| FindMiss     | 2.18M !! |  2.46M !! | **50.8K** |      344K |
| EraseAndFind |  789M !! |  52.5M !! |      589K |  **449K** |

The `!!` numbers are catastrophic — millions of nanoseconds to two seconds
per batch on just 65,536 entries. Every scenario is catastrophic for open
addressing — including FindMiss, which held up well in Acts 1 and 2.

<div style="max-width: 600px; margin: 1.5em auto;">
<canvas data-chart='{"title":"Normal Keys — CPU Time by Scenario","yLabel":"Time (ns)","log":true,"labels":["Insert","FindHit","FindMiss","EraseAndFind"],"datasets":[{"label":"LP","color":"#3b82f6","data":[755000000,525000000,2180000,789000000]},{"label":"RH","color":"#f59e0b","data":[2049000000,608000000,2460000,52500000]},{"label":"Chain","color":"#22c55e","data":[4370000,493000,50800,589000]},{"label":"std","color":"#ef4444","data":[2110000,363000,344000,449000]}]}'></canvas>
</div>

### Analysis

Open addressing with identity hash went quadratic.

LP's Insert takes 755 million nanoseconds — 6,431x slower than with sequential
keys. LP's FindHit takes 525 million — 11,500x slower. These aren't "slow."
They're broken. The normal distribution creates a massive cluster around N/2,
and with identity hash mapping those keys directly to those slots, every insert
and find has to probe through the entire cluster.

Robin Hood is even worse on some operations. RH Insert takes 2 _billion_
nanoseconds. Robin Hood's displacement rule — "take from the rich, give to the
poor" — means each insert into the dense cluster displaces an element, which
displaces another, propagating through thousands of entries. Its backshift
deletion (shifting elements backward on erase to avoid tombstones) causes the
same cascading effect in reverse.

Chaining barely notices. Chain FindHit goes from 51.7K (sequential) to 493K
(normal) — a 9.5x slowdown, not an 11,000x one. The clustered buckets have
longer chains, but each chain is independent. There's no cascading effect.
We predicted chaining would degrade gracefully. We were right — we just
didn't appreciate what that would be worth until we saw the alternative.

And `std::unordered_map` wins — the implementation we predicted would always
be slowest. Here it's the fastest on Insert, FindHit, and EraseAndFind. `std` is
chaining under the hood, so it's immune to the clustering catastrophe. Its
node-based allocation, which was a liability with sequential keys, is irrelevant
when the alternative is probing through 50,000 occupied slots.

FindMiss completes the picture. With sequential and uniform keys, FindMiss
was the one scenario where open addressing held up well — RH's early
termination and LP's short probes kept miss lookups fast. I expected the same
with normal keys. The miss keys hash to completely different slots than the
hit keys (we verified: 0% home slot overlap). How could a cluster hurt you
if your keys don't even hash near it?

It turns out open addressing's displacement mechanism spreads the cluster far
beyond its home slots. The hit keys cluster around home slots near N/2, but
collisions push displaced entries into neighboring slots, which push _their_
neighbors further out. At N=65,536 (table size 131,072), the cluster extends
across 23,000+ contiguous occupied slots — roughly 18% of the table. Miss
keys that hash to "empty" regions land inside this occupied run and have to
probe all the way to the far edge.

We added probe counting to LP to confirm:

| N      | Avg probes per miss | Max probes per miss |
| ------ | ------------------- | ------------------- |
| 256    | 1.4                 | 53                  |
| 4,096  | 4.6                 | 839                 |
| 65,536 | 64.7                | 23,425              |

<div style="max-width: 600px; margin: 1.5em auto;">
<canvas data-chart='{"title":"Insert — CPU Time Across All Three Distributions","yLabel":"Time (ns)","log":true,"labels":["Sequential","Uniform","Normal"],"datasets":[{"label":"LP","color":"#3b82f6","data":[117400,698300,755000000]},{"label":"RH","color":"#f59e0b","data":[197700,1010000,2049000000]},{"label":"Chain","color":"#22c55e","data":[2300000,4330000,4370000]},{"label":"std","color":"#ef4444","data":[1200000,2100000,2110000]}]}'></canvas>
</div>

Every lookup correctly returns "not found." It just takes thousands of probes
to get there. This isn't a cache problem — we ran a warm-up pass to
pre-populate the cache and it made zero difference. It's genuine
O(cluster_size) probing.

Robin Hood doesn't escape either. I initially expected RH's early termination
to save it — a miss lookup should stop as soon as it sees an occupant with a
shorter probe distance. But the miss keys land among entries that have been
displaced _far_ from their home slots. These displaced entries have very high
probe distances, so early termination never fires — the occupant's probe
distance is always greater than the searcher's. RH scores 2.46M on
FindMiss/Normal, slightly _worse_ than LP's 2.18M.

Only chaining is immune. Chaining's collisions are vertical (longer chains at
the same bucket), not horizontal (spilling into neighbors). An empty bucket
stays empty no matter how dense the neighboring buckets are. Chain scores
50.8K — barely different from its 37.6K with sequential keys.

The normal distribution doesn't just make _your_ keys slow to find — it
pollutes the entire table, making _unrelated_ keys slow too. The cluster is
contagious.

## Closing

| Scenario     | Sequential | Uniform | Normal |
| ------------ | ---------- | ------- | ------ |
| Insert       | LP         | LP      | std    |
| FindHit      | LP         | LP      | std    |
| FindMiss     | RH         | Chain   | Chain  |
| EraseAndFind | LP         | RH      | std    |

We started with reasonable predictions, benchmarked with sequential keys, and
thought we understood hash map performance. Then we changed the key distribution
and every conclusion inverted.

The thing that sticks with me is how confident the sequential results felt.
LP was 19x faster — that's not a marginal difference you can explain away. It
felt like a settled question. But the result was an artifact of the best-case
input, and the best case is the one you should trust least.

Every optimization is a tradeoff built on an assumption: about the input, the
hardware, the access pattern. Open addressing assumes keys scatter reasonably
across the table. Identity hash assumes the keys are already well-distributed.
When those assumptions hold, you get 19x wins. When they don't, you get 11,000x
losses. The question isn't "which hash map is fastest?" It's "what does your
data actually look like, and how badly does your design degrade when you're
wrong about that?"

---

_N = 65,536. Apple Silicon M4 (P-core, 128KB L1, 16MB L2). LLVM/Clang 21.1.8,
-O3. Load factor 0.75. Medians of 10 repetitions. All code is
[on GitHub](https://github.com/seanwilliamcarroll/ds)._
