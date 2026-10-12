import { describe, expect, it } from "vitest";
import { Variable } from "async-browser-context";
import { deferred } from "../helpers.js";

/**
 * The boundary of the realms (docs: concepts/boundaries, "Workers, iframes and other realms").
 * Each realm has its own global object and its own store. The library of this page does not
 * patch the APIs of another realm. A program sends the values in the message.
 */

const STORE_KEY = Symbol.for("async-browser-context/store/v1");

/** This function adds a same-origin iframe, starts `body` with its window, and removes the iframe. */
async function withFrame<T>(body : (frame : Window & typeof globalThis) => Promise<T> | T) : Promise<T> {
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    try {
        return await body(iframe.contentWindow as Window & typeof globalThis);
    } finally {
        iframe.remove();
    }
}

describe("the boundary of the realms: workers and iframes", () => {
    it("gives an iframe its own global object, without the store and the patches of this page", async () => {
        await withFrame((frame) => {
            expect((frame as unknown as Record<symbol, unknown>)[STORE_KEY]).toBeUndefined();
            expect(frame.setTimeout).not.toBe(setTimeout);
            expect(frame.Promise.prototype.then).not.toBe(Promise.prototype.then);
            expect(frame.EventTarget.prototype.addEventListener).not.toBe(EventTarget.prototype.addEventListener);
        });
    });

    it("does not give the context to a callback that an API of another realm starts", async () => {
        const variable = new Variable<string>();
        const seen = await withFrame((frame) => {
            const done = deferred<unknown>();
            variable.run("request", () => frame.setTimeout(() => done.resolve(variable.get()), 0));
            return done.promise;
        });
        // The timer of the iframe has no patch, so its callback starts in the root context
        expect(seen).toBeUndefined();
    });

    it("sends the value to a worker in the message, and the worker starts run() with it", async () => {
        const source = [
            "self.onmessage = ({ data }) => {",
            "    // The worker has no copy of the library here: it gives the value back with the result",
            "    self.postMessage({ requestId : data.requestId, result : data.job * 2 });",
            "};",
        ].join("\n");
        const url = URL.createObjectURL(new Blob([source], { type : "text/javascript" }));
        const worker = new Worker(url);
        try {
            const variable = new Variable<string>();
            const done = deferred<unknown>();
            variable.run("listener", () => {
                worker.onmessage = ({ data } : MessageEvent<{ requestId : string; result : number }>) => {
                    // The handler gets the context of its registration (rule C13), and the value of the request comes in the message
                    done.resolve({ context : variable.get(), fromMessage : variable.run(data.requestId, () => `${variable.get() ?? "none"}:${data.result}`) });
                };
            });
            variable.run("request-7", () => worker.postMessage({ requestId : variable.get(), job : 21 }));
            expect(await done.promise).toEqual({ context : "listener", fromMessage : "request-7:42" });
        } finally {
            worker.terminate();
            URL.revokeObjectURL(url);
        }
    });
});
