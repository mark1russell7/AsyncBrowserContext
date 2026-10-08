import { describe, expect, it } from "vitest";
import { Variable } from "async-browser-context";
import { deferred } from "../helpers.js";

/** Waits until the browser paints the next frame, so that observers get their records. */
function nextFrame() : Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

describe("browser schedulers (rule C6)", () => {
    it("applies the rule to requestAnimationFrame with two contexts", async () => {
        const variable = new Variable<string>();
        const fromA = deferred<unknown>();
        const fromB = deferred<unknown>();
        variable.run("a", () => requestAnimationFrame(() => fromA.resolve(variable.get())));
        variable.run("b", () => requestAnimationFrame(() => fromB.resolve(variable.get())));
        expect(await Promise.all([fromA.promise, fromB.promise])).toEqual(["a", "b"]);
    });

    it.skipIf(typeof requestIdleCallback !== "function")("applies the rule to requestIdleCallback (Safari has no requestIdleCallback)", async () => {
        const variable = new Variable<string>();
        const done = deferred<unknown>();
        variable.run("idle", () => requestIdleCallback(() => done.resolve(variable.get()), { timeout : 100 }));
        expect(await done.promise).toBe("idle");
    });

    it.skipIf(typeof (globalThis as { scheduler? : { postTask? : unknown } }).scheduler?.postTask !== "function")("applies the rule to scheduler.postTask where it exists", async () => {
        const variable = new Variable<string>();
        const scheduler = (globalThis as unknown as { scheduler : { postTask : (callback : () => unknown) => Promise<unknown> } }).scheduler;
        expect(await variable.run("task", () => scheduler.postTask(() => variable.get()))).toBe("task");
    });
});

describe("observers: the callback runs in the context of the construction", () => {
    it("applies the rule to MutationObserver when another context changes the DOM", async () => {
        const variable = new Variable<string>();
        const done = deferred<unknown>();
        const element = document.createElement("div");
        const observer = variable.run("observer", () => new MutationObserver(() => done.resolve(variable.get())));
        observer.observe(element, { childList : true });
        variable.run("mutation", () => element.append(document.createElement("span")));
        expect(await done.promise).toBe("observer");
        observer.disconnect();
    });

    it("applies the rule to ResizeObserver and IntersectionObserver", async () => {
        const variable = new Variable<string>();
        const element = document.createElement("div");
        element.style.width = "10px";
        element.style.height = "10px";
        document.body.append(element);
        const resized = deferred<unknown>();
        const intersected = deferred<unknown>();
        const resizeObserver = variable.run("resize", () => new ResizeObserver(() => resized.resolve(variable.get())));
        const intersectionObserver = variable.run("intersection", () => new IntersectionObserver(() => intersected.resolve(variable.get())));
        variable.run("other", () => {
            resizeObserver.observe(element);
            intersectionObserver.observe(element);
        });
        await nextFrame();
        expect(await resized.promise).toBe("resize");
        expect(await intersected.promise).toBe("intersection");
        resizeObserver.disconnect();
        intersectionObserver.disconnect();
        element.remove();
    });

    it("applies the rule to PerformanceObserver", async () => {
        const variable = new Variable<string>();
        const done = deferred<unknown>();
        const observer = variable.run("performance", () => new PerformanceObserver(() => done.resolve(variable.get())));
        observer.observe({ type : "mark" });
        variable.run("other", () => performance.mark("async-browser-context-test"));
        expect(await done.promise).toBe("performance");
        observer.disconnect();
    });

    it("keeps instanceof, the constructor and subclasses of the patched observers", () => {
        const observer = new MutationObserver(() => undefined);
        expect(observer).toBeInstanceOf(MutationObserver);
        expect(observer.constructor).toBe(MutationObserver);
        class Counting extends MutationObserver {}
        expect(new Counting(() => undefined)).toBeInstanceOf(Counting);
        expect(Function.prototype.toString.call(MutationObserver)).toContain("[native code]");
    });
});

describe("callback APIs: each callback runs in the context of the method call", () => {
    it("applies the rule to HTMLCanvasElement.toBlob", async () => {
        const variable = new Variable<string>();
        const done = deferred<unknown>();
        const canvas = document.createElement("canvas");
        variable.run("blob", () => canvas.toBlob(() => done.resolve(variable.get())));
        expect(await done.promise).toBe("blob");
    });

    it.skipIf(typeof navigator.locks?.request !== "function")("applies the rule to navigator.locks.request", async () => {
        const variable = new Variable<string>();
        const seen = await variable.run("lock", () => navigator.locks.request("async-browser-context-test", async () => {
            await null;
            return variable.get();
        }));
        expect(seen).toBe("lock");
    });

    it.skipIf(typeof (Array as { fromAsync? : unknown }).fromAsync !== "function")("applies the rule to the map function of Array.fromAsync", async () => {
        const variable = new Variable<string>();
        const fromAsync = (Array as unknown as { fromAsync : <T, U>(items : Iterable<T>, map : (value : T) => U) => Promise<U[]> }).fromAsync;
        const seen = await variable.run("map", () => fromAsync([Promise.resolve(1), 2], () => variable.get()));
        expect(seen).toEqual(["map", "map"]);
    });
});

describe("streams: the methods of the underlying object run in the context of the construction", () => {
    it("applies the rule to the pull method of a ReadableStream", async () => {
        const variable = new Variable<string>();
        const seen : unknown[] = [];
        const stream = variable.run("source", () => new ReadableStream<number>({
            pull(controller) {
                seen.push(variable.get());
                controller.enqueue(seen.length);
                if (seen.length === 2) {
                    controller.close();
                }
            },
        }));
        const values = await variable.run("reader", async () => {
            const read : number[] = [];
            for await (const value of stream as unknown as AsyncIterable<number>) {
                read.push(value);
            }
            return read;
        });
        expect(values).toEqual([1, 2]);
        expect(seen).toEqual(["source", "source"]);
    });

    it("applies the rule to a TransformStream and a WritableStream in a pipe", async () => {
        const variable = new Variable<string>();
        const seen : unknown[] = [];
        const upper = variable.run("transformer", () => new TransformStream<string, string>({
            transform(chunk, controller) {
                seen.push(`transform:${variable.get() ?? "none"}`);
                controller.enqueue(chunk.toUpperCase());
            },
        }));
        const written : string[] = [];
        const sink = variable.run("sink", () => new WritableStream<string>({
            write(chunk) {
                seen.push(`write:${variable.get() ?? "none"}`);
                written.push(chunk);
            },
        }));
        const source = new ReadableStream<string>({
            start(controller) {
                controller.enqueue("a");
                controller.close();
            },
        });
        await variable.run("pipe", () => source.pipeThrough(upper).pipeTo(sink));
        expect(written).toEqual(["A"]);
        expect(seen).toEqual(["transform:transformer", "write:sink"]);
    });

    it("keeps the other properties of the underlying object, for example type", () => {
        const stream = new ReadableStream({ type : "bytes", pull(controller) { controller.close(); } });
        expect(stream.getReader({ mode : "byob" })).toBeDefined();
    });
});
