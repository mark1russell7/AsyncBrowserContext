import { describe, expect, it } from "vitest";
import { Variable } from "async-browser-context";
// @ts-expect-error The fixture is plain JavaScript without types
import { libraryCall, libraryGenerator } from "../fixtures/untransformed.js";
import { runtime } from "../helpers.js";

type LibraryCall = <T>(callback : () => T) => Promise<T>;
type LibraryGenerator = <T>(callback : () => T) => AsyncGenerator<T>;

/**
 * On the browser runtime, code that the preset does not transform gets the
 * root context after its `await`. On Node.js, the native AsyncLocalStorage
 * keeps the context also in that code. On no runtime does the code get the
 * context of a different operation.
 */
const expected = runtime === "node" ? "a" : undefined;

describe("rule C7: code that the transform does not change never gets the context of another operation", () => {
    it("gives the root context (or the correct context on Node.js) to a callback after a native await", async () => {
        const variable = new Variable<string>();
        const fromA = variable.run("a", async () => await (libraryCall as LibraryCall)(() => variable.get()));
        // B resumes immediately before the native code of A
        const fromB = variable.run("b", async () => {
            await null;
            await null;
            return variable.get();
        });
        const [seenByA, seenByB] = await Promise.all([fromA, fromB]);
        expect(seenByA).toBe(expected);
        expect(seenByA).not.toBe("b");
        expect(seenByB).toBe("b");
    });

    it("gives the root context (or the correct context on Node.js) inside a native async generator", async () => {
        const variable = new Variable<string>();
        const seen = await variable.run("a", async () => {
            const other = variable.run("b", async () => {
                await null;
                await null;
            });
            let value : unknown;
            for await (const item of (libraryGenerator as LibraryGenerator)(() => variable.get())) {
                value = item;
            }
            await other;
            return value;
        });
        expect(seen).toBe(expected);
    });

    it("keeps the context of the transformed caller after it awaits native code", async () => {
        const variable = new Variable<string>();
        const seen = await variable.run("a", async () => {
            await (libraryCall as LibraryCall)(() => undefined);
            return variable.get();
        });
        expect(seen).toBe("a");
    });
});
