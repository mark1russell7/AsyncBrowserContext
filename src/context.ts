/**
 * AsyncBrowserContext - Final Implementation with Promise Chain Tracking
 *
 * Key insight: Each promise tracks its parent promise, creating a chain.
 * Context is stored on promises and inherited through the chain.
 */

// ============================================================================
// Core Types
// ============================================================================

export interface VariableOptions<T> {
  name?: string | undefined;
  defaultValue?: T | undefined;
}

export interface Snapshot {
  readonly contexts: ReadonlyMap<AsyncVariable<unknown>, unknown>;
  run<R>(fn: () => R): R;
}

// ============================================================================
// Promise Chain Tracking
// ============================================================================

// Symbols for storing metadata on promises
const CONTEXT_SYMBOL = Symbol.for("AsyncContext_Context");
const PARENT_SYMBOL = Symbol.for("AsyncContext_Parent");
const PROMISE_ID_SYMBOL = Symbol.for("AsyncContext_PromiseId");

let promiseIdCounter = 0;

// interface PromiseMetadata {
//   id: number;
//   context: Map<AsyncVariable<unknown>, unknown>;
//   parent?: Promise<unknown>;
// }

/**
 * Attach context and parent to a promise
 */
function attachMetadata(
  promise: Promise<unknown>,
  context: Map<AsyncVariable<unknown>, unknown>,
  parent?: Promise<unknown>
): void {
  const id = ++promiseIdCounter;
  (promise as any)[PROMISE_ID_SYMBOL] = id;
  (promise as any)[CONTEXT_SYMBOL] = context;
  if (parent) {
    (promise as any)[PARENT_SYMBOL] = parent;
  }
}

/**
 * Get context from a promise or its parents (walk up the chain)
 */
function getContextFromPromiseChain(
  promise: Promise<unknown>
): Map<AsyncVariable<unknown>, unknown> | undefined {
  let current: Promise<unknown> | undefined = promise;

  // Walk up the promise chain to find context
  while (current) {
    const context = (current as any)[CONTEXT_SYMBOL];
    if (context) {
      return context;
    }
    // Try parent
    current = (current as any)[PARENT_SYMBOL];
  }

  return undefined;
}

/**
 * Get the current "active" promise (for tracking parent-child relationships)
 */
let currentActivePromise: Promise<unknown> | undefined;

// ============================================================================
// Context Storage
// ============================================================================

// Root context (when no context is active)
const rootContext = new Map<AsyncVariable<unknown>, unknown>();

// Current synchronous execution context
let currentSyncContext: Map<AsyncVariable<unknown>, unknown> = rootContext;

/**
 * Get the current context (from promise chain or sync context)
 *
 * CRITICAL: This is called by AsyncVariable.get() to retrieve values.
 * We must return the correct context for the current execution.
 *
 * IMPORTANT: Priority order matters for nested contexts!
 * currentSyncContext MUST be checked before currentActivePromise.
 * When .run() is called inside a .then() callback, currentActivePromise
 * points to the outer promise. If we check it first, nested .run()
 * calls will incorrectly use the outer context instead of the inner one.
 */
function getCurrentContext(): Map<AsyncVariable<unknown>, unknown> {
  // Priority 1: Use currentSyncContext (set by __setAsyncContext or run())
  // This is the most specific, current execution context
  if (currentSyncContext && currentSyncContext !== rootContext) {
    return currentSyncContext;
  }

  // Priority 2: Check if currentActivePromise has context
  // Fallback for resuming from await when currentSyncContext not yet set
  if (currentActivePromise) {
    const promiseContext = getContextFromPromiseChain(currentActivePromise);
    if (promiseContext) {
      return promiseContext;
    }
  }

  // Priority 3: Fall back to root
  return rootContext;
}

/**
 * Clone a context map
 */
function cloneContext(
  ctx: Map<AsyncVariable<unknown>, unknown>
): Map<AsyncVariable<unknown>, unknown> {
  return new Map(ctx);
}

// ============================================================================
// AsyncVariable
// ============================================================================

export class AsyncVariable<T> {
  private readonly _name: string | undefined;
  private readonly _defaultValue: T | undefined;

