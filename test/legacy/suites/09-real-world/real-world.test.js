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

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

describe('Real World - HTTP Request Patterns', () => {
  it('should maintain request context through HTTP handler chain', async () => {
    const requestId = new AsyncVariable();
    const userId = new AsyncVariable();

    // Simulate HTTP request handler
    async function handleRequest(reqId, user) {
      return await requestId.run(reqId, async () => {
        return await userId.run(user, async () => {
          // Simulate auth middleware
          await delay(5);
          expect(requestId.get()).toBe(reqId);
          expect(userId.get()).toBe(user);

          // Simulate business logic
          const result = await processRequest();

          // Simulate logging middleware
          await logRequest();

          return result;
        });
      });
    }

    async function processRequest() {
      await delay(5);
      expect(requestId.get()).toBe('req-123');
      expect(userId.get()).toBe('user-456');
      return { success: true };
    }

    async function logRequest() {
      await delay(2);
      const req = requestId.get();
      const user = userId.get();
      expect(req).toBe('req-123');
      expect(user).toBe('user-456');
    }

    const result = await handleRequest('req-123', 'user-456');
    expect(result.success).toBeTruthy();
  });

  it('should handle concurrent HTTP requests with isolated contexts', async () => {
    const requestCtx = new AsyncVariable();

    async function handleRequest(id) {
      return await requestCtx.run(id, async () => {
        await delay(Math.random() * 10);

        // Simulate middleware chain
        await authMiddleware();
        await validationMiddleware();
        await businessLogic();

        return requestCtx.get();
      });
    }

    async function authMiddleware() {
      await delay(Math.random() * 5);
      expect(requestCtx.get()).toBeTruthy();
    }

    async function validationMiddleware() {
      await delay(Math.random() * 5);
      expect(requestCtx.get()).toBeTruthy();
    }

    async function businessLogic() {
      await delay(Math.random() * 5);
      expect(requestCtx.get()).toBeTruthy();
    }

    const results = await Promise.all([
      handleRequest('req-1'),
      handleRequest('req-2'),
      handleRequest('req-3'),
      handleRequest('req-4'),
      handleRequest('req-5')
    ]);

    expect(results).toEqual(['req-1', 'req-2', 'req-3', 'req-4', 'req-5']);
  });

  it('should maintain context through request retry logic', async () => {
    const requestId = new AsyncVariable();
    let attempts = 0;

    async function fetchWithRetry(id, maxRetries = 3) {
      return await requestId.run(id, async () => {
        for (let i = 0; i < maxRetries; i++) {
          attempts++;

          try {
            await delay(5);
            expect(requestId.get()).toBe(id);

            // Simulate failure on first 2 attempts
            if (i < 2) {
              throw new Error('Network error');
            }

            return { success: true, attempts: i + 1 };
          } catch (err) {
            expect(requestId.get()).toBe(id);
            if (i === maxRetries - 1) throw err;
          }
        }
      });
    }

    const result = await fetchWithRetry('req-retry-123');
    expect(result.success).toBeTruthy();
    expect(result.attempts).toBe(3);
    expect(attempts).toBe(3);
  });
});

