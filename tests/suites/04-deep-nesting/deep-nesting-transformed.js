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
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
describe('Deep Nesting - Multi-level', () => {
  it('should handle 3-level nesting', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const path = [];
    try {
      await ctx.run('L1', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        path.push(ctx.get());
        expect(ctx.get()).toBe('L1');
        try {
          await ctx.run('L2', async () => {
            const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
            path.push(ctx.get());
            expect(ctx.get()).toBe('L2');
            try {
              await ctx.run('L3', async () => {
                const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
                path.push(ctx.get());
                expect(ctx.get()).toBe('L3');
                try {
                  await delay(5);
                } finally {
                  if (__asyncContext) __setAsyncContext(__asyncContext);
                }
                expect(ctx.get()).toBe('L3');
              });
            } finally {
              if (__asyncContext) __setAsyncContext(__asyncContext);
            }
            expect(ctx.get()).toBe('L2');
          });
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        expect(ctx.get()).toBe('L1');
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(path).toEqual(['L1', 'L2', 'L3']);
  });
  it('should handle 5-level nesting', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const path = [];
    try {
      await ctx.run('L1', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        path.push(ctx.get());
        try {
          await ctx.run('L2', async () => {
            const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
            path.push(ctx.get());
            try {
              await ctx.run('L3', async () => {
                const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
                path.push(ctx.get());
                try {
                  await ctx.run('L4', async () => {
                    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
                    path.push(ctx.get());
                    try {
                      await ctx.run('L5', async () => {
                        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
                        path.push(ctx.get());
                        expect(ctx.get()).toBe('L5');
                        try {
                          await delay(5);
                        } finally {
                          if (__asyncContext) __setAsyncContext(__asyncContext);
                        }
                        expect(ctx.get()).toBe('L5');
                      });
                    } finally {
                      if (__asyncContext) __setAsyncContext(__asyncContext);
                    }
                    expect(ctx.get()).toBe('L4');
                  });
                } finally {
                  if (__asyncContext) __setAsyncContext(__asyncContext);
                }
                expect(ctx.get()).toBe('L3');
              });
            } finally {
              if (__asyncContext) __setAsyncContext(__asyncContext);
            }
            expect(ctx.get()).toBe('L2');
          });
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        expect(ctx.get()).toBe('L1');
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(path).toEqual(['L1', 'L2', 'L3', 'L4', 'L5']);
  });
  it('should handle 10-level deep nesting', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    let depth = 0;
    async function nestLevel(level) {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      if (level > 10) return;
      try {
        await ctx.run(`L${level}`, async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          depth = Math.max(depth, level);
          expect(ctx.get()).toBe(`L${level}`);
          try {
            await delay(1);
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          expect(ctx.get()).toBe(`L${level}`);
          try {
            await nestLevel(level + 1);
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          expect(ctx.get()).toBe(`L${level}`);
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
    }
    try {
      await nestLevel(1);
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(depth).toBe(10);
  });
});
describe('Deep Nesting - Mixed Patterns', () => {
  it('should handle .run() → .then() → .run() pattern', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const sequence = [];
    try {
      await ctx.run('outer', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        sequence.push(ctx.get());
        expect(ctx.get()).toBe('outer');
        try {
          await Promise.resolve().then(async () => {
            const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
            sequence.push(ctx.get());
            expect(ctx.get()).toBe('outer');
            try {
              await ctx.run('inner', async () => {
                const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
                sequence.push(ctx.get());
                expect(ctx.get()).toBe('inner');
                try {
                  await delay(5);
                } finally {
                  if (__asyncContext) __setAsyncContext(__asyncContext);
                }
                expect(ctx.get()).toBe('inner');
              });
            } finally {
              if (__asyncContext) __setAsyncContext(__asyncContext);
            }
            expect(ctx.get()).toBe('outer');
          });
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        expect(ctx.get()).toBe('outer');
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(sequence).toEqual(['outer', 'outer', 'inner']);
  });
  it('should handle .run() → async/await → .run() pattern', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    try {
      await ctx.run('level-1', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        expect(ctx.get()).toBe('level-1');
        const promise = async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          expect(ctx.get()).toBe('level-1');
          try {
            await delay(5);
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          expect(ctx.get()).toBe('level-1');
          try {
            await ctx.run('level-2', async () => {
              const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
              expect(ctx.get()).toBe('level-2');
              try {
                await delay(5);
              } finally {
                if (__asyncContext) __setAsyncContext(__asyncContext);
              }
              expect(ctx.get()).toBe('level-2');
            });
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          expect(ctx.get()).toBe('level-1');
        };
        try {
          await promise();
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        expect(ctx.get()).toBe('level-1');
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  });
  it('should handle .then() → .run() → .then() pattern', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    try {
      await ctx.run('root', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        let result;
        try {
          result = await Promise.resolve('start').then(async val => {
            const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
            expect(ctx.get()).toBe('root');
            try {
              await ctx.run('nested', async () => {
                const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
                expect(ctx.get()).toBe('nested');
                try {
                  await delay(5);
                } finally {
                  if (__asyncContext) __setAsyncContext(__asyncContext);
                }
                expect(ctx.get()).toBe('nested');
              });
            } finally {
              if (__asyncContext) __setAsyncContext(__asyncContext);
            }
            expect(ctx.get()).toBe('root');
            return val + '-middle';
          }).then(async val => {
            const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
            expect(ctx.get()).toBe('root');
            try {
              await delay(5);
            } finally {
              if (__asyncContext) __setAsyncContext(__asyncContext);
            }
            return val + '-end';
          });
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        expect(result).toBe('start-middle-end');
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  });
  it('should handle complex mixed nesting with multiple branches', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    try {
      await ctx.run('root', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        // Branch 1
        try {
          await Promise.resolve().then(async () => {
            const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
            try {
              await ctx.run('branch-1', async () => {
                const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
                expect(ctx.get()).toBe('branch-1');
                try {
                  await ctx.run('branch-1-nested', async () => {
                    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
                    expect(ctx.get()).toBe('branch-1-nested');
                  });
                } finally {
                  if (__asyncContext) __setAsyncContext(__asyncContext);
                }
                expect(ctx.get()).toBe('branch-1');
              });
            } finally {
              if (__asyncContext) __setAsyncContext(__asyncContext);
            }
          });
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        } // Branch 2
        try {
          await ctx.run('branch-2', async () => {
            const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
            expect(ctx.get()).toBe('branch-2');
            try {
              await Promise.resolve().then(async () => {
                const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
                expect(ctx.get()).toBe('branch-2');
                try {
                  await ctx.run('branch-2-nested', async () => {
                    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
                    expect(ctx.get()).toBe('branch-2-nested');
                  });
                } finally {
                  if (__asyncContext) __setAsyncContext(__asyncContext);
                }
                expect(ctx.get()).toBe('branch-2');
              });
            } finally {
              if (__asyncContext) __setAsyncContext(__asyncContext);
            }
          });
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        expect(ctx.get()).toBe('root');
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
  });
});
describe('Deep Nesting - Alternating Sync/Async', () => {
  it('should handle sync .run() → async .run() alternation', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const pattern = [];
    try {
      await ctx.run('async-1', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        pattern.push('async');
        expect(ctx.get()).toBe('async-1');
        const sync1 = ctx.run('sync-1', () => {
          pattern.push('sync');
          expect(ctx.get()).toBe('sync-1');
          return ctx.get();
        });
        expect(sync1).toBe('sync-1');
        try {
          await ctx.run('async-2', async () => {
            const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
            pattern.push('async');
            expect(ctx.get()).toBe('async-2');
            try {
              await delay(5);
            } finally {
              if (__asyncContext) __setAsyncContext(__asyncContext);
            }
            const sync2 = ctx.run('sync-2', () => {
              pattern.push('sync');
              expect(ctx.get()).toBe('sync-2');
              return ctx.get();
            });
            expect(sync2).toBe('sync-2');
            expect(ctx.get()).toBe('async-2');
          });
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        expect(ctx.get()).toBe('async-1');
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(pattern).toEqual(['async', 'sync', 'async', 'sync']);
  });
  it('should handle deeply nested with mixed sync/async timing', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    let deepestAsync = 0;
    let deepestSync = 0;
    async function asyncNest(level) {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      if (level > 5) return;
      try {
        await ctx.run(`async-${level}`, async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          deepestAsync = Math.max(deepestAsync, level);
          expect(ctx.get()).toBe(`async-${level}`);
          if (level < 5) {
            try {
              await delay(2);
            } finally {
              if (__asyncContext) __setAsyncContext(__asyncContext);
            }
          }

          // Sync nest inside async
          ctx.run(`sync-${level}`, () => {
            deepestSync = Math.max(deepestSync, level);
            expect(ctx.get()).toBe(`sync-${level}`);
          });
          try {
            await asyncNest(level + 1);
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          expect(ctx.get()).toBe(`async-${level}`);
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
    }
    try {
      await asyncNest(1);
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(deepestAsync).toBe(5);
    expect(deepestSync).toBe(5);
  });
  it('should maintain context through rapid sync-async transitions', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const transitions = [];
    try {
      await ctx.run('start', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        transitions.push(ctx.get());
        for (let i = 0; i < 5; i++) {
          // Sync operation
          ctx.run(`sync-${i}`, () => {
            transitions.push(ctx.get());
          });

          // Async operation
          try {
            await ctx.run(`async-${i}`, async () => {
              const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
              transitions.push(ctx.get());
              try {
                await delay(1);
              } finally {
                if (__asyncContext) __setAsyncContext(__asyncContext);
              }
            });
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          transitions.push(ctx.get());
        }
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(transitions[0]).toBe('start');
    expect(transitions[transitions.length - 1]).toBe('start');
  });
});
