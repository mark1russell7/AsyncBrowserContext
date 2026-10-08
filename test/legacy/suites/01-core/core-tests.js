/**
 * Core Functionality Tests (Suite 01)
 *
 * Tests the fundamental features of AsyncBrowserContext:
 * - Concurrent isolation
 * - Nested contexts
 * - Timer propagation
 * - Promise.then chains
 * - Multiple variables
 * - Bug regression tests
 */

import { describe, it, expect, beforeEach } from '../../framework/test-runner.js';
import { AsyncVariable } from '../../../dist/context.js';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

describe('Core Functionality', () => {
  let ctx;

  beforeEach(() => {
    ctx = new AsyncVariable();
  });

  it('should maintain context through concurrent async operations', async () => {
    async function worker(id) {
      await delay(Math.random() * 10);
      const after1 = ctx.get();
      expect(after1).toBe(id);

      await delay(Math.random() * 10);
      const after2 = ctx.get();
      expect(after2).toBe(id);

      await delay(Math.random() * 10);
      const after3 = ctx.get();
      expect(after3).toBe(id);

      return true;
    }

    const results = await Promise.all([
      ctx.run('A', () => worker('A')),
      ctx.run('B', () => worker('B')),
      ctx.run('C', () => worker('C')),
    ]);

    expect(results.every(r => r === true)).toBeTruthy();
  });

  it('should handle nested contexts correctly', async () => {
    const result = await ctx.run('outer', async () => {
      const outer1 = ctx.get();
      expect(outer1).toBe('outer');

      const inner = await ctx.run('inner', async () => {
        await delay(5);
        const val = ctx.get();
        expect(val).toBe('inner');
        return val;
      });

      await delay(5);
      const outer2 = ctx.get();
      expect(outer2).toBe('outer');
      expect(inner).toBe('inner');

      return true;
    });

    expect(result).toBeTruthy();
  });

  it('should propagate context through setTimeout', async () => {
    const result = await ctx.run('timer-test', () => {
      return new Promise(resolve => {
        setTimeout(() => {
          const val = ctx.get();
          expect(val).toBe('timer-test');
          resolve(true);
        }, 10);
      });
    });

    expect(result).toBeTruthy();
  });

  it('should propagate context through Promise.then chains', async () => {
    const result = await ctx.run('promise-test', () => {
      return Promise.resolve(42)
        .then(n => {
          const val = ctx.get();
          expect(val).toBe('promise-test');
          expect(n).toBe(42);
          return val === 'promise-test';
        });
    });

    expect(result).toBeTruthy();
  });

  it('should support multiple AsyncVariable instances', async () => {
    const var1 = new AsyncVariable();
    const var2 = new AsyncVariable();

    const result = await var1.run('value1', async () => {
      return await var2.run('value2', async () => {
        await delay(5);
        const v1 = var1.get();
        const v2 = var2.get();

        expect(v1).toBe('value1');
        expect(v2).toBe('value2');

        return true;
      });
    });

    expect(result).toBeTruthy();
  });

  it('should handle nested context inside .then() callback (bug regression)', async () => {
    const v = new AsyncVariable({ defaultValue: 0 });
    let allPassed = true;

    await v.run(1, async () => {
      expect(v.get()).toBe(1);

      await Promise.resolve().then(async () => {
        expect(v.get()).toBe(1);

        // This is the exact scenario that was failing before the fix
        await v.run(2, async () => {
          expect(v.get()).toBe(2);

          await Promise.resolve();
          expect(v.get()).toBe(2);
        });

        expect(v.get()).toBe(1);
      });

      expect(v.get()).toBe(1);
    });
  });

  it('should prioritize currentSyncContext over currentActivePromise', async () => {
    const var1 = new AsyncVariable({ name: 'var1' });

    await var1.run('OUTER', async () => {
      expect(var1.get()).toBe('OUTER');

      await var1.run('INNER', async () => {
        expect(var1.get()).toBe('INNER');

        // Create new async operation - should capture INNER context
        const captured = await new Promise(resolve => {
          setTimeout(() => {
            const val = var1.get();
            expect(val).toBe('INNER');
            resolve(val);
          }, 10);
        });

        await Promise.resolve();
        expect(var1.get()).toBe('INNER');
        expect(captured).toBe('INNER');
      });

      expect(var1.get()).toBe('OUTER');
    });
  });

  it('should validate that await bypasses .then() (architecture test)', async () => {
    const p = Promise.resolve(42);
    let thenCalled = false;

    const originalThen = p.then;
    p.then = function(...args) {
      thenCalled = true;
      return originalThen.apply(this, args);
    };

    const result = await p;

    expect(thenCalled).toBeFalsy(); // Modern browsers don't call .then() for await
    expect(result).toBe(42);
  });
});
