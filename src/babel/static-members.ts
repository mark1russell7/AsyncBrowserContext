import { types, type NodePath, type PluginObject, type PluginPass } from "@babel/core";

/**
 * `@babel/plugin-transform-async-to-generator` keeps `this` and `super` of an async arrow
 * function in the nearest function or non-static class property. It does not stop at a static
 * class property or a static block. Thus, in
 *
 * ```js
 * class A { static load = async () => { await null; return this; }; }
 * ```
 *
 * the transform gives `var _this = this` at the top of the module, and `A.load()` gives
 * `undefined`. With `super`, the output is a SyntaxError. The plain async transform of Babel
 * changes such code only when it also changes the class fields. This preset changes async
 * functions in modern code, so it must change the class first.
 *
 * This plugin moves such an initializer or static block into a static private method, which has
 * the same `this` and `super`:
 *
 * ```js
 * class A { static load = this.#asyncContext1(); static #asyncContext1() { return { "load": async () => {...} }["load"]; } }
 * ```
 *
 * The object property keeps the name of the function (`A.load.name` is "load").
 */

/** This function gives `true` if `element` is or contains an async arrow function whose `this` is the `this` of the class element. */
function hasAsyncArrowOfElement(element : NodePath) : boolean {
    if (element.isArrowFunctionExpression() && element.node.async) {
        return true;
    }
    let found = false;
    element.traverse({
        Function(path) {
            if (!path.isArrowFunctionExpression()) {
                // A function that is not an arrow function has its own this
                path.skip();
                return;
            }
            if (path.node.async) {
                found = true;
                path.stop();
            }
        },
        Class(path) {
            path.skip();
        },
    });
    return found;
}

/** This function gives the name of a static class element for NamedEvaluation, or `undefined` for a computed key. */
function staticName(node : types.ClassProperty | types.ClassPrivateProperty | types.ClassAccessorProperty) : string | undefined {
    const key = node.key;
    if (types.isPrivateName(key)) {
        return `#${key.id.name}`;
    }
    if ("computed" in node && node.computed === true) {
        return undefined;
    }
    if (types.isIdentifier(key)) {
        return key.name;
    }
    if (types.isStringLiteral(key)) {
        return key.value;
    }
    return types.isNumericLiteral(key) ? String(key.value) : undefined;
}

/** This function gives a private name that the class does not use. */
function uniquePrivateName(body : types.ClassBody) : types.PrivateName {
    const used = new Set<string>();
    for (const member of body.body) {
        if ("key" in member && types.isPrivateName(member.key)) {
            used.add(member.key.id.name);
        }
    }
    let index = 1;
    while (used.has(`asyncContext${index}`)) {
        index++;
    }
    return types.privateName(types.identifier(`asyncContext${index}`));
}

/** This function adds a static private method with `statements` to the class, and gives `this.#method()`. */
function addStaticMethod(body : NodePath<types.ClassBody>, statements : types.Statement[]) : types.CallExpression {
    const name = uniquePrivateName(body.node);
    body.pushContainer("body", types.classPrivateMethod("method", name, [], types.blockStatement(statements), true));
    return types.callExpression(types.memberExpression(types.thisExpression(), types.cloneNode(name)), []);
}

/** The Babel plugin that moves static class members with async arrow functions into static private methods. */
export function staticMembersPlugin() : PluginObject<PluginPass> {
    return {
        name : "async-browser-context/static-members",
        visitor : {
            Program(programPath) {
                programPath.traverse({
                    "ClassProperty|ClassPrivateProperty|ClassAccessorProperty"(path : NodePath<types.ClassProperty | types.ClassPrivateProperty | types.ClassAccessorProperty>) {
                        const node = path.node;
                        if (node.static !== true || node.value === null || node.value === undefined || !hasAsyncArrowOfElement(path.get("value") as NodePath)) {
                            return;
                        }
                        const value = node.value;
                        const name = staticName(node);
                        // An object property keeps the name of an anonymous function, as the static property did
                        const expression = name === undefined
                            ? value
                            : types.memberExpression(types.objectExpression([types.objectProperty(types.stringLiteral(name), value)]), types.stringLiteral(name), true);
                        node.value = addStaticMethod(path.parentPath as NodePath<types.ClassBody>, [types.returnStatement(expression)]);
                    },
                    StaticBlock(path) {
                        if (!hasAsyncArrowOfElement(path)) {
                            return;
                        }
                        const call = addStaticMethod(path.parentPath as NodePath<types.ClassBody>, path.node.body);
                        path.node.body = [types.expressionStatement(call)];
                    },
                });
            },
        },
    };
}
