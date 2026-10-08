import { describe, expect, it } from "vitest";
import { store } from "./core/store.js";
import { install } from "./install.js";

describe("install", () => {
    it("installs each patch one time, also when the program calls it again", () => {
        const before = { then : Promise.prototype.then, setTimeout, toString : Function.prototype.toString };
        install();
        expect(Promise.prototype.then).toBe(before.then);
        expect(setTimeout).toBe(before.setTimeout);
        expect(Function.prototype.toString).toBe(before.toString);
    });

    it("records the names of the patches in the store", () => {
        for (const name of ["Promise.prototype.then", "timers", "events", "observers", "callbacks", "streams", "Function.prototype.toString"]) {
            expect(store.patches.has(name)).toBe(true);
        }
    });

    it("keeps the native TypeError of Function.prototype.toString for a value that is not a function", () => {
        expect(() => Function.prototype.toString.call("text")).toThrow(TypeError);
        expect(() => Function.prototype.toString.call({})).toThrow(TypeError);
    });

    it("gives the original source text of a patched function", () => {
        expect(Function.prototype.toString.call(Promise.prototype.then)).toContain("[native code]");
    });

    it("keeps the native error of setTimeout for a callback that is not a function (Node.js)", () => {
        expect(() => setTimeout("text" as unknown as () => void, 1)).toThrow();
    });
});
