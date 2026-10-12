import { types, type NodePath } from "@babel/core";

/**
 * The directive that marks a native async function of the runtime. If the
 * preset changes that function, the function uses `coroutine` to operate
 * `coroutine`, without end. A directive stays in the code after TypeScript,
 * esbuild (also in the dependency bundles of the Vite dev server), Rollup and
 * webpack, but a comment does not.
 */
export const RUNTIME_DIRECTIVE = "async-browser-context runtime";

/** This function gives `true` if `node` is a function with the directive of the runtime. */
export function isRuntimeFunction(node : types.Node) : boolean {
    return types.isFunction(node)
        && node.body.type === "BlockStatement"
        && node.body.directives.some((directive) => directive.value.value === RUNTIME_DIRECTIVE);
}

/** This function gives `true` if `node` is `require(runtime)`, also inside a helper such as `_interopRequireWildcard(require(runtime))`. */
function containsRequireOf(node : types.Node | null | undefined, runtime : string, depth = 0) : boolean {
    if (node === null || node === undefined || depth > 3) {
        return false;
    }
    if (types.isCallExpression(node)) {
        if (types.isIdentifier(node.callee, { name : "require" }) && types.isStringLiteral(node.arguments[0], { value : runtime })) {
            return true;
        }
        return node.arguments.some((argument) => containsRequireOf(argument as types.Node, runtime, depth + 1));
    }
    if (types.isMemberExpression(node)) {
        return containsRequireOf(node.object, runtime, depth + 1);
    }
    return false;
}

/** This function gives the initial value of the variable that `identifier` names, if a variable declaration gives it. */
function initOf(identifier : NodePath<types.Identifier>) : types.Node | null | undefined {
    const binding = identifier.scope.getBinding(identifier.node.name);
    return binding?.path.isVariableDeclarator() === true ? (binding.path.node as types.VariableDeclarator).init : undefined;
}

/**
 * This function gives `true` if `callee` is the function `name` of the runtime. It accepts the
 * forms of the output of the preset:
 *
 * - an import: `_coroutine` from `import { coroutine as _coroutine } from runtime`;
 * - CommonJS: `_runtime.coroutine` or `(0, _runtime.coroutine)` with `_runtime = require(runtime)`;
 * - CommonJS of a script: `_coroutine` with `var _coroutine = require(runtime).coroutine`;
 * - the local name that Babel gives, `_coroutine` and `_coroutine2`, for the output of another tool.
 */
export function isRuntimeCallee(callee : NodePath, runtime : string, name : string) : boolean {
    let target : NodePath = callee;
    if (target.isSequenceExpression()) {
        const expressions = target.get("expressions");
        target = expressions[expressions.length - 1] as NodePath;
    }
    if (target.isIdentifier()) {
        if (target.referencesImport(runtime, name)) {
            return true;
        }
        const init = initOf(target);
        if (types.isMemberExpression(init) && types.isIdentifier(init.property, { name }) && containsRequireOf(init.object, runtime)) {
            return true;
        }
        return new RegExp(`^_${name}\\d*$`).test(target.node.name);
    }
    if (target.isMemberExpression() && !target.node.computed && types.isIdentifier(target.node.property, { name })) {
        const object = target.get("object");
        return object.isIdentifier() ? containsRequireOf(initOf(object), runtime) : containsRequireOf(object.node, runtime);
    }
    return false;
}
