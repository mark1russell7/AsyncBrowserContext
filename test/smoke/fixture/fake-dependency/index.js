// A dependency in node_modules with native async functions. The Vite plugin
// must transform it, so that the callback gets the context of the caller.
export async function libraryCall(callback) {
    await null;
    await null;
    return callback();
}
