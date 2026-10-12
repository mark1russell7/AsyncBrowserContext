/**
 * The runtime of the code that the Babel preset transforms. The transformed
 * code imports `coroutine`, `bindGenerator`, `asyncGenerator`, `OverloadYield`,
 * `awaitAsyncGenerator` and `asyncGeneratorDelegate` from this module. When the
 * module loads, it installs the patches of the runtime.
 *
 * @packageDocumentation
 */
import "./install.js";

export { asyncGeneratorDelegate, awaitAsyncGenerator, OverloadYield } from "./core/async-generator.js";
export { asyncGenerator, bindGenerator, coroutine } from "./core/coroutine.js";
