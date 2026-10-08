/**
 * Deep Nesting Tests (Suite 04)
 *
 * Tests complex nesting scenarios:
 * - Multi-level .run() nesting (3, 5, 10 levels)
 * - Mixed patterns (.run() → .then() → .run())
 * - Alternating sync/async nesting
 */

import { describe, it, expect } from '../../framework/test-runner.js';
import { AsyncVariable } from '../../../dist/context.js';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

describe('Deep Nesting - Multi-level', () => {
  it('should handle 3-level nesting', async () => {
    const ctx = new AsyncVariable();
    const path = [];

    await ctx.run('L1', async () => {
      path.push(ctx.get());
      expect(ctx.get()).toBe('L1');

      await ctx.run('L2', async () => {
        path.push(ctx.get());
        expect(ctx.get()).toBe('L2');

        await ctx.run('L3', async () => {
          path.push(ctx.get());
          expect(ctx.get()).toBe('L3');
          await delay(5);
          expect(ctx.get()).toBe('L3');
        });

        expect(ctx.get()).toBe('L2');
      });

      expect(ctx.get()).toBe('L1');
    });

    expect(path).toEqual(['L1', 'L2', 'L3']);
  });

  it('should handle 5-level nesting', async () => {
    const ctx = new AsyncVariable();
    const path = [];

    await ctx.run('L1', async () => {
      path.push(ctx.get());

      await ctx.run('L2', async () => {
        path.push(ctx.get());

        await ctx.run('L3', async () => {
          path.push(ctx.get());

          await ctx.run('L4', async () => {
            path.push(ctx.get());

            await ctx.run('L5', async () => {
              path.push(ctx.get());
              expect(ctx.get()).toBe('L5');
              await delay(5);
              expect(ctx.get()).toBe('L5');
            });

            expect(ctx.get()).toBe('L4');
          });

          expect(ctx.get()).toBe('L3');
        });

        expect(ctx.get()).toBe('L2');
      });

      expect(ctx.get()).toBe('L1');
    });

    expect(path).toEqual(['L1', 'L2', 'L3', 'L4', 'L5']);
  });

  it('should handle 10-level deep nesting', async () => {
    const ctx = new AsyncVariable();
    let depth = 0;

    async function nestLevel(level) {
      if (level > 10) return;

      await ctx.run(`L${level}`, async () => {
        depth = Math.max(depth, level);
        expect(ctx.get()).toBe(`L${level}`);
        await delay(1);
        expect(ctx.get()).toBe(`L${level}`);

        await nestLevel(level + 1);

        expect(ctx.get()).toBe(`L${level}`);
      });
    }

    await nestLevel(1);
    expect(depth).toBe(10);
  });
});

