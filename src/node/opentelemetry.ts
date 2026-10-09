/**
 * The OpenTelemetry context manager of `async-browser-context` on Node.js. It
 * uses the native `AsyncLocalStorage`. The browser entry has the same API.
 *
 * @packageDocumentation
 */
import type { Context } from "@opentelemetry/api";
import { defineContextManager, type AsyncContextManagerClass } from "../opentelemetry/context-manager.js";
import { AsyncLocalStorage } from "./index.js";

/** The OpenTelemetry `ContextManager` that keeps the active context with the native `AsyncLocalStorage`. */
export const AsyncContextManager : AsyncContextManagerClass = defineContextManager(() => new AsyncLocalStorage<Context>({ name : "opentelemetry" }));
