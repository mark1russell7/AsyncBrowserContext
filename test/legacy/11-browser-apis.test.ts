import { describe, expect, it } from "vitest";
import { Snapshot, Variable } from "async-browser-context";
import { busyOther, deferred, inBrowser } from "../helpers.js";

/** A data URL that `fetch` reads without a network. */
const DATA_URL = "data:text/plain,hello";

/** Resolves when `count` values are in `values`. */
function collect<T>(count : number) : { readonly values : T[]; readonly push : (value : T) => void; readonly done : Promise<void> } {
    const values : T[] = [];
    const finished = deferred();
    return {
        values,
        push : (value : T) : void => {
            values.push(value);
            if (values.length === count) {
                finished.resolve();
            }
        },
        done : finished.promise,
    };
}

describe("legacy 11: browser APIs", () => {
    it("runs nested queueMicrotask callbacks in the context of the first call, while another context schedules its own", async () => {
        const variable = new Variable<string>();
        const seen = collect<string>(4);
        variable.run("nested-microtask", () => {
            queueMicrotask(() => {
                seen.push(`1:${variable.get() ?? "none"}`);
                queueMicrotask(() => {
                    seen.push(`2:${variable.get() ?? "none"}`);
                    queueMicrotask(() => {
                        seen.push(`3:${variable.get() ?? "none"}`);
                    });
                });
            });
        });
        variable.run("other", () => {
            queueMicrotask(() => {
                seen.push(`other:${variable.get() ?? "none"}`);
            });
        });
        await seen.done;
        expect([...seen.values].sort()).toEqual(["1:nested-microtask", "2:nested-microtask", "3:nested-microtask", "other:other"]);
    });

    it.skipIf(!inBrowser)("runs a requestAnimationFrame callback in the context of its call (browser only)", async () => {
        const variable = new Variable<string>();
        const seen = collect<string | undefined>(2);
        variable.run("raf-a", () => requestAnimationFrame(() => seen.push(variable.get())));
        variable.run("raf-b", () => requestAnimationFrame(() => seen.push(variable.get())));
        await seen.done;
        expect(seen.values).toEqual(["raf-a", "raf-b"]);
    });

    it.skipIf(!inBrowser)("runs a nested requestAnimationFrame callback in the context of the first call (browser only)", async () => {
        const variable = new Variable<string>();
        const seen = collect<string>(2);
        variable.run("nested-raf", () => {
            requestAnimationFrame(() => {
                seen.push(`1:${variable.get() ?? "none"}`);
                requestAnimationFrame(() => {
                    seen.push(`2:${variable.get() ?? "none"}`);
                });
            });
        });
        await seen.done;
        expect(seen.values).toEqual(["1:nested-raf", "2:nested-raf"]);
    });

    it.skipIf(!inBrowser || typeof requestIdleCallback !== "function")("runs a requestIdleCallback callback in the context of its call (browser with requestIdleCallback only)", async () => {
        const variable = new Variable<string>();
        const seen = collect<string | undefined>(2);
        variable.run("idle-a", () => requestIdleCallback(() => seen.push(variable.get()), { timeout : 100 }));
        variable.run("idle-b", () => requestIdleCallback(() => seen.push(variable.get()), { timeout : 100 }));
        await seen.done;
        expect([...seen.values].sort()).toEqual(["idle-a", "idle-b"]);
    });

    it.skipIf(!inBrowser)("runs an event listener in the context of the code that dispatches the event synchronously (browser only)", () => {
        const variable = new Variable<string>();
        const button = document.createElement("button");
        const seen : (string | undefined)[] = [];
        variable.run("registration", () => {
            button.addEventListener("click", () => {
                seen.push(variable.get());
            });
        });
        variable.run("dispatcher-a", () => button.click());
        variable.run("dispatcher-b", () => button.dispatchEvent(new MouseEvent("click")));
        expect(seen).toEqual(["dispatcher-a", "dispatcher-b"]);
    });

    it.skipIf(!inBrowser)("lets a listener use a snapshot for a context that is not the registration or the dispatch context (browser only)", () => {
        const variable = new Variable<string>();
        const snapshot = variable.run("snapshot-event", () => new Snapshot());
        const button = document.createElement("button");
        let seen : string | undefined;
        variable.run("registration", () => {
            button.addEventListener("click", () => {
                seen = snapshot.run(() => variable.get());
            });
        });
        variable.run("dispatcher", () => button.click());
        expect(seen).toBe("snapshot-event");
    });

    it.skipIf(!inBrowser)("runs each listener in its registration context when the root context dispatches the events (browser only)", () => {
        const variable = new Variable<string>();
        const element = document.createElement("button");
        const events : string[] = [];
        variable.run("click-context", () => {
            element.addEventListener("click", () => {
                events.push(`click:${variable.get() ?? "none"}`);
            });
        });
        variable.run("mousedown-context", () => {
            element.addEventListener("mousedown", () => {
                events.push(`mousedown:${variable.get() ?? "none"}`);
            });
        });
        element.click();
        element.dispatchEvent(new MouseEvent("mousedown"));
        expect(events).toEqual(["click:click-context", "mousedown:mousedown-context"]);
    });

    it.skipIf(!inBrowser)("runs a MutationObserver callback in the context of the construction, not of the mutation (browser only)", async () => {
        const variable = new Variable<string>();
        const seen = collect<{ readonly ctx : string | undefined; readonly count : number }>(1);
        const div = document.createElement("div");
        document.body.appendChild(div);
        const observer = variable.run("construction", () => new MutationObserver((mutations) => {
            seen.push({ ctx : variable.get(), count : mutations.length });
        }));
        try {
            observer.observe(div, { childList : true });
            variable.run("mutation", () => {
                div.appendChild(document.createElement("span"));
            });
            await seen.done;
        } finally {
            observer.disconnect();
            div.remove();
        }
        expect(seen.values).toEqual([{ ctx : "construction", count : 1 }]);
    });

    it.skipIf(!inBrowser)("runs an IntersectionObserver callback in the context of the construction (browser only)", async () => {
        const variable = new Variable<string>();
        const seen = collect<string | undefined>(1);
        const div = document.createElement("div");
        document.body.appendChild(div);
        const observer = variable.run("intersection-test", () => new IntersectionObserver(() => {
            seen.push(variable.get());
        }));
        try {
            variable.run("observe-call", () => observer.observe(div));
            await seen.done;
        } finally {
            observer.disconnect();
            div.remove();
        }
        expect(seen.values[0]).toBe("intersection-test");
    });

    it.skipIf(!inBrowser)("runs a ResizeObserver callback in the context of the construction (browser only)", async () => {
        const variable = new Variable<string>();
        const seen = collect<string | undefined>(1);
        const div = document.createElement("div");
        div.style.width = "100px";
        div.style.height = "10px";
        document.body.appendChild(div);
        const observer = variable.run("resize-test", () => new ResizeObserver(() => {
            seen.push(variable.get());
        }));
        try {
            variable.run("observe-call", () => {
                observer.observe(div);
                div.style.width = "200px";
            });
            await seen.done;
        } finally {
            observer.disconnect();
            div.remove();
        }
        expect(seen.values[0]).toBe("resize-test");
    });

    it.skipIf(!inBrowser)("runs a MessagePort onmessage handler in the context of the assignment (browser only)", async () => {
        const variable = new Variable<string>();
        const channel = new MessageChannel();
        const seen = collect<{ readonly data : unknown; readonly ctx : string | undefined }>(1);
        variable.run("handler-context", () => {
            channel.port2.onmessage = (event) => {
                seen.push({ data : event.data, ctx : variable.get() });
            };
        });
        variable.run("sender-context", () => channel.port1.postMessage("test-message"));
        await seen.done;
        channel.port1.close();
        expect(seen.values).toEqual([{ data : "test-message", ctx : "handler-context" }]);
    });

    it.skipIf(!inBrowser)("lets a MessagePort handler use a snapshot of the sender (browser only)", async () => {
        const variable = new Variable<string>();
        const channel = new MessageChannel();
        const seen = collect<string | undefined>(1);
        const snapshot = variable.run("snapshot-message", () => new Snapshot());
        channel.port2.onmessage = () => {
            seen.push(snapshot.run(() => variable.get()));
        };
        variable.run("sender", () => channel.port1.postMessage("with-snapshot"));
        await seen.done;
        channel.port1.close();
        expect(seen.values).toEqual(["snapshot-message"]);
    });

    it.skipIf(!inBrowser)("keeps the registration contexts of two concurrent MessageChannel handlers apart (browser only)", async () => {
        const variable = new Variable<string>();
        const first = new MessageChannel();
        const second = new MessageChannel();
        const seen = collect<string>(2);
        variable.run("ch1", () => {
            first.port2.addEventListener("message", (event) => seen.push(`${String(event.data)}:${variable.get() ?? "none"}`));
            first.port2.start();
        });
        variable.run("ch2", () => {
            second.port2.addEventListener("message", (event) => seen.push(`${String(event.data)}:${variable.get() ?? "none"}`));
            second.port2.start();
        });
        first.port1.postMessage("msg1");
        second.port1.postMessage("msg2");
        await seen.done;
        first.port1.close();
        second.port1.close();
        expect([...seen.values].sort()).toEqual(["msg1:ch1", "msg2:ch2"]);
    });

    it("keeps the context after an await of fetch and of the response body, while another context resumes first", async () => {
        const variable = new Variable<string>();
        const seen = await variable.run("fetch-test", async () => {
            const values : (string | undefined)[] = [];
            const other = busyOther(variable, "other", 10);
            const response = await fetch(DATA_URL);
            values.push(variable.get());
            const text = await response.text();
            values.push(variable.get());
            await other;
            return { text, values };
        });
        expect(seen).toEqual({ text : "hello", values : ["fetch-test", "fetch-test"] });
    });

    it("gives each of three concurrent fetch calls its own context", async () => {
        const variable = new Variable<string>();
        const request = (id : string) : Promise<string> => variable.run(id, async () => {
            const response = await fetch(DATA_URL);
            const before = variable.get() ?? "none";
            await response.text();
            return `${before}/${variable.get() ?? "none"}`;
        });
        expect(await Promise.all([request("req-1"), request("req-2"), request("req-3")])).toEqual(["req-1/req-1", "req-2/req-2", "req-3/req-3"]);
    });
});
