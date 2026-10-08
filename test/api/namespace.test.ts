import { describe, expect, it } from "vitest";
import { AsyncContext, AsyncSnapshot, AsyncVariable, Snapshot, Variable } from "async-browser-context";

describe("the public API", () => {
    it("gives the TC39 namespace object with Variable and Snapshot", () => {
        expect(AsyncContext.Variable).toBe(Variable);
        expect(AsyncContext.Snapshot).toBe(Snapshot);
        expect(Object.isFrozen(AsyncContext)).toBe(true);
    });

    it("gives the aliases AsyncVariable and AsyncSnapshot", () => {
        expect(AsyncVariable).toBe(Variable);
        expect(AsyncSnapshot).toBe(Snapshot);
    });

    it("converts the name of a Variable to a string, with the empty string as the default", () => {
        expect(new Variable().name).toBe("");
        expect(new Variable({ name : "requestId" }).name).toBe("requestId");
        expect(new Variable({ name : 42 as unknown as string }).name).toBe("42");
    });

    it("needs new for Variable and Snapshot", () => {
        expect(() => (Variable as unknown as () => void)()).toThrow(TypeError);
        expect(() => (Snapshot as unknown as () => void)()).toThrow(TypeError);
    });
});
