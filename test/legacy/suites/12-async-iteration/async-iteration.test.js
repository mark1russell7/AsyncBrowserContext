/**
 * Async Iteration Tests (Suite 12)
 *
 * Tests context propagation through:
 * - for await...of loops
 * - Async generators (async function*)
 * - Async iterators
 */

import { describe, it, expect } from '../../framework/test-runner.js';
import { AsyncVariable } from '../../../dist/context.js';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

describe('Async Iteration - for await...of', () => {
  async function* simpleAsyncGenerator() {
    yield 1;
    await delay(5);
    yield 2;
    await delay(5);
    yield 3;
  }

  it('should propagate context through for await...of loop', async () => {
    const ctx = new AsyncVariable();
    const results = [];

    await ctx.run('for-await-test', async () => {
      for await (const value of simpleAsyncGenerator()) {
        results.push({ value, ctx: ctx.get() });
      }
    });

    expect(results.length).toBe(3);
    expect(results.every(r => r.ctx === 'for-await-test')).toBeTruthy();
    expect(results.map(r => r.value)).toEqual([1, 2, 3]);
  });

  it('should maintain context across multiple iterations', async () => {
    const ctx = new AsyncVariable();
    let iterationCount = 0;

    await ctx.run('multi-iteration', async () => {
      for await (const value of simpleAsyncGenerator()) {
        iterationCount++;
        expect(ctx.get()).toBe('multi-iteration');
        await delay(5);
        expect(ctx.get()).toBe('multi-iteration');
      }
    });

    expect(iterationCount).toBe(3);
  });

  it('should handle nested for await...of loops', async () => {
    const ctx = new AsyncVariable();
    const results = [];

    async function* outer() {
      yield 'A';
      yield 'B';
    }

    async function* inner() {
      yield 1;
      yield 2;
    }

    await ctx.run('nested-for-await', async () => {
      for await (const letter of outer()) {
        for await (const number of inner()) {
          results.push({ letter, number, ctx: ctx.get() });
        }
      }
    });

    expect(results.length).toBe(4);
    expect(results.every(r => r.ctx === 'nested-for-await')).toBeTruthy();
  });

  it('should handle concurrent for await...of loops', async () => {
    const ctx = new AsyncVariable();

    async function* generator(id) {
      yield `${id}-1`;
      await delay(5);
      yield `${id}-2`;
    }

    const results = await Promise.all([
      ctx.run('loop-A', async () => {
        const items = [];
        for await (const value of generator('A')) {
          items.push({ value, ctx: ctx.get() });
        }
        return items;
      }),
      ctx.run('loop-B', async () => {
        const items = [];
        for await (const value of generator('B')) {
          items.push({ value, ctx: ctx.get() });
        }
        return items;
      })
    ]);

    expect(results[0].every(r => r.ctx === 'loop-A')).toBeTruthy();
    expect(results[1].every(r => r.ctx === 'loop-B')).toBeTruthy();
  });
});

describe('Async Iteration - Async Generators', () => {
  it('should maintain context inside async generator function', async () => {
    const ctx = new AsyncVariable();
    const contextValues = [];

    async function* contextAwareGenerator() {
      contextValues.push(ctx.get());
      yield 1;
      await delay(5);
      contextValues.push(ctx.get());
      yield 2;
      await delay(5);
      contextValues.push(ctx.get());
      yield 3;
    }

    await ctx.run('generator-context', async () => {
      const gen = contextAwareGenerator();
      for await (const value of gen) {
        // Consume generator
      }
    });

    expect(contextValues).toEqual(['generator-context', 'generator-context', 'generator-context']);
  });

  it('should handle async generator with error', async () => {
    const ctx = new AsyncVariable();
    let errorContext;

    async function* faultyGenerator() {
      yield 1;
      await delay(5);
      throw new Error('Generator error');
    }

    try {
      await ctx.run('faulty-gen', async () => {
        for await (const value of faultyGenerator()) {
          expect(ctx.get()).toBe('faulty-gen');
        }
      });
    } catch (error) {
      errorContext = ctx.get();
      expect(error.message).toBe('Generator error');
    }

    // Context should be undefined outside the run
    expect(errorContext).toBeUndefined();
  });

  it('should handle async generator with return', async () => {
    const ctx = new AsyncVariable();
    const values = [];

    async function* generatorWithReturn() {
      yield 1;
      await delay(5);
      return 'final';
    }

    await ctx.run('gen-return', async () => {
      const gen = generatorWithReturn();
      for await (const value of gen) {
        values.push({ value, ctx: ctx.get() });
      }
    });

    expect(values.length).toBe(1);
    expect(values[0].ctx).toBe('gen-return');
  });

  it('should handle async generator with yield*', async () => {
    const ctx = new AsyncVariable();
    const values = [];

    async function* subGenerator() {
      yield 'a';
      await delay(5);
      yield 'b';
    }

    async function* mainGenerator() {
      yield* subGenerator();
      yield 'c';
    }

    await ctx.run('yield-star', async () => {
      for await (const value of mainGenerator()) {
        values.push({ value, ctx: ctx.get() });
      }
    });

    expect(values.length).toBe(3);
    expect(values.every(v => v.ctx === 'yield-star')).toBeTruthy();
    expect(values.map(v => v.value)).toEqual(['a', 'b', 'c']);
  });
});

