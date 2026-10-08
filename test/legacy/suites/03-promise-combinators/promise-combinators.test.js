/**
 * Promise Combinators Tests (Suite 03)
 *
 * Tests context propagation through Promise static methods:
 * - Promise.all with multiple contexts
 * - Promise.race with winner context
 * - Promise.allSettled with mixed outcomes
 * - Promise.any with multiple rejections
 */

import { describe, it, expect, beforeEach } from '../../framework/test-runner.js';
import { AsyncVariable } from '../../../dist/context.js';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

describe('Promise.all', () => {
  let ctx;

  beforeEach(() => {
    ctx = new AsyncVariable();
  });

  it('should maintain separate contexts for each promise in Promise.all', async () => {
    const results = await Promise.all([
      ctx.run('A', async () => {
        await delay(10);
        return ctx.get();
      }),
      ctx.run('B', async () => {
        await delay(5);
        return ctx.get();
      }),
      ctx.run('C', async () => {
        await delay(15);
        return ctx.get();
      })
    ]);

    expect(results).toEqual(['A', 'B', 'C']);
  });

  it('should maintain context after Promise.all resolves', async () => {
    await ctx.run('outer', async () => {
      expect(ctx.get()).toBe('outer');

      const results = await Promise.all([
        ctx.run('inner-1', async () => {
          await delay(5);
          return ctx.get();
        }),
        ctx.run('inner-2', async () => {
          await delay(5);
          return ctx.get();
        })
      ]);

      expect(ctx.get()).toBe('outer');
      expect(results).toEqual(['inner-1', 'inner-2']);
    });
  });

  it('should handle nested Promise.all with different contexts', async () => {
    await ctx.run('root', async () => {
      const outerResults = await Promise.all([
        ctx.run('branch-1', async () => {
          const innerResults = await Promise.all([
            ctx.run('leaf-1a', async () => {
              await delay(5);
              return ctx.get();
            }),
            ctx.run('leaf-1b', async () => {
              await delay(5);
              return ctx.get();
            })
          ]);
          return { branch: ctx.get(), leaves: innerResults };
        }),
        ctx.run('branch-2', async () => {
          await delay(5);
          return ctx.get();
        })
      ]);

      expect(outerResults[0].branch).toBe('branch-1');
      expect(outerResults[0].leaves).toEqual(['leaf-1a', 'leaf-1b']);
      expect(outerResults[1]).toBe('branch-2');
      expect(ctx.get()).toBe('root');
    });
  });
});

describe('Promise.race', () => {
  let ctx;

  beforeEach(() => {
    ctx = new AsyncVariable();
  });

  it('should maintain context of winning promise in Promise.race', async () => {
    const winner = await Promise.race([
      ctx.run('slow', async () => {
        await delay(20);
        return ctx.get();
      }),
      ctx.run('fast', async () => {
        await delay(5);
        return ctx.get();
      }),
      ctx.run('slowest', async () => {
        await delay(30);
        return ctx.get();
      })
    ]);

    expect(winner).toBe('fast');
  });

  it('should maintain outer context after Promise.race', async () => {
    await ctx.run('outer-race', async () => {
      expect(ctx.get()).toBe('outer-race');

      const winner = await Promise.race([
        ctx.run('racer-1', async () => {
          await delay(10);
          return ctx.get();
        }),
        ctx.run('racer-2', async () => {
          await delay(5);
          return ctx.get();
        })
      ]);

      expect(winner).toBe('racer-2');
      expect(ctx.get()).toBe('outer-race');
    });
  });

  it('should handle Promise.race with rejection', async () => {
    try {
      await ctx.run('race-reject', async () => {
        return Promise.race([
          ctx.run('reject-fast', async () => {
            await delay(5);
            throw new Error('fast rejection');
          }),
          ctx.run('resolve-slow', async () => {
            await delay(20);
            return ctx.get();
          })
        ]);
      });
      throw new Error('Should have thrown');
    } catch (error) {
      expect(error.message).toBe('fast rejection');
    }
  });
});

describe('Promise.allSettled', () => {
  let ctx;

  beforeEach(() => {
    ctx = new AsyncVariable();
  });

  it('should maintain context for all promises in Promise.allSettled', async () => {
    const results = await Promise.allSettled([
      ctx.run('success-1', async () => {
        await delay(5);
        return { status: 'fulfilled', ctx: ctx.get() };
      }),
      ctx.run('success-2', async () => {
        await delay(10);
        return { status: 'fulfilled', ctx: ctx.get() };
      })
    ]);

    expect(results[0].status).toBe('fulfilled');
    expect(results[0].value.ctx).toBe('success-1');
    expect(results[1].status).toBe('fulfilled');
    expect(results[1].value.ctx).toBe('success-2');
  });

  it('should handle mixed success and failure in Promise.allSettled', async () => {
    const results = await Promise.allSettled([
      ctx.run('success', async () => {
        await delay(5);
        return ctx.get();
      }),
      ctx.run('failure', async () => {
        await delay(5);
        throw new Error(`Failed in ${ctx.get()}`);
      }),
      ctx.run('success-2', async () => {
        await delay(5);
        return ctx.get();
      })
    ]);

    expect(results[0].status).toBe('fulfilled');
    expect(results[0].value).toBe('success');

    expect(results[1].status).toBe('rejected');
    expect(results[1].reason.message).toBe('Failed in failure');

    expect(results[2].status).toBe('fulfilled');
    expect(results[2].value).toBe('success-2');
  });

  it('should maintain outer context after Promise.allSettled', async () => {
    await ctx.run('outer-settled', async () => {
      expect(ctx.get()).toBe('outer-settled');

      const results = await Promise.allSettled([
        ctx.run('inner-1', async () => ctx.get()),
        ctx.run('inner-2', async () => {
          throw new Error('inner error');
        })
      ]);

      expect(ctx.get()).toBe('outer-settled');
      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('rejected');
    });
  });
});

describe('Promise.any', () => {
  let ctx;

  beforeEach(() => {
    ctx = new AsyncVariable();
  });

  it('should maintain context of first resolved promise in Promise.any', async () => {
    const winner = await Promise.any([
      ctx.run('reject-1', async () => {
        await delay(5);
        throw new Error('reject-1');
      }),
      ctx.run('resolve-first', async () => {
        await delay(10);
        return ctx.get();
      }),
      ctx.run('resolve-second', async () => {
        await delay(15);
        return ctx.get();
      })
    ]);

    expect(winner).toBe('resolve-first');
  });

  it('should handle all-rejected scenario in Promise.any', async () => {
    try {
      await ctx.run('all-reject', async () => {
        return Promise.any([
          ctx.run('reject-1', async () => {
            await delay(5);
            throw new Error('error-1');
          }),
          ctx.run('reject-2', async () => {
            await delay(10);
            throw new Error('error-2');
          }),
          ctx.run('reject-3', async () => {
            await delay(15);
            throw new Error('error-3');
          })
        ]);
      });
      throw new Error('Should have thrown');
    } catch (error) {
      expect(error.constructor.name).toBe('AggregateError');
    }
  });

  it('should maintain outer context after Promise.any resolution', async () => {
    await ctx.run('outer-any', async () => {
      expect(ctx.get()).toBe('outer-any');

      const winner = await Promise.any([
        ctx.run('any-1', async () => {
          await delay(20);
          return ctx.get();
        }),
        ctx.run('any-2', async () => {
          await delay(5);
          return ctx.get();
        })
      ]);

      expect(winner).toBe('any-2');
      expect(ctx.get()).toBe('outer-any');
    });
  });
});
