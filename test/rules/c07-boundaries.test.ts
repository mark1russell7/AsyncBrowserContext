import { describe, expect, it } from "vitest";
import { AsyncContext, AsyncLocalStorage, Variable } from "async-browser-context";
// @ts-expect-error The fixture is plain JavaScript without types
import { createEmitter, libraryCall, libraryTimer } from "../fixtures/untransformed.js";
import { runtime } from "../helpers.js";

type LibraryCall = <T>(callback : () => T) => Promise<T>;
type Emitter = { on(listener : () => unknown) : void; emit() : unknown[] };

/**
 * The boundaries between transformed code and code without the transform
 * (docs: Boundaries). At each boundary, a tool of the library or a patched
 * API keeps the context. The tests state the same results on all runtimes.
 */
describe(`rule C7 at the boundaries (${runtime} runtime): the tools keep the context where code meets code without the transform`, () => {
    it("gives the context of bind() to a callback that the code without the transform starts after its native await", async () => {
        const variable = new Variable<string>();
        const seen = await variable.run("a", () => (libraryCall as LibraryCall)(AsyncLocalStorage.bind(() => variable.get())));
        expect(seen).toBe("a");
    });

    it("gives the context of Snapshot.wrap() to such a callback", async () => {
        const variable = new Variable<string>();
        const seen = await variable.run("a", () => (libraryCall as LibraryCall)(AsyncContext.Snapshot.wrap(() => variable.get())));
        expect(seen).toBe("a");
    });

    it("gives the context of AsyncLocalStorage.snapshot() to code that starts later, in another context", async () => {
        const variable = new Variable<string>();
        const snapshot = variable.run("a", () => AsyncLocalStorage.snapshot());
        const seen = await variable.run("b", () => (libraryCall as LibraryCall)(() => snapshot(() => variable.get())));
        expect(seen).toBe("a");
    });

    it("gives the context of the registration to a timer that the code starts before its first await", async () => {
        const variable = new Variable<string>();
        const seen = await variable.run("a", () => (libraryTimer as LibraryCall)(() => variable.get()));
        expect(seen).toBe("a");
    });

    it("gives a callback in a list of the library the context of emit(), and a bound callback the context of its registration", () => {
        const variable = new Variable<string>();
        const emitter = (createEmitter as () => Emitter)();
        variable.run("a", () => {
            emitter.on(() => variable.get());
            emitter.on(AsyncLocalStorage.bind(() => variable.get()));
        });
        expect(variable.run("b", () => emitter.emit())).toEqual(["b", "a"]);
    });

    it("gives the transformed caller its context after it awaits the promise of the code without the transform", async () => {
        const variable = new Variable<string>();
        const other = variable.run("b", async () => {
            await null;
            await null;
        });
        const seen = await variable.run("a", async () => {
            await (libraryCall as LibraryCall)(() => undefined);
            return variable.get();
        });
        await other;
        expect(seen).toBe("a");
    });
});
