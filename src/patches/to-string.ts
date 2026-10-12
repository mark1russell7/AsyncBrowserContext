import { store } from "../core/store.js";
import { claim, replaceFunction } from "./patch.js";

type ToString = (this : unknown) => string;

/**
 * This function patches `Function.prototype.toString`. For a patched function, the patch gives
 * the source text of the original function. Some libraries examine this text
 * to find native functions, and a changed text can stop them.
 */
export function installToStringPatch() : void {
    if (!claim("Function.prototype.toString")) {
        return;
    }
    const nativeToString = store.intrinsics.functionToString;
    // Method syntax: a native method has no prototype property and is not a constructor
    replaceFunction<ToString>(Function.prototype, "toString", () => ({
        toString(this : unknown) : string {
            // WeakMap.get gives undefined for a primitive. The native function then throws its TypeError.
            const original = store.originals.get(this as object);
            return nativeToString.call(original ?? this);
        },
    }).toString);
}
