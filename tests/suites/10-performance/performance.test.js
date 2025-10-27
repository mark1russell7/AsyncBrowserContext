/**
 * Performance & Memory Tests (Suite 10)
 *
 * Tests performance characteristics and memory behavior:
 * - Overhead measurement
 * - Throughput testing
 * - Memory leak detection
 * - Sustained load testing
 */

import { describe, it, expect } from '../../framework/test-runner.js';
import { AsyncVariable } from '../../../dist/context.js';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

describe('Performance - Overhead Measurement', () => {
  it('should have minimal overhead for context operations', async () => {
    const ctx = new AsyncVariable();
    const iterations = 1000;

    // Baseline: operations without context
    const baselineStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      await delay(0);
    }
    const baselineTime = performance.now() - baselineStart;

    // With context
    const contextStart = performance.now();
    await ctx.run('perf-test', async () => {
      for (let i = 0; i < iterations; i++) {
        ctx.get();
        await delay(0);
      }
    });
    const contextTime = performance.now() - contextStart;

    const overhead = contextTime - baselineTime;
    const overheadPerOp = overhead / iterations;

    // Overhead should be minimal (less than 5ms per operation on average)
    // Note: Babel transformation adds overhead but ensures correctness
    expect(overheadPerOp).toBeLessThan(5);
    console.log(`Overhead: ${overhead.toFixed(2)}ms for ${iterations} operations (${overheadPerOp.toFixed(4)}ms per op)`);
  }, { timeout: 30000 });

  it('should have constant-time context lookup', async () => {
    const ctx = new AsyncVariable();
    const measurements = [];

    // Measure get() performance at different nesting depths
    async function measureAtDepth(depth) {
      if (depth === 0) {
        const iterations = 10000;
        const start = performance.now();
        for (let i = 0; i < iterations; i++) {
          ctx.get();
        }
        const elapsed = performance.now() - start;
        return elapsed / iterations;
      }

      return await ctx.run(`level-${depth}`, async () => {
        return await measureAtDepth(depth - 1);
      });
    }

    // Measure at depths 1, 5, and 10
    measurements.push(await measureAtDepth(1));
    measurements.push(await measureAtDepth(5));
    measurements.push(await measureAtDepth(10));

    // Performance should be roughly constant regardless of depth
    const avgTime = measurements.reduce((a, b) => a + b, 0) / measurements.length;
    const variance = measurements.map(t => Math.abs(t - avgTime) / avgTime);

    // Variance should be less than 50% (allowing for JIT warmup and GC)
    expect(Math.max(...variance)).toBeLessThan(0.5);
    console.log(`Lookup times: ${measurements.map(t => t.toFixed(6)).join('ms, ')}ms`);
  });
});

describe('Performance - Throughput Testing', () => {
  it('should handle high throughput concurrent operations', async () => {
    const ctx = new AsyncVariable();
    const duration = 2000; // 2 seconds
    const concurrency = 100;
    let operationsCompleted = 0;

    const startTime = Date.now();

    async function worker(id) {
      while (Date.now() - startTime < duration) {
        await ctx.run(`worker-${id}`, async () => {
          await delay(1);
          const value = ctx.get();
          expect(value).toBe(`worker-${id}`);
          operationsCompleted++;
        });
      }
    }

    const workers = Array.from({ length: concurrency }, (_, i) => worker(i));
    await Promise.all(workers);

    const opsPerSecond = operationsCompleted / (duration / 1000);

    // Should achieve reasonable throughput (at least 1000 ops/sec)
    expect(opsPerSecond).toBeGreaterThan(1000);
    console.log(`Throughput: ${opsPerSecond.toFixed(0)} ops/sec (${operationsCompleted} total ops)`);
  }, { timeout: 10000 });

  it('should maintain performance under sustained load', async () => {
    const ctx = new AsyncVariable();
    const batches = 5;
    const batchSize = 100;
    const throughputs = [];

    for (let batch = 0; batch < batches; batch++) {
      const startTime = performance.now();

      const operations = Array.from({ length: batchSize }, (_, i) =>
        ctx.run(`batch-${batch}-op-${i}`, async () => {
          await delay(Math.random() * 5);
          return ctx.get();
        })
      );

      await Promise.all(operations);

      const elapsed = performance.now() - startTime;
      const throughput = batchSize / (elapsed / 1000);
      throughputs.push(throughput);
    }

    // Throughput should remain relatively stable across batches
    const avgThroughput = throughputs.reduce((a, b) => a + b, 0) / throughputs.length;
    const variance = throughputs.map(t => Math.abs(t - avgThroughput) / avgThroughput);

    // Variance should be less than 30%
    expect(Math.max(...variance)).toBeLessThan(0.3);
    console.log(`Throughput stability: ${throughputs.map(t => t.toFixed(0)).join(', ')} ops/sec`);
  }, { timeout: 15000 });
});