describe('Async Iteration - Async Iterators', () => {
  it('should handle custom async iterator', async () => {
    const ctx = new AsyncVariable();
    const values = [];

    const customAsyncIterable = {
      async *[Symbol.asyncIterator]() {
        yield 1;
        await delay(5);
        yield 2;
        await delay(5);
        yield 3;
      }
    };

    await ctx.run('custom-iterator', async () => {
      for await (const value of customAsyncIterable) {
        values.push({ value, ctx: ctx.get() });
      }
    });

    expect(values.length).toBe(3);
    expect(values.every(v => v.ctx === 'custom-iterator')).toBeTruthy();
  });

  it('should handle async iterator with next/return/throw', async () => {
    const ctx = new AsyncVariable();

    const iterator = {
      current: 0,
      async next() {
        if (this.current < 3) {
          this.current++;
          await delay(5);
          return { value: this.current, done: false };
        }
        return { done: true };
      },
      async return(value) {
        return { value, done: true };
      },
      async throw(error) {
        throw error;
      },
      [Symbol.asyncIterator]() {
        return this;
      }
    };

    const values = [];

    await ctx.run('iterator-methods', async () => {
      for await (const value of iterator) {
        values.push({ value, ctx: ctx.get() });
        if (value === 2) break; // Test early termination
      }
    });

    expect(values.length).toBe(2);
    expect(values.every(v => v.ctx === 'iterator-methods')).toBeTruthy();
  });

  it('should handle async iteration with Promise.all', async () => {
    const ctx = new AsyncVariable();

    async function* gen(id) {
      yield `${id}-1`;
      await delay(5);
      yield `${id}-2`;
    }

    const results = await Promise.all([
      ctx.run('iter-A', async () => {
        const values = [];
        for await (const value of gen('A')) {
          values.push({ value, ctx: ctx.get() });
        }
        return values;
      }),
      ctx.run('iter-B', async () => {
        const values = [];
        for await (const value of gen('B')) {
          values.push({ value, ctx: ctx.get() });
        }
        return values;
      })
    ]);

    expect(results[0].every(v => v.ctx === 'iter-A')).toBeTruthy();
    expect(results[1].every(v => v.ctx === 'iter-B')).toBeTruthy();
  });

  it('should handle infinite async iterator with break', async () => {
    const ctx = new AsyncVariable();
    const values = [];

    async function* infiniteGen() {
      let i = 0;
      while (true) {
        yield i++;
        await delay(5);
      }
    }

    await ctx.run('infinite-iter', async () => {
      let count = 0;
      for await (const value of infiniteGen()) {
        values.push({ value, ctx: ctx.get() });
        count++;
        if (count >= 5) break;
      }
    });

    expect(values.length).toBe(5);
    expect(values.every(v => v.ctx === 'infinite-iter')).toBeTruthy();
  });
});

describe('Async Iteration - Edge Cases', () => {
  it('should handle empty async generator', async () => {
    const ctx = new AsyncVariable();
    let iterations = 0;

    async function* emptyGen() {
      // Yields nothing
    }

    await ctx.run('empty-gen', async () => {
      for await (const value of emptyGen()) {
        iterations++;
      }
    });

    expect(iterations).toBe(0);
  });

  it('should handle async generator that never yields', async () => {
    const ctx = new AsyncVariable();

    async function* delayedGen() {
      await delay(10);
      return 'done';
    }

    let iterations = 0;

    await ctx.run('no-yield', async () => {
      for await (const value of delayedGen()) {
        iterations++;
      }
    });

    expect(iterations).toBe(0);
  });

  it('should handle async generator with multiple contexts in pipeline', async () => {
    const ctx = new AsyncVariable();
    const results = [];

    async function* source() {
      yield 1;
      yield 2;
      yield 3;
    }

    async function* transform(iterable, multiplier) {
      for await (const value of iterable) {
        await delay(5);
        yield value * multiplier;
      }
    }

    await ctx.run('pipeline', async () => {
      const pipeline = transform(source(), 10);
      for await (const value of pipeline) {
        results.push({ value, ctx: ctx.get() });
      }
    });

    expect(results.length).toBe(3);
    expect(results.map(r => r.value)).toEqual([10, 20, 30]);
    expect(results.every(r => r.ctx === 'pipeline')).toBeTruthy();
  });
});
