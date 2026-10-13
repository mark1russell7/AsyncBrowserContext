import { types, type NodePath, type PluginObject, type PluginPass } from "@babel/core";
import { isRuntimeCallee, isRuntimeFunction } from "./runtime-calls.js";

/** The options of the plugin. */
export interface NameCoroutinesOptions {
    /** The module that exports `coroutine` and `asyncGenerator`. */
    readonly runtime : string;
}

/** The assignment operators that give a name to an anonymous function, as in the specification (NamedEvaluation). */
const NAMING_OPERATORS = new Set(["=", "&&=", "||=", "??="]);

/**
 * This function gives the name of a property key, or `undefined` if the name is known only at run time.
 * The plugin of static members (static-members.ts) uses it too.
 */
export function keyName(key : types.Node, computed : boolean) : string | undefined {
    if (types.isStringLiteral(key)) {
        return key.value;
    }
    if (types.isNumericLiteral(key)) {
        return String(key.value);
    }
    if (types.isBigIntLiteral(key)) {
        // Babel 8 gives a bigint, and Babel 7 gives the text of the number, for example "0x10"
        return String(BigInt(key.value));
    }
    if (computed) {
        return undefined;
    }
    if (types.isIdentifier(key)) {
        return key.name;
    }
    // A decimal literal of Babel 7 gets no name
    return types.isPrivateName(key) ? `#${key.id.name}` : undefined;
}

/** This function gives `true` for a TypeScript or Flow wrapper of an expression, which does not change the name of a function. */
function isTypeWrapper(path : NodePath) : boolean {
    return path.isTSAsExpression() || path.isTSSatisfiesExpression() || path.isTSNonNullExpression()
        || path.isTSTypeAssertion() || path.isTypeCastExpression() || path.isParenthesizedExpression();
}

/** This function gives the name of an identifier, or `undefined` for a pattern or a member expression. */
function identifierName(node : types.Node) : string | undefined {
    return types.isIdentifier(node) ? node.name : undefined;
}

/**
 * This function gives the name that `parent` gives to an anonymous function in it, or `undefined`.
 * A function cannot be the target of a declarator or an assignment, so there it is the value. As a
 * computed key, it gets no name from `keyName`.
 */
function nameFromParent(parent : types.Node) : string | undefined {
    if (types.isVariableDeclarator(parent)) {
        return identifierName(parent.id);
    }
    if (types.isAssignmentExpression(parent)) {
        return NAMING_OPERATORS.has(parent.operator) ? identifierName(parent.left) : undefined;
    }
    if (types.isAssignmentPattern(parent)) {
        return identifierName(parent.left);
    }
    if (types.isObjectProperty(parent) || types.isClassProperty(parent) || types.isClassPrivateProperty(parent) || types.isClassAccessorProperty(parent)) {
        // A private property has no computed field
        return keyName(parent.key, (parent as { computed? : boolean }).computed === true);
    }
    return types.isExportDefaultDeclaration(parent) ? "default" : undefined;
}

/**
 * This function gives the `name` that JavaScript gives to the function, or
 * `undefined` if the name is not known before run time.
 */
export function functionName(path : NodePath<types.Function>) : string | undefined {
    const node = path.node;
    // Only a function declaration or a function expression has an id. The parser gives null to the other functions.
    const id = (node as types.FunctionExpression).id;
    if (id != null) {
        return id.name;
    }
    if (types.isMethod(node)) {
        return keyName(node.key, node.computed === true);
    }
    // `const h = (async () => {}) as Handler` names the function `h`. A function and a wrapper always have a parent path.
    let parentPath = path.parentPath as NodePath;
    while (isTypeWrapper(parentPath)) {
        parentPath = parentPath.parentPath as NodePath;
    }
    return nameFromParent(parentPath.node);
}

/**
 * Where the async transform has no name for the function, for example in a class field or as
 * an argument, it gives an anonymous wrapper:
 *
 * ```js
 * function () { var _ref = _coroutine(function* (value) {...}, "save"); return function (_x) { return _ref.apply(this, arguments); }; }()
 * ```
 *
 * This function gives that wrapper the name of the source, so `fn.name` stays the same. The
 * wrapper uses only `_ref`, `this` and `arguments`. The name of the function hides a `_ref` with
 * the same name, for example for a field named `_ref`. Thus `_ref` then gets a new name first. A name that a function expression cannot have, for example `eval`,
 * `arguments` or `"my-handler"`, goes to the `name` property with `Object.defineProperty`.
 */
