/**
 * Extreme Concurrency Edge Cases Tests (Suite 16)
 *
 * Tests extreme concurrency scenarios:
 * - Massive parallel operations
 * - Rapid context switching
 * - Race conditions
 * - Resource contention
 */

import { describe, it, expect } from '../../framework/test-runner.js';
import { AsyncVariable } from '../../../dist/context.js';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

describe('Extreme Concurrency - Massive Parallelism', () => {
  it('should handle 5000 concurrent operations', async () => {
    const ctx = new AsyncVariable();
    const count = 5000;

    const operations = Array.from({ length: count }, (_, i) =>
      ctx.run(`op-${i}`, async () => {
        await delay(Math.random() * 5);
        return ctx.get();
      })
    );

    const results = await Promise.all(operations);

    expect(results.length).toBe(count);
    let failures = 0;
    results.forEach((val, i) => {
      if (val !== `op-${i}`) failures++;
    });

    expect(failures).toBe(0);
  }, { timeout: 30000 });

  it('should handle 10000 operations with varying delays', async () => {
    const ctx = new AsyncVariable();
    const count = 10000;
    const operations = [];

    for (let i = 0; i < count; i++) {
      const delayTime = (i % 10) * 2; // 0, 2, 4, ... 18ms
      operations.push(
        ctx.run(`var-${i}`, async () => {
          if (delayTime > 0) await delay(delayTime);
          return ctx.get();
        })
      );
    }

    const results = await Promise.all(operations);
    expect(results.length).toBe(count);

    let failures = 0;
    results.forEach((val, i) => {
      if (val !== `var-${i}`) failures++;
    });

    expect(failures).toBe(0);
  }, { timeout: 60000 });

  it('should handle deeply nested concurrent operations', async () => {
    const ctx = new AsyncVariable();

    async function recurse(depth, id) {
      if (depth === 0) return ctx.get();

      return await ctx.run(`${id}-${depth}`, async () => {
        const results = await Promise.all([
          recurse(depth - 1, `${id}-a`),
          recurse(depth - 1, `${id}-b`)
        ]);

        expect(ctx.get()).toBe(`${id}-${depth}`);
        return results;
      });
    }

    const result = await ctx.run('root', async () => {
      await recurse(6, 'r'); // Creates 2^6 = 64 contexts
      return ctx.get();
    });

    expect(result).toBe('root');
  }, { timeout: 30000 });
});

describe('Extreme Concurrency - Rapid Context Switching', () => {
  it('should handle 10000 rapid synchronous context switches', () => {
    const ctx = new AsyncVariable();
    const results = [];

    for (let i = 0; i < 10000; i++) {
      ctx.run(`sync-${i}`, () => {
        results.push(ctx.get());
      });
    }

    expect(results.length).toBe(10000);
    results.forEach((val, i) => {
      expect(val).toBe(`sync-${i}`);
    });
  });

  it('should handle rapid async context switches', async () => {
    const ctx = new AsyncVariable();
    const results = [];

    // Create 1000 operations that switch contexts rapidly
    for (let i = 0; i < 1000; i++) {
      ctx.run(`rapid-${i}`, async () => {
        results.push({ before: ctx.get() });
        await delay(0); // Immediate microtask
        results.push({ after: ctx.get() });
      });
    }

    await delay(100); // Wait for all to complete

    expect(results.length).toBe(2000);
  }, { timeout: 5000 });

  it('should handle alternating contexts at high frequency', async () => {
    const ctx1 = new AsyncVariable();
    const ctx2 = new AsyncVariable();
    const results = [];

    const operations = [];
    for (let i = 0; i < 500; i++) {
      operations.push(
        ctx1.run(`ctx1-${i}`, async () => {
          results.push({ ctx: 1, val: ctx1.get() });
          await delay(0);
        })
      );
      operations.push(
        ctx2.run(`ctx2-${i}`, async () => {
          results.push({ ctx: 2, val: ctx2.get() });
          await delay(0);
        })
      );
    }

    await Promise.all(operations);
    expect(results.length).toBe(1000);
  }, { timeout: 5000 });
});

