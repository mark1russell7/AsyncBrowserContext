# Performance

This document gives the benchmark results of `async-browser-context` and tells how to measure them again.

## Measure the performance

1. Stop the other programs that use the CPU.
2. Start the benchmarks:

   ```sh
   pnpm bench
   ```

The command builds the library and starts one Node.js process for each case. Each process measures the scenarios with tinybench. The results go to `bench/results/latest.json`.

## Cases

| Case | Description |
| --- | --- |
| Plain | Plain JavaScript without the library. A `Variable` class without propagation gives the same API. |
| Transform only | The Babel preset with the plain `coroutine` of the Node.js runtime. This case shows the cost of the transform without the cost of the context. |
| Library | The Babel preset and the browser runtime. |

## Results

Node.js 25.2.1 on Windows 11. The values are the mean time of one operation of each scenario.

| Scenario | Plain | Transform only | Library | Library / plain |
| --- | --- | --- | --- | --- |
| 10,000 awaits in one async function | 0.32 ms | 0.36 ms | 0.46 ms | 1.46 |
| 10,000 calls of an async function | 0.70 ms | 1.14 ms | 1.36 ms | 1.95 |
| A chain of 10,000 `then` calls | 0.23 ms | 0.23 ms | 0.40 ms | 1.78 |
| 1,000 tasks with 10 awaits each | 0.47 ms | 0.59 ms | 0.86 ms | 1.85 |
| 1,000 request handlers in 1,000 contexts | 0.40 ms | 0.53 ms | 0.74 ms | 1.84 |
| 100,000 reads with `get()`, 5 contexts deep | 0.13 ms | 0.12 ms | 0.46 ms | 3.59 |

The scenarios do no other work, so the factors are the largest possible factors. In an application, the network, the rendering and the other work of each operation take much more time.

## Analysis

- **The transform.** A transformed async function is a generator that `coroutine` operates. This costs approximately 0.6 times the time of a native async function call. The number of microtask steps of each `await` does not change.
- **The `then` patch.** Each `then` call makes two small wrappers. The cost is approximately 0.8 times the time of a native `then` call.
- **`get()`.** One read takes approximately 5 ns. The plain case reads one field, so the factor is large, but the absolute time is small.

## Changes that the measurements caused

The first version of the frames used one `WeakMap` for each variable. The garbage collector processed the many `WeakMap` entries slowly, and the request handler scenario had a factor of 3.5. Private fields of the frames, with a cache of the last search, replaced the `WeakMap`. A comparison in one process showed that the new storage is 17 times faster. The factor of the request handler scenario became 1.84.
