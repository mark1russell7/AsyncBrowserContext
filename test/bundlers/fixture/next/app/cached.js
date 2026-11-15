// A module of the server. The preset does not change the "use cache" function, which Next.js
// accepts only as a native async function. It changes the other async function of the module.
async function plainValue() {
    await null;
    return "A";
}

export async function cachedValue() {
    "use cache";
    return await plainValue();
}
