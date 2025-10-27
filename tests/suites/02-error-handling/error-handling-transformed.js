/**
 * Error Handling Tests (Suite 02)
 *
 * Tests error propagation and context handling in error scenarios:
 * - Context in .catch() handlers
 * - Context in .finally() blocks
 * - Context when async functions throw
 * - Unhandled promise rejections
 * - Error propagation through nested contexts
 */

import { describe, it, expect, beforeEach } from '../../framework/test-runner.js';
import { AsyncVariable } from '../../../dist/context.js';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
describe('Error Handling - Catch Blocks', () => {
  let ctx;
  beforeEach(() => {
    ctx = new AsyncVariable();
  });
  it('should maintain context in .catch() handler', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    let result;
    try {
      result = await ctx.run('catch-test', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        return Promise.reject(new Error('test error')).catch(error => {
          const val = ctx.get();
          expect(val).toBe('catch-test');
          expect(error.message).toBe('test error');
          return 'caught';
        });
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(result).toBe('caught');
  });
  it('should maintain context after caught error', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    try {
      await ctx.run('outer-ctx', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        try {
          try {
            await ctx.run('inner-ctx', async () => {
              const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
              expect(ctx.get()).toBe('inner-ctx');
              throw new Error('inner error');
            });
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
        } catch (error) {
          // Should be back in outer context
          expect(ctx.get()).toBe('outer-ctx');
          expect(error.message).toBe('inner error');
        }
        expect(ctx.get()).toBe('outer-ctx');
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  });
  it('should handle nested .run() inside catch block', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    try {
      await ctx.run('outer', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        try {
          throw new Error('test');
        } catch (error) {
          expect(ctx.get()).toBe('outer');
          try {
            await ctx.run('inner-catch', async () => {
              const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
              expect(ctx.get()).toBe('inner-catch');
              try {
                await delay(5);
              } finally {
                if (__asyncContext) __setAsyncContext(__asyncContext);
              }
              expect(ctx.get()).toBe('inner-catch');
            });
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          expect(ctx.get()).toBe('outer');
        }
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  });
});
describe('Error Handling - Finally Blocks', () => {
  let ctx;
  beforeEach(() => {
    ctx = new AsyncVariable();
  });
  it('should maintain context in .finally() handler', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const results = [];
    try {
      await ctx.run('finally-test', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        return Promise.resolve('success').finally(() => {
          const val = ctx.get();
          results.push(val);
          expect(val).toBe('finally-test');
        });
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(results).toContain('finally-test');
  });
  it('should maintain context in .finally() after rejection', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const results = [];
    try {
      try {
        await ctx.run('finally-reject', async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          return Promise.reject(new Error('test')).finally(() => {
            const val = ctx.get();
            results.push(val);
            expect(val).toBe('finally-reject');
          });
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
    } catch (error) {
      expect(error.message).toBe('test');
    }
    expect(results).toContain('finally-reject');
  });
  it('should maintain context when .finally() throws', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    try {
      try {
        await ctx.run('finally-throw', async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          return Promise.resolve('success').finally(() => {
            expect(ctx.get()).toBe('finally-throw');
            throw new Error('finally error');
          });
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      throw new Error('Should have thrown');
    } catch (error) {
      expect(error.message).toBe('finally error');
    }
  });
});
describe('Error Handling - Async Function Throws', () => {
  let ctx;
  beforeEach(() => {
    ctx = new AsyncVariable();
  });
  it('should maintain context when async function throws immediately', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    try {
      try {
        await ctx.run('throw-immediate', async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          expect(ctx.get()).toBe('throw-immediate');
          throw new Error('immediate throw');
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      throw new Error('Should have thrown');
    } catch (error) {
      expect(error.message).toBe('immediate throw');
    }
  });
  it('should maintain context when async function throws after await', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    try {
      try {
        await ctx.run('throw-after-await', async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          expect(ctx.get()).toBe('throw-after-await');
          try {
            await delay(5);
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          expect(ctx.get()).toBe('throw-after-await');
          throw new Error('throw after await');
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      throw new Error('Should have thrown');
    } catch (error) {
      expect(error.message).toBe('throw after await');
    }
  });
  it('should maintain context through multiple awaits before throw', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    try {
      try {
        await ctx.run('multi-await-throw', async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          expect(ctx.get()).toBe('multi-await-throw');
          try {
            await delay(5);
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          expect(ctx.get()).toBe('multi-await-throw');
          try {
            await delay(5);
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          expect(ctx.get()).toBe('multi-await-throw');
          throw new Error('throw after multiple awaits');
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      throw new Error('Should have thrown');
    } catch (error) {
      expect(error.message).toBe('throw after multiple awaits');
    }
  });
  it('should maintain context in calling code after async function throws', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    try {
      await ctx.run('caller-ctx', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        expect(ctx.get()).toBe('caller-ctx');
        try {
          try {
            await ctx.run('thrower-ctx', async () => {
              const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
              expect(ctx.get()).toBe('thrower-ctx');
              throw new Error('inner throw');
            });
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
        } catch (error) {
          // Back in caller context
          expect(ctx.get()).toBe('caller-ctx');
          expect(error.message).toBe('inner throw');
        }
        expect(ctx.get()).toBe('caller-ctx');
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  });
});
describe('Error Handling - Promise Rejection Propagation', () => {
  let ctx;
  beforeEach(() => {
    ctx = new AsyncVariable();
  });
  it('should propagate context through Promise.all rejection', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    try {
      try {
        await ctx.run('promise-all-reject', async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          return Promise.all([Promise.resolve(1), Promise.reject(new Error('rejected')), Promise.resolve(3)]).catch(error => {
            expect(ctx.get()).toBe('promise-all-reject');
            throw error; // Re-throw for outer catch
          });
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      throw new Error('Should have thrown');
    } catch (error) {
      expect(error.message).toBe('rejected');
    }
  });
  it('should maintain context through nested .run() with errors', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    try {
      await ctx.run('level-1', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        expect(ctx.get()).toBe('level-1');
        try {
          try {
            await ctx.run('level-2', async () => {
              const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
              expect(ctx.get()).toBe('level-2');
              try {
                try {
                  await ctx.run('level-3', async () => {
                    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
                    expect(ctx.get()).toBe('level-3');
                    throw new Error('level-3 error');
                  });
                } finally {
                  if (__asyncContext) __setAsyncContext(__asyncContext);
                }
              } catch (error) {
                expect(ctx.get()).toBe('level-2');
                expect(error.message).toBe('level-3 error');
                throw new Error('level-2 error');
              }
            });
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
        } catch (error) {
          expect(ctx.get()).toBe('level-1');
          expect(error.message).toBe('level-2 error');
        }
        expect(ctx.get()).toBe('level-1');
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  });
  it('should handle errors in Promise.then chains', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    try {
      try {
        await ctx.run('then-chain-error', async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          return Promise.resolve(1).then(n => {
            expect(ctx.get()).toBe('then-chain-error');
            return n * 2;
          }).then(n => {
            expect(ctx.get()).toBe('then-chain-error');
            throw new Error('then chain error');
          }).then(n => {
            throw new Error('Should not reach here');
          });
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      throw new Error('Should have thrown');
    } catch (error) {
      expect(error.message).toBe('then chain error');
    }
  });
  it('should maintain context when error bubbles through multiple contexts', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const errorPath = [];
    try {
      try {
        await ctx.run('ctx-A', async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          errorPath.push(ctx.get());
          try {
            await ctx.run('ctx-B', async () => {
              const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
              errorPath.push(ctx.get());
              try {
                await ctx.run('ctx-C', async () => {
                  const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
                  errorPath.push(ctx.get());
                  throw new Error('bubble error');
                });
              } finally {
                if (__asyncContext) __setAsyncContext(__asyncContext);
              }
            });
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      throw new Error('Should have thrown');
    } catch (error) {
      expect(error.message).toBe('bubble error');
      expect(errorPath).toEqual(['ctx-A', 'ctx-B', 'ctx-C']);
    }
  });
  it('should handle concurrent errors in Promise.all', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const errors = [];
    try {
      try {
        await ctx.run('concurrent-errors', async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          return Promise.all([ctx.run('err-1', async () => {
            const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
            try {
              await delay(5);
            } finally {
              if (__asyncContext) __setAsyncContext(__asyncContext);
            }
            throw new Error('error-1');
          }).catch(e => {
            errors.push({
              ctx: ctx.get(),
              error: e.message
            });
            throw e;
          }), ctx.run('err-2', async () => {
            const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
            try {
              await delay(10);
            } finally {
              if (__asyncContext) __setAsyncContext(__asyncContext);
            }
            throw new Error('error-2');
          }).catch(e => {
            errors.push({
              ctx: ctx.get(),
              error: e.message
            });
            throw e;
          })]);
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      throw new Error('Should have thrown');
    } catch (error) {
      // At least one error should have been caught
      expect(errors.length).toBe(1);
      // .catch() handler runs in the context of the promise that rejected
      expect(errors[0].ctx).toBe('err-1');
    }
  });
});
