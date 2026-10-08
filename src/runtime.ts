/**
 * The runtime of the code that the Babel preset transforms. The transformed
 * code imports `coroutine` and `bindGenerator` from this module. When the
 * module loads, it installs the patches of the runtime.
 *
 * @packageDocumentation
 */
import "./install.js";

export { bindGenerator, coroutine } from "./core/coroutine.js";