  constructor(options: VariableOptions<T> = {}) {
    this._name = options.name;
    this._defaultValue = options.defaultValue;
  }

  get(): T | undefined {
    const context = getCurrentContext();
    if (context.has(this)) {
      return context.get(this) as T;
    }
    return this._defaultValue;
  }

  run<R>(value: T, fn: () => R): R {
    // Create new context with this value
    const newContext = cloneContext(getCurrentContext());
    newContext.set(this, value);

    // Save previous context
    const previousContext = currentSyncContext;
    currentSyncContext = newContext;

    try {
      const result = fn();

      // If result is a Promise, attach context and mark it as "root" of this execution
      if (result instanceof Promise) {
        attachMetadata(result, newContext);
      }

      return result;
    } finally {
      // Restore previous sync context
      currentSyncContext = previousContext;
    }
  }

  get name(): string | undefined {
    return this._name;
  }
}

// ============================================================================
// AsyncSnapshot
// ============================================================================

export class AsyncSnapshot implements Snapshot {
  readonly contexts: ReadonlyMap<AsyncVariable<unknown>, unknown>;

  constructor() {
    this.contexts = new Map(getCurrentContext());
  }

  run<R>(fn: () => R): R {
    const capturedContext = new Map(this.contexts);
    const previousContext = currentSyncContext;
    currentSyncContext = capturedContext;

    try {
      const result = fn();

      if (result instanceof Promise) {
        attachMetadata(result, capturedContext);
      }

      return result;
    } finally {
      currentSyncContext = previousContext;
    }
  }
}

// ============================================================================
// Promise Patching
// ============================================================================

let isPatched = false;

// Save original methods before patching
const OriginalPromise = Promise;
const originalThen = Promise.prototype.then;
const originalFinally = Promise.prototype.finally;

