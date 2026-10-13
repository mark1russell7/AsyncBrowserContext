import { transformAsync, type NodePath, type PluginObject, type PluginPass, type types } from "@babel/core";
import { describe, expect, it } from "vitest";
import { asyncGeneratorResources } from "./async-generator-resources.js";
import { skipRuntimePlugin, withRuntimeSkipped, type PluginFactory } from "./skip-runtime.js";

/** Two functions with the directive of the runtime and two other functions. Each one starts `use` with its name. */
const INPUT = [
    "async function* runtimeGenerator() { 'async-browser-context runtime'; use('runtimeGenerator'); }",
    "async function runtimeFunction() { 'async-browser-context runtime'; use('runtimeFunction'); }",
    "async function* userGenerator() { use('userGenerator'); }",
    "async function userFunction() { use('userFunction'); }",
    "function* syncGenerator() { use('syncGenerator'); }",
].join("\n");

/** Transforms INPUT with the plugins, and gives the output. */
async function transform(plugins : PluginFactory[], code = INPUT) : Promise<string> {
    const result = await transformAsync(code, { filename : "input.js", babelrc : false, configFile : false, plugins });
    return result?.code ?? "";
}

/** A visitor that records the argument of each call of `use`. */
function recorder(seen : string[]) : { CallExpression : (path : NodePath<types.CallExpression>) => void } {
    return {
        CallExpression(path) {
            const [argument] = path.node.arguments;
            if (argument?.type === "StringLiteral") {
                seen.push(argument.value);
            }
        },
    };
}

describe("withRuntimeSkipped", () => {
    it("gives the same plugin when the plugin has no Program function", () => {
        const withoutVisitor : PluginObject<PluginPass> = { name : "without-visitor" };
        const withProgramObject : PluginObject<PluginPass> = { name : "program-object", visitor : { Program : { enter() {} } } };
        for (const plugin of [withoutVisitor, withProgramObject]) {
            expect(withRuntimeSkipped(() => plugin)({} as never, {}, "")).toBe(plugin);
        }
    });

    it("skips the functions of the runtime in the traversals of the Program function, with the state of the traversal", async () => {
        const seen : string[] = [];
        const states : unknown[] = [];
        let ownTraverseAfter : boolean | undefined;
        const factory : PluginFactory = () => ({
            name : "traversal",
            visitor : {
                Program(path, state) {
                    states.push(this, state);
                    path.traverse({
                        CallExpression(call, innerState) {
                            states.push(innerState);
                            recorder(seen).CallExpression(call);
                        },
                    }, "inner state");
                },
            },
            post(file) {
                ownTraverseAfter = Object.hasOwn(file.path, "traverse");
            },
        });
        await transform([withRuntimeSkipped(factory)]);
        expect(seen).toEqual(["userGenerator", "userFunction", "syncGenerator"]);
        expect(states[0]).toBe(states[1]);
        expect(states.slice(2)).toEqual(["inner state", "inner state", "inner state"]);
        // The traverse method of the prototype applies again after the Program function
        expect(ownTraverseAfter).toBe(false);
    });

    it("keeps the other visitors of the plugin", async () => {
        const seen : string[] = [];
        const factory : PluginFactory = () => ({ visitor : { Program() {}, ...recorder(seen) } });
        await transform([withRuntimeSkipped(factory)]);
        expect(seen).toContain("userFunction");
    });

    it("gives a plugin that skips the functions of the runtime in the main traversal", async () => {
        const seen : string[] = [];
        await transform([skipRuntimePlugin, () => ({ visitor : recorder(seen) })]);
        expect(seen).toEqual(["userGenerator", "userFunction", "syncGenerator"]);
    });
});

describe("asyncGeneratorResources", () => {
    it("starts the visitor of the plugin on each async generator that is not of the runtime", async () => {
        const seen : string[] = [];
        await transform([asyncGeneratorResources(() => ({ visitor : recorder(seen) }))]);
        expect(seen).toEqual(["userGenerator"]);
    });

    it("does nothing when the plugin has no visitor", async () => {
        const output = await transform([asyncGeneratorResources(() => ({}))]);
        expect(output).toBe(await transform([]));
    });
});
