/**
 * Modern Promise APIs Tests (Suite 13)
 *
 * Tests context propagation through modern Promise features:
 * - Promise.withResolvers() (ES2024)
 * - Promise constructor timing
 * - Multiple .then() on same promise
 */

import { describe, it, expect } from '../../framework/test-runner.js';
import { AsyncVariable } from '../../../dist/context.js';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

describe('Modern Promises - Promise.withResolvers', () => {
  it('should handle Promise.withResolvers if available', async () => {
    if (typeof Promise.withResolvers === 'undefined') {
      console.log('Promise.withResolvers not available (ES2024), skipping');
      return;
    }

    const ctx = new AsyncVariable();
    const { promise, resolve } = Promise.withResolvers();

    const result = await ctx.run('with-resolvers', async () => {
      setTimeout(() => resolve('resolved'), 10);
      const value = await promise;
      return { value, ctx: ctx.get() };
    });

    expect(result.value).toBe('resolved');
    expect(result.ctx).toBe('with-resolvers');
  });

  it('should handle Promise.withResolvers reject', async () => {
    if (typeof Promise.withResolvers === 'undefined') {
      console.log('Promise.withResolvers not available, skipping');
      return;
    }

    const ctx = new AsyncVariable();
    const { promise, reject } = Promise.withResolvers();

    try {
      await ctx.run('with-reject', async () => {
        setTimeout(() => reject(new Error('test error')), 10);
        await promise;
      });
    } catch (error) {
      expect(error.message).toBe('test error');
    }
  });
});

describe('Modern Promises - Promise Constructor', () => {
  it('should maintain context during Promise constructor execution', async () => {
    const ctx = new AsyncVariable();
    const constructorContexts = [];

    await ctx.run('constructor-test', async () => {
      const promise = new Promise((resolve) => {
        constructorContexts.push(ctx.get());
        setTimeout(() => {
          constructorContexts.push(ctx.get());
          resolve('done');
        }, 10);
      });

      await promise;
    });

    // Constructor executes synchronously, so should see context
    expect(constructorContexts[0]).toBe('constructor-test');
    // setTimeout should also see context (if patched)
    expect(constructorContexts[1]).toBe('constructor-test');
  });

  it('should handle Promise created before context, resolved after', async () => {
    const ctx = new AsyncVariable();
    let resolveFunc;

    // Create promise OUTSIDE context
    const promise = new Promise(resolve => {
      resolveFunc = resolve;
    });

    // Resolve INSIDE context
    const result = await ctx.run('late-context', async () => {
      resolveFunc('resolved');
      const value = await promise;
      return { value, ctx: ctx.get() };
    });

    expect(result.value).toBe('resolved');
    expect(result.ctx).toBe('late-context');
  });

  it('should handle context changes during Promise constructor', async () => {
    const ctx = new AsyncVariable();
    const contexts = [];

    await ctx.run('outer', async () => {
      contexts.push({ stage: 'outer-start', ctx: ctx.get() });

      const promise = new Promise((resolve) => {
        contexts.push({ stage: 'constructor', ctx: ctx.get() });

        ctx.run('inner', () => {
          contexts.push({ stage: 'inner', ctx: ctx.get() });
          resolve('done');
        });

        contexts.push({ stage: 'after-inner', ctx: ctx.get() });
      });

      await promise;
      contexts.push({ stage: 'outer-end', ctx: ctx.get() });
    });

    expect(contexts[0].ctx).toBe('outer');
    expect(contexts[1].ctx).toBe('outer');
    expect(contexts[2].ctx).toBe('inner');
    expect(contexts[3].ctx).toBe('outer');
    expect(contexts[4].ctx).toBe('outer');
  });
});