function patchPromise(): void {
  if (isPatched) return;

  // Patch Promise constructor
  const PatchedPromiseConstructor = function <T>(
    this: Promise<T>,
    executor: (
      resolve: (value: T | PromiseLike<T>) => void,
      reject: (reason?: unknown) => void
    ) => void
  ): Promise<T> {
    const parentPromise = currentActivePromise;
    const capturedContext = getCurrentContext();

    // Create promise first
    let createdPromise: Promise<T> | undefined;

    const promise = new OriginalPromise<T>((resolve, reject) => {
      // Set this promise as active while executor runs
      const previousActive = currentActivePromise;
      // Use the promise we're about to return
      if (createdPromise) {
        currentActivePromise = createdPromise;
      }

      try {
        executor(resolve, reject);
      } finally {
        currentActivePromise = previousActive;
      }
    });

    createdPromise = promise;

    // Attach metadata
    attachMetadata(promise, capturedContext, parentPromise);

    return promise;
  };

  // Copy prototype and static methods
  Object.setPrototypeOf(PatchedPromiseConstructor, OriginalPromise);
  PatchedPromiseConstructor.prototype = OriginalPromise.prototype;
  Object.defineProperty(PatchedPromiseConstructor, "name", {
    value: "Promise",
  });

  // Patch Promise.resolve
  const originalResolve = OriginalPromise.resolve.bind(OriginalPromise);
  PatchedPromiseConstructor.resolve = function <T>(
    value: T | PromiseLike<T>
  ): Promise<Awaited<T>> {
    const promise = originalResolve(value);
    attachMetadata(promise, getCurrentContext(), currentActivePromise);
    return promise as Promise<Awaited<T>>;
  };

  // Patch Promise.reject
  const originalReject = OriginalPromise.reject.bind(OriginalPromise);
  PatchedPromiseConstructor.reject = function <T = never>(
    reason?: unknown
  ): Promise<T> {
    const promise = originalReject(reason);
    attachMetadata(promise, getCurrentContext(), currentActivePromise);
    return promise;
  };

  // Patch Promise.all, race, etc.
  ["all", "race", "allSettled", "any"].forEach((method) => {
    const original = (OriginalPromise as any)[method];
    if (original) {
      (PatchedPromiseConstructor as any)[method] = function (...args: any[]) {
        const promise = original.apply(OriginalPromise, args);
        attachMetadata(promise, getCurrentContext(), currentActivePromise);
        return promise;
      };
    }
  });

  // Replace global Promise constructor
  (globalThis as any).Promise = PatchedPromiseConstructor;

  // Patch Promise.prototype.then
  OriginalPromise.prototype.then = function <T, TResult1 = T, TResult2 = never>(
    this: Promise<T>,
    onFulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    const parentPromise = this;
    const capturedContext =
      getContextFromPromiseChain(this) || getCurrentContext();

    // DEBUG: Log when .then() is called
    if (typeof (globalThis as any).DEBUG_ASYNC_CONTEXT !== "undefined") {
      (globalThis as any).console?.log(
        "[.then() called]",
        "has onFulfilled:",
        !!onFulfilled,
        "context:",
        capturedContext !== rootContext
      );
    }

    // Wrap callbacks to set active promise and context
    const wrappedFulfilled = onFulfilled
      ? (value: T) => {
          const previousActive = currentActivePromise;
          const previousContext = currentSyncContext;

          currentActivePromise = parentPromise;
          currentSyncContext = capturedContext;

          try {
            return onFulfilled(value);
          } finally {
            // Always restore previous context after callback completes
            currentActivePromise = previousActive;
            currentSyncContext = previousContext;
          }
        }
      : onFulfilled;

    const wrappedRejected = onRejected
      ? (reason: unknown) => {
          const previousActive = currentActivePromise;
          const previousContext = currentSyncContext;

          currentActivePromise = parentPromise;
          currentSyncContext = capturedContext;

          try {
            return onRejected(reason);
          } finally {
            currentActivePromise = previousActive;
            currentSyncContext = previousContext;
          }
        }
      : onRejected;

    // Call original then
    const resultPromise = originalThen.call(
      this,
      wrappedFulfilled as typeof onFulfilled,
      wrappedRejected as typeof onRejected
    );

    // Attach metadata to result promise
    attachMetadata(resultPromise, capturedContext, parentPromise);

    return resultPromise as Promise<TResult1 | TResult2>;
  };

  // Patch catch and finally
  OriginalPromise.prototype.catch = function <T, TResult = never>(
    this: Promise<T>,
    onRejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null
  ): Promise<T | TResult> {
    return this.then(undefined, onRejected);
  };

  OriginalPromise.prototype.finally = function <T>(
    this: Promise<T>,
    onFinally?: (() => void) | null
  ): Promise<T> {
    const parentPromise = this;
    const capturedContext =
      getContextFromPromiseChain(this) || getCurrentContext();

    const wrappedFinally = onFinally
      ? () => {
          const previousActive = currentActivePromise;
          const previousContext = currentSyncContext;

          currentActivePromise = parentPromise;
          currentSyncContext = capturedContext;

          try {
            return onFinally();
          } finally {
            currentActivePromise = previousActive;
            currentSyncContext = previousContext;
          }
        }
      : onFinally;

    const resultPromise = originalFinally.call(this, wrappedFinally);
    attachMetadata(resultPromise, capturedContext, parentPromise);

    return resultPromise;
  };

  isPatched = true;
}

// ============================================================================
// Timer APIs Patching
// ============================================================================

type TimerCallback = (...args: unknown[]) => void;

