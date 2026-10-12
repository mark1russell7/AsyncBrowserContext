import { describe, expect, it } from "vitest";
import { AsyncLocalStorage, Variable } from "async-browser-context";
import { store } from "../../src/core/store.js";
import { deferred } from "../helpers.js";

/**
 * Rule C13: an event listener runs in the context of the code that dispatches
 * the event, if that context is not the root context. Else it runs in the
 * context of the addEventListener call, or of the assignment to the on...
 * property.
 */

/** A 1x1 transparent GIF. The browser loads it and dispatches "load" later. */
const PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

describe("rule C13: event listeners", () => {
    it("gives the context of the dispatch to a listener of a synchronous dispatch", () => {
        const variable = new Variable<string>();
        const target = new EventTarget();
        const seen : unknown[] = [];
        variable.run("registration", () => target.addEventListener("ping", () => seen.push(variable.get())));
        variable.run("dispatch", () => target.dispatchEvent(new Event("ping")));
        expect(seen).toEqual(["dispatch"]);
    });

    it("gives the registration context to a listener when the root context dispatches", () => {
        const variable = new Variable<string>();
        const target = new EventTarget();
        const seen : unknown[] = [];
        variable.run("registration", () => target.addEventListener("ping", () => seen.push(variable.get())));
        target.dispatchEvent(new Event("ping"));
        expect(seen).toEqual(["registration"]);
    });

    it("gives the registration context to a listener of an event that the browser dispatches later", async () => {
        const variable = new Variable<string>();
        const load = (request : string) : Promise<unknown> => variable.run(request, () => {
            const done = deferred<unknown>();
            const image = new Image();
            image.addEventListener("load", () => done.resolve(variable.get()));
            image.src = PIXEL;
            return done.promise;
        });
        // Two images load at the same time: each listener gets the context of its own request
        expect(await Promise.all([load("request-a"), load("request-b")])).toEqual(["request-a", "request-b"]);
    });

    it("gives the registration context to a browser event also after a top-level enterWith() (a default store)", async () => {
        const storage = new AsyncLocalStorage<string>();
        const nativeSetTimeout = store.originals.get(setTimeout) as typeof setTimeout;
        const done = deferred<unknown>();
        try {
            // A task without a wrapper, as the evaluation of a module: its enterWith() stays after the task
            await new Promise<void>((resolve) => nativeSetTimeout(() => {
                storage.enterWith("default");
                resolve();
            }, 0));
            storage.run("request", () => {
                const image = new Image();
                image.addEventListener("load", () => done.resolve(storage.getStore()));
                image.src = PIXEL;
            });
            expect(await done.promise).toBe("request");
            // Code of the default store that dispatches an event gives the registration context too, as code of the root context does
            const target = new EventTarget();
            const seen : unknown[] = [];
            storage.run("registration", () => target.addEventListener("ping", () => seen.push(storage.getStore())));
            nativeSetTimeout(() => target.dispatchEvent(new Event("ping")), 0);
            await new Promise((resolve) => nativeSetTimeout(resolve, 10));
            expect(seen).toEqual(["registration"]);
        } finally {
            // Also in a task without a wrapper: a step of this test sets its previous frame again at its end
            await new Promise<void>((resolve) => nativeSetTimeout(() => {
                store.current = store.root;
                store.idle = store.root;
                resolve();
            }, 0));
        }
    });

    it("gives the registration context to an on... handler of an event that the browser dispatches later", async () => {
        const variable = new Variable<string>();
        const done = deferred<unknown>();
        variable.run("reader", () => {
            const reader = new FileReader();
            reader.onload = () => done.resolve(variable.get());
            reader.readAsText(new Blob(["text"]));
        });
        expect(await done.promise).toBe("reader");
    });

    it("gives the registration context to a MessagePort handler", async () => {
        const variable = new Variable<string>();
        const done = deferred<unknown>();
        const channel = new MessageChannel();
        variable.run("receiver", () => {
            channel.port2.onmessage = () => done.resolve(variable.get());
        });
        variable.run("sender", () => channel.port1.postMessage("hello"));
        expect(await done.promise).toBe("receiver");
        channel.port1.close();
        channel.port2.close();
    });

    it("gives the context of element.click() to the click listeners", () => {
        const variable = new Variable<string>();
        const button = document.createElement("button");
        const seen : unknown[] = [];
        button.addEventListener("click", () => seen.push(variable.get()));
        button.onclick = () => seen.push(variable.get());
        variable.run("clicker", () => button.click());
        expect(seen).toEqual(["clicker", "clicker"]);
    });

    it("gives the original handler from the on... getter, and accepts null", () => {
        const target = document.createElement("div");
        const handler = () : void => undefined;
        target.onclick = handler;
        expect(target.onclick).toBe(handler);
        target.onclick = null;
        expect(target.onclick).toBeNull();
    });

    it("sends all arguments to window.onerror and keeps its return value", () => {
        const variable = new Variable<string>();
        const seen : unknown[] = [];
        const previous = window.onerror;
        variable.run("handler", () => {
            window.onerror = (message, source, line) => {
                seen.push(message, source, line, variable.get());
                // true cancels the error event
                return true;
            };
        });
        try {
            // The browser gives five arguments to window.onerror, not the event
            const event = new ErrorEvent("error", { message : "message", filename : "source.js", lineno : 7, colno : 1, cancelable : true });
            window.dispatchEvent(event);
            expect(seen).toEqual(["message", "source.js", 7, "handler"]);
            expect(event.defaultPrevented).toBe(true);
        } finally {
            window.onerror = previous;
        }
    });

    it("removes a listener with removeEventListener", () => {
        const target = new EventTarget();
        let count = 0;
        const listener = () : void => { count++; };
        target.addEventListener("ping", listener);
        target.removeEventListener("ping", listener);
        target.dispatchEvent(new Event("ping"));
        expect(count).toBe(0);
    });

    it("does not register the same listener two times, as the DOM does", () => {
        const target = new EventTarget();
        let count = 0;
        const listener = () : void => { count++; };
        target.addEventListener("ping", listener);
        target.addEventListener("ping", listener);
        target.dispatchEvent(new Event("ping"));
        expect(count).toBe(1);
        target.addEventListener("ping", listener, { capture : true });
        target.dispatchEvent(new Event("ping"));
        expect(count).toBe(3);
    });

    it("calls a once listener one time, and lets the program register it again", () => {
        const variable = new Variable<string>();
        const target = new EventTarget();
        const seen : unknown[] = [];
        const listener = () : void => { seen.push(variable.get()); };
        variable.run("first", () => target.addEventListener("ping", listener, { once : true }));
        target.dispatchEvent(new Event("ping"));
        target.dispatchEvent(new Event("ping"));
        variable.run("second", () => target.addEventListener("ping", listener, { once : true }));
        target.dispatchEvent(new Event("ping"));
        expect(seen).toEqual(["first", "second"]);
    });

    it("removes a listener when its signal aborts", () => {
        const target = new EventTarget();
        const controller = new AbortController();
        let count = 0;
        target.addEventListener("ping", () => { count++; }, { signal : controller.signal });
        target.dispatchEvent(new Event("ping"));
        controller.abort();
        target.dispatchEvent(new Event("ping"));
        expect(count).toBe(1);
    });

    it("calls handleEvent of a listener object with the object as this", () => {
        const variable = new Variable<string>();
        const target = new EventTarget();
        const listener = {
            seen : [] as unknown[],
            handleEvent(this : { seen : unknown[] }) : void {
                this.seen.push(variable.get());
            },
        };
        variable.run("object", () => target.addEventListener("ping", listener));
        target.dispatchEvent(new Event("ping"));
        expect(listener.seen).toEqual(["object"]);
    });

    it("gives the current target as this to a function listener", () => {
        const target = new EventTarget();
        let self : unknown;
        target.addEventListener("ping", function (this : unknown) { self = this; });
        target.dispatchEvent(new Event("ping"));
        expect(self).toBe(target);
    });

    it("applies the rule to MediaQueryList.addListener, also for a listener object, and removes with removeListener", () => {
        const variable = new Variable<string>();
        const query = window.matchMedia("(min-width: 1px)");
        const seen : unknown[] = [];
        const listener = () : void => { seen.push(`function ${variable.get() ?? "none"}`); };
        const object = { handleEvent() : void { seen.push(`object ${variable.get() ?? "none"}`); } };
        variable.run("registered", () => {
            query.addListener(listener);
            query.addListener(object as unknown as (event : MediaQueryListEvent) => void);
        });
        query.dispatchEvent(new Event("change"));
        query.removeListener(listener);
        query.removeListener(object as unknown as (event : MediaQueryListEvent) => void);
        query.dispatchEvent(new Event("change"));
        expect(seen).toEqual(["function registered", "object registered"]);
    });

    it("accepts null and other values as options, as the DOM does", () => {
        const target = new EventTarget();
        let calls = 0;
        const listener = () : void => { calls++; };
        target.addEventListener("x", listener, null as unknown as boolean);
        target.dispatchEvent(new Event("x"));
        target.removeEventListener("x", listener, null as unknown as boolean);
        target.dispatchEvent(new Event("x"));
        expect(calls).toBe(1);
    });

    it("reads capture and once with ToBoolean, as the DOM does", () => {
        const target = new EventTarget();
        let calls = 0;
        const listener = () : void => { calls++; };
        target.addEventListener("x", listener, { capture : 1 } as unknown as AddEventListenerOptions);
        target.removeEventListener("x", listener, true);
        target.dispatchEvent(new Event("x"));
        target.addEventListener("x", listener, 1 as unknown as boolean);
        target.addEventListener("x", listener, false);
        target.removeEventListener("x", listener, true);
        target.removeEventListener("x", listener, false);
        target.dispatchEvent(new Event("x"));
        target.addEventListener("x", listener, { once : 1 } as unknown as AddEventListenerOptions);
        target.dispatchEvent(new Event("x"));
        target.dispatchEvent(new Event("x"));
        expect(calls).toBe(1);
    });

    it("keeps a capture listener and a listener without capture apart, as the DOM does", () => {
        const variable = new Variable<string>();
        const target = new EventTarget();
        const seen : unknown[] = [];
        const listener = () : void => { seen.push(variable.get()); };
        variable.run("capture", () => target.addEventListener("x", listener, true));
        variable.run("bubble", () => target.addEventListener("x", listener, false));
        target.dispatchEvent(new Event("x"));
        // A removal with the other capture flag does not remove the capture listener
        target.removeEventListener("x", listener, false);
        target.removeEventListener("x", listener, { capture : false });
        target.dispatchEvent(new Event("x"));
        target.removeEventListener("x", listener, { capture : true });
        target.dispatchEvent(new Event("x"));
        expect(seen).toEqual(["capture", "bubble", "capture"]);
    });

    it("keeps the first registration and its context for a second registration of the same listener", () => {
        const variable = new Variable<string>();
        const target = new EventTarget();
        const seen : unknown[] = [];
        const listener = () : void => { seen.push(variable.get()); };
        variable.run("first", () => target.addEventListener("x", listener));
        variable.run("second", () => target.addEventListener("x", listener));
        target.dispatchEvent(new Event("x"));
        expect(seen).toEqual(["first"]);
    });

    it("gives a new registration and its context after the abort of the signal or after a once call", () => {
        const variable = new Variable<string>();
        const target = new EventTarget();
        const seen : unknown[] = [];
        const listener = () : void => { seen.push(variable.get()); };
        const controller = new AbortController();
        variable.run("first", () => target.addEventListener("x", listener, { signal : controller.signal }));
        controller.abort();
        variable.run("second", () => target.addEventListener("x", listener, { once : true }));
        target.dispatchEvent(new Event("x"));
        variable.run("third", () => target.addEventListener("x", listener));
        target.dispatchEvent(new Event("x"));
        expect(seen).toEqual(["second", "third"]);
    });

    it("can remove a listener that an abort listener adds again during the abort", () => {
        const target = new EventTarget();
        const controller = new AbortController();
        let calls = 0;
        const listener = () : void => { calls++; };
        controller.signal.addEventListener("abort", () => target.addEventListener("x", listener));
        target.addEventListener("x", listener, { signal : controller.signal });
        controller.abort();
        target.removeEventListener("x", listener);
        target.dispatchEvent(new Event("x"));
        expect(calls).toBe(0);
    });

    it("keeps no registration when the native addEventListener throws", () => {
        const variable = new Variable<string>();
        const target = new EventTarget();
        const seen : unknown[] = [];
        const listener = () : void => { seen.push(variable.get()); };
        variable.run("failed", () => {
            expect(() => target.addEventListener("x", listener, { signal : 1 } as unknown as AddEventListenerOptions)).toThrow(TypeError);
        });
        variable.run("valid", () => target.addEventListener("x", listener));
        target.dispatchEvent(new Event("x"));
        expect(seen).toEqual(["valid"]);
    });

    it("gives the handler of body.onload also from window.onload, as the browser reflects them", () => {
        const handler = () : void => undefined;
        document.body.onload = handler;
        try {
            expect(window.onload).toBe(handler);
            expect(document.body.onload).toBe(handler);
        } finally {
            document.body.onload = null;
        }
    });

    it("throws as the native methods do when an argument is missing", () => {
        const target = new EventTarget();
        expect(() => (target.addEventListener as unknown as (type : string) => void)("x")).toThrow(TypeError);
        expect(() => (target.removeEventListener as unknown as (type : string) => void)("x")).toThrow(TypeError);
    });
});

