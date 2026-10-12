/**
 * This function gives the function of the runtime the `name` and the `length` of the source
 * function, as the native function has them. Without a name, the name is the empty string, as
 * for a native anonymous function. The preset gives the name, if the source has one. Where Babel
 * gives no named wrapper, for example in a class field, the function of the runtime is the
 * function that the program sees. The browser runtime and the Node.js runtime both use it.
 */
export function copyNameAndLength(fn : Function, name : string | undefined, length : number) : void {
    Object.defineProperty(fn, "name", { value : name ?? "", configurable : true });
    Object.defineProperty(fn, "length", { value : length, configurable : true });
}
