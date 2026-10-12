/**
 * The runtime of the code that the Babel preset transforms. The transformed
 * code imports `coroutine`, `bindGenerator`, `asyncGenerator` and
 * `OverloadYield` from this module. When the
 * module loads, it installs the patches of the runtime.
 *
 * @packageDocumentation
 */
import "./install.js";

export { OverloadYield } from "./core/async-generator.js";
export { asyncGenerator, bindGenerator, coroutine } from "./core/coroutine.js";
