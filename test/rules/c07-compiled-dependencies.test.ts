import { describe, expect, it } from "vitest";
import { Variable } from "async-browser-context";
// @ts-expect-error The fixture is plain JavaScript without types
import * as babel from "../fixtures/untransformed-babel.js";
// @ts-expect-error The fixture is plain JavaScript without types
import * as transformedEs2015 from "../fixtures/compiled-tsc-es2015.js";
// @ts-expect-error The fixture is plain JavaScript without types
import * as es2015 from "../fixtures/untransformed-tsc-es2015.js";
// @ts-expect-error The fixture is plain JavaScript without types
import * as es5 from "../fixtures/untransformed-tsc-es5.js";
import { compiler, runtime } from "../helpers.js";

/** The functions of the compiled dependency. The source is at the end of this file. */
type Dependency = {
    compiledCall<T>(callback : () => T) : Promise<T>;
    compiledAfterTimer<T>(callback : () => T) : Promise<T>;
    compiledGenerator<T>(callback : () => T) : AsyncGenerator<T>;
};

const DEPENDENCIES : readonly (readonly [string, Dependency])[] = [
    ["TypeScript ES2015 output (__awaiter with generators), without the transform", es2015 as Dependency],
    ["TypeScript ES5 output (__awaiter with __generator), without the transform", es5 as Dependency],
    ["Babel output (_asyncToGenerator), without the transform", babel as Dependency],
    // The compiler of the project also changes this fixture: the preset, SWC, esbuild or none
    [`TypeScript ES2015 output, with the compiler of the project (${compiler})`, transformedEs2015 as Dependency],
];

/**
 * Many packages ship async functions that a compiler changed into helpers
 * such as `__awaiter`. The helpers continue the function in `then` callbacks,
 * and the patch of `then` gives each callback the context of its
 * registration. Thus such code keeps the context also without the transform.
 */
describe(`compiled dependencies (${runtime} runtime): async code that a compiler changed keeps the context`, () => {
    for (const [name, dependency] of DEPENDENCIES) {
        describe(name, () => {
            it("gives the context of each caller to a callback after the awaits, while another context operates", async () => {
                const variable = new Variable<string>();
                const fromA = variable.run("a", () => dependency.compiledCall(() => variable.get()));
                const fromB = variable.run("b", async () => {
                    await null;
                    return dependency.compiledCall(() => variable.get());
                });
                expect(await Promise.all([fromA, fromB])).toEqual(["a", "b"]);
            });

            it("gives the context of the caller to a callback after an await of a timer", async () => {
                const variable = new Variable<string>();
                const seen = await variable.run("a", () => dependency.compiledAfterTimer(() => variable.get()));
                expect(seen).toBe("a");
            });

            it("gives the context of the caller to a callback in a compiled async generator", async () => {
                const variable = new Variable<string>();
                const seen = await variable.run("a", async () => {
                    let value : unknown;
                    for await (const item of dependency.compiledGenerator(() => variable.get())) {
                        value = item;
                    }
                    return value;
                });
                expect(seen).toBe("a");
            });
        });
    }
});

/*
 * The source of the fixtures. The TypeScript fixtures come from tsc --target ES2015
 * and --target ES5 with --downlevelIteration, --module ES2015, --lib es2018,dom. The
 * Babel fixture comes from the tsc output for ES2022, compiled with the two
 * async plugins of Babel with their default options.
 *
 * export async function compiledCall<T>(callback : () => T) : Promise<T> {
 *     await null;
 *     await null;
 *     return callback();
 * }
 *
 * export async function compiledAfterTimer<T>(callback : () => T) : Promise<T> {
 *     await new Promise<void>((resolve) => setTimeout(resolve, 1));
 *     return callback();
 * }
 *
 * export async function* compiledGenerator<T>(callback : () => T) : AsyncGenerator<T> {
 *     await null;
 *     yield callback();
 * }
 */
