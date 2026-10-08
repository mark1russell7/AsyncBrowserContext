import { describe, expect, it } from "vitest";
import { Variable } from "async-browser-context";
import { inBrowser, turns } from "../helpers.js";

/**
 * Runs `read` in a task that the library does not start from a context: a
 * message of a `MessageChannel` in a browser, `process.nextTick` on Node.js.
 * The root context sends the message, so a correct runtime gives the root
 * context. A runtime that leaks a context gives the leaked context.
 */
function inUnrelatedTask<T>(read : () => T) : Promise<T> {
    return new Promise((resolve) => {
        if (inBrowser) {
            const channel = new MessageChannel();
            channel.port2.onmessage = () => {
                channel.port1.close();
                resolve(read());
            };
            channel.port1.postMessage(null);
        } else {
            process.nextTick(() => resolve(read()));
        }
    });
}

describe("rule C1: outside a context, get() gives the default value", () => {
    it("gives undefined without a default value, and the default value with one", () => {
        expect(new Variable<string>().get()).toBeUndefined();
        expect(new Variable({ defaultValue : "default" }).get()).toBe("default");
    });

    it("gives the default value after a synchronous run() returns or throws", () => {
        const variable = new Variable({ defaultValue : "default" });
        variable.run("inside", () => undefined);
        expect(variable.get()).toBe("default");
        expect(() => variable.run("inside", () => { throw new Error("stop"); })).toThrow("stop");
        expect(variable.get()).toBe("default");
    });

    it("gives the root context to an unrelated task after an async run() ends", async () => {
        const variable = new Variable<string>();
        await variable.run("request-a", async () => {
            await turns(3);
        });
        expect(await inUnrelatedTask(() => variable.get())).toBeUndefined();
    });

    it("gives the root context to an unrelated task while a run() is suspended", async () => {
        const variable = new Variable<string>();
        let release! : () => void;
        const suspended = variable.run("request-a", async () => {
            await new Promise<void>((resolve) => { release = resolve; });
        });
        await turns(2);
        expect(await inUnrelatedTask(() => variable.get())).toBeUndefined();
        release();
        await suspended;
    });

    it("gives the context of the caller after the caller awaits a function in another context", async () => {
        const variable = new Variable<string>();
        const seen = await variable.run("outer", async () => {
            await variable.run("inner", async () => {
                await turns(2);
            });
            return variable.get();
        });
        expect(seen).toBe("outer");
        expect(variable.get()).toBeUndefined();
    });
});
