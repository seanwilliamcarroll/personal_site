---
title: "A Return to Hobby Projects"
pubDatetime: 2026-07-10T00:00:00-05:00
description: "A retrospective on a few hobby projects that I worked on earlier this year."
tags:
  - projects
  - cpp
draft: false
---

I've been working lately to try and improve my skills in my free time. Earlier this year, I had a few good projects going before I drifted to other interests of mine. After my daughter was born in January and my wife and I finally got our heads above water, I still had a few weeks left in my first segment of paternity leave. I had a few minutes here and there to tinker with some projects. This renewed interest for me in coding on my own time for fun, and it continued for a few months after, even after I returned to work.

## Fun New Projects

### Back to Basics

I spent a lot of time in March working on https://github.com/seanwilliamcarroll/ds to rebuild some CS fundamentals. I joked with my wife that I was "working out", but it did feel like that, in the best way possible. Like when you're using muscles you haven't used recently, so they ache at first, but then they start to find their old strength, right where you left it. I had a ton of fun trying out different implementations of hash maps. I also was able to dig into the nitty-gritty of the performance characteristics of the different implementations on my own system. There were limitations to this work, seeing as I focused on integers as key values, but I feel that the knowledge gained would transfer well to other situations with less trivial key values.  
I also spent some time with some LeetCode problems, and I worked with a few more data structures and algorithms. But the hash maps were the most fun to play with and I got a feel for Google's benchmarking tools along the way.  
See some of my previous blog posts for more information.  
[Hash Map Benchmarking](/posts/hash-map-baseline)  
[Trie Benchmarking Part 1](/posts/benchmarking-tries)  
[Trie Benchmarking Part 2](/posts/benchmarking-tries-part-2)  
[Union Find Benchmarking](/posts/benchmarking-union-find)

### Benchmarking

At work over the last few years, I've gotten really interested in the performance of the code that I write. To me, that's a natural consequence of working in languages like C++ and Rust. If you're going to use the languages that give finer-grained controls for memory and other resources, you might as well use them efficiently. At work, that has been done with valgrind, specifically using callgrind to track which functions are taking up the most instructions executed as a reasonable proxy for the proportion of wallclock time they're taking up. I used these measurements to help me find hot paths. Once found, I could inspect and reason about them, making changes and measuring iteratively to determine if my hypothesis was correct or not.  
Naturally, I wanted to try this out in my own personal projects. But I quickly ran into a problem. I use a MacBook Air with M4 Apple Silicon, which doesn't seem to have good support for valgrind. Or any support from what I've been able to research. I also knew that perf was a common tool, and it was one I didn't have experience with. But alas, it too is not really supported on my personal machine. I tried a different tack. I downloaded UTM and booted up a Linux image, hoping I could try profiling from within a virtual machine. Not ideal, but I thought it would at least be something I could do locally. While I was doing this, it occurred to me that a good way to get some understanding of perf would be to build something similar to it. Enter https://github.com/seanwilliamcarroll/bench  
I started this to try and emulate `perf record`. I could use my tool, written in C++20, to sample a program using software hooks. Even though I had a virtual Linux machine, there was still no exposure of PMCs that I was able to discover. So I tried out ptrace and just polled the programs. This was neat, getting some exposure to things I'd long heard of but never actually tried myself. I settled on frame pointer unwinding to capture call stacks, as my research into DWARF unwinding indicated it would be more of a time commitment than I was willing to make at this point. The tool itself is wonderfully simple. That said, the bit of machinery around the actual stopping and starting of my forked program and its child threads took quite a bit of trial and error. Reading the ELF file was cool, but it was primarily following the prescribed data structures until I got to the symbol I was looking for as I did my unwinding. This was a great first step into working with code that called `signal` and `kill`, something that had seemed interesting to me for a long time.  
See this blog post written about the process..  
[Building Bench](/posts/building-bench)

### Compiler

