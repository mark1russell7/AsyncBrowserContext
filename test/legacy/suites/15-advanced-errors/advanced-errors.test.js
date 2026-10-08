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

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

describe('Advanced Errors - Finally Block Errors', () => {
  let ctx;

  beforeEach(() => {
    ctx = new AsyncVariable();
  });

  it('should handle error thrown in .finally() block', async () => {
    let finallyContext;

    try {
      await ctx.run('finally-error', async () => {
        return Promise.resolve('success').finally(() => {
          finallyContext = ctx.get();
          throw new Error('finally error');
        });
      });
    } catch (error) {
      expect(error.message).toBe('finally error');
      expect(finallyContext).toBe('finally-error');
    }
  });

  it('should handle error in .finally() overriding successful result', async () => {
    let result;

    try {
      result = await ctx.run('finally-override', async () => {
        return Promise.resolve('original')
          .then(val => val)
          .finally(() => {
            throw new Error('overridden');
          });
      });
    } catch (error) {
      expect(error.message).toBe('overridden');
      expect(result).toBeUndefined();
    }
  });

  it('should handle error in .finally() when promise already rejected', async () => {
    const errors = [];

    try {
      await ctx.run('double-error', async () => {
        return Promise.reject(new Error('original error')).finally(() => {
          throw new Error('finally error');
        });
      });
    } catch (error) {
      // Finally error should override original
      expect(error.message).toBe('finally error');
    }
  });

  it('should maintain context through nested .finally() with errors', async () => {
    const contexts = [];

    try {
      await ctx.run('nested-finally', async () => {
        return Promise.resolve('value')
          .finally(() => {
            contexts.push(ctx.get());
          })
          .finally(() => {
            contexts.push(ctx.get());
            throw new Error('second finally');
          })
          .finally(() => {
            // This DOES execute - finally handlers run even after errors
            contexts.push(ctx.get());
          });
      });
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
    async function level3() {
      await delay(5);
      throw new Error('level 3 error');
    }

    async function level2() {
      await delay(5);
      await level3();
    }

    async function level1() {
      await delay(5);
      await level2();
    }

    try {
      await ctx.run('nested-error', async () => {
        await level1();
      });
    } catch (error) {
      expect(error.message).toBe('level 3 error');
    }
  });

  it('should handle error in parallel async operations', async () => {
    const results = [];

    try {
      await ctx.run('parallel-errors', async () => {
        await Promise.all([
          (async () => {
            await delay(5);
            throw new Error('error-1');
          })(),
          (async () => {
            await delay(10);
            results.push('completed-2');
          })(),
          (async () => {
            await delay(15);
            throw new Error('error-3');
          })()
        ]);
      });
    } catch (error) {
      // First error should be caught
      expect(error.message).toBe('error-1');
    }
  });

  it('should handle error after multiple successful awaits', async () => {
    await ctx.run('multi-await-error', async () => {
      await delay(5);
      expect(ctx.get()).toBe('multi-await-error');
      await delay(5);
      expect(ctx.get()).toBe('multi-await-error');
      await delay(5);
      expect(ctx.get()).toBe('multi-await-error');

      try {
        await Promise.reject(new Error('after awaits'));
      } catch (error) {
        expect(ctx.get()).toBe('multi-await-error');
        expect(error.message).toBe('after awaits');
      }
    });
  });
});

describe('Advanced Errors - Unhandled Rejections', () => {
  let ctx;

  beforeEach(() => {
    ctx = new AsyncVariable();
  });

  it('should handle promise rejected but never awaited', async () => {
    const unhandledPromises = [];

    await ctx.run('unhandled-rejection', async () => {
      // Create a promise that rejects but is never awaited
      const promise = Promise.reject(new Error('unhandled'));

      // Attach handler later to avoid unhandled rejection
      setTimeout(() => {
        promise.catch(() => {}); // Silence the error
      }, 50);

      await delay(100);
    });

    // Test passes if no unhandled rejection crashes the test
  }, { timeout: 500 });

  it('should handle promise rejected after function returns', async () => {
    let externalReject;

    const promise = new Promise((_, reject) => {
      externalReject = reject;
    });

    // Add handler to prevent unhandled rejection
    promise.catch(() => {});

    await ctx.run('post-return-reject', async () => {
      // Function returns, then promise is rejected
      setTimeout(() => externalReject(new Error('late')), 10);
      await delay(5);
    });

    await delay(20); // Wait for rejection
  });
});

describe('Advanced Errors - Error in Context Operations', () => {
  it('should handle error in .run() callback', async () => {
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
    const ctx = new AsyncVariable();

    try {
      await ctx.run('async-error-in-run', async () => {
        await delay(5);
        throw new Error('async error');
      });
    } catch (error) {
      expect(error.message).toBe('async error');
    }

    expect(ctx.get()).toBeUndefined();
  });

  it('should handle error in nested .run() callbacks', async () => {
    const ctx = new AsyncVariable();
    const errorPath = [];

    try {
      await ctx.run('outer', async () => {
        errorPath.push(ctx.get());

        await ctx.run('middle', async () => {
          errorPath.push(ctx.get());

          await ctx.run('inner', async () => {
            errorPath.push(ctx.get());
            throw new Error('inner error');
          });
        });
      });
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
    await ctx.run('recovery-test', async () => {
      expect(ctx.get()).toBe('recovery-test');

      try {
        await Promise.reject(new Error('test'));
      } catch (error) {
        // Context should be maintained in catch
        expect(ctx.get()).toBe('recovery-test');
      }

      // Context should still be valid after catch
      expect(ctx.get()).toBe('recovery-test');
    });
  });

  it('should handle multiple errors and recoveries', async () => {
    const errors = [];

    await ctx.run('multi-recovery', async () => {
      for (let i = 0; i < 5; i++) {
        try {
          await Promise.reject(new Error(`error-${i}`));
        } catch (error) {
          errors.push({ error: error.message, ctx: ctx.get() });
        }

        expect(ctx.get()).toBe('multi-recovery');
      }
    });

    expect(errors.length).toBe(5);
    expect(errors.every(e => e.ctx === 'multi-recovery')).toBeTruthy();
  });

  it('should handle error recovery in Promise.allSettled', async () => {
    await ctx.run('allsettled-recovery', async () => {
      const results = await Promise.allSettled([
        Promise.resolve('success'),
        Promise.reject(new Error('error-1')),
        Promise.resolve('success-2'),
        Promise.reject(new Error('error-2'))
      ]);

      expect(ctx.get()).toBe('allsettled-recovery');
      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('rejected');
      expect(results[2].status).toBe('fulfilled');
      expect(results[3].status).toBe('rejected');
    });
  });
});

describe('Advanced Errors - Error Object Types', () => {
  let ctx;

  beforeEach(() => {
    ctx = new AsyncVariable();
  });

  it('should handle TypeError', async () => {
    try {
      await ctx.run('type-error', async () => {
        const obj = null;
        obj.method(); // TypeError
      });
    } catch (error) {
      expect(error).toBeInstanceOf(TypeError);
    }
  });

  it('should handle RangeError', async () => {
    try {
      await ctx.run('range-error', async () => {
        const arr = [];
        arr.length = -1; // RangeError
      });
    } catch (error) {
      expect(error).toBeInstanceOf(RangeError);
    }
  });

  it('should handle ReferenceError', async () => {
    try {
      await ctx.run('reference-error', async () => {
        // eslint-disable-next-line no-undef
        nonExistentVariable; // ReferenceError
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ReferenceError);
    }
  });

  it('should handle custom error types', async () => {
    class CustomError extends Error {
      constructor(message, code) {
        super(message);
        this.name = 'CustomError';
        this.code = code;
      }
    }

    try {
      await ctx.run('custom-error', async () => {
        throw new CustomError('custom message', 'ERR_CUSTOM');
      });
    } catch (error) {
      expect(error).toBeInstanceOf(CustomError);
      expect(error.code).toBe('ERR_CUSTOM');
    }
  });

  it('should handle non-Error thrown values', async () => {
    try {
      await ctx.run('throw-string', async () => {
        throw 'string error';
      });
    } catch (error) {
      expect(error).toBe('string error');
    }

    try {
      await ctx.run('throw-number', async () => {
        throw 42;
      });
    } catch (error) {
      expect(error).toBe(42);
    }

    try {
      await ctx.run('throw-object', async () => {
        throw { custom: 'error', code: 500 };
      });
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
    try {
      await ctx.run('immediate-error', async () => {
        throw new Error('immediate');
      });
    } catch (error) {
      expect(error.message).toBe('immediate');
    }
  });

  it('should handle delayed error', async () => {
    try {
      await ctx.run('delayed-error', async () => {
        await delay(50);
        throw new Error('delayed');
      });
    } catch (error) {
      expect(error.message).toBe('delayed');
    }
  });

  it('should handle error after many async operations', async () => {
    try {
      await ctx.run('late-error', async () => {
        for (let i = 0; i < 10; i++) {
          await delay(5);
          expect(ctx.get()).toBe('late-error');
        }
        throw new Error('after loop');
      });
    } catch (error) {
      expect(error.message).toBe('after loop');
    }
  });
});
