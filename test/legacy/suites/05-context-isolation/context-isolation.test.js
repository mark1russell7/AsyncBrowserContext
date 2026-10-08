/**
 * Context Isolation Tests (Suite 05)
 *
 * Tests context cloning and isolation:
 * - Mutation isolation
 * - Clone independence
 * - Stress testing (10, 100, 1000 concurrent operations)
 */

import { describe, it, expect } from '../../framework/test-runner.js';
import { AsyncVariable } from '../../../dist/context.js';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

describe('Context Isolation - Mutation Safety', () => {
  it('should prevent context mutations from leaking between operations', async () => {
    const ctx = new AsyncVariable();

    const results = await Promise.all([
      ctx.run('A', async () => {
        await delay(10);
        return ctx.get();
      }),
      ctx.run('B', async () => {
        await delay(5);
        return ctx.get();
      })
    ]);

    expect(results).toEqual(['A', 'B']);
  });

  it('should ensure each .run() gets an independent context clone', async () => {
    const ctx1 = new AsyncVariable();
    const ctx2 = new AsyncVariable();

    const sharedValue = await ctx1.run('shared', async () => {
      return await ctx2.run('inner', async () => {
        expect(ctx1.get()).toBe('shared');
        expect(ctx2.get()).toBe('inner');
        await delay(5);
        expect(ctx1.get()).toBe('shared');
        expect(ctx2.get()).toBe('inner');
        return true;
      });
    });

    expect(sharedValue).toBeTruthy();
  });

  it('should handle rapid sequential context switches', async () => {
    const ctx = new AsyncVariable();
    const results = [];

    for (let i = 0; i < 20; i++) {
      await ctx.run(`ctx-${i}`, async () => {
        await delay(1);
        results.push(ctx.get());
      });
    }

    expect(results.length).toBe(20);
    results.forEach((val, i) => {
      expect(val).toBe(`ctx-${i}`);
    });
  });
});

describe('Context Isolation - Concurrent Operations', () => {
  it('should handle 10 concurrent operations', async () => {
    const ctx = new AsyncVariable();

    const operations = Array.from({ length: 10 }, (_, i) =>
      ctx.run(`op-${i}`, async () => {
        await delay(Math.random() * 20);
        return ctx.get();
      })
    );

    const results = await Promise.all(operations);

    results.forEach((val, i) => {
      expect(val).toBe(`op-${i}`);
    });
  });

  it('should handle 100 concurrent operations', async () => {
    const ctx = new AsyncVariable();

    const operations = Array.from({ length: 100 }, (_, i) =>
      ctx.run(`op-${i}`, async () => {
        await delay(Math.random() * 10);
        return ctx.get();
      })
    );

    const results = await Promise.all(operations);

    expect(results.length).toBe(100);
    const uniqueValues = new Set(results);
    expect(uniqueValues.size).toBe(100); // All unique
  }, { timeout: 10000 });

  it('should handle 1000 concurrent operations (stress test)', async () => {
    const ctx = new AsyncVariable();

    const operations = Array.from({ length: 1000 }, (_, i) =>
      ctx.run(`op-${i}`, async () => {
        // Minimal delay for stress test
        await delay(Math.random() * 2);
        return ctx.get();
      })
    );

    const results = await Promise.all(operations);

    expect(results.length).toBe(1000);

    // Verify all contexts were maintained correctly
    let failures = 0;
    results.forEach((val, i) => {
      if (val !== `op-${i}`) {
        failures++;
      }
    });

    expect(failures).toBe(0);
  }, { timeout: 30000 });
});

describe('Context Isolation - Complex Scenarios', () => {
  it('should isolate contexts in nested concurrent operations', async () => {
    const ctx = new AsyncVariable();

    const outer = await Promise.all([
      ctx.run('outer-A', async () => {
        const inner = await Promise.all([
          ctx.run('inner-A1', async () => {
            await delay(5);
            return ctx.get();
          }),
          ctx.run('inner-A2', async () => {
            await delay(5);
            return ctx.get();
          })
        ]);
        return { outer: ctx.get(), inner };
      }),
      ctx.run('outer-B', async () => {
        const inner = await Promise.all([
          ctx.run('inner-B1', async () => {
            await delay(5);
            return ctx.get();
          }),
          ctx.run('inner-B2', async () => {
            await delay(5);
            return ctx.get();
          })
        ]);
        return { outer: ctx.get(), inner };
      })
    ]);

    expect(outer[0].outer).toBe('outer-A');
    expect(outer[0].inner).toEqual(['inner-A1', 'inner-A2']);
    expect(outer[1].outer).toBe('outer-B');
    expect(outer[1].inner).toEqual(['inner-B1', 'inner-B2']);
  });

  it('should maintain isolation with interleaved async operations', async () => {
    const ctx = new AsyncVariable();
    const timeline = [];

    async function recordedOperation(id, delayMs) {
      return ctx.run(id, async () => {
        timeline.push({ event: 'start', id, ctx: ctx.get() });
        await delay(delayMs);
        timeline.push({ event: 'end', id, ctx: ctx.get() });
        return ctx.get();
      });
    }

    const results = await Promise.all([
      recordedOperation('fast', 5),
      recordedOperation('medium', 10),
      recordedOperation('slow', 15)
    ]);

    expect(results).toEqual(['fast', 'medium', 'slow']);

    // Verify each operation saw its own context at start and end
    const fast = timeline.filter(e => e.id === 'fast');
    expect(fast.every(e => e.ctx === 'fast')).toBeTruthy();

    const medium = timeline.filter(e => e.id === 'medium');
    expect(medium.every(e => e.ctx === 'medium')).toBeTruthy();

    const slow = timeline.filter(e => e.id === 'slow');
    expect(slow.every(e => e.ctx === 'slow')).toBeTruthy();
  });
});
