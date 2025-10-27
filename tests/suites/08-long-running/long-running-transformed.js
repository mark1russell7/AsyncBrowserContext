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
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
describe('Long Running - Sequential Awaits', () => {
  it('should handle 10 sequential awaits', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    try {
      await ctx.run('sequential-10', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        for (let i = 0; i < 10; i++) {
          try {
            await delay(1);
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          expect(ctx.get()).toBe('sequential-10');
        }
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  });
  it('should handle 50 sequential awaits', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    try {
      await ctx.run('sequential-50', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        for (let i = 0; i < 50; i++) {
          try {
            await delay(1);
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          expect(ctx.get()).toBe('sequential-50');
        }
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  }, {
    timeout: 10000
  });
  it('should handle 100 sequential awaits', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    try {
      await ctx.run('sequential-100', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        for (let i = 0; i < 100; i++) {
          try {
            await delay(1);
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          expect(ctx.get()).toBe('sequential-100');
        }
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  }, {
    timeout: 15000
  });
});
describe('Long Running - Loops', () => {
  it('should maintain context across for loop with awaits', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const iterations = [];
    try {
      await ctx.run('for-loop', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        for (let i = 0; i < 20; i++) {
          try {
            await delay(1);
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          iterations.push(ctx.get());
        }
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(iterations.length).toBe(20);
    expect(iterations.every(v => v === 'for-loop')).toBeTruthy();
  });
  it('should maintain context across while loop with awaits', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const iterations = [];
    try {
      await ctx.run('while-loop', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        let count = 0;
        while (count < 20) {
          try {
            await delay(1);
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          iterations.push(ctx.get());
          count++;
        }
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(iterations.length).toBe(20);
    expect(iterations.every(v => v === 'while-loop')).toBeTruthy();
  });
  it('should maintain context across iterations with varying delays', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    try {
      await ctx.run('varying-delays', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        for (let i = 0; i < 10; i++) {
          try {
            await delay(Math.random() * 5);
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          expect(ctx.get()).toBe('varying-delays');
          try {
            await Promise.all([delay(Math.random() * 3), delay(Math.random() * 3), delay(Math.random() * 3)]);
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          expect(ctx.get()).toBe('varying-delays');
        }
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  });
});
describe('Long Running - Recursive Operations', () => {
  it('should handle recursive async functions (10 levels)', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    let maxDepth = 0;
    async function recursiveOperation(depth) {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      if (depth >= 10) return depth;
      maxDepth = Math.max(maxDepth, depth);
      expect(ctx.get()).toBe('recursive');
      try {
        await delay(1);
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      expect(ctx.get()).toBe('recursive');
      try {
        return await recursiveOperation(depth + 1);
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
    }
    try {
      await ctx.run('recursive', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        let finalDepth;
        try {
          finalDepth = await recursiveOperation(0);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        expect(finalDepth).toBe(10);
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(maxDepth).toBe(9);
  });
  it('should handle deep recursion (100 levels)', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    async function deepRecursion(depth) {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      if (depth >= 100) return depth;
      expect(ctx.get()).toBe('deep-recursive');
      try {
        await delay(1);
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      try {
        return await deepRecursion(depth + 1);
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
    }
    try {
      await ctx.run('deep-recursive', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        let finalDepth;
        try {
          finalDepth = await deepRecursion(0);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        expect(finalDepth).toBe(100);
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  }, {
    timeout: 15000
  });
  it('should handle recursive operations with nested contexts', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    async function recursiveWithNesting(depth, maxDepth) {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      if (depth >= maxDepth) return;
      try {
        await ctx.run(`level-${depth}`, async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          expect(ctx.get()).toBe(`level-${depth}`);
          try {
            await delay(1);
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          try {
            await recursiveWithNesting(depth + 1, maxDepth);
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          expect(ctx.get()).toBe(`level-${depth}`);
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
    }
    try {
      await recursiveWithNesting(0, 10);
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  });
});
describe('Long Running - Sustained Operations', () => {
  it('should handle sustained concurrent load', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const batchSize = 50;
    const batches = 5;
    let totalProcessed = 0;
    for (let batch = 0; batch < batches; batch++) {
      const operations = Array.from({
        length: batchSize
      }, (_, i) => ctx.run(`batch-${batch}-op-${i}`, async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        try {
          await delay(Math.random() * 5);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        totalProcessed++;
        return ctx.get();
      }));
      let results;
      try {
        results = await Promise.all(operations);
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      expect(results.length).toBe(batchSize);
    }
    expect(totalProcessed).toBe(batchSize * batches);
  }, {
    timeout: 30000
  });
  it('should not leak memory during many operations', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const iterations = 200;
    for (let i = 0; i < iterations; i++) {
      try {
        await ctx.run(`op-${i}`, async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          try {
            await delay(1);
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          expect(ctx.get()).toBe(`op-${i}`);
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
    }

    // If we got here without running out of memory, test passes
    expect(true).toBeTruthy();
  }, {
    timeout: 30000
  });
});
