import { describe, expect, it } from "vitest";
import { Variable } from "async-browser-context";
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
        const done = deferred<unknown>();
        variable.run("request-a", () => {
            const image = new Image();
            image.addEventListener("load", () => done.resolve(variable.get()));
            image.src = PIXEL;
        });
        variable.run("request-b", () => undefined);
        expect(await done.promise).toBe("request-a");
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

    it("applies the rule to MediaQueryList.addListener", () => {
        const query = window.matchMedia("(min-width: 1px)");
        const listener = () : void => undefined;
        expect(() => {
            query.addListener(listener);
            query.removeListener(listener);
        }).not.toThrow();
    });
});
