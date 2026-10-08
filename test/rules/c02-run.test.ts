import { describe, expect, it } from "vitest";
import { Variable } from "async-browser-context";

describe("rule C2: run(value, fn) sets value while fn runs", () => {
    it("gives the value inside fn and the previous value after fn", () => {
        const variable = new Variable<string>();
        variable.run("outer", () => {
            expect(variable.get()).toBe("outer");
            variable.run("inner", () => {
                expect(variable.get()).toBe("inner");
            });
            expect(variable.get()).toBe("outer");
        });
        expect(variable.get()).toBeUndefined();
    });

    it("sets the previous value again when fn throws", () => {
        const variable = new Variable<string>();
        variable.run("outer", () => {
            expect(() => variable.run("inner", () => { throw new Error("stop"); })).toThrow("stop");
            expect(variable.get()).toBe("outer");
        });
    });

    it("gives the result of fn and sends the arguments to fn", () => {
        const variable = new Variable<string>();
        const result = variable.run("value", (a : number, b : number) => `${variable.get() ?? ""}:${a + b}`, 2, 3);
        expect(result).toBe("value:5");
    });

    it("keeps the values of two variables apart", () => {
        const first = new Variable<string>();
        const second = new Variable<string>();
        first.run("first-a", () => {
            second.run("second-a", () => {
                first.run("first-b", () => {
                    expect(first.get()).toBe("first-b");
                    expect(second.get()).toBe("second-a");
                });
                expect(first.get()).toBe("first-a");
            });
            expect(second.get()).toBeUndefined();
        });
    });

    it("tells an explicit undefined apart from no value", () => {
        const variable = new Variable<string | undefined>({ defaultValue : "default" });
        variable.run(undefined, () => {
            expect(variable.get()).toBeUndefined();
        });
        expect(variable.get()).toBe("default");
    });

    it("keeps falsy values and objects unchanged", () => {
        const variable = new Variable<unknown>();
        const object = { id : 1 };
        for (const value of [0, "", false, null, Number.NaN, object]) {
            variable.run(value, () => {
                expect(Object.is(variable.get(), value)).toBe(true);
            });
        }
    });

    it("throws a TypeError when fn is not a function, and keeps the previous value", () => {
        const variable = new Variable<string>();
        variable.run("outer", () => {
            expect(() => variable.run("inner", 42 as unknown as () => void)).toThrow(TypeError);
            expect(variable.get()).toBe("outer");
        });
    });
});
