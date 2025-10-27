/**
 * Advanced Error Scenarios Tests (Suite 15)
 *
 * Tests complex error handling edge cases:
 * - Errors in .finally() blocks
 * - Errors in hooks
 * - Unhandled promise rejections
 * - Error propagation edge cases
 */

import { describe, it, expect, beforeEach, afterEach } from '../../framework/test-runner.js';
import { AsyncVariable } from '../../../dist/context.js';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
describe('Advanced Errors - Finally Block Errors', () => {
  let ctx;
  beforeEach(() => {
    ctx = new AsyncVariable();
  });
  it('should handle error thrown in .finally() block', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    let finallyContext;
    try {
      try {
        await ctx.run('finally-error', async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          return Promise.resolve('success').finally(() => {
            finallyContext = ctx.get();
            throw new Error('finally error');
          });
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
    } catch (error) {
      expect(error.message).toBe('finally error');
      expect(finallyContext).toBe('finally-error');
    }
  });
  it('should handle error in .finally() overriding successful result', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    let result;
    try {
      try {
        result = await ctx.run('finally-override', async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          return Promise.resolve('original').then(val => val).finally(() => {
            throw new Error('overridden');
          });
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
    } catch (error) {
      expect(error.message).toBe('overridden');
      expect(result).toBeUndefined();
    }
  });
  it('should handle error in .finally() when promise already rejected', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const errors = [];
    try {
      try {
        await ctx.run('double-error', async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          return Promise.reject(new Error('original error')).finally(() => {
            throw new Error('finally error');
          });
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
    } catch (error) {
      // Finally error should override original
      expect(error.message).toBe('finally error');
    }
  });
  it('should maintain context through nested .finally() with errors', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const contexts = [];
    try {
      try {
        await ctx.run('nested-finally', async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          return Promise.resolve('value').finally(() => {
            contexts.push(ctx.get());
          }).finally(() => {
            contexts.push(ctx.get());
            throw new Error('second finally');
          }).finally(() => {
            // This DOES execute - finally handlers run even after errors
            contexts.push(ctx.get());
          });
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
    } catch (error) {
      // All three finally blocks execute and maintain context
      expect(contexts).toEqual(['nested-finally', 'nested-finally', 'nested-finally']);
      expect(error.message).toBe('second finally');
    }
  });
});
describe('Advanced Errors - Async/Await Error Propagation', () => {
  let ctx;
  beforeEach(() => {
    ctx = new AsyncVariable();
  });
  it('should handle error in nested async function', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    async function level3() {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      try {
        await delay(5);
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      throw new Error('level 3 error');
    }
    async function level2() {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      try {
        await delay(5);
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      try {
        await level3();
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
    }
    async function level1() {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      try {
        await delay(5);
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      try {
        await level2();
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
    }
    try {
      try {
        await ctx.run('nested-error', async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          try {
            await level1();
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
    } catch (error) {
      expect(error.message).toBe('level 3 error');
    }
  });
  it('should handle error in parallel async operations', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const results = [];
    try {
      try {
        await ctx.run('parallel-errors', async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          try {
            await Promise.all([(async () => {
              const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
              try {
                await delay(5);
              } finally {
                if (__asyncContext) __setAsyncContext(__asyncContext);
              }
              throw new Error('error-1');
            })(), (async () => {
              const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
              try {
                await delay(10);
              } finally {
                if (__asyncContext) __setAsyncContext(__asyncContext);
              }
              results.push('completed-2');
            })(), (async () => {
              const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
              try {
                await delay(15);
              } finally {
                if (__asyncContext) __setAsyncContext(__asyncContext);
              }
              throw new Error('error-3');
            })()]);
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
    } catch (error) {
      // First error should be caught
      expect(error.message).toBe('error-1');
    }
  });
  it('should handle error after multiple successful awaits', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    try {
      await ctx.run('multi-await-error', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        try {
          await delay(5);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        expect(ctx.get()).toBe('multi-await-error');
        try {
          await delay(5);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        expect(ctx.get()).toBe('multi-await-error');
        try {
          await delay(5);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        expect(ctx.get()).toBe('multi-await-error');
        try {
          try {
            await Promise.reject(new Error('after awaits'));
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
        } catch (error) {
          expect(ctx.get()).toBe('multi-await-error');
          expect(error.message).toBe('after awaits');
        }
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  });
});
describe('Advanced Errors - Unhandled Rejections', () => {
  let ctx;
  beforeEach(() => {
    ctx = new AsyncVariable();
  });
  it('should handle promise rejected but never awaited', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const unhandledPromises = [];
    try {
      await ctx.run('unhandled-rejection', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        // Create a promise that rejects but is never awaited
        const promise = Promise.reject(new Error('unhandled'));

        // Attach handler later to avoid unhandled rejection
        setTimeout(() => {
          promise.catch(() => {}); // Silence the error
        }, 50);
        try {
          await delay(100);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    } // Test passes if no unhandled rejection crashes the test
  }, {
    timeout: 500
  });
  it('should handle promise rejected after function returns', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    let externalReject;
    const promise = new Promise((_, reject) => {
      externalReject = reject;
    });

    // Add handler to prevent unhandled rejection
    promise.catch(() => {});
    try {
      await ctx.run('post-return-reject', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        // Function returns, then promise is rejected
        setTimeout(() => externalReject(new Error('late')), 10);
        try {
          await delay(5);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    try {
      await delay(20);
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    } // Wait for rejection
  });
});
describe('Advanced Errors - Error in Context Operations', () => {
  it('should handle error in .run() callback', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    try {
      ctx.run('error-in-run', () => {
        throw new Error('synchronous error');
      });
    } catch (error) {
      expect(error.message).toBe('synchronous error');
    }

    // Context should be cleaned up
    expect(ctx.get()).toBeUndefined();
  });
  it('should handle async error in .run() callback', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    try {
      try {
        await ctx.run('async-error-in-run', async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          try {
            await delay(5);
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          throw new Error('async error');
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
    } catch (error) {
      expect(error.message).toBe('async error');
    }
    expect(ctx.get()).toBeUndefined();
  });
  it('should handle error in nested .run() callbacks', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const errorPath = [];
    try {
      try {
        await ctx.run('outer', async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          errorPath.push(ctx.get());
          try {
            await ctx.run('middle', async () => {
              const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
              errorPath.push(ctx.get());
              try {
                await ctx.run('inner', async () => {
                  const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
                  errorPath.push(ctx.get());
                  throw new Error('inner error');
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
    } catch (error) {
      expect(error.message).toBe('inner error');
      expect(errorPath).toEqual(['outer', 'middle', 'inner']);
    }
  });
});
describe('Advanced Errors - Error Recovery', () => {
  let ctx;
  beforeEach(() => {
    ctx = new AsyncVariable();
  });
  it('should recover context after error in try/catch', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    try {
      await ctx.run('recovery-test', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        expect(ctx.get()).toBe('recovery-test');
        try {
          try {
            await Promise.reject(new Error('test'));
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
        } catch (error) {
          // Context should be maintained in catch
          expect(ctx.get()).toBe('recovery-test');
        }

        // Context should still be valid after catch
        expect(ctx.get()).toBe('recovery-test');
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  });
  it('should handle multiple errors and recoveries', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const errors = [];
    try {
      await ctx.run('multi-recovery', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        for (let i = 0; i < 5; i++) {
          try {
            try {
              await Promise.reject(new Error(`error-${i}`));
            } finally {
              if (__asyncContext) __setAsyncContext(__asyncContext);
            }
          } catch (error) {
            errors.push({
              error: error.message,
              ctx: ctx.get()
            });
          }
          expect(ctx.get()).toBe('multi-recovery');
        }
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(errors.length).toBe(5);
    expect(errors.every(e => e.ctx === 'multi-recovery')).toBeTruthy();
  });
  it('should handle error recovery in Promise.allSettled', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    try {
      await ctx.run('allsettled-recovery', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        let results;
        try {
          results = await Promise.allSettled([Promise.resolve('success'), Promise.reject(new Error('error-1')), Promise.resolve('success-2'), Promise.reject(new Error('error-2'))]);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        expect(ctx.get()).toBe('allsettled-recovery');
        expect(results[0].status).toBe('fulfilled');
        expect(results[1].status).toBe('rejected');
        expect(results[2].status).toBe('fulfilled');
        expect(results[3].status).toBe('rejected');
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  });
});
describe('Advanced Errors - Error Object Types', () => {
  let ctx;
  beforeEach(() => {
    ctx = new AsyncVariable();
  });
  it('should handle TypeError', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    try {
      try {
        await ctx.run('type-error', async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          const obj = null;
          obj.method(); // TypeError
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
    } catch (error) {
      expect(error).toBeInstanceOf(TypeError);
    }
  });
  it('should handle RangeError', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    try {
      try {
        await ctx.run('range-error', async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          const arr = [];
          arr.length = -1; // RangeError
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
    } catch (error) {
      expect(error).toBeInstanceOf(RangeError);
    }
  });
  it('should handle ReferenceError', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    try {
      try {
        await ctx.run('reference-error', async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          // eslint-disable-next-line no-undef
          nonExistentVariable; // ReferenceError
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
    } catch (error) {
      expect(error).toBeInstanceOf(ReferenceError);
    }
  });
  it('should handle custom error types', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    class CustomError extends Error {
      constructor(message, code) {
        super(message);
        this.name = 'CustomError';
        this.code = code;
      }
    }
    try {
      try {
        await ctx.run('custom-error', async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          throw new CustomError('custom message', 'ERR_CUSTOM');
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
    } catch (error) {
      expect(error).toBeInstanceOf(CustomError);
      expect(error.code).toBe('ERR_CUSTOM');
    }
  });
  it('should handle non-Error thrown values', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    try {
      try {
        await ctx.run('throw-string', async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          throw 'string error';
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
    } catch (error) {
      expect(error).toBe('string error');
    }
    try {
      try {
        await ctx.run('throw-number', async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          throw 42;
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
    } catch (error) {
      expect(error).toBe(42);
    }
    try {
      try {
        await ctx.run('throw-object', async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          throw {
            custom: 'error',
            code: 500
          };
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
    } catch (error) {
      expect(error.custom).toBe('error');
      expect(error.code).toBe(500);
    }
  });
});
describe('Advanced Errors - Error Timing', () => {
  let ctx;
  beforeEach(() => {
    ctx = new AsyncVariable();
  });
  it('should handle immediate error (synchronous)', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    try {
      try {
        await ctx.run('immediate-error', async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          throw new Error('immediate');
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
    } catch (error) {
      expect(error.message).toBe('immediate');
    }
  });
  it('should handle delayed error', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    try {
      try {
        await ctx.run('delayed-error', async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          try {
            await delay(50);
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          throw new Error('delayed');
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
    } catch (error) {
      expect(error.message).toBe('delayed');
    }
  });
  it('should handle error after many async operations', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    try {
      try {
        await ctx.run('late-error', async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          for (let i = 0; i < 10; i++) {
            try {
              await delay(5);
            } finally {
              if (__asyncContext) __setAsyncContext(__asyncContext);
            }
            expect(ctx.get()).toBe('late-error');
          }
          throw new Error('after loop');
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
    } catch (error) {
      expect(error.message).toBe('after loop');
    }
  });
});