describe('Extreme Concurrency - Race Conditions', () => {
  it('should not have race conditions in context isolation', async () => {
    const ctx = new AsyncVariable();
    const sharedState = { counter: 0 };

    // Create operations that all try to access/modify shared state
    const operations = Array.from({ length: 1000 }, (_, i) =>
      ctx.run(`race-${i}`, async () => {
        const id = ctx.get();
        sharedState.counter++;
        await delay(Math.random() * 2);

        // Context should remain stable
        expect(ctx.get()).toBe(id);

        return ctx.get();
      })
    );

    const results = await Promise.all(operations);

    // All contexts should be preserved
    expect(results.length).toBe(1000);
    results.forEach((val, i) => {
      expect(val).toBe(`race-${i}`);
    });

    // All modifications should have occurred
    expect(sharedState.counter).toBe(1000);
  }, { timeout: 30000 });

  it('should handle race between context set and get', async () => {
    const ctx = new AsyncVariable();
    const results = [];

    await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        ctx.run(`race-get-${i}`, async () => {
          // Rapid gets
          for (let j = 0; j < 10; j++) {
            results.push(ctx.get());
          }
          await delay(1);
        })
      )
    );

    // All gets should have returned the correct context
    expect(results.every((val, i) => val === `race-get-${Math.floor(i / 10)}`)).toBeTruthy();
  });

  it('should handle race in Promise.race with contexts', async () => {
    const ctx = new AsyncVariable();
    const iterations = 100;
    const failures = [];

    for (let i = 0; i < iterations; i++) {
      const winner = await Promise.race([
        ctx.run(`race-a-${i}`, async () => {
          await delay(Math.random() * 10);
          return { winner: 'a', ctx: ctx.get() };
        }),
        ctx.run(`race-b-${i}`, async () => {
          await delay(Math.random() * 10);
          return { winner: 'b', ctx: ctx.get() };
        }),
        ctx.run(`race-c-${i}`, async () => {
          await delay(Math.random() * 10);
          return { winner: 'c', ctx: ctx.get() };
        })
      ]);

      const expectedCtx = `race-${winner.winner}-${i}`;
      if (winner.ctx !== expectedCtx) {
        failures.push({ iteration: i, expected: expectedCtx, got: winner.ctx });
      }
    }

    expect(failures.length).toBe(0);
  }, { timeout: 30000 });
});

describe('Extreme Concurrency - Resource Contention', () => {
  it('should handle all operations competing for completion', async () => {
    const ctx = new AsyncVariable();
    const startTime = Date.now();
    const completionTimes = [];

    const operations = Array.from({ length: 1000 }, (_, i) =>
      ctx.run(`compete-${i}`, async () => {
        await delay(Math.random() * 50);
        completionTimes.push({
          id: i,
          time: Date.now() - startTime,
          ctx: ctx.get()
        });
        return ctx.get();
      })
    );

    const results = await Promise.all(operations);

    expect(results.length).toBe(1000);
    expect(completionTimes.length).toBe(1000);

    // Verify all contexts were maintained
    completionTimes.forEach((record, i) => {
      expect(record.ctx).toBe(`compete-${record.id}`);
    });
  }, { timeout: 30000 });

  it('should handle wave pattern of operations', async () => {
    const ctx = new AsyncVariable();
    const waves = 10;
    const opsPerWave = 100;
    const results = [];

    for (let wave = 0; wave < waves; wave++) {
      const waveOps = Array.from({ length: opsPerWave }, (_, i) =>
        ctx.run(`wave-${wave}-${i}`, async () => {
          await delay(Math.random() * 10);
          return ctx.get();
        })
      );

      const waveResults = await Promise.all(waveOps);
      results.push(...waveResults);

      // Small delay between waves
      await delay(5);
    }

    expect(results.length).toBe(waves * opsPerWave);
    results.forEach((val, i) => {
      const wave = Math.floor(i / opsPerWave);
      const idx = i % opsPerWave;
      expect(val).toBe(`wave-${wave}-${idx}`);
    });
  }, { timeout: 30000 });
});

