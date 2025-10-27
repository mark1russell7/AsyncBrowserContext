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
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
describe('Promise.all', () => {
  let ctx;
  beforeEach(() => {
    ctx = new AsyncVariable();
  });
  it('should maintain separate contexts for each promise in Promise.all', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    let results;
    try {
      results = await Promise.all([ctx.run('A', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        try {
          await delay(10);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        return ctx.get();
      }), ctx.run('B', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        try {
          await delay(5);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        return ctx.get();
      }), ctx.run('C', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        try {
          await delay(15);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        return ctx.get();
      })]);
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(results).toEqual(['A', 'B', 'C']);
  });
  it('should maintain context after Promise.all resolves', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    try {
      await ctx.run('outer', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        expect(ctx.get()).toBe('outer');
        let results;
        try {
          results = await Promise.all([ctx.run('inner-1', async () => {
            const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
            try {
              await delay(5);
            } finally {
              if (__asyncContext) __setAsyncContext(__asyncContext);
            }
            return ctx.get();
          }), ctx.run('inner-2', async () => {
            const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
            try {
              await delay(5);
            } finally {
              if (__asyncContext) __setAsyncContext(__asyncContext);
            }
            return ctx.get();
          })]);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        expect(ctx.get()).toBe('outer');
        expect(results).toEqual(['inner-1', 'inner-2']);
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  });
  it('should handle nested Promise.all with different contexts', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    try {
      await ctx.run('root', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        let outerResults;
        try {
          outerResults = await Promise.all([ctx.run('branch-1', async () => {
            const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
            let innerResults;
            try {
              innerResults = await Promise.all([ctx.run('leaf-1a', async () => {
                const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
                try {
                  await delay(5);
                } finally {
                  if (__asyncContext) __setAsyncContext(__asyncContext);
                }
                return ctx.get();
              }), ctx.run('leaf-1b', async () => {
                const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
                try {
                  await delay(5);
                } finally {
                  if (__asyncContext) __setAsyncContext(__asyncContext);
                }
                return ctx.get();
              })]);
            } finally {
              if (__asyncContext) __setAsyncContext(__asyncContext);
            }
            return {
              branch: ctx.get(),
              leaves: innerResults
            };
          }), ctx.run('branch-2', async () => {
            const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
            try {
              await delay(5);
            } finally {
              if (__asyncContext) __setAsyncContext(__asyncContext);
            }
            return ctx.get();
          })]);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        expect(outerResults[0].branch).toBe('branch-1');
        expect(outerResults[0].leaves).toEqual(['leaf-1a', 'leaf-1b']);
        expect(outerResults[1]).toBe('branch-2');
        expect(ctx.get()).toBe('root');
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  });
});
describe('Promise.race', () => {
  let ctx;
  beforeEach(() => {
    ctx = new AsyncVariable();
  });
  it('should maintain context of winning promise in Promise.race', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    let winner;
    try {
      winner = await Promise.race([ctx.run('slow', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        try {
          await delay(20);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        return ctx.get();
      }), ctx.run('fast', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        try {
          await delay(5);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        return ctx.get();
      }), ctx.run('slowest', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        try {
          await delay(30);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        return ctx.get();
      })]);
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(winner).toBe('fast');
  });
  it('should maintain outer context after Promise.race', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    try {
      await ctx.run('outer-race', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        expect(ctx.get()).toBe('outer-race');
        let winner;
        try {
          winner = await Promise.race([ctx.run('racer-1', async () => {
            const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
            try {
              await delay(10);
            } finally {
              if (__asyncContext) __setAsyncContext(__asyncContext);
            }
            return ctx.get();
          }), ctx.run('racer-2', async () => {
            const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
            try {
              await delay(5);
            } finally {
              if (__asyncContext) __setAsyncContext(__asyncContext);
            }
            return ctx.get();
          })]);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        expect(winner).toBe('racer-2');
        expect(ctx.get()).toBe('outer-race');
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  });
  it('should handle Promise.race with rejection', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    try {
      try {
        await ctx.run('race-reject', async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          return Promise.race([ctx.run('reject-fast', async () => {
            const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
            try {
              await delay(5);
            } finally {
              if (__asyncContext) __setAsyncContext(__asyncContext);
            }
            throw new Error('fast rejection');
          }), ctx.run('resolve-slow', async () => {
            const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
            try {
              await delay(20);
            } finally {
              if (__asyncContext) __setAsyncContext(__asyncContext);
            }
            return ctx.get();
          })]);
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
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
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    let results;
    try {
      results = await Promise.allSettled([ctx.run('success-1', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        try {
          await delay(5);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        return {
          status: 'fulfilled',
          ctx: ctx.get()
        };
      }), ctx.run('success-2', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        try {
          await delay(10);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        return {
          status: 'fulfilled',
          ctx: ctx.get()
        };
      })]);
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(results[0].status).toBe('fulfilled');
    expect(results[0].value.ctx).toBe('success-1');
    expect(results[1].status).toBe('fulfilled');
    expect(results[1].value.ctx).toBe('success-2');
  });
  it('should handle mixed success and failure in Promise.allSettled', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    let results;
    try {
      results = await Promise.allSettled([ctx.run('success', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        try {
          await delay(5);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        return ctx.get();
      }), ctx.run('failure', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        try {
          await delay(5);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        throw new Error(`Failed in ${ctx.get()}`);
      }), ctx.run('success-2', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        try {
          await delay(5);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        return ctx.get();
      })]);
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(results[0].status).toBe('fulfilled');
    expect(results[0].value).toBe('success');
    expect(results[1].status).toBe('rejected');
    expect(results[1].reason.message).toBe('Failed in failure');
    expect(results[2].status).toBe('fulfilled');
    expect(results[2].value).toBe('success-2');
  });
  it('should maintain outer context after Promise.allSettled', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    try {
      await ctx.run('outer-settled', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        expect(ctx.get()).toBe('outer-settled');
        let results;
        try {
          results = await Promise.allSettled([ctx.run('inner-1', async () => {
            const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
            return ctx.get();
          }), ctx.run('inner-2', async () => {
            const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
            throw new Error('inner error');
          })]);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        expect(ctx.get()).toBe('outer-settled');
        expect(results[0].status).toBe('fulfilled');
        expect(results[1].status).toBe('rejected');
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  });
});
describe('Promise.any', () => {
  let ctx;
  beforeEach(() => {
    ctx = new AsyncVariable();
  });
  it('should maintain context of first resolved promise in Promise.any', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    let winner;
    try {
      winner = await Promise.any([ctx.run('reject-1', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        try {
          await delay(5);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        throw new Error('reject-1');
      }), ctx.run('resolve-first', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        try {
          await delay(10);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        return ctx.get();
      }), ctx.run('resolve-second', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        try {
          await delay(15);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        return ctx.get();
      })]);
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(winner).toBe('resolve-first');
  });
  it('should handle all-rejected scenario in Promise.any', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    try {
      try {
        await ctx.run('all-reject', async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          return Promise.any([ctx.run('reject-1', async () => {
            const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
            try {
              await delay(5);
            } finally {
              if (__asyncContext) __setAsyncContext(__asyncContext);
            }
            throw new Error('error-1');
          }), ctx.run('reject-2', async () => {
            const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
            try {
              await delay(10);
            } finally {
              if (__asyncContext) __setAsyncContext(__asyncContext);
            }
            throw new Error('error-2');
          }), ctx.run('reject-3', async () => {
            const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
            try {
              await delay(15);
            } finally {
              if (__asyncContext) __setAsyncContext(__asyncContext);
            }
            throw new Error('error-3');
          })]);
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      throw new Error('Should have thrown');
    } catch (error) {
      expect(error.constructor.name).toBe('AggregateError');
    }
  });
  it('should maintain outer context after Promise.any resolution', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    try {
      await ctx.run('outer-any', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        expect(ctx.get()).toBe('outer-any');
        let winner;
        try {
          winner = await Promise.any([ctx.run('any-1', async () => {
            const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
            try {
              await delay(20);
            } finally {
              if (__asyncContext) __setAsyncContext(__asyncContext);
            }
            return ctx.get();
          }), ctx.run('any-2', async () => {
            const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
            try {
              await delay(5);
            } finally {
              if (__asyncContext) __setAsyncContext(__asyncContext);
            }
            return ctx.get();
          })]);
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        expect(winner).toBe('any-2');
        expect(ctx.get()).toBe('outer-any');
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  });
});