function patchTimers(): void {
  const originalSetTimeout = (globalThis as any).setTimeout;
  (globalThis as any).setTimeout = function (
    callback: TimerCallback | string,
    delay?: number,
    ...args: unknown[]
  ): number {
    const capturedContext = cloneContext(getCurrentContext());

    const wrappedCallback =
      typeof callback === "function"
        ? (((...callbackArgs: unknown[]) => {
            const previousContext = currentSyncContext;
            currentSyncContext = capturedContext;
            try {
              return callback(...callbackArgs);
            } finally {
              currentSyncContext = previousContext;
            }
          }) as TimerCallback)
        : callback;

    return originalSetTimeout(wrappedCallback, delay, ...args);
  };

  const originalSetInterval = (globalThis as any).setInterval;
  (globalThis as any).setInterval = function (
    callback: TimerCallback | string,
    delay?: number,
    ...args: unknown[]
  ): number {
    const capturedContext = cloneContext(getCurrentContext());

    const wrappedCallback =
      typeof callback === "function"
        ? (((...callbackArgs: unknown[]) => {
            const previousContext = currentSyncContext;
            currentSyncContext = capturedContext;
            try {
              return callback(...callbackArgs);
            } finally {
              currentSyncContext = previousContext;
            }
          }) as TimerCallback)
        : callback;

    return originalSetInterval(wrappedCallback, delay, ...args);
  };

  if (typeof (globalThis as any).queueMicrotask === "function") {
    const originalQueueMicrotask = (globalThis as any).queueMicrotask;
    (globalThis as any).queueMicrotask = function (callback: () => void): void {
      const capturedContext = cloneContext(getCurrentContext());

      const wrappedCallback = () => {
        const previousContext = currentSyncContext;
        currentSyncContext = capturedContext;
        try {
          return callback();
        } finally {
          currentSyncContext = previousContext;
        }
      };

      return originalQueueMicrotask(wrappedCallback);
    };
  }

  if (typeof (globalThis as any).requestAnimationFrame === "function") {
    const originalRequestAnimationFrame = (globalThis as any)
      .requestAnimationFrame;
    (globalThis as any).requestAnimationFrame = function (
      callback: (time: number) => void
    ): number {
      const capturedContext = cloneContext(getCurrentContext());

      const wrappedCallback = (time: number) => {
        const previousContext = currentSyncContext;
        currentSyncContext = capturedContext;
        try {
          return callback(time);
        } finally {
          currentSyncContext = previousContext;
        }
      };

      return originalRequestAnimationFrame(wrappedCallback);
    };
  }

  // Patch requestIdleCallback
  if (typeof (globalThis as any).requestIdleCallback === "function") {
    const originalRequestIdleCallback = (globalThis as any)
      .requestIdleCallback;
    (globalThis as any).requestIdleCallback = function (
      callback: (deadline: any) => void,
      options?: any
    ): number {
      const capturedContext = cloneContext(getCurrentContext());

      const wrappedCallback = (deadline: any) => {
        const previousContext = currentSyncContext;
        currentSyncContext = capturedContext;
        try {
          return callback(deadline);
        } finally {
          currentSyncContext = previousContext;
        }
      };

      return originalRequestIdleCallback(wrappedCallback, options);
    };
  }
}

// ============================================================================
// Initialization
// ============================================================================

export function init(): void {
  patchPromise();
  patchTimers();
}

// ============================================================================
// Runtime Helpers for Babel Plugin
// ============================================================================

/**
 * These functions are called by code transformed by @async-context/babel-plugin
 * They manage context during async function execution.
 *
 * Instead of using a global context stack, we use WeakMaps to
 * associate context with the Promise that each async function returns.
 * This provides perfect isolation between concurrent async operations.
 */

// NOTE: We no longer need WeakMaps for storing execution contexts!
// Each async function captures its context in a closure variable (__asyncContext)
// which is unique per execution. The Babel transform injects code that restores
// context from this closure after each await.

/**
 * Called at async function entry to capture context
 * Returns an execution token that identifies this specific async function call
 */
export function __getAsyncContext(): {
  context: Map<AsyncVariable<unknown>, unknown>;
  executionId: object;
} {
  const context = cloneContext(getCurrentContext());
  const executionId = {}; // Unique object for this execution
  return { context, executionId };
}

/**
 * Set context from a token captured at function entry
 * Called AFTER each await to restore the correct context from the closure
 *
 * This is THE KEY to solving concurrent isolation!
 * Each execution has its own token in a closure, so there's no race condition.
 */
export function __setAsyncContext(token: {
  context: Map<AsyncVariable<unknown>, unknown>;
  executionId: object;
}): void {
  // Simply set the context from the token
  // The token is captured in the async function's closure, so it's unique per execution
  currentSyncContext = token.context;
}

// Expose on globalThis for transformed code
if (typeof globalThis !== "undefined") {
  (globalThis as any).__getAsyncContext = __getAsyncContext;
  (globalThis as any).__setAsyncContext = __setAsyncContext;
}

// ============================================================================
// Exports
// ============================================================================

export const AsyncContext = {
  Variable: AsyncVariable,
  Snapshot: AsyncSnapshot,
} as const;

// Auto-initialize
if (typeof globalThis !== "undefined") {
  init();
}
