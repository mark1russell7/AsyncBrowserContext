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
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
describe('Core Functionality', () => {
  let ctx;
  beforeEach(() => {
    ctx = new AsyncVariable();
  });
  it('should maintain context through concurrent async operations', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    async function worker(id) {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      try {
        await delay(Math.random() * 10);
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      const after1 = ctx.get();
      expect(after1).toBe(id);
      try {
        await delay(Math.random() * 10);
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      const after2 = ctx.get();
      expect(after2).toBe(id);
      try {
        await delay(Math.random() * 10);
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      const after3 = ctx.get();
      expect(after3).toBe(id);
      return true;
    }
    let results;
    try {
      results = await Promise.all([ctx.run('A', () => worker('A')), ctx.run('B', () => worker('B')), ctx.run('C', () => worker('C'))]);
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(results.every(r => r === true)).toBeTruthy();
  });
  it('should handle nested contexts correctly', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    let result;
    try {
      result = await ctx.run('outer', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        const outer1 = ctx.get();
        expect(outer1).toBe('outer');
        let inner;
        try {
          inner = await ctx.run('inner', async () => {
            const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
            try {
              await delay(5);
            } finally {
              if (__asyncContext) __setAsyncContext(__asyncContext);
            }
            const val = ctx.get();
            expect(val).toBe('inner');
            return val;
          });
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        try {
          await delay(5);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        const outer2 = ctx.get();
        expect(outer2).toBe('outer');
        expect(inner).toBe('inner');
        return true;
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(result).toBeTruthy();
  });
  it('should propagate context through setTimeout', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    let result;
    try {
      result = await ctx.run('timer-test', () => {
        return new Promise(resolve => {
          setTimeout(() => {
            const val = ctx.get();
            expect(val).toBe('timer-test');
            resolve(true);
          }, 10);
        });
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(result).toBeTruthy();
  });
  it('should propagate context through Promise.then chains', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    let result;
    try {
      result = await ctx.run('promise-test', () => {
        return Promise.resolve(42).then(n => {
          const val = ctx.get();
          expect(val).toBe('promise-test');
          expect(n).toBe(42);
          return val === 'promise-test';
        });
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(result).toBeTruthy();
  });
  it('should support multiple AsyncVariable instances', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const var1 = new AsyncVariable();
    const var2 = new AsyncVariable();
    let result;
    try {
      result = await var1.run('value1', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        try {
          return await var2.run('value2', async () => {
            const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
            try {
              await delay(5);
            } finally {
              if (__asyncContext) __setAsyncContext(__asyncContext);
            }
            const v1 = var1.get();
            const v2 = var2.get();
            expect(v1).toBe('value1');
            expect(v2).toBe('value2');
            return true;
          });
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(result).toBeTruthy();
  });
  it('should handle nested context inside .then() callback (bug regression)', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const v = new AsyncVariable({
      defaultValue: 0
    });
    let allPassed = true;
    try {
      await v.run(1, async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        expect(v.get()).toBe(1);
        try {
          await Promise.resolve().then(async () => {
            const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
            expect(v.get()).toBe(1);

            // This is the exact scenario that was failing before the fix
            try {
              await v.run(2, async () => {
                const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
                expect(v.get()).toBe(2);
                try {
                  await Promise.resolve();
                } finally {
                  if (__asyncContext) __setAsyncContext(__asyncContext);
                }
                expect(v.get()).toBe(2);
              });
            } finally {
              if (__asyncContext) __setAsyncContext(__asyncContext);
            }
            expect(v.get()).toBe(1);
          });
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        expect(v.get()).toBe(1);
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  });
  it('should prioritize currentSyncContext over currentActivePromise', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const var1 = new AsyncVariable({
      name: 'var1'
    });
    try {
      await var1.run('OUTER', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        expect(var1.get()).toBe('OUTER');
        try {
          await var1.run('INNER', async () => {
            const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
            expect(var1.get()).toBe('INNER');

            // Create new async operation - should capture INNER context
            let captured;
            try {
              captured = await new Promise(resolve => {
                setTimeout(() => {
                  const val = var1.get();
                  expect(val).toBe('INNER');
                  resolve(val);
                }, 10);
              });
            } finally {
              if (__asyncContext) __setAsyncContext(__asyncContext);
            }
            try {
              await Promise.resolve();
            } finally {
              if (__asyncContext) __setAsyncContext(__asyncContext);
            }
            expect(var1.get()).toBe('INNER');
            expect(captured).toBe('INNER');
          });
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        expect(var1.get()).toBe('OUTER');
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  });
  it('should validate that await bypasses .then() (architecture test)', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const p = Promise.resolve(42);
    let thenCalled = false;
    const originalThen = p.then;
    p.then = function (...args) {
      thenCalled = true;
      return originalThen.apply(this, args);
    };
    let result;
    try {
      result = await p;
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(thenCalled).toBeFalsy(); // Modern browsers don't call .then() for await
    expect(result).toBe(42);
  });
});
