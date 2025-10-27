# async-browser-context

Automatic async context propagation for JavaScript. Set a value once, access it anywhere in your async call stack - no manual passing required.

```typescript
import { AsyncVariable } from 'async-browser-context';

const requestId = new AsyncVariable<string>();

app.use(async (req, res) => {
  await requestId.run(req.id, async () => {
    await handleRequest(req, res);
  });
});

// Deep in your code, no parameter passing needed
function log(message: string) {
  console.log(`[${requestId.get()}] ${message}`);
}
```

## How It Works

Two techniques working together:

1. **Runtime Promise patching** - Intercepts `.then()`, `.catch()`, `.finally()` to propagate context through promise chains. Also patches `setTimeout`, `queueMicrotask`, `requestAnimationFrame`, etc.

2. **Babel transformation** - Injects context restoration after each `await` point. Each async function captures its context in a closure variable at entry, then restores from that closure after every await. No shared globals, no race conditions.

The combination covers essentially all async patterns automatically.

## Setup

```bash
npm install async-browser-context
```

**babel.config.js:**
```javascript
module.exports = {
  plugins: ['async-browser-context/babel-plugin']
};
```

## Basic Usage

```typescript
import { AsyncVariable } from 'async-browser-context';

const userId = new AsyncVariable<string>();

// Set context
await userId.run('user-123', async () => {
  await fetchData();
  await processData();
  // Context available in all nested calls
});

async function fetchData() {
  console.log(userId.get()); // 'user-123'
  await someAsyncOperation();
  console.log(userId.get()); // Still 'user-123'
}
```

## Concurrent Operations

Each operation maintains its own isolated context:

```typescript
await Promise.all([
  requestId.run('A', async () => {
    await delay(10);
    console.log(requestId.get()); // Always 'A'
  }),
  requestId.run('B', async () => {
    await delay(5);
    console.log(requestId.get()); // Always 'B'
  })
]);
```

No interference, no race conditions. The closure-based approach ensures each invocation gets its own context.

## What's Covered

### ✅ Automatic (works out of the box)

**All async/await patterns:**

- `async function`, async arrow functions, async methods
- `for await...of` loops
- Async generators (`async function*`)
- Try/catch/finally with async

**All Promise patterns:**

- `.then()`, `.catch()`, `.finally()` chains
- `Promise.all`, `Promise.race`, `Promise.allSettled`, `Promise.any`
- `Promise.withResolvers()` (ES2024)
- Nested and chained promises

**Browser APIs:**

- `setTimeout`, `setInterval`, `setImmediate`
- `queueMicrotask`
- `requestAnimationFrame`, `requestIdleCallback`
- `MutationObserver`, `IntersectionObserver`, `ResizeObserver`

**Frameworks:**

- Works with Meteor v2 and v3
- Compatible with any framework using standard promises/async

### ⚠️ Requires AsyncSnapshot

Some patterns need explicit context management:

**Event listeners (when fired later):**
```typescript
import { AsyncSnapshot } from 'async-browser-context';

await requestId.run('req-123', async () => {
  const snapshot = new AsyncSnapshot();

  button.addEventListener('click', () => {
    snapshot.run(() => {
      console.log(requestId.get()); // Works
    });
  });
});
```

**WebSockets:**
```typescript
await sessionId.run('session-456', async () => {
  const snapshot = new AsyncSnapshot();

  socket.on('message', (data) => {
    snapshot.run(() => {
      console.log(sessionId.get(), data); // Works
    });
  });
});
```

**Third-party library callbacks:**
```typescript
await userId.run('user-123', async () => {
  const snapshot = new AsyncSnapshot();

  await externalLib.process({
    onProgress: (data) => {
      snapshot.run(() => {
        logger.info(userId.get(), data); // Works
      });
    }
  });
});
```

### ❌ Not Covered