describe('Extreme Concurrency - Context Churn', () => {
  it('should handle continuous context creation and destruction', async () => {
    const ctx = new AsyncVariable();
    const duration = 2000; // 2 seconds
    const startTime = Date.now();
    let operationCount = 0;

    while (Date.now() - startTime < duration) {
      await ctx.run(`churn-${operationCount}`, async () => {
        expect(ctx.get()).toBe(`churn-${operationCount}`);
        await delay(1);
      });
      operationCount++;
    }

    console.log(`Completed ${operationCount} operations in ${duration}ms`);
    expect(operationCount).toBeGreaterThan(100);
  }, { timeout: 10000 });

  it('should handle mixed short and long-lived contexts', async () => {
    const ctx = new AsyncVariable();
    const results = [];

    const operations = [];

    // Short-lived contexts (complete quickly)
    for (let i = 0; i < 500; i++) {
      operations.push(
        ctx.run(`short-${i}`, async () => {
          await delay(1);
          results.push({ type: 'short', ctx: ctx.get() });
        })
      );
    }

    // Long-lived contexts (complete slowly)
    for (let i = 0; i < 50; i++) {
      operations.push(
        ctx.run(`long-${i}`, async () => {
          await delay(50);
          results.push({ type: 'long', ctx: ctx.get() });
        })
      );
    }

    await Promise.all(operations);

    expect(results.length).toBe(550);
    const shortResults = results.filter(r => r.type === 'short');
    const longResults = results.filter(r => r.type === 'long');

    expect(shortResults.length).toBe(500);
    expect(longResults.length).toBe(50);
  }, { timeout: 30000 });
});

describe('Extreme Concurrency - Nested Parallelism', () => {
  it('should handle nested Promise.all at multiple levels', async () => {
    const ctx = new AsyncVariable();

    const level3 = (id) => ctx.run(`l3-${id}`, async () => {
      await delay(1);
      return ctx.get();
    });

    const level2 = (id) => ctx.run(`l2-${id}`, async () => {
      const results = await Promise.all([
        level3(`${id}-a`),
        level3(`${id}-b`),
        level3(`${id}-c`)
      ]);
      return { id: ctx.get(), children: results };
    });

    const level1 = (id) => ctx.run(`l1-${id}`, async () => {
      const results = await Promise.all([
        level2(`${id}-a`),
        level2(`${id}-b`)
      ]);
      return { id: ctx.get(), children: results };
    });

    const results = await ctx.run('root', async () => {
      const data = await Promise.all([
        level1('a'),
        level1('b'),
        level1('c')
      ]);
      return { id: ctx.get(), children: data };
    });

    expect(results.id).toBe('root');
    expect(results.children.length).toBe(3);
  }, { timeout: 30000 });

  it('should handle pyramid pattern of concurrency', async () => {
    const ctx = new AsyncVariable();
    let totalOps = 0;

    async function pyramid(levels, id) {
      if (levels === 0) {
        totalOps++;
        return ctx.get();
      }

      return await ctx.run(`${id}-${levels}`, async () => {
        const childCount = levels;
        const children = await Promise.all(
          Array.from({ length: childCount }, (_, i) =>
            pyramid(levels - 1, `${id}-${i}`)
          )
        );

        expect(ctx.get()).toBe(`${id}-${levels}`);
        return children;
      });
    }

    await ctx.run('pyramid-root', async () => {
      await pyramid(5, 'p'); // Creates 1+2+3+4+5+5! contexts
    });

    expect(totalOps).toBeGreaterThan(0);
    console.log(`Pyramid created ${totalOps} leaf operations`);
  }, { timeout: 30000 });
});
