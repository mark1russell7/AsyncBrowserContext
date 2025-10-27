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
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
describe('Extreme Concurrency - Massive Parallelism', () => {
  it('should handle 5000 concurrent operations', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const count = 5000;
    const operations = Array.from({
      length: count
    }, (_, i) => ctx.run(`op-${i}`, async () => {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      try {
        await delay(Math.random() * 5);
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      return ctx.get();
    }));
    let results;
    try {
      results = await Promise.all(operations);
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(results.length).toBe(count);
    let failures = 0;
    results.forEach((val, i) => {
      if (val !== `op-${i}`) failures++;
    });
    expect(failures).toBe(0);
  }, {
    timeout: 30000
  });
  it('should handle 10000 operations with varying delays', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const count = 10000;
    const operations = [];
    for (let i = 0; i < count; i++) {
      const delayTime = i % 10 * 2; // 0, 2, 4, ... 18ms
      operations.push(ctx.run(`var-${i}`, async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        if (delayTime > 0) try {
          await delay(delayTime);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        return ctx.get();
      }));
    }
    let results;
    try {
      results = await Promise.all(operations);
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(results.length).toBe(count);
    let failures = 0;
    results.forEach((val, i) => {
      if (val !== `var-${i}`) failures++;
    });
    expect(failures).toBe(0);
  }, {
    timeout: 60000
  });
  it('should handle deeply nested concurrent operations', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    async function recurse(depth, id) {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      if (depth === 0) return ctx.get();
      try {
        return await ctx.run(`${id}-${depth}`, async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          let results;
          try {
            results = await Promise.all([recurse(depth - 1, `${id}-a`), recurse(depth - 1, `${id}-b`)]);
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          expect(ctx.get()).toBe(`${id}-${depth}`);
          return results;
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
    }
    let result;
    try {
      result = await ctx.run('root', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        try {
          await recurse(6, 'r');
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        } // Creates 2^6 = 64 contexts
        return ctx.get();
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(result).toBe('root');
  }, {
    timeout: 30000
  });
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
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const results = [];

    // Create 1000 operations that switch contexts rapidly
    for (let i = 0; i < 1000; i++) {
      ctx.run(`rapid-${i}`, async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        results.push({
          before: ctx.get()
        });
        try {
          await delay(0);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        } // Immediate microtask
        results.push({
          after: ctx.get()
        });
      });
    }
    try {
      await delay(100);
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    } // Wait for all to complete
    expect(results.length).toBe(2000);
  }, {
    timeout: 5000
  });
  it('should handle alternating contexts at high frequency', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx1 = new AsyncVariable();
    const ctx2 = new AsyncVariable();
    const results = [];
    const operations = [];
    for (let i = 0; i < 500; i++) {
      operations.push(ctx1.run(`ctx1-${i}`, async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        results.push({
          ctx: 1,
          val: ctx1.get()
        });
        try {
          await delay(0);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
      }));
      operations.push(ctx2.run(`ctx2-${i}`, async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        results.push({
          ctx: 2,
          val: ctx2.get()
        });
        try {
          await delay(0);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
      }));
    }
    try {
      await Promise.all(operations);
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(results.length).toBe(1000);
  }, {
    timeout: 5000
  });
});
describe('Extreme Concurrency - Race Conditions', () => {
  it('should not have race conditions in context isolation', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const sharedState = {
      counter: 0
    };

    // Create operations that all try to access/modify shared state
    const operations = Array.from({
      length: 1000
    }, (_, i) => ctx.run(`race-${i}`, async () => {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      const id = ctx.get();
      sharedState.counter++;
      try {
        await delay(Math.random() * 2);
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      } // Context should remain stable
      expect(ctx.get()).toBe(id);
      return ctx.get();
    }));
    let results;
    try {
      results = await Promise.all(operations);
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    } // All contexts should be preserved
    expect(results.length).toBe(1000);
    results.forEach((val, i) => {
      expect(val).toBe(`race-${i}`);
    });

    // All modifications should have occurred
    expect(sharedState.counter).toBe(1000);
  }, {
    timeout: 30000
  });
  it('should handle race between context set and get', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const results = [];
    try {
      await Promise.all(Array.from({
        length: 100
      }, (_, i) => ctx.run(`race-get-${i}`, async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        // Rapid gets
        for (let j = 0; j < 10; j++) {
          results.push(ctx.get());
        }
        try {
          await delay(1);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
      })));
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    } // All gets should have returned the correct context
    expect(results.every((val, i) => val === `race-get-${Math.floor(i / 10)}`)).toBeTruthy();
  });
  it('should handle race in Promise.race with contexts', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const iterations = 100;
    const failures = [];
    for (let i = 0; i < iterations; i++) {
      let winner;
      try {
        winner = await Promise.race([ctx.run(`race-a-${i}`, async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          try {
            await delay(Math.random() * 10);
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          return {
            winner: 'a',
            ctx: ctx.get()
          };
        }), ctx.run(`race-b-${i}`, async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          try {
            await delay(Math.random() * 10);
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          return {
            winner: 'b',
            ctx: ctx.get()
          };
        }), ctx.run(`race-c-${i}`, async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          try {
            await delay(Math.random() * 10);
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          return {
            winner: 'c',
            ctx: ctx.get()
          };
        })]);
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      const expectedCtx = `race-${winner.winner}-${i}`;
      if (winner.ctx !== expectedCtx) {
        failures.push({
          iteration: i,
          expected: expectedCtx,
          got: winner.ctx
        });
      }
    }
    expect(failures.length).toBe(0);
  }, {
    timeout: 30000
  });
});
describe('Extreme Concurrency - Resource Contention', () => {
  it('should handle all operations competing for completion', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const startTime = Date.now();
    const completionTimes = [];
    const operations = Array.from({
      length: 1000
    }, (_, i) => ctx.run(`compete-${i}`, async () => {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      try {
        await delay(Math.random() * 50);
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      completionTimes.push({
        id: i,
        time: Date.now() - startTime,
        ctx: ctx.get()
      });
      return ctx.get();
    }));
    let results;
    try {
      results = await Promise.all(operations);
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(results.length).toBe(1000);
    expect(completionTimes.length).toBe(1000);

    // Verify all contexts were maintained
    completionTimes.forEach((record, i) => {
      expect(record.ctx).toBe(`compete-${record.id}`);
    });
  }, {
    timeout: 30000
  });
  it('should handle wave pattern of operations', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const waves = 10;
    const opsPerWave = 100;
    const results = [];
    for (let wave = 0; wave < waves; wave++) {
      const waveOps = Array.from({
        length: opsPerWave
      }, (_, i) => ctx.run(`wave-${wave}-${i}`, async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        try {
          await delay(Math.random() * 10);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        return ctx.get();
      }));
      let waveResults;
      try {
        waveResults = await Promise.all(waveOps);
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      results.push(...waveResults);

      // Small delay between waves
      try {
        await delay(5);
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
    }
    expect(results.length).toBe(waves * opsPerWave);
    results.forEach((val, i) => {
      const wave = Math.floor(i / opsPerWave);
      const idx = i % opsPerWave;
      expect(val).toBe(`wave-${wave}-${idx}`);
    });
  }, {
    timeout: 30000
  });
});
describe('Extreme Concurrency - Context Churn', () => {
  it('should handle continuous context creation and destruction', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const duration = 2000; // 2 seconds
    const startTime = Date.now();
    let operationCount = 0;
    while (Date.now() - startTime < duration) {
      try {
        await ctx.run(`churn-${operationCount}`, async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          expect(ctx.get()).toBe(`churn-${operationCount}`);
          try {
            await delay(1);
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      operationCount++;
    }
    console.log(`Completed ${operationCount} operations in ${duration}ms`);
    expect(operationCount).toBeGreaterThan(100);
  }, {
    timeout: 10000
  });
  it('should handle mixed short and long-lived contexts', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const results = [];
    const operations = [];

    // Short-lived contexts (complete quickly)
    for (let i = 0; i < 500; i++) {
      operations.push(ctx.run(`short-${i}`, async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        try {
          await delay(1);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        results.push({
          type: 'short',
          ctx: ctx.get()
        });
      }));
    }

    // Long-lived contexts (complete slowly)
    for (let i = 0; i < 50; i++) {
      operations.push(ctx.run(`long-${i}`, async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        try {
          await delay(50);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        results.push({
          type: 'long',
          ctx: ctx.get()
        });
      }));
    }
    try {
      await Promise.all(operations);
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(results.length).toBe(550);
    const shortResults = results.filter(r => r.type === 'short');
    const longResults = results.filter(r => r.type === 'long');
    expect(shortResults.length).toBe(500);
    expect(longResults.length).toBe(50);
  }, {
    timeout: 30000
  });
});
describe('Extreme Concurrency - Nested Parallelism', () => {
  it('should handle nested Promise.all at multiple levels', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const level3 = id => ctx.run(`l3-${id}`, async () => {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      try {
        await delay(1);
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      return ctx.get();
    });
    const level2 = id => ctx.run(`l2-${id}`, async () => {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      let results;
      try {
        results = await Promise.all([level3(`${id}-a`), level3(`${id}-b`), level3(`${id}-c`)]);
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      return {
        id: ctx.get(),
        children: results
      };
    });
    const level1 = id => ctx.run(`l1-${id}`, async () => {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      let results;
      try {
        results = await Promise.all([level2(`${id}-a`), level2(`${id}-b`)]);
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      return {
        id: ctx.get(),
        children: results
      };
    });
    let results;
    try {
      results = await ctx.run('root', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        let data;
        try {
          data = await Promise.all([level1('a'), level1('b'), level1('c')]);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        return {
          id: ctx.get(),
          children: data
        };
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(results.id).toBe('root');
    expect(results.children.length).toBe(3);
  }, {
    timeout: 30000
  });
  it('should handle pyramid pattern of concurrency', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    let totalOps = 0;
    async function pyramid(levels, id) {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      if (levels === 0) {
        totalOps++;
        return ctx.get();
      }
      try {
        return await ctx.run(`${id}-${levels}`, async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          const childCount = levels;
          let children;
          try {
            children = await Promise.all(Array.from({
              length: childCount
            }, (_, i) => pyramid(levels - 1, `${id}-${i}`)));
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          expect(ctx.get()).toBe(`${id}-${levels}`);
          return children;
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
    }
    try {
      await ctx.run('pyramid-root', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        try {
          await pyramid(5, 'p');
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        } // Creates 1+2+3+4+5+5! contexts
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(totalOps).toBeGreaterThan(0);
    console.log(`Pyramid created ${totalOps} leaf operations`);
  }, {
    timeout: 30000
  });
});
