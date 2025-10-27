/**
 * Real World Patterns Tests (Suite 09)
 *
 * Tests practical real-world usage patterns:
 * - HTTP request/response chains
 * - Database transaction patterns
 * - Middleware chain patterns
 * - Logging/tracing patterns
 */

import { describe, it, expect } from '../../framework/test-runner.js';
import { AsyncVariable } from '../../../dist/context.js';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
describe('Real World - HTTP Request Patterns', () => {
  it('should maintain request context through HTTP handler chain', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const requestId = new AsyncVariable();
    const userId = new AsyncVariable();

    // Simulate HTTP request handler
    async function handleRequest(reqId, user) {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      try {
        return await requestId.run(reqId, async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          try {
            return await userId.run(user, async () => {
              const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
              // Simulate auth middleware
              try {
                await delay(5);
              } finally {
                if (__asyncContext) __setAsyncContext(__asyncContext);
              }
              expect(requestId.get()).toBe(reqId);
              expect(userId.get()).toBe(user);

              // Simulate business logic
              let result;
              try {
                result = await processRequest();
              } finally {
                if (__asyncContext) __setAsyncContext(__asyncContext);
              } // Simulate logging middleware
              try {
                await logRequest();
              } finally {
                if (__asyncContext) __setAsyncContext(__asyncContext);
              }
              return result;
            });
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
    }
    async function processRequest() {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      try {
        await delay(5);
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      expect(requestId.get()).toBe('req-123');
      expect(userId.get()).toBe('user-456');
      return {
        success: true
      };
    }
    async function logRequest() {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      try {
        await delay(2);
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      const req = requestId.get();
      const user = userId.get();
      expect(req).toBe('req-123');
      expect(user).toBe('user-456');
    }
    let result;
    try {
      result = await handleRequest('req-123', 'user-456');
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(result.success).toBeTruthy();
  });
  it('should handle concurrent HTTP requests with isolated contexts', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const requestCtx = new AsyncVariable();
    async function handleRequest(id) {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      try {
        return await requestCtx.run(id, async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          try {
            await delay(Math.random() * 10);
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          } // Simulate middleware chain
          try {
            await authMiddleware();
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          try {
            await validationMiddleware();
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          try {
            await businessLogic();
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          return requestCtx.get();
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
    }
    async function authMiddleware() {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      try {
        await delay(Math.random() * 5);
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      expect(requestCtx.get()).toBeTruthy();
    }
    async function validationMiddleware() {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      try {
        await delay(Math.random() * 5);
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      expect(requestCtx.get()).toBeTruthy();
    }
    async function businessLogic() {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      try {
        await delay(Math.random() * 5);
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      expect(requestCtx.get()).toBeTruthy();
    }
    let results;
    try {
      results = await Promise.all([handleRequest('req-1'), handleRequest('req-2'), handleRequest('req-3'), handleRequest('req-4'), handleRequest('req-5')]);
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(results).toEqual(['req-1', 'req-2', 'req-3', 'req-4', 'req-5']);
  });
  it('should maintain context through request retry logic', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const requestId = new AsyncVariable();
    let attempts = 0;
    async function fetchWithRetry(id, maxRetries = 3) {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      try {
        return await requestId.run(id, async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          for (let i = 0; i < maxRetries; i++) {
            attempts++;
            try {
              try {
                await delay(5);
              } finally {
                if (__asyncContext) __setAsyncContext(__asyncContext);
              }
              expect(requestId.get()).toBe(id);

              // Simulate failure on first 2 attempts
              if (i < 2) {
                throw new Error('Network error');
              }
              return {
                success: true,
                attempts: i + 1
              };
            } catch (err) {
              expect(requestId.get()).toBe(id);
              if (i === maxRetries - 1) throw err;
            }
          }
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
    }
    let result;
    try {
      result = await fetchWithRetry('req-retry-123');
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(result.success).toBeTruthy();
    expect(result.attempts).toBe(3);
    expect(attempts).toBe(3);
  });
});
describe('Real World - Database Transaction Patterns', () => {
  it('should maintain transaction context across queries', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const transactionId = new AsyncVariable();
    const queries = [];
    async function runTransaction(txId) {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      try {
        return await transactionId.run(txId, async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          // Simulate transaction start
          try {
            await delay(2);
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          expect(transactionId.get()).toBe(txId);

          // Execute queries within transaction
          try {
            await query('SELECT * FROM users');
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          try {
            await query('INSERT INTO logs VALUES (...)');
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          try {
            await query('UPDATE accounts SET balance = ...');
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          } // Simulate commit
          try {
            await delay(2);
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          expect(transactionId.get()).toBe(txId);
          return {
            committed: true,
            queries: queries.length
          };
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
    }
    async function query(sql) {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      try {
        await delay(Math.random() * 5);
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      const txId = transactionId.get();
      expect(txId).toBeTruthy();
      queries.push({
        sql,
        txId
      });
    }
    let result;
    try {
      result = await runTransaction('tx-789');
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(result.committed).toBeTruthy();
    expect(result.queries).toBe(3);
    expect(queries.every(q => q.txId === 'tx-789')).toBeTruthy();
  });
  it('should handle nested transactions with savepoints', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const txStack = new AsyncVariable();
    async function transaction(name, fn) {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      try {
        return await txStack.run(name, async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          try {
            await delay(2);
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          let result;
          try {
            result = await fn();
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          try {
            await delay(2);
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          expect(txStack.get()).toBe(name);
          return result;
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
    }
    let result;
    try {
      result = await transaction('tx-outer', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        expect(txStack.get()).toBe('tx-outer');
        let inner1;
        try {
          inner1 = await transaction('tx-inner-1', async () => {
            const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
            expect(txStack.get()).toBe('tx-inner-1');
            try {
              await delay(3);
            } finally {
              if (__asyncContext) __setAsyncContext(__asyncContext);
            }
            return 'inner1-result';
          });
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        expect(txStack.get()).toBe('tx-outer');
        let inner2;
        try {
          inner2 = await transaction('tx-inner-2', async () => {
            const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
            expect(txStack.get()).toBe('tx-inner-2');
            try {
              await delay(3);
            } finally {
              if (__asyncContext) __setAsyncContext(__asyncContext);
            }
            return 'inner2-result';
          });
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        expect(txStack.get()).toBe('tx-outer');
        return {
          inner1,
          inner2
        };
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(result.inner1).toBe('inner1-result');
    expect(result.inner2).toBe('inner2-result');
  });
  it('should rollback transaction context on error', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const transactionId = new AsyncVariable();
    let rollbackCalled = false;
    async function runTransaction(txId) {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      try {
        return await transactionId.run(txId, async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          try {
            try {
              await delay(2);
            } finally {
              if (__asyncContext) __setAsyncContext(__asyncContext);
            }
            expect(transactionId.get()).toBe(txId);

            // Simulate error during transaction
            throw new Error('Constraint violation');
          } catch (err) {
            // Verify context maintained during rollback
            expect(transactionId.get()).toBe(txId);
            try {
              await rollback();
            } finally {
              if (__asyncContext) __setAsyncContext(__asyncContext);
            }
            throw err;
          }
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
    }
    async function rollback() {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      try {
        await delay(2);
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      const txId = transactionId.get();
      expect(txId).toBe('tx-rollback-123');
      rollbackCalled = true;
    }
    try {
      try {
        await runTransaction('tx-rollback-123');
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      expect(true).toBeFalsy(); // Should not reach here
    } catch (err) {
      expect(err.message).toBe('Constraint violation');
      expect(rollbackCalled).toBeTruthy();
    }
  });
});
describe('Real World - Middleware Chain Patterns', () => {
  it('should maintain context through middleware chain', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    const executionOrder = [];
    async function middleware1(next) {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      executionOrder.push('m1-before');
      expect(ctx.get()).toBe('request-context');
      try {
        await delay(2);
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      let result;
      try {
        result = await next();
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      try {
        await delay(2);
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      expect(ctx.get()).toBe('request-context');
      executionOrder.push('m1-after');
      return result;
    }
    async function middleware2(next) {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      executionOrder.push('m2-before');
      expect(ctx.get()).toBe('request-context');
      try {
        await delay(2);
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      let result;
      try {
        result = await next();
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      try {
        await delay(2);
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      expect(ctx.get()).toBe('request-context');
      executionOrder.push('m2-after');
      return result;
    }
    async function middleware3(next) {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      executionOrder.push('m3-before');
      expect(ctx.get()).toBe('request-context');
      try {
        await delay(2);
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      let result;
      try {
        result = await next();
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      try {
        await delay(2);
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      expect(ctx.get()).toBe('request-context');
      executionOrder.push('m3-after');
      return result;
    }
    async function handler() {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      executionOrder.push('handler');
      expect(ctx.get()).toBe('request-context');
      return {
        handled: true
      };
    }
    try {
      await ctx.run('request-context', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        let result;
        try {
          result = await middleware1(async () => {
            const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
            return middleware2(async () => {
              const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
              return middleware3(async () => {
                const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
                return handler();
              });
            });
          });
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        expect(result.handled).toBeTruthy();
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(executionOrder).toEqual(['m1-before', 'm2-before', 'm3-before', 'handler', 'm3-after', 'm2-after', 'm1-after']);
  });
  it('should handle middleware error propagation with context', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const ctx = new AsyncVariable();
    let errorHandlerCalled = false;
    async function errorMiddleware(next) {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      try {
        try {
          return await next();
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
      } catch (err) {
        expect(ctx.get()).toBe('error-context');
        errorHandlerCalled = true;
        return {
          error: err.message,
          recovered: true
        };
      }
    }
    async function faultyMiddleware(next) {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      expect(ctx.get()).toBe('error-context');
      throw new Error('Middleware error');
    }
    let result;
    try {
      result = await ctx.run('error-context', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        try {
          return await errorMiddleware(async () => {
            const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
            return faultyMiddleware(async () => {
              const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
            });
          });
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(errorHandlerCalled).toBeTruthy();
    expect(result.recovered).toBeTruthy();
    expect(result.error).toBe('Middleware error');
  });
});
describe('Real World - Logging and Tracing Patterns', () => {
  it('should maintain trace context across async boundaries', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const traceId = new AsyncVariable();
    const spanId = new AsyncVariable();
    const logs = [];
    function log(message) {
      logs.push({
        message,
        traceId: traceId.get(),
        spanId: spanId.get()
      });
    }
    async function operation(name) {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      try {
        return await spanId.run(name, async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          log(`${name} started`);
          try {
            await delay(5);
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          log(`${name} processing`);
          try {
            await delay(5);
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          log(`${name} completed`);
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
    }
    try {
      await traceId.run('trace-abc-123', async () => {
        const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        log('Request started');
        try {
          await operation('span-auth');
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        try {
          await operation('span-query');
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        try {
          await operation('span-render');
        } finally {
          if (__asyncContext) __setAsyncContext(__asyncContext);
        }
        log('Request completed');
      });
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(logs.length).toBe(11);
    expect(logs.every(l => l.traceId === 'trace-abc-123')).toBeTruthy();
    expect(logs[0].spanId).toBeUndefined();
    expect(logs[1].spanId).toBe('span-auth');
    expect(logs[4].spanId).toBe('span-query');
    expect(logs[7].spanId).toBe('span-render');
  });
  it('should handle distributed tracing across service boundaries', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const traceId = new AsyncVariable();
    const serviceName = new AsyncVariable();
    async function serviceA(trace) {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      try {
        return await traceId.run(trace, async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          try {
            return await serviceName.run('service-a', async () => {
              const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
              try {
                await delay(5);
              } finally {
                if (__asyncContext) __setAsyncContext(__asyncContext);
              }
              expect(traceId.get()).toBe(trace);
              expect(serviceName.get()).toBe('service-a');

              // Call service B
              let result;
              try {
                result = await serviceB();
              } finally {
                if (__asyncContext) __setAsyncContext(__asyncContext);
              }
              expect(traceId.get()).toBe(trace);
              expect(serviceName.get()).toBe('service-a');
              return {
                fromA: true,
                fromB: result
              };
            });
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
    }
    async function serviceB() {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      // Service B uses same trace but different service name
      const currentTrace = traceId.get();
      try {
        return await serviceName.run('service-b', async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          try {
            await delay(5);
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          expect(traceId.get()).toBe(currentTrace);
          expect(serviceName.get()).toBe('service-b');

          // Call service C
          let result;
          try {
            result = await serviceC();
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          return {
            fromB: true,
            fromC: result
          };
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
    }
    async function serviceC() {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      const currentTrace = traceId.get();
      try {
        return await serviceName.run('service-c', async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          try {
            await delay(5);
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          expect(traceId.get()).toBe(currentTrace);
          expect(serviceName.get()).toBe('service-c');
          return {
            fromC: true
          };
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
    }
    let result;
    try {
      result = await serviceA('distributed-trace-xyz');
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(result.fromA).toBeTruthy();
    expect(result.fromB.fromB).toBeTruthy();
    expect(result.fromB.fromC.fromC).toBeTruthy();
  });
  it('should maintain log context through parallel operations', async () => {
    const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
    const requestId = new AsyncVariable();
    const logs = [];
    function log(level, message) {
      logs.push({
        level,
        message,
        requestId: requestId.get(),
        timestamp: Date.now()
      });
    }
    async function parallelOperations(reqId) {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      try {
        return await requestId.run(reqId, async () => {
          const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
          log('INFO', 'Starting parallel operations');
          let results;
          try {
            results = await Promise.all([operation1(), operation2(), operation3()]);
          } finally {
            if (__asyncContext) __setAsyncContext(__asyncContext);
          }
          log('INFO', 'All operations completed');
          return results;
        });
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
    }
    async function operation1() {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      log('DEBUG', 'Op1 started');
      try {
        await delay(Math.random() * 10);
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      log('DEBUG', 'Op1 completed');
      return 'op1-result';
    }
    async function operation2() {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      log('DEBUG', 'Op2 started');
      try {
        await delay(Math.random() * 10);
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      log('DEBUG', 'Op2 completed');
      return 'op2-result';
    }
    async function operation3() {
      const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
      log('DEBUG', 'Op3 started');
      try {
        await delay(Math.random() * 10);
      } finally {
        if (__asyncContext) __setAsyncContext(__asyncContext);
      }
      log('DEBUG', 'Op3 completed');
      return 'op3-result';
    }
    try {
      await parallelOperations('req-parallel-789');
    } finally {
      if (__asyncContext) __setAsyncContext(__asyncContext);
    }
    expect(logs.length).toBe(8);
    expect(logs.every(l => l.requestId === 'req-parallel-789')).toBeTruthy();
  });
});
