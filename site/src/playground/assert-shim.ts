/** A browser version of `node:assert` for the Babel packages of the playground. They use only `assert(value, message)`. */
function assert(value : unknown, message? : string) : asserts value {
    if (!value) throw new Error(message ?? "Assertion failed");
}

assert.ok = assert;

export default assert;
