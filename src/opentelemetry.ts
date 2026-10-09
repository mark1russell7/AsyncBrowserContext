/**
 * The OpenTelemetry context manager of `async-browser-context`, for browsers.
 * It keeps the active context through `await`, timers, events and the other
 * patched APIs, without zone.js. On Node.js, the `node` export condition
 * selects the entry that uses the native `AsyncLocalStorage`.
 *
 * @example
 * ```ts
 * import { AsyncContextManager } from "async-browser-context/opentelemetry";
 *
 * provider.register({ contextManager : new AsyncContextManager() });
 * ```
 *
 * @packageDocumentation
 */
import type { Context } from "@opentelemetry/api";
import { AsyncLocalStorage } from "./index.js";
import { defineContextManager, type AsyncContextManagerClass } from "./opentelemetry/context-manager.js";

/** The OpenTelemetry `ContextManager` that keeps the active context with `AsyncLocalStorage`. */
export const AsyncContextManager : AsyncContextManagerClass = defineContextManager(() => new AsyncLocalStorage<Context>({ name : "opentelemetry" }));
