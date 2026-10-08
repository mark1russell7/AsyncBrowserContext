import { bindToFrame, store } from "../core/store.js";
import { claim, ownDataValue, rememberOriginal } from "./patch.js";

/**
 * The constructors that get a callback as their first argument and use it
 * later. The callback operates in the context of the construction. The TC39 draft
 * specifies this rule for `FinalizationRegistry`.
 */
const CONSTRUCTORS = [
    "MutationObserver",
    "WebKitMutationObserver",
    "ResizeObserver",
    "IntersectionObserver",
    "PerformanceObserver",
    "ReportingObserver",
    "PressureObserver",
    "FinalizationRegistry",
] as const;

type Constructor = new (...args : unknown[]) => object;

/**
 * This function replaces each constructor with a `Proxy`. A `Proxy` keeps `instanceof`,
 * subclasses, the static members and the native `toString()` of the
 * constructor.
 */
export function installObserverPatches() : void {
    if (!claim("observers")) {
        return;
    }
    const proxies = new Map<Constructor, Constructor>();
    for (const name of CONSTRUCTORS) {
        const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
        const native = ownDataValue(globalThis, name);
        if (typeof native !== "function" || descriptor?.configurable !== true) {
            continue;
        }
        const constructor = native as Constructor;
        // WebKitMutationObserver can be the same function as MutationObserver
        let proxy = proxies.get(constructor);
        if (proxy === undefined) {
            proxy = new Proxy(constructor, {
                construct(target, args : unknown[], newTarget : Function) : object {
                    const callback = args[0];
                    if (typeof callback === "function") {
                        args[0] = bindToFrame(store.current, callback as (...values : unknown[]) => unknown);
                    }
                    return Reflect.construct(target, args, newTarget) as object;
                },
            });
            proxies.set(constructor, proxy);
            rememberOriginal(proxy, constructor);
            const prototype = (constructor as { prototype? : unknown }).prototype;
            if (typeof prototype === "object" && prototype !== null) {
                const constructorDescriptor = Object.getOwnPropertyDescriptor(prototype, "constructor");
                if (constructorDescriptor?.configurable === true) {
                    Object.defineProperty(prototype, "constructor", { ...constructorDescriptor, value : proxy });
                }
            }
        }
        Object.defineProperty(globalThis, name, { ...descriptor, value : proxy });
    }
}