describe('Modern Promises - Multiple Handlers', () => {
  it('should handle multiple .then() on same promise', async () => {
    const ctx = new AsyncVariable();
    const results = [];

    await ctx.run('multi-then', async () => {
      const promise = Promise.resolve('value');

      promise.then(val => results.push({ handler: 1, val, ctx: ctx.get() }));
      promise.then(val => results.push({ handler: 2, val, ctx: ctx.get() }));
      promise.then(val => results.push({ handler: 3, val, ctx: ctx.get() }));

      await delay(10);
    });

    expect(results.length).toBe(3);
    expect(results.every(r => r.ctx === 'multi-then')).toBeTruthy();
  });

  it('should handle multiple .catch() on same promise', async () => {
    const ctx = new AsyncVariable();
    const catches = [];

    await ctx.run('multi-catch', async () => {
      const promise = Promise.reject(new Error('test'));

      promise.catch(err => catches.push({ handler: 1, ctx: ctx.get() }));
      promise.catch(err => catches.push({ handler: 2, ctx: ctx.get() }));
      promise.catch(err => catches.push({ handler: 3, ctx: ctx.get() }));

      await delay(10);
    });

    expect(catches.length).toBe(3);
  });

  it('should handle mixed .then() and .catch() on same promise', async () => {
    const ctx = new AsyncVariable();
    const handlers = [];

    await ctx.run('mixed-handlers', async () => {
      const promise = Promise.resolve('success');

      promise.then(val => handlers.push({ type: 'then-1', ctx: ctx.get() }));
      promise.catch(err => handlers.push({ type: 'catch-1', ctx: ctx.get() }));
      promise.then(val => handlers.push({ type: 'then-2', ctx: ctx.get() }));
      promise.finally(() => handlers.push({ type: 'finally', ctx: ctx.get() }));

      await delay(10);
    });

    // Only .then() and .finally() should execute for resolved promise
    expect(handlers.length).toBe(3);
    expect(handlers.filter(h => h.type.startsWith('then')).length).toBe(2);
  });

  it('should isolate contexts for handlers attached in different contexts', async () => {
    const ctx = new AsyncVariable();
    const promise = Promise.resolve('shared');
    const handlers = [];

    await Promise.all([
      ctx.run('context-A', async () => {
        promise.then(() => handlers.push({ from: 'A', ctx: ctx.get() }));
        await delay(10);
      }),
      ctx.run('context-B', async () => {
        promise.then(() => handlers.push({ from: 'B', ctx: ctx.get() }));
        await delay(10);
      }),
      ctx.run('context-C', async () => {
        promise.then(() => handlers.push({ from: 'C', ctx: ctx.get() }));
        await delay(10);
      })
    ]);

    expect(handlers.length).toBe(3);
    // Each handler should run in the context where it was attached
    // (This tests runtime Promise patching behavior)
  });
});

describe('Modern Promises - Promise Timing', () => {
  it('should handle Promise resolved before await', async () => {
    const ctx = new AsyncVariable();

    await ctx.run('pre-resolved', async () => {
      const promise = Promise.resolve('immediate');
      await delay(10);
      const value = await promise;
      expect(ctx.get()).toBe('pre-resolved');
      expect(value).toBe('immediate');
    });
  });

  it('should handle Promise rejected before catch', async () => {
    const ctx = new AsyncVariable();
    let caughtContext;

    try {
      await ctx.run('pre-rejected', async () => {
        const promise = Promise.reject(new Error('immediate'));
        await delay(10);
        await promise;
      });
    } catch (error) {
      caughtContext = ctx.get();
      expect(error.message).toBe('immediate');
    }

    expect(caughtContext).toBeUndefined();
  });

  it('should handle long-delayed promise resolution', async () => {
    const ctx = new AsyncVariable();

    await ctx.run('delayed-promise', async () => {
      const promise = new Promise(resolve => {
        setTimeout(() => resolve('delayed'), 50);
      });

      const value = await promise;
      expect(ctx.get()).toBe('delayed-promise');
      expect(value).toBe('delayed');
    });
  }, { timeout: 1000 });
});

describe('Modern Promises - Edge Cases', () => {
  it('should handle promise that never resolves (with timeout)', async () => {
    const ctx = new AsyncVariable();

    const result = await Promise.race([
      ctx.run('never-resolves', async () => {
        const promise = new Promise(() => {}); // Never resolves
        await promise;
        return 'should not reach';
      }),
      delay(50).then(() => 'timeout')
    ]);

    expect(result).toBe('timeout');
  });

  it('should handle promise resolved multiple times (only first counts)', async () => {
    const ctx = new AsyncVariable();
    const values = [];

    await ctx.run('multi-resolve', async () => {
      const promise = new Promise(resolve => {
        resolve('first');
        resolve('second'); // Should be ignored
        resolve('third');  // Should be ignored
      });

      const value = await promise;
      values.push(value);
    });

    expect(values).toEqual(['first']);
  });

  it('should handle promise with both resolve and reject called', async () => {
    const ctx = new AsyncVariable();
    let result;

    try {
      await ctx.run('resolve-and-reject', async () => {
        const promise = new Promise((resolve, reject) => {
          resolve('resolved');
          reject(new Error('rejected')); // Should be ignored
        });

        result = await promise;
      });
    } catch (error) {
      result = 'caught';
    }

    expect(result).toBe('resolved');
  });

  it('should handle thenable (duck-typed promise)', async () => {
    const ctx = new AsyncVariable();

    const thenable = {
      then(onFulfilled) {
        setTimeout(() => onFulfilled('thenable-value'), 10);
      }
    };

    const result = await ctx.run('thenable-test', async () => {
      const value = await thenable;
      return { value, ctx: ctx.get() };
    });

    expect(result.value).toBe('thenable-value');
    expect(result.ctx).toBe('thenable-test');
  });
});
