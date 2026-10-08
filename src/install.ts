import { installCallbackPatches } from "./patches/callbacks.js";
import { installEventPatches } from "./patches/events.js";
import { installObserverPatches } from "./patches/observers.js";
import { installPromisePatch } from "./patches/promise.js";
import { installStreamPatches } from "./patches/streams.js";
import { installTimerPatches } from "./patches/timers.js";
import { installToStringPatch } from "./patches/to-string.js";

/**
 * Installs all patches. The function installs each patch one time for each
 * global object, also when the page loads two copies of the library. The
 * browser entry and the runtime entry call it when they load.
 */
export function install() : void {
    installToStringPatch();
    installPromisePatch();
    installTimerPatches();
    installEventPatches();
    installObserverPatches();
    installCallbackPatches();
    installStreamPatches();
}

install();