describe('Deep Nesting - Mixed Patterns', () => {
  it('should handle .run() → .then() → .run() pattern', async () => {
    const ctx = new AsyncVariable();
    const sequence = [];

    await ctx.run('outer', async () => {
      sequence.push(ctx.get());
      expect(ctx.get()).toBe('outer');

      await Promise.resolve().then(async () => {
        sequence.push(ctx.get());
        expect(ctx.get()).toBe('outer');

        await ctx.run('inner', async () => {
          sequence.push(ctx.get());
          expect(ctx.get()).toBe('inner');
          await delay(5);
          expect(ctx.get()).toBe('inner');
        });

        expect(ctx.get()).toBe('outer');
      });

      expect(ctx.get()).toBe('outer');
    });

    expect(sequence).toEqual(['outer', 'outer', 'inner']);
  });

  it('should handle .run() → async/await → .run() pattern', async () => {
    const ctx = new AsyncVariable();

    await ctx.run('level-1', async () => {
      expect(ctx.get()).toBe('level-1');

      const promise = async () => {
        expect(ctx.get()).toBe('level-1');
        await delay(5);
        expect(ctx.get()).toBe('level-1');

        await ctx.run('level-2', async () => {
          expect(ctx.get()).toBe('level-2');
          await delay(5);
          expect(ctx.get()).toBe('level-2');
        });

        expect(ctx.get()).toBe('level-1');
      };

      await promise();
      expect(ctx.get()).toBe('level-1');
    });
  });

  it('should handle .then() → .run() → .then() pattern', async () => {
    const ctx = new AsyncVariable();

    await ctx.run('root', async () => {
      const result = await Promise.resolve('start')
        .then(async (val) => {
          expect(ctx.get()).toBe('root');

          await ctx.run('nested', async () => {
            expect(ctx.get()).toBe('nested');
            await delay(5);
            expect(ctx.get()).toBe('nested');
          });

          expect(ctx.get()).toBe('root');
          return val + '-middle';
        })
        .then(async (val) => {
          expect(ctx.get()).toBe('root');
          await delay(5);
          return val + '-end';
        });

      expect(result).toBe('start-middle-end');
    });
  });

  it('should handle complex mixed nesting with multiple branches', async () => {
    const ctx = new AsyncVariable();

    await ctx.run('root', async () => {
      // Branch 1
      await Promise.resolve().then(async () => {
        await ctx.run('branch-1', async () => {
          expect(ctx.get()).toBe('branch-1');

          await ctx.run('branch-1-nested', async () => {
            expect(ctx.get()).toBe('branch-1-nested');
          });

          expect(ctx.get()).toBe('branch-1');
        });
      });

      // Branch 2
      await ctx.run('branch-2', async () => {
        expect(ctx.get()).toBe('branch-2');

        await Promise.resolve().then(async () => {
          expect(ctx.get()).toBe('branch-2');

          await ctx.run('branch-2-nested', async () => {
            expect(ctx.get()).toBe('branch-2-nested');
          });

          expect(ctx.get()).toBe('branch-2');
        });
      });

      expect(ctx.get()).toBe('root');
    });
  });
});

describe('Deep Nesting - Alternating Sync/Async', () => {
  it('should handle sync .run() → async .run() alternation', async () => {
    const ctx = new AsyncVariable();
    const pattern = [];

    await ctx.run('async-1', async () => {
      pattern.push('async');
      expect(ctx.get()).toBe('async-1');

      const sync1 = ctx.run('sync-1', () => {
        pattern.push('sync');
        expect(ctx.get()).toBe('sync-1');
        return ctx.get();
      });

      expect(sync1).toBe('sync-1');

      await ctx.run('async-2', async () => {
        pattern.push('async');
        expect(ctx.get()).toBe('async-2');
        await delay(5);

        const sync2 = ctx.run('sync-2', () => {
          pattern.push('sync');
          expect(ctx.get()).toBe('sync-2');
          return ctx.get();
        });

        expect(sync2).toBe('sync-2');
        expect(ctx.get()).toBe('async-2');
      });

      expect(ctx.get()).toBe('async-1');
    });

    expect(pattern).toEqual(['async', 'sync', 'async', 'sync']);
  });

  it('should handle deeply nested with mixed sync/async timing', async () => {
    const ctx = new AsyncVariable();
    let deepestAsync = 0;
    let deepestSync = 0;

    async function asyncNest(level) {
      if (level > 5) return;

      await ctx.run(`async-${level}`, async () => {
        deepestAsync = Math.max(deepestAsync, level);
        expect(ctx.get()).toBe(`async-${level}`);

        if (level < 5) {
          await delay(2);
        }

        // Sync nest inside async
        ctx.run(`sync-${level}`, () => {
          deepestSync = Math.max(deepestSync, level);
          expect(ctx.get()).toBe(`sync-${level}`);
        });

        await asyncNest(level + 1);

        expect(ctx.get()).toBe(`async-${level}`);
      });
    }

    await asyncNest(1);
    expect(deepestAsync).toBe(5);
    expect(deepestSync).toBe(5);
  });

  it('should maintain context through rapid sync-async transitions', async () => {
    const ctx = new AsyncVariable();
    const transitions = [];

    await ctx.run('start', async () => {
      transitions.push(ctx.get());

      for (let i = 0; i < 5; i++) {
        // Sync operation
        ctx.run(`sync-${i}`, () => {
          transitions.push(ctx.get());
        });

        // Async operation
        await ctx.run(`async-${i}`, async () => {
          transitions.push(ctx.get());
          await delay(1);
        });

        transitions.push(ctx.get());
      }
    });

    expect(transitions[0]).toBe('start');
    expect(transitions[transitions.length - 1]).toBe('start');
  });
});