Following my foray into data structures and rebuilding some of my CS fundamentals, I was attracted back to the One That Got Away: compilers and programming languages. I call it that because it was a major course in undergrad (https://www.cs.cornell.edu/courses/cs4120/) that I wasn't able to make fit with my schedule between my required design courses and the fact it was only offered every other year at that time. I'd written interpreters multiple times, but always was interested in going further. I was always writing them for toy implementations of Scheme/Lisp-like languages, but I had always been curious about building a compiler for a language in the paradigms of those I work with the most. In this case, I chose to model my language on Rust, calling it Bust. https://github.com/seanwilliamcarroll/interpreters  
I wrote everything in C++20, trying to escape the bounds of my C++11 tooling in my day job. The language was one aspect. The other was actually compiling my ASTs into _something_. I chose LLVM IR to start with. Maybe someday I'll work more on the backend side of a compiler, picking out some hardware to try and map IR to. But for now, the frontend was plenty interesting to me and there was so much to explore. I was able to build up the layers of my compiler. The pipeline I developed looked something like the following. I've glossed over some details here for the sake of clarity.

<div style="text-align: center">

Bust Source Code  
_**lexed into**_  
Tokens  
_**parsed into**_  
Abstract Syntax Tree  
_**type-checked into**_  
High-Level Intermediate Representation (HIR)  
_**monomorphized and all type variables substituted into**_  
"Zonked" IR (ZIR)  
_**lowered to**_  
LLVM IR

</div>

Note that I didn't use the Rust AST or HIR code for this, I just stole some names when it suited me. And I'm well aware that what I was doing was not exactly "Zonking" in the GHC sense of the word, but it's a funny word and I liked the look of `zir` as a namespace. Sue me.  
My language supported polymorphic lambda functions. I wrote a basic type-checking system to unify type variables with concrete types, allowing some type inference. I was able to monomorphize those polymorphic lambdas into the correct concrete types, eventually emitting IR for each concrete version of the original function. I also eschewed the existing LLVM project code for generating LLVM IR and rolled my own. This was a great excuse to try out the Builder design pattern, in a loose attempt to emulate LLVM's own implementation at a high level.  
I learned a ton about the typical things compilers do and the choices made at various steps. This project captured my attention for probably 6 weeks or so. I was obsessed, squeezing any extra minute outside of work and my duties as a new dad into my project.

## Did I Mention?

These projects were different for me. They were some of the first serious times that I used an AI agent in my own personal projects. I had been using agents at work for some months by this point, but I wanted to explore them on my own as well.  
I've been skeptical of AI agents from the start, and I would say I still am to some extent. But I _do_ use them. And I do reach for them fairly early. But I've found I reach for them in different ways depending on what I'm doing.  
For the above projects, I treated the agent as my "Tutor" primarily. I instructed it to behave as a Tutor, using the Socratic method to help explain concepts to me, rather than just throwing walls of text at me. My prompts would specifically indicate that I didn't want the agent to be writing code unless I explicitly asked. I always kept permissions conservative, reading through any diff it proposed on the occasion I did ask. But I wanted to learn, and that means writing things myself. The part I found really great was having the agent do all the things I found tedious. I also used it to help me get up and running with some things I didn't know a ton about. It was able to quickly get a CMake project going for me, something I've set up in the past but always ran into some odd issue or another, leading to digressions spent fighting CMake, time I would have rather spent on the project at hand. With the agent, it could cut through the boilerplate for me almost instantly, leaving more time for me to work on what I was interested in.  
The other place I used it was for unit testing. I wrote very few of the unit tests myself. I directed the agent towards specific cases I had in mind and had it expand on things from there. This was the right move for me, and it helped me develop better unit testing methodology.  
In addition to these projects, I had put together this website, also with the help of an AI agent. The agent wrote the blog posts linked above, under my supervision. I hadn't written a blog before and I used the agent to help me organize my thoughts and tell the story I wanted to. I did multiple revisions of each post, explaining to the AI exactly what I wanted the post to say, nit-picking when appropriate, and having it generate some charts and graphs for me.

## An Aside About Vibe-Coding

I would say that I am generally against the practice of vibe-coding. To me, vibe-coding would be interacting with an AI agent to write a piece of software and never looking at the code it has written, merely looking at the behavior of the code when using it and judging if it is doing what you want or not. I've not often found occasion for this, but I have given it a shot just to understand it. I've built two scripts completely vibe-coded on my own personal time.  
The first was a simple one just to try out vibe-coding something. https://github.com/seanwilliamcarroll/git_status  
The "problem" I picked was to see a summary of the states of the various repos I had on my personal machine and their relationship to their remote repos on my personal GitHub. I figured it was in the right vein of not being ridiculously trivial, but also not a massive piece of software that would become load-bearing. I had a generally good experience, and the tool works.  
The second is more recent, and it was to solve a real query I had, and incidentally was also Git-related. https://github.com/seanwilliamcarroll/ai_blame  
I had been working on my AI-assisted projects for a while at this point, including the ones mentioned above and some not. I was curious as to the number of lines attributable solely to me in these projects, i.e. how much of the project was AI-generated and how much was human? I'm well aware of the issues of using line counts as a metric, but for the moment, I feel it is somewhat helpful, especially since I could break it down file by file, knowing myself which files were more vital to the core logic of the project and which files were more boilerplate that I cared less about. It does its job, even pulling apart squashed PRs into their original commits to figure out who actually authored what.

## Some Numbers

Using that second vibe-coded tool, I collected some quick data on those projects listed above.

### DS

Running the tool directly on the project, it generates the following results for the hpp/cpp files.

    TOTAL
      AI-authored        4830 lines
      Human-authored     2123 lines
      █████████████████░░░░░░░  69.5% AI

When I filter out some of the files I knew to be heavily AI-generated on purpose, the numbers change slightly.

    TOTAL
      AI-authored        1625 lines
      Human-authored     2048 lines
      ███████████░░░░░░░░░░░░░  44.2% AI

When I consider that I had the agent generate stubs for me for a lot of this project, I feel fairly comfortable with this. It's a bit higher than I originally expected, but I do think there may be some noise in there for files I had the agent reformat for me, or rename/move. But even still, when I look at the files I cared the most about, they're overwhelmingly human-generated, or at least the core "interesting" parts are.

### Bench

Running directly on the raw project, it appears again to be more heavily AI-generated.

    TOTAL
      AI-authored         708 lines
      Human-authored      549 lines
      ██████████████░░░░░░░░░░  56.3% AI

But after removing some of the test programs I had the agent generate for me, the story changes some.

    TOTAL
      AI-authored         348 lines
      Human-authored      537 lines
      █████████░░░░░░░░░░░░░░░  39.3% AI

Again, I feel pretty comfortable with this number. The code I had the agent generate for me was that which gave me the ability to configure command line arguments for the tool, some configuration refactoring, reading/writing results out to disk, and some other small utilities. The core logic concerning the actual sampling, the stopping and starting of a forked program, the walking of the ELF file data structures, was all written by me. Because those were the parts I had a genuine interest in and I wanted to learn.

### Bust

On the raw repo, a solid mix of AI and human authorship.

    TOTAL
      AI-authored       17338 lines
      Human-authored    16565 lines
      ████████████░░░░░░░░░░░░  51.1% AI

When I filter out the test code as well as code for the other toy language I had written a few years ago (blip, which was entirely human-generated of course), the story changes yet again.

    TOTAL
      AI-authored        3246 lines
      Human-authored    11692 lines
      █████░░░░░░░░░░░░░░░░░░░  21.7% AI

I feel like this is very accurate when I think about the things I allowed the agent to write and the things I wrote myself. As compared to the other two projects, there's significantly more code here, which reflects both the scope of what I was trying to do and the time I invested. This 21.7% is conservative. There were times when I had the agent move code around between different files, pulling free functions into header files where they belonged and other such tidying. All of that would have those lines counted as "AI-authored". There were certainly times in this project when the agent tried to propose code in the parts I wanted to write, and I recall treating them almost like spoilers for a TV show. I covered the code snippet on the screen with my hand, while rejecting the edit and scolding the agent for doing something I had explicitly asked it not to do. Weird feeling, and that'll probably come back to bite me someday when these agents rise up, but I do say please and thank you in a lot of my prompts, so who knows.

## My Bottom Line

These few months of work on my hobby projects were extremely valuable for me as I brushed up on my CS fundamentals and learned more about C++20, compiler design/programming languages, and performance measurement. All accelerated and aided by the use of an AI agent.  
For hobby projects, where the goal is learning, I've found that an AI agent can really enhance my learning. I was able to bounce ideas off of something, which helped me get through some of the paralysis of the blank page. I used it to talk through potential design decisions, having it provide possible pros and cons, which I could then judge myself and make a more informed decision. I used it to throw together the boilerplate for testing/benchmarking frameworks, for the build system, and for printing and debugging tools in my library.  
I also used it to generate some of the documentation. But I didn't just push the button and say, "Computer, generate the docs". I talked with it at length about each point I wanted the docs to cover, rejecting changes I didn't like and suggesting alternatives. It handled the formatting and some of the tedium of typing it all out formally.

## TL;DR

I like to use AI agents for learning, but only on a very tight leash.

Also, I wrote this entirely myself. I did run it by Claude for some proofing, but it did not edit a single line, cross my heart and hope to die.
