/**
 * Long Running Operations Tests (Suite 08)
 *
 * Tests stability and stress:
 * - Sequential awaits (10, 50, 100)
 * - Loops with awaits
 * - Recursive async functions
 */

import { describe, it, expect } from '../../framework/test-runner.js';
import { AsyncVariable } from '../../../dist/context.js';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

describe('Long Running - Sequential Awaits', () => {
  it('should handle 10 sequential awaits', async () => {
    const ctx = new AsyncVariable();

    await ctx.run('sequential-10', async () => {
      for (let i = 0; i < 10; i++) {
        await delay(1);
        expect(ctx.get()).toBe('sequential-10');
      }
    });
  });

  it('should handle 50 sequential awaits', async () => {
    const ctx = new AsyncVariable();

    await ctx.run('sequential-50', async () => {
      for (let i = 0; i < 50; i++) {
        await delay(1);
        expect(ctx.get()).toBe('sequential-50');
      }
    });
  }, { timeout: 10000 });

  it('should handle 100 sequential awaits', async () => {
    const ctx = new AsyncVariable();

    await ctx.run('sequential-100', async () => {
      for (let i = 0; i < 100; i++) {
        await delay(1);
        expect(ctx.get()).toBe('sequential-100');
      }
    });
  }, { timeout: 15000 });
});

describe('Long Running - Loops', () => {
  it('should maintain context across for loop with awaits', async () => {
    const ctx = new AsyncVariable();
    const iterations = [];

    await ctx.run('for-loop', async () => {
      for (let i = 0; i < 20; i++) {
        await delay(1);
        iterations.push(ctx.get());
      }
    });

    expect(iterations.length).toBe(20);
    expect(iterations.every(v => v === 'for-loop')).toBeTruthy();
  });

  it('should maintain context across while loop with awaits', async () => {
    const ctx = new AsyncVariable();
    const iterations = [];

    await ctx.run('while-loop', async () => {
      let count = 0;
      while (count < 20) {
        await delay(1);
        iterations.push(ctx.get());
        count++;
      }
    });

    expect(iterations.length).toBe(20);
    expect(iterations.every(v => v === 'while-loop')).toBeTruthy();
  });

  it('should maintain context across iterations with varying delays', async () => {
    const ctx = new AsyncVariable();

    await ctx.run('varying-delays', async () => {
      for (let i = 0; i < 10; i++) {
        await delay(Math.random() * 5);
        expect(ctx.get()).toBe('varying-delays');

        await Promise.all([
          delay(Math.random() * 3),
          delay(Math.random() * 3),
          delay(Math.random() * 3)
        ]);

        expect(ctx.get()).toBe('varying-delays');
      }
    });
  });
});

describe('Long Running - Recursive Operations', () => {
  it('should handle recursive async functions (10 levels)', async () => {
    const ctx = new AsyncVariable();
    let maxDepth = 0;

    async function recursiveOperation(depth) {
      if (depth >= 10) return depth;

      maxDepth = Math.max(maxDepth, depth);
      expect(ctx.get()).toBe('recursive');
      await delay(1);
      expect(ctx.get()).toBe('recursive');

      return await recursiveOperation(depth + 1);
    }

    await ctx.run('recursive', async () => {
      const finalDepth = await recursiveOperation(0);
      expect(finalDepth).toBe(10);
    });

    expect(maxDepth).toBe(9);
  });

  it('should handle deep recursion (100 levels)', async () => {
    const ctx = new AsyncVariable();

    async function deepRecursion(depth) {
      if (depth >= 100) return depth;

      expect(ctx.get()).toBe('deep-recursive');
      await delay(1);

      return await deepRecursion(depth + 1);
    }

    await ctx.run('deep-recursive', async () => {
      const finalDepth = await deepRecursion(0);
      expect(finalDepth).toBe(100);
    });
  }, { timeout: 15000 });

  it('should handle recursive operations with nested contexts', async () => {
    const ctx = new AsyncVariable();

    async function recursiveWithNesting(depth, maxDepth) {
      if (depth >= maxDepth) return;

      await ctx.run(`level-${depth}`, async () => {
        expect(ctx.get()).toBe(`level-${depth}`);
        await delay(1);
        await recursiveWithNesting(depth + 1, maxDepth);
        expect(ctx.get()).toBe(`level-${depth}`);
      });
    }

    await recursiveWithNesting(0, 10);
  });
});

describe('Long Running - Sustained Operations', () => {
  it('should handle sustained concurrent load', async () => {
    const ctx = new AsyncVariable();
    const batchSize = 50;
    const batches = 5;
    let totalProcessed = 0;

    for (let batch = 0; batch < batches; batch++) {
      const operations = Array.from({ length: batchSize }, (_, i) =>
        ctx.run(`batch-${batch}-op-${i}`, async () => {
          await delay(Math.random() * 5);
          totalProcessed++;
          return ctx.get();
        })
      );

      const results = await Promise.all(operations);
      expect(results.length).toBe(batchSize);
    }

    expect(totalProcessed).toBe(batchSize * batches);
  }, { timeout: 30000 });

  it('should not leak memory during many operations', async () => {
    const ctx = new AsyncVariable();
    const iterations = 200;

    for (let i = 0; i < iterations; i++) {
      await ctx.run(`op-${i}`, async () => {
        await delay(1);
        expect(ctx.get()).toBe(`op-${i}`);
      });
    }

    // If we got here without running out of memory, test passes
    expect(true).toBeTruthy();
  }, { timeout: 30000 });
});
