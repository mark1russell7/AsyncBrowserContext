import { store } from "../core/store.js";
import { claim, replaceFunction } from "./patch.js";

type ToString = (this : unknown) => string;

/**
 * Patches `Function.prototype.toString`. For a patched function, it gives
 * the source text of the original function. Some libraries examine this text
 * to find native functions, and a changed text can stop them.
 */
export function installToStringPatch() : void {
    if (!claim("Function.prototype.toString")) {
        return;
    }
    const nativeToString = store.intrinsics.functionToString;
    replaceFunction<ToString>(Function.prototype, "toString", () => function toString(this : unknown) : string {
        const original = typeof this === "function" || (typeof this === "object" && this !== null) ? store.originals.get(this) : undefined;
        return nativeToString.call(original ?? this);
    });
}