function nameReturnedWrapper(call : NodePath<types.CallExpression>, name : string) : void {
    // A call is always in a statement, so it has a parent path and a grandparent path. In the other
    // forms of the async transform, the next statement is not a return of a function expression,
    // or there is no next statement, for example in a class field.
    const declarator = call.parentPath as NodePath;
    const declaration = declarator.parentPath as NodePath;
    const next = declaration.getSibling((declaration.key as number) + 1);
    if (!next.isReturnStatement() || !next.get("argument").isFunctionExpression()) {
        return;
    }
    // A named function expression gets a wrapper with the same name, so a second name changes nothing
    const returnedPath = next.get("argument") as NodePath<types.FunctionExpression>;
    const returned = returnedPath.node;
    // A class body and a module are strict code, where a function cannot have the name eval or arguments
    if (types.isValidIdentifier(name) && !STRICT_BIND_ONLY.has(name)) {
        // Only a declarator gives `var _ref = <call>` before a returned function expression
        const reference = (declarator.node as types.VariableDeclarator).id;
        if (types.isIdentifier(reference, { name })) {
            // `_ref` is a new name of Babel, so only its declaration and the wrapper use it
            const renamed = declaration.scope.generateUidIdentifier(name).name;
            reference.name = renamed;
            renameIdentifiers(returned, name, renamed);
        }
        returned.id = types.identifier(name);
        return;
    }
    if (next.scope.getBinding("Object") !== undefined) {
        // The code has its own Object, so the global function is not available
        return;
    }
    const descriptor = types.objectExpression([
        types.objectProperty(types.identifier("value"), types.stringLiteral(name)),
        types.objectProperty(types.identifier("configurable"), types.booleanLiteral(true)),
    ]);
    returnedPath.replaceWith(types.callExpression(
        types.memberExpression(types.identifier("Object"), types.identifier("defineProperty")),
        [returned, types.stringLiteral("name"), descriptor],
    ));
}

/** The names that strict code cannot bind, also as the name of a function expression. */
const STRICT_BIND_ONLY = new Set(["eval", "arguments"]);

/** This function gives each identifier `from` in `node` the name `to`. */
function renameIdentifiers(node : types.Node, from : string, to : string) : void {
    types.traverseFast(node, (child) => {
        if (types.isIdentifier(child) && child.name === from) {
            child.name = to;
        }
    });
}

/**
 * The Babel plugin that gives the name of each async function to `coroutine`:
 * `_coroutine(function* () {...}, "load")`, and of each async generator to
 * `asyncGenerator`. The generator function of the Babel transforms has no name,
 * and the callback hooks of the runtime show the name of the function.
 *
 * In `Program` enter, before the async transforms, the plugin records the
 * name of each async function. In `Program` exit, it adds the name to each
 * call of `coroutine` or `asyncGenerator`. For a plain function, the async
 * transform keeps the function node as the argument of the call. For a method,
 * the call is in the body of the method. A different call, for example a call
 * that another plugin adds to a method, gets no name.
 */
export function nameCoroutinesPlugin(_api : unknown, options : object) : PluginObject<PluginPass> {
    const { runtime } = options as NameCoroutinesOptions;
    // The names of the async functions of each file, from Program enter to Program exit
    const namesOfFile = new WeakMap<PluginPass, WeakMap<types.Node, string>>();
    return {
        name : "async-browser-context/name-coroutines",
        visitor : {
            Program : {
                enter(programPath, state) {
                    const names = new WeakMap<types.Node, string>();
                    namesOfFile.set(state, names);
                    programPath.traverse({
                        Function(path) {
                            if (isRuntimeFunction(path.node)) {
                                // The native async functions of the runtime stay native (skip-runtime.ts)
                                path.skip();
                                return;
                            }
                            if (!path.node.async) {
                                return;
                            }
                            const name = functionName(path);
                            // The empty name, for example of the key "", is no name
                            if (name) {
                                names.set(path.node, name);
                            }
                        },
                    });
                },
                exit(programPath, state) {
                    const names = namesOfFile.get(state) as WeakMap<types.Node, string>;
                    programPath.traverse({
                        CallExpression(path) {
                            const { arguments : args } = path.node;
                            const [body] = args;
                            if (args.length !== 1 || !types.isFunctionExpression(body, { generator : true })) {
                                return;
                            }
                            const callee = path.get("callee");
                            if (!isRuntimeCallee(callee, runtime, "coroutine") && !isRuntimeCallee(callee, runtime, "asyncGenerator")) {
                                return;
                            }
                            const parent = path.getFunctionParent()?.node;
                            const name = names.get(body) ?? (types.isMethod(parent) ? names.get(parent) : undefined);
                            if (name !== undefined) {
                                args.push(types.stringLiteral(name));
                                nameReturnedWrapper(path, name);
                            }
                        },
                    });
                },
            },
        },
    };
}
