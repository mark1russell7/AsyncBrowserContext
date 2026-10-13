import { parseSync, traverse, types, type NodePath } from "@babel/core";
import { describe, expect, it } from "vitest";
import { isRuntimeCallee, isRuntimeFunction, RUNTIME_DIRECTIVE } from "./runtime-calls.js";

const RUNTIME = "async-browser-context/runtime";

/** Parses `code` and gives `true` if the callee of the call in the last statement is the function `name` of the runtime. */
function isRuntime(code : string, name = "bindGenerator", sourceType : "module" | "script" = "script") : boolean {
    const ast = parseSync(code, { filename : "input.js", babelrc : false, configFile : false, sourceType });
    if (ast === null) throw new Error("Babel did not parse the code");
    let result : boolean | undefined;
    traverse(ast, {
        Program(program : NodePath<types.Program>) {
            const statements = program.get("body");
            const last = statements[statements.length - 1] as NodePath;
            const call = last.get("expression") as NodePath;
            if (!call.isCallExpression()) throw new Error("The last statement is not a call");
            result = isRuntimeCallee(call.get("callee"), RUNTIME, name);
        },
    });
    return result as boolean;
}

describe("the functions of the runtime in the output of the tools", () => {
    it("are the imports of the runtime module with the same export name", () => {
        expect(isRuntime(`import { bindGenerator as bind } from "${RUNTIME}"; bind(it);`, "bindGenerator", "module")).toBe(true);
        expect(isRuntime(`import { other as bind } from "${RUNTIME}"; bind(it);`, "bindGenerator", "module")).toBe(false);
        expect(isRuntime(`import { bindGenerator as bind } from "other"; bind(it);`, "bindGenerator", "module")).toBe(false);
    });

    it("are the members of require(runtime), also through a helper with more arguments", () => {
        expect(isRuntime(`var _r = require("${RUNTIME}"); _r.bindGenerator(it);`)).toBe(true);
        expect(isRuntime(`var _r = require("${RUNTIME}"); (0, _r.bindGenerator)(it);`)).toBe(true);
        expect(isRuntime(`var _r = _interopRequireWildcard(require("${RUNTIME}"), true); (0, _r.bindGenerator)(it);`)).toBe(true);
        expect(isRuntime(`var _r = __toESM(require("${RUNTIME}")).default; _r.bindGenerator(it);`)).toBe(true);
        expect(isRuntime(`require("${RUNTIME}").bindGenerator(it);`)).toBe(true);
    });

    it("are the locals of a member of require(runtime) with the same name", () => {
        expect(isRuntime(`var bind = require("${RUNTIME}").bindGenerator; bind(it);`)).toBe(true);
        expect(isRuntime(`var bind = _interopRequireDefault(require("${RUNTIME}")).bindGenerator; bind(it);`)).toBe(true);
        expect(isRuntime(`var bind = require("${RUNTIME}").other; bind(it);`)).toBe(false);
        expect(isRuntime(`var bind = require("other").bindGenerator; bind(it);`)).toBe(false);
        expect(isRuntime(`var bind = load.bindGenerator; bind(it);`)).toBe(false);
    });

    it("are not the members of another module or another value", () => {
        expect(isRuntime(`var _r = require("other"); _r.bindGenerator(it);`)).toBe(false);
        expect(isRuntime(`var _r = load("${RUNTIME}"); _r.bindGenerator(it);`)).toBe(false);
        expect(isRuntime(`var _r = load(); _r.bindGenerator(it);`)).toBe(false);
        expect(isRuntime(`var _r = other; _r.bindGenerator(it);`)).toBe(false);
        expect(isRuntime(`var _r = other.member; _r.bindGenerator(it);`)).toBe(false);
        expect(isRuntime(`var _r; _r.bindGenerator(it);`)).toBe(false);
        expect(isRuntime(`function f(_r) { return _r.bindGenerator(it); } _r.bindGenerator(it);`)).toBe(false);
        expect(isRuntime(`load().bindGenerator(it);`)).toBe(false);
    });

    it("are not other members or computed members of require(runtime)", () => {
        expect(isRuntime(`var _r = require("${RUNTIME}"); _r.other(it);`)).toBe(false);
        expect(isRuntime(`var _r = require("${RUNTIME}"); _r[bindGenerator](it);`)).toBe(false);
        expect(isRuntime(`var _r = require("${RUNTIME}"); (_r.bindGenerator, other)(it);`)).toBe(false);
    });

    it("are inside at most three helper calls or members around require(runtime)", () => {
        expect(isRuntime(`var _r = a(b(c(require("${RUNTIME}")))); _r.bindGenerator(it);`)).toBe(true);
        expect(isRuntime(`var _r = a(b(c(d(require("${RUNTIME}"))))); _r.bindGenerator(it);`)).toBe(false);
        expect(isRuntime(`var _r = require("${RUNTIME}").a.b.c; _r.bindGenerator(it);`)).toBe(true);
        expect(isRuntime(`var _r = require("${RUNTIME}").a.b.c.d; _r.bindGenerator(it);`)).toBe(false);
    });

    it("are the local names that Babel gives, for the output of another tool", () => {
        expect(isRuntime("_bindGenerator(it);")).toBe(true);
        expect(isRuntime("_bindGenerator2(it);")).toBe(true);
        expect(isRuntime("_coroutine(it);", "coroutine")).toBe(true);
        expect(isRuntime("_coroutine(it);", "bindGenerator")).toBe(false);
        expect(isRuntime("x_bindGenerator(it);")).toBe(false);
        expect(isRuntime("_bindGeneratorLike(it);")).toBe(false);
        expect(isRuntime("bindGenerator(it);")).toBe(false);
    });
});

describe("the functions with the directive of the runtime", () => {
    /** Gives `isRuntimeFunction` of the first function of `code`. */
    function firstFunction(code : string) : boolean {
        const ast = parseSync(code, { filename : "input.js", babelrc : false, configFile : false });
        if (ast === null) throw new Error("Babel did not parse the code");
        let result : boolean | undefined;
        traverse(ast, {
            Function(path : NodePath<types.Function>) {
                result ??= isRuntimeFunction(path.node);
            },
        });
        return result as boolean;
    }

    it("have the directive in their body", () => {
        expect(firstFunction(`async function f() { "${RUNTIME_DIRECTIVE}"; await null; }`)).toBe(true);
        expect(firstFunction(`const f = async () => { "use strict"; "${RUNTIME_DIRECTIVE}"; };`)).toBe(true);
        expect(firstFunction(`async function f() { "use strict"; await null; }`)).toBe(false);
        expect(firstFunction(`const f = async () => "${RUNTIME_DIRECTIVE}";`)).toBe(false);
        expect(isRuntimeFunction(types.stringLiteral(RUNTIME_DIRECTIVE))).toBe(false);
    });
});