describe('Performance - Memory Behavior', () => {
  it('should not leak memory during many sequential operations', async () => {
    const ctx = new AsyncVariable();
    const iterations = 500;

    // Force GC if available (Chrome with --expose-gc flag)
    const gcFunction = typeof window !== 'undefined' ? window.gc : (typeof global !== 'undefined' ? global.gc : undefined);
    if (gcFunction) {
      gcFunction();
      await delay(100);
    }

    const memBefore = performance.memory ? performance.memory.usedJSHeapSize : 0;

    for (let i = 0; i < iterations; i++) {
      await ctx.run(`op-${i}`, async () => {
        await delay(1);
        const value = ctx.get();
        expect(value).toBe(`op-${i}`);
      });
    }

    // Force GC if available
    if (gcFunction) {
      gcFunction();
      await delay(100);
    }

    const memAfter = performance.memory ? performance.memory.usedJSHeapSize : 0;
    const memGrowth = memAfter - memBefore;
    const memPerOp = memGrowth / iterations;

    console.log(`Memory growth: ${(memGrowth / 1024 / 1024).toFixed(2)}MB for ${iterations} operations`);
    console.log(`Per operation: ${(memPerOp / 1024).toFixed(2)}KB`);

    // Memory growth should be minimal (less than 10KB per operation)
    // Note: This is a soft check as browser memory behavior varies
    if (performance.memory) {
      expect(memPerOp).toBeLessThan(10 * 1024);
    }
  }, { timeout: 30000 });

  it('should cleanup contexts after completion', async () => {
    const ctx = new AsyncVariable();
    const iterations = 1000;

    // Track internal state if exposed (for debugging)
    let initialSize = 0;
    let maxSize = 0;

    for (let i = 0; i < iterations; i++) {
      await ctx.run(`cleanup-test-${i}`, async () => {
        await delay(1);
        ctx.get();
      });

      // If we can inspect internal state, verify cleanup
      // This is implementation-specific
      if (ctx._contexts) {
        const currentSize = ctx._contexts.size || 0;
        if (i === 0) initialSize = currentSize;
        maxSize = Math.max(maxSize, currentSize);
      }
    }

    // After all operations complete, internal state should be cleaned up
    // The exact assertion depends on implementation details
    console.log(`Context map sizes - initial: ${initialSize}, max: ${maxSize}`);

    // If we have access to internal state, verify it's bounded
    if (ctx._contexts) {
      expect(maxSize).toBeLessThan(iterations);
    }

    // Basic validation that the system still works
    await ctx.run('final-check', async () => {
      expect(ctx.get()).toBe('final-check');
    });
  }, { timeout: 30000 });

  it('should handle memory pressure gracefully', async () => {
    const ctx = new AsyncVariable();
    const iterations = 100;
    const largeObjectSize = 1000;

    // Create operations that allocate memory
    async function memoryIntensiveOperation(id) {
      return await ctx.run(`mem-op-${id}`, async () => {
        // Allocate some memory
        const data = new Array(largeObjectSize).fill(Math.random());
        await delay(5);
        const value = ctx.get();
        expect(value).toBe(`mem-op-${id}`);
        return data.length;
      });
    }

    const operations = [];
    for (let i = 0; i < iterations; i++) {
      operations.push(memoryIntensiveOperation(i));
    }

    const results = await Promise.all(operations);

    // All operations should complete successfully
    expect(results.length).toBe(iterations);
    expect(results.every(r => r === largeObjectSize)).toBeTruthy();
  }, { timeout: 30000 });
});

describe('Performance - Stress Testing', () => {
  it('should handle extreme concurrency (1000+ simultaneous operations)', async () => {
    const ctx = new AsyncVariable();
    const concurrency = 1000;

    const startTime = performance.now();

    const operations = Array.from({ length: concurrency }, (_, i) =>
      ctx.run(`stress-${i}`, async () => {
        await delay(Math.random() * 10);
        return ctx.get();
      })
    );

    const results = await Promise.all(operations);
    const elapsed = performance.now() - startTime;

    // Verify correctness
    expect(results.length).toBe(concurrency);
    let failures = 0;
    results.forEach((val, i) => {
      if (val !== `stress-${i}`) failures++;
    });
    expect(failures).toBe(0);

    console.log(`${concurrency} concurrent operations completed in ${elapsed.toFixed(0)}ms`);
  }, { timeout: 30000 });

  it('should handle rapid context switching', async () => {
    const ctx = new AsyncVariable();
    const switches = 10000;
    let currentValue = null;

    const startTime = performance.now();

    // Rapidly switch between contexts
    for (let i = 0; i < switches; i++) {
      currentValue = ctx.run(`ctx-${i}`, () => {
        return ctx.get();
      });
      expect(currentValue).toBe(`ctx-${i}`);
    }

    const elapsed = performance.now() - startTime;
    const switchesPerMs = switches / elapsed;

    console.log(`${switches} context switches in ${elapsed.toFixed(2)}ms (${switchesPerMs.toFixed(2)} switches/ms)`);

    // Should handle rapid switching efficiently
    expect(elapsed).toBeLessThan(5000); // Less than 5 seconds for 10k switches
  }, { timeout: 10000 });

  it('should handle deeply nested stress test', async () => {
    const ctx = new AsyncVariable();
    const depth = 100;
    const parallelOps = 10;

    async function deepNesting(level) {
      if (level >= depth) return level;

      return await ctx.run(`level-${level}`, async () => {
        expect(ctx.get()).toBe(`level-${level}`);

        // Create parallel operations at each level
        const parallel = Array.from({ length: parallelOps }, async (_, i) => {
          await delay(1);
          expect(ctx.get()).toBe(`level-${level}`);
        });

        await Promise.all(parallel);
        return await deepNesting(level + 1);
      });
    }

    const startTime = performance.now();
    const finalDepth = await deepNesting(0);
    const elapsed = performance.now() - startTime;

    expect(finalDepth).toBe(depth);
    console.log(`Deep nesting (${depth} levels, ${parallelOps} parallel ops/level) completed in ${elapsed.toFixed(0)}ms`);
  }, { timeout: 30000 });
});
