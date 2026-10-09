/**
 * The parts of the playground that need Babel. The page loads this module
 * only when it must compile code, because Babel is large.
 */
export { CompileError, compilePlayground } from "./compile";
export { tracePlayground } from "./run";