describe("rule C13: the patch of the on... properties", () => {
    /**
     * The event patch reads only the globals in HANDLER_INTERFACES. This test
     * reads all globals of the browser, and finds each on... property of each
     * EventTarget class and of the global object. Each property must have the
     * patch: the store records the original setter of each patched setter.
     */
    it("patches each on... property of each interface of this browser", () => {
        const eventTargetPrototype = EventTarget.prototype;
        const owners : [string, object][] = [["globalThis", globalThis]];
        for (const name of Object.getOwnPropertyNames(globalThis)) {
            const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
            const value : unknown = descriptor !== undefined && "value" in descriptor ? descriptor.value : undefined;
            if (typeof value !== "function") {
                continue;
            }
            const prototype : unknown = (value as { prototype? : unknown }).prototype;
            if (typeof prototype === "object" && prototype !== null && Object.prototype.isPrototypeOf.call(eventTargetPrototype, prototype)) {
                owners.push([name, prototype]);
            }
        }
        const missing : string[] = [];
        let patched = 0;
        for (const [name, owner] of owners) {
            for (const key of Object.getOwnPropertyNames(owner)) {
                const descriptor = Object.getOwnPropertyDescriptor(owner, key);
                if (!key.startsWith("on") || descriptor?.set === undefined || descriptor.configurable !== true) {
                    continue;
                }
                if (store.originals.has(descriptor.set)) {
                    patched++;
                } else {
                    missing.push(`${name}.${key}`);
                }
            }
        }
        expect(missing, "add the interface of each property to src/patches/handler-interfaces.ts").toEqual([]);
        expect(patched).toBeGreaterThan(100);
    });
});
