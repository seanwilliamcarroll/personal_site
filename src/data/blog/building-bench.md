---
title: "Building a Sampling Profiler with Claude"
pubDatetime: 2026-03-11T08:00:00-05:00
description: "How I built a ptrace-based sampling profiler for Linux/AArch64 — what I wrote, what Claude wrote, and where it helped and didn't."
tags:
  - projects
  - cpp
  - performance
draft: false
---

I recently built [`bench`](https://github.com/seanwilliamcarroll/bench), a sampling profiler for Linux/AArch64. It uses `ptrace` to periodically interrupt a target process, walks the frame pointer chain to collect call stacks, and resolves symbol names from ELF binaries. Think a bare-bones `perf record` that doesn't need hardware performance counters.

I built most of it with Claude open in a terminal next to my editor. This is about how that went — what I wrote, what Claude wrote, and where it helped and didn't.

---

## How this started

I care about software performance, and I wasn't thrilled with the profiling tools available on macOS. So I set up a Linux VM in UTM/QEMU on my M-series Mac, figuring I'd get access to `perf` and the full Linux performance stack. Turns out, hardware performance monitoring counters (PMCs) aren't exposed to VM guests. `perf` with hardware events just doesn't work.

Rather than give up on the VM, I decided to try building something myself. `ptrace` can interrupt a process and read its registers — that's enough for a sampling profiler. No PMCs required. I didn't set out to build a profiler from scratch, but once I started, it became clear that understanding how a basic profiling tool works would make me better at interpreting results from real tools on real projects down the line.

---

## What I built myself

I like to write things myself when I can. I'm reluctant to pull in libraries unless they're a community standard or someone I trust has personally recommended them. For a learning project, that goes double — the whole point is understanding what's happening.

The core of the profiler is `ptrace`. At a high level:

1. Fork the target process, attach via `PTRACE_SEIZE`
2. On a timer, send `PTRACE_INTERRUPT` to each thread
3. Read the thread's registers via `PTRACE_GETREGSET`
4. Walk the frame pointer chain to collect the call stack
5. Resolve each address to a symbol name via ELF section parsing

I wrote all of that. The main areas, roughly in order:

- **ptrace and register reads** — attaching with `PTRACE_SEIZE`, reading registers via `PTRACE_GETREGSET` + `user_pt_regs` on AArch64, walking the frame pointer chain. One commit is literally called "Work towards reading the regs myself."
- **ELF symbol resolution** — parsing `/proc/pid/maps`, mmap'ing ELF files, walking `SHT_SYMTAB`/`SHT_DYNSYM`, computing load bias for position-independent executables. I also wrote a `RangeMap<K,V>` (sorted vector + binary search) for caching address-to-region lookups.
- **Multi-thread support** — restructuring the profile data model to track samples per-TID, handling `PTRACE_EVENT_CLONE` to discover and seize new threads dynamically.
- **Reporting** — inclusive/exclusive frequency counting, folded stacks output for flame graphs, C++ demangling via `__cxa_demangle`.

---

## Where Claude came in

### As a tutor

This was the most valuable part. I like the Socratic method — having something explain a concept to me in context, where I can ask follow-up questions, is way more effective than reading man pages front to back hoping the relevant paragraph jumps out.

Before I implemented multi-thread support, I asked Claude to walk me through `PTRACE_SEIZE` vs `PTRACE_ATTACH` and what `PTRACE_EVENT_CLONE` actually fires on. Before I wrote the ELF parser, I asked about `SHT_SYMTAB` vs `SHT_DYNSYM`, when `sh_link` points to the string table, and how load bias works for position-independent executables. Having it cut through the boilerplate of the man pages and surface the tradeoffs was genuinely faster than doing it solo.

I also asked questions I would have felt embarrassed Googling. "What does `__cxa_demangle` return for a non-C++ binary?" "Is `if (auto it = map.find(k); it != map.end())` idiomatic C++?" (Yes, but I decided I didn't like it.) Having a tutor you can ask dumb questions without judgment is underrated.

### For scaffolding and boilerplate

The parts I didn't want to spend time on:

- Initial CMake setup and project structure
- `getopt`-based CLI flag parsing (`-o`, `-r`, `-i`, `-f`)
- Config structs (`RecordConfig`, `ReportConfig`)
- Test programs — two C programs and a C++20 producer-consumer pipeline
- README drafts, clang-format config, pre-commit hook

These aren't unimportant — you need them — but they're not the reason I built this project. Having Claude handle them meant I stayed focused on the interesting parts. Once the core was working, it also handled the mechanical finishing work: column-aligned output formatting, switching an if-else chain to a `switch` with `-Wswitch` coverage, updating the README after each feature. I reviewed and committed it.

---

## Where it struggled

It wasn't all smooth. The hardest part of this project was getting the ptrace/signal/wait ordering right in the record loop — the sequence of `PTRACE_INTERRUPT`, `waitpid`, register reads, and `PTRACE_CONT` across multiple threads, with signals arriving out of order. I spent a frustrating stretch debugging this, and Claude (Sonnet) kept suggesting fixes that didn't work or subtly misunderstood the state machine. I eventually switched to Opus, which was able to reason about the interleaving more carefully and helped me get it right.

I was surprised in both directions. Claude was impressively good at understanding the logical flow of the codebase — I could point it at a file and it would immediately see the structure. But it also struggled with things I expected it to handle easily, especially the low-level ptrace sequencing where getting one step wrong means the child process hangs or crashes.

---

## The workflow

The rough pattern:

1. Hit a concept I didn't fully understand → ask Claude to explain it
2. Write the code myself
3. Show Claude what I wrote → ask for a review
4. Claude handles the surrounding work (CLI, tests, docs) so I'm not context-switching

Step 3 was more useful than I expected. After I implemented folded output, Claude caught an unnecessary `sort()`, a `size_t` vs `int` type mismatch, and unused parameters — the kind of things you miss when you've been staring at the same code for an hour.

I didn't treat it as "generate this feature for me." The features I cared about, I wrote. Claude wrote the scaffolding that made the project usable and the tests that made it verifiable.

---

## What it does now

```sh
# Profile a process
bench record -r 10 ./myapp

# Flat report: exclusive + inclusive frequency per thread
bench report

# Folded stacks for flame graphs
bench report -f folded | inferno-flamegraph > flamegraph.svg
```

Per-thread call frequency with exclusive and inclusive counts. Folded output works with speedscope, flamegraph.pl, and inferno. Still on the list: PLT stub synthesis, attaching to already-running processes, DWARF unwinding, and thread name resolution.

---

## What I took away

I've followed plenty of tutorials and walkthroughs before — I have [a raytracer](https://github.com/seanwilliamcarroll/rt), [a programming language](https://github.com/seanwilliamcarroll/pl), [an LLM](https://github.com/seanwilliamcarroll/llm) on my GitHub, all at least partially built by following guides. They're fine, but they have a specific problem: you're doing what the guide says to do. It explains why, but you can't ask follow-up questions. You can Google around, maybe find a Reddit post or a Stack Overflow answer, but it's hit or miss. And it makes you reluctant to deviate — if you change something at step A because you'd prefer it a different way, you might break things by step D and the guide becomes useless.

With Claude, I got an interactive walkthrough. I could ask "why this and not that?" and get an answer in the context of my code, not someone else's example. I could make decisions I preferred — like writing my own `RangeMap` instead of pulling in a library — and still have a knowledgeable second opinion available when those decisions had consequences.

I wouldn't call myself an expert on ptrace or ELF internals now, but I'm a lot less afraid of them. Building something real — not a hello world — with these APIs was a good way to get my feet wet. And understanding how a profiler works under the hood has already changed how I think about profiling results.

In the future, I'd probably point Claude at a tutorial or guide I'm interested in and use it as a tutor for that topic. Not to replace the guide, but to have someone — something? — available when I want to dig into something the guide glosses over, or when I want to go off-script. It's not a perfect teacher. But it's a teacher that has broad general knowledge, can go look things up, and can distill what it finds into something useful for where I am right now.

I don't write blog posts. This is an experiment too. But if you're considering using an LLM for a learning project, I'd recommend this approach: let it teach you, let it handle the boring parts, and write the interesting code yourself.

---

_P.S. — Claude wrote this post too. I fed Sonnet the git commit history and some direction, and it produced a first draft. Then I switched to Opus and iterated on tone, structure, and getting my actual experience into it rather than a generic technical summary. I suffer from the blank page problem — I'm a much better editor than I am a first-draft writer. Claude doesn't have that problem. Having it produce something definitive that I can accept, reject, or reshape is a good way to get moving. Even the writing process ended up being a version of the same workflow._