describe('Real World - Database Transaction Patterns', () => {
  it('should maintain transaction context across queries', async () => {
    const transactionId = new AsyncVariable();
    const queries = [];

    async function runTransaction(txId) {
      return await transactionId.run(txId, async () => {
        // Simulate transaction start
        await delay(2);
        expect(transactionId.get()).toBe(txId);

        // Execute queries within transaction
        await query('SELECT * FROM users');
        await query('INSERT INTO logs VALUES (...)');
        await query('UPDATE accounts SET balance = ...');

        // Simulate commit
        await delay(2);
        expect(transactionId.get()).toBe(txId);

        return { committed: true, queries: queries.length };
      });
    }

    async function query(sql) {
      await delay(Math.random() * 5);
      const txId = transactionId.get();
      expect(txId).toBeTruthy();
      queries.push({ sql, txId });
    }

    const result = await runTransaction('tx-789');
    expect(result.committed).toBeTruthy();
    expect(result.queries).toBe(3);
    expect(queries.every(q => q.txId === 'tx-789')).toBeTruthy();
  });

  it('should handle nested transactions with savepoints', async () => {
    const txStack = new AsyncVariable();

    async function transaction(name, fn) {
      return await txStack.run(name, async () => {
        await delay(2);
        const result = await fn();
        await delay(2);
        expect(txStack.get()).toBe(name);
        return result;
      });
    }

    const result = await transaction('tx-outer', async () => {
      expect(txStack.get()).toBe('tx-outer');

      const inner1 = await transaction('tx-inner-1', async () => {
        expect(txStack.get()).toBe('tx-inner-1');
        await delay(3);
        return 'inner1-result';
      });

      expect(txStack.get()).toBe('tx-outer');

      const inner2 = await transaction('tx-inner-2', async () => {
        expect(txStack.get()).toBe('tx-inner-2');
        await delay(3);
        return 'inner2-result';
      });

      expect(txStack.get()).toBe('tx-outer');
      return { inner1, inner2 };
    });

    expect(result.inner1).toBe('inner1-result');
    expect(result.inner2).toBe('inner2-result');
  });

  it('should rollback transaction context on error', async () => {
    const transactionId = new AsyncVariable();
    let rollbackCalled = false;

    async function runTransaction(txId) {
      return await transactionId.run(txId, async () => {
        try {
          await delay(2);
          expect(transactionId.get()).toBe(txId);

          // Simulate error during transaction
          throw new Error('Constraint violation');
        } catch (err) {
          // Verify context maintained during rollback
          expect(transactionId.get()).toBe(txId);
          await rollback();
          throw err;
        }
      });
    }

    async function rollback() {
      await delay(2);
      const txId = transactionId.get();
      expect(txId).toBe('tx-rollback-123');
      rollbackCalled = true;
    }

    try {
      await runTransaction('tx-rollback-123');
      expect(true).toBeFalsy(); // Should not reach here
    } catch (err) {
      expect(err.message).toBe('Constraint violation');
      expect(rollbackCalled).toBeTruthy();
    }
  });
});

describe('Real World - Middleware Chain Patterns', () => {
  it('should maintain context through middleware chain', async () => {
    const ctx = new AsyncVariable();
    const executionOrder = [];

    async function middleware1(next) {
      executionOrder.push('m1-before');
      expect(ctx.get()).toBe('request-context');
      await delay(2);
      const result = await next();
      await delay(2);
      expect(ctx.get()).toBe('request-context');
      executionOrder.push('m1-after');
      return result;
    }

    async function middleware2(next) {
      executionOrder.push('m2-before');
      expect(ctx.get()).toBe('request-context');
      await delay(2);
      const result = await next();
      await delay(2);
      expect(ctx.get()).toBe('request-context');
      executionOrder.push('m2-after');
      return result;
    }

    async function middleware3(next) {
      executionOrder.push('m3-before');
      expect(ctx.get()).toBe('request-context');
      await delay(2);
      const result = await next();
      await delay(2);
      expect(ctx.get()).toBe('request-context');
      executionOrder.push('m3-after');
      return result;
    }

    async function handler() {
      executionOrder.push('handler');
      expect(ctx.get()).toBe('request-context');
      return { handled: true };
    }

    await ctx.run('request-context', async () => {
      const result = await middleware1(async () =>
        middleware2(async () =>
          middleware3(async () =>
            handler()
          )
        )
      );

      expect(result.handled).toBeTruthy();
    });

    expect(executionOrder).toEqual([
      'm1-before', 'm2-before', 'm3-before', 'handler',
      'm3-after', 'm2-after', 'm1-after'
    ]);
  });

  it('should handle middleware error propagation with context', async () => {
    const ctx = new AsyncVariable();
    let errorHandlerCalled = false;

    async function errorMiddleware(next) {
      try {
        return await next();
      } catch (err) {
        expect(ctx.get()).toBe('error-context');
        errorHandlerCalled = true;
        return { error: err.message, recovered: true };
      }
    }

    async function faultyMiddleware(next) {
      expect(ctx.get()).toBe('error-context');
      throw new Error('Middleware error');
    }

    const result = await ctx.run('error-context', async () => {
      return await errorMiddleware(async () =>
        faultyMiddleware(async () => {})
      );
    });

    expect(errorHandlerCalled).toBeTruthy();
    expect(result.recovered).toBeTruthy();
    expect(result.error).toBe('Middleware error');
  });
});

