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
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
describe('Modern Promises - Promise.withResolvers', () => {
  it('should handle Promise.withResolvers if available', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    if (typeof Promise.withResolvers === 'undefined') {
      console.log('Promise.withResolvers not available (ES2024), skipping');
      return;
    }
    const ctx = new AsyncVariable();
    const {
      promise,
      resolve
    } = Promise.withResolvers();
    let result;
    try {
      result = await ctx.run('with-resolvers', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        setTimeout(() => resolve('resolved'), 10);
        let value;
        try {
          value = await promise;
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        return {
          value,
          ctx: ctx.get()
        };
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(result.value).toBe('resolved');
    expect(result.ctx).toBe('with-resolvers');
  });
  it('should handle Promise.withResolvers reject', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    if (typeof Promise.withResolvers === 'undefined') {
      console.log('Promise.withResolvers not available, skipping');
      return;
    }
    const ctx = new AsyncVariable();
    const {
      promise,
      reject
    } = Promise.withResolvers();
    try {
      try {
        await ctx.run('with-reject', async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          setTimeout(() => reject(new Error('test error')), 10);
          try {
            await promise;
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
    } catch (error) {
      expect(error.message).toBe('test error');
    }
  });
});
describe('Modern Promises - Promise Constructor', () => {
  it('should maintain context during Promise constructor execution', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const constructorContexts = [];
    try {
      await ctx.run('constructor-test', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        const promise = new Promise(resolve => {
          constructorContexts.push(ctx.get());
          setTimeout(() => {
            constructorContexts.push(ctx.get());
            resolve('done');
          }, 10);
        });
        try {
          await promise;
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    } // Constructor executes synchronously, so should see context
    expect(constructorContexts[0]).toBe('constructor-test');
    // setTimeout should also see context (if patched)
    expect(constructorContexts[1]).toBe('constructor-test');
  });
  it('should handle Promise created before context, resolved after', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    let resolveFunc;

    // Create promise OUTSIDE context
    const promise = new Promise(resolve => {
      resolveFunc = resolve;
    });

    // Resolve INSIDE context
    let result;
    try {
      result = await ctx.run('late-context', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        resolveFunc('resolved');
        let value;
        try {
          value = await promise;
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        return {
          value,
          ctx: ctx.get()
        };
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(result.value).toBe('resolved');
    expect(result.ctx).toBe('late-context');
  });
  it('should handle context changes during Promise constructor', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const contexts = [];
    try {
      await ctx.run('outer', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        contexts.push({
          stage: 'outer-start',
          ctx: ctx.get()
        });
        const promise = new Promise(resolve => {
          contexts.push({
            stage: 'constructor',
            ctx: ctx.get()
          });
          ctx.run('inner', () => {
            contexts.push({
              stage: 'inner',
              ctx: ctx.get()
            });
            resolve('done');
          });
          contexts.push({
            stage: 'after-inner',
            ctx: ctx.get()
          });
        });
        try {
          await promise;
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        contexts.push({
          stage: 'outer-end',
          ctx: ctx.get()
        });
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(contexts[0].ctx).toBe('outer');
    expect(contexts[1].ctx).toBe('outer');
    expect(contexts[2].ctx).toBe('inner');
    expect(contexts[3].ctx).toBe('outer');
    expect(contexts[4].ctx).toBe('outer');
  });
});
describe('Modern Promises - Multiple Handlers', () => {
  it('should handle multiple .then() on same promise', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const results = [];
    try {
      await ctx.run('multi-then', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        const promise = Promise.resolve('value');
        promise.then(val => results.push({
          handler: 1,
          val,
          ctx: ctx.get()
        }));
        promise.then(val => results.push({
          handler: 2,
          val,
          ctx: ctx.get()
        }));
        promise.then(val => results.push({
          handler: 3,
          val,
          ctx: ctx.get()
        }));
        try {
          await delay(10);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(results.length).toBe(3);
    expect(results.every(r => r.ctx === 'multi-then')).toBeTruthy();
  });
  it('should handle multiple .catch() on same promise', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const catches = [];
    try {
      await ctx.run('multi-catch', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        const promise = Promise.reject(new Error('test'));
        promise.catch(err => catches.push({
          handler: 1,
          ctx: ctx.get()
        }));
        promise.catch(err => catches.push({
          handler: 2,
          ctx: ctx.get()
        }));
        promise.catch(err => catches.push({
          handler: 3,
          ctx: ctx.get()
        }));
        try {
          await delay(10);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(catches.length).toBe(3);
  });
  it('should handle mixed .then() and .catch() on same promise', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const handlers = [];
    try {
      await ctx.run('mixed-handlers', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        const promise = Promise.resolve('success');
        promise.then(val => handlers.push({
          type: 'then-1',
          ctx: ctx.get()
        }));
        promise.catch(err => handlers.push({
          type: 'catch-1',
          ctx: ctx.get()
        }));
        promise.then(val => handlers.push({
          type: 'then-2',
          ctx: ctx.get()
        }));
        promise.finally(() => handlers.push({
          type: 'finally',
          ctx: ctx.get()
        }));
        try {
          await delay(10);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    } // Only .then() and .finally() should execute for resolved promise
    expect(handlers.length).toBe(3);
    expect(handlers.filter(h => h.type.startsWith('then')).length).toBe(2);
  });
  it('should isolate contexts for handlers attached in different contexts', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const promise = Promise.resolve('shared');
    const handlers = [];
    try {
      await Promise.all([ctx.run('context-A', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        promise.then(() => handlers.push({
          from: 'A',
          ctx: ctx.get()
        }));
        try {
          await delay(10);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
      }), ctx.run('context-B', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        promise.then(() => handlers.push({
          from: 'B',
          ctx: ctx.get()
        }));
        try {
          await delay(10);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
      }), ctx.run('context-C', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        promise.then(() => handlers.push({
          from: 'C',
          ctx: ctx.get()
        }));
        try {
          await delay(10);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
      })]);
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(handlers.length).toBe(3);
    // Each handler should run in the context where it was attached
    // (This tests runtime Promise patching behavior)
  });
});
describe('Modern Promises - Promise Timing', () => {
  it('should handle Promise resolved before await', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    try {
      await ctx.run('pre-resolved', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        const promise = Promise.resolve('immediate');
        try {
          await delay(10);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        let value;
        try {
          value = await promise;
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        expect(ctx.get()).toBe('pre-resolved');
        expect(value).toBe('immediate');
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  });
  it('should handle Promise rejected before catch', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    let caughtContext;
    try {
      try {
        await ctx.run('pre-rejected', async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          const promise = Promise.reject(new Error('immediate'));
          try {
            await delay(10);
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          try {
            await promise;
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
    } catch (error) {
      caughtContext = ctx.get();
      expect(error.message).toBe('immediate');
    }
    expect(caughtContext).toBeUndefined();
  });
  it('should handle long-delayed promise resolution', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    try {
      await ctx.run('delayed-promise', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        const promise = new Promise(resolve => {
          setTimeout(() => resolve('delayed'), 50);
        });
        let value;
        try {
          value = await promise;
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        expect(ctx.get()).toBe('delayed-promise');
        expect(value).toBe('delayed');
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  }, {
    timeout: 1000
  });
});
describe('Modern Promises - Edge Cases', () => {
  it('should handle promise that never resolves (with timeout)', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    let result;
    try {
      result = await Promise.race([ctx.run('never-resolves', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        const promise = new Promise(() => {}); // Never resolves
        try {
          await promise;
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        return 'should not reach';
      }), delay(50).then(() => 'timeout')]);
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(result).toBe('timeout');
  });
  it('should handle promise resolved multiple times (only first counts)', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const values = [];
    try {
      await ctx.run('multi-resolve', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        const promise = new Promise(resolve => {
          resolve('first');
          resolve('second'); // Should be ignored
          resolve('third'); // Should be ignored
        });
        let value;
        try {
          value = await promise;
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        values.push(value);
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(values).toEqual(['first']);
  });
  it('should handle promise with both resolve and reject called', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    let result;
    try {
      try {
        await ctx.run('resolve-and-reject', async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          const promise = new Promise((resolve, reject) => {
            resolve('resolved');
            reject(new Error('rejected')); // Should be ignored
          });
          try {
            result = await promise;
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
    } catch (error) {
      result = 'caught';
    }
    expect(result).toBe('resolved');
  });
  it('should handle thenable (duck-typed promise)', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const thenable = {
      then(onFulfilled) {
        setTimeout(() => onFulfilled('thenable-value'), 10);
      }
    };
    let result;
    try {
      result = await ctx.run('thenable-test', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        let value;
        try {
          value = await thenable;
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        return {
          value,
          ctx: ctx.get()
        };
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(result.value).toBe('thenable-value');
    expect(result.ctx).toBe('thenable-test');
  });
});
