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

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const { Snapshot: AsyncSnapshot } = AsyncContext;

describe('AsyncSnapshot - Basic Capture', () => {
  it('should capture current context', async () => {
    const ctx = new AsyncVariable();

    await ctx.run('test-value', async () => {
      const snapshot = new AsyncSnapshot();

      // Later, outside the context
      await delay(10);
    });

    // Now restore the snapshot outside the original context
    const snapshot = await ctx.run('capture-ctx', async () => {
      const snap = new AsyncSnapshot();
      expect(ctx.get()).toBe('capture-ctx');
      return snap;
    });

    const result = snapshot.run(() => {
      return ctx.get();
    });

    expect(result).toBe('capture-ctx');
  });

  it('should capture from nested context', async () => {
    const ctx = new AsyncVariable();
    let innerSnapshot;

    await ctx.run('outer', async () => {
      await ctx.run('inner', async () => {
        innerSnapshot = new AsyncSnapshot();
        expect(ctx.get()).toBe('inner');
      });

      expect(ctx.get()).toBe('outer');
    });

    // Restore inner snapshot later
    const result = innerSnapshot.run(() => {
      return ctx.get();
    });

    expect(result).toBe('inner');
  });

  it('should support multiple snapshots', async () => {
    const ctx = new AsyncVariable();
    const snapshots = [];

    await ctx.run('snap-1', async () => {
      snapshots.push(new AsyncSnapshot());
    });

    await ctx.run('snap-2', async () => {
      snapshots.push(new AsyncSnapshot());
    });

    await ctx.run('snap-3', async () => {
      snapshots.push(new AsyncSnapshot());
    });

    const results = snapshots.map(snap =>
      snap.run(() => ctx.get())
    );

    expect(results).toEqual(['snap-1', 'snap-2', 'snap-3']);
  });
});

describe('AsyncSnapshot - Restore Operations', () => {
  it('should restore context in different execution', async () => {
    const ctx = new AsyncVariable();
    let snapshot;

    // Capture in one async operation
    await ctx.run('original', async () => {
      snapshot = new AsyncSnapshot();
      await delay(5);
    });

    // Restore in a completely different execution
    await delay(10);

    const result = await snapshot.run(async () => {
      await delay(5);
      return ctx.get();
    });

    expect(result).toBe('original');
  });

  it('should handle nested snapshot restores', async () => {
    const ctx = new AsyncVariable();
    let outerSnap, innerSnap;

    await ctx.run('outer', async () => {
      outerSnap = new AsyncSnapshot();

      await ctx.run('inner', async () => {
        innerSnap = new AsyncSnapshot();
      });
    });

    // Restore outer, then inner
    outerSnap.run(() => {
      expect(ctx.get()).toBe('outer');

      innerSnap.run(() => {
        expect(ctx.get()).toBe('inner');
      });

      expect(ctx.get()).toBe('outer');
    });
  });

  it('should support async operations in snapshot.run()', async () => {
    const ctx = new AsyncVariable();
    let snapshot;

    await ctx.run('snap-ctx', async () => {
      snapshot = new AsyncSnapshot();
    });

    const result = await snapshot.run(async () => {
      expect(ctx.get()).toBe('snap-ctx');
      await delay(5);
      expect(ctx.get()).toBe('snap-ctx');

      await ctx.run('nested-in-restore', async () => {
        expect(ctx.get()).toBe('nested-in-restore');
      });

      expect(ctx.get()).toBe('snap-ctx');
      return ctx.get();
    });

    expect(result).toBe('snap-ctx');
  });

  it('should handle multiple restores of same snapshot', async () => {
    const ctx = new AsyncVariable();
    let snapshot;

    await ctx.run('reusable', async () => {
      snapshot = new AsyncSnapshot();
    });

    // Restore multiple times
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
    const ctx1 = new AsyncVariable();
    const ctx2 = new AsyncVariable();
    let snapshot;

    await ctx1.run('value-1', async () => {
      await ctx2.run('value-2', async () => {
        snapshot = new AsyncSnapshot();
        expect(ctx1.get()).toBe('value-1');
        expect(ctx2.get()).toBe('value-2');
      });
    });

    snapshot.run(() => {
      expect(ctx1.get()).toBe('value-1');
      expect(ctx2.get()).toBe('value-2');
    });
  });

  it('should restore partial context from snapshot', async () => {
    const ctx1 = new AsyncVariable();
    const ctx2 = new AsyncVariable();
    let snapshot;

    await ctx1.run('only-ctx1', async () => {
      snapshot = new AsyncSnapshot();
      expect(ctx1.get()).toBe('only-ctx1');
      expect(ctx2.get()).toBeUndefined();
    });

    snapshot.run(() => {
      expect(ctx1.get()).toBe('only-ctx1');
      expect(ctx2.get()).toBeUndefined();
    });
  });

  it('should handle snapshot with default values', async () => {
    const ctx1 = new AsyncVariable({ defaultValue: 'default-1' });
    const ctx2 = new AsyncVariable({ defaultValue: 'default-2' });
    let snapshot;

    await ctx1.run('custom-1', async () => {
      // ctx2 uses default
      snapshot = new AsyncSnapshot();
    });

    snapshot.run(() => {
      expect(ctx1.get()).toBe('custom-1');
      expect(ctx2.get()).toBe('default-2');
    });
  });
});
