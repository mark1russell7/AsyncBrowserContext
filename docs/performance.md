# Performance

This document gives the benchmark results of `async-browser-context` and tells how to measure them again.

## Measure the performance

1. Stop the other programs that use the CPU, if possible.
2. Start the benchmarks:

   ```sh
   pnpm bench
   ```

The command builds the library and starts one Node.js process for each case. Each process measures the scenarios with tinybench. The results go to `bench/results/latest.json`.

The command does 5 rounds. Each round starts one process for each case, and each round has a different order of the cases. The result of a case is the median of its rounds. Set `BENCH_ROUNDS` to change the number of rounds.

The rounds are necessary because the load of the machine can change during the measurement. An earlier version of the command did one process for each case. On a machine with other work, it gave incorrect results. The library was faster than plain JavaScript. Two cases with the same code had a factor of 2 between them.

## Cases

| Case | Description |
| --- | --- |
| Plain | Plain JavaScript without the library. A `Variable` class without propagation gives the same API. |
| Transform only | The Babel preset with the plain `coroutine` of the Node.js runtime. This case shows the cost of the transform without the cost of the context. |
| Library | The Babel preset and the browser runtime. |

## Results

Node.js 25.2.1 on Windows 11, AMD Ryzen AI 7 PRO 350 (16 logical cores). The values are the mean time of one operation of each scenario, as the median of 5 rounds. The range shows the lowest and the highest factor of one round.

| Scenario | Plain | Transform only | Library | Library / plain | Range |
| --- | --- | --- | --- | --- | --- |
| 10,000 awaits in one async function | 0.26 ms | 0.31 ms | 0.40 ms | 1.56 | 1.11 to 1.71 |
| 10,000 calls of an async function | 0.61 ms | 0.99 ms | 1.22 ms | 1.99 | 1.84 to 2.80 |
| A chain of 10,000 `then` calls | 0.19 ms | 0.19 ms | 0.33 ms | 1.77 | 1.66 to 2.07 |
| 1,000 tasks with 10 awaits each | 0.39 ms | 0.49 ms | 0.68 ms | 1.75 | 1.69 to 1.92 |
| 1,000 request handlers in 1,000 contexts | 0.31 ms | 0.41 ms | 0.60 ms | 1.90 | 1.83 to 1.99 |
| 100,000 reads with `get()`, 5 contexts deep | 0.105 ms | 0.105 ms | 0.39 ms | 3.74 | 3.66 to 3.76 |

The scenarios do no other work, so the factors are the largest possible factors. In an application, the network, the rendering and the other work of each operation take much more time.

## Analysis

- **The transform.** A transformed async function is a generator that `coroutine` operates. This costs approximately 0.6 times the time of a native async function call. The number of microtask steps of each `await` does not change.
- **The `then` patch.** Each `then` call makes two small wrappers. The cost is approximately 0.8 times the time of a native `then` call.
- **`get()`.** One read takes approximately 4 ns. The plain case reads one field, so the factor is large, but the absolute time is small.

## Changes that the measurements caused

The first version of the frames used one `WeakMap` for each variable. The garbage collector processed the many `WeakMap` entries slowly, and the request handler scenario had a factor of 3.5. Private fields of the frames, with a cache of the last search, replaced the `WeakMap`. A comparison in one process showed that the new storage is 17 times faster. The factor of the request handler scenario became 1.84.
