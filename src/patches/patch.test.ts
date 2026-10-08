import { describe, expect, it } from "vitest";
import { createFrame, enter, store } from "../core/store.js";
import { claim, globalPrototype, ownDataValue, rememberOriginal, replaceFunction, wrapFunctionArguments } from "./patch.js";

describe("the patch helpers", () => {
    it("claims a patch one time", () => {
        const name = `test-patch-${Math.random()}`;
        expect(claim(name)).toBe(true);
        expect(claim(name)).toBe(false);
    });

    it("replaces a function and keeps its attributes, name, length and other properties", () => {
        const marker = Symbol("marker");
        const original = Object.assign(function original(a : number, b : number) : number {
            return a + b;
        }, { [marker] : "kept", extra : 1 });
        const owner = {};
        Object.defineProperty(owner, "method", { value : original, writable : true, enumerable : false, configurable : true });
        const replaced = replaceFunction<(a : number, b : number) => number>(owner, "method", (native) => function (a, b) {
            return native(a, b) * 10;
        });
        const descriptor = Object.getOwnPropertyDescriptor(owner, "method");
        const replacement = descriptor?.value as typeof original;
        expect(replaced).toBe(true);
        expect(replacement(1, 2)).toBe(30);
        expect(replacement.name).toBe("original");
        expect(replacement.length).toBe(2);
        expect(replacement[marker]).toBe("kept");
        expect(replacement.extra).toBe(1);
        expect(descriptor?.enumerable).toBe(false);
        expect(store.originals.get(replacement)).toBe(original);
    });

    it("does not replace a property that is not a configurable function", () => {
        const owner = { value : 1 };
        Object.defineProperty(owner, "fixed", { value : () => 1, configurable : false });
        expect(replaceFunction(owner, "value", (native) => native)).toBe(false);
        expect(replaceFunction(owner, "fixed", (native) => native)).toBe(false);
        expect(replaceFunction(owner, "missing", (native) => native)).toBe(false);
    });

    it("records the original of an original, so that two patches show the first function", () => {
        const first = () : void => undefined;
        const second = () : void => undefined;
        const third = () : void => undefined;
        rememberOriginal(second, first);
        rememberOriginal(third, second);
        expect(store.originals.get(third)).toBe(first);
    });

    it("reads own data properties without getters, and finds global prototypes", () => {
        const owner = {};
        let called = false;
        Object.defineProperty(owner, "accessor", { get() { called = true; return 1; } });
        expect(ownDataValue(owner, "accessor")).toBeUndefined();
        expect(called).toBe(false);
        expect(globalPrototype("Promise")).toBe(Promise.prototype);
        expect(globalPrototype("NoSuchConstructor")).toBeUndefined();
    });

    it("wraps only the function arguments, with the current frame", () => {
        const frame = createFrame(store.root, {}, 0);
        const previous = enter(frame);
        let args : unknown[];
        try {
            args = wrapFunctionArguments([1, () => store.current, "x"]);
        } finally {
            enter(previous);
        }
        expect(args[0]).toBe(1);
        expect(args[2]).toBe("x");
        expect((args[1] as () => unknown)()).toBe(frame);
        const unchanged = [1, 2];
        expect(wrapFunctionArguments(unchanged)).toBe(unchanged);
    });

    it("keeps the own prototype object of the replacement", () => {
        function original() : void {
            return undefined;
        }
        const owner = { method : original };
        replaceFunction<() => void>(owner, "method", () => function replacement() : void {
            return undefined;
        });
        expect(owner.method.prototype).not.toBe(original.prototype);
    });

    it("gives no prototype for a global function without a prototype object", () => {
        const holder = globalThis as unknown as Record<string, unknown>;
        function withNull() : void {
            return undefined;
        }
        (withNull as { prototype : unknown }).prototype = null;
        function withNumber() : void {
            return undefined;
        }
        (withNumber as { prototype : unknown }).prototype = 5;
        holder["__testArrow"] = () : void => undefined;
        holder["__testNullPrototype"] = withNull;
        holder["__testNumberPrototype"] = withNumber;
        try {
            expect(globalPrototype("__testArrow")).toBeUndefined();
            expect(globalPrototype("__testNullPrototype")).toBeUndefined();
            expect(globalPrototype("__testNumberPrototype")).toBeUndefined();
        } finally {
            delete holder["__testArrow"];
            delete holder["__testNullPrototype"];
            delete holder["__testNumberPrototype"];
        }
    });
});
