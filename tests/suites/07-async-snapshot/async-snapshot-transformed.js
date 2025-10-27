/**
 * AsyncSnapshot Tests (Suite 07)
 *
 * Tests AsyncSnapshot API:
 * - Capture current context
 * - Capture from nested contexts
 * - Multiple snapshots
 * - Restore in different executions
 */

import { describe, it, expect } from '../../framework/test-runner.js';
import { AsyncVariable, AsyncContext } from '../../../dist/context.js';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const {
  Snapshot: AsyncSnapshot
} = AsyncContext;
describe('AsyncSnapshot - Basic Capture', () => {
  it('should capture current context', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    try {
      await ctx.run('test-value', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        const snapshot = new AsyncSnapshot();

        // Later, outside the context
        try {
          await delay(10);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    } // Now restore the snapshot outside the original context
    let snapshot;
    try {
      snapshot = await ctx.run('capture-ctx', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        const snap = new AsyncSnapshot();
        expect(ctx.get()).toBe('capture-ctx');
        return snap;
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    const result = snapshot.run(() => {
      return ctx.get();
    });
    expect(result).toBe('capture-ctx');
  });
  it('should capture from nested context', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    let innerSnapshot;
    try {
      await ctx.run('outer', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        try {
          await ctx.run('inner', async () => {
            const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
            innerSnapshot = new AsyncSnapshot();
            expect(ctx.get()).toBe('inner');
          });
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        expect(ctx.get()).toBe('outer');
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    } // Restore inner snapshot later
    const result = innerSnapshot.run(() => {
      return ctx.get();
    });
    expect(result).toBe('inner');
  });
  it('should support multiple snapshots', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const snapshots = [];
    try {
      await ctx.run('snap-1', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        snapshots.push(new AsyncSnapshot());
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    try {
      await ctx.run('snap-2', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        snapshots.push(new AsyncSnapshot());
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    try {
      await ctx.run('snap-3', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        snapshots.push(new AsyncSnapshot());
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    const results = snapshots.map(snap => snap.run(() => ctx.get()));
    expect(results).toEqual(['snap-1', 'snap-2', 'snap-3']);
  });
});
describe('AsyncSnapshot - Restore Operations', () => {
  it('should restore context in different execution', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    let snapshot;

    // Capture in one async operation
    try {
      await ctx.run('original', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        snapshot = new AsyncSnapshot();
        try {
          await delay(5);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    } // Restore in a completely different execution
    try {
      await delay(10);
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    let result;
    try {
      result = await snapshot.run(async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        try {
          await delay(5);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        return ctx.get();
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(result).toBe('original');
  });
  it('should handle nested snapshot restores', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    let outerSnap, innerSnap;
    try {
      await ctx.run('outer', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        outerSnap = new AsyncSnapshot();
        try {
          await ctx.run('inner', async () => {
            const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
            innerSnap = new AsyncSnapshot();
          });
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    } // Restore outer, then inner
    outerSnap.run(() => {
      expect(ctx.get()).toBe('outer');
      innerSnap.run(() => {
        expect(ctx.get()).toBe('inner');
      });
      expect(ctx.get()).toBe('outer');
    });
  });
  it('should support async operations in snapshot.run()', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    let snapshot;
    try {
      await ctx.run('snap-ctx', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        snapshot = new AsyncSnapshot();
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    let result;
    try {
      result = await snapshot.run(async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        expect(ctx.get()).toBe('snap-ctx');
        try {
          await delay(5);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        expect(ctx.get()).toBe('snap-ctx');
        try {
          await ctx.run('nested-in-restore', async () => {
            const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
            expect(ctx.get()).toBe('nested-in-restore');
          });
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        expect(ctx.get()).toBe('snap-ctx');
        return ctx.get();
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(result).toBe('snap-ctx');
  });
  it('should handle multiple restores of same snapshot', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    let snapshot;
    try {
      await ctx.run('reusable', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        snapshot = new AsyncSnapshot();
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    } // Restore multiple times
    const results = [];
    for (let i = 0; i < 5; i++) {
      const result = snapshot.run(() => ctx.get());
      results.push(result);
    }
    expect(results).toEqual(['reusable', 'reusable', 'reusable', 'reusable', 'reusable']);
  });
});
describe('AsyncSnapshot - Multiple Variables', () => {
  it('should capture multiple AsyncVariable contexts', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx1 = new AsyncVariable();
    const ctx2 = new AsyncVariable();
    let snapshot;
    try {
      await ctx1.run('value-1', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        try {
          await ctx2.run('value-2', async () => {
            const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
            snapshot = new AsyncSnapshot();
            expect(ctx1.get()).toBe('value-1');
            expect(ctx2.get()).toBe('value-2');
          });
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    snapshot.run(() => {
      expect(ctx1.get()).toBe('value-1');
      expect(ctx2.get()).toBe('value-2');
    });
  });
  it('should restore partial context from snapshot', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx1 = new AsyncVariable();
    const ctx2 = new AsyncVariable();
    let snapshot;
    try {
      await ctx1.run('only-ctx1', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        snapshot = new AsyncSnapshot();
        expect(ctx1.get()).toBe('only-ctx1');
        expect(ctx2.get()).toBeUndefined();
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    snapshot.run(() => {
      expect(ctx1.get()).toBe('only-ctx1');
      expect(ctx2.get()).toBeUndefined();
    });
  });
  it('should handle snapshot with default values', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx1 = new AsyncVariable({
      defaultValue: 'default-1'
    });
    const ctx2 = new AsyncVariable({
      defaultValue: 'default-2'
    });
    let snapshot;
    try {
      await ctx1.run('custom-1', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        // ctx2 uses default
        snapshot = new AsyncSnapshot();
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    snapshot.run(() => {
      expect(ctx1.get()).toBe('custom-1');
      expect(ctx2.get()).toBe('default-2');
    });
  });
});
