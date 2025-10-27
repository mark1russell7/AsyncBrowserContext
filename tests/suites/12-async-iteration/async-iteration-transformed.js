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
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
describe('Async Iteration - for await...of', () => {
  async function* simpleAsyncGenerator() {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    yield 1;
    try {
      await delay(5);
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    yield 2;
    try {
      await delay(5);
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    yield 3;
  }
  it('should propagate context through for await...of loop', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const results = [];
    try {
      await ctx.run('for-await-test', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        const _iterator = simpleAsyncGenerator()[Symbol.asyncIterator]();
        let _done = false;
        let value;
        while (!_done) {
          let _result;
          try {
            _result = await _iterator.next();
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          _done = _result.done;
          if (!_done) {
            value = _result.value;
            results.push({
              value,
              ctx: ctx.get()
            });
          }
        }
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(results.length).toBe(3);
    expect(results.every(r => r.ctx === 'for-await-test')).toBeTruthy();
    expect(results.map(r => r.value)).toEqual([1, 2, 3]);
  });
  it('should maintain context across multiple iterations', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    let iterationCount = 0;
    try {
      await ctx.run('multi-iteration', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        const _iterator2 = simpleAsyncGenerator()[Symbol.asyncIterator]();
        let _done2 = false;
        let value;
        while (!_done2) {
          let _result2;
          try {
            _result2 = await _iterator2.next();
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          _done2 = _result2.done;
          if (!_done2) {
            value = _result2.value;
            iterationCount++;
            expect(ctx.get()).toBe('multi-iteration');
            try {
              await delay(5);
            } finally {
              if (__asyncContext) __setAsyncContext(__asyncContext);
            }
            expect(ctx.get()).toBe('multi-iteration');
          }
        }
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(iterationCount).toBe(3);
  });
  it('should handle nested for await...of loops', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const results = [];
    async function* outer() {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      yield 'A';
      yield 'B';
    }
    async function* inner() {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      yield 1;
      yield 2;
    }
    try {
      await ctx.run('nested-for-await', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        const _iterator3 = outer()[Symbol.asyncIterator]();
        let _done3 = false;
        let letter;
        while (!_done3) {
          let _result3;
          try {
            _result3 = await _iterator3.next();
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          _done3 = _result3.done;
          if (!_done3) {
            letter = _result3.value;
            const _iterator4 = inner()[Symbol.asyncIterator]();
            let _done4 = false;
            let number;
            while (!_done4) {
              let _result4;
              try {
                _result4 = await _iterator4.next();
              } finally {
                if (__asyncContext) __setAsyncContext(__asyncContext);
              }
              _done4 = _result4.done;
              if (!_done4) {
                number = _result4.value;
                results.push({
                  letter,
                  number,
                  ctx: ctx.get()
                });
              }
            }
          }
        }
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(results.length).toBe(4);
    expect(results.every(r => r.ctx === 'nested-for-await')).toBeTruthy();
  });
  it('should handle concurrent for await...of loops', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    async function* generator(id) {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      yield `${id}-1`;
      try {
        await delay(5);
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      yield `${id}-2`;
    }
    let results;
    try {
      results = await Promise.all([ctx.run('loop-A', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        const items = [];
        const _iterator5 = generator('A')[Symbol.asyncIterator]();
        let _done5 = false;
        let value;
        while (!_done5) {
          let _result5;
          try {
            _result5 = await _iterator5.next();
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          _done5 = _result5.done;
          if (!_done5) {
            value = _result5.value;
            items.push({
              value,
              ctx: ctx.get()
            });
          }
        }
        return items;
      }), ctx.run('loop-B', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        const items = [];
        const _iterator6 = generator('B')[Symbol.asyncIterator]();
        let _done6 = false;
        let value;
        while (!_done6) {
          let _result6;
          try {
            _result6 = await _iterator6.next();
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          _done6 = _result6.done;
          if (!_done6) {
            value = _result6.value;
            items.push({
              value,
              ctx: ctx.get()
            });
          }
        }
        return items;
      })]);
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(results[0].every(r => r.ctx === 'loop-A')).toBeTruthy();
    expect(results[1].every(r => r.ctx === 'loop-B')).toBeTruthy();
  });
});
describe('Async Iteration - Async Generators', () => {
  it('should maintain context inside async generator function', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const contextValues = [];
    async function* contextAwareGenerator() {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      contextValues.push(ctx.get());
      yield 1;
      try {
        await delay(5);
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      contextValues.push(ctx.get());
      yield 2;
      try {
        await delay(5);
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      contextValues.push(ctx.get());
      yield 3;
    }
    try {
      await ctx.run('generator-context', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        const gen = contextAwareGenerator();
        const _iterator7 = gen[Symbol.asyncIterator]();
        let _done7 = false;
        let value;
        while (!_done7) {
          let _result7;
          try {
            _result7 = await _iterator7.next();
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          _done7 = _result7.done;
          if (!_done7) {
            value = _result7.value;
          }
        }
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(contextValues).toEqual(['generator-context', 'generator-context', 'generator-context']);
  });
  it('should handle async generator with error', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    let errorContext;
    async function* faultyGenerator() {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      yield 1;
      try {
        await delay(5);
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      throw new Error('Generator error');
    }
    try {
      try {
        await ctx.run('faulty-gen', async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          const _iterator8 = faultyGenerator()[Symbol.asyncIterator]();
          let _done8 = false;
          let value;
          while (!_done8) {
            let _result8;
            try {
              _result8 = await _iterator8.next();
            } finally {
              if (__asyncContext) __setAsyncContext(__asyncContext);
            }
            _done8 = _result8.done;
            if (!_done8) {
              value = _result8.value;
              expect(ctx.get()).toBe('faulty-gen');
            }
          }
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
    } catch (error) {
      errorContext = ctx.get();
      expect(error.message).toBe('Generator error');
    }

    // Context should be undefined outside the run
    expect(errorContext).toBeUndefined();
  });
  it('should handle async generator with return', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const values = [];
    async function* generatorWithReturn() {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      yield 1;
      try {
        await delay(5);
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      return 'final';
    }
    try {
      await ctx.run('gen-return', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        const gen = generatorWithReturn();
        const _iterator9 = gen[Symbol.asyncIterator]();
        let _done9 = false;
        let value;
        while (!_done9) {
          let _result9;
          try {
            _result9 = await _iterator9.next();
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          _done9 = _result9.done;
          if (!_done9) {
            value = _result9.value;
            values.push({
              value,
              ctx: ctx.get()
            });
          }
        }
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(values.length).toBe(1);
    expect(values[0].ctx).toBe('gen-return');
  });
  it('should handle async generator with yield*', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const values = [];
    async function* subGenerator() {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      yield 'a';
      try {
        await delay(5);
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      yield 'b';
    }
    async function* mainGenerator() {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      yield* subGenerator();
      yield 'c';
    }
    try {
      await ctx.run('yield-star', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        const _iterator0 = mainGenerator()[Symbol.asyncIterator]();
        let _done0 = false;
        let value;
        while (!_done0) {
          let _result0;
          try {
            _result0 = await _iterator0.next();
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          _done0 = _result0.done;
          if (!_done0) {
            value = _result0.value;
            values.push({
              value,
              ctx: ctx.get()
            });
          }
        }
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(values.length).toBe(3);
    expect(values.every(v => v.ctx === 'yield-star')).toBeTruthy();
    expect(values.map(v => v.value)).toEqual(['a', 'b', 'c']);
  });
});
describe('Async Iteration - Async Iterators', () => {
  it('should handle custom async iterator', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const values = [];
    const customAsyncIterable = {
      async *[Symbol.asyncIterator]() {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        yield 1;
        try {
          await delay(5);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        yield 2;
        try {
          await delay(5);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        yield 3;
      }
    };
    try {
      await ctx.run('custom-iterator', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        const _iterator1 = customAsyncIterable[Symbol.asyncIterator]();
        let _done1 = false;
        let value;
        while (!_done1) {
          let _result1;
          try {
            _result1 = await _iterator1.next();
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          _done1 = _result1.done;
          if (!_done1) {
            value = _result1.value;
            values.push({
              value,
              ctx: ctx.get()
            });
          }
        }
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(values.length).toBe(3);
    expect(values.every(v => v.ctx === 'custom-iterator')).toBeTruthy();
  });
  it('should handle async iterator with next/return/throw', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const iterator = {
      current: 0,
      async next() {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        if (this.current < 3) {
          this.current++;
          try {
            await delay(5);
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          return {
            value: this.current,
            done: false
          };
        }
        return {
          done: true
        };
      },
      async return(value) {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        return {
          value,
          done: true
        };
      },
      async throw(error) {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        throw error;
      },
      [Symbol.asyncIterator]() {
        return this;
      }
    };
    const values = [];
    try {
      await ctx.run('iterator-methods', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        const _iterator10 = iterator[Symbol.asyncIterator]();
        let _done10 = false;
        let value;
        while (!_done10) {
          let _result10;
          try {
            _result10 = await _iterator10.next();
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          _done10 = _result10.done;
          if (!_done10) {
            value = _result10.value;
            values.push({
              value,
              ctx: ctx.get()
            });
            if (value === 2) break; // Test early termination
          }
        }
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(values.length).toBe(2);
    expect(values.every(v => v.ctx === 'iterator-methods')).toBeTruthy();
  });
  it('should handle async iteration with Promise.all', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    async function* gen(id) {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      yield `${id}-1`;
      try {
        await delay(5);
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      yield `${id}-2`;
    }
    let results;
    try {
      results = await Promise.all([ctx.run('iter-A', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        const values = [];
        const _iterator11 = gen('A')[Symbol.asyncIterator]();
        let _done11 = false;
        let value;
        while (!_done11) {
          let _result11;
          try {
            _result11 = await _iterator11.next();
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          _done11 = _result11.done;
          if (!_done11) {
            value = _result11.value;
            values.push({
              value,
              ctx: ctx.get()
            });
          }
        }
        return values;
      }), ctx.run('iter-B', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        const values = [];
        const _iterator12 = gen('B')[Symbol.asyncIterator]();
        let _done12 = false;
        let value;
        while (!_done12) {
          let _result12;
          try {
            _result12 = await _iterator12.next();
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          _done12 = _result12.done;
          if (!_done12) {
            value = _result12.value;
            values.push({
              value,
              ctx: ctx.get()
            });
          }
        }
        return values;
      })]);
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(results[0].every(v => v.ctx === 'iter-A')).toBeTruthy();
    expect(results[1].every(v => v.ctx === 'iter-B')).toBeTruthy();
  });
  it('should handle infinite async iterator with break', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const values = [];
    async function* infiniteGen() {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      let i = 0;
      while (true) {
        yield i++;
        try {
          await delay(5);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
      }
    }
    try {
      await ctx.run('infinite-iter', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        let count = 0;
        const _iterator13 = infiniteGen()[Symbol.asyncIterator]();
        let _done13 = false;
        let value;
        while (!_done13) {
          let _result13;
          try {
            _result13 = await _iterator13.next();
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          _done13 = _result13.done;
          if (!_done13) {
            value = _result13.value;
            values.push({
              value,
              ctx: ctx.get()
            });
            count++;
            if (count >= 5) break;
          }
        }
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(values.length).toBe(5);
    expect(values.every(v => v.ctx === 'infinite-iter')).toBeTruthy();
  });
});
describe('Async Iteration - Edge Cases', () => {
  it('should handle empty async generator', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    let iterations = 0;
    async function* emptyGen() {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    } // Yields nothing
    try {
      await ctx.run('empty-gen', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        const _iterator14 = emptyGen()[Symbol.asyncIterator]();
        let _done14 = false;
        let value;
        while (!_done14) {
          let _result14;
          try {
            _result14 = await _iterator14.next();
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          _done14 = _result14.done;
          if (!_done14) {
            value = _result14.value;
            iterations++;
          }
        }
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(iterations).toBe(0);
  });
  it('should handle async generator that never yields', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    async function* delayedGen() {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      try {
        await delay(10);
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      return 'done';
    }
    let iterations = 0;
    try {
      await ctx.run('no-yield', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        const _iterator15 = delayedGen()[Symbol.asyncIterator]();
        let _done15 = false;
        let value;
        while (!_done15) {
          let _result15;
          try {
            _result15 = await _iterator15.next();
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          _done15 = _result15.done;
          if (!_done15) {
            value = _result15.value;
            iterations++;
          }
        }
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(iterations).toBe(0);
  });
  it('should handle async generator with multiple contexts in pipeline', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const results = [];
    async function* source() {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      yield 1;
      yield 2;
      yield 3;
    }
    async function* transform(iterable, multiplier) {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      const _iterator16 = iterable[Symbol.asyncIterator]();
      let _done16 = false;
      let value;
      while (!_done16) {
        let _result16;
        try {
          _result16 = await _iterator16.next();
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        _done16 = _result16.done;
        if (!_done16) {
          value = _result16.value;
          try {
            await delay(5);
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          yield value * multiplier;
        }
      }
    }
    try {
      await ctx.run('pipeline', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        const pipeline = transform(source(), 10);
        const _iterator17 = pipeline[Symbol.asyncIterator]();
        let _done17 = false;
        let value;
        while (!_done17) {
          let _result17;
          try {
            _result17 = await _iterator17.next();
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          _done17 = _result17.done;
          if (!_done17) {
            value = _result17.value;
            results.push({
              value,
              ctx: ctx.get()
            });
          }
        }
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(results.length).toBe(3);
    expect(results.map(r => r.value)).toEqual([10, 20, 30]);
    expect(results.every(r => r.ctx === 'pipeline')).toBeTruthy();
  });
});