- `eval()` or `new Function()` with async/await (can't transform runtime strings)
- Web Workers / Worker Threads (separate execution contexts)
- Sync generators (`function*` without async)

For these cases, pass context explicitly or use the library's API within the generated code.

## Real-World Examples

### Request Tracing

```typescript
const traceId = new AsyncVariable<string>();

app.use(async (req, res) => {
  await traceId.run(generateTraceId(), async () => {
    await handleRequest(req, res);
  });
});

// Anywhere in your stack
function log(message: string) {
  console.log(`[${traceId.get()}] ${message}`);
}

async function queryDatabase() {
  const trace = traceId.get();
  await db.query({ metadata: { traceId: trace } });
}
```

### User Context

```typescript
const currentUser = new AsyncVariable<User>();

router.post('/api/action', async (req, res) => {
  const user = await authenticate(req);

  await currentUser.run(user, async () => {
    await processPayment();
    await sendEmail();
    await updateDatabase();
  });
});

// Deep in your business logic
async function updateDatabase() {
  const user = currentUser.get();
  await db.insert({ userId: user.id, ... });
}
```

### Database Transactions

```typescript
const transaction = new AsyncVariable<Transaction>();

async function transferMoney(from: string, to: string, amount: number) {
  const tx = await db.beginTransaction();

  try {
    await transaction.run(tx, async () => {
      await debit(from, amount);
      await credit(to, amount);
      await tx.commit();
    });
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

// All operations use the same transaction
async function debit(account: string, amount: number) {
  const tx = transaction.get();
  await tx.query('UPDATE accounts SET balance = balance - ? WHERE id = ?', [amount, account]);
}
```

### Logging with Context

```typescript
const logger = new AsyncVariable<Logger>();

class Logger {
  constructor(private context: Record<string, any> = {}) {}

  info(message: string) {
    console.log(JSON.stringify({ ...this.context, level: 'info', message }));
  }
}

// Set once
await logger.run(new Logger({ requestId: 'req-123', userId: 'user-456' }), async () => {
  await processRequest();
});

// Use everywhere
function processRequest() {
  logger.get()?.info('Processing started');
}
```

## API

### AsyncVariable

```typescript
const variable = new AsyncVariable<T>(defaultValue?: T);

// Set context and run
await variable.run(value: T, fn: () => Promise<R>): Promise<R>

// Get current value
variable.get(): T | undefined

// Get with fallback to default
variable.get(): T  // if default provided in constructor
```

### AsyncSnapshot

Capture and restore context manually:

```typescript
// Capture current context
const snapshot = new AsyncSnapshot();

// Restore later (sync or async)
snapshot.run(fn: () => R): R
await snapshot.run(fn: () => Promise<R>): Promise<R>
```

Use cases:

- Event listeners that fire after async context ends
- WebSocket/SSE message handlers
- Third-party library callbacks
- Any callback that runs "outside" your async flow

## Third-Party Libraries

Most third-party code works automatically:

```typescript
// Context maintained at call boundaries
await userId.run('user-123', async () => {
  const data = await axios.get('/api/data');
  console.log(userId.get()); // Still works
});
```

For callbacks, use AsyncSnapshot:

```typescript
// Axios interceptors
axios.interceptors.request.use((config) => {
  const snapshot = new AsyncSnapshot();
  config.metadata = { snapshot };
  return config;
});

axios.interceptors.response.use((response) => {
  response.config.metadata.snapshot.run(() => {
    logger.info(requestId.get(), 'Request completed');
  });
  return response;
});
```

## TypeScript

Full type safety:

```typescript
const userId = new AsyncVariable<string>();
const count = new AsyncVariable<number>(0); // with default

await userId.run('user-123', async () => {
  const id: string | undefined = userId.get();
  const num: number = count.get(); // never undefined due to default
});
```

## Performance

- Transform overhead: < 1% (compile-time only)
- Runtime overhead: ~2-5% per operation
- Bundle size: 15KB (7KB gzipped)
- Memory: Constant per concurrent operation

The closure-based approach has minimal overhead and scales to thousands of concurrent operations.

## Browser Support

- Chrome 60+
- Firefox 55+
- Safari 11+
- Edge 79+

Requires: ES2015+, Promise, Symbol support.

## Testing

217 tests covering every async pattern:

```bash
npm run build
npm run test:build
npm run test:serve
```

Open `http://localhost:8080/tests/runner.html` for a visual test runner with:

- Gantt chart timeline visualization
- Real-time progress tracking
- Detailed failure reports
- JSON/XML export

Test coverage includes:

- Core functionality, error handling, promise combinators
- Deep nesting, context isolation, concurrent operations
- Long-running operations, real-world patterns
- Browser APIs, async iteration, modern promises
- Edge cases, extreme concurrency (10,000+ operations)
- Performance and memory behavior

## How The Transform Works

**Your code:**

```typescript
async function fetchData() {
  const data = await db.query();
  return data;
}
```

**Transformed:**

```typescript
async function fetchData() {
  const __asyncContext = typeof __getAsyncContext === 'function'
    ? __getAsyncContext()
    : undefined;

  let data;
  try {
    data = await db.query();
  } finally {
    if (__asyncContext) __setAsyncContext(__asyncContext);
  }

  return data;
}
```

The context token is captured in a closure at function entry, then restored from that closure after each await. This ensures:

- Each function call has its own context (no shared state)
- Context survives even if promises reject (finally block)
- No race conditions between concurrent operations

## License

MIT