describe('Real World - Logging and Tracing Patterns', () => {
  it('should maintain trace context across async boundaries', async () => {
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
      return await spanId.run(name, async () => {
        log(`${name} started`);
        await delay(5);
        log(`${name} processing`);
        await delay(5);
        log(`${name} completed`);
      });
    }

    await traceId.run('trace-abc-123', async () => {
      log('Request started');

      await operation('span-auth');
      await operation('span-query');
      await operation('span-render');

      log('Request completed');
    });

    expect(logs.length).toBe(11);
    expect(logs.every(l => l.traceId === 'trace-abc-123')).toBeTruthy();
    expect(logs[0].spanId).toBeUndefined();
    expect(logs[1].spanId).toBe('span-auth');
    expect(logs[4].spanId).toBe('span-query');
    expect(logs[7].spanId).toBe('span-render');
  });

  it('should handle distributed tracing across service boundaries', async () => {
    const traceId = new AsyncVariable();
    const serviceName = new AsyncVariable();

    async function serviceA(trace) {
      return await traceId.run(trace, async () => {
        return await serviceName.run('service-a', async () => {
          await delay(5);
          expect(traceId.get()).toBe(trace);
          expect(serviceName.get()).toBe('service-a');

          // Call service B
          const result = await serviceB();

          expect(traceId.get()).toBe(trace);
          expect(serviceName.get()).toBe('service-a');

          return { fromA: true, fromB: result };
        });
      });
    }

    async function serviceB() {
      // Service B uses same trace but different service name
      const currentTrace = traceId.get();
      return await serviceName.run('service-b', async () => {
        await delay(5);
        expect(traceId.get()).toBe(currentTrace);
        expect(serviceName.get()).toBe('service-b');

        // Call service C
        const result = await serviceC();

        return { fromB: true, fromC: result };
      });
    }

    async function serviceC() {
      const currentTrace = traceId.get();
      return await serviceName.run('service-c', async () => {
        await delay(5);
        expect(traceId.get()).toBe(currentTrace);
        expect(serviceName.get()).toBe('service-c');
        return { fromC: true };
      });
    }

    const result = await serviceA('distributed-trace-xyz');
    expect(result.fromA).toBeTruthy();
    expect(result.fromB.fromB).toBeTruthy();
    expect(result.fromB.fromC.fromC).toBeTruthy();
  });

  it('should maintain log context through parallel operations', async () => {
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
      return await requestId.run(reqId, async () => {
        log('INFO', 'Starting parallel operations');

        const results = await Promise.all([
          operation1(),
          operation2(),
          operation3()
        ]);

        log('INFO', 'All operations completed');
        return results;
      });
    }

    async function operation1() {
      log('DEBUG', 'Op1 started');
      await delay(Math.random() * 10);
      log('DEBUG', 'Op1 completed');
      return 'op1-result';
    }

    async function operation2() {
      log('DEBUG', 'Op2 started');
      await delay(Math.random() * 10);
      log('DEBUG', 'Op2 completed');
      return 'op2-result';
    }

    async function operation3() {
      log('DEBUG', 'Op3 started');
      await delay(Math.random() * 10);
      log('DEBUG', 'Op3 completed');
      return 'op3-result';
    }

    await parallelOperations('req-parallel-789');

    expect(logs.length).toBe(8);
    expect(logs.every(l => l.requestId === 'req-parallel-789')).toBeTruthy();
  });
});
