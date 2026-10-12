import { store } from "../core/store.js";
import { claim, replaceFunction } from "./patch.js";

type ToString = (this : unknown) => string;

/**
 * This function patches `Function.prototype.toString`. For a patched function, the patch gives
 * the source text of the original function. Some libraries examine this text
 * to find native functions, and a changed text can stop them.
 *
 * The patch starts the `toString` that it replaces, as the other patches do. Thus a patch of
 * `toString` that another tool installed before, for example to show the source of its own
 * wrappers, stays in effect.
 */
export function installToStringPatch() : void {
    if (!claim("Function.prototype.toString")) {
        return;
    }
    // Method syntax: a native method has no prototype property and is not a constructor
    replaceFunction<ToString>(Function.prototype, "toString", (replaced) => ({
        toString(this : unknown) : string {
            // WeakMap.get gives undefined for a primitive. The native function then throws its TypeError.
            const original = store.originals.get(this as object);
            return Reflect.apply(replaced, original ?? this, []);
        },
    }).toString);
}
